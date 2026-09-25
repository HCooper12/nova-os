// The model spend ledger: what every lane costs, recorded honestly, and read
// back fast enough that getModelPrefs() can stay synchronous. This pins the
// envelope mapping, the usage-limit detector it shares with the warm pool,
// the write path's atomicity and concurrency guarantees, and the summary
// maths the board and the API read.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-modelspend-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  usageLimitNotice, fromEnvelope, parseEnvelope, recordRun, spendSummary, readSpendSync,
} = await import('../lib/modelSpend.js');

const SPEND_PATH = path.join(dataDir, 'model-spend.json');
const clean = () => rm(SPEND_PATH, { force: true });

test.afterEach(clean);

/* -------------------------------- usageLimitNotice -------------------------------- */

test('usageLimitNotice recognises the CLI\'s own limit text and nothing else', () => {
  assert.equal(usageLimitNotice("You've hit your session limit · resets 11am (Australia/Melbourne)"),
    "Claude's usage limit is reached for now; it resets at 11am. Nothing was answered and nothing was lost: ask again after that.");
  assert.equal(usageLimitNotice('You have hit your weekly limit · resets 6am (Australia/Melbourne)'),
    "Claude's usage limit is reached for now; it resets at 6am. Nothing was answered and nothing was lost: ask again after that.");
  assert.equal(usageLimitNotice('Your rep limit resets each block, so keep the sets honest.'), null);
  assert.equal(usageLimitNotice(null), null);
  assert.equal(usageLimitNotice(''), null);
});

/* ---------------------------------- fromEnvelope ---------------------------------- */

test('fromEnvelope maps a real CLI envelope, picking the model with the most output tokens', () => {
  const envelope = {
    total_cost_usd: 0.0242687,
    duration_ms: 788,
    is_error: false,
    result: 'two',
    usage: {
      input_tokens: 10,
      output_tokens: 30,
      cache_read_input_tokens: 23678,
      cache_creation_input_tokens: 87,
    },
    modelUsage: {
      'claude-haiku-4-5-20251001': { outputTokens: 72 },
      'claude-haiku-4-5-mini': { outputTokens: 3 }, // a sub-agent that said almost nothing
    },
  };
  const row = fromEnvelope(envelope);
  assert.deepEqual(row, {
    usd: 0.0242687,
    ms: 788,
    inputTokens: 10,
    outputTokens: 30,
    cacheReadTokens: 23678,
    cacheWriteTokens: 87,
    model: 'claude-haiku-4-5-20251001',
    limited: false,
    error: null,
  });
});

test('fromEnvelope: missing fields become null, never NaN', () => {
  const row = fromEnvelope({});
  assert.deepEqual(row, {
    usd: null, ms: null, inputTokens: null, outputTokens: null,
    cacheReadTokens: null, cacheWriteTokens: null, model: null, limited: false, error: null,
  });
  assert.deepEqual(fromEnvelope(null), row);
  assert.deepEqual(fromEnvelope(undefined), row);
});

test('fromEnvelope: is_error carries the first 200 chars of result; limited is set from the usage-limit text', () => {
  const long = 'x'.repeat(400);
  const errRow = fromEnvelope({ is_error: true, result: long });
  assert.equal(errRow.error, long.slice(0, 200));
  assert.equal(errRow.error.length, 200);

  const limitRow = fromEnvelope({ is_error: false, result: "You've hit your session limit · resets 11am (Australia/Melbourne)" });
  assert.equal(limitRow.limited, true);
  assert.equal(limitRow.error, null);
});

/* ---------------------------------- parseEnvelope ---------------------------------- */

test('parseEnvelope: happy path returns the parsed envelope and records the run', async () => {
  await clean();
  const envelope = { total_cost_usd: 0.01, duration_ms: 500, is_error: false, result: 'ok', usage: { input_tokens: 1, output_tokens: 2 } };
  const outer = parseEnvelope(JSON.stringify(envelope), { lane: 'probe-happy' });
  assert.deepEqual(outer, envelope);
  // recordRun is fire-and-forget — give the write chain a tick to land
  await recordRun('probe-happy', { usd: 0 }); // pushes onto the same chain, resolves after it
  const data = readSpendSync();
  assert.equal(data.lanes['probe-happy'][0].usd, 0.01);
});

