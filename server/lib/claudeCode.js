import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { NOVA_LENS } from './lens.js';

// launchd services don't inherit the interactive shell's PATH — use the absolute path.
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '1.5';

// Deliberately no Bash — this tab can read and edit real files (in the Nova OS
// repo or the vault, whichever workspace is selected) but can't run shell
// commands. Every other AI feature in Nova runs with zero tool access; this
// is the first one that can touch the filesystem, so it stays to the
// smallest capability that's still genuinely useful for "coding" — file
// read/write, not process execution.
//
// IMPORTANT: --allowedTools is NOT a hard restriction under
// --permission-mode bypassPermissions — verified empirically that Bash (and
// the full built-in toolset, plus any connected MCP servers) stays reachable
// even when only Read/Edit/Write/Grep/Glob are named there. --disallowedTools
// IS enforced as a real block regardless of permission mode, so that's the
// actual safety boundary — --allowedTools is kept only for documentation.
// --strict-mcp-config drops all MCP-provided tools (Slack, Notion, Gmail,
// etc.) since none of those were ever intended to be reachable from here.
// This exact combination was verified by asking Claude to exhaustively list
// its available tools and confirming the result was precisely
// Read/Edit/Write/Glob/Grep — nothing else.
const ALLOWED_TOOLS = 'Read Edit Write Grep Glob';
const DISALLOWED_TOOLS = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'WebFetch', 'WebSearch', 'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
].join(',');

const jobs = new Map();

// ---------------------------- warm conversations ----------------------------
// A follow-up turn used to pay the full CLI boot (~1.5–2.5s) before the
// model even started. Conversational sessions (Voice, Coach) now keep ONE
// process alive per session via --input-format stream-json: turn 2+ writes
// a user message to stdin and first words arrive in ~1s instead of ~6
// (measured live, scratchpad warm-test). The pool is a pure accelerator —
// continuity NEVER depends on it: every entry is keyed by the CLI session
// id, so an idle-killed or crashed process just means the next turn
// respawns with --resume and pays the boot once. Budget errors drop the
// entry the same way (fresh budget on respawn).
const warm = new Map();
const WARM_IDLE_MS = 10 * 60_000;
const WARM_MAX = 4;

function dropWarm(key) {
  const w = warm.get(key);
  if (!w) return;
  warm.delete(key);
  try { w.child.kill(); } catch { /* already gone */ }
}

const warmSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, w] of warm) {
    if (!w.currentJob && now - w.lastUsed > WARM_IDLE_MS) dropWarm(key);
  }
}, 60_000);
warmSweep.unref?.();

function spawnWarm(key, { cwd, args, env }) {
  const child = spawn(CLAUDE_BIN, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: env ? { ...process.env, ...env } : undefined });
  const w = { child, currentJob: null, finishTurn: null, streamed: '', stderr: '', lastUsed: Date.now() };
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (!w.currentJob) continue; // per-turn init/system chatter between turns
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
        w.streamed += ev.event.delta.text;
        w.currentJob.partial = w.streamed;
      } else if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
        const txt = ev.message.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
        if (txt) { w.streamed = txt; w.currentJob.partial = txt; } // authoritative snapshot
      } else if (ev.type === 'result') {
        const job = w.currentJob;
        const finish = w.finishTurn;
        const replyText = ev.is_error ? null : ((ev.result || '').trim() || w.streamed.trim());
        const errMsg = ev.is_error ? (ev.result || 'request failed') : (replyText ? null : 'Empty response');
        w.currentJob = null;
        w.finishTurn = null;
        w.streamed = '';
        w.lastUsed = Date.now();
        if (errMsg) {
          job.status = 'error';
          job.error = errMsg;
          dropWarm(key); // a fresh process (and budget) next turn, via --resume
        } else {
          Promise.resolve(finish(replyText, job)).catch((e) => { job.status = 'error'; job.error = e.message; });
        }
      }
    }
  });
  child.stderr.on('data', (d) => { w.stderr += d; });
  const die = () => {
    if (warm.get(key) === w) warm.delete(key);
    if (w.currentJob) {
      w.currentJob.status = 'error';
      w.currentJob.error = (w.stderr || '').trim() || 'the conversation process exited';
      w.currentJob = null;
      w.finishTurn = null;
    }
  };
  child.on('close', die);
  child.on('error', die);
  warm.set(key, w);
  return w;
}

