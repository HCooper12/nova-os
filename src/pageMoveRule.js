// WHICH WAY A PAGE MOVES (mockup 101's motion list, 13 Oct 2026). Pure, so
// the rule is tested on its own (server/test/pageMoveRule.test.js); App.jsx
// takes the picture before the change and plays the move after it.
//
// Within one screen, a page has a depth: Fuel is 0 and its Recipes list 1;
// Train's routines are 0, a routine 1, a history 2. Deeper is a push from the
// right, shallower a pop back, a sideways hop (one routine to another) a push.
// The live session is not a page in that stack: it grows out of the card he
// tapped and shrinks back when he leaves it. A screen change is none of
// these; it rises like a tab (navigate, riseMain).

export function pageKey(s) {
  if (!s) return { id: '', depth: 0 };
  if (s.screen === 'recipes') return s.fuelView ? { id: `fuel:${s.fuelView}`, depth: 1 } : { id: 'fuel', depth: 0 };
  if (s.screen === 'workouts') {
    if (s.workoutsView === 'session') return { id: 'session', depth: 0, session: true };
    if (s.workoutsView === 'routine') return { id: `routine:${s.openRoutineId || ''}`, depth: 1 };
    if (s.workoutsView === 'history') return { id: `history:${s.historyRoutineId || ''}`, depth: 2 };
    return { id: 'train', depth: 0 };
  }
  return { id: s.screen || '', depth: 0 };
}

export function pageMove(prev, next) {
  if (!prev || !next || prev.screen !== next.screen) return null;
  const a = pageKey(prev);
  const b = pageKey(next);
  if (a.session && !b.session) return 'shrink';
  if (!a.session && b.session) return 'grow';
  if (a.id === b.id) return null;
  return b.depth < a.depth ? 'pop' : 'push';
}
