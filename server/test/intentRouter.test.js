// The front door's routing contract. A model never decides these — a
// misroute is worse than no front door, so every rule is pinned here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent } from '../lib/intentRouter.js';

const lane = (t) => routeIntent(t).lane;

test('a single video link goes to the Watcher', () => {
  assert.equal(lane('https://www.youtube.com/watch?v=MxMpcOqB8_o'), 'watch');
  assert.equal(lane('what do you make of https://youtu.be/abc123 ?'), 'watch');
  assert.equal(lane('https://www.instagram.com/reel/Db8psa6A0KK/'), 'watch');
});

test('a channel or profile link is a STUDY, not a watch', () => {
  assert.equal(lane('https://youtube.com/@wisetwinz'), 'study');
  assert.equal(lane('https://www.tiktok.com/@someone'), 'study');
});

test('his actual request from 19 Aug routes to study', () => {
  const r = routeIntent('analyse and research this user https://www.instagram.com/reel/Db8psa6A0KK/ their youtube channel is https://youtube.com/@wisetwinz note the differences');
  assert.equal(r.lane, 'study');
  assert.equal(r.urls.length, 2);
  assert.match(r.why, /creator|catalogue|body of work|several/);
});

test('a non-media link is research', () => {
  assert.equal(lane('https://pubmed.ncbi.nlm.nih.gov/12345678/'), 'research');
});

test('build requests become a Claude Code session', () => {
  assert.equal(lane('build me a widget for the train page'), 'code');
  assert.equal(lane('fix the bug in the fuel log bar'), 'code');
  assert.equal(lane('add a feature to nova that tracks water'), 'code');
});

test('training questions go to the Coach, general questions to Ask Nova', () => {
  assert.equal(lane('why is my bench stalled?'), 'coach');
  assert.equal(lane('should i deload this week'), 'coach');
  assert.equal(lane('what did I write about the distillation note'), 'ask');
  assert.equal(lane('how many steps yesterday'), 'ask');
});

test('captures are captures; research words win over a bare question', () => {
  assert.equal(lane('remind me to call the bank at 4pm'), 'capture');
  assert.equal(lane('buy oat milk'), 'capture');
  assert.equal(lane('research creatine timing and cite sources'), 'research');
});

test('every decision carries a human-readable why, and empty routes nowhere', () => {
  for (const t of ['https://youtube.com/@x', 'why is my squat stalled', 'build a thing', 'hello']) {
    assert.ok(routeIntent(t).why.length > 10, `no why for: ${t}`);
  }
  assert.equal(routeIntent('   ').lane, null);
});
