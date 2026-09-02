import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { doublingSchedule, nextDueAt } from './spacing.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { NOVA_LENS } from './lens.js';
import { modelFor, laneSkipped } from './modelPrefs.js';
import { settleWatchdog } from './settle.js';

// THE LEADER — Hayden's leadership development agent. Its whole job is to
// make the leadership knowledge he already collects (podcasts, books, notes,
// woven concepts) actually reach him when it can change how he leads at
// work — one considered idea per day, repeated on purpose over time, and a
// conversation that turns his current struggles into research directions.
//
// Division of labour, per the Method: models INTERPRET (compose the day's
// idea, hold the conversation, run research); code DECIDES and ACTS (what
// enters the context, when a run happens, what reaches the brief and the
// widget, what gets written where). The brief/widget path reads a stored
// receipt — no model sits between him and the morning surface.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'leader.json');
const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const DAILY_BUDGET_USD = '0.6';
const RESEARCH_BUDGET_USD = '3.0';

// The daily composer reads the vault but must not touch the world; research
// is the ONE lane here allowed to search the web — that is its purpose.
const DAILY_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'WebFetch', 'WebSearch', 'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write',
].join(',');
const RESEARCH_DISALLOWED = DAILY_DISALLOWED.split(',').filter((t) => t !== 'WebFetch' && t !== 'WebSearch').join(',');

function pad(n) { return String(n).padStart(2, '0'); }
function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/* --------------------------------- state ---------------------------------- */

const EMPTY = () => ({
  // what he is working against / what is working for him — fed by the Leader
  // chat's REFLECT directive and the weekly debrief, always timestamped so
  // stale struggles age visibly instead of steering research forever
  profile: { struggles: [], working: [] },
  // researched insights, accumulated weekly — each carries provenance and a
  // surfacing history so repetition is deliberate, not accidental
  research: [],
  // one receipt per day — THE thing the homepage card, the brief and the
  // widget read. Newest last; capped.
  daily: [],
  // spaced-repetition memory for vault concepts (key -> {count, lastAt})
  spacing: {},
  lastResearchAt: null,
});

export async function readLeaderState() {
  if (!existsSync(STATE_PATH())) return EMPTY();
  try {
    const raw = JSON.parse(await readFile(STATE_PATH(), 'utf8'));
    const base = EMPTY();
    return {
      profile: {
        struggles: Array.isArray(raw.profile?.struggles) ? raw.profile.struggles : base.profile.struggles,
        working: Array.isArray(raw.profile?.working) ? raw.profile.working : base.profile.working,
      },
      research: Array.isArray(raw.research) ? raw.research : base.research,
      daily: Array.isArray(raw.daily) ? raw.daily : base.daily,
      spacing: raw.spacing && typeof raw.spacing === 'object' ? raw.spacing : base.spacing,
      lastResearchAt: raw.lastResearchAt || null,
    };
  } catch {
    return EMPTY();
  }
}

async function writeLeaderState(state) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = STATE_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, STATE_PATH());
}

/* -------------------------------- corpus ---------------------------------- */

// What counts as leadership material in HIS vault. Two tiers, tested
// against his real Concepts shelf before shipping: the BROAD list applies
// to TITLES only (his leadership inputs arrive as psychology and
// self-mastery concepts, not files labelled "leadership"), while body text
// only counts on STRONG words — mitochondria pages talk about "signals",
// "influence" and "communication" too, and the first cut of this filter
// pulled his whole biology shelf into the leadership corpus.
const LEAD_TITLE_WORDS = /leader|leadership|manage|manager|management|team|influen|communicat|delegat|feedback|account|conflict|negotiat|decision|deleg|respect|trust|coach|mentor|persuas|authorit|dominance|prestige|status\b|frame|confidence|discipline|ownership|responsib|blame|coura|charisma|meeting|one.on.one|culture|motivat|standard/i;
const LEAD_STRONG_WORDS = /leadership|\blead(ing|s)? (people|a team|teams)|manager|management|delegat|one.on.one|difficult conversation|team culture|accountab|performance review/i;
const isLeadership = (title, body = '') => LEAD_TITLE_WORDS.test(title) || LEAD_STRONG_WORDS.test(body);

