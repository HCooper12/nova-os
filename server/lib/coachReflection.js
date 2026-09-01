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
const STATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'coach-reflection.json');
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
  await add('last-reflection', async () => {
    // shape read from the real writer below: {learnings: <count>, outreach:
    // <string|null>, quietReason: <string|null>, at} — learnings is a NUMBER,
    // not a list, so it is reported as one.
    const prev = await loadState();
    const r = prev?.lastResult;
    if (!r) return null;
    const bits = [];
    if (r.learnings) bits.push(`you raised ${r.learnings} learning${r.learnings === 1 ? '' : 's'} for his approval`);
    if (r.outreach) bits.push(`you reached out to him about: "${String(r.outreach).slice(0, 160)}"`);
    if (r.quietReason) bits.push(`you deliberately stayed quiet because: ${String(r.quietReason).slice(0, 160)}`);
    if (!bits.length) return null;
    return `YOUR LAST REFLECTION (${prev.lastRun || 'recent'}) — do not repeat it; build on it or find something genuinely new:\n- ${bits.join('\n- ')}`;
  });
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

  // learnings → normal approval-gated proposals on the rails
  const raised = [];
  for (const l of reflection.learnings) {
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
    } catch { /* an invalid learning is dropped, never guessed at */ }
  }

  // outreach → ONE Telegram message, coach's voice
  let sent = false;
  if (reflection.outreach) {
    try {
      const { telegramConfigured, sendTelegramText } = await import('./telegram.js');
      if (telegramConfigured()) { await sendTelegramText(`Coach — ${reflection.outreach}`); sent = true; }
    } catch { /* silence over a crash */ }
  }

  await saveState({ ...state, lastRun: today(), lastResult: { learnings: raised.length, outreach: sent, quietReason: reflection.quietReason || null, at: new Date().toISOString() } });
  return { skipped: false, learningsRaised: raised.length, outreachSent: sent, quietReason: reflection.quietReason || null };
}

// Nightly window: 03:00-05:00, once per day, alongside the other overnight
// agents (the vault is quiet, the day's data complete).
export function startCoachReflectionScheduler(vaultPath) {
  if (process.env.NOVA_COACH_CADENCE === 'off') return;
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('coach-reflection');
    try {
      const h = new Date().getHours();
      if (h >= 3 && h < 5) await runReflection(vaultPath);
    } catch (err) {
      console.error('coach reflection failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 1800_000).unref?.();
}
