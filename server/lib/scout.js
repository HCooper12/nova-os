import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { modelFor, assertLaneOn } from './modelPrefs.js';
import { settleWatchdog } from './settle.js';

// THE SCOUT — research a PERSON the way the Librarian researches a book.
//
// His ask: "analyse and research this user to add any knowledge and findings
// to my second brain — https://www.instagram.com/conversationalfreedom".
// The Librarian already proved the shape: research into an honest dossier,
// then hand it to the ingest weave, which stages the vault, diffs it, and
// waits for his yes. Scout reuses that whole rail rather than inventing a
// second path to the vault.
//
// What makes a PERSON different from a book, and why this isn't a copy:
//   - A book has one author and a fixed text. An account is a body of work
//     by someone who may be pseudonymous, and the interesting thing is the
//     THINKING, not the biography.
//   - Followers and engagement are not insight. He wants ideas he can use.
//   - The line between "what they actually say" and "what I inferred" is
//     thinner than with a published book, so provenance rules are stricter.
//   - Accounts get scraped badly. Scout may only use what it can genuinely
//     read; it must say plainly when a platform blocked it rather than
//     quietly producing a confident profile from nothing.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
const MAX_BUDGET_USD = '4';
const SCOUT_DISALLOWED = [
  'Bash', 'Agent', 'Skill', 'ToolSearch', 'ScheduleWakeup', 'ReportFindings', 'Artifact',
  'SendMessage', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync',
  'EnterWorktree', 'ExitWorktree', 'NotebookEdit', 'PushNotification', 'RemoteTrigger',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TaskUpdate', 'Monitor',
  'Edit', 'Write',
].join(',');

/* ------------------------------ the subject ------------------------------ */

const PLATFORMS = [
  { host: /(^|\.)instagram\.com$/i, name: 'Instagram', handleFrom: (p) => p.split('/').filter(Boolean)[0] },
  { host: /(^|\.)(youtube\.com|youtu\.be)$/i, name: 'YouTube', handleFrom: (p) => p.split('/').filter(Boolean).find((s) => s.startsWith('@')) || p.split('/').filter(Boolean).pop() },
  { host: /(^|\.)(x\.com|twitter\.com)$/i, name: 'X', handleFrom: (p) => p.split('/').filter(Boolean)[0] },
  { host: /(^|\.)tiktok\.com$/i, name: 'TikTok', handleFrom: (p) => p.split('/').filter(Boolean).find((s) => s.startsWith('@')) || p.split('/').filter(Boolean)[0] },
  { host: /(^|\.)linkedin\.com$/i, name: 'LinkedIn', handleFrom: (p) => p.split('/').filter(Boolean).pop() },
  { host: /(^|\.)substack\.com$/i, name: 'Substack', handleFrom: (p) => p.split('/').filter(Boolean)[0] || 'newsletter' },
];

/**
 * Turn whatever he said into a subject. A URL yields platform + handle; a
 * bare name is just a name. Pure and exported so the parsing is testable
 * without spending a cent.
 */
