// ABOUT YOU, THE SECTIONS: the profile page parsed into sections with
// provenance, one section rewritten without touching anything else, and the
// exact prior page back on undo. Temp data dir + temp vault BEFORE imports.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-profsec-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const {
  getProfile, setProfile, setSection, restoreProfileText, profileContext, PROFILE_SECTIONS, setIntake,
} = await import('../lib/profile.js');

const FM = `---
type: profile
focus: lead well
bestSelf: calm and strong
updated: '2026-09-01'
priorities:
  - Get to 78kg lean
intake:
  on: '2026-09-08'
  facts:
    weightKg: 79.4
  plan:
    targetKcal: 2534
    proteinG: 159
---
`;
const BODY = `# Profile

Gym has only dumbbells on weekends.

## About me

Hayden, 33, lives in Brisbane.

## Training

- Lifts four days a week.

_Drafted by Claude, 2026-10-20. Not yet confirmed by Hayden._

## My own heading

Something only he files here.

## Taste

Likes plain, quiet design.
`;
const PAGE = FM + BODY;

const vaults = [];
async function vault(page = PAGE) {
  const v = await mkdtemp(path.join(tmpdir(), 'nova-profsec-vault-'));
  vaults.push(v);
  await mkdir(path.join(v, 'Wiki'), { recursive: true });
  if (page !== null) await writeFile(path.join(v, 'Wiki/Profile.md'), page, 'utf8');
  return v;
}
const raw = (v) => readFile(path.join(v, 'Wiki/Profile.md'), 'utf8');
const bodyOf = (s) => s.slice(s.indexOf('\n---\n', 4) + 5);
const sec = (p, key) => p.sections.find((s) => s.key === key);

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const v of vaults) await rm(v, { recursive: true, force: true });
});

