// THE DAILY REVIEW, QUOTE FIRST (mockup 116). Every person, show, episode and
// line below is SAMPLE text; none of it is real or his. Set NOVA_DATA_DIR
// before any server lib is imported, so nothing here can touch his live data.
process.env.NOVA_DATA_DIR = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'nova-quote-'));

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  transcriptWords, findInTranscript, extractQuotes, paragraphMarker, secondsToTime, timeToSeconds,
  quoteContext, quoteFor, reviewRank, namedShow, describeSource,
} from '../lib/reviewQuote.js';
import { newCandidates, ideaSentence, reviewToday, skipPage, undoConceptAnswer, LOG_REL, leadable } from '../lib/conceptReview.js';
import { Vault } from '../lib/vault.js';

/* ------------------------------ the transcript ----------------------------- */

const CAPTIONS = [
  'Sample captions for a test.', '',
  '[00:02] Welcome back to the show. Today is about effort.',
  '[00:05] Today is about effort. Every hour of effort you skip',
  '[00:08] Every hour of effort you skip gets added to the bill, and the',
  '[00:11] gets added to the bill, and the bill carries interest. [laughter]',
  '[00:14] bill carries interest. Um, small early payments are cheaper',
  '[1:05:10] than one big late one.',
].join('\n');

test('rolling captions are read once, each word at the time of the line that first said it', () => {
  const w = transcriptWords(CAPTIONS);
  const text = w.map((x) => x.w).join(' ');
  assert.ok(text.includes('every hour of effort you skip gets added to the bill and the bill carries interest'));
  assert.equal(w.find((x) => x.w === 'every').t, 5, 'first said at 00:05');
  assert.equal(w.find((x) => x.w === 'interest').t, 11);
  assert.equal(w.find((x) => x.w === 'late').t, 3910, 'an hour-form time counts in seconds');
});

test('a quote is found word for word and gets the REAL moment of its first word', () => {
  const w = transcriptWords(CAPTIONS);
  const hit = findInTranscript('Every hour of effort you skip gets added to the bill, and the bill carries interest.', w);
  assert.equal(hit.atSeconds, 5);
  assert.equal(secondsToTime(hit.atSeconds), '0:05');
  assert.equal(secondsToTime(3910), '1:05:10');
  assert.equal(timeToSeconds('200:04'), 12004);
});

test('fillers in the captions do not break a hit; a changed word does', () => {
  const w = transcriptWords(CAPTIONS);
  assert.ok(findInTranscript('The bill carries interest, small early payments are cheaper than one big late one.', w));
  assert.equal(findInTranscript('Every hour of effort you skip gets added to the tab and the bill carries interest.', w), null);
  assert.equal(findInTranscript('Anything at all', null), null);
});

test('an ellipsis is checked piece by piece, in order', () => {
  const w = transcriptWords(CAPTIONS);
  assert.equal(findInTranscript('Every hour of effort you skip ... small early payments are cheaper than one big late one.', w).atSeconds, 5);
  assert.equal(findInTranscript('Small early payments are cheaper ... every hour of effort you skip', w), null, 'out of order is not a hit');
});

/* ------------------------------ quotes on a page ----------------------------- */

const people = new Set(['mara ellison', 'dev okafor']);

test('a quote is taken from the page in quotation marks, never composed', () => {
  const raw = '# Effort Debt\n\nMara Ellison says "Every hour of effort you skip gets added to the bill, and the bill carries interest." [41:12-42:00]\n';
  const q = extractQuotes(raw, { people });
  assert.equal(q.length, 1);
  assert.equal(q[0].text, 'Every hour of effort you skip gets added to the bill, and the bill carries interest.');
  assert.equal(q[0].marker, timeToSeconds('41:12'));
});

test('a line the page only reports, a third party, a template or a fragment is not a lead quote', () => {
  const raw = [
    'Carl Jung is quoted: "Until you make the unconscious conscious, it will direct your life and you will call it fate."',
    'Kobe Bryant filtered every decision through "does this make me a better basketball player or not at all"',
    'The plan reads "I will [BEHAVIOR] at [TIME] in [LOCATION] every single week of the year"',
    'She calls it "too short to matter".',
    'He says "Start so small that stopping would feel silly." and "a plan you cannot say in one breath will not survive a bad day".',
  ].join('\n\n');
  const texts = extractQuotes(raw, { people }).map((q) => q.text);
  assert.deepEqual(texts, ['Start so small that stopping would feel silly.', 'a plan you cannot say in one breath will not survive a bad day']);
});

