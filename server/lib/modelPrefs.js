import { readFileSync, statSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// THE MODEL BOARD — one place that names every lane in Nova that spawns the
// Claude CLI, which model it runs on, and whether it runs at all.
//
// Why this exists: on 21 Aug the Coach silently inherited the ACCOUNT's
// ambient default (`claude-fable-5[1m]` in ~/.claude/settings.json) and ate
// Hayden's usage mid-conversation. The fix that day pinned ten lanes by hand,
// and the pins then lived scattered across ~30 files as bare string literals —
// which is exactly how the next lane gets missed. (Eight still were: the
// session debrief, quick session, the Breaker, the weekly debrief, the Studio
// outline, the recipe tweak, the study lane and the statement scan all still
// had no --model when this file was written.)
//
// So: the registry below is the single source of truth. Every spawn site asks
// it for its model, and a lane with no entry here cannot exist. The same
// registry backs the Settings screen, so choosing a model is a tap rather
// than a code change — and turning a lane OFF is a real, honest stop, never a
// silent no-op.
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const PREFS_PATH = () => path.join(dataRoot(), 'model-prefs.json');

// The models the CLI will actually accept. The plain aliases track the newest
// release in their family automatically (`claude --help`: "Provide an alias
// for the latest model … or a model's full name"); the pinned ids below them
// are for when he wants a version that CANNOT move under him. Both forms are
// passed straight through to --model.
export const MODEL_CHOICES = [
  { value: 'opus', label: 'Opus 5', family: 'opus', hint: 'deepest reasoning — alias, follows the newest Opus' },
  { value: 'sonnet', label: 'Sonnet 5', family: 'sonnet', hint: 'the balanced workhorse — alias, follows the newest Sonnet' },
  { value: 'haiku', label: 'Haiku 4.5', family: 'haiku', hint: 'fastest and cheapest — alias, follows the newest Haiku' },
  { value: 'fable', label: 'Fable 5', family: 'fable', hint: 'alias, follows the newest Fable' },
  { value: 'claude-opus-5', label: 'Opus 5 · pinned', family: 'opus', hint: 'this exact version, never moves' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5 · pinned', family: 'sonnet', hint: 'this exact version, never moves' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 · pinned', family: 'haiku', hint: 'this exact version, never moves' },
  { value: 'claude-fable-5', label: 'Fable 5 · pinned', family: 'fable', hint: 'this exact version, never moves' },
];

const VALID_MODELS = new Set(MODEL_CHOICES.map((m) => m.value));

export const LANE_GROUPS = [
  { id: 'conversation', label: 'CONVERSATION', hint: 'the surfaces you talk to' },
  { id: 'coach', label: 'COACH & TRAINING', hint: 'the strength coach and everything it writes' },
  { id: 'capture', label: 'CAPTURE & SCAN', hint: 'turning a photo, a paste or a sentence into real data' },
  { id: 'daily', label: 'DAILY & BACKGROUND', hint: 'the scheduled lanes that run without you' },
  { id: 'research', label: 'RESEARCH & MEDIA', hint: 'reading the web and watching video for you' },
  { id: 'build', label: 'BUILD', hint: 'the lanes that write code' },
];

// Each lane: what it is, where it runs, what it costs to run, and — the part
// that keeps a toggle honest — exactly what stops happening when it is off.
// `def` preserves each lane's behaviour as it shipped, except for the eight
// that were never pinned at all; those are named here for the first time.
export const LANES = [
  // ---- conversation -------------------------------------------------------
  {
    id: 'ask-nova', label: 'Ask Nova', group: 'conversation', def: 'haiku',
    hint: 'the voice screen’s brain — read-only over the vault, streams as it speaks',
    off: 'The voice screen and the Siri shortcut stop answering and say so; everything deterministic (the glass, the brief’s numbers) still works.',
  },
  {
    id: 'greeting', label: 'Doorman greeting', group: 'conversation', def: 'haiku',
    hint: 'the unscripted hello when you arrive — composition only, no vault reads',
    off: 'Nova opens without a spoken greeting. Nothing is faked in its place.',
  },
  {
    id: 'calendar-command', label: 'Calendar in plain words', group: 'conversation',
    def: process.env.NOVA_CALENDAR_MODEL || 'haiku',
    hint: 'reads “move gym to 6pm tomorrow” into a typed calendar change',
    off: 'Calendar commands are refused with a plain message — nothing is guessed at your diary.',
  },

  // ---- coach --------------------------------------------------------------
  {
    id: 'coach', label: 'Ask Coach', group: 'coach', def: 'opus',
    hint: 'the Train screen’s chat — reasoning-heavy, and the lane that proposes program changes',
    off: 'Coach chat is refused with a plain message. Your program, history and analytics are untouched.',
  },
  {
    id: 'quick-session', label: 'Quick Session designer', group: 'coach', def: 'sonnet',
    hint: 'designs a one-off, time-boxed workout for a day outside the program',
    off: 'The Quick Session button reports it is off; build the session by hand instead.',
  },
  {
    id: 'session-debrief', label: 'Post-session debrief', group: 'coach', def: 'sonnet',
    hint: 'the words a coach says as the bar goes back in the rack',
    off: 'Sessions log exactly as they do now, just without the spoken reaction.',
  },
  {
    id: 'coach-reflection', label: 'Coach nightly reflection', group: 'coach', def: 'sonnet',
    hint: 'the Coach reviewing its own recent calls overnight',
    off: 'The nightly reflection is skipped. The deterministic program-review detectors keep running.',
  },
  {
    id: 'weekly-debrief', label: 'Weekly training debrief', group: 'coach', def: 'sonnet',
    hint: 'the week held against what you said you were training for',
    off: 'No weekly debrief is drafted into your Inbox.',
  },

  // ---- capture ------------------------------------------------------------
  {
    id: 'inbox-classify', label: 'Capture classifier', group: 'capture', def: 'haiku',
    hint: 'reads a captured line and decides what kind of thing it is',
    off: 'Captures still land on the rails and stop there, flagged with the reason — switch it back on and RETRY to file them.',
  },
  {
    id: 'scan-food-label', label: 'Food label scan', group: 'capture',
    def: process.env.NOVA_FOOD_SCAN_MODEL || 'haiku',
    hint: 'a photographed nutrition label into macros',
    off: 'Label scanning is refused; barcode lookup and manual entry still work.',
  },
  {
    id: 'scan-food-meal', label: 'Meal photo scan', group: 'capture',
    def: process.env.NOVA_FOOD_SCAN_MEAL_MODEL || 'sonnet',
    hint: 'a photographed plate into an estimated entry — judgment, not OCR',
    off: 'Meal photo scanning is refused; log the meal by hand or from a recipe.',
  },
  {
    id: 'food-describe', label: 'Food from a description', group: 'capture', def: 'sonnet',
    hint: '“two eggs on sourdough” into macros — searches the web for real product numbers',
    off: 'Describing a meal in words is refused; scan, barcode and manual entry still work.',
  },
  {
    id: 'scan-recipe', label: 'Recipe scan', group: 'capture',
    def: process.env.NOVA_SCAN_MODEL || 'haiku',
    hint: 'photographed recipe pages into a structured recipe you review before saving',
    off: 'Recipe scanning is refused; add the recipe manually.',
  },
  {
    id: 'scan-statement', label: 'Bank statement scan', group: 'capture', def: 'sonnet',
    hint: 'photographed statement rows into reviewable transactions',
    off: 'Statement scanning is refused; the CSV import path is unaffected.',
  },
  {
    id: 'tweak-recipe', label: 'Recipe tweak', group: 'capture', def: 'sonnet',
    hint: '“make it higher protein” into a real alternate version',
    off: 'Tweaks are refused; the original recipe and its saved alternates stay as they are.',
  },
  {
    id: 'shopping-categorize', label: 'Shopping list sorting', group: 'capture', def: 'sonnet',
    hint: 'files added items under the right supermarket aisle',
    off: 'Items still get added — they just land uncategorised.',
  },
  {
    id: 'ingest', label: 'Vault ingest', group: 'capture', def: 'opus',
    hint: 'a pasted note or article woven into real vault pages — one pass doing all the thinking',
    off: 'Ingest is refused. The verbatim original is still saved to Raw/ untouched.',
  },
  {
    id: 'ingest-digest', label: 'Vault ingest · long transcripts', group: 'capture', def: 'sonnet',
    hint: 'the same weave over a digested long transcript — structured transformation, deliberately cheaper (a 4-hour podcast once burned $8.15 on the ambient default)',
    off: 'Long transcripts are refused rather than run on the expensive path.',
  },

  // ---- daily --------------------------------------------------------------
  {
    id: 'daily-review', label: 'Daily review', group: 'daily', def: 'sonnet',
    hint: 'the end-of-day read across what actually happened',
    off: 'No daily review is drafted. Your receipts and streaks are deterministic and keep working.',
  },
  {
    id: 'plan-today', label: 'Plan today', group: 'daily', def: 'sonnet',
    hint: 'the morning shape of the day, drafted for your yes',
    off: 'No plan is drafted; the brief still reports the day’s real numbers.',
  },
  {
    id: 'journal-prompt', label: 'Journal prompt', group: 'daily', def: 'sonnet',
    hint: 'the one question worth answering tonight',
    off: 'The journal opens blank instead of prompted.',
  },
  {
    id: 'health-insight', label: 'Health insight', group: 'daily', def: 'sonnet',
    hint: 'reads your health data for the thing worth telling you',
    off: 'Health numbers, charts and the Sentinel’s deterministic alerts are unaffected; only the written read stops.',
  },
  {
    id: 'note-summary', label: 'Note summaries', group: 'daily', def: 'sonnet',
    hint: 'the one-line gist cached against a vault page',
    off: 'Notes show their own opening lines instead of a summary.',
  },
  {
    id: 'pattern-scout', label: 'Pattern scout', group: 'daily', def: 'sonnet',
    hint: 'hunts for cross-surface patterns worth raising',
    off: 'No patterns are raised.',
  },
  {
    id: 'leader-daily', label: 'Leader — daily idea', group: 'daily', def: 'sonnet',
    hint: 'the one leadership idea on your homepage each morning',
    off: 'No Try Today card is generated; the Leader’s library and your reflections are untouched.',
  },
  {
    id: 'leader-research', label: 'Leader — weekly research', group: 'daily', def: 'opus',
    hint: 'Saturday’s web-research run, steered by your stated struggles',
    off: 'The research library stops growing; daily ideas keep drawing on the vault and what’s already gathered.',
  },
  {
    id: 'leader-chat', label: 'Leader — conversation', group: 'conversation', def: 'opus',
    hint: 'the leadership sit-down — struggles in, research directions out',
    off: 'The Leader chat is refused with a plain message; the daily idea keeps arriving.',
  },
  {
    id: 'distill', label: 'Distill', group: 'daily', def: 'sonnet',
    hint: 'compresses a long thing into the part that matters',
    off: 'Distillation is refused; the source stays whole and readable.',
  },
  {
    id: 'pulse', label: 'Pulse', group: 'daily', def: 'haiku',
    hint: 'the overnight what’s-new sweep across your Interests',
    off: 'Pulse topics report honestly that nothing was fetched, rather than showing stale news as new.',
  },
  {
    id: 'study-lane', label: 'Study lane', group: 'daily', def: 'sonnet',
    hint: 'turns study material into recall questions',
    off: 'The study lane is refused; existing cards are unaffected.',
  },

  // ---- research -----------------------------------------------------------
  {
    id: 'researcher', label: 'Researcher', group: 'research', def: 'sonnet',
    hint: 'web-read-only, citation-required — the brief always lands in your Inbox for review',
    off: 'Research requests (including “research this” from Ask Nova and the overnight queue) are refused with a plain message.',
  },
  {
    id: 'watcher-chunk', label: 'Watcher · transcript pass', group: 'research', def: 'sonnet',
    hint: 'the parallel extraction over a long video’s transcript chunks',
    off: 'Long videos are refused rather than judged from a partial read.',
  },
  {
    id: 'watcher-verdict', label: 'Watcher · verdict pass', group: 'research', def: 'sonnet',
    hint: 'the judgment that becomes the Coach’s evidence check or a distilled note',
    off: 'Video watching is refused; nothing is written about a video Nova has not read.',
  },
  {
    id: 'librarian', label: 'Librarian · book research', group: 'research', def: 'sonnet',
    hint: 'a book title + author into a triangulated dossier — the weave into your vault then rides the ingest lane',
    off: 'Book requests are refused with a plain message; pasting your own notes about a book still works via ingest.',
  },
  {
    id: 'studio-outline', label: 'Studio outline', group: 'research', def: 'sonnet',
    hint: 'an idea into a real outline in your voice',
    off: 'Outlines are refused; the idea stays in Studio as you wrote it.',
  },

  // ---- build --------------------------------------------------------------
  {
    id: 'code', label: 'Code tab · Builder', group: 'build', def: 'sonnet',
    hint: 'the one lane that can edit real files. The Code screen’s own picker overrides this per message.',
    off: 'The Code tab refuses to send. Nothing can be edited from the phone while it is off.',
  },
  {
    id: 'breaker', label: 'Code tab · Breaker', group: 'build', def: 'sonnet',
    hint: 'the adversarial read-only reviewer in the sparring loop',
    off: 'SPAR reports it is off. The Builder is unaffected.',
  },
  {
    id: 'forge', label: 'Forge', group: 'build', def: 'sonnet',
    hint: 'the autonomous build lane — its own sandbox, proof required. Forge jobs may name their own model.',
    off: 'New Forge jobs are refused. Jobs already running are left alone.',
  },
];

const LANE_BY_ID = new Map(LANES.map((l) => [l.id, l]));

// --------------------------------- store -----------------------------------
// Read synchronously and cached against the file's mtime: every reader here
// is on a path that is about to spawn a process and wait seconds for a model,
// so a stat() is free, and the alternative — an async read threaded through
// thirty call sites — is exactly the kind of change that misses one.
let cache = null;
let cacheStamp = null;

function loadRaw() {
  const file = PREFS_PATH();
  let stamp = null;
  try {
    stamp = existsSync(file) ? `${statSync(file).mtimeMs}:${file}` : `none:${file}`;
  } catch {
    stamp = `none:${file}`;
  }
  if (cache && cacheStamp === stamp) return cache;
  let parsed = {};
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      parsed = raw && typeof raw.lanes === 'object' && raw.lanes ? raw.lanes : {};
    } catch {
      parsed = {}; // a corrupt file falls back to the defaults rather than to nothing
    }
  }
  cache = parsed;
  cacheStamp = stamp;
  return cache;
}

