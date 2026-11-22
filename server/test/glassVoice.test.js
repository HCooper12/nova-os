// THE GLASS'S GRAMMAR, AS A TABLE (22 Nov 2026, src/glassVoice.js).
//
// His words are matched on the client before a model sees them: a match acts
// at once, a miss becomes a slow turn. The demo he wants Nova to match says
// "Can you, uh, can you maximise the headset share chart, please?" and the
// chart enlarges. Every row below is one utterance, the stage it is said on,
// and the command it must give (or null: the words go to Nova as a turn).
//
// Four kinds of row, because a false positive costs as much as a miss:
//   - the words as people really say them (fillers, repeated openers, stacked
//     politeness, no commas, no capitals, a full stop or a question mark)
//   - the everyday ways to say larger and smaller
//   - sentences that LOOK like display commands and are questions, or belong
//     to another feature: these must give null
//   - the commands that already worked, so the neighbours stay pinned
//
// A section fails with every row that missed, so one run shows the whole list.
// The module is pure and has no imports, so this needs no DOM and no server
// module (and so no NOVA_DATA_DIR).
import test from 'node:test';
import assert from 'node:assert/strict';
import { glassCommand, glassReceipt, matchPanel, recallCommand } from '../../src/glassVoice.js';

const CHART = { key: 'v1', kind: 'bars', title: 'Headset share', label: 'HEADSET SHARE' };
const VIDEO = { key: 'lk:v1', kind: 'video', title: 'Busy Bar review: a better gadget', label: 'REVIEWER', channel: 'Reviewer' };
const PAGE = { key: 'lk:p1', kind: 'page', title: 'Busy Bar: a $249 focus timer', label: 'THEVERGE.COM', host: 'theverge.com' };
const PRICE = { key: 'v5', kind: 'figure', title: 'Price', label: 'PRICE' };

// The stage a command is said on. `panels` are in the order they came up (the
// last is the newest); `hero` is the one lit or open; `history` what he put
// away. (A figure counts as a chart to "the chart", so the stage with the price
// up is only used where the chart is named in full.)
const STAGES = {
  empty: {},
  oneUp: { panels: [CHART] },
  oneLit: { panels: [CHART], hero: CHART },
  threeUp: { panels: [CHART, VIDEO, PAGE] },
  threeLit: { panels: [CHART, VIDEO, PAGE], hero: VIDEO },
  fourUp: { panels: [CHART, VIDEO, PAGE, PRICE] },
  awayOnly: { panels: [], history: [CHART] },
  withAway: { panels: [VIDEO], history: [CHART] },
};
const CHART_ONLY_KIND = ['oneUp', 'oneLit', 'threeUp', 'threeLit'];   // "the chart" is exactly one panel
const NAMED_CHART = [...CHART_ONLY_KIND, 'fourUp'];                    // "the headset share chart" is, on all of these
const SOME_STAGES = ['empty', 'oneUp', 'oneLit', 'threeUp', 'threeLit', 'fourUp'];

const MAX = (p) => ({ cmd: 'maximise', key: p.key, title: p.title });
const RESTORE = { cmd: 'restore' };

const SECTIONS = new Map();
const row = (section, say, stage, want) => {
  if (!SECTIONS.has(section)) SECTIONS.set(section, []);
  SECTIONS.get(section).push([say, stage, want]);
};
const onEach = (section, say, stages, want) => stages.forEach((st) => row(section, say, st, want));

