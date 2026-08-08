// Ritual questions are versioned scaffolding: the model narrates, the
// dispatch supplies every number, and the contract lines below are what the
// client experience depends on.
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildRitualQuestion, ritualLabel, RITUAL_KINDS } = await import('../lib/rituals.js');

test('morning ritual: dispatch embedded, one-question contract, no reflection bits', () => {
  const q = buildRitualQuestion('morning', '**Training.** Push day.\n**Protein.** 40g so far.');
  assert.match(q, /MORNING BRIEF/);
  assert.match(q, /not his words/);
  assert.match(q, /exactly ONE question/);
  assert.match(q, /Push day/);
  assert.ok(!q.includes('journal entry'), 'no evening scaffolding in the morning');
});

test('evening ritual: debrief contract — journal PROPOSE + review-concept close', () => {
  const q = buildRitualQuestion('evening', '**Review.** Today\'s concept: Buying Back Time.');
  assert.match(q, /EVENING REFLECTION/);
  assert.match(q, /ONE question per turn/);
  assert.match(q, /PROPOSE \{"kind":"capture","text":"Journal:/);
  assert.match(q, /review concept/);
  assert.match(q, /Buying Back Time/);
});

test('unknown kinds throw; a missing dispatch degrades honestly', () => {
  assert.throws(() => buildRitualQuestion('midday', 'x'), /unknown ritual/);
  const q = buildRitualQuestion('morning', '');
  assert.match(q, /dispatch unavailable — say so honestly/);
  assert.deepEqual(RITUAL_KINDS, ['morning', 'evening', 'about-you']);
  assert.equal(ritualLabel('morning'), '☀ Morning brief');
  assert.equal(ritualLabel('evening'), '☾ Evening reflection');
});
