// SETTINGS IN DEMO MODE ONLY. With no Mac connected, the pages that show what
// the Mac holds (calendars, the model board, snapshots, quiet hours, About
// you, the trust ladder) would otherwise be empty, and demo mode is how the
// app is shown and checked. So, as Home does with its sample data, Settings
// shows these in demo mode and nowhere else, and every figure on them says
// "(demo)". Lane names, group names and default models are the code's own
// (server/lib/modelPrefs.js); every figure, file, calendar and sentence is
// invented. Nothing here is ever written anywhere: a tap in demo mode changes
// a copy in App state (settingsDemo) and the next reload forgets it.

const L = (spec) => spec.split('|').map((x) => {
  const i = x.lastIndexOf(':');
  const m = x.slice(i + 1);
  return { label: x.slice(0, i), model: m === 'D' ? null : m };
});

export const DEMO_MODELS = ['Opus 5.5', 'Sonnet 5.5', 'Haiku 4.5', 'Fable 5.1', 'Opus 5.5 · pinned', 'Sonnet 5.5 · pinned', 'Haiku 4.5 · pinned', 'Fable 5.1 · pinned', 'Opus 5 · pinned', 'Sonnet 5 · pinned', 'Fable 5 · pinned'];
const ML = { O: 'Opus 5.5', S: 'Sonnet 5.5', H: 'Haiku 4.5' };

const GROUPS = [
  ['conversation', 'Conversation', 'The surfaces you talk to', 1.10, L('Ask Nova:H|Doorman greeting:H|Calendar in plain words:H|Leader · conversation:O|Practice · the scene:O|Leader · record his answer:H')],
  ['coach', 'Coach & training', 'The strength coach and everything it writes', 1.90, L('Ask Coach:O|Quick Session designer:S|Post-session debrief:S|Coach nightly reflection:S|Exercise research:S|Weekly training debrief:S|Study → program:O|Form check:O')],
  ['capture', 'Capture & scan', 'A photo, a paste or a sentence into real data', 0.80, L('Capture classifier:H|Food label scan:H|Meal photo scan:S|Recipe from a reel:S|Meal correction:S|Takeaway menu read:S|Food from a description:S|Recipe scan:H|Bank statement scan:S|Recipe tweak:S|Shopping list sorting:S|Vault ingest:O|Vault ingest · long transcripts:S')],
  ['daily', 'Daily & background', 'The scheduled lanes that run without you', 2.30, L('Daily review:S|Plan today:S|Journal prompt:S|Health insight:S|Note summaries:S|Pattern scout:S|Leader · daily idea:S|Leader · weekly research:O|Practice · preparing a skill:O|Distill:S|Pulse:H|Study lane:S|Monthly CFO report:D|Weekly meal-prep list:D')],
  ['research', 'Research & media', 'Reading the web and watching video for you', 1.40, L('Planner · delegation:S|The browser hand:S|Briefing · the angles:H|Briefing · the report:S|Repertoire · analyse & learn:S|Researcher:S|Watcher · transcript pass:S|Watcher · verdict pass:S|Scout · people research:S|Librarian · book research:S|Librarian · questions:S|Studio outline:S')],
  ['build', 'Build', 'The lanes that write code', 0.60, L('Builder · projects:O|Code tab · Builder:S|Code tab · Breaker:S|Forge:S')],
];
const OFF_TEXT = {
  'Doorman greeting': 'Nova opens without a spoken greeting. Nothing is faked in its place.',
  'Journal prompt': 'The journal opens blank instead of prompted.',
};

// the starting copy; App keeps the changed one in state.settingsDemo
export function demoSettingsSeed() {
  return {
    push: 'on',
    quiet: { enabled: true, start: '22:30', end: '05:00', waiting: 0 },
    calendars: [
      { name: 'Work', url: 'demo:work', color: '#59e6ff', hidden: false },
      { name: 'Personal', url: 'demo:personal', color: '#5fe8a8', hidden: false },
      { name: 'Gym', url: 'demo:gym', color: '#ffa257', hidden: false },
      { name: 'Family', url: 'demo:family', color: '#ff7ad9', hidden: false },
      { name: 'Birthdays', url: 'demo:birthdays', color: '#d9b56f', hidden: false },
      { name: 'Public holidays', url: 'demo:holidays', color: '#8f7bff', hidden: true },
    ],
    laneOff: { 'Doorman greeting': true, 'Journal prompt': true },
    laneModel: {},
    files: [
      { file: 'Fitness/Program.md', stamp: '09:40' },
      { file: 'Fuel/Log 5 Oct.md', stamp: '12:31' },
      { file: 'Journal/4 Oct.md', stamp: '21:02' },
      { file: 'Inbox/Captures.md', stamp: '08:15' },
    ],
    browser: { chrome: true, profileExists: true },
    notion: { connected: true, botName: 'Nova', workspaceName: "Hayden's workspace", journalShared: true },
    about: {
      focus: 'Getting stronger while work is busy',
      priorities: ['Strength', 'protein', 'sleep before 11'],
      bestSelf: 'Training hard, eating well, present with people',
      notes: 'Gym on weekday evenings; a left shoulder that complains overhead',
    },
  };
}

export const DEMO_NUMBERS = { on: '2 Oct', plan: { targetKcal: 2450, proteinG: 170, tdee: 2780 }, facts: { weightKg: 82, activity: 'moderately active', goal: 'lean gain' } };
export const DEMO_LADDER = [
  { kind: 'recipe', label: 'Recipe suggestions from food', kept: 2, total: 11, verdict: 'skips' },
  { kind: 'coach', label: 'Coach suggestions', kept: 14, total: 16, verdict: 'acts' },
  { kind: 'dispatch', label: 'Morning dispatch', kept: 22, total: 30, verdict: 'asks' },
  { kind: 'review', label: 'Daily review prompts', kept: 9, total: 14, verdict: 'asks' },
];

// the model board, in the shape valsChrome hands the real one over
export function demoBoard(demo) {
  const laneOff = demo.laneOff || {};
  const laneModel = demo.laneModel || {};
  const groups = GROUPS.map(([id, label, hint, usd, lanes]) => ({
    id, label, hint,
    usd: `$${usd.toFixed(2)}`,
    share: usd / 2.3,
    count: lanes.length,
    offCount: lanes.filter((l) => laneOff[l.label]).length,
    lanes: lanes.map((l) => {
      const def = l.model ? ML[l.model] : null;
      return {
        id: l.label,
        label: l.label,
        deterministic: !l.model,
        enabled: !laneOff[l.label],
        model: laneModel[l.label] || def,
        defaultModel: def,
        offEffect: OFF_TEXT[l.label] || 'Off. Where this lane would have run, Nova says it is off.',
      };
    }),
  }));
  const lanes = groups.flatMap((g) => g.lanes);
  return {
    groups,
    laneCount: lanes.length,
    offCount: lanes.filter((l) => !l.enabled).length,
    customisedCount: Object.keys(laneModel).length,
    spendTotal: `$${GROUPS.reduce((a, g) => a + g[3], 0).toFixed(2)}`,
    watchLine: 'Newest, checked 3 Oct: Opus 5.5 · Sonnet 5.5 · Haiku 4.5 · Fable 5.1',
    models: DEMO_MODELS.map((m) => ({ value: m, label: m })),
  };
}
