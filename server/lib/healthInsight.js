import { firstBalancedObjectMatch, parseModelJson } from './jsonSalvage.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecentDays } from './healthData.js';
import { loadSessions } from './workoutSessions.js';
import { listEntries as listJournalEntries, isHisOwnEntry, journalAuthorName } from './journal.js';
import { loadRecipeData } from './recipes.js';
import { loadRotation } from './rotation.js';
import { fetchEventsForDay } from './calendar.js';
import { getToday as getFoodLogToday } from './foodLog.js';
import { loadRecentDays as loadRecentNutritionDays } from './nutritionLog.js';
import { NOVA_LENS } from './lens.js';
import { profileContext } from './profile.js';
import { laneSkipped, laneEnabled } from './modelPrefs.js';
import { runTextLane, laneVia, assertGrounded } from './textLane.js';
import { loadDayFacts, dayVerdicts, verdictBlock, assertAgrees } from './dayVerdicts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// honors NOVA_DATA_DIR like every sibling store — it was the one hard-coded
// path (tests with the env override still wrote the REAL data dir)
const INSIGHT_FILE = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'health', 'insight.json');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The last few journal days, each line named by who wrote it (11 Oct 2026).
// This block was "Recent journal entries, including daily-review
// reflections", and the reflections are Nova's: every line read as his. Now
// his own entries say so, and the rest carry their author, so the insight
// can use Nova's notes as context without quoting them as his mood or words.
export function journalInsightLines(journalDays) {
  const lines = ['\n## Recent journal entries, most recent first (only lines marked HIS OWN WORDS are his; the rest are what Nova or an agent filed)'];
  if (!journalDays?.length) return [...lines, '- No journal entries yet.'];
  for (const d of journalDays) {
    for (const s of d.sections) {
      const preview = s.text.replace(/\s+/g, ' ').slice(0, 140);
      const who = isHisOwnEntry(s) ? 'HIS OWN WORDS' : `by ${journalAuthorName(s.author)}${s.heading ? `, ${s.heading}` : ''}`;
      lines.push(`- ${d.date} ${s.time} [${who}] ${preview}`);
    }
  }
  return lines;
}

export async function buildContext(vaultPath, slot) {
  return (await buildContexts(vaultPath, slot)).full;
}

// THE TWO CONTEXTS (2 Nov 2026, Phase B). The insight is local-first now
// (lib/textLane.js), and a 4B reads a 24k-character prompt badly: 8.2k of it
// was the whole profile and 2.4k the fleet and the org, none of which the
// one-sentence read of his numbers needs. The data block is built ONCE and
// both contexts share it; the compact one keeps his standing rules (they bind
// every agent) and the three profile sections a health read reasons from.
// Claude, as the escalation or his pick, still gets the full one.
export async function buildContexts(vaultPath, slot) {
  const head = [];
  const headCompact = [];

  // his standing rules and the rest of the fleet — this surface writes a
  // health read that every other agent now sees, so it must at minimum obey
  // the same corrections they do
  try {
    const { orgContext } = await import('./orgContext.js');
    const [org, rules] = await Promise.all([
      orgContext(vaultPath, 'health-insight'),
      orgContext(vaultPath, 'health-insight', { only: ['standing'] }),
    ]);
    if (org) head.push(org);
    if (rules) headCompact.push(rules);
  } catch { /* honest absence */ }

  // who Hayden is — every model surface reasons from the same operating profile
  try {
    const [profile, slim] = await Promise.all([
      profileContext(vaultPath),
      profileContext(vaultPath, { only: ['toward', 'training', 'fuel'] }),
    ]);
    if (profile) head.push(profile, '');
    if (slim) headCompact.push(slim, '');
  } catch { /* profile optional */ }

  const lines = [];
  // TODAY, said once by code, for the compact context only (2 Nov 2026,
  // after the first Phase B bench): the 4B read yesterday's HRV row as
  // today's, said "protein is at zero" with 7 g logged, and told him to eat
  // breakfast "before the workout" in the evening with Push already logged.
  // The rows below still carry everything; this names which of it is today.
  const todayFacts = [];
  const t = today();
  const healthDays = await loadRecentDays(7);
  const todayRow = healthDays.find((d) => d.date === t);
  if (todayRow) {
    const bits = [
      todayRow.hrv != null ? `HRV ${todayRow.hrv} ms` : null,
      todayRow.restingHeartRate != null ? `resting heart rate ${todayRow.restingHeartRate} bpm` : null,
      todayRow.sleepAsleepMinutes != null ? `sleep ${todayRow.sleepAsleepMinutes} minutes` : 'no sleep logged for last night',
      todayRow.steps != null ? `${todayRow.steps} steps so far` : null,
    ].filter(Boolean);
    todayFacts.push(`- Body today: ${bits.join(', ')}.`);
  } else {
    todayFacts.push('- Body today: no health reading for today yet.');
  }
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
    const trained = sessions.filter((x) => x.date === t).map((x) => x.routineName);
    todayFacts.push(trained.length ? `- Trained today: ${trained.join(', ')} (already logged; do not tell him to train before it).` : '- Trained today: nothing logged yet.');
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
    todayFacts.push(`- Protein eaten so far today: ${consumedP}g${profile?.proteinFloorG ? ` of the ${profile.proteinFloorG}g floor` : ''}.`);
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
    lines.push(...journalInsightLines(await listJournalEntries(vaultPath, { limit: 3 })));
  } catch {
    lines.push('\n## Recent journal entries\n- Unavailable.');
  }

  try {
    lines.push(insightMemoryLines((await loadCachedInsight()).history));
  } catch { /* no memory, no line */ }

  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todayBlock = [`## TODAY (${t}, now ${clock}; read by code; every row below dated earlier is a past day)`, ...todayFacts, ''];
  // the comparisons, made by code for the model on this Mac (lib/dayVerdicts.js)
  let verdicts = [];
  try { verdicts = dayVerdicts(await loadDayFacts(vaultPath, now)); } catch { /* no verdicts, the plain check still runs */ }
  const vb = verdictBlock(verdicts);
  return { full: [...head, ...lines].join('\n'), compact: [...headCompact, ...todayBlock, ...(vb ? [vb] : []), ...lines].join('\n'), verdicts };
}

