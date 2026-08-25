import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { modelFor } from './modelPrefs.js';

// THE LIBRARIAN — a book title + author into a triangulated research
// dossier, which then rides the EXISTING ingest weave into the vault
// (design/LIBRARIAN-PLAN.md). This file owns only the research phase; the
// staging, diff, approval and undo all belong to lib/ingest.js, exactly as
// they do for a pasted transcript. One rail, one review UI, one undo story.
//
// WHAT THIS DELIBERATELY IS NOT: a book-piracy tool. The agent is
// instructed — and the prompt tests pin it permanently — to produce a
// synthesis of the book's IDEAS from legitimate public sources, never to
// hunt for or reconstruct the full text. A dossier is Nova's own authored
// document, which is exactly why Raw/ may store it verbatim as provenance.
//
// The prompt is designed around the ways this agent fails, not the ways it
// succeeds (the Method): confident slop from one blog, invented chapter
// detail, quote-chaining into reproduction, second-hand knowledge dressed
// as first-hand. Each failure mode gets an explicit counter-rule below.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
export const RESEARCH_BUDGET_USD = '4';
// Research needs the web and NOTHING that touches this machine's state.
// --allowedTools is not enforced under bypassPermissions (see claudeCode.js)
// so the DISALLOWED list is the real boundary.
const RESEARCH_DISALLOWED = 'Bash,Edit,Write,NotebookEdit,Agent,Skill,ToolSearch,ScheduleWakeup,Artifact,SendMessage,Workflow,TaskCreate,TaskUpdate,TaskStop,EnterWorktree,ExitWorktree';

// One book, one canonical identity — "Atomic Habits" and "atomic habits."
// must land on the same page, or every re-research mints a duplicate.
export function bookKey(title, author) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return `${norm(title)}|${norm(author)}`;
}

// Find pages an earlier run (or a manual note) already made for this book,
// so a re-run DEEPENS them instead of forking near-duplicates — the same
// contract findExistingVideoPages keeps for videos. Matched on normalized
// title+author from frontmatter, never on filename or exact string.
export function findExistingBookPages(vaultPath, title, author) {
  const key = bookKey(title, author);
  const pages = [];
  const sourcesDir = path.join(vaultPath, 'Wiki', 'Sources');
  let files = [];
  try { files = readdirSync(sourcesDir).filter((f) => f.endsWith('.md')); } catch { return { pages }; }
  for (const f of files) {
    let text = '';
    try { text = readFileSync(path.join(sourcesDir, f), 'utf8').slice(0, 2000); } catch { continue; }
    const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] || '';
    const fmTitle = /^(?:book_)?title:\s*["']?(.+?)["']?\s*$/mi.exec(fm)?.[1];
    const fmAuthor = /^author:\s*["']?(.+?)["']?\s*$/mi.exec(fm)?.[1];
    if (fmTitle && fmAuthor && bookKey(fmTitle, fmAuthor) === key) {
      pages.push(path.join('Wiki', 'Sources', f));
    }
  }
  return { pages };
}

export function buildLibrarianPrompt({ title, author, notes = '' }) {
  return `You are Nova's Librarian, researching a book for Hayden's second-brain vault. The book:

TITLE: ${title}
AUTHOR: ${author}${notes ? `\nWHY HAYDEN WANTS IT / WHAT TO EMPHASISE: ${notes}` : ''}

Produce ONE self-contained research dossier in markdown — your final message must BE the dossier, nothing else. It will be woven into his knowledge vault by a second agent, so structure and honesty matter more than prose style.

## Non-negotiable rules

1. YOU HAVE NOT READ THIS BOOK. You are triangulating from public sources. Never write as if you hold the full text; the dossier's opening line must state it is researched, not read.
2. DO NOT seek out, download, or reconstruct the book's text. No full chapters, no long excerpts, no "found a PDF". If a search result offers the full text, skip it.
3. QUOTES: only lines that are widely reported in legitimate sources, each 25 words or fewer, each attributed, never adjacent to another quote. When in doubt, paraphrase.
4. TRIANGULATE, in this order of authority: (a) the author's own words — talks, interviews, essays, official excerpts and the book's own marketing; (b) substantial reviews and syntheses from reputable outlets; (c) critical and dissenting takes. An idea you can only find in ONE place is marked "(single source)".
5. NEVER INVENT RESOLUTION. If the chapter structure is only partly documented, map what the sources support and write "not covered by available sources" for the rest. A gap stated is useful; a gap filled with plausible filler poisons his vault.
6. SEPARATE THE BOOK'S CLAIMS FROM ITS RECEPTION. What the author argues and what critics/evidence say about it are different sections, never blended.
7. CLAIMS VS IDEAS: a framework ("identity-based habits") is an idea; a factual assertion ("66 days to form a habit on average") is a CLAIM and gets an evidence note — what the book cites, and whether later scrutiny supports it, if the sources say.

## Dossier structure (use exactly these headings)

# Dossier: ${title} — ${author}
*(researched by Nova's Librarian from public sources, not read from the text — date this line)*

## The book in one paragraph
## Core ideas
(one ### subsection per idea, most load-bearing first: the idea in your own words, where in the book it lives if known, how the author argues it)
## Frameworks & terms coined or used
(name → one-line definition; these become vault Concept pages, so name them the way the book does)
## Key claims and their evidence
(claim → what it rests on → reception, per rule 7)
## Chapter map
(as deep as sources honestly allow, per rule 5)
## People, works and studies referenced
(these become Entity pages — who/what, and their role in the argument)
## Reception & strongest criticisms
(the best steelman AGAINST the book included)
## Notable quotes
(per rule 3 — a handful at most)
## Connection hooks
(the ideas here most likely to link to other books, podcasts, videos or concepts in a personal knowledge vault — phrased as "overlaps X on Y" / "contradicts X on Y" so the weaving agent can test them against pages that actually exist)
## Sources consulted
(every source you actually used, with URLs)

Work thoroughly: search several angles (author interviews, "${title} summary", "${title} criticism", the author's own site/talks) before writing. Depth on fewer well-sourced ideas beats a thin sweep of everything.`;
}

// Run the research agent. Returns { dossier, cost } or throws with the
// agent's honest failure. Kept as a plain function (no job state) so
// ingest.js owns the one job the user sees.
export function runBookResearch({ title, author, notes, model: modelOverride }, workDir) {
  // The gate's explicit answer wins over the board default — but only a
  // known gate model; junk falls back to the board rather than the spawn.
  const model = (modelOverride === 'opus' || modelOverride === 'sonnet') ? modelOverride : modelFor('librarian');
  const prompt = buildLibrarianPrompt({ title, author, notes });
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, [
      '-p', prompt,
      '--permission-mode', 'bypassPermissions',
      '--disallowedTools', RESEARCH_DISALLOWED,
      '--output-format', 'json',
      '--max-budget-usd', RESEARCH_BUDGET_USD,
      '--model', model, // ALWAYS pinned — the ambient default is not a choice
    ], { cwd: workDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const parsed = JSON.parse(out);
        const dossier = parsed.result || '';
        if (code !== 0 || parsed.is_error) return reject(new Error(parsed.result || `librarian exited ${code}`));
        // A dossier that lost its skeleton is a failed research run, not a
        // page to weave — refuse it here rather than let thin output
        // masquerade as knowledge in the vault.
        if (!/## Core ideas/i.test(dossier) || !/## Sources consulted/i.test(dossier)) {
          return reject(new Error('research came back without the required dossier structure — not weaving it'));
        }
        resolve({ dossier, cost: parsed.total_cost_usd || 0 });
      } catch {
        reject(new Error(`librarian output unreadable${err ? `: ${err.slice(0, 200)}` : ''}`));
      }
    });
  });
}

