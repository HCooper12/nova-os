import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { NOVA_LENS } from './lens.js';
import { modelFor, assertLaneOn } from './modelPrefs.js';
import { recordRun, fromEnvelope } from './modelSpend.js';
import { libraryCatalogue } from './library.js';
import { openConsult, consultCapability, consultedBrief, stripDirectives, ANSWER_NOW, GUARD_NOTE } from './consult.js';

// THE LIBRARIAN, ASKED. His words, 29 Sep 2026: Nova should be able to "ask
// the librarian to search through its library to retrieve a particular
// concept or idea from any book or piece of content that has been stored".
// Until then the Librarian only ever researched a NEW book (librarian.js);
// nothing could ask it what the library already holds.
//
// A read-only question lane: the catalogue is built by code from the vault
// (every Source page, the concepts and entities they feed, the Repertoire);
// the model reads the pages it needs with Read/Grep/Glob and answers citing
// the note paths it read. Code then checks every cited path against the
// vault, so a citation that points at nothing is named, never passed on as
// his library's word. It writes nothing: Edit and Write are blocked, and so
// is the web (what the library holds is the question; the Researcher is who
// reads the web, and the Librarian can consult it).

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

// --allowedTools is not enforced under bypassPermissions (see claudeCode.js):
// the DISALLOWED list is the real boundary. No writes, no shell, no web.
const LIBRARIAN_ASK_DISALLOWED = [
  'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Agent', 'Skill', 'ToolSearch',
  'ScheduleWakeup', 'Artifact', 'SendMessage', 'Workflow', 'TaskCreate', 'TaskUpdate', 'TaskStop',
  'EnterWorktree', 'ExitWorktree', 'Monitor', 'PushNotification', 'RemoteTrigger',
].join(',');

// The catalogue as the model reads it. Sized to the prompt, not capped as
// work: every source is listed (title, kind, path, raw), excerpts ride only
// while they fit, and the model can Grep for anything past the list.
export function formatCatalogue(cat, { maxChars = 24_000 } = {}) {
  const lines = [];
  lines.push(`SOURCES (${cat.sources.length}; each is a woven page in his vault; "raw" is the full transcript or dossier behind it):`);
  let used = 0;
  for (const s of cat.sources) {
    const head = `- ${s.path} — "${s.title}" (${s.kind}${s.author ? `, ${s.author}` : ''}${s.provenance ? `, ${s.provenance}` : ''})${s.raw ? ` raw: ${s.raw}` : ''}`;
    const withExcerpt = s.excerpt && used < maxChars ? `${head}\n    ${s.excerpt}` : head;
    used += withExcerpt.length;
    lines.push(withExcerpt);
  }
  if (cat.concepts.length) lines.push(`\nCONCEPT PAGES (${cat.concepts.length}, under Wiki/Concepts/): ${cat.concepts.map((c) => c.title).join('; ')}`);
  if (cat.entities.length) lines.push(`\nENTITY PAGES (${cat.entities.length}, under Wiki/Entities/): ${cat.entities.map((c) => c.title).join('; ')}`);
  lines.push(cat.repertoire ? `\nTHE REPERTOIRE (the techniques he is learning, one a day): ${cat.repertoire}` : '\nThe Repertoire has no page yet.');
  return lines.join('\n');
}

export function buildLibrarianAskPrompt({ question, catalogue, consulted = null }) {
  const asker = consulted?.by ? null : 'Hayden';
  return `${NOVA_LENS}

You are Nova's LIBRARIAN. You keep Hayden's library: every book, podcast, video and article he has stored in his vault, the concepts and people they feed, the raw transcripts and dossiers behind them, and the Repertoire of techniques he is learning. You answer questions FROM THAT LIBRARY. Your working directory is his vault; read what you need with Read, Grep and Glob. You cannot write anything and you cannot reach the web.

How you answer:
- RETRIEVE, THEN ANSWER. Find the pages that bear on the question (the catalogue below, then Grep his Wiki/ and Raw/ for the words that matter), open them, and answer from what they actually say. The raw transcript is the deepest record; the woven page is the summary.
- CITE EVERY CLAIM with the exact path of the note you read it in, in parentheses: (Wiki/Sources/Atomic Habits.md) or (Raw/some-transcript.md). End with a line "Read:" listing every path you opened. A path you did not read is never cited.
- SAY WHAT KIND OF KNOWING IT IS. A page with provenance "researched" is Nova's account of a book from public sources, not the book: say so when it matters. A claim a source makes is the source's claim, attributed; say where two of his sources disagree.
- HONEST WHEN IT IS NOT THERE. If his library does not hold an answer, say that first and plainly ("Nothing in your library covers X"), then name the nearest thing it does hold. Never fill the gap from general knowledge dressed as his library; if you add general knowledge, label it as yours, not his library's.
${consultCapability('librarian', { chain: consulted?.chain || [] })}

HIS LIBRARY, catalogued by code just now:
${catalogue}

${consulted ? `${consultedBrief(consulted.by, consulted.question)}\n\nThe question: ${question}` : `${asker} asks: ${question}`}`;
}

