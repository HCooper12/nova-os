// THE SKILL SETS (mockup 97): suggestions counted from each real signal, his
// tick filed on the rails with Undo, his cross retired with Undo, and no
// number where a source is missing. Never posts to the conversation record:
// the "asked" signal is fed rows directly.
import { mkdtemp, mkdir, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-skillsets-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-skillsets-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const lib = await import('../lib/skillSets.js');
const { parseSkills, parseBacklog, ensureSkillsFile, SKILLS_REL } = await import('../lib/skills.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { valsSkillSets, DEMO_SKILLSETS } = await import('../../src/vals/valsSkillSets.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });
test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const NOW = Date.parse('2026-10-11T02:00:00Z');
const ago = (d) => new Date(NOW - d * 86_400_000).toISOString();

test('asked: a reply that said it could not, after his question in an agent lane, counts', () => {
  const turns = [];
  for (let i = 0; i < 3; i++) {
    turns.push({ id: `y${i}`, who: 'you', at: ago(i + 1), text: 'Split the dinner bill with Sam and say who owes what' });
    turns.push({ id: `n${i}`, who: 'nova', at: ago(i + 1), text: 'No agent can do that yet, sorry.' });
  }
  // a plain answer is not a miss; a miss with no lane is skipped
  turns.push({ id: 'y9', who: 'you', at: ago(1), text: 'What is the time?' });
  turns.push({ id: 'n9', who: 'nova', at: ago(1), text: "I can't do that." });
  const s = lib.deriveSuggestions({ records: [], turns, now: NOW });
  assert.equal(s.length, 1);
  assert.equal(s[0].agent, 'cfo');
  assert.equal(s[0].kind, 'asked');
  assert.equal(s[0].count, 3);
  assert.match(s[0].source, /conversation record/);
});

test('hand: his own captures to one route, five or more in four weeks', () => {
  const recs = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, status: 'filed', createdAt: ago(i), filedAt: ago(i), decision: { route: 'food' } }));
  recs.push({ id: 'old', status: 'filed', createdAt: ago(40), decision: { route: 'food' } }); // outside the window
  recs.push({ id: 'x', kind: 'coach', status: 'filed', createdAt: ago(1), decision: { route: 'food' } }); // an agent's, not his
  const s = lib.deriveSuggestions({ records: recs, turns: [], now: NOW });
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].agent, s[0].kind, s[0].count], ['mealprep', 'hand', 6]);
  // four is below the bar
  assert.equal(lib.deriveSuggestions({ records: recs.slice(2), turns: [], now: NOW }).length, 0);
});

test('inbox: an agent kind he declined three times, with his most common reason', () => {
  const recs = [
    ...Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, kind: 'coach-program', status: 'discarded', discardedAt: ago(i), createdAt: ago(i), declineReason: 'Too heavy' })),
    { id: 'e', kind: 'coach-program', status: 'discarded', expired: true, createdAt: ago(1) },
    { id: 'r', kind: 'coach-program', status: 'discarded', reason: 'retried', createdAt: ago(1) },
  ];
  const s = lib.deriveSuggestions({ records: recs, turns: null, now: NOW });
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].agent, s[0].kind, s[0].count], ['coach', 'inbox', 3]);
  assert.match(s[0].evidence, /Too heavy/);
});

test('every registry skill finds its agent, and the Watcher stays honest at zero', async () => {
  await ensureSkillsFile(vault);
  const deps = parseSkills(await readFile(path.join(vault, SKILLS_REL), 'utf8'));
  const p = lib.composeSkillSets({ departments: deps, backlog: [], records: [], turns: [], consultable: ['nova', 'coach', 'leader', 'researcher', 'librarian', 'cfo'], now: NOW });
  const total = deps.reduce((n, d) => n + d.skills.length, 0);
  const placed = p.agents.reduce((n, a) => n + a.skills.reduce((m, g) => m + g.skills.length, 0), 0);
  assert.equal(placed, total);
  const w = p.agents.find((a) => a.id === 'watcher');
  assert.deepEqual(w.skills, []);
  assert.ok(w.notYet.some((x) => /consulted/.test(x.text)));
  assert.ok(!p.agents.find((a) => a.id === 'coach').notYet.some((x) => /consulted/.test(x.text)));
  assert.equal(p.signals.lend, 'not yet');
});

test('no source, no number: missing registry and records come back null, never zero', () => {
  const p = lib.composeSkillSets({ now: NOW });
  for (const a of p.agents) {
    assert.equal(a.skills, null);
    assert.equal(a.runs, null);
    assert.deepEqual(a.suggestions, []);
  }
  assert.equal(p.signals.asked, 'unavailable');
  assert.equal(p.signals.hand, 'unavailable');
});

