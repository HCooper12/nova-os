// THE SKILL SETS' VIEW MODEL (mockup 97, audit 28). Pure: state in, the
// carousel and the sheet out, for the phone (Ops → Skill sets) and the Mac
// (the sidebar's agents) alike.
//
// Every live value has one source and says so when it is missing:
//   skills, not yet, runs, suggestions   GET /api/skillsets (server/lib/skillSets.js)
//   working now                          agentsWorking.js workingBeingIds (the one rule)
//   last ran / never run                 the Org map's fresh + last (/api/ops orgMap)
// Offline, the names and roles stay, and every live value is withheld with
// the reason. Demo is DEMO_SKILLSETS below, and every number in it is tagged.
import { workingBeingIds, activeRecordOf } from './agentsWorking.js';
import { BEING_HUES, HUE_VAR } from '../agentWorld/beings.js';

// Design copy, not data: who each agent is, in a line, and its artefact mark.
export const ROLES = {
  commander: { role: 'Runs your day: plans, calendar, to-dos', art: 'compass' },
  coach: { role: 'Your strength coach and his program', art: 'bar' },
  cfo: { role: 'Your money, read from the ledger', art: 'coin' },
  guardian: { role: 'Keeps the platform honest and backed up', art: 'shield' },
  researcher: { role: 'Reads the evidence and cites it', art: 'lens' },
  watcher: { role: 'Watches the videos you send', art: 'film' },
  librarian: { role: 'Keeps your library and finds what it says', art: 'book' },
  mealprep: { role: 'Feeds the plan: meals, prep, shopping', art: 'pot' },
  leader: { role: 'Your leadership partner at work', art: 'orb' },
  practice: { role: 'Rehearses a hard conversation with you', art: 'masks' },
};
const ORDER = ['commander', 'coach', 'cfo', 'guardian', 'researcher', 'watcher', 'librarian', 'mealprep', 'leader', 'practice'];
const NAME = { commander: 'Commander', coach: 'Coach', cfo: 'CFO', guardian: 'Guardian', researcher: 'Researcher', watcher: 'Watcher', librarian: 'Librarian', mealprep: 'Meal Prep', leader: 'Leader', practice: 'Practice' };
const ASK_NAME = { nova: 'Nova', coach: 'Coach', leader: 'Leader', researcher: 'Researcher', librarian: 'Librarian', cfo: 'CFO' };
const ASK_HUE = { nova: '--nv-cy', coach: '--nv-m-chest', leader: '--nv-mg', researcher: '--nv-m-quads', librarian: '--nv-m-back', cfo: '--nv-good' };
export const KIND_LABEL = { asked: 'You asked; nobody could', hand: 'You did it by hand', inbox: 'You handled it in the Inbox', lend: 'Another agent can lend it' };
const TIER_SHORT = { observe: 'o', propose: 'p', 'act-on-approval': 'a' };

export const hueVarOf = (id) => `var(${HUE_VAR[BEING_HUES[id]?.hue] || '--nv-cy'})`;

