// A PAUSED DEFICIT (Athlete AI round two, item 11, 7 Nov 2026).
//
// When his recovery signal fires (computeDeloadSignal: HRV down, resting heart
// rate up, or three short nights), Nova proposes ONE inbox card: eat at
// maintenance until the signal clears, at most 7 days. His yes writes a small
// state file; his Undo puts it back. Nothing here pushes or nudges.
//
// The amount is his own deficit, from his Intake's pace (the plan's delta),
// never a guess and never taken from the card's payload: the yes recomputes it.
// It rides the same path earned calories use (earnedCalories.earnedToday), as a
// separate field, so every reader of today's target (widget, running total,
// Coach, the Fuel screen) moves together and the label can say which it is.
//
// Earned and paused never stack past maintenance: the total extra is capped at
// the deficit, paused first, so the goal keeps its place.
//
// Sleep: the signal is read through the sleep gate (healthData.applySleepGate),
// so a night he has not confirmed is held back. The 68-minute night of 3 Nov
// was a watch left off his wrist, not a short night, and it must never start
// a pause.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACE } from './intake.js';
import { FUEL_CHECK_DEFAULTS } from './fuelChecks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'fuel-paused.json');

const NO_AGAIN_DAYS = 3; // after a pause ends, no new card for this long (a signal flickering at its edge)
const DECLINED_QUIET_DAYS = 7; // a card he turned down is not raised again for a week

