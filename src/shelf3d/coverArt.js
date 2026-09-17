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

function paintCloth(ctx, edition, w, h) {
  const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
  g.addColorStop(0, shade(edition.cloth, 1.18));
  g.addColorStop(0.55, edition.cloth);
  g.addColorStop(1, shade(edition.cloth, 0.72));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // the weave: two crossed hatchings, barely there. It is what stops a flat
  // fill from reading as plastic under a specular light.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.globalAlpha = 0.035;
  ctx.strokeStyle = '#000000';
  for (let x = 0; x < w; x += 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
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
function frontLayout(edition) {
  const pad = 46;
  const p = edition.plate;
  if (p && p.fullBleed) return { plate: { x: 0, y: 0, w: FRONT_W, h: FRONT_H }, type: null };
  const plate = p
    ? { x: p.x * FRONT_W, y: p.y * FRONT_H, w: p.w * FRONT_W, h: p.h * FRONT_H }
    : null;
  const top = plate ? plate.y + plate.h + 44 : FRONT_H * 0.30;
  return {
    plate,
    type: { x: pad, w: FRONT_W - pad * 2, top, bottom: FRONT_H - 96, cx: FRONT_W / 2 },
  };
}

function drawType(ctx, edition, layout, { ink, mark }) {
  const t = layout.type;
  if (!t) return;
  const family = serifFamily();
  const room = t.bottom - t.top;
  const sx = 1 / typeScaleX(edition);
  const maxWidth = t.w / sx; // measured in the pre-scale space

  // No plate means the title IS the cover, so it is set large. That is the
  // honest answer to "no poster arrived" — a plainer volume, never a grey box.
  const big = !layout.plate;
  const fit = fitLines(ctx, edition.title, {
    family, maxWidth, maxLines: big ? 5 : 3,
    from: big ? 62 : 40, to: big ? 26 : 20,
  }) || (() => {
    const size = big ? 30 : 22;
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
    const ruleW = Math.min(t.w, 150) / sx;
    ctx.fillRect(t.cx - ruleW / 2, t.top - 22, ruleW, 2);

    const lh = fit.size * 1.16;
    let y = t.top + Math.max(0, (room - (fit.lines.length * lh + 60)) * 0.06);
    ctx.font = `400 ${fit.size}px ${family}`;
    for (const line of fit.lines) { ctx.fillText(line, t.cx, y); y += lh; }

    if (edition.author) {
      const aSize = Math.max(13, Math.round(fit.size * 0.38));
      ctx.font = `500 ${aSize}px ${uiFamily()}`;
      const a = clipAtWordBoundary(edition.author.toUpperCase(), 34);
      ctx.globalAlpha = 0.86;
      ctx.fillText(a, t.cx, y + 16);
      ctx.globalAlpha = 1;
    }

    // the publisher's mark, at the foot, where a colophon goes
    ctx.font = `400 26px ${family}`;
    ctx.fillStyle = mark;
    ctx.fillText(edition.mark, t.cx, FRONT_H - 74);
  });
}

/**
 * paintFront — cloth, the plate (exactly, never cropped), foil type, the mark.
 * @param image an HTMLImageElement that has LOADED, or null.
 */
export function paintFront(edition, image) {
  const c = canvas(FRONT_W, FRONT_H);
  const ctx = c.getContext('2d');
  paintCloth(ctx, edition, FRONT_W, FRONT_H);
  const layout = frontLayout(edition);

  if (layout.plate && image) {
    const { x, y, w, h } = layout.plate;
    // the plate's own recess: cloth is thicker than paper, so the art sits
    // very slightly down in it
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = shade(edition.cloth, 0.5);
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.restore();
    // the whole image into the whole rect: the rect already carries the
    // image's aspect, so this is a pure scale — no crop, no letterbox bars.
    ctx.drawImage(image, x, y, w, h);
    if (!edition.plate.fullBleed) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }

  drawType(ctx, edition, layout, { ink: edition.foil, mark: edition.foil });
  return c;
}

// The alphaMap for the foil mesh: white where metal, black where cloth. Same
// layout call, so it registers exactly over the painted ink.
export function paintFoilMask(edition) {
  const c = canvas(FRONT_W, FRONT_H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, FRONT_W, FRONT_H);
  drawType(ctx, edition, frontLayout(edition), { ink: '#ffffff', mark: '#ffffff' });
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
