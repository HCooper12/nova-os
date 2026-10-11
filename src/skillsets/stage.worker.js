// The Skill sets' renderer, off the main thread (his 11 Oct recording: the
// swipe juddered at ~34 fps because the characters' WebGL shared the main
// thread with the carousel). Here it owns an OffscreenCanvas; the page only
// posts where the slabs are, and gets back where each being stands.
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

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.t === 'init') {
      canvas = m.canvas;
      core = createStageCore({
        canvas, tokens: m.tokens, reduceMotion: m.reduceMotion, pixelRatio: m.pixelRatio, maxFps: m.maxFps || 60,
        raf, caf, snap, salt: m.salt || 0,
        onBoxes: (boxes) => self.postMessage({ t: 'boxes', boxes }),
      });
      core.resize(m.w, m.h);
      self.postMessage({ t: 'ready' });
      return;
    }
    if (!core) return;
    if (m.t === 'portraits') { const out = await core.portraits(m.ids); self.postMessage({ t: 'portraits', out }); }
    else if (m.t === 'resize') core.resize(m.w, m.h);
    else if (m.t === 'slots') core.setSlots(m.slots, m.info);
    else if (m.t === 'agents') core.setAgents(m.list);
    else if (m.t === 'active') core.setActive(m.on);
    else if (m.t === 'pin') core.pin(m.id, m.p);
    else if (m.t === 'tap') core.tap(m.id);
    else if (m.t === 'stats') self.postMessage({ t: 'stats', stats: core.stats(), acts: core.acts() });
    else if (m.t === 'dispose') { core.dispose(); core = null; self.close(); }
  } catch (err) {
    self.postMessage({ t: 'error', message: String(err && err.message || err) });
  }
};
