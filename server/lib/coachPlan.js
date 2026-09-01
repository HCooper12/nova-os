import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadExerciseLibrary, addExerciseIn, setMuscleGroupIn, renderLibraryFile, writeLibraryRaw, LIBRARY_REL_PATH } from './exercises.js';
import { loadRoutines, loadRoutineData, replaceRoutineEntries, renderRoutinesFile, writeRoutinesRaw, ROUTINES_REL_PATH } from './workouts.js';
import { stampPriors, applyChanges } from './stagedPass.js';
import { modelFor, laneEnabled, laneOffError } from './modelPrefs.js';
import { settleWatchdog } from './settle.js';

// COACH CHANGES THE PLAN — his ask, made real.
//
//   "I should be able to select a button for coach to automatically swap it
//    into my current workout plan rotation … but it should always confirm …
//    and give me an opportunity to type to nova to tell it more information
//    … make sure it is included already in the workout plan as a coach
//    addition highlight so I don't need to remember to make the change."
//
// Doctrine, unchanged from the rest of Nova: MODELS DECIDE, CODE ACTS. The
// only thing that ever mutates a routine is the small set of typed OPS
// below, applied by tested code. The deterministic path (he confirms the
// proposal as-is) never involves a model at all — the fix objects the
// program review already computes carry everything needed. The free-text
// path ("add the new one but keep the old one") hands his words plus the
// proposal to the Coach's model, which must answer in OPS — never in file
// edits — and anything outside the op schema is refused, not improvised.
//
// Every application is UNDOABLE: the record carries the routines file's
// prior bytes, and undo restores them verbatim and clears the highlights. A
// plan change he regrets is one tap back. And every application is ALL OR
// NOTHING — see applyOps: the ops are planned in memory and landed by the
// staged pass, so a failure can never leave the plan half-changed.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const AMEND_BUDGET_USD = '1';

/* ------------------------------ highlights ------------------------------- */
// "COACH" markers on plan entries — presentation metadata (who put this
// here, when, why, what to start at), NOT program truth: the routine file in
// the vault stays the single source of what the program IS. Markers live in
// server/data (operational, derived-adjacent) keyed routineId:exerciseId.

const markersPath = () => path.join(
  process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'),
  'coach-plan-markers.json',
);

export async function readMarkers() {
  try { return JSON.parse(await readFile(markersPath(), 'utf8')); } catch { return {}; }
}

async function writeMarkers(m) {
  await mkdir(path.dirname(markersPath()), { recursive: true }).catch(() => {});
  await writeFile(markersPath(), JSON.stringify(m, null, 2), 'utf8');
}

export async function addMarker(routineId, exerciseId, meta) {
  const m = await readMarkers();
  m[`${routineId}:${exerciseId}`] = { at: new Date().toISOString(), ...meta };
  await writeMarkers(m);
}

export async function clearMarkers(keys) {
  const m = await readMarkers();
  for (const k of keys) delete m[k];
  await writeMarkers(m);
}

/* --------------------------------- ops ----------------------------------- */
// The complete vocabulary of what Coach may do to the plan. Anything a model
// wants that isn't expressible here does not happen.
//
//   swap        {routineId?, exerciseId, replaceWith}   keep the prescription
//   add         {routineId, exerciseId, targetSets?, targetRepsLow?, targetRepsHigh?}
//   remove      {routineId, exerciseId}
//   prescribe   {routineId, exerciseId, targetSets?, targetRepsLow?, targetRepsHigh?}
//   remap       {exerciseId, muscleGroup}
//   new-exercise{name, muscleGroup, trackingType?}      → later ops may use its id via `ref`
//   weighted-variant {exerciseId, startWeightKg?}       the pull-up case, one op

export function validateOps(ops) {
  if (!Array.isArray(ops) || !ops.length) throw new Error('no operations');
  if (ops.length > 12) throw new Error('too many operations for one change');
  const KNOWN = new Set(['swap', 'add', 'remove', 'prescribe', 'remap', 'new-exercise', 'weighted-variant']);
  for (const op of ops) {
    if (!op || !KNOWN.has(op.op)) throw new Error(`unknown operation: ${op?.op}`);
  }
  return ops;
}

