// URL-only ingest: the transcript header handed to the vault pass is composed
// in code from the watch toolchain's own metadata — never model prose.
import test from 'node:test';
import assert from 'node:assert/strict';

const { composeFetchedTranscript } = await import('../lib/ingest.js');

test('composeFetchedTranscript: full metadata header, source line, timestamped body', () => {
  const text = composeFetchedTranscript({
    title: 'Deep Work Podcast #12', uploader: 'Cal Channel', duration: '1:02:11',
    transcriptSource: 'captions', transcript: '[00:01] welcome back',
  }, 'https://youtu.be/x');
  assert.match(text, /^Deep Work Podcast #12 — Cal Channel \(1:02:11\)\n/);
  assert.match(text, /Source: https:\/\/youtu\.be\/x/);
  assert.match(text, /via captions/);
  assert.match(text, /\[00:01\] welcome back$/);
});

test('composeFetchedTranscript: missing metadata degrades to the URL, never to blanks', () => {
  const text = composeFetchedTranscript({ transcript: 'body' }, 'https://youtu.be/x');
  assert.match(text, /^https:\/\/youtu\.be\/x\n/, 'title falls back to the URL');
  assert.doesNotMatch(text, /undefined|null/);
  assert.match(text, /via captions/, 'unknown transcript source falls back honestly');
});

test('composeFetchedTranscript: a digest body is labeled as notes, never passed off as the transcript', () => {
  const text = composeFetchedTranscript({ transcript: 'full '.repeat(10), duration: '4:08:55' }, 'https://youtu.be/x', '## Part 1 of 4\nnotes');
  assert.match(text, /condensed timestamped notes/);
  assert.match(text, /verbatim transcript is stored separately/);
  assert.match(text, /## Part 1 of 4/);
  assert.doesNotMatch(text, /full full/, 'digest body replaces the raw transcript');
});
