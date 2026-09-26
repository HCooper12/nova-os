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
  // THE ONE LANE THAT WRITES CODE, and the only one that writes outside the
  // vault — into the projects directory he nominated, and nowhere else. It has
  // no shell: it writes source he can run himself. Delegable, because "build me
  // X, then research Y and write it up" is exactly the shape of request that
  // made the planner worth reaching in the first place.
  build: {
    agent: 'Builder',
    summary: 'Build something from a brief — a site, a script, a document — as real files in its own project folder.',
    input: 'a brief saying what to build, and any material it should be built from',
    output: 'a project folder of source, with a README saying how to run it and what it could not do',
    produces: 'build',
    costUsd: 5.0,
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
  repertoire: {
    agent: 'Repertoire',
    summary: 'Read one clip or article for the technique it demonstrates, research the family it belongs to, and build a curriculum taught one a day.',
    input: 'one video or article URL, plus what he wants to get out of it',
    output: 'a confirmed report and an ordered set of techniques with drills, filed as a pending record',
    produces: 'repertoire',
    costUsd: 2.5,
    autonomy: 'propose',
    // His to ask for by name. It ends in a curriculum written to his vault and
    // a daily commitment on Home — not a step a planner should take on its own
    // in the middle of someone else's job.
    delegable: false,
  },
  research: {
    agent: 'Researcher',
    summary: 'Answer a question from the open web with citations, or read a link and report what it says. Runs a panel of four researchers on different angles, then one merge.',
    input: 'a question, or a link with an optional instruction — plus any MATERIAL from earlier steps (his program, a verdict) it should check against',
    output: 'a cited brief, filed as a pending record',
    produces: 'research',
    // THE PANEL'S REAL CEILING, not the single-agent figure it replaced. The
    // 18 Sep fan-out is four workers plus a merge, and this number still said
    // $1.00 — so the plan card on 21 Sep promised "up to US$3.00" for three
    // research steps whose honest worst case was far more. Workers are $1.20
    // each since the same day's measurement (researcher.js), the merge $0.60:
    // 4 × 1.20 + 0.60. A ceiling shown to him before he approves must be one
    // that cannot be exceeded, or approving it means nothing.
    costUsd: 5.4,
    autonomy: 'propose',
    delegable: true,
  },
  // HIS PROGRAM, AS DATA. Deterministic — no model, no web, no cost: the
  // routines, the schedule, the goals, the block, the analytics the Coach
  // reasons from and the nine audit checks, assembled by code from the vault.
  //
  // This exists because of 21 Sep 2026. He asked for a review of his current
  // program; the plan ran three Researchers on the open web and its report
  // opened with "no agent ever saw your actual program — the program review
  // you asked for hasn't been done at all." Every one of those facts was
  // sitting in the vault the whole time. A plan that needs his data starts
  // here, and every later step is handed the dossier as material.
  program: {
    agent: 'Program dossier',
    summary: "Read his ACTUAL training program from the vault — routines, sets and reps, weekly schedule, goals, training block, weekly volume per muscle, plateaus, RPE trend, session notes and the audit's findings — as a dossier for the other agents to work from. Code, not a model: instant and free.",
    input: 'nothing — it reads his real data',
    output: 'the program dossier, filed as a record and handed to every step that needs it',
    produces: 'program',
    costUsd: 0.05,
    autonomy: 'observe',
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
  paper: {
    agent: 'Researcher → Coach',
    summary: 'Read a study or article into what it actually claims, then judge what it would change in his CURRENT block — grounded in his routines, schedule, goals and recent sessions, and honest when he is not the population it describes.',
    input: 'a link to a paper or article (or its text), aimed at his program',
    output: 'the study as a note he can keep, plus each applicable change as a Coach proposal he can apply with one tap — or "not for him", with why',
    produces: 'coach-program',
    // one Researcher read plus one Coach judgement, both on the strong model
    costUsd: 3.0,
    autonomy: 'propose',
    // NOT delegable: two strong-model passes that end in a change to his
    // program. He brings the study; a plan does not go looking for one.
    delegable: false,
  },
  brief: {
    agent: 'Briefing',
    summary: "Research a topic from several angles at once, then write it up as a report he can read or have Nova read to him, with every term defined.",
    input: 'a topic in his own words, plus whatever he asked for in the report',
    output: 'a report filed as a pending record — readable, and playable with voice and visuals',
    produces: 'briefing',
    // it runs 2-5 Researchers plus two of its own passes
    costUsd: 6.0,
    autonomy: 'propose',
    // NOT delegable, deliberately: a briefing already fans out to several
    // Researchers, so letting a plan delegate one would nest fan-out inside
    // fan-out and make the cost ceiling a fiction. He starts a briefing; a
    // plan that wants research uses the Researcher directly.
    delegable: false,
  },
  coach: {
    agent: 'Coach',
    summary: "Judge a training or nutrition question against HIS real data — every logged session, weekly volume per muscle, PRs, plateaus, recovery, nutrition, goals and his own session notes — and propose concrete program changes he can apply with one tap. The only agent that can review his actual program.",
    input: 'a training or nutrition question, plus any material from earlier steps (research briefs, the program dossier) it should weigh',
    output: "the Coach's review as a filed record; each change it recommends lands as a proposal he can apply or decline",
    produces: 'coach-review',
    // an estimate for the plan-cost preview shown to him before he
    // approves — a strong-model pass over the full context; not an
    // enforced cap, since no lane runs one
    costUsd: 1.5,
    autonomy: 'propose',
    // DELEGABLE SINCE 21 SEP 2026, on his instruction. It was held out of
    // plans ("Coach stays its own agent") and the cost was this: asked for a
    // review of his program, the planner — told "no others exist" about five
    // lanes, none of which could see his data — wrote that "none of the
    // agents can read Hayden's vault or his actual training program". His
    // words: "which is a lie." The Coach still has its own room, its own
    // cadence and its own memory; a plan CONSULTS it as a step, with the
    // material the other steps produced, and its answer files as a record.
    delegable: true,
  },
  browse: {
    agent: 'Hands · browser',
    summary: "Open pages in Nova's own Chrome, read them, and fill forms — stopping before anything that buys, sends, posts or deletes.",
    input: 'a task naming a site or a thing to look up or fill in',
    output: 'a report with the steps and screenshots, filed as a pending record',
    produces: 'browse',
    costUsd: 2.0,
    autonomy: 'propose',
    // never delegated inside a plan: a browser session is the one lane he
    // should be able to watch, and a plan runs several at once
    delegable: false,
  },
  leader: {
    agent: 'Leader',
    summary: 'Leadership as a daily practice — the sit-down about his team, from HIS material; answers in the conversation.',
    input: 'a question about leading his people',
    output: 'an answer in the transcript; a reflection can update the leadership profile',
    produces: 'leader-reflect',
    costUsd: 1.0,
    autonomy: 'propose',
    delegable: false,
  },
  // PRACTICE (27 Sep): a skill he wants to be able to DO, prepared from his
  // own sources into a page, then rehearsed with Nova playing the other side.
  // His to ask for by name — a scene needs him in it, so a plan cannot run one.
  practice: {
    agent: 'Practice',
    summary: 'Prepare a skill he wants to rehearse from his own sources into a practice page, play the other person in a scene, and debrief what landed.',
    input: 'a skill he wants to rehearse, or a scene to run',
    output: 'a practice page in the vault, scenes in conversation, a debrief filed with undo',
    produces: 'practice-session',
    costUsd: 1.5,
    autonomy: 'propose',
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
  // in cents, so 3 + 2.4 + 2.4 is 7.8 and never 7.800000000000001 on a card
  const cents = stepIds.reduce((sum, id) => sum + Math.round((CAPABILITIES[id]?.costUsd || 0) * 100), 0);
  return cents / 100;
}

// The block the planner prompt is given. Generated, never hand-written, so
// the planner cannot be told about a capability that does not exist.
export function describeForPlanner() {
  const lines = DELEGABLE_IDS.map((id) => {
    const c = CAPABILITIES[id];
    return `- ${id} (${c.agent}) — ${c.summary}\n    takes: ${c.input}\n    gives: ${c.output}\n    ceiling: $${c.costUsd.toFixed(2)}`;
  });
  // WHO CAN SEE HIS DATA is said outright, because the planner reasons only
  // from this block. Left implicit, it concluded on 21 Sep that nobody could.
  const readers = DELEGABLE_IDS.filter((id) => READS_HIS_DATA.has(id)).map((id) => `${id} (${CAPABILITIES[id].agent})`);
  lines.push(`\nAGENTS THAT READ HIS OWN DATA (workouts, program, nutrition, health, vault): ${readers.join(', ')}. Anything about HIS program, HIS training, HIS numbers goes through them — never say no agent can see his data.`);
  return lines.join('\n');
}

// The lanes that reason from his vault and logs rather than from the open
// web. Named in one place so the planner's block and the tests agree.
export const READS_HIS_DATA = new Set(['program', 'coach']);

// What he gets when he asks what Nova can do. Same source as the planner's,
// so the two can never drift apart.
export function describeForHim() {
  return CAPABILITY_IDS.map((id) => {
    const c = CAPABILITIES[id];
    return `${c.agent}: ${c.summary}${c.delegable ? '' : ' (yours to ask directly — not something Nova delegates on its own)'}`;
  });
}
