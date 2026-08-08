import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// The Design Taste page — Hayden's curated eye (Wiki/Library/Design Taste.md),
// loaded into any agent that produces something visual or stylistic so drafts
// start from HIS taste instead of model defaults. Read-only here; the page is
// his to curate (seeded 2026-08-06 from the taste-library references).

export const TASTE_REL = 'Wiki/Library/Design Taste.md';

export async function tasteContext(vaultPath) {
  const full = path.join(vaultPath, TASTE_REL);
  if (!existsSync(full)) return '';
  try {
    const raw = await readFile(full, 'utf8');
    const body = raw.replace(/^---[\s\S]*?---\n/, '').trim();
    if (!body) return '';
    return `HIS DESIGN TASTE (from ${TASTE_REL} — draft in THIS voice and vocabulary, and never produce what its Never list names):\n${body.slice(0, 2500)}`;
  } catch {
    return '';
  }
}
