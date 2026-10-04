// THE GRAIN BODY (5 Oct 2026; mockup 69, his pick "B, the heart stays", in
// Living jade). What NovaCore draws while a turn runs.
//
// At rest none of this runs, and the core is the one he already knows. When
// a turn begins the engine fades its rings out over 450 ms (by `ringsA`,
// below) while the heart keeps breathing, and a body of grains forms here:
// seeded on the rings, so the rings seem to shed their grains, then moving
// between forms, each grain easing from the form it leaves to the next with
// a stagger that rises from below.
//   listening  a loose sphere; ripples of light rise through it with his
//              voice (violet)
//   thinking   strata (220 ms), then a slowly turning trefoil ribbon of five
//              strands the grains flow along (cyan)
//   speaking   strata, then a shell in Living jade: a band of light climbs
//              it at each syllable onset, its underside swells with the
//              level, two rings of grains orbit it, it draws a small breath
//              as it forms and after each pause, and a slow band sweeps down
//   contest    a sentence that pushes back: the shell turns red and tightens
// Back at rest the grains return to the rings while the rings fade back in
// (1.1 s), and the layer stops drawing.
//
// The cost, held to the hologram's own (4 Oct): every grain is one fillRect,
// in one of two fill styles a frame (the body, the lit rim), under its own
// globalAlpha. Nothing is allocated per grain per frame: the grains live in
// typed arrays, their own angles are worked out once (the first time a core
// takes a turn, so a core that never does pays nothing), and every form's
// time terms once a frame.

const TAU = 6.2832; // the mockup's 2π, kept so every phase lands where it did

// The turn, by priority when more than one is set: listening, then speaking
// (pushing back is a way of speaking), then thinking.
export const REST = 0;
export const LISTEN = 1;
export const THINK = 2;
export const SPEAK = 3;
export const turnOf = (st) => (st.listening ? LISTEN : st.speaking ? SPEAK : st.thinking ? THINK : REST);

const F_REST = 0;
const F_LISTEN = 1;
const F_STRATA = 2;
const F_KNOT = 3;
const F_MEMBRANE = 4;
const F_SNAP = 5; // no form: where each grain was when a turn changed mid-flight

const DL_MAX = 110; // the stagger: the top grain sets off this long after the bottom one
// the still frame's moment (ms on the forms' clock): a flattering angle, as
// the engines' own still frames are; here the knot is turned near face-on
const STILL_T = 6400;
// each turn's forms, as [form, begins (ms into the turn), takes (ms)]. The
// strata take 220 ms and the knot or shell begins once the last grain has
// arrived in them (220 + the stagger), so the strata are whole for a moment
// and every grain leaves them from where it is. (The mockup began the knot
// at 220 ms and jumped its late grains the rest of the way in one frame.)
const STEPS = [
  [[F_REST, 0, 1100]],
  [[F_LISTEN, 0, 700]],
  [[F_STRATA, 0, 220], [F_KNOT, 220 + DL_MAX, 600]],
  [[F_STRATA, 0, 220], [F_MEMBRANE, 220 + DL_MAX, 450]],
];

// Colours. The grains leave the rings in the rest blue and take the state's
// colour on the way; Living jade is three parts, a body, a lit rim and a
// glow (inside the shell, and the heart's tint).
const C_REST = [120, 190, 255];
const C_LISTEN = [176, 160, 255];
const C_THINK = [89, 230, 255];
const C_JADE = [80, 228, 168];
const C_JADE_RIM = [150, 250, 240];
const C_JADE_GLOW = [30, 200, 140];
const C_CONTEST = [255, 84, 96];
const C_WHITE = [255, 255, 255];
const STATE_C = [C_REST, C_LISTEN, C_THINK, C_JADE];

