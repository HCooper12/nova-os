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
