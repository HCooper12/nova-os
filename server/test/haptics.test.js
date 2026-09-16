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
const { HAPTIC_WORDS, hapticCapability, needsSwitchHaptic, pulsesFor, reportedIosVersion } = await import('../../src/haptics.js');

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

test('EVERY haptic="word" JSX PROP uses a real word too', async () => {
  // The other half of the same hole. `haptic` is both a function and a prop —
  // Interactive, Chip and TextAction all take `haptic="tick"` — and the call-site
  // test above greps only `haptic(`. A typo in a PROP falls through to a tick
  // exactly as silently, and six of these landed on Train on 16 Sep.
  const files = await walk(SRC);
  const bad = [];
  for (const f of files) {
    const text = await readFile(f, 'utf8');
    for (const m of text.matchAll(/\bhaptic=["']([a-z-]+)["']/g)) {
      if (!HAPTIC_WORDS.includes(m[1])) bad.push(`${path.relative(SRC, f)}: haptic="${m[1]}"`);
    }
  }
  assert.deepEqual(bad, [], `these are not haptic words:\n${bad.join('\n')}`);
});

test('the surfaces where the hand is the only sense are covered', async () => {
  // Train is where he taps one-handed, mid-lift, without looking — and it had
  // ZERO haptics while Home had 29. A word here is worth more than anywhere else.
  const train = await readFile(path.join(SRC, 'screens', 'Workouts.jsx'), 'utf8');
  const words = [...train.matchAll(/\bhaptic=["']([a-z-]+)["']/g)].map((m) => m[1]);
  assert.ok(words.length >= 5, `Train has ${words.length} haptic words — the set tick is the app's most-repeated tap`);
  for (const w of words) assert.ok(HAPTIC_WORDS.includes(w), `haptic="${w}" is not a word`);
});

test('a Chip and a TextAction answer the hand by default', async () => {
  // Chip had no haptic prop at all, so EVERY chip in the app was silent —
  // the tone chips, the Coach pills, Speak it, the Repertoire tabs.
  const controls = await readFile(path.join(SRC, 'Controls.jsx'), 'utf8');
  for (const comp of ['Chip', 'TextAction']) {
    const sig = controls.match(new RegExp(`export function ${comp}\\(\\{[^}]*\\}`, 's'))?.[0] || '';
    assert.match(sig, /haptic = 'tick'/, `${comp} does not default to a haptic word — its taps are silent`);
  }
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
    // UNASKED is null — unknown is its own answer, and the row asks rather
    // than assuming in either direction. (In node there is no localStorage, so
    // this is the unanswered state by construction.)
    assert.equal(cap.tiers, null, 'UNKNOWN — and null is the honest answer, not false');
    assert.match(cap.label, /cannot detect/, 'it says plainly that it cannot tell');
    assert.match(cap.label, /Press "tick" then "warn"/, 'and hands him the one instrument that can');
  });
});

test('the reported iOS version is a breadcrumb, never a gate', () => {
  // 16 Sep: his diagnostic read 18.7 and he is on 27 — Safari FREEZES the
  // version it reports. A gate on this shipped "your version supports tiers"
  // to a phone three majors past the one that closed them. It is named
  // `reportedIosVersion` now so the next reader cannot mistake it for the OS.
  withNavigator(IPHONE, () => {
    assert.equal(reportedIosVersion(), '26.5', 'whatever the UA says, and only that');
    // and nothing in the capability answer depends on it
    assert.equal(hapticCapability().tiers, null);
  });
  withNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)', maxTouchPoints: 5 }, () => {
    assert.equal(hapticCapability().tiers, null, 'an older reported version changes nothing — it cannot be trusted');
  });
});

test('the words are one, two or three pulses — warn is three so it cannot read as a commit', () => {
  assert.deepEqual(pulsesFor('tick'), { count: 1, gaps: [] });
  assert.deepEqual(pulsesFor('threshold'), { count: 1, gaps: [] });
  assert.equal(pulsesFor('commit').count, 2);
  assert.equal(pulsesFor('celebrate').count, 3);
  assert.equal(pulsesFor('warn').count, 3);
  assert.ok(pulsesFor('warn').gaps[0] < pulsesFor('celebrate').gaps[0],
    'and warn is the RAPID three — a celebration is spaced, a refusal is insistent');
  assert.deepEqual(pulsesFor('nonsense'), { count: 1, gaps: [] }, 'an unknown word is one honest pulse');
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