export function parseSubject(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('who should I research?');

  const urlish = raw.match(/https?:\/\/\S+/i)?.[0] || (/^[\w.-]+\.[a-z]{2,}\//i.test(raw) ? `https://${raw}` : null);
  if (urlish) {
    let u;
    try { u = new URL(urlish); } catch { u = null; }
    if (u) {
      const hit = PLATFORMS.find((p) => p.host.test(u.hostname));
      const handle = hit ? hit.handleFrom(u.pathname) : null;
      if (hit && handle) {
        return {
          kind: 'account',
          platform: hit.name,
          handle: handle.replace(/^@/, ''),
          url: u.toString().replace(/\/$/, ''),
          label: `@${handle.replace(/^@/, '')} on ${hit.name}`,
        };
      }
      return { kind: 'site', platform: u.hostname, handle: null, url: u.toString(), label: u.hostname };
    }
  }
  // a bare @handle with no platform is still an account, just an unlocated one
  if (/^@[\w.]+$/.test(raw)) {
    return { kind: 'account', platform: null, handle: raw.slice(1), url: null, label: raw };
  }
  return { kind: 'person', platform: null, handle: null, url: null, label: raw };
}

/** Has he already researched them? Re-running must DEEPEN, never fork. */
export function findExistingPersonPages(vaultPath, subject) {
  const out = { pages: [] };
  const needle = String(subject.handle || subject.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!needle) return out;
  for (const dir of ['Entities', 'Sources']) {
    const abs = path.join(vaultPath, 'Wiki', dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((n) => n.endsWith('.md'))) {
      const flat = f.toLowerCase().replace(/[^a-z0-9]/g, '');
      let hit = flat.includes(needle);
      if (!hit) {
        try {
          const head = readFileSync(path.join(abs, f), 'utf8').slice(0, 600).toLowerCase();
          hit = !!(subject.url && head.includes(String(subject.url).toLowerCase()));
        } catch { /* unreadable page is not a match */ }
      }
      if (hit) out.pages.push(path.join('Wiki', dir, f));
    }
  }
  return out;
}

/* -------------------------------- prompt --------------------------------- */

export function buildScoutPrompt(subject, notes = '') {
  const who = subject.kind === 'account'
    ? `the ${subject.platform || 'social'} account ${subject.label}${subject.url ? ` (${subject.url})` : ''}`
    : subject.kind === 'site' ? `the site ${subject.url}` : `the person "${subject.label}"`;

  return `You are Nova's Scout, researching a person for Hayden's second-brain vault. The subject:

SUBJECT: ${who}${notes ? `\nWHY HE WANTS THIS / WHAT TO EMPHASISE: ${notes}` : ''}

Produce ONE self-contained research dossier in markdown — your final message must BE the dossier, nothing else. A second agent weaves it into his vault, so structure and honesty matter far more than prose style.

## Non-negotiable rules

1. YOU ARE RESEARCHING, NOT WATCHING. You have not consumed this person's full body of work. Open the profile and whatever posts, videos, articles, interviews or transcripts you can genuinely reach, and say in the opening line what you actually managed to read.
2. SAY WHEN YOU ARE BLOCKED. Instagram, TikTok and X frequently refuse automated readers. If you cannot load the profile, say so plainly and work from what IS reachable — reposts, interviews elsewhere, their other platforms, coverage. A dossier built on nothing, presented confidently, is the single worst outcome here. "I could not read the account itself; here is what exists elsewhere" is a genuinely useful answer.
3. IDEAS OVER BIOGRAPHY. He wants what he can USE: the frameworks, arguments, recurring positions, distinctive techniques, and the way this person thinks. Follower counts, engagement rates and life-story trivia are near-worthless unless they explain the thinking.
4. SEPARATE WHAT THEY SAID FROM WHAT YOU INFERRED. Quote or closely paraphrase for the former; mark the latter "(inference)". Never blend them in one sentence.
5. QUOTES: 25 words or fewer, attributed, never two adjacent. Prefer paraphrase. Do not reproduce whole captions, posts or scripts.
6. AN IDEA FOUND IN ONE PLACE is marked "(single source)". Never invent resolution: if their actual position on something is unclear, write "not established by what I could read" rather than filling the gap plausibly.
7. IF THE SUBJECT IS AMBIGUOUS — several people share the name, or the handle does not resolve — say so and describe who you DID research, rather than silently picking one.
8. NO PRIVATE-LIFE DIGGING. Public professional/creative output only: no addresses, no family details, no attempts to identify a pseudonymous person. If the account is anonymous, treat the anonymity as given and research the work.

## Dossier structure (use exactly these headings)

## What I could actually read
One short paragraph: which URLs you opened, roughly how much material, and what was blocked or unavailable. Be specific and unflattering where warranted.

## Who they are
Two or three sentences — the working identity behind the output (creator, coach, researcher, anonymous account), and the domain they operate in.

## Core ideas
The substance. One "### " subheading per distinct idea or framework, each with: what it claims, how they argue or demonstrate it, and — where it is a factual claim rather than a framing — an evidence note. Cover the minor ideas too, not just the headline ones.

## How they think
The method underneath the ideas: recurring moves, framings, what they consistently push back on, what they take as given. This section is often the most valuable — it is the part that transfers.

## How they communicate
Format, register, structure, and the devices they lean on. Written for someone who might want to learn from the craft, not imitate the person.

## Where this connects to Hayden
Explicit links to what Nova already holds about him — his leadership work, training, second-brain concepts — but ONLY where a genuine connection exists. Read his vault (Wiki/Concepts, Wiki/Sources) to ground this. If nothing genuinely connects, say so in one line; a forced connection is worse than none.

## Worth his attention?
An honest verdict in a few sentences: what is genuinely worth taking, what is recycled or thin, and who this is and isn't for. You may be unimpressed — say so, with reasons.

## Sources consulted
Every URL you actually opened, one per line, each with a few words on what it gave you. Mark ones you tried and could not load.`;
}

/* --------------------------------- runner -------------------------------- */

/**
 * The URLs worth reading before the model starts. Code decides — the model
 * never picks what to open. For an account this is the profile itself plus,
 * when he supplied one, a specific piece of work.
 */
export function seedUrls(subject, notes = '') {
  const urls = [];
  if (subject.url) urls.push(subject.url);
  // any link he pasted in his steer is a deliberate pointer — honour it
  for (const m of String(notes).matchAll(/https?:\/\/\S+/g)) urls.push(m[0].replace(/[),.]+$/, ''));
  return [...new Set(urls)];
}

