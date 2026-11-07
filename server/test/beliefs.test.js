import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Set before import: the state file, the inbox rails and the ask file all live in NOVA_DATA_DIR.
process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-beliefs-data-'));
const { runVerb, undoVerb } = await import('../lib/verbs.js'); // first: verbs and verbJobs import each other
const B = await import('../lib/beliefs.js');
const { knowledgeContext, PLAYBOOK_REL } = await import('../lib/coachKnowledge.js');
const { addInjury, listInjuries, resolveInjury, _reset: resetInjuries } = await import('../lib/injuryLog.js');
const { STANDING_REL } = await import('../lib/standing.js');

let vault;
const NOW = new Date('2026-11-07T10:00:00');
const WORKS = `# What Works For Hayden

The Coach's client file.

## Responds to
- 2026-10-08 — You skip the last exercises of a session when time runs short
- 2026-10-31 — Top sets of 6 to 8 on compounds hold his progress

## Avoid / does not land

## Nutrition patterns
- 2026-10-25 — Your protein falls away when the week loses structure

## Decisions log
- 2026-10-16 — Core split replaces Push, Pull, Legs
- 2026-10-20 — Keep Push, Pull, Legs volume as the base
- 2026-11-01 — Shoulder pain limits overhead pressing
`;
const STANDING = `# Standing Instructions

Rules.

- Never schedule training before 7am _(added 2026-08-01 via voice)_
- Keep answers short _(added 2026-10-30 via voice)_
`;

before(async () => {
  vault = await mkdtemp(path.join(tmpdir(), 'nova-beliefs-vault-'));
  await mkdir(path.join(vault, 'Wiki/Health'), { recursive: true });
  await mkdir(path.join(vault, 'Wiki/Library'), { recursive: true });
  await writeFile(path.join(vault, PLAYBOOK_REL), WORKS, 'utf8');
  await writeFile(path.join(vault, STANDING_REL), STANDING, 'utf8');
  resetInjuries();
});

const rows = (view) => view.groups.flatMap((g) => g.items);
const find = (view, frag) => rows(view).find((r) => r.text.includes(frag));

test('the age table has a reason for every kind, and lasting facts never age', () => {
  for (const [kind, rule] of Object.entries(B.KIND_TABLE)) assert.ok(rule.why && rule.label, kind);
  assert.equal(B.KIND_TABLE['session-pattern'].days, 14);
  assert.equal(B.KIND_TABLE['fuel-pattern'].days, 14);
  assert.equal(B.KIND_TABLE.injury.days, 14);
  assert.equal(B.KIND_TABLE['temporary-state'].days, 14);
  assert.equal(B.KIND_TABLE.decision.days, 60);
  assert.equal(B.KIND_TABLE['standing-rule'].days, 60);
  assert.equal(B.KIND_TABLE['lasting-fact'].days, null);
});

test('a session pattern 30 days old is worth checking; a fresh one is not', async () => {
  const v = await B.loadBeliefs(vault, { now: NOW });
  const old = find(v, 'skip the last exercises');
  assert.equal(old.check, true);
  assert.match(old.from, /^Coach, 8 Oct · 30 days old$/);
  assert.equal(find(v, 'Top sets of 6 to 8').check, false);
  assert.equal(v.groups[0].key, 'check', 'Worth checking leads');
  assert.equal(v.groups[0].items.length, v.worthChecking);
});

test('decisions and standing rules wait 60 days, not 14', async () => {
  const v = await B.loadBeliefs(vault, { now: NOW });
  assert.equal(find(v, 'Never schedule training before 7am').check, true, '98 days old');
  assert.equal(find(v, 'Keep answers short').check, false, '8 days old');
  const d = await B.loadBeliefs(vault, { now: new Date('2026-11-20T10:00:00') });
  assert.equal(find(d, 'Keep answers short').check, false, '21 days: a rule is not a session habit');
});

