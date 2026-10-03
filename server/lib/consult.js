// THE CONSULT RAIL — every agent can ask every other agent.
//
// His words, 29 Sep 2026: "all agents must be capable of consulting and
// interacting with each other so that all outcomes and results can be
// optimised for their potential … nova is to perform as the CEO … Nova as the
// CEO should be able to discuss something with the coach but then realise it
// needs to ask the researcher to clarify something for the both of them and
// then ask the librarian to search through its library … Nothing should be
// walled off and they all should be able to interact seamlessly with each
// other." Until then only the Coach could consult (coachConsult.js, 25 Sep).
//
// THE SHAPE (models decide, code acts), unchanged from the Coach's version and
// now shared by every agent that reasons:
//   1. An agent's reply may be ONE line:
//        CONSULT {"asks":[{"agent":"coach","question":"…"}, …]}
//   2. Code validates it against the registry below (never yourself, never an
//      agent that is waiting on your answer), runs every ask in parallel
//      through the asked agent's OWN lane and model, and records each ask as
//      structured state ({agent, question, askedAt, settledAt, ok, ms, answer,
//      recordId}) on the job, so a screen can show who is working.
//   3. The answers go back to the SAME conversation, which writes the one
//      reply he reads. Code, not the model, writes the line that says who was
//      asked ("Asking the Coach and the Librarian.") from the parsed asks.
//
// A consulted agent answers the agent that asked, in a fresh session of its
// own lane, and writes nothing, with one exception (his call, 30 Sep): the
// Coach may file program cards through its checked pipeline, each waiting for
// his yes and never a twin of one already waiting. It may itself consult
// (anyone but itself and whoever is up its chain, waiting on it), so the
// Coach asked by Nova can still ask the Researcher.
//
// NO CAPS (his standing rule): no budget, no timeout on any ask. The only
// limits are LOOP guards, which are correctness, not cost:
//   - MAX_CONSULT_ROUNDS per agent per turn (ask, read, ask once more);
//   - the same agent is never asked the same question twice in one turn —
//     a repeat is answered from the turn's ledger, not re-run;
//   - an agent cannot ask anyone in the chain waiting on it (A asks B, B asks
//     A would never end); it says what it needs in its answer instead.

export const MAX_CONSULT_ROUNDS = 2;

// THE REGISTRY. `ask` runs the agent through its own proven lane — never an
// ad-hoc prompt — and resolves { text, recordId?, consult? }. `canConsult`
// is false only where no model runs (the calendar is read by code).
export const AGENTS = {
  nova: {
    label: 'Nova',
    what: 'the CEO of the org: reads his whole vault read-only (notes, journal, work, life), his day, his Inbox and everything the platform has done for him. Ask her when his life outside your lane bears on the answer.',
    lane: 'ask-nova',
    canConsult: true,
    ask: (vaultPath, q, o) => askNova(vaultPath, q, o),
  },
  coach: {
    label: 'the Coach',
    what: 'his strength and conditioning coach: his program, every logged session, recovery, nutrition and Fuel, injuries and goals. Ask it anything about training, recovery or food.',
    lane: 'coach',
    canConsult: true,
    ask: (vaultPath, q, o) => askCoach(vaultPath, q, o),
  },
  leader: {
    label: 'the Leader',
    what: 'his leadership development partner: how he leads people at work, his open struggles and wins, and the leadership concepts and sources in his vault. Ask it when work, people or leading bear on the answer.',
    lane: 'leader-chat',
    canConsult: true,
    ask: (vaultPath, q, o) => askLeader(vaultPath, q, o),
  },
  researcher: {
    label: 'the Researcher',
    what: 'reads the published evidence on the web, cross-checks it and returns a cited brief (the brief also lands in his Inbox). Ask it whenever outside evidence should decide the answer. Takes a few minutes.',
    lane: 'researcher',
    canConsult: true,
    // an ask that outlasts a hands-free line (Siri holds ~110 s): the lane
    // answers at once with a code-written interim and lands the synthesis in
    // his thread when it is done (lib/handsFree.js)
    slow: true,
    ask: (vaultPath, q, o) => askResearcher(vaultPath, q, o),
  },
  librarian: {
    label: 'the Librarian',
    what: 'searches his library, read-only: every book, podcast, video and article he has stored, their concepts, highlights and transcripts, and the Repertoire, and answers citing the note paths it read. Ask it to retrieve what a book or source he holds says about something.',
    lane: 'librarian-ask',
    canConsult: true,
    ask: (vaultPath, q, o) => askLibrarian(vaultPath, q, o),
  },
  calendar: {
    label: 'your calendar',
    what: 'his actual calendar for the next 14 days: when he trains, what else is booked. Read by code; any question returns the fortnight.',
    lane: null,
    canConsult: false,
    code: true,
    ask: () => askCalendar(),
  },
};

