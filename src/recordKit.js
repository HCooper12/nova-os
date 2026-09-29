import { shownKg, fmtKg, liftIncrement, isBodyweightLift } from './sessionSummaryFacts.js';

// THE PERSONAL-BEST MOMENT'S PURE FACTS (29 Sep 2026, design/mockups/65-pb-
// celebration.html, his calls on it):
//   "I think I really like the idea of a different animation depending on
//    what the specific achievement is… the weight plates being stacked on for
//    the bench press… for the lat pull down there are the other plates being
//    stacked on top of each other just like the actual exercise uses… For
//    anything that is more unclear the trophy animation is a nice look."
//   "I like this filed version best" — the full moment plays only once the
//    server has confirmed an all-time best; the Finish sheet keeps its
//    quieter "You beat last time".
//
// Three things live here, tested in server/test/recordKit.test.js:
//   the kit        — which equipment a lift is done on, read from its NAME,
//                    because the exercise library has no equipment field
//   the records    — the server's confirmed records, normalised, compared at
//                    the resolution they are shown, joined to the session's
//                    own muscle group (the hue) and the kit (the moment)
//   the words      — the two-stage wording, true at each moment it is said
//
// Nothing here writes, and nothing here is a model's guess: a lift the table
// cannot place is 'unknown' and gets the trophy, which claims no kit at all.

// ---------------------------------------------------------------- the kit --

// Ordered, FIRST MATCH WINS, so the specific rules sit above the general:
// "Cable Crunch" is a stack before it is a crunch, "Dumbbell Bench Press" is
// a dumbbell before it is a bench press, "Smith Machine Squat" is a bar
// before it is a machine. Each row names what it reads, so the table can be
// read aloud and argued with. Whole words only (\b), case-insensitive.
export const EQUIPMENT_RULES = [
  // cardio machines carry no load to celebrate; they must not read as a stack
  { words: 'rowing machine · bike · treadmill · elliptical · ski erg · stair', re: /\b(rowing machine|rower|bike|treadmill|elliptical|ski ?erg|stair ?(master|climber))\b/i, kit: 'unknown' },
  // a Smith machine is a bar on rails: plates go on a sleeve
  { words: 'smith', re: /\bsmith\b/i, kit: 'barbell' },
  // a pin through a stack: anything on a cable, a selectorised machine
  { words: 'cable · rope · machine · pulldown · pushdown · face pull · pec deck · leg press · leg extension · leg curl · assisted · crossover', re: /\b(cables?|rope|machine|pulldowns?|pull[- ]?downs?|pushdowns?|push[- ]?downs?|face pulls?|pec ?deck|leg press|leg extensions?|leg curls?|assisted|crossovers?)\b/i, kit: 'stack' },
  // a hand weight named as one
  { words: 'dumbbell · DB · goblet', re: /\b(dumbbells?|db|goblet)\b/i, kit: 'dumbbell' },
  // the body is the load (a belt or vest can add to it; the body is still the kit)
  { words: 'pull-up · chin-up · push-up · dip · plank · dead hang · sit-up · crunch · leg raise · knee raise · nordic · glute-ham · sissy squat · burpee · muscle-up · pistol · inverted row · mountain climber · rollout', re: /\b(pull[- ]?ups?|chin[- ]?ups?|push[- ]?ups?|dips?|plank|dead hang|sit[- ]?ups?|crunch(es)?|leg raises?|knee raises?|nordic|glute-?ham|sissy squats?|burpees?|muscle-?ups?|pistol|inverted rows?|mountain climbers?|rollouts?)\b/i, kit: 'bodyweight' },
  // done with a bar OR with dumbbells, gym to gym: the name does not say, so
  // nothing is claimed (these sit above the bar rule, which would take "squat")
  { words: 'kettlebell · split squat · bulgarian · lunge · step-up · single-leg', re: /\b(kettlebells?|kb|split squats?|bulgarian|lunges?|step-?ups?|single[- ]leg)\b/i, kit: 'unknown' },
  // a bar with plates on a sleeve, named as one or by a lift that is one
  // (a plate-loaded sled such as the hack squat also takes its plates on a sleeve)
  { words: 'barbell · EZ-bar · T-bar · bench press · bench · squat · deadlift · RDL · overhead/military press · push press · pendlay · rack pull · hip thrust · good morning · clean · snatch · jerk · landmine · JM press', re: /\b(barbell|ez[- ]?bar|t[- ]?bar|bench press|bench|squats?|deadlifts?|rdl|overhead press|military press|push press|pendlay|rack pulls?|hip thrusts?|good ?mornings?|clean|snatch|jerk|landmine|jm press)\b/i, kit: 'barbell' },
  // lifts done with dumbbells by convention when the name does not say otherwise
  { words: 'lateral raise · lat raise · front raise · hammer curl · arnold · shrug', re: /\b(lateral raises?|lat raises?|front raises?|hammer curls?|arnold|shrugs?)\b/i, kit: 'dumbbell' },
];

