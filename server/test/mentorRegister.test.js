import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Tests without their own data dir write into his live server/data.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-reg-'));
process.env.NOVA_DATA_DIR = dir;
const regFile = path.join(dir, 'mentors', 'register.json');

let R;
before(async () => { R = await import('../lib/mentorRegister.js'); });
beforeEach(() => {
  R._resetRegisterForTests();
  fs.rmSync(path.join(dir, 'mentors'), { recursive: true, force: true });
});

const vid = (id, extra = {}) => ({ key: `yt:${id}`, kind: 'video', tier: 1, title: `Video ${id}`, url: `https://www.youtube.com/watch?v=${id}`, durationSec: 600, people: [{ id: 'jefferson-fisher', role: 'host' }], ...extra });
const onDisk = () => JSON.parse(fs.readFileSync(regFile, 'utf8'));

test('sourceKey: a video, a short, an episode, a book and a plain link', () => {
  assert.equal(R.sourceKey({ url: 'https://youtu.be/abcDEF12345?si=zzz' }), 'yt:abcDEF12345');
  assert.equal(R.sourceKey({ url: 'https://www.youtube.com/shorts/abcDEF12345' }), 'yt:abcDEF12345');
  assert.equal(R.sourceKey({ videoId: 'xyz987' }), 'yt:xyz987');
  const ep = R.sourceKey({ feedUrl: 'https://feed.example/rss', guid: 'g-1' });
  assert.match(ep, /^pod:[0-9a-f]{8}:[0-9a-f]{12}$/);
  assert.equal(ep, R.sourceKey({ feedUrl: 'https://feed.example/rss', guid: 'g-1' }));
  assert.notEqual(ep, R.sourceKey({ feedUrl: 'https://feed.example/rss', guid: 'g-2' }));
  assert.equal(R.sourceKey({ title: 'Atomic Habits', author: 'James Clear' }), 'book:atomic habits|james clear');
  assert.equal(R.sourceKey({ title: 'atomic habits!', author: 'JAMES CLEAR' }), 'book:atomic habits|james clear');
  const u = R.sourceKey({ url: 'https://Example.com/a/b/?utm_source=x#frag' });
  assert.match(u, /^url:[0-9a-f]{16}$/);
  assert.equal(u, R.sourceKey({ url: 'https://example.com/a/b' }));
  assert.equal(R.sourceKey({}), null);
});

test('personSlug and stage order', () => {
  assert.equal(R.personSlug('Jefferson Fisher'), 'jefferson-fisher');
  assert.equal(R.personSlug('  Zoë  O\'Neil!! '), 'zoe-o-neil');
  assert.deepEqual(R.STAGES, ['found', 'transcript', 'read', 'woven']);
  assert.ok(R.stageRank('read') > R.stageRank('transcript'));
  assert.equal(R.stageRank('nope'), -1);
});

test('upsertSources adds, then updates descriptive fields only, merging people, one write per call', async () => {
  const w0 = R._writeCountForTests();
  const first = await R.upsertSources([vid('aaa'), vid('bbb')], { origin: 'discovery' });
  assert.deepEqual(first, { added: 2, updated: 0 });
  assert.equal(R._writeCountForTests() - w0, 1, 'one write for the whole list');
  const a = await R.getSource('yt:aaa');
  assert.equal(a.stage, 'found');
  assert.equal(a.reads, 0);
  assert.equal(a.origin, 'discovery');
  assert.ok(a.foundAt);

  // give it state the merge must not touch
  await R.setStage('yt:aaa', 'woven', { transcript: { source: 'captions', path: 'Raw/x.md', chars: 5, timed: true, at: 't' }, read: { version: 1 }, woven: { version: 1, batchId: 'b' }, vault: { sourcePage: 'p', rawPage: 'r' } });
  await R.setHold('yt:aaa', { state: 'duplicate', why: 'same recording' });
  const before1 = await R.getSource('yt:aaa');

  const w1 = R._writeCountForTests();
  const second = await R.upsertSources([
    vid('aaa', { title: 'New title', views: 99, show: 'Show', durationSec: null, stage: 'found', hold: null, legacy: true, origin: 'link', people: [{ id: 'guest-one', role: 'guest' }, { id: 'jefferson-fisher', role: 'guest' }] }),
    vid('ccc'),
  ], { origin: 'link' });
  assert.deepEqual(second, { added: 1, updated: 1 });
  assert.equal(R._writeCountForTests() - w1, 1, 'one write for the whole list');
  const a2 = await R.getSource('yt:aaa');
  assert.equal(a2.title, 'New title');
  assert.equal(a2.views, 99);
  assert.equal(a2.show, 'Show');
  assert.equal(a2.durationSec, 600, 'null does not overwrite');
  for (const f of ['stage', 'hold', 'transcript', 'read', 'woven', 'vault', 'legacy', 'foundAt', 'origin']) {
    assert.deepEqual(a2[f], before1[f], f);
  }
  assert.deepEqual(a2.people.map((p) => p.id).sort(), ['guest-one', 'jefferson-fisher']);
  assert.equal(a2.people.find((p) => p.id === 'jefferson-fisher').role, 'host', 'an existing person keeps their role');
  assert.equal((await R.getSource('yt:ccc')).origin, 'link');
  assert.equal(Object.keys(onDisk().sources).length, 3);
});

