// Finding a form video for the 105 exercises that had none.
//
// He chose "curated + verified links found by the Researcher". At that lane's
// $1 ceiling that is 105 runs — about $105 for a job a search engine does for
// nothing. This is the free deterministic path: no model, no cost, and the
// same class of result. The tests cover the only quality claim it makes, which
// is the filtering.
//
// It SEARCHES, it does not curate. Nothing here writes to his vault; the
// candidates are proposed for review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResults, pickVideo, searchQuery, MIN_SECONDS, MAX_SECONDS, PREFERRED } from '../lib/exerciseVideos.js';

test('a Short is never chosen — vertical, musicked, no cues', () => {
  const r = parseResults('aaa|Some Guy|35|Quick clip');
  assert.equal(pickVideo(r), null, `${MIN_SECONDS}s is the floor`);
});

test('an hour-long podcast that mentions the lift is never chosen', () => {
  const r = parseResults('ccc|A Podcast|5400|Three hours on training');
  assert.equal(pickVideo(r), null, `${MAX_SECONDS}s is the ceiling`);
});

test('a technique tutorial in the band is chosen', () => {
  const v = pickVideo(parseResults('bbb|Some Coach|240|How to Romanian Deadlift'));
  assert.equal(v.url, 'https://www.youtube.com/watch?v=bbb');
  assert.equal(v.preferred, false);
});

test('a preferred channel wins over an earlier result', () => {
  const v = pickVideo(parseResults([
    'aaa|Random Channel|200|RDL tutorial',
    'bbb|ATHLEAN-X™|351|Stop F*cking Up RDLs',
  ].join('\n')));
  assert.equal(v.channel, 'ATHLEAN-X™');
  assert.equal(v.preferred, true);
});

test('but a preferred channel outside the duration band does not win', () => {
  // the filter comes first — a two-second clip from a good channel is still
  // not a form video
  const v = pickVideo(parseResults([
    'aaa|Random Channel|200|RDL tutorial',
    'bbb|ATHLEAN-X™|20|RDL short',
  ].join('\n')));
  assert.equal(v.channel, 'Random Channel');
});

test('a malformed line does not lose the rest of the results', () => {
  const r = parseResults('garbage\n\nbbb|Coach|240|Real result\n|||');
  assert.equal(r.length, 1);
  assert.equal(pickVideo(r).url, 'https://www.youtube.com/watch?v=bbb');
});

test('titles containing a pipe survive', () => {
  const r = parseResults('bbb|Coach|240|How to do the RDL | 2 Minute Tutorial');
  assert.equal(r[0].title, 'How to do the RDL | 2 Minute Tutorial');
});

test('no results at all is null, not a guess', () => {
  assert.equal(pickVideo(parseResults('')), null);
  assert.equal(pickVideo([]), null);
  assert.equal(pickVideo(parseResults('aaa|Chan|notanumber|No duration')), null);
});

test('given the exercise name, a candidate that does not name the movement is refused', () => {
  // the ranked-first bandsaw tutorial, as the daily job saw it
  const r = parseResults('eSU57qxD2F4|Carter Products|226|Master Your Bandsaw: The Ultimate 6 - Step Setup Guide');
  assert.equal(pickVideo(r, 'Carter Extension'), null);
  // and a real one is still picked
  const ok = parseResults('c2pWqsHR7FU|Barbell Logic|372|Best Hamstring Exercise? How To Perform Glute Ham Raises');
  assert.equal(pickVideo(ok, 'Glute-Ham Raise').channel, 'Barbell Logic');
  // without a name the old behaviour holds, so the pure ranking tests above still mean what they say
  assert.equal(pickVideo(r).channel, 'Carter Products');
});

test('the query asks for technique, not the lift in general', () => {
  const q = searchQuery('Romanian Deadlift');
  assert.match(q, /^ytsearch5:/);
  assert.match(q, /proper form technique tutorial/);
  assert.match(q, /Romanian Deadlift/);
});

test('the preferred list stays short enough to be a real judgement', () => {
  // a long list would imply a verdict on everyone left off it
  assert.ok(PREFERRED.length <= 8, 'this is a preference, not a ranking of the internet');
});
