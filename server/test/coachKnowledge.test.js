// The knowledge base's contract: seeds once, reads into context, learns
// only through the rails, undoes exactly.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-knowledge-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';
const { ensureSeeded, knowledgeContext, appendLearning, removeLearning } = await import('../lib/coachKnowledge.js');

test.after(async () => { await rm(vault, { recursive: true, force: true }); });

test('seeds both pages once and reads them into context', async () => {
  await ensureSeeded(vault);
  const principles = await readFile(path.join(vault, 'Wiki/Health/Coaching Principles.md'), 'utf8');
  assert.match(principles, /10–20 hard sets/);
  assert.match(principles, /1\.6–2\.2 g\/kg/);
  const ctx = await knowledgeContext(vault);
  assert.match(ctx, /YOUR COACHING PRINCIPLES/);
  assert.match(ctx, /WHAT WORKS FOR HAYDEN/);
  assert.match(ctx, /PROPOSE a learn/);
});

test('a learning lands under its section, dated; undo removes exactly that line', async () => {
  const { line, kind } = await appendLearning(vault, { insight: 'responds fast to rep-range changes on pressing', kind: 'works' });
  assert.equal(kind, 'works');
  assert.match(line, /^- \d{4}-\d{2}-\d{2} — responds fast/);
  const page = await readFile(path.join(vault, 'Wiki/Health/What Works For Hayden.md'), 'utf8');
  const worksSection = page.split('## Responds to')[1].split('##')[0];
  assert.ok(worksSection.includes('responds fast to rep-range changes'), 'landed under the right heading');
  const r = await removeLearning(vault, line);
  assert.equal(r.removed, true);
  const after = await readFile(path.join(vault, 'Wiki/Health/What Works For Hayden.md'), 'utf8');
  assert.ok(!after.includes('responds fast to rep-range changes'));
  assert.equal((await removeLearning(vault, line)).removed, false, 'second undo is honest');
});

test('unknown kind falls back to works; short insights are refused upstream (validate)', async () => {
  const { kind } = await appendLearning(vault, { insight: 'evening sessions beat morning ones for him', kind: 'nonsense' });
  assert.equal(kind, 'works');
});
