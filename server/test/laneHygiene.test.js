// THE 18 OCT 2026 LATENCY AND HYGIENE PASS, pinned.
//
// The audit of that day measured the Coach thinking 18-65 s before its first
// word (the ambient effortLevel "xhigh" leaking into every spawn), consults
// costing 104-135 s (a fresh 88k-character session per ask), a Coach session
// growing to 240k tokens in a day (the standing reminder and the whole live
// line resent every turn), and Nova resuming the COACH's session after an
// iOS reclaim ($3.30 and $7.63 cold writes). Each fix below is code, so each
// gets a test.
//
// CLAUDE_BIN is a stub, NOVA_DATA_DIR and HOME are temp dirs, all set BEFORE
// any import: nothing here can spawn the real CLI or write his real data.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-hygiene-stub-'));
const logFile = path.join(stubDir, 'spawns.log');
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv[0] === '--help') { process.stdout.write('  --effort <level>  Effort level\\n'); process.exit(0); }
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ argv }) + '\\n');
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
let n = 0;
rl.on('line', (line) => {
  if (!line.trim()) return;
  n++;
  let text = '';
  try { text = JSON.parse(line).message.content[0].text; } catch {}
  fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ text }) + '\\n');
  const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  say({ type: 'assistant', message: { content: [{ type: 'text', text: 'Answer ' + n + '.' }], usage: { input_tokens: 10, cache_read_input_tokens: 1000 * n, cache_creation_input_tokens: 5 } } });
  say({ type: 'result', is_error: false, result: 'Answer ' + n + '.', total_cost_usd: 0.01 * n, usage: { input_tokens: 10, output_tokens: 5 } });
});
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-hygiene-data-'));
process.env.HOME = mkdtempSync(path.join(tmpdir(), 'nova-hygiene-home-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { recordAgentSession, sessionOwner, sessionFootprint, sessionJournalPath } = await import('../lib/agentSessions.js');
const { guardAskSession, sessionOwnerGuard, _reset } = await import('../lib/askSession.js');
const { effortFor, setLanePref, getModelPrefs, maxEffort } = await import('../lib/modelPrefs.js');
const { routeIntent, isDeepAsk, DEEP_LINE, followUpLane, FOLLOW_UP_WINDOWS } = await import('../lib/intentRouter.js');
const { liveDelta, splitLiveLine, rollReason, carryLine, ROLL_TOKENS, _resetLiveMemory } = await import('../lib/coachTurn.js');
const { consultedBrief } = await import('../lib/consult.js');
const cc = await import('../lib/claudeCode.js');

test.after(() => cc._dropAllWarm());

const waitFor = async (pred, ms = 20_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await pred();
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 20));
  }
  throw new Error('timed out waiting');
};
const ready = (jobId) => waitFor(() => { const j = cc.getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });
const spawns = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// ---- 2. the session guard ---------------------------------------------------

test("a session id recorded for the Coach is refused on Nova's lane, and the reason says whose it is", async () => {
  _reset();
  await recordAgentSession('coach', '/vault', 'e865b593-coach');
  assert.equal(sessionOwner('e865b593-coach'), 'coach');
  assert.deepEqual(guardAskSession('e865b593-coach'), { sessionId: null, reason: 'id belongs to coach' });
  // the route logs exactly: "ask: fresh session — id belongs to coach"
  assert.deepEqual(guardAskSession('a-nova-id'), { sessionId: 'a-nova-id', reason: null }, 'an id no other lane owns still resumes');
});

test("the Coach and the Leader refuse each other's ids, and Nova's", async () => {
  await recordAgentSession('voice', '/vault', 'nova-1');
  await recordAgentSession('leader', '/vault', 'leader-1');
  assert.equal(sessionOwnerGuard('nova-1', 'coach').reason, 'id belongs to nova');
  assert.equal(sessionOwnerGuard('leader-1', 'coach').reason, 'id belongs to leader');
  assert.equal(sessionOwnerGuard('e865b593-coach', 'leader').reason, 'id belongs to coach');
  assert.equal(sessionOwnerGuard('e865b593-coach', 'coach').reason, null, 'its own id is fine');
  // an older id of a lane is still traced (the list keeps recent ids)
  await recordAgentSession('coach', '/vault', 'coach-2');
  assert.equal(sessionOwnerGuard('e865b593-coach', 'voice').reason, 'id belongs to coach');
});

