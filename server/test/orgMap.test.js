// The Org Map's view model (AGENT-WORLD-PLAN §3). Its whole promise is that
// the picture is the records: every loop stands somewhere, every record kind
// is someone's, and nothing is drawn working that is not.
// ops.js and practice.js are stores: a temp data dir BEFORE they are imported.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-orgmap-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  BEINGS, DISTRICTS, BEING_MEMBERS, KIND_BEING, UNFILED_KINDS, WORKING_MS,
  beingForRecord, composeOrgMap, orgHeadline,
} = await import('../lib/orgMap.js');
const { scheduledFleet, conversationalRoster, AGENT_DEPARTMENTS } = await import('../lib/ops.js');
const { KIND_AGENT } = await import('../lib/fleetContext.js');
const { liveSceneOf, liveScene, LIVE_SCENE_MS } = await import('../lib/practice.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

const NOW = new Date('2026-09-25T02:00:00Z').getTime();
const ago = (min) => new Date(NOW - min * 60e3).toISOString();
const beingIds = new Set(BEINGS.map((b) => b.id));
const placed = new Map(Object.entries(BEING_MEMBERS).flatMap(([b, ids]) => ids.map((id) => [id, b])));

test('every loop on both rosters stands on exactly one being (or the core)', () => {
  const ids = [...scheduledFleet(), ...conversationalRoster()].map((a) => a.id);
  const missing = ids.filter((id) => !placed.has(id));
  assert.deepEqual(missing, [], `loops with nowhere to stand on the map: ${missing.join(', ')}`);
  const all = Object.values(BEING_MEMBERS).flat();
  const twice = all.filter((id, i) => all.indexOf(id) !== i);
  assert.deepEqual(twice, [], `loops placed twice: ${twice.join(', ')}`);
  const ghosts = all.filter((id) => !ids.includes(id));
  assert.deepEqual(ghosts, [], `placed but on no roster: ${ghosts.join(', ')}`);
});

test('a loop stands in its own department wherever it has one', () => {
  const districtOf = Object.fromEntries(BEINGS.map((b) => [b.id, DISTRICTS.find((d) => d.id === b.district).dept]));
  const wrong = [];
  for (const [id, being] of placed) {
    if (being === 'core' || !AGENT_DEPARTMENTS[id]) continue;
    if (!AGENT_DEPARTMENTS[id].includes(districtOf[being])) wrong.push(`${id} → ${being} (${AGENT_DEPARTMENTS[id].join('/')})`);
  }
  assert.deepEqual(wrong, []);
});

test('the districts are exactly the departments', () => {
  const depts = new Set(Object.values(AGENT_DEPARTMENTS).flat());
  assert.deepEqual([...DISTRICTS.map((d) => d.dept)].sort(), [...depts].sort());
  for (const b of BEINGS) assert.ok(DISTRICTS.some((d) => d.id === b.district), `${b.id} has no district`);
});

test('every kind the fleet files belongs to a being, the core, or the unfiled list', () => {
  const lost = Object.keys(KIND_AGENT).filter((k) => !KIND_BEING[k] && !UNFILED_KINDS.includes(k));
  assert.deepEqual(lost, [], `record kinds that would vanish from the map: ${lost.join(', ')}`);
  for (const b of Object.values(KIND_BEING)) assert.ok(beingIds.has(b) || b === 'core', `unknown being ${b}`);
});

test('a raw capture is his, an unknown kind is said to be unfiled', () => {
  assert.equal(beingForRecord({ text: 'buy eggs' }), 'core');
  assert.equal(beingForRecord({ kind: 'research' }), 'researcher');
  assert.equal(beingForRecord({ kind: 'something-new' }), 'unfiled');
});

test('waiting counts pending records only, newest first, and says how many are unseen', () => {
  const records = [
    { id: 'a', kind: 'research', status: 'pending', createdAt: ago(300) },
    { id: 'b', kind: 'research', status: 'pending', createdAt: ago(10), seenAt: ago(5) },
    { id: 'c', kind: 'research', status: 'filed', createdAt: ago(20), filedAt: ago(15) },
    { id: 'd', kind: 'coach-program', status: 'pending', createdAt: ago(60) },
  ];
  const m = composeOrgMap({ records, now: NOW });
  const r = m.beings.find((b) => b.id === 'researcher');
  assert.equal(r.waiting, 2);
  assert.equal(r.unseen, 1);
  assert.deepEqual(r.asks.map((x) => x.id), ['b', 'a']);
  assert.equal(r.last.status, 'filed');
  assert.equal(m.beings.find((b) => b.id === 'coach').waiting, 1);
  assert.equal(m.districts.find((d) => d.id === 'knowledge').waiting, 2);
  assert.equal(m.waitingTotal, 3);
});

test('working means in flight now; a record stuck classifying for hours is not work', () => {
  const records = [
    { id: 'live', kind: 'video', status: 'classifying', createdAt: ago(3) },
    { id: 'stuck', kind: 'review', status: 'classifying', createdAt: ago(WORKING_MS / 60e3 + 90) },
  ];
  const m = composeOrgMap({ records, now: NOW });
  assert.equal(m.beings.find((b) => b.id === 'watcher').working, true);
  assert.equal(m.beings.find((b) => b.id === 'leader').working, false);
});

test('a being is as fresh as the freshest loop it stands for, and never-run says so', () => {
  const agents = [
    { id: 'money', label: 'Money', role: 'ledger import', state: 'stale', stateLabel: '9d ago', lastBeat: ago(9 * 24 * 60), lastNote: null },
    { id: 'cfo', label: 'CFO', role: 'monthly money report', state: 'recent', stateLabel: '2d ago', lastBeat: ago(2 * 24 * 60), lastNote: { at: ago(60), note: 'ledger unreadable' } },
  ];
  const m = composeOrgMap({ agents, records: [], now: NOW });
  assert.equal(m.beings.find((b) => b.id === 'cfo').fresh, 'recent');
  assert.equal(m.beings.find((b) => b.id === 'watcher').fresh, 'never');

  // each member carries its own role and last-run word, not just the being's
  // aggregate freshness — the tap card draws every loop's own state from this
  const cfoBeing = m.beings.find((b) => b.id === 'cfo');
  const cfoMember = cfoBeing.members.find((x) => x.id === 'cfo');
  assert.equal(cfoMember.role, 'monthly money report');
  assert.deepEqual(cfoMember.last, { note: 'ledger unreadable', at: ago(60) }, 'a note beats a bare beat, and keeps its own time');
  const moneyMember = cfoBeing.members.find((x) => x.id === 'money');
  assert.equal(moneyMember.role, 'ledger import');
  assert.deepEqual(moneyMember.last, { note: null, at: ago(9 * 24 * 60) }, 'no note: the beat time stands in for it');

  const watcherMember = m.beings.find((b) => b.id === 'watcher').members.find((x) => x.id === 'watcher');
  assert.equal(watcherMember.role, null, 'no roster entry at all: role is honestly absent');
  assert.equal(watcherMember.last, null, 'no note and no beat: last is null, not a guess');
});

test('the headline is counted, names the two who ask most, and is quiet when nothing waits', () => {
  const b = (name, waiting) => ({ name, waiting });
  assert.equal(orgHeadline([b('Coach', 0)], { waiting: 0 }), 'Nothing is waiting on you.');
  assert.equal(orgHeadline([b('Coach', 1)], { waiting: 0 }), 'One thing is waiting on you: the Coach 1.');
  assert.equal(orgHeadline([b('Coach', 4), b('Researcher', 7), b('Leader', 1), b('CFO', 1)], { waiting: 1 }),
    '14 things are waiting on you: the Researcher 7, the Coach 4, and 2 others.');
  assert.equal(orgHeadline([], { waiting: 2 }), '2 things are waiting on you, all of it yours to sort.');
});

// §9d step 4: what the life engine acts out comes from here, so these pin
// the shape the engine's own tests feed it.
test('events: an autonomous filing is a delivery, his own filing is answered, nothing older than ten minutes', () => {
  const records = [
    { id: 'auto', kind: 'research', status: 'filed', createdAt: ago(30), filedAt: ago(1), auto: true },
    { id: 'his', kind: 'coach-program', status: 'filed', createdAt: ago(60), filedAt: ago(3), auto: false },
    { id: 'old', kind: 'dispatch', status: 'filed', createdAt: ago(90), filedAt: ago(11), auto: true },
    { id: 'no', kind: 'review', status: 'discarded', createdAt: ago(40), discardedAt: ago(2), auto: false },
    { id: 'yes', kind: 'money', status: 'classifying', createdAt: ago(40), approvedAt: ago(4) },
    { id: 'waiting', kind: 'research', status: 'pending', createdAt: ago(1) },
  ];
  const { events } = composeOrgMap({ records, now: NOW });
  assert.deepEqual(events.map((e) => e.id), ['auto:filed', 'no:discarded', 'his:filed', 'yes:approved'], 'newest first, and the 11-minute-old filing is gone');
  assert.deepEqual(events[0], { id: 'auto:filed', at: ago(1), source: 'record', being: 'researcher', kind: 'research', status: 'filed', answered: false });
  assert.equal(events.find((e) => e.id === 'his:filed').answered, true, 'auto:false is his hand');
  assert.equal(events.find((e) => e.id === 'his:filed').being, 'coach');
  assert.equal(events.find((e) => e.id === 'no:discarded').answered, true);
  assert.equal(events.find((e) => e.id === 'yes:approved').answered, false, 'an approval is followed by its own filing');
  assert.ok(events.every((e) => NOW - new Date(e.at).getTime() <= 10 * 60e3));
});

test('events are capped at forty, and a stamp in the future is not an event', () => {
  const records = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, kind: 'video', status: 'filed', filedAt: ago(i / 10), auto: true }));
  records.push({ id: 'soon', kind: 'video', status: 'filed', filedAt: new Date(NOW + 60e3).toISOString(), auto: true });
  const { events } = composeOrgMap({ records, now: NOW });
  assert.equal(events.length, 40);
  assert.equal(events[0].id, 'r0:filed');
  assert.ok(!events.some((e) => e.id === 'soon:filed'));
});

