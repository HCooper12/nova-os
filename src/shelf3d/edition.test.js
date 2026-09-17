// The two rules that must never quietly break: no art is ever distorted, and
// a spine always says something. Both are pure arithmetic, so both are pinned
// here in node, without three, without a browser.
//
//   node --test src/shelf3d/edition.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  editionFor, plateRect, paletteFromImageData, clipAtWordBoundary,
  hexToHsl, PLATE_MARGIN, contrastRatio, ensureContrast, safeTint, mixHex,
  FOIL_MIN_CONTRAST,
} from './edition.js';

const row = (over = {}) => ({ id: 'Wiki/Sources/Atomic Habits (Clear)', title: 'Atomic habits', author: 'James Clear', kind: 'book', ...over });

test('kind decides the proportions', () => {
  const book = editionFor(row());
  const video = editionFor(row({ id: 'v1', kind: 'video' }));
  const article = editionFor(row({ id: 'a1', kind: 'article' }));

  // a book is a book: taller than wide, and thicker than a pamphlet
  assert.ok(book.height > book.width, 'a book stands taller than it is wide');
  assert.ok(book.depth > article.depth * 1.5, 'an article is the slim one');
  // a video volume is a case: wider for its height than a novel
  assert.ok(video.width / video.height > book.width / book.height);
  assert.ok(video.height < book.height);
  // metres, in the range the shelf is built for
  for (const e of [book, video, article]) {
    assert.ok(e.height > 0.18 && e.height < 0.26, `height ${e.height}`);
    assert.ok(e.depth > 0.008 && e.depth < 0.045, `depth ${e.depth}`);
  }
});

test('an article is paper-bound: no plate, ever', () => {
  const a = editionFor(row({ id: 'a1', kind: 'article' }), { artAspect: 16 / 9 });
  assert.equal(a.plate, null);
});

test('a plate preserves the image aspect within 1% and keeps its cloth margin', () => {
  for (const [label, aspect] of [['16:9', 16 / 9], ['4:3', 4 / 3], ['2:3', 2 / 3]]) {
    for (const kind of ['video', 'podcast', 'book']) {
      const e = editionFor(row({ id: `${kind}-${label}`, kind }), { artAspect: aspect });
      assert.ok(e.plate, `${kind} ${label} should have a plate`);
      if (e.plate.fullBleed) {
        // the jacket case: the BOARD took the art's shape, so edge-to-edge
        // is still an exact fit. Only a book may do this.
        assert.equal(kind, 'book');
        const err = Math.abs(e.boardAspect - aspect) / aspect;
        assert.ok(err < 0.01, `${kind} ${label} board aspect off by ${(err * 100).toFixed(2)}%`);
        continue;
      }
      const physical = (e.plate.w * e.width) / (e.plate.h * e.height);
      const err = Math.abs(physical - aspect) / aspect;
      assert.ok(err < 0.01, `${kind} ${label} plate aspect off by ${(err * 100).toFixed(2)}%`);

      const margins = [e.plate.x, e.plate.y, 1 - e.plate.x - e.plate.w, 1 - e.plate.y - e.plate.h];
      for (const m of margins) {
        assert.ok(m >= PLATE_MARGIN - 1e-9, `${kind} ${label} margin ${m} below ${PLATE_MARGIN}`);
      }
    }
  }
});

test('plateRect never overflows the board', () => {
  for (const a of [0.2, 0.5, 1, 1.9, 3.4]) {
    for (const board of [0.55, 0.667, 0.814]) {
      const p = plateRect(a, board);
      assert.ok(p.w > 0 && p.h > 0);
      assert.ok(p.x >= PLATE_MARGIN - 1e-9 && p.x + p.w <= 1 - PLATE_MARGIN + 1e-9);
      assert.ok(p.y >= PLATE_MARGIN - 1e-9 && p.y + p.h <= 1 - PLATE_MARGIN + 1e-9);
    }
  }
});

test('colours are deterministic from the id, and differ between sources', () => {
  const a1 = editionFor(row({ id: 'source-one' }));
  const a2 = editionFor(row({ id: 'source-one', title: 'a different title' }));
  assert.equal(a1.cloth, a2.cloth, 'the id decides, not the title');
  assert.equal(a1.foil, a2.foil);
  assert.equal(a1.accent, a2.accent);
  const b = editionFor(row({ id: 'source-two' }));
  assert.notEqual(a1.cloth, b.cloth);
  // the house band: cloth is dark enough to be bookcloth, foil light enough
  // to read as metal against it
  assert.ok(hexToHsl(a1.cloth).l < 0.32);
  assert.ok(hexToHsl(a1.foil).l > 0.6);
});

test('a real palette moves the colours off the hash', () => {
  const plain = editionFor(row({ id: 'x' }));
  const tinted = editionFor(row({ id: 'x' }), { palette: ['#c8402a', '#f0d8a0', '#22304a'] });
  assert.notEqual(plain.cloth, tinted.cloth);
  assert.ok(hexToHsl(tinted.cloth).l < 0.32, 'the dominant colour is darkened into cloth');
  assert.ok(hexToHsl(tinted.foil).l > 0.6, 'foil stays light');
});

test('paletteFromImageData buckets hues and is deterministic', () => {
  const w = 8, h = 8;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const red = i % 3 !== 0;
    data[i * 4] = red ? 200 : 40;
    data[i * 4 + 1] = red ? 40 : 90;
    data[i * 4 + 2] = red ? 40 : 200;
    data[i * 4 + 3] = 255;
  }
  const a = paletteFromImageData(data, w, h);
  const b = paletteFromImageData(data, w, h);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 1 && a.length <= 3);
  for (const c of a) assert.match(c, /^#[0-9a-f]{6}$/);
  assert.equal(paletteFromImageData(null, 0, 0).length, 0);
});

