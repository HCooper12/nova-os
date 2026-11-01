// "TELL ME" OPENS THE VOICE CONVERSATION (T8, his call 1 Nov 2026). The seed
// turn carries the project and the card's document; the document reaches the
// model on that turn (context on a fresh session, the live line on a resumed
// one), is re-sent only when a fresh context is built, and a turn with
// neither is exactly what it was. The project page owns no voice of its own.
// CLAUDE_BIN is a stub that writes what it was told to a log; temp dirs only.
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = mkdtempSync(path.join(tmpdir(), 'nova-tellmev-'));
const log = path.join(base, 'told.log');
const stubBin = path.join(base, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let t = '';
  try { t = JSON.parse(line).message.content[0].text; } catch {}
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ t }) + '\\n');
  const out = 'Short answer.';
  process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: out }] } }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: out }) + '\\n');
});
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = path.join(base, 'data');
process.env.NOVA_PROJECTS_DIR = path.join(base, 'Projects');
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.NOVA_VAULT_GRACE_MS = '0';
const vault = path.join(base, 'vault');
mkdirSync(vault, { recursive: true });

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const express = (await import('express')).default;
const { docPlacement } = await import('../lib/projectContext.js');
const { voiceRouter } = await import('../routes/voice.js');
const { getMessageJob, _dropAllWarm } = await import('../lib/claudeCode.js');
const { novaKernel } = await import('../lib/novaProjects.js');
const { createRecord } = await import('../lib/inboxStore.js');
const { voiceAskExtras, voiceAttachOf, tellMeLine } = await import('../../src/projectVoice.js');

test.after(() => { _dropAllWarm(); rmSync(base, { recursive: true, force: true, maxRetries: 3 }); });

const k = novaKernel(vault);
const { project } = k.createProject({ name: 'Room redesign', kind: 'life', goal: 'A calmer bedroom', done: 'd', phases: [{ name: 'Look' }], reads: [], allowances: { research: true }, limit: {} });
const SYN = '# Room redesign · research synthesis\n\n- UNIQUE-RUG-LINE: a 2 by 3 metre rug fits the wall\n';
const w = k.writeResearch(project.id, { sources: [], synthesisFor: () => SYN });
const card = await createRecord({
  id: 'd0c0d0c0', kind: 'project-research', status: 'filed', projectId: project.id, text: 'Research: rug sizes', createdAt: new Date().toISOString(),
  decision: { route: 'project-research', title: 'Rug sizes', payload: { synthesis: [], sourceList: [] } },
  undoData: { route: 'project-research', projectId: project.id, ...w },
});

