import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// NOVA IS THE CEO — Coach and the Leader work beneath it, and he expects
// that talking to Nova IS talking to the whole org: "what did Coach say
// about my pull-ups?", "tell the Leader that worked". That fails if Nova
// has never seen their conversations.
//
// The transcripts already exist: every Coach/Leader turn runs through the
// claude CLI, which journals the full conversation to
// ~/.claude/projects/<cwd-slug>/<sessionId>.jsonl on this same machine.
// The only missing piece was WHICH session file is the live one — the ids
// lived in his phone's localStorage, invisible to the server. warmTurn
// knows both the kind and the session id on every single turn, so it
// records them here, and Ask Nova's context reads the tail back.
//
// Read-only over the CLI's files, one tiny receipt of our own. No second
// transcript store to drift out of sync — the CLI's journal IS the truth.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const SESSIONS_PATH = () => path.join(dataRoot(), 'agent-sessions.json');

// The CLI names its project dir by flattening the cwd: every character
// that isn't a letter or digit becomes '-'. Verified against the real dir
// ("Hayden's Vault" → "Hayden-s-Vault", "iCloud~md~obsidian" →
// "iCloud-md-obsidian").
export function projectSlug(cwd) {
  return String(cwd || '').replace(/[^A-Za-z0-9]/g, '-');
}

export async function recordAgentSession(kind, cwd, sessionId) {
  if (!kind || !sessionId) return;
  try {
    let all = {};
    if (existsSync(SESSIONS_PATH())) {
      try { all = JSON.parse(await readFile(SESSIONS_PATH(), 'utf8')); } catch { all = {}; }
    }
    const cur = all[kind];
    if (cur?.sessionId === sessionId) return; // common path: no write
    all[kind] = { sessionId, cwd, at: new Date().toISOString() };
    await mkdir(dataRoot(), { recursive: true });
    const tmp = SESSIONS_PATH() + '.tmp';
    await writeFile(tmp, JSON.stringify(all, null, 2), 'utf8');
    await rename(tmp, SESSIONS_PATH());
  } catch { /* a missed record just means an absent section — honest absence */ }
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((c) => c?.type === 'text').map((c) => c.text).join(' ');
  return '';
}

// One conversational turn, cleaned for a summary: the plumbing that rides
// inside messages (bracketed reminders/situation blocks, typed PROPOSE /
// REFLECT directives, the giant turn-1 prompt) is not conversation and
// must not be quoted back as if he or the agent said it.
export function cleanTurnText(text) {
  // Plumbing arrives as LEADING PARAGRAPHS: bracketed reminder/situation
  // blocks (which can run past any char cap — the real Coach reminder did,
  // and a capped regex left its tail glued to his words) and the raw
  // "LIVE UPDATE (recomputed this turn…)" preamble, which isn't bracketed
  // at all. Judge each leading paragraph by signature and drop until the
  // first one that reads as conversation. Found on his real transcript,
  // not the fixture — the fixture's reminder was politely short.
  const paras = String(text || '').split(/\n{2,}/);
  const isPlumbing = (p) => {
    const s = p.trim();
    return s.startsWith('[') || /^LIVE UPDATE\b/.test(s) || /\(recomputed this turn/.test(s);
  };
  let i = 0;
  while (i < paras.length && isPlumbing(paras[i])) i++;
  let t = paras.slice(i).join('\n\n');
  // trailing typed directives
  t = t.replace(/(^|\n)\s*(PROPOSE|REFLECT|SHOW|RESEARCH)\s+\{[\s\S]*$/, '').trim();
  return t;
}

export async function agentTranscriptTail(kind, { maxTurns = 6, maxChars = 220 } = {}) {
  try {
    if (!existsSync(SESSIONS_PATH())) return null;
    const all = JSON.parse(await readFile(SESSIONS_PATH(), 'utf8'));
    const rec = all[kind];
    if (!rec?.sessionId || !rec?.cwd) return null;
    const file = path.join(os.homedir(), '.claude', 'projects', projectSlug(rec.cwd), `${rec.sessionId}.jsonl`);
    if (!existsSync(file)) return null;
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    const turns = [];
    for (const line of lines) {
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      const role = d.type === 'user' ? 'user' : d.type === 'assistant' ? 'assistant' : (d.message?.role || null);
      if (role !== 'user' && role !== 'assistant') continue;
      const raw = textOf(d.message?.content);
      if (!raw) continue; // tool_use / tool_result entries carry no text
      const t = cleanTurnText(raw);
      if (!t) continue;
      // the opening prompt is doctrine, not dialogue
      if (role === 'user' && (t.length > 1500 || t.startsWith('NOVA OPERATING LENS'))) continue;
      turns.push({ role, text: t.length > maxChars ? t.slice(0, maxChars) + '…' : t });
    }
    if (!turns.length) return null;
    return { at: rec.at, turns: turns.slice(-maxTurns) };
  } catch {
    return null;
  }
}

// The formatted context section — null when there is nothing real to say.
export async function agentConversationContext(kind, speaker) {
  const tail = await agentTranscriptTail(kind);
  if (!tail) return null;
  const lines = tail.turns.map((t) => `${t.role === 'user' ? 'Hayden' : speaker}: ${t.text}`);
  return `${speaker.toUpperCase()}'S CURRENT CONVERSATION (their real recent exchange — when he asks what ${speaker} said, thinks, or should know, answer from THIS, and relay his messages faithfully):\n${lines.join('\n')}`;
}
