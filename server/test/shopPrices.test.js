// THE PRICE READER (server/lib/shopPrices.js): each chain's parser on an
// invented answer shaped like its public search page, the bot-check
// detector, the one-request-at-a-time queue with its delay, the daily cache,
// and the blocked state that stops a chain instead of retrying it. No real
// network: fetch is a stub that answers from server/test/fixtures/shopping.
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-shopprices-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const P = await import('../lib/shopPrices.js');
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'shopping');
const fx = (n) => readFile(path.join(FIX, n), 'utf8');

test('Woolworths: products with price, size, unit price and special; unavailable and $0.00 dropped', async () => {
  const out = P.parseWoolworths(await fx('woolworths-search.json'));
  assert.equal(out.length, 4, 'the unavailable onion (no price) and the $0.00 promo are not products');
  const bag = out.find((p) => p.id === '100002');
  assert.equal(bag.chain, 'w');
  assert.equal(bag.price, 2.2);
  assert.equal(bag.size, '1kg');
  assert.equal(bag.unitPrice, '$2.20 / 1KG');
  assert.equal(bag.was, 2.9);
  assert.equal(bag.special, 'Special');
  assert.match(bag.url, /woolworths\.com\.au\/shop\/productdetails\/100002/);
  assert.equal(out.find((p) => p.id === '100001').was, null, 'a was price equal to now is not a special');
});

test('Coles: the page\'s data block read; tiles that are not products skipped', async () => {
  const out = P.parseColes(await fx('coles-search.html'));
  assert.equal(out.length, 4);
  const pack = out.find((p) => p.id === '2000002');
  assert.equal(pack.name, 'Coles Limes Prepacked');
  assert.equal(pack.price, 4);
  assert.equal(pack.was, 5);
  assert.equal(pack.special, 'Save $1.00');
  assert.equal(pack.unitPrice, '$8.00 per 1kg');
  assert.equal(out.find((p) => p.id === '2000004').available, false);
});

test('Aldi: cents read as dollars, the was price as a special', async () => {
  const out = P.parseAldi(await fx('aldi-search.json'));
  assert.equal(out.length, 3);
  assert.equal(out[0].price, 11.99);
  assert.equal(out[0].size, '1kg');
  assert.equal(out[0].name, 'Market Farm Chicken Thigh Fillets 1kg');
  assert.equal(out[1].was, 7.49);
  assert.equal(out[1].special, 'Special');
});

test('a changed page is unreadable, never an empty success', async () => {
  assert.throws(() => P.parseColes('<html></html>'), /data block/);
  assert.throws(() => P.parseWoolworths('<html>not json</html>'), /not its product data/);
  assert.throws(() => P.parseAldi('{"something":1}'), /without a product list/);
});

test('bot checks, rate limits and refusals are recognised', async () => {
  assert.match(P.detectBlock(200, await fx('coles-blocked.html')), /bot check/);
  assert.match(P.detectBlock(403, await fx('woolworths-blocked.html')), /bot check \(403\)/);
  assert.equal(P.detectBlock(429, ''), 'rate limited (429)');
  assert.equal(P.detectBlock(403, 'nope'), 'refused (403)');
  assert.equal(P.detectBlock(200, await fx('coles-search.html')), null);
});

// a stub network: answers by host from the fixtures, counting what it was asked
function stubNet(answers) {
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchImpl = async (url, init) => {
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
    calls.push({ url, ua: init?.headers?.['user-agent'], method: init?.method || 'GET' });
    await new Promise((r) => setTimeout(r, 5));
    const host = new URL(url).hostname;
    const a = answers[host] || { status: 404, body: '' };
    inFlight -= 1;
    return { status: a.status, text: async () => a.body };
  };
  return { fetchImpl, calls, max: () => maxInFlight };
}

