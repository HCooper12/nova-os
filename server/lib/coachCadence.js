// The Coach's cadence engine — the voice that speaks FIRST.
//
// The audit's core finding: the Coach had never initiated contact in its
// life. Zero Telegram messages ever (both channels defaulted to draft), the
// "missed-session rescue nudge" existed only as a comment, streaks were
// computed and ignored, and PRs were never detected at all. A coach who
// never speaks first isn't a coach; he's a search box with opinions.
//
// Everything here is DETERMINISTIC composition over real signals (deload,
// schedule, sessions, PRs from trainingAnalytics) — no model in the loop,
// so a nudge costs nothing and can never invent. Messages go out via
// Telegram; each kind fires at most once per day, state in
// server/data/coach-cadence.json. NOVA_COACH_CADENCE=off silences it all.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url'; // never URL.pathname — the repo path has a space
import path from 'node:path';
import { weeklyWindowOpen } from './cadence.js';

// honors NOVA_DATA_DIR like every sibling store (the healthInsight precedent)
// — this was one of three hard-coded paths, so tests with the env override
// still wrote the REAL data dir
const STATE_PATH = path.join(process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'coach-cadence.json');

const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

async function loadState() {
  try { return JSON.parse(await readFile(STATE_PATH, 'utf8')); } catch { return {}; }
}
async function markSent(kind) {
  const s = await loadState();
  s[kind] = today();
  await mkdir(path.dirname(STATE_PATH), { recursive: true }).catch(() => {});
  await writeFile(STATE_PATH, JSON.stringify(s, null, 2));
}
async function sentToday(kind) {
  return (await loadState())[kind] === today();
}

// Every proactive send leaves a receipt in the spoken log — the same rail
// the debrief and the greeting write (claudeCode.js logSpoken calls are the
// twins), so "did Coach actually say that this morning?" has an answer.
async function send(text, kind = 'coach-cadence') {
  const { telegramConfigured, sendTelegramText } = await import('./telegram.js');
  if (!telegramConfigured()) return false;
  await sendTelegramText(text);
  import('./spokenLog.js').then(({ logSpoken }) => logSpoken(kind, text)).catch(() => {});
  return true;
}

// The injury line for the morning card — moderate or worse, open, and only
// on a training day (the caller decides that). Niggles stay chat-only so
// the card stays lean. Pure, exported for the test.
export function injuryLine(injuries) {
  const active = (injuries || []).filter((i) => !i.resolvedAt && i.severity && i.severity !== 'niggle');
  if (!active.length) return null;
  return `Open injur${active.length === 1 ? 'y' : 'ies'} on file: ${active.map((i) => `${i.area} (${i.severity})`).join(', ')} — train around ${active.length === 1 ? 'it' : 'them'}.`;
}

const WEEKDAY = () => ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

async function todaysRoutine(vaultPath) {
  const { loadExerciseLibrary } = await import('./exercises.js');
  const { loadRoutines } = await import('./workouts.js');
  const { exercises } = await loadExerciseLibrary(vaultPath);
  const { routines, schedule } = await loadRoutines(vaultPath, exercises);
  const id = schedule?.[WEEKDAY()];
  if (!id || id === 'ACTIVE_REST') return null;
  return routines.find((r) => r.id === id) || null;
}

async function loggedToday(vaultPath) {
  const { loadSessions } = await import('./workoutSessions.js');
  const sessions = await loadSessions(vaultPath, { limit: 3 });
  return sessions.some((s) => s.date === today());
}

