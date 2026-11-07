// NOVA'S EYES (8 Nov 2026, lib/see.js): the model on this Mac names and
// boxes; code checks every box and picks the ones he named. No Ollama here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBoxes, pickBoxes, see, seeLine, imageBase64 } from '../lib/see.js';
import { glassCommand } from '../../src/glassVoice.js';

const QWEN = '```json\n[\n\t{"bbox_2d": [0, 133, 419, 513], "label": "keyboard"},\n\t{"bbox_2d": [543, 26, 721, 263], "label": "microphone"},\n\t{"bbox_2d": [369, 0, 797, 846], "label": "remote control"},\n\t{"bbox_2d": [10, 10, 12, 12], "label": "speck"},\n\t{"label": "no box"}\n]\n```';

test('Qwen\'s 0-1000 boxes become fractions; a sliver and a boxless row are dropped', () => {
  const b = parseBoxes(QWEN);
  assert.deepEqual(b.map((x) => x.label), ['keyboard', 'microphone', 'remote control']);
  assert.deepEqual(b[0].box, [0, 0.133, 0.419, 0.513]);
  assert.deepEqual(parseBoxes('I cannot see anything.'), []);
});

test('he names a thing: the boxes whose label shares a word, singular or plural', () => {
  const all = parseBoxes(QWEN);
  assert.deepEqual(pickBoxes(all, 'the keyboard').map((x) => x.label), ['keyboard']);
  assert.deepEqual(pickBoxes(all, 'keyboard and the microphone').map((x) => x.label), ['keyboard', 'microphone']);
  assert.deepEqual(pickBoxes(all, 'remote').map((x) => x.label), ['remote control']);
  assert.deepEqual(pickBoxes(all, 'pumpkin'), []);
});

test('see(): one frame in, boxes out, honest lines; the held thing in six words', async () => {
  const img = `data:image/jpeg;base64,${'A'.repeat(200)}`;
  assert.equal(imageBase64(img), 'A'.repeat(200));
  const gen = async ({ prompt }) => (/holding/.test(prompt) ? { text: 'A white Busy Bar timer.', ms: 900 } : { text: QWEN, ms: 4600 });
  const r = await see(img, { want: 'the keyboard', model: 'qwen3.5:4b', generate: gen });
  assert.equal(r.boxes.length, 1);
  assert.equal(r.all.length, 3);
  assert.equal(seeLine(r, { want: 'the keyboard' }), 'Boxed it.');
  const miss = await see(img, { want: 'the pumpkin', generate: gen });
  assert.equal(seeLine(miss, { want: 'the pumpkin' }), "I can't find the pumpkin in view.");
  const held = await see(img, { held: true, generate: gen });
  assert.equal(held.held, 'A white Busy Bar timer');
  assert.equal(seeLine(held), 'That looks like A white Busy Bar timer.');
  const bad = await see('not an image', { generate: gen });
  assert.match(seeLine(bad), /couldn't look/);
  const slow = await see(img, { generate: async () => { throw new Error('TimeoutError: aborted'); } });
  assert.match(slow.error, /longer than 25 s/);
});

test('the camera obeys words: open, highlight, what am I holding, clear the boxes, close', () => {
  assert.deepEqual(glassCommand('open the camera', {}), { cmd: 'camera-on' });
  assert.deepEqual(glassCommand('camera off', {}), { cmd: 'camera-off' });
  assert.deepEqual(glassCommand('highlight the pumpkin', {}), { cmd: 'highlight', what: 'pumpkin' });
  assert.deepEqual(glassCommand('can you highlight the keyboard and the coffee cup and the pumpkin', {}), { cmd: 'highlight', what: 'keyboard and the coffee cup and the pumpkin' });
  assert.deepEqual(glassCommand("what am I holding", {}), { cmd: 'see-held' });
  assert.deepEqual(glassCommand('clear the boxes', {}), { cmd: 'unbox' });
  // "show me the chart" is still a panel when a chart is up
  assert.deepEqual(glassCommand('show me the chart', { panels: [{ key: 'v3', kind: 'bars', title: 'Endpoints', label: 'ENDPOINTS' }] }), { cmd: 'maximise', key: 'v3', title: 'Endpoints' });
});
