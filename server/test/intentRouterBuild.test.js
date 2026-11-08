// "BUILD" IS AN ORDER, NOT A THOUGHT (the reel test, 8 Nov 2026). Said
// thinking aloud, "I think we should build something with it" went to the
// Code screen; Rose adds one thought there. The Code lane takes "build" only
// when the sentence starts with it (after at most "Nova, can you / please"),
// or when Nova's own codebase is named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeIntent } from '../lib/intentRouter.js';

test('thinking aloud with the word build stays a conversation', () => {
  const t = 'So this thing started off as a Pomodoro timer, Nova, but now developers can write code for it. I think we should build something with it.';
  assert.notEqual(routeIntent(t)?.lane, 'code');
  assert.notEqual(routeIntent('we could build a little status light out of it one day')?.lane, 'code');
});

test('an order to build still runs as code', () => {
  assert.equal(routeIntent('Nova, build a test for the wall layout').lane, 'code');
  assert.equal(routeIntent('can you build the words toggle into the phone stage').lane, 'code');
  assert.equal(routeIntent('build this into Nova').lane, 'code');
  assert.equal(routeIntent('refactor the wall layout in nova').lane, 'code');
});
