// THE DYNAMIC ISLAND (24 Sep 2026, his ask from the expo-dynamic-notifications
// reel). The drawing can only be judged by eye; what these hold still is
// everything the eye depends on: the island is where the hardware is, the
// drop really leaves it and really arrives at the card, the springs land where
// the library's choreography expects them to, a throw is a throw and a tap is
// not, the queue never eats a notification before it could be read, and a
// colour never claims a success or a failure the sentence did not.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  islandLayout, islandGeometry, contentStyle, neckProfile, detectIsland,
  createSpring, aim, stepSpring, jump, releaseDecision, dragOffset, rubberband,
  toneOf, displayText, normalizeNotice, arrival, remainingLife, gooMatrix, gooBlur,
  DROP_SPRING, EXPAND_SPRING, REVEAL_SPRING, DRAG_SPRING, RETURN_SPRING,
  ISLAND_WIDTH, ISLAND_HEIGHT, CARD_GAP, CARD_MAX_HEIGHT, CARD_MAX_RADIUS,
  QUEUE_MIN_SHOW, QUEUE_MAX, AUTO_DISMISS,
} from '../../src/islandCore.js';

const PRO16 = { width: 402, insetTop: 62, island: true };

test('the island sits where an iPhone 16 Pro puts it', () => {
  const L = islandLayout({ ...PRO16, cardHeight: 64 });
  assert.equal(L.islandWidth, ISLAND_WIDTH);
  assert.equal(L.islandHeight, ISLAND_HEIGHT);
  // inset 62 − 37.33 − 11 = 13.67: the island's real top edge on a 16 Pro
  assert.ok(Math.abs(L.islandTop - 13.67) < 0.01, `islandTop ${L.islandTop}`);
  assert.equal(L.centerX, 201);
  // the card hangs one gap below the island, centred, inside the margins
  assert.ok(Math.abs(L.cardTop - (L.islandBottom + CARD_GAP)) < 1e-9);
  assert.equal(L.cardWidth, 370);
  assert.equal(L.cardLeft, 16);
});

test('a 375pt phone still gets margins, and a desktop stops at the cap', () => {
  assert.equal(islandLayout({ width: 375, insetTop: 59, island: true }).cardWidth, 343);
  assert.equal(islandLayout({ width: 1440, insetTop: 0, island: false }).cardWidth, 396);
});

test('a card holding real sentences grows, then stops; its corners stop being a pill', () => {
  const short = islandLayout({ ...PRO16, cardHeight: 64 });
  assert.equal(short.cardRadius, 30);
  const tall = islandLayout({ ...PRO16, cardHeight: 140 });
  assert.equal(tall.cardHeight, 140);
  assert.equal(tall.cardRadius, CARD_MAX_RADIUS, 'a 140px stadium reads as a lozenge');
  assert.equal(islandLayout({ ...PRO16, cardHeight: 900 }).cardHeight, CARD_MAX_HEIGHT);
});

test('with no island the drop comes from above the page, never from a fake pill on it', () => {
  const tab = islandLayout({ width: 390, insetTop: 0, island: false });
  assert.ok(tab.islandBottom < 0, 'the virtual island is entirely off the top of the page');
  assert.ok(tab.cardTop > 0 && tab.cardTop < 40);
  const notch = islandLayout({ width: 390, insetTop: 47, island: false });
  assert.ok(notch.islandBottom < 0, 'a notch phone must not get a black pill over its status bar');
  assert.ok(notch.cardTop >= 47, 'and the card clears the notch');
});

test('island detection: only an upright, installed iPhone with an island-sized inset', () => {
  const yes = { ios: true, standalone: true, portrait: true, insetTop: 62 };
  assert.equal(detectIsland(yes), true);
  assert.equal(detectIsland({ ...yes, insetTop: 59 }), true, '14 Pro / 15');
  assert.equal(detectIsland({ ...yes, insetTop: 47 }), false, 'a notch iPhone');
  assert.equal(detectIsland({ ...yes, standalone: false }), false, 'a browser tab never draws under the island');
  assert.equal(detectIsland({ ...yes, portrait: false }), false, 'landscape puts the island on the side');
  assert.equal(detectIsland({ ...yes, ios: false }), false);
});

test('the drop starts inside the island and lands exactly on the card', () => {
  const L = islandLayout({ ...PRO16, cardHeight: 64 });
  const start = islandGeometry({ drop: 0, expand: 0, layout: L });
  assert.equal(start.width, 0);
  assert.equal(start.height, 0);
  const originY = L.islandBottom - L.islandHeight * 0.34;
  assert.ok(Math.abs(start.y - originY) < 1e-9, 'a zero-size drop at the island’s lower lip');

  const end = islandGeometry({ drop: 1, expand: 1, layout: L });
  assert.equal(end.width, L.cardWidth);
  assert.equal(end.height, L.cardHeight);
  assert.equal(end.x, L.cardLeft);
  assert.ok(Math.abs(end.y - L.cardTop) < 1e-9);
  assert.equal(end.radius, L.cardRadius);
  assert.equal(end.neckWidth, 0, 'at rest there is no neck');
  assert.equal(end.offsetY, 0);
});

