// THE SUMMARY LIVE SESSION (28 Sep 2026, design/mockups/61, Train round B).
// Three layers pinned: the pure facts (src/sessionSummaryFacts.js) — the rest
// timer's state machine, the record compared at the resolution it is shown,
// the voice preview's parse → commit contract, the pad, the increment; the
// view model (src/vals/valsSessionSummary.js) over a fake app, so "nothing
// writes on its own" is a test, not a comment; and the source contracts no
// screenshot would catch breaking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  shownKg, fmtKg, parseRestPref, restPrefValue, restStart, restState, restChoiceLabel, REST_DEFAULT,
  recordCandidates, voicePreview, commitOps, splitYes, padKey, liftIncrement,
} from '../../src/sessionSummaryFacts.js';
import { valsSessionSummary } from '../../src/vals/valsSessionSummary.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// ------------------------------------------------------- the rest timer --

test('rest pref: one key, "off" or the seconds; anything else is on at 90 s', () => {
  assert.deepEqual(parseRestPref(null), { on: true, seconds: 90 });
  assert.deepEqual(parseRestPref('off'), { on: false, seconds: REST_DEFAULT });
  assert.deepEqual(parseRestPref('120'), { on: true, seconds: 120 });
  assert.deepEqual(parseRestPref('45'), { on: true, seconds: 90 }, 'not a choice → the default');
  assert.equal(restPrefValue({ on: false, seconds: 60 }), 'off');
  assert.equal(restPrefValue({ on: true, seconds: 180 }), '180');
  assert.deepEqual(parseRestPref(restPrefValue({ on: true, seconds: 60 })), { on: true, seconds: 60 });
  assert.deepEqual([60, 90, 120, 180].map(restChoiceLabel), ['60 s', '90 s', '2 min', '3 min']);
});

test('restStart: nothing counts when the row is off, or on a past session being edited', () => {
  const t0 = 1_000_000;
  assert.equal(restStart({ on: false, seconds: 90 }, t0), null);
  assert.equal(restStart({ on: true, seconds: 90 }, t0, { editing: true }), null);
  assert.deepEqual(restStart({ on: true, seconds: 120 }, t0), { startedAt: t0, endsAt: t0 + 120_000, total: 120 });
  assert.equal(restStart({ on: true, seconds: 7 }, t0).total, 90, 'an unknown length is the default');
});

test('restState: 1:30 the instant it starts, 0:01 in its last second, then done — never 0:00 while counting', () => {
  const t0 = 5_000_000;
  const r = restStart({ on: true, seconds: 90 }, t0);
  assert.deepEqual(restState(null, t0), { phase: 'off' });
  const a = restState(r, t0);
  assert.equal(a.phase, 'resting'); assert.equal(a.left, 90); assert.equal(a.label, '1:30'); assert.equal(a.frac, 1);
  const b = restState(r, t0 + 30_500);
  assert.equal(b.label, '1:00'); assert.ok(Math.abs(b.frac - 59.5 / 90) < 1e-9);
  assert.equal(restState(r, t0 + 89_100).label, '0:01');
  assert.deepEqual(restState(r, t0 + 90_000), { phase: 'done' });
  assert.deepEqual(restState(r, t0 + 400_000), { phase: 'done' });
});

// ------------------------------------------------- the record, previewed --

const lift = (name, sets, last, extra = {}) => ({ name, muscleGroup: 'Back', trackingType: 'weight_reps', sets, last: last ? { sets: last } : null, ...extra });
const done = (weight, reps, extra = {}) => ({ weight, reps, done: true, ...extra });

test('record: compared at the resolution SHOWN — a repeat is never a record, and a rounding remainder is not one either', () => {
  assert.deepEqual(recordCandidates([lift('Row', [done(60, 8), done(60, 8)], [{ weight: 60, reps: 8 }])]), [], 'the same set again');
  // 60.04 is shown as "60": the number he would see is the same number
  assert.deepEqual(recordCandidates([lift('Row', [done(60.04, 8)], [{ weight: 60, reps: 8 }])]), []);
  assert.equal(shownKg(60.04), 60);
  assert.equal(fmtKg(62.5), '62.5'); assert.equal(fmtKg(60), '60');
  const [c] = recordCandidates([lift('Lat Pulldown', [done(60, 8), done(62.5, 8), done(62.5, 7)], [{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }])]);
  assert.equal(c.kind, 'weight'); assert.equal(c.value, 62.5); assert.equal(c.reps, 8); assert.equal(c.previous, 60); assert.equal(c.delta, 2.5);
});

