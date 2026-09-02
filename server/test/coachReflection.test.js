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
