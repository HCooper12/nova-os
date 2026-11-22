// A MENTOR'S COLOURS, BY RULE (mockup 125 A, tone "Colour on top", his pick
// 22 Nov 2026). Everything is derived from one colour: the one code sampled
// from the person's own portrait (server: mentorDiscover.sampleColour). No
// person has hand-picked values, so a second person needs no new code.
//
//   ink    a near-black tinted from his hue (HSL, lightness 8.5%)
//   on     the text on his colour: ink or paper, whichever reads better
//   now    the palette of his first block (his colour, edge to edge)
//   dark   the palette below it (ink, with his colour as the accent)
//
// Ported line for line from the mockup's "palette by rule" (tpl.html); the
// OKLCH helpers are there for the tones he did not pick and are kept so the
// mockup's check values can be tested against this file.

export const PAPER = '#ffffff';
export const INKTXT = '#f6f1ec';

export const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const cr = (a, b) => contrast(hex2rgb(a), hex2rgb(b));

function rgb2hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2hex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const s2l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const l2s = (v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); };
export function rgb2oklch(rgb) {
  const [r, g, b] = rgb.map(s2l);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180 / Math.PI) + 360) % 360];
}
// chroma reduced until the colour is inside sRGB
export function oklch2hex(L, C, h) {
  let lin;
  for (let i = 0; i < 60; i++) {
    const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) break;
    C *= 0.96;
  }
  return '#' + lin.map((v) => l2s(v).toString(16).padStart(2, '0')).join('');
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// the "tick" drawn on a chosen option, in a given colour
const tickURI = (c) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c.replace('#', '%23')}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E")`;

const HEX = /^#[0-9a-f]{6}$/i;
export const FALLBACK = '#8a8f99';

/**
 * Every role of a person's palette, in the two regions "Colour on top" uses.
 * `hex` is his sampled colour; anything that is not a #rrggbb colour falls
 * back to a neutral grey (the server had no portrait to sample).
 */
export function paletteFor(hex) {
  const c0 = HEX.test(String(hex || '')) ? String(hex).toLowerCase() : FALLBACK;
  const rgb = hex2rgb(c0);
  const [h, s, l] = rgb2hsl(rgb);
  const ink = l < 0.06 ? '#141416' : hsl2hex(h, Math.min(0.55, s * 0.6 + 0.12), 0.085);
  const on0 = contrast(rgb, hex2rgb(ink)) >= contrast(rgb, hex2rgb(PAPER)) ? ink : '#ffffff';
  const acc = (x) => (cr(x, ink) >= 4.5 ? x : '#ffffff');
  const [L0, C0, H0] = rgb2oklch(rgb);
  const [Li, Ci, Hi] = rgb2oklch(hex2rgb(ink));
  const soft = oklch2hex(clamp(L0 - 0.02, 0.62, 0.80), Math.min(C0 * 0.62, 0.115), H0);
  const deep = oklch2hex(0.47, Math.min(C0, 0.135), H0);
  const raised = oklch2hex(Li + 0.075, Ci, Hi);
  const now = { c: c0, on: on0, a: acc(c0), ib: ink, ibt: INKTXT, k: c0, kon: on0, nm: on0, sh: ink, cb: c0, cbt: on0, cbn: on0, blend: 'multiply', tk: '#ffffff' };
  const dark = { c: ink, on: INKTXT, a: acc(c0), ib: c0, ibt: on0, k: c0, kon: on0, nm: cr(c0, ink) >= 3 ? c0 : INKTXT, sh: raised, cb: raised, cbt: INKTXT, cbn: cr(c0, raised) >= 4.5 ? c0 : INKTXT, blend: 'luminosity', tk: on0 };
  for (const t of [now, dark]) t.iba = t.ib === ink ? t.a : t.ibt;
  return { c0, ink, on0, soft, deep, raised, now, dark };
}

// where a name is not Ink it would cross a light shirt, so the lower part of
// the cut-out fades into the field before the name starts (the mockup's
// measured starts: 61% of the hero portrait, 85% of the Library tile's)
const FADES = { fh: 61, fx: 85 };

/** The CSS custom properties of one region (`now` or `dark`), as a style object. */
export function regionVars(pal, region, { duo } = {}) {
  const t = pal[region];
  const fade = t.nm !== pal.ink;
  const floor = region === 'dark' ? 0.30 : 0.35;
  const v = {
    '--nv-m-c': t.c, '--nv-m-on': t.on, '--nv-m-a': t.a, '--nv-m-ink': pal.ink,
    '--nv-m-ib': t.ib, '--nv-m-ibt': t.ibt, '--nv-m-iba': t.iba, '--nv-m-k': t.k, '--nv-m-kon': t.kon,
    '--nv-m-nm': t.nm, '--nv-m-sh': t.sh, '--nv-m-blend': t.blend, '--nv-m-tk': tickURI(t.tk),
    '--nv-m-sbc': t.on,
  };
  for (const [n, b] of Object.entries(FADES)) v[`--nv-m-${n}`] = fade ? `linear-gradient(#000 ${b - 12}%,rgba(0,0,0,${floor}) ${b}%)` : 'none';
  if (duo) v['--nv-m-duo'] = `url(#${duo})`;
  return v;
}

/**
 * The duotone the unread frames are printed in, as the three tableValues of
 * an SVG feComponentTransfer (R, G, B). On "Colour on top" the wall sits on
 * ink, so it is the mockup's dark duotone: a dark of his hue that recedes.
 */
export function duotoneTables(pal) {
  const ink = hex2rgb(pal.ink).map((v) => v / 255), c = hex2rgb(pal.c0).map((v) => v / 255);
  const dark = ink.map((v) => v * 0.7), light = ink.map((v, i) => v + (c[i] - v) * 0.42);
  return dark.map((d, i) => `${d.toFixed(3)} ${(d * 0.4 + light[i] * 0.6).toFixed(3)} ${light[i].toFixed(3)}`);
}
