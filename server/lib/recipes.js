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

// Alternates nest their own Ingredients/Method one heading level deeper
// (##### instead of ###) so they don't get swallowed by the parent
// recipe's own ### Ingredients / ### Method extraction above.
function section5(body, heading) {
  const re = new RegExp(`#####\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n#####\\s|\\n####\\s|\\n###\\s|\\n##\\s|$)`, 'i');
  const m = body.match(re);
  return m ? m[1] : '';
}

function parseAlternates(raw) {
  const chunks = raw.split(/\n(?=####\s+Alternative:)/);
  const alternates = [];
  for (const chunk of chunks) {
    const headingMatch = chunk.match(/^####\s+Alternative:\s*(.+)$/m);
    if (!headingMatch) continue;
    const label = headingMatch[1].trim();
    const macroMatch = chunk.match(/\*\*Macros[^*]*\*\*:?\s*([\d.]+)g P \/ ([\d.]+)g C \/ ([\d.]+)g F \/ ([\d.]+)\s*kcal/i);
    const ingredients = section5(chunk, 'Ingredients')
      .split('\n')
      .map((l) => l.trim())
      .map((l) => l.match(/^-\s*(.+)/))
      .filter(Boolean)
      .map((m) => stripMd(m[1]));
    const method = section5(chunk, 'Method')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\d+\.\s/.test(l))
      .map((l) => stripMd(l.replace(/^\d+\.\s*/, '')));
    alternates.push({
      id: slugify(label),
      label,
      macros: macroMatch
        ? { p: parseFloat(macroMatch[1]), c: parseFloat(macroMatch[2]), f: parseFloat(macroMatch[3]), kcal: parseFloat(macroMatch[4]) }
        : null,
      ingredients,
      method,
    });
  }
  return alternates;
}

function finalizeRecipe(name, bodyLines, category) {
  const altIdx = bodyLines.findIndex((l) => /^####\s+Alternative:/.test(l));
  const mainLines = altIdx === -1 ? bodyLines : bodyLines.slice(0, altIdx);
  const alternates = altIdx === -1 ? [] : parseAlternates(bodyLines.slice(altIdx).join('\n'));
  const body = mainLines.join('\n');

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
    alternates,
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
  const ingredients = input.ingredients || [];
  const method = input.method || [];
  // Macro-only "quick" recipe (e.g. a snack promoted straight from a scan): no
  // ingredient/method sections, just macros + a one-line description. The parser
  // already treats a body with no Ingredients/Method headings as a description
  // (finalizeRecipe), so this round-trips cleanly and reads honestly.
  if (!ingredients.length && !method.length) {
    const desc = (input.description && String(input.description).trim()) || 'Saved from the food tracker.';
    return `## ${num}. ${input.name}\n\n${macroLine}\n${makesLine}\n${desc}\n\n---\n\n`;
  }
  const ingredientsHeading = input.makes ? `### Ingredients (${input.makes})` : '### Ingredients';
  const ingredientsBlock = ingredients.map((i) => `- ${i}`).join('\n');
  const methodBlock = method.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
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

// Pure: remove a recipe's whole "## n. Name … ---" block (by slug id) plus its
// quick-ref table row. The block runs to the next "## "/"# " heading — not the
// ###/#### inside it. Numbers aren't renumbered: the parser keys by slug and
// ignores the number, so a gap is cosmetic. Kept separate from I/O for testing.
export function removeRecipeFromRaw(raw, id) {
  const re = /^##\s+\d+\.\s+(.+)$/gm;
  let m;
  let startIdx = -1;
  let name = null;
  while ((m = re.exec(raw))) {
    if (slugify(m[1].trim()) === id) { startIdx = m.index; name = m[1].trim(); break; }
  }
  if (startIdx === -1) throw new Error('recipe not found');
  const afterHeading = raw.slice(startIdx + m[0].length);
  const nextHeading = afterHeading.match(/\n#{1,2}(?!#)\s/);
  const endIdx = nextHeading ? startIdx + m[0].length + nextHeading.index + 1 : raw.length;
  let text = raw.slice(0, startIdx) + raw.slice(endIdx);
  // Exactly the row's own line + its single newline — [^\n]* can't cross lines,
  // so this never swallows the blank line that follows the table (an earlier
  // \s*\n did, since \s matches newlines, which drifted the file on undo).
  const rowRe = new RegExp(`^\\|\\s*${escapeRe(name)}\\s*\\|[^\\n]*\\n`, 'm');
  text = text.replace(rowRe, '');
  return text;
}

export async function removeRecipe(vaultPath, id) {
  const run = addRecipeLock.catch(() => {}).then(() => removeRecipeUnlocked(vaultPath, id));
  addRecipeLock = run.catch(() => {});
  return run;
}

async function removeRecipeUnlocked(vaultPath, id) {
  const full = path.join(vaultPath, RECIPES_REL_PATH);
  const raw = await readFile(full, 'utf8');
  const before = parseRecipeCollection(raw);
  const target = before.find((r) => r.id === id);
  if (!target) return { removed: 0 };
  const newRaw = removeRecipeFromRaw(raw, id);
  const after = parseRecipeCollection(newRaw);
  if (after.length !== before.length - 1) {
    throw new Error('Recipe removal failed a sanity check — file left unchanged');
  }
  await backupFile(full);
  await writeFile(full, newRaw, 'utf8');
  return { removed: 1, recipe: target };
}

function formatAlternateBlock(alt) {
  const macroLine = `**Macros:** ${alt.macros.p}g P / ${alt.macros.c}g C / ${alt.macros.f}g F / ${alt.macros.kcal} kcal`;
  const ingredientsBlock = alt.ingredients.map((i) => `- ${i}`).join('\n');
  const methodBlock = alt.method.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
  return `#### Alternative: ${alt.label}\n\n${macroLine}\n\n##### Ingredients\n${ingredientsBlock}\n\n##### Method\n${methodBlock}\n`;
}

// Pure function: splices a new "#### Alternative: ..." block into an
// existing recipe's section (after its own content, before the closing
// "---" that separates it from the next recipe/part heading). Kept
// separate from disk I/O so it can be tested against real file content
// without ever writing to it.
export function insertAlternateIntoRaw(raw, recipeName, alt) {
  const headingRe = new RegExp(`^##\\s+\\d+\\.\\s+${escapeRe(recipeName)}\\s*$`, 'm');
  const headingMatch = headingRe.exec(raw);
  if (!headingMatch) throw new Error(`Could not find recipe "${recipeName}" in the file`);

  const afterHeadingIdx = headingMatch.index + headingMatch[0].length;
  const rest = raw.slice(afterHeadingIdx);
  // Next "## " (recipe) or "# " (PART) heading only — not ### / #### which
  // belong to this recipe's own Ingredients/Method/Alternative content.
  const nextHeadingMatch = rest.match(/\n#{1,2}(?!#)\s/);
  const blockEnd = nextHeadingMatch ? afterHeadingIdx + nextHeadingMatch.index + 1 : raw.length;

  let block = raw.slice(afterHeadingIdx, blockEnd);
  const hadSeparator = /\n---\n\s*$/.test(block);
  if (hadSeparator) block = block.replace(/\n---\n\s*$/, '\n');

  const altText = formatAlternateBlock(alt);
  const newBlock = block.replace(/\s*$/, '\n\n') + altText + (hadSeparator ? '\n---\n\n' : '');

  return raw.slice(0, afterHeadingIdx) + newBlock + raw.slice(blockEnd);
}

// Serialize concurrent alternate-add calls against the same file.
let addAlternateLock = Promise.resolve();

export async function addAlternate(vaultPath, recipeName, alt) {
  const run = addAlternateLock.catch(() => {}).then(() => addAlternateUnlocked(vaultPath, recipeName, alt));
  addAlternateLock = run.catch(() => {});
  return run;
}

async function addAlternateUnlocked(vaultPath, recipeName, alt) {
  const full = path.join(vaultPath, RECIPES_REL_PATH);
  const raw = await readFile(full, 'utf8');
  const newRaw = insertAlternateIntoRaw(raw, recipeName, alt);

  const before = parseRecipeCollection(raw).find((r) => r.name === recipeName);
  const after = parseRecipeCollection(newRaw).find((r) => r.name === recipeName);
  if (!after || after.alternates.length !== (before?.alternates.length || 0) + 1) {
    throw new Error('Alternate insertion failed a sanity check — file left unchanged');
  }

  await backupFile(full);
  await writeFile(full, newRaw, 'utf8');
  return after;
}