test('record: warm-ups, unticked sets, skipped lifts and lifts with no last time never count; same weight with more reps does', () => {
  assert.deepEqual(recordCandidates([lift('Row', [done(80, 5, { setType: 'warmup' }), done(60, 8)], [{ weight: 60, reps: 8 }])]), [], 'a warm-up at 80 is not a record');
  assert.deepEqual(recordCandidates([lift('Row', [{ weight: 70, reps: 8, done: false }], [{ weight: 60, reps: 8 }])]), []);
  assert.deepEqual(recordCandidates([lift('Row', [done(70, 8)], [{ weight: 60, reps: 8 }], { skipped: true })]), []);
  assert.deepEqual(recordCandidates([lift('New', [done(70, 8)], null)]), [], 'nothing held to compare with — no claim');
  const [r] = recordCandidates([lift('Row', [done(60, 10)], [{ weight: 60, reps: 8 }])]);
  assert.deepEqual([r.kind, r.weight, r.value, r.previous, r.delta], ['reps', 60, 10, 8, 2]);
  const [bw] = recordCandidates([lift('Pull-Up', [done(0, 11)], [{ weight: 0, reps: 9 }], { trackingType: 'bodyweight_reps' })]);
  assert.deepEqual([bw.kind, bw.value, bw.previous], ['reps', 11, 9]);
  // a heavier bar leads a rep; then the bigger step for its size
  const order = recordCandidates([
    lift('Reps', [done(60, 10)], [{ weight: 60, reps: 8 }]),
    lift('Small', [done(102.5, 5)], [{ weight: 100, reps: 5 }]),
    lift('Big', [done(22, 10)], [{ weight: 20, reps: 10 }]),
  ]).map((x) => x.name);
  assert.deepEqual(order, ['Big', 'Small', 'Reps']);
});

// ---------------------------------------------------- the voice preview --

const sess = () => ({ exercises: [lift('Row', [done(60, 8), done(60, 8), { weight: 60, reps: 7, done: false }, { weight: 60, reps: 6, done: false }], null)] });

test('voice: a set is DRAWN on the open set and waits; "yes" in the same breath is the commit', () => {
  const s = sess();
  const p = voicePreview('62.5 for 8', { exIdx: 0, e: s.exercises[0], selIdx: 2 });
  assert.deepEqual({ kind: p.kind, setIdx: p.setIdx, add: p.add, weight: p.weight, reps: p.reps, yes: p.yes, count: p.count }, { kind: 'set', setIdx: 2, add: false, weight: 62.5, reps: 8, yes: false, count: 4 });
  assert.equal(voicePreview('62.5 for 8, yes', { exIdx: 0, e: s.exercises[0], selIdx: 2 }).yes, true);
  assert.deepEqual(splitYes('62.5 for 8 yeah'), { body: '62.5 for 8', yes: true });
  assert.deepEqual(splitYes('yes'), { body: '', yes: true });
  assert.deepEqual(voicePreview('yes', { exIdx: 0, e: s.exercises[0] }), { kind: 'yes' });
  // a reopened (logged) set on the card is not overwritten: the words go to the next open one
  assert.equal(voicePreview('10 reps', { exIdx: 0, e: s.exercises[0], selIdx: 0 }).setIdx, 2);
});

test('voice: "same again" copies the set just logged; a miss says so and never guesses', () => {
  const s = sess();
  const same = voicePreview('same again', { exIdx: 0, e: s.exercises[0], selIdx: 2 });
  assert.deepEqual([same.kind, same.weight, same.reps], ['set', 60, 8]);
  const fresh = lift('Row', [{ weight: 60, reps: 8, done: false }], null);
  assert.equal(voicePreview('same again', { exIdx: 0, e: fresh }).kind, 'miss');
  assert.equal(voicePreview('twelve', { exIdx: 0, e: fresh }).kind, 'miss');
  assert.equal(voicePreview('12', { exIdx: 0, e: fresh }).kind, 'miss', '"12" alone is never 1 × 2 (gymVoice rule)');
  assert.equal(voicePreview('', { exIdx: 0, e: fresh }), null);
  assert.equal(voicePreview('next', { exIdx: 0, e: fresh }).kind, 'next');
  assert.equal(voicePreview('drop to 55', { exIdx: 0, e: fresh }).weight, 55);
});

