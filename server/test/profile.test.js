// Profile — temp vault BEFORE imports.
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-profile-vault-'));
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const { getProfile, setProfile, profileContext } = await import('../lib/profile.js');

await mkdir(path.join(vault, 'Wiki'), { recursive: true });

test.after(async () => {
  await rm(vault, { recursive: true, force: true });
});

test('unset profile: null read, and a context block that tells the agent to nudge', async () => {
  assert.equal(await getProfile(vault), null);
  const ctx = await profileContext(vault);
  assert.match(ctx, /no profile set yet/);
  assert.match(ctx, /About You/);
});

test('set/get round-trips structured fields + free notes into an editable vault page', async () => {
  const saved = await setProfile(vault, {
    focus: 'Build my body and my content while working full-time',
    priorities: ['Get to 78kg lean', '  Ship one video a week  ', '', 'Protein consistency'],
    bestSelf: 'Disciplined but not rigid.',
    notes: 'Gym has only dumbbells on weekends. Left shoulder flares under heavy overhead.',
  });
  assert.equal(saved.focus, 'Build my body and my content while working full-time');
  assert.deepEqual(saved.priorities, ['Get to 78kg lean', 'Ship one video a week', 'Protein consistency']); // trimmed, blanks dropped
  assert.match(saved.updated, /^\d{4}-\d{2}-\d{2}$/);

  // it's a real vault page Hayden can edit by hand
  const raw = await readFile(path.join(vault, 'Wiki/Profile.md'), 'utf8');
  assert.equal(matter(raw).data.type, 'profile');
  assert.match(raw, /Left shoulder flares/);

  // priorities also accept a newline string (the client sends either shape)
  const fromString = await setProfile(vault, { focus: 'x', priorities: 'a\nb\n\nc' });
  assert.deepEqual(fromString.priorities, ['a', 'b', 'c']);

  await assert.rejects(() => setProfile(vault, { focus: '', priorities: [], bestSelf: '', notes: '' }), /add something/);
});

test('context block is compact, ordered, and leads with who he is', async () => {
  await setProfile(vault, { focus: 'Focus line', priorities: ['P1', 'P2'], bestSelf: 'Best', notes: 'Constraint' });
  const ctx = await profileContext(vault);
  assert.ok(ctx.startsWith('ABOUT HAYDEN'));
  assert.match(ctx, /Current focus: Focus line/);
  assert.match(ctx, /Priorities right now: P1; P2/);
  assert.match(ctx, /performing at his best.*Best/i);
  assert.match(ctx, /constraints: Constraint/);
});
