// THE PULL-DOWN'S CONTRACT (sheetDrag.js, 11 Oct 2026).
//
// His recording: an agent's skill sheet that could only be left through the
// "‹ Agents" label; swiping down did nothing. The maths is pure and tested
// here; the second half is the contract that every sheet in Nova is wired to
// the one primitive, so a new sheet cannot quietly ship without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  project, sheetDecision, dismissThreshold, dragOffset, sheetProgress,
  scrimOpacity, springFrames, keyboardInset, RESCUE_PX_PER_MS,
} from '../../src/sheetDrag.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

test('projection: Apple\'s decay at 0.998, in px per ms', () => {
  assert.equal(project(0), 0);
  // 1 px/ms (1000 px/s) carries on ~499px before it stops
  assert.ok(Math.abs(project(1) - 499) < 1);
  assert.ok(project(-1) < 0);
  assert.equal(project(NaN), 0);
});

test('the decision: distance OR velocity dismisses; a slow short pull returns', () => {
  const h = 600;
  assert.equal(sheetDecision({ dy: 40, v: 0, height: h }), 'return', 'a slow short drag springs back');
  assert.equal(sheetDecision({ dy: 40, v: 1.2, height: h }), 'dismiss', 'a fast flick throws it from 40px');
  assert.equal(sheetDecision({ dy: 260, v: 0, height: h }), 'dismiss', 'a long slow drag past a third goes');
  assert.equal(sheetDecision({ dy: 400, v: -0.4, height: h }), 'return', 'flicked back up is a rescue, however far down');
  assert.equal(sheetDecision({ dy: 400, v: RESCUE_PX_PER_MS + 0.01, height: h }), 'dismiss', 'a still finger far down still goes');
  assert.equal(sheetDecision({ dy: NaN, v: 3 }), 'return');
});

test('the threshold is a share of the sheet, clamped for a pill and for a page', () => {
  assert.equal(dismissThreshold(600), 198);
  assert.equal(dismissThreshold(120), 90, 'a short bar still needs a real pull');
  assert.equal(dismissThreshold(2000), 260, 'a full page does not need a mile');
  assert.equal(dismissThreshold(undefined), 198);
});

test('the rubber band: down is 1:1, up resists and never passes the bound', () => {
  assert.equal(dragOffset(120, 600), 120);
  const up = dragOffset(-200, 600);
  assert.ok(up < 0 && up > -200, 'up moves, but less than the finger');
  assert.ok(dragOffset(-100000, 600) > -600, 'and never passes the sheet\'s own height');
  // progressive: each extra px of pull moves it less
  const a = -dragOffset(-100, 600), b = -dragOffset(-200, 600) - a;
  assert.ok(b < a);
  assert.equal(dragOffset(NaN), 0);
});

test('progress and the scrim', () => {
  assert.equal(sheetProgress(0, 600), 0);
  assert.equal(sheetProgress(300, 600), 0.5);
  assert.equal(sheetProgress(900, 600), 1);
  assert.equal(sheetProgress(-50, 600), 0);
  assert.equal(scrimOpacity(0), 1);
  assert.ok(scrimOpacity(0.5) > 0.5, 'the dim lags the travel, so the page behind stays dim while he decides');
  assert.ok(scrimOpacity(1) >= 0 && scrimOpacity(1) < 0.2);
});

test('the spring: lands exactly, leaves at the finger\'s speed, never overshoots a critically damped throw', () => {
  const { frames, ms } = springFrames(100, 800, 1.5, { response: 0.3, dampingRatio: 1 });
  assert.equal(frames[0], 100);
  assert.equal(frames[frames.length - 1], 800);
  assert.ok(ms >= 16 && ms <= 900);
  assert.ok(frames.every((y) => y <= 800 + 0.5), 'a throw off screen must not bounce back into view');
  // the velocity handoff: the first frame moves about v * 16.7ms, not from rest
  const firstStep = frames[1] - frames[0];
  assert.ok(firstStep > 15, `first frame moved ${firstStep}px; the throw started from rest`);
  const still = springFrames(100, 800, 0, { response: 0.3, dampingRatio: 1 });
  assert.ok(still.frames[1] - still.frames[0] < firstStep, 'a flick leaves faster than a release');
  // the return springs a touch past home and settles (0.86)
  const back = springFrames(200, 0, -2, { response: 0.38, dampingRatio: 0.86 });
  assert.ok(Math.min(...back.frames) < 0, 'a little life on the way home');
  assert.equal(back.frames[back.frames.length - 1], 0);
});

