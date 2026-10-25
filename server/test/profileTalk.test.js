// THE ABOUT-YOU CONVERSATION: the model hears, code checks and files. The
// lane is stubbed (deps.run); no model runs. Temp data dir + temp vault
// BEFORE imports, so no record lands in his live server/data.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-proftalk-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const { profileTalkTurn, talkOpener, buildProfileTalkPrompt, vetTurn } = await import('../lib/profileTalk.js');
const { getProfile } = await import('../lib/profile.js');
const { getRecord, listRecords } = await import('../lib/inboxStore.js');
const { undoRecord } = await import('../lib/inbox.js');

const PAGE = `---
type: profile
focus: lead well
updated: '2026-09-01'
---
# Profile

## About me

Hayden, 33.

## Training

- Lifts four days a week.

_Drafted by Claude, 2026-10-20. Not yet confirmed by Hayden._

## Work and projects

Leads a team of eight.
`;

const vaults = [];
async function vault(page = PAGE) {
  const v = await mkdtemp(path.join(tmpdir(), 'nova-proftalk-vault-'));
  vaults.push(v);
  await mkdir(path.join(v, 'Wiki'), { recursive: true });
  if (page !== null) await writeFile(path.join(v, 'Wiki/Profile.md'), page, 'utf8');
  return v;
}
const raw = (v) => readFile(path.join(v, 'Wiki/Profile.md'), 'utf8');
const sec = (p, key) => p.sections.find((s) => s.key === key);
const NOW = new Date(2026, 9, 26, 9, 0, 0); // 26 Oct 2026, his local morning
const stub = (obj, seen = []) => async (lane, prompt, opts) => {
  seen.push({ lane, prompt, opts });
  return { text: typeof obj === 'string' ? obj : JSON.stringify(obj), provider: 'claude', model: 'sonnet', ms: 5, fallback: false };
};

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const v of vaults) await rm(v, { recursive: true, force: true });
});

test('a turn that learns two facts files two auto records with undo; the page shows them dated', async () => {
  const v = await vault();
  const seen = [];
  const out = await profileTalkTurn(v, { history: [{ role: 'nova', text: 'What do you eat?' }], text: 'Four meals, and I live in Brisbane.', now: NOW }, {
    run: stub({ say: 'Got it. What time do you train?', learned: [
      { key: 'fuel', text: 'Eats four meals a day', mode: 'append' },
      { key: 'about', text: 'Lives in Brisbane', mode: 'append' },
    ], confirmed: [], done: false }, seen),
  });
  assert.equal(seen[0].lane, 'profile-talk');
  assert.equal(seen[0].opts.json, true);
  assert.equal(out.say, 'Got it. What time do you train?');
  assert.equal(out.done, false);
  assert.equal(out.author, 'Nova (Claude sonnet)');
  assert.deepEqual(out.learned.map((l) => [l.key, l.title, l.text]), [['fuel', 'Fuel', 'Eats four meals a day'], ['about', 'About me', 'Lives in Brisbane']]);
  assert.equal(sec(out.profile, 'fuel').text, '- Eats four meals a day (said 2026-10-26)');
  assert.equal(sec(out.profile, 'about').text, 'Hayden, 33.\n- Lives in Brisbane (said 2026-10-26)');
  for (const l of out.learned) {
    const r = await getRecord(l.recordId);
    assert.equal(r.kind, 'profile-fact');
    assert.equal(r.mode, 'auto');
    assert.equal(r.status, 'filed');
    assert.equal(r.auto, true);
    assert.equal(r.source, 'profile-talk');
    assert.equal(r.undoData.route, 'profile-section');
    assert.match(r.destination, /^About you — /);
  }
});

test('a confirm removes the drafted line, and keeps his words', async () => {
  const v = await vault();
  const out = await profileTalkTurn(v, { text: "Yes, that's right.", now: NOW }, {
    run: stub({ say: 'Good. What about fuel?', learned: [], confirmed: ['training'], done: false }),
  });
  assert.deepEqual(out.confirmed.map((c) => c.key), ['training']);
  assert.deepEqual(sec(out.profile, 'training'), { key: 'training', title: 'Training', text: '- Lifts four days a week.', drafted: false, draftedOn: null });
  assert.doesNotMatch(await raw(v), /Drafted by Claude/);
  const r = await getRecord(out.confirmed[0].recordId);
  assert.equal(r.kind, 'profile-fact');
});

test('a confirm of a section that is not drafted is dropped', () => {
  const sections = [{ key: 'about', title: 'About me', text: 'Hayden', drafted: false, draftedOn: null }];
  assert.deepEqual(vetTurn({ confirmed: ['about', 'nope'] }, sections).confirmed, []);
});

test('a replace on a confirmed section is downgraded to append; replace on a draft is kept', async () => {
  const v = await vault();
  const out = await profileTalkTurn(v, { text: 'I lead a team of ten now. And I lift three days, not four.', now: NOW }, {
    run: stub({ say: 'Noted.', learned: [
      { key: 'work', text: 'Leads a team of ten', mode: 'replace' },
      { key: 'training', text: 'Lifts three days a week', mode: 'replace' },
    ], confirmed: ['training'] }),
  });
  assert.equal(out.learned[0].mode, 'append');
  assert.equal(sec(out.profile, 'work').text, 'Leads a team of eight.\n- Leads a team of ten (said 2026-10-26)');
  assert.equal(out.learned[1].mode, 'replace');
  assert.deepEqual(sec(out.profile, 'training'), { key: 'training', title: 'Training', text: 'Lifts three days a week', drafted: false, draftedOn: null });
  assert.deepEqual(out.confirmed, [], 'the replace already made it his; no second filing');
});

