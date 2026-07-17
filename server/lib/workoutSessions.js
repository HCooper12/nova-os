import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { createWriteLock } from './vaultStateFile.js';
import { updateExerciseState } from './exerciseState.js';

const SESSIONS_DIR_REL = 'Wiki/Health/Workouts';

function bodyFor(session) {
  const totalSets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
  const totalVolume = session.exercises.reduce((v, e) => v + e.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0);
  const lines = [
    `# ${session.routineName} — ${session.date}`, '',
    `${session.exercises.length} exercises · ${totalSets} sets · ${Math.round(totalVolume)}kg total volume`, '',
  ];
  for (const e of session.exercises) {
    lines.push(`## ${e.name}`, '');
    for (const s of e.sets) lines.push(`- ${s.weight}kg × ${s.reps}`);
    lines.push('');
  }
  return lines.join('\n');
}

// Sessions are one file per completed workout (matching this vault's dated
// journal-entry convention) rather than one shared file — the full history
// is meant to accumulate indefinitely and be individually browsable in
// Obsidian. Cached in memory once listed (same iCloud staleness workaround
// as the single-file vault modules — see vaultStateFile.js), but the
// directory's mtime is checked so a session file added or removed outside
// Nova (e.g. in Obsidian) triggers a rescan instead of staying invisible
// until restart. Nova itself never rewrites session files, only appends new
// ones, so a stale listing can't cause an overwrite.
const GRACE_MS = Number(process.env.NOVA_VAULT_GRACE_MS ?? 10_000);
let cachedSessions = null;
let knownDirMtimeMs = null;
let lastWriteAt = 0;

async function dirMtime(vaultPath) {
  try {
    return (await stat(path.join(vaultPath, SESSIONS_DIR_REL))).mtimeMs;
  } catch {
    return null;
  }
}

async function readAllFromDisk(vaultPath) {
  const dir = path.join(vaultPath, SESSIONS_DIR_REL);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  const sessions = [];
  for (const f of files) {
    const raw = await readFile(path.join(dir, f), 'utf8');
    const data = matter(raw).data;
    if (data && data.type === 'workout-session') sessions.push({ ...data, file: f });
  }
  return sessions;
}

async function getSessions(vaultPath) {
  if (cachedSessions === null) {
    knownDirMtimeMs = await dirMtime(vaultPath);
    cachedSessions = await readAllFromDisk(vaultPath);
    return cachedSessions;
  }
  if (Date.now() - lastWriteAt >= GRACE_MS) {
    const mtime = await dirMtime(vaultPath);
    if (mtime !== knownDirMtimeMs) {
      cachedSessions = await readAllFromDisk(vaultPath);
      knownDirMtimeMs = mtime;
    }
  }
  return cachedSessions;
}

function sortedDesc(sessions) {
  return [...sessions].sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));
}

export async function loadSessions(vaultPath, { routineId, exerciseId, limit } = {}) {
  let sessions = sortedDesc(await getSessions(vaultPath));
  if (routineId) sessions = sessions.filter((s) => s.routineId === routineId);
  if (exerciseId) sessions = sessions.filter((s) => s.exercises.some((e) => e.exerciseId === exerciseId));
  if (limit) sessions = sessions.slice(0, limit);
  return sessions.map(({ file, ...s }) => s);
}

export async function completedCountByRoutine(vaultPath) {
  const sessions = await getSessions(vaultPath);
  const counts = {};
  for (const s of sessions) counts[s.routineId] = (counts[s.routineId] || 0) + 1;
  return counts;
}

const withWriteLock = createWriteLock();

function validateSessionInput(body) {
  if (!body || typeof body.routineId !== 'string' || typeof body.routineName !== 'string' || !body.routineName.trim()) {
    throw new Error('routineId and routineName are required');
  }
  if (!Array.isArray(body.exercises) || !body.exercises.length) throw new Error('at least one exercise is required');
  return body.exercises.map((e) => {
    if (!e || typeof e.exerciseId !== 'string' || typeof e.name !== 'string' || !Array.isArray(e.sets)) {
      throw new Error('each exercise needs exerciseId, name, and a sets array');
    }
    const sets = e.sets
      .map((s) => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 }))
      .filter((s) => s.weight > 0 || s.reps > 0);
    return { exerciseId: e.exerciseId, name: e.name, sets };
  }).filter((e) => e.sets.length);
}

export async function completeSession(vaultPath, input) {
  const exercises = validateSessionInput(input);
  if (!exercises.length) throw new Error('no logged sets to save');

  return withWriteLock(async () => {
    // Snapshot the current list before touching disk — reading it after the
    // write would (on a cold cache) pick up the file this same call is about
    // to write, double-counting it once from disk and once from the append below.
    const current = await getSessions(vaultPath);

    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const session = {
      type: 'workout-session',
      id: randomUUID().slice(0, 8),
      date,
      routineId: input.routineId,
      routineName: input.routineName.trim(),
      exercises,
      finishedAt: now.toISOString(),
    };

    const dir = path.join(vaultPath, SESSIONS_DIR_REL);
    await mkdir(dir, { recursive: true });
    const baseName = `${date} — ${session.routineName}`;
    let fileName = `${baseName}.md`;
    let n = 2;
    while (existsSync(path.join(dir, fileName))) {
      fileName = `${baseName} (${n}).md`;
      n++;
    }
    const full = path.join(dir, fileName);
    const content = matter.stringify(bodyFor(session), session);
    await writeFile(full, content, 'utf8');

    cachedSessions = [...current, { ...session, file: fileName }];
    lastWriteAt = Date.now();
    knownDirMtimeMs = await dirMtime(vaultPath);

    await updateExerciseState(vaultPath, exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, date, sets: e.sets })));

    return session;
  });
}
