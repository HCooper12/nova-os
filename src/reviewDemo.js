// THE DAILY REVIEW's schedule, client side, and its DEMO day (mockup 96).
//
// The schedule here is the server's (server/lib/conceptReview.js GAPS and
// nextStep), restated so the card can say where each answer sends a page
// before the Mac has answered. server/test/twins.test.js is not needed: the
// client never decides a due date that is written anywhere; it only labels
// a button and acts the answer out while the real write is on its way.
//
// The demo day is shaped exactly like GET /api/review/today, so demo mode
// runs the same view model, the same card and the same sheet as his real
// day, and every state is reachable by tapping: three pages, then All done,
// then Draw one early. Every concept, gist, note, podcast, article, time and
// past answer below is INVENTED (the mockup's own demo deck) and marked
// `demo: true`; none of it is ever shown outside demoMode.

export const GAPS = [1, 3, 7, 16, 35, 90, 180];

export function nextStep(step, grade) {
  const s = Math.min(Math.max(Number(step) || 0, 0), GAPS.length - 1);
  if (grade === 'got' || grade === 'read') return Math.min(s + 1, GAPS.length - 1);
  if (grade === 'fuzzy') return s;
  return 0;
}

// local calendar dates as YYYY-MM-DD strings (the Repertoire's AEST lesson:
// never a UTC ISO slice)
export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseISO(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function shiftISO(s, days) {
  const d = parseISO(s);
  d.setDate(d.getDate() + days);
  return localISO(d);
}
export function daysBetweenISO(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 864e5);
}

// replay a page's answers through the schedule: { step, due } after the last
export function replay(history) {
  let step = 0;
  let due = null;
  for (const h of history || []) {
    step = nextStep(step, h.grade);
    due = shiftISO(h.date, GAPS[step]);
  }
  return { step, due };
}

/* ------------------------------- the demo day ------------------------------ */

// offsets in days from today, so the deck is always "due this morning"
const DECK = [
  {
    id: 'demo-effort-debt', title: 'Effort Debt', type: 'concept',
    gist: 'Work you skip now is borrowed, and it comes back later with interest, usually at a worse moment. Small early payments keep the balance from growing.',
    note: [
      'Skipped effort does not disappear. The report you put off, the warm-up you rushed, the hard conversation you postponed: each returns later, larger, and on a day you did not choose.',
      'The interest is the extra cost of doing it under pressure: less time, more stakes, fewer options. Paying early is cheaper even when it feels slower.',
      'The practical rule from the episode: when a small task can be paid today in under ten minutes, pay it, and keep a short list of the debts you are carrying on purpose.',
    ],
    source: { title: 'The Long Table', ep: 'ep. 112', kind: 'podcast', time: '41:12', url: null, extra: 0 },
    connected: [['Compounding Habits', 'concept'], ['Deliberate Practice', 'concept'], ['Building Discipline', 'topic'], ['Pay Yourself First', 'concept']],
    links: 9,
    history: [[-4, 'fuzzy'], [-3, 'got']],
  },
  {
    id: 'demo-two-minute-floor', title: 'The Two-Minute Floor', type: 'concept',
    gist: 'On a day you have nothing, do the smallest version that still counts. The floor keeps the habit alive, and a habit that is alive makes tomorrow easier.',
    note: [
      'On a day with no energy, set the bar at a version so small it cannot fail: one page, one set, one line.',
      'The point is continuity of identity, not output. The floor is what you do; the ceiling is whatever the day allows after it.',
    ],
    source: { title: 'Field Notes on Work', ep: '', kind: 'article', time: null, url: null, extra: 0 },
    connected: [['Compounding Habits', 'concept'], ['Identity Habits', 'concept']],
    links: 5,
    history: [[-37, 'got'], [-34, 'got'], [-27, 'fuzzy'], [-16, 'got']],
  },
  {
    id: 'demo-quiet-hours', title: 'Quiet Hours', type: 'concept',
    gist: 'A protected block with no inputs at all: no feeds, no messages, no podcasts. Connections between ideas tend to arrive when nothing new is coming in.',
    note: [
      'A block of time with no inputs: no feeds, no messages, no audio.',
      'Written as your own note; there is no source on the page.',
    ],
    source: null,
    connected: [['Attention Residue', 'concept'], ['Deep Work Blocks', 'concept'], ['Evening Routine', 'topic']],
    links: 4,
    history: [],
  },
];

// the never-reviewed pages "Draw one early" spins through; the first lands
export const DEMO_UNREVIEWED = ['Reference Classes', 'The Pre-Mortem', 'Second-Order Effects', 'Slow Mornings', 'Energy Audits', 'Default Choices', 'Small Bets', 'The Last Ten Percent', 'Leading Indicators'];
const DRAWN = {
  id: 'demo-reference-classes', title: 'Reference Classes', type: 'concept',
  gist: 'Before guessing how long something will take, look at how long things like it took for other people. The outside view beats the inside story.',
  note: ['Start a forecast from the base rate of similar projects, then adjust for what is truly different about this one.'],
  source: { title: 'The Long Table', ep: 'ep. 98', kind: 'podcast', time: null, url: null, extra: 1 },
  connected: [['The Pre-Mortem', 'concept'], ['Planning Fallacy', 'concept']],
  links: 3,
  history: [],
};
// the week ahead, invented (the mockup's), so the done state has a shape
const DEMO_WEEK = [2, 1, 3, 0, 2, 1, 4];

function itemFrom(card, today, answers) {
  const history = card.history.map(([off, grade]) => ({ date: shiftISO(today, off), grade }));
  const mine = answers?.[card.id];
  if (mine) history.push({ date: today, grade: mine });
  const { step, due } = replay(history);
  return {
    id: card.id, kind: card.history.length ? 'due' : 'new',
    answered: !!due && due > today,
    title: card.title, type: card.type, gist: card.gist,
    source: card.source ? { ...card.source } : null,
    connected: card.connected.map(([title, type]) => ({ id: `demo-${title.toLowerCase().replace(/\W+/g, '-')}`, title, type })),
    linkCount: card.links,
    history, step, due,
    note: card.note,
    demo: true,
  };
}

// state: { answers: { [id]: grade }, drawn: bool }; scenario: null |
// 'nothing-due' | 'offline' (the offline flag is read by the view model)
export function demoReviewToday({ today = localISO(), answers = {}, scenario = null } = {}) {
  const ahead = DEMO_WEEK.map((count, i) => ({ date: shiftISO(today, i + 1), count }));
  if (scenario === 'nothing-due') {
    return { date: today, items: [], total: 0, doneCount: 0, dueCount: 0, ahead, nextDue: { date: shiftISO(today, 2), count: 2 }, demo: true };
  }
  const items = DECK.map((c) => itemFrom(c, today, answers));
  return {
    date: today, items, total: items.length,
    doneCount: items.filter((i) => i.answered).length,
    dueCount: 2, ahead, nextDue: { date: ahead.find((a) => a.count)?.date || null, count: ahead.find((a) => a.count)?.count || 0 },
    demo: true,
  };
}

export function demoDrawn(today = localISO(), answers = {}) {
  return itemFrom(DRAWN, today, answers);
}

// a scenario from the URL, demo mode only: ?reviewDemo=nothing-due|offline
export function demoScenarioFromUrl() {
  if (typeof window === 'undefined') return null;
  try {
    const s = new URLSearchParams(window.location.search).get('reviewDemo');
    return s === 'nothing-due' || s === 'offline' ? s : null;
  } catch { return null; }
}
