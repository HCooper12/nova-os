import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';

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

// Cache + iCloud staleness handling + external-edit detection live in the
// shared helper — see vaultStateFile.js.
const stateFile = createVaultStateFile({
  relPath: STATE_REL_PATH,
  parse(raw) {
    const state = matter(raw).data.state;
    return state && typeof state === 'object' ? state : {};
  },
  empty: () => ({}),
});

function getState(vaultPath) {
  return stateFile.load(vaultPath);
}

async function persist(vaultPath, state) {
  const frontmatter = { type: 'exercise-state', updated: new Date().toISOString().slice(0, 10), state };
  const content = matter.stringify(bodyFor(state), frontmatter);
  await stateFile.write(vaultPath, content, state);
}

const withWriteLock = createWriteLock();

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