// ---- 1. effort per lane -----------------------------------------------------

test('effort defaults: Nova low, Coach and Leader medium, every other lane carries its own (no ambient xhigh)', async () => {
  assert.equal(effortFor('ask-nova'), 'low');
  assert.equal(effortFor('coach'), 'medium');
  assert.equal(effortFor('leader-chat'), 'medium');
  assert.equal(effortFor('researcher'), 'high', 'research lanes never trade depth for speed');
  assert.equal(effortFor('greeting'), 'low');
  assert.equal(effortFor('cfo'), null, 'a deterministic lane spawns nothing');
  assert.equal(maxEffort('medium', 'high'), 'high');
  assert.equal(maxEffort('max', 'high'), 'max', 'a deep ask never lowers his setting');
  const board = getModelPrefs();
  assert.equal(board.lanes.find((l) => l.id === 'coach').effort, 'medium');
  assert.equal(board.lanes.find((l) => l.id === 'researcher').effort, 'high');
  assert.equal(board.lanes.find((l) => l.id === 'cfo').effort, null);
  assert.deepEqual(board.efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
});

test('effort is stored with the model prefs, validated hard', async () => {
  await setLanePref('coach', { effort: 'high' });
  assert.equal(effortFor('coach'), 'high');
  await assert.rejects(setLanePref('coach', { effort: 'extreme' }), /effort must be one of/);
  await assert.rejects(setLanePref('cfo', { effort: 'low' }), /no thinking setting/);
  await setLanePref('coach', { effort: 'medium' });
});

test('deep asks are marked by the router, and the line code speaks for them is fixed', () => {
  for (const q of ['Re-evaluate my program', 'can you redesign my split', 'rebuild my training plan', 'do a full review of my block', 'go through the whole thing with me']) {
    assert.equal(isDeepAsk(q), true, q);
    assert.equal(routeIntent(q).deep, true, q);
  }
  for (const q of ['how is my bench', 'what should I eat tonight', 'review this paragraph']) {
    assert.equal(isDeepAsk(q), false, q);
    assert.equal(routeIntent(q).deep, undefined, q);
  }
  assert.equal(DEEP_LINE, 'Going through the whole program; give me a minute.');
});

// ---- 6. the sticky window ---------------------------------------------------

test("the Coach's follow-up window is two minutes; the Leader keeps his thirteen-minute case", () => {
  const now = Date.now();
  assert.equal(FOLLOW_UP_WINDOWS.coach, 120_000);
  assert.equal(followUpLane('ask', 'and what about that?', { lastAgent: 'coach', lastAgentAt: now - 60_000 }, now).lane, 'coach');
  assert.deepEqual(followUpLane('ask', 'and what about that?', { lastAgent: 'coach', lastAgentAt: now - 302_000 }, now), { lane: 'ask', sticky: false },
    'the measured 302 s follow-up no longer goes to the Coach');
  assert.equal(followUpLane('ask', 'but is that right?', { lastAgent: 'leader', lastAgentAt: now - 13 * 60_000 }, now).lane, 'leader');
});

test("a question that is plainly Nova's leaves the sticky lane inside the window", () => {
  const now = Date.now();
  for (const q of ["what's on tomorrow", 'how many steps did I do today', "what's my weight this week", 'what is on my calendar', 'how much did I spend this week']) {
    const r = followUpLane('ask', q, { lastAgent: 'coach', lastAgentAt: now - 30_000 }, now);
    assert.equal(r.lane, 'ask', q);
    assert.equal(r.sticky, false, q);
  }
  assert.equal(followUpLane('ask', 'so should I push it then?', { lastAgent: 'coach', lastAgentAt: now - 30_000 }, now).lane, 'coach');
});

// ---- 3. session hygiene -----------------------------------------------------

const LIVE = (hrv, plan = 'HIS PROGRAM NOW:\n- Push: Bench') => `LIVE UPDATE (recomputed this turn — supersedes earlier numbers in this conversation): today is Sun Oct 18 2026; recovery 7d [10-18: HRV ${hrv}]; no open injuries.\n${plan}`;

test('the live line is sent whole once, then only what changed, with a code-written "nothing changed"', () => {
  _resetLiveMemory();
  assert.deepEqual(splitLiveLine(LIVE(70)).bits.length, 3);
  assert.equal(liveDelta('s1', LIVE(70)), LIVE(70), 'first sight: the whole line');
  const same = liveDelta('s1', LIVE(70));
  assert.match(same, /^LIVE UPDATE: nothing has changed since your last turn, his program and your cards included\.$/);
  const moved = liveDelta('s1', LIVE(64));
  assert.match(moved, /changed since your last turn/);
  assert.match(moved, /HRV 64/);
  assert.doesNotMatch(moved, /no open injuries/, 'an unchanged fact is not resent');
  assert.doesNotMatch(moved, /HIS PROGRAM NOW/, 'an unchanged plan block is not resent');
  const plan = liveDelta('s1', LIVE(64, 'HIS PROGRAM NOW:\n- Push: Bench, Dips'));
  assert.match(plan, /His program or your cards changed/);
  assert.match(plan, /Bench, Dips/);
  assert.ok(plan.startsWith('LIVE UPDATE'), 'still reads as plumbing to cleanTurnText');
  assert.doesNotMatch(plan, /\n\n/, 'one paragraph');
});

test('a session rolls over past ~150k tokens or after 12 h idle, and carries a code-written line', async () => {
  const now = Date.now();
  assert.equal(ROLL_TOKENS, 150_000);
  const fp = (tokens, ageH) => async () => ({ tokens, lastAt: now - ageH * 3600_000 });
  assert.equal(await rollReason('/v', 'big', { now, footprint: fp(160_000, 1) }).then((r) => r.why), '160000 tokens');
  assert.match((await rollReason('/v', 'cold', { now, footprint: fp(40_000, 13) })).why, /idle 13 h/);
  assert.equal(await rollReason('/v', 'fine', { now, footprint: fp(40_000, 2) }), null);
  const carry = await carryLine('/v', 'big', { tokens: 160_000 }, { tail: async () => ({ turns: [{ role: 'user', text: 'Should I deload?' }, { role: 'assistant', text: 'Not yet.' }] }) });
  assert.match(carry, /^CARRIED OVER \(code closed your previous conversation with him at about 160k tokens/);
  assert.match(carry, /Hayden: Should I deload\? \| You: Not yet\./);
});

test("a session's size and age are read from the CLI's own journal", async () => {
  const file = sessionJournalPath('/my vault', 'sess-j');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'a' }], usage: { input_tokens: 3, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 2000 } } }),
  ].join('\n') + '\n');
  const fp = await sessionFootprint('/my vault', 'sess-j');
  assert.equal(fp.tokens, 152_003);
  assert.ok(Math.abs(fp.lastAt - Date.now()) < 60_000);
  assert.equal(await sessionFootprint('/my vault', 'missing'), null);
});

