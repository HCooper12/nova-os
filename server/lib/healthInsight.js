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
import { fetchEventsForDay } from './calendar.js';
import { getToday as getFoodLogToday } from './foodLog.js';
import { loadRecentDays as loadRecentNutritionDays } from './nutritionLog.js';
import { NOVA_LENS } from './lens.js';
import { profileContext } from './profile.js';
import { modelFor, laneSkipped, laneEnabled } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { settleWatchdog } from './settle.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// honors NOVA_DATA_DIR like every sibling store — it was the one hard-coded
// path (tests with the env override still wrote the REAL data dir)
const INSIGHT_FILE = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'health', 'insight.json');
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '0.5';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function buildContext(vaultPath, slot) {
  const lines = [];

  // his standing rules and the rest of the fleet — this surface writes a
  // health read that every other agent now sees, so it must at minimum obey
  // the same corrections they do
  try {
    const { orgContext } = await import('./orgContext.js');
    const org = await orgContext(vaultPath, 'health-insight');
    if (org) lines.push(org);
  } catch { /* honest absence */ }

  // who Hayden is — every model surface reasons from the same operating profile
  try {
    const profile = await profileContext(vaultPath);
    if (profile) lines.push(profile, '');
  } catch { /* profile optional */ }

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
    const foodLog = await getFoodLogToday();
    const foodLogTotals = foodLog.entries.reduce((a, e) => ({ p: a.p + e.macros.p, c: a.c + e.macros.c, f: a.f + e.macros.f, kcal: a.kcal + e.macros.kcal }), { p: 0, c: 0, f: 0, kcal: 0 });
    const consumedP = Math.round(rotation.consumedTotals.p + foodLogTotals.p);
    lines.push('\n## Today\'s nutrition');
    lines.push(`- Planned: Protein ${Math.round(rotation.totals.p)}g${profile?.proteinFloorG ? ` (floor ${profile.proteinFloorG}g)` : ''}, Carbs ${Math.round(rotation.totals.c)}g, Fat ${Math.round(rotation.totals.f)}g, Energy ${Math.round(rotation.totals.kcal)} kcal${profile?.targetKcal ? ` (target ${profile.targetKcal})` : ''}`);
    lines.push(`- Actually eaten so far (marked-eaten rotation meals + logged extras): ${consumedP}g protein`);
    if (foodLog.entries.length) {
      lines.push(`- Off-plan food logged today: ${foodLog.entries.map((e) => `${e.name} (${Math.round(e.macros.p)}g P)`).join(', ')}`);
    }
  } catch {
    lines.push('\n## Today\'s nutrition\n- Unavailable.');
  }

  try {
    const nutritionDays = await loadRecentNutritionDays(7);
    lines.push('\n## Actual protein intake, recent days (oldest first — real consumption, not the plan)');
    if (nutritionDays.length) {
      for (const d of nutritionDays) {
        lines.push(`- ${d.date} — ${d.p}g protein${d.floorG ? ` vs ${d.floorG}g floor (${d.floorMet ? 'met' : 'short'})` : ''}`);
      }
    } else {
      lines.push('- No history yet — this builds up as meals get marked eaten or logged.');
    }
  } catch {
    lines.push('\n## Actual protein intake, recent days\n- Unavailable.');
  }

  // Calendar context per slot. Morning: yesterday's load (what drove last
  // night's recovery) AND today's day ahead — the framing references today, so
  // today must actually be in the context (the sweep caught the mismatch).
  // Evening: today's calendar — the day being reviewed, not yesterday's.
  const calendarSection = async (heading, date) => {
    try {
      const events = await fetchEventsForDay(date);
      lines.push(`\n## ${heading}`);
      if (events.length) {
        const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        let scheduledMinutes = 0;
        let backToBackCount = 0;
        let prevEnd = null;
        for (const e of events) {
          if (e.end) {
            let mins = toMinutes(e.end) - toMinutes(e.time);
            if (mins < 0) mins += 24 * 60; // overnight (e.g. sleep block)
            scheduledMinutes += mins;
          }
          if (prevEnd != null && toMinutes(e.time) - prevEnd <= 15) backToBackCount++;
          if (e.end) prevEnd = toMinutes(e.end) % (24 * 60);
        }
        lines.push(`- Load: ${Math.round(scheduledMinutes / 6) / 10}h scheduled across ${events.length} events${backToBackCount ? `, ${backToBackCount} back-to-back` : ''}`);
        for (const e of events) lines.push(`- ${e.time} ${e.label} (${e.calendar})`);
      } else {
        lines.push('- Nothing on the calendar.');
      }
    } catch {
      lines.push(`\n## ${heading}\n- Unavailable (Calendar not connected, or a fetch error).`);
    }
  };
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (slot === 'morning') {
    await calendarSection("Yesterday's calendar (what drove last night's recovery)", yesterday);
    await calendarSection("Today's calendar (the day ahead)", new Date());
  } else {
    await calendarSection("Today's calendar (the day being reviewed)", new Date());
  }

  try {
    const journalDays = await listJournalEntries(vaultPath, { limit: 3 });
    lines.push('\n## Recent journal entries, including daily-review reflections (most recent first)');
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

function buildPrompt(context, slot) {
  const framing = slot === 'morning'
    ? "You're reviewing Hayden's readiness coming into today — how recovered he looks based on last night's sleep and HRV, recent training load, and what's on today's calendar."
    : "You're reviewing how Hayden's day actually went — a day-in-review, not a forecast. Focus on what happened: training completed (or not), food actually eaten, how the calendar day played out, and how that connects to recovery.";

  return `${NOVA_LENS}

You are a thoughtful, holistic health coach looking at Hayden's recent personal data — not just repeating numbers back, but noticing real patterns that connect sleep/recovery, training, nutrition, mood, and how his day is structured. ${framing}

${context}

Write ONE short, genuinely useful observation or piece of advice (1-2 sentences) that a good coach would proactively raise — something that connects at least two of these data sources if the data supports it (e.g. recovery signals vs training load, a packed calendar day vs the next morning's sleep/HRV, nutrition vs energy, a theme recurring across journal/reflection entries). Be specific and concrete, not generic wellness advice. If there truly isn't enough data yet for a real observation, say so honestly rather than forcing one.

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
      ...boundaryArgs(''),
      '--output-format', 'json',
      // named explicitly — an unpinned call silently inherits the account's
      // ambient default model, which cost him a Fable-5 usage-limit hit on a
      // totally unrelated lane (Coach) once that became the default. The pin
      // now comes from the model board (lib/modelPrefs.js) so it is settable
      // in Settings; the default is the 'sonnet' this lane has always run on.
      '--model', modelFor('health-insight'),
    '--max-budget-usd', MAX_BUDGET_USD,
      '--no-session-persistence',
    ]);
    let stdout = '';
    let stderr = '';
    settleWatchdog(child, { label: "the health insight", minutes: 10 });
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

// `tries`/`triesDate` cap the day's SPEND, not the day's ambition: the
// "already ran" guard below is the success record's date, so before this a
// failing compose left nothing behind and the hourly tick simply tried again
// — from 06:00 to midnight, at MAX_BUDGET_USD a go, silently. Three attempts
// is the same ceiling the daily review and the plan already keep.
const EMPTY_SLOT = { date: null, hasInsight: false, insight: null, generatedAt: null, tries: 0, triesDate: null, lastError: null };
export const MAX_TRIES_PER_DAY = 3;
let cachedInsight = null;

async function loadCachedInsight() {
  if (cachedInsight !== null) return cachedInsight;
  if (existsSync(INSIGHT_FILE())) {
    const raw = JSON.parse(await readFile(INSIGHT_FILE(), 'utf8'));
    if (raw.morning || raw.evening) {
      cachedInsight = { morning: raw.morning || { ...EMPTY_SLOT }, evening: raw.evening || { ...EMPTY_SLOT } };
    } else if (raw.date !== undefined) {
      // migrate the old single-insight file shape (from before morning/evening existed)
      cachedInsight = { morning: { ...EMPTY_SLOT }, evening: raw };
    } else {
      cachedInsight = { morning: { ...EMPTY_SLOT }, evening: { ...EMPTY_SLOT } };
    }
  } else {
    cachedInsight = { morning: { ...EMPTY_SLOT }, evening: { ...EMPTY_SLOT } };
  }
  return cachedInsight;
}

export async function getLatestInsight() {
  return loadCachedInsight();
}

export async function generateInsightNow(vaultPath, slot) {
  return generateAndStore(vaultPath, slot === 'morning' ? 'morning' : 'evening');
}

async function generateAndStore(vaultPath, slot) {
  // Off means the cache is left exactly as it is — an old insight keeps its
  // own timestamp and self-labels as stale rather than being overwritten by
  // nothing. Health numbers and the Sentinel's alerts are untouched.
  if (!laneEnabled('health-insight')) { laneSkipped('health-insight', `the ${slot} health insight`); return loadCachedInsight(); }
  const context = await buildContext(vaultPath, slot);
  const result = await runClaude(buildPrompt(context, slot));
  const record = {
    date: today(),
    hasInsight: !!result.hasInsight,
    insight: result.hasInsight ? String(result.insight || '').trim() : null,
    generatedAt: new Date().toISOString(),
  };
  const cached = await loadCachedInsight();
  const updated = { ...cached, [slot]: record };
  await mkdir(path.dirname(INSIGHT_FILE()), { recursive: true });
  await writeFile(INSIGHT_FILE(), JSON.stringify(updated, null, 2), 'utf8');
  cachedInsight = updated;
  return updated;
}

// Runs once an hour. Generates a morning (readiness) insight once per day
// after 6am and an evening (day-in-review) insight once per day after 6pm —
// each independently, only once at least one day of health data exists, so
// it stays quiet until the phone side (Shortcuts automation) sends data.
// How many attempts this slot has already spent TODAY. A counter from an
// earlier day is stale and reads as zero — the cap is per-day, not forever.
export function triesToday(slotRecord, t) {
  return slotRecord?.triesDate === t ? (slotRecord.tries || 0) : 0;
}

// A failed attempt has to leave a mark, or the cap cannot exist. Deliberately
// does NOT touch `date`: that stays the last SUCCESS, so a later attempt today
// can still succeed and the screen keeps showing yesterday's real insight
// rather than a hole.
export async function recordFailedAttempt(slot, t, message) {
  const cached = await loadCachedInsight();
  const prior = cached[slot] || { ...EMPTY_SLOT };
  const updated = {
    ...cached,
    [slot]: { ...prior, triesDate: t, tries: triesToday(prior, t) + 1, lastError: String(message || '').slice(0, 200) },
  };
  await mkdir(path.dirname(INSIGHT_FILE()), { recursive: true });
  await writeFile(INSIGHT_FILE(), JSON.stringify(updated, null, 2), 'utf8');
  cachedInsight = updated;
  return updated[slot].tries;
}

// Each slot is attempted independently — a morning failure used to abort the
// whole tick and take the evening insight with it.
async function attemptSlot(vaultPath, slot, t) {
  const cached = await loadCachedInsight();
  const spent = triesToday(cached[slot], t);
  if (spent >= MAX_TRIES_PER_DAY) return; // the day's budget for this slot is gone
  try {
    await generateAndStore(vaultPath, slot);
  } catch (err) {
    const tries = await recordFailedAttempt(slot, t, err.message);
    console.error(`Health insight (${slot}) failed, attempt ${tries}/${MAX_TRIES_PER_DAY}:`, err.message);
    if (tries >= MAX_TRIES_PER_DAY) {
      // Giving up silently is the failure mode this cap could easily create:
      // he would just never get a morning insight and never learn why. Say it
      // once, on the last attempt, the way a failed Forge build announces.
      import('./telegram.js')
        .then(({ sendTelegramText }) => sendTelegramText(
          `◈ No ${slot} health insight today — ${MAX_TRIES_PER_DAY} attempts failed (${String(err.message || '').slice(0, 120)}). Nothing else is affected; it will try again tomorrow.`))
        .catch(() => {});
    }
  }
}

async function checkAndGenerate(vaultPath) {
  try {
    const recentDays = await loadRecentDays(1);
    if (!recentDays.length) return;
    const hour = new Date().getHours();
    const t = today();
    const cached = await loadCachedInsight();
    if (cached.morning.date !== t && hour >= 6) await attemptSlot(vaultPath, 'morning', t);
    if (cached.evening.date !== t && hour >= 18) await attemptSlot(vaultPath, 'evening', t);
  } catch (err) {
    console.error('Health insight generation failed:', err.message);
  }
}

export function startHealthInsightScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('healthinsight'); // joins the watch-the-watcher net
    checkAndGenerate(vaultPath);
  };
  tick();
  setInterval(tick, 60 * 60 * 1000);
}
