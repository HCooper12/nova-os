import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { createRecord, listRecords } from './inboxStore.js';

// Brain Week — "what entered my second brain this week", as a Sunday journal
// draft. Fully deterministic: it walks the vault's knowledge folders, keeps
// files whose `created` frontmatter (or file mtime, when frontmatter is
// absent/unparseable) falls inside the last 7 days, and composes a grouped
// digest with wikilinks. No model involved; the week's additions are facts,
// not judgments. Files on the rails as a pending journal entry — Hayden
// approves it into the journal like any other draft.

const KNOWLEDGE_DIRS = [
  ['Wiki/Sources', 'Sources'],
  ['Wiki/Concepts', 'Concepts'],
  ['Wiki/Entities', 'People & entities'],
  ['Wiki/Topics', 'Topics'],
  ['Wiki/Inbox', 'Notes & captures'],
  ['Raw', 'Raw originals'],
];
const WEEK_MS = 7 * 24 * 3600e3;
const BRAIN_WEEK_DAY = 0; // Sunday
const BRAIN_WEEK_HOUR = 16;

async function fileCreatedAt(full) {
  try {
    const fm = matter(await readFile(full, 'utf8')).data;
    // YAML parses a bare date as a Date object; our own writers emit strings
    if (fm?.created instanceof Date && Number.isFinite(fm.created.getTime())) return fm.created.getTime();
    if (typeof fm?.created === 'string' && fm.created) {
      const t = new Date(`${fm.created}T12:00:00`).getTime();
      if (Number.isFinite(t)) return t;
    }
  } catch { /* fall through to mtime */ }
  try {
    return (await stat(full)).mtimeMs;
  } catch {
    return null;
  }
}

// → [{ label, titles: [..] }], knowledge files created in the last 7 days.
export async function collectWeekAdditions(vaultPath, now = new Date()) {
  const cutoff = now.getTime() - WEEK_MS;
  const groups = [];
  for (const [rel, label] of KNOWLEDGE_DIRS) {
    const dir = path.join(vaultPath, rel);
    if (!existsSync(dir)) continue;
    const titles = [];
    for (const name of (await readdir(dir)).sort()) {
      if (!name.endsWith('.md') || name === 'To-Do.md') continue;
      const createdAt = await fileCreatedAt(path.join(dir, name));
      if (createdAt != null && createdAt >= cutoff) titles.push(name.replace(/\.md$/, ''));
    }
    if (titles.length) groups.push({ label, titles });
  }
  return groups;
}

// Raw pages sit outside Wiki/, so their wikilink needs the folder prefix.
const link = (label, title) => (label === 'Raw originals' ? `[[Raw/${title}]]` : `[[${title}]]`);

export function composeBrainWeek(groups) {
  if (!groups.length) return null; // an empty week files nothing — honest silence
  const total = groups.reduce((n, g) => n + g.titles.length, 0);
  const lines = [`This week ${total} page${total === 1 ? '' : 's'} entered the second brain:`];
  for (const g of groups) {
    lines.push('', `**${g.label}** (${g.titles.length})`);
    for (const t of g.titles) lines.push(`- ${link(g.label, t)}`);
  }
  return lines.join('\n');
}

// ISO-week key for the dedupe guard — one digest per week, retry-safe.
export function weekKey(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Thursday of this ISO week
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function runBrainWeek(vaultPath, { force = false } = {}) {
  const key = weekKey();
  const records = await listRecords();
  const already = records.find((r) => r.kind === 'brain-week' && r.weekKey === key && r.status !== 'error');
  if (already && !force) return { skipped: true, reason: 'already composed this week', recordId: already.id };

  const groups = await collectWeekAdditions(vaultPath);
  const text = composeBrainWeek(groups);
  if (!text) return { skipped: true, reason: 'nothing entered the second brain this week' };

  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'brain-week',
    weekKey: key,
    text: `Second brain, week of ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
    source: 'nova',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'journal',
      confidence: 'high',
      title: `Second brain — ${key}`,
      reason: 'The week\'s additions to your knowledge base, listed with links — approve to file it in the journal.',
      payload: { text, category: 'system', label: 'Second-brain week' },
    },
  });
  return { recordId: record.id };
}

export function startBrainWeekScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('brain-week');
    try {
      const now = new Date();
      if (now.getDay() !== BRAIN_WEEK_DAY || now.getHours() < BRAIN_WEEK_HOUR) return;
      await runBrainWeek(vaultPath);
    } catch (err) {
      console.error('brain week failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}
