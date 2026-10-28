// ASK NOVA ON THE MODEL ON THIS MAC (19 Oct 2026). His goal: "Use Nova in
// my day-to-day without worrying about needing my Claude connection to be
// active, online, and without worrying about running out of tokens."
//
// The small model (Qwen3.5 4B on Ollama since 27 Oct, lib/localModel.js) answers
// from his vault the way Claude's Ask Nova does, with three differences that
// follow from it being small:
//   - THE PROMPT IS A MAP, NOT A DUMP. Claude's prompt is tens of thousands
//     of characters; this one is held under 9,000 before the question (the
//     Wren lesson, 156K→28K): the lens, a short rule set, the five most-used
//     verbs, today's numbers, the live line, the last turns.
//   - THE VAULT IS READ BY CODE. The model names a lookup (vault_search,
//     vault_read, vault_list); code runs it read-only, inside the vault, every
//     result capped, and hands it back. At most MAX_ROUNDS lookups a turn.
//   - THE REPLY SETTLES ON CLAUDE'S RAILS. settleAskReply (lib/claudeCode.js)
//     parses PROPOSE / ACT / SHOW / CARD exactly as it does for Claude, so a
//     local answer can only do what tested code lets any answer do.
//
// Honest by construction: the result says `provider: 'local'`, a stand-in
// for Claude says why (`fallback`, `reason`, which the client renders as a
// meta line), and a failure is an error with its reason, never an empty
// answer. The model never writes: it only produces text.
import { readFile, readdir, stat, writeFile, mkdir, rename, realpath, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // never URL.pathname: the repo path has a space
import { randomUUID } from 'node:crypto';
import { NOVA_LENS } from './lens.js';
import { talkPrefsBlock } from './talk.js';
import { chatLocal, defaultModel } from './localModel.js';
import { recordRun } from './modelSpend.js';
import { assertLaneOn, refreshLocalStatus } from './modelPrefs.js';
import { registerAskJob, settleAskReply } from './claudeCode.js';
import { whereLine, suppressGlass } from './register.js';
import { describeForModel } from './verbs.js';
import { parseVisualStream } from '../../src/visualBeats.js';
import { gaveUp } from './askRoute.js';

export const PROMPT_BUDGET = 9000;      // chars of system prompt before his question
export const MAX_ROUNDS = 4;            // vault lookups per turn
// The context window is lib/localModel.js's one size for every call (16,384
// since 27 Oct): a turn that asked for its own (8,192 here until then) would
// make Ollama reload the runner whenever it differed from the loaded one.
export const TURN_TIMEOUT_MS = () => Number(process.env.NOVA_LOCAL_ASK_TIMEOUT_MS || 120_000);
const SEARCH_HITS = 12;
const READ_LINES = 120;
const LIST_NAMES = 60;
const RESULT_CHARS = 6000;              // any one tool result, after its own cap
const LINE_CHARS = 240;
const SEARCH_FILE_CAP = 6000;           // files a search walks before it stops
const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules', '.DS_Store']);

// The five verbs he uses most, by everyday use. Their exact syntax is taken
// from the registry's own catalogue (lib/verbs.js describeForModel), so the
// forms the small model sees can never drift from what code parses.
export const LOCAL_VERBS = ['capture.add', 'todo.done', 'todo.add', 'workout.log', 'weight.log'];

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const STORE_PATH = () => path.join(dataRoot(), 'local-ask-sessions.json');

/* ------------------------------ the prompt -------------------------------- */

let verbLinesCache = null;
function verbLines() {
  if (verbLinesCache) return verbLinesCache;
  let lines = [];
  try {
    lines = describeForModel().split('\n')
      .filter((l) => LOCAL_VERBS.some((v) => l.includes(`"verb":"${v}"`)))
      .map((l) => l.trim());
  } catch { lines = []; }
  verbLinesCache = lines;
  return lines;
}

const TOOL_TEXT_FORM = `To use a tool, reply with ONLY this, then wait for the result:
<tool_call>{"name":"vault_search","arguments":{"query":"bench press"}}</tool_call>
Tools: vault_search {"query"} finds matching lines in his notes; vault_read {"path","from","lines"} reads one page (path as search showed it); vault_list {"folder"} lists a folder.`;

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+\n/g, '\n').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** The system prompt for one local turn. Pure: every input is handed in. The
 *  history is dropped oldest-first until the whole prompt fits the budget. */
