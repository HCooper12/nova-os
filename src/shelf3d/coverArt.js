// THE HOUSE COVER — painted, not composited.
//
// Every face of a Nova edition is a canvas: cloth ground, the plate, the foil
// type, the publisher's mark. The plate is drawn into the rect `edition.js`
// computed, which is expressed in fractions of the BOARD — so the image lands
// on the board at exactly its own aspect even though the canvas is not the
// board's shape. That indirection is the whole reason no poster is ever
// stretched or sliced.
//
// The type needs the opposite correction: a canvas pixel is not square on a
// board that is not 2:3, so every run of text is drawn through a horizontal
// scale that undoes the stretch. Without it a video volume's title comes out
// 22% fat and you can see it.

import { clipAtWordBoundary } from './edition.js';

export const FRONT_W = 512;
export const FRONT_H = 768;
export const SPINE_W = 128;
export const SPINE_H = 768;

// THE SELECTED VOLUME IS PAINTED TWICE THE SIZE. On his phone the front board
// of the focused volume spans ~380 CSS px, which at dpr 2 is 760 device
// pixels — a 512-wide canvas was being magnified 1.5×, and the plate and the
// title went soft. Neighbours are small and moving and stay at 512; only the
// one you are looking at pays for 1024, and only while you are looking at it.
export const DETAIL_SCALE = 2;

// The serif is the house voice — read from the document so the four themes
// (and daylight's New York fallback) all get their own, and no literal font
// name ever lands in here.
export function serifFamily() {
  if (typeof document === 'undefined') return 'serif';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--nv-font-serif').trim();
  return v || 'serif';
}

export function uiFamily() {
  if (typeof document === 'undefined') return 'sans-serif';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--nv-font-ui').trim();
  return v || 'sans-serif';
}

// Canvas paints synchronously from whatever fonts the document has RIGHT NOW.
// Called before the webfont lands, every cover is set in Times and the texture
// is already uploaded to the GPU by the time the real face arrives.
export async function fontsReady() {
  try { await document.fonts?.ready; } catch { /* no font loading API — paint anyway */ }
}

// one tile per scale, for the life of the page
const weaveTiles = new Map();
function weavePattern(ctx, k) {
  const pitch = 4 * k;
  let tile = weaveTiles.get(k);
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = pitch; tile.height = pitch;
    const t = tile.getContext('2d');
    t.globalAlpha = 0.05; t.fillStyle = '#ffffff';
    t.fillRect(0, 0, pitch, k);
    t.globalAlpha = 0.035; t.fillStyle = '#000000';
    t.fillRect(0, 0, k, pitch);
    weaveTiles.set(k, tile);
  }
  return ctx.createPattern(tile, 'repeat');
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const shade = (hexColour, mul) => {
  const s = String(hexColour).replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * mul)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

// One canvas pixel is this much wider than it is tall once it is on the
// board. Text is drawn through its inverse; the plate is not, because the
// plate rect is already in board fractions.
const typeScaleX = (edition) => (FRONT_W / FRONT_H) / edition.boardAspect;

// Draw `fn` with horizontal type correction about `cx`.
function withTypeScale(ctx, edition, cx, fn) {
  const sx = typeScaleX(edition);
  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(1 / sx, 1);
  ctx.translate(-cx, 0);
  fn(1 / sx);
  ctx.restore();
}

// Wrap to a box, shrinking until it fits. Returns the lines and the size that
// held them, or null when even the smallest size cannot — the caller then
// clips at a word boundary rather than letting type run off the board.
function fitLines(ctx, text, { family, weight = '400', maxWidth, maxLines, from, to }) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], size: from };
  for (let size = from; size >= to; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = [];
    let line = '';
    let overflow = false;
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        if (!line && ctx.measureText(next).width > maxWidth) { line = next; overflow = true; }
        else line = next;
      } else {
        lines.push(line); line = w;
      }
      if (lines.length >= maxLines) { overflow = true; break; }
    }
    if (line && lines.length < maxLines) lines.push(line);
    const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
    if (!overflow && consumed === words.length) return { lines, size };
  }
  return null;
}

// ------------------------------------------------------------------ cloth

function paintCloth(ctx, edition, w, h, k = 1) {
  const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
  g.addColorStop(0, shade(edition.cloth, 1.18));
  g.addColorStop(0.55, edition.cloth);
  g.addColorStop(1, shade(edition.cloth, 0.72));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // THE WEAVE IS A PATTERN, NOT 320 STROKES. Two crossed hatchings are what
  // stop a flat fill reading as plastic under a specular light — but drawn
  // line by line they cost several milliseconds a board, and two boards
  // painted inside a dragged frame is what produced the 142 ms spike the
  // 4x-throttle trace caught. The tile is rasterised once per scale and
  // blitted; the result is the same pixels. Its pitch scales with the canvas,
  // because a weave is a physical size — at a fixed 4px it halved on the
  // hi-res board and turned into moiré.
  ctx.save();
  ctx.fillStyle = weavePattern(ctx, k);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // the hinge: a real board is darker where it meets the spine
  const hinge = ctx.createLinearGradient(0, 0, w * 0.1, 0);
  hinge.addColorStop(0, 'rgba(0,0,0,.42)');
  hinge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hinge;
  ctx.fillRect(0, 0, w * 0.1, h);
}

