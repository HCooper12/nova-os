// COACH RESEARCHES THE EXERCISE LIBRARY (25 Sep 2026).
//
// His words: "If there's an exercise I add/suggest that isn't in the library,
// coach must then always perform optimal research to create and add that
// exercise properly as part of the exercise library. I'd also like coach to
// continue conducting research weekly to find and add exercises to the
// library or improve the details of the current ones or provide alternative
// variations within an exercise (such as slower eccentric movements,
// pausing, etc)."
//
// Why it was needed: every one of his 136 exercises draws its anatomy,
// equipment and 3D movement from a table written into the code by hand
// (data/exerciseAtlas.js), and its cues from another (data/exerciseCues.js).
// A lift added at runtime, by him or by Coach, had neither until a session
// edited the code, so its card was a name and a muscle group.
//
// The contract (models decide, code acts):
//   - the model researches (web-read-only tools) and answers in JSON;
//   - normalizeEntry checks every field against the closed vocabularies
//     (muscles.js, EQUIPMENT, MUSCLE_GROUPS, TRACKING_TYPES) and drops what
//     does not fit, saying so;
//   - exercises.applyExerciseResearch writes it in one go onto the library
//     record's `research` field (his own `cues`, filing and video are never
//     overwritten); only a NEW exercise, never researched and not in the
//     curated atlas, may be re-filed by research, because his volume history
//     hangs off an established lift's filing;
//   - every pass is one filed Inbox record whose Undo puts every record back.
//
// Two ways in: soon after an exercise is created (the picker route calls
// researchSoon; a sweep catches anything Coach created), and once a week, a
// pass that improves the lifts in his program and adds a few worth having.

import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { MUSCLES, EQUIPMENT } from './muscles.js';
import { MUSCLE_GROUPS, TRACKING_TYPES, loadExerciseLibrary, applyExerciseResearch, restoreExerciseRecords } from './exercises.js';
import { atlasFor } from './data/exerciseAtlas.js';
import { recordRun, fromEnvelope } from './modelSpend.js';

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE = () => path.join(dataRoot(), 'exercise-research.json');

// Measured on his library before shipping: one call researching Face Pull
// and finding one new exercise cost $0.61 and took 247 s on Sonnet. No dollar
// ceiling and no wall-clock kill on the call — his standing rule (23 Sep, and
// again 25 Sep for this lane: "No caps at all"); see test/noCaps.test.js.
export const PER_CALL = 3;        // exercises researched in one model call (measured: 2 took 4 minutes)
export const PER_RUN = 4;          // new exercises researched in one pass
export const WEEKLY_IMPROVE = 5;   // program lifts improved per week
export const WEEKLY_DISCOVER = 2;  // exercises added per week, at most
const RESEARCH_TTL_DAYS = 120;     // an improvement older than this is due again

