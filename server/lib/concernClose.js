// CORRECTIONS STICK (second-brain audit, 7 Nov 2026). He closed the shoulder
// concern three times in 17 days (15 Oct, 30 Oct, 1 Nov) and Coach asked about
// the physio again each time: the 1 Nov learning landed in What Works For
// Hayden, the Injury Log stayed active, and Coach reads the log before every
// answer. This file is the one reader of "that concern is over". Code decides
// here, no model: it reads his words against the areas really on the log, and
// it says which old text no longer speaks for him. Pure, except the door at
// the bottom, which writes through the verb rails with a receipt and an undo.

// How long a closed area stays named to the agents. Long enough that a
// fortnight of old debriefs and notes cannot bring it back.
export const CLOSED_DAYS = 90;

const NOT_AN_AREA = new Set(['my', 'the', 'left', 'right', 'both', 'side', 'sides', 'above', 'below', 'around', 'near', 'mid', 'middle', 'of', 'in', 'on']);

// A body word followed by one of these is an exercise or a training subject,
// not a body part that hurts: "shoulder press", "hip thrust", "back squat".
const NOT_THE_BODY = '(?![ -](?:press|presses|raise|raises|fly|flies|flye|flyes|thrust|thrusts|squat|squats|curl|curls|bridge|bridges|extension|extensions|row|rows|pulldown|pulldowns|abduction|adduction|shrug|shrugs|work|day|days|session|sessions|routine|exercise|exercises|lift|lifts|width|stretch|stretches|circles|volume|sets)\\b)';

const lower = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const areaKey = (area) => lower(area).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Lower back / hip (above glutes)" → the phrases a sentence may name it by.
// `exact` is the whole phrase; `loose` is its last word, which he also uses
// ("my back"), and counts only behind "my" or "the" because "back" alone is
// mostly the other word ("I'm back", "back squat").
export function areaTerms(area) {
  const parts = lower(area).replace(/[()]/g, '/').split(/[/,&]|\band\b/).map((p) => p.trim()).filter(Boolean);
  const exact = new Set();
  const loose = new Set();
  for (const part of parts) {
    const words = part.replace(/[^a-z ]+/g, ' ').split(' ').filter((w) => w && !NOT_AN_AREA.has(w));
    if (!words.length) continue;
    const stem = (w) => w.replace(/s$/, '');
    if (words.length === 1) { exact.add(stem(words[0])); continue; }
    exact.add([...words.slice(0, -1), stem(words[words.length - 1])].join(' '));
    loose.add(stem(words[words.length - 1]));
  }
  return { exact: [...exact], loose: [...loose] };
}

const termSource = (term) => `\\b${term.split(' ').map(escapeRe).join('[ -]')}s?\\b${NOT_THE_BODY}`;

// The regex source for "this area, as a body part". `null` for an empty area.
function areaSource(area) {
  const { exact, loose } = areaTerms(area);
  const alts = [...exact.map(termSource), ...loose.map((t) => `(?:my|his|the)\\s+${termSource(t)}`)];
  return alts.length ? `(?:${alts.join('|')})` : null;
}

export function namesArea(text, area) {
  const src = areaSource(area);
  return src ? new RegExp(src).test(lower(text)) : false;
}

const OK_WORD = "(?:fine|ok|okay|alright|all right|all good|good now|better now|all better|healed|gone|sorted|resolved|fixed|cleared(?: up)?|back to normal|not an issue|not a problem|no issue|no problem|no longer an issue)";
const AREA_NOUN = '(?:pain|injury|thing|issue|niggle|concern|problem|soreness|ache|stuff|point|note)';
const STATE = "(?:is|are|feels?|seems?|has been|have been|been|has|'s|'re)";
const FILLER = '(?:all|totally|completely|actually|really|pretty much|now|at the moment|right now)';
const HURT = '(?:hurt|hurts|hurting|pain|painful|sore|pinch|pinches|pinching|ache|aches|aching|flare|flares|flaring|tweak|tweaked)';

// A sentence that says the opposite, asks, or only wonders.
const ASKS = /\?\s*$|^(?:is|are|does|do|did|can|could|should|would|will|how|what|why|when|has|have|am|if|whether|once|until|unless|after|before)\b/;
const NOT_OK = new RegExp(`(?:\\bnot|n't|\\bnever|\\bhardly|far from)\\s+(?:\\w+\\s+){0,2}(?:fine|ok|okay|alright|all right|good|better|healed|gone|sorted|resolved|fixed)\\b`);
const KEEP_IT = /(?:don't|do not|never|not|won't|shouldn't|can't|cannot)\s+(?:\w+\s+){0,2}(?:ignore|close|forget|disregard|dismiss|drop)\b/;
const STILL_HURTS = new RegExp(`\\b(?:still|but|although|though|except|however)\\b[^.!?]*\\b${HURT}\\b`);
const SOMEONE_ELSE = "\\b(?:mate|friend|wife|mum|mom|dad|brother|sister|girlfriend|partner|colleague|boss|client|nurse|patient)(?:'s)?\\s+(?:\\w+\\s+)?";

const clauses = (text) => lower(text).split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

