// THE PERSONAL-BEST MOMENT (29 Sep 2026, design/mockups/65-pb-celebration.html).
// Three layers pinned: the pure facts (src/recordKit.js) — the kit read from
// a lift's name, the records compared at the resolution they are shown, the
// two-stage wording, the drawings' plans; and the source contracts no
// screenshot would catch breaking — it persists until he dismisses it (no
// timer anywhere), it is a history entry of its own, one moment per lift,
// and its type and targets meet the floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EQUIPMENT_RULES, equipmentFor, momentFor, confirmedRecords, recordPhrase, stackPlan, barPlan, fmtFine, STACK_PIN,
} from '../../src/recordKit.js';
import { recordCandidates } from '../../src/sessionSummaryFacts.js';
import { CHIMES } from '../../src/sfx.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// ------------------------------------------------------------ the kit --

test('equipment: his own lifts, as they are named in his library and sessions', () => {
  const want = {
    // a pin through a stack
    'Lat Pulldown': 'stack', 'Wide-Grip Lat Pulldown': 'stack', 'Single-Arm Lat Pulldown': 'stack', 'Straight-Arm Pulldown': 'stack',
    'Cable Flys Low': 'stack', 'Cable Flys High': 'stack', 'Cable Fly': 'stack', 'Cable Crossover': 'stack', 'Pec Deck': 'stack', 'Pec Deck Machine': 'stack',
    'Cable Lateral Raise': 'stack', 'Machine Lateral Raise': 'stack', 'Face Pull': 'stack', 'Seated Cable Row': 'stack', 'Cable Row': 'stack',
    'Tricep Pushdown': 'stack', 'Triceps Pushdown': 'stack', 'Rope Pushdown': 'stack', 'Rope Overhead Tricep Extension': 'stack',
    'Cable Hammer Curls': 'stack', 'Cable Bicep Curl': 'stack', 'Bayesian Cable Curl': 'stack', 'Cable Crunch': 'stack',
    'Leg Press': 'stack', 'Leg Extension': 'stack', 'Seated Leg Curl': 'stack', 'Hamstring Lying Leg Curls': 'stack', 'Leg Press Calf Raise': 'stack',
    'Machine Chest Press': 'stack', 'Machine Shoulder Press': 'stack', 'Glute Kickback Machine': 'stack',
    // plates on a sleeve
    'Bench Press': 'barbell', 'Barbell Bench Press': 'barbell', 'Incline Barbell Bench Press': 'barbell', 'Close-Grip Bench Press': 'barbell',
    'Barbell Row': 'barbell', 'Pendlay Row': 'barbell', 'T-Bar Row': 'barbell', 'Lying T Bar Row': 'barbell', 'Deadlift': 'barbell',
    'Romanian Deadlift': 'barbell', 'Back Squat': 'barbell', 'Front Squat': 'barbell', 'Overhead Press': 'barbell', 'Barbell Overhead Press': 'barbell',
    'Hip Thrust': 'barbell', 'EZ-Bar Curl': 'barbell', 'EZ-Bar Reverse Curl': 'barbell', 'Smith Machine Squat': 'barbell', 'JM Press': 'barbell',
    // a hand weight
    'DB Bench': 'dumbbell', 'Dumbbell Bench Press': 'dumbbell', 'Incline Dumbbell Bench Press': 'dumbbell', 'Incline Dumbbell Curl': 'dumbbell',
    'Hammer Curl': 'dumbbell', 'Lateral Raise': 'dumbbell', 'Lat Raise': 'dumbbell', 'Arnold Press': 'dumbbell', 'Goblet Squat': 'dumbbell', 'Dumbbell Shrug': 'dumbbell',
    // the body
    'Weighted Pull-Up': 'bodyweight', 'Pull-Up': 'bodyweight', 'Pull ups': 'bodyweight', 'Chin-Up': 'bodyweight', 'Dips': 'bodyweight', 'Chest Dip': 'bodyweight',
    'Bench Dip': 'bodyweight', 'Push-Up': 'bodyweight', 'Plank': 'bodyweight', 'Dead Hang': 'bodyweight', 'Hanging Leg Raise': 'bodyweight', 'Nordic Curl': 'bodyweight',
    // the name does not say: nothing is claimed
    'Carter Extension': 'unknown', 'Spider Curl': 'unknown', 'Preacher Curl': 'unknown', 'Bulgarian Split Squat': 'unknown', 'Single-Leg RDL': 'unknown',
    'Walking Lunge': 'unknown', 'Kettlebell Swing': 'unknown', 'Chest-Supported Row': 'unknown', 'Seated Calf Raise': 'unknown', 'Rowing Machine': 'unknown',
    'Assault Bike': 'unknown', 'Overhead Tricep Extension': 'unknown', 'Rear Delt Fly': 'unknown',
  };
  const got = Object.fromEntries(Object.keys(want).map((n) => [n, equipmentFor(n)]));
  assert.deepEqual(got, want);
});

