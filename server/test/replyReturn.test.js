// AN ANSWER THAT LANDED WHILE HE WAS AWAY (1 Nov 2026): src/replyReturn.js
// and where App.jsx reads it. His report: he asked, left the app, came back,
// and the reply was not in the chat until much later, or never.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replyOnReturn, pendingWorthResuming, unheardRest, REPLY_FRESH_MS, PENDING_KEEP_MS } from '../../src/replyReturn.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const NOW = 1_800_000_000_000;

test('a reply found finished is spoken only in front of him and within a minute of last seeing it run', () => {
  assert.equal(REPLY_FRESH_MS, 60_000);
  assert.equal(replyOnReturn({ now: NOW, lastRunningAt: NOW - 2_000, visible: true }), 'speak', 'a live answer, as ever');
  assert.equal(replyOnReturn({ now: NOW, lastRunningAt: NOW - 60_000, visible: true }), 'speak', 'the edge of the minute');
  assert.equal(replyOnReturn({ now: NOW, lastRunningAt: NOW - 60_001, visible: true }), 'show', 'he was away: shown, with a tap to play');
  assert.equal(replyOnReturn({ now: NOW, lastRunningAt: NOW - 5 * 60_000, visible: true }), 'show');
  assert.equal(replyOnReturn({ now: NOW, lastRunningAt: NOW - 1_000, visible: false }), 'show', 'landing while the page is hidden is never spoken');
  assert.equal(replyOnReturn({ now: NOW, lastRunningAt: null, visible: true }), 'show', 'unknown is not fresh');
  assert.equal(replyOnReturn({ now: NOW, lastRunningAt: undefined, visible: true }), 'show');
});

test('a job id kept on the phone is picked up again for a day, then dropped', () => {
  assert.equal(PENDING_KEEP_MS, 24 * 3600_000);
  assert.equal(pendingWorthResuming({ jobId: 'j1', askedAt: NOW - 30 * 60_000 }, NOW), true, 'half an hour: the old ten-minute window lost this one');
  assert.equal(pendingWorthResuming({ jobId: 'j1', startedAt: NOW - 3600_000 }, NOW), true, 'the quick session keeps startedAt');
  assert.equal(pendingWorthResuming({ jobId: 'j1', askedAt: NOW - PENDING_KEEP_MS }, NOW), false);
  assert.equal(pendingWorthResuming({ jobId: 'j1', askedAt: NOW + 5_000 }, NOW), false, 'a clock from the future is not trusted');
  assert.equal(pendingWorthResuming({ askedAt: NOW }, NOW), false);
  assert.equal(pendingWorthResuming({ jobId: 'j1' }, NOW), false);
  assert.equal(pendingWorthResuming(null, NOW), false);
});

test('one tap plays what the voice had not reached', () => {
  assert.equal(unheardRest('Both work. Start with the barbell.', 0), 'Both work. Start with the barbell.');
  assert.equal(unheardRest('Both work. Start with the barbell.', 10), 'Start with the barbell.');
  assert.equal(unheardRest('Both work.', 99), '');
  assert.equal(unheardRest(null, 3), '');
});

test('App reads it: shown at once on return, never spoken stale; the record and the job are looked at again; ids survive a relaunch', () => {
  const app = read('src/App.jsx');
  // the poll learns when it last saw the job running, with him in front of it
  assert.match(app, /if \(job\?\.status === 'running' && \(typeof document === 'undefined' \|\| document\.visibilityState !== 'hidden'\)\) stream\.lastRunningAt = Date\.now\(\);/);
  // stale: committed to the chat now, the strip offers the rest, nothing spoken
  const stale = app.slice(app.indexOf("if (replyOnReturn({ now: Date.now(), lastRunningAt: stream.lastRunningAt, visible }) === 'show') {"));
  assert.ok(stale.length > 0);
  const branch = stale.slice(0, stale.indexOf('return;'));
  assert.match(branch, /commit\(\);/);
  assert.match(branch, /this\.noteSpeechUnavailable\(\[rest\], 'you were away when it arrived'\);/);
  assert.doesNotMatch(branch, /speakNewSentences|speakTtsSentence|queueTtsFinalize/);
  // back in front of him: the job and the conversation record, at once
  assert.match(app, /this\.askVisH = \(\) => \{ if \(document\.visibilityState === 'visible'\) \{ this\.pollAskNow\(\); this\.loadConversationRecord\(\); \} \};/);
  // a relaunch: the ask (with its lane) and the quick session come back
  assert.match(app, /if \(conn && pendingWorthResuming\(pending, Date\.now\(\)\)\) \{/);
  assert.match(app, /this\.attachAskPoll\(conn, pending\.jobId, \{ agent: pending\.agent \|\| null, lastRunningAt: pending\.askedAt \}\);/);
  assert.match(app, /localStorage\.setItem\('novaos\.quickJob', JSON\.stringify\(\{ jobId, startedAt: Date\.now\(\) \}\)\);/);
  assert.match(app, /this\.attachQuickPoll\(getConnection\(\), pendingQuick\.jobId\);/);
});