/* --------------------------------- demo ---------------------------------- */
// The mockup's values, every one shown with a DEMO tag. Shaped like the live
// payload so one path draws both.
const S = (text, tier, tags) => ({ text, tier, tags });
const G = (name, skills) => ({ name, skills });
const D = (id, skills, notYet, canBeAsked, demo, suggestions = []) => ({ id, name: NAME[id], skills, notYet, consult: { canBeAsked }, runs: demo.runs || null, suggestions, demo });
const SG = (id, agent, kind, skill, count, evidence, source) => ({ id, agent, kind, skill, count, evidence, source });
const CONSULT_NY = { text: 'Be consulted by the other agents', source: 'consult rail' };
export const DEMO_SKILLSETS = {
  askable: ['nova', 'coach', 'leader', 'researcher', 'librarian', 'cfo'],
  signals: { asked: 'demo', hand: 'demo', inbox: 'demo', lend: 'not yet' },
  agents: [
    D('commander', [G('Your day', [S('Draft calendar changes, always confirm-first', 'propose', ['calendar', 'inbox']), S('Plan today from your real commitments', 'propose', ['vault', 'calendar', 'inbox']), S('Compose morning and evening dispatches', 'observe', ['vault', 'calendar'])]),
      G('Keeping track', [S('Sync to-dos two-way with Todoist', 'act-on-approval', ['inbox']), S('Set reminders in Apple Reminders', 'act-on-approval', ['calendar']), S('Follow up on what you said you would do', 'propose', ['vault', 'inbox'])])],
    [CONSULT_NY], false, { last: 'Ran 7:02 am', runs: [3, 2, 4, 3, 3, 2, 4, 3, 3, 4, 2, 3, 3, 2] },
    [SG('demo-commander', 'commander', 'hand', 'Move a training session when a meeting lands on it', 3, 'times you moved a session by hand in four weeks, each the day a meeting arrived', 'session date edits (Train) + calendar events')]),
    D('coach', [G('Training', [S('Log workout sessions with honest set receipts', 'act-on-approval', ['vault']), S('Propose program edits: swap, add, remove, retarget', 'propose', ['vault', 'inbox']), S('Check your form from a clip, or refuse honestly', 'observe', ['inbox']), S('Estimate e1RM trends from real sets', 'observe', ['vault'])]),
      G('Watching', [S('Watch for program drift and missed sessions', 'observe', ['vault', 'health']), S('Annotate the week plan with pushed and carried work', 'observe', ['vault']), S('Ask the Researcher, Nova or your calendar mid-answer', 'observe', ['web', 'calendar'])])],
    [], true, { last: 'Ran yesterday', runs: [1, 2, 1, 3, 1, 2, 2, 1, 3, 2, 1, 2, 1, 2] },
    [SG('demo-coach', 'coach', 'inbox', 'Lighten the day after a short night', 5, 'heavy-day cards you declined after under six hours of sleep', 'Inbox declines (coach-program) + Apple Health sleep')]),
    D('cfo', [G('Ledger', [S('Import and categorise the ledger', 'act-on-approval', ['bank', 'vault']), S('Read a bank statement photo', 'propose', ['bank', 'inbox'])]),
      G('Watching', [S('Detect subscriptions and expected charges', 'observe', ['bank']), S('Draft the monthly CFO report', 'propose', ['vault', 'inbox'])])],
    [], true, { last: 'Ran 3 days ago', runs: [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1] },
    [SG('demo-cfo', 'cfo', 'asked', 'Split a shared bill and say who owes what', 3, 'times you asked Nova in three weeks; each answer said no agent could', 'conversation record')]),
    D('guardian', [G('Integrity', [S('Guard integrity with checks, backups and honest alerts', 'observe', ['vault']), S('Age stale Inbox items via compost', 'observe', ['inbox']), S('Notice when a health push stops arriving', 'observe', ['health'])]),
      G('Overnight and away', [S('Run queued work overnight', 'act-on-approval', ['inbox']), S('Answer from your pocket via Telegram, same human gate', 'propose', ['inbox']), S('Keep standing instructions, correct once', 'act-on-approval', ['vault'])])],
    [CONSULT_NY], false, { last: 'Ran 4:00 am', runs: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] },
    [SG('demo-guardian', 'guardian', 'lend', 'Be asked by the other agents', 4, 'times an agent’s answer said it could not check whether a loop had run', 'consult turns (consult.js) that named the Guardian')]),
    D('researcher', [G('Research', [S('Research with citations, now or overnight', 'propose', ['web', 'inbox']), S('Judge a paper against your real training block', 'propose', ['web', 'vault', 'inbox']), S('Put notes and live panels on screen mid-conversation', 'observe', ['vault'])]),
      G('Teaching', [S('Read a clip for its technique, teach one a day', 'propose', ['web', 'vault'])])],
    [], true, { last: 'Working now', working: 'Reading on creatine and sleep', runs: [1, 0, 2, 1, 0, 1, 3, 1, 0, 2, 1, 1, 0, 2] },
    [SG('demo-researcher', 'researcher', 'lend', 'Watch a video as part of a research brief (from the Watcher)', 4, 'briefs that cited a video they could not watch', 'research records (kind: research)')]),
    D('watcher', [G('Watching', [S('Watch a video from its transcript and report back', 'propose', ['web', 'inbox']), S('Digest a long video in parts', 'propose', ['web', 'vault']), S('Retry a failed watch from the cache', 'act-on-approval', ['inbox'])])],
    [CONSULT_NY], false, { last: 'Ran 2 days ago', runs: [0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
    [SG('demo-watcher', 'watcher', 'asked', 'Answer a follow-up about a video already watched', 2, 'times you asked about a watched video in a new chat', 'conversation record + video records')]),
    D('librarian', [G('Library', [S('Answer from your library, citing the notes it read', 'observe', ['vault']), S('Build a book page from research', 'propose', ['web', 'vault', 'inbox']), S('Suggest what to read next', 'propose', ['vault', 'inbox'])]),
      G('Remembering', [S('Bring a concept back on the Daily review', 'observe', ['vault']), S('Distill notes and keep the search index', 'observe', ['vault'])])],
    [], true, { last: 'Ran 6:10 am', runs: [2, 1, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 2, 1] },
    [SG('demo-librarian', 'librarian', 'inbox', 'File a finished podcast into your library', 6, 'podcast notes you filed yourself this month', 'Inbox records filed by you (auto: false, kind: ingest)')]),
    D('mealprep', [G('Cooking', [S('Propose meal-prep plans', 'propose', ['vault', 'inbox']), S('Suggest recipes from logged foods', 'propose', ['vault', 'inbox']), S('Find what you can pick up nearby', 'observe', ['web'])]),
      G('Watching', [S('Watch the protein floor and say the hard thing', 'observe', ['vault']), S('Build the shopping list', 'propose', ['vault'])])],
    [{ text: 'Cheapest price per line with the store', source: 'build list' }, CONSULT_NY], false, { last: 'Ran Sunday', runs: [0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 2] },
    [SG('demo-mealprep', 'mealprep', 'lend', 'Plan meals around training days (from the Coach)', 4, 'leg days of five where you swapped the prep meal', 'Fuel rotation edits + the week plan')]),
    D('leader', [G('Daily', [S('Write the day’s lead from your open struggles', 'propose', ['vault']), S('File your reflection, with undo', 'act-on-approval', ['vault', 'inbox']), S('Remind you of what you meant to try', 'propose', ['inbox'])]),
      G('Learning', [S('Find leadership research with links that open', 'propose', ['web'])])],
    [], true, { last: 'Ran 6:30 am', runs: [1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0] },
    [SG('demo-leader', 'leader', 'asked', 'Prepare you for a one-to-one from your calendar', 3, 'times you asked Nova before a one-to-one', 'conversation record + calendar')]),
    D('practice', [G('Rehearsal', [S('Rehearse a skill as the other person, then debrief', 'propose', ['vault']), S('Build a skill page from your sources', 'propose', ['vault', 'inbox'])])],
    [CONSULT_NY], false, { never: true },
    [SG('demo-practice', 'practice', 'lend', 'Rehearse the conversation the Leader flagged', 2, 'open struggles about one conversation that Practice was never asked about', 'leader state (struggles) + practice records')]),
  ],
};

/* -------------------------------- helpers -------------------------------- */
function agoWords(at, now) {
  const t = at ? new Date(at).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function statusOf({ demoMode, isOffline, working, demo, being, now }) {
  if (demoMode) {
    if (demo?.working) return { kind: 'working', label: 'WORKING NOW' };
    if (demo?.never) return { kind: 'never', label: 'NEVER RUN' };
    return { kind: 'last', label: String(demo?.last || '').toUpperCase() };
  }
  if (isOffline) return { kind: 'offline', label: 'CAN’T REACH YOUR MAC' };
  if (working) return { kind: 'working', label: 'WORKING NOW' };
  if (!being) return { kind: 'unknown', label: 'LAST RUN NOT KNOWN YET' };
  if (being.fresh === 'never' && !being.last) return { kind: 'never', label: 'NEVER RUN' };
  const ago = being.last ? agoWords(being.last.at, now) : null;
  if (ago) return { kind: 'last', label: `RAN ${ago.toUpperCase()}` };
  const word = { today: 'RAN TODAY', recent: 'RAN IN THE LAST 2 DAYS', stale: 'GONE QUIET' }[being.fresh];
  return word ? { kind: 'last', label: word } : { kind: 'unknown', label: 'LAST RUN NOT KNOWN YET' };
}

/* ------------------------------ view model ------------------------------- */
export function valsSkillSets({ st = {}, app, demoMode = false, isOffline = false, now = Date.now() } = {}) {
  const payload = demoMode ? DEMO_SKILLSETS : st.liveSkillSets || null;
  const state = demoMode ? 'demo' : isOffline ? 'offline' : payload ? 'live' : st.skillSetsError ? 'error' : 'loading';
  const workingIds = demoMode || isOffline ? new Set() : workingBeingIds(st, now);
  const orgBeings = st.liveOps?.orgMap?.beings || null;
  const answers = st.skillAnswers || {};
  const usePayload = state === 'demo' || state === 'live';

  const agents = ORDER.map((id) => {
    const p = usePayload ? payload.agents.find((a) => a.id === id) : null;
    const demo = demoMode ? p?.demo || {} : null;
    const working = demoMode ? !!demo.working : isOffline || !usePayload ? null : workingIds.has(id);
    const being = orgBeings ? orgBeings.find((b) => b.id === id) : null;
    const status = statusOf({ demoMode, isOffline, working, demo, being, now });
    const groups = p?.skills
      ? p.skills.map((g) => ({ name: g.name, skills: g.skills.map((s) => ({ text: s.text, tier: TIER_SHORT[s.tier] || 'o', tags: s.tags || [] })) }))
      : null;
    const flat = groups ? groups.flatMap((g) => g.skills) : [];
    const tierCounts = { o: 0, p: 0, a: 0 };
    flat.forEach((s) => { tierCounts[s.tier]++; });
    const job = working && !demoMode ? activeRecordOf(st, NAME[id], now) : null;
    const answered = Object.entries(answers).filter(([, a]) => a.agent === id);
    const suggestions = [
      ...(p?.suggestions || []).filter((s) => !answers[s.id]).map((s) => ({
        id: s.id, kind: s.kind, kindLabel: KIND_LABEL[s.kind] || s.kind, skill: s.skill,
        count: s.count, evidence: s.evidence, source: s.source, answered: null,
      })),
      ...answered.map(([sid, a]) => ({ id: sid, skill: a.skill, answered: a.state, busy: !!a.busy, error: a.error || null })),
    ];
    return {
      id, name: NAME[id], role: ROLES[id].role, art: ROLES[id].art, hue: hueVarOf(id),
      demo: demoMode,
      working,
      // the line under a working slab: the record's own words, or the demo's
      jobLine: demoMode ? demo.working || null : job ? String(job.text || job.decision?.title || job.kind).slice(0, 80) : working ? 'on a job' : null,
      // plays claim he is idle: never while working, and never when whether
      // he is working is unknown (offline, still loading)
      canPlay: usePayload && working === false,
      status,
      groups,
      skillsNote: groups ? (flat.length ? null : 'No skills on the registry for him yet.') : state === 'offline' ? 'His skills come from your Mac, which can’t be reached.' : state === 'error' ? 'The skill registry could not be read.' : null,
      skillCount: groups ? flat.length : null,
      top3: flat.slice(0, 3),
      tierCounts,
      notYet: usePayload ? (p?.notYet || []) : [],
      canBeAsked: usePayload ? !!p?.consult?.canBeAsked : null,
      suggestions,
      runs: usePayload && Array.isArray(p?.runs) ? p.runs : null,
      neverRun: status.kind === 'never',
    };
  });

  const nWorking = agents.filter((a) => a.working).length;
  return {
    state,
    demo: demoMode,
    workingLine: demoMode ? `${nWorking} WORKING NOW` : state === 'live' ? (nWorking ? `${nWorking} WORKING NOW` : 'NONE WORKING') : null,
    agents,
    askable: (usePayload ? payload.askable || [] : []).map((k) => ({ id: k, name: ASK_NAME[k] || k, hue: `var(${ASK_HUE[k] || '--nv-cy'})` })),
    lendNote: 'Another agent can lend it: not counted yet. No matcher exists, so nothing is raised from it.',
    openId: st.skillSheetId || null,
    focusId: st.skillFocusId || null,
    open: (id) => app.openSkillSheet(id),
    close: () => app.closeSkillSheet(),
    accept: (s, agent) => app.skillSuggestion('accept', s, agent),
    dismiss: (s, agent) => app.skillSuggestion('dismiss', s, agent),
    undo: (s, agent) => app.skillSuggestion('undo', s, agent),
    talk: (s, agent) => app.talkAboutSkill(s, agent),
    retry: () => app.loadSkillSets && app.loadSkillSets(),
  };
}
