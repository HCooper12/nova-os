import test from 'node:test';
import assert from 'node:assert/strict';
import { composeFromLabels, startLabelMacros, getLabelMacrosJob, _setScannerForTests } from '../lib/labelMacros.js';

test('composeFromLabels: scales each label by grams, sums, divides by servings, rounds', () => {
  const out = composeFromLabels([
    { name: 'Rolled oats', grams: 320, per100: { p: 13.5, c: 58, f: 8, kcal: 380 } },
    { name: 'Whey', grams: 120, per100: { p: 75, c: 8, f: 5, kcal: 380 } },
  ], 4);
  // oats: 43.2P 185.6C 25.6F 1216 · whey: 90P 9.6C 6F 456 → total 133.2P 195.2C 31.6F 1672
  assert.deepEqual(out.total, { p: 133.2, c: 195.2, f: 31.6, kcal: 1672 });
  assert.deepEqual(out.perServing, { p: 33.3, c: 48.8, f: 7.9, kcal: 418 });
  assert.equal(out.parts.length, 2);
  assert.deepEqual(out.parts[1].contribution, { p: 90, c: 9.6, f: 6, kcal: 456 });
  assert.equal(out.confidence, 'high');
});

test('composeFromLabels: refuses what it cannot compute honestly', () => {
  assert.throws(() => composeFromLabels([], 4), /at least one label/);
  assert.throws(() => composeFromLabels([{ name: 'x', grams: 0, per100: { p: 1 } }], 4), /needs the grams/);
  assert.throws(() => composeFromLabels([{ name: 'x', grams: 10, per100: { p: 1 } }], 0), /servings/);
  const low = composeFromLabels([{ name: 'x', grams: 10, per100: { p: 1 }, confidence: 'low' }], 1);
  assert.equal(low.confidence, 'low');
});

test('the composite job waits for every label, then composes; a blank label is flagged, a failed one errors', () => {
  const scans = new Map();
  let n = 0;
  _setScannerForTests({
    start: (mode, paths) => { assert.equal(mode, 'label-per100'); const id = `s${++n}`; scans.set(id, { status: 'running', path: paths[0] }); return id; },
    get: (id) => scans.get(id),
  });
  try {
    const id = startLabelMacros([
      { imagePath: '/tmp/a.jpg', workDir: '/tmp/a', grams: 200, name: 'a.jpg' },
      { imagePath: '/tmp/b.jpg', workDir: '/tmp/b', grams: 50, name: 'b.jpg' },
    ], 2);
    assert.equal(getLabelMacrosJob(id).status, 'running');
    scans.get('s1').status = 'ready'; scans.get('s1').result = { name: 'Greek yoghurt', per100: { p: 10, c: 4, f: 0, kcal: 60 }, confidence: 'high' };
    assert.equal(getLabelMacrosJob(id).status, 'running', 'one of two ready is still running');
    scans.get('s2').status = 'ready'; scans.get('s2').result = { name: 'Honey', per100: { p: 0, c: 82, f: 0, kcal: 330 }, confidence: 'high' };
    const done = getLabelMacrosJob(id);
    assert.equal(done.status, 'ready');
    assert.equal(done.result.parts[0].name, 'Greek yoghurt');
    // yoghurt 20P 8C 0F 120 · honey 0P 41C 0F 165 → /2 = 10P 24.5C 0F 142.5→143
    assert.deepEqual(done.result.perServing, { p: 10, c: 24.5, f: 0, kcal: 143 });

    // a label the model could not read a per-100g column from is not silently zero
    const id2 = startLabelMacros([{ imagePath: '/tmp/c.jpg', workDir: '/tmp/c', grams: 100, name: 'c.jpg' }], 1);
    scans.get('s3').status = 'ready'; scans.get('s3').result = { name: 'blurry', per100: null, confidence: 'low' };
    const blank = getLabelMacrosJob(id2);
    assert.equal(blank.status, 'ready');
    assert.match(blank.result.warning, /Couldn't read a per-100g column on: blurry/);
    assert.equal(blank.result.confidence, 'low');

    // a failed scan fails the job, naming the label
    const id3 = startLabelMacros([{ imagePath: '/tmp/d.jpg', workDir: '/tmp/d', grams: 100, name: 'd.jpg' }], 1);
    scans.get('s4').status = 'error'; scans.get('s4').error = 'claude exited with code 1';
    const bad = getLabelMacrosJob(id3);
    assert.equal(bad.status, 'error');
    assert.match(bad.error, /d\.jpg: claude exited/);

    assert.throws(() => startLabelMacros([{ imagePath: '/tmp/e.jpg', workDir: '/tmp/e', grams: 0, name: 'e.jpg' }], 1), /needs the grams/);
    assert.equal(getLabelMacrosJob('nope'), null);
  } finally {
    _setScannerForTests(null);
  }
});