// Concept pages: filename + first lines are enough to decide relevance and
// give the model a scent — it can Read the full page itself if it wants depth.
async function scanConcepts(vaultPath) {
  const dir = path.join(vaultPath, 'Wiki', 'Concepts');
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')); } catch { return []; }
  const out = [];
  for (const f of files) {
    const title = f.replace(/\.md$/, '');
    let head = '';
    try {
      const text = await readFile(path.join(dir, f), 'utf8');
      // skip frontmatter; take the first two content lines as the gist
      const body = text.replace(/^---[\s\S]*?---\s*/, '');
      head = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).slice(0, 2).join(' ');
    } catch { /* a title alone is still useful */ }
    if (isLeadership(title, head)) out.push({ key: `concept:${title}`, title, gist: head.slice(0, 200), path: `Wiki/Concepts/${f}` });
  }
  return out;
}

// Library sources (podcasts, books, articles the Watcher/Librarian wove) —
// filtered the same way over title + linked concepts.
async function scanSources(vaultPath) {
  try {
    const { Vault } = await import('./vault.js');
    const { buildLibrary } = await import('./library.js');
    const items = await buildLibrary(vaultPath, new Vault(vaultPath));
    return items
      .filter((s) => LEAD_TITLE_WORDS.test(s.title || '') || (s.concepts || []).some((c) => LEAD_TITLE_WORDS.test(c)))
      .map((s) => ({
        key: `source:${s.title}`,
        title: s.title,
        author: s.author || null,
        kind: s.kind || 'source',
        provenance: s.provenance || null,
        concepts: (s.concepts || []).slice(0, 6),
      }));
  } catch {
    return []; // honest degradation: no shelf, no source lines
  }
}

export async function leaderCorpus(vaultPath) {
  const [concepts, sources] = await Promise.all([scanConcepts(vaultPath), scanSources(vaultPath)]);
  return { concepts, sources };
}

/* ----------------------------- spaced repetition --------------------------- */

// Repetition is the point — he said so — but it must be SPACED, not random:
// each surfacing widens the gap (3d, then 6, 12, 24, capped at 35), and
// never-surfaced material always outranks a revisit. Same shape as the
// library resurfacing that already works.
const BASE_GAP_DAYS = 3;
const MAX_GAP_DAYS = 35;
export const SCHEDULE = doublingSchedule(BASE_GAP_DAYS, MAX_GAP_DAYS); // pinned beside the Library's in twins.test.js

export function pickSpaced(keys, spacing, nowMs, count = 4) {
  const scored = keys.map((k) => {
    const s = spacing[k];
    if (!s) return { k, due: true, order: -1 }; // never seen — front of the queue
    const dueAt = nextDueAt(s.lastAt, (s.count || 1) - 1, SCHEDULE);
    return { k, due: nowMs >= dueAt, order: dueAt };
  });
  return scored.filter((x) => x.due).sort((a, b) => a.order - b.order).slice(0, count).map((x) => x.k);
}

function markSurfaced(spacing, keys, nowMs) {
  for (const k of keys) {
    const s = spacing[k] || { count: 0, lastAt: 0 };
    spacing[k] = { count: s.count + 1, lastAt: nowMs };
  }
}

/* -------------------------------- context ---------------------------------- */

function ageDays(iso, now) { return Math.round((now - new Date(iso).getTime()) / 86400000); }

export function profileLines(profile, now = Date.now()) {
  const lines = [];
  const open = (profile.struggles || []).filter((s) => !s.resolvedAt);
  if (open.length) lines.push('CURRENT STRUGGLES (his words, newest first):\n' + open.slice(-6).reverse().map((s) => `- "${s.text}" (${ageDays(s.at, now)}d ago)`).join('\n'));
  const working = (profile.working || []).slice(-6).reverse();
  if (working.length) lines.push('WHAT IS WORKING FOR HIM (build on these):\n' + working.map((w) => `- "${w.text}" (${ageDays(w.at, now)}d ago)`).join('\n'));
  return lines;
}

