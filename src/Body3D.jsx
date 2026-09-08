import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { poseAt, PATTERNS, equipmentFor, patternFor } from './exercise3d.js';
import { css } from './css.js';

// THE FIGURE — a real body, performing the lift, with the muscles it trains lit.
//
// What this replaced, and why. The first version was capsules and spheres on a
// joint hierarchy, driven by the flat figure's CSS transform strings: a squat
// was `scaleY(0.86)`, so the legs SHRANK instead of the hips and knees
// flexing. Hayden, 8 Sep 2026: "terrible… most of the exercises are completely
// wrong with how the movement is actually meant to be carried out."
//
// Now: an anatomically modelled male (Blender's CC0 Human Base Meshes, given
// his proportions and segmented per muscle by tools/anatomy/) driven by real
// joint angles from `exercise3d.js`, holding the equipment the lift actually
// uses. The rig's bones are the ones a body has — pelvis, spine, chest, and a
// thigh/shin/foot and clavicle/upperarm/forearm/hand per side — so a hip hinge
// hinges at the hip.

const MODEL_URL = `${import.meta.env.BASE_URL}models/body.glb`;

const PRIMARY = new THREE.Color(0xff7ad9);   // --nv-mg
const SECONDARY = new THREE.Color(0x59e6ff); // --nv-cy
const RESTING = new THREE.Color(0x8d94ac);   // muscle at rest — a body, not a diagram
const FRAME = new THREE.Color(0xa9a2b8);
const STEEL = 0x9aa3b4;

let cached = null;   // the parsed GLB, shared across every card that opens

function loadModel() {
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      new GLTFLoader().load(MODEL_URL, (g) => resolve(g), undefined, reject);
    }).catch((e) => { cached = null; throw e; });
  }
  return cached;
}

/* ------------------------------- equipment ------------------------------- */
// Built here rather than modelled: a barbell is a cylinder and some plates, and
// a bar Nova draws is a bar Nova can place exactly in his hands.

function metal(color = STEEL, rough = 0.35) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.75 });
}

function barbell(len = 1.9) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 14), metal());
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.035, 20), metal(0x2c3242, 0.6));
      plate.rotation.z = Math.PI / 2;
      plate.position.x = side * (len / 2 - 0.10 - i * 0.045);
      g.add(plate);
    }
  }
  return g;
}

function dumbbell() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 10), metal());
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  for (const s of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.085, 14), metal(0x2c3242, 0.6));
    head.rotation.z = Math.PI / 2;
    head.position.x = s * 0.105;
    g.add(head);
  }
  return g;
}

function bench(angleDeg = 0) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 1.15),
    new THREE.MeshStandardMaterial({ color: 0x232a3c, roughness: 0.85 }));
  pad.rotation.x = -THREE.MathUtils.degToRad(angleDeg);
  pad.position.y = 0.45;
  g.add(pad);
  for (const z of [-0.45, 0.45]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, 0.05), metal(0x39415a, 0.7));
    leg.position.set(0, 0.21, z);
    g.add(leg);
  }
  return g;
}

function cableTower(highAnchor = true) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.10, 2.15, 0.10), metal(0x39415a, 0.7));
  post.position.y = 1.07;
  g.add(post);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.75, 0.16), metal(0x2c3242, 0.6));
  stack.position.y = 0.42;
  g.add(stack);
  const armY = highAnchor ? 2.05 : 0.45;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), metal());
  arm.rotation.z = Math.PI / 2;
  arm.position.set(-0.09, armY, 0);
  g.add(arm);
  return g;
}

function pullupBar() {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.2, 12), metal());
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 2.25;
  g.add(bar);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.25, 0.06), metal(0x39415a, 0.7));
    post.position.set(s * 0.6, 1.12, 0);
    g.add(post);
  }
  return g;
}

// what each equipment id puts in the scene, and whether the hands hold it
const RIG = {
  'barbell-back': () => ({ obj: barbell(), hold: 'traps' }),
  'barbell-front': () => ({ obj: barbell(), hold: 'front-rack' }),
  'barbell-hands': () => ({ obj: barbell(), hold: 'hands' }),
  'barbell-floor': () => ({ obj: barbell(), hold: 'hands' }),
  dumbbells: () => ({ obj: null, perHand: dumbbell }),
  'dumbbell-single': () => ({ obj: null, perHand: dumbbell, single: true }),
  'bench-flat': () => ({ obj: bench(0), prop: true, extra: barbell(), hold: 'hands' }),
  'bench-flat-db': () => ({ obj: bench(0), prop: true, perHand: dumbbell }),
  'bench-incline': () => ({ obj: bench(30), prop: true, extra: barbell(), hold: 'hands' }),
  'bench-incline-db': () => ({ obj: bench(30), prop: true, perHand: dumbbell }),
  'bench-thrust': () => ({ obj: bench(0), prop: true, extra: barbell(), hold: 'hands' }),
  'cable-high': () => ({ obj: cableTower(true), prop: true }),
  'cable-mid': () => ({ obj: cableTower(false), prop: true }),
  'pullup-bar': () => ({ obj: pullupBar(), prop: true }),
  'machine-legcurl': () => ({ obj: bench(0), prop: true }),
  'machine-legext': () => ({ obj: bench(0), prop: true }),
  'machine-legpress': () => ({ obj: bench(30), prop: true }),
  none: () => ({ obj: null }),
};

