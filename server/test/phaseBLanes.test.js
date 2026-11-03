// PHASE B (2 Nov 2026, design/audits/2026-11-02-phase-b-lanes.md): the five
// lanes that write from numbers code computed now run through
// lib/textLane.js runTextLane: health-insight, session-debrief,
// briefing-plan, plan-today, daily-review. Each is tested here both ways:
// the model on this Mac (a stub Ollama server, the textLane.test.js idiom)
// and Claude (a stub CLI that prints a fixed envelope and logs its argv and
// working directory). Plus the runner's three new options (localPrompt,
// validate, claudeTools/cwd) and the standIn mark it now obeys.
//
// Nothing here can spawn the real CLI, reach the real Ollama, or write his
// real data: NOVA_DATA_DIR, the vault and the stubs are all temp, and every
// env value is set BEFORE the first lib import.
import { mkdtemp, writeFile, mkdir, readFile, chmod, rm } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const root = await mkdtemp(path.join(tmpdir(), 'nova-phase-b-'));
const dataDir = path.join(root, 'data');
const vault = path.join(root, 'vault');
await mkdir(dataDir, { recursive: true });
await mkdir(vault, { recursive: true });
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_OLLAMA_NO_SPAWN = '1';
for (const k of Object.keys(process.env)) if (/^(TELEGRAM_|VAPID_)/.test(k)) delete process.env[k];

// the CLI stub: answers the --effort probe, logs {cwd, argv} per call, prints
// the envelope STUB_REPLY names
const stubBin = path.join(root, 'claude-stub.cjs');
const callLog = path.join(root, 'calls.jsonl');
await writeFile(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv.includes('--help')) { process.stdout.write('--effort <level>\\n'); process.exit(0); }
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify({ cwd: process.cwd(), argv }) + '\\n');
process.stdout.write(fs.readFileSync(process.env.STUB_REPLY, 'utf8'));
`);
await chmod(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;

const envelope = (result) => JSON.stringify({ type: 'result', is_error: false, result, total_cost_usd: 0.003, duration_ms: 400 });
const replyFile = path.join(root, 'reply.json');
const claudeSays = async (result) => { await writeFile(replyFile, envelope(result)); process.env.STUB_REPLY = replyFile; };
const limitFile = path.join(root, 'limit.json');
await writeFile(limitFile, JSON.stringify({ type: 'result', is_error: true, result: "You've hit your session limit · resets 11am (Australia/Melbourne)", total_cost_usd: 0 }));
const claudeCalls = async () => (existsSync(callLog) ? (await readFile(callLog, 'utf8')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// the stub Ollama: answers whatever `localSays` holds, records each request
let localSays = '';
const ollamaSeen = [];
const ollama = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end('{"models":[{"name":"qwen3.5:4b","size":3324173934}]}');
    if (req.url === '/api/ps') return res.end('{"models":[{"name":"qwen3.5:4b"}]}');
    if (req.url === '/api/chat') {
      ollamaSeen.push(JSON.parse(body));
      return res.end(JSON.stringify({ model: 'qwen3.5:4b', message: { role: 'assistant', content: localSays }, done: true, done_reason: 'stop', eval_count: 40, prompt_eval_count: 900 }));
    }
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((r) => ollama.listen(0, '127.0.0.1', r));
process.env.NOVA_LOCAL_LLM_BACKEND = 'ollama';
process.env.NOVA_OLLAMA_URL = `http://127.0.0.1:${ollama.address().port}`;
process.env.NOVA_LOCAL_LLM_MODEL = 'qwen3.5:4b';

import test from 'node:test';
import assert from 'node:assert/strict';

