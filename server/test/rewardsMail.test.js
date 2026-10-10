// OFFERS FROM HIS REWARDS EMAILS (server/lib/rewardsMail.js). The emails are
// written for this test (invented offers, invented addresses). Code reads
// them first; the model is a stub that is only called for an email code
// cannot read, and what it returns is checked against the email's own words.
// No model request is ever sent from here.
import { mkdtemp, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-rewards-'));
process.env.CLAUDE_BIN = '/nonexistent/claude-never-called';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const R = await import('../lib/rewardsMail.js');
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'shopping');
const mailOf = async (n) => R.parseMail(await readFile(path.join(FIX, n), 'utf8'), n);

test('an .eml is decoded: quoted-printable, base64 HTML, an encoded subject', async () => {
  const er = await mailOf('er-boosts.eml');
  assert.equal(er.subject, 'Your boosts this week – don\'t miss out');
  assert.match(er.text, /Boost by Tue 20 October/, 'a soft line break is joined');
  assert.doesNotMatch(er.text, /Ignored when plain text exists/, 'plain text preferred over HTML');
  assert.equal(er.date, '2026-10-06T20:02:00.000Z');
  const fb = await mailOf('fb-giftcards.eml');
  assert.match(fb.text, /Collect 20× Flybuys points on selected food delivery gift cards/);
  assert.doesNotMatch(fb.text, /<p>/);
});

test('code reads an Everyday Rewards email: an amount and a rate, each with its end date and activation', async () => {
  const { prog, offers } = R.readOffersByCode(await mailOf('er-boosts.eml'));
  assert.equal(prog, 'er');
  const ok = offers.filter((o) => R.validateOffer(o).ok);
  assert.equal(ok.length, 2, 'the "2,000 points = $10" line and the balance are not offers');
  const chicken = ok.find((o) => o.pts);
  assert.deepEqual([chicken.pts, chicken.on, chicken.ends, chicken.activate, chicken.shop, chicken.kind], [1000, 'Chicken thigh fillets 1kg', '2026-10-20', true, 'w', 'line']);
  const peas = ok.find((o) => o.mult);
  assert.deepEqual([peas.mult, peas.on, peas.ends, peas.activate], [10, 'frozen vegetables', '2026-10-13', true]);
});

test('a Flybuys gift-card week: kind gift, no activation, the range\'s end date; a Kmart offer is not a Coles one', async () => {
  const { prog, offers } = R.readOffersByCode(await mailOf('fb-giftcards.eml'));
  assert.equal(prog, 'fb');
  const ok = offers.filter((o) => R.validateOffer(o).ok);
  assert.equal(ok.length, 1);
  assert.deepEqual([ok[0].kind, ok[0].mult, ok[0].on, ok[0].ends, ok[0].activate, ok[0].shop], ['gift', 20, 'food delivery gift cards', '2026-10-13', false, 'c']);
  const kmart = offers.find((o) => /kmart/i.test(o.on));
  assert.ok(kmart, 'code saw it');
  assert.deepEqual(R.validateOffer(kmart).reasons, ['not at Woolworths or Coles']);
});

test('the validator: no end date, both or neither figure, an absurd rate are refused', () => {
  const base = { programme: 'er', shop: 'w', kind: 'line', on: 'rolled oats', mult: null, pts: 200, ends: '2026-10-13', activate: false };
  assert.ok(R.validateOffer(base).ok);
  assert.deepEqual(R.validateOffer({ ...base, ends: null }).reasons, ['no end date']);
  assert.deepEqual(R.validateOffer({ ...base, mult: 10 }).reasons, ['both a rate and an amount']);
  assert.deepEqual(R.validateOffer({ ...base, pts: null }).reasons, ['no multiplier or points total']);
  assert.ok(!R.validateOffer({ ...base, pts: null, mult: 500 }).ok);
});

async function folder(files) {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-rewards-vault-'));
  const dir = path.join(vault, R.REWARDS_DIR_REL);
  await mkdir(dir, { recursive: true });
  for (const f of files) await copyFile(path.join(FIX, f), path.join(dir, f));
  return { vault, dir };
}

