// HIS NOTION WISHLIST (29 Oct 2026). These pin his calls: a link plus
// "wishlist" from Quick Capture or his voice adds a row in his own style
// ("⭐️Union Bomber Jacket (navy)"), with the photo, the AUD price and his
// category read by CODE; priority is never asked (Medium unless he says);
// stars come only from his words; the only questions are a category code
// could not match and a colour or size the page offers several of; a list
// not shared with the Nova connection says so in those words; every write
// rides the rails and Undo takes it back. Notion and the shops are fakes:
// no real call is ever made.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-wishlist-data-'));
process.env.NOVA_DATA_DIR = dataDir;
delete process.env.NOTION_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';

const W = await import('../lib/wishlist.js');
const M = await import('../lib/stashMeta.js');
const { getRecord, listRecords } = await import('../lib/inboxStore.js');
const { undoRecord, startCapture, wishlistLink } = await import('../lib/inbox.js');
// verbs.js first: it and verbJobs.js import each other, and the registry
// must be the one that loads first (as it is in the server)
const { tryCommand } = await import('../lib/verbs.js');
const { parseJobCommand } = await import('../lib/verbJobs.js');

const CATS = [
  ['cat-furniture', 'Furniture'], ['cat-cologne', 'Cologne'], ['cat-shoes', 'Shoes'], ['cat-posters', 'Posters'], ['cat-tech', 'Technology'],
  ['cat-clothing', 'Clothing'], ['cat-books', 'Books'], ['cat-ent', 'Entertainment'], ['cat-funko', 'Funko Pops'], ['cat-acc', 'Accessories'],
];
const CAT_NAMES = CATS.map(([, n]) => n);
const t = (s) => [{ plain_text: s, text: { content: s } }];

// ---------------------------------------------------------------- a fake Notion
function fakeNotion({ shared = true, rows = [] } = {}) {
  const calls = [];
  const json = (status, body) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body });
  const notShared = () => json(404, { object: 'error', code: 'object_not_found', message: 'Could not find database with ID: x. Make sure the relevant pages and databases are shared with your integration "Nova".' });
  const fetch = async (url, opts = {}) => {
    const u = url.replace('https://api.notion.com/v1', '');
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, url: u, body, version: opts.headers?.['Notion-Version'] });
    if (!shared) return notShared();
    if (opts.method === 'GET' && u === `/data_sources/${W.ITEMS_DS}`) return json(200, { object: 'data_source', parent: { type: 'database_id', database_id: 'db-items' }, properties: { Categories: { relation: { data_source_id: W.CATEGORIES_DS } } } });
    if (opts.method === 'POST' && u === `/data_sources/${W.CATEGORIES_DS}/query`) return json(200, { results: CATS.map(([id, n]) => ({ id, properties: { Name: { title: t(n) } } })), has_more: false });
    if (opts.method === 'GET' && u.startsWith(`/blocks/${W.PAGE_ID}/children`)) {
      return json(200, { results: [
        { id: 'h', type: 'heading_2', heading_2: { rich_text: t('Sizes') } },
        { id: 'cl1', type: 'column_list', has_children: true, column_list: {} },
        { id: 'cl2', type: 'column_list', has_children: true, column_list: {} },
      ], has_more: false });
    }
    if (u.startsWith('/blocks/cl1/children')) return json(200, { results: [{ id: 'c1', type: 'column' }, { id: 'c2', type: 'column' }], has_more: false });
    if (u.startsWith('/blocks/cl2/children')) throw new Error('the databases column is never read for sizes');
    const P = (s) => ({ type: 'paragraph', paragraph: { rich_text: t(s) } });
    const B = (s) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: t(s) } });
    if (u.startsWith('/blocks/c1/children')) return json(200, { results: [P('Shoes'), B('10-10.5 = U.K.'), B('10-10.5 = US/Australian'), P('Pants'), B('31 Waist 32 length (size 30 in general)')], has_more: false });
    if (u.startsWith('/blocks/c2/children')) return json(200, { results: [P('Shirt size'), B('Regular fit = small'), B('Slim fit = medium'), P('Sweaters/Jumpers'), B('Small or medium'), P('')], has_more: false });
    if (opts.method === 'POST' && u === '/pages') return json(200, { id: `page-${calls.filter((c) => c.url === '/pages').length}`, url: 'https://www.notion.so/page' });
    if (opts.method === 'PATCH' && u.startsWith('/pages/')) return json(200, { id: u.split('/')[2] });
    if (opts.method === 'POST' && u === `/data_sources/${W.ITEMS_DS}/query`) {
      const start = body.start_cursor ? Number(body.start_cursor) : 0;
      const page = rows.slice(start, start + 2);
      return json(200, { results: page, has_more: start + 2 < rows.length, next_cursor: String(start + 2) });
    }
    return json(400, { message: `fake Notion has no ${opts.method} ${u}` });
  };
  return { fetch, calls };
}

