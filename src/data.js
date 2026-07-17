// Static content for the NOVA OS demo — mocked vault data (recipes, notes,
// workout plan, chat scripts). Ported verbatim from the original design.

export const recipes = [
  { id: 'r1', name: 'Burrito bowl', tag: 'HIGH PROTEIN', filter: 'High protein', p: 52, c: 68, f: 18, kcal: 640, time: '25 min', hue: '216,181,115',
    ingredients: [[180, 'g', 'chicken thigh, diced'], [80, 'g', 'basmati rice (dry)'], [60, 'g', 'black beans'], [40, 'g', 'charred corn'], [30, 'g', 'cheddar, grated'], [20, 'g', 'salsa roja'], [0.5, '', 'lime, juiced']],
    steps: ['Season chicken with smoked paprika, cumin, salt; sear 6–7 min until charred.', 'Cook rice; fold through lime juice and a pinch of salt.', 'Warm beans and corn in the same pan to pick up the fond.', 'Assemble bowl, top with cheddar and salsa.'] },
  { id: 'r2', name: 'Greek yogurt parfait', tag: 'QUICK', filter: 'Quick', p: 32, c: 41, f: 9, kcal: 380, time: '5 min', hue: '138,106,209',
    ingredients: [[250, 'g', 'Greek yogurt 0%'], [40, 'g', 'granola'], [80, 'g', 'mixed berries'], [15, 'g', 'honey'], [10, 'g', 'chia seeds']],
    steps: ['Layer yogurt, granola and berries in a glass.', 'Drizzle honey, finish with chia.'] },
  { id: 'r3', name: 'Salmon & sticky rice', tag: 'BALANCED', filter: 'High protein', p: 41, c: 72, f: 22, kcal: 660, time: '30 min', hue: '107,229,245',
    ingredients: [[160, 'g', 'salmon fillet'], [90, 'g', 'sushi rice (dry)'], [15, 'g', 'soy glaze'], [50, 'g', 'edamame'], [1, '', 'spring onion, sliced']],
    steps: ['Roast salmon at 200°C for 12 min, glaze at the end.', 'Cook rice; season with rice vinegar.', 'Serve with edamame and spring onion.'] },
  { id: 'r4', name: 'Protein oats', tag: 'QUICK', filter: 'Quick', p: 38, c: 55, f: 11, kcal: 470, time: '8 min', hue: '216,181,115',
    ingredients: [[60, 'g', 'rolled oats'], [30, 'g', 'whey, vanilla'], [200, 'ml', 'milk'], [80, 'g', 'banana, sliced'], [15, 'g', 'peanut butter']],
    steps: ['Simmer oats in milk 5 min.', 'Off heat, stir in whey.', 'Top with banana and peanut butter.'] },
  { id: 'r5', name: 'Beef stir-fry', tag: 'HIGH PROTEIN', filter: 'High protein', p: 48, c: 44, f: 19, kcal: 560, time: '20 min', hue: '201,111,111',
    ingredients: [[170, 'g', 'lean beef strips'], [70, 'g', 'jasmine rice (dry)'], [120, 'g', 'broccoli'], [20, 'g', 'oyster sauce'], [10, 'g', 'ginger, minced']],
    steps: ['Velvet beef 30 min in bicarb rinse; pat dry.', 'Stir-fry beef hard 2 min; remove.', 'Fry broccoli + ginger, return beef with sauce.', 'Serve over rice.'] },
  { id: 'r6', name: 'Turkey chili (batch ×4)', tag: 'BATCH', filter: 'Batch', p: 45, c: 38, f: 14, kcal: 470, time: '45 min', hue: '90,168,124',
    ingredients: [[500, 'g', 'turkey mince (batch)'], [240, 'g', 'kidney beans'], [400, 'g', 'chopped tomatoes'], [1, '', 'onion, diced'], [8, 'g', 'chili + cumin blend']],
    steps: ['Brown turkey with onion and spices.', 'Add tomatoes and beans; simmer 30 min.', 'Portion into 4 — freezes well.'] },
];