// The anatomy region → the library's filing drawer (the same map as
// src/muscleHue.js ANATOMY_GROUP, pinned by the test).
export const ANATOMY_GROUP = {
  chest: 'Chest',
  'front-delts': 'Shoulders', 'side-delts': 'Shoulders', 'rear-delts': 'Shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  abs: 'Abs', obliques: 'Abs',
  lats: 'Back', traps: 'Back', rhomboids: 'Back', 'lower-back': 'Back',
  glutes: 'Glutes', quads: 'Quads', adductors: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves',
};

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Pure: one researched exercise, checked field by field. Returns the clean
// `research` object plus the filing it argues for, and every problem found.
export function normalizeEntry(raw, { now = new Date(), model = null } = {}) {
  const issues = [];
  const muscles = (list, max) => {
    const out = [];
    for (const id of Array.isArray(list) ? list : []) {
      const m = String(id || '').trim().toLowerCase();
      if (!Object.hasOwn(MUSCLES, m)) { issues.push(`"${id}" is not a muscle on the body map`); continue; }
      if (!out.includes(m)) out.push(m);
    }
    return out.slice(0, max);
  };
  const primary = muscles(raw?.primary, 3);
  const secondary = muscles(raw?.secondary, 4).filter((m) => !primary.includes(m));
  const eq = EQUIPMENT.find((e) => e.toLowerCase() === String(raw?.equipment || '').trim().toLowerCase()) || null;
  if (raw?.equipment && !eq) issues.push(`equipment "${raw.equipment}" is not one of his (${EQUIPMENT.join(', ')})`);
  const cues = str(raw?.cues, 400);
  const lo = Math.round(Number(raw?.repRange?.low));
  const hi = Math.round(Number(raw?.repRange?.high));
  const repRange = Number.isFinite(lo) && Number.isFinite(hi) && lo >= 1 && hi >= lo && hi <= 180 ? { low: lo, high: hi } : null;
  const seen = new Set();
  const variations = (Array.isArray(raw?.variations) ? raw.variations : [])
    .map((v) => ({ name: str(v?.name, 60), how: str(v?.how, 240), why: str(v?.why, 200) }))
    .filter((v) => v.name.length >= 3 && v.how.length >= 10 && !seen.has(slug(v.name)) && seen.add(slug(v.name)))
    .slice(0, 4);
  const sources = (Array.isArray(raw?.sources) ? raw.sources : [])
    .map((u) => String(u || '').trim()).filter((u) => /^https?:\/\/\S+$/.test(u) && u.length <= 300).slice(0, 5);

  let muscleGroup = MUSCLE_GROUPS.includes(raw?.muscleGroup) ? raw.muscleGroup : null;
  if (raw?.muscleGroup && !muscleGroup) issues.push(`"${raw.muscleGroup}" is not a muscle group in his library`);
  // the filing must agree with the anatomy: what the lift is FOR decides the
  // drawer (his reverse-curl lesson), unless it is filed as a whole-body lift
  const anatomical = primary.length ? ANATOMY_GROUP[primary[0]] : null;
  if (anatomical && muscleGroup && muscleGroup !== anatomical && muscleGroup !== 'Full Body' && muscleGroup !== 'Mobility') {
    issues.push(`filed under ${muscleGroup} but its prime mover is ${primary[0]}: filed under ${anatomical}`);
    muscleGroup = anatomical;
  }
  if (!muscleGroup && anatomical) muscleGroup = anatomical;
  const trackingType = TRACKING_TYPES.includes(raw?.trackingType) ? raw.trackingType : null;

  const research = {
    at: now.toISOString(),
    ...(model ? { model } : {}),
    ...(eq ? { equipment: eq } : {}),
    ...(primary.length ? { primary } : {}),
    ...(secondary.length ? { secondary } : {}),
    ...(cues.length >= 20 ? { cues } : {}),
    ...(repRange ? { repRange } : {}),
    ...(variations.length ? { variations } : {}),
    ...(sources.length ? { sources } : {}),
  };
  // research that says nothing is not research
  const substantive = !!(research.primary || research.cues || research.variations);
  return { research, muscleGroup, trackingType, issues, substantive };
}

// Which exercises are new: not in the curated atlas and never researched.
export function pendingNew(exercises) {
  return (exercises || []).filter((e) => !atlasFor(e.id) && !e.research);
}

// Which program lifts the weekly pass improves: never researched, or not for
// a while; his priority muscles first, then the order they appear.
export function improveCandidates(exercises, routines, { priority = new Set(), now = new Date(), limit = WEEKLY_IMPROVE } = {}) {
  const inProgram = new Set((routines || []).flatMap((r) => (r.exercises || []).map((e) => e.exerciseId)));
  const stale = (e) => !e.research?.at || (now - new Date(e.research.at)) / 86_400_000 > RESEARCH_TTL_DAYS;
  return (exercises || [])
    .filter((e) => inProgram.has(e.id) && stale(e))
    .sort((a, b) => Number(priority.has(b.muscleGroup)) - Number(priority.has(a.muscleGroup)))
    .slice(0, limit);
}

