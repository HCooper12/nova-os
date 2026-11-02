// THE MEMOISED VIEW MODEL IS THE VIEW MODEL (2 Nov 2026, fluidity audit
// finding 2, design/audits/2026-11-02-fluidity-audit.md).
//
// src/vals/compose.js hands back a builder's last result when nothing it read
// has changed. These tests hold it to the old renderVals (composeVals, every
// builder on every call): the same view model, key for key, over recorded
// states and every screen; a builder skipped only when its inputs are
// unchanged; and the mechanism itself (ctx replayed on a skip, the merged
// model, localStorage, inputs from outside, closures that read live state)
// pinned with builders of the test's own.
//
// The states: demo-home is the app's own state captured in a fresh browser
// profile on demo data (Home under summary); demo-session is demo-home with an
// INVENTED live training slice (one routine, three lifts, made-up numbers)
// and a session open on Train, so the live paths of Train, the session page
// and the island run. Nothing of his is in either. Two variants are derived
// in the test: the Train page with no session, and demo-home offline under
// cupertino (the honest-degradation branches).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// a browser-shaped localStorage, before anything reads it
class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
  setItem(k, v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(String(k)); }
  clear() { this.m.clear(); }
}
globalThis.Storage = FakeStorage;
Object.defineProperty(globalThis, 'localStorage', { value: new FakeStorage(), configurable: true, writable: true });

// one fixed clock for both builds, so "now" is the same instant in each
const RealDate = Date;
let NOW = RealDate.UTC(2026, 10, 2, 3, 20, 10);
class FixedDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}
globalThis.Date = FixedDate;

const { composeVals, createValsMemo, diffVals, BASE, STAGES } = await import('../../src/vals/compose.js');
const { SCREEN_KEYS } = await import('../../src/screenKeys.js');
const { recipes, notes, basePlan, reviews } = await import('../../src/data.js');
const { journalActions } = await import('../../src/journalActions.js');

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const fixture = (name) => JSON.parse(read(`server/test/fixtures/valsMemo/${name}.json`));

// a fake App: the recorded state, the instance fields the builders read, the
// one method a builder calls while building (the demo journal, the real
// mixin), and a stable do-nothing method for anything else
function makeApp(state) {
  const stubs = new Map();
  const target = { state, recipes, notes, basePlan, reviews, ttsSaidWindow: '', _inboxItemsMemo: undefined, journalDemoDays: journalActions.journalDemoDays };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      if (!stubs.has(k)) stubs.set(k, function stub() { return undefined; });
      return stubs.get(k);
    },
  });
}
const go = () => () => {};
const warm = () => () => {};
const ctxOf = (st) => ({
  st, userName: 'Hayden', wakeWord: 'Nova',
  demoMode: st.connectionStatus === 'demo', isOffline: st.connectionStatus === 'offline',
  lastSyncLabel: st.lastSyncAt ? 'fixed' : null, go, warm,
});
// the old way, on its own app (a builder's own caches never cross over)
const reference = (st) => composeVals(makeApp(st), ctxOf(st));

// the same, two ways: structurally (functions by source) and as JSON
function assertSame(memo, ref, label) {
  assert.deepEqual(diffVals(memo, ref, { limit: 8 }), [], `${label}: the memoised view model differs`);
  assert.equal(JSON.stringify(memo), JSON.stringify(ref), `${label}: the JSON differs`);
}

const STATES = () => {
  const home = fixture('demo-home');
  const session = fixture('demo-session');
  const train = { ...session, workoutsView: 'routines', workoutSession: null };
  const offline = { ...home, connectionStatus: 'offline', novaStyle: 'cupertino' };
  return { home, session, train, offline };
};

test('the fixtures are demo data (nothing of his) and a session is live in the second', () => {
  const { home, session } = STATES();
  assert.equal(home.connectionStatus, 'demo');
  assert.deepEqual(session.liveWorkoutRoutines.map((r) => r.name), ['Push Day'], 'the invented routine');
  assert.equal(home.novaStyle, 'summary');
  assert.ok(session.workoutSession && session.workoutSession.exercises.length > 0, 'the session fixture carries a live session');
});