// ---- morning readiness: the day's card + the recovery verdict ------------
export async function morningReadiness(vaultPath) {
  if (await sentToday('morning')) return null;
  const routine = await todaysRoutine(vaultPath);
  if (!routine) return null; // rest days earn silence, not filler
  const { loadRecentDays } = await import('./healthData.js');
  const { computeDeloadSignal } = await import('./coach.js');
  const days = await loadRecentDays(7).catch(() => []);
  const signal = computeDeloadSignal(days);
  const lines = [`Coach — ${routine.name} is on today's card (${routine.exercises.length} exercises).`];
  try {
    const { getBlock } = await import('./trainingBlocks.js');
    const block = await getBlock(vaultPath);
    if (block?.isDeloadWeek) lines.push(`Deload week (${block.phase}, week ${block.week}/${block.lengthWeeks}): −10-20% loads, stop 3-4 short. The block only works if you actually back off.`);
    else if (block && !block.ended) lines.push(`${block.phase} week ${block.week}/${block.lengthWeeks}.`);
  } catch { /* no block, no line */ }
  if (signal.advise) lines.push(`Recovery says go LIGHTER: ${signal.reason}.`);
  else {
    const latest = [...days].reverse().find((d) => d.hrv != null);
    if (latest) lines.push(`Recovery looks ready (HRV ${Math.round(latest.hrv)}).`);
  }
  try {
    // an open injury meets him where he plans the session, not only in a chat he may not open
    const { listInjuries } = await import('./injuryLog.js');
    const inj = injuryLine(await listInjuries(vaultPath));
    if (inj) lines.push(inj);
  } catch { /* no read, no line */ }
  try {
    // the cross-reference agent's sharpest finding rides the morning card —
    // fuel advice lands best BEFORE the day's eating, not in a debrief
    const { crossCheck } = await import('./fuelCross.js');
    const result = await crossCheck(vaultPath);
    const top = result.findings.find((f) => f.severity === 'high') || result.findings[0];
    // a source that could not be read is the morning's fuel news, not a
    // reason to go quiet — silence here used to read as "all clear"
    if (result.couldntLook) lines.push(`Fuel: ${result.couldntLook}.`);
    else if (top) lines.push(`Fuel: ${top.line}`);
  } catch { /* no findings, no line */ }
  const sent = await send(lines.join(' '), 'coach-morning');
  if (sent) await markSent('morning');
  return sent ? lines.join(' ') : null;
}