export function buildLocalAskPrompt({ today = '', liveLine = '', place = 'unknown', spoken = false, direct = false, history = [], toolsInText = false, him = '', talkPrefs = '' } = {}) {
  const wl = whereLine(place, { oneShot: direct });
  const lengthRule = direct
    ? '- This is a hands-free one-shot (Siri): answer exactly what he asked in one or two spoken sentences. No greeting, no follow-up question.'
    : spoken
      ? '- He is listening, not reading: two short spoken sentences, no symbols, no lists.'
      : '- Three sentences at most. Plain text, no markdown, no lists. Lead with the answer.';
  const head = `${NOVA_LENS}

You are Nova, Hayden's personal AI operating system. Nova is "he". Right now you run on the small model on his Mac, with read-only access to his Obsidian vault through tools that code runs for you. You never write anything yourself.

RULES
- Never invent a name, number, date, URL or page. Every specific comes from TODAY below, from what he said, or from a page a tool showed you. If you cannot find it, say so in one line ("I can't find that in your vault, sir.").
- Answer the question he asked, first. If the exact thing is not there, say that first.
- Never ask permission to look. If a page could hold the answer, search or read it, then answer.
- If he is still explaining (no question yet, or he stops mid-thought), reply with one short line that shows you followed. Do not advise yet.
- At most one question, and only about something only he knows.
${lengthRule}
- Voice: calm, precise, dry. Say "sir" now and then, never in every sentence. No filler.
- When a page gave you the answer, name it ("your Bench Press note says...").

DOING THINGS
When he asks you to do, keep or change something, end the reply with ONE line in exactly one of these forms (valid JSON, one line):
${verbLines().join('\n')}
"Add X to my shopping list" is capture.add with his words.
PROPOSE {"kind":"capture","text":"<the thing to file, in plain words>"} : something to add that no ACT above fits; it waits for his yes
PROPOSE {"kind":"calendar","command":"<the change in plain words, e.g. move gym to 6pm tomorrow>"}
One ACT or PROPOSE line at most, last, and only when he asked. Say what you are doing in a few words. Never say it is done: code confirms it.

VAULT TOOLS
Use vault_search, vault_read and vault_list when TODAY below does not already answer. At most ${MAX_ROUNDS} lookups, then answer.${toolsInText ? `\n${TOOL_TEXT_FORM}` : ''}`;

  const tail = [];
  tail.push(`TODAY (computed by code just now; trust it over older pages):\n${clip(today, 1600) || '(not available right now)'}`);
  if (liveLine) tail.push(`LIVE NOW: ${clip(liveLine, 1200)}`);
  // who he is and how he wants to be spoken to (27 Oct 2026), clipped to
  // the small model's budget
  if (him) tail.push(clip(him, 1800));
  if (talkPrefs) tail.push(clip(talkPrefs, 700));
  if (wl) tail.push(wl);
  // the fixed head first and the changing tail last: Ollama reuses the
  // cached prefix of a prompt it has seen, measured 27 Oct at 366 tok/s cold
  // against 1,063 tok/s cached, so anything that changes per turn goes after
  // everything that does not
  const fixed = `${head}\n\n${tail.join('\n\n')}`;

  // the last turns, newest kept: each side clipped, oldest dropped to fit
  const turns = (history || []).slice(-8).map((t) => `He: ${clip(t.q, 280)}\nNova: ${clip(t.a, 520)}`);
  let convo = '';
  while (turns.length) {
    convo = `EARLIER IN THIS CONVERSATION:\n${turns.join('\n')}`;
    if (fixed.length + 2 + convo.length <= PROMPT_BUDGET) break;
    turns.shift();
    convo = '';
  }
  const out = convo ? `${fixed}\n\n${convo}` : fixed;
  return out.length > PROMPT_BUDGET ? out.slice(0, PROMPT_BUDGET) : out;
}

