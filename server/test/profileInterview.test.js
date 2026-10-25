// ABOUT YOU, 27 OCT 2026: twelve sections, options he can tick, and Nova
// interviewing him from a hand-written bank. The model is stubbed through
// the router's deps.run seam; no model runs. Temp data dir + temp vault
// BEFORE any lib import, so no record or interview state lands in his live
// server/data.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-profint-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { chosenOptions, toggleOptionText } = await import('../lib/profileOptions.js');
const { getProfile, setSection, profileContext, PROFILE_SECTIONS } = await import('../lib/profile.js');
const {
  PROFILE_QUESTIONS, pickQuestion, loadInterviewState, recordAsked, NO_REPEAT_DAYS, questionById,
} = await import('../lib/profileQuestions.js');
const { buildProfileTalkPrompt } = await import('../lib/profileTalk.js');
const { undoRecord } = await import('../lib/inbox.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { profileRouter } = await import('../routes/profile.js');

const PAGE = `---
type: profile
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

## How to talk to me

- Short and direct
Swear if it helps.

_Drafted by Claude, 2026-10-21. Not yet confirmed by Hayden._
`;

const vaults = [];
async function vault(page = PAGE) {
  const v = await mkdtemp(path.join(tmpdir(), 'nova-profint-vault-'));
  vaults.push(v);
  await mkdir(path.join(v, 'Wiki'), { recursive: true });
  if (page !== null) await writeFile(path.join(v, 'Wiki/Profile.md'), page, 'utf8');
  return v;
}
const raw = (v) => readFile(path.join(v, 'Wiki/Profile.md'), 'utf8');
const sec = (p, key) => p.sections.find((s) => s.key === key);

async function serve(v, deps = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', profileRouter(v, deps));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (method, p, body) => fetch(`${base}${p}`, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  return { server, call };
}

async function clearState() {
  await rm(path.join(dataDir, 'profile-interview.json'), { force: true });
}

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const v of vaults) await rm(v, { recursive: true, force: true });
});

/* ------------------------------ twelve sections ----------------------------- */

test('twelve sections in his order; an old nine-section page parses with the new ones empty', async () => {
  assert.deepEqual(PROFILE_SECTIONS.map((s) => s.key),
    ['about', 'story', 'toward', 'values', 'training', 'fuel', 'work', 'mind', 'people', 'life', 'talk', 'taste']);
  const p = await getProfile(await vault());
  assert.equal(p.sections.length, 12);
  assert.equal(sec(p, 'story').text, '');
  assert.equal(sec(p, 'people').text, '');
  assert.equal(p.knows.total, 12);
});

test('a new section is written into its order slot', async () => {
  const v = await vault();
  await setSection(v, 'story', 'Grew up in Toowoomba.');
  await setSection(v, 'people', 'His brother Sam.');
  const body = await raw(v);
  const at = (t) => body.indexOf(`## ${t}`);
  assert.ok(at('About me') < at('My story') && at('My story') < at('Training'), 'story sits after About me, before Training');
  assert.ok(at('Work and projects') < at('People in my life') && at('People in my life') < at('How to talk to me'));
});

test('profileContext prints all twelve, chosen options plainly, drafted labelled, empty as not told yet', async () => {
  const ctx = await profileContext(await vault());
  for (const s of PROFILE_SECTIONS) assert.match(ctx, new RegExp(`^- ${s.title.replace(/'/g, "'")}: `, 'm'), s.title);
  assert.match(ctx, /^- My story: \(not told yet; ask him if it matters, never guess\)$/m);
  assert.match(ctx, /^- How to talk to me: \(drafted by Claude on 2026-10-21[^)]*\) he chose: Short and direct\. Swear if it helps\.$/m);
  const narrow = await profileContext(await vault(), { only: ['work', 'people'] });
  assert.match(narrow, /- Work and projects: Leads a team of eight\./);
  assert.doesNotMatch(narrow, /Training/);
});

/* ---------------------------------- options --------------------------------- */

