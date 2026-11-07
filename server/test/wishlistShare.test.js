import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const data = mkdtempSync(path.join(os.tmpdir(), 'nova-share-'));
process.env.NOVA_DATA_DIR = data;
mkdirSync(path.join(data, 'wishlist'), { recursive: true });
mkdirSync(path.join(data, 'stash', 'media'), { recursive: true });
writeFileSync(path.join(data, 'stash', 'media', 'a.jpg'), 'x');
const item = (o) => ({ id: 'notion-page-id-' + o.name, name: o.name, stars: 0, link: 'https://shop.example/' + o.name, store: 'shop.example', price: null, priority: 'High', status: 'Considering Purchase', categories: ['Shoes'], notes: null, addedOn: '2026-11-01T00:00:00Z', image: null, imageSource: 'https://secret.notion/x', imageKey: 'k', ...o });
writeFileSync(path.join(data, 'wishlist', 'items.json'), JSON.stringify({ items: [item({ name: 'Boots', image: 'a.jpg', stars: 2 }), item({ name: 'Bought', status: 'Purchased' }), item({ name: 'Dropped', status: 'Cancelled' }), item({ name: 'Soon', status: 'Purchasing This Month' })], lastSync: 'x', error: null, images: {} }));
writeFileSync(path.join(data, 'wishlist', 'state.json'), JSON.stringify({ categories: [], sizes: { Shoes: ['10'] } }));

const S = await import('../lib/wishlistShare.js');
S.deps.resize = async (_s, dest) => writeFileSync(dest, 'jpg');

test('only wanted items leave, and nothing private comes with them', async () => {
  const out = path.join(data, 'out');
  const r = await S.buildShare({ outDir: out });
  assert.equal(r.count, 2);
  const raw = readFileSync(path.join(out, 'data.json'), 'utf8');
  const j = JSON.parse(raw);
  assert.deepEqual(j.items.map((i) => i.name).sort(), ['Boots', 'Soon']);
  for (const bad of ['notion-page-id', 'priority', 'High', 'secret.notion', 'status', 'Purchased', 'imageKey']) assert.ok(!raw.includes(bad), bad);
  assert.equal(j.sizes, null, 'sizes stay home unless he turns them on');
  assert.match(j.items.find((i) => i.name === 'Boots').image, /^img\/[0-9a-f]{16}\.jpg$/);
  assert.ok(existsSync(path.join(out, 'index.html')));
});

test('sizes only when asked', async () => {
  const out = path.join(data, 'out2');
  await S.buildShare({ outDir: out, includeSizes: true });
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, 'data.json'), 'utf8')).sizes, { Shoes: ['10'] });
});

test('an unchanged list is not a new version, and a gone photo is removed', async () => {
  const out = path.join(data, 'out3');
  await S.buildShare({ outDir: out });
  const a = readFileSync(path.join(out, 'data.json'), 'utf8');
  assert.equal((await S.buildShare({ outDir: out })).changed, false);
  assert.equal(readFileSync(path.join(out, 'data.json'), 'utf8'), a);
  writeFileSync(path.join(out, 'img', 'stale.jpg'), 'x');
  await S.buildShare({ outDir: out });
  assert.ok(!readdirSync(path.join(out, 'img')).includes('stale.jpg'));
});

test('publishing is off without a repo, and pushes only a changed list', async () => {
  assert.equal((await S.publishShare()).published, false);
  const repo = path.join(data, 'repo'); mkdirSync(repo);
  writeFileSync(path.join(data, 'wishlist', 'share.json'), JSON.stringify({ repoDir: repo }));
  const calls = [];
  S.deps.git = async (_cwd, args) => { calls.push(args[0]); return ''; };
  assert.equal((await S.publishShare()).published, true);
  assert.deepEqual(calls, ['add', 'commit', 'push']);
  calls.length = 0;
  assert.equal((await S.publishShare()).published, false);
  assert.deepEqual(calls, []);
});