test('the neck swells while the drop tears away, then is gone before it lands', () => {
  assert.equal(neckProfile(0, 1.6, 1.4), 0);
  assert.equal(neckProfile(1, 1.6, 1.4), 0);
  const peak = 1.6 / (1.6 + 1.4);
  assert.ok(Math.abs(neckProfile(peak, 1.6, 1.4) - 1) < 1e-9, 'normalised to peak at exactly 1');
  const L = islandLayout({ ...PRO16, cardHeight: 64 });
  const mid = islandGeometry({ drop: 0.45, expand: 0, layout: L });
  assert.ok(mid.neckWidth > 20, `mid-flight neck ${mid.neckWidth}`);
  assert.ok(mid.height > mid.width, 'stretched long while the neck pulls on it');
  assert.equal(islandGeometry({ drop: 0.9, expand: 0, layout: L }).neckWidth, 0, 'torn off by 0.82');
});

test('the drag moves the whole card, so a throw carries it back toward the island', () => {
  const L = islandLayout({ ...PRO16, cardHeight: 64 });
  const rest = islandGeometry({ drop: 1, expand: 1, layout: L });
  const up = islandGeometry({ drop: 1, expand: 1, layout: L, dragY: -40 });
  assert.equal(up.y, rest.y - 40);
  assert.equal(up.offsetY, -40, 'and the words go with it');
});

test('the words appear out of a blur and a slight shrink, only once there is room', () => {
  const L = islandLayout({ ...PRO16, cardHeight: 64 });
  const g = islandGeometry({ drop: 1, expand: 1, layout: L });
  const hidden = contentStyle(g, 0);
  assert.equal(hidden.opacity, 0);
  assert.equal(hidden.scale, 0.88);
  assert.equal(hidden.blur, 8);
  const shown = contentStyle(g, 1);
  assert.deepEqual([shown.opacity, shown.scale, shown.blur], [1, 1, 0]);
});

// Run a spring the way the rAF loop does: 8.3ms frames, a 120Hz panel.
function run(spring, ms, { frame = 1000 / 120, from = 0 } = {}) {
  let t = from;
  const trace = [];
  while (t < from + ms) { t += frame; stepSpring(spring, frame, t); trace.push(spring.value); }
  return trace;
}

test('each spring has landed by its duration, as the library’s delays assume', () => {
  for (const cfg of [DROP_SPRING, EXPAND_SPRING, REVEAL_SPRING, DRAG_SPRING, RETURN_SPRING]) {
    const s = createSpring(0);
    aim(s, 1, { ...cfg, velocity: undefined }, 0);
    run(s, cfg.duration * 1.05);
    assert.ok(Math.abs(s.value - 1) < 0.01, `${JSON.stringify(cfg)} ended at ${s.value}`);
  }
});

test('an under-damped spring overshoots; a critically damped one never does', () => {
  const bouncy = createSpring(0);
  aim(bouncy, 1, EXPAND_SPRING, 0);
  assert.ok(Math.max(...run(bouncy, 1200)) > 1.005, 'dampingRatio 0.8 should overshoot a little');
  const calm = createSpring(0);
  aim(calm, 1, REVEAL_SPRING, 0);
  assert.ok(Math.max(...run(calm, 1200)) <= 1.0001, 'dampingRatio 1 must not');
});

test('a delayed spring waits, then goes', () => {
  const s = createSpring(0);
  aim(s, 1, REVEAL_SPRING, 0, { delay: 560 });
  run(s, 500);
  assert.equal(s.value, 0);
  run(s, 1400, { from: 500 });
  assert.ok(Math.abs(s.value - 1) < 0.01);
});

test('a spring retargeted mid-flight keeps its velocity — no brick wall', () => {
  const s = createSpring(0);
  aim(s, 1, DROP_SPRING, 0);
  run(s, 150);
  const v = s.velocity;
  assert.ok(v > 0);
  aim(s, 0, DROP_SPRING, 150);
  stepSpring(s, 1, 151);
  assert.ok(s.velocity > 0 && Math.abs(s.velocity - v) / v < 0.05, 'still moving the way it was going');
});

test('onDone fires once, when it lands', () => {
  const s = createSpring(0);
  let n = 0;
  aim(s, 1, REVEAL_SPRING, 0, { onDone: () => { n += 1; } });
  run(s, 2000);
  assert.equal(n, 1);
  jump(s, 0.5);
  assert.equal(s.active, false);
});

