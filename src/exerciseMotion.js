// How each lift MOVES — the second half of his Lyfta ask (the first was the
// target-muscle diagram).
//
// Animated per MOVEMENT PATTERN, not per exercise. His library has 135 lifts
// but only about a dozen shapes: everything called a curl bends at the elbow,
// everything called a row drives the elbow back. Animating patterns means a
// new exercise he adds tomorrow already moves, instead of standing still
// until someone hand-animates it — which is the maintenance trap that would
// have made this rot.
//
// Resolved deterministically from the exercise's own name and anatomy. No
// model in the path: a wrong animation is a lie about form, and form is the
// thing he would copy.
//
// `null` is a real answer. A lift we cannot classify shows the static
// diagram rather than a plausible-looking wrong movement.

// Each pattern names, per limb group, the transform at the midpoint of the
// loop. The figure eases out to it and back, so one entry describes the whole
// repetition. Rotations are degrees about the joint; the joints live in
// BodyMap so the two files agree on where an elbow is.
export const PATTERNS = {
  curl: { label: 'Elbow flexion', armL: 'rotate(-95deg)', armR: 'rotate(95deg)' },
  'pushdown': { label: 'Elbow extension', armL: 'rotate(52deg)', armR: 'rotate(-52deg)' },
  'overhead-extension': { label: 'Overhead elbow extension', armL: 'rotate(-140deg)', armR: 'rotate(140deg)' },
  'press-overhead': { label: 'Overhead press', armL: 'rotate(-150deg)', armR: 'rotate(150deg)' },
  'press-horizontal': { label: 'Horizontal press', armL: 'rotate(-38deg) translateY(-4px)', armR: 'rotate(38deg) translateY(-4px)' },
  row: { label: 'Horizontal pull', armL: 'rotate(34deg) translateY(3px)', armR: 'rotate(-34deg) translateY(3px)' },
  pulldown: { label: 'Vertical pull', armL: 'rotate(-120deg)', armR: 'rotate(120deg)' },
  fly: { label: 'Shoulder adduction', armL: 'rotate(-62deg)', armR: 'rotate(62deg)' },
  'raise-lateral': { label: 'Shoulder abduction', armL: 'rotate(-78deg)', armR: 'rotate(78deg)' },
  'raise-front': { label: 'Shoulder flexion', armL: 'rotate(-80deg)', armR: 'rotate(80deg)' },
  shrug: { label: 'Scapular elevation', armL: 'translateY(-5px)', armR: 'translateY(-5px)', torso: 'translateY(-2px)' },
  squat: { label: 'Knee + hip flexion', torso: 'translateY(15px) scaleY(0.94)', legL: 'scaleY(0.86)', legR: 'scaleY(0.86)', armL: 'translateY(15px)', armR: 'translateY(15px)' },
  hinge: { label: 'Hip hinge', torso: 'rotate(-32deg)', armL: 'rotate(-14deg) translateY(6px)', armR: 'rotate(14deg) translateY(6px)' },
  'leg-curl': { label: 'Knee flexion', legL: 'rotate(-6deg) scaleY(0.9)', legR: 'rotate(6deg) scaleY(0.9)' },
  'leg-extension': { label: 'Knee extension', legL: 'rotate(4deg)', legR: 'rotate(-4deg)' },
  'calf-raise': { label: 'Ankle plantarflexion', torso: 'translateY(-6px)', legL: 'translateY(-6px)', legR: 'translateY(-6px)', armL: 'translateY(-6px)', armR: 'translateY(-6px)' },
  crunch: { label: 'Spinal flexion', torso: 'rotate(-13deg) translateY(3px)', armL: 'rotate(-10deg)', armR: 'rotate(10deg)' },
};

export const PATTERN_IDS = Object.keys(PATTERNS);

// Ordered rules: the FIRST match wins, so the specific ones come before the
// general. Each is a name test, because the name is what states the movement
// ("Overhead Tricep Extension" and "Tricep Pushdown" share a muscle and share
// nothing else).
const RULES = [
  // Isometric holds move by definition NOT AT ALL. Animating a plank as a
  // crunch would teach the wrong thing, which is worse than teaching nothing,
  // so these resolve to no animation before any family rule can claim them.
  [/\b(plank|dead hang|carry|hold|wall sit|pinch)\b/i, null],
  [/\b(shrug)\b/i, 'shrug'],
  [/\bcalf raise|calf raises\b/i, 'calf-raise'],
  [/\bleg curl|leg curls|nordic|glute[- ]ham\b/i, 'leg-curl'],
  [/\bleg extension\b/i, 'leg-extension'],
  [/\b(crunch|sit-up|russian twist|rollout|plank|leg raise|knee raise|bicycle)\b/i, 'crunch'],
  [/overhead.*(extension|tricep)|tricep.*overhead|skull ?crusher|carter/i, 'overhead-extension'],
  [/\bpushdown|kickback\b/i, 'pushdown'],
  [/\b(curl)\b/i, 'curl'],
  [/\blateral raise|upright row\b/i, 'raise-lateral'],
  [/\bfront raise\b/i, 'raise-front'],
  [/\b(fly|flyes|flys|crossover|pec deck|rear delt)\b/i, 'fly'],
  [/\bface pull\b/i, 'row'],
  [/(overhead|shoulder) press|push press|arnold|thruster|landmine press/i, 'press-overhead'],
  [/\b(pulldown|pull-?up|pull ups|chin-?up|dead hang)\b/i, 'pulldown'],
  [/\brow\b/i, 'row'],
  [/bench press|chest press|push-?up|dip\b/i, 'press-horizontal'],
  [/deadlift|rdl|hip thrust|glute bridge|swing|pull-?through|good ?morning|rack pull|clean|snatch/i, 'hinge'],
  [/squat|leg press|lunge|step-?up|hack/i, 'squat'],
];

export function patternFor(name, primary = []) {
  const n = String(name || '');
  for (const [re, id] of RULES) if (re.test(n)) return id; // null is a decision, not a miss
  // Nothing in the name said what the movement is. Fall back only where the
  // anatomy is unambiguous enough that the shape is not a guess.
  const p = new Set(primary);
  if (p.has('calves')) return 'calf-raise';
  if (p.has('abs') || p.has('obliques')) return 'crunch';
  if (p.has('quads')) return 'squat';
  if (p.has('hamstrings') || p.has('glutes')) return 'hinge';
  return null; // honest: show the static diagram
}

export function patternLabel(id) { return PATTERNS[id]?.label || null; }