export function buildResearchPrompt({ lens = '', targets = [], discover = 0, library = [], him = '' }) {
  const describe = (e) => `- id "${e.id}": ${e.name}, filed under ${e.muscleGroup || 'nothing yet'}, tracked as ${e.trackingType || 'weight_reps'}${pendingNew([e]).length ? ' (NEW: decide its filing and tracking from the evidence)' : ' (ESTABLISHED: its filing stays; research everything else)'}`;
  return `${lens}
You are Hayden's Coach, researching his exercise library. Use web search where it improves the answer: prefer peer-reviewed and EMG evidence and evidence-based coaches (Stronger by Science, Renaissance Periodization, Jeff Nippard, Squat University) over generic fitness blogs. Cite only sources you actually opened. Never invent a source, a muscle or a number.

HIM: ${him || 'hypertrophy, full commercial gym'}

THE VOCABULARY (use exactly these values, nothing else):
- muscleGroup (the filing drawer, decided by what the lift is FOR): ${MUSCLE_GROUPS.join(', ')}
- trackingType: weight_reps (a load for reps), bodyweight_reps, weight_time, bodyweight_time (a hold: reps are seconds), weighted_bodyweight_reps (bodyweight plus added load)
- primary (1-3, what the lift is FOR) and secondary (0-4, what meaningfully helps) muscles: ${Object.keys(MUSCLES).join(', ')}
- equipment: ${EQUIPMENT.join(', ')}

${targets.length ? `TASK A: RESEARCH THESE EXERCISES (one entry each, same id):
${targets.map(describe).join('\n')}
` : ''}${discover ? `TASK ${targets.length ? 'B' : 'A'}: FIND UP TO ${discover} EXERCISES WORTH ADDING. For his priority muscles and his equipment; each one a genuinely different stimulus (angle, resistance profile, loaded stretch) from what he already has, never a renamed duplicate. Fewer is fine; none is fine if nothing earns a place. Not already in his library, which is:
${library.map((e) => e.name).join('; ')}
` : ''}
For every exercise:
- cues: the 2-4 form cues that matter most, short and imperative, in one line separated by " · " (under 400 characters)
- repRange: {"low": n, "high": n}, the range the evidence supports for hypertrophy on this lift (seconds for a hold)
- variations: up to 4 ways to change the stimulus of THIS SAME LIFT when it stalls, led by technique: a slower lowering (tempo, e.g. 3-4 seconds down), a pause (in the stretched position or at peak contraction), lengthened partials, then a grip, stance or angle change. Not a different piece of equipment and not a different exercise. Each {"name", "how", "why"}, "how" precise enough to do in the gym; only ones worth doing
- sources: the URLs you used (up to 5)

Output ONLY this JSON, no fences, no commentary:
{"researched": [{"id": "...", "muscleGroup": "...", "trackingType": "...", "equipment": "...", "primary": [], "secondary": [], "cues": "...", "repRange": {"low": 0, "high": 0}, "variations": [], "sources": []}],
 "discovered": [{"name": "...", "why": "one sentence: the stimulus it adds that he lacks", "muscleGroup": "...", "trackingType": "...", "equipment": "...", "primary": [], "secondary": [], "cues": "...", "repRange": {"low": 0, "high": 0}, "variations": [], "sources": []}]}`;
}

// The CLI, web-read-only, one JSON answer. Cost and failure are reported in
// the numbers the CLI gives, never guessed.
export function runResearchModel(prompt, { model } = {}) {
  return new Promise((resolve, reject) => {
    import('./spawnBoundary.js').then(({ boundaryArgs }) => {
      const child = spawn(CLAUDE_BIN, [
        '-p', prompt,
        '--permission-mode', 'bypassPermissions',
        ...boundaryArgs('WebSearch WebFetch'),
        '--output-format', 'json',
        '--model', model,
        '--no-session-persistence',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', async (code) => {
        let outer = null;
        try { outer = JSON.parse(stdout); } catch { /* not JSON */ }
        if (outer) recordRun('exercise-research', fromEnvelope(outer));
        const cost = outer?.total_cost_usd ?? null;
        if (!outer || outer.is_error || code !== 0) {
          const why = outer?.result || stderr.trim() || `claude exited ${code}`;
          return reject(Object.assign(new Error(`${why}${cost != null ? ` ($${cost.toFixed(2)} spent)` : ''}`), { cost }));
        }
        try {
          const { firstBalancedObjectMatch, parseModelJson } = await import('./jsonSalvage.js');
          const m = firstBalancedObjectMatch(outer.result || '');
          if (!m) throw new Error('no JSON in the research answer');
          resolve({ answer: parseModelJson(m[0]), cost });
        } catch (e) { reject(Object.assign(e, { cost })); }
      });
      child.on('error', reject);
    }).catch(reject);
  });
}