test('equipment: case and spacing do not matter; nothing, or only a tracking type, still answers honestly', () => {
  assert.equal(equipmentFor('lat pulldown'), 'stack');
  assert.equal(equipmentFor('  BENCH PRESS '), 'barbell');
  assert.equal(equipmentFor(''), 'unknown');
  assert.equal(equipmentFor(null), 'unknown');
  assert.equal(equipmentFor('Muscle Snatch Grip Thing'), 'barbell', 'snatch names a barbell lift');
  assert.equal(equipmentFor('Towel Hang', 'bodyweight_time'), 'bodyweight', 'the name said nothing, the log did');
  assert.equal(equipmentFor('Carter Extension', 'weight_reps'), 'unknown');
  // a word inside another word is not that word
  assert.equal(equipmentFor('Dipsomaniac Raise'), 'unknown');
});

test('equipment: the table is readable — every row names its words and its kit', () => {
  for (const r of EQUIPMENT_RULES) {
    assert.ok(r.words && r.re instanceof RegExp && ['stack', 'barbell', 'dumbbell', 'bodyweight', 'unknown'].includes(r.kit), JSON.stringify(r.words));
    assert.ok(r.re.flags.includes('i'), `${r.words}: case-insensitive`);
  }
});

test('the moment: the kit for a record in the load; the trophy for anything else, and for an estimate whatever the kit', () => {
  assert.equal(momentFor('stack'), 'stack');
  assert.equal(momentFor('barbell'), 'barbell');
  assert.equal(momentFor('dumbbell'), 'trophy');
  assert.equal(momentFor('bodyweight'), 'trophy');
  assert.equal(momentFor('unknown'), 'trophy');
  // an estimated 1-rep max can be set with LESS on the bar; a heavier plate would be a lie
  assert.equal(momentFor('barbell', 'e1rm'), 'trophy');
  assert.equal(momentFor('stack', 'e1rm'), 'trophy');
});

// ------------------------------------------------------------ the records --

const session = [
  { exerciseId: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'Back', trackingType: 'weight_reps',
    last: { sets: [{ weight: 60, reps: 8 }, { weight: 57.5, reps: 9 }] }, sets: [{ weight: 62.5, reps: 8, done: true }] },
  { exerciseId: 'bench-press', name: 'Bench Press', muscleGroup: 'Chest', trackingType: 'weight_reps',
    last: { sets: [{ weight: 80, reps: 5 }] }, sets: [{ weight: 82.5, reps: 5, done: true }] },
];

test('records: the server\'s, joined to the session for the hue and the kit, in the order it named them', () => {
  const recs = confirmedRecords([
    { exerciseId: 'lat-pulldown', name: 'Lat Pulldown', kind: 'weight', value: 62.5, reps: 8, previous: 60 },
    { exerciseId: 'bench-press', name: 'Bench Press', kind: 'weight', value: 82.5, reps: 5, previous: 80 },
  ], session);
  assert.deepEqual(recs.map((r) => [r.name, r.muscle, r.equipment, r.moment, r.value, r.previous, r.delta, r.weight, r.reps]), [
    ['Lat Pulldown', 'Back', 'stack', 'stack', 62.5, 60, 2.5, 62.5, 8],
    ['Bench Press', 'Chest', 'barbell', 'barbell', 82.5, 80, 2.5, 82.5, 5],
  ]);
  assert.equal(recs[0].step, 2.5, 'the step his own numbers move by');
});

test('records: compared at the resolution SHOWN — a repeat is never a record, and a rounding remainder is not one either', () => {
  assert.deepEqual(confirmedRecords([{ exerciseId: 'x', name: 'Row', kind: 'weight', value: 60.04, reps: 8, previous: 60 }]), []);
  assert.deepEqual(confirmedRecords([{ exerciseId: 'x', name: 'Cable Lateral Raise', kind: 'e1rm', value: 11.2233, weight: 9.1, reps: 7, previous: 11.2 }]), [],
    'the 12 Sep phantom: an exact repeat, cleared by its own rounding');
  const [real] = confirmedRecords([{ exerciseId: 'x', name: 'Row', kind: 'weight', value: 60.06, reps: 8, previous: 60 }]);
  assert.equal(real.value, 60.1);
  assert.equal(real.delta, 0.1);
  assert.deepEqual(confirmedRecords([{ name: 'Row', kind: 'weight', value: 0, reps: 8, previous: null }]), [], 'nothing lifted is nothing to celebrate');
  assert.deepEqual(confirmedRecords(null), []);
  assert.deepEqual(confirmedRecords([null, { value: 60 }]), [], 'a record with no lift named is not shown');
});