export async function buildLeaderDailyContext(vaultPath, state, now = new Date()) {
  const parts = [];
  try {
    const { orgContext } = await import('./orgContext.js');
    const org = await orgContext(vaultPath, 'leader');
    if (org) parts.push(org);
  } catch { /* honest absence */ }
  parts.push(...profileLines(state.profile, now.getTime()));

  const { concepts, sources } = await leaderCorpus(vaultPath);
  const conceptKeys = concepts.map((c) => c.key);
  const researchKeys = state.research.map((r) => `research:${r.id}`);
  const picked = pickSpaced([...conceptKeys, ...researchKeys], state.spacing, now.getTime(), 5);

  const pickedConcepts = concepts.filter((c) => picked.includes(c.key));
  if (pickedConcepts.length) {
    parts.push('FROM HIS VAULT — concepts due for a revisit (ground today\'s idea in one or two; combining two into one actionable move is encouraged):\n'
      + pickedConcepts.map((c) => `- "${c.title}" — ${c.gist || '(read the page at ' + c.path + ' for the substance)'}`).join('\n'));
  }
  const pickedResearch = state.research.filter((r) => picked.includes(`research:${r.id}`));
  if (pickedResearch.length) {
    parts.push('FROM THE LEADER\'S RESEARCH LIBRARY (researched, not his notes — say so if quoted):\n'
      + pickedResearch.map((r) => `- ${r.insight}${r.source ? ` [${r.source}]` : ''}`).join('\n'));
  }
  if (sources.length) {
    parts.push('HIS LEADERSHIP SHELF (sources he has absorbed; use for grounding and attribution):\n'
      + sources.slice(0, 12).map((s) => `- "${s.title}"${s.author ? ` (${s.author})` : ''}${s.provenance === 'researched' ? ' [researched]' : ''} — ${s.concepts.join(', ')}`).join('\n'));
  }

  // the last week of ideas — so today VARIES unless a repeat is deliberate
  const recent = state.daily.slice(-7);
  if (recent.length) {
    parts.push('THE LAST DAYS\' IDEAS (vary from these; a deliberate revisit is fine if you SAY it is one):\n'
      + recent.map((d) => `- ${d.date}: ${d.title}`).join('\n'));
  }

  // today's calendar makes "try today" concrete — a meeting is a rep
  try {
    const { fetchEventsForRange } = await import('./calendar.js');
    const events = (await fetchEventsForRange(1)).filter((e) => e.date === todayISO(now));
    if (events.length) parts.push(`TODAY'S CALENDAR (an idea he can use IN one of these lands hardest): ${events.map((e) => `${e.time || ''} ${e.title}`.trim()).join(' · ')}.`);
  } catch { /* optional */ }

  return { context: parts.join('\n\n'), picked };
}

/* -------------------------------- prompts ---------------------------------- */

export function buildDailyPrompt(context, now = new Date()) {
  const dateLong = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' });
  return `${NOVA_LENS}

You are the LEADER — the leadership-development voice inside Nova, focused on how Hayden leads people at work. Compose his ONE leadership idea for ${dateLong}: the single thing worth trying, remembering or considering today. You may Read his vault pages for depth (paths are given below).

What to produce — exactly one of these kinds:
- "action": a concrete behaviour to TRY TODAY, small enough to actually do ("In today's 15:30, state the decision first, then take questions").
- "reminder": a principle he already knows, brought back at the right moment — repetition on purpose. Name where it comes from.
- "idea": a way of SEEING a situation (a reframe) worth holding this week.

Discipline:
- Ground it in HIS material below — his concepts, his sources, his stated struggles, what is working for him. Combining two concepts into one move is high value. Never invent a source or a quote.
- If it serves a CURRENT STRUGGLE, say so plainly — that is the connection that makes it land.
- One idea only. Small beats grand. Specific beats general. It must survive being read in ten seconds at 7am.
- Repetition over time is EXPECTED and good — but a repeat must be deliberate and freshly angled, never a lazy rerun of this week.

${context || '(no leadership material found in the vault yet — say so honestly and offer one universally sound, source-attributed fundamental instead)'}

Output ONLY a JSON object: {"kind":"action|reminder|idea","title":"<= 9 words","line":"the idea itself, 1-2 sentences, direct address","why":"one line: which struggle/concept/source this serves","refs":["exact titles of the concepts/sources used"]}. No code fences, no commentary.`;
}