test('the keyboard inset reads the visual viewport, and ignores browser chrome', () => {
  assert.equal(keyboardInset(844, 844, 0), 0);
  assert.equal(keyboardInset(844, 508, 0), 336);
  assert.equal(keyboardInset(844, 820, 0), 0, 'a 24px toolbar is not a keyboard');
});

// ── the contract: every sheet uses the one primitive ──

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.jsx$/.test(n)) out.push(p);
  }
  return out;
}

test('EVERY aria-modal sheet names the element that moves (data-sheet)', () => {
  const missing = [];
  for (const f of walk(SRC)) {
    const code = readFileSync(f, 'utf8');
    if (!/aria-modal="true"/.test(code)) continue;
    // one marker per modal root at least
    const roots = (code.match(/aria-modal="true"/g) || []).length;
    const marks = (code.match(/data-sheet=(""|"root"|\{)/g) || []).length;
    if (marks < roots) missing.push(`${path.relative(SRC, f)} (${roots} modal roots, ${marks} data-sheet)`);
  }
  // the full-screen Nova stage and the camera are pages with their own close
  // gestures; they are named here so the exception is a decision, not a gap
  const allowed = ['NovaFocus.jsx', 'BarcodeScanner.jsx'];
  assert.deepEqual(missing.filter((m) => !allowed.some((a) => m.startsWith(a))), [],
    'these sheets cannot be pulled down: mark the moving element data-sheet (or data-sheet="root")');
});

test('a sheet that is its own root names its close (a data-sheet-close scrim or control)', () => {
  const bad = [];
  for (const f of walk(SRC)) {
    const code = readFileSync(f, 'utf8');
    if (!/data-sheet="root"|data-sheet=\{[^}]*'root'/.test(code)) continue;
    if (!/data-sheet-close/.test(code) && !/data-edge-close/.test(code)) bad.push(path.relative(SRC, f));
  }
  assert.deepEqual(bad, []);
});

test('the named surfaces from his ask are wired', () => {
  const read = (p) => readFileSync(path.join(SRC, p), 'utf8');
  assert.match(read('skillsets/SkillSets.jsx'), /className="nv-skl-sheet" data-sheet=/, 'the agents\' skill sheet');
  assert.match(read('MobileChrome.jsx'), /aria-label="More"[\s\S]{0,300}data-sheet=""/, 'the More sheet');
  assert.match(read('ReplySheet.jsx'), /data-sheet-float=""[\s\S]*data-sheet=""[\s\S]*data-sheet-close=""/, 'the reply bar (Ask)');
  assert.match(read('VoicePresence.jsx'), /data-sheet-float="" data-sheet=""/, 'the conversation pop-up');
  assert.match(read('ReviewSheet.jsx'), /nv-rv-sheet" data-sheet=""/, 'the Review sheet');
  assert.match(read('screens/Journal.jsx'), /nv-jr-sheet[^\n]*data-sheet="root"/, 'the Journal prompt sheet');
});

test('the wiring: mounted once, closes through the sheet\'s own close, and useExit does not fall twice', () => {
  const read = (p) => readFileSync(path.join(SRC, p), 'utf8');
  assert.match(read('EdgeBack.jsx'), /installSheetDrag\(\)/);
  const mod = read('sheetDrag.js');
  assert.match(mod, /\[data-sheet-close\]'\) \|\| root\.querySelector\('\[data-edge-close\]'\)/, 'closes the way Back does');
  assert.match(mod, /focused\.blur\(\)/, 'the keyboard goes down with the sheet');
  assert.match(mod, /el\.addEventListener\('touchmove', onMove, \{ passive: false \}\)/, 'the rest of the touch is heard on its own element');
  assert.match(mod, /prefers-reduced-motion/);
  assert.match(read('useExit.js'), /data-sheet-gone/);
  assert.match(read('useSheetDrag.js'), /markGrabZone\(\)/, 'a grab zone keeps its own touch');
});