// ---- structural fuel findings land in the Inbox, once a week per key -----
// Informational records on the rails: approving files them, nothing writes.
// A finding that persists is a pattern; a pattern deserves a receipt he can
// act on, not just a line that scrolls past in a chat.
export async function raiseFuelFindings(vaultPath) {
  const { crossCheck } = await import('./fuelCross.js');
  const { createRecord, listRecords } = await import('./inboxStore.js');
  const result = await crossCheck(vaultPath);
  // never conclude cleanliness — or raise a finding computed beside a hole —
  // from a source that could not be read; the morning line already says so
  if (!result.sources.ok) {
    console.log(`fuel cross-check: not raising — ${result.couldntLook}`);
    return [];
  }
  const { findings } = result;
  const s = await loadState();
  const raised = s.fuelRaised || {};
  const history = s.fuelRaisedHistory || {}; // key → every raise, newest last (the persistence memory)
  const closed = s.fuelClosed || {};          // key → when its win receipt was written
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cutoff = now - 7 * 86_400_000;
  const records = await listRecords();
  const existing = records.filter((r) => r.kind === 'fuel-cross' && r.status === 'pending');
  // HIS NO IS ON RECORD. A finding he declined with a reason waits 28 days
  // unless its own number has moved ≥15% — the same helper every lane uses
  // (lib/respectTheNo.js); without a reason the 7-day rhythm stands.
  const { latestDeclines, respectNo } = await import('./respectTheNo.js');
  const declines = latestDeclines(records, { kind: 'fuel-cross', subjectOf: (r) => r.findingKey, metricOf: (r) => r.finding?.metric ?? null });
  const { randomUUID } = await import('node:crypto');
  const out = [];
  let dirty = false;
  for (const f of findings) {
    if (raised[f.key] && new Date(raised[f.key]).getTime() > cutoff) continue;
    if (existing.some((r) => r.findingKey === f.key)) continue; // still unread — don't stack duplicates
    const declined = declines.get(f.key);
    if (declined?.reason) {
      const verdict = respectNo({ declined, now, cooldownDays: 28, metric: f.metric ?? null, materialChange: 0.15 });
      if (!verdict.raise) { console.log(`fuel cross-check: ${f.key} not raised — ${verdict.why}`); continue; }
    }
    // HOW LONG HAS THIS BEEN TRUE — the monthly signal. Three consecutive
    // weekly raises and the line says so and the severity lifts one step.
    const weeks = consecutiveWeeklyRaises(history[f.key] || [], now) + 1; // this raise included
    const severity = weeks >= 3 ? liftSeverity(f.severity) : f.severity;
    const line = weeks >= 3 ? `${f.line} — ${ordinal(weeks)} week running.` : f.line;
    out.push(await createRecord({
      id: randomUUID().slice(0, 8),
      kind: 'fuel-cross',
      findingKey: f.key,
      severity,
      weeksRunning: weeks,
      // the numbers the line quotes, kept so the brief can DRAW the finding —
      // and the metric respect-the-no compares against his last no
      finding: f.data ? { kind: `fuel:${f.data.kind}`, ...f.data, metric: f.metric ?? null } : { metric: f.metric ?? null },
      text: `Fuel × training: ${line}`,
      source: 'coach',
      mode: 'draft',
      status: 'pending',
      createdAt: nowIso,
    }));
    raised[f.key] = nowIso;
    history[f.key] = [...(history[f.key] || []).slice(-11), nowIso];
    dirty = true;
  }
  // THE WIN RECEIPT. A finding that was red for two or more weeks running
  // and has now stopped firing earns one filed line — the closing of the
  // loop is a fact worth a receipt, not silence. Once per closing.
  const firing = new Set(findings.map((f) => f.key));
  for (const [key, dates] of Object.entries(history)) {
    if (firing.has(key) || !dates.length) continue;
    const lastRaise = new Date(dates[dates.length - 1]).getTime();
    if (closed[key] && new Date(closed[key]).getTime() >= lastRaise) continue; // already closed since it last fired
    if (now - lastRaise < 7 * 86_400_000) continue; // give the weekly rhythm one beat before calling it closed
    if (consecutiveWeeklyRaises(dates, lastRaise + 1) < 2) continue; // a one-week blip closes quietly
    out.push(await createRecord({
      id: randomUUID().slice(0, 8),
      kind: 'fuel-cross',
      findingKey: key,
      closedFinding: true,
      text: `Fuel × training — closed: "${FINDING_LABEL[key] || key}" is no longer true this week, after ${consecutiveWeeklyRaises(dates, lastRaise + 1)} weeks red.`,
      source: 'coach',
      mode: 'auto',
      status: 'filed',
      auto: true,
      destination: 'noted — nothing to file',
      createdAt: nowIso,
      filedAt: nowIso,
    }));
    closed[key] = nowIso;
    dirty = true;
  }
  if (dirty) {
    s.fuelRaised = raised;
    s.fuelRaisedHistory = history;
    s.fuelClosed = closed;
    await mkdir(path.dirname(STATE_PATH), { recursive: true }).catch(() => {});
    await writeFile(STATE_PATH, JSON.stringify(s, null, 2));
  }
  return out;
}

// Plain-English names for the closing receipt — twins of the keys in
// lib/fuelCross.js analyze().
const FINDING_LABEL = {
  'rotation-protein-floor': 'the rotation undershoots the protein floor',
  'training-day-protein': 'training days under-eat protein',
  'training-day-kcal': 'training days short of the kcal target',
  'cut-training-kcal-over': 'training days over the kcal target on a cut',
  'rest-outeats-training': 'rest days out-eat training days',
  'floor-most-days': 'the protein floor missed most days',
  'post-training-protein': 'protein missing after training',
};
const SEVERITY_ORDER = ['low', 'medium', 'high'];
export function liftSeverity(sev) {
  const i = SEVERITY_ORDER.indexOf(sev);
  return i < 0 ? sev : SEVERITY_ORDER[Math.min(SEVERITY_ORDER.length - 1, i + 1)];
}
const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
// How many consecutive weekly windows back from `now` hold a raise — the
// weekly rhythm is the unit, so a raise every 7–9 days still counts as a
// streak and a fortnight's silence breaks it. Pure, exported for the test.
export function consecutiveWeeklyRaises(dates, now = Date.now()) {
  const ts = (dates || []).map((d) => new Date(d).getTime()).filter(Number.isFinite);
  let weeks = 0;
  for (let k = 0; k < 52; k++) {
    const hi = now - k * 7 * 86_400_000;
    const lo = hi - 7 * 86_400_000;
    if (ts.some((t) => t > lo && t <= hi)) weeks++;
    else break;
  }
  return weeks;
}

