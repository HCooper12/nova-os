// When did the thing a coach card is about actually happen (13 Nov 2026, his
// "old data" complaint). Pure functions; temp data dir set before any import.
process.env.TZ = 'Australia/Brisbane'; // AEST, no daylight saving
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-evidenceage-'));
const { evidenceDate, speakableProgramCards } = await import('../lib/evidenceAge.js');

const NOW = new Date('2026-11-12T12:00:00+10:00');
const card = (id, over = {}) => ({ id, kind: 'coach-program', status: 'pending', createdAt: '2026-11-10T09:00:00+10:00', ...over });

test('evidenceDate is the newest of the finding dates, whatever order they come in', () => {
  assert.equal(evidenceDate(card('a', { finding: { dates: ['2026-11-05', '2026-11-09', '2026-11-01'] } })), '2026-11-09');
});

test('evidenceDate reads a full timestamp in the finding as its local day', () => {
  // 15:00 UTC on the 8th is 01:00 AEST on the 9th
  assert.equal(evidenceDate(card('a', { finding: { dates: ['2026-11-08T15:00:00Z'] } })), '2026-11-09');
});

test('evidenceDate falls back to the local day the card was raised when there are no dates', () => {
  assert.equal(evidenceDate(card('a')), '2026-11-10');
  assert.equal(evidenceDate(card('a', { finding: {} })), '2026-11-10');
  assert.equal(evidenceDate(card('a', { finding: { dates: [] } })), '2026-11-10');
  // 23:30 UTC on the 10th is 09:30 AEST on the 11th
  assert.equal(evidenceDate(card('a', { createdAt: '2026-11-10T23:30:00Z' })), '2026-11-11');
});

test('evidenceDate ignores unreadable finding dates and uses the readable ones', () => {
  assert.equal(evidenceDate(card('a', { finding: { dates: ['garbage', null, '', '2026-11-04'] } })), '2026-11-04');
  assert.equal(evidenceDate(card('a', { finding: { dates: ['garbage', null] } })), '2026-11-10', 'none readable: the raised day');
  assert.equal(evidenceDate(card('a', { finding: { dates: 'not an array' } })), '2026-11-10');
});

test('evidenceDate is null when nothing is readable at all', () => {
  assert.equal(evidenceDate(card('a', { createdAt: 'not a date' })), null);
  assert.equal(evidenceDate(card('a', { createdAt: undefined })), null);
  assert.equal(evidenceDate({}), null);
  assert.equal(evidenceDate(null), null);
  assert.equal(evidenceDate(undefined), null);
});

test('speakableProgramCards keeps only coach-program cards inside the window, newest evidence first', () => {
  const out = speakableProgramCards([
    card('older', { finding: { dates: ['2026-10-25'] } }), // 18 days: inside 21
    card('newest', { finding: { dates: ['2026-11-11'] } }),
    card('middle', { createdAt: '2026-11-03T09:00:00+10:00' }),
    card('edge', { finding: { dates: ['2026-10-22'] } }), // exactly 21 days
    card('stale', { finding: { dates: ['2026-10-21'] } }), // 22 days
    card('fuel', { kind: 'fuel-cross', createdAt: '2026-11-11T09:00:00+10:00' }),
  ], { now: NOW });
  assert.deepEqual(out.map((r) => r.id), ['newest', 'middle', 'older', 'edge']);
});

test('speakableProgramCards drops cards with no readable date, and junk entries', () => {
  const out = speakableProgramCards([
    card('good', { finding: { dates: ['2026-11-10'] } }),
    card('nodate', { createdAt: undefined }),
    card('baddate', { createdAt: 'whenever', finding: { dates: ['nope'] } }),
    null,
    undefined,
  ], { now: NOW });
  assert.deepEqual(out.map((r) => r.id), ['good']);
});

test('speakableProgramCards breaks a tie on evidence day by the later raised time, and survives a non-array', () => {
  const out = speakableProgramCards([
    card('early', { finding: { dates: ['2026-11-10'] }, createdAt: '2026-11-10T08:00:00+10:00' }),
    card('late', { finding: { dates: ['2026-11-10'] }, createdAt: '2026-11-11T08:00:00+10:00' }),
  ], { now: NOW });
  assert.deepEqual(out.map((r) => r.id), ['late', 'early']);
  assert.deepEqual(speakableProgramCards(undefined, { now: NOW }), []);
  assert.deepEqual(speakableProgramCards(null, { now: NOW }), []);
});

test('speakableProgramCards does not itself filter on status: the caller passes the pending ones', () => {
  const out = speakableProgramCards([card('done', { status: 'filed', finding: { dates: ['2026-11-10'] } })], { now: NOW });
  assert.deepEqual(out.map((r) => r.id), ['done']);
});
