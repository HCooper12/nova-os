// Daily Review — temp dirs BEFORE imports. Tests the pure/testable parts
// (config, prompt contract, normalize, context assembly); the model spawn
// itself isn't exercised, same as the other agent suites.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-review-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-review-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { getReviewConfig, setReviewConfig, buildReviewPrompt, composeReviewText, buildReviewContext } = await import('../lib/dailyReview.js');
const { saveDay } = await import('../lib/healthData.js');
const { setProfile } = await import('../lib/profile.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('config: draft/8 default, patch + validate', async () => {
  assert.deepEqual(await getReviewConfig(), { mode: 'draft', hour: 8 });
  assert.deepEqual(await setReviewConfig({ mode: 'auto', hour: 7 }), { mode: 'auto', hour: 7 });
  const bad = await setReviewConfig({ mode: 'nonsense', hour: 99 });
  assert.deepEqual(bad, { mode: 'auto', hour: 7 }); // invalid patch changes nothing
  await setReviewConfig({ mode: 'draft', hour: 8 });
});

test('prompt: reasons through the lens, is cross-domain, and asks for typed JSON', () => {
  const p = buildReviewPrompt('TODAY: HRV 90, protein 0g against 150g floor.');
  assert.ok(p.startsWith('NOVA OPERATING LENS'));
  assert.match(p, /DAILY REVIEW/);
  assert.match(p, /only surface what genuinely warrants/i);
  assert.match(p, /never manufacture problems/i);
  assert.match(p, /"read"/);
  assert.match(p, /"adjustments"/);
  assert.match(p, /HRV 90/);
});

test('compose: normalizes read + adjustments, caps at 3, drops empties, refuses empty', () => {
  const { title, text } = composeReviewText({
    read: 'Recovery is strong; fuel is the gap.',
    adjustments: [
      { do: 'Log breakfast before Push day', why: 'protein floor unmet 3 days' },
      { do: '', why: 'ignored — no action' },
      { do: 'Bank an early night', why: 'sleep debt building' },
      { do: 'Ship the video draft', why: 'priority slipping' },
      { do: 'A fourth that must be dropped', why: 'over the cap' },
    ],
  }, new Date('2026-07-19T08:00:00'));
  assert.match(title, /Daily Review — /);
  assert.match(text, /\*\*Read\.\*\* Recovery is strong/);
  assert.match(text, /1\. Log breakfast before Push day — protein floor unmet 3 days/);
  assert.match(text, /3\. Ship the video draft/);
  assert.doesNotMatch(text, /A fourth/); // capped at 3
  assert.doesNotMatch(text, /ignored/); // empty do dropped

  assert.throws(() => composeReviewText({ read: '', adjustments: [] }), /came back empty/);
});

test('context assembly: composes the cross-domain picture, honestly, without throwing', async () => {
  await saveDay('2026-07-18', { hrv: 90, restingHeartRate: 52, steps: 8000 });
  await setProfile(vault, { focus: 'Lean muscle + content', priorities: ['78kg', 'weekly video'] });
  const ctx = await buildReviewContext(vault, new Date('2026-07-19T08:00:00'));
  assert.ok(ctx.length > 0);
  assert.match(ctx, /ABOUT HAYDEN/); // profile first
  assert.match(ctx, /TODAY'S PICTURE/); // deterministic composer folded in
  assert.match(ctx, /RECOVERY\/DELOAD SIGNAL/);
});