test('records: a first on record is kept and said as one; the same lift and kind twice is one moment; a name joins when the id does not', () => {
  const recs = confirmedRecords([
    { exerciseId: 'new', name: 'Pec Deck', kind: 'weight', value: 45, reps: 10, previous: null },
    { exerciseId: 'new', name: 'Pec Deck', kind: 'weight', value: 47.5, reps: 8, previous: null },
    { name: 'Bench Press', kind: 'e1rm', value: 96.3, weight: 85, reps: 4, previous: 95 },
  ], session);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].previous, null);
  assert.equal(recs[0].delta, null);
  assert.equal(recs[1].muscle, 'Chest', 'joined by name');
  assert.equal(recs[1].moment, 'trophy', 'an estimate never draws a heavier load');
  assert.equal(recs[1].weight, 85);
});

// ------------------------------------------------------------ the words --

test('the sheet says only what code knows: "You beat last time"', () => {
  const [c] = recordCandidates([{ name: 'Lat Pulldown', muscleGroup: 'Back', trackingType: 'weight_reps',
    sets: [{ weight: 62.5, reps: 8, done: true }], last: { sets: [{ weight: 60, reps: 8 }] } }]);
  assert.deepEqual(recordPhrase('sheet', c), {
    head: 'You beat last time',
    line: 'Lat Pulldown, 62.5 kg × 8 · up 2.5 on 60',
    meta: 'Nova checks it against your best ever when it files',
    aria: 'You beat last time. Lat Pulldown, 62.5 kg × 8 · up 2.5 on 60. Nova checks it against your best ever when it files.',
  });
  const [r] = recordCandidates([{ name: 'Row', trackingType: 'weight_reps', sets: [{ weight: 60, reps: 10, done: true }], last: { sets: [{ weight: 60, reps: 8 }] } }]);
  assert.equal(recordPhrase('sheet', r).line, 'Row, 60 kg × 10 · up 2 reps on 8');
  const [bw] = recordCandidates([{ name: 'Pull-Up', trackingType: 'bodyweight_reps', sets: [{ weight: 0, reps: 11, done: true }], last: { sets: [{ weight: 0, reps: 10 }] } }]);
  assert.equal(recordPhrase('sheet', bw).line, 'Pull-Up, 11 reps · up 1 rep on 10');
});

test('confirmed: "New personal best" only once the server has said so, in his numbers', () => {
  const [lat, bench] = confirmedRecords([
    { exerciseId: 'lat-pulldown', name: 'Lat Pulldown', kind: 'weight', value: 62.5, reps: 8, previous: 60 },
    { exerciseId: 'bench-press', name: 'Bench Press', kind: 'weight', value: 82.5, reps: 5, previous: 80 },
  ], session);
  const p = recordPhrase('confirmed', lat);
  assert.equal(p.head, 'New personal best');
  assert.equal(p.line, 'Lat Pulldown, 62.5 kg × 8');
  assert.equal(p.meta, 'Your heaviest ever on it, 2.5\u00a0kg past your old best of\u00a060');
  assert.equal(recordPhrase('confirmed', bench).meta, 'Your heaviest ever on it, 2.5\u00a0kg past your old best of\u00a080');
  const [est] = confirmedRecords([{ name: 'Incline Dumbbell Bench Press', kind: 'e1rm', value: 34.8, weight: 27.5, reps: 8, previous: 33.9 }]);
  const e = recordPhrase('confirmed', est);
  assert.equal(e.line, 'Incline Dumbbell Bench Press, 27.5 kg × 8', 'the set he did, never the estimate, is the line');
  assert.equal(e.meta, 'Your best estimated 1-rep max on it, 34.8\u00a0kg: 0.9\u00a0kg past your old best of\u00a033.9');
  const [first] = confirmedRecords([{ name: 'Pec Deck', kind: 'weight', value: 45, reps: 10, previous: null }]);
  assert.equal(recordPhrase('confirmed', first).head, 'First on record', 'nothing was beaten, so nothing is claimed');
  assert.equal(recordPhrase('confirmed', null), null);
});

