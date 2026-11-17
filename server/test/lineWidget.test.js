import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Tests without their own data dir write into his live server/data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-line-'));
process.env.NOVA_DATA_DIR = dir;

let L;
before(async () => { L = await import('../lib/lineWidget.js'); });

const item = (id, over = {}) => ({
  id, quote: `Line number ${id} is long enough to read out loud.`, who: null, host: null, podcast: 'Some Show',
  origin: null, byLong: 'Heard on Some Show', byShort: 'Heard on Some Show', at: '1:02', idea: `Idea ${id}`, sent: null, ...over,
});
const at = (y, m, d) => new Date(y, m - 1, d, 12, 0);
const mkPool = (n) => Array.from({ length: n }, (_, i) => item(`p${i}`));

test('attribution: both table entries, case-insensitive, whole name', () => {
  const w = L.attribute({ show: ' chris williamson ', who: null });
  assert.deepEqual([w.podcast, w.host, w.byLong, w.byShort], ['Modern Wisdom', 'Chris Williamson', 'Heard on Chris Williamson’s Modern Wisdom', 'Heard on Modern Wisdom']);
  const d = L.attribute({ show: 'The Diary Of A CEO', who: null });
  assert.deepEqual([d.podcast, d.host, d.byLong], ['The Diary Of A CEO', 'Steven Bartlett', 'Heard on Steven Bartlett’s The Diary Of A CEO']);
  const partial = L.attribute({ show: 'Chris Williamson Clips', who: null });
  assert.equal(partial.host, null);
  assert.equal(partial.podcast, 'Chris Williamson Clips');
});

test('attribution: a guest on a hosted show', () => {
  const a = L.attribute({ show: 'Chris Williamson', who: 'Naval Ravikant' });
  assert.equal(a.who, 'Naval Ravikant');
  assert.equal(a.byLong, 'on Chris Williamson’s Modern Wisdom');
  assert.equal(a.byShort, 'on Modern Wisdom');
});

test('attribution: the host speaking, or no host', () => {
  const h = L.attribute({ show: 'Chris Williamson', who: 'chris williamson' });
  assert.equal(h.byLong, 'on Modern Wisdom');
  assert.equal(h.byShort, 'on Modern Wisdom');
  const n = L.attribute({ show: 'Huberman Lab', who: 'Andrew Huberman' });
  assert.deepEqual([n.byLong, n.byShort, n.host], [', heard from Huberman Lab', ', heard from Huberman Lab', null]);
});

test('attribution: a speaker with no show says nothing', () => {
  const a = L.attribute({ show: null, who: 'Naval Ravikant' });
  assert.deepEqual([a.who, a.podcast, a.byLong, a.byShort], ['Naval Ravikant', null, null, null]);
});

test('attribution: no speaker', () => {
  const a = L.attribute({ show: 'Huberman Lab', who: null });
  assert.deepEqual([a.byLong, a.byShort], ['Heard from Huberman Lab', 'Heard from Huberman Lab']);
  const none = L.attribute({ show: null, who: null });
  assert.deepEqual([none.byLong, none.byShort, none.podcast], [null, null, null]);
});

test('attribution: host already in the show name is not said twice', () => {
  const orig = L.SHOWS.length;
  L.SHOWS.push({ channel: 'Lex Fridman', podcast: 'Lex Fridman Podcast', host: 'Lex Fridman' });
  try {
    assert.equal(L.attribute({ show: 'Lex Fridman', who: null }).byLong, 'Heard on Lex Fridman Podcast');
    assert.equal(L.attribute({ show: 'Lex Fridman', who: 'Elon' }).byLong, 'on Lex Fridman Podcast');
  } finally { L.SHOWS.length = orig; }
});

test('attribution: handles, Instagram and the channel name are not speakers', () => {
  assert.equal(L.attribute({ show: 'Some Account', who: '@someaccount' }).who, null);
  assert.equal(L.attribute({ show: 'Some Account', who: 'Some Account on Instagram' }).who, null);
  const same = L.attribute({ show: 'Some Account', who: 'some account' });
  assert.equal(same.who, null);
  assert.equal(same.podcast, 'Some Account');
  assert.equal(same.byLong, 'Heard from Some Account');
  assert.deepEqual([L.attribute({ show: 'Health Coach Kayo (MA)', who: 'Kayo' }).who, L.attribute({ show: 'Health Coach Kayo (MA)', who: 'Kayo' }).byLong], [null, 'Heard from Health Coach Kayo']);
  // in the table, the channel name is the host, a real speaker
  assert.equal(L.attribute({ show: 'Chris Williamson', who: 'Chris Williamson' }).who, 'Chris Williamson');
});