// One routine entry swap, pure: same prescription, new exercise.
export function swapEntry(entries, exerciseId, replaceWith) {
  const idx = entries.findIndex((e) => e.exerciseId === exerciseId);
  if (idx === -1) return null;
  if (entries.some((e) => e.exerciseId === replaceWith)) {
    // the target already trains in this routine — a swap would duplicate it,
    // so the old one simply leaves
    return entries.filter((e) => e.exerciseId !== exerciseId);
  }
  const out = [...entries];
  out[idx] = { ...out[idx], exerciseId: replaceWith };
  return out;
}

/* ------------------------------- applier --------------------------------- */

// Apply a list of ops — THE STAGED PASS, in memory (lib/stagedPass.js).
//
// The ops are PLANNED against the live plan without writing a byte: the
// exercise library and the routines are copied, each op transforms the copy,
// and the result is rendered into the two files Coach is allowed to touch.
// Then the shared apply lands them: priors stamped, every file drift-checked
// before any write, all written or none — a write that dies mid-way rolls the
// earlier one back. The applier this replaces wrote through updateRoutine op
// by op, so an op failing at position 3 of 5 left the plan torn, with no
// receipt and no undo.
//
// Returns { summary, undo } — undo carries the routines file's prior bytes
// (restored verbatim), the markers set, and any exercise created.
export async function applyOps(vaultPath, ops, { why = 'Coach change' } = {}) {
  validateOps(ops);
  const plan = await planOps(vaultPath, ops, { why });

  // library first: were the impossible torn state ever to happen, an unused
  // exercise is harmless while a routine naming a missing one is not
  const drafts = [];
  if (plan.libraryChanged) drafts.push({ path: LIBRARY_REL_PATH, kind: 'updated', content: renderLibraryFile(plan.exercises) });
  if (plan.routineIds.length) drafts.push({ path: ROUTINES_REL_PATH, kind: 'updated', content: renderRoutinesFile(plan.data, byId(plan.exercises)) });
  const changes = stampPriors(vaultPath, drafts).map((c) => (c.prior == null ? { ...c, kind: 'new' } : c));
  await applyChanges(vaultPath, changes, { what: "Coach's change", remedy: 'try it again', write: commitVaultState });

  for (const mk of plan.markers) await addMarker(mk.routineId, mk.exerciseId, { why: mk.why, ...(mk.startWeightKg ? { startWeightKg: mk.startWeightKg } : {}) });

  return {
    summary: plan.summary.join('; '),
    undo: {
      kind: 'coach-plan',
      // the routines file back verbatim; the library keeps what was created —
      // sessions may already reference a new exercise, and deleting history's
      // foreign keys is never worth a tidier library
      changes: changes.filter((c) => c.path === ROUTINES_REL_PATH),
      routineIds: plan.routineIds,
      markerKeys: plan.markers.map((m) => `${m.routineId}:${m.exerciseId}`),
      createdExercises: plan.createdExercises,
    },
  };
}

// The two files Coach writes are owned by vaultStateFile modules — a write
// must go through them or the process cache keeps serving the old plan (see
// stagedPass.js). Shared by apply (above) and undo (inbox.undoFiling).
export function commitVaultState(vaultPath, relPath, raw) {
  if (relPath === ROUTINES_REL_PATH) return writeRoutinesRaw(vaultPath, raw);
  if (relPath === LIBRARY_REL_PATH) return writeLibraryRaw(vaultPath, raw);
  throw new Error(`Coach does not write ${relPath}`);
}

const byId = (exercises) => new Map(exercises.map((e) => [e.id, e]));
const entriesOf = (routine) => routine.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, targetRepsLow: e.targetRepsLow, targetRepsHigh: e.targetRepsHigh }));

