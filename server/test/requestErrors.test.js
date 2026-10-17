// 18 Oct 2026 ledger: three routes (health-data, review/today,
// claude-code/changes) answered an error status with nothing logged. This
// pins the one shared fix: one console.error line naming method, path,
// status and message, and a JSON {error} body — never a silent 500, never
// a second response once one has already gone out.
import test from 'node:test';
import assert from 'node:assert/strict';

import { logRequestError, statusOf, wrapAsync } from '../lib/requestErrors.js';

function fakeRes() {
  const calls = { status: null, json: null };
  return {
    headersSent: false,
    status(s) { calls.status = s; return this; },
    json(body) { calls.json = body; return this; },
    _calls: calls,
  };
}

test('statusOf reads a real HTTP status off the error, else 500', () => {
  assert.equal(statusOf(new Error('plain')), 500);
  assert.equal(statusOf(Object.assign(new Error('bad'), { status: 400 })), 400);
  assert.equal(statusOf(Object.assign(new Error('bad'), { statusCode: 404 })), 404);
  assert.equal(statusOf(Object.assign(new Error('bad'), { status: 999 })), 500, 'not a real status: fall back honestly');
});

test('logRequestError writes one line and answers JSON {error} with the right status', () => {
  const lines = [];
  const realError = console.error;
  console.error = (line) => lines.push(line);
  try {
    const err = Object.assign(new Error('could not read health data'), { status: 500 });
    const req = { method: 'GET', originalUrl: '/api/health-data?days=14' };
    const res = fakeRes();
    logRequestError(err, req, res, () => {});
    assert.equal(lines.length, 1, 'exactly one app-level log line');
    assert.match(lines[0], /^err \d{4}-\d{2}-\d{2}T.*GET \/api\/health-data\?days=14 500 could not read health data/);
    assert.equal(res._calls.status, 500);
    assert.deepEqual(res._calls.json, { error: 'could not read health data' });
  } finally {
    console.error = realError;
  }
});

test('logRequestError never sends a second response once headers are already sent', () => {
  const realError = console.error;
  console.error = () => {};
  try {
    const res = fakeRes();
    res.headersSent = true;
    logRequestError(new Error('too late'), { method: 'GET', originalUrl: '/x' }, res, () => {});
    assert.equal(res._calls.status, null, 'no second res.status() call');
  } finally {
    console.error = realError;
  }
});

test('wrapAsync forwards a thrown or rejected error to next, never leaves it unhandled', async () => {
  let forwarded = null;
  const next = (err) => { forwarded = err; };
  const handler = wrapAsync(async () => { throw new Error('boom'); });
  await handler({}, {}, next);
  // the promise chain inside wrapAsync needs a tick to settle
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(forwarded?.message, 'boom');
});
