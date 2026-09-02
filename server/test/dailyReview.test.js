// Daily Review — temp dirs BEFORE imports. Tests the pure/testable parts
// (config, prompt contract, normalize, context assembly); the model spawn
// itself isn't exercised, same as the other agent suites.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-review-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-review-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { getReviewConfig, setReviewConfig, buildReviewPrompt, composeReviewText, buildReviewContext, setAdjustmentOutcome } = await import('../lib/dailyReview.js');
const { saveDay } = await import('../lib/healthData.js');
const { setProfile } = await import('../lib/profile.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('config: draft/8 default, patch + validate', async () => {
  assert.deepEqual(await getReviewConfig(), { mode: 'draft', hour: 8 });
  assert.deepEqual(await setReviewConfig({ mode: 'auto', hour: 7 }), { mode: 'auto', hour: 7 });
  const bad = await setReviewConfig({ mode: 'nonsense', hour: 99 });
  assert.deepEqual(bad, { mode: 'auto', hour: 7 }); // invalid patch changes nothing
  await setReviewConfig({ mode: 'draft', hour: 8 });
});

test('prompt: reasons through the lens, is cross-domain, and asks for typed JSON', () => {
  const p = buildReviewPrompt('TODAY: HRV 90, protein 0g against 150g floor.');
  assert.ok(p.startsWith('NOVA OPERATING LENS'));
  assert.match(p, /DAILY REVIEW/);
  assert.match(p, /only surface what genuinely warrants/i);
  assert.match(p, /never manufacture problems/i);
  assert.match(p, /"read"/);
  assert.match(p, /"adjustments"/);
  assert.match(p, /HRV 90/);
});

test('compose: normalizes read + adjustments, caps at 3, drops empties, refuses empty', () => {
  const { title, text } = composeReviewText({
    read: 'Recovery is strong; fuel is the gap.',
    adjustments: [
      { do: 'Log breakfast before Push day', why: 'protein floor unmet 3 days' },
      { do: '', why: 'ignored — no action' },
      { do: 'Bank an early night', why: 'sleep debt building' },
      { do: 'Ship the video draft', why: 'priority slipping' },
      { do: 'A fourth that must be dropped', why: 'over the cap' },
    ],
  }, new Date('2026-07-19T08:00:00'));
  assert.match(title, /Daily Review — /);
  assert.match(text, /\*\*Read\.\*\* Recovery is strong/);
  assert.match(text, /1\. Log breakfast before Push day — protein floor unmet 3 days/);
  assert.match(text, /3\. Ship the video draft/);
  assert.doesNotMatch(text, /A fourth/); // capped at 3
  assert.doesNotMatch(text, /ignored/); // empty do dropped

  assert.throws(() => composeReviewText({ read: '', adjustments: [] }), /came back empty/);
});

