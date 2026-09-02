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

export async function rememberDebrief({ routineId, sessionId, routineName, date, text }) {
  const clean = String(text || '').trim().slice(0, 1200);
  if (!clean || !routineId) return null;
  const state = await load();
  const entry = { text: clean, at: new Date().toISOString(), routineId, routineName: routineName || null, date: date || null, sessionId: sessionId || null };
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

// The fact-sheet line for the NEXT same-routine session.
export function lastDebriefLine(entry) {
  if (!entry?.text) return null;
  return `YOUR LAST DEBRIEF FOR THIS ROUTINE (${entry.date || entry.at.slice(0, 10)} — follow up on its carry if today's data speaks to it, once, naturally; never re-read it back): ${entry.text}`;
}

// The Coach chat's line — the rack and the chat agree on what was last said.
export async function debriefMemoryContext(routineId) {
  const entry = await lastDebriefFor(routineId);
  if (!entry) return null;
  return `WHAT YOU SAID AT THE RACK after his last ${entry.routineName || routineId} session (${entry.date || entry.at.slice(0, 10)}): "${entry.text}"`;
}

export const _reset = async () => save({ byRoutine: {}, bySession: {} });
