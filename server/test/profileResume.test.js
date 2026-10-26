// ABOUT YOU, 27 OCT 2026 (his feedback): pause and resume the interview,
// correct a misheard answer, and an honest "enough" measure. The model is
// stubbed through the router's deps.run seam; no model runs. Temp data dir +
// temp vault BEFORE any lib import, so nothing lands in his live server/data.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-profres-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { profileCoverage, PROFILE_SECTIONS } = await import('../lib/profile.js');
const { coverageLine } = await import('../lib/profileCoverage.js');
const { loadInterviewState, recordResume, RESUME_DAYS } = await import('../lib/profileQuestions.js');
const { getRecord } = await import('../lib/inboxStore.js');
const { profileRouter } = await import('../routes/profile.js');

const PAGE = `---
type: profile
updated: '2026-09-01'
---
# Profile

## About me

Hayden, 33.
`;

const vaults = [];
async function vault(page = PAGE) {
  const v = await mkdtemp(path.join(tmpdir(), 'nova-profres-vault-'));
  vaults.push(v);
  await mkdir(path.join(v, 'Wiki'), { recursive: true });
  await writeFile(path.join(v, 'Wiki/Profile.md'), page, 'utf8');
  return v;
}
const raw = (v) => readFile(path.join(v, 'Wiki/Profile.md'), 'utf8');

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
const clearState = () => rm(path.join(dataDir, 'profile-interview.json'), { force: true });
const stub = (fn, seen = []) => async (lane, prompt) => {
  seen.push(prompt);
  return { text: JSON.stringify(fn(prompt, seen.length)), provider: 'claude', model: 'sonnet' };
};

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const v of vaults) await rm(v, { recursive: true, force: true });
});

/* ---------------------------------- resume ---------------------------------- */

test('start records the pending question; resume returns the same one in code\'s words', async () => {
  await clearState();
  const { server, call } = await serve(await vault());
  try {
    const a = await call('POST', '/profile/talk/start', { mode: 'interview' });
    assert.equal(a.status, 200);
    const st = await loadInterviewState();
    assert.equal(st.pending.questionId, a.body.questionId);
    assert.equal(st.sessions, 1);
    // he pauses: nothing else happens. Then resume.
    const g = await call('GET', '/profile/interview');
    assert.equal(g.body.pending.q, st.pending.q);
    const b = await call('POST', '/profile/talk/start', { mode: 'resume' });
    assert.equal(b.body.mode, 'interview');
    assert.equal(b.body.resumed, true);
    assert.equal(b.body.questionId, a.body.questionId);
    assert.equal(b.body.say, `Picking up where we left off. ${st.pending.q}`);
    assert.equal((await loadInterviewState()).sessions, 2);
  } finally { server.close(); }
});

