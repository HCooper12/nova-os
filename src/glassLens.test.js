import test from 'node:test';
import assert from 'node:assert/strict';
import { bendProfile, bandOf, lensMaps, canRefract, SPECTRUM } from './glassLens.js';

const grey = (map, w, x, y) => map[(y * w + x) * 4];

test('the bend is strongest at the rim and gone at the band\'s inner edge', () => {
  assert.equal(bendProfile(0), 0);
  assert.ok(Math.abs(bendProfile(1) - 1) < 1e-9);
  let last = 0;
  for (let s = 0.05; s <= 1; s += 0.05) { const v = bendProfile(s); assert.ok(v > last); last = v; }
  // arrives flat: the first step in is tiny next to the last
  assert.ok(bendProfile(0.05) < 0.01);
});

test('the band is three tenths of the short side, 36px at most', () => {
  assert.equal(bandOf(300, 60), 18);
  assert.equal(bandOf(400, 800), 36);
});

test('the middle of the glass is left alone and the rim pulls from further in', () => {
  const w = 300; const h = 60;
  const { across, down } = lensMaps(w, h, 30);
  assert.equal(grey(across, w, 150, 30), 128);
  assert.equal(grey(down, w, 150, 30), 128);
  // top edge, mid-bar: pulls down (from inside), not sideways
  assert.ok(grey(down, w, 150, 0) > 200);
  assert.equal(grey(across, w, 150, 0), 128);
  // bottom edge pulls up
  assert.ok(grey(down, w, 150, h - 1) < 56);
  // right cap draws from its left (inside): a darker grey; left cap the reverse
  assert.ok(grey(across, w, w - 1, 30) < 56);
  assert.ok(grey(across, w, 0, 30) > 200);
  // maps are opaque greys: Chrome colour-manages colour, never grey
  for (let i = 0; i < across.length; i += 4) {
    assert.equal(across[i], across[i + 1]); assert.equal(across[i], across[i + 2]); assert.equal(across[i + 3], 255);
  }
});

test('red bends furthest, blue least', () => {
  assert.ok(SPECTRUM[0] > SPECTRUM[1] && SPECTRUM[1] > SPECTRUM[2]);
});

test('WebKit, and any OS request for less, gets nothing at all', () => {
  const win = (ua, matches = () => false) => ({ navigator: { userAgent: ua }, document: {}, matchMedia: (q) => ({ matches: matches(q) }), CSS: { supports: () => true } });
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1';
  const iosChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
  assert.equal(canRefract(win(iphone)), false);
  assert.equal(canRefract(win(iosChrome)), false);
  assert.equal(canRefract(win(mac)), true);
  assert.equal(canRefract(win(mac, (q) => q.includes('reduced-transparency'))), false);
  assert.equal(canRefract(win(mac, (q) => q.includes('reduced-motion'))), false);
  assert.equal(canRefract(null), false);
});