test('commitOps: exactly the classic session\'s methods, in order; a full lift gets a new set; a logged set is filled, never unticked', () => {
  const s = sess();
  const p = voicePreview('62.5 for 8 at 8', { exIdx: 0, e: s.exercises[0], selIdx: 2 });
  assert.deepEqual(commitOps(p, s), [
    ['updateSessionSet', 0, 2, 'weight', 62.5],
    ['updateSessionSet', 0, 2, 'reps', 8],
    ['updateSessionSet', 0, 2, 'rpe', 8],
    ['toggleSessionSetDone', 0, 2],
  ]);
  const full = { exercises: [lift('Row', [done(60, 8)], null)] };
  const q = voicePreview('60 for 9', { exIdx: 0, e: full.exercises[0] });
  assert.deepEqual(commitOps(q, full).map((o) => o[0]), ['addSessionSet', 'updateSessionSet', 'updateSessionSet', 'toggleSessionSetDone']);
  assert.equal(q.setIdx, 1);
  // the set got ticked by other hands between preview and commit: fill it, do not untick it
  const raced = sess(); raced.exercises[0].sets[2].done = true;
  assert.ok(!commitOps({ ...p }, raced).some((o) => o[0] === 'toggleSessionSetDone'));
  assert.deepEqual(commitOps({ kind: 'next' }, s), []);
  assert.deepEqual(commitOps(null, s), []);
});

// ------------------------------------------------ the pad, the increment --

test('pad: the first key replaces, then keys append; one point; ±step; delete', () => {
  assert.equal(padKey('60', '6', { fresh: true }), '6');
  assert.equal(padKey('6', '2'), '62');
  assert.equal(padKey('62', '.'), '62.');
  assert.equal(padKey('62.', '.'), '62.');
  assert.equal(padKey('62.', '5'), '62.5');
  assert.equal(padKey('62.5', '5'), '62.5', 'one decimal is the resolution shown');
  assert.equal(padKey('62.5', 'del'), '62.');
  assert.equal(padKey('60', '+', { step: 2.5 }), '62.5');
  assert.equal(padKey('1', '-', { step: 2.5 }), '0', 'never below zero');
  assert.equal(padKey('8', '.', { decimals: false }), '8', 'reps take no point');
  assert.equal(padKey('8', '+', { step: 1, decimals: false }), '9');
  assert.equal(padKey('0', '7'), '7');
});

test('the lift\'s own increment: Coach\'s step, else the smallest gap he has loaded, else 2.5', () => {
  assert.equal(liftIncrement({ coach: { kind: 'weight', delta: 1.25 } }), 1.3, 'shown at one decimal');
  assert.equal(liftIncrement({ last: { sets: [{ weight: 14 }, { weight: 16 }] }, sets: [{ weight: 18 }] }), 2);
  assert.equal(liftIncrement({ last: { sets: [{ weight: 9.1 }, { weight: 11.3 }] } }), 2.2);
  assert.equal(liftIncrement({ sets: [{ weight: 60 }, { weight: 60 }] }), 2.5);
  assert.equal(liftIncrement({}), 2.5);
});

// ------------------------------------------------------- the view model --