// One conversational turn: reuse the session's live process, or spawn one
// (args carry --session-id on turn 1 and --resume thereafter, so a cold
// spawn is always continuity-safe). finishTurn runs the per-surface
// post-processing (panels, proposals, research) and marks the job ready.
function warmTurn({ kind, sessionId, cwd, args, text, job, finishTurn, env }) {
  const key = `${kind}:${sessionId}`;
  let w = warm.get(key);
  if (w && (w.child.exitCode !== null || w.currentJob)) { dropWarm(key); w = null; }
  if (!w) {
    if (warm.size >= WARM_MAX) {
      const idle = [...warm.entries()].filter(([, x]) => !x.currentJob).sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (idle) dropWarm(idle[0]);
    }
    w = spawnWarm(key, { cwd, args, env });
  }
  w.currentJob = job;
  w.finishTurn = finishTurn;
  w.streamed = '';
  w.lastUsed = Date.now();
  w.child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n');
}

// message: { text, sessionId?, model? } — sessionId absent means start a new
// conversation (a fresh session id is minted and returned for the caller to
// pass on the next turn); present means continue that conversation via
// --resume, preserving full context across turns.
export function startMessage(cwd, { text, sessionId, model }) {
  const jobId = randomUUID().slice(0, 8);
  const isNewSession = !sessionId;
  const effectiveSessionId = sessionId || randomUUID();
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const args = [
    // conversational input mode — warm pool keeps the process alive between
    // turns, so a follow-up message skips the CLI boot
    '-p', '--input-format', 'stream-json',
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', ALLOWED_TOOLS,
    '--disallowedTools', DISALLOWED_TOOLS,
    '--strict-mcp-config',
    // Streaming here too: the Code tab renders the reply as it's written,
    // same contract as the Ask Nova path (job.partial via the shared poll).
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--max-budget-usd', MAX_BUDGET_USD,
  ];
  args.push(isNewSession ? '--session-id' : '--resume', effectiveSessionId);
  if (model) args.push('--model', model);

  warmTurn({
    kind: 'code',
    sessionId: effectiveSessionId,
    cwd,
    args,
    text,
    job,
    finishTurn: (replyText, turnJob) => {
      turnJob.result = { text: replyText, sessionId: effectiveSessionId };
      turnJob.status = 'ready';
    },
  });

  return jobId;
}

export function getMessageJob(jobId) {
  return jobs.get(jobId) || null;
}

// Test-only visibility into the warm pool: which sessions hold a live
// process, and its pid — so a test can prove turn 2 reused turn 1's process.
export function _warmStats() {
  return [...warm.entries()].map(([key, w]) => ({ key, pid: w.child.pid, busy: !!w.currentJob }));
}
export function _dropAllWarm() {
  for (const key of [...warm.keys()]) dropWarm(key);
}

