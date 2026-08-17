// The Morning Show / Evening Debrief — Phase 2 of MORNING-SHOW-PLAN.md.
//
// The reel's lesson: the "snap" is prepared work played back — each spoken
// beat backed by visual evidence, ending in ONE staged approval. This
// composer is CODE assembling receipts (health files, calendar, inbox
// records, the panel builders); nothing here invents, and a source that is
// missing or failing simply loses its beat — honest silence over filler.
// The client plays the steps through the sentence-TTS FIFO, revealing each
// beat's text and pane as its audio starts.
//
// Every say-line rides the persona register (unflappable, exact, dry);
// rotation over randomness, same as the ack lines.

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let rot = 0;
const pick = (arr) => arr[rot++ % arr.length];

function hoursMinutes(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} minutes`;
  return m ? `${h} hours ${m} minutes` : `${h} hours`;
}

function speakTime(t) {
  // "17:30" → "5:30 pm" — Kokoro reads 12-hour clock more naturally
  const [H, M] = String(t || '').split(':').map(Number);
  if (Number.isNaN(H)) return t;
  const h12 = ((H + 11) % 12) + 1;
  return `${h12}:${pad(M || 0)} ${H < 12 ? 'am' : 'pm'}`;
}

// Kinds an agent produced (show-worthy work) vs housekeeping the brief
// should count but not headline. Keep in step with the inbox seed kinds.
const PRODUCE_KINDS = ['research', 'watch-note', 'forge-job', 'pattern', 'studio', 'brain-week', 'distill'];

const recordLabel = (r) =>
  (r.title || r.question || r.text || r.kind || 'a draft').toString().replace(/\s+/g, ' ').slice(0, 90);

const defaultDeps = {
  recentDays: async () => (await import('./healthData.js')).loadRecentDays(3),
  foodToday: async () => (await import('./foodLog.js')).getToday(),
  records: async () => (await import('./inboxStore.js')).listRecords(),
  eventsForDay: async (date) => (await import('./calendar.js')).fetchEventsForDay(date),
  panel: async (vaultPath, directive) => (await import('./panels.js')).buildPanel(vaultPath, directive),
};

export async function composeShow(vaultPath, { variant = 'morning' } = {}, deps = defaultDeps) {
  const steps = [];
  const now = new Date();
  const today = localDate(now);
  const yesterday = localDate(new Date(now.getTime() - 86_400_000));
  const evening = variant === 'evening';

  const days = await deps.recentDays().catch(() => []);
  const dToday = days.find((x) => x.date === today);
  const dYest = days.find((x) => x.date === yesterday);

  // — opening: greeting + the body's headline —
  {
    const open = evening ? pick(['Good evening, sir.', 'Evening, sir.']) : pick(['Good morning, sir.', 'Morning, sir.']);
    const bits = [];
    const sleepMin = (evening ? dToday : dToday || dYest)?.sleepAsleepMinutes;
    if (!evening && sleepMin) bits.push(`You slept ${hoursMinutes(sleepMin)}`);
    const hrv = [...days].reverse().find((x) => x.hrv != null);
    if (hrv) bits.push(`${bits.length ? 'and ' : ''}HRV is ${Math.round(hrv.hrv)}`);
    steps.push({ say: bits.length ? `${open} ${bits.join(', ')}.` : open });
  }

  // — movement —
  {
    const d = evening ? dToday : dYest;
    if (d?.steps != null) {
      steps.push({ say: evening
        ? `${d.steps.toLocaleString()} steps today.`
        : `${d.steps.toLocaleString()} steps yesterday.` });
    }
  }

  // — fuel (evening leads with it; morning skips — nothing logged yet) —
  if (evening) {
    const log = await deps.foodToday().catch(() => null);
    const entries = log?.entries || [];
    if (entries.length) {
      const p = Math.round(entries.reduce((s, e) => s + (e.macros?.p || 0), 0));
      const kcal = Math.round(entries.reduce((s, e) => s + (e.macros?.kcal || 0), 0));
      const panel = await deps.panel(vaultPath, { panel: 'nutrition-week' }).catch(() => null);
      steps.push({ say: `${p} grams of protein and ${kcal.toLocaleString()} calories logged.`, ...(panel ? { panel } : {}) });
    }
  }

  // — the day's (or tomorrow's) shape —
  {
    const target = evening ? new Date(now.getTime() + 86_400_000) : now;
    const events = await deps.eventsForDay(target).catch(() => null);
    if (events) {
      const word = evening ? 'Tomorrow' : 'Today';
      if (!events.length) steps.push({ say: `${word} is clear on the calendar.` });
      else {
        const first = events[0];
        steps.push({ say: `${word} holds ${events.length === 1 ? 'one thing' : `${events.length} things`} — ${evening ? 'first is' : 'starting with'} ${first.label} at ${speakTime(first.time)}.` });
      }
    }
  }

  // — what the agents produced (last 16 hours, newest first, max two) —
  const records = await deps.records().catch(() => []);
  const pending = records.filter((r) => r.status === 'pending');
  {
    const cutoff = now.getTime() - 16 * 3600e3;
    const produced = pending
      .filter((r) => PRODUCE_KINDS.includes(r.kind) && new Date(r.createdAt || 0).getTime() > cutoff)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 2);
    for (const r of produced) {
      steps.push({ say: `${evening ? 'Today' : 'While you slept'}, the ${r.kind === 'forge-job' ? 'Forge built' : `${r.kind} agent drafted`} “${recordLabel(r)}” — it's pending your word.` });
    }
  }

  // — the one item that wants his word, wired for a spoken yes —
  let approve = null;
  if (pending.length) {
    const highlight = [...pending]
      .sort((a, b) =>
        (PRODUCE_KINDS.includes(b.kind) - PRODUCE_KINDS.includes(a.kind))
        || (new Date(b.createdAt || 0) - new Date(a.createdAt || 0)))[0];
    approve = { recordId: highlight.id, title: recordLabel(highlight) };
    const rest = pending.length - 1;
    steps.push({ say: `${pending.length === 1 ? 'One draft waits' : `${pending.length} drafts wait`} in your Inbox — nearest is “${approve.title}”. Say the word and I'll file it${rest > 0 ? '; the rest can hold' : ''}.` });
  }

  // — close —
  steps.push({ say: evening
    ? pick(['That closes the day, sir. Rest well.', 'Nothing else needs you tonight, sir.'])
    : pick(['The day is yours, sir.', "That is the shape of it, sir."]) });

  return { steps, pending: approve };
}
