// The debrief remembers itself — per routine for the next fact sheet, per
// session for the history view, one line for the Coach chat. Temp data dir
// BEFORE imports.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-debrief-mem-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_COACH_CADENCE = 'on';

import test from 'node:test';
import assert from 'node:assert/strict';

const { rememberDebrief, lastDebriefFor, debriefsForSessions, lastDebriefLine, debriefMemoryContext } = await import('../lib/debriefMemory.js');
const { debriefFacts } = await import('../lib/coachCadence.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('a debrief is remembered per routine and per session; empty text is not', async () => {
  assert.equal(await rememberDebrief({ routineId: 'pull', sessionId: 's1', text: '   ' }), null);
  const e = await rememberDebrief({ routineId: 'pull', routineName: 'Pull', sessionId: 's1', date: '2026-09-01', text: 'Rows were the story today — lead with them next Pull.' });
  assert.equal(e.routineId, 'pull');
  assert.deepEqual((await lastDebriefFor('pull')).text, e.text);
  assert.equal(await lastDebriefFor('push'), null);
  const bySession = await debriefsForSessions(['s1', 'nope']);
  assert.equal(bySession.s1.text, e.text);
  assert.equal(bySession.nope, undefined);
  assert.match(lastDebriefLine(e), /^YOUR LAST DEBRIEF FOR THIS ROUTINE \(2026-09-01 — follow up on its carry/);
  assert.match(lastDebriefLine(e), /never re-read it back/);
  assert.equal(lastDebriefLine(null), null);
  assert.match(await debriefMemoryContext('pull'), /WHAT YOU SAID AT THE RACK after his last Pull session \(2026-09-01\): "Rows were the story today/);
  assert.equal(await debriefMemoryContext('push'), null);
  // a later debrief for the same routine replaces the routine memory, keeps both sessions
  await rememberDebrief({ routineId: 'pull', routineName: 'Pull', sessionId: 's2', date: '2026-09-03', text: 'You led with the row — good. Now the pulldown.' });
  assert.match((await lastDebriefFor('pull')).text, /^You led with the row/);
  assert.equal(Object.keys(await debriefsForSessions(['s1', 's2'])).length, 2);
});

test('the fact sheet carries recovery, the pushed-forward work on a cut-short session, and the last same-routine debrief — never its own', async () => {
  const session = { id: 's3', date: '2026-09-03', routineId: 'pull', routineName: 'Pull', cutShort: 'ran out of time',
    exercises: [{ name: 'Row', sets: [{ weight: 60, reps: 10, rpe: 8 }] }] };
  const deps = {
    sessions: [session, { id: 's0', date: '2026-08-30', routineId: 'pull', routineName: 'Pull', exercises: [{ name: 'Row', sets: [{ weight: 60, reps: 9 }] }] }],
    recentDays: [{ date: '2026-09-03', hrv: 61.4, sleepAsleepMinutes: 402 }],
    carryovers: [{ id: 'c1', forDate: '2026-09-05', sourceRoutineName: 'Pull', createdAt: '2026-09-03T14:00:00.000Z', exercises: [{ name: 'Wide-Grip Lat Pulldown' }, { name: 'Dead Hang' }] }],
    lastDebrief: { text: 'You led with the row — good. Now the pulldown.', date: '2026-09-01', sessionId: 's2', routineId: 'pull' },
  };
  const { facts } = await debriefFacts('/nonexistent-vault', session, deps);
  const text = facts.join('\n');
  assert.match(text, /Session CUT SHORT — his reason: ran out of time/);
  assert.match(text, /Pushed forward from this session: Wide-Grip Lat Pulldown, Dead Hang \(due 2026-09-05\)/);
  assert.match(text, /Recovery today: HRV 61 \(2026-09-03\), sleep 6\.7h/);
  assert.match(text, /YOUR LAST DEBRIEF FOR THIS ROUTINE \(2026-09-01/);
  assert.match(text, /Previous Pull \(2026-08-30\)/);
  // the memory for THIS session is not quoted back to itself
  const self = await debriefFacts('/nonexistent-vault', session, { ...deps, lastDebrief: { ...deps.lastDebrief, sessionId: 's3' } });
  assert.doesNotMatch(self.facts.join('\n'), /YOUR LAST DEBRIEF/);
  // no memory, no line; no carry-overs, no line
  const cold = await debriefFacts('/nonexistent-vault', { ...session, cutShort: null }, { ...deps, lastDebrief: null, carryovers: [] });
  assert.doesNotMatch(cold.facts.join('\n'), /YOUR LAST DEBRIEF|Pushed forward/);
});