test('attribution: a tagline or a bracketed handle is not part of a name', () => {
  assert.equal(L.attribute({ show: 'Nigel Daley | Personal Brand Leadership', who: null }).byLong, 'Heard from Nigel Daley');
  assert.equal(L.attribute({ show: 'Health Coach Kayo (MA, INHC, CPT)', who: null }).podcast, 'Health Coach Kayo');
  const c = L.attribute({ show: 'Some Show', who: 'Caitlin (livingwithcait)' });
  assert.equal(c.who, 'Caitlin');
  assert.equal(c.byLong, ', heard from Some Show');
  // the account speaking on its own channel is still not named twice
  assert.equal(L.attribute({ show: 'Nigel Daley | Personal Brand Leadership', who: 'Nigel Daley' }).who, null);
  // a table show is found under its tagline too
  assert.equal(L.attribute({ show: 'Chris Williamson | Modern Wisdom', who: null }).byLong, 'Heard on Chris Williamson’s Modern Wisdom');
});

test('no dashes in any attribution string', () => {
  for (const s of ['Chris Williamson', 'The Diary Of A CEO', 'X']) {
    for (const who of [null, 'Guest']) {
      const a = L.attribute({ show: s, who });
      assert.ok(!/[–—]/.test(`${a.byLong}${a.byShort}`));
    }
  }
});

const Q = 'The quick brown fox jumps over the lazy dog every single morning';
test('acceptPhrase', () => {
  assert.equal(L.acceptPhrase(Q, 'brown fox jumps'), 'brown fox jumps');
  assert.equal(L.acceptPhrase(Q, 'Brown fox jumps'), null); // wrong case
  assert.equal(L.acceptPhrase(Q, '"lazy dog,"'), 'lazy dog'); // punctuation trimmed
  assert.equal(L.acceptPhrase(Q, 'fox'), null); // one word
  assert.equal(L.acceptPhrase(Q, 'quick brown fox jumps over the lazy'), null); // 7 words
  assert.equal(L.acceptPhrase('brown fox jumps over dogs', 'brown fox jumps over'), null); // under 6 words but 80% of the line
  assert.equal(L.acceptPhrase(Q, 'purple fox jumps'), null); // not in the line
  assert.equal(L.acceptPhrase(Q, 42), null);
  const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
  assert.equal(L.acceptPhrase(long, 'four five six seven eight nine'), 'four five six seven eight nine');
});

test('the pick is stable within a day and moves on the next', () => {
  const pool = mkPool(8);
  const a = L.composeLine({ now: at(2026, 11, 17), pool });
  const b = L.composeLine({ now: at(2026, 11, 17), pool, days: a.days });
  assert.equal(a.payload.line.id, b.payload.line.id);
  const c = L.composeLine({ now: at(2026, 11, 18), pool, days: a.days });
  assert.notEqual(c.payload.line.id, a.payload.line.id);
  assert.equal(c.payload.date, '2026-11-18');
  assert.equal(c.payload.previous.id, a.payload.line.id);
  assert.equal(c.payload.previous.date, '2026-11-17');
  assert.equal(a.payload.previous, null);
});

test('the order is not alphabetical', () => {
  const pool = mkPool(12);
  let days = [];
  const ids = [];
  for (let i = 0; i < 12; i += 1) {
    const r = L.composeLine({ now: at(2026, 11, 1 + i), pool, days });
    days = r.days; ids.push(r.payload.line.id);
  }
  assert.notDeepEqual(ids, [...ids].sort());
});

test('a full cycle shows every line once before any repeat, never yesterday at the boundary', () => {
  const pool = mkPool(5);
  let days = [];
  const ids = [];
  for (let i = 0; i < 30; i += 1) {
    const r = L.composeLine({ now: at(2026, 11, 1 + i), pool, days });
    days = r.days; ids.push(r.payload.line.id);
  }
  for (let c = 0; c < 6; c += 1) assert.equal(new Set(ids.slice(c * 5, c * 5 + 5)).size, 5, `cycle ${c}`);
  for (let i = 1; i < ids.length; i += 1) assert.notEqual(ids[i], ids[i - 1]);
});

test('a stored id no longer in the pool is replaced', () => {
  const pool = mkPool(4);
  const r = L.composeLine({ now: at(2026, 11, 17), pool, days: [{ date: '2026-11-17', id: 'gone' }] });
  assert.ok(pool.some((p) => p.id === r.payload.line.id));
  assert.deepEqual(r.days.filter((d) => d.date === '2026-11-17'), [{ date: '2026-11-17', id: r.payload.line.id }]);
});