test('every screen, four states: the memoised view model equals the old one, key for key', () => {
  const memo = createValsMemo({ now: () => NOW });
  const states = STATES();
  const app = makeApp(states.home);
  let checked = 0;
  // 'code' only: valsCode reads import.meta.env (Vite's), which node does not
  // have; the in-app verify (fluidity.mjs --verify) covers that screen
  const screens = SCREEN_KEYS.filter((k) => k !== 'code');
  for (const [name, base] of Object.entries(states)) {
    for (const screen of screens) {
      const st = { ...base, screen };
      app.state = st;
      const got = memo.compose(app, ctxOf(st));
      assertSame(got, reference(st), `${name} on ${screen}`);
      checked += 1;
    }
  }
  assert.equal(checked, 4 * screens.length);
  // and it was a memo: most builders were handed back on most screens
  const b = memo.stats.builders;
  assert.ok(b.recipes.hits > b.recipes.runs, 'Recipes ran on every screen');
});

test('a commit that changed nothing runs no builder at all', () => {
  const memo = createValsMemo({ now: () => NOW });
  const st = STATES().session;
  const app = makeApp(st);
  const first = memo.compose(app, ctxOf(st));
  const runs = () => Object.values(memo.stats.builders).reduce((n, x) => n + x.runs, 0);
  const before = runs();
  const again = memo.compose(app, ctxOf(st));
  assert.equal(runs(), before, 'a builder ran with nothing changed');
  assertSame(again, first, 'the same state twice');
  assertSame(again, reference(st), 'and still the old view model');
});

test('one slice changed: the builders that read it run again, the rest are handed back, and the view model is still the old one', () => {
  const memo = createValsMemo({ now: () => NOW });
  const st0 = { ...STATES().home, screen: 'notes' };
  const app = makeApp(st0);
  memo.compose(app, ctxOf(st0));
  const snap = () => Object.fromEntries(Object.entries(memo.stats.builders).map(([k, v]) => [k, v.runs]));
  const r0 = snap();
  // the Notes search box: read by valsNotes, which also writes ctx
  // (journalDays, reviewPage) that valsMission and valsChrome read
  const st1 = { ...st0, noteQuery: 'zz-no-such-note' };
  app.state = st1;
  const got = memo.compose(app, ctxOf(st1));
  const r1 = snap();
  assertSame(got, reference(st1), 'after a search');
  assert.equal(r1.notes, r0.notes + 1, 'Notes did not run again');
  assert.equal(r1.recipes, r0.recipes, 'Recipes ran though nothing it reads changed');
  assert.equal(r1.workouts, r0.workouts, 'Workouts ran though nothing it reads changed');
});

test('the minute turns: everything is rebuilt, so "today" and "3 min ago" read as they did', () => {
  const memo = createValsMemo({ now: () => NOW });
  const st = STATES().home;
  const app = makeApp(st);
  memo.compose(app, ctxOf(st));
  const saved = NOW;
  try {
    NOW += 61_000;
    const runs0 = memo.stats.builders.recipes.runs;
    const got = memo.compose(app, ctxOf(st));
    assert.equal(memo.stats.builders.recipes.runs, runs0 + 1);
    assertSame(got, reference(st), 'a minute later');
    // a day later, too
    NOW += 24 * 3600_000;
    assertSame(memo.compose(app, ctxOf(st)), reference(st), 'a day later');
  } finally { NOW = saved; }
});

test('a localStorage key a builder read is an input: the More sheet\'s frequent screens follow a visit', () => {
  const memo = createValsMemo({ now: () => NOW });
  const st = STATES().home;
  const app = makeApp(st);
  localStorage.removeItem('novaos.screenVisits');
  memo.compose(app, ctxOf(st));
  localStorage.setItem('novaos.screenVisits', JSON.stringify({ notes: 9, money: 5 }));
  try {
    const got = memo.compose(app, ctxOf(st));
    assertSame(got, reference(st), 'after the visits changed');
    assert.ok(memo.inspect().chrome.ls.includes('novaos.screenVisits'));
  } finally { localStorage.removeItem('novaos.screenVisits'); }
});

// ------------------------------------------------- the mechanism, alone --

