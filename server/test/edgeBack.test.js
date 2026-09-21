// THE LEFT-EDGE BACK SWIPE. 19 Sep 2026, from a reel on Jakob's Law: people
// have already learned this gesture in every other app, and one that does not
// honour it makes them learn something instead.
//
// Nova reserved the space for it a fortnight before it existed —
// swipeCore.EDGE_GUARD_PX is 24 and every swipeable row refuses to start a
// gesture there, on the stated grounds that "a gesture starting in the OS
// back-swipe gutter is never ours". True in a browser. Nova's manifest is
// `display: 'standalone'`, and an installed PWA has no back button and no edge
// swipe at all — so the gutter was kept clear for nothing.
//
// Pinned here: the gesture only starts in that gutter, it never fires on the
// entry the app booted with, and the thresholds are numbers rather than a
// thumb's opinion.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  edgeDecision, canGoBack, depthOf, dragProgress, lastEdgeGesture,
  commitDistance, COMMIT_FRACTION, FLICK_PX_PER_MS, FLICK_MIN_FRACTION,
  COMMIT_COOLDOWN_MS,
} from '../../src/edgeBack.js';
import { EDGE_GUARD_PX, INTENT_PX, startsInEdgeGuard } from '../../src/swipeCore.js';

// dt defaults SLOW on purpose: at the default 100ms almost any real distance
// is also a flick, and a distance case would pass for the wrong reason.
const drag = (over = {}) => ({ startX: 4, dx: 0, dy: 0, dt: 900, width: 375, ...over });

test('THE GESTURE LIVES IN THE GUTTER THE ROWS ALREADY AVOID', () => {
  // if these two ever disagree, a row swipe and the back swipe fight for the
  // same pixels and one of them loses silently
  assert.equal(edgeDecision(drag({ startX: EDGE_GUARD_PX - 1, dx: 200 })), 'lock');
  assert.equal(edgeDecision(drag({ startX: EDGE_GUARD_PX, dx: 200 })), 'none');
  // ...and 'none' wins even once locked: a gesture that never started in the
  // gutter can never become a back swipe partway through
  assert.equal(edgeDecision(drag({ startX: EDGE_GUARD_PX, dx: 200, locked: true })), 'none');
  assert.equal(startsInEdgeGuard(EDGE_GUARD_PX - 1), true);
  assert.equal(startsInEdgeGuard(EDGE_GUARD_PX), false);
});

test('IT TAKES HALF THE SCREEN — his report: a small swipe triggered it by accident', () => {
  const locked = (o) => drag({ locked: true, ...o });
  const need = commitDistance(375);
  assert.equal(need, Math.round(375 * COMMIT_FRACTION));
  assert.equal(edgeDecision(locked({ dx: need - 1 })), 'tracking');
  assert.equal(edgeDecision(locked({ dx: need })), 'commit');
  // the 88px that was triggering by accident is now nowhere near enough
  assert.equal(edgeDecision(locked({ dx: 88 })), 'tracking');
  // and it scales with the screen he is actually holding
  assert.ok(commitDistance(430) > commitDistance(375));
  assert.ok(commitDistance(320) >= 120, 'a tiny screen must still need a real pull');
});

test('a flick still counts, but only a real one that got a third of the way', () => {
  const locked = (o) => drag({ locked: true, ...o });
  const need = commitDistance(375);
  const third = Math.ceil(need * FLICK_MIN_FRACTION);
  // fast AND far enough
  assert.equal(edgeDecision(locked({ dx: third + 2, dt: (third + 2) / 1.2 })), 'commit');
  // fast but barely moved — the accidental brush he reported
  assert.equal(edgeDecision(locked({ dx: 30, dt: 20 })), 'tracking');
  // far enough but slow — still needs the full distance
  assert.equal(edgeDecision(locked({ dx: third + 2, dt: 3000 })), 'tracking');
  assert.ok(FLICK_PX_PER_MS > 0 && FLICK_MIN_FRACTION > 0 && FLICK_MIN_FRACTION < 1);
});

test('ONE PAGE PER GESTURE — the cooldown is real and long enough to mean it', () => {
  assert.ok(COMMIT_COOLDOWN_MS >= 300, 'a second commit could ride the same thumb');
});