// ---------------------------------------------------------------- fake shops
const PAGES = {};
const shopFetches = [];
M.deps.fetch = async (url) => {
  shopFetches.push(url);
  const html = PAGES[url.split('#')[0]];
  if (!html) return { ok: false, status: 404, headers: { get: () => 'text/html' }, text: async () => '' };
  return { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => html };
};
M.deps.gapMs = 0;
M.deps.sameHostGapMs = 0;

const product = ({ title, site, image, price, currency, variants }) => `<html><head>
<meta property="og:title" content="${title}"><meta property="og:site_name" content="${site}"><meta property="og:image" content="${image}">
<meta property="product:price:amount" content="${price}"><meta property="product:price:currency" content="${currency}">
<script type="application/ld+json">${JSON.stringify(variants
    ? { '@type': 'ProductGroup', name: title, hasVariant: variants.map((v) => ({ '@type': 'Product', ...v, offers: { price, priceCurrency: currency } })), offers: { price, priceCurrency: currency } }
    : { '@type': 'Product', name: title, offers: { '@type': 'Offer', price, priceCurrency: currency } })}</script></head><body></body></html>`;

const JACKET = 'https://thursdayboots.com/products/mens-union-bomber-jacket-navy';
PAGES[JACKET] = product({ title: "Men's Union Bomber Jacket | Thursday Boots", site: 'Thursday Boots', image: 'https://cdn.thursday.com/jacket.jpg', price: '349.00', currency: 'AUD' });
const SHIRT = 'https://www.example-shop.com/products/oxford-overshirt';
PAGES[SHIRT] = product({ title: 'Oxford Overshirt – Example Shop', site: 'Example Shop', image: 'https://cdn.example.com/shirt.jpg', price: '120', currency: 'USD', variants: [{ color: 'Navy', size: 'S' }, { color: 'Khaki', size: 'M' }, { color: 'Olive', size: 'L' }] });
const THING = 'https://www.gadgets.example/item/42';
PAGES[THING] = product({ title: 'Gift Box Thing', site: 'Gadgets', image: 'https://cdn.gadgets.example/42.jpg', price: '20', currency: 'AUD' });

let notion;
function withNotion(opts) {
  notion = fakeNotion(opts);
  W.deps.fetch = notion.fetch;
  W.deps.getToken = async () => 'secret-token';
  W.deps.sleep = async () => {};
  W.deps.minGapMs = 0;
  W.deps.cacheImage = async () => 'aaaaaaaaaaaaaaaaaaaa.jpg';
  return notion;
}
async function fresh(opts) {
  await rm(path.join(dataDir, 'wishlist'), { recursive: true, force: true });
  M._resetMetaForTests();
  return withNotion(opts);
}
async function waitFor(fn, ms = 4000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 15));
  }
}

test.after(async () => { W._resetForTests(); await rm(dataDir, { recursive: true, force: true }); });

// ---------------------------------------------------------------- pure readers

test('his naming style: the store and shop boilerplate go, a colour becomes "(colour)", Men\'s goes', () => {
  assert.deepEqual(W.cleanName("Men's Union Bomber Jacket | Thursday Boots", { siteName: 'Thursday Boots', host: 'thursdayboots.com' }), { name: 'Union Bomber Jacket', colour: null });
  assert.deepEqual(W.cleanName('Haze Wall Cabinet - Black | ferm LIVING', { siteName: '', host: 'fermliving.com' }), { name: 'Haze Wall Cabinet', colour: 'black' });
  assert.deepEqual(W.cleanName('Buy Scout Boot Online – Shop Online', { host: 'x.com' }), { name: 'Scout Boot', colour: null });
  assert.deepEqual(W.cleanName('Le Male Elixir Parfum | Myer', { siteName: 'Myer', host: 'myer.com.au' }), { name: 'Le Male Elixir Parfum', colour: null });
  assert.equal(W.colourFrom({ url: JACKET }), 'navy');
  assert.equal(W.colourFrom({ url: 'https://fermliving.com/products/haze-wall-cabinet-reeded-glass-black?_ab=0' }), 'black');
  assert.equal(W.colourFrom({ url: 'https://shop.example/p/dunk-low-navy-and-white' }), 'navy and white');
  assert.equal(W.colourFrom({ url: 'https://shop.example/p/thing?color=olive' }), 'olive');
  assert.equal(W.colourFrom({ url: 'https://shop.example/p/thing', words: 'add it in khaki' }), 'khaki');
  assert.equal(W.colourFrom({ url: 'https://shop.example/p/apple-tv-4k' }), null);
});

