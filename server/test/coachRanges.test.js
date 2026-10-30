// HIS WEEKLY SET RANGES, FROM HIS RESEARCH (31 Oct 2026). Code gathers the
// research and decides when to run; the model only sets the numbers and the
// reasons; code refuses any row it cannot ground, and one ranges card rides
// the goal-target rails so his yes writes them and Undo puts the prior back.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-ranges-data-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  gatherVolumeResearch, rangesDue, isThin, validateRanges, rangesCardRecord, runRangesLane, buildRangesPrompt,
  pendingRangesCard, GOAL_BAND, RANGES_EVERY_DAYS,
} = await import('../lib/coachRanges.js');
const { VOLUME_GROUPS } = await import('../../src/muscleTaxonomy.js');
const { getFitnessGoals } = await import('../lib/fitnessGoals.js');
const { createRecord } = await import('../lib/inboxStore.js');

const GOAL = ['Side Delts', 'Rear Delts', 'Lats', 'Upper Back', 'Biceps', 'Triceps'];
const DAY = 86_400_000;

function vaultWith(files) {
  const vault = mkdtempSync(path.join(tmpdir(), 'nova-ranges-vault-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true });
    writeFileSync(path.join(vault, rel), body);
  }
  return vault;
}
const BRIEF = '# Weekly Volume Brief\n\nMeta-analysis: 10-20 sets per week per muscle maximises hypertrophy [1]. Small muscles grow on 12+ sets a week [2].\n\n## Sources\n1. https://pubmed.ncbi.nlm.nih.gov/1\n2. https://pubmed.ncbi.nlm.nih.gov/2\n';
const SOURCES = [
  { path: 'Wiki/Inbox/Weekly Volume Brief.md', title: 'Weekly Volume Brief', kind: 'Researcher brief' },
  { path: 'Wiki/Sources/Delts Video.md', title: 'Delts Video', kind: 'video/podcast note' },
  { path: 'Wiki/Concepts/Volume.md', title: 'Volume', kind: 'note' },
];
const answer = (over = {}) => JSON.stringify({
  summary: 'Your research puts growth at 10-20 hard sets a week, higher for small muscles.',
  ranges: Object.fromEntries(VOLUME_GROUPS.map((m) => [m, { low: GOAL.includes(m) ? 12 : 6, high: GOAL.includes(m) ? 20 : 12, why: `Because the brief says so for ${m}.`, sources: ['Wiki/Inbox/Weekly Volume Brief.md'] }])),
  ...over,
});

/* ------------------------------ the research ------------------------------ */

test('the research: notes that make a weekly-dose claim about growth, ranked, with paths; never Nova\'s own outputs', async () => {
  const vault = vaultWith({
    'Wiki/Inbox/Weekly Volume Brief.md': BRIEF,
    'Wiki/Sources/Delts Video.md': '# Delts Video\n\nHe says 8 sets a week is enough for side delt growth.\n',
    'Raw/Long Podcast.md': '# Podcast\n\nhypertrophy chat. 10 sets per week. 12 sets per week. 15 sets per week. 20 sets per week.\n',
    'Outputs/Nova/2026-10/Core Split Weekly Sets per Muscle.md': '# Plan\n\n14 sets per week for muscle growth.\n',
    'Wiki/index.md': '# Index\n\n10 sets per week hypertrophy\n',
    'Wiki/Concepts/Unrelated.md': '# Sleep\n\nSleep 8 hours.\n',
  });
  const got = await gatherVolumeResearch(vault);
  const paths = got.map((s) => s.path);
  assert.ok(paths.includes('Wiki/Inbox/Weekly Volume Brief.md'));
  assert.ok(paths.includes('Wiki/Sources/Delts Video.md'));
  assert.ok(!paths.some((p) => p.startsWith('Outputs/')), 'a plan Nova drew is not evidence for itself');
  assert.ok(!paths.includes('Wiki/index.md'));
  assert.ok(!paths.includes('Wiki/Concepts/Unrelated.md'));
  const brief = got.find((s) => s.path === 'Wiki/Inbox/Weekly Volume Brief.md');
  assert.equal(brief.kind, 'Researcher brief');
  assert.match(brief.excerpt, /10-20 sets per week/);
  assert.equal(got.find((s) => s.path === 'Raw/Long Podcast.md').kind, 'transcript');
  assert.ok(paths.indexOf('Wiki/Inbox/Weekly Volume Brief.md') < paths.indexOf('Raw/Long Podcast.md'), 'a sourced brief outranks a transcript saying the same');
});

test('when it runs is code\'s call: never run, a new note, 30 days — never while a card waits', () => {
  const now = Date.parse('2026-10-31T09:00:00Z');
  assert.equal(rangesDue({ state: {}, sources: SOURCES, now }).due, true);
  const state = { lastRunAt: new Date(now - 2 * DAY).toISOString(), seen: SOURCES.map((s) => s.path) };
  assert.equal(rangesDue({ state, sources: SOURCES, now }).due, false, 'nothing new');
  const fresh = rangesDue({ state, sources: [...SOURCES, { path: 'Wiki/Inbox/New Brief.md', title: 'New Brief' }], now });
  assert.equal(fresh.due, true);
  assert.match(fresh.why, /new research: New Brief/);
  assert.equal(rangesDue({ state: { ...state, lastRunAt: new Date(now - RANGES_EVERY_DAYS * DAY).toISOString() }, sources: SOURCES, now }).due, true, 'monthly otherwise');
  assert.equal(rangesDue({ state: {}, sources: SOURCES, pending: true, now }).due, false, 'never stacks on a waiting card');
  assert.equal(isThin(SOURCES.slice(0, 2)), true);
  assert.equal(isThin(SOURCES), false);
});

test('the prompt hands over every path and every muscle, in the house units', () => {
  const p = buildRangesPrompt({ goal: 'Build a V-taper', goalMuscles: GOAL, sources: [{ ...SOURCES[0], excerpt: '10-20 sets per week' }], today: '2026-10-31' });
  assert.match(p, /Wiki\/Inbox\/Weekly Volume Brief\.md/);
  assert.match(p, /½ to each audited secondary/);
  for (const m of VOLUME_GROUPS) assert.ok(p.includes(m), m);
  assert.match(p, /the house default 10-20/);
});

/* ------------------------------ the validation ---------------------------- */

test('a grounded answer: every muscle a range, goal muscles first in his order', () => {
  const v = validateRanges(answer(), { sources: SOURCES, goalMuscles: GOAL });
  assert.equal(v.ok, true, v.error);
  assert.equal(v.rows.length, VOLUME_GROUPS.length);
  assert.deepEqual(v.rows.slice(0, 6).map((r) => r.muscle), GOAL);
  assert.deepEqual(v.rows[0], { muscle: 'Side Delts', low: 12, high: 20, goal: true, why: 'Because the brief says so for Side Delts.', sources: ['Wiki/Inbox/Weekly Volume Brief.md'] });
});

test('code refuses nonsense row by row: invented paths, no reason, outside the sane band, not a muscle, low over high', () => {
  const o = JSON.parse(answer());
  o.ranges.Chest.sources = ['Wiki/Inbox/A Study I Made Up.md'];
  o.ranges.Quads.why = '';
  o.ranges.Calves = { low: 30, high: 12, why: 'x', sources: [SOURCES[0].path] };
  o.ranges.Grip = { low: 2, high: 4, why: 'x', sources: [SOURCES[0].path] };
  o.ranges.Glutes = { low: 1, high: 40, why: 'x', sources: [SOURCES[0].path] };
  const v = validateRanges(JSON.stringify(o), { sources: SOURCES, goalMuscles: GOAL });
  assert.equal(v.ok, true, 'non-goal refusals keep the default; the card still goes');
  const why = Object.fromEntries(v.refused.map((r) => [r.muscle, r.why]));
  assert.match(why.Chest, /never handed/);
  assert.match(why.Quads, /no reason/);
  assert.match(why.Calves, /not whole numbers 1-40 with low under high/);
  assert.match(why.Grip, /not a volume muscle/);
  assert.match(why.Glutes, /outside the sane band/);
  assert.ok(!v.rows.some((r) => ['Chest', 'Quads', 'Calves', 'Glutes'].includes(r.muscle)));
});

test('a goal muscle that cannot be grounded refuses the WHOLE proposal; so does a goal range outside the band', () => {
  const o = JSON.parse(answer());
  delete o.ranges.Lats;
  const v = validateRanges(JSON.stringify(o), { sources: SOURCES, goalMuscles: GOAL });
  assert.equal(v.ok, false);
  assert.match(v.error, /no valid range for goal muscle Lats/);
  const o2 = JSON.parse(answer());
  o2.ranges['Side Delts'] = { low: 3, high: 8, why: 'tiny', sources: [SOURCES[0].path] };
  const v2 = validateRanges(JSON.stringify(o2), { sources: SOURCES, goalMuscles: GOAL });
  assert.equal(v2.ok, false);
  assert.match(v2.error, /Side Delts: 3-8 is outside the sane band for a goal muscle/);
  assert.ok(GOAL_BAND.low[0] >= 6);
  assert.equal(validateRanges('no json here', { sources: SOURCES, goalMuscles: GOAL }).ok, false);
});

/* -------------------------------- the card -------------------------------- */

test('the card is the goal-target card: ranges and their source in the payload, pending, keyed by date', () => {
  const v = validateRanges(answer(), { sources: SOURCES, goalMuscles: GOAL });
  const rec = rangesCardRecord({ rows: v.rows, summary: v.summary, sources: SOURCES, date: '2026-10-31', id: 'abc12345' });
  assert.equal(rec.status, 'pending');
  assert.equal(rec.key, 'coach-ranges:2026-10-31');
  assert.equal(rec.kind, undefined, "a Coach goal card has no kind — the deck reads it by route");
  assert.equal(rec.decision.route, 'goal-target');
  assert.deepEqual(rec.decision.payload.settings.volumeRanges['Side Delts'], [12, 20]);
  assert.deepEqual(rec.decision.payload.settings.volumeRangesSource, { by: 'coach-research', date: '2026-10-31', recordId: 'abc12345', sources: ['Wiki/Inbox/Weekly Volume Brief.md'] });
  assert.equal(rec.rangesProposal.rows.length, VOLUME_GROUPS.length);
  assert.deepEqual(rec.rangesProposal.sources, [{ path: 'Wiki/Inbox/Weekly Volume Brief.md', title: 'Weekly Volume Brief', kind: 'Researcher brief' }]);
  assert.equal(pendingRangesCard([rec]).id, 'abc12345');
});

test('his yes writes goals.volumeRanges and where they came from; Undo puts the page back as it was', async () => {
  const PAGE = '---\ntype: fitness-goals\ngoal: Build a V-taper\ndaysPerWeek: 4\n---\n# Fitness Goals\n\nHis notes.\n';
  const vault = vaultWith({ 'Wiki/Health/Fitness Goals.md': PAGE });
  const v = validateRanges(answer(), { sources: SOURCES, goalMuscles: GOAL });
  const rec = rangesCardRecord({ rows: v.rows, summary: v.summary, sources: SOURCES, date: '2026-10-31' });
  await createRecord(rec);
  assert.equal(readFileSync(path.join(vault, 'Wiki/Health/Fitness Goals.md'), 'utf8'), PAGE, 'nothing written before his yes');
  const { approveRecord, undoRecord } = await import('../lib/inbox.js');
  const done = await approveRecord(vault, rec.id);
  assert.equal(done.status, 'filed');
  const g = await getFitnessGoals(vault);
  assert.deepEqual(g.volumeRanges['Side Delts'], [12, 20]);
  assert.equal(g.volumeRangesSource.by, 'coach-research');
  assert.equal(g.volumeRangesSource.date, '2026-10-31');
  assert.equal(g.daysPerWeek, 4, 'the rest of his page stands');
  await undoRecord(vault, rec.id);
  const back = await getFitnessGoals(vault);
  assert.equal(back.volumeRanges, null);
  assert.equal(back.volumeRangesSource, null);
});

test('ranges set from a chat goal card are not "from your research": the source goes, and Undo brings it back', async () => {
  const PAGE = '---\ntype: fitness-goals\ngoal: Build a V-taper\nvolumeRanges:\n  Side Delts: [12, 20]\nvolumeRangesSource:\n  by: coach-research\n  date: "2026-10-31"\n  sources: ["Wiki/Inbox/x.md"]\n---\n# Fitness Goals\n';
  const vault = vaultWith({ 'Wiki/Health/Fitness Goals.md': PAGE });
  const { setGoalSettings } = await import('../lib/fitnessGoals.js');
  assert.equal((await getFitnessGoals(vault)).volumeRangesSource.date, '2026-10-31');
  const { prior } = await setGoalSettings(vault, { volumeRanges: { 'Side Delts': [14, 22] } });
  const g = await getFitnessGoals(vault);
  assert.deepEqual(g.volumeRanges['Side Delts'], [14, 22]);
  assert.equal(g.volumeRangesSource, null);
  await setGoalSettings(vault, prior);
  assert.equal((await getFitnessGoals(vault)).volumeRangesSource.date, '2026-10-31');
});

/* --------------------------------- the run -------------------------------- */

const baseDeps = (over = {}) => {
  let state = {};
  const filed = [];
  return {
    filed,
    get state() { return state; },
    deps: {
      laneEnabled: () => true,
      listRecords: async () => [],
      gather: async () => SOURCES.map((s) => ({ ...s, excerpt: '10-20 sets per week' })),
      readState: async () => state,
      writeState: async (p) => { state = { ...state, ...p }; return state; },
      goals: async () => ({ goal: 'Build a V-taper', goalMuscles: GOAL }),
      goalMuscles: GOAL,
      ask: async () => ({ text: answer(), costUsd: 1.23 }),
      file: async (r) => { filed.push(r); return r; },
      now: new Date('2026-10-31T09:00:00Z'),
      ...over,
    },
  };
};

test('a due run files ONE pending card and remembers what it read', async () => {
  const t = baseDeps();
  const out = await runRangesLane('/v', t.deps);
  assert.equal(out.status, 'filed', out.why);
  assert.equal(t.filed.length, 1);
  assert.equal(t.filed[0].status, 'pending');
  assert.deepEqual(t.state.seen, SOURCES.map((s) => s.path));
  assert.equal(t.state.lastCostUsd, 1.23);
  // run again: nothing new, nothing filed
  const again = await runRangesLane('/v', t.deps);
  assert.equal(again.status, 'skipped');
  assert.equal(t.filed.length, 1);
});

test('a waiting ranges card stops the run; a refused answer files nothing and says why', async () => {
  const waiting = baseDeps({ listRecords: async () => [{ key: 'coach-ranges:2026-10-30', status: 'pending' }] });
  assert.equal((await runRangesLane('/v', waiting.deps)).status, 'skipped');
  const bad = baseDeps({ ask: async () => ({ text: answer({ ranges: {} }) }) });
  const out = await runRangesLane('/v', bad.deps);
  assert.equal(out.status, 'refused');
  assert.equal(bad.filed.length, 0);
  assert.match(bad.state.lastError, /no valid range for goal muscles/);
  const broke = baseDeps({ ask: async () => { throw new Error("You've hit your session limit"); } });
  const e = await runRangesLane('/v', broke.deps);
  assert.equal(e.status, 'error');
  assert.equal(broke.filed.length, 0);
});

test('a thin vault asks the Researcher, once a month, and files nothing until the brief lands', async () => {
  const asks = [];
  const t = baseDeps({ gather: async () => SOURCES.slice(0, 1), startResearch: async (v, q) => { asks.push(q); return { id: 'r1' }; } });
  const first = await runRangesLane('/v', t.deps);
  assert.equal(first.status, 'waiting-on-research');
  assert.equal(asks.length, 1);
  assert.match(asks[0], /Weekly hard-set ranges per muscle group for hypertrophy/);
  assert.equal(t.filed.length, 0);
  const second = await runRangesLane('/v', t.deps);
  assert.equal(second.status, 'waiting-on-research');
  assert.equal(asks.length, 1, 'asked once, not every tick');
});

test('a switched-off lane does nothing', async () => {
  const t = baseDeps({ laneEnabled: () => false });
  assert.equal((await runRangesLane('/v', t.deps)).status, 'off');
  assert.equal(t.filed.length, 0);
});