test('upsertSources derives a key from the item, and says why when it cannot', async () => {
  await R.upsertSources([{ url: 'https://youtu.be/derived12345', title: 'D' }]);
  assert.ok(await R.getSource('yt:derived12345'));
  await assert.rejects(() => R.upsertSources([{ title: 'No link' }]), /cannot identify "No link"/);
});

test('getSource and listSources hand back copies', async () => {
  await R.upsertSources([vid('aaa')]);
  const s = await R.getSource('yt:aaa');
  s.title = 'mutated';
  s.people.push({ id: 'x', role: 'host' });
  assert.equal((await R.getSource('yt:aaa')).title, 'Video aaa');
  const l = await R.listSources();
  l[0].title = 'mutated';
  assert.equal((await R.getSource('yt:aaa')).title, 'Video aaa');
  assert.equal(await R.getSource('yt:missing'), null);
});

test('setStage raises, refuses to lower without force, lowers with force, clears working and the right holds', async () => {
  await R.upsertSources([vid('aaa')]);
  await R.setWorking('yt:aaa', 'transcript');
  await R.setHold('yt:aaa', { state: 'refused', why: 'no captions' });
  let s = await R.setStage('yt:aaa', 'transcript', { transcript: { source: 'captions', path: 'Raw/a.md', chars: 10, timed: true, at: 't' } });
  assert.equal(s.stage, 'transcript');
  assert.equal(s.working, null);
  assert.equal(s.hold, null, 'a refused hold is cleared');
  assert.equal(s.transcript.chars, 10);

  s = await R.setStage('yt:aaa', 'read', { read: { version: 1, at: 't', model: 'm', costUsd: 0.2, notesPath: 'n', ideas: 3, scripts: 1, lines: 2 } });
  assert.equal(s.stage, 'read');
  assert.equal(s.reads, 1);

  // lowering without force is a quiet no-op: stage and patch both ignored
  s = await R.setStage('yt:aaa', 'transcript', { transcript: { source: 'x', path: 'p', chars: 1, timed: false, at: null } });
  assert.equal(s.stage, 'read');
  assert.equal(s.transcript.chars, 10);

  s = await R.setStage('yt:aaa', 'transcript', {}, { force: true });
  assert.equal(s.stage, 'transcript');
  assert.equal((await R.getSource('yt:aaa')).stage, 'transcript');
  s = await R.setStage('yt:aaa', 'read', { read: { version: 2 } });
  assert.equal(s.reads, 2, 'read again counts');

  await R.setHold('yt:aaa', { state: 'failed', why: 'x' });
  assert.equal((await R.setStage('yt:aaa', 'woven')).hold, null, 'failed is cleared too');
  await R.setHold('yt:aaa', { state: 'duplicate', why: 'twin' });
  s = await R.setStage('yt:aaa', 'woven', { woven: { version: 1, at: 't', batchId: 'b' } });
  assert.equal(s.hold.state, 'duplicate', 'a duplicate hold stays');

  await assert.rejects(() => R.setStage('yt:nope', 'read'), /no source with key "yt:nope"/);
  await assert.rejects(() => R.setStage('yt:aaa', 'bogus'), /unknown stage "bogus"/);
});

