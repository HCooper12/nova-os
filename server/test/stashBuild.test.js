// THE STASH REBUILD (10 Oct 2026): link pictures read from Open Graph and
// cached, the price watch's politeness and its blocked state, the duplicate
// normaliser, Bought and the rhythm that learns from real dates, gift-day
// reminders that wait for quiet hours, the code-read Stash source for Ask
// Nova and the consult rail, and Undo on every write.
//
// Isolated: NOVA_DATA_DIR and a vault in temp dirs BEFORE any import; every
// fetch is a fixture from server/test/fixtures/stash (never the web); pushes
// go to a test transport (never a device).
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-stashb-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-stashb-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TODOIST_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'stash');
const fixture = (f) => readFile(path.join(FIX, f));

const { stashKey } = await import('../../src/stashUrl.js');
const { learnedRhythm, rhythmOf, todayISO, addDays } = await import('../../src/stashRhythm.js');
const stash = await import('../lib/stash.js');
const meta = await import('../lib/stashMeta.js');
const rails = await import('../lib/stashRails.js');
const sig = await import('../lib/stashSignals.js');
const { listRecords } = await import('../lib/inboxStore.js');
const { undoRecord } = await import('../lib/inbox.js');
const push = await import('../lib/push.js');
const { AGENTS } = await import('../lib/consult.js');
const { loadShoppingList } = await import('../lib/shoppingList.js');

const STASH_FILE = path.join(vault, stash.STASH_REL);

// THE FAKE WEB: url -> fixture. Every call is logged with its headers.
const web = new Map();
const calls = [];
let inFlight = 0;
let maxInFlight = 0;
function respond({ status = 200, body = '', type = 'text/html' }) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : null) },
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    body: null,
  };
}
meta.deps.fetch = async (url, opts = {}) => {
  inFlight++;
  maxInFlight = Math.max(maxInFlight, inFlight);
  calls.push({ url, ua: opts.headers?.['User-Agent'], at: meta.deps.now() });
  await new Promise((r) => setTimeout(r, 2));
  inFlight--;
  const hit = web.get(url);
  if (!hit) return respond({ status: 404, body: 'not found' });
  return respond(typeof hit === 'function' ? await hit() : hit);
};
// a virtual clock: the queue's pauses are recorded, never slept
let clock = Date.UTC(2026, 9, 10, 1, 0); // 12:00 Melbourne, Sat 10 Oct 2026
const waits = [];
meta.deps.now = () => clock;
meta.deps.sleep = async (ms) => { waits.push(ms); clock += ms; };