export function buildPrompt(context, slot) {
  const framing = slot === 'morning'
    ? "You're reviewing Hayden's readiness coming into today — how recovered he looks based on last night's sleep and HRV, recent training load, and what's on today's calendar."
    : "You're reviewing how Hayden's day actually went — a day-in-review, not a forecast. Focus on what happened: training completed (or not), food actually eaten, how the calendar day played out, and how that connects to recovery.";

  return `${NOVA_LENS}

You are a thoughtful, holistic health coach looking at Hayden's recent personal data — not just repeating numbers back, but noticing real patterns that connect sleep/recovery, training, nutrition, mood, and how his day is structured. ${framing}

${context}

Write ONE short, genuinely useful observation or piece of advice (1-2 sentences) that a good coach would proactively raise — something that connects at least two of these data sources if the data supports it (e.g. recovery signals vs training load, a packed calendar day vs the next morning's sleep/HRV, nutrition vs energy, a theme recurring across his own journal entries; an entry Nova or an agent filed is their note, never his words or mood). Be specific and concrete, not generic wellness advice. If there truly isn't enough data yet for a real observation, say so honestly rather than forcing one.

Output ONLY a JSON object with exactly these keys:
- hasInsight: boolean (false if there wasn't enough data for a genuine, specific observation)
- insight: string (empty string if hasInsight is false)

No markdown, no code fences, no commentary before or after — just the raw JSON object.`;
}

// The same contract for the model on this Mac, said shorter: the lens first
// (identical on every call, so Ollama reuses its cache), the job in five
// lines, his numbers, then the JSON line. Measured 2 Nov 2026: ~10k
// characters against the full prompt's ~24k (design/audits/2026-11-02-phase-b-lanes.md).
export function buildCompactPrompt(context, slot) {
  const job = slot === 'morning'
    ? 'how ready he is for today: last night\'s sleep and HRV, recent training, today\'s calendar'
    : 'how his day actually went: training done or not, food eaten, the calendar, and how that bears on recovery';
  return `${NOVA_LENS}

You are Nova's health coach writing ONE observation about Hayden's own data: ${job}.

Rules:
- One or two sentences, specific, connecting two of his data sources when the data supports it.
- Use only numbers that appear below, exactly as written. Do not calculate new ones.
- The VERDICTS block has already compared today's numbers with his targets: say them its way round.
- The TODAY block says what is true now. A health row with an earlier date is a past day: never call it today's.
- Lines not marked HIS OWN WORDS are Nova's or an agent's notes, never his mood or words.
- Do not repeat one of your last insights unless the data moved.
- If there is not enough data for a real observation, set hasInsight to false.

${context}

Reply with only JSON: {"hasInsight": true or false, "insight": "the observation, or empty"}`;
}

