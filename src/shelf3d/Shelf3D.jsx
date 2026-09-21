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
//   AND A VOLUME IS BOUND BEFORE IT IS PRINTED. Painting those canvases is
//   the one thing too expensive to do with a finger down, and the first
//   version simply did not: the build budget was ZERO during a drag, so a
//   swipe that outran the window presented a room with a plank, a word on the
//   wall and NO BOOKS until the finger lifted. He filmed it. So a build now
//   has two stages: a CHEAP binding — boards, spine, page block, headbands,
//   in the edition's own cloth, no canvas anywhere — which is affordable
//   mid-drag, and the painted cover, which replaces it in place (same pose,
//   same opacity) once the hand is off the glass. The invariant is stated as
//   a number, not a hope: `window.__novaShelf.emptyFrames` counts any frame
//   drawn with volumes in the list and none of them visible, and it is 0.
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
import { startsInEdgeGuard } from '../swipeCore.js';
import { editionFor } from './edition.js';
import { artFor, rememberArt } from './artPalette.js';
import { paintFront, paintSpine, paintBack, paintFoilMask, paintWord, fontsReady, DETAIL_SCALE, WORD_W, WORD_H } from './coverArt.js';
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
// THE WORD'S share of the room's light. Faint enough that it is a wall and not
// a headline — the volumes are the subject — and strong enough to survive the
// Daylight theme, where the ink is dark on a light ground rather than the
// reverse. Checked at 375px and at 1280 in both, not reasoned about.
const WORD_ALPHA = 0.17;
// Between the wash (z -0.38) and the row (z ~0.01), so the volumes cut the
// letters at the waist. That cut is the whole point of the word being there.
const WORD_Z = -0.16;
// ...and how much of the frame it spans at that depth. FITTED, never a world
// number: at 375px the visible width back there is 0.44, and a plane sized by
// hand for a desktop showed two letters of "Library" and read as a bug.
const WORD_FILL = 0.88;
// AND HOW HIGH IT HANGS. Centred on the row it sat entirely BEHIND the focused
// volume and only the serif of its first letter escaped — a word you cannot
// read is decoration, not a name. Level with the top of a full-height volume,
// its upper half clears the row and its lower half is cut by it, which is the
// reel's trick and the reason the word is in the room at all.
const WORD_Y = BOARD_TOP + 0.235;
const HOVER_CRACK = -0.09; // ~5° — enough to read as a board, not as a bug

// THE BOARD IN DETAIL. HOVER_CRACK is a POINTER'S answer, and the device Nova
// is for has no pointer: onPointerUp clears hoveredIndex on touch, so the
// hinge bookRig builds — "the one gesture that says 'this is a book'" — could
// never be seen on his phone. The open is where it belongs. A parked volume
// stands with its board off the page block, which is what an open book looks
// like, and which is the one thing the shelf's own detail never showed.
// ~35°: far enough that the fore-edge and the paper read, not so far that a
// SOLID page block turns side-on and shows as a blank cream slab. Checked
// against a shut board at the same pose, at 375px, not reasoned about: -0.95
// swings the board INTO the camera and skews the plate, and 0 is a slab.
const DETAIL_CRACK = -0.62;
// ...and it opens LAST. A board swinging through a three-axis tumble is a flap,
// not a book opening, so the hinge waits until the roll has all but landed.
const CRACK_FROM = 0.62;

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

// THE SHINE (Phase 4). Every number here was set by looking at two captures
// two seconds apart and asking whether the highlight had MOVED.
//
// ENV_SWEEP 0.95 rad — how far the room turns around the volume across the
//   open. Less than this and the jacket's highlight barely crosses the board;
//   more and the whole scene visibly swings, which reads as the camera moving.
// SWAY_DEG 2 — the open volume's idle turn. Two degrees is under the
//   threshold where it reads as rotation and over the threshold where the
//   specular sits still; it is the difference between a photograph and an
//   object.
// SWAY_PERIOD 6.5 s — slow enough to be ambient, fast enough that two
//   screenshots two seconds apart land on visibly different phases.
// ENV_BREATH 0.32 rad — the room's own drift in detail, in antiphase to the
//   sway, so the cloth's broad sheen and the foil's hard specular travel at
//   different rates. That separation IS Bar 4: the metal catching light on
//   its own beat rather than the board's.
const ENV_SWEEP = 0.95;
const SWAY_DEG = 2;
const SWAY_PERIOD = 6.5;
const ENV_BREATH = 0.32;
const TAU = Math.PI * 2;

// THE SETTLE (17 Sep). The sway was a PERMANENT rAF: 575 frames in five idle
// seconds on a parked volume, on a phone, forever. An object that never stops
// moving is not calmer than one that does — it is a battery drain with a
// heartbeat. The shine still crosses the jacket during the open, and the
// volume still breathes as it arrives; then it eases to exactly zero and the
// loop stops. Five seconds is long enough that two screenshots a second apart
// land on different phases and short enough that a book left open is still.
const SETTLE_TIME = 5;

