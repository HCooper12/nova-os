// THE TURN AND THE REST (his ask, 21 Oct 2026): "it always responds with very
// lengthy replies despite potentially not having all the key information. It
// does not talk to me like a real person and go back-and-forth like I want
// to." Measured on his record that day: replies to his short turns ran to 96,
// 105 and 151 words, and the Coach spoke 565 to 1,080 words in one turn.
// Jarvis and E.V. answer in a few words and hold the detail until it is asked
// for (design/TALK-STUDY.md).
//
// The model decides where its turn ends; code holds the rest. A reply may
// carry a line that is exactly
//
//   MORE
//
// Everything before it is THE TURN: shown and spoken. Everything after it is
// THE REST: held on the line, revealed by code the instant he says "go on" or
// taps More, with no model call. Directive lines and document tokens after
// the mark stay with the turn (they are machinery, not words); VIS lines in
// the rest are dropped, because the rest is said without the glass.
//
// One shared format, every reader and writer here: the server's settle
// (server/lib/claudeCode.js) folds the finished reply, the client's stream
// (App.attachAskPoll) cuts at the mark so the rest is never spoken early.

const MARK_RE = /^[ \t]*MORE[ \t]*$/m;
// a half-typed mark on the last streamed line: withheld, never flashed
const HALF_MARK_RE = /^[ \t]*M(?:O(?:R(?:E)?)?)?[ \t]*$/;
const MACHINE_RE = /^\s*(?:(?:SHOW|PROPOSE|ACT|CARD|PLAY|RESEARCH|WATCH|CONSULT|WITHDRAW|REFLECT)\s*\{|\[\[artifact:[^\]]+\]\]\s*$)/;
const VIS_RE = /^\s*VIS\s*\{/;

/**
 * Split a finished reply at the MORE line.
 * → { said, held }  held is null when there is no mark, or nothing after it.
 * A mark with nothing before it is not a fold: the whole reply is said.
 */
// A DIRECTIVE IS ONE LINE, EVEN WHEN THE MODEL BREAKS IT (1 Nov 2026, the
// rep-range plan he agreed to): the model wrote PROPOSE {"kind":"plan",
// "goal":"…as they are. with the closing "} on the NEXT line. Every reader
// here works line by line, so the head stayed in the turn, the tail was held
// as prose, the JSON never parsed and nothing was filed. A directive whose
// braces have not closed takes the lines after it until they do. Pure.
const DIRECTIVE_HEAD = /^\s*(?:SHOW|PROPOSE|ACT|CARD|PLAY|RESEARCH|WATCH|CONSULT|WITHDRAW|REFLECT|VIS)\s*\{/;
function braceDepth(t) {
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') depth--;
  }
  return depth;
}
export function joinDirectives(text) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (DIRECTIVE_HEAD.test(line)) {
      let j = i;
      while (braceDepth(line) > 0 && j + 1 < lines.length && j - i < 40) { j++; line = `${line} ${lines[j].trim()}`; }
      if (braceDepth(line) === 0) { out.push(line); i = j; continue; }
      line = lines[i];
    }
    out.push(line);
  }
  return out.join('\n');
}

