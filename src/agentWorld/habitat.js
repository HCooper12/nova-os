// THE HABITAT: where the nine live (design/AGENT-WORLD-PLAN.md §9b).
//
// A small SET on the back half of every district tile, in the beings' own
// language (lathes, superquadrics, bevelled extrusions, swept tubes; never a
// bare box on a bare cylinder), the lanes the beings walk on, the plaza round
// Nova's core, and the lamps that say a loop ran today. It is drawn by the
// habitat sheet (design/mockups/50-habitat.html) and, once integrated, by the
// Org Map (src/orgmap/scene.js), from this one file.
//
// It takes THREE and the being kit as arguments, like beings.js, because the
// sheet runs three r160 from a CDN and the app r170 from npm; everything used
// here exists in both.
//
// NO IDLE MOTION OF ITS OWN. The only things that move are the lamp fades
// (~0.6 s), the plaza pulse (~0.8 s) and nothing else: tick() says when they
// are done, so the frame loop can sleep. Walks, acts and the working tells
// belong to the life engine and the beings, never to the set.
//
// Pure scene-building: geometry, materials, anchors, lanes. No network, no
// model, no storage. server/test/agentWorldNoModel.test.js holds that line,
// and server/test/agentWorldHabitat.test.js holds the contract below.

// Copied EXACTLY from src/orgmap/scene.js (the test compares them), so the
// integration can switch scene.js to import these instead.
export const LAYOUT = {
  RD: 3.2,
  RX: 0.86,
  RZ: 1.1,
  ORDER: ['knowledge', 'mind', 'logistics', 'train', 'fuel', 'money', 'platform'],
  TILE_R: { knowledge: 1.32 },
  HUE_OF: { train: 'chest', knowledge: 'quads', logistics: 'cy', fuel: 'shoulders', platform: 'vi', money: 'good', mind: 'mg' },
  BEING_SCALE: 0.72,
};

// Where each being stands today (scene.js's district map and SLOTS), which is
// its `home` node on the lanes.
export const HOMES = {
  DISTRICT_OF: { commander: 'logistics', coach: 'train', cfo: 'money', guardian: 'platform', researcher: 'knowledge', watcher: 'knowledge', librarian: 'knowledge', mealprep: 'fuel', leader: 'mind' },
  SLOTS: { knowledge: { researcher: [-0.62, 0.22], watcher: [0.62, 0.22], librarian: [0, -0.42] } },
};

export function tileRadius(id) { return LAYOUT.TILE_R[id] || 1.0; }

function districtAngle(id) {
  const i = LAYOUT.ORDER.indexOf(id);
  return i < 0 ? null : Math.PI + i * (2 * Math.PI / LAYOUT.ORDER.length);
}

// The tile centre in world space, by the formula scene.js places it with.
export function districtPosition(T, id) {
  const th = districtAngle(id);
  if (th == null) return null;
  return new T.Vector3(Math.sin(th) * LAYOUT.RD * LAYOUT.RX, 0, Math.cos(th) * LAYOUT.RD * LAYOUT.RZ);
}

// THE LANES. The ring lane runs inside the ring of tiles, just clear of
// every one of them: the largest ellipse whose centre line keeps 0.13 from
// every hex (Knowledge's 1.32 tile at the back sets b, Logistics and Money
// set a; measured, not guessed). It passes in front of the back row and
// behind the front row; spokes run from it to the plaza ring round the core,
// and a being steps off its tile's inner edge onto it.
export const LANES = {
  a: 1.7,                           // ring lane, x semi-axis
  b: 2.07,                          // ring lane, z semi-axis
  plazaR: 1.0,                      // the plaza ring, round the plinth (0.78)
  w: 0.12,                          // band width: a path, not a road
  y: 0.012,                         // band top
  postAngle: 0.6,                   // where a delivery is set down, on the plaza ring
};

// What each district exposes (§9b). The test holds the set to exactly this.
export const ANCHOR_NAMES = {
  train: ['work', 'rest', 'barDock'],
  knowledge: ['work:researcher', 'rest:researcher', 'work:watcher', 'rest:watcher', 'work:librarian', 'rest:librarian', 'screen', 'lamp'],
  logistics: ['work', 'rest', 'mast'],
  fuel: ['work', 'rest', 'stove'],
  platform: ['work', 'rest', 'lanternDock', 'pad'],
  money: ['work', 'rest', 'stack'],
  mind: ['work', 'rest', 'lantern'],
};

const FADE_S = 0.6, PULSE_S = 0.8;
// how much of a lit district lamp shows at each part of the day: night makes
// the colour emit (§8); by day the same lamp is a quieter tell
const DAY_GAIN = { dawn: 0.75, day: 0.55, evening: 0.85, night: 1 };
// structure is the district's hue pulled toward the stage (§9b: the hue at low
// saturation for structure, the being's accent for anything lit)
const STRUCT_MIX = 0.3;

