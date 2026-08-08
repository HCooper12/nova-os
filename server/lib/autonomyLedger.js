import { randomUUID } from 'node:crypto';
import { createRecord, listRecords } from './inboxStore.js';

// The earned-autonomy engine — the trust ladder made real. Doctrine says
// autonomy is EARNED from real history and PROPOSED, never assumed; until
// now nothing implemented that. This reads the ledger every agent already
// leaves (made / approved-by-him / auto / rejected / aged-out-unread) and,
// when the evidence is overwhelming, files a PENDING proposal to change one
// agent's mode — applied deterministically on his yes, undoable, never
// silently. Both directions matter: a gate he never engages with is theatre
// (propose auto), and an auto surface he keeps undoing was trusted too soon
// (propose draft).
//
// Entirely deterministic — no model. The thresholds are the judgment,
// reviewed here once, in code, instead of per-draft forever.

const WINDOW_DAYS = 90;
const MIN_SAMPLE = 14;      // no verdicts on thin evidence
const DEAD_GATE_RATIO = 0.8; // ≥80% aged out or rejected, none approved

// The proposal targets: config-backed agents whose mode this engine may
// touch. Each knows how to read its current mode and how to apply a new one
// (used by the inbox filer). Coach receipts and captures are deliberately
// absent — they have no mode config yet.
export const AUTONOMY_TARGETS = {
  'dispatch-morning': {
    label: 'Morning brief',
    match: (r) => r.kind === 'dispatch' && r.slot === 'morning',
    getMode: async () => (await import('./dispatch.js')).getDispatchConfig().then((c) => c.morning.mode),
    setMode: async (mode) => (await import('./dispatch.js')).setDispatchConfig('morning', { mode }),
  },
  'dispatch-evening': {
    label: 'Evening debrief',
    match: (r) => r.kind === 'dispatch' && r.slot === 'evening',
    getMode: async () => (await import('./dispatch.js')).getDispatchConfig().then((c) => c.evening.mode),
    setMode: async (mode) => (await import('./dispatch.js')).setDispatchConfig('evening', { mode }),
  },
  'dispatch-weekly': {
    label: 'Weekly review brief',
    match: (r) => r.kind === 'dispatch' && r.slot === 'weekly',
    getMode: async () => (await import('./dispatch.js')).getDispatchConfig().then((c) => c.weekly.mode),
    setMode: async (mode) => (await import('./dispatch.js')).setDispatchConfig('weekly', { mode }),
  },
  review: {
    label: 'Daily Review',
    match: (r) => r.kind === 'review',
    getMode: async () => (await import('./dailyReview.js')).getReviewConfig().then((c) => c.mode),
    setMode: async (mode) => (await import('./dailyReview.js')).setReviewConfig({ mode }),
  },
  'plan-today': {
    label: 'Plan Today',
    match: (r) => r.kind === 'plan-today',
    getMode: async () => (await import('./planToday.js')).getPlanConfig().then((c) => c.mode),
    setMode: async (mode) => (await import('./planToday.js')).setPlanConfig({ mode }),
  },
  'training-check': {
    label: 'Training check',
    match: (r) => r.kind === 'training-check',
    getMode: async () => null, // no mode config exists yet — ledger row only
    setMode: null,             // and therefore never proposed
  },
};

// Pure: one target's history → its ledger row. Exported for tests.
export function ledgerRow(records, target, now = Date.now()) {
  const cutoff = now - WINDOW_DAYS * 86400e3;
  const mine = records.filter((r) => target.match(r) && new Date(r.createdAt).getTime() >= cutoff);
  const row = { made: mine.length, approved: 0, auto: 0, rejected: 0, agedOut: 0, undone: 0, pending: 0 };
  for (const r of mine) {
    if (r.status === 'pending' || r.status === 'classifying') row.pending++;
    else if (r.status === 'filed' && r.auto) row.auto++;
    else if (r.status === 'filed') row.approved++;
    else if (r.status === 'undone') row.undone++;
    else if (r.status === 'discarded' || r.status === 'expired') {
      if (r.expired) row.agedOut++;
      else row.rejected++;
    }
  }
  return row;
}

// Pure verdict: what (if anything) to propose for one target. Exported for
// tests — this IS the trust ladder's judgment.
export function verdict(row, currentMode) {
  const settled = row.made - row.pending;
  if (settled < MIN_SAMPLE) return null;
  if (currentMode === 'draft') {
    const dead = row.agedOut + row.rejected;
    if (row.approved === 0 && dead / settled >= DEAD_GATE_RATIO) {
      return {
        to: 'auto',
        evidence: `${row.made} drafted in ${WINDOW_DAYS} days: ${row.approved} approved by you, ${row.agedOut} aged out unread, ${row.rejected} discarded. The gate here is friction without judgment — auto files it (always undoable) and delivers it to Telegram as a message instead of a chore.`,
      };
    }
  }
  if (currentMode === 'auto') {
    // trusted too soon: he keeps reversing what auto filed
    if (row.auto >= MIN_SAMPLE && row.undone / Math.max(1, row.auto + row.undone) >= 0.3) {
      return {
        to: 'draft',
        evidence: `${row.undone} of ${row.auto + row.undone} auto-filed items were undone — auto was trusted too soon; back to drafts for your yes.`,
      };
    }
  }
  return null;
}

export async function computeAutonomyLedger() {
  const records = await listRecords();
  const out = [];
  for (const [id, target] of Object.entries(AUTONOMY_TARGETS)) {
    const row = ledgerRow(records, target);
    let mode = null;
    try { mode = await target.getMode(); } catch { /* config unreadable → skip */ }
    out.push({ id, label: target.label, mode, row, proposable: !!target.setMode });
  }
  return out;
}

// File at most `cap` proposals; skip any target that already has one pending.
export async function proposeEarnedAutonomy({ cap = 3 } = {}) {
  const records = await listRecords();
  const alreadyPending = new Set(records
    .filter((r) => r.kind === 'autonomy' && (r.status === 'pending' || r.status === 'classifying'))
    .map((r) => r.decision?.payload?.target));
  const ledger = await computeAutonomyLedger();
  const proposals = [];
  for (const entry of ledger) {
    if (proposals.length >= cap) break;
    if (!entry.proposable || !entry.mode || alreadyPending.has(entry.id)) continue;
    const v = verdict(entry.row, entry.mode);
    if (!v) continue;
    const record = {
      id: randomUUID().slice(0, 8),
      kind: 'autonomy',
      text: `${entry.label}: ${entry.mode} → ${v.to}`,
      source: 'nova',
      mode: 'review-all', // an autonomy change is ALWAYS his call
      status: 'pending',
      createdAt: new Date().toISOString(),
      decision: {
        route: 'agent-mode',
        confidence: 'high',
        title: `Earned autonomy: ${entry.label} → ${v.to}`,
        reason: v.evidence,
        payload: { target: entry.id, from: entry.mode, to: v.to },
      },
    };
    await createRecord(record);
    proposals.push(record);
  }
  return proposals;
}

export function startAutonomyScheduler() {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('autonomy');
    try {
      const now = new Date();
      if (now.getDay() !== 0 || now.getHours() < 18) return; // Sunday evening
      const records = await listRecords();
      const cutoff = Date.now() - 6 * 86400e3;
      if (records.some((r) => r.kind === 'autonomy' && new Date(r.createdAt).getTime() >= cutoff)) return;
      await proposeEarnedAutonomy();
    } catch (err) {
      console.error('autonomy ledger failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}