async function loadState() {
  if (!existsSync(STATE())) return {};
  try { return JSON.parse(await readFile(STATE(), 'utf8')) || {}; } catch { return {}; }
}
async function saveState(s) {
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(`${STATE()}.tmp`, JSON.stringify(s, null, 2));
  await rename(`${STATE()}.tmp`, STATE());
}

async function himLine(vaultPath) {
  try {
    const { getFitnessGoals } = await import('./fitnessGoals.js');
    const g = await getFitnessGoals(vaultPath);
    return [g?.goal && `goal: ${g.goal}`, g?.focus && `focus: ${g.focus}`, g?.equipment && `equipment: ${g.equipment}`, g?.limitations && `limitations: ${g.limitations}`].filter(Boolean).join('; ');
  } catch { return ''; }
}

// Pure-ish core: a model answer into library writes. `deps` carries the
// writer so the tests never touch a real vault's lock or a model.
export function planWrites(answer, { exercises, targets, discover, now = new Date(), model = null }) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const newIds = new Set(pendingNew(exercises).map((e) => e.id));
  const targetIds = new Set(targets.map((t) => t.id));
  const updates = [];
  const additions = [];
  const notes = [];
  for (const raw of Array.isArray(answer?.researched) ? answer.researched : []) {
    const ex = byId.get(String(raw?.id || ''));
    if (!ex || !targetIds.has(ex.id)) continue;
    const n = normalizeEntry(raw, { now, model });
    if (!n.substantive) { notes.push(`${ex.name}: nothing usable came back`); continue; }
    const isNew = newIds.has(ex.id);
    const u = { id: ex.id, research: n.research };
    if (isNew && n.muscleGroup && n.muscleGroup !== ex.muscleGroup) { u.muscleGroup = n.muscleGroup; notes.push(`${ex.name} filed under ${n.muscleGroup} (was ${ex.muscleGroup || 'unfiled'})`); }
    if (isNew && n.trackingType && n.trackingType !== ex.trackingType) u.trackingType = n.trackingType;
    if (!isNew && n.muscleGroup && n.muscleGroup !== ex.muscleGroup) notes.push(`${ex.name}: research files it under ${n.muscleGroup}; it stays under ${ex.muscleGroup} until you say so`);
    notes.push(...n.issues.map((i) => `${ex.name}: ${i}`));
    updates.push(u);
  }
  const names = new Set(exercises.map((e) => slug(e.name)));
  for (const raw of (Array.isArray(answer?.discovered) ? answer.discovered : []).slice(0, discover)) {
    const name = str(raw?.name, 80);
    if (name.length < 3 || names.has(slug(name))) continue;
    const n = normalizeEntry(raw, { now, model });
    if (!n.substantive || !n.muscleGroup || !n.research.primary) { notes.push(`${name}: not added, the research was incomplete`); continue; }
    const why = str(raw?.why, 240);
    additions.push({ name, muscleGroup: n.muscleGroup, trackingType: n.trackingType || 'weight_reps', research: { ...n.research, ...(why ? { why } : {}) } });
    names.add(slug(name));
  }
  return { updates, additions, notes };
}

async function fileRecord({ title, destination, undo, notes }) {
  const { createRecord, updateRecord } = await import('./inboxStore.js');
  const now = new Date().toISOString();
  const record = await createRecord({
    id: randomUUID().slice(0, 8), kind: 'exercise-research', text: title, source: 'coach',
    mode: 'auto', status: 'pending', createdAt: now,
    decision: { route: 'exercise-research', confidence: 'high', title, reason: notes.length ? notes.join('; ').slice(0, 600) : 'Coach researched the library', payload: {} },
  });
  return updateRecord(record.id, { status: 'filed', destination, undoData: undo, filedAt: now, auto: true, error: null });
}

