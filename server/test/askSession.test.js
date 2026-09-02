// The PWA conversation's freshness guard — the spoken lane's triple, applied
// to the /ask lane whose id lives in the phone for days.
import test from 'node:test';
import assert from 'node:assert/strict';
import { guardAskSession, ASK_MAX_TURNS, _reset } from '../lib/askSession.js';

test('a session resumes within the day, and starts fresh on a new day, after 24h, or at the turn cap', () => {
  _reset();
  const t0 = Date.parse('2026-09-02T09:00:00');
  assert.deepEqual(guardAskSession(null, t0), { sessionId: null, reason: null }, 'no id, nothing to guard');
  assert.deepEqual(guardAskSession('abc', t0), { sessionId: 'abc', reason: null }, 'first sight adopts the id');
  assert.deepEqual(guardAskSession('abc', t0 + 3 * 3600_000), { sessionId: 'abc', reason: null }, 'same day, hours later — resume');
  assert.deepEqual(guardAskSession('abc', Date.parse('2026-09-03T08:00:00')), { sessionId: null, reason: 'new day' });
  // the id was dropped; the client will persist whatever new id the CLI mints
  assert.deepEqual(guardAskSession('abc', Date.parse('2026-09-03T08:00:01')), { sessionId: 'abc', reason: null }, 'seen again → adopted afresh');
  _reset();
  const t1 = Date.parse('2026-09-02T00:30:00');
  guardAskSession('day', t1);
  assert.equal(guardAskSession('day', t1 + 25 * 3600_000).reason, 'new day', 'crossing midnight reads as a new day first');
  _reset();
  guardAskSession('turns', t0);
  for (let i = 2; i <= ASK_MAX_TURNS; i++) assert.equal(guardAskSession('turns', t0 + i).sessionId, 'turns', `turn ${i} still resumes`);
  assert.equal(guardAskSession('turns', t0 + ASK_MAX_TURNS + 1).reason, `${ASK_MAX_TURNS} turns deep`, 'the turn after the cap starts fresh');
});