test('the folder: code first, the model only for the email code could not read, its answer checked; a second scan reads nothing again', async () => {
  R._resetForTests();
  const { vault } = await folder(['er-boosts.eml', 'fb-giftcards.eml', 'fb-unreadable.eml', 'not-rewards.txt']);
  const asked = [];
  const runModel = async (mail) => {
    asked.push(mail.file);
    return [
      { programme: 'fb', kind: 'line', on: 'rolled oats, two bags', pts: 200, mult: null, ends: '2026-10-13', activate: true },
      { programme: 'fb', kind: 'line', on: 'invented by the model', pts: 5000, mult: null, ends: '2026-10-13', activate: true },
      { programme: 'fb', kind: 'line', on: 'no date', pts: 200, mult: null, ends: null, activate: true },
    ];
  };
  const now = new Date('2026-10-10T00:00:00Z');
  const rep = await R.scanRewardsMail(vault, { runModel, now });
  assert.deepEqual(asked, ['fb-unreadable.eml'], 'one model call, for the one email code could not read; none for a non-rewards email');
  assert.equal(rep.read, 4);
  const view = await R.offersView(vault, { now });
  const ons = view.offers.map((o) => o.on).sort();
  assert.deepEqual(ons, ['Chicken thigh fillets 1kg', 'food delivery gift cards', 'frozen vegetables', 'rolled oats, two bags']);
  assert.equal(view.offers.find((o) => o.on === 'rolled oats, two bags').via, 'model');
  assert.ok(!ons.includes('invented by the model'), 'a figure the email never says is refused');
  assert.equal(view.source.setUp, true);
  assert.equal(view.offers.find((o) => o.on === 'frozen vegetables').daysLeft, 3);
  const again = await R.scanRewardsMail(vault, { runModel, now });
  assert.equal(again.read, 0);
  assert.equal(asked.length, 1, 'an unchanged file is never read twice');
});

test('offers expire on their end date: the morning after, they leave and are counted as ended', async () => {
  const vault = (await folder([])).vault;
  const live = await R.offersView(vault, { now: new Date('2026-10-13T03:00:00Z') });
  assert.ok(live.offers.some((o) => o.on === 'frozen vegetables'), 'still live on its last day');
  const after = await R.offersView(vault, { now: new Date('2026-10-13T22:00:00Z') }); // Wed 14 Oct, 09:00 in Melbourne
  assert.ok(!after.offers.some((o) => o.ends === '2026-10-13'));
  assert.equal(after.ended.filter((o) => o.ends === '2026-10-13').length, 3);
  assert.ok(after.offers.some((o) => o.on === 'Chicken thigh fillets 1kg'));
});

test('his marks: I activated it, Not for me, each returning what it replaced for Undo', async () => {
  const vault = (await folder([])).vault;
  const now = new Date('2026-10-10T00:00:00Z');
  const peas = (await R.offersView(vault, { now })).offers.find((o) => o.on === 'frozen vegetables');
  const a = await R.markOffer(peas.id, { activated: true });
  assert.equal(a.prev.activated, undefined);
  assert.equal((await R.offersView(vault, { now })).offers.find((o) => o.id === peas.id).activated, true);
  const d = await R.markOffer(peas.id, { dismissed: true });
  assert.equal(d.prev.activated, true);
  assert.ok(!(await R.offersView(vault, { now })).offers.some((o) => o.id === peas.id), 'not for me hides it');
  await R.markOffer(peas.id, { restore: d.prev });
  assert.ok((await R.offersView(vault, { now })).offers.some((o) => o.id === peas.id), 'Undo brings it back');
  await assert.rejects(R.markOffer('nope', { activated: true }), /no such offer/);
});

test('a folder with no emails says it is not set up', async () => {
  R._resetForTests();
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-rewards-empty-'));
  await R.scanRewardsMail(vault, { runModel: async () => { throw new Error('never'); } });
  const v = await R.offersView(vault);
  assert.equal(v.source.setUp, false);
  assert.equal(v.source.dirExists, true, 'the folder is made so the Mail rule has somewhere to save');
  assert.deepEqual(v.offers, []);
  await writeFile(path.join(vault, R.REWARDS_DIR_REL, 'big.eml'), 'x'.repeat(10));
});