export function buildResearchPrompt(state) {
  const open = (state.profile.struggles || []).filter((s) => !s.resolvedAt).slice(-5).map((s) => s.text);
  const working = (state.profile.working || []).slice(-4).map((w) => w.text);
  const known = state.research.slice(-30).map((r) => r.insight.slice(0, 90));
  return `${NOVA_LENS}

You are the LEADER's weekly RESEARCH run — leadership development for Hayden, who leads people at work. Search the web for genuinely strong, evidence-aware material (organisational psychology, respected practitioners, primary writing — not listicles) and bring back insights that will feed his daily leadership ideas.

Steer by his reality:
${open.length ? `HIS CURRENT STRUGGLES (research toward these first):\n${open.map((s) => `- ${s}`).join('\n')}` : '- No stated struggles right now — research fundamentals of leading small teams well: feedback, delegation, decision-making, difficult conversations.'}
${working.length ? `WHAT IS WORKING (find material that builds on these strengths):\n${working.map((w) => `- ${w}`).join('\n')}` : ''}

ALREADY IN THE LIBRARY (do not duplicate these):
${known.length ? known.map((k) => `- ${k}`).join('\n') : '- (empty)'}

Rules: every insight must carry its real source (author/outlet + URL you actually opened). 3 to 6 insights, each one usable — a practice, a framing, a finding — not a book summary. Honest provenance; no invented citations.

Output ONLY a JSON object: {"insights":[{"insight":"the usable idea in 1-2 sentences","topic":"2-4 word tag","source":"author/outlet","url":"https://…"}]}. No code fences, no commentary.`;
}

/* ------------------------------ daily generation --------------------------- */

function runClaude(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    settleWatchdog(child, { label: "the leader brief", minutes: 15 });
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error || code !== 0) return reject(new Error(outer.result || stderr.trim() || `claude exited ${code}`));
        const m = (outer.result || '').match(/\{[\s\S]*\}/);
        if (!m) return reject(new Error((outer.result || '').slice(0, 200) || 'no JSON in response'));
        resolve(JSON.parse(m[0]));
      } catch (e) { reject(new Error(`${e.message}${stderr ? ` — ${stderr.slice(0, 200)}` : ''}`)); }
    });
  });
}

export function todayLead(state, now = new Date()) {
  const t = todayISO(now);
  return state.daily.find((d) => d.date === t) || null;
}

export async function generateDailyLead(vaultPath, { force = false } = {}) {
  if (laneSkipped('leader-daily', 'the daily leadership idea')) return { skipped: true, reason: 'lane switched off in Settings' };
  const state = await readLeaderState();
  const now = new Date();
  const existing = todayLead(state, now);
  if (existing && !force) return { skipped: true, lead: existing };

  const { context, picked } = await buildLeaderDailyContext(vaultPath, state, now);
  const parsed = await runClaude([
    '-p', buildDailyPrompt(context, now),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob',
    '--disallowedTools', DAILY_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--model', modelFor('leader-daily'),
    '--max-budget-usd', DAILY_BUDGET_USD,
    '--session-id', randomUUID(),
  ], vaultPath);

  const lead = {
    date: todayISO(now),
    kind: ['action', 'reminder', 'idea'].includes(parsed.kind) ? parsed.kind : 'idea',
    title: String(parsed.title || '').trim().slice(0, 90),
    line: String(parsed.line || '').trim(),
    why: String(parsed.why || '').trim(),
    refs: (Array.isArray(parsed.refs) ? parsed.refs : []).map(String).slice(0, 4),
    createdAt: now.toISOString(),
  };
  if (!lead.title || !lead.line) throw new Error('the daily idea came back empty');

  // re-read before writing: the generation ran for a while and another
  // process may have landed today's idea first — last write must not clobber
  // an existing day unless this IS a forced re-run
  const fresh = await readLeaderState();
  const already = todayLead(fresh, now);
  if (already && !force) return { skipped: true, lead: already };
  fresh.daily = [...fresh.daily.filter((d) => d.date !== lead.date), lead].slice(-90);
  markSurfaced(fresh.spacing, picked, now.getTime());
  await writeLeaderState(fresh);

  // he chose Telegram as a surface — the day's idea reaches his pocket
  import('./telegram.js').then(({ sendTelegramText }) =>
    sendTelegramText(`Lead — try today\n\n${lead.title}\n${lead.line}${lead.why ? `\n\n(${lead.why})` : ''}`)).catch(() => {});

  return { lead };
}

