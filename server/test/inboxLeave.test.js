// Finding 13 (22 Sep 2026): a decision is acted out. The card leaves over one
// beat in its verdict's colour before the optimistic swap removes it; under
// reduced motion there is no beat at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEAVE_MS, leaveMs } from '../../src/inboxLeave.js';

test('one beat, or none under reduced motion', () => {
  assert.equal(leaveMs(false), LEAVE_MS);
  assert.ok(LEAVE_MS >= 280 && LEAVE_MS <= 600, 'a beat, not a wait');
  assert.equal(leaveMs(true), 0);
});

test('the app marks the card leaving before the swap, and the CSS has both verdicts', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('inboxAction(id, kind, reason) {'), app.indexOf('pickModelChoice(id, model) {'));
  assert.match(fn, /inboxLeaving: \{ \.\.\.\(s\.inboxLeaving \|\| \{\}\), \[id\]: kind \}/);
  assert.match(fn, /setTimeout\(swap, wait\)/);
  assert.match(fn, /leaveMs\(prefersReducedMotion\(\)\)/);
  const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.nv-leave-approve \{ animation: nvLeaveFile/);
  assert.match(css, /\.nv-leave-discard \{ animation: nvLeaveDiscard/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.nv-leave-approve, \.nv-leave-discard \{ animation: nvFadeOut/);
});

test('the deck card is a light tick and cross, a do-all at the group head, and leaves in its verdict colour', () => {
  const src = readFileSync(new URL('../../src/screens/Inbox.jsx', import.meta.url), 'utf8');
  const deck = src.slice(src.indexOf('Waiting for your call'), src.indexOf('{item.askingWhy && ('));
  assert.match(deck, /<TextAction compact tone="good" onClick=\{item\.busy \? undefined : item\.approve\}/, 'approve is a light tick');
  assert.match(deck, /<TextAction compact tone="warn" onClick=\{item\.busy \? undefined : item\.discard\}/, 'discard is a light cross');
  assert.doesNotMatch(deck, /<Button onClick=\{item\.approve\}/, 'no full-size approve button on the card');
  assert.match(deck, /item\.leaving \? `nv-leave-\$\{item\.leaving\}`/, 'the leaving class replaces deck-rise');
  assert.match(deck, /onClick=\{p\.busy \? undefined : p\.fileAll\}/, 'one do-all per repeating subject');
  assert.match(deck, /animation: 'countPulse/, 'the count ticks');
});

test("Train Today's Coach ask is a tick, a cross and the talk verb, and leaves before the action lands", () => {
  const src = readFileSync(new URL('../../src/TrainToday.jsx', import.meta.url), 'utf8');
  const card = src.slice(src.indexOf("{o?.coachAsk && ("), src.indexOf('Discuss it') + 400);
  assert.match(card, /<TextAction compact tone="good" haptic="commit"[^>]*ariaLabel="Do it"/);
  assert.match(card, /<TextAction compact tone="warn"[^>]*ariaLabel="Not this"/);
  assert.match(card, /tone="cyan"[\s\S]{0,240}?>Discuss it<\/TextAction>/, "talking back stays");
  assert.doesNotMatch(card, /<Button compact onClick=\{\(\) => actions\.applyCoachAsk/, 'no full button per idea');
  assert.match(card, /className=\{askLeaving \? `nv-leave-\$\{askLeaving\}` : undefined\}/);
  assert.match(src, /const wait = leaveMs\(prefersReducedMotion\(\)\);/);
});
