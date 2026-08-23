// The Librarian's honesty properties, pinned permanently.
//
// This agent writes into Hayden's second brain, and its failure modes are
// SILENT: invented chapter detail, one blog's take dressed as the book,
// second-hand knowledge wearing a first-hand voice, quote-chaining into
// reproduction. Nothing errors when those happen — the vault just quietly
// fills with confident falsehood. So the counter-rules live in the prompt,
// and these tests make removing one of them a red build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildLibrarianPrompt, bookKey, findExistingBookPages, composeBookDossier } from '../lib/librarian.js';
import { parseBookIntent, routeIntent, LANES, LANE_LABEL } from '../lib/intentRouter.js';
import { GATE_LANES } from '../lib/modelChoice.js';
import { LANES as MODEL_LANES } from '../lib/modelPrefs.js';

const PROMPT = buildLibrarianPrompt({ title: 'Atomic Habits', author: 'James Clear' });

test('THE HONESTY PROPERTIES: every counter-rule is present in the prompt', () => {
  // researched, not read — the agent must never wear a first-hand voice
  assert.match(PROMPT, /YOU HAVE NOT READ THIS BOOK/);
  // no piracy — never hunt for or rebuild the text
  assert.match(PROMPT, /DO NOT seek out, download, or reconstruct/);
  // quote discipline — short, attributed, never chained
  assert.match(PROMPT, /25 words or fewer/);
  assert.match(PROMPT, /never adjacent to another quote/);
  // triangulation — one source is labeled, not laundered
  assert.match(PROMPT, /\(single source\)/);
  // no invented resolution — gaps say so
  assert.match(PROMPT, /NEVER INVENT RESOLUTION/);
  assert.match(PROMPT, /not covered by available sources/);
  // claims carry evidence notes, separate from the book's ideas
  assert.match(PROMPT, /CLAIMS VS IDEAS/);
  // the book's argument and its reception stay separate sections
  assert.match(PROMPT, /SEPARATE THE BOOK'S CLAIMS FROM ITS RECEPTION/);
});

test('the dossier structure demands sources and connection hooks', () => {
  assert.match(PROMPT, /## Sources consulted/);
  assert.match(PROMPT, /## Connection hooks/);
  assert.match(PROMPT, /## Reception & strongest criticisms/);
});

test('the provenance header labels the dossier researched-not-read', () => {
  const out = composeBookDossier({ title: 'Deep Work', author: 'Cal Newport' }, '## Core ideas\nfocus');
  assert.match(out, /RESEARCHED, NOT READ/);
  assert.match(out, /provenance: researched/);
  assert.match(out, /Deep Work/);
});

test('bookKey: the same book in any casing/punctuation is ONE book', () => {
  assert.equal(bookKey('Atomic Habits', 'James Clear'), bookKey('atomic habits.', 'JAMES CLEAR'));
  assert.equal(bookKey('Thinking, Fast and Slow', 'Kahneman'), bookKey('thinking fast and slow', 'kahneman'));
  assert.notEqual(bookKey('Atomic Habits', 'James Clear'), bookKey('Atomic Habits', 'Someone Else'));
});

test('findExistingBookPages: matches frontmatter identity, not filename', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'librarian-'));
  try {
    await mkdir(path.join(dir, 'Wiki', 'Sources'), { recursive: true });
    await writeFile(path.join(dir, 'Wiki', 'Sources', 'Some Odd Filename.md'),
      '---\ntitle: "Atomic Habits"\nauthor: James Clear\ntype: book\n---\nbody', 'utf8');
    await writeFile(path.join(dir, 'Wiki', 'Sources', 'Other Book.md'),
      '---\ntitle: "Deep Work"\nauthor: Cal Newport\ntype: book\n---\nbody', 'utf8');
    const hit = findExistingBookPages(dir, 'atomic habits', 'JAMES CLEAR');
    assert.deepEqual(hit.pages, [path.join('Wiki', 'Sources', 'Some Odd Filename.md')]);
    const miss = findExistingBookPages(dir, 'Atomic Habits', 'Wrong Author');
    assert.deepEqual(miss.pages, []);
    // a vault with no Sources dir is empty, not an exception
    assert.deepEqual(findExistingBookPages(path.join(dir, 'nowhere'), 'x', 'y').pages, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('parseBookIntent: the shapes he will actually say', () => {
  assert.deepEqual(parseBookIntent('add book Atomic Habits by James Clear'),
    { title: 'Atomic Habits', author: 'James Clear' });
  assert.deepEqual(parseBookIntent('add the book "Thinking, Fast and Slow" by Daniel Kahneman.'),
    { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman' });
  assert.deepEqual(parseBookIntent('research the book Deep Work by Cal Newport'),
    { title: 'Deep Work', author: 'Cal Newport' });
});

test('parseBookIntent: near-misses stay out of the Librarian', () => {
  // no "by author" — this is a capture/calendar thing, not a research run
  assert.equal(parseBookIntent('add book club to my calendar'), null);
  // a question ABOUT a book is an ask, not an acquisition
  assert.equal(parseBookIntent('what does that book say about sleep'), null);
  assert.equal(parseBookIntent(''), null);
  assert.equal(parseBookIntent(null), null);
});

test('routeIntent: a book beats research and capture keywords', () => {
  // "add ..." would otherwise be a capture; "research ..." a research run
  assert.equal(routeIntent('add book Atomic Habits by James Clear').lane, 'book');
  assert.equal(routeIntent('research the book Deep Work by Cal Newport').lane, 'book');
  const d = routeIntent('add book Atomic Habits by James Clear');
  assert.deepEqual(d.book, { title: 'Atomic Habits', author: 'James Clear' });
  // and the non-book phrasings still route where they always did
  assert.equal(routeIntent('add protein powder to the shopping list').lane, 'capture');
  assert.equal(routeIntent('research creatine timing').lane, 'research');
});

test('the lane is fully registered: router, label, model board, gate', () => {
  assert.ok(LANES.includes('book'), 'intent lane missing');
  assert.ok(LANE_LABEL.book, 'lane label missing');
  assert.ok(MODEL_LANES.some((l) => l.id === 'librarian'), 'model board lane missing');
  assert.ok(GATE_LANES.librarian, 'model-choice gate missing — deep research must stay his call');
});
