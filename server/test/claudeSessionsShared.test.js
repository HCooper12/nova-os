// SHARED BY COPY, PROVED BY TEST. `lib/claudeSessions.js` is a byte-for-byte
// copy of Wren's `lib/sessions.mjs`. The rule it encodes (a session is judged
// by when someone last SPOKE in it, not when it started) must not drift in
// one repo and not the other, and a copy with no test is a fork waiting to
// happen. Wren living somewhere else on the disk is not a failure of Nova's,
// so the test skips rather than fails when the sibling is absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mine = path.join(here, '..', 'lib', 'claudeSessions.js');
const theirs = path.resolve(here, '..', '..', '..', 'atlas-partner', 'lib', 'sessions.mjs');

test("Nova's copy of the session rules is byte-identical to Wren's", { skip: existsSync(theirs) ? false : "Wren's copy is not there" }, () => {
  const a = readFileSync(mine);
  const b = readFileSync(theirs);
  assert.equal(a.length, b.length, 'the two copies are different lengths, so one has been edited');
  assert.ok(a.equals(b), 'the two copies differ byte for byte — copy one over the other rather than editing either in place');
});