test.after(async () => {
  push._setPushTransportForTests(null);
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(vault, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/* ------------------------------ duplicates -------------------------------- */

test('the duplicate normaliser: tracking, www, scheme, slash, order and fragment are one page; a variant is not', () => {
  const base = stashKey('https://skin.example.com/p/cleanser');
  for (const u of [
    'http://www.skin.example.com/p/cleanser/',
    'https://SKIN.example.com/p/cleanser?utm_source=news&utm_medium=email',
    'https://skin.example.com/p/cleanser?fbclid=abc#reviews',
    'https://skin.example.com:443/p/cleanser?igshid=1&gclid=2&si=3',
  ]) assert.equal(stashKey(u), base, u);
  assert.equal(stashKey('https://a.example.com/x?b=2&a=1'), stashKey('https://a.example.com/x?a=1&b=2&utm_campaign=z'));
  assert.notEqual(stashKey('https://skin.example.com/p/cleanser?variant=2'), base, 'a real parameter keeps its meaning');
  assert.notEqual(stashKey('https://skin.example.com/p/Cleanser'), base, 'paths are case-sensitive');
});

test('a link already on a shelf is never saved twice: the second add says where it is', async () => {
  await rails.addLink(vault, { category: 'Skincare', name: 'Hydrating cleanser 236 ml', url: 'https://skin.example.com/p/cleanser' });
  await assert.rejects(
    rails.addLink(vault, { category: 'Kitchen', name: 'Again', url: 'http://www.skin.example.com/p/cleanser/?utm_source=x' }),
    (e) => e.status === 409 && e.duplicate?.category === 'Skincare' && /already on Skincare/.test(e.message),
  );
  const s = await stash.loadStash(vault);
  assert.equal(s.categories.flatMap((c) => c.items).length, 1);
  // the old Inbox door refuses the same way
  await assert.rejects(stash.addStashItem(vault, { category: 'Skincare', name: 'x', url: 'https://skin.example.com/p/cleanser#top' }), /already on Skincare/);
});

/* ------------------------------ the format -------------------------------- */

test('inline fields round-trip, and a line with none is the old line byte for byte', () => {
  const plain = stash.formatStashItem({ name: 'Lip balm', url: 'https://skin.example.com/balm', note: 'the red one' });
  assert.equal(plain, '- [Lip balm](https://skin.example.com/balm) — the red one');
  const line = stash.formatStashItem({ name: 'Cleanser', url: 'https://skin.example.com/c', note: 'nights', fields: { watch: 'on', lasts: 8, bought: '2026-09-12' } });
  assert.equal(line, '- [Cleanser](https://skin.example.com/c) — nights [lasts:: 8] [bought:: 2026-09-12] [watch:: on]');
  const it = stash.parseItemLine(line);
  assert.deepEqual([it.name, it.note, it.lasts, it.bought, it.watch], ['Cleanser', 'nights', 8, '2026-09-12', true]);
  const bare = stash.parseItemLine('- [x](https://a.example.com) [lasts:: 6]');
  assert.equal(bare.note, null);
  assert.equal(bare.lasts, 6);
  const parsed = stash.parseStash('## For Mum [date:: 2026-12-25]\n- [Scarf](https://a.example.com/s)\n## Bought\n');
  assert.deepEqual([parsed.categories[0].name, parsed.categories[0].gift, parsed.categories[0].date, parsed.categories[1].bought], ['For Mum', 'Mum', '2026-12-25', true]);
});

/* ------------------------------ Open Graph -------------------------------- */

test('Open Graph: the picture, the name and the offer read off a page; fallbacks when there is none', async () => {
  const p = meta.parsePage((await fixture('product.html')).toString(), 'https://skin.example.com/p/cleanser');
  assert.equal(p.title, 'Hydrating Cleanser 236 ml');
  assert.equal(p.images[0], 'https://skin.example.com/img/cleanser.png', 'a relative og:image is made absolute');
  assert.equal(p.product, true);
  assert.deepEqual(p.offer, { price: 21.95, currency: 'AUD', inStock: true });
  const icon = meta.parsePage((await fixture('icon-only.html')).toString(), 'https://shop.example.com/mat');
  assert.equal(icon.title, 'Desk Mat, Large', 'twitter:title when there is no og:title');
  assert.deepEqual(icon.images, []);
  assert.equal(icon.icon, 'https://shop.example.com/touch.png', 'the apple-touch-icon is the last fallback');
  assert.equal(icon.offer.price, 89);
  const none = meta.parsePage((await fixture('no-og.html')).toString(), 'https://plain.example.org/');
  assert.equal(none.title, 'A plain page with no picture');
  assert.deepEqual(none.images, []);
  assert.equal(none.icon, null);
  assert.equal(meta.blockedReason(200, (await fixture('challenge.html')).toString()), 'the site asked for a bot check');
  assert.match(meta.blockedReason(403, ''), /refused the read \(403\)/);
  assert.equal(meta.blockedReason(200, (await fixture('product.html')).toString()), null);
});

test('the picture is cached once in server/data and never fetched again; a page with none is not asked twice', async () => {
  web.set('https://skin.example.com/p/cleanser', { body: await fixture('product.html') });
  web.set('https://skin.example.com/img/cleanser.png', { body: await fixture('cleanser.png'), type: 'image/png' });
  web.set('https://plain.example.org/', { body: await fixture('no-og.html') });
  calls.length = 0;
  const first = await meta.previewLink('https://skin.example.com/p/cleanser');
  assert.equal(first.name, 'Hydrating Cleanser 236 ml');
  assert.match(first.image, /^[a-f0-9]{20}\.png$/);
  assert.ok(existsSync(path.join(dataDir, 'stash', 'media', first.image)), 'saved under NOVA_DATA_DIR, never the vault');
  assert.equal(calls.length, 2, 'the page, then its picture');
  assert.ok(calls.every((c) => c.ua === meta.UA), 'an honest User-Agent on every read');
  const again = await meta.previewLink('https://skin.example.com/p/cleanser/?utm_source=x');
  assert.equal(again.image, first.image);
  assert.equal(calls.length, 2, 'cached: the same link (normalised) reads nothing');
  const media = await meta.readMedia(first.image);
  assert.equal(media.type, 'image/png');
  assert.equal(await meta.readMedia('../meta.json'), null, 'only hash names are served');

  const plain = await meta.previewLink('https://plain.example.org/');
  assert.equal(plain.image, null);
  assert.equal(plain.name, 'A plain page with no picture');
  const n = calls.length;
  await meta.previewLink('https://plain.example.org/');
  assert.equal(calls.length, n, 'a page without a picture is not asked again');

  // a picture that 404s leaves a miss marker; asked again, nothing is fetched
  const before = calls.length;
  assert.equal(await meta.cacheImage('https://skin.example.com/img/gone.png'), null);
  assert.equal(await meta.cacheImage('https://skin.example.com/img/gone.png'), null);
  assert.equal(calls.length, before + 1);
  assert.ok((await readdir(path.join(dataDir, 'stash', 'media'))).some((f) => f.endsWith('.miss')));
});

test('the Reader keeps the article text once: no nav, footer, script or scraps; words and minutes counted', async () => {
  web.set('https://essays.example.net/practice', { body: await fixture('article.html') });
  calls.length = 0;
  const r = await meta.readerFor('https://essays.example.net/practice');
  assert.equal(r.state, 'ok');
  assert.equal(r.paras.length, 4);
  assert.equal(r.paras[0].h, 'What practice is');
  assert.ok(r.paras.every((p) => !/navigation|footer|script must/.test(p.p || p.h)));
  assert.match(r.paras[3].p, /a score & nothing else/);
  assert.ok(r.words > 40 && r.minutes >= 1);
  await meta.readerFor('https://essays.example.net/practice');
  assert.equal(calls.length, 1, 'fetched once, then kept');
  await meta.notePlace('https://essays.example.net/practice', 2);
  assert.equal((await meta.metaFor('https://essays.example.net/practice')).place.para, 2);
  web.set('https://wall.example.com/a', { status: 403, body: '' });
  const wall = await meta.readerFor('https://wall.example.com/a');
  assert.equal(wall.state, 'blocked');
});

/* ------------------------------ the price watch ---------------------------- */

test('the price watch: one polite queue, one read a day, a drop files ONE record, a wall says blocked and is not got round', async () => {
  push._setPushTransportForTests(async () => ({ sent: 1 }), { now: () => clock });
  const pushes = [];
  const deps = { sendPush: async (n) => { pushes.push(n); return { sent: 1 }; } };
  await rails.addLink(vault, { category: 'Desk setup', name: 'Watched cleanser', url: 'https://shop.example.com/w1' });
  await rails.addLink(vault, { category: 'Desk setup', name: 'Second item', url: 'https://shop.example.com/w2' });
  let s = await stash.loadStash(vault);
  for (const it of s.categories.find((c) => c.name === 'Desk setup').items) await rails.setWatch(vault, it.raw, true);

  web.set('https://shop.example.com/w1', { body: await fixture('product.html') });
  web.set('https://shop.example.com/w2', { body: await fixture('product-oos.html') });
  calls.length = 0; waits.length = 0; maxInFlight = 0;
  const day1 = await sig.runPriceWatch({ vaultPath: vault, now: clock, deps });
  assert.equal(day1.created.length, 0, 'a first read is a baseline, not news');
  assert.equal(calls.length, 2);
  assert.equal(maxInFlight, 1, 'one request at a time');
  assert.ok(waits.some((w) => w >= meta.deps.sameHostGapMs - 1), 'a pause before a second read of the same site');

  // the same day again: nothing is read
  const again = await sig.runPriceWatch({ vaultPath: vault, now: clock, deps });
  assert.equal(calls.length, 2, 'at most one read per product per day');
  assert.deepEqual(again.reads.map((r) => r.state), ['skipped', 'skipped']);

  // the next day: w1 is cheaper, w2 is back in stock
  clock += 86400000;
  web.set('https://shop.example.com/w1', { body: await fixture('product-drop.html') });
  web.set('https://shop.example.com/w2', { body: await fixture('product.html') });
  const day2 = await sig.runPriceWatch({ vaultPath: vault, now: clock, deps });
  assert.deepEqual(day2.created.map((r) => r.event.type).sort(), ['back-in-stock', 'price-drop']);
  const drop = day2.created.find((r) => r.event.type === 'price-drop');
  assert.equal(drop.kind, 'stash');
  assert.equal(drop.status, 'pending');
  assert.match(drop.text, /dropped from \$21\.95 to \$17\.50/);
  assert.equal(pushes.length, 2, 'one push per change');

  // day three: a bot check. Said, recorded, not retried, never evaded.
  clock += 86400000;
  web.set('https://shop.example.com/w1', { body: await fixture('challenge.html') });
  web.set('https://shop.example.com/w2', { status: 429, body: '' });
  const before = calls.length;
  const day3 = await sig.runPriceWatch({ vaultPath: vault, now: clock, deps });
  assert.deepEqual(day3.reads.map((r) => r.state), ['blocked', 'blocked']);
  assert.equal(calls.length, before + 2, 'one attempt each, no retry');
  assert.ok(calls.slice(before).every((c) => c.ua === meta.UA), 'the same honest User-Agent: no disguise');
  assert.equal(day3.created.length, 0);
  const m1 = await meta.metaFor('https://shop.example.com/w1');
  assert.equal(m1.price.state, 'blocked');
  assert.equal(m1.price.why, 'the site asked for a bot check');
  assert.equal(m1.price.amount, 17.5, 'the last good read is kept');
  await sig.runPriceWatch({ vaultPath: vault, now: clock, deps });
  assert.equal(calls.length, before + 2, 'blocked today means not tried again today');
  const ctx = await sig.stashContext({ vaultPath: vault, now: clock });
  assert.match(ctx, /Watched cleanser: blocked by the site \(the site asked for a bot check\)/);
  // a filed price event is never filed twice
  clock += 86400000;
  web.set('https://shop.example.com/w1', { body: await fixture('product-drop.html') });
  web.set('https://shop.example.com/w2', { body: await fixture('product.html') });
  const day4 = await sig.runPriceWatch({ vaultPath: vault, now: clock, deps });
  assert.equal(day4.created.length, 0, 'the same price after a wall is not news again');
  s = await stash.loadStash(vault);
  for (const it of s.categories.find((c) => c.name === 'Desk setup').items) await rails.removeLink(vault, it.raw);
});

/* ------------------------------ bought ------------------------------------- */

test('Mark bought: a one-off moves to Bought with its date and price; a restock item stays and its clock restarts', async () => {
  await rails.addLink(vault, { category: 'Desk setup', name: 'Monitor arm', url: 'https://shop.example.com/arm' });
  let s = await stash.loadStash(vault);
  const arm = s.categories.find((c) => c.name === 'Desk setup').items.find((i) => i.name === 'Monitor arm');
  await rails.markBought(vault, arm.raw, { paid: '$129', date: '2026-10-08' });
  s = await stash.loadStash(vault);
  assert.equal(s.categories.find((c) => c.name === 'Desk setup').items.some((i) => i.name === 'Monitor arm'), false, 'a one-off leaves its shelf');
  const bought = s.categories.find((c) => c.bought);
  assert.equal(bought.items[0].raw, '- [Monitor arm](https://shop.example.com/arm) [bought:: 2026-10-08] [paid:: 129.00] [from:: Desk setup]');
  await assert.rejects(rails.markBought(vault, arm.raw, { paid: 10 }), /no longer there/);

  const cleanser = s.categories.find((c) => c.name === 'Skincare').items[0];
  const set = await rails.setRhythm(vault, cleanser.raw, 8);
  assert.match(set.raw, /\[lasts:: 8\] \[bought:: \d{4}-\d{2}-\d{2}\]/);
  await assert.rejects(rails.markBought(vault, set.raw, { paid: 'about forty', date: '2026-08-01' }), /could not read "about forty" as a price/);
  await rails.markBought(vault, set.raw, { date: '2026-08-01' });
  s = await stash.loadStash(vault);
  let c = s.categories.find((x) => x.name === 'Skincare').items[0];
  assert.equal(c.bought, '2026-08-01', 'it stays on Skincare with its clock restarted');
  await rails.markBought(vault, c.raw, { date: '2026-10-03', paid: 21.95 });
  s = await stash.loadStash(vault);
  const hist = s.categories.find((x) => x.bought).items.filter((i) => i.key === stashKey('https://skin.example.com/p/cleanser'));
  assert.deepEqual(hist.map((h) => h.bought), ['2026-10-03', '2026-08-01'], 'Bought is newest first');
  const learned = learnedRhythm(hist.map((h) => h.bought));
  assert.deepEqual(learned, { weeks: 9, days: 63, purchases: 2 }, 'his own dates say every 9 weeks, against the 8 he set');
  assert.deepEqual(learnedRhythm(['2026-01-01']), null, 'one purchase teaches nothing');
  assert.equal(learnedRhythm(['2026-01-01', '2026-02-26', '2026-04-23', '2026-08-01']).weeks, 8, 'the middle gap, not the mean');
});

/* ------------------------------ level checks and gifts --------------------- */

test('a due level check files one record and one push; Plenty left moves it two weeks; answered closes the card', async () => {
  const today = todayISO(clock);
  let s = await stash.loadStash(vault);
  const c = s.categories.find((x) => x.name === 'Skincare').items[0];
  const out = await rails.setRhythm(vault, c.raw, 4);
  // bought 22 days ago, lasts 4 weeks: the check is due (a week before empty)
  const due = await stash.stashUpdate(vault, out.raw, { bought: addDays(today, -22) });
  s = await stash.loadStash(vault);
  const r = rhythmOf(s.categories.find((x) => x.name === 'Skincare').items[0], today);
  assert.deepEqual([r.left, r.due], [6, true]);
  const pushes = [];
  const deps = { sendPush: async (n) => { pushes.push(n); return { sent: 1 }; } };
  const run = await sig.runStashSignals({ vaultPath: vault, now: clock, deps });
  const level = run.created.filter((x) => x.event.type === 'level-check');
  assert.equal(level.length, 1);
  assert.match(level[0].text, /About 6 days left by the calendar/);
  assert.equal(pushes.length, 1);
  assert.equal((await sig.runStashSignals({ vaultPath: vault, now: clock, deps })).created.length, 0, 'never twice');
  await rails.answerCheck(vault, due.raw, 'plenty');
  const rec = (await listRecords()).find((x) => x.id === level[0].id);
  assert.equal(rec.status, 'filed', 'answered on the Stash closes its Inbox card');
  s = await stash.loadStash(vault);
  const after = s.categories.find((x) => x.name === 'Skincare').items[0];
  assert.equal(after.check, addDays(todayISO(), 14), 'asked again in two weeks');
  assert.equal(rhythmOf(after, today).due, false);
});

test('a gift day: one gentle reminder two weeks out, held through quiet hours; a past day says nothing', async () => {
  await writeFile(path.join(dataDir, 'quiet-hours.json'), JSON.stringify({ enabled: true, start: '22:00', end: '07:00' }), 'utf8');
  const late = Date.UTC(2026, 9, 10, 12, 30); // 23:30 Melbourne
  const today = todayISO(late);
  await rails.makeShelf(vault, { name: 'For Mum', date: addDays(today, 10) });
  await rails.makeShelf(vault, { name: 'For Sam', date: addDays(today, -3) });
  await rails.addLink(vault, { category: 'For Mum', name: 'Linen scarf', url: 'https://gifts.example.com/scarf' });
  const delivered = [];
  push._setPushTransportForTests(async (n) => { delivered.push(n); return { sent: 1 }; }, { now: () => late });
  const run = await sig.runStashSignals({ vaultPath: vault, now: late });
  const gifts = run.created.filter((x) => x.event.type === 'gift-soon');
  assert.equal(gifts.length, 1, 'For Sam has passed: no reminder');
  assert.equal(gifts[0].text, "Mum's day is in 10 days.");
  assert.match(gifts[0].event.body, /1 idea on For Mum/);
  assert.equal(delivered.length, 0, 'held: it is 23:30');
  const held = await push.heldPushes();
  assert.ok(held.some((h) => h.title === 'A gift day is coming'));
  push._setPushTransportForTests(async (n) => { delivered.push(n); return { sent: 1 }; }, { now: () => Date.UTC(2026, 9, 10, 20, 5) }); // 07:05
  await push.flushHeldPushes();
  assert.ok(delivered.some((d) => d.url === './#/stash'), 'delivered when quiet hours end');
  push._setPushTransportForTests(null);
  // twenty days out is not yet news
  assert.equal(sig.detectStashEvents({ stash: stash.parseStash(`## For Dad [date:: ${addDays(today, 20)}]\n`), today }).length, 0);
});

/* ------------------------------ the consult source ------------------------- */

test('the Stash consult source answers "what skincare am I running low on" from records, by code', async () => {
  const s = AGENTS.stash;
  assert.equal(s.code, true);
  assert.equal(s.canConsult, false, 'no model runs');
  const { text } = await s.ask(vault, 'what skincare am I running low on');
  assert.match(text, /^THE STASH \(/);
  assert.match(text, /Restock items, soonest first: Hydrating cleanser 236 ml \(Skincare\): about \d+ days? left of 4 weeks/);
  assert.match(text, /Gift lists: For Mum, \d{4}-\d{2}-\d{2} \(in 10 days\): Linen scarf/);
  assert.match(text, /Bought, newest first: Monitor arm on 2026-10-08 for \$129\.00 \(from Desk setup\)/);
  const ask = await import('../lib/askContext.js');
  assert.equal(typeof ask.buildAskContext, 'function');
});

/* ------------------------------ undo on every write ------------------------ */

test('Undo on every write: each rails write files a record, and Undo puts Stash.md (and the shopping list) back byte for byte', async () => {
  const read = () => readFile(STASH_FILE, 'utf8');
  const listLen = async () => (await loadShoppingList(vault)).items?.length ?? 0;
  const first = async (shelf = 'Skincare') => (await stash.loadStash(vault)).categories.find((c) => c.name === shelf).items[0].raw;
  const check = async (label, write) => {
    const before = await read();
    const listBefore = await listLen();
    const out = await write();
    assert.ok(out.record, `${label}: a record`);
    assert.equal(out.record.kind, 'stash-write');
    assert.equal(out.record.status, 'filed');
    assert.equal(out.record.undoData.route, 'stash-ops');
    await undoRecord(vault, out.record.id);
    assert.equal(await read(), before, `${label}: Stash.md is back`);
    assert.equal(await listLen(), listBefore, `${label}: the shopping list is back`);
  };
  await check('add', () => rails.addLink(vault, { category: 'Kitchen', name: 'Coffee beans 1 kg', url: 'https://roaster.example.com/beans', lasts: 4 }));
  await check('add on a new shelf', () => rails.addLink(vault, { category: 'Garden', name: 'Hose reel', url: 'https://garden.example.com/reel' }));
  await check('remove', async () => rails.removeLink(vault, await first()));
  await check('move', async () => rails.moveLink(vault, await first(), 'Kitchen'));
  await check('rhythm', async () => rails.setRhythm(vault, await first(), 12));
  await check('rhythm off', async () => rails.setRhythm(vault, await first(), 0));
  await check('watch', async () => rails.setWatch(vault, await first(), true));
  await check('note', async () => rails.setNote(vault, await first(), 'mornings only'));
  await check('finished', async () => rails.markRead(vault, await first(), true));
  await check('bought', async () => rails.markBought(vault, await first(), { paid: '24.50' }));
  await check('check: plenty', async () => rails.answerCheck(vault, await first(), 'plenty'));
  await check('check: low (adds a shopping line)', async () => rails.answerCheck(vault, await first(), 'low'));
  await check('check: reordered', async () => rails.answerCheck(vault, await first(), 'reordered'));
  await check('to the list', async () => {
    const out = await rails.toShoppingList(vault, await first());
    assert.equal(out.record.undoData.shoppingIds.length, 1);
    return out;
  });
  await check('a gift shelf', () => rails.makeShelf(vault, { name: 'For Alex', date: '2026-11-02' }));
  await check('a gift date changed', () => rails.makeShelf(vault, { name: 'For Mum', date: '2026-12-25' }));
  await check('share sheet', () => rails.shareLink(vault, { url: 'https://skin.example.com/serum', name: 'Vitamin C serum 30 ml' }));

  // Undo refuses honestly when the line changed since
  const out = await rails.setNote(vault, await first(), 'changed once');
  await rails.setNote(vault, await first(), 'changed twice');
  await assert.rejects(undoRecord(vault, out.record.id), /changed since/);
});

test('the share sheet picks the shelf its site already lives on, else Unsorted, and says a duplicate', async () => {
  const a = await rails.shareLink(vault, { url: 'https://skin.example.com/toner', name: 'Toner' });
  assert.equal(a.category, 'Skincare');
  assert.equal(a.picked, 'site');
  assert.equal((await meta.metaFor('https://skin.example.com/toner')).via, 'safari');
  const b = await rails.shareLink(vault, { url: 'https://brand-new.example.org/thing', name: 'A new thing' });
  assert.equal(b.category, 'Unsorted');
  await assert.rejects(rails.shareLink(vault, { url: 'https://skin.example.com/toner?utm_source=ig', name: 'Toner' }), (e) => e.duplicate?.category === 'Skincare');
});