// ------------------------------------------------------------------ front

// Where the type sits. Shared by the visible paint and the foil mask, so the
// metal is registered to the ink to the pixel.
function frontLayout(edition, k = 1) {
  const pad = 46 * k;
  const p = edition.plate;
  const W = FRONT_W * k, H = FRONT_H * k;
  if (p && p.fullBleed) return { k, W, H, plate: { x: 0, y: 0, w: W, h: H }, type: null };
  const plate = p ? { x: p.x * W, y: p.y * H, w: p.w * W, h: p.h * H } : null;
  const top = plate ? plate.y + plate.h + 44 * k : H * 0.30;
  return {
    k, W, H, plate,
    type: { x: pad, w: W - pad * 2, top, bottom: H - 96 * k, cx: W / 2 },
  };
}

function drawType(ctx, edition, layout, { ink, mark }) {
  const t = layout.type;
  if (!t) return;
  const k = layout.k;
  const family = serifFamily();
  const room = t.bottom - t.top;
  const sx = 1 / typeScaleX(edition);
  const maxWidth = t.w / sx; // measured in the pre-scale space

  // No plate means the title IS the cover, so it is set large. That is the
  // honest answer to "no poster arrived" — a plainer volume, never a grey box.
  const big = !layout.plate;
  const fit = fitLines(ctx, edition.title, {
    family, maxWidth, maxLines: big ? 5 : 3,
    from: (big ? 62 : 40) * k, to: (big ? 26 : 20) * k,
  }) || (() => {
    const size = (big ? 30 : 22) * k;
    ctx.font = `400 ${size}px ${family}`;
    const perLine = Math.max(6, Math.floor(edition.title.length * (maxWidth / Math.max(1, ctx.measureText(edition.title).width))));
    return { lines: [clipAtWordBoundary(edition.title, perLine * (big ? 5 : 3))], size };
  })();

  withTypeScale(ctx, edition, t.cx, () => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = ink;

    // the foil rule above the title — a Stripe Press tell, and it gives the
    // metal something to catch the light on even when the title is short
    const ruleW = Math.min(t.w, 150 * k) / sx;
    ctx.fillRect(t.cx - ruleW / 2, t.top - 22 * k, ruleW, 2 * k);

    const lh = fit.size * 1.16;
    let y = t.top + Math.max(0, (room - (fit.lines.length * lh + 60 * k)) * 0.06);
    ctx.font = `400 ${fit.size}px ${family}`;
    for (const line of fit.lines) { ctx.fillText(line, t.cx, y); y += lh; }

    if (edition.author) {
      const aSize = Math.max(13 * k, Math.round(fit.size * 0.38));
      ctx.font = `500 ${aSize}px ${uiFamily()}`;
      const a = clipAtWordBoundary(edition.author.toUpperCase(), 34);
      ctx.globalAlpha = 0.86;
      ctx.fillText(a, t.cx, y + 16 * k);
      ctx.globalAlpha = 1;
    }

    // the publisher's mark, at the foot, where a colophon goes
    ctx.font = `400 ${26 * k}px ${family}`;
    ctx.fillStyle = mark;
    ctx.fillText(edition.mark, t.cx, layout.H - 74 * k);
  });
}

/**
 * paintFront — cloth, the plate (exactly, never cropped), foil type, the mark.
 * @param image an HTMLImageElement that has LOADED, or null.
 */
export function paintFront(edition, image, k = 1) {
  const c = canvas(FRONT_W * k, FRONT_H * k);
  const ctx = c.getContext('2d');
  paintCloth(ctx, edition, FRONT_W * k, FRONT_H * k, k);
  const layout = frontLayout(edition, k);

  if (layout.plate && image) {
    const { x, y, w, h } = layout.plate;
    // the plate's own recess: cloth is thicker than paper, so the art sits
    // very slightly down in it
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 16 * k;
    ctx.fillStyle = shade(edition.cloth, 0.5);
    ctx.fillRect(x - 3 * k, y - 3 * k, w + 6 * k, h + 6 * k);
    ctx.restore();
    // the whole image into the whole rect: the rect already carries the
    // image's aspect, so this is a pure scale — no crop, no letterbox bars.
    ctx.drawImage(image, x, y, w, h);
    if (!edition.plate.fullBleed) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 2 * k;
      ctx.strokeRect(x + k, y + k, w - 2 * k, h - 2 * k);
    }
  }

  drawType(ctx, edition, layout, { ink: edition.foil, mark: edition.foil });
  return c;
}