// HOW FAR A FINGER TRAVELS PER VOLUME, and why it is not a constant.
//
// It was 68 CSS px. On his 402px phone one ordinary swipe crossed six volumes
// — the ±3 window could not contain the jump, so every rig on screen was the
// wrong one and the shelf had to rebuild the lot mid-gesture. Hypersensitive
// to the hand AND the thing that made the shelf churn.
//
// The honest unit is the volume's own size ON SCREEN. The camera's FOV and
// distance are fixed, so the frustum's half-height in world units is fixed
// too: a volume's projected width therefore depends on the canvas HEIGHT
// alone, never its width. One volume is SPACING world units, so
// `SPACING * h / (2·halfH)` is exactly how many CSS pixels of canvas a volume
// occupies — 161px at his 454px stage. DRAG_GAIN 0.75 makes the shelf travel
// a little faster than the finger (a list's feel, not a map's), landing at
// ~121px per volume on his phone: a 200px swipe moves 1.65 volumes, which
// the ±3 window holds with two to spare.
const DRAG_GAIN = 0.75;
const HALF_H = CAM_DIST * Math.tan((CAM_FOV / 2) * (Math.PI / 180));

// VOLUMES THAT HAVE JUST LEFT THE WINDOW ARE WORTH MORE THAN NOTHING. A flick
// that overshoots and comes back rebuilds what it already had; four kept rigs
// (textures included) is cheaper than four rebuilds, and they are dropped the
// moment the finger lifts.
const LRU_KEEP = 4;
// Cheap bindings are a fraction of a painted cover, so a drag can afford more
// than the zero it used to spend — but not unlimited. At three a frame the
// 4x-throttled trace of a 350px out-and-back had two 74 ms frames in it, both
// of them three builds landing together. Two is the number: the worst frame
// halves, and the fill rate is still far more than a drag can outrun (a 350px
// swipe crosses 2.9 volumes over ~18 frames, so it needs about one build a
// frame; the starvation floor below covers the cold start).
const DRAG_BUILDS = 2;

// THE CHEAP BINDING'S RESOLUTION, and why it is not zero.
//
// The first version of this stage painted nothing at all: cloth colour,
// boards, a page block, no canvas anywhere. It killed the empty room, and the
// capture said the rest out loud — three flat terracotta slabs, which is not
// a volume waiting to be printed, it is the grey box the whole edition system
// exists to avoid.
//
// A quarter scale is 128×192: one twelfth the front's pixels, one thirtieth
// of the full four-canvas set, and it is the REAL cover — the real plate, the
// real title, the real mark, soft. A book read while the shelf is moving is
// soft anyway. What it does without is the foil mesh, because a blurred
// alpha mask puts a metallic halo on the cloth around the type; the title is
// still there, painted in the foil's own colour, it simply has no specular
// until the hand lifts.
const CHEAP_SCALE = 0.25;