/* ------------------------------ the tools --------------------------------- */

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'vault_search',
      description: 'Find lines in his vault notes that contain the words. Returns up to 12 hits as path:line: text.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'a word or short phrase' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vault_read',
      description: 'Read up to 120 lines of one vault page.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'the page path, as vault_search or vault_list showed it' },
          from: { type: 'integer', description: 'first line to read, from 1' },
          lines: { type: 'integer', description: 'how many lines, at most 120' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vault_list',
      description: 'List the pages and folders in one vault folder ("" for the top).',
      parameters: { type: 'object', properties: { folder: { type: 'string' } }, required: [] },
    },
  },
];

const capResult = (s) => (s.length > RESULT_CHARS ? `${s.slice(0, RESULT_CHARS)}\n(cut at ${RESULT_CHARS} characters)` : s);
const capLine = (s) => { const t = String(s).replace(/\t/g, ' ').trim(); return t.length > LINE_CHARS ? `${t.slice(0, LINE_CHARS)}…` : t; };
const toPosix = (p) => p.split(path.sep).join('/');

/** A path inside the vault, or null. Refuses anything that leaves it (`..`,
 *  an absolute path elsewhere, a symlink out) and Obsidian's own folder. */
async function insideVault(vault, rel) {
  const asked = String(rel ?? '').trim();
  const root = await realpath(vault);
  let target;
  if (path.isAbsolute(asked)) {
    // an absolute path is allowed only when it is already inside the vault
    const fromVault = path.relative(path.resolve(vault), asked);
    target = fromVault.startsWith('..') || path.isAbsolute(fromVault) ? path.resolve(asked) : path.resolve(root, fromVault);
  } else {
    target = path.resolve(root, asked || '.');
  }
  const relOf = (p) => path.relative(root, p);
  const lexical = relOf(target);
  if (lexical.startsWith('..') || path.isAbsolute(lexical)) return null;
  if (lexical.split(path.sep).some((seg) => SKIP_DIRS.has(seg))) return null;
  if (existsSync(target)) {
    const real = await realpath(target);
    const r = relOf(real);
    if (r.startsWith('..') || path.isAbsolute(r)) return null;
    return real;
  }
  return target;
}

async function* walkMd(dir, budget) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (budget.files <= 0) return;
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkMd(full, budget);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) { budget.files -= 1; yield full; }
  }
}

/** vault_search: case-insensitive, over *.md. A page whose NAME matches is
 *  listed first; then lines holding the phrase; then, if that found fewer
 *  than the cap, lines holding every word of it. */
export async function vaultSearch(vault, { query } = {}) {
  const q = String(query || '').trim();
  if (!q) return 'vault_search needs a query.';
  const needle = q.toLowerCase();
  const words = needle.split(/\s+/).filter((w) => w.length >= 3);
  const root = await realpath(vault);
  const nameHits = [];
  const phraseHits = [];
  const wordHits = [];
  for await (const file of walkMd(root, { files: SEARCH_FILE_CAP })) {
    const rel = toPosix(path.relative(root, file));
    if (path.basename(rel, '.md').toLowerCase().includes(needle)) nameHits.push(`${rel}:1: (page name matches)`);
    if (phraseHits.length >= SEARCH_HITS) { if (nameHits.length >= SEARCH_HITS) break; continue; }
    let text = '';
    try { text = await readFile(file, 'utf8'); } catch { continue; }
    const lower = text.toLowerCase();
    if (!lower.includes(needle) && !(words.length > 1 && words.every((w) => lower.includes(w)))) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].toLowerCase();
      if (l.includes(needle)) { if (phraseHits.length < SEARCH_HITS) phraseHits.push(`${rel}:${i + 1}: ${capLine(lines[i])}`); }
      else if (words.length > 1 && words.every((w) => l.includes(w)) && wordHits.length < SEARCH_HITS) wordHits.push(`${rel}:${i + 1}: ${capLine(lines[i])}`);
    }
  }
  const hits = [...nameHits, ...phraseHits, ...wordHits].slice(0, SEARCH_HITS);
  if (!hits.length) return `No lines in the vault match "${q}".`;
  return capResult(hits.join('\n'));
}

