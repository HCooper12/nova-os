// STARTING AND TALKING ABOUT A PROJECT IN THE VOICE CONVERSATION (1 Nov 2026).
// The verbs are in the registry; a spoken intake comes back in the job shape
// the Voice client already polls; a filed brief is a proposal his yes
// approves through the ordinary rail; "never mind" withdraws it. CLAUDE_BIN is
// a stub (no model), every directory a temp one, set BEFORE any import.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-vproj-'));
const stubBin = path.join(base, 'claude');
// the intake's stand-in: asks one question, or writes the BRIEF line when told to
writeFileSync(stubBin, `#!/usr/bin/env node
const BRIEF = 'BRIEF {"name":"Garden shed","kind":"build","goal":"A shed for tools","done":"It stands","deadline":null,"phases":[{"name":"Plan","what":"size it","first":"measure"}],"reads":[],"allowances":{"research":true,"draft":true,"code":false,"test":false,"commit":false,"deploy":false},"limit":{"discussAbove":null,"agreed":null},"firstMoves":["Research shed kits under 2 metres"]}';
const say = (out) => {
  process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: out }] } }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: out }) + '\\n');
};
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let t = '';
  try { t = JSON.parse(line).message.content[0].text; } catch {}
  if (/WRITE THE BRIEF/.test(t)) say('I have enough. Say yes and I will make it.\\n' + BRIEF);
  else if (/FORGET IT/.test(t)) say('Fine, dropping it.\\nACT {"verb":"project.cancel","args":{}}');
  else say('How big should it be?');
});
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'Projects');
process.env.NOVA_PROTECTED_ROOTS = path.join(base, 'Atomic_Hub');
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.NOVA_VAULT_GRACE_MS = '0';
const vault = path.join(base, 'vault');
mkdirSync(vault, { recursive: true });

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const express = (await import('express')).default;
const { VERB_IDS, verbFor, describeForModel, runVerb } = await import('../lib/verbs.js');
const vi = await import('../lib/voiceIntake.js');
const { voiceRouter } = await import('../routes/voice.js');
const { getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { getRecord, listRecords } = await import('../lib/inboxStore.js');
const { approveRecord, undoRecord } = await import('../lib/inbox.js');
const { novaKernel } = await import('../lib/novaProjects.js');
const pr = await import('../lib/projectResearch.js');

test.after(() => { _dropAllWarm(); rmSync(base, { recursive: true, force: true, maxRetries: 3 }); });

const ready = async (jobId) => {
  for (let i = 0; i < 400; i++) { const j = getMessageJob(jobId); if (j && j.status !== 'running') return j; await new Promise((r) => setTimeout(r, 15)); }
  return getMessageJob(jobId);
};
function serve(t) {
  const app = express();
  app.use(express.json());
  app.use('/api', voiceRouter(vault));
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => { t.after(() => s.close()); r(s); }); });
}
const post = async (s, route, body) => (await fetch(`http://127.0.0.1:${s.address().port}/api${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

test('the registry has the four project verbs, act tier, no receipt of their own, in the model catalogue', () => {
  for (const id of ['project.start', 'project.cancel', 'project.research', 'project.watch']) {
    assert.ok(VERB_IDS.includes(id), id);
    assert.equal(verbFor(id).tier, 'act');
    assert.equal(verbFor(id).receipt, false);
    assert.ok(describeForModel().includes(`"verb":"${id}"`), id);
  }
  assert.deepEqual(Object.keys(verbFor('project.start').args), ['text']);
  assert.match(verbFor('project.watch').args.lens, /optional/);
});

test('partial text never carries the BRIEF or ACT line; the result has the Voice job shape and no session of its own', () => {
  assert.equal(vi.speakablePartial('How big?\nBRIEF {"name":"x"'), 'How big?');
  assert.equal(vi.speakablePartial('Dropping it.\nACT {"verb":"project.cancel"'), 'Dropping it.');
  assert.equal(vi.speakablePartial('Plain words.'), 'Plain words.');
  const asking = vi.adaptIntakeResult({ text: 'How big?', sessionId: 'S', stage: 'asking' }, 'S');
  assert.deepEqual(asking, { text: 'How big?', more: null, intake: { sessionId: 'S', stage: 'asking' } });
  assert.equal('sessionId' in asking, false, 'the Voice conversation keeps its own session');
  const filed = vi.adaptIntakeResult({ text: 'Ready.', stage: 'filed', recordId: 'abcd1234', brief: { name: 'Shed' } }, 'S');
  assert.deepEqual(filed.proposal, { recordId: 'abcd1234', title: 'Start Shed', route: 'project-create', projectBrief: true });
});

let intakeSid = null;
let briefId = null;
test('POST /api/ask with intakeSessionId is the intake\'s turn, polled like any Nova turn; the filed brief arrives as a proposal', async (t) => {
  const s = await serve(t);
  // project.start, as the model's ACT would run it: the intake opens with his words
  const started = await runVerb(vault, 'I want to build a garden shed', { verb: 'project.start', args: { text: 'I want to build a garden shed' } });
  assert.ok(started.acted.intake.jobId);
  intakeSid = started.acted.intake.sessionId;
  const first = await ready(started.acted.intake.jobId);
  assert.equal(first.result.text, 'How big should it be?');
  assert.equal(first.result.intake.stage, 'asking');
  // his next spoken words go to the same intake
  const turn = await post(s, '/ask', { question: 'Two by two metres. WRITE THE BRIEF', intakeSessionId: intakeSid });
  assert.ok(turn.jobId);
  assert.deepEqual(turn.intake, { sessionId: intakeSid });
  const job = await ready(turn.jobId);
  assert.equal(job.status, 'ready', job.error);
  assert.doesNotMatch(String(job.partial || ''), /BRIEF/, 'the streamed text never reads the brief line out');
  assert.match(job.result.text, /^I have enough\./);
  assert.equal(job.result.intake.stage, 'filed');
  assert.equal(job.result.proposal.route, 'project-create');
  assert.equal(job.result.proposal.title, 'Start Garden shed');
  briefId = job.result.proposal.recordId;
  const card = await getRecord(briefId);
  assert.equal(card.kind, 'project-brief');
  assert.equal(card.status, 'pending', 'also in his Inbox as the card');
  assert.equal(card.intakeSessionId, intakeSid);
});

test('his yes approves it through the ordinary rail: the same kernel record a Projects-page brief makes; undo removes it', async () => {
  const filed = await approveRecord(vault, briefId);
  assert.equal(filed.status, 'filed');
  const k = novaKernel(vault);
  const p = k.getProject(filed.undoData.id);
  assert.equal(p.name, 'Garden shed');
  assert.deepEqual(p.firstMoves, ['Research shed kits under 2 metres']);
  // the same brief through the Projects page's door (its own card, the same approve rail)
  const { fileBriefCard } = await import('../lib/projectIntake.js');
  const pageCard = await fileBriefCard({ brief: { ...(await getRecord(briefId)).decision.payload.brief, name: 'Garden shed twin' }, sessionId: null, status: 'pending' });
  const twin = k.getProject((await approveRecord(vault, pageCard.id)).undoData.id);
  const PER_PROJECT = ['id', 'slug', 'name', 'folder', 'page', 'pageHash', 'createdAt', 'updatedAt', 'commit', 'briefHash', 'dryRun', 'workspace'];
  const strip = (r) => Object.fromEntries(Object.entries(r).filter(([key]) => !PER_PROJECT.includes(key)));
  assert.match(String(p.workspace), /^p-garden-shed/);
  assert.match(String(twin.workspace), /^p-garden-shed-twin/);
  assert.deepEqual(strip(p), strip(twin));
  await undoRecord(vault, briefId);
  assert.equal(k.getProject(p.id).status, 'undone');
});

test('"never mind" mid-intake: the model\'s ACT project.cancel is validated by code, the pending card withdrawn, nothing created', async (t) => {
  const s = await serve(t);
  const started = await runVerb(vault, 'start a project for the porch', { verb: 'project.start', args: { text: 'a new porch' } });
  const sid = started.acted.intake.sessionId;
  await ready(started.acted.intake.jobId);
  const filedTurn = await post(s, '/ask', { question: 'WRITE THE BRIEF', intakeSessionId: sid });
  const filed = await ready(filedTurn.jobId);
  const cardId = filed.result.proposal.recordId;
  const before = readdirSync(process.env.NOVA_PROJECTS_DIR).length;
  const cancel = await post(s, '/ask', { question: 'FORGET IT', intakeSessionId: sid });
  const done = await ready(cancel.jobId);
  assert.equal(done.result.intake.stage, 'cancelled');
  assert.equal(done.result.text, 'Fine, dropping it.');
  assert.equal((await getRecord(cardId)).status, 'withdrawn');
  assert.equal(readdirSync(process.env.NOVA_PROJECTS_DIR).length, before, 'nothing was created');
  // the verb's own door does the same when the Ask model names it
  const again = await runVerb(vault, 'cancel', { verb: 'project.cancel', args: {} }, { intakeSessionId: sid });
  assert.equal(again.acted.said, 'Dropped. Nothing was made.');
  const none = await runVerb(vault, 'cancel', { verb: 'project.cancel', args: {} });
  assert.equal(none.acted.said, 'No project is being set up right now.');
});

test('project.start while a project is attached asks first; mid-intake it is a turn of the same intake', async () => {
  const k = novaKernel(vault);
  const { project } = k.createProject({ name: 'Room', kind: 'life', goal: 'g', done: 'd', phases: [{ name: 'a' }], reads: [], allowances: { research: true }, limit: {} });
  const asked = await runVerb(vault, 'start another project', { verb: 'project.start', args: { text: 'a garden' } }, { projectId: project.id });
  assert.equal(asked.acted.said, 'We are on Room. Start a separate new project?');
  assert.deepEqual(asked.acted.offer, { kind: 'project-start-another', text: 'a garden' });
  const mid = await runVerb(vault, 'start a project', { verb: 'project.start', args: { text: 'x' } }, { intakeSessionId: intakeSid });
  assert.equal(mid.acted.said, 'We are already setting one up. Tell me more about it.');
  assert.equal(mid.acted.intake, undefined, 'no new session');
});

test('project.research and project.watch: refused unattached, linked, or with Research off; run for the attached project only', async () => {
  const k = novaKernel(vault);
  const q = { verb: 'project.research', args: { question: 'which shed kit?' } };
  await assert.rejects(() => runVerb(vault, 'x', q), /no project is attached/);
  await assert.rejects(() => runVerb(vault, 'x', q, { projectId: 'atlas' }), /linked project/);
  const { project: off } = k.createProject({ name: 'No research', kind: 'life', goal: 'g', done: 'd', phases: [{ name: 'a' }], reads: [], allowances: { research: false }, limit: {} });
  await assert.rejects(() => runVerb(vault, 'x', q, { projectId: off.id }), /not allowed to research/);
  await assert.rejects(() => runVerb(vault, 'x', { verb: 'project.watch', args: { url: 'https://youtu.be/abcdefgh' } }), /no project is attached/);
  const { project: on } = k.createProject({ name: 'Yes research', kind: 'life', goal: 'g', done: 'd', phases: [{ name: 'a' }], reads: [], allowances: { research: true }, limit: {} });
  const restore = pr._setResearchDepsForTest({ runPanel: async () => ({ title: 't', synthesis: [], sources: [], candidates: [], dropped: { claims: 0, sources: 0, candidates: 0 } }) });
  const out = await runVerb(vault, 'x', q, { projectId: on.id });
  restore();
  assert.equal(out.acted.said, 'Researching that for Yes research. It lands on the project page.');
  const rec = await getRecord(out.acted.projectResearch.recordId);
  assert.equal(rec.kind, 'project-research');
  assert.equal(rec.projectId, on.id);
});

test('the ask path is untouched with no project and no intake: same request handling, no project fields in the job', async (t) => {
  const s = await serve(t);
  const plain = await post(s, '/ask', { question: 'what is on today, in a few words please' });
  assert.ok(plain.jobId);
  assert.equal('intake' in plain, false);
  const job = await ready(plain.jobId);
  for (const k of ['intake', 'proposal']) assert.ok(!job.result || !(k in job.result) || job.result[k] == null, k);
  // the context string: buildAskContext with no projectId is the base, byte for byte
  const { buildAskContext } = await import('../lib/askContext.js');
  assert.equal(await buildAskContext(vault, null, {}), await buildAskContext(vault, null));
  void listRecords;
});