// ---- 4. the consult fast path -----------------------------------------------

test('a consulted agent gets the short brief: 150 words, no glass, no documents', () => {
  const b = consultedBrief('nova', 'how is my week?');
  assert.match(b, /150 words or fewer/);
  assert.match(b, /No VIS lines and no documents \(no ARTIFACT blocks\)/);
  assert.match(b, /no PROPOSE/, 'a non-Coach consult still files nothing');
});

test('one consult session per agent: reused when free, a busy one leaves the second ask on its own', () => {
  cc._resetConsultSessions();
  const a = cc.claimConsultSession('consult-coach');
  assert.equal(a.resume, false);
  const b = cc.claimConsultSession('consult-coach');
  assert.equal(b.shared, false, 'busy: the overflow gets a session of its own');
  assert.notEqual(b.sessionId, a.sessionId);
  cc.releaseConsultSession(a);
  const c = cc.claimConsultSession('consult-coach');
  assert.equal(c.resume, true);
  assert.equal(c.sessionId, a.sessionId);
  cc.releaseConsultSession(c, { ok: false });
  assert.equal(cc.claimConsultSession('consult-coach').resume, false, 'a failed consult forgets the session');
  cc._resetConsultSessions();
});

// ---- spawns: effort, the reminder once, receipts, prewarm ---------------------

