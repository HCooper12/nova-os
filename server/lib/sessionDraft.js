import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Server-side mirror of the in-progress workout session. The device copy
// (localStorage) is first line; this is the belt-and-braces second line that
// survives storage eviction, reinstalls, and reconnect cycles — after logged
// progress was lost repeatedly, "the draft can't be lost" became a hard
// requirement. Operational state, data/ not vault: the finished session still
// lands in the vault like always.
//
// DISCARD IS UNDOABLE (19 Aug, the hard way). A discard used to unlink the
// draft outright — the one write in Nova with no undo, against the standing
// doctrine that everything writeable is undoable. It cost Hayden a live
// workout: his phone's tab had been reclaimed, it asked the server for its
// safety net, and the safety net had been deleted. Clearing now ARCHIVES
// the draft (kept ARCHIVE_KEEP_MS) so any discard — his, mine, a stray tap —
// is recoverable from the Train screen or GET/POST …/session-draft/discarded.
//
// THE GHOST-SESSION RACE: the client debounces draft uploads by 1.5s.
// Discarding cancels the PENDING timer, but an upload already on the wire
// can land after the clear and resurrect a dead session on every device.
// The archive carries clearedAt, and a save whose state was captured
// strictly before it is dropped as a stale echo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'));
const DRAFT_PATH = () => path.join(dataRoot(), 'session-draft.json');
const ARCHIVE_PATH = () => path.join(dataRoot(), 'session-draft.discarded.json');
const KEEP_MS = 7 * 24 * 3600_000; // same 7-day draft window as the client
const ARCHIVE_KEEP_MS = 7 * 24 * 3600_000;

async function readArchive() {
  try { return JSON.parse(await readFile(ARCHIVE_PATH(), 'utf8')); } catch { return null; }
}

// capturedAt: when the CLIENT snapshotted this state (its savedAt), so an
// in-flight echo of a pre-discard state identifies itself. Absent (older
// clients) falls back to arrival time — the race stays possible for them
// but nothing breaks.
export async function saveSessionDraft({ workoutSession, editingSessionId, capturedAt }) {
  if (!workoutSession || !Array.isArray(workoutSession.exercises)) throw new Error('a session draft needs exercises');
  const captured = Number(capturedAt) || Date.now();
  const archive = await readArchive();
  // strictly BEFORE: an echo's state predates the discard tap by design;
  // a same-instant capture is a genuinely new session and must save
  if (archive?.clearedAt && captured < archive.clearedAt) {
    return { saved: false, dropped: 'a deliberate clear is newer than this state — stale echo ignored' };
  }
  await mkdir(dataRoot(), { recursive: true });
  const tmp = DRAFT_PATH() + '.tmp';
  const draft = { workoutSession, editingSessionId: editingSessionId || null, savedAt: Date.now(), capturedAt: captured };
  await writeFile(tmp, JSON.stringify(draft, null, 2), 'utf8');
  await rename(tmp, DRAFT_PATH());
  return { saved: true, savedAt: draft.savedAt };
}

export async function getSessionDraft() {
  if (!existsSync(DRAFT_PATH())) return null;
  try {
    const draft = JSON.parse(await readFile(DRAFT_PATH(), 'utf8'));
    if (!draft?.workoutSession || Date.now() - (draft.savedAt || 0) > KEEP_MS) return null;
    return draft;
  } catch {
    return null; // corrupt draft — the client's own copy is still first line
  }
}

// The discarded draft, if one is still inside the recovery window and
// actually holds logged work (an untouched session isn't worth offering).
//
// A FINISH IS NOT A DISCARD. Every clear used to archive as a discard, so a
// workout he had just saved came back a minute later as "DISCARDED WORKOUT —
// STILL RECOVERABLE" for seven days — which read as Nova having lost or
// duplicated it. The clear now carries its reason; and because older
// tombstones carry none, `sessions` (the vault's saved sessions, passed by
// the route) lets a legacy archive be recognised as a finish: a saved
// session of the same routine within half an hour of the clear IS that
// workout, safely in the vault.
const FINISH_MATCH_MS = 30 * 60_000;
export async function getDiscardedDraft({ sessions = [] } = {}) {
  const a = await readArchive();
  if (!a?.workoutSession || Date.now() - (a.clearedAt || 0) > ARCHIVE_KEEP_MS) return null;
  if (a.reason === 'finished') return null;
  const ticked = (a.workoutSession.exercises || []).reduce((n, e) => n + (e.sets || []).filter((s) => s.done).length, 0);
  if (!ticked) return null;
  const saved = (sessions || []).some((s) => {
    const sameRoutine = (s.routineId && s.routineId === a.workoutSession.routineId) || (s.routineName && s.routineName === a.workoutSession.routineName);
    const at = new Date(s.finishedAt || 0).getTime();
    return sameRoutine && at && Math.abs(at - a.clearedAt) < FINISH_MATCH_MS;
  });
  if (saved) return null; // it was a finish that predates the reason stamp
  return { ...a, tickedSets: ticked };
}

// reason: 'finished' (the session was saved — the archive is only the echo
// tombstone) or 'discarded' (recoverable for a week). Unknown → discarded,
// the safe side.
export async function clearSessionDraft({ reason } = {}) {
  const draft = await getSessionDraft();
  try { await unlink(DRAFT_PATH()); } catch { /* already gone */ }
  try {
    await mkdir(dataRoot(), { recursive: true });
    // the archive doubles as the tombstone — one file, one truth
    await writeFile(ARCHIVE_PATH(), JSON.stringify({ ...(draft || {}), clearedAt: Date.now(), reason: reason === 'finished' ? 'finished' : 'discarded' }, null, 2), 'utf8');
  } catch { /* best-effort — worst case is the old race, not a new failure */ }
  return { cleared: true, recoverable: !!draft && reason !== 'finished' };
}

// Undo a discard: the archived draft becomes the live draft again.
export async function restoreDiscardedDraft() {
  const a = await getDiscardedDraft();
  if (!a) throw new Error('no discarded workout is available to restore');
  await mkdir(dataRoot(), { recursive: true });
  const draft = { workoutSession: a.workoutSession, editingSessionId: a.editingSessionId || null, savedAt: Date.now(), capturedAt: Date.now() };
  const tmp = DRAFT_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(draft, null, 2), 'utf8');
  await rename(tmp, DRAFT_PATH());
  await unlink(ARCHIVE_PATH()).catch(() => {}); // restored — no longer discarded
  return draft;
}