// Ask Nova — the voice screen's brain. A READ-ONLY session over the vault
// (same structural boundary as the Breaker: Edit/Write disallowed) that
// answers questions from what's actually written there, in a spoken
// register. Exported separately so tests can check the prompt contract
// without spawning anything.
export function buildAskPrompt({ question, context = '', direct = false }) {
  return `${NOVA_LENS}

You are Nova — Hayden's personal OS and ongoing companion. This is a CONTINUING conversation: it resumes across days, so remember what he tells you here and build on it naturally, the way a sharp assistant who knows him would. Your working directory is his Obsidian vault — real notes, health pages, workout sessions, recipes, journal, money ledger context. Read whatever pages you need.

Ground rules:${direct ? `
- THIS IS A HANDS-FREE ONE-SHOT (Siri): he asked ONE question and will hear ONE spoken reply, then the exchange ends. Answer exactly what he asked — nothing else. No greeting, no rundown of his day, no unsolicited observations, no follow-up questions. If the answer is a number, give the number and its date in one or two sentences and stop.` : ''}
- Ground answers in the vault, the live context below, and what he's told you in this conversation. If something isn't anywhere, say so plainly — never invent.
- Spoken register: conversational, direct, no markdown, no bullet lists. Lead with the answer. Under ~90 words unless the question genuinely needs more. Address him as "sir" the way a great butler would — warmly, at natural moments (a greeting, a handoff, a wry aside), never in every sentence and never stiffly.
- Mention page titles naturally when useful ("your Rigour Protocols note says…").
- BE FAST. The live context below usually already holds the answer — reply straight from it. Only read the vault (Read/Grep/Glob) when the question genuinely needs a specific page you don't already have in front of you; don't search reflexively, it just adds delay.
- You never write anything yourself. When he asks you to CHANGE or ADD something, end your reply with ONE typed proposal line — Nova's code turns it into a pending draft he approves with a word:
  PROPOSE {"kind":"capture","text":"<the thing to file, in plain words — a to-do, shopping item, journal line, note, idea, expense, or a stash link WITH its URL>"}
  PROPOSE {"kind":"calendar","command":"<the calendar change in plain words, e.g. move gym to 6pm tomorrow>"}
  PROPOSE {"kind":"routine-edit","action":"swap|add|remove|targets","routine":"<exact routine name>","remove":"<exact exercise>","add":"<exercise>","targetSets":3,"targetRepsLow":8,"targetRepsHigh":10,"reason":"<why>"}
  PROPOSE {"kind":"rotation-variant","slot":"breakfast|lunch|dinner|snack|extra","variant":"<exact alternate name, or omit to clear today's variant>"}
  PROPOSE {"kind":"preference","rule":"<the standing rule as one timeless sentence>"} — use this when he corrects you or states a lasting way he wants things done ("always…", "never…", "I prefer…"). Once approved it lands on his Standing Instructions page and EVERY agent reads it from then on — correct once, written down.
  PROPOSE {"kind":"profile","patch":{"focus":"…" | "priorities":["…"] | "bestSelf":"…" | "notes":"…"}} — when he tells you who he is or what he's working toward (his focus, real priorities, what his best looks like, standing constraints): one area per proposal, HIS words tightened, never invented. Approved, it merges into the About You page every agent reasons from.
  At most one PROPOSE per reply, on its own final line (after a SHOW line if you use both). Use EXACT names from his real data — never invent names or URLs. In your text, say you've drafted it and that a "yes" (or the Inbox) makes it real — NEVER claim it's already done. Only propose what he actually asked for. If he asks you to remember something permanently, tell him to tap REMEMBER on your reply instead.
- Be a companion, not a search box: notice patterns across what he shares, connect it to his goals, and say the useful hard thing kindly when the data warrants it.
- CANVAS: you can put ONE live panel on his screen next to your reply. To use it, end the reply with a single final line, exactly one of:
  SHOW {"panel":"training-week"}
  SHOW {"panel":"exercise","name":"<exact exercise name>"}
  SHOW {"panel":"nutrition-week"}
  SHOW {"panel":"note","title":"<the note's title>"}
  SHOW {"panel":"pulse","topic":"<one of his Interests topics>"} — the cached what's-new feed for a topic (refreshed overnight); use when he asks what's new on something he follows. If nothing is cached you'll get an honest note — offer RESEARCH for a fresh look instead.
  Nova's own code draws the panel from the real vault — you only NAME it; never describe the panel's numbers in your text, and never invent an exercise or note name. Use "note" when you cite a vault page or he asks what a note says — it puts the page's own words on screen. Use the others when he asks to see something or a visual genuinely helps; most replies need no SHOW line. The line is stripped before he reads the reply, so don't refer to it.
- RESEARCH: ONLY when he explicitly asks you to research something or look it up online, end the reply with one line: RESEARCH {"question":"<the question, tight and specific>"}. Nova's Researcher (web-read-only, citation-required) runs it; the brief arrives in this conversation as a sources panel AND lands in his Inbox for review. In your text say it's dispatched and takes a couple of minutes — never state findings you don't have yet. If he says tonight/overnight/"queue it", add "when":"tonight" — it then runs in the overnight window (03:30) and the brief is waiting in his Inbox by morning; say exactly that. Never fire this on your own initiative.
- WATCH: ONLY when he gives you a video link (YouTube etc.) and asks you to watch, review, or evaluate it, end the reply with one line: WATCH {"url":"<the exact URL he gave>","question":"<his specific ask about it, or omit>"}. Nova's Watcher pulls the transcript locally and drafts either the Coach's evidence-checked verdict (fitness content) or a distilled reference note (podcasts, talks) — pending in his Inbox for review. In your text say it's dispatched and takes a few minutes — never describe a video you haven't seen. Use the EXACT URL from his message; never invent one. Never fire this on your own initiative.

Live context (deterministic, computed at conversation start — trust it over stale pages for today's numbers):
${context || '(unavailable)'}

Hayden asks: ${question}`;
}

