// The Reflex Layer — deterministic answers in front of the model.
//
// The JARVIS builder's line (design/MORNING-SHOW-PLAN.md): reflexes sit
// above the reasoning model "so most of what he asks never reaches deep
// thought at all — that is the speed people assume is edited." For Nova
// that means: a question whose answer already sits in the live record
// (steps, HRV, weight, fuel, inbox) is answered by CODE in <1s — templated
// in the persona register, exact numbers, honest dates — and the CLI is
// never spawned. Everything else falls through to the model untouched.
//
// The contract that keeps this honest:
//   - STRICT matching. A reflex that fires on "why are my steps so low?"
//     would answer a question that needed thought. Patterns match direct
//     what/how-many asks only; anything analytical falls through.
//   - NEVER guess. Missing data → return null and let the model (which can
//     read the vault) take it. A reflex answers or stays silent.
//   - Same variation discipline as the ack lines: rotate, don't random.

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function normalize(q) {
  return (q || '')
    .toLowerCase()
    .replace(/^(hey|hi|ok|okay)?[,\s]*(nova|jarvis)[,\s]*/i, '')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Analytical words mean he wants thought, not a number read back.
const NEEDS_THOUGHT = /\b(why|should|could|would|compare|versus|vs|trend|average|analys|explain|think|advice|low|high|bad|good|enough|improve)\b/;

let rot = 0;
const pick = (arr) => arr[rot++ % arr.length];

const defaultDeps = {
  recentDays: async () => (await import('./healthData.js')).loadRecentDays(3),
  foodToday: async () => (await import('./foodLog.js')).getToday(),
  pendingCount: async () =>
    (await (await import('./inboxStore.js')).listRecords()).filter((r) => r.status === 'pending').length,
};

// Each reflex: match → load → speak-or-null. Order matters only for
// overlapping phrasings; keep the list short and each pattern tight.
export async function tryReflex(question, deps = defaultDeps) {
  const q = normalize(question);
  if (!q || q.length > 80 || NEEDS_THOUGHT.test(q)) return null;

  const now = new Date();
  const today = localDate(now);
  const yesterday = localDate(new Date(now.getTime() - 86_400_000));

  // ---- steps (today / yesterday) ----
  const steps = q.match(/^(?:what(?:'s| is| are| was| were)?|how many)?\s*(?:my\s+)?(?:step count|steps)\s*(today|yesterday|so far)?$/);
  if (steps) {
    const days = await deps.recentDays().catch(() => []);
    const which = steps[1] === 'yesterday' ? yesterday : today;
    const day = days.find((x) => x.date === which);
    if (day?.steps == null) return null; // no record — the model can go looking
    const when = steps[1] === 'yesterday' ? 'yesterday' : 'so far today';
    return { matched: `steps-${steps[1] === 'yesterday' ? 'yesterday' : 'today'}`,
      text: pick([
        `${day.steps.toLocaleString()} steps ${when}, sir.`,
        `You're at ${day.steps.toLocaleString()} steps ${when}.`,
      ]) };
  }

  // ---- HRV ----
  if (/^(?:what(?:'s| is)?\s*)?(?:my\s+)?hrv(?:\s+today)?$/.test(q)) {
    const days = await deps.recentDays().catch(() => []);
    const d = [...days].reverse().find((x) => x.hrv != null);
    if (!d) return null;
    const dated = d.date === today ? '' : ` — that's from ${d.date === yesterday ? 'yesterday' : d.date}`;
    return { matched: 'hrv', text: `HRV is ${Math.round(d.hrv)} milliseconds${dated}, sir.` };
  }

  // ---- weight ----
  if (/^(?:what(?:'s| is| do i weigh)?\s*)?(?:my\s+)?weight(?:\s+today)?$|^how much do i weigh$/.test(q)) {
    const days = await deps.recentDays().catch(() => []);
    const d = [...days].reverse().find((x) => x.weightKg != null);
    if (!d) return null;
    const dated = d.date === today ? '' : ` (logged ${d.date === yesterday ? 'yesterday' : d.date})`;
    return { matched: 'weight', text: `${d.weightKg} kilograms${dated}.` };
  }

  // ---- fuel today: protein / calories ----
  const fuel = q.match(/^(?:what(?:'s| is| are)?|how (?:much|many))\s*(?:my\s+)?(protein|calories|kcal)(?:\s+(?:today|so far|have i (?:had|eaten|logged)(?:\s+today)?))?$/);
  if (fuel) {
    const log = await deps.foodToday().catch(() => null);
    if (!log) return null;
    const entries = log.entries || [];
    if (!entries.length) return { matched: 'fuel-empty', text: 'Nothing logged yet today, sir.' };
    const p = Math.round(entries.reduce((s, e) => s + (e.macros?.p || 0), 0));
    const kcal = Math.round(entries.reduce((s, e) => s + (e.macros?.kcal || 0), 0));
    return { matched: `fuel-${fuel[1]}`,
      text: fuel[1] === 'protein'
        ? `${p} grams of protein so far today, across ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}.`
        : `${kcal.toLocaleString()} calories logged so far today, sir.` };
  }

  // ---- inbox pending ----
  if (/^(?:what(?:'s| is)?\s*)?(?:in\s+)?(?:my\s+)?inbox$|^how many (?:drafts?|items?|records?)\s*(?:are\s+)?(?:pending|waiting)(?:\s+(?:for me|in my inbox))?$|^(?:anything|what'?s?) (?:pending|waiting)(?:\s+for me)?$/.test(q)) {
    const n = await deps.pendingCount().catch(() => null);
    if (n == null) return null;
    if (n === 0) return { matched: 'inbox', text: 'Your Inbox is clear, sir.' };
    return { matched: 'inbox', text: pick([
      `${n} draft${n === 1 ? '' : 's'} waiting in your Inbox, sir.`,
      `${n} item${n === 1 ? '' : 's'} pending your word.`,
    ]) };
  }

  return null;
}
