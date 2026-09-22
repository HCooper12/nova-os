// THE JUDGEMENT, PINNED. These are the rules the Ops list is built on, and
// the one that matters most is the lesson that made the file: a session is
// alive or not by when someone LAST SPOKE in it, never by how old its window
// is. `readLast` and `now` are both injected, so no test here touches the
// real home folder or the real clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  judge, describe, summarise, projectOf, agoWords, plainFor,
  projectSlug, transcriptPath, STALE_AFTER_MS,
} from '../lib/claudeSessions.js';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const ago = (ms) => NOW - ms;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const interactive = (over = {}) => ({ sessionId: 's1', kind: 'interactive', pid: 101, status: 'idle', cwd: '/Users/h/Claude Projects/nova-os', name: 'A session', startedAt: ago(9 * DAY), ...over });
const background = (over = {}) => ({ sessionId: 'b1', kind: 'background', id: 'ab12', state: 'idle', cwd: '/Users/h/Claude Projects/atlas-partner', name: 'A job', startedAt: ago(2 * HOUR), ...over });

test('the nine-day-old window spoken in an hour ago is WAITING, and at three days is LEFT OPEN', () => {
  // The exact failure this file was written against: the first version read
  // startedAt and called five live sessions abandoned.
  const agents = [interactive({ startedAt: ago(9 * DAY) })];

  const recent = describe(agents, { now: NOW, readLast: () => ago(1 * HOUR) });
  assert.equal(recent[0].state, 'waiting');
  assert.equal(recent[0].plain, 'Waiting for you: it has something to say or a question.');
  assert.equal(recent[0].canShow, true);
  assert.equal(recent[0].canClose, false, 'a hand still raised must not be closable');

  const old = describe(agents, { now: NOW, readLast: () => ago(3 * DAY) });
  assert.equal(old[0].state, 'left-open');
  assert.equal(old[0].canClose, true);
  assert.match(old[0].plain, /^Left open\./);
});

test('busy is working whatever its age, and a busy session is never closable', () => {
  const out = describe([interactive({ status: 'busy', startedAt: ago(30 * DAY) })], { now: NOW, readLast: () => ago(20 * DAY) });
  assert.equal(out[0].state, 'working');
  assert.equal(out[0].plain, 'Working now.');
  assert.equal(out[0].canClose, false);
});

test('a background session with no journal at all is gone, and a blocked one is stuck', () => {
  const gone = describe([background()], { now: NOW, readLast: () => null });
  assert.equal(gone[0].state, 'gone');
  assert.equal(gone[0].canShow, false);
  assert.equal(gone[0].canClose, true);
  assert.equal(gone[0].shortId, 'ab12');

  const stuck = describe([background({ state: 'blocked' })], { now: NOW, readLast: () => ago(10 * 60 * 1000) });
  assert.equal(stuck[0].state, 'blocked');
  assert.equal(stuck[0].plain, 'Stuck and needs you.');
});

test('judge draws the stale line exactly at the twelve-hour mark', () => {
  const a = interactive();
  assert.equal(judge(a, { lastAt: ago(STALE_AFTER_MS - 1000), now: NOW }).state, 'waiting');
  assert.equal(judge(a, { lastAt: ago(STALE_AFTER_MS + 1000), now: NOW }).state, 'left-open');
  // with no journal at all, an interactive session falls back to its start
  assert.equal(judge(interactive({ startedAt: ago(9 * DAY) }), { lastAt: null, now: NOW }).state, 'left-open');
});

test('hands raised sort to the top, quiet windows to the bottom', () => {
  const out = describe([
    interactive({ sessionId: 'open', startedAt: ago(9 * DAY) }),
    interactive({ sessionId: 'busy', status: 'busy' }),
    background({ sessionId: 'stuck', state: 'blocked' }),
    interactive({ sessionId: 'asking' }),
  ], {
    now: NOW,
    readLast: (cwd, id) => (id === 'open' ? ago(3 * DAY) : ago(20 * 60 * 1000)),
  });
  assert.deepEqual(out.map((s) => s.sessionId), ['stuck', 'asking', 'busy', 'open']);
});

test('the one-line summary counts hands first and left-open windows last', () => {
  const sessions = describe([
    interactive({ sessionId: 'a', status: 'busy' }),
    interactive({ sessionId: 'b' }),
    interactive({ sessionId: 'c', startedAt: ago(9 * DAY) }),
  ], { now: NOW, readLast: (cwd, id) => (id === 'c' ? ago(3 * DAY) : ago(10 * 60 * 1000)) });
  assert.equal(summarise(sessions), '1 working, 1 waiting for you, 1 left open');
  assert.equal(summarise([]), 'Nothing is running.');
  const quiet = describe([interactive({ startedAt: ago(9 * DAY) })], { now: NOW, readLast: () => ago(5 * DAY) });
  assert.equal(summarise(quiet), 'Nothing is working. 1 window left open.');
});

test('a working directory is named the way a person names the project', () => {
  assert.deepEqual(projectOf('/Users/h/Claude Projects/Atomic_Hub/P3/x'), { key: 'Atomic_Hub', label: 'Science Atlas' });
  assert.deepEqual(projectOf('/Users/h/Claude Projects/atlas-partner'), { key: 'atlas-partner', label: 'Wren' });
  assert.deepEqual(projectOf('/Users/h/Claude Projects/nova-os'), { key: 'nova-os', label: 'Nova' });
  assert.deepEqual(projectOf('/Users/h/Claude Projects/some_other-thing'), { key: 'some_other-thing', label: 'some other thing' });
  assert.equal(projectOf('').label, 'somewhere');
});

test('time is said the way a person says it, never as a raw count', () => {
  assert.equal(agoWords(30 * 1000), 'just now');
  assert.equal(agoWords(60 * 60 * 1000), 'about 60 minutes ago');
  assert.equal(agoWords(5 * HOUR), 'about 5 hours ago');
  assert.equal(agoWords(3 * DAY), 'about 3 days ago');
  assert.equal(plainFor('left-open', 'about 3 days ago'), 'Left open. Nothing has happened in it for 3 days.');
});

test('the journal path is the CLI’s own flattening of the working directory', () => {
  assert.equal(projectSlug('/Users/h/Claude Projects/nova-os'), '-Users-h-Claude-Projects-nova-os');
  assert.equal(
    transcriptPath('/Users/h/Claude Projects/nova-os', 'abc', '/home'),
    '/home/.claude/projects/-Users-h-Claude-Projects-nova-os/abc.jsonl',
  );
});
