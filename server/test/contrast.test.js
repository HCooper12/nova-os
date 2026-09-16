// CONTRAST IS ARITHMETIC, SO IT CAN BE A TEST.
//
// Found 17 Sep by auditing Home against Apple's HIG: `Meta tone="faint"` was
// --nv-ink40 at alpha .38, which is 3.16:1 on the cupertino pane. It renders
// at 12.5px/500 — not bold, not 18pt — so it needed 4.5:1, and it was the
// quietest tier of text in the app across 256 call sites. Every accent in the
// daylight palette failed too: Apple's system colours are defined for FILLS
// that carry white labels, and Nova paints text with them at 433 sites.
//
// None of that is visible by looking, which is why it survived. It is exactly
// computable, so it is checked here and cannot come back.
//
//   accessibility.md › Contrast — "Up to 17 pts | All | 4.5:1"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const lum = (c) => {
  const s = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
export const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// The themes, and the ground each one's cards sit on. Under cupertino a pane is
// rgba(255,255,255,.075) over the app ground; daylight's card is solid white.
const THEMES = [
  { name: 'command (default)', anchor: '--nv-void:#06070d', ground: '0a0f1e' },
  { name: 'observatory', anchor: 'data-nv-theme="observatory"', ground: '0c1424' },
  { name: 'ember', anchor: 'data-nv-theme="ember"', ground: '170e0b' },
  { name: 'daylight', anchor: 'data-nv-theme="daylight"', white: true },
];
// every token Nova paints TEXT with. --nv-ink40 is absent on purpose: it is
// the hairline-and-glyph tier now, never type (see Controls.TONES.faint).
const TEXT_TOKENS = ['ink', 'ink50', 'ink60', 'cy', 'vi', 'mg', 'gold', 'good', 'warn', 'acc'];

const blockFor = (anchor) => {
  const i = css.indexOf(anchor);
  assert.ok(i > 0, `theme block not found: ${anchor}`);
  return css.slice(i, i + 1800);
};

test('every token Nova paints text with clears 4.5:1, in every theme', () => {
  const failures = [];
  let checked = 0;
  for (const t of THEMES) {
    const block = blockFor(t.anchor);
    const pane = t.white ? [255, 255, 255] : over([255, 255, 255], 0.075, hex(t.ground));
    for (const tok of TEXT_TOKENS) {
      const solid = new RegExp(`--nv-${tok}:\\s*(#[0-9a-f]{6})`, 'i').exec(block);
      const alpha = new RegExp(`--nv-${tok}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)`).exec(block);
      let fg = null;
      if (solid) fg = hex(solid[1]);
      else if (alpha) fg = over([+alpha[1], +alpha[2], +alpha[3]], +alpha[4], pane);
      else continue;                       // a theme may inherit the token
      checked += 1;
      const ratio = contrast(fg, pane);
      if (ratio < 4.5) failures.push(`${t.name} --nv-${tok}: ${Math.round(ratio * 100) / 100}:1`);
    }
  }
  assert.ok(checked >= 30, `expected to check the whole palette, only reached ${checked} tokens`);
  assert.deepEqual(failures, [], `text tokens under 4.5:1:\n  ${failures.join('\n  ')}`);
});

test('the faint tier is readable text, and stays a distinct tier', () => {
  // it exists at all — the bug was that `faint` pointed at a decorative token
  const controls = readFileSync(new URL('../../src/Controls.jsx', import.meta.url), 'utf8');
  assert.match(controls, /faint: 'var\(--nv-ink50\)'/, 'TONES.faint must not point back at --nv-ink40');

  for (const t of THEMES) {
    const block = blockFor(t.anchor);
    const pane = t.white ? [255, 255, 255] : over([255, 255, 255], 0.075, hex(t.ground));
    const read = (tok) => {
      const m = new RegExp(`--nv-${tok}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)`).exec(block);
      return m ? contrast(over([+m[1], +m[2], +m[3]], +m[4], pane), pane) : null;
    };
    const faint = read('ink50');
    const quiet = read('ink60');
    assert.ok(faint >= 4.5, `${t.name}: faint is ${faint}`);
    // three steps, not two painted the same — the ladder is the reason the
    // fix was a new token rather than promoting everything to `quiet`
    assert.ok(quiet > faint, `${t.name}: quiet (${quiet}) must stay clearly above faint (${faint})`);
  }
});

test('no type on Home is below the iOS minimum of 11pt', () => {
  // typography.md › Specifications — "iOS, iPadOS | 17 pt | 11 pt"
  const home = readFileSync(new URL('../../src/screens/MissionStructured.jsx', import.meta.url), 'utf8');
  const tooSmall = [...home.matchAll(/font: `[^`]*?\b(\d+(?:\.\d+)?)px/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n < 11);
  assert.deepEqual(tooSmall, [], `font sizes below 11px: ${tooSmall.join(', ')}`);
});
