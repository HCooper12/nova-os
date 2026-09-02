// The earned-autonomy engine: ledger arithmetic, the verdict thresholds
// (the trust ladder's actual judgment), proposal dedupe, and the agent-mode
// filer + undo applying a real config change.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-autonomy-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-autonomy-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { ledgerRow, verdict, proposeEarnedAutonomy, AUTONOMY_TARGETS } = await import('../lib/autonomyLedger.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');
const { createRecord } = await import('../lib/inboxStore.js');
const { getReviewConfig } = await import('../lib/dailyReview.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const mkRec = (kind, status, over = {}) => ({
  id: Math.random().toString(36).slice(2, 10), kind, status,
  createdAt: new Date().toISOString(), text: 'x', source: 'nova', mode: 'draft', ...over,
});

test('ledgerRow separates approved / auto / rejected / aged-out / undone', () => {
  const recs = [
    mkRec('review', 'filed'),                       // approved by him
    mkRec('review', 'filed', { auto: true }),       // auto-filed
    mkRec('review', 'discarded'),                   // actively rejected
    mkRec('review', 'discarded', { expired: true }), // aged out unread
    mkRec('review', 'undone'),
    mkRec('review', 'pending'),
    mkRec('dispatch', 'discarded', { slot: 'morning' }), // other kind — ignored
  ];
  const row = ledgerRow(recs, AUTONOMY_TARGETS.review);
  assert.deepEqual(row, { made: 6, approved: 1, auto: 1, rejected: 1, agedOut: 1, undone: 1, pending: 1 });
});

test('verdict: dead gate proposes auto; engaged gate stays; premature auto proposes draft', () => {
  // 20 made, none approved, 18 dead → auto
  const dead = verdict({ made: 20, approved: 0, auto: 0, rejected: 4, agedOut: 14, undone: 0, pending: 2 }, 'draft');
  assert.equal(dead?.to, 'auto');
  assert.match(dead.evidence, /14 aged out unread/);
  // he approves some → no proposal (the gate is doing work)
  assert.equal(verdict({ made: 20, approved: 3, auto: 0, rejected: 10, agedOut: 5, undone: 0, pending: 2 }, 'draft'), null);
  // thin sample → no verdict
  assert.equal(verdict({ made: 10, approved: 0, auto: 0, rejected: 9, agedOut: 0, undone: 0, pending: 1 }, 'draft'), null);
  // auto being undone 30%+ → back to draft
  const back = verdict({ made: 20, approved: 0, auto: 14, rejected: 0, agedOut: 0, undone: 6, pending: 0 }, 'auto');
  assert.equal(back?.to, 'draft');
});

test('proposeEarnedAutonomy files a real proposal once, and the filer applies + undoes the mode', async () => {
  // seed a dead-gate history for the Daily Review (draft mode by default)
  for (let i = 0; i < 16; i++) await createRecord(mkRec('review', 'discarded', { expired: true }));
  const first = await proposeEarnedAutonomy();
  const reviewProposal = first.find((p) => p.decision.payload.target === 'review');
  assert.ok(reviewProposal, 'expected a review→auto proposal');
  assert.equal(reviewProposal.decision.payload.to, 'auto');
  assert.equal(reviewProposal.mode, 'review-all'); // an autonomy change is ALWAYS his call

  // running again proposes nothing new for the same target (pending dedupe)
  const second = await proposeEarnedAutonomy();
  assert.ok(!second.some((p) => p.decision.payload.target === 'review'));

  // approving applies the config change deterministically…
  const { destination, undo } = await fileDecision(vault, reviewProposal.decision);
  assert.match(destination, /Daily Review — mode draft → auto/);
  assert.equal((await getReviewConfig()).mode, 'auto');
  // …and undo restores exactly
  const note = await undoFiling(vault, undo);
  assert.match(note, /restored Daily Review to draft/);
  assert.equal((await getReviewConfig()).mode, 'draft');
});


test('a declined autonomy proposal stays quiet for 60 days, then returns only on materially more evidence — naming the history', async () => {
  const day = 86_400_000;
  const { listRecords, updateRecord } = await import('../lib/inboxStore.js');
  // the review→auto proposal from the test above was applied (filed) and undone; seed a fresh dead-gate target: the morning brief
  for (let i = 0; i < 16; i++) await createRecord(mkRec('dispatch', 'discarded', { slot: 'morning', expired: true }));
  const t0 = Date.now();
  const first = (await proposeEarnedAutonomy({ now: t0 })).find((p) => p.decision.payload.target === 'dispatch-morning');
  assert.ok(first, 'the morning brief\'s gate is dead → proposed');
  assert.equal(first.decision.payload.evidence.metric, 16, 'the evidence rides the payload');

  // he declines it
  await updateRecord(first.id, { status: 'discarded', discardedAt: new Date(t0).toISOString(), declineReason: 'I read them, I just don\'t tap' });
  const during = await proposeEarnedAutonomy({ now: t0 + 7 * day });
  assert.ok(!during.some((p) => p.decision.payload.target === 'dispatch-morning'), 'the next Sunday does NOT re-propose — this was the weekly nag');
  const after = await proposeEarnedAutonomy({ now: t0 + 61 * day });
  assert.ok(!after.some((p) => p.decision.payload.target === 'dispatch-morning'), 'after the cooldown, the same 16 is not new evidence');

  // four more aged-out briefs: 20 vs 16 = +25% → it may return, and says so
  for (let i = 0; i < 4; i++) await createRecord(mkRec('dispatch', 'discarded', { slot: 'morning', expired: true }));
  const back = (await proposeEarnedAutonomy({ now: t0 + 61 * day })).find((p) => p.decision.payload.target === 'dispatch-morning');
  assert.ok(back, 'materially more evidence re-proposes');
  assert.match(back.decision.reason, /You passed on this on \d{1,2} \w{3,4} \("I read them, I just don't tap"\); the number behind it has moved from 16 to 20\./);
  assert.equal((await listRecords()).filter((r) => r.kind === 'autonomy' && r.decision?.payload?.target === 'dispatch-morning').length, 2);
});


test('the Weekly Debrief is on the ladder: its real mode config is read, applied, and undone through the agent-mode rail', async () => {
  const { getDebriefConfig } = await import('../lib/weeklyDebrief.js');
  const t = AUTONOMY_TARGETS['weekly-debrief'];
  assert.ok(t && t.setMode, 'registered and proposable');
  assert.equal(await t.getMode(), (await getDebriefConfig()).mode);
  const { destination, undo } = await fileDecision(vault, { route: 'agent-mode', confidence: 'high', title: 'x', reason: 'x', payload: { target: 'weekly-debrief', from: 'draft', to: 'auto' } });
  assert.match(destination, /Weekly training debrief — mode draft → auto/);
  assert.equal((await getDebriefConfig()).mode, 'auto');
  await undoFiling(vault, undo);
  assert.equal((await getDebriefConfig()).mode, 'draft');
  // every registered target with a setter reads a real mode
  for (const [id, target] of Object.entries(AUTONOMY_TARGETS)) {
    if (!target.setMode) continue;
    const mode = await target.getMode();
    assert.ok(typeof mode === 'string' && mode, `${id} has a setter but no readable mode`);
  }
});
