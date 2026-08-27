// The CEO's org chart — session recording, transcript reading, and the
// cleaning that keeps plumbing out of quoted conversation.
// Temp data dir BEFORE imports; the transcript fixture lives under a fake
// HOME so the reader's real path logic runs against it.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-agents-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';

const { projectSlug, cleanTurnText, recordAgentSession, agentTranscriptTail, agentConversationContext } = await import('../lib/agentSessions.js');

test('projectSlug flattens exactly like the CLI names its project dirs', () => {
  assert.equal(
    projectSlug("/Users/haydencooper/Library/Mobile Documents/iCloud~md~obsidian/Documents/Hayden's Vault"),
    '-Users-haydencooper-Library-Mobile-Documents-iCloud-md-obsidian-Documents-Hayden-s-Vault',
  );
});

test('cleanTurnText strips reminders, situation blocks and typed directives — not conversation', () => {
  const reminder = '[Standing reminder: you CAN change his program…]\n\nHow is my bench going?';
  assert.equal(cleanTurnText(reminder), 'How is my bench going?');
  // the REAL reminder runs past 1200 chars, and the live preamble isn't
  // bracketed at all — both shapes came from his actual transcript
  const long = `[Standing reminder: ${'x'.repeat(1500)}]\n\nLIVE UPDATE (recomputed this turn — supersedes earlier numbers): HRV 75.\n\nShall I deload?`;
  assert.equal(cleanTurnText(long), 'Shall I deload?');
  const situation = '[Mid-brief decision context: …]\n\n[On his screen right now — …: A card…]\n\nWhat is the point of that?';
  assert.equal(cleanTurnText(situation), 'What is the point of that?');
  const proposal = 'The swap makes sense — less elbow stress.\n\nPROPOSE {"action":"swap","routine":"Pull"}';
  assert.equal(cleanTurnText(proposal), 'The swap makes sense — less elbow stress.');
  const reflect = 'Noted, and well done.\n\nREFLECT {"working":["one-on-ones"]}';
  assert.equal(cleanTurnText(reflect), 'Noted, and well done.');
  assert.equal(cleanTurnText('I put [emphasis] on form here.'), 'I put [emphasis] on form here.', 'brackets mid-sentence are his words, not plumbing');
});

test('the tail reads a real-shaped CLI transcript and skips prompt, tools and noise', async () => {
  // fake HOME so ~/.claude/projects resolves inside the sandbox
  const home = await mkdtemp(path.join(tmpdir(), 'nova-agents-home-'));
  const realHomedir = os.homedir;
  os.homedir = () => home;
  try {
    const cwd = '/tmp/fake vault';
    const sessionId = 'abc123';
    const dir = path.join(home, '.claude', 'projects', projectSlug(cwd));
    await mkdir(dir, { recursive: true });
    const lines = [
      { type: 'user', message: { role: 'user', content: 'NOVA OPERATING LENS — reason through this…' + 'x'.repeat(2000) } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Good morning, sir. Pull is logged.' }] } },
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'file bytes' }] } },
      { type: 'user', message: { role: 'user', content: '[Standing reminder: …]\n\nShould I deload this week?' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Not yet — HRV is fine.\n\nPROPOSE {"action":"tune","exercise":"Bench"}' }] } },
    ];
    await writeFile(path.join(dir, `${sessionId}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n'), 'utf8');

    await recordAgentSession('coach', cwd, sessionId);
    const tail = await agentTranscriptTail('coach');
    assert.equal(tail.turns.length, 3, 'prompt and tool_result skipped');
    assert.equal(tail.turns[1].text, 'Should I deload this week?');
    assert.equal(tail.turns[2].text, 'Not yet — HRV is fine.');

    const ctx = await agentConversationContext('coach', 'Coach');
    assert.ok(ctx.includes('Hayden: Should I deload this week?'));
    assert.ok(ctx.includes('Coach: Not yet — HRV is fine.'));
    assert.ok(!ctx.includes('PROPOSE'), 'directives never quoted back');

    // unknown agent → honest absence, not an empty section
    assert.equal(await agentConversationContext('leader', 'the Leader'), null);
  } finally {
    os.homedir = realHomedir;
  }
});
