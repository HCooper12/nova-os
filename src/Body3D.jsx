import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { poseAt } from './exerciseMotion.js';
import { css } from './css.js';

// THE 3D FIGURE — a body he can turn, performing the lift, with the muscles
// it trains lit up.
//
// His ask, 5 Sep: "a 3D make human model that you create, demonstrating the
// exercise that highlights the muscles being targeted". Built procedurally —
// capsules and spheres on a joint hierarchy — rather than a downloaded rig,
// for the same reasons the 2D figure is hand-drawn SVG: nothing to license,
// nothing to fetch, one colour token to theme, and every joint is one we
// understand and can drive from the same POSES the 2D figure uses.
//
// It is a stylised mannequin, deliberately. A photoreal body would need a
// real rig and animation data per lift; this needs eighteen joint angles per
// pattern and gets the point across — which side the load is on, where the
// hinge is, what moves and what stays still.
//
// Loaded lazily by VoicePanels: three.js is the heaviest thing in the
// bundle and a chat that never opens an exercise card should never pay for it.

// muscle id → which segment(s) to tint, and where on the torso. Same
// vocabulary as server/lib/muscles.js, by construction.
const MUSCLE_SEGMENTS = {
  chest: ['chestPatch'], 'front-delts': ['shoulderL', 'shoulderR'], 'side-delts': ['shoulderL', 'shoulderR'],
  'rear-delts': ['shoulderL', 'shoulderR'], biceps: ['upperArmL', 'upperArmR'], triceps: ['upperArmL', 'upperArmR'],
  forearms: ['forearmL', 'forearmR'], abs: ['absPatch'], obliques: ['absPatch'],
  lats: ['backPatch'], traps: ['trapPatch'], rhomboids: ['backPatch'], 'lower-back': ['lowerBackPatch'],
  glutes: ['pelvis'], quads: ['thighL', 'thighR'], hamstrings: ['thighL', 'thighR'], calves: ['shinL', 'shinR'],
  adductors: ['thighL', 'thighR'],
};

const DEG = Math.PI / 180;
const BASE = 0x2a3350;      // the mannequin — Command Core's mid-blue, matte
const PRIMARY = 0xff7ad9;   // --nv-mg
const SECONDARY = 0x59e6ff; // --nv-cy

function capsule(radius, length, color) {
  const geo = new THREE.CapsuleGeometry(radius, length, 6, 12);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}
function patch(w, h, color, z) {
  const geo = new THREE.BoxGeometry(w, h, 0.02);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, opacity: 0.0 });
  const m = new THREE.Mesh(geo, mat);
  m.position.z = z;
  return m;
}

// Build the rig. Every pivot is a Group placed at the JOINT, with the segment
// hanging off it, so rotating the group bends the limb where a limb bends.
function buildBody() {
  const root = new THREE.Group();
  const segs = {};

  // pelvis + torso
  const pelvisPivot = new THREE.Group(); pelvisPivot.position.y = 0.95; root.add(pelvisPivot);
  const pelvis = capsule(0.16, 0.12, BASE); pelvis.rotation.z = Math.PI / 2; pelvisPivot.add(pelvis); segs.pelvis = pelvis;

  const torsoPivot = new THREE.Group(); torsoPivot.position.y = 0.05; pelvisPivot.add(torsoPivot);
  const torso = capsule(0.17, 0.42, BASE); torso.position.y = 0.32; torsoPivot.add(torso); segs.torso = torso;
  segs.chestPatch = patch(0.30, 0.16, PRIMARY, 0.17); segs.chestPatch.position.y = 0.44; torsoPivot.add(segs.chestPatch);
  segs.absPatch = patch(0.20, 0.20, PRIMARY, 0.17); segs.absPatch.position.y = 0.22; torsoPivot.add(segs.absPatch);
  segs.backPatch = patch(0.32, 0.24, PRIMARY, -0.17); segs.backPatch.position.y = 0.38; torsoPivot.add(segs.backPatch);
  segs.lowerBackPatch = patch(0.20, 0.14, PRIMARY, -0.17); segs.lowerBackPatch.position.y = 0.16; torsoPivot.add(segs.lowerBackPatch);
  segs.trapPatch = patch(0.26, 0.08, PRIMARY, -0.15); segs.trapPatch.position.y = 0.58; torsoPivot.add(segs.trapPatch);

  const neck = capsule(0.05, 0.06, BASE); neck.position.y = 0.62; torsoPivot.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshStandardMaterial({ color: BASE, roughness: 0.7 }));
  head.position.y = 0.80; torsoPivot.add(head);

  // arms
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const shoulder = new THREE.Group(); shoulder.position.set(s * 0.24, 0.56, 0); torsoPivot.add(shoulder);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), new THREE.MeshStandardMaterial({ color: BASE, roughness: 0.7 }));
    shoulder.add(cap); segs['shoulder' + side] = cap;
    const upper = capsule(0.055, 0.26, BASE); upper.position.y = -0.17; shoulder.add(upper); segs['upperArm' + side] = upper;
    const elbow = new THREE.Group(); elbow.position.y = -0.33; shoulder.add(elbow);
    const fore = capsule(0.045, 0.24, BASE); fore.position.y = -0.15; elbow.add(fore); segs['forearm' + side] = fore;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: BASE, roughness: 0.7 }));
    hand.position.y = -0.31; elbow.add(hand);
    segs['shoulderPivot' + side] = shoulder; segs['elbowPivot' + side] = elbow;
  }

  // legs
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const hip = new THREE.Group(); hip.position.set(s * 0.10, -0.02, 0); pelvisPivot.add(hip);
    const thigh = capsule(0.075, 0.36, BASE); thigh.position.y = -0.22; hip.add(thigh); segs['thigh' + side] = thigh;
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    const shin = capsule(0.06, 0.36, BASE); shin.position.y = -0.22; knee.add(shin); segs['shin' + side] = shin;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: BASE, roughness: 0.8 }));
    foot.position.set(0, -0.45, 0.05); knee.add(foot);
    segs['hipPivot' + side] = hip; segs['kneePivot' + side] = knee;
  }

  segs.pelvisPivot = pelvisPivot; segs.torsoPivot = torsoPivot; segs.root = root;
  return { root, segs };
}

