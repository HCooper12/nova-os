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

/* --------------------- promote an alternate to primary ------------------- */
// "This tweak IS the meal now" — e.g. the per-bar Biscoff macros replacing
// the full-batch numbers. The alternate's macros (and its ingredients/method,
// when it has them) become the recipe's main content; the OLD main content is
// preserved as an alternate named "Original", so promotion is reversible by
// promoting Original back. The rotation inherits the new macros automatically.
export function promoteAlternateInRaw(raw, recipeName, altId) {
  const headingRe = new RegExp(`^##\\s+\\d+\\.\\s+${escapeRe(recipeName)}\\s*$`, 'm');
  const headingMatch = headingRe.exec(raw);
  if (!headingMatch) throw new Error(`Could not find recipe "${recipeName}" in the file`);
  const afterHeadingIdx = headingMatch.index + headingMatch[0].length;
  const rest = raw.slice(afterHeadingIdx);
  const nextHeadingMatch = rest.match(/\n#{1,2}(?!#)\s/);
  const blockEnd = nextHeadingMatch ? afterHeadingIdx + nextHeadingMatch.index + 1 : raw.length;
  let block = raw.slice(afterHeadingIdx, blockEnd);

  const parsed = parseRecipeCollection(raw).find((r) => r.name === recipeName);
  if (!parsed) throw new Error(`Could not parse recipe "${recipeName}"`);
  const alt = (parsed.alternates || []).find((a) => a.id === altId);
  if (!alt) throw new Error(`"${recipeName}" has no alternate "${altId}"`);
  if (!alt.macros) throw new Error(`alternate "${alt.label}" has no macros to promote`);

  // 1. main macro line ← alternate's macros
  const macroLineRe = /\*\*Macros[^*]*\*\*:?\s*[\d.]+g P \/ [\d.]+g C \/ [\d.]+g F \/ [\d.]+\s*kcal/i;
  if (!macroLineRe.test(block)) throw new Error('could not locate the main macro line');
  block = block.replace(macroLineRe, `**Macros:** ${alt.macros.p}g P / ${alt.macros.c}g C / ${alt.macros.f}g F / ${alt.macros.kcal} kcal`);

  // 2. main ingredients/method ← alternate's, ONLY when the alternate has its
  //    own (a macro-only tweak — reportioning — keeps the original steps)
  // NOTE the end-of-STRING anchor `$(?![\s\S])`: with the m flag a bare `$`
  // matches every line end, so the lazy body stopped after ONE line and left
  // the rest of the old list behind — the shopping-list duplication bug.
  if (alt.ingredients.length) {
    block = block.replace(
      /(^###\s+Ingredients[^\n]*\n)([\s\S]*?)(?=\n###\s|\n####\s|\n##\s|$(?![\s\S]))/m,
      (_, h) => `${h}${alt.ingredients.map((x) => `- ${x}`).join('\n')}\n`
    );
  }
  if (alt.method.length) {
    block = block.replace(
      /(^###\s+Method[^\n]*\n)([\s\S]*?)(?=\n###\s|\n####\s|\n##\s|$(?![\s\S]))/m,
      (_, h) => `${h}${alt.method.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n`
    );
  }

  // 3. the promoted alternate's block ← the OLD main content, as "Original"
  const originalLabel = (parsed.alternates || []).some((a) => /^original\b/i.test(a.label))
    ? `Original (${new Date().toISOString().slice(0, 10)})`
    : 'Original';
  const oldMain = {
    label: originalLabel,
    macros: parsed.macros,
    ingredients: alt.ingredients.length ? parsed.ingredients.map((i) => (i.qty ? `${i.qty} ${i.name}` : i.name)) : [],
    method: alt.method.length ? parsed.method : [],
  };
  const altBlockRe = new RegExp(`####\\s+Alternative:\\s*${escapeRe(alt.label)}\\s*\\n[\\s\\S]*?(?=\\n####\\s|\\n###\\s|\\n##\\s|\\n---|$)`);
  if (!altBlockRe.test(block)) throw new Error('could not locate the alternate block to swap');
  block = block.replace(altBlockRe, formatAlternateBlock(oldMain).trimEnd() + '\n');

  return raw.slice(0, afterHeadingIdx) + block + raw.slice(blockEnd);
}

let promoteLock = Promise.resolve();
export async function promoteAlternate(vaultPath, recipeId, altId) {
  const run = promoteLock.catch(() => {}).then(async () => {
    const full = path.join(vaultPath, RECIPES_REL_PATH);
    const raw = await readFile(full, 'utf8');
    const before = parseRecipeCollection(raw).find((r) => r.id === recipeId);
    if (!before) throw new Error('recipe not found');
    const alt = (before.alternates || []).find((a) => a.id === altId);
    const newRaw = promoteAlternateInRaw(raw, before.name, altId);
    const after = parseRecipeCollection(newRaw).find((r) => r.id === recipeId);
    // sanity: macros moved, alternate count unchanged (swap, not a loss)
    if (!after || after.macros.kcal !== alt.macros.kcal || after.alternates.length !== before.alternates.length) {
      throw new Error('Promotion failed a sanity check — file left unchanged');
    }
    await backupFile(full);
    await writeFile(full, newRaw, 'utf8');
    return after;
  });
  promoteLock = run.catch(() => {});
  return run;
}

/* ----------------------- rename an alternate's label --------------------- */
// A variant's ID is the slug of its label, so renaming CHANGES the id — any
// today-variant override pointing at the old id must migrate with it, or the
// slot would silently fall back to the main recipe. Pure part first.
export function renameAlternateInRaw(raw, recipeName, altId, newLabel) {
  const label = String(newLabel || '').replace(/\s+/g, ' ').trim();
  if (!label) throw new Error('a variant needs a name');
  if (label.length > 80) throw new Error('keep a variant name under 80 characters');
  if (/[\n#]/.test(label)) throw new Error('a variant name can\'t contain # or line breaks');

  const parsed = parseRecipeCollection(raw).find((r) => r.name === recipeName);
  if (!parsed) throw new Error(`Could not parse recipe "${recipeName}"`);
  const alt = (parsed.alternates || []).find((a) => a.id === altId);
  if (!alt) throw new Error(`"${recipeName}" has no variant "${altId}"`);
  if (alt.label === label) return { raw, newId: alt.id, oldId: alt.id };
  if ((parsed.alternates || []).some((a) => a.id !== altId && a.label.toLowerCase() === label.toLowerCase())) {
    throw new Error(`"${recipeName}" already has a variant called "${label}"`);
  }

  // rewrite ONLY this recipe's heading for this alternate
  const headingRe = new RegExp(`^##\\s+\\d+\\.\\s+${escapeRe(recipeName)}\\s*$`, 'm');
  const hm = headingRe.exec(raw);
  if (!hm) throw new Error(`Could not find recipe "${recipeName}" in the file`);
  const start = hm.index;
  const after = raw.slice(start + hm[0].length);
  const nextHeading = after.match(/\n#{1,2}(?!#)\s/);
  const end = nextHeading ? start + hm[0].length + nextHeading.index + 1 : raw.length;
  let block = raw.slice(start, end);

  const altHeadingRe = new RegExp(`^(####\\s+Alternative:\\s*)${escapeRe(alt.label)}\\s*$`, 'm');
  if (!altHeadingRe.test(block)) throw new Error('could not locate the variant heading to rename');
  block = block.replace(altHeadingRe, (_, head) => `${head}${label}`);

  return { raw: raw.slice(0, start) + block + raw.slice(end), newId: slugify(label), oldId: alt.id };
}

let renameAltLock = Promise.resolve();
export async function renameAlternate(vaultPath, recipeId, altId, newLabel) {
  const run = renameAltLock.catch(() => {}).then(async () => {
    const full = path.join(vaultPath, RECIPES_REL_PATH);
    const raw = await readFile(full, 'utf8');
    const before = parseRecipeCollection(raw).find((r) => r.id === recipeId);
    if (!before) throw new Error('recipe not found');
    const { raw: newRaw, newId, oldId } = renameAlternateInRaw(raw, before.name, altId, newLabel);
    if (newRaw === raw) return { recipe: before, newId, oldId };

    const after = parseRecipeCollection(newRaw).find((r) => r.id === recipeId);
    // sanity: same number of variants, the new name present, content intact
    const renamed = after && (after.alternates || []).find((a) => a.id === newId);
    if (!after || after.alternates.length !== before.alternates.length || !renamed) {
      throw new Error('Rename failed a sanity check — file left unchanged');
    }
    const wasAlt = before.alternates.find((a) => a.id === oldId);
    if (renamed.ingredients.length !== wasAlt.ingredients.length || renamed.method.length !== wasAlt.method.length) {
      throw new Error('Rename would have altered the variant\'s content — file left unchanged');
    }

    await backupFile(full);
    await writeFile(full, newRaw, 'utf8');
    return { recipe: after, newId, oldId };
  });
  renameAltLock = run.catch(() => {});
  return run;
}

// ---------------------------------------------------------------------------
// Editing an existing recipe (or one of its variants) in place.
//
// Everything Nova can put on the plate — a recipe he typed, one it scanned,
// one it suggested as a tweak — has to be correctable, or the collection
// slowly fills with things that are almost right and can't be fixed. The
// rules that make that safe:
//   * only the fields passed are touched; notes, makes, group labels and every
//     other variant are left byte-for-byte alone;
//   * macros travel with ingredients, because changing what's in a meal and
//     leaving the old numbers behind would make the file lie;
//   * a prose-only entry (macros + a sentence, no headings — how a scanned
//     snack is stored) grows real sections the first time it's edited;
//   * the result is re-parsed and sanity-checked before anything hits disk.
// ---------------------------------------------------------------------------

// How each list is written to, and read back from, the file. `read` returns the
// plain text the app shows; `text` returns the raw markdown after the bullet or
// number, so a line can be moved without losing its **bold**.
const LIST_KINDS = {
  ingredients: {
    is: (l) => /^-\s/.test(l) || /^\*\*.+:\*\*$/.test(l),
    text: (l) => (/^-\s/.test(l) ? l.replace(/^-\s*/, '') : l),
    read: (l) => (/^-\s/.test(l) ? stripMd(l.replace(/^-\s*/, '')) : `— ${l.match(/^\*\*(.+):\*\*$/)[1]} —`),
  },
  method: {
    is: (l) => /^\d+\.\s/.test(l),
    text: (l) => l.replace(/^\d+\.\s*/, ''),
    read: (l) => stripMd(l.replace(/^\d+\.\s*/, '')),
  },
};

// Re-emit the list, reusing each line's ORIGINAL markdown wherever the text is
// unchanged. Without this, editing step 3 would quietly strip the bold from
// steps 1, 2 and 4 — the app shows plain text, so a round-trip through it would
// flatten formatting he never touched.
function renderList(kind, items, oldLines) {
  const spec = LIST_KINDS[kind];
  const keep = new Map();
  for (const line of oldLines) {
    const key = spec.read(line);
    if (key && !keep.has(key)) keep.set(key, spec.text(line));
  }
  const out = [];
  items.forEach((item, i) => {
    const group = kind === 'ingredients' ? /^—\s*(.+?)\s*—$/.exec(item) : null;
    if (group) {
      if (out.length) out.push('');            // his file breathes before a group heading
      out.push(`**${group[1]}:**`);
      return;
    }
    const body = keep.has(item) ? keep.get(item) : item;
    out.push(kind === 'method' ? `${i + 1}. ${body}` : `- ${body}`);
  });
  return out.join('\n');
}

// Stop at the next heading of the SAME OR SHALLOWER level, at a --- rule, or at
// the true end of the string — never at a deeper heading, which belongs to this
// section. `(?![\s\S])` and not `$`: the regex runs multiline (it has to, to
// anchor `^###`), and there `$` matches the end of EVERY line, so a lazy body
// match would stop after the section's first line. That exact trap corrupted a
// recipe once already.
function sectionStop(level) {
  return `(?=\\n#{1,${level}}(?!#)\\s|\\n-{3,}[ \\t]*\\n|(?![\\s\\S]))`;
}

// Rewrites one section's list. Returns the block unchanged when the list is
// already what was asked for, and null when the section isn't there at all.
function rewriteSection(block, level, heading, kind, items) {
  const hashes = '#'.repeat(level);
  const spec = LIST_KINDS[kind];
  const re = new RegExp(`(^${hashes}\\s*${heading}[^\\n]*\\n)([\\s\\S]*?)${sectionStop(level)}`, 'im');
  const m = re.exec(block);
  if (!m) return null;

  const lines = m[2].split('\n');
  let last = -1;
  const oldLines = [];
  lines.forEach((l, i) => { const t = l.trim(); if (spec.is(t)) { last = i; oldLines.push(t); } });

  // Identical list → touch nothing. This is what keeps an edit to the method
  // from reformatting the ingredients, and a no-op save from rewriting the file.
  const current = oldLines.map((l) => spec.read(l));
  if (current.length === items.length && current.every((t, i) => t === items[i])) return block;

  // Keep the exact whitespace and any trailing prose that followed the list,
  // rather than normalising it — silent file drift is how blank lines vanish.
  const prefixLen = last === -1 ? 0 : lines.slice(0, last + 1).join('\n').length;
  const tail = last === -1 ? (m[2] ? (m[2].startsWith('\n') ? m[2] : `\n${m[2]}`) : '') : m[2].slice(prefixLen);
  const body = renderList(kind, items, oldLines);
  return block.slice(0, m.index) + m[1] + body + tail + block.slice(m.index + m[0].length);
}

function appendSection(block, level, heading, kind, items) {
  const hashes = '#'.repeat(level);
  const rule = block.match(/\n-{3,}[ \t]*\n[\s\S]*$/);
  const at = rule ? block.length - rule[0].length : block.length;
  const head = block.slice(0, at).replace(/\s+$/, '');
  return `${head}\n\n${hashes} ${heading}\n${renderList(kind, items, [])}\n${block.slice(at)}`;
}

function applyEdit(block, level, edit) {
  let out = block;
  if (edit.macros) {
    const { p, c, f, kcal } = edit.macros;
    const macroRe = /^(\*\*Macros[^*]*\*\*:?)[^\n]*/im;
    if (!macroRe.test(out)) throw new Error('could not find the macros line to update');
    const line = `${p}g P / ${c}g C / ${f}g F / ${kcal} kcal`;
    out = out.replace(macroRe, (whole, head) => (whole === `${head} ${line}` ? whole : `${head} ${line}`));
  }
  for (const [field, heading] of [['ingredients', 'Ingredients'], ['method', 'Method']]) {
    if (!edit[field]) continue;
    out = rewriteSection(out, level, heading, field, edit[field])
      || appendSection(out, level, heading, field, edit[field]);
  }
  return out;
}

function validateEdit(edit) {
  if (!edit || typeof edit !== 'object') throw new Error('nothing to change');
  const clean = {};
  for (const field of ['ingredients', 'method']) {
    if (edit[field] === undefined || edit[field] === null) continue;
    if (!Array.isArray(edit[field])) throw new Error(`${field} must be a list`);
    const lines = edit[field].map((s) => String(s).replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!lines.length) throw new Error(`a recipe needs at least one ${field === 'method' ? 'method step' : 'ingredient'}`);
    if (lines.some((l) => /^#{1,6}\s/.test(l))) throw new Error('a line can\'t start with #');
    clean[field] = lines;
  }
  if (edit.macros) {
    const m = edit.macros;
    if ([m.p, m.c, m.f, m.kcal].some((n) => typeof n !== 'number' || Number.isNaN(n) || n < 0)) {
      throw new Error('macros.p/c/f/kcal must be non-negative numbers');
    }
    clean.macros = { p: m.p, c: m.c, f: m.f, kcal: m.kcal };
  }
  if (!Object.keys(clean).length) throw new Error('nothing to change');
  return clean;
}

// Pure: rewrite one recipe's, or one variant's, ingredients / method / macros.
export function editRecipeInRaw(raw, id, rawEdit, altId = null) {
  const edit = validateEdit(rawEdit);

  const headingRe = /^##\s+\d+\.\s+(.+)$/gm;
  let m;
  let start = -1;
  while ((m = headingRe.exec(raw))) {
    if (slugify(m[1].trim()) === id) { start = m.index; break; }
  }
  if (start === -1) throw new Error('recipe not found');
  const afterHeading = start + m[0].length;
  const nextHeading = raw.slice(afterHeading).match(/\n#{1,2}(?!#)\s/);
  const end = nextHeading ? afterHeading + nextHeading.index + 1 : raw.length;
  const block = raw.slice(start, end);

  const altAt = block.search(/\n####\s+Alternative:/);
  const mainPart = altAt === -1 ? block : block.slice(0, altAt + 1);
  const altsPart = altAt === -1 ? '' : block.slice(altAt + 1);

  let newBlock;
  if (altId) {
    if (!altsPart) throw new Error('recipe has no variants');
    const chunks = altsPart.split(/\n(?=####\s+Alternative:)/);
    let hit = -1;
    chunks.forEach((chunk, i) => {
      const label = chunk.match(/^####\s+Alternative:\s*(.+)$/m);
      if (label && slugify(label[1].trim()) === altId) hit = i;
    });
    if (hit === -1) throw new Error(`no variant "${altId}" on this recipe`);
    // No trailing-whitespace normalisation here: applyEdit preserves whatever
    // followed the section, and squashing it ate the blank line between the
    // recipe's closing --- and the next "## " heading — the same silent file
    // drift that removeRecipeFromRaw was fixed for.
    chunks[hit] = applyEdit(chunks[hit], 5, edit);
    newBlock = mainPart + chunks.join('\n');
  } else {
    const edited = applyEdit(mainPart, 3, edit);
    // mainPart was cut just before the first "#### Alternative"; restore the
    // blank line the split consumed so the variant heading isn't glued on
    newBlock = altsPart ? edited.replace(/\s*$/, '\n\n') + altsPart : edited;
  }

  return raw.slice(0, start) + newBlock + raw.slice(end);
}

let editRecipeLock = Promise.resolve();

export async function editRecipe(vaultPath, id, edit, altId = null) {
  const run = editRecipeLock.catch(() => {}).then(() => editRecipeUnlocked(vaultPath, id, edit, altId));
  editRecipeLock = run.catch(() => {});
  return run;
}

async function editRecipeUnlocked(vaultPath, id, edit, altId) {
  const full = path.join(vaultPath, RECIPES_REL_PATH);
  const raw = await readFile(full, 'utf8');
  const before = parseRecipeCollection(raw);
  const target = before.find((r) => r.id === id);
  if (!target) throw new Error('recipe not found');

  const newRaw = editRecipeInRaw(raw, id, edit, altId);
  const after = parseRecipeCollection(newRaw);
  const updated = after.find((r) => r.id === id);

  // The edit must have landed, and must not have taken anything else with it.
  if (after.length !== before.length) throw new Error('Edit failed a sanity check — file left unchanged');
  if (!updated || updated.alternates.length !== target.alternates.length) {
    throw new Error('Edit failed a sanity check — file left unchanged');
  }
  const subject = altId ? updated.alternates.find((a) => a.id === altId) : updated;
  if (!subject) throw new Error('Edit failed a sanity check — file left unchanged');
  const got = altId ? subject.ingredients : subject.ingredients.map((i) => i.name);
  if (edit.ingredients && got.length !== edit.ingredients.filter((s) => String(s).trim()).length) {
    throw new Error('Edit did not round-trip through the file — left unchanged');
  }
  if (edit.method && subject.method.length !== edit.method.filter((s) => String(s).trim()).length) {
    throw new Error('Edit did not round-trip through the file — left unchanged');
  }

  await backupFile(full);
  await writeFile(full, newRaw, 'utf8');
  return updated;
}