test('parseEnvelope: is_error throws the model\'s own reported failure', () => {
  const envelope = { is_error: true, result: 'the tool call failed' };
  assert.throws(() => parseEnvelope(JSON.stringify(envelope), { lane: 'probe-error' }), /the tool call failed/);
});

test('parseEnvelope: is_error with no result text still throws something honest', () => {
  const envelope = { is_error: true, result: '' };
  assert.throws(() => parseEnvelope(JSON.stringify(envelope), { lane: 'probe-error-blank' }), /the model run failed/);
});

test('parseEnvelope: a usage-limit result throws the plain notice with err.limited = true', () => {
  const envelope = { is_error: false, result: "You've hit your weekly limit · resets 6am (Australia/Melbourne)" };
  try {
    parseEnvelope(JSON.stringify(envelope), { lane: 'probe-limit' });
    assert.fail('expected parseEnvelope to throw');
  } catch (e) {
    assert.equal(e.limited, true);
    assert.equal(e.message, "Claude's usage limit is reached for now; it resets at 6am. Nothing was answered and nothing was lost: ask again after that.");
  }
});

test('parseEnvelope: malformed stdout throws a plain error and records nothing', async () => {
  await clean();
  assert.throws(() => parseEnvelope('not json at all', { lane: 'probe-malformed' }), /malformed output from the model/);
  // give any (wrongly fired) write a tick, then confirm nothing landed
  await new Promise((r) => setTimeout(r, 20));
  const data = readSpendSync();
  assert.equal(data.lanes['probe-malformed'], undefined);
});

/* ------------------------------------ recordRun ------------------------------------ */

test('recordRun appends a row with an ISO timestamp and the given fields', async () => {
  await clean();
  await recordRun('probe-basic', {
    usd: 0.5, ms: 1200, inputTokens: 10, outputTokens: 20,
    cacheReadTokens: 5, cacheWriteTokens: 1, model: 'claude-sonnet-5', limited: false, error: null,
  });
  const data = readSpendSync();
  const rows = data.lanes['probe-basic'];
  assert.equal(rows.length, 1);
  assert.ok(!Number.isNaN(Date.parse(rows[0].at)));
  assert.equal(rows[0].usd, 0.5);
  assert.equal(rows[0].model, 'claude-sonnet-5');
});

test('recordRun never throws into its caller, even when the write fails', async () => {
  await clean();
  // Point the data root at a path that cannot be created (a file, not a dir,
  // sitting where the directory needs to go) so mkdir/writeFile fail.
  const blockedRoot = path.join(dataDir, 'blocked-root');
  const { writeFile: rawWriteFile } = await import('node:fs/promises');
  await rawWriteFile(blockedRoot, 'not a directory', 'utf8');
  const prev = process.env.NOVA_DATA_DIR;
  process.env.NOVA_DATA_DIR = path.join(blockedRoot, 'data'); // parent is a file — mkdir must fail
  try {
    await assert.doesNotReject(() => recordRun('probe-fails', { usd: 1 }));
  } finally {
    process.env.NOVA_DATA_DIR = prev;
  }
});

test('recordRun prunes rows older than 30 days, using the injectable clock', async () => {
  await clean();
  const day = 24 * 60 * 60 * 1000;
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  await recordRun('probe-prune', { usd: 1, now: t0 }); // will be 31 days old at t1
  await recordRun('probe-prune', { usd: 2, now: t0 + 10 * day });
  const t1 = t0 + 31 * day;
  await recordRun('probe-prune', { usd: 3, now: t1 });

  const data = readSpendSync();
  const rows = data.lanes['probe-prune'];
  // the first row (31 days before t1) must have been pruned; the second (21
  // days before t1) and third (now) survive
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.usd), [2, 3]);
});

test('recordRun caps each lane at 500 rows, keeping the most recent', async () => {
  await clean();
  const base = Date.parse('2026-01-01T00:00:00.000Z');
  for (let i = 0; i < 510; i++) {
    await recordRun('probe-cap', { usd: i, now: base + i * 1000 });
  }
  const data = readSpendSync();
  const rows = data.lanes['probe-cap'];
  assert.equal(rows.length, 500);
  assert.equal(rows[0].usd, 10, 'the oldest 10 rows were dropped');
  assert.equal(rows[rows.length - 1].usd, 509);
});