// ------------------------------------------------------------ the drawings --

test('the stack: the pin moves from the plate that reads his old best to today\'s, at his own step', () => {
  const [lat] = confirmedRecords([{ exerciseId: 'lat-pulldown', name: 'Lat Pulldown', kind: 'weight', value: 62.5, reps: 8, previous: 60 }], session);
  const s = stackPlan(lat);
  assert.equal(s.step, 2.5);
  assert.equal(s.drop, 1);
  assert.equal(s.plates[STACK_PIN].label, '62.5');
  assert.equal(s.plates[STACK_PIN - s.drop].label, '60', 'the old best is a labelled plate');
  assert.ok(s.plates[STACK_PIN - s.drop].was);
  assert.deepEqual(s.plates.filter((p) => p.lifted).map((p) => p.i), [0, 1, 2, 3, 4]);
  // a jump of two steps drops two plates
  assert.equal(stackPlan({ value: 65, previous: 60, step: 2.5 }).drop, 2);
  // a jump his step cannot land on becomes the step itself: the old best is still a plate
  const odd = stackPlan({ value: 63, previous: 60, step: 2.5 });
  assert.equal(odd.step, 3);
  assert.equal(odd.plates[STACK_PIN - odd.drop].label, '60');
  // a light lift: plates that would read zero or less carry no number
  const light = stackPlan({ value: 9.1, previous: 6.8, step: 2.3 });
  assert.equal(light.plates[0].label, null);
  assert.equal(light.plates[STACK_PIN].label, '9.1');
});

test('the sleeve: the rise per side in the hue, last time\'s load sized but never named', () => {
  const b = barPlan({ value: 82.5, previous: 80 });
  assert.equal(b.perSide, 1.25);
  assert.equal(b.perSideLabel, '+1.25', 'two decimals where a half-step lives, never 1.3');
  assert.deepEqual(b.old, [25, 5]);
  assert.deepEqual(barPlan({ value: 17.5, previous: 15 }).old, [20], 'an unfamiliar bar: one plate, unsized');
  assert.equal(fmtFine(1.25), '1.25');
  assert.equal(fmtFine(2.5), '2.5');
});

test('the sound: his pick off the trophy, the house bell as a rising triad', () => {
  assert.deepEqual(CHIMES.record.notes, [880, 1318.51, 1760]);
  assert.ok(CHIMES.record.peak <= CHIMES.technique.peak, 'bigger moment, not a louder one');
});

// ------------------------------------------------------ the source contracts --

test('it persists until he dismisses it: no timer closes it, anywhere', () => {
  const app = read('src/App.jsx');
  const rm = read('src/RecordMoment.jsx').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(app, /prT = setTimeout/, 'the 4.2 s auto-dismiss is gone');
  assert.doesNotMatch(app, /setTimeout\([^)]*prCelebration: null/);
  assert.doesNotMatch(rm, /setTimeout/, 'the moment runs on the animation clock, and nothing in it closes on a timer');
  // the ways out: outside the card, the ✕, Escape, the swipe (which taps the backdrop)
  assert.match(rm, /role="dialog" aria-modal="true" aria-label=\{phrase\.aria\} onClick=\{exit\.close\} ref=\{exit\.scrimRef\}\n\s*className="nv-rec-scrim" style=\{\{ zIndex: 125 \}\}/);
  assert.match(rm, /<div ref=\{exit\.panelRef\} onClick=\{stop\}/, 'a tap on the card itself is not a dismissal');
  assert.match(rm, /className="nv-rec-x"/);
  assert.match(rm, /e\.key === 'Escape'/);
});