/* --------------------------------- posing -------------------------------- */

// Rotate a bone by `deg` about a WORLD axis, on top of its rest pose. Doing it
// in world terms means the data can say "the hip flexes 100°" and mean it,
// whatever direction the bone happens to point in its rest orientation.
function rotate(bone, rest, axis, deg) {
  if (!bone || !deg) return;
  const parentQ = new THREE.Quaternion();
  if (bone.parent) bone.parent.getWorldQuaternion(parentQ);
  const local = axis.clone().applyQuaternion(parentQ.clone().invert()).normalize();
  const delta = new THREE.Quaternion().setFromAxisAngle(local, THREE.MathUtils.degToRad(deg));
  bone.quaternion.copy(delta).multiply(rest);
  bone.updateMatrixWorld(true);
}

const X = new THREE.Vector3(1, 0, 0);   // flexion / extension
const Z = new THREE.Vector3(0, 0, 1);   // abduction / adduction
const Y = new THREE.Vector3(0, 1, 0);   // rotation about the limb

// The base mesh stands in an A-pose: each arm is already ~40° abducted. Pose
// data is written in ANATOMICAL terms (0° = the arm hanging at the side), so
// the rest abduction has to be subtracted or every overhead lift sweeps the
// arms inward until they cross over the head — which is what it did.
function restAbduction(bones, side) {
  const sh = bones[`upperarm${side}`];
  const el = bones[`forearm${side}`];
  if (!sh || !el) return 0;
  const a = new THREE.Vector3(); const b = new THREE.Vector3();
  sh.getWorldPosition(a); el.getWorldPosition(b);
  const v = b.sub(a);
  return THREE.MathUtils.radToDeg(Math.atan2(Math.abs(v.x), Math.abs(v.y)));
}

function applyPose(bones, rest, pose, restAbduct = { L: 0, R: 0 }) {
  if (!pose) return;
  const set = (name, axis, deg) => rotate(bones[name], rest[name], axis, deg);
  // trunk, root down — a child's world axis is only right once its parent is posed
  set('pelvis', X, (pose.hipTilt || 0));
  set('spine', X, -(pose.spine || 0));
  set('chest', X, -(pose.chest || 0));
  set('neck', X, -(pose.neck || 0));
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    // shoulder: flexion about X, abduction about Z (mirrored)
    const sh = bones[`upperarm${side}`];
    if (sh) {
      const parentQ = new THREE.Quaternion();
      sh.parent.getWorldQuaternion(parentQ);
      const inv = parentQ.clone().invert();
      const q = new THREE.Quaternion();
      if (pose.shoulder) {
        q.multiply(new THREE.Quaternion().setFromAxisAngle(X.clone().applyQuaternion(inv).normalize(),
          THREE.MathUtils.degToRad(-pose.shoulder)));
      }
      // always rotate FROM the rest abduction to the angle asked for
      const abd = (pose.shoulderAbduct != null ? pose.shoulderAbduct : 0) - restAbduct[side];
      if (abd) {
        q.multiply(new THREE.Quaternion().setFromAxisAngle(Z.clone().applyQuaternion(inv).normalize(),
          THREE.MathUtils.degToRad(s * abd)));
      }
      sh.quaternion.copy(q).multiply(rest[`upperarm${side}`]);
      sh.updateMatrixWorld(true);
      // the deltoid helper takes half the rotation — the cap follows the arm,
      // the chest and trap stay where they belong
      const dl = bones[`deltoid${side}`];
      if (dl) {
        const pq = new THREE.Quaternion();
        dl.parent.getWorldQuaternion(pq);
        const iv = pq.clone().invert();
        const h = new THREE.Quaternion();
        if (pose.shoulder) {
          h.multiply(new THREE.Quaternion().setFromAxisAngle(X.clone().applyQuaternion(iv).normalize(),
            THREE.MathUtils.degToRad(-pose.shoulder * 0.5)));
        }
        const abdH = ((pose.shoulderAbduct != null ? pose.shoulderAbduct : 0) - restAbduct[side]) * 0.5;
        if (abdH) {
          h.multiply(new THREE.Quaternion().setFromAxisAngle(Z.clone().applyQuaternion(iv).normalize(),
            THREE.MathUtils.degToRad(s * abdH)));
        }
        dl.quaternion.copy(h).multiply(rest[`deltoid${side}`]);
        dl.updateMatrixWorld(true);
      }
    }
    set(`forearm${side}`, X, -(pose.elbow || 0));
    const back = side === 'R' && pose.hipBack != null;
    // About WORLD +X, a point below the joint swings POSTERIOR — which is knee
    // flexion and hip EXTENSION. So the hip takes the angle as written
    // (flexion is negative) and the knee takes it positive. Getting this
    // backwards bent the knee the wrong way, which is exactly the class of
    // error that made the old figure wrong.
    set(`thigh${side}`, X, back ? (pose.hipBack || 0) : (pose.hip || 0));
    set(`shin${side}`, X, back ? (pose.kneeBack || 0) : (pose.knee || 0));
    set(`foot${side}`, X, (pose.ankle || 0));
    if (pose.shoulderShrug) {
      const c = bones[`clavicle${side}`];
      if (c) {
        c.position.y = rest[`clavicle${side}_pos`].y + 0.035 * pose.shoulderShrug;
        c.updateMatrixWorld(true);
      }
    }
  }
}