// Continuity: the first ask mints a session; later asks --resume it, so the
// conversation carries across turns AND days (same mechanism as the Code
// tab). The client persists the returned sessionId; NEW CHAT drops it.
export function startAskNova(cwd, { question, context, sessionId, direct = false }) {
  const jobId = randomUUID().slice(0, 8);
  const isNewSession = !sessionId;
  const effectiveSessionId = sessionId || randomUUID();
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const args = [
    // conversational input mode: the prompt/question arrives as a stdin
    // message, and the process STAYS ALIVE between turns (warm pool above)
    '-p', '--input-format', 'stream-json',
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', BREAKER_DISALLOWED,
    '--strict-mcp-config',
    // STREAMING: text deltas land in job.partial as they generate, so the
    // client renders (and speaks) the reply while it's still being written —
    // the difference between a lookup and a conversation. Event shapes
    // verified live: stream_event/content_block_delta text_delta (thinking
    // deltas excluded), full 'assistant' snapshots, final 'result'.
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--max-budget-usd', MAX_BUDGET_USD,
    // Haiku for the voice line: the rich deterministic context is already
    // injected, so a fast model answers conversationally in a fraction of
    // the time while staying grounded. (Coach/Researcher keep the default.)
    '--model', 'haiku',
  ];
  args.push(isNewSession ? '--session-id' : '--resume', effectiveSessionId);

  const finishTurn = async (replyText, turnJob) => {
    try {
      // Canvas: the model may end with one SHOW {"panel":...} line. Parse it
      // out and build the panel DETERMINISTICALLY from the vault — the model
      // names a view, our code draws it. A bad directive degrades honestly.
      const { parseShowDirective, buildPanel } = await import('./panels.js');
      // cleanText === replyText when no directive matched, so never fall back
      // to replyText here — that would put a raw directive line back into the
      // reply when the model sent ONLY a directive and no prose.
      const { cleanText, directive } = parseShowDirective(replyText);
      let text = cleanText;
      let panel = null;
      if (directive) {
        try {
          panel = await buildPanel(cwd, directive);
        } catch (e) {
          text = `${text} (I tried to put a panel up for that, but ${e.message}.)`;
        }
      }
      // The model may also PROPOSE one action — parsed off the reply and
      // turned into a PENDING record on the rails. Nothing is written until
      // Hayden says yes; a bad proposal degrades to an honest note.
      const { parseCoachProposal } = await import('./coach.js');
      const parsed = parseCoachProposal(text);
      let proposal = null;
      if (parsed.proposal) {
        text = parsed.cleanText;
        try {
          const { createVoiceProposal } = await import('./voiceActions.js');
          proposal = await createVoiceProposal(cwd, question, parsed.proposal);
        } catch (e) {
          text = `${text} (I tried to draft that for you, but ${e.message} — nothing was changed.)`;
        }
      } else if (parsed.parseError) {
        text = `${text} (I tried to draft an action but got the format wrong — nothing was changed. Ask me again.)`;
      }
      // And it may dispatch ONE research job — the existing Researcher rails:
      // web-read-only, citation-required, always review-gated in the Inbox.
      const { parseResearchDirective, startResearch } = await import('./researcher.js');
      const res = parseResearchDirective(text);
      let research = null;
      if (res.research) {
        text = res.cleanText;
        try {
          if (res.research.when === 'tonight') {
            const { enqueueOvernight } = await import('./overnight.js');
            const item = await enqueueOvernight({ question: res.research.question });
            research = { queued: true, queueId: item.id, question: res.research.question };
          } else {
            const record = await startResearch(cwd, res.research.question);
            research = { recordId: record.id, question: res.research.question };
          }
        } catch (e) {
          text = `${text} (I tried to ${res.research.when === 'tonight' ? 'queue' : 'dispatch'} the research, but ${e.message}.)`;
        }
      } else if (res.parseError) {
        text = res.cleanText;
      }
      // And it may hand ONE video to the Watcher — transcript pulled locally,
      // the note always review-gated in the Inbox.
      const { parseWatchDirective, startVideoWatch } = await import('./watcher.js');
      const wd = parseWatchDirective(text);
      let watch = null;
      if (wd.watch) {
        text = wd.cleanText;
        try {
          const record = await startVideoWatch(cwd, wd.watch.url, wd.watch.question);
          watch = { recordId: record.id, url: wd.watch.url };
        } catch (e) {
          text = `${text} (I tried to hand that video to the Watcher, but ${e.message}.)`;
        }
      } else if (wd.parseError) {
        text = wd.cleanText;
      }
      // A directive-only reply leaves no prose — give the voice something
      // honest to say rather than reading a directive line aloud.
      if (!text.trim()) {
        text = panel ? 'Here it is.'
          : proposal ? 'Drafted — say yes to make it real, or leave it for the Inbox.'
          : research ? 'Research dispatched — give it a couple of minutes.'
          : watch ? 'The Watcher has it — the video\'s read lands in your Inbox in a few minutes.'
          : replyText;
      }
      turnJob.result = { text, sessionId: effectiveSessionId, panel, proposal, research, watch };
      turnJob.status = 'ready';
    } catch (e) {
      turnJob.status = 'error';
      turnJob.error = e.message;
    }
  };

  warmTurn({
    kind: 'voice',
    sessionId: effectiveSessionId,
    cwd,
    args,
    text: isNewSession ? buildAskPrompt({ question, context, direct }) : question,
    job,
    finishTurn,
  });

  return jobId;
}