test('context assembly: composes the cross-domain picture, honestly, without throwing', async () => {
  await saveDay('2026-07-18', { hrv: 90, restingHeartRate: 52, steps: 8000 });
  await setProfile(vault, { focus: 'Lean muscle + content', priorities: ['78kg', 'weekly video'] });
  const ctx = await buildReviewContext(vault, new Date('2026-07-19T08:00:00'));
  assert.ok(ctx.length > 0);
  assert.match(ctx, /ABOUT HAYDEN/); // profile first
  assert.match(ctx, /TODAY'S PICTURE/); // deterministic composer folded in
  assert.match(ctx, /RECOVERY\/DELOAD SIGNAL/);
});

test("the review remembers itself: yesterday's review and its fate ride into today's context", async () => {
  const { createRecord } = await import('../lib/inboxStore.js');
  await createRecord({
    id: 'rev00718', kind: 'review', status: 'discarded', discardedAt: '2026-07-18T20:00:00', declineReason: 'the sleep read was off — I was up with the dog',
    text: 'Daily Review — Saturday 18 July', source: 'nova', mode: 'draft', createdAt: '2026-07-18T08:05:00',
    decision: { route: 'journal', confidence: 'high', title: 'Daily Review — Saturday 18 July', reason: 'x', payload: { text: 'Daily Review — Saturday 18 July\n\n**Read.** Short night.\n\n**Adjustments.**\n1. Bed by 22:30 — sleep debt', category: 'personal', label: 'Daily review reflection' } },
  });
  const ctx = await buildReviewContext(vault, new Date('2026-07-19T08:00:00'));
  assert.match(ctx, /YESTERDAY'S REVIEW \(he declined it — his reason: "the sleep read was off — I was up with the dog"\)/);
  assert.match(ctx, /Bed by 22:30/, 'the adjustments it set are in front of the model');
  assert.match(ctx, /say plainly from today's data whether it happened/);
  // and the prompt holds the model to it
  assert.match(buildReviewPrompt(ctx), /A review that forgets what it said yesterday is not a review/);
  // the day after, with no review the day before, the section is honestly absent
  assert.doesNotMatch(await buildReviewContext(vault, new Date('2026-07-21T08:00:00')), /YESTERDAY'S REVIEW/);
});

test('adjustments ride the record structured, take a done / not-today mark, and tomorrow quotes the marks', async () => {
  const { createRecord, getRecord } = await import('../lib/inboxStore.js');
  const composed = composeReviewText({ read: 'Steady.', adjustments: [{ do: 'Bed by 22:30', why: 'sleep debt' }, { do: 'Walk at lunch', why: '' }] });
  assert.deepEqual(composed.adjustments, [{ do: 'Bed by 22:30', why: 'sleep debt' }, { do: 'Walk at lunch', why: '' }], 'compose hands the structured list back');
  assert.equal(composed.read, 'Steady.');
  await createRecord({
    id: 'rev00801', kind: 'review', status: 'filed', text: 'Daily Review — Saturday 01 August', source: 'nova', mode: 'auto', createdAt: '2026-08-01T08:05:00',
    decision: { route: 'journal', confidence: 'high', title: 'Daily Review — Saturday 01 August', reason: 'x', payload: { text: composed.text, category: 'personal', label: 'Daily review reflection', read: composed.read, adjustments: composed.adjustments } },
  });
  await setAdjustmentOutcome('rev00801', 0, 'done');
  await setAdjustmentOutcome('rev00801', 1, 'skipped');
  let rec = await getRecord('rev00801');
  assert.equal(rec.decision.payload.adjustments[0].outcome, 'done');
  assert.ok(rec.decision.payload.adjustments[0].outcomeAt, 'the mark is stamped');
  assert.equal(rec.decision.payload.adjustments[1].outcome, 'skipped');
  assert.equal(rec.status, 'filed', 'marking never touches the filing');
  await setAdjustmentOutcome('rev00801', 1, null);
  rec = await getRecord('rev00801');
  assert.equal(rec.decision.payload.adjustments[1].outcome, undefined, 'null clears the mark');
  await assert.rejects(setAdjustmentOutcome('rev00801', 5, 'done'), /no such adjustment/);
  await assert.rejects(setAdjustmentOutcome('rev00801', 0, 'maybe'), /outcome must be/);
  await assert.rejects(setAdjustmentOutcome('rev00718', 0, 'done'), /not a daily review|no such adjustment/, 'a legacy review without structured adjustments has nothing to mark');
  // tomorrow's context quotes his marks as facts
  await setAdjustmentOutcome('rev00801', 1, 'skipped');
  const ctx = await buildReviewContext(vault, new Date('2026-08-02T08:00:00'));
  assert.match(ctx, /YESTERDAY'S REVIEW \(he took it into his journal\)/);
  assert.match(ctx, /HIS MARKS ON THEM: 1 — DONE · 2 — NOT TODAY/);
  assert.match(ctx, /never re-issue it unchanged/);
});
