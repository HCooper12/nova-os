// THE LOGOS (server/lib/brandLogos.js): read once from each site's own icon
// link into server/data/logos (never the repo), a refusal recorded as a miss
// the app answers with its drawn mark, and never two requests at once. No
// real network: fetch is a stub, and the "icon" is a few invented bytes.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-logos-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../lib/brandLogos.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(400, 7)]);
function stub(routes) {
  const calls = [];
  let inFlight = 0;
  let max = 0;
  const fetchImpl = async (url) => {
    inFlight += 1; max = Math.max(max, inFlight);
    calls.push(url);
    await new Promise((r) => setTimeout(r, 3));
    inFlight -= 1;
    const r = routes[url] || { status: 404, body: '' };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (h) => (h === 'content-type' ? r.type || 'text/html' : null) },
      text: async () => String(r.body),
      arrayBuffer: async () => (Buffer.isBuffer(r.body) ? r.body : Buffer.from(String(r.body))),
    };
  };
  return { fetchImpl, calls, max: () => max };
}

test('the best icon a page names: apple-touch-icon first, then SVG, then the largest PNG', () => {
  const html = `<head><link rel="icon" href="/favicon.ico"><link rel="icon" type="image/png" sizes="32x32" href="/i32.png">
    <link rel="icon" type="image/svg+xml" href="/logo.svg"><link rel="apple-touch-icon" sizes="180x180" href="/touch-180.png?v=2&amp;x=1"></head>`;
  assert.equal(L.findIconUrl(html, 'https://shop.example.com/'), 'https://shop.example.com/touch-180.png?v=2&x=1');
  assert.equal(L.findIconUrl('<link rel="icon" type="image/svg+xml" href="/logo.svg"><link rel="icon" href="/i.png" sizes="64x64">', 'https://a.example/'), 'https://a.example/logo.svg');
  assert.equal(L.findIconUrl('<p>no head</p>', 'https://a.example/'), null);
});

test('fetched once, cached, served; a blocked site is a miss the app answers with its drawn mark', async () => {
  L._resetForTests();
  const net = stub({
    'https://www.everyday.com.au/': { status: 200, body: '<link rel="apple-touch-icon" href="/er-touch.png">' },
    'https://www.everyday.com.au/er-touch.png': { status: 200, type: 'image/png', body: PNG },
    'https://experience.flybuys.com.au/': { status: 403, body: '<html>Access Denied ... Reference #1.2.3</html>' },
    'https://www.woolworths.com.au/': { status: 200, body: '<p>no icon here</p>' },
    'https://www.coles.com.au/': { status: 200, body: '<link rel="icon" href="/c.png">' },
    'https://www.coles.com.au/c.png': { status: 200, type: 'text/html', body: '<html>not an image</html>' },
    'https://www.aldi.com.au/': { status: 200, body: '<link rel="icon" href="/a.png">' },
    'https://www.aldi.com.au/a.png': { status: 200, type: 'image/png', body: Buffer.alloc(20) },
  });
  const sleeps = [];
  await L.ensureAllLogos({ fetchImpl: net.fetchImpl, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(net.max(), 1, 'never two requests at once');
  assert.equal(sleeps.length, 4, 'a pause between brands');
  const v = await L.logosView();
  assert.equal(v.er.has, true);
  assert.equal(v.er.source, 'https://www.everyday.com.au/er-touch.png', 'where it came from is kept');
  assert.equal(v.fb.has, false);
  assert.match(v.fb.miss, /bot check \(403\)/);
  assert.match(v.w.miss, /names no icon/);
  assert.match(v.c.miss, /not an image/);
  assert.match(v.a.miss, /20 bytes/);
  const f = await L.logoFile('er');
  assert.ok(f.path.includes(path.join('logos', 'er.png')), 'kept in server/data/logos, outside the repo');
  assert.equal(await L.logoFile('fb'), null, 'no file: the app draws the mark');
  // ONCE: a second pass asks no one (the misses wait a week)
  const before = net.calls.length;
  await L.ensureAllLogos({ fetchImpl: net.fetchImpl, sleep: async () => {} });
  assert.equal(net.calls.length, before);
  // a week later, only the misses are asked again
  await L.ensureAllLogos({ fetchImpl: net.fetchImpl, sleep: async () => {}, now: new Date(Date.now() + 8 * 86400000) });
  assert.ok(!net.calls.slice(before).some((u) => u.includes('everyday')), 'a cached logo is never fetched again');
  assert.ok(net.calls.slice(before).some((u) => u.includes('flybuys')));
});
