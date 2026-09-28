// EVERY screen the render block in src/App.jsx can actually draw. This list
// and that block are one contract: a key here with no renderer, or a renderer
// whose key is missing here, is a blank page — the chrome and the dock draw,
// nothing sits between them, and NOTHING is logged. Found on 4 Sep by
// navigating to 'fuel' (the Fuel tab's real key is 'recipes'): an empty main
// and a silent console.
//
// It previously omitted 'ops', 'stash' and 'ambient', all of which DO render —
// so their hashes did not survive a reload even though the screens worked.
//
// Its own module since P3 (26 Sep 2026, design/HOME-REDESIGN-PLAN.md §5): the
// Index lists every one of these, and server/test/indexRows.test.js reads this
// list to prove it does — which it could not do while the list lived inside
// App.jsx. 'index' is the Index itself (the More tab under `summary`), so it is
// a screen with no row of its own.
export const SCREEN_KEYS = ['mission', 'inbox', 'voice', 'galaxy', 'code', 'recipes', 'shopping', 'stash',
  'ops', 'ambient', 'todos', 'workouts', 'notes', 'library', 'leader', 'practice', 'journal', 'money', 'settings', 'briefing', 'console',
  'index', 'documents'];
