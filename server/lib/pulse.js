import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
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
// Measured 3 Sep 2026 (one real run, haiku): the Hypertrophy topic cost
// $1.06 over 20 web searches — twice the cap — which is why 1–2 of 3 topics
// "exited 1" most nights with nothing to show and the $0.50 spent anyway.
// The prompt now caps the searching; the budget itself is his call and is
// surfaced, not raised quietly (NOVA-METHOD: model cost discipline).
export const MAX_SEARCHES = 8;
export const MAX_TOPICS = 6;
const MAX_ITEMS = 5;
export const STALE_HOURS = 24;
// URLs already shown for a topic, remembered so a refresh cannot reprint
// them wearing a fresh label (audit [38] item 1)
const SEEN_CAP = 40;

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

// The page, read honestly: the topics that will run AND the ones past the
// cap, so the cap can be named where it bites instead of silently dropping
// his seventh line (audit [38] item 3).
export async function loadInterestsReport(vaultPath) {
  await ensureInterestsFile(vaultPath);
  const raw = await readFile(path.join(vaultPath, INTERESTS_REL), 'utf8');
  const all = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^- (.+?)\s*$/);
    if (m) all.push(m[1].trim());
  }
  return { topics: all.slice(0, MAX_TOPICS), overCap: all.slice(MAX_TOPICS) };
}

export async function loadInterests(vaultPath) {
  return (await loadInterestsReport(vaultPath)).topics;
}

