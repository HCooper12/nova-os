// HIS JOURNAL AND NOTION (11 Oct 2026, mockup 95). These pin his calls:
// Mine is his entries and the log is everyone else's (a view, no files
// move); only his entries go to Notion, by Nova id, titled with his first
// line; a page written in Notion comes home as his; an edit there flows
// back; a delete there deletes the vault entry on the Inbox rails and Undo
// puts the day back byte for byte without re-creating the Notion page; and
// the three prompts are written only at the tap. Fetch is a fake Notion:
// no real call is ever made.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-njournal-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-njournal-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';
delete process.env.NOTION_TOKEN;

import test from 'node:test';
import assert from 'node:assert/strict';

const J = await import('../lib/journal.js');
const N = await import('../lib/notionJournal.js');
const P = await import('../lib/journalPrompt.js');
const { listRecords } = await import('../lib/inboxStore.js');
const { undoRecord } = await import('../lib/inbox.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const DAY = '2026-10-11';
const dayFile = path.join(vault, 'Wiki/Journal', `${DAY}.md`);
const SEED = `---
type: journal
tags: []
created: '${DAY}'
updated: '${DAY}'
---
# ${DAY}

## 06:30 · system · by Nova — Morning dispatch

Demo. Two meetings before noon.

## 07:40 · personal · by Hayden · deep — Deep question

> Which belief about yourself have you stopped checking?

Demo words. Patient with strangers; short with the ones closest.

## 12:15 · personal · by Hayden

Demo words. A walk at lunch fixed more than the coffee did.

## 18:40 · training · by Coach — Session receipt

Demo. Upper body done.
`;

// ---------------------------------------------------------------- fake Notion
function fakeNotion() {
  const pages = new Map(); // id -> page
  const blocks = new Map(); // pageId -> [{id, paragraph}]
  const calls = [];
  let n = 0;
  let clock = Date.parse('2026-10-11T10:00:00Z');
  const tick = () => new Date((clock += 60_000)).toISOString();
  const json = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    const p = u.pathname.replace('/v1', '');
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method || 'GET', path: p, body });
    assert.match(opts.headers.Authorization, /^Bearer /);
    let m;
    if (opts.method === 'POST' && /^\/databases\/[^/]+\/query$/.test(p)) {
      return json(200, { results: [...pages.values()].filter((x) => !x.archived), has_more: false });
    }
    if (opts.method === 'POST' && p === '/pages') {
      const id = `page-${++n}`;
      const page = { id, created_time: tick(), last_edited_time: tick(), archived: false, properties: body.properties };
      pages.set(id, page);
      blocks.set(id, (body.children || []).map((c, i) => ({ id: `${id}-b${i}`, type: 'paragraph', paragraph: { rich_text: c.paragraph.rich_text.map((t) => ({ plain_text: t.text.content })) } })));
      return json(200, page);
    }
    if ((m = p.match(/^\/pages\/([^/]+)$/))) {
      const page = pages.get(m[1]);
      if (!page) return json(404, { message: 'not found' });
      if (opts.method === 'PATCH') {
        if (body.archived != null) page.archived = body.archived;
        if (body.properties) Object.assign(page.properties, body.properties);
        page.last_edited_time = tick();
      }
      return json(200, page);
    }
    if ((m = p.match(/^\/blocks\/([^/]+)\/children$/))) {
      if (opts.method === 'PATCH') {
        const list = blocks.get(m[1]) || [];
        for (const c of body.children) list.push({ id: `${m[1]}-b${list.length}x${++n}`, type: 'paragraph', paragraph: { rich_text: c.paragraph.rich_text.map((t) => ({ plain_text: t.text.content })) } });
        blocks.set(m[1], list);
        return json(200, {});
      }
      return json(200, { results: blocks.get(m[1]) || [], has_more: false });
    }
    if ((m = p.match(/^\/blocks\/([^/]+)$/)) && opts.method === 'DELETE') {
      for (const [pid, list] of blocks) blocks.set(pid, list.filter((b) => b.id !== m[1]));
      return json(200, {});
    }
    return json(400, { message: `unhandled ${opts.method} ${p}` });
  };
  // what he does in Notion
  const his = {
    write(title, words, props = {}) {
      const id = `page-${++n}`;
      pages.set(id, { id, created_time: '2026-10-11T09:55:00.000Z', last_edited_time: tick(), archived: false, properties: {
        Entry: { title: [{ plain_text: title }] }, Tag: { select: props.tag ? { name: props.tag } : null },
        'Nova id': { rich_text: [] }, Date: { date: { start: DAY } }, Prompt: { rich_text: [] }, 'Prompt from': { select: null },
      } });
      blocks.set(id, words ? [{ id: `${id}-b0`, type: 'paragraph', paragraph: { rich_text: [{ plain_text: words }] } }] : []);
      return id;
    },
    edit(id, words, tag) {
      blocks.set(id, [{ id: `${id}-e${++n}`, type: 'paragraph', paragraph: { rich_text: [{ plain_text: words }] } }]);
      if (tag) pages.get(id).properties.Tag = { select: { name: tag } };
      pages.get(id).last_edited_time = tick();
    },
    trash(id) { pages.get(id).archived = true; },
  };
  return { fetchImpl, pages, blocks, calls, his };
}

