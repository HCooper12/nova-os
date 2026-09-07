// VISUALS FOR THE BRIEFING — sourced honestly, cached before playback.
//
// Every network call goes through an injected fetch, so these run offline
// and spend nothing. The properties: a picture is only ever a real one with
// its credit; a miss falls back to nothing rather than a decoration; the
// cache serves from disk on the second ask; and a clip is chosen for
// substance (between one and forty minutes) and relevance.
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-bmedia-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../lib/briefingMedia.js');

test.after(() => rm(dataDir, { recursive: true, force: true }));

// a fake PNG big enough to pass the placeholder gate
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(5000, 1)]);
const resp = (body, { ok = true, type = 'application/json', status = 200 } = {}) => ({
  ok, status,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : null) },
  json: async () => body,
  text: async () => String(body),
  arrayBuffer: async () => (Buffer.isBuffer(body) ? body : Buffer.from(String(body))),
  body: null,
});

test('pickWikimedia prefers a real bitmap with its credit, and skips svg and tiny files', () => {
  const pages = [
    { index: 2, title: 'File:Spectrum.svg', imageinfo: [{ mime: 'image/svg+xml', width: 2000, url: 'u1' }] },
    { index: 3, title: 'File:Tiny.png', imageinfo: [{ mime: 'image/png', width: 120, url: 'u2' }] },
    { index: 1, title: 'File:EM spectrum.png', imageinfo: [{ mime: 'image/png', width: 1600, url: 'u3', thumburl: 't3', descriptionurl: 'd3', extmetadata: { Artist: { value: '<a href="x">Someone</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, ImageDescription: { value: 'The <b>electromagnetic</b> spectrum' } } }] },
  ];
  const hit = M.pickWikimedia(pages);
  assert.equal(hit.url, 't3', 'the large thumbnail, not the original');
  assert.equal(hit.title, 'EM spectrum');
  assert.equal(hit.credit, 'Someone · CC BY-SA 4.0', 'html stripped, licence named');
  assert.equal(hit.description, 'The electromagnetic spectrum');
  assert.equal(M.pickWikimedia([]), null);
});

test('parseOgImage reads either attribute order and resolves a relative URL', () => {
  assert.equal(M.parseOgImage('<head><meta property="og:image" content="/img/a.jpg"></head>', 'https://ex.org/p/1'), 'https://ex.org/img/a.jpg');
  assert.equal(M.parseOgImage('<meta content="https://c.dn/b.png" property="og:image:secure_url">', 'https://ex.org'), 'https://c.dn/b.png');
  assert.equal(M.parseOgImage('<html>no tag</html>', 'https://ex.org'), null);
});

test('cacheImage: fetch once, serve from disk after; a placeholder is a miss, and a miss is remembered', async () => {
  let calls = 0;
  M.deps.fetch = async (url) => {
    calls++;
    if (url.endsWith('good.png')) return resp(PNG, { type: 'image/png' });
    if (url.endsWith('tiny.png')) return resp(Buffer.alloc(100), { type: 'image/png' });
    return resp('', { ok: false, status: 404 });
  };
  const a = await M.cacheImage('https://x/good.png');
  assert.equal(a.ext, 'png');
  assert.ok(/^[a-f0-9]{20}$/.test(a.key), 'the key is a hash, never a path');
  const served = await M.readCached(a.key);
  assert.equal(served.type, 'image/png');
  assert.equal(served.buf.length, PNG.length);
  assert.equal(await M.readCached('../../etc/passwd'), null, 'a non-key is refused');

  assert.equal(await M.cacheImage('https://x/tiny.png'), null, 'a 1x1 placeholder is not an image');
  const files = await readdir(path.join(dataDir, 'briefing-media'));
  assert.ok(files.some((f) => f.endsWith('.miss')), 'the miss is cached so it never re-fetches');
  const before = calls;
  await M.cacheImage('https://x/tiny.png');
  assert.equal(calls, before, 'second ask for a known miss touches no network');
});

test('resolveImage: Commons first, then a cited page\'s og:image, then honestly nothing', async () => {
  M.deps.fetch = async (url) => {
    if (url.includes('commons.wikimedia.org')) return resp({ query: { pages: {} } });
    if (url === 'https://paper.org/light') return resp('<head><meta property="og:image" content="https://paper.org/fig1.jpg"></head>', { type: 'text/html' });
    if (url === 'https://paper.org/fig1.jpg') return resp(PNG, { type: 'image/jpeg' });
    return resp('', { ok: false, status: 404 });
  };
  const v = await M.resolveImage({ query: 'melanopsin light pathway', caption: 'The pathway' }, {
    sources: [{ title: 'Unrelated thing', url: 'https://other.org/x' }, { title: 'Melanopsin and light', url: 'https://paper.org/light' }],
  });
  assert.equal(v.kind, 'image');
  assert.equal(v.credit, 'paper.org', 'credited to the page it came from');
  assert.equal(v.caption, 'The pathway');

  M.deps.fetch = async () => resp('', { ok: false, status: 500 });
  assert.equal(await M.resolveImage({ query: 'anything' }, { sources: [] }), null, 'no honest image → nothing, never a decoration');
});

test('pickClip wants substance and relevance: no Shorts, no lectures, most query words in the title', () => {
  const rows = M.parseYtRows([
    'a1|Chan|40|Light spectrum in 40 seconds',
    'b2|Chan|540|The electromagnetic spectrum explained',
    'c3|Chan|3600|Two hour physics lecture on spectrum and light',
    'd4|Chan|300|Cooking pasta',
  ].join('\n'));
  const hit = M.pickClip(rows, 'electromagnetic spectrum explained');
  assert.equal(hit.id, 'b2');
  assert.equal(M.pickClip([rows[0], rows[2]], 'spectrum'), null, 'a Short and a lecture are both refused');
});

test('enrichVisuals resolves hints in place, drops the hint either way, and never throws', async () => {
  const briefing = {
    sources: [],
    sections: [{ beats: [
      { say: 'plain', },
      { say: 'with image', hint: { kind: 'image', query: 'x' } },
      { say: 'with clip', hint: { kind: 'clip', query: 'y' } },
      { say: 'broken', hint: { kind: 'image', query: 'boom' } },
    ] }],
  };
  await M.enrichVisuals(briefing, {
    resolvers: {
      image: async (h) => (h.query === 'boom' ? Promise.reject(new Error('net')) : { kind: 'image', key: 'k'.repeat(20), ext: 'jpg' }),
      clip: async () => ({ kind: 'clip', videoId: 'v1' }),
    },
  });
  const [a, b, c, d] = briefing.sections[0].beats;
  assert.equal(a.visual, undefined);
  assert.equal(b.visual.kind, 'image');
  assert.equal(c.visual.kind, 'clip');
  assert.equal(d.visual, undefined, 'a failed resolve leaves the typographic glass');
  assert.ok([a, b, c, d].every((x) => !('hint' in x)), 'no hint survives into the stored briefing');
});
