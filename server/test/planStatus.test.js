// A QUESTION ABOUT THE PLAN IS ANSWERED WITH ITS STATUS, NEVER RE-FILED AS A
// CORRECTION. Pinned against his record, 1 Nov 2026 (UTC):
//   00:00:15 "Before confirming the plan, I want Coach to mock it up…"
//            → "Understood — re-planning with that. The revised plan is on its way; say yes when it is on screen."
//   00:04:52 "I still can't see the plan yet."
//            → the IDENTICAL line, and the plan re-drawn with his complaint as its instruction.
//
// No real model runs: CLAUDE_BIN is a stub, NOVA_DATA_DIR a temp dir, both set
// BEFORE import.
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-planstatus-stub-'));
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: 'not a plan' }));
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-planstatus-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';
process.env.NOVA_PLAN_POLL_MS = '40';
delete process.env.ELEVENLABS_API_KEY;
delete process.env.NOVA_TTS_LOCAL;
const vault = mkdtempSync(path.join(tmpdir(), 'nova-planstatus-vault-'));

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const express = (await import('express')).default;
const store = await import('../lib/inboxStore.js');
const { isPlanStatusQuestion, isPlanRetryRequest, planStatusLine, amendReplyLine } = await import('../lib/planFollowUp.js');
const { plainCause } = await import('../lib/plainCause.js');
const { voiceRouter } = await import('../routes/voice.js');
const { _dropAllWarm } = await import('../lib/claudeCode.js');

test.after(() => { _dropAllWarm(); });

const CANNED = 'Understood — re-planning with that. The revised plan is on its way; say yes when it is on screen.';

// HIS WORDS. Status questions, then his real corrections (which must still amend).
const STATUS = [
  "I still can't see the plan yet.",
  "I can't see it.",
  "Where's the plan?",
  'Where is it?',
  'Is it done yet?',
  'Has the plan finished?',
  'Is it still running?',
  "It's not showing on my screen",
  'Nothing has come up',
  'Any update?',
  "What's the status?",
  'How much longer?',
  'Are you still working on it?',
];
const CORRECTIONS = [
  "Before confirming the plan, I want Coach to mock it up and show me again visually what it would look like for each workout, as well as how many sets per week would be targeted and hit for each exercise, just so I know that everything's been planned correctly.",
  "The coach agent should be able to analyse and pull my current workout information? So don't say no agents are capable of doing that",
  "I like the idea of the four-day split, so let's try and work that in.",
  'Update the plan to include a leg day',
  "I don't see the side delts in it, add them",
  'How long would each workout take?',
  'Where is the leg day in this?',
  'yes',
];

test('a status question is told apart from a correction, on his own words', () => {
  for (const t of STATUS) assert.equal(isPlanStatusQuestion(t), true, `"${t}" asks where the plan is`);
  for (const t of CORRECTIONS) assert.equal(isPlanStatusQuestion(t), false, `"${t}" is not a status question`);
  for (const t of ['retry', 'Try again', 'run the failed step again', 'okay retry please', 'Try it again, Nova']) assert.equal(isPlanRetryRequest(t), true, t);
  for (const t of ['retry the whole program with five days', 'try a five day split again later', 'yes']) assert.equal(isPlanRetryRequest(t), false, t);
});

const NOW = Date.parse('2026-11-01T00:04:52Z');
const step = (id, capability, status, extra = {}) => ({ id, capability, what: `${capability} step`, needs: [], status, ...extra });

test('the status line reads the record, phase by phase, and names a failure in plain words', () => {
  const base = { kind: 'plan', planOk: true, goal: 'Rebuild the program', createdAt: '2026-11-01T00:00:15Z' };
  const planning = planStatusLine({ ...base, status: 'classifying', plan: null }, { now: NOW });
  assert.match(planning, /still being drawn/);
  assert.match(planning, /5 minutes ago/);
  const proposed = planStatusLine({ ...base, status: 'pending', plan: { steps: [step('s1', 'program', 'waiting'), step('s2', 'coach', 'waiting'), step('s3', 'build', 'waiting')] } }, { now: NOW });
  assert.match(proposed, /ready/);
  assert.match(proposed, /3 steps/);
  assert.match(proposed, /Nothing runs until you say yes/);
  const running = planStatusLine({ ...base, status: 'classifying', startedAt: '2026-11-01T00:01:00Z', plan: { steps: [step('s1', 'program', 'done'), step('s2', 'coach', 'running'), step('s3', 'build', 'waiting')] } }, { now: NOW });
  assert.match(running, /1 of 3 steps done/);
  assert.match(running, /Coach is working now/);
  const finished = planStatusLine({ ...base, status: 'pending', finishedAt: '2026-11-01T00:02:52Z', plan: { steps: [step('s1', 'program', 'done'), step('s3', 'build', 'failed', { error: 'Claude\'s usage limit is reached' })] } }, { now: NOW, cause: plainCause });
  assert.match(finished, /finished 2 minutes ago/);
  assert.match(finished, /Builder failed: Claude's usage limit is used up for now/);
  assert.match(finished, /Say retry/);
  const failed = planStatusLine({ ...base, status: 'error', error: 'connect ECONNREFUSED 127.0.0.1:443' }, { now: NOW, cause: plainCause });
  assert.match(failed, /The plan stopped, sir: The Mac couldn't reach the internet/);
  for (const line of [planning, proposed, running, finished, failed]) assert.notEqual(line, CANNED);
});

test('a second correction never hears the first correction\'s line', () => {
  assert.equal(amendReplyLine(0), CANNED);
  assert.notEqual(amendReplyLine(1), amendReplyLine(0));
  assert.notEqual(amendReplyLine(2), amendReplyLine(1));
});

function serve() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', voiceRouter(vault));
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}
const post = async (server, body) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return JSON.parse((await res.text()).trim());
};