// ---- the missed-session rescue (the audit's ghost comment, made real) ----
export async function missedSessionNudge(vaultPath) {
  if (await sentToday('missed')) return null;
  const routine = await todaysRoutine(vaultPath);
  if (!routine) return null;
  if (await loggedToday(vaultPath)) return null;
  const { computeStreaks } = await import('./streaks.js');
  const streaks = await computeStreaks(vaultPath).catch(() => null);
  const streakLine = streaks?.workoutStreak >= 3 ? ` Your ${streaks.workoutStreak}-session streak is on the line.` : '';
  const msg = `Coach — ${routine.name} hasn't been logged yet today.${streakLine} An evening slot still works; even a trimmed session beats a zero. Want me to hold you to it?`;
  const sent = await send(msg, 'coach-missed');
  if (sent) await markSent('missed');
  return sent ? msg : null;
}

// ---- post-session debrief: the coach at the rack, unprompted -------------
// Event-driven on save (like PR pings). Deterministic code computes every
// fact; the model only reacts to them; Telegram delivers. Silent on any
// failure — a missing debrief is a non-event, never an error he sees.
export async function sessionDebrief(vaultPath, session) {
  if (process.env.NOVA_COACH_CADENCE === 'off') return null;
  const { telegramConfigured } = await import('./telegram.js');
  if (!telegramConfigured()) return null;
  const { loadSessions } = await import('./workoutSessions.js');
  const sessions = await loadSessions(vaultPath, { limit: 10 });
  const full = sessions.find((s) => s.date === session.date && s.routineId === session.routineId) || session;
  const prev = sessions.filter((s) => s.routineId === session.routineId && s.id !== full.id)[0] || null;
  const volumeOf = (s) => Math.round((s.exercises || []).reduce((v, e) => v + (e.sets || []).reduce((x, st2) => x + (st2.weight || 0) * (st2.reps || 0), 0), 0));
  const facts = [];
  facts.push(`Session just logged: ${full.routineName}, ${full.date} — ${(full.exercises || []).length} exercises, ${(full.exercises || []).reduce((n, e) => n + (e.sets || []).length, 0)} sets, ${volumeOf(full).toLocaleString()}kg total volume.`);
  for (const ex of full.exercises || []) {
    const line = (ex.sets || []).map((s2) => `${s2.weight || 0}×${s2.reps || 0}${s2.rpe ? `@${s2.rpe}` : ''}`).join(', ');
    const flags = [ex.anomaly ? 'ANOMALY (off day — not evidence)' : null, ex.pain ? `PAIN: ${ex.pain}` : null, ex.note ? `his note: "${ex.note}"` : null, ex.skipped ? 'skipped today' : null].filter(Boolean);
    facts.push(`- ${ex.name}: ${line || 'no sets'}${flags.length ? ` [${flags.join('; ')}]` : ''}`);
  }
  if (full.cutShort) facts.push(`Session CUT SHORT — his reason: ${full.cutShort}.`);
  if (prev) facts.push(`Previous ${full.routineName} (${prev.date}): ${volumeOf(prev).toLocaleString()}kg volume.`);
  try {
    const { prsInSession } = await import('./trainingAnalytics.js');
    const prs = prsInSession(sessions, full);
    if (prs.length) facts.push(`PRs this session (already celebrated separately — acknowledge, don't re-announce): ${prs.map((p) => p.name).join(', ')}.`);
  } catch { /* no PR facts, no line */ }
  const { startSessionDebrief } = await import('./claudeCode.js');
  startSessionDebrief(vaultPath, { facts: facts.join('\n') }, (text) => {
    if (text) send(`Coach — ${text}`).catch(() => {});
  });
  return true;
}

