// THE SHELF — twenty-one Nova editions standing on a walnut board, and the
// one that opens.
//
// Renderer conventions are Body3D's, verbatim (src/Body3D.jsx:774-830): ACES
// tone mapping, sRGB output, PCF soft shadows, a PMREM RoomEnvironment so
// every board gathers light from a whole room rather than three lamps, and a
// shadow-only ground. There is one renderer style in this app and this is it.
//
// Three things here are NOT Body3D's, on purpose:
//
//   RENDER ON DEMAND. Body3D animates a figure, so it draws every frame. A
//   shelf at rest is a still life, and so is an open book: a frame is drawn
//   only while something is damping, a timeline is running, the pointer is
//   over the canvas, or a texture has just arrived. Idle costs zero frames in
//   BOTH modes, and `window.__novaShelf.frames` (dev) is how that is checked
//   rather than asserted.
//
//   TEXTURES ARE WINDOWED. Geometry is shared; textures are not, and four
//   canvases per volume at 512×768 is real memory. Only the volumes near the
//   selection are built; the rest are released. On a phone the window is
//   tighter than on a desktop, because a phone shows three books and has a
//   fraction of the memory.
//
//   THE TIMELINE IS TIME-BASED AND ITS ENDPOINTS ARE EXACT. The open is a
//   free three-axis tumble (his call, Decision 3) — but a tumble whose extra
//   rotation is a function that is ZERO at both ends, so the book arrives on
//   the detail pose to the last decimal instead of near it. Interrupting the
//   open runs the same function backwards and lands on the shelf pose the
//   same way.
//
// Colours are token READS off the mount element — never a literal. The four
// themes and Calm therefore recolour the room, the key light, the floor glow
// and the dust for free, and a theme switch is observed rather than missed.

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
const SPACING = 0.152;
const SCENE = SPACING / 1.5;
// 0.105 is the reference's number at the reference's camera. At Nova's much
// closer, elevated camera it did not read at all — the fan looked like a row
// of flat cards, which is exactly what he said he saw. Raised until the tilt
// is visible at 375, which is the only place it has to be.
const TILT_PER_STEP = 0.17;
const ROLL_PER_STEP = 0.022;
const FOCUS_SCALE = 0.09;
const DAMP_SPEED = 12;
const FADE_FROM = 2.6;
const FADE_OVER = 0.8;
const BOARD_TOP = -0.075;
const HOVER_CRACK = -0.09; // ~5° — enough to read as a board, not as a bug

// THE CAMERA. Dead frontal at eye height made every volume a tilted card: no
// spine, no top edge, no thickness. Nine degrees down and twelve degrees to
// the LEFT (the spine lives at the book's -x) is the smallest move that makes
// all three read, and it is the reel's own angle.
const CAM_FOV = 30;
const CAM_DIST = 0.80;
const CAM_ELEV = 7 * (Math.PI / 180);
const CAM_AZIM = -12 * (Math.PI / 180);

const T_OPEN = 1.15;
const T_CLOSE = 0.8;
const TAU = Math.PI * 2;

const damp = THREE.MathUtils.damp;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (v) => v * v * (3 - 2 * v);
const lerp = (a, b, t) => a + (b - a) * t;
// easeInOutCubic: the travel accelerates out of the shelf and arrives calm
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

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

function tex(canvas, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// The room's own light, as a texture: the same idea as glowPanel's bloom, in
// three dimensions. Without it the volumes stand on nothing in a black void,
// which is what "a 360px strip floating in a column" actually was.
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 2, 128, 128, 127);
  g.addColorStop(0, 'rgba(255,255,255,.92)');
  g.addColorStop(0.35, 'rgba(255,255,255,.34)');
  g.addColorStop(0.72, 'rgba(255,255,255,.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.name = 'nova-room-glow';
  return t;
}

