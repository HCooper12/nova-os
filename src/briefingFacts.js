// THE BRIEFING'S RULES, AS PLAIN FUNCTIONS (round 2, 9 Oct 2026).
// design/mockups/83-redesign-briefing-r2.html, approved "Looking good": A's
// playback on Nova's stage (src/NovaFocus.jsx in its briefing mode), C's
// boards at the end, B's page as Read, and an end card whose every verb says
// what it will do before he taps it. The screen is src/screens/Briefing.jsx,
// the view model src/vals/valsBriefing.js; these are the facts both stand on,
// pinned in server/test/briefingStage.test.js.
//
// No network, no React, no DOM.

// ------------------------------------------------------------- the end card --

// EVERY VERB SAYS WHAT IT DOES (his words on round 1, 7 Oct: "the 'keep it'
// etc options ... I don't know what that means. Is it information to store?
// ... Or is it something for me to consider or some kind of change to make?
// This is too ambiguous"). Sorted into what keeping the information, thinking
// it over and changing something mean, with Discard apart. Each line is
// written from what the code does today, and `calls` / `api` name the path,
// so server/test/briefingStage.test.js can hold the words to the code:
//   save    App.fileBriefing → api.inboxApprove → the briefing's route is
//           'note' (server/lib/briefing.js), whose filer writes Wiki/Inbox
//           (server/lib/inbox.js); the Library shelf reads Wiki/Sources
//   undo    App.undoFileBriefing → api.inboxUndo → the note undo deletes the
//           page only when its hash still matches (unedited)
//   ask     App.askBriefing → the stage's own microphone → App.doOrb →
//           askAboutBriefing → askNova with this briefing as its context
//   later   App.closeBriefing: nothing written; a pending record is never
//           expired and never trimmed (server/lib/inboxStore.js)
//   coach   not built (his call 3): drawn disabled, labelled so
//   discard App.discardBriefing → api.inboxDiscard; reopenRecord takes Coach
//           cards only, so there is no undo (his call 5)
export const VERB_GROUPS = [
  { key: 'keep', label: 'Keep the information' },
  { key: 'think', label: 'Think it over' },
  { key: 'change', label: 'Change something' },
  { key: 'none', label: 'Not for you' },
];

export const BRIEFING_VERBS = [
  {
    key: 'save', group: 'keep', glyph: 'tray', label: 'Save to your notes',
    line: 'A page in Wiki/Inbox that Nova and the agents can open, off your Library shelf.',
    calls: 'fileBriefing', api: 'inboxApprove',
  },
  {
    key: 'ask', group: 'think', glyph: 'ask', label: 'Ask about it',
    line: 'Nova answers here, from this briefing. Nothing goes into your vault.',
    calls: 'askBriefing', api: null,
  },
  {
    key: 'later', group: 'think', glyph: 'clock', label: 'Decide later',
    line: 'It waits in your Inbox, still playable. Nothing is written.',
    calls: 'closeBriefing', api: null,
  },
  {
    key: 'coach', group: 'change', glyph: 'swap', label: 'Hand a change to the Coach',
    line: 'Not built yet. For now, tell the Coach yourself.',
    calls: null, api: null, built: false,
  },
  {
    key: 'discard', group: 'none', glyph: 'cross', label: 'Discard', quiet: true,
    line: 'Nothing is written. It leaves your Inbox; no undo today.',
    calls: 'discardBriefing', api: 'inboxDiscard',
  },
];

// What the save row says once something has happened to it. `undo` is the
// Undo on the same row (the note filer's undo, which refuses an edited page).
export const SAVE_STATES = {
  saving: { label: 'Saving to Wiki/Inbox', line: 'Writing the page.' },
  saved: { label: 'Saved to Wiki/Inbox', line: 'Undo deletes the page, if you have not edited it.', undo: true },
  undoing: { label: 'Saved to Wiki/Inbox', line: 'Deleting the page.' },
  undone: { label: 'Save undone', line: 'The page is deleted. This briefing no longer waits in your Inbox.' },
  edited: { label: 'Saved to Wiki/Inbox', line: 'You have edited the page since, so it was left in place. Delete it in Obsidian if you want it gone.' },
  discarded: { label: 'Discarded', line: 'Nothing was written.' },
};

