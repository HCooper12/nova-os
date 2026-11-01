// SHADOW MODE FOR THE EARS (2 Nov 2026): the measurement his 19 Oct yes was
// conditional on. The WER is computed by code and has to be right on known
// pairs; a row must never carry the audio or the whole transcript; the file
// must not grow without end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'nova-sttshadow-'));
const { wer, words, shadowRow, appendShadowRow, recordShadow, readShadowRows, summarise, deviceFromUa, SHADOW_PATH, MAX_ROWS } = await import('../lib/sttShadow.js');

test('words are compared as heard: case, punctuation and apostrophes do not count', () => {
  assert.deepEqual(words("What's my HRV, today?"), ['whats', 'my', 'hrv', 'today']);
  assert.deepEqual(words('  '), []);
});

test('WER on known pairs: substitution, deletion, insertion, identical, and the empty edges', () => {
  assert.equal(wer('how many steps today', 'how many steps today'), 0);
  assert.equal(wer('How many steps today?', 'how many steps today'), 0, 'punctuation and case are not errors');
  assert.equal(wer('how many steps today', 'how many stops today'), 0.25, 'one substitution in four');
  assert.equal(wer('how many steps today', 'how many today'), 0.25, 'one deletion');
  assert.equal(wer('how many steps today', 'how many steps are today'), 0.25, 'one insertion');
  assert.equal(wer('log my protein shake', 'no idea'), 1, 'four words, all wrong: 2 subs + 2 dels');
  assert.equal(wer('the cat sat on the mat', 'the cat sat on mat'), 0.167);
  assert.equal(wer('', ''), 0, 'both heard silence: agreement');
  assert.equal(wer('', 'thank you'), 2, 'local invented two words from silence');
  assert.equal(wer('one two', ''), 1, 'local heard nothing');
});

test('the device comes from a closed set', () => {
  assert.equal(deviceFromUa('Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X)'), 'iPhone');
  assert.equal(deviceFromUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'Mac');
  assert.equal(deviceFromUa('curl/8'), 'other');
  assert.equal(deviceFromUa(''), undefined);
});

const LONG_GROQ = 'Nova, how much protein have I had today and what is left for dinner tonight after the gym?';
const LONG_LOCAL = 'Nova how much protein have I had today and what is left for dinner tonight after the gym';

test('a row is counts, timings, the WER and 40-char heads: never the audio, never the whole transcript', () => {
  const row = shadowRow({
    groq: { text: LONG_GROQ, ms: 412.6 },
    local: { text: LONG_LOCAL, ms: 980, seconds: 0.81, cold: false, audio: Buffer.from('secret audio') },
    device: 'iPhone', source: 'voice', bytes: 48211, backend: 'groq',
  });
  assert.deepEqual(Object.keys(row).sort(), ['agree', 'at', 'bytes', 'device', 'groqChars', 'groqHead', 'groqMs', 'localChars', 'localEngineMs', 'localHead', 'localMs', 'source', 'wer'].sort());
  assert.equal(row.groqMs, 413);
  assert.equal(row.localMs, 980);
  assert.equal(row.localEngineMs, 810);
  assert.equal(row.groqChars, LONG_GROQ.length);
  assert.equal(row.localChars, LONG_LOCAL.length);
  assert.equal(row.wer, 0);
  assert.equal(row.agree, true);
  assert.equal(row.groqHead.length, 40);
  assert.equal(row.localHead.length, 40);
  const json = JSON.stringify(row);
  assert.ok(!json.includes(LONG_GROQ) && !json.includes(LONG_LOCAL), 'the full text is not in the row');
  assert.ok(!json.includes('secret audio') && !json.includes('dinner'), 'nothing past the head leaks through');
});

test('a local failure is a row too, with no WER and the reason', () => {
  const row = shadowRow({ groq: { text: 'hello', ms: 300 }, local: null, localError: 'the local transcriber took longer than 120 s', source: 'telegram', backend: 'openai' });
  assert.equal(row.wer, null);
  assert.equal(row.agree, false);
  assert.equal(row.localChars, null);
  assert.match(row.localError, /took longer/);
  assert.equal(row.backend, 'openai', 'the reference was not Groq: said so');
  assert.equal(row.localHead, undefined);
});

test('recordShadow waits on the local run, writes one row, and never throws', async () => {
  const row = await recordShadow({ groq: { text: 'how many steps today', ms: 350 }, localPromise: Promise.resolve({ text: 'how many stops today', ms: 900, seconds: 0.7, cold: true }), device: 'Mac', source: 'voice', bytes: 1000, backend: 'groq' });
  assert.equal(row.wer, 0.25);
  assert.equal(row.agree, false);
  assert.equal(row.cold, true);
  const failed = await recordShadow({ groq: { text: 'x', ms: 1 }, localPromise: Promise.reject(new Error('boom')), source: 'voice' });
  assert.equal(failed.localError, 'boom');
  const rows = await readShadowRows();
  assert.equal(rows.length, 2);
  const s = summarise(rows);
  assert.equal(s.rows, 2);
  assert.equal(s.compared, 1);
  assert.equal(s.localErrors, 1);
  assert.equal(s.meanWer, 0.25);
  assert.equal(s.agreement, 0);
  assert.equal(s.worst.length, 1);
});

test('the file rotates at 2,000 rows: the old ones move aside, a fresh file starts', async () => {
  const file = SHADOW_PATH();
  mkdirSync(path.dirname(file), { recursive: true });
  const line = JSON.stringify({ at: '2026-11-01T00:00:00.000Z', groqMs: 1, wer: 0, agree: true });
  writeFileSync(file, `${Array.from({ length: MAX_ROWS }, () => line).join('\n')}\n`);
  await appendShadowRow({ at: '2026-11-02T00:00:00.000Z', groqMs: 2, wer: 0.5, agree: false });
  const rotated = file.replace(/\.jsonl$/, '.1.jsonl');
  assert.ok(existsSync(rotated));
  assert.equal(readFileSync(rotated, 'utf8').split('\n').filter(Boolean).length, MAX_ROWS);
  const fresh = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  assert.equal(fresh.length, 1);
  assert.equal(JSON.parse(fresh[0]).groqMs, 2);
  assert.equal((await readShadowRows({ includeRotated: true })).length, MAX_ROWS + 1);
});

test('summary percentiles: median and p90 by nearest rank', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ groqMs: (i + 1) * 100, localMs: (i + 1) * 200, wer: i < 9 ? 0 : 0.5, agree: i < 9 }));
  const s = summarise(rows);
  assert.equal(s.groqMs.median, 500);
  assert.equal(s.groqMs.p90, 900);
  assert.equal(s.localMs.median, 1000);
  assert.equal(s.agreement, 0.9);
  assert.equal(s.meanWer, 0.05);
  assert.equal(s.worst[0].wer, 0.5);
});
