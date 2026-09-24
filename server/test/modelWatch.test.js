// The model fail-safe: modelLabel's formatting, the probe's parse of a real
// CLI envelope (injected — never spawns anything), change detection that
// fires exactly once per real move, and the honest fallback before a probe
// has ever succeeded.
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-modelwatch-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  ALIASES, NEWEST_KNOWN, modelLabel, familyOf, probeAlias, parseProbeOutput,
  resolvedModels, lastCheckedAt, recentChanges, runModelWatch,
  watchDue, formatChangeMessage,
} = await import('../lib/modelWatch.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const okEnvelope = (id, extra = {}) => JSON.stringify({
  type: 'result', is_error: false, result: 'ok',
  modelUsage: { [id]: { webSearchRequests: 0, ...extra } },
});

test('modelLabel: the four real shapes, plus an unrecognised one returned as-is', () => {
  assert.equal(modelLabel('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(modelLabel('claude-fable-5-1'), 'Fable 5.1');
  assert.equal(modelLabel('claude-sonnet-5'), 'Sonnet 5');
  assert.equal(modelLabel('claude-haiku-4-5-20251001'), 'Haiku 4.5', 'the 8-digit date build suffix is dropped');
  assert.equal(modelLabel('gpt-4-turbo'), 'gpt-4-turbo');
  assert.equal(modelLabel('claude-opus-5-5-preview'), 'claude-opus-5-5-preview', 'a non-numeric tail is not guessed at');
  assert.equal(modelLabel(''), '');
});

test('familyOf: an alias names itself, a resolved id names its family, junk is null', () => {
  assert.equal(familyOf('opus'), 'opus');
  assert.equal(familyOf('claude-haiku-4-5-20251001'), 'haiku');
  assert.equal(familyOf('claude-fable-5-1'), 'fable');
  assert.equal(familyOf('gpt-4'), null);
  assert.equal(familyOf(undefined), null);
});

test('parseProbeOutput reads the resolved id off modelUsage; a malformed or errored envelope throws', () => {
  assert.equal(parseProbeOutput(okEnvelope('claude-opus-5-5'), 'opus'), 'claude-opus-5-5');
  assert.throws(() => parseProbeOutput('not json', 'opus'), /malformed/);
  assert.throws(() => parseProbeOutput(JSON.stringify({ is_error: true, result: 'budget exceeded' }), 'opus'), /budget exceeded/);
  assert.throws(() => parseProbeOutput(JSON.stringify({ is_error: false, result: 'ok' }), 'opus'), /no modelUsage/);
});

test('probeAlias uses the injected run and never spawns; a rejected run propagates', async () => {
  const id = await probeAlias('sonnet', { run: async () => okEnvelope('claude-sonnet-5') });
  assert.equal(id, 'claude-sonnet-5');

  await assert.rejects(() => probeAlias('opus', { run: async () => { throw new Error('spawn failed: ENOENT'); } }), /ENOENT/);
  await assert.rejects(() => probeAlias('opus', { run: async () => '{{not json' }), /malformed/);
});

test('resolvedModels falls back to NEWEST_KNOWN, marked unobserved, before any probe has ever landed', () => {
  const r = resolvedModels();
  for (const alias of ALIASES) {
    assert.equal(r[alias].id, NEWEST_KNOWN[alias]);
    assert.equal(r[alias].observed, false);
    assert.equal(r[alias].label, modelLabel(NEWEST_KNOWN[alias]));
  }
  assert.equal(lastCheckedAt(), null);
});

test('runModelWatch: records every alias, and a first-ever observation never announces (nothing moved FROM anything)', async () => {
  const announced = [];
  const run = async (alias) => okEnvelope(NEWEST_KNOWN[alias]);
  const report = await runModelWatch({ run, announce: (c) => announced.push(c), now: () => new Date('2026-09-25T10:00:00Z') });

  assert.deepEqual(report.resolved, NEWEST_KNOWN);
  assert.deepEqual(report.errors, {});
  assert.equal(announced.length, 0, 'first observation is not a "change" — there is nothing to compare it to');

  const r = resolvedModels();
  for (const alias of ALIASES) assert.equal(r[alias].observed, true);
  assert.equal(lastCheckedAt(), '2026-09-25T10:00:00.000Z');

  const raw = JSON.parse(await readFile(path.join(dataDir, 'model-watch.json'), 'utf8'));
  assert.equal(raw.resolved.opus.id, NEWEST_KNOWN.opus);
  assert.ok(raw.resolved.opus.since);
});

test('runModelWatch: a real move announces exactly once, and the change is recorded', async () => {
  await rm(path.join(dataDir, 'model-watch.json'), { force: true });
  const first = async (alias) => okEnvelope(NEWEST_KNOWN[alias]);
  await runModelWatch({ run: first, now: () => new Date('2026-09-25T10:00:00Z') });

  const announced = [];
  const second = async (alias) => okEnvelope(alias === 'opus' ? 'claude-opus-5-6' : NEWEST_KNOWN[alias]);
  const report = await runModelWatch({ run: second, announce: (c) => announced.push(c), now: () => new Date('2026-10-02T10:00:00Z') });

  assert.equal(announced.length, 1);
  assert.deepEqual(announced[0], { alias: 'opus', from: 'claude-opus-5-5', to: 'claude-opus-5-6', at: '2026-10-02T10:00:00.000Z' });
  assert.deepEqual(report.changes, announced);

  const r = resolvedModels();
  assert.equal(r.opus.id, 'claude-opus-5-6');
  assert.equal(r.sonnet.id, NEWEST_KNOWN.sonnet, 'an alias that did not move is left exactly as it was');
  assert.equal(recentChanges().length, 1);

  // running again with nothing moved must not re-announce
  const third = [];
  await runModelWatch({ run: second, announce: (c) => third.push(c), now: () => new Date('2026-10-09T10:00:00Z') });
  assert.equal(third.length, 0, 'the same resolved id twice in a row is not a new change');
});

test('runModelWatch: a failed probe keeps the previous value, is reported as an error, and never throws out of the loop', async () => {
  await rm(path.join(dataDir, 'model-watch.json'), { force: true });
  const first = async (alias) => okEnvelope(NEWEST_KNOWN[alias]);
  await runModelWatch({ run: first, now: () => new Date('2026-09-25T10:00:00Z') });

  const announced = [];
  const flaky = async (alias) => {
    if (alias === 'fable') throw new Error('the CLI exited 1');
    return okEnvelope(NEWEST_KNOWN[alias]);
  };
  const report = await runModelWatch({ run: flaky, announce: (c) => announced.push(c), now: () => new Date('2026-10-02T10:00:00Z') });

  assert.match(report.errors.fable, /exited 1/);
  assert.equal(report.resolved.fable, undefined, 'a failed probe contributes no resolved id this run');
  assert.equal(announced.length, 0);

  const r = resolvedModels();
  assert.equal(r.fable.id, NEWEST_KNOWN.fable, 'the last good value stands');
  assert.equal(r.fable.observed, true, 'it WAS observed before — a transient failure does not demote it to fallback');
});

test('watchDue: never-checked or 7+ days stale is due; a recent check is not', () => {
  const now = new Date('2026-09-25T10:00:00Z');
  assert.equal(watchDue(null, now), true);
  assert.equal(watchDue('not a date', now), true);
  assert.equal(watchDue('2026-09-01T00:00:00Z', now), true, '24 days ago is well past the week');
  assert.equal(watchDue('2026-09-24T10:00:00Z', now), false, 'yesterday is not due yet');
});

test('formatChangeMessage: one plain sentence, the version only in "was"', () => {
  const msg = formatChangeMessage({ alias: 'opus', from: 'claude-opus-5-5', to: 'claude-opus-5-6' });
  assert.equal(msg, 'Opus now runs Claude Opus 5.6 (was 5.5) — every lane on "opus" moved with it.');
});

test('runModelWatch caps stored changes at 20', async () => {
  await rm(path.join(dataDir, 'model-watch.json'), { force: true });
  let n = 0;
  const bump = async (alias) => okEnvelope(alias === 'haiku' ? `claude-haiku-4-5-${String(20260000 + n).padStart(8, '0')}` : NEWEST_KNOWN[alias]);
  await runModelWatch({ run: bump, now: () => new Date('2026-01-01T00:00:00Z') });
  for (let i = 0; i < 25; i++) {
    n++;
    await runModelWatch({ run: bump, now: () => new Date(`2026-01-${String(2 + i).padStart(2, '0')}T00:00:00Z`) });
  }
  assert.equal(recentChanges().length, 20);
});

test('a run where every probe fails is not a check: it tries again tomorrow', async () => {
  const { runModelWatch, lastCheckedAt, watchDue } = await import('../lib/modelWatch.js');
  const before = lastCheckedAt();
  const report = await runModelWatch({ run: async () => { throw new Error('offline'); }, announce: () => {} });
  assert.equal(Object.keys(report.errors).length, 4);
  assert.equal(lastCheckedAt(), before, 'the check date did not move');
  assert.equal(watchDue(lastCheckedAt()), watchDue(before));
});

// (review #9) another family's model is never recorded under this alias
test('a probe that returns no model of its own family fails instead of guessing', async () => {
  const { parseProbeOutput } = await import('../lib/modelWatch.js');
  const out = JSON.stringify({ modelUsage: { 'claude-haiku-4-5-20251001': {} } });
  assert.throws(() => parseProbeOutput(out, 'fable'), /no fable model/);
  assert.equal(parseProbeOutput(JSON.stringify({ modelUsage: { 'claude-haiku-4-5-20251001': {}, 'claude-fable-5-1': {} } }), 'fable'), 'claude-fable-5-1');
  assert.throws(() => parseProbeOutput(JSON.stringify({ modelUsage: { 'claude-fable-latest': {} } }), 'fable'));
});
