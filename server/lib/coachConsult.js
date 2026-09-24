// CONSULT — the Coach asks the other agents before it answers.
//
// His ask, 25 Sep 2026, on a detailed program question: "coach should be able
// to reach out to other agents for support if it needs it" — and, asked
// whether a slower, costlier answer was acceptable: "I don't care if it takes
// longer or costs more per question (remember no caps on the work)."
//
// THE SHAPE (models decide, code acts). The Coach's first turn may end with
//   CONSULT {"asks":[{"agent":"researcher","question":"…"}, …]}
// instead of answering. Code validates that line against this registry, runs
// every ask in parallel through each agent's OWN proven lane, streams "who
// is being asked, and who has answered" into the Coach's bubble while he
// waits, then hands the answers back to the SAME Coach conversation, which
// writes the one reply he reads. The Coach never talks to another agent
// directly and never sees anything the code did not fetch.
//
// WHO CAN BE ASKED — chosen for what the Coach does NOT already have. Its
// context already carries his training, nutrition, recovery and goals, and it
// can search the web itself; so the consultable agents are the ones that add
// something it cannot get alone:
//   researcher — cross-checked, citation-verified evidence (the brief also
//                lands in his Inbox, where the sources can be checked)
//   nova       — his whole vault, read-only: notes, journal, work, life
//   calendar   — his real calendar for the next fortnight (read by code)
//
// No budget, no timeout on the work (his standing instruction). The one
// limit here is a LOOP guard — a Coach that asked, was answered, and asked
// again cannot keep asking forever — which is correctness, not a cap.

export const CONSULT_AGENTS = {
  researcher: {
    label: 'the Researcher',
    what: 'reads the published evidence on the web, cross-checks it and returns a cited brief (the brief also lands in his Inbox). Ask it whenever the research literature should decide the answer — training volume, frequency, rep ranges, rest, nutrition science. Takes a few minutes.',
  },
  nova: {
    label: 'Nova',
    what: 'reads his whole vault, read-only — his notes, journal, work and life outside the training data you already hold. Ask it when his life outside the gym bears on the answer: workload, stress, travel, what he has written about this.',
  },
  calendar: {
    label: 'your calendar',
    what: 'his actual calendar for the next 14 days — when he trains, how long, what else is booked around it. Ask it when time, scheduling or session length bears on the answer. (Code reads it; give it any question — it returns the fortnight.)',
  },
};

// Loop guard: a first turn may consult, and so may the turn that reads the
// answers (if the answers raise a genuinely new question); the next is made
// to answer.
export const MAX_CONSULT_ROUNDS = 2;

const CONSULT_LINE = /(^|\n)[ \t]*CONSULT[ \t]*(\{[\s\S]*\})[ \t]*$/;

// The prompt paragraph, generated from the registry so the Coach can only be
// told about agents that actually exist.
export function consultCapability() {
  const who = Object.entries(CONSULT_AGENTS).map(([id, a]) => `"${id}" (${a.label}) — ${a.what}`).join('\n    ');
  return `- CONSULT THE OTHER AGENTS when their knowledge would make your answer materially better — a detailed program question usually deserves the evidence. Instead of answering, write ONE short sentence telling him who you are asking and why, then end with ONE line, EXACTLY this JSON form on its own final line:
  CONSULT {"asks":[{"agent":"researcher","question":"<tight, specific>"},{"agent":"calendar","question":"<what you need to know>"}]}
  Who you can ask:
    ${who}
  Their answers come back to you in this conversation; THEN give him your full answer, built on them, and say whose input shaped it. Never answer and consult in the same reply. Do not consult for a quick or conversational question — only when it earns the wait.`;
}

