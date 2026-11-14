// THE BENT RIM (15 Nov 2026, his ask after the Glisse reel: "make Nova's
// glass look more like that"). Real glass bends what is behind it near its
// edge: within a band at the rim the backdrop is drawn from further in, most
// at the very edge, and red bends a little further than blue so the rim
// carries a faint colour fringe. Nova's glass had the frost, the sheen, the
// lit rim and the drop already; this adds the bend.
//
// Technique after Glisse by Kelvin Zhang (MIT, github.com/0kzh/glisse) and
// kube.io's "Liquid Glass in CSS and SVG" write-up: a displacement map drawn
// on a canvas for the surface's own size and corners, run through an SVG
// filter that `backdrop-filter: url(#id)` applies to the live backdrop. Two
// details are taken from Glisse's findings rather than its code: the maps
// are GREY (Chrome colour-converts an feImage on a wide-gamut display, which
// would skew a red/green map; a grey survives unchanged, and alpha is not
// converted at all, so each pass reads its own grey and gets "no pull" from
// an alpha of one half), and each colour is displaced in its own pass with a
// slightly different scale. The profile, the filter graph and the wiring
// below are Nova's own.
//
// WHERE IT RUNS. Only Chromium applies an SVG filter to a backdrop; Safari
// parses `backdrop-filter: url()` and ignores it, so `@supports` cannot tell
// them apart and the gate is a runtime check. His iPhone is WebKit: there
// this module does nothing at all, and the CSS it keys (`[data-nv-lens]`)
// never matches, so the phone renders exactly as before.
//
// WHAT IT TOUCHES. The few floating surfaces only: the Summary tab bar, the
// Nova disc, the search pill and the bottom sheets. Never a card (dozens on
// screen). One filter per distinct size, kept while any surface wears it;
// maps are drawn once per size and redrawn only when a surface's size
// changes (ResizeObserver), never per frame. Off under reduced
// transparency, reduced motion, more contrast and the solid material.

export const LENS_SELECTOR = '.nv-sum-tabbar, .nv-sum-nova, .nv-sum-search, .nv-liquid.nv-sum-sheet';

// The band that bends: three tenths of the shorter side, 36px at most.
const BAND_SHARE = 0.3;
const BAND_MAX = 36;
// How far in the rim reaches, as a share of the band (1 = a full band in).
const BEND = 1;
// Colour split: red bends 12% further than blue, green 6%.
const DISPERSION = 0.6;
export const SPECTRUM = [1 + 0.2 * DISPERSION, 1 + 0.1 * DISPERSION, 1];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The width of the band that bends, in px. */
export function bandOf(width, height) {
  return Math.min(BAND_SHARE * Math.min(width, height), BAND_MAX);
}

// The bend across the band, from 1 at the rim (s = 1) to 0 where it meets the
// flat of the glass (s = 0): a ray straight down through a quarter-round
// bezel (surface slope angle asin(s)) refracted by glass of index 1.5 turns
// by asin(s) - asin(s / 1.5); the sideways shift is the tangent of that turn.
// The extra factor of s lets the bend arrive with zero slope at the band's
// inner edge, so the flat of the glass meets the bezel without a seam.
const RIM_TURN = Math.tan(Math.PI / 2 - Math.asin(1 / 1.5));
export function bendProfile(s) {
  const x = clamp(s, 0, 1);
  return (x * Math.tan(Math.asin(x) - Math.asin(x / 1.5))) / RIM_TURN;
}

/**
 * The two grey maps for a rounded rectangle, one CSS px to a map pixel:
 * `across` and `down`, each RGBA, 128 meaning no pull. Within the band the
 * pull points straight in from the nearest side, and round each corner it
 * turns radially, about a corner at least as round as the band is wide.
 */