export function createHabitat(T, TK, kit) {
  const { darker, lighter } = kit;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const ss = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
  const SHARED = new Set(Object.values(kit.GEO));

  // ---------------------------------------------------------------
  // GEOMETRY: the beings' own vocabulary, rebuilt here because the kit
  // keeps its helpers private.
  // ---------------------------------------------------------------
  // a lathe from an [r, y] profile; smooth=true runs a spline through it so
  // every step gets a soft bevel instead of a hard lip
  function lathe(prof, seg, smooth) {
    let pts = prof.map((p) => new T.Vector2(Math.max(p[0], 1e-4), p[1]));
    if (smooth !== false) pts = new T.SplineCurve(pts).getPoints(Math.max(40, prof.length * 10)).map((p) => new T.Vector2(Math.max(p.x, 1e-4), p.y));
    return new T.LatheGeometry(pts, seg || 48);
  }
  // a superquadric: |x/rx|^n + |z/rz|^n across, exponent m up the side.
  // n = m = 2 is an ellipsoid; 6-8 a soft block with rounded edges
  // yMin flattens everything below it: a dome with a flat foot
  function sq(rx, ry, rz, n, m, yMin) {
    n = n || 4; m = m || n;
    const g = new T.SphereGeometry(1, 44, 30), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const hz = Math.pow(Math.pow(Math.abs(x / rx), n) + Math.pow(Math.abs(z / rz), n), m / n);
      const t = 1 / Math.pow(hz + Math.pow(Math.abs(y / ry), m), 1 / m);
      p.setXYZ(i, x * t, yMin != null ? Math.max(yMin, y * t) : y * t, z * t);
    }
    g.computeVertexNormals();
    return g;
  }
  function rrect(w, h, r) {
    const s = new T.Shape(), x = w / 2, y = h / 2;
    r = Math.min(r, x - 1e-4, y - 1e-4);
    s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
    s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y); s.lineTo(-x + r, y);
    s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
    return s;
  }
  // a rounded-rectangle slab w (x) by d (z), h tall from y = 0, bevelled
  function slab(w, d, h, r, bevel) {
    const b = Math.min(bevel != null ? bevel : 0.01, h * 0.45, w * 0.2, d * 0.2);
    const g = new T.ExtrudeGeometry(rrect(w - 2 * b, d - 2 * b, Math.max(0.002, (r || 0.02) - b)), {
      depth: Math.max(0.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 10,
    });
    g.rotateX(-Math.PI / 2); g.translate(0, b, 0);
    return g;
  }
  // the same slab stood up, its face toward +z (a door, a panel, a screen)
  function panel(w, h, t, r, bevel) {
    const g = slab(w, h, t, r, bevel);
    g.rotateX(Math.PI / 2); g.translate(0, 0, -t / 2);
    return g;
  }
  function tube(pts, r, o) {
    o = o || {};
    const c = new T.CatmullRomCurve3(pts.map((p) => V(p[0], p[1], p[2])), !!o.closed, 'centripetal');
    return new T.TubeGeometry(c, o.seg || Math.max(16, pts.length * 12), r, o.rs || 10, !!o.closed);
  }
  // join non-indexed copies of several geometries into one (drawer fronts,
  // bolts, ribs): one mesh instead of a dozen, same look
  function merge(list) {
    const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
    const out = new T.BufferGeometry();
    ['position', 'normal', 'uv'].forEach((k) => {
      if (!parts.every((g) => g.attributes[k])) return;
      const size = parts[0].attributes[k].itemSize;
      const arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[k].count * size, 0));
      let o = 0;
      parts.forEach((g) => { arr.set(g.attributes[k].array, o); o += g.attributes[k].count * size; });
      out.setAttribute(k, new T.BufferAttribute(arr, size));
    });
    parts.forEach((g, i) => { if (g !== list[i]) g.dispose(); list[i].dispose(); });
    return out;
  }
  function at(g, x, y, z, rx, ry, rz) {
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    g.translate(x || 0, y || 0, z || 0);
    return g;
  }
  function M(geo, mat, x, y, z) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // ---------------------------------------------------------------
  // MATERIALS: every colour a token mix; nothing is a hex.
  // ---------------------------------------------------------------
  function vinyl(col, o) {
    o = o || {};
    const m = new T.MeshPhysicalMaterial({
      color: col, roughness: o.rough != null ? o.rough : 0.5, metalness: o.metal != null ? o.metal : 0.04,
      clearcoat: o.coat != null ? o.coat : 0.45, clearcoatRoughness: o.coatR != null ? o.coatR : 0.3,
      sheen: o.sheen != null ? o.sheen : 0.3, sheenColor: lighter(col, 0.4), sheenRoughness: 0.6,
    });
    if (o.env != null) m.envMapIntensity = o.env;
    if (o.side) m.side = o.side;
    return m;
  }
  const N = {
    wood: vinyl(TK.gold.clone().lerp(TK.hue.chest, 0.3).multiplyScalar(0.42), { rough: 0.55, coat: 0.35 }),
    woodDark: vinyl(TK.gold.clone().lerp(TK.hue.chest, 0.35).multiplyScalar(0.24), { rough: 0.5, coat: 0.4 }),
    brass: vinyl(lighter(TK.gold, 0.1), { rough: 0.3, metal: 0.85, coat: 0.6, sheen: 0 }),
    steel: vinyl(TK.shell.clone().multiplyScalar(0.78), { rough: 0.32, metal: 0.8, coat: 0.5, sheen: 0 }),
    paper: vinyl(TK.ink.clone().lerp(TK.shell, 0.3), { rough: 0.85, coat: 0.1, sheen: 0.5 }),
    slate: vinyl(TK.void.clone().lerp(TK.stage, 0.55), { rough: 0.4, coat: 0.8, coatR: 0.15, sheen: 0 }),
    stone: vinyl(TK.shell.clone().lerp(TK.stage, 0.5), { rough: 0.8, coat: 0.15, sheen: 0.2 }),
  };

  // ---------------------------------------------------------------
  // LAMPS. Every lit thing is a kit emissive at its lamp value, faded by
  // level (0..1) over FADE_S. A lamp answers to: its district's loop having
  // run today (`lit`, scaled by the time of day), the night (`night`), or
  // the overnight pad (`pad`).
  // ---------------------------------------------------------------
  const lamps = [], extraGeos = [];
  let daypart = 'day';
  function lampMat(col, inten, flags) {
    const m = kit.emissiveMat(col, inten, { lamp: true });
    const L = Object.assign({ m, base: m.userData.baseEm, level: 0, from: 0, to: 0, p: 1, halos: [], soft: [], litOn: false, padOn: false, gain: DAY_GAIN.day }, flags || {});
    lamps.push(L);
    m.emissiveIntensity = 0;
    m.userData.habitatLamp = L;
    return L;
  }
  function lampTarget(L) {
    let t = 0;
    if (L.night && L.part === 'night') t = 1;
    if (L.lit && L.litOn) t = Math.max(t, L.gain);
    if (L.pad && L.padOn) t = Math.max(t, 1);
    return t;
  }
  function paint(L) {
    const k = L.level;
    L.m.emissiveIntensity = L.base * TK.em * k;
    L.halos.forEach((h) => { h.material.opacity = h.material.userData.baseOp * k; h.visible = k > 0.002; });
    L.soft.forEach((s) => { s.material.opacity = s.userData.op * k; s.visible = k > 0.002; });
  }
  function retarget(L, snap) {
    const t = lampTarget(L);
    if (snap) { L.level = L.to = L.from = t; L.p = 1; paint(L); return; }
    if (t === L.to && L.p >= 1) return;
    if (t !== L.to) { L.from = L.level; L.to = t; L.p = 0; }
  }
  function glow(L, parent, col, r, op, x, y, z) {
    const h = kit.halo(col, r, op);
    h.position.set(x || 0, y || 0, z || 0);
    h.visible = false; h.material.opacity = 0;
    parent.add(h); L.halos.push(h);
    return h;
  }

  // ---------------------------------------------------------------
  // DISTRICTS: a group on the tile centre, at most three PIECES (each a
  // group with its own contact shadow, local z <= 0 so the being at the
  // front is never hidden), the anchors the life engine's spots map onto,
  // and the lamps.
  // ---------------------------------------------------------------
  const group = new T.Group(); group.name = 'habitat';
  const districts = {};
  const agentOf = (id) => kit.AGENTS.find((a) => a.id === id);
  const accOf = (id) => kit.accOf(agentOf(id));

  function makeDistrict(id) {
    const pos = districtPosition(T, id);
    const g = new T.Group(); g.name = 'district:' + id; g.position.copy(pos); group.add(g);
    const hue = TK.hue[LAYOUT.HUE_OF[id]];
    const struct = hue.clone().lerp(TK.stage, STRUCT_MIX);
    const floor = new T.Group(); floor.name = 'floor'; g.add(floor);
    const d = {
      id, group: g, pos, r: tileRadius(id), hue, struct, floor,
      anchors: {}, props: {}, pieces: [], lamps: [],
      S: vinyl(struct, { rough: 0.38, coat: 0.7, coatR: 0.18 }),
      Sd: vinyl(darker(struct, 0.42), { rough: 0.5, coat: 0.5 }),
    };
    d.setLit = (on, who) => {
      d.lamps.forEach((L) => { if (L.lit && (!who || !L.who || L.who === who)) { L.litOn = !!on; retarget(L); } });
    };
    d.setDaypart = (part) => {
      d.lamps.forEach((L) => { L.part = part; L.gain = DAY_GAIN[part] != null ? DAY_GAIN[part] : DAY_GAIN.day; retarget(L); });
    };
    districts[id] = d;
    return d;
  }
  function piece(d, name, x, z, yaw, shadow) {
    const g = new T.Group(); g.name = name; g.userData.piece = name;
    g.position.set(x, 0, z); g.rotation.y = yaw || 0;
    d.group.add(g); d.pieces.push(g); d.props[name] = g;
    if (shadow) {
      const s = kit.contactShadow(shadow[0]);
      s.scale.set(1, (shadow[1] || shadow[0]) / shadow[0], 1);
      s.userData.contact = true; s.castShadow = false;
      g.add(s);
    }
    return g;
  }
  // anchors are world positions (the habitat group's frame) and a yaw the
  // being should face; `sit` marks a seat, and pos.y is then its height
  function anchor(d, name, x, y, z, yaw, extra) {
    d.anchors[name] = Object.assign({ pos: V(d.pos.x + x, y, d.pos.z + z), yaw: yaw || 0 }, extra || {});
  }
  // an anchor at a point inside a piece (a lamp, a hook), found in world space
  const _w = new T.Vector3();
  function anchorAt(d, name, obj, lx, ly, lz, yaw) {
    group.updateMatrixWorld(true);
    _w.set(lx || 0, ly || 0, lz || 0); obj.localToWorld(_w); group.worldToLocal(_w);
    d.anchors[name] = { pos: _w.clone(), yaw: yaw || 0 };
  }
  function dLamp(d, col, inten, flags) {
    const L = lampMat(col, inten, Object.assign({ part: 'day' }, flags));
    d.lamps.push(L);
    return L;
  }
  // a lathe leg set: four turned legs merged into one mesh
  function legs(xs, zs, h, mat) {
    const prof = [[1e-4, 0], [0.018, 0], [0.022, 0.012], [0.016, 0.034], [0.012, h * 0.7], [0.014, h * 0.9], [0.019, h - 0.008], [1e-4, h]];
    const list = [];
    xs.forEach((x) => zs.forEach((z) => list.push(at(lathe(prof, 16), x, 0, z))));
    return M(merge(list), mat);
  }
  // a garden bench: a bevelled seat and a bowed back rail carried on swept
  // end frames (Mind and the plaza share it)
  function parkBench(seatMat, frameMat, w) {
    const b = new T.Group();
    b.add(M(slab(w, 0.17, 0.034, 0.05), seatMat, 0, 0.13, 0));
    b.add(M(tube([[-w / 2 + 0.02, 0.3, -0.07], [0, 0.325, -0.095], [w / 2 - 0.02, 0.3, -0.07]], 0.019, { seg: 40 }), seatMat));
    const frames = [];
    [-1, 1].forEach((s) => {
      const x = s * (w / 2 - 0.05);
      frames.push(tube([[x, 0.0, 0.07], [x, 0.08, 0.068], [x, 0.13, 0.05], [x, 0.14, -0.04], [x, 0.22, -0.07], [x, 0.305, -0.072]], 0.016, { seg: 48 }));
      frames.push(tube([[x, 0.0, -0.07], [x, 0.07, -0.062], [x, 0.13, -0.05]], 0.016, { seg: 16 }));
      frames.push(at(sq(0.024, 0.012, 0.024, 2), x, 0.006, 0.07), at(sq(0.024, 0.012, 0.024, 2), x, 0.006, -0.07));
    });
    b.add(M(merge(frames), frameMat));
    return b;
  }
  // a page of writing, drawn once and cached by the kit (lazy: a canvas is
  // only made the first time a book is built)
  function linesTex() {
    return kit.tex('habitat-lines', (x, w, h) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(40,52,84,.5)';
      for (let y = 18, k = 0; y < h - 12; y += 13, k++) x.fillRect(12, y, w * (0.5 + ((k * 37) % 40) / 100), 4);
    }, 128, 160);
  }
  function softTex() {
    return kit.tex('habitat-soft', (x, w, h) => {
      const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.55, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }, 64, 64);
  }

  // ---- TRAIN · a squat rack, a bench, a chalk bowl ------------------
  function buildTrain(d) {
    const acc = accOf('coach');
    // 1 · THE RACK: one bent frame over the top, raked back braces, empty
    // J-cups where the Coach's own bar will dock, a caged lamp. (No stored
    // plates: beside the top bar they read, from above, as a second bar.)
    const rack = piece(d, 'rack', -0.3, -0.44, 0, [0.4, 0.28]);
    rack.add(M(slab(0.56, 0.3, 0.035, 0.06), d.Sd));
    const W = 0.21, H = 0.62;
    rack.add(M(tube([[-W, 0.03, 0.02], [-W, 0.3, 0.02], [-W, H - 0.07, 0.02], [-W + 0.03, H - 0.012, 0.02], [-W + 0.09, H, 0.02], [0, H + 0.004, 0.02],
      [W - 0.09, H, 0.02], [W - 0.03, H - 0.012, 0.02], [W, H - 0.07, 0.02], [W, 0.3, 0.02], [W, 0.03, 0.02]], 0.026, { seg: 160, rs: 12 }), d.S));
    const fittings = [];
    [-1, 1].forEach((s) => {
      fittings.push(tube([[s * W, 0.46, 0.02], [s * W, 0.32, -0.05], [s * W, 0.12, -0.11], [s * W, 0.035, -0.125]], 0.018, { seg: 30 }));
      fittings.push(at(sq(0.04, 0.018, 0.04, 2.4), s * W, 0.04, 0.02));
    });
    rack.add(M(merge(fittings), d.S));
    const cups = [];
    [-1, 1].forEach((s) => {
      cups.push(tube([[s * W, 0.4, 0.04], [s * W, 0.392, 0.08], [s * W, 0.41, 0.1], [s * W, 0.43, 0.104]], 0.012, { seg: 20 }));
      cups.push(at(sq(0.014, 0.014, 0.014, 2), s * W, 0.432, 0.104));
    });
    rack.add(M(merge(cups), N.steel));
    rack.add(M(lathe([[1e-4, 0.024], [0.03, 0.022], [0.038, 0.004], [0.036, 0], [1e-4, 0.002]], 24), N.steel, 0, H - 0.05, 0.02));
    const rackLamp = dLamp(d, lighter(acc, 0.2), 1.8, { lit: true });
    rack.add(M(sq(0.024, 0.03, 0.024, 2), rackLamp.m, 0, H - 0.078, 0.02));
    glow(rackLamp, rack, acc, 0.12, 0.45, 0, H - 0.085, 0.05);
    d.props.rackLamp = rackLamp.m;

    // 2 · THE BENCH: a padded top on two swept trestles
    const bench = piece(d, 'bench', -0.62, -0.06, 0, [0.22, 0.12]);
    bench.add(M(sq(0.15, 0.03, 0.075, 6, 3), vinyl(darker(d.struct, 0.62), { rough: 0.62, coat: 0.25, sheen: 0.7 }), 0, 0.135, 0));
    const tr = [tube([[-0.15, 0.1, 0], [0.15, 0.1, 0]], 0.016, { seg: 6 })];
    [-1, 1].forEach((s) => {
      tr.push(tube([[s * 0.1, 0.0, 0.065], [s * 0.1, 0.085, 0.05], [s * 0.1, 0.104, 0], [s * 0.1, 0.085, -0.05], [s * 0.1, 0.0, -0.065]], 0.013, { seg: 30 }));
      tr.push(at(sq(0.02, 0.01, 0.02, 2), s * 0.1, 0.005, 0.065), at(sq(0.02, 0.01, 0.02, 2), s * 0.1, 0.005, -0.065));
    });
    bench.add(M(merge(tr), N.steel));

    // 3 · THE CHALK BOWL: a turned stand, a brass bowl, a mound of chalk
    const chalk = piece(d, 'chalk', 0.6, -0.3, 0, [0.12]);
    chalk.add(M(lathe([[1e-4, 0], [0.085, 0], [0.09, 0.01], [0.08, 0.022], [0.04, 0.04], [0.024, 0.08], [0.02, 0.2], [0.022, 0.28], [0.03, 0.305], [1e-4, 0.31]], 32), d.S));
    chalk.add(M(lathe([[1e-4, 0.3], [0.04, 0.3], [0.085, 0.315], [0.11, 0.345], [0.118, 0.37], [0.112, 0.374], [0.1, 0.352], [0.07, 0.336], [1e-4, 0.332]], 40), N.brass));
    chalk.add(M(sq(0.094, 0.024, 0.094, 2.2), N.paper, 0, 0.342, 0));
    const blk = M(sq(0.034, 0.02, 0.026, 6), N.paper, 0.02, 0.37, 0.012); blk.rotation.y = 0.5; chalk.add(blk);

    anchor(d, 'work', -0.26, 0, -0.1, 0);
    anchor(d, 'rest', -0.62, 0.165, -0.06, 0, { sit: true });
    anchorAt(d, 'barDock', rack, 0, 0.41, 0.09, 0);
  }

  // ---- KNOWLEDGE · a card-catalogue wall, a desk, a small screen ------
  // Three beings, three pieces, each behind its own slot; a rug under them.
  function superShape(rx, rz, n) {
    const s = new T.Shape();
    for (let k = 0; k <= 64; k++) {
      const a = k / 64 * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
      const x = rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = rz * Math.sign(si) * Math.pow(Math.abs(si), 2 / n);
      if (k) s.lineTo(x, y); else s.moveTo(x, y);
    }
    return s;
  }
  function buildKnowledge(d) {
    const accR = accOf('researcher'), accW = accOf('watcher'), accL = accOf('librarian');
    // the rug: a superellipse with a border, floor dressing (not a piece)
    const rugG = new T.ExtrudeGeometry(superShape(0.94, 0.6, 2.6), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.012, bevelSegments: 2, curveSegments: 4 });
    rugG.rotateX(-Math.PI / 2); rugG.translate(0, 0.003, 0);
    const rug = M(rugG, vinyl(d.hue.clone().lerp(TK.stage, 0.62).lerp(TK.hue.vi, 0.08), { rough: 0.95, coat: 0, sheen: 0.8 }), 0, 0, -0.04);
    rug.castShadow = false; d.floor.add(rug);
    const border = superShape(0.84, 0.51, 2.6); border.holes.push(superShape(0.8, 0.47, 2.6));
    const bG = new T.ShapeGeometry(border, 6); bG.rotateX(-Math.PI / 2);
    const bm = M(bG, vinyl(TK.gold.clone().lerp(TK.stage, 0.45), { rough: 0.9, coat: 0, sheen: 0.6 }), 0, 0.0125, -0.04);
    bm.castShadow = false; d.floor.add(bm);
    d.props.rug = rug;

    // 1 · THE CARD CATALOGUE (Librarian): sixteen drawers, one pulled
    const cat = piece(d, 'catalogue', 0, -0.9, 0, [0.42, 0.18]);
    cat.add(M(slab(0.66, 0.23, 0.045, 0.03), N.woodDark));
    cat.add(M(sq(0.31, 0.29, 0.1, 9, 9), N.wood, 0, 0.335, 0));
    cat.add(M(slab(0.68, 0.25, 0.035, 0.04), d.S, 0, 0.62, 0));
    // a framed back, so from behind it is a cabinet and not a blank slab
    const backP = M(panel(0.5, 0.44, 0.014, 0.03, 0.005), N.woodDark, 0, 0.335, -0.104); backP.rotation.y = Math.PI; cat.add(backP);
    const backT = M(new T.TorusGeometry(0.19, 0.008, 6, 4), d.S, 0, 0.335, -0.112); backT.rotation.z = Math.PI / 4; backT.scale.set(1.3, 1.15, 1); cat.add(backT);
    const fronts = [], pulls = [], labels = [];
    const cols = [-0.21, -0.07, 0.07, 0.21], rows = [0.13, 0.26, 0.39, 0.52], OPEN = [3, 1];
    cols.forEach((x, ci) => rows.forEach((y, ri) => {
      const dz = (ci === OPEN[0] && ri === OPEN[1]) ? 0.08 : 0;
      fronts.push(at(panel(0.122, 0.108, 0.016, 0.018, 0.004), x, y, 0.104 + dz));
      pulls.push(at(new T.TorusGeometry(0.015, 0.0042, 6, 14, Math.PI), x, y - 0.026, 0.114 + dz, 0, 0, Math.PI));
      labels.push(at(panel(0.05, 0.022, 0.004, 0.004, 0.001), x, y + 0.022, 0.114 + dz));
    }));
    cat.add(M(merge(fronts), d.S)); cat.add(M(merge(pulls), N.brass)); cat.add(M(merge(labels), N.paper));
    const ox = cols[OPEN[0]], oy = rows[OPEN[1]];
    cat.add(M(panel(0.114, 0.1, 0.004, 0.01, 0.001), N.slate, ox, oy, 0.1));
    cat.add(M(slab(0.1, 0.08, 0.04, 0.01, 0.004), N.wood, ox, oy - 0.045, 0.142));
    const card = M(panel(0.08, 0.06, 0.003, 0.006, 0.001), N.paper, ox, oy + 0.02, 0.15); card.rotation.x = -0.12; cat.add(card);
    // the index lamp: a brass picture-light over the drawers
    cat.add(M(tube([[0, 0.655, -0.06], [0, 0.72, -0.03], [0, 0.745, 0.05], [0, 0.73, 0.12]], 0.009, { seg: 30 }), N.brass));
    cat.add(M(sq(0.13, 0.017, 0.03, 4, 2), N.brass, 0, 0.72, 0.135));
    const idxLamp = dLamp(d, lighter(accL, 0.2), 1.6, { lit: true, who: 'librarian' });
    cat.add(M(sq(0.11, 0.007, 0.018, 4, 2), idxLamp.m, 0, 0.703, 0.135));
    glow(idxLamp, cat, accL, 0.16, 0.4, 0, 0.66, 0.16);
    d.props.indexLamp = idxLamp.m;

    // 2 · THE DESK (Researcher): turned legs, an open book, a reading lamp
    const desk = piece(d, 'desk', -0.66, -0.34, 0, [0.3, 0.18]);
    desk.add(legs([-0.19, 0.19], [-0.095, 0.095], 0.29, N.woodDark));
    desk.add(M(slab(0.4, 0.2, 0.05, 0.02), N.woodDark, 0, 0.24, 0));
    desk.add(M(slab(0.46, 0.26, 0.032, 0.03), N.wood, 0, 0.29, 0));
    const top = 0.322;
    const book = new T.Group(); book.position.set(-0.02, top, 0.03); book.rotation.y = 0.12; desk.add(book);
    book.add(M(slab(0.2, 0.14, 0.008, 0.01, 0.003), vinyl(darker(accR, 0.5).lerp(d.hue, 0.3), { rough: 0.55 })));
    const pageM = vinyl(TK.ink.clone().lerp(TK.shell, 0.2), { rough: 0.85, coat: 0.05, sheen: 0.4 });
    pageM.map = linesTex();
    [-1, 1].forEach((s) => { const pg = M(slab(0.09, 0.126, 0.012, 0.008, 0.003), pageM, s * 0.047, 0.006, 0); pg.rotation.z = -s * 0.09; book.add(pg); });
    [TK.hue.abs, TK.hue.quads].forEach((c, k) => {
      const bk = M(slab(0.13 - k * 0.012, 0.09, 0.028, 0.008, 0.004), vinyl(darker(c, 0.6), { rough: 0.5 }), 0.15, top + k * 0.028, 0.06 - k * 0.004);
      bk.rotation.y = -0.2 + k * 0.25; desk.add(bk);
    });
    const lampG = new T.Group(); lampG.position.set(0.14, top, -0.07); desk.add(lampG);
    lampG.add(M(lathe([[1e-4, 0], [0.045, 0], [0.048, 0.01], [0.03, 0.02], [0.012, 0.028], [1e-4, 0.03]], 24), N.brass));
    lampG.add(M(tube([[0, 0.02, 0], [0, 0.13, -0.01], [-0.03, 0.2, 0.02], [-0.07, 0.21, 0.06]], 0.008, { seg: 30 }), N.brass));
    const shade = M(lathe([[1e-4, 0.046], [0.02, 0.044], [0.04, 0.03], [0.052, 0.008], [0.056, 0]], 28), vinyl(d.struct, { rough: 0.35, coat: 0.8, side: T.DoubleSide }), -0.08, 0.175, 0.07);
    shade.rotation.x = 0.35; lampG.add(shade);
    const deskLamp = dLamp(d, lighter(accR, 0.35).lerp(TK.gold, 0.3), 2.0, { lit: true, who: 'researcher' });
    lampG.add(M(sq(0.018, 0.018, 0.018, 2), deskLamp.m, -0.08, 0.186, 0.072));
    glow(deskLamp, lampG, TK.gold, 0.14, 0.5, -0.08, 0.15, 0.09);
    d.props.deskLamp = deskLamp.m;

    // 3 · THE SMALL SCREEN (Watcher) on a stand, turned to face a floor
    // cushion, so it watches in profile and the camera still reads it
    const cin = piece(d, 'cinema', 0.7, -0.04, 0, [0.3, 0.16]);
    const scr = new T.Group(); scr.position.set(0.24, 0, -0.04); scr.rotation.y = -Math.PI / 2; cin.add(scr);
    scr.add(M(lathe([[1e-4, 0], [0.09, 0], [0.094, 0.01], [0.07, 0.022], [0.02, 0.03], [1e-4, 0.032]], 28), N.slate));
    scr.add(M(tube([[0, 0.03, 0], [0, 0.2, -0.005], [0, 0.33, -0.03], [0, 0.4, -0.02]], 0.013, { seg: 24 }), N.steel));
    scr.add(M(sq(0.19, 0.12, 0.024, 6, 6), N.slate, 0, 0.42, 0));
    const screenLamp = dLamp(d, lighter(accW, 0.2).lerp(TK.hue.cy, 0.3), 1.7, { lit: true, who: 'watcher' });
    scr.add(M(panel(0.33, 0.19, 0.006, 0.02, 0.002), screenLamp.m, 0, 0.42, 0.023));
    glow(screenLamp, scr, accW, 0.2, 0.45, 0, 0.42, 0.09);
    d.props.screen = screenLamp.m;
    const pouf = new T.Group(); pouf.position.set(-0.3, 0, 0.04); cin.add(pouf);
    pouf.add(M(sq(0.17, 0.045, 0.16, 2.6, 2.2), vinyl(accW.clone().lerp(TK.stage, 0.45), { rough: 0.7, coat: 0.2, sheen: 0.9 }), 0, 0.045, 0));
    const pipe = M(new T.TorusGeometry(0.166, 0.008, 6, 48), vinyl(lighter(accW, 0.1).lerp(TK.stage, 0.3), { rough: 0.6 }), 0, 0.045, 0);
    pipe.rotation.x = Math.PI / 2; pipe.scale.set(1, 0.95, 1); pouf.add(pipe);
    pouf.add(M(sq(0.018, 0.01, 0.018, 2), N.brass, 0, 0.09, 0));

    anchor(d, 'work:researcher', -0.66, 0, -0.02, 0);
    anchor(d, 'rest:researcher', -0.95, 0, 0.12, 0.25);
    anchor(d, 'work:librarian', -0.04, 0, -0.54, 0);
    anchor(d, 'rest:librarian', 0.3, 0, -0.4, -0.3);
    anchor(d, 'work:watcher', 0.4, 0.09, 0.0, Math.PI / 2, { sit: true });
    anchor(d, 'rest:watcher', 0.66, 0, 0.36, -0.25, { sit: true });
    anchorAt(d, 'screen', scr, 0, 0.42, 0.03, -Math.PI / 2);
    anchorAt(d, 'lamp', lampG, -0.08, 0.186, 0.072, 0);
  }

  // an eight-point rose, extruded and bevelled (the Commander's crest, big)
  function roseGeo(R1, R2, r0, depth, bevel) {
    const s = new T.Shape();
    for (let k = 0; k < 16; k++) {
      const a = Math.PI / 2 + k * Math.PI / 8, rr = (k % 4 === 0) ? R1 : (k % 2 === 0 ? R2 : r0);
      if (k) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    s.closePath();
    const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
    g.center();
    return g;
  }

  // ---- LOGISTICS · a signal mast, a dispatch lectern, two crates ------
  function buildLogistics(d) {
    const acc = accOf('commander');
    // 1 · THE MAST: a stepped plinth, a tapering spar, a yard, and the
    // compass rose on top in a bezel
    const mast = piece(d, 'mast', -0.5, -0.42, 0, [0.22]);
    mast.add(M(lathe([[1e-4, 0], [0.16, 0], [0.165, 0.018], [0.15, 0.036], [0.11, 0.046], [0.1, 0.072], [0.055, 0.09], [1e-4, 0.095]], 40), d.Sd));
    mast.add(M(lathe([[1e-4, 0.08], [0.036, 0.08], [0.03, 0.3], [0.021, 0.74], [0.017, 0.86], [1e-4, 0.87]], 20), N.steel));
    mast.add(M(tube([[-0.14, 0.6, 0], [0, 0.635, 0], [0.14, 0.6, 0]], 0.011, { seg: 20 }), N.steel));
    const flags = [];
    [-1, 1].forEach((s) => {
      flags.push(at(sq(0.016, 0.016, 0.016, 2), s * 0.145, 0.598, 0));
      // a pennant hanging from each yard-arm: a thin bent tongue
      const pen = new T.Shape(); pen.moveTo(0, 0); pen.quadraticCurveTo(0.028, -0.06, 0.0, -0.13); pen.lineTo(-0.012, -0.1); pen.quadraticCurveTo(-0.02, -0.05, -0.03, 0); pen.closePath();
      flags.push(at(new T.ExtrudeGeometry(pen, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 }), s * 0.13, 0.595, 0));
    });
    mast.add(M(merge(flags), d.S));
    const rose = new T.Group(); rose.position.set(0, 0.95, 0.01); mast.add(rose);
    const gold = vinyl(lighter(TK.gold, 0.15), { rough: 0.26, metal: 0.85, coat: 0.6, sheen: 0 });
    rose.add(M(roseGeo(0.12, 0.07, 0.028, 0.016, 0.006), gold));
    const back = M(roseGeo(0.08, 0.08, 0.026, 0.01, 0.004), d.S, 0, 0, -0.012); back.rotation.z = Math.PI / 4; rose.add(back);
    rose.add(M(new T.TorusGeometry(0.1, 0.007, 8, 48), N.steel, 0, 0, -0.004));
    rose.add(M(sq(0.022, 0.022, 0.016, 2), d.S, 0, 0, 0.014));

    // 2 · THE DISPATCH LECTERN: a turned pedestal, a sloped top, the slate
    const lec = piece(d, 'lectern', 0.02, -0.52, 0, [0.2]);
    lec.add(M(lathe([[1e-4, 0], [0.13, 0], [0.135, 0.015], [0.1, 0.035], [0.045, 0.06], [0.034, 0.2], [0.04, 0.3], [0.07, 0.338], [1e-4, 0.345]], 36), N.wood));
    const tilt = new T.Group(); tilt.position.set(0, 0.34, 0); tilt.rotation.x = 0.42; lec.add(tilt);
    tilt.add(M(slab(0.34, 0.24, 0.03, 0.035), N.woodDark, 0, 0, 0));
    tilt.add(M(slab(0.34, 0.03, 0.02, 0.01, 0.005), N.woodDark, 0, 0.03, 0.12));
    tilt.add(M(slab(0.27, 0.17, 0.014, 0.02, 0.004), N.slate, 0, 0.03, -0.01));
    const slate = dLamp(d, lighter(acc, 0.1), 1.6, { lit: true });
    tilt.add(M(slab(0.22, 0.12, 0.004, 0.014, 0.001), slate.m, 0, 0.043, -0.01));
    glow(slate, tilt, acc, 0.16, 0.35, 0, 0.09, 0);
    d.props.slate = slate.m;

    // 3 · TWO CRATES: banded, the small one set on the big one askew
    const crates = piece(d, 'crates', -0.64, -0.02, 0.2, [0.19, 0.16]);
    const bandsA = [], bandsB = [];
    crates.add(M(sq(0.12, 0.095, 0.105, 8, 8), N.wood, 0, 0.095, 0));
    [0.05, 0.14].forEach((y) => bandsA.push(at(sq(0.124, 0.011, 0.109, 8, 8), 0, y, 0)));
    const top = new T.Group(); top.position.set(0.02, 0.19, -0.01); top.rotation.y = -0.45; crates.add(top);
    top.add(M(sq(0.085, 0.07, 0.078, 8, 8), N.wood, 0, 0.07, 0));
    [0.035, 0.105].forEach((y) => bandsB.push(at(sq(0.088, 0.009, 0.081, 8, 8), 0, y, 0)));
    crates.add(M(merge(bandsA), d.S)); top.add(M(merge(bandsB), d.S));

    anchor(d, 'work', 0.02, 0, -0.2, 0);
    anchor(d, 'rest', -0.42, 0, 0.18, 0.35);
    anchorAt(d, 'mast', rose, 0, 0, 0, 0);
  }

  // ---- FUEL · a counter with a stove ring, hanging pans, a produce crate
  function buildFuel(d) {
    const acc = accOf('mealprep');
    // 1 · THE COUNTER: a soft block, a pale worktop, two doors, the burner
    const ctr = piece(d, 'counter', 0.3, -0.46, 0, [0.32, 0.2]);
    ctr.add(M(sq(0.225, 0.14, 0.13, 8, 8), d.S, 0, 0.16, 0));
    ctr.add(M(slab(0.47, 0.29, 0.03, 0.035), N.stone, 0, 0.29, 0));
    const doors = [], knobs = [];
    [-1, 1].forEach((s) => {
      doors.push(at(panel(0.19, 0.19, 0.014, 0.02, 0.004), s * 0.105, 0.155, 0.128));
      knobs.push(at(sq(0.011, 0.011, 0.011, 2), s * 0.03, 0.2, 0.14));
    });
    ctr.add(M(merge(doors), d.Sd)); ctr.add(M(merge(knobs), N.brass));
    const top = 0.32;
    ctr.add(M(lathe([[1e-4, 0], [0.085, 0], [0.088, 0.01], [0.08, 0.014], [1e-4, 0.014]], 36), N.slate, 0.09, top, -0.01));
    const stove = dLamp(d, lighter(acc, 0.15).lerp(TK.gold, 0.35), 2.2, { lit: true });
    const ring = M(new T.TorusGeometry(0.056, 0.008, 8, 40), stove.m, 0.09, top + 0.017, -0.01);
    ring.rotation.x = Math.PI / 2; ring.castShadow = false; ctr.add(ring);
    const grate = [at(new T.TorusGeometry(0.07, 0.005, 6, 36), 0, 0, 0, Math.PI / 2)];
    for (let k = 0; k < 4; k++) grate.push(at(new T.CylinderGeometry(0.004, 0.004, 0.06, 6), 0.045, 0, 0, 0, 0, Math.PI / 2).rotateY(k * Math.PI / 2));
    const gm = M(merge(grate), N.steel, 0.09, top + 0.03, -0.01); ctr.add(gm);
    glow(stove, ctr, acc, 0.14, 0.45, 0.09, top + 0.04, 0.0);
    // steam over the stove: three soft wisps that show with the ring. They
    // do not drift (the loop sleeps); they are there or not.
    [[0.0, 0.1, 0.09], [0.02, 0.19, 0.12], [-0.015, 0.27, 0.15]].forEach((w) => {
      const sm = new T.SpriteMaterial({ map: softTex(), color: TK.ink.clone().lerp(TK.shell, 0.2), transparent: true, opacity: 0, depthWrite: false });
      const sp = new T.Sprite(sm); sp.position.set(0.09 + w[0], top + w[1], -0.01); sp.scale.setScalar(w[2]);
      sp.userData.op = 0.32; sp.visible = false; ctr.add(sp); stove.soft.push(sp);
    });
    // a board with two things on it, at the other end
    const brd = M(slab(0.14, 0.1, 0.014, 0.02, 0.004), N.wood, -0.1, top, 0.01); brd.rotation.y = 0.2; ctr.add(brd);
    ctr.add(M(sq(0.03, 0.028, 0.03, 2.1), vinyl(darker(TK.hue.chest, 0.85), { rough: 0.3, coat: 0.9 }), -0.12, top + 0.04, 0.01));
    ctr.add(M(sq(0.022, 0.02, 0.05, 2.2), vinyl(darker(TK.hue.good, 0.7), { rough: 0.45, coat: 0.6 }), -0.07, top + 0.033, 0.02));
    d.props.stoveRing = stove.m;

    // 2 · THE PAN RACK: a turned post, a hooked arm, two pans hanging
    const pans = piece(d, 'pans', 0.68, -0.2, 0, [0.14]);
    pans.add(M(lathe([[1e-4, 0], [0.07, 0], [0.074, 0.01], [0.05, 0.02], [0.02, 0.03], [0.016, 0.3], [0.014, 0.6], [0.02, 0.64], [1e-4, 0.66]], 24), N.woodDark));
    pans.add(M(tube([[0, 0.62, 0], [-0.02, 0.68, -0.01], [-0.1, 0.7, -0.04], [-0.22, 0.67, -0.07]], 0.011, { seg: 30 }), N.steel));
    const copper = vinyl(TK.gold.clone().lerp(TK.hue.chest, 0.45), { rough: 0.3, metal: 0.85, coat: 0.5, sheen: 0 });
    [[-0.1, 0.69, -0.04, 0.075, N.steel], [-0.2, 0.672, -0.066, 0.06, copper]].forEach((p) => {
      const pg = new T.Group(); pg.position.set(p[0], p[1], p[2]); pans.add(pg);
      pg.add(M(tube([[0, 0, 0], [0, -0.03, 0.005], [0, -0.09, 0.01]], 0.007, { seg: 10 }), N.steel));
      const pan = M(lathe([[1e-4, 0], [p[3] * 0.8, 0], [p[3], 0.01], [p[3] * 1.04, 0.028], [p[3] * 0.96, 0.03], [p[3] * 0.8, 0.012], [1e-4, 0.012]], 36), p[4], 0, -0.09 - p[3], 0.012);
      pan.rotation.x = Math.PI / 2; pg.add(pan);
    });

    // 3 · THE PRODUCE CRATE: open, heaped with things that are food
    const crate = piece(d, 'produce', -0.6, -0.06, -0.25, [0.17, 0.13]);
    crate.add(M(sq(0.13, 0.065, 0.1, 8, 8), N.wood, 0, 0.065, 0));
    crate.add(M(sq(0.112, 0.012, 0.084, 8, 8), N.woodDark, 0, 0.128, 0));
    const food = [[TK.hue.chest, -0.06, 0.02, 0.036], [TK.hue.good, 0.0, -0.03, 0.04], [TK.hue.shoulders, 0.065, 0.015, 0.034], [TK.hue.abs, -0.02, 0.045, 0.028], [TK.hue.good, 0.05, -0.04, 0.03]];
    food.forEach((f) => crate.add(M(sq(f[3], f[3] * 0.92, f[3], 2.1), vinyl(darker(f[0], 0.8), { rough: 0.35, coat: 0.8 }), f[1], 0.14 + f[3] * 0.7, f[2])));

    anchor(d, 'work', 0.28, 0, -0.14, 0);
    anchor(d, 'rest', -0.36, 0, 0.12, 0.4);
    anchorAt(d, 'stove', ctr, 0.09, top + 0.02, -0.01, 0);
  }

  // ---- MONEY · a counting desk and ledger stand, a coin stack, a safe --
  function buildMoney(d) {
    const acc = accOf('cfo');
    // 1 · THE COUNTING DESK: a banker's lamp and a tall ledger stand
    const desk = piece(d, 'desk', 0.22, -0.5, 0, [0.3, 0.18]);
    desk.add(legs([-0.2, 0.2], [-0.09, 0.09], 0.28, N.woodDark));
    desk.add(M(slab(0.44, 0.2, 0.05, 0.02), d.Sd, 0, 0.23, 0));
    desk.add(M(slab(0.5, 0.26, 0.032, 0.03), N.wood, 0, 0.28, 0));
    const top = 0.312;
    const stand = new T.Group(); stand.position.set(0.12, top, -0.06); desk.add(stand);
    stand.add(M(lathe([[1e-4, 0], [0.05, 0], [0.052, 0.01], [0.02, 0.022], [0.013, 0.2], [0.018, 0.23], [1e-4, 0.235]], 24), N.brass));
    const lean = new T.Group(); lean.position.set(0, 0.26, 0); lean.rotation.x = 1.05; stand.add(lean);
    lean.add(M(slab(0.2, 0.25, 0.018, 0.02), N.woodDark, 0, 0, 0));
    const pageM = vinyl(TK.ink.clone().lerp(TK.shell, 0.2), { rough: 0.85, coat: 0.05, sheen: 0.4 });
    pageM.map = linesTex();
    [-1, 1].forEach((s) => { const pg = M(slab(0.088, 0.22, 0.01, 0.008, 0.003), pageM, s * 0.046, 0.018, 0); pg.rotation.z = -s * 0.07; lean.add(pg); });
    // the banker's lamp: a green glass hood over a lit strip
    const lampG = new T.Group(); lampG.position.set(-0.13, top, -0.03); desk.add(lampG);
    lampG.add(M(lathe([[1e-4, 0], [0.042, 0], [0.045, 0.01], [0.02, 0.02], [0.01, 0.12], [0.014, 0.13], [1e-4, 0.135]], 24), N.brass));
    const hood = M(sq(0.075, 0.03, 0.036, 2.2, 2), vinyl(darker(d.hue, 0.42).lerp(TK.stage, 0.2), { rough: 0.12, coat: 1, coatR: 0.05, sheen: 0.1, env: 0.6 }), 0, 0.15, 0.01);
    lampG.add(hood);
    const dl = dLamp(d, lighter(acc, 0.2), 2.0, { lit: true });
    lampG.add(M(sq(0.06, 0.006, 0.024, 3, 2), dl.m, 0, 0.123, 0.01));
    glow(dl, lampG, acc, 0.14, 0.5, 0, 0.1, 0.04);
    d.props.deskLamp = dl.m;

    // 2 · THE COIN STACK: a fixed short stack unless the month's receipt
    // count is known (setStack); never a made-up number
    const st = piece(d, 'stack', -0.3, -0.46, 0, [0.12]);
    st.add(M(lathe([[1e-4, 0], [0.1, 0], [0.105, 0.012], [0.098, 0.02], [0.085, 0.014], [1e-4, 0.014]], 36), N.woodDark));
    const coinGeo = lathe([[1e-4, 0], [0.058, 0], [0.066, 0.004], [0.066, 0.014], [0.058, 0.018], [0.04, 0.016], [1e-4, 0.016]], 32);
    extraGeos.push(coinGeo);
    const coinM = vinyl(lighter(TK.gold, 0.12), { rough: 0.28, metal: 0.8, coat: 0.8, sheen: 0 });
    const coins = new T.Group(); st.add(coins);
    let coinGeoMerged = null;
    function setStack(n) {
      // a known zero is an empty dish, not one coin standing in for it
      const count = n == null ? 5 : Math.max(0, Math.min(24, Math.round(n)));
      if (coinGeoMerged) { coins.remove(coinGeoMerged); coinGeoMerged.geometry.dispose(); coinGeoMerged = null; }
      const list = [];
      for (let k = 0; k < count; k++) list.push(at(coinGeo.clone(), Math.sin(k * 2.1) * 0.004, 0.016 + k * 0.017, Math.cos(k * 1.7) * 0.004, 0, k * 0.7));
      if (list.length) { coinGeoMerged = M(merge(list), coinM); coins.add(coinGeoMerged); }
      if (d.anchors.stack) d.anchors.stack.pos.y = 0.02 + count * 0.017;
      return count;
    }
    setStack(null);
    d.setStack = setStack;

    // 3 · THE SAFE: a soft steel block on feet, a round door and dial
    const safe = piece(d, 'safe', 0.6, -0.08, -0.3, [0.18]);
    const safeM = vinyl(darker(d.struct, 0.5).lerp(TK.shell, 0.15), { rough: 0.35, metal: 0.5, coat: 0.7 });
    safe.add(M(sq(0.15, 0.14, 0.13, 7, 7), safeM, 0, 0.165, 0));
    const feet = [];
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((c) => feet.push(at(sq(0.022, 0.014, 0.022, 3), c[0] * 0.11, 0.014, c[1] * 0.09)));
    safe.add(M(merge(feet), N.slate));
    safe.add(M(panel(0.22, 0.22, 0.02, 0.03, 0.006), vinyl(d.struct.clone().lerp(TK.shell, 0.25), { rough: 0.3, metal: 0.55, coat: 0.8 }), 0, 0.165, 0.135));
    const dial = M(lathe([[1e-4, 0], [0.045, 0], [0.05, 0.008], [0.04, 0.02], [0.02, 0.026], [1e-4, 0.028]], 32), N.brass, 0, 0.18, 0.145);
    dial.rotation.x = Math.PI / 2; safe.add(dial);
    safe.add(M(tube([[0.06, 0.12, 0.15], [0.075, 0.1, 0.165], [0.085, 0.08, 0.15]], 0.008, { seg: 12 }), N.brass));

    anchor(d, 'work', 0.22, 0, -0.18, 0);
    anchor(d, 'rest', 0.42, 0, 0.18, -0.4);
    anchor(d, 'stack', -0.3, 0.02 + 5 * 0.017, -0.46, 0);
  }

  // ---- PLATFORM · a watchtower, a vault door, the overnight pad --------
  function buildPlatform(d) {
    const acc = accOf('guardian');
    const stoneM = vinyl(d.struct.clone().lerp(TK.shell, 0.35), { rough: 0.72, coat: 0.2, sheen: 0.3 });
    // 1 · THE WATCHTOWER: a turned stone body with a corbelled head, and
    // the lantern housing on top (lit every night)
    const tw = piece(d, 'tower', 0.42, -0.4, 0, [0.26]);
    tw.add(M(lathe([[1e-4, 0], [0.2, 0], [0.205, 0.02], [0.18, 0.05], [0.158, 0.1], [0.14, 0.42], [0.142, 0.5], [0.17, 0.53], [0.182, 0.56], [0.182, 0.6], [0.16, 0.605], [1e-4, 0.61]], 48), stoneM));
    const trim = [at(new T.TorusGeometry(0.143, 0.01, 8, 48), 0, 0.2, 0, Math.PI / 2), at(new T.TorusGeometry(0.184, 0.012, 8, 48), 0, 0.6, 0, Math.PI / 2)];
    // four merlons round the parapet, rounded
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; trim.push(at(sq(0.04, 0.03, 0.03, 5), Math.sin(a) * 0.162, 0.63, Math.cos(a) * 0.162, 0, a)); }
    tw.add(M(merge(trim), d.Sd));
    // a window slit on the camera side, dark, with a lit sill it does not need
    tw.add(M(panel(0.05, 0.11, 0.02, 0.02, 0.005), N.slate, 0, 0.36, 0.138));
    const hous = new T.Group(); hous.position.set(0, 0.61, 0); tw.add(hous);
    hous.add(M(lathe([[1e-4, 0], [0.085, 0], [0.09, 0.012], [0.075, 0.024], [1e-4, 0.026]], 32), N.brass));
    const posts = [];
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; posts.push(at(new T.CylinderGeometry(0.006, 0.006, 0.16, 8), Math.sin(a) * 0.064, 0.1, Math.cos(a) * 0.064)); }
    hous.add(M(merge(posts), N.brass));
    const glassM = new T.MeshPhysicalMaterial({ color: TK.ink.clone().lerp(TK.shell, 0.4), roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide });
    const glass = M(new T.CylinderGeometry(0.062, 0.062, 0.15, 28, 1, true), glassM, 0, 0.1, 0); glass.castShadow = false; hous.add(glass);
    hous.add(M(lathe([[1e-4, 0.18], [0.09, 0.18], [0.095, 0.19], [0.07, 0.23], [0.03, 0.27], [0.012, 0.3], [0.02, 0.315], [1e-4, 0.33]], 32), N.brass));
    const tower = dLamp(d, lighter(acc, 0.2), 2.6, { night: true });
    hous.add(M(lathe([[1e-4, -0.045], [0.024, -0.03], [0.03, -0.004], [0.022, 0.024], [0.01, 0.046], [1e-4, 0.066]], 18), tower.m, 0, 0.08, 0));
    glow(tower, hous, acc, 0.22, 0.55, 0, 0.1, 0);
    d.props.lantern = tower.m;

    // 2 · THE VAULT DOOR: a round door, bolted and wheeled, set into a
    // soft bulkhead that rises out of the tile; its ring is the district lamp
    const v = piece(d, 'vault', -0.26, -0.46, 0, [0.3, 0.16]);
    v.add(M(sq(0.23, 0.37, 0.11, 3.2, 3.2, -0.02), stoneM, 0, 0.0, 0));
    const door = new T.Group(); door.position.set(0, 0.185, 0.098); v.add(door);
    const discM = vinyl(TK.shell.clone().lerp(d.struct, 0.3), { rough: 0.3, metal: 0.75, coat: 0.7 });
    const disc = M(lathe([[1e-4, 0.028], [0.07, 0.028], [0.08, 0.02], [0.12, 0.02], [0.13, 0.012], [0.14, 0.0], [1e-4, 0.0]], 48), discM);
    disc.rotation.x = Math.PI / 2; door.add(disc);
    const collar = M(new T.TorusGeometry(0.15, 0.02, 12, 56), d.Sd, 0, 0, 0.004); door.add(collar);
    const vaultLamp = dLamp(d, lighter(acc, 0.2), 1.8, { lit: true });
    door.add(M(new T.TorusGeometry(0.138, 0.005, 6, 56), vaultLamp.m, 0, 0, 0.012));
    const bolts = [], wheel = [at(new T.TorusGeometry(0.052, 0.008, 8, 36), 0, 0, 0.05)];
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; bolts.push(at(sq(0.009, 0.009, 0.007, 2), Math.cos(a) * 0.105, Math.sin(a) * 0.105, 0.024)); }
    for (let k = 0; k < 3; k++) wheel.push(at(new T.CylinderGeometry(0.005, 0.005, 0.1, 8), 0, 0, 0.048, 0, 0, k * Math.PI / 3));
    wheel.push(at(sq(0.016, 0.016, 0.014, 2), 0, 0, 0.05));
    door.add(M(merge(bolts), N.brass)); door.add(M(merge(wheel), N.brass));
    glow(vaultLamp, door, acc, 0.16, 0.3, 0, 0, 0.05);
    d.props.vaultRing = vaultLamp.m;

    // 3 · THE OVERNIGHT PAD: a low disc with a lit ring (03:30-06:00 when
    // overnight work is queued: setPad)
    const pad = piece(d, 'pad', -0.56, 0.0, 0, [0.24]);
    pad.add(M(lathe([[1e-4, 0], [0.2, 0], [0.21, 0.012], [0.205, 0.028], [0.19, 0.034], [1e-4, 0.034]], 48), d.Sd));
    const padLamp = dLamp(d, lighter(acc, 0.25), 1.8, { pad: true });
    const pr = M(new T.TorusGeometry(0.15, 0.01, 6, 56), padLamp.m, 0, 0.035, 0); pr.rotation.x = Math.PI / 2; pr.castShadow = false; pad.add(pr);
    const chev = [];
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; chev.push(at(sq(0.03, 0.004, 0.012, 3), Math.sin(a) * 0.09, 0.036, Math.cos(a) * 0.09, 0, a)); }
    chev.push(at(sq(0.03, 0.005, 0.03, 2), 0, 0.036, 0));
    pad.add(M(merge(chev), N.steel));
    glow(padLamp, pad, acc, 0.2, 0.3, 0, 0.06, 0);
    d.props.pad = padLamp.m;
    d.setPad = (on) => { padLamp.padOn = !!on; retarget(padLamp); };

    anchor(d, 'work', -0.26, 0, -0.12, 0);
    anchor(d, 'rest', 0.16, 0, -0.02, -0.3);
    anchorAt(d, 'lanternDock', hous, 0, 0.1, 0, 0);
    anchor(d, 'pad', -0.56, 0.035, 0.0, 0);
  }

  // ---- MIND · a bench, a still pool, a paper lantern on a post ---------
  function buildMind(d) {
    const acc = accOf('leader');
    // 1 · THE BENCH: where it sits and listens
    const bench = piece(d, 'bench', -0.42, -0.34, 0, [0.28, 0.14]);
    bench.add(parkBench(N.wood, d.S, 0.46));

    // 2 · THE STILL POOL: a stone rim, and water that is a mirror, the
    // Leader's own visor laid flat
    const pool = piece(d, 'pool', 0.18, -0.46, 0, [0.32, 0.3]);
    pool.add(M(lathe([[0.22, 0.0], [0.28, 0.0], [0.286, 0.03], [0.278, 0.058], [0.258, 0.066], [0.24, 0.058], [0.234, 0.034], [0.22, 0.03], [0.22, 0.0]], 64, false), N.stone));
    const water = new T.MeshPhysicalMaterial({ color: TK.stage.clone().lerp(d.hue, 0.18), roughness: 0.04, metalness: 0.9, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.3, iridescenceIOR: 1.5 });
    water.envMapIntensity = 1.5;
    const wm = M(new T.CircleGeometry(0.236, 48), water, 0, 0.042, 0); wm.rotation.x = -Math.PI / 2; wm.castShadow = false; pool.add(wm);
    pool.add(M(sq(0.05, 0.028, 0.04, 2.4), N.stone, 0.25, 0.028, 0.12));
    pool.add(M(sq(0.034, 0.02, 0.03, 2.4), N.stone, 0.3, 0.02, 0.05));

    // 3 · THE PAPER LANTERN on a crook, lit every night
    const lp = piece(d, 'lantern', -0.7, -0.08, 0, [0.12]);
    lp.add(M(lathe([[1e-4, 0], [0.07, 0], [0.072, 0.012], [0.04, 0.024], [0.016, 0.04], [0.013, 0.6], [0.016, 0.66], [1e-4, 0.67]], 24), N.woodDark));
    lp.add(M(tube([[0, 0.64, 0], [0.012, 0.71, 0], [0.07, 0.735, 0], [0.12, 0.7, 0]], 0.009, { seg: 30 }), N.woodDark));
    const lant = new T.Group(); lant.position.set(0.12, 0.56, 0); lp.add(lant);
    lant.add(M(tube([[0, 0.14, 0], [0, 0.1, 0]], 0.003, { seg: 4 }), N.woodDark));
    const paper = dLamp(d, lighter(acc, 0.35).lerp(TK.gold, 0.25), 1.6, { night: true, lit: true });
    paper.m.color.copy(TK.ink.clone().lerp(TK.shell, 0.35));
    paper.m.roughness = 0.85;
    lant.add(M(lathe([[1e-4, 0.085], [0.04, 0.08], [0.066, 0.05], [0.072, 0.0], [0.066, -0.05], [0.04, -0.08], [1e-4, -0.085]], 32), paper.m));
    const ribs = [];
    [-0.045, 0, 0.045].forEach((y) => ribs.push(at(new T.TorusGeometry(Math.sqrt(Math.max(0, 1 - (y / 0.085) * (y / 0.085))) * 0.072 * 0.985 + 0.001, 0.0013, 4, 40), 0, y, 0, Math.PI / 2)));
    ribs.push(at(lathe([[1e-4, 0.1], [0.03, 0.1], [0.036, 0.086], [1e-4, 0.083]], 20), 0, 0, 0), at(lathe([[1e-4, -0.083], [0.036, -0.086], [0.03, -0.1], [1e-4, -0.1]], 20), 0, 0, 0));
    lant.add(M(merge(ribs), N.woodDark));
    glow(paper, lant, acc, 0.2, 0.5, 0, 0, 0.02);
    d.props.lantern = paper.m;

    anchor(d, 'work', -0.42, 0.164, -0.36, 0, { sit: true });
    anchor(d, 'rest', 0.62, 0, -0.28, -1.96);
    anchorAt(d, 'lantern', lant, 0, 0, 0, 0);
  }

  const BUILDERS = { train: buildTrain, knowledge: buildKnowledge, logistics: buildLogistics, fuel: buildFuel, money: buildMoney, platform: buildPlatform, mind: buildMind };
  LAYOUT.ORDER.forEach((id) => BUILDERS[id](makeDistrict(id)));

  // ---------------------------------------------------------------
  // LANES: the ring, the spokes, the plaza ring. Beings walk on nothing
  // else: route() only ever follows these, and never crosses a tile's
  // middle or the plinth (the plaza ring runs outside it).
  // ---------------------------------------------------------------
  const lanesG = new T.Group(); lanesG.name = 'lanes'; group.add(lanesG);
  // a hair lighter than the ground it crosses, never a stripe across the map
  const laneM = vinyl(TK.stage.clone().lerp(TK.shell, 0.1).multiplyScalar(0.8), { rough: 0.95, coat: 0, sheen: 0, env: 0.15 });
  const ringAt = (th) => V(Math.sin(th) * LANES.a, 0, Math.cos(th) * LANES.b);
  const plazaAt = (ph) => V(Math.sin(ph) * LANES.plazaR, 0, Math.cos(ph) * LANES.plazaR);
  // a flat band with a little depth (a paved path, not paper): a top strip
  // and two side strips, each with its own normals
  function band(pts, closed, y, depth) {
    const n = pts.length, h = LANES.w / 2, pos = [], nor = [], idx = [];
    const off = pts.map((p, i) => {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      return [tz / l, -tx / l];
    });
    const segs = closed ? n : n - 1;
    const strip = (vert, flip) => {
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) vert(i).forEach((v) => { pos.push(v[0], v[1], v[2]); nor.push(v[3], v[4], v[5]); });
      for (let i = 0; i < segs; i++) {
        const A = base + i * 2, B = base + ((i + 1) % n) * 2;
        if (flip) idx.push(A, B, A + 1, A + 1, B, B + 1); else idx.push(A, A + 1, B, A + 1, B + 1, B);
      }
    };
    const R = (i, yy) => [pts[i].x + off[i][0] * h, yy, pts[i].z + off[i][1] * h];
    const L = (i, yy) => [pts[i].x - off[i][0] * h, yy, pts[i].z - off[i][1] * h];
    strip((i) => [[...R(i, y), 0, 1, 0], [...L(i, y), 0, 1, 0]], false);
    strip((i) => [[...R(i, y), off[i][0], 0, off[i][1]], [...R(i, y - depth), off[i][0], 0, off[i][1]]], true);
    strip((i) => [[...L(i, y), -off[i][0], 0, -off[i][1]], [...L(i, y - depth), -off[i][0], 0, -off[i][1]]], false);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const m = new T.Mesh(g, laneM); m.receiveShadow = true;
    return m;
  }
  const RING_N = 240;
  lanesG.add(band(Array.from({ length: RING_N }, (_, k) => ringAt(k / RING_N * Math.PI * 2)), true, LANES.y, 0.025));
  lanesG.add(band(Array.from({ length: 120 }, (_, k) => plazaAt(k / 120 * Math.PI * 2)), true, LANES.y + 0.002, 0.025));

  const nodes = {}, graph = {};
  function addNode(name, p) { nodes[name] = p; graph[name] = []; }
  const plen = (list) => { let s = 0; for (let i = 1; i < list.length; i++) s += list[i].distanceTo(list[i - 1]); return s; };
  function link(a, b, mid) {
    const fwd = mid.concat([nodes[b]]), back = mid.slice().reverse().concat([nodes[a]]);
    const len = plen([nodes[a]].concat(fwd));
    graph[a].push({ to: b, pts: fwd, len }); graph[b].push({ to: a, pts: back, len });
  }
  const STEP = 0.1;
  const arc = (f, t0, t1) => { const n = Math.max(1, Math.ceil(Math.abs(t1 - t0) / STEP)), out = []; for (let k = 1; k < n; k++) out.push(f(t0 + (t1 - t0) * k / n)); return out; };
  const NO = LAYOUT.ORDER.length;
  LAYOUT.ORDER.forEach((id) => {
    const rp = ringAt(districtAngle(id));
    addNode('ring:' + id, rp);
    addNode('spoke:' + id, rp.clone().normalize().multiplyScalar(LANES.plazaR));
    // the spoke's band, tucked under the ring and plaza bands at its ends
    lanesG.add(band([rp.clone(), nodes['spoke:' + id].clone()], false, LANES.y - 0.002, 0.025));
  });
  LAYOUT.ORDER.forEach((id, i) => {
    const t0 = districtAngle(id);
    link('ring:' + id, 'ring:' + LAYOUT.ORDER[(i + 1) % NO], arc(ringAt, t0, t0 + 2 * Math.PI / NO));
    link('ring:' + id, 'spoke:' + id, []);
  });
  addNode('post', plazaAt(LANES.postAngle));
  const onPlaza = LAYOUT.ORDER.map((id) => ({ name: 'spoke:' + id, ph: Math.atan2(nodes['spoke:' + id].x, nodes['spoke:' + id].z) }))
    .concat([{ name: 'post', ph: LANES.postAngle }]).sort((p, q) => p.ph - q.ph);
  onPlaza.forEach((o, i) => {
    const nx = onPlaza[(i + 1) % onPlaza.length];
    let p1 = nx.ph; if (p1 <= o.ph) p1 += Math.PI * 2;
    link(o.name, nx.name, arc(plazaAt, o.ph, p1));
  });
  Object.keys(HOMES.DISTRICT_OF).forEach((being) => {
    const id = HOMES.DISTRICT_OF[being], slot = (HOMES.SLOTS[id] && HOMES.SLOTS[id][being]) || [0, 0], c = districtPosition(T, id);
    addNode('home:' + being, V(c.x + slot[0], 0, c.z + slot[1]));
    link('home:' + being, 'ring:' + id, []);
  });
  // the shortest way along the lanes; a home is only ever an end
  function route(a, b) {
    if (!nodes[a] || !nodes[b]) return null;
    if (a === b) return [nodes[a].clone()];
    const dist = {}, prev = {}, done = new Set();
    Object.keys(nodes).forEach((k) => { dist[k] = Infinity; });
    dist[a] = 0;
    for (;;) {
      let u = null;
      Object.keys(dist).forEach((k) => { if (!done.has(k) && dist[k] < Infinity && (u === null || dist[k] < dist[u])) u = k; });
      if (u === null || u === b) break;
      done.add(u);
      graph[u].forEach((e) => { const nd = dist[u] + e.len; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { from: u, e }; } });
    }
    if (dist[b] === Infinity) return null;
    const chain = [];
    for (let k = b; k !== a; k = prev[k].from) chain.unshift(prev[k].e);
    const out = [nodes[a].clone()];
    chain.forEach((e) => e.pts.forEach((p) => out.push(p.clone())));
    return out;
  }

  // ---------------------------------------------------------------
  // THE PLAZA: the ring path round the plinth, two benches (four seats),
  // the post where a delivery is set down, a lit rim on the plinth that
  // pulses once when one lands, and lamps at the four nearest spoke ends.
  // ---------------------------------------------------------------
  const plazaG = new T.Group(); plazaG.name = 'plaza'; group.add(plazaG);
  const plazaAnchors = {}, plazaProps = { lamps: [], benches: [] };
  [-1.837, 1.837].forEach((ph, i) => {
    const c = V(Math.sin(ph) * 1.32, 0, Math.cos(ph) * 1.32), yaw = Math.atan2(-c.x, -c.z);
    const b = parkBench(N.wood, N.stone, 0.5); b.position.copy(c); b.rotation.y = yaw; plazaG.add(b);
    const s = kit.contactShadow(0.3); s.scale.set(1, 0.5, 1); b.add(s);
    plazaProps.benches.push(b);
    const along = V(Math.cos(yaw), 0, -Math.sin(yaw));
    [-1, 1].forEach((sd, k) => {
      plazaAnchors['bench' + (i * 2 + k)] = { pos: c.clone().addScaledVector(along, sd * 0.12).setY(0.164), yaw, sit: true };
    });
  });
  const postP = nodes.post;
  plazaAnchors.post = { pos: postP.clone(), yaw: Math.atan2(-postP.x, -postP.z) };
  const mark = new T.Group(); mark.position.copy(postP); mark.position.y = LANES.y + 0.002; plazaG.add(mark);
  mark.add(M(lathe([[1e-4, 0], [0.1, 0], [0.105, 0.006], [0.096, 0.01], [1e-4, 0.01]], 40), N.stone));
  const mr = M(new T.TorusGeometry(0.066, 0.006, 6, 40), N.brass, 0, 0.01, 0); mr.rotation.x = Math.PI / 2; mark.add(mr);
  plazaProps.post = mark;
  const pulseM = kit.emissiveMat(lighter(TK.hue.cy, 0.25), 2.2, { lamp: true });
  const pulseRing = M(new T.TorusGeometry(0.7, 0.013, 8, 96), pulseM, 0, 0.006, 0);
  pulseRing.rotation.x = Math.PI / 2; pulseRing.castShadow = false; plazaG.add(pulseRing);
  plazaProps.pulseRing = pulseRing;
  const pulse = { start: null, k: 0 };
  function pulseLevel(k) {
    pulse.k = k;
    pulseM.emissiveIntensity = pulseM.userData.baseEm * TK.em * (0.14 + 0.86 * k);
    pulseRing.scale.setScalar(1 + 0.05 * k);
  }
  const plazaLamps = [];
  ['train', 'fuel', 'logistics', 'money'].forEach((id) => {
    const sp = nodes['spoke:' + id], dir = sp.clone().normalize(), tan = V(dir.z, 0, -dir.x);
    const pA = dir.clone().multiplyScalar(LANES.plazaR + 0.17).addScaledVector(tan, 0.17);
    const pB = dir.clone().multiplyScalar(LANES.plazaR + 0.17).addScaledVector(tan, -0.17);
    const p = Math.abs(pA.x) > Math.abs(pB.x) ? pA : pB;
    const lg = new T.Group(); lg.position.copy(p); plazaG.add(lg);
    lg.add(M(lathe([[1e-4, 0], [0.045, 0], [0.048, 0.01], [0.026, 0.022], [0.013, 0.045], [0.01, 0.4], [0.016, 0.425], [1e-4, 0.43]], 20), N.steel));
    const L = lampMat(lighter(TK.gold, 0.2), 2.0, { night: true, part: 'day' });
    lg.add(M(sq(0.034, 0.04, 0.034, 2), L.m, 0, 0.47, 0));
    lg.add(M(lathe([[1e-4, 0.525], [0.03, 0.52], [0.046, 0.506], [0.044, 0.498], [0.02, 0.504], [1e-4, 0.506]], 24), N.steel));
    glow(L, lg, TK.gold, 0.18, 0.5, 0, 0.47, 0);
    const s = kit.contactShadow(0.08); lg.add(s);
    plazaLamps.push(L); plazaProps.lamps.push(L.m);
  });

  // ---------------------------------------------------------------
  // THE PUBLIC FACE
  // ---------------------------------------------------------------
  function setDaypart(part) {
    daypart = part;
    Object.keys(districts).forEach((id) => districts[id].setDaypart(part));
    plazaLamps.forEach((L) => { L.part = part; retarget(L); });
  }
  function tick(now, dt) {
    let live = false;
    for (let i = 0; i < lamps.length; i++) {
      const L = lamps[i];
      if (L.p < 1) {
        // zero elapsed time is no movement (a frozen clock never snaps)
        if (dt > 0) { L.p = Math.min(1, L.p + dt / FADE_S); L.level = L.from + (L.to - L.from) * ss(L.p); paint(L); }
        if (L.p < 1) live = true;
      }
    }
    if (pulse.start != null) {
      const p = (now - pulse.start) / PULSE_S;
      if (p >= 1) { pulse.start = null; pulseLevel(0); } else {
        if (p >= 0) pulseLevel(p < 0.2 ? ss(p / 0.2) : 1 - ss((p - 0.2) / 0.8));
        live = true;
      }
    }
    return live;
  }
  function settle() {
    lamps.forEach((L) => retarget(L, true));
    pulse.start = null; pulseLevel(0);
  }
  function retone() { lamps.forEach(paint); pulseLevel(pulse.k); }
  function dispose() {
    group.traverse((o) => {
      if (o.geometry && !o.isSprite && !SHARED.has(o.geometry)) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });
    extraGeos.forEach((g) => g.dispose());
    // the kit keeps its own list of emissives for retoning; take ours out
    const mine = new Set(lamps.map((L) => L.m).concat([pulseM]));
    for (let i = kit.EMISSIVES.length - 1; i >= 0; i--) if (mine.has(kit.EMISSIVES[i])) kit.EMISSIVES.splice(i, 1);
    if (group.parent) group.parent.remove(group);
  }

  setDaypart('day');
  settle();
  group.updateMatrixWorld(true);

  return {
    group,
    districts,
    plaza: { group: plazaG, anchors: plazaAnchors, props: plazaProps, pulse(nowSec) { pulse.start = nowSec; return true; } },
    lanes: { group: lanesG, nodes, route },
    setDaypart, tick, settle, retone, dispose,
    daypart: () => daypart,
  };
}