test('THE CATEGORY TABLE: his words first, then the page name, then the link; two fits or none is a question', () => {
  const cases = [
    [{ words: 'add to my wishlist', title: 'Union Bomber Jacket', url: JACKET }, 'Clothing'],
    [{ title: 'Le Male Elixir Parfum', url: 'https://myer.com.au/p/le-male' }, 'Cologne'],
    [{ title: 'Stronger With You Intensely Eau de Parfum 100ml' }, 'Cologne'],
    [{ title: 'Duke Chelsea Boot' }, 'Shoes'],
    [{ title: 'Nike Dunk Low Retro' }, 'Shoes'],
    [{ title: 'The New Money Strategy (Paperback)' }, 'Books'],
    [{ title: 'AirPods Pro 3' }, 'Technology'],
    [{ title: 'Haze Wall Cabinet' }, 'Furniture'],
    [{ title: 'Funko Pop! Batman' }, 'Funko Pops'],
    [{ title: 'Leather Bifold Wallet' }, 'Accessories'],
    [{ title: 'Star Wars Art Print 50x70' }, 'Posters'],
    [{ title: 'PS5 Console' }, 'Entertainment'],
    [{ words: 'put it under tech', title: 'Gift Box Thing' }, 'Technology'],
    [{ words: 'clothing', title: 'Leather Bifold Wallet' }, 'Clothing'], // his word wins
    [{ url: 'https://x.example/shoes/12345' }, 'Shoes'],
  ];
  for (const [input, want] of cases) assert.equal(W.matchCategory(input, CAT_NAMES).name, want, JSON.stringify(input));
  const both = W.matchCategory({ title: 'Watch and Sneakers Bundle' }, CAT_NAMES);
  assert.equal(both.name, null);
  assert.deepEqual(both.candidates.sort(), ['Accessories', 'Shoes']);
  assert.equal(W.matchCategory({ title: 'Gift Box Thing' }, CAT_NAMES).name, null);
});

test('priority: his words or Medium, never asked; stars only from his words; "this month"; his note', () => {
  assert.equal(W.priorityFrom('add to my wishlist, high priority'), 'High');
  assert.equal(W.priorityFrom('I really want this'), 'High');
  assert.equal(W.priorityFrom('no rush'), 'Low');
  assert.equal(W.priorityFrom('add to my wishlist'), null);
  assert.equal(W.DEFAULT_PRIORITY, 'Medium');
  assert.equal(W.starsFrom('add to my wishlist'), 0);
  assert.equal(W.starsFrom('one of my top wants'), 1);
  assert.equal(W.starsFrom('star it'), 1);
  assert.equal(W.starsFrom('top of my most wanted'), 2);
  assert.equal(W.starsFrom('two stars'), 2);
  assert.equal(W.starsFrom('high priority'), 0, 'priority is not a star');
  assert.equal(W.statusFrom('buying it this month'), 'Purchasing This Month');
  assert.equal(W.statusFrom('add to my wishlist'), 'Considering Purchase');
  assert.equal(W.notesFrom('add this to my wishlist, high priority, the 7 pack in black', CAT_NAMES), 'The 7 pack in black');
  assert.equal(W.notesFrom('add to my wishlist under clothing', CAT_NAMES), '');
  assert.deepEqual(W.splitStars('⭐️⭐️Stronger with you intensely cologne'), { stars: 2, base: 'Stronger with you intensely cologne' });
  assert.deepEqual(W.splitStars('⭐️⭐️  Nike Air Force 1 Low'), { stars: 2, base: 'Nike Air Force 1 Low' });
  assert.deepEqual(W.splitStars('Haze Wall Cabinet (black)'), { stars: 0, base: 'Haze Wall Cabinet (black)' });
});