test('a line naming a retired thing is worth checking at once, but the record of retiring it is not', async () => {
  const v = await B.loadBeliefs(vault, { now: NOW });
  const named = find(v, 'Keep Push, Pull, Legs volume');
  assert.equal(named.check, true);
  assert.match(named.reason, /Push, Pull, Legs split, which you retired/);
  assert.equal(find(v, 'Core split replaces').check, false);
});

test('a resolved injury makes a line that still worries about it worth checking at once', async () => {
  const i = await addInjury(vault, { area: 'Shoulder', note: 'pinch overhead', severity: 'moderate' });
  await resolveInjury(vault, i.id);
  const today = new Date();
  const v = await B.loadBeliefs(vault, { now: today });
  const row = find(v, 'Shoulder pain limits overhead pressing');
  assert.equal(row.check, true);
  assert.match(row.reason, /names your Shoulder, which you closed on/);
  // the closure itself is a row, and a cross on it reopens the injury
  const closedRow = find(v, 'Shoulder is over');
  assert.ok(closedRow?.canCross);
});

test('a tick stamps today and resets the clock', async () => {
  const before = find(await B.loadBeliefs(vault, { now: NOW }), 'skip the last exercises');
  assert.equal(before.check, true);
  await B.confirmBelief(vault, before.id, { now: NOW });
  const after = find(await B.loadBeliefs(vault, { now: NOW }), 'skip the last exercises');
  assert.equal(after.check, false);
  assert.equal(after.confirmedAt, '2026-11-07');
  // and it comes round again a fortnight later
  const later = find(await B.loadBeliefs(vault, { now: new Date('2026-11-22T10:00:00') }), 'skip the last exercises');
  assert.equal(later.check, true);
});

test('an id is stable across reads and differs by source', async () => {
  const a = find(await B.loadBeliefs(vault, { now: NOW }), 'Top sets of 6 to 8');
  const b = find(await B.loadBeliefs(vault, { now: NOW }), 'Top sets of 6 to 8');
  assert.equal(a.id, b.id);
  assert.notEqual(B.beliefId('works', 'x'), B.beliefId('standing', 'x'));
});