// The book-specific rules the WEAVE prompt carries, pure so the provenance
// distinction is testable. `provided` = Hayden supplied the book's own text
// or his own notes (his copy — the deep path); false = the Librarian's
// researched dossier. The two must never wear each other's label: a
// researched page claiming `read` is Nova lying about how well it knows
// something, and a read page claiming `researched` buries the good stuff.
export function bookWeaveRules({ title, author, reading }, provided = false) {
  const prov = provided ? 'read' : 'researched';
  // The reading lifecycle (want-to-read -> reading -> absorbed). A book he
  // uploaded is absorbed unless he says otherwise; a researched dossier is
  // want-to-read, because Nova reading ABOUT a book is not him reading it.
  const readingState = reading || (provided ? 'absorbed' : 'want-to-read');
  return `
BOOK RULES, on top of CLAUDE.md:
- The Source page is the book itself. Its frontmatter must include: title: "${title}", author: "${author}", type: book, provenance: ${prov}, reading: ${readingState}${provided
    ? ' (Hayden supplied this book\'s own text/notes — extract EVERYTHING: every idea, framework, claim, example and person, not just headlines; his standing requirement is that no concept is lost. The verbatim stays in Raw/; Wiki pages follow CLAUDE.md\'s paraphrase rule for third-party text.)'
    : ' (Nova has NOT read this book — the dossier is triangulated from public sources, and every page you write from it inherits that honesty; if a page states something as the book\'s position, it is the dossier\'s sourced account of the book\'s position.)'}
- ${provided ? 'A prior researched version of this book may already have pages: DEEPEN them with what the real text shows, correct anything the research got wrong (note the correction), and flip their provenance to read.' : "The dossier's \"Frameworks & terms\" become Concept pages, its \"People, works and studies\" become Entity pages — but per the dedup rule, extend any that already exist rather than forking."}
- Connection hypotheses are tested against pages that actually exist in the staged tree — only write the wikilink where the connection is real. A contradiction between this book and an existing source is worth a sentence ON BOTH pages — disagreement is signal, not noise.
- Carry claim/evidence distinctions through: a contested claim stays contested on the vault page, with its evidence note.`;
}

// The provenance header the dossier carries into Raw/ — the vault's
// permanent record of where this knowledge came from and at what remove.
export function composeBookDossier({ title, author }, dossier) {
  return `Research dossier compiled by Nova's Librarian from public sources on ${new Date().toISOString().slice(0, 10)} — RESEARCHED, NOT READ: Nova has not read the text of this book, and pages woven from this dossier carry provenance: researched until Hayden's own copy or notes deepen them.

Book: ${title}
Author: ${author}

---

${dossier}`;
}