// ---- PR celebration: fired from session completion, not the clock --------
export async function celebratePRs(vaultPath, session) {
  const { loadSessions } = await import('./workoutSessions.js');
  const { prsInSession } = await import('./trainingAnalytics.js');
  const sessions = await loadSessions(vaultPath, { limit: 60 });
  const full = sessions.find((s) => s.date === session.date && s.routineId === session.routineId) || session;
  const prs = prsInSession(sessions, full);
  if (!prs.length) return null;
  const lines = prs.slice(0, 3).map((p) => p.kind === 'weight'
    ? `${p.name}: ${p.value}kg × ${p.reps} — heaviest ever${p.previous ? ` (was ${p.previous}kg)` : ''}`
    : `${p.name}: e1RM ${p.value}kg${p.previous ? ` (was ${p.previous})` : ''}`);
  const msg = `Coach — PR${prs.length > 1 ? 's' : ''} today. ${lines.join(' · ')}. Earned, sir.`;
  await send(msg, 'coach-pr');
  return { prs, message: msg };
}

// ---- the scheduler -------------------------------------------------------
export function startCoachCadenceScheduler(vaultPath) {
  if (process.env.NOVA_COACH_CADENCE === 'off') return;
  const tick = async () => {
    const { beat, note } = await import('./heartbeat.js');
    beat('coach-cadence');
    // ARMED BUT MUTE is a state, not silence: without Telegram every window
    // below ticks and sends nothing, and Ops used to show a healthy beat.
    try {
      const { telegramConfigured } = await import('./telegram.js');
      await note('coach-cadence', telegramConfigured() ? null : 'armed, no channel — Telegram is not configured, so the morning card, PR pings and debriefs go nowhere');
    } catch { /* the note is optional */ }
    try {
      const h = new Date().getHours();
      if (h >= 7 && h < 12) await morningReadiness(vaultPath);
      if (h >= 7 && h < 12) await raiseFuelFindings(vaultPath); // weekly-cooldown inside
      // the program review: catch a mis-filed lift, a muscle short for weeks,
      // a lift that has stopped paying — and nudge whatever he left unanswered
      if (h >= 7 && h < 12) {
        try {
          const { raiseProgramFindings } = await import('./coachProgramReview.js');
          const { raised, nudged } = await raiseProgramFindings(vaultPath);
          // A FINAL nudge earns a Telegram — by then it has sat unanswered
          // for over a week and the Inbox clearly is not reaching him.
          const finals = nudged.filter((n) => n.final);
          if (finals.length) {
            const { sendTelegramText, telegramConfigured } = await import('./telegram.js');
            if (telegramConfigured()) {
              await sendTelegramText('Coach: a program change has been waiting on you for a week. It\'s in your Inbox — yes or no is fine.').catch(() => {});
            }
          }
          if (raised.length || nudged.length) console.log(`coach program review: ${raised.length} raised, ${nudged.length} nudged`);
        } catch (e) { console.log('coach program review failed:', e.message); }

        // THE WEEKLY AUDIT — once a week, the sweep itself gets a receipt.
        // Three detectors had never fired on his data and there was no way
        // to tell "checked and clean" from "quietly broken". Monday so the
        // week's decisions land before he trains it.
        try {
          const { auditedThisWeek, runWeeklyAudit } = await import('./coachProgramAudit.js');
          // Monday onward — auditedThisWeek keeps the cadence weekly.
          if (weeklyWindowOpen(new Date(), { day: 1 }) && !(await auditedThisWeek())) {
            const { audit } = await runWeeklyAudit(vaultPath);
            console.log(`coach weekly audit: ${audit.summary}`);
          }
        } catch (e) { console.log('coach weekly audit failed:', e.message); }

        // READ NEXT — the graph proposing what to read, weekly, one at a
        // time. Rides the same Monday window; raiseReadNext keeps itself to
        // a single open proposal so it can never become a reading list.
        try {
          // Monday onward; raiseReadNext keeps itself to one open proposal.
          if (weeklyWindowOpen(new Date(), { day: 1 })) {
            const { raiseReadNext } = await import('./readNext.js');
            const { raised, gaps } = await raiseReadNext(vaultPath);
            if (raised) console.log(`read-next: raised "${raised.meta?.concept}" (${gaps} gap(s) in the graph)`);
          }
        } catch (e) { console.log('read-next failed:', e.message); }
      }
      if (h >= 16 && h < 19) await missedSessionNudge(vaultPath); // early enough to still train
    } catch (err) {
      console.error('coach cadence failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 1800_000); // half-hourly: the windows above are short
}
