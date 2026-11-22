// THE CALENDAR CACHE UNDER A FRESH FETCH (22 Nov 2026). The watcher polls with
// fresh:true every 25 s while a client is open. A fresh fetch used to REPLACE
// the settled cache entry with its own pending promise, so every ordinary reader
// that arrived during that round trip (the snapshot, the instruments, the
// widget, the Reflex peek) waited on iCloud although a good value had been
// sitting in the cache a moment earlier. These tests pin the rule that replaces
// it: a fresh fetch never displaces a settled entry until it has itself landed.
//
// The same file pins how the calendars inside one round trip are asked: together
// (four at a time) but read in their own order, so the result is the one the
// serial walk gave.
//
// Env first: nothing here may touch the real calendar or the real data dir. The
// DAV client is a fake whose every round trip is a deferred the test opens by
// hand, so "slow iCloud" is a promise and never a timer.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-calfresh-'));
process.env.NOVA_DATA_DIR = dataDir;
delete process.env.ICLOUD_USERNAME;
delete process.env.ICLOUD_APP_PASSWORD;

import test, { beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// Dynamic: static imports hoist above the env setup above.
const cal = await import('../lib/calendar.js');

// Until a test installs its own fake, any use of the client fails loudly
// rather than reaching iCloud.
const noNetwork = {
  fetchCalendars() { throw new Error('no real CalDAV in tests'); },
  fetchCalendarObjects() { throw new Error('no real CalDAV in tests'); },
};
cal._setCalendarClientForTest(noNetwork);

const DAY = new Date(2026, 10, 20, 12, 0, 0);       // Fri 20 Nov 2026, local noon
const NEXT_DAY = new Date(2026, 10, 21, 12, 0, 0);
// A controlled clock: the TTL and the "which fetch started later" rules read
// Date.now(), so the tests move it by hand instead of waiting.
const BASE = Date.parse('2026-11-20T02:00:00Z');
const clock = { now: BASE };
const PAST_TTL = 100_000;                           // lib/calendar.js: 90 s
const PAST_A_DAY = 25 * 3600_000;                   // lib/calendar.js: 24 h

/* --------------------------------------------------------------- helpers --- */

const tick = () => new Promise((r) => setImmediate(r));
// every promise chain the code under test owns is microtasks, so a few turns of
// the loop is "nothing more is going to happen on its own"
async function settle() { for (let i = 0; i < 5; i++) await tick(); }
// waiting FOR something (a round trip to reach its gate) polls with 1 ms naps
async function until(cond, what) {
  for (let i = 0; i < 300; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 1));
  }
  assert.fail(`never happened: ${what}`);
}

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
// What a calendar hands back: one ICS object per label, all at 09:00 on the
// first requested day (same slot for everyone, so the final order is exactly the
// order the events were collected in).
function objectsFor(titles, timeRange) {
  const start = new Date(timeRange.start);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);
  return titles.map((title) => ({
    url: `https://cal.test/${slug(title)}.ics`,
    etag: '"1"',
    data: cal.buildEventICal({ uid: `${slug(title)}@test`, title, start, end }),
  }));
}

// A fake DAV client. Every fetchCalendarObjects call is a gate the test opens;
// `trips` counts fetchCalendars calls, which is one per CalDAV round trip.
function fakeClient(calendars = [{ url: 'https://cal.test/one/', displayName: 'Calendar' }]) {
  const f = {
    calendars,
    script: {},          // calendar url -> labels | Error | 'throws' (what its gate yields)
    holdList: false,     // true: fetchCalendars itself waits for the test
    trips: 0,
    listGates: [],
    gates: [],
    inFlight: 0,
    maxInFlight: 0,
    fetchCalendars() {
      f.trips += 1;
      if (!f.holdList) return Promise.resolve(f.calendars);
      const d = deferred();
      f.listGates.push(d);
      return d.promise;
    },
    fetchCalendarObjects({ calendar, timeRange }) {
      const plan = f.script[calendar.url];
      if (plan === 'throws') throw new Error(`${calendar.displayName} blew up`);
      const d = deferred();
      const gate = { calendar, timeRange, opened: false, index: f.gates.length };
      gate.open = (what = plan ?? []) => {
        if (gate.opened) return;
        gate.opened = true;
        if (what instanceof Error) d.reject(what);
        else d.resolve(objectsFor(what, timeRange));
      };
      f.gates.push(gate);
      f.inFlight += 1;
      f.maxInFlight = Math.max(f.maxInFlight, f.inFlight);
      return d.promise.finally(() => { f.inFlight -= 1; });
    },
  };
  return f;
}

