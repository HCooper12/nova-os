// THE REGISTER BY PLACE (server/lib/register.js; design/EVIE-STUDY.md §4E).
// Pins: the exact lines per place, the lens first and untouched, the glass
// (VIS / CARD / SHOW) left out of the Ask prompt only when driving, the
// prompt byte-identical for desk / phone / unknown, a resumed turn restating
// a register-changing place in one line, the bounded where, and the driving
// confirm gate in runVerb (forceConfirm) that leaves read-only verbs alone.
//
// NOVA_DATA_DIR is set BEFORE any import (the 30-fake-greetings lesson).
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-register-'));
process.env.NOVA_DATA_DIR = dataDir;
const vault = await mkdtemp(path.join(tmpdir(), 'nova-register-vault-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../lib/register.js');
const { buildAskPrompt, buildResumedAsk } = await import('../lib/claudeCode.js');
const { NOVA_LENS } = await import('../lib/lens.js');
const { runVerb } = await import('../lib/verbs.js');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

const GYM = 'HE IS AT THE GYM, BETWEEN SETS. ONE SENTENCE per turn. The number first, then the few words it needs; no lists, no questions unless it is about his safety. Never narrate what he can already see on the screen in front of him.';
const DRIVE = 'HE IS DRIVING. TWO SENTENCES at most, and nothing visual: no VIS, CARD or SHOW lines, nothing that needs looking at. One question at most.';
const CONFIRM = 'Anything you do for him is confirmed aloud before it runs: say what will happen and that a yes does it.';

test('lines: gym', () => assert.deepEqual(R.registerFor('gym'), [GYM]));
test('lines: driving (two), and the one-shot lane drops the confirm line', () => {
  assert.deepEqual(R.registerFor('driving'), [DRIVE, CONFIRM]);
  assert.deepEqual(R.registerFor('driving', { oneShot: true }), [DRIVE]);
});
test('lines: desk, phone, unknown and anything else are the normal register', () => {
  for (const p of ['desk', 'phone', 'unknown', 'roof', undefined]) assert.deepEqual(R.registerFor(p), [], String(p));
});
test('registerFor hands back a copy', () => {
  R.registerFor('gym').push('x');
  assert.deepEqual(R.registerFor('gym'), [GYM]);
});

test('normWhere: closed set, why ≤ 60 and flattened, junk is unknown', () => {
  assert.deepEqual(R.normWhere({ place: 'gym', why: 'a live workout is open' }), { place: 'gym', why: 'a live workout is open' });
  assert.deepEqual(R.normWhere({ place: 'roof' }), { place: 'unknown', why: '' });
  assert.deepEqual(R.normWhere('driving'), { place: 'unknown', why: '' });
  assert.equal(R.normWhere({ place: 'desk', why: 'x'.repeat(500) }).why.length, 60);
  assert.equal(R.normWhere({ place: 'desk', why: 42 }).why, '');
});

test('handsFreeWhere: driving-grade by default, a Shortcut may say otherwise', () => {
  assert.deepEqual(R.handsFreeWhere(undefined), { place: 'driving', why: 'hands-free lane, no route signal' });
  assert.deepEqual(R.handsFreeWhere({ place: 'desk', why: 'Mac Shortcut' }), { place: 'desk', why: 'Mac Shortcut' });
  assert.equal(R.handsFreeWhere({ place: 'roof' }).place, 'driving');
});

test('the gates: glass off and confirm on only for driving; never confirm on the one-shot', () => {
  for (const p of R.PLACES) {
    assert.equal(R.suppressGlass(p), p === 'driving', p);
    assert.equal(R.forceConfirmFor(p), p === 'driving', p);
    assert.equal(R.forceConfirmFor(p, { oneShot: true }), false, p);
  }
});

test('prompt: the lens stays first for every place', () => {
  for (const place of R.PLACES) assert.ok(buildAskPrompt({ question: 'q', place }).startsWith(NOVA_LENS), place);
});

test('prompt: desk, phone and unknown are byte-identical to no place at all', () => {
  const plain = buildAskPrompt({ question: 'q', context: 'c', spoken: true });
  for (const place of ['desk', 'phone', 'unknown']) assert.equal(buildAskPrompt({ question: 'q', context: 'c', spoken: true, place }), plain, place);
});

test('prompt: gym appends its line to the spoken register and keeps the glass', () => {
  const p = buildAskPrompt({ question: 'q', place: 'gym' });
  assert.ok(p.includes(`- ${GYM}`));
  assert.ok(p.includes('THE RUNNING GLASS'));
  assert.ok(p.includes('CARD {"label"'));
  // after the spoken-register bullet, before the length rule
  assert.ok(p.indexOf('- Spoken register:') < p.indexOf(GYM));
  assert.ok(p.indexOf(GYM) < p.indexOf('THE LENGTH RULE IS NOT WAIVED'));
});

test('prompt: driving — the VIS gate. No running glass, no CARD, no SHOW; the lines are there', () => {
  const p = buildAskPrompt({ question: 'q', place: 'driving' });
  assert.ok(p.includes(`- ${DRIVE}`));
  assert.ok(p.includes(`- ${CONFIRM}`));
  assert.ok(!p.includes('THE RUNNING GLASS'));
  assert.ok(!/^VIS \{/m.test(p));
  assert.ok(!p.includes('CARD {"label"'));
  assert.ok(!p.includes('SHOW {"panel"'));
  assert.ok(p.includes('NOTHING ON SCREEN THIS CONVERSATION'));
});

test('prompt: driving on the hands-free one-shot never promises a confirm it cannot hear', () => {
  const p = buildAskPrompt({ question: 'q', place: 'driving', direct: true });
  assert.ok(p.includes(DRIVE));
  assert.ok(!p.includes(CONFIRM));
});

test('resumed turn: a place that changes the register is restated in one line; desk adds nothing', () => {
  assert.equal(buildResumedAsk({ question: 'q', place: 'desk' }), 'q');
  assert.equal(buildResumedAsk({ question: 'q' }), 'q');
  const g = buildResumedAsk({ question: 'q', place: 'gym' });
  assert.equal(g, `${R.whereLine('gym')}\n\nq`);
  assert.ok(R.whereLine('gym').includes(GYM));
  assert.equal(R.whereLine('phone'), '');
});

test('forceConfirm: an act verb lands PENDING instead of running', async () => {
  await mkdir(path.join(vault, 'Wiki'), { recursive: true });
  const out = await runVerb(vault, 'add call the bank', { verb: 'todo.add', args: { text: 'call the bank' } }, { forceConfirm: true });
  assert.ok(out.proposal, 'a proposal, not an act');
  assert.equal(out.acted, undefined);
  const store = JSON.parse(await readFile(path.join(dataDir, 'inbox.json'), 'utf8'));
  const list = Array.isArray(store) ? store : (store.records || Object.values(store).find(Array.isArray) || []);
  const rec = list.find((r) => r.id === out.proposal.recordId);
  assert.equal(rec.status, 'pending');
  assert.equal(rec.decision.payload.verb, 'todo.add');
});

test('forceConfirm: a read-only verb (check.*) still runs: nothing he owns changes', async () => {
  // it RAN (and said it has no such check) rather than filing a pending card
  await assert.rejects(
    runVerb(vault, 'check zzz', { verb: 'check.thing', args: { thing: 'zzz nothing' } }, { forceConfirm: true }),
    /I don't have a check/,
  );
});

test('forceConfirm off: the same act verb runs at once (the gate changes nothing else)', async () => {
  await writeFile(path.join(vault, 'Wiki', '.keep'), '');
  const out = await runVerb(vault, 'add post the letter', { verb: 'todo.add', args: { text: 'post the letter' } }, {});
  assert.ok(out.acted, 'acted');
  assert.equal(out.proposal, undefined);
});