// ---- 1. HOW PEOPLE REALLY SAY IT: the demo and its disfluent cousins -------
for (const say of [
  'Can you, uh, can you maximise the headset share chart, please?',   // the demo, verbatim
  'can you uh can you maximise the headset share chart',               // no commas, no capitals, no mark
  'CAN YOU, UM, CAN YOU MAXIMIZE THE HEADSET SHARE CHART PLEASE',      // shouted, the z
  'Can you can you maximise the headset share chart.',                 // a repeated opener, no filler
  'Um, maximise the headset share chart',
  'Er, can you, er, maximise the, uh, headset share chart?',
  'erm could you maximise the headset share chart',
  'Uhm, uh, um, maximise the headset share chart',
  'Can you, you know, maximise the headset share chart?',
  'you know, maximise the headset share chart',
  'maximise the headset share chart, you know',
  'Please can you maximise the headset share chart',
  'Could you please maximise the headset share chart',
  'would you please, please maximise the headset share chart',
  'Hey Nova, can you maximise the headset share chart',
  'Hey, Nova, could you maximise the headset share chart?',
  'Nova, maximise the headset share chart',
  'nova nova can you can you maximise the headset share chart',
  'maximise the headset share chart please',
  'maximise the headset share chart for me',
  'maximise the headset share chart, thanks',
  'Maximise the headset share chart, thank you.',
  'maximise the headset share chart for me please thanks',
  'Okay so can you maximise the headset share chart',
  'ok, nova, uh, could you please maximise the headset share chart for me, thanks',
  'go ahead and maximise the headset share chart',
  'I want you to maximise the headset share chart',
  "I'd like you to maximize the headset share chart please",
]) onEach('1 disfluent and polite', say, NAMED_CHART, MAX(CHART));

// ---- 2. THE CAP IS MEASURED ON WHAT IS LEFT ---------------------------------
// 83 characters as said, 41 once the politeness is gone
const LONG_POLITE = 'hey Nova, could you please make the headset share chart a lot bigger for me, thanks';
onEach('2 the cap, after cleaning', LONG_POLITE, NAMED_CHART, MAX(CHART));
// a long sentence is a question, not a command, even when it opens like one
for (const say of [
  'open the garage door and then clear the screen and also tell me about my day tomorrow please',
  'can you maximise the headset share chart and then tell me how much the share changed since last quarter and why',
  'um, hey Nova, could you please put the video away and then explain to me why the busy bar review was so much better than the other one',
]) onEach('2 the cap, after cleaning', say, ['threeUp', 'empty'], null);

// ---- 3. EVERYDAY ENLARGE PHRASINGS ------------------------------------------
// bare and pronoun forms: the lit panel, else the newest one; with nothing up
// they must NOT match (the words go to Nova)
const PRONOUN_ENLARGE = [
  'make that bigger', 'make it bigger', 'make this bigger', 'make that one bigger',
  'make it a lot bigger', 'make it much bigger', 'make it larger', 'Make that a bit bigger, please.',
  'blow that up', 'blow it up', 'blow this up',
  'zoom in', 'zoom in on it', 'zoom in on that',
  'bigger', 'bigger please', 'a bit bigger', 'larger',
  'full screen', 'fullscreen', 'full-screen', 'go full screen', 'make it full screen', 'make that fullscreen', 'full screen it', 'fullscreen that',
  'expand that', 'expand it',
  'maximise it', 'maximize that', 'maximise this', 'enlarge it', 'enlarge that',
  'focus on it', 'open that',
  'uh, can you, can you make that bigger, please?',
  'Hey Nova, could you blow it up for me?',
];
for (const say of PRONOUN_ENLARGE) {
  row('3 enlarge, one panel lit', say, 'oneLit', MAX(CHART));
  row('3 enlarge, one of three lit', say, 'threeLit', MAX(VIDEO));
  row('3 enlarge, one panel up, none lit', say, 'oneUp', MAX(CHART));
  row('3 enlarge, three up, none lit: the newest', say, 'threeUp', MAX(PAGE));
  row('3 enlarge, four up, none lit: the newest', say, 'fourUp', MAX(PRICE));
  row('3 enlarge, nothing up: must not match', say, 'empty', null);
  row('3 enlarge, only a put-away panel: must not match', say, 'awayOnly', null);
}
// a panel named: it works whatever is lit, and only when that panel is there
const NAMED_ENLARGE = [
  'make the chart bigger', 'make the headset share chart bigger', 'make that chart bigger', 'make the headset share chart a lot bigger',
  'make the chart larger', 'make the chart full screen', 'make the headset share chart fullscreen',
  'blow up the chart', 'blow the chart up', 'blow up the headset share chart',
  'zoom in on the chart', 'zoom into the chart', 'zoom in on the headset share chart',
  'enlarge the chart', 'enlarge the headset share chart',
  'expand the chart', 'expand the headset share chart',
  'maximise the chart', 'maximize the headset share chart', 'maximise that chart',
  'full screen the chart', 'fullscreen the headset share chart',
  'open the chart', 'open up the headset share chart', 'focus on the chart',
  'can you, uh, make the headset share chart bigger please?',
];
for (const say of NAMED_ENLARGE) {
  onEach('3 enlarge, a panel named', say, CHART_ONLY_KIND, MAX(CHART));
  row('3 enlarge, a panel named but not up: must not match', say, 'empty', null);
}
onEach('3 enlarge, a panel named', 'show me the chart', CHART_ONLY_KIND, MAX(CHART));
row('3 enlarge, a panel named', 'make the video bigger', 'threeUp', MAX(VIDEO));
row('3 enlarge, a panel named', 'zoom in on the busy bar review', 'threeUp', MAX(VIDEO));
// "them" is not one panel, and a verb alone has nothing to act on
onEach('3 enlarge, no one panel: must not match', 'make them bigger', ['threeUp', 'threeLit'], null);
onEach('3 enlarge, no one panel: must not match', 'blow them all up', ['threeUp', 'threeLit'], null);
onEach('3 enlarge, no one panel: must not match', 'maximise', ['threeLit'], null);
onEach('3 enlarge, no one panel: must not match', 'expand', ['threeLit'], null);
onEach('3 enlarge, no one panel: must not match', 'zoom in on', ['threeLit'], null);