export const EQUIPMENT = ['stack', 'barbell', 'dumbbell', 'bodyweight', 'unknown'];

// The lift's name first; the tracking type only when the name said nothing
// (a lift he logs as bodyweight is done on his body). Otherwise 'unknown' —
// an honest "cannot tell", which the trophy exists to answer.
export function equipmentFor(name, trackingType = null) {
  const n = String(name || '').trim();
  if (n) for (const r of EQUIPMENT_RULES) if (r.re.test(n)) return r.kit;
  if (isBodyweightLift(trackingType)) return 'bodyweight';
  return 'unknown';
}

// Which moment plays. A kit moment draws the LOAD — the pin moving down the
// stack, the plate going onto the sleeve — so it is only true of a record in
// the weight he loaded. An estimated 1-rep max can be set with less on the
// bar than last time (more reps), and a picture of a heavier load would be a
// lie, so an estimate gets the trophy, whatever the kit.
export function momentFor(equipment, kind = 'weight') {
  if (kind !== 'weight') return 'trophy';
  if (equipment === 'stack') return 'stack';
  if (equipment === 'barbell') return 'barbell';
  return 'trophy';
}

// When each moment lands (the peak: the chime, the haptic, the stamped
// words) and when it settles (total), in ms on the moment's one clock
// (src/RecordMoment.jsx). Every moment plays once, under 1.6 s, and stops.
export const REC_TIMELINE = {
  trophy: { total: 1300, peak: 600, count: [0, 650] },
  stack: { total: 1600, peak: 750 },
  barbell: { total: 1000, peak: 520 },
};

// ------------------------------------------------------------ the records --

const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

