// HAPTICS. His report, 15 Sep 2026: "I have never felt any haptics while using
// my phone." He was right — iOS has never shipped navigator.vibrate, so every
// call was a no-op on the only device he uses. Two things are pinned here: the
// vocabulary cannot drift again, and the capability is reported honestly rather
// than optimistically.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const { HAPTIC_WORDS, hapticCapability, needsSwitchHaptic } = await import('../../src/haptics.js');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full));
    else if (/\.(js|jsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

test('the vocabulary is the five words, and nothing has quietly joined it', () => {
  assert.deepEqual(HAPTIC_WORDS, ['tick', 'commit', 'threshold', 'celebrate', 'warn']);
});

test('EVERY haptic() call site in src/ uses a real word', async () => {
  // The fault this exists for: haptic('light') was called in five places and
  // was never one of the five. It fell through to a tick in silence — four card
  // buttons and the swipe pager all firing the wrong thing, with nothing able
  // to notice.
  const files = await walk(SRC);
  const bad = [];
  for (const f of files) {
    if (f.endsWith(path.join('src', 'haptics.js'))) continue; // defines them
    const text = await readFile(f, 'utf8');
    for (const m of text.matchAll(/\bhaptic\(\s*'([a-z-]+)'/g)) {
      if (!HAPTIC_WORDS.includes(m[1])) bad.push(`${path.relative(SRC, f)}: haptic('${m[1]}')`);
    }
  }
  assert.deepEqual(bad, [], `these are not haptic words:\n${bad.join('\n')}`);
});

test('at least one call site uses each end of the vocabulary', async () => {
  // A word defined and never fired is a tier he can never feel. `warn` was in
  // exactly that state — the error buzz the whole idea turns on, unused.
  const files = await walk(SRC);
  const used = new Set();
  for (const f of files) {
    if (f.endsWith(path.join('src', 'haptics.js'))) continue;
    const text = await readFile(f, 'utf8');
    for (const m of text.matchAll(/\bhaptic\(\s*'([a-z-]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.has('tick'), 'nothing fires the everyday tick');
  assert.ok(used.has('commit'), 'nothing fires the commit');
  assert.ok(used.has('warn'), 'NOTHING FIRES THE ERROR BUZZ — every failure is silent to the hand');
});

/* ---------------------------- honest capability --------------------------- */

function withNavigator(nav, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'navigator');
  const prev = had ? globalThis.navigator : undefined;
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  try { return fn(); } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', { value: prev, configurable: true, writable: true });
    else delete globalThis.navigator;
  }
}

const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15', maxTouchPoints: 5 };
const ANDROID = { userAgent: 'Mozilla/5.0 (Linux; Android 15)', vibrate: () => true, maxTouchPoints: 5 };
const DESKTOP = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 };

test('on his iPhone the overlay path is the one that is left, and it says so', () => {
  withNavigator(IPHONE, () => {
    assert.equal(needsSwitchHaptic(), true);
    const cap = hapticCapability();
    assert.equal(cap.path, 'switch');
    assert.equal(cap.tiers, false, 'iOS web gets one flavour — claiming five would be the lie');
    assert.match(cap.label, /native shell/, 'and it names what would fix that');
  });
});

test('Android has the real Vibration API, so the overlay is not used', () => {
  withNavigator(ANDROID, () => {
    assert.equal(needsSwitchHaptic(), false);
    const cap = hapticCapability();
    assert.equal(cap.path, 'vibrate');
    assert.equal(cap.tiers, true);
  });
});

test('a desktop with no haptics says exactly that, rather than offering a dead button', () => {
  withNavigator(DESKTOP, () => {
    assert.equal(needsSwitchHaptic(), false);
    const cap = hapticCapability();
    assert.equal(cap.path, 'none');
    assert.equal(cap.tiers, false);
  });
});

test('an iPad reports as a Mac — touch points are what separate it', () => {
  withNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }, () => {
    assert.equal(needsSwitchHaptic(), true, 'iPadOS 13+ lies about being a Mac');
  });
});
