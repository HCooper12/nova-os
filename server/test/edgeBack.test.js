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
  edgeDecision, edgeMode, underlayOffset, settleMs, PARALLAX, SETTLE_MIN_MS, SETTLE_MAX_MS, canGoBack, depthOf, dragProgress, lastEdgeGesture,
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
  // it navigates underneath the snapshot — on the next frame, so the first
  // drag frame paints before a whole screen re-renders
  assert.match(hook, /requestAnimationFrame\(\(\) => \{ if \(s\.live\) onBack\?\.\(\); \}\)/,
    'it does not navigate underneath the snapshot');
  // a clone's scroll is not carried by cloneNode — he filmed being thrown to
  // the top of the page he was leaving
  assert.match(hook, /snap\.scrollTop = main\.scrollTop/);
  // A FIXED CHILD TRAVELS WITH THE CLONE FOR FREE, because the clone is
  // transformed from its first paint and a transformed ancestor is the
  // containing block for its fixed descendants. The first cut instead walked
  // every element in the page calling getComputedStyle — a forced style
  // resolution across the whole DOM at the instant his finger started moving,
  // which is the stutter he described as "clunky" three reports running.
  assert.doesNotMatch(hook, /querySelectorAll\('\*'\)/,
    'the gesture walks the whole DOM again — that is the stutter');
  // a CALL, not the word — the comment explaining why it is gone must survive
  assert.doesNotMatch(hook, /getComputedStyle\(/,
    'a forced style resolution is back on the gesture-start path');
  assert.match(hook, /transform: 'translate3d\(0,0,0\)'/,
    'the clone is not transformed from the first paint, so fixed children will not travel with it');
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
  // it may transform ITS OWN snapshot. <main> moves only as the parallax
  // underlay (25 Sep, his Claude recording), and only when nothing inside it
  // is position:fixed, which is the case that broke on 22 Sep
  assert.doesNotMatch(hook, /main\.style\.transform\s*=[^=]/, 'the gesture is transforming app layout again');
  assert.match(hook, /if \(!main \|\| main\.querySelector\(FIXED_INSIDE\)\) return null;/,
    'the underlay moves even when a fixed child would be dislodged');
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

test('NOTHING EXPENSIVE HAPPENS ON THE FRAME HIS FINGER MOVES', async () => {
  // Three reports of "clunky". The gesture-start path renders a whole screen
  // in an app that re-renders everything on any setState, so the navigation
  // waits a frame — the snapshot gets its first paint, which is the frame he
  // actually feels.
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const hook = await readFile(path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'edgeBack.js',
  ), 'utf8');
  assert.match(hook, /requestAnimationFrame\(\(\) => \{ if \(s\.live\) onBack\?\.\(\); \}\)/,
    'the navigation runs in the same task as the first drag frame');
  // the per-move path may only touch transform and opacity
  const paint = hook.match(/const paint = \(dx, ms = 0\) => \{[\s\S]*?\n    \};/)[0];
  assert.match(paint, /style\.transform/);
  assert.match(paint, /style\.opacity/);
  assert.doesNotMatch(paint, /getBoundingClientRect|getComputedStyle|querySelector/,
    'the per-frame paint path forces layout');
  // and the transition string is written only when it changes
  assert.match(paint, /if \(want !== eased\)/);
});

// ---- 25 Sep: his fifth recording. Three swipes on an open recipe ----
// Each swipe dragged the tab page OUT FROM UNDER the recipe and went back a
// tab (Fuel, then Train, then Home) while the recipe stayed open. The third,
// at depth 0, was iOS's own back swipe: it now runs in the installed app on
// any edge touch nothing claims.

test('WHAT A SWIPE IS ABOUT is decided by what is on screen', () => {
  // an open recipe is a page: the swipe pops IT, not the tab beneath
  assert.equal(edgeMode({ top: 'page', depth: 3 }), 'page');
  // his call, 25 Sep: EVERY overlay can be swiped back, at any depth
  assert.equal(edgeMode({ top: 'sheet', depth: 2 }), 'sheet');
  assert.equal(edgeMode({ top: 'sheet', depth: 0 }), 'sheet');
  // nothing open: the tab swipe as before
  assert.equal(edgeMode({ depth: 2 }), 'tab');
  // nothing open and nothing behind this entry: claimed, so iOS cannot go
  // back to before boot
  assert.equal(edgeMode({ depth: 0 }), 'block');
  assert.equal(edgeMode({}), 'block');
  assert.equal(edgeMode(), 'block');
});

test('IT FEELS LIKE iOS: the page underneath follows, and the release keeps his speed', () => {
  // his Claude-app recording: the uncovered page starts a third off to the
  // left and arrives exactly as the top page leaves
  assert.equal(underlayOffset(0, 400), -Math.round(PARALLAX * 400));
  assert.equal(underlayOffset(200, 400), -Math.round(PARALLAX * 200));
  assert.equal(underlayOffset(400, 400), -0);
  assert.equal(underlayOffset(900, 400), -0, 'it never overshoots');
  // a flick finishes fast, a slow let-go settles, and neither snaps nor drags
  assert.ok(settleMs(200, 2.5) < settleMs(200, 0.2));
  assert.equal(settleMs(10, 5), SETTLE_MIN_MS);
  assert.equal(settleMs(400, 0), SETTLE_MAX_MS);
  // release velocity decides: a flick back toward the edge cancels even past
  // halfway, and a quick flick a third of the way commits
  const locked = { startX: 4, dy: 0, dt: 900, width: 375, locked: true };
  assert.equal(edgeDecision({ ...locked, dx: 250, vx: -1.5 }), 'tracking');
  assert.equal(edgeDecision({ ...locked, dx: 70, vx: 1.5 }), 'commit');
  assert.equal(edgeDecision({ ...locked, dx: 70, vx: 0.1 }), 'tracking');
});

