// THE FULL-SCREEN NOVA, THE PURE FACTS (3 Oct 2026). His decision, after
// design/mockups/68-nova-focus.html: "I love the stage option C and its
// dynamic animations… however I'd like the 'turn' appearance to be option
// A's the field appearance (albeit refined further). Perhaps when I am
// speaking the nova icon can dynamically and animatedly transition to the
// top so it then resembles option C's listen appearance. But I want the
// different colours present for the nova icon too when it is listening,
// idle and speaking as it currently does."
//
// The screen is src/NovaFocus.jsx; these are the rules it stands on, as
// plain functions (server/test/novaFocus.test.js).
import { agentOf } from './artifactClient.js';

// ------------------------------------------------------------ the phase --

// WHERE THE CORE IS. His turn (and the quiet states that are also his turn:
// a failed take, offline) is A's FIELD: the core large and centred among its
// embers. The moment the conversation moves (he talks, the Mac writes it
// down, she reads the vault, a reply is still arriving, she speaks) it is
// C's STAGE: the core travels to the presenter's spot at the top left and
// the glass plate carries the words.
const STAGE_KEYS = new Set(['listening', 'thinking', 'speaking']);
export function focusPhase(stateKey, { streaming = false } = {}) {
  return STAGE_KEYS.has(stateKey) || streaming ? 'stage' : 'field';
}

// The gaps inside one exchange (the reply's text has landed but its first
// sentence's audio is still being fetched; the beat between two sentences)
// must not send the core home and back. A move to the field waits this
// long; a move to the stage is immediate.
export const PHASE_HOLD_MS = 900;

// ------------------------------------------------------------- the tint --

// THE CORE KEEPS ITS COLOURS IN FOCUS (his words above): NovaCore's own
// state tints, the ones the tab bar's Nova and the classic Voice screen
// already wear: violet while listening, gold while she speaks, her blue at
// rest and while thinking (which says itself by speed and the chasing arcs).
// The thread's small head is not part of this: it stays form-only.
// The state is said in words beside the core as well, so nothing rides on
// colour alone.
const TINTS = {
  listening: { hue: 'violet', listening: true, speaking: false },
  speaking: { hue: 'gold', listening: false, speaking: true },
};
export function focusTint(stateKey) {
  return TINTS[stateKey] || { hue: 'blue', listening: false, speaking: false };
}
// the embers carry a gentler version of the same tint (RGB, for the canvas)
export const EMBER_RGB = { blue: [150, 215, 255], violet: [186, 168, 255], gold: [255, 214, 150] };

// THE FIELD, REFINED (his "albeit refined further"): fewer and finer embers
// than the mockup's 230, one canvas, capped here so no later change can turn
// it into a particle storm on his phone.
export const FIELD_EMBERS = 110;
export const FIELD_EMBERS_CAP = 140;

// ---------------------------------------------------------- the steps --

// WHILE SHE WORKS, THE STEPS CODE CAN SEE, NEVER A MODEL'S NARRATION:
// the Mac writing down what he said (only when this turn was spoken, which
// the screen saw as `heard`), then her reading the vault, each ticked as the
// next state arrives. Nothing here is a guess at what she is doing inside.
export function focusSteps({ hearing = false, heard = false, busy = false, answering = false } = {}) {
  const steps = [];
  if (hearing || heard) {
    steps.push({ key: 'written', label: hearing ? 'Your Mac is writing down what you said' : 'Your Mac wrote it down', done: !hearing });
  }
  if (!hearing && (busy || answering)) {
    steps.push({ key: 'vault', label: answering ? 'Read your vault' : 'Reading your vault', done: answering });
  }
  return steps;
}

// -------------------------------------------------------- the speaker --

// WHO IS SPEAKING, by the reply's own agent: the Coach in his coral, the
// Leader in magenta, Nova in his own starlight (--nv-nova, 3 Oct; artifactClient's AGENT, the hues the
// Agent World gave each being). One reply, one speaker: the record carries
// no per-sentence author, so none is invented.
export function speakerOf(agent) {
  const a = agentOf(agent);
  return { key: a.key, name: a.name, hue: a.hue, voiced: a.key !== 'nova' };
}

// ------------------------------------------------------- what to ask --

// TWO QUIET PILLS, AT MOST, of things he could say, taken from what the app
// already offers him (the status sheet's own doors: the ritual it is
// inviting, and Brief me). None is ever written for the occasion; with
// nothing to offer, there are no pills.
export function focusAsks(status, { offline = false } = {}) {
  if (!status || offline) return [];
  const out = [];
  if (status.ritual?.start) out.push({ key: 'ritual', label: status.ritual.label, icon: /evening|learn/i.test(status.ritual.label) ? 'moon' : 'sun', run: status.ritual.start });
  if (typeof status.briefMe === 'function') out.push({ key: 'brief', label: 'Brief me', icon: 'brief', run: status.briefMe });
  return out.slice(0, 2);
}

// ---------------------------------------------------------- the peek --

// the thread's newest line, peeking at the foot: who said it and its words
export function peekLine(lines) {
  const list = lines || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || !String(m.text || '').trim()) continue;
    const who = m.who === 'you' ? 'You' : m.who === 'system' ? 'Nova' : (m.agent || 'Nova');
    return { who, text: String(m.text).replace(/\s+/g, ' ').trim() };
  }
  return null;
}

// his newest words, once the Mac has them: what "thinking" shows
export function lastYours(lines) {
  const list = lines || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m?.who === 'you') return String(m.text || '').trim() || null;
    if (m?.who === 'nova' && !m.streaming) return null; // she has answered since
  }
  return null;
}

// ---------------------------------------------------------- captions --

export const CAPTIONS_KEY = 'novaos.captions';
export function captionsOn(stored) { return stored !== 'off'; }