const deps = (fk) => ({ fetchImpl: fk.fetchImpl, getToken: async () => 'secret-test-token', sleep: async () => {}, minGapMs: 0 });
const byNovaId = (fk, id) => [...fk.pages.values()].find((p) => (p.properties['Nova id']?.rich_text || []).map((t) => t.plain_text ?? t.text?.content).join('') === id);
const titleOf = (pg) => (pg.properties.Entry.title || []).map((t) => t.plain_text ?? t.text?.content).join('');

async function seed() {
  await mkdir(path.dirname(dayFile), { recursive: true });
  await writeFile(dayFile, SEED, 'utf8');
  await rm(path.join(dataDir, 'notion-journal.json'), { force: true });
}

test('the author split: Mine is his entries, the log is everyone else, and no file moves', async () => {
  await seed();
  const [day] = await J.listEntries(vault);
  const mine = day.sections.filter(J.isHisOwnEntry);
  const log = day.sections.filter((s) => !J.isHisOwnEntry(s));
  assert.deepEqual(mine.map((s) => s.time), ['07:40', '12:15']);
  assert.deepEqual(log.map((s) => s.author), ['nova', 'coach']);
  assert.equal(await readFile(dayFile, 'utf8'), SEED, 'reading is a view: the file is untouched');
});

test('tags: Own, Life and Deep ride in the heading beside the author, and an unmarked entry of his is Own', async () => {
  await seed();
  const [day] = await J.listEntries(vault);
  const deep = day.sections.find((s) => s.time === '07:40');
  assert.equal(deep.tag, 'deep');
  assert.equal(deep.promptFrom, 'deep');
  assert.equal(deep.prompt, 'Which belief about yourself have you stopped checking?');
  assert.equal(deep.words, 'Demo words. Patient with strangers; short with the ones closest.');
  assert.equal(day.sections.find((s) => s.time === '12:15').tag, 'own');
  assert.equal(day.sections[0].tag, undefined, "Nova's log carries no tag of his");
  // the identity round-trip: a heading formatted by the writer parses back to itself
  for (const line of ['## 21:10 · personal · by Hayden · deep — Deep question', '## 20:55 · personal · by Hayden · own · notion', '## 21:00 · personal · by Hayden · life — Daily review']) {
    assert.equal(J.journalHeadingLine(J.parseJournalHeading(line)), line);
  }
  // a life prompt answered in Nova is tagged Life, a deep one Deep
  const a = await J.addEntry(vault, { text: 'Demo words. The good question at four.', author: 'hayden', promptFrom: 'life', prompt: 'Who do you want to be in the third meeting?' });
  assert.equal(a.tag, 'life');
  const raw = await readFile(dayFileFor(a.date), 'utf8');
  assert.match(raw, new RegExp(`## ${a.time} · personal · by Hayden · life — My life\\n\\n> Who do you want to be in the third meeting\\?\\n\\nDemo words\\. The good question at four\\.`));
  // a retag changes only that heading, every other byte stays
  const before = await readFile(dayFile, 'utf8');
  await J.updateEntry(vault, `${DAY}T12:15`, { tag: 'deep' });
  const after = await readFile(dayFile, 'utf8');
  assert.equal(after, before.replace('## 12:15 · personal · by Hayden\n', '## 12:15 · personal · by Hayden · deep\n'));
  await assert.rejects(J.updateEntry(vault, `${DAY}T06:30`, { tag: 'deep' }), /only your own/);
});
const dayFileFor = (d) => path.join(vault, 'Wiki/Journal', `${d}.md`);

