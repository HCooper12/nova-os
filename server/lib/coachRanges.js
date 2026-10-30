// HIS WEEKLY SET RANGES, FROM HIS RESEARCH (31 Oct 2026).
//
// His words that day: "I still don't see anything from the coach that I can
// review for it to provide suggestions on the set ranges per week that I
// should be hitting … The amount of sets I should be hitting each week should
// also be coming from its research." Every muscle had been judged against
// the house 10–20 default since 16 Oct: the only door to his own ranges was a
// Coach chat PROPOSE {"action":"goal","volumeRanges":…}, and nothing ever
// asked Coach to walk through it. The door existed; nobody was sent to it.
//
// THE SHAPE (models decide, code acts):
//   CODE gathers the research. His vault already holds it: Researcher briefs
//   on weekly volume, study reads, Watcher notes on videos he uploaded, his
//   own What Works page. A lexical pass over the research folders picks the
//   notes that make a sets-per-week claim and hands them over with their
//   PATHS. When the vault is thin (fewer than MIN_SOURCES such notes), the
//   lane does not guess: it asks the Researcher for a cited brief through the
//   Researcher's own lane and waits for it to land.
//   THE MODEL (the coach-ranges lane, read-only in the vault) decides only
//   the numbers: per muscle a [low, high] in weekly hard sets counted the
//   house way, one plain sentence of why, and the vault paths it rests on.
//   CODE validates every row: an exact volume muscle, whole numbers through
//   cleanVolumeRanges, a goal muscle inside a sane hypertrophy band, and at
//   least one cited path that is really one of the notes it was handed. A
//   proposal missing any goal muscle is refused whole.
//   THE CARD is the SAME goal-target card Coach's chat goal cards file
//   (route 'goal-target', payload.settings), so his yes writes
//   goals.volumeRanges through setGoalSettings and Undo puts the prior back.
//   It also carries `volumeRangesSource` (the date and the notes), which is
//   how the week sheet can say "Coach's, from your research (31 Oct)".
//
// WHEN IT RUNS (code's call, never the model's): when a relevant note appears
// that the last run never saw, and otherwise at most once every 30 days;
// never while a ranges card is already waiting on him.

import { readFile, readdir, stat, writeFile, mkdir, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { NOVA_LENS } from './lens.js';
import { modelFor, laneEnabled, effortArgs } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { parseModelJson, firstBalancedObjectMatch } from './jsonSalvage.js';
import { parseEnvelope } from './modelSpend.js';
import { VOLUME_GROUPS, VOLUME_RANGE, canonicalGroup, cleanVolumeRanges, NON_VOLUME } from '../../src/muscleTaxonomy.js';

// the absolute path, as the Researcher and the reflection use: launchd's PATH
// does not carry ~/.local/bin
const CLAUDE_BIN = process.env.NOVA_CLAUDE_BIN || process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
export const RANGES_LANE = 'coach-ranges';
export const RANGES_KEY_PREFIX = 'coach-ranges:';

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const STATE = () => path.join(dataRoot(), 'coach-ranges.json');

/* ------------------------------ the research ----------------------------- */

// Where his research lives. Outputs/ is Nova's own writing (a plan Nova drew
// is not evidence for itself) and the Journal is his diary; neither is read.
export const RESEARCH_DIRS = ['Wiki/Inbox', 'Wiki/Sources', 'Wiki/Concepts', 'Wiki/Health', 'Wiki/Topics', 'Raw'];
const SKIP = /(^|\/)(index|log)\.md$|Fitness Goals\.md$/i;

// "10-20 sets per week", "12+ hard sets a week", "sets per muscle per week",
// "weekly sets", "weekly volume": a claim about the weekly dose.
const DOSE = /\b\d{1,2}(?:\s*(?:-|–|to)\s*\d{1,2})?\+?\s*(?:hard |working |direct |weekly |fractional )?sets?\s*(?:per|a|\/|each)\s*(?:muscle\s*(?:group\s*)?(?:per\s*|a\s*)?)?(?:week|wk)\b|\bsets per (?:muscle )?(?:per )?week\b|\bweekly (?:set )?volume\b|\bweekly sets\b|\bdose[- ]response\b/gi;
const GROWTH = /\b(hypertroph\w*|muscle growth|muscle size|grow(?:th|ing)?)\b/i;
const MIN_SOURCES = 3;
const MAX_SOURCES = 12;
const EXCERPT_CHARS = 1100;

async function walk(dir, out, depth = 0) {
  if (depth > 4) return;
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out, depth + 1);
    else if (e.name.endsWith('.md')) out.push(full);
  }
}