// Every op against an in-memory copy of the plan. Nothing here writes.
async function planOps(vaultPath, ops, { why }) {
  let { exercises } = await loadExerciseLibrary(vaultPath);
  // the cache's own object comes back — work on a copy, never mutate it
  let data = structuredClone(await loadRoutineData(vaultPath));
  const summary = [];
  const touched = new Set();
  const markers = [];
  const createdExercises = [];
  let libraryChanged = false;
  const refs = {}; // `$new1` style references from new-exercise ops
  const resolveId = (id) => (typeof id === 'string' && id.startsWith('$') ? refs[id] : id) || id;
  const routineNamed = (routineId) => {
    const r = data.routines.find((x) => x.id === routineId);
    if (!r) throw new Error('unknown routine');
    return r;
  };
  const setEntries = (routine, entries) => {
    data = replaceRoutineEntries(data, routine.id, entries, byId(exercises));
    touched.add(routine.id);
  };

  for (const op of ops) {
    if (op.op === 'new-exercise') {
      const r = addExerciseIn(exercises, String(op.name || '').trim(), op.muscleGroup, op.trackingType);
      exercises = r.exercises;
      libraryChanged = libraryChanged || r.created;
      if (op.ref) refs[op.ref] = r.exercise.id;
      createdExercises.push(r.exercise.id);
      summary.push(`added “${r.exercise.name}” to the exercise library`);
      continue;
    }
    if (op.op === 'remap') {
      const r = setMuscleGroupIn(exercises, resolveId(op.exerciseId), op.muscleGroup);
      exercises = r.exercises;
      libraryChanged = libraryChanged || !r.unchanged;
      summary.push(`re-filed ${r.exercise.name} under ${op.muscleGroup} (was ${r.before})`);
      continue;
    }
    if (op.op === 'weighted-variant') {
      // the pull-up case as ONE op: mint the weighted exercise, swap it into
      // every routine that has the bodyweight one, keep the prescription,
      // and carry the starting-load guidance on the highlight
      const base = exercises.find((e) => e.id === resolveId(op.exerciseId));
      if (!base) throw new Error(`unknown exercise: ${op.exerciseId}`);
      const r = addExerciseIn(exercises, `Weighted ${base.name}`, base.muscleGroup, 'weighted_bodyweight_reps');
      exercises = r.exercises;
      libraryChanged = libraryChanged || r.created;
      const variant = r.exercise;
      createdExercises.push(variant.id);
      const startKg = Number(op.startWeightKg) > 0 ? Number(op.startWeightKg) : 5;
      let swapped = 0;
      for (const routine of [...data.routines]) {
        const next = swapEntry(entriesOf(routine), base.id, variant.id);
        if (!next) continue;
        setEntries(routine, next);
        markers.push({ routineId: routine.id, exerciseId: variant.id, why, startWeightKg: startKg });
        swapped++;
      }
      if (!swapped) throw new Error(`${base.name} is not in any routine — nothing to swap`);
      summary.push(`swapped ${base.name} → Weighted ${base.name} in ${swapped} routine${swapped === 1 ? '' : 's'} (start around ${startKg}kg added)`);
      continue;
    }
    if (op.op === 'swap') {
      const from = resolveId(op.exerciseId);
      const to = resolveId(op.replaceWith);
      const toEx = exercises.find((e) => e.id === to);
      const fromEx = exercises.find((e) => e.id === from);
      if (!toEx) throw new Error(`unknown exercise: ${op.replaceWith}`);
      if (!fromEx) throw new Error(`unknown exercise: ${op.exerciseId}`);
      let swapped = 0;
      for (const routine of [...data.routines]) {
        if (op.routineId && routine.id !== op.routineId) continue;
        const next = swapEntry(entriesOf(routine), from, to);
        if (!next) continue;
        setEntries(routine, next);
        markers.push({ routineId: routine.id, exerciseId: to, why });
        swapped++;
      }
      if (!swapped) throw new Error(`${fromEx.name} is not in ${op.routineId ? 'that routine' : 'any routine'} — nothing to swap`);
      summary.push(`swapped ${fromEx.name} → ${toEx.name} in ${swapped} routine${swapped === 1 ? '' : 's'}`);
      continue;
    }
    if (op.op === 'add') {
      const id = resolveId(op.exerciseId);
      const ex = exercises.find((e) => e.id === id);
      if (!ex) throw new Error(`unknown exercise: ${op.exerciseId}`);
      const routine = routineNamed(op.routineId);
      if (routine.exercises.some((e) => e.exerciseId === id)) throw new Error(`${ex.name} is already in ${routine.name}`);
      const entries = entriesOf(routine);
      entries.push({ exerciseId: id, targetSets: Number(op.targetSets) || 3, targetRepsLow: Number(op.targetRepsLow) || 8, targetRepsHigh: Number(op.targetRepsHigh) || Number(op.targetRepsLow) || 12 });
      setEntries(routine, entries);
      markers.push({ routineId: routine.id, exerciseId: id, why });
      summary.push(`added ${ex.name} to ${routine.name}`);
      continue;
    }
    if (op.op === 'remove') {
      const id = resolveId(op.exerciseId);
      const routine = routineNamed(op.routineId);
      const ex = exercises.find((e) => e.id === id);
      if (!routine.exercises.some((e) => e.exerciseId === id)) throw new Error(`${ex?.name || id} is not in ${routine.name}`);
      setEntries(routine, entriesOf(routine).filter((e) => e.exerciseId !== id));
      summary.push(`removed ${ex?.name || id} from ${routine.name}`);
      continue;
    }
    if (op.op === 'prescribe') {
      const id = resolveId(op.exerciseId);
      const routine = routineNamed(op.routineId);
      const entries = entriesOf(routine);
      const entry = entries.find((e) => e.exerciseId === id);
      if (!entry) throw new Error('that exercise is not in the routine');
      if (op.targetSets != null) entry.targetSets = Number(op.targetSets) || entry.targetSets;
      if (op.targetRepsLow != null) entry.targetRepsLow = Number(op.targetRepsLow) || entry.targetRepsLow;
      if (op.targetRepsHigh != null) entry.targetRepsHigh = Number(op.targetRepsHigh) || entry.targetRepsHigh;
      setEntries(routine, entries);
      const ex = exercises.find((e) => e.id === id);
      markers.push({ routineId: routine.id, exerciseId: id, why });
      summary.push(`re-prescribed ${ex?.name || id}: ${entry.targetSets}×${entry.targetRepsLow}-${entry.targetRepsHigh}`);
      continue;
    }
  }

  return { exercises, data, summary, routineIds: [...touched], markers, createdExercises, libraryChanged };
}