test("push: his entries go to Notion with the eight fields, titled with his first line, and Nova's log never does", async () => {
  await seed();
  const fk = fakeNotion();
  const r = await N.syncOnce(vault, deps(fk));
  assert.equal(r.state, 'synced');
  assert.equal(r.pushed, 2);
  assert.equal(fk.pages.size, 2, 'only his two entries');
  const deep = byNovaId(fk, `${DAY}T07:40`);
  assert.ok(deep);
  assert.equal(titleOf(deep), 'Demo words. Patient with strangers; short with the ones closest.', 'the title is his first line, not the prompt');
  assert.equal(deep.properties.Tag.select.name, 'Deep');
  assert.equal(deep.properties['Prompt from'].select.name, 'Deep question');
  assert.equal(deep.properties['Written in'].select.name, 'Nova');
  assert.equal(deep.properties.Date.date.start, DAY);
  assert.equal(deep.properties.Prompt.rich_text[0].text.content, 'Which belief about yourself have you stopped checking?');
  assert.equal(byNovaId(fk, `${DAY}T12:15`).properties['Prompt from'].select.name, 'None');
  for (const pg of fk.pages.values()) assert.doesNotMatch(JSON.stringify(pg), /Morning dispatch|Upper body|Two meetings/);
  // idempotent by Nova id: a second pass sends no page
  const posts = fk.calls.filter((c) => c.method === 'POST' && c.path === '/pages').length;
  const r2 = await N.syncOnce(vault, deps(fk));
  assert.equal(r2.pushed, 0);
  assert.equal(fk.calls.filter((c) => c.method === 'POST' && c.path === '/pages').length, posts);
  assert.equal(r2.skippedLog, 2, "Nova's log was seen and skipped");
  const st = await N.syncStatus(vault, { getToken: async () => 'x' });
  assert.equal(st.state, 'synced');
  assert.equal(st.entries[`${DAY}T07:40`], 'ok');
  assert.equal(st.entries[`${DAY}T06:30`], undefined, 'the log has no Notion state at all');
  const stateRaw = await readFile(path.join(dataDir, 'notion-journal.json'), 'utf8');
  assert.doesNotMatch(stateRaw, /secret-test-token/, 'the token is never written to the state');
});

test('pull: a page he wrote in Notion becomes his vault entry, marked notion, and gets its Nova id', async () => {
  await seed();
  const fk = fakeNotion();
  await N.syncOnce(vault, deps(fk));
  const id = fk.his.write('On the laptop', 'Demo words. Wrote this one on the laptop between calls.', { tag: 'Life' });
  const r = await N.syncOnce(vault, deps(fk));
  assert.equal(r.pulled, 1);
  const [day] = await J.listEntries(vault);
  const got = day.sections.find((s) => s.words === 'Demo words. Wrote this one on the laptop between calls.');
  assert.ok(got);
  assert.equal(got.author, 'hayden');
  assert.equal(got.writtenIn, 'notion');
  assert.equal(got.tag, 'life');
  const page = fk.pages.get(id);
  assert.equal(page.properties['Nova id'].rich_text[0].text.content, got.novaId);
  assert.equal(page.properties['Written in'].select.name, 'Notion');
  // and it never comes back twice
  const r2 = await N.syncOnce(vault, deps(fk));
  assert.equal(r2.pulled, 0);
  assert.equal(r2.pushed, 0);
  const st = await N.syncStatus(vault, { getToken: async () => 'x' });
  assert.equal(st.entries[got.novaId], 'from');
});