/* ------------------------------ weekly research ---------------------------- */

const RESEARCH_GAP_DAYS = 6;

export async function runLeaderResearch(vaultPath, { force = false, fetchImpl } = {}) {
  if (laneSkipped('leader-research', 'the weekly leadership research')) return { skipped: true, reason: 'lane switched off in Settings' };
  const state = await readLeaderState();
  const now = new Date();
  if (!force && state.lastResearchAt && (now - new Date(state.lastResearchAt)) < RESEARCH_GAP_DAYS * 86400000) {
    return { skipped: true, reason: 'ran this week' };
  }

  const parsed = await runClaude([
    '-p', buildResearchPrompt(state),
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob WebSearch WebFetch',
    '--disallowedTools', RESEARCH_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--model', modelFor('leader-research'),
    '--max-budget-usd', RESEARCH_BUDGET_USD,
    '--session-id', randomUUID(),
  ], vaultPath);

  const insights = (Array.isArray(parsed.insights) ? parsed.insights : [])
    .map((i) => ({
      id: randomUUID().slice(0, 8),
      insight: String(i.insight || '').trim(),
      topic: String(i.topic || '').trim(),
      source: String(i.source || '').trim(),
      url: typeof i.url === 'string' && /^https?:\/\//.test(i.url) ? i.url : null,
      addedAt: now.toISOString(),
    }))
    .filter((i) => i.insight && i.source)
    .slice(0, 6);
  await verifyInsightUrls(insights, fetchImpl ? { fetchImpl } : {});

  const fresh = await readLeaderState();
  fresh.research = [...fresh.research, ...insights].slice(-200);
  fresh.lastResearchAt = now.toISOString();
  await writeLeaderState(fresh);

  // RESEARCH HE PAID FOR SHOULD BE FINDABLE. Until now these insights lived
  // only in leader.json, so the Library, the Galaxy, vault search and every
  // agent that reads pages were blind to them — he was paying for knowledge
  // that could never be searched, linked or resurfaced like every other
  // source he owns. They now ride the ingest rail into real vault pages:
  // staged, diffed, and waiting for his yes, exactly like a book or a
  // person. Cheap and honest — the text is already written, so this is a
  // weave, not a second research run.
  if (insights.length) {
    try {
      const { startIngest } = await import('./ingest.js');
      startIngest(vaultPath)(researchBody(insights, now), undefined, null, null);
    } catch (e) {
      console.error('leader research weave failed (the insights are still saved):', e.message);
    }
  }
  return { added: insights.length, insights, unverified: insights.filter((i) => i.linkOk === false).length };
}

// The woven page's body — pure, so the "(link unverified)" marker is tested
// rather than trusted.
export function researchBody(insights, now = new Date()) {
  return [
    `Leadership research — week of ${now.toISOString().slice(0, 10)}`,
    '',
    "Gathered by Nova's Leader agent from public sources, steered by what Hayden said he is working against. Each insight carries its own source; nothing here is his own writing.",
    '',
    ...insights.map((i) => `## ${i.topic || 'Insight'}\n\n${i.insight}\n\nSource: ${i.source}${i.url ? ` — ${i.url}${i.linkOk === false ? ' (link unverified)' : ''}` : ''}`),
  ].join('\n');
}