test('a key outside the sections is dropped, long text is cut, and at most three are kept', async () => {
  const v = await vault();
  const before = (await listRecords()).length;
  const long = 'x'.repeat(400);
  const out = await profileTalkTurn(v, { text: 'lots', now: NOW }, {
    run: stub({ say: 'Okay.', learned: [
      { key: 'password', text: 'should never land' },
      { key: 'fuel', text: long },
      { key: 'mind', text: 'Reads every night' },
      { key: 'life', text: 'Has a dog' },
      { key: 'taste', text: 'Likes quiet design' },
    ] }),
  });
  assert.deepEqual(out.learned.map((l) => l.key), ['fuel', 'mind', 'life']);
  assert.equal(out.learned[0].text.length, 200);
  assert.equal((await listRecords()).length, before + 3);
  assert.doesNotMatch(await raw(v), /should never land|password/);
});

test('a model failure returns { error } and writes nothing', async () => {
  const v = await vault();
  const before = (await listRecords()).length;
  const fail = await profileTalkTurn(v, { text: 'hello', now: NOW }, { run: async () => { throw new Error("Claude's usage limit"); } });
  assert.ok(fail.error);
  assert.equal(fail.say, undefined);
  const junk = await profileTalkTurn(v, { text: 'hello', now: NOW }, { run: stub('sorry, I cannot do that') });
  assert.match(junk.error, /no JSON/);
  const empty = await profileTalkTurn(v, { text: 'hello', now: NOW }, { run: stub({ say: '', learned: [{ key: 'fuel', text: 'x' }] }) });
  assert.ok(empty.error);
  assert.equal(await raw(v), PAGE);
  assert.equal((await listRecords()).length, before);
});

test('undoing a record restores the prior page text', async () => {
  const v = await vault();
  const out = await profileTalkTurn(v, { text: 'I read every night.', now: NOW }, {
    run: stub({ say: 'Nice. What are you reading?', learned: [{ key: 'mind', text: 'Reads every night', mode: 'append' }] }),
  });
  assert.notEqual(await raw(v), PAGE);
  const r = await undoRecord(v, out.learned[0].recordId);
  assert.equal(r.status, 'undone');
  assert.equal(await raw(v), PAGE);
});

test('the first fact on a vault with no page creates it, and undo removes it again', async () => {
  const v = await vault(null);
  const out = await profileTalkTurn(v, { text: 'I am Hayden.', now: NOW }, {
    run: stub({ say: 'Hi Hayden. What are you working toward?', learned: [{ key: 'about', text: 'Is called Hayden', mode: 'replace' }] }),
  });
  assert.equal(sec(out.profile, 'about').text, 'Is called Hayden');
  await undoRecord(v, out.learned[0].recordId);
  assert.equal(existsSync(path.join(v, 'Wiki/Profile.md')), false);
});

test('done is passed through when he stops', async () => {
  const v = await vault();
  const out = await profileTalkTurn(v, { text: "That's enough for today.", now: NOW }, { run: stub({ say: 'Thanks. Talk soon.', learned: [], confirmed: [], done: true }) });
  assert.equal(out.done, true);
  assert.equal(await raw(v), PAGE);
});

test('talkOpener names the thinnest section and the counts, with no model', async () => {
  const p = await getProfile(await vault());
  const line = talkOpener(p);
  assert.equal(line, "Tell me about you. I have 3 of 9 sections, one of them a draft. Shall we start with What I'm working toward?");
  assert.equal(talkOpener(null), 'Tell me about you. I have none of the 9 sections yet. Shall we start with About me?');
  // every section filled: the drafted one is the thinnest
  const all = p.sections.map((s) => ({ ...s, text: s.text || 'something he said' }));
  assert.equal(talkOpener({ sections: all }), 'Tell me about you. I have 9 of 9 sections, one of them a draft. Shall we check my draft of Training?');
});

test('the prompt carries the lens, the turn-taking rule, the sections with their state, the history and his words', async () => {
  const p = await getProfile(await vault());
  const history = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'hayden' : 'nova', text: `turn ${i}` }));
  const prompt = buildProfileTalkPrompt({ profile: p, history, text: 'I like hiking.', today: '2026-10-26' });
  assert.match(prompt, /NOVA OPERATING LENS/);
  assert.match(prompt, /HOW YOU TAKE A TURN/);
  assert.match(prompt, /training \(Training\) \[DRAFTED by Claude on 2026-10-20/);
  assert.match(prompt, /fuel \(Fuel\): EMPTY/);
  assert.doesNotMatch(prompt, /turn 7\b/, 'only the last 12 turns');
  assert.match(prompt, /Hayden: turn 19/);
  assert.match(prompt, /HIS NEW WORDS:\nI like hiking\.$/);
});