// One research pass: targets (existing ids) and/or discoveries, researched,
// checked, written, filed. `deps` injects the model for tests.
export async function researchPass(vaultPath, { targets = [], discover = 0, reason = 'library research' } = {}, deps = {}) {
  const { exercises } = await loadExerciseLibrary(vaultPath);
  if (!targets.length && !discover) return { skipped: true, reason: 'nothing to research' };
  const { modelFor } = await import('./modelPrefs.js');
  const model = deps.model || modelFor('exercise-research');
  let lens = '';
  try { lens = (await import('./lens.js')).NOVA_LENS; } catch { /* the rules below stand alone */ }
  const him = await himLine(vaultPath);
  // PER_CALL exercises to a call (one call is ~4 minutes for two); the
  // discoveries ride with the last call. One record for the whole pass.
  const chunks = [];
  for (let i = 0; i < targets.length; i += PER_CALL) chunks.push(targets.slice(i, i + PER_CALL));
  if (!chunks.length) chunks.push([]);
  const answer = { researched: [], discovered: [] };
  let cost = 0;
  const failed = [];
  for (const [i, chunk] of chunks.entries()) {
    const last = i === chunks.length - 1;
    const prompt = buildResearchPrompt({ lens, targets: chunk, discover: last ? discover : 0, library: exercises, him });
    try {
      const r = await (deps.run || runResearchModel)(prompt, { model });
      cost += Number(r.cost) || 0;
      answer.researched.push(...(r.answer?.researched || []));
      if (last) answer.discovered.push(...(r.answer?.discovered || []));
    } catch (e) {
      // a failed batch keeps what the others found (their cost is spent);
      // only a pass where every batch failed is a failure
      cost += Number(e.cost) || 0;
      failed.push(e);
    }
  }
  if (failed.length === chunks.length) throw Object.assign(failed[0], { cost });
  const { updates, additions, notes } = planWrites(answer, { exercises, targets, discover, model });
  if (failed.length) notes.push(`${failed.length} of ${chunks.length} research batches failed (${failed[0].message.slice(0, 120)}); those exercises are tried again next pass`);
  if (!updates.length && !additions.length) return { written: 0, notes, cost };
  const { priors, created, exercises: after } = await applyExerciseResearch(vaultPath, { updates, additions });
  const name = (id) => after.find((e) => e.id === id)?.name || id;
  const bits = [];
  if (created.length) bits.push(`added ${created.map(name).join(', ')}`);
  if (updates.length) bits.push(`researched ${updates.map((u) => name(u.id)).join(', ')}`);
  const title = `Coach's ${reason}: ${bits.join('; ')}`;
  const record = await fileRecord({ title: title.slice(0, 300), destination: 'exercise library', undo: { kind: 'exercise-research', priors, created }, notes });
  // a new lift gets its form video now rather than tomorrow (exerciseVideos.js,
  // his standing grant for that lane); `deps.videos: false` in the tests,
  // where a yt-dlp search per exercise would outlive the run
  if (created.length && deps.videos !== false) {
    import('./exerciseVideos.js').then(({ fillMissingVideos }) => fillMissingVideos(vaultPath)).catch(() => {});
  }
  return { written: updates.length + created.length, created, updated: updates.map((u) => u.id), notes, cost, recordId: record?.id || null };
}

// The Inbox's Undo for a research record (inbox.js undoFiling).
export async function undoResearch(vaultPath, undo) {
  // an added exercise that a routine or a logged session already points at
  // stays: history's foreign keys are never worth a tidier library
  const created = undo.created || [];
  const used = new Set();
  if (created.length) {
    try {
      const { loadRoutineData } = await import('./workouts.js');
      const { routines } = await loadRoutineData(vaultPath);
      for (const r of routines || []) for (const e of r.exercises || []) used.add(e.exerciseId);
      const { loadSessions } = await import('./workoutSessions.js');
      for (const s of await loadSessions(vaultPath, { limit: 400 })) for (const e of s.exercises || []) used.add(e.exerciseId);
    } catch { created.forEach((id) => used.add(id)); } // unsure: keep them all
  }
  const r = await restoreExerciseRecords(vaultPath, { priors: undo.priors || {}, created, keep: created.filter((id) => used.has(id)) });
  return `the library is back as it was${r.removed.length ? `, and ${r.removed.length} added exercise${r.removed.length === 1 ? ' is' : 's are'} gone again` : ''}${r.kept.length ? ` (${r.kept.length} kept: already in your plan or log)` : ''}`;
}

