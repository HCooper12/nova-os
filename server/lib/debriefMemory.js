// THE DEBRIEF REMEMBERS ITSELF. The Coach's post-session reaction used to
// vanish the moment Telegram delivered it: the next same-routine session got
// a cold fact sheet, so a pointed carry ("next Pull, lead with the row") was
// never followed up, and without Telegram the reaction did not exist at all.
// This is the operational memory (server/data — derived, not vault truth):
// per routine, the last debrief; per session, the debrief that reacted to it.
// Two consumers by design: the next fact sheet and the Coach chat's context,
// so the rack and the chat agree; a third, the history view's "Coach said".
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closedAsOf, scrubClosed } from './concernClose.js';

const STATE_PATH = () => path.join(process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'debrief-memory.json');
const KEEP_SESSIONS = 200;

async function load() {
  try {
    const parsed = JSON.parse(await readFile(STATE_PATH(), 'utf8'));
    return { byRoutine: parsed.byRoutine || {}, bySession: parsed.bySession || {} };
  } catch {
    return { byRoutine: {}, bySession: {} };
  }
}
async function save(state) {
  await mkdir(path.dirname(STATE_PATH()), { recursive: true }).catch(() => {});
  await writeFile(STATE_PATH(), JSON.stringify(state, null, 2), 'utf8');
}

// `via` (2 Nov 2026): who wrote it (lib/textLane.js laneVia), only when the
// debrief came through the text-lane runner; a Claude-streamed debrief keeps
// the entry's old shape
export async function rememberDebrief({ routineId, sessionId, routineName, date, text, via = null }) {
  const clean = String(text || '').trim().slice(0, 1200);
  if (!clean || !routineId) return null;
  const state = await load();
  const entry = { text: clean, at: new Date().toISOString(), routineId, routineName: routineName || null, date: date || null, sessionId: sessionId || null, ...(via ? { via } : {}) };
  state.byRoutine[routineId] = entry;
  if (sessionId) {
    state.bySession[sessionId] = entry;
    const ids = Object.keys(state.bySession);
    if (ids.length > KEEP_SESSIONS) for (const id of ids.slice(0, ids.length - KEEP_SESSIONS)) delete state.bySession[id];
  }
  await save(state);
  return entry;
}

export async function lastDebriefFor(routineId) {
  if (!routineId) return null;
  return (await load()).byRoutine[routineId] || null;
}

export async function debriefsForSessions(ids) {
  const { bySession } = await load();
  const out = {};
  for (const id of ids || []) if (bySession[id]) out[id] = bySession[id];
  return out;
}

// A DEBRIEF SPOKE FOR ITS DAY. What it said about an area he has since closed
// stays in this file as history (the "Coach said" view keeps it) and stops
// being handed to the Coach as a carry to follow up. `closed` comes from
// lib/injuryLog.js closedConcerns; a debrief written after the closure keeps
// every word, because that is new evidence.
function freshText(entry, closed = []) {
  return scrubClosed(entry.text, closedAsOf(closed, entry.date || entry.at));
}

// The fact-sheet line for the NEXT same-routine session.
export function lastDebriefLine(entry, { closed = [] } = {}) {
  if (!entry?.text) return null;
  const text = freshText(entry, closed);
  if (!text) return null;
  return `YOUR LAST DEBRIEF FOR THIS ROUTINE (${entry.date || entry.at.slice(0, 10)} — follow up on its carry if today's data speaks to it, once, naturally; never re-read it back): ${text}`;
}

// The Coach chat's line — the rack and the chat agree on what was last said.
export async function debriefMemoryContext(routineId, { closed = [] } = {}) {
  const entry = await lastDebriefFor(routineId);
  if (!entry) return null;
  const text = freshText(entry, closed);
  if (!text) return null;
  return `WHAT YOU SAID AT THE RACK after his last ${entry.routineName || routineId} session (${entry.date || entry.at.slice(0, 10)}): "${text}"`;
}

export const _reset = async () => save({ byRoutine: {}, bySession: {} });