const ready = async (jobId) => { for (let i = 0; i < 400; i++) { const j = getMessageJob(jobId); if (j && j.status !== 'running') return j; await new Promise((r) => setTimeout(r, 15)); } return getMessageJob(jobId); };
const told = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l).t) : []);
function serve(t) {
  const app = express();
  app.use(express.json());
  app.use('/api', voiceRouter(vault));
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => { t.after(() => s.close()); r(s); }); });
}
const ask = async (s, body) => (await fetch(`http://127.0.0.1:${s.address().port}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

test('where the document goes: docRef once, heldDocRef only into a fresh context, neither: nowhere', () => {
  assert.deepEqual(docPlacement({ docRef: 'aaaaaaaa', sessionId: null }), { live: null, context: 'aaaaaaaa' });
  assert.deepEqual(docPlacement({ docRef: 'aaaaaaaa', sessionId: 's' }), { live: 'aaaaaaaa', context: null });
  assert.deepEqual(docPlacement({ heldDocRef: 'aaaaaaaa', sessionId: null }), { live: null, context: 'aaaaaaaa' });
  assert.deepEqual(docPlacement({ heldDocRef: 'aaaaaaaa', sessionId: 's' }), { live: null, context: null });
  assert.deepEqual(docPlacement({}), { live: null, context: null });
});

test('the client: the seed turn carries projectId and docRef, the turns after carry heldDocRef; detach clears both', () => {
  const vp = { id: project.id, name: 'Room redesign', doc: { id: card.id, title: 'Rug sizes' } };
  assert.deepEqual(voiceAskExtras({ voiceProject: vp }), { projectId: project.id, projectFresh: true, docRef: card.id });
  assert.deepEqual(voiceAskExtras({ voiceProject: vp, sentProjectId: project.id, sentDocId: card.id }), { projectId: project.id, heldDocRef: card.id });
  assert.deepEqual(voiceAskExtras({ voiceProject: null, sentDocId: card.id }), {}, 'detached: nothing rides');
  assert.equal(tellMeLine('Rug sizes'), 'Tell me about “Rug sizes”');
  const calls = [];
  const chip = voiceAttachOf({ voiceProject: vp }, { attachVoiceProject: (p) => calls.push(p), openProject: () => {}, cancelVoiceIntake: () => {} });
  assert.equal(chip.name, 'Room redesign');
  assert.equal(chip.doc, 'Rug sizes');
  chip.detach();
  assert.deepEqual(calls, [null], 'one × lets go of the project and its document');
});

test('over /api/ask: the seed turn hands the model the document; a later turn with no fresh context does not resend it', async (t) => {
  const s = await serve(t);
  const first = await ask(s, { question: tellMeLine('Rug sizes'), raw: tellMeLine('Rug sizes'), projectId: project.id, projectFresh: true, docRef: card.id });
  assert.ok(first.jobId, JSON.stringify(first));
  const j1 = await ready(first.jobId);
  assert.equal(j1.status, 'ready', j1.error);
  assert.match(told().at(-1), /THE DOCUMENT HE ASKED ABOUT — Rug sizes/);
  assert.match(told().at(-1), /UNIQUE-RUG-LINE/);
  const sid = j1.result.sessionId;
  assert.ok(sid);
  // a follow-up on the same session: the session already holds the document
  const second = await ask(s, { question: 'and for a smaller wall?', projectId: project.id, heldDocRef: card.id, sessionId: sid });
  await ready(second.jobId);
  assert.doesNotMatch(told().at(-1), /UNIQUE-RUG-LINE/, 'not sent twice to a session that holds it');
  // a fresh context (no session the server can resume): the document is sent again, capped
  const fresh = await ask(s, { question: 'remind me what it said', projectId: project.id, heldDocRef: card.id });
  await ready(fresh.jobId);
  assert.match(told().at(-1), /UNIQUE-RUG-LINE/, 'a rebuilt context carries the document again');
});

test('over /api/ask: Tell me on a resumed Voice session keeps that session and puts the document on its live line', async (t) => {
  const s = await serve(t);
  const opening = await ask(s, { question: 'what is my week like, briefly please' });
  const j = await ready(opening.jobId);
  const sid = j.result.sessionId;
  const tell = await ask(s, { question: tellMeLine('Rug sizes'), raw: tellMeLine('Rug sizes'), projectId: project.id, projectFresh: true, docRef: card.id, sessionId: sid });
  const jt = await ready(tell.jobId);
  assert.equal(jt.result.sessionId, sid, 'the conversation goes on in the same session');
  assert.match(told().at(-1), /UNIQUE-RUG-LINE/);
});

test('a missing document is named to the model, never silently dropped', async (t) => {
  const s = await serve(t);
  const r = await ask(s, { question: tellMeLine('Gone'), raw: tellMeLine('Gone'), projectId: project.id, docRef: 'deadbeef' });
  await ready(r.jobId);
  assert.match(told().at(-1), /the document he asked about \(deadbeef\)/);
});

test('the project page owns no voice for Tell me: its typed thread never reaches the TTS queue, and Tell me opens Voice', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('  sendProjectAsk(opts = {}) {');
  const body = app.slice(start, app.indexOf('\n  }\n', start));
  assert.ok(start > 0);
  assert.doesNotMatch(body, /speakTtsSentence|speak\(/, 'no spoken path on the project page');
  assert.doesNotMatch(app, /projectSpeaking|setProjectSpeaking/);
  const tell = app.slice(app.indexOf('  tellMeAbout(projectId, recordId) {'), app.indexOf('  sendProjectResearch(projectId) {'));
  assert.match(tell, /this\.navigate\('voice'\)/);
  assert.match(tell, /this\.askNova\(tellMeLine\(title\)\)/);
  assert.match(tell, /doc: \{ id: recordId, title \}/);
});
