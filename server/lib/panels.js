import { loadExerciseLibrary } from './exercises.js';
import { atlasFor } from './data/exerciseAtlas.js';
import { cuesFor } from './data/exerciseCues.js';
import { resolveMuscles } from './muscles.js';
import { patternFor } from '../../src/exerciseMotion.js';
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

export const PANEL_TYPES = ['training-week', 'exercise', 'nutrition-week', 'note', 'pulse', 'sessions', 'session'];

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
  // THE SETS, STRUCTURED AS WELL AS WRITTEN (23 Sep 2026). `sets` stays
  // exactly as it was — it is a contract the chat panel and the spoken turn
  // both read, and a string is what they want. `setRows` is the same numbers
  // unjoined, so the card can DRAW the progression instead of printing it:
  // six weeks of 22.5kg→25kg was sitting in this payload as mono text and the
  // card said nothing about whether the lift was moving (review finding 5).
  // `topWeight` is what the session is remembered by; it is computed here
  // rather than in the client so the rail and any future reader agree.
  const recent = sessions.map((s) => {
    const e = s.exercises.find((x) => x.exerciseId === ex.id);
    if (!e) return null;
    const rows = (e.sets || []).map((x) => ({
      weight: Number(x.weight) || 0,
      reps: Number(x.reps) || 0,
      rpe: x.rpe == null ? null : Number(x.rpe),
    }));
    return {
      date: s.date,
      routine: s.routineName,
      sets: rows.map((x) => `${x.weight}×${x.reps}${x.rpe ? '@' + x.rpe : ''}`).join('  '),
      setRows: rows,
      topWeight: rows.length ? Math.max(...rows.map((x) => x.weight)) : null,
      totalReps: rows.reduce((n, x) => n + x.reps, 0),
    };
  }).filter(Boolean);

  const e1rms = estimateE1RMs(await loadSessions(vaultPath, { limit: 12 }));
  const e1 = e1rms.find((x) => x.exerciseId === ex.id) || null;

  // Anatomy: what the lift actually trains, for the body diagram. Absent
  // rather than guessed when the atlas has no entry — a diagram with nothing
  // lit reads as "this trains nothing", so the client shows none at all.
  // A lift the curated atlas does not know (added at runtime, by him or by
  // Coach) takes its anatomy from Coach's research on the library record
  // (lib/exerciseResearch.js); the curated table wins where both exist.
  const a = atlasFor(ex.id);
  const r = ex.research || null;
  const anatomy = a ? resolveMuscles(a.primary, a.secondary) : (r?.primary ? resolveMuscles(r.primary, r.secondary || []) : null);

  return {
    name: ex.name,
    muscleGroup: ex.muscleGroup,
    trackingType: ex.trackingType,
    inRoutines,
    recent,
    e1rm: e1 ? { value: e1.e1rm, delta: e1.delta ?? null } : null,
    // Form cues: HIS come first, always. The seed in exerciseCues.js exists
    // because the field rendered empty on all 135 exercises; a cue he has
    // written for himself is worth more than any default and must never be
    // shadowed by one.
    // his own first, then Coach's research (sourced, newer), then the seed
    cues: ex.cues || r?.cues || cuesFor(ex.id) || null,
    cuesAreHis: !!ex.cues,
    resourceUrl: ex.resourceUrl || null,
    equipment: a?.equipment || r?.equipment || null,
    variations: r?.variations || [],
    repRange: r?.repRange || null,
    researched: r ? { at: r.at || null, sources: r.sources || [] } : null,
    muscles: anatomy && { primary: anatomy.primary, secondary: anatomy.secondary,
      primaryLabels: anatomy.primaryLabels, secondaryLabels: anatomy.secondaryLabels, views: anatomy.views },
    // how the lift MOVES — null for an isometric hold or a shape we cannot
    // classify, which the client renders as a still diagram
    motion: patternFor(ex.name, a?.primary || r?.primary || []),
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

// ONE LOGGED WORKOUT, by date or as "the last <routine>" (3 Oct 2026) —
// the panel mockup 67 screen 3 draws: Monday's workout on the glass while the
// Coach's answer is spoken, its parts lit one at a time (src/glassMarks.js).
//
// Built by code from his session record and nothing else: the routine, the
// date, each lift with its sets (kg, reps, RPE, set type) and the program's
// target for that lift. Working and back-off sets are numbered 1..n, which
// is what "set 3" means when he hears it; a warm-up keeps its numbers but no
// ordinal, so it can never be the set a light lands on.
//
// A record that cannot be found THROWS, with the reason in words: the caller
// shows no panel, and the reason is what the reply can say. Never the
// nearest session dressed up as the one asked for.
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "monday" → the most recent Monday on or before today, as an ISO date
function weekdayDate(word, now = new Date()) {
  const i = WEEKDAY_NAMES.indexOf(String(word || '').toLowerCase());
  if (i < 0) return null;
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  while (d.getDay() !== i) d.setDate(d.getDate() - 1);
  return iso(d);
}

export async function buildSessionPanel(vaultPath, { date = null, routine = null } = {}, { now = new Date() } = {}) {
  const ci = (x) => String(x || '').trim().toLowerCase();
  const raw = String(date || '').trim();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw
    : ci(raw) === 'today' ? iso(now)
      : ci(raw) === 'yesterday' ? iso(new Date(now.getTime() - 86_400_000))
        : raw ? weekdayDate(raw, now) : null;
  if (raw && !day) throw new Error(`"${raw}" is not a date I can find a session by`);
  const want = ci(routine);
  const all = await loadSessions(vaultPath, { limit: 400 });
  const byRoutine = (s) => !want || ci(s.routineName).includes(want) || want.includes(ci(s.routineName));
  const pool = all.filter((s) => (!day || s.date === day) && byRoutine(s));
  const s = pool[0];   // loadSessions is newest first
  if (!s) {
    if (day && want) throw new Error(`no ${routine} session is logged on ${day}`);
    if (day) throw new Error(`no session is logged on ${day}`);
    if (want) throw new Error(`nothing is logged for a routine matching "${routine}"`);
    throw new Error('no sessions are logged yet');
  }

  // the program's prescription for each lift: the routine this session ran,
  // by id first, then by its name
  let targets = new Map();
  try {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines } = await loadRoutines(vaultPath, exercises);
    const r = routines.find((x) => x.id === s.routineId)
      || routines.find((x) => ci(x.name) === ci(s.sourceRoutineName || s.routineName));
    if (r) targets = new Map(r.exercises.map((e) => [e.exerciseId, { sets: e.targetSets, repsLow: e.targetRepsLow, repsHigh: e.targetRepsHigh }]));
  } catch { /* no program to hold the lifts against: the panel says nothing about targets */ }

  const lifts = (s.exercises || []).map((e) => {
    let n = 0;
    const sets = (e.sets || []).map((x) => {
      const type = x.setType === 'warmup' ? 'warmup' : x.setType === 'backoff' ? 'backoff' : 'working';
      return {
        n: type === 'warmup' ? null : ++n,
        kg: Number(x.weight) || 0,
        reps: Number(x.reps) || 0,
        rpe: x.rpe == null ? null : Number(x.rpe),
        type,
      };
    });
    const work = sets.filter((x) => x.n != null);
    const heaviest = work.length ? Math.max(...work.map((x) => x.kg)) : null;
    const t = targets.get(e.exerciseId);
    return {
      name: e.name || e.exerciseId,
      exerciseId: e.exerciseId,
      sets,
      topKg: heaviest && heaviest > 0 ? heaviest : null,
      target: t && Number.isFinite(t.repsLow) ? { sets: t.sets, repsLow: t.repsLow, repsHigh: t.repsHigh ?? t.repsLow } : null,
    };
  }).filter((l) => l.sets.length);
  if (!lifts.length) throw new Error(`the ${s.routineName} session on ${s.date} has no sets in it`);

  const d = new Date(`${s.date}T12:00:00`);
  return {
    sessionId: s.id || null,
    date: s.date,
    weekday: Number.isFinite(d.getTime()) ? WEEKDAY_FULL[d.getDay()] : null,
    routineName: s.routineName || 'Session',
    lifts,
  };
}

