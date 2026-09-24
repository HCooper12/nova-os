// THE POCKET (25 Sep 2026). A live workout checks in while Nova is on screen;
// when the check-ins stop, ONE notification goes to the lock screen so a tap
// reopens the session. What must hold: silence fires, presence never does,
// a workout gets exactly one notification however often he leaves, the words
// are the latest ones, and an ended workout sends nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPocket, POCKET_GRACE_MS } from '../lib/pocket.js';

function rig() {
  let t = 0;
  let next = 1;
  const timers = new Map();
  const sent = [];
  const pocket = createPocket({
    send: (msg) => { sent.push(msg); },
    now: () => t,
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
  });
  const advance = async (ms) => {
    t += ms;
    for (const [id, tm] of [...timers]) if (tm.at <= t) { timers.delete(id); tm.fn(); }
    await Promise.resolve(); await Promise.resolve();
  };
  return { pocket, sent, advance };
}

const W = { key: 's1', title: 'Push day in progress', body: '4 of 20 sets — tap to pick up' };

test('silence past the grace sends one notification that reopens the workout', async () => {
  const { pocket, sent, advance } = rig();
  pocket.ping(W);
  await advance(POCKET_GRACE_MS - 1);
  assert.equal(sent.length, 0, 'not while he might still be looking');
  await advance(1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, './#/workouts');
  assert.equal(sent[0].tag, 'pocket-workout', 'a fixed tag so a second one would replace, never stack');
});

test('a phone that keeps checking in never gets one', async () => {
  const { pocket, sent, advance } = rig();
  for (let i = 0; i < 40; i += 1) { pocket.ping(W); await advance(15_000); }
  assert.equal(sent.length, 0);
});

test('one per workout, however many times he leaves', async () => {
  const { pocket, sent, advance } = rig();
  pocket.ping(W);
  await advance(POCKET_GRACE_MS);          // left for the music
  pocket.ping(W);                          // came back
  await advance(POCKET_GRACE_MS * 3);      // locked it on the bench
  assert.equal(sent.length, 1);
  assert.equal(pocket.ping(W).sent, true);
});

test('the words are the latest the phone sent, not the first', async () => {
  const { pocket, sent, advance } = rig();
  pocket.ping(W);
  await advance(10_000);
  pocket.ping({ ...W, body: '12 of 20 sets — tap to pick up' });
  await advance(POCKET_GRACE_MS);
  assert.equal(sent[0].body, '12 of 20 sets — tap to pick up');
});

test('an ended workout sends nothing', async () => {
  const { pocket, sent, advance } = rig();
  pocket.ping(W);
  pocket.disarm('s1');
  await advance(POCKET_GRACE_MS * 2);
  assert.equal(sent.length, 0);
  assert.equal(pocket.state().armed, false);
});

test('disarming someone else’s key leaves the live one armed', async () => {
  const { pocket, sent, advance } = rig();
  pocket.ping(W);
  pocket.disarm('an-old-session');
  await advance(POCKET_GRACE_MS);
  assert.equal(sent.length, 1);
});

test('a new workout gets its own notification', async () => {
  const { pocket, sent, advance } = rig();
  pocket.ping(W);
  await advance(POCKET_GRACE_MS);
  pocket.ping({ ...W, key: 's2', title: 'Pull day in progress' });
  await advance(POCKET_GRACE_MS);
  assert.deepEqual(sent.map((m) => m.title), ['Push day in progress', 'Pull day in progress']);
});

test('a ping without a key or title is refused', () => {
  const { pocket } = rig();
  assert.throws(() => pocket.ping({ title: 'x' }));
  assert.throws(() => pocket.ping({ key: 'x' }));
});

test('a ping that lands after Finish cannot re-arm the finished workout', async () => {
  const { pocket, sent, advance } = rig();
  pocket.ping(W);
  pocket.disarm('s1', { ended: true });
  assert.deepEqual(pocket.ping(W), { armed: false, ended: true }, 'the in-flight ping is ignored');
  await advance(POCKET_GRACE_MS * 2);
  assert.equal(sent.length, 0);
});

test('a PARKED workout can be resumed and still earn its one notification', async () => {
  const { pocket, sent, advance } = rig();
  pocket.ping(W);
  pocket.disarm('s1');            // Save for later — not over
  pocket.ping(W);                 // resumed
  await advance(POCKET_GRACE_MS);
  assert.equal(sent.length, 1);
});

test('the tap only ever opens one of Nova\'s own screens', () => {
  const { pocket } = rig();
  assert.throws(() => pocket.ping({ ...W, url: 'https://evil.example/' }));
  assert.throws(() => pocket.ping({ ...W, url: 'javascript:alert(1)' }));
  assert.throws(() => pocket.ping({ ...W, tag: 'x y' }));
  assert.equal(pocket.ping({ ...W, url: './#/workouts' }).armed, true);
});
