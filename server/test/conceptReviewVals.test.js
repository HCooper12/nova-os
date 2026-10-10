// THE DAILY REVIEW's view model (src/vals/valsReview.js via valsNotes `review`), the shape
// read by the summary Moment, the grouped Group and the classic pane alike
// (mockup 96). Built with a fakeApp the way inboxSummary.test.js does, so
// the honest states are tested on the shapes the app really hands it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { valsNotes } from '../../src/vals/valsNotes.js';
import { pickReviewItem } from '../../src/reviewPick.js';

function fakeApp(state = {}) {
  return {
    notes: [], reviews: [{ c: '', f: '', id: 'x' }], reviewIdx: 0,
    state: {
      noteQuery: '', noteType: 'All', openNoteId: null, liveNoteDetails: {},
      liveNotes: [], liveJournalEntries: null, journalFilter: 'all', journalOpenDate: null,
      journalComposerText: '', journalSaveBusy: false, journalSaveError: null,
      journalPromptBusy: false, journalPromptText: null,
      liveReviewToday: null, liveReviewSummaries: {}, reviewOpenId: null, reviewDrawnExtra: null,
      reviewDrawBusy: false, reviewReflectOpen: false, reviewReflectText: '', reviewReflectBusy: false,
      reviewReflectPromptBusy: false, reviewReflectPromptText: null,
      connectionStatus: 'connected',
      ...state,
    },
    setState() {}, selectNote() {}, ensureNoteDetail() {}, answerReview() {}, openDailyReview() {},
    shuffleDailyReview() {}, toggleReviewReflect() {}, generateReviewReflectPrompt() {}, saveReviewReflection() {},
  };
}
const ctx = () => ({ demoMode: false, go: () => () => {} });

const item = (over = {}) => ({
  id: 'effort-debt', kind: 'due', answered: false, title: 'Effort Debt', type: 'concept',
  gist: 'Doing a thing feels like effort even once the thing is easy.',
  source: { title: 'Huberman 42', time: '12:34', url: 'https://youtube.com/x', extra: 0 },
  connected: [{ id: 'sunk-cost', title: 'Sunk Cost', type: 'concept' }],
  history: [{ date: '2026-09-01', grade: 'got' }],
  step: 1, due: '2026-10-11',
  ...over,
});

function assertNoNaNOrNull(v, path = 'review') {
  if (v == null) return; // null is an honest value here (e.g. source: null) — not what we're hunting
  if (typeof v === 'number') assert.ok(!Number.isNaN(v), `${path} is NaN`);
  if (typeof v === 'string') { assert.doesNotMatch(v, /\bNaN\b/, `${path} renders NaN`); assert.doesNotMatch(v, /\bundefined\b/, `${path} renders undefined`); }
  if (Array.isArray(v)) v.forEach((x, i) => assertNoNaNOrNull(x, `${path}[${i}]`));
  else if (typeof v === 'object' && v && typeof v !== 'function') for (const k of Object.keys(v)) assertNoNaNOrNull(v[k], `${path}.${k}`);
}

test('loading: liveReviewToday is null and the state says so, not "nothing due"', () => {
  const app = fakeApp({ liveNotes: [{ id: 'a', title: 'A', type: 'concept' }], liveReviewToday: null });
  const v = valsNotes(app, ctx());
  assert.equal(v.review.state, 'loading');
  assertNoNaNOrNull(v.review);
});

test('mac unreachable: null today AND an offline connection is distinguished from plain loading', () => {
  const app = fakeApp({ liveNotes: [{ id: 'a', title: 'A', type: 'concept' }], liveReviewToday: null, connectionStatus: 'offline' });
  const v = valsNotes(app, ctx());
  assert.equal(v.review.state, 'mac-unreachable');
});

test('nothing due: total 0 is its own honest state, never a card with blank fields', () => {
  const app = fakeApp({ liveNotes: [{ id: 'a', title: 'A', type: 'concept' }], liveReviewToday: { date: '2026-10-11', items: [], total: 0, doneCount: 0, dueCount: 0 } });
  const v = valsNotes(app, ctx());
  assert.equal(v.review.state, 'nothing-due');
  assert.equal(v.review.title, '');
  assertNoNaNOrNull(v.review);
});

