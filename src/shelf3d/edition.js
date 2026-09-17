// THE NOVA EDITION — what a source IS as a physical object.
//
// His library is not a bookshelf: 17 videos, 3 articles, 1 book. The reel's
// beauty comes from a HOUSE — Stripe Press designs every jacket, the Complete
// Shelf paints every board. So Nova binds each source itself: a book's real
// jacket is the board; a video's poster is a PLATE set into cloth with a
// margin (never stretched, never cropped); an article is a slimmer,
// paper-bound volume with no plate at all.
//
// This file is PURE. No three, no DOM, no canvas. Everything here is a number
// or a hex string, derived deterministically from the id (so the same source
// is the same object on every device, every reload) or from the real art's
// palette when the image has loaded. That is what makes it testable in node,
// which is where the two rules that matter are pinned: art is never distorted,
// and a spine always says something.

// ---------------------------------------------------------------- hashing

// Same idiom as valsLibrary's hueOf — one hash, many derived numbers, so the
// object never reshuffles between sessions.
export function hashOf(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// A stable 0..1 from the hash and a named channel, so height jitter and depth
// jitter are independent without needing two hashes.
const unit = (h, salt) => ((hashOf(`${h}:${salt}`) % 10000) / 10000);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------- colour

const hex = (r, g, b) => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;

export function hslToHex(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(hh / 60) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function hexToRgb(value) {
  const s = String(value).replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: ((h * 60) % 360 + 360) % 360, s, l };
}

export function hexToHsl(value) {
  const { r, g, b } = hexToRgb(value);
  return rgbToHsl(r, g, b);
}

// ------------------------------------------------------------- contrast
//
// The same arithmetic as server/test/contrast.test.js, for the same reason:
// "none of it looks wrong" is exactly how a foil title that reads as a smudge
// survives a screenshot. A title set in the edition's own accent ON the
// edition's own cloth is the classic failure — both come from one dominant
// hue, so they can land a few percent apart in lightness and the type
// disappears. So the foil is not chosen, it is SOLVED FOR.

const srgbToLin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function relativeLuminance(value) {
  const { r, g, b } = hexToRgb(value);
  const [rl, gl, bl] = [r, g, b].map((c) => srgbToLin(c / 255));
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * ensureContrast — walk a colour's lightness away from `against` until it
 * clears `min`. Hue and saturation are kept, because the foil must still look
 * like this volume's metal; only how much light it carries changes.
 *
 * 3:1 is the bar, not 4.5: the foil title is set at the equivalent of large
 * type on the board and it is decoration carrying a name, not body copy.
 */
export function ensureContrast(colour, against, min = 3) {
  if (contrastRatio(colour, against) >= min) return colour;
  const { h, s } = hexToHsl(colour);
  const bgLum = relativeLuminance(against);
  // go the way there is room to go: away from the cloth, which is usually dark
  const up = bgLum < 0.18;
  let best = colour;
  let bestRatio = contrastRatio(colour, against);
  for (let i = 1; i <= 24; i++) {
    const l = clamp(hexToHsl(colour).l + (up ? i * 0.03 : -i * 0.03), 0.04, 0.98);
    const candidate = hslToHex(h, s, l);
    const ratio = contrastRatio(candidate, against);
    if (ratio > bestRatio) { bestRatio = ratio; best = candidate; }
    if (ratio >= min) return candidate;
  }
  // nothing in this hue clears it — fall back to the honest extreme rather
  // than shipping type nobody can read
  return bestRatio >= min ? best : (up ? '#f6f1e6' : '#12100c');
}

/**
 * mixHex — `color-mix(in srgb, a pct%, b)` done in JS, because the result has
 * to be MEASURED before it is used. A CSS color-mix cannot be checked for
 * contrast at the point it is written.
 */
export function mixHex(a, b, pct) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const t = clamp(pct, 0, 100) / 100;
  return hex(A.r * t + B.r * (1 - t), A.g * t + B.g * (1 - t), A.b * t + B.b * (1 - t));
}

/**
 * safeTint — mix `tint` into `base` as far as it can go while the result still
 * reads on `bg`. This is the clamp the page-tint needs: a volume bound in a
 * dark olive cloth must not drag the Library's accent down to where the HIG
 * audit's three cases start failing again.
 *
 * Returns { colour, pct } so the caller can say how much tint it actually got.
 */
export function safeTint(base, tint, bg, { pct = 35, min = 4.5 } = {}) {
  for (let p = pct; p >= 0; p -= 5) {
    const colour = mixHex(tint, base, p);
    if (contrastRatio(colour, bg) >= min) return { colour, pct: p };
  }
  return { colour: base, pct: 0 };
}

// ------------------------------------------------- palette from real art
//
// PURE so it can be tested: the caller draws the loaded poster/jacket into a
// 32×32 canvas and hands the raw RGBA over. Near-black, near-white and
// near-transparent pixels carry no hue worth taking, so they are dropped
// rather than averaged into mud — averaging is exactly what makes every
// generated palette the same grey-brown.

export function paletteFromImageData(data, w, h) {
  if (!data || !w || !h) return [];
  const BUCKETS = 12;
  const bins = Array.from({ length: BUCKETS }, () => ({ weight: 0, h: 0, s: 0, l: 0, n: 0 }));
  const step = 4;
  for (let i = 0; i + 3 < data.length; i += 4 * step) {
    const a = data[i + 3];
    if (a < 160) continue;
    const { h: hue, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (l < 0.08 || l > 0.94) continue;
    const bin = bins[Math.floor(hue / (360 / BUCKETS)) % BUCKETS];
    // weight by saturation: a vivid pixel says more about a cover than a
    // grey one, and a poster is mostly grey.
    const weight = 0.15 + s * s;
    bin.weight += weight;
    bin.h += hue * weight;
    bin.s += s * weight;
    bin.l += l * weight;
    bin.n += 1;
  }
  return bins
    .filter((b) => b.n > 0 && b.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((b) => hslToHex(b.h / b.weight, clamp(b.s / b.weight, 0, 1), clamp(b.l / b.weight, 0, 1)));
}

// ---------------------------------------------------------------- text

// A spine is a fixed height and a title is not. The Repertoire's card clip
// (15 Sep) taught the rule: back off to a WORD boundary, then ellipsis —
// clipping mid-word reads as a bug, clipping at a space reads as a choice.
export function clipAtWordBoundary(text, max) {
  const s = String(text || '').trim();
  if (max <= 0) return '';
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(1, max - 1));
  const space = cut.lastIndexOf(' ');
  // only back off if there is a boundary worth backing off to; a single
  // very long word still has to be cut somewhere.
  const base = space > max * 0.4 ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s,;:.-]+$/, '')}…`;
}

const KIND_MARK = { book: '❦', video: '▶', podcast: '◉', article: '¶' };
const KIND_LABEL = { book: 'Book', video: 'Video', podcast: 'Podcast', article: 'Article' };

// Proportions in METRES, the scene's unit. A book stands taller and squarer,
// a video volume is wider and shorter (a case, not a novel), an article is a
// slim paper-bound pamphlet you could slide between two hardbacks.
const KIND_DIMS = {
  book: { height: 0.235, aspect: 2 / 3, depth: 0.030 },
  video: { height: 0.215, aspect: 0.814, depth: 0.026 },
  podcast: { height: 0.220, aspect: 0.773, depth: 0.028 },
  article: { height: 0.210, aspect: 0.667, depth: 0.012 },
};

// The cloth margin the plate may never eat into. 7% of the board on every
// side is what makes a poster read as something SET INTO a cover rather than
// something printed over it.
export const PLATE_MARGIN = 0.07;

// The floor for foil on cloth. His p2 screenshots read "muddy pink-grey on
// brown" — both colours came from one dominant hue, so they landed within a
// few percent of each other and the title stopped being type.
export const FOIL_MIN_CONTRAST = 3;

// A jacket only covers the board edge-to-edge when the board can BE that
// shape. Outside this range the art is not a book jacket, whatever the kind
// says, so it gets a plate like everything else.
const BOARD_ASPECT_MIN = 0.55;
const BOARD_ASPECT_MAX = 0.80;

/**
 * plateRect — fit `artAspect` (w/h) inside the front board, preserving the
 * image's shape exactly and keeping at least PLATE_MARGIN of cloth all round.
 * Returned as FRACTIONS of the board, so the painter and the geometry agree
 * without either knowing the other's units.
 */
export function plateRect(artAspect, boardAspect) {
  const avail = 1 - PLATE_MARGIN * 2;
  // in board fractions: plateAspectPhysical = (w * boardW) / (h * boardH)
  let w = avail;
  let h = (w * boardAspect) / artAspect;
  if (h > avail) {
    h = avail;
    w = (h * artAspect) / boardAspect;
  }
  // A short plate sits high and leaves the lower third for the foil title —
  // the Stripe Press layout. A tall one centres, because there is no room.
  const y = h <= 0.62 ? PLATE_MARGIN : (1 - h) / 2;
  return { x: (1 - w) / 2, y, w, h };
}

/**
 * editionFor — the whole physical spec of one source.
 *
 * @param row  a libraryShelf row: { id, title, author, kind }
 * @param opts { artAspect: number|null, palette: string[]|null }
 */
export function editionFor(row, opts = {}) {
  const kind = KIND_DIMS[row?.kind] ? row.kind : 'article';
  const dims = KIND_DIMS[kind];
  const h = hashOf(row?.id ?? row?.title ?? 'nova');
  const artAspect = Number.isFinite(opts.artAspect) && opts.artAspect > 0 ? opts.artAspect : null;

  // No two volumes on a real shelf are the same height, and the row reads as
  // a shelf because of it. Deterministic, so it never reshuffles.
  const height = dims.height * (0.96 + unit(h, 'h') * 0.08);
  const depth = dims.depth * (0.82 + unit(h, 'd') * 0.36);

  // A book's board is the shape of its jacket — that is why the jacket can
  // cover it. When there is no art, or the art is not board-shaped, the board
  // keeps the kind's own proportion.
  const boardAspect = kind === 'book' && artAspect
    ? clamp(artAspect, BOARD_ASPECT_MIN, BOARD_ASPECT_MAX)
    : dims.aspect;
  const width = height * boardAspect;

  // An article is paper-bound: no plate, ever. Its cover is type and cloth.
  const fullBleed = kind === 'book' && !!artAspect
    && artAspect >= BOARD_ASPECT_MIN && artAspect <= BOARD_ASPECT_MAX;
  let plate = null;
  if (kind !== 'article' && artAspect) {
    plate = fullBleed
      ? { x: 0, y: 0, w: 1, h: 1, fullBleed: true }
      : { ...plateRect(artAspect, boardAspect), fullBleed: false };
  }

  const colours = paletteColours(h, opts.palette, kind);

  const author = String(row?.author || '').trim();
  return {
    id: row?.id ?? null,
    kind,
    width, height, depth,
    boardAspect,
    ...colours,
    plate,
    // A spine that says nothing is the failure the current CSS shelf ships
    // ("'Eve IS W"). There is always SOMETHING to set up the spine.
    spineTitle: String(row?.title || '').trim() || KIND_LABEL[kind],
    spineFoot: author || KIND_LABEL[kind],
    title: String(row?.title || '').trim() || KIND_LABEL[kind],
    author,
    mark: KIND_MARK[kind] || KIND_MARK.article,
    kindLabel: KIND_LABEL[kind],
  };
}

// cloth / foil / accent, from the real art when we have it and from the id
// when we do not. Both paths land in the same lightness band so twenty-one
// volumes still read as one house.
function paletteColours(h, palette, kind) {
  const paper = kind === 'article';
  if (Array.isArray(palette) && palette.length) {
    const hsls = palette.map(hexToHsl);
    const dom = hsls[0];
    const vivid = hsls.reduce((a, b) => (b.s > a.s ? b : a), hsls[0]);
    // darkened dominant: a cover's colour, taken down to bookcloth
    const cloth = hslToHex(dom.h, clamp(dom.s * 0.72, 0.08, 0.55), paper ? 0.42 : clamp(dom.l * 0.42, 0.10, 0.26));
    // a light, warm complement — foil is warm metal, not a second ink — and
    // then pushed until it actually reads on THIS cloth
    const foil = ensureContrast(hslToHex(dom.h + 28, clamp(dom.s * 0.42, 0.10, 0.40), 0.84), cloth, FOIL_MIN_CONTRAST);
    return { cloth, foil, accent: hslToHex(vivid.h, clamp(vivid.s, 0.45, 0.92), 0.56) };
  }
  const hue = h % 360;
  const cloth = hslToHex(hue, paper ? 0.16 : 0.30, paper ? 0.44 : 0.19);
  return {
    cloth,
    foil: ensureContrast(hslToHex(hue + 30, 0.30, 0.84), cloth, FOIL_MIN_CONTRAST),
    accent: hslToHex(hue, 0.66, 0.56),
  };
}