test('receipts is the filed-today count when composeOps hands one over, and null otherwise', () => {
  assert.equal(composeOrgMap({ records: [], now: NOW, filedToday: 7 }).receipts, 7);
  assert.equal(composeOrgMap({ records: [], now: NOW, filedToday: 0 }).receipts, 0);
  assert.equal(composeOrgMap({ records: [], now: NOW }).receipts, null, 'no count, no number');
});

test('the same records in give the same map out', () => {
  const records = [{ id: 'x', kind: 'dispatch', status: 'pending', createdAt: ago(1) }];
  assert.deepEqual(composeOrgMap({ records, now: NOW }), composeOrgMap({ records, now: NOW }));
});

// ---- Practice, the tenth being (his pick, 26 Sep: the two masks) ---------

test('practice records stand on Practice, in Mind with the Leader', () => {
  for (const k of ['practice-skill', 'practice-session', 'practice-status']) assert.equal(beingForRecord({ kind: k }), 'practice', k);
  assert.equal(BEINGS.find((b) => b.id === 'practice').district, 'mind');
  const m = composeOrgMap({ records: [{ id: 'p', kind: 'practice-status', status: 'pending', createdAt: ago(2) }], now: NOW });
  assert.equal(m.beings.find((b) => b.id === 'practice').waiting, 1);
  assert.equal(m.beings.find((b) => b.id === 'leader').waiting, 0, 'not on the Leader any more');
  assert.deepEqual(m.districts.find((d) => d.id === 'mind').beings, ['leader', 'practice']);
  assert.ok(conversationalRoster().some((a) => a.id === 'practice'), 'Practice is on the conversational roster');
  assert.deepEqual(AGENT_DEPARTMENTS.practice, ['Mind']);
});