test('toggleOptionText adds and removes one line and keeps every other line of his', () => {
  const text = 'Swear if it helps.\n- Short and direct\nMore of his words.';
  const on = toggleOptionText(text, 'No small talk', true);
  assert.equal(on, 'Swear if it helps.\n- Short and direct\nMore of his words.\n- No small talk');
  assert.equal(toggleOptionText(on, 'No small talk', true), on, 'already on: unchanged');
  const off = toggleOptionText(on, 'short and direct', false);
  assert.equal(off, 'Swear if it helps.\nMore of his words.\n- No small talk');
  assert.deepEqual(chosenOptions('talk', on), ['Short and direct', 'No small talk']);
  assert.deepEqual(chosenOptions('talk', off), ['No small talk']);
  assert.deepEqual(chosenOptions('talk', 'Short and direct (no dash, so his words, not a choice)'), []);
});

test('getProfile returns the chosen options per section', async () => {
  const p = await getProfile(await vault());
  assert.deepEqual(sec(p, 'talk').chosen, ['Short and direct']);
  assert.deepEqual(sec(p, 'about').chosen, []);
});

test('PUT /profile/option on a drafted section adds the line, keeps it drafted, and Undo restores the bytes', async () => {
  const v = await vault();
  const before = await raw(v);
  const { server, call } = await serve(v);
  try {
    const r = await call('PUT', '/profile/option', { key: 'talk', phrase: 'no small talk', on: true });
    assert.equal(r.status, 200);
    const talk = sec(r.body.profile, 'talk');
    assert.equal(talk.drafted, true, 'an option is not a yes to the whole draft');
    assert.equal(talk.draftedOn, '2026-10-21');
    assert.deepEqual(talk.chosen, ['Short and direct', 'No small talk']);
    assert.match(talk.text, /Swear if it helps\.\n- No small talk$/);
    const rec = await getRecord(r.body.recordId);
    assert.equal(rec.kind, 'profile-fact');
    assert.equal(rec.status, 'filed');
    assert.match(rec.text, /chose "No small talk"/);

    const off = await call('PUT', '/profile/option', { key: 'talk', phrase: 'Short and direct', on: false });
    assert.deepEqual(sec(off.body.profile, 'talk').chosen, ['No small talk']);
    assert.equal(sec(off.body.profile, 'talk').drafted, true);

    await undoRecord(v, off.body.recordId);
    await undoRecord(v, r.body.recordId);
    assert.equal(await raw(v), before);
  } finally { server.close(); }
});

test('PUT /profile/option refuses an unknown phrase or section and writes nothing', async () => {
  const v = await vault();
  const before = await raw(v);
  const { server, call } = await serve(v);
  try {
    const bad = await call('PUT', '/profile/option', { key: 'talk', phrase: 'Speak only in riddles', on: true });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /not one of the options/);
    const noKey = await call('PUT', '/profile/option', { key: 'secrets', phrase: 'Short and direct', on: true });
    assert.equal(noKey.status, 400);
    const already = await call('PUT', '/profile/option', { key: 'talk', phrase: 'Short and direct', on: true });
    assert.equal(already.status, 200);
    assert.equal(already.body.recordId, null, 'a no-op files nothing');
    assert.equal(await raw(v), before);
  } finally { server.close(); }
});

test('PUT /profile/section append adds a said line and keeps a draft a draft', async () => {
  const v = await vault();
  const before = await raw(v);
  const { server, call } = await serve(v);
  try {
    const r = await call('PUT', '/profile/section', { key: 'training', text: 'Prefers mornings', append: true });
    assert.equal(r.status, 200);
    const t = sec(r.body.profile, 'training');
    assert.match(t.text, /^- Lifts four days a week\.\n- Prefers mornings \(said \d{4}-\d{2}-\d{2}\)$/);
    assert.equal(t.drafted, true);
    const empty = await call('PUT', '/profile/section', { key: 'training', text: '  ', append: true });
    assert.equal(empty.status, 400);
    await undoRecord(v, r.body.recordId);
    assert.equal(await raw(v), before);
  } finally { server.close(); }
});