const { runTextLane, laneVia, ungroundedNumbers } = await import('../lib/textLane.js');
const { setLanePref, resetLanePref, setLocalPrefs, setFallback } = await import('../lib/modelPrefs.js');
const { _setHeadroomForTests, refreshOllama } = await import('../lib/localModel.js');
const { _flushSpend } = await import('../lib/modelSpend.js');
const insight = await import('../lib/healthInsight.js');
const review = await import('../lib/dailyReview.js');
const plan = await import('../lib/planToday.js');
const briefing = await import('../lib/briefing.js');
const { startSessionDebrief, getMessageJob, buildDebriefPrompt } = await import('../lib/claudeCode.js');
const { rememberDebrief, lastDebriefFor } = await import('../lib/debriefMemory.js');
const { getRecord } = await import('../lib/inboxStore.js');

const PHASE_B = ['health-insight', 'session-debrief', 'briefing-plan', 'plan-today', 'daily-review'];
const SPEND = path.join(dataDir, 'model-spend.json');
const rowsFor = async (lane) => (existsSync(SPEND) ? JSON.parse(await readFile(SPEND, 'utf8')).lanes?.[lane] || [] : []);
async function waitRows(lane, n) {
  for (let i = 0; i < 100; i++) { const r = await rowsFor(lane); if (r.length >= n) return r; await new Promise((x) => setTimeout(x, 20)); }
  return rowsFor(lane);
}
const until = async (fn, ms = 5000) => {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 25)); }
};

// he picked This Mac for each (they are Claude by default since the bench)
const onThisMac = async () => { for (const l of PHASE_B) await setLanePref(l, { provider: 'local' }); };
const onClaude = async () => { for (const l of PHASE_B) await setLanePref(l, { provider: 'claude' }); };

test.beforeEach(async () => {
  await _flushSpend();
  await rm(SPEND, { force: true });
  await rm(callLog, { force: true });
  await resetLanePref();
  await setLocalPrefs({ first: true });
  await setFallback({ enabled: true });
  _setHeadroomForTests(() => ({ ok: true, swapFreeMB: 8000, reason: null }));
  await refreshOllama();
  ollamaSeen.length = 0;
  localSays = '';
});
test.after(async () => {
  _setHeadroomForTests(null);
  await _flushSpend();
  ollama.closeAllConnections();
  await new Promise((r) => ollama.close(r));
  await new Promise((r) => setTimeout(r, 100));
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {});
});

/* ------------------- the default board after 3 Nov 2026 ------------------- */

// His call (3 Nov): each lane on the model it was measured to do well with.
// The 9B passed session-debrief, plan-today and briefing-plan, so with local
// first on and nothing picked those three run here on the 9B. Health-insight
// joined them that night, once code made its comparisons (lib/dayVerdicts.js);
// daily-review, still wrong on the 9B in ways code cannot check, stays Claude. This suite pins the
// eval model (NOVA_LOCAL_LLM_MODEL) so its calls keep the 4B stub; the lane
// model reaching the request body is textLane.test.js's.
test('the default board: four lanes local first on the 9B, the daily review Claude', async () => {
  const { providerFor, localModelFor, getModelPrefs } = await import('../lib/modelPrefs.js');
  for (const id of ['session-debrief', 'plan-today', 'briefing-plan', 'health-insight']) {
    assert.equal(providerFor(id), 'local', id);
    assert.equal(localModelFor(id), 'qwen3.5:9b', id);
    const row = getModelPrefs().lanes.find((l) => l.id === id);
    assert.deepEqual([row.provider, row.localModelDefault, row.localModelResolved, row.customised], ['local', 'qwen3.5:9b', 'qwen3.5:9b', false], id);
  }
  for (const id of ['daily-review']) {
    assert.equal(providerFor(id), 'claude', id);
    assert.equal(getModelPrefs().lanes.find((l) => l.id === id).localModelDefault, null, `${id} inherits the board model if he moves it here`);
  }
  await setLocalPrefs({ first: false });
  for (const id of PHASE_B) assert.equal(providerFor(id), 'claude', `${id}: local first off puts every untouched lane on Claude`);
});

/* ------------------------- the runner's new options ------------------------ */