// The doorman, unscripted: the greeting is GENERATED every time — Hayden's
// rule is that nothing Nova says may be templated — but every fact in it
// arrives from deterministic code; the model only does the talking. Fast by
// construction: haiku, no vault reads, streams through the same jobs map so
// the client renders it like any reply. A failed greeting stays silent
// rather than falling back to a canned line.
export function buildGreetingPrompt({ facts }) {
  return `${NOVA_LENS}

You are Nova greeting Hayden as he arrives — "sir", the way a great butler would: warm, brief, never stiff. Compose ONE spoken greeting: 1–3 sentences, under 55 words, plain text, no markdown, no questions unless something genuinely needs his decision.

Ground every specific ONLY in the facts below — never invent activity, numbers, or receipts. Pick the one or two most useful things to mention; if the facts are thin, a warm brief hello is perfect. Vary your phrasing naturally between visits — never a stock template. Do not read any files; answer immediately.

FACTS (deterministic, computed just now):
${facts}`;
}

export function startGreeting(cwd, { facts }) {
  const jobId = randomUUID().slice(0, 8);
  const effectiveSessionId = randomUUID();
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const args = [
    '-p', '--input-format', 'stream-json',
    '--permission-mode', 'bypassPermissions',
    // pure composition: EVERY tool blocked (disallowed is the enforced
    // boundary) — the facts are already in the prompt, and a doorman who
    // wanders off to read files keeps him waiting at the door
    '--allowedTools', '',
    '--disallowedTools', `${BREAKER_DISALLOWED},Read,Grep,Glob`,
    '--strict-mcp-config',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--model', 'haiku',
    '--session-id', effectiveSessionId,
  ];

  warmTurn({
    kind: 'greet',
    sessionId: effectiveSessionId,
    cwd,
    args,
    // extended thinking OFF: measured live, the persona prompt sent haiku
    // into ~15s of deliberation before one sentence of hello (20s → 3s).
    // A doorman greets from the hip; the facts are already on the tray.
    env: { MAX_THINKING_TOKENS: '0' },
    text: buildGreetingPrompt({ facts }),
    job,
    finishTurn: (replyText, turnJob) => {
      turnJob.result = { text: replyText.trim() };
      turnJob.status = 'ready';
    },
  });

  return jobId;
}

