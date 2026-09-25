// WHAT IS ON THE GLASS WHILE NOVA IS TALKING — the parser.
//
// His 9-Sep report: a Leader conversation he could not keep up with by ear,
// and his reference is the JARVIS lab wall. A reply now carries `VIS {…}`
// directives naming what should be on screen while the prose after them is
// spoken.
//
// This parser runs on a HALF-ARRIVED reply several times a second, and the
// text it returns goes straight into the speech queue. The failure that
// would end the feature is a directive leaking through mid-type and Nova
// reading JSON out loud, so that is the first thing pinned here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVisualStream, normaliseSpec, keyOfSpec, VISUAL_KINDS } from '../../src/visualBeats.js';

const vis = (o) => `VIS ${JSON.stringify(o)}`;
const KEY = { kind: 'key', label: 'Leverage', caption: 'do less, worth more' };

// ---- the failure that must never happen ----

test('a directive still being typed never reaches the voice', () => {
  // every prefix of a growing directive, checked
  const full = `Here is the point.\n${vis(KEY)}\nAnd here is why.`;
  for (let n = 1; n <= full.length; n++) {
    const { text } = parseVisualStream(full.slice(0, n));
    assert.ok(!text.includes('VIS'), `leaked at ${n}: ${JSON.stringify(text)}`);
    assert.ok(!text.includes('"kind"'), `leaked JSON at ${n}: ${JSON.stringify(text)}`);
  }
});

test('a truncated directive is flagged, and the prose before it is still safe to speak', () => {
  const r = parseVisualStream('Half a sentence.\nVIS {"kind":"med');
  assert.equal(r.truncated, true);
  assert.equal(r.text, 'Half a sentence.\n');
  assert.deepEqual(r.beats, []);
});

// ---- the offsets are the whole sync ----

test('a beat points at the prose it accompanies', () => {
  const r = parseVisualStream(`${vis(KEY)}\nFirst idea here. Second sentence.\n${vis({ kind: 'steps', label: 'Do this', items: ['one'] })}\nFinally, the deliverables.`);
  assert.equal(r.beats.length, 2);
  assert.ok(r.text.slice(r.beats[0].at).startsWith('First idea here.'));
  assert.ok(r.text.slice(r.beats[1].at).startsWith('Finally, the deliverables.'));
});

test('an offset does not move as the rest of the reply arrives', () => {
  // the client re-parses the growing partial every 150ms; a beat that slides
  // would put the wrong picture against the wrong sentence
  const head = `${vis(KEY)}\nFirst idea here.`;
  const first = parseVisualStream(head).beats[0].at;
  for (const tail of [' More.', ' More. And more.', ` More.\n${vis({ kind: 'key', label: 'Two', caption: 'x' })}\nLater.`]) {
    assert.equal(parseVisualStream(head + tail).beats[0].at, first);
  }
});

test('the paragraph break survives, so the sentence splitter still finds boundaries', () => {
  // App.jsx speaks on /[\s\S]*[.!?](?=\s|$)/ — it needs whitespace after the
  // full stop. Swallowing the newline welded "sentence.Finally" and the rest
  // of the reply was then spoken as one lump.
  const { text } = parseVisualStream(`One. Two.\n${vis(KEY)}\nThree.`);
  assert.ok(/Two\.\s/.test(text), JSON.stringify(text));
  assert.match(text, /[\s\S]*[.!?](?=\s|$)/);
});

test('a directive at the very start leaves no leading blank', () => {
  const { text, beats } = parseVisualStream(`${vis(KEY)}\nStraight in.`);
  assert.equal(text, 'Straight in.');
  assert.equal(beats[0].at, 0);
});

// ---- a broken directive costs its visual, never the reply ----