test('a tick files on the rails to the build list, and Undo takes it off', async () => {
  const s = { id: 'hand-mealprep-food', agent: 'mealprep', kind: 'hand', skill: 'Log your usual meals for you from the rotation', count: 6, evidence: 'food captures', source: 'Inbox' };
  const { record } = await lib.acceptSuggestion(vault, s);
  assert.equal(record.kind, 'skill-suggest');
  assert.equal(record.status, 'filed');
  assert.equal(record.undoData.route, 'skill-backlog');
  let raw = await readFile(path.join(vault, SKILLS_REL), 'utf8');
  const bl = parseBacklog(raw);
  assert.ok(bl.some((i) => i.text === 'Meal Prep: Log your usual meals for you from the rotation'));
  // never a capability: the registry parser does not see it
  assert.ok(!parseSkills(raw).some((d) => d.skills.some((k) => /usual meals/.test(k.text))));
  // it shows under Not yet for that agent, and is gone from suggestions
  const p = lib.composeSkillSets({ departments: parseSkills(raw), backlog: bl, records: [], turns: [], state: await lib.readAnswers(), now: NOW });
  assert.ok(p.agents.find((a) => a.id === 'mealprep').notYet.some((x) => /usual meals/.test(x.text)));
  assert.equal(lib.applyAnswers([s], await lib.readAnswers(), NOW).length, 0);

  await lib.undoSuggestion(vault, s.id);
  raw = await readFile(path.join(vault, SKILLS_REL), 'utf8');
  assert.ok(!raw.includes('usual meals'));
  assert.equal((await getRecord(record.id)).status, 'undone');
  assert.equal(lib.applyAnswers([s], await lib.readAnswers(), NOW).length, 1);
});

test('a cross retires it for 60 days, and Undo brings it back', async () => {
  const s = { id: 'inbox-coach-coach-program', agent: 'coach', skill: 'x', count: 3 };
  await lib.dismissSuggestion(s, { now: new Date(NOW) });
  const st = await lib.readAnswers();
  assert.equal(lib.applyAnswers([s], st, NOW + 59 * 86_400_000).length, 0);
  assert.equal(lib.applyAnswers([s], st, NOW + 61 * 86_400_000).length, 1);
  await lib.undoSuggestion(vault, s.id);
  assert.equal(lib.applyAnswers([s], await lib.readAnswers(), NOW).length, 1);
});

test('no test here wrote to the conversation record', async () => {
  const files = await readdir(dataDir);
  assert.ok(!files.includes('conversation'));
});

/* ------------------------------ view model ------------------------------ */
const noop = () => {};
const app = { setState: noop, skillSuggestion: noop, talkAboutSkill: noop, openSkillSheet: noop, closeSkillSheet: noop };

test('view model: demo is labelled demo, and every number carries the DEMO tag', () => {
  const v = valsSkillSets({ st: {}, app, demoMode: true, isOffline: false, now: NOW });
  assert.equal(v.state, 'demo');
  assert.equal(v.demo, true);
  assert.equal(v.agents.length, 10);
  assert.ok(v.agents.every((a) => a.demo));
  assert.ok(DEMO_SKILLSETS.agents.length === 10);
});

test('view model: offline keeps names, withholds every live value and says why', () => {
  const v = valsSkillSets({ st: {}, app, demoMode: false, isOffline: true, now: NOW });
  assert.equal(v.state, 'offline');
  for (const a of v.agents) {
    assert.equal(a.status.kind, 'offline');
    assert.equal(a.runs, null);
    assert.equal(a.working, null);
    assert.equal(a.canPlay, false);
  }
  assert.equal(v.workingLine, null);
});

test('view model: live, with no orgMap heartbeat it says "not known", never a time', () => {
  const live = lib.composeSkillSets({ departments: [{ name: 'Train', skills: [{ text: 'Log workout sessions', autonomy: 'act-on-approval' }] }], backlog: [], records: [], turns: [], consultable: ['coach'], now: NOW });
  const v = valsSkillSets({ st: { liveSkillSets: live, liveInbox: { items: [] } }, app, demoMode: false, isOffline: false, now: NOW });
  assert.equal(v.state, 'live');
  const coach = v.agents.find((a) => a.id === 'coach');
  assert.equal(coach.skillCount, 1);
  assert.equal(coach.status.kind, 'unknown');
  assert.equal(v.workingLine, 'NONE WORKING');
  assert.equal(v.agents.find((a) => a.id === 'watcher').skillCount, 0);
});

test('view model: a classifying record makes its agent working, and he does not play', () => {
  const live = lib.composeSkillSets({ departments: [], backlog: [], records: [], turns: [], now: NOW });
  const items = [{ id: 'r1', kind: 'research', status: 'classifying', createdAt: new Date(NOW - 60_000).toISOString(), text: 'creatine and sleep' }];
  const v = valsSkillSets({ st: { liveSkillSets: live, liveInbox: { items } }, app, demoMode: false, isOffline: false, now: NOW });
  const r = v.agents.find((a) => a.id === 'researcher');
  assert.equal(r.working, true);
  assert.equal(r.status.kind, 'working');
  assert.equal(r.canPlay, false);
  assert.equal(v.workingLine, '1 WORKING NOW');
});

test('view model: no data yet is the loading state, not empty slabs', () => {
  const v = valsSkillSets({ st: {}, app, demoMode: false, isOffline: false, now: NOW });
  assert.equal(v.state, 'loading');
});