test('the Coach spawns with --effort and the standing reminder as a system prompt; a resumed turn sends no reminder', async () => {
  cc._setEffortSupportedForTest(true);
  const before = spawns().length;
  const j1 = await ready(cc.startAskCoach(stubDir, { question: 'How is my bench?', context: 'ctx' }));
  assert.equal(j1.status, 'ready', j1.error);
  const sessionId = j1.result.sessionId;
  const j2 = await ready(cc.startAskCoach(stubDir, { question: 'And my squat?', sessionId }));
  assert.equal(j2.status, 'ready', j2.error);
  const mine = spawns().slice(before);
  const spawn = mine.find((x) => x.argv);
  const at = (f) => spawn.argv[spawn.argv.indexOf(f) + 1];
  assert.equal(at('--effort'), 'medium');
  assert.match(at('--append-system-prompt'), /^\[Standing reminder\. YOU CAN CHANGE HIS PROGRAM/);
  assert.equal(mine.filter((x) => x.argv).length, 1, 'turn 2 reused the warm process');
  const texts = mine.filter((x) => x.text !== undefined).map((x) => x.text);
  assert.equal(texts[1], 'And my squat?', 'a resumed turn carries his question, not the reminder');
});

test('a deep Coach ask runs at high; a consulted Coach at low; receipts and spend rows carry the effort', async () => {
  cc._setEffortSupportedForTest(true);
  const before = spawns().length;
  const deep = await ready(cc.startAskCoach(stubDir, { question: 'Re-evaluate my program', context: 'ctx', deep: true }));
  assert.equal(deep.status, 'ready', deep.error);
  const claim = cc.claimConsultSession('consult-coach');
  const consulted = await ready(cc.startAskCoach(stubDir, { question: 'Is he recovered?', context: 'ctx', consulted: { by: 'nova', question: 'q', chain: ['nova'], claim } }));
  assert.equal(consulted.status, 'ready', consulted.error);
  cc.releaseConsultSession(claim);
  const argvs = spawns().slice(before).filter((x) => x.argv).map((x) => x.argv);
  assert.equal(argvs[0][argvs[0].indexOf('--effort') + 1], 'high');
  assert.equal(argvs[1][argvs[1].indexOf('--effort') + 1], 'low');
  assert.ok(!argvs[1].includes('--append-system-prompt'), 'a consulted Coach answers in the short brief');
  assert.ok(cc._warmStats().some((w) => w.key === `consult-coach:${claim.sessionId}`), 'the consult session stays warm for the next ask');
  const receipts = await waitFor(() => {
    const f = path.join(process.env.NOVA_DATA_DIR, 'jobs', 'receipts.jsonl');
    const rows = existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
    return rows.some((r) => r.deep) ? rows : null;
  });
  const deepRow = receipts.find((r) => r.deep);
  assert.equal(deepRow.effort, 'high');
  assert.equal(deepRow.sessionRolled, false);
  const spend = await waitFor(() => {
    const f = path.join(process.env.NOVA_DATA_DIR, 'model-spend.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  });
  assert.ok(spend.lanes.coach.some((r) => r.effort === 'high'));
});

test('an older CLI without --effort spawns without it', async () => {
  cc._setEffortSupportedForTest(false);
  assert.deepEqual(cc.effortFlag('low'), []);
  cc._setEffortSupportedForTest(true);
  assert.deepEqual(cc.effortFlag('low'), ['--effort', 'low']);
  assert.deepEqual(cc.effortFlag(null), []);
});

test('the mic opening prewarms the Coach when it spoke last and its window is open', async () => {
  cc._setEffortSupportedForTest(true);
  const j = await ready(cc.startAskCoach(stubDir, { question: 'Bench?', context: 'ctx' }));
  const sid = j.result.sessionId;
  cc._dropAllWarm();
  assert.equal(cc._lastHeard().kind, 'coach');
  assert.equal(cc.prewarmAsk(stubDir, null), true, 'booted the Coach');
  assert.ok(cc._warmStats().some((w) => w.key === `coach:${sid}`));
  assert.equal(cc.prewarmAsk(stubDir, null), false, 'already warm: nothing to do');
  cc._dropAllWarm();
  assert.equal(cc.prewarmAsk(stubDir, null, { now: Date.now() + 5 * 60_000 }), false, 'outside the two-minute window: not the sticky lane any more');
});