// The server's confirmed records (routes/workouts.js prsInSession, at most
// three), made ready to celebrate:
//   - compared at the resolution SHOWN (the rule of 12 Sep): a record whose
//     number reads the same as the old best is not one, whatever the float
//   - joined to the session's own exercise by id (then name) for the muscle
//     group — the hue he called "a nice touch" — the tracking type, and the
//     step his own numbers move by (the stack is labelled at it)
//   - in the order the server named them, which is the session's order
export function confirmedRecords(prs, exercises = []) {
  const list = Array.isArray(prs) ? prs : [];
  const exs = Array.isArray(exercises) ? exercises : [];
  const out = [];
  const seen = new Set();
  for (const p of list) {
    if (!p || !p.name) continue;
    const kind = p.kind === 'e1rm' ? 'e1rm' : 'weight';
    const value = num(p.value);
    if (value == null || !(shownKg(value) > 0)) continue;
    const previous = num(p.previous);
    if (previous != null && !(shownKg(value) > shownKg(previous))) continue;   // the same number shown: nothing happened
    const key = `${p.exerciseId || p.name}|${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ex = exs.find((e) => e && p.exerciseId && e.exerciseId === p.exerciseId)
      || exs.find((e) => e && e.name === p.name) || null;
    const trackingType = ex?.trackingType || null;
    const equipment = equipmentFor(p.name, trackingType);
    const reps = num(p.reps);
    out.push({
      exerciseId: p.exerciseId || null,
      name: String(p.name),
      kind,
      value: shownKg(value),
      previous: previous == null ? null : shownKg(previous),
      delta: previous == null ? null : shownKg(value - previous),
      // the set he did: for a weight record the record itself, for an
      // estimate the set it was estimated from
      weight: kind === 'weight' ? shownKg(value) : (num(p.weight) == null ? null : shownKg(p.weight)),
      reps: reps == null ? null : Math.round(reps),
      muscle: ex?.muscleGroup || null,
      trackingType,
      equipment,
      moment: momentFor(equipment, kind),
      step: liftIncrement({ last: ex?.last, sets: ex?.sets }),
    });
  }
  return out;
}

// ------------------------------------------------------------- the words --

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// a number never wraps away from its unit ("2.5 / kg" on the second line)
const NB = '\u00a0';

// THE TWO-STAGE WORDING. The phrase must be true at the moment it is said.
//   'sheet'     — before it files. Code knows one thing: this set beat LAST
//                 TIME (recordCandidates). So it says that, plainly, and says
//                 the all-time check is still to come.
//   'confirmed' — after it files. The server has compared his whole history;
//                 only now does Nova say "New personal best".
// `rec` is a recordCandidates entry for 'sheet', a confirmedRecords entry
// for 'confirmed'. Returns { head, line, meta, aria }.
export function recordPhrase(state, rec) {
  if (!rec) return null;
  if (state === 'sheet') {
    const head = 'You beat last time';
    const meta = 'Nova checks it against your best ever when it files';
    let line;
    if (rec.kind === 'weight') {
      line = `${rec.name}, ${fmtKg(rec.value)} kg × ${rec.reps} · up ${fmtKg(rec.delta)} on ${fmtKg(rec.previous)}`;
    } else {
      // more reps: at the same weight, or on his body
      const at = rec.weight ? `${fmtKg(rec.weight)} kg × ${rec.value}` : plural(rec.value, 'rep');
      line = `${rec.name}, ${at} · up ${plural(rec.delta, 'rep')} on ${rec.previous}`;
    }
    return { head, line, meta, aria: `${head}. ${line}. ${meta}.` };
  }
  // confirmed
  const set = rec.weight != null && rec.reps != null ? `${fmtKg(rec.weight)} kg × ${rec.reps}` : `${fmtKg(rec.value)} kg`;
  const line = `${rec.name}, ${set}`;
  if (rec.previous == null) {
    // nothing on record to have passed: said, never dressed up as a beating
    const head = 'First on record';
    const meta = rec.kind === 'weight'
      ? 'The first time it is on record, so this is the number to beat'
      : `An estimated 1-rep max of ${fmtKg(rec.value)} kg, the first on record`;
    return { head, line, meta, aria: `${head}. ${line}. ${meta}.` };
  }
  const head = 'New personal best';
  const meta = rec.kind === 'weight'
    ? `Your heaviest ever on it, ${fmtKg(rec.delta)}${NB}kg past your old best of${NB}${fmtKg(rec.previous)}`
    : `Your best estimated 1-rep max on it, ${fmtKg(rec.value)}${NB}kg: ${fmtKg(rec.delta)}${NB}kg past your old best of${NB}${fmtKg(rec.previous)}`;
  return { head, line, meta, aria: `${head}. ${line}. ${meta}.` };
}

// ------------------------------------------------------------ the drawings --

// Two decimals where a half-step lives (1.25 a side), never "1.3".
export const fmtFine = (n) => String(Math.round((Number(n) || 0) * 100) / 100);

// THE STACK, labelled at the lift's own step. The pin moves from the plate
// that reads his old best to the one that reads today's, `drop` plates down.
// When his step does not land the old best exactly on a plate (a jump of
// 7.5 on a 2.5 step is fine; 3 on a 2.5 step is not), the step becomes the
// jump itself, so the old best is ALWAYS a labelled plate: the picture never
// shows a number he did not lift.
export const STACK_PLATES = 8;
export const STACK_PIN = 4;              // today's plate, counted from the top
export function stackPlan(rec) {
  const value = Number(rec?.value) || 0;
  const previous = Number(rec?.previous);
  const delta = Number.isFinite(previous) ? shownKg(value - previous) : 0;
  let step = shownKg(rec?.step) > 0 ? shownKg(rec.step) : 2.5;
  let drop = delta > 0 ? Math.round((delta / step) * 1000) / 1000 : 1;
  if (!(delta > 0) || !Number.isInteger(drop) || drop < 1 || drop > STACK_PIN) { step = delta > 0 ? delta : step; drop = 1; }
  const plates = [];
  for (let i = 0; i < STACK_PLATES; i++) {
    const w = shownKg(value - (STACK_PIN - i) * step);
    plates.push({ i, label: w > 0 ? fmtKg(w) : null, lifted: i <= STACK_PIN, today: i === STACK_PIN, was: i === STACK_PIN - drop });
  }
  return { step, drop, plates };
}

// THE SLEEVE. A bar is loaded the same on both sides, so the picture is one
// sleeve: last time's load in ink, and the rise, HALF of it, as the new
// plate in the hue — labelled per side, because that is what goes on the
// sleeve. Last time's plates are sized from a greedy break-down of the old
// load on a 20 kg bar and are NOT labelled: which plates he actually used is
// not recorded anywhere, so the drawing shows their weight, never their names.
const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];
export function barPlan(rec) {
  const value = Number(rec?.value) || 0;
  const previous = Number(rec?.previous);
  const perSide = Number.isFinite(previous) ? (value - previous) / 2 : 0;
  const old = [];
  let rest = Number.isFinite(previous) ? (previous - 20) / 2 : 0;
  for (const p of PLATE_SIZES) {
    while (rest >= p - 1e-9 && old.length < 4) { old.push(p); rest = Math.round((rest - p) * 100) / 100; }
  }
  // an unfamiliar bar or a load that does not break down: one plate, unsized
  if (!old.length) old.push(20);
  return { perSide, perSideLabel: `+${fmtFine(perSide)}`, old };
}
