import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadRecentDays } from './healthData.js';
import { loadSessions } from './workoutSessions.js';
import { listEntries as listJournalEntries } from './journal.js';
import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INSIGHT_FILE = path.join(__dirname, '..', 'data', 'health', 'insight.json');
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '0.5';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function buildContext(vaultPath) {
  const lines = [];

  const healthDays = await loadRecentDays(7);
  lines.push('## Recent health data (last 7 days with data, oldest first)');
  if (healthDays.length) {
    for (const d of healthDays) {
      const parts = Object.entries(d).filter(([k]) => !['date', 'receivedAt'].includes(k)).map(([k, v]) => `${k}: ${v}`);
      lines.push(`- ${d.date} — ${parts.join(', ') || 'no metrics'}`);
    }
  } else {
    lines.push('- No health data received yet.');
  }

  try {
    const sessions = await loadSessions(vaultPath, { limit: 5 });
    lines.push('\n## Recent workout sessions (most recent first)');
    if (sessions.length) {
      for (const s of sessions) {
        const totalSets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
        lines.push(`- ${s.date} — ${s.routineName}, ${s.exercises.length} exercises, ${totalSets} sets`);
      }
    } else {
      lines.push('- No workout sessions logged yet.');
    }
  } catch {
    lines.push('\n## Recent workout sessions\n- Unavailable.');
  }

  try {
    const { recipes, profile } = await loadRecipeData(vaultPath);
    const rotation = await loadRotation(vaultPath, recipes);
    lines.push('\n## Today\'s planned nutrition (from meal rotation)');
    lines.push(`- Protein: ${Math.round(rotation.totals.p)}g${profile?.proteinFloorG ? ` (floor ${profile.proteinFloorG}g)` : ''}, Carbs: ${Math.round(rotation.totals.c)}g, Fat: ${Math.round(rotation.totals.f)}g, Energy: ${Math.round(rotation.totals.kcal)} kcal${profile?.targetKcal ? ` (target ${profile.targetKcal})` : ''}`);
  } catch {
    lines.push('\n## Today\'s planned nutrition\n- Unavailable.');
  }

  try {
    const journalDays = await listJournalEntries(vaultPath, { limit: 3 });
    lines.push('\n## Recent journal entries (most recent first)');
    if (journalDays.length) {
      for (const d of journalDays) {
        for (const s of d.sections) {
          const preview = s.text.replace(/\s+/g, ' ').slice(0, 140);
          lines.push(`- ${d.date} ${s.time} — ${preview}`);
        }
      }
    } else {
      lines.push('- No journal entries yet.');
    }
  } catch {
    lines.push('\n## Recent journal entries\n- Unavailable.');
  }

  return lines.join('\n');
}

function buildPrompt(context) {
  return `You are reviewing Hayden's recent personal data as a thoughtful, holistic health coach — not just repeating numbers back, but noticing real patterns that connect sleep/recovery, training, nutrition, and mood.

${context}

Write ONE short, genuinely useful observation or piece of advice (1-2 sentences) that a good coach would proactively raise — something that connects at least two of these data sources if the data supports it (e.g. recovery signals vs training load, sleep vs mood, nutrition vs energy). Be specific and concrete, not generic wellness advice. If there truly isn't enough data yet for a real observation, say so honestly rather than forcing one.

Output ONLY a JSON object with exactly these keys:
- hasInsight: boolean (false if there wasn't enough data for a genuine, specific observation)
- insight: string (empty string if hasInsight is false)

No markdown, no code fences, no commentary before or after — just the raw JSON object.`;
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
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
      if (code !== 0) return reject(new Error(stderr.trim() || `claude exited with code ${code}`));
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) throw new Error(outer.result || 'insight generation failed');
        const text = (outer.result || '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in the response');
        resolve(JSON.parse(jsonMatch[0]));
      } catch (e) {
        reject(e);
      }
    });
    child.on('error', reject);
  });
}

let cachedInsight = null;

async function loadCachedInsight() {
  if (cachedInsight !== null) return cachedInsight;
  if (existsSync(INSIGHT_FILE)) {
    cachedInsight = JSON.parse(await readFile(INSIGHT_FILE, 'utf8'));
  } else {
    cachedInsight = { date: null, hasInsight: false, insight: null, generatedAt: null };
  }
  return cachedInsight;
}

export async function getLatestInsight() {
  return loadCachedInsight();
}

export async function generateInsightNow(vaultPath) {
  return generateAndStore(vaultPath);
}

async function generateAndStore(vaultPath) {
  const context = await buildContext(vaultPath);
  const result = await runClaude(buildPrompt(context));
  const record = {
    date: today(),
    hasInsight: !!result.hasInsight,
    insight: result.hasInsight ? String(result.insight || '').trim() : null,
    generatedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(INSIGHT_FILE), { recursive: true });
  await writeFile(INSIGHT_FILE, JSON.stringify(record, null, 2), 'utf8');
  cachedInsight = record;
  return record;
}

// Runs once an hour; only actually generates once per day, and only once at
// least one day of health data exists, so it stays quiet until the phone
// side (Shortcuts automation) is actually sending data.
async function checkAndGenerate(vaultPath) {
  try {
    const cached = await loadCachedInsight();
    if (cached.date === today()) return;
    const recentDays = await loadRecentDays(1);
    if (!recentDays.length) return;
    await generateAndStore(vaultPath);
  } catch (err) {
    console.error('Health insight generation failed:', err.message);
  }
}

export function startHealthInsightScheduler(vaultPath) {
  checkAndGenerate(vaultPath);
  setInterval(() => checkAndGenerate(vaultPath), 60 * 60 * 1000);
}
