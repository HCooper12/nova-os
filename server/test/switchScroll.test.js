// A SCROLL MUST NOT BE A TAP.
//
// Reported from the gym, mid-session, 16 Sep 2026: "when I scroll I keep
// accidentally clicking buttons (like ticking workouts) or actions like adding
// an extra set, whereas previously my scrolling didn't impact this."
//
// Cause: the iOS haptic path lays a transparent NATIVE <input type="checkbox">
// over the whole control, because a real form control is the only thing iOS
// 26.5 will still fire the Taptic Engine for. A native form control does not
// honour the same scroll-versus-tap disambiguation a div does — dragging up
// the Train screen from a set row activated it at touch-end, and the click
// bubbles by design (Interactive must not swallow it or the button goes dead),
// so the set ticked. The Train screen got five of these the same day.
//
// This is the exact cost of the haptics fix, and it is worth paying only if a
// travelling finger disarms the control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const RAW = readFileSync(root('src/Interactive.jsx'), 'utf8');
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the overlay is disarmed once the finger travels past the slop', () => {
  assert.match(SRC, /SWITCH_SLOP_PX/, 'there must be a movement threshold at all');
  assert.match(SRC, /Math\.hypot\(e\.clientX - p\.x, e\.clientY - p\.y\) > SWITCH_SLOP_PX/,
    'the distance must be real 2D travel, not a single axis');
  assert.match(SRC, /armSwitch\(e\.currentTarget, false\)/, 'and it must actually disarm');
});

test('disarming means BOTH disabled and pointer-events — either alone leaks', () => {
  const arm = SRC.slice(SRC.indexOf('const armSwitch'));
  const body = arm.slice(0, arm.indexOf('};'));
  assert.match(body, /\.disabled = !on/, 'a disabled control cannot fire change');
  assert.match(body, /pointerEvents = on \? '' : 'none'/, 'and cannot receive the touch either');
});

test('it re-arms on the next press, or the button goes permanently dead', () => {
  const down = SRC.slice(SRC.indexOf('onPointerDown: (e) => {'));
  assert.match(down.slice(0, 400), /armSwitch\(e\.currentTarget, true\)/);
});

test('a cancelled gesture disarms too — that IS the browser taking the scroll', () => {
  const cancel = SRC.slice(SRC.indexOf('onPointerCancel: (e) =>'));
  assert.match(cancel.slice(0, 260), /armSwitch\(e\.currentTarget, false\)/);
});

test('the lookup is PER ELEMENT, not the module-level ref', () => {
  // switchHapticRef is shared across every Interactive in the app, so it holds
  // whichever mounted last — arming through it would arm the wrong button
  assert.match(SRC, /querySelector\('input\[data-nv-haptic\]'\)/);
  assert.match(SRC, /data-nv-haptic/, 'the input must carry the marker the lookup needs');
});

test('the click still bubbles — swallowing it is what kills the button', () => {
  assert.ok(!/stopPropagation\(\)[\s\S]{0,120}data-nv-haptic/.test(SRC));
  const input = SRC.slice(SRC.indexOf('data-nv-haptic'));
  assert.ok(!input.slice(0, 400).includes('preventDefault'), 'the tap has to reach iOS for the Taptic Engine to fire');
});

test('the scrolling root cannot resize under a scroll', () => {
  const app = readFileSync(root('src/App.jsx'), 'utf8');
  assert.match(app, /min-height:100svh/, 'dvh tracks the URL bar and jumps mid-scroll; svh is stable');
  assert.ok(!/min-height:100dvh/.test(app));
});