test('his Sizes, as he wrote them; a size note only where he wrote one (never invented)', () => {
  const sizes = W.parseSizes([
    { type: 'paragraph', text: 'Shoes' }, { type: 'bulleted_list_item', text: '10-10.5 = U.K.' },
    { type: 'paragraph', text: 'Shirt size' }, { type: 'bulleted_list_item', text: 'Regular fit = small' }, { type: 'bulleted_list_item', text: 'Slim fit = medium' },
    { type: 'paragraph', text: '' },
  ]);
  assert.deepEqual(sizes, { Shoes: ['10-10.5 = U.K.'], 'Shirt size': ['Regular fit = small', 'Slim fit = medium'] });
  assert.equal(W.sizeNote('Duke Chelsea Boot', 'Shoes', sizes), 'Size: 10-10.5 = U.K.');
  assert.equal(W.sizeNote('Oxford Shirt', 'Clothing', sizes), 'Size: Regular fit = small; Slim fit = medium');
  assert.equal(W.sizeNote('Union Bomber Jacket', 'Clothing', sizes), null);
  assert.equal(W.sizeNote('Chinos', 'Clothing', sizes), null, 'no Pants line here, so nothing');
});

// ---------------------------------------------------------------- the add

test('a link and "wishlist": one row in his style, photo, AUD price and category by code, Medium, no questions; on the rails', async () => {
  const n = await fresh();
  shopFetches.length = 0;
  const out = await W.addFromLink('/vault', { url: `${JACKET}?utm_source=ig&gclid=abc`, said: 'add this to my wishlist, one of my top wants' });
  const create = n.calls.find((c) => c.method === 'POST' && c.url === '/pages');
  assert.equal(create.version, '2025-09-03');
  assert.deepEqual(create.body.parent, { type: 'data_source_id', data_source_id: W.ITEMS_DS });
  const p = create.body.properties;
  assert.equal(p.Name.title[0].text.content, '⭐️Union Bomber Jacket (navy)');
  assert.equal(p['Item link'].rich_text[0].text.content, JACKET, 'tracking tags off');
  assert.equal(p.Price.number, 349);
  assert.deepEqual(p.Priority, { select: { name: 'Medium' } });
  assert.deepEqual(p.Status, { status: { name: 'Considering Purchase' } });
  assert.deepEqual(p.Categories, { relation: [{ id: 'cat-clothing' }] });
  assert.equal(p.Gallery.files[0].external.url, 'https://cdn.thursday.com/jacket.jpg');
  assert.equal(p.Notes, undefined, 'a jacket has no line in his Sizes, and he added no note');
  assert.deepEqual(out.questions, []);
  assert.equal(out.said, 'Added ⭐️Union Bomber Jacket (navy) to your Wishlist, under Clothing, $349.');
  const rec = await getRecord(out.record.id);
  assert.equal(rec.kind, 'wishlist');
  assert.equal(rec.status, 'filed');
  assert.equal(rec.destination, 'Wishlist · Considering');
  assert.deepEqual(rec.undoData, { kind: 'wishlist-add', pageId: 'page-1', name: '⭐️Union Bomber Jacket (navy)' });
  // Undo: the page archived (Notion's trash, 30 days)
  await undoRecord('/vault', rec.id);
  const archive = n.calls.find((c) => c.method === 'PATCH' && c.url === '/pages/page-1');
  assert.deepEqual(archive.body, { archived: true });
  assert.equal((await getRecord(rec.id)).status, 'undone');
});

test('the only questions: a category code could not match, and a colour the page offers several of; his tap writes it back', async () => {
  const n = await fresh();
  const out = await W.addFromLink('/vault', { url: SHIRT, said: 'wishlist this' });
  const p = n.calls.find((c) => c.url === '/pages').body.properties;
  assert.equal(p.Name.title[0].text.content, 'Oxford Overshirt');
  assert.equal(p.Price, undefined, 'USD is not AUD: Price stays empty');
  assert.match(p.Notes.rich_text[0].text.content, /Listed at 120 USD, not in AUD/);
  assert.match(p.Notes.rich_text[0].text.content, /Size: Regular fit = small; Slim fit = medium/, 'his shirt size from his Sizes section');
  assert.deepEqual(out.questions.map((q) => q.field), ['colour'], 'Clothing matched; priority never asked; his size is known');
  assert.deepEqual(out.questions[0].options, ['Navy', 'Khaki', 'Olive']);
  assert.match(out.said, /Which colour: Navy, Khaki, Olive\?$/);
  const a = await W.answer(out.record.id, null, 'khaki');
  assert.equal(a.field, 'colour');
  const patch = n.calls.filter((c) => c.method === 'PATCH').pop();
  assert.equal(patch.body.properties.Name.title[0].text.content, 'Oxford Overshirt (khaki)');
  assert.deepEqual((await getRecord(out.record.id)).decision.payload.questions, []);
  await assert.rejects(W.answer(out.record.id, 'colour', 'navy'), /no open colour question/);

  const thing = await W.addFromLink('/vault', { url: THING, said: 'add to my wishlist, high priority, this month' });
  const tp = n.calls.filter((c) => c.url === '/pages').pop().body.properties;
  assert.deepEqual(tp.Priority, { select: { name: 'High' } });
  assert.deepEqual(tp.Status, { status: { name: 'Purchasing This Month' } });
  assert.equal(tp.Categories, undefined);
  assert.deepEqual(thing.questions.map((q) => q.field), ['category']);
  assert.deepEqual(thing.questions[0].options, CAT_NAMES);
  await assert.rejects(W.answer(thing.record.id, 'category', 'Snacks'), /not one of the choices/);
  await W.answer(thing.record.id, 'category', 'technology');
  assert.deepEqual(n.calls.filter((c) => c.method === 'PATCH').pop().body.properties.Categories, { relation: [{ id: 'cat-tech' }] });
  assert.equal((await getRecord(thing.record.id)).destination, 'Wishlist · This month');
});