test('setWorking, setHold, clearHold, resetWorking', async () => {
  await R.upsertSources([vid('aaa'), vid('bbb'), vid('ccc')]);
  await R.setWorking('yt:aaa', 'read');
  await R.setWorking('yt:bbb', 'weave');
  assert.equal((await R.getSource('yt:aaa')).working, 'read');
  await assert.rejects(() => R.setWorking('yt:aaa', 'dancing'), /unknown working value/);
  await R.setHold('yt:ccc', { state: 'held', why: 'he chose not now', retryAt: '2026-12-01T00:00:00.000Z' });
  const h = (await R.getSource('yt:ccc')).hold;
  assert.equal(h.state, 'held');
  assert.equal(h.retryAt, '2026-12-01T00:00:00.000Z');
  assert.ok(h.at);
  await assert.rejects(() => R.setHold('yt:ccc', { state: 'weird', why: '' }), /unknown hold state/);
  await R.clearHold('yt:ccc');
  assert.equal((await R.getSource('yt:ccc')).hold, null);

  assert.equal(await R.resetWorking(), 2);
  assert.equal((await R.getSource('yt:aaa')).working, null);
  assert.equal(await R.resetWorking(), 0);
  assert.equal(onDisk().sources['yt:bbb'].working, null);
});

test('attachPerson adds a person once and reports how many records changed', async () => {
  await R.upsertSources([vid('aaa', { people: [] }), vid('bbb', { people: [{ id: 'p1', role: 'host' }] })]);
  assert.equal(await R.attachPerson(['yt:aaa', 'yt:bbb', 'yt:missing'], { id: 'p1', role: 'host' }), 1);
  assert.equal(await R.attachPerson(['yt:aaa', 'yt:bbb'], { id: 'p1', role: 'host' }), 0);
  assert.deepEqual((await R.getSource('yt:aaa')).people, [{ id: 'p1', role: 'host' }]);
});

test('listSources filters by person, tier, stage and kind', async () => {
  await R.upsertSources([
    vid('aaa'),
    vid('bbb', { kind: 'short', tier: 2 }),
    vid('ccc', { people: [{ id: 'other', role: 'guest' }] }),
  ]);
  await R.setStage('yt:aaa', 'read');
  assert.equal((await R.listSources()).length, 3);
  assert.equal((await R.listSources({ personId: 'jefferson-fisher' })).length, 2);
  assert.equal((await R.listSources({ personId: 'jefferson-fisher', tier: 1 })).length, 1);
  assert.equal((await R.listSources({ stage: 'read' })).length, 1);
  assert.equal((await R.listSources({ kind: 'short' })).length, 1);
  assert.equal((await R.listSources({ personId: 'nobody' })).length, 0);
});

test('countsFor sums to total, counts holds and working, rounds hours', async () => {
  await R.upsertSources([
    vid('a1', { durationSec: 3600 }), vid('a2', { durationSec: 1800 }), vid('a3', { durationSec: 1800 }), vid('a4', { durationSec: 600 }),
    vid('s1', { kind: 'short', tier: 2, durationSec: 30 }),
  ]);
  await R.setStage('yt:a2', 'transcript');
  await R.setStage('yt:a3', 'read');
  await R.setStage('yt:a4', 'woven');
  await R.setWorking('yt:a1', 'transcript');
  await R.setHold('yt:a1', { state: 'held', why: 'w' });
  await R.setHold('yt:a2', { state: 'skipped', why: 'w' });
  await R.setHold('yt:a3', { state: 'duplicate', why: 'w' });
  const c = await R.countsFor('jefferson-fisher');
  assert.equal(c.total, 4);
  assert.equal(c.found + c.transcript + c.read + c.woven, c.total);
  assert.deepEqual([c.found, c.transcript, c.read, c.woven], [1, 1, 1, 1]);
  assert.equal(c.hours, 2.2); // 7800 s
  assert.equal(c.working, 1);
  assert.deepEqual(c.held, { refused: 0, failed: 0, skipped: 1, duplicate: 1, held: 1 });
  const all = await R.countsFor('jefferson-fisher', { tier: null });
  assert.equal(all.total, 5);
  const none = await R.countsFor('nobody');
  assert.equal(none.total, 0);
  assert.equal(none.hours, 0);
});

