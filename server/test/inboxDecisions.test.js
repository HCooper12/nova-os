// THE INBOX DECISION CARDS (1 Nov 2026). His words, after a screen recording
// on his phone: "all of these tabs appear below it so it means I have to keep
// scrolling to eventually agree or discard", "sometimes I'm not able to
// actually open up the decision … in Laymans terms", and the Coach's program
// rebuild that landed as two dozen cards from one request.
//
// The fixture is shaped on his real records of that morning (a Coach rebuild:
// three new days, eighteen lifts, three schedule moves, filed within one
// second from one request), with the personal text replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { valsInbox } from '../../src/vals/valsInbox.js';
import { valsInboxSummary } from '../../src/vals/valsInboxSummary.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const ASK = 'Build on the Coach\'s 4-day document: Upper A on Monday, Lower on Tuesday, Upper B on Wednesday, Upper C on Friday.';
const T0 = Date.parse('2026-11-01T02:27:52.100Z');
let n = 0;
const at = () => new Date(T0 + (n++) * 10).toISOString();
const coach = (id, route, payload, title, reason) => ({
  id, text: ASK, source: 'coach', mode: 'review-all', status: 'pending', instructed: false, createdAt: at(),
  decision: { route, confidence: 'high', title, reason, payload: { ...payload, reason } },
});
const DAYS = { 'Upper A': 'monday', 'Upper B': 'wednesday', 'Upper C': 'friday' };
const WAS = { monday: ['r-push', 'Push'], wednesday: ['r-legs', 'Legs'], friday: ['r-mob', 'Mobility (Huberman)'] };
const LIFTS = {
  'Upper A': [['Cable Lateral Raise', 'Shoulders'], ['Rope Overhead Tricep Extension', 'Triceps'], ['Alternate Incline Dumbbell Curl', 'Biceps'], ['Wide-Grip Lat Pulldown', 'Back'], ['Reverse Pec Deck', 'Shoulders'], ['Incline Dumbbell Bench', 'Chest']],
  'Upper B': [['Machine Lateral Raise', 'Shoulders'], ['Triceps Pushdown', 'Triceps'], ['Cable Hammer Curls', 'Biceps'], ['Weighted Pull-Up', 'Back'], ['Lying T Bar Row', 'Back'], ['Machine Chest Press', 'Chest']],
  'Upper C': [['Cable Lateral Raise', 'Shoulders'], ['Carter Extension', 'Triceps'], ['Seated Cable Row', 'Back'], ['Chest-Supported Dumbbell Row', 'Back'], ['Reverse Pec Deck', 'Shoulders'], ['Machine Chest Press', 'Chest']],
};
export function rebuildFixture() {
  n = 0;
  const out = [];
  for (const name of Object.keys(LIFTS)) {
    out.push(coach(`create-${name.slice(-1)}`, 'routine-edit', { action: 'create', routineId: `new:${name.toLowerCase()}`, routineName: name }, `Coach: create a new routine, ${name}`, `your ${DAYS[name]} upper day in the revised 4-day week`));
  }
  for (const [name, lifts] of Object.entries(LIFTS)) {
    lifts.forEach(([lift, group], i) => out.push(coach(`add-${name.slice(-1)}${i}`, 'routine-edit', {
      action: 'add', routineId: `new:${name.toLowerCase()}`, routineName: name, addExerciseId: lift.toLowerCase().replace(/\W+/g, '-'), addName: lift,
      muscleGroup: group, trackingType: 'weight_reps', position: null, afterName: null, targetSets: lift === 'Carter Extension' ? 4 : 3, targetRepsLow: 8, targetRepsHigh: 12,
    }, `Coach: add ${lift} to ${name}`, lift === 'Carter Extension' ? 'your third triceps lift moves off Saturday and gains a set to hold triceps at 14' : `a ${group.toLowerCase()} lift for ${name}`)));
  }
  for (const name of Object.keys(LIFTS)) {
    const day = DAYS[name];
    out.push(coach(`sched-${day}`, 'schedule-edit', { action: 'schedule', day, routineId: `new:${name.toLowerCase()}`, routineName: name, beforeId: WAS[day][0], beforeName: WAS[day][1] },
      `Coach: ${day[0].toUpperCase()}${day.slice(1)} → ${name} (was ${WAS[day][1]})`, `${day} becomes ${name}`));
  }
  return out.reverse(); // newest first, as the server lists them
}
export const others = [
  { id: 'alert-1', kind: 'pattern', text: '110 calendar-soon alerts in 14 days, 0 acted on (0%).', source: 'scout', mode: 'review-all', status: 'pending', createdAt: '2026-10-31T23:58:45.027Z',
    decision: { route: 'alert-tier', confidence: 'high', title: 'Quieter: calendar-soon alerts next → later', reason: '110 calendar-soon alerts in 14 days, 0 acted on (0%).', payload: { kind: 'calendar-soon', from: 'next', to: 'later' } } },
  { id: 'read-1', kind: 'read-next', findingKey: 'readnext:spot reduction', source: 'librarian', mode: 'draft', status: 'pending', createdAt: '2026-10-30T23:59:13.211Z',
    text: 'Librarian: 2 of your sources keep reaching for Spot Reduction, and you have no page for it at all.', meta: { concept: 'Spot Reduction', sourceCount: 2, state: 'missing' } },
  { id: 'lead-1', kind: 'leader-followup', text: 'Since you last told me, has the plan for the team changed?', source: 'nova', mode: 'draft', status: 'pending', createdAt: '2026-10-23T11:52:28.565Z',
    decision: { route: 'journal', confidence: 'high', title: 'Leader — where does it stand?', reason: 'You last told the Leader about this 3 days ago.', payload: { text: 'Nova asked: has the plan for the team changed?', category: 'system', author: 'leader', label: 'Leader follow-up' } } },
];