function fakeApp(state = {}) {
  const calls = [];
  const app = {
    state: {
      novaStyle: 'summary', screen: 'workouts', workoutsView: 'session', editingSessionId: null,
      restTimerPref: { on: true, seconds: 90 },
      workoutSession: {
        routineId: 'r', routineName: 'Pull day', startedAt: 1_000,
        exercises: [
          { exerciseId: 'a', name: 'Lat Pulldown', muscleGroup: 'Back', trackingType: 'weight_reps', targetSets: 3, targetRepsLow: 8, targetRepsHigh: 8,
            coach: { kind: 'weight', delta: 2.5 }, last: { sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 7 }] },
            sets: [{ weight: 60, reps: 8, done: true }, { weight: 60, reps: 7, done: false }, { weight: 60, reps: 6, done: false }] },
          { exerciseId: 'b', name: 'Face Pull', muscleGroup: 'Shoulders', trackingType: 'weight_reps', targetSets: 1, targetRepsLow: 12, targetRepsHigh: 15,
            last: null, sets: [{ weight: 20, reps: 12, done: false }] },
        ],
      },
      sessionSumKey: '1000',
      ...state,
    },
    setState(patch) {
      const p = typeof patch === 'function' ? patch(this.state) : patch;
      if (p) this.state = { ...this.state, ...p };
    },
  };
  for (const m of ['toggleSessionSetDone', 'updateSessionSet', 'addSessionSet', 'removeSessionSet', 'toggleSessionExerciseSkipped',
    'updateSessionExerciseField', 'removeExerciseFromSession', 'doCoach', 'speakTtsSentence']) {
    app[m] = (...args) => calls.push([m, ...args]);
  }
  return { app, calls };
}
const rowOf = (calls) => (e, i) => ({
  muscleGroup: e.muscleGroup, onOpen: () => {}, onLongPress: () => {}, onToggleSkip: () => calls.push(['toggleSessionExerciseSkipped', i]),
  onAddSet: () => calls.push(['addSessionSet', i]), toggleAnomaly: () => {}, formUrl: 'x', formCurated: false, formCheckOpen: () => {},
  openPain: () => {}, closePain: () => {}, painOpen: false, painState: null, painAreas: [], painOther: [], setPainField: () => () => {}, submitPain: () => {},
  coachOpen: null, coachAsk: null, formCheck: null,
});
const vOf = (app, calls) => ({
  sessionExercises: (app.state.workoutSession?.exercises || []).map(rowOf(calls)),
  sessionHasUndone: true, sessionCutShort: null, setSessionCutShort: () => {}, canSaveForLater: true,
  saveForLater: () => calls.push(['saveWorkoutForLater']), finishSession: () => calls.push(['finishWorkoutSession']),
  requestCancelSession: () => {}, discardSession: () => {}, cancelSessionCancel: () => {}, sessionCancelConfirm: false,
  openVoiceForSession: () => {}, openSessionExercisePicker: () => {}, exercisePickerOpen: false, closeExercisePicker: () => {},
});
const CTX = { demoMode: false };

test('the view model is null off summary, off the session and off the screen; demo renders it; the Settings row is summary-only', () => {
  const run = (st, ctx = CTX) => { const { app, calls } = fakeApp(st); return valsSessionSummary(app, ctx, vOf(app, calls)); };
  assert.equal(run({ novaStyle: 'cupertino' }).sessionSummary, null);
  assert.equal(run({ novaStyle: 'cupertino' }).restTimerSetting, null);
  assert.equal(run({ novaStyle: 'command' }).sessionSummary, null);
  assert.ok(run({}, { demoMode: true }).sessionSummary, 'a demo session is in-memory state, so demo shows the view his phone shows');
  assert.equal(run({ workoutsView: 'routines' }).sessionSummary, null);
  assert.equal(run({ screen: 'mission' }).sessionSummary, null);
  assert.equal(run({ workoutSession: null }).sessionSummary, null);
  assert.ok(run({}).sessionSummary);
  assert.ok(run({ workoutSession: null }).restTimerSetting, 'the row shows under summary with or without a session');
});

test('rendering writes nothing; the card holds the open set; Coach\'s number is gold only while it is not on the card', () => {
  const { app, calls } = fakeApp();
  const S = valsSessionSummary(app, CTX, vOf(app, calls)).sessionSummary;
  assert.deepEqual(calls, [], 'building the view model called no app method');
  assert.equal(S.set.label, 'Set 2 of 3');
  assert.equal(S.set.weight.text, '60');
  assert.equal(S.set.coach.label, 'Coach: try 62.5');
  assert.equal(S.set.coach.waiting, true);
  assert.equal(S.set.same.label, '60 × 8');
  assert.equal(S.lift.last, '60 kg × 8, 8, 7');
  app.state.workoutSession.exercises[0].sets[1].weight = 62.5;
  const S2 = valsSessionSummary(app, CTX, vOf(app, calls)).sessionSummary;
  assert.equal(S2.set.coach.waiting, false, 'on the card, it waits on nothing');
});

test('the tick logs through toggleSessionSetDone and starts the rest only when the row is on', () => {
  const { app, calls } = fakeApp();
  valsSessionSummary(app, CTX, vOf(app, calls)).sessionSummary.set.tick();
  assert.deepEqual(calls, [['toggleSessionSetDone', 0, 1]]);
  assert.equal(app.state.sessionRest.total, 90);
  const off = fakeApp({ restTimerPref: { on: false, seconds: 90 } });
  valsSessionSummary(off.app, CTX, vOf(off.app, off.calls)).sessionSummary.set.tick();
  assert.equal(off.app.state.sessionRest, null, 'off, the tick stays on its spot');
});

