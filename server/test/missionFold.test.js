// C1 — the fold. Which sections open by default, whose choice wins, and what
// the one line under a folded header says. Pinned because the status line is
// the section's honesty at a glance: a missing value must read as a gap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFolds, resolveFolds, foldStatus, NEVER_FOLD, FOLD_LABELS } from '../../src/missionFold.js';

test('the first two present sections stay open, the rest fold', () => {
  const f = defaultFolds(['focus', 'lead', 'today', 'deck', 'vitals']);
  assert.deepEqual(f, { focus: 'open', lead: 'open', today: 'fold', deck: 'fold', vitals: 'fold' });
});

test('WORKING and PLAN are never folded and never use up an open slot', () => {
  const f = defaultFolds(['working', 'focus', 'plan', 'lead', 'today']);
  assert.equal(f.working, 'open');
  assert.equal(f.plan, 'open');
  assert.equal(f.focus, 'open');
  assert.equal(f.lead, 'open', 'plan did not consume the second slot');
  assert.equal(f.today, 'fold');
  assert.deepEqual(NEVER_FOLD, ['working', 'plan']);
});

test('what he remembered beats the default in both directions', () => {
  const f = resolveFolds(['focus', 'lead', 'today'], { focus: 'fold', today: 'open', junk: 'open', lead: 'nonsense' });
  assert.equal(f.focus, 'fold', 'he folded it');
  assert.equal(f.today, 'open', 'he opened it');
  assert.equal(f.lead, 'open', 'an unknown value falls back to the default');
  assert.ok(!('junk' in f), 'a remembered key that is not present does not appear');
});

test('every foldable section has a label', () => {
  for (const k of ['hero', 'vitals', 'focus', 'lead', 'today', 'deck', 'review', 'noticed', 'shortcuts', 'agents']) {
    assert.ok(FOLD_LABELS[k], `no label for ${k}`);
  }
});

test('vitals status reads the rings, and a hole is a dash, not a zero', () => {
  assert.equal(foldStatus('vitals', { satSleep: { value: '7h12', small: '' }, satSteps: { value: 8420 }, satProtein: { value: '—' } }), '7h12 sleep · 8420 steps · — protein');
  assert.equal(foldStatus('vitals', {}), '— sleep · — steps · — protein');
});

test('today status names what is happening now, else what is next, else that it is done', () => {
  const evs = [{ time: '09:00', label: 'Standup', past: true }, { time: '13:00', label: 'Flight', now: true }, { time: '18:00', label: 'Gym' }];
  assert.equal(foldStatus('today', { todayEvents: evs }), 'now · Flight');
  assert.equal(foldStatus('today', { todayEvents: evs.map((e) => ({ ...e, now: false })) }), 'next · 13:00 Flight', 'not past and not now = next');
  assert.equal(foldStatus('today', { todayEvents: evs.map((e) => ({ ...e, now: false, past: true })) }), '3 events · all done');
  assert.equal(foldStatus('today', { todayEvents: [] }), 'nothing on the calendar');
  assert.equal(foldStatus('today', { todayEvents: [], todayStaleLabel: 'STALE · 3H' }), 'calendar stale · 3h');
});

test('the rest degrade honestly when the data is not there', () => {
  assert.equal(foldStatus('lead', {}), 'nothing to try today');
  assert.equal(foldStatus('deck', { commandDeck: { count: 0 } }), 'nothing waiting');
  assert.equal(foldStatus('deck', { commandDeck: { count: 4 } }), '4 waiting for your call');
  assert.equal(foldStatus('noticed', { usingLiveHealthInsight: true, healthInsightItems: [{}, {}] }), '2 things noticed overnight');
  assert.equal(foldStatus('noticed', { healthInsightEmptyText: 'No health data yet' }), 'No health data yet');
  assert.equal(foldStatus('agents', { agents: [{ on: true }, { on: false }, { on: true }] }), '2 of 3 on');
  assert.equal(foldStatus('focus', { suggestedFocus: { title: 'Deep work on ', accent: 'Nova' } }), 'Deep work on Nova');
  assert.equal(foldStatus('review', { reviewFrom: 'Atomic Habits' }), 'from Atomic Habits');
  assert.equal(foldStatus('unknown', {}), '');
});
