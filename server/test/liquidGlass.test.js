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
  // match the class exactly — `nv-liquid-content` is the bar's content wrapper,
  // not a glass surface, and a prefix match counted it as one
  const glass = chrome.match(/className="nv-liquid(?: nv-liquid-flush)?"/g) || [];
  assert.equal(glass.length, 3, `top bar, dock and More sheet — found ${glass.length}`);
  assert.ok(!/backdrop-filter:blur\(26px\)/.test(chrome), 'the old hand-rolled blur is gone, not sitting beside the new one');
});

test('FLUSH glass fades at its edge — iOS draws no line under floating chrome', () => {
  // Anchor on the block's own comment, not on the first `.nv-liquid-flush {`:
  // the reduced-transparency guard declares that selector EARLIER in the file
  // and deliberately restores the border there, so a naive slice reads the
  // guard as a violation of the rule the guard exists to suspend.
  const from = CSS.indexOf('/* FLUSH —');
  const nextSection = CSS.indexOf('/* ====', from);
  const flush = CSS.slice(from, nextSection > 0 ? nextSection : CSS.length);
  assert.ok(from > 0 && flush.includes('.nv-liquid-flush::before'), 'the flush block moved; this test is reading the wrong slice');
  // the hairline this replaced was the exact pattern the skill names
  assert.ok(!/\.nv-liquid-flush::after\s*\{[^}]*border-bottom:\s*1px/.test(flush),
    'a 1px border under a floating bar is a seam; iOS fades instead');
  assert.match(flush, /\.nv-liquid-flush::after\s*\{\s*display:\s*none/);
  // the glass moved to ::before so the mask can reach it without fading the text
  const before = flush.slice(flush.indexOf('.nv-liquid-flush::before'));
  assert.match(before, /backdrop-filter:\s*blur\(var\(--nv-liquid-blur\)\)/, 'still ONE pass, just moved');
  assert.match(before, /bottom:\s*calc\(-1 \* var\(--nv-edge-fade/, 'it has to extend PAST the bar to fade past it');
  assert.match(before, /mask-image:\s*linear-gradient\(to bottom/);
  assert.match(before, /-webkit-mask-image/, 'Safari still needs the prefix');
  // and the element itself must have given its glass up, or there are two
  const el = flush.slice(0, flush.indexOf('.nv-liquid-flush::after'));
  assert.match(el, /backdrop-filter:\s*none/, 'the bar keeps no pass of its own');
});

test('the guards follow the glass when it moves', () => {
  // a fade with no blur behind it is a translucent strip, which is worse than
  // the hairline it replaced — both guards have to square it off
  const nosupport = CSS.slice(CSS.indexOf('@supports not (('));
  assert.match(nosupport.slice(0, nosupport.indexOf('/* 2.')), /\.nv-liquid-flush::before[^}]*mask-image:\s*none/);
  const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-transparency: reduce)'));
  const body = reduced.slice(0, reduced.indexOf('/* 3.'));
  assert.match(body, /\.nv-liquid-flush::before\s*\{\s*display:\s*none/, 'no fade when he asked for no transparency');
  assert.match(body, /\.nv-liquid-flush::after\s*\{[^}]*border-bottom/, 'and the honest separator comes back');
});