/** The model alias/id this lane should run on. Never returns empty — a blank
 *  --model is how the account's ambient default got in last time. */
export function modelFor(laneId) {
  const lane = LANE_BY_ID.get(laneId);
  if (!lane) throw new Error(`unknown model lane: ${laneId}`);
  const saved = loadRaw()[laneId]?.model;
  return saved && VALID_MODELS.has(saved) ? saved : lane.def;
}

/** Is this lane switched on? Unset means on — a lane you have never touched
 *  behaves exactly as it always did. */
export function laneEnabled(laneId) {
  const lane = LANE_BY_ID.get(laneId);
  if (!lane) throw new Error(`unknown model lane: ${laneId}`);
  return loadRaw()[laneId]?.enabled !== false;
}

/** The error a switched-off lane raises. One shape everywhere, so every
 *  surface can say the same true thing: it is off, and here is where. */
export function laneOffError(laneId) {
  const lane = LANE_BY_ID.get(laneId);
  const err = new Error(`${lane ? lane.label : laneId} is switched off in Settings → Claude models.`);
  err.laneOff = laneId;
  return err;
}

/** Throw if this lane is off. For the interactive lanes, where a refusal has
 *  somewhere to be shown. */
export function assertLaneOn(laneId) {
  if (!laneEnabled(laneId)) throw laneOffError(laneId);
  return true;
}

