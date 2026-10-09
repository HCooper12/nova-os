// WHAT A WAITING SESSION LAST SAID (his call 2, 10 Oct 2026). The quote is
// read from the session's own journal, made one plain line, and scrubbed of
// anything shaped like a secret BEFORE it leaves the server. Journals here
// are temporary files; his real ~/.claude is never read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.NOVA_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nova-quote-data-'));
const { scrubSecrets, quoteLine, lastAssistantQuote, QUOTE_MAX } = await import('../lib/sessionQuote.js');
const { sessionsNow } = await import('../lib/claudeSessionsLive.js');

test('the scrubber removes token-shaped strings and keeps ordinary words, paths and git ids', () => {
  const secrets = {
    anthropic: 'sk-ant-api03-Zx8Qp2Lm9Vt4Rk7Ws1Yn6Bc3Hd5Jf0Gu2Ki8AbCdEf',
    openai: 'sk-proj-abcdefghijklmnopqrstuvwxyz012345',
    github: 'ghp_0123456789abcdefghijABCDEFGHIJ012345',
    githubPat: 'github_pat_11ABCDEFG0123456789_abcdefghijklmnop',
    slack: 'xoxb-1234567890-abcdefghijkl',
    aws: 'AKIAIOSFODNN7EXAMPLE',
    google: 'AIzaSyA1234567890abcdefghijklmnopqrstuv',
    stripe: 'sk_live_51HxYzAbCdEfGhIjKlMnOp',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    random: 'Zx8Qp2Lm9Vt4Rk7Ws1Yn6Bc3Hd5Jf0Gu2Ki8',
  };
  for (const [name, s] of Object.entries(secrets)) {
    const out = scrubSecrets(`before ${s} after`);
    assert.ok(!out.includes(s), `${name} survived: ${out}`);
    assert.match(out, /^before .*\[hidden\].* after$/, name);
  }
  const assigned = [
    'API_TOKEN=4f9a8b7c6d5e4f3a2b1c',
    'ANTHROPIC_API_KEY: abc123def456ghi789',
    'password = "hunter2hunter2"',
    'client_secret=Zm9vYmFyYmF6cXV4',
  ];
  for (const s of assigned) {
    const out = scrubSecrets(s);
    assert.match(out, /\[hidden\]/, s);
    assert.ok(!/hunter2|4f9a8b7c|abc123def|Zm9vYmFy/.test(out), out);
  }
  assert.ok(!scrubSecrets('Authorization: Bearer abcdef0123456789abcdef').includes('abcdef0123456789abcdef'));
  assert.equal(scrubSecrets('postgres://admin:hunter22@db.example.com/x'), 'postgres://[hidden]@db.example.com/x');
  assert.ok(!scrubSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----').includes('MIIEow'));
  // ordinary text stays exactly as it is
  for (const keep of [
    'Shall I commit the redesign brief, or leave it for the other session?',
    'see /Users/haydencooper/Desktop/Files/Claude Projects/Atomic_Hub/P3_Draft3/Atlas_Progress_Map/REDESIGN-BRIEF.md',
    'commit e7053e4a1b2c3d4e5f60718293a4b5c6d7e8f901 landed on main',
    'deeply-nested-feature-folder-0/deeply-nested-feature-folder-1/AComponent2.jsx',
    'the token budget is 4,000 and the key point is clarity',
  ]) assert.equal(scrubSecrets(keep), keep);
});

test('a quote is one plain line: code blocks named, marks off, capped at a word without splitting an emoji', () => {
  assert.equal(quoteLine('**Done.** The `tide` sheet asks first.\n\n- one\n- two'), 'Done. The tide sheet asks first. one two');
  assert.equal(quoteLine('Here it is:\n```js\nconst token = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"\n```\nShall I ship it?'), 'Here it is: [code] Shall I ship it?');
  assert.equal(quoteLine('```\nonly code\n```'), 'A code block, and nothing said around it.');
  assert.equal(quoteLine(''), '');
  assert.equal(quoteLine('   \n\n  '), '');
  const long = 'Word '.repeat(600) + 'end';
  const q = quoteLine(long);
  assert.ok(Array.from(q).length <= QUOTE_MAX, `capped: ${Array.from(q).length}`);
  assert.ok(q.endsWith('…'));
  const emoji = '🧪'.repeat(400);
  const qe = quoteLine(emoji);
  assert.ok(Array.from(qe).length <= QUOTE_MAX);
  assert.ok(!/[\uD800-\uDBFF]…$/.test(qe), 'no half an emoji before the ellipsis');
  assert.equal(quoteLine('Check [the brief](https://example.com/x) first'), 'Check the brief first');
});

function journal(lines) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nova-quote-j-'));
  const file = path.join(dir, 's.jsonl');
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}
const said = (text, at = '2026-10-10T09:41:00.000Z', model = 'claude-opus-5-5') => ({ type: 'assistant', timestamp: at, message: { model, content: [{ type: 'text', text }] } });
const tool = (at = '2026-10-10T09:42:00.000Z') => ({ type: 'assistant', timestamp: at, message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x' } }] } });
const result = () => ({ type: 'user', timestamp: '2026-10-10T09:42:01.000Z', message: { content: [{ type: 'tool_result', content: 'file text' }] } });
const his = (text) => ({ type: 'user', timestamp: '2026-10-10T09:43:00.000Z', message: { content: text } });

test('the last thing the assistant SAID, walking back past tool calls; none after his own words; none from a broken journal', () => {
  const q = lastAssistantQuote(journal([his('Go'), said('Which page first, the map or the brief? My token is ghp_0123456789abcdefghijABCDEFGHIJ012345'), tool(), result(), tool()]));
  assert.equal(q.text, 'Which page first, the map or the brief? My token is [hidden]');
  assert.equal(q.at, Date.parse('2026-10-10T09:41:00.000Z'));
  assert.equal(q.model, 'claude-opus-5-5');
  assert.equal(lastAssistantQuote(journal([said('Earlier words'), his('Thanks, carry on')])), null, 'he spoke last: nothing of its to quote');
  assert.equal(lastAssistantQuote(journal([his('Go'), tool(), result()])), null, 'only tool calls: no quote');
  assert.equal(lastAssistantQuote(journal([said('')])), null, 'an empty message is no quote');
  assert.equal(lastAssistantQuote('/nowhere/at/all.jsonl'), null);
  const f = journal([said('Fine words')]);
  writeFileSync(f, 'not json\n{"type":"assistant",\n' + JSON.stringify(said('Still found')) + '\n{broken');
  assert.equal(lastAssistantQuote(f).text, 'Still found');
  // a 2,000-character message comes back capped
  const big = lastAssistantQuote(journal([said('x'.repeat(10) + ' ' + 'long words here '.repeat(130))]));
  assert.ok(Array.from(big.text).length <= QUOTE_MAX);
});

test('sessionsNow attaches the quote to a waiting or stuck session only, read from its own journal', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'nova-quote-home-'));
  const cwd = '/Users/x/Desktop/Files/Claude Projects/atlas-partner';
  const now = Date.parse('2026-10-10T09:50:00.000Z');
  const waiting = '44444444-4444-4444-8444-444444444444';
  const working = '55555555-5555-4555-8555-555555555555';
  const jdir = path.join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(jdir, { recursive: true });
  writeFileSync(path.join(jdir, `${waiting}.jsonl`), JSON.stringify(said('Shall I run the source check on chapter 4? key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz', '2026-10-10T09:45:00.000Z')) + '\n');
  writeFileSync(path.join(jdir, `${working}.jsonl`), JSON.stringify(said('Reading now', '2026-10-10T09:49:00.000Z')) + '\n');
  const agents = [
    { sessionId: waiting, cwd, kind: 'interactive', status: 'idle', name: 'Reading-list sweep', startedAt: now - 3600_000 },
    { sessionId: working, cwd, kind: 'interactive', status: 'busy', name: 'Source check', startedAt: now - 600_000 },
  ];
  const pic = await sessionsNow({ execFn: async () => JSON.stringify(agents), now, home });
  const all = pic.groups.flatMap((g) => g.sessions);
  const w = all.find((s) => s.sessionId === waiting);
  const b = all.find((s) => s.sessionId === working);
  assert.equal(w.state, 'waiting');
  assert.equal(w.quote.text, 'Shall I run the source check on chapter 4? key=[hidden]');
  assert.equal(w.quote.at, Date.parse('2026-10-10T09:45:00.000Z'));
  assert.equal(b.state, 'working');
  assert.equal(b.quote, null, 'a working session is not asking anything');
  // a reader that throws is no quote, never a broken picture
  const p2 = await sessionsNow({ execFn: async () => JSON.stringify(agents), now, home, readQuote: () => { throw new Error('boom'); } });
  assert.equal(p2.groups[0].sessions.find((s) => s.sessionId === waiting).quote, null);
});