let fake;
beforeEach(async () => {
  clock.now = BASE;
  mock.method(Date, 'now', () => clock.now);
  fake = fakeClient();
  cal._setCalendarClientForTest(fake);            // also drops the event cache
  await cal.saveCalendarPrefs([]);
  // no prefs file, so no disk read hides inside a round trip
  await rm(path.join(dataDir, 'calendar-prefs.json'), { force: true });
});
afterEach(async () => {
  mock.restoreAll();
  // never leave a read hanging behind a failed assertion
  for (const g of fake.listGates) g.resolve(fake.calendars);
  for (const g of fake.gates) g.open();
  await settle();
});
after(async () => {
  cal._setCalendarClientForTest(noNetwork);
  await rm(dataDir, { recursive: true, force: true });
});

const read = (opts, day = DAY) => cal.fetchEventsForDay(day, opts);
const labels = (events) => events.map((e) => e.label);
// a read that records how it ended, so "has it answered yet?" is a plain check
function watch(p) {
  const s = { done: false, value: undefined, error: undefined };
  p.then((v) => { s.done = true; s.value = v; }, (e) => { s.done = true; s.error = e; });
  return s;
}
const gateAt = async (i) => {
  await until(() => fake.gates.length > i, `round trip ${i + 1} reached its gate`);
  return fake.gates[i];
};
// the first read of a day: one round trip, landed with these labels
async function seed(titles = ['Old'], day = DAY) {
  const i = fake.gates.length;
  const p = read(undefined, day);
  (await gateAt(i)).open(titles);
  return p;
}

/* ----------------------------------------- a settled entry under a fresh fetch --- */

test('an ordinary read is answered from the settled entry while a fresh fetch is in flight', async () => {
  assert.deepEqual(labels(await seed()), ['Old']);
  const fresh = watch(read({ fresh: true }));
  const gate = await gateAt(1);                    // the fresh fetch is out at iCloud, and stays there
  const ordinary = watch(read());
  await settle();
  assert.ok(ordinary.done, 'an ordinary read waited for the in-flight fresh fetch instead of taking the settled value');
  assert.deepEqual(labels(ordinary.value), ['Old']);
  assert.equal(fake.trips, 2, 'the ordinary read must not start a round trip of its own');
  assert.equal(fresh.done, false, 'the fresh caller is still waiting on its own fetch');
  gate.open(['New']);
  await settle();
  assert.deepEqual(labels(fresh.value), ['New']);
});

test('the Reflex peek is answered from the settled entry too, never from the in-flight fetch', async () => {
  await seed();
  watch(read({ fresh: true }));
  await gateAt(1);
  const peeked = watch(cal.peekCachedEventsForDay(DAY));
  await settle();
  assert.ok(peeked.done, 'the peek waited for the in-flight fresh fetch');
  assert.deepEqual(labels(peeked.value), ['Old']);
});

test('once the fresh fetch lands, the fresh caller and every later ordinary read see the new picture', async () => {
  await seed();
  const fresh = watch(read({ fresh: true }));
  (await gateAt(1)).open(['New']);
  await settle();
  assert.deepEqual(labels(fresh.value), ['New'], 'the fresh caller gets what it fetched');
  const later = watch(read());
  await settle();
  assert.ok(later.done);
  assert.deepEqual(labels(later.value), ['New'], 'later ordinary reads see the new value');
  assert.equal(fake.trips, 2, 'and are answered from the cache, not by another round trip');
});

