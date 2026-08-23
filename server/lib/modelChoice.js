import { randomUUID } from 'node:crypto';

// THE MODEL CHOICE GATE — his ask: before a reasoning-heavy job runs on its
// default model, offer the stronger one for THIS run specifically. Distinct
// from the model board (lib/modelPrefs.js), which sets a LANE's standing
// default; this is a per-job override laid on top of it, and it never
// changes the board itself — the next run reverts to whatever the board
// still says. Two options only (opus vs the lane's own default), because
// that is the actual choice being offered, not a tour of every model.
//
// Four lanes gate, per his ask: Researcher and Watcher (both explicitly
// named — "if I give it a video to research... prompt me for Opus"), and
// Pattern Scout / Distill (the cross-vault connection-making he named).
// Interactive lanes (Researcher, Watcher) ask INSIDE the request that
// triggered them — voice, the Inbox composer, or the command palette — and
// hold the run until answered. Scheduled lanes (Pattern Scout, Distill) have
// no one "in the room" when their weekly cron fires, so their gate is a
// durable Inbox card instead (server/routes/modelChoice.js): the week's run
// waits there, same as any other draft awaiting a decision.
export const GATE_LANES = {
  researcher: { label: 'this research', questionNoun: 'this' },
  watcher: { label: 'this video', questionNoun: 'this video' },
  'pattern-scout': { label: "this week's pattern scout — connecting what's spread across your vault", questionNoun: 'this' },
  distill: { label: "this week's distillation", questionNoun: 'this' },
};

export const STRONG_MODEL = 'opus';
export const DEFAULT_MODEL_CHOICE = 'sonnet'; // the "no, keep it normal" answer

// The question, phrased the same way everywhere it appears (voice, popup,
// Inbox card) — one honest sentence, not a bespoke line per surface.
export function gateQuestion(lane) {
  const meta = GATE_LANES[lane];
  if (!meta) throw new Error(`unknown gate lane: ${lane}`);
  return `Want Opus for ${meta.questionNoun === 'this video' ? 'this video' : meta.label}, or is Sonnet fine?`;
}

export function isGateModel(model) {
  return model === 'opus' || model === 'sonnet';
}

// A spoken reply answering the gate question — deterministic, no model call
// (the choice is one of two words; spending an LLM turn to parse "opus" vs
// "sonnet" would be slower than just asking and add a failure mode of its
// own). Returns null when genuinely ambiguous; the caller's honest fallback
// is DEFAULT_MODEL_CHOICE — a hard gate that can never resolve would leave
// the original request unanswered forever, which is worse than proceeding
// on the safe default and saying so.
export function parseSpokenGateReply(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return null;
  if (/\b(opus|deeper|stronger|the strong one|go big|more thorough|go deep|really dig in)\b/.test(t)) return 'opus';
  if (/\b(sonnet|no|nah|nope|fine|default|quick|as.is|go ahead|that'?s fine|keep it|normal|standard)\b/.test(t)) return 'sonnet';
  return null;
}

// ---------------------------------------------------------------------------
// SCHEDULED LANES (Pattern Scout, Distill) — no one is "in the room" when a
// weekly cron fires, so their gate is a durable Inbox card instead of an
// in-conversation question: the scheduler raises it here (once per week —
// re-ticking while it's still unanswered is a no-op) and the week's run
// waits, same as any other draft awaiting a decision, until he picks a
// model from the Inbox.
// ---------------------------------------------------------------------------

export async function raiseWeeklyModelChoice(lane) {
  const meta = GATE_LANES[lane];
  if (!meta) throw new Error(`unknown gate lane: ${lane}`);
  const { createRecord, listRecords } = await import('./inboxStore.js');
  const records = await listRecords();
  const cutoff = Date.now() - 6 * 86400e3; // matches this lane's own "ran this week" window
  const existing = records.find((r) => r.kind === 'model-choice' && r.decision?.payload?.lane === lane && new Date(r.createdAt).getTime() >= cutoff);
  if (existing) return { skipped: true, record: existing };
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'model-choice',
    text: `Model choice — ${meta.label}`,
    source: 'model-choice',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'model-choice',
      confidence: 'n/a',
      title: `Pick a model — ${meta.label}`,
      reason: gateQuestion(lane),
      payload: { lane },
    },
  });
  return { record };
}

// Answering the card actually runs the lane — `force: true` because the
// standing "already ran this week" guard inside runPatternScout/
// runDistillation must not block the very answer that was waiting on it.
// Both of those functions are already fire-and-forget (they spawn the CLI,
// create their OWN in-flight marker record, and return immediately without
// waiting for it to finish) — so this resolves quickly, files the CHOICE
// card as answered, and the real job's progress lives on its own separate
// record from here, same as it always has.
export async function resolveWeeklyModelChoice(vaultPath, recordId, model) {
  if (!isGateModel(model)) throw new Error("model must be 'opus' or 'sonnet'");
  const { getRecord, updateRecord } = await import('./inboxStore.js');
  const record = await getRecord(recordId);
  if (!record || record.kind !== 'model-choice') throw new Error('model-choice record not found');
  if (record.status !== 'pending') throw new Error('this choice was already answered');
  const lane = record.decision?.payload?.lane;
  await updateRecord(recordId, { status: 'classifying' }); // in-flight while the real job spawns
  try {
    let outcome;
    if (lane === 'pattern-scout') {
      const { runPatternScout } = await import('./patternScout.js');
      outcome = await runPatternScout(vaultPath, { force: true, model });
    } else if (lane === 'distill') {
      const { runDistillation } = await import('./distill.js');
      outcome = await runDistillation(vaultPath, { force: true, model });
    } else {
      throw new Error(`unknown scheduled gate lane: ${lane}`);
    }
    const filed = await updateRecord(recordId, { status: 'filed', filedAt: new Date().toISOString(), auto: false });
    return { record: filed, outcome };
  } catch (e) {
    const errored = await updateRecord(recordId, { status: 'error', error: e.message });
    return { record: errored, outcome: null, error: e.message };
  }
}
