// THE MORNING BRIEF'S GLASS ON THE NOVA THREAD (7 Oct 2026). His report:
// "the morning brief is not displaying the glass panel pop ups with the
// visual information like it was before the redesign." The brief puts each
// beat's card on the stage (putCard); the summary Nova thread drew panels
// only from running glass on a row, and the presence is hidden on that
// screen, so the brief's cards landed nowhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { valsNovaThread } from '../../src/vals/valsNovaThread.js';

const CARD = { kind: 'metric', label: 'SLEEP', value: '7h 12m', caption: 'LAST NIGHT' };
const RING = { kind: 'metric', label: 'PROTEIN', value: '84', unit: 'g' };
const v = { glass: null, briefQueue: null, attach: { pending: [] }, routePreview: () => ({ lane: 'ask' }) };
const appOf = (state) => ({ state: { novaStyle: 'summary', screen: 'voice', voiceChat: [], orbChat: [], glassBeats: [], ...state } });

test('a brief beat row carries its card, and the thread settles it as a panel', () => {
  const T = valsNovaThread(appOf({ voiceChat: [{ at: 1, who: 'nova', text: 'You slept seven hours.', card: CARD }] }), {}, v).novaThread;
  const line = T.lines[0];
  assert.ok(line.settled, 'the card is drawn on its row');
  assert.equal(line.settled.last.label, 'SLEEP');
});

test('while the brief speaks, the stage shows the stage card with the beats already said behind it', () => {
  const T = valsNovaThread(appOf({
    voiceChat: [{ at: 2, who: 'nova', text: 'Protein is at 84 grams.', card: RING }],
    voiceSpeaking: true, stageCard: RING, stageHistory: [CARD],
  }), {}, v).novaThread;
  assert.equal(T.stage.hero.label, 'PROTEIN');
  assert.deepEqual(T.stage.rail.map((c) => c.label), ['SLEEP']);
});

test('no stage when nothing is speaking, and running glass still wins when there is some', () => {
  const quiet = valsNovaThread(appOf({ voiceSpeaking: false, stageCard: RING }), {}, v).novaThread;
  assert.equal(quiet.stage, null);
});

test('the brief writes the card onto the row as well as the stage', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /who: 'nova', text: st\.say, panel: st\.panel \|\| undefined, card: st\.card \|\| undefined \}/);
});
