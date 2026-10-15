import matter from 'gray-matter';
import { localDateISO } from './localDate.js';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';
import {
  resolveMuscles, auditedRow, suggestPrimary, MUSCLE_GROUPS, canonicalGroup, legacyGroup, NO_SECONDARY,
} from './muscleSecondary.js';

export const LIBRARY_REL_PATH = 'Wiki/Health/Exercise Library.md';

// THE GROUPS (src/muscleTaxonomy.js, 15 Oct 2026): the delt heads and the
// four back groups replaced Shoulders and Back; Adductors and Abductors
// joined; Mobility, Full Body and Grip are filings that never take
// hypertrophy volume (stretching is not a hard set and must never inflate a
// muscle's weekly count). Re-exported here because every server reader has
// always imported the list from the library.
export { MUSCLE_GROUPS };

// A group named on the way IN: a current name as is; an old one ('Shoulders',
// 'Back', from a client still on the old build or a card raised before the
// split) narrowed by the exercise's name to one head of its family.
function groupIn(name, group) {
  const g = canonicalGroup(group);
  if (g) return g;
  return legacyGroup(group) ? suggestPrimary(name, group) : null;
}

// How a set of this exercise is logged. "reps" fields elsewhere in the app
// (session sets, exercise-state carryover) double as seconds when the
// tracking type ends in "_time" — kept as one shape to avoid a second set of
// fields throughout the stack; only the label/visibility in the UI differs.
export const TRACKING_TYPES = ['weight_reps', 'bodyweight_reps', 'weight_time', 'bodyweight_time', 'weighted_bodyweight_reps'];
const DEFAULT_TRACKING_TYPE = 'weight_reps';