// A structured fix (from the program review, or the outgrown focus) into
// ops — the deterministic path, no model anywhere.
export function opsFromFix(fix) {
  if (!fix || !fix.action) return null;
  if (fix.action === 'remap') return [{ op: 'remap', exerciseId: fix.exerciseId, muscleGroup: fix.muscleGroup }];
  if (fix.action === 'swap') return [{ op: 'swap', exerciseId: fix.exerciseId, replaceWith: fix.replaceWith }];
  if (fix.action === 'weighted-variant') return [{ op: 'weighted-variant', exerciseId: fix.exerciseId, startWeightKg: fix.startWeightKg }];
  // "this movement isn't paying for its place" — cutting it is one tap, and
  // fully undoable like every other plan change
  if (fix.action === 'drop' && fix.routineId && fix.exerciseId) return [{ op: 'remove', routineId: fix.routineId, exerciseId: fix.exerciseId }];
  return null; // add-sets, junk-volume and session-bloat stay a conversation:
  // WHICH set or movement to cut is his call, and a coach that silently
  // deletes training is not one you keep
}

/* ---------------------------- the amend path ----------------------------- */
// He typed something. The model reads the proposal + his words + the real
// plan, and answers ONLY in ops. Runs as a job (the UI polls).

const amendJobs = new Map();