test('a card: title, gist, source, connected notes and the curve all come through with real text', () => {
  const today = { date: '2026-10-11', items: [item()], total: 1, doneCount: 0, dueCount: 1 };
  const app = fakeApp({ liveNotes: [{ id: 'effort-debt', title: 'Effort Debt', type: 'concept' }], liveReviewToday: today });
  const v = valsNotes(app, ctx());
  const r = v.review;
  assert.equal(r.state, 'card');
  assert.equal(r.title, 'Effort Debt');
  assert.equal(r.gist, 'Doing a thing feels like effort even once the thing is easy.');
  assert.equal(r.source.title, 'Huberman 42');
  assert.equal(r.source.time, '12:34');
  assert.equal(r.source.kind, 'video'); // youtube.com
  assert.equal(r.connected.length, 1);
  assert.equal(r.connected[0].title, 'Sunk Cost');
  assert.ok(r.curve && r.curve.today === '2026-10-11');
  assert.equal(r.curve.history[0].grade, 'got');
  assert.equal(r.curve.result, null, 'nothing answered yet');
  assert.deepEqual(r.pips, { done: 0, total: 1, cur: 0 });
  assert.equal(r.grades.length, 3);
  // each answer says where it sends the page: step 1 -> Got it 7 days, Fuzzy 3 days, Forgot tomorrow
  assert.deepEqual(r.grades.map((g) => g.gapWord), ['7 days', '3 days', 'Tomorrow']);
  assert.match(r.kicker.text, /^Review 2 · last seen Tue 1 Sep/);
  assertNoNaNOrNull(r);
});

test('no source on the page: honestly null, never the concept\'s own title as a stand-in', () => {
  const noSource = item({ source: null });
  const today = { date: '2026-10-11', items: [noSource], total: 1, doneCount: 0, dueCount: 1 };
  const app = fakeApp({ liveNotes: [{ id: 'effort-debt', title: 'Effort Debt', type: 'concept' }], liveReviewToday: today });
  const r = valsNotes(app, ctx()).review;
  assert.equal(r.source, null);
  assertNoNaNOrNull(r);
});

test('a source with no time: named, no Play — the time field is simply absent, not "undefined"', () => {
  const noTime = item({ source: { title: 'Huberman 42', time: null, url: 'https://huberman.com', extra: 0 } });
  const today = { date: '2026-10-11', items: [noTime], total: 1, doneCount: 0, dueCount: 1 };
  const app = fakeApp({ liveNotes: [{ id: 'effort-debt', title: 'Effort Debt', type: 'concept' }], liveReviewToday: today });
  const r = valsNotes(app, ctx()).review;
  assert.equal(r.source.time, null);
  assertNoNaNOrNull(r);
});

test('a first look: a new, never-answered concept is flagged, and only that one', () => {
  const fresh = item({ id: 'new-one', kind: 'new', answered: false, title: 'New One', history: [], step: 0, due: null });
  const today = { date: '2026-10-11', items: [fresh], total: 1, doneCount: 0, dueCount: 0 };
  const app = fakeApp({ liveNotes: [{ id: 'new-one', title: 'New One', type: 'concept' }], liveReviewToday: today });
  const r = valsNotes(app, ctx()).review;
  assert.equal(r.firstLook, true);
  assert.equal(r.kicker.text, 'first look');
});

test('an answer is acted out at once: the held page shows where it went, and the count rises before the server confirms', () => {
  const today = { date: '2026-10-11', items: [item(), item({ id: 'b', title: 'B' })], total: 2, doneCount: 0, dueCount: 2 };
  const app = fakeApp({ liveNotes: [{ id: 'effort-debt', title: 'Effort Debt', type: 'concept' }], liveReviewToday: today,
    reviewJust: { id: 'effort-debt', grade: 'fuzzy', step: 1, due: '2026-10-11' }, reviewOpenId: 'effort-debt' });
  const r = valsNotes(app, ctx()).review;
  assert.equal(r.state, 'card');
  assert.equal(r.title, 'Effort Debt');
  assert.deepEqual({ grade: r.result.grade, gap: r.result.gap, due: r.result.due }, { grade: 'fuzzy', gap: 3, due: '2026-10-14' });
  assert.equal(r.pips.done, 1);
  assert.equal(r.isLast, false);
  assert.ok(r.grades.find((g) => g.key === 'fuzzy').selected);
  assert.equal(r.readNext, null, 'Next-as-read is gone once answered');
});

