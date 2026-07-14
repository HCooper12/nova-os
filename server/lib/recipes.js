import { readFile } from 'node:fs/promises';
import path from 'node:path';

const RECIPES_REL_PATH = 'Wiki/Health/Meal Prep Recipe Collection.md';

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function stripMd(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

function section(body, heading) {
  const re = new RegExp(`###\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n###\\s|\\n##\\s|$)`, 'i');
  const m = body.match(re);
  return m ? m[1] : '';
}

function finalizeRecipe(name, bodyLines, category) {
  const body = bodyLines.join('\n');

  const macroMatch = body.match(/\*\*Macros[^*]*\*\*:?\s*([\d.]+)g P \/ ([\d.]+)g C \/ ([\d.]+)g F \/ ([\d.]+)\s*kcal/i);
  const makesMatch = body.match(/\*\*Makes:\*\*\s*(.+)/i);

  const ingredients = section(body, 'Ingredients')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const bullet = l.match(/^-\s*(.+)/);
      if (bullet) return { qty: '', name: stripMd(bullet[1]) };
      const groupLabel = l.match(/^\*\*(.+):\*\*$/);
      if (groupLabel) return { qty: '', name: `— ${groupLabel[1]} —`, group: true };
      return null;
    })
    .filter(Boolean);

  const method = section(body, 'Method')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\d+\.\s/.test(l))
    .map((l) => stripMd(l.replace(/^\d+\.\s*/, '')));

  const notes = [...body.matchAll(/^>\s*(.+)$/gm)].map((m) => stripMd(m[1]));

  // A few entries (e.g. "YoPro Yogurt") are just a line of prose with no
  // ### Ingredients / ### Method structure — fall back to showing that text
  // directly rather than an empty detail view.
  let description = null;
  if (!ingredients.length && !method.length) {
    description = stripMd(
      body
        .replace(/\*\*Macros[^*]*\*\*:?[^\n]*/i, '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('>') && !/^-{3,}$/.test(l))
        .join(' ')
        .trim()
    ) || null;
  }

  return {
    id: slugify(name),
    name,
    category,
    makes: makesMatch ? stripMd(makesMatch[1]) : null,
    macros: macroMatch
      ? { p: parseFloat(macroMatch[1]), c: parseFloat(macroMatch[2]), f: parseFloat(macroMatch[3]), kcal: parseFloat(macroMatch[4]) }
      : null,
    ingredients,
    method,
    description,
    notes,
  };
}

export function parseRecipeCollection(raw) {
  const lines = raw.split('\n');
  const recipes = [];
  let currentPart = '';
  let current = null;

  const flush = () => {
    if (current && current.bodyLines.some((l) => l.trim())) {
      recipes.push(finalizeRecipe(current.name, current.bodyLines, currentPart));
    }
    current = null;
  };

  for (const line of lines) {
    const partMatch = line.match(/^#\s+PART\s+\d+\s*—\s*(.+)$/);
    if (partMatch) {
      flush();
      currentPart = partMatch[1].trim();
      continue;
    }
    const recipeMatch = line.match(/^##\s+\d+\.\s+(.+)$/);
    if (recipeMatch) {
      flush();
      current = { name: recipeMatch[1].trim(), bodyLines: [] };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  flush();

  return recipes.filter((r) => r.macros); // drop any stray non-recipe ## heading that slipped through
}

export async function loadRecipes(vaultPath) {
  const full = path.join(vaultPath, RECIPES_REL_PATH);
  const raw = await readFile(full, 'utf8');
  return parseRecipeCollection(raw);
}
