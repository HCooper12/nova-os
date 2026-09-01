import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { createWriteLock } from './vaultStateFile.js';
import { backupFile } from './backup.js';
import { updateExerciseState, replaceExerciseState } from './exerciseState.js';

const SESSIONS_DIR_REL = 'Wiki/Health/Workouts';

function bodyFor(session) {
  const totalSets = session.exercises.reduce((n, e) => n + e.sets.length, 0);
  const totalVolume = session.exercises.reduce((v, e) => v + e.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0);
  const lines = [
    `# ${session.routineName} — ${session.date}`, '',
    `${session.exercises.length} exercises · ${totalSets} sets · ${Math.round(totalVolume)}kg total volume`, '',
  ];
  // the Coach's one-line read of the session (vs last time, PRs) — written
  // after completion by setSessionSummary; renders as a quote in Obsidian
  if (session.summary) lines.push(`> ${session.summary}`, '');
  if (session.cutShort) lines.push(`> Cut short: ${session.cutShort}`, '');
  for (const e of session.exercises) {
    lines.push(`## ${e.name}`, '');
    if (e.anomaly) lines.push('> off day — excluded from progression signals', '');
    if (e.pain) lines.push(`> ⚠ pain: ${e.pain}`, '');
    if (e.note) lines.push(`> ${e.note}`, '');
    for (const s of e.sets) lines.push(`- ${s.weight}kg × ${s.reps}${s.rpe ? ` @RPE${s.rpe}` : ''}${s.rir != null ? ` (${s.rir} RIR)` : ''}${s.setType === 'warmup' ? ' [warm-up]' : s.setType === 'backoff' ? ' [backoff]' : ''}${s.pain ? ` ⚠ pain${typeof s.pain === 'string' ? `: ${s.pain}` : ''}` : ''}`);
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

// Rewrite one session file in place (history editing). The exercises input
// uses the same shape/filters as completeSession; date/routine identity are
// preserved. Exercise-state prefills are rebuilt from the full remaining
// history afterwards, since this session may have been the newest.
export async function updateSession(vaultPath, sessionId, input) {
  return withWriteLock(async () => {
    const sessions = await getSessions(vaultPath);
    const existing = sessions.find((s) => s.id === sessionId);
    if (!existing) throw new Error('session not found');
    const exercises = validateSessionInput({ routineId: existing.routineId, routineName: existing.routineName, exercises: input.exercises });
    if (!exercises.length) throw new Error('no sets left — delete the session instead');

    const updated = { ...existing, exercises };
    delete updated.file;
    const full = path.join(vaultPath, SESSIONS_DIR_REL, existing.file);
    await backupFile(full); // a session rewrite without a snapshot was the one vault write with no net
    await writeFile(full, matter.stringify(bodyFor(updated), updated), 'utf8');
    cachedSessions = sessions.map((s) => (s.id === sessionId ? { ...updated, file: existing.file } : s));
    lastWriteAt = Date.now();
    knownDirMtimeMs = await dirMtime(vaultPath);
    await rebuildExerciseState(vaultPath, cachedSessions);
    return updated;
  });
}

// Stamp the Coach's deterministic one-liner into the session file itself —
// the history becomes self-describing in Obsidian, not just in the receipt.
export async function setSessionSummary(vaultPath, sessionId, summary) {
  return withWriteLock(async () => {
    const sessions = await getSessions(vaultPath);
    const existing = sessions.find((s) => s.id === sessionId);
    if (!existing) return null; // session gone — the summary is garnish, never an error
    const updated = { ...existing, summary: String(summary).slice(0, 300) };
    delete updated.file;
    const full = path.join(vaultPath, SESSIONS_DIR_REL, existing.file);
    await backupFile(full);
    await writeFile(full, matter.stringify(bodyFor(updated), updated), 'utf8');
    cachedSessions = sessions.map((s) => (s.id === sessionId ? { ...updated, file: existing.file } : s));
    lastWriteAt = Date.now();
    knownDirMtimeMs = await dirMtime(vaultPath);
    return updated;
  });
}

export async function deleteSession(vaultPath, sessionId) {
  return withWriteLock(async () => {
    const sessions = await getSessions(vaultPath);
    const existing = sessions.find((s) => s.id === sessionId);
    if (!existing) throw new Error('session not found');
    const full = path.join(vaultPath, SESSIONS_DIR_REL, existing.file);
    await backupFile(full); // snapshot before the unlink — deletes must be recoverable
    await unlink(full);
    cachedSessions = sessions.filter((s) => s.id !== sessionId);
    lastWriteAt = Date.now();
    knownDirMtimeMs = await dirMtime(vaultPath);
    await rebuildExerciseState(vaultPath, cachedSessions);
    return { deleted: existing.id };
  });
}

// After an edit/delete, "last performed" per exercise must reflect what the
// history actually says now — newest session containing each exercise wins.
async function rebuildExerciseState(vaultPath, sessions) {
  const byExercise = new Map();
  for (const s of sortedDesc(sessions)) {
    for (const e of s.exercises) {
      if (!byExercise.has(e.exerciseId) && e.sets.length) {
        byExercise.set(e.exerciseId, { exerciseId: e.exerciseId, name: e.name, date: s.date, sets: e.sets });
      }
    }
  }
  await replaceExerciseState(vaultPath, [...byExercise.values()]);
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
  // why a session ended early — one of the cockpit's finishing-early chips;
  // the Coach reads these across sessions and opens the restructure talk
  if (typeof body.cutShort === 'string' && body.cutShort.trim()) body.cutShort = body.cutShort.trim().slice(0, 60);
  else delete body.cutShort;
  if (!Array.isArray(body.exercises) || !body.exercises.length) throw new Error('at least one exercise is required');
  return body.exercises.map((e) => {
    if (!e || typeof e.exerciseId !== 'string' || typeof e.name !== 'string' || !Array.isArray(e.sets)) {
      throw new Error('each exercise needs exerciseId, name, and a sets array');
    }
    const sets = e.sets
      // A set explicitly marked not-done is prefill, not history — an
      // exercise skipped for time must leave NO trace in the record.
      .filter((s) => s.done !== false)
      .map((s) => {
        const set = { weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 };
        // optional per-set effort (RPE 1–10) — the best autoregulation signal
        const rpe = Number(s.rpe);
        if (rpe >= 1 && rpe <= 10) set.rpe = Math.round(rpe * 2) / 2;
        // RIR (reps in reserve, 0–6) — the other half of the effort language;
        // some lifters think in RIR, and autoregulated prescriptions use it
        const rir = Number(s.rir);
        if (s.rir != null && rir >= 0 && rir <= 6) set.rir = Math.round(rir * 2) / 2;
        // set type: warm-ups are excluded from volume counting and PRs
        if (['warmup', 'working', 'backoff'].includes(s.setType)) set.setType = s.setType;
        // pain flag — a set that HURT is safety-critical coaching data
        if (s.pain === true) set.pain = true;
        else if (typeof s.pain === 'string' && s.pain.trim()) set.pain = s.pain.trim().slice(0, 80);
        return set;
      })
      .filter((s) => s.weight > 0 || s.reps > 0);
    const out = { exerciseId: e.exerciseId, name: e.name, sets };
    // cockpit fields (P2): a free note, the anomaly flag ("off day — don't
    // learn from this"), and a pain report — all optional, all persisted
    if (typeof e.note === 'string' && e.note.trim()) out.note = e.note.trim().slice(0, 200);
    if (e.anomaly === true) out.anomaly = true;
    if (typeof e.pain === 'string' && e.pain.trim()) out.pain = e.pain.trim().slice(0, 200);
    return out;
  }).filter((e) => e.sets.length);
}

export async function completeSession(vaultPath, input) {
  const exercises = validateSessionInput(input);
  if (!exercises.length) throw new Error('no logged sets to save');

  // A finished session can legitimately arrive TWICE. The client's save rides
  // the offline outbox, so it is a lost RESPONSE — not a lost request — that
  // replays a write the server already committed. Nothing here used to notice:
  // a fresh id was minted every call and the filename fallback below actively
  // filed the twin as "… (2).md", double-counting the exercise state and
  // re-firing the PR ping and the Coach's debrief.
  //
  // So the client stamps ONE clientKey per finish and both paths carry it —
  // money.js's dedupeKey doctrine (an identity the write is idempotent over)
  // applied to a write that had none. A replay returns the session already on
  // disk, untouched, marked `replayed` so the route can stay silent outbound.
  // Two genuinely separate sessions of the same routine on one day still file
  // normally: they carry different keys.
  const clientKey = typeof input.clientKey === 'string' && input.clientKey.trim()
    ? input.clientKey.trim().slice(0, 64)
    : null;

  return withWriteLock(async () => {
    // Snapshot the current list before touching disk — reading it after the
    // write would (on a cold cache) pick up the file this same call is about
    // to write, double-counting it once from disk and once from the append below.
    const current = await getSessions(vaultPath);

    if (clientKey) {
      const prior = current.find((s) => s.clientKey === clientKey);
      if (prior) {
        const { file, ...session } = prior;
        return { ...session, replayed: true };
      }
    }

    const now = new Date();
    // LOCAL date, not UTC — toISOString() stamped yesterday's date on any
    // session finished before ~10am AEST, which broke "done today" streaks,
    // the training-week panel, and carryover logic for morning workouts.
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const session = {
      type: 'workout-session',
      id: randomUUID().slice(0, 8),
      date,
      routineId: input.routineId,
      routineName: input.routineName.trim(),
      exercises,
      ...(input.cutShort ? { cutShort: input.cutShort } : {}),
      ...(clientKey ? { clientKey } : {}),
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