// Everyone an agent may ask: everyone but itself and whoever is waiting on it.
export function consultableBy(from, { chain = [] } = {}) {
  const blocked = new Set([from, ...chain].filter(Boolean));
  return Object.keys(AGENTS).filter((id) => !blocked.has(id));
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const labelOf = (id) => AGENTS[id]?.label || id;

function listWords(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// THE ONE CAPABILITY PARAGRAPH every reasoning agent carries, generated from
// the registry so an agent can only ever be told about agents that exist and
// that it is allowed to ask.
export function consultCapability(from, { chain = [], handsFree = false } = {}) {
  const ids = consultableBy(from, { chain });
  const who = ids.map((id) => `"${id}" (${AGENTS[id].label}): ${AGENTS[id].what}`).join('\n    ');
  const example = ids.filter((id) => !AGENTS[id].code).slice(0, 2).map((id) => `{"agent":"${id}","question":"<tight, specific>"}`).join(',');
  const waiting = chain.filter((id) => id && id !== from);
  const waitingNote = waiting.length
    ? `\n  ${cap(listWords(waiting.map(labelOf)))} ${waiting.length === 1 ? 'is' : 'are'} waiting on your answer, so cannot be asked from here: if you need something from them, say so in your answer.`
    : '';
  // Hands-free, he is waiting on one spoken line. His call, 30 Sep: "Let nova
  // always ask the researcher." Code, not the model, tells him a slow ask is
  // under way and where its answer will land, so nothing here limits whom she
  // may ask.
  const handsFreeNote = handsFree
    ? '\n  Hands-free, he is waiting on one spoken line: ask whoever the answer needs, the Researcher included. When an ask takes longer than he can hold the line, code tells him who is working and where the answer will land; never say that yourself.'
    : '';
  return `- CONSULT THE OTHER AGENTS. Nothing is walled off: when another agent's knowledge would make your answer materially better, ask them, one or several at once. Instead of your answer (whatever form it normally takes), reply with ONLY this line, EXACTLY this JSON form:
  CONSULT {"asks":[${example}]}
  Who you can ask:
    ${who}
  Write nothing else in that reply: code tells him who you asked, from the line itself, so never name them yourself. Their answers come back to you in this conversation. Ask again (a follow-up, or someone new to settle something for all of you) only if their answers raise a genuinely new question; then give your full answer, built on theirs, and say whose input shaped it. Never answer and consult in the same reply, and do not consult for something you can answer well yourself. Whom to ask is decided by what the answer needs, never by the words used to ask it.${waitingNote}${handsFreeNote}`;
}

// The same, as one line for a resumed turn's bracketed reminder (it must stay
// inside that ONE paragraph: agentSessions.cleanTurnText drops plumbing by
// paragraph).
export function consultReminder(from, { chain = [] } = {}) {
  const ids = consultableBy(from, { chain });
  return `CONSULT any other agent when a question deserves it: reply with ONLY one line CONSULT {"asks":[{"agent":"<${ids.join('|')}>","question":"…"}]}; code tells him who you asked. Their answers come back to you; then answer in full and say whose input shaped it.`;
}

const CONSULT_LINE = /(^|\n)[ \t]*CONSULT[ \t]*(\{[\s\S]*\})[ \t]*$/;

// Pull a CONSULT line off the end of a reply. Returns null when there is none
// or it names nothing this agent may ask; otherwise the text before it and
// the asks. `from` and `chain` apply the loop guard's who-may-ask rule.
export function parseConsult(text, { from = null, chain = [] } = {}) {
  const m = String(text || '').match(CONSULT_LINE);
  if (!m) return null;
  let parsed;
  try { parsed = JSON.parse(m[2]); } catch { return null; }
  const raw = Array.isArray(parsed?.asks) ? parsed.asks : [];
  const allowed = new Set(consultableBy(from, { chain }));
  const seen = new Set();
  const asks = [];
  for (const a of raw) {
    const agent = typeof a?.agent === 'string' ? a.agent.trim().toLowerCase() : '';
    const question = typeof a?.question === 'string' ? a.question.trim().slice(0, 500) : '';
    if (!AGENTS[agent] || !allowed.has(agent) || !question) continue;
    const key = askKey(agent, question);
    if (seen.has(key)) continue;
    seen.add(key);
    asks.push({ agent, question, label: AGENTS[agent].label });
  }
  if (!asks.length) return null;
  return { cleanText: String(text).slice(0, m.index + (m[1] ? m[1].length : 0)).trim(), asks };
}

const askKey = (agent, question) => `${agent}|${String(question).toLowerCase().replace(/\s+/g, ' ').trim()}`;

// THE HAND-OVER, written by code from the parsed asks, never by the model:
// "Asking the Coach." / "Asking the Coach, the Librarian and the Researcher."
// A code-read source (the calendar) is checked, not asked.
export function handoverLine(asks) {
  const ids = [];
  for (const a of asks || []) if (a?.agent && !ids.includes(a.agent)) ids.push(a.agent);
  const asked = ids.filter((id) => !AGENTS[id]?.code).map(labelOf);
  const checked = ids.filter((id) => AGENTS[id]?.code).map(labelOf);
  if (!asked.length && !checked.length) return '';
  if (!asked.length) return `Checking ${listWords(checked)}.`;
  return `Asking ${listWords(asked)}${checked.length ? `, and checking ${listWords(checked)}` : ''}.`;
}

// What he sees in the bubble while the agents work (the Coach's classic
// screen) — who is being asked, about what, and who has answered.
export function consultProgress(lead, asks) {
  const lines = asks.map((a) => {
    const state = a.state === 'done' ? 'answered' : a.state === 'failed' ? `could not answer (${a.error || 'no reason given'})` : 'working on it';
    return `· ${cap(a.label)}: ${state}. Asked: ${a.question}`;
  });
  return `${lead ? `${lead}\n\n` : ''}Asking now:\n${lines.join('\n')}`;
}

// NAME THE SOURCE. His words, 30 Sep 2026: not "your book says"; the source
// is named ("Stronger Slowly, chapter 4", the note's title). Every synthesis
// carries this rule, and code puts the titles it holds beside each answer.
export const SOURCE_RULE = 'Name every source by its title ("Stronger Slowly, chapter 4", the note\'s title, the study\'s title), never "your book", "the study", "a source" or "research shows".';

// A Coach asked by another agent may file program cards (30 Sep, his call:
// "Coach can file cards directly but I want duplicates to be avoided"), and
// code says so at the foot of its answer. The one who asked must not file the
// same change again.
export const coachCardRule = (tell = 'him') => `If the Coach filed a card, found one already waiting, or replaced a waiting card with a new one (code says so at the end of its answer), tell ${tell} it is waiting on his call on the Coach tab, and say which card it replaced; if code says a change is Done, it is already on his program on his own word, with its Undo in the Inbox, so say that instead; and do not PROPOSE the same change yourself.`;

// The titles code holds for an answer: the Librarian's checked citations,
// the Researcher's numbered sources. Plain words, or '' when there are none.
export function sourceTitlesLine(r) {
  const titles = [];
  for (const c of r?.citations || []) if (c?.exists && c.title) titles.push(`"${c.title}" (${c.path})`);
  for (const s of r?.sources || []) if (s?.title) titles.push(`[${s.n}] "${s.title}"`);
  return titles.length ? `Its sources, by title: ${titles.join('; ')}.` : '';
}

// The message that carries the answers back into the asking conversation.
// The Coach's wording is its own (its answers become program cards); every
// other agent talking to him synthesises; a consulted agent answers whoever
// asked it.
export function consultReplyText(results, question, { from = 'coach', answeringTo = null } = {}) {
  const blocks = results.map((r) => {
    if (!r.ok) return `${r.label.toUpperCase()} COULD NOT ANSWER (you asked: ${r.question}): ${r.error}. Say so plainly if it matters to the answer.`;
    const titles = sourceTitlesLine(r);
    return `FROM ${r.label.toUpperCase()} (you asked: ${r.question}):\n${r.answer}${titles ? `\n${titles}` : ''}`;
  });
  let head;
  if (answeringTo) {
    head = `[The agents you consulted have answered. Now give ${labelOf(answeringTo)} your full answer to what it asked you, built on what they found, and name whose input shaped it. ${SOURCE_RULE} ${coachCardRule(labelOf(answeringTo))} Consult again only if their answers raise a genuinely new question.]`;
  } else if (from === 'coach') {
    head = `[The agents you consulted have answered. Now give Hayden your full answer to his question, built on what they found. Name whose input shaped it — "the Researcher's review of…", "your calendar shows…". ${SOURCE_RULE} If the Researcher answered, tell him its cited brief is in his Inbox. Then PROPOSE every concrete program change you recommend — one PROPOSE line per change (reorder, schedule, remove, targets, swap…), as suggestions he approves, not instructed — so each lands as a card he can say yes to. Do not consult again unless their answers raise a genuinely new question.]`;
  } else {
    head = `[The agents you consulted have answered. Now give Hayden your answer, built on what they found: the synthesis, in your own voice, not a relay of each. Name whose input shaped it ("the Coach's view is…", "the Librarian found…"). ${SOURCE_RULE} Where they disagree, say so and say which you would act on. If the Researcher answered, tell him its cited brief is in his Inbox. ${coachCardRule()} Consult again only if their answers raise a genuinely new question; you may ask someone new to settle something for all of you.]`;
  }
  return `${head}\n\nHis question was: ${question}\n\n${blocks.join('\n\n')}`;
}

// Run every ask in parallel, each through its own lane. `onUpdate` fires as
// each one settles. `roster` (the job's structured state) gets one entry per
// ask the moment it is asked. `deps` overrides an agent's `ask` (tests).
// `ledger` is the turn's memory of what was already asked: a repeat is
// answered from it and never re-run.
export async function runConsults(vaultPath, asks, {
  question = '', onUpdate, deps, from = 'coach', chain = [], ledger = null, roster = null, round = 1,
} = {}) {
  const d = deps || testDeps || {};
  const nextChain = [...chain.filter((id) => id !== from), from].filter(Boolean);
  const state = asks.map((a) => {
    const entry = {
      agent: a.agent, label: a.label || labelOf(a.agent), question: a.question, round,
      askedAt: new Date().toISOString(), settledAt: null, ok: null, ms: null, answer: null, recordId: null,
      state: 'asking',
    };
    if (Array.isArray(roster)) roster.push(entry);
    return entry;
  });
  onUpdate?.(state);
  const results = await Promise.all(state.map(async (a) => {
    const t0 = Date.now();
    const key = askKey(a.agent, a.question);
    let pending = ledger?.get(key);
    if (pending) {
      a.repeat = true;
    } else {
      const run = d[a.agent]
        ? d[a.agent]
        : (q, o) => AGENTS[a.agent].ask(vaultPath, q, o);
      // called synchronously, so every ask is under way before any settles
      try {
        pending = Promise.resolve(run(a.question, { context: consultedContext(from, question), from, question, chain: nextChain, ledger }));
      } catch (e) {
        pending = Promise.reject(e);
      }
      pending.catch(() => {});
      ledger?.set(key, pending);
    }
    try {
      const out = await pending;
      const answer = String(out?.text ?? out ?? '').trim() || '(an empty answer)';
      Object.assign(a, {
        state: 'done', ok: true, answer, recordId: out?.recordId || null,
        settledAt: new Date().toISOString(), ms: Date.now() - t0,
        ...(Array.isArray(out?.consult) && out.consult.length ? { asks: out.consult } : {}),
        ...(Array.isArray(out?.citations) ? { citations: out.citations } : {}),
        ...(Array.isArray(out?.sources) && out.sources.length ? { sources: out.sources } : {}),
        // a consulted Coach's cards: what it filed, and what was already
        // waiting on his call (never filed twice)
        ...(Array.isArray(out?.cards) && out.cards.length ? { cards: out.cards, ...(out.cards.some((c) => c.state === 'waiting') ? { note: 'already waiting on your call' } : {}) } : {}),
      });
      onUpdate?.(state);
      return { agent: a.agent, label: a.label, question: a.question, ok: true, answer, recordId: a.recordId, citations: a.citations, sources: a.sources, cards: a.cards };
    } catch (e) {
      Object.assign(a, { state: 'failed', ok: false, error: e?.message || String(e), settledAt: new Date().toISOString(), ms: Date.now() - t0 });
      onUpdate?.(state);
      return { agent: a.agent, label: a.label, question: a.question, ok: false, error: a.error };
    }
  }));
  return results;
}

// Tests only: stand-in lanes for every consult in the process, so a lane's
// own loop (Nova's warm turn, the Librarian's one-shot) can be exercised
// without spawning the other agents. Never set outside a test.
let testDeps = null;
export function _setConsultDepsForTest(deps) { testDeps = deps || null; }

// A roster entry trimmed for the conversation record: who, what, how long,
// whether it answered, and the answer (bounded as a stored row is).
export function trimForRecord(roster) {
  if (!Array.isArray(roster) || !roster.length) return null;
  return roster.map((a) => ({
    agent: a.agent,
    question: String(a.question || '').slice(0, 500),
    ms: Number.isFinite(a.ms) ? a.ms : null,
    ok: a.ok === true,
    answer: a.ok ? String(a.answer || '').slice(0, 4000) : String(a.error || 'no answer').slice(0, 500),
  }));
}

// ONE TURN'S CONSULTS, for any lane. The lane keeps its own loop (warm
// conversation, one-shot resume, the research merge); this carries the state
// that must be the same everywhere: the rounds, the roster on the job, the
// ledger, the code-written hand-over.
export const GUARD_NOTE = "(I had more I wanted to check, but I've asked twice already, so this is my answer from what the agents gave me.)";
export const ANSWER_NOW = '[You have consulted as many times as one turn allows. Do not consult again: answer now, from what the agents gave you, and say plainly what is still open.]';

export function openConsult({
  from, question = '', vaultPath, job = null, chain = [], ledger = null, deps, progress = false, answeringTo = null, onRoster,
} = {}) {
  const book = ledger || new Map();
  if (job && !Array.isArray(job.consult)) job.consult = [];
  const roster = job ? job.consult : [];
  const ctl = {
    rounds: 0,
    nudged: false,
    roster,
    ledger: book,
    chain,
    parse(text) { return parseConsult(text, { from, chain }); },
    get exhausted() { return ctl.rounds >= MAX_CONSULT_ROUNDS; },
    handover() { return handoverLine(roster); },
    async run(consult) {
      ctl.rounds += 1;
      const show = (asks) => {
        const lead = handoverLine([...roster]);
        if (job) {
          // the hand-over stays at the top of everything streamed after it
          job.partialPrefix = lead ? `${lead}\n\n` : '';
          job.partial = progress ? consultProgress(lead, asks) : lead;
        }
        try { onRoster?.(roster); } catch { /* a watcher never sinks the turn */ }
      };
      const results = await runConsults(vaultPath, consult.asks, {
        question, from, chain, ledger: book, deps, roster, round: ctl.rounds, onUpdate: show,
      });
      return { results, replyText: consultReplyText(results, question, { from, answeringTo }) };
    },
    // the reply he reads opens with the code-written line of who was asked
    finalText(text) {
      const lead = handoverLine(roster);
      if (!lead) return text;
      const body = String(text || '').trim();
      return body.startsWith(lead) ? body : `${lead}${body ? `\n\n${body}` : ''}`;
    },
    trimmed() { return trimForRecord(roster); },
  };
  return ctl;
}

// What a consulted agent is told about who is asking and why. A LEADING
// BRACKETED PARAGRAPH on purpose: agentSessions.cleanTurnText drops it, and
// the lanes put it where "Hayden asks" would otherwise be.
//
// `canPropose`: the Coach, asked by anyone, may file program cards through
// its own checked pipeline (his call, 30 Sep 2026: "Coach can file cards
// directly but I want duplicates to be avoided"). Every card waits for HIS
// yes, whoever asked; code refuses a twin and says so under the answer.
//
// HIS OWN WORDS ARE HIS INSTRUCTION, ON EVERY DOOR (his call, 1 Oct 2026:
// "Yes, own words to Nova count as the instruction, so the change applies on
// my standing grant as it does in the Coach chat"; widened 3 Oct 2026: "my
// own words in the Leader chat or the Coach tab count the same way when those
// agents consult the Coach. It's just a difference in who I am directly
// talking to."). When the question travelling with the consult is what he
// himself said to the asking agent (heldHisWords, marked by the door he spoke
// through), whoever that agent is, the Coach is shown it verbatim and may
// mark "instructed" exactly as in its own chat; code then judges it the same
// way (coachProposals.settleCoachChanges). Any other consulted agent is told
// the words are his, so it answers what he actually said.
export function consultedBrief(by, parentQuestion = '', { canPropose = false } = {}) {
  const who = labelOf(by);
  const held = heldHisWords(parentQuestion);
  const his = canPropose && held;
  // his words verbatim, without the machine's leading [bracketed] context
  // (whitespace folded: this brief must stay ONE paragraph)
  const q = held
    ? spokenPart(parentQuestion).replace(/\s+/g, ' ').trim().slice(0, 2000)
    : String(parentQuestion || '').trim().slice(0, 600);
  const once = 'a change already waiting on his call is never filed twice, and a new change to the same lift, of the same kind, with different numbers replaces the card that was waiting';
  const writes = his
    ? `You may file program changes: end with PROPOSE lines exactly as your rules say; code checks every one. The words quoted above are HIS OWN, said to ${who}: mark a PROPOSE line "instructed":true only when those words ask for exactly that change, and code applies it on his standing grant with the same checks and Undo as in your own chat. Anything you recommend beyond what he asked is a suggestion that waits for his yes, and ${who}'s question to you is never his instruction. ${cap(once)}. Never say a change is done, filed or waiting; code says what happened at the end of your answer. Nothing else is written anywhere: no documents, and no ACT, REFLECT, RESEARCH, WATCH, PLAY, SHOW, CARD or VIS lines.`
    : canPropose
      ? `You may file program changes: when a change to his program would help, end with PROPOSE lines exactly as your rules say; code checks every one and files it as a card for HIS yes (never "instructed": ${who} asking is not him instructing); ${once}. Never say a card is filed or waiting; code says what happened at the end of your answer. Nothing else is written anywhere: no documents, and no ACT, REFLECT, RESEARCH, WATCH, PLAY, SHOW, CARD or VIS lines.`
      : `Nothing in this answer is written anywhere: no documents, and no PROPOSE, ACT, REFLECT, RESEARCH, WATCH, PLAY, SHOW, CARD or VIS lines. Say any change you would recommend in plain words; ${who} decides what happens next.`;
  const asking = held
    ? `, because of what Hayden said to ${by === 'nova' ? 'her' : who}, in his own words: "${q}"`
    : q ? `, to help answer Hayden's question: "${q}"` : '';
  return `[${cap(who)} is consulting you${asking}. Answer ${who}, not Hayden: directly and completely (the length rules for talking to him do not apply; ${who} needs substance), grounded in what you hold, and say plainly what you do not know. ${SOURCE_RULE} ${writes}]`;
}

// WHAT HE SAID, verbatim, held while the turn it started can still consult.
// Marked by every door where HE types or speaks to an agent directly: Nova
// (the app's Ask, Siri and the Action Button, Telegram), the Leader chat, the
// Coach tab, and the Coach or Leader answering him from Nova's own door
// (3 Oct 2026: "his words count on every door"). Never by a code-written
// ritual or plan step. The mark is the exact string the door hands the agent's
// turn as its question, because that is the string its consults carry. Code checks a consult's question against it: the same string
// that travels as the consulted Coach's question (consult.runConsults hands
// Nova's own question on unchanged), so an agent's rewording of his words is
// never mistaken for them. Bounded, and it forgets after a day.
const HIS_WORDS_TTL_MS = 24 * 60 * 60_000;
const HIS_WORDS_MAX = 50;
const hisWords = new Map(); // question → when he said it
export function markHisWords(question, { now = Date.now() } = {}) {
  const q = String(question || '');
  if (!spokenPart(q)) return; // nothing of his in it: no words to hold
  hisWords.delete(q);
  hisWords.set(q, now);
  while (hisWords.size > HIS_WORDS_MAX) hisWords.delete(hisWords.keys().next().value);
}
export function heldHisWords(question, { now = Date.now() } = {}) {
  const q = String(question || '');
  const at = hisWords.get(q);
  if (at == null) return false;
  if (now - at > HIS_WORDS_TTL_MS) { hisWords.delete(q); return false; }
  return true;
}
export function _clearHisWordsForTest() { hisWords.clear(); }
// His words alone: the same rule as coach.hisWordsOf (kept here so this
// module stays import-free; the consult test pins the two together).
export function spokenPart(question) {
  return String(question || '').replace(/^\s*(?:(?:\[[\s\S]*?\]|LIVE UPDATE \(recomputed[^\n]*)\s*)+/, '').trim();
}

// The Researcher's numbered sources, by title, from its brief's "## Sources"
// list ("[1] Schoenfeld et al. 2017, Dose-response… https://…"), so whoever
// asked can name the study rather than "the research". Pure.
export function researchSources(body) {
  const text = String(body || '');
  const at = text.search(/^\s*#{0,3}\s*sources\b/im);
  if (at < 0) return [];
  const out = [];
  for (const line of text.slice(at).split('\n')) {
    const m = line.match(/^\s*(?:[-*]\s*)?(?:\[(\d+)\]|(\d+)[.)])\s*(.*)$/);
    if (!m) continue;
    const rest = m[3];
    const url = (rest.match(/https?:\/\/[^\s)>\]]+/) || [null])[0];
    const title = rest
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
      .replace(/<?https?:\/\/\S+>?/g, '')
      .replace(/[*_`]/g, '')
      .replace(/[\s:—–,.-]+$/, '')
      .trim()
      .slice(0, 200);
    if (title) out.push({ n: Number(m[1] || m[2]), title, url });
  }
  return out;
}

// Context handed to the Researcher's MATERIAL channel when it is asked.
function consultedContext(from, question) {
  const q = String(question || '').trim().slice(0, 600);
  return `${cap(labelOf(from))} is asking this${q ? ` while answering Hayden's question: "${q}"` : ''}.`;
}

// Directive lines a consulted answer must not carry to the one who asked:
// it writes nothing, so a stray PROPOSE is noise, never an action. A document
// block is unwrapped rather than filed: its content is the answer.
const DIRECTIVE_LINE = /^[ \t]*(PROPOSE|ACT|REFLECT|SHOW|CARD|RESEARCH|WATCH|PLAY|WITHDRAW|CONSULT|VIS)[ \t]*\{.*$/gm;
const DOC_MARKER = /^[ \t]*(<<<ARTIFACT\b.*|ARTIFACT>>>[ \t]*)$/gm;
export function stripDirectives(text) {
  return String(text || '').replace(DIRECTIVE_LINE, '').replace(DOC_MARKER, '').replace(/\n{3,}/g, '\n\n').trim();
}

// A consulted Coach's reply before its PROPOSE lines are read: a document's
// body is unwrapped into the answer with every directive inside it removed,
// so a PROPOSE quoted in a plan it wrote is never taken for a card (the rule
// fileArtifacts-before-settleCoachChanges keeps for his own chat).
const DOC_BLOCK = /^[ \t]*<<<ARTIFACT\b.*$([\s\S]*?)^[ \t]*ARTIFACT>>>[ \t]*$/gm;
export function unwrapDocuments(text) {
  return String(text || '').replace(DOC_BLOCK, (_, body) => body.replace(DIRECTIVE_LINE, '')).replace(DOC_MARKER, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ------------------------------ the lanes ---------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait on a job in the shared claude-code jobs map. No timeout: his rule.
async function waitForJob(jobId, who) {
  const { getMessageJob } = await import('./claudeCode.js');
  for (;;) {
    await sleep(1200);
    const job = getMessageJob(jobId);
    if (!job) throw new Error(`${who} lost the question`);
    if (job.status === 'ready') return job;
    if (job.status === 'error') throw new Error(job.error || `${who} could not answer`);
  }
}

const consultedOpts = (o = {}) => ({ by: o.from, question: o.question || '', chain: o.chain || [], ledger: o.ledger || null });

// Nova's own read-only lane over the whole vault, with her live context, in a
// fresh session so his Voice conversation is untouched.
async function askNova(vaultPath, q, o = {}) {
  const { startAskNova } = await import('./claudeCode.js');
  let context = '';
  try {
    const { buildAskContext } = await import('./askContext.js');
    context = await buildAskContext(vaultPath, null, { fast: true });
  } catch { /* she reads the vault herself; the absence is named in her prompt */ }
  const jobId = startAskNova(vaultPath, { question: q, context, consulted: consultedOpts(o) });
  const job = await waitForJob(jobId, 'Nova');
  return { text: job.result?.text || '', consult: job.result?.consult || null };
}

// The Coach's own turn: its full assembled picture, its model, a fresh session.
async function askCoach(vaultPath, q, o = {}) {
  const { startCoachTurn } = await import('./coachTurn.js');
  const jobId = await startCoachTurn(vaultPath, { question: q, sessionId: null, consulted: consultedOpts(o) });
  const job = await waitForJob(jobId, 'the Coach');
  // its cards (filed, or already waiting on his call) ride on the roster
  return { text: job.result?.text || '', consult: job.result?.consult || null, cards: job.result?.cards || null };
}

// The Leader's own turn: its chat context, its model, a fresh session.
async function askLeader(vaultPath, q, o = {}) {
  const { startAskLeader } = await import('./claudeCode.js');
  const { buildLeaderChatContext } = await import('./leader.js');
  const context = await buildLeaderChatContext(vaultPath);
  const jobId = startAskLeader(vaultPath, { question: q, context, sessionId: null, consulted: consultedOpts(o) });
  const job = await waitForJob(jobId, 'the Leader');
  return { text: job.result?.text || '', consult: job.result?.consult || null };
}

// The Researcher's own lane: the panel, the citation gate, the Inbox record,
// the model he chose for it. Wait on the record it creates.
async function askResearcher(vaultPath, q, o = {}) {
  const { startResearch } = await import('./researcher.js');
  const { getRecord } = await import('./inboxStore.js');
  const record = await startResearch(vaultPath, q, { context: o.context || '', consult: { chain: o.chain || [], ledger: o.ledger || null } });
  for (;;) {
    await sleep(3000);
    const r = await getRecord(record.id);
    if (!r) throw new Error('the research record disappeared');
    if (r.status === 'classifying') continue;
    if (r.status === 'error') throw new Error(r.error || 'the research failed');
    const body = r.decision?.payload?.body;
    if (!body) throw new Error('the research finished without a brief');
    // the brief's own title and its sources' titles travel with it, so the
    // synthesis can name them (his 30 Sep rule: never "the study")
    const title = r.decision?.payload?.title || r.decision?.title || '';
    return { text: title ? `Brief: "${title}"\n\n${body}` : body, recordId: r.id, sources: researchSources(body), consult: Array.isArray(r.consult) ? r.consult : null };
  }
}

// The Librarian's read-only question lane over his library.
async function askLibrarian(vaultPath, q, o = {}) {
  const { runLibrarianAsk } = await import('./librarianAsk.js');
  return runLibrarianAsk(vaultPath, q, { from: o.from, question: o.question || '', chain: o.chain || [], ledger: o.ledger || null });
}

// Code reads the calendar; no model is needed to list what is booked.
async function askCalendar() {
  const { fetchEventsForRange } = await import('./calendar.js');
  const events = await fetchEventsForRange(14);
  return { text: formatFortnight(events) };
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
