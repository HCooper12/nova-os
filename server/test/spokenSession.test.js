import test from 'node:test';
import assert from 'node:assert/strict';
import { takeSpokenSession, dropSpokenSession, localDay, _spokenSessionState } from '../lib/spokenSession.js';
import { buildResumedAsk } from '../lib/claudeCode.js';

test.beforeEach(() => dropSpokenSession());

test('the first ask mints a session; the next one resumes it (the whole point)', async () => {
  const a = takeSpokenSession();
  assert.equal(a.resumed, false, 'nothing to resume yet');
  assert.equal(a.reason, 'first-ask');
  const b = takeSpokenSession();
  assert.equal(b.resumed, true, 'the second ask reuses the conversation — no context rebuild, no cold CLI boot');
  assert.equal(b.sessionId, a.sessionId);
  assert.equal(b.turns, 2);
});

test('a new calendar day always starts fresh — "today" must never mean yesterday', async () => {
  const first = takeSpokenSession({ day: '2026-08-13' });
  const next = takeSpokenSession({ day: '2026-08-14' });
  assert.equal(next.resumed, false);
  assert.equal(next.reason, 'new-day');
  assert.notEqual(next.sessionId, first.sessionId);
});

test('the session ages out, bounding how stale the slower context can be', async () => {
  const t0 = 1_000_000;
  takeSpokenSession({ now: t0 });
  assert.equal(takeSpokenSession({ now: t0 + 19 * 60_000 }).resumed, true, 'inside the window, still fast');
  const aged = takeSpokenSession({ now: t0 + 21 * 60_000 });
  assert.equal(aged.resumed, false);
  assert.equal(aged.reason, 'aged-out');
});

test('the turn cap stops a conversation growing until its own history is the slow part', async () => {
  takeSpokenSession();
  for (let i = 0; i < 10; i += 1) takeSpokenSession(); // turns 2..11
  assert.equal(_spokenSessionState().turns, 11);
  assert.equal(takeSpokenSession().resumed, true, 'turn 12 is the last reuse');
  const capped = takeSpokenSession();
  assert.equal(capped.resumed, false);
  assert.equal(capped.reason, 'turn-cap');
  assert.equal(capped.turns, 1, 'the fresh session starts its own count');
});

test('a failed turn drops the session so the next ask never resumes a dead process', async () => {
  const first = takeSpokenSession();
  dropSpokenSession();
  const after = takeSpokenSession();
  assert.equal(after.resumed, false, 'a clean conversation, not a --resume onto something gone');
  assert.notEqual(after.sessionId, first.sessionId);
});

test('localDay is the LOCAL calendar day, not UTC', async () => {
  // A UTC-based day would roll over mid-evening in AEST and hand him
  // "yesterday's" numbers as today's for hours.
  assert.equal(localDay(new Date(2026, 7, 13, 23, 59)), '2026-08-13');
  assert.equal(localDay(new Date(2026, 7, 14, 0, 1)), '2026-08-14');
});

test('a resumed spoken turn re-states the volatile numbers and the one-shot rule', async () => {
  const text = buildResumedAsk({ question: 'How many steps today?', liveLine: 'steps today 4210', direct: true });
  assert.match(text, /Live now/, 'the fresh numbers ride every resumed turn');
  assert.match(text, /steps today 4210/);
  assert.match(text, /trust this over anything earlier/i, 'and explicitly outrank turn 1\'s snapshot');
  assert.match(text, /one-shot/i, 'the hands-free lane stays terse across a long conversation');
  assert.ok(text.endsWith('How many steps today?'), 'the question is last, so it is what the model answers');
});

test('a resumed turn with nothing volatile to say sends just the question', async () => {
  assert.equal(buildResumedAsk({ question: 'What is my focus?' }), 'What is my focus?');
  const direct = buildResumedAsk({ question: 'What is my focus?', direct: true });
  assert.match(direct, /one-shot/i);
  assert.ok(direct.endsWith('What is my focus?'));
});
