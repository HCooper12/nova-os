// LIFT TRENDS IN HAND, and SPEAK FIRST on a spoken Coach turn (18 Oct 2026).
//
// Measured that day: "is my bench progressing or stalling" sent the Coach to
// Grep the raw logs before its first word at 34.7 s, because its context held
// a 12-session e1RM line. The trend block (coach.js liftTrendsContext) is now
// code's answer to a trend question, and a spoken turn tells the Coach to
// speak before any tool call.
//
// CLAUDE_BIN is a stub, NOVA_DATA_DIR and HOME are temp dirs, all set BEFORE
// any import: nothing here spawns the real CLI or writes his real data.
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-trends-stub-'));
const logFile = path.join(stubDir, 'spawns.log');
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv[0] === '--help') { process.stdout.write('  --effort <level>  Effort level\\n'); process.exit(0); }
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ argv }) + '\\n');
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let text = '';
  try { text = JSON.parse(line).message.content[0].text; } catch {}
  fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ text }) + '\\n');
  const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  say({ type: 'assistant', message: { content: [{ type: 'text', text: 'Answer.' }], usage: { input_tokens: 10, output_tokens: 5 } } });
  say({ type: 'result', is_error: false, result: 'Answer.', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } });
});
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-trends-data-'));
process.env.HOME = mkdtempSync(path.join(tmpdir(), 'nova-trends-home-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { liftTrends, liftTrendLine, liftTrendsContext, trendVerdict, LIFT_TRENDS_HEAD, TREND_MAX_LIFTS, TREND_MAX_CHARS } = await import('../lib/coach.js');
const { startCoachTurn, SPEAK_FIRST_RULE, speakFirstLine } = await import('../lib/coachTurn.js');
const cc = await import('../lib/claudeCode.js');

test.after(() => cc._dropAllWarm());

const TODAY = '2026-10-18';
const ex = (exerciseId, name, sets) => ({ exerciseId, name, sets: sets.map(([weight, reps, setType]) => ({ weight, reps, ...(setType ? { setType } : {}) })) });
const FIXTURE = [
  // week 0 (the 7 days to today)
  { id: 's1', date: '2026-10-17', routineName: 'Push', exercises: [
    ex('bench', 'Barbell Bench Press', [[60, 12, 'warmup'], [100, 5], [120, 20]]), // warm-up and 20-rep set never count
    ex('row', 'Chest-Supported Row', [[80, 8]]),
  ] },
  // week 1
  { id: 's2', date: '2026-10-10', routineName: 'Legs', exercises: [ex('squat', 'Back Squat', [[140, 3]])] },
  // week 2
  { id: 's3', date: '2026-10-03', routineName: 'Pull', exercises: [ex('curl', 'Cable Curl', [[20, 10]])] },
  // week 4
  { id: 's4', date: '2026-09-19', routineName: 'Push', exercises: [
    ex('bench', 'Barbell Bench Press', [[95, 5]]),
    ex('row', 'Chest-Supported Row', [[80, 8]]),
  ] },
  // week 5
  { id: 's5', date: '2026-09-12', routineName: 'Mixed', exercises: [
    ex('squat', 'Back Squat', [[150, 3]]),
    ex('row', 'Chest-Supported Row', [[79, 8]]),
  ] },
  // week 11, the oldest week in the window
  { id: 's6', date: '2026-07-28', routineName: 'Push', exercises: [ex('bench', 'Barbell Bench Press', [[90, 5]])] },
  // 84 days ago: outside the 12 weeks, never counted
  { id: 's7', date: '2026-07-26', routineName: 'Push', exercises: [ex('bench', 'Barbell Bench Press', [[200, 1]]), ex('old', 'Old Lift', [[50, 5]])] },
];

test('the verdict rule: rising/falling at 1.5 kg or more on the 0.5 kg grid, flat within 1 kg', () => {
  assert.equal(trendVerdict(1.5), 'rising');
  assert.equal(trendVerdict(1), 'flat');
  assert.equal(trendVerdict(0), 'flat');
  assert.equal(trendVerdict(-1), 'flat');
  assert.equal(trendVerdict(-1.5), 'falling');
  assert.equal(trendVerdict(null), 'too little data');
});

test('a fixture of sessions gives exact lines, in order, with code-written verdicts', () => {
  const rows = liftTrends(FIXTURE, { today: TODAY });
  assert.deepEqual(rows.map(liftTrendLine), [
    // 90x5=105, 95x5=110.8->111, 100x5=116.7->116.5; 4w = 116.5-111
    'Barbell Bench Press: 105 - - - - - - 111 - - - 116.5 | 4w +5.5 | 11w +11.5 | 3 sessions | rising',
    // 79x8=100.07->100, 80x8=101.3->101.5; the 4w base is the week 4 back, not 5
    'Chest-Supported Row: - - - - - - 100 101.5 - - - 101.5 | 4w +0 | 5w +1.5 | 3 sessions | flat',
    // 150x3=165, 140x3=154; newest is week 1, its base 4 weeks before that
    'Back Squat: - - - - - - 165 - - - 154 - | 4w -11 | 4w -11 | 2 sessions | falling',
    'Cable Curl: - - - - - - - - - 26.5 - - | 4w n/a | 1 session | too little data (last trained 2w ago)',
  ]);
  assert.ok(!rows.some((r) => r.name === 'Old Lift'), 'a session 84 days back is outside the window');
});

test('the block opens with the header that tells the Coach to quote it', () => {
  const block = liftTrendsContext(FIXTURE, { today: TODAY });
  const lines = block.split('\n');
  assert.equal(lines[0], LIFT_TRENDS_HEAD);
  assert.match(LIFT_TRENDS_HEAD, /these are computed from every logged set; quote them; search the logs only for something this block does not answer/);
  assert.equal(lines.length, 5);
  assert.equal(liftTrendsContext([], { today: TODAY }), '', 'nothing trained, no block');
});

test('at most 25 lifts, and the block says how many were left out', () => {
  const sessions = [{ id: 'x', date: TODAY, routineName: 'All', exercises: Array.from({ length: 40 }, (_, i) => ex(`l${i}`, `Lift ${i}`, [[50 + i, 5]])) }];
  const block = liftTrendsContext(sessions, { today: TODAY });
  const lines = block.split('\n');
  assert.equal(TREND_MAX_LIFTS, 25);
  assert.equal(lines.length, 1 + 25 + 1);
  assert.equal(lines.at(-1), '(15 less-trained lifts left out for length.)');
  assert.ok(block.length <= TREND_MAX_CHARS);
});

test('the character cap drops the least-trained lifts until the block fits', () => {
  // 30 long-named lifts trained every week: 25 lines would run far past 3,500
  const sessions = Array.from({ length: 12 }, (_, w) => ({
    id: `w${w}`,
    date: new Date(Date.parse(`${TODAY}T12:00:00Z`) - w * 7 * 86400000).toISOString().slice(0, 10),
    routineName: 'All',
    exercises: Array.from({ length: 30 }, (_, i) => ex(`l${i}`, `A Very Long Exercise Name Number ${i} (with its attachment noted)`, [[100 + w, 5]])),
  }));
  const block = liftTrendsContext(sessions, { today: TODAY });
  const lines = block.split('\n');
  assert.ok(block.length <= TREND_MAX_CHARS, `block is ${block.length} chars`);
  const shown = lines.length - 2;
  assert.ok(shown < 25 && shown > 5, `shown ${shown}`);
  assert.equal(lines.at(-1), `(${30 - shown} less-trained lifts left out for length.)`);
});

// ---- SPEAK FIRST: on a spoken turn only ------------------------------------

const spawns = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const waitFor = async (pred, ms = 30_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await pred();
    if (r) return r;
    await new Promise((r2) => setTimeout(r2, 20));
  }
  throw new Error('timed out waiting');
};
const ready = (jobId) => waitFor(() => { const j = cc.getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });
const vault = mkdtempSync(path.join(tmpdir(), 'nova-trends-vault-'));
// the text the stub received for the turn carrying `marker`
const sentText = (marker) => spawns().filter((x) => typeof x.text === 'string' && x.text.includes(marker)).map((x) => x.text).at(-1);

test('the rule line itself, and only for spoken === true', () => {
  assert.match(SPEAK_FIRST_RULE, /^\[SPEAK FIRST: your first sentence answers from what is already in front of you, before any tool call; if you need to check something, say the one-line answer you have, then look\.\]$/);
  assert.equal(speakFirstLine(true), SPEAK_FIRST_RULE);
  assert.equal(speakFirstLine(false), '');
  assert.equal(speakFirstLine(undefined), '');
  assert.equal(speakFirstLine('true'), '', 'a truthy string is not a spoken turn');
});

test('a spoken new Coach turn carries SPEAK FIRST; an unspoken one does not', async () => {
  const j1 = await ready(await startCoachTurn(vault, { question: 'Q-spoken-new: is my bench stalling?', spoken: true }));
  assert.equal(j1.status, 'ready', j1.error);
  const j2 = await ready(await startCoachTurn(vault, { question: 'Q-typed-new: is my bench stalling?' }));
  assert.equal(j2.status, 'ready', j2.error);
  assert.ok(sentText('Q-spoken-new').includes(SPEAK_FIRST_RULE));
  assert.ok(!sentText('Q-typed-new').includes('SPEAK FIRST'));
});

test('a spoken resumed Coach turn carries it; an unspoken resumed one does not', async () => {
  const first = await ready(await startCoachTurn(vault, { question: 'Q-open: hello' }));
  const sessionId = first.result.sessionId;
  const j1 = await ready(await startCoachTurn(vault, { question: 'Q-spoken-resumed: and squat?', sessionId, spoken: true }));
  assert.equal(j1.status, 'ready', j1.error);
  const j2 = await ready(await startCoachTurn(vault, { question: 'Q-typed-resumed: and deadlift?', sessionId: j1.result.sessionId }));
  assert.equal(j2.status, 'ready', j2.error);
  assert.ok(sentText('Q-spoken-resumed').includes(SPEAK_FIRST_RULE));
  assert.ok(!sentText('Q-typed-resumed').includes('SPEAK FIRST'));
});

test('a consulted Coach never carries it, even if spoken leaks through', async () => {
  const j = await ready(await startCoachTurn(vault, { question: 'Q-consult: is he recovered?', spoken: true, consulted: { by: 'nova', question: 'q', chain: ['nova'] } }));
  assert.equal(j.status, 'ready', j.error);
  assert.ok(!sentText('Q-consult').includes('SPEAK FIRST'));
  cc._resetConsultSessions();
});