// One sentence: does it close this area? The three shapes below are his own,
// from the record: "my shoulder pain is okay", "ignore anything relating to my
// shoulder", "it is not a shoulder injury".
function sentenceCloses(s, src) {
  if (ASKS.test(s) || NOT_OK.test(s) || KEEP_IT.test(s) || STILL_HURTS.test(s)) return false;
  if (new RegExp(`${SOMEONE_ELSE}${src}`).test(s)) return false;
  const shapes = [
    `${src}(?:\\s+${AREA_NOUN})?\\s+(?:${STATE}\\s+)?(?:${FILLER}\\s+)*${OK_WORD}\\b`,
    `${src}(?:'s|'re)\\s+(?:${FILLER}\\s+)*${OK_WORD}\\b`,
    `\\b(?:ignore|disregard|dismiss|forget(?: about)?|close|stop (?:asking|raising|mentioning|bringing up|worrying)(?: about)?)\\b[^.!?]*${src}`,
    `\\b(?:drop|clear)\\s+(?:that\\s+|the\\s+|this\\s+|my\\s+)?${src}(?:\\s+${AREA_NOUN})?(?:\\s|$|[.,!])`,
    `\\bnot an?\\s+${src}\\s+(?:injury|issue|problem|concern)`,
    `${src}(?:\\s+${AREA_NOUN})?\\s+(?:is not|isn't|aren't)\\s+(?:an?\\s+)?(?:injury|issue|problem|concern)`,
    `\\bno (?:more\\s+)?${src}\\s+(?:pain|issue|injury|problem|problems|concern)`,
    `\\b(?:does not|doesn't|do not|don't|no longer)\\s+count\\b[^.!?]*${src}`,
    `${src}[^.!?]*\\bno longer (?:counts?|an issue|a problem|an injury|a concern)`,
    `${src}[^.!?]*\\b(?:does not|doesn't|do not|don't)\\s+(?:hurt|bother|count)`,
    `\\b(?:pain|ache|soreness|niggle) (?:in|on) (?:my |his |the )?${src} (?:is|has) (?:all |now |completely )?(?:gone|cleared|healed|resolved|fine|okay|ok)`,
  ];
  return shapes.some((shape) => new RegExp(shape).test(s));
}

/** Does this text say this area is over? Reads a sentence at a time, because
 *  "my shoulder is fine, my knee is not" must never read as the knee. */
export function closesArea(text, area) {
  const src = areaSource(area);
  if (!src) return false;
  return clauses(text).some((s) => sentenceCloses(s, src));
}

/* ------------------------------ closed areas ------------------------------ */

/** The areas he has closed lately. An area with an active entry is not closed:
 *  pain that came back outranks the old resolution. */
export function closedAreas(injuries = [], { now = new Date(), days = CLOSED_DAYS } = {}) {
  const list = Array.isArray(injuries) ? injuries : [];
  const openKeys = new Set(list.filter((i) => !i.resolvedAt).map((i) => areaKey(i.area)));
  const cut = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const byArea = new Map();
  for (const i of list) {
    if (!i.resolvedAt || i.resolvedAt < cut) continue;
    const key = areaKey(i.area);
    if (!key || openKeys.has(key)) continue;
    const had = byArea.get(key);
    const physio = /\bphysio/i.test(String(i.note || '')) || !!had?.physio;
    byArea.set(key, { area: i.area, resolvedAt: !had || i.resolvedAt > had.resolvedAt ? i.resolvedAt : had.resolvedAt, physio });
  }
  return [...byArea.values()];
}

/** Which of the closed areas had already closed by the time `date` was written.
 *  Anything written AFTER a closure is new evidence and keeps its voice. */
export function closedAsOf(closed = [], date = null) {
  if (!date) return closed;
  const day = String(date).slice(0, 10);
  return closed.filter((c) => day <= c.resolvedAt);
}

const CONCERN = /\b(?:pain|painful|sore|soreness|injur\w*|physio\w*|pinch\w*|hurt\w*|niggle\w*|ache\w*|aching|strain\w*|tweak\w*|instab\w*|concern\w*)\b/;

/** Is this one sentence an old worry about a closed area? */
export function isStaleConcern(sentence, closed = []) {
  const s = lower(sentence);
  return closed.some((c) => {
    if (closesArea(s, c.area)) return false;
    if (namesArea(s, c.area) && CONCERN.test(s)) return true;
    // "the shoulder note is what I'd carry forward" has no pain word in it
    if (new RegExp(`${areaSource(c.area)}\\s+(?:note|flag|issue|thing|problem)s?\\b`).test(s)) return true;
    return !!c.physio && /\bphysio/.test(s);
  });
}

/** The same text with the sentences about a closed area taken out. Line
 *  structure stays. Empty when nothing else was in it. */
export function scrubClosed(text, closed = []) {
  const raw = String(text || '');
  if (!raw || !closed.length) return raw;
  const kept = [];
  for (const line of raw.split('\n')) {
    const left = line.split(/(?<=[.!?])\s+/).filter((sentence) => !isStaleConcern(sentence, closed)).join(' ');
    // a blank line stays a blank line; a line emptied here goes altogether
    if (left.trim() || !line.trim()) kept.push(left);
  }
  return kept.join('\n').trim();
}