// Apply a pose (degrees) to the rig. Both sides move together — every pattern
// here is bilateral, and asymmetric lifts read fine mirrored.
function applyPose(segs, pose) {
  const p = pose || {};
  const pitch = (p.shoulderPitch || 0) * DEG;
  const abd = (p.abduct || 0) * DEG;
  const elbow = (p.elbow || 0) * DEG;
  const hip = (p.hip || 0) * DEG;
  const knee = (p.knee || 0) * DEG;
  const torso = (p.torsoPitch || 0) * DEG;
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    // shoulder: forward raise is rotation about X; sideways is about Z, mirrored
    segs['shoulderPivot' + side].rotation.set(-pitch, 0, s * abd);
    segs['elbowPivot' + side].rotation.x = -elbow;
    segs['hipPivot' + side].rotation.x = -hip;
    segs['kneePivot' + side].rotation.x = knee;
  }
  segs.torsoPivot.rotation.x = -torso;
  // a squat lowers the pelvis; a hinge does not. Approximate the drop from
  // knee flexion so the feet stay put visually.
  const drop = Math.sin(knee / 2) * 0.35;
  const lift = (p.lift || 0) * 0.06;
  segs.pelvisPivot.position.y = 0.95 - drop + lift;
  segs.torsoPivot.position.y = 0.05 + (p.shoulderLift || 0) * 0.04;
}

function tint(segs, muscles) {
  const { primary = [], secondary = [] } = muscles || {};
  const set = new Map();
  for (const m of secondary) for (const seg of MUSCLE_SEGMENTS[m] || []) set.set(seg, SECONDARY);
  for (const m of primary) for (const seg of MUSCLE_SEGMENTS[m] || []) set.set(seg, PRIMARY); // primary wins
  for (const [name, mesh] of Object.entries(segs)) {
    if (!mesh?.material) continue;
    const isPatch = /Patch$/.test(name);
    const colour = set.get(name);
    if (isPatch) {
      mesh.material.opacity = colour ? 0.95 : 0;
      if (colour) mesh.material.color.setHex(colour);
    } else {
      mesh.material.color.setHex(colour || BASE);
      mesh.material.emissive.setHex(colour ? colour : 0x000000);
      mesh.material.emissiveIntensity = colour ? 0.25 : 0;
    }
  }
}

export function Body3D({ muscles, pattern, height = 260 }) {
  const mount = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = mount.current;
    if (!el) return undefined;
    const width = el.clientWidth || 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 50);
    // Higher and more to the side than the first cut, which looked up at the
    // figure from below its hips and made a hinge read as a body tilting.
    // From here the pelvis is the visible pivot before he drags at all.
    camera.position.set(2.5, 1.85, 2.3);
    camera.lookAt(0, 0.9, 0);

    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x101426, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 3, 2); scene.add(key);
    const rim = new THREE.DirectionalLight(0x59e6ff, 0.5); rim.position.set(-2, 1, -2); scene.add(rim);

    // a faint floor disc so the drop of a squat reads against something
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.7, 40), new THREE.MeshStandardMaterial({ color: 0x0e1426, roughness: 1, transparent: true, opacity: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005; scene.add(floor);

    const { root, segs } = buildBody();
    scene.add(root);
    tint(segs, muscles);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.autoRotate = false;
    controls.minPolarAngle = 0.75; controls.maxPolarAngle = 1.55; // never from underneath
    controls.update();

    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    const period = 2600;
    const loop = (now) => {
      if (pattern && !reduce) {
        // ease in-out, out and back — one repetition per period
        const phase = ((now - start) % period) / period;
        const t = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
        applyPose(segs, poseAt(pattern, t));
      } else {
        applyPose(segs, pattern ? poseAt(pattern, 1) : null); // hold the working position
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [muscles, pattern, height]);

  return (
    <div style={css('position:relative;width:100%')}>
      <div ref={mount} style={{ width: '100%', height, borderRadius: '10px', overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 40%, rgba(89,230,255,.07), transparent 65%)', touchAction: 'none' }} />
      <span style={css('position:absolute;left:10px;bottom:8px;font:500 8px var(--nv-font-mono);letter-spacing:.14em;opacity:.45')}>
        {ready ? 'DRAG TO TURN' : 'LOADING'}
      </span>
    </div>
  );
}

export default Body3D;
