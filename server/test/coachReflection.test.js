// The nightly reflection's decision layer: the state round-trip the reader
// depends on (the boolean-as-text bug), the What Works dedupe, the window,
// and the clamps. The spawn is not exercised (same boundary as its siblings).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-reflection-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeReflection, lastReflectionLine, isKnownLearning, reflectionWindowOpen } = await import('../lib/coachReflection.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('the reader prints the outreach TEXT the writer stores — never a boolean — and names the Inbox fallback', () => {
  assert.equal(lastReflectionLine({}), null);
  assert.equal(lastReflectionLine({ lastRun: '2026-09-02', lastResult: { learnings: 0, outreach: null, quietReason: null } }), null, 'a fully quiet night with no reason says nothing');
  const legacyBoolean = lastReflectionLine({ lastRun: '2026-09-02', lastResult: { learnings: 1, outreach: true, quietReason: null } });
  assert.doesNotMatch(legacyBoolean, /about: "true"/, 'the old boolean-as-text state is never printed as words');
  assert.match(legacyBoolean, /you raised 1 learning for his approval/);
  const line = lastReflectionLine({ lastRun: '2026-09-03', lastResult: { learnings: 2, learningsKnown: 1, outreach: 'Your Thursday sessions keep slipping — is it the 13:20 slot?', delivered: 'inbox', quietReason: null } });
  assert.match(line, /YOUR LAST REFLECTION \(2026-09-03\)/);
  assert.match(line, /you raised 2 learnings for his approval \(1 more were already on his What Works page and were not re-raised\)/);
  assert.match(line, /you reached out to him about: "Your Thursday sessions keep slipping — is it the 13:20 slot\?" \(it waits in his Inbox — Telegram was not configured\)/);
  const sent = lastReflectionLine({ lastRun: '2026-09-03', lastResult: { learnings: 0, outreach: 'A word about protein timing after training.', delivered: 'telegram', quietReason: null } });
  assert.doesNotMatch(sent, /Inbox/);
});

test('isKnownLearning: a learning already on the page (either way round, normalised) is known; short or absent text is not', () => {
  const page = `# What Works For Hayden\n\n## Works\n- 2026-09-01 — Direct arm isolation work is where he is actually progressing right now — his priority muscles respond even when everything else is stalled.\n- 2026-08-20 — He takes nearly every working set to RPE 9–10.\n\n## Avoid\n- Adding load to a lift he is already fighting.`;
  assert.equal(isKnownLearning('He takes nearly every working set to RPE 9-10', page), true, 'punctuation and dashes do not fool it');
  assert.equal(isKnownLearning('Direct arm isolation work is where he is actually progressing right now — his priority muscles respond even when everything else is stalled, so keep it.', page), true, 'a page line inside a longer insight');
  assert.equal(isKnownLearning('His protein lands late in the day, after 19:00 most days.', page), false, 'genuinely new');
  assert.equal(isKnownLearning('RPE', page), false, 'too short to claim a match');
  assert.equal(isKnownLearning('anything at all here', ''), false);
});

test('the window is 03:00–09:00; the clamps hold', () => {
  const at = (h) => new Date(2026, 8, 3, h, 30);
  assert.equal(reflectionWindowOpen(at(2)), false);
  assert.equal(reflectionWindowOpen(at(3)), true);
  assert.equal(reflectionWindowOpen(at(6)), true, 'a Mac asleep until six still reflects');
  assert.equal(reflectionWindowOpen(at(8)), true);
  assert.equal(reflectionWindowOpen(at(9)), false);
  const r = normalizeReflection({ learnings: [{ insight: 'He responds well to direct arm isolation work when everything else stalls.', kind: 'nonsense', reason: 'y' }], outreach: 'too short', quiet_reason: 'q' });
  assert.equal(r.learnings[0].kind, 'works');
  assert.equal(r.outreach, null, 'under 20 characters is not an outreach');
  assert.equal(normalizeReflection({ outreach: 'a'.repeat(900) }).outreach.length, 800);
});

// 18 Oct 2026 ledger: "coach reflection failed: ... no stdin data ..." x4.
// The prompt arrives as the `-p` argument, but a bare `spawn()` leaves
// stdin open with nobody writing or closing it, and the CLI then waits on
// it. Same source-shape check as modelSpend.test.js's spawn-site coverage
// — the spawn itself is not exercised here either.
test('the model spawn closes stdin, the way claudeCode.js\'s own -p call does', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../lib/coachReflection.js', import.meta.url), 'utf8');
  const call = src.slice(src.indexOf('function runModel'), src.indexOf('function runModel') + 1200);
  assert.match(call, /stdio:\s*\[\s*'ignore'/, 'stdin must be closed, not left as an open, unwritten pipe');
});

// The guard itself, in isolation: `runReflection` returns `{ skipped: true,
// reason: 'empty prompt' }` and logs instead of spawning when the context
// string is empty. buildReflectionContext is internal and depends on a
// real vault, so this pins the guard's own text — the thing a future
// refactor of that function is most likely to silently drop.
test('the empty-context skip exists, names its reason, and logs before returning', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../lib/coachReflection.js', import.meta.url), 'utf8');
  assert.match(src, /console\.error\('coach reflection skipped: empty prompt/);
  assert.match(src, /reason:\s*'empty prompt'/);
});