test('voice: words alone draw the set and write nothing; "yes" commits through the classic methods', () => {
  const { app, calls } = fakeApp();
  const S = valsSessionSummary(app, CTX, vOf(app, calls)).sessionSummary;
  S.voice.hear('62.5 for 8');
  assert.deepEqual(calls, [], 'a preview is not a set');
  const S2 = valsSessionSummary(app, CTX, vOf(app, calls)).sessionSummary;
  assert.equal(S2.voice.preview.weight, '62.5');
  assert.equal(S2.voice.preview.where, 'set 2 of 3');
  S2.voice.hear('62.5 for 8 yes');
  assert.deepEqual(calls, [
    ['updateSessionSet', 0, 1, 'weight', 62.5],
    ['updateSessionSet', 0, 1, 'reps', 8],
    ['toggleSessionSetDone', 0, 1],
  ]);
  assert.match(app.state.sessionSumVoice.note, /Logged 62\.5 × 8 on set 2 of 3/);
  // what was acted on stays acted on: the same words heard again do nothing more
  valsSessionSummary(app, CTX, vOf(app, calls)).sessionSummary.voice.hear('62.5 for 8 yes');
  assert.equal(calls.length, 3);
});

test('a page state from another session is never used: the rail, set and rest are keyed to this session', () => {
  const { app, calls } = fakeApp({ sessionSumKey: 'an-old-session', sessionSumLift: 1, sessionRest: { endsAt: 9e15, total: 90 } });
  const S = valsSessionSummary(app, CTX, vOf(app, calls)).sessionSummary;
  assert.equal(S.fresh, false);
  assert.equal(S.lift.name, 'Lat Pulldown', 'the stale lift index is ignored');
  assert.equal(S.rest, null, 'the stale rest is ignored');
  S.adopt();
  assert.equal(app.state.sessionSumKey, '1000');
});

// --------------------------------------------------- source contracts --

const NEW = ['src/screens/SessionSummary.jsx', 'src/vals/valsSessionSummary.js', 'src/sessionSummaryFacts.js'];

test('Workouts.jsx renders the summary session only under summary, after the Train page and before the classic screen', () => {
  const src = read('src/screens/Workouts.jsx');
  const train = src.indexOf('if (v.summary && v.trainSummary) return <TrainSummary');
  const sess = src.indexOf('if (v.summary && v.sessionSummary) return <SessionSummary v={v} parts={SESSION_PARTS} />;');
  const classic = src.indexOf('<SessionView v={v} />');
  assert.ok(train > 0 && sess > train && classic > sess, 'the order: Train page, summary session, classic');
  assert.doesNotMatch(read('src/screens/SessionSummary.jsx'), /from '\.\/Workouts\.jsx'/, 'the summary session never imports the classic screen back');
});

test('App spreads the session view model after the Inbox, then only the Nova thread after it', () => {
  const app = read('src/App.jsx');
  assert.match(app, /const withInbox = \{ \.\.\.withFuel, \.\.\.valsInboxSummary\(this, ctx, withFuel\) \};/);
  // 29 Sep: the Nova thread (novaThread.test.js) takes the session's place as
  // the last spread; the session still reads everything before it
  assert.match(app, /const withSession = \{ \.\.\.withInbox, \.\.\.valsSessionSummary\(this, ctx, withInbox\) \};/);
  // 7 Oct: Settings A's view model (valsSettings) reads the session's rest
  // timer, so it spreads after the session and before the Nova thread
  assert.match(app, /const withSettings = \{ \.\.\.withSession, \.\.\.valsSettings\(this, ctx, withSession\) \};/);
  assert.match(app, /return \{ \.\.\.withSettings, \.\.\.valsNovaThread\(this, ctx, withSettings\) \};\n  \}/);
});

