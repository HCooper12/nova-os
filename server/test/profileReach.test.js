// THE PROOF HE ASKED FOR (27 Oct 2026): "Ensure Nova is undoubtedly referring
// to and using all of this information and it is not just something I'm
// filling out for no purpose."
//   1. Every lane in PROFILE_READERS really calls profileContext( in its
//      source, and the ones that talk to him also call talkPrefsBlock(.
//   2. Any module in server/lib that carries NOVA_LENS is either a reader or
//      exempted with a reason. A new agent that forgets him fails here.
//   3. His "How to talk to me" section reaches the Nova, Coach and Leader
//      prompts right before TURN_TAKING, and nothing is added when it is empty.
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-reach-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const { PROFILE_READERS, PROFILE_EXEMPT } = await import('../lib/profileReach.js');
const { talkPrefsBlock, TURN_TAKING } = await import('../lib/talk.js');
const { buildAskPrompt, buildCoachPrompt, buildLeaderPrompt } = await import('../lib/claudeCode.js');

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFile(path.join(SERVER, rel), 'utf8');
// iCloud makes "name 2.js" duplicates beside real files; they are not modules
const isDuplicate = (f) => / \d+\.js$/.test(f);

const vaults = [];
async function vault(page) {
  const v = await mkdtemp(path.join(tmpdir(), 'nova-reach-vault-'));
  vaults.push(v);
  await mkdir(path.join(v, 'Wiki'), { recursive: true });
  if (page !== null) await writeFile(path.join(v, 'Wiki/Profile.md'), page, 'utf8');
  return v;
}

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  for (const v of vaults) await rm(v, { recursive: true, force: true });
});

test('every reader calls profileContext(, and every reader that talks calls talkPrefsBlock(', async () => {
  const ids = new Set();
  for (const r of PROFILE_READERS) {
    assert.ok(r.id && r.label && r.module && typeof r.talks === 'boolean', `malformed reader ${JSON.stringify(r)}`);
    assert.ok(!ids.has(r.id), `duplicate reader id ${r.id}`);
    ids.add(r.id);
    const own = await src(r.module);
    assert.ok(own.includes('profileContext('), `${r.label} (${r.module}) never calls profileContext(`);
    if (r.talks) {
      const all = [own, ...await Promise.all((r.also || []).map(src))].join('\n');
      assert.ok(all.includes('talkPrefsBlock('), `${r.label} talks to him but never calls talkPrefsBlock(`);
    }
  }
});

test('a module in server/lib that carries NOVA_LENS is a profile reader or exempted with a reason', async () => {
  const covered = new Set(PROFILE_READERS.flatMap((r) => [r.module, ...(r.also || [])]));
  const files = (await readdir(path.join(SERVER, 'lib'))).filter((f) => f.endsWith('.js') && !isDuplicate(f));
  const missing = [];
  for (const f of files) {
    const rel = `lib/${f}`;
    if (!(await src(rel)).includes('NOVA_LENS')) continue;
    if (covered.has(rel)) continue;
    if (typeof PROFILE_EXEMPT[rel] === 'string' && PROFILE_EXEMPT[rel].trim()) continue;
    missing.push(rel);
  }
  assert.deepEqual(missing, [], `these lanes reason with NOVA_LENS but never read his profile: ${missing.join(', ')} — add profileContext to them and list them in PROFILE_READERS, or exempt them with a reason`);
  // an exemption that names no real file is stale
  for (const rel of Object.keys(PROFILE_EXEMPT)) assert.ok(files.includes(rel.replace(/^lib\//, '')), `stale exemption ${rel}`);
});

test('the profile-talk lane carries talkPrefsBlock( (it is exempt from profileContext, not from this)', async () => {
  assert.ok((await src('lib/profileTalk.js')).includes('talkPrefsBlock('));
});

test('Nova, Coach and Leader callers pass his talk preferences on his own turns', async () => {
  const cc = await src('lib/claudeCode.js');
  for (const b of ['buildAskPrompt', 'buildCoachPrompt', 'buildLeaderPrompt']) {
    assert.match(cc, new RegExp(`${b}\\(\\{[^}]*talkPrefs: consulted \\? '' : talkPrefsBlock\\(cwd\\)`), `${b}'s caller does not pass talkPrefsBlock(cwd)`);
  }
});

const PAGE = `---
type: profile
---
# Profile

## How to talk to me

- Ask me before you advise
Keep it under three sentences.
`;

test('his talk preferences sit right before TURN_TAKING in the Nova, Coach and Leader prompts; absent when empty', async () => {
  const withPrefs = talkPrefsBlock(await vault(PAGE));
  assert.equal(withPrefs, 'HOW HE WANTS NOVA TO TALK TO HIM (his profile; follow it in every reply; it outranks style defaults, never honesty or safety):\n- Ask me before you advise\n- Keep it under three sentences.');
  const empty = talkPrefsBlock(await vault('---\ntype: profile\n---\n# Profile\n\n## About me\n\nHayden.\n'));
  assert.equal(empty, '');

  const prompts = {
    nova: (t) => buildAskPrompt({ question: 'hi', context: 'ctx', talkPrefs: t }),
    coach: (t) => buildCoachPrompt({ question: 'hi', context: 'ctx', talkPrefs: t }),
    leader: (t) => buildLeaderPrompt({ question: 'hi', context: 'ctx', talkPrefs: t }),
  };
  for (const [name, build] of Object.entries(prompts)) {
    const p = build(withPrefs);
    const at = p.indexOf(withPrefs);
    assert.ok(at > 0, `${name}: preferences missing`);
    assert.equal(p.slice(at + withPrefs.length, at + withPrefs.length + 2 + TURN_TAKING.length), `\n\n${TURN_TAKING}`, `${name}: preferences must sit right before TURN_TAKING`);
    assert.ok(p.lastIndexOf(TURN_TAKING) > at, `${name}: TURN_TAKING stays last`);
    const bare = build(empty);
    assert.doesNotMatch(bare, /HOW HE WANTS NOVA TO TALK TO HIM/, `${name}: nothing added when the section is empty`);
    assert.match(bare, /HOW YOU TAKE A TURN/);
  }
  // a consulted turn answers another agent, in a brief: no preferences there
  const consulted = buildAskPrompt({ question: 'q', consulted: { by: 'coach', question: 'q' } });
  assert.doesNotMatch(consulted, /HOW HE WANTS NOVA TO TALK TO HIM/);
});
