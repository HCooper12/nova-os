// The confirmed report. The property under test is the one his ask turns on:
// the receipt states what was ACTUALLY read, and a capture that read nothing
// is refused findings rather than given a confident voice.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sourceLine, durationPhrase, hostOf, readEntry, isGrounded,
  coverageSection, confirmLine, assembleReport,
} from '../lib/captureReport.js';

const reel = {
  url: 'https://www.instagram.com/reel/DZ10ldxqpAh/',
  title: 'Video by bondwayne007',
  author: 'bondwayne',
  durationSec: 42,
};
const withTranscript = {
  source: reel,
  read: [readEntry('Transcript', true, '19 lines · 640 characters', 'Whisper — no captions available'), readEntry('Frames', true, '14 frames at 1 per 3s')],
  research: { consulted: 9, cited: 6, failed: [] },
};

test('the source sentence names duration, kind and author, and invents nothing', () => {
  assert.equal(sourceLine(reel), '42-second Instagram reel by bondwayne');
  // no author known → the clause is absent, not guessed
  assert.equal(sourceLine({ url: 'https://youtu.be/x', durationSec: 250 }), '4-minute YouTube video');
  assert.equal(sourceLine({ url: 'https://nature.com/a' }), 'page at nature.com');
  // an explicit kind still names the host — "Analysed article" points at nothing
  assert.equal(sourceLine({ url: 'https://en.wikipedia.org/wiki/X', kind: 'article' }), 'article at en.wikipedia.org');
  // ...and does not say it twice when the kind already carries it
  assert.equal(sourceLine({ url: 'https://nature.com/a', kind: 'page at nature.com' }), 'page at nature.com');
});

test('duration reads the way a person says it', () => {
  assert.equal(durationPhrase(42), '42-second');
  assert.equal(durationPhrase(250), '4-minute');
  assert.equal(durationPhrase(3600), '1-hour');
  assert.equal(durationPhrase(4800), '1h 20m');
  assert.equal(durationPhrase(0), null, 'unknown duration is absent, never "0-second"');
  assert.equal(durationPhrase(undefined), null);
});

test('hostOf survives a malformed URL instead of throwing into a report', () => {
  assert.equal(hostOf('https://www.example.com/x'), 'example.com');
  assert.equal(hostOf('not a url'), null);
});

/* ------------------------- the gate that matters ------------------------- */

test('metadata alone is NOT grounded — a library card is not the book', () => {
  const metaOnly = { source: reel, read: [readEntry('Metadata', true, 'title, uploader, duration')] };
  const g = isGrounded(metaOnly);
  assert.equal(g.grounded, false);
  assert.match(g.why, /nothing readable/);
});

test('a failed fetch names itself in the reason', () => {
  const failed = { source: reel, read: [readEntry('Transcript', false, 'no captions available')] };
  const g = isGrounded(failed);
  assert.equal(g.grounded, false);
  assert.match(g.why, /transcript \(no captions available\)/);
});

test('a transcript grounds the report; frames alone ground it only partially', () => {
  assert.equal(isGrounded(withTranscript).grounded, true);
  assert.equal(isGrounded(withTranscript).partial, false);
  const silent = { source: reel, read: [readEntry('Frames', true, '14 frames')] };
  assert.equal(isGrounded(silent).grounded, true);
  assert.equal(isGrounded(silent).partial, true, 'a silent read is a real read, but a different claim');
  assert.match(isGrounded(silent).why, /nothing was heard/);
});

test('nothing fetched at all is ungrounded and says so', () => {
  assert.equal(isGrounded({ source: reel }).grounded, false);
  assert.match(isGrounded({ source: reel }).why, /nothing was fetched/);
});

/* ------------------------------ the receipt ------------------------------ */

test('the receipt lists every read, successes and failures alike', () => {
  const mixed = {
    source: reel,
    read: [readEntry('Transcript', true, '19 lines'), readEntry('Frames', false, 'ffmpeg missing')],
    research: { consulted: 9, cited: 6, failed: ['jstor.org'] },
  };
  const md = coverageSection(mixed);
  assert.match(md, /^## What was analysed/);
  assert.match(md, /✓ Transcript: 19 lines/);
  assert.match(md, /✗ Frames: ffmpeg missing/, 'a failure is part of the receipt, not hidden');
  assert.match(md, /9 sources consulted, 6 cited/);
  assert.match(md, /could not reach: jstor\.org/);
  assert.match(md, /instagram\.com\/reel\/DZ10ldxqpAh/);
});

test('the receipt says PLAINLY when nothing was analysed', () => {
  const md = coverageSection({ source: reel, read: [readEntry('Transcript', false, 'login required')] });
  assert.match(md, /\*\*Not analysed\.\*\*/);
  assert.match(md, /No findings are offered/);
});

test('the one-line confirmation carries the same facts, no more', () => {
  assert.equal(
    confirmLine(withTranscript),
    'Analysed 42-second Instagram reel by bondwayne — transcript read, 14 frames seen, 6 sources cited.',
  );
  const dead = { source: reel, read: [readEntry('Transcript', false, 'login required')] };
  assert.match(confirmLine(dead), /^Could not analyse 42-second Instagram reel by bondwayne/);
  // an ARTICLE says what was read too, or the line names no evidence at all
  const article = {
    source: { url: 'https://en.wikipedia.org/wiki/X', kind: 'article', title: 'X' },
    read: [readEntry('Page text', true, '12000 characters', "rendered in Nova's browser")],
    research: { consulted: 9, cited: 7 },
  };
  assert.equal(confirmLine(article), 'Analysed article at en.wikipedia.org — 12,000 characters read, 7 sources cited.');
});

/* ------------------------------- assembly -------------------------------- */

test('findings ride BELOW the receipt, and only when the read earned them', () => {
  const out = assembleReport({ evidence: withTranscript, findings: '## Noteworthy\n\n- The label is wrong.', title: 'The dead mouse' });
  assert.match(out, /^# The dead mouse/);
  assert.ok(out.indexOf('## What was analysed') < out.indexOf('## Noteworthy'), 'the receipt comes first');
  assert.match(out, /The label is wrong/);
});

test('an ungrounded capture DISCARDS the findings entirely', () => {
  const dead = { source: reel, read: [readEntry('Transcript', false, 'login required')] };
  const out = assembleReport({ evidence: dead, findings: '## Noteworthy\n\n- Confident nonsense about a video nobody opened.' });
  assert.doesNotMatch(out, /Confident nonsense/, 'this is the whole point of the module');
  assert.match(out, /Not analysed/);
});

test('a grounded read that produced no findings says that, rather than going quiet', () => {
  const out = assembleReport({ evidence: withTranscript, findings: '   ' });
  assert.match(out, /no findings came back/);
});