// Ask Coach — the Train screen's chat, made real. Same read-only structural
// boundary as Ask Nova, but a different persona: an evidence-based strength
// coach who knows Hayden's goals, history, and recovery data, and answers
// like a professional — principled, specific, honest about uncertainty.
export function buildCoachPrompt({ question, context = '' }) {
  return `${NOVA_LENS}

You are Nova's Coach — Hayden's personal strength & conditioning coach. This is a CONTINUING conversation that resumes across days — remember what he tells you and coach the long arc, not just today's question. You reason like an experienced, evidence-based practitioner: progressive overload, volume and intensity management, proximity to failure, recovery and sleep, protein targets, long-term adherence over heroics. You give the advice a great human coach would: specific to HIS data, decisive, and honest when evidence is mixed or his data is too thin to say.

Your working directory is Hayden's Obsidian vault — his real training sessions (Wiki/Health/Workouts/), fitness goals, exercise state, health pages, nutrition. Read what you need; never invent numbers that aren't there.

Ground rules:
- Anchor every recommendation in his actual goals and logged history below/in the vault. If history is too thin, say what to log so you can judge next time.
- Be concrete: exact exercises, sets × reps, loads (kg), rest, or habits — not generic advice.
- Cite the principle briefly when it matters ("two sessions topped your rep target — classic double-progression trigger") — teach, don't lecture.
- Safety: flag genuine red flags (pain vs soreness, sleep collapse) plainly; you are not a doctor and say so when it's medical.
- You never write directly — but when Hayden asks you to CHANGE his program (swap, add, or remove an exercise, or change its sets/reps), give your reasoning as normal AND append ONE line at the very end, exactly this shape:
  PROPOSE {"action":"swap","routine":"Pull","remove":"Spider Curl","add":"Incline Dumbbell Curl","targetSets":3,"targetRepsLow":8,"targetRepsHigh":10,"reason":"less elbow stress, same long-head bias"}
  Actions: "swap" (replace in place), "add" (fields: routine, add, targets), "remove" (fields: routine, remove), "targets" (fields: routine, exercise, targetSets/targetRepsLow/targetRepsHigh), "tune" (fields: exercise, and any of stepKg / repStep / hold:true — adjusts the progression engine itself for that exercise, no routine needed). Use EXACT routine and exercise names from his picture — never invent names. Only propose what he actually asked for; at most one PROPOSE per reply. It becomes a draft he approves in his Inbox — say so in your reply ("I've drafted the swap — approve it in your Inbox"), and never claim it's already done.
- FEEDBACK IS COACHING GOLD: when he pushes back on your coaching — a recommended jump felt too big, a load too light, an exercise aggravates something — treat it exactly as a great human coach would. First acknowledge and ask the one clarifying question that matters if the picture is incomplete (was it all sets or the last one? pain or just grind?). Then make it STICK: for progression-size feedback, PROPOSE {"action":"tune","exercise":"Overhead Press","stepKg":1.25,"reason":"+2.5kg jumps stall his OHP"} (smaller/larger weight step, repStep for bodyweight moves, or hold:true to pause progressions on that lift). His standing feedback appears in your context — never re-recommend something it corrects, and never take pushback personally or defensively; adjust and explain the why in one line.
- PROGRESSION IS MORE THAN KILOGRAMS: the default +2.5kg is wrong for many lifts — lateral raises, curls, cable work, anything where dumbbells jump 2kg at a time. When more load isn't the right next step, prescribe the alternative a good coach would: more reps first (repStep), a smaller step if the gym's equipment allows it (ask what increments he actually has access to if you don't know), or a QUALITY focus — slower 3-4s eccentric, a pause, strict tempo, fuller range — via PROPOSE {"action":"tune","exercise":"Lateral Raise","focus":"3s eccentric, same load","reason":"2.5kg is a 20% jump on this lift"}. A focus shows as a chip on that exercise in his session view until changed, and the weekly debrief holds the week against it.
- For anything else you cannot change (logging food, calendar), point him at the right surface. Never claim you wrote anything.
- SKIPPED WORK: if the context lists repeatedly-skipped exercises, raise the single most significant one once, naturally, after answering what he actually asked — name the count ("Spider Curls have missed 3 of your last 4 Pulls"), ASK WHY (no time? equipment busy? a niggle? you just hate it?), and STOP there. Do not propose a fix in the same breath — the reason decides whether it's a swap, a removal, moving it earlier in the session, or nothing at all. Once he tells you why, then offer the fix (and PROPOSE it if he wants it). Never raise the same one twice in a conversation, and never moralise about it.
- Plain text, conversational, tight. Lead with the answer.

Hayden's current picture (computed at conversation start — trust it over stale pages):
${context || '(unavailable)'}

Hayden asks: ${question}`;
}