/** For schedulers and fire-and-forget lanes: log the skip once, return false.
 *  A background lane that stops must leave a receipt — silence is the one
 *  failure mode a toggle must never have. */
export function laneSkipped(laneId, where) {
  if (laneEnabled(laneId)) return false;
  console.log(`model lane "${laneId}" is off — skipping ${where || laneId}`);
  return true;
}

/** The whole board, for the Settings screen. */
export function getModelPrefs() {
  const saved = loadRaw();
  return {
    models: MODEL_CHOICES,
    groups: LANE_GROUPS,
    lanes: LANES.map((l) => ({
      id: l.id,
      label: l.label,
      group: l.group,
      hint: l.hint,
      off: l.off,
      model: modelFor(l.id),
      defaultModel: l.def,
      customised: !!(saved[l.id]?.model && saved[l.id].model !== l.def),
      enabled: laneEnabled(l.id),
    })),
  };
}

/** Set one lane's model and/or on-off state. Validates hard: an unknown lane
 *  or an unrecognised model is a 400, never a silent fall-through to the
 *  ambient default. */
export async function setLanePref(laneId, { model, enabled } = {}) {
  const lane = LANE_BY_ID.get(laneId);
  if (!lane) throw new Error(`unknown lane: ${laneId}`);
  if (model !== undefined && !VALID_MODELS.has(model)) {
    throw new Error(`model must be one of: ${[...VALID_MODELS].join(', ')}`);
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') throw new Error('enabled must be true or false');

  const next = { ...loadRaw() };
  const entry = { ...(next[laneId] || {}) };
  if (model !== undefined) entry.model = model;
  if (enabled !== undefined) entry.enabled = enabled;
  next[laneId] = entry;

  await mkdir(dataRoot(), { recursive: true });
  const tmp = PREFS_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify({ lanes: next }, null, 2), 'utf8');
  await rename(tmp, PREFS_PATH());
  cache = null;
  cacheStamp = null;
  return getModelPrefs();
}

/** Put one lane — or the whole board — back to how it shipped. */
export async function resetLanePref(laneId) {
  const next = { ...loadRaw() };
  if (laneId) {
    if (!LANE_BY_ID.has(laneId)) throw new Error(`unknown lane: ${laneId}`);
    delete next[laneId];
  } else {
    for (const k of Object.keys(next)) delete next[k];
  }
  await mkdir(dataRoot(), { recursive: true });
  const tmp = PREFS_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify({ lanes: next }, null, 2), 'utf8');
  await rename(tmp, PREFS_PATH());
  cache = null;
  cacheStamp = null;
  return getModelPrefs();
}