// THE JOINT PANEL (3 Oct 2026, mockup 67 screen 5): one composed panel, a
// section per agent that answered, each built from THAT agent's own record.
// What each record makes addressable today:
//   the Coach      a lift trend from his sessions, for the lift its answer
//                  names (top working weight per session, oldest first)
//   the Librarian  the cited note (its title and path) and, when a span its
//                  answer quotes is found word for word in that note, the
//                  passage with the span's offsets; a quote not found in the
//                  note is not highlighted
//   the Researcher its brief's claim (the brief's title) and how many sources
//                  the brief lists
// Anyone else, or a record that offers nothing to point at, gets its own
// words, named, and no highlight. A failed ask gets no section.
const WORDS_LIMIT = 200;
const ownWords = (text) => {
  const t = String(text || '').replace(/^Brief:\s*"[^"]*"\s*/i, '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= WORDS_LIMIT) return t;
  const cut = t.slice(0, WORDS_LIMIT);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '));
  return stop > 60 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, '')} …`;
};
const QUOTE_RE = /[“"]([^”"\n]{12,280})[”"]/g;
const norm = (s) => String(s || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ');

// A quoted span, found in the note's own text. The excerpt is the note's
// words around it (whitespace folded), with the span's offsets INTO the
// excerpt, so the light falls on his words and never on a paraphrase.
export function findPassage(noteText, quotes, { around = 70 } = {}) {
  // his prose, without the page's furniture: headings, list marks, emphasis
  const prose = matter(String(noteText || '')).content
    .split('\n').filter((l) => !/^\s*#{1,6}\s/.test(l)).join('\n')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '').replace(/[*_`>]/g, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a);
  const body = norm(prose).trim();
  const low = body.toLowerCase();
  for (const q of quotes) {
    const want = norm(q).trim().replace(/[.,;:!?]+$/, '');
    if (want.length < 12) continue;
    const at = low.indexOf(want.toLowerCase());
    if (at < 0) continue;
    let from = Math.max(0, at - around);
    let to = Math.min(body.length, at + want.length + around);
    if (from > 0) { const sp = body.indexOf(' ', from); from = sp >= 0 && sp < at ? sp + 1 : from; }
    if (to < body.length) { const sp = body.lastIndexOf(' ', to); to = sp > at + want.length ? sp : to; }
    const excerpt = `${from > 0 ? '… ' : ''}${body.slice(from, to)}${to < body.length ? ' …' : ''}`;
    const lead = from > 0 ? 2 : 0;
    return { excerpt, span: { start: at - from + lead, end: at - from + lead + want.length } };
  }
  return null;
}

