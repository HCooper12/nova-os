import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-mentor-rep-'));
process.env.NOVA_DATA_DIR = dir;

let M;
before(async () => { M = await import('../lib/mentorRepeats.js'); });
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// Deterministic made-up talk: n words from a seeded generator, so each
// "episode" has its own words and a clip is a real slice of one.
function talk(seed, n) {
  const vocab = 'we talk about conversations people arguments listen calm voice pause question answer label truth fear feel safe trust story boss team family home work next because when then always never more less first last little big'.split(' ');
  let x = seed;
  const out = [];
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) % 2147483648; out.push(vocab[x % vocab.length]); }
  return out;
}
const asText = (words) => words.map((w, i) => (i % 40 === 0 ? `\n[${String(Math.floor(i / 40)).padStart(2, '0')}:00] ${w}` : w)).join(' ');

test('a signature is sorted, unique, and ignores time marks, case and punctuation', () => {
  const words = talk(7, 3000);
  const a = M.signature(asText(words));
  const b = M.signature(words.map((w, i) => (i % 9 === 0 ? `${w.toUpperCase()},` : w)).join(' '));
  assert.ok(a instanceof Int32Array);
  assert.ok(a.length > 50, `sampled about 1 in 16: ${a.length}`);
  assert.deepEqual([...a], [...b]);
  for (let i = 1; i < a.length; i++) assert.ok(a[i] > a[i - 1]);
  assert.deepEqual([...M.signature(asText(words))], [...a], 'stable');
  assert.equal(M.signature('too short').length, 0);
  assert.equal(M.containment(new Int32Array(), new Set([1])), 0);
});

test('the worked example: a compilation of E, F and G goes, E stays, clips of E go, F and G stay', () => {
  const E = talk(1, 6000);
  const F = talk(2, 5000);
  const G = talk(3, 5000);
  const K = [...E, ...F, ...G];
  // four clips that together cover 70% of E
  const clips = [[0, 1000], [1500, 2600], [3000, 4100], [4500, 5700]].map(([a, b]) => E.slice(a, b));
  const items = [
    { key: 'yt:E', durationSec: 3600, sig: M.signature(E.join(' ')) },
    { key: 'yt:F', durationSec: 3000, sig: M.signature(F.join(' ')) },
    { key: 'yt:G', durationSec: 3000, sig: M.signature(G.join(' ')) },
    { key: 'yt:K', durationSec: 9600, sig: M.signature(K.join(' ')) },
    ...clips.map((c, i) => ({ key: `yt:C${i}`, durationSec: 600 + i, sig: M.signature(c.join(' ')) })),
  ];
  const out = M.findRepeats(items);
  assert.deepEqual(out.map((r) => r.key).sort(), ['yt:C0', 'yt:C1', 'yt:C2', 'yt:C3', 'yt:K']);
  const k = out.find((r) => r.key === 'yt:K');
  assert.ok(k.share >= 0.85);
  assert.deepEqual(k.of.slice(0, 3).sort(), ['yt:E', 'yt:F', 'yt:G']);
  for (const c of out.filter((r) => r.key.startsWith('yt:C'))) assert.equal(c.of[0], 'yt:E');
  // deterministic whatever order the items arrive in
  assert.deepEqual(M.findRepeats([...items].reverse()), out);
});

test('identical twins keep exactly one: the later in the walk is the repeat', () => {
  const words = talk(9, 4000).join(' ');
  const a = { key: 'yt:aaa', durationSec: 1200, sig: M.signature(words) };
  const b = { key: 'yt:bbb', durationSec: 1200, sig: M.signature(words) };
  const out = M.findRepeats([b, a]);
  assert.deepEqual(out.map((r) => r.key), ['yt:bbb']);
  assert.deepEqual(out[0].of, ['yt:aaa']);
  assert.deepEqual(M.findRepeats([a, b]), out);
});

test('a signature survives the binary round trip; a missing one is null', async () => {
  const sig = M.signature(talk(4, 2000).join(' '));
  await M.saveSignature('pod:abc:def', sig);
  assert.ok(fs.existsSync(path.join(dir, 'mentors', 'signatures', 'pod_abc_def.i32')));
  assert.deepEqual([...(await M.loadSignature('pod:abc:def'))], [...sig]);
  assert.equal(await M.loadSignature('yt:none'), null);
});
