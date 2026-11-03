// A NIGHT TOO SHORT TO BE HIS WHOLE NIGHT (3 Nov 2026, his report: an
// accidental hour asleep with the Watch on, the real night with it off, and
// the Coach debrief reading "sleep 1.1h" back to him as fact). Pinned here:
// the suspect rule on his real shape, the loader holding an unconfirmed night
// back from every reader and passing a confirmed or corrected one, his answer
// on the inbox rails with Undo, a later HealthKit push unable to overwrite
// his figure, the TODAY context line, and the Home card's view model.
// Fixture data only; NOVA_DATA_DIR is set before any lib is imported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'nova-sleepcheck-'));
process.env.NOVA_DATA_DIR = dataDir;
const HEALTH = path.join(dataDir, 'health');

const hd = await import('../lib/healthData.js');
const sc = await import('../lib/sleepCheck.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { undoRecord } = await import('../lib/inbox.js');
const { sleepCheckState } = await import('../../src/sleepCheckCard.js');

test.after(() => rmSync(dataDir, { recursive: true, force: true }));

// his real shape: nights of 370-511 min with gaps, then 68 on 3 Nov
const PRIOR = [
  ['2026-10-24', 455], ['2026-10-25', 370], ['2026-10-27', 511], ['2026-10-28', 432],
  ['2026-10-30', 401], ['2026-10-31', 470], ['2026-11-02', 440],
];
const SHORT = '2026-11-03';

function seed(extra = {}) {
  rmSync(HEALTH, { recursive: true, force: true });
  mkdirSync(HEALTH, { recursive: true });
  for (const [date, min] of PRIOR) writeFileSync(path.join(HEALTH, `${date}.json`), JSON.stringify({ date, sleepAsleepMinutes: min, hrv: 70 }));
  writeFileSync(path.join(HEALTH, `${SHORT}.json`), JSON.stringify({ date: SHORT, sleepAsleepMinutes: 68, sleepInBedMinutes: 75, hrv: 76, ...extra }));
}
const priors = (list) => list.map(([date, sleepAsleepMinutes]) => ({ date, sleepAsleepMinutes }));

test('sleepSuspect: his 68 minutes against 370-511 is suspect, with the median and why', () => {
  const s = hd.sleepSuspect({ date: SHORT, sleepAsleepMinutes: 68 }, priors(PRIOR));
  assert.ok(s);
  assert.equal(s.minutes, 68);
  assert.equal(s.medianMinutes, 440);
  assert.equal(s.thresholdMinutes, 240); // max(4h, half of 440)
  assert.equal(s.priorNights, 7);
  assert.match(s.reason, /1h 8m recorded against a usual 7h 20m/);
});

test('sleepSuspect: an ordinary short night (360 vs a 420 median) is not suspect', () => {
  const p = priors([['2026-10-28', 420], ['2026-10-29', 410], ['2026-10-30', 430], ['2026-10-31', 420], ['2026-11-01', 425]]);
  assert.equal(hd.sleepSuspect({ date: '2026-11-02', sleepAsleepMinutes: 360 }, p), null);
});

test('sleepSuspect: half his median is the bar when that is above four hours', () => {
  const p = priors([['2026-10-28', 600], ['2026-10-29', 600], ['2026-10-30', 600], ['2026-10-31', 600]]);
  assert.ok(hd.sleepSuspect({ date: '2026-11-01', sleepAsleepMinutes: 280 }, p)); // under 300
  assert.equal(hd.sleepSuspect({ date: '2026-11-01', sleepAsleepMinutes: 310 }, p), null);
});

test('sleepSuspect: three prior nights is too little history to call anything unusual', () => {
  assert.equal(hd.sleepSuspect({ date: SHORT, sleepAsleepMinutes: 68 }, priors(PRIOR.slice(-3))), null);
});

test('sleepSuspect: nights older than 14 days do not count toward his usual', () => {
  const old = priors([['2026-10-01', 450], ['2026-10-02', 450], ['2026-10-03', 450], ['2026-10-30', 450]]);
  assert.equal(hd.sleepSuspect({ date: SHORT, sleepAsleepMinutes: 68 }, old), null);
});

test('sleepSuspect: a zero or missing night is missing, not suspect', () => {
  assert.equal(hd.sleepSuspect({ date: SHORT, sleepAsleepMinutes: 0 }, priors(PRIOR)), null);
  assert.equal(hd.sleepSuspect({ date: SHORT, sleepAsleepMinutes: null }, priors(PRIOR)), null);
  assert.equal(hd.sleepSuspect({ date: SHORT }, priors(PRIOR)), null);
});

test('the loader holds an unconfirmed suspect night back from every reader', async () => {
  seed();
  const days = await hd.loadRecentDays(2);
  assert.equal(days.length, 2, 'still exactly the n asked for, though it read further back to judge');
  const d = days.find((x) => x.date === SHORT);
  assert.equal(d.sleepAsleepMinutes, null);
  assert.equal(d.sleepRawMinutes, 68);
  assert.equal(d.sleepInBedMinutes, null);
  assert.equal(d.sleepInBedRawMinutes, 75);
  assert.equal(d.hrv, 76, 'only sleep is held back');
  assert.equal(d.sleepSuspect.medianMinutes, 440);
  assert.equal(d.sleepSuspect.verdict, null);
  assert.equal(days.find((x) => x.date === '2026-11-02').sleepAsleepMinutes, 440, 'a normal night passes untouched');
  // the file on disk is untouched: the gate is on the way out only
  assert.equal((await hd.loadDay(SHORT)).sleepAsleepMinutes, 68);
});

test('a held-back night does not drag his usual down for the night after it', () => {
  const days = [...priors(PRIOR), { date: SHORT, sleepAsleepMinutes: 68 }, { date: '2026-11-04', sleepAsleepMinutes: 200 }];
  const out = hd.applySleepGate(days, {});
  assert.equal(out.at(-1).sleepSuspect.medianMinutes, 440);
});

test('a night he confirmed as real comes through as recorded', () => {
  const out = hd.applySleepGate([...priors(PRIOR), { date: SHORT, sleepAsleepMinutes: 68 }], { [SHORT]: { verdict: 'real', at: 'x' } });
  assert.equal(out.at(-1).sleepAsleepMinutes, 68);
  assert.equal(out.at(-1).sleepConfirmed, true);
  assert.equal(out.at(-1).sleepSuspect, undefined);
});

test('a night he said the watch missed stays unknown, answered', () => {
  const out = hd.applySleepGate([...priors(PRIOR), { date: SHORT, sleepAsleepMinutes: 68 }], { [SHORT]: { verdict: 'missed', at: 'x' } });
  assert.equal(out.at(-1).sleepAsleepMinutes, null);
  assert.equal(out.at(-1).sleepSuspect.verdict, 'missed');
});

test('a night he corrected comes through with his number and says so', () => {
  const out = hd.applySleepGate([...priors(PRIOR), { date: SHORT, sleepAsleepMinutes: 68 }], { [SHORT]: { verdict: 'corrected', minutes: 420, at: 'x' } });
  assert.equal(out.at(-1).sleepAsleepMinutes, 420);
  assert.equal(out.at(-1).sleepSource, 'his correction');
});

test('TODAY context: the unconfirmed line while unanswered, nothing once answered', async () => {
  seed();
  const days = await hd.loadRecentDays(3);
  assert.equal(hd.sleepUnconfirmedLine(days, SHORT),
    "last night's sleep is unconfirmed (1h 8m recorded vs a usual 7h 20m): ask him whether that was his whole night or the watch missed it, do not read it as real");
  assert.equal(hd.sleepUnconfirmedLine(days, '2026-11-02'), null);
  const answered = hd.applySleepGate([...priors(PRIOR), { date: SHORT, sleepAsleepMinutes: 68 }], { [SHORT]: { verdict: 'missed' } });
  assert.equal(hd.sleepUnconfirmedLine(answered, SHORT), null);
});

test('answer "real": one filed record, the night passes, Undo asks again', async () => {
  seed();
  const out = await sc.answerSleepCheck({ date: SHORT, verdict: 'real' });
  assert.equal(out.record.status, 'filed');
  assert.equal(out.record.kind, 'sleep-check');
  assert.equal(out.record.undoData.kind, 'sleep-check');
  assert.match(out.destination, /1h 8m of sleep kept as a real night/);
  assert.equal((await hd.loadRecentDays(1))[0].sleepAsleepMinutes, 68);
  await assert.rejects(sc.answerSleepCheck({ date: SHORT, verdict: 'missed' }), /already answered/);
  await undoRecord(null, out.record.id);
  assert.equal((await getRecord(out.record.id)).status, 'undone');
  const back = (await hd.loadRecentDays(1))[0];
  assert.equal(back.sleepAsleepMinutes, null);
  assert.equal(back.sleepSuspect.verdict, null);
});

test('answer "missed": the night stays unknown and the day file is not touched', async () => {
  seed();
  await sc.answerSleepCheck({ date: SHORT, verdict: 'missed' });
  const d = (await hd.loadRecentDays(1))[0];
  assert.equal(d.sleepAsleepMinutes, null);
  assert.equal(d.sleepSuspect.verdict, 'missed');
  assert.equal((await hd.loadDay(SHORT)).sleepAsleepMinutes, 68);
});

test('answer "corrected": his figure is saved by hand, a later HealthKit push cannot replace it, Undo restores the recording', async () => {
  seed();
  const out = await sc.answerSleepCheck({ date: SHORT, verdict: 'corrected', minutes: 425 });
  let raw = await hd.loadDay(SHORT);
  assert.equal(raw.sleepAsleepMinutes, 425);
  assert.equal(raw.sleepManual, true);
  // the phone re-reads today five minutes later and still sees the 68
  const push = await hd.ingestHealthPayload({ date: SHORT, metrics: { sleepAsleepMinutes: 68, steps: 900 }, source: 'healthkit', skipDateShift: true });
  assert.ok(push.droppedKeys.includes('sleepAsleepMinutes'));
  raw = await hd.loadDay(SHORT);
  assert.equal(raw.sleepAsleepMinutes, 425, 'his figure survives');
  assert.equal(raw.steps, 900, 'the rest of the push still lands');
  // a sleep-only Shortcut push is dropped whole
  const only = await hd.ingestHealthPayload({ date: SHORT, metrics: { sleepAsleepMinutes: 500 } });
  assert.equal(only.allDropped, true);
  const shown = (await hd.loadRecentDays(1))[0];
  assert.equal(shown.sleepAsleepMinutes, 425);
  await undoRecord(null, out.record.id);
  raw = await hd.loadDay(SHORT);
  assert.equal(raw.sleepAsleepMinutes, 68);
  assert.equal(raw.sleepManual, undefined);
  assert.equal(raw.steps, 900, 'undo puts back sleep only');
  assert.equal((await hd.loadRecentDays(1))[0].sleepSuspect.verdict, null);
});

test('undo of a correction refuses when the day was changed since', async () => {
  seed();
  const out = await sc.answerSleepCheck({ date: SHORT, verdict: 'corrected', minutes: 400 });
  await hd.saveDay(SHORT, { sleepAsleepMinutes: 410 }, { manual: true });
  await assert.rejects(undoRecord(null, out.record.id), /changed since/);
});

test('the filer refuses what is not a suspect night, a bad answer or an impossible figure', async () => {
  seed();
  await assert.rejects(sc.answerSleepCheck({ date: '2026-11-02', verdict: 'real' }), /not waiting on an answer/);
  await assert.rejects(sc.answerSleepCheck({ date: SHORT, verdict: 'maybe' }), /answer must be one of/);
  await assert.rejects(sc.answerSleepCheck({ date: SHORT, verdict: 'corrected', minutes: 10 }), /between/);
  await assert.rejects(sc.answerSleepCheck({ date: SHORT, verdict: 'corrected' }), /between/);
});

test('putting the card away is not an answer: the night stays held back, marked dismissed', async () => {
  seed();
  await sc.dismissSleepCheck(SHORT);
  const d = (await hd.loadRecentDays(1))[0];
  assert.equal(d.sleepAsleepMinutes, null);
  assert.equal(d.sleepSuspect.verdict, null);
  assert.equal(d.sleepSuspect.dismissed, true);
  assert.equal(hd.sleepUnconfirmedLine([d], SHORT) != null, true, 'agents still know not to read it');
  assert.ok(existsSync(hd.SLEEP_CHECKS_FILE()));
});

test('the spoken verb files the same answer with its own undo', async () => {
  seed();
  const out = await sc.answerSleepCheck({ date: SHORT, verdict: 'missed', source: 'voice' }, { record: false });
  assert.equal(out.record, undefined);
  assert.equal(out.undo.kind, 'sleep-check');
  await sc.undoSleepCheck(out.undo);
  assert.equal((await hd.loadRecentDays(1))[0].sleepSuspect.verdict, null);
});

// ---- the Home card's view model (src/sleepCheckCard.js)
const held = (over = {}) => [{ date: SHORT, sleepAsleepMinutes: null, sleepRawMinutes: 68, sleepSuspect: { minutes: 68, medianMinutes: 440, verdict: null, ...over } }];

test('card: shown the day a suspect night waits, in his words, the stepper set to his usual', () => {
  const q = sleepCheckState(held(), SHORT, {});
  assert.equal(q.phase, 'asking');
  assert.equal(q.line, 'Last night shows 1h 8m of sleep against your usual 7h 20m. Was that your whole night?');
  assert.equal(q.draft, 440);
  assert.equal(q.tick, 'idle');
  assert.equal(sleepCheckState(held(), SHORT, { date: SHORT, phase: 'stepping', draft: 30 }).draft, 60, 'never under an hour');
  assert.equal(sleepCheckState(held(), SHORT, { date: SHORT, phase: 'stepping', draft: 455 }).draft, 455);
});

test('card: hidden with no suspect night, on another day, once answered or dismissed', () => {
  assert.equal(sleepCheckState([{ date: SHORT, sleepAsleepMinutes: 440 }], SHORT, {}), null);
  assert.equal(sleepCheckState(held(), '2026-11-04', {}), null);
  assert.equal(sleepCheckState(held({ verdict: 'real' }), SHORT, {}), null);
  assert.equal(sleepCheckState(held({ dismissed: true }), SHORT, {}), null);
  assert.equal(sleepCheckState(held(), SHORT, { date: SHORT, dismissedOn: SHORT }), null);
  assert.equal(sleepCheckState(held(), SHORT, { date: SHORT, gone: true }), null);
});

test('card: after an answer here it shows its receipt (with Undo) until it leaves', () => {
  const q = sleepCheckState(held({ verdict: 'corrected' }), SHORT, { date: SHORT, answered: { verdict: 'corrected', minutes: 420 }, recordId: 'r1' });
  assert.equal(q.phase, 'answered');
  assert.equal(q.line, 'Logged 7h for last night.');
  assert.equal(q.undoable, true);
  assert.equal(q.leaving, false);
  const real = sleepCheckState([{ date: SHORT, sleepAsleepMinutes: 68, sleepConfirmed: true }], SHORT, { date: SHORT, answered: { verdict: 'real' }, leaving: true });
  assert.equal(real.line, 'Kept: 1h 8m was the whole night.');
  assert.equal(real.leaving, true);
});
