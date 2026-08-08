// The About You interview machinery: the ritual prompt, the profile PROPOSE
// kind, the merge filer + full-profile undo, and coach receipt modes.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-about-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-about-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { buildRitualQuestion, ritualLabel, RITUAL_KINDS } = await import('../lib/rituals.js');
const { createVoiceProposal } = await import('../lib/voiceActions.js');
const { fileDecision, undoFiling } = await import('../lib/inbox.js');
const { getProfile, setProfile } = await import('../lib/profile.js');
const { getRecord } = await import('../lib/inboxStore.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('the about-you ritual exists and interviews rather than lectures', () => {
  assert.ok(RITUAL_KINDS.includes('about-you'));
  const q = buildRitualQuestion('about-you', 'ABOUT HAYDEN: no profile set yet.');
  assert.match(q, /ONE question per turn/);
  assert.match(q, /"kind":"profile"/);
  assert.match(q, /never invented/);
  assert.match(q, /no profile set yet/);
  assert.equal(ritualLabel('about-you'), '◈ About you');
});

test('profile proposal: validated patch, pending record, merge on file, full undo', async () => {
  const out = await createVoiceProposal(vault, 'my focus is shipping Nova', {
    kind: 'profile',
    patch: { focus: '  Shipping Nova to daily-driver quality  ', junk: 'ignored' },
  });
  assert.equal(out.route, 'profile');
  const record = await getRecord(out.recordId);
  assert.equal(record.status, 'pending'); // always his yes
  assert.equal(record.decision.payload.patch.focus, 'Shipping Nova to daily-driver quality');
  assert.equal(record.decision.payload.patch.junk, undefined);

  // pre-existing profile field survives the merge of a different field
  await setProfile(vault, { focus: '', priorities: ['stay healthy'], bestSelf: '', notes: '' });
  const { destination, undo } = await fileDecision(vault, record.decision);
  assert.match(destination, /About You — focus: Shipping Nova/);
  const after = await getProfile(vault);
  assert.equal(after.focus, 'Shipping Nova to daily-driver quality');
  assert.deepEqual(after.priorities, ['stay healthy']); // untouched

  const note = await undoFiling(vault, undo);
  assert.match(note, /restored the previous About You/);
  const reverted = await getProfile(vault);
  assert.equal(reverted.focus, '');
  assert.deepEqual(reverted.priorities, ['stay healthy']);
});

test('an empty profile proposal is refused', async () => {
  await assert.rejects(
    () => createVoiceProposal(vault, 'x', { kind: 'profile', patch: { focus: '   ' } }),
    /carried nothing to save/);
});

test('coach receipt mode: draft default, settable, ladder-visible', async () => {
  const { getReceiptConfig, setReceiptConfig } = await import('../lib/coach.js');
  assert.deepEqual(await getReceiptConfig(), { mode: 'draft' });
  assert.deepEqual(await setReceiptConfig({ mode: 'auto' }), { mode: 'auto' });
  assert.deepEqual(await setReceiptConfig({ mode: 'nonsense' }), { mode: 'auto' }); // invalid patch keeps current
  const { AUTONOMY_TARGETS } = await import('../lib/autonomyLedger.js');
  assert.equal(await AUTONOMY_TARGETS['coach-receipt'].getMode(), 'auto');
  await setReceiptConfig({ mode: 'draft' });
});
