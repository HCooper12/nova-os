// FINDING 15 OF THE 22 SEP AESTHETIC REVIEW — "Fuel's hero ring is solid at
// zero where Home's is dashed".
//
// Four claims were fixed on the Fuel screen, and each one is the kind a later
// refactor undoes without noticing:
//   1. the hero ring draws RingTile's dashed gap when there is nothing to
//      draw, never a solid dim circle at 0 of 150;
//   2. the label/value table beside it ("Calories 0 / 2,200", "Carbs · Fat
//      0C · 0F") is geometry now — three concentric arcs in the three fixed
//      macro hues, protein cyan outermost, then carbs gold, then fat violet;
//   3. a macro with no target draws NO arc, rather than a zero arc against a
//      denominator nobody set;
//   4. the rotation header is an Eyebrow and real controls, not the
//      instruction manual it used to read as.
//
// Like foodLogSurface.test.js this reads the two sources as text and is NOT
// comment-stripped — the `/*` inside `accept="image/*"` eats the rest of the
// file if you try. So every assertion anchors on CODE (a prop, a style
// string, an expression), and every negative assertion is sliced tight enough
// that a comment mentioning the old string cannot satisfy it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const SCREEN = readFileSync(root('src/screens/Recipes.jsx'), 'utf8');
const VALS = readFileSync(root('src/vals/valsRecipes.js'), 'utf8');

const ringsFn = () => {
  const at = SCREEN.indexOf('function MacroRings');
  assert.ok(at > 0, 'the hero ring component is gone');
  return SCREEN.slice(at, SCREEN.indexOf('\n}', at));
};

