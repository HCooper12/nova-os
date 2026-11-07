// HIS PHONE AS THE MAC'S CAMERA (8 Nov 2026, lib/cameraRelay.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { setFrame, latestFrame, latestDataUrl, relayState, STALE_MS, _resetForTests } from '../lib/cameraRelay.js';
import { glassCommand } from '../../src/glassVoice.js';

const JPEG = `data:image/jpeg;base64,${Buffer.from('x'.repeat(300)).toString('base64')}`;

test('a frame is kept in memory, served as bytes and as a data URL, and dies after STALE_MS', () => {
  _resetForTests();
  assert.equal(latestFrame(), null);
  assert.deepEqual(relayState({ now: 1000 }), { live: false, at: null, from: null, seq: 0, ageMs: null });
  const r = setFrame(JPEG, { from: 'phone', now: 1000 });
  assert.equal(r.ok, true); assert.equal(r.seq, 1); assert.equal(r.bytes, 300);
  const f = latestFrame({ now: 1200 });
  assert.equal(f.type, 'image/jpeg'); assert.equal(f.buf.length, 300); assert.equal(f.from, 'phone');
  assert.match(latestDataUrl({ now: 1200 }), /^data:image\/jpeg;base64,/);
  assert.equal(relayState({ now: 1200 }).live, true);
  assert.equal(relayState({ now: 1200 }).ageMs, 200);
  assert.equal(latestFrame({ now: 1000 + STALE_MS + 1 }), null, 'stale is gone');
  assert.equal(relayState({ now: 1000 + STALE_MS + 1 }).live, false);
});

test('not an image, empty, or too big: refused with the reason', () => {
  _resetForTests();
  assert.equal(setFrame('hello').error, 'not an image');
  assert.equal(setFrame('data:image/jpeg;base64,').error, 'not an image');
  assert.match(setFrame(`data:image/jpeg;base64,${Buffer.alloc(700 * 1024).toString('base64')}`).error, /over 600 kB/);
});

test('the words: "be my camera" on the phone, "use the phone camera" on the Mac', () => {
  assert.deepEqual(glassCommand('be my camera', {}), { cmd: 'camera-beam' });
  assert.deepEqual(glassCommand('use my phone as the camera', {}), { cmd: 'camera-beam' });
  assert.deepEqual(glassCommand('use the phone camera', {}), { cmd: 'camera-phone' });
  assert.deepEqual(glassCommand('look through my phone', {}), { cmd: 'camera-phone' });
  assert.deepEqual(glassCommand('use the mac camera', {}), { cmd: 'camera-mac' });
});