export function startAskCoach(cwd, { question, context, sessionId }) {
  const jobId = randomUUID().slice(0, 8);
  const isNewSession = !sessionId;
  const effectiveSessionId = sessionId || randomUUID();
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const args = [
    // conversational input mode — the warm pool keeps this process alive
    // between turns, so a follow-up question skips the CLI boot entirely
    '-p', '--input-format', 'stream-json',
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', BREAKER_DISALLOWED,
    '--strict-mcp-config',
    // Streaming: the Coach's answer appears in the chat as it's written —
    // the wait used to be full-generation THEN a fake typing animation.
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--max-budget-usd', MAX_BUDGET_USD,
  ];
  args.push(isNewSession ? '--session-id' : '--resume', effectiveSessionId);

  const finishTurn = async (replyText, turnJob) => {
    try {
      // The Coach may PROPOSE a program change — the model decides, this
      // code validates against the real routines and files a PENDING record
      // on the rails; approval (his thumb) is what actually writes.
      const { parseCoachProposal, createCoachEditRecord } = await import('./coach.js');
      const { cleanText, proposal, parseError } = parseCoachProposal(replyText);
      let text = cleanText;
      let proposalOut = null;
      if (proposal) {
        try {
          const record = await createCoachEditRecord(cwd, { question, proposal });
          proposalOut = { recordId: record.id, title: record.decision.title };
        } catch (e) {
          text += `\n\n(I drafted that change but it didn't validate: ${e.message})`;
        }
      } else if (parseError) {
        text += `\n\n(I tried to draft that change but ${parseError} — ask again and I'll re-propose.)`;
      }
      turnJob.result = { text, sessionId: effectiveSessionId, proposal: proposalOut };
      turnJob.status = 'ready';
    } catch (e) {
      turnJob.status = 'error';
      turnJob.error = e.message;
    }
  };

  warmTurn({
    kind: 'coach',
    sessionId: effectiveSessionId,
    cwd,
    args,
    text: isNewSession ? buildCoachPrompt({ question, context }) : question,
    job,
    finishTurn,
  });

  return jobId;
}