test('a spine always says something', () => {
  for (const kind of ['book', 'video', 'podcast', 'article']) {
    const e = editionFor({ id: `k-${kind}`, title: '', author: '', kind });
    assert.ok(e.spineTitle.length > 0, `${kind} spine title empty`);
    assert.ok(e.spineFoot.length > 0, `${kind} spine foot empty`);
    assert.ok(e.mark.length > 0);
  }
  const unknown = editionFor({ id: 'z', title: 'Something', kind: 'newsletter' });
  assert.equal(unknown.kind, 'article');
  assert.equal(unknown.spineTitle, 'Something');
});

test('a long title clips at a word boundary, with an ellipsis', () => {
  const long = 'Disarming Disrespect The Silence-Repeat-Question Playbook (Jefferson Fisher)';
  const out = clipAtWordBoundary(long, 30);
  assert.ok(out.length <= 30, `"${out}" is ${out.length} long`);
  assert.ok(out.endsWith('…'));
  assert.ok(!out.includes('  '));
  // the cut landed on a boundary: what is left is a prefix of whole words
  const words = out.slice(0, -1).trim();
  assert.ok(long.startsWith(words), `"${words}" is not a word-prefix of the title`);

  assert.equal(clipAtWordBoundary('Short', 30), 'Short');
  assert.equal(clipAtWordBoundary('', 30), '');
  // one unbroken word still has to be cut somewhere, and still says so
  const runOn = clipAtWordBoundary('Supercalifragilisticexpialidocious', 12);
  assert.ok(runOn.endsWith('…') && runOn.length <= 12);
});

test('foil always clears the contrast floor on its own cloth', () => {
  // the p2 fault: foil and cloth both derive from ONE dominant hue, so they
  // can land a few percent apart and the title stops being type
  const palettes = [
    ['#6b4a33', '#c9a227', '#2b1d14'],   // the brown that made it muddy
    ['#8c2f2f', '#e8e8e8', '#222222'],
    ['#6f7a3a', '#d9d2b0', '#333333'],
    ['#101010', '#141414', '#0a0a0a'],   // a near-black poster
    ['#f2f2f2', '#eeeeee', '#fafafa'],   // a near-white poster
  ];
  for (const palette of palettes) {
    for (const kind of ['book', 'video', 'article']) {
      const e = editionFor(row({ id: `c-${kind}-${palette[0]}`, kind }), { palette });
      const r = contrastRatio(e.foil, e.cloth);
      assert.ok(r >= FOIL_MIN_CONTRAST, `${kind} ${palette[0]}: foil ${e.foil} on cloth ${e.cloth} is ${r.toFixed(2)}:1`);
    }
  }
  // and with no art at all, across a spread of ids
  for (let i = 0; i < 40; i++) {
    const e = editionFor(row({ id: `hash-${i}`, kind: i % 3 === 0 ? 'article' : 'video' }));
    assert.ok(contrastRatio(e.foil, e.cloth) >= FOIL_MIN_CONTRAST, `hash-${i}`);
  }
});

test('ensureContrast keeps the hue and only moves the light', () => {
  const out = ensureContrast('#3a3630', '#332f2a', 3);
  assert.ok(contrastRatio(out, '#332f2a') >= 3);
  // a hue that genuinely cannot clear it still returns something readable
  const extreme = ensureContrast('#808080', '#808080', 7);
  assert.ok(contrastRatio(extreme, '#808080') >= 3, 'no silent failure');
});

test('contrastRatio matches the known anchors', () => {
  assert.equal(Math.round(contrastRatio('#ffffff', '#000000')), 21);
  assert.equal(Math.round(contrastRatio('#ffffff', '#ffffff')), 1);
});

test('safeTint clamps the page tint until it reads on the pane', () => {
  // command: --nv-acc #59e6ff on the --nv-bg1 pane #0a0f1e
  const bright = safeTint('#59e6ff', '#dbb643', '#0a0f1e');
  assert.equal(bright.pct, 35, 'a light tint gets the full mix');
  assert.ok(contrastRatio(bright.colour, '#0a0f1e') >= 4.5);

  // a volume bound in near-black cloth must not drag the accent under the bar
  const dark = safeTint('#59e6ff', '#0b0b0c', '#0a0f1e');
  assert.ok(contrastRatio(dark.colour, '#0a0f1e') >= 4.5, 'clamped, not dimmed through the floor');
  assert.ok(dark.pct <= 35);

  // daylight: dark accent on a white pane
  const day = safeTint('#0060df', '#f0e0a0', '#ffffff');
  assert.ok(contrastRatio(day.colour, '#ffffff') >= 4.5);

  // a tint that would wash the accent into the pane is backed off until it
  // reads — and the last resort is the untinted base, never a failing colour
  const washy = safeTint('#0060df', '#ffffff', '#ffffff');
  assert.ok(washy.pct < 35, `backed off to ${washy.pct}%`);
  assert.ok(contrastRatio(washy.colour, '#ffffff') >= 4.5);
  const impossible = safeTint('#8a8a8a', '#8a8a8a', '#ffffff');
  assert.equal(impossible.pct, 0);
  assert.equal(impossible.colour, '#8a8a8a');
});

test('mixHex is a plain srgb mix', () => {
  assert.equal(mixHex('#ffffff', '#000000', 100), '#ffffff');
  assert.equal(mixHex('#ffffff', '#000000', 0), '#000000');
  assert.equal(mixHex('#ffffff', '#000000', 50), '#808080');
});
