import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDateISO } from './localDate.js';
import { AGENTS } from './consult.js';

// ---------------------------------------------------------------------------
// THE ACK THAT HEARD HIM (15 Oct 2026).
//
// His words: "I especially like how quickly Peter's AI responds. A lot of the
// time it doesn't feel like Nova does that. Sometimes when it does respond
// with the prebuilt responses that make it pretend and feel like it is
// responding quickly it gets old quickly and becomes too expected and
// premeditated because it is the same responses."
//
// The reference is E.V. in Brand New Day: Peter asks her to check the
// calibration of his targeting matrix and inside a second she says
// "Checking target calibration." His own noun, said back, then silence while
// she works. What made the old acks ("On it, sir.") feel canned was that they
// were time-driven and content-free: a 900 ms timer picked the next of five
// fixed lines whatever he had asked.
//
// This one is composed from what he said, by code, the moment the server
// knows which lane is answering:
//   - the TOPIC is a noun phrase lifted from his words (≤4 words, his "my"
//     said back as "your"), or nothing when his words give none;
//   - the FRAME is one of a small set per lane, rotated so the same frame is
//     never heard twice in one local day until the set is spent, and the same
//     sentence never twice in a day at all (silence beats a repeat);
//   - a reflex or a verb never gets one: those answers ARE the fast reply.
// No model is involved and nothing here is random.
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const LEDGER_PATH = () => path.join(dataRoot(), 'voice', 'acks.json');

// Gratitude, agreement and hellos are not work (App.jsx carried the same
// pattern for the old ack): "Perfect, thanks Nova" is met with an answer,
// never a receipt.
export const SMALL_TALK = /^(?:ok(?:ay)?|alright|right|perfect|great|nice|good|cool|lovely|brilliant|awesome|cheers|got it|understood|noted|sounds good|hi|hey|hello|morning|good morning|afternoon|evening|yes|yeah|yep|no|nope|nah|sure)?[,\s]*(?:thanks|thank you|ta|cheers|much appreciated|appreciate it)?[,\s]*(?:mate|nova|jarvis|sir)?[.!?]?$/i;

const MIN_QUESTION = 12;

// ── the topic: a CLOSED vocabulary ──────────────────────────────────────────
//
// 18 Oct 2026, three days of real receipts. The first version lifted a noun
// phrase out of his words by grammar, and on real dictation it said back
// fragments: "Taking many sets does Andrew to Coach.", "Checking mistake.",
// "Looking at up back or anything.", "Coach is looking at all right." A
// garbled echo is worse than the canned line it replaced.
//
// So the topic is now only ever a THING NOVA KNOWS EXISTS: a domain noun, one
// of his own lifts or routines, a body part he called his. The longest known
// phrase in his words wins (the earliest on a tie); no known phrase means the
// bare frame ("Looking."). Two rules keep it honest:
//   - an AMBIGUOUS word ("back", "steps", "week", "weight", "legs") counts
//     only when he called it his ("my back"), so "up back or anything" can
//     never become "your back";
//   - the set of possible sentences is finite, which is what lets every ack be
//     rendered to audio ahead of time (lib/ackPrerender.js): the ack is then a
//     file read, not a synthesis.

