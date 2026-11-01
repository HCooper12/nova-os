#!/usr/bin/env node
// A stand-in for server/bin/nova-apple-llm (server/apple-llm/main.swift) in
// tests: the same JSON lines on stdin/stdout, no Swift, no Apple
// Intelligence. Tests point NOVA_APPLE_LLM_BIN here. What it does is steered
// by the prompt text, so one stub covers every case:
//   FAIL:<text>  → { id, error: <text> }        (the helper's plain error)
//   FENCE        → a ```json fenced reply         (what Apple's model does)
//   DIE          → exits mid-request             (a helper that crashes)
//   HANG         → never answers                 (a stuck generation)
//   anything else → { id, text: "apple says: <prompt>" }
// APPLE_STUB_UNAVAILABLE=1 makes health answer unavailable.
// APPLE_STUB_LOG=<file> appends every request line, so a test can check what
// Node sent (system, json, maxTokens).
import { appendFileSync } from 'node:fs';
import readline from 'node:readline';

const unavailable = process.env.APPLE_STUB_UNAVAILABLE === '1';
const availability = unavailable ? 'unavailable: appleIntelligenceNotEnabled' : 'available';
const send = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

if (process.argv.includes('--health')) {
  send({ ok: !unavailable, availability });
  process.exit(unavailable ? 1 : 0);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  if (process.env.APPLE_STUB_LOG) appendFileSync(process.env.APPLE_STUB_LOG, `${line}\n`);
  let req;
  try { req = JSON.parse(line); } catch { send({ error: 'not a JSON object' }); return; }
  if (req.op === 'health') { send({ id: req.id, ok: !unavailable, availability }); return; }
  if (unavailable) { send({ id: req.id, error: `Apple's on-device model is ${availability}` }); return; }
  const prompt = String(req.prompt || '');
  if (!prompt.trim()) { send({ id: req.id, error: 'empty prompt' }); return; }
  if (prompt.startsWith('FAIL:')) { send({ id: req.id, error: prompt.slice(5) }); return; }
  if (prompt.includes('DIE')) process.exit(3);
  if (prompt.includes('HANG')) return;
  if (prompt.includes('FENCE')) { send({ id: req.id, text: '```json\n{"route": "todo"}\n```' }); return; }
  send({ id: req.id, text: `apple says: ${prompt}` });
});
