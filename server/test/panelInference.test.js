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

// A NAME IN PASSING IS NOT THE SUBJECT (1 Nov 2026). His real turns, with the
// situation block the client really prepends. The Coach's "What i would
// change" card was on the glass when he asked for a mock-up of the program;
// the answer arrived with a full Cable Bicep Curl card under it.
const HIS = {
  routines: ['Push', 'Pull', 'Upper', 'Legs', 'Arms Optional'],
  exercises: ['Cable Bicep Curl', 'Spider Curl', 'Barbell Bench Press', 'Machine Chest Press', 'Cable Lateral Raise', 'Alternate Incline Dumbbell Curl'],
};
const SITUATION = '[On his screen right now — resolve "this/that/it/the first one" against it and answer from it; never read this block back: A card titled "What i would change" is on the glass: Cut Cable Bicep Curl from Saturday arms, now; Build Option B to start Monday 9 November [from the plan]; Mobility on Thursday and Sunday in the new week.]';
const MOCKUP = 'Show me a mock-up of what the new program would look like. So both the four-day split and then possibly a five-day split where it would just be one leg day per week, but then the other days are upper body days or something else along that line. I just want to see a visual representation of what it would all look like so I can have a quick glance at it and see if it would be Something that would suit, but also include the approximate time that it would take to get through each exercise and how many exercises would be on each day.';

test('his mock-up question, dressed with the card on his screen, draws no lift card', () => {
  assert.equal(inferPanelDirective(`${SITUATION}\n\n${MOCKUP}`, HIS), null);
  // nor does a glass card's HRV footnote turn into a pulse panel
  const metricCard = '[On his screen right now — resolve "this/that/it/the first one" against it and answer from it; never read this block back: A card titled "Slept" is on the glass showing 7.4h (LAST NIGHT) — footnote: HRV 112 ms · 2026-11-01.]';
  assert.equal(inferPanelDirective(`${metricCard}\n\n${MOCKUP}`, HIS), null);
});

test('a lift named inside a question about the whole program, or a swap of two, draws no lift card', () => {
  const four = "I like the idea of the four-day split, so let's try and work that in. However, eight exercises for a workout seem to be a bit too excessive and may take longer. Consider dropping Cable Bicep Curl and we can possibly create an additional accessory day.";
  assert.equal(inferPanelDirective(four, HIS), null);
  assert.equal(inferPanelDirective('Swap my barbell bench press exercise in my program to a machine chest press exercise', HIS), null);
  assert.equal(inferPanelDirective('What would the program look like without spider curl, how many sets each day?', HIS), null);
});

test('the lift IS the subject: its card still comes up', () => {
  assert.deepEqual(inferPanelDirective('How is my cable bicep curl going?', HIS), { panel: 'exercise', name: 'Cable Bicep Curl' });
  assert.deepEqual(inferPanelDirective(`${SITUATION}\n\nshow me spider curl`, HIS), { panel: 'exercise', name: 'Spider Curl' });
  assert.deepEqual(inferPanelDirective('Cable bicep curl?', HIS), { panel: 'exercise', name: 'Cable Bicep Curl' });
  assert.equal(inferPanelDirective("what's my hrv", HIS)?.panel, 'pulse');
});

test('his words are found under nested and stacked preamble blocks', async () => {
  const { hisWordsForPanels } = await import('../lib/panels.js');
  assert.equal(hisWordsForPanels(`${SITUATION}\n\n[He heard only your turn, not the detail you held after MORE. Do not refer to it as said.]\n\nhow is push going`), 'how is push going');
  assert.equal(hisWordsForPanels('[The plan he is most likely referring to — finished, 3 min ago:\nPLAN [finished, 2026-11-01 00:17 UTC] — his request: "x"]\n\nwalk me through it'), 'walk me through it');
  assert.equal(hisWordsForPanels('[an unclosed block and his words'), '[an unclosed block and his words', 'an unclosed block never eats the question');
});

test('a panel the MODEL asks for passes the same rule', async () => {
  const { panelOnTopic } = await import('../lib/panels.js');
  const names = HIS.exercises;
  const reply = "Both layouts are in the mock-up above, sir, with exercise counts, sets and estimated minutes per day. The 4-day is the Coach's Draft B.";
  assert.equal(panelOnTopic({ panel: 'exercise', name: 'Cable Bicep Curl' }, { question: `${SITUATION}\n\n${MOCKUP}`, reply, exercises: names }), false);
  assert.equal(panelOnTopic({ panel: 'exercise', name: 'Cable Bicep Curl' }, { question: 'how is my cable bicep curl going', reply: 'Flat at 15.9 kg.', exercises: names }), true);
  assert.equal(panelOnTopic({ panel: 'exercise', name: 'Spider Curl' }, { question: 'what should I cut from arms', reply: 'Spider Curl is the one to cut: it has been flat for six sessions.', exercises: names }), true, 'the one lift the answer is about');
  assert.equal(panelOnTopic({ panel: 'exercise', name: 'Spider Curl' }, { question: 'what should I cut from arms', reply: 'Spider Curl and Cable Bicep Curl are both candidates.', exercises: names }), false, 'one of two lifts is not the focus');
  assert.equal(panelOnTopic({ panel: 'pulse' }, { question: MOCKUP, reply, exercises: names }), false);
  assert.equal(panelOnTopic({ panel: 'pulse' }, { question: 'how did I sleep', reply: 'Seven hours twenty.', exercises: names }), true);
  assert.equal(panelOnTopic({ panel: 'training-week' }, { question: MOCKUP, reply, exercises: names }), true, 'other panels are the model\'s call');
});