// A VOLUME ARRIVES FAINT, NEVER ABSENT. New rigs faded in from literal zero,
// which means a rig built on a frame whose delta rounds to nothing is a rig
// that exists and cannot be seen. It is a one-frame hole rather than the
// seconds-long one he filmed, and it is the same fault; eight percent is
// still a fade, and it is still on screen.
const FADE_IN_FROM = 0.08;

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
  rows = [], selectedId = null, openId = null, word = '',
  onSelect, onOpen, onOpened, onClosed, onFallback, height = 420,
}) {
  const mount = useRef(null);
  const api = useRef(null);
  const live = useRef({});
  live.current = { rows, selectedId, openId, word, onSelect, onOpen, onOpened, onClosed, onFallback };

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
    // 1.25 ON A PHONE, measured not guessed: at 1.5 the throttled trace sat
    // above the 33 ms cap, and a shelf of bound volumes has no fine detail
    // that a quarter of a pixel resolves — the plate and the foil are hi-res
    // in the TEXTURE, which is where the sharpness actually comes from.
    const ratio = () => Math.min(window.devicePixelRatio || 1, narrow() ? 1.25 : 2);
    renderer.setPixelRatio(ratio());
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
    // Aimed a little higher than the volumes' centre so the frame spends its
    // pixels on books instead of plank — the board was taking a fifth of the
    // canvas at the old aim.
    const lookAt = new THREE.Vector3(0, 0.055, 0);
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
    // 512 on a phone: one directional light over nine boxes, and the shadow is
    // a soft contact patch rather than an outline anyone reads
    key.shadow.mapSize.set(narrow() ? 512 : 1024, narrow() ? 512 : 1024);
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
    // THE TOP FACE IS ITS OWN MATERIAL. An up-facing rough plane gathers the
    // RoomEnvironment's ceiling almost head-on, and under Daylight it clipped
    // to a white ledge — two rounds of chasing the albedo did nothing because
    // the albedo was never the problem. BoxGeometry groups run
    // [+x, -x, +y, -y, +z, -z]; only +y needed less sky.
    const boardFaces = [
      sharedMats.walnut, sharedMats.walnut, sharedMats.walnutTop,
      sharedMats.walnut, sharedMats.walnut, sharedMats.walnut,
    ];
    const board = new THREE.Mesh(boardGeo, boardFaces);
    board.position.set(0, BOARD_TOP - 0.014, -0.002);
    board.receiveShadow = true;
    board.castShadow = true;
    stage.add(board);

    // a lit edge, not a moulding: 2mm reads as a plank, 3.5 read as a shelf
    // with a gold stripe painted on it
    const lipGeo = new THREE.BoxGeometry(3.4, 0.002, 0.007);
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
      opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    // KEEP THE POOL UNDER THE BOOKS. At 1.5 × 0.62 it reached a third of a
    // metre in front of the plank and painted a lit rectangle across the
    // bottom of the canvas — a floor, where a shelf edge should be.
    const glowFloorGeo = new THREE.PlaneGeometry(0.72, 0.19);
    const glowFloor = new THREE.Mesh(glowFloorGeo, glowMatFloor);
    glowFloor.rotation.x = -Math.PI / 2;
    glowFloor.position.set(0, BOARD_TOP + 0.0016, 0.0);
    glowFloor.renderOrder = -2;
    stage.add(glowFloor);

    const glowMatWall = new THREE.MeshBasicMaterial({
      map: glowMap, color: tokens.acc.clone(), transparent: true,
      opacity: 0.46, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    // WIDER AND FURTHER BACK than the intensity alone wanted. At 1.5 × 0.80
    // and 46% the plane's own gradient fell off inside the frame and the wash
    // read as a lit PANEL hanging behind the shelf. Spreading the same light
    // over a bigger, more distant plane puts the falloff outside the canvas.
    const glowWallGeo = new THREE.PlaneGeometry(2.1, 1.05);
    const glowWall = new THREE.Mesh(glowWallGeo, glowMatWall);
    glowWall.position.set(0, BOARD_TOP + 0.24, -0.38);
    glowWall.renderOrder = -3;
    stage.add(glowWall);

    // ---- THE WORD. What this shelf currently IS, set on the back wall where
    // the volumes cross it. The room had a plank, two washes of light and some
    // dust in it — nothing with an edge, so the volumes stood in front of
    // nothing. Transparent and depth-tested, so the cut is the depth buffer's
    // doing and not a guess about z-order.
    // It carries no map until setWord paints one — an empty shelf says nothing
    // rather than standing a leftover word in an empty room.
    // a UNIT plane, scaled by layoutWord to whatever the canvas is right now
    const wordGeo = new THREE.PlaneGeometry(1, 1);
    const wordMat = new THREE.MeshBasicMaterial({
      color: tokens.ink.clone(), transparent: true, opacity: 0,
      depthWrite: false,
    });
    const wordMesh = new THREE.Mesh(wordGeo, wordMat);
    wordMesh.position.set(0, WORD_Y, WORD_Z);
    wordMesh.renderOrder = -1;
    wordMesh.visible = false;
    stage.add(wordMesh);
    let wordTex = null;
    let wordText = '';

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
      glowMatFloor.opacity = 0.55 * on;
      glowMatWall.opacity = 0.38 * on;
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
    // which volume the frame loop is allowed to paint at DETAIL_SCALE, set by
    // the dwell in syncHires rather than read from the focus every frame
    let hiresTarget = -1;
    // dev instrument: the fault this whole two-stage build exists to kill
    let emptyFrames = 0;
    const emptyAt = [];
    // A DEV-ONLY INSTRUMENT, the same idea as the figure's motion harness: the
    // timeline can be held at an exact p so a screenshot is OF a known frame
    // rather than of whenever the capture happened to land. Nothing in the
    // shipped path reads it — `scrubbed` is false unless something in dev
    // sets it, and the first real input clears it.
    let scrubbed = false;
    let drag = null;
    // the shine's own clock: it only advances while a volume is open, so the
    // shelf keeps its zero-frame idle
    let shinePhase = 0;
    let sway = 0;
    // seconds since the volume arrived on the detail pose; the sway and the
    // breath are scaled by an envelope that reaches exactly zero at
    // SETTLE_TIME, and then the loop stops asking for frames
    let settle = 0;

    const requestFrame = () => { if (!raf && !suspended && !disposed) raf = requestAnimationFrame(frame); };

    // THE WORD, repainted only when it actually changes. Every filter chip and
    // every keystroke in the search box re-runs the vals and pushes a prop, so
    // the guard is what keeps a canvas paint and a texture upload off the
    // typing path. An empty word hides the plane rather than showing a blank.
    const setWord = (next) => {
      const text = String(next || '').trim();
      if (text === wordText) return;
      wordText = text;
      if (wordTex) { wordTex.dispose(); wordTex = null; }
      wordMat.map = null;
      wordMesh.visible = Boolean(text);
      if (text) {
        wordTex = tex(paintWord(text));
        wordMat.map = wordTex;
        layoutWord();
      }
      wordMat.needsUpdate = true;
      requestFrame();
    };

    // ------------------------------------------------------------- art
    const loadArt = (index) => {
      const row = list[index];
      if (!row?.jacket || art.has(index) || pending.has(index)) return;
      pending.add(index);
      // shared with the Covers grid (artPalette.js) so one source has one
      // colour, whichever view is looking at it
      artFor(row.jacket).then((value) => {
        pending.delete(index);
        if (disposed || !value) return;
        art.set(index, value);
        rememberArt(row.jacket, value);
        // rebuilding the volume that is currently flying would restart the
        // timeline from a new object, so late art waits for the shelf
        if (index === openIndex && mode !== 'shelf') return;
        if (!value.image) return;
        // IN PLACE, not drop-then-queue: the old rig used to be removed here
        // and the new one built a frame later, which is one more frame with a
        // hole in the shelf. It inherits the pose and the opacity instead.
        const rig = rigs.get(index);
        if (!rig) { queueBuild(index); return; }
        // ...but not with a finger down. Art landing mid-drag would otherwise
        // buy back the very canvas paint the cheap binding exists to avoid —
        // the volume is marked instead, and repainted when the hand lifts.
        if (drag) { rig.stale = true; return; }
        replaceRig(index, rig.hires, false);
      });
    };

    // ------------------------------------------------------------- rigs
    // Whichever volume you are LOOKING at: the open one, or the selected one.
    const focusIndex = () => (openIndex >= 0 ? openIndex : selectedIndex);

    // `cheap` is the first stage: the real cover at CHEAP_SCALE and nothing
    // else — no spine, no colophon, no foil — which is affordable with a
    // finger down. The volume is its own cloth, its own proportions and its
    // own jacket; it is simply soft until the hand lifts.
    const buildRig = (index, hires = false, cheap = false) => {
      const row = list[index];
      if (!row || rigs.has(index) || disposed) return null;
      const a = art.get(index);
      const edition = editionFor(row, { artAspect: a?.aspect ?? null, palette: a?.palette ?? null });
      const k = hires ? DETAIL_SCALE : 1;
      const textures = cheap ? {
        front: tex(paintFront(edition, a?.image || null, CHEAP_SCALE)),
        spine: null, back: null, foil: null,
      } : {
        // only the two faces you actually read are doubled; the spine is
        // 128px of type and the back is a colophon, and both stay small
        front: tex(paintFront(edition, a?.image || null, k)),
        spine: tex(paintSpine(edition)),
        // THE BACK BOARD IS ONLY EVER SEEN MID-TUMBLE, which only the focused
        // volume does. Painting a 512×768 colophon for all nine rigs was a
        // quarter of the build cost for a face nobody looks at; the others
        // get plain cloth, which is what the back of a book looks like from
        // the front anyway.
        back: hires ? tex(paintBack(edition)) : null,
        // the foil mask is data, not colour: it must not be colour-managed
        foil: tex(paintFoilMask(edition, k), { srgb: false }),
      };
      const rig = createBookRig(edition, textures, sharedMats);
      rig.hires = hires && !cheap;
      rig.cheap = cheap;
      // ON ITS POSE, not near it. This used to set x and y only, so a volume
      // built while the shelf was scrolling appeared upright and un-tilted at
      // z 0 and then damped into the fan — a pop, on top of the fade.
      const pose = shelfPose(index, rig);
      snapTo(rig, pose);
      rig.setOpacity(Math.min(FADE_IN_FROM, pose.opacity));
      rig.root.userData.index = index;
      scene.add(rig.root);
      rigs.set(index, rig);
      return rig;
    };

    const dropRig = (index) => {
      const rig = rigs.get(index);
      if (!rig) return;
      scene.remove(rig.root);
      rig.dispose();
      rigs.delete(index);
    };

    // SWAP, DON'T BLINK. Upgrading a cheap binding to its painted cover, or
    // giving the focus its DETAIL_SCALE pair, replaces one object with
    // another — and the replacement inherits the pose and the opacity of the
    // one it replaces, so nothing on screen changes except what is printed.
    const replaceRig = (index, hires, cheap) => {
      const old = rigs.get(index);
      let keep = null;
      if (old) {
        keep = {
          opacity: old.opacity,
          grounded: old.grounded,
          position: old.root.position.clone(),
          rotation: old.root.rotation.clone(),
          scale: old.root.scale.x,
          crack: old.frontPivot.rotation.y,
        };
        dropRig(index);
      }
      const rig = buildRig(index, hires, cheap);
      if (rig && keep) {
        rig.root.position.copy(keep.position);
        rig.root.rotation.copy(keep.rotation);
        rig.root.scale.setScalar(keep.scale);
        rig.frontPivot.rotation.y = keep.crack;
        rig.setGrounded(keep.grounded);
        rig.setOpacity(keep.opacity);
      }
      return rig;
    };

    // Does this index want the frame loop to do anything for it? A missing
    // rig always. A cheap one, or one whose art landed after it was painted,
    // as soon as the hand is off the glass — never during the drag, which is
    // the whole point of the cheap binding.
    const wants = (index) => {
      const rig = rigs.get(index);
      if (!rig) return true;
      if (drag) return false;
      return !!rig.cheap || !!rig.stale;
    };

    const queueBuild = (index, first = false) => {
      if (wants(index) && !buildQueue.includes(index)) {
        if (first) buildQueue.unshift(index); else buildQueue.push(index);
      }
      requestFrame();
    };

    // syncHires asks for a rebuild the ordinary test would refuse — the rig
    // is there and it is painted, it is simply painted at the wrong size.
    const forceQueue = (index, first = false) => {
      if (!buildQueue.includes(index)) {
        if (first) buildQueue.unshift(index); else buildQueue.push(index);
      }
      requestFrame();
    };

    // THE ONE YOU ARE LOOKING AT IS PAINTED TWICE THE SIZE, and only while you
    // are looking at it. Swapped on the SETTLED selection, never mid-scroll:
    // repainting four canvases per volume as the shelf flies past is exactly
    // the stall the build queue exists to avoid. The old one is dropped, so
    // there is never more than one 1024×1536 pair alive.
    let hiresWanted = true;
    // A DWELL BEFORE THE FOCUS SHARPENS. Repainting a 1024×1536 pair is ~35 ms
    // of real work; landing it in the frame the shelf settles on produced the
    // one long frame left in the 4x trace. Waiting a quarter second puts it
    // where nothing at all is moving, and by then he has stopped scrolling
    // anyway — which is the only moment the extra resolution is for.
    let hiresDwell = 0;
    const syncHires = () => {
      if (mode !== 'shelf' || drag) return;
      const want = focusIndex();
      hiresTarget = hiresWanted ? want : -1;
      // demote and promote both go through the queue and both REPLACE rather
      // than drop: the old code dropped here and rebuilt a frame later, and
      // that gap is a volume missing from the shelf for one frame.
      for (const [i, rig] of rigs) if (rig.hires && i !== want) forceQueue(i);
      const cur = rigs.get(want);
      if (hiresWanted && cur && !cur.hires) forceQueue(want, true);
    };

    // ±3 on a phone: the fade is complete by 3.4 volumes out, so a fourth is
    // paying for textures nobody can see. Measured against the 4x trace, not
    // guessed — it is six fewer material binds and six fewer shadow draws.
    const windowSize = () => (narrow() ? 3 : 8);

    const syncWindow = () => {
      const w = windowSize();
      const centre = Math.round(position);
      const lo = centre - w, hi = centre + w;
      const strays = [];
      const want = [];
      for (let i = 0; i < list.length; i++) {
        if (i >= lo && i <= hi) want.push(i);
        else if (i !== openIndex && rigs.has(i)) strays.push(i);
      }
      // CENTRE-OUT, not left-to-right. Queued in index order, a shelf opened
      // at volume ten spent its first two frames building volumes seven and
      // eight — the two furthest from the one he is looking at. The volume
      // under the eye is built first, then its neighbours, then the fade.
      want.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
      for (const i of want) { loadArt(i); queueBuild(i); }
      // THE LRU, and only while a finger is down. A drag crosses the window
      // several times over; the volumes just outside it are the ones the next
      // few hundred milliseconds are most likely to ask for again. A settled
      // shelf goes back to exactly its window, so nothing is retained for
      // longer than the gesture that might want it.
      const keep = drag ? LRU_KEEP : 0;
      strays.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
      for (let n = keep; n < strays.length; n++) dropRig(strays[n]);
      for (const i of [...buildQueue]) if (i < lo || i > hi) buildQueue.splice(buildQueue.indexOf(i), 1);
      syncHires();
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
        grounded: 1,
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
      // On narrow the column sits UNDER the canvas, so the volume is not
      // pushed to one side — but it IS pushed up.
      //
      // ON A PHONE IT PARKS HIGH, and this is the fourth fault from his 402px
      // recording. Centred in a 454px strip at 78% of its height, the volume
      // took 52% of the viewport on its own and the dossier beneath it —
      // "Woven from the book's own text or your notes", the Original chip —
      // started below the fold and ran under the floating dock. A parked book
      // is not the page; it is the plate at the TOP of the page. Two thirds
      // of the strip, sitting in its upper half, leaves a third of the canvas
      // empty underneath, and the canvas is transparent there, so the text
      // rises into it (Library.jsx lifts the column by the same fraction)
      // without the renderer ever being resized mid-tumble.
      const u = isNarrow ? 0 : -halfW * 0.50;
      const v = isNarrow ? halfH * 0.24 : 0;
      const p = new THREE.Vector3(u, v, -CAM_DIST).applyMatrix4(camera.matrixWorld);
      // face the camera, then turn another 23° so the spine and the fore-edge
      // both read — reel-0011's angle
      const faceYaw = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
      const fit = (halfH * 2 * (isNarrow ? 0.62 : 0.72)) / rig.edition.height;
      return {
        x: p.x, y: p.y, z: p.z, rx: 0.10, ry: faceYaw + 0.40, rz: 0,
        scale: fit, opacity: 1, grounded: 0,
      };
    };

    // ---------------------------------------------------------- the open
    //
    // THE TUMBLE, AND WHY ITS ENDS ARE EXACT. A free three-axis tumble is what
    // he asked for, and a free tumble is also how you miss the endpoint. So
    // the rotation is a straight interpolation PLUS a wobble term that is
    // exactly zero at p = 0 and p = 1: sin(πp) and sin(2πp) are, and a whole
    // extra turn on y lands where it started. The book rolls on all three
    // axes and still arrives on the pose to the last decimal.
    // THE SPIN SPENDS ITS TIME FACING YOU. A full turn is what guarantees the
    // endpoint, but driven by a plain ease it sat on the BACK board for a
    // third of the travel — you watched a brown slab. Smoothstep applied three
    // times is almost flat at 0 and 1 and steep in the middle, so the book
    // lingers front-on at both ends and whips through the back of the turn.
    const spin = (p) => smoothstep(smoothstep(smoothstep(p)));
    const tumble = (p) => ({
      rx: Math.sin(p * Math.PI) * 0.58,
      ry: TAU * spin(p),
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
        lerp(a.ry, b.ry, e) + t.ry + sway,
        lerp(a.rz, b.rz, e) + t.rz,
      );
      rig.root.scale.setScalar(lerp(a.scale, b.scale, e));
      rig.setOpacity(1);
      // THE FLOOR LEAVES FIRST, on its own quarter-length ramp rather than on
      // `ease` — so the contact patch and this volume's cast shadow are both
      // gone long before the tumble turns either of them into the camera.
      rig.setGrounded(1 - smoothstep(clamp(p / 0.25, 0, 1)));
      // EXACT AT BOTH ENDS BY CONSTRUCTION — 0 for every p up to CRACK_FROM and
      // DETAIL_CRACK at p = 1 — so the hard settle in runTimeline has nothing
      // left to correct, and a close shuts the board before the book flies
      // home rather than returning it to the shelf hanging open.
      rig.frontPivot.rotation.y = DETAIL_CRACK * smoothstep(clamp((p - CRACK_FROM) / (1 - CRACK_FROM), 0, 1));
    };

    const snapTo = (rig, pose) => {
      rig.root.position.set(pose.x, pose.y, pose.z);
      rig.root.rotation.set(pose.rx, pose.ry, pose.rz);
      rig.root.scale.setScalar(pose.scale);
      rig.setGrounded(pose.grounded ?? 1);
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
          settle = 0;
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
        if (position === targetPosition && !drag) {
          hiresDwell += delta;
          if (hiresDwell > 0.25) syncHires();
        } else hiresDwell = 0;
      }

      // the room recedes as the book comes forward
      const stageFade = 1 - ease(clamp(travel, 0, 1));
      sharedMats.walnut.opacity = stageFade;
      sharedMats.walnutTop.opacity = stageFade;
      sharedMats.walnutLip.opacity = stageFade;
      groundMat.opacity = 0.3 * stageFade;
      glowMatFloor.opacity = (tokens.calm ? 0 : 0.55) * stageFade;
      glowMatWall.opacity = (tokens.calm ? 0 : 0.38) * stageFade;
      // the word goes with the room, but NOT with Calm: Calm turns the lights
      // down, it does not take the label off the wall.
      wordMat.opacity = WORD_ALPHA * stageFade;
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

    // ------------------------------------------------------------- shine
    //
    // Bar 4 asks for light that MOVES. Two sources, deliberately out of step:
    // the room turns around the volume (which is what a real specular
    // highlight tracks), and the volume itself turns two degrees (which is
    // what tells you it is an object and not a photograph). The foil is metal
    // and reads almost entirely off the environment; the cloth is rough and
    // reads off its sheen, so one turn moves them at different rates.
    //
    // NONE OF IT RUNS ON THE SHELF. The clock only advances while a volume is
    // open, so the shelf's idle is still exactly zero frames.
    const shineOn = () => !reducedMotion() && !tokens.calm;
    const updateShine = (delta) => {
      if (mode === 'shelf') {
        if (sway !== 0 || scene.environmentRotation.y !== 0) {
          sway = 0;
          scene.environmentRotation.y = 0;
          shinePhase = 0;
          settle = 0;
          return true;
        }
        return false;
      }
      // the sweep is carried by the travel, so the highlight crosses the
      // jacket exactly while the book is flying
      const swept = ENV_SWEEP * ease(clamp(travel, 0, 1));
      if (!shineOn()) { sway = 0; scene.environmentRotation.y = swept; return false; }
      shinePhase += delta;
      if (mode !== 'detail') {
        scene.environmentRotation.y = swept;
        sway = 0;
        return true;
      }
      // AND THEN IT SETTLES. Past SETTLE_TIME the rest pose is assigned
      // outright — the same hard landing runTimeline makes, for the same
      // reason: a sway that merely tends to zero would keep asking for frames
      // for ever, which is exactly the 575-frames-in-five-idle-seconds this
      // replaces. One last frame draws the landed pose, then nothing.
      settle += delta;
      if (settle >= SETTLE_TIME) {
        if (sway === 0 && scene.environmentRotation.y === swept) return false;
        sway = 0;
        scene.environmentRotation.y = swept;
        return true;
      }
      const envelope = 1 - smoothstep(settle / SETTLE_TIME);
      scene.environmentRotation.y = swept
        + Math.sin((shinePhase / SWAY_PERIOD) * TAU) * ENV_BREATH * envelope;
      sway = Math.sin((shinePhase / SWAY_PERIOD) * TAU + Math.PI / 2)
        * (SWAY_DEG * Math.PI / 180) * envelope;
      return true;
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
      // A FRAME NEVER TOOK NEGATIVE TIME, and this used to allow one.
      //
      // The start-up path sets `lastTime = performance.now()` and then asks
      // for a frame — but a frame had already been asked for (setRows, then
      // setWord), and a rAF callback is handed the timestamp of the frame it
      // belongs to, which had already begun. So the first frame arrived with
      // `time` 109 ms BEHIND `lastTime`. `damp` has no opinion about negative
      // dt: it extrapolates away from the target. Measured on his 402px
      // viewport, the two rigs built on frame 1 came out at opacity −5.59 and
      // `root.visible = false` — the shelf's very first drawn frame was an
      // empty room, for exactly the reason he filmed and by a completely
      // different mechanism. The floor is the whole fix; the ceiling is the
      // old one (a tab returning from the background must not teleport).
      const delta = clamp((time - lastTime) / 1000, 0, 0.05);
      lastTime = time;

      // THE BUDGET, and the reason it is no longer zero.
      //
      // Painting a cover is a canvas paint plus a texture upload, and landing
      // one inside a dragged frame is what the 4x trace kept catching — so
      // the first version spent NOTHING during a drag. That is how the shelf
      // came to present an empty room: on a 402px phone one swipe crossed six
      // volumes, the ±3 window landed entirely on volumes that had no rig,
      // and nothing was allowed to build them until the finger came up.
      //
      // A cheap binding costs neither a paint nor an upload, so a drag can
      // afford three a frame. Painted covers still wait for the hand to lift.
      const finger = !!drag;
      let budget = finger ? DRAG_BUILDS : ((mode === 'shelf' && position === targetPosition) ? 2 : 1);
      // AND A FLOOR UNDER IT. If nothing within a volume of the focus is on
      // screen, the shelf is showing a room with no books in it, and no other
      // consideration outranks fixing that this frame.
      if (list.length) {
        const f = focusIndex();
        let near = false;
        for (let i = f - 1; i <= f + 1 && !near; i++) {
          const r = rigs.get(i);
          if (r && r.opacity > 0.05) near = true;
        }
        if (!near) budget = Math.max(budget, 2);
      }
      let built = 0;
      while (buildQueue.length && built < budget) {
        const next = buildQueue.shift();
        const have = rigs.get(next);
        // an upgrade waits for the hand; a volume that is already right needs
        // nothing, and a stale queue entry must not cost a rebuild
        const wantHires = !finger && next === hiresTarget && hiresWanted;
        if (have && (finger || (!have.cheap && !have.stale && have.hires === wantHires))) continue;
        replaceRig(next, wantHires, finger);
        built += 1;
      }

      if (pointerDirty) updateHover();
      const travelling = runTimeline(delta);
      const shining = updateShine(delta);
      const moving = layout(delta) || travelling || shining;

      if (dust && moving) {
        dust.rotation.y = (time / 1000) * 0.012;
        dust.position.y = Math.sin((time / 1000) * 0.17) * 0.004;
      }

      // THE ASSERTION, counted rather than eyeballed. A frame drawn with
      // volumes in the list and not one of them on screen is the fault he
      // filmed; it is measured every frame so a regression announces itself.
      let visible = 0;
      for (const rig of rigs.values()) if (rig.root.visible && rig.opacity > 0.05) visible += 1;
      if (list.length && visible === 0) {
        emptyFrames += 1;
        // WHERE, not just how many. A count you cannot locate is a count you
        // end up explaining away; the first twenty are kept with the state
        // that produced them.
        if (emptyAt.length < 20) {
          emptyAt.push({
            frame: frames + 1, mode, queued: buildQueue.length, dragging: !!drag, delta,
            held: [...rigs.entries()].map(([i, r]) => [i, Number(r.opacity.toFixed(4)), r.root.visible]),
          });
        }
      }

      renderer.render(scene, camera);
      frames += 1;
      if (api.current) {
        api.current.frames = frames;
        api.current.mode = mode;
        api.current.travel = travel;
        api.current.emptyFrames = emptyFrames;
        api.current.visible = visible;
      }

      // RENDER ON DEMAND, in BOTH modes: nothing damping, no timeline, nothing
      // queued, no pointer over the canvas — no next frame.
      if (moving || buildQueue.length || (pointerInside && hoveredIndex >= 0)) requestFrame();
    }

    // ------------------------------------------------------------- input
    const setTarget = (v) => { targetPosition = v; requestFrame(); };

    // A volume's own width on the canvas, times the gain. Derived, never a
    // constant: see DRAG_GAIN. The clamp is only there so a collapsed or
    // absurd canvas cannot produce a pitch that makes the shelf immovable.
    const dragPitch = () => clamp((SPACING * vheight()) / (2 * HALF_H) * DRAG_GAIN, 70, 260);

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

    const onPointerDown = (e) => {
      if (mode !== 'shelf') return;
      // THE BACK-SWIPE GUTTER IS NOT THE SHELF'S. Every swipeable row in the
      // app already refuses to start there; the canvas reaches to within 12px
      // of the screen edge at 375px, so without this a drag from the edge
      // would scroll the shelf AND go back (src/edgeBack.js).
      if (startsInEdgeGuard(e.clientX)) return;
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
        setTarget(band(drag.start - dx / dragPitch()));
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
      // THE HAND IS OFF THE GLASS, so every cheap binding the drag put up is
      // now due its painted cover, and the LRU's extra rigs are due release.
      // Both are syncWindow's job and neither happens without this call.
      syncWindow();
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
    // THE WORD IS FITTED TO THE CANVAS, on the same frustum arithmetic the
    // detail pose uses. A rotation, a resize or the stage changing height
    // re-lays it instead of cropping it.
    const layoutWord = () => {
      const dist = CAM_DIST + Math.abs(WORD_Z);
      const halfH = dist * Math.tan((CAM_FOV / 2) * (Math.PI / 180));
      const w = halfH * camera.aspect * 2 * WORD_FILL;
      wordMesh.scale.set(w, w * (WORD_H / WORD_W), 1);
    };

    const fit = () => {
      const w = width(), h = vheight();
      renderer.setPixelRatio(ratio());
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      layoutWord();
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
      // the serif changes with the theme too, so the word is repainted and not
      // just retinted — Daylight's face is not Command's
      wordMat.color.copy(tokens.ink);
      if (wordText) { const t = wordText; wordText = ''; setWord(t); }
      buildDust();
      applyCalm();
      requestFrame();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-nv-theme', 'data-nv-calm', 'data-nv-style'] });

    // ------------------------------------------------------------- start
    api.current = {
      frames: 0, mode: 'shelf', travel: 0, emptyFrames: 0, visible: 0,
      get emptyAt() { return emptyAt.slice(); },
      get rigs() { return rigs.size; },
      // how many of those are still cheap bindings waiting for their cover
      get cheap() { return [...rigs.values()].filter((r) => r.cheap).length; },
      get dragPitch() { return dragPitch(); },
      get settle() { return settle; },
      get selectedIndex() { return selectedIndex; },
      get position() { return position; },
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
          // rest pose of ~0 must not read as 6.28317. The idle sway is taken
          // back out, because the pose this reports is the one Bar 5 is a
          // promise about, not wherever the shine has the book leaning.
          rx: round(r.x), ry: round(Math.atan2(Math.sin(r.y - sway), Math.cos(r.y - sway))), rz: round(r.z),
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
        hiresTarget = -1; settle = 0;
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
      setWord,
      get word() { return wordText; },
    };

    fontsReady().then(() => {
      if (disposed) return;
      api.current.setRows(live.current.rows);
      setWord(live.current.word);
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
      wordGeo.dispose();
      wordMat.dispose();
      if (wordTex) wordTex.dispose();
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
  useEffect(() => { api.current?.setWord(word); }, [word]);
  useEffect(() => { api.current?.fit(); }, [height]);

  return (
    <div ref={mount} tabIndex={0} role="listbox" aria-label="The shelf"
      style={{ width: '100%', height: `${height}px`, outline: 'none', position: 'relative' }} />
  );
}

export default Shelf3D;
