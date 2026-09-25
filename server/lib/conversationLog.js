// THE CONVERSATION RECORD — every line of his spoken conversation with Nova,
// from every door, in one place.
//
// His ask, 25 Sep 2026, after speaking through the bottom-bar icon and
// getting nothing back: "Anything that I speak with Nova about should always
// appear in this voice chat as a historical record so I can see and say Nova
// can keep referring back to what we have discussed or what I've asked."
//
// Before this, the voice chat was each device's own localStorage (40 lines,
// gone after a week), the Siri and Action Button lanes never reached it at
// all, and Nova's own session reset every day, so neither of them could
// look back further than today on one device.
//
// Shape: append-only JSON lines, one file per UTC month
// (server/data/conversation/2026-09.jsonl), because a record must never be
// rewritten to add to it. An edited line (a streamed reply that settles, a
// notice replaced by its outcome) is appended again under the same id and
// the reader keeps the last version at the first version's time.
//
// Writers: the app mirrors every settled voice-chat line (App.jsx
// syncConversation, keyed by a per-device id), and the Shortcut lanes
// (routes/voice.js askSync, /ask/audio) write their own, because no app is
// involved there. Readers: GET /api/conversation for the Voice screen, and
// recentConversationBlock() for Nova's own context.

import { appendFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // never URL.pathname: the repo path has a space

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const DIR = () => path.join(dataRoot(), 'conversation');

const WHO = new Set(['you', 'nova', 'system']);
const ID = /^[A-Za-z0-9_.:-]{6,96}$/;
const WORD = /^[a-z][a-z0-9-]{0,23}$/;
const MAX_TEXT = 20_000;          // a long spoken turn, never a payload
const FUTURE_SLACK_MS = 5 * 60_000; // a phone clock a little ahead is fine; a year ahead is not

// One row, cleaned, or null when there is nothing a person said or heard.
export function normaliseTurn(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, MAX_TEXT) : '';
  if (!text || !WHO.has(raw.who)) return null;
  const t = raw.at != null ? new Date(raw.at) : now;
  const at = Number.isNaN(t.getTime()) || t.getTime() > now.getTime() + FUTURE_SLACK_MS ? now : t;
  const via = typeof raw.via === 'string' && WORD.test(raw.via) ? raw.via : 'app';
  const device = typeof raw.device === 'string' ? raw.device.replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 16) : '';
  return {
    id: typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : `srv-${randomUUID()}`,
    at: at.toISOString(),
    who: raw.who,
    text,
    via,
    ...(device ? { device } : {}),
  };
}

// Writes are serialised: the app posts a batch while a Shortcut answer
// lands, and two interleaved appends to one file must not tear a line.
let chain = Promise.resolve();

export function appendTurns(rows, { now = new Date() } = {}) {
  const clean = (Array.isArray(rows) ? rows : [rows]).map((r) => normaliseTurn(r, now)).filter(Boolean);
  if (!clean.length) return Promise.resolve([]);
  const run = async () => {
    await mkdir(DIR(), { recursive: true });
    const byFile = new Map();
    for (const r of clean) {
      const f = path.join(DIR(), `${r.at.slice(0, 7)}.jsonl`);
      byFile.set(f, (byFile.get(f) || '') + JSON.stringify(r) + '\n');
    }
    for (const [f, text] of byFile) await appendFile(f, text, 'utf8');
    return clean;
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// Fire-and-forget for the lanes that must never wait on, or fail because
// of, the record. A failure is logged once and the answer still goes out.
export function logTurn(row) {
  appendTurns([row]).catch((e) => console.log(`conversation record: could not write (${e.message})`));
}

async function monthFiles() {
  try {
    return (await readdir(DIR())).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort();
  } catch {
    return [];
  }
}

// The record, collapsed by id (the last version wins, kept at the first
// version's time), oldest first. `since` / `before` bound it; `limit` keeps
// the newest N. Reads newest month first and stops once it has enough.
export async function readTurns({ limit = 150, since = null, before = null } = {}) {
  const sinceMs = since ? new Date(since).getTime() : null;
  const beforeMs = before ? new Date(before).getTime() : null;
  const files = (await monthFiles()).reverse();
  const byId = new Map();
  for (const f of files) {
    let text = '';
    try { text = await readFile(path.join(DIR(), f), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let r;
      try { r = JSON.parse(line); } catch { continue; } // a torn line costs one row, never the record
      if (!r?.id || !r.at) continue;
      const prev = byId.get(r.id);
      byId.set(r.id, prev ? { ...r, at: prev.at < r.at ? prev.at : r.at } : r);
    }
    // a month older than `since` holds nothing we want; a month's worth of
    // rows beyond the limit means older months cannot change the answer
    if (sinceMs != null && new Date(`${f.slice(0, 7)}-01T00:00:00Z`).getTime() < sinceMs) break;
    if (!sinceMs && !beforeMs && byId.size >= limit * 2) break;
  }
  let rows = [...byId.values()];
  if (sinceMs != null && !Number.isNaN(sinceMs)) rows = rows.filter((r) => new Date(r.at).getTime() >= sinceMs);
  if (beforeMs != null && !Number.isNaN(beforeMs)) rows = rows.filter((r) => new Date(r.at).getTime() < beforeMs);
  rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return limit > 0 ? rows.slice(-limit) : rows;
}

const VIA_LABEL = {
  presence: 'the Nova icon',
  voice: 'the Voice screen',
  reply: 'a reply sheet',
  siri: 'Siri',
  'action-button': 'the Action Button',
  app: 'the app',
};

// For Nova's own context: what he and Nova actually said, across every door
// and device, so "what did I ask you yesterday" and "like we discussed" are
// answered from the record instead of from a session that reset overnight.
export async function recentConversationBlock({ now = new Date(), days = 7, maxRows = 40, maxChars = 7000 } = {}) {
  const since = new Date(now.getTime() - days * 86400e3).toISOString();
  const rows = await readTurns({ limit: maxRows, since });
  if (!rows.length) return null;
  const stamp = (iso) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const lines = rows.map((r) => {
    const where = [VIA_LABEL[r.via] || r.via, r.device].filter(Boolean).join(', ');
    const who = r.who === 'you' ? 'He' : r.who === 'nova' ? 'You' : 'System';
    const text = r.text.length > 500 ? `${r.text.slice(0, 500)}…` : r.text;
    return `- [${stamp(r.at)} · ${where}] ${who}: ${text.replace(/\s+/g, ' ')}`;
  });
  // newest lines survive the character budget, oldest go first
  const kept = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (used + lines[i].length > maxChars) break;
    kept.unshift(lines[i]);
    used += lines[i].length + 1;
  }
  return 'YOUR CONVERSATION WITH HIM, FROM THE RECORD (the last week, every door: the app on his phone and Mac, Siri, the Action Button; oldest first; "He" is Hayden, "You" is you, Nova). '
    + 'These are real exchanges you had. Refer back to them when they bear on what he says now, and never tell him you have no memory of them. '
    + 'A "System" line is a turn that failed; if he asks whether you heard him, it tells you.\n'
    + kept.join('\n');
}