test('malformed JSON drops the visual and keeps the words', () => {
  const r = parseVisualStream('Before.\nVIS {"kind":"key", oops}\nAfter.');
  assert.deepEqual(r.beats, []);
  assert.ok(r.text.includes('Before.'));
  assert.ok(r.text.includes('After.'));
  assert.ok(!r.text.includes('oops'));
});

test('an unknown kind is dropped', () => {
  assert.equal(normaliseSpec({ kind: 'hologram', label: 'X' }), null);
  assert.equal(normaliseSpec(null), null);
});

test('THE FIRST REAL RUN: a panel with no label still goes up', () => {
  // Live, 9 Sep: the model copied the per-kind examples, which omitted
  // `label`, and every one of its three panels was dropped — the directives
  // were stripped from the speech and nothing appeared. The heading is
  // decoration; losing the whole panel over it is the worse failure.
  const spec = normaliseSpec({ kind: 'key', caption: 'Undermining usually means threat, not malice' });
  assert.ok(spec);
  assert.equal(spec.label, '');
  assert.equal(spec.caption, 'Undermining usually means threat, not malice');
  assert.ok(normaliseSpec({ kind: 'steps', items: ['do this', 'then this'] }), 'a list needs no heading either');
});

test('but a panel with no content at all is still nothing', () => {
  assert.equal(normaliseSpec({ kind: 'key', label: 'X' }), null);
  assert.equal(normaliseSpec({ kind: 'steps', label: 'X', items: [] }), null);
});

test('every declared kind can actually produce a spec', () => {
  const samples = {
    key: { caption: 'a phrase' },
    steps: { items: ['one', 'two'] },
    list: { items: ['one'] },
    image: { query: 'circadian rhythm diagram' },
    media: { title: 'Alex Hormozi — Leverage' },
    metric: { value: '84', unit: 'g' },
    bars: { bars: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] },
    body: { muscle: 'Chest' },
    program: { routine: 'Push' },
  };
  for (const kind of VISUAL_KINDS) {
    const spec = normaliseSpec({ kind, label: 'Panel', ...samples[kind] });
    assert.ok(spec, `${kind} produced nothing`);
    assert.equal(spec.kind, kind);
    assert.equal(spec.label, 'PANEL', 'labels are small-caps on the glass');
    assert.ok(normaliseSpec({ kind, ...samples[kind] }), `${kind} must survive a missing label`);
  }
});

test('a chart of one bar is a number, not a chart', () => {
  assert.equal(normaliseSpec({ kind: 'bars', label: 'X', bars: [{ name: 'a', value: 1 }] }), null);
});

test('the same panel keys the same, a different one does not', () => {
  const a = normaliseSpec({ kind: 'media', label: 'X', title: 'Hormozi on leverage' });
  const b = normaliseSpec({ kind: 'media', label: 'X', title: 'Hormozi on leverage' });
  const c = normaliseSpec({ kind: 'media', label: 'X', title: 'Something else' });
  assert.equal(keyOfSpec(a, 0), keyOfSpec(b, 0));
  assert.notEqual(keyOfSpec(a, 0), keyOfSpec(c, 0));
});

test('fields are clamped, so a runaway model cannot blow up the glass', () => {
  const spec = normaliseSpec({ kind: 'key', label: 'L'.repeat(200), caption: 'C'.repeat(500) });
  assert.equal(spec.label.length, 42);
  assert.equal(spec.caption.length, 140);
});

// ---- what the Leader ACTUALLY sent, 10 Sep 2026 ----
//
// Taken verbatim from the session transcript of a conversation he had and
// then reported as "I have not seen any visual displays appear". The Leader
// emitted four panels. Every one was dropped: all four said `title` where
// the contract says `label`, and two put `items` on a `kind:"key"`.
//
// The model's intent was never unclear. A parser that discards it over a
// synonym is the bug.
const REAL_LEADER_TURN = [
  { kind: 'key', title: 'The read', items: ["Your goal is set to 'convince him' — that's the thing working against you", "For him this isn't a plan debate, it's about standing"] },
  { kind: 'steps', title: 'The sequence', items: ['Before the room: one-on-one, ask for advice — do not pitch', 'Take the best piece of his idea and name it as his, out loud'] },
  { kind: 'list', title: 'The honest check', items: ['Have you actually steelmanned his version, or only rehearsed why yours is better?'] },
  { kind: 'key', title: 'Do this', items: ['Book 10 minutes with him alone, before the group meeting'] },
];