test('the gap BETWEEN two quotes is not a quote', () => {
  const raw = 'He says "Start so small that stopping would feel silly." and then "a plan you cannot say in one breath will not survive."';
  const texts = extractQuotes(raw, { people }).map((q) => q.text);
  assert.ok(texts.every((t) => /^[A-Za-z]/.test(t)));
  assert.ok(!texts.some((t) => t.startsWith('and then')));
});

test('the paragraph time counts only when it is one single range', () => {
  assert.equal(paragraphMarker('Words. [200:04–201:31]'), 12004);
  assert.equal(paragraphMarker('Words. [84:07–85:20, 136:51–139:41]'), null, 'two moments: no single start is honest');
  assert.equal(paragraphMarker('Words. [10:00] and more [20:00]'), null);
  assert.equal(paragraphMarker('No time here.'), null);
});

/* ------------------------------ a vault on disk ------------------------------ */

async function fixtureVault() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'nova-quote-vault-'));
  const w = async (rel, text) => { const f = path.join(dir, rel); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, text); };
  // an episode on one of his named shows, with a verbatim transcript
  await w('Wiki/Sources/The Long Table ep 112.md', [
    '---', 'type: source', 'raw: "[[Raw/The Long Table ep 112 (Transcript)]]"', 'url: https://example.test/watch?v=abc', '---',
    '# The Long Table ep 112', '',
    '**Source:** [Effort and Interest — Modern Wisdom — 1:10:00](https://example.test/watch?v=abc) · transcript via captions', '',
  ].join('\n'));
  await w('Raw/The Long Table ep 112 (Transcript).md', CAPTIONS);
  // an episode on no named show
  await w('Wiki/Sources/Field Notes ep 9.md', ['---', 'type: source', '---', '# Field Notes ep 9', '', '**Source:** [Plans — Field Notes — 40:00](https://example.test/fn)', ''].join('\n'));
  await w('Wiki/Entities/Mara Ellison.md', '---\ntype: entity\n---\n# Mara Ellison\n\nA sample guest.\n');
  await w('Wiki/Concepts/Effort Debt.md', [
    '---', 'type: concept', 'tags: [habits, discipline]', 'created: 2026-10-01', 'sources: ["[[The Long Table ep 112]]"]', '---',
    '# Effort Debt', '',
    'Work you skip now comes back later with interest. Small early payments keep the balance from growing.', '',
    'Mara Ellison puts it plainly: "Every hour of effort you skip gets added to the bill, and the bill carries interest." [0:05-0:14]', '',
  ].join('\n'));
  // same show, no line at all
  await w('Wiki/Concepts/Bare Idea.md', [
    '---', 'type: concept', 'tags: [habits]', 'created: 2026-10-20', 'sources: ["[[The Long Table ep 112]]"]', '---',
    '# Bare Idea', '', 'An idea with no quoted words anywhere on its page.', '',
  ].join('\n'));
  // another show, newer, with a line
  await w('Wiki/Concepts/One-Breath Plans.md', [
    '---', 'type: concept', 'tags: [planning]', 'created: 2026-11-10', 'sources: ["[[Field Notes ep 9]]"]', '---',
    '# One-Breath Plans', '',
    'The episode puts it this way: "A plan you cannot say in one breath will not survive a bad day."', '',
  ].join('\n'));
  // a training page on his named show: never in the mind review
  await w('Wiki/Concepts/Squat Depth.md', [
    '---', 'type: concept', 'tags: [training, hypertrophy]', 'created: 2026-11-12', 'sources: ["[[The Long Table ep 112]]"]', '---',
    '# Squat Depth', '', 'Mara Ellison says "Every hour of effort you skip gets added to the bill, and the bill carries interest."', '',
  ].join('\n'));
  await w('Wiki/Library/Review Log.md', '# Review Log\n\n');
  return dir;
}

test('the quote leads: real words, the real moment, the speaker the vault names, the show as worded', async () => {
  const dir = await fixtureVault();
  const pages = await new Vault(dir).listPages();
  const ctx = quoteContext(pages);
  const page = pages.find((p) => p.title === 'Effort Debt');
  const q = quoteFor(page, ctx);
  assert.equal(q.text, 'Every hour of effort you skip gets added to the bill, and the bill carries interest.');
  assert.equal(q.verified, true, 'found in the transcript');
  assert.equal(q.atSeconds, 5);
  assert.equal(q.at, '0:05');
  assert.equal(q.who, 'Mara Ellison');
  assert.equal(q.show, 'Modern Wisdom');
  assert.equal(q.url, 'https://example.test/watch?v=abc');
});