// ---- 4. THE WAY BACK: smaller, zoom out (only onto the restore that exists) --
for (const say of [
  'make it smaller', 'make that smaller', 'make this a bit smaller', 'shrink that', 'shrink it', 'zoom out', 'back to normal', 'back to normal size', 'smaller',
  'unmaximise it', 'unmaximize that', 'minimise that', 'minimize it',
  'make the chart smaller', 'make the headset share chart smaller', 'shrink the chart', 'minimise the headset share chart',
  'uh, can you, can you make it smaller, please?',
]) onEach('4 smaller', say, CHART_ONLY_KIND, RESTORE);
// the restore words that worked before need nothing up, and still do not
for (const say of ['put it back', 'put that back', 'bring it back', 'unmaximise', 'minimise', 'minimize it', 'close it', 'close that', 'go back', 'back']) {
  onEach('4 restore, as before, needs nothing up', say, ['empty', 'oneUp', 'threeLit'], RESTORE);
}
// the new ones need something up to shrink, and a name that is there
for (const say of ['make it smaller', 'make that smaller', 'shrink that', 'shrink it', 'zoom out', 'back to normal', 'smaller']) {
  row('4 smaller, nothing up: must not match', say, 'empty', null);
}
row('4 smaller, a name that is not there: must not match', 'make the protein chart smaller', 'threeUp', null);

// ---- 5. FALSE POSITIVES: questions and other features, never a display command
const NOT_A_COMMAND = [
  'make my lunch bigger',
  'can you make dinner bigger tomorrow',
  "what's the bigger risk here",
  'zoom in on my squat form',
  'is my deficit too big',
  'show me the bigger picture on leadership',
  'expand on that',
  'can you expand on the second point',
  'Expand on that, please.',
  'blow up my inbox',
  'full screen mode on my Mac keeps breaking',
  'back to normal training next week',
  // near misses of the same shapes
  'make my portions smaller',
  'make the text bigger in settings',
  'make it bigger tomorrow',
  'is the chart bigger than last week',
  'bigger or smaller',
  'what does bigger mean',
  'I want a bigger breakfast',
  'zoom out of this conversation',
  'go back to the start of our chat',
  'show me everything about leadership',
  'full screen it on my phone and tell me the price',
  'expand the abbreviation in the last line',
  'open the garage door',
  'make a bigger plan for the week',
];
for (const say of NOT_A_COMMAND) onEach('5 false positives: must not match', say, SOME_STAGES, null);