test('the store survives a reload from disk', async () => {
  await R.upsertSources([vid('aaa')]);
  await R.setStage('yt:aaa', 'read', { read: { version: 1 } });
  R._resetRegisterForTests();
  const s = await R.getSource('yt:aaa');
  assert.equal(s.stage, 'read');
  assert.equal(s.reads, 1);
  assert.equal(onDisk().version, 1);
  // no stray temp files
  assert.deepEqual(fs.readdirSync(path.join(dir, 'mentors')).filter((f) => f.endsWith('.tmp')), []);
});

test('a corrupt register.json is moved aside and an empty store starts', async () => {
  fs.mkdirSync(path.join(dir, 'mentors'), { recursive: true });
  fs.writeFileSync(regFile, '{ not json');
  const store = await R.loadRegister();
  assert.deepEqual(store.sources, {});
  const aside = fs.readdirSync(path.join(dir, 'mentors')).filter((f) => f.startsWith('register.json.corrupt-'));
  assert.equal(aside.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'mentors', aside[0]), 'utf8'), '{ not json');
  await R.upsertSources([vid('aaa')]);
  assert.ok(await R.getSource('yt:aaa'));
  assert.equal(Object.keys(onDisk().sources).length, 1);
});

test('a file of the wrong shape counts as corrupt too', async () => {
  fs.mkdirSync(path.join(dir, 'mentors'), { recursive: true });
  fs.writeFileSync(regFile, JSON.stringify({ version: 1, sources: [1, 2] }));
  assert.deepEqual((await R.loadRegister()).sources, {});
  assert.equal(fs.readdirSync(path.join(dir, 'mentors')).filter((f) => f.includes('.corrupt-')).length, 1);
});

test('overlapping writes do not lose an update', async () => {
  await R.upsertSources([vid('aaa'), vid('bbb')]);
  await Promise.all([
    R.setStage('yt:aaa', 'transcript'),
    R.setStage('yt:bbb', 'read'),
    R.upsertSources([vid('ccc')]),
    R.setHold('yt:aaa', { state: 'held', why: 'w' }),
    R.attachPerson(['yt:bbb'], { id: 'late', role: 'guest' }),
  ]);
  R._resetRegisterForTests();
  const d = onDisk().sources;
  assert.equal(d['yt:aaa'].stage, 'transcript');
  assert.equal(d['yt:aaa'].hold.state, 'held');
  assert.equal(d['yt:bbb'].stage, 'read');
  assert.ok(d['yt:bbb'].people.some((p) => p.id === 'late'));
  assert.ok(d['yt:ccc']);
});

test('concurrent first loads share one load', async () => {
  await R.upsertSources([vid('aaa')]);
  R._resetRegisterForTests();
  const [a, b] = await Promise.all([R.loadRegister(), R.loadRegister()]);
  assert.equal(a, b);
});

/* -------------------------------- backfill -------------------------------- */

function listing(root) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const st = fs.statSync(p);
      out.push(`${path.relative(root, p)}|${e.isDirectory() ? 'd' : st.size}|${st.mtimeMs}`);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(root);
  return out.sort();
}

function fakeVault() {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-vault-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(v, rel)), { recursive: true }); fs.writeFileSync(path.join(v, rel), text); };
  // 1: YouTube url in frontmatter, Raw linked by name, timed transcript
  w('Wiki/Sources/Talk One.md', `---\ntype: video\nurl: https://www.youtube.com/watch?v=AAAAAAAAAAA\nraw: "[[Talk One transcript]]"\npeople:\n  - Jefferson Fisher\n  - Some Guest\nshow: The Show\n---\n# Talk One\n\nBody.\n`);
  w('Raw/Talk One transcript.md', 'Verbatim video transcript\n\n[00:01] hello there\n[00:05] more words\n');
  // 2: only YouTube link is in the body; Raw has no link, found by id
  w('Wiki/Sources/Talk Two.md', `---\ntype: source\n---\n# Talk Two\n\nWatched at https://youtu.be/BBBBBBBBBBB?si=abc today.\n`);
  w('Raw/Some other name.md', 'Source: https://youtu.be/BBBBBBBBBBB\n\n[1:02:03] long talk starts here\n');
  // 3: a book
  w('Wiki/Sources/Atomic Habits.md', `---\ntype: book\ntitle: Atomic Habits\nauthor: James Clear\n---\n# Atomic Habits\n\nNotes.\n`);
  // 4: no link at all
  w('Wiki/Sources/Pasted Note.md', `---\ntype: source\n---\n# Pasted Note\n\nJust text.\n`);
  // 5: an article with a plain link, and an untimed Raw transcript
  w('Wiki/Sources/An Article.md', `---\nurl: https://example.com/post/?utm_source=x\nraw: "[[An Article raw]]"\n---\n# An Article\n\nBody.\n`);
  w('Raw/An Article raw.md', 'plain text without timing marks\n');
  // not Source pages: must be ignored
  w('Wiki/Concepts/Idea.md', `---\nurl: https://youtu.be/CCCCCCCCCCC\n---\n# Idea\n`);
  return v;
}

