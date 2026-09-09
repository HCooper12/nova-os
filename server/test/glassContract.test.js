// THE CONTRACT THE AGENTS ARE GIVEN.
//
// Written after taking the live server down for half a minute: a pair of
// backticks inside the backtick-delimited contract string was a syntax error,
// and nothing caught it until launchd refused to start. Importing the module
// in the suite is the cheapest possible guard against that whole class.
//
// The second test is the one that matters more. Ask Nova's prompt ALREADY had
// a section called "THE GLASS" — the single CARD line at the end of a reply —
// and adding a second section with the same name and a different mechanism
// made the model obey the older one and emit nothing. Two contracts in one
// prompt must not share a name, and must say which wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLASS_CONTRACT } from '../lib/visualStream.js';
import { buildAskPrompt, buildCoachPrompt, buildLeaderPrompt } from '../lib/claudeCode.js';
import { VISUAL_KINDS, parseVisualStream } from '../../src/visualBeats.js';

test('the contract is a real string that survived being written', () => {
  assert.equal(typeof GLASS_CONTRACT, 'string');
  assert.ok(GLASS_CONTRACT.length > 400);
  assert.ok(!GLASS_CONTRACT.includes('`'), 'a backtick in here is a syntax error in the file that holds it');
});

test('it names every kind the parser can actually draw', () => {
  for (const k of VISUAL_KINDS) assert.ok(GLASS_CONTRACT.includes(`"${k}"`) || GLASS_CONTRACT.includes(`- ${k} `), `${k} is undocumented`);
});

test('its own example parses — the shape it teaches is the shape we read', () => {
  const line = GLASS_CONTRACT.split('\n').find((l) => l.trim().startsWith('VIS {'));
  assert.ok(line, 'the contract shows no example');
  const { beats, text } = parseVisualStream(`${line.replace('…', 'key').replace('…', 'A LABEL').replace('…', 'a caption')}\nSome prose.`);
  assert.equal(text, 'Some prose.');
  assert.equal(beats.length, 1, 'the example the agents copy must parse');
});

test('THE COLLISION: it does not share a heading with the CARD directive', () => {
  const ask = buildAskPrompt({ question: 'q', context: 'c' });
  assert.ok(ask.includes('THE GLASS:'), 'the older single-card directive is still there');
  assert.ok(ask.includes('THE RUNNING GLASS'), 'and the new one is named apart from it');
  // and it says which wins, or the model picks the one it saw first
  assert.match(GLASS_CONTRACT, /never both/i);
});

test('all three conversational agents carry it', () => {
  for (const [name, p] of [
    ['ask', buildAskPrompt({ question: 'q', context: 'c' })],
    ['coach', buildCoachPrompt({ question: 'q', context: 'c' })],
    ['leader', buildLeaderPrompt({ question: 'q', context: 'c' })],
  ]) assert.ok(p.includes('THE RUNNING GLASS'), `${name} was not given the contract`);
});

test('it demands a panel on the long answers he complained about', () => {
  assert.match(GLASS_CONTRACT, /REQUIRED/);
  assert.match(GLASS_CONTRACT, /three sentences/);
});