test('inside the stale window a fresh fetch still leaves the old picture serving, with no second round trip behind it', async () => {
  await seed();
  clock.now += PAST_TTL;                           // expired, but well inside the stale window
  const fresh = watch(read({ fresh: true }));
  const gate = await gateAt(1);
  const ordinary = watch(read());
  await settle();
  assert.ok(ordinary.done, 'an ordinary read waited for the in-flight fresh fetch');
  assert.deepEqual(labels(ordinary.value), ['Old']);
  assert.equal(fake.trips, 2, 'the fresh fetch is the refresh, so no second one may start behind it');
  gate.open(['New']);
  await settle();
  assert.deepEqual(labels(fresh.value), ['New']);
  const later = watch(read());
  await settle();
  assert.deepEqual(labels(later.value), ['New']);
  assert.equal(fake.trips, 2);
});

test('a failed fresh fetch changes nothing: the old picture keeps serving until the usual expiry, and the caller sees the failure', async () => {
  await seed();
  fake.holdList = true;
  const down = new Error('iCloud is down');
  const fresh = watch(read({ fresh: true }));
  await until(() => fake.listGates.length === 1, 'the fresh fetch started');
  fake.listGates[0].reject(down);
  await settle();
  assert.equal(fresh.error, down, 'the fresh caller gets the very error iCloud gave, unwrapped');
  fake.holdList = false;

  // inside the TTL: served as before, from the entry the failure must not have touched
  const during = watch(read());
  await settle();
  assert.ok(during.done, 'the failed fresh fetch took the settled value away');
  assert.deepEqual(labels(during.value), ['Old']);
  assert.equal(fake.trips, 2, 'no round trip for an ordinary read inside the TTL');

  // past the TTL the existing stale-while-revalidate logic takes over: an
  // instant answer and exactly ONE refresh behind it
  clock.now += PAST_TTL;
  const stale = watch(read());
  await settle();
  assert.deepEqual(labels(stale.value), ['Old'], 'expired but inside the stale window: still served at once');
  assert.equal(fake.trips, 3, 'one background refresh started');
  watch(read());
  await settle();
  assert.equal(fake.trips, 3, 'and only one');
  (await gateAt(1)).open(['Newer']);
  await settle();
  const refreshed = watch(read());
  await settle();
  assert.deepEqual(labels(refreshed.value), ['Newer']);

  // beyond a day nothing stale is shown: the read blocks on the real thing
  clock.now += PAST_A_DAY;
  const n = fake.gates.length;
  const aged = watch(read());
  await settle();
  assert.equal(aged.done, false, 'an entry older than a day must not be served');
  (await gateAt(n)).open(['Today']);
  await settle();
  assert.deepEqual(labels(aged.value), ['Today']);
});

/* ------------------------------------------------------------- cold start --- */

test('cold start: concurrent readers share one in-flight fetch', async () => {
  const a = watch(read());
  const b = watch(read());
  const c = watch(cal.fetchEventsForRange(1, DAY));   // a one-day range is the same window
  const gate = await gateAt(0);
  await settle();
  assert.equal(fake.trips, 1, 'three readers, one round trip');
  assert.equal(fake.gates.length, 1);
  gate.open(['Only']);
  await settle();
  for (const r of [a, b, c]) assert.deepEqual(labels(r.value), ['Only']);
});

test('a cold failure is not cached: the next read tries again', async () => {
  fake.holdList = true;
  const first = watch(read());
  await until(() => fake.listGates.length === 1, 'the first read started a round trip');
  const second = watch(read());
  await settle();
  assert.equal(fake.trips, 1, 'the second reader shares the first round trip');
  const down = new Error('offline');
  fake.listGates[0].reject(down);
  await settle();
  assert.equal(first.error, down);
  assert.equal(second.error, down);
  fake.holdList = false;
  const third = watch(read());
  const gate = await gateAt(0);
  assert.equal(fake.trips, 2, 'the failure was not remembered');
  gate.open(['Back']);
  await settle();
  assert.deepEqual(labels(third.value), ['Back']);
});