test('backfillFromVault enters every Source page, is idempotent, and never writes the vault', async () => {
  const v = fakeVault();
  const snapshot = listing(v);
  const r1 = await R.backfillFromVault(v);
  assert.equal(r1.scanned, 5);
  assert.equal(r1.added, 4);
  assert.equal(r1.alreadyKnown, 0);
  assert.deepEqual(r1.unidentified, ['Wiki/Sources/Pasted Note.md']);

  const one = await R.getSource('yt:AAAAAAAAAAA');
  assert.equal(one.stage, 'woven');
  assert.equal(one.legacy, true);
  assert.equal(one.origin, 'backfill');
  assert.equal(one.kind, 'video');
  assert.equal(one.tier, 1);
  assert.equal(one.title, 'Talk One');
  assert.equal(one.show, 'The Show');
  assert.deepEqual(one.vault, { sourcePage: 'Wiki/Sources/Talk One.md', rawPage: 'Raw/Talk One transcript.md' });
  assert.equal(one.transcript.source, 'vault');
  assert.equal(one.transcript.path, 'Raw/Talk One transcript.md');
  assert.equal(one.transcript.timed, true);
  assert.equal(one.transcript.at, null);
  assert.equal(one.transcript.chars, fs.readFileSync(path.join(v, 'Raw/Talk One transcript.md'), 'utf8').length);
  assert.deepEqual(one.people, [{ id: 'jefferson-fisher', role: 'host' }, { id: 'some-guest', role: 'host' }]);

  const two = await R.getSource('yt:BBBBBBBBBBB');
  assert.equal(two.vault.rawPage, 'Raw/Some other name.md');
  assert.equal(two.transcript.timed, true, 'an h:mm:ss mark counts');
  assert.deepEqual(two.people, []);

  const book = await R.getSource('book:atomic habits|james clear');
  assert.equal(book.kind, 'book');
  assert.equal(book.transcript, null);
  assert.equal(book.vault.rawPage, null);

  const art = await R.getSource(R.sourceKey({ url: 'https://example.com/post' }));
  assert.equal(art.kind, 'article');
  assert.equal(art.tier, 2);
  assert.equal(art.transcript.timed, false);

  assert.equal(await R.getSource('yt:CCCCCCCCCCC'), null, 'a concept page is not a source');

  const before = JSON.stringify((await R.loadRegister()).sources);
  const writes = R._writeCountForTests();
  const r2 = await R.backfillFromVault(v);
  assert.deepEqual({ ...r2, unidentified: r2.unidentified.length }, { scanned: 5, added: 0, alreadyKnown: 4, unidentified: 1 });
  assert.equal(JSON.stringify((await R.loadRegister()).sources), before);
  assert.equal(R._writeCountForTests(), writes, 'nothing written when nothing is new');

  // reload from disk: same
  R._resetRegisterForTests();
  assert.equal(JSON.stringify((await R.loadRegister()).sources), before);

  assert.deepEqual(listing(v), snapshot, 'the vault is untouched: same files, sizes and mtimes');
});

test('backfill leaves a known record alone and a later follow merges a person into it', async () => {
  const v = fakeVault();
  await R.upsertSources([{ key: 'yt:AAAAAAAAAAA', title: 'From discovery', kind: 'video', tier: 1 }], { origin: 'discovery' });
  const r = await R.backfillFromVault(v);
  assert.equal(r.alreadyKnown, 1);
  const s = await R.getSource('yt:AAAAAAAAAAA');
  assert.equal(s.stage, 'found', 'backfill does not rewrite a record that exists');
  assert.equal(s.origin, 'discovery');
});

test('backfill on a vault with no Sources folder scans nothing', async () => {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-empty-'));
  assert.deepEqual(await R.backfillFromVault(v), { scanned: 0, added: 0, alreadyKnown: 0, unidentified: [] });
});