test('NOT SHARED: the error says exactly what to do, the shop page is never read, and the record says so', async () => {
  await fresh({ shared: false });
  shopFetches.length = 0;
  await assert.rejects(W.addFromLink('/vault', { url: JACKET, said: 'add to my wishlist' }), (e) => {
    assert.equal(e.code, 'not-shared');
    assert.match(e.message, /Share My Shopping Wishlist with the Nova connection in Notion/);
    return true;
  });
  assert.equal(shopFetches.length, 0);
  const rec = (await listRecords()).filter((r) => r.kind === 'wishlist' && r.status === 'error').pop();
  assert.match(rec.error, /Share My Shopping Wishlist/);
  await W.readAll();
  const view = await W.wishlistView();
  assert.equal(view.shared, false);
  assert.equal(view.reason, W.SHARE_HINT);
  W.deps.getToken = async () => null;
  assert.equal((await W.wishlistView()).reason, 'Connect Notion in Settings first');
});

test('a link already on his list is not added twice', async () => {
  const rows = [{ id: 'r1', created_time: '2026-10-01T00:00:00Z', properties: { Name: { title: t('⭐️Union Bomber Jacket (navy)') }, 'Item link': { rich_text: t(JACKET) }, Status: { status: { name: 'Considering Purchase' } } } }];
  const n = await fresh({ rows });
  await W.readAll();
  await assert.rejects(W.addFromLink('/vault', { url: `${JACKET}?utm_source=x`, said: 'wishlist' }), /already on your Wishlist as Union Bomber Jacket \(navy\)/);
  assert.equal(n.calls.filter((c) => c.url === '/pages').length, 0);
});

// ---------------------------------------------------------------- reading it all

test('readAll: every page of rows, stars split off, the link found in his text, categories by name; photos kept locally', async () => {
  const rows = [
    { id: 'r1', created_time: '2026-10-01T00:00:00Z', properties: { Name: { title: t('⭐️⭐️⭐️Apple TV 4K') }, 'Item link': { rich_text: t('Apple TV 4K\n\nhttps://www.apple.com/au/xc/product/MLFF4X/A') }, Priority: { select: { name: 'High' } }, Status: { status: { name: 'Considering Purchase' } }, Categories: { relation: [{ id: 'cat-tech' }] }, Gallery: { files: [{ type: 'file', name: 'tv.png', file: { url: 'https://s3.example/tv.png?X-Amz-Signature=1' } }] } } },
    { id: 'r2', created_time: '2026-09-01T00:00:00Z', properties: { Name: { title: t('Haze Wall Cabinet (black)') }, 'Shopping Link': { url: 'https://fermliving.com/products/haze' }, Status: { status: { name: 'Purchased' } }, Price: { number: 899 } } },
    { id: 'r3', archived: true, properties: { Name: { title: t('gone') } } },
  ];
  await fresh({ rows });
  const r = await W.readAll();
  assert.deepEqual(r, { ok: true, count: 2 });
  await waitFor(async () => (await W.readItems()).items.find((i) => i.id === 'r1')?.image);
  const view = await W.wishlistView();
  assert.equal(view.shared, true);
  const [tv, cab] = view.items;
  assert.equal(tv.name, 'Apple TV 4K');
  assert.equal(tv.stars, 3);
  assert.equal(tv.link, 'https://www.apple.com/au/xc/product/MLFF4X/A');
  assert.equal(tv.store, 'apple.com');
  assert.deepEqual(tv.categories, ['Technology']);
  assert.equal(tv.image, 'aaaaaaaaaaaaaaaaaaaa.jpg');
  assert.equal(tv.imageSource, undefined, 'the expiring Notion link never leaves the server');
  assert.equal(cab.link, 'https://fermliving.com/products/haze');
  assert.equal(cab.price, 899);
  assert.equal(cab.status, 'Purchased');
});

