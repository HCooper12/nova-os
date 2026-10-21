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
export function foldReply(text) {
  const s = String(text ?? '');
  const m = MARK_RE.exec(s);
  if (!m) return { said: s, held: null };
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
// a bare yes counts only when the turn ended by offering the rest
const BARE_YES_RE = /^(?:yes|yeah|yep|yup|sure|ok|okay|please|yes please|go for it|do it)[.!]*$/i;

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
  return !pending && BARE_YES_RE.test(w) && /\?\s*$/.test(String(line.text || '').trim());
}

/**
 * The one bracket line the NEXT model turn carries when he did not ask for
 * the rest: the model wrote it, so without this it would assume he heard it.
 */
export const HELD_UNHEARD_LINE = '[He heard only your turn, not the detail you held after MORE. Do not refer to it as said.]';
