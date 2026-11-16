// The quote-first Daily review's view model (mockup 116), read by BOTH Home
// idioms from one object. Every person, show and line is SAMPLE text.
process.env.NOVA_DATA_DIR = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'nova-rvq-'));

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const { buildReview } = await import('../../src/vals/valsReview.js');
const { validHold } = await import('../../src/reviewHold.js');

function fakeApp(state = {}) {
  return {
    state: {
      liveNotes: [{ id: 'a', title: 'A', type: 'concept' }], liveJournalEntries: null, liveReviewToday: null, liveReviewSummaries: {}, liveReviewStructured: {},
      reviewOpenId: null, reviewDrawnExtra: null, reviewGradesOpen: false, connectionStatus: 'connected', ...state,
    },
    selectNote() {}, ensureNoteDetail() {}, answerReview() {}, toastMsg() {}, journalDemoDays: () => [],
  };
}
const quote = (over = {}) => ({ text: 'Every hour of effort you skip gets added to the bill, and the bill carries interest.', who: 'Mara Ellison', show: 'The Long Table', episode: 'Effort and Interest', at: '41:12', url: 'https://example.test/watch?v=abc', verified: true, ...over });
const item = (over = {}) => ({
  id: 'p1', kind: 'new', answered: false, title: 'Effort Debt', type: 'concept', gist: 'g', source: null, connected: [], history: [], step: 0, due: null,
  quote: quote(), idea: { title: 'Effort Debt', sentence: 'Work you skip now comes back later with interest.' }, ...over,
});
const today = (items) => ({ date: '2026-11-17', items, total: items.length, doneCount: 0, dueCount: items.length, ahead: [], nextDue: null });
const view = (it, extra) => buildReview(fakeApp({ liveReviewToday: today([it]), ...extra }), { demoMode: false, style: 'summary', go: () => () => {} }).review;

test('the quote leads: words, who, where, the real time, a play link at that time', () => {
  const v = view(item());
  assert.equal(v.quote.text.startsWith('Every hour of effort'), true);
  assert.equal(v.quote.primary, 'Mara Ellison');
  assert.equal(v.quote.secondary, 'The Long Table, Effort and Interest');
  assert.equal(v.quote.at, '41:12');
  assert.equal(v.quote.href, 'https://example.test/watch?v=abc');
  assert.equal(v.idea.sentence, 'Work you skip now comes back later with interest.');
  assert.equal(v.returning, false);
  assert.deepEqual(v.kickerQ, { isNew: true, body: false, text: 'today' });
});

test('no real time means no time shown, and no link means a plain line, not a Play button', () => {
  const v = view(item({ quote: quote({ at: null, url: null }) }));
  assert.equal(v.quote.at, null);
  assert.equal(v.quote.href, null);
  assert.ok(!/Play/.test(v.quote.aria));
});

test('a missing speaker says so, and a missing source says so; nothing is filled in', () => {
  const noWho = view(item({ quote: quote({ who: null }) })).quote;
  assert.equal(noWho.primary, 'The Long Table');
  assert.match(noWho.secondary, /speaker not named/);
  const none = view(item({ quote: quote({ who: null, show: null, episode: null, at: null, url: null }) })).quote;
  assert.equal(none.primary, 'From your notes');
  assert.match(none.secondary, /does not say which source/);
});

test('a page with no line has no quote (the card says so); the idea still stands', () => {
  const v = view(item({ quote: null }));
  assert.equal(v.quote, null);
  assert.equal(v.idea.title, 'Effort Debt');
});

test('a returning page is asked first: it has history', () => {
  const v = view(item({ kind: 'due', history: [{ date: '2026-11-10', grade: 'got' }, { date: '2026-11-13', grade: 'got' }], step: 2, due: '2026-11-17' }));
  assert.equal(v.returning, true);
  assert.equal(v.kickerQ.isNew, false);
  assert.match(v.kickerQ.text, /^Seen twice · last /);
});

test('Kept says where the page went by the real ladder, not a promise', () => {
  assert.equal(view(item()).keptLine, 'Back in 3 days as a question', 'new page, Read: step 0 to 1, gap 3 days');
});

test('Not for me exists only on a new, unanswered page, and writes nothing in demo-less views without a Mac', () => {
  assert.equal(typeof view(item()).skip, 'function');
  assert.equal(view(item({ kind: 'due', history: [{ date: '2026-11-10', grade: 'got' }] })).skip, null);
  assert.equal(view(item({ answered: true })).skip, null);
});

test('today\'s line on the done card is the first real line of the day, or absent', () => {
  const done = (qs) => buildReview(fakeApp({ liveReviewToday: { ...today(qs.map((q, i) => item({ id: `p${i}`, answered: true, quote: q }))), doneCount: qs.length } }), { demoMode: false, style: 'summary', go: () => () => {} }).review;
  assert.equal(done([null, quote()]).todayLine.by, 'Mara Ellison · The Long Table');
  assert.equal(done([null]).todayLine, null);
});

test('the Kept hold stands for today only, and falls away when the answer is taken back', () => {
  const held = { id: 'p1', day: '2026-11-17', at: 1000, r: {} };
  assert.equal(validHold(held, { id: 'p2', state: 'card', answered: false }, '2026-11-17', 2000), held);
  assert.equal(validHold(held, { id: 'p1', state: 'card', answered: false }, '2026-11-17', 1500), held, 'the write has not landed yet');
  assert.equal(validHold(held, { id: 'p1', state: 'card', answered: false }, '2026-11-17', 5000), null, 'Undo: the page is unanswered again');
  assert.equal(validHold(held, null, '2026-11-18', 2000), null, 'another day');
  assert.equal(validHold(null, null, '2026-11-17'), null);
});