test('previous skips an earlier day whose line has left the pool', () => {
  const pool = mkPool(4);
  const days = [{ date: '2026-11-14', id: 'p1' }, { date: '2026-11-16', id: 'gone' }];
  const r = L.composeLine({ now: at(2026, 11, 17), pool, days });
  assert.equal(r.payload.previous.id, 'p1');
  assert.equal(r.payload.previous.date, '2026-11-14');
});

test('an empty pool gives a null line and writes nothing new', () => {
  const r = L.composeLine({ now: at(2026, 11, 17), pool: [], days: [] });
  assert.equal(r.payload.line, null);
  assert.equal(r.payload.previous, null);
  assert.deepEqual(r.days, []);
});

test('only the last 120 days are kept', () => {
  const pool = mkPool(3);
  let days = [];
  for (let i = 0; i < 130; i += 1) days = L.composeLine({ now: new Date(2026, 0, 1 + i, 12), pool, days }).days;
  assert.equal(days.length, 120);
});

test('a phrase record for another quote gives em null; a good one is returned', () => {
  const pool = [item('p0', { quote: Q })];
  const stale = L.composeLine({ now: at(2026, 11, 17), pool, phrases: { p0: { quote: 'An older wording of the line', em: 'older wording' } } });
  assert.equal(stale.payload.line.em, null);
  const bad = L.composeLine({ now: at(2026, 11, 17), pool, phrases: { p0: { quote: Q, em: 'not in there' } } });
  assert.equal(bad.payload.line.em, null);
  const good = L.composeLine({ now: at(2026, 11, 17), pool, phrases: { p0: { quote: Q, em: 'lazy dog' } } });
  assert.equal(good.payload.line.em, 'lazy dog');
});

test('fillPhrase stores an accepted phrase and null for a rejected one, one fill per id', async () => {
  const a = await L.fillPhrase({ id: 'fa', quote: Q, runner: async () => '"brown fox jumps"' });
  assert.equal(a, 'brown fox jumps');
  const b = await L.fillPhrase({ id: 'fb', quote: Q, runner: async () => 'something invented' });
  assert.equal(b, null);
  const stored = await L.readPhrases();
  assert.deepEqual(stored.fa, { quote: Q, em: 'brown fox jumps' });
  assert.deepEqual(stored.fb, { quote: Q, em: null });

  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const slow = async () => { calls += 1; await gate; return 'lazy dog'; };
  const first = L.fillPhrase({ id: 'fc', quote: Q, runner: slow });
  const second = await L.fillPhrase({ id: 'fc', quote: Q, runner: slow });
  assert.equal(second, null);
  release();
  assert.equal(await first, 'lazy dog');
  assert.equal(calls, 1);
});

test('a failing runner is swallowed and stores nothing', async () => {
  const r = await L.fillPhrase({ id: 'fd', quote: Q, runner: async () => { throw new Error('model down'); } });
  assert.equal(r, null);
  assert.equal((await L.readPhrases()).fd, undefined);
  // and a later fill still works
  assert.equal(await L.fillPhrase({ id: 'fd', quote: Q, runner: async () => 'lazy dog' }), 'lazy dog');
});

test('sentenceFor keeps whole sentences only', () => {
  assert.equal(L.sentenceFor('Habits are the compound interest of self-improvement. More follows.'), 'Habits are the compound interest of self-improvement.');
  assert.equal(L.sentenceFor('Too short.'), null);
  assert.equal(L.sentenceFor('A fragment with no end'), null);
  assert.equal(L.sentenceFor(''), null);
});

test('attribution: a passed-on line names whose words they are, then who he heard them from', () => {
  const a = L.attribute({ show: 'Chris Williamson', who: null, origin: 'Tomas Verhoeven' });
  assert.deepEqual([a.who, a.origin, a.byLong, a.byShort], ['Tomas Verhoeven', 'Tomas Verhoeven', ', heard from Chris Williamson on Modern Wisdom', ', heard on Modern Wisdom']);
  const g = L.attribute({ show: 'Chris Williamson', who: 'Some Guest', origin: 'Tomas Verhoeven' });
  assert.equal(g.byLong, ', heard from Some Guest on Modern Wisdom');
  const p = L.attribute({ show: 'Some Account', who: null, origin: 'Tomas Verhoeven' });
  assert.deepEqual([p.who, p.byLong, p.byShort], ['Tomas Verhoeven', ', heard from Some Account', ', heard from Some Account']);
  assert.equal(L.attribute({ show: 'Some Account', who: null }).origin, null);
});