test('one moment per lift, in order, each waiting for him; Skip all closes the lot', () => {
  const app = read('src/App.jsx');
  assert.match(app, /const records = confirmedRecords\(prs, session\.exercises\);\n\s*if \(records\.length\) this\.openRecordMoment\(records\);/);
  assert.match(app, /nextRecord\(\) \{\n\s*const list = this\.state\.prCelebration \|\| \[\];\n\s*const i = this\.state\.prIndex \|\| 0;\n\s*if \(i \+ 1 < list\.length\) \{ this\.setState\(\{ prIndex: i \+ 1 \}\); return; \}\n\s*this\.closeRecordMoment\(\);/);
  assert.match(app, /onDismiss=\{\(\) => this\.nextRecord\(\)\} onSkipAll=\{\(\) => this\.closeRecordMoment\(\)\}/);
  const rm = read('src/RecordMoment.jsx');
  assert.match(rm, /\{i \+ 1\} of \{n\}/);
  assert.match(rm, />Next</);
  assert.match(rm, />Skip all</);
});

test('it is its own history entry, folded into pagesFromHistory', () => {
  const app = read('src/App.jsx');
  assert.match(app, /pushState\(\{ novaDepth: depthOf\(st\) \+ 1, novaOverlay: 'record', records \}, ''\)/);
  assert.match(app, /closeRecordMoment\(\) \{\n\s*if \(typeof window !== 'undefined' && window\.history\.state\?\.novaOverlay === 'record'\) \{ window\.history\.back\(\); return; \}/);
  assert.match(app, /\.\.\.this\.documentsFromHistory\(\), \.\.\.this\.recordFromHistory\(\) \};/);
  assert.match(app, /recordFromHistory\(\) \{[\s\S]{0,400}if \(!onEntry && this\.state\.prCelebration\) return \{ prCelebration: null, prIndex: 0 \};/);
});

test('the chime rides the Finish tap: armed there, played on a record, released when there is none', () => {
  const app = read('src/App.jsx');
  const fin = app.slice(app.indexOf('  finishWorkoutSession() {'), app.indexOf('  saveWorkoutForLater() {'));
  assert.ok(fin.indexOf('primeSfx();') > 0 && fin.indexOf('primeSfx();') < fin.indexOf('api.completeWorkoutSession(conn, payload)'), 'armed inside the tap, before the wait');
  assert.match(fin, /else releaseSfx\(\);/);
  assert.match(fin, /\.catch\(\(e\) => \{\n\s*releaseSfx\(\);/);
  assert.match(read('src/RecordMoment.jsx'), /recordChime\(still \? 150 : tl\.peak\)/, 'on the landing, on the audio clock');
});

test('the Finish sheet keeps the quiet stage: its gauge, the sheet wording', () => {
  const vals = read('src/vals/valsSessionSummary.js');
  assert.match(vals, /recordPhrase\('sheet', lead\)/);
  const jsx = read('src/screens/SessionSummary.jsx');
  assert.doesNotMatch(jsx, /a record is confirmed when it files/);
  assert.match(jsx, /<Gauge r=\{s\.record\} \/>/);
  assert.match(jsx, /\{s\.record\.meta\}/);
  assert.doesNotMatch(jsx, /<RecordMoment|import \{ RecordMoment/, 'no full celebration on the sheet');
});

test('its styles: namespaced .nv-rec-*, at the END of index.css, 13px and up, 44px targets, reduced motion honoured', () => {
  const css = read('src/index.css');
  const start = css.indexOf('THE PERSONAL-BEST MOMENT (29 Sep 2026');
  const endMark = '/* end of the personal-best moment */';
  const end = css.indexOf(endMark);
  assert.ok(start > 0 && end > start, 'the .nv-rec-* block');
  assert.equal(css.slice(end + endMark.length).trim(), '', 'appended at the very end');
  const block = css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const sizes = [];
  for (const rule of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = rule[1].trim();
    if (!/^(from|to|\d+%|[\d%, ]+$)/.test(sel)) assert.match(sel, /nv-rec/, `a selector outside the namespace: ${sel}`);
    for (const m of rule[2].matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ sel, px: Number(px[1]) });
    }
  }
  assert.ok(sizes.length >= 12, `read the moment's type: ${sizes.length}`);
  const small = sizes.filter((s) => s.px < 13).map((s) => `${s.sel}: ${s.px}px`);
  assert.deepEqual(small, [], `below 13px:\n  ${small.join('\n  ')}`);
  for (const cls of ['nv-rec-x', 'nv-rec-skip', 'nv-rec-next']) {
    const rule = new RegExp(`\\.${cls} \\{[^}]*height: (\\d+)px`).exec(block);
    assert.ok(rule && Number(rule[1]) >= 44, `${cls} is a 44px target`);
  }
  assert.match(block, /@media \(prefers-reduced-motion: no-preference\)/, 'motion only where it is wanted');
  assert.match(block, /@media \(prefers-reduced-motion: reduce\)/);
  const jsx = read('src/RecordMoment.jsx');
  for (const m of jsx.matchAll(/font(?:Size)?: [`'"]([^`'"]*)[`'"]/g)) {
    const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
    if (px) assert.ok(Number(px[1]) >= 13, `RecordMoment.jsx inline font ${px[1]}px`);
  }
  assert.doesNotMatch(jsx, /fontSize: ['"]?(?:[0-9]|1[0-2])\b/);
});
