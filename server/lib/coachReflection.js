// The nightly reflection — item 2 of the expertise plan, the piece that
// makes the Coach "perform intelligently on its own": once a night it
// reviews the week's whole picture with no question asked, and its ONLY
// possible outputs are (a) up to three proposed learnings for the client
// file — each landing as a normal approval-gated Inbox proposal, (b) at
// most ONE opened conversation, delivered via Telegram, and (c) silence.
// Silence is a first-class result: a coach who must always say something
// becomes noise, and noise gets muted.
//
// Architecture is the inbox classifier's, not the chat lane's: read-only
// one-shot, STRICT JSON out, deterministic code does every write. The
// model reflects; the rails act.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url'; // never URL.pathname — the repo path has a space
import path from 'node:path';
import os from 'node:os';
import { modelFor, laneSkipped } from './modelPrefs.js';
import { boundaryArgs } from './spawnBoundary.js';
import { settleWatchdog } from './settle.js';

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.0';
// honors NOVA_DATA_DIR like every sibling store (the healthInsight precedent)
const STATE_PATH = path.join(process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'coach-reflection.json');
const MAX_LEARNINGS = 3;

const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

async function loadState() {
  try { return JSON.parse(await readFile(STATE_PATH, 'utf8')); } catch { return {}; }
}
async function saveState(s) {
  await mkdir(path.dirname(STATE_PATH), { recursive: true }).catch(() => {});
  await writeFile(STATE_PATH, JSON.stringify(s, null, 2));
}

// The week's picture, assembled from the same deterministic sources the
// live Coach reads — a section that fails simply goes missing, named.
async function buildReflectionContext(vaultPath) {
  const parts = [];
  const failures = [];
  const add = async (label, fn) => {
    try { const v = await fn(); if (v) parts.push(v); } catch { failures.push(label); }
  };
  await add('org', async () => (await import('./orgContext.js')).orgContext(vaultPath, 'coach-reflection'));
  // Coach's own nightly outcome, read back. Written every night and read by
  // nothing but itself — so the self-improvement loop never closed and the
  // same lesson was re-learned daily instead of carried forward.
  await add('last-reflection', async () => lastReflectionLine(await loadState()));
  await add('knowledge', async () => (await import('./coachKnowledge.js')).knowledgeContext(vaultPath));
  await add('goals', async () => (await import('./fitnessGoals.js')).goalsContext(vaultPath));
  await add('analytics', async () => (await import('./trainingAnalytics.js')).analyticsContext(vaultPath));
  await add('advice outcomes', async () => (await import('./coach.js')).adviceContext());
  await add('fuel cross-check', async () => {
    const { crossCheck, crossContext } = await import('./fuelCross.js');
    return crossContext(await crossCheck(vaultPath));
  });
  await add('watch workouts', async () => (await import('./healthWorkouts.js')).watchContext(vaultPath));
  await add('recovery', async () => {
    const { loadRecentDays } = await import('./healthData.js');
    const days = await loadRecentDays(7);
    const series = days.filter((d) => d.hrv != null || d.sleepAsleepMinutes != null)
      .map((d) => `${d.date.slice(5)}: ${[d.hrv != null ? `HRV ${Math.round(d.hrv)}` : null, d.sleepAsleepMinutes != null ? `sleep ${(d.sleepAsleepMinutes / 60).toFixed(1)}h` : null].filter(Boolean).join(', ')}`);
    return series.length ? `Recovery, last 7 days:\n${series.join('\n')}` : null;
  });
  await add('recent sessions', async () => {
    const { loadSessions } = await import('./workoutSessions.js');
    const sessions = await loadSessions(vaultPath, { limit: 6 });
    return sessions.length
      ? 'Recent sessions:\n' + sessions.map((s) => `- ${s.date} ${s.routineName}: ${s.exercises.map((e) => `${e.name} ${e.sets.map((x) => `${x.weight}x${x.reps}${x.rpe ? '@' + x.rpe : ''}`).join(',')}${e.note ? ` (note: "${e.note}")` : ''}${e.pain ? ` (PAIN: ${e.pain})` : ''}`).join(' | ')}${s.cutShort ? ` [CUT SHORT: ${s.cutShort}]` : ''}`).join('\n')
      : null;
  });
  if (failures.length) parts.push(`(Sections unavailable tonight: ${failures.join(', ')} — do not guess at what they would have said.)`);
  return parts.join('\n\n');
}

