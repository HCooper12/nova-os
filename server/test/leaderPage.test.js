// THE LEADER PAGE'S WORDS — Blend 1's copy, written by code from the record.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shortName, staleLine, pictureSentence, sinceWords, readReply, buildThread, clockLabel, ageDays,
} from '../../src/vals/leaderPage.js';

const at = (s) => new Date(s);

test('a short name is his own opening words, never a model\'s', () => {
  assert.equal(shortName('Two leads disagree about the new booking process and each comes to me alone'), 'Two leads disagree about the new…');
  assert.equal(shortName('the rota is mine alone'), 'The rota is mine alone');
  assert.equal(shortName('Feedback in the moment lands as criticism, but if I wait it goes stale'), 'Feedback in the moment lands as…');
  assert.equal(shortName('Delegating, again.'), 'Delegating…');
  assert.equal(shortName(''), '');
});

test('the honest line, in the Leader\'s voice', () => {
  const now = at('2026-10-10T14:20:00');
  assert.equal(staleLine(9, '2026-10-01T09:00:00', now), 'You last told me anything 9 days ago.');
  assert.equal(staleLine(5, '2026-10-05T09:00:00', now), 'You last told me anything on Monday, 5 days ago.');
  assert.equal(staleLine(0, null, now), 'You told me something today.');
  assert.equal(staleLine(null, null, now), 'You have not told me anything yet.');
});

test('the picture\'s sentence counts from the lists', () => {
  assert.equal(pictureSentence({ open: 7, lastToldDays: 9 }), 'Seven things open, and nothing new from you for nine days.');
  assert.equal(pictureSentence({ open: 6, lastToldDays: 0, downToday: 1 }), 'Six things open. You set one down today.');
  assert.equal(pictureSentence({ open: 1, lastToldDays: 3 }), 'One thing open, and nothing new from you for three days.');
  assert.equal(pictureSentence({ open: 0, lastToldDays: 2 }), 'Nothing open.');
});

test('since words', () => {
  const now = at('2026-10-05T12:40:00'); // a Monday
  assert.equal(sinceWords('2026-10-02T08:00:00', now), 'since Friday');
  assert.equal(sinceWords('2026-10-04T20:00:00', now), 'since yesterday');
  assert.equal(sinceWords('2026-10-05T09:12:00', now), 'since 09:12');
  assert.equal(sinceWords('2026-09-20T09:12:00', now), 'since 20 Sep');
  assert.equal(clockLabel(at('2026-10-05T07:10:00')), 'Monday 07:10');
  assert.equal(ageDays('2026-09-18T12:00:00', at('2026-10-01T12:40:00')), 13);
});

test('a reply reads with its hand-over folded and the news in the lead', () => {
  const r = readReply('Asking the Researcher and the Librarian.\n\nMake the read-back someone else\'s job. Ask a different person each week.\nVIS {"kind":"key"}', {
    consult: [{ agent: 'researcher' }], clean: (t) => t.replace(/^\s*VIS\s*\{.*\}\s*$/gm, ''),
  });
  assert.equal(r.hand, 'Asking the Researcher and the Librarian.');
  assert.equal(r.lead, 'Make the read-back someone else\'s job.');
  assert.equal(r.rest, 'Ask a different person each week.');
  // no consult: nothing is folded away
  assert.equal(readReply('Asking a question is fine. Yes.').hand, null);
});

test('the conversation, kept: thread, this visit, and each morning\'s idea, by time, with slivers', () => {
  const now = at('2026-10-05T07:10:00');
  const thread = [
    { id: 'a', who: 'you', at: '2026-09-15T09:00:00', text: 'How do I do that?' },
    { id: 'b', who: 'leader', at: '2026-09-15T09:01:00', text: 'Like this.', seenAt: '2026-09-15T09:02:00' },
  ];
  const chat = [{ who: 'you', at: at('2026-09-15T09:00:10').getTime(), text: 'How do I do that?' }, { who: 'you', at: now.getTime(), text: 'New line' }];
  const ideas = [{ date: '2026-10-05', title: 'Close the loop', createdAt: '2026-10-05T07:00:00' }];
  const out = buildThread({ thread, chat, ideas, now });
  assert.deepEqual(out.map((x) => x.kind), ['sliver', 'me', 'leader', 'sliver', 'idea', 'me']);
  assert.equal(out[0].text, '15 Sep');
  assert.equal(out[3].text, 'Today');
  // the line already kept is not shown twice
  assert.equal(out.filter((x) => x.kind === 'me' && x.text === 'How do I do that?').length, 1);
  // New conversation: a boundary hides what came before it
  const fresh = buildThread({ thread, chat: [], ideas, since: '2026-10-01T00:00:00', now });
  assert.deepEqual(fresh.map((x) => x.kind), ['sliver', 'idea']);
});

test('the last time you talked is named on its day', () => {
  const now = at('2026-10-05T07:10:00');
  const out = buildThread({ thread: [{ id: 'a', who: 'you', at: '2026-09-15T09:00:00', text: 'x' }], now });
  assert.equal(out[0].text, '15 Sep · the last time you talked');
});