test('THE SECOND EMPTY GLASS: every panel that real turn sent now draws', () => {
  const specs = REAL_LEADER_TURN.map((d) => normaliseSpec(d));
  assert.equal(specs.filter(Boolean).length, 4, 'all four were being dropped');
  assert.deepEqual(specs.map((s) => s.label), ['THE READ', 'THE SEQUENCE', 'THE HONEST CHECK', 'DO THIS']);
});

test('a panel of points is a list however it was announced', () => {
  // "key" means the phrase itself; a key carrying items is a list, and
  // drawing it as one is closer to what was meant than drawing nothing
  assert.equal(normaliseSpec(REAL_LEADER_TURN[0]).kind, 'list');
  assert.equal(normaliseSpec(REAL_LEADER_TURN[1]).kind, 'steps', 'but a declared sequence still BUILDS');
});

test('the words the model reaches for are accepted', () => {
  assert.equal(normaliseSpec({ kind: 'key', title: 'Heading', text: 'the idea' }).label, 'HEADING');
  assert.equal(normaliseSpec({ kind: 'key', heading: 'Heading', summary: 'the idea' }).caption, 'the idea');
  assert.equal(normaliseSpec({ kind: 'key', name: 'Heading', body: 'the idea' }).label, 'HEADING');
  assert.equal(normaliseSpec({ kind: 'media', title: 'An episode' }).title, 'An episode', 'media keeps its own title');
});

test('a kind left off entirely is inferred from what came with it', () => {
  assert.equal(normaliseSpec({ title: 'X', items: ['a', 'b'] }).kind, 'list');
  assert.equal(normaliseSpec({ title: 'X', value: '84', unit: 'g' }).kind, 'metric');
  assert.equal(normaliseSpec({ title: 'X', caption: 'a line' }).kind, 'key');
});


// ---- the spoken report's two panels (design/JARVIS-REPORT-PLAN.md) ----

test('a body panel names a muscle and nothing else is required', () => {
  assert.deepEqual(normaliseSpec({ kind: 'body', muscle: 'Chest', label: 'chest', caption: '12 sets a week' }),
    { kind: 'body', label: 'CHEST', caption: '12 sets a week', muscle: 'Chest' });
  assert.equal(normaliseSpec({ kind: 'body', label: 'CHEST' }), null, 'no muscle, no panel');
  assert.equal(normaliseSpec({ kind: 'body', group: 'triceps' }).muscle, 'triceps', 'group is a synonym');
});

test('a program panel names a routine, and its removals and keeps are lists of names', () => {
  const p = normaliseSpec({ kind: 'program', routine: 'Push', muscle: 'Triceps', remove: 'Cable Overhead Tricep Extension', keep: ['Rope Overhead Tricep Extension'] });
  assert.equal(p.routine, 'Push');
  assert.equal(p.muscle, 'Triceps');
  assert.deepEqual(p.remove, ['Cable Overhead Tricep Extension'], 'a single string becomes a one-item list');
  assert.deepEqual(p.keep, ['Rope Overhead Tricep Extension']);
  assert.equal(normaliseSpec({ kind: 'program', muscle: 'Chest' }), null, 'no routine, no panel');
  assert.deepEqual(normaliseSpec({ kind: 'program', routine: 'Pull', drop: ['a'] }).remove, ['a'], 'drop is a synonym');
});

