// The front door's ledger: what he GAVE the platform (videos, studies,
// research), read deterministically off the inbox rails. Born from a real
// failure — "what's the last video I gave you?" answered from chat memory
// because nothing in the ask context carried the platform record.
// Temp data dir BEFORE imports.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-activity-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { createRecord } = await import('../lib/inboxStore.js');
const { platformActivityContext } = await import('../lib/platformActivity.js');
const { resumedRefreshContext } = await import('../lib/askContext.js');

test.after(async () => { await rm(process.env.NOVA_DATA_DIR, { recursive: true, force: true }); });

test('quiet rails → no section, never an invented history', async () => {
  assert.equal(await platformActivityContext(), null);
});

test('the ledger carries his lanes newest-first, with status and result — and skips the fleet noise', async () => {
  const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600e3).toISOString();
  await createRecord({ id: 'v1', kind: 'video', text: 'Watch: https://youtu.be/abc — is this legit?', status: 'pending', createdAt: iso(30), decision: { title: 'Coach verdict — creatine timing' } });
  await createRecord({ id: 'd1', kind: 'dispatch', text: 'Morning Dispatch — noise', status: 'pending', createdAt: iso(4) });
  await createRecord({ id: 's1', kind: 'study', text: 'Study: analyse this creator', studyUrls: ['https://youtube.com/@wisetwinz'], status: 'classifying', createdAt: iso(2) });

  const out = await platformActivityContext();
  assert.ok(out.includes('WHAT HE HAS GIVEN THE PLATFORM LATELY'), 'the framing header is the instruction');
  assert.ok(out.includes('the whole platform is your memory'), 'second-brain directive rides the block');
  const studyAt = out.indexOf('analyse this creator');
  const videoAt = out.indexOf('youtu.be/abc');
  assert.ok(studyAt > 0 && videoAt > 0, 'both lanes present');
  assert.ok(studyAt < videoAt, 'newest first — the study he gave 2h ago beats the 30h-old video');
  assert.ok(out.includes('still running'), 'a classifying study says so honestly');
  assert.ok(out.includes('Coach verdict — creatine timing'), 'a finished lane names its result');
  assert.ok(!out.includes('Morning Dispatch'), 'fleet-generated records are not things HE gave the platform');
});

test('a resumed turn gets the ledger as its live refresh — the fix for the long-lived session', async () => {
  const out = await resumedRefreshContext();
  assert.ok(out.includes('WHAT HE HAS GIVEN THE PLATFORM LATELY'), 'resumed turns see the platform record');
});

// ---- [04] plan 7: honest totals — count before slicing, name the cap ----
test('the ledger and the digest say "N of M shown" when the cap bites, and where the rest are', async () => {
  const { listRecords } = await import('../lib/inboxStore.js');
  const { inboxDigestContext } = await import('../lib/platformActivity.js');
  const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600e3).toISOString();
  for (let i = 0; i < 12; i++) {
    await createRecord({ id: `cap${i}`, kind: 'video', text: `Watch: https://youtu.be/cap${i}`, status: 'pending', createdAt: iso(100 + i), decision: { title: `Verdict ${i}`, payload: { body: `body ${i}` } } });
  }
  const all = await listRecords();
  const laneTotal = all.filter((r) => ['video', 'study', 'research'].includes(r.kind)).length;
  const pendingTotal = all.filter((r) => r.status === 'pending').length;
  assert.ok(laneTotal > 8 && pendingTotal > 10, 'the fixtures exceed both caps');
  const ledger = await platformActivityContext();
  assert.match(ledger, new RegExp(`8 of ${laneTotal} shown — the rest are on the Ops screen`));
  assert.equal((ledger.match(/^- /gm) || []).length, 8, 'still only eight lines');
  const digest = await inboxDigestContext();
  assert.match(digest, new RegExp(`10 of ${pendingTotal} shown — the rest are in his Inbox`));
});