export function buildAmendPrompt({ proposal, note, routines, exercises }) {
  const lib = exercises.map((e) => `${e.id} — ${e.name} (${e.muscleGroup})`).join('\n');
  const plan = routines.map((r) => `${r.id} — ${r.name}:\n${r.exercises.map((e) => `  ${e.exerciseId} ${e.targetSets}×${e.targetRepsLow}-${e.targetRepsHigh}`).join('\n')}`).join('\n');
  return `You are Nova's strength Coach. You proposed a program change; Hayden pressed APPLY but added an instruction of his own. Produce the operations that honour BOTH — his instruction always wins where they conflict.

YOUR PROPOSAL: ${proposal}

HAYDEN'S INSTRUCTION: "${note}"

HIS CURRENT PLAN (routineId — name, then entries as exerciseId sets×reps):
${plan}

EXERCISE LIBRARY (id — name (muscle)):
${lib}

Answer with ONLY a JSON array of operations, no prose, no code fences. Allowed operations (nothing else exists — a change you cannot express in these does not happen):
- {"op":"swap","routineId":optional,"exerciseId":"...","replaceWith":"..."}  (omit routineId to swap everywhere it appears)
- {"op":"add","routineId":"...","exerciseId":"...","targetSets":3,"targetRepsLow":8,"targetRepsHigh":12}
- {"op":"remove","routineId":"...","exerciseId":"..."}
- {"op":"prescribe","routineId":"...","exerciseId":"...","targetSets":?,"targetRepsLow":?,"targetRepsHigh":?}
- {"op":"remap","exerciseId":"...","muscleGroup":"..."}
- {"op":"new-exercise","name":"...","muscleGroup":"...","trackingType":"weight_reps|bodyweight_reps|weighted_bodyweight_reps","ref":"$new1"}  (later ops may use "$new1" as an exerciseId)
- {"op":"weighted-variant","exerciseId":"...","startWeightKg":5}

Rules: use ONLY ids from the plan and library above (or a $ref you created). Prefer the smallest change that honours his instruction. If his instruction amounts to "don't do this", answer [] — an empty array means no change, and that is a legitimate answer.`;
}

export function startCoachAmend(vaultPath, { proposal, note, fix, recordId = null }) {
  if (!laneEnabled('coach')) throw laneOffError('coach');
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  amendJobs.set(jobId, job);
  (async () => {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines } = await loadRoutines(vaultPath, exercises);
    const prompt = buildAmendPrompt({ proposal, note, routines, exercises });
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--disallowedTools', 'Bash,Edit,Write,NotebookEdit,Agent,Skill,ToolSearch,WebSearch,WebFetch,Artifact,SendMessage,Workflow',
      '--strict-mcp-config',
      '--output-format', 'json',
      '--max-budget-usd', AMEND_BUDGET_USD,
      '--model', modelFor('coach'), // ALWAYS pinned
      '--no-session-persistence',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    settleWatchdog(child, { label: "Coach's amend", minutes: 5 });
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', async () => {
      try {
        const parsed = JSON.parse(out);
        if (parsed.is_error) throw new Error(parsed.result || 'coach amend failed');
        const text = String(parsed.result || '').trim().replace(/^```json?\s*|\s*```$/g, '');
        const ops = JSON.parse(text);
        if (Array.isArray(ops) && ops.length === 0) {
          job.status = 'ready';
          job.result = { applied: false, summary: 'Coach read your note as “leave the plan alone” — nothing was changed.' };
          return;
        }
        const { summary, undo } = await applyOps(vaultPath, ops, { why: `Coach: ${String(proposal).slice(0, 80)}` });
        // file the record HERE, in the job — if the phone never polls (a
        // backgrounded app), the change and its undo must still be recorded
        if (recordId) {
          const { updateRecord } = await import('./inboxStore.js');
          await updateRecord(recordId, { status: 'filed', destination: 'workout plan', filedAt: new Date().toISOString(), auto: false, error: null, undoData: undo, applySummary: summary }).catch(() => {});
        }
        job.status = 'ready';
        job.result = { applied: true, summary };
      } catch (e) {
        job.status = 'error';
        job.error = e.message;
      }
    });
    child.on('error', (e) => { job.status = 'error'; job.error = e.message; });
  })().catch((e) => { job.status = 'error'; job.error = e.message; });
  return jobId;
}

export function getAmendJob(jobId) {
  return amendJobs.get(jobId) || null;
}