const dayNum = (iso) => Math.floor(new Date(`${iso}T12:00:00Z`).getTime() / 86400000);
const addDays = (iso, n) => new Date((dayNum(iso) + n) * 86400000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ state --

export async function readPausedState() {
  try {
    const s = JSON.parse(await readFile(STATE(), 'utf8'));
    return {
      active: s.active === true,
      since: s.since || null,
      until: s.until || null,
      deficitKcal: Number(s.deficitKcal) > 0 ? Math.round(Number(s.deficitKcal)) : 0,
      endedOn: s.endedOn || null,
      endedReason: s.endedReason || null,
    };
  } catch { return { active: false, since: null, until: null, deficitKcal: 0, endedOn: null, endedReason: null }; }
}

export async function writePausedState(next) {
  await mkdir(path.dirname(STATE()), { recursive: true });
  const tmp = `${STATE()}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, STATE());
  return next;
}

// ----------------------------------------------------------------- pieces --

/**
 * Pure. His daily deficit from the Intake: the plan's own delta when it is a
 * cut, else the pace figure for his goal. Null when he is not cutting, so
 * there is nothing to pause.
 */
export function deficitFromIntake(intake) {
  const facts = intake?.facts;
  if (!facts || facts.goal !== 'lose') return null;
  const delta = Number(intake?.plan?.deltaKcal);
  if (Number.isFinite(delta) && delta < 0) return Math.round(-delta);
  const pace = PACE[facts.pace || 'steady'];
  return pace ? pace.kcal : null;
}

/**
 * Pure. Does the recovery signal fire, reading sleep only from nights he has
 * not disputed? `days` are health days oldest first; `checks` his answers
 * (sleep-checks.json). `clear` is true only when the signal affirmatively reads
 * steady: thin data is neither firing nor clear, so it never ends a pause.
 */
export function recoveryFires(days, checks, { now = new Date(), gate, computeDeloadSignal, gated: alreadyGated = false } = {}) {
  // days that came through healthData.loadRecentDays are already gated; gating
  // them again with no answers would re-suspect a night he has confirmed
  const gated = alreadyGated ? (days || []) : gate(days || [], checks || {});
  const signal = computeDeloadSignal(gated, { now });
  return { fires: !!signal.advise, clear: !signal.advise && !/^not enough/.test(String(signal.reason || '')), signal };
}

/**
 * Pure. The state's effect on `today`, and why it ended if it did.
 * @returns {{active:boolean, kcal:number, until:string|null, end:'expired'|'cleared'|null}}
 */
export function pausedNow({ state, today, clear = false }) {
  if (!state?.active || !(state.deficitKcal > 0)) return { active: false, kcal: 0, until: null, end: null };
  if (state.since && today < state.since) return { active: false, kcal: 0, until: state.until, end: null };
  if (state.until && today > state.until) return { active: false, kcal: 0, until: state.until, end: 'expired' };
  if (clear) return { active: false, kcal: 0, until: state.until, end: 'cleared' };
  return { active: true, kcal: state.deficitKcal, until: state.until, end: null };
}

/**
 * Pure. Earned room and a paused deficit together, never past the deficit he
 * is carrying. Paused comes first (it is the plan for a hard week), earned
 * fills whatever is left under the cap. With no pause active, `deficit` is
 * unbounded here: earned has its own daily cap.
 */
export function combineExtra({ earned = 0, paused = 0, deficit = 0 }) {
  const p = Math.max(0, Math.round(paused));
  const cap = paused > 0 && deficit > 0 ? Math.max(0, Math.round(deficit) - p) : Infinity;
  const e = Math.min(Math.max(0, Math.round(earned)), cap);
  return { earned: e, paused: p, total: e + p };
}

/** Start state for a yes: today through at most the longest pause. */
export function startedState({ today, deficitKcal, maxDays = FUEL_CHECK_DEFAULTS.pauseMaxDays }) {
  return { active: true, since: today, until: addDays(today, Math.max(1, Math.round(maxDays)) - 1), deficitKcal: Math.round(deficitKcal), endedOn: null, endedReason: null };
}

/**
 * The state's effect today, read for earnedToday. Ends an expired or cleared
 * pause in the file (a read that tidies, never one that starts anything).
 * Never throws: no pause is the honest default.
 */
export async function pausedToday({ today, days, deps = {} }) {
  try {
    const state = await readPausedState();
    if (!state.active) return { ...pausedNow({ state, today }), deficitKcal: 0 };
    const computeDeloadSignal = deps.computeDeloadSignal || (await import('./coach.js')).computeDeloadSignal;
    const rec = recoveryFires(days, null, { now: deps.now || new Date(), computeDeloadSignal, gated: true });
    const now = pausedNow({ state, today, clear: rec.clear });
    if (now.end) await writePausedState({ ...state, active: false, endedOn: today, endedReason: now.end }).catch(() => {});
    return { ...now, deficitKcal: state.deficitKcal };
  } catch { return { active: false, kcal: 0, until: null, end: null, deficitKcal: 0 }; }
}

// --------------------------------------------------------------- the card --

const plain = (s) => String(s || '').replace(/\s+[—–]\s+/g, ', ');

/**
 * Raise at most ONE pending card when the recovery signal fires. Silent when
 * he is not cutting, a pause is on, a card is already waiting, he turned one
 * down this week, or one just ended. Code decides; the words are written here.
 * `deps` swaps a source (tests).
 */
export async function proposePausedDeficit(vaultPath, { now = new Date(), deps = {} } = {}) {
  const { localDateISO } = await import('./localDate.js');
  const today = localDateISO(now);
  const state = await readPausedState();
  if (state.active) return null;
  if (state.endedOn && dayNum(today) - dayNum(state.endedOn) < NO_AGAIN_DAYS) return null;

  const profile = deps.profile !== undefined ? deps.profile : await (await import('./profile.js')).getProfile(vaultPath).catch(() => null);
  const deficit = deficitFromIntake(profile?.intake);
  if (!deficit) return null; // not cutting, nothing to pause

  const hd = await import('./healthData.js');
  // loadRecentDays is the gate every reader goes through: a night he has not confirmed comes back held back
  const days = deps.days || await hd.loadRecentDays(14);
  const computeDeloadSignal = deps.computeDeloadSignal || (await import('./coach.js')).computeDeloadSignal;
  const rec = recoveryFires(days, null, { now, computeDeloadSignal, gated: true });
  if (!rec.fires) return null;

  const { listRecords, createRecord } = deps.store || await import('./inboxStore.js');
  const mine = (await listRecords()).filter((r) => r.source === 'fuel-paused');
  if (mine.some((r) => r.status === 'pending')) return null;
  const recentNo = mine.find((r) => r.status === 'discarded' && now.getTime() - new Date(r.discardedAt || r.createdAt || 0).getTime() < DECLINED_QUIET_DAYS * 86400000);
  if (recentNo) return null;

  const t = FUEL_CHECK_DEFAULTS;
  const title = `Pause the deficit? Recovery says go lighter`;
  const body = [
    `Your recovery signal: ${plain(rec.signal.reason)}.`,
    '',
    `A yes eats at maintenance until the signal clears, at most ${t.pauseMaxDays} days: today's target goes up by ${deficit} kcal, your usual deficit. Earned calories stay inside that, so the extra never passes ${deficit} kcal. It ends by itself when recovery reads steady. Undo puts the deficit back.`,
  ].join('\n');
  const { randomUUID } = await import('node:crypto');
  return createRecord({
    id: randomUUID().slice(0, 8), kind: 'paused-deficit', text: title, source: 'fuel-paused',
    mode: 'review-all', status: 'pending',
    decision: { route: 'paused-deficit', title, payload: { body, deficitKcal: deficit, maxDays: t.pauseMaxDays } },
    createdAt: now.toISOString(),
  });
}