test('localPrompt goes to this Mac, the full prompt to Claude when it escalates; a failed validate is a failed local run', async () => {
  await setLanePref('health-insight', { provider: 'local' });
  localSays = 'not json at all';
  await claudeSays('{"ok":true}');
  const out = await runTextLane('health-insight', 'FULL PROMPT', {
    localPrompt: 'SMALL PROMPT',
    validate: (text) => { const v = JSON.parse(text); if (!v.ok) throw new Error('no ok'); return v; },
  });
  assert.equal(ollamaSeen[0].messages.at(-1).content, 'SMALL PROMPT');
  const call = (await claudeCalls())[0];
  assert.equal(call.argv[call.argv.indexOf('-p') + 1], 'FULL PROMPT');
  assert.equal(out.provider, 'claude');
  assert.equal(out.escalated, true);
  assert.deepEqual(out.value, { ok: true });
  assert.match(out.reason, /its answer could not be used/);
  const rows = await waitRows('health-insight', 2);
  const localRow = rows.find((r) => r.provider === 'local');
  assert.match(localRow.error, /could not be used/, 'the refused answer is on the ledger as a failure');
  assert.equal(localRow.model, 'local:qwen3.5:4b');
});

test("validate is told who answered, so this Mac's answer can be held to more than Claude's", async () => {
  await setLanePref('health-insight', { provider: 'local' });
  localSays = '{"n":1}';
  const seen = [];
  const out = await runTextLane('health-insight', 'p', { validate: (text, who) => { seen.push(who.provider); return JSON.parse(text); } });
  assert.equal(out.provider, 'local');
  assert.deepEqual(seen, ['local']);
  assert.deepEqual(out.value, { n: 1 });
});

test('claudeTools and cwd reach the Claude spawn; without them the spawn has zero tools', async () => {
  await setLanePref('daily-review', { provider: 'claude' });
  await claudeSays('x');
  await runTextLane('daily-review', 'p', { claudeTools: 'Read Grep Glob', cwd: vault });
  await runTextLane('daily-review', 'p');
  const [withTools, without] = await claudeCalls();
  assert.equal(withTools.argv[withTools.argv.indexOf('--allowedTools') + 1], 'Read Grep Glob');
  assert.equal(realpathSync(withTools.cwd), realpathSync(vault));
  assert.equal(without.argv[without.argv.indexOf('--allowedTools') + 1], '');
  assert.ok(without.argv[without.argv.indexOf('--disallowedTools') + 1].includes('Read'));
});

test('a lane marked standIn: false is never answered here when Claude is at its limit', async () => {
  await setLanePref('daily-review', { provider: 'claude' });
  process.env.STUB_REPLY = limitFile;
  localSays = '{"read":"x","adjustments":[]}';
  await assert.rejects(() => runTextLane('daily-review', 'p'), (e) => e.limited === true);
  assert.equal(ollamaSeen.length, 0, 'this Mac was never asked');
});

test('the grounding check finds every number the answer says that its prompt never gave it', () => {
  assert.deepEqual(ungroundedNumbers('HRV 75 ms, 1,040 kg, up 9%', 'HRV 75 and 1040 kg'), ['9']);
  assert.deepEqual(ungroundedNumbers('84.0 kg', 'weighed 84'), []);
});

/* ------------------------------ health-insight ----------------------------- */

