// ONE NOVA, ONE CANVAS, THE PURE FACTS (29 Oct 2026, design/mockups/
// 106-one-nova.html option A). The page is src/NovaStage.jsx inside
// src/screens/NovaThread.jsx; these are the rules it stands on, as plain
// functions (server/test/novaStage.test.js).
//
// REBUILT TO THE MOCKUP (31 Oct 2026, his words: "If I approve a mockup it
// should always and always be identical to the mock up when you deploy it").
// Every number below is the mockup's own, read from its CSS and script, in
// its 390 x 844 phone's coordinates (the stage's top is the screen's top).
// His one exception (29 Oct): the core is the REAL animated core, placed,
// sized and coloured as the mockup shows.

// ---------------------------------------------------------- the chrome --

// FOUR THINGS THE MOCKUP DOES NOT DRAW, each a working feature, each one
// switch here. His answers (31 Oct 2026):
//   tabBar  — false: no tab bar on the Nova page on the phone (he leaves by
//             the back swipe); the composer sits 14 px off the foot, as the
//             mockup. The desktop layout's navigation is not this switch.
//   attach  — true: the composer's + stays (a photo, a video or a file).
//   status  — true: the › (status, subtitles, New chat, Settings) stays, but
//             only in the history view, beside "Stage", never at rest.
//   briefMe — false: no Brief me (or ritual) pill on the stage; saying
//             "brief me" still works.
import { heardUpTo } from './interruptTurn.js';

export const ONE_NOVA_CHROME = { tabBar: false, attach: true, status: true, briefMe: false };

// ------------------------------------------------------------ the stage --

// THE SPEAKING HUE, IN ONE PLACE (31 Oct 2026): mockup 106 draws Nova
// speaking in GOLD; his own call of 4 Oct made speaking Living JADE
// (--nv-say) everywhere else. Built to the mockup; he is being asked. This
// one value decides the core's turn colour, the state dot, the plate's chip,
// the subtitles' lit word and underline, the pour and the embers on this
// page: 'gold' or 'jade'.
export const STAGE_SPEAK = 'jade'; // his call 31 Oct, after seeing both
export const STAGE_SPEAK_VAR = STAGE_SPEAK === 'gold' ? 'var(--nv-gold)' : 'var(--nv-say)';

// How far up he scrolls before the core has fully travelled from the stage
// to the presenter's spot (the mockup's 260 px).
export const TRAVEL_PX = 260;

// Where things sit on the stage, from the screen's top (mockup 106 CSS):
// the core's centre (CY = 250), the state word (.stword top 396), his words
// and the last exchange (.heard / .exch top 446), the plate (.plate top 426).
// The hint sits HINT_GAP above the composer's top and the plate's foot
// PLATE_GAP above it (in the mockup: 696 + 16 = 712, 50 under 762; 707, 55).
export const STAGE = { coreY: 250, stateY: 396, wordsY: 446, plateY: 426, hintGap: 50, plateGap: 55, side: 28, plateSide: 12 };

// The presenter's spot while he reads the history (.hdr .pres): the core's
// centre at (44, 68), drawn at 0.2 of the mockup's 300 px canvas.
export const PRESENTER = { x: 44, y: 68 };

// THE CORE'S SIZE ON THE STAGE, per state. The mockup draws its plain core
// at 0.84 of 300 px with a body of 0.74 of its radius at rest, 0.95
// listening, 0.8 speaking; the real core's body fills 0.92 of its box at
// rest, and in a turn its grain body is smaller (a sphere listening, the
// knot thinking, the shell speaking). These are the box scales at which the
// real core's VISIBLE body is the mockup's size in each state, measured
// frame against frame (scratchpad/identical, 31 Oct).
export const STAGE_SCALE = { rest: 0.622, listening: 1.12, thinking: 0.74, speaking: 0.72 };
export function stageScale(key) {
  return STAGE_SCALE[key] || STAGE_SCALE.rest;
}
// the presenter's core is the stage's, times the mockup's 0.2 / 0.84
export const PRESENTER_RATIO = 0.2 / 0.84;

// 0 at the foot of the scroll (the stage), 1 once he is TRAVEL_PX or more up
// into the history. No scroll room at all is the stage.
export function canvasProgress(scrollTop, scrollMax, travel = TRAVEL_PX) {
  const max = Number(scrollMax) || 0;
  if (max <= 0) return 0;
  const p = (max - (Number(scrollTop) || 0)) / (travel || TRAVEL_PX);
  return Math.max(0, Math.min(1, p));
}

