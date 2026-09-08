// HOW EACH LIFT ACTUALLY MOVES — joint angles, not CSS transforms.
//
// The old data (`exerciseMotion.js`) described movement as 2D transform
// strings for the flat figure: a squat was `scaleY(0.86)` on the legs, so the
// 3D figure SHRANK its legs instead of flexing hips and knees. Hayden's
// verdict, 8 Sep 2026: "most of the exercises... completely wrong with how the
// movement is actually meant to be carried out". He was right.
//
// This file states each pattern the way a biomechanist would: the angle every
// joint passes through, in degrees, from the start of the rep to the end.
// Ranges are the ones a competent lifter actually uses — squat depth is hip
// crease below knee (~100° hip, ~120° knee), a strict curl is ~145° of elbow
// flexion, a bench press touches at ~75° of shoulder horizontal adduction.
// They are stated once, per PATTERN, because 135 lifts share about twenty
// shapes; a per-exercise override exists for the lifts whose shape genuinely
// differs (incline vs flat, sumo vs conventional).
//
// Sign convention, in the model's own frame:
//   flexion of a limb that swings FORWARD is positive about X
//   abduction away from the midline is positive about Z (mirrored per side)
//   rotation about the limb's own long axis is Y
// The renderer maps these to bone-local rotations once, in one place.

export const JOINTS = ['spine', 'chest', 'neck', 'shoulder', 'elbow', 'hip', 'knee', 'ankle'];