// ---- 6. WHAT WORKED BEFORE STAYS (the neighbours) ---------------------------
row('6 neighbours, as before', 'tidy up', 'empty', { cmd: 'tidy' });
row('6 neighbours, as before', 'Line them up please', 'empty', { cmd: 'tidy' });
row('6 neighbours, as before', 'clear the screen', 'empty', { cmd: 'clear' });
row('6 neighbours, as before', 'Nova, clear the wall', 'threeUp', { cmd: 'clear' });
row('6 neighbours, as before', 'put them all away', 'threeUp', { cmd: 'clear' });
row('6 neighbours, as before', 'close them', 'threeUp', { cmd: 'clear' });
row('6 neighbours, as before', 'show the history', 'empty', { cmd: 'history' });
row('6 neighbours, as before', 'history', 'empty', { cmd: 'history' });
row('6 neighbours, as before', 'show me the transcript', 'empty', { cmd: 'words' });
row('6 neighbours, as before', 'subtitles on', 'empty', { cmd: 'words' });
row('6 neighbours, as before', 'hide the words', 'empty', { cmd: 'nowords' });
row('6 neighbours, as before', 'open the camera', 'empty', { cmd: 'camera-on' });
row('6 neighbours, as before', 'camera off', 'empty', { cmd: 'camera-off' });
row('6 neighbours, as before', 'be my camera', 'empty', { cmd: 'camera-beam' });
row('6 neighbours, as before', 'use the phone camera', 'empty', { cmd: 'camera-phone' });
row('6 neighbours, as before', 'look through my phone', 'empty', { cmd: 'camera-phone' });
row('6 neighbours, as before', 'use the mac camera', 'empty', { cmd: 'camera-mac' });
row('6 neighbours, as before', 'what am I holding', 'empty', { cmd: 'see-held' });
row('6 neighbours, as before', 'clear the boxes', 'empty', { cmd: 'unbox' });
row('6 neighbours, as before', 'highlight the pumpkin', 'empty', { cmd: 'highlight', what: 'pumpkin' });
row('6 neighbours, as before', 'can you highlight the keyboard and the coffee cup and the pumpkin', 'empty', { cmd: 'highlight', what: 'keyboard and the coffee cup and the pumpkin' });
row('6 neighbours, as before', 'show me the pumpkin on the desk', 'empty', { cmd: 'highlight', what: 'pumpkin' });
row('6 neighbours, as before', 'show me the pen on my left', 'empty', { cmd: 'highlight', what: 'pen on my left' });
row('6 neighbours, as before', 'Nova, can you maximize that for me?', 'oneLit', MAX(CHART));
row('6 neighbours, as before', 'maximise the headset share chart', 'threeUp', MAX(CHART));
row('6 neighbours, as before', 'maximise the price', 'fourUp', MAX(PRICE));
row('6 neighbours, as before', 'maximise the protein chart', 'threeUp', null);
row('6 neighbours, as before', 'what does the chart say', 'threeUp', null);
row('6 neighbours, as before', 'maximise that', 'empty', null);
row('6 neighbours, as before', 'put the video away', 'threeUp', { cmd: 'away', key: 'lk:v1', title: VIDEO.title });
row('6 neighbours, as before', 'put that away', 'threeLit', { cmd: 'away', key: 'lk:v1', title: VIDEO.title });
row('6 neighbours, as before', 'put that away', 'threeUp', null);   // nothing lit: not one panel in particular
row('6 neighbours, as before', 'get rid of the chart', 'threeUp', { cmd: 'away', key: 'v1', title: 'Headset share' });
row('6 neighbours, as before', 'clear them, everything other than the price', 'fourUp', { cmd: 'clear-except', key: 'v5', title: 'Price' });
row('6 neighbours, as before', 'keep just the price', 'fourUp', { cmd: 'clear-except', key: 'v5', title: 'Price' });
row('6 neighbours, as before', 'bring back the headset share chart', 'withAway', { cmd: 'bring', key: 'v1', title: 'Headset share' });
row('6 neighbours, as before', 'bring back that', 'withAway', { cmd: 'bring', key: 'v1', title: 'Headset share' });
row('6 neighbours, as before', 'show the chart again', 'withAway', { cmd: 'bring', key: 'v1', title: 'Headset share' });
row('6 neighbours, as before', 'bring up that one', 'awayOnly', { cmd: 'bring', key: 'v1', title: 'Headset share' });
row('6 neighbours, as before', 'bring back that', 'empty', null);

