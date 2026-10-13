import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getGlow, getGlowQuiet, applyGlow, getMaterial, NOVA_MATERIALS, NOVA_GLOWS } from '../../src/theme.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
function withStore(init, fn) {
  const store = new Map(Object.entries(init));
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const attrs = new Map();
  globalThis.document = { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) } };
  try { return fn(store, attrs); } finally { delete globalThis.localStorage; delete globalThis.document; }
}

test('Lit leaves Material and becomes the glow: a stored lit reads as glass with its own colours', () => {
  assert.deepEqual(NOVA_MATERIALS.map((m) => m.value), ['glass', 'solid']);
  assert.deepEqual(NOVA_GLOWS.map((g) => g.value), ['off', 'soft', 'lit', 'dyn']);
  withStore({ 'novaos.material': 'lit' }, () => {
    assert.equal(getMaterial(), 'glass');
    assert.equal(getGlow(), 'dyn');
  });
  withStore({ 'novaos.material': 'glass' }, () => assert.equal(getGlow(), 'off', 'no glow before means no glow now'));
  withStore({ 'novaos.material': 'lit', 'novaos.glow': 'soft' }, () => assert.equal(getGlow(), 'soft', 'his choice wins once made'));
});

test('the two quieter switches are on by default and stamp the root', () => {
  withStore({}, (store, attrs) => {
    assert.deepEqual(getGlowQuiet(), { session: true, back: true });
    applyGlow('dyn', { session: true, back: false });
    assert.equal(attrs.get('data-nv-glow'), 'dyn');
    assert.equal(attrs.get('data-nv-glow-session'), 'quiet');
    assert.equal(attrs.has('data-nv-glow-back'), false);
    assert.deepEqual(JSON.parse(store.get('novaos.glowQuiet')), { session: true, back: false });
    assert.equal(store.get('novaos.glow'), 'dyn');
  });
});

test('the CSS: soft for a session and the background cards, never for a link; calm drops every bloom', () => {
  const css = read('src/index.css');
  assert.match(css, /\[data-nv-glow-session="quiet"\] \.nv-ss \.nv-sum-card \{/);
  assert.match(css, /\[data-nv-glow-back="quiet"\] \.nv-sum-card\[data-gr="back"\],/);
  assert.match(css, /\.nv-sum-card\[data-gr="link"\] \{\n  --nv-sum-bloom: 0 0 0 0 rgba\(0,0,0,0\);/);
  assert.match(css, /\[data-nv-calm="1"\] \.nv-sum-card \{ --nv-sum-bloom: 0 0 0 0 rgba\(0,0,0,0\) !important; \}/);
  assert.ok(!/data-nv-material="lit"\] \.nv-sum-card/.test(css), 'no card rule keys off the old material');
  const main = read('src/main.jsx');
  const at = (x) => main.indexOf(x);
  assert.ok(at('const glow = getGlow()') >= 0 && at('const glow = getGlow()') < at('applyAppearance(getNovaTheme()') && at('applyAppearance(getNovaTheme()') < at('applyGlow(glow, getGlowQuiet())'), 'read before the material is re-saved, stamped before first paint');
});