test('a cross on a What Works line strikes it, agents stop reading it, and Undo is byte-identical', async () => {
  const pagePath = path.join(vault, PLAYBOOK_REL);
  const original = await readFile(pagePath, 'utf8');
  const row = find(await B.loadBeliefs(vault, { now: NOW }), 'Top sets of 6 to 8');
  assert.ok(String(await knowledgeContext(vault)).includes('Top sets of 6 to 8'));
  const out = await runVerb(vault, 'x', { verb: 'belief.drop', args: { id: row.id } }, { direct: true });
  assert.ok(out.acted.undoable);
  assert.match(out.acted.said, /Struck that from What Works/);
  const struck = await readFile(pagePath, 'utf8');
  assert.match(struck, /## Struck \(no longer true\)/);
  assert.match(struck, /~~2026-10-31 — Top sets of 6 to 8 on compounds hold his progress~~/, 'the line is kept, word for word');
  assert.ok(!(await knowledgeContext(vault)).includes('Top sets of 6 to 8'), 'the Coach no longer reads it');
  assert.equal(find(await B.loadBeliefs(vault, { now: NOW }), 'Top sets of 6 to 8'), undefined, 'and it leaves the page');
  // the undo goes through the inbox record's own undoData
  const { listRecords } = await import('../lib/inboxStore.js');
  const rec = (await listRecords()).find((r) => r.id === out.acted.recordId);
  await undoVerb(vault, { verb: 'belief.drop', ...rec.undoData });
  assert.equal(await readFile(pagePath, 'utf8'), original, 'identity round-trip');
});

test('striking a second line adds to the Struck section, and both undo in turn', async () => {
  const pagePath = path.join(vault, PLAYBOOK_REL);
  const original = await readFile(pagePath, 'utf8');
  const v = await B.loadBeliefs(vault, { now: NOW });
  const a = await B.dropBelief(vault, find(v, 'Top sets of 6 to 8').id);
  const b = await B.dropBelief(vault, find(await B.loadBeliefs(vault, { now: NOW }), 'protein falls away').id);
  await B.undoDrop(vault, b.undo);
  await B.undoDrop(vault, a.undo);
  assert.equal(await readFile(pagePath, 'utf8'), original);
});

test('a cross on a standing rule lifts it and Undo puts the same line back in the same place', async () => {
  const pagePath = path.join(vault, STANDING_REL);
  const original = await readFile(pagePath, 'utf8');
  const row = find(await B.loadBeliefs(vault, { now: NOW }), 'Never schedule training before 7am');
  const out = await B.dropBelief(vault, row.id);
  assert.ok(!(await readFile(pagePath, 'utf8')).includes('before 7am'));
  await B.undoDrop(vault, out.undo);
  assert.equal(await readFile(pagePath, 'utf8'), original);
});

test('a cross on an active injury closes it through the log, and Undo reopens it', async () => {
  const j = await addInjury(vault, { area: 'Knee', note: 'twinge on stairs', severity: 'niggle' });
  const row = find(await B.loadBeliefs(vault, { now: NOW }), 'Knee');
  assert.ok(row.canCross);
  const out = await B.dropBelief(vault, row.id);
  assert.match(out.said, /Closed Knee in your Injury Log/);
  assert.ok((await listInjuries(vault)).find((x) => x.id === j.id).resolvedAt);
  await B.undoDrop(vault, out.undo);
  assert.equal((await listInjuries(vault)).find((x) => x.id === j.id).resolvedAt, undefined);
});

test('a cross on a closed injury reopens it, and Undo closes it again on the same day', async () => {
  const closedRow = find(await B.loadBeliefs(vault, { now: new Date() }), 'Shoulder is over');
  const was = (await listInjuries(vault)).find((x) => x.area === 'Shoulder').resolvedAt;
  const out = await B.dropBelief(vault, closedRow.id);
  assert.equal((await listInjuries(vault)).find((x) => x.area === 'Shoulder').resolvedAt, undefined);
  await B.undoDrop(vault, out.undo);
  assert.equal((await listInjuries(vault)).find((x) => x.area === 'Shoulder').resolvedAt, was);
});

test('a derived figure never takes a cross: it says where to change it', async () => {
  const { setIntake } = await import('../lib/profile.js');
  await setIntake(vault, { on: '2026-10-18', facts: { goal: 'maintain', weightKg: 80 }, plan: { targetKcal: 2600, proteinG: 160, fatG: 70, carbsG: 300, tdee: 2600 } });
  const v = await B.loadBeliefs(vault, { now: NOW });
  const t = find(v, 'Targets of 2600 kcal and 160 g protein a day');
  assert.ok(t, 'the Intake targets are read from the Profile');
  assert.equal(t.canCross, false);
  assert.equal(t.editor, 'numbers');
  await assert.rejects(() => B.dropBelief(vault, t.id), /worked out from your data/);
});

test('the Home card shows only when something is worth checking, and is quiet for 7 days once tapped', async () => {
  const shown = await B.beliefsHome(vault, { now: NOW });
  assert.equal(shown.show, true);
  assert.equal(shown.count, (await B.loadBeliefs(vault, { now: NOW })).worthChecking);
  await B.quietHome({ now: NOW });
  assert.equal((await B.beliefsHome(vault, { now: new Date('2026-11-13T10:00:00') })).show, false, 'day 6');
  assert.equal((await B.beliefsHome(vault, { now: new Date('2026-11-14T11:00:00') })).show, true, 'after 7 days');
});

test('the Home card stays hidden when nothing is worth checking', async () => {
  const fresh = await mkdtemp(path.join(tmpdir(), 'nova-beliefs-empty-'));
  const h = await B.beliefsHome(fresh, { now: NOW });
  assert.equal(h.show, false);
});

test('the cross verb is hidden from the model catalogue', async () => {
  const { describeForModel, VERB_IDS } = await import('../lib/verbs.js');
  assert.ok(VERB_IDS.includes('belief.drop'));
  assert.ok(!describeForModel().includes('belief.drop'));
});