test('workingMode: prepare while a page is being prepared, scene while a scene is live, null otherwise', () => {
  const preparing = [{ id: 'pg', kind: 'practice-skill', status: 'classifying', createdAt: ago(2) }];
  const p = (m) => m.beings.find((b) => b.id === 'practice');
  let m = composeOrgMap({ records: preparing, now: NOW });
  assert.equal(p(m).working, true);
  assert.equal(p(m).workingMode, 'prepare');
  const scene = { startedAt: ago(6), lastTurnAt: ago(1) };
  m = composeOrgMap({ records: [], now: NOW, live: { practiceScene: scene } });
  assert.equal(p(m).working, true, 'a live scene is work, though it is not a record');
  assert.equal(p(m).workingMode, 'scene');
  m = composeOrgMap({ records: preparing, now: NOW, live: { practiceScene: scene } });
  assert.equal(p(m).workingMode, 'scene', 'a live scene wins: it is what he is doing');
  m = composeOrgMap({ records: [], now: NOW });
  assert.equal(p(m).working, false);
  assert.equal(p(m).workingMode, null);
  // stuck is not working, and nobody else has a mode
  const stuck = [{ id: 'old', kind: 'practice-skill', status: 'classifying', createdAt: ago(WORKING_MS / 60e3 + 5) }];
  assert.equal(p(composeOrgMap({ records: stuck, now: NOW })).workingMode, null);
  m = composeOrgMap({ records: [{ id: 'v', kind: 'video', status: 'classifying', createdAt: ago(1) }], now: NOW, live: { practiceScene: scene } });
  assert.equal(m.beings.find((b) => b.id === 'watcher').workingMode, null);
  assert.equal(m.beings.find((b) => b.id === 'leader').working, false, 'the scene is Practice\'s, not the Leader\'s');
});

