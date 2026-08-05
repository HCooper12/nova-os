// Weekly Debrief — config, prompt contract, compose normalization, context
// assembly. The model spawn isn't exercised, same as the other agent suites.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-debrief-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-debrief-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { getDebriefConfig, setDebriefConfig, buildDebriefPrompt, composeDebriefText, buildDebriefContext, latestDebriefContext } = await import('../lib/weeklyDebrief.js');
const { createRecord } = await import('../lib/inboxStore.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('config: draft/Sunday/17 default, patch + validate', async () => {
  assert.deepEqual(await getDebriefConfig(), { mode: 'draft', weekday: 0, hour: 17 });
  assert.deepEqual(await setDebriefConfig({ mode: 'auto', weekday: 6, hour: 18 }), { mode: 'auto', weekday: 6, hour: 18 });
  const bad = await setDebriefConfig({ mode: 'nonsense', weekday: 9, hour: 99 });
  assert.deepEqual(bad, { mode: 'auto', weekday: 6, hour: 18 }); // invalid patch changes nothing
  await setDebriefConfig({ mode: 'draft', weekday: 0, hour: 17 });
});

test('prompt: the coach sit-down shape — week vs plan, honest, typed JSON', () => {
  const p = buildDebriefPrompt('TRAINING THIS WEEK: 3 sessions.');
  assert.ok(p.startsWith('NOVA OPERATING LENS'));
  assert.match(p, /WEEKLY DEBRIEF/);
  assert.match(p, /wins and drift/i);
  assert.match(p, /journal words outrank metrics/i);
  assert.match(p, /"wins"/);
  assert.match(p, /"changes"/);
  assert.match(p, /"question"/);
  assert.match(p, /3 sessions/);
});

test('compose: builds the debrief, caps lists, refuses empty', () => {
  const { title, text } = composeDebriefText({
    read: 'Three of four sessions landed; protein slipped midweek.',
    wins: ['Bench moved +2.5kg', '', 'Slept 7h+ five nights'],
    changes: [
      { do: 'Front-load protein at breakfast', why: 'floor missed on training days' },
      { do: '', why: 'ignored' },
      { do: 'Book Thursday session in the calendar', why: 'the unplanned day is the one that slips' },
      { do: 'A third change', why: 'fine' },
      { do: 'A fourth that must drop', why: 'over cap' },
    ],
    question: 'Which session this week felt best, and why?',
  }, new Date('2026-08-09T17:00:00'));
  assert.equal(title, 'Weekly Debrief — week ending Sunday 09 August');
  assert.match(text, /\*\*The week\.\*\*/);
  assert.match(text, /- Bench moved \+2\.5kg/);
  assert.match(text, /1\. Front-load protein at breakfast — floor missed/);
  assert.match(text, /3\. A third change/);
  assert.ok(!text.includes('A fourth'));
  assert.match(text, /\*\*To sit with\.\*\* Which session/);

  assert.throws(() => composeDebriefText({}), /came back empty/);
});

test('context assembles without throwing on an empty vault', async () => {
  const ctx = await buildDebriefContext(vault, new Date('2026-08-09T17:00:00'));
  assert.equal(typeof ctx, 'string');
});

test('latestDebriefContext surfaces the newest debrief for conversations', async () => {
  assert.equal(await latestDebriefContext(), '');
  await createRecord({
    id: 'wd-test1', kind: 'weekly-debrief', text: 'Weekly Debrief — week ending Sunday 02 August',
    source: 'coach', mode: 'draft', status: 'filed', createdAt: '2026-08-02T07:00:00.000Z',
    decision: { route: 'journal', confidence: 'high', title: 'Weekly Debrief', payload: { text: 'Old week.', category: 'training', label: 'Weekly debrief' } },
  });
  await createRecord({
    id: 'wd-test2', kind: 'weekly-debrief', text: 'Weekly Debrief — week ending Sunday 09 August',
    source: 'coach', mode: 'draft', status: 'pending', createdAt: '2026-08-09T07:00:00.000Z',
    decision: { route: 'journal', confidence: 'high', title: 'Weekly Debrief', payload: { text: 'Newest week: bench up, protein down.', category: 'training', label: 'Weekly debrief' } },
  });
  const ctx = await latestDebriefContext();
  assert.match(ctx, /Newest week: bench up/);
  assert.ok(!ctx.includes('Old week'));
});
