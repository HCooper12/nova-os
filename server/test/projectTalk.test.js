// THE PROJECT PAGE'S MICROPHONE (Projects phase 2, T6): what a turn's words
// become, what each failure says, Keep talking, barge-in, and the 'project'
// receipt surface on both sides. Pure (no mic, no network, no CLI); the one
// store touched is the turn log, in a temp NOVA_DATA_DIR set before import.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-ptalk-'));

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const talk = await import('../../src/projectTalk.js');
const { SURFACES } = await import('../../src/listenRules.js');
const { turnRecord } = await import('../lib/voiceTurns.js');
const { valsProjects } = await import('../../src/vals/valsProjects.js');

const PID = 'a1b2c3d4';

test('a heard transcript becomes a project turn carrying projectId, sent through sendProjectAsk as spoken', () => {
  assert.deepEqual(talk.projectTurnFromWords('  which rug   for the bed? ', PID), { projectId: PID, text: 'which rug for the bed?', spoken: true });
  const r = talk.afterProjectTurn({ words: 'which rug?', projectId: PID, info: { reason: 'hold', endedBy: 'clock', trigger: 'tap' } });
  assert.deepEqual(r.send, { projectId: PID, text: 'which rug?', spoken: true });
  assert.equal(r.line, null);
  // the view model's door is the typed turn's own path, with projectId
  const sent = [];
  const app = { state: { projectOpen: PID, liveProjects: [{ id: PID, name: 'Room', kind: 'life', stage: 'planning', phases: [] }], liveInbox: { items: [] }, voiceSpeak: true }, setState() {}, sendProjectAsk: (o) => sent.push(o) };
  valsProjects(app).page.conversation.sendSpoken('which rug?');
  assert.deepEqual(sent, [{ projectId: PID, text: 'which rug?', spoken: true }]);
  assert.equal(valsProjects(app, { isOffline: true }).page.conversation.offline, true);
});

test('an empty capture sends nothing and says "I did not catch that", no filler', () => {
  for (const words of ['', '   ', null, undefined]) {
    const r = talk.afterProjectTurn({ words, projectId: PID, info: { reason: 'lead', endedBy: 'clock', trigger: 'tap' } });
    assert.equal(r.send, null);
    assert.equal(r.line, talk.NOT_CAUGHT);
  }
  // a turn the screen or a mic that never opened cut short is not "not caught"
  assert.equal(talk.afterProjectTurn({ words: '', projectId: PID, info: { reason: 'hidden', endedBy: 'hidden' } }).line, null);
  assert.equal(talk.afterProjectTurn({ words: '', projectId: PID, info: { reason: 'mic-timeout', endedBy: 'mic' } }).line, null);
  assert.equal(talk.projectTurnFromWords('words', null), null, 'no project, no turn');
});

test('each way hearing fails says its real class; never a transcript; the typed box stays', () => {
  const perm = talk.hearingError('not-allowed');
  assert.equal(perm.kind, 'permission');
  assert.match(perm.line, /blocked.*Settings → Nova.*type/);
  assert.equal(talk.hearingError('audio-capture').kind, 'no-mic');
  assert.equal(talk.hearingError('The microphone did not open.').kind, 'mic-timeout');
  const off = talk.hearingError('Nova is not connected to the Mac, so it cannot hear you');
  assert.equal(off.kind, 'offline');
  const tx = talk.hearingError('the Mac could not hear that (502)');
  assert.equal(tx.kind, 'transcribe');
  assert.equal(tx.line, 'The Mac could not write that down: the Mac could not hear that (502). Nothing was sent; type it instead.');
  assert.equal(talk.hearingError('aborted').kind, 'engine');
  for (const e of ['not-allowed', 'x y', 'aborted', '']) assert.equal(talk.hearingError(e).typed, true);
  // the turn that failed hands over no words, so nothing is sent
  assert.equal(talk.afterProjectTurn({ words: '', projectId: PID, info: { reason: 'engine', endedBy: 'engine' } }).send, null);
});