// Pull a CONSULT line off the end of a reply. Returns null when there is none
// or it names nothing valid; otherwise the sentence for him and the asks.
export function parseConsult(text) {
  const m = String(text || '').match(CONSULT_LINE);
  if (!m) return null;
  let parsed;
  try { parsed = JSON.parse(m[2]); } catch { return null; }
  const raw = Array.isArray(parsed?.asks) ? parsed.asks : [];
  const seen = new Set();
  const asks = [];
  for (const a of raw) {
    const agent = typeof a?.agent === 'string' ? a.agent.trim().toLowerCase() : '';
    const question = typeof a?.question === 'string' ? a.question.trim().slice(0, 500) : '';
    if (!CONSULT_AGENTS[agent] || !question) continue;
    const key = `${agent}|${question.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    asks.push({ agent, question, label: CONSULT_AGENTS[agent].label });
  }
  if (!asks.length) return null;
  return { cleanText: String(text).slice(0, m.index + (m[1] ? m[1].length : 0)).trim(), asks };
}

// What he sees in the Coach's bubble while the agents work — who is being
// asked, about what, and who has answered. Plain lines: this is streamed into
// a spoken, markdown-light surface.
export function consultProgress(lead, asks) {
  const lines = asks.map((a) => {
    const state = a.state === 'done' ? 'answered' : a.state === 'failed' ? `could not answer (${a.error || 'no reason given'})` : 'working on it';
    return `· ${cap(a.label)}: ${state}. Asked: ${a.question}`;
  });
  return `${lead ? `${lead}\n\n` : ''}Asking now:\n${lines.join('\n')}`;
}

// The message that carries the answers back into the Coach's conversation.
export function consultReplyText(results, question) {
  const blocks = results.map((r) => (r.ok
    ? `FROM ${r.label.toUpperCase()} (you asked: ${r.question}):\n${r.answer}`
    : `${r.label.toUpperCase()} COULD NOT ANSWER (you asked: ${r.question}): ${r.error}. Say so plainly if it matters to the answer.`));
  return `[The agents you consulted have answered. Now give Hayden your full answer to his question, built on what they found. Name whose input shaped it — "the Researcher's review of…", "your calendar shows…". If the Researcher answered, tell him its cited brief is in his Inbox. Do not consult again unless their answers raise a genuinely new question.]

His question was: ${question}

${blocks.join('\n\n')}`;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Run every ask in parallel, each through its own lane. `onUpdate` fires as
// each one settles, so the bubble can say so. `deps` is injectable for tests.
export async function runConsults(vaultPath, asks, { question = '', onUpdate, deps } = {}) {
  const d = deps || defaultDeps(vaultPath, question);
  const state = asks.map((a) => ({ ...a, state: 'asking' }));
  onUpdate?.(state);
  const results = await Promise.all(state.map(async (a) => {
    try {
      const out = await d[a.agent](a.question);
      a.state = 'done';
      onUpdate?.(state);
      return { agent: a.agent, label: a.label, question: a.question, ok: true, answer: String(out?.text ?? out ?? '').trim() || '(an empty answer)', recordId: out?.recordId || null };
    } catch (e) {
      a.state = 'failed';
      a.error = e?.message || String(e);
      onUpdate?.(state);
      return { agent: a.agent, label: a.label, question: a.question, ok: false, error: a.error };
    }
  }));
  return results;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function defaultDeps(vaultPath, question) {
  return {
    // The Researcher's own lane: citation checks, the Inbox record, the model
    // he chose for it. Wait on the record it creates.
    async researcher(q) {
      const { startResearch } = await import('./researcher.js');
      const { getRecord } = await import('./inboxStore.js');
      const record = await startResearch(vaultPath, q, { context: `The Coach is asking this while answering Hayden's question: "${String(question).slice(0, 600)}"` });
      for (;;) {
        await sleep(3000);
        const r = await getRecord(record.id);
        if (!r) throw new Error('the research record disappeared');
        if (r.status === 'classifying') continue;
        if (r.status === 'error') throw new Error(r.error || 'the research failed');
        const body = r.decision?.payload?.body;
        if (!body) throw new Error('the research finished without a brief');
        return { text: body, recordId: r.id };
      }
    },
    // Nova's own read-only lane over the whole vault, in a fresh session so
    // his Voice conversation is untouched.
    async nova(q) {
      const { startAskNova, getMessageJob } = await import('./claudeCode.js');
      const jobId = startAskNova(vaultPath, { question: `${q}\n\n(The Coach is asking you this, to help answer Hayden's question: "${String(question).slice(0, 600)}". Answer from his vault; say plainly what is not written there.)`, context: '', direct: true });
      for (;;) {
        await sleep(1500);
        const job = getMessageJob(jobId);
        if (!job) throw new Error('Nova lost the question');
        if (job.status === 'ready') return { text: job.result?.text || '' };
        if (job.status === 'error') throw new Error(job.error || 'Nova could not answer');
      }
    },
    // Code reads the calendar; no model is needed to list what is booked.
    async calendar() {
      const { fetchEventsForRange } = await import('./calendar.js');
      const events = await fetchEventsForRange(14);
      return { text: formatFortnight(events) };
    },
  };
}

export function formatFortnight(events = []) {
  if (!events.length) return 'Nothing is booked in the next 14 days.';
  const byDay = new Map();
  for (const e of events) {
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date).push(e);
  }
  const lines = [];
  for (const [date, list] of byDay) {
    const day = new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    lines.push(`${day}: ${list.map((e) => `${e.time || 'all day'}${e.end ? `–${e.end}` : ''} ${e.label}${e.calendar ? ` (${e.calendar})` : ''}`).join('; ')}`);
  }
  return `His calendar, next 14 days (read by code from iCloud):\n${lines.join('\n')}`;
}
