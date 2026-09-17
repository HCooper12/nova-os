// THE SHELF — twenty-one Nova editions standing on a walnut board.
//
// Renderer conventions are Body3D's, verbatim (src/Body3D.jsx:774-830): ACES
// tone mapping, sRGB output, PCF soft shadows, a PMREM RoomEnvironment so
// every board gathers light from a whole room rather than three lamps, and a
// shadow-only ground. There is one renderer style in this app and this is it.
//
// Two things here are NOT Body3D's, on purpose:
//
//   RENDER ON DEMAND. Body3D animates a figure, so it draws every frame. A
//   shelf at rest is a still life: a frame is drawn only while something is
//   damping, the pointer is over the canvas, or a texture has just arrived.
//   Idle costs zero frames, and `window.__novaShelf.frames` (dev) is how that
//   is checked rather than asserted.
//
//   TEXTURES ARE WINDOWED. Geometry is shared; textures are not, and four
//   canvases per volume at 512×768 is real memory. Only the volumes near the
//   selection are built; the rest are released. On a phone the window is
//   tighter than on a desktop, because a phone shows three books and has a
//   fraction of the memory.
//
// Colours are token READS off the mount element — never a literal. The four
// themes and Calm therefore recolour the room, the key light and the dust for
// free, and a theme switch is observed rather than missed.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { editionFor, paletteFromImageData } from './edition.js';
import { paintFront, paintSpine, paintBack, paintFoilMask, fontsReady } from './coverArt.js';
import { createSharedMaterials } from './materials.js';
import { createBookRig } from './bookRig.js';

// --- the shelf's geometry of attention, from the reference (index.html:5825)
// Their scene is ten times ours, so the offsets that are in METRES are scaled
// by the spacing ratio; the ANGLES are not, because an angle has no units.
const SPACING = 0.155;
const SCENE = SPACING / 1.5;
const TILT_PER_STEP = 0.105;
const ROLL_PER_STEP = 0.018;
const FOCUS_SCALE = 0.09;
const DAMP_SPEED = 12;
const FADE_FROM = 3.2;
const FADE_OVER = 0.9;
const BOARD_TOP = -0.075;
const HOVER_CRACK = -0.09; // ~5° — enough to read as a board, not as a bug

const damp = THREE.MathUtils.damp;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (v) => v * v * (3 - 2 * v);

