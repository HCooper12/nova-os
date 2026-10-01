// EVERY DOOR, ONE NOVA (1 Oct 2026). His words, verbatim in the part that
// decides this file: "it doesn't matter the way that I speak with it and where
// I speak with it but you can perform every single function and action that
// is capable within the platform no matter how it is done … such as adding
// links and telling it to add it to my recipe vault, asking it to research and
// capture something, ask it to analyse the video which would then be delegated
// to the watcher agent etc."
//
// Before this file those jobs were started by whichever door he happened to
// use: the chat's client-side router (which had no recipe lane, so a recipe
// reel went to the Watcher), the palette's /api/intent, the capture box — and
// NOT AT ALL by the tab bar's Nova on another page or by Siri, whose words
// reached a model with no way to start them. They are verbs now, in the one
// registry (lib/verbs.js): the same args contract, the same receipt with an
// undo, reached by the strict grammar below (no model, sub-second) and by the
// model's ACT line (generated into the prompt by describeForModel). Every
// door sends his words to the ask lane; the ask lane has every verb.
//
// The doctrine holds exactly:
//   models decide, code acts — the grammar or the model NAMES the job and the
//     link; code classifies the link (src/linkKind.js) and starts the lane,
//     which is the same tested lane the palette and the Inbox already use;
//   everything writeable is undoable — each job's undo withdraws what it
//     started: a pending draft is discarded, a filed one undone, a weave's
//     review thrown away. A job still RUNNING says so rather than pretending
//     (its result lands pending, where a no discards it);
//   honest degradation — a link that is not what the verb needs, a screen
//     Siri cannot show, a skill with no page: said, never guessed.

import { classifyLink, urlsIn, URL_RE, RECIPE_WORDS_RE } from '../../src/linkKind.js';
import { routeIntent } from './intentRouter.js';
import { TAB_META } from '../../src/tabOrder.js';
// a circular import, safe: matchName is a hoisted function declaration and
// nothing here calls it while the modules are still loading
import { matchName } from './verbs.js';

// The lanes, reached lazily (each drags its own model plumbing in) and
// swappable in tests, which must never start a real job.
const REAL = {
  startCapture: async (vaultPath, opts) => (await import('./inbox.js')).startCapture(vaultPath, opts),
  startRecipeImport: async (vaultPath, url, prose) => (await import('./recipeFromPage.js')).startRecipeImport(vaultPath, url, prose),
  startVideoWatch: async (vaultPath, url, question, opts) => (await import('./watcher.js')).startVideoWatch(vaultPath, url, question, opts),
  startWeave: async (vaultPath, url) => (await import('./ingest.js')).startIngest(vaultPath)('', url),
  startBook: async (vaultPath, book) => (await import('./ingest.js')).startIngest(vaultPath)(null, undefined, book),
  getIngestJob: async (jobId) => (await import('./ingest.js')).getJob(jobId),
  discardIngestJob: async (jobId) => (await import('./ingest.js')).discardJob(jobId),
  undoIngestJob: async (vaultPath, jobId) => (await import('./ingest.js')).undoIngestJob(vaultPath, jobId),
  startResearch: async (vaultPath, q, opts) => (await import('./researcher.js')).startResearch(vaultPath, q, opts),
  enqueueOvernight: async (item) => (await import('./overnight.js')).enqueueOvernight(item),
  removeOvernightItem: async (id) => (await import('./overnight.js')).removeOvernightItem(id),
  startBriefing: async (vaultPath, opts) => (await import('./briefing.js')).startBriefing(vaultPath, opts),
  startStudy: async (vaultPath, opts) => (await import('./studyLane.js')).startStudy(vaultPath, opts),
  startRepertoire: async (vaultPath, opts) => (await import('./repertoireLane.js')).startRepertoire(vaultPath, opts),
  resolvePracticeAsk: async (vaultPath, text) => (await import('./practiceLane.js')).resolvePracticeAsk(vaultPath, text),
  startPrepare: async (vaultPath, opts) => (await import('./practiceLane.js')).startPrepare(vaultPath, opts),
  startBrowse: async (vaultPath, task) => (await import('./browse.js')).startBrowse(vaultPath, task),
};
let lanes = { ...REAL };
/** Tests only: replace any lane starter; null restores the real ones. */
export function _setJobLanesForTests(over) { lanes = over ? { ...REAL, ...over } : { ...REAL }; }