// A curated starting set spanning every muscle group — not an exhaustive
// database, just enough to build real routines with. Users can add any
// exercise not listed here via the "+ Create" flow in the picker. Third
// tuple element is trackingType; omitted means the default (weight_reps).
const SEED_EXERCISES = [
  ['Barbell Bench Press', 'Chest'], ['Incline Barbell Bench Press', 'Chest'], ['Decline Barbell Bench Press', 'Chest'],
  ['Dumbbell Bench Press', 'Chest'], ['Incline Dumbbell Press', 'Chest'], ['Dumbbell Flyes', 'Chest'],
  ['Incline Dumbbell Flyes', 'Chest'], ['Cable Crossover', 'Chest'], ['Pec Deck Machine', 'Chest'],
  ['Machine Chest Press', 'Chest'], ['Push-Up', 'Chest'], ['Chest Dip', 'Chest'],

  ['Deadlift', 'Back'], ['Barbell Row', 'Back'], ['Pendlay Row', 'Back'], ['T-Bar Row', 'Back'],
  ['Seated Cable Row', 'Back'], ['One-Arm Dumbbell Row', 'Back'], ['Lat Pulldown', 'Back'],
  ['Wide-Grip Pull-Up', 'Back', 'bodyweight_reps'], ['Pull-Up', 'Back', 'bodyweight_reps'], ['Chin-Up', 'Back', 'bodyweight_reps'], ['Straight-Arm Pulldown', 'Back'],
  ['Face Pull', 'Back'], ['Rack Pull', 'Back'], ['Single-Arm Lat Pulldown', 'Back'],

  ['Barbell Overhead Press', 'Shoulders'], ['Seated Dumbbell Shoulder Press', 'Shoulders'], ['Arnold Press', 'Shoulders'],
  ['Lateral Raise', 'Shoulders'], ['Cable Lateral Raise', 'Shoulders'], ['Front Raise', 'Shoulders'],
  ['Rear Delt Fly', 'Shoulders'], ['Machine Shoulder Press', 'Shoulders'], ['Upright Row', 'Shoulders'],
  ['Push Press', 'Shoulders'], ['Landmine Press', 'Shoulders'],

  ['Barbell Curl', 'Biceps'], ['EZ-Bar Curl', 'Biceps'], ['Dumbbell Curl', 'Biceps'], ['Hammer Curl', 'Biceps'],
  ['Preacher Curl', 'Biceps'], ['Concentration Curl', 'Biceps'], ['Cable Curl', 'Biceps'],
  ['Incline Dumbbell Curl', 'Biceps'], ['Spider Curl', 'Biceps'],

  ['Close-Grip Bench Press', 'Triceps'], ['Tricep Pushdown', 'Triceps'], ['Rope Pushdown', 'Triceps'],
  ['Overhead Tricep Extension', 'Triceps'], ['Skull Crushers', 'Triceps'], ['Dumbbell Kickback', 'Triceps'],
  ['Bench Dip', 'Triceps'], ['Tricep Dip', 'Triceps'], ['Diamond Push-Up', 'Triceps'],

  ['Back Squat', 'Quads'], ['Front Squat', 'Quads'], ['Leg Press', 'Quads'], ['Leg Extension', 'Quads'],
  ['Bulgarian Split Squat', 'Quads', 'weighted_bodyweight_reps'], ['Walking Lunge', 'Quads'], ['Goblet Squat', 'Quads'],
  ['Hack Squat', 'Quads'], ['Step-Up', 'Quads'], ['Sissy Squat', 'Quads'],

  ['Romanian Deadlift', 'Hamstrings'], ['Stiff-Leg Deadlift', 'Hamstrings'], ['Seated Leg Curl', 'Hamstrings'],
  ['Lying Leg Curl', 'Hamstrings'], ['Nordic Curl', 'Hamstrings'], ['Glute-Ham Raise', 'Hamstrings'],
  ['Single-Leg RDL', 'Hamstrings'],

  ['Hip Thrust', 'Glutes'], ['Barbell Glute Bridge', 'Glutes'], ['Cable Glute Kickback', 'Glutes'],
  ['Sumo Deadlift', 'Glutes'], ['Glute Kickback Machine', 'Glutes'], ['Cable Pull-Through', 'Glutes'],
  ['Banded Hip Abduction', 'Glutes'],

  ['Standing Calf Raise', 'Calves'], ['Seated Calf Raise', 'Calves'], ['Leg Press Calf Raise', 'Calves'],
  ['Donkey Calf Raise', 'Calves'],

  ['Plank', 'Abs', 'bodyweight_time'], ['Side Plank', 'Abs', 'bodyweight_time'], ['Crunch', 'Abs'], ['Cable Crunch', 'Abs'],
  ['Hanging Leg Raise', 'Abs'], ['Hanging Knee Raise', 'Abs'], ['Russian Twist', 'Abs'],
  ['Ab Wheel Rollout', 'Abs'], ['Sit-Up', 'Abs'], ['Bicycle Crunch', 'Abs'], ['Mountain Climber', 'Abs'],

  ['Wrist Curl', 'Forearms'], ['Reverse Wrist Curl', 'Forearms'], ["Farmer's Carry", 'Forearms'], ['Dead Hang', 'Forearms', 'bodyweight_time'],

  ['Burpee', 'Full Body'], ['Kettlebell Swing', 'Full Body'], ['Clean and Jerk', 'Full Body'],
  ['Power Clean', 'Full Body'], ['Snatch', 'Full Body'], ['Thruster', 'Full Body'],
  ['Rowing Machine', 'Full Body'], ['Assault Bike', 'Full Body'], ['Jump Rope', 'Full Body'], ['Battle Ropes', 'Full Body'],
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const TRACKING_TYPE_LABEL = {
  weight_reps: 'weight × reps',
  bodyweight_reps: 'bodyweight × reps',
  weight_time: 'weight × time',
  bodyweight_time: 'bodyweight × time',
  weighted_bodyweight_reps: 'weighted bodyweight × reps',
};

function bodyFor(exercises) {
  const lines = ['# Exercise Library', '', 'Managed via Nova OS. Used to build workout routines in Train.', ''];
  // the readable list follows the audited filing (an old 'Back' entry is
  // listed under the group it counts for); anything else is never dropped
  const groupOf = (e) => resolveMuscles(e).muscleGroup;
  const other = [...new Set(exercises.map(groupOf).filter((g) => !MUSCLE_GROUPS.includes(g)))];
  for (const group of [...MUSCLE_GROUPS, ...other]) {
    const inGroup = exercises.filter((e) => groupOf(e) === group);
    if (!inGroup.length) continue;
    lines.push(`## ${group}`, '');
    for (const ex of inGroup) {
      const tt = ex.trackingType || DEFAULT_TRACKING_TYPE;
      lines.push(tt === DEFAULT_TRACKING_TYPE ? `- ${ex.name}` : `- ${ex.name} _(${TRACKING_TYPE_LABEL[tt]})_`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function seedExercises() {
  const taken = new Set();
  return SEED_EXERCISES.map(([name, muscleGroup, trackingType]) => {
    const id = uniqueId(slugify(name), taken);
    taken.add(id);
    // a fresh library files each seed under its audited primary, so a new
    // vault never starts on the old Shoulders/Back names
    return { id, name, muscleGroup: auditedRow(id)?.primary || muscleGroup, trackingType: trackingType || DEFAULT_TRACKING_TYPE };
  });
}

// Cache + iCloud staleness handling + external-edit detection live in the
// shared helper — see vaultStateFile.js. parse/empty return null for a
// missing or invalid library so getExercises can seed it.
function parseLibrary(raw) {
  const exercises = matter(raw).data.exercises;
  if (!Array.isArray(exercises)) return null;
  // Older entries predate the trackingType field — default them rather than
  // requiring a migration.
  return exercises.map((e) => ({ ...e, trackingType: e.trackingType || DEFAULT_TRACKING_TYPE }));
}

// The whole file from its list — pure, so a planner can compute the library
// it WOULD write and hand it to the staged pass (lib/stagedPass.js).
export function renderLibraryFile(exercises) {
  const frontmatter = { type: 'exercise-library', updated: localDateISO(), exercises: exercises.map(storedForm) };
  return matter.stringify(bodyFor(exercises), frontmatter);
}

const stateFile = createVaultStateFile({
  relPath: LIBRARY_REL_PATH,
  parse: parseLibrary,
  empty: () => null,
});

async function persist(vaultPath, exercises) {
  await stateFile.write(vaultPath, renderLibraryFile(exercises), exercises);
}

// Whole-file write for the staged pass, through the state file so the cache
// follows the bytes (see writeRoutinesRaw). A file that does not parse as a
// library is refused — caching null would make the next read re-seed it.
export function writeLibraryRaw(vaultPath, raw) {
  const exercises = parseLibrary(raw);
  if (!exercises) throw new Error('not an exercise library file');
  return withWriteLock(() => stateFile.write(vaultPath, raw, exercises));
}

// Pure halves of the two writers below, for planners that must compute a
// change without writing it. Same rules: a name already in the library is
// that exercise (never a duplicate); an id is minted unique.
export function addExerciseIn(exercises, name, filedGroup, trackingType) {
  const muscleGroup = groupIn(name, filedGroup);
  if (!muscleGroup) throw new Error('invalid muscle group');
  const tt = trackingType || DEFAULT_TRACKING_TYPE;
  if (!TRACKING_TYPES.includes(tt)) throw new Error('invalid tracking type');
  const dupe = exercises.find((e) => e.name.toLowerCase() === String(name).toLowerCase());
  if (dupe) return { exercises, exercise: dupe, created: false };
  const taken = new Set(exercises.map((e) => e.id));
  const exercise = { id: uniqueId(slugify(name), taken), name, muscleGroup, trackingType: tt };
  return { exercises: [...exercises, exercise], exercise, created: true };
}

// A RE-FILE IS HIS OWN MAPPING (15 Oct 2026). The audited table decides an
// exercise's primary at read time, so a re-file that only changed the old
// `muscleGroup` would be silently overruled by the table. It writes `primary`
// too, which is the library's override. `before` is the group it counted
// for; `prior` is the entry exactly as stored, for an undo that puts it back.
// A RE-FILE KEEPS WHAT ELSE THE LIFT TRAINS (16 Oct 2026, his rule). A
// change of primary alone used to drop the audited secondaries: an own
// `primary` with no `secondary` list reads as "trains nothing else"
// (src/muscleCredit.js), so re-filing a row under Lats silently took its ½
// credit away from the upper back and biceps. Now the secondaries it had
// (audited, or his own list) are written onto the entry, minus the new
// primary; only an explicit `secondary` list replaces them. `prior` is the
// entry exactly as stored, which the undo puts back.
export function setMuscleGroupIn(exercises, id, muscleGroup, { secondary } = {}) {
  const idx = exercises.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('no such exercise');
  const group = groupIn(exercises[idx].name, String(muscleGroup || '').trim());
  if (!group) throw new Error(`muscleGroup must be one of: ${MUSCLE_GROUPS.join(', ')}`);
  const prior = storedForm(exercises[idx]);
  const resolved = resolveMuscles(exercises[idx]);
  const before = resolved.muscleGroup || 'Other';
  let keep;
  if (Array.isArray(secondary)) {
    keep = [...new Set(secondary.map((m) => canonicalGroup(m)))];
    if (keep.some((m) => !m)) throw new Error(`secondary muscles must be among: ${MUSCLE_GROUPS.join(', ')}`);
  } else keep = resolved.secondary || [];
  keep = NO_SECONDARY.has(group) ? [] : keep.filter((m) => m !== group && !NO_SECONDARY.has(m));
  const had = resolved.secondary || [];
  const sameSecondary = keep.length === had.length && keep.every((m) => had.includes(m));
  if (before === group && sameSecondary) return { exercises, exercise: exercises[idx], before, prior, unchanged: true };
  const next = [...exercises];
  next[idx] = { ...prior, muscleGroup: group, primary: group, secondary: keep };
  return { exercises: next, exercise: next[idx], before, prior, unchanged: false };
}

// HIS YES TO AN AUDIT CARD (lib/exerciseAudit.js): the approved primary and
// secondaries written onto the entry as his override, from then on counted
// like any audited lift. Pure; the writer below takes the lock.
export function setAuditIn(exercises, id, { primary, secondary = [] }) {
  const idx = exercises.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error('no such exercise');
  const p = canonicalGroup(primary);
  if (!p) throw new Error(`primary must be one of: ${MUSCLE_GROUPS.join(', ')}`);
  const sec = [...new Set((secondary || []).map((m) => canonicalGroup(m)))];
  if (sec.some((m) => !m)) throw new Error(`secondary muscles must be among: ${MUSCLE_GROUPS.join(', ')}`);
  const prior = storedForm(exercises[idx]);
  const next = [...exercises];
  next[idx] = { ...prior, muscleGroup: p, primary: p, secondary: NO_SECONDARY.has(p) ? [] : sec.filter((m) => m !== p && !NO_SECONDARY.has(m)) };
  return { exercises: next, exercise: next[idx], prior };
}

async function getExercises(vaultPath) {
  const fromDisk = await stateFile.load(vaultPath);
  if (fromDisk) return fromDisk;
  const seeded = seedExercises();
  await persist(vaultPath, seeded);
  return seeded;
}

// WHAT EACH LIFT TRAINS, resolved at read time (15 Oct 2026): his own
// approved `primary` / `secondary` on the entry, else the audited table
// (src/muscleAudit.js), else UNAUDITED (`audit: 'pending'`), which counts
// nothing until he approves a mapping. The audited primary also RE-FILES the
// entry (an old 'Back' row reads as Lats or Upper Back), so every past set
// moves with it; nothing is written to the vault. `filedAs` keeps the stored
// filing and the *Source fields say where each part came from, so a writer
// handed this copy stores exactly what was there.
export function resolveLibraryEntry(e) {
  return resolveMuscles(e, { strict: true });
}
// the name phase 1 shipped under
export const resolveSecondary = resolveLibraryEntry;

// the inverse, for every writer: the derived fields never reach the vault,
// the filing goes back as it was stored, and a secondary list is written
// only when it was his own
function storedForm(e) {
  if (!e || typeof e !== 'object') return e;
  const { secondary, secondarySource, primarySource: _primarySource, audit: _audit, filedAs, ...rest } = e;
  if (filedAs !== undefined) rest.muscleGroup = filedAs;
  if (secondary !== undefined && (secondarySource === undefined || secondarySource === 'override')) rest.secondary = secondary;
  return rest;
}

export async function loadExerciseLibrary(vaultPath) {
  return { exercises: (await getExercises(vaultPath)).map(resolveLibraryEntry), muscleGroups: MUSCLE_GROUPS, trackingTypes: TRACKING_TYPES };
}

let writeLock = Promise.resolve();
function withWriteLock(fn) {
  const run = writeLock.catch(() => {}).then(fn);
  writeLock = run.catch(() => {});
  return run;
}

// The knowledge base fields (audit #12): setup/form cues and ONE curated
// resource link per exercise — shown in the exercise panel and mid-session.
// The exercise record was just a name and a muscle group; a coach's exercise
// card never is.
// Re-file an exercise under a different muscle. Every past set logged
// against it moves with it — the weekly volume is computed from the library
// at read time, so a correction is retroactive by construction, which is
// exactly what makes it worth doing. Returns the previous group so the
// change can be undone from the Inbox.
export async function setExerciseMuscleGroup(vaultPath, id, muscleGroup, opts = {}) {
  return withWriteLock(async () => {
    const result = setMuscleGroupIn(await getExercises(vaultPath), id, muscleGroup, opts);
    if (!result.unchanged) await persist(vaultPath, result.exercises);
    const { exercise, before, unchanged, prior } = result;
    return { exercise, before, unchanged, prior };
  });
}

// His approved mapping for one exercise, written as the library's override
// (lib/exerciseAudit.js files the card; this is the write its yes makes).
// `prior` is the entry exactly as it was, which restoreExerciseRecords puts back.
export async function setExerciseAudit(vaultPath, id, mapping) {
  return withWriteLock(async () => {
    const r = setAuditIn(await getExercises(vaultPath), id, mapping);
    await persist(vaultPath, r.exercises);
    return { exercise: resolveLibraryEntry(r.exercise), prior: r.prior };
  });
}

// MANY AT ONCE, ONE WRITE. Filling the 105 exercises that had no form video
// through setExerciseKnowledge would take 105 write locks and leave 105
// backups of the same file — the batch is one lock, one backup, one undo.
//
// Same validation as the single writer, applied before anything is written: a
// bad URL in entry 90 refuses the whole batch rather than leaving the library
// half-updated.
export async function setExerciseResources(vaultPath, entries = []) {
  return withWriteLock(async () => {
    const existing = [...(await getExercises(vaultPath))];
    const byId = new Map(existing.map((e, i) => [e.id, i]));
    const clean = [];
    for (const { id, resourceUrl } of entries) {
      const idx = byId.get(id);
      if (idx === undefined) throw new Error(`no exercise "${id}"`);
      const url = String(resourceUrl || '').trim();
      if (url && !/^https?:\/\//.test(url)) throw new Error(`"${id}" has a resourceUrl that is not an http(s) link`);
      clean.push({ idx, url: url.slice(0, 300) });
    }
    for (const { idx, url } of clean) {
      const e = { ...existing[idx] };
      if (url) e.resourceUrl = url; else delete e.resourceUrl;
      existing[idx] = e;
    }
    await persist(vaultPath, existing);
    return { written: clean.length };
  });
}

export async function setExerciseKnowledge(vaultPath, id, { cues, resourceUrl }) {
  return withWriteLock(async () => {
    const existing = [...(await getExercises(vaultPath))];
    const idx = existing.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('no such exercise');
    const e = { ...existing[idx] };
    if (cues !== undefined) {
      const clean = String(cues || '').trim().slice(0, 300);
      if (clean) e.cues = clean; else delete e.cues;
    }
    if (resourceUrl !== undefined) {
      const url = String(resourceUrl || '').trim();
      if (url && !/^https?:\/\//.test(url)) throw new Error('resourceUrl must be an http(s) link');
      if (url) e.resourceUrl = url.slice(0, 300); else delete e.resourceUrl;
    }
    existing[idx] = e;
    await persist(vaultPath, existing);
    return e;
  });
}

export async function addCustomExercise(vaultPath, name, muscleGroup, trackingType) {
  // validate before taking the lock, as before
  if (!groupIn(name, muscleGroup)) throw new Error('invalid muscle group');
  if (!TRACKING_TYPES.includes(trackingType || DEFAULT_TRACKING_TYPE)) throw new Error('invalid tracking type');
  return withWriteLock(async () => {
    const { exercises, exercise, created } = addExerciseIn(await getExercises(vaultPath), name, muscleGroup, trackingType);
    if (created) await persist(vaultPath, exercises);
    return exercise;
  });
}

// COACH'S RESEARCH, WRITTEN IN ONE GO (25 Sep 2026; lib/exerciseResearch.js
// decides what, this only writes). `updates` put a validated `research`
// object on an existing record, and may re-file a NEW exercise's muscle and
// tracking type (never an established one: his volume history hangs off
// those); `additions` are exercises research found worth adding. One lock,
// one write, and the exact prior of every touched record comes back so the
// Inbox's undo can put each one back as it was.
export async function applyExerciseResearch(vaultPath, { updates = [], additions = [] } = {}) {
  return withWriteLock(async () => {
    let exercises = [...(await getExercises(vaultPath))];
    const priors = {};
    const created = [];
    for (const u of updates) {
      const idx = exercises.findIndex((e) => e.id === u.id);
      if (idx === -1) continue;
      priors[u.id] ??= exercises[idx];
      const next = { ...exercises[idx], research: u.research };
      if (u.muscleGroup && groupIn(next.name, u.muscleGroup)) next.muscleGroup = groupIn(next.name, u.muscleGroup);
      if (u.trackingType && TRACKING_TYPES.includes(u.trackingType)) next.trackingType = u.trackingType;
      exercises[idx] = next;
    }
    for (const a of additions) {
      const r = addExerciseIn(exercises, a.name, a.muscleGroup, a.trackingType);
      if (!r.created) continue; // already there under that name: research never duplicates
      exercises = r.exercises.map((e) => (e.id === r.exercise.id ? { ...e, research: a.research } : e));
      created.push(r.exercise.id);
    }
    if (Object.keys(priors).length || created.length) await persist(vaultPath, exercises);
    return { priors, created, exercises };
  });
}

// The undo of the above: every prior record back exactly, and each exercise
// research added taken out again, unless `keep` names it (the caller keeps
// any a routine or a logged session already points at: history's foreign
// keys are never worth a tidier library).
export async function restoreExerciseRecords(vaultPath, { priors = {}, created = [], keep = [] } = {}) {
  return withWriteLock(async () => {
    const kept = new Set(keep);
    const removed = new Set(created.filter((id) => !kept.has(id)));
    const exercises = (await getExercises(vaultPath))
      .filter((e) => !removed.has(e.id))
      .map((e) => (Object.hasOwn(priors, e.id) ? priors[e.id] : e));
    await persist(vaultPath, exercises);
    return { restored: Object.keys(priors).length, removed: [...removed], kept: [...kept].filter((id) => created.includes(id)) };
  });
}