export const notes = [
  { id: 'n1', title: 'Huberman — protein timing', type: 'PODCAST', date: '02 JUL · 14 backlinks', color: '#8a6ad1',
    paras: ['Total daily protein matters far more than the anabolic window. Aim ~1.6–2.2 g/kg spread over 3–4 feedings; the post-training feeding is convenient, not magic.', 'Leucine threshold ≈ 2.5–3 g per meal is the practical lever — whey, greek yogurt and lean meats clear it easily at normal portions.', 'Action: front-load 40 g at breakfast on training days. Nova linked this to four vault recipes that clear the leucine threshold.'],
    links: ['Burrito bowl', 'Protein oats', 'Push day · wk6', 'Greek yogurt parfait'] },
  { id: 'n2', title: 'Atomic Habits — key ideas', type: 'NOTE', date: '28 JUN · 9 backlinks', color: '#ece5da',
    paras: ['Identity precedes outcome: decide who you are, then vote for it with small reps. Systems beat goals because goals are momentary, systems compound.', 'Environment design is the highest-leverage move — make the good obvious and the bad invisible. Two-minute rule for starting anything.'],
    links: ['Weekly review · wk27', 'Science video — hooks'] },
  { id: 'n3', title: 'Science video — hooks', type: 'IDEA', date: '05 JUL · 3 backlinks', color: '#e08f6f',
    paras: ['Hook candidates for the muscle-protein-synthesis explainer: "Your muscles are rebuilt from a 4-hour window you keep missing" vs the myth-bust angle "The anabolic window is a lie — mostly."', 'Studio drafted a 40-second cold open from the Huberman note; needs a stat overlay and one B-roll list.'],
    links: ['Huberman — protein timing', 'Studio · outline draft'] },
  { id: 'n4', title: 'Weekly review · wk27', type: 'NOTE', date: '05 JUL · 6 backlinks', color: '#ece5da',
    paras: ['Wins: 4 training days, script outline shipped, spending on plan. Misses: three skipped runs, science project idle 10 days.', 'Energy correlated with sleep >7h on all good days — Commander now protects a 22:30 wind-down block.'],
    links: ['Atomic Habits — key ideas', 'Push day · wk6'] },
  { id: 'n5', title: 'Diary of a CEO — sleep', type: 'PODCAST', date: '24 JUN · 5 backlinks', color: '#8a6ad1',
    paras: ['Walker: regularity beats duration — same wake time daily anchors circadian phase. Alcohol fragments REM even at one drink.', 'Action: fixed 06:45 wake, cold light first 20 minutes. Nova tracks the streak (currently 11 days).'],
    links: ['Weekly review · wk27'] },
  { id: 'n6', title: 'About Hayden', type: 'IDENTITY', date: 'PERMANENT · 31 backlinks', color: '#d8b573',
    paras: ['Mission: teach science that sticks, stay strong for decades, keep money boring. Ten-year: a channel that funds full creative freedom.', 'Principles: default to action, protect mornings, strength before conditioning, buy time not things. Nova reads this file before every decision it makes on your behalf.'],
    links: ['Weekly review · wk27', 'Science video — hooks'] },
];

export const basePlan = [
  { name: 'Barbell bench press', scheme: '4 × 6 · 82.5 kg', pr: true },
  { name: 'Incline DB press', scheme: '3 × 10 · 28 kg', pr: false },
  { name: 'Seated shoulder press', scheme: '3 × 8 · 50 kg', pr: false },
  { name: 'Cable fly', scheme: '3 × 12 · 15 kg', pr: false },
  { name: 'Lateral raise', scheme: '4 × 15 · 10 kg', pr: false },
  { name: 'Triceps rope pushdown', scheme: '3 × 12 · 32 kg', pr: false },
];

export const reviews = [
  { c: 'Leucine threshold — ~3 g per meal is the lever', f: 'Huberman — protein timing', id: 'n1' },
  { c: 'Identity votes: systems beat goals', f: 'Atomic Habits — key ideas', id: 'n2' },
  { c: 'Same wake time anchors your rhythm', f: 'Diary of a CEO — sleep', id: 'n5' },
  { c: 'Protect mornings. Default to action.', f: 'About Hayden', id: 'n6' },
  { c: 'Good days follow 7h+ sleep', f: 'Weekly review · wk27', id: 'n4' },
];

export const galaxyNamed = [
  ['About Hayden', 'note', 'Identity layer — read before every agent decision.', 'n6'],
  ['Huberman — protein timing', 'podcast', 'Podcast note · linked to 4 recipes.', 'n1'],
  ['Burrito bowl', 'recipe', '52P · 640 kcal · today’s lunch.', 'r1'],
  ['Push day · wk6', 'training', '6 lifts · bench PR watch.', 'workouts'],
  ['Science video — hooks', 'idea', 'Cold-open drafted by Studio.', 'n3'],
  ['Weekly review · wk27', 'note', 'Wins, misses, energy patterns.', 'n4'],
  ['Claude Code', 'agent', 'Sessions auto-logged to the vault.', 'code'],
  ['Coach', 'agent', 'Owns training + recovery.', 'workouts'],
  ['Atomic Habits', 'note', 'Systems beat goals.', 'n2'],
  ['Diary of a CEO — sleep', 'podcast', 'Regularity beats duration.', 'n5'],
  ['Turkey chili', 'recipe', 'Batch ×4 · freezer stocked.', 'r6'],
  ['Protein oats', 'recipe', '38P breakfast staple.', 'r4'],
];

export const galaxyLinks = [[0, 1], [0, 3], [0, 5], [1, 2], [1, 11], [1, 4], [3, 7], [3, 5], [4, 8], [4, 6], [5, 8], [2, 10], [9, 5], [6, 0]];

export const weekData = [['MON', 'Run', 'skip'], ['TUE', 'Push', 'today'], ['WED', 'Zone-2', 'plan'], ['THU', 'Rest', 'plan'], ['FRI', 'Pull', 'plan'], ['SAT', 'Run', 'plan'], ['SUN', 'Rest', 'plan']];
