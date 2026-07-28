import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { backupFile } from './backup.js';

// The Stash — categorised links to come back to: products to restock
// (skincare, supplements), references to revisit, anything with a URL worth
// keeping one tap away. One source of truth in the vault so Obsidian can
// read/edit it too; this module is the single writer.
//
// Format contract (change every reader/writer or none):
//   ## Category
//   - [Name](https://url) — optional note
export const STASH_REL = 'Wiki/Library/Stash.md';
const HEADER = `# Stash

Links and products to come back to — restock, reference, revisit. Managed from Nova's Stash tab; safe to edit here too.
`;

const ITEM_RE = /^- \[(.+?)\]\((https?:\/\/[^\s)]+)\)(?:\s*—\s*(.*))?\s*$/;

function stashPath(vaultPath) {
  return path.join(vaultPath, STASH_REL);
}

export function parseStash(raw) {
  const categories = [];
  let current = null;
  for (const line of (raw || '').split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = { name: h[1], items: [] };
      categories.push(current);
      continue;
    }
    const m = line.match(ITEM_RE);
    if (m && current) {
      current.items.push({ raw: line, name: m[1], url: m[2], note: m[3]?.trim() || null });
    }
  }
  return { categories };
}

export function formatStashItem({ name, url, note }) {
  const cleanName = String(name).trim().replace(/[[\]]/g, '');
  return `- [${cleanName}](${url})${note ? ` — ${String(note).trim()}` : ''}`;
}

export async function loadStash(vaultPath) {
  const full = stashPath(vaultPath);
  if (!existsSync(full)) return { categories: [] };
  return parseStash(await readFile(full, 'utf8'));
}

export async function addStashItem(vaultPath, { category, name, url, note }) {
  const cat = String(category || '').trim();
  const cleanUrl = String(url || '').trim();
  if (!cat) throw new Error('category is required');
  if (!String(name || '').trim()) throw new Error('name is required');
  if (!/^https?:\/\/\S+$/.test(cleanUrl)) throw new Error('url must start with http:// or https://');

  const full = stashPath(vaultPath);
  let raw;
  if (existsSync(full)) {
    await backupFile(full);
    raw = await readFile(full, 'utf8');
  } else {
    await mkdir(path.dirname(full), { recursive: true });
    raw = HEADER;
  }

  const line = formatStashItem({ name, url: cleanUrl, note });
  const lines = raw.split('\n');
  const headingRe = new RegExp(`^##\\s+${cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  const idx = lines.findIndex((l) => headingRe.test(l));
  if (idx === -1) {
    // new category — appended at the end so vault-side ordering is preserved
    const out = raw.replace(/\n*$/, '\n') + `\n## ${cat}\n\n${line}\n`;
    await writeFile(full, out, 'utf8');
  } else {
    // insert after the section's last item (or straight after the heading)
    let end = idx + 1;
    for (let i = idx + 1; i < lines.length; i++) {
      if (/^##\s+/.test(lines[i])) break;
      if (lines[i].trim()) end = i + 1;
    }
    lines.splice(end, 0, line);
    await writeFile(full, lines.join('\n'), 'utf8');
  }
  return loadStash(vaultPath);
}

// Identity is the exact raw line (the todos precedent) — no ids to drift.
export async function removeStashItem(vaultPath, rawLine) {
  const full = stashPath(vaultPath);
  if (!existsSync(full)) throw new Error('stash file not found');
  await backupFile(full);
  const raw = await readFile(full, 'utf8');
  const lines = raw.split('\n');
  const idx = lines.findIndex((l) => l === rawLine);
  if (idx === -1) throw new Error('that item is no longer there');
  lines.splice(idx, 1);
  await writeFile(full, lines.join('\n'), 'utf8');
  return loadStash(vaultPath);
}
