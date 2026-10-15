// THE RECORD BANNER, ONE DECIDER FOR BOTH LIVE SESSIONS (15 Oct 2026).
//
// His phone runs cupertino, whose live session is the classic SessionView;
// the record banner lived only in the summary idiom's set card. Now both
// call sessionSummaryFacts.liveRecord. Pinned here: the rule at the
// resolution Nova SHOWS (a repeat of his best is never a record, the 12 Sep
// class), and that the classic and summary view models hand their screens
// the very object that function returns, so the two can never disagree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// never his live server/data
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-liverecord-'));

const { liveRecord, liveE1rm } = await import('../../src/sessionSummaryFacts.js');
const { valsSessionSummary } = await import('../../src/vals/valsSessionSummary.js');
const { valsWorkouts } = await import('../../src/vals/valsWorkouts.js');

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const done = (weight, reps, extra = {}) => ({ weight, reps, done: true, ...extra });
// his best, as GET /workouts/bests returns it: the e1RM stored at one decimal
const bestOf = (w, r, history = []) => ({ e1rm: Math.round(w * (1 + r / 30) * 10) / 10, history });

test('a repeat of his displayed best is not a record, nor a weight that only differs past the shown decimal', () => {
  const best = bestOf(60, 8); // 76
  assert.equal(liveRecord({ sets: [done(60, 8)], best }), null, 'the same set again');
  assert.equal(liveRecord({ sets: [done(60, 8), done(60, 8), done(60, 7)] , best }), null);
  assert.equal(liveRecord({ sets: [done(60.04, 8)], best }), null, '60.04 is drawn as 60: the same number on screen is the same set');
  assert.equal(liveRecord({ sets: [done('60', '8')], best }), null, 'a typed string is the same set');
  // a best the server rounded (9.1 × 7 → 11.2): the identical set ties, never clears by a remainder
  assert.equal(liveRecord({ sets: [done(9.1, 7)], best: bestOf(9.1, 7) }), null);
});

test('a heavier displayed weight, or more reps at the same weight, is a record', () => {
  const best = bestOf(60, 8, [{ e1rm: 72 }, { e1rm: 76 }]);
  const heavier = liveRecord({ sets: [done(60, 8), done(62.5, 8)], best, exIdx: 2, name: 'Lat Pulldown', hue: 'var(--nv-m-back)', scope: 's1' });
  assert.equal(heavier.setIdx, 1);
  assert.equal(heavier.value, liveE1rm(done(62.5, 8)));
  assert.equal(heavier.previous, 76);
  assert.equal(heavier.delta, Math.round((heavier.value - 76) * 10) / 10);
  assert.equal(heavier.set, '62.5 × 8');
  assert.deepEqual(heavier.history, [72, 76, heavier.value], 'his line, then today');
  assert.equal(heavier.name, 'Lat Pulldown');
  assert.equal(heavier.hue, 'var(--nv-m-back)');

  const moreReps = liveRecord({ sets: [done(60, 9)], best });
  assert.ok(moreReps, '60 × 9 beats 60 × 8');
  assert.equal(moreReps.set, '60 × 9');

  // a heavier set later is its own record, so its own moment (a new key)
  const first = liveRecord({ sets: [done(62.5, 8), { weight: 65, reps: 8, done: false }], best, scope: 's1' });
  const second = liveRecord({ sets: [done(62.5, 8), done(65, 8)], best, scope: 's1' });
  assert.notEqual(first.key, second.key);
  assert.equal(second.setIdx, 1);
  // the same record keeps its key across renders (it plays once)
  assert.equal(liveRecord({ sets: [done(62.5, 8)], best, scope: 's1' }).key, first.key);
});

test('un-ticked sets, warm-ups, no best, bodyweight and timed lifts never open the banner', () => {
  const best = bestOf(60, 8);
  assert.equal(liveRecord({ sets: [{ weight: 70, reps: 8, done: false }], best }), null, 'un-ticking the set takes the banner away');
  assert.equal(liveRecord({ sets: [done(70, 8, { setType: 'warmup' })], best }), null, 'a warm-up never counts');
  assert.ok(liveRecord({ sets: [done(70, 8, { setType: 'backoff' })], best }), 'a back-off set is a working set');
  assert.equal(liveRecord({ sets: [done(70, 8)], best: null }), null, 'no best held: nothing claimed');
  assert.equal(liveRecord({ sets: [done(70, 8)], best: { e1rm: null } }), null);
  assert.equal(liveRecord({ sets: [done(0, 20)], best, trackingType: 'bodyweight_reps' }), null);
  assert.equal(liveRecord({ sets: [done(70, 60)], best, trackingType: 'weight_time' }), null);
  assert.equal(liveRecord({ sets: [done(70, 15)], best }), null, 'past 12 reps there is no estimate to compare');
});