test('a line with no transcript hit and no time of its own shows NO time, and no speaker the vault does not name', async () => {
  const dir = await fixtureVault();
  const pages = await new Vault(dir).listPages();
  const ctx = quoteContext(pages);
  const q = quoteFor(pages.find((p) => p.title === 'One-Breath Plans'), ctx);
  assert.equal(q.text, 'A plan you cannot say in one breath will not survive a bad day.');
  assert.equal(q.verified, false);
  assert.equal(q.at, null);
  assert.equal(q.atSeconds, null);
  assert.equal(q.who, null, 'no person page is named near the line; nothing is guessed');
  assert.equal(q.show, 'Field Notes');
});

test('a page with no quoted words has no quote', async () => {
  const dir = await fixtureVault();
  const pages = await new Vault(dir).listPages();
  assert.equal(quoteFor(pages.find((p) => p.title === 'Bare Idea'), quoteContext(pages)), null);
});

test('his named shows are read from what the vault says, and only then', async () => {
  const dir = await fixtureVault();
  const pages = await new Vault(dir).listPages();
  const ctx = quoteContext(pages);
  assert.equal(reviewRank(pages.find((p) => p.title === 'Effort Debt'), ctx).show, 'williamson');
  assert.equal(reviewRank(pages.find((p) => p.title === 'One-Breath Plans'), ctx).show, null);
  assert.equal(namedShow([{ text: 'The Diary Of A CEO — Jane Sample' }]), 'doac');
  assert.equal(namedShow([{ text: 'Alex Hormozi on speed' }]), 'hormozi');
  assert.equal(namedShow([{ text: 'A podcast about plans' }]), null);
  assert.equal(describeSource(null, new Map()), null);
});

test('the new pick: his named shows first, a page with a line before one without, mind only', async () => {
  const dir = await fixtureVault();
  const pages = await new Vault(dir).listPages();
  const order = newCandidates(pages, {}, new Map()).map((c) => c.page.title);
  // One-Breath Plans is the newest page, and before this change it led. His show comes first now.
  assert.deepEqual(order, ['Effort Debt', 'Bare Idea', 'One-Breath Plans']);
  assert.ok(!order.includes('Squat Depth'), 'a training page never enters the mind review');
});

test('with no named show anywhere, the order is the one it always had (newest first)', async () => {
  const dir = await fixtureVault();
  const pages = (await new Vault(dir).listPages()).filter((p) => p.title !== 'Effort Debt' && p.title !== 'Bare Idea');
  assert.deepEqual(newCandidates(pages, {}, new Map()).map((c) => c.page.title), ['One-Breath Plans']);
  const bare = [{ id: 'a', title: 'A', type: 'concept', tags: ['habits'], date: '2026-01-01', sources: [], links: [], paragraphs: ['x'] }, { id: 'b', title: 'B', type: 'concept', tags: ['habits'], date: '2026-02-01', sources: [], links: [], paragraphs: ['y'] }];
  assert.deepEqual(newCandidates(bare, {}, new Map()).map((c) => c.id), ['b', 'a']);
});

test('a lead needs a speaker or a show to put the words to', () => {
  assert.equal(leadable(null), false);
  assert.equal(leadable({ text: 'x', who: null, show: null }), false);
  assert.equal(leadable({ text: 'x', who: 'A', show: null }), true);
  assert.equal(leadable({ text: 'x', who: null, show: 'S' }), true);
});

test('ideaSentence is the page\'s own first sentence, cut at a word when long', () => {
  assert.equal(ideaSentence('Small early payments are cheaper. Second sentence.'), 'Small early payments are cheaper.');
  assert.equal(ideaSentence(''), null);
  assert.equal(ideaSentence(undefined), null);
  const long = `${'word '.repeat(60)}end.`;
  const cut = ideaSentence(long, 50);
  assert.ok(cut.endsWith('…') && cut.length <= 52);
});

/* -------------------------- the queue, the view, the skip -------------------- */

