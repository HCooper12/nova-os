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

// ── the topic ───────────────────────────────────────────────────────────────

const WAKE = /^(?:(?:hey|hi|ok|okay|yo)\s+)?(?:nova|jarvis|evie)\b[,!.\s]*/i;
const WAKE_TAIL = /[,\s]+(?:nova|jarvis|evie|sir|mate)\s*$/i;
// politeness and hedges, anywhere in the sentence
const POLITE = /\b(?:please|kindly|for me|real quick|quickly|just|actually|possibly|maybe)\b/gi;
// what comes in front of the thing he wants, peeled off one layer at a time
const LEADS = [
  /^(?:can|could|would|will)\s+(?:you|ya)\s+/,
  /^(?:i\s+want|i'd\s+like|i\s+would\s+like|i\s+need|i\s+wanna)\s+(?:you\s+)?to\s+/,
  /^(?:do\s+you\s+mind|would\s+you\s+mind|mind)\s+/,
  /^(?:i'm|i\s+am)\s+(?:wondering|curious|asking)\s+(?:about\s+)?/,
  /^(?:let\s+me\s+know|let's\s+(?:look\s+at|talk\s+about|check)|let\s+us\s+check)\s+/,
  /^(?:have|take)\s+a\s+(?:quick\s+)?look\s+(?:at|into)\s+/,
  /^(?:check(?:\s+on|\s+in\s+on)?|checking|look\s+(?:at|into|over)|tell\s+me(?:\s+about)?|show\s+me|pull\s+up|pull|give\s+me|get\s+me|find(?:\s+out)?|remind\s+me(?:\s+of|\s+about)?|walk\s+me\s+through|talk\s+me\s+through|update\s+me\s+on|explain|go\s+over|go\s+through|review|summari[sz]e|analy[sz]e|work\s+out|figure\s+out|see|read|bring\s+up|open|help\s+(?:me\s+)?(?:with|on|out\s+with))\s+/,
  /^(?:what|how)\s+should\s+i\s+(?:do|think)\s+(?:about|with)\s+/,
  /^what\s+(?:do|did)\s+you\s+(?:think|make)\s+(?:about|of)\s+/,
  /^what\s+about\s+/,
  /^(?:what|how|when|where|why|which|who)(?:'s|\s+is|\s+are|\s+was|\s+were|\s+did|\s+does|\s+do|\s+has|\s+have|\s+should|\s+can|\s+could|\s+would|\s+am)?\s+/,
  /^(?:i|we)\s+(?:do|did|should|can|could|am|was|have|had)\s+/,
  /^(?:doing|going|tracking|looking|getting\s+on)\s+(?:on|with|for|at)?\s*/,
  /^(?:the\s+(?:state|status)\s+of|about|on|at|of|if|whether|that|to)\s+/,
  /^(?:is|are|was|were|does|did|do|has|have)\s+/,
];
// "my sleep has been this week" → "my sleep this week"; "Tuesday's session go" → "Tuesday's session"
const VERB_TAIL = /\s+(?:go|went|gone|going|been|look|looks|looking|doing|done|tracking|land|landed|turn\s+out|so\s+far|lately|recently|today\s+so\s+far)\s*$/;
const MID_VERBS = /\s+(?:has|have|had)\s+been\b|\s+(?:is|are|was|were)\s+(?:looking|doing|going|tracking)\b|\s+(?:is|are|was|were)\b/g;
// a clause break: everything after it is a second thought, not the topic
const CLAUSE = /\s+(?:and|because|cause|since|so|but|if|when|while|after|before|given|considering|which|that|then|i|we|he|she|they)\s+|[,;:—–]/;
const PREP = new Set(['over', 'in', 'on', 'for', 'from', 'with', 'during', 'across', 'about', 'at', 'to', 'by', 'into', 'against', 'versus', 'vs']);
const STOP = new Set(['the', 'a', 'an', 'it', 'this', 'that', 'these', 'those', 'them', 'they', 'things', 'thing', 'stuff', 'anything', 'something', 'everything', 'nothing', 'there', 'here', 'what', 'how', 'up', 'out', 'you', 'your', 'me', 'we', 'us', 'he', 'she', 'one', 'some', 'any', 'more', 'do', 'go', 'be', 'is', 'are', 'was', 'lot', 'bit', 'way', 'think', 'mean', 'know', 'like', 'want', 'need', 'help', 'now', 'again', 'okay', 'ok', 'well', 'so', 'yes', 'no', 'too', 'very', 'really', 'get', 'got', 'should', 'would', 'could', 'can']);
const TRAILING_JUNK = new Set([...PREP, 'the', 'a', 'an', 'and', 'or', 'of', 'my', 'your', 'our', 'this', 'that', 'is', 'are', 'was', 'were', 'has', 'have', 'been', 'be', 'do', 'did']);
const PROPER = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|nova|coach|leader|researcher|librarian)(?:'s)?$/;
// his voice, said back: what is his is "your"
const SWAP = { my: 'your', me: 'you', mine: 'yours', myself: 'yourself', i: 'you', "i'm": "you're", "i've": "you've", "i'd": "you'd", our: 'your', ours: 'yours', us: 'you', am: 'are' };

const capWord = (w) => w.charAt(0).toUpperCase() + w.slice(1);

export function extractTopic(question) {
  let s = String(question || '')
    // a bracketed preamble is the plumbing's, not his
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[“”"]/g, '')
    .replace(/[‘’]/g, "'")
    .trim();
  s = s.replace(WAKE, '').replace(WAKE_TAIL, '');
  // the first sentence carries the ask
  s = (s.split(/[.?!]\s+|[?!]$/)[0] || '').replace(/[.?!]+$/, '');
  // HIS CAPITALS SURVIVE: a name or an acronym mid-sentence ("Sam", "HRV")
  // is said back as he wrote it, not lowercased
  const cased = new Map();
  s.split(/\s+/).slice(1).forEach((w) => {
    const bare = w.replace(/[^A-Za-z0-9'%+-]/g, '');
    if (/^[A-Z]/.test(bare) && bare !== 'I' && !/^I'/.test(bare)) cased.set(bare.toLowerCase(), bare);
  });
  s = s.toLowerCase().replace(POLITE, ' ').replace(/\s+/g, ' ').trim();
  for (let guard = 0; guard < 12; guard++) {
    const before = s;
    for (const re of LEADS) s = s.replace(re, '').trim();
    if (s === before) break;
  }
  // what somebody SAID about a thing: the thing ("what did the podcast say
  // about zone 2" → "zone 2")
  s = s.replace(/^.*?\b(?:say|said|says|think|thinks|thought|recommend|recommends|mention|mentions|mentioned|wrote|write|told\s+you)\s+(?:about|on)\s+/, '');
  // a decision about himself ("should I deload", "is it worth…") names no
  // thing to say back: no topic beats a verb read out as a noun
  if (/^(?:(?:i|we|you)\s+(?:should|can|could|would|will|must|might)|it|there)\b/.test(s)) return null;
  // "I handle the conflict with Sam" → "the conflict with Sam"
  s = s.replace(/^(?:i|we|you)\s+(?:doing|going|tracking|looking|getting\s+on)\s+(?:on|with|for|at)?\s*/, '');
  s = s.replace(/^(?:i|we|you)\s+[a-z']+\s+/, '');
  s = s.split(CLAUSE)[0].trim();
  s = s.replace(MID_VERBS, '').replace(/(\S)\s+(?:looking|doing|going|tracking)\b/g, '$1').replace(/\s+/g, ' ').trim();
  for (let guard = 0; guard < 3; guard++) s = s.replace(VERB_TAIL, '').trim();
  let words = s.split(/\s+/).filter(Boolean).map((w) => w.replace(/[^a-z0-9'%+-]/g, '')).filter(Boolean);
  while (words.length && ['a', 'an', 'and', 'of', 'to'].includes(words[0])) words.shift();
  words = words.slice(0, 4);
  while (words.length && TRAILING_JUNK.has(words[words.length - 1])) words.pop();
  words = words.map((w) => SWAP[w] || w);
  if (!words.length) return null;
  // nothing but filler is not a topic ("it", "that thing", "your stuff")
  if (words.every((w) => STOP.has(w))) return null;
  // a leftover verb at the front means the grammar did not find the thing
  if (/^(?:is|are|was|were|has|have|did|does|do|should|would|could|can|will|be)$/.test(words[0])) return null;
  const topic = words.map((w) => cased.get(w) || (PROPER.test(w) ? capWord(w) : w)).join(' ');
  return topic.length >= 2 && topic.length <= 48 ? topic : null;
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
export function composeAck({ question, lane = 'ask', consult = null, now = Date.now(), used = [], texts = [] } = {}) {
  if (lane === 'reflex' || lane === 'verb') return null;
  const q = String(question || '').replace(/\[[^\]]*\]/g, ' ').trim();
  if (q.length < MIN_QUESTION) return null;
  if (SMALL_TALK.test(q)) return null;
  const topic = extractTopic(q);
  const agentLabel = consult && AGENTS[consult]?.label && !AGENTS[consult]?.code ? AGENTS[consult].label : null;
  const group = agentLabel ? 'consult' : laneOf(lane);
  const ctx = { topic, agent: agentLabel, used: Array.isArray(used) ? used : [], texts: Array.isArray(texts) ? texts : [], now, hint: verbHint(q, group) };
  let out = topic ? pick(FRAMES[group], ctx) : null;
  // no topic, or every topic sentence already said today: the bare frames
  if (!out) out = pick(BARE_FRAMES[group], { ...ctx, topic: null });
  if (!out) return null; // every sentence this lane has was said today: silence beats a repeat
  return { id: out.id, text: out.text, topic: out.id.includes('.bare.') ? null : topic, reset: out.reset, set: out.set };
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
  const ack = composeAck({ question, lane, consult, now, used: led.used, texts: led.texts });
  if (!ack) return null;
  await recordAck(ack, now).catch(() => {});
  return { id: ack.id, text: ack.text, topic: ack.topic };
}
