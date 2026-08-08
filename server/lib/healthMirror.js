import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { backupFile } from './backup.js';

// The health mirror — "if it's not in the vault, it didn't happen." The
// operational truth for health and nutrition lives in server/data (device
// pushes, food logs); this writes a MACHINE-OWNED monthly markdown page into
// the vault so the numbers are his in Obsidian too: greppable, linkable,
// safe from any server/data mishap. One page per month, fully regenerated on
// every pass (like Daily Rotation) — human edits to the table don't survive,
// which the page says plainly in its own header. Absent metrics render as
// an em dash, never a zero.

export const MIRROR_DIR_REL = 'Wiki/Health/Health Log';

function pad(n) { return String(n).padStart(2, '0'); }

// Pure: one month's rows → the page. Exported for tests.
export function buildMirrorPage(monthKey, healthDays, nutritionDays) {
  const byDateH = new Map((healthDays || []).map((d) => [d.date, d]));
  const byDateN = new Map((nutritionDays || []).map((d) => [d.date, d]));
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`;

  const dash = '—';
  const num = (v, digits = 0) => (v == null ? dash : Number(v).toFixed(digits));
  const rows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${monthKey}-${pad(d)}`;
    if (date > today) break; // the future is not data
    const h = byDateH.get(date) || {};
    const n = byDateN.get(date) || {};
    const sleep = h.sleepAsleepMinutes != null ? `${Math.floor(h.sleepAsleepMinutes / 60)}h${pad(Math.round(h.sleepAsleepMinutes % 60))}` : dash;
    const steps = h.steps != null ? `${h.steps.toLocaleString()}${h.stepsComplete === false ? '*' : ''}` : dash;
    const floor = n.floorMet == null ? dash : n.floorMet ? '✓' : '✗';
    rows.push(`| ${date} | ${steps} | ${sleep} | ${num(h.hrv)} | ${num(h.restingHeartRate)} | ${num(h.weightKg, 1)} | ${num(n.kcal)} | ${num(n.p)} | ${floor} |`);
  }

  const body = [
    `# Health Log — ${monthKey}`,
    '',
    'Written by Nova from the live health and nutrition record — regenerated',
    'daily, so edits to this page do not survive. Corrections belong in the',
    'app (steps overlay / food log), which writes the record this mirrors.',
    '`*` marks a partial step count (captured before the day ended).',
    '',
    '| Date | Steps | Sleep | HRV | RHR | Weight | kcal | Protein | Floor |',
    '|------|-------|-------|-----|-----|--------|------|---------|-------|',
    ...rows,
    '',
  ].join('\n');

  return matter.stringify(body, {
    type: 'health-log',
    month: monthKey,
    generated: new Date().toISOString().slice(0, 10),
    tags: ['health', 'generated'],
  });
}

export async function writeMirror(vaultPath, monthKey) {
  const { loadRecentDays } = await import('./healthData.js');
  const { loadRecentDays: loadNutritionDays } = await import('./nutritionLog.js');
  // 62 days covers the current month fully however the files are spread
  const [health, nutrition] = await Promise.all([loadRecentDays(62), loadNutritionDays(62)]);
  const inMonth = (d) => d.date && d.date.startsWith(monthKey);
  const page = buildMirrorPage(monthKey, health.filter(inMonth), nutrition.filter(inMonth));

  const dir = path.join(vaultPath, MIRROR_DIR_REL);
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, `${monthKey}.md`);
  // skip the write (and the backup churn) when nothing changed
  if (existsSync(full)) {
    const current = await readFile(full, 'utf8');
    const stripGen = (s) => s.replace(/^generated: .*$/m, '');
    if (stripGen(current) === stripGen(page)) return { unchanged: true, relPath: `${MIRROR_DIR_REL}/${monthKey}.md` };
    await backupFile(full);
  }
  await writeFile(full, page, 'utf8');
  return { unchanged: false, relPath: `${MIRROR_DIR_REL}/${monthKey}.md` };
}

export function startHealthMirrorScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('health-mirror');
    try {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
      await writeMirror(vaultPath, monthKey);
      // in the first days of a month, keep finalising the previous one as
      // late pushes land on it
      if (now.getDate() <= 3) {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        await writeMirror(vaultPath, `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`);
      }
    } catch (err) {
      console.error('health mirror failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}
