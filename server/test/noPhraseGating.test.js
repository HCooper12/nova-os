// NO PHRASE-GATED ROUTING — 3 Oct 2026. His words: "Specific phrases should
// not have one or the other as a response or route that nova goes down. For
// example, if I ask a research question or use the word evidence etc it
// should always consult the Researcher or whatever relevant specific agent …
// Not just when I use a specific phrase."
//
// What this pins:
//   1. a research question with NO research word reaches Nova's ask lane,
//      whose prompt tells her to ask the Researcher whenever the evidence
//      should settle it, and the consult rail asks the Researcher;
//   2. a training question with NO training word reaches the Coach the same
//      way (Nova consults it), and one spanning both asks both at once;
//   3. the palette no longer turns a research WORD in a question into a
//      research job nobody else is asked about: it goes to Nova;
//   4. a bare command the grammar is sure of still runs at once, with no model.
//
// The stub model consults ONLY when Nova's prompt carries the whom-to-ask
// guidance, so removing that guidance fails these tests. CLAUDE_BIN is a stub
// that also logs every call, and NOVA_DATA_DIR a temp dir, both set BEFORE
// import. The Researcher and the Coach are stand-ins on the consult rail.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-nophrase-stub-'));
const stubBin = path.join(stubDir, 'claude');
const CALLS = path.join(stubDir, 'calls.log');
const ask = (asks) => `CONSULT ${JSON.stringify({ asks })}`;
writeFileSync(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(CALLS)}, 'call\\n');
const argv = process.argv.slice(2);
const guided = (t) => /WHOM TO ASK IS DECIDED BY WHAT THE ANSWER NEEDS/.test(t)
  && /the Researcher, whenever outside evidence or the published literature should settle the answer/.test(t)
  && /the Coach, for his program, his sessions and lifts, his recovery, his food/.test(t);
const reply = (text) => {
  if (/The agents you consulted have answered/.test(text)) return 'Synthesis.';
  if (!guided(text)) return 'I answered alone.';
  if (/SPANS_BOTH/.test(text)) return ${JSON.stringify(ask([{ agent: 'researcher', question: 'What does the literature say about training the day after poor sleep?' }, { agent: 'coach', question: 'Should Friday\'s leg day move given his sleep?' }]))};
  if (/kidneys/.test(text)) return ${JSON.stringify(ask([{ agent: 'researcher', question: 'Is daily creatine safe for healthy kidneys?' }]))};
  if (/wedding/.test(text)) return ${JSON.stringify(ask([{ agent: 'coach', question: 'Should Friday\'s leg day move for a Saturday wedding?' }]))};
  return 'A plain answer.';
};
if (argv.includes('--input-format')) {
  const rl = require('node:readline').createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let text = '';
    try { text = JSON.parse(line).message.content.map((c) => c.text).join(''); } catch {}
    const out = reply(text);
    process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: out }] } }) + '\\n');
    process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: out }) + '\\n');
  });
} else {
  const prompt = argv[argv.indexOf('-p') + 1] || '';
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: reply(prompt) }));
}
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-nophrase-data-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

const vault = mkdtempSync(path.join(tmpdir(), 'nova-nophrase-vault-'));
mkdirSync(path.join(vault, 'Wiki', 'Health'), { recursive: true });

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { _setConsultDepsForTest } = await import('../lib/consult.js');
const { getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { routeIntent } = await import('../lib/intentRouter.js');
await import('../lib/verbs.js'); // verbs.js first: it reads the job verbs as it loads
const { _setJobLanesForTests } = await import('../lib/verbJobs.js');
const { createRecord } = await import('../lib/inboxStore.js');
const { setLanePref } = await import('../lib/modelPrefs.js');
const { voiceRouter } = await import('../routes/voice.js');
const { intentRouter } = await import('../routes/intent.js');

const asked = [];
_setConsultDepsForTest({
  researcher: async (q) => { asked.push(['researcher', q]); return { text: 'Brief: "Creatine supplementation and renal function"\n\nNo harm in healthy kidneys at 3 to 5 g a day.' }; },
  coach: async (q) => { asked.push(['coach', q]); return { text: 'Move it to Thursday; the program has room.' }; },
});
const jobs = [];
_setJobLanesForTests({
  startCapture: async (v, o) => { jobs.push(['capture', o.text]); const r = { id: `cap${jobs.length}`, text: o.text, source: 'test', mode: 'draft', status: 'pending', createdAt: new Date().toISOString() }; await createRecord(r); return r; },
  startResearch: async (v, q) => { jobs.push(['research', q]); const r = { id: `res${jobs.length}`, kind: 'research', text: q, source: 'test', mode: 'draft', status: 'classifying', createdAt: new Date().toISOString() }; await createRecord(r); return r; },
});
test.after(() => { _setConsultDepsForTest(null); _setJobLanesForTests(null); _dropAllWarm(); });

function serve() {
  const app = express();
  app.use(express.json());
  app.use('/api', voiceRouter(vault));
  app.use('/api', intentRouter(vault));
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}
const post = async (server, route, body) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return JSON.parse((await res.text()).trim());
};
const settled = async (jobId) => {
  const t0 = Date.now();
  for (;;) {
    const j = getMessageJob(jobId);
    if (j && j.status !== 'running') return j;
    if (Date.now() - t0 > 30_000) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};
const modelCalls = () => (existsSync(CALLS) ? readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).length : 0);

