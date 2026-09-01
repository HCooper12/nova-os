import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { beat } from './heartbeat.js';
import { modelFor, laneSkipped } from './modelPrefs.js';
import { settleWatchdog } from './settle.js';

// Topic Pulse — the brief that SHOWS. For each topic on Hayden's Interests
// page (his to edit, in the vault), a small web-read-only run fetches a few
// current items with real URLs. The cache is display-only and self-labels
// its age: pulses feed panels, the ambient strip, and a dispatch line —
// nothing ever enters the vault, so there is nothing to review-gate. The
// citation rule stands: no URL, no item.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const CACHE_PATH = () => path.join(dataRoot(), 'pulse.json');

export const INTERESTS_REL = 'Wiki/Library/Interests.md';
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '0.5';
const MAX_TOPICS = 6;
const MAX_ITEMS = 5;
export const STALE_HOURS = 24;

const PULSE_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'Edit', 'Write', 'Grep', 'Glob',
  'NotebookEdit', 'TaskCreate', 'TaskUpdate', 'Monitor', 'Artifact',
].join(',');

const SEED = `# Interests

Topics Nova keeps a pulse on — a few current, cited items each, refreshed
in the overnight window and shown in conversation, the morning dispatch,
and ambient mode. One topic per line; keep it to ${MAX_TOPICS} or fewer
(each is a real overnight web run). Edit freely.

- Hypertrophy and strength training research
- AI assistants and Claude tooling
- Nutrition science for body recomposition
`;

export async function ensureInterestsFile(vaultPath) {
  const full = path.join(vaultPath, INTERESTS_REL);
  if (existsSync(full)) return false;
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, SEED, 'utf8');
  return true;
}

export async function loadInterests(vaultPath) {
  await ensureInterestsFile(vaultPath);
  const raw = await readFile(path.join(vaultPath, INTERESTS_REL), 'utf8');
  const topics = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^- (.+?)\s*$/);
    if (m) topics.push(m[1].trim());
  }
  return topics.slice(0, MAX_TOPICS);
}

export function buildPulsePrompt(topic) {
  return `You are Nova's pulse-taker. Find what is genuinely NEW (roughly the last two weeks) on this topic and return the ${MAX_ITEMS} most substantive items. Real sources only — studies, articles, releases, talks, videos; skip engagement bait.

Topic: ${topic}

Rules:
- Every item needs a REAL working URL you actually found — never construct or guess one. No URL, no item. Fewer honest items beat five padded ones.
- "note" is one plain sentence on why it matters — no hype.

Output ONLY a JSON object: {"items":[{"title":"…","url":"https://…","source":"site or publication name","note":"…"}]}. No code fences, no commentary.`;
}

export function normalizePulseItems(parsed) {
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const out = [];
  for (const raw of items.slice(0, MAX_ITEMS)) {
    const url = String(raw?.url || '').trim();
    const title = String(raw?.title || '').trim().slice(0, 140);
    if (!/^https?:\/\/\S+\.\S+/.test(url) || !title) continue;
    out.push({
      title,
      url,
      source: String(raw?.source || '').trim().slice(0, 60) || new URL(url).hostname.replace(/^www\./, ''),
      note: String(raw?.note || '').trim().slice(0, 200),
    });
  }
  return out;
}

async function loadCache() {
  if (!existsSync(CACHE_PATH())) return { topics: {} };
  try { return JSON.parse(await readFile(CACHE_PATH(), 'utf8')); } catch { return { topics: {} }; }
}
async function saveCache(cache) {
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(CACHE_PATH(), JSON.stringify(cache, null, 2), 'utf8');
}

export async function getPulse(topicQuery = null) {
  const cache = await loadCache();
  const entries = Object.entries(cache.topics).map(([topic, v]) => ({ topic, ...v }));
  if (!topicQuery) return entries;
  const ci = (s) => s.toLowerCase();
  return entries.filter((e) => ci(e.topic).includes(ci(topicQuery)) || ci(topicQuery).includes(ci(e.topic)));
}

// One spawned run per topic — injectable runner keeps this testable.
export async function refreshPulseTopic(topic, { runner } = {}) {
  const run = runner || ((prompt) => new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--allowedTools', 'WebSearch WebFetch',
      '--disallowedTools', PULSE_DISALLOWED,
      '--strict-mcp-config',
      '--output-format', 'json',
      '--model', modelFor('pulse'),
      '--max-budget-usd', MAX_BUDGET_USD,
      '--session-id', randomUUID(),
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    settleWatchdog(child, { label: "the pulse", minutes: 15 });
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `exited ${code}`);
        const m = (outer.result || '').match(/\{[\s\S]*\}/);
        if (!m) throw new Error('no JSON in pulse response');
        resolve(JSON.parse(m[0]));
      } catch (e) { reject(e); }
    });
    child.on('error', reject);
  }));

  const items = normalizePulseItems(await run(buildPulsePrompt(topic)));
  const cache = await loadCache();
  cache.topics[topic] = { at: new Date().toISOString(), items };
  await saveCache(cache);
  return cache.topics[topic];
}

// Refresh every interest, sequentially, one model at a time. Topics that
// fail keep their previous cache — stale-and-labelled beats gone.
export async function refreshAllPulses(vaultPath, { runner } = {}) {
  // A real runner injected by a test still runs; only the spawning path is
  // gated, and only when nothing was injected.
  if (!runner && laneSkipped('pulse', 'the overnight pulse sweep')) return { refreshed: 0, failed: 0, laneOff: true };
  const topics = await loadInterests(vaultPath);
  const summary = { refreshed: 0, failed: 0 };
  for (const topic of topics) {
    try { await refreshPulseTopic(topic, { runner }); summary.refreshed++; }
    catch (e) { console.error(`pulse "${topic}" failed:`, e.message); summary.failed++; }
  }
  // drop cache entries for topics no longer on the page
  const cache = await loadCache();
  for (const t of Object.keys(cache.topics)) if (!topics.includes(t)) delete cache.topics[t];
  await saveCache(cache);
  return summary;
}

// One line for the morning dispatch — counts + freshest headline per topic.
export async function pulseMorningLine() {
  const entries = await getPulse();
  const fresh = entries.filter((e) => e.items?.length && Date.now() - new Date(e.at).getTime() < STALE_HOURS * 3600e3);
  if (!fresh.length) return null;
  const bits = fresh.map((e) => `${e.topic.split(' ').slice(0, 3).join(' ')}: ${e.items.length} (“${e.items[0].title.slice(0, 55)}”)`);
  return `**Pulse.** ${bits.join(' · ')}.`;
}

// Nightly refresh in the same quiet window as the overnight queue; once a
// day, only when interests exist.
export function startPulseScheduler(vaultPath) {
  let lastRunDay = null;
  const tick = async () => {
    beat('pulse');
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const mins = now.getHours() * 60 + now.getMinutes();
      if (lastRunDay === today || mins < 3 * 60 + 30 || mins >= 6 * 60 + 30) return;
      lastRunDay = today;
      const s = await refreshAllPulses(vaultPath);
      console.log(`pulse: refreshed ${s.refreshed}, failed ${s.failed}`);
    } catch (e) {
      console.error('pulse tick failed:', e.message);
    }
  };
  tick();
  setInterval(tick, 15 * 60_000);
}