function tiny() {
  const ran = { a: 0, b: 0, c: 0, s: 0 };
  const base = [
    ['a', (app, ctx) => { ran.a += 1; ctx.doubled = app.state.n * 2; return { aOut: app.state.n }; }],
    ['b', (app, ctx) => { ran.b += 1; return { bOut: `${ctx.doubled}:${app.state.label}` }; }],
    // reads nothing while building: only its closures read, later
    ['c', (app, ctx) => { ran.c += 1; return { readLater: () => app.state.label, ctxLater: () => ctx.doubled }; }],
  ];
  const stages = [['s', (app, ctx, v) => { ran.s += 1; return { sOut: `${v.bOut}!`, fromLs: localStorage.getItem('tiny.key'), ext: app.state.extTick }; }]];
  let outside = 0;
  const memo = createValsMemo({ now: () => NOW, base, stages, external: { s: () => [outside] } });
  return { memo, ran, setOutside: (x) => { outside = x; } };
}

test('mechanism: a skipped builder replays the ctx it wrote, so the builder after it sees the same values', () => {
  const { memo, ran } = tiny();
  const app = { state: { n: 2, label: 'x' } };
  memo.compose(app, {});
  app.state = { n: 2, label: 'y' };
  const out = memo.compose(app, {});
  assert.deepEqual([ran.a, ran.b], [1, 2], 'a was skipped, b ran');
  assert.equal(out.bOut, '4:y', 'b read ctx.doubled from the replayed write');
  app.state = { n: 3, label: 'y' };
  assert.equal(memo.compose(app, {}).bOut, '6:y', 'a changed input reruns a, and b with it');
  assert.equal(ran.a, 2);
});

test('mechanism: a stage reruns when a merged key it read changes, and not otherwise', () => {
  const { memo, ran } = tiny();
  const app = { state: { n: 1, label: 'x' } };
  memo.compose(app, {});
  app.state = { ...app.state, unrelated: 1 };
  memo.compose(app, {});
  assert.equal(ran.s, 1, 'the stage ran though bOut did not change');
  app.state = { ...app.state, label: 'z' };
  assert.equal(memo.compose(app, {}).sOut, '2:z!');
  assert.equal(ran.s, 2);
});

test('mechanism: localStorage and listed outside inputs are dependencies', () => {
  const { memo, ran, setOutside } = tiny();
  const app = { state: { n: 1, label: 'x' } };
  localStorage.removeItem('tiny.key');
  memo.compose(app, {});
  localStorage.setItem('tiny.key', 'set');
  try {
    assert.equal(memo.compose(app, {}).fromLs, 'set');
    assert.equal(ran.s, 2);
    setOutside(1);
    memo.compose(app, {});
    assert.equal(ran.s, 3, 'an outside input changing reruns the stage');
    memo.compose(app, {});
    assert.equal(ran.s, 3);
  } finally { localStorage.removeItem('tiny.key'); }
});

test('mechanism: a closure from a skipped build reads the live state and the latest ctx, as one from this commit would', () => {
  const { memo } = tiny();
  const app = { state: { n: 1, label: 'first' } };
  const out1 = memo.compose(app, {});
  app.state = { n: 5, label: 'first' };
  const out2 = memo.compose(app, {});
  assert.equal(out2.readLater, out1.readLater, 'c was skipped: the same closure');
  app.state = { ...app.state, label: 'now' };
  assert.equal(out1.readLater(), 'now', 'the closure reads this.state, not the state it was built in');
  assert.equal(out1.ctxLater(), 10, 'and the latest ctx');
});

// --------------------------------------------------- the source contract --

test('the memo runs the builders in the reference\'s order, and App renders through it', () => {
  const src = read('src/vals/compose.js');
  const ref = src.slice(src.indexOf('export function composeVals'), src.indexOf('const minuteOf'));
  const order = [...ref.matchAll(/\.\.\.(vals[A-Z]\w*)\(app, ctx/g)].map((m) => m[1]);
  assert.deepEqual([...BASE, ...STAGES].map(([, fn]) => fn.name), order, 'BASE + STAGES drifted from composeVals');
  const app = read('src/App.jsx');
  assert.match(app, /const v = this\.valsMemo\.compose\(this, ctx\);/);
  assert.match(app, /go: this\.ctxGo \|\| \(this\.ctxGo = /, 'ctx.go is made once, or no builder that reads it is ever skipped');
});
