// STANDBY — "Hey, Evie, take five." / "Standing by." (design/EVIE-STUDY.md
// §4B; his yes, 15 Oct 2026: 30 minutes by default, alerts of tier "now"
// still get through).
//
// Three parts, all code, no model:
//   1. parseStandby(text): the idioms. STRICT: the whole utterance (once the
//      wake word, punctuation and a please are gone) must be the idiom, so
//      "take five photos" or "hang on to the receipt" are never standby.
//   2. the state: one small file, server/data/voice/standby.json
//      { until, since, minutes, queue, day, rot, clearedAt }. Expiry is BY
//      TIME, read on demand, never a timer: a restart in the middle of a
//      standby loses nothing, and an expired standby is simply off.
//   3. the gate: shouldSpeakNow / gateProactive. Every proactive channel
//      that reaches his phone (push.sendPush, telegram.sendTelegramText and
//      announceRecord) asks it first. During standby a non-urgent one is
//      QUEUED (kind + one line) instead of sent; urgent passes. The queue is
//      what "Back. Two things landed while you were out." counts.
//
// The lines he hears are written here, by code:
//   on:   "Standing by." the first time that day, then alternating
//         "Quiet until 3:40." / "Standing by for 30 minutes."
//   off:  "Back." and, when something was held, " Two things landed while
//         you were out."
//   expiry: nothing. Silence ends silently; the next turn is a normal turn.

import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDateISO } from './localDate.js';
import { parseWhen } from './whenParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'voice', 'standby.json');

export const DEFAULT_MINUTES = 30;
export const SHORT_MINUTES = 5;
export const MAX_MINUTES = 12 * 60; // "quiet until 3" said at 3:10 pm is not a 24-hour standby
export const QUEUE_MAX = 50;

/* --------------------------------------------------------------- parsing -- */

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, 'forty-five': 45, sixty: 60, ninety: 90,
};
const NUM = '(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty[- ]five|forty|sixty|ninety)';
const num = (w) => (/^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[String(w).replace('-', ' ')] ?? NUMBER_WORDS[w]);
const UNIT_MIN = '(?:minutes?|mins?)';
const UNIT_HR = '(?:hours?|hrs?)';

