import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

const STATE_REL_PATH = 'Wiki/Health/Exercise State.md';

// Fast lookup of "what did I last do for this exact exercise" — this is what
// powers automatic weight/rep carryover into the next session, independent
// of which routine or day of the week the exercise next appears on. The
// full historical record lives in the dated session files (workoutSessions.js);
// this file is just a small, always-fresh cache keyed by exercise id.

function bodyFor(state) {
  const lines = ['# Exercise State', '', 'Last-performed weight/reps per exercise, used to pre-fill your next session. Managed via Nova OS.', ''];
  const entries = Object.values(state).sort((a, b) => (a.name > b.name ? 1 : -1));
  for (const e of entries) {
    const sets = e.lastSets.map((s) => `${s.weight}kg × ${s.reps}`).join(', ');
    lines.push(`- **${e.name}** (${e.lastDate}): ${sets}`);
  }
  return lines.join('\n');
}

// Same iCloud Drive read-staleness workaround used elsewhere (see rotation.js).
let cachedState = null;

async function readFromDisk(vaultPath) {
  const full = path.join(vaultPath, STATE_REL_PATH);
  if (!existsSync(full)) return {};
  const raw = await readFile(full, 'utf8');
  const state = matter(raw).data.state;
  return state && typeof state === 'object' ? state : {};
}

async function getState(vaultPath) {
  if (cachedState === null) cachedState = await readFromDisk(vaultPath);
  return cachedState;
}

async function persist(vaultPath, state) {
  const full = path.join(vaultPath, STATE_REL_PATH);
  const frontmatter = { type: 'exercise-state', updated: new Date().toISOString().slice(0, 10), state };
  const content = matter.stringify(bodyFor(state), frontmatter);
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  await writeFile(full, content, 'utf8');
  cachedState = state;
}

let writeLock = Promise.resolve();
function withWriteLock(fn) {
  const run = writeLock.catch(() => {}).then(fn);
  writeLock = run.catch(() => {});
  return run;
}

export async function loadExerciseState(vaultPath) {
  return getState(vaultPath);
}

// entries: [{ exerciseId, name, date, sets: [{weight, reps}] }]
export async function updateExerciseState(vaultPath, entries) {
  return withWriteLock(async () => {
    const state = { ...(await getState(vaultPath)) };
    for (const e of entries) {
      if (!e.sets.length) continue;
      state[e.exerciseId] = { name: e.name, lastDate: e.date, lastSets: e.sets };
    }
    await persist(vaultPath, state);
    return state;
  });
}
