// Mentors News as data (src/mentors/newsModel.js), pinned in plain node:
//
//   node --test src/mentors/newsModel.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { rvOrder, rvNext, rvCount, rvView, tabsOf, qOf, askOf, slotOf, isBig, cmpWord, costLabel, feedOf, reviewsOf, wayIn, moving, justAnswered, hms, ymdLabel, videoDay, noteOf, RV_UP } from './newsModel.js';

const item = (rid, status = 'new', o = {}) => ({ rid, name: `Item ${rid}`, status, at: '2026-11-22T05:35:34.296Z', question: `Is ${rid} true?`, questions: { true: `Is ${rid} true?`, deeper: null, use: null }, ...o });

test('the count is new, researching and answered; kept and dismissed are not waiting', () => {
  assert.equal(rvCount([item('a'), item('b', 'research'), item('c', 'answered'), item('d', 'kept'), item('e', 'dismissed')]), 3);
});

test('answered items lead, newest answer first; the rest keep the server\'s order', () => {
  const items = [item('a'), item('b', 'answered', { answer: { at: '2026-11-25T01:00:00Z' } }), item('c'), item('d', 'answered', { answer: { at: '2026-11-25T02:00:00Z' } })];
  assert.deepEqual(rvOrder(items).map((r) => r.rid), ['d', 'b', 'a', 'c']);
});

test('the next to open: the first new or answered, else the first researching', () => {
  assert.equal(rvNext([item('a', 'kept'), item('b', 'research'), item('c')]), 'c');
  assert.equal(rvNext([item('a', 'kept'), item('b', 'research')]), 'b');
  assert.equal(rvNext([item('a', 'kept')]), null);
});

test('six up front, then "Show all N"; a dismissed one holds its place only while its Undo does', () => {
  const items = Array.from({ length: 9 }, (_, i) => item(`r${i}`));
  const v = rvView(items);
  assert.equal(v.rows.length, RV_UP);
  assert.equal(v.more, true);
  assert.equal(v.live, 9);
  assert.equal(rvView(items, { all: true }).rows.length, 9);
  items[0].status = 'dismissed';
  assert.equal(rvView(items).rows[0].rid, 'r1', 'dismissed and let go: its row has left');
  assert.equal(rvView(items, { undo: new Set(['r0']) }).rows[0].rid, 'r0', 'Undo held: the row stays');
});

test('the last one decided: the card leaves, unless its mark is held or an Undo is', () => {
  const items = [item('a', 'kept'), item('b', 'dismissed')];
  assert.equal(rvView(items), null);
  assert.ok(rvView(items, { hold: true }));
  assert.ok(rvView(items, { undo: new Set(['b']) }));
});

test('a tab whose question is null is not drawn; no question, no slip', () => {
  assert.deepEqual(tabsOf(item('a')).map(([k]) => k), ['true']);
  assert.deepEqual(tabsOf(item('a', 'new', { questions: { true: 'T?', deeper: 'D?', use: 'U?' } })).map(([k]) => k), ['true', 'deeper', 'use']);
  assert.deepEqual(tabsOf(item('a', 'new', { question: null, questions: { true: null, deeper: null, use: null } })), []);
  // a server answer without `questions` still has the weave's own question
  assert.equal(qOf({ question: 'Q?' }, 'true'), 'Q?');
});

test('what he sends: the tab\'s kind as written, "own" only when he changed the words', () => {
  const r = item('a', 'new', { questions: { true: 'T?', deeper: 'D?', use: null } });
  assert.deepEqual(askOf(r, 'deeper', undefined), { kind: 'deeper', question: 'D?' });
  assert.deepEqual(askOf(r, 'deeper', ' D? '), { kind: 'deeper', question: 'D?' });
  assert.deepEqual(askOf(r, 'true', 'Is it true for men over 40?'), { kind: 'own', question: 'Is it true for men over 40?' });
  assert.deepEqual(askOf(r, 'true', '   '), { kind: 'true', question: 'T?' });
});

