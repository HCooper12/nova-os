import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

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
      lines.push(`- [${item.checked ? 'x' : ' '}] ${item.name}${item.source ? ` _(from ${item.source})_` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// Same iCloud Drive read-staleness workaround used for the daily rotation —
// keep the last-known state in memory once loaded rather than re-reading
// this file from disk on every request from this long-running process.
let cachedItems = null;

async function readItemsFromDisk(vaultPath) {
  const full = path.join(vaultPath, LIST_REL_PATH);
  if (!existsSync(full)) return [];
  const raw = await readFile(full, 'utf8');
  return matter(raw).data.items || [];
}

async function getItems(vaultPath) {
  if (cachedItems === null) cachedItems = await readItemsFromDisk(vaultPath);
  return cachedItems;
}

let writeLock = Promise.resolve();
function withWriteLock(fn) {
  const run = writeLock.catch(() => {}).then(fn);
  writeLock = run.catch(() => {});
  return run;
}

async function persist(vaultPath, items) {
  const full = path.join(vaultPath, LIST_REL_PATH);
  const frontmatter = { type: 'shopping-list', updated: new Date().toISOString().slice(0, 10), items };
  const content = matter.stringify(bodyFor(items), frontmatter);
  await mkdir(path.dirname(full), { recursive: true });
  if (existsSync(full)) await backupFile(full);
  await writeFile(full, content, 'utf8');
  cachedItems = items;
}

export async function loadShoppingList(vaultPath) {
  return { items: await getItems(vaultPath), categories: CATEGORIES };
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

// --- add-items categorization job (async, claude-powered) ---
const jobs = new Map();

export function startAddItems(vaultPath, newItems) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', items: null, error: null };
  jobs.set(jobId, job);

  const prompt = `Categorize each of these shopping list items into exactly one of these categories: ${CATEGORIES.join(', ')}.

Items:
${newItems.map((it, i) => `${i + 1}. ${it.name}`).join('\n')}

Use "Household & Other" for anything that isn't food (kitchenware, cleaning supplies, etc). You may lightly clean up each name (e.g. strip cooking-state notes like "(cooked, drained)") but keep it recognizable and short enough for a shopping list — don't invent quantities that weren't given.

Output ONLY a JSON array with exactly ${newItems.length} objects, one per item in the same order, each with keys "name" and "category". No markdown, no commentary — just the raw JSON array.`;

  const child = spawn(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', '',
    '--output-format', 'json',
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
          name: String(p.name || newItems[i]?.name || '').trim(),
          category: CATEGORIES.includes(p.category) ? p.category : 'Household & Other',
          checked: false,
          source: newItems[i]?.source || null,
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