test('a filed practice session is a delivery the map acts out', () => {
  const { events } = composeOrgMap({ records: [{ id: 's', kind: 'practice-session', status: 'filed', createdAt: ago(1), filedAt: ago(1), auto: true }], now: NOW });
  assert.deepEqual(events[0], { id: 's:filed', at: ago(1), source: 'record', being: 'practice', kind: 'practice-session', status: 'filed', answered: false });
});

test('liveScene: not ended, spoken in the last fifteen minutes; ended, undone or older is not live', async () => {
  const scenes = {
    fresh: { slug: 'a', scenario: 'x', startedAt: ago(40), turns: [{ who: 'you', at: ago(30) }, { who: 'partner', at: ago(3) }], ended: false },
    quiet: { slug: 'a', scenario: 'x', startedAt: ago(60), turns: [{ who: 'you', at: ago(16) }], ended: false },
    done: { slug: 'a', scenario: 'x', startedAt: ago(5), turns: [{ who: 'you', at: ago(1) }], ended: true },
    undone: { slug: 'a', scenario: 'x', startedAt: ago(5), turns: [], ended: false, undone: true },
  };
  assert.deepEqual(liveSceneOf({ scenes }, NOW), { startedAt: ago(40), lastTurnAt: ago(3) });
  assert.equal(liveSceneOf({ scenes: { quiet: scenes.quiet } }, NOW), null, 'sixteen minutes of silence is over');
  assert.equal(liveSceneOf({ scenes: { done: scenes.done, undone: scenes.undone } }, NOW), null);
  // a scene nobody has spoken in yet is live from its start, for fifteen minutes
  const just = { slug: 'a', scenario: 'x', startedAt: ago(2), turns: [], ended: false };
  assert.deepEqual(liveSceneOf({ scenes: { just } }, NOW), { startedAt: ago(2), lastTurnAt: null });
  assert.equal(liveSceneOf({ scenes: { just: { ...just, startedAt: new Date(NOW - LIVE_SCENE_MS - 1000).toISOString() } } }, NOW), null);
  // a turn stamped a moment after `now` was taken is still live
  assert.ok(liveSceneOf({ scenes: { just: { ...just, turns: [{ at: new Date(NOW + 2000).toISOString() }] } } }, NOW));
  assert.equal(liveSceneOf({ scenes: { bad: { startedAt: 'not a date', turns: [] } } }, NOW), null);
  assert.equal(liveSceneOf(null, NOW), null);
  // off the file: none, then a corrupt one, then a real one
  assert.equal(await liveScene(NOW), null, 'no file is no scene');
  await writeFile(path.join(dataDir, 'practice.json'), '{not json', 'utf8');
  assert.equal(await liveScene(NOW), null, 'an unreadable file is no scene');
  await writeFile(path.join(dataDir, 'practice.json'), JSON.stringify({ scenes: { fresh: scenes.fresh }, tallies: {} }), 'utf8');
  assert.deepEqual(await liveScene(NOW), { startedAt: ago(40), lastTurnAt: ago(3) });
});