test('today\'s queue carries the quote and the idea sentence on every item', async () => {
  const dir = await fixtureVault();
  const vault = new Vault(dir);
  const today = await reviewToday(dir, vault, new Date('2026-11-17T09:00:00+10:00'));
  assert.equal(today.items.length, 1);
  const it = today.items[0];
  assert.equal(it.title, 'Effort Debt');
  assert.equal(it.quote.who, 'Mara Ellison');
  assert.equal(it.quote.at, '0:05');
  assert.equal(it.idea.title, 'Effort Debt');
  assert.equal(it.idea.sentence, 'Work you skip now comes back later with interest.');
});

test('Not for me writes nothing to the Review Log, drops the day by one, and Undo puts it back', async () => {
  const dir = await fixtureVault();
  const vault = new Vault(dir);
  const when = new Date('2026-11-17T09:00:00+10:00');
  const logBefore = await readFile(path.join(dir, LOG_REL), 'utf8');
  const today = await reviewToday(dir, vault, when);
  const id = today.items[0].id;
  const { record } = await skipPage(dir, vault, { pageId: id }, when);
  assert.equal(await readFile(path.join(dir, LOG_REL), 'utf8'), logBefore, 'the Review Log is a contract: not one byte written');
  assert.equal((await reviewToday(dir, vault, when)).total, 0);
  assert.equal(record.kind, 'concept-recall');
  assert.ok(record.undoData.skipped);
  await undoConceptAnswer(dir, record.undoData);
  assert.equal((await reviewToday(dir, vault, when)).total, 1);
  assert.ok(existsSync(path.join(dir, LOG_REL)));
});

/* ------------------------------ a passed-on line ------------------------------ */

test('a passed-on line: the page marks its author, and the transcript has to say the name beside it', async () => {
  const { originSaidNear } = await import('../lib/reviewQuote.js');
  const caps = [
    '[00:02] There is an old line from Tomas Verhoeven that I love.',
    '[00:06] The door you avoid is the room you most need to enter today.',
    '[00:10] And I think about that a lot.',
  ].join('\n');
  const words = transcriptWords(caps);
  const text = 'The door you avoid is the room you most need to enter today.';
  const hit = findInTranscript(text, words);
  assert.equal(originSaidNear('Tomas Verhoeven', words, hit), true);
  assert.equal(originSaidNear('Ilse Brandt', words, hit), false, 'a name the transcript never says is not recorded');
  assert.equal(originSaidNear('Tomas Verhoeven', words, null), false, 'no transcript hit, no author');

  // the marked line is kept with its author; the same line unmarked is still a reported line
  const marked = extractQuotes(`As Tomas Verhoeven wrote: "${text}" (originally Tomas Verhoeven)`, {});
  assert.deepEqual(marked.map((q) => [q.text, q.origin]), [[text, 'Tomas Verhoeven']]);
  assert.equal(extractQuotes(`As Tomas Verhoeven wrote: "${text}"`, {}).length, 0);
  assert.equal(extractQuotes(`She says "${text}"`, {})[0].origin, null);
});

test('a passed-on line reaches the card only when verified; who said it here stays the speaker', async () => {
  const dir = await fixtureVault();
  const w = async (rel, text) => { await mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await writeFile(path.join(dir, rel), text); };
  const line = 'Every hour of effort you skip gets added to the bill, and the bill carries interest.';
  await w('Wiki/Concepts/Borrowed Bill.md', [
    '---', 'type: concept', 'tags: [mindset]', 'created: 2026-11-13', 'sources: ["[[The Long Table ep 112]]"]', '---',
    '# Borrowed Bill', '', `Mara Ellison passes on a line: "${line}" (originally Nobody Named)`, '',
  ].join('\n'));
  const pages = await new Vault(dir).listPages();
  const ctx = quoteContext(pages);
  assert.equal(quoteFor(pages.find((p) => p.title === 'Borrowed Bill'), ctx), null, 'the transcript never names that author, so the line is not shown as theirs or anyone’s');
  await w('Wiki/Concepts/Borrowed Bill.md', [
    '---', 'type: concept', 'tags: [mindset]', 'created: 2026-11-13', 'sources: ["[[The Long Table ep 112]]"]', '---',
    '# Borrowed Bill', '', `Mara Ellison passes on a line: "${line}" (originally The Show)`, '',
  ].join('\n'));
  const pages2 = await new Vault(dir).listPages();
  const q = quoteFor(pages2.find((p) => p.title === 'Borrowed Bill'), quoteContext(pages2));
  assert.equal(q.origin, 'The Show', 'the captions say "show" right before the line');
  assert.equal(q.who, 'Mara Ellison');
});