test('an older fetch failing late does not evict the entry a newer fetch put there', async () => {
  fake.holdList = true;
  const cold = watch(read());                          // round trip 1, held at fetchCalendars
  await until(() => fake.listGates.length === 1, 'the cold read started');
  const fresh = watch(read({ fresh: true }));          // round trip 2, arrives while 1 is out
  await until(() => fake.listGates.length === 2, 'the fresh call started its own trip');
  assert.equal(fake.trips, 2, 'a fresh call always makes its own trip, as before');
  fake.listGates[1].resolve(fake.calendars);           // the newer one lands first
  (await gateAt(0)).open(['Two']);
  await settle();
  assert.deepEqual(labels(fresh.value), ['Two']);
  fake.listGates[0].reject(new Error('the old one died'));   // and the older one fails late
  await settle();
  assert.ok(cold.error, 'the cold reader sees its own failure');
  fake.holdList = false;
  const after = watch(read());
  await settle();
  assert.ok(after.done, 'the old failure evicted the newer entry');
  assert.deepEqual(labels(after.value), ['Two']);
  assert.equal(fake.trips, 2);
});

/* ------------------------------------------------ overlapping fresh, writes --- */

test('overlapping fresh calls start no more round trips than before, and the newer fetch wins the cache', async () => {
  await seed();
  const f1 = watch(read({ fresh: true }));
  const g1 = await gateAt(1);
  clock.now += 1000;
  const f2 = watch(read({ fresh: true }));
  const g2 = await gateAt(2);
  assert.equal(fake.trips, 3, 'two overlapping fresh calls are two trips on top of the seed, as before');
  g2.open(['Two']);                                    // the later fetch lands first
  g1.open(['One']);                                    // the earlier, slower one lands last
  await settle();
  assert.deepEqual(labels(f1.value), ['One'], 'each fresh caller gets its own fetch');
  assert.deepEqual(labels(f2.value), ['Two']);
  const later = watch(read());
  await settle();
  assert.deepEqual(labels(later.value), ['Two'], 'an older fetch landing late must not overwrite the newer picture');
  assert.equal(fake.trips, 3);
});

test('a write invalidates even a fresh fetch already in flight: its pre-write picture is never cached', async () => {
  await seed();
  const fresh = watch(read({ fresh: true }));
  const gate = await gateAt(1);
  cal.invalidateCalendarCache();                       // he has just made a change
  gate.open(['PreWrite']);
  await settle();
  assert.deepEqual(labels(fresh.value), ['PreWrite'], 'the caller still gets what it asked for');
  const after = watch(read());
  const next = await gateAt(2);                        // nothing was cached, so this reader asks iCloud
  assert.equal(fake.trips, 3);
  next.open(['PostWrite']);
  await settle();
  assert.deepEqual(labels(after.value), ['PostWrite']);
});

test('a write invalidates a background refresh already in flight too: its pre-write picture is never cached', async () => {
  await seed();
  clock.now += PAST_TTL;                               // expired, but well inside the stale window
  const stale = watch(read());                         // answered from the old entry, and starts the refresh behind it
  const gate = await gateAt(1);
  await settle();
  assert.deepEqual(labels(stale.value), ['Old']);
  cal.invalidateCalendarCache();                       // he has just made a change
  gate.open(['PreWrite']);
  await settle();
  const after = watch(read());
  const next = await gateAt(2);                        // nothing was cached, so this reader asks iCloud
  assert.equal(fake.trips, 3);
  next.open(['PostWrite']);
  await settle();
  assert.deepEqual(labels(after.value), ['PostWrite']);
});

/* ---------------------------------------------------------- key granularity --- */

