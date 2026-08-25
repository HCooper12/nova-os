// READ NEXT (Librarian Phase 4). The graph drives acquisition: a concept
// several sources reach for, with no developed page behind it, is a hole in
// the second brain shaped like the next book. Every property here was
// written after the real vault broke an earlier version of the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findReadNextGaps, readNextLine, looksLikePerson, STUB_CHARS } from '../lib/readNext.js';

const source = (name, links) => ({ id: `Wiki/Sources/${name}`, title: name, type: 'source', links, raw: 'x'.repeat(2000) });
const concept = (name, chars = 2000) => ({ id: `Wiki/Concepts/${name}`, title: name, type: 'concept', links: [], raw: 'x'.repeat(chars) });

test('a concept several sources reach for, with no page, is the gap', () => {
  const gaps = findReadNextGaps([
    source('A', ['Deliberate Practice']),
    source('B', ['Deliberate Practice']),
  ]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].concept, 'Deliberate Practice');
  assert.equal(gaps[0].sourceCount, 2);
  assert.equal(gaps[0].state, 'missing');
});

test('one source reaching for something is a coincidence, not a theme', () => {
  assert.equal(findReadNextGaps([source('A', ['Deliberate Practice'])]).length, 0);
});

test('a developed page is not a gap; a stub still is', () => {
  const developed = findReadNextGaps([
    source('A', ['Flow']), source('B', ['Flow']), concept('Flow', 2000),
  ]);
  assert.equal(developed.length, 0, 'he already understands it — nothing to buy');

  const stub = findReadNextGaps([
    source('A', ['Flow']), source('B', ['Flow']), concept('Flow', 40),
  ]);
  assert.equal(stub.length, 1);
  assert.equal(stub[0].state, 'stub');
  assert.ok(stub[0].chars < STUB_CHARS);
});

test('wikilinks resolve by FILENAME, the way Obsidian does', () => {
  // His real vault: the file is "41 Harsh Truths ... (Hormozi).md" while its
  // frontmatter title says "(Hormozi × Williamson)". Indexing only by title
  // made a link to this SOURCE look like a missing concept, and Nova
  // recommended he read a book he already had on the shelf.
  const renamed = {
    id: 'Wiki/Sources/41 Harsh Truths (Hormozi)',
    title: '41 Harsh Truths (Hormozi × Williamson)',
    type: 'source', links: [], raw: 'x'.repeat(2000),
  };
  const gaps = findReadNextGaps([
    renamed,
    source('A', ['41 Harsh Truths (Hormozi)']),
    source('B', ['41 Harsh Truths (Hormozi)']),
  ]);
  assert.deepEqual(gaps, [], 'a link to an existing source is never a reading gap');
});

test('entities and other sources are not things to go and read about', () => {
  const person = { id: 'Wiki/Entities/Cal Newport', title: 'Cal Newport', type: 'entity', links: [], raw: 'x' };
  const gaps = findReadNextGaps([person, source('A', ['Cal Newport']), source('B', ['Cal Newport'])]);
  assert.deepEqual(gaps, []);
});

test('an unresolvable person-shaped link is refused, not recommended', () => {
  // observed on his real vault at one source; at two it would have fired
  const gaps = findReadNextGaps([
    source('A', ["Leila (Hormozi's wife)"]),
    source('B', ["Leila (Hormozi's wife)"]),
  ]);
  assert.deepEqual(gaps, [], 'never recommend a book about somebody\'s spouse');
});

test('looksLikePerson: conservative, and only about MISSING links', () => {
  assert.equal(looksLikePerson("Hormozi's wife"), true);
  assert.equal(looksLikePerson('Hormozi’s editor'), true, 'a curly apostrophe is still a possessive');
  assert.equal(looksLikePerson('my co-founder'), true);
  // The rule must NOT swallow ordinary concepts — an earlier draft treated
  // "two capitalised words" as a name and silenced the whole feature.
  assert.equal(looksLikePerson('Deliberate Practice'), false);
  assert.equal(looksLikePerson('Deep Work'), false);
  assert.equal(looksLikePerson('Cal Newport'), false, 'the cost of this miss is one quiet suggestion, not a broken feature');
  assert.equal(looksLikePerson('Attention Residue and Focus'), false);
});

test('Raw/ originals are never a reading gap', () => {
  const gaps = findReadNextGaps([
    source('A', ['Raw/Original - 0f7e4789']),
    source('B', ['Raw/Original - 0f7e4789']),
  ]);
  assert.deepEqual(gaps, []);
});

test('one source linking the same concept twice is still one source', () => {
  const gaps = findReadNextGaps([source('A', ['Flow', 'Flow', 'Flow'])]);
  assert.deepEqual(gaps, [], 'repetition inside one book is not corroboration');
});

test('ranking: most-reached first, ties resolved by name so it never wanders', () => {
  const pages = [
    source('A', ['deep concept x', 'shared idea']),
    source('B', ['deep concept x', 'shared idea']),
    source('C', ['deep concept x']),
  ];
  const gaps = findReadNextGaps(pages);
  assert.equal(gaps[0].concept, 'deep concept x');
  assert.equal(gaps[0].sourceCount, 3);
  for (let i = 0; i < 10; i++) {
    assert.equal(findReadNextGaps([...pages].reverse())[0].concept, 'deep concept x');
  }
});

test('the line states the evidence and never names a book', () => {
  const line = readNextLine({ concept: 'Deliberate Practice', sourceCount: 3, state: 'missing', chars: 0 }, ['A', 'B']);
  assert.match(line, /3 of your sources/);
  assert.match(line, /Deliberate Practice/);
  assert.match(line, /no page for it at all/);
  // the gap is the finding; choosing the book is his
  assert.doesNotMatch(line, /you should read ["“]/i);
});

test('a stub says how thin it actually is', () => {
  const line = readNextLine({ concept: 'Flow', sourceCount: 2, state: 'stub', chars: 42 }, []);
  assert.match(line, /42 characters/);
  assert.match(line, /placeholder/);
});