export async function buildSourcesPanel(vaultPath, roster, { exerciseNames = null, sessionsLimit = 6 } = {}) {
  // the last answer each agent gave, in the order they were asked
  const latest = new Map();
  for (const a of Array.isArray(roster) ? roster : []) if (a && a.agent && a.ok === true) latest.set(a.agent, a);
  if (latest.size < 1) throw new Error('no agent answered, so there is nothing to compose');
  const sections = [];
  for (const [agent, a] of latest) {
    const answer = String(a.answer || '');
    const words = ownWords(answer);
    let section = null;
    if (agent === 'coach') {
      section = await coachTrend(vaultPath, answer, { exerciseNames, sessionsLimit }).catch(() => null);
    } else if (agent === 'librarian') {
      const cited = (a.citations || []).filter((c) => c && c.exists && c.path);
      if (cited.length) {
        const quotes = [...answer.matchAll(QUOTE_RE)].map((m) => m[1]);
        for (const c of cited) {
          let text = '';
          try { text = await readFile(path.join(vaultPath, c.path), 'utf8'); } catch { continue; }
          const p = quotes.length ? findPassage(text, quotes) : null;
          if (p) { section = { type: 'passage', title: c.title || path.basename(c.path, '.md'), path: c.path, excerpt: p.excerpt, span: p.span, gist: c.title || path.basename(c.path, '.md') }; break; }
        }
        // cited, but no quote checks out: its own words, under the note it cites
        if (!section) section = { type: 'words', words, title: cited[0].title || path.basename(cited[0].path, '.md'), path: cited[0].path, gist: cited[0].title || 'its answer' };
      }
    } else if (agent === 'researcher') {
      const title = (answer.match(/^Brief:\s*"([^"]+)"/i) || [])[1] || '';
      const n = Array.isArray(a.sources) ? a.sources.length : 0;
      if (title || n) section = { type: 'finding', claim: title || words, sourceCount: n, recordId: a.recordId || null, gist: n ? `${n} ${n === 1 ? 'source' : 'sources'}` : 'its brief' };
    }
    if (!section) section = { type: 'words', words, gist: words.split(/(?<=[.!?])\s/)[0].slice(0, 60) };
    sections.push({ agent, ...section });
  }
  return { sections };
}

