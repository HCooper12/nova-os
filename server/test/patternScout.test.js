// Pattern scout — usage aggregation, prompt contract, proposal
// normalization, and the skill-backlog filer + undo on the rails.
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-scout-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-scout-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { buildScoutContext, buildScoutPrompt, normalizeScoutProposals } = await import('../lib/patternScout.js');
const { addBacklogItem, removeBacklogItem, parseBacklog, parseSkills, SKILLS_REL } = await import('../lib/skills.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');
const { createRecord } = await import('../lib/inboxStore.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('scout context aggregates his captures with fates, keeps agent drafts separate', async () => {
  const mk = (over) => createRecord({
    id: Math.random().toString(36).slice(2, 10), text: 'x', source: 'text', mode: 'auto-high',
    createdAt: new Date().toISOString(), status: 'filed', ...over,
  });
  await mk({ text: 'creatine taken', decision: { route: 'food', title: 'Creatine', confidence: 'high', payload: {} } });
  await mk({ text: 'creatine taken again', decision: { route: 'food', title: 'Creatine again', confidence: 'high', payload: {} } });
  await mk({ text: 'a thought', status: 'discarded', decision: { route: 'note', title: 'A thought', confidence: 'low', payload: {} } });
  await mk({ kind: 'review', source: 'nova', status: 'discarded', text: 'Daily Review — x' });
  // a scout proposal he declined last month, with his reason
  await mk({ kind: 'pattern', source: 'scout', status: 'discarded', discardedAt: new Date().toISOString(), declineReason: 'I stopped taking it', text: 'x', decision: { route: 'preference', title: 'Standing: log creatine daily', confidence: 'high', payload: {} } });

  const ctx = await buildScoutContext(vault);
  assert.match(ctx, /SCOUT PROPOSALS HE SAID NO TO[\s\S]*- Standing: log creatine daily — his reason: "I stopped taking it"/, 'the model is told what he declined');
  assert.match(ctx, /HIS CAPTURES, LAST 30 DAYS \(3 total\)/); // the review draft is NOT a capture
  assert.match(ctx, /food ×2 \(2 filed, 0 discarded\)/);
  assert.match(ctx, /note ×1 \(0 filed, 1 discarded\)/);
  assert.match(ctx, /AGENT DRAFTS HE DISCARDED.*review ×1/);
  assert.match(ctx, /\[food\] Creatine/);
});

test('prompt: high bar, zero-is-normal, typed JSON', () => {
  const p = buildScoutPrompt('HIS CAPTURES: food ×9.');
  assert.ok(p.startsWith('NOVA OPERATING LENS'));
  assert.match(p, /ZERO is the normal, expected answer/);
  assert.match(p, /Never re-propose/);
  assert.match(p, /"proposals"/);
  assert.match(p, /food ×9/);
});

test('normalize: caps at 2, drops junk types and empty texts', () => {
  const out = normalizeScoutProposals({ proposals: [
    { type: 'standing-rule', text: '  Always log creatine silently  ', why: 'seen 9×' },
    { type: 'exploit', text: 'rm -rf', why: 'nope' },
    { type: 'skill-backlog', text: '', why: 'empty' },
    { type: 'skill-backlog', text: 'Recurring supplement logging', why: 'seen 9×' },
    { type: 'standing-rule', text: 'A third that must drop', why: 'over cap' },
  ] });
  assert.equal(out.length, 2);
  assert.equal(out[0].text, 'Always log creatine silently');
  assert.equal(out[1].type, 'skill-backlog');
  assert.deepEqual(normalizeScoutProposals({}), []);
});

test('backlog: add is deduped and invisible to skillsContext; remove restores', async () => {
  await addBacklogItem(vault, 'Recurring supplement logging');
  const raw = await readFile(path.join(vault, SKILLS_REL), 'utf8');
  assert.match(raw, /## Backlog/);
  assert.equal(parseBacklog(raw).length, 1);
  // an unbuilt skill must never read as a capability
  const departments = parseSkills(raw);
  assert.ok(!departments.some((d) => d.name === 'Backlog'));
  await assert.rejects(() => addBacklogItem(vault, 'recurring supplement LOGGING'), /already on the backlog/);
});

test('the skill-backlog route files to the registry and undoes cleanly', async () => {
  const decision = { route: 'skill-backlog', confidence: 'high', title: 'Backlog: auto-log the gym commute', reason: 'seen weekly', payload: { text: 'Auto-log the gym commute walk' } };
  const { destination, undo } = await fileDecision(vault, decision);
  assert.match(destination, /Backlog: Auto-log the gym commute walk/);
  let raw = await readFile(path.join(vault, SKILLS_REL), 'utf8');
  assert.match(raw, /Auto-log the gym commute walk/);

  const note = await undoFiling(vault, undo);
  assert.match(note, /removed the backlog entry/);
  raw = await readFile(path.join(vault, SKILLS_REL), 'utf8');
  assert.ok(!raw.includes('Auto-log the gym commute walk'));
  // the other backlog entry from the previous test survives untouched
  assert.match(raw, /Recurring supplement logging/);
});

// ---- [28] plan 2: his stated reasons ride the discard signal ----
test('discarded agent drafts are grouped with the reasons he gave, most common first', async () => {
  const mk = (over) => createRecord({ id: Math.random().toString(36).slice(2, 10), text: 'x', source: 'text', mode: 'auto-high', createdAt: new Date().toISOString(), status: 'filed', ...over });
  for (let i = 0; i < 3; i++) await mk({ kind: 'coach', source: 'coach', status: 'discarded', discardedAt: new Date().toISOString(), declineReason: 'Too aggressive', text: `c${i}`, decision: { route: 'progression-tune', title: `Tune ${i}`, confidence: 'high', payload: {} } });
  await mk({ kind: 'coach', source: 'coach', status: 'discarded', discardedAt: new Date().toISOString(), declineReason: 'Not now', text: 'c9', decision: { route: 'progression-tune', title: 'Tune 9', confidence: 'high', payload: {} } });
  await mk({ kind: 'coach', source: 'coach', status: 'discarded', discardedAt: new Date().toISOString(), text: 'c10', decision: { route: 'progression-tune', title: 'Tune 10', confidence: 'high', payload: {} } });
  const ctx = await buildScoutContext(vault);
  assert.match(ctx, /coach ×5 — "Too aggressive" ×3, "Not now" ×1/);
  assert.match(ctx, /where he said why, aim at that/);
});