// The lane's check on an answer, either model's: one JSON object with a
// boolean and, when true, a non-empty insight. This Mac's answer must also
// say no number it was not shown (lib/textLane.js assertGrounded).
export function readInsight(text, { provider = 'claude', prompt = '', verdicts = [] } = {}) {
  const jsonMatch = firstBalancedObjectMatch(String(text || '').trim());
  if (!jsonMatch) throw new Error('No JSON object found in the response');
  const parsed = parseModelJson(jsonMatch[0]);
  if (typeof parsed?.hasInsight !== 'boolean') throw new Error('the insight has no hasInsight true/false');
  const insight = String(parsed.insight || '').trim();
  if (parsed.hasInsight && !insight) throw new Error('hasInsight is true but the insight is empty');
  if (provider === 'local') {
    if (insight.length > 600) throw new Error(`the insight runs ${insight.length} characters; it should be one or two sentences`);
    if (parsed.hasInsight) assertGrounded(insight, prompt, 'the insight');
    // and no sentence about today pointing the other way from code's verdict
    if (parsed.hasInsight) assertAgrees(insight, verdicts, prompt, 'the insight');
  }
  return { hasInsight: parsed.hasInsight, insight };
}

// ONE CALL, EITHER MODEL (2 Nov 2026). Local-first through runTextLane: the
// compact prompt to this Mac, the full one to Claude when this Mac cannot
// answer or its answer fails readInsight. Returns the parsed insight and who
// wrote it (laneVia), which the slot record carries.
export async function composeInsight(context, compact, slot, { run = runTextLane, verdicts = [] } = {}) {
  const prompt = buildPrompt(context, slot);
  const localPrompt = buildCompactPrompt(compact, slot);
  const out = await run('health-insight', prompt, {
    json: true,
    maxTokens: 400,
    localPrompt,
    validate: (text, { provider }) => readInsight(text, { provider, prompt: provider === 'local' ? localPrompt : prompt, verdicts }),
  });
  return { ...out.value, via: laneVia(out) };
}

// `tries`/`triesDate` cap the day's RETRIES after a genuine failure, not the
// day's ambition: the "already ran" guard below is the success record's
// date, so before this a failing compose left nothing behind and the hourly
// tick simply tried again — from 06:00 to midnight, silently. Three attempts
// is the same ceiling the daily review and the plan already keep.
const EMPTY_SLOT = { date: null, hasInsight: false, insight: null, generatedAt: null, tries: 0, triesDate: null, lastError: null };
export const MAX_TRIES_PER_DAY = 3;
let cachedInsight = null;

async function loadCachedInsight() {
  if (cachedInsight !== null) return cachedInsight;
  if (existsSync(INSIGHT_FILE())) {
    const raw = JSON.parse(await readFile(INSIGHT_FILE(), 'utf8'));
    if (raw.morning || raw.evening) {
      cachedInsight = { morning: raw.morning || { ...EMPTY_SLOT }, evening: raw.evening || { ...EMPTY_SLOT }, history: Array.isArray(raw.history) ? raw.history : [] };
    } else if (raw.date !== undefined) {
      // migrate the old single-insight file shape (from before morning/evening existed)
      cachedInsight = { morning: { ...EMPTY_SLOT }, evening: raw, history: [] };
    } else {
      cachedInsight = { morning: { ...EMPTY_SLOT }, evening: { ...EMPTY_SLOT }, history: [] };
    }
  } else {
    cachedInsight = { morning: { ...EMPTY_SLOT }, evening: { ...EMPTY_SLOT }, history: [] };
  }
  return cachedInsight;
}

// INSIGHT MEMORY. The model used to see the data and nothing of what it had
// already said about it — so the same observation could come back day after
// day, and a pattern it flagged yesterday was never followed up. The last
// few insights ride the context, with dates. Same file, no new store.
export const INSIGHT_HISTORY_KEEP = 6;
export function insightMemoryLines(history) {
  const recent = (history || []).filter((h) => h && h.insight).slice(-3);
  if (!recent.length) return '';
  return `\n## Your last insights (do NOT repeat an observation unless the data has moved; when yesterday's flagged pattern has resolved or held, say so once, briefly, then move on)\n${recent.map((h) => `- ${h.date} ${h.slot}: ${h.insight}`).join('\n')}`;
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
  const { full, compact, verdicts } = await buildContexts(vaultPath, slot);
  const result = await composeInsight(full, compact, slot, { verdicts });
  const record = {
    date: today(),
    hasInsight: !!result.hasInsight,
    insight: result.hasInsight ? String(result.insight || '').trim() : null,
    generatedAt: new Date().toISOString(),
    // who wrote it ("on this Mac" / "asked Claude · why"), lib/textLane.js laneVia
    ...(result.via ? { via: result.via } : {}),
  };
  const cached = await loadCachedInsight();
  const history = record.hasInsight
    ? [...(cached.history || []), { slot, date: record.date, insight: record.insight }].slice(-INSIGHT_HISTORY_KEEP)
    : (cached.history || []);
  const updated = { ...cached, [slot]: record, history };
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
