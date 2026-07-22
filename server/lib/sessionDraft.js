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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const DRAFT_PATH = () => path.join(dataRoot(), 'session-draft.json');
const KEEP_MS = 7 * 24 * 3600_000; // same 7-day draft window as the client

export async function saveSessionDraft({ workoutSession, editingSessionId }) {
  if (!workoutSession || !Array.isArray(workoutSession.exercises)) throw new Error('a session draft needs exercises');
  await mkdir(dataRoot(), { recursive: true });
  const tmp = DRAFT_PATH() + '.tmp';
  const draft = { workoutSession, editingSessionId: editingSessionId || null, savedAt: Date.now() };
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
  return { cleared: true };
}