// ------------------------------------------ both idioms, one function --

const SESSION = {
  routineId: 'r', routineName: 'Pull day', startedAt: 1_000,
  exercises: [
    { exerciseId: 'a', name: 'Lat Pulldown', muscleGroup: 'Back', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 8,
      last: { sets: [{ weight: 60, reps: 8 }] },
      sets: [done(60, 8), done(62.5, 8), { weight: 62.5, reps: 7, done: false }] },
    { exerciseId: 'b', name: 'Face Pull', muscleGroup: 'Shoulders', trackingType: 'weight_reps', targetSets: 1, targetRepsLow: 12, targetRepsHigh: 15,
      last: null, sets: [done(20, 12)] },
  ],
};
const BESTS = { a: bestOf(60, 8, [{ e1rm: 74 }, { e1rm: 76 }]), b: bestOf(20, 12) };
const expected = (exIdx) => {
  const e = SESSION.exercises[exIdx];
  return liveRecord({ sets: e.sets, best: BESTS[e.exerciseId], trackingType: e.trackingType, exIdx, name: e.name, hue: 'var(--nv-m-back)', scope: '1000' });
};

function appWith(style) {
  const app = {
    state: {
      novaStyle: style, screen: 'workouts', workoutsView: 'session', trainTab: 'gym', editingSessionId: null,
      restTimerPref: { on: true, seconds: 90 }, exercisePickerQuery: '', coachChat: [],
      workoutSession: SESSION, sessionBests: BESTS, sessionSumKey: '1000',
    },
    basePlan: [],
    setState() {},
  };
  for (const m of ['toggleSessionSetDone', 'updateSessionSet', 'addSessionSet', 'removeSessionSet', 'toggleSessionExerciseSkipped',
    'updateSessionExerciseField', 'removeExerciseFromSession', 'doCoach', 'speakTtsSentence', 'openExerciseCard', 'openContextMenu']) app[m] = () => {};
  return app;
}

test('the classic session (cupertino, his phone) and the summary session hand their banners the one decider\'s answer', () => {
  // classic: every lift carries its own record
  const classic = valsWorkouts(appWith('cupertino'), { demoMode: false });
  const lat = classic.sessionExercises[0].record;
  assert.ok(lat, 'the Lat Pulldown at 62.5 × 8 beats his 60 × 8');
  assert.equal(lat.hue, 'var(--nv-m-back)', 'in the muscle\'s hue (src/muscleHue.js)');
  assert.deepEqual(lat, expected(0));
  assert.equal(classic.sessionExercises[1].record, null, 'a repeat of his Face Pull best is not a record');

  // summary: the set card's banner, from the same session and the same bests
  const app = appWith('summary');
  const v = valsWorkouts(app, { demoMode: false });
  const S = valsSessionSummary(app, { demoMode: false }, v).sessionSummary;
  assert.deepEqual(S.record, lat, 'the same object, so the same key: shown under one style, it never replays under the other');
  assert.equal(S.pills[1].pb, true, 'the set that did it wears the badge');
});

test('source contract: both view models import liveRecord and neither keeps an estimate formula of its own', () => {
  for (const f of ['src/vals/valsWorkouts.js', 'src/vals/valsSessionSummary.js']) {
    const src = read(f);
    assert.match(src, /import \{[^}]*\bliveRecord\b[^}]*\} from '\.\.\/sessionSummaryFacts\.js'/, `${f} imports the one decider`);
    assert.match(src, /liveRecord\(\{/, `${f} calls it`);
    assert.doesNotMatch(src, /1 \+ r \/ 30|1 \+ reps \/ 30/, `${f} has no e1RM formula of its own`);
  }
  const banner = read('src/motion/RecordBanner.jsx');
  assert.match(banner, /export function RecordBanner/);
  assert.match(banner, /counts once you save/, 'provisional: only Save makes it a record');
  assert.match(banner, /const SHOWN = new Set\(\);/, 'once per record');
  assert.match(read('src/screens/Workouts.jsx'), /<RecordBanner key=\{e\.record\.key\} r=\{e\.record\} \/>/, 'the classic card keys the banner by its record');
  assert.match(read('src/screens/SessionSummary.jsx'), /import \{ RecordBanner \} from '\.\.\/motion\/RecordBanner\.jsx'/);
});
