// THE PANEL — several named researchers on one question, then one brief.
//
// 18 Sep 2026. Buildpad's demo runs four named researchers at once (Social
// Media, Competitor, Audience Pain Points, Demand Signals), shows each one's
// sources piling up, and ends on a single call. He asked for the same: "happy
// for extra agents to complete parallel research that'll lead to better
// results and answers and data".
//
// WHY THIS IS MORE THAN FOUR COPIES OF THE SAME AGENT. One researcher asked a
// broad question does one search pass and writes what it found — and what it
// found is shaped by the first few results it happened to read. Four
// researchers with DIFFERENT briefs cannot collapse into the same search:
// the one told to find disagreement goes looking for disagreement, and its
// findings survive into the brief even when the other three agree. That is
// the actual gain, and it is why the angles are named rather than numbered.
//
// THE ANGLES ARE CHOSEN FOR THE QUESTION, not fixed. Buildpad can hard-code
// four market-research roles because it only does market research. Nova is
// asked about creatine, leadership, training blocks and papers, so a planner
// names the panel for the question in hand — and when the planner fails,
// FALLBACK_PANEL is four angles that apply to any question at all. An honest
// degradation, not a dead end.
//
// EVERYTHING PURE LIVES HERE. The prompts, the parsing, the validation and
// the merge rules are all decisions that must not drift, and none of them
// need a child process to test. researcher.js does the spawning.

// What every brief owes him, panel or not. Exported because the single-agent
// path and the synthesis path MUST say the same thing — a shared format is a
// contract, and two copies of these rules would drift the first time one was
// edited. (CLAUDE.md: change every reader/writer, or none.)
export const BRIEF_RULES = `- EVERY factual claim carries a numbered citation like [1], and the Sources section lists each number with title and URL. No citation → don't claim it.
- Prefer primary and reputable sources; note disagreement between sources honestly instead of averaging it away.
- Say what you could NOT establish. An honest gap beats a confident guess.
- Keep it tight: a 2-3 sentence summary, then 3-6 key points, then the sources list. ~250-400 words total.
- This files into the vault as a note for review — write it timelessly (dates absolute, no "recently").`;

export const DECISION_RULES = `WHEN THE QUESTION IMPLIES A DECISION — should he do this, is it worth it, which
of these, is this true enough to act on — the summary LEADS with your answer, in
one sentence, before any evidence. The answer may be no. "The evidence does not
support this", "not worth your time", "this is the wrong question" are real
findings and you are expected to say them plainly when the research says so. A
balanced survey handed to someone who asked for a call is a non-answer.

AND IF YOUR ANSWER IS NO, LEAVE THE ARGUMENT OPEN. He is allowed to disagree,
and a "no" he cannot interrogate is one he can only obey or ignore. So a
negative answer carries, after the key points and before the sources, a short
section headed "## If you want to argue" with:
- **The best case against me** — the strongest honest argument for doing it
  anyway, put properly rather than as a straw man. If there is a real one, it
  goes here even though it weakens your conclusion.
- **What would change my mind** — the specific evidence, result or condition
  that would flip the answer, concrete enough to actually go and check.
- **How confident** — how firm this is, and which part of it is softest.
Do not add this section when your answer is yes or when the question asked for
no decision; it is the price of saying no, not a ritual.`;

// Two is not a panel and five is a bill. Four is what the reel ran and what a
// question of his actually splits into without the angles overlapping.
export const MIN_WORKERS = 2;
export const MAX_WORKERS = 4;

// A NAME HE WILL READ IN THE JOB TRAY, so it is short and says what the worker
// is for. The tray row is ~30 characters wide on his phone before it ellipses.
export const MAX_NAME = 34;

// When the planner cannot be reached or answers nonsense. These four split
// almost any question without overlapping, and the third exists because it is
// the one a single researcher reliably skips.
export const FALLBACK_PANEL = [
  { name: 'Direct evidence', brief: 'The strongest primary sources that answer the question head on — studies, documentation, official statements. What does the best available evidence actually say?' },
  { name: 'The case against', brief: 'Deliberately look for disagreement, failed replications, criticism, and the strongest argument AGAINST the obvious answer. Do not soften what you find.' },
  { name: 'In practice', brief: 'How this plays out for a real person doing it — practitioner accounts, common failure modes, what people who tried it report, and what it costs in time or money.' },
  { name: 'What is current', brief: 'The most recent credible material, and whether anything has changed the picture. Note publication dates explicitly and flag anything superseded.' },
];

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// A NAME CUT MID-WORD LOOKS BROKEN, not abbreviated. The first real planner
// run produced "Individual Variability & Side Effects", which a hard slice
// left as "Individual Variability & Side Effe" in the job tray. Back up to
// the last space when there is one worth backing up to, and drop a trailing
// connective so it never ends on "&" or "and".
function clipName(s) {
  if (s.length <= MAX_NAME) return s;
  const cut = s.slice(0, MAX_NAME);
  const sp = cut.lastIndexOf(' ');
  const out = sp > MAX_NAME * 0.55 ? cut.slice(0, sp) : cut;
  return out.replace(/[\s&,+/-]+$/, '').replace(/\s+(and|or|the|of|in|for|with)$/i, '');
}

export function buildPlannerPrompt(question) {
  return `Hayden asked Nova this research question:

${question}

Name the ${MIN_WORKERS}-${MAX_WORKERS} research angles that would, TOGETHER, answer it best. Each angle becomes one researcher working in parallel with web search.

Rules:
- The angles must not overlap. If two would run the same searches, they are one angle.
- At least one angle must look for disagreement, counter-evidence or the strongest case against the obvious answer. A panel that only confirms is a panel that wastes his money.
- Name each angle for what it investigates, in 1-4 words. The name is shown to him while it runs, so "Counter-evidence" and "Long-term safety data", never "Researcher 2".
- The brief is one or two sentences telling that researcher what to go and find.

Output ONLY a JSON array, no commentary:
[{"name":"Short Name","brief":"what this researcher should find"}]`;
}