export function foldReply(text, { budget = null } = {}) {
  const s = joinDirectives(text);
  const m = MARK_RE.exec(s);
  if (!m) return budget ? budgetFold(s, budget) : { said: s, held: null };
  const before = s.slice(0, m.index).replace(/\s+$/, '');
  const machine = [];
  const prose = [];
  for (const line of s.slice(m.index + m[0].length).split('\n')) {
    if (MACHINE_RE.test(line)) machine.push(line.trim());
    else if (!VIS_RE.test(line)) prose.push(line);
  }
  const held = prose.join('\n').replace(/\n{3,}/g, '\n\n').trim() || null;
  if (!before.replace(/^\s*VIS\s*\{.*$/gm, '').trim()) {
    // nothing came before the mark: say it all rather than say nothing
    return { said: [held, ...machine].filter(Boolean).join('\n'), held: null };
  }
  return { said: [before, ...machine].join('\n'), held };
}

// ---------------------------------------------------------------------------
// THE SPOKEN BUDGET (1 Nov 2026, his report: "speaking for way too long",
// "asking me questions but then didn't give me a chance to respond because
// then it moved onto the next thing"). The MORE line asks the model to hold
// its detail; the Coach almost never did: its spoken replies since 28 Oct ran
// median 242 words, max 519, and 2 in 9 buried a question mid-reply. So CODE
// ends the turn when the model does not: the leading sentences up to the
// budget are said, a question further down is moved to the end of the turn
// (the last thing he hears is what he must answer), and the rest is held for
// "go on", exactly as a MORE line holds it. The client's stream cuts at the
// same place (budgetCut is prefix-stable: it only counts finished sentences),
// so nothing past the budget is spoken while the reply is still arriving.
export const SPOKEN_WORDS = 60;
export const DEPTH_WORDS = 150;
const DEPTH_RE = /\b(?:walk me through|talk me through|run me through|explain|in detail|all of it|everything|full (?:breakdown|rundown|picture)|go through|tell me all)\b/i;
/** The spoken budget for a turn answering these words. Pure. */
export function spokenBudget(question) {
  return DEPTH_RE.test(String(question || '')) ? DEPTH_WORDS : SPOKEN_WORDS;
}

// the receipt lines code writes under a Coach reply (server/lib/coachProposals.js
// receiptLines): shared format, so a change to their wording changes this too
export const RECEIPT_RE = /^\s*(?:Done: |Not done yet: |Not on a card, so nothing changed: |Replaced the card that was waiting)/;
// a sentence ends at a stop FOLLOWED BY a space or the end: "node-status.json:12" and
// "9.5 kg" are inside one
const UNIT_RE = /[\s\S]*?(?:[.!?]+["'”’)\]]*(?=\s|$)|\n|$)/g;
const wordsIn = (t) => {
  if (MACHINE_RE.test(t) || VIS_RE.test(t)) return 0;
  const w = t.replace(/\[\[artifact:[^\]]*\]\]/gi, '').trim();
  return w ? w.split(/\s+/).filter((x) => /[\p{L}\p{N}]/u.test(x)).length : 0;
};
// finished sentences and lines, with where each ends; an unfinished tail is not one
function unitsOf(s) {
  const out = [];
  let m;
  UNIT_RE.lastIndex = 0;
  while ((m = UNIT_RE.exec(s)) && m[0] !== '') {
    const end = m.index + m[0].length;
    const done = /[.!?]["'”’)]*$/.test(m[0]) || m[0].endsWith('\n');
    if (!done && end >= s.length) break;
    out.push({ start: m.index, end, text: m[0] });
  }
  return out;
}

/**
 * Where a spoken turn of `budget` words ends: the end of the last finished
 * sentence that fits (always at least the first). -1 when all of it fits.
 * Pure, and stable as the text grows.
 */
// THE MACHINE LINES ARE WHOLE (1 Nov 2026, his "make sure the changes have
// been made"): a PROPOSE line's JSON carried sentences ("…10-15. He will go
// heavy…"), the budget cut landed between two of them, half the line was said
// and half held, the directive never parsed and the rep-range plan he agreed
// to was never filed. A sentence inside a directive line is not a sentence of
// the turn: it is skipped, and no cut lands inside the line.
function machineSpans(s) {
  const spans = [];
  let at = 0;
  for (const line of s.split('\n')) {
    if (MACHINE_RE.test(line) || VIS_RE.test(line)) spans.push([at, at + line.length]);
    at += line.length + 1;
  }
  return spans;
}

export function budgetCut(text, budget = SPOKEN_WORDS) {
  const s = String(text ?? '');
  const spans = machineSpans(s);
  const inMachine = (u) => spans.some(([a, b]) => u.start < b && u.end > a);
  let words = 0;
  let cut = -1;
  for (const u of unitsOf(s)) {
    if (inMachine(u)) continue;
    const w = wordsIn(u.text);
    if (w && words && words + w > budget) return cut;
    words += w;
    cut = u.end;
  }
  // everything finished fits; an unfinished tail may yet push it over
  return words > budget ? cut : -1;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** Code's receipts as one spoken line, and the full list to hold. Pure. */
export function summariseReceipts(receipts = []) {
  if (receipts.length <= 1) return { line: receipts[0] || '', list: '' };
  const done = receipts.filter((r) => /^\s*Done: /.test(r)).length;
  const missed = receipts.length - done;
  const parts = [];
  if (done) parts.push(`Done: ${plural(done, 'change')} to your program.`);
  if (missed) parts.push(`${plural(missed, 'change')} did not land; the list says why.`);
  return { line: parts.join(' '), list: receipts.join('\n') };
}

/** Fold a reply the model did not fold: the budget said, a later question moved last, the rest held. Pure. */
export function budgetFold(text, budget = SPOKEN_WORDS) {
  const whole = joinDirectives(text);
  // directive lines leave first, whole, wherever they sit: they ride with the
  // turn (code reads them there) and are never cut or held
  const lines = whole.split('\n');
  const early = lines.filter((l) => MACHINE_RE.test(l)).map((l) => l.trim());
  const s = lines.filter((l) => !MACHINE_RE.test(l)).join('\n');
  const cut = budgetCut(s, budget);
  if (cut === -1) return { said: whole, held: null };
  const before = s.slice(0, cut).replace(/\s+$/, '');
  const machine = [...early];
  const prose = [];
  for (const line of s.slice(cut).split('\n')) {
    if (MACHINE_RE.test(line)) machine.push(line.trim());
    else if (!VIS_RE.test(line)) prose.push(line);
  }
  // code's own receipts (coachProposals.receiptLines): a change made, or one
  // that did not land, is always said, whatever the budget
  const receipts = [];
  const kept = [];
  // receipts may share a line ("Done: a. Done: b."): each is its own
  for (const line of prose) {
    if (RECEIPT_RE.test(line)) receipts.push(...line.trim().split(/(?<=[.!?])\s+(?=Done: |Not done yet: |Not on a card, so nothing changed: |Replaced the card)/));
    else kept.push(line.trim());
  }
  let rest = kept.join('\n');
  if (!rest.trim()) return { said: whole, held: null };
  // the last question he is asked, wherever it sat, ends the spoken turn
  const qs = unitsOf(rest).filter((u) => /\?["'”’)]*\s*$/.test(u.text.trim()));
  const q = qs[qs.length - 1];
  let ask = '';
  if (q) {
    ask = q.text.trim();
    rest = rest.slice(0, q.start) + rest.slice(q.end);
  }
  // MANY RECEIPTS ARE ONE LINE (1 Nov 2026, his "done blah blah blah done blah blah blah"): a
  // program rebuild writes a receipt per change, and all of them were said. Said: the count;
  // held: the list, first in the rest.
  const said1 = summariseReceipts(receipts);
  if (said1.list) rest = `${said1.list}\n\n${rest}`;
  const held = rest.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null;
  if (!held) return { said: whole, held: null };
  // NO OFFER (9 Nov 2026, his words: "it still asked me the stupid question
  // of 'want the rest'"). Code used to close every cut turn with "Want the
  // rest?"; a complete answer then ended on a question he never needed. The
  // held detail is shown as "The rest" on the line and "go on" still reveals
  // it. The only closing question is one the model itself asked him.
  const turn = [before, said1.line, ask].filter(Boolean).join('\n\n');
  return { said: [turn, ...machine].join('\n'), held };
}

/** What a reply still arriving may show or speak: everything before the mark. */
export function cutHeld(partial) {
  const s = String(partial ?? '');
  const m = MARK_RE.exec(s);
  if (m) return s.slice(0, m.index).replace(/\s+$/, '');
  const nl = s.lastIndexOf('\n');
  if (nl !== -1 && HALF_MARK_RE.test(s.slice(nl + 1)) && s.slice(nl + 1).trim()) return s.slice(0, nl).replace(/\s+$/, '');
  return s;
}

// "go on", "tell me more", "the rest", "what else", "and?" — said on their
// own, with an optional yes and an optional please. A closed set on purpose:
// anything longer is a new question and goes to the model as one.
const CONTINUE_RE = /^(?:(?:yes|yeah|yep|yup|sure|ok|okay|right)[,.! ]+)?(?:go on|carry on|keep going|go ahead|tell me more|more|say more|the rest|and the rest|give me the rest|tell me the rest|the rest of it|what else|continue|and)(?:[,. ]+please)?[.!?]*$/i;
// a bare yes counts only when the turn ended by OFFERING the rest, in words
// that are an offer of more and not a question of his own ("Today's session,
// or Thursday's?" takes a yes as its answer, never as "go on")
const BARE_YES_RE = /^(?:yes|yeah|yep|yup|sure|ok|okay|please|yes please|go for it|do it)[.!]*$/i;
const OFFER_RE = /\b(?:want|like|shall i|should i)\b[^.?!]{0,60}\b(?:rest|more|breakdown|detail|details|numbers|the lot)\b[^.?!]{0,20}\?\s*$/i;

function plain(words) {
  return String(words ?? '').trim().toLowerCase().replace(/^(?:nova|sir|hey nova)[, ]+/, '').replace(/\s+/g, ' ');
}

/**
 * Is this the words "give me the rest", for this line?
 * `line`: the latest settled reply ({ text, more, moreSaid }). `pending`: a
 * decision is waiting (a proposal, a gate) — then a bare yes is HIS yes to
 * that, never to the rest.
 */
export function asksForRest(words, line, { pending = false } = {}) {
  if (!line?.more || line.moreSaid) return false;
  const w = plain(words);
  if (!w || w.length > 40) return false;
  if (CONTINUE_RE.test(w)) return true;
  return !pending && BARE_YES_RE.test(w) && OFFER_RE.test(String(line.text || '').trim());
}

/**
 * The one bracket line the NEXT model turn carries when he did not ask for
 * the rest: the model wrote it, so without this it would assume he heard it.
 */
export const HELD_UNHEARD_LINE = '[He heard only your turn, not the detail you held after MORE. Do not refer to it as said.]';