// ---- 22 Sep: the three ways a THUMB broke what a synthetic drag passed ----

test('A FINGER JITTERS. One pixel left at the start must not kill the gesture', () => {
  // the shipped bug: `if (dx < 0) return "cancel"` on the very first move,
  // before any direction was established. A finger landing on glass always
  // wobbles; the test data never did.
  assert.equal(edgeDecision(drag({ dx: -1, dy: 0 })), 'waiting');
  assert.equal(edgeDecision(drag({ dx: -3, dy: 2 })), 'waiting');
  assert.equal(edgeDecision(drag({ dx: 0, dy: 0 })), 'waiting');
});

test('A THUMB ARCS. A locked gesture cannot be taken away by vertical drift', () => {
  // the second shipped bug: the vertical test re-ran on every move, so a drag
  // that had been horizontal for 80px was cancelled by the upward curve a
  // thumb makes as it travels right across a phone.
  // a full pull with a thumb's arc on it still commits
  assert.equal(edgeDecision(drag({ dx: commitDistance(375) + 10, dy: 40, locked: true })), 'commit');
  // and a half-pull with a big arc is still just tracking, not a cancel
  assert.equal(edgeDecision(drag({ dx: 60, dy: 55, locked: true })), 'tracking');
  // ...and a finger wandering back toward the edge is undoing the drag, not
  // cancelling it — only the release decides
  assert.equal(edgeDecision(drag({ dx: -30, locked: true })), 'tracking');
});

test('the direction is decided by the app\u2019s OWN rule, not a private one', () => {
  // inventing a second rule here was the mistake under the other two:
  // swipeCore.decideDirection is tuned and proven on his device.
  assert.equal(edgeDecision(drag({ dx: 2, dy: 30 })), 'cancel', 'a real scroll is not cancelled');
  assert.equal(edgeDecision(drag({ dx: INTENT_PX + 8, dy: 4 })), 'lock');
  // the ambiguous middle waits rather than guessing
  assert.equal(edgeDecision(drag({ dx: INTENT_PX + 8, dy: INTENT_PX + 3 })), 'waiting');
});

test('the gesture leaves a receipt, so "not working" is answerable', () => {
  // the first cut shipped verified-on-synthetic-events and failed on his
  // phone with no way to find out why. Settings reads this.
  assert.equal(typeof lastEdgeGesture, 'function');
  assert.equal(lastEdgeGesture(), null, 'a fresh module should have no gesture recorded');
});

test('IT NEVER FIRES ON THE ENTRY NOVA BOOTED WITH', () => {
  // at depth 0 "back" leaves the app entirely, which is not what the gesture
  // means and is not something a swipe should be able to do by accident
  assert.equal(canGoBack(null), false);
  assert.equal(canGoBack({}), false);
  assert.equal(canGoBack({ novaDepth: 0 }), false);
  assert.equal(canGoBack({ novaDepth: 1 }), true);
  assert.equal(canGoBack({ novaDepth: 7 }), true);
  // a foreign history entry (another script's pushState) reads as depth 0
  assert.equal(depthOf({ something: 'else' }), 0);
  assert.equal(depthOf(undefined), 0);
  assert.equal(depthOf({ novaDepth: 'three' }), 0);
});

test('navigate stamps the depth it reads back', async () => {
  // the wiring: if App stops stamping, canGoBack is false forever and the
  // gesture silently never fires — the failure mode that kept haptics dead
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const app = await readFile(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'App.jsx',
  ), 'utf8');
  assert.match(app, /pushState\(\{ novaDepth: depthOf\(window\.history\.state\) \+ 1 \}/,
    'navigate no longer stamps the history entry');
  assert.match(app, /<EdgeBack \/>/, 'the gesture is not mounted');
});

