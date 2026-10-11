// THE WAYS INTO THE SKILL SETS (11 Oct 2026). His phone's "Org map | Skill
// sets" switch did nothing and his Mac never saw GET /api/skillsets, so these
// hold the three doors to the same promise: the live view model hands the
// switch a skill set to draw, the switch's handler fetches, the Index's
// Agents row opens it in one tap, and a being's Org map card opens it on him.
// Pure: no server, no fetch, no data dir written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeOrgMap } from '../lib/orgMap.js';
import { valsOps } from '../../src/vals/valsOps.js';
import { valsOrgMap } from '../../src/vals/valsOrgMap.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

function liveApp(over = {}) {
  const calls = [];
  const app = {
    state: { screen: 'ops', opsView: 'orgmap', liveOps: { pending: 0, orgMap: composeOrgMap({ records: [] }) }, ...over },
    setOpsView: (v) => calls.push(`view:${v}`),
    openSkillSets: (id) => calls.push(`skillsets:${id || ''}`),
    navigate: (s) => calls.push(`go:${s}`),
    setState: () => {},
  };
  return { app, calls };
}
const ctx = { demoMode: false, isOffline: false };

test('live, the switch is drawn over a live Org map and its tap reaches App.setOpsView', () => {
  const { app, calls } = liveApp();
  const v = valsOps(app, ctx);
  assert.equal(v.opsLive, true);
  assert.equal(v.orgMap.live, true);
  assert.equal(v.opsView, 'orgmap');
  v.setOpsView('skillsets');
  assert.deepEqual(calls, ['view:skillsets']);
});

test('live and still loading, Skill sets has something to draw, so Ops never falls back to the map', () => {
  const { app } = liveApp({ opsView: 'skillsets', liveSkillSets: null });
  const v = valsOps(app, ctx);
  assert.ok(v.skillSets, 'a falsy skillSets would put the Org map back under a selected "Skill sets"');
  assert.equal(v.skillSets.agents.length, 10);
});

test('App: choosing Skill sets fetches it, and the Index door is a real method that lands on Ops', () => {
  const src = read('src/App.jsx');
  const setView = src.slice(src.indexOf('  setOpsView(view) {'), src.indexOf('  openSkillSets('));
  assert.match(setView, /if \(view === 'skillsets'\) this\.loadSkillSets\(\);/);
  const open = src.slice(src.indexOf('  openSkillSets('), src.indexOf('  loadSkillSets() {'));
  assert.match(open, /this\.navigate\('ops'\);/);
  assert.match(open, /opsView: 'skillsets'/);
  assert.match(open, /this\.loadSkillSets\(\);/);
  // the switch itself stays on Ops, live branch included
  const ops = read('src/screens/Ops.jsx');
  assert.equal((ops.match(/<OpsViewSwitch /g) || []).length, 4);
});

test('a being\'s Org map card opens his skill set; the core\'s card offers none', () => {
  const { app, calls } = liveApp({ orgMapSelected: 'coach' });
  const m = valsOrgMap(app.state.liveOps, app, ctx);
  m.openSkillSet('coach');
  assert.deepEqual(calls, ['skillsets:coach']);
  const card = read('src/orgmap/OrgMap.jsx');
  assert.match(card, /c\.id !== 'core' && onSkillSet && <TextAction compact onClick=\{\(\) => onSkillSet\(c\.id\)\}>Skill set →<\/TextAction>/);
});

test('cupertino\'s More sheet (his phone) has the Agents door too, with the honest label', () => {
  const chrome = read('src/MobileChrome.jsx');
  assert.match(chrome, /onClick=\{\(\) => \{ setMoreOpen\(false\); v\.openAgents\(\); \}\}/);
  assert.match(chrome, /<TabIcon name="agents" size=\{22\} \/>/);
  assert.match(chrome, /\{v\.agentsIndexLabel && <span/);
  assert.match(read('src/vals/valsChrome.js'), /openAgents: \(\) => app\.openSkillSets\(\),/);
  assert.match(read('src/TabIcon.jsx'), /^ {2}agents: </m);
});