export function fakeApp(state = {}) {
  const calls = [];
  const app = {
    calls,
    state: {
      screen: 'inbox', novaStyle: 'summary', inboxMode: 'review-all', inboxExpanded: {}, inboxActionBusy: {}, inboxProposalDismissed: [],
      compostActionBusy: {}, commitmentActionBusy: {}, isMobile: true,
      liveWorkoutRoutines: [{ id: 'r-push', name: 'Push', exercises: [] }, { id: 'r-legs', name: 'Legs', exercises: [] }, { id: 'r-mob', name: 'Mobility (Huberman)', exercises: [] }],
      liveWorkoutSchedule: { monday: 'r-push', wednesday: 'r-legs', friday: 'r-mob' },
      ...state,
    },
    setState(patch) { const p = typeof patch === 'function' ? patch(app.state) : patch; app.state = { ...app.state, ...p }; },
  };
  for (const m of ['inboxAction', 'inboxSeen', 'startInboxDeeper', 'stopInboxDeeper', 'openDeeperReport', 'closeDeeperReport', 'openCaptureSheet', 'closeCaptureSheet',
    'talkAboutInbox', 'navigate', 'discussCoachSuggestion', 'openCapture', 'toggleInboxExpand', 'pickModelChoice', 'setInboxMode', 'captureToInbox', 'setInboxInput', 'startResearch']) {
    app[m] = (...args) => { calls.push([m, ...args]); };
  }
  return app;
}
export function build(app) {
  const ctx = { demoMode: false, isOffline: false };
  app._inboxItemsMemo = null;
  const base = valsInbox(app, ctx);
  return { base, S: valsInboxSummary(app, ctx, { ...base, summary: true }).inboxSummary };
}

// ------------------------------------------------- T1: the repeated blocks --

test('a Coach "add" card yields ONE captured block and ONE will-be-filed block', () => {
  const items = rebuildFixture();
  const carter = items.find((r) => r.decision.payload.addName === 'Carter Extension');
  const app = fakeApp({ liveInbox: { items: [carter, ...items.filter((r) => r !== carter)] } });
  const { S } = build(app);
  assert.equal(S.card.id, carter.id);
  assert.equal(typeof S.card.captured, 'string', 'one captured text, not a list');
  assert.equal(S.card.will.lines.length <= 2, true, 'the will block is one destination and one line at most');
  assert.equal(S.card.will.lines.filter((l) => /Upper C/.test(l)).length, 1, 'Upper C named once');
});

test('no two siblings in the deck card share a key (the duplicate key that left stale copies of the blocks)', () => {
  const src = read('src/screens/InboxSummary.jsx');
  const body = src.slice(src.indexOf('function DeckCard'), src.indexOf('function RailRow'));
  const keys = [...body.matchAll(/key=\{([^}]+)\}/g)].map((m) => m[1]).filter((k) => !/\b[ia]\b|`/.test(k));
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepEqual(dupes, [], `keys repeated outside a list: ${dupes.join(', ')}`);
  assert.doesNotMatch(body, /<Blocks key=\{card\.id\}|<AskWhy key=\{card\.id\}/);
});

// ------------------------------------------- T2: the decision is reachable --

test('summary deck card: the verbs come straight after the sentence and the change, before every informational block', () => {
  const src = read('src/screens/InboxSummary.jsx');
  const body = src.slice(src.indexOf('function DeckCard'), src.indexOf('function RailRow'));
  const at = (s) => { const i = body.indexOf(s); assert.ok(i > 0, `missing ${s}`); return i; };
  const verbs = at('<Verbs verbs={card.verbs}');
  assert.ok(at('<ChangeDrawn') < verbs, 'the drawn change leads');
  for (const later of ['<AskWhy', '<DeeperSlot', 'nv-sum-ib-srcrow', '<Details', '<CodeShipDetail', 'nv-sum-ib-adj']) {
    assert.ok(at(later) > verbs, `${later} must follow the verbs`);
  }
  assert.ok(at('<AskWhy') - verbs < 120, 'the why-pass panel opens directly under the verbs');
  // one disclosure, closed by default, holds what started it and where it files
  const details = src.slice(src.indexOf('function Details'), src.indexOf('function AskWhy'));
  assert.match(details, /aria-expanded=\{open\}/);
  assert.match(details, /<Disclose open=\{open\}>/);
  assert.match(body, /useState\(false\)/, 'closed until he taps it');
});

test('cupertino deck card: the tick and the cross come before the filing in full and the reason', () => {
  const src = read('src/screens/Inbox.jsx');
  const card = src.slice(src.indexOf('{shown.map((item) => ('), src.indexOf('{deck && !showingFocus && ('));
  const tick = card.indexOf('item.approveLabel}`}');
  assert.ok(tick > 0);
  for (const later of ['{item.expanded && (', '{item.reason && <div', '<CodeShipDetail ship={item.ship} />']) {
    assert.ok(card.indexOf(later) > tick, `${later} must follow the verbs`);
  }
});
