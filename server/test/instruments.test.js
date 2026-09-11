// The instruments are the morning brief drawn instead of said, so the thing
// worth pinning is the honesty: a day Nova never received must stay a hole,
// a stale reading must carry its age, and a verdict must be about HIS band
// rather than a number in the abstract.
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildVitals, buildWeek, buildDay, musclesForRoutine } =
  await import('../lib/instruments.js');

const DAY = 86_400_000;
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const ago = (n, now) => iso(new Date(now.getTime() - n * DAY));

/* ------------------------------------------------------------- vitals ---- */

test('HRV is judged against his own band, not an absolute', () => {
  const now = new Date('2026-09-11T11:44:00');
  const days = [
    { date: ago(0, now), hrv: 86.8, restingHeartRate: 57 },
    { date: ago(1, now), hrv: 78 }, { date: ago(2, now), hrv: 74 },
    { date: ago(3, now), hrv: 80 }, { date: ago(4, now), hrv: 71 },
  ];
  const v = buildVitals(days, now);
  assert.equal(v.ok, true);
  assert.equal(v.hrv, 86.8);
  assert.equal(v.restingHr, 57);
  assert.equal(v.band.lo, 71);
  assert.equal(v.band.hi, 80);
  assert.equal(v.band.n, 4);
  assert.equal(v.verdict, 'recovered');       // ~+14% over his own average
  assert.equal(v.stale, false);
});

test('a reading below his own band reads as strained, not as a bad number', () => {
  const now = new Date('2026-09-11T08:00:00');
  const days = [
    { date: ago(0, now), hrv: 60 },
    { date: ago(1, now), hrv: 78 }, { date: ago(2, now), hrv: 74 }, { date: ago(3, now), hrv: 80 },
  ];
  assert.equal(buildVitals(days, now).verdict, 'strained');
});

test('a stale reading carries its age so the verdict can be hedged', () => {
  const now = new Date('2026-09-11T08:00:00');
  const days = [
    { date: ago(2, now), hrv: 86.8 },
    { date: ago(3, now), hrv: 78 }, { date: ago(4, now), hrv: 74 }, { date: ago(5, now), hrv: 80 },
  ];
  const v = buildVitals(days, now);
  assert.equal(v.staleDays, 2);
  assert.equal(v.stale, true);
});

test('no HRV ever recorded says so instead of drawing a heart at zero', () => {
  const v = buildVitals([{ date: '2026-09-10', steps: 900 }], new Date('2026-09-11'));
  assert.equal(v.ok, false);
  assert.equal(v.hrv, null);
  assert.match(v.reason, /no HRV/i);
});

test('a band needs three other days — two is not a baseline', () => {
  const now = new Date('2026-09-11T08:00:00');
  const v = buildVitals([{ date: ago(0, now), hrv: 80 }, { date: ago(1, now), hrv: 75 }], now);
  assert.equal(v.ok, true);
  assert.equal(v.band, null);
});

/* --------------------------------------------------------------- week ---- */

test('a day Nova never received is a hole, never a zero', () => {
  const now = new Date('2026-09-11T11:44:00');
  const days = [
    { date: ago(0, now), steps: 7677 }, { date: ago(2, now), steps: 8340 },
    { date: ago(3, now), steps: 11460 }, { date: ago(4, now), steps: 9120 },
  ];
  const w = buildWeek(days, now, { floor: 8000 });
  assert.equal(w.series.length, 7);
  const thu = w.series.find((s) => s.date === ago(1, now));
  assert.equal(thu.steps, null, 'the missing day is null, not 0');
  assert.deepEqual(w.missing, [ago(6, now), ago(5, now), ago(1, now)]);
  assert.equal(w.total, 7677 + 8340 + 11460 + 9120);
  assert.equal(w.weekTarget, 56000);
  assert.equal(w.short, 56000 - w.total);
  assert.equal(w.series.at(-1).today, true);
});

test('without a step goal the week still draws, and simply has no floor', () => {
  const now = new Date('2026-09-11T11:44:00');
  const w = buildWeek([{ date: ago(0, now), steps: 5000 }], now, {});
  assert.equal(w.ok, true);
  assert.equal(w.floor, null);
  assert.equal(w.weekTarget, null);
  assert.equal(w.short, null);
});

/* ---------------------------------------------------------------- day ---- */

test('blocks land where they fall, and the anchor is the biggest one still ahead', () => {
  const now = new Date('2026-09-11T11:44:00');
  // his calendar's real public shape: { time, end, label }
  const d = buildDay([
    { time: '07:30', end: '08:15', label: 'Workout' },
    { time: '15:30', end: '19:30', label: 'Work' },
    { time: '22:00', end: '22:30', label: 'Mindfulness' },
  ], now);
  assert.equal(d.ok, true);
  assert.equal(d.blocks.length, 3);
  assert.equal(d.blocks[0].t, 7.5);
  assert.equal(d.blocks[1].len, 4);
  assert.equal(d.anchor.label, 'Work');       // longest of what is left
  assert.equal(d.now, 11.7);      // the payload rounds to one decimal
});

test('an untimed event is not a block on a 24-hour ring', () => {
  // all-day events come back with no `time` at all
  const d = buildDay([{ label: 'Birthday', date: '2026-09-11' }], new Date('2026-09-11T09:00:00'));
  assert.equal(d.ok, false);
  assert.match(d.reason, /no timed events/i);
});

/* --------------------------------------------------------------- body ---- */

test('the muscles lit are the union of what the session actually works', () => {
  const m = musclesForRoutine({ exercises: [
    { exerciseId: 'barbell-bench-press' },      // chest / front-delts + triceps
    { exerciseId: 'pull-up' },
  ] });
  assert.ok(m.primary.includes('chest'));
  assert.ok(m.primary.length > 0);
  // nothing worked directly is also listed as support
  assert.equal(m.primary.some((x) => m.secondary.includes(x)), false);
});

test('an exercise the atlas does not know contributes nothing, and is counted', () => {
  const m = musclesForRoutine({ exercises: [{ exerciseId: 'not-a-real-lift' }] });
  assert.deepEqual(m.primary, []);
  assert.deepEqual(m.secondary, []);
  assert.equal(m.unknown, 1);
});