export function lensMaps(width, height, radius) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const hw = w / 2;
  const hh = h / 2;
  const r = clamp(radius, 0, Math.min(hw, hh));
  const band = bandOf(w, h);
  const round = clamp(Math.max(r, band), 0, Math.min(hw, hh));
  const across = new Uint8ClampedArray(w * h * 4).fill(128);
  const down = new Uint8ClampedArray(w * h * 4).fill(128);
  for (let i = 3; i < across.length; i += 4) { across[i] = 255; down[i] = 255; }
  if (band <= 0) return { width: w, height: h, across, down };
  for (let row = 0; row < h; row++) {
    const y = row + 0.5 - hh;
    const ay = Math.abs(y);
    for (let col = 0; col < w; col++) {
      const x = col + 0.5 - hw;
      const ax = Math.abs(x);
      // signed distance to the rounded rect (negative inside)
      const qx = ax - hw + r;
      const qy = ay - hh + r;
      const edge = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      if (edge >= 0 || -edge >= band) continue;
      // the outward direction, turned smoothly round the corners
      const cx = ax - hw + round;
      const cy = ay - hh + round;
      let nx = 0;
      let ny = 0;
      if (cx > 0 && cy > 0) {
        const len = Math.hypot(cx, cy);
        nx = (Math.sign(x) * cx) / len;
        ny = (Math.sign(y) * cy) / len;
      } else if (cx > cy) nx = Math.sign(x);
      else ny = Math.sign(y);
      const amount = bendProfile(1 + edge / band);
      const i = (row * w + col) * 4;
      // lighter pulls from further right/down; the rim pulls from further IN
      const gx = Math.round((0.5 - 0.5 * nx * amount) * 255);
      const gy = Math.round((0.5 - 0.5 * ny * amount) * 255);
      across[i] = across[i + 1] = across[i + 2] = gx;
      down[i] = down[i + 1] = down[i + 2] = gy;
    }
  }
  return { width: w, height: h, across, down };
}