// THE STATE, IN THE MOCKUP'S FOUR WORDS (Ready, Listening, Thinking,
// Speaking), each with its dot's colour: Ready and Thinking cyan, Listening
// violet, Speaking gold. The states the mockup does not draw keep their own
// honest words: a sentence that pushes back (red), offline, a take that did
// not arrive. The Mac writing down what he said is Thinking ("Hearing you"
// sits under it).
export function stageState(key, { contest = false } = {}) {
  switch (key) {
    case 'listening': return { word: 'Listening', tone: 'vi' };
    case 'thinking': return { word: 'Thinking', tone: 'cy' };
    case 'speaking': return contest ? { word: 'Pushing back', tone: 'contest' } : { word: 'Speaking', tone: STAGE_SPEAK };
    case 'offline': return { word: 'Offline', tone: 'quiet' };
    case 'failed': return { word: 'Didn’t arrive', tone: 'warn' };
    default: return { word: 'Ready', tone: 'cy' };
  }
}

// THE LAST EXCHANGE, two quiet lines on the stage: his newest words and
// Nova's answer after them (none yet if he has not been answered: an older
// answer is never shown as this one's). Text only, whitespace folded; the index lets a tap find
// the line in the history. A line still arriving is not shown half-said.
// A line he CUT INTO (1 Nov 2026) is shown as far as he heard it: up to the
// sentence his voice came in on, then "…" (src/interruptTurn.js heardUpTo).
export function lastExchange(lines) {
  const list = lines || [];
  const text = (m) => String(m?.text || '').replace(/\s+/g, ' ').trim();
  let you = null;
  let nova = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || !text(m)) continue;
    // a line he cut into ends where his voice came in (src/interruptTurn.js)
    if (m.who === 'nova' && !nova && !m.streaming && !you) nova = { i, who: m.agent || 'Nova', text: m.interrupted?.inAir ? heardUpTo(text(m), m.interrupted.inAir) : text(m) };
    else if (m.who === 'you' && !you) { you = { i, text: text(m) }; break; }
  }
  return { you, nova };
}

// THE DOCUMENT ON THE STAGE (1 Nov 2026, his words: "it still keeps saying
// here is the document here is the program here is a visual, but I have to
// actually scroll up to be able to view it in the chat history. Everything
// should be appearing on the main screen that I'm looking at."). A reply's
// document card was drawn only inside its history line. The finished reply
// names the document it carries: the first real token in its words (a
// document re-shown is named by token too), else the first one it filed.
// Pending and new-N tokens are not documents yet. Pure.
export function replyDocument(text, artifacts = []) {
  for (const m of String(text || '').matchAll(/\[\[artifact:([a-z0-9][a-z0-9-]{3,63})\]\]/gi)) {
    const id = m[1].toLowerCase();
    if (id !== 'pending' && !id.startsWith('new-')) return id;
  }
  const first = (artifacts || []).find((a) => a && a.id);
  return first ? first.id : null;
}

// THE PANEL ON THE PLATE, WHOLE (1 Nov 2026, his recording: the body panel
// showed as a sliver of its figure and a program's rows were cut mid-row).
// Mockup 106 draws no panel; whatever the plate holds of one is whole: the
// card entire, or its first whole pieces with the rest in the sheet a tap
// opens, or (when no whole piece fits) the card entire, drawn smaller.
//   natural  the card's own height
//   room     the height the plate can give it
//   cuts     heights at which the card divides cleanly (cleanCuts)
// A cut is taken only when it keeps at least `minShare` of the room;
// otherwise the whole card is scaled into the room.
export function panelFit({ natural, room, cuts = [], minShare = 0.5 }) {
  const n = Number(natural) || 0;
  const r = Number(room) || 0;
  if (n <= 0 || r <= 0 || n <= r + 0.5) return { mode: 'whole', height: n, scale: 1 };
  const cut = cuts.filter((y) => y > 0 && y <= r + 0.5).sort((a, b) => b - a)[0];
  if (cut && cut >= r * minShare) return { mode: 'cut', height: cut, scale: 1 };
  return { mode: 'scale', height: r, scale: r / n };
}

// Where a card divides cleanly: the boxes of its pieces, each { top, bottom,
// leaf } in the card's own coordinates (a leaf is a piece that must never be
// cut: text, a picture, a figure, a row with its own fill). A height is clean
// when no leaf crosses it; the candidates are the pieces' own feet.
export function cleanCuts(boxes) {
  const list = Array.isArray(boxes) ? boxes : [];
  const leaves = list.filter((b) => b && b.leaf);
  const ys = [...new Set(list.map((b) => Math.round(Number(b?.bottom) || 0)).filter((y) => y > 0))];
  return ys.filter((y) => !leaves.some((b) => b.top < y - 0.5 && b.bottom > y + 0.5)).sort((a, b) => a - b);
}
