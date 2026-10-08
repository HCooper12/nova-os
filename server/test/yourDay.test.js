// CONSOLE MOVED TO HOME (mockup 86, his pick of 9 Oct 2026): the five
// instruments are the summary Home's morning card "Your day, drawn", and the
// #/console page and its Index row are gone. These hold both halves: the
// route cannot quietly come back, and the card cannot quietly disappear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREEN_KEYS } from '../../src/screenKeys.js';
import { INDEX_GROUPS, ROW_META } from '../../src/indexGroups.js';
import { dayCardShows, inMorning, DAY_KEYS } from '../../src/dayCard.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFile(path.join(ROOT, f), 'utf8');

test('the Console route, its screen and its Index row are gone', async () => {
  assert.ok(!SCREEN_KEYS.includes('console'), 'console is still a screen key');
  assert.ok(!INDEX_GROUPS.some((g) => g.rows.includes('console')), 'console still has an Index row');
  assert.equal(ROW_META.console, undefined);
  await assert.rejects(access(path.join(ROOT, 'src/screens/ConsoleScreen.jsx')), 'ConsoleScreen.jsx still exists');
  const app = await read('src/App.jsx');
  assert.doesNotMatch(app, /ConsoleScreen|isConsole/);
  const chrome = await read('src/vals/valsChrome.js');
  assert.doesNotMatch(chrome, /mkNav\('Console'/, 'the Mac sidebar still has a Console row');
});

test('the summary Home draws Your day from the instruments, with Read again', async () => {
  const home = await read('src/screens/MissionSummary.jsx');
  assert.match(home, /<YourDay data=\{d\.data\} loading=\{d\.loading\} error=\{d\.error\} onRefresh=\{d\.refresh\}/);
  assert.match(home, /S\.yourDay && !S\.yourDay\.pinned && <YourDayCard/, 'the morning card is not at the head of Home');
  assert.match(home, /case 'day': return <YourDayCard/, 'the pinned card is not in the grid');
  const vm = await read('src/vals/valsSummary.js');
  assert.match(vm, /data: m\.instruments \|\| null/);
  assert.match(vm, /refresh: demoMode \? null : m\.refreshInstruments/);
  const ins = await read('src/Instruments.jsx');
  assert.match(ins, /export function YourDay\(/);
  assert.match(ins, /'Read again'/);
  // the cupertino Home is untouched: it never draws the card
  const cup = await read('src/screens/MissionStructured.jsx');
  assert.doesNotMatch(cup, /YourDay/);
});

test('every chart on the card carries a VoiceOver label', async () => {
  const ins = await read('src/Instruments.jsx');
  const card = ins.slice(ins.indexOf('the Home card'));
  const svgs = card.match(/<svg viewBox=[^>]*>/g) || [];
  const charts = svgs.filter((s) => !/aria-hidden/.test(s));
  assert.equal(charts.length, 4, 'four charts (recovery, the day, the week, protein)');
  for (const s of charts) assert.match(s, /role="img" aria-label=\{label\}/, s);
});

test('the card shows in the morning until all five are seen, or all day when pinned', () => {
  assert.deepEqual(DAY_KEYS, ['vitals', 'day', 'week', 'body', 'fuel']);
  assert.equal(inMorning(4), false);
  assert.equal(inMorning(5), true);
  assert.equal(inMorning(10), true);
  assert.equal(inMorning(11), false);
  assert.equal(dayCardShows({ hour: 7, pinned: false, seenAll: false }), true);
  assert.equal(dayCardShows({ hour: 7, pinned: false, seenAll: true }), false);
  assert.equal(dayCardShows({ hour: 14, pinned: false, seenAll: false }), false);
  assert.equal(dayCardShows({ hour: 14, pinned: true, seenAll: true }), true);
});