export default function Body3D({ muscles, pattern, name = '', height = 260 }) {
  // The flat figure's pattern ids overlap with these but are coarser (it has
  // one "squat" for squats, leg presses and lunges). When the name resolves to
  // a 3D pattern, that wins — the whole point is that the movement is right.
  const pat = patternFor(name) || (pattern && PATTERNS[pattern] ? pattern : null);
  const mount = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    const el = mount.current;
    if (!el) return undefined;
    let raf = 0;
    let disposed = false;
    const width = el.clientWidth || 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 40);
    camera.position.set(1.9, 1.35, 2.9);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 6;
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b0d16, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2.4, 3.2, 2.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 0.7);
    rim.position.set(-2.2, 1.8, -2.4);
    scene.add(rim);

    const primary = new Set(muscles?.primary || []);
    const secondary = new Set(muscles?.secondary || []);

    loadModel().then((gltf) => {
      if (disposed) return;
      // SkeletonUtils, not Object3D.clone: a plain clone of a SkinnedMesh keeps
      // pointing at the ORIGINAL skeleton, so the copy poses nothing and draws
      // nothing — the model was in the scene, correctly scaled, and invisible.
      const root = cloneSkinned(gltf.scene);
      scene.add(root);

      // tint each muscle group's own material — the segmentation the model was
      // built with IS the highlight, so a lit muscle is the real muscle
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        const wasArray = Array.isArray(o.material);
        const mats = wasArray ? o.material : [o.material];
        const tinted = mats.map((m) => {
          const mat = m.clone();
          const group = (m.name || '').replace(/^mus_/, '');
          const lit = primary.has(group) ? PRIMARY : secondary.has(group) ? SECONDARY : null;
          mat.color = (lit || (group === 'frame' ? FRAME : RESTING)).clone();
          mat.roughness = 0.62;
          mat.metalness = 0.0;
          if (lit) mat.emissive = lit.clone().multiplyScalar(0.22);
          return mat;
        });
        // Keep the SHAPE of material: each mesh here carries exactly one, and
        // assigning a one-element ARRAY makes three.js look for geometry groups
        // that do not exist — the model was present, lit and invisible.
        o.material = wasArray ? tinted : tinted[0];
      });

      const bones = {};
      const rest = {};
      root.traverse((o) => {
        if (o.isBone) {
          bones[o.name] = o;
          rest[o.name] = o.quaternion.clone();
          rest[`${o.name}_pos`] = o.position.clone();
        }
      });

      // STANCE — where the body IS. A bench press lies down, a pull-up hangs,
      // a leg extension sits. Posing joints alone left every lift standing at
      // the origin, which read as a man doing a bench press in mid-air.
      const stance = (pat && PATTERNS[pat] && PATTERNS[pat].stance) || 'standing';
      const BENCH_TOP = 0.49;      // pad height, matching bench()
      if (stance === 'supine') {
        root.rotation.x = -Math.PI / 2;      // on his back, head toward -Z
        root.position.set(0, BENCH_TOP, 0.42);
      } else if (stance === 'incline30') {
        root.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(30);
        root.position.set(0, BENCH_TOP + 0.10, 0.30);
      } else if (stance === 'prone') {
        root.rotation.x = Math.PI / 2;
        root.position.set(0, BENCH_TOP, -0.42);
      } else if (stance === 'hanging') {
        root.position.set(0, 0.30, 0);       // feet clear of the floor
      } else if (stance === 'seated') {
        root.position.set(0, BENCH_TOP - 0.44, 0.10);
      } else if (stance === 'seated-back') {
        root.rotation.x = -THREE.MathUtils.degToRad(55);
        root.position.set(0, 0.62, 0.34);
      } else if (stance === 'thrust') {
        root.rotation.x = -Math.PI / 2;
        root.position.set(0, BENCH_TOP - 0.06, 0.10);
      }
      root.updateMatrixWorld(true);

      // equipment
      const eq = equipmentFor(name, pat);
      const spec = (RIG[eq] || RIG.none)();
      const held = [];
      if (spec.obj) {
        scene.add(spec.obj);
        if (spec.prop) {
          if (eq === 'cable-high' || eq === 'cable-mid') spec.obj.position.set(0, 0, -1.05);
          if (eq === 'pullup-bar') spec.obj.position.set(0, 0, 0);
          if (eq.startsWith('bench')) spec.obj.position.set(0, 0, 0);
        } else {
          held.push(spec.obj);
        }
      }
      if (spec.extra) { scene.add(spec.extra); held.push(spec.extra); }
      if (spec.perHand) {
        for (const side of spec.single ? ['L'] : ['L', 'R']) {
          const d = spec.perHand();
          d.userData.hand = side;
          scene.add(d);
          held.push(d);
        }
      }

      // frame what is actually there, so a lying figure is not half off-screen
      {
        const box = new THREE.Box3().setFromObject(root);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z) * 0.62 + 0.35;
        controls.target.copy(c);
        camera.position.set(c.x + radius * 1.15, c.y + radius * 0.45, c.z + radius * 1.75);
        camera.near = 0.05;
        camera.far = 60;
        camera.updateProjectionMatrix();
        controls.update();
      }
      const restAbduct = { L: restAbduction(bones, 'L'), R: restAbduction(bones, 'R') };
      const clock = new THREE.Clock();
      const period = 3.4;   // one controlled rep
      const tmp = new THREE.Vector3();
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const phase = pat ? (clock.getElapsedTime() % period) / period : 0;
        if (pat) applyPose(bones, rest, poseAt(pat, phase), restAbduct);

        // put whatever is held where the hands are
        for (const obj of held) {
          const hand = obj.userData.hand;
          if (hand) {
            const b = bones[`hand${hand}`];
            if (b) { b.getWorldPosition(tmp); obj.position.copy(tmp); obj.quaternion.identity(); }
          } else {
            const l = bones.handL; const r = bones.handR;
            if (l && r) {
              const a = new THREE.Vector3(); const b2 = new THREE.Vector3();
              l.getWorldPosition(a); r.getWorldPosition(b2);
              obj.position.copy(a).add(b2).multiplyScalar(0.5);
              if (spec.hold === 'traps') obj.position.set(0, bones.chest ? bones.chest.getWorldPosition(tmp).y + 0.10 : 1.5, 0.03);
              if (spec.hold === 'front-rack') obj.position.set(0, bones.chest ? bones.chest.getWorldPosition(tmp).y + 0.06 : 1.45, -0.12);
              obj.quaternion.identity();
            }
          }
        }
        controls.update();
        renderer.render(scene, camera);
      };
      setState('ready');
      tick();
    }).catch(() => setState('error'));

    // The sheet animates in, so clientWidth at mount was 46px and the canvas
    // rendered as a 92px stamp. Watch the element instead of trusting one read.
    const fit = () => {
      const w = Math.max(160, el.clientWidth || el.parentElement?.clientWidth || width);
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    const onResize = fit;
    window.addEventListener('resize', onResize);
    setTimeout(fit, 60);
    setTimeout(fit, 400);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [muscles, pat, name, height]);

  const p = pat ? PATTERNS[pat] : null;
  return (
    <div>
      <div ref={mount} style={{ width: '100%', height: `${height}px`, borderRadius: '12px', overflow: 'hidden' }} />
      <div style={css('margin-top:6px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap')}>
        <span style={css('font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 38%, transparent)')}>
          {state === 'error' ? 'THE MODEL COULD NOT LOAD' : 'DRAG TO TURN'}
        </span>
        {p && <span style={css('font-size:11.5px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)')}>{p.label}</span>}
      </div>
      {p?.cue && (
        <div style={css('margin-top:4px;font-size:11.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)')}>{p.cue}</div>
      )}
    </div>
  );
}