// Every path the answer cites, checked against the vault. Pure but for the
// existence check, which is injectable for tests.
const CITED_PATH = /\b((?:Wiki|Raw)\/[^\n()[\]`"]+?\.md)\b/g;
export function checkLibraryCitations(vaultPath, text, { exists = (p) => existsSync(path.join(vaultPath, p)) } = {}) {
  const seen = new Set();
  const citations = [];
  for (const m of String(text || '').matchAll(CITED_PATH)) {
    const p = m[1].trim();
    if (seen.has(p) || p.includes('..')) continue;
    seen.add(p);
    citations.push({ path: p, exists: !!exists(p) });
  }
  return citations;
}

// The answer as the asking agent receives it: code, not the model, says which
// citations are real.
export function settleLibrarianAnswer(vaultPath, raw, opts = {}) {
  let text = stripDirectives(raw);
  const citations = checkLibraryCitations(vaultPath, text, opts);
  const missing = citations.filter((c) => !c.exists).map((c) => c.path);
  if (!citations.length) text += '\n\n(Code check: this answer cites no note in his library.)';
  else if (missing.length) text += `\n\n(Code check: ${missing.length === 1 ? 'this path is' : 'these paths are'} not in his vault, so treat what rests on ${missing.length === 1 ? 'it' : 'them'} as unsupported: ${missing.join(', ')}.)`;
  return { text, citations };
}

// One claude call: a fresh session, or a resume of it (for the consult
// round-trip). No working cap of any kind, per his standing rule.
function askOnce(vaultPath, { prompt, sessionId, resume }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(CLAUDE_BIN, [
        '-p', prompt,
        '--permission-mode', 'bypassPermissions',
        '--allowedTools', 'Read Grep Glob',
        '--disallowedTools', LIBRARIAN_ASK_DISALLOWED,
        '--strict-mcp-config',
        '--output-format', 'json',
        '--model', modelFor('librarian-ask'),
        resume ? '--resume' : '--session-id', sessionId,
      ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { reject(e); return; }
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* fall through */ }
      if (parsed) recordRun('librarian-ask', fromEnvelope(parsed));
      if (!parsed || parsed.is_error || code !== 0) {
        reject(new Error(parsed?.result || err.trim().slice(0, 300) || `the Librarian exited ${code}`));
        return;
      }
      resolve(String(parsed.result || '').trim());
    });
  });
}

// Ask the Librarian. `from`/`chain`/`ledger` arrive when another agent is
// asking (lib/consult.js); Hayden asking directly passes none of them.
// Resolves { text, citations, consult }.
export async function runLibrarianAsk(vaultPath, question, { from = null, question: parentQuestion = '', chain = [], ledger = null, deps } = {}) {
  assertLaneOn('librarian-ask');
  const q = String(question || '').trim();
  if (!q) throw new Error('a question for the Librarian is required');
  const catalogue = formatCatalogue(await libraryCatalogue(vaultPath));
  const consulted = from ? { by: from, question: parentQuestion, chain } : null;
  const job = { consult: [] };
  const ctl = openConsult({ from: 'librarian', question: parentQuestion || q, vaultPath, job, chain, ledger, deps, answeringTo: from });
  const sessionId = randomUUID();
  let reply = await askOnce(vaultPath, { prompt: buildLibrarianAskPrompt({ question: q, catalogue, consulted }), sessionId });
  for (;;) {
    const consult = ctl.parse(reply);
    if (!consult) break;
    let next;
    if (ctl.exhausted) {
      if (ctl.nudged) { reply = `${consult.cleanText}\n\n${GUARD_NOTE}`.trim(); break; }
      ctl.nudged = true;
      next = ANSWER_NOW;
    } else {
      next = (await ctl.run(consult)).replyText;
    }
    reply = await askOnce(vaultPath, { prompt: next, sessionId, resume: true });
  }
  const settled = settleLibrarianAnswer(vaultPath, reply);
  return { text: settled.text, citations: settled.citations, consult: ctl.roster.length ? ctl.roster : null };
}