// The alphaMap for the foil mesh: white where metal, black where cloth. Same
// layout call, so it registers exactly over the painted ink.
export function paintFoilMask(edition, k = 1) {
  const c = canvas(FRONT_W * k, FRONT_H * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, FRONT_W * k, FRONT_H * k);
  drawType(ctx, edition, frontLayout(edition, k), { ink: '#ffffff', mark: '#ffffff' });
  return c;
}

// ------------------------------------------------------------------ spine

/**
 * paintSpine — the title runs UP the spine, sized to fit its height, clipped
 * at a word boundary when it cannot. The foot carries the author (or the
 * channel, or the kind) and the mark.
 *
 * The spine face is depth × height, which for an article is nearly 1:18 while
 * this canvas is 1:6 — so the glyphs are drawn through a vertical correction
 * that makes them land square on the real face.
 */
export function paintSpine(edition) {
  const c = canvas(SPINE_W, SPINE_H);
  const ctx = c.getContext('2d');
  paintCloth(ctx, edition, SPINE_W, SPINE_H);

  // the two grooves where the boards hinge onto the spine
  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.fillRect(0, 0, 5, SPINE_H);
  ctx.fillRect(SPINE_W - 5, 0, 5, SPINE_H);

  const family = serifFamily();
  // px per metre along each axis of this canvas, once it is on the face
  const along = edition.height / SPINE_H;  // canvas y → the spine's length
  const across = edition.depth / SPINE_W;  // canvas x → the spine's thickness
  const k = along / across;                // the squash to undo

  const padEnd = 56;
  const footRoom = 118;
  const runway = SPINE_H - padEnd * 2 - footRoom;
  // the glyph height may not exceed the spine's thickness, less its grooves
  const maxGlyph = (SPINE_W - 26) / k;

  ctx.save();
  ctx.translate(SPINE_W / 2, SPINE_H / 2);
  ctx.rotate(-Math.PI / 2);            // local +x now runs UP the spine
  ctx.scale(1, k);                     // undo the face's squash
  ctx.textBaseline = 'middle';
  ctx.fillStyle = edition.foil;

  let size = Math.min(52, Math.max(18, Math.round(maxGlyph)));
  let title = edition.spineTitle;
  ctx.font = `400 ${size}px ${family}`;
  while (ctx.measureText(title).width > runway && size > 22) {
    size -= 2;
    ctx.font = `400 ${size}px ${family}`;
  }
  if (ctx.measureText(title).width > runway) {
    // still too long at the smallest size the spine can read at: clip, at a
    // word boundary, with an ellipsis. Never squash, never overrun.
    const per = ctx.measureText(title).width / Math.max(1, title.length);
    title = clipAtWordBoundary(title, Math.max(6, Math.floor(runway / per)));
  }
  ctx.textAlign = 'left';
  ctx.fillText(title, -SPINE_H / 2 + padEnd, 0);

  // the foot: author / channel, then the publisher's mark at the very end
  const footSize = Math.max(11, Math.round(Math.min(size * 0.4, maxGlyph * 0.62)));
  ctx.font = `600 ${footSize}px ${uiFamily()}`;
  ctx.textAlign = 'right';
  ctx.globalAlpha = 0.82;
  let foot = edition.spineFoot.toUpperCase();
  const footMax = footRoom - 44;
  while (ctx.measureText(foot).width > footMax && foot.length > 4) {
    foot = clipAtWordBoundary(foot, foot.length - 2);
  }
  ctx.fillText(foot, SPINE_H / 2 - padEnd - 34, 0);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.font = `400 ${Math.round(maxGlyph * 0.7)}px ${family}`;
  ctx.fillText(edition.mark, SPINE_H / 2 - 28, 0);
  ctx.restore();

  return c;
}

// ------------------------------------------------------------------- back

export function paintBack(edition) {
  const c = canvas(FRONT_W, FRONT_H);
  const ctx = c.getContext('2d');
  paintCloth(ctx, edition, FRONT_W, FRONT_H);
  const cx = FRONT_W / 2;
  withTypeScale(ctx, edition, cx, () => {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = edition.foil;
    ctx.globalAlpha = 0.55;
    ctx.font = `400 46px ${serifFamily()}`;
    ctx.fillText(edition.mark, cx, FRONT_H * 0.5);
    ctx.font = `600 15px ${uiFamily()}`;
    ctx.fillText(`NOVA · ${edition.kindLabel.toUpperCase()}`, cx, FRONT_H * 0.5 + 54);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(cx - 44, FRONT_H * 0.5 + 76, 88, 1);
  });
  return c;
}
