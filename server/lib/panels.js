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

export const PANEL_TYPES = ['training-week', 'exercise', 'nutrition-week', 'note', 'pulse', 'sessions'];

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
    // knowledge base: form cues + the one curated resource
    cues: ex.cues || null,
    resourceUrl: ex.resourceUrl || null,
  };
}

async function buildNutritionWeek(vaultPath) {
  // Calendar days, not files: an untracked day shows as an honest gap
  // instead of quietly stretching "this week" across 10+ real days.
  const { loadCalendarDays } = await import('./nutritionLog.js');
  const days = await loadCalendarDays(7);
  let floor = null;
  let targetKcal = null;
  try {
    const { profile } = await loadRecipeData(vaultPath);
    floor = profile?.proteinFloorG ?? null;
    targetKcal = profile?.targetKcal ?? null;
  } catch { /* profile line optional */ }
  if (floor == null) floor = [...days].reverse().find((d) => d.floorG != null)?.floorG ?? null;
  const tracked = days.filter((d) => d.p != null);
  const round = (v) => (v != null ? Math.round(v) : null);
  return {
    // all four macros — c and f were stored all along and then dropped here
    days: days.map((d) => ({ date: d.date, p: round(d.p), c: round(d.c), f: round(d.f), kcal: round(d.kcal), floorMet: d.floorMet ?? null })),
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

// The cached pulse for a topic — deterministic render of what the nightly
// runs fetched, self-labelling its age. Fresh research is a different verb.
async function buildPulse(topic) {
  const { getPulse, MAX_TOPICS } = await import('./pulse.js');
  const matches = await getPulse(topic || null);
  const entry = topic ? matches[0] : (await getPulse()).find((e) => !e.overCap);
  if (entry?.overCap) {
    throw new Error(`"${entry.topic}" is not refreshed — it sits past the ${MAX_TOPICS}-topic limit on his Interests page; say so plainly and offer to RESEARCH it now instead`);
  }
  if (!entry || !entry.items?.length) {
    const why = entry?.lastError ? ` (the last refresh failed: ${entry.lastError.message})` : '';
    throw new Error(`no pulse cached${topic ? ` for "${topic}"` : ''}${why} — pulses refresh overnight from his Interests page; offer to RESEARCH it now instead`);
  }
  const ageH = Math.round((Date.now() - new Date(entry.at).getTime()) / 3600e3);
  // a refresh that found nothing new is labelled as such — the items are
  // yesterday's, not reprints wearing a fresh label
  const freshness = entry.newCount === 0
    ? `nothing new — last items from ${entry.lastNewAt ? String(entry.lastNewAt).slice(0, 10) : 'an earlier run'}`
    : null;
  // a failed refresh since these items were fetched is said, not hidden —
  // and it outranks "nothing new", which would otherwise dress a failure up
  // as a quiet day
  const failedSince = entry.lastError && (!entry.at || entry.lastError.at > entry.at) ? `last refresh failed: ${entry.lastError.message}` : null;
  return { topic: entry.topic, ageLabel: ageH < 1 ? 'fresh' : `${ageH}h old`, items: entry.items, freshness: failedSince || freshness };
}

// RECENT SESSIONS — what he actually did, session by session.
//
// The panel that was missing when he asked Nova to "pull up my recent upper
// body sessions" and got speech with nothing to look at. `training-week`
// answers "what is scheduled", `exercise` answers "how is this ONE lift
// going" — neither answers "show me my last few Upper Body workouts", which
// is the most ordinary training question there is.
//
// The routine filter is fuzzy on purpose: he says "upper body", the routine
// is called "Upper Body", and an exact match would fail on the space or the
// case and silently show him everything instead.
async function buildSessions(vaultPath, routineFilter) {
  const ci = (x) => String(x || '').trim().toLowerCase();
  const want = ci(routineFilter);
  const all = await loadSessions(vaultPath, { limit: 30 });
  const matched = want
    ? all.filter((s) => ci(s.routineName).includes(want) || want.includes(ci(s.routineName)))
    : all;
  const sessions = matched.slice(0, 5).map((s) => {
    const exercises = (s.exercises || []).map((e) => {
      const sets = (e.sets || []).filter((x) => x.setType !== 'warmup');
      const best = sets.reduce((b, x) => {
        const w = Number(x.weight) || 0; const r = Number(x.reps) || 0;
        const score = w > 0 ? w * (1 + r / 30) : r;
        return score > (b?.score ?? -1) ? { score, w, r } : b;
      }, null);
      return {
        name: e.name || e.exerciseId,
        setCount: sets.length,
        sets: sets.map((x) => `${x.weight || 0}×${x.reps || 0}${x.rpe != null ? '@' + x.rpe : ''}`).join('  '),
        top: best && best.w > 0 ? `${best.w}kg × ${best.r}` : (best ? `${best.r} reps` : null),
      };
    }).filter((e) => e.setCount > 0);
    return {
      date: s.date,
      routineName: s.routineName || 'Session',
      totalSets: exercises.reduce((n, e) => n + e.setCount, 0),
      exercises,
    };
  });
  // Honest emptiness: say WHICH filter found nothing, never a blank card.
  const note = sessions.length ? null
    : (want ? `Nothing logged for a routine matching "${routineFilter}" in the last 30 sessions.`
      : 'No sessions logged yet.');
  return { filter: routineFilter || null, matchedCount: matched.length, sessions, note };
}

export async function buildPanel(vaultPath, directive) {
  const type = String(directive?.panel || '').toLowerCase();
  if (!PANEL_TYPES.includes(type)) throw new Error(`unknown panel "${directive?.panel}"`);
  if (type === 'training-week') return { type, data: await buildTrainingWeek(vaultPath) };
  if (type === 'exercise') return { type, data: await buildExercise(vaultPath, directive.name) };
  if (type === 'note') return { type, data: await buildNote(vaultPath, directive.title || directive.name) };
  if (type === 'pulse') return { type, data: await buildPulse(directive.topic) };
  if (type === 'sessions') return { type, data: await buildSessions(vaultPath, directive.routine || directive.name) };
  return { type, data: await buildNutritionWeek(vaultPath) };
}

// ---------------------------------------------------------------------------
// EVIDENCE BY DEFAULT.
//
// Panels used to exist only if the MODEL remembered to end its answer with a
// SHOW directive. That made the visual optional, and optional is why he asked
// for his recent Upper Body sessions, got a spoken answer, and had nothing to
// look at while Nova talked — which is the whole problem with keeping up when
// it speaks faster than he can process.
//
// So the fallback is deterministic: code reads the QUESTION and decides what
// evidence belongs on screen. Models decide what to say; code decides what to
// show. It returns null rather than guessing when nothing fits — an
// irrelevant panel is worse than none, and a wrong one is a lie.
//
// Pure and total: the caller passes the names it knows about, so this can be
// tested exhaustively without a vault.
export function inferPanelDirective(question, { routines = [], exercises = [] } = {}) {
  const q = String(question || '').toLowerCase();
  if (!q.trim()) return null;
  const has = (re) => re.test(q);

  // An exercise named outright wins — it is the most specific thing he can
  // ask about. Longest name first so "Incline Dumbbell Bench" is not matched
  // as plain "Bench".
  const named = [...exercises]
    .filter((n) => String(n || '').trim().length >= 4)
    .sort((a, b) => b.length - a.length)
    .find((n) => q.includes(String(n).toLowerCase()));

  // "my last few X sessions" — the routine view he actually asked for.
  const sessionish = has(/\b(session|workout|training)s?\b/) && has(/\b(recent|last|latest|previous|past|pull up|show|history|few)\b/);
  const routine = [...routines]
    .sort((a, b) => b.length - a.length)
    .find((n) => q.includes(String(n).toLowerCase()));
  if (sessionish) return { panel: 'sessions', ...(routine ? { routine } : {}) };
  if (routine && has(/\b(how|what|show|pull up|did|been)\b/) && !named) return { panel: 'sessions', routine };

  if (named && has(/\b(how|what|show|progress|going|lift|heavy|strong|set|rep|weight|e1rm|pr)\b/)) {
    return { panel: 'exercise', name: named };
  }

  if (has(/\b(this week|week'?s|schedule|scheduled|training week|split|next session|what am i (doing|training)|rest day)\b/)) {
    return { panel: 'training-week' };
  }
  if (has(/\b(protein|calories?|kcal|macros?|carbs?|fats?|nutrition|eaten|ate|eating|diet|deficit|surplus)\b/)) {
    return { panel: 'nutrition-week' };
  }
  if (has(/\b(hrv|sleep|slept|steps?|resting heart|recovery|readiness|weight trend|body ?weight)\b/)) {
    return { panel: 'pulse' };
  }
  if (named) return { panel: 'exercise', name: named };
  return null;
}