// Every pattern: the pose at the START of the rep and at the END (the working
// position). The renderer eases between them, so one entry is a whole rep.
export const PATTERNS = {
  squat: {
    label: 'Squat — hip and knee flexion under load',
    equipment: 'barbell-back',
    cue: 'Hip crease below the knee, bar over midfoot, chest up.',
    start: { hip: 0, knee: 0, ankle: 0, spine: 5, shoulder: 15, elbow: 95 },
    end: { hip: -100, knee: 120, ankle: 25, spine: 22, shoulder: 15, elbow: 95 },
  },
  'front-squat': {
    label: 'Front squat — the same descent, a more upright torso',
    equipment: 'barbell-front',
    cue: 'Elbows high, torso vertical, the bar rides the front delts.',
    start: { hip: 0, knee: 0, ankle: 0, spine: 2, shoulder: 85, elbow: 130 },
    end: { hip: -105, knee: 125, ankle: 28, spine: 10, shoulder: 85, elbow: 130 },
  },
  hinge: {
    label: 'Hip hinge — the hips travel back, the spine holds',
    equipment: 'barbell-hands',
    cue: 'Push the hips back, soft knees, bar against the legs.',
    start: { hip: 0, knee: 5, ankle: 0, spine: 3, shoulder: 0, elbow: 5 },
    end: { hip: -95, knee: 20, ankle: 5, spine: 8, shoulder: 0, elbow: 5 },
  },
  deadlift: {
    label: 'Deadlift — hips and knees extend together from the floor',
    equipment: 'barbell-floor',
    cue: 'Hips set, lats tight, the bar leaves the floor over midfoot.',
    start: { hip: -105, knee: 70, ankle: 20, spine: 12, shoulder: -10, elbow: 3 },
    end: { hip: 0, knee: 0, ankle: 0, spine: 2, shoulder: 0, elbow: 3 },
  },
  'press-horizontal': {
    label: 'Horizontal press — the elbow drives the load away from the chest',
    stance: 'supine',
    equipment: 'bench-flat',
    lying: true,
    cue: 'Shoulder blades set, bar to the sternum, elbows ~60° from the torso.',
    start: { shoulder: 0, elbow: 0, shoulderAbduct: 60, hip: -85, knee: 85 },
    end: { shoulder: 0, elbow: 95, shoulderAbduct: 60, hip: -85, knee: 85 },
  },
  'press-incline': {
    label: 'Incline press — the same press on a 30° bench',
    stance: 'incline30',
    equipment: 'bench-incline',
    lying: true,
    cue: 'Bench at 30°, bar to the upper chest just below the collarbone.',
    start: { shoulder: 25, elbow: 0, shoulderAbduct: 55, hip: -70, knee: 85 },
    end: { shoulder: 25, elbow: 95, shoulderAbduct: 55, hip: -70, knee: 85 },
  },
  'press-overhead': {
    label: 'Overhead press — shoulder flexion to lockout',
    equipment: 'barbell-hands',
    cue: 'Bar from the front delts to over the midfoot; head moves back, then through.',
    start: { shoulder: 10, elbow: 130, spine: 4 },
    end: { shoulder: 170, elbow: 5, spine: 0 },
  },
  pulldown: {
    label: 'Vertical pull — the elbow drives down and back',
    equipment: 'cable-high',
    cue: 'Chest up, drive the elbows to the ribs, no swing.',
    start: { shoulder: 155, elbow: 10, spine: 4 },
    end: { shoulder: 35, elbow: 105, spine: 10 },
  },
  'pull-up': {
    label: 'Pull-up — the body rises to the bar',
    stance: 'hanging',
    equipment: 'pullup-bar',
    hanging: true,
    cue: 'Full hang to chin over the bar, ribs down.',
    start: { shoulder: 170, elbow: 5, hip: 0, knee: 20 },
    end: { shoulder: 55, elbow: 125, hip: 0, knee: 20 },
  },
  row: {
    label: 'Horizontal pull — the elbow drives past the ribs',
    equipment: 'cable-mid',
    cue: 'Torso still, pull to the navel, shoulder blades finish the rep.',
    start: { shoulder: 45, elbow: 15, spine: 6 },
    end: { shoulder: -25, elbow: 115, spine: 3 },
  },
  'row-bent': {
    label: 'Bent-over row — hinged, the pull is to the lower ribs',
    equipment: 'barbell-hands',
    cue: 'Hinged ~60°, back flat, the bar comes to the navel.',
    start: { hip: -70, knee: 20, spine: 6, shoulder: 60, elbow: 10 },
    end: { hip: -70, knee: 20, spine: 6, shoulder: 10, elbow: 110 },
  },
  curl: {
    label: 'Elbow flexion',
    equipment: 'dumbbells',
    cue: 'Elbows pinned to the ribs; the forearm is the only thing that moves.',
    start: { elbow: 5, shoulder: 0 },
    end: { elbow: 145, shoulder: 8 },
  },
  pushdown: {
    label: 'Elbow extension',
    equipment: 'cable-high',
    cue: 'Upper arm still, elbows locked to the sides.',
    start: { elbow: 100, shoulder: -5 },
    end: { elbow: 5, shoulder: -5 },
  },
  'overhead-extension': {
    label: 'Overhead elbow extension',
    equipment: 'dumbbell-single',
    cue: 'Upper arms vertical beside the ears, only the elbow moves.',
    start: { shoulder: 165, elbow: 130 },
    end: { shoulder: 165, elbow: 10 },
  },
  fly: {
    label: 'Shoulder horizontal adduction',
    stance: 'supine',
    equipment: 'dumbbells',
    lying: true,
    cue: 'A soft, fixed elbow angle; the arc is at the shoulder.',
    start: { shoulderAbduct: 90, elbow: 20, shoulder: 0, hip: -85, knee: 85 },
    end: { shoulderAbduct: 15, elbow: 20, shoulder: 0, hip: -85, knee: 85 },
  },
  'raise-lateral': {
    label: 'Shoulder abduction',
    equipment: 'dumbbells',
    cue: 'Lead with the elbow to shoulder height; no shrug at the top.',
    start: { shoulderAbduct: 8, elbow: 12 },
    end: { shoulderAbduct: 88, elbow: 12 },
  },
  'raise-front': {
    label: 'Shoulder flexion',
    equipment: 'dumbbells',
    cue: 'Straight arm to eye level, ribs down.',
    start: { shoulder: 5, elbow: 8 },
    end: { shoulder: 95, elbow: 8 },
  },
  shrug: {
    label: 'Scapular elevation',
    equipment: 'dumbbells',
    cue: 'Straight up, no roll; the arms are hooks.',
    start: { shoulderShrug: 0, elbow: 5 },
    end: { shoulderShrug: 1, elbow: 5 },
  },
  'leg-curl': {
    label: 'Knee flexion',
    stance: 'prone',
    equipment: 'machine-legcurl',
    prone: true,
    cue: 'Hips down, heels to the glutes.',
    start: { knee: 5, hip: 0 },
    end: { knee: 110, hip: 0 },
  },
  'leg-extension': {
    label: 'Knee extension',
    stance: 'seated',
    equipment: 'machine-legext',
    seated: true,
    cue: 'Sit tall, extend to straight without slamming the joint.',
    start: { knee: 95, hip: -85 },
    end: { knee: 5, hip: -85 },
  },
  'leg-press': {
    label: 'Leg press — hip and knee flexion on a sled',
    stance: 'seated-back',
    equipment: 'machine-legpress',
    seated: true,
    cue: 'Knees track the toes; stop before the lower back rounds.',
    start: { knee: 20, hip: -75 },
    end: { knee: 100, hip: -115 },
  },
  lunge: {
    label: 'Split squat — one leg forward, one behind',
    equipment: 'dumbbells',
    split: true,
    cue: 'Front shin vertical, back knee under the hip.',
    start: { hip: 0, knee: 5, hipBack: 0, kneeBack: 5, spine: 4 },
    end: { hip: -85, knee: 95, hipBack: 15, kneeBack: 105, spine: 6 },
  },
  'hip-thrust': {
    label: 'Hip extension against a bench',
    stance: 'thrust',
    equipment: 'bench-thrust',
    cue: 'Ribs down, chin tucked, finish with the glutes not the back.',
    start: { hip: -70, knee: 90, spine: 2 },
    end: { hip: 5, knee: 90, spine: 2 },
  },
  'calf-raise': {
    label: 'Ankle plantarflexion',
    equipment: 'none',
    cue: 'Full stretch at the bottom, pause at the top.',
    start: { ankle: -18 },
    end: { ankle: 30 },
  },
  crunch: {
    label: 'Spinal flexion',
    stance: 'supine',
    equipment: 'none',
    lying: true,
    cue: 'Ribs toward the hips; the neck does not lead.',
    start: { spine: 0, chest: 0, hip: -85, knee: 85 },
    end: { spine: 28, chest: 18, hip: -85, knee: 85 },
  },
  'hanging-knee-raise': {
    label: 'Hip flexion from a hang',
    stance: 'hanging',
    equipment: 'pullup-bar',
    hanging: true,
    cue: 'Curl the pelvis; do not just swing the legs.',
    start: { hip: 0, knee: 15, shoulder: 170, elbow: 5, spine: 0 },
    end: { hip: -95, knee: 90, shoulder: 170, elbow: 5, spine: 15 },
  },
};

