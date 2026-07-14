import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backupFile } from './backup.js';

export const RECIPES_REL_PATH = 'Wiki/Health/Meal Prep Recipe Collection.md';

const CATEGORY_TABLE_HEADING = {
  'CORE DAILY MEALS': 'Core Daily Meals',
  'ROTATION / SWAP MEALS': 'Rotation / Swap Meals',
  TREATS: 'Treats',
};

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

export function parseProfile(raw) {
  const m = raw.match(
    /\*\*Profile:\*\*\s*([\d.]+)kg,\s*([\d.]+)cm[^|]*\|\s*Cut target ~?([\d,.]+)\s*kcal\/day[^|]*\|\s*Protein floor\s*([\d.]+)g\+?\/day/i
  );
  if (!m) return null;
  return {
    weightKg: parseFloat(m[1]),
    heightCm: parseFloat(m[2]),
    targetKcal: parseFloat(m[3].replace(/,/g, '')),
    proteinFloorG: parseFloat(m[4]),
  };
}

export async function loadRecipes(vaultPath) {
  const full = path.join(vaultPath, RECIPES_REL_PATH);
  const raw = await readFile(full, 'utf8');
  return parseRecipeCollection(raw);
}

export async function loadRecipeData(vaultPath) {
  const full = path.join(vaultPath, RECIPES_REL_PATH);
  const raw = await readFile(full, 'utf8');
  return { recipes: parseRecipeCollection(raw), profile: parseProfile(raw) };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatRecipeBlock(num, input) {
  const macroLine = `**Macros:** ${input.macros.p}g P / ${input.macros.c}g C / ${input.macros.f}g F / ${input.macros.kcal} kcal`;
  const makesLine = input.makes ? `**Makes:** ${input.makes}\n` : '';
  const ingredientsHeading = input.makes ? `### Ingredients (${input.makes})` : '### Ingredients';
  const ingredientsBlock = input.ingredients.map((i) => `- ${i}`).join('\n');
  const methodBlock = input.method.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
  return (
    `## ${num}. ${input.name}\n\n` +
    `${macroLine}\n${makesLine}\n` +
    `${ingredientsHeading}\n${ingredientsBlock}\n\n` +
    `### Method\n${methodBlock}\n\n---\n\n`
  );
}

function insertQuickRefRow(raw, input) {
  const heading = CATEGORY_TABLE_HEADING[input.category];
  if (!heading) return raw;
  const re = new RegExp(
    `(###\\s+${escapeRe(heading)}\\s*\\n\\n\\|[^\\n]*\\n\\|[-| ]*\\n(?:\\|[^\\n]*\\n)*)`
  );
  const m = raw.match(re);
  if (!m) return raw; // best-effort — recipe body insert is the source of truth
  const row = `| ${input.name} | ${input.macros.p}g | ${input.macros.c}g | ${input.macros.f}g | ${input.macros.kcal} |\n`;
  const block = m[1] + row;
  return raw.slice(0, m.index) + block + raw.slice(m.index + m[1].length);
}

// Pure function: given the raw file text and a new-recipe input, returns the
// new file text. Kept separate from disk I/O so it can be unit-tested against
// the real file's content without ever writing to it.
export function insertRecipeIntoRaw(raw, input) {
  const existingCount = parseRecipeCollection(raw).length;
  const nextNum = existingCount + 1;

  const partRe = new RegExp(`^#\\s+PART\\s+\\d+\\s*\\u2014\\s*${escapeRe(input.category)}\\s*$`, 'm');
  const partMatch = partRe.exec(raw);
  if (!partMatch) {
    throw new Error(`Could not find a "${input.category}" section in the recipe file`);
  }

  const afterPartIdx = partMatch.index + partMatch[0].length;
  const rest = raw.slice(afterPartIdx);
  const nextHeadingMatch = rest.match(/\n#\s+PART\s+\d+/);
  const sectionEnd = nextHeadingMatch ? afterPartIdx + nextHeadingMatch.index + 1 : raw.length;

  const block = formatRecipeBlock(nextNum, input);
  const withRecipe = raw.slice(0, sectionEnd) + block + raw.slice(sectionEnd);
  return insertQuickRefRow(withRecipe, input);
}

// Serialize concurrent add-recipe calls (e.g. a double-submit) so a second
// read-modify-write can't start from a version of the file that doesn't yet
// include the first one's insertion.
let addRecipeLock = Promise.resolve();

export async function addRecipe(vaultPath, input) {
  const run = addRecipeLock.catch(() => {}).then(() => addRecipeUnlocked(vaultPath, input));
  addRecipeLock = run.catch(() => {});
  return run;
}

async function addRecipeUnlocked(vaultPath, input) {
  const full = path.join(vaultPath, RECIPES_REL_PATH);
  const raw = await readFile(full, 'utf8');
  const newRaw = insertRecipeIntoRaw(raw, input);

  // Sanity-check before touching disk: the new file must still parse, and
  // must contain exactly one more recipe than before.
  const before = parseRecipeCollection(raw);
  const after = parseRecipeCollection(newRaw);
  if (after.length !== before.length + 1) {
    throw new Error('Recipe insertion failed a sanity check — file left unchanged');
  }

  await backupFile(full);
  await writeFile(full, newRaw, 'utf8');
  return after.find((r) => r.name === input.name) || null;
}
