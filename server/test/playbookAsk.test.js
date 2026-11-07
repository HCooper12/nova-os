// HOW HE ASKS: "learn this <link>", "learn from these", "turn this into a
// playbook" reach the playbook lane through the job grammar (chat, voice, Siri)
// and the capture path (Quick Capture, Telegram, the widget). A bare link and a
// quick "watch this" behave exactly as before. Lanes are stubs: nothing starts.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'nova-pbask-data-'));
process.env.CLAUDE_BIN = '/nonexistent/claude-must-not-run';

import test from 'node:test';
import assert from 'node:assert/strict';

const { runVerb, VERB_IDS } = await import('../lib/verbs.js'); // first: verbs and verbJobs import each other
const { parseJobCommand, _setJobLanesForTests } = await import('../lib/verbJobs.js');
const { startCapture } = await import('../lib/inbox.js');

const YT = 'https://www.youtube.com/watch?v=abcdefghijk';
const YT2 = 'https://youtu.be/lmnopqrstuv';
const REEL = 'https://www.instagram.com/reel/Dfa5usAARr3/';

test('the grammar: learn this, learn from these, turn into a playbook', () => {
  assert.deepEqual(parseJobCommand(`learn this ${YT}`), { verb: 'playbook.learn', args: { links: YT } });
  assert.deepEqual(parseJobCommand(`learn from these ${YT} ${YT2}`), { verb: 'playbook.learn', args: { links: `${YT} ${YT2}` } });
  assert.deepEqual(parseJobCommand(`turn this into a playbook ${REEL}`), { verb: 'playbook.learn', args: { links: REEL } });
  assert.deepEqual(parseJobCommand(`Please learn from this for my sales follow-up emails ${YT}`), { verb: 'playbook.learn', args: { links: YT, purpose: 'for my sales follow-up emails' } });
  assert.deepEqual(parseJobCommand(`learn this to write better follow ups: ${YT}`), { verb: 'playbook.learn', args: { links: YT, purpose: 'write better follow ups' } });
  assert.equal(parseJobCommand(`hey nova, make a playbook from ${YT}`).verb, 'playbook.learn');
});

test('what stays as it was: a bare link, a quick watch, a technique to learn, an analyse, two links with no learn word', () => {
  assert.equal(parseJobCommand(YT).verb, 'link.file');
  assert.equal(parseJobCommand(`watch this ${YT}`).verb, 'video.watch');
  assert.equal(parseJobCommand(`analyse this ${YT}`).verb, 'video.analyse');
  assert.notEqual(parseJobCommand(`learn this technique ${YT}`)?.verb, 'playbook.learn', 'a technique to learn is the Repertoire\'s');
  assert.equal(parseJobCommand(`${YT} ${YT2}`), null);
  assert.equal(parseJobCommand('learn this'), null, 'no link, no job: the model can still ACT with a link from earlier');
  assert.equal(parseJobCommand(`remind me to learn this ${YT}`), null);
});

test('the verb is in the registry the model reads, and runs the lane with the links and the purpose', async () => {
  assert.ok(VERB_IDS.includes('playbook.learn'));
  const seen = [];
  _setJobLanesForTests({ startLearn: async (v, o) => { seen.push(o); return { id: 'rec1', kind: 'playbook' }; } });
  try {
    const r = await runVerb('/vault', `learn from these for pricing ${YT} ${YT2}`, { verb: 'playbook.learn', args: { links: `${YT} ${YT2}`, purpose: 'pricing' } }, { source: 'text' });
    assert.deepEqual(seen[0], { urls: [YT, YT2], purpose: 'pricing' });
    assert.match(JSON.stringify(r), /Learning from those 2/);
  } finally { _setJobLanesForTests(null); }
});

test('the capture path (Quick Capture, Telegram): "learn this" starts the playbook lane; a bare link does not', async () => {
  const calls = [];
  const deps = {
    startLearn: async (v, o) => { calls.push(['learn', o]); return { id: 'x', kind: 'playbook' }; },
    startVideoWatch: async (v, u) => { calls.push(['watch', u]); return { id: 'w', kind: 'video' }; },
    fetchCaption: async () => null,
  };
  await startCapture('/vault', { text: `learn this for follow ups ${YT}` }, deps);
  assert.deepEqual(calls[0], ['learn', { urls: [YT], purpose: 'for follow ups' }]);
  await startCapture('/vault', { text: YT }, deps);
  assert.equal(calls[1][0], 'watch', 'a bare link still watches itself');
});
