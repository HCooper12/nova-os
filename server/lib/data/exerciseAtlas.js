// Anatomy and equipment for every exercise in his library.
//
// REFERENCE KNOWLEDGE, NOT HIS DATA — which is why it lives in the repo and
// not in the vault. The vault owns the exercise list, his form cues and his
// curated video links (`setExerciseKnowledge`); this table owns the facts
// that are true of the lift for anybody. Keeping them apart means a rebuild
// of this table can never overwrite something he wrote.
//
// Keyed by the library's own `id`. Every key is checked against his real
// library and every muscle against the closed vocabulary in muscles.js by
// exerciseAtlas.test.js — an id that drifts or a muscle that is misspelled
// fails the suite rather than silently lighting nothing on the diagram.
//
// `primary` is what the lift is FOR; `secondary` is what meaningfully helps.
// Kept deliberately short: a diagram with nine regions lit tells him nothing.
const A = (equipment, primary, secondary = []) => ({ equipment, primary, secondary });

export const EXERCISE_ATLAS = {
  // ---- Chest ----
  'barbell-bench-press': A('Barbell', ['chest'], ['front-delts', 'triceps']),
  'incline-barbell-bench-press': A('Barbell', ['chest', 'front-delts'], ['triceps']),
  'decline-barbell-bench-press': A('Barbell', ['chest'], ['triceps']),
  'dumbbell-bench-press': A('Dumbbell', ['chest'], ['front-delts', 'triceps']),
  'incline-dumbbell-press': A('Dumbbell', ['chest', 'front-delts'], ['triceps']),
  'dumbbell-flyes': A('Dumbbell', ['chest'], ['front-delts']),
  'incline-dumbbell-flyes': A('Dumbbell', ['chest'], ['front-delts']),
  'cable-crossover': A('Cable', ['chest'], ['front-delts']),
  'pec-deck-machine': A('Machine', ['chest'], ['front-delts']),
  'machine-chest-press': A('Machine', ['chest'], ['front-delts', 'triceps']),
  'push-up': A('Bodyweight', ['chest'], ['triceps', 'front-delts', 'abs']),
  'chest-dip': A('Bodyweight', ['chest'], ['triceps', 'front-delts']),
  'cable-flys-low-position-per-arm-weight': A('Cable', ['chest'], ['front-delts']),
  'cable-flys-high-position-per-arm-weight': A('Cable', ['chest'], ['front-delts']),
  'incline-dumbbell-bench-with-palms-facing-in': A('Dumbbell', ['chest', 'front-delts'], ['triceps']),

  // ---- Back ----
  deadlift: A('Barbell', ['lower-back', 'glutes', 'hamstrings'], ['traps', 'lats', 'quads', 'forearms']),
  'barbell-row': A('Barbell', ['lats', 'rhomboids'], ['rear-delts', 'traps', 'biceps', 'lower-back']),
  'pendlay-row': A('Barbell', ['lats', 'rhomboids'], ['rear-delts', 'traps', 'biceps']),
  't-bar-row': A('Barbell', ['lats', 'rhomboids'], ['rear-delts', 'traps', 'biceps']),
  'seated-cable-row': A('Cable', ['lats', 'rhomboids'], ['rear-delts', 'biceps']),
  'one-arm-dumbbell-row': A('Dumbbell', ['lats'], ['rhomboids', 'rear-delts', 'biceps']),
  'lat-pulldown': A('Machine', ['lats'], ['biceps', 'rhomboids']),
  'wide-grip-pull-up': A('Bodyweight', ['lats'], ['rhomboids', 'biceps']),
  'pull-up': A('Bodyweight', ['lats'], ['biceps', 'rhomboids', 'forearms']),
  'chin-up': A('Bodyweight', ['lats', 'biceps'], ['rhomboids', 'forearms']),
  'straight-arm-pulldown': A('Cable', ['lats'], ['triceps']),
  'rack-pull': A('Barbell', ['traps', 'lower-back'], ['lats', 'glutes', 'forearms']),
  'single-arm-lat-pulldown': A('Cable', ['lats'], ['biceps']),
  'wide-grip-lat-pulldown': A('Machine', ['lats'], ['rhomboids', 'biceps']),
  'lying-t-bar-row': A('Machine', ['lats', 'rhomboids'], ['rear-delts', 'traps']),
  'dumbbell-shrug': A('Dumbbell', ['traps'], ['forearms']),
  'chest-supported-dumbbell-row': A('Dumbbell', ['lats', 'rhomboids'], ['rear-delts', 'traps']),
  'pull-ups': A('Bodyweight', ['lats'], ['biceps', 'rhomboids', 'forearms']),
  'weighted-pull-up': A('Bodyweight', ['lats'], ['biceps', 'rhomboids', 'forearms']),

  // ---- Shoulders ----
  'face-pull': A('Cable', ['rear-delts'], ['traps', 'rhomboids']),
  'barbell-overhead-press': A('Barbell', ['front-delts', 'side-delts'], ['triceps', 'traps']),
  'seated-dumbbell-shoulder-press': A('Dumbbell', ['front-delts', 'side-delts'], ['triceps']),
  'arnold-press': A('Dumbbell', ['front-delts', 'side-delts'], ['triceps']),
  'lateral-raise': A('Dumbbell', ['side-delts'], ['traps']),
  'cable-lateral-raise': A('Cable', ['side-delts'], ['traps']),
  'front-raise': A('Dumbbell', ['front-delts'], ['side-delts']),
  'rear-delt-fly': A('Dumbbell', ['rear-delts'], ['rhomboids', 'traps']),
  'machine-shoulder-press': A('Machine', ['front-delts', 'side-delts'], ['triceps']),
  'upright-row': A('Barbell', ['side-delts', 'traps'], ['biceps']),
  'push-press': A('Barbell', ['front-delts', 'side-delts'], ['triceps', 'quads']),
  'landmine-press': A('Barbell', ['front-delts'], ['chest', 'triceps']),
  'cable-lateral-raise-behind-back-wrist-height': A('Cable', ['side-delts'], []),
  'dumbbell-shoulder-press-single-arm': A('Dumbbell', ['front-delts', 'side-delts'], ['triceps', 'abs']),
  'dumbbell-lateral-raise': A('Dumbbell', ['side-delts'], ['traps']),

  // ---- Biceps ----
  'barbell-curl': A('Barbell', ['biceps'], ['forearms']),
  'ez-bar-curl': A('EZ-bar', ['biceps'], ['forearms']),
  'dumbbell-curl': A('Dumbbell', ['biceps'], ['forearms']),
  'hammer-curl': A('Dumbbell', ['biceps', 'forearms'], []),
  'preacher-curl': A('EZ-bar', ['biceps'], ['forearms']),
  'concentration-curl': A('Dumbbell', ['biceps'], []),
  'cable-curl': A('Cable', ['biceps'], ['forearms']),
  'incline-dumbbell-curl': A('Dumbbell', ['biceps'], ['forearms']),
  'spider-curl': A('Dumbbell', ['biceps'], []),
  'cable-hammer-curls': A('Cable', ['biceps', 'forearms'], []),
  'ez-bar-reverse-curl': A('EZ-bar', ['forearms', 'biceps'], []),
  'alternate-incline-dumbbell-curl': A('Dumbbell', ['biceps'], ['forearms']),
  'cable-bicep-curl': A('Cable', ['biceps'], ['forearms']),
  'standing-dumbbell-bicep-curl': A('Dumbbell', ['biceps'], ['forearms']),

  // ---- Triceps ----
  'close-grip-bench-press': A('Barbell', ['triceps'], ['chest', 'front-delts']),
  'tricep-pushdown': A('Cable', ['triceps'], []),
  'rope-pushdown': A('Cable', ['triceps'], []),
  'overhead-tricep-extension': A('Dumbbell', ['triceps'], []),
  'skull-crushers': A('EZ-bar', ['triceps'], []),
  'dumbbell-kickback': A('Dumbbell', ['triceps'], []),
  'bench-dip': A('Bodyweight', ['triceps'], ['front-delts', 'chest']),
  'tricep-dip': A('Bodyweight', ['triceps'], ['chest', 'front-delts']),
  'diamond-push-up': A('Bodyweight', ['triceps'], ['chest', 'front-delts']),
  'single-arm-cable-extensions-cross-body-optional': A('Cable', ['triceps'], []),
  'cable-overhead-tricep-extension': A('Cable', ['triceps'], []),
  'triceps-pushdown-v-bar-attachment': A('Cable', ['triceps'], []),
  'rope-overhead-tricep-extension': A('Cable', ['triceps'], []),
  'carter-extension': A('Cable', ['triceps'], []),

  // ---- Quads ----
  'back-squat': A('Barbell', ['quads', 'glutes'], ['hamstrings', 'lower-back', 'adductors']),
  'front-squat': A('Barbell', ['quads'], ['glutes', 'abs', 'lower-back']),
  'leg-press': A('Machine', ['quads', 'glutes'], ['hamstrings', 'adductors']),
  'leg-extension': A('Machine', ['quads'], []),
  'bulgarian-split-squat': A('Dumbbell', ['quads', 'glutes'], ['hamstrings', 'adductors']),
  'walking-lunge': A('Dumbbell', ['quads', 'glutes'], ['hamstrings']),
  'goblet-squat': A('Dumbbell', ['quads', 'glutes'], ['abs', 'adductors']),
  'hack-squat': A('Machine', ['quads'], ['glutes']),
  'step-up': A('Dumbbell', ['quads', 'glutes'], ['hamstrings']),
  'sissy-squat': A('Bodyweight', ['quads'], []),

  // ---- Hamstrings ----
  'romanian-deadlift': A('Barbell', ['hamstrings', 'glutes'], ['lower-back', 'forearms']),
  'stiff-leg-deadlift': A('Barbell', ['hamstrings'], ['glutes', 'lower-back']),
  'seated-leg-curl': A('Machine', ['hamstrings'], ['calves']),
  'lying-leg-curl': A('Machine', ['hamstrings'], ['calves']),
  'nordic-curl': A('Bodyweight', ['hamstrings'], ['glutes']),
  'glute-ham-raise': A('Bodyweight', ['hamstrings'], ['glutes', 'lower-back']),
  'single-leg-rdl': A('Dumbbell', ['hamstrings', 'glutes'], ['lower-back']),
  'hamstring-lying-leg-curls': A('Machine', ['hamstrings'], ['calves']),

  // ---- Glutes ----
  'hip-thrust': A('Barbell', ['glutes'], ['hamstrings']),
  'barbell-glute-bridge': A('Barbell', ['glutes'], ['hamstrings']),
  'sumo-deadlift': A('Barbell', ['glutes', 'quads'], ['adductors', 'lower-back', 'traps']),
  'glute-kickback-machine': A('Machine', ['glutes'], ['hamstrings']),
  'cable-pull-through': A('Cable', ['glutes'], ['hamstrings', 'lower-back']),
  'banded-hip-abduction': A('Band', ['glutes'], []),
  'machine-hip-thrust': A('Machine', ['glutes'], ['hamstrings']),
  'cable-glute-kickback': A('Cable', ['glutes'], ['hamstrings']),

  // ---- Calves ----
  'standing-calf-raise': A('Machine', ['calves'], []),
  'seated-calf-raise': A('Machine', ['calves'], []),
  'leg-press-calf-raise': A('Machine', ['calves'], []),
  'donkey-calf-raise': A('Machine', ['calves'], []),
  'standing-dumbbell-calf-raise': A('Dumbbell', ['calves'], []),
  'standing-machine-calf-raises': A('Machine', ['calves'], []),

  // ---- Abs ----
  plank: A('Bodyweight', ['abs'], ['obliques', 'front-delts']),
  'side-plank': A('Bodyweight', ['obliques'], ['abs']),
  crunch: A('Bodyweight', ['abs'], []),
  'cable-crunch': A('Cable', ['abs'], ['obliques']),
  'hanging-leg-raise': A('Bodyweight', ['abs'], ['obliques', 'forearms']),
  'hanging-knee-raise': A('Bodyweight', ['abs'], ['forearms']),
  'russian-twist': A('Bodyweight', ['obliques'], ['abs']),
  'ab-wheel-rollout': A('Bodyweight', ['abs'], ['obliques', 'lats']),
  'sit-up': A('Bodyweight', ['abs'], ['obliques']),
  'bicycle-crunch': A('Bodyweight', ['abs', 'obliques'], []),
  'mountain-climber': A('Bodyweight', ['abs'], ['quads', 'front-delts']),

  // ---- Forearms ----
  'wrist-curl': A('Dumbbell', ['forearms'], []),
  'reverse-wrist-curl': A('Dumbbell', ['forearms'], []),
  'farmer-s-carry': A('Dumbbell', ['forearms', 'traps'], ['abs', 'glutes']),
  'dead-hang': A('Bodyweight', ['forearms'], ['lats']),
  'plate-pinch': A('Plate', ['forearms'], []),

  // ---- Full body ----
  burpee: A('Bodyweight', ['quads', 'chest'], ['abs', 'front-delts', 'triceps']),
  'kettlebell-swing': A('Kettlebell', ['glutes', 'hamstrings'], ['lower-back', 'abs', 'forearms']),
  'clean-and-jerk': A('Barbell', ['quads', 'glutes', 'front-delts'], ['traps', 'lower-back', 'triceps']),
  'power-clean': A('Barbell', ['quads', 'glutes', 'traps'], ['lower-back', 'hamstrings', 'forearms']),
  snatch: A('Barbell', ['quads', 'glutes', 'traps'], ['front-delts', 'lower-back', 'forearms']),
  thruster: A('Barbell', ['quads', 'front-delts'], ['glutes', 'triceps', 'abs']),
  'rowing-machine': A('Machine', ['lats', 'quads'], ['rhomboids', 'biceps', 'hamstrings']),
  'assault-bike': A('Machine', ['quads'], ['hamstrings', 'front-delts', 'lats']),
  'jump-rope': A('Other', ['calves'], ['quads', 'forearms']),
  'battle-ropes': A('Other', ['front-delts'], ['abs', 'forearms', 'lats']),
};

export function atlasFor(exerciseId) {
  return EXERCISE_ATLAS[String(exerciseId)] || null;
}