const show = (v) => (v == null ? 'null' : JSON.stringify(v));
for (const [section, rows] of SECTIONS) {
  test(`glass grammar: ${section}`, () => {
    const missed = [];
    for (const [say, stage, want] of rows) {
      const got = glassCommand(say, STAGES[stage]);
      if (JSON.stringify(got) !== JSON.stringify(want)) missed.push(`[${stage}] ${JSON.stringify(say)} gave ${show(got)}, wanted ${show(want)}`);
    }
    assert.equal(missed.length, 0, `${missed.length} of ${rows.length} rows missed:\n${missed.join('\n')}`);
  });
}

// a past lookup by name is still the server's record, said politely or not
test('a disfluent recall is still a recall, and the words he said travel on untouched', () => {
  const say = 'Um, can you bring back the Busy Bar lookup from yesterday, please?';
  assert.deepEqual(glassCommand(say, {}), { cmd: 'recall', raw: say });
  assert.deepEqual(recallCommand(say), { cmd: 'recall', raw: say });
  assert.equal(recallCommand('uh, bring up the chart'), null);
});

// what a matched command says back is not touched by any of this
test('the receipts are the ones he already hears', () => {
  assert.equal(glassReceipt({ cmd: 'maximise', title: 'Headset share' }), 'Headset share, larger.');
  assert.equal(glassReceipt({ cmd: 'restore' }), 'Back as it was.');
  assert.equal(glassReceipt({ cmd: 'tidy' }), 'Tidied.');
  assert.equal(glassReceipt({ cmd: 'clear' }), 'Cleared.');
  assert.equal(glassReceipt({ cmd: 'history' }), 'History.');
  assert.equal(glassReceipt({ cmd: 'words' }), 'Words on.');
  assert.equal(glassReceipt({ cmd: 'nowords' }), 'Words off.');
  assert.equal(glassReceipt({ cmd: 'away', title: 'Price' }), 'Price is away.');
  assert.equal(glassReceipt({ cmd: 'bring', title: 'Price' }), 'Price is back.');
  assert.equal(glassReceipt({ cmd: 'clear-except', title: 'Price' }), 'Just Price now.');
  assert.equal(glassReceipt({ cmd: 'maximise' }), 'That, larger.');
  assert.equal(glassReceipt(null), '');
});

// a panel is found by its name or its kind; "that chart" and "this video" name the panel too
test('a panel is found by its name or its kind, and "that chart" is the chart', () => {
  const panels = [CHART, VIDEO, PAGE];
  assert.equal(matchPanel('the headset share chart', panels)?.key, 'v1');
  assert.equal(matchPanel('the chart', panels)?.key, 'v1');
  assert.equal(matchPanel('that chart', panels)?.key, 'v1');
  assert.equal(matchPanel('this video', panels)?.key, 'lk:v1');
  assert.equal(matchPanel('the protein chart', panels), null);
  assert.equal(matchPanel('', panels), null);
  assert.equal(matchPanel('the chart', []), null);
});

// nothing a person can say makes the grammar throw or return anything but null or a command
test('odd input never throws and never returns anything but null or a command', () => {
  const odd = [undefined, null, '', '   ', ',,,', '...', '?', 'uh', 'um, er, erm', 'please', 'nova', 'hey nova', 'can you', 'can you please', 'thanks', 'you know', '😀', '😀 maximise the chart 😀', 42, {}, [], 'x'.repeat(5000)];
  for (const say of odd) {
    for (const st of Object.values(STAGES)) {
      const got = glassCommand(say, st);
      assert.ok(got === null || (typeof got === 'object' && typeof got.cmd === 'string'), `${JSON.stringify(say)} gave ${JSON.stringify(got)}`);
    }
  }
  assert.equal(glassCommand('maximise the chart'), null, 'no stage at all');
  assert.equal(glassCommand('make it bigger', { panels: null, hero: null, history: null }), null, 'nulls for the stage');
});
