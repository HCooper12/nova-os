// A READING OF HIS BODY RIDES ONLY INTO A TURN ABOUT HIS BODY. Pinned against
// 1 Nov 2026: the alert "HRV is down 12% on your baseline" (raised 20:13 UTC)
// was spoken as "One thing first" at 23:47:58, right after he asked for a
// mock-up of his new program (alerts log: health-hrv, spoken-only, 12,844,897
// ms after it was raised). Pure, and still given its own NOVA_DATA_DIR before
// alerts.js (a store) is imported.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-firstthing-data-'));
const { default: test } = await import('node:test');
const { default: assert } = await import('node:assert/strict');
const { firstThingFits, isBodyReading } = await import('../../src/firstThingFit.js');
const { firstThingLine } = await import('../lib/alerts.js');

const hrv = { kind: 'health-hrv', tier: 'next', label: 'HEALTH', what: 'HRV is down 12% on your baseline' };
const fault = { kind: 'system-fault', tier: 'next', label: 'SYSTEM', what: 'Your calendar is off' };
const missed = { kind: 'health-missed-push', tier: 'next', label: 'HEALTH', what: "Apple Health didn't send yesterday" };

test('his program questions do not hear his HRV', () => {
  for (const q of [
    'Show me a mock-up of what the new program would look like. So both the four-day split and then possibly a five-day split.',
    "I like the idea of the four-day split, so let's try and work that in.",
    "I still can't see the plan yet.",
    'Swap my barbell bench press exercise in my program to a machine chest press exercise',
  ]) assert.equal(firstThingFits(hrv, q), false, q);
});

test('a turn about his body or training today still hears it first', () => {
  for (const q of ['Should I train today?', 'I feel tired, should I go heavy?', 'how did I sleep', "What's my HRV?", 'Am I recovered enough for legs?']) {
    assert.equal(firstThingFits(hrv, q), true, q);
  }
  assert.equal(firstThingLine(hrv), 'One thing first: HRV is down 12% on your baseline.');
});

test('alerts that are not readings of his body are unchanged', () => {
  assert.equal(isBodyReading(hrv), true);
  assert.equal(isBodyReading(missed), false, 'a pipe fault is not a reading');
  assert.equal(firstThingFits(fault, 'Show me a mock-up of the program'), true);
  assert.equal(firstThingFits(missed, 'Show me a mock-up of the program'), true);
});
