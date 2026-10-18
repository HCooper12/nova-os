import { readFile, writeFile, mkdir, rename, open as openFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseVisualStream } from '../../src/visualBeats.js';

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

// Every id a lane has used, newest last, so a session id can be traced to
// the lane that owns it (askSession.js sessionOwnerGuard). Bounded: the guard
// needs recent ids, not history.
const IDS_KEPT = 40;

// Recorded kinds: 'coach', 'leader' (Nova reads their transcripts back) and,
// since 18 Oct 2026, 'voice' (Nova's own conversations), so the guard can
// also refuse one of Nova's ids offered to the Coach.
export async function recordAgentSession(kind, cwd, sessionId) {
  if (!kind || !sessionId) return;
  try {
    let all = {};
    if (existsSync(SESSIONS_PATH())) {
      try { all = JSON.parse(await readFile(SESSIONS_PATH(), 'utf8')); } catch { all = {}; }
    }
    const cur = all[kind];
    if (cur?.sessionId === sessionId) return; // common path: no write
    const ids = Array.isArray(cur?.ids) ? cur.ids.filter((x) => x !== sessionId) : (cur?.sessionId ? [cur.sessionId] : []);
    ids.push(sessionId);
    all[kind] = { sessionId, cwd, at: new Date().toISOString(), ids: ids.slice(-IDS_KEPT) };
    await mkdir(dataRoot(), { recursive: true });
    const tmp = SESSIONS_PATH() + '.tmp';
    await writeFile(tmp, JSON.stringify(all, null, 2), 'utf8');
    await rename(tmp, SESSIONS_PATH());
    ownerCache = null;
  } catch { /* a missed record just means an absent section — honest absence */ }
}

// WHICH LANE OWNS THIS SESSION ID? Synchronous on purpose: the guard runs on
// the path that is about to spawn a process, and the file is a few KB, read
// once per change (cached against its mtime). null when no lane recorded it.
let ownerCache = null;
let ownerStamp = null;
export function sessionOwner(sessionId) {
  if (!sessionId) return null;
  try {
    const file = SESSIONS_PATH();
    if (!existsSync(file)) return null;
    const stamp = `${statSync(file).mtimeMs}:${file}`;
    if (!ownerCache || ownerStamp !== stamp) {
      const all = JSON.parse(readFileSync(file, 'utf8'));
      const map = new Map();
      for (const [kind, rec] of Object.entries(all || {})) {
        const ids = Array.isArray(rec?.ids) ? rec.ids : [];
        for (const id of [...ids, rec?.sessionId].filter(Boolean)) map.set(id, kind);
      }
      ownerCache = map;
      ownerStamp = stamp;
    }
    return ownerCache.get(sessionId) || null;
  } catch {
    return null;
  }
}

// The CLI's own journal for a session: where it lives on this machine.
export function sessionJournalPath(cwd, sessionId) {
  return path.join(os.homedir(), '.claude', 'projects', projectSlug(cwd), `${sessionId}.jsonl`);
}

// HOW BIG IS THIS SESSION, AND WHEN DID IT LAST SPEAK? Read from the CLI's
// journal, so it survives a server restart: the context of the newest model
// call (input + cache read + cache write, the tokens the next turn re-sends)
// and the file's mtime. Only the tail is read: a 240k-token session is a
// megabyte of JSON, and the newest usage is in its last lines.
const TAIL_BYTES = 512 * 1024;
export async function sessionFootprint(cwd, sessionId) {
  try {
    const file = sessionJournalPath(cwd, sessionId);
    if (!existsSync(file)) return null;
    const st = await stat(file);
    const start = Math.max(0, st.size - TAIL_BYTES);
    const fh = await openFile(file, 'r');
    let text = '';
    try {
      const buf = Buffer.alloc(st.size - start);
      await fh.read(buf, 0, buf.length, start);
      text = buf.toString('utf8');
    } finally { await fh.close(); }
    const lines = text.split('\n');
    let tokens = null;
    for (let i = lines.length - 1; i >= 0 && tokens == null; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      const u = d?.message?.usage;
      if (d?.type === 'assistant' && u) {
        tokens = (Number(u.input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0);
      }
    }
    return { tokens, lastAt: st.mtimeMs };
  } catch {
    return null;
  }
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
  // the running glass's lines (a panel, a mark, a stance) are directives,
  // not what the agent said: the one shared parser takes them out, wherever
  // they sit (4 Oct 2026: they were quoted back as the Coach's words, and
  // ate the 220-character budget a turn gets)
  t = parseVisualStream(t).text;
  // trailing typed directives
  t = t.replace(/(^|\n)\s*(PROPOSE|REFLECT|SHOW|RESEARCH|CONSULT|WITHDRAW)\s+\{[\s\S]*$/, '').trim();
  return t;
}

export async function agentTranscriptTail(kind, { maxTurns = 6, maxChars = 220 } = {}) {
  try {
    if (!existsSync(SESSIONS_PATH())) return null;
    const all = JSON.parse(await readFile(SESSIONS_PATH(), 'utf8'));
    const rec = all[kind];
    if (!rec?.sessionId || !rec?.cwd) return null;
    const tail = await sessionTail(rec.cwd, rec.sessionId, { maxTurns, maxChars });
    return tail ? { at: rec.at, turns: tail.turns } : null;
  } catch {
    return null;
  }
}

// The cleaned last turns of ONE session's journal (the Coach's rollover
// carries these into the session that replaces it).
export async function sessionTail(cwd, sessionId, { maxTurns = 6, maxChars = 220 } = {}) {
  try {
    const file = sessionJournalPath(cwd, sessionId);
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
    return { turns: turns.slice(-maxTurns) };
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