test('a gap is a dashed ring, in RingTile\'s own pattern and tone', () => {
  const ring = ringsFn();
  assert.match(ring, /m\.state === 'absent' \? \(/, 'the ring must have an absent state at all');
  assert.match(ring, /strokeDasharray="3 5"/, 'the same dash RingTile draws a hole with');
  assert.match(ring, /stroke=\{GAP_TONE\}/, 'and the same tone, not a dimmed macro hue');
  assert.match(SCREEN, /const GAP_TONE = 'color-mix\(in srgb, var\(--nv-ink\) 28%, transparent\)'/,
    'RingTile.TONE.absent, copied exactly — two rings, one voice for "no data"');
  // and the val must be able to produce it
  assert.match(VALS, /return eaten > 0 \? 'arc' : 'absent';/,
    'a target with nothing against it is a gap, never a solid ring at zero');
});

test('the three macro hues are in the ring, protein cyan then carbs gold then fat violet', () => {
  const at = VALS.indexOf("macro('p', 'Protein'");
  assert.ok(at > 0, 'the macro list is gone');
  const list = VALS.slice(at, VALS.indexOf('],', at));
  const cy = list.indexOf('var(--nv-cy)');
  const gold = list.indexOf('var(--nv-gold)');
  const vi = list.indexOf('var(--nv-vi)');
  assert.ok(cy > -1 && gold > -1 && vi > -1, 'all three hues must be named');
  assert.ok(cy < gold && gold < vi, 'the list order IS the drawing order, outermost first');
  assert.match(list, /'Protein', 'var\(--nv-cy\)'/);
  assert.match(list, /'Carbs', 'var\(--nv-gold\)'/);
  assert.match(list, /'Fat', 'var\(--nv-vi\)'/);
  // the screen draws them in that order, outermost radius first
  assert.match(SCREEN, /const RING_GEO = \[\{ r: (\d+), w: 9 \}, \{ r: (\d+)/, 'three radii, largest first');
  assert.match(ringsFn(), /hero\.macros\.map\(\(m, i\) => \{/, 'and pairs macro i with radius i');
  assert.match(ringsFn(), /stroke=\{m\.hue\}/, 'each arc wears its own macro hue');
});

test('a macro with no target draws no arc at all — not a zero arc', () => {
  // the guard, in the val…
  assert.match(VALS, /if \(!\(target > 0\)\) return hero \? 'absent' : 'none';/,
    'no denominator means no arc; only the hero ring, which owns a track, degrades to a gap');
  assert.match(VALS, /const carbTarget = profile\?\.carbTargetG \?\? null;/,
    'his profile carries no carb target — read the key, never derive one from the kcal remainder');
  assert.match(VALS, /const fatTarget = profile\?\.fatTargetG \?\? null;/);
  // …and the screen honours it
  const ring = ringsFn();
  assert.match(ring, /if \(m\.state === 'none'\) return null;/, 'no arc, no track, nothing');
  assert.match(ring, /const drawn = hero\.macros\.filter\(\(m\) => m\.state !== 'none'\)/,
    'and the label must not announce an arc that was never drawn');
});

test('the calories are the one figure in the middle, in the serif face', () => {
  const ring = ringsFn();
  assert.match(ring, /var\(--nv-font-serif\)/, 'the news line face, per §2b r2');
  assert.match(ring, /hero\.kcal\.toLocaleString\(\)/);
  assert.match(ring, /animation: 'nvArcIn 1s/, 'an arc that replaces the gap must grow in, not appear finished (rec.mjs caught this)');
  assert.match(readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8'), /@keyframes nvArcIn \{ from \{ stroke-dashoffset: var\(--nv-arc-full\); \} \}/);
  assert.match(ring, /\|\| hero\.kcal > 0 \? hero\.kcal\.toLocaleString\(\) : '—'/, 'nothing logged is a dash in the centre, not a zero');
  assert.match(ring, /font-variant-numeric:tabular-nums/, 'digits that do not dance as the day climbs');
  assert.match(ring, /<Meta tone="faint"[\s\S]*?of \$\{hero\.kcalTarget\.toLocaleString\(\)\}/,
    'the target is a Meta beneath it, through Controls.jsx');
});

test('the label/value table beside the ring is gone', () => {
  assert.ok(!/Carbs<\/span> · <span/.test(SCREEN), 'the "Carbs · Fat" label row is gone');
  assert.ok(!/\{v\.fuelHero\.c\}C<\/span>/.test(SCREEN), 'and so is its "0C · 0F" value');
  assert.ok(!/<span style=\{css\("color:var\(--nv-good\)"\)\}>Calories<\/span>/.test(SCREEN),
    'calories are in the ring now, not a row in a two-line table');
  assert.match(SCREEN, /<MacroRings hero=\{v\.fuelHero\} \/>/, 'the ring replaced it');
  assert.match(SCREEN, /<MacroLegend hero=\{v\.fuelHero\} \/>/, 'with the names and figures as a legend under it');
  const at = SCREEN.indexOf('function MacroLegend');
  const legend = SCREEN.slice(at, SCREEN.indexOf('\n}', at));
  assert.match(legend, /tone=\{m\.hue\}/, 'each name in its own hue');
  assert.match(legend, /: '—'/, 'a macro with nothing to report reads a dash, never a zero');
});

test('the cross-check card draws its two numbers and demotes the prose', () => {
  assert.match(VALS, /bars: crossBars\(f\.data, f\.metric\)/, 'the pair comes from the finding\'s own data, not a parse of its prose');
  assert.match(VALS, /'kcal-split': \(d\) => \(\{ unit: 'kcal'/, 'the 2,668-vs-2,065 case');
  const at = SCREEN.indexOf('function CrossBars');
  const bars = SCREEN.slice(at, SCREEN.indexOf('\n}', at));
  assert.match(bars, /width: pc\(r\.value\)/, 'two bars off one baseline');
  assert.match(bars, /bars\.gap\.toLocaleString\(\)/);
  assert.match(bars, /var\(--nv-font-serif\)/, 'the gap is the serif figure');
  assert.match(bars, /severity === 'high' \? 'var\(--nv-warn\)'/, 'colour means something: the severity');
  assert.match(SCREEN, /font: `400 12\.5px\/1\.5 var\(--nv-font-ui\)`, color: 'var\(--nv-ink60\)'/,
    'the prose is demoted beneath, at 12.5px in ink60');
  // the peer's tap-target fix on this card's action must survive
  assert.match(SCREEN, /min-height:32px;margin-top:5px;padding:6px 10px 6px 0/,
    'the Draft-the-fix target keeps the height and padding it was given on 23 Sep');
});

test('the rotation header is an Eyebrow and real controls, not an instruction manual', () => {
  // code-anchored, both of them: the label lived inside an Eyebrow, and a
  // comment about it must not be able to satisfy either assertion
  assert.ok(!/<Eyebrow as="span">Today's rotation — tap to eat/.test(SCREEN),
    'the manual label is gone');
  assert.ok(!/‹ › to switch · hold for more<\/Eyebrow>/.test(SCREEN), 'in any case');
  assert.match(SCREEN, /<Eyebrow as="span">Today's rotation<\/Eyebrow>/, 'a short heading, sentence case');
  const at = SCREEN.indexOf("<Eyebrow as=\"span\">Today's rotation</Eyebrow>");
  const head = SCREEN.slice(at, at + 700);
  assert.match(head, /<TextAction compact tone="accent" ariaLabel="Scroll the rotation back"/,
    'the arrows are house controls with real labels, through Controls.jsx');
  assert.match(head, /onClick=\{\(\) => nudgeRotation\(1\)\}/, 'and they do something');
  assert.match(SCREEN, /const rotationRail = useRef\(null\)/, 'a ref, not new state');
  assert.match(SCREEN, /behavior: reduced \? 'auto' : 'smooth'/, 'reduced motion is honoured');
  assert.match(SCREEN, /<div ref=\{rotationRail\}/, 'and the rail is what moves');
});