// Quick Session — the Coach designs a one-off, time-boxed workout for days
// outside the program. Same read-only boundary; the output is a typed JSON
// plan the client loads into the normal session editor, so logging, editing,
// receipts, and history all work exactly like a programmed session.
export function buildQuickSessionPrompt({ minutes, note, context = '' }) {
  return `${NOVA_LENS}

You are Nova's Coach designing an IMPROMPTU session for Hayden — a one-off workout for a day outside his normal program. He has ${minutes} minutes${note ? ` and says: "${note}"` : ''}.

Design rules (think like a real coach):
- Fit the time box honestly: warm-up included in the budget, ~2-3 min per working set with rests. ${minutes} minutes ≈ ${Math.max(3, Math.round(minutes / 8))}-${Math.max(4, Math.round(minutes / 6))} working exercises.
- Serve his stated goals and RESPECT the week's context below — don't hammer what yesterday's session hammered or steal tomorrow's scheduled work; fill the gap the program leaves.
- Prefer exercises FROM HIS LIBRARY (exact names below) so his history and prefills attach; only invent an exercise if the library truly lacks the pattern.
- Give concrete prescriptions: sets × reps and a weight hint from his logged numbers where the library has history ("~80kg — last time 80×8"), or "start light" where it doesn't.
- One line of rationale: why THIS session today, tied to goals/recovery/context.

Hayden's picture (computed just now):
${context || '(unavailable)'}

Output ONLY a JSON object: {"name": "Short Session Name", "rationale": "one sentence", "exercises": [{"name": "Exact Library Name or new name", "sets": 3, "reps": 10, "weightHint": "~80kg" }]}. No code fences, no commentary.`;
}

export function startQuickSession(cwd, { minutes, note, context }) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const child = spawn(CLAUDE_BIN, [
    '-p', buildQuickSessionPrompt({ minutes, note, context }),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', BREAKER_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    try {
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const text = (outer.result || '').trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(text.slice(0, 200) || 'no JSON in plan response');
      job.result = { plan: JSON.parse(jsonMatch[0]) };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = code !== 0 && !(stdout || '').trim() ? (stderr.trim() || `claude exited with code ${code}`) : e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}

// The Sparring loop's Breaker: an isolated, READ-ONLY session that tries to
// break what the Builder (the normal chat) just shipped. Edit/Write join the
// disallowed list, so the separation of duties is structural — the Breaker
// proves weaknesses; only the Builder can fix them. Fresh session every time
// (no --resume): the Breaker judges the work cold, like a reviewer should.
const BREAKER_DISALLOWED = DISALLOWED_TOOLS + ',Edit,Write';

export function startBreaker(cwd, { focus }) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', result: null, error: null };
  jobs.set(jobId, job);

  const prompt = `You are the BREAKER in a builder/breaker sparring loop over this workspace. Your job is adversarial review: find what is genuinely broken, fragile, or wrong — then STOP. You cannot edit anything (your tools are read-only by design); the builder is the only one who can fix what you find.

${focus ? `The builder says the recent work to attack is: ${focus}` : 'No specific focus was given — inspect the most recently modified files and attack the newest work.'}

Method: read the relevant code carefully. Hunt for concrete failures — logic errors, unhandled edge cases, broken contracts between modules, regressions, data-loss risks. Trace real inputs through the code rather than pattern-matching on style. Do not report style nits, hypotheticals you couldn't trace, or praise.

Report format: a short verdict line, then a numbered list of findings — each with the file:line, what breaks, and the concrete input/state that triggers it. If you genuinely find nothing after a real attempt, say exactly that and note what you checked. Plain text, no markdown headers.`;

  const child = spawn(CLAUDE_BIN, [
    '-p', prompt,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', BREAKER_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(), // fresh session every time — the Breaker judges cold
  ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); // stdin closed — the CLI otherwise waits on the open pipe

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    try {
      // Prefer the CLI's own structured message even on a nonzero exit —
      // budget stops land there, with only noise on stderr.
      const outer = JSON.parse(stdout);
      if (outer.is_error || code !== 0) throw new Error(outer.result || stderr.trim() || `claude exited with code ${code}`);
      const replyText = (outer.result || '').trim();
      if (!replyText) throw new Error('Empty response');
      job.result = { text: replyText };
      job.status = 'ready';
    } catch (e) {
      job.status = 'error';
      job.error = code !== 0 && !(stdout || '').trim() ? (stderr.trim() || `claude exited with code ${code}`) : e.message;
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return jobId;
}
