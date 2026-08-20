// The Study lane's honest-coverage contract: enumeration expands channels
// and never silently drops a tab failure; caption dedupe reconstructs
// rolling text; direct links pass through untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { enumerateSources, dedupeRollingCaptions } from '../lib/studyLane.js';

test('channel URLs expand via both tabs; failures are NAMED, not swallowed', async () => {
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.endsWith('/videos')) return [{ id: 'v1', url: 'u1', title: 'Video One', duration: 300 }];
    throw new Error('This channel does not have a shorts tab');
  };
  const { items, failures } = await enumerateSources(['https://youtube.com/@someone'], fake);
  assert.equal(items.length, 1);
  assert.equal(items[0].tab, 'videos');
  assert.equal(calls.length, 2, 'both tabs attempted');
  assert.equal(failures.length, 1);
  assert.match(failures[0], /shorts tab/);
});

test('direct links pass through; duplicate ids collapse', async () => {
  const fake = async () => [{ id: 'a', url: 'ua', title: 'A' }, { id: 'a', url: 'ua', title: 'A again' }];
  const { items } = await enumerateSources(['https://youtube.com/@x', 'https://www.youtube.com/watch?v=zzz'], fake);
  assert.equal(items.filter((i) => i.id === 'a').length, 1, 'the same id across tabs collapses to one entry');
  assert.ok(items.some((i) => i.tab === 'direct'));
});

test('rolling captions rebuild into clean prose', () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
So we built a system

00:00:03.000 --> 00:00:05.000
So we built a system that knows us

00:00:05.000 --> 00:00:07.000
that knows us completely`;
  const text = dedupeRollingCaptions(vtt);
  assert.equal(text, 'So we built a system that knows us completely');
});
