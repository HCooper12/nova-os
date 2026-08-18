// Injury log + measurable goal targets — the two safety/direction stores the
// audit found missing, plus the Coach proposal shapes that feed them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-injury-'));
const { addInjury, listInjuries, resolveInjury, removeInjury, injuriesContext, _reset } = await import('../lib/injuryLog.js');
const { addGoalTarget, getFitnessGoals, removeGoalTarget, setFitnessGoals, goalsContext } = await import('../lib/fitnessGoals.js');
const { validateCoachEdit } = await import('../lib/coach.js');

test.after(() => rm(vault, { recursive: true, force: true }));

test('injury log: add → context shouts it, resolve → context quiets, page is real markdown', async () => {
  _reset();
  const inj = await addInjury(vault, { area: 'Left shoulder', note: 'pinches at bench lockout', severity: 'moderate' });
  const ctx = await injuriesContext(vault);
  assert.match(ctx, /Left shoulder \(moderate/);
  assert.match(ctx, /never prescribe into pain/);
  const raw = await readFile(path.join(vault, 'Wiki/Health/Injury Log.md'), 'utf8');
  assert.match(raw, /## Active/);
  assert.match(raw, /pinches at bench lockout/);
  await resolveInjury(vault, inj.id);
  assert.equal(await injuriesContext(vault), null, 'no active injuries → no context block');
  assert.equal((await listInjuries(vault)).length, 1, 'resolved entries stay as history');
  await removeInjury(vault, inj.id);
  assert.equal((await listInjuries(vault)).length, 0);
  await assert.rejects(() => removeInjury(vault, 'ghost'), /no such/);
});

test('goal targets: add via coach payload shape, survive a settings save, removable', async () => {
  await setFitnessGoals(vault, { goal: 'Lean muscle gain', daysPerWeek: 4 });
  const t = await addGoalTarget(vault, { metric: 'Bench e1RM', value: 100, unit: 'kg', by: '2026-12-01' });
  let g = await getFitnessGoals(vault);
  assert.equal(g.targets.length, 1);
  assert.match(await goalsContext(vault), /Bench e1RM → 100kg by 2026-12-01/);
  // a plain settings-form save must not wipe targets it didn't touch
  await setFitnessGoals(vault, { goal: 'Lean muscle gain', daysPerWeek: 5 });
  g = await getFitnessGoals(vault);
  assert.equal(g.targets.length, 1, 'targets survived the goal edit');
  await removeGoalTarget(vault, t.id);
  assert.equal((await getFitnessGoals(vault)).targets.length, 0);
});

test('coach proposals: injury and goal validate into typed payloads; junk refused', async () => {
  const inj = await validateCoachEdit(vault, { action: 'injury', area: 'Right knee', note: 'ache on leg press', severity: 'niggle' });
  assert.equal(inj.payload.action, 'injury');
  assert.match(inj.title, /Right knee niggle/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'injury', note: 'no area' }), /affected area/);

  const goal = await validateCoachEdit(vault, { action: 'goal', metric: 'Weekly sets — Back', value: 16, by: '2026-10-01' });
  assert.match(goal.title, /Weekly sets — Back 16 by 2026-10-01/);
  await assert.rejects(() => validateCoachEdit(vault, { action: 'goal', metric: 'x' }), /numeric value/);
});