export async function runPersonResearch(vaultPath, subject, { notes = '', model, workDir } = {}) {
  assertLaneOn('scout');

  // READ IT PROPERLY FIRST. The first live run got the Instagram bio and one
  // Reel; the YouTube video and LinkedIn both refused an anonymous fetch.
  // Code now gathers the primary material — yt-dlp for video, his signed-in
  // Nova browser profile for the walled platforms — and hands it over. The
  // model interprets; it never chooses what to open.
  let gathered = '';
  try {
    const { gather, gatheredContext } = await import('./browserResearch.js');
    const results = await gather(seedUrls(subject, notes), workDir || path.join(os.tmpdir(), 'nova-scout'), { max: 4 });
    gathered = gatheredContext(results);
  } catch { /* a failed gather is a thinner dossier, never a failed run */ }

  const args = [
    '-p', `${buildScoutPrompt(subject, notes)}${gathered ? `\n\n${gathered}` : ''}`,
    '--permission-mode', 'bypassPermissions',
    '--allowedTools', 'Read Grep Glob WebSearch WebFetch',
    '--disallowedTools', SCOUT_DISALLOWED,
    '--strict-mcp-config',
    '--output-format', 'json',
    '--model', model || modelFor('scout'),
    '--max-budget-usd', MAX_BUDGET_USD,
    '--session-id', randomUUID(),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd: vaultPath, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    settleWatchdog(child, { label: "the scout research", minutes: 30 });
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      let outer = null;
      try { outer = JSON.parse(stdout); } catch { /* fall through to the honest error */ }
      if (!outer || outer.is_error || code !== 0) {
        return reject(new Error(outer?.result || stderr.trim().slice(0, 300) || `scout exited with code ${code}`));
      }
      const dossier = String(outer.result || '').trim();
      // The same falsifiability rule the Librarian uses: a dossier missing
      // its load-bearing sections is a failed run, not a thin one.
      if (!/##\s*Core ideas/i.test(dossier) || !/##\s*Sources consulted/i.test(dossier)) {
        return reject(new Error('the research came back without its Core ideas or Sources sections — treated as a failed run rather than filed half-formed'));
      }
      resolve({ dossier, cost: Number(outer.total_cost_usd) || 0 });
    });
  });
}

/** The provenance header the vault weave sees. Never lets the dossier pass as read-in-full. */
export function composePersonDossier(subject, dossier) {
  return `Research dossier authored by Nova's Scout about ${subject.label}${subject.url ? ` — ${subject.url}` : ''}.
PROVENANCE: researched from public sources and whatever of the account was reachable. NOT a complete reading of their work. Everything below is Nova's own synthesis.
Researched ${new Date().toISOString().slice(0, 10)}.

---

${dossier}`;
}

/** The vault rules for weaving a PERSON — the Scout's analogue of bookWeaveRules. */
export function personWeaveRules(subject) {
  return ` This is a PERSON, not a publication: the primary page belongs in Wiki/Entities as the person/account, with the ideas worth keeping promoted into Wiki/Concepts pages and wikilinked both ways — an idea he can use must be findable without remembering whose it was. Use "${subject.label}" as the entity's title unless the vault already holds them under another name, in which case DEEPEN that page. Carry the provenance forward on every page you create: these are researched findings about their public work, not their words verbatim, and any direct quote must stay attributed and short. Do not create a Source page for the account as a whole unless there is a specific piece of work (a named video, essay or series) that genuinely warrants one.`;
}