test('the cache key stays per window: another day and a longer range have their own entries', async () => {
  assert.deepEqual(labels(await seed(['Day one'], DAY)), ['Day one']);
  assert.deepEqual(labels(await seed(['Day two'], NEXT_DAY)), ['Day two']);
  assert.equal(fake.trips, 2, 'two days, two round trips');

  const again = watch(read());
  const againTwo = watch(read(undefined, NEXT_DAY));
  await settle();
  assert.deepEqual(labels(again.value), ['Day one']);
  assert.deepEqual(labels(againTwo.value), ['Day two']);
  assert.equal(fake.trips, 2, 'each day is answered from its own entry');

  const i = fake.gates.length;
  const range = watch(cal.fetchEventsForRange(3, DAY));
  (await gateAt(i)).open(['Day one', 'Range only']);
  await settle();
  assert.deepEqual(labels(range.value), ['Day one', 'Range only']);
  assert.equal(fake.trips, 3, 'a three-day range is its own window');

  const rangeAgain = watch(cal.fetchEventsForRange(3, DAY));
  const oneDay = watch(cal.fetchEventsForRange(1, DAY));
  await settle();
  assert.deepEqual(labels(rangeAgain.value), ['Day one', 'Range only']);
  assert.deepEqual(labels(oneDay.value), ['Day one'], 'a one-day range is the day entry (the widget relies on it)');
  assert.equal(fake.trips, 3);

  // a fresh fetch of one window leaves every other window alone
  const fresh = watch(read({ fresh: true }));
  const gate = await gateAt(i + 1);
  const other = watch(read(undefined, NEXT_DAY));
  const rangeMid = watch(cal.fetchEventsForRange(3, DAY));
  const day = watch(read());
  await settle();
  assert.deepEqual(labels(other.value), ['Day two']);
  assert.deepEqual(labels(rangeMid.value), ['Day one', 'Range only']);
  assert.ok(day.done, 'the day under a fresh fetch waited for it');
  assert.deepEqual(labels(day.value), ['Day one']);
  assert.equal(fake.trips, 4, 'only the fresh call went to iCloud');
  gate.open(['Day one edited']);
  await settle();
  assert.deepEqual(labels(fresh.value), ['Day one edited']);
});

/* -------------------------------- the calendars inside one round trip --- */

const CAL_URL = (n) => `https://cal.test/${n.toLowerCase()}/`;
const CALS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n) => ({ url: CAL_URL(n), displayName: `Cal ${n}` }));
async function scriptSeveral() {
  fake.calendars = CALS;
  fake.script = {
    [CAL_URL('A')]: ['Team sync'],
    [CAL_URL('B')]: ['Team-sync'],              // the same event twice: equal letters, equal length, same slot
    [CAL_URL('C')]: ['Hidden event'],           // hidden in prefs: must never be asked
    [CAL_URL('D')]: new Error('503'),           // errors: skipped
    [CAL_URL('E')]: ['Echo'],
    [CAL_URL('F')]: 'throws',                   // throws before it even returns a promise: skipped
    [CAL_URL('G')]: ['Golf'],
    [CAL_URL('H')]: ['Hotel'],
  };
  await cal.saveCalendarPrefs([CAL_URL('C')]);
}
// open whatever is in flight, the NEWEST first, so calendars land in the reverse
// of their own order whatever the implementation allows to be in flight at once
async function drain(r) {
  for (let i = 0; i < 400 && !r.done; i++) {
    const live = fake.gates.filter((g) => !g.opened);
    if (live.length) live.reduce((a, b) => (b.index > a.index ? b : a)).open();
    await new Promise((res) => setTimeout(res, 1));
  }
}

test('several calendars: collected in their own order, hidden ones never asked, a failing one skipped, the same twin survives', async () => {
  await scriptSeveral();
  const r = watch(read());
  await drain(r);
  assert.ok(r.done, 'the read finished');
  assert.equal(r.error, undefined);
  // landing order was reversed; the result still follows the calendars' own order,
  // and of the Team sync twins the first-collected one (calendar A) survives
  assert.deepEqual(labels(r.value), ['Team sync', 'Echo', 'Golf', 'Hotel']);
  assert.ok(fake.gates.every((g) => g.calendar.url !== CAL_URL('C')), 'a hidden calendar is never asked');
  assert.deepEqual(r.value.map((e) => e.calendar), ['Cal A', 'Cal E', 'Cal G', 'Cal H']);
});

test('calendars are asked together, never more than four at once', async () => {
  await scriptSeveral();
  const r = watch(read());
  await until(() => fake.gates.length >= 4, 'four calendars were asked together');
  await settle();
  assert.equal(fake.gates.length, 4, 'a fifth waits for a free slot');
  assert.equal(fake.inFlight, 4);
  fake.gates[1].open();
  await until(() => fake.gates.length === 5, 'the freed slot went to the next calendar');
  assert.equal(fake.inFlight, 4);
  await drain(r);
  assert.ok(r.done);
  assert.equal(fake.maxInFlight, 4);
  assert.deepEqual(labels(r.value), ['Team sync', 'Echo', 'Golf', 'Hotel']);
});
