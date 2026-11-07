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

/* ------------------------------ his own words ----------------------------- */

const SIDE = /\b(left|right)\b/;

// Entries grouped by area: "Shoulder" twice is one area, and closing it closes both.
function areaGroups(active = []) {
  const out = new Map();
  for (const i of active) {
    const key = areaKey(i.area);
    if (!key) continue;
    if (!out.has(key)) out.set(key, { area: i.area, ids: [] });
    out.get(key).ids.push(i.id);
  }
  return [...out.values()];
}

// Two areas named by one word ("my back" with a lower and an upper back on the
// log, "my shoulder" with a left and a right) are his to tell apart.
function sharesAWord(a, b) {
  const words = (g) => { const t = areaTerms(g.area); return new Set([...t.exact, ...t.loose]); };
  const other = words(b);
  return [...words(a)].some((w) => other.has(w));
}

function settleNamed(groups, text) {
  if (groups.length < 2 || !groups.some((g, i) => groups.some((h, j) => i !== j && sharesAWord(g, h)))) return { pick: groups };
  const side = lower(text).match(SIDE)?.[1];
  const sided = side ? groups.filter((g) => lower(g.area).includes(side)) : [];
  return sided.length === 1 ? { pick: sided } : { ask: groups };
}

// No area named. "the pain's gone" is about a body whichever one; "close that
// concern" is about the last thing raised; "ignore that, it's okay" could be
// about anything, so only the line before it can make it about an injury.
const BARE_PAIN = [
  /^(?:the |that |this )?(?:pain|ache|soreness|niggle|injury)(?:'s| is| has)?\s+(?:\w+\s+)?(?:gone|fine|okay|ok|healed|sorted|cleared(?: up)?|resolved)\b/,
  /\b(?:doesn't|does not|no longer|don't)\s+(?:hurt|hurts|ache|aches)\s*(?:any ?more|now)?\b/,
  /\bno more pain\b/,
];
const BARE_CONCERN = [
  /\bclose (?:that|this|the)\s+(?:concern|injury|issue|entry)\b/,
  /\b(?:that|this|the) (?:concern|injury)(?:'s| is)?\s+(?:closed|done|over|gone)\b/,
  /\b(?:drop|forget|ignore|disregard)\s+(?:that|this|the)\s+(?:concern|injury)\b/,
];
const BARE_WEAK = [
  /\b(?:ignore|forget|disregard)\s+(?:that|this|it)\b.*\b(?:it's|its|it is|that's|that is)\s+(?:okay|ok|fine|alright)\b/,
  /\b(?:it's|its|it is|that's|that is)\s+(?:okay|ok|fine|alright)\b.*\b(?:ignore|forget|disregard)\s+(?:that|this|it)\b/,
];
const anyOf = (list, t) => list.some((re) => re.test(t));

function bareLevel(text) {
  const t = lower(text);
  if (ASKS.test(t) || NOT_OK.test(t) || KEEP_IT.test(t)) return null;
  const sentences = clauses(text);
  if (sentences.some((s) => anyOf(BARE_PAIN, s))) return 'pain';
  if (sentences.some((s) => anyOf(BARE_CONCERN, s))) return 'concern';
  return anyOf(BARE_WEAK, t) ? 'weak' : null;
}

// Is that the whole of what he said, or is there a question still to answer?
function isWhole(text, closes) {
  const sentences = clauses(text);
  const rest = sentences.filter((s) => !closes(s)).join(' ').split(' ').filter(Boolean).length;
  const said = sentences.filter(closes).join(' ').split(' ').filter(Boolean).length;
  return rest <= 3 && said <= 14;
}

/** Pure: read one thing he said against the active entries. `lastSaid` is the
 *  line Nova or Coach said just before, when there is one. Never guesses:
 *  `ask` names the areas that fit and closes nothing. */
export function readClosure(text, active = [], { lastSaid = null } = {}) {
  const none = { kind: 'none' };
  const groups = areaGroups(active);
  if (!groups.length || !lower(text)) return none;
  const named = groups.filter((g) => closesArea(text, g.area));
  if (named.length) {
    const whole = isWhole(text, (s) => named.some((g) => closesArea(s, g.area)));
    const { pick, ask } = settleNamed(named, text);
    return ask ? { kind: 'ask', groups: ask, whole } : { kind: 'close', groups: pick, whole };
  }
  const level = bareLevel(text);
  if (!level) return none;
  const whole = isWhole(text, (s) => bareLevel(s) === level);
  const inTheLastLine = lastSaid ? groups.filter((g) => namesArea(lastSaid, g.area)) : [];
  if (inTheLastLine.length === 1) return { kind: 'close', groups: inTheLastLine, whole };
  if (inTheLastLine.length > 1) return { kind: 'ask', groups: inTheLastLine, whole };
  if (level === 'weak') return none;
  // the last line was about something else, so "that concern" is too
  if (level === 'concern' && lastSaid) return none;
  return groups.length === 1 ? { kind: 'close', groups, whole } : { kind: 'ask', groups, whole };
}

const areaList = (groups) => {
  const names = groups.map((g) => g.area);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
};

/** Close by name (the verb's way in): the model's ACT, or a card's text. */
export async function closeArea(vaultPath, { area, ids = null }) {
  const { listInjuries, resolveInjuries } = await import('./injuryLog.js');
  const active = (await listInjuries(vaultPath)).filter((i) => !i.resolvedAt);
  const picked = Array.isArray(ids) && ids.length ? active.filter((i) => ids.includes(i.id)) : null;
  let groups = picked ? areaGroups(picked) : areaGroups(active).filter((g) => namesArea(area, g.area));
  if (!groups.length) throw new Error(`there's no open entry for "${String(area).trim()}" in your Injury Log`);
  const settled = settleNamed(groups, area);
  if (settled.ask) throw new Error(`that could be ${areaList(settled.ask)} — which one?`);
  groups = settled.pick;
  const closed = await resolveInjuries(vaultPath, groups.flatMap((g) => g.ids));
  return { ids: closed.map((c) => c.id), area: areaList(groups) };
}

/** A filed card that says an injury no longer counts closes it too. This is
 *  the 1 Nov gap: his yes on "he does not count his shoulder entries as an
 *  injury" wrote What Works and left the log saying moderate. Only ever called
 *  with text he approved. Ambiguity closes nothing: a card cannot be asked. */
export async function closeFromCard(vaultPath, texts = []) {
  const { listInjuries, resolveInjuries } = await import('./injuryLog.js');
  const active = (await listInjuries(vaultPath).catch(() => [])).filter((i) => !i.resolvedAt);
  const words = texts.filter(Boolean).join('. ');
  if (!active.length || !words) return null;
  const { pick } = settleNamed(areaGroups(active).filter((g) => closesArea(words, g.area)), words);
  if (!pick?.length) return null;
  const closed = await resolveInjuries(vaultPath, pick.flatMap((g) => g.ids));
  return closed.length ? { ids: closed.map((c) => c.id), area: areaList(pick) } : null;
}

// "Which one?" stays open for one answer, a few minutes. Held in memory: a
// restart loses a question nobody answered, and he simply says it again.
const ASK_TTL_MS = 5 * 60_000;
let pendingAsk = null;
export const _resetPendingAsk = () => { pendingAsk = null; };

function answerToAsk(text) {
  const held = pendingAsk;
  if (!held) return null;
  if (Date.now() - held.at > ASK_TTL_MS) { pendingAsk = null; return null; }
  const t = lower(text);
  if (t.split(' ').length > 8) { pendingAsk = null; return null; }
  pendingAsk = null;
  if (/^(?:no|nope|neither|none|leave it|never ?mind|not now|keep (?:it|them))\b/.test(t)) return { leave: true };
  if (/\b(?:both|all of them|all)\b/.test(t)) return { groups: held.groups };
  if (held.groups.length === 1 && /^(?:yes|yep|yeah|yea|ok|okay|sure|do it|go ahead|please)\b/.test(t)) return { groups: held.groups };
  const picks = held.groups.filter((g) => namesArea(t, g.area));
  return picks.length ? { groups: picks } : null;
}

// Cheap first look, so a door pays nothing on an ordinary question.
const MAY_CLOSE = /\b(?:fine|ok|okay|alright|all right|good|better|healed|gone|sorted|resolved|fixed|cleared|normal|ignore|disregard|dismiss|forget|close|drop|stop|hurt|hurts|ache|aches|injury|concern|issue|problem|count|counts|no more)\b/;

async function lastLineSaid({ now = Date.now(), withinMs = 30 * 60_000 } = {}) {
  try {
    const { readTurns } = await import('./conversationLog.js');
    const rows = await readTurns({ limit: 6 });
    const last = rows.filter((r) => r.who === 'nova').pop();
    return last && now - new Date(last.at).getTime() < withinMs ? last.text : null;
  } catch { return null; }
}

/** THE DOOR. Every way his words reach Nova calls this before a model. Returns
 *  null when it was not about a concern; otherwise `said` (the one line, when
 *  it is the whole of what he said, `whole`) and `note` (a bracket for the
 *  model, when there is more to answer). Closing runs the verb, so it has a
 *  receipt and an undo like every other act. */
export async function hearClosure(vaultPath, text, { source = 'voice', forceConfirm = false, direct = false } = {}) {
  const words = String(text || '').trim();
  if (!words || words.length > 2000) return null;
  const answer = answerToAsk(words);
  if (answer?.leave) return { whole: true, said: 'Left it open.', note: '[He left the concern open. Say so in a few words.]' };
  let read = null;
  if (answer) read = { kind: 'close', groups: answer.groups, whole: true };
  else {
    if (!MAY_CLOSE.test(lower(words))) return null;
    const { listInjuries } = await import('./injuryLog.js');
    const active = (await listInjuries(vaultPath).catch(() => [])).filter((i) => !i.resolvedAt);
    if (!active.length) return null;
    const lastSaid = bareLevel(words) ? await lastLineSaid() : null;
    read = readClosure(words, active, { lastSaid });
  }
  if (read.kind === 'none') return null;
  const areas = areaList(read.groups);
  if (read.kind === 'ask') {
    pendingAsk = { at: Date.now(), groups: read.groups };
    const said = `Which one do you want closed: ${read.groups.map((g) => g.area).join(', or ')}?`;
    return { whole: read.whole, said, asked: true, note: `[He may be closing a concern, and more than one area fits: ${areas}. Code closed nothing. Ask him which, in one short line.]` };
  }
  const { runVerb } = await import('./verbs.js');
  const out = await runVerb(vaultPath, words, { verb: 'injury.close', args: { area: areas, ids: read.groups.flatMap((g) => g.ids) } }, { source, forceConfirm, direct });
  if (out.proposal) return { whole: read.whole, said: `${out.proposal.title}, say yes and it's done.`, proposal: out.proposal, note: `[He closed ${areas}. It waits for his yes because he is driving. Say that in one short line.]` };
  return { whole: read.whole, said: out.acted.said, acted: out.acted, note: `[Code has just closed ${areas} in his Injury Log on his own words, with a receipt he can undo. Say so in one short line first, then answer the rest. Do not ask about it again.]` };
}

/* ------------------------- do the records agree? ------------------------- */

const SAYS_NO_INJURY = /[^.!?\n]*\bno (?:current |active |known |major )?(?:injur(?:y|ies)|limitations?)\b[^.!?\n]*[.!?]?/i;

/** Pure. Code compares the three places that speak about his body. Each line
 *  names both sides, so the Coach can put the choice to him in one sentence.
 *  An old audit: Profile said "No injuries", the log said moderate, and What
 *  Works said he does not count it. All three rode one prompt, unreconciled. */
export function recordContradictions({ profile = '', injuries = [], whatWorks = '', now = new Date() } = {}) {
  const out = [];
  const active = (injuries || []).filter((i) => !i.resolvedAt);
  const closed = closedAreas(injuries, { now });
  const profileText = String(profile || '');

  const none = active.length ? profileText.match(SAYS_NO_INJURY) : null;
  if (none) {
    const held = active.map((i) => `${i.area} (since ${i.startedAt})`).join(', ');
    out.push(`Profile says "${none[0].trim()}", but the Injury Log holds ${held} as active.`);
  }
  for (const sentence of profileText.split(/(?<=[.!?])\s+|\n+/)) {
    if (isStaleConcern(sentence, closed)) out.push(`Profile says "${sentence.trim().slice(0, 160)}", but he closed that area in the Injury Log.`);
  }

  const lines = String(whatWorks || '').split('\n')
    .map((l) => l.match(/^- (\d{4}-\d{2}-\d{2}) \S* ?(.+)$/))
    .filter(Boolean)
    .map((m) => ({ date: m[1], text: m[2] }));
  const noted = new Set();
  for (const group of areaGroups(active)) {
    const entries = active.filter((i) => areaKey(i.area) === areaKey(group.area));
    const started = entries.map((i) => i.startedAt).sort()[0];
    // a closing line older than the entry is history: the pain came back after it
    const line = lines.find((l) => closesArea(l.text, group.area) && (!started || l.date >= started));
    if (line && !noted.has(group.area)) {
      noted.add(group.area);
      out.push(`What Works (${line.date}) says "${line.text.slice(0, 160)}", but the Injury Log still holds ${group.area} as active.`);
    }
  }
  for (const line of lines) {
    const after = closed.filter((c) => line.date > c.resolvedAt);
    if (after.length && isStaleConcern(line.text, after)) out.push(`What Works (${line.date}) says "${line.text.slice(0, 160)}", written after he closed that area in the Injury Log.`);
  }
  return out;
}

export function contradictionBlock(lines = []) {
  if (!lines.length) return null;
  return `RECORDS THAT DISAGREE (code compared his Profile, Injury Log and What Works For Hayden). Put one to him once, in one short line, the next time training or injuries come up. Ask which is true. Do not act on either side until he says:\n${lines.map((l) => `- ${l}`).join('\n')}`;
}