// Whatever the planner said → a panel we are willing to spawn, or null. Never
// throws: a planner that returns prose instead of JSON is a fallback, not an
// error, and the caller has FALLBACK_PANEL ready.
export function parsePanel(value) {
  let arr = value;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return null; }
  }
  if (!Array.isArray(arr)) return null;
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const name = clipName(clean(raw.name));
    const brief = clean(raw.brief);
    if (!name || !brief) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;            // two workers with one name is one worker
    seen.add(key);
    out.push({ name, brief });
    if (out.length === MAX_WORKERS) break;
  }
  return out.length >= MIN_WORKERS ? out : null;
}

export function buildWorkerPrompt(question, worker, context = '') {
  const material = clean(context);
  return `You are one of several researchers Nova is running in parallel on the same question. Another agent will merge everyone's findings into a single brief — so your job is to FIND, not to conclude.

The overall question: ${question}

YOUR ANGLE — ${worker.name}: ${worker.brief}

Stay on your angle. The other researchers are covering theirs, and a brief that repeats what they are already doing is money spent twice. Use web search.

Rules:
- Report what you found, not what you expected. If your angle turns up nothing, say so plainly — "no credible evidence found for X" is a genuinely useful finding and the merge needs it.
- EVERY finding carries the URL it came from. A finding with no URL is dropped by the merge, so it is wasted work.
- Note publication dates where they matter, and say when a source is weak, old, promotional or a single anecdote.
- Do not write a polished brief and do not reach a verdict — findings only, 4-8 of them.
${material ? `
MATERIAL FROM AN EARLIER AGENT — this is what the question refers to. Check THESE claims rather than going looking for a different list:
${material.slice(0, 8000)}
` : ''}
Output ONLY a JSON object, no commentary:
{"findings":[{"claim":"what you found","url":"https://…","note":"how solid this is"}]}`;
}

// A worker's raw output → findings we can hand to the merge. Findings without
// a URL are dropped HERE rather than at the citation gate, because the gate
// rejects the whole brief and this only loses the one unusable line.
export function parseFindings(value) {
  let obj = value;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return []; }
  }
  const list = Array.isArray(obj) ? obj : (Array.isArray(obj?.findings) ? obj.findings : []);
  const out = [];
  for (const f of list) {
    if (!f || typeof f !== 'object') continue;
    const claim = clean(f.claim);
    const url = clean(f.url);
    if (!claim || !/^https?:\/\//i.test(url)) continue;
    out.push({ claim, url, note: clean(f.note) });
  }
  return out;
}

// The synthesis. It gets the findings and NOT the web: the sources are already
// chosen, and a merge that goes searching on its own is a fifth researcher
// nobody budgeted for and whose sources no angle vouched for.
export function buildSynthesisPrompt(question, reports, context = '') {
  const material = clean(context);
  const body = reports.map((r) => {
    if (r.error) return `### ${r.name}\nTHIS RESEARCHER FAILED — ${r.error}. Its angle is NOT covered below.`;
    if (!r.findings?.length) return `### ${r.name}\nReturned no usable findings.`;
    return `### ${r.name}\n${r.findings.map((f) => `- ${f.claim}\n  URL: ${f.url}${f.note ? `\n  Note: ${f.note}` : ''}`).join('\n')}`;
  }).join('\n\n');

  const failed = reports.filter((r) => r.error).map((r) => r.name);

  return `You are Nova's Researcher, writing ONE brief for Hayden's second brain (an Obsidian vault) from the work of several researchers who each covered a different angle in parallel.

The question: ${question}

${body}

Rules:
${BRIEF_RULES}
- Merge, do not concatenate. One numbered Sources list for the whole brief; the same URL cited twice gets ONE number.
- Where the angles DISAGREE, that disagreement is the most valuable thing here — say so explicitly rather than picking the more agreeable side or averaging them.
- Use ONLY the URLs above. You have no web access; inventing a source or citing one no researcher reported is the one unrecoverable failure.
- Weigh the findings. A single promotional anecdote and a systematic review are not two sources of equal weight, and the notes tell you which is which.
${failed.length ? `- ${failed.length === 1 ? 'One angle' : `${failed.length} angles`} (${failed.join(', ')}) produced nothing. Say so in the brief — a gap he does not know about is worse than one he does.` : ''}

${DECISION_RULES}
${material ? `
MATERIAL FROM AN EARLIER AGENT, which the question refers to:
${material.slice(0, 8000)}
` : ''}
Output ONLY a JSON object: {"title": "Short Note Title", "body": "the full brief in markdown — summary, key points, ## Sources list"}. No code fences, no commentary.`;
}

// What the tray shows while the panel runs. One row per researcher, named, so
// "Nova is working" says WHO is working — the thing the reel got right.
export function panelProgress(workers) {
  const list = Array.isArray(workers) ? workers : [];
  const back = list.filter((w) => w.status === 'done' || w.status === 'error').length;
  return {
    total: list.length,
    back,
    // "3 of 4 back" is the honest phrase: a researcher that failed HAS
    // reported, and calling it done would hide the gap.
    label: list.length ? `${back} of ${list.length} back` : '',
    workers: list.map((w) => ({ name: w.name, status: w.status, found: w.found || 0 })),
  };
}