/** vault_read: up to READ_LINES lines of one page under the vault. A bare
 *  name ("Bench Press") finds the page of that name. */
export async function vaultRead(vault, { path: rel, from = 1, lines = READ_LINES } = {}) {
  if (!String(rel || '').trim()) return 'vault_read needs a path.';
  let full = await insideVault(vault, rel);
  if (!full) return `Refused: "${rel}" is outside his vault.`;
  if (!existsSync(full) && existsSync(`${full}.md`)) full = `${full}.md`;
  if (!existsSync(full)) {
    // a page named, not pathed: the first page with that name
    const want = path.basename(String(rel), '.md').toLowerCase();
    const root = await realpath(vault);
    for await (const file of walkMd(root, { files: SEARCH_FILE_CAP })) {
      if (path.basename(file, '.md').toLowerCase() === want) { full = file; break; }
    }
  }
  let st = null;
  try { st = await stat(full); } catch { /* absent */ }
  if (!st) return `There is no page "${rel}" in the vault.`;
  if (st.isDirectory()) return `"${rel}" is a folder; use vault_list.`;
  const root = await realpath(vault);
  const text = await readFile(full, 'utf8');
  const all = text.split('\n');
  const start = Math.max(1, Math.floor(Number(from) || 1));
  const n = Math.min(READ_LINES, Math.max(1, Math.floor(Number(lines) || READ_LINES)));
  const slice = all.slice(start - 1, start - 1 + n);
  const relShown = toPosix(path.relative(root, full));
  const more = start - 1 + n < all.length ? `\n(lines ${start}-${start - 1 + slice.length} of ${all.length}; read on with "from": ${start + slice.length})` : '';
  return capResult(`${relShown}\n${slice.map((l) => (l.length > 400 ? `${l.slice(0, 400)}…` : l)).join('\n')}${more}`);
}

