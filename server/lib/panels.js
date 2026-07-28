import { loadExerciseLibrary } from './exercises.js';
import { loadRoutines } from './workouts.js';
import { loadSessions } from './workoutSessions.js';
import { estimateE1RMs } from './coach.js';
import { listCarryovers } from './workoutCarryover.js';
import { loadRecentDays as loadNutritionDays } from './nutritionLog.js';
import { loadRecipeData } from './recipes.js';
import { Vault } from './vault.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

// The Companion canvas — Phase 2. The conversational agent NAMES a panel
// with one `SHOW {"panel":...}` line; everything below builds the panel's
// data DETERMINISTICALLY from the vault. The model never draws a number.
// Missing data renders as missing — a panel is a view, never a claim.

export const PANEL_TYPES = ['training-week', 'exercise', 'nutrition-week', 'note'];

export function parseShowDirective(text) {
  const m = (text || '').match(/^\s*SHOW\s+(\{.*\})\s*$/m);
  if (!m) return { cleanText: text, directive: null };
  const cleanText = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    return { cleanText, directive: JSON.parse(m[1]) };
  } catch {
    return { cleanText, directive: null };
  }
}

function pad(n) { return String(n).padStart(2, '0'); }
function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

async function buildTrainingWeek(vaultPath) {
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const { routines, schedule } = await loadRoutines(vaultPath, exercises);
  const byId = new Map(routines.map((r) => [r.id, r.name]));
  const sessions = await loadSessions(vaultPath, { limit: 14 });
  const carryovers = await listCarryovers();

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = iso(d);
    const weekday = WEEKDAY_NAMES[d.getDay()];
    const planId = schedule[weekday];
    const done = sessions.filter((s) => s.date === date).map((s) => ({
      name: s.routineName,
      sets: s.exercises.reduce((n, e) => n + e.sets.length, 0),
    }));
    days.push({
      date,
      weekday: weekday.slice(0, 3).toUpperCase(),
      isToday: i === 0,
      planned: planId === 'active-rest' ? 'Active rest' : planId ? (byId.get(planId) || 'Unknown routine') : 'Rest',
      done,
    });
  }
  return {
    days,
    carryovers: carryovers.map((c) => ({ from: c.sourceRoutineName, due: c.forDate, count: c.exercises.length })),
  };
}

async function buildExercise(vaultPath, name) {
  if (!String(name || '').trim()) throw new Error('the exercise panel needs a name');
  const ci = (s) => String(s || '').trim().toLowerCase();
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const ex = exercises.find((e) => ci(e.name) === ci(name))
    || exercises.find((e) => ci(e.name).includes(ci(name)) || ci(name).includes(ci(e.name)));
  if (!ex) throw new Error(`no exercise called "${name}" in the library`);

  const { routines } = await loadRoutines(vaultPath, exercises);
  const inRoutines = routines.filter((r) => r.exercises.some((e) => e.exerciseId === ex.id)).map((r) => r.name);

  const sessions = await loadSessions(vaultPath, { exerciseId: ex.id, limit: 6 });
  const recent = sessions.map((s) => {
    const e = s.exercises.find((x) => x.exerciseId === ex.id);
    return e ? { date: s.date, routine: s.routineName, sets: e.sets.map((x) => `${x.weight}×${x.reps}${x.rpe ? '@' + x.rpe : ''}`).join('  ') } : null;
  }).filter(Boolean);

  const e1rms = estimateE1RMs(await loadSessions(vaultPath, { limit: 12 }));
  const e1 = e1rms.find((x) => x.exerciseId === ex.id) || null;

  return {
    name: ex.name,
    muscleGroup: ex.muscleGroup,
    trackingType: ex.trackingType,
    inRoutines,
    recent,
    e1rm: e1 ? { value: e1.e1rm, delta: e1.delta ?? null } : null,
  };
}

async function buildNutritionWeek(vaultPath) {
  const days = await loadNutritionDays(7);
  let floor = null;
  let targetKcal = null;
  try {
    const { profile } = await loadRecipeData(vaultPath);
    floor = profile?.proteinFloorG ?? null;
    targetKcal = profile?.targetKcal ?? null;
  } catch { /* profile line optional */ }
  if (floor == null && days.length) floor = days[days.length - 1].floorG ?? null;
  const tracked = days.filter((d) => d.p != null);
  return {
    days: days.map((d) => ({ date: d.date, p: d.p != null ? Math.round(d.p) : null, kcal: d.kcal != null ? Math.round(d.kcal) : null, floorMet: d.floorMet ?? null })),
    floor,
    targetKcal,
    avgP: tracked.length ? Math.round(tracked.reduce((s, d) => s + d.p, 0) / tracked.length) : null,
    metCount: days.filter((d) => d.floorMet === true).length,
    trackedCount: tracked.length,
  };
}

// A real vault note, on screen while it's being discussed — the citation
// made visible. The excerpt is the file's own words, clipped, never a summary.
const EXCERPT_LIMIT = 1400;
async function buildNote(vaultPath, name) {
  if (!String(name || '').trim()) throw new Error('the note panel needs a title');
  const ci = (s) => String(s || '').trim().toLowerCase();
  const base = (p) => path.basename(p, '.md');
  const rels = await new Vault(vaultPath).listRelativePaths();
  const target = rels.find((p) => ci(base(p)) === ci(name))
    || rels.find((p) => ci(base(p)).includes(ci(name)));
  if (!target) throw new Error(`no note called "${name}" in the vault`);
  const raw = await readFile(path.join(vaultPath, target), 'utf8');
  const { content } = matter(raw);
  const body = content.trim();
  return {
    title: base(target),
    relPath: target,
    excerpt: body.length > EXCERPT_LIMIT ? body.slice(0, EXCERPT_LIMIT).trimEnd() + ' …' : body,
    truncated: body.length > EXCERPT_LIMIT,
  };
}

export async function buildPanel(vaultPath, directive) {
  const type = String(directive?.panel || '').toLowerCase();
  if (!PANEL_TYPES.includes(type)) throw new Error(`unknown panel "${directive?.panel}"`);
  if (type === 'training-week') return { type, data: await buildTrainingWeek(vaultPath) };
  if (type === 'exercise') return { type, data: await buildExercise(vaultPath, directive.name) };
  if (type === 'note') return { type, data: await buildNote(vaultPath, directive.title || directive.name) };
  return { type, data: await buildNutritionWeek(vaultPath) };
}
