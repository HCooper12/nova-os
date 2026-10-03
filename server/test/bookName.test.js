import test from 'node:test';
import assert from 'node:assert/strict';
import { nameFromFilename, nameFromTitlePage, nameBook } from '../lib/bookName.js';

test("his PDF names itself from its filename (3 Oct: The Next Conversation)", () => {
  assert.deepEqual(nameFromFilename('_OceanofPDF.com_The_Next_Conversation_-_Jefferson_Fisher.pdf'), { title: 'The Next Conversation', author: 'Jefferson Fisher' });
  assert.deepEqual(nameFromFilename('Atomic Habits - James Clear.pdf'), { title: 'Atomic Habits', author: 'James Clear' });
  assert.deepEqual(nameFromFilename('Deep Work by Cal Newport.epub'), { title: 'Deep Work', author: 'Cal Newport' });
});

test('a "by" line on the title page names the author', () => {
  assert.equal(nameFromTitlePage('THE NEXT CONVERSATION\nArgue Less, Talk More\nby Jefferson Fisher\n').author, 'Jefferson Fisher');
});

test('what he typed wins; the metadata next; nothing found still files, marked guessed', () => {
  assert.deepEqual(nameBook({ typedTitle: 'X', typedAuthor: 'Y', filename: 'a_-_b.pdf' }), { title: 'X', author: 'Y', guessed: false });
  assert.equal(nameBook({ metaTitle: 'Meta', metaAuthor: 'Person Name', filename: 'z.pdf' }).title, 'Meta');
  const n = nameBook({ filename: 'scan0042.pdf', text: '' });
  assert.equal(n.author, null); assert.equal(n.guessed, true);
});