test('THE PREVIOUS PAGE IS REVEALED UNDERNEATH, which is what he asked for', async () => {
  // His third report, with an Apple Settings recording: "I still want to be
  // able to see the page being swiped back to 'underneath' the current page
  // as I'm swiping." A blue sliver is not that.
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const hook = await readFile(path.join(root, 'src', 'edgeBack.js'), 'utf8');

  // the current screen is snapshotted, and the snapshot is what moves
  assert.match(hook, /cloneNode\(true\)/, 'nothing snapshots the page being left');
  assert.match(hook, /snap\.style\.transform/, 'the snapshot does not move with the finger');
  // the real app navigates underneath it, so what is revealed is the real thing
  assert.match(hook, /onBack\?\.\(\);\s*\/\/ instant/, 'it does not navigate underneath the snapshot');
  // a clone's scroll is not carried by cloneNode — he filmed being thrown to
  // the top of the page he was leaving
  assert.match(hook, /snap\.scrollTop = main\.scrollTop/);
  // and a fixed child inside the clone would anchor to the layer, not the page
  assert.match(hook, /position === 'fixed'\) el\.style\.position = 'absolute'/);
  // Apple's shadow down the leading edge
  assert.match(hook, /boxShadow/);
});

test('a cancelled drag puts the screen back', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const hook = await readFile(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'edgeBack.js',
  ), 'utf8');
  // the navigation happens at LOCK, so a cancel has to undo it
  assert.match(hook, /window\.history\.forward\(\)/, 'a cancelled swipe leaves him on the wrong screen');
  // ...and the layer is dropped AFTER, or the previous screen flashes
  const fwd = hook.indexOf('window.history.forward()');
  const drop = hook.indexOf('teardown', fwd);
  assert.ok(drop > fwd, 'the snapshot is removed before the screen is restored — it will flash');
});

test('a drag-driven back skips the view transition', async () => {
  // the gesture animates two layers by hand; a view transition at the same
  // moment would cross-fade the thing it is already sliding
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const app = await readFile(path.join(root, 'src', 'App.jsx'), 'utf8');
  const hook = await readFile(path.join(root, 'src', 'edgeBack.js'), 'utf8');
  assert.match(hook, /export function edgeDragInProgress/);
  assert.match(app, /if \(edgeDragInProgress\(\)\) apply\(\); else this\.withTransition\(apply\);/,
    'a swipe and a view transition will run at the same time');
});

test('THE APP\u2019S OWN LAYOUT IS NEVER TRANSFORMED — the fault he filmed', async () => {
  // The first cut put a transform on <main>. A transformed ancestor becomes
  // the containing block for every position:fixed descendant inside it, so
  // the recipe overlay stopped being pinned to the viewport and painted on
  // top of the list beneath — three screens' text superimposed, on video.
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const hook = await readFile(path.join(root, 'src', 'edgeBack.js'), 'utf8');
  const cmp = await readFile(path.join(root, 'src', 'EdgeBack.jsx'), 'utf8');
  // it may transform ITS OWN snapshot; it may never transform <main>
  assert.doesNotMatch(hook, /main\.style\.transform/, 'the gesture is transforming app layout again');
  assert.doesNotMatch(cmp, /getEl/, 'the component is reaching into the app\u2019s own elements again');
  // every layer it paints is its own, fixed, and appended outside the layout
  assert.match(hook, /document\.body\.appendChild\(snap\)/);
  assert.match(hook, /document\.body\.appendChild\(scrim\)/);
});

test('progress runs 0..1 and never goes backwards', () => {
  assert.equal(dragProgress(0, 375), 0);
  assert.equal(dragProgress(-50, 375), 0);
  assert.equal(dragProgress(commitDistance(375), 375), 1);
  assert.equal(dragProgress(9999, 375), 1, 'progress must clamp');
  let prev = -1;
  for (let dx = 0; dx <= 400; dx += 10) {
    const v = dragProgress(dx, 375);
    assert.ok(v >= prev, `progress went backwards at dx=${dx}`);
    prev = v;
  }
});

test('BACK ANIMATES LIKE FORWARD', async () => {
  // navigate() always ran its screen change through withTransition; popstate
  // swapped instantly, so the swipe cut where a tap dissolved.
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const app = await readFile(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'App.jsx',
  ), 'utf8');
  // a TAPPED back (the browser button, a deep link) still dissolves like a
  // forward navigation; only a drag opts out, because the drag IS the animation
  assert.match(app, /this\.popH = \(\) => \{[\s\S]{0,420}withTransition\(apply\)/,
    'back still swaps instantly while forward dissolves');
});
