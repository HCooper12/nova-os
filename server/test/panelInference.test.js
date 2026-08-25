// EVIDENCE BY DEFAULT. Panels used to appear only if the MODEL remembered to
// emit a SHOW directive, so a spoken answer routinely arrived with nothing on
// screen — which is exactly what happened when he asked for his recent Upper
// Body sessions. Code now infers the panel from the QUESTION.
//
// The property that matters most is the negative one: it must return null
// rather than guessing. An irrelevant panel is worse than none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inferPanelDirective, PANEL_TYPES } from '../lib/panels.js';

const NAMES = {
  routines: ['Push', 'Pull', 'Upper Body', 'Leg Day'],
  exercises: ['Bench Press', 'Incline Dumbbell Bench Press', 'Pull-Up', 'Cable Lateral Raise', 'Face Pull'],
};
const infer = (q) => inferPanelDirective(q, NAMES);

test('his actual question puts his actual sessions on screen', () => {
  assert.deepEqual(infer('pull up my recent upper body sessions'), { panel: 'sessions', routine: 'Upper Body' });
});

test('the many ways he might ask for recent sessions all land on the same panel', () => {
  for (const q of [
    'show me my last few sessions',
    'what were my recent workouts',
    'pull up my latest training sessions',
    'show my previous workouts',
    'session history please',
  ]) {
    assert.equal(infer(q)?.panel, 'sessions', q);
  }
});

test('a routine named in the question narrows the panel to it', () => {
  assert.deepEqual(infer('how has push been going'), { panel: 'sessions', routine: 'Push' });
  assert.equal(infer('show me my last few leg day sessions')?.routine, 'Leg Day');
});

test('a named lift wins over the routine — it is the more specific ask', () => {
  const d = infer('how is my bench press going');
  assert.equal(d.panel, 'exercise');
  assert.equal(d.name, 'Bench Press');
});

test('the LONGEST matching lift name wins, so a specific lift is not read as a generic one', () => {
  const d = infer('how is my incline dumbbell bench press going');
  assert.equal(d.name, 'Incline Dumbbell Bench Press', 'not the shorter "Bench Press"');
});

test('schedule questions show the week, not a session list', () => {
  for (const q of ['what am i training this week', "what's on my schedule", 'is tomorrow a rest day', 'what is my split']) {
    assert.equal(infer(q)?.panel, 'training-week', q);
  }
});

test('food questions show the nutrition week', () => {
  for (const q of ['how much protein have i had', 'am i in a deficit', 'what have i eaten today', 'how are my macros']) {
    assert.equal(infer(q)?.panel, 'nutrition-week', q);
  }
});

test('body questions show the pulse', () => {
  for (const q of ['how did i sleep', "what's my hrv", 'how are my steps', 'is my recovery ok', 'what is my weight trend']) {
    assert.equal(infer(q)?.panel, 'pulse', q);
  }
});

test('it returns NULL rather than guessing — a wrong panel is worse than none', () => {
  for (const q of [
    'what time is it',
    'remind me to call the bank',
    'thanks',
    'who wrote atomic habits',
    'what should i name the dog',
    '',
    '   ',
  ]) {
    assert.equal(infer(q), null, `must not invent a panel for: "${q}"`);
  }
});

test('it never emits a panel type the builder cannot draw', () => {
  const qs = ['recent upper body sessions', 'how is my bench press', 'this week', 'protein today', 'my hrv', 'nonsense here'];
  for (const q of qs) {
    const d = infer(q);
    if (d) assert.ok(PANEL_TYPES.includes(d.panel), `${d.panel} is not a real panel`);
  }
});

test('with no names known it still handles the generic asks, and still refuses the rest', () => {
  assert.equal(inferPanelDirective('show me my recent sessions')?.panel, 'sessions');
  assert.equal(inferPanelDirective('show me my recent sessions').routine, undefined, 'no routine invented');
  assert.equal(inferPanelDirective('how is my bench press going'), null, 'an unknown lift is not asserted');
});

test('case and spacing do not matter — he speaks, he does not type', () => {
  assert.equal(infer('PULL UP MY RECENT UPPER BODY SESSIONS')?.routine, 'Upper Body');
  assert.equal(infer('Show me my Recent Upper Body Sessions')?.routine, 'Upper Body');
});

// The panel data contract the renderers depend on. Every renderer maps over
// these arrays; a builder that returns a shape without them crashed the whole
// screen on his phone (there was no error boundary anywhere in the app).
test('the sessions panel always carries the arrays its renderer maps over', async () => {
  const { buildPanel } = await import('../lib/panels.js');
  const { mkdtemp, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  const v = await mkdtemp(path.join(tmpdir(), 'nova-panel-'));
  await mkdir(path.join(v, 'Wiki/Health/Workouts'), { recursive: true });

  // an EMPTY vault is the shape most likely to break a renderer
  const p = await buildPanel(v, { panel: 'sessions', routine: 'Upper Body' });
  assert.equal(p.type, 'sessions');
  assert.ok(Array.isArray(p.data.sessions), 'sessions must be an array, never undefined');
  assert.equal(p.data.sessions.length, 0);
  assert.match(p.data.note, /Upper Body/, 'an empty result names the filter that found nothing');
});

test('an unknown panel name is refused rather than half-built', async () => {
  const { buildPanel } = await import('../lib/panels.js');
  await assert.rejects(() => buildPanel('/tmp', { panel: 'not-a-panel' }), /unknown panel/);
});
