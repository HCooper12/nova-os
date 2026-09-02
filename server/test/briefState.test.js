// The once-a-day rail: briefed, greeted, and rituals done — one memory for
// every device, written by callers only on delivery. An older file that
// knows only the brief still reads cleanly.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-briefstate-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
const { getBriefState, markBriefDelivered, markGreeted, markRitualDone, todayISO } = await import('../lib/briefState.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('fresh: nothing briefed, greeted or done; the shape is complete', async () => {
  const st = await getBriefState();
  assert.equal(st.briefedToday, false);
  assert.equal(st.greet, null);
  assert.deepEqual(st.rituals, {});
  assert.equal(st.today, todayISO());
});

test('greeted and ritual-done are remembered for today, beside the brief, and survive each other', async () => {
  let st = await markGreeted();
  assert.equal(st.greet.date, todayISO());
  assert.ok(st.greet.at);
  st = await markRitualDone('morning');
  assert.deepEqual(st.rituals, { morning: todayISO() });
  st = await markBriefDelivered('morning');
  assert.equal(st.briefedToday, true);
  assert.equal(st.greet.date, todayISO(), 'the brief mark does not erase the greeting');
  assert.deepEqual(st.rituals, { morning: todayISO() });
  await assert.rejects(() => markRitualDone(''), /kind required/);
});

test('an older file that knows only the brief reads with greet null and no rituals; a stale greet or ritual is not today\'s', async () => {
  await writeFile(path.join(dataDir, 'brief-state.json'), JSON.stringify({ morning: '2026-01-01', greet: { date: '2026-01-01', at: 'x' }, rituals: { evening: '2026-01-01' } }), 'utf8');
  const st = await getBriefState();
  assert.equal(st.briefedToday, false);
  assert.equal(st.greet, null, 'yesterday\'s hello is not today\'s');
  assert.deepEqual(st.rituals, {}, 'yesterday\'s ritual is not today\'s');
  await writeFile(path.join(dataDir, 'brief-state.json'), JSON.stringify({ morning: todayISO() }), 'utf8');
  const old = await getBriefState();
  assert.equal(old.briefedToday, true);
  assert.equal(old.greet, null);
  assert.deepEqual(old.rituals, {});
});