/** vault_list: up to LIST_NAMES names in one folder, folders marked "/". */
export async function vaultList(vault, { folder = '' } = {}) {
  const full = await insideVault(vault, folder || '.');
  if (!full) return `Refused: "${folder}" is outside his vault.`;
  let entries = [];
  try { entries = await readdir(full, { withFileTypes: true }); } catch { return `There is no folder "${folder}" in the vault.`; }
  const names = entries
    .filter((e) => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort((a, b) => a.localeCompare(b));
  if (!names.length) return `"${folder || '/'}" is empty.`;
  const shown = names.slice(0, LIST_NAMES);
  return capResult(shown.join('\n') + (names.length > shown.length ? `\n(${names.length - shown.length} more not shown)` : ''));
}

export async function runTool(vault, call) {
  const args = call?.args && typeof call.args === 'object' ? call.args : {};
  try {
    if (call?.name === 'vault_search') return await vaultSearch(vault, args);
    if (call?.name === 'vault_read') return await vaultRead(vault, args);
    if (call?.name === 'vault_list') return await vaultList(vault, args);
  } catch (e) {
    return `That lookup failed: ${e.message}`;
  }
  return `There is no tool "${call?.name}". Use vault_search, vault_read or vault_list.`;
}

/* --------------------------- reading the model ---------------------------- */

/** Take the model's thinking out of what it says: a closed <think> block, a
 *  closing tag with no opener (everything before it), an unclosed opener. */
export function stripThink(text) {
  let t = String(text || '');
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const close = t.toLowerCase().lastIndexOf('</think>');
  if (close !== -1) t = t.slice(close + '</think>'.length);
  t = t.replace(/<think>[\s\S]*$/i, '');
  return t.trim();
}

// Arguments arrive as a JSON string (the OpenAI shape lib/localModel.js
// returns) or, from a server that hands them over parsed, an object already.
function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { const v = JSON.parse(String(raw || '{}')); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** The tool calls in one assistant message, from EITHER the server's parsed
 *  `tool_calls` OR Qwen's own `<tool_call>{json}</tool_call>` text, plus the
 *  message's text with thinking and tool blocks taken out. */
export function readToolCalls(message) {
  const calls = [];
  for (const tc of Array.isArray(message?.tool_calls) ? message.tool_calls : []) {
    const fn = tc?.function || {};
    if (!fn.name) continue;
    calls.push({ id: tc.id || `call_${randomUUID().slice(0, 8)}`, name: String(fn.name), args: parseArgs(fn.arguments) });
  }
  let text = stripThink(typeof message?.content === 'string' ? message.content : '');
  text = text.replace(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi, (_, body) => {
    const v = parseArgs(body);
    if (v.name) calls.push({ id: `call_${randomUUID().slice(0, 8)}`, name: String(v.name), args: parseArgs(v.arguments ?? v.parameters) });
    return '';
  });
  return { calls, text: text.trim() };
}

// What the glass says while code runs a lookup. Written so the client's
// streaming speech never speaks it (src/App.jsx speakNewSentences speaks
// a sentence only on . ! ? and the first-clause cut only on , ; :), and the
// partial holds only the LATEST line: the answer replaces it whole.
const quiet = (s) => String(s || '').replace(/[.!?,;:"“”]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
export function progressLine(call) {
  const a = call?.args || {};
  if (call?.name === 'vault_search') return `Looking in your vault for “${quiet(a.query)}”…`;
  if (call?.name === 'vault_read') return `Reading ${quiet(path.basename(String(a.path || ''), '.md')) || 'a page'} in your vault…`;
  if (call?.name === 'vault_list') return `Looking through ${quiet(a.folder) || 'your vault'}…`;
  return 'Looking in your vault…';
}

const FINAL_ASK = 'That is all the lookups for this turn. Answer him now from what you found, and say plainly what you could not find. Do not call a tool.';

/* ---------------------------- session memory ------------------------------ */
// server/data/local-ask-sessions.json — operational and derived: per session
// id, the last 8 turns of Ask Nova (whichever model answered), so the small
// model knows the conversation it is joining, and a session the local model
// opened can be handed to Claude with its history. 40 sessions, 24 h.

const MAX_TURNS = 8;
const MAX_SESSIONS = 40;
const SESSION_TTL_MS = 24 * 60 * 60_000;
let store = null;
let writing = Promise.resolve();

function loadStore() {
  if (store) return store;
  store = { sessions: {} };
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH(), 'utf8')) // a small file, read once;
    if (raw && typeof raw.sessions === 'object') store = { sessions: raw.sessions };
  } catch { /* none yet, or torn: start clean */ }
  prune();
  return store;
}

function prune(now = Date.now()) {
  const s = store.sessions;
  for (const [id, v] of Object.entries(s)) {
    if (!v || !Array.isArray(v.turns) || now - Date.parse(v.updatedAt || 0) > SESSION_TTL_MS) delete s[id];
  }
  const ids = Object.keys(s).sort((a, b) => Date.parse(s[b].updatedAt) - Date.parse(s[a].updatedAt));
  for (const id of ids.slice(MAX_SESSIONS)) delete s[id];
}

function persist() {
  const snapshot = JSON.stringify(store, null, 1);
  writing = writing.then(async () => {
    await mkdir(path.dirname(STORE_PATH()), { recursive: true });
    const tmp = `${STORE_PATH()}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, snapshot, 'utf8');
    await rename(tmp, STORE_PATH());
  }).catch((e) => console.log(`local ask sessions: could not write (${e.message})`));
  return writing;
}

/** The session's kept turns, oldest first ([] when unknown or expired). */
export function sessionTurns(sessionId) {
  if (!sessionId) return [];
  loadStore();
  prune();
  return [...(store.sessions[sessionId]?.turns || [])];
}

/** Was this session opened by the local model, so Claude has never seen it? */
export function isLocalOnlySession(sessionId) {
  if (!sessionId) return false;
  loadStore();
  prune();
  return !!store.sessions[sessionId]?.localOnly;
}

/** Keep one finished turn. `localOnly` is set when the local model opens a
 *  session; a Claude turn on it clears it. */
export function recordAskTurn(sessionId, { q, a, provider }, { opened = false, now = Date.now() } = {}) {
  if (!sessionId || !String(a || '').trim()) return Promise.resolve();
  loadStore();
  const s = store.sessions[sessionId] || { turns: [], localOnly: opened && provider === 'local' };
  s.turns = [...s.turns, { q: clip(q, 600), a: clip(a, 1200), at: new Date(now).toISOString(), provider }].slice(-MAX_TURNS);
  if (provider === 'claude') s.localOnly = false;
  s.updatedAt = new Date(now).toISOString();
  store.sessions[sessionId] = s;
  prune(now);
  return persist();
}

/** The turns the local model answered since Claude last did, for a resumed
 *  Claude turn that would otherwise not know them. */
export function localTurnsSinceClaude(sessionId) {
  const turns = sessionTurns(sessionId);
  const lastClaude = turns.map((t) => t.provider).lastIndexOf('claude');
  return turns.slice(lastClaude + 1).filter((t) => t.provider === 'local');
}

export function transcriptOf(turns, { maxChars = 2400 } = {}) {
  const lines = turns.map((t) => `He: ${clip(t.q, 240)} / Nova: ${clip(t.a, 400)}`);
  let out = lines.join('\n');
  while (out.length > maxChars && lines.length > 1) { lines.shift(); out = lines.join('\n'); }
  return out.slice(0, maxChars);
}

export async function _reset({ file = false } = {}) {
  await writing.catch(() => {});
  store = null;
  verbLinesCache = null;
  if (file) { try { await rm(STORE_PATH(), { force: true }); } catch { /* none */ } }
}
export function _flush() { return writing; }

/* -------------------------------- the turn -------------------------------- */

async function todayBlock() {
  try {
    const { todayLocalContext } = await import('./askContext.js');
    return (await todayLocalContext()) || '';
  } catch { return ''; }
}

/** One local turn: the chat loop with code-run lookups. Returns the reply
 *  text, the lookups used, and the token usage. Throws a plain reason. */
async function converse(job, { cwd, question, promptOpts, deadline }) {
  let useTools = true;
  let switched = false;
  const messages = [
    { role: 'system', content: buildLocalAskPrompt(promptOpts) },
    { role: 'user', content: question },
  ];
  const used = [];
  let outputTokens = 0;
  let inputTokens = 0;
  let model = defaultModel();
  for (let round = 0; ; round++) {
    const final = round >= MAX_ROUNDS;
    if (final) messages.push({ role: 'user', content: FINAL_ASK });
    const left = deadline - Date.now();
    if (left <= 0) throw new Error(`it took longer than ${Math.round(TURN_TIMEOUT_MS() / 1000)} s`);
    let out;
    try {
      // thinking off: left on, Qwen3.5 on Ollama spends the whole budget
      // thinking and returns no answer (27 Oct). The context window is the
      // one default (lib/localModel.js CHAT_CTX): the prompt alone is ~2.2k
      // tokens before the vault pages a lookup hands back.
      out = await chatLocal(messages, { tools: useTools && !final ? TOOLS : null, timeoutMs: Math.max(1000, left), maxTokens: 700, think: false });
    } catch (e) {
      // a server that does not take `tools`: once, at the start, the text form
      if (e.status === 400 && useTools && !switched && round === 0) {
        useTools = false;
        switched = true;
        messages[0] = { role: 'system', content: buildLocalAskPrompt({ ...promptOpts, toolsInText: true }) };
        round -= 1;
        continue;
      }
      throw e;
    }
    model = out.model || model;
    if (out.usage) {
      outputTokens += Number(out.usage.completion_tokens) || 0;
      inputTokens += Number(out.usage.prompt_tokens) || 0;
    }
    const { calls, text } = readToolCalls(out.message);
    if (!calls.length || final) {
      if (!text) throw new Error(final ? 'it kept looking and never answered' : 'it returned no answer');
      return { text, used, outputTokens: outputTokens || null, inputTokens: inputTokens || null, model, textForm: !useTools };
    }
    const batch = calls.slice(0, 3);
    if (useTools) {
      messages.push({
        role: 'assistant',
        content: typeof out.message.content === 'string' ? out.message.content : '',
        tool_calls: batch.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })),
      });
    } else {
      messages.push({ role: 'assistant', content: String(out.message.content || '') });
    }
    const responses = [];
    for (const c of batch) {
      job.partial = progressLine(c);
      const result = await runTool(cwd, c);
      used.push({ name: c.name, args: c.args, chars: result.length });
      if (useTools) messages.push({ role: 'tool', tool_call_id: c.id, name: c.name, content: result });
      else responses.push(`<tool_response>\n${result}\n</tool_response>`);
    }
    if (!useTools) messages.push({ role: 'user', content: responses.join('\n') });
  }
}

/**
 * Ask Nova on the model on this Mac. Returns a job id in the same map as
 * startAskNova (getMessageJob serves it). `job` (internal, lib/askDispatch.js)
 * is an existing job to carry this answer: the Claude job that failed, so
 * the client already polling its id gets the stand-in's answer.
 */
export function startAskLocal(cwd, { question, sessionId = null, liveLine = '', spoken = false, direct = false, where = null, fallback = false, reason = null } = {}, { job: carrier = null, claudeError = null, opened: openedOverride = null, dryRun = false } = {}) {
  if (!carrier) assertLaneOn('ask-nova');
  const job = carrier || { id: randomUUID().slice(0, 8), status: 'running', result: null, error: null, partial: '' };
  job.provider = 'local';
  job.fallback = !!fallback;
  if (!carrier) registerAskJob(job);
  const place = where?.place || 'unknown';
  const noGlass = suppressGlass(place);
  if (noGlass) job.noGlass = true;
  const opened = openedOverride ?? !sessionId;
  const effectiveSessionId = sessionId || randomUUID();
  const started = Date.now();
  job.partial = 'On the model on this Mac…';
  // a stand-in's failure is still Claude's failure, with why it could not help
  const failure = (why) => {
    const w = String(why || '').replace(/^local model /, '');
    return claudeError ? `${claudeError} The model on this Mac could not stand in: ${w}` : `The model on this Mac could not answer: ${w}`;
  };

  (async () => {
    const history = sessionTurns(effectiveSessionId);
    const today = await todayBlock();
    let him = '';
    try {
      const { profileContext } = await import('./profile.js');
      him = await profileContext(cwd);
    } catch (e) { him = `ABOUT HAYDEN: (his profile page could not be read: ${e.message})`; }
    let talkPrefs = '';
    try { talkPrefs = talkPrefsBlock(cwd); } catch { talkPrefs = ''; }
    const promptOpts = { today, liveLine, place, spoken, direct, history, him, talkPrefs };
    let turn;
    try {
      turn = await converse(job, { cwd, question, promptOpts, deadline: started + TURN_TIMEOUT_MS() });
    } catch (e) {
      const ms = Date.now() - started;
      recordRun('ask-nova', { provider: 'local', fallback: !!fallback, usd: 0, ms, model: `local:${defaultModel()}`, error: String(e.message || e).slice(0, 200) });
      job.error = failure(e.message || e);
      job.status = 'error';
      refreshLocalStatus().catch(() => {});
      return;
    }
    const ms = Date.now() - started;
    // a stray VIS line is never spoken (the Claude path strips it in the pool)
    const reply = parseVisualStream(turn.text).text;
    // a reply that says it cannot answer is never spoken: code hands the same
    // job to Claude (lib/askDispatch.js holdForEscalation), whose Nova can ask
    // Coach and the Researcher. A stand-in has no one to hand up to (Claude
    // already failed), and the bench reads the words as written.
    if (!fallback && !dryRun && gaveUp(reply)) {
      recordRun('ask-nova', { provider: 'local', usd: 0, ms, model: `local:${turn.model}`, inputTokens: turn.inputTokens, outputTokens: turn.outputTokens, error: 'gave up: handed to Claude' });
      console.log(`local ask: gave up after ${turn.used.length} lookup(s) ("${reply.slice(0, 80)}"); handed to Claude`);
      job.escalateReason = 'the model on this Mac could not answer it';
      job.error = failure('it said it could not answer');
      job.status = 'error';
      return;
    }
    const extra = { provider: 'local', fallback: !!fallback, reason: fallback ? (reason || 'Claude could not answer') : null, model: `local:${turn.model}`, lookups: turn.used.map((u) => ({ name: u.name, args: u.args })) };
    // the bench (server/scripts/benchLocalAsk.mjs): the words as written,
    // nothing settled, filed or acted on, nothing remembered
    if (dryRun) {
      recordRun('ask-nova', { provider: 'local', fallback: !!fallback, usd: 0, ms, model: `local:${turn.model}`, inputTokens: turn.inputTokens, outputTokens: turn.outputTokens });
      job.result = { text: reply, sessionId: effectiveSessionId, dryRun: true, ...extra, ms };
      job.status = 'ready';
      return;
    }
    // settleAskReply sets the status; hold it until the lead line and the
    // session memory are in place, so a poll never sees a half-labelled answer
    const shadow = { id: job.id, status: 'running', result: null, error: null };
    await settleAskReply(cwd, reply, shadow, { question, noGlass, direct, place, sessionId: effectiveSessionId, extra });
    recordRun('ask-nova', {
      provider: 'local', fallback: !!fallback, usd: 0, ms, model: `local:${turn.model}`,
      inputTokens: turn.inputTokens, outputTokens: turn.outputTokens,
      ...(shadow.status === 'error' ? { error: String(shadow.error || '').slice(0, 200) } : {}),
    });
    refreshLocalStatus().catch(() => {});
    if (shadow.status !== 'ready') {
      job.error = failure(shadow.error || 'the answer could not be settled');
      job.status = 'error';
      return;
    }
    const answer = shadow.result.text;
    recordAskTurn(effectiveSessionId, { q: question, a: answer, provider: 'local' }, { opened });
    // a stand-in is labelled by the result (provider/fallback/reason), which
    // the client renders as a meta line; no spoken sentence on every turn
    job.result = shadow.result;
    job.status = 'ready';
    console.log(`local ask ${ms}ms${fallback ? ' (stand-in)' : ''} lookups=${turn.used.length}${turn.textForm ? ' text-form' : ''} reply=${answer.length}ch`);
  })().catch((e) => {
    job.error = failure(e.message);
    job.status = 'error';
  });

  return job.id;
}
