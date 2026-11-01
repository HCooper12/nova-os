// A PROJECT IN THE VOICE CONVERSATION, the client's half (src/projectVoice.js):
// what an ask carries, the intake state, the chip, and Nova's code-written
// line after his yes. Pure; no I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceAskExtras, intakeAfter, afterApproval, isResearchMove, moveKind, voiceAttachOf } from '../../src/projectVoice.js';

const PID = 'a1b2c3d4';
const SID = '11111111-2222-3333-4444-555555555555';

test('an ask with no project and no intake carries nothing extra: the ask is what it was', () => {
  assert.deepEqual(voiceAskExtras({}), {});
  assert.deepEqual(voiceAskExtras({ voiceProject: null, voiceIntake: null, sentProjectId: 'zzzz' }), {});
});

test('an attached project rides every ask, with projectFresh only on the first after attaching', () => {
  assert.deepEqual(voiceAskExtras({ voiceProject: { id: PID, name: 'Room' } }), { projectId: PID, projectFresh: true });
  assert.deepEqual(voiceAskExtras({ voiceProject: { id: PID, name: 'Room' }, sentProjectId: PID }), { projectId: PID });
  assert.deepEqual(voiceAskExtras({ voiceProject: { id: PID }, sentProjectId: 'bbbbbbbb' }), { projectId: PID, projectFresh: true });
});

test('while a project is being set up, every ask is the intake\'s turn (and nothing else rides)', () => {
  assert.deepEqual(voiceAskExtras({ voiceIntake: { sessionId: SID }, voiceProject: { id: PID } }), { intakeSessionId: SID });
});

test('the intake state follows the reply: continued, called off, failed; untouched by an ordinary reply', () => {
  assert.deepEqual(intakeAfter({ intake: { sessionId: SID, stage: 'asking' } }, null), { sessionId: SID });
  assert.deepEqual(intakeAfter({ intake: { sessionId: SID, stage: 'filed' } }, null), { sessionId: SID }, 'filed waits for his yes');
  assert.equal(intakeAfter({ intake: { sessionId: SID, stage: 'cancelled' } }, { sessionId: SID }), null);
  assert.equal(intakeAfter({ intake: { sessionId: SID, stage: 'error' } }, { sessionId: SID }), null);
  assert.deepEqual(intakeAfter({ text: 'plain' }, { sessionId: SID }), { sessionId: SID });
});

test('after his yes: where it lives and the first move, from the record; the offer only for research it may do', () => {
  const research = afterApproval({ id: PID, name: 'Garden shed', firstMoves: ['Research shed kits under 2 metres.'], allowances: { research: true } });
  assert.equal(research.say, "It's in Projects, as Garden shed. First move: Research shed kits under 2 metres. Shall I start with that?");
  assert.deepEqual(research.offer, { kind: 'project-first-move', projectId: PID, question: 'Research shed kits under 2 metres', jobKind: 'research' });
  const off = afterApproval({ id: PID, name: 'Shed', firstMoves: ['Find three kits'], allowances: { research: false } });
  assert.equal(off.offer, null);
  assert.match(off.say, /may not do that on its own yet; turn Research on/);
  const other = afterApproval({ id: PID, name: 'Shed', firstMoves: ['Measure the corner'], allowances: { research: true } });
  assert.equal(other.offer, null, 'not research: never claimed, never run');
  assert.match(other.say, /That one is on its page for you to start\.$/);
  assert.deepEqual(afterApproval({ id: PID, name: 'Shed', firstMoves: [] }), { say: "It's in Projects, as Shed.", offer: null });
  assert.ok(isResearchMove('look into flooring options'));
  assert.ok(!isResearchMove('buy timber'));
});

test('phase 3: a draft or code first move is offered on the same spoken yes, inside its allowance', () => {
  const draft = afterApproval({ id: PID, name: 'Shed', firstMoves: ['Draft a one-page plan'], allowances: { draft: true } });
  assert.equal(draft.offer.jobKind, 'draft');
  assert.match(draft.say, /Shall I start with that\?$/);
  const code = afterApproval({ id: PID, name: 'Site', firstMoves: ['Build a landing page'], allowances: { code: true } });
  assert.equal(code.offer.jobKind, 'code');
  const noCode = afterApproval({ id: PID, name: 'Site', firstMoves: ['Build a landing page'], allowances: { draft: true } });
  assert.equal(noCode.offer, null);
  assert.match(noCode.say, /turn Write code on/);
  assert.equal(moveKind('buy timber'), null);
  assert.equal(moveKind('Write the brief for the builder'), 'draft');
});

test('the chip: attached shows the name and detaches; a setup is called off; nothing otherwise', () => {
  const calls = [];
  const app = { cancelVoiceIntake: () => calls.push('cancel'), attachVoiceProject: (p) => calls.push(['attach', p]), openProject: (id) => calls.push(['open', id]) };
  assert.equal(voiceAttachOf({}, app), null);
  const a = voiceAttachOf({ voiceProject: { id: PID, name: 'Room redesign' } }, app);
  assert.equal(a.name, 'Room redesign');
  assert.equal(a.intake, false);
  a.detach(); a.open();
  assert.deepEqual(calls, [['attach', null], ['open', PID]]);
  const s = voiceAttachOf({ voiceIntake: { sessionId: SID }, voiceProject: { id: PID, name: 'Room' } }, app);
  assert.equal(s.intake, true);
  s.detach();
  assert.equal(calls.at(-1), 'cancel');
});

test('a Voice line about the attached project goes to the record with its projectId (the project page reads it back); others unchanged', async () => {
  const { pendingTurns } = await import('../../src/conversationSync.js');
  const at = Date.parse('2026-11-01T02:00:00Z');
  const rows = pendingTurns([
    { at, who: 'you', text: 'How wide is the wall?', projectId: PID },
    { at: at + 1, who: 'nova', text: 'About 3 metres.', projectId: PID },
    { at: at + 2, who: 'you', text: 'And the weather?' },
    { at: at + 3, who: 'you', text: 'bad id', projectId: '../x' },
  ], {}, { dev: 'dev1' });
  assert.deepEqual(rows.map((r) => r.projectId), [PID, PID, undefined, undefined]);
  assert.equal('projectId' in rows[2], false, 'a plain line is exactly as before');
});
