// ONE FINISH, ONE SESSION (16 Oct 2026). His Pull on 14 Oct was filed twice,
// 3.6 s apart (03:10:19 and 03:10:22 UTC), each POST carrying a fresh
// randomUUID clientKey, so the server's clientKey de-duplication never saw a
// repeat. The key now belongs to the session (routine + startedAt), and a
// synchronous flag stops a same-frame second tap. Source contract, because the
// finish path lives in App.jsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const finish = app.slice(app.indexOf('  finishWorkoutSession() {'), app.indexOf('  finishWorkoutSession() {') + 9000);

test("the finish's clientKey is the session's, never a fresh random per tap", () => {
  assert.match(finish, /clientKey: session\.clientKey \|\| `session-\$\{session\.routineId\}-\$\{session\.startedAt/);
  assert.doesNotMatch(finish, /clientKey:\s*\(globalThis\.crypto\?\.randomUUID/);
});

test('a second finish of the same session is refused before any re-render', () => {
  assert.match(finish, /if \(this\.finishingSessionAt === session\.startedAt\) return;/);
  assert.match(finish, /this\.finishingSessionAt = session\.startedAt;/);
  assert.match(finish, /finally\(\(\) => \{ this\.finishingSessionAt = null;/);
});
