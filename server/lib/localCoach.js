// THE COACH ON THE MODEL ON THIS MAC (27 Oct 2026). His call that day: "yes"
// to a local Coach that reads his training and ANSWERS on the Mac, and sends
// anything that would CHANGE his program to Claude; and his standing rule,
// "Claude should always be escalated to if the Mac cannot answer"
// (design/LOCAL-NOVA-PLAN.md §4b).
//
// Ask Nova's local turn (lib/localAsk.js) is the template, with what the
// Coach needs on top:
//   - A MAP, NOT THE 88K DUMP. Claude's Coach reads ~88,000 characters of
//     assembled context (lib/coachTurn.js). A 4B model drowns in that, so
//     the prompt carries only what nearly every question needs (who he is in
//     a few lines, WHERE HE STANDS, today's planned session, the deload line,
//     each injury in one line) and everything else is a TOOL: code runs the
//     SAME builders Claude's assembly runs, narrowed to what was asked, each
//     result clipped to TOOL_RESULT_CHARS with an honest "(clipped)" marker.
//   - TODAY IS COMPUTED BY CODE. Asked "what day is it", the 4B invented a
//     date on 27 Oct; the date and weekday sit in the prompt, written by code.
//   - STABLE PREFIX FIRST. The lens and the Coach's rules never change, then
//     the day's facts, then the conversation: Ollama reuses the cached prefix
//     (366 tok/s cold against 1,063 tok/s cached, measured 27 Oct).
//   - IT NEVER WRITES. No PROPOSE, no WITHDRAW, no documents. A change goes
//     to Claude twice over: code's wantsChange() keeps a change request from
//     ever reaching this model (lib/coachTurn.js), and a reply that says
//     `ESCALATE: <why>` or carries any directive is handed up instead of
//     shown. lib/askDispatch.js holdForEscalation does the hand-over on the
//     SAME job id the client is polling, exactly as Ask Nova's does.
//
// Honest by construction: the result says `provider: 'local'`; a failure
// before any text (no model, no memory to load, a timeout, an empty reply)
// is an error with its reason, which the hold turns into Claude's answer
// labelled `escalated: true, reason`.
import { randomUUID } from 'node:crypto';
import { NOVA_LENS } from './lens.js';
import { chatLocal, defaultModel, localModelConfigured, localBackend } from './localModel.js';
import { recordRun } from './modelSpend.js';
import { assertLaneOn, refreshLocalStatus } from './modelPrefs.js';
import { registerAskJob, coachPanelFor } from './claudeCode.js';
import { whereLine } from './register.js';
import { talkPrefsBlock } from './talk.js';
import { localDateISO } from './localDate.js';
import {
  vaultSearch, vaultRead, readToolCalls, sessionTurns, isLocalOnlySession, localTurnsSinceClaude, recordAskTurn,
} from './localAsk.js';
import { parseVisualStream } from '../../src/visualBeats.js';
import { foldReply } from '../../src/turnFold.js';

export const MAX_ROUNDS = 4;               // tool rounds a turn, then a forced answer
export const TOOL_RESULT_CHARS = 2500;     // any one tool result, after its own narrowing
export const PROMPT_BUDGET = 12_000;       // chars of system prompt (lens + rules + facts + conversation)
// The whole conversation a turn sends, in characters. The context window is
// 16,384 tokens since 27 Oct (lib/localModel.js CHAT_CTX); Qwen's tokenizer
// runs ~3.3 characters a token on his English and numbers, the tool schemas
// take ~1.4k tokens and the answer up to 900, so ~46k characters of messages
// is the ceiling with room to spare. Past it, code stops offering tools and
// asks for the answer (never a silent truncation by the server).
export const MESSAGE_BUDGET = 44_000;
export const TURN_TIMEOUT_MS = () => Number(process.env.NOVA_LOCAL_COACH_TIMEOUT_MS || 120_000);
const ANSWER_TOKENS = 900;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ----------------------------- the change gate ----------------------------- */