// Which rows the end card shows. Undecided: every verb. Saved: the save row
// is its done row, and Decide later, Discard and its group step aside (a
// saved briefing has nothing left to decide). Undone or discarded: nothing
// is waiting, so the save row says which, and only Ask stays beside it (and
// the Coach's slot, which says it is not built either way).
export function endCardRows(status, { saveState = null } = {}) {
  const s = saveState || (status === 'filed' ? 'saved' : status === 'undone' ? 'undone' : status === 'discarded' ? 'discarded' : null);
  const decided = s === 'saved' || s === 'undoing' || s === 'edited' || s === 'saving';
  const closed = s === 'undone' || s === 'discarded';
  return BRIEFING_VERBS
    .filter((v) => {
      if (v.key === 'save') return true;
      if (v.key === 'later' || v.key === 'discard') return !decided && !closed;
      return true;
    })
    .map((v) => (v.key === 'save' && s ? { ...v, done: { state: s, ...SAVE_STATES[s] } } : v));
}

// ------------------------------------------------------------- the parts --

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const countWord = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
export const titleCount = (n) => { const w = countWord(n); return w.charAt(0).toUpperCase() + w.slice(1); };

// The parts as the rail and the boards see them: one per section, with
// where it starts in the beat list, how many beats it has, and how far
// through it the voice is. `current` is the beat whose audio has STARTED
// (the honest clock, App.playBriefing's onPlay). The summary is no part.
export function partsOf(sections, beats, current) {
  const list = (sections || []).map((s, i) => {
    const idx = (beats || []).filter((b) => b.section === i).map((b) => b.i);
    return { n: i + 1, heading: s.heading || `Part ${i + 1}`, first: idx.length ? idx[0] : -1, count: idx.length, idx };
  });
  const cur = current >= 0 ? (beats || [])[current] : null;
  const curPart = cur && cur.section >= 0 ? cur.section : -1;
  return list.map((p, i) => {
    let f = 0;
    if (curPart > i) f = 1;
    else if (curPart === i && p.count) f = (p.idx.indexOf(current) + 1) / p.count;
    return { ...p, f, current: curPart === i };
  });
}

// Next part and back a part, as the voice command does them (App.tryBriefingVoice):
// next is the first beat of a later part; back is this part's start, or from
// its start, the part before. -1: there is no next part.
export function nextPartBeat(beats, current) {
  const sec = (beats || [])[Math.max(0, current)]?.section ?? -1;
  return (beats || []).findIndex((b) => b.section > sec);
}
export function backPartBeat(beats, current) {
  const list = beats || [];
  const startOf = (i) => { const sec = list[Math.max(0, i)]?.section; return list.findIndex((b) => b.section === sec); };
  const start = startOf(current);
  const target = current > start ? start : startOf(Math.max(0, start - 1));
  return Math.max(0, target);
}

// ------------------------------------------------------------ the panels --

// A PLAIN SENTENCE GETS NO PANEL (his rule of 1 Oct, drawn as yes in round
// 2): the server still names a heading card for every sentence without a
// term or a picture (server/lib/briefing.js visualFor, "never blank"), and
// the stage now draws nothing for it. Nova himself is the picture. A picture
// whose bytes have not arrived is no panel either: the term the sentence
// names stands in when there is one, otherwise nothing.
export function panelOf(beat, { glossary = [], urls = {} } = {}) {
  const v = beat?.visual;
  if (!v) return null;
  if (v.kind === 'image') {
    if (v.key && urls[v.key]) return { kind: 'image', key: `img:${v.key}`, src: urls[v.key], alt: v.alt || '', caption: v.caption || '', credit: v.credit || '' };
    return termOf(beat, glossary);
  }
  if (v.kind === 'clip' && v.videoId) {
    return {
      kind: 'clip', key: `clip:${v.videoId}`, title: v.title || '', caption: v.caption || v.title || '', channel: v.channel || '',
      poster: v.posterKey ? urls[v.posterKey] || null : null,
      embed: `https://www.youtube-nocookie.com/embed/${v.videoId}?rel=0&modestbranding=1&playsinline=1`,
    };
  }
  if (v.kind === 'term' && v.term) return { kind: 'term', key: `term:${v.term}`, term: v.term, plain: v.plain || '', of: glossary.length };
  return null;
}
function termOf(beat, glossary) {
  const lower = String(beat?.say || '').toLowerCase();
  const g = (glossary || []).find((x) => x.term && lower.includes(x.term.toLowerCase()));
  return g ? { kind: 'term', key: `term:${g.term}`, term: g.term, plain: g.plain || '', of: glossary.length } : null;
}

