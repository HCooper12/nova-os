// The Skill sets' real-device frame telemetry: bounded rows, a capped file,
// and never a write outside the data dir.
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-perf-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { appendPerf, readPerf, perfFile, cleanReport, PERF_CAP_BYTES } = await import('../lib/perfLog.js');

test('a report keeps only the known fields, bounded', () => {
  const r = cleanReport({ main: { p50: 16.666, p95: 40, n: 300, dropped: 12, evil: 1 }, ua: 'x'.repeat(999), dpr: 3, hack: 'no', errors: ['a', 'b', 'c', 'd', 'e', 'f'] });
  assert.equal(r.main.p50, 16.67);
  assert.equal(r.main.evil, undefined);
  assert.equal(r.hack, undefined);
  assert.equal(r.ua.length, 240);
  assert.equal(r.errors.length, 5);
  assert.equal(r.worker, null);
});

test('appends to perf/skillsets.jsonl under NOVA_DATA_DIR and reads back', async () => {
  await appendPerf('skillsets', { dpr: 3, mode: 'worker', workerAlive: true });
  await appendPerf('skillsets', { dpr: 2, mode: 'main' });
  assert.ok(perfFile('skillsets').startsWith(dataDir));
  const rows = await readPerf('skillsets');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].mode, 'worker');
  assert.equal(rows[1].dpr, 2);
});

test('the file is capped: past the cap the newest half is kept', async () => {
  const f = perfFile('capped');
  await mkdir(path.dirname(f), { recursive: true });
  const line = JSON.stringify({ pad: 'y'.repeat(1000) }) + '\n';
  await writeFile(f, line.repeat(Math.ceil(PERF_CAP_BYTES / line.length) + 10));
  await appendPerf('capped', { dpr: 1 });
  const txt = await readFile(f, 'utf8');
  assert.ok(txt.length < PERF_CAP_BYTES * 0.75);
  const rows = await readPerf('capped', 5);
  assert.equal(rows[rows.length - 1].dpr, 1);
});
