// WAS IT READ, and STOP WHAT NOBODY WANTS (second-brain audit #4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'nova-read-signal-'));
process.env.NOVA_DATA_DIR = root;

const { unreadOnScreen, openedNow } = await import('../../src/readSignal.js');
const { setSeen } = await import('../lib/inbox.js');
const { createRecord, getRecord, _resetInboxStore } = await import('../lib/inboxStore.js');
const { laneEnabled, setLanePref, resetLanePref, getModelPrefs } = await import('../lib/modelPrefs.js');
const { foodSuggestTick, _resetFoodSuggestDay } = await import('../lib/foodSuggest.js');

test.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));

const NOW = new Date('2026-11-07T08:00:00').getTime();
const rec = (id, kind, extra = {}) => ({ id, kind, status: 'filed', auto: true, createdAt: new Date(NOW).toISOString(), ...extra });

test('Home marks today\'s plan, the Journal marks the brief and the review, and nothing else marks anything', () => {
  const items = [rec('p', 'plan-today'), rec('d', 'dispatch'), rec('r', 'review')];
  assert.deepEqual(unreadOnScreen('mission', items, { now: NOW }), [{ id: 'p', via: 'home' }]);
  assert.deepEqual(unreadOnScreen('journal', items, { now: NOW }).map((x) => x.id), ['d', 'r']);
  assert.deepEqual(unreadOnScreen('workouts', items, { now: NOW }), []);
  assert.deepEqual(unreadOnScreen('mission', null, { now: NOW }), []);
});

test('only an unread, auto-delivered record of today counts', () => {
  const items = [
    rec('seen', 'plan-today', { seenAt: 'x' }),
    rec('hand', 'plan-today', { auto: false }),
    rec('wait', 'plan-today', { status: 'pending' }),
    rec('old', 'plan-today', { createdAt: '2026-11-05T08:00:00' }),
  ];
  assert.deepEqual(unreadOnScreen('mission', items, { now: NOW }), []);
});

test('expanding a card in the Inbox counts once, and closing it does not', () => {
  const items = [rec('v', 'video'), rec('w', 'wishlist', { seenAt: 'x' })];
  assert.deepEqual(openedNow({ v: true, w: true }, {}, items), [{ id: 'v', via: 'opened' }]);
  assert.deepEqual(openedNow({ v: true }, { v: true }, items), []);
  assert.deepEqual(openedNow({ v: false }, { v: true }, items), []);
});

test('an auto-delivered record takes one stamp, says where, and keeps its first', async () => {
  _resetInboxStore();
  await createRecord(rec('a1', 'dispatch'));
  const first = await setSeen('a1', true, { now: Date.parse('2026-11-07T09:00:00Z'), via: 'journal' });
  assert.equal(first.seenAt, '2026-11-07T09:00:00.000Z');
  assert.equal(first.seenVia, 'journal');
  assert.equal(first.status, 'filed');
  const second = await setSeen('a1', true, { now: Date.parse('2026-11-08T09:00:00Z'), via: 'home' });
  assert.equal(second.seenAt, '2026-11-07T09:00:00.000Z', 'the first look is the measure');
  await setSeen('a1', false);
  assert.ok((await getRecord('a1')).seenAt, 'a measure never clears');
});

test('Food Scout is paused by default, says why on the board, and his switch brings it back', async () => {
  assert.equal(laneEnabled('food-suggest'), false);
  const lane = (await getModelPrefs()).lanes.find((l) => l.id === 'food-suggest');
  assert.equal(lane.enabled, false);
  assert.match(lane.hint, /discarded all 21 cards in the last 30 days/);
  assert.match(lane.off, /food log and recipes keep working/);
  assert.equal(lane.deterministic, true);
  await setLanePref('food-suggest', { enabled: true });
  assert.equal(laneEnabled('food-suggest'), true);
  await resetLanePref('food-suggest');
  assert.equal(laneEnabled('food-suggest'), false, 'a reset goes back to how it shipped');
  assert.equal(laneEnabled('coach'), true, 'every other lane is on when untouched');
});

test('the evening tick runs nothing while paused, and runs when he turns it on', async () => {
  const evening = new Date('2026-11-07T19:00:00');
  let ran = 0;
  const run = async () => { ran += 1; return { proposed: 0 }; };
  _resetFoodSuggestDay();
  assert.deepEqual(await foodSuggestTick('/vault', { now: evening, run }), { skipped: true });
  assert.equal(ran, 0);
  await setLanePref('food-suggest', { enabled: true });
  _resetFoodSuggestDay();
  await foodSuggestTick('/vault', { now: evening, run });
  assert.equal(ran, 1);
  await resetLanePref('food-suggest');
});
