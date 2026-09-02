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

const { getReviewConfig, setReviewConfig, buildReviewPrompt, composeReviewText, buildReviewContext, setAdjustmentOutcome, failedAttemptsToday, REVIEW_MAX_ATTEMPTS, calendarDetailLines } = await import('../lib/dailyReview.js');
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

// ---- [02] plans 4, 5, 6: hour-honest sections, the week's frame, the fleet's receipts ----
test("an 8am review does not reason from an 'evening' composition; a late run does — and the debrief/fleet sections ride along honestly", async () => {
  const morning = await buildReviewContext(vault, new Date('2026-07-19T08:00:00'));
  assert.doesNotMatch(morning, /HOW TODAY IS GOING/, 'the day has not happened at 8am');
  assert.match(morning, /TODAY'S PICTURE/);
  const late = await buildReviewContext(vault, new Date('2026-07-19T16:30:00'));
  assert.match(late, /HOW TODAY IS GOING/, 'a late manual run keeps the evening picture');
  // the new sections never throw the build; with nothing on record they are absent or say so, never invented
  for (const ctx of [morning, late]) {
    assert.doesNotMatch(ctx, /debrief FAILED|fleet FAILED/, 'the two new reads must not fail on an empty vault');
  }
});

// ---- [02] plan 8: the third failed attempt of the day is the one that pushes ----
test('failedAttemptsToday counts only today\'s errored reviews; the cap is three', () => {
  const now = new Date('2026-08-05T09:00:00');
  const rec = (id, status, at) => ({ id, kind: 'review', status, createdAt: at });
  assert.equal(REVIEW_MAX_ATTEMPTS, 3);
  assert.equal(failedAttemptsToday([], now), 0);
  assert.equal(failedAttemptsToday([rec('a', 'error', '2026-08-05T08:00:00'), rec('b', 'error', '2026-08-05T08:20:00'), rec('c', 'pending', '2026-08-05T08:40:00')], now), 2, 'a live attempt is not a failure');
  assert.equal(failedAttemptsToday([rec('a', 'error', '2026-08-04T08:00:00'), rec('b', 'error', '2026-08-05T08:20:00')], now), 1, "yesterday's failures are yesterday's");
  assert.equal(failedAttemptsToday([rec('a', 'error', '2026-08-05T08:00:00'), rec('b', 'error', '2026-08-05T08:20:00'), rec('c', 'error', '2026-08-05T08:40:00')], now), 3);
  assert.equal(failedAttemptsToday([{ id: 'x', kind: 'plan-today', status: 'error', createdAt: '2026-08-05T08:00:00' }], now), 0, 'another lane\'s error is not a review failure');
});

// ---- [02] plan 3: real calendar lines, capped and honest about the cap ----
test('calendarDetailLines: today and tomorrow as HH:MM lines, all-day said, the cap named, nothing invented', () => {
  const now = new Date('2026-08-05T08:00:00');
  assert.equal(calendarDetailLines([], now), 'TODAY & TOMORROW ON THE CALENDAR: nothing.');
  const ev = (date, time, label, end) => ({ date, time, end, label });
  const out = calendarDetailLines([ev('2026-08-05', '09:30', 'Cook block', '10:30'), ev('2026-08-05', null, 'Bin day'), ev('2026-08-06', '15:30', 'Work 💰'), ev('2026-08-09', '10:00', 'Far away')], now);
  assert.match(out, /^TODAY & TOMORROW ON THE CALENDAR:\n/);
  assert.match(out, /- today 09:30–10:30 Cook block/);
  assert.match(out, /- today all day Bin day/);
  assert.match(out, /- tomorrow 15:30 Work 💰/);
  assert.doesNotMatch(out, /Far away/, 'later days stay in the week-ahead counts');
  // a busy today must not push tomorrow off the list — the cap is per day, and named
  const many = [
    ...Array.from({ length: 9 }, (_, i) => ev('2026-08-05', `${String(8 + i).padStart(2, '0')}:00`, `Event ${i + 1}`)),
    ev('2026-08-06', '07:00', 'Early tomorrow'),
  ];
  const capped = calendarDetailLines(many, now);
  assert.match(capped, /\(today: first 4 of 9\)/, 'a silent cap is a lie about his day');
  assert.match(capped, /- tomorrow 07:00 Early tomorrow/, 'tomorrow survives a busy today');
  assert.equal((capped.match(/^- /gm) || []).length, 5);
});