const titleOf = (raw, rel) => (String(raw).match(/^#\s+(.+)$/m)?.[1] || path.basename(rel, '.md')).trim().slice(0, 160);

// The lines that carry the dose claims, in order, until the excerpt is full.
export function doseExcerpt(raw, limit = EXCERPT_CHARS) {
  const lines = String(raw).split('\n');
  const out = [];
  let n = 0;
  for (const line of lines) {
    DOSE.lastIndex = 0;
    if (!DOSE.test(line)) continue;
    const t = line.trim().slice(0, 400);
    if (!t || n + t.length > limit) continue;
    out.push(t);
    n += t.length + 1;
  }
  return out.join('\n');
}

// What kind of thing a note is, so a podcast opinion and a meta-analysis are
// never weighed as the same claim (the lens's provenance rule).
export function kindOf(rel, raw) {
  if (/^Raw\//.test(rel)) return 'transcript';
  if (/^Wiki\/Sources\//.test(rel)) return 'video/podcast note';
  if (/^Wiki\/Health\//.test(rel)) return 'his own training page';
  // the study lane's note (lib/paperLane.js renderPaperNote) reads one paper
  if (/^##\s*What it claims\b/m.test(raw)) return 'study read';
  if (/^#{1,3}\s*Sources\b/im.test(raw) && /https?:\/\//.test(raw)) return 'Researcher brief';
  if (/meta-analysis|systematic review|randomi[sz]ed/i.test(raw) && /https?:\/\//.test(raw)) return 'study read';
  return 'note';
}

/**
 * His vault's research on the weekly dose, ranked: notes that make a
 * sets-per-week claim and talk about growth. Pure over the files; reads only.
 * Returns [{ path, title, kind, mtime, hits, excerpt }].
 */
export async function gatherVolumeResearch(vaultPath, { limit = MAX_SOURCES, dirs = RESEARCH_DIRS } = {}) {
  const files = [];
  for (const d of dirs) await walk(path.join(vaultPath, d), files);
  const scored = [];
  for (const full of files) {
    const rel = path.relative(vaultPath, full).split(path.sep).join('/');
    if (SKIP.test(rel)) continue;
    let raw;
    try { raw = await readFile(full, 'utf8'); } catch { continue; }
    const hits = (raw.match(DOSE) || []).length;
    if (!hits || !GROWTH.test(raw)) continue;
    const kind = kindOf(rel, raw);
    const st = await stat(full).catch(() => null);
    // a transcript speaks at length; its hits are diluted so a brief that
    // makes the same claim with sources ranks above it
    const weight = kind === 'transcript' ? 0.5 : kind === 'Researcher brief' || kind === 'study read' ? 1.5 : 1;
    scored.push({ path: rel, title: titleOf(raw, rel), kind, mtime: st ? st.mtime.toISOString() : null, hits, score: hits * weight, excerpt: doseExcerpt(raw) });
  }
  scored.sort((a, b) => b.score - a.score || String(b.mtime).localeCompare(String(a.mtime)));
  return scored.slice(0, limit).map(({ score: _score, ...s }) => s);
}

/* ------------------------------ when it runs ----------------------------- */

export async function readRangesState() {
  try { return JSON.parse(await readFile(STATE(), 'utf8')); } catch { return {}; }
}
export async function writeRangesState(patch) {
  const next = { ...(await readRangesState()), ...patch };
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(STATE() + '.tmp', JSON.stringify(next, null, 2));
  await rename(STATE() + '.tmp', STATE());
  return next;
}

export const RANGES_EVERY_DAYS = 30;

/**
 * Is a ranges run due? Pure. A note the last run never saw is the trigger
 * ("re-run when a new relevant brief lands"); an edit to one it saw is not,
 * because iCloud touches mtimes on sync. Otherwise once every 30 days.
 */
export function rangesDue({ state = {}, sources = [], pending = false, now = Date.now() } = {}) {
  if (pending) return { due: false, why: 'a ranges card is already waiting on him' };
  if (!state.lastRunAt) return { due: true, why: 'never run' };
  const seen = new Set(state.seen || []);
  const fresh = sources.filter((s) => !seen.has(s.path));
  if (fresh.length) return { due: true, why: `new research: ${fresh.map((s) => s.title).slice(0, 3).join('; ')}` };
  const age = now - new Date(state.lastRunAt).getTime();
  if (age >= RANGES_EVERY_DAYS * 86_400_000) return { due: true, why: `${RANGES_EVERY_DAYS} days since the last ranges run` };
  return { due: false, why: 'nothing new since the last run' };
}

/** The vault is thin when fewer than MIN_SOURCES notes make a dose claim. */
export const isThin = (sources) => (sources || []).length < MIN_SOURCES;

export const RESEARCH_QUESTION = 'Weekly hard-set ranges per muscle group for hypertrophy in a trained natural lifter: what does current evidence (meta-analyses on weekly volume dose-response, fractional set counting) support as a minimum effective and an upper productive weekly range, and does it differ for small muscles such as side and rear delts, biceps and triceps, and for a time-efficient program?';

/* -------------------------------- the ask -------------------------------- */

export function buildRangesPrompt({ goal, goalMuscles = [], sources = [], current = null, today, him = '' }) {
  const list = sources.map((s, i) => `[${i + 1}] ${s.path}\n    "${s.title}" (${s.kind}${s.mtime ? `, ${s.mtime.slice(0, 10)}` : ''})\n    ${String(s.excerpt || '').split('\n').join('\n    ')}`).join('\n');
  const own = current ? Object.entries(current).map(([m, [lo, hi]]) => `${m} ${lo}-${hi}`).join(', ') : null;
  return `${NOVA_LENS}

You are Nova's strength Coach. Today (${today}) you set Hayden's WEEKLY HARD-SET RANGES, one per muscle, from the research in his own vault. He asked for exactly this: the sets he should hit each week must come from your research, as the best personal trainer in the world would set them, for HIS goal, in the least time.

${him ? `${him}

` : ''}HIS GOAL: ${goal || '(no goal line written)'}
HIS GOAL MUSCLES (grow these; this is a hypertrophy goal, and time-efficient): ${goalMuscles.join(', ') || '(none set)'}
HOW SETS ARE COUNTED IN NOVA: a working set counts 1 to the lift's primary muscle and ½ to each audited secondary (fractional counting, Pelland et al. 2024). Your ranges are in THOSE units, so a range for side delts must allow for the ½ credit pressing gives them.
WHAT HE IS JUDGED AGAINST NOW: ${own ? `his ranges ${own}; every other muscle the house ${VOLUME_RANGE[0]}-${VOLUME_RANGE[1]}` : `the house default ${VOLUME_RANGE[0]}-${VOLUME_RANGE[1]} for every muscle, which no one has ever checked against his research`}

THE RESEARCH IN HIS VAULT ON WEEKLY VOLUME (path, title, kind, then the lines that make a dose claim). Read any of them in full with Read when the excerpt is not enough:
${list || '(none found)'}

Decide, muscle by muscle, for EVERY one of: ${VOLUME_GROUPS.join(', ')}.
- low = the weekly sets below which growth is meaningfully left on the table; high = the point past which more sets stop buying growth for a natural lifter and start costing recovery and time.
- Goal muscles: set for growth. Non-goal muscles: you may set a lower, maintenance-leaning range when the research supports it — that is where his time is saved. Say so in the reason.
- Ground every range in the notes above. Weigh the kind: a meta-analysis or a Researcher brief with sources outweighs a podcast opinion; say which you leaned on. Do not invent a study, a number or a path.
- Whole numbers, low under high.

Return ONLY a JSON object, no code fences:
{
  "summary": "<two sentences, to him (you/your): what the research says about weekly volume for his goal, and the one thing that changed from the 10-20 default>",
  "ranges": {
    "<Muscle exactly as listed>": { "low": <int>, "high": <int>, "why": "<one plain sentence to him>", "sources": ["<exact path from the list above>", "..."] }
  }
}`;
}

// Sane hypertrophy bands. Not opinions about the right number (that is the
// model's job, from the research); a fence against a typo or a misread table
// becoming his week: a goal muscle "grown" on 2 sets, or asked for 38.
export const GOAL_BAND = { low: [6, 20], high: [10, 30] };
export const OTHER_BAND = { low: [2, 20], high: [6, 30] };

/**
 * The model's answer, checked by code. Every row survives on its own merits
 * or is refused with the reason; a refused or missing GOAL muscle refuses the
 * whole proposal. Returns { ok, rows, refused, summary, error }.
 */
export function validateRanges(raw, { sources = [], goalMuscles = [] } = {}) {
  const m = firstBalancedObjectMatch(String(raw || ''));
  if (!m) return { ok: false, error: 'the answer held no JSON object', rows: [], refused: [] };
  let o;
  try { o = parseModelJson(m[0]); } catch { return { ok: false, error: 'the answer was not readable JSON', rows: [], refused: [] }; }
  const known = new Map(sources.map((s) => [s.path, s]));
  const goal = new Set(goalMuscles);
  const rows = [];
  const refused = [];
  const seen = new Set();
  for (const [name, v] of Object.entries(o?.ranges || {})) {
    const muscle = canonicalGroup(name);
    if (!muscle || NON_VOLUME.has(muscle)) { refused.push({ muscle: name, why: 'not a volume muscle' }); continue; }
    if (seen.has(muscle)) { refused.push({ muscle, why: 'named twice' }); continue; }
    seen.add(muscle);
    const pair = cleanVolumeRanges({ [muscle]: [v?.low, v?.high] })?.[muscle];
    if (!pair) { refused.push({ muscle, why: `[${v?.low}, ${v?.high}] is not whole numbers 1-40 with low under high` }); continue; }
    const band = goal.has(muscle) ? GOAL_BAND : OTHER_BAND;
    if (pair[0] < band.low[0] || pair[0] > band.low[1] || pair[1] < band.high[0] || pair[1] > band.high[1]) {
      refused.push({ muscle, why: `${pair[0]}-${pair[1]} is outside the sane band for ${goal.has(muscle) ? 'a goal' : 'a'} muscle (low ${band.low.join('-')}, high ${band.high.join('-')})` });
      continue;
    }
    const why = String(v?.why || '').replace(/\s+/g, ' ').trim().slice(0, 260);
    if (!why) { refused.push({ muscle, why: 'no reason given' }); continue; }
    const cited = [...new Set((Array.isArray(v?.sources) ? v.sources : []).map((p) => String(p).trim()))];
    const real = cited.filter((p) => known.has(p));
    if (!real.length) { refused.push({ muscle, why: cited.length ? `cited ${cited.length} path(s) it was never handed` : 'no source cited' }); continue; }
    rows.push({ muscle, low: pair[0], high: pair[1], goal: goal.has(muscle), why, sources: real });
  }
  const missingGoal = goalMuscles.filter((g) => !rows.some((r) => r.muscle === g));
  const summary = String(o?.summary || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (missingGoal.length) {
    return { ok: false, rows, refused, summary, error: `no valid range for goal muscle${missingGoal.length === 1 ? '' : 's'} ${missingGoal.join(', ')}${refused.length ? ` (${refused.filter((r) => missingGoal.includes(r.muscle)).map((r) => `${r.muscle}: ${r.why}`).join('; ')})` : ''}` };
  }
  if (!rows.length) return { ok: false, rows, refused, summary, error: 'no row survived' };
  // goal muscles first, in his order, then the rest in the taxonomy's order
  const order = (r) => (r.goal ? goalMuscles.indexOf(r.muscle) : 100 + VOLUME_GROUPS.indexOf(r.muscle));
  rows.sort((a, b) => order(a) - order(b));
  return { ok: true, rows, refused, summary };
}

/* -------------------------------- the card ------------------------------- */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (iso) => { const [, mo, d] = String(iso).slice(0, 10).split('-').map(Number); return mo && d ? `${d} ${MON[mo - 1]}` : String(iso); };

/**
 * The pending card, on the same rails as Coach's chat goal cards (no kind,
 * route 'goal-target', payload.settings). Pure.
 */
export function rangesCardRecord({ rows, summary, sources = [], date, id = randomUUID().slice(0, 8), now = new Date() }) {
  const volumeRanges = Object.fromEntries(rows.map((r) => [r.muscle, [r.low, r.high]]));
  const used = [...new Set(rows.flatMap((r) => r.sources))];
  const titled = used.map((p) => ({ path: p, title: sources.find((s) => s.path === p)?.title || path.basename(p, '.md'), kind: sources.find((s) => s.path === p)?.kind || 'note' }));
  const goalLine = rows.filter((r) => r.goal).map((r) => `${r.muscle} ${r.low}-${r.high}`).join(', ');
  const kept = VOLUME_GROUPS.filter((m) => !volumeRanges[m]);
  const title = `Coach: set your weekly set ranges from your research (${goalLine})`;
  return {
    id,
    key: `${RANGES_KEY_PREFIX}${date}`,
    text: `Coach proposed your weekly set ranges from your research: ${goalLine}.`,
    source: 'coach',
    mode: 'review-all',
    status: 'pending',
    createdAt: now.toISOString(),
    decision: {
      route: 'goal-target',
      confidence: 'high',
      title,
      reason: `${summary}${kept.length ? ` ${kept.join(', ')} keep the ${VOLUME_RANGE[0]}-${VOLUME_RANGE[1]} default.` : ''}`.trim(),
      payload: {
        action: 'goal',
        settings: {
          volumeRanges,
          volumeRangesSource: { by: 'coach-research', date, recordId: id, sources: used },
        },
        reason: summary,
      },
    },
    // what the card draws: every muscle's range, its sentence and its notes
    rangesProposal: { date, summary, rows, sources: titled, kept },
  };
}

/* -------------------------------- the run -------------------------------- */

function askVault(prompt, { lane, vaultPath }) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      ...boundaryArgs('Read Grep Glob'),
      '--output-format', 'json',
      '--model', modelFor(lane),
      ...effortArgs(lane),
      '--session-id', randomUUID(),
    ], { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      try {
        const outer = parseEnvelope(out, { lane, code, stderr: err });
        if (code !== 0) return reject(new Error(outer.result || err.trim().split('\n').pop() || `claude exited with code ${code}`));
        resolve({ text: String(outer.result || ''), costUsd: outer.total_cost_usd ?? null });
      } catch (e) {
        if (e.limited) return reject(e);
        reject(new Error(err.trim().split('\n').pop() || e.message));
      }
    });
  });
}
export { askVault };

const isRangesCard = (r) => typeof r?.key === 'string' && r.key.startsWith(RANGES_KEY_PREFIX);
export const pendingRangesCard = (records = []) => records.find((r) => isRangesCard(r) && r.status === 'pending') || null;

/**
 * One ranges run. Code decides whether it is due (unless `force`), gathers
 * the research, asks the Researcher when the vault is thin, asks the model,
 * validates, and files ONE pending card (or hands it to `file` — the
 * out-of-process path stages it for the server, lib/stagedCards.js).
 * Returns { status, why, record?, rows?, refused?, cost? }.
 */
export async function runRangesLane(vaultPath, deps = {}) {
  const now = deps.now || new Date();
  if (!(deps.laneEnabled || laneEnabled)(RANGES_LANE)) return { status: 'off', why: 'the coach-ranges lane is switched off' };
  const listRecords = deps.listRecords || (await import('./inboxStore.js')).listRecords;
  const records = await listRecords();
  const sources = await (deps.gather || gatherVolumeResearch)(vaultPath);
  const state = await (deps.readState || readRangesState)();
  const writeState = deps.writeState || writeRangesState;
  const due = rangesDue({ state, sources, pending: !!pendingRangesCard(records), now: now.getTime() });
  if (!due.due && !deps.force) return { status: 'skipped', why: due.why };
  if (deps.force && pendingRangesCard(records)) return { status: 'skipped', why: 'a ranges card is already waiting on him' };

  // THIN: the Researcher's own lane writes a cited brief; the ranges wait for
  // it to reach the vault (the new path is the trigger). Asked once a month.
  if (isThin(sources)) {
    const asked = state.researchAskedAt ? now.getTime() - new Date(state.researchAskedAt).getTime() < RANGES_EVERY_DAYS * 86_400_000 : false;
    if (!asked) {
      const startResearch = deps.startResearch || (await import('./researcher.js')).startResearch;
      const rec = await startResearch(vaultPath, RESEARCH_QUESTION, { context: `Asked by the Coach's ranges lane: his vault holds only ${sources.length} note(s) on weekly volume.` });
      await writeState({ researchAskedAt: now.toISOString(), researchRecordId: rec?.id || null });
      return { status: 'waiting-on-research', why: `only ${sources.length} note(s) on weekly volume in the vault; asked the Researcher for a brief`, recordId: rec?.id || null };
    }
    return { status: 'waiting-on-research', why: `only ${sources.length} note(s) on weekly volume; the Researcher was asked on ${String(state.researchAskedAt).slice(0, 10)}` };
  }

  const g = await (deps.goals || (async () => (await import('./fitnessGoals.js')).getFitnessGoals(vaultPath)))().catch(() => null);
  const goalMuscles = deps.goalMuscles || [...(await import('./trainOverview.js')).goalMuscles(g)];
  const today = now.toISOString().slice(0, 10);
  // who he is (training age, what he has told Nova), so a range is set for him
  const him = await (deps.profileContext || (async () => (await import('./profile.js')).profileContext(vaultPath)))().catch(() => '');
  const prompt = buildRangesPrompt({ goal: g?.goal, goalMuscles, sources, current: g?.volumeRanges || null, today, him });
  const ask = deps.ask || ((p) => askVault(p, { lane: RANGES_LANE, vaultPath }));
  let answer;
  try {
    answer = await ask(prompt);
  } catch (e) {
    await writeState({ lastError: e.message, lastErrorAt: now.toISOString() });
    return { status: 'error', why: e.message };
  }
  const text = typeof answer === 'string' ? answer : answer?.text;
  const v = validateRanges(text, { sources, goalMuscles });
  await writeState({ lastRunAt: now.toISOString(), seen: sources.map((s) => s.path), lastError: v.ok ? null : v.error, lastCostUsd: answer?.costUsd ?? null });
  if (!v.ok) return { status: 'refused', why: v.error, refused: v.refused, rows: v.rows };
  const record = rangesCardRecord({ rows: v.rows, summary: v.summary, sources, date: today, now });
  const file = deps.file || (async (r) => (await import('./inboxStore.js')).createRecord(r));
  await file(record);
  await writeState({ lastRecordId: record.id });
  return { status: 'filed', why: due.why, record, rows: v.rows, refused: v.refused, cost: answer?.costUsd ?? null };
}
