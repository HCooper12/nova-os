import test from 'node:test';
import assert from 'node:assert/strict';
import { macUnreachable } from '../../src/outbox.js';

// Airplane mode kept the chip on LIVE (14 Oct 2026): the sync must call the
// Mac unreachable on a network failure, and only then.
test('a network failure or a timeout means the Mac is unreachable', () => {
  assert.equal(macUnreachable(new TypeError('Load failed')), true);
  const timeout = new Error('signal timed out'); timeout.name = 'TimeoutError';
  assert.equal(macUnreachable(timeout), true);
  const abort = new Error('aborted'); abort.name = 'AbortError';
  assert.equal(macUnreachable(abort), true);
});

test('an HTTP error means the Mac answered, so it is not unreachable', () => {
  const e = new Error('/api/snapshot failed: 500'); e.status = 500;
  assert.equal(macUnreachable(e), false);
  const old = new Error('/api/snapshot failed: 404'); old.status = 404;
  assert.equal(macUnreachable(old), false);
  assert.equal(macUnreachable(new Error('bad json')), false);
  assert.equal(macUnreachable(null), false);
});

// His wording for anything that needs the Mac with no network (14 Oct 2026),
// and the Outbox must still recognise the failure as offline-shaped.
test('a network failure in api.js reads "Offline. Requires Mac connection." and still queues', async () => {
  const { api, OFFLINE_MESSAGE } = await import('../../src/api.js');
  const { isOfflineError } = await import('../../src/outbox.js');
  const real = globalThis.fetch;
  const conn = { baseUrl: 'https://mac.invalid', token: 't' };
  try {
    globalThis.fetch = async () => { throw new TypeError('Load failed'); };
    for (const attempt of [() => api.workoutRoutines(conn), () => api.pocketPing(conn, {})]) {
      const err = await attempt().then(() => null, (e) => e);
      assert.equal(err.message, OFFLINE_MESSAGE);
      assert.equal(OFFLINE_MESSAGE, 'Offline. Requires Mac connection.');
      assert.equal(isOfflineError(err), true);
      assert.equal(macUnreachable(err), true);
    }
    // the Mac answered with an error: that is not "offline"
    globalThis.fetch = async () => new Response('{"error":"nope"}', { status: 500 });
    const err = await api.pocketPing(conn, {}).then(() => null, (e) => e);
    assert.equal(err.status, 500);
    assert.notEqual(err.message, OFFLINE_MESSAGE);
  } finally {
    globalThis.fetch = real;
  }
});