// his words, flattened: lower case, curly quotes straightened, punctuation gone
export function normalizeWords(question) {
  return ` ${String(question || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9' -]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

// "my" plus at most one word between ("my left shoulder", "my workout program")
const MY = "(?:my|my own)";
const MINE = `${MY}(?: [a-z']+)?`;
// [pattern on the normalized words, what Nova says back]. Order does not
// matter: the longest match wins.
const DOMAIN = [
  ['sleep(?:ing)?', 'your sleep'],
  ['hrv|heart rate variability', 'your HRV'],
  ['resting heart rate|rhr', 'your resting heart rate'],
  ['protein', 'your protein'],
  ['calories|kcal|calorie intake', 'your calories'],
  ['macros', 'your macros'],
  ['readiness', 'your readiness'],
  ['recovery', 'your recovery'],
  ['deload(?:ing)?', 'the deload'],
  ['muscle growth|hypertrophy', 'muscle growth'],
  ['training volume|weekly volume|sets per week', 'your training volume'],
  ['(?:workout|training|gym) (?:program|programme|plan|split)|(?:the|my) (?:program|programme|split)', 'your program'],
  ['training block', 'the training block'],
  ['mobility', 'your mobility'],
  ['cardio', 'your cardio'],
  ['meal prep', 'the meal prep'],
  ['shopping list|grocery list|groceries', 'the shopping list'],
  ['inbox', 'the inbox'],
  ['to ?do list|to ?dos|todos|todo list', 'your to-dos'],
  ['calendar', 'your calendar'],
  ['budget|spending', 'your spending'],
  ['journal', 'the journal'],
  ['reminders?', 'your reminders'],
  ['document|doc', 'the document'],
  ['recipes?', 'the recipes'],
  ["(?:today's|the|my) plan", "the plan"],
  ['step count', 'your steps'],
  ['body weight|weigh ?in', 'your weight'],
  ['body fat', 'your body fat'],
  [`${MY} (?:steps)`, 'your steps'],
  [`${MY} weight`, 'your weight'],
  [`${MINE} (?:workouts?|sessions?|training)`, 'your workouts'],
  [`${MY} week`, 'your week'],
  [`${MY} (?:schedule|day)`, 'your day'],
  [`${MY} goals?`, 'your goals'],
  [`${MY} (?:food|meals|diet|eating)`, 'your food'],
  [`${MY} (?:run|running)`, 'your running'],
  [`${MY} (?:routine|routines)`, 'your routines'],
  [`${MY} (?:lifts|numbers|strength)`, 'your lifts'],
  ['(?:my )?last (?:session|workout)', 'your last session'],
  ["today's (?:session|workout|training)", "today's session"],
  ["(monday|tuesday|wednesday|thursday|friday|saturday|sunday)'?s? (?:session|workout|training)", null], // said back with the day
];
// a body part he called his: "my shoulder", "my lower back", "my left knee"
const BODY = ['shoulders?', 'knees?', 'elbows?', 'wrists?', 'hips?', 'ankles?', 'neck', 'lower back', 'upper back', 'back', 'hamstrings?', 'quads?', 'calves', 'calf', 'chest', 'legs?', 'arms?', 'biceps?', 'triceps?', 'glutes?', 'lats', 'delts', 'core', 'abs', 'traps'];
// the big lifts by the names he says them, said back as his
const LIFT_ALIASES = [
  ['bench(?: press)?', 'your bench'],
  ['squats?', 'your squat'],
  ['deadlifts?', 'your deadlift'],
  ['(?:weighted )?pull ?ups?|chin ?ups?', 'your pull-ups'],
  ['overhead press|ohp|shoulder press', 'your shoulder press'],
  ['lat pull ?downs?', 'your lat pulldowns'],
  ['(?:cable )?lateral raises?', 'your lateral raises'],
  ['rdls?|romanian deadlifts?', 'your RDLs'],
  ['hip thrusts?', 'your hip thrusts'],
  ['rows?', null], // too ambiguous on its own ("a row of"): only via a full lift name
];
// what the Leader lane talks about: people work, said back as things
const LEADER_TOPICS = [
  ['(?:the|my|this|that) meeting', 'the meeting'],
  ['(?:my|the) team', 'your team'],
  ['feedback', 'the feedback'],
  ['(?:the|my|this) interview', 'the interview'],
  ['(?:the|my|this) presentation', 'the presentation'],
  ['(?:my|the) manager|(?:my|the) boss', 'your manager'],
  ['(?:the|this|that|a) (?:hard |difficult |tough )?conversation', 'the conversation'],
  ['(?:the|my) deadline', 'the deadline'],
  ['(?:the|this|that) (?:conflict|disagreement|argument)', 'the conflict'],
  ['(?:the|this|that) (?:situation|issue)', 'the situation'],
  ['(?:at )?work', 'work'],
];

const DAYCAP = (d) => d.charAt(0).toUpperCase() + d.slice(1);
const nameRe = (s) => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The vocabulary for a lane. `lifts` and `routines` are his own names (from
// the vault, lib/acks.js ackVocabulary); everything else is fixed.
export function vocabularyFor(group, { lifts = [], routines = [] } = {}) {
  if (group === 'leader') return LEADER_TOPICS.map(([p, say]) => ({ re: new RegExp(` (?:${p})(?= )`), say }));
  const out = DOMAIN.map(([p, say]) => ({ re: new RegExp(` (?:${p})(?= )`), say }));
  for (const part of BODY) out.push({ re: new RegExp(` ${MINE} (${part})(?= )`), say: null, body: true });
  for (const [p, say] of LIFT_ALIASES) if (say) out.push({ re: new RegExp(` (?:${p})(?= )`), say });
  for (const n of [...lifts, ...routines]) {
    const k = nameRe(n);
    if (k.length < 4 || k.split(' ').length < 2 && k.length < 6) continue; // a one-word short name is too easy to hit by accident
    out.push({ re: new RegExp(` ${escapeRe(k).replace(/ /g, ' ')}s?(?= )`), say: n });
  }
  return out;
}

// The topic he named, or null. Longest known phrase wins; the earliest on a tie.
export function knownTopic(question, group = 'ask', vocab = {}) {
  const words = normalizeWords(question);
  let best = null;
  for (const v of vocabularyFor(group, vocab)) {
    const m = v.re.exec(words);
    if (!m) continue;
    let say = v.say;
    if (v.body) say = `your ${m[m.length - 1]}`;
    if (say === null) {
      const day = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.exec(m[0]);
      if (!day) continue;
      say = `${DAYCAP(day[1])}'s session`;
    }
    // a body part he called his is the point of the sentence ("my back is
    // sore after deadlifts" is about his back), so it outranks a longer lift
    const len = m[0].length + (v.body ? 100 : 0);
    if (!best || len > best.len || (len === best.len && m.index < best.at)) best = { say, len, at: m.index };
  }
  return best ? best.say : null;
}

// Every topic a lane can say back, for rendering the audio ahead of time.
export function topicsFor(group, vocab = {}) {
  if (group === 'leader') return [...new Set(LEADER_TOPICS.map(([, s]) => s))];
  const fixed = [...DOMAIN, ...LIFT_ALIASES].map(([, s]) => s).filter(Boolean);
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => `${d}'s session`);
  const body = ['shoulder', 'knee', 'elbow', 'wrist', 'hip', 'ankle', 'neck', 'lower back', 'back', 'legs', 'chest', 'arms'].map((b) => `your ${b}`);
  return [...new Set([...fixed, ...days, ...body, ...(vocab.lifts || []), ...(vocab.routines || [])])];
}

// small talk, judged on the words alone: "All right. . Okay." is not work
const FILLER = new Set(['ok', 'okay', 'alright', 'all', 'right', 'perfect', 'great', 'nice', 'good', 'cool', 'lovely', 'brilliant', 'awesome', 'cheers', 'got', 'it', 'understood', 'noted', 'sounds', 'hi', 'hey', 'hello', 'morning', 'afternoon', 'evening', 'yes', 'yeah', 'yep', 'no', 'nope', 'nah', 'sure', 'thanks', 'thank', 'you', 'ta', 'much', 'appreciated', 'appreciate', 'mate', 'nova', 'jarvis', 'sir', 'well', 'that', 'is', "that's", 'so', 'fine', 'thats']);
export function isSmallTalk(question) {
  const w = normalizeWords(question).trim().split(' ').filter(Boolean);
  return w.length > 0 && w.length <= 8 && w.every((x) => FILLER.has(x));
}

// ── the frames ──────────────────────────────────────────────────────────────
// ≤5 words of template each; "sir" in at most one frame per lane (the Jarvis
// register lives in the replies, not the receipts).

export const FRAMES = {
  ask: [
    { id: 'ask.pull', t: 'Pulling {topic}.' },
    { id: 'ask.look', t: 'Looking at {topic}.' },
    { id: 'ask.check', t: 'Checking {topic}.' },
    { id: 'ask.letme', t: 'Let me look at {topic}.' },
    { id: 'ask.second', t: '{Topic}. One second.' },
    { id: 'ask.sir', t: '{Topic}, sir. One moment.' },
  ],
  coach: [
    { id: 'coach.ask', t: 'Asking Coach about {topic}.' },
    { id: 'coach.on', t: 'Coach is on {topic}.' },
    { id: 'coach.with', t: 'Checking {topic} with Coach.' },
    { id: 'coach.take', t: 'Taking {topic} to Coach.' },
    { id: 'coach.look', t: 'Coach is looking at {topic}.' },
  ],
  leader: [
    { id: 'leader.think', t: 'Thinking about {topic}.' },
    { id: 'leader.look', t: 'Looking at {topic}.' },
    { id: 'leader.weigh', t: 'Weighing {topic}.' },
    { id: 'leader.ask', t: 'Asking the Leader about {topic}.' },
    { id: 'leader.sir', t: '{Topic}. Give me a moment, sir.' },
  ],
  consult: [
    { id: 'consult.ask', t: 'Asking {agent} about {topic}.' },
    { id: 'consult.check', t: 'Checking {topic} with {agent}.' },
  ],
};
export const BARE_FRAMES = {
  ask: [
    { id: 'ask.bare.look', t: 'Looking.' },
    { id: 'ask.bare.second', t: 'One second.' },
    { id: 'ask.bare.check', t: 'Checking.' },
    { id: 'ask.bare.on', t: 'On it.' },
  ],
  coach: [
    { id: 'coach.bare.ask', t: 'Asking Coach.' },
    { id: 'coach.bare.on', t: 'Coach is on it.' },
    { id: 'coach.bare.over', t: 'Over to Coach.' },
  ],
  leader: [
    { id: 'leader.bare.think', t: 'Let me think.' },
    { id: 'leader.bare.second', t: 'One second.' },
    { id: 'leader.bare.look', t: 'Looking.' },
  ],
  consult: [
    { id: 'consult.bare.ask', t: 'Asking {agent}.' },
  ],
};

// the frame that echoes his own verb, per lane
const VERB_HINTS = [
  { re: /\bcheck(?:ing)?\b/, ids: { ask: 'ask.check', coach: 'coach.with' } },
  { re: /\b(?:look|have a look|take a look)\b/, ids: { ask: 'ask.look', coach: 'coach.look', leader: 'leader.look' } },
  { re: /\bpull\b/, ids: { ask: 'ask.pull' } },
  { re: /\b(?:think|weigh)\b/, ids: { leader: 'leader.think' } },
];
function verbHint(question, group) {
  const q = String(question || '').toLowerCase();
  for (const h of VERB_HINTS) if (h.re.test(q) && h.ids[group]) return h.ids[group];
  return null;
}

const laneOf = (lane) => (lane === 'coach' || lane === 'leader' ? lane : 'ask');

const fill = (template, topic, agent) => {
  const t = template
    .replace('{Topic}', topic ? topic.charAt(0).toUpperCase() + topic.slice(1) : '')
    .replace('{topic}', topic || '')
    .replace(/\{agent\}/g, agent || '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// where the rotation starts today: the day itself, so the first ack of the
// morning is not always the same frame (still no randomness to debug)
function dayOffset(now, n) {
  if (!n) return 0;
  const d = new Date(now);
  const start = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d - start) / 86_400_000);
  return ((doy % n) + n) % n;
}

// One rotation over a frame set: the first unused frame from today's offset;
// a spent set starts over (the ids for this set are released), but never on a
// sentence already said today.
function pick(frames, { topic, agent, used, texts, now, hint = null }) {
  const ids = new Set(used);
  const said = new Set(texts.map((x) => x.toLowerCase()));
  const off = dayOffset(now, frames.length);
  let order = frames.map((_, i) => frames[(i + off) % frames.length]);
  // HIS VERB, SAID BACK: "can you check…" is answered "Checking…" when that
  // frame is still unheard today (E.V.: "Checking target calibration.")
  const hinted = hint ? order.find((f) => f.id === hint) : null;
  if (hinted) order = [hinted, ...order.filter((f) => f !== hinted)];
  const fresh = (f) => !said.has(fill(f.t, topic, agent).toLowerCase());
  let choice = order.find((f) => !ids.has(f.id) && fresh(f));
  let reset = false;
  if (!choice) {
    // the set is spent: start the rotation over, after the frame heard last
    const last = [...used].reverse().find((id) => frames.some((f) => f.id === id));
    const lastIdx = order.findIndex((f) => f.id === last);
    const again = lastIdx >= 0 ? [...order.slice(lastIdx + 1), ...order.slice(0, lastIdx + 1)] : order;
    choice = again.find((f) => f.id !== last && fresh(f)) || null;
    reset = !!choice;
  }
  if (!choice) return null;
  return { id: choice.id, text: fill(choice.t, topic, agent), reset, set: frames.map((f) => f.id) };
}

// composeAck({ question, lane, consult, now, used, texts }) → { id, text, topic } | null
//   lane:    the resolved lane ('ask' | 'coach' | 'leader'; 'reflex' and 'verb' get none)
//   consult: an agent id from consult.AGENTS when the ask is known to go to one
//   used:    frame ids already spoken today (the ledger's)
//   texts:   sentences already spoken today (the ledger's)
export function composeAck({ question, lane = 'ask', consult = null, now = Date.now(), used = [], texts = [], vocab = {} } = {}) {
  if (lane === 'reflex' || lane === 'verb') return null;
  const q = String(question || '').replace(/\[[^\]]*\]/g, ' ').trim();
  if (q.length < MIN_QUESTION) return null;
  if (SMALL_TALK.test(q) || isSmallTalk(q)) return null;
  const agentLabel = consult && AGENTS[consult]?.label && !AGENTS[consult]?.code ? AGENTS[consult].label : null;
  const group = agentLabel ? 'consult' : laneOf(lane);
  const topic = knownTopic(q, group === 'consult' ? 'ask' : group, vocab);
  const ctx = { topic, agent: agentLabel, used: Array.isArray(used) ? used : [], texts: Array.isArray(texts) ? texts : [], now, hint: verbHint(q, group) };
  let out = topic ? pick(FRAMES[group], ctx) : null;
  // no topic, or every topic sentence already said today: the bare frames
  if (!out) out = pick(BARE_FRAMES[group], { ...ctx, topic: null });
  if (!out) return null; // every sentence this lane has was said today: silence beats a repeat
  return { id: out.id, text: out.text, topic: out.id.includes('.bare.') ? null : topic, reset: out.reset, set: out.set };
}

// His own names, from the vault: the lifts he has trained in the last 90
// days and his routines. Cached ten minutes; a vault that cannot be read
// gives the fixed vocabulary only, never an error in front of a reply.
let vocabCache = { at: 0, vault: null, vocab: { lifts: [], routines: [] } };
export async function ackVocabulary(vaultPath = process.env.VAULT_PATH, { now = Date.now(), fresh = false } = {}) {
  if (!vaultPath) return { lifts: [], routines: [] };
  if (!fresh && vocabCache.vault === vaultPath && now - vocabCache.at < 10 * 60_000) return vocabCache.vocab;
  const vocab = { lifts: [], routines: [] };
  try {
    const { loadSessions } = await import('./workoutSessions.js');
    const since = now - 90 * 86_400_000;
    const sessions = (await loadSessions(vaultPath)).filter((x) => !x.date || Date.parse(x.date) >= since);
    vocab.lifts = [...new Set(sessions.flatMap((x) => (x.exercises || []).map((e) => e.name)).filter(Boolean))];
  } catch { /* the fixed vocabulary still works */ }
  try {
    const { loadExerciseLibrary } = await import('./exercises.js');
    const { loadRoutines } = await import('./workouts.js');
    const lib = await loadExerciseLibrary(vaultPath);
    const { routines } = await loadRoutines(vaultPath, Array.isArray(lib) ? lib : lib?.exercises || []);
    vocab.routines = [...new Set((routines || []).map((r) => r.name).filter(Boolean))];
  } catch { /* the fixed vocabulary still works */ }
  vocabCache = { at: now, vault: vaultPath, vocab };
  return vocab;
}

// Every distinct sentence an ack can be, for rendering the audio ahead of
// time (lib/ackPrerender.js). Finite because the topic is a closed vocabulary.
export async function ackPrerenderList(vaultPath = process.env.VAULT_PATH) {
  const vocab = await ackVocabulary(vaultPath);
  const out = new Set();
  for (const group of ['ask', 'coach', 'leader']) {
    for (const f of BARE_FRAMES[group]) out.add(fill(f.t, null, null));
    for (const topic of topicsFor(group, vocab)) for (const f of FRAMES[group]) out.add(fill(f.t, topic, null));
  }
  return [...out];
}

// ── the seen-ledger ─────────────────────────────────────────────────────────
// server/data/voice/acks.json: { day, used: [ids], texts: [...] }, keyed on HIS
// local day. A new day starts empty.

export function readAckLedger(now = Date.now()) {
  const day = localDateISO(new Date(now));
  const file = LEDGER_PATH();
  if (!existsSync(file)) return { day, used: [], texts: [] };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (raw?.day !== day) return { day, used: [], texts: [] };
    return {
      day,
      used: Array.isArray(raw.used) ? raw.used.filter((x) => typeof x === 'string') : [],
      texts: Array.isArray(raw.texts) ? raw.texts.filter((x) => typeof x === 'string') : [],
    };
  } catch {
    return { day, used: [], texts: [] };
  }
}

let writing = Promise.resolve();
export function recordAck(ack, now = Date.now()) {
  if (!ack?.id) return Promise.resolve();
  const job = writing.then(async () => {
    const led = readAckLedger(now);
    // a spent set starting over releases its ids; the sentences stay said
    let used = ack.reset && Array.isArray(ack.set) ? led.used.filter((id) => !ack.set.includes(id)) : led.used;
    used = [...used, ack.id].slice(-200);
    const texts = [...led.texts, ack.text].slice(-400);
    await mkdir(path.dirname(LEDGER_PATH()), { recursive: true });
    const tmp = `${LEDGER_PATH()}.tmp`;
    await writeFile(tmp, JSON.stringify({ day: led.day, used, texts }, null, 2), 'utf8');
    await rename(tmp, LEDGER_PATH());
  });
  writing = job.catch(() => {});
  return job;
}

// The route's one call: compose against today's ledger and record it.
export async function nextAck({ question, lane, consult = null, now = Date.now() } = {}) {
  await writing;
  const led = readAckLedger(now);
  const vocab = await ackVocabulary().catch(() => ({}));
  const ack = composeAck({ question, lane, consult, now, used: led.used, texts: led.texts, vocab });
  if (!ack) return null;
  await recordAck(ack, now).catch(() => {});
  return { id: ack.id, text: ack.text, topic: ack.topic };
}
