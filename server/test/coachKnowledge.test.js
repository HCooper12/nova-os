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

test('normalizeReflection: clamps, validates kinds, honours silence', async () => {
  const { normalizeReflection } = await import('../lib/coachReflection.js');
  // sloppy model output → safe reflection
  const r = normalizeReflection({
    learnings: [
      { insight: 'evening sessions consistently outperform morning ones', kind: 'works', reason: 'volume +12% across 4 evening sessions' },
      { insight: 'short', kind: 'works' },                          // too short — dropped
      { insight: 'high-rep leg work gets cut short repeatedly', kind: 'bogus' }, // kind falls back
      { insight: 'a', kind: 'works' },
      { insight: 'protein lands only when lunch is pre-planned the night before', kind: 'nutrition' },
      { insight: 'one too many — beyond the cap', kind: 'works' },
    ],
    outreach: '  Your pull volume dropped 30% this week while notes say "felt easy" — those two things cannot both be true. Worth ten minutes tomorrow.  ',
    quiet_reason: '',
  });
  assert.equal(r.learnings.length, 3, 'capped at 3, invalid dropped');
  assert.equal(r.learnings[1].kind, 'works', 'unknown kind falls back');
  assert.match(r.outreach, /cannot both be true/);
  // silence is first-class
  const quiet = normalizeReflection({ learnings: [], outreach: 'too short', quiet_reason: 'steady week, nothing new to say' });
  assert.equal(quiet.outreach, null, 'sub-20-char outreach is not worth sending');
  assert.equal(quiet.learnings.length, 0);
  assert.match(quiet.quietReason, /steady week/);
  // garbage in → silent reflection out
  const junk = normalizeReflection(null);
  assert.deepEqual(junk.learnings, []);
  assert.equal(junk.outreach, null);
});