test('health-insight on this Mac: the compact prompt, a grounded sentence accepted, who wrote it on the slot', async () => {
  await onThisMac();
  localSays = '{"hasInsight": true, "insight": "No health data has arrived yet, so there is nothing to read."}';
  const stored = await insight.generateInsightNow(vault, 'morning');
  assert.equal(stored.morning.hasInsight, true);
  assert.match(stored.morning.insight, /No health data/);
  assert.deepEqual(stored.morning.via, { provider: 'local', fallback: false, model: 'qwen3.5:4b' });
  assert.match(ollamaSeen[0].messages.at(-1).content, /## TODAY \(/, 'the compact context names today');
  assert.match(ollamaSeen[0].messages.at(-1).content, /Reply with only JSON/);
  assert.equal((await claudeCalls()).length, 0, 'Claude was never spawned');
  const onDisk = JSON.parse(await readFile(path.join(dataDir, 'health', 'insight.json'), 'utf8'));
  assert.equal(onDisk.morning.via.provider, 'local');
});

test('health-insight: a local sentence with an invented number goes to Claude with the full prompt, and the slot says so', async () => {
  await onThisMac();
  // a number no clock or date in the TODAY block can contain (CI ran at
  // 23:19 UTC on 2 Nov and "23%" read as grounded from the timestamp)
  localSays = '{"hasInsight": true, "insight": "Your HRV fell 61.7% overnight."}';
  await claudeSays('{"hasInsight": false, "insight": ""}');
  const stored = await insight.generateInsightNow(vault, 'evening');
  assert.equal(stored.evening.hasInsight, false);
  assert.equal(stored.evening.via.provider, 'claude');
  assert.equal(stored.evening.via.escalated, true);
  assert.match(stored.evening.via.escalationReason, /61\.7/);
  const call = (await claudeCalls())[0];
  assert.match(call.argv[call.argv.indexOf('-p') + 1], /thoughtful, holistic health coach/, 'Claude got the full prompt');
});

test('health-insight on Claude (its default): one spawn, no local call, no new keys beyond who wrote it', async () => {
  await onClaude();
  await claudeSays('{"hasInsight": true, "insight": "Sleep held at 7h."}');
  const stored = await insight.generateInsightNow(vault, 'morning');
  assert.equal(stored.morning.insight, 'Sleep held at 7h.');
  assert.deepEqual(stored.morning.via, { provider: 'claude', fallback: false });
  assert.equal(ollamaSeen.length, 0);
});

test('readInsight refuses a shape it cannot use, from either model', () => {
  assert.throws(() => insight.readInsight('{"insight":"x"}'), /hasInsight/);
  assert.throws(() => insight.readInsight('{"hasInsight":true,"insight":""}'), /empty/);
  assert.throws(() => insight.readInsight('{"hasInsight":true,"insight":"12 hours"}', { provider: 'local', prompt: 'nothing' }), /12/);
  assert.deepEqual(insight.readInsight('{"hasInsight":true,"insight":"12 hours"}', { provider: 'claude', prompt: 'nothing' }), { hasInsight: true, insight: '12 hours' });
});

/* ------------------------------ session-debrief ---------------------------- */

const FACTS = 'Session just logged: Pull, 2026-10-27 — 1 exercises, 3 sets, 1,950kg total volume.\n- Lying T Bar Row: 65×11@8.5, 65×9@9, 65×8@8.5';
const debriefOf = async (jobId) => until(() => { const j = getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });

test('session-debrief on this Mac: the strict prompt, a grounded reaction, who wrote it handed to the caller', async () => {
  await onThisMac();
  localSays = 'Three sets of T Bar Row at 65 held from 11 down to 8 reps. Keep 65 next time and chase 11 on every set.';
  let got = null;
  const job = await debriefOf(startSessionDebrief(vault, { facts: FACTS }, (text, via) => { got = { text, via }; }));
  assert.equal(job.status, 'ready');
  assert.equal(job.result.provider, 'local');
  assert.match(got.text, /T Bar Row/);
  assert.deepEqual(got.via, { provider: 'local', fallback: false, model: 'qwen3.5:4b' });
  assert.match(ollamaSeen[0].messages.at(-1).content, /Rules for this message:/);
  assert.equal((await claudeCalls()).length, 0);
});

test('session-debrief: a local reaction with a number off the sheet goes to Claude, and the caller hears it escalated', async () => {
  await onThisMac();
  localSays = 'Add 2.5 kg next time.';
  await claudeSays('Solid rows at 65.');
  let got = null;
  const job = await debriefOf(startSessionDebrief(vault, { facts: FACTS }, (text, via) => { got = { text, via }; }));
  assert.equal(job.result.provider, 'claude');
  assert.equal(got.text, 'Solid rows at 65.');
  assert.equal(got.via.escalated, true);
  assert.match(got.via.escalationReason, /2\.5/);
  const call = (await claudeCalls())[0];
  assert.doesNotMatch(call.argv[call.argv.indexOf('-p') + 1], /Rules for this message:/, 'Claude gets the prompt it always had');
});

test('the strict debrief prompt is the full one plus four rules, so the facts and the head stay identical', () => {
  const full = buildDebriefPrompt({ facts: FACTS });
  const strict = buildDebriefPrompt({ facts: FACTS, strict: true });
  assert.ok(strict.length > full.length);
  assert.ok(strict.endsWith(FACTS) && full.endsWith(FACTS));
});

test('a remembered debrief keeps who wrote it; one without keeps its old shape', async () => {
  await rememberDebrief({ routineId: 'r1', sessionId: 's1', routineName: 'Pull', date: '2026-10-27', text: 'Good rows.', via: { provider: 'local', fallback: false, model: 'qwen3.5:4b' } });
  assert.equal((await lastDebriefFor('r1')).via.provider, 'local');
  await rememberDebrief({ routineId: 'r2', sessionId: 's2', routineName: 'Push', date: '2026-10-28', text: 'Good press.' });
  assert.equal('via' in (await lastDebriefFor('r2')), false);
});

/* ------------------------------- briefing-plan ----------------------------- */

const ANGLES = JSON.stringify({ title: 'Light and sleep', angles: [{ q: 'How does morning light set the circadian clock?', why: 'mechanism' }, { q: 'What does evening light do to melatonin?', why: 'evidence' }] });

test('briefing-plan on this Mac: the example-free prompt, angles normalised, anglesVia on the record', async () => {
  await onThisMac();
  localSays = ANGLES;
  const deps = { ...briefing.defaultDeps, startResearch: async () => { throw new Error('no research in a test'); } };
  const rec = await briefing.startBriefing(vault, { topic: 'what light does to sleep' }, deps);
  const settled = await until(async () => { const r = await getRecord(rec.id); return r?.status === 'error' ? r : null; });
  assert.deepEqual(settled.anglesVia, { provider: 'local', fallback: false, model: 'qwen3.5:4b' });
  assert.doesNotMatch(ollamaSeen[0].messages.at(-1).content, /melanopsin/, 'no worked example for the small model to copy');
  assert.equal((await claudeCalls()).length, 0);
});

test('briefing-plan: one angle is not a plan, so Claude writes it (with the example) and the record says escalated', async () => {
  await onThisMac();
  localSays = JSON.stringify({ title: 't', angles: [{ q: 'Only one question here?', why: 'w' }] });
  await claudeSays(ANGLES);
  const { angles, via } = await briefing.planAngles(briefing.defaultDeps, 'what light does to sleep', '', vault);
  assert.equal(angles.angles.length, 2);
  assert.equal(via.escalated, true);
  const call = (await claudeCalls())[0];
  assert.match(call.argv[call.argv.indexOf('-p') + 1], /melanopsin/);
});

test("briefing-plan: a test's fake deps without runTextLane keep the old Claude-only path", async () => {
  const { angles, via } = await briefing.planAngles({ runClaude: async () => ANGLES }, 'what light does to sleep', '', vault);
  assert.equal(angles.angles.length, 2);
  assert.equal(via, null);
});

/* ---------------------------- plan-today, daily-review ---------------------- */

const PLAN = JSON.stringify({ priorities: [{ do: 'Log a named breakfast', why: 'nothing is logged yet today' }] });
const REVIEW = JSON.stringify({ read: 'A quiet day with nothing logged yet.', adjustments: [{ do: 'Log breakfast', why: 'nothing logged' }] });

test('plan-today on this Mac, end to end in draft: the compact prompt, the plan pending, who wrote it on the record', async () => {
  await onThisMac();
  await plan.setPlanConfig({ mode: 'draft' });
  localSays = PLAN;
  const { record } = await plan.runPlanToday(vault, { force: true });
  const done = await until(async () => { const r = await getRecord(record.id); return r?.status !== 'classifying' ? r : null; });
  assert.equal(done.status, 'pending', done.error);
  assert.equal(done.decision.payload.priorities[0].do, 'Log a named breakfast');
  assert.equal(done.provider, 'local');
  assert.equal(done.model, 'qwen3.5:4b');
  assert.match(ollamaSeen[0].messages.at(-1).content, /It is \d\d:\d\d now/);
  assert.equal((await claudeCalls()).length, 0);
});

test('plan-today: an invented number escalates to Claude, which keeps its vault reads, and the record says why', async () => {
  await onThisMac();
  await plan.setPlanConfig({ mode: 'draft' });
  localSays = JSON.stringify({ priorities: [{ do: 'Walk 4,000 steps', why: 'steps are low' }] });
  await claudeSays(PLAN);
  const { record } = await plan.runPlanToday(vault, { force: true });
  const done = await until(async () => { const r = await getRecord(record.id); return r?.status !== 'classifying' ? r : null; });
  assert.equal(done.status, 'pending', done.error);
  assert.equal(done.provider, 'claude');
  assert.equal(done.escalated, true);
  assert.match(done.escalationReason, /4000/);
  const call = (await claudeCalls())[0];
  assert.equal(call.argv[call.argv.indexOf('--allowedTools') + 1], 'Read Grep Glob');
  assert.equal(realpathSync(call.cwd), realpathSync(vault));
});

test('daily-review on this Mac, end to end in draft: pending, with who wrote it', async () => {
  await onThisMac();
  await review.setReviewConfig({ mode: 'draft' });
  localSays = REVIEW;
  const { record } = await review.runDailyReview(vault, { force: true });
  const done = await until(async () => { const r = await getRecord(record.id); return r?.status !== 'classifying' ? r : null; });
  assert.equal(done.status, 'pending', done.error);
  assert.equal(done.decision.payload.read, 'A quiet day with nothing logged yet.');
  assert.equal(done.provider, 'local');
  assert.match(ollamaSeen[0].messages.at(-1).content, /Reply with only JSON/);
});

test('daily-review on Claude (its default): the full prompt with vault reads, and an ordinary Claude record', async () => {
  await onClaude();
  await review.setReviewConfig({ mode: 'draft' });
  await claudeSays(REVIEW);
  const { record } = await review.runDailyReview(vault, { force: true });
  const done = await until(async () => { const r = await getRecord(record.id); return r?.status !== 'classifying' ? r : null; });
  assert.equal(done.status, 'pending', done.error);
  assert.equal(done.provider, 'claude');
  assert.equal(done.escalated, undefined);
  assert.equal(ollamaSeen.length, 0);
  const call = (await claudeCalls())[0];
  assert.match(call.argv[call.argv.indexOf('-p') + 1], /DAILY REVIEW/);
  assert.equal(call.argv[call.argv.indexOf('--allowedTools') + 1], 'Read Grep Glob');
});

test('daily-review: when both fail, the record is an error naming both, never an empty review', async () => {
  await onThisMac();
  await review.setReviewConfig({ mode: 'draft' });
  localSays = 'no json';
  await claudeSays('also no json');
  const { record } = await review.runDailyReview(vault, { force: true });
  const done = await until(async () => { const r = await getRecord(record.id); return r?.status !== 'classifying' ? r : null; });
  assert.equal(done.status, 'error');
  assert.match(done.error, /could not answer first/);
});

test('the compact contexts are smaller than the full ones and carry the stand-in for the profile', async () => {
  const r = await review.buildReviewContexts(vault, new Date('2026-07-19T08:00:00'));
  assert.ok(r.compact.length <= r.full.length);
  const p = await plan.buildPlanContexts(vault, new Date('2026-07-19T07:00:00'));
  assert.ok(p.compact.length <= p.full.length);
  assert.equal(await review.buildReviewContext(vault, new Date('2026-07-19T08:00:00')), r.full, 'the old export still returns the full context');
});

test('laneVia on a lane result is the Inbox shape these records carry', () => {
  assert.deepEqual(laneVia({ provider: 'local', model: 'qwen3.5:4b', fallback: false }), { provider: 'local', fallback: false, model: 'qwen3.5:4b' });
});
