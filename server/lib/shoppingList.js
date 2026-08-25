import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { createVaultStateFile, createWriteLock } from './vaultStateFile.js';
import { modelFor, laneSkipped, laneEnabled } from './modelPrefs.js';

const LIST_REL_PATH = 'Wiki/Health/Shopping List.md';
const CATEGORIES = ['Produce', 'Meat & Protein', 'Dairy & Eggs', 'Pantry & Seasonings', 'Frozen', 'Bakery', 'Beverages', 'Household & Other'];
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '0.5';

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

export function startAddItems(vaultPath, newItems) {
  // Split the amount off BEFORE the model sees anything — this is what keeps
  // "1kg" attached to his chicken instead of being tidied away.
  const split = (newItems || []).map((it) => {
    const { amount, name } = splitAmount(it.name);
    return { ...it, name, amount: it.amount || amount };
  });
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', items: null, error: null };
  jobs.set(jobId, job);

  // Sorting is the model's job here; ADDING is not. With the lane off, the
  // items still go on the list — they just land under Household & Other for
  // him to move. Refusing the whole add would lose the thing he asked for.
  if (!laneEnabled('shopping-categorize')) {
    laneSkipped('shopping-categorize', 'shopping-list categorisation (items added uncategorised)');
    (async () => {
      try {
        await addItemsDirect(vaultPath, split.map((it) => ({
          name: String(it.name || '').trim(),
          category: 'Household & Other',
          amount: it.amount || null,
          source: it.source || null,
        })).filter((it) => it.name));
        // job.items is the WHOLE list on the model path — the client renders
        // it wholesale — so this branch must hand back the same shape.
        job.items = await getItems(vaultPath);
        job.status = 'ready';
      } catch (e) {
        job.status = 'error';
        job.error = e.message;
      }
    })();
    return jobId;
  }

  const prompt = `Categorize each of these shopping list items into exactly one of these categories: ${CATEGORIES.join(', ')}.

Items:
${split.map((it, i) => `${i + 1}. ${it.name}`).join('\n')}

Use "Household & Other" for anything that isn't food (kitchenware, cleaning supplies, etc). You may lightly clean up each name (e.g. strip cooking-state notes like "(cooked, drained)") but keep it recognizable and short enough for a shopping list. Amounts have already been removed before you see this list — never add one, and never remove a brand or variety that is part of the name.

Output ONLY a JSON array with exactly ${newItems.length} objects, one per item in the same order, each with keys "name" and "category". No markdown, no commentary — just the raw JSON array.`;

  const child = spawn(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', '',
    '--output-format', 'json',
    // named explicitly — an unpinned call silently inherits the account's
    // ambient default model, which cost him a Fable-5 usage-limit hit on a
    // totally unrelated lane (Coach) once that became the default. The pin
    // now comes from the model board (lib/modelPrefs.js) so it is settable
    // in Settings; the default is the 'sonnet' this lane has always run on.
    '--model', modelFor('shopping-categorize'),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--no-session-persistence',
  ]);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0) {
      job.status = 'error';
      job.error = stderr.trim() || `claude exited with code ${code}`;
      return;
    }
    (async () => {
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) throw new Error(outer.result || 'categorization failed');
        const text = (outer.result || '').trim();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found in the response');
        const parsed = JSON.parse(jsonMatch[0]);
        const categorized = parsed.map((p, i) => ({
          id: randomUUID().slice(0, 8),
          name: String(p.name || split[i]?.name || '').trim(),
          category: CATEGORIES.includes(p.category) ? p.category : 'Household & Other',
          checked: false,
          qty: normalizeQty(split[i]?.qty),
          // re-attached from OUR split, never from the model's output — the
          // amount is the one field it cannot lose
          amount: split[i]?.amount || null,
          source: split[i]?.source || null,
        })).filter((it) => it.name);

        const items = await withWriteLock(async () => {
          const current = await getItems(vaultPath);
          const updated = [...current, ...categorized];
          await persist(vaultPath, updated);
          return updated;
        });
        job.items = items;
        job.status = 'ready';
      } catch (e) {
        job.status = 'error';
        job.error = 'Could not categorize items: ' + e.message;
      }
    })();
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

export function getAddItemsJob(jobId) {
  return jobs.get(jobId) || null;
}