const say = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const short = (s, n = 60) => { const t = say(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
// the words that ask for a recipe to go straight in (recipeFromVideo's rule)
const ADD_NOW_RE = /\b(?:add|save|put|file|keep|import|store)\b/i;

// ------------------------------------------------------------ withdrawal

// One record a job started, taken back as far as it honestly can be.
async function withdrawOne(vaultPath, id) {
  const { getRecord } = await import('./inboxStore.js');
  const r = await getRecord(id);
  if (!r) return 'already gone';
  if (r.status === 'discarded' || r.status === 'undone') return 'already withdrawn';
  if (r.status === 'filed' && r.undoData) {
    const { undoRecord } = await import('./inbox.js');
    await undoRecord(vaultPath, r.id);
    return 'undone';
  }
  if (r.status === 'pending' || r.status === 'error') {
    const { discardRecord } = await import('./inbox.js');
    await discardRecord(r.id, 'withdrawn — he took it back', { vaultPath });
    return 'discarded';
  }
  if (r.status === 'filed') return 'filed, with nothing to take back';
  throw new Error('it is still running — when it lands it waits in your Inbox, where a no discards it');
}

// A job's record and, for a recipe import, the recipe cards it filed
async function withdrawRecord(vaultPath, recordId, what) {
  const { getRecord } = await import('./inboxStore.js');
  const r = await getRecord(recordId);
  if (!r) throw new Error(`${what} is no longer in the Inbox`);
  const kids = Array.isArray(r.recipeCards) ? r.recipeCards : [];
  const done = [];
  for (const k of kids) done.push(await withdrawOne(vaultPath, k));
  // the import's own record: its backfill undo (recipe-backfill), or a discard
  const own = await withdrawOne(vaultPath, recordId);
  const recipes = done.filter((d) => d === 'undone' || d === 'discarded').length;
  return recipes ? `took back ${what} (${recipes} recipe${recipes === 1 ? '' : 's'})` : `took back ${what} (${own})`;
}

async function withdrawIngest(vaultPath, jobId, what) {
  const job = await lanes.getIngestJob(jobId);
  if (!job) return `${what} is already gone`;
  if (job.status === 'applied') { await lanes.undoIngestJob(vaultPath, jobId); return `undid ${what} — the pages it wrote are out of the vault`; }
  if (job.status === 'undone') return `${what} was already undone`;
  if (job.status === 'ready' || job.status === 'error') { await lanes.discardIngestJob(jobId); return `threw away ${what} — nothing had been written`; }
  throw new Error(`${what} is still running — nothing is written until you approve its review`);
}

const undoJob = async (vaultPath, u) => (u.ingestJobId
  ? withdrawIngest(vaultPath, u.ingestJobId, u.what || 'the weave')
  : u.overnightId
    ? (await lanes.removeOvernightItem(u.overnightId), `took "${u.what}" off tonight's queue`)
    : withdrawRecord(vaultPath, u.recordId, u.what || 'that'));

// what a started record IS, in his words, for the receipt
function spokenFor(record, fallback) {
  switch (record?.kind) {
    case 'video': return 'That link is a video — the Watcher has it, and its read lands in your Inbox.';
    case 'recipe-video': return 'That one is a recipe — reading it into your recipe bank.';
    case 'study': return 'That is a whole channel — the study is running, and the brief lands in your Inbox.';
    default: return fallback;
  }
}

// ---------------------------------------------------------------- the verbs

// Each: the registry's own shape (lib/verbs.js verb()). `gate` names the
// model-choice gate this job honours (lib/modelChoice.js): when his board runs
// the lane below Opus, the verb does not start until he has answered it (the
// hands-free lane never asks: there is no one to answer). `receipt: false`
// marks a verb that changes nothing he owns (opening a screen), so it lands no
// Inbox receipt. `run` may hand back `extra`: what the door needs to follow
// the job (the research to watch, the weave to review, the screen to open).
export const JOB_VERBS = [
  {
    id: 'capture.add', tier: 'act',
    describe: 'put something into his Inbox exactly as if he had typed it there — for "capture this", "note that…", "remember that/to…", "add X to my shopping list", or anything he tells you to keep. The Inbox files it (to-do, shopping, food, a note, a link) and a link in it routes itself',
    args: { text: 'what to capture, in his words — a link included exactly as he gave it' },
    async run(vaultPath, args) {
      const text = say(args.text);
      const record = await lanes.startCapture(vaultPath, { text, source: 'voice' });
      return {
        destination: `Inbox — captured "${short(text)}"`,
        said: spokenFor(record, 'Captured — your Inbox is filing it.'),
        undo: { recordId: record.id, what: `"${short(text, 40)}"` },
        extra: { record: { id: record.id, kind: record.kind || 'capture' } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'link.file', tier: 'act',
    describe: 'file a link he gave you when he wants it KEPT and has not said what to do with it — Nova\'s code decides what it is: a recipe reel or recipe page goes to his recipe bank (waiting for his yes), a video to the Watcher, a channel to a study, an article to the Inbox',
    args: { url: 'the exact link he gave', words: 'optional — what he said with it' },
    async run(vaultPath, args) {
      const words = say(args.words);
      const link = classifyLink(args.url, words);
      if (!link.kind) throw new Error(`"${short(args.url)}" is not a link I can file`);
      let record;
      let said;
      if (link.kind === 'recipe-reel' || link.kind === 'recipe-page') {
        record = await lanes.startRecipeImport(vaultPath, link.url, words);
        said = ADD_NOW_RE.test(words)
          ? 'That is a recipe — reading it straight into your recipe bank.'
          : 'That is a recipe — reading it now; it waits for your yes before it goes into your recipe bank.';
      } else if (link.kind === 'channel') {
        record = await lanes.startStudy(vaultPath, { urls: [link.url], prose: words });
        said = 'That is a whole channel — the study is running, and the brief lands in your Inbox.';
      } else {
        record = await lanes.startCapture(vaultPath, { text: [words, link.url].filter(Boolean).join(' '), source: 'voice' });
        said = spokenFor(record, 'Filed to your Inbox — it will say where it went.');
      }
      return {
        destination: `Link — ${link.kind.replace('-', ' ')}: ${short(link.host || link.url, 40)}`,
        said,
        undo: { recordId: record.id, what: `the ${link.host || 'link'}` },
        extra: { record: { id: record.id, kind: record.kind || 'capture' }, link: { kind: link.kind, why: link.why } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'recipe.import', tier: 'act',
    describe: 'save a recipe from a link (an Instagram/TikTok/YouTube reel, or a recipe web page) into his recipe bank — he asked for it, so it goes straight in, with its photo, times and servings when the source states them; macros only when they add up, otherwise left "not set", never guessed',
    args: { url: 'the exact link he gave', words: 'optional — anything he said about it' },
    async run(vaultPath, args) {
      const words = say(args.words);
      const link = classifyLink(args.url, words || 'add to my recipes');
      if (!link.kind) throw new Error(`"${short(args.url)}" is not a link I can read a recipe from`);
      if (link.kind === 'channel') throw new Error('that is a whole channel, not one recipe — send the one video');
      // he asked for it: the import's add-now rule sees an add word
      const prose = ADD_NOW_RE.test(words) ? words : `add to my recipes${words ? ` — ${words}` : ''}`;
      const record = await lanes.startRecipeImport(vaultPath, link.url, prose);
      return {
        destination: `Recipe bank — importing from ${short(link.host, 40)}`,
        said: link.kind === 'recipe-page' ? 'Reading the recipe off that page — it goes into your recipe bank in a minute.' : 'Reading the recipe out of the reel — it goes into your recipe bank in a minute.',
        undo: { recordId: record.id, what: 'the recipe import' },
        extra: { record: { id: record.id, kind: record.kind || 'recipe-video' } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'video.watch', tier: 'act', gate: 'watch',
    describe: 'hand ONE video link to the Watcher when he asks you to watch, review, summarise or evaluate it: it pulls the transcript and drafts a verdict (training content, checked against the evidence) or a reference note — pending in his Inbox. Never describe a video you have not seen',
    args: { url: 'the exact video link he gave', question: 'optional — his specific ask about it' },
    async run(vaultPath, args) {
      const link = classifyLink(args.url);
      if (link.kind !== 'video' && link.kind !== 'recipe-reel') throw new Error(`"${short(args.url)}" is not a single video — ${link.kind === 'channel' ? 'that is a whole channel' : 'the Researcher can read a page'}`);
      const record = await lanes.startVideoWatch(vaultPath, link.url, say(args.question), args.model ? { model: args.model } : {});
      return {
        destination: `Watcher — ${short(link.host)}${args.question ? ` (${short(args.question, 40)})` : ''}`,
        said: 'The Watcher has it — the transcript first, then its read lands in your Inbox in a few minutes.',
        undo: { recordId: record.id, what: 'the Watcher\'s read' },
        extra: { watch: { recordId: record.id, url: link.url } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'video.analyse', tier: 'act',
    describe: 'analyse a video in depth — the deep weave: transcript fetched, every concept, person and idea drafted into his vault as pages he reviews as one diff before anything is written. Use when he asks you to analyse, deep-dive, break down or weave a video into his vault (a quick "watch this" is video.watch)',
    args: { url: 'the exact video link' },
    async run(vaultPath, args) {
      const link = classifyLink(args.url);
      if (link.kind !== 'video' && link.kind !== 'recipe-reel') throw new Error(`"${short(args.url)}" is not a single video to analyse`);
      const jobId = await lanes.startWeave(vaultPath, link.url);
      return {
        destination: `Deep weave — ${short(link.host)}`,
        said: 'Analysing it properly — the transcript first, then every concept and person as draft pages. Nothing is written until you approve the review.',
        undo: { ingestJobId: jobId, what: 'the weave' },
        extra: { ingest: { jobId, url: link.url } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'research.run', tier: 'act', gate: 'research',
    describe: 'put the Researcher on a question when he asks you to research something, look it up online, or "research X and capture it": web-read-only, every claim cited, and the brief is CAPTURED in his Inbox for review (and shown here when it lands). "when":"tonight" queues it for the overnight window. Never on your own initiative — a question you can answer now, answer (or CONSULT the Researcher)',
    args: { question: 'the question, tight and specific', url: 'optional — a link to read, exactly as he gave it', when: 'optional — "tonight" to queue it overnight' },
    gateSkip: (args) => String(args.when || '').toLowerCase() === 'tonight',
    async run(vaultPath, args) {
      const question = say(args.question).slice(0, 460);
      const url = args.url ? classifyLink(args.url).url : '';
      const q = url ? `${question || 'Read and summarise this'}: ${url}` : question;
      if (String(args.when || '').toLowerCase() === 'tonight') {
        const item = await lanes.enqueueOvernight({ question: q });
        return {
          destination: `Research — queued for tonight: "${short(q)}"`,
          said: 'Queued for tonight — the brief will be waiting in your Inbox by morning.',
          undo: { overnightId: item.id, what: short(q, 40) },
          extra: { research: { queued: true, queueId: item.id, question: q } },
        };
      }
      const record = await lanes.startResearch(vaultPath, q, args.model ? { model: args.model } : {});
      return {
        destination: `Research — "${short(q)}"`,
        said: 'The Researcher is on it — the brief lands in your Inbox with its sources, and here when it is done.',
        undo: { recordId: record.id, what: 'the research' },
        extra: { research: { recordId: record.id, question: q } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'briefing.start', tier: 'act',
    describe: 'research a topic from several angles and bring it back as a written briefing he can read or have read to him — for "brief me on X", "put together a report on X", "research X and explain it"',
    args: { topic: 'the topic AND his instructions, in his words — the whole sentence is the spec' },
    async run(vaultPath, args) {
      const topic = say(args.topic);
      const record = await lanes.startBriefing(vaultPath, { topic, standing: topic });
      return {
        destination: `Briefing — "${short(topic)}"`,
        said: 'On it — researching this from a few angles at once, then writing it up. You will get a notification when it is ready to read or listen to.',
        undo: { recordId: record.id, what: 'the briefing' },
        extra: { record: { id: record.id, kind: record.kind || 'briefing' } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'book.add', tier: 'act', gate: 'book',
    describe: 'have the Librarian research a book and weave its ideas into his vault (a review he approves) — for "add the book X by Y"',
    args: { title: 'the book\'s title', author: 'its author' },
    async run(vaultPath, args) {
      const book = { title: say(args.title), author: say(args.author), ...(args.model ? { model: args.model } : {}) };
      const jobId = await lanes.startBook(vaultPath, book);
      return {
        destination: `Librarian — "${short(book.title, 40)}" by ${short(book.author, 30)}`,
        said: `The Librarian is researching "${book.title}" — the draft pages land for your review.`,
        undo: { ingestJobId: jobId, what: `"${short(book.title, 40)}"` },
        extra: { ingest: { jobId, book: { title: book.title, author: book.author } } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'repertoire.start', tier: 'act',
    describe: 'a clip or article he wants to LEARN a technique from ("teach me techniques like this"): Nova reads it, researches the family it belongs to and builds a curriculum taught one a day',
    args: { url: 'the exact link', words: 'what he said about it' },
    async run(vaultPath, args) {
      const record = await lanes.startRepertoire(vaultPath, { url: classifyLink(args.url).url, prose: say(args.words) });
      return {
        destination: `Repertoire — ${short(args.words || args.url)}`,
        said: 'Reading it, then researching the techniques around it. You get the report and a plan I can teach you one a day.',
        undo: { recordId: record.id, what: 'the repertoire' },
        extra: { record: { id: record.id, kind: record.kind || 'repertoire' } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'practice.prepare', tier: 'act',
    describe: 'a skill he wants to rehearse out loud ("let\'s practise the difficult conversation"): opens the rehearsal room when he has a page for it, otherwise prepares one from his sources',
    args: { skill: 'the skill or scene, in his words' },
    async run(vaultPath, args, ctx = {}) {
      const text = say(args.skill);
      const hit = await lanes.resolvePracticeAsk(vaultPath, text);
      if (hit) {
        return {
          destination: `Practice — ${hit.title}`,
          said: ctx.direct ? `Your ${hit.title} page is in Practice — open Nova to start the scene.` : `Opening Practice: ${hit.title}.`,
          undo: null,
          receipt: false,
          extra: ctx.direct ? {} : { open: { screen: 'practice', slug: hit.slug, scenario: hit.scenario || null } },
        };
      }
      const record = await lanes.startPrepare(vaultPath, { text, research: /\b(research|look (it )?up|find (me )?sources?|dig into)\b/i.test(text) });
      return {
        destination: `Practice — preparing "${short(text)}"`,
        said: 'Putting together a practice page for that from what you have — it lands in Practice and your Inbox.',
        undo: { recordId: record.id, what: 'the practice page' },
        extra: { record: { id: record.id, kind: record.kind || 'practice-skill' } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'browse.run', tier: 'act',
    describe: 'send Nova\'s own browser (its own Chrome profile, never his) to do a web task he asked for — open a channel, find a video, check an order — it reads, navigates and fills in, and STOPS before anything that buys, sends or deletes; its windows show on his glass and the result lands in his Inbox',
    args: { task: 'the whole task, in his words' },
    async run(vaultPath, args) {
      const task = say(args.task);
      const record = await lanes.startBrowse(vaultPath, task);
      return {
        destination: `Browser — ${short(task)}`,
        said: 'Opening the browser — I will stop before anything that commits, and show you what I found.',
        undo: { recordId: record.id, what: 'the browser task' },
        extra: { browse: { recordId: record.id, task } },
      };
    },
    undo: undoJob,
  },
  {
    id: 'screen.open', tier: 'act', receipt: false,
    describe: 'open one of Nova\'s own screens in the app — Home, Fuel, Train, Shop, To-Do, Inbox, Notes, Journal, Money, Stash, Library, Documents, Practice, Settings…',
    args: { screen: 'the screen, in his words' },
    async run(vaultPath, args, ctx = {}) {
      const hit = screenFor(args.screen);
      if (!hit) throw new Error(`Nova has no screen called "${short(args.screen, 40)}"`);
      if (ctx.direct) throw new Error(`I can't open a screen through Siri — ${hit.label} is in the app`);
      return { destination: `Opened ${hit.label}`, said: `${hit.label}.`, undo: null, receipt: false, extra: { open: { screen: hit.screen } } };
    },
  },
  {
    id: 'quick.session', tier: 'act', receipt: false,
    describe: 'have the Coach build a quick session of N minutes (optionally for a focus) — it appears on Train for him to start; nothing is logged until he does',
    args: { minutes: '10-120', note: 'optional — the focus or constraint, in his words' },
    async run(vaultPath, args, ctx = {}) {
      const minutes = Math.round(Number(args.minutes));
      if (!Number.isFinite(minutes) || minutes < 10 || minutes > 120) throw new Error('a quick session is 10 to 120 minutes');
      if (ctx.direct) throw new Error('a quick session is built on your phone — open Nova\'s Train tab and ask there');
      const note = say(args.note);
      return {
        destination: `Quick session — ${minutes} min${note ? `, ${short(note, 40)}` : ''}`,
        said: `Building a ${minutes}-minute session${note ? ` for ${note}` : ''} — it will be on Train in a moment.`,
        undo: null, receipt: false,
        extra: { open: { screen: 'workouts', quick: { minutes, note } } },
      };
    },
  },
  {
    id: 'inbox.approve', tier: 'act',
    describe: 'say yes to a card waiting in his Inbox — the newest one ("approve that", "approve the latest") or the one he names by its title',
    args: { card: 'the card, in his words, or "latest"' },
    async run(vaultPath, args) {
      const target = await pendingCard(args.card);
      const { approveRecord } = await import('./inbox.js');
      const done = await approveRecord(vaultPath, target.id);
      const title = cardTitle(target);
      return {
        destination: `Inbox — approved "${short(title)}"`,
        said: `Done — "${short(title, 70)}"${done?.destination ? ` went to ${short(done.destination, 60)}` : ' is approved'}.`,
        undo: { recordId: target.id, title: short(title, 60) },
      };
    },
    async undo(vaultPath, u) {
      const { getRecord } = await import('./inboxStore.js');
      const r = await getRecord(u.recordId);
      if (!r || r.status !== 'filed' || !r.undoData) throw new Error(`"${u.title}" has nothing Nova can take back`);
      const { undoRecord } = await import('./inbox.js');
      await undoRecord(vaultPath, r.id);
      return `took back "${u.title}"`;
    },
  },
  {
    id: 'inbox.undo', tier: 'act',
    describe: 'take back something that was filed or done — "undo that" (the newest thing with an undo) or one he names by its title. There is no redo: say so',
    args: { card: 'the thing, in his words, or "latest"' },
    async run(vaultPath, args) {
      const target = await filedCard(args.card);
      const { undoRecord } = await import('./inbox.js');
      const out = await undoRecord(vaultPath, target.id);
      const title = cardTitle(target);
      return {
        destination: `Undone — "${short(title)}"`,
        said: `Undone — ${out?.undoSummary ? short(out.undoSummary, 90) : `"${short(title, 70)}" is taken back`}.`,
        undo: null,
      };
    },
  },
];


// ------------------------------------------------------------ the helpers

// Nova's screens by the names he uses for them. The tab labels (tabOrder.js,
// his own words for the tabs) plus the everyday aliases; practice and the
// briefing player are screens without a tab.
const SCREEN_ALIASES = {
  home: 'mission', today: 'mission', nova: 'voice', chat: 'voice', conversation: 'voice', voice: 'voice',
  fuel: 'recipes', recipes: 'recipes', 'recipe bank': 'recipes', meals: 'recipes', food: 'recipes', nutrition: 'recipes',
  shop: 'shopping', shopping: 'shopping', 'shopping list': 'shopping', groceries: 'shopping', 'grocery list': 'shopping',
  'to-do': 'todos', todo: 'todos', todos: 'todos', 'to-dos': 'todos', 'to-do list': 'todos', 'todo list': 'todos',
  train: 'workouts', training: 'workouts', workouts: 'workouts', workout: 'workouts', gym: 'workouts', coach: 'workouts',
  inbox: 'inbox', notes: 'notes', journal: 'journal', money: 'money', finances: 'money', budget: 'money', stash: 'stash',
  ops: 'ops', operations: 'ops', agents: 'ops', settings: 'settings', library: 'library', books: 'library', bookshelf: 'library',
  documents: 'documents', docs: 'documents', galaxy: 'galaxy', code: 'code', practice: 'practice', rehearsal: 'practice',
  briefing: 'briefing', briefings: 'briefing',
};
const SCREEN_LABEL = { ...Object.fromEntries(TAB_META), practice: 'Practice', briefing: 'Briefing' };

/** "the shopping list" → { screen: 'shopping', label: 'Shop' }, or null. Pure. */
export function screenFor(words) {
  const k = String(words || '').toLowerCase().replace(/[’']/g, "'").replace(/^(?:the|my|nova's)\s+/, '').replace(/\s+(?:screen|tab|page|section)$/, '').replace(/\s+/g, ' ').trim();
  const screen = SCREEN_ALIASES[k] || (SCREEN_LABEL[k] ? k : null);
  return screen ? { screen, label: SCREEN_LABEL[screen] || screen } : null;
}

const cardTitle = (r) => String(r?.decision?.title || r?.text || r?.id || '').trim();
const LATEST_RE = /^(?:latest|last|newest|that|it|this|the last one|the latest one|the newest one|the last thing|what you (?:just )?did)$/i;

async function pendingCard(words) {
  const { listRecords } = await import('./inboxStore.js');
  const pending = (await listRecords()).filter((r) => r.status === 'pending')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!pending.length) throw new Error('nothing is waiting in your Inbox');
  if (LATEST_RE.test(say(words))) return pending[0];
  const m = matchName(pending, words, { label: cardTitle });
  if (!m.hit) throw new Error(m.ambiguous ? m.why : `nothing waiting in your Inbox is called "${short(words, 40)}"`);
  return m.hit;
}

async function filedCard(words) {
  const { listRecords } = await import('./inboxStore.js');
  const filed = (await listRecords()).filter((r) => r.status === 'filed' && r.undoData)
    .sort((a, b) => String(b.filedAt || b.createdAt).localeCompare(String(a.filedAt || a.createdAt)));
  if (!filed.length) throw new Error('there is nothing I can undo');
  if (LATEST_RE.test(say(words))) return filed[0];
  const m = matchName(filed, words, { label: cardTitle });
  if (!m.hit) throw new Error(m.ambiguous ? m.why : `nothing filed is called "${short(words, 40)}"`);
  return m.hit;
}

/** Does this card exist? For the grammar's "approve X" / "undo X" candidates. */
export async function probeCard(verbId, words) {
  try {
    const r = verbId === 'inbox.approve' ? await pendingCard(words) : await filedCard(words);
    return { ok: true, label: `the Inbox card "${short(cardTitle(r), 50)}"` };
  } catch (e) { return { ok: false, why: e.message }; }
}

// ---------------------------------------------------------------- the grammar

// The strict shapes, for a sentence the grammar is SURE about. Anything less
// sure goes to the model, which reaches the same verbs by ACT.

const GREETING_RE = /^(?:hey|hi|ok|okay)?[,\s]*(?:nova|jarvis)[,\s]*/i;
// things that are not jobs even with a link in them — a reminder to watch
// something at 8 is a reminder
const LEAVE_RE = /^(?:remind me|set (?:a |me a )?reminder|to-?do:|todo:|add\b.+\bto (?:my |the )?(?:to-?dos?|to-?do list|todo list|calendar)\b)/i;
// "analyse this video" (his 1 Oct words): the deep weave. Only when the
// sentence OPENS with it — "watch and analyse this" stays the Watcher's
// triage (his 4 Sep case, pinned in chatFrontDoor.test.js).
const ANALYSE_RE = /^(?:(?:can|could|would) you\s+|please\s+|go\s+(?:and\s+)?)?(?:analy[sz]e|deep[- ]?dive(?: into)?|break down|weave)\b/i;
const OPEN_LEAD_RE = /^(?:open|go to|browse|play|show|pull up|bring up|put on|navigate|log ?in)\b/i;
// he wants it KEPT, and has not said more
const KEEP_RE = /^(?:(?:can you\s+|please\s+)?(?:save|keep|file|stash|bookmark|capture|store|hold on to)\b(?:\s+(?:this|that|it|the link|this link|for later))*|for later|later)$/i;
const RESEARCH_LEAD_RE = /^(?:(?:can|could) you\s+|please\s+|go\s+)?(?:research|read|look into|dig into|summari[sz]e|fact[- ]?check)\b/i;
// "research X (and capture it)"
const RESEARCH_CMD_RE = /^(?:(?:can|could|would) you\s+|please\s+|go\s+(?:and\s+)?)?(?:research|do (?:some |a bit of )?research (?:on|into)|dig into)\s+(.+?)(?:[,.]?\s+(?:and|then)\s+(?:then\s+)?(?:capture|save|file|keep|store|log|add)\s+(?:it|that|this|them|what you find|the (?:brief|results?|findings|answer))(?:\s+(?:for me|to my inbox|in my inbox|in the inbox|as a note))?)?$/i;
// "capture this: …", "note that …", "remember that/to …", "add … to my inbox"
const CAPTURE_CMD_RE = /^(?:(?:please\s+)?(?:capture|note(?:\s+down)?|jot(?:\s+down)?|log this|inbox)(?:\s+(?:this|that))?\s*[:,-]?\s+|remember\s+(?:that|to)\s+|(?:add|put)\s+(?:this\s+)?(?:to|in|into)\s+(?:my\s+|the\s+)?inbox\s*[:,-]?\s+)(.+)$/i;
const TO_INBOX_RE = /^(?:add|put)\s+(.+?)\s+(?:to|in|into)\s+(?:my\s+|the\s+)?inbox$/i;
// "add eggs and milk to my shopping list" — the Inbox's classifier files it
// with its categories, exactly as the Inbox box would
const SHOPPING_ADD_RE = /^(?:add|put)\s+.+?\s+(?:to|on|onto)\s+(?:my\s+|the\s+)?shopping(?:\s+list)?$/i;
// "build me a 30 minute session", "give me a quick workout for legs"
const QUICK_RE = /^(?:build|make|give|plan|put together|start)\s+(?:me\s+)?(?:a\s+)?(?:quick\s+)?(?:(\d{1,3})[- ]?min(?:ute)?s?\s+)?(?:quick\s+)?(?:session|workout)(?:\s+(?:for|with|focusing on|on|hitting|that hits)\s+(.+))?$/i;

/**
 * The job grammar. Takes his RAW words (a link keeps its capitals — an
 * Instagram reel id is case-sensitive) and returns { verb, args } for a
 * sentence it is sure about, or null.
 */
export function parseJobCommand(text, ctx = {}) {
  const raw = String(text || '').replace(GREETING_RE, '').trim();
  if (!raw || LEAVE_RE.test(raw)) return null;
  const urls = urlsIn(raw).map((u) => u.replace(/[.,;:!?)\]]+$/, ''));
  const prose = raw.replace(URL_RE, ' ').replace(/\s+/g, ' ').replace(/^[\s:,—–-]+|[\s:,—–-]+$/g, '').trim();
  const p = prose.toLowerCase().replace(/[.!]+$/, '').trim();

  if (urls.length > 1) return null; // several links: a study or a plan — not one verb
  // "open https://…", "play https://…": the Mac's hand or the browser's, not a job
  if (urls.length && OPEN_LEAD_RE.test(p)) return null;
  if (urls.length === 1) {
    const url = urls[0];
    const lane = routeIntent(raw).lane;
    const link = classifyLink(url, prose);
    if (link.kind === 'recipe-reel' || (lane === 'recipe' && p)) return { verb: 'recipe.import', args: { url, ...(prose ? { words: prose } : {}) } };
    if (lane === 'repertoire') return { verb: 'repertoire.start', args: { url, words: prose } };
    if (link.kind === 'video') {
      if (lane === 'weave' || ANALYSE_RE.test(p)) return { verb: 'video.analyse', args: { url } };
      if (!p || KEEP_RE.test(p)) return { verb: 'link.file', args: { url, ...(prose ? { words: prose } : {}) } };
      if (CAPTURE_CMD_RE.test(prose)) return { verb: 'capture.add', args: { text: raw } };
      return { verb: 'video.watch', args: { url, ...(prose ? { question: prose } : {}) } };
    }
    if (link.kind === 'channel') return { verb: 'link.file', args: { url, ...(prose ? { words: prose } : {}) } };
    // a page
    if (!p || KEEP_RE.test(p)) return { verb: 'link.file', args: { url, ...(prose ? { words: prose } : {}) } };
    if (CAPTURE_CMD_RE.test(prose)) return { verb: 'capture.add', args: { text: raw } };
    if (RESEARCH_LEAD_RE.test(p) || /\?$/.test(prose)) {
      const asked = prose.replace(/\s*(?:and|then)\s+(?:capture|save|file|keep)\s+(?:it|that|this)\s*$/i, '');
      const bare = /^(?:(?:can|could) you\s+|please\s+)?(?:read|summari[sz]e|research|look into|dig into|fact[- ]?check)(?:\s+(?:this|it|that|the (?:article|page|link)))?(?:\s+for me)?[.!]?$/i.test(asked);
      return { verb: 'research.run', args: { question: bare || !asked ? 'Read and summarise this' : asked, url } };
    }
    return null;
  }

  // no link
  if (/\?$/.test(raw)) return null; // a question is answered, not dispatched
  let m;
  if ((m = raw.match(CAPTURE_CMD_RE))) return { verb: 'capture.add', args: { text: m[1].trim() } };
  if ((m = raw.match(TO_INBOX_RE))) return { verb: 'capture.add', args: { text: m[1].trim() } };
  if (SHOPPING_ADD_RE.test(raw)) return { verb: 'capture.add', args: { text: raw } };
  const routed = routeIntent(raw);
  if (routed.lane === 'brief') return { verb: 'briefing.start', args: { topic: raw } };
  if (routed.lane === 'book' && routed.book) return { verb: 'book.add', args: { title: routed.book.title, author: routed.book.author } };
  if (routed.lane === 'practice') return { verb: 'practice.prepare', args: { skill: raw } };
  // the browser hand (the app's doors start it on the device, where its
  // windows land on the glass; this is the door with no screen — Siri)
  if (routed.lane === 'browse' && ctx.direct) return { verb: 'browse.run', args: { task: raw } };
  if ((m = raw.match(RESEARCH_CMD_RE))) return { verb: 'research.run', args: { question: m[1].trim() } };
  if ((m = raw.match(QUICK_RE)) && (m[1] || /\bquick\b/i.test(raw))) {
    const minutes = m[1] ? Number(m[1]) : 30;
    return { verb: 'quick.session', args: { minutes, ...(m[2] ? { note: m[2].trim() } : {}) } };
  }
  return null;
}

// exported for the tests' neighbour checks
export const _grammar = { ANALYSE_RE, KEEP_RE, CAPTURE_CMD_RE, RESEARCH_CMD_RE, QUICK_RE, RECIPE_WORDS_RE };
