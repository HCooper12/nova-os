// Calendar hide-list persistence — temp data dir BEFORE imports.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-calprefs-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { loadCalendarPrefs, saveCalendarPrefs } = await import('../lib/calendar.js');

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

test('defaults to nothing hidden when no prefs exist', async () => {
  assert.deepEqual(await loadCalendarPrefs(), { hidden: [] });
});

test('saves and reloads the hidden list, de-duped', async () => {
  const url = 'https://caldav.icloud.com/123/calendars/work/';
  await saveCalendarPrefs([url, url, 'https://caldav.icloud.com/123/calendars/task/']);
  const { hidden } = await loadCalendarPrefs();
  assert.equal(hidden.length, 2, 'duplicates collapsed');
  assert.ok(hidden.includes(url));
});

test('coerces junk input to an empty list rather than throwing', async () => {
  assert.deepEqual(await saveCalendarPrefs(null), { hidden: [] });
  assert.deepEqual(await loadCalendarPrefs(), { hidden: [] });
});