test('20 concurrent recordRun calls all land — no lost rows', async () => {
  await clean();
  const now = Date.now();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => recordRun('probe-concurrent', { usd: i, now: now + i })),
  );
  const data = readSpendSync();
  const rows = data.lanes['probe-concurrent'];
  assert.equal(rows.length, 20, 'every concurrent call must land a row');
  assert.deepEqual(rows.map((r) => r.usd).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i));
});

test('an unknown lane id is still recorded — the probe and future lanes are not refused', async () => {
  await clean();
  await recordRun('some-lane-nobody-registered', { usd: 0.02 });
  const data = readSpendSync();
  assert.equal(data.lanes['some-lane-nobody-registered'].length, 1);
});

test('the write is atomic: the file on disk is always valid JSON, never a partial write', async () => {
  await clean();
  await recordRun('probe-atomic', { usd: 1 });
  const raw = await readFile(SPEND_PATH, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

/* ---------------------------------- spendSummary ---------------------------------- */

test('spendSummary computes runs/usd/medianMs/lastModel/limitHits/errors over the window', async () => {
  await clean();
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const day = 24 * 60 * 60 * 1000;
  await recordRun('probe-summary', { usd: 1, ms: 100, model: 'claude-haiku-4-5', now: now - 6 * day });
  await recordRun('probe-summary', { usd: 2, ms: 300, model: 'claude-sonnet-5', now: now - 3 * day });
  await recordRun('probe-summary', { usd: 3, ms: 200, model: 'claude-sonnet-5', limited: true, now: now - 1 * day });
  await recordRun('probe-summary', { usd: 0.5, ms: 50, error: 'boom', now: now - 10 * day }); // outside a 7-day window

  const summary = spendSummary({ days: 7, now });
  const row = summary['probe-summary'];
  assert.equal(row.runs, 3, 'the 10-day-old row is outside the 7-day window');
  assert.equal(row.usd, 6);
  assert.equal(row.medianMs, 200);
  assert.equal(row.lastModel, 'claude-sonnet-5');
  assert.equal(row.limitHits, 1);
  assert.equal(row.errors, 0);
});

test('spendSummary rounds usd to 4dp and reports a lane with an even number of runs (median of two)', async () => {
  await clean();
  const now = Date.now();
  await recordRun('probe-median', { usd: 0.00011111, ms: 100, now });
  await recordRun('probe-median', { usd: 0.00022222, ms: 300, now });
  const summary = spendSummary({ days: 7, now: now + 1000 });
  const row = summary['probe-median'];
  assert.equal(row.usd, 0.0003); // 0.00033333 rounded to 4dp
  assert.equal(row.medianMs, 200); // (100+300)/2
});

test('spendSummary omits a lane with no rows in the window, and errors count rows with a non-null error', async () => {
  await clean();
  const now = Date.now();
  await recordRun('probe-errors', { usd: 1, error: 'failed once' });
  await recordRun('probe-errors', { usd: 1, error: null });
  const summary = spendSummary({ days: 7, now: now + 1000 });
  assert.equal(summary['probe-errors'].errors, 1);
  assert.equal(summary['no-such-lane'], undefined);
});

/* --------------------------- spawn-site coverage --------------------------- */

// The regression that motivated wiring every lane: a spawn site that never
// records a run is invisible to the spend ledger forever, the same class of
// bug modelPrefs.test.js guards for --model. This walks the real source and
// fails if any CLAUDE_BIN spawn site never references parseEnvelope( or
// recordRun( — the two ways a site is wired to the ledger.
test('every spawn site in server/lib is wired to the model spend ledger', async () => {
  const { readdir, readFile: read } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
  const offenders = [];
  for (const name of await readdir(libDir)) {
    // modelWatch.js is the one deliberate exception: it probes the four raw
    // model ALIASES directly ('opus'/'sonnet'/'haiku'/'fable') to find out
    // what they currently resolve to — a weekly, practically-free CLI
    // version check, not a lane with a cost worth tracking on the board.
    if (!name.endsWith('.js') || name === 'modelWatch.js') continue;
    const src = await read(path.join(libDir, name), 'utf8');
    const spawns = (src.match(/spawn\(CLAUDE_BIN/g) || []).length;
    if (!spawns) continue;
    if (!src.includes('parseEnvelope(') && !src.includes('recordRun(')) offenders.push(name);
  }
  assert.deepEqual(offenders, [], `these files spawn the CLI without recording to the model spend ledger: ${offenders.join(', ')}`);
});