/* ------------------------------ link checking ------------------------------ */

// A researched insight is only as good as the source he can open. The model
// is told to cite URLs it actually opened; this is the cheap, deterministic
// check that it did — one HEAD per link (a GET when the host refuses HEAD),
// five seconds each. A link that fails is KEPT and marked "(link
// unverified)", never dropped: the insight may still be right, and an
// honest label beats a silent hole (audit [37] item 4).
export const LINK_TIMEOUT_MS = 5000;
const HEAD_REFUSED = new Set([403, 405, 501]);

export async function verifyInsightUrls(insights, { fetchImpl = globalThis.fetch, timeoutMs = LINK_TIMEOUT_MS } = {}) {
  const probe = async (url, method) => {
    const res = await fetchImpl(url, { method, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'NovaOS link check' } });
    return Number(res?.status) || 0;
  };
  await Promise.all(insights.map(async (i) => {
    if (!i.url) { i.linkOk = null; return; }
    try {
      let status = await probe(i.url, 'HEAD');
      if (HEAD_REFUSED.has(status)) status = await probe(i.url, 'GET');
      i.linkOk = status >= 200 && status < 400;
    } catch {
      i.linkOk = false;
    }
  }));
  return insights;
}

/* ------------------------------- reflection -------------------------------- */

// The chat (and the weekly debrief) hand back what he said about his own
// leading — struggles and wins, HIS words. Code merges; nothing is inferred
// here. A struggle he later reports as handled is resolved, not deleted —
// the history is how progress stays visible.
export async function applyLeaderReflection({ struggles = [], working = [], resolved = [] }) {
  const state = await readLeaderState();
  const now = new Date().toISOString();
  const norm = (t) => String(t || '').trim();
  const has = (list, text) => list.some((x) => x.text.toLowerCase() === text.toLowerCase());

  // Track exactly what THIS call added, so it can be taken back precisely —
  // an undo that removed every matching line would also delete something he
  // said last week.
  const added = { struggles: [], working: [], resolved: [] };

  for (const s of struggles.map(norm).filter(Boolean)) {
    if (!has(state.profile.struggles, s)) { state.profile.struggles.push({ text: s, at: now }); added.struggles.push(s); }
  }
  for (const w of working.map(norm).filter(Boolean)) {
    if (!has(state.profile.working, w)) { state.profile.working.push({ text: w, at: now }); added.working.push(w); }
  }
  for (const r of resolved.map(norm).filter(Boolean)) {
    const hit = state.profile.struggles.find((x) => !x.resolvedAt && x.text.toLowerCase().includes(r.toLowerCase()));
    if (hit) { hit.resolvedAt = now; added.resolved.push(hit.text); }
  }
  state.profile.struggles = state.profile.struggles.slice(-40);
  state.profile.working = state.profile.working.slice(-40);
  await writeLeaderState(state);

  // ON THE RAILS, LIKE EVERYTHING ELSE THAT WRITES.
  //
  // This was the platform's only write that rode nothing: a misheard
  // sentence became a standing fact about him, steering the daily idea and
  // Saturday's research, with no way to see or undo it. Nova's founding rule
  // is that everything writeable is undoable.
  //
  // FILED, not pending, deliberately: he says these things in the middle of
  // a conversation and being asked to approve each one would make the Leader
  // tiresome to talk to — and an approval he reflexively taps is not
  // consent, it is friction pretending to be a gate. Auto-file with a real
  // undo is the honest middle, and it is exactly what the trust ladder
  // grants elsewhere for low-stakes writes.
  const total = added.struggles.length + added.working.length + added.resolved.length;
  if (total) {
    try {
      const { createRecord } = await import('./inboxStore.js');
      const bits = [
        added.struggles.length ? `${added.struggles.length} struggle${added.struggles.length === 1 ? '' : 's'}` : null,
        added.working.length ? `${added.working.length} thing${added.working.length === 1 ? '' : 's'} working` : null,
        added.resolved.length ? `${added.resolved.length} resolved` : null,
      ].filter(Boolean).join(', ');
      await createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'leader-reflect',
        text: `The Leader noted ${bits}: ${[...added.struggles, ...added.working].map((t) => `"${t}"`).join('; ') || added.resolved.map((t) => `"${t}" resolved`).join('; ')}`,
        source: 'leader',
        mode: 'auto',
        status: 'filed',
        createdAt: now,
        filedAt: now,
        auto: true,
        destination: 'your leadership profile',
        undoData: { route: 'leader-reflect', added },
      });
    } catch { /* the profile write already succeeded; a missing receipt must not undo it */ }
  }
  return state.profile;
}