test('steps can ask for a decision; a list never can', () => {
  assert.equal(normaliseSpec({ kind: 'steps', items: ['a', 'b'], decide: true }).decide, true);
  assert.equal(normaliseSpec({ kind: 'steps', items: ['a'] }).decide, undefined);
  assert.equal(normaliseSpec({ kind: 'list', items: ['a'], decide: true }).decide, undefined);
});

test('the key tells a chest panel from a back panel, and one removal from another', () => {
  const a = keyOfSpec(normaliseSpec({ kind: 'body', muscle: 'Chest', label: 'MUSCLE' }), 0);
  const b = keyOfSpec(normaliseSpec({ kind: 'body', muscle: 'Back', label: 'MUSCLE' }), 0);
  assert.notEqual(a, b);
  const c = keyOfSpec(normaliseSpec({ kind: 'program', routine: 'Push', remove: ['x'], label: 'PUSH' }), 0);
  const d = keyOfSpec(normaliseSpec({ kind: 'program', routine: 'Push', remove: ['y'], label: 'PUSH' }), 0);
  assert.notEqual(c, d);
});

test('the new kinds stream like the old ones — withheld whole while typed', () => {
  const full = `The chest.\nVIS {"kind":"body","muscle":"Chest","label":"CHEST"}\nTwelve sets a week.`;
  for (let n = 1; n <= full.length; n++) {
    const { text } = parseVisualStream(full.slice(0, n));
    assert.ok(!/VIS|"kind"|muscle/.test(text), `leaked at ${n}: ${JSON.stringify(text)}`);
  }
  const r = parseVisualStream(full);
  assert.equal(r.beats.length, 1);
  assert.equal(r.beats[0].spec.kind, 'body');
  assert.ok(VISUAL_KINDS.includes('program'));
});

// ---- what the Coach ACTUALLY sent, 25 Sep 2026 ----
//
// Verbatim from his Coach conversation that morning. Every key panel said its
// sentence in `value`, so all of them were dropped; a kindless {"key":…}
// became a "metric" whose number was 28 characters of a sentence; the bars
// and the meta-analysis figures vanished. Only the plain lists survived.
test('the Coach\'s real panels all reach the glass, as what they meant', () => {
  const headline = normaliseSpec({ key: 'Headline', value: 'Keep the split. Keep 3 sets. Pair your exercises and rest on a clock, and all 27 sets fit in about 55 minutes.' });
  assert.equal(headline.kind, 'key', 'a sentence is not a number');
  assert.equal(headline.label, 'HEADLINE');
  assert.match(headline.caption, /^Keep the split/);
  const fair = normaliseSpec({ kind: 'key', title: 'Fair point', value: 'Turn down both curl cards. Move the rope overhead tricep extension to Push instead.' });
  assert.equal(fair.caption, 'Turn down both curl cards. Move the rope overhead tricep extension to Push instead.');
  const bars = normaliseSpec({ kind: 'bars', title: 'Weekly direct sets, current program', unit: 'sets', items: [{ label: 'Back', value: 12 }, { label: 'Biceps', value: 12 }, { label: 'Side delts', value: 6 }] });
  assert.deepEqual(bars.bars.map((b) => [b.name, b.value]), [['Back', 12], ['Biceps', 12], ['Side delts', 6]]);
  const figures = normaliseSpec({ kind: 'metric', title: 'Supersets vs traditional sets, 2025 meta-analysis', items: [{ label: 'Session time', value: '36% shorter' }, { label: 'Volume lost', value: 'None' }] });
  assert.equal(figures.kind, 'list', 'a row of figures with no figure of its own is a list of them');
  assert.deepEqual(figures.items[0], { name: 'Session time', note: '36% shorter' });
  // a real figure is still a metric
  assert.equal(normaliseSpec({ value: '84', unit: 'g', label: 'Protein' }).kind, 'metric');
  assert.equal(normaliseSpec({ kind: 'metric', label: 'Session', value: '55', unit: 'min' }).value, '55');
});
