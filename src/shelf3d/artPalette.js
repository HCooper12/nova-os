// THE ART'S OWN COLOURS, DERIVED ONCE, SHARED BY BOTH VIEWS.
//
// The shelf binds a volume in cloth taken from its poster. The Covers grid has
// to bind the SAME volume in the SAME cloth or the two views are two different
// libraries — which is exactly what the first Phase 6 capture showed: a video
// that is dark brown on the shelf was mauve in the grid, because the grid was
// using the hash-derived edition and the shelf the palette-derived one.
//
// So the derivation lives here, keyed by the blob URL, and both callers get
// the same promise. An image decoded for the shelf is not decoded again for
// the grid, and a source's colour is a property of the source rather than of
// whichever view happened to render it.

import { paletteFromImageData } from './edition.js';

const cache = new Map();      // url → Promise<{ image, aspect, palette }>
const resolved = new Map();   // url → the same value, once it has landed

export function artFor(url) {
  if (!url) return Promise.resolve(null);
  const hit = cache.get(url);
  if (hit) return hit;

  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let palette = null;
      try {
        // blob: URLs are same-origin, so this canvas is not tainted — but a
        // tainted canvas THROWS on getImageData rather than returning null,
        // and one throw would take the whole view down.
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, 32, 32);
        palette = paletteFromImageData(cx.getImageData(0, 0, 32, 32).data, 32, 32);
      } catch { palette = null; }
      const value = {
        image: img,
        aspect: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null,
        palette: palette?.length ? palette : null,
      };
      // remember it HERE, not at the call site: a caller that forgets leaves
      // the synchronous readers empty, which is how the grid kept rendering
      // the hash colours while the shelf had the real ones.
      resolved.set(url, value);
      resolve(value);
    };
    // art that never arrives is not a hole: the edition is painted in its own
    // cloth with the title set large, and that is a real binding, not a gap.
    img.onerror = () => {
      const value = { image: null, aspect: null, palette: null };
      resolved.set(url, value);
      resolve(value);
    };
    img.src = url;
  });
  cache.set(url, p);
  return p;
}

// Anything already resolved, for a caller that must render synchronously.
export function artNow(url) { return url ? resolved.get(url) || null : null; }
export function rememberArt(url, value) { if (url && value) resolved.set(url, value); }