test('offline with a last sync: the card reads, the answers wait, and it says why', () => {
  const today = { date: '2026-10-11', items: [item()], total: 1, doneCount: 0, dueCount: 1 };
  const app = fakeApp({ liveNotes: [{ id: 'effort-debt', title: 'Effort Debt', type: 'concept' }], liveReviewToday: today, connectionStatus: 'offline', lastSyncAt: null });
  const r = valsNotes(app, ctx()).review;
  assert.equal(r.state, 'card');
  assert.ok(r.offline && /needs the Mac/.test(r.offline.line));
  assert.ok(r.grades.every((g) => g.disabled));
});

test('nothing due names the next day something returns', () => {
  const today = { date: '2026-10-11', items: [], total: 0, doneCount: 0, dueCount: 0, ahead: [], nextDue: { date: '2026-10-13', count: 2 } };
  const app = fakeApp({ liveNotes: [{ id: 'a', title: 'A', type: 'concept' }], liveReviewToday: today });
  const r = valsNotes(app, ctx()).review;
  assert.equal(r.nothingDueLine, 'Nothing due today · next Tue 13 Oct, 2 pages');
});

test('all done: every item answered, with Draw one early offered', () => {
  const done = item({ answered: true });
  const today = { date: '2026-10-11', items: [done], total: 1, doneCount: 1, dueCount: 0 };
  const app = fakeApp({ liveNotes: [{ id: 'effort-debt', title: 'Effort Debt', type: 'concept' }], liveReviewToday: today });
  const v = valsNotes(app, ctx());
  assert.equal(v.review.state, 'all-done');
  assert.ok(typeof v.review.done.drawEarly === 'function');
  assert.match(v.review.done.line, /^Today’s page is reviewed\./);
  assertNoNaNOrNull(v.review);
});

test('zero connected links and no history still render honestly — never NaN, never a crash', () => {
  const bare = item({ connected: [], history: [] });
  const today = { date: '2026-10-11', items: [bare], total: 1, doneCount: 0, dueCount: 1 };
  const app = fakeApp({ liveNotes: [{ id: 'effort-debt', title: 'Effort Debt', type: 'concept' }], liveReviewToday: today });
  const r = valsNotes(app, ctx()).review;
  assert.deepEqual(r.connected, []);
  assert.deepEqual(r.curve.history, []);
  assert.equal(r.curveLeft, 'Not seen yet');
  assertNoNaNOrNull(r);
});

/* --------------------------- pickReviewItem itself --------------------------- */

test('pickReviewItem: his tap wins while still in the queue, a drawn extra wins over that, then the first unanswered, then simply the first', () => {
  const items = [item({ id: 'a', answered: true }), item({ id: 'b', answered: false }), item({ id: 'c', answered: false })];
  assert.equal(pickReviewItem({ items, drawnExtra: null, openId: null }).id, 'b', 'first unanswered');
  assert.equal(pickReviewItem({ items, drawnExtra: null, openId: 'c' }).id, 'c', 'his tap wins');
  assert.equal(pickReviewItem({ items, drawnExtra: item({ id: 'z' }), openId: 'c' }).id, 'z', 'a drawn extra wins over everything');
  assert.equal(pickReviewItem({ items: [], drawnExtra: null, openId: null }), null, 'no items is honestly null, never undefined or a crash');
  const allDone = [item({ id: 'a', answered: true })];
  assert.equal(pickReviewItem({ items: allDone, drawnExtra: null, openId: null }).id, 'a', 'everything answered falls back to the first');
});
