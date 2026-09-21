// THE PROGRAM DOSSIER — his actual training program, as a document the other
// agents can be handed.
//
// 21 Sep 2026. He asked Nova for "a review of my current workout program
// including where it falls short, what could be improved, as well as what
// could be cut and why". The plan put three Researchers on the open web and
// its own report opened: "no agent ever saw your actual program — I have no
// file, no exercise list, no set scheme — so the program review you asked for
// hasn't been done at all." Every one of those facts was in the vault. The
// Coach reads them on every turn. The planner simply had no step that could.
//
// This is that step. DETERMINISTIC — no model, no web, no cost: the routines
// with their targets, the weekly schedule, the goals, the training block, the
// analytics the Coach reasons from (weekly hard sets per muscle, PRs,
// plateaus, RPE trend, his own session notes) and the nine audit checks. It
// files as a record like any other step's output, and every later step that
// needs it is handed the text as MATERIAL.
//
// A section that cannot be read is NAMED, never silently dropped — a dossier
// that omits the schedule without saying so would let a Researcher conclude
// he trains three days a week because the block was missing.

import { ABSENT_NOTE } from './contextSections.js';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function cap(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }

// Pure: the routines and schedule, as the program he actually follows.
export function renderProgram({ routines = [], schedule = {}, goals = null } = {}) {
  const byId = new Map(routines.map((r) => [r.id, r]));
  const days = WEEKDAYS.map((d) => {
    const id = schedule?.[d];
    if (!id || id === 'active-rest' || id === 'ACTIVE_REST') return `${cap(d)}: rest`;
    const r = byId.get(id);
    return `${cap(d)}: ${r ? r.name : id}`;
  });
  const trainingDays = WEEKDAYS.filter((d) => schedule?.[d] && schedule[d] !== 'active-rest' && schedule[d] !== 'ACTIVE_REST').length;
  const lines = [
    `WEEKLY SCHEDULE (${trainingDays} training day${trainingDays === 1 ? '' : 's'}${goals?.daysPerWeek ? `; his goal says ${goals.daysPerWeek}` : ''}): ${days.join(' · ')}`,
    '',
    'ROUTINES, AS WRITTEN (sets × rep range per exercise):',
  ];
  for (const r of routines) {
    const ex = (r.exercises || []).map((e) => {
      const sets = e.targetSets ?? '?';
      const lo = e.targetRepsLow, hi = e.targetRepsHigh;
      const reps = lo != null ? (hi != null && hi !== lo ? `${lo}-${hi}` : `${lo}`) : '?';
      const group = e.muscleGroup ? ` [${e.muscleGroup}]` : '';
      return `${e.name} ${sets}×${reps}${group}`;
    });
    const totalSets = (r.exercises || []).reduce((n, e) => n + (Number(e.targetSets) || 0), 0);
    lines.push(`- ${r.name} — ${(r.exercises || []).length} exercises, ${totalSets} working sets: ${ex.join('; ')}`);
  }
  if (!routines.length) lines.push('- (no routines on file)');
  return lines.join('\n');
}

export function renderGoals(goals) {
  if (!goals) return 'GOALS: none on file.';
  const bits = [
    goals.goal ? `goal: ${goals.goal}` : null,
    goals.focus ? `focus: ${goals.focus}` : null,
    goals.daysPerWeek ? `days per week: ${goals.daysPerWeek}` : null,
    goals.equipment ? `equipment: ${goals.equipment}` : null,
    goals.limitations ? `limitations: ${goals.limitations}` : null,
  ].filter(Boolean);
  return `GOALS: ${bits.join('; ') || 'none stated'}.`;
}

/**
 * buildProgramDossier — the program as a document, from the vault.
 * `deps` lets the test hand in readers; production reads the real files.
 * @returns {{ title, body, counts, failed }}
 */
export async function buildProgramDossier(vaultPath, deps = {}) {
  const now = deps.now || new Date();
  const {
    loadExercises = async () => (await import('./exercises.js')).loadExerciseLibrary(vaultPath).then((r) => r.exercises),
    loadRoutines = async (exercises) => (await import('./workouts.js')).loadRoutines(vaultPath, exercises),
    loadGoals = async () => (await import('./fitnessGoals.js')).getFitnessGoals(vaultPath),
    loadBlock = async () => (await import('./trainingBlocks.js')).blockContext(vaultPath),
    loadAnalytics = async () => (await import('./trainingAnalytics.js')).analyticsContext(vaultPath),
    loadAudit = async () => (await import('./coachProgramAudit.js')).auditProgram(vaultPath, { now }),
    loadKnowledge = async () => (await import('./coachKnowledge.js')).knowledgeContext(vaultPath),
  } = deps;

  const failed = [];
  const parts = [];
  let counts = { routines: 0, exercises: 0 };

  let exercises = [];
  try { exercises = await loadExercises(); } catch { failed.push('exercise library'); }
  let goals = null;
  try { goals = await loadGoals(); } catch { failed.push('goals'); }
  try {
    const { routines, schedule } = await loadRoutines(exercises);
    counts = { routines: routines.length, exercises: exercises.length };
    parts.push(renderProgram({ routines, schedule, goals }));
  } catch { failed.push('routines and schedule'); }
  parts.push(renderGoals(goals));
  try { parts.push(await loadBlock()); } catch { failed.push('training block'); }
  try { parts.push(await loadAnalytics()); } catch { failed.push('training analytics'); }
  try {
    const audit = await loadAudit();
    const checks = (audit.checks || []).map((c) => `- [${c.status}] ${c.label}: ${c.detail}`);
    parts.push(`PROGRAM AUDIT (nine deterministic checks over his real history, ${audit.weekOf ? `week of ${audit.weekOf}` : 'this week'}):\n${audit.summary}\n${checks.join('\n')}`);
  } catch { failed.push('program audit'); }
  try {
    // his Coaching Principles + What Works For Hayden — the rules he has
    // asked the Coach to hold him to, so a Researcher's "should" is judged
    // against what he has already decided works for him
    const k = await loadKnowledge();
    if (k) parts.push(k);
  } catch { failed.push('coaching knowledge'); }

  if (failed.length) parts.push(ABSENT_NOTE(failed.map((label) => ({ label }))));

  const date = now.toISOString().slice(0, 10);
  return {
    title: `Program dossier — ${date}`,
    body: `HIS PROGRAM AS OF ${date}, read from the vault by code (no model wrote any of this):\n\n${parts.join('\n\n')}`,
    counts,
    failed,
  };
}