test('the new files reach no network: every write is an app method the classic session already calls', () => {
  for (const f of NEW) {
    const src = read(f).replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(src, /\bfetch\(/, `${f}: fetch`);
    assert.doesNotMatch(src, /\bapi\./, `${f}: api.`);
    assert.doesNotMatch(src, /from '\.\.?\/api\.js'/, `${f}: imports api.js`);
  }
  const vals = read('src/vals/valsSessionSummary.js');
  for (const m of ['toggleSessionSetDone', 'updateSessionSet', 'removeSessionSet', 'addSessionSet', 'toggleSessionExerciseSkipped']) {
    assert.match(vals + read('src/sessionSummaryFacts.js'), new RegExp(m), m);
  }
});

test('no type in the summary session or its sheets is below 12px, and every selector wears .nv-ss', () => {
  const sizes = [];
  for (const f of ['src/screens/SessionSummary.jsx']) {
    const src = read(f);
    for (const m of src.matchAll(/font(?:Size)?: [`'"]([^`'"]*)[`'"]/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ where: f, px: Number(px[1]) });
    }
    for (const m of src.matchAll(/fontSize: ['"]?(\d+(?:\.\d+)?)/g)) sizes.push({ where: f, px: Number(m[1]) });
  }
  const css = read('src/index.css');
  const start = css.indexOf('THE SUMMARY LIVE SESSION (28 Sep 2026)');
  const end = css.indexOf('/* end of the summary live session */');
  assert.ok(start > 0 && end > start, 'the .nv-ss-* block was not found');
  const block = css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const m of rule[2].matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ where: `index.css ${rule[1].trim()}`, px: Number(px[1]) });
    }
    const sel = rule[1].trim();
    if (!/^(from|to|\d+%)/.test(sel)) assert.match(sel, /nv-ss/, `a selector outside the namespace: ${sel}`);
  }
  assert.ok(sizes.length > 60, `expected to read the page's type, found ${sizes.length}`);
  const small = sizes.filter((s) => s.px < 12).map((s) => `${s.where}: ${s.px}px`);
  assert.deepEqual(small, [], `below the floor:\n  ${small.join('\n  ')}`);
  assert.match(block, /prefers-reduced-motion/);
  assert.match(block, /prefers-reduced-transparency/);
  assert.match(block, /data-nv-calm="1"/);
});

test('every sheet is an aria-modal root with its z-index inline, closed by its own backdrop (the back swipe\'s contract)', () => {
  const src = read('src/screens/SessionSummary.jsx');
  const root = /<div ref=\{exit\.scrimRef\} role="dialog" aria-modal="true"[^>]*onClick=\{exit\.close\}\s*\n\s*style=\{\{ position: 'fixed', inset: 0, zIndex: (\d+)/.exec(src);
  assert.ok(root, 'the one Sheet root');
  const z = Number(root[1]);
  assert.ok(z > 90 && z < 120, `over the pad (90) and the tab bar (72), under the context menu (120): ${z}`);
  assert.match(src, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  // the tick is the page's one filled control, and the pad never opens the keyboard
  assert.equal((src.match(/className=\{`nv-ss-tick/g) || []).length, 1);
  assert.doesNotMatch(src, /inputMode="(?:decimal|numeric)"/);
});

test('Settings shows the rest timer row only when the view model hands it one (summary only)', () => {
  // Settings A (7 Oct 2026): the row lives in the root's "In Nova's pages"
  // group, drawn only when valsSettings hands it a value, which it does only
  // when valsSessionSummary handed it a restTimerSetting
  const src = read('src/screens/Settings.jsx');
  assert.match(src, /\{R\.train \? \(/);
  assert.match(read('src/vals/valsSettings.js'), /const train = rt \? \{/);
  assert.match(read('src/sessionSummaryFacts.js'), /REST_KEY = 'novaos\.restTimer'/);
});

test('after Finish: the quiet "You beat last time" here, the full moment only once it files, as a history entry of its own', () => {
  const vals = read('src/vals/valsSessionSummary.js');
  assert.match(vals, /recordPhrase\('sheet', lead\)/, 'the sheet claims only what code knows');
  const app = read('src/App.jsx');
  assert.match(app, /\.\.\.this\.recipeFromHistory\(\), \.\.\.this\.pagesFromHistory\(\) \}(?:\);|, \(\) =>)/);
  assert.match(app, /return \{ \.\.\.this\.pinnedFromHistory\(\), \.\.\.this\.trainCoachFromHistory\(\), \.\.\.this\.viewFromHistory\(\), \.\.\.this\.deeperReportFromHistory\(\), \.\.\.this\.captureSheetFromHistory\(\), \.\.\.this\.documentsFromHistory\(\), \.\.\.this\.recordFromHistory\(\), \.\.\.this\.novaFocusFromHistory\(\) \};/);
  assert.match(app, /novaOverlay: 'record', records \}/);
});