// Which pattern a lift uses. FIRST match wins, so the specific rules come
// before the general — "incline bench press" must be tested before "press".
const RULES = [
  [/\bfront squat\b/i, 'front-squat'],
  [/\bhack squat\b|\bleg press\b/i, 'leg-press'],
  [/\bsplit squat\b|\blunge\b|\bstep[- ]?up\b/i, 'lunge'],
  [/\bsquat\b/i, 'squat'],
  [/\bhip thrust\b|\bglute bridge\b/i, 'hip-thrust'],
  [/\bromanian\b|\brdl\b|\bstiff[- ]?leg|\bgood morning\b|\bhyperextension\b/i, 'hinge'],
  [/\bdeadlift\b/i, 'deadlift'],
  [/\bleg curl\b|\bhamstring curl\b/i, 'leg-curl'],
  [/\bleg extension\b/i, 'leg-extension'],
  [/\bcalf\b|\bcalve\b/i, 'calf-raise'],
  [/\bpull[- ]?up\b|\bchin[- ]?up\b/i, 'pull-up'],
  [/\bknee raise\b|\bleg raise\b|\bhanging\b/i, 'hanging-knee-raise'],
  [/\bpulldown\b|\bpull[- ]?down\b/i, 'pulldown'],
  [/\bbent[- ]?over row\b|\bbarbell row\b|\bpendlay\b/i, 'row-bent'],
  [/\brow\b/i, 'row'],
  [/\bincline\b[^\n]*\b(press|bench)\b|\bbench\b[^\n]*\bincline\b/i, 'press-incline'],
  [/\b(bench|chest) press\b|\bfloor press\b|\bpush[- ]?up\b|\bdip\b/i, 'press-horizontal'],
  [/\boverhead press\b|\bshoulder press\b|\bmilitary\b|\bpush press\b|\barnold\b/i, 'press-overhead'],
  [/\bfly\b|\bflye\b|\bpec dec\b|\bcross[- ]?over\b/i, 'fly'],
  [/\blateral raise\b|\bside raise\b|\blat raise\b/i, 'raise-lateral'],
  [/\bfront raise\b/i, 'raise-front'],
  [/\bshrug\b/i, 'shrug'],
  [/\bskull ?crusher\b|\boverhead (tricep|extension)|\btricep extension\b/i, 'overhead-extension'],
  [/\bpushdown\b|\bpress[- ]?down\b|\bkickback\b/i, 'pushdown'],
  [/\bcurl\b/i, 'curl'],
  [/\bcrunch\b|\bsit[- ]?up\b|\bab wheel\b|\bplank\b/i, 'crunch'],
];

