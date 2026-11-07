// THE LANES THAT LACKED HIM (second-brain audit #5). Temp data and vault first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'nova-profile-facts-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');
process.env.CLAUDE_BIN = '/nonexistent/claude-must-not-run';
const vault = path.join(root, 'vault');
await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });
await mkdir(path.join(vault, 'Wiki'), { recursive: true });

const { refusedFoods, refusedIn, fuelFacts, goalsBlock } = await import('../lib/profileFacts.js');
const { profileContext } = await import('../lib/profile.js');
const { buildRefinePrompt } = await import('../lib/foodRefine.js');
const { buildDistillPrompt } = await import('../lib/distill.js');
const { whatFits } = await import('../lib/eatOut.js');
const { PROFILE_READERS } = await import('../lib/profileReach.js');

test.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));

// his Fuel section, word for word
const PROFILE = `# Profile

## What I'm working toward

Right now: a V-taper (shoulders, arms, back), with the arms grown as fast as possible.
- In three years he wants to be inspiring and leading people. (said 2026-10-26)

## Training

Four sessions a week in a full commercial gym.

## Fuel

On a cut. No stated allergies or eating rules.
- Drinks his coffee black. (said 2026-10-26)
- Doesn't mind cooking, but would rather reduce the time it takes him to cook. (said 2026-10-26)
- Won't eat Vegemite or possibly Brussels sprouts; those are the only foods he'd refuse. (said 2026-10-26)
`;
await writeFile(path.join(vault, 'Wiki/Profile.md'), PROFILE, 'utf8');

test('his own sentence names what he will not eat, and code reads it', async () => {
  const fuel = await profileContext(vault, { only: ['fuel'] });
  assert.deepEqual(refusedFoods(fuel), ['vegemite', 'brussels sprouts']);
  assert.deepEqual(refusedFoods('Eats anything. Loves sprouts.'), []);
  assert.deepEqual(refusedFoods(''), []);
});

test('a refused food is matched as a word, in any spelling of the plural', () => {
  const refused = ['vegemite', 'brussels sprouts'];
  assert.equal(refusedIn('Vegemite toast', refused), 'vegemite');
  assert.equal(refusedIn('Roast Brussels Sprout salad', refused), 'brussels sprouts');
  assert.equal(refusedIn('Chicken and rice', refused), null);
  assert.equal(refusedIn('hamburger', ['ham']), null);
});

test('a lane that estimates food gets his own lines, in a sentence or two', async () => {
  const facts = fuelFacts(await profileContext(vault, { only: ['fuel'] }));
  assert.match(facts, /Drinks his coffee black/);
  assert.ok(facts.length <= 320);
  const p = buildRefinePrompt({ name: 'Coffee', lines: [{ name: 'Coffee', macros: { p: 1, c: 1, f: 1 } }], correction: 'it was large', him: facts });
  assert.match(p, /What he has said about how he eats: .*coffee black/);
  assert.doesNotMatch(buildRefinePrompt({ name: 'x', lines: [], correction: 'y' }), /how he eats/);
});

test('the lanes that mint pages get his goals, which steer what earns a page and never what a source said', async () => {
  const goals = goalsBlock(await profileContext(vault, { only: ['toward', 'training'] }));
  assert.match(goals, /V-taper/);
  assert.match(goals, /never to change what a source says/);
  assert.doesNotMatch(goals, /Nova knows/);
  assert.ok(goals.length < 1200);
  assert.equal(goalsBlock(''), '');
  const p = buildDistillPrompt([{ relPath: 'Wiki/Inbox/x.md' }], { goals });
  assert.ok(p.startsWith('WHO THIS VAULT SERVES'));
  assert.doesNotMatch(buildDistillPrompt([{ relPath: 'Wiki/Inbox/x.md' }]), /WHO THIS VAULT SERVES/);
});

test('the takeaway finder never offers what he will not eat', () => {
  const macros = { kcal: 300, p: 20, c: 30, f: 10 };
  const catalogue = { brands: { a: { key: 'a', kind: 'chain', items: [{ name: 'Vegemite Scroll', macros }, { name: 'Chicken Wrap', macros }] } } };
  const names = (q) => whatFits(catalogue, { kcal: 500, ...q }).items.map((i) => i.name);
  assert.deepEqual(names({}).sort(), ['Chicken Wrap', 'Vegemite Scroll']);
  assert.deepEqual(names({ refused: ['vegemite'] }), ['Chicken Wrap']);
});

test('his meal prep flags a recipe he said he will not eat, by name or by ingredient', async () => {
  const { refusedInPlan } = await import('../lib/mealPrep.js');
  const plan = [
    { name: 'Vegemite Toast', ingredients: ['2 slices bread'] },
    { name: 'Roast Veg', ingredients: [{ qty: '200g', name: 'Brussels sprouts' }, 'Olive oil'] },
    { name: 'Chicken Wrap', ingredients: ['1 wrap'] },
  ];
  assert.deepEqual(refusedInPlan(plan, ['vegemite', 'brussels sprouts']), [
    { recipe: 'Vegemite Toast', food: 'vegemite' },
    { recipe: 'Roast Veg', food: 'brussels sprouts' },
  ]);
  assert.deepEqual(refusedInPlan(plan, []), []);
});

test('every new reader is on the list he can see', () => {
  for (const id of ['meal-prep', 'food-suggest', 'eat-out', 'food-refine', 'ingest', 'distill']) {
    assert.ok(PROFILE_READERS.some((r) => r.id === id), id);
  }
});
