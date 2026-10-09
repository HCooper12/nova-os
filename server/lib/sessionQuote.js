// WHAT A WAITING SESSION LAST SAID (his call 2, 10 Oct 2026: "Quote a
// waiting session's last message in the Needs-you strip"). "Science Atlas
// is waiting for you" told him THAT a session wanted him, never WHAT it
// wanted; he had to walk to the Mac to find out. The words already exist:
// the CLI journals every session to ~/.claude/projects/<slug>/<id>.jsonl
// (the same journal claudeSessions.js reads for when someone last spoke).
// This reads the last thing the assistant said there, makes it one plain
// line, takes out anything shaped like a secret, and caps it.
//
// Read-only over the CLI's own files; nothing is stored. A journal that
// cannot be read, or a last turn with no words in it (only tool calls), is
// no quote, never a guess. Kept apart from claudeSessions.js because that
// file is shared byte for byte with Wren and this is Nova's alone.

import fs from 'node:fs';

export const QUOTE_MAX = 280;
const TAIL_BYTES = 1_000_000;
const HIDDEN = '[hidden]';

// Each pattern is a shape secrets take in a transcript: a provider's key
// prefix, a token in a header, a NAME=value assignment, a password in a
// URL, a private key block, a JWT. The last is a fallback for a long random
// run of letters and digits that matches no named shape.
const SECRET_SHAPES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, HIDDEN],
  [/\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, HIDDEN],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, HIDDEN],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, HIDDEN],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, HIDDEN],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, HIDDEN],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, HIDDEN],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, HIDDEN],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, HIDDEN],
  [/\bnpm_[A-Za-z0-9]{30,}/g, HIDDEN],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, HIDDEN],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, `$1 ${HIDDEN}`],
  [/\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|AUTH)[A-Za-z0-9_]*)(\s*[=:]\s*)(["']?)[^\s"'`,;]{6,}\3/gi, `$1$2${HIDDEN}`],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, `$1${HIDDEN}@`],
];

// letters, digits and the symbols tokens use, 32 or more in a row
const LONG_RUN = /[A-Za-z0-9_+/=-]{32,}/g;
function entropy(s) {
  const n = new Map();
  for (const c of s) n.set(c, (n.get(c) || 0) + 1);
  let h = 0;
  for (const k of n.values()) { const p = k / s.length; h -= p * Math.log2(p); }
  return h;
}
// a piece counts as random when it mixes cases and digits and is dense with
// symbols: a 40-character git id (hex, 4 bits a character at most) stays
const randomPiece = (p) => p.length >= 24 && /[0-9]/.test(p) && /[A-Z]/.test(p) && /[a-z]/.test(p) && entropy(p) >= 4.3;
// a path or a hyphenated name is words between separators: judged piece by
// piece, so "Atomic_Hub/P3_Draft3/Atlas_Progress_Map" stays as it is
function looksRandom(run) {
  if (randomPiece(run.replace(/[-_/]/g, '')) && !/[-_/]/.test(run)) return true;
  return run.split(/[-_/.]+/).some(randomPiece);
}

/** Take out anything shaped like a secret. Plain text in, plain text out. */
export function scrubSecrets(text) {
  let t = String(text ?? '');
  for (const [re, to] of SECRET_SHAPES) t = t.replace(re, to);
  t = t.replace(LONG_RUN, (run) => (looksRandom(run) ? HIDDEN : run));
  return t;
}

/**
 * A message as one plain line: code blocks named rather than pasted, the
 * markdown marks taken off, whitespace folded, secrets out, and capped at a
 * word boundary without splitting an emoji. '' when nothing is left.
 */
export function quoteLine(raw, { max = QUOTE_MAX } = {}) {
  let t = scrubSecrets(raw);
  t = t.replace(/```[\s\S]*?(?:```|$)/g, ' [code] ');
  t = t.replace(/`([^`\n]*)`/g, '$1');
  t = t.replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, '$1');
  t = t.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '');
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,;:!?]|$)/g, '$1$2');
  t = t.replace(/\s+/g, ' ').trim();
  if (/^(?:\[code\]\s*)+$/.test(t)) t = 'A code block, and nothing said around it.';
  const chars = Array.from(t);
  if (chars.length <= max) return t;
  let cut = chars.slice(0, max - 1).join('');
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s,;:.]+$/, '') + '…';
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((c) => c?.type === 'text' && typeof c.text === 'string').map((c) => c.text).join('\n\n');
  return '';
}

function readTail(file, bytes) {
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, 'r');
  try {
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally { fs.closeSync(fd); }
}

/**
 * The last words the assistant said in a journal, as { text, at, model },
 * or null. Walks back from the end past turns that hold only tool calls.
 * Stops at his own message: if he spoke last, the session is not waiting on
 * anything it said.
 */
export function lastAssistantQuote(file, { tailBytes = TAIL_BYTES, max = QUOTE_MAX, read = readTail } = {}) {
  let raw;
  try { raw = read(file, tailBytes); } catch { return null; }
  const lines = String(raw || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || (!line.includes('"assistant"') && !line.includes('"user"'))) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    if (j.isSidechain || j.isMeta) continue;
    if (j.type === 'user') {
      // a tool's result rides in a user entry; only his own words stop the walk
      const c = j.message?.content;
      const his = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x?.type === 'text').map((x) => x.text).join('') : '';
      if (his.trim() && !his.trim().startsWith('<')) return null;
      continue;
    }
    if (j.type !== 'assistant') continue;
    const text = quoteLine(textOf(j.message?.content), { max });
    if (!text) continue;
    const at = Date.parse(j.timestamp || '');
    return { text, at: Number.isFinite(at) ? at : null, model: typeof j.message?.model === 'string' ? j.message.model : null };
  }
  return null;
}