// The precise reversal: remove only what that reflection added, and un-resolve
// only what it resolved.
export async function undoLeaderReflection(added = {}) {
  const state = await readLeaderState();
  const lower = (a) => (a || []).map((t) => String(t).toLowerCase());
  const dropS = lower(added.struggles);
  const dropW = lower(added.working);
  const unres = lower(added.resolved);
  const before = state.profile.struggles.length + state.profile.working.length;
  state.profile.struggles = state.profile.struggles.filter((x) => !dropS.includes(x.text.toLowerCase()));
  state.profile.working = state.profile.working.filter((x) => !dropW.includes(x.text.toLowerCase()));
  for (const x of state.profile.struggles) {
    if (x.resolvedAt && unres.includes(x.text.toLowerCase())) delete x.resolvedAt;
  }
  await writeLeaderState(state);
  const removed = before - (state.profile.struggles.length + state.profile.working.length);
  return removed || unres.length
    ? `took that back out of your leadership profile${unres.length ? ` and reopened ${unres.length} struggle${unres.length === 1 ? '' : 's'}` : ''}`
    : 'that was already gone from your leadership profile';
}

// REFLECT directive — same contract shape as Coach's PROPOSE, same loud
// failure on prose: a typed line the model appends when he shares something
// about his leading; parsed off the reply, never shown raw.
export function parseLeaderReflect(text) {
  const m = (text || '').match(/^\s*REFLECT\s+(\{.*\})\s*$/m);
  if (!m) {
    const prose = (text || '').match(/^\s*REFLECT\b.*$/m);
    if (prose) {
      const cleanText = text.replace(prose[0], '').replace(/\n{3,}/g, '\n\n').trim();
      return { cleanText, reflect: null, parseError: 'the REFLECT line was prose, not the typed JSON form' };
    }
    return { cleanText: text, reflect: null };
  }
  const cleanText = text.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    const parsed = JSON.parse(m[1]);
    return {
      cleanText,
      reflect: {
        struggles: Array.isArray(parsed.struggles) ? parsed.struggles.map(String) : [],
        working: Array.isArray(parsed.working) ? parsed.working.map(String) : [],
        resolved: Array.isArray(parsed.resolved) ? parsed.resolved.map(String) : [],
      },
    };
  } catch {
    return { cleanText, reflect: null, parseError: 'the REFLECT block was not valid JSON' };
  }
}

/* ------------------------------- chat context ------------------------------ */

// The resumed turn's volatile line — twin of the Coach's fix. A Leader chat
// resumed days later carried its FIRST turn's picture: that day's idea, that
// day's struggles, under a prompt that says to trust them. Recomputed from
// local state every turn; the route prepends it (audit [37] item 1).
export async function leaderLiveLine(now = new Date()) {
  const state = await readLeaderState();
  const bits = [];
  const today = todayLead(state, now);
  bits.push(today ? `today's idea is "${today.title}"${today.why ? ` — ${today.why}` : ''}` : 'no idea has landed yet today');
  const struggles = state.profile.struggles || [];
  const open = struggles.filter((s) => !s.resolvedAt);
  bits.push(open.length ? `${open.length} open struggle${open.length === 1 ? '' : 's'}, newest "${open[open.length - 1].text}"` : 'no open struggles on file');
  const resolved = struggles.filter((s) => s.resolvedAt).sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1));
  if (resolved.length) bits.push(`latest resolved "${resolved[0].text}" (${ageDays(resolved[0].resolvedAt, now.getTime())}d ago)`);
  return `${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' })}: ${bits.join('; ')}.`;
}

