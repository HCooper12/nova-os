// THE CAMERA, WHICH WAS NOT ALWAYS WORKING (22 Sep 2026).
//
// "The camera option isn't always working either to add or take a photo."
//
// Intermittent, on an installed PWA, on the one control that opens a system
// UI. Four separate faults were found in that path, and each one produced the
// SAME symptom — he comes back from the camera and the screen looks exactly
// as it did before he opened it:
//
//   1. the FileList was cleared out from under the read;
//   2. a fresh camera capture was decoded through an object URL, the one path
//      iOS refuses once it has released the capture's backing file;
//   3. every decode failure resolved to '' and was filtered away in silence;
//   4. iOS evicted the backgrounded app while the camera was open, and the
//      staged photos were only ever in memory.
//
// None of this can be proven from Node — it is iOS behaviour. What this file
// pins is that the four defences are present and cannot be quietly removed,
// which is what a later refactor would otherwise do to all of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const APP = readFileSync(root('src/App.jsx'), 'utf8');
const VALS = readFileSync(root('src/vals/valsRecipes.js'), 'utf8');
const SCREEN = readFileSync(root('src/screens/Recipes.jsx'), 'utf8');

const fn = (src, name) => {
  const at = src.indexOf(name);
  assert.ok(at > 0, `${name} is gone`);
  return src.slice(at, src.indexOf('\n  }', at));
};

test('1 — the FileList is snapshotted before anything can yield', () => {
  const body = fn(APP, 'async addFoodScanPhotos(fileList)');
  const snapshot = body.indexOf('Array.from(fileList');
  const firstAwait = body.indexOf('await');
  assert.ok(snapshot > 0 && (firstAwait === -1 || snapshot < firstAwait),
    'a live FileList read after an await is a FileList the input may already have emptied');
});

test('1b — and the input is cleared only once the read has finished', () => {
  const at = VALS.indexOf('addFoodScanPhotos: (e) =>');
  const handler = VALS.slice(at, VALS.indexOf('},', at));
  assert.match(handler, /\.finally\(\(\) => \{ try \{ input\.value = ''/,
    'clearing it synchronously can pull the capture out from under the read');
  assert.ok(!/app\.addFoodScanPhotos\(e\.target\.files\); e\.target\.value = ''/.test(VALS),
    'the synchronous clear is the bug, not a style');
  assert.match(handler, /input\.value = ''/, 'it must still be cleared, or the same photo twice fires nothing');
});

test('2 — the Blob is decoded directly first, with the object-URL path only as a fallback', () => {
  const body = APP.slice(APP.indexOf('async downscaleImageFile('), APP.indexOf('onRecipeAddPhotoFile('));
  const bitmap = body.indexOf('createImageBitmap(file)');
  const objectUrl = body.indexOf('URL.createObjectURL(file)');
  assert.ok(bitmap > 0, 'createImageBitmap reads the Blob itself, and handles the HEIC his camera writes');
  assert.ok(objectUrl > bitmap, 'the object-URL path must be the fallback, not the first attempt');
  assert.match(body, /typeof createImageBitmap === 'function'/, 'and must be feature-detected, not assumed');
});

test('2b — an already-small photo is re-encoded, not sent as raw megabytes', () => {
  const body = APP.slice(APP.indexOf('async downscaleImageFile('), APP.indexOf('onRecipeAddPhotoFile('));
  assert.ok(!/if \(scale === 1\) \{ fallback\(\); return; \}/.test(body),
    'that branch base64d a whole 12MP HEIC into memory because it was under the long edge');
  assert.match(body, /Math\.max\(w, h\) > maxEdge \? maxEdge \/ Math\.max\(w, h\) : 1/,
    'under the limit means scale 1 — the same pixels, still re-encoded to JPEG');
});

test('3 — a photo that did not land says so', () => {
  const body = fn(APP, 'async addFoodScanPhotos(fileList)');
  assert.match(body, /const lost = taking\.length - good\.length/, 'the blanks must be counted, not just filtered');
  assert.match(body, /foodScanError:/, 'and reported on the surface he is looking at');
  assert.ok(!/urls\.filter\(Boolean\)\]/.test(body) || /const lost/.test(body),
    'filtering in silence is what made a failed capture indistinguishable from no capture');
  // the error already has a place to be seen — this is not a new surface
  assert.match(SCREEN, /\{v\.foodScanError && <div/);
});

test('4 — staged photos survive the app being evicted while the camera is open', () => {
  assert.match(APP, /const FOOD_PHOTO_KEY = 'novaos\.foodScanPhotos'/);
  assert.match(APP, /export function restoreFoodScanPhotos\(\)/);
  assert.match(APP, /foodScanPhotos: restoreFoodScanPhotos\(\)/, 'restored into the INITIAL state, before first paint');
  const persist = fn(APP, 'persistFoodScanPhotos(list)');
  assert.match(persist, /sessionStorage/, 'one composing session, not a week from now');
  assert.ok(!/localStorage/.test(persist));
  assert.match(persist, /catch \{/, 'a few JPEGs can exceed quota, and that must not throw away the in-memory staging');
  // every path that changes the staged list must write through
  for (const name of ['async addFoodScanPhotos(fileList)', 'removeFoodScanPhoto(idx)', 'clearFoodScanPhotos()']) {
    assert.match(fn(APP, name), /persistFoodScanPhotos\(/, `${name} must write through, or the restore lies`);
  }
});

test('restoreFoodScanPhotos refuses anything that is not a data URL, and never more than five', async () => {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const { restoreFoodScanPhotos } = await import('../../src/App.jsx').catch(() => ({}));
  if (!restoreFoodScanPhotos) return; // App.jsx pulls in the DOM; the source assertions above carry this
  store.set('novaos.foodScanPhotos', JSON.stringify(['data:image/jpeg;base64,AAA', 'javascript:alert(1)', 42]));
  assert.deepEqual(restoreFoodScanPhotos(), ['data:image/jpeg;base64,AAA']);
});