test('sections parse in order with provenance, drafted lines lifted out, knows counted', async () => {
  const v = await vault();
  const p = await getProfile(v);
  assert.deepEqual(p.sections.map((s) => s.key), PROFILE_SECTIONS.map((s) => s.key));
  assert.equal(sec(p, 'about').text, 'Hayden, 33, lives in Brisbane.');
  assert.equal(sec(p, 'about').drafted, false);
  assert.deepEqual(sec(p, 'training'), { key: 'training', title: 'Training', text: '- Lifts four days a week.', drafted: true, draftedOn: '2026-10-20', chosen: [] });
  assert.equal(sec(p, 'fuel').text, '');
  assert.deepEqual(p.knows, { filled: 3, confirmed: 2, total: 12 });
  assert.equal(p.focus, 'lead well');
  assert.equal(p.intake.plan.targetKcal, 2534);
  assert.match(p.notes, /## My own heading/, 'notes stays the whole body minus the title');
  assert.ok(!p.sections.some((s) => s.title === 'My own heading'), 'unknown headings are not listed');
});

test('replace rewrites only that section; frontmatter and every other section are kept', async () => {
  const v = await vault();
  const { prior, profile } = await setSection(v, 'about', 'Hayden, 33, a team leader in Brisbane.');
  assert.equal(prior, PAGE);
  assert.equal(sec(profile, 'about').text, 'Hayden, 33, a team leader in Brisbane.');
  const after = await raw(v);
  assert.equal(after, PAGE.replace(/updated: '2026-09-01'/, `updated: '${profile.updated}'`).replace('Hayden, 33, lives in Brisbane.', 'Hayden, 33, a team leader in Brisbane.'));
  assert.deepEqual(matter(after).data.intake, matter(PAGE).data.intake);
});

test('replacing a drafted section makes it his: the drafted line goes', async () => {
  const v = await vault();
  const { profile } = await setSection(v, 'training', 'Lifts three days a week.');
  assert.deepEqual(sec(profile, 'training'), { key: 'training', title: 'Training', text: 'Lifts three days a week.', drafted: false, draftedOn: null, chosen: [] });
  assert.doesNotMatch(await raw(v), /Drafted by Claude/);
  assert.match(await raw(v), /## My own heading\n\nSomething only he files here\./);
});

test('append adds a dated line; on a drafted section the draft stays unconfirmed', async () => {
  const v = await vault();
  const { profile } = await setSection(v, 'training', 'Trains before work', { append: true, said: '2026-10-26' });
  const t = sec(profile, 'training');
  assert.equal(t.text, '- Lifts four days a week.\n- Trains before work (said 2026-10-26)');
  assert.equal(t.drafted, true);
  assert.equal(t.draftedOn, '2026-10-20');
  const after = await raw(v);
  assert.match(after, /- Trains before work \(said 2026-10-26\)\n\n_Drafted by Claude, 2026-10-20\. Not yet confirmed by Hayden\._\n\n## My own heading/);
});

test('append to an empty section creates it in PROFILE_SECTIONS order', async () => {
  const v = await vault();
  const { profile } = await setSection(v, 'fuel', 'Eats four meals a day', { append: true, said: '2026-10-26' });
  assert.equal(sec(profile, 'fuel').text, '- Eats four meals a day (said 2026-10-26)');
  const b = bodyOf(await raw(v));
  assert.ok(b.indexOf('## Training') < b.indexOf('## Fuel') && b.indexOf('## Fuel') < b.indexOf('## My own heading'));
  assert.deepEqual(profile.knows, { filled: 4, confirmed: 3, total: 12 });
});

test('confirm with no text keeps the words and drops the drafted line', async () => {
  const v = await vault();
  const { profile } = await setSection(v, 'training', '', { confirm: true });
  assert.equal(sec(profile, 'training').text, '- Lifts four days a week.');
  assert.equal(sec(profile, 'training').drafted, false);
  assert.deepEqual(profile.knows, { filled: 3, confirmed: 3, total: 12 });
});

test('restore brings back the exact prior text, and null removes a page that did not exist', async () => {
  const v = await vault();
  const { prior } = await setSection(v, 'about', 'changed');
  await restoreProfileText(v, prior);
  assert.equal(await raw(v), PAGE);

  const empty = await vault(null);
  const first = await setSection(empty, 'about', 'Hayden.');
  assert.equal(first.prior, null);
  assert.equal(sec(first.profile, 'about').text, 'Hayden.');
  assert.equal(matter(await raw(empty)).data.type, 'profile');
  await restoreProfileText(empty, first.prior);
  assert.equal(await getProfile(empty), null);
});

test('an unknown key is refused', async () => {
  const v = await vault();
  await assert.rejects(() => setSection(v, 'secrets', 'x'), /no "secrets" section/);
  assert.equal(await raw(v), PAGE);
});

test('profileContext labels drafted sections and prints what Nova knows', async () => {
  const v = await vault();
  const ctx = await profileContext(v);
  assert.ok(ctx.startsWith("ABOUT HAYDEN (from his profile page; sections marked drafted are Claude's draft, not his words):"));
  assert.match(ctx, /- About me: Hayden, 33, lives in Brisbane\./);
  assert.match(ctx, /- Training: \(drafted by Claude on 2026-10-20, not yet confirmed by Hayden; treat as likely, not as his words\) Lifts four days a week\./);
  assert.match(ctx, /- Context & constraints: Gym has only dumbbells on weekends\.$/m);
  assert.doesNotMatch(ctx, /Context & constraints:.*## /, 'sections are not repeated inside the notes line');
  assert.match(ctx, /- Nova knows 2 of 12 sections confirmed \(3 filled\)\. When a section he is asking about is empty or drafted, ask him about it rather than guess\./);
  assert.match(ctx, /His numbers \(Intake, 2026-09-08/);
});

test('a page with only sections still reaches the agents', async () => {
  const v = await vault(null);
  await setSection(v, 'about', 'Hayden.');
  assert.match(await profileContext(v), /- About me: Hayden\./);
});

test('the old form editor keeps every section, his own headings included', async () => {
  const v = await vault();
  // no notes sent: the body is left as it is
  await setProfile(v, { focus: 'new focus' });
  let p = await getProfile(v);
  assert.equal(p.focus, 'new focus');
  assert.equal(sec(p, 'training').drafted, true);
  assert.match(await raw(v), /## My own heading/);
  assert.equal(p.intake.plan.targetKcal, 2534);

  // notes without headings replace only the intro
  await setProfile(v, { focus: 'new focus', notes: 'Weekday gym is full.' });
  p = await getProfile(v);
  assert.match(await profileContext(v), /Context & constraints: Weekday gym is full\.$/m);
  assert.doesNotMatch(await raw(v), /dumbbells on weekends/);
  assert.equal(sec(p, 'about').text, 'Hayden, 33, lives in Brisbane.');
  assert.equal(sec(p, 'taste').text, 'Likes plain, quiet design.');
  assert.match(await raw(v), /## My own heading\n\nSomething only he files here\./);

  // the whole body round-tripped (getProfile's notes) is kept as he sent it
  await setProfile(v, { focus: 'new focus', notes: p.notes });
  assert.deepEqual((await getProfile(v)).sections, p.sections);

  // and the Intake write keeps them too
  await setIntake(v, null);
  assert.deepEqual((await getProfile(v)).sections, p.sections);
});
