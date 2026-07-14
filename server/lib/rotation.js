import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

const ROTATION_REL_PATH = 'Wiki/Health/Daily Rotation.md';
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

function bodyFor(slots, recipesById) {
  const lines = SLOTS.map((s) => {
    const id = slots[s];
    const r = id ? recipesById.get(id) : null;
    return `- **${SLOT_LABELS[s]}:** ${r ? r.name : '_none selected_'}`;
  });
  return `# Daily Rotation\n\nCurrent meal selections, managed via Nova OS. Edit here or in Nova → Recipes.\n\n${lines.join('\n')}\n`;
}

function resolve(slots, recipesById) {
  const resolved = {};
  const totals = { p: 0, c: 0, f: 0, kcal: 0 };
  for (const s of SLOTS) {
    const id = slots[s] || null;
    const r = id ? recipesById.get(id) : null;
    resolved[s] = r ? { id: r.id, name: r.name, macros: r.macros } : null;
    if (r && r.macros) {
      totals.p += r.macros.p;
      totals.c += r.macros.c;
      totals.f += r.macros.f;
      totals.kcal += r.macros.kcal;
    }
  }
  return { slots: resolved, totals };
}

async function readSlots(vaultPath) {
  const full = path.join(vaultPath, ROTATION_REL_PATH);
  if (!existsSync(full)) return {};
  const raw = await readFile(full, 'utf8');
  return matter(raw).data.slots || {};
}

export async function loadRotation(vaultPath, recipes) {
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const slots = await readSlots(vaultPath);
  return resolve(slots, recipesById);
}

export async function setRotationSlot(vaultPath, recipes, slot, recipeId) {
  if (!SLOTS.includes(slot)) throw new Error('invalid slot');
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  if (recipeId && !recipesById.has(recipeId)) throw new Error('unknown recipe id');

  const full = path.join(vaultPath, ROTATION_REL_PATH);
  const slots = await readSlots(vaultPath);
  if (recipeId) slots[slot] = recipeId;
  else delete slots[slot];

  const frontmatter = { type: 'rotation', updated: new Date().toISOString().slice(0, 10), slots };
  const content = matter.stringify(bodyFor(slots, recipesById), frontmatter);

  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  await writeFile(full, content, 'utf8');

  return resolve(slots, recipesById);
}
