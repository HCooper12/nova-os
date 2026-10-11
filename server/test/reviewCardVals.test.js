// The short Daily review card's view model (mockup 98), read by BOTH Home
// idioms (grouped cupertino on his phone, the summary ring card) and the
// full view. Pure: no data dir is touched, but set one anyway, per house rule.
process.env.NOVA_DATA_DIR = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'nova-rvcard-'));

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { buildReview } = await import('../../src/vals/valsReview.js');
const valsNotes = (app, ctx) => buildReview(app, ctx);

const calls = [];
function fakeApp(state = {}) {
  return {
    notes: [], reviews: [{ c: '', f: '', id: 'x' }], reviewIdx: 0,
    state: {
      noteQuery: '', noteType: 'All', openNoteId: null, liveNoteDetails: {},
      liveNotes: [{ id: 'a', title: 'A', type: 'concept' }], liveJournalEntries: null, journalFilter: 'all', journalOpenDate: null,
      liveReviewToday: null, liveReviewSummaries: {}, liveReviewStructured: {}, reviewOpenId: null, reviewDrawnExtra: null,
      reviewDrawBusy: false, reviewGradesOpen: false, connectionStatus: 'connected',
      ...state,
    },
    setState() {}, selectNote() {}, ensureNoteDetail() {}, answerReview(...a) { calls.push(['answer', ...a]); },
    toggleReviewGrades() { calls.push(['grades']); }, shuffleReview(...a) { calls.push(['shuffle', ...a]); },
    openReviewSheet() {}, journalDemoDays: () => [],
  };
}
// invented
const item = (over = {}) => ({
  id: 'p1', kind: 'due', answered: false, title: 'Effort Debt', type: 'concept',
  gist: 'Plain gist.',
  source: { title: 'The Long Table', ep: 'ep. 112', time: null, url: null, extra: 0 },
  connected: [{ id: 'c1', title: 'Compounding Habits', type: 'concept' }, { id: 'c2', title: 'Second', type: 'concept' }],
  history: [], step: 0, due: null, ...over,
});
const today = (items) => ({ date: '2026-10-11', items, total: items.length, doneCount: 0, dueCount: items.length, ahead: [], nextDue: null });
const STRUCT = {
  synthesis: 'Skipped effort comes back with interest.', provenance: 'A guest on The Long Table, ep. 112',
  minutesIn: 41, sourceTime: '41:12', origin: null,
  keyPoints: [{ term: 'The interest', line: 'The extra cost of later.' }], reflection: null,
};

for (const idiom of ['cupertino', 'summary']) {
  const ctx = { demoMode: false, style: idiom, go: () => () => {} };

  test(`${idiom}: a validated structure drives the card; provenance is its own line with real minutes`, () => {
    const v = valsNotes(fakeApp({ liveReviewToday: today([item()]), liveReviewStructured: { p1: STRUCT } }), ctx).review;
    assert.equal(v.state, 'card');
    assert.equal(v.gist, STRUCT.synthesis);
    assert.deepEqual(v.provenance, { text: STRUCT.provenance, at: '41 min in' });
    assert.equal(v.summary.keyPoints.length, 1);
    assert.equal(v.summary.reflection, null);
    assert.equal(v.thread.title, 'Compounding Habits'); // one connection line, never more
  });

  test(`${idiom}: no structure means no faked structure, and no minutes without a source time`, () => {
    const v = valsNotes(fakeApp({ liveReviewToday: today([item()]), liveReviewStructured: { p1: '' } }), ctx).review;
    assert.equal(v.summary, null);
    assert.equal(v.gist, 'Plain gist.');
    assert.deepEqual(v.provenance, { text: 'The Long Table, ep. 112', at: null });
  });

  test(`${idiom}: while the structure is being written the card says loading`, () => {
    const v = valsNotes(fakeApp({ liveReviewToday: today([item()]), liveReviewStructured: { p1: null } }), ctx).review;
    assert.equal(v.gistLoading, true);
  });

  test(`${idiom}: no source and no structured provenance means no provenance line`, () => {
    const v = valsNotes(fakeApp({ liveReviewToday: today([item({ source: null })]), liveReviewStructured: { p1: { ...STRUCT, provenance: null, minutesIn: null } } }), ctx).review;
    assert.equal(v.provenance, null);
  });

  test(`${idiom}: grades sit behind the dots; Shuffle goes to the next unanswered page`, () => {
    calls.length = 0;
    const app = fakeApp({ liveReviewToday: today([item(), item({ id: 'p2', title: 'B' })]), reviewGradesOpen: true });
    const v = valsNotes(app, ctx).review;
    assert.equal(v.gradesOpen, true);
    v.toggleGrades();
    v.shuffle();
    assert.deepEqual(calls[0], ['grades']);
    assert.deepEqual(calls[1], ['shuffle', 'p2', false]);
  });
}
