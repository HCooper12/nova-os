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
  // alone, as a card of its own (with its rebuild it is one group card, T4)
  const app = fakeApp({ liveInbox: { items: [carter] } });
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

// ------------------------------------ T3: every decision opens, in plain words --

import { plainMeaning } from '../../src/plainMeaning.js';

const JARGON = /routine-edit|schedule-edit|alert-tier|\broute\b|payload|\btier\b|\bnew:|undefined|null|NaN|\[object/i;

test('plainMeaning: the three Coach rebuild shapes read as he would say them', () => {
  const items = rebuildFixture();
  const carter = items.find((r) => r.decision.payload.addName === 'Carter Extension');
  assert.equal(plainMeaning(carter), 'Adds Carter Extension (triceps) to your Upper C day: 4 sets of 8 to 12 reps. Why: your third triceps lift moves off Saturday and gains a set to hold triceps at 14.');
  assert.equal(plainMeaning(items.find((r) => r.id === 'create-C')), 'Creates a new training day called Upper C. The lifts the Coach wants in it are separate cards.');
  assert.match(plainMeaning(items.find((r) => r.id === 'sched-friday')), /^Makes Friday your Upper C day instead of Mobility \(Huberman\)\./);
  const rest = { decision: { route: 'schedule-edit', payload: { action: 'schedule', day: 'saturday', routineId: null, beforeName: 'Arms Optional' } } };
  assert.equal(plainMeaning(rest), 'Makes Saturday a rest day instead of Arms Optional.');
});

test('plainMeaning: every card in the fixtures, and every project kind, opens to a sentence with none of the machine words', () => {
  const projects = ['project-create', 'project-stage', 'project-settings', 'project-watch-note', 'project-research', 'project-watch-candidates']
    .map((route, i) => ({ id: `p${i}`, kind: route, status: 'pending', decision: { route, title: `Projects: ${route}`, payload: { name: 'Drone film', stage: 'shoot' } } }));
  const all = [...rebuildFixture(), ...others, ...projects,
    { id: 'bare', status: 'pending', text: 'something he said', decision: { route: 'teleport', title: 'Coach: an unknown change', reason: 'because' } },
    { id: 'empty', status: 'pending' }];
  for (const r of all) {
    const m = plainMeaning(r);
    assert.ok(m && m.trim().length > 12, `${r.id}: blank`);
    assert.doesNotMatch(m, JARGON, `${r.id}: ${m}`);
    assert.match(m, /^[A-Z"]/, `${r.id}: sentence case`);
  }
  assert.match(plainMeaning(others[0]), /^Your "calendar soon" alerts will reach you quietly, in your Inbox only, not as a card on your screen\./);
  assert.match(plainMeaning(others[1]), /Spot Reduction/);
  assert.match(plainMeaning(others[2]), /^The Leader is asking you a question/);
});

test('every pending card in both idioms carries its plain meaning, and the summary card can open it', () => {
  const items = [...rebuildFixture(), ...others];
  for (const r of items) {
    const app = fakeApp({ liveInbox: { items: [r] } });
    const { base, S } = build(app);
    const item = base.inboxPending[0];
    assert.ok(item.meaning, `${r.id}: cupertino has no meaning`);
    assert.equal(item.canExpand, true, `${r.id}: cupertino card cannot open`);
    assert.equal(item.expandLabel, 'What this means');
    assert.equal(S.card.meaning, item.meaning);
    assert.doesNotMatch(S.card.kindLabel, /does not name/, `${r.id}: ${S.card.kindLabel}`);
    assert.doesNotMatch(S.card.will.lines.join(' '), /does not name/, `${r.id}: ${S.card.will.lines}`);
  }
  const coach = build(fakeApp({ liveInbox: { items: [rebuildFixture()[0]] } })).S.card;
  assert.equal(coach.where.startsWith('You typed'), false, 'a Coach card is not his typing');
});

test('a schedule change to a day the same rebuild creates draws that day, not a rest day', () => {
  const sched = rebuildFixture().find((r) => r.id === 'sched-friday');
  const { S } = build(fakeApp({ liveInbox: { items: [sched] } }));
  assert.equal(S.card.sentence, 'Train Upper C on Friday');
  const fri = S.card.change.diff.week.find((d) => d.day === 'Fri');
  assert.equal(fri.after, 'Upper C');
});

// ------------------------------- T5: "waiting on another card", said as such --

import { staleLine } from '../../src/coachSuggestions.js';

test('a card that waits on another is not "already changed"', () => {
  assert.deepEqual(staleLine('Needs Upper C created first — say yes to that card'),
    { waiting: true, lead: 'Waiting on another card', text: 'Upper C has to be created first. Say yes to that card' });
  assert.deepEqual(staleLine('Seated Cable Row is no longer in Upper C'), { waiting: false, lead: 'Already changed', text: 'Seated Cable Row is no longer in Upper C' });
  assert.equal(staleLine(null), null);
  // a card the Coach's day-creating card has overtaken still says "already changed"
  const pec = rebuildFixture().find((r) => r.id === 'add-A4');
  const has = fakeApp({ liveInbox: { items: [pec] }, liveWorkoutRoutines: [{ id: 'ua', name: 'Upper A', exercises: [{ exerciseId: 'reverse-pec-deck', name: 'Reverse Pec Deck' }] }] });
  assert.equal(build(has).S.card.staleLine.lead, 'Already changed');
  for (const f of ['src/screens/InboxSummary.jsx', 'src/CoachSuggestions.jsx']) assert.doesNotMatch(read(f), />Already changed: \{/, f);
});

// ------------------------------- T4: one decision for a program rebuild --

import { rebuildGroups, applyOrder, groupSummary, waitingOn, groupRunLine, memberTitle, GROUP_WINDOW_MS } from '../../src/inboxGroups.js';
import { runInboxGroup } from '../../src/inboxGroupRun.js';

test('rebuildGroups: the Coach\'s cards from one request within five seconds are one group; others stay single', () => {
  const items = [...rebuildFixture(), ...others];
  const late = { ...coach('late', 'routine-edit', { action: 'create', routineId: 'new:accessory', routineName: 'Accessory' }, 'Coach: create a new routine, Accessory', 'optional day'), createdAt: new Date(T0 + GROUP_WINDOW_MS + 5000).toISOString() };
  const typed = { ...rebuildFixture()[0], id: 'typed', source: 'voice' };
  const groups = rebuildGroups([...items, late, typed]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].ids.length, 24);
  assert.ok(!groups[0].ids.includes('late') && !groups[0].ids.includes('typed') && !groups[0].ids.includes('alert-1'));
  assert.equal(rebuildGroups([items[0]]).length, 0, 'one card is not a group');
  assert.equal(rebuildGroups(items.map((r) => ({ ...r, status: 'filed' }))).length, 0, 'only pending cards group');
  // the key survives its oldest member being filed
  const after = rebuildGroups(items.filter((r) => r.id !== 'create-A'));
  assert.equal(after[0].key, groups[0].key);
});

test('applyOrder: new days, then the week, then the lifts in the Coach\'s order; an "after" lift follows its anchor; an orphan is blocked', () => {
  const items = rebuildFixture();
  const { order, blocked } = applyOrder(items, ['Push', 'Legs', 'Mobility (Huberman)']);
  assert.equal(order.length, 24);
  assert.deepEqual(blocked, []);
  assert.deepEqual(order.slice(0, 3), ['create-A', 'create-B', 'create-C']);
  assert.deepEqual(order.slice(3, 6), ['sched-monday', 'sched-wednesday', 'sched-friday']);
  assert.deepEqual(order.slice(6, 9), ['add-A0', 'add-A1', 'add-A2']);
  // every child comes after the card that creates its day
  for (const r of items) {
    const p = r.decision.payload;
    if (p.action === 'create') continue;
    const parent = `create-${p.routineName.slice(-1)}`;
    assert.ok(order.indexOf(r.id) > order.indexOf(parent), `${r.id} before ${parent}`);
  }
  // an "after" anchor added later by the Coach still goes first
  const anchorLate = items.map((r) => (r.id === 'add-C0' ? { ...r, decision: { ...r.decision, payload: { ...r.decision.payload, afterName: 'Seated Cable Row' } } } : r));
  const o2 = applyOrder(anchorLate, []).order;
  assert.ok(o2.indexOf('add-C0') > o2.indexOf('add-C2'), 'placed after its anchor');
  // a lift aimed at a day nobody creates and that does not exist stays blocked
  const orphan = items.filter((r) => r.id !== 'create-C');
  const o3 = applyOrder(orphan, ['Push']);
  assert.equal(o3.blocked.length, 7, 'Upper C\'s six lifts and its Friday');
  assert.ok(o3.blocked.every((b) => !o3.order.includes(b.id)));
  assert.match(o3.blocked[0].reason, /^Upper C does not exist yet, and no card here creates it$/);
  // ...but not when the day already exists in his program
  assert.equal(applyOrder(orphan, ['Upper C']).blocked.length, 0);
});

test('groupSummary and memberTitle: counted from the cards, in his words', () => {
  const items = rebuildFixture();
  assert.equal(groupSummary(items), '3 new training days, 18 lifts in them, 3 schedule changes: Monday Upper A, Wednesday Upper B, Friday Upper C');
  assert.equal(memberTitle(items.find((r) => r.id === 'sched-friday')), 'Friday: Upper C (was Mobility (Huberman))');
  assert.equal(memberTitle(items.find((r) => r.id === 'create-C')), 'New training day: Upper C');
  assert.equal(memberTitle(items.find((r) => r.id === 'add-C1')), 'Add Carter Extension to Upper C');
});

test('waitingOn: a lift for a day not yet created names the card that creates it; a filed create or an existing day frees it', () => {
  const items = rebuildFixture();
  const carter = items.find((r) => r.id === 'add-C1');
  assert.deepEqual(waitingOn(carter, { routineNames: ['Push'], records: items }), { name: 'Upper C', parentId: 'create-C' });
  assert.equal(waitingOn(carter, { routineNames: ['Upper C'], records: items }), null);
  const filed = items.map((r) => (r.id === 'create-C' ? { ...r, status: 'filed' } : r));
  assert.equal(waitingOn(carter, { routineNames: [], records: filed }), null);
  assert.deepEqual(waitingOn(carter, { routineNames: [], records: items.filter((r) => r.id !== 'create-C') }), { name: 'Upper C', parentId: null });
  assert.equal(waitingOn(items.find((r) => r.id === 'create-C'), { records: items }), null, 'a create waits on nothing');
});

function fakeRunApp(items) {
  const app = fakeApp({ liveInbox: { items } });
  app.refreshInbox = () => app.calls.push(['refreshInbox']);
  app.toastMsg = (m) => app.calls.push(['toast', m]);
  return app;
}

test('runInboxGroup: the existing per-record routes, one at a time, in order; stops at the first refusal; each record replaced from the server', async () => {
  const items = rebuildFixture();
  const app = fakeRunApp(items);
  const { order } = applyOrder(items, []);
  const sent = [];
  let inFlight = 0;
  const api = {
    inboxApprove: async (conn, id) => {
      inFlight++; assert.equal(inFlight, 1, 'never two at once'); await new Promise((r) => setTimeout(r, 1)); inFlight--;
      sent.push(id);
      if (id === order[5]) throw new Error('Upper C hasn\'t been created yet');
      return { record: { ...items.find((r) => r.id === id), status: 'filed', undoData: { route: 'x' } } };
    },
    inboxDiscard: async () => { throw new Error('not this one'); },
  };
  const run = await runInboxGroup(app, { key: 'g', ids: order, kind: 'approve' }, { api, getConnection: () => ({ url: 'x' }) });
  assert.deepEqual(sent, order.slice(0, 6), 'stopped at the refusal');
  assert.equal(run.done.length, 5);
  assert.deepEqual(run.failed, { id: order[5], error: 'Upper C hasn\'t been created yet' });
  const st = app.state.liveInbox.items;
  assert.equal(st.filter((r) => r.status === 'filed').length, 5, 'only what the server filed shows filed');
  assert.ok(st.filter((r) => r.status === 'filed').every((r) => r.undoData), 'each keeps its own undo');
  assert.equal(app.state.inboxGroupRun.g.running, false);
  assert.ok(app.calls.some((c) => c[0] === 'refreshInbox'), 're-reads the Inbox after');
  assert.match(groupRunLine(app.state.inboxGroupRun.g, memberTitleOf(items)), /^Applied 5 of 24\. Stopped at "Friday: Upper C \(was Mobility \(Huberman\)\)": Upper C hasn't been created yet\. 19 changes are still waiting\.$/);
});

const memberTitleOf = (items) => (id) => memberTitle(items.find((r) => r.id === id));

test('runInboxGroup: Discard all records the one reason on every member', async () => {
  const items = rebuildFixture();
  const app = fakeRunApp(items);
  const got = [];
  const api = { inboxDiscard: async (conn, id, reason) => { got.push([id, reason]); return { record: { ...items.find((r) => r.id === id), status: 'discarded' } }; } };
  await runInboxGroup(app, { key: 'g', ids: items.map((r) => r.id), kind: 'discard', reason: 'Not now' }, { api, getConnection: () => ({}) });
  assert.equal(got.length, 24);
  assert.ok(got.every(([, r]) => r === 'Not now'));
  assert.equal(groupRunLine(app.state.inboxGroupRun.g), 'Discarded all 24.');
  // no connection, no run
  assert.equal(await runInboxGroup(fakeRunApp(items), { key: 'g', ids: ['a'] }, { api, getConnection: () => null }), null);
});

test('the summary deck shows the rebuild as ONE card with Apply all asked first; the digest no longer offers its cards as routine', () => {
  const items = [...rebuildFixture(), ...others];
  const app = fakeRunApp(items);
  const { base, S } = build(app);
  assert.equal(base.inboxGroups.length, 1);
  assert.equal(S.card.isGroup, true);
  const g = S.card.group;
  assert.equal(g.headline, "Coach's program rebuild · 24 changes");
  assert.equal(g.summary, '3 new training days, 18 lifts in them, 3 schedule changes: Monday Upper A, Wednesday Upper B, Friday Upper C');
  assert.equal(g.applyLabel, 'Apply all 24');
  assert.equal(g.confirmQ, 'Apply all 24 changes to your program?');
  assert.equal(g.members.length, 24);
  assert.ok(g.members.every((m) => m.meaning), 'each change keeps its plain meaning');
  assert.equal(S.position, '1 of 4', 'the rebuild and the three others');
  assert.match(S.digestLine, /^1 program rebuild/);
  assert.ok(!S.subjects.some((s) => s.count >= 24), 'no "all 24" outside the group');
  // a swipe right only asks; Apply all is a second tap
  g.askApply();
  assert.deepEqual(app.state.inboxGroupConfirm, { key: g.key, kind: 'apply' });
  assert.equal(app.calls.filter((c) => c[0] === 'inboxAction').length, 0, 'nothing filed by asking');
  const again = build(app).S.card.group;
  assert.equal(again.confirm, 'apply');
  assert.deepEqual(again.order.slice(0, 3), ['create-A', 'create-B', 'create-C']);
  // the week drawn: Friday becomes Upper C with its six lifts
  const fri = again.week.find((d) => d.day === 'Fri');
  assert.deepEqual([fri.after, fri.lifts, fri.changes], ['Upper C', 6, true]);
});

test('a single card waiting on another: said at the top, "Waiting on Upper C" not pressable, no swipe to file, and Go to that card', () => {
  // one create and one of its lifts, not a group (different requests)
  const items = rebuildFixture();
  const carter = { ...items.find((r) => r.id === 'add-C1'), text: 'another request' };
  const create = items.find((r) => r.id === 'create-C');
  const app = fakeRunApp([carter, create]);
  const { S } = build(app);
  assert.equal(S.card.id, carter.id);
  assert.equal(S.card.waiting.name, 'Upper C');
  assert.match(S.card.waiting.line, /^Upper C has to be created first\./);
  assert.equal(S.card.verbs.yes.label, 'Waiting on Upper C');
  assert.equal(S.card.verbs.yes.disabled, true);
  assert.equal(S.card.swipe.right, null);
  assert.equal(S.card.staleLine, null, 'not also "already changed"');
  S.card.waiting.go();
  assert.equal(build(app).S.card.id, 'create-C', 'the card it waits on comes to the top');
  // and it never waits before his program has loaded (nothing claimed)
  const unknown = fakeRunApp([carter, create]);
  unknown.state.liveWorkoutRoutines = [];
  assert.equal(build(unknown).S.card.waiting || null, null);
});

test('both idioms draw the rebuild card from the one view model, and Apply all never fires on the first tap', () => {
  const sum = read('src/screens/InboxSummary.jsx');
  assert.match(sum, /card\.isGroup\s*\?\s*<GroupCard/);
  const grp = sum.slice(sum.indexOf('function GroupCard'), sum.indexOf('function DeckCard'));
  assert.match(grp, /onClick=\{g\.running \? undefined : g\.askApply\}/, 'the first tap asks');
  assert.match(grp, /g\.apply\(\)/, 'the second applies');
  assert.doesNotMatch(grp, /inboxAction|api\./, 'no write path of its own');
  const cup = read('src/screens/Inbox.jsx');
  assert.match(cup, /groups\.map\(\(g\) => <RebuildCardClassic key=\{g\.key\} g=\{g\} \/>\)/);
  assert.match(cup, /onClick=\{g\.running \? undefined : g\.askApply\}/);
  // the runner calls only the existing per-record routes
  const run = read('src/inboxGroupRun.js');
  assert.match(run, /api\.inboxApprove\(conn, id\)/);
  assert.match(run, /api\.inboxDiscard\(conn, id, reason\)/);
});