// The Coach's section: the lift its answer names, read from his sessions.
async function coachTrend(vaultPath, answer, { exerciseNames, sessionsLimit }) {
  const q = String(answer || '').toLowerCase();
  let names = exerciseNames;
  if (!names) {
    const { exercises } = await loadExerciseLibrary(vaultPath);
    names = exercises.map((e) => e.name);
  }
  const named = [...names].filter((n) => String(n || '').trim().length >= 4)
    .sort((a, b) => b.length - a.length)
    .find((n) => q.includes(String(n).toLowerCase()));
  if (!named) return null;
  const ci = (x) => String(x || '').trim().toLowerCase();
  const sessions = (await loadSessions(vaultPath, { limit: 60 }))
    .filter((s) => (s.exercises || []).some((e) => ci(e.name) === ci(named)))
    .slice(0, sessionsLimit)
    .reverse();
  const points = sessions.map((s) => {
    const e = s.exercises.find((x) => ci(x.name) === ci(named));
    const work = (e.sets || []).filter((x) => x.setType !== 'warmup');
    const top = work.length ? Math.max(...work.map((x) => Number(x.weight) || 0)) : 0;
    return { date: s.date, topKg: top };
  }).filter((p) => p.topKg > 0);
  if (points.length < 2) return null;   // one point is not a trend
  const first = points[0].topKg;
  const last = points[points.length - 1].topKg;
  const gist = first === last ? `${last} kg, ${points.length} sessions` : `${first} to ${last} kg`;
  return { type: 'trend', lift: named, points, gist, meta: `your log · ${points.length} sessions` };
}

export async function buildPanel(vaultPath, directive) {
  const type = String(directive?.panel || '').toLowerCase();
  if (!PANEL_TYPES.includes(type)) throw new Error(`unknown panel "${directive?.panel}"`);
  if (type === 'training-week') return { type, data: await buildTrainingWeek(vaultPath) };
  if (type === 'exercise') return { type, data: await buildExercise(vaultPath, directive.name) };
  if (type === 'note') return { type, data: await buildNote(vaultPath, directive.title || directive.name) };
  if (type === 'pulse') return { type, data: await buildPulse(directive.topic) };
  if (type === 'sessions') return { type, data: await buildSessions(vaultPath, directive.routine || directive.name) };
  if (type === 'session') return { type, data: await buildSessionPanel(vaultPath, { date: directive.date, routine: directive.routine || directive.name }) };
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
