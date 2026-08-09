// The shared brain: a deterministic fleet summary read off the inbox rails.
// One line per agent (newest receipt + count), a pending-pile line, honest
// silence when the rails are quiet. Temp data dir BEFORE imports.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-fleet-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { createRecord } = await import('../lib/inboxStore.js');
const { fleetContext } = await import('../lib/fleetContext.js');

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

test('quiet rails → no section, never invented activity', async () => {
  assert.equal(await fleetContext(), null);
});

test('recent receipts become one line per agent; the pending pile is counted honestly', async () => {
  const now = Date.now();
  const iso = (hoursAgo) => new Date(now - hoursAgo * 3600e3).toISOString();
  const mk = (kind, status, createdAt, title) => createRecord({
    id: Math.random().toString(36).slice(2, 10), kind, status, createdAt,
    text: title, source: 'test', mode: 'draft',
    ...(title ? { decision: { title } } : {}),
  });

  await mk('dispatch', 'pending', iso(2), 'Morning Brief — Sunday');
  await mk('dispatch', 'pending', iso(14), 'Saturday Evening Brief');
  await mk('coach', 'approved', iso(1), 'Session receipt — Upper Body');
  await mk('autonomy', 'pending', iso(30), 'Move Daily Review to auto'); // 30h — inside the 48h window
  await mk('review', 'pending', iso(24 * 5), 'An old review'); // outside the window: pending count only
  await mk('mystery-kind', 'pending', iso(1), 'Unknown agents stay out of the picture');

  const ctx = await fleetContext({ now });
  assert.match(ctx, /^THE FLEET LATELY/);
  assert.match(ctx, /- Dispatch: "Morning Brief — Sunday" — pending, 2h ago \(\+1 more\)/, 'newest receipt per agent, with the count');
  assert.match(ctx, /- Coach: "Session receipt — Upper Body" — approved, 1h ago/);
  assert.match(ctx, /- Trust Ladder: "Move Daily Review to auto" — pending, 1d ago/);
  assert.ok(!ctx.includes('An old review'), 'stale receipts stay out of the activity lines');
  assert.ok(!ctx.includes('Unknown agents'), 'unmapped kinds are excluded, not guessed at');
  // 5 pending seeded (2 dispatch + autonomy + old review + mystery)
  assert.match(ctx, /His Inbox holds 5 pending drafts awaiting review \(oldest 5d\)/);
});
