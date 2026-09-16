// The Reflex Layer — deterministic answers in front of the model.
//
// The JARVIS builder's line (design/MORNING-SHOW-PLAN.md): reflexes sit
// above the reasoning model "so most of what he asks never reaches deep
// thought at all — that is the speed people assume is edited." For Nova
// that means: a question whose answer already sits in the live record
// (steps, HRV, weight, fuel, inbox) is answered by CODE in <1s — templated
// in the persona register, exact numbers, honest dates — and the CLI is
// never spawned. Everything else falls through to the model untouched.
//
// The contract that keeps this honest:
//   - STRICT matching. A reflex that fires on "why are my steps so low?"
//     would answer a question that needed thought. Patterns match direct
//     what/how-many asks only; anything analytical falls through.
//   - NEVER guess. Missing data → return null and let the model (which can
//     read the vault) take it. A reflex answers or stays silent.
//   - Same variation discipline as the ack lines: rotate, don't random.

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function normalize(q) {
  return (q || '')
    .toLowerCase()
    .replace(/^(hey|hi|ok|okay)?[,\s]*(nova|jarvis)[,\s]*/i, '')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Analytical words mean he wants thought, not a number read back.
const NEEDS_THOUGHT = /\b(why|should|could|would|compare|versus|vs|trend|average|analys|explain|think|advice|low|high|bad|good|enough|improve)\b/;

let rot = 0;
const pick = (arr) => arr[rot++ % arr.length];

const defaultDeps = {
  recentDays: async () => (await import('./healthData.js')).loadRecentDays(3),
  foodToday: async () => (await import('./foodLog.js')).getToday(),
  pendingCount: async () =>
    (await (await import('./inboxStore.js')).listRecords()).filter((r) => r.status === 'pending').length,
  // the WARM calendar cache only — a cold cache is null, and null falls
  // through to the model rather than making him wait on iCloud for a reflex
  calendarToday: async () => (await import('./calendar.js')).peekCachedEventsForDay(new Date()),
  // TOMORROW, warm cache only, same discipline as today's: a cold cache is
  // null and falls through rather than making him wait on iCloud for a reflex.
  calendarTomorrow: async () => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return (await import('./calendar.js')).peekCachedEventsForDay(d);
  },
  // Nova's own curriculum. Measured 16 Sep: "how many techniques do I have
  // left" cost 11.3s AND came back ELEVEN when the catalogue holds six — a
  // model guessing about Nova's own state. A lookup cannot be wrong about it.
  repertoire: async () => {
    const { loadRepertoire, flatten, readState, techniqueForDay } = await import('./repertoire.js');
    const { localDateISO } = await import('./localDate.js');
    const all = flatten(await loadRepertoire(process.env.VAULT_PATH));
    return { all, state: await readState(), today: await techniqueForDay(process.env.VAULT_PATH, localDateISO(), { record: false }) };
  },
  // the ledger — for "what's going on with the X?" (lib/verbs.js's world)
  records: async () => (await import('./inboxStore.js')).listRecords(),
  // "what's on my to-do list" cost 9.5s of model for a file read; "what did I
  // train yesterday" cost 21s. Both are the live record, plainly asked.
  todos: async () => (await import('./todos.js')).listTodos(process.env.VAULT_PATH),
  sessions: async () => (await import('./workoutSessions.js')).loadSessions(process.env.VAULT_PATH, { limit: 14 }),
  // "when did I last train legs" has to be able to look FURTHER back than the
  // fortnight the other training answers need — a muscle group he has not hit
  // in three weeks is exactly the case worth answering.
  sessionsDeep: async () => (await import('./workoutSessions.js')).loadSessions(process.env.VAULT_PATH, { limit: 60 }),
  exerciseLibrary: async () => (await import('./exercises.js')).loadExerciseLibrary(process.env.VAULT_PATH),
};

