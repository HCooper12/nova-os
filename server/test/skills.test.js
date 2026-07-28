// The skill registry — a vault page with a format contract, seeded only
// with what is actually built, loaded into agent contexts.
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const vault = await mkdtemp(path.join(tmpdir(), 'nova-skills-'));

import test from 'node:test';
import assert from 'node:assert/strict';

const { ensureSkillsFile, loadSkills, parseSkills, skillsContext, SKILLS_REL } = await import('../lib/skills.js');

test.after(async () => { await rm(vault, { recursive: true, force: true }); });

test('first load seeds the vault page; parse round-trips departments and autonomy', async () => {
  const created = await ensureSkillsFile(vault);
  assert.equal(created, true);
  const departments = await loadSkills(vault);
  const names = departments.map((d) => d.name);
  assert.deepEqual(names, ['Train', 'Fuel', 'Mind', 'Money', 'Knowledge', 'Logistics', 'Platform']);
  const train = departments.find((d) => d.name === 'Train');
  assert.ok(train.skills.some((s) => s.text.includes('program edits') && s.autonomy === 'propose'));
  assert.equal(await ensureSkillsFile(vault), false, 'never overwrites an existing page');
});

test('his edits are honoured — the page is the source of truth', async () => {
  const full = path.join(vault, SKILLS_REL);
  const raw = await readFile(full, 'utf8');
  await writeFile(full, raw + '\n## Custom\n- Water the plants on Sundays `(observe)`\n', 'utf8');
  const departments = await loadSkills(vault);
  const custom = departments.find((d) => d.name === 'Custom');
  assert.equal(custom.skills[0].text, 'Water the plants on Sundays');

  const ctx = await skillsContext(vault);
  assert.match(ctx, /WHAT NOVA CAN DO TODAY/);
  assert.match(ctx, /say plainly when something isn't on it yet/);
  assert.match(ctx, /Custom: Water the plants on Sundays \[observe\]/);
});

test('malformed lines are ignored, never guessed at', () => {
  const departments = parseSkills('## X\n- no autonomy tag here\n- real one `(propose)`\nnot a bullet');
  assert.equal(departments[0].skills.length, 1);
  assert.equal(departments[0].skills[0].autonomy, 'propose');
});
