// The Org Map's view model (AGENT-WORLD-PLAN §3). Its whole promise is that
// the picture is the records: every loop stands somewhere, every record kind
// is someone's, and nothing is drawn working that is not.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BEINGS, DISTRICTS, BEING_MEMBERS, KIND_BEING, UNFILED_KINDS, WORKING_MS,
  beingForRecord, composeOrgMap, orgHeadline,
} from '../lib/orgMap.js';
import { scheduledFleet, conversationalRoster, AGENT_DEPARTMENTS } from '../lib/ops.js';
import { KIND_AGENT } from '../lib/fleetContext.js';

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

test('the same records in give the same map out', () => {
  const records = [{ id: 'x', kind: 'dispatch', status: 'pending', createdAt: ago(1) }];
  assert.deepEqual(composeOrgMap({ records, now: NOW }), composeOrgMap({ records, now: NOW }));
});