/* ------------------------------- the question bank -------------------------- */

test('the bank: at least 90, all twelve sections, one plain question each, unique ids', () => {
  assert.ok(PROFILE_QUESTIONS.length >= 90, `${PROFILE_QUESTIONS.length} questions`);
  const keys = new Set(PROFILE_QUESTIONS.map((q) => q.key));
  for (const s of PROFILE_SECTIONS) assert.ok(keys.has(s.key), `no question for ${s.key}`);
  assert.equal(new Set(PROFILE_QUESTIONS.map((q) => q.id)).size, PROFILE_QUESTIONS.length);
  const count = (k) => PROFILE_QUESTIONS.filter((q) => q.key === k).length;
  for (const k of ['story', 'values', 'people', 'toward', 'talk']) assert.ok(count(k) >= 10, `${k} has ${count(k)}`);
  for (const q of PROFILE_QUESTIONS) {
    assert.ok(q.q.split(/\s+/).length <= 20, `${q.id} is over 20 words`);
    assert.equal((q.q.match(/\?/g) || []).length, 1, `${q.id} must hold exactly one question mark`);
    assert.doesNotMatch(q.q, /, and (what|why|how|who|where|when)\b/i, `${q.id} is a double question`);
    assert.ok(['light', 'deep'].includes(q.depth));
    assert.doesNotMatch(q.q, /password|salary|bank account|diagnos/i, `${q.id} asks what it must not`);
  }
});

// a seeded generator, so a run is repeatable
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

test('pickQuestion weights thin sections: empty above drafted above his own full text', () => {
  const full = 'x'.repeat(400);
  const sections = PROFILE_SECTIONS.map((s) => ({ key: s.key, title: s.title, text: full, drafted: false }));
  sections.find((s) => s.key === 'fuel').text = '';
  sections.find((s) => s.key === 'mind').drafted = true;
  const rand = seeded(7);
  const tally = {};
  for (let i = 0; i < 3000; i++) {
    const q = pickQuestion({ profile: { sections }, state: { asked: [] }, rand });
    tally[q.key] = (tally[q.key] || 0) + 1;
  }
  assert.ok(tally.fuel > tally.mind, `empty ${tally.fuel} > drafted ${tally.mind}`);
  assert.ok(tally.mind > tally.taste, `drafted ${tally.mind} > full ${tally.taste}`);
});

test('pickQuestion never repeats within 60 days, alternates depth starting light, and section mode stays in its key', () => {
  const now = new Date('2026-10-27T00:00:00Z');
  const first = pickQuestion({ state: { asked: [] }, now, rand: seeded(3) });
  assert.equal(first.depth, 'light', 'the first question is light');
  const afterLight = pickQuestion({ state: { asked: [{ id: first.id, on: now.toISOString() }] }, now, rand: seeded(3) });
  assert.equal(afterLight.depth, 'deep');
  const afterDeep = pickQuestion({ state: { asked: [{ id: first.id, on: now.toISOString() }, { id: afterLight.id, on: now.toISOString() }] }, now, rand: seeded(3) });
  assert.equal(afterDeep.depth, 'light');

  // every talk question asked 10 days ago: none is eligible in section mode
  const talkIds = PROFILE_QUESTIONS.filter((q) => q.key === 'talk').map((q) => q.id);
  const recent = talkIds.map((id) => ({ id, on: new Date(now.getTime() - 10 * 86400000).toISOString() }));
  assert.equal(pickQuestion({ state: { asked: recent }, mode: 'section', key: 'talk', now }), null);
  // 61 days ago: eligible again
  const old = talkIds.map((id) => ({ id, on: new Date(now.getTime() - (NO_REPEAT_DAYS + 1) * 86400000).toISOString() }));
  const again = pickQuestion({ state: { asked: old }, mode: 'section', key: 'talk', now, rand: seeded(5) });
  assert.equal(again.key, 'talk');
  // section mode, many draws, never leaves the key; interview mode never repeats a recent one
  const rand = seeded(11);
  for (let i = 0; i < 200; i++) assert.equal(pickQuestion({ state: { asked: [] }, mode: 'section', key: 'people', now, rand }).key, 'people');
  for (let i = 0; i < 200; i++) assert.ok(!talkIds.includes(pickQuestion({ state: { asked: recent }, now, rand }).id));
});