test('a research question with no research word: the ask lane, and Nova asks the Researcher', async () => {
  const q = 'Is it safe to take creatine every day for my kidneys?';
  assert.equal(routeIntent(q).lane, 'ask', 'no keyword decided anything: it is a question for Nova');
  const server = await serve();
  try {
    asked.length = 0;
    const out = await post(server, '/ask', { question: q });
    assert.ok(out.jobId, 'the ask lane, not a job or a keyword lane');
    assert.equal(out.agent, undefined);
    const done = await settled(out.jobId);
    assert.equal(done.status, 'ready', done.error);
    assert.deepEqual(asked, [['researcher', 'Is daily creatine safe for healthy kidneys?']]);
    assert.match(done.result.text, /^Asking the Researcher\.\n\nSynthesis\./, 'code says who was asked; Nova answers from it');
  } finally { server.close(); }
});

test('a training question with no training word reaches the Coach; one spanning both asks both at once', async () => {
  const q = 'I have a wedding on Saturday, what happens to Friday?';
  assert.equal(routeIntent(q).lane, 'ask', 'no training word, so no Coach lane by keyword');
  const server = await serve();
  try {
    asked.length = 0;
    const out = await post(server, '/ask', { question: q });
    const done = await settled(out.jobId);
    assert.equal(done.status, 'ready', done.error);
    assert.deepEqual(asked.map((a) => a[0]), ['coach']);
    assert.match(done.result.text, /^Asking the Coach\./);
    // a question that spans the literature and his program asks both
    asked.length = 0;
    const both = await settled((await post(server, '/ask', { question: 'SPANS_BOTH I slept four hours, what now for tomorrow?' })).jobId);
    assert.equal(both.status, 'ready', both.error);
    assert.deepEqual(asked.map((a) => a[0]).sort(), ['coach', 'researcher']);
    assert.match(both.result.text, /^Asking the Researcher and the Coach\./);
  } finally { server.close(); }
});

test('the palette: a research WORD in a question goes to Nova, not to a job nobody else is asked about', async () => {
  const server = await serve();
  try {
    jobs.length = 0;
    const q = 'find out whether my sleep is why my bench stalled';
    assert.equal(routeIntent(q).lane, 'research', 'the router still sees the research word');
    const out = await post(server, '/intent', { text: q });
    assert.equal(out.lane, 'ask');
    assert.deepEqual(out.forward, { screen: 'voice', question: q }, 'Nova takes it, and asks whoever it needs');
    assert.deepEqual(jobs, [], 'no research job started on the word alone');
    const ev = await post(server, '/intent', { text: 'what does the evidence say about training fasted' });
    assert.equal(ev.lane, 'ask');
    // his own lane choice still wins
    const forced = await post(server, '/intent', { text: 'find out about zone 2', lane: 'ask' });
    assert.equal(forced.lane, 'ask');
  } finally { server.close(); }
});

test('a bare command the grammar is sure of still runs at once, with no model', async () => {
  await setLanePref('researcher', { model: 'opus' }); // no model-choice gate to answer
  const server = await serve();
  try {
    jobs.length = 0;
    const before = modelCalls();
    const cap = await post(server, '/ask', { question: 'capture this: buy chalk for the gym' });
    assert.equal(cap.reflex, true);
    assert.match(cap.text, /Captured/);
    const res = await post(server, '/ask', { question: 'research creatine timing and capture it' });
    assert.equal(res.reflex, true);
    assert.ok(res.acted?.research?.recordId);
    assert.deepEqual(jobs, [['capture', 'buy chalk for the gym'], ['research', 'creatine timing']]);
    assert.equal(modelCalls(), before, 'no model was asked: the grammar is a fast path to the same lane');
  } finally {
    server.close();
    await setLanePref('researcher', { model: 'sonnet' });
  }
});