function buildReflectionPrompt(context) {
  return `You are Hayden's strength & nutrition coach doing your nightly private reflection — nobody asked you anything. Review his week below the way a great coach reviews a client file after hours: what is actually changing, what he said in his notes, what the data contradicts, what deserves a conversation.

Output ONLY a JSON object, no markdown, with exactly these keys:
- "learnings": array (0-${MAX_LEARNINGS} items) of {"insight": "one durable observation about HIM, grounded in the data below", "kind": "works"|"avoid"|"nutrition"|"decision", "reason": "the evidence, one line"}. Only include an insight if it is NEW (not already on his What Works page) and durable — a pattern, not a day. Empty array is a fine answer.
- "outreach": null, OR one string (2-4 sentences, plain text) opening a conversation he would genuinely value tonight or tomorrow — the single most important thing you noticed that the morning brief won't already cover. Never filler, never a recap, never praise for its own sake. If nothing clears that bar, null.
- "quiet_reason": one short sentence — if learnings is empty AND outreach is null, say why silence was right; otherwise "".

Ground everything ONLY in the context below. Never invent numbers or events.

HIS WEEK (deterministic, computed just now):
${context}`;
}

// THE STATE ROUND-TRIP, in one place. The writer used to store
// `outreach: <boolean sent>` while this reader printed it as the outreach
// TEXT — so the Coach was told it "reached out to him about: true". The
// writer now stores the text and a separate `delivered`; this reads exactly
// that shape and nothing else. Pure, exported for the test.
export function lastReflectionLine(state) {
  const r = state?.lastResult;
  if (!r) return null;
  const bits = [];
  if (r.learnings) bits.push(`you raised ${r.learnings} learning${r.learnings === 1 ? '' : 's'} for his approval${r.learningsKnown ? ` (${r.learningsKnown} more were already on his What Works page and were not re-raised)` : ''}`);
  if (typeof r.outreach === 'string' && r.outreach) bits.push(`you reached out to him about: "${r.outreach.slice(0, 160)}"${r.delivered === 'inbox' ? ' (it waits in his Inbox — Telegram was not configured)' : ''}`);
  if (r.quietReason) bits.push(`you deliberately stayed quiet because: ${String(r.quietReason).slice(0, 160)}`);
  if (!bits.length) return null;
  return `YOUR LAST REFLECTION (${state.lastRun || 'recent'}) — do not repeat it; build on it or find something genuinely new:\n- ${bits.join('\n- ')}`;
}

// A learning already on his What Works page is not new. Normalised
// containment either way (the page line inside the insight, or the insight
// inside the page) — exact-ish on purpose; fuzzy matching waits for a real
// replay showing near-duplicates slipping through. Pure, exported.
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function isKnownLearning(insight, pageText) {
  const a = norm(insight);
  if (a.length < 12) return false;
  const page = norm(pageText);
  if (!page) return false;
  if (page.includes(a)) return true;
  return String(pageText || '').split('\n').some((line) => { const l = norm(line.replace(/^\s*-\s*(\d{4}-\d{2}-\d{2}\s*—\s*)?/, '')); return l.length >= 24 && a.includes(l); });
}

// 03:00–09:00, once a day (lastRun guards it): the day's data is complete
// either way, and the prompt's do-not-cover-the-brief rule handles the
// later-morning overlap. The old 03:00–05:00 window missed a Mac asleep
// until six.
export function reflectionWindowOpen(now = new Date()) {
  const h = now.getHours();
  return h >= 3 && h < 9;
}

// Pure + exported for tests: clamp whatever the model produced into a safe
// reflection (or a silent one if unusable).
export function normalizeReflection(parsed) {
  const KINDS = ['works', 'avoid', 'nutrition', 'decision'];
  const learnings = (Array.isArray(parsed?.learnings) ? parsed.learnings : [])
    .map((l) => ({
      insight: String(l?.insight || '').trim().slice(0, 300),
      kind: KINDS.includes(l?.kind) ? l.kind : 'works',
      reason: String(l?.reason || '').trim().slice(0, 200),
    }))
    .filter((l) => l.insight.length >= 10)
    .slice(0, MAX_LEARNINGS);
  const rawOutreach = typeof parsed?.outreach === 'string' ? parsed.outreach.trim() : '';
  const outreach = rawOutreach.length >= 20 ? rawOutreach.slice(0, 800) : null;
  return { learnings, outreach, quietReason: String(parsed?.quiet_reason || '').trim().slice(0, 200) };
}