// His words, undressed: the wake word, "ok", a trailing please/thanks/name,
// and every comma and full stop. What is left must be the whole idiom.
export function normStandby(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/(?<!\d)[.:]|[.:](?!\d)/g, ' ') // "3:30" and "3.30" keep their colon
    .replace(/[,!?;…"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:hey|hi|ok|okay|yo)\s+)?(?:nova|jarvis|evie)\s+/, '')
    .replace(/^(?:ok|okay|alright|right|so)\s+/, '')
    .replace(/\s+(?:please|thanks|thank you|mate|nova|sir)$/, '')
    .replace(/^(?:please|just)\s+/, '')
    .trim();
}

const ON = (minutes) => ({ on: true, minutes });

/**
 * Is this utterance standby? Returns { on: true, minutes } | { on: false } |
 * null. `now` is only for "quiet until 3".
 */
export function parseStandby(text, now = new Date()) {
  const q = normStandby(text);
  if (!q || q.length > 60) return null;
  let m;

  // OFF — he is back
  if (/^(?:(?:i'm|im|i am)\s+(?:back|here)|back|(?:ok\s+)?resume|carry on|as you were|you can talk(?: again)?|you can speak(?: again)?|stand down standby|end standby|that's me back)$/.test(q)) {
    return { on: false };
  }

  // TAKE N. Bare "take five" is the idiom for "stand by" (his default, 30);
  // "take ten" / "take 15" / "take five minutes" means that many minutes.
  if (q === 'take five' || q === 'take 5' || q === 'take a break' || q === 'take a breather') return ON(DEFAULT_MINUTES);
  if ((m = q.match(new RegExp(`^take ${NUM}(?: ${UNIT_MIN})?$`)))) {
    const n = num(m[1]);
    return n ? ON(n) : null;
  }
  if ((m = q.match(new RegExp(`^take (?:an|one|1) ${UNIT_HR}$`)))) return ON(60);
  if (/^take a (?:minute|sec|second|moment)$/.test(q)) return ON(SHORT_MINUTES);

  // HANG ON — a short one
  if (/^(?:hang on|hold on|hold up|one sec(?:ond)?|one moment|one minute|just a (?:sec(?:ond)?|minute|moment)|(?:hang|hold) on a (?:sec(?:ond)?|minute|moment|tick)|give me a (?:minute|sec(?:ond)?|moment|tick)|gimme a (?:minute|sec(?:ond)?|moment))$/.test(q)) {
    return ON(SHORT_MINUTES);
  }
  if ((m = q.match(new RegExp(`^(?:give me|gimme) ${NUM} ${UNIT_MIN}$`)))) {
    const n = num(m[1]);
    return n ? ON(n) : null;
  }

  // BACK IN …
  if (/^(?:i'll be )?back in a (?:bit|while)$/.test(q)) return ON(DEFAULT_MINUTES);
  if (/^(?:i'll be )?back in a (?:minute|sec(?:ond)?|moment|tick)$/.test(q)) return ON(SHORT_MINUTES);
  if ((m = q.match(new RegExp(`^(?:i'll be )?back in ${NUM} ${UNIT_MIN}$`)))) {
    const n = num(m[1]);
    return n ? ON(n) : null;
  }

  // QUIET / STAND BY, with or without a length
  const QUIET = "(?:go quiet|be quiet|quiet|stay quiet|keep quiet|stand by|standby|stand-by|quiet mode|go on standby|go to standby)";
  if (new RegExp(`^${QUIET}(?: for (?:a bit|a while|now))?$`).test(q)) return ON(DEFAULT_MINUTES);
  if (new RegExp(`^${QUIET} for (?:an|one|1) ${UNIT_HR}$`).test(q)) return ON(60);
  if (new RegExp(`^${QUIET} for half an hour$`).test(q)) return ON(30);
  if ((m = q.match(new RegExp(`^${QUIET} for ${NUM} ${UNIT_MIN}$`)))) {
    const n = num(m[1]);
    return n ? ON(n) : null;
  }
  if ((m = q.match(new RegExp(`^${QUIET} for ${NUM} ${UNIT_HR}$`)))) {
    const n = num(m[1]);
    return n && n * 60 <= MAX_MINUTES ? ON(n * 60) : null;
  }
  if ((m = q.match(new RegExp(`^${QUIET} (?:until|till|til|'til) (.+)$`)))) {
    const read = parseWhen(`at ${m[1]}`, now);
    if (!read) return null;
    const minutes = Math.round((read.when.getTime() - now.getTime()) / 60_000);
    if (minutes < 1 || minutes > MAX_MINUTES) return null;
    return { on: true, minutes, until: read.when.toISOString() };
  }
  return null;
}

/* ----------------------------------------------------------------- state -- */

function readState() {
  try {
    if (!existsSync(STATE_PATH())) return {};
    const raw = JSON.parse(readFileSync(STATE_PATH(), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {}; // an unreadable file is no standby, never an error
  }
}

let chain = Promise.resolve(); // one writer at a time
function writeState(mutate) {
  const run = chain.then(async () => {
    const next = mutate(readState());
    await mkdir(path.dirname(STATE_PATH()), { recursive: true });
    const tmp = `${STATE_PATH()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
    await rename(tmp, STATE_PATH());
    return next;
  });
  chain = run.catch(() => {});
  return run;
}

const ms = (at) => (at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at));

/** { on, until, remainingMin, since, minutes, waiting } — expiry by the clock. */
export function standbyState(now = new Date()) {
  const s = readState();
  const until = s.until ? Date.parse(s.until) : NaN;
  const on = Number.isFinite(until) && until > ms(now);
  return {
    on,
    until: on ? s.until : null,
    since: on ? s.since || null : null,
    minutes: on ? s.minutes || null : null,
    remainingMin: on ? Math.max(1, Math.ceil((until - ms(now)) / 60_000)) : 0,
    waiting: on ? (s.queue || []).length : 0,
  };
}

// An OFF word only means something when there was a standby to end: on
// now, or expired and never ended by his word. Otherwise "carry on" is just
// conversation, and falls through.
export function standbyPending(now = new Date()) {
  const s = readState();
  if (!s.until) return false;
  if (s.clearedAt && Date.parse(s.clearedAt) >= Date.parse(s.since || 0)) return false;
  // a standby that ran out more than 12 hours ago is history, not pending
  return Date.parse(s.until) > ms(now) - MAX_MINUTES * 60_000;
}

/** Start (or extend) a standby. Returns { state, text }. */
export async function setStandby(minutes = DEFAULT_MINUTES, now = new Date(), { until: untilIso = null } = {}) {
  const n = Math.max(1, Math.min(MAX_MINUTES, Math.round(Number(minutes) || DEFAULT_MINUTES)));
  const t = ms(now);
  const until = untilIso ? new Date(untilIso) : new Date(t + n * 60_000);
  const day = localDateISO(new Date(t));
  let text = '';
  const saved = await writeState((s) => {
    const fresh = s.day !== day;
    const rot = fresh ? 0 : (s.rot || 0) + 1;
    text = standbyOnLine({ firstToday: fresh, rot, until, minutes: n });
    // a new standby starts a new queue: "while you were out" means THIS time
    const stillOn = s.until && Date.parse(s.until) > t && !(s.clearedAt && Date.parse(s.clearedAt) >= Date.parse(s.since || 0));
    return {
      until: until.toISOString(),
      since: stillOn && s.since ? s.since : new Date(t).toISOString(),
      minutes: n,
      queue: stillOn ? (s.queue || []) : [],
      day,
      rot,
      clearedAt: null,
    };
  });
  return { state: standbyState(new Date(t)), text, saved };
}

/** End it by his word. Returns { text, landed: [...] } and clears the queue. */
export async function clearStandby(now = new Date()) {
  const t = ms(now);
  let landed = [];
  await writeState((s) => {
    const since = Date.parse(s.since || 0) || 0;
    landed = (s.queue || []).filter((x) => !since || Date.parse(x.at) >= since);
    return { ...s, until: null, queue: [], clearedAt: new Date(t).toISOString() };
  });
  // HELD-ON-RESUME (15 Oct 2026, the alert layer): what was held goes out as
  // ONE combined push, the way quiet hours combines what it held. sendPush
  // still applies quiet hours; a send that fails never sinks "Back."
  if (landed.length) {
    import('./push.js')
      .then(({ sendPush }) => sendPush(combineLanded(landed)))
      .catch((e) => console.log(`standby: the combined push failed: ${e.message}`));
  }
  return { text: standbyOffLine(landed.length), landed };
}

// "3 while you were out: …" — the held lines as one notification. A push
// line arrives as "Title — body"; only its title is kept, Nova's own suffix
// dropped, so the body names WHAT landed rather than repeating it.
export function combineLanded(landed) {
  const n = landed.length;
  const names = landed.map((x) => String(x.text || x.kind || '').split(' — ')[0].trim()).filter(Boolean);
  let body = `${n} while you were out: ${names.join(' · ')}`;
  if (body.length > 220) body = `${body.slice(0, 219).replace(/\s+\S*$/, '')}…`;
  return { title: 'Nova — back', body, tag: 'standby-back', url: './#/inbox' };
}

/** Hand the queue over and empty it (without ending the standby). */
export async function drainStandby() {
  let out = [];
  await writeState((s) => { out = s.queue || []; return { ...s, queue: [] }; });
  return out;
}

/** Hold a proactive line while standing by. Bounded: the oldest go first. */
export async function queueWhileStandby({ kind = 'note', text = '', at = new Date() } = {}) {
  const line = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const saved = await writeState((s) => {
    const queue = [...(s.queue || []), { kind: String(kind).slice(0, 24), text: line, at: new Date(ms(at)).toISOString() }];
    while (queue.length > QUEUE_MAX) queue.shift();
    return { ...s, queue };
  });
  return saved.queue.length;
}

/* ------------------------------------------------------------------ gate -- */

/** May a proactive line reach him right now? Urgent always may. */
export function shouldSpeakNow({ urgent = false, now = new Date() } = {}) {
  if (urgent) return true;
  return !standbyState(now).on;
}

/**
 * The one call every proactive channel makes. True: send it. False: it was
 * queued (kind + one line) because he is standing Nova by.
 */
export async function gateProactive({ kind, text, urgent = false, now = new Date() } = {}) {
  if (shouldSpeakNow({ urgent, now })) return true;
  try {
    const n = await queueWhileStandby({ kind, text, at: now });
    console.log(`standby: held a ${kind} (${n} waiting) — ${String(text || '').slice(0, 60)}`);
  } catch (e) {
    console.log(`standby: could not queue a ${kind}: ${e.message}`);
  }
  return false;
}

/* ----------------------------------------------------------------- lines -- */

// "3:40" — his clock, twelve-hour, no am/pm (he knows which half he is in)
export function clockLine(at) {
  const d = new Date(ms(at));
  const h = ((d.getHours() + 11) % 12) + 1;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// "until 3:40 pm" — the island's wording, where a glance needs the half
export function untilLabel(at) {
  const d = new Date(ms(at));
  return `until ${clockLine(d)} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}

export function standbyOnLine({ firstToday, rot = 0, until, minutes }) {
  if (firstToday) return 'Standing by.';
  return rot % 2 === 1 ? `Quiet until ${clockLine(until)}.` : `Standing by for ${minutesWords(minutes)}.`;
}

const SMALL = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
export function standbyOffLine(count) {
  if (!count) return 'Back.';
  const n = count <= 10 ? SMALL[count] : String(count);
  return `Back. ${n} thing${count === 1 ? '' : 's'} landed while you were out.`;
}

function minutesWords(n) {
  if (n % 60 === 0) return n === 60 ? 'an hour' : `${n / 60} hours`;
  return `${n} minute${n === 1 ? '' : 's'}`;
}

/**
 * The route's whole job, in one call: his words → set/clear → the line.
 * null when the words are not standby (or an OFF word with nothing to end).
 */
export async function answerStandby(raw, now = new Date()) {
  const p = parseStandby(raw, now);
  if (!p) return null;
  if (p.on) {
    const { state, text } = await setStandby(p.minutes, now, { until: p.until || null });
    return { text, standby: { on: true, until: state.until, remainingMin: state.remainingMin } };
  }
  if (!standbyPending(now)) return null;
  const { text, landed } = await clearStandby(now);
  return { text, standby: { on: false, until: null, landed: landed.map((x) => ({ kind: x.kind, text: x.text, at: x.at })) } };
}
