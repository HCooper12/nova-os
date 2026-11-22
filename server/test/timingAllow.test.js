// TIMING-ALLOW-ORIGIN (22 Nov 2026, server/lib/timingAllow.js). The phone's
// turn instrument (src/turnNet.js) can only read a request's connect, TLS and
// first-byte times when the response allows its origin. The header must name
// only an origin CORS already allows, and never '*'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { timingAllowOrigin } from '../lib/timingAllow.js';

const run = (mw, origin) => {
  const headers = {};
  let nexted = false;
  mw({ headers: origin === undefined ? {} : { origin } }, { setHeader: (k, v) => { headers[k] = v; } }, () => { nexted = true; });
  return { headers, nexted };
};

test('an allowed origin may read the timing, by name', () => {
  const mw = timingAllowOrigin(['https://hcooper12.github.io', 'http://localhost:5183']);
  const r = run(mw, 'https://hcooper12.github.io');
  assert.equal(r.headers['Timing-Allow-Origin'], 'https://hcooper12.github.io');
  assert.equal(r.nexted, true);
});

test('any other origin, or none, gets no header, and the request carries on', () => {
  const mw = timingAllowOrigin(['https://hcooper12.github.io']);
  for (const o of ['https://evil.example', 'null', '', undefined]) {
    const r = run(mw, o);
    assert.deepEqual(r.headers, {}, String(o));
    assert.equal(r.nexted, true);
  }
});

test('a wildcard in the list is never echoed', () => {
  const mw = timingAllowOrigin(['*']);
  assert.deepEqual(run(mw, '*').headers, {});
});