/** Chromium only, and only when nothing he has asked the OS for says no. */
export function canRefract(win = typeof window === 'undefined' ? null : window) {
  if (!win || !win.navigator || !win.document) return false;
  if (!/Chrom(?:e|ium)\//.test(win.navigator.userAgent || '')) return false;
  const mq = (q) => { try { return !!win.matchMedia?.(q).matches; } catch { return false; } };
  if (mq('(prefers-reduced-transparency: reduce)') || mq('(prefers-reduced-motion: reduce)') || mq('(prefers-contrast: more)')) return false;
  try { if (win.CSS?.supports && !win.CSS.supports('backdrop-filter', 'blur(1px)')) return false; } catch { /* keep going */ }
  return true;
}

// ---- the DOM side: maps to data URLs, one <filter> per size --------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHANNEL_ROWS = [
  '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
];

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function toDataUrl(data, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(w, h);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

// The filter for one size: each pull's grey with its other axis held at an
// alpha of one half (no pull), then per colour a pass across and a pass down
// at that colour's scale, the colour kept, and the three screened back
// together (over an opaque backdrop, screen of R-only, G-only and B-only
// layers is exactly the recombined colour).
function buildFilter(id, maps) {
  const { width: w, height: h } = maps;
  const acrossUrl = toDataUrl(maps.across, w, h);
  const downUrl = toDataUrl(maps.down, w, h);
  if (!acrossUrl || !downUrl) return null;
  const filter = el('filter', {
    id, x: 0, y: 0, width: w, height: h,
    filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse',
    'color-interpolation-filters': 'sRGB',
  });
  const box = { x: 0, y: 0, width: w, height: h };
  filter.append(
    el('feImage', { ...box, href: acrossUrl, preserveAspectRatio: 'none', result: 'lx' }),
    el('feImage', { ...box, href: downUrl, preserveAspectRatio: 'none', result: 'ly' }),
  );
  for (const axis of ['lx', 'ly']) {
    const half = el('feComponentTransfer', { in: axis, result: `${axis}h` });
    half.append(el('feFuncA', { type: 'linear', slope: 0, intercept: 0.5 }));
    filter.append(half);
  }
  const reach = BEND * bandOf(w, h) * 2;
  SPECTRUM.forEach((k, i) => {
    const scale = (reach * k).toFixed(2);
    filter.append(
      el('feDisplacementMap', { in: 'SourceGraphic', in2: 'lxh', scale, xChannelSelector: 'R', yChannelSelector: 'A', result: `a${i}` }),
      el('feDisplacementMap', { in: `a${i}`, in2: 'lyh', scale, xChannelSelector: 'A', yChannelSelector: 'R', result: `b${i}` }),
      el('feColorMatrix', { in: `b${i}`, type: 'matrix', values: CHANNEL_ROWS[i], result: `c${i}` }),
    );
  });
  filter.append(
    el('feBlend', { in: 'c0', in2: 'c1', mode: 'screen', result: 'c01' }),
    el('feBlend', { in: 'c01', in2: 'c2', mode: 'screen' }),
  );
  return filter;
}

function radiusOf(node, w, h) {
  const raw = getComputedStyle(node).borderTopLeftRadius || '0';
  const first = raw.split(' ')[0];
  const n = parseFloat(first) || 0;
  return first.endsWith('%') ? (n / 100) * Math.min(w, h) : n;
}

let started = false;

/** Mount once (main.jsx). Does nothing at all where the bend cannot run. */
export function startGlassLens() {
  if (started || !canRefract()) return;
  started = true;

  const root = document.documentElement;
  let svg = null;
  const filters = new Map(); // key -> { id, node, users: Set<Element> }
  const worn = new Map(); // element -> key
  let made = 0;
  let active = false;

  const container = () => {
    if (svg) return svg;
    svg = el('svg', { 'aria-hidden': 'true', width: 0, height: 0, focusable: 'false' });
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    svg.append(el('defs', {}));
    document.body.append(svg);
    return svg;
  };

  const release = (node) => {
    const key = worn.get(node);
    if (key === undefined) return;
    worn.delete(node);
    const f = filters.get(key);
    if (f) {
      f.users.delete(node);
      // keep a handful of idle sizes (sheets come and go); drop the rest
      if (!f.users.size && filters.size > 8) { f.node.remove(); filters.delete(key); }
    }
  };

  const strip = (node) => {
    release(node);
    node.removeAttribute('data-nv-lens');
    node.style.removeProperty('--nv-lens');
  };

  const fit = (node) => {
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    if (!w || !h) { strip(node); return; }
    const r = radiusOf(node, w, h);
    const key = `${w}x${h}r${Math.round(r * 2) / 2}`;
    if (worn.get(node) === key) return;
    release(node);
    let f = filters.get(key);
    if (!f) {
      const id = `nv-lens-${++made}`;
      const filterNode = buildFilter(id, lensMaps(w, h, r));
      if (!filterNode) { strip(node); return; }
      container().firstChild.append(filterNode);
      f = { id, node: filterNode, users: new Set() };
      filters.set(key, f);
    }
    f.users.add(node);
    worn.set(node, key);
    node.style.setProperty('--nv-lens', `url(#${f.id})`);
    node.setAttribute('data-nv-lens', '');
  };

  const sizes = new ResizeObserver((entries) => {
    if (!active) return;
    for (const entry of entries) if (entry.target.isConnected) fit(entry.target);
  });

  // Runs in the mutation observer's own microtask, so a sheet that mounts
  // wears its lens from its first painted frame. (Not rAF: a frame callback
  // can wait indefinitely on a page that is not producing frames, and the
  // lens should not depend on one.)
  const scan = () => {
    for (const node of [...worn.keys()]) {
      if (!node.isConnected) { release(node); sizes.unobserve(node); }
    }
    if (!active) return;
    for (const node of document.querySelectorAll(LENS_SELECTOR)) {
      if (!worn.has(node)) { fit(node); sizes.observe(node); }
    }
  };
  // only when an element arrived or left; text and attribute churn is ignored
  const changed = (records) => records.some((r) =>
    [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1));

  const tree = new MutationObserver((records) => { if (changed(records)) scan(); });

  const wanted = () =>
    root.getAttribute('data-nv-style') === 'summary' &&
    root.getAttribute('data-nv-material') !== 'solid' &&
    canRefract();

  const update = () => {
    const next = wanted();
    if (next === active) return;
    active = next;
    if (active) {
      tree.observe(document.body, { childList: true, subtree: true });
      scan();
    } else {
      tree.disconnect();
      for (const node of [...worn.keys()]) { sizes.unobserve(node); strip(node); }
      for (const node of document.querySelectorAll('[data-nv-lens]')) strip(node);
    }
  };

  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['data-nv-style', 'data-nv-material'] });
  for (const q of ['(prefers-reduced-transparency: reduce)', '(prefers-reduced-motion: reduce)', '(prefers-contrast: more)']) {
    try { window.matchMedia(q).addEventListener('change', update); } catch { /* old engines */ }
  }
  update();
}