test('an edit in Notion flows back into the vault copy, and only that entry changes', async () => {
  await seed();
  const fk = fakeNotion();
  await N.syncOnce(vault, deps(fk));
  const pg = byNovaId(fk, `${DAY}T12:15`);
  const before = await readFile(dayFile, 'utf8');
  fk.his.edit(pg.id, 'Demo words. A walk at lunch, then a better afternoon.', 'Deep');
  const r = await N.syncOnce(vault, deps(fk));
  assert.equal(r.edited, 1);
  const after = await readFile(dayFile, 'utf8');
  assert.equal(after, before.replace('## 12:15 · personal · by Hayden\n\nDemo words. A walk at lunch fixed more than the coffee did.', '## 12:15 · personal · by Hayden · deep\n\nDemo words. A walk at lunch, then a better afternoon.'));
  // the vault is the source of truth: when both changed, the vault wins
  await J.updateEntry(vault, `${DAY}T12:15`, { words: 'Demo words. Vault edit.' });
  fk.his.edit(pg.id, 'Demo words. Notion edit at the same time.');
  await N.syncOnce(vault, deps(fk));
  assert.match(await readFile(dayFile, 'utf8'), /Demo words\. Vault edit\./);
  assert.equal(fk.blocks.get(pg.id).map((b) => b.paragraph.rich_text.map((t) => t.plain_text ?? t.text?.content).join('')).join(''), 'Demo words. Vault edit.');
});

test('a delete in Notion deletes the vault entry on the Inbox rails, and Undo restores the day byte for byte without re-creating it in Notion', async () => {
  await seed();
  const fk = fakeNotion();
  await N.syncOnce(vault, deps(fk));
  const before = await readFile(dayFile, 'utf8');
  const pg = byNovaId(fk, `${DAY}T12:15`);
  fk.his.trash(pg.id);
  const r = await N.syncOnce(vault, deps(fk));
  assert.equal(r.deleted, 1);
  assert.doesNotMatch(await readFile(dayFile, 'utf8'), /A walk at lunch/);
  const rec = (await listRecords()).find((x) => x.kind === 'journal-notion');
  assert.ok(rec, 'filed on the rails');
  assert.equal(rec.status, 'filed');
  assert.equal(rec.undoData.kind, 'journal-notion-delete');
  assert.match(rec.text, /A walk at lunch/);

  const undone = await undoRecord(vault, rec.id);
  assert.equal(undone.status, 'undone');
  assert.equal(await readFile(dayFile, 'utf8'), before, 'byte for byte');
  const pagesBefore = fk.pages.size;
  const r2 = await N.syncOnce(vault, deps(fk));
  assert.equal(r2.pushed, 0, 'Undo does not re-create it in Notion: he deleted it there');
  assert.equal(fk.pages.size, pagesBefore);
  const st = await N.syncStatus(vault, { getToken: async () => 'x' });
  assert.equal(st.entries[`${DAY}T12:15`], 'vault-only');
  // restored from Notion's trash, the two are joined again
  fk.his.trash(pg.id); fk.pages.get(pg.id).archived = false;
  await N.syncOnce(vault, deps(fk));
  const st2 = await N.syncStatus(vault, { getToken: async () => 'x' });
  assert.notEqual(st2.entries[`${DAY}T12:15`], 'vault-only');
});

test('not connected and errors are said honestly, and a refusal keeps the entry in the vault', async () => {
  await seed();
  const none = await N.syncStatus(vault, { getToken: async () => null });
  assert.equal(none.state, 'not-connected');
  const r = await N.syncOnce(vault, { getToken: async () => null });
  assert.equal(r.state, 'not-connected');
  const fk = fakeNotion();
  const unshared = { ...deps(fk), fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null }, json: async () => ({ message: 'Could not find database' }) }) };
  const bad = await N.syncOnce(vault, unshared);
  assert.equal(bad.state, 'error');
  assert.match(bad.error, /cannot see the Journal database/);
  const st = await N.syncStatus(vault, { getToken: async () => 'x' });
  assert.equal(st.state, 'error');
  assert.match(await readFile(dayFile, 'utf8'), /A walk at lunch/, 'the vault is untouched by a failed pass');
});

