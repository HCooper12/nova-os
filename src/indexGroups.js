// THE INDEX'S SHAPE (P3, 26 Sep 2026 — design/HOME-REDESIGN-PLAN.md §1.3, §5;
// mockup 56's Index). Under the `summary` style the More tab is this page: the
// iOS Settings shape, four groups, one row per place in Nova. Pure data, no
// JSX and no DOM, so server/test/indexRows.test.js can hold it to the one
// promise that matters: EVERY screen has a row, and no row goes nowhere.
//
// A row key is a screen key (src/screenKeys.js) — tapping it navigates there —
// or one of the two OVERLAY_DOORS, which open something that is not a screen.

export const INDEX_GROUPS = [
  { key: 'today', label: 'Today', rows: ['mission', 'workouts', 'recipes', 'inbox', 'todos', 'voice'] },
  { key: 'mind', label: 'Mind', rows: ['practice', 'leader', 'review', 'technique', 'library', 'documents', 'notes', 'journal'] },
  { key: 'life', label: 'Life', rows: ['money', 'shopping', 'stash', 'galaxy'] },
  { key: 'nova', label: 'Nova', rows: ['ops', 'briefing', 'code', 'console', 'ambient', 'settings'] },
];

// The two rows that are not screens: Daily review opens today's concept in
// Notes, Technique opens the Repertoire book. The value is the App method the
// row calls, so the test can check the method is real.
export const OVERLAY_DOORS = { review: 'openDailyReview', technique: 'openRepertoireBook' };

// Each row's name, and the hue its tile wears. COLOUR MEANS SOMETHING (§2b
// rule 8): a row takes a hue only when its domain already owns one elsewhere
// in Nova — Train and Voice the cyan of recovery and of Nova's own core, Fuel
// the green the protein ring is drawn in, Practice its rehearsal orange,
// Technique the magenta of its card, Review, Money and Galaxy violet, and
// Inbox and Lead gold, because gold is the colour of something waiting on his
// call. Everything else is the neutral ink, so the hues that remain are read.
// Hues are --nv-* token NAMES; the page reads them as var(<name>).
export const ROW_META = {
  mission: { label: 'Home', hue: '--nv-ink40' },
  workouts: { label: 'Train', hue: '--nv-cy' },
  recipes: { label: 'Fuel', hue: '--nv-good' },
  inbox: { label: 'Inbox', hue: '--nv-gold' },
  todos: { label: 'To-Do', hue: '--nv-ink40' },
  voice: { label: 'Voice', hue: '--nv-cy' },
  practice: { label: 'Practice', hue: '--nv-or' },
  leader: { label: 'Lead', hue: '--nv-gold' },
  review: { label: 'Daily review', hue: '--nv-vi' },
  technique: { label: 'Technique', hue: '--nv-mg' },
  library: { label: 'Library', hue: '--nv-ink40' },
  // what the agents wrote — every agent's, so no one agent's hue
  documents: { label: 'Documents', hue: '--nv-ink40' },
  notes: { label: 'Notes', hue: '--nv-ink40' },
  journal: { label: 'Journal', hue: '--nv-ink40' },
  money: { label: 'Money', hue: '--nv-vi' },
  shopping: { label: 'Shopping', hue: '--nv-ink40' },
  stash: { label: 'Stash', hue: '--nv-ink40' },
  galaxy: { label: 'Galaxy', hue: '--nv-vi' },
  ops: { label: 'Agents & Operations', hue: '--nv-cy' },
  briefing: { label: 'Briefing', hue: '--nv-ink40' },
  code: { label: 'Code', hue: '--nv-ink40' },
  console: { label: 'Console', hue: '--nv-ink40' },
  ambient: { label: 'Ambient', hue: '--nv-ink40' },
  settings: { label: 'Settings', hue: '--nv-ink40' },
};
