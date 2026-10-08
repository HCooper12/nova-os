// THE WALL'S AGENTS (mockup 86, blend 1, his pick of 9 Oct 2026). The wall
// says who is waiting on him and who is working; the Org map says the same
// thing on Ops. They must be one reading, not two that happen to agree:
// these hold that the wall's waiting comes from the Org map's own functions,
// its working from agentsWorking.js, and that no signal shows nobody.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeOrgMap } from '../lib/orgMap.js';
import { wallAgents, agoWords } from '../../src/vals/valsWall.js';
import { waitingBeings, beingAsks } from '../../src/vals/valsOrgMap.js';
import { workingBeingIds } from '../../src/vals/agentsWorking.js';
import { BEING_HUES } from '../../src/agentWorld/beings.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFile(path.join(ROOT, f), 'utf8');
const NOW = Date.parse('2026-10-09T08:00:00Z');
const at = (min) => new Date(NOW - min * 60e3).toISOString();
const rec = (id, kind, min, status = 'pending') => ({ id, kind, status, createdAt: at(min), decision: { title: `ask ${id}` } });

const RECORDS = [
  rec('a', 'money', 40), rec('b', 'cfo', 120), rec('c', 'coach-program', 12), rec('d', 'leader-followup', 180),
  rec('e', null, 5), rec('f', 'build', 7),
  rec('w1', 'research', 2, 'classifying'), rec('w2', 'coach', 45, 'classifying'),
];
const ops = () => ({ pending: 6, orgMap: composeOrgMap({ records: RECORDS, now: NOW }) });
const st = { liveInbox: { items: RECORDS }, guardianBusy: true };

test('who waits, and what each asks, is the Org map\'s own reading', () => {
  const o = ops();
  const w = wallAgents({ ops: o, st, now: NOW });
  const map = waitingBeings(o.orgMap);
  assert.deepEqual(w.waiting.map((b) => [b.id, b.n]), map.map((b) => [b.id, b.waiting]));
  assert.deepEqual(w.waiting.map((b) => b.id), ['cfo', 'coach', 'leader'], 'most first, then the roster order');
  for (const b of w.waiting) {
    const ref = beingAsks(map.find((x) => x.id === b.id), NOW);
    assert.deepEqual(b.asks.map((a) => a.id), ref.asks.map((a) => a.id));
    assert.equal(b.more, ref.more);
  }
  assert.equal(w.total, o.orgMap.waitingTotal, 'the gold number is the Org map\'s total');
  assert.equal(w.total, 6);
  assert.equal(w.yours.n, 1, 'his own capture is counted and named');
  assert.equal(w.unfiled.n, 1, 'a kind with no being is counted and named');
});

test('who is working is agentsWorking.js, and a stuck record is not working', () => {
  const w = wallAgents({ ops: ops(), st, now: NOW });
  const ids = [...workingBeingIds(st, NOW)];
  assert.deepEqual(w.working.map((b) => b.id).sort(), ids.sort());
  assert.deepEqual(w.working.map((b) => b.id), ['guardian', 'researcher']);
  assert.equal(w.workLine, 'Working now: the Guardian and the Researcher');
  assert.ok(w.all.find((b) => b.id === 'coach').working === false, 'a coach record 45 minutes old is stuck, not working');
});

test('no signal, demo and offline show nobody and say so', () => {
  for (const args of [{ ops: null }, { ops: ops(), demoMode: true }, { ops: ops(), isOffline: true }]) {
    const w = wallAgents({ st, now: NOW, syncMin: 41, ...args });
    assert.equal(w.signal, false);
    assert.equal(w.total, null);
    assert.deepEqual(w.waiting, []);
    assert.deepEqual(w.working, []);
    assert.equal(w.whoLine, 'No signal from the Mac · last synced 41 min ago');
    assert.ok(w.all.every((b) => b.opacity === 0.4));
  }
});

test('the words, written by code from the counts', () => {
  const quiet = wallAgents({ ops: { pending: 0, orgMap: composeOrgMap({ records: [], now: NOW }) }, st: {}, now: NOW });
  assert.equal(quiet.whoLine, 'Nothing waits on you');
  assert.equal(quiet.sayLine, 'Nothing is waiting on you.');
  assert.equal(quiet.workLine, '');
  const one = wallAgents({ ops: { pending: 1, orgMap: composeOrgMap({ records: [rec('c', 'coach-program', 12)], now: NOW }) }, st: {}, now: NOW });
  assert.equal(one.whoLine, 'The Coach');
  assert.equal(one.sayLine, 'The Coach is asking you one thing.');
  const several = wallAgents({ ops: ops(), st: {}, now: NOW });
  assert.equal(several.whoLine, 'The CFO, the Coach and 3 others');
  assert.equal(several.sayLine, 'Six things wait on you: 2 from the CFO, 1 from the Coach, 1 from the Leader, 1 of your own to sort and 1 with no one on the map yet.');
  assert.equal(agoWords('12m'), '12 min ago');
  assert.equal(agoWords('2h'), '2 h ago');
  assert.equal(agoWords('now'), 'just now');
});

test('every being has its hues and a portrait on disk', async () => {
  const { BEINGS } = await import('../lib/orgMap.js');
  for (const b of BEINGS) {
    assert.ok(BEING_HUES[b.id], `${b.id} has no hues`);
    await readFile(path.join(ROOT, 'public/agents', `${b.id}.png`));
  }
});

test('source contract: one source, a findable way out, a capped core', async () => {
  const wall = await read('src/vals/valsWall.js');
  assert.match(wall, /import \{ waitingBeings, beingAsks, beingLine, DISTRICT_NAME \} from '\.\/valsOrgMap\.js'/);
  assert.match(wall, /import \{ workingBeingIds \} from '\.\/agentsWorking\.js'/);
  const orgmap = await read('src/vals/valsOrgMap.js');
  assert.match(orgmap, /\.\.\.beingAsks\(b, now\)/, 'the Org map card reads its asks through beingAsks');
  const opsVals = await read('src/vals/valsOps.js');
  assert.match(opsVals, /exitAmbient: \(\) => app\.exitAmbient\(\)/);
  assert.doesNotMatch(opsVals, /exitAmbient: \(\) => app\.navigate\('mission'\)/, 'the old exit pushed Home over the wall');
  const app = await read('src/App.jsx');
  assert.match(app, /exitAmbient\(\) \{[\s\S]{0,400}window\.history\.back\(\)/, 'Done must pop the wall\'s entry');
  const screen = await read('src/screens/Ambient.jsx');
  assert.match(screen, /fps=\{30\}/, 'the wall\'s core is capped at 30 frames');
  assert.match(screen, /className="cb done"/);
  assert.doesNotMatch(screen, /onClick=\{v\.exitAmbient\}/, 'a bump must never end the wall');
  assert.doesNotMatch(screen, /radial-gradient/, 'no colour wash for a state');
  for (const f of ['src/SummaryDock.jsx', 'src/MobileChrome.jsx', 'src/Sidebar.jsx']) {
    assert.match(await read(f), /still=\{!!v\.isAmbient\}/, `${f}'s core still draws under the wall`);
  }
});
