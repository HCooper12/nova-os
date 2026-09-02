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

const { getDebriefConfig, setDebriefConfig, buildDebriefPrompt, composeDebriefText, buildDebriefContext, latestDebriefContext, debriefWeekFor, recordWeekStart, weekChangesContext } = await import('../lib/weeklyDebrief.js');
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

test('"RECOVERY THIS WEEK" is this week — and the rolling nutrition window says "last 7 days"', async () => {
  // health days straddling the Monday: three before, two in the week
  const { mkdir: mk, writeFile: wf } = await import('node:fs/promises');
  await mk(path.join(dataDir, 'health'), { recursive: true });
  for (const d of ['2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11']) {
    await wf(path.join(dataDir, 'health', `${d}.json`), JSON.stringify({ date: d, steps: 8000, hrv: 60, receivedAt: `${d}T21:00:00` }), 'utf8');
  }
  const ctx = await buildDebriefContext(vault, new Date('2026-08-12T17:00:00')); // a Wednesday
  assert.match(ctx, /RECOVERY THIS WEEK \(avgs over 2 logged days\)/, 'a `|| true` used to make this a rolling last-7 under a "THIS WEEK" label');
  assert.match(ctx, /NUTRITION, LAST 7 DAYS/, 'the nutrition log has no week key — the label says what the window is');
  assert.doesNotMatch(ctx, /NUTRITION THIS WEEK/);
});

// ---- [15] plans 1, 2, 4: the drafted week plan in the context; changes ride the record; the missed-week catch-up ----
test('debriefWeekFor: this week once the slot has passed, last week for two days after a missed slot, otherwise nothing', () => {
  const cfg = { weekday: 0, hour: 17 }; // Sunday 17:00
  const at = (s) => new Date(s);
  assert.equal(debriefWeekFor(at('2026-09-05T18:00:00'), cfg, []), null, 'Saturday — not yet');
  assert.equal(debriefWeekFor(at('2026-09-06T16:59:00'), cfg, []), null, 'Sunday before the hour — not yet');
  // the week of Mon 31 Aug → Sun 6 Sep
  assert.deepEqual(debriefWeekFor(at('2026-09-06T17:00:00'), cfg, []), { weekStart: '2026-08-31', weekEnd: '2026-09-06', catchUp: false });
  const done = [{ kind: 'weekly-debrief', status: 'pending', weekStart: '2026-08-31', createdAt: '2026-09-06T17:20:00' }];
  assert.equal(debriefWeekFor(at('2026-09-06T19:00:00'), cfg, done), null, 'already debriefed this week');
  // the Mac slept through Sunday: Monday and Tuesday catch up for LAST week
  assert.deepEqual(debriefWeekFor(at('2026-09-07T08:30:00'), cfg, []), { weekStart: '2026-08-31', weekEnd: '2026-09-06', catchUp: true }, 'Monday → last week');
  assert.deepEqual(debriefWeekFor(at('2026-09-08T08:30:00'), cfg, []), { weekStart: '2026-08-31', weekEnd: '2026-09-06', catchUp: true }, 'Tuesday still catches up');
  assert.equal(debriefWeekFor(at('2026-09-09T08:30:00'), cfg, []), null, 'Wednesday — the moment has passed');
  assert.equal(debriefWeekFor(at('2026-09-07T08:30:00'), cfg, done), null, 'last week was debriefed — nothing to catch up');
  const legacy = [{ kind: 'weekly-debrief', status: 'filed', createdAt: '2026-09-06T17:20:00' }]; // no weekStart stamp
  assert.equal(recordWeekStart(legacy[0]), '2026-08-31', 'a legacy record is keyed by the Monday of its own week');
  assert.equal(debriefWeekFor(at('2026-09-07T08:30:00'), cfg, legacy), null);
  const failed = [{ kind: 'weekly-debrief', status: 'error', weekStart: '2026-08-31', createdAt: '2026-09-06T17:20:00' }];
  assert.ok(debriefWeekFor(at('2026-09-07T08:30:00'), cfg, failed)?.catchUp, 'an errored attempt is not a debrief');
});

test('compose returns the structured changes and titles a catch-up by the week it is FOR; the daily lanes read the standing changes', async () => {
  const parsed = { read: 'Solid week.', wins: ['Four sessions'], changes: [{ do: 'Front-load protein', why: 'floor missed 5 of 7' }, { do: 'Bed by 22:30', why: '' }], question: 'What would make Thursdays stick?' };
  const composed = composeDebriefText(parsed, new Date('2026-09-08T08:30:00'), { weekEnd: '2026-09-06' });
  assert.match(composed.title, /week ending Sunday 06 September/, 'the catch-up is titled by the week it debriefs, not the day it ran');
  assert.deepEqual(composed.changes, [{ do: 'Front-load protein', why: 'floor missed 5 of 7' }, { do: 'Bed by 22:30', why: '' }]);
  assert.equal(await weekChangesContext(new Date('2026-09-08T08:30:00')), '', 'no debrief on record → nothing');
  await createRecord({
    id: 'wdb0906', kind: 'weekly-debrief', weekStart: '2026-08-31', status: 'filed', text: composed.title, source: 'coach', mode: 'auto', createdAt: '2026-09-06T17:20:00',
    decision: { route: 'journal', confidence: 'high', title: composed.title, reason: 'x', payload: { text: composed.text, category: 'training', label: 'Weekly debrief', changes: composed.changes, weekStart: '2026-08-31' } },
  });
  const ctx = await weekChangesContext(new Date('2026-09-08T08:30:00'));
  assert.match(ctx, /STANDING CHANGES THIS WEEK \(set by the weekly debrief — check adherence, don't re-litigate them\):/);
  assert.match(ctx, /1\. Front-load protein — floor missed 5 of 7\n2\. Bed by 22:30/);
  assert.equal(await weekChangesContext(new Date('2026-09-20T08:30:00')), '', 'a fortnight later it is no longer this week\'s standing set');
});

test('the drafted week plan rides the debrief context for its week, and a discarded draft does not', async () => {
  await createRecord({
    id: 'wpl0907', kind: 'week-plan', status: 'filed', text: 'Week plan — 07 September', source: 'nova', mode: 'draft', createdAt: '2026-09-06T16:10:00',
    decision: { route: 'vault-note', confidence: 'high', title: 'Week plan — 07 September', reason: 'x', payload: { relPath: 'Wiki/Plans/Week of 2026-09-07.md', text: '# Week of 07 September\n- **Training:** Pull (9 exercises)\n- ⚠ **Conflict:** Workout 13:20 overlaps Work' } },
  });
  const ctx = await buildDebriefContext(vault, new Date('2026-09-13T17:00:00'));
  assert.match(ctx, /THE WEEK PLAN NOVA DRAFTED FOR THIS WEEK \(he approved it\)/);
  assert.match(ctx, /Conflict:\*\* Workout 13:20 overlaps Work/);
  assert.doesNotMatch(await buildDebriefContext(vault, new Date('2026-09-06T17:00:00')), /THE WEEK PLAN NOVA DRAFTED/, 'a plan for next week is not this week\'s');
  assert.doesNotMatch(await buildDebriefContext(vault, new Date('2026-09-13T17:00:00')), /week-plan FAILED/);
});