// New exercises, researched soon after they appear. A failure (his Claude
// limit, the network) waits two hours before trying again.
let running = null;
export async function researchNew(vaultPath, deps = {}) {
  if (running) return running;
  running = (async () => {
    const state = await loadState();
    if (state.lastFailAt && Date.now() - Date.parse(state.lastFailAt) < 2 * 3600_000 && !deps.force) return { skipped: true, reason: 'waiting after a failure' };
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const targets = pendingNew(exercises).slice(0, PER_RUN);
    if (!targets.length) return { skipped: true, reason: 'nothing new' };
    try {
      const out = await researchPass(vaultPath, { targets, reason: 'research on a new exercise' }, deps);
      await saveState({ ...state, lastFailAt: null, lastCost: out.cost ?? null });
      return out;
    } catch (e) {
      await saveState({ ...state, lastFailAt: new Date().toISOString(), lastError: e.message.slice(0, 300), lastCost: e.cost ?? null });
      throw e;
    }
  })().finally(() => { running = null; });
  return running;
}

let soon = null;
export function researchSoon(vaultPath) {
  if (soon) return;
  soon = setTimeout(() => {
    soon = null;
    researchNew(vaultPath).catch((e) => console.error('exercise research failed:', e.message));
  }, 30_000);
  soon.unref?.();
}

// The weekly window opens Sunday 06:00 and stays open to Wednesday night, so
// a Mac asleep on Sunday still gets its pass; the window is keyed by its
// Sunday, so a run on Sunday and a tick on Monday are the same week.
export function weeklyWindow(now = new Date()) {
  const day = now.getDay();
  const open = (day === 0 && now.getHours() >= 6) || (day >= 1 && day <= 3);
  if (!open) return null;
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  const pad = (n) => String(n).padStart(2, '0');
  return `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;
}

// The weekly pass: improve the lifts in his program, add a few worth having.
export async function researchWeekly(vaultPath, deps = {}) {
  const state = await loadState();
  const week = weeklyWindow(deps.now || new Date());
  if (!week && !deps.force) return { skipped: true, reason: 'outside the weekly window' };
  if (week && state.lastWeekly === week && !deps.force) return { skipped: true, reason: 'already ran this week' };
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const { loadRoutines } = await import('./workouts.js');
  const { routines } = await loadRoutines(vaultPath, exercises);
  let priority = new Set();
  try {
    const { goalMuscles } = await import('./trainOverview.js');
    const { getFitnessGoals } = await import('./fitnessGoals.js');
    priority = goalMuscles(await getFitnessGoals(vaultPath));
  } catch { /* no goals: plain order */ }
  const targets = improveCandidates(exercises, routines, { priority });
  const out = await researchPass(vaultPath, { targets, discover: WEEKLY_DISCOVER, reason: 'weekly library research' }, deps);
  await saveState({ ...(await loadState()), lastWeekly: week || state.lastWeekly || null, lastWeeklyCost: out.cost ?? null });
  return out;
}

export function startExerciseResearchScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('exercise-research');
    const { laneSkipped } = await import('./modelPrefs.js');
    if (laneSkipped('exercise-research', 'exercise research')) return;
    try {
      const r = await researchNew(vaultPath);
      if (r?.written) console.log(`exercise research: ${r.written} written${r.cost != null ? ` ($${r.cost.toFixed(2)})` : ''}`);
    } catch (e) { console.error('exercise research (new) failed:', e.message); }
    try {
      const r = await researchWeekly(vaultPath);
      if (r?.written) console.log(`exercise research (weekly): ${r.written} written${r.cost != null ? ` ($${r.cost.toFixed(2)})` : ''}`);
    } catch (e) { console.error('exercise research (weekly) failed:', e.message); }
  };
  // not at boot: a restart mid-session must not start a web research pass
  setTimeout(tick, 10 * 60_000).unref?.();
  setInterval(tick, 30 * 60_000).unref?.();
}