export function buildPulsePrompt(topic, { exclude = [] } = {}) {
  return `You are Nova's pulse-taker. Find what is genuinely NEW (roughly the last two weeks) on this topic and return the ${MAX_ITEMS} most substantive items. Real sources only — studies, articles, releases, talks, videos; skip engagement bait.

Topic: ${topic}

Rules:
- Every item needs a REAL working URL you actually found — never construct or guess one. No URL, no item. Fewer honest items beat five padded ones.
- "note" is one plain sentence on why it matters — no hype.
- Spend at most ${MAX_SEARCHES} web searches in total, then stop and return what you have — a short honest list beats a long expensive one.
${exclude.length ? `- ALREADY SHOWN — return only items NOT in this list; an empty list is the honest answer when nothing new exists:\n${exclude.map((u) => `  ${u}`).join('\n')}\n` : ''}
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

// What the CLI envelope says when a run fails — "exited 1" told him nothing
// for a fortnight. The budget error carries no result text, only a subtype.
export function describeRunFailure(outer, code, stderr = '') {
  const sub = String(outer?.subtype || '');
  const cost = typeof outer?.total_cost_usd === 'number' ? ` after $${outer.total_cost_usd.toFixed(2)}` : '';
  const searches = outer?.modelUsage ? Object.values(outer.modelUsage).reduce((a, m) => a + (m.webSearchRequests || 0), 0) : null;
  const searched = searches ? ` and ${searches} searches` : '';
  if (/budget/i.test(sub)) return `budget of $${MAX_BUDGET_USD} exhausted${cost}${searched} — the run was cut off before it answered`;
  if (/max_turns/i.test(sub)) return `turn limit hit${cost}${searched}`;
  return outer?.result || stderr.trim() || (sub ? `${sub}${cost}` : `exited ${code}${cost}`);
}

export function runReceipt(outer) {
  const searches = outer?.modelUsage ? Object.values(outer.modelUsage).reduce((a, m) => a + (m.webSearchRequests || 0), 0) : null;
  return {
    costUsd: typeof outer?.total_cost_usd === 'number' ? outer.total_cost_usd : null,
    searches,
    seconds: typeof outer?.duration_ms === 'number' ? Math.round(outer.duration_ms / 1000) : null,
  };
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
  const entries = [
    ...Object.entries(cache.topics).map(([topic, v]) => ({ topic, ...v })),
    // past the cap: present, honest, never refreshed
    ...(cache.overCap || []).map((topic) => ({ topic, overCap: true, at: null, items: [], newCount: 0 })),
  ];
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
        if (outer.is_error || code !== 0) throw new Error(describeRunFailure(outer, code, stderr));
        const m = firstBalancedObjectMatch((outer.result || ''));
        if (!m) throw new Error('no JSON in pulse response');
        const parsed = parseModelJson(m[0]);
        // the receipt he needs to set the budget: what a run really costs
        parsed.__run = runReceipt(outer);
        resolve(parsed);
      } catch (e) { reject(e); }
    });
    child.on('error', reject);
  }));

  const prev = (await loadCache()).topics[topic] || null;
  const seen = new Set([...(prev?.seen || []), ...(prev?.items || []).map((i) => i.url)]);
  let raw;
  try {
    raw = await run(buildPulsePrompt(topic, { exclude: [...seen].slice(-SEEN_CAP) }));
  } catch (e) {
    // the previous items stay; the failure is written where the panel and the
    // ops list can read it, not only into a log nobody opens
    const cache = await loadCache();
    if (cache.topics[topic]) cache.topics[topic].lastError = { at: new Date().toISOString(), message: String(e.message).slice(0, 200) };
    else cache.topics[topic] = { at: null, items: [], newCount: 0, lastError: { at: new Date().toISOString(), message: String(e.message).slice(0, 200) } };
    await saveCache(cache);
    throw e;
  }
  const receipt = raw?.__run || null;
  const fetched = normalizePulseItems(raw);
  if (receipt) console.log(`pulse "${topic}": ${fetched.length} item(s), $${receipt.costUsd?.toFixed(2) ?? '?'}, ${receipt.searches ?? '?'} searches, ${receipt.seconds ?? '?'}s`);
  // Code decides what counts as new. The model is asked to exclude what was
  // shown, but a reprint wearing a fresh label is exactly the failure this
  // guards against — so the URL memory is the judge, not the prompt.
  const fresh = fetched.filter((i) => !seen.has(i.url));
  const now = new Date().toISOString();
  const seenList = [...seen].slice(-SEEN_CAP);
  const entry = fresh.length
    ? { at: now, items: fresh, newCount: fresh.length, lastNewAt: now, seen: seenList }
    // nothing new: yesterday's items stay, each marked seen, and the panel
    // says so instead of presenting them as today's
    : { at: now, items: (prev?.items || []).map((i) => ({ ...i, seen: true })), newCount: 0, lastNewAt: prev?.lastNewAt || prev?.at || null, seen: seenList };
  if (receipt) entry.run = receipt; // a success clears any lastError by omission
  const cache = await loadCache(); // re-read: the run took a while
  cache.topics[topic] = entry;
  await saveCache(cache);
  return entry;
}

// Refresh every interest, sequentially, one model at a time. Topics that
// fail keep their previous cache — stale-and-labelled beats gone.
export async function refreshAllPulses(vaultPath, { runner } = {}) {
  // A real runner injected by a test still runs; only the spawning path is
  // gated, and only when nothing was injected.
  if (!runner && laneSkipped('pulse', 'the overnight pulse sweep')) return { refreshed: 0, failed: 0, laneOff: true };
  const { topics, overCap } = await loadInterestsReport(vaultPath);
  const summary = { refreshed: 0, failed: 0, nothingNew: 0, overCap: overCap.length };
  if (overCap.length) console.log(`pulse: ${overCap.length} topic(s) past the ${MAX_TOPICS}-topic limit not refreshed: ${overCap.join(' · ')}`);
  for (const topic of topics) {
    try {
      const entry = await refreshPulseTopic(topic, { runner });
      summary.refreshed++;
      if (entry.newCount === 0) summary.nothingNew++;
    } catch (e) { console.error(`pulse "${topic}" failed:`, e.message); summary.failed++; }
  }
  // drop cache entries for topics no longer on the page; record the over-cap
  // names so the panel can say why they never refresh
  const cache = await loadCache();
  for (const t of Object.keys(cache.topics)) if (!topics.includes(t)) delete cache.topics[t];
  cache.overCap = overCap;
  await saveCache(cache);
  return summary;
}

// One line for the morning dispatch — counts + freshest headline per topic.
export async function pulseMorningLine() {
  const entries = await getPulse();
  const fresh = entries.filter((e) => e.at && e.items?.length && Date.now() - new Date(e.at).getTime() < STALE_HOURS * 3600e3);
  if (!fresh.length) return null;
  const bits = fresh.map((e) => {
    const name = e.topic.split(' ').slice(0, 3).join(' ');
    // a refresh that found nothing new says so — the old items are not news
    if (e.newCount === 0) return `${name}: nothing new${e.lastNewAt ? ` since ${String(e.lastNewAt).slice(0, 10)}` : ''}`;
    return `${name}: ${e.items.length} (“${e.items[0].title.slice(0, 55)}”)`;
  });
  return `**Pulse.** ${bits.join(' · ')}.`;
}

// The overnight window, plus one late catch-up: a Mac asleep through
// 03:30–06:30 used to mean no pulse until tomorrow. Past 09:00 a day that
// never ran runs once; lastRunDay lives in the cache file so a restart
// cannot double it either (audit [38] item 2).
export function localDay(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function pulseRunDue(now, lastRunDay) {
  if (lastRunDay === localDay(now)) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= 3 * 60 + 30 && mins < 6 * 60 + 30) return true;
  return mins >= 9 * 60; // the catch-up
}

// Nightly refresh in the same quiet window as the overnight queue; once a
// day, only when interests exist.
export function startPulseScheduler(vaultPath) {
  const tick = async () => {
    beat('pulse');
    try {
      const now = new Date();
      const cache = await loadCache();
      if (!pulseRunDue(now, cache.lastRunDay)) return;
      cache.lastRunDay = localDay(now); // claimed before the run: a crash mid-run waits for tomorrow, never doubles
      await saveCache(cache);
      const s = await refreshAllPulses(vaultPath);
      console.log(`pulse: refreshed ${s.refreshed}, failed ${s.failed}${s.nothingNew ? `, ${s.nothingNew} with nothing new` : ''}${s.overCap ? `, ${s.overCap} past the cap` : ''}`);
    } catch (e) {
      console.error('pulse tick failed:', e.message);
    }
  };
  tick();
  setInterval(tick, 15 * 60_000);
}
