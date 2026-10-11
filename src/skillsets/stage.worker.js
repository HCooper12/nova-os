// The Skill sets' renderer, off the main thread. It owns one WebGL
// OffscreenCanvas the size of a slab's frame; each agent is rendered into it
// and handed to the page as an ImageBitmap for his own slab's canvas.
//
// beings.js paints its skins on canvases it makes with
// document.createElement('canvas'); a worker has no document, so it gets an
// OffscreenCanvas instead (same 2D API, and three takes it as a texture).
import { createStageCore } from './stageCore.js';

if (typeof self.document === 'undefined') {
  self.document = { createElement: () => new OffscreenCanvas(1, 1) };
}

const raf = typeof self.requestAnimationFrame === 'function'
  ? (cb) => self.requestAnimationFrame(cb)
  : (cb) => setTimeout(() => cb(performance.now()), 16);
const caf = typeof self.cancelAnimationFrame === 'function' ? (id) => self.cancelAnimationFrame(id) : (id) => clearTimeout(id);

let core = null, canvas = null;

async function snap() {
  // the portrait just drawn, as a PNG blob the page turns into an <img>
  const bmp = canvas.transferToImageBitmap();
  const c2 = new OffscreenCanvas(bmp.width, bmp.height);
  c2.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  return c2.convertToBlob({ type: 'image/png' });
}

function present(key) {
  const bmp = canvas.transferToImageBitmap();
  self.postMessage({ t: 'frame', key, bmp }, [bmp]);
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.t === 'init') {
      canvas = new OffscreenCanvas(Math.round(m.g.TW * m.pixelRatio), Math.round(m.g.TH * m.pixelRatio));
      core = createStageCore({
        canvas, tokens: m.tokens, reduceMotion: m.reduceMotion, pixelRatio: m.pixelRatio, maxFps: m.maxFps || 60,
        raf, caf, snap, present, salt: m.salt || 0,
        onBoxes: (boxes) => self.postMessage({ t: 'boxes', boxes }),
        onLost: (why) => self.postMessage({ t: 'lost', why }),
      });
      core.setGeo(m.g);
      self.postMessage({ t: 'ready' });
      return;
    }
    if (!core) return;
    if (m.t === 'portraits') { const out = await core.portraits(m.ids); self.postMessage({ t: 'portraits', out }); }
    else if (m.t === 'geo') core.setGeo(m.g);
    else if (m.t === 'slots') core.setSlots(m.slots, m.info);
    else if (m.t === 'agents') core.setAgents(m.list);
    else if (m.t === 'active') core.setActive(m.on);
    else if (m.t === 'pin') core.pin(m.id, m.p);
    else if (m.t === 'tap') core.tap(m.id);
    else if (m.t === 'lose') core.lose();
    else if (m.t === 'force') core.force(m.id, m.name);
    else if (m.t === 'stats') self.postMessage({ t: 'stats', stats: core.stats(), acts: core.acts() });
    else if (m.t === 'dispose') { core.dispose(); core = null; self.close(); }
  } catch (err) {
    self.postMessage({ t: 'error', message: String((err && err.message) || err) });
  }
};