async function sources() {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const read = (...p) => readFile(path.join(root, ...p), 'utf8');
  return { app: await read('src', 'App.jsx'), hook: await read('src', 'edgeBack.js'), recipe: await read('src', 'RecipeOverlay.jsx') };
}

test('A RECIPE IS A HISTORY LEVEL, so back closes it instead of walking the tabs', async () => {
  const { app, recipe } = await sources();
  // opening pushes an entry of its own (same URL, marked in its state)
  assert.match(app, /pushState\(\{ novaDepth: depthOf\(st\) \+ 1, novaOverlay: 'recipe', recipeId: id \}/,
    'opening a recipe no longer gives it a history entry; the swipe will go back a tab under it');
  // the ✕ goes back when it is on that entry, or the entry is left as a dead
  // step the next swipe spends itself on
  assert.match(app, /closeRecipe\(\) \{[\s\S]{0,200}novaOverlay === 'recipe'\) \{ window\.history\.back\(\); return; \}/);
  // and popstate is what actually closes it
  assert.match(app, /screen: screenFromHash\(\), \.\.\.this\.recipeFromHistory\(\)/);
  // every other way out goes through closeRecipe, never a bare setState
  assert.doesNotMatch(app, /setState\([^;]{0,80}openRecipeId: null/,
    'something closes the recipe behind history’s back');
  // the overlay says it is a page the swipe can pop
  assert.match(recipe, /data-edge-page=""/);
});

test('THE SWIPE MOVES THE RECIPE ITSELF, and never removes an element React owns', async () => {
  const { hook } = await sources();
  // the overlay on top is found from every open modal, and closed by its own
  // close (a marked control, else its backdrop), never by a history guess
  assert.match(hook, /document\.querySelectorAll\('\[aria-modal="true"\]'\)/);
  assert.match(hook, /\(l\.snap\.querySelector\('\[data-edge-close\]'\) \|\| l\.snap\)\.click\(\)/);
  // only the snapshot is the hook's to drop; the page is unmounted by React
  assert.match(hook, /if \(!l\.page\) l\.snap\.remove\(\);/, 'the hook removes the overlay from under React');
  // a page commit closes it only AFTER the slide, and only if it is still there
  assert.match(hook, /if \(!l\.snap\.isConnected\) \{ teardown\(\); return; \}/);
});

test('AN UNCLAIMED EDGE TOUCH IS iOS’S — so every edge touch is claimed', async () => {
  const { hook } = await sources();
  // the depth check used to return before arming, which handed the touch to
  // iOS's own back swipe: that was his third swipe
  const onStart = hook.match(/const onStart = \(e\) => \{[\s\S]*?\n    \};/)[0];
  assert.doesNotMatch(onStart, /canGoBack\(/, 'a depth-0 touch is handed to iOS again');
  assert.match(hook, /if \(s\.mode === 'block'\) \{ s\.dir = 'h'; last\.call = 'blocked'; return; \}/);
  // and the receipt says which mode it was in
  assert.match(hook, /mode: s\.mode/);
});

test('THE REST OF THE TOUCH IS HEARD WHERE IT STARTED — a tab swipe froze on frame one', async () => {
  // A tab swipe goes back at lock and React replaces the screen, so the
  // element under his thumb leaves the document. Its later touchmove and
  // touchend still reach IT, but a detached element bubbles to nothing, so
  // window-level listeners heard nothing and the drag froze until the
  // watchdog put it back. Found driving real touch input through CDP.
  const { hook } = await sources();
  assert.match(hook, /follow\(e\.target\)/, 'the touch is not followed on its own element');
  assert.match(hook, /el\.addEventListener\('touchmove', onMove, \{ passive: false \}\)/);
  assert.match(hook, /el\.addEventListener\('touchend', onEnd/);
  assert.doesNotMatch(hook, /window\.addEventListener\('touch(move|end)'/,
    'moves are heard on window again: a tab swipe will freeze after the screen swaps');
  // and the listeners are released with the gesture
  assert.match(hook, /const reset = \(\) => \{[^\n]*unfollow\(\); \};/);
});

test('EVERY OVERLAY CAN BE SWIPED AWAY — each closes on its backdrop or names its close', async () => {
  // His call, 25 Sep: "everything should be capable of being swiped back".
  // The swipe closes an overlay by its own close, so an overlay whose backdrop
  // does not close it must mark the control that does, or the swipe would
  // slide it off, find it refused, and bring it back every time.
  const { readdir, readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
  const files = (await readdir(src)).filter((f) => f.endsWith('.jsx'));
  const unclosable = [];
  for (const f of files) {
    const code = await readFile(path.join(src, f), 'utf8');
    for (const m of code.matchAll(/<div role="dialog" aria-modal="true"[^>]*>/g)) {
      const root = m[0];
      if (!/onClick=\{/.test(root) && !/data-edge-close/.test(code)) unclosable.push(f);
    }
  }
  assert.deepEqual(unclosable, [], 'these overlays cannot be swiped away');
});