test('his taps on the page: status, star and remove each ride the rails, and Undo puts them back', async () => {
  const rows = [{ id: 'r1', created_time: '2026-10-01T00:00:00Z', properties: { Name: { title: t('Union Bomber Jacket (khaki)') }, Status: { status: { name: 'Considering Purchase' } } } }];
  const n = await fresh({ rows });
  await W.readAll();
  const s = await W.setStatus('r1', 'bought');
  assert.equal(s.status, 'Purchased');
  await undoRecord('/vault', s.recordId);
  assert.deepEqual(n.calls.filter((c) => c.method === 'PATCH').pop().body, { properties: { Status: { status: { name: 'Considering Purchase' } } } });
  const st = await W.setStars('r1', 2);
  assert.equal(st.name, '⭐️⭐️Union Bomber Jacket (khaki)');
  await undoRecord('/vault', st.recordId);
  assert.equal(n.calls.filter((c) => c.method === 'PATCH').pop().body.properties.Name.title[0].text.content, 'Union Bomber Jacket (khaki)');
  const rm2 = await W.removeItem('r1');
  assert.deepEqual(n.calls.filter((c) => c.method === 'PATCH').pop().body, { archived: true });
  await undoRecord('/vault', rm2.recordId);
  assert.deepEqual(n.calls.filter((c) => c.method === 'PATCH').pop().body, { archived: false });
  await assert.rejects(W.setStatus('r1', 'maybe'), /not a Wishlist status/);
});

// ---------------------------------------------------------------- the doors

test('the doors: Quick Capture and his voice both reach the same add; nothing without the word wishlist', async () => {
  await fresh();
  assert.deepEqual(wishlistLink(`add this to my wishlist ${JACKET}`), { url: JACKET, said: 'add this to my wishlist' });
  assert.equal(wishlistLink(JACKET), null);
  assert.equal(wishlistLink(`wishlist ${JACKET} ${THING}`), null);
  assert.deepEqual(parseJobCommand(`add this to my wishlist ${JACKET}`), { verb: 'wishlist.add', args: { url: JACKET, said: 'add this to my wishlist' } });
  assert.deepEqual(parseJobCommand(`${JACKET} wish list, high priority`), { verb: 'wishlist.add', args: { url: JACKET, said: 'wish list, high priority' } });
  assert.notEqual(parseJobCommand(JACKET)?.verb, 'wishlist.add');

  // Quick Capture: the row is on the board at once, filed when the add lands
  const rec = await startCapture('/vault', { text: `add to my wishlist ${JACKET}`, source: 'text' });
  assert.equal(rec.kind, 'wishlist');
  assert.equal(rec.status, 'classifying');
  const filed = await waitFor(async () => { const r = await getRecord(rec.id); return r.status === 'filed' ? r : null; });
  assert.equal(filed.decision.payload.draft.name, 'Union Bomber Jacket (navy)');

  // his voice: the verb answers with the add's own record (one receipt, its Undo)
  const said = await tryCommand('/vault', `add this to my wishlist ${THING}`);
  assert.equal(said.matched, 'wishlist.add');
  assert.match(said.text, /^Added Gift Box Thing to your Wishlist, under no category yet, \$20\. Which list does it go under: Furniture, Cologne, Shoes, or another\?$/);
  assert.ok(said.acted.recordId);
  assert.equal(said.acted.undoable, true);
  assert.equal((await getRecord(said.acted.recordId)).kind, 'wishlist');
  assert.equal(said.acted.wishlist.questions[0].field, 'category');
  // a spoken answer through the same registry
  const ans = await tryCommand('/vault', 'x').catch(() => null); // not a command: the model ACTs wishlist.answer instead
  assert.equal(ans, null);
  const { runVerb } = await import('../lib/verbs.js');
  const out = await runVerb('/vault', 'technology', { verb: 'wishlist.answer', args: { value: 'technology' } });
  assert.equal(out.acted.said, 'Under Technology.');
});