export function patternFor(name = '') {
  const n = String(name || '');
  for (const [re, id] of RULES) if (re.test(n)) return id;
  return null;
}

// Equipment a pattern implies, unless the exercise's own name says otherwise —
// "dumbbell bench press" is a horizontal press holding dumbbells, and showing
// a barbell there would be teaching the wrong thing.
export function equipmentFor(name = '', pattern = null) {
  const n = String(name || '').toLowerCase();
  const base = pattern && PATTERNS[pattern] ? PATTERNS[pattern].equipment : 'none';
  if (/\bdumbbell\b|\bdb\b/.test(n)) {
    if (base.startsWith('bench')) return base === 'bench-incline' ? 'bench-incline-db' : 'bench-flat-db';
    if (base.startsWith('barbell')) return 'dumbbells';
    return base === 'none' ? 'dumbbells' : base;
  }
  if (/\bcable\b/.test(n) && base.startsWith('barbell')) return 'cable-mid';
  if (/\bmachine\b|\bsmith\b/.test(n) && base.startsWith('barbell')) return base;
  if (/\bbodyweight\b|\bpush[- ]?up\b/.test(n)) return 'none';
  return base;
}

// The pose at a point in the rep. `phase` 0 → 1 → 0 over a cycle; the ease
// makes the top and bottom of the rep linger the way a controlled rep does.
export function poseAt(pattern, phase) {
  const p = PATTERNS[pattern];
  if (!p) return null;
  const t = 0.5 - 0.5 * Math.cos(Math.PI * 2 * phase);   // 0→1→0, smooth at both ends
  const eased = t * t * (3 - 2 * t);
  const out = {};
  const keys = new Set([...Object.keys(p.start), ...Object.keys(p.end)]);
  for (const k of keys) {
    const a = p.start[k] ?? 0;
    const b = p.end[k] ?? 0;
    out[k] = a + (b - a) * eased;
  }
  return out;
}
