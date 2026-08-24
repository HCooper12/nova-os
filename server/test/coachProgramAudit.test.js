// The weekly program audit's contract. The point of this module is that a
// SILENT detector is legible: "checked, here is the number" must never be
// confused with "could not run" or with "quietly broken".
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditProgram, buildChecks, summarise, mondayOf } from '../lib/coachProgramAudit.js';

const session = (date, exerciseId, sets) => ({ date, exercises: [{ exerciseId, name: exerciseId, sets }] });
const rated = (n, rpe = 9) => Array.from({ length: n }, () => ({ weight: 40, reps: 8, rpe }));

// Enough history that only the checks under test are gated.
const manySessions = Array.from({ length: 14 }, (_, i) =>
  session(`2026-0${i < 9 ? '7' : '8'}-${String((i % 28) + 1).padStart(2, '0')}`, 'row', rated(8)));

const baseDeps = (over = {}) => ({
  now: new Date('2026-08-25T09:00:00'),
  review: async () => ({ findings: [] }),
  loadSessions: async () => manySessions,
  loadExercises: async () => [{ id: 'row', name: 'Row', muscleGroup: 'Back' }],
  goals: async () => ({}),
  focusOf: async () => ['Back'],
  volume: async () => [
    { week: '2026-08-24', groups: { Back: 12 } },
    { week: '2026-08-17', groups: { Back: 14 } },
    { week: '2026-08-10', groups: { Back: 18 } },
  ],
  loadRoutinesFor: async () => [{ id: 'pull', name: 'Pull', exercises: [{ exerciseId: 'row' }] }],
  ...over,
});

const byId = (checks, id) => checks.find((c) => c.id === id);

test('audit: a check that cannot run says so, and says what it still needs', async () => {
  const a = await auditProgram('/tmp/v', baseDeps());
  const tenure = byId(a.checks, 'tenure');
  assert.equal(tenure.status, 'not-yet', 'six weeks of history cannot answer a 16-week question');
  assert.match(tenure.detail, /16 weeks/);
  assert.match(tenure.detail, /you have/, 'the gap is named, not shrugged at');
  assert.notEqual(tenure.status, 'clear', 'unanswerable must never be reported as clean');
});

test('audit: a clear check carries the number that makes it clear', async () => {
  const a = await auditProgram('/tmp/v', baseDeps());
  const junk = byId(a.checks, 'junk-volume');
  assert.equal(junk.status, 'clear');
  // his real shape: peak 18 against a ceiling of 22
  assert.match(junk.detail, /peak was 18 hard sets/);
  assert.match(junk.detail, /headroom/, 'reassurance is a distance, not an adjective');
});

test('audit: a firing detector reports its finding rather than a clean bill', async () => {
  const a = await auditProgram('/tmp/v', baseDeps({
    review: async () => ({ findings: [{ kind: 'junk-volume', line: 'Back has run at 25 hard sets a week.' }] }),
  }));
  const junk = byId(a.checks, 'junk-volume');
  assert.equal(junk.status, 'fired');
  assert.equal(junk.count, 1);
  assert.match(junk.detail, /25 hard sets/);
});

test('audit: too little data gates the volume checks instead of passing them', async () => {
  const a = await auditProgram('/tmp/v', baseDeps({ volume: async () => [{ week: '2026-08-24', groups: { Back: 9 } }] }));
  assert.equal(byId(a.checks, 'junk-volume').status, 'not-yet');
  assert.match(byId(a.checks, 'junk-volume').detail, /needs 2 logged weeks, you have 1/);
});

test('audit: no goal muscles set is a reason, not a pass', async () => {
  const a = await auditProgram('/tmp/v', baseDeps({ focusOf: async () => [] }));
  const uv = byId(a.checks, 'under-volume');
  assert.equal(uv.status, 'not-yet');
  assert.match(uv.detail, /no goal muscles/);
});

test('audit: every check lands in exactly one of the three states', async () => {
  const a = await auditProgram('/tmp/v', baseDeps());
  assert.ok(a.checks.length >= 8, 'the whole detector set is audited, not a subset');
  for (const c of a.checks) {
    assert.ok(['fired', 'clear', 'not-yet'].includes(c.status), `${c.id} has a real status`);
    assert.ok(c.detail && c.detail.length > 3, `${c.id} explains itself`);
  }
});

test('summary: names what needs a decision, what was clean, and what could not run', () => {
  const line = summarise({
    fired: [{ label: 'A lift flat for three weeks' }],
    clear: [{ label: 'x' }, { label: 'y' }],
    notYet: [{ label: 'Same lift long enough to rotate', detail: 'needs 16 weeks, you have 5.4' }],
  });
  assert.match(line, /4 checks/);
  assert.match(line, /1 needs a decision/);
  assert.match(line, /2 came back clean/);
  assert.match(line, /can't be answered yet/);
  assert.match(line, /needs 16 weeks, you have 5.4/);
});

test('summary: a completely clean week still reports that the sweep happened', () => {
  const line = summarise({ fired: [], clear: [{ label: 'a' }, { label: 'b' }], notYet: [] });
  assert.match(line, /I ran 2 checks/);
  assert.match(line, /nothing needs a decision/);
  assert.match(line, /2 came back clean/);
});

test('buildChecks is pure: gates read only the measurements handed to them', () => {
  const measurements = {
    sessions: [], exercises: [], routines: [], weekly: [], goalMuscles: [],
    spanWeeks: 0, ratedSets: 0, maxWeeklySet: 0, longestRun: 0, ceiling: 22, tenureWeeks: 16,
  };
  const checks = buildChecks(measurements);
  // with nothing logged, NOTHING may claim to be clear
  for (const c of checks) {
    const blocked = c.gate();
    if (c.id === 'low-value' || c.id === 'mapping') continue; // gated on library/routines, asserted elsewhere
    assert.ok(blocked, `${c.id} must refuse to answer on an empty log`);
  }
});

test('mondayOf pins a week regardless of which day the audit runs', () => {
  const mon = mondayOf(new Date('2026-08-25T09:00:00')); // a Tuesday
  assert.equal(mon.getDay(), 1);
  assert.equal(mondayOf(new Date('2026-08-30T23:00:00')).getTime(), mon.getTime(), 'Sunday belongs to the same week');
});

// createRecord stores what it is given — it mints nothing. A record without
// an id is unaddressable: no route can discard it, no list can sort it. The
// first live run wrote exactly that into his real Inbox.
test('the weekly record is addressable: id, timestamps and the rails fields', async () => {
  const { runWeeklyAudit } = await import('../lib/coachProgramAudit.js');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  // the receipt writes to disk — keep it out of the real data dir
  process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-audit-'));
  const written = [];
  const now = new Date('2026-08-25T09:00:00');
  const { record } = await runWeeklyAudit('/tmp/v', {
    ...baseDeps({ now }),
    store: { createRecord: async (r) => { written.push(r); return r; } },
  });
  assert.equal(written.length, 1, 'exactly one record a week, not one per detector');
  assert.ok(record.id && typeof record.id === 'string', 'a record with no id can never be discarded');
  assert.ok(record.createdAt, 'and with no createdAt it cannot be sorted or nudged');
  assert.equal(record.kind, 'coach-audit');
  assert.equal(record.status, 'pending');
  assert.match(record.text, /^Coach: /);
  assert.ok(record.meta?.weekOf, 'the receipt knows which week it speaks for');
  assert.ok(Array.isArray(record.meta?.checks) && record.meta.checks.length >= 8);
});
