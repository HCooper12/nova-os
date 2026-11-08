// THE POST BOX FOR THE PHONE'S LIVE FEED (8 Nov 2026, lib/cameraSignal.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { leave, read, ROOM_MS, _resetForTests } from '../lib/cameraSignal.js';

test('offer, answer and candidates cross; each side reads only the other\'s, newer than its seq', () => {
  _resetForTests();
  assert.equal(read({ role: 'mac' }).offer, undefined);
  const o = leave({ role: 'phone', type: 'offer', sdp: 'v=0 phone' });
  assert.equal(o.ok, true);
  const m1 = read({ role: 'mac', since: 0 });
  assert.equal(m1.offer, 'v=0 phone');
  assert.deepEqual(m1.candidates, []);
  leave({ role: 'mac', type: 'answer', sdp: 'v=0 mac' });
  leave({ role: 'mac', type: 'candidate', candidate: { candidate: 'c1', sdpMid: '0' } });
  const p1 = read({ role: 'phone', since: 0 });
  assert.equal(p1.answer, 'v=0 mac');
  assert.deepEqual(p1.candidates, [{ candidate: 'c1', sdpMid: '0' }]);
  assert.equal(read({ role: 'phone', since: p1.seq }).candidates.length, 0, 'nothing new since');
  assert.equal(read({ role: 'phone', since: 0 }).offer, undefined, 'a phone never reads its own offer');
  assert.ok(Array.isArray(p1.stun) && p1.stun.length);
});

test('bye clears the room; a stale room is forgotten; bad messages are refused', () => {
  _resetForTests();
  leave({ role: 'phone', type: 'offer', sdp: 'o', now: 1000 });
  leave({ role: 'phone', type: 'bye', now: 1100 });
  const m = read({ role: 'mac', now: 1200 });
  assert.equal(m.offer, undefined);
  assert.equal(m.hungUp, 'phone');
  leave({ role: 'phone', type: 'offer', sdp: 'o2', now: 2000 });
  assert.equal(read({ role: 'mac', now: 2000 + ROOM_MS + 1 }).offer, undefined, 'stale');
  assert.match(leave({ role: 'tv', type: 'offer', sdp: 'x' }).error, /role/);
  assert.match(leave({ role: 'mac', type: 'offer', sdp: 'x' }).error, /no such message/);
  assert.match(leave({ role: 'phone', type: 'offer' }).error, /needs sdp/);
});