test('a pending question older than 14 days starts fresh instead', async () => {
  await clearState();
  const { server, call } = await serve(await vault());
  try {
    const old = new Date(Date.now() - (RESUME_DAYS + 1) * 86400000).toISOString();
    await recordResume({ pending: { questionId: 'taste-music', q: 'What music have you had on repeat lately?', key: 'taste', askedAt: old } });
    assert.equal((await call('GET', '/profile/interview')).body.pending, null);
    const b = await call('POST', '/profile/talk/start', { mode: 'resume' });
    assert.equal(b.body.resumed, false);
    assert.match(b.body.say, /^Let's get to know each other\. /);
    assert.equal((await loadInterviewState()).pending.questionId, b.body.questionId);
  } finally { server.close(); }
});

test('an answered question clears pending; the next question Nova asked becomes it; done clears it', async () => {
  await clearState();
  const v = await vault();
  let next = null;
  const run = stub((prompt) => {
    next = prompt.match(/NEXT QUESTION \(picked by code[^"]*"([^"]+)"/)?.[1];
    return { say: `Nice. ${next}`, learned: [], confirmed: [], done: false, moved_on: true };
  });
  const { server, call } = await serve(v, { run });
  try {
    const a = await call('POST', '/profile/talk/start', { mode: 'interview' });
    const t = await call('POST', '/profile/talk', { history: [], text: 'Something.', mode: 'interview', questionId: a.body.questionId });
    assert.equal(t.status, 200);
    const st = await loadInterviewState();
    assert.notEqual(st.pending.questionId, a.body.questionId, 'the answered question is no longer pending');
    assert.equal(st.pending.q, next);
    const { server: s2, call: c2 } = await serve(v, { run: stub(() => ({ say: 'Bye for now.', learned: [], confirmed: [], done: true })) });
    try {
      await c2('POST', '/profile/talk', { history: [], text: 'stop', mode: 'interview', questionId: t.body.questionId });
      assert.equal((await loadInterviewState()).pending, null);
    } finally { s2.close(); }
  } finally { server.close(); }
});

/* ---------------------------------- retract --------------------------------- */

test('retract: undoes both facts of the last turn byte-exact, then files the corrected one', async () => {
  await clearState();
  const v = await vault();
  const seen = [];
  const run = stub((prompt, n) => (n === 1
    ? { say: 'Got it. Which year would you live again?', learned: [{ key: 'story', text: 'Grew up in Toowong.' }, { key: 'life', text: 'Lives in Toowong.' }], confirmed: [] }
    : { say: 'Toowoomba, got it. Which year would you live again?', learned: [{ key: 'story', text: 'Grew up in Toowoomba.' }], confirmed: [] }), seen);
  const { server, call } = await serve(v, { run });
  try {
    const a = await call('POST', '/profile/talk/start', { mode: 'interview' });
    const pageBefore = await raw(v);
    const t1 = await call('POST', '/profile/talk', { history: [], text: 'I grew up in Toowong', mode: 'interview', questionId: a.body.questionId });
    assert.equal(t1.body.learned.length, 2);
    assert.deepEqual((await loadInterviewState()).lastTurnRecordIds, t1.body.learned.map((l) => l.recordId));
    assert.match(await raw(v), /Toowong/);
    const t2 = await call('POST', '/profile/talk', { history: [], text: 'I said Toowoomba', mode: 'interview', questionId: t1.body.questionId, retract: true });
    assert.equal(t2.status, 200);
    assert.deepEqual(t2.body.retracted.map((r) => r.text), ['Grew up in Toowong.', 'Lives in Toowong.']);
    assert.equal(t2.body.retracted[0].title, 'My story');
    for (const l of t1.body.learned) assert.equal((await getRecord(l.recordId)).status, 'undone');
    assert.ok(seen[1].includes('His last answer was misheard or wrong; the facts from it were removed.'));
    // the page minus the new fact is the page before the misheard turn
    const after = await raw(v);
    assert.doesNotMatch(after, /Toowong/);
    assert.match(after, /Grew up in Toowoomba\./);
    const { undoRecord } = await import('../lib/inbox.js');
    await undoRecord(v, t2.body.learned[0].recordId);
    assert.equal(await raw(v), pageBefore, 'bytes back to before the misheard answer');
  } finally { server.close(); }
});

test('retract_last from the model takes the last answer back before filing the new facts', async () => {
  await clearState();
  const v = await vault();
  const run = stub((prompt, n) => (n === 1
    ? { say: 'Which year?', learned: [{ key: 'taste', text: 'Loves jazz.' }, { key: 'mind', text: 'Reads about jazz.' }], confirmed: [] }
    : { say: 'Blues then. Which year?', learned: [{ key: 'taste', text: 'Loves blues.' }], confirmed: [], retract_last: true }));
  const { server, call } = await serve(v, { run });
  try {
    const before = await raw(v);
    const a = await call('POST', '/profile/talk/start', { mode: 'interview' });
    const t1 = await call('POST', '/profile/talk', { history: [], text: 'I love jazz', mode: 'interview', questionId: a.body.questionId });
    const t2 = await call('POST', '/profile/talk', { history: [], text: 'no, I said blues', mode: 'interview', questionId: t1.body.questionId });
    assert.equal(t2.body.retracted.length, 2);
    const page = await raw(v);
    assert.doesNotMatch(page, /jazz/);
    assert.match(page, /Loves blues\./);
    const { undoRecord } = await import('../lib/inbox.js');
    await undoRecord(v, t2.body.learned[0].recordId);
    assert.equal(await raw(v), before);
  } finally { server.close(); }
});

test('continued passes its rule into the prompt and files as a normal append', async () => {
  await clearState();
  const v = await vault();
  const seen = [];
  const run = stub(() => ({ say: 'And then?', learned: [{ key: 'work', text: 'Leads a team of eight.' }], confirmed: [] }), seen);
  const { server, call } = await serve(v, { run });
  try {
    const a = await call('POST', '/profile/talk/start', { mode: 'interview' });
    const t1 = await call('POST', '/profile/talk', { history: [], text: 'I lead', mode: 'interview', questionId: a.body.questionId });
    const t2 = await call('POST', '/profile/talk', { history: [], text: 'a team of eight', mode: 'interview', questionId: t1.body.questionId, continued: true });
    assert.equal(t2.status, 200);
    assert.ok(seen[1].includes('He had not finished; this continues his previous answer.'));
    assert.ok(!seen[0].includes('He had not finished'));
    assert.equal(t2.body.retracted.length, 0);
    // a later correction takes back both halves of the answer
    assert.equal((await loadInterviewState()).lastTurnRecordIds.length, 2);
  } finally { server.close(); }
});

/* --------------------------------- coverage --------------------------------- */

const prof = (spec) => ({
  sections: PROFILE_SECTIONS.map(({ key, title }) => {
    const v = spec[key];
    if (!v) return { key, title, text: '', drafted: false, chosen: [] };
    return { key, title, chosen: [], ...v };
  }),
});
const keys = PROFILE_SECTIONS.map((s) => s.key);

test('coverage: starting, growing, working, rich, and nextFocus is the thinnest', () => {
  const c0 = profileCoverage(prof({ about: { text: 'Hayden, 33.', drafted: true } }));
  assert.equal(c0.picture, 'starting');
  assert.equal(c0.draft, 1);
  assert.equal(c0.nextFocus.key, 'story');

  const grow = {};
  for (const k of keys.slice(0, 3)) grow[k] = { text: 'His line.', drafted: false };
  assert.equal(profileCoverage(prof(grow)).picture, 'growing');

  const work = {};
  keys.forEach((k, i) => { work[k] = i < 8 ? { text: 'His line.', drafted: false } : { text: 'Claude draft.', drafted: true }; });
  // one drafted section holds a said-line: his own words
  work.life = { text: 'Claude draft.\n- Bed by ten (said 2026-10-27)', drafted: true };
  const cw = profileCoverage(prof(work));
  assert.equal(cw.own, 9);
  assert.equal(cw.picture, 'working');
  assert.equal(cw.nextFocus.key, 'people', 'first drafted section with nothing of his');
  assert.match(coverageLine(cw), /^A working picture at 9 of 12 in your words\. There is no finish line/);

  const almost = {};
  for (const k of keys) almost[k] = { text: 'One.\nTwo.', drafted: false };
  assert.equal(profileCoverage(prof(almost)).picture, 'working', '24 own lines is not yet rich');
  const rich = {};
  for (const k of keys) rich[k] = { text: 'One.\nTwo.\nThree.', drafted: false };
  rich.taste = { text: 'One.', drafted: false };
  const cr = profileCoverage(prof(rich));
  assert.equal(cr.picture, 'rich');
  assert.equal(cr.nextFocus.key, 'taste');

  // a chosen option in a drafted section counts as his
  const opt = profileCoverage(prof({ talk: { text: 'Draft.\n- Short and direct', drafted: true, chosen: ['Short and direct'] } }));
  assert.equal(opt.sections.find((s) => s.key === 'talk').state, 'own');
});
