// TRACKING IS SIZE-SPECIFIC AND STYLE-SPECIFIC.
//
// From *The Details of UI Typography* (WWDC 2020), via the apple-design skill:
// "Tracking is size-specific — never one value for all sizes. Large display
// text wants NEGATIVE tracking; letters read too far apart as they grow."
//
// Measured in the running app on 16 Sep 2026: every screen header was +.02em
// at 28-30px — loosening the largest text in the app, the opposite of what it
// wants. Under Command that is deliberate (wide tracking IS the HUD look), so
// the answer differs per style and therefore has to be a token, exactly like
// --nv-micro-track. Verified live at 30px: cupertino -0.6px, command +0.6px.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const CSS = readFileSync(root('src/index.css'), 'utf8');
const SCREENS = root('src/screens');

test('the token exists and points opposite ways in the two design languages', () => {
  assert.match(CSS, /--nv-display-track:\.02em/, 'Command keeps its wide HUD tracking');
  const apple = CSS.slice(CSS.indexOf(':root[data-nv-style="apple"], :root[data-nv-style="cupertino"] {'));
  const block = apple.slice(0, apple.indexOf('}'));
  assert.match(block, /--nv-display-track:-\.02em/, 'the Apple styles must TIGHTEN large type, not loosen it');
});

test('no screen header hardcodes a positive tracking at display size', () => {
  const offenders = [];
  for (const f of readdirSync(SCREENS).filter((n) => n.endsWith('.jsx'))) {
    const src = readFileSync(join(SCREENS, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/font:[^;"'`]*?(\d+(?:\.\d+)?)px[^;"'`]*?;letter-spacing:(\.0\d+em)/g)) {
      // The rule is about large PROSE. Monospace here means tabular numerals —
      // a clock face or a counter — where the glyphs are already fixed-width
      // and tightening cramps them. A principled exemption, matched on the
      // FACE rather than a filename, so it cannot quietly cover prose too.
      if (/font-mono/.test(m[0]) || /\$\{M\}/.test(m[0])) continue;
      if (Number(m[1]) >= 22) offenders.push(`${f}: ${m[1]}px ${m[2]}`);
    }
  }
  assert.deepEqual(offenders, [], 'these loosen the largest text in the app instead of tightening it');
});

test('the headers actually read the token', () => {
  let n = 0;
  for (const f of readdirSync(SCREENS).filter((x) => x.endsWith('.jsx'))) {
    n += (readFileSync(join(SCREENS, f), 'utf8').match(/letter-spacing:var\(--nv-display-track\)/g) || []).length;
  }
  assert.ok(n >= 15, `only ${n} headers on the token — the swap was partial`);
});

test('THE UNIT TRAP is written down where the next person will hit it', () => {
  const note = CSS.slice(CSS.indexOf('DISPLAY TRACKING'), CSS.indexOf('--nv-display-track:.02em'));
  assert.match(note, /INHERITS/i, 'letter-spacing in em computes to an absolute length and inherits as one');
  // a 27px serif span inside a 30px header inherits the PARENT's px, so its em
  // tracking is larger than intended — measured at .0222em against .02em
  assert.match(note, /27px|\.0222/, 'the measurement that proves it belongs with the rule');
});
