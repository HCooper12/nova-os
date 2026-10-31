// A failed Weave, recipe import or Wishlist add must offer Retry: the server
// retries all of them (inbox.js retryRecord) but the gate hid the button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the Inbox offers Retry on every error kind the server can retry', async () => {
  const src = await readFile(new URL('../../src/vals/valsInbox.js', import.meta.url), 'utf8');
  const gate = src.slice(src.indexOf('canRetry:'), src.indexOf('approve:', src.indexOf('canRetry:')));
  for (const k of ["'ingest'", "'recipe-video'", "'recipe-scan'", "'wishlist'", "'research'", "'video'"]) assert.ok(gate.includes(k), `${k} missing from canRetry`);
});