// The budget, by canvas size: the grain count
export const grainCount = (size) => (size >= 260 ? 1400 : size > 72 ? 560 : size > 40 ? 240 : 160);
// The body's unit radius, as a share of the canvas. The mockup drew on a
// stage wider than the core; here the canvas is the frame, so every form,
// the shell's orbit rings included, is sized to stay inside it.
const UNIT = 0.43;
const ORBIT_R = 1.12;
// Each grain's side in CSS px (times its own 0.75 to 1.5), by the body's
// radius `u` in px: the mockup's own sizes (0.9 at Home's 36 px core, 1 at
// the tab bar's 58, 1.25 for a body of 90 to 112 px on his phone), and above
// that in proportion, so the full-screen core is as dense as the one he saw.
const grainSide = (u) => (u >= 112 ? (1.25 * u) / 112 : u >= 90 ? 1.25 : u >= 25 ? 1 + (0.25 * (u - 25)) / 65 : u > 15.5 ? 0.9 + (0.1 * (u - 15.5)) / 9.5 : 0.9);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const eo = (x) => 1 - (1 - x) * (1 - x) * (1 - x);
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (2 - 2 * x) * (2 - 2 * x) * (2 - 2 * x) / 2);
const seeded = (seed) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

// a value that eases (cubic in-out) toward its target, re-aimed from
// wherever it is whenever the target changes, so nothing ever jumps
const tween = (v) => ({ a: v, b: v, at: 0, d: 1 });
const tv = (w, T) => {
  const p = (T - w.at) / w.d;
  return p >= 1 ? w.b : p <= 0 ? w.a : w.a + (w.b - w.a) * eio(p);
};
function aim(w, T, b, d, delay = 0) {
  if (b === w.b) return;
  w.a = tv(w, T);
  w.b = b;
  w.at = T + delay;
  w.d = d;
}
function pin(w, v) {
  w.a = v;
  w.b = v;
}
const mix3 = (o, a, b, k) => {
  o[0] = a[0] + (b[0] - a[0]) * k;
  o[1] = a[1] + (b[1] - a[1]) * k;
  o[2] = a[2] + (b[2] - a[2]) * k;
};
const keyOf = (c) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);

// the listening ripple's direction (it rises from below), and the fixed tilts
const DIR = (() => {
  const l = Math.hypot(0.45, -0.8, 0.35);
  return [0.45 / l, -0.8 / l, 0.35 / l];
})();
const LP_C = Math.cos(0.32), LP_S = Math.sin(0.32); // the sphere's pitch
const MP_C = Math.cos(0.22), MP_S = Math.sin(0.22); // the shell's pitch
// the shell's two orbit rings, each tilted about x then y: [cos, sin, cos, sin]
const ORB1 = [Math.cos(1.15), Math.sin(1.15), Math.cos(0.4), Math.sin(0.4)];
const ORB2 = [Math.cos(-0.75), Math.sin(-0.75), Math.cos(1.9), Math.sin(1.9)];

// turn by yaw then pitch, a touch of perspective: [x, y, depth] in o
function proj(o, x, y, z, cy, sy, cp, sp) {
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  const y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
  const k = 1 + z2 * 0.14;
  o[0] = x1 * k;
  o[1] = y1 * k;
  o[2] = z2;
}