test('barge-in: a tap while Nova speaks stops the speech, then listens; a tap while listening only ends the turn', () => {
  assert.deepEqual(talk.micTap({ on: false, speaking: true }), { stopSpeech: true, toggle: true });
  assert.deepEqual(talk.micTap({ on: false, speaking: false }), { stopSpeech: false, toggle: true });
  assert.deepEqual(talk.micTap({ on: true, speaking: true }), { stopSpeech: false, toggle: true });
});

test('Keep talking reopens exactly once per answer, only once Nova is quiet', () => {
  const base = { keepTalking: true, answerId: 3, reopenedFor: 2 };
  assert.equal(talk.reopenDecision({ ...base, speaking: true }), 'wait');
  assert.equal(talk.reopenDecision({ ...base, busy: true }), 'wait');
  assert.equal(talk.reopenDecision({ ...base, listening: true }), 'wait');
  assert.equal(talk.reopenDecision({ ...base, hearing: true }), 'wait');
  assert.equal(talk.reopenDecision(base), 'reopen');
  assert.equal(talk.reopenDecision({ ...base, reopenedFor: 3 }), 'none', 'never twice for one answer');
  assert.equal(talk.reopenDecision({ ...base, keepTalking: false }), 'none');
  assert.equal(talk.reopenDecision({ ...base, answerId: null }), 'none', 'no answer yet, nothing to reopen after');
  assert.equal(talk.reopenDecision({ ...base, paused: true }), 'none');
});

test('Keep talking stops on the quiet rule conversation mode uses: an auto-opened turn that heard nothing', () => {
  const quiet = talk.afterProjectTurn({ words: '', projectId: PID, info: { reason: 'lead', endedBy: 'clock', trigger: 'auto' } });
  assert.equal(quiet.keep, 'pause');
  assert.equal(quiet.send, null);
  // his own tap on an empty mic says nothing about wanting to stop
  assert.equal(talk.afterProjectTurn({ words: '', projectId: PID, info: { reason: 'tap', endedBy: 'tap', trigger: 'auto' } }).keep, 'rest');
  // a turn he opened gets the old allowance of two empties
  const one = talk.afterProjectTurn({ words: '', projectId: PID, info: { reason: 'lead', endedBy: 'clock', trigger: 'tap' }, empties: 0 });
  assert.equal(one.keep, 'rest');
  const two = talk.afterProjectTurn({ words: '', projectId: PID, info: { reason: 'lead', endedBy: 'clock', trigger: 'tap' }, empties: one.empties });
  assert.equal(two.keep, 'pause');
  // words reset the count
  assert.equal(talk.afterProjectTurn({ words: 'yes', projectId: PID, empties: 1 }).empties, 0);
});

test('the mic state and its words, from the hook and the app', () => {
  assert.equal(talk.micState({ on: true }), 'listening');
  assert.equal(talk.micState({ hearing: true }), 'transcribing');
  assert.equal(talk.micState({ speaking: true }), 'speaking');
  assert.equal(talk.micState({ offline: true, on: true }), 'offline');
  assert.equal(talk.micState({ supported: false }), 'unsupported');
  assert.equal(talk.micState({ error: { kind: 'permission' } }), 'error');
  assert.equal(talk.micState({}), 'idle');
  for (const k of ['unsupported', 'offline', 'listening', 'transcribing', 'speaking', 'thinking', 'idle']) assert.equal(typeof talk.MIC_LABEL[k], 'string');
});

test("the 'project' receipt surface is one list on both sides", () => {
  assert.ok(SURFACES.includes('project'));
  for (const s of SURFACES) assert.equal(turnRecord({ reason: 'hold', surface: s }).surface, s, `the server keeps surface ${s}`);
  assert.equal(turnRecord({ reason: 'hold', surface: 'nope' }).surface, 'voice', 'anything else is still voice');
  assert.deepEqual(SURFACES.slice(0, 4), ['voice', 'presence', 'barge', 'ask'], 'the old four, unchanged');
});
