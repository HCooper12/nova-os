// WHAT NOVA CAN ACTUALLY DELEGATE — the machine-readable half of the
// capability picture, and the contract the planner is trusted against.
//
// Three things must never disagree about what exists: the prompt that asks
// Nova to decompose a goal, the validator that decides whether the resulting
// plan may run, and the answer Nova gives when he asks what it can do. This
// file is the one list all three read.
//
// DELIBERATELY SEPARATE FROM skills.js. That file renders a prose page in his
// vault — his to edit, written for a person, describing abilities broadly
// ("watch for program drift"). This one declares DISPATCHABLE LANES with
// inputs, outputs and cost. Merging them would corrupt a page he owns with
// schema he does not care about, and would leave the planner reading prose.
//
// Every id here must be a lane the router can return AND that the intent
// route can dispatch — pinned three ways by capabilities.test.js, because the
// failure mode is Nova confidently planning a step that cannot run.
//
// `costUsd` is the lane's own budget ceiling, read from its module — not a
// guess and not an average. It is what a plan's estimate is built from, so it
// must stay honest: a lane whose ceiling changes and is not updated here
// makes every estimate wrong in the same direction.

export const CAPABILITIES = {
  watch: {
    agent: 'Watcher',
    summary: 'Pull a single video\'s transcript and draft a verdict on what it claims.',
    input: 'one video URL, plus an optional note on what to look for',
    output: 'a transcript and a verdict, filed as a pending record',
    produces: 'watch',
    costUsd: 3.0,
    autonomy: 'propose',
    delegable: true,
  },
  weave: {
    agent: 'Librarian · weave',
    summary: 'Fetch a video\'s transcript and weave every concept and person in it into the vault as draft pages.',
    input: 'one video URL',
    output: 'draft vault pages for review',
    produces: 'ingest',
    costUsd: 25.0,
    autonomy: 'propose',
    // the same $25 ceiling as a book, for the same reason — the whole weave
    // is one long job. His to ask for by name; a plan never reaches for it.
    delegable: false,
  },
  study: {
    agent: 'Study',
    summary: 'Enumerate a creator\'s whole body of work, transcribe what fits the budget, and compare it against Nova\'s own inventory.',
    input: 'a channel or profile URL, or several video URLs',
    output: 'one brief with coverage stated ("transcribed 10 of 37")',
    produces: 'study',
    costUsd: 1.5,
    autonomy: 'propose',
    delegable: true,
  },
  research: {
    agent: 'Researcher',
    summary: 'Answer a question from the open web with citations, or read a link and report what it says.',
    input: 'a question, or a link with an optional instruction',
    output: 'a cited brief, filed as a pending record',
    produces: 'research',
    costUsd: 1.0,
    autonomy: 'propose',
    delegable: true,
  },
  book: {
    agent: 'Librarian',
    summary: 'Research a book and weave its ideas into the vault as draft pages.',
    input: 'a title and an author',
    output: 'draft vault pages for review',
    produces: 'ingest',
    costUsd: 25.0,
    autonomy: 'propose',
    delegable: true,
  },
  coach: {
    agent: 'Coach',
    summary: 'Answer a training or nutrition question with his full logged history, and propose program changes.',
    input: 'a training or nutrition question',
    output: 'an answer in conversation; program edits as proposals',
    produces: 'coach-program',
    costUsd: 1.0,
    autonomy: 'propose',
    // Stays its own agent by his instruction — it holds a long-lived plan it
    // edits and reviews, and has its own cadence and memory of what it has
    // already raised. A planner may CONSULT it; it is not a task runner.
    delegable: false,
  },
  code: {
    agent: 'Claude Code',
    summary: 'Read and change Nova\'s own codebase, with a diff to review before anything commits.',
    input: 'a build, fix or refactor request',
    output: 'a working-tree diff and a session transcript',
    produces: 'code',
    costUsd: 1.5,
    autonomy: 'propose',
    // Changing the platform mid-plan is not a step a planner should take on
    // its own — it is the one lane that can alter the machinery running it.
    delegable: false,
  },
  capture: {
    agent: 'Inbox',
    summary: 'Classify a captured thought and route it to the right vault surface.',
    input: 'a line of text',
    output: 'a filed record on the inbox rails',
    produces: 'capture',
    costUsd: 0.5,
    autonomy: 'act-on-approval',
    delegable: false,
  },
  ask: {
    agent: 'Ask Nova',
    summary: 'Answer a question from the vault, read-only.',
    input: 'a question',
    output: 'an answer in conversation',
    produces: null,
    costUsd: 0.5,
    autonomy: 'observe',
    delegable: false,
  },
  play: {
    agent: 'Nova',
    summary: 'Find a named video and open it playing.',
    input: 'a description of something to watch',
    output: 'a video opened on screen',
    produces: null,
    costUsd: 0.5,
    autonomy: 'observe',
    delegable: false,
  },
};

export const CAPABILITY_IDS = Object.keys(CAPABILITIES);

// The subset a PLAN may name as a step. Everything else is reachable by him
// directly, but not something Nova hands work to on its own.
export const DELEGABLE_IDS = CAPABILITY_IDS.filter((id) => CAPABILITIES[id].delegable);

export function isCapability(id) { return Object.hasOwn(CAPABILITIES, String(id)); }
export function capability(id) { return CAPABILITIES[id] || null; }

// The worst case a plan of these steps could cost. Deliberately a CEILING,
// not an estimate: a number shown to him before he approves must be one that
// cannot be exceeded, or approving it means nothing.
export function ceilingFor(stepIds = []) {
  return stepIds.reduce((sum, id) => sum + (CAPABILITIES[id]?.costUsd || 0), 0);
}

// The block the planner prompt is given. Generated, never hand-written, so
// the planner cannot be told about a capability that does not exist.
export function describeForPlanner() {
  return DELEGABLE_IDS.map((id) => {
    const c = CAPABILITIES[id];
    return `- ${id} (${c.agent}) — ${c.summary}\n    takes: ${c.input}\n    gives: ${c.output}\n    ceiling: $${c.costUsd.toFixed(2)}`;
  }).join('\n');
}

// What he gets when he asks what Nova can do. Same source as the planner's,
// so the two can never drift apart.
export function describeForHim() {
  return CAPABILITY_IDS.map((id) => {
    const c = CAPABILITIES[id];
    return `${c.agent}: ${c.summary}${c.delegable ? '' : ' (yours to ask directly — not something Nova delegates on its own)'}`;
  });
}