export function Shelf3D({
  rows = [], selectedId = null, openId = null,
  onSelect, onOpen, onOpened, onClosed, onFallback, height = 420,
}) {
  const mount = useRef(null);
  const api = useRef(null);
  const live = useRef({});
  live.current = { rows, selectedId, openId, onSelect, onOpen, onOpened, onClosed, onFallback };

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
    // THE CANVAS SIZES ITSELF from the element, so a viewport change never
    // rebuilds the renderer — it used to be a prop in the effect's deps, which
    // meant every resize threw away twenty-one volumes' textures.
    const vheight = () => Math.max(240, el.clientHeight || 420);
    const narrow = () => width() < 820;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      live.current.onFallback?.('no-webgl');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow() ? 1.5 : 2));
    renderer.setSize(width(), vheight());
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
    const camera = new THREE.PerspectiveCamera(CAM_FOV, width() / vheight(), 0.05, 12);
    const lookAt = new THREE.Vector3(0, 0.03, 0);
    camera.position.set(
      lookAt.x + CAM_DIST * Math.sin(CAM_AZIM) * Math.cos(CAM_ELEV),
      lookAt.y + CAM_DIST * Math.sin(CAM_ELEV),
      lookAt.z + CAM_DIST * Math.cos(CAM_AZIM) * Math.cos(CAM_ELEV),
    );
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();

    let tokens = readTokens(el);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.66;

    const warm = new THREE.Color('#fff0dc');
    const key = new THREE.DirectionalLight(warm.clone().lerp(tokens.acc, 0.18), 1.7);
    key.position.set(-0.5, 0.72, 0.68);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.05;
    key.shadow.camera.far = 3.2;
    key.shadow.camera.left = -0.7;
    key.shadow.camera.right = 0.7;
    key.shadow.camera.top = 0.4;
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
    // indigo, because three lerps in LINEAR space and a bright blue swamps a
    // dark brown at 12%. The theme reaches the wood the way it reaches real
    // wood — through the light, which already carries --nv-acc.
    const sharedMats = createSharedMaterials({
      woodColour: '#33200f',
      shadowColour: `#${tokens.void.getHexString()}`,
    });

    // ---------------------------------------------------------- the stage
    // Everything that is the ROOM rather than the books, so the open can
    // recede all of it with one number.
    const stage = new THREE.Group();
    scene.add(stage);

    // A PLANK, not a strip: deep enough to show a front edge and a lip, which
    // is what tells you the volumes are standing ON something.
    const boardGeo = new THREE.BoxGeometry(3.4, 0.028, 0.155);
    const board = new THREE.Mesh(boardGeo, sharedMats.walnut);
    board.position.set(0, BOARD_TOP - 0.014, -0.002);
    board.receiveShadow = true;
    board.castShadow = true;
    stage.add(board);

    const lipGeo = new THREE.BoxGeometry(3.4, 0.0035, 0.010);
    const lip = new THREE.Mesh(lipGeo, sharedMats.walnutLip);
    lip.position.set(0, BOARD_TOP - 0.0012, 0.0735);
    stage.add(lip);

    const groundGeo = new THREE.PlaneGeometry(4, 1.2);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = BOARD_TOP + 0.0004;
    ground.receiveShadow = true;
    stage.add(ground);

    // THE ROOM. A soft pool of the theme's accent on the floor and a wash of
    // it on the wall behind — glowPanel's bloom, in three dimensions. Without
    // these the shelf stood in a black rectangle.
    const glowMap = glowTexture();
    const glowMatFloor = new THREE.MeshBasicMaterial({
      map: glowMap, color: tokens.acc.clone(), transparent: true,
      opacity: 0.26, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    // KEEP THE POOL UNDER THE BOOKS. At 1.5 × 0.62 it reached a third of a
    // metre in front of the plank and painted a lit rectangle across the
    // bottom of the canvas — a floor, where a shelf edge should be.
    const glowFloorGeo = new THREE.PlaneGeometry(0.62, 0.15);
    const glowFloor = new THREE.Mesh(glowFloorGeo, glowMatFloor);
    glowFloor.rotation.x = -Math.PI / 2;
    glowFloor.position.set(0, BOARD_TOP + 0.0016, 0.0);
    glowFloor.renderOrder = -2;
    stage.add(glowFloor);

    const glowMatWall = new THREE.MeshBasicMaterial({
      map: glowMap, color: tokens.acc.clone(), transparent: true,
      opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const glowWallGeo = new THREE.PlaneGeometry(1.4, 0.72);
    const glowWall = new THREE.Mesh(glowWallGeo, glowMatWall);
    glowWall.position.set(0, BOARD_TOP + 0.20, -0.26);
    glowWall.renderOrder = -3;
    stage.add(glowWall);

    // ---- dust. Off under Calm and under Daylight, which is a lit room.
    let dust = null;
    const buildDust = () => {
      if (dust) { stage.remove(dust); dust.geometry.dispose(); dust.material.dispose(); dust = null; }
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
      stage.add(dust);
    };
    const applyCalm = () => {
      const on = tokens.calm ? 0 : 1;
      glowMatFloor.opacity = 0.26 * on;
      glowMatWall.opacity = 0.22 * on;
      glowMatFloor.color.copy(tokens.acc);
      glowMatWall.color.copy(tokens.acc);
    };
    buildDust();
    applyCalm();

    // ------------------------------------------------------------- state
    let list = [];
    const rigs = new Map();
    const art = new Map();
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

    // the state machine: shelf → opening → detail → closing → shelf
    let mode = 'shelf';
    let travel = 0;
    let openIndex = -1;
    // A DEV-ONLY INSTRUMENT, the same idea as the figure's motion harness: the
    // timeline can be held at an exact p so a screenshot is OF a known frame
    // rather than of whenever the capture happened to land. Nothing in the
    // shipped path reads it — `scrubbed` is false unless something in dev
    // sets it, and the first real input clears it.
    let scrubbed = false;

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
          // tainted canvas THROWS on getImageData rather than returning null,
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
        // rebuilding the volume that is currently flying would restart the
        // timeline from a new object, so late art waits for the shelf
        if (index === openIndex && mode !== 'shelf') return;
        dropRig(index);
        queueBuild(index);
      };
      img.onerror = () => {
        pending.delete(index);
        // art that never arrives is not a hole: the edition is painted in its
        // own cloth with the title set large.
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

    const windowSize = () => (narrow() ? 4 : 8);

    const syncWindow = () => {
      const w = windowSize();
      const centre = Math.round(position);
      const lo = centre - w, hi = centre + w;
      for (let i = 0; i < list.length; i++) {
        if (i >= lo && i <= hi) { loadArt(i); queueBuild(i); }
        else if (i !== openIndex) dropRig(i);
      }
      for (const i of [...buildQueue]) if (i < lo || i > hi) buildQueue.splice(buildQueue.indexOf(i), 1);
    };

    // ------------------------------------------------------------- poses
    // the pose a volume WOULD hold on the shelf, right now
    const shelfPose = (index, rig) => {
      const offset = index - position;
      const distance = Math.abs(offset);
      const focus = 1 - clamp(distance, 0, 1);
      return {
        x: offset * SPACING,
        y: BOARD_TOP + rig.edition.height / 2 + focus * 0.15 * SCENE,
        z: (0.13 + focus * 0.24 - Math.min(distance, 2.8) * 0.07) * SCENE,
        rx: 0,
        ry: -offset * TILT_PER_STEP,
        rz: -offset * ROLL_PER_STEP,
        scale: 1 + focus * FOCUS_SCALE,
        opacity: 1 - smoothstep(clamp((distance - FADE_FROM) / FADE_OVER, 0, 1)),
      };
    };

    // THE DETAIL POSE, in CAMERA space, so it stays put when the canvas
    // changes shape. Narrow: upper-left, the text column arriving beneath it.
    // Wide: the left half, the column beside it — the reel's book page.
    const detailPose = (rig) => {
      camera.updateMatrixWorld();
      const halfH = CAM_DIST * Math.tan((CAM_FOV / 2) * (Math.PI / 180));
      const halfW = halfH * camera.aspect;
      const isNarrow = narrow();
      // Centred in its own strip, not floated at the top of it: parked high,
      // the volume left a hundred pixels of black between itself and the
      // title, which is the "floating in an empty column" fault again in a
      // smaller frame.
      const u = isNarrow ? -halfW * 0.22 : -halfW * 0.50;
      const v = isNarrow ? halfH * 0.02 : 0;
      const p = new THREE.Vector3(u, v, -CAM_DIST).applyMatrix4(camera.matrixWorld);
      // face the camera, then turn another 23° so the spine and the fore-edge
      // both read — reel-0011's angle
      const faceYaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
      // fit the volume to ~62% of the canvas height at this distance
      const fit = (halfH * 2 * (isNarrow ? 0.78 : 0.72)) / rig.edition.height;
      return { x: p.x, y: p.y, z: p.z, rx: 0.10, ry: faceYaw + 0.40, rz: 0, scale: fit, opacity: 1 };
    };

    // ---------------------------------------------------------- the open
    //
    // THE TUMBLE, AND WHY ITS ENDS ARE EXACT. A free three-axis tumble is what
    // he asked for, and a free tumble is also how you miss the endpoint. So
    // the rotation is a straight interpolation PLUS a wobble term that is
    // exactly zero at p = 0 and p = 1: sin(πp) and sin(2πp) are, and a whole
    // extra turn on y lands where it started. The book rolls on all three
    // axes and still arrives on the pose to the last decimal.
    const tumble = (p) => ({
      rx: Math.sin(p * Math.PI) * 0.58,
      ry: TAU * ease(p),
      rz: Math.sin(p * Math.PI * 2) * 0.30,
      lift: Math.sin(p * Math.PI) * 0.055,
    });

    const applyTravelPose = (rig, index) => {
      const a = shelfPose(index, rig);
      const b = detailPose(rig);
      const p = clamp(travel, 0, 1);
      const e = ease(p);
      const t = tumble(p);
      rig.root.position.set(
        lerp(a.x, b.x, e),
        lerp(a.y, b.y, e) + t.lift,
        lerp(a.z, b.z, e),
      );
      rig.root.rotation.set(
        lerp(a.rx, b.rx, e) + t.rx,
        lerp(a.ry, b.ry, e) + t.ry,
        lerp(a.rz, b.rz, e) + t.rz,
      );
      rig.root.scale.setScalar(lerp(a.scale, b.scale, e));
      rig.setOpacity(1);
      rig.frontPivot.rotation.y = 0;
    };

    const snapTo = (rig, pose) => {
      rig.root.position.set(pose.x, pose.y, pose.z);
      rig.root.rotation.set(pose.rx, pose.ry, pose.rz);
      rig.root.scale.setScalar(pose.scale);
      rig.setOpacity(pose.opacity);
    };

    const setOpen = (id) => {
      const wantIndex = id ? list.findIndex((r) => r.id === id) : -1;
      if (wantIndex >= 0) {
        if (mode === 'opening' && openIndex === wantIndex) return;
        if (mode === 'detail' && openIndex === wantIndex) return;
        openIndex = wantIndex;
        mode = 'opening';
        // an open that starts while a close is still running picks up from
        // wherever the book is, rather than snapping back first
        if (travel < 0) travel = 0;
      } else if (mode === 'opening' || mode === 'detail') {
        mode = 'closing';
      }
      requestFrame();
    };

    const runTimeline = (delta) => {
      if (mode === 'shelf') return false;
      if (scrubbed) return false;
      const rm = reducedMotion();
      if (mode === 'opening') {
        travel = rm ? 1 : Math.min(1, travel + delta / T_OPEN);
        if (travel >= 1) {
          travel = 1;
          mode = 'detail';
          const rig = rigs.get(openIndex);
          // the hard settle: whatever the last frame computed, the rest pose
          // is assigned outright. Bar 5 is a promise about a number.
          if (rig) snapTo(rig, detailPose(rig));
          live.current.onOpened?.(list[openIndex]?.id ?? null);
          return true;
        }
      } else if (mode === 'closing') {
        travel = rm ? 0 : Math.max(0, travel - delta / T_CLOSE);
        if (travel <= 0) {
          travel = 0;
          const rig = rigs.get(openIndex);
          // and the same at the other end: an interrupted open lands on the
          // exact shelf pose, not near it
          if (rig) snapTo(rig, shelfPose(openIndex, rig));
          mode = 'shelf';
          openIndex = -1;
          live.current.onClosed?.();
          syncWindow();
          return true;
        }
      }
      return mode === 'opening' || mode === 'closing';
    };

    // ------------------------------------------------------------- layout
    const layout = (delta) => {
      const rm = reducedMotion();
      const speed = rm ? 1000 : DAMP_SPEED;
      const onShelf = mode === 'shelf';

      if (onShelf) {
        position = rm ? targetPosition : damp(position, targetPosition, 9.5, delta);
        if (Math.abs(position - targetPosition) < 0.0004) position = targetPosition;
        if (wheelIdle > 0) {
          wheelIdle -= delta;
          if (wheelIdle <= 0) targetPosition = clamp(Math.round(targetPosition), 0, Math.max(0, list.length - 1));
        }
        const nearest = clamp(Math.round(position), 0, Math.max(0, list.length - 1));
        if (nearest !== selectedIndex && list[nearest]) { selectedIndex = nearest; syncWindow(); }
        // THE ECHO, which cost two runs to see. Announcing every volume the
        // shelf PASSES sends the parent's selectedId back down a frame or two
        // later — by then the shelf is somewhere else, `select()` does not
        // recognise the stale id as its own, and re-targets at what was
        // passed. So selection is announced only once the shelf has SETTLED.
        if (position === targetPosition && list[selectedIndex] && reported !== list[selectedIndex].id) {
          reported = list[selectedIndex].id;
          live.current.onSelect?.(reported);
        }
      }

      // the room recedes as the book comes forward
      const stageFade = 1 - ease(clamp(travel, 0, 1));
      sharedMats.walnut.opacity = stageFade;
      sharedMats.walnutLip.opacity = stageFade;
      groundMat.opacity = 0.3 * stageFade;
      glowMatFloor.opacity = (tokens.calm ? 0 : 0.26) * stageFade;
      glowMatWall.opacity = (tokens.calm ? 0 : 0.22) * stageFade;
      stage.visible = stageFade > 0.01;

      let moving = onShelf && (Math.abs(position - targetPosition) > 0.0004 || wheelIdle > 0);

      for (const [index, rig] of rigs) {
        if (index === openIndex && mode !== 'shelf') { applyTravelPose(rig, index); continue; }

        const a = shelfPose(index, rig);
        const p = rig.root.position;
        p.x = damp(p.x, a.x, speed, delta);
        p.y = damp(p.y, a.y, speed, delta);
        p.z = damp(p.z, a.z, speed, delta);
        rig.root.rotation.x = damp(rig.root.rotation.x, a.rx, speed, delta);
        rig.root.rotation.y = damp(rig.root.rotation.y, a.ry, speed, delta);
        rig.root.rotation.z = damp(rig.root.rotation.z, a.rz, speed, delta);
        rig.root.scale.setScalar(damp(rig.root.scale.x, a.scale, speed, delta));

        // every other volume goes with the room
        const targetOpacity = a.opacity * stageFade;
        const nextOpacity = rm ? targetOpacity : damp(rig.opacity, targetOpacity, 18, delta);
        rig.setOpacity(nextOpacity);

        const wantCrack = onShelf && hoveredIndex === index && !rm && !tokens.calm ? HOVER_CRACK : 0;
        rig.frontPivot.rotation.y = damp(rig.frontPivot.rotation.y, wantCrack, 10, delta);
        if (Math.abs(rig.frontPivot.rotation.y - wantCrack) > 1e-4) moving = true;
        if (Math.abs(p.x - a.x) > 1e-5 || Math.abs(p.z - a.z) > 1e-5
          || Math.abs(rig.opacity - targetOpacity) > 1e-3) moving = true;
      }
      return moving;
    };

    const findIndex = (object) => {
      let o = object;
      while (o && o.userData?.index === undefined) o = o.parent;
      return o?.userData?.index ?? -1;
    };

    const hitIndexAt = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObjects([...rigs.values()].map((r) => r.root), true)[0];
      return hit ? findIndex(hit.object) : -1;
    };

    const updateHover = () => {
      pointerDirty = false;
      if (!pointerInside || mode !== 'shelf') { hoveredIndex = -1; return; }
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObjects([...rigs.values()].map((r) => r.root), true)[0];
      hoveredIndex = hit ? findIndex(hit.object) : -1;
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
      const travelling = runTimeline(delta);
      const moving = layout(delta) || travelling;

      if (dust && moving) {
        dust.rotation.y = (time / 1000) * 0.012;
        dust.position.y = Math.sin((time / 1000) * 0.17) * 0.004;
      }

      renderer.render(scene, camera);
      frames += 1;
      if (api.current) { api.current.frames = frames; api.current.mode = mode; api.current.travel = travel; }

      // RENDER ON DEMAND, in BOTH modes: nothing damping, no timeline, nothing
      // queued, no pointer over the canvas — no next frame.
      if (moving || buildQueue.length || (pointerInside && hoveredIndex >= 0)) requestFrame();
    }

    // ------------------------------------------------------------- input
    const setTarget = (v) => { targetPosition = v; requestFrame(); };

    const band = (v) => {
      const max = Math.max(0, list.length - 1);
      if (v < 0) return v * 0.28;
      if (v > max) return max + (v - max) * 0.28;
      return v;
    };

    const onWheel = (e) => {
      if (mode !== 'shelf') return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      setTarget(band(targetPosition + d / 90));
      wheelIdle = 0.22;
    };

    let drag = null;
    const onPointerDown = (e) => {
      if (mode !== 'shelf') return;
      if (e.pointerType !== 'touch') pointerInside = true;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: targetPosition, moved: 0 };
      // POINTER CAPTURE THROWS more often than it looks: a pointer that has
      // already been released, a synthetic event, a capture the browser took
      // back. Unguarded it threw BEFORE the tap was processed, and the tap —
      // which is how a volume is opened — silently did nothing. Capture is a
      // nicety for the drag; the tap is the feature.
      try { renderer.domElement.setPointerCapture?.(e.pointerId); } catch { /* drag still tracks by id */ }
      requestFrame();
    };
    const onPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      if (e.pointerType !== 'touch') { pointerInside = true; pointerDirty = true; }
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x;
        drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(e.clientY - drag.y));
        setTarget(band(drag.start - dx / 68));
        wheelIdle = 0;
      }
      requestFrame();
    };
    const onPointerUp = (e) => {
      const wasDrag = drag && drag.moved > 7;
      if (drag) {
        try { renderer.domElement.releasePointerCapture?.(e.pointerId); } catch { /* never owned it */ }
        if (!wasDrag) {
          const index = hitIndexAt(e.clientX, e.clientY);
          if (index >= 0 && list[index]) {
            // a tap selects; a tap on what is already selected opens it
            if (index === selectedIndex) openRequest(index);
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

    // The open carries the volume's OWN colours up to the page, because the
    // palette the shelf derived from the real poster is better than anything
    // the view model could know before the image loaded.
    const openRequest = (index) => {
      const rig = rigs.get(index);
      const row = list[index];
      if (!row) return;
      live.current.onOpen?.(row.id, rig
        ? { accent: rig.edition.accent, cloth: rig.edition.cloth, foil: rig.edition.foil }
        : null);
    };

    const onKeyDown = (e) => {
      if (mode !== 'shelf') return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (e.key === 'Enter' || e.key === ' ') { openRequest(selectedIndex); return; }
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
      const w = width(), h = vheight();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow() ? 1.5 : 2));
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      requestFrame();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', fit);

    const onVisibility = () => {
      suspended = document.visibilityState === 'hidden';
      if (!suspended) { lastTime = performance.now(); requestFrame(); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const themeObserver = new MutationObserver(() => {
      tokens = readTokens(el);
      key.color.copy(warm.clone().lerp(tokens.acc, 0.18));
      rim.color.copy(tokens.acc);
      buildDust();
      applyCalm();
      requestFrame();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-nv-theme', 'data-nv-calm', 'data-nv-style'] });

    // ------------------------------------------------------------- start
    api.current = {
      frames: 0, mode: 'shelf', travel: 0,
      get rigs() { return rigs.size; },
      get selectedIndex() { return selectedIndex; },
      // for verification: the open volume's pose, so "the last frame of the
      // open equals the detail pose" can be a number rather than a squint
      pose(index) {
        const rig = rigs.get(typeof index === 'number' ? index : openIndex);
        if (!rig) return null;
        const p = rig.root.position, r = rig.root.rotation;
        const round = (n) => Number(n.toFixed(5));
        return {
          x: round(p.x), y: round(p.y), z: round(p.z),
          // the tumble adds a whole turn, so y is reported on (-π, π] — a
          // rest pose of ~0 must not read as 6.28317
          rx: round(r.x), ry: round(Math.atan2(Math.sin(r.y), Math.cos(r.y))), rz: round(r.z),
          scale: round(rig.root.scale.x),
        };
      },
      setRows(next) {
        list = next || [];
        const wanted = list.findIndex((r) => r.id === live.current.selectedId);
        const keep = wanted >= 0 ? wanted : clamp(selectedIndex, 0, Math.max(0, list.length - 1));
        selectedIndex = keep;
        position = keep;
        targetPosition = keep;
        for (const i of [...rigs.keys()]) dropRig(i);
        art.clear();
        buildQueue.length = 0;
        mode = 'shelf'; travel = 0; openIndex = -1;
        syncWindow();
        requestFrame();
      },
      select(id) {
        if (id === reported || mode !== 'shelf') return;
        const i = list.findIndex((r) => r.id === id);
        if (i >= 0 && Math.round(targetPosition) !== i) { reported = id; setTarget(i); }
      },
      setOpen,
      fit,
      // verification only: hold the open timeline at p, or let it run again
      scrub(p, index) {
        if (!import.meta.env.DEV) return;
        if (typeof index === 'number') openIndex = index;
        else if (openIndex < 0) openIndex = selectedIndex;
        // hold whichever direction is already running, so releasing the hold
        // resumes it rather than reversing it
        if (mode === 'shelf') mode = 'opening';
        travel = clamp(p, 0, 1);
        scrubbed = true;
        requestFrame();
      },
      unscrub() { scrubbed = false; requestFrame(); },
    };

    fontsReady().then(() => {
      if (disposed) return;
      api.current.setRows(live.current.rows);
      if (live.current.openId) setOpen(live.current.openId);
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
      if (dust) { dust.geometry.dispose(); dust.material.dispose(); }
      boardGeo.dispose();
      lipGeo.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      glowFloorGeo.dispose();
      glowWallGeo.dispose();
      glowMatFloor.dispose();
      glowMatWall.dispose();
      glowMap.dispose();
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
  }, []);

  // rows, selection and the open are pointed at the running engine rather than
  // rebuilding it — a filter chip must not cost a renderer, and the open must
  // not cost the textures it is about to fly.
  const rowKey = rows.map((r) => r.id).join('|');
  useEffect(() => { api.current?.setRows(rows); }, [rowKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedId) api.current?.select(selectedId); }, [selectedId]);
  useEffect(() => { api.current?.setOpen(openId); }, [openId]);
  useEffect(() => { api.current?.fit(); }, [height]);

  return (
    <div ref={mount} tabIndex={0} role="listbox" aria-label="The shelf"
      style={{ width: '100%', height: `${height}px`, outline: 'none', position: 'relative' }} />
  );
}

export default Shelf3D;