function runModel(prompt) {
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
      '--model', modelFor('coach-reflection'),
    '--max-budget-usd', MAX_BUDGET_USD,
      '--no-session-persistence',
    ]);
    let stdout = '';
    let stderr = '';
    settleWatchdog(child, { label: "the nightly reflection", minutes: 15 });
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `claude exited ${code}`));
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) throw new Error(outer.result || 'reflection failed');
        const m = (outer.result || '').match(/\{[\s\S]*\}/);
        if (!m) throw new Error('no JSON in reflection output');
        resolve(JSON.parse(m[0]));
      } catch (e) { reject(e); }
    });
    child.on('error', reject);
  });
}

export async function runReflection(vaultPath, { force = false } = {}) {
  const state = await loadState();
  if (!force && state.lastRun === today()) return { skipped: true, reason: 'already ran today' };
  if (laneSkipped('coach-reflection', 'the coach reflection')) return { skipped: true, reason: 'lane switched off in Settings' };

  const context = await buildReflectionContext(vaultPath);
  const reflection = normalizeReflection(await runModel(buildReflectionPrompt(context)));

  // learnings → normal approval-gated proposals on the rails — minus what
  // his What Works page already says (read unclipped: it is one file)
  const raised = [];
  let learningsKnown = 0;
  let learningsDropped = 0;
  let playbook = '';
  try {
    const { PLAYBOOK_REL } = await import('./coachKnowledge.js');
    playbook = await readFile(path.join(vaultPath, PLAYBOOK_REL), 'utf8');
  } catch { playbook = ''; }
  for (const l of reflection.learnings) {
    if (isKnownLearning(l.insight, playbook)) { learningsKnown++; continue; }
    try {
      const { validateCoachEdit } = await import('./coach.js');
      const { payload, title } = await validateCoachEdit(vaultPath, { action: 'learn', ...l });
      const { createRecord } = await import('./inboxStore.js');
      const { randomUUID } = await import('node:crypto');
      raised.push(await createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'coach',
        text: title,
        source: 'nova',
        mode: 'draft',
        status: 'pending',
        createdAt: new Date().toISOString(),
        decision: { route: 'coach-learning', confidence: 'high', title, reason: l.reason || 'nightly reflection', payload },
      }));
    } catch { learningsDropped++; /* an invalid learning is dropped, never guessed at — but counted */ }
  }
  // a validator-rejection streak is visible in Ops, not swallowed
  try {
    const { note } = await import('./heartbeat.js');
    await note('coach-reflection', learningsDropped ? `${learningsDropped} of ${reflection.learnings.length} learnings failed validation last night` : null);
  } catch { /* the note is optional */ }

  // outreach → COMPOSED REGARDLESS, then delivered: Telegram when it is
  // configured (with a spokenLog receipt), else a pending Inbox record so the
  // conversation exists where he will see it instead of not at all
  let delivered = null;
  if (reflection.outreach) {
    try {
      const { telegramConfigured, sendTelegramText } = await import('./telegram.js');
      if (telegramConfigured()) {
        await sendTelegramText(`Coach — ${reflection.outreach}`);
        delivered = 'telegram';
        import('./spokenLog.js').then(({ logSpoken }) => logSpoken('coach-outreach', reflection.outreach)).catch(() => {});
      } else {
        const { createRecord } = await import('./inboxStore.js');
        const { randomUUID } = await import('node:crypto');
        await createRecord({
          id: randomUUID().slice(0, 8), kind: 'coach', text: 'Coach — a word for tonight', source: 'nova', mode: 'draft', status: 'pending', createdAt: new Date().toISOString(),
          decision: { route: 'journal', confidence: 'high', title: 'Coach — a word for tonight', reason: reflection.outreach,
            payload: { text: `Coach reached out: ${reflection.outreach}`, category: 'training', label: 'Coach outreach' } },
        });
        delivered = 'inbox';
      }
    } catch { /* silence over a crash — the state below still records the text */ }
  }

  await saveState({ ...state, lastRun: today(), lastResult: {
    learnings: raised.length, learningsKnown, learningsDropped,
    outreach: reflection.outreach ? reflection.outreach.slice(0, 300) : null, // the TEXT — what the reader prints
    delivered, quietReason: reflection.quietReason || null, at: new Date().toISOString(),
  } });
  return { skipped: false, learningsRaised: raised.length, learningsKnown, learningsDropped, outreachDelivered: delivered, quietReason: reflection.quietReason || null };
}

// Nightly window: 03:00-09:00 (reflectionWindowOpen), once per day.
export function startCoachReflectionScheduler(vaultPath) {
  if (process.env.NOVA_COACH_CADENCE === 'off') return;
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('coach-reflection');
    try {
      if (reflectionWindowOpen(new Date())) await runReflection(vaultPath);
    } catch (err) {
      console.error('coach reflection failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 1800_000).unref?.();
}