// The layer for one core. `rings` is the engine's side of the hand-over:
// `tab` holds, per ring, the in-plane axes A and B (canvas px, after the
// engine's own turn, before its perspective) and the cos and sin of the
// ring's spin, refilled by `fill()` for the frame; `cam` is the engine's
// camera distance in px (0: flat) and `R` its radius, so a grain sits on
// the ring at angle a as cos(a + spin) A + sin(a + spin) B, projected the
// way the engine projects. The engine reads `ringsA` (its rings' alpha),
// `active`, and the heart's `tint`, `tintK` and `heartScale`.
export function makeGrains(ctx, size, rings) {
  const N = grainCount(size);
  const U = size * UNIT;
  const side = grainSide(U);
  // the shell's orbit rings need grains to read as rings: at 72 px and
  // under (13 or fewer a ring) they read as dust at the canvas edge, so
  // there those grains stay in the shell
  const orbits = size > 72;
  const cam = rings.cam || 0;
  const RH = rings.R;

  // the grains: built the first time this core takes a turn
  let built = false;
  let X, Y, Z, RING, ORBIT, CRA, SRA, C11, S11, W1, W2, SY, SR, SX, CA, SA, CU, SU, CW, SW, KW;
  let C2T, S2T, C3P, S3P, C5, S5, C9, S9, DL, AL, SZ;
  // where each grain was last drawn, where a mid-flight change froze it,
  // and this frame's squares (body tone from the front, rim from the back)
  let LX, LY, LZ, LA, LT, FX, FY, FZ, FA, FT, BX, BY, BA, BS;
  function build() {
    const f = () => new Float64Array(N);
    X = f(); Y = f(); Z = f(); CRA = f(); SRA = f(); C11 = f(); S11 = f(); W1 = f(); W2 = f();
    SY = f(); SR = f(); SX = f(); CA = f(); SA = f(); CU = f(); SU = f(); CW = f(); SW = f(); KW = f();
    C2T = f(); S2T = f(); C3P = f(); S3P = f(); C5 = f(); S5 = f(); C9 = f(); S9 = f(); DL = f(); AL = f(); SZ = f();
    RING = new Uint16Array(N);
    ORBIT = new Uint8Array(N);
    LX = f(); LY = f(); LZ = f(); LA = f(); LT = new Uint8Array(N);
    FX = f(); FY = f(); FZ = f(); FA = f(); FT = new Uint8Array(N);
    BX = new Float32Array(N); BY = new Float32Array(N); BA = new Float32Array(N); BS = new Float32Array(N);
    // the mockup's body, grain for grain (seed 11, the same draws in the same order)
    const r = seeded(11);
    const gold = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y0 = 1 - (2 * (i + 0.5)) / N, rad = Math.sqrt(1 - y0 * y0), th0 = gold * i;
      let x = Math.cos(th0) * rad + (r() - 0.5) * 0.07;
      let y = y0 + (r() - 0.5) * 0.07;
      let z = Math.sin(th0) * rad + (r() - 0.5) * 0.07;
      const l = Math.sqrt(x * x + y * y + z * z);
      x /= l; y /= l; z /= l;
      X[i] = x; Y[i] = y; Z[i] = z;
      const ra = r() * 6.283, u = r(), v = r() * 2 - 1, s1 = 0.5 + r() * 2, s2 = r() * 6.28;
      AL[i] = 0.55 + r() * 0.45;
      SZ[i] = 0.75 + r() * 0.75;
      CRA[i] = Math.cos(ra); SRA[i] = Math.sin(ra);
      RING[i] = i % rings.n;
      ORBIT[i] = i % 9 === 0 ? (i % 2 ? 1 : 2) : 0;
      DL[i] = ((1 - y) / 2) * DL_MAX; // the bottom sets off first
      // listening: the ripple's phase along DIR, and the grain's own shimmer
      const d = 11 * (x * DIR[0] + y * DIR[1] + z * DIR[2]);
      C11[i] = Math.cos(d); S11[i] = Math.sin(d);
      W1[i] = 0.0015 * s1; W2[i] = s2;
      // strata: the layer it falls into, sheared alternately left and right
      const k = Math.min(8, Math.floor(((y + 1) / 2) * 9)), ly = -0.74 + (1.48 * k) / 8;
      SY[i] = ly;
      SR[i] = Math.sqrt(Math.max(0.06, 1 - ly * ly)) * 0.92;
      SX[i] = k % 2 ? 0.2 : -0.2;
      const th = Math.atan2(z, x), ph = Math.acos(y > 1 ? 1 : y < -1 ? -1 : y);
      CA[i] = Math.cos(th); SA[i] = Math.sin(th);
      // the knot: where along it, the strand's twist, and which of five strands
      CU[i] = Math.cos(u * TAU); SU[i] = Math.sin(u * TAU);
      CW[i] = Math.cos(u * TAU * 1.2); SW[i] = Math.sin(u * TAU * 1.2);
      KW[i] = 0.15 * (Math.round(v * 2) / 2);
      // the shell's slow undulation and the contest's fine ripple
      C2T[i] = Math.cos(2 * th); S2T[i] = Math.sin(2 * th);
      C3P[i] = Math.cos(3 * ph); S3P[i] = Math.sin(3 * ph);
      C5[i] = Math.cos(5 * th + 2 * ph); S5[i] = Math.sin(5 * th + 2 * ph);
      C9[i] = Math.cos(9 * th); S9[i] = Math.sin(9 * th);
    }
    built = true;
  }

  // the turn and its forms
  let turn = REST, turnAt = -1e12, step = 0;
  let form = F_REST, fromF = F_REST, formAt = -1e12, formD = 1, stag = 0.4, settledAt = -1e12;
  let T = 0, lvl = 0, still = false, plain = false;
  const ringsW = tween(1); // the engine's rings
  const spW = tween(0); // the speaking state: the heart's swell, the jade's weight
  const cwW = tween(0); // pushing back
  const glowW = tween(0); // the light inside the shell
  const cFrom = new Float64Array(C_REST), cNow = new Float64Array(C_REST);
  let cTo = C_REST, cAt = 0, cD = 1;
  const body = new Float64Array(3), rim = new Float64Array(3), glow = new Float64Array(3);
  let bodyKey = -1, bodyStyle = '', rimKey = -1, rimStyle = '';
  let ringsNow = 1, glowNow = 0, contNow = 0;
  // syllables, read from the level's rises
  let lvlPrev = 0, slow = 0, onsetAt = -1e12, quietFrom = -1, quietLen = 0, quietEnd = -1e12, breathAt = -1e12;

  function begin(si) {
    const prevF = form;
    const live = T >= settledAt - 1; // the form it leaves has arrived: ease from it, live
    if (!live) { // caught mid-flight: ease from where each grain is now
      FX.set(LX); FY.set(LY); FZ.set(LZ); FA.set(LA); FT.set(LT);
    }
    const s = STEPS[turn][si];
    step = si;
    form = s[0];
    formAt = turnAt + s[1];
    formD = s[2];
    fromF = live ? prevF : F_SNAP;
    stag = form === F_STRATA || prevF === F_STRATA ? 1 : 0.4;
    settledAt = formAt + formD + DL_MAX * stag;
    if (form === F_MEMBRANE) breathAt = formAt + 230; // the shell draws a breath as it forms
  }

  // this frame's form terms
  let lc, ls, lyC, lyS, lAmp, lA, sc, ss, kc, ks, kwc, kws, kyC, kyS, kpC, kpS;
  let m1c, m1s, m2c, m2s, m3c, m3s, m4c, m4s, myC, myS, o1c, o1s, o2c, o2s;
  let sweep = 0, bandH = 0, bandK = 0, lip = 0, shrink = 1;
  function prep() {
    lc = Math.cos(T * 0.0075); ls = Math.sin(T * 0.0075);
    lyC = Math.cos(T * 0.00018); lyS = Math.sin(T * 0.00018);
    lAmp = 0.05 * (0.25 + lvl * 1.3);
    lA = 0.3 + lvl;
    sc = Math.cos(T * 0.0005); ss = Math.sin(T * 0.0005);
    kc = Math.cos(T * 0.00032); ks = Math.sin(T * 0.00032);
    kwc = Math.cos(T * 0.000784); kws = Math.sin(T * 0.000784); // the twist: 1.2 × the flow, plus its own drift
    kyC = Math.cos(T * 0.00045); kyS = Math.sin(T * 0.00045);
    const kp = 0.5 + 0.15 * Math.sin(T * 0.0003);
    kpC = Math.cos(kp); kpS = Math.sin(kp);
    m1c = Math.cos(T * 0.0013); m1s = Math.sin(T * 0.0013);
    m2c = Math.cos(T * 0.0009); m2s = Math.sin(T * 0.0009);
    m3c = Math.cos(T * 0.003); m3s = Math.sin(T * 0.003);
    m4c = Math.cos(T * 0.006); m4s = Math.sin(T * 0.006);
    myC = Math.cos(T * 0.00012); myS = Math.sin(T * 0.00012);
    o1c = Math.cos(T * 0.0006); o1s = Math.sin(T * 0.0006);
    o2c = Math.cos(T * -0.00048); o2s = Math.sin(T * -0.00048);
    // the shell's cues: the pulse band since the last onset, the lip, the breath
    const age = still ? 1e9 : T - onsetAt;
    bandK = age < 480 ? 1 - age / 480 : 0;
    bandH = 1 - (age / 480) * 2.3; // climbs from the bottom (y = 1) past the top
    lip = still ? 0 : Math.min(1, lvl * 1.3);
    // a quick 7% in-breath (90 ms), then out again (400 ms)
    const sa = T - breathAt;
    const breath = still || sa < 0 || sa >= 490 ? 1 : sa < 90 ? 1 - 0.07 * eo(sa / 90) : 0.93 + 0.07 * eo((sa - 90) / 400);
    shrink = breath * (1 - 0.05 * contNow);
    sweep = -1.15 + ((T * 0.00035) % 1) * 2.4;
  }

  // each form writes [x, y, depth, alpha, tone] in units of the body's radius
  function at(f, i, o) {
    switch (f) {
      case F_REST: { // on the engine's ring, where the engine draws it
        const j = RING[i] * 8, t = rings.tab;
        const c = CRA[i] * t[j + 6] - SRA[i] * t[j + 7], s = SRA[i] * t[j + 6] + CRA[i] * t[j + 7];
        const px = c * t[j] + s * t[j + 3], py = c * t[j + 1] + s * t[j + 4], pz = c * t[j + 2] + s * t[j + 5];
        const k = cam > 0 ? cam / (cam - pz) : 1;
        o[0] = (px * k) / U;
        o[1] = (py * k) / U;
        o[2] = pz / RH;
        const dp = (o[2] + 1) / 2;
        o[3] = 0.55 * (0.3 + 0.7 * Math.pow(dp > 0 ? dp : 0, 1.35));
        o[4] = 0;
        return;
      }
      case F_LISTEN: {
        const rip = S11[i] * lc - C11[i] * ls; // the ripple, travelling along DIR
        const r = 0.8 * (1 + rip * lAmp) + 0.02 * Math.sin(T * W1[i] + W2[i]);
        proj(o, X[i] * r, Y[i] * r, Z[i] * r, lyC, lyS, LP_C, LP_S);
        o[3] = (0.26 + 0.6 * (0.5 + 0.5 * rip) * lA) * (0.5 + 0.25 * (o[2] + 1));
        o[4] = 0;
        return;
      }
      case F_STRATA: {
        const ca = CA[i] * sc - SA[i] * ss, sa = SA[i] * sc + CA[i] * ss;
        o[0] = SR[i] * ca + SX[i];
        o[1] = SY[i] + sa * 0.03;
        o[2] = sa;
        o[3] = 0.5 + 0.15 * (sa + 1);
        o[4] = 0;
        return;
      }
      case F_KNOT: {
        // a trefoil, its tangent worked out exactly, a frame round it, and
        // the grain's strand offset twisting along it
        const cu = CU[i] * kc - SU[i] * ks, su = SU[i] * kc + CU[i] * ks;
        const c2 = cu * cu - su * su, s2 = 2 * su * cu;
        const c3 = cu * (4 * cu * cu - 3), s3 = su * (3 - 4 * su * su);
        const kx = (su + 2 * s2) * 0.3, ky = (cu - 2 * c2) * 0.3 + 0.15, kz = -s3 * 0.3;
        let tx = cu + 4 * c2, ty = 4 * s2 - su, tz = -3 * c3;
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
        tx /= tl; ty /= tl; tz /= tl;
        let nx = ty - tz * 0.35, ny = -tx, nz = tx * 0.35;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
        const ct = CW[i] * kwc - SW[i] * kws, st = SW[i] * kwc + CW[i] * kws;
        const cw = ct * KW[i], sw = st * KW[i] * 0.35;
        proj(o, kx + nx * cw + bx * sw, ky + ny * cw + by * sw, kz + nz * cw + bz * sw, kyC, kyS, kpC, kpS);
        o[3] = 0.45 + 0.25 * (o[2] + 1);
        o[4] = 0;
        return;
      }
      case F_MEMBRANE: {
        const ob = orbits ? ORBIT[i] : 0;
        if (ob) { // two of the hologram's rings keep circling the shell
          const oc = ob === 1 ? o1c : o2c, os = ob === 1 ? o1s : o2s, q = ob === 1 ? ORB1 : ORB2;
          const px = (CRA[i] * oc - SRA[i] * os) * ORBIT_R, py = (SRA[i] * oc + CRA[i] * os) * ORBIT_R;
          const py2 = q[0] * py, pz2 = q[1] * py;
          proj(o, q[2] * px + q[3] * pz2, py2, -q[3] * px + q[2] * pz2, myC, myS, MP_C, MP_S);
          o[3] = 0.42 * (0.45 + 0.275 * (o[2] + 1));
          o[4] = 1;
          return;
        }
        const y = Y[i];
        let r = 0.84 + lvl * 0.075
          + 0.05 * (S2T[i] * m1c + C2T[i] * m1s)
          + 0.04 * (S3P[i] * m2c - C3P[i] * m2s)
          + 0.03 * lvl * (S5[i] * m3c + C5[i] * m3s);
        let band = 0;
        if (bandK > 0) { // the pulse: a band of light climbing the shell
          const dy = y - bandH;
          if (dy > -0.45 && dy < 0.45) {
            band = Math.exp(-(dy * dy) / 0.0169) * bandK;
            r += 0.055 * band;
          }
        }
        if (y > 0.55) { // the lip: the underside swells with the level
          const q = (y - 0.55) / 0.45;
          r += 0.11 * lip * q * q;
        }
        r *= shrink;
        if (contNow > 0) r += 0.012 * contNow * (S9[i] * m4c + C9[i] * m4s);
        proj(o, X[i] * r, y * r, Z[i] * r, myC, myS, MP_C, MP_S);
        const edge = 1 - Math.abs(o[2]);
        let a = (0.24 + 0.66 * edge * edge) * (0.8 + 0.2 * o[2]) + 0.55 * band;
        const ds = o[1] - sweep; // the slow band sweeping down
        if (ds > -0.21 && ds < 0.21) a += 0.3 * Math.exp(-(ds * ds) / 0.0049);
        o[3] = a;
        o[4] = edge > 0.66 || band > 0.3 ? 1 : 0;
        return;
      }
      default:
        o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = 0;
    }
  }

  const O = new Float64Array(5), Q = new Float64Array(5);

  const layer = {
    ringsA: 1,
    active: false,
    heartScale: 1,
    tint: glow,
    tintK: 0,
    // once a frame, before the engine draws: the turn, its tweens, colours
    update(t, st, level, isStill) {
      T = isStill ? STILL_T : t * 1000;
      const want = turnOf(st);
      if (!built) {
        if (want === REST) return; // never taken a turn: nothing to do
        build();
      }
      // settled at rest: everything already reads rest, so skip the work
      if (want === REST && turn === REST && !layer.active && !isStill) return;
      plain = !!st.formOnly;
      still = !!isStill;
      lvl = still ? 0 : level;
      const contest = want === SPEAK && !!st.contest;
      if (still) { // one frame of the state's final form, in its colour
        turn = want;
        step = STEPS[want].length - 1;
        form = STEPS[want][step][0];
        fromF = form;
        formAt = settledAt = -1e12;
        formD = 1;
        pin(ringsW, want === REST ? 1 : 0);
        pin(spW, want === SPEAK ? 1 : 0);
        pin(cwW, contest ? 1 : 0);
        pin(glowW, form === F_MEMBRANE ? 1 : 0);
        cTo = plain ? C_REST : STATE_C[want];
        cFrom.set(cTo);
        cAt = -1e12;
      } else {
        const home = want === REST;
        aim(ringsW, T, home ? 1 : 0, home ? 700 : 450, home ? 300 : 0);
        aim(spW, T, want === SPEAK ? 1 : 0, home ? 900 : 420);
        aim(cwW, T, contest ? 1 : 0, contest ? 300 : 400);
        const ct = plain ? C_REST : STATE_C[want];
        if (ct !== cTo) {
          cFrom.set(cNow);
          cTo = ct;
          cAt = T;
          cD = home ? 900 : 420;
        }
        if (want !== turn) {
          turn = want;
          turnAt = T;
          step = -1;
        }
        const steps = STEPS[turn];
        let si = 0;
        for (let k = 1; k < steps.length; k++) if (T >= turnAt + steps[k][1]) si = k;
        if (si !== step) begin(si);
        aim(glowW, T, form === F_MEMBRANE ? 1 : 0, form === F_MEMBRANE ? 450 : 300);
        // syllable onsets: the level jumping clear of its own recent past
        // (an onset after a quiet spell starts a new phrase: a breath)
        if (level < 0.12) {
          if (quietFrom < 0) quietFrom = T;
        } else if (quietFrom >= 0) {
          quietLen = T - quietFrom;
          quietEnd = T;
          quietFrom = -1;
        }
        if (level > 0.08 && level > slow * 1.2 + 0.03 && level - lvlPrev > 0.015 && T - onsetAt > 140) {
          onsetAt = T;
          if (quietLen > 180 && T - quietEnd < 300 && T - breathAt > 700) breathAt = T;
          quietLen = 0;
        }
        slow += (level - slow) * 0.13;
        lvlPrev = level;
      }
      // the frame's values
      ringsNow = tv(ringsW, T);
      const sp = tv(spW, T);
      contNow = tv(cwW, T);
      glowNow = tv(glowW, T);
      const cp = clamp01((T - cAt) / cD);
      mix3(cNow, cFrom, cTo, cp >= 1 ? 1 : eio(cp));
      const sw = plain ? 0 : sp * (1 - contNow); // the jade's weight
      mix3(body, cNow, C_CONTEST, plain ? 0 : contNow);
      mix3(rim, body, C_WHITE, 0.5);
      if (sw > 0) mix3(rim, rim, C_JADE_RIM, sw);
      mix3(glow, body, C_JADE_GLOW, sw);
      const bk = keyOf(body);
      if (bk !== bodyKey) { bodyKey = bk; bodyStyle = `rgb(${bk >> 16},${(bk >> 8) & 255},${bk & 255})`; }
      const rk = keyOf(rim);
      if (rk !== rimKey) { rimKey = rk; rimStyle = `rgb(${rk >> 16},${(rk >> 8) & 255},${rk & 255})`; }
      layer.ringsA = ringsNow;
      layer.heartScale = 1 + 0.12 * sp;
      layer.tintK = plain ? 0 : (0.45 + 0.4 * sw) * (1 - ringsNow);
      layer.active = still ? want !== REST : !(turn === REST && T >= settledAt && ringsNow >= 1);
    },
    // the light inside the shell, then the grains; the engine draws its
    // rings before this and the heart after, all in 'lighter'
    draw(cx, cy) {
      if (!layer.active) return;
      if (glowNow > 0.004) {
        const a = (0.12 + 0.28 * lvl) * glowNow;
        const r = Math.round(glow[0]), g = Math.round(glow[1]), b = Math.round(glow[2]);
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.86);
        gr.addColorStop(0, `rgba(${r},${g},${b},${a.toFixed(3)})`);
        gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(cx, cy, U * 0.86, 0, 6.29);
        ctx.fill();
      }
      prep();
      if (form === F_REST || fromF === F_REST) rings.fill();
      const ga = 1 - ringsNow; // the grains appear as the rings go
      const settled = still || T >= settledAt;
      const tf = form, ff = fromF, t0 = formAt, d = formD, sg = stag;
      let n0 = 0, n1 = N;
      for (let i = 0; i < N; i++) {
        let x, y, z, a, tone;
        const pr = settled ? 1 : (T - t0 - DL[i] * sg) / d;
        if (pr >= 1) {
          at(tf, i, O);
          x = O[0]; y = O[1]; z = O[2]; a = O[3]; tone = O[4];
        } else {
          if (ff === F_SNAP) {
            Q[0] = FX[i]; Q[1] = FY[i]; Q[2] = FZ[i]; Q[3] = FA[i]; Q[4] = FT[i];
          } else at(ff, i, Q);
          if (pr <= 0) {
            x = Q[0]; y = Q[1]; z = Q[2]; a = Q[3]; tone = Q[4];
          } else {
            at(tf, i, O);
            const k = eio(pr);
            x = Q[0] + (O[0] - Q[0]) * k;
            y = Q[1] + (O[1] - Q[1]) * k;
            z = Q[2] + (O[2] - Q[2]) * k;
            a = Q[3] + (O[3] - Q[3]) * k;
            tone = k > 0.5 ? O[4] : Q[4];
          }
        }
        LX[i] = x; LY[i] = y; LZ[i] = z; LA[i] = a; LT[i] = tone;
        let al = a * AL[i] * ga;
        if (al < 0.02) continue;
        if (al > 1) al = 1;
        const s = side * SZ[i] * (1 + z * 0.15);
        const px = cx + x * U - s / 2, py = cy + y * U - s / 2;
        if (tone) {
          n1--;
          BX[n1] = px; BY[n1] = py; BA[n1] = al; BS[n1] = s;
        } else {
          BX[n0] = px; BY[n0] = py; BA[n0] = al; BS[n0] = s;
          n0++;
        }
      }
      if (n0 > 0) {
        ctx.fillStyle = bodyStyle;
        for (let i = 0; i < n0; i++) {
          ctx.globalAlpha = BA[i];
          ctx.fillRect(BX[i], BY[i], BS[i], BS[i]);
        }
      }
      if (n1 < N) {
        ctx.fillStyle = rimStyle;
        for (let i = n1; i < N; i++) {
          ctx.globalAlpha = BA[i];
          ctx.fillRect(BX[i], BY[i], BS[i], BS[i]);
        }
      }
      ctx.globalAlpha = 1;
    },
  };
  return layer;
}
