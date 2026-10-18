import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';
import { laneSkipped, laneEnabled } from './modelPrefs.js';
import { parseModelJson } from './jsonSalvage.js';
import { runTextLane } from './textLane.js';

const LIST_REL_PATH = 'Wiki/Health/Shopping List.md';
const CATEGORIES = ['Produce', 'Meat & Protein', 'Dairy & Eggs', 'Pantry & Seasonings', 'Frozen', 'Bakery', 'Beverages', 'Household & Other'];

function bodyFor(items) {
  const lines = ['# Shopping List', '', 'Managed via Nova OS.', ''];
  for (const cat of CATEGORIES) {
    const inCat = items.filter((i) => i.category === cat);
    if (!inCat.length) continue;
    lines.push(`## ${cat}`, '');
    for (const item of inCat) {
      const qty = Number(item.qty) > 1 ? `${Number(item.qty)} × ` : '';
      const amount = item.amount ? `${item.amount} ` : '';
      lines.push(`- [${item.checked ? 'x' : ' '}] ${qty}${amount}${item.name}${item.source ? ` _(from ${item.source})_` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Cache + iCloud staleness handling + external-edit detection live in the
// shared helper — see vaultStateFile.js.
const stateFile = createVaultStateFile({
  relPath: LIST_REL_PATH,
  parse: (raw) => matter(raw).data.items || [],
  empty: () => [],
});

function getItems(vaultPath) {
  return stateFile.load(vaultPath);
}

const withWriteLock = createWriteLock();

async function persist(vaultPath, items) {
  const frontmatter = { type: 'shopping-list', updated: new Date().toISOString().slice(0, 10), items };
  const content = matter.stringify(bodyFor(items), frontmatter);
  await stateFile.write(vaultPath, content, items);
}

export async function loadShoppingList(vaultPath) {
  return { items: await getItems(vaultPath), categories: CATEGORIES };
}

export const SHOPPING_CATEGORIES = CATEGORIES;

// Deterministic add for pre-categorized items (the inbox classifier already
// chose categories, so no claude call happens here). Returns the added items
// with their assigned ids so the caller can undo them later.
export async function addItemsDirect(vaultPath, newItems) {
  const added = newItems
    .map((raw) => {
      // A caller that already split keeps its amount; one that passed a whole
      // ingredient line ("1kg raw chicken breast") gets it split here, so no
      // add path can drop the number.
      const s = raw.amount ? { amount: raw.amount, name: String(raw.name || '').trim() } : splitAmount(raw.name);
      return { ...raw, name: s.name, amount: s.amount };
    })
    .map((it) => ({
      id: randomUUID().slice(0, 8),
      name: String(it.name || '').trim(),
      category: CATEGORIES.includes(it.category) ? it.category : 'Household & Other',
      checked: false,
      // How many to buy. 1 is the honest default — an item with no stated
      // quantity means "one of these", not "unspecified".
      qty: normalizeQty(it.qty),
      // what the recipe called for, e.g. "1kg" — distinct from qty, which is
      // how many of THAT he is buying
      amount: it.amount ? String(it.amount).trim().slice(0, 24) : null,
      source: it.source || null,
    }))
    .filter((it) => it.name);
  if (!added.length) throw new Error('no items to add');
  await withWriteLock(async () => {
    const current = await getItems(vaultPath);
    await persist(vaultPath, [...current, ...added]);
  });
  return added;
}

// THE AMOUNT AN INGREDIENT CALLS FOR — "1kg", "10 slices", "1 x 250g".
//
// He added the Chicken Caesar to his list and the chicken came back as plain
// "chicken breast" with no weight, which is useless at the shops. The cause:
// items go past a model for CATEGORISING, and its prompt asked for names
// "short enough for a shopping list" — so it helpfully deleted the 1kg.
//
// The fix is to take the amount out of the model's reach entirely. Code
// splits the leading amount off first, the model only ever sees the food, and
// the amount is re-attached afterwards. Models decide the category; code
// keeps the number.
const AMOUNT_UNITS = 'kg|g|mg|ml|l|tbsp|tbs|tsp|cups?|slices?|cloves?|cans?|tins?|pouch(?:es)?|punnets?|bunch(?:es)?|heads?|scoops?|serves?|packs?|jars?|bottles?|sticks?|rashers?|fillets?|sheets?';
const NUM = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|[¼½¾⅓⅔]|\\d+(?:\\.\\d+)?)';
const AMOUNT_RE = new RegExp(`^\\s*(${NUM}\\s*(?:x\\s*${NUM}\\s*)?(?:${AMOUNT_UNITS})?)\\s*(?:of\\s+)?(?=\\S)`, 'i');

export function splitAmount(raw) {
  const str = String(raw ?? '').trim();
  if (!str) return { amount: null, name: '' };
  const m = AMOUNT_RE.exec(str);
  if (!m) return { amount: null, name: str };
  const amount = m[1].replace(/\s+/g, ' ').trim();
  const name = str.slice(m[0].length).trim();
  // "500g" on its own is the item, not an amount with nothing left to buy.
  // The lookahead backtracks to leave a bare unit behind ("500" + "g"), so
  // the remainder has to be a real word before we accept the split.
  if (!name || name.length < 2 || new RegExp(`^(?:${AMOUNT_UNITS})$`, 'i').test(name)) {
    return { amount: null, name: str };
  }
  return { amount, name };
}

// Quantities are whole counts he can act on in a shop: at least one, and
// capped so a slipped keypress cannot ask for four thousand yoghurts.
export const MAX_QTY = 99;
export function normalizeQty(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_QTY);
}

export async function setItemQty(vaultPath, id, qty) {
  return withWriteLock(async () => {
    const items = [...(await getItems(vaultPath))];
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('item not found');
    items[idx] = { ...items[idx], qty: normalizeQty(qty) };
    await persist(vaultPath, items);
    return items;
  });
}

export async function removeItems(vaultPath, ids) {
  const idSet = new Set(ids);
  return withWriteLock(async () => {
    const current = await getItems(vaultPath);
    const remaining = current.filter((i) => !idSet.has(i.id));
    const removedCount = current.length - remaining.length;
    await persist(vaultPath, remaining);
    return removedCount;
  });
}

// Remove some lines and hand back exactly what left (for Undo through
// restoreItems, which puts them back verbatim with the same ids).
export async function removeItemsReturning(vaultPath, ids) {
  const idSet = new Set(ids);
  return withWriteLock(async () => {
    const current = await getItems(vaultPath);
    const removed = current.filter((i) => idSet.has(i.id));
    const items = current.filter((i) => !idSet.has(i.id));
    if (removed.length) await persist(vaultPath, items);
    return { items, removed };
  });
}

export async function toggleItem(vaultPath, id, checked) {
  return withWriteLock(async () => {
    const items = [...(await getItems(vaultPath))];
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('item not found');
    items[idx] = { ...items[idx], checked };
    await persist(vaultPath, items);
    return items;
  });
}

export async function confirmCompletion(vaultPath) {
  return withWriteLock(async () => {
    const items = (await getItems(vaultPath)).filter((i) => !i.checked);
    await persist(vaultPath, items);
    return items;
  });
}

// CLEAR THE WHOLE LIST. Ticking twenty things off one at a time to empty a
// list is bookkeeping, not shopping. Returns everything it removed so the
// caller can put it straight back — wiping a list is the most destructive
// thing this file does, and "everything writeable is undoable" is not
// optional for the destructive ones.
export async function clearAll(vaultPath) {
  return withWriteLock(async () => {
    const cleared = await getItems(vaultPath);
    if (cleared.length) await persist(vaultPath, []);
    return cleared;
  });
}

// The undo half. Restores items VERBATIM — same ids, same categories, same
// checked state — so an undo returns the list he had, not a reconstruction
// of it. Items already present are skipped rather than duplicated, which
// makes a double-tapped undo harmless.
export async function restoreItems(vaultPath, items) {
  const incoming = (Array.isArray(items) ? items : [])
    .map((it) => ({
      id: String(it?.id || '').trim() || randomUUID().slice(0, 8),
      name: String(it?.name || '').trim(),
      category: CATEGORIES.includes(it?.category) ? it.category : 'Household & Other',
      checked: !!it?.checked,
      qty: normalizeQty(it?.qty),
      amount: it?.amount ? String(it.amount).trim().slice(0, 24) : null,
      source: it?.source || null,
    }))
    .filter((it) => it.name);
  if (!incoming.length) throw new Error('nothing to restore');
  return withWriteLock(async () => {
    const current = await getItems(vaultPath);
    const have = new Set(current.map((i) => i.id));
    const merged = [...current, ...incoming.filter((i) => !have.has(i.id))];
    await persist(vaultPath, merged);
    return merged;
  });
}

// --- add-items categorization job (async, claude-powered) ---
const jobs = new Map();

// THE ADD NEVER WAITS ON A MODEL (18 Oct 2026, his report: "I can't add items
// unless my Claude usage is active"). Code splits the amount, files each item
// in the aisle it knows (his own past filings, then a word table:
// lib/shoppingCategory.js) and writes the list at once, so the job is ready
// with no model at all. Only names code could not place go to a model, in the
// background, and only to MOVE them out of Household & Other; a model that is
// off, out of usage or wrong costs a mis-shelved item, never a lost one.
export function startAddItems(vaultPath, newItems) {
  const split = (newItems || []).map((it) => {
    const { amount, name } = splitAmount(it.name);
    return { ...it, name, amount: it.amount || amount };
  });
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', items: null, error: null };
  jobs.set(jobId, job);
  (async () => {
    try {
      const { guessCategory, loadCategoryMemory } = await import('./shoppingCategory.js');
      const memory = await loadCategoryMemory();
      const guessed = split.map((it) => ({ ...it, guess: guessCategory(it.name, memory) }));
      const added = await addItemsDirect(vaultPath, guessed.map((it) => ({
        name: String(it.name || '').trim(),
        category: it.guess.category || 'Household & Other',
        amount: it.amount || null,
        source: it.source || null,
      })).filter((it) => it.name));
      job.items = await getItems(vaultPath);
      job.status = 'ready';
      const unsure = added.filter((it, i) => !guessed[i]?.guess?.sure);
      if (unsure.length) sortUnknownsLater(vaultPath, unsure);
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
    }
  })();
  return jobId;
}

function sortUnknownsLater(vaultPath, unsure) {
  if (!laneEnabled('shopping-categorize')) {
    laneSkipped('shopping-categorize', 'shopping-list categorisation (unknown items left under Household & Other)');
    return;
  }
  const prompt = `Categorize each of these shopping list items into exactly one of these categories: ${CATEGORIES.join(', ')}.

Items:
${unsure.map((it, i) => `${i + 1}. ${it.name}`).join('\n')}

Use "Household & Other" for anything that isn't food (kitchenware, cleaning supplies, etc).

Output ONLY a JSON array with exactly ${unsure.length} strings, one category per item in the same order. No markdown, no commentary.`;
  // Claude, or the model on this Mac (lib/textLane.js); a failure of either
  // leaves the items where code put them
  runTextLane('shopping-categorize', prompt, { json: true }).then((out) => {
    (async () => {
      try {
        const text = (out.text || '').trim();
        const m = text.match(/\[[\s\S]*\]/);
        if (!m) return;
        const cats = parseModelJson(m[0]);
        const moves = new Map();
        unsure.forEach((it, i) => {
          const c = typeof cats[i] === 'string' ? cats[i] : cats[i]?.category;
          if (CATEGORIES.includes(c) && c !== 'Household & Other') moves.set(it.id, c);
        });
        if (!moves.size) return;
        await withWriteLock(async () => {
          const current = await getItems(vaultPath);
          // only items still where code left them: never undo his own move
          const next = current.map((it) => (moves.has(it.id) && it.category === 'Household & Other' ? { ...it, category: moves.get(it.id) } : it));
          await persist(vaultPath, next);
        });
        const { rememberCategories } = await import('./shoppingCategory.js');
        await rememberCategories(unsure.filter((it) => moves.has(it.id)).map((it) => ({ name: it.name, category: moves.get(it.id) })));
      } catch { /* a bad answer leaves the items where code put them */ }
    })();
  }, () => { /* no model answered: the items stay where code put them */ });
}

export function getAddItemsJob(jobId) {
  return jobs.get(jobId) || null;
}