test('the queue: one request at a time, the delay honoured between every two, an honest user agent, and the reads cached for the day', async () => {
  P._resetForTests();
  const net = stubNet({
    'www.woolworths.com.au': { status: 200, body: await fx('woolworths-search.json') },
    'www.coles.com.au': { status: 200, body: await fx('coles-search.html') },
    'api.aldi.com.au': { status: 200, body: await fx('aldi-search.json') },
  });
  const sleeps = [];
  const q = P.createQueue({ fetchImpl: net.fetchImpl, delayMs: 8000, sleep: async (ms) => { sleeps.push(ms); } });
  const items = [{ name: 'brown onions' }, { name: 'limes' }, { name: 'Brown Onion', checked: true }];
  const added = await P.readStale(items, { q });
  assert.equal(added, 6, 'two distinct lines × three chains (the second onion is the same product)');
  await q.idle();
  assert.equal(net.calls.length, 6);
  assert.equal(net.max(), 1, 'never two requests in flight');
  assert.equal(sleeps.length, 5, 'a wait before every request but the first');
  assert.ok(sleeps.every((ms) => ms > 7000 && ms <= 8000), `each wait about the delay: ${sleeps}`);
  assert.ok(net.calls.every((c) => /^NovaOS-Personal\/1\.0 \(/.test(c.ua)), 'it says what it is');
  const prices = await P.pricesFor(items);
  assert.equal(prices.chains.w.state, 'ok');
  const onion = prices.reads['brown onion'];
  assert.equal(onion.w.status, 'ok');
  assert.deepEqual(onion.w.products.map((p) => p.id).sort(), ['100001', '100002'], 'only brown onions: red onions and onion powder are not this line');
  assert.equal(prices.reads.lime.c.products.some((p) => /cordial/i.test(p.name)), false, 'lime cordial is not limes');
  // the same day again: nothing to read
  assert.equal(await P.readStale(items, { q }), 0, 'at most one read per product per chain per day');
  await q.idle();
  assert.equal(net.calls.length, 6);
  // the next day: read again
  const tomorrow = new Date(Date.now() + 36 * 3600 * 1000);
  assert.equal(await P.readStale(items, { q, now: tomorrow }), 6);
  await q.idle();
});

test('a blocked chain: recorded with its time, the rest of its queue dropped, no retry storm, tried once the next day', async () => {
  P._resetForTests();
  const net = stubNet({
    'www.woolworths.com.au': { status: 200, body: await fx('woolworths-search.json') },
    'www.coles.com.au': { status: 200, body: await fx('coles-blocked.html') },
    'api.aldi.com.au': { status: 503, body: 'down' },
  });
  const q = P.createQueue({ fetchImpl: net.fetchImpl, delayMs: 0, sleep: async () => {} });
  const items = ['brown onions', 'limes', 'avocados', 'eggs'].map((name) => ({ name }));
  await P.readStale(items, { q });
  await q.idle();
  const coles = net.calls.filter((c) => c.url.includes('coles'));
  assert.equal(coles.length, 1, 'one bot check stops the chain: three more reads were not sent');
  const aldi = net.calls.filter((c) => c.url.includes('aldi'));
  assert.equal(aldi.length, 4, 'an error is recorded once per read, never retried');
  let prices = await P.pricesFor(items);
  assert.equal(prices.chains.c.state, 'blocked');
  assert.ok(prices.chains.c.since, 'blocked since a real time');
  assert.match(prices.chains.c.detail, /bot check/);
  assert.equal(prices.chains.a.state, 'error');
  assert.equal(prices.reads['brown onion'].c.status, 'blocked');
  assert.equal(prices.reads.lime.c, undefined, 'no read was made, so none is claimed');
  // later the same day: Coles is not touched again
  await P.readStale(items, { q });
  await q.idle();
  assert.equal(net.calls.filter((c) => c.url.includes('coles')).length, 1);
  // the next day: ONE probe, still blocked, and the since time is kept
  const since = prices.chains.c.since;
  await P.readStale(items, { q, now: new Date(Date.now() + 36 * 3600 * 1000) });
  await q.idle();
  assert.equal(net.calls.filter((c) => c.url.includes('coles')).length, 2);
  prices = await P.pricesFor(items);
  assert.equal(prices.chains.c.since, since, 'blocked since the first block, not the latest');
});

test('his Try again sends one request; when the chain answers, the rest follow', async () => {
  P._resetForTests();
  const answers = { 'www.coles.com.au': { status: 200, body: await fx('coles-blocked.html') } };
  const net = stubNet(answers);
  const q = P.createQueue({ fetchImpl: net.fetchImpl, delayMs: 0, sleep: async () => {} });
  const items = ['limes', 'eggs', 'avocados'].map((name) => ({ name }));
  await P.readStale(items, { q, chains: ['c'] });
  await q.idle();
  assert.equal(net.calls.length, 1);
  answers['www.coles.com.au'] = { status: 200, body: await fx('coles-search.html') };
  await P.retryChain('c', items, { q });
  await q.idle();
  await new Promise((r) => setTimeout(r, 30));
  await q.idle();
  assert.equal(net.calls.length, 4, 'one probe, then the two lines still to read');
  assert.equal((await P.pricesFor(items)).chains.c.state, 'ok');
});

test('an unreadable page says so for that chain', async () => {
  P._resetForTests();
  const net = stubNet({ 'www.coles.com.au': { status: 200, body: await fx('coles-changed.html') } });
  const q = P.createQueue({ fetchImpl: net.fetchImpl, delayMs: 0, sleep: async () => {} });
  await P.readStale([{ name: 'limes' }], { q, chains: ['c'] });
  await q.idle();
  const prices = await P.pricesFor([{ name: 'limes' }]);
  assert.equal(prices.chains.c.state, 'unreadable');
  assert.equal(prices.reads.lime.c.status, 'unreadable');
  assert.deepEqual(prices.reads.lime.c.products, []);
});
