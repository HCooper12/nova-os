// FORM CUES — the "best form practices" half of his Lyfta ask.
//
// The exercise panel has rendered a `cues` field since before this file
// existed, and on 4 Sep exactly 0 of his 135 exercises had one. The field was
// real, the surface was built, and it was empty on every card.
//
// SEEDS, NOT TRUTH. These live in the repo like the anatomy atlas because they
// are true of the lift for anybody. His vault keeps owning what HE writes:
// setExerciseKnowledge() still stores per-exercise cues, and a cue he has
// written always beats the seed below. So this fills 135 empty fields without
// ever writing to his vault or overwriting a word of his.
//
// Two or three cues each, the ones that change the rep. Not a technique essay:
// a card he reads between sets has room for the thing he is most likely to get
// wrong, and nothing else. Where a lift has a common failure that costs a
// joint rather than a rep, that is the one named.
export const EXERCISE_CUES = {
  // ---- Chest ----
  'barbell-bench-press': 'Shoulder blades pinned down and back before you unrack. Bar to the lower chest, elbows about 45° from the torso — not flared to 90°.',
  'incline-barbell-bench-press': 'Bench at 30°, not 45° — steeper turns it into a shoulder press. Bar to the upper chest, just below the collarbone.',
  'decline-barbell-bench-press': 'Lock your legs in before unracking. Bar to the lower chest and keep the path vertical; the decline already shortens it.',
  'dumbbell-bench-press': 'Start with the dumbbells over the shoulders, not the face. Lower until the elbows are level with the torso — deeper is stretch, not extra chest.',
  'incline-dumbbell-press': 'Wrists stacked over elbows the whole way. Press slightly inward at the top rather than clanging the bells together.',
  'dumbbell-flyes': 'Soft elbow held at one angle throughout — if the angle changes it has become a press. Stop the stretch when you feel the shoulder, not before.',
  'incline-dumbbell-flyes': 'Same fixed elbow as flat. On an incline the stretch comes sooner, so shorten the range before the shoulder takes over.',
  'cable-crossover': 'Step forward until there is tension at the top of the stretch. Bring the hands together and slightly across, then let the chest — not the shoulders — do the squeeze.',
  'pec-deck-machine': 'Seat height so the handles sit at chest level, not armpit level. Push with the upper arm; the hands are just hooks.',
  'machine-chest-press': 'Set the seat so the handles start level with the lower chest. Keep the shoulder blades against the pad through the whole press.',
  'push-up': 'One line from head to heels — the hips are the first thing to sag. Hands under the shoulders, elbows tracking back at about 45°.',
  'chest-dip': 'Lean the torso forward and let the elbows flare slightly — upright is a triceps dip. Stop when the upper arms reach parallel.',
  'cable-flys-low-position-per-arm-weight': 'Pulleys low, hands travelling up and in — this one hits the upper chest. Finish with the hands at collarbone height.',
  'cable-flys-high-position-per-arm-weight': 'Pulleys high, hands travelling down and in toward the hips. Keep the elbow angle fixed and lead with the upper arm.',
  'incline-dumbbell-bench-with-palms-facing-in': 'Neutral grip is kinder on the shoulder — keep it neutral all the way, do not rotate at the top.',

  // ---- Back ----
  deadlift: 'Bar against the shins, lats engaged, back flat before it moves. Push the floor away rather than pulling with the back; hips and shoulders rise together.',
  'barbell-row': 'Hinge to roughly 45° and hold it — standing up as you pull is the most common miss. Bar to the lower ribs, elbows past the torso.',
  'pendlay-row': 'Every rep starts dead on the floor. Torso stays parallel throughout — if it rises, the weight is too heavy.',
  't-bar-row': 'Chest up, hinge held, and pull to the stomach. Let the shoulder blades move — locking them still turns this into an arm exercise.',
  'seated-cable-row': 'Sit tall and stop the torso rocking. Pull the elbows back and down past the ribs, then let the shoulder blades separate on the way out.',
  'one-arm-dumbbell-row': 'Square the hips — rotating the torso to finish the rep is the giveaway that it is too heavy. Elbow drives back toward the hip, not out to the side.',
  'lat-pulldown': 'Thighs pinned, slight lean back and hold that angle. Bar to the collarbone; pulling behind the neck buys nothing and costs shoulders.',
  'wide-grip-pull-up': 'Start from a full hang with the shoulder blades set. Chest toward the bar, elbows down and back rather than just bending the arms.',
  'pull-up': 'Full hang at the bottom, chin clearly over the bar at the top. Squeeze the glutes to stop the legs swinging.',
  'chin-up': 'Underhand grip brings the biceps in — that is the point. Keep the ribs down so the lower back does not arch at the top.',
  'straight-arm-pulldown': 'Arms nearly straight and stay that way — bending them makes it a triceps pushdown. Hinge slightly and feel it in the lats, not the shoulders.',
  'rack-pull': 'Set the pins just below the knee. Same flat back as a deadlift; the shorter range is for load, not for rounding.',
  'single-arm-lat-pulldown': 'Let the shoulder rise fully at the top for the stretch, then pull the elbow down to the ribs. Do not rotate the torso to help.',
  'wide-grip-lat-pulldown': 'Wide grip, elbows tracking down and slightly out. Stop at the collarbone — pulling lower recruits the arms.',
  'lying-t-bar-row': 'Chest stays on the pad the entire set. If it lifts to start the rep, drop the weight.',
  'dumbbell-shrug': 'Straight up and down — rolling the shoulders adds nothing and grinds the joint. Pause at the top for a beat.',
  'chest-supported-dumbbell-row': 'The pad removes the cheat, so use it: no torso movement at all. Elbows back past the ribs.',
  'pull-ups': 'Full hang at the bottom, chin over the bar at the top. Squeeze the glutes to stop the legs swinging.',
  'weighted-pull-up': 'Add weight only once the bodyweight rep is clean through the full range. Keep the ribs down under load.',

  // ---- Shoulders ----
  'face-pull': 'Rope to the eyes, elbows high and wide, and finish by pulling the hands apart. Light weight — this is a rear delt and rotator exercise, not a row.',
  'barbell-overhead-press': 'Ribs down and glutes tight so the lower back does not take the load. Move the head back out of the way, then push it forward under the bar at the top.',
  'seated-dumbbell-shoulder-press': 'Start at ear height, not below. Press up and slightly in; do not bang the bells together.',
  'arnold-press': 'The rotation happens on the way up, finishing with palms forward. Slow it down — the point is the range, not the load.',
  'lateral-raise': 'Lead with the elbow and stop at shoulder height. If you have to swing to start the rep, the weight is doing the work.',
  'cable-lateral-raise': 'The cable keeps tension at the bottom where dumbbells lose it — use that and control the return.',
  'front-raise': 'Stop at shoulder height and do not lean back to finish. Most people already get plenty of front delt from pressing.',
  'rear-delt-fly': 'Hinge over, soft elbows, and lead with the elbows out and back. Squeeze at the top instead of chasing weight.',
  'machine-shoulder-press': 'Seat height so the handles start at ear level. Do not lock out hard at the top.',
  'upright-row': 'Wider grip and stop at chest height — a narrow grip pulled to the chin is the shoulder-impingement version.',
  'push-press': 'A short dip and a hard drive from the legs, then the arms finish it. The dip is shallow — a quarter squat is too deep.',
  'landmine-press': 'The arc is natural, so let the bar travel up and slightly across. Brace the ribs; do not lean back into it.',
  'cable-lateral-raise-behind-back-wrist-height': 'Cable behind the back puts the tension on the side delt from the very bottom. Stay upright and stop at shoulder height.',
  'dumbbell-shoulder-press-single-arm': 'Brace hard — one side loaded wants to bend you sideways. Keep the ribs square through the press.',
  'dumbbell-lateral-raise': 'Lead with the elbow, stop at shoulder height, control the way down. Swinging is the whole failure mode of this lift.',

  // ---- Biceps ----
  'barbell-curl': 'Elbows pinned at the ribs — swinging them forward hands the rep to the front delt. Do not let the bar rest at the top.',
  'ez-bar-curl': 'The angled grip is easier on the wrists; keep the wrists neutral, not curled in. Elbows still.',
  'dumbbell-curl': 'Supinate as you rise so the palm faces up at the top. Elbows stay by the ribs.',
  'hammer-curl': 'Neutral grip throughout — no rotation. This one is brachialis and forearm as much as biceps.',
  'preacher-curl': 'Armpits pressed into the pad. Do not straighten fully and bounce out of the bottom; the stretched position is where this hurts people.',
  'concentration-curl': 'Elbow braced against the inner thigh and still. Slow negative — this is a peak-contraction exercise, not a heavy one.',
  'cable-curl': 'Constant tension is the point, so do not rest at the bottom. Elbows fixed in front of the hips.',
  'incline-dumbbell-curl': 'Lying back puts the biceps on stretch — let the arms hang fully behind the torso. That stretch is the whole reason to do it.',
  'spider-curl': 'Chest on the pad, arms hanging straight down. No swing is possible here, so use it: strict, and squeeze at the top.',
  'cable-hammer-curls': 'Rope, neutral grip, elbows still. Pull the rope slightly apart at the top.',
  'ez-bar-reverse-curl': 'Overhand grip, wrists straight and firm. Go lighter than a normal curl — this is a forearm lift that also hits the biceps.',
  'alternate-incline-dumbbell-curl': 'One arm at a time, the other hanging in the stretch. Do not let the resting arm creep up.',
  'cable-bicep-curl': 'Stand far enough back that there is tension at the bottom. Elbows fixed.',
  'standing-dumbbell-bicep-curl': 'Elbows at the ribs, ribs down, no back swing. If the torso moves, the biceps are not the limiting factor any more.',

  // ---- Triceps ----
  'close-grip-bench-press': 'Grip just inside shoulder width — narrower wrecks wrists without adding triceps. Elbows tucked close to the body.',
  'tricep-pushdown': 'Upper arms locked at the sides. Only the forearm moves; leaning over the bar turns it into a chest press.',
  'rope-pushdown': 'Spread the rope apart at the bottom and hold for a beat. Elbows pinned.',
  'overhead-tricep-extension': 'Elbows point forward and stay there. The overhead position is what loads the long head — do not shorten it by dropping the elbows out.',
  'skull-crushers': 'Lower to the forehead or just behind it, elbows still. If they drift back toward the shoulders it becomes a pullover.',
  'dumbbell-kickback': 'Upper arm parallel to the floor and fixed. Full lockout at the top; light weight, this is a squeeze exercise.',
  'bench-dip': 'Keep the shoulders down and the elbows tracking straight back. Stop before the shoulders roll forward — this position is hard on them.',
  'tricep-dip': 'Torso upright, elbows in — leaning forward shifts it to the chest. Stop at upper arms parallel.',
  'diamond-push-up': 'Hands close under the chest, elbows brushing the ribs. Keep the body in one line; the hips sag first.',
  'single-arm-cable-extensions-cross-body-optional': 'Elbow fixed and pointing where it started. Cross-body slightly changes the angle on the long head — keep it deliberate, not a swing.',
  'cable-overhead-tricep-extension': 'Face away from the stack, elbows forward and high. Constant tension in the stretched position is the whole point.',
  'triceps-pushdown-v-bar-attachment': 'V-bar keeps the wrists neutral. Upper arms locked at the sides, full lockout without leaning in.',
  'rope-overhead-tricep-extension': 'Elbows narrow and pointing forward. Let the hands go well behind the head for the stretch before extending.',
  'carter-extension': 'Behind-the-head cable extension — elbows stay high and still. Go light; the stretched position is where the long head works and where it is easy to overload.',

  // ---- Quads ----
  'back-squat': 'Brace before you descend, knees tracking over the toes, and hit at least parallel. Chest and hips rise together — if the hips shoot first it has become a good morning.',
  'front-squat': 'Elbows high throughout — dropping them is what dumps the bar. Stay upright; this one is meant to be quad-dominant.',
  'leg-press': 'Lower back stays on the pad. Stop before the hips curl under at the bottom; do not lock the knees hard at the top.',
  'leg-extension': 'Pause at the top and squeeze. Set the seat so the knee joint lines up with the machine pivot, or the knee takes the shear.',
  'bulgarian-split-squat': 'Front foot far enough forward that the shin stays near vertical. Weight through the front heel; the back leg is a kickstand.',
  'walking-lunge': 'Step long, drop the back knee toward the floor, and keep the torso upright. Push through the front heel to stand.',
  'goblet-squat': 'Bell held at the chest as a counterweight — let it keep you upright. Elbows inside the knees at the bottom.',
  'hack-squat': 'Feet mid-platform, back flat against the pad. Depth over load; a quarter-rep hack squat achieves nothing.',
  'step-up': 'Drive through the heel of the top foot and do not push off the back leg. Control the way down instead of dropping.',
  'sissy-squat': 'Knees travel forward, hips stay extended, torso in line with the thighs. Go slowly — this puts real load on the knee.',

  // ---- Hamstrings ----
  'romanian-deadlift': 'Hips back, bar dragging the thighs, slight knee bend held constant. Stop where the hamstrings stop, not where the floor is.',
  'stiff-leg-deadlift': 'Straighter legs than an RDL and a longer stretch — but the back stays flat. Lighter than you think.',
  'seated-leg-curl': 'Seated puts the hamstring on stretch at the hip, which is why it works well. Pause at full flexion; do not let the weight yank you back.',
  'lying-leg-curl': 'Hips pressed into the pad — lifting them to finish the rep is the standard cheat. Slow negative.',
  'nordic-curl': 'Ankles anchored, hips extended, and lower as slowly as you can hold. Most people can only control the top third at first; that is fine.',
  'glute-ham-raise': 'Hips stay open the whole way. Go from the knees, not by folding at the waist.',
  'single-leg-rdl': 'Hips square — the giveaway is the free hip opening to the side. Reach the back leg away as a counterweight.',
  'hamstring-lying-leg-curls': 'Hips down on the pad, controlled negative, full range. Do not bounce out of the bottom.',

  // ---- Glutes ----
  'hip-thrust': 'Chin tucked and ribs down. Finish with the hips level, not hyperextended — arching the lower back is not more glute.',
  'barbell-glute-bridge': 'Same lockout as a thrust with a shorter range. Squeeze hard at the top for a beat.',
  'sumo-deadlift': 'Wide stance, toes out, knees pushed out to match. Hips lower than a conventional pull and the torso more upright.',
  'glute-kickback-machine': 'Hinge fixed — the movement is at the hip only. Squeeze at full extension rather than swinging further.',
  'cable-pull-through': 'This is a hinge, not a squat. Hips back, then drive them forward to lockout; the arms are just a rope.',
  'banded-hip-abduction': 'Push the knee out and slightly back. Keep the torso still — leaning away is how you make it look easier.',
  'machine-hip-thrust': 'Set the pad low across the hips. Ribs down, full lockout, pause at the top.',
  'cable-glute-kickback': 'Stand tall and hinge only at the hip. Do not arch the lower back to get more range.',

  // ---- Calves ----
  'standing-calf-raise': 'Full stretch at the bottom, full contraction at the top, and pause at both. Standing works the gastrocnemius — keep the knee straight.',
  'seated-calf-raise': 'Bent knee shifts it to the soleus. Slow, and do not bounce out of the stretch.',
  'leg-press-calf-raise': 'Only the toes on the platform. Knees stay soft but fixed — do not turn it into a press.',
  'donkey-calf-raise': 'Hinged position lengthens the calf. Full range and a hard pause at the top.',
  'standing-dumbbell-calf-raise': 'Balance against something so you can push depth rather than fighting to stay upright.',
  'standing-machine-calf-raises': 'Knees straight, full stretch, hard squeeze. Reps here should be slow — calves respond to time, not swing.',

  // ---- Abs ----
  plank: 'One line from head to heels, ribs pulled down, glutes squeezed. If the lower back is working, the hips have dropped.',
  'side-plank': 'Hips stacked and lifted, not sagging toward the floor. Shoulder directly over the elbow.',
  crunch: 'Curl the ribs toward the hips rather than lifting the whole torso. Hands should not pull the head forward.',
  'cable-crunch': 'Hips fixed — the movement is spinal flexion, not a hip hinge. Round down through the ribs and hold the bottom.',
  'hanging-leg-raise': 'Curl the pelvis under at the top; lifting straight legs alone is mostly hip flexor. Stop the swing before the next rep.',
  'hanging-knee-raise': 'Same pelvic tilt at the top as the straight-leg version. Control the descent instead of dropping.',
  'russian-twist': 'Rotate through the ribs, not just the arms. Keep the chest tall — collapsing turns it into nothing.',
  'ab-wheel-rollout': 'Ribs down and hips tucked before you roll. Only go as far as you can hold that position — the lower back arching is the stopping point.',
  'sit-up': 'Roll up one vertebra at a time rather than snapping off the floor. Do not anchor the feet if you can avoid it.',
  'bicycle-crunch': 'Slow. The elbow-to-knee race is the common mistake — rotate through the torso and pause at each side.',
  'mountain-climber': 'Hips level and shoulders over the hands. Speed comes after the position is solid.',

  // ---- Forearms ----
  'wrist-curl': 'Forearms supported, only the wrist moves. Let the bar roll to the fingertips at the bottom for the full range.',
  'reverse-wrist-curl': 'Much lighter than the palms-up version. Slow and controlled — the extensors are small.',
  'farmer-s-carry': 'Stand tall, shoulders back, ribs down. Walk normally; leaning or shrugging defeats the point.',
  'dead-hang': 'Full hang with the shoulders active rather than jammed into the ears. Breathe — the grip fails sooner if you hold your breath.',
  'plate-pinch': 'Pinch with the fingers and thumb, plates smooth side out. Stand tall and just hold.',

  // ---- Full body ----
  burpee: 'Chest to the floor at the bottom, full hip extension at the top. Pace it — form falls apart faster here than anywhere.',
  'kettlebell-swing': 'A hinge, not a squat. The hips snap and the bell floats; the arms never lift it. Stop at chest height.',
  'clean-and-jerk': 'Bar close to the body the whole way. Full hip extension before the pull under; do not muscle it up with the arms.',
  'power-clean': 'The first pull is slow and controlled, the second is violent. Elbows whip through fast to catch on the shoulders.',
  snatch: 'Wide grip, bar close, and a full turnover overhead. This is the most technical lift here — light and often beats heavy and occasional.',
  thruster: 'Front squat straight into a press — the drive out of the bottom carries the bar up. Do not pause and turn it into two lifts.',
  'rowing-machine': 'Legs, then back, then arms on the drive; arms, then back, then legs on the return. Most people pull with the arms too early.',
  'assault-bike': 'Push and pull the handles rather than just pedalling. Sit tall and keep the effort steady instead of surging.',
  'jump-rope': 'Small jumps, wrists doing the turning, elbows in. Land on the balls of the feet without slamming the heels.',
  'battle-ropes': 'Athletic stance, hips slightly back, and drive from the hips into the arms. Keep the waves even — ragged waves mean you are done.',
};

export function cuesFor(exerciseId) {
  return EXERCISE_CUES[String(exerciseId)] || null;
}
