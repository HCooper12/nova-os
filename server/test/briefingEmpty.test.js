// Finding 20 (22 Sep 2026): the empty Briefing screen offers the real ways
// to ask. Each starter, with a topic in the blank, must route to the brief
// lane — otherwise the screen teaches him words that do nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeIntent } from '../lib/intentRouter.js';
import { BRIEFING_STARTERS, starterLabel } from '../../src/briefingStarters.js';

test('every starter phrasing on the empty Briefing screen routes to a briefing', () => {
  for (const s of BRIEFING_STARTERS) {
    const text = `${s.phrase}creatine timing for hypertrophy${s.tail || ''}`;
    const routed = routeIntent(text);
    assert.equal(routed.lane, 'brief', `${JSON.stringify(text)} routed to ${routed.lane}`);
  }
});

test('a starter label shows the blank where his topic goes', () => {
  assert.equal(starterLabel({ phrase: 'Brief me on ' }), 'Brief me on …');
  assert.equal(starterLabel({ phrase: 'Research ', tail: ' and write me a report' }), 'Research … and write me a report');
});

test('the empty state is the house head on the stage, not a paragraph', () => {
  const src = readFileSync(new URL('../../src/screens/Briefing.jsx', import.meta.url), 'utf8');
  const empty = src.slice(src.indexOf('if (b.empty && !b.error)'), src.indexOf('if (b.loading'));
  assert.match(empty, /<ScreenHead numeral="XVII\."/);
  assert.match(empty, /<Glass visual=\{\{ kind: 'title'/, 'the stage stands at rest');
  assert.match(empty, /b\.starters\.map/);
  assert.match(empty, /b\.recent/);
  assert.doesNotMatch(empty, /padding:40px 20px/, 'the old off-grid padding is gone');
});