export function hasWebGL() {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const reducedMotion = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

function readTokens(el) {
  const cs = getComputedStyle(el);
  const tok = (name, fallback) => {
    const raw = cs.getPropertyValue(name).trim();
    try { return new THREE.Color(raw || fallback); } catch { return new THREE.Color(fallback); }
  };
  const root = document.documentElement;
  return {
    acc: tok('--nv-acc', '#59e6ff'),
    ink: tok('--nv-ink', '#e8ecf6'),
    void: tok('--nv-void', '#06070d'),
    bg2: tok('--nv-bg2', '#111a32'),
    calm: root.getAttribute('data-nv-calm') === '1',
    theme: root.getAttribute('data-nv-theme') || 'command',
  };
}

// A canvas texture, configured the one way this app configures them.
function tex(canvas, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function Shelf3D({ rows = [], selectedId = null, onSelect, onOpen, onFallback, height = 360 }) {
  const mount = useRef(null);
  const api = useRef(null);
  // the live props the engine reads — so a prop change never rebuilds the
  // renderer, only what it is pointing at
  const live = useRef({ rows, selectedId, onSelect, onOpen, onFallback });
  live.current = { rows, selectedId, onSelect, onOpen, onFallback };

  useEffect(() => {
    const el = mount.current;
    if (!el) return undefined;
    if (!hasWebGL()) { live.current.onFallback?.('no-webgl'); return undefined; }

    let disposed = false;
    let raf = 0;
    let suspended = false;
    let lastTime = 0;
    let frames = 0;

    const width = () => Math.max(160, el.clientWidth || 360);
    const narrow = () => width() < 820;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      live.current.onFallback?.('no-webgl');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow() ? 1.5 : 2));
    renderer.setSize(width(), height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'pan-y';
    renderer.domElement.style.display = 'block';

    const onContextLost = (e) => { e.preventDefault(); live.current.onFallback?.('context-lost'); };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    // A SHELF, not a portrait. At 0.52 m one volume filled the frame and the
    // row stopped being a row — looked at it, moved back. One metre shows the
    // selected volume and two neighbours either side, which is the reel's
    // reading: a shelf you are standing in front of.
    const camera = new THREE.PerspectiveCamera(34, width() / height, 0.05, 12);
    camera.position.set(0, 0.085, 1.0);
    camera.lookAt(0, 0.005, 0);

    let tokens = readTokens(el);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.66;

    // key / fill / rim. The key carries the theme's accent as a TINT into a
    // warm lamp, so Command rakes cool-blue and Ember rakes orange without a
    // second light rig.
    const warm = new THREE.Color('#fff0dc');
    const key = new THREE.DirectionalLight(warm.clone().lerp(tokens.acc, 0.18), 1.7);
    key.position.set(-0.5, 0.72, 0.68);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.05;
    key.shadow.camera.far = 3.2;
    key.shadow.camera.left = -0.7;
    key.shadow.camera.right = 0.7;
    key.shadow.camera.top = 0.35;
    key.shadow.camera.bottom = -0.25;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.004;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xd8e3e7, 0.34);
    fill.position.set(0.5, 0.26, 0.4);
    scene.add(fill);

    // the foil rake: the light the metal answers to, and nothing else
    const rim = new THREE.DirectionalLight(tokens.acc.clone(), 1.25);
    rim.position.set(0.36, 0.34, -0.3);
    scene.add(rim);

    const hemi = new THREE.HemisphereLight(0xfff8e8, 0x2a1d14, 0.4);
    scene.add(hemi);

    // WALNUT IS WALNUT, in all four themes. Two attempts at tinting the board
    // through a token both failed by LOOKING: --nv-bg2 turned it into a white
    // plinth under Daylight (whose bg2 is near-white), and --nv-acc turned it
    // indigo, because three lerps in LINEAR space where a bright blue swamps a
    // dark brown at 12%. The theme reaches the wood the way it reaches real
    // wood — through the light, which already carries --nv-acc. An albedo for
    // a physical material is not a palette choice, the same way the paper's
    // cream and the headband's ochre are not.
    const sharedMats = createSharedMaterials({
      woodColour: '#33200f',
      shadowColour: `#${tokens.void.getHexString()}`,
    });

    // the board they stand on
    const boardGeo = new THREE.BoxGeometry(3.4, 0.014, 0.16);
    const board = new THREE.Mesh(boardGeo, sharedMats.walnut);
    board.position.set(0, BOARD_TOP - 0.007, 0);
    board.receiveShadow = true;
    scene.add(board);

    // a shadow-only plane, the same trick Body3D uses so the screen's own
    // background still shows through under the objects
    const groundGeo = new THREE.PlaneGeometry(4, 1.2);
    const ground = new THREE.Mesh(groundGeo, new THREE.ShadowMaterial({ opacity: 0.3 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = BOARD_TOP + 0.0002;
    ground.receiveShadow = true;
    scene.add(ground);

    // ---- dust. Off under Calm and under Daylight, which is a lit room.
    let dust = null;
    const buildDust = () => {
      if (dust) { scene.remove(dust); dust.geometry.dispose(); dust.material.dispose(); dust = null; }
      if (tokens.calm || tokens.theme === 'daylight') return;
      const n = 100;
      const pos = new Float32Array(n * 3);
      let s = 20260917;
      const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (rnd() - 0.5) * 0.9;
        pos[i * 3 + 1] = BOARD_TOP + rnd() * 0.36;
        pos[i * 3 + 2] = -0.08 + rnd() * 0.28;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      dust = new THREE.Points(g, new THREE.PointsMaterial({
        color: tokens.acc.clone().lerp(warm, 0.6),
        size: 0.0022, transparent: true, opacity: 0.32,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      scene.add(dust);
    };
    buildDust();

    // ------------------------------------------------------------- state
    let list = [];                     // the rows, as given
    const rigs = new Map();            // index → rig
    const art = new Map();             // index → { image, aspect, palette }
    const pending = new Set();
    const buildQueue = [];
    let position = 0;
    let targetPosition = 0;
    let selectedIndex = 0;
    let hoveredIndex = -1;
    let reported = null;
    let pointerInside = false;
    let wheelIdle = 0;
    const pointerNdc = new THREE.Vector2();
    let pointerDirty = false;
    const raycaster = new THREE.Raycaster();

    const requestFrame = () => { if (!raf && !suspended && !disposed) raf = requestAnimationFrame(frame); };

    // ------------------------------------------------------------- art
    const loadArt = (index) => {
      const row = list[index];
      if (!row?.jacket || art.has(index) || pending.has(index)) return;
      pending.add(index);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        pending.delete(index);
        if (disposed) return;
        let palette = null;
        try {
          // blob: URLs are same-origin, so this canvas is not tainted — but a
          // tainted canvas throws on getImageData rather than returning null,
          // and one throw would take the whole shelf down.
          const c = document.createElement('canvas');
          c.width = 32; c.height = 32;
          const cx = c.getContext('2d', { willReadFrequently: true });
          cx.drawImage(img, 0, 0, 32, 32);
          palette = paletteFromImageData(cx.getImageData(0, 0, 32, 32).data, 32, 32);
        } catch { palette = null; }
        art.set(index, {
          image: img,
          aspect: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null,
          palette: palette?.length ? palette : null,
        });
        // rebuild with the real jacket, its real shape and its real colours
        dropRig(index);
        queueBuild(index);
      };
      img.onerror = () => {
        pending.delete(index);
        // an art fetch that never arrives is not a hole: the edition is
        // painted in its own cloth with the title set large.
        art.set(index, { image: null, aspect: null, palette: null });
      };
      img.src = row.jacket;
    };

    // ------------------------------------------------------------- rigs
    const buildRig = (index) => {
      const row = list[index];
      if (!row || rigs.has(index) || disposed) return;
      const a = art.get(index);
      const edition = editionFor(row, { artAspect: a?.aspect ?? null, palette: a?.palette ?? null });
      const textures = {
        front: tex(paintFront(edition, a?.image || null)),
        spine: tex(paintSpine(edition)),
        back: tex(paintBack(edition)),
        // the foil mask is data, not colour: it must not be colour-managed
        foil: tex(paintFoilMask(edition), { srgb: false }),
      };
      const rig = createBookRig(edition, textures, sharedMats);
      rig.root.position.set((index - position) * SPACING, BOARD_TOP + edition.height / 2, 0);
      rig.setOpacity(0);
      rig.root.userData.index = index;
      scene.add(rig.root);
      rigs.set(index, rig);
    };

    const dropRig = (index) => {
      const rig = rigs.get(index);
      if (!rig) return;
      scene.remove(rig.root);
      rig.dispose();
      rigs.delete(index);
    };

    const queueBuild = (index) => {
      if (!rigs.has(index) && !buildQueue.includes(index)) buildQueue.push(index);
      requestFrame();
    };

    // A phone shows three volumes and has a fraction of a laptop's memory, so
    // it keeps a tighter window. Four canvases per volume is the cost being
    // budgeted here.
    const windowSize = () => (narrow() ? 4 : 8);

    const syncWindow = () => {
      const w = windowSize();
      const centre = Math.round(position);
      const lo = centre - w, hi = centre + w;
      for (let i = 0; i < list.length; i++) {
        if (i >= lo && i <= hi) { loadArt(i); queueBuild(i); } else dropRig(i);
      }
      for (const i of [...buildQueue]) if (i < lo || i > hi) buildQueue.splice(buildQueue.indexOf(i), 1);
    };

    // ------------------------------------------------------------- layout
    const layout = (delta) => {
      const rm = reducedMotion();
      const speed = rm ? 1000 : DAMP_SPEED;
      position = rm ? targetPosition : damp(position, targetPosition, 9.5, delta);
      if (Math.abs(position - targetPosition) < 0.0004) position = targetPosition;
      if (wheelIdle > 0) {
        wheelIdle -= delta;
        if (wheelIdle <= 0) targetPosition = clamp(Math.round(targetPosition), 0, Math.max(0, list.length - 1));
      }

      const nearest = clamp(Math.round(position), 0, Math.max(0, list.length - 1));
      if (nearest !== selectedIndex && list[nearest]) {
        selectedIndex = nearest;
        syncWindow();
      }
      // THE ECHO, which cost two runs to see. Announcing every volume the
      // shelf PASSES sends the parent's selectedId back down a frame or two
      // later — by then the shelf is somewhere else, `select()` does not
      // recognise the stale id as its own, and re-targets at what was passed.
      // A scroll to Atomic Habits landed four volumes short, twice, and
      // looked like a damping bug. So selection is announced only once the
      // shelf has SETTLED, and the announced id is remembered.
      if (position === targetPosition && list[selectedIndex] && reported !== list[selectedIndex].id) {
        reported = list[selectedIndex].id;
        live.current.onSelect?.(reported);
      }

      let moving = Math.abs(position - targetPosition) > 0.0004 || wheelIdle > 0;
      for (const [index, rig] of rigs) {
        const offset = index - position;
        const distance = Math.abs(offset);
        const focus = 1 - clamp(distance, 0, 1);
        const targetX = offset * SPACING;
        const targetY = BOARD_TOP + rig.edition.height / 2 + focus * 0.15 * SCENE;
        const targetZ = (0.13 + focus * 0.24 - Math.min(distance, 2.8) * 0.07) * SCENE;
        const targetRotY = -offset * TILT_PER_STEP;
        const targetRotZ = -offset * ROLL_PER_STEP;
        const targetScale = 1 + focus * FOCUS_SCALE;

        const p = rig.root.position;
        p.x = damp(p.x, targetX, speed, delta);
        p.y = damp(p.y, targetY, speed, delta);
        p.z = damp(p.z, targetZ, speed, delta);
        rig.root.rotation.y = damp(rig.root.rotation.y, targetRotY, speed, delta);
        rig.root.rotation.z = damp(rig.root.rotation.z, targetRotZ, speed, delta);
        rig.root.scale.setScalar(damp(rig.root.scale.x, targetScale, speed, delta));

        const targetOpacity = 1 - smoothstep(clamp((distance - FADE_FROM) / FADE_OVER, 0, 1));
        const nextOpacity = rm ? targetOpacity : damp(rig.opacity, targetOpacity, 18, delta);
        rig.setOpacity(nextOpacity);

        // the crack: the front board hinges a few degrees under the pointer.
        // Never under Calm, never under reduced motion, never on touch.
        const wantCrack = hoveredIndex === index && !rm && !tokens.calm ? HOVER_CRACK : 0;
        rig.frontPivot.rotation.y = damp(rig.frontPivot.rotation.y, wantCrack, 10, delta);
        if (Math.abs(rig.frontPivot.rotation.y - wantCrack) > 1e-4) moving = true;
        if (Math.abs(p.x - targetX) > 1e-5 || Math.abs(p.z - targetZ) > 1e-5
          || Math.abs(rig.opacity - targetOpacity) > 1e-3) moving = true;
      }
      return moving;
    };

    const updateHover = () => {
      pointerDirty = false;
      if (!pointerInside) { hoveredIndex = -1; return; }
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObjects([...rigs.values()].map((r) => r.root), true)[0];
      hoveredIndex = hit ? findIndex(hit.object) : -1;
    };

    const findIndex = (object) => {
      let o = object;
      while (o && o.userData?.index === undefined) o = o.parent;
      return o?.userData?.index ?? -1;
    };

    // ------------------------------------------------------------- frame
    function frame(time) {
      raf = 0;
      if (disposed) return;
      const delta = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      // paint at most two volumes a frame: four 512×768 canvases is a few
      // milliseconds each, and seventeen at once is a visible stall
      let built = 0;
      while (buildQueue.length && built < 2) { buildRig(buildQueue.shift()); built += 1; }

      if (pointerDirty) updateHover();
      const moving = layout(delta);

      if (dust && moving) {
        dust.rotation.y = (time / 1000) * 0.012;
        dust.position.y = Math.sin((time / 1000) * 0.17) * 0.004;
      }

      renderer.render(scene, camera);
      frames += 1;
      if (api.current) api.current.frames = frames;

      // RENDER ON DEMAND: nothing damping, nothing queued, no pointer over
      // the canvas — no next frame. Idle costs nothing.
      if (moving || buildQueue.length || (pointerInside && hoveredIndex >= 0)) requestFrame();
    }

    // ------------------------------------------------------------- input
    const setTarget = (v) => {
      targetPosition = v;
      requestFrame();
    };

    // rubber-band: past the ends the shelf still moves, but grudgingly, and
    // it returns. A hard stop reads as a broken gesture.
    const band = (v) => {
      const max = Math.max(0, list.length - 1);
      if (v < 0) return v * 0.28;
      if (v > max) return max + (v - max) * 0.28;
      return v;
    };

    const onWheel = (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      setTarget(band(targetPosition + d / 90));
      wheelIdle = 0.22;
    };

    let drag = null;
    const onPointerDown = (e) => {
      if (e.pointerType !== 'touch') pointerInside = true;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: targetPosition, moved: 0 };
      renderer.domElement.setPointerCapture?.(e.pointerId);
      requestFrame();
    };
    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      if (e.pointerType !== 'touch') { pointerInside = true; pointerDirty = true; }
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x;
        drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(e.clientY - drag.y));
        // one book per ~68 css pixels: the object follows the finger
        setTarget(band(drag.start - dx / 68));
        wheelIdle = 0;
      }
      requestFrame();
    };
    const onPointerUp = (e) => {
      const wasDrag = drag && drag.moved > 7;
      if (drag) {
        renderer.domElement.releasePointerCapture?.(e.pointerId);
        if (!wasDrag) {
          const rect = renderer.domElement.getBoundingClientRect();
          pointerNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
          raycaster.setFromCamera(pointerNdc, camera);
          const hit = raycaster.intersectObjects([...rigs.values()].map((r) => r.root), true)[0];
          const index = hit ? findIndex(hit.object) : -1;
          if (index >= 0 && list[index]) {
            // a tap selects; a tap on what is already selected opens it
            if (index === selectedIndex) live.current.onOpen?.(list[index].id);
            else setTarget(index);
          }
        } else {
          setTarget(clamp(Math.round(targetPosition), 0, Math.max(0, list.length - 1)));
        }
      }
      drag = null;
      if (e.pointerType === 'touch') { pointerInside = false; hoveredIndex = -1; }
      requestFrame();
    };
    const onPointerLeave = () => { pointerInside = false; pointerDirty = true; requestFrame(); };
    const onKeyDown = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (e.key === 'Enter' || e.key === ' ') { if (list[selectedIndex]) live.current.onOpen?.(list[selectedIndex].id); return; }
      setTarget(clamp(Math.round(targetPosition) + (e.key === 'ArrowRight' ? 1 : -1), 0, Math.max(0, list.length - 1)));
    };

    const cv = renderer.domElement;
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('pointerdown', onPointerDown);
    cv.addEventListener('pointermove', onPointerMove);
    cv.addEventListener('pointerup', onPointerUp);
    cv.addEventListener('pointercancel', onPointerUp);
    cv.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('keydown', onKeyDown);

    // ------------------------------------------------------- environment
    const fit = () => {
      const w = width();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow() ? 1.5 : 2));
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      requestFrame();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', fit);

    // A tab in the background must not hold a GPU loop open.
    const onVisibility = () => {
      suspended = document.visibilityState === 'hidden';
      if (!suspended) { lastTime = performance.now(); requestFrame(); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    document.addEventListener('visibilitychange', onVisibility);

    // A theme or Calm switch must reach the room, not just the CSS.
    const themeObserver = new MutationObserver(() => {
      tokens = readTokens(el);
      key.color.copy(warm.clone().lerp(tokens.acc, 0.18));
      rim.color.copy(tokens.acc);
      buildDust();
      requestFrame();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-nv-theme', 'data-nv-calm', 'data-nv-style'] });

    // ------------------------------------------------------------- start
    api.current = {
      frames: 0,
      get rigs() { return rigs.size; },
      setRows(next) {
        list = next || [];
        const wanted = list.findIndex((r) => r.id === live.current.selectedId);
        // rows change when he filters or searches; keep the selection if it
        // survived, otherwise start at the front of the new shelf
        const keep = wanted >= 0 ? wanted : clamp(selectedIndex, 0, Math.max(0, list.length - 1));
        selectedIndex = keep;
        position = keep;
        targetPosition = keep;
        for (const i of [...rigs.keys()]) dropRig(i);
        art.clear();
        buildQueue.length = 0;
        syncWindow();
        requestFrame();
      },
      select(id) {
        if (id === reported) return;
        const i = list.findIndex((r) => r.id === id);
        if (i >= 0 && Math.round(targetPosition) !== i) { reported = id; setTarget(i); }
      },
    };

    fontsReady().then(() => {
      if (disposed) return;
      api.current.setRows(live.current.rows);
      lastTime = performance.now();
      requestFrame();
    });

    if (import.meta.env.DEV) window.__novaShelf = api.current;

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', fit);
      if (ro) ro.disconnect();
      cv.removeEventListener('wheel', onWheel);
      cv.removeEventListener('pointerdown', onPointerDown);
      cv.removeEventListener('pointermove', onPointerMove);
      cv.removeEventListener('pointerup', onPointerUp);
      cv.removeEventListener('pointercancel', onPointerUp);
      cv.removeEventListener('pointerleave', onPointerLeave);
      cv.removeEventListener('webglcontextlost', onContextLost);
      el.removeEventListener('keydown', onKeyDown);
      for (const i of [...rigs.keys()]) dropRig(i);
      if (dust) { scene.remove(dust); dust.geometry.dispose(); dust.material.dispose(); }
      boardGeo.dispose();
      groundGeo.dispose();
      ground.material.dispose();
      sharedMats.dispose();
      pmrem.dispose();
      envRT.dispose();
      renderer.dispose();
      // dispose() frees three's objects but NOT the context, and a browser
      // keeps about sixteen. Body3D:1477 learned this the hard way.
      renderer.forceContextLoss();
      if (cv.parentNode === el) el.removeChild(cv);
      if (import.meta.env.DEV && window.__novaShelf === api.current) delete window.__novaShelf;
      api.current = null;
    };
  }, [height]);

  // rows and selection are pointed at the running engine rather than
  // rebuilding it — a filter chip must not cost a renderer.
  const rowKey = rows.map((r) => r.id).join('|');
  useEffect(() => { api.current?.setRows(rows); }, [rowKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedId) api.current?.select(selectedId); }, [selectedId]);

  return (
    <div ref={mount} tabIndex={0} role="listbox" aria-label="The shelf"
      style={{ width: '100%', height: `${height}px`, outline: 'none', position: 'relative' }} />
  );
}

export default Shelf3D;