test('a sync stays under three requests a second', async () => {
  await seed();
  const fk = fakeNotion();
  const waits = [];
  await N.syncOnce(vault, { ...deps(fk), minGapMs: N.MIN_GAP_MS, sleep: async (ms) => { waits.push(ms); } });
  assert.ok(N.MIN_GAP_MS >= 334, 'at least a third of a second between requests');
  assert.ok(waits.length >= fk.calls.length - 2, 'every request after the first waited its turn');
});

test('the three prompts are written only at the tap, each with NOVA_LENS first', async () => {
  let spawned = 0;
  const fakeChild = () => {
    spawned += 1;
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    setImmediate(() => { c.stdout.emit('data', JSON.stringify({ result: '{"prompt":"Demo question?"}' })); c.emit('close', 0); });
    return c;
  };
  P._setSpawnForTests(fakeChild);
  // importing the modules and reading status wrote nothing ahead
  assert.equal(spawned, 0);
  assert.equal(Object.keys(P).some((k) => /schedul/i.test(k)), false, 'no scheduler exists for prompts');
  const { LENS_HEAD } = { LENS_HEAD: 'NOVA OPERATING LENS' };
  for (const seed of [{ kind: 'deep' }, { kind: 'review', concept: 'Second-order effects' }, { kind: 'life', source: 'cal', facts: '- Thu 09:00 Standup' }]) {
    const text = P.buildPrompt(seed);
    assert.ok(text.startsWith(LENS_HEAD), `${seed.kind} prepends the lens`);
  }
  assert.match(P.buildPrompt({ kind: 'deep' }), /ORIGINAL/);
  assert.doesNotMatch(P.buildPrompt({ kind: 'deep' }).split('Write an ORIGINAL')[1], /Standup|calendar/, 'a deep question is handed none of his data');
  assert.throws(() => P.buildPrompt({ kind: 'review' }), /no Daily review concept/);
  assert.throws(() => P.buildPrompt({ kind: 'life' }), /no source/);
  const id = P.startPromptJob({ kind: 'deep' }, { kind: 'deep' });
  assert.equal(spawned, 1, 'one call, at the tap');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(P.getPromptJob(id).result.prompt, 'Demo question?');
  // life sources: a source with nothing is skipped, never guessed; Another moves on
  const src = await P.readLifeSources(vault, null, { cal: async () => ({ from: 'From your calendar', facts: '- x' }), train: async () => null, lead: async () => ({ from: 'Lead', facts: '- y' }), money: async () => null, review: async () => { throw new Error('down'); } });
  assert.equal(src.money, null);
  assert.equal(src.review, null);
  assert.equal(P.pickLifeSource(src, 0), 'cal');
  assert.equal(P.pickLifeSource(src, 1), 'lead');
  assert.equal(P.pickLifeSource(src, 2), 'cal');
  assert.equal(P.pickLifeSource({}, 0), null);
  P._setSpawnForTests(null);
});

test('the Undo on a save removes the entry and archives its Notion page', async () => {
  await seed();
  const fk = fakeNotion();
  await N.syncOnce(vault, deps(fk));
  const pg = byNovaId(fk, `${DAY}T12:15`);
  const r = await N.unsaveEntry(vault, `${DAY}T12:15`, deps(fk));
  assert.equal(r.notion, 'archived');
  assert.equal(fk.pages.get(pg.id).archived, true);
  assert.doesNotMatch(await readFile(dayFile, 'utf8'), /A walk at lunch/);
  await assert.rejects(N.unsaveEntry(vault, `${DAY}T06:30`, deps(fk)), /only your own|no longer/);
});