test('a throw is up-and-far OR up-and-fast; everything else goes home', () => {
  assert.equal(releaseDecision({ dy: -30, vy: 0 }), 'dismiss');
  assert.equal(releaseDecision({ dy: -8, vy: -0.6 }), 'dismiss', 'a flick never got far');
  assert.equal(releaseDecision({ dy: -10, vy: -0.1 }), 'return');
  assert.equal(releaseDecision({ dy: 40, vy: 0.5 }), 'return', 'down is never a dismissal');
});

test('down gives, then refuses; up follows the finger 1:1', () => {
  assert.equal(dragOffset(-50), -50);
  assert.ok(dragOffset(40) < 40 && dragOffset(40) > 0);
  assert.ok(dragOffset(400) < 100 && dragOffset(4000) < 120, 'rubber-banded toward a limit, never free travel');
  assert.ok(rubberband(200) > rubberband(100), 'but it always gives a little more');
});

test('tone: colour only says what the sentence said', () => {
  assert.equal(toneOf('Workout saved ✓'), 'done');
  assert.equal(toneOf('Saved to the vault'), 'done');
  assert.equal(toneOf('Outbox synced — 2 items filed ✓'), 'done');
  assert.equal(toneOf('Could not delete: 500'), 'warn');
  assert.equal(toneOf('Couldn’t check the server for a workout draft'), 'warn');
  assert.equal(toneOf('Backend unreachable — “x” saved to the Outbox'), 'warn', 'a warning outranks the word saved inside it');
  assert.equal(toneOf('Dictation: no-speech'), 'warn');
  assert.equal(toneOf('Offline — reconnect to edit your profile'), 'warn');
  assert.equal(toneOf('Worked out from the labels — check the fields, then Save'), 'info');
  assert.equal(toneOf('Back to the original for today'), 'info', 'unsure is plain, never a guessed green');
  assert.equal(displayText('Workout saved ✓'), 'Workout saved', 'the mark carries the tick');
});

test('a notice arrives in one shape whatever the caller handed over', () => {
  const t = normalizeNotice('Saved to the vault', 3);
  assert.deepEqual([t.id, t.tone, t.duration, t.message], ['n3', 'done', AUTO_DISMISS, '']);
  const g = normalizeNotice({ id: 'greet', tone: 'nova', title: 'Nova', message: 'Morning.', duration: 30000 });
  assert.deepEqual([g.id, g.tone, g.duration], ['greet', 'nova', 30000]);
  assert.equal(normalizeNotice({ title: 'Uploading', duration: null }).duration, null, 'null means stay');
});

test('the queue: repeats refresh, a busy island queues, the queue is capped', () => {
  const a = normalizeNotice('Offline — reconnect', 1);
  assert.equal(arrival({ current: null, queue: [], next: a }).kind, 'show');
  assert.equal(arrival({ current: a, queue: [], next: normalizeNotice('Offline — reconnect', 2) }).kind, 'refresh',
    'the same words again do not replay the drop');
  let q = [];
  for (let i = 0; i < 6; i += 1) q = arrival({ current: a, queue: q, next: normalizeNotice(`n${i}`, 10 + i) }).queue;
  assert.equal(q.length, QUEUE_MAX);
  assert.equal(q[q.length - 1].title, 'n5', 'the newest survives; the oldest waiting ones give way');
});

test('something waiting cuts the current one short — never before it could be read', () => {
  const n = normalizeNotice('Saved to the vault');
  assert.equal(remainingLife({ notice: n, shownAt: 1000, now: 1000, queued: false }), AUTO_DISMISS);
  assert.equal(remainingLife({ notice: n, shownAt: 1000, now: 1000, queued: true }), QUEUE_MIN_SHOW);
  assert.equal(remainingLife({ notice: n, shownAt: 1000, now: 5000, queued: true }), 0);
  const greet = normalizeNotice({ title: 'Nova', message: 'Morning', duration: 30000, minShow: 5000 });
  assert.equal(remainingLife({ notice: greet, shownAt: 0, now: 0, queued: true }), 5000,
    'the doorman’s question holds 5s even when a toast is waiting');
  const sticky = normalizeNotice({ title: 'Uploading', duration: null });
  assert.equal(remainingLife({ notice: sticky, shownAt: 0, now: 0, queued: false }), null);
  assert.equal(remainingLife({ notice: sticky, shownAt: 0, now: 0, queued: true }), QUEUE_MIN_SHOW);
});

test('the goo matrix is the library’s: alpha × gain − gain × threshold', () => {
  const v = gooMatrix().split(' ').map(Number);
  assert.equal(v.length, 20);
  assert.deepEqual(v.slice(15), [0, 0, 0, 22, -9.46]);
  assert.ok(Math.abs(gooBlur() - 14.3) < 1e-9);
});
