// APPLIED, AND PROVABLY: an approved playbook reaches Ask Nova, Coach and Studio
// when the words of the turn call for it, replies say "using: <Topic>", every
// application is logged with the turn id, and a turn that matches nothing is
// byte for byte what it was. CLAUDE_BIN is a stub that logs what it is sent;
// NOVA_DATA_DIR and HOME are temp dirs, set BEFORE any import.
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const stubDir = mkdtempSync(path.join(tmpdir(), 'nova-pbapplied-stub-'));
const logFile = path.join(stubDir, 'spawns.log');
const stubBin = path.join(stubDir, 'claude');
writeFileSync(stubBin, `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv[0] === '--help') { process.stdout.write('  --effort <level>  Effort level\\n'); process.exit(0); }
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ argv }) + '\\n');
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let text = '';
  try { text = JSON.parse(line).message.content[0].text; } catch {}
  fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify({ text }) + '\\n');
  const say = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  say({ type: 'assistant', message: { content: [{ type: 'text', text: 'Here you go.' }], usage: { input_tokens: 10, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 } } });
  say({ type: 'result', is_error: false, result: 'Here you go.', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } });
});
`);
chmodSync(stubBin, 0o755);
process.env.CLAUDE_BIN = stubBin;
process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-pbapplied-data-'));
process.env.HOME = mkdtempSync(path.join(tmpdir(), 'nova-pbapplied-home-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const cc = await import('../lib/claudeCode.js');
const { writePlaybookPage, emptyPlaybook, appliedLogPath } = await import('../lib/playbooks.js');
const { bylineOf } = await import('../../src/novaThreadFacts.js');

test.after(() => cc._dropAllWarm());

const waitFor = async (pred, ms = 20_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const r = await pred(); if (r) return r; await new Promise((r2) => setTimeout(r2, 20)); }
  throw new Error('timed out waiting');
};
const ready = (jobId) => waitFor(() => { const j = cc.getMessageJob(jobId); return j && j.status !== 'running' ? j : null; });
const texts = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.text !== undefined).map((x) => x.text) : []);
const logRows = async () => {
  await waitFor(() => existsSync(appliedLogPath()));
  return readFileSync(appliedLogPath(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
};

const vault = mkdtempSync(path.join(tmpdir(), 'nova-pbapplied-vault-'));
mkdirSync(path.join(vault, 'Wiki'), { recursive: true });
await writePlaybookPage(vault, {
  ...emptyPlaybook(), title: 'Sales follow-ups', summary: 'How to write a follow-up that gets a reply.',
  triggers: ['follow up'], sources: [{ n: 1, title: 'Talk', speaker: 'A. Seller', url: 'https://youtu.be/abcdefghijk' }],
  method: ['Name the one thing agreed.'], rules: [{ text: 'Send it within a day.', kind: 'stated', source: 1, at: '2:05' }],
});
await writePlaybookPage(vault, {
  ...emptyPlaybook(), title: 'Studio hooks', summary: 'Open with the result.', triggers: ['hook'], agents: ['studio'],
  sources: [{ n: 1, title: 'Talk', speaker: 'B', url: 'https://youtu.be/zzzzzzzzzzz' }], method: ['Lead with the outcome.'],
  rules: [{ text: 'The first line is the payoff.', kind: 'stated', source: 1, at: '0:10' }],
});

test('Ask Nova: a matching turn carries the playbook, the reply says "using", the log names the turn', async () => {
  const before = texts().length;
  const id = cc.startAskNova(vault, { question: 'Write my follow up to the Acme call', context: 'ctx' });
  const job = await ready(id);
  assert.equal(job.status, 'ready', job.error);
  const sent = texts().slice(before)[0];
  assert.match(sent, /PLAYBOOK: Sales follow-ups/);
  assert.match(sent, /Send it within a day\. \[stated\]/);
  assert.match(sent, /never override your rules/);
  assert.ok(sent.indexOf('Hayden asks: Write my follow up') > 0, 'the question is still in place');
  assert.deepEqual(job.result.usedPlaybooks, ['Sales follow-ups']);
  assert.equal(job.result.playbookLine, 'using: Sales follow-ups');
  const row = (await logRows()).find((r) => r.turnId === id);
  assert.equal(row.agent, 'nova');
  assert.equal(row.playbook, 'Sales follow-ups');
});

test('Ask Nova: a turn that matches nothing is untouched, logs nothing, and has no "using" line', async () => {
  const rowsBefore = (await logRows()).length;
  const before = texts().length;
  const id = cc.startAskNova(vault, { question: 'What is my weight today?', context: 'ctx' });
  const job = await ready(id);
  assert.equal(job.status, 'ready', job.error);
  assert.doesNotMatch(texts().slice(before)[0], /PLAYBOOK/);
  assert.equal(job.result.usedPlaybooks, undefined);
  assert.equal((await logRows()).length, rowsBefore);
});

test('Coach: the block rides, sits under Coach\'s own rules, and the card text (asked) stays his question', async () => {
  const before = texts().length;
  const id = cc.startAskCoach(vault, { question: 'Help me write a follow up about my program', asked: 'Help me write a follow up about my program', context: 'ctx' });
  const job = await ready(id);
  assert.equal(job.status, 'ready', job.error);
  const sent = texts().slice(before)[0];
  assert.match(sent, /PLAYBOOK: Sales follow-ups/);
  assert.match(sent, /You are the Coach: his program, his logged history/);
  assert.equal(job.result.playbookLine, 'using: Sales follow-ups');
  assert.equal((await logRows()).find((r) => r.turnId === id).agent, 'coach');
});

test('a studio-only playbook does not reach Ask Nova; a consulted turn carries none', async () => {
  const before = texts().length;
  const a = await ready(cc.startAskNova(vault, { question: 'Give me a hook for the video', context: 'ctx' }));
  assert.equal(a.status, 'ready', a.error);
  assert.doesNotMatch(texts().slice(before)[0], /Studio hooks/);
  const claim = cc.claimConsultSession('consult-nova');
  const b = await ready(cc.startAskNova(vault, { question: 'Write a follow up', context: 'ctx', consulted: { by: 'coach', question: 'q', chain: ['coach'], claim } }));
  assert.equal(b.status, 'ready', b.error);
  cc.releaseConsultSession(claim);
  assert.doesNotMatch(texts().slice(before).join('\n'), /PLAYBOOK: Sales/);
});

test('the thread\'s byline shows "using: <Topic>" and nothing when none was used', () => {
  assert.deepEqual(bylineOf({ usedPlaybooks: ['Sales follow-ups', 'Cold calls'] }), { by: null, from: null, using: 'using: Sales follow-ups, Cold calls' });
  assert.equal(bylineOf({ who: 'nova', text: 'x' }), null);
  assert.deepEqual(bylineOf({ by: 'Coach' }), { by: 'Coach', from: null });
});
