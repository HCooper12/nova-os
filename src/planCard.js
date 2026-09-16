// THE PLAN HE WALKED AWAY FROM.
//
// His ask, 16 Sep, from the Claude advertisement: set a big task, go and do
// your own thing, come back with it ready. The planner has always kept live
// per-step state — runPlan writes the record on every transition — and nothing
// ever showed it to him. Delegating and then having no way to know whether
// anything is happening is the difference between walking away and abandoning
// it.
//
// Pure, so it can be tested without a browser: records in, one card out.

// A step that has not started is 'waiting'. It must not borrow the look of one
// that is running — "in flight" and "not begun" are different answers to the
// only question he is asking.
const STEP_STATUS = new Set(['waiting', 'running', 'done', 'failed']);

export function elapsedLabel(at, now = Date.now()) {
  if (!at) return '';
  const ms = now - new Date(at).getTime();
  if (!Number.isFinite(ms)) return '';
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Which plan, if any, belongs on Home. Two states, one card, because they
// answer the same question:
//   RUNNING — which step, of how many, and which are already in.
//   READY   — it finished while he was gone and is waiting to be read.
// A running plan wins over a finished one: the thing still moving is the thing
// he cannot otherwise see.
export function planCardFrom(records, now = Date.now()) {
  const plans = (records || []).filter((r) => r && r.kind === 'plan');
  const stepsOf = (r) => (Array.isArray(r?.plan?.steps) ? r.plan.steps : []);
  const live = plans.find((r) => r.status === 'classifying' && stepsOf(r).length);
  // 'ready' needs finishedAt: a pending plan that never ran is a PROPOSAL
  // waiting for his yes, which is the Inbox's job to show, not this card's
  const ready = plans.find((r) => r.status === 'pending' && stepsOf(r).length && r.finishedAt);
  const rec = live || ready;
  if (!rec) return null;

  const steps = stepsOf(rec);
  const settled = steps.filter((s) => s.status === 'done' || s.status === 'failed');
  const failed = steps.filter((s) => s.status === 'failed');
  const at = rec.startedAt || rec.createdAt || null;
  return {
    id: rec.id,
    state: live ? 'running' : 'ready',
    goal: rec.goal || rec.text || 'a plan',
    total: steps.length,
    settled: settled.length,
    failedCount: failed.length,
    since: elapsedLabel(at, now),
    steps: steps.map((s) => ({
      id: s.id,
      what: s.what || s.capability || 'a step',
      status: STEP_STATUS.has(s.status) ? s.status : 'waiting',
      error: s.status === 'failed' ? (s.error || 'it failed') : null,
    })),
  };
}