// WANTS A CHANGE? (27 Oct 2026). Pure, and deliberately conservative: when
// unsure it says NO, because answering here is the default and the model
// itself can still hand up (ESCALATE). Built from his real Coach turns
// (server/test/localCoach.test.js holds both lists). It looks for an ORDER,
// not a topic: "should I drop it back to 2?" and "how should I add volume?"
// are questions about change, answered here; "swap face pulls for rear delt
// flys", "make that change", "alter the program so..." are orders for Claude.
const CHANGE_VERBS = new Set([
  'swap', 'replace', 'switch', 'change', 'alter', 'edit', 'update', 'rename', 'add', 'remove', 'drop', 'cut', 'delete',
  'move', 'shift', 'reschedule', 'schedule', 'make', 'set', 'create', 'build', 'rewrite', 'restructure', 'redo', 'redesign',
  'deload', 'apply', 'log', 'record', 'put', 'take', 'bring', 'increase', 'decrease', 'lower', 'raise', 'bump', 'reduce',
  'propose', 'ensure', 'undo', 'withdraw', 'skip', 'attach', 'retag', 'reorder', 'program', 'plan',
]);
// a sentence that opens on one of these is asking, not ordering
const QUESTION_OPENERS = /^(?:what|whats|what's|why|how|hows|how's|should|would|could i|can i|is|are|was|were|does|did|which|when|where|who|will i|am i)\b/;
// "can you swap…", "could you please add…": a request phrased as a question
const POLITE_ORDER = /^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:just\s+)?(\w+)/;
// "let's create…", "I want you to just add…", "try now to swap…": an order
// only when the verb that follows is a change verb
const LEADS_TO_VERB = [
  /\blet'?s (?:just |now )?(\w+)/,
  /\bi (?:want|need|would like|'d like) you to (?:just |now |please )?(\w+)/,
  /^try (?:now |again )?(?:to )?(\w+)/,
];
const LEAD_FILLER = /^(?:(?:yes|yeah|yep|ok|okay|alright|right|great|perfect|cool|sure|thanks|thank you|please|also|and|then|but|so|now|nova|coach|go ahead and|just|actually|or)\b[\s,—–:;-]*)+/;
// orders that can sit anywhere in a sentence that is not a question
const ANYWHERE = [
  /\bmake (?:the|that|this|these|those|any|all|my|your)?\s*(?:\w+\s+){0,2}changes?\b/,
  /\bmake (?:it|this|that) a change\b/,
  /\bapply (?:the|that|this|these|those|it|them|my|your)\b/,
  /\bpropose\b(?!d)/,
  /\bdeload me\b/,
  /\b(?:change|rewrite|edit|update|alter|redo|rebuild|restructure) my (?:program|plan|routine|split|week|schedule|targets?)\b/,
  /\bset my (?:targets?|goals?|calories|calorie target|protein target|steps? target)\b/,
  /\bgo ahead\b/,
  /\bproceed with\b/,
  /^(?:just )?do it\b/,
];
const VERB_EXCEPTIONS = [
  /^make sure\b/, /^make sense\b/, /^add up\b/, /^take (?:a look|it easy|a break)\b/, /^plan (?:for|ahead)\b/,
  /^set (?:up )?(?:a|an) (?:timer|reminder)\b/, /^drop sets?\b/, /^cut (?:or|vs)\b/,
];

function sentencesOf(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\s+[—–]\s+|;\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Is this question an order to CHANGE his program (or any of his records)?
 *  Pure. Conservative: unsure is false. */
export function wantsChange(question) {
  for (const raw of sentencesOf(question)) {
    const s = raw.toLowerCase().replace(/[’‘]/g, "'").replace(LEAD_FILLER, '').trim();
    if (!s) continue;
    const polite = POLITE_ORDER.exec(s);
    if (polite) {
      if (CHANGE_VERBS.has(polite[1])) return true;
      continue;
    }
    if (/^(?:just )?do it\b/.test(s)) return true;
    if (QUESTION_OPENERS.test(s)) continue;
    const first = s.split(/[\s,:]+/)[0];
    if (CHANGE_VERBS.has(first) && !VERB_EXCEPTIONS.some((re) => re.test(s))) {
      // "plan"/"program" open an order only as a verb ("program me a deload")
      if (!(first === 'plan' || first === 'program') || /^(?:plan|program) (?:me|my|a|an|the)\b/.test(s)) return true;
    }
    for (const re of LEADS_TO_VERB) {
      const m = re.exec(s);
      if (m && CHANGE_VERBS.has(m[1])) return true;
    }
    if (ANYWHERE.some((re) => re.test(s))) return true;
  }
  return false;
}

/* ------------------------------ reading a reply ---------------------------- */

const ESCALATE_RE = /^\s*\**ESCALATE\**\s*[:\-–—]?\s*(.*)$/im;
// lines only Claude's settle can act on: the local Coach never files, so a
// reply carrying one is handed up rather than shown with the line stripped
const DIRECTIVE_RE = /^\s*(PROPOSE|WITHDRAW|CONSULT|RESEARCH|ACT|REFLECT|WATCH|CARD|PLAY)\b/m;
const ARTIFACT_RE = /<<<ARTIFACT|\[\[artifact:/;

/** What the model's reply means: an answer to show, or a hand-up with why. */
export function readCoachReply(text) {
  const t = String(text || '').trim();
  const esc = ESCALATE_RE.exec(t);
  if (esc) {
    const why = esc[1].replace(/[*_`]/g, '').trim().replace(/[.\s]+$/, '');
    return { escalate: true, reason: `the model on this Mac handed it up: ${why || 'it could not answer from what it can read'}` };
  }
  const d = DIRECTIVE_RE.exec(t);
  if (d) {
    return d[1] === 'PROPOSE' || d[1] === 'WITHDRAW'
      ? { escalate: true, reason: 'a change to your program goes to Claude' }
      : { escalate: true, reason: `the answer needed something only Claude does here (${d[1]})` };
  }
  if (ARTIFACT_RE.test(t)) return { escalate: true, reason: 'a document is written by Claude' };
  return { escalate: false, text: t };
}

/* ------------------------------- the prompt -------------------------------- */

const clip = (s, n) => {
  const t = String(s || '').replace(/[ \t]+\n/g, '\n').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Today in words, computed by code: "Tuesday 27 October 2026 (2026-10-27)". */
export function todayLine(now = new Date()) {
  const iso = localDateISO(now);
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d} ${MONTHS[m - 1]} ${y} (${iso})`;
}

const RULES = `You are Nova's Coach: Hayden's strength and conditioning coach. Nova is "he". Right now you run on the small model on his Mac. You answer his questions about his training, recovery and food from his own data. You never change anything yourself.

RULES
- Lead with the answer. Plain words, no markdown, no lists, at most four short sentences.
- Use HIS numbers: from FACTS below, or from a tool result this turn. Never invent a number, weight, set count, date or exercise name. Name exercises exactly as his library does.
- If his data does not cover it, say so in one line. A guess is a failure.
- At most one question, and only about something only he knows.
- Never say you changed, filed, logged or scheduled anything.

TOOLS (read-only; code runs them)
training_log: his logged sessions, optionally one exercise. lift_trend: one lift's weekly best e1RM and verdict. program: every routine, the schedule and his weekly sets per muscle. recovery: HRV, sleep, resting heart rate, steps by day, and the deload signal. nutrition: protein and calories by day against his targets. standing: body fat, phase, weight trend. goals_and_block: his goals, targets, training block and injuries. knowledge: his Coaching Principles and What Works For Hayden pages. anatomy: what a muscle or exercise works. vault_search and vault_read: any note in his vault.
Look before you answer whenever FACTS does not already hold it. At most ${MAX_ROUNDS} rounds of lookups.

HANDING UP
Claude answers anything you should not. End your reply with ONE line
ESCALATE: <why, a few words>
when he asks you to change his program or his records (swap, add, remove, move, sets or reps, schedule, targets, a deload, logging an injury), when he says a change did not land, or when the answer needs research beyond his own data. Then write nothing else. Never write PROPOSE.`;

/** The system prompt for one local Coach turn. Pure: every input is handed
 *  in. History is dropped oldest-first until the whole prompt fits. */
export function buildLocalCoachPrompt({ today = '', facts = '', liveSession = '', place = 'unknown', spoken = false, history = [], talkPrefs = '' } = {}) {
  const head = `${NOVA_LENS}\n\n${RULES}`;
  const tail = [];
  tail.push(`FACTS (computed by code just now; trust them over anything older):\nToday is ${today || todayLine()}.\n${clip(facts, 4200) || '(his facts could not be read right now)'}`);
  if (liveSession) tail.push(clip(liveSession, 1200));
  // how he wants to be spoken to (his About You page), as Claude's Coach has it
  if (talkPrefs) tail.push(clip(talkPrefs, 700));
  const wl = whereLine(place);
  if (wl) tail.push(wl);
  if (spoken) tail.push('He is listening, not reading: two short spoken sentences, no symbols.');
  const fixed = `${head}\n\n${tail.join('\n\n')}`;
  const turns = (history || []).slice(-6).map((t) => `He: ${clip(t.q, 300)}\nCoach: ${clip(t.a, 600)}`);
  let convo = '';
  while (turns.length) {
    convo = `EARLIER IN THIS CONVERSATION:\n${turns.join('\n')}`;
    if (fixed.length + 2 + convo.length <= PROMPT_BUDGET) break;
    turns.shift();
    convo = '';
  }
  const out = convo ? `${fixed}\n\n${convo}` : fixed;
  return out.length > PROMPT_BUDGET ? out.slice(0, PROMPT_BUDGET) : out;
}

/* ------------------------------- the facts --------------------------------- */

const SHORT_DAY = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const repsOf = (e) => (e.targetRepsLow && e.targetRepsHigh && e.targetRepsLow !== e.targetRepsHigh ? `${e.targetRepsLow}-${e.targetRepsHigh}` : `${e.targetRepsLow || e.targetRepsHigh || '?'}`);

// The always-on block, every line from a builder Claude's Coach reads too.
// A section that fails says so in its own words (the fleet's honesty rule,
// lib/contextSections.js), never silently.
export async function coachFacts(vaultPath, { now = new Date() } = {}) {
  const lines = [];
  const missing = [];
  try {
    const { profileContext } = await import('./profile.js');
    const p = await profileContext(vaultPath);
    const keep = String(p).split('\n').filter((l) => /^- (About me|What I'm working toward|Current focus|Priorities right now)\b/.test(l))
      .map((l) => clip(l.replace(/\(drafted by Claude[^)]*\)\s*/, ''), 320));
    if (keep.length) lines.push(`WHO HE IS:\n${keep.join('\n')}`);
  } catch { missing.push('his profile'); }
  try {
    const { standingContext } = await import('./bodyComp.js');
    // the headline lines, each key once: the Monday fuel review appends its
    // own "Weight"/"Body fat" notes under the same names, which read as a
    // contradiction to a small model
    const seenKey = new Set();
    const s = String(await standingContext(vaultPath)).split('\n').filter((l) => {
      const k = /^- (Body fat|Phase|Training|Weight|Sleep|HRV|Steps)\b/.exec(l)?.[1];
      if (!k || seenKey.has(k)) return false;
      seenKey.add(k);
      return true;
    });
    if (s.length) lines.push(`WHERE HE STANDS (28 days):\n${s.map((l) => clip(l, 200)).join('\n')}`);
  } catch { missing.push('where he stands'); }
  try {
    const { loadExerciseLibrary } = await import('./exercises.js');
    const { loadRoutines, WEEKDAYS, ACTIVE_REST } = await import('./workouts.js');
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const { routines, schedule } = await loadRoutines(vaultPath, exercises);
    const iso = localDateISO(now);
    const [y, m, d] = iso.split('-').map(Number);
    const wd = WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
    const id = schedule?.[wd];
    const r = routines.find((x) => x.id === id);
    if (id === ACTIVE_REST) lines.push('TODAY\'S PLAN: active rest.');
    else if (!r) lines.push('TODAY\'S PLAN: a rest day (nothing scheduled).');
    else lines.push(`TODAY'S PLAN: ${r.name}: ${r.exercises.map((e) => `${e.name} ${e.targetSets}x${repsOf(e)}`).join('; ')}.`);
    const week = WEEKDAYS.map((day) => {
      const sid = schedule?.[day];
      const name = sid === ACTIVE_REST ? 'active rest' : routines.find((x) => x.id === sid)?.name || 'rest';
      return `${SHORT_DAY[day]} ${name}`;
    });
    lines.push(`HIS WEEK: ${week.join(', ')}.`);
  } catch { missing.push('his program'); }
  try {
    const { loadSessions } = await import('./workoutSessions.js');
    const last = (await loadSessions(vaultPath, { limit: 1 }))[0];
    if (last) lines.push(`LAST SESSION: ${last.date} ${last.routineName}.`);
  } catch { missing.push('his last session'); }
  try {
    const { loadRecentDays } = await import('./healthData.js');
    const { computeDeloadSignal } = await import('./coach.js');
    const signal = computeDeloadSignal(await loadRecentDays(14), { now });
    lines.push(`DELOAD SIGNAL: ${signal.advise ? 'YES, ' : 'no, '}${signal.reason}.`);
  } catch { missing.push('the deload signal'); }
  try {
    const { listInjuries } = await import('./injuryLog.js');
    const open = (await listInjuries(vaultPath)).filter((i) => !i.resolvedAt);
    lines.push(open.length
      ? `INJURIES:\n${open.map((i) => `- ${i.area} (${i.severity}, since ${i.startedAt}): ${clip(String(i.note || '').split(/(?<=[.!?])\s/)[0], 160)}`).join('\n')}`
      : 'INJURIES: none open.');
  } catch { missing.push('the injury log'); }
  if (missing.length) lines.push(`COULD NOT BE READ THIS TURN: ${missing.join(', ')}. Say so if it matters; never fill the gap.`);
  return lines.join('\n');
}

/* -------------------------------- the tools -------------------------------- */

const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
export const TOOLS = [
  fn('training_log', 'His logged sessions, newest first: every set as kg x reps @RPE, and his notes. Narrow to one exercise.', {
    exercise: { type: 'string', description: 'an exercise name, or part of one' }, weeks: { type: 'integer', description: 'how many weeks back, 1-12 (default 4)' },
  }),
  fn('lift_trend', 'One lift over 12 weeks: best e1RM per week, the 4-week change and a verdict (rising, flat, falling).', { exercise: { type: 'string' } }, ['exercise']),
  fn('program', 'Every routine in week order with sets x reps, the rest days, and his weekly hard sets per muscle against the growth range.'),
  fn('recovery', 'HRV, sleep, resting heart rate and steps by day, and the deload signal.', { days: { type: 'integer', description: '1-28 (default 7)' } }),
  fn('nutrition', 'Protein and calories by day against his targets.', { days: { type: 'integer', description: '1-28 (default 7)' } }),
  fn('standing', 'Where he stands: body fat, phase, weight trend, steps, sleep, HRV, the strategy line.'),
  fn('goals_and_block', 'His goals, goal muscles, measurable targets, the training block and his injuries.'),
  fn('knowledge', 'Search his Coaching Principles and What Works For Hayden pages.', { query: { type: 'string' } }, ['query']),
  fn('anatomy', 'What a muscle or an exercise works, from the atlas his 3D figure uses.', { muscle_or_exercise: { type: 'string' } }, ['muscle_or_exercise']),
  fn('vault_search', 'Find lines in his vault notes that contain the words.', { query: { type: 'string' } }, ['query']),
  fn('vault_read', 'Read up to 120 lines of one vault page.', { path: { type: 'string' }, from: { type: 'integer' } }, ['path']),
];

// A builder written for Claude's Coach can carry instructions only Claude may
// follow ("PROPOSE {...} to start one"). The local Coach never sees them: a
// sentence naming a directive is dropped, the facts around it kept.
export function forLocal(text) {
  return String(text || '').split('\n').map((line) => {
    if (!/\b(PROPOSE|WITHDRAW|CONSULT)\b/.test(line)) return line;
    return line.split(/(?<=[.!?])\s+/).filter((s) => !/\b(PROPOSE|WITHDRAW|CONSULT)\b/.test(s)).join(' ');
  }).filter((l, i, all) => l.trim() || (i > 0 && all[i - 1].trim())).join('\n').trim();
}

/** Clip one tool result honestly. */
export function clipResult(text, n = TOOL_RESULT_CHARS) {
  const t = String(text || '').trim();
  if (t.length <= n) return t;
  const marker = '\n(clipped: ask a narrower question for the rest)';
  return `${t.slice(0, n - marker.length)}${marker}`;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokensOf = (s) => norm(s).split(' ').filter((w) => w.length > 1);

/** His library names that a phrase means: an exact name, or every name that
 *  holds all its words ("bench" → both bench presses). Unknown → []. */
export function matchExercises(phrase, names) {
  const q = norm(phrase);
  if (!q) return [];
  const exact = names.filter((n) => norm(n) === q);
  if (exact.length) return exact;
  const words = tokensOf(phrase);
  // a trailing s is the same lift ("pull ups" = "Pull-Up")
  const stem = (w) => w.replace(/s$/, '');
  const has = (n) => { const nt = tokensOf(n).map(stem); return words.every((w) => nt.some((t) => t === stem(w) || t.startsWith(stem(w)))); };
  return names.filter(has).slice(0, 6);
}

/** The nearest real names to an unknown one: shared words first, then the
 *  closest spelling (character bigrams). */
export function nearestExercises(phrase, names, k = 3) {
  const words = new Set(tokensOf(phrase));
  const bigrams = (s) => { const t = norm(s).replace(/ /g, ''); const out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; };
  const qb = bigrams(phrase);
  return names.map((n) => {
    const nt = tokensOf(n);
    const shared = nt.filter((w) => words.has(w)).length;
    const nb = bigrams(n);
    let inter = 0;
    for (const b of qb) if (nb.has(b)) inter += 1;
    const dice = (2 * inter) / Math.max(1, qb.size + nb.size);
    return { n, score: shared + dice };
  }).filter((x) => x.score > 0.2).sort((a, b) => b.score - a.score || a.n.localeCompare(b.n)).slice(0, k).map((x) => x.n);
}

async function libraryNames(vaultPath) {
  const { loadExerciseLibrary } = await import('./exercises.js');
  const { exercises } = await loadExerciseLibrary(vaultPath);
  return exercises.map((e) => e.name);
}

function unknownExercise(phrase, names) {
  const near = nearestExercises(phrase, names);
  return `There is no exercise called "${phrase}" in his library.${near.length ? ` The nearest real names: ${near.join('; ')}.` : ''} Use one of those names exactly.`;
}

const intIn = (v, lo, hi, dflt) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const setText = (x) => `${x.weight ?? 0}x${x.reps ?? 0}${x.rpe ? `@${x.rpe}` : ''}${x.setType === 'drop' ? ' drop' : x.setType === 'warmup' ? ' warm-up' : ''}`;

async function trainingLog(vaultPath, { exercise, weeks } = {}) {
  const { loadSessions } = await import('./workoutSessions.js');
  const w = intIn(weeks, 1, 12, 4);
  const since = localDateISO(new Date(Date.now() - w * 7 * 86_400_000));
  let wanted = null;
  if (String(exercise || '').trim()) {
    const names = await libraryNames(vaultPath);
    wanted = matchExercises(exercise, names);
    if (!wanted.length) return unknownExercise(exercise, names);
  }
  const sessions = (await loadSessions(vaultPath)).filter((s) => String(s.date) >= since)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const lines = [];
  for (const s of sessions) {
    const exs = (s.exercises || []).filter((e) => !wanted || wanted.includes(e.name));
    if (!exs.length) continue;
    lines.push(`${s.date} ${s.routineName || ''}: ${exs.map((e) => `${e.name} ${(e.sets || []).map(setText).join(', ') || 'no sets'}${e.note ? ` [his note: "${clip(e.note, 120)}"]` : ''}`).join(' | ')}`);
  }
  const head = `Sessions since ${since}${wanted ? ` with ${wanted.join(' / ')}` : ''}: ${lines.length}.`;
  return lines.length ? `${head}\n${lines.join('\n')}` : `${head} Nothing logged${wanted ? ' for that lift' : ''} in that window.`;
}

async function liftTrend(vaultPath, { exercise } = {}) {
  const { loadSessions } = await import('./workoutSessions.js');
  const { liftTrends, liftTrendLine, TREND_WEEKS } = await import('./coach.js');
  const names = await libraryNames(vaultPath);
  const wanted = matchExercises(exercise, names);
  if (!wanted.length) return unknownExercise(exercise, names);
  const rows = liftTrends(await loadSessions(vaultPath), { today: localDateISO() }).filter((r) => wanted.includes(r.name));
  const head = `Best e1RM per week in kg, oldest first over ${TREND_WEEKS} weeks (the last is the 7 days to today; - = not trained); 4w = change against 4-6 weeks before; then sessions and the verdict.`;
  if (!rows.length) return `${wanted.join(' / ')}: not trained with weight in the last ${TREND_WEEKS} weeks.`;
  return `${head}\n${rows.map(liftTrendLine).join('\n')}`;
}

async function program(vaultPath) {
  const { programContext } = await import('./coach.js');
  return String(await programContext(vaultPath)).replace(/^HIS PROGRAM NOW \([^)]*\):/, 'HIS PROGRAM NOW:');
}

async function recovery(vaultPath, { days } = {}) {
  const { loadRecentDays } = await import('./healthData.js');
  const { computeDeloadSignal } = await import('./coach.js');
  const n = intIn(days, 1, 28, 7);
  const all = await loadRecentDays(Math.max(n, 14));
  const shown = all.slice(-n);
  const rows = shown.map((d) => `${d.date}: ${[
    d.hrv != null ? `HRV ${Math.round(d.hrv)} ms` : null,
    d.sleepAsleepMinutes != null ? `sleep ${(d.sleepAsleepMinutes / 60).toFixed(1)} h` : null,
    d.restingHeartRate != null ? `RHR ${d.restingHeartRate}` : null,
    d.steps != null ? `${d.steps} steps${d.stepsComplete === false ? ' so far' : ''}` : null,
    d.weightKg != null && !d.weightCarried ? `${d.weightKg} kg` : null,
  ].filter(Boolean).join(', ') || 'nothing recorded'}`);
  const signal = computeDeloadSignal(all);
  return `Recovery, last ${shown.length} days (oldest first):\n${rows.join('\n') || 'no days recorded'}\nDeload signal: ${signal.advise ? 'YES, ' : 'no, '}${signal.reason}.`;
}

async function nutrition(vaultPath, { days } = {}) {
  const { loadRecentDays } = await import('./nutritionLog.js');
  const n = intIn(days, 1, 28, 7);
  const list = await loadRecentDays(n);
  if (!list.length) return 'No tracked food days in that window.';
  const rows = list.map((d) => `${d.date}: ${Math.round(d.p || 0)} g protein (floor ${d.floorG ?? '?'} g, ${d.floorMet ? 'met' : 'missed'}), ${Math.round(d.kcal || 0)} kcal${d.targetKcal ? ` (target ${Math.round(d.targetKcal)})` : ''}`);
  const avgP = Math.round(list.reduce((s, d) => s + (d.p || 0), 0) / list.length);
  const avgK = Math.round(list.reduce((s, d) => s + (d.kcal || 0), 0) / list.length);
  const met = list.filter((d) => d.floorMet === true).length;
  return `Food, ${list.length} tracked days (oldest first):\n${rows.join('\n')}\nAverage ${avgP} g protein and ${avgK} kcal a day; protein floor met ${met} of ${list.length} days.`;
}

async function standing(vaultPath) {
  const { standingContext } = await import('./bodyComp.js');
  return standingContext(vaultPath);
}

async function goalsAndBlock(vaultPath) {
  const { goalsContext } = await import('./fitnessGoals.js');
  const { blockContext } = await import('./trainingBlocks.js');
  const { injuriesContext } = await import('./injuryLog.js');
  const parts = [];
  parts.push(await goalsContext(vaultPath).catch((e) => `His goals could not be read: ${e.message}.`));
  parts.push(await blockContext(vaultPath).catch(() => 'The training block could not be read.'));
  parts.push((await injuriesContext(vaultPath).catch(() => null)) || 'No open injuries.');
  return parts.join('\n');
}

async function knowledge(vaultPath, { query } = {}) {
  const { readFile } = await import('node:fs/promises');
  const path = (await import('node:path')).default;
  const { PLAYBOOK_REL, PRINCIPLES_REL } = await import('./coachKnowledge.js');
  const words = tokensOf(query).filter((w) => w.length > 2);
  const out = [];
  for (const [title, rel] of [['COACHING PRINCIPLES', PRINCIPLES_REL], ['WHAT WORKS FOR HAYDEN', PLAYBOOK_REL]]) {
    let text = '';
    try { text = await readFile(path.join(vaultPath, rel), 'utf8'); } catch { out.push(`${title}: the page could not be read.`); continue; }
    const lines = text.split('\n');
    let heading = '';
    const hits = [];
    for (const l of lines) {
      if (/^#+\s/.test(l)) { heading = l.replace(/^#+\s*/, ''); continue; }
      const low = l.toLowerCase();
      if (l.trim() && words.length && words.some((w) => low.includes(w))) hits.push(`${heading ? `[${heading}] ` : ''}${clip(l.replace(/^\s*[-*]\s+/, ''), 300)}`);
    }
    out.push(hits.length ? `${title} (lines matching "${query}"):\n${hits.slice(0, 10).join('\n')}` : `${title}: nothing matches "${query}". The page opens:\n${clip(text.replace(/^---[\s\S]*?---\s*/, ''), 600)}`);
  }
  return out.join('\n\n');
}

async function anatomy(vaultPath, { muscle_or_exercise: what } = {}) {
  const { anatomyContext, focusFor } = await import('./anatomy.js');
  const asked = String(what || '').trim();
  if (!asked) return 'anatomy needs a muscle or an exercise.';
  let focus = focusFor(asked);
  let via = '';
  if (!focus.length) {
    // an exercise: read through to the muscles his library files it under
    const { loadExerciseLibrary } = await import('./exercises.js');
    const { exercises } = await loadExerciseLibrary(vaultPath);
    const names = exercises.map((e) => e.name);
    const hit = matchExercises(asked, names)[0];
    if (hit) {
      const e = exercises.find((x) => x.name === hit);
      const muscles = [e.muscleGroup, ...(e.secondary || [])].filter(Boolean);
      focus = focusFor(muscles.join(' '));
      via = `${hit} is filed under ${muscles.join(', ') || 'no muscle'}.\n`;
    } else {
      const near = nearestExercises(asked, names);
      return `The atlas has nothing called "${asked}", and neither does his library.${near.length ? ` Nearest exercises: ${near.join('; ')}.` : ''}`;
    }
  }
  return focus.length ? `${via}${anatomyContext(focus)}` : `${via}The atlas has no entry for that.`;
}

const RUNNERS = {
  training_log: trainingLog,
  lift_trend: liftTrend,
  program,
  recovery,
  nutrition,
  standing,
  goals_and_block: goalsAndBlock,
  knowledge,
  anatomy,
  vault_search: (v, a) => vaultSearch(v, a),
  vault_read: (v, a) => vaultRead(v, a),
};
export const TOOL_NAMES = Object.keys(RUNNERS);

/** Run one tool by code, read-only; the result is scrubbed of Claude-only
 *  directives and clipped. Never throws: a failure is a sentence. */
export async function runCoachTool(vaultPath, call) {
  const args = call?.args && typeof call.args === 'object' ? call.args : {};
  const run = RUNNERS[call?.name];
  if (!run) return `There is no tool "${call?.name}". Tools: ${TOOL_NAMES.join(', ')}.`;
  try {
    return clipResult(forLocal(await run(vaultPath, args)));
  } catch (e) {
    return `That lookup failed: ${e.message}. Say so rather than guess.`;
  }
}

// What the glass says while code runs a lookup: never spoken (no sentence
// punctuation; src/App.jsx speaks only on . ! ? and , ; :).
const quiet = (s) => String(s || '').replace(/[.!?,;:"“”]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
export function progressLine(call) {
  const a = call?.args || {};
  switch (call?.name) {
    case 'training_log': return a.exercise ? `Reading your ${quiet(a.exercise)} sessions…` : 'Reading your training log…';
    case 'lift_trend': return `Checking your ${quiet(a.exercise) || 'lift'} trend…`;
    case 'program': return 'Reading your program…';
    case 'recovery': return 'Checking your recovery…';
    case 'nutrition': return 'Checking your food…';
    case 'standing': return 'Checking where you stand…';
    case 'goals_and_block': return 'Reading your goals…';
    case 'knowledge': return 'Reading your coaching pages…';
    case 'anatomy': return `Looking up ${quiet(a.muscle_or_exercise) || 'the anatomy'}…`;
    default: return 'Looking in your vault…';
  }
}

const FINAL_ASK = 'That is all the lookups for this turn. Answer him now from what you found, and say plainly what you could not find. Do not call a tool.';

/* ------------------------------ the trace ---------------------------------- */
// The bench (server/scripts/benchLocalCoach.mjs) checks every number in an
// answer against what the model was shown. The last few turns' prompt and
// tool results are kept in memory for that, bounded; nothing is written.
const traces = new Map();
const TRACES_KEPT = 8;
export function traceOf(jobId) { return traces.get(jobId) || null; }
function keepTrace(jobId, trace) {
  traces.set(jobId, trace);
  while (traces.size > TRACES_KEPT) traces.delete(traces.keys().next().value);
}

/* -------------------------------- the turn --------------------------------- */

const sizeOf = (messages) => messages.reduce((n, m) => n + String(m.content || '').length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0), 0);

async function converse(job, { vaultPath, question, system, deadline, trace }) {
  const messages = [{ role: 'system', content: system }, { role: 'user', content: question }];
  const used = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let model = defaultModel();
  let rounds = 0;
  for (let round = 0; ; round++) {
    // the round cap, or a conversation about to outgrow the window: answer now
    const final = round >= MAX_ROUNDS || sizeOf(messages) > MESSAGE_BUDGET;
    if (final) messages.push({ role: 'user', content: FINAL_ASK });
    const left = deadline - Date.now();
    if (left <= 0) throw new Error(`it took longer than ${Math.round(TURN_TIMEOUT_MS() / 1000)} s`);
    // thinking off (left on, Qwen3.5 spends the whole budget thinking: 27
    // Oct), and no num_ctx of its own: ONE context size for every call, or
    // Ollama reloads the runner (lib/localModel.js NUM_CTX)
    const out = await chatLocal(messages, { tools: final ? null : TOOLS, timeoutMs: Math.max(1000, left), maxTokens: ANSWER_TOKENS, think: false });
    model = out.model || model;
    if (out.usage) {
      inputTokens += Number(out.usage.prompt_tokens) || 0;
      outputTokens += Number(out.usage.completion_tokens) || 0;
    }
    const { calls, text } = readToolCalls(out.message);
    if (!calls.length || final) {
      if (!text) throw new Error(final ? 'it kept looking and never answered' : 'it returned no answer');
      return { text, used, rounds, inputTokens: inputTokens || null, outputTokens: outputTokens || null, model };
    }
    rounds += 1;
    const batch = calls.slice(0, 3);
    messages.push({
      role: 'assistant',
      content: typeof out.message.content === 'string' ? out.message.content : '',
      tool_calls: batch.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })),
    });
    for (const c of batch) {
      job.partial = progressLine(c);
      const result = await runCoachTool(vaultPath, c);
      used.push({ name: c.name, args: c.args, chars: result.length });
      trace.results.push({ name: c.name, args: c.args, text: result });
      messages.push({ role: 'tool', tool_call_id: c.id, name: c.name, content: result });
    }
  }
}

// The conversation this turn joins. A session the local model opened is
// held in the local session memory (lib/localAsk.js, shared on purpose: a
// session id is a session id). A Claude Coach session is read back from
// Claude's own journal (agentSessions.sessionTail, read-only), plus the
// turns this Mac answered on it since Claude last did.
async function historyFor(vaultPath, sessionId) {
  if (!sessionId) return [];
  if (isLocalOnlySession(sessionId)) return sessionTurns(sessionId);
  const pairs = [];
  try {
    const { sessionTail } = await import('./agentSessions.js');
    const tail = await sessionTail(vaultPath, sessionId, { maxTurns: 8, maxChars: 500 });
    let q = null;
    for (const t of tail?.turns || []) {
      if (t.role === 'user') q = t.text;
      else if (q != null) { pairs.push({ q, a: t.text }); q = null; }
    }
  } catch { /* no journal: the local turns alone */ }
  return [...pairs, ...localTurnsSinceClaude(sessionId)];
}

/**
 * The Coach on the model on this Mac. Returns a job id in the same map as
 * startAskCoach (getMessageJob serves it). The job settles `ready` with the
 * Claude Coach's result shape plus `provider: 'local'`, or `error` with a
 * reason; with `escalateReason` set when the model handed up on purpose.
 * lib/coachTurn.js holds the job so an error becomes Claude's answer.
 */
export function startCoachLocal(vaultPath, { question, sessionId = null, liveSession = null, where = null, spoken = false } = {}) {
  assertLaneOn('coach');
  const job = { id: randomUUID().slice(0, 8), status: 'running', result: null, error: null, partial: 'On the model on this Mac…', provider: 'local' };
  registerAskJob(job);
  const opened = !sessionId;
  const effectiveSessionId = sessionId || randomUUID();
  const started = Date.now();
  const fail = (why, escalateReason = null) => {
    const w = String(why || '').replace(/^local model (?!→)/, '');
    recordRun('coach', { provider: 'local', usd: 0, ms: Date.now() - started, model: `local:${defaultModel()}`, error: String(escalateReason || w).slice(0, 200) });
    if (escalateReason) job.escalateReason = escalateReason;
    job.error = `The model on this Mac could not answer: ${w}`;
    job.status = 'error';
    refreshLocalStatus().catch(() => {});
  };

  (async () => {
    // one tick first: the caller (lib/coachTurn.js) holds the job for
    // escalation right after this returns, and a failure written before the
    // hold exists would reach the client as an error instead of Claude
    await null;
    if (!localModelConfigured()) {
      fail(localBackend() === 'ollama' ? 'Ollama is not installed on this Mac' : 'the local model is not installed');
      return;
    }
    const [history, facts] = await Promise.all([
      historyFor(vaultPath, sessionId).catch(() => []),
      coachFacts(vaultPath).catch((e) => `COULD NOT BE READ THIS TURN: his facts (${e.message}).`),
    ]);
    let live = '';
    if (liveSession) {
      try { live = (await import('./coach.js')).liveSessionContext(liveSession); } catch { live = ''; }
    }
    let talkPrefs = '';
    try { talkPrefs = talkPrefsBlock(vaultPath); } catch { talkPrefs = ''; }
    const system = buildLocalCoachPrompt({ today: todayLine(), facts, liveSession: live, place: where?.place || 'unknown', spoken: spoken === true, history, talkPrefs });
    const trace = { system, results: [] };
    keepTrace(job.id, trace);
    let turn;
    try {
      turn = await converse(job, { vaultPath, question, system, deadline: started + TURN_TIMEOUT_MS(), trace });
    } catch (e) {
      fail(e.message || e);
      return;
    }
    trace.reply = turn.text;
    trace.rounds = turn.rounds;
    const read = readCoachReply(parseVisualStream(turn.text).text);
    if (read.escalate) {
      console.log(`local coach: handed up (${read.reason}) after ${turn.rounds} round(s)`);
      fail(read.reason.replace(/^the model on this Mac handed it up: /, 'it handed the question up: '), read.reason);
      return;
    }
    // THE SETTLE, Claude's Coach's own (claudeCode.js startAskCoach
    // finishTurn), as far as it applies to an answer that never writes:
    // REUSED: foldReply (src/turnFold.js, the MORE line), coachPanelFor (the
    // evidence panel from the question), and the result shape every client
    // reads (text, more, sessionId, proposal(s), withdrawn, panel, consult,
    // artifacts). NOT REUSED, on purpose: fileArtifacts and
    // settleCoachChanges (both write; a reply that would need them was
    // handed up above), the consult step (the local Coach asks no one), and
    // onReady (the skipped-work cooldown is stamped only by the turn that
    // was shown that block, which is Claude's assembly).
    const fold = foldReply(read.text);
    const panel = await coachPanelFor(vaultPath, question);
    const ms = Date.now() - started;
    recordRun('coach', {
      provider: 'local', usd: 0, ms, model: `local:${turn.model}`, inputTokens: turn.inputTokens, outputTokens: turn.outputTokens,
    });
    refreshLocalStatus().catch(() => {});
    const text = fold.said.trim();
    if (!text) { fail('it returned no answer'); return; }
    await recordAskTurn(effectiveSessionId, { q: question, a: text, provider: 'local' }, { opened }).catch(() => {});
    job.result = {
      text, more: fold.held, sessionId: effectiveSessionId,
      proposal: null, proposals: [], withdrawn: [], panel, consulted: null, consult: null, artifacts: [],
      provider: 'local', model: `local:${turn.model}`, lookups: turn.used.map((u) => ({ name: u.name, args: u.args })), rounds: turn.rounds, ms,
    };
    job.status = 'ready';
    console.log(`local coach ${ms}ms rounds=${turn.rounds} lookups=${turn.used.length} reply=${text.length}ch`);
  })().catch((e) => fail(e.message));

  return job.id;
}