// WHAT EACH PART SHOWED, for its board at the end: its first picture, else
// its first clip's poster, else the first term it defined, else Nova
// himself (a part that showed nothing was a part where Nova was the picture).
export function boardPicture(part, beats, { glossary = [], urls = {} } = {}) {
  let term = null;
  for (const i of part.idx || []) {
    const p = panelOf(beats[i], { glossary, urls });
    if (!p) continue;
    if (p.kind === 'image') return { kind: 'image', src: p.src, alt: p.alt };
    if (p.kind === 'clip' && p.poster) return { kind: 'image', src: p.poster, alt: p.title };
    if (p.kind === 'term' && !term) term = { kind: 'term', term: p.term };
  }
  return term || { kind: 'core' };
}

// ------------------------------------------------------------- the phase --

// Where the stage is. READ is B's page; END is C's boards (Nova has finished
// and nothing is being asked); STAGE is a panel up (the core at the
// presenter's spot); HOME is Nova speaking a plain sentence, the core large
// and centred, Nova himself the picture.
export function briefingPhase({ mode = 'listen', atEnd = false, asking = false, panel = null } = {}) {
  if (mode === 'read') return 'read';
  if (atEnd && !asking) return 'end';
  return panel ? 'stage' : 'home';
}

// ------------------------------------------------------------ the boards --

// C's boards, laid on the table: three to a row at phone width, each a
// little askew so every title can be read; one row on the Mac, fanned.
export const BOARD_TILT = [-2.5, 1.5, -1.5, 2, -2, 2.5];
export const BOARD = { w: 104, h: 106, gap: 8, rowGap: 6 };
export function boardSpot(i, width) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const pad = (width - (3 * BOARD.w + 2 * BOARD.gap)) / 2;
  return { left: Math.round(pad + col * (BOARD.w + BOARD.gap)), top: 2 + row * (BOARD.h + BOARD.rowGap), tilt: BOARD_TILT[i % BOARD_TILT.length] };
}
export const MAC_BOARD = { w: 140, h: 200 };
export function macBoardSpot(i, n, stageWidth = 780) {
  const mid = (n - 1) / 2;
  const step = n > 1 ? Math.min(152, (stageWidth - MAC_BOARD.w - 20) / (n - 1)) : 0;
  const cx = stageWidth / 2 + (i - mid) * step;
  const tilt = n > 1 ? Math.round(((i - mid) / mid) * 6 * 10) / 10 : 0;
  return { left: Math.round(cx - MAC_BOARD.w / 2), top: Math.round(40 + Math.abs(i - mid) * 14), tilt };
}

// The meta lines: "Made Sunday · 5 parts · 6 sources" and the Mac's
// "5 parts · 6 sources · 4 terms · tap a board to hear that part again".
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
export function madeLine(createdAt, now = Date.now()) {
  const t = createdAt ? new Date(createdAt) : null;
  if (!t || Number.isNaN(t.getTime())) return null;
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return 'Made today';
  if (days === 1) return 'Made yesterday';
  if (days < 7) return `Made ${t.toLocaleDateString('en-AU', { weekday: 'long' })}`;
  return `Made ${t.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`;
}
export function countsLine({ parts = 0, sources = 0, terms = null } = {}) {
  return [plural(parts, 'part'), plural(sources, 'source'), terms == null ? null : plural(terms, 'term')].filter(Boolean).join(' · ');
}