test('the tile\'s slot by state, and which tiles are the full frame', () => {
  assert.equal(slotOf({ stage: 'found' }), 'none');
  assert.equal(slotOf({ working: 'transcript' }), 'trans');
  assert.equal(slotOf({ working: 'reading', brief: null }), 'read');
  assert.equal(slotOf({ stage: 'read', brief: { ideas: [] } }), 'done');
  assert.equal(slotOf({ stage: 'transcript', briefError: { why: 'x' } }), 'error');
  const now = Date.parse('2026-11-25T00:00:00Z');
  assert.equal(isBig({ stage: 'transcript', date: '2026-10-01T00:00:00Z' }, now), true, 'unread: the full frame, however old');
  assert.equal(isBig({ stage: 'woven', working: 'reading', date: '2026-10-01T00:00:00Z' }, now), true);
  assert.equal(isBig({ stage: 'read', briefError: { why: 'x' }, date: '2026-10-01T00:00:00Z' }, now), true);
  assert.equal(isBig({ stage: 'woven', brief: { ideas: [] }, date: '2026-11-20T15:00:00Z' }, now), true, 'woven inside 7 days: still new');
  assert.equal(isBig({ stage: 'woven', brief: { ideas: [] }, date: '2026-11-17T15:00:00Z' }, now), false, 'woven, 7 days and 9 hours old: the compact row, brief or not');
  assert.equal(isBig({ stage: 'woven', date: '2026-11-18T00:00:00Z' }, now), true, 'exactly 7 days: still the full frame');
  assert.equal(isBig({ stage: 'woven', date: '2026-11-17T23:59:00Z' }, now), false);
  assert.equal(cmpWord({ stage: 'woven' }), 'Woven');
  assert.equal(cmpWord({ stage: 'read' }), 'Read');
  assert.equal(costLabel({ read: { costUsd: 0.1483 } }), '$0.15');
  assert.equal(costLabel({ read: { costUsd: null } }), '');
  assert.equal(costLabel({ read: null }), '');
});

const NEWS = {
  people: [{ id: 'p', name: 'Jefferson Fisher', colour: '#fb6b2f' }],
  videos: [
    { key: 'yt:b', personId: 'p', title: 'Older', date: '2026-11-17T15:00:00Z', stage: 'woven' },
    { key: 'yt:a', personId: 'p', title: 'Newest', date: '2026-11-20T15:00:00Z', stage: 'transcript' },
    { key: 'yt:x', personId: 'nobody', title: 'Not followed', date: '2026-11-21T15:00:00Z', stage: 'found' },
  ],
  learned: [{ personId: 'p', from: '2026-11-12', to: '2026-11-19', videos: 4, chapters: 8, ideas: 18, scripts: 50, undo: null }],
  raised: [{ personId: 'p', items: [item('a'), item('b', 'research'), item('c', 'kept')] }],
};

test('the feed: newest first, the week\'s card under his newest video, only people he follows', () => {
  const f = feedOf(NEWS, Date.parse('2026-11-25T00:00:00Z'));
  assert.deepEqual(f.map((x) => x.key), ['yt:a', 'learned:p', 'yt:b']);
  // the card's own date is today; it still sits under his newest video
  const g = feedOf({ ...NEWS, learned: [{ ...NEWS.learned[0], to: '2026-11-25' }] }, Date.parse('2026-11-25T00:00:00Z'));
  assert.deepEqual(g.map((x) => x.key), ['yt:a', 'learned:p', 'yt:b']);
  assert.equal(f[0].big, true);
  assert.equal(f[2].big, false);
});

test('the way in: the count waiting and the newest video\'s title', () => {
  const w = wayIn(NEWS);
  assert.equal(w.n, 2);
  assert.equal(w.title, 'Newest', 'a person he does not follow is not news');
  assert.equal(reviewsOf(NEWS).length, 1);
  assert.equal(reviewsOf({ ...NEWS, raised: [{ personId: 'p', items: [] }] }).length, 0);
});

test('moving: research or a brief running keeps the short beat; an answer that just landed is named', () => {
  assert.equal(moving(NEWS), true);
  assert.equal(moving({ ...NEWS, raised: [] }), false);
  assert.equal(moving({ videos: [{ working: 'reading' }], raised: [] }), true);
  const next = { raised: [{ personId: 'p', items: [item('a'), item('b', 'answered', { answer: { at: 'x' } })] }] };
  assert.deepEqual(justAnswered(NEWS, next), ['b']);
});

test('labels: hms, his day, the channel\'s day', () => {
  assert.equal(hms(4198), '1:09:58');
  assert.equal(hms(2280), '38:00');
  assert.equal(hms(5), '0:05');
  assert.equal(ymdLabel('2026-11-19'), '19 Nov');
  assert.equal(videoDay('2026-11-20T15:00:23.000Z', false), '20 Nov');
  assert.equal(videoDay('2025-06-03T00:00:00.000Z', true), 'Jun 2025');
});

test('the note over an item\'s transcript: an idea in the read\'s words, a method as when to use it, nothing when there is no text', () => {
  assert.equal(noteOf({ kind: 'idea', text: ' Say what you sense. ' }), 'Say what you sense.');
  assert.equal(noteOf({ kind: 'framework', text: 'you must make an uncomfortable ask.' }), 'Use when: you must make an uncomfortable ask.');
  assert.equal(noteOf({ kind: 'framework', text: '' }), null);
  assert.equal(noteOf(null), null);
});