// STATUS OF A JOB HE NAMED. The reel's "what's going on with my reservation?"
// — answered from the record ledger, not from the model's memory of having
// said it would do something. Matches the newest record from the last two
// days whose title or goal his words fit; a miss falls through to the model
// (which carries the fleet's activity in its context).
const STATUS_RE = /^(?:(?:what(?:'s| is) (?:going on|happening|the (?:status|progress|update)) (?:with|on)|how(?:'s| is| are)|(?:any|what) (?:update|news|progress|word) on|status (?:of|on)|where(?:'s| is| are) (?:we|you|things)? ?(?:at|up to)? ?(?:with|on)|did (?:you|the [a-z]+) (?:finish|do|run))\s+(?:the |my |that )?(.+?)(?:\s+(?:going|doing|coming along|research|job|report|brief|thing|yet|now))?)$/;
const RECORD_STATE = {
  classifying: (age) => `is still running — started ${age}.`,
  running: (age) => `is still running — started ${age}.`,
  pending: (age) => `landed in your Inbox ${age}, waiting on your word.`,
  approved: (age) => `was approved ${age} and is running.`,
  filed: (age, r) => r.kind === 'act' ? `— done, ${age}. Undo is one word away.` : `is done — filed ${age}${r.destination && r.destination !== r.decision?.title ? ` to ${r.destination}` : ''}.`,
  done: (age) => `finished ${age}.`,
  error: (age, r) => `hit an error ${age}${r.error ? `: ${String(r.error).slice(0, 90)}` : ''}.`,
  failed: (age, r) => `failed ${age}${r.error ? `: ${String(r.error).slice(0, 90)}` : ''}.`,
  discarded: (age) => `was discarded ${age}.`,
  undone: (age) => `was undone ${age}.`,
};
function ago(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}
async function statusReflex(q, deps) {
  const m = q.match(STATUS_RE);
  if (!m) return null;
  const named = m[1].trim();
  if (named.length < 3 || /^(?:it|that|this|things|everything|you|we)$/.test(named)) return null;
  // an injected deps object may not carry every reader — a missing one means
  // this reflex stays silent, never that tryReflex throws
  if (typeof deps.records !== 'function') return null;
  const records = await deps.records().catch(() => null);
  if (!records) return null;
  const cutoff = Date.now() - 2 * 86_400_000;
  const { matchName } = await import('./verbs.js');
  const recent = records.filter((r) => new Date(r.createdAt || 0).getTime() > cutoff && r.status !== 'expired');
  const pool = recent.map((r) => ({ r, name: [r.decision?.title, r.goal, r.text, r.question].filter(Boolean).join(' · ') }));
  const hit = matchName(pool, named);
  // a status read must fit the job's name, not merely share a word with it
  if (!hit.hit || hit.score < 2) return null; // no such job — the model can say so with more context
  const r = hit.hit.r;
  const say = RECORD_STATE[r.status];
  if (!say) return null;
  const title = (r.decision?.title || r.goal || r.text || 'that').replace(/^Plan: /, 'the plan to ');
  return { matched: 'status', text: `"${title.slice(0, 80)}" ${say(ago(r.filedAt || r.updatedAt || r.createdAt), r)}` };
}

// THE GLASS FOR A REFLEX. The same code that speaks the number draws it —
// his standing rule (show what it says), clamped by spokenCards like every
// other card. A reflex without a number (small talk, the calendar list)
// carries none.
async function card(fields) {
  const { metricCard } = await import('./spokenCards.js');
  return metricCard(fields);
}
const hm = (mins) => `${Math.floor(mins / 60)}h ${pad(Math.round(mins % 60))}m`;

// EVERY WORD OF A REFLEX IS SPOKEN ALOUD. His to-do list carries a raw YouTube
// link, and the first version of the to-do reflex read it out —
// "h-t-t-p-s-colon-slash-slash-y-o-u-t-u-dot-b-e-slash-M-G-x-c..." — for
// eleven seconds. A link is a thing he tapped, never a thing to hear. Anything
// that came from a file he typed into gets this before it is said.
const HOSTS = { 'youtu.be': 'a YouTube link', 'youtube.com': 'a YouTube link', 'instagram.com': 'an Instagram link', 'tiktok.com': 'a TikTok link', 'x.com': 'an X link', 'twitter.com': 'an X link' };
// A DATE IS SPOKEN TOO. "on 2026-07-17" is read out as a string of digits;
// nobody says a year unless it is a different one.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function spokenDate(iso, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const [, y, mo, d] = m;
  const month = MONTHS[Number(mo) - 1] || '';
  const day = Number(d);
  return Number(y) === now.getFullYear() ? `${day} ${month}` : `${day} ${month} ${y}`;
}

export function speakable(text, max = 60) {
  let t = String(text || '').replace(/https?:\/\/\S+/g, (url) => {
    const host = (url.match(/^https?:\/\/(?:www\.)?([^/?#]+)/) || [])[1] || '';
    return HOSTS[host] || 'a link';
  }).replace(/\s+/g, ' ').trim();
  if (t.length > max) t = `${t.slice(0, max - 1).replace(/[\s,;:.-]+$/, '')}…`;
  return t;
}

// NOTHING HAS ARRIVED — and that is an answer, not a reason to spend a model.
// Steps, HRV, resting heart rate and sleep exist in exactly one place: the day
// files his iPhone Shortcut writes. When the window holds none, there is
// nothing for the model to go looking for, and sending it looking costs him
// forty seconds and usually an answer to a different question (measured, 14
// Sep). The wording stays inside what is actually known: what was asked for,
// that nothing in the window carries it, and — only as a possibility — the one
// cause that would explain it.
async function absent(metric, { setupHint = '' } = {}) {
  return {
    matched: `${metric.key}-absent`,
    text: `No ${metric.noun} has come through, sir — nothing in the last few days carries one.${setupHint}`,
    card: await card({ label: metric.label, value: '—', caption: 'NO READING', tone: 'ink' }),
  };
}

// Each reflex: match → load → speak-or-null. Order matters only for
// overlapping phrasings; keep the list short and each pattern tight.
// SMALL TALK. "Perfect, thanks Nova" is not a request for work, and Nova
// answering it with "On it, sir — let me look" (then spawning a model to
// think about gratitude) is the single most robotic thing it does. His
// note: it "feels off… it doesn't need to actually analyse anything".
// Code answers these instantly, warmly, and briefly — and because it is a
// reflex, no ack fires and no model is spawned.
// The direct asks, in the shapes a person actually uses out loud. Every one of
// these was either already handled or found missing by asking Nova itself.
const THING = '(?:drafts?|items?|records?|things?|bits?)';
const WEIGHT_RE = new RegExp([
  "^(?:what(?:'?s| is| was)?\\s*)?(?:my\\s+)?(?:last|latest|current)?\\s*weight(?:\\s+(?:today|now|last|currently))?$",
  '^(?:what|how much) (?:do|did|am) i weigh(?:ing)?(?:\\s+(?:last|now|today|currently|at))?$',
  '^(?:my\\s+)?last weigh[- ]?in$',
].join('|'));
// "how many steps did I do yesterday" cost 27 SECONDS in the model for a number
// on disk, because the pattern allowed nothing between "steps" and the day.
const DID_I = '(?:did i (?:do|take|walk|get|manage)|have i (?:done|taken|walked|got))';
const WHEN = '(today|yesterday|so far(?: today)?)';
const STEPS_RE = new RegExp(
  `^(?:what(?:'?s| is| are| was| were)?|how many)?\\s*(?:my\\s+)?(?:step count|steps)(?:\\s+${DID_I})?\\s*${WHEN}?$`);
// He asked "how far did I walk yesterday" and Nova answered with STEPS — a
// different measurement presented as the one he asked for. The day files carry
// walkingRunningDistanceKm; nothing was reading it.
const DISTANCE_RE = new RegExp(
  `^(?:how far|what(?:'?s| is| was)? (?:my )?(?:distance|walking distance))(?:\\s+${DID_I})?(?:\\s+(?:walk|run|go|travel))?\\s*${WHEN}?$`);
// VO2 max is in every one of his day files and was read by NOTHING, so the
// model answered "no VO2 max in your log yet" — Nova denying data it holds.
const VO2_RE = /^(?:what(?:'?s| is)?\s*)?(?:my\s+)?vo2[\s-]?max(?:\s+(?:today|now|right now))?$/;
const TODO_RE = new RegExp([
  "^(?:what(?:'?s| is)?\\s*)?(?:on\\s+)?(?:my\\s+)?(?:to[- ]?do|todo)(?:\\s?list)?$",
  '^(?:what|how many) (?:do i have|have i got|is) (?:to do|left to do|on my (?:to[- ]?do|todo)(?:\\s?list)?)$',
  '^(?:my\\s+)?(?:to[- ]?dos|todos)$',
  '^what do i (?:need to|have to) do$',
].join('|'));
// "What's my bench press PR" cost 30.9 SECONDS — the slowest question in the
// battery — for a number personalRecords() computes from sessions already on
// disk. Two shapes, and the lift he names is matched the same fuzzy way the
// verbs match a job's name.
// THE LIFT HE NAMED, IN HIS OWN LIBRARY. verbs.matchName is built for a job's
// title and found nothing for "bench press" against "Barbell Bench Press", so
// this is its own thing and deliberately simple: every word he said must appear
// in the name. "bench press" reaches Barbell Bench Press and not "Incline
// Dumbbell Bench With Palms Facing In", which has the bench and not the press.
//
// AMBIGUITY FALLS THROUGH. "squat" fits Hack Squat and Bulgarian Split Squat
// equally, and picking the shorter one would be a guess dressed as an answer —
// the model can ask him which. Only an exact name, or a single candidate,
// answers here.
export function matchLift(pool, named) {
  const words = String(named || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return { kind: 'none' };
  const hits = pool.filter((p) => {
    const n = String(p.name || '').toLowerCase();
    return words.every((w) => n.includes(w));
  });
  if (!hits.length) return { kind: 'none' };
  if (hits.length === 1) return { kind: 'one', lift: hits[0] };
  const phrase = words.join(' ');
  // naming it in full wins outright: "my barbell bench press pr" must not be
  // asked back "which barbell bench press", when one of them IS that name
  const spelledOut = hits.filter((p) => String(p.name || '').toLowerCase() === phrase);
  if (spelledOut.length === 1) return { kind: 'one', lift: spelledOut[0] };
  const exact = hits.filter((p) => String(p.name || '').toLowerCase().endsWith(` ${phrase}`));
  if (exact.length === 1) return { kind: 'one', lift: exact[0] };
  // ASKING IS AN ANSWER, AND IT IS FREE. "What's my bench press PR" fits
  // Barbell, Dumbbell and Incline Barbell equally — picking one would be a
  // guess dressed as a record. It cost 30.9 SECONDS of model to work that out
  // and come back with a choice; this asks in a twentieth of a second, which
  // is the difference between a conversation and a wait. More than four and
  // reading the list aloud is worse than thinking about it — that goes to the
  // model.
  const choices = (exact.length > 1 ? exact : hits);
  return choices.length <= 4 ? { kind: 'which', choices } : { kind: 'none' };
}

const PR_RE = [
  /^(?:what(?:'?s| is)?\s*)?(?:my\s+)?(.+?)\s+(?:pr|p\.r\.|personal record|one[- ]?rep[- ]?max|1\s?rm)$/,
  /^(?:what(?:'?s| is)?\s*)?(?:my\s+)?(?:best|heaviest)\s+(.+?)$/,
];
const TRAINED_RE = new RegExp(
  `^(?:what|which)(?:\\s+session)? did i (?:train|do|lift)(?:\\s+(?:in the gym|at the gym))?\\s*${WHEN}?$`
  + "|^(?:what(?:'?s| is| was)?\\s*)?(?:my\\s+)?last (?:session|workout|training)$"
  + `|^did i train ${WHEN}$`);

// ---- MUSCLE GROUPS: the 21-second question ----
//
// Measured 16 Sep against the live endpoint: five of his six commonest asks
// answered in 2-66ms, and "when did I last train legs" took **21,610ms**. The
// handoff had already named it — "still going to the model, correctly (needs
// muscle-group interpretation)" — but it is not model work at all. His library
// carries a muscleGroup on all 135 exercises and every session carries the
// exercise ids. The answer is a lookup; it was only ever the WORD "legs" that
// needed translating, and a table does that.
//
// This is the lever behind his ask for a conversation without awkward waiting:
// filler exists to cover a 21-second gap, and the honest way to remove filler
// is to remove the gap.
const MUSCLE_WORDS = {
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  leg: ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  'lower body': ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  quads: ['Quads'], quad: ['Quads'], thighs: ['Quads', 'Hamstrings'],
  hamstrings: ['Hamstrings'], hamstring: ['Hamstrings'], hammies: ['Hamstrings'],
  glutes: ['Glutes'], calves: ['Calves'], calf: ['Calves'],
  chest: ['Chest'], pecs: ['Chest'],
  back: ['Back'], lats: ['Back'],
  shoulders: ['Shoulders'], shoulder: ['Shoulders'], delts: ['Shoulders'],
  arms: ['Biceps', 'Triceps', 'Forearms'], arm: ['Biceps', 'Triceps', 'Forearms'],
  biceps: ['Biceps'], bicep: ['Biceps'], triceps: ['Triceps'], tricep: ['Triceps'],
  forearms: ['Forearms'],
  abs: ['Abs'], core: ['Abs'],
  // his own split names — "push" and "pull" are how he actually talks
  push: ['Chest', 'Shoulders', 'Triceps'],
  pull: ['Back', 'Biceps'],
  'upper body': ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'],
};
const MUSCLE_ALT = Object.keys(MUSCLE_WORDS).sort((a, b) => b.length - a.length).join('|');
const MUSCLE_RE = new RegExp(
  `^(?:when did i (?:last )?(?:train|do|hit|work)|how long since i (?:last )?(?:trained|did|hit|worked)`
  + `|when(?:'?s| was)? (?:my )?last)\\s+(?:my\\s+)?(${MUSCLE_ALT})(?:\\s+(?:day|session|workout))?$`
  + `|^have i (?:trained|done|hit|worked)\\s+(?:my\\s+)?(${MUSCLE_ALT})\\s+(?:this week|lately|recently)$`);

// Whole days between two local date strings — same discipline as everywhere
// else: compare at the resolution displayed, never as instants.
function daysApart(fromISO, toISO) {
  const a = Date.parse(`${String(fromISO).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toISO).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
}

// ---- the four that still cost twenty seconds (measured live, 16 Sep) ----
const TOMORROW_RE = /^(?:what(?:'?s| is)\s+)?(?:on|happening|planned)?\s*(?:for\s+)?tomorrow(?:\s+(?:look like|looking like))?$|^what(?:'?s| is)\s+(?:on\s+)?(?:my\s+)?(?:calendar|schedule|diary)\s+tomorrow$|^tomorrow(?:'?s)?\s+(?:calendar|schedule|plan|day)$/;
const WEEK_COUNT_RE = /^how many (?:workouts|sessions|times)(?:\s+have i\s+(?:trained|worked out|lifted))?\s+(?:this week|so far this week)$|^how many times have i (?:trained|worked out|lifted) this week$|^(?:my\s+)?workouts? this week$/;
const SINCE_TRAINED_RE = /^how long (?:has it been |is it )?since i (?:last )?(?:trained|worked out|lifted|went to the gym)$|^when did i last (?:train|work out|lift|go to the gym)$/;
const REP_RE = /^(?:what(?:'?s| is)\s+)?(?:today(?:'?s)?\s+)?technique(?:\s+today)?$|^how many techniques?(?:\s+(?:do i have|are)\s*)?(?:left|remaining|to go|in my repertoire)?$|^(?:what(?:'?s| is)\s+)?(?:in\s+)?my repertoire$/;

const INBOX_RE = new RegExp([
  "^(?:what(?:'?s| is)?\\s*)?(?:in\\s+)?(?:my\\s+)?inbox$",
  `^how many ${THING}?\\s*(?:are\\s+)?(?:pending|waiting|in (?:my )?inbox)(?:\\s+(?:for me|in my inbox))?$`,
  `^how many (?:pending|waiting)(?:\\s+${THING})?$`,
  "^(?:anything|what'?s?) (?:pending|waiting)(?:\\s+for me)?$",
  `^(?:what|how many) ${THING} (?:are|do i have) (?:pending|waiting|in (?:my )?inbox)$`,
].join('|'));

const THANKS = /^(?:ok(?:ay)?|alright|perfect|great|nice|lovely|brilliant|awesome|cheers)?[,\s]*(?:thanks|thank you|ta|cheers|much appreciated|appreciate it)[,\s]*(?:mate|nova|jarvis|sir)?[.!]?$/i;
const AFFIRM = /^(?:ok(?:ay)?|alright|right|got it|understood|noted|sounds good|perfect|great|nice|good|cool|lovely|brilliant)[.!]?$/i;
const GREET = /^(?:hi|hey|hello|morning|good morning|afternoon|good afternoon|evening|good evening)[,\s]*(?:nova|jarvis)?[.!]?$/i;

export function smallTalkReply(question) {
  const q = normalize(question);
  // normalize() strips a leading "hey nova" — so a BARE wake phrase lands
  // here as an empty string. It still deserves an answer.
  if (!q) return /\b(nova|jarvis)\b/i.test(question || '') ? pick(['Sir?', 'Yes, sir?', 'Listening, sir.']) : null;
  if (THANKS.test(q)) return pick(['Any time, sir.', 'My pleasure, sir.', 'Of course, sir.']);
  if (AFFIRM.test(q)) return pick(['Right you are, sir.', 'Noted.', 'Very good, sir.']);
  if (GREET.test(q)) return pick(['Sir.', 'Good to see you, sir.', 'At your service, sir.']);
  return null;
}

export async function tryReflex(question, deps = defaultDeps) {
  const q = normalize(question);
  // small talk first: it must never reach the model, and it must never be
  // preceded by an ack about looking something up
  const chat = smallTalkReply(question);
  if (chat) return { matched: 'small-talk', text: chat, smallTalk: true };
  if (!q || q.length > 80 || NEEDS_THOUGHT.test(q)) return null;

  // THE CLOCK IS AN INPUT, NOT AN AMBIENT FACT. Every date answer below —
  // "yesterday", "2 days ago", "this week" — is arithmetic against today,
  // and a function that reads the wall clock itself can only be tested on the
  // day it was written. Two suites had silently rotted to red overnight
  // because of it. Callers pass the real clock; tests pass a fixed one.
  const now = deps.now ? new Date(deps.now) : new Date();
  const today = localDate(now);
  const yesterday = localDate(new Date(now.getTime() - 86_400_000));

  // ---- steps (today / yesterday) ----
  const steps = q.match(STEPS_RE);
  if (steps) {
    const days = await deps.recentDays().catch(() => []);
    const which = steps[1] === 'yesterday' ? yesterday : today;
    const day = days.find((x) => x.date === which);
    // NO READING IS AN ANSWER, AND IT IS THIS LAYER'S ANSWER TO GIVE.
    // This used to return null on "the model can go looking". Measured on
    // 14 Sep, when the morning's push had not landed yet: the model took
    // 41 SECONDS and then answered a different question entirely — it talked
    // about the day's protein instead of saying there was no step count. The
    // premise was wrong. `server/data/health/<date>.json` is the only place a
    // step count exists; when the row is not there, there is nothing to go
    // looking for, and the true answer is cheap.
    //
    // It is not a guess: it states the absence and the last real reading, with
    // its date. If the window holds nothing at all, something is wrong beyond
    // one missing morning and the model still gets it.
    if (day?.steps == null) {
      const last = [...days].reverse().find((x) => x.steps != null);
      if (!last) return null;
      const ago = last.date === yesterday ? 'yesterday' : `on ${spokenDate(last.date)}`;
      const asked = steps[1] === 'yesterday' ? 'yesterday' : 'today';
      return { matched: `steps-${asked}-absent`,
        text: `No step count has come through for ${asked} yet, sir — the last reading was ${last.steps.toLocaleString()} ${ago}.`,
        card: await card({ label: 'Steps', value: last.steps.toLocaleString(), caption: `LAST READING · ${ago.toUpperCase()}`, tone: 'ink' }) };
    }
    const when = steps[1] === 'yesterday' ? 'yesterday' : 'so far today';
    return { matched: `steps-${steps[1] === 'yesterday' ? 'yesterday' : 'today'}`,
      // "You're at 9,846 steps yesterday" is not a sentence — the present-tense
      // variant belongs to today only
      text: when === 'yesterday'
        ? pick([`${day.steps.toLocaleString()} steps yesterday, sir.`, `You did ${day.steps.toLocaleString()} steps yesterday.`])
        : pick([`${day.steps.toLocaleString()} steps ${when}, sir.`, `You're at ${day.steps.toLocaleString()} steps ${when}.`]),
      card: await card({ label: 'Steps', value: day.steps.toLocaleString(), caption: when.toUpperCase(), tone: 'cy' }) };
  }

  // ---- HRV ----
  if (/^(?:what(?:'s| is)?\s*)?(?:my\s+)?hrv(?:\s+today)?$/.test(q)) {
    const days = await deps.recentDays().catch(() => []);
    const d = [...days].reverse().find((x) => x.hrv != null);
    if (!d) return days.length ? absent({ key: 'hrv', noun: 'HRV reading', label: 'HRV' }) : null;
    const dated = d.date === today ? '' : ` — that's from ${d.date === yesterday ? 'yesterday' : d.date}`;
    return { matched: 'hrv', text: `HRV is ${Math.round(d.hrv)} milliseconds${dated}, sir.`,
      card: await card({ label: 'HRV', value: Math.round(d.hrv), unit: 'ms', caption: d.date === today ? 'TODAY' : d.date === yesterday ? 'YESTERDAY' : d.date, tone: 'cy' }) };
  }

  // ---- resting heart rate ----
  if (/^(?:what(?:'s| is)?\s*)?(?:my\s+)?(?:resting heart ?rate|rhr|resting hr)(?:\s+today)?$/.test(q)) {
    const days = await deps.recentDays().catch(() => []);
    const d = [...days].reverse().find((x) => x.restingHeartRate != null);
    if (!d) return days.length ? absent({ key: 'rhr', noun: 'resting heart rate reading', label: 'Resting heart rate' }) : null;
    const dated = d.date === today ? '' : ` — from ${d.date === yesterday ? 'yesterday' : d.date}`;
    return { matched: 'rhr', text: `Resting heart rate is ${Math.round(d.restingHeartRate)} beats per minute${dated}, sir.`,
      card: await card({ label: 'Resting heart rate', value: Math.round(d.restingHeartRate), unit: 'bpm', caption: d.date === today ? 'TODAY' : d.date === yesterday ? 'YESTERDAY' : d.date, tone: 'cy' }) };
  }

  // ---- sleep last night ----
  if (/^(?:what(?:'s| is| was)?\s*)?(?:my\s+)?sleep(?:\s+(?:last night|score|time))?$|^how (?:did|long did|much did|well did) i sleep(?:\s+last night)?$|^how many hours did i sleep(?:\s+last night)?$/.test(q)) {
    const days = await deps.recentDays().catch(() => []);
    const d = [...days].reverse().find((x) => x.sleepAsleepMinutes != null);
    // This one is not an occasional gap: on 14 Sep, ZERO of his 56 day files
    // had ever carried a sleep figure, because the health Shortcut does not
    // send Sleep Analysis. So every "how did I sleep" went to the model, every
    // time, to be told what this can say instantly — and the answer he needs is
    // not a number, it is which switch to flick.
    if (!d) return days.length ? absent({ key: 'sleep', noun: 'sleep reading', label: 'Sleep' },
      { setupHint: ' If your health Shortcut is not sending Sleep Analysis, that would be why.' }) : null;
    // the night's sleep is filed under the morning it ended — today's row is last night
    const when = d.date === today ? 'last night' : d.date === yesterday ? 'the night before last' : `on the night ending ${d.date}`;
    return { matched: 'sleep', text: `You slept ${hm(d.sleepAsleepMinutes)} ${when}, sir.`,
      card: await card({ label: 'Sleep', value: hm(d.sleepAsleepMinutes), caption: when.toUpperCase(), tone: 'vi' }) };
  }

  // ---- distance walked (today / yesterday) ----
  const dist = q.match(DISTANCE_RE);
  if (dist) {
    const days = await deps.recentDays().catch(() => []);
    const which = dist[1] === 'yesterday' ? yesterday : today;
    const day = days.find((x) => x.date === which);
    const km = day?.walkingRunningDistanceKm;
    if (km == null) {
      const last = [...days].reverse().find((x) => x.walkingRunningDistanceKm != null);
      if (!last) return null;
      const when = last.date === yesterday ? 'yesterday' : `on ${spokenDate(last.date)}`;
      return { matched: 'distance-absent',
        text: `No distance has come through for ${dist[1] === 'yesterday' ? 'yesterday' : 'today'} yet, sir — the last was ${last.walkingRunningDistanceKm.toFixed(1)} kilometres ${when}.`,
        card: await card({ label: 'Distance', value: last.walkingRunningDistanceKm.toFixed(1), unit: 'km', caption: `LAST READING · ${when.toUpperCase()}`, tone: 'ink' }) };
    }
    const when = dist[1] === 'yesterday' ? 'yesterday' : 'so far today';
    return { matched: `distance-${dist[1] === 'yesterday' ? 'yesterday' : 'today'}`,
      text: `${km.toFixed(1)} kilometres ${when}, sir.`,
      card: await card({ label: 'Distance', value: km.toFixed(1), unit: 'km', caption: when.toUpperCase(), tone: 'cy' }) };
  }

  // ---- VO2 max ----
  if (VO2_RE.test(q)) {
    const days = await deps.recentDays().catch(() => []);
    const withV = days.filter((x) => x.vo2Max != null);
    const d = withV[withV.length - 1];
    if (!d) return days.length ? absent({ key: 'vo2', noun: 'VO2 max reading', label: 'VO2 max' }) : null;
    // Apple recomputes it slowly, so the honest extra is the DIRECTION across
    // the window, never a day-to-day delta — a 0.1 move is not news.
    const first = withV[0];
    const delta = d.vo2Max - first.vo2Max;
    const dir = withV.length > 2 && Math.abs(delta) >= 0.3
      ? ` — ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)} across these ${withV.length} readings`
      : '';
    const dated = d.date === today ? '' : `, from ${d.date === yesterday ? 'yesterday' : d.date}`;
    return { matched: 'vo2max', text: `VO2 max is ${d.vo2Max.toFixed(1)}${dated}, sir${dir}.`,
      card: await card({ label: 'VO2 max', value: d.vo2Max.toFixed(1), caption: d.date === today ? 'TODAY' : d.date === yesterday ? 'YESTERDAY' : d.date, tone: 'vi' }) };
  }

  // ---- the to-do list ----
  if (TODO_RE.test(q)) {
    const list = await deps.todos?.().catch(() => null);
    if (!list) return null;
    const open = (list.items || []).filter((t) => !t.done);
    if (!open.length) return { matched: 'todos', text: 'Nothing open on your to-do list, sir.',
      card: await card({ label: 'To-do', value: 0, caption: 'OPEN', tone: 'good' }) };
    // the names, not just the count — a count alone sends him to look anyway
    const names = open.slice(0, 3).map((t) => speakable(t.text)).filter(Boolean);
    const more = open.length - names.length;
    return { matched: 'todos',
      text: `${open.length} open, sir: ${names.join('; ')}${more > 0 ? `, and ${more} more` : ''}.`,
      card: await card({ label: 'To-do', value: open.length, caption: 'OPEN', tone: 'gold' }) };
  }

  // ---- what he trained (today / yesterday / last) ----
  const trained = q.match(TRAINED_RE);
  if (trained) {
    const sessions = await deps.sessions?.().catch(() => null);
    if (!sessions || !sessions.length) return null;
    const asked = trained[1] === 'today' ? today : trained[1] === 'yesterday' ? yesterday : null;
    const s = asked ? sessions.find((x) => x.date === asked) : sessions[0];
    if (!s) {
      // he asked about a specific day and did not train it — that is an
      // answer, and the last session is the useful thing to add
      const last = sessions[0];
      const when = last.date === yesterday ? 'yesterday' : `on ${spokenDate(last.date)}`;
      return { matched: 'trained-none',
        text: `Nothing logged for ${trained[1]}, sir — your last session was ${last.routineName || 'a workout'} ${when}.`,
        card: await card({ label: 'Training', value: '—', caption: String(trained[1] || '').toUpperCase(), tone: 'ink' }) };
    }
    const lifts = (s.exercises || []).map((e) => e.name).filter(Boolean);
    const shown = lifts.slice(0, 3);
    const more = lifts.length - shown.length;
    const when = s.date === today ? 'today' : s.date === yesterday ? 'yesterday' : `on ${spokenDate(s.date)}`;
    return { matched: 'trained',
      text: `${s.routineName || 'A session'} ${when}, sir — ${shown.join(', ')}${more > 0 ? `, and ${more} more` : ''}.`,
      card: await card({ label: s.routineName || 'Session', value: `${lifts.length}`, unit: lifts.length === 1 ? 'lift' : 'lifts', caption: when.toUpperCase(), tone: 'cy' }) };
  }

  // ---- tomorrow (warm cache only) ----
  if (TOMORROW_RE.test(q)) {
    const events = await deps.calendarTomorrow?.().catch(() => null);
    if (events) {
      const timed = events.filter((e) => e.time).sort((a, b) => (a.time < b.time ? -1 : 1));
      if (!events.length) return { matched: 'calendar-tomorrow', text: 'Nothing on the calendar tomorrow, sir.' };
      const list = timed.slice(0, 4).map((e) => `${e.label} at ${e.time}`);
      const more = timed.length - list.length;
      const untimed = events.length - timed.length;
      return { matched: 'calendar-tomorrow',
        text: `${events.length} on tomorrow: ${list.join(', ')}${more > 0 ? `, and ${more} more` : ''}${untimed > 0 ? `, plus ${untimed} with no time` : ''}.`,
        card: await card({ label: 'Tomorrow', value: events.length, unit: events.length === 1 ? 'thing' : 'things', caption: 'CALENDAR', tone: 'cy' }) };
    }
  }

  // ---- how many sessions this week ----
  if (WEEK_COUNT_RE.test(q)) {
    const sessions = await deps.sessions?.().catch(() => null);
    if (sessions) {
      const { mondayIso } = await import('./cadence.js');
      const monday = mondayIso(today);
      const week = sessions.filter((x) => x.date >= monday);
      const names = week.map((x) => x.routineName).filter(Boolean);
      return { matched: 'week-count',
        text: week.length
          ? `${week.length} this week, sir${names.length ? ` — ${names.join(', ')}` : ''}.`
          : 'Nothing logged this week yet, sir.',
        card: await card({ label: 'This week', value: week.length, unit: week.length === 1 ? 'session' : 'sessions', caption: 'TRAINING', tone: week.length ? 'cy' : 'warn' }) };
    }
  }

  // ---- how long since he trained ----
  if (SINCE_TRAINED_RE.test(q)) {
    const sessions = await deps.sessions?.().catch(() => null);
    if (sessions?.length) {
      const last = sessions[0];
      const d = daysApart(last.date, today);
      const when = d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`;
      return { matched: 'since-trained',
        text: `${when}, sir — ${last.routineName || 'a session'} on ${spokenDate(last.date)}.`,
        card: await card({ label: 'Last session', value: d === 0 ? 'today' : String(d), unit: d > 1 ? 'days ago' : d === 1 ? 'day ago' : '', caption: (last.routineName || 'SESSION').toUpperCase(), tone: d > 3 ? 'warn' : 'cy' }) };
    }
  }

  // ---- his own curriculum ----
  if (REP_RE.test(q)) {
    const rep = await deps.repertoire?.().catch(() => null);
    if (rep?.all) {
      if (!rep.all.length) {
        return { matched: 'repertoire-empty',
          text: 'Nothing in your Repertoire yet, sir — send a clip and ask for the techniques in it.' };
      }
      const untaught = rep.all.filter((t) => !(rep.state.techniques?.[t.id]?.lastSurfacedOn)).length;
      const t = rep.today?.technique;
      return { matched: 'repertoire',
        text: t
          ? `Today is ${t.name}, sir — ${rep.today.position} of ${rep.all.length}, with ${untaught} still to come.`
          : `${rep.all.length} techniques, sir — ${untaught} still to come.`,
        card: await card({ label: 'Repertoire', value: rep.all.length, unit: 'techniques', caption: `${untaught} TO COME`, tone: 'mg' }) };
    }
  }

  // ---- when did he last train a MUSCLE GROUP ----
  const muscle = q.match(MUSCLE_RE);
  if (muscle) {
    const word = (muscle[1] || muscle[2] || '').trim();
    const want = new Set(MUSCLE_WORDS[word] || []);
    if (want.size) {
      const [sessions, library] = await Promise.all([
        deps.sessionsDeep?.().catch(() => null),
        deps.exerciseLibrary?.().catch(() => null),
      ]);
      // no library means no way to translate the word — fall through to the
      // model rather than answer from a guess
      if (sessions?.length && library?.exercises?.length) {
        const groupOf = new Map(library.exercises.map((e) => [e.id, e.muscleGroup]));
        const hit = sessions.find((sess) => (sess.exercises || [])
          .some((e) => want.has(groupOf.get(e.exerciseId || e.id))));
        if (!hit) {
          return { matched: 'muscle-none',
            text: `You have not trained ${word} in your last ${sessions.length} sessions, sir.`,
            card: await card({ label: word, value: '—', caption: 'NOT TRAINED', tone: 'warn' }) };
        }
        const days = daysApart(hit.date, today);
        const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
        const lifts = (hit.exercises || [])
          .filter((e) => want.has(groupOf.get(e.exerciseId || e.id)))
          .map((e) => e.name).filter(Boolean).slice(0, 3);
        return { matched: 'muscle-last',
          text: `${when === 'today' ? 'Today' : when === 'yesterday' ? 'Yesterday' : `${days} days ago`}, sir — ${hit.routineName || 'a session'} on ${spokenDate(hit.date)}${lifts.length ? `: ${lifts.join(', ')}` : ''}.`,
          card: await card({ label: word, value: days === 0 ? 'today' : String(days), unit: days > 1 ? 'days ago' : days === 1 ? 'day ago' : '', caption: (hit.routineName || 'SESSION').toUpperCase(), tone: days > 6 ? 'warn' : 'cy' }) };
      }
    }
  }

  // ---- a personal record on a named lift ----
  const prNamed = PR_RE.map((re) => q.match(re)).find(Boolean);
  if (prNamed) {
    const named = prNamed[1].trim().replace(/^(?:the|a)\s+/, '');
    if (named.length >= 3 && !/^(?:it|that|this|lift|weight|ever|day|week)$/.test(named)) {
      const sessions = await deps.sessions?.().catch(() => null);
      if (sessions && sessions.length) {
        const { personalRecords } = await import('./trainingAnalytics.js');
        const best = personalRecords(sessions);
        const pool = Object.entries(best).map(([id, b]) => ({ id, b, name: b.name || id }));
        const found = matchLift(pool, named);
        if (found.kind === 'which') {
          const names = found.choices.map((c) => c.name);
          const last = names.pop();
          return { matched: 'pr-which',
            text: `Which ${named}, sir — ${names.join(', ')} or ${last}?`,
            card: await card({ label: 'Which lift?', value: found.choices.length, caption: named.toUpperCase(), tone: 'gold' }) };
        }
        if (found.kind === 'one') {
          const b = found.lift.b;
          const top = b.e1rm || null;
          if (top) {
            // THE SET HE LOADED LEADS; THE ESTIMATE IS LABELLED. His 12 Sep
            // report — he read a bare "11.2kg" as a lift he had done — and the
            // rule that came out of it: never put a derived number in the slot
            // a measured one belongs in.
            const heavier = b.weight && b.weight.value > top.weight
              ? ` Your heaviest single is ${b.weight.value} for ${b.weight.reps}.` : '';
            return { matched: 'pr',
              text: `Best ${b.name} is ${top.weight} kilos for ${top.reps}, on ${spokenDate(top.date)}, sir — an estimated ${top.value} kilo one-rep max.${heavier}`,
              card: await card({ label: `${b.name} — best set`, value: `${top.weight} × ${top.reps}`, caption: `EST. 1RM ${top.value}KG · ${top.date}`, tone: 'gold' }) };
          }
          if (b.weight) {
            return { matched: 'pr',
              text: `Best ${b.name} is ${b.weight.value} kilos for ${b.weight.reps}, on ${spokenDate(b.weight.date)}, sir.`,
              card: await card({ label: `${b.name} — best set`, value: `${b.weight.value} × ${b.weight.reps}`, caption: b.weight.date, tone: 'gold' }) };
          }
        }
      }
    }
  }

  // ---- today's calendar: what's on / what's next (warm cache only) ----
  const cal = q.match(/^(?:what(?:'s| is)\s+)?(?:on|on today|on my calendar(?:\s+today)?|my (?:calendar|schedule|day)(?:\s+(?:today|look like|looking like))?|(next|coming up|my next (?:event|meeting|thing)))$/);
  if (cal) {
    const events = await deps.calendarToday?.().catch(() => null);
    if (!events) return null; // cold cache → the model, which can wait on iCloud honestly
    const nowHm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const timed = events.filter((e) => e.time).sort((a, b) => (a.time < b.time ? -1 : 1));
    if (cal[1]) {
      const next = timed.find((e) => e.time >= nowHm);
      if (!next) return { matched: 'calendar-next', text: 'Nothing else on the calendar today, sir.' };
      return { matched: 'calendar-next', text: `Next up: ${next.label} at ${next.time}${next.end ? ` until ${next.end}` : ''}.` };
    }
    if (!events.length) return { matched: 'calendar-today', text: 'Nothing on the calendar today, sir.' };
    const left = timed.filter((e) => e.time >= nowHm);
    const list = (left.length ? left : timed).slice(0, 4).map((e) => `${e.label} at ${e.time}`);
    const more = (left.length ? left : timed).length - list.length;
    return { matched: 'calendar-today',
      text: `${left.length ? `${left.length} still to come today` : `${events.length} on today`}: ${list.join(', ')}${more > 0 ? `, and ${more} more` : ''}.` };
  }

  // ---- weight ----
  // A PATTERN THAT MATCHES ONE PHRASING IS A REFLEX THAT MOSTLY DOES NOT FIRE.
  // Measured 14 Sep by asking Nova the way a person asks: "what did I weigh
  // last" missed this and cost 16.4 SECONDS in the model to read back a number
  // sitting on disk. The strictness that matters is NEEDS_THOUGHT above — it
  // already sends anything with why/should/trend/average to the model — so a
  // direct ask may be phrased however he phrases it.
  if (WEIGHT_RE.test(q)) {
    const days = await deps.recentDays().catch(() => []);
    const d = [...days].reverse().find((x) => x.weightKg != null);
    if (!d) return null;
    // the day he STOOD ON THE SCALE — a push repeating last week's number is
    // not a weigh-in, and saying "logged today" about one would be a lie
    const on = d.weightMeasuredOn || d.date;
    const dated = on === today ? '' : ` (last weighed ${on === yesterday ? 'yesterday' : on})`;
    return { matched: 'weight', text: `${d.weightKg} kilograms${dated}.`,
      card: await card({ label: 'Weight', value: d.weightKg, unit: 'kg', caption: on === today ? 'WEIGHED TODAY' : `LAST WEIGHED ${on === yesterday ? 'YESTERDAY' : on}`, tone: 'gold' }) };
  }

  // ---- fuel today: protein / calories ----
  const fuel = q.match(/^(?:what(?:'s| is| are)?|how (?:much|many))\s*(?:my\s+)?(protein|calories|kcal)(?:\s+(?:today|so far|have i (?:had|eaten|logged)(?:\s+today)?))?$/);
  if (fuel) {
    const log = await deps.foodToday().catch(() => null);
    if (!log) return null;
    const entries = log.entries || [];
    if (!entries.length) return { matched: 'fuel-empty', text: 'Nothing logged yet today, sir.' };
    const p = Math.round(entries.reduce((s, e) => s + (e.macros?.p || 0), 0));
    const kcal = Math.round(entries.reduce((s, e) => s + (e.macros?.kcal || 0), 0));
    return { matched: `fuel-${fuel[1]}`,
      text: fuel[1] === 'protein'
        ? `${p} grams of protein so far today, across ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}.`
        : `${kcal.toLocaleString()} calories logged so far today, sir.`,
      card: fuel[1] === 'protein'
        ? await card({ label: 'Protein', value: p, unit: 'g', caption: 'SO FAR TODAY', tone: 'cy' })
        : await card({ label: 'Calories', value: kcal.toLocaleString(), unit: 'kcal', caption: 'SO FAR TODAY', tone: 'gold' }) };
  }

  // ---- inbox pending ----
  // same widening: "how many things are in my inbox" cost 4.5s in the model
  if (INBOX_RE.test(q)) {
    const n = await deps.pendingCount().catch(() => null);
    if (n == null) return null;
    if (n === 0) return { matched: 'inbox', text: 'Your Inbox is clear, sir.', card: await card({ label: 'Inbox', value: 0, caption: 'PENDING', tone: 'good' }) };
    return { matched: 'inbox', text: pick([
      `${n} draft${n === 1 ? '' : 's'} waiting in your Inbox, sir.`,
      `${n} item${n === 1 ? '' : 's'} pending your word.`,
    ]), card: await card({ label: 'Inbox', value: n, caption: 'PENDING YOUR WORD', tone: 'gold' }) };
  }

  const status = await statusReflex(q, deps);
  if (status) return status;

  return null;
}