test('/api/ask: "I still can\'t see the plan yet" gets the plan\'s status and re-shows it; nothing is re-planned', async () => {
  const now = new Date().toISOString();
  const plan = await store.createRecord({
    id: 'p-proposed', kind: 'plan', status: 'pending', planOk: true, source: 'planner', mode: 'draft', createdAt: now,
    goal: 'Rebuild the program as the 4-day layout', amends: 'p-first',
    plan: { steps: [step('s1', 'program', 'waiting'), step('s2', 'coach', 'waiting', { needs: ['s1'] })] },
    decision: { title: 'Plan: Rebuild the program', body: '1. Program dossier\n2. Coach' },
  });
  const server = await serve();
  try {
    const before = (await store.listRecords()).filter((r) => r.kind === 'plan').length;
    const r = await post(server, { question: "I still can't see the plan yet.", raw: "I still can't see the plan yet." });
    assert.notEqual(r.text, CANNED, 'never the canned re-plan line');
    assert.match(r.text, /ready/);
    assert.deepEqual(r.plan, { recordId: plan.id, status: 'proposed', show: true });
    const after = await store.listRecords();
    assert.equal(after.filter((x) => x.kind === 'plan').length, before, 'no new plan was drawn from his complaint');
    assert.equal((await store.getRecord(plan.id)).status, 'pending', 'the plan he was waiting for is untouched');

    // a REAL correction still amends, and says it is the second change
    const c = await post(server, { question: 'Update the plan to include a leg day', raw: 'Update the plan to include a leg day' });
    assert.equal(c.plan.replaces, plan.id);
    assert.match(c.text, /change 2/);
    assert.notEqual(c.text, CANNED);
  } finally {
    server.close();
  }
});

test('/api/ask: a status question while the plan is being drawn says so, and a failed step is retried on "retry"', async () => {
  const now = Date.now();
  const drawing = await store.createRecord({
    id: 'p-drawing', kind: 'plan', status: 'classifying', source: 'planner', mode: 'draft',
    createdAt: new Date(now + 1000).toISOString(), goal: 'Mock up the program',
  });
  const server = await serve();
  try {
    const r = await post(server, { question: 'Where is it?', raw: 'Where is it?' });
    assert.match(r.text, /still being drawn/);
    assert.equal(r.plan.recordId, drawing.id);
    await store.updateRecord(drawing.id, { status: 'discarded' });

    const finished = await store.createRecord({
      id: 'p-finished', kind: 'plan', status: 'pending', planOk: true, source: 'planner', mode: 'draft',
      createdAt: new Date(now + 2000).toISOString(), finishedAt: new Date(now + 3000).toISOString(), goal: 'Mock up the program',
      plan: { steps: [step('s1', 'coach', 'done', { output: 'the review', recordId: 'c1' }), step('s2', 'build', 'failed', { error: 'the record vanished', recordId: 'job123' })] },
      decision: { route: 'note', payload: { body: 'The report.' } },
    });
    const s = await post(server, { question: 'Is it done?', raw: 'Is it done?' });
    assert.match(s.text, /finished/);
    assert.match(s.text, /Builder failed/);
    assert.match(s.text, /Say retry/);
    const again = await post(server, { question: 'retry', raw: 'retry' });
    assert.match(again.text, /Running the Builder step again/);
    assert.deepEqual(again.plan, { recordId: finished.id, status: 'running', run: true });
    const rec = await store.getRecord(finished.id);
    assert.equal(rec.plan.steps[0].status, 'done', 'the step that worked is carried');
    assert.notEqual(rec.plan.steps[1].recordId, 'job123', 'the failed step was reset and dispatched again');
  } finally {
    server.close();
  }
});

test('/api/ask: "retry" still reaches a plan whose report came back hours ago', async () => {
  const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
  const old = await store.createRecord({
    id: 'p-hours', kind: 'plan', status: 'pending', planOk: true, source: 'planner', mode: 'draft',
    createdAt: hoursAgo(3), approvedAt: hoursAgo(3), finishedAt: hoursAgo(2.5), goal: 'Mock up the program',
    plan: { steps: [step('s1', 'build', 'failed', { error: 'the record vanished', recordId: 'job999' })] },
    decision: { route: 'note', payload: { body: 'The report.' } },
  });
  // every newer plan from the tests above is out of the way
  for (const r of await store.listRecords()) if (r.kind === 'plan' && r.id !== old.id) await store.updateRecord(r.id, { status: 'discarded' });
  const server = await serve();
  try {
    const again = await post(server, { question: 'Try it again', raw: 'Try it again' });
    assert.match(again.text, /Running the Builder step again/);
    assert.equal(again.plan.recordId, old.id);
  } finally {
    server.close();
  }
});
