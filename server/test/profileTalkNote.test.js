// HE CUT IN, IN THE ABOUT-YOU CONVERSATION (1 Nov 2026). The About-you
// conversation builds its own prompt (lib/profileTalk.js), so the note
// App.askNova sends after a cut (src/interruptTurn.js) never reached it. Now
// App.answerProfileTalk sends it as `note`; the route hands it to the prompt
// beside his words, before them, and never as them. The model is stubbed
// through the router's deps.run seam. Temp data dir + temp vault BEFORE any
// lib import, so nothing lands in his live server/data.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-proftalk-note-data-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { interruptNote } from '../../src/interruptTurn.js';

const { profileRouter } = await import('../routes/profile.js');
const { buildProfileTalkPrompt } = await import('../lib/profileTalk.js');

const PAGE = `---
type: profile
updated: '2026-09-01'
---
# Profile

## About me

Hayden, 33.
`;

const vaults = [];
async function vault() {
  const v = await mkdtemp(path.join(tmpdir(), 'nova-proftalk-note-vault-'));
  vaults.push(v);
  await mkdir(path.join(v, 'Wiki'), { recursive: true });
  await writeFile(path.join(v, 'Wiki/Profile.md'), PAGE, 'utf8');
  return v;
}
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
const stub = (seen) => async (lane, prompt) => {
  seen.push(prompt);
  return { text: JSON.stringify({ say: 'Toowoomba, then. What did you love there?', learned: [], confirmed: [] }), provider: 'claude', model: 'sonnet' };
};

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const v of vaults) await rm(v, { recursive: true, force: true });
});

const CUT = { inAir: 'Where did you grow up?', unsaid: 'And what took you to Melbourne?' };
const NOTE = interruptNote(CUT);
const HIS = 'Toowoomba, mostly.';

test('the route passes the note through: in the prompt, before his words, never in the transcript', async () => {
  const seen = [];
  const { server, call } = await serve(await vault(), { run: stub(seen) });
  try {
    const history = [{ who: 'nova', text: 'Where did you grow up? And what took you to Melbourne?' }];
    const r = await call('POST', '/profile/talk', { history, text: HIS, note: NOTE });
    assert.equal(r.status, 200);
    const prompt = seen[0];
    const noteAt = prompt.indexOf(NOTE);
    const wordsAt = prompt.indexOf('HIS NEW WORDS:');
    assert.ok(noteAt > 0, 'the note is in the prompt');
    assert.ok(noteAt < wordsAt, 'the note comes before his words');
    assert.ok(noteAt > prompt.indexOf('- IF HE CUTS IN, take in what he said first.'), 'beside TURN_TAKING, which says what it means');
    // his words are his alone
    assert.equal(prompt.slice(wordsAt).trim(), `HIS NEW WORDS:\n${HIS}`);
    // the conversation so far (the transcript the model reads) never carries it
    const transcript = prompt.slice(prompt.indexOf('THE CONVERSATION SO FAR:'), prompt.indexOf('HOW THIS CONVERSATION WORKS:'));
    assert.ok(!transcript.includes('He cut in'), 'the transcript is not the note');
    // and nothing the route hands back records it
    assert.ok(!JSON.stringify(r.body).includes('He cut in'));
  } finally { server.close(); }
});

test('no note, no bracket: a turn he did not cut reads as it always did', async () => {
  const seen = [];
  const { server, call } = await serve(await vault(), { run: stub(seen) });
  try {
    await call('POST', '/profile/talk', { history: [], text: HIS });
    await call('POST', '/profile/talk', { history: [], text: HIS, note: 42 });   // not a string: ignored
    for (const p of seen) assert.ok(!p.includes('He cut in'));
    assert.equal(seen[0], seen[1]);
  } finally { server.close(); }
});

test('buildProfileTalkPrompt places the note after TURN_TAKING and before his words', () => {
  const base = { profile: null, history: [], text: HIS, today: '2026-11-01' };
  const without = buildProfileTalkPrompt(base);
  const withNote = buildProfileTalkPrompt({ ...base, note: NOTE });
  assert.ok(!without.includes('He cut in'));
  assert.ok(withNote.indexOf(NOTE) > withNote.indexOf('HOW YOU TAKE A TURN'));
  assert.ok(withNote.indexOf(NOTE) < withNote.indexOf('HIS NEW WORDS:'));
  // the note is the only difference
  assert.equal(withNote.replace(`\n${NOTE}\n`, ''), without);
});

// ---- the wiring, read from the source (App.jsx is a class over a browser) ----
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const body = (name) => {
  const at = app.indexOf(`\n  ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  return app.slice(at, app.indexOf('\n  }\n', at));
};

test('answerProfileTalk sends the note once, beside his words; the history row is his words', () => {
  const b = body('answerProfileTalk');
  assert.match(b, /const cut = interruptFresh\(this\.lastInterrupt\) \? this\.lastInterrupt\.rec : null;\n\s*this\.lastInterrupt = null;/, 'consumed once, like askNova');
  assert.match(b, /const note = interruptNote\(cut\) \|\| null;/);
  assert.match(b, /api\.profileTalk\(conn, history, text, \{[^}]*\bnote \}\)/);
  assert.match(b, /history: \[\.\.\.history, \{ who: 'you', text \}\]/, 'the transcript row is his words only');
  assert.ok(!/text: [^,}]*note/.test(b), 'the note is never put in a text');
  const api = readFileSync(new URL('../../src/api.js', import.meta.url), 'utf8');
  const line = api.split('\n').find((l) => l.trim().startsWith('profileTalk:'));
  assert.ok(line.includes('note = null } = {})'), 'api.profileTalk takes note');
  assert.ok(line.includes("'/api/profile/talk'") && line.includes('...(note ? { note } : {})'), 'and sends it only when there is one');
});
