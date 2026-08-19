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
// THE GHOST-SESSION RACE (found live, 19 Aug): the client debounces draft
// uploads by 1.5s. Discarding a session cancels the PENDING timer and calls
// clear — but an upload already ON THE WIRE can land after the clear and
// resurrect the dead session as a "Workout in progress" banner on every
// device, forever. Clear now leaves a TOMBSTONE with its timestamp, and a
// save whose payload was captured before the tombstone is dropped: the
// deliberate clear wins over the stale echo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'));
const DRAFT_PATH = () => path.join(dataRoot(), 'session-draft.json');
const TOMBSTONE_PATH = () => path.join(dataRoot(), 'session-draft.cleared.json');
const KEEP_MS = 7 * 24 * 3600_000; // same 7-day draft window as the client

async function tombstoneAt() {
  try { return JSON.parse(await readFile(TOMBSTONE_PATH(), 'utf8')).clearedAt || 0; } catch { return 0; }
}

// capturedAt: when the CLIENT snapshotted this state (its savedAt), so an
// in-flight echo of a pre-discard state identifies itself. Absent (older
// clients) falls back to arrival time — the race stays possible for them
// but nothing breaks.
export async function saveSessionDraft({ workoutSession, editingSessionId, capturedAt }) {
  if (!workoutSession || !Array.isArray(workoutSession.exercises)) throw new Error('a session draft needs exercises');
  const captured = Number(capturedAt) || Date.now();
  // strictly BEFORE: an echo's state predates the discard tap by design;
  // a same-instant capture is a genuinely new session and must save
  if (captured < await tombstoneAt()) {
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

export async function clearSessionDraft() {
  try { await unlink(DRAFT_PATH()); } catch { /* already gone */ }
  try {
    await mkdir(dataRoot(), { recursive: true });
    await writeFile(TOMBSTONE_PATH(), JSON.stringify({ clearedAt: Date.now() }), 'utf8');
  } catch { /* best-effort — worst case is the old race, not a new failure */ }
  return { cleared: true };
}
