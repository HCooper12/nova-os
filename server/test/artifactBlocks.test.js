// The document format every agent writes and every surface reads
// (src/artifactBlocks.js). His ask, 28 Sep: chat answers he can open, keep and
// come back to, like Claude's artefacts, instead of a wall of chat text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArtifactBlocks, messageParts, speakableText, artifactIds, docSegments, normaliseHeader, PENDING_TOKEN } from '../../src/artifactBlocks.js';

const REPLY = [
  "Here's the four-day version. I kept your exercises.",
  '<<<ARTIFACT {"title":"Four-day upper/lower plan","kind":"doc","summary":"Two upper, two lower, 50 minutes each"}',
  '# Four-day plan',
  '| Day | Session |',
  '|---|---|',
  '| Mon | Upper A |',
  '```nova',
  '{"kind":"bars","label":"Weekly sets","bars":[{"name":"Chest","value":12}]}',
  '```',
  'ARTIFACT>>>',
  'Open it when you have a minute.',
].join('\n');

test('a finished document is cut out whole and leaves a placeholder in the prose', () => {
  const r = parseArtifactBlocks(REPLY, { final: true });
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].header.title, 'Four-day upper/lower plan');
  assert.equal(r.blocks[0].header.kind, 'doc');
  assert.match(r.blocks[0].body, /^# Four-day plan/);
  assert.match(r.blocks[0].body, /```nova\n/);
  assert.doesNotMatch(r.text, /Mon \| Upper/, 'no document body in the chat text');
  assert.match(r.text, /kept your exercises\.\n\[\[artifact:new-0\]\]\nOpen it when/);
});

test('STREAMING: a half-arrived document is withheld and the bubble says one is being written', () => {
  const half = REPLY.slice(0, REPLY.indexOf('| Mon'));
  const r = parseArtifactBlocks(half, { final: false });
  assert.equal(r.blocks.length, 0);
  assert.equal(r.pending.title, 'Four-day upper/lower plan');
  assert.ok(r.text.endsWith(PENDING_TOKEN));
  assert.doesNotMatch(r.text, /\| Day/);
  // even the opening marker and a half header are withheld
  for (const cut of ['Here it is.\n<<<ART', 'Here it is.\n<<<ARTIFACT {"title":"Four']) {
    assert.doesNotMatch(parseArtifactBlocks(cut).text, /<<<|title/, cut);
  }
});

test('nothing of a document is ever spoken', () => {
  assert.equal(speakableText(REPLY, { final: true }), "Here's the four-day version. I kept your exercises.\nOpen it when you have a minute.");
  assert.equal(speakableText(REPLY.slice(0, 200)), "Here's the four-day version. I kept your exercises.");
});

test('a forgiving reader: synonyms, no header, an unclosed document at the end, html in a fence', () => {
  assert.equal(normaliseHeader({ name: 'Plan', description: 'short' }).title, 'Plan');
  assert.equal(normaliseHeader({ heading: 'X', caption: 'c' }).summary, 'c');
  const noHeader = parseArtifactBlocks('<<<ARTIFACT\n## Macro split\ntext\nARTIFACT>>>', { final: true });
  assert.equal(noHeader.blocks[0].header.title, 'Macro split');
  const unclosed = parseArtifactBlocks('Done.\n<<<ARTIFACT {"title":"T"}\n# T\nbody', { final: true });
  assert.equal(unclosed.blocks.length, 1, 'the model forgot to close it — it is still filed');
  const html = parseArtifactBlocks('<<<ARTIFACT {"title":"Calc","kind":"tool"}\n```html\n<!doctype html><p>x</p>\n```\nARTIFACT>>>', { final: true });
  assert.equal(html.blocks[0].header.kind, 'html');
  assert.equal(html.blocks[0].body, '<!doctype html><p>x</p>');
  const sniffed = parseArtifactBlocks('<<<ARTIFACT {"title":"C"}\n<html><body>hi</body></html>\nARTIFACT>>>', { final: true });
  assert.equal(sniffed.blocks[0].header.kind, 'html', 'a page is a page even when the header did not say so');
  assert.equal(parseArtifactBlocks('<<<ARTIFACT {"title":"E"}\n\nARTIFACT>>>', { final: true }).blocks.length, 0, 'an empty document is not filed');
});

test('two documents in one reply, and a message\'s parts for the bubble', () => {
  const two = parseArtifactBlocks('A\n<<<ARTIFACT {"title":"One"}\nx\nARTIFACT>>>\nB\n<<<ARTIFACT {"title":"Two"}\ny\nARTIFACT>>>\nC', { final: true });
  assert.deepEqual(two.blocks.map((b) => b.header.title), ['One', 'Two']);
  const parts = messageParts('Intro.\n[[artifact:a1b2c3d4]]\nOutro.');
  assert.deepEqual(parts, [{ type: 'text', text: 'Intro.' }, { type: 'artifact', id: 'a1b2c3d4' }, { type: 'text', text: 'Outro.' }]);
  assert.deepEqual(messageParts('Hi\n<<<ARTIFACT {"title":"Plan"}\n# P', { final: false }).map((p) => p.type), ['text', 'pending']);
  assert.deepEqual(artifactIds('x [[artifact:abcd1234]] [[artifact:new-0]] [[artifact:pending]] [[artifact:abcd1234]]'), ['abcd1234']);
});

test('a doc body splits into markdown and glass panels; a broken panel stays as code', () => {
  const segs = docSegments('# T\ntext\n```nova\n{"kind":"metric","label":"Sets","value":"18"}\n```\nmore\n```nova\n{not json\n```');
  assert.deepEqual(segs.map((s) => s.type), ['md', 'panel', 'md', 'md']);
  assert.equal(segs[1].spec.kind, 'metric');
  assert.match(segs[3].text, /\{not json/);
});
