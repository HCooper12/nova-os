import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGreetClaim, CLAIM_MS } from '../lib/greetClaim.js';

test('a second greeting two seconds after the first stands down', () => {
  let t = 1_000_000;
  const c = makeGreetClaim(() => t);
  assert.equal(c.take(), true);
  t += 2000;
  assert.equal(c.take(), false);
});

test('a later arrival, after the window, may greet again', () => {
  let t = 1_000_000;
  const c = makeGreetClaim(() => t);
  assert.equal(c.take(), true);
  t += CLAIM_MS + 1;
  assert.equal(c.take(), true);
});

test('a greeting that failed to start gives the claim back', () => {
  const c = makeGreetClaim(() => 5_000_000);
  assert.equal(c.take(), true);
  c.release();
  assert.equal(c.take(), true);
});
