// THE GLASS MATERIAL'S CONTRACT.
//
// The finding this suite exists to protect was measured in Safari 26.5.2 on
// 16 Sep 2026 — the same WebKit his iPhone runs — not read in a blog post:
//
//   CSS.supports('backdrop-filter', 'url(#anything)')  →  true
//   what it actually renders                           →  NOTHING
//   and a url() anywhere in the list voids the WHOLE filter, blur included.
//
// So the recipe every "liquid glass on the web" article gives (blur plus an
// feDisplacementMap for refraction) does not merely fail to refract on his
// phone: it removes the blur too and leaves a flat tinted box. It looks
// perfect in Chrome, which is exactly why a future session would ship it.
// Test one is the guard. It is written against the SOURCE, not a snapshot,
// so it catches the reintroduction wherever it lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname — the repo lives under a path with a space in it
const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const SOURCES = walk(SRC).filter((p) => /\.(jsx?|css)$/.test(p));

// Comments are stripped before scanning, deliberately: the block comment above
// the material in index.css NAMES the forbidden declaration, because a rule
// nobody can read the reason for is a rule the next session deletes.
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('NO url() in any backdrop-filter, anywhere in the app', () => {
  // matches both spellings and both the CSS property and the React camelCase
  const re = /(?:-webkit-)?backdrop-?[fF]ilter\s*:\s*([^;'"`}]*)/g;
  const offenders = [];
  for (const file of SOURCES) {
    const text = code(readFileSync(file, 'utf8'));
    for (const m of text.matchAll(re)) {
      if (m[1].includes('url(')) offenders.push(`${file.replace(SRC, 'src/')}: ${m[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, [], 'a url() filter here renders nothing in Safari AND voids the blur beside it');
});

test('the material declares both spellings — Safari still needs the prefix', () => {
  const block = CSS.slice(CSS.indexOf('.nv-liquid {'), CSS.indexOf('.nv-liquid::after'));
  assert.match(block, /-webkit-backdrop-filter:\s*blur\(/);
  assert.match(block, /[^-]backdrop-filter:\s*blur\(/);
  // and the rim's mask, whose -webkit- keyword is `xor` where the standard is `exclude`
  const rim = CSS.slice(CSS.indexOf('.nv-liquid::after'), CSS.indexOf('/* CLEAR'));
  assert.match(rim, /-webkit-mask-composite:\s*xor/);
  assert.match(rim, /[^-]mask-composite:\s*exclude/);
});

test('every --nv-liquid-* token the material reads is defined', () => {
  const defined = new Set([...CSS.matchAll(/(--nv-liquid-[a-z-]+)\s*:/g)].map((m) => m[1]));
  const read = new Set([...CSS.matchAll(/var\((--nv-liquid-[a-z-]+)/g)].map((m) => m[1]));
  // --nv-liquid-radius and --nv-liquid-hue are supplied per element by
  // LiquidGlass.jsx and read with a fallback, so they need no :root value
  const supplied = new Set(['--nv-liquid-radius', '--nv-liquid-hue']);
  const missing = [...read].filter((t) => !defined.has(t) && !supplied.has(t));
  assert.deepEqual(missing, [], 'a token read but never defined resolves to nothing and drops the declaration');
});

test('the supplied-inline tokens are always read WITH a fallback', () => {
  for (const t of ['--nv-liquid-radius', '--nv-liquid-hue']) {
    for (const m of CSS.matchAll(new RegExp(`var\\(${t}([^)]*)\\)`, 'g'))) {
      assert.ok(m[1].trim().startsWith(','), `${t} is read with no fallback — an element that omits it loses the whole declaration`);
    }
  }
});

test('glass degrades to an OPAQUE surface, never to a see-through one', () => {
  // the three cases where the material cannot or should not be glass
  for (const guard of [
    '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))',
    '@media (prefers-reduced-transparency: reduce)',
    '@media (prefers-contrast: more)',
  ]) assert.ok(CSS.includes(guard), `${guard} is not handled`);

  const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-transparency: reduce)'));
  const body = reduced.slice(0, reduced.indexOf('/* 3.'));
  assert.match(body, /backdrop-filter:\s*none/, 'reduced transparency must actually drop the blur');
  assert.match(body, /background:\s*var\(--nv-liquid-solid\)/, 'and land on a solid surface');
});

test('the light theme does not wear the dark theme\'s specular', () => {
  const daylight = CSS.slice(CSS.indexOf(':root[data-nv-theme="daylight"] {\n  --nv-liquid-blur'));
  const block = daylight.slice(0, daylight.indexOf('}'));
  for (const t of ['--nv-liquid-tint', '--nv-liquid-sheen', '--nv-liquid-spec', '--nv-liquid-rim', '--nv-liquid-drop']) {
    assert.ok(block.includes(t), `daylight inherits ${t} from the dark ground — a white hairline on a white card is invisible`);
  }
});

test('Calm keeps the depth and drops only the bloom, as it does everywhere else', () => {
  const calm = CSS.slice(CSS.indexOf(':root[data-nv-calm="1"] .nv-liquid'));
  const block = calm.slice(0, calm.indexOf('}'));
  assert.match(block, /--nv-liquid-glow:\s*inset 0 0 0 0/, 'a literal `none` in a comma-separated shadow list voids the whole rule');
  assert.ok(!block.includes('--nv-liquid-drop'), 'Calm has never meant flattening a surface out of the stack');
});

test('the surfaces he actually looks at wear it', () => {
  const chrome = readFileSync(join(SRC, 'MobileChrome.jsx'), 'utf8');
  // `nv-liquid` as a WHOLE class name, so modifiers (nv-liquid-thick,
  // nv-materialize) still count and `nv-liquid-content` — the bar's content
  // wrapper, not a surface — does not. Listing the allowed modifiers instead
  // meant every new one broke this test, which is a test measuring the wrong
  // thing.
  const glass = chrome.match(/className="nv-liquid(?![-\w])/g) || [];
  assert.equal(glass.length, 3, `top bar, dock and More sheet — found ${glass.length}`);
  assert.ok(!/backdrop-filter:blur\(26px\)/.test(chrome), 'the old hand-rolled blur is gone, not sitting beside the new one');
});

// The two tests that were here asserted the scroll-edge fade on the top bar.
// It was attempted twice (a ::before at z-index -1, then at 0 with a content
// wrapper) and broke the bar on his phone both times — blurred text, then no
// taps at all — with neither reproducible on macOS. The feature is reverted,
// so the assertions go with it rather than sitting here testing an intention.
// chromeGeometry.test.js now asserts the ABSENCE of that layer instead, which
// is the thing actually worth holding.

test('MATERIAL WEIGHT: a big surface reads thicker than a small one', () => {
  // "Bigger surfaces should read as thicker: stronger blur + a deeper shadow
  // than small chips." One blur for every size is why nothing had any relative
  // depth. The variants must genuinely differ in both, not just in name.
  const pick = (cls) => {
    const at = CSS.indexOf(`.${cls} {`);
    return CSS.slice(at, CSS.indexOf('}', at));
  };
  const thin = pick('nv-liquid-thin'), thick = pick('nv-liquid-thick');
  const blur = (b) => Number((b.match(/--nv-liquid-blur:\s*(\d+)px/) || [])[1]);
  assert.ok(blur(thin) < 20 && blur(thick) > 20, `thin ${blur(thin)} / default 20 / thick ${blur(thick)}`);
  assert.match(thin, /--nv-liquid-drop/, 'thickness is blur AND shadow, or it is only a blur');
  assert.match(thick, /--nv-liquid-drop/);
});

test('VIBRANCY: text on glass is not the same flat grey as on solid ground', () => {
  // "Over blurred/translucent surfaces, don't use flat gray text — use higher
  // contrast." Redefining the tokens INSIDE the material fixes every call site
  // at once and changes nothing off glass.
  const at = CSS.indexOf('.nv-liquid {\n  --nv-ink60');
  assert.ok(at > 0, 'the material does not lift its ink at all');
  const block = CSS.slice(at, CSS.indexOf('}', at));
  assert.match(block, /--nv-ink60:\s*color-mix/);
  assert.match(block, /--nv-ink40:\s*color-mix/);
  // and it must be LIFTED, not just restated
  const pct = [...block.matchAll(/var\(--nv-ink\) (\d+)%/g)].map((m) => Number(m[1]));
  assert.ok(pct[0] > 62, `--nv-ink60 on glass is ${pct[0]}%, no higher than the 62% off it`);
  assert.ok(pct[1] > 38, `--nv-ink40 on glass is ${pct[1]}%, no higher than the 38% off it`);
});

test('MATERIALIZE: the blur arrives with the surface, and stops for reduced motion', () => {
  const kf = CSS.slice(CSS.indexOf('@keyframes nvMaterialize'));
  const block = kf.slice(0, kf.indexOf('\n}'));
  assert.match(block, /-webkit-backdrop-filter: blur\(0px\)/, 'Safari still needs the prefix, in keyframes too');
  assert.match(block, /backdrop-filter: blur\(var\(--nv-liquid-blur\)\)/, 'it must land on the surface\'s OWN blur');
  const after = CSS.slice(CSS.indexOf('.nv-materialize {'));
  assert.match(after, /prefers-reduced-motion: reduce\) \{ \.nv-materialize \{ animation: none/);
  assert.match(after, /prefers-reduced-transparency: reduce\) \{ \.nv-materialize \{ animation: none/,
    'with no transparency there is no material to arrive');
});