/* -------------------------------- the interview ----------------------------- */

const stub = (obj, seen = []) => async (lane, prompt, opts) => {
  seen.push({ lane, prompt, opts });
  return { text: JSON.stringify(typeof obj === 'function' ? obj(prompt) : obj), provider: 'claude', model: 'sonnet', ms: 5, fallback: false };
};

test('talk/start in interview mode opens with a bank question, by code, and records it as asked', async () => {
  await clearState();
  const v = await vault();
  const { server, call } = await serve(v);
  try {
    const r = await call('POST', '/profile/talk/start', { mode: 'interview' });
    assert.equal(r.status, 200);
    const q = questionById(r.body.questionId);
    assert.ok(q, 'a bank question');
    assert.equal(r.body.say, `Let's get to know each other. ${q.q}`);
    assert.equal(r.body.mode, 'interview');
    assert.equal(r.body.key, q.key);
    assert.equal(q.depth, 'light');
    const state = await loadInterviewState();
    assert.deepEqual(state.asked.map((a) => a.id), [q.id]);
    assert.deepEqual(state.thread, { id: q.id, followUps: 0 });

    const sect = await call('POST', '/profile/talk/start', { mode: 'section', key: 'people' });
    assert.equal(questionById(sect.body.questionId).key, 'people');
    assert.match(sect.body.say, /^Let's talk about the people in your life\. /);
    assert.equal((await call('POST', '/profile/talk/start', { mode: 'section', key: 'nope' })).status, 400);
    assert.equal((await call('POST', '/profile/talk/start', { mode: 'chat' })).status, 400);
    // no mode: the old counted opener
    const old = await call('POST', '/profile/talk/start', {});
    assert.match(old.body.say, /^Tell me about you\. I have \d+ of 12 sections/);
    assert.equal(old.body.questionId, null);
  } finally { server.close(); }
});

test('a turn hands the code-picked next question to the prompt, and moving on records it', async () => {
  await clearState();
  const v = await vault();
  const seen = [];
  let next = null;
  const run = stub((prompt) => {
    next = prompt.match(/NEXT QUESTION \(picked by code[^"]*"([^"]+)"/)[1];
    return { say: `Nice. ${next}`, learned: [{ key: 'life', text: 'Hikes most Sundays.', mode: 'append' }], confirmed: [], done: false, moved_on: true };
  }, seen);
  const { server, call } = await serve(v, { run });
  try {
    const start = await call('POST', '/profile/talk/start', { mode: 'interview' });
    const turn = await call('POST', '/profile/talk', {
      mode: 'interview', questionId: start.body.questionId, text: 'I hike most Sundays.',
      history: [{ role: 'nova', text: start.body.say }],
    });
    assert.equal(turn.status, 200);
    const { prompt } = seen[0];
    assert.equal(seen[0].lane, 'profile-talk');
    assert.match(prompt, /THIS IS AN INTERVIEW/);
    assert.match(prompt, new RegExp(`The question on the table: "${questionById(start.body.questionId).q.replace(/[?.()]/g, '\\$&')}"`));
    const nextQ = PROFILE_QUESTIONS.find((q) => q.q === next);
    assert.ok(nextQ, 'the next question is from the bank');
    assert.notEqual(nextQ.id, start.body.questionId, 'never the question just asked');
    assert.equal(nextQ.depth, 'deep', 'depth alternates after a light opener');
    assert.equal(turn.body.questionId, nextQ.id);
    assert.equal(turn.body.movedOn, true);
    assert.equal(turn.body.mode, 'interview');
    assert.equal(turn.body.learned[0].text, 'Hikes most Sundays.');
    const state = await loadInterviewState();
    assert.deepEqual(state.asked.map((a) => a.id), [start.body.questionId, nextQ.id]);
  } finally { server.close(); }
});

test('a follow-up keeps the question on the table and counts; after two the prompt says move on', async () => {
  await clearState();
  const v = await vault();
  const seen = [];
  const run = stub({ say: 'Which trail is your favourite?', learned: [], confirmed: [], done: false, moved_on: false }, seen);
  const { server, call } = await serve(v, { run });
  try {
    const start = await call('POST', '/profile/talk/start', { mode: 'interview' });
    const id = start.body.questionId;
    const t1 = await call('POST', '/profile/talk', { mode: 'interview', questionId: id, text: 'I hike.' });
    assert.equal(t1.body.questionId, id);
    assert.equal(t1.body.movedOn, false);
    assert.match(seen[0].prompt, /ask ONE follow-up on the same thread \(2 left on this thread\)/);
    await call('POST', '/profile/talk', { mode: 'interview', questionId: id, text: 'Mostly the coast.' });
    assert.match(seen[1].prompt, /\(1 left on this thread\)/);
    await call('POST', '/profile/talk', { mode: 'interview', questionId: id, text: 'Noosa.' });
    assert.match(seen[2].prompt, /You have already followed this thread twice\. Move on now/);
    assert.deepEqual((await loadInterviewState()).asked.map((a) => a.id), [id], 'a follow-up is not a new asking');
  } finally { server.close(); }
});

test('the About-you prompt carries his talk preferences right before TURN_TAKING, absent when the section is empty', async () => {
  const { talkPrefsBlock } = await import('../lib/talk.js');
  const v = await vault();
  const prefs = talkPrefsBlock(v);
  assert.match(prefs, /^HOW HE WANTS NOVA TO TALK TO HIM \(his profile; follow it in every reply; it outranks style defaults, never honesty or safety\):\n- Short and direct\n- Swear if it helps\./);
  const prompt = buildProfileTalkPrompt({ profile: await getProfile(v), history: [], text: 'hi', today: '2026-10-27', talkPrefs: prefs });
  assert.ok(prompt.indexOf('HOW HE WANTS NOVA TO TALK TO HIM') < prompt.indexOf('HOW YOU TAKE A TURN'));
  assert.ok(prompt.indexOf('HOW YOU TAKE A TURN') > 0);

  // the real turn reads it from the page itself
  const seen = [];
  const { profileTalkTurn } = await import('../lib/profileTalk.js');
  await profileTalkTurn(v, { text: 'hi' }, { run: stub({ say: 'Hello.', learned: [], confirmed: [] }, seen) });
  assert.match(seen[0].prompt, /HOW HE WANTS NOVA TO TALK TO HIM/);

  const bare = await vault(PAGE.replace(/## How to talk to me[\s\S]*$/, ''));
  assert.equal(talkPrefsBlock(bare), '');
  const seen2 = [];
  await profileTalkTurn(bare, { text: 'hi' }, { run: stub({ say: 'Hello.', learned: [], confirmed: [] }, seen2) });
  assert.doesNotMatch(seen2[0].prompt, /HOW HE WANTS NOVA TO TALK TO HIM/);
  assert.equal(talkPrefsBlock(await vault(null)), '');
});

test('recordAsked ignores ids that are not in the bank', async () => {
  await clearState();
  await recordAsked('made-up');
  assert.deepEqual((await loadInterviewState()).asked, []);
});

test('GET /profile/reach lists who reads the profile', async () => {
  const { server, call } = await serve(await vault());
  try {
    const r = await call('GET', '/profile/reach');
    assert.equal(r.status, 200);
    const ids = r.body.readers.map((x) => x.id);
    for (const id of ['ask-nova', 'coach', 'leader', 'weekly-debrief', 'plan-today']) assert.ok(ids.includes(id), id);
    assert.deepEqual(Object.keys(r.body.readers[0]).sort(), ['id', 'label', 'talks']);
  } finally { server.close(); }
});
