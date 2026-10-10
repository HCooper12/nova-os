// THE STASH PAGE'S VIEW, BY CODE (src/stashModel.js): the news line, the due
// card, the vials, the badges, the sort, the gift days and the worst case,
// computed from the demo's invented Stash and a pinned clock. Pure: no
// network, no files.
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildStashView, shelfLook, VIAL_MAX } = await import('../../src/stashModel.js');
const { demoStashState, demoWrites } = await import('../../src/stashDemo.js');
const { todayISO } = await import('../../src/stashRhythm.js');

const NOW = Date.UTC(2026, 9, 10, 1, 0); // noon, Sat 10 Oct 2026, Melbourne

test('the head: one due item is named, the count follows; the due card says the days by the calendar', () => {
  const V = buildStashView({ stash: demoStashState('demo', NOW), now: NOW, demo: true });
  assert.equal(V.state, 'ready');
  assert.equal(V.news.map((p) => p.text).join(''), 'Hydrating cleanser is due a look. 13 links on 5 shelves.');
  assert.equal(V.due.name, 'Hydrating cleanser 236 ml');
  assert.equal(V.due.words, 'About 6 days left by the calendar');
  assert.deepEqual(V.vials.map((x) => x.left), [6, 12, 18, 64], 'soonest first, the numbers mockup 88 draws');
  assert.equal(V.status, 'Demo links, invented');
});

test('badges: due before on-the-list before a price drop before days left; a wall says blocked', () => {
  const s = demoStashState('demo', NOW);
  const V = buildStashView({ stash: s, now: NOW, demo: true });
  const by = (name) => V.shelves.flatMap((x) => x.cards).find((c) => c.name === name).badge;
  assert.deepEqual(by('Hydrating cleanser 236 ml'), { tone: 'due', text: 'Check the level' });
  assert.deepEqual(by('Chef knife sharpener'), { tone: 'drop', text: 'Down $10' });
  assert.deepEqual(by('Desk mat'), { tone: 'quiet', text: 'Blocked by the site' });
  assert.deepEqual(by('Mineral sunscreen SPF 50'), { tone: 'new', text: 'From Safari' });
  const low = demoWrites.check(s, s.categories[0].items[1].raw, 'low').state;
  const V2 = buildStashView({ stash: low, now: NOW, demo: true });
  assert.equal(V2.byRaw[low.categories[0].items[1].raw].badge.text, 'On your list');
});

test('sort: Added keeps Stash.md order (a link from Safari first for its day); Name, Days left and Last opened reorder', () => {
  const s = demoStashState('demo', NOW);
  const names = (sort) => buildStashView({ stash: s, ui: { sort }, now: NOW, demo: true }).shelves[0].cards.map((c) => c.name.split(' ')[0]);
  assert.deepEqual(names('added'), ['Mineral', 'Hydrating', 'Daily', 'Retinol', 'Lip']);
  assert.deepEqual(names('name'), ['Daily', 'Hydrating', 'Lip', 'Mineral', 'Retinol']);
  assert.deepEqual(names('days'), ['Hydrating', 'Daily', 'Retinol', 'Lip', 'Mineral']);
  assert.deepEqual(names('opened'), ['Lip', 'Mineral', 'Daily', 'Hydrating', 'Retinol'], 'opened today, then added an hour ago');
  const opened = buildStashView({ stash: s, ui: { sort: 'opened' }, now: NOW, demo: true }).shelves[0].cards[0];
  assert.equal(opened.sub, 'opened today');
});

test('gift days and colour: a gift shelf says its day and wears the gift hue; Bought is rows, newest first', () => {
  const V = buildStashView({ stash: demoStashState('demo', NOW), now: NOW, demo: true });
  const mum = V.shelves.find((x) => x.name === 'For Mum');
  assert.match(mum.dateWords, /in 24 days$/);
  assert.equal(mum.glyph, 'gift');
  assert.deepEqual(V.bought.rows.map((r) => r.sub.split(' · ')[0]), ['Bought 30 Sept', 'Bought 13 Sept', 'Bought 2 Sept']);
  assert.equal(shelfLook({ name: 'Skincare' }).hue, 'var(--nv-mg)');
  assert.equal(shelfLook({ name: 'Garden', items: [] }).hue, 'var(--nv-m-calves)');
});

test('the worst case: 300 links, vials held to two rows, an empty item said in words, a past gift day says "was"', () => {
  const V = buildStashView({ stash: demoStashState('worst', NOW), now: NOW, demo: true });
  assert.equal(V.total, 304);
  assert.equal(V.vials.length, VIAL_MAX);
  assert.ok(V.vialsMore > 0);
  assert.match(V.due.words, /^Empty by the calendar: bought \d+ days ago$/);
  assert.match(V.shelves.find((x) => x.gift).dateWords, /^was /);
  assert.equal(buildStashView({ stash: demoStashState('empty', NOW), now: NOW }).state, 'empty');
  assert.equal(buildStashView({ stash: { loading: true } }).state, 'loading');
  assert.equal(todayISO(NOW), '2026-10-10');
});

test('the demo refuses a second copy of a link, after normalising, the way the server does', () => {
  const s = demoStashState('demo', NOW);
  assert.throws(() => demoWrites.add(s, { category: 'Kitchen', name: 'x', url: 'http://www.skin.example.com/p/cleanser/?utm_source=a' }), (e) => e.duplicate?.category === 'Skincare');
});