export async function buildLeaderChatContext(vaultPath, now = new Date()) {
  const state = await readLeaderState();
  const parts = [];
  // How he is actually living this week — leadership advice given without
  // knowing he has missed three sessions and slept badly is advice given
  // blind. Inherited from the org block, not hand-wired here.
  try {
    const { orgContext } = await import('./orgContext.js');
    const org = await orgContext(vaultPath, 'leader');
    if (org) parts.push(org);
  } catch { /* honest absence */ }
  parts.push(...profileLines(state.profile, now.getTime()));
  const today = todayLead(state, now);
  if (today) parts.push(`TODAY'S IDEA (already on his homepage — build on it, don't repeat it at him): "${today.title}" — ${today.line}`);
  const recent = state.daily.slice(-7);
  if (recent.length > 1) parts.push('THIS WEEK\'S IDEAS: ' + recent.map((d) => `${d.date} "${d.title}"`).join(' · '));
  const { concepts, sources } = await leaderCorpus(vaultPath);
  if (concepts.length) parts.push('HIS LEADERSHIP CONCEPTS (Read the page when depth is needed):\n' + concepts.slice(0, 20).map((c) => `- "${c.title}" (${c.path})`).join('\n'));
  if (sources.length) parts.push('HIS SHELF: ' + sources.slice(0, 10).map((s) => `"${s.title}"${s.author ? ` (${s.author})` : ''}`).join(' · '));
  if (state.research.length) parts.push('RESEARCH LIBRARY (newest):\n' + state.research.slice(-8).reverse().map((r) => `- ${r.insight} [${r.source}]`).join('\n'));
  return parts.join('\n\n');
}

/* -------------------------------- scheduler -------------------------------- */

// Daily idea lands BEFORE the morning brief reads it (brief default is 8;
// this runs from 6). Research runs Saturday morning so the new material is
// in the library before Sunday's debrief and the week ahead.
const DAILY_HOUR = 6;
// Saturday first; Sunday is the catch-up — a slept Mac or a failed Saturday
// run used to cost the whole week (audit [37] item 2). The 6-day gap guard
// inside runLeaderResearch is what keeps the two mornings from doubling.
const RESEARCH_WEEKDAYS = [6, 0];
const RESEARCH_HOUR = 7;

export function researchWindowOpen(now = new Date()) {
  return RESEARCH_WEEKDAYS.includes(now.getDay()) && now.getHours() >= RESEARCH_HOUR;
}

export function startLeaderScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('leader');
    const now = new Date();
    try {
      if (now.getHours() >= DAILY_HOUR) {
        const state = await readLeaderState();
        if (!todayLead(state, now)) await generateDailyLead(vaultPath);
      }
    } catch (err) { console.error('leader daily failed:', err.message); }
    try {
      if (researchWindowOpen(now)) {
        await runLeaderResearch(vaultPath); // internally skips if run this week
      }
    } catch (err) { console.error('leader research failed:', err.message); }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}

/* ------------------------------ brief / widget ----------------------------- */

// Deterministic accessors — the brief and the widget read the receipt, no
// model in the path, absent means absent (never a placeholder idea).
export async function leadLineForBrief(now = new Date()) {
  const state = await readLeaderState();
  const t = todayLead(state, now);
  if (!t) return null;
  return `**Lead.** Try today: ${t.title} — ${t.line}`;
}

// Structured, not a pre-joined string: the widget renders the title as a
// headline and the line as body, and a lock-screen widget shows the title
// ALONE. Splitting a joined string back apart would break on any title
// containing a colon.
export async function leadForWidget(now = new Date()) {
  const state = await readLeaderState();
  const t = todayLead(state, now);
  return t ? { title: t.title, line: t.line } : null;
}
