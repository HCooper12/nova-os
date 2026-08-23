# The Librarian — books as first-class knowledge in the second brain

*Written 2026-08-23. Hayden's ask: give Nova a book title + author, have a
meticulously designed agent research and extract the book's key ideas into
the vault and memory, cross-reference it — in the moment and as the vault
grows — against concepts, topics, people, videos and podcasts, and surface
it in daily review and everyday conversation.*

## The honest constraint, stated first

**"Extract the transcript of the entire book" is the one part Nova will not
do.** Scraping or reconstructing a book's full text from the internet is
piracy, and no agent here will be designed to do it. It is also the wrong
tool for the actual goal: a 90,000-word raw text is nearly opaque to the
graph, to daily review, and to conversation. What those consume is
**structured knowledge** — ideas, frameworks, claims, people, chapter maps,
short attributed quotes — densely wikilinked. That is what the Librarian
produces. For books Hayden owns as files (EPUB/PDF), a later phase reads
the *real* text for far deeper personal notes — the same knowledge-not-
reproduction shape, just grounded in the primary source.

## What already exists (extend, never duplicate)

The second-brain machinery Hayden is describing is mostly BUILT. The gap is
narrow and specific.

| Capability | Already exists as |
|---|---|
| Typed knowledge pages + wikilinks | Vault CLAUDE.md: Sources / Concepts / Entities / Topics, `sources:` frontmatter, backlinks |
| Weaving new material into the graph, dedup-aware | `lib/ingest.js` — staged vault → agent weave → diff → approve/discard, `findExistingVideoPages` dedup |
| Video/podcast transcripts | Watcher (`fetchVideoTranscript`, digest for long ones) feeding the same ingest rail |
| Cross-referencing *as the vault grows* | Distiller — weekly staged re-weave of unlinked pages into the graph |
| Books in conversation | Ask Nova runs in the vault with read tools — woven pages are conversationally live the day they land |
| Graph visibility | `/api/graph` slice → Galaxy screen |
| Model choice + cost gate | Model board lanes + `GATE_LANES` ("use Opus for this?") |

**The genuinely missing piece: an acquisition front door for books** — no
path today turns "title + author" into vault-ready material. That is Phase
1. Everything else is wiring books into lanes that already run.

## Phase 1 — the Librarian (BUILT this session)

One new acquisition mode on the EXISTING ingest rail. `POST /api/ingest`
gains `book: {title, author, notes}`; the job runs `researching → staging →
running → ready`, and the review/approve/undo UI works unchanged.

**The research agent** (`lib/librarian.js`), designed around failure modes:

- *Failure mode: confident slop from one blog's summary.* → Triangulation
  is mandatory: author's own words first (talks, interviews, essays,
  published excerpts), then reputable syntheses, then critical reviews.
  An idea sourced once is labeled as such.
- *Failure mode: invented chapter detail.* → The chapter map goes only as
  far as sources support; gaps say "not covered by available sources",
  never plausible filler. The dossier is honest about its resolution.
- *Failure mode: pretending to have read it.* → Every page woven from a
  dossier carries `provenance: researched` frontmatter. When Hayden later
  uploads the real book file (Phase 2) or his own reading notes, re-ingest
  deepens the same pages and flips provenance to `read`. Nova never claims
  book-knowledge it has at second hand — honest degradation, the Method.
- *Failure mode: copyright creep.* → Quotes only when widely reported,
  attributed, ≤25 words, never chained into passages. The dossier is
  Nova's own authored synthesis, so Raw/ stores it verbatim as provenance.
- *Failure mode: a $40 research run.* → Hard budget cap, lane defaults to
  Sonnet, and `librarian` is a GATE lane — Nova asks "want Opus on this
  one?" exactly like Researcher/Watcher (his 22-Aug model-gate ask).
- *Failure mode: flat pages the graph can't use.* → The dossier ends with
  explicit connection hooks ("this overlaps [[Atomic Habits]] on identity
  loops; contradicts [[Deep Work]] on scheduling") that the weave turns
  into real wikilinks against the staged vault it can see.

Voice/text front door: "add book Thinking Fast and Slow by Daniel
Kahneman" routes through the intent rail (`lane: 'book'`) — deterministic
parse, no model in the routing decision.

## Phase 2 — books he owns as files

EPUB/PDF upload → local text extraction → the EXISTING long-transcript
digest path (`SINGLE_PASS_MAX_CHARS` / `digestTranscriptCached`) — a book
is just a very long transcript to that machinery. Pages gain
`provenance: read`, depth the researched dossier can't reach, and the
verbatim stays in Raw/ under the vault's own paraphrase-for-Wiki rule.
Also here: reading lifecycle (`want-to-read → reading → absorbed`) as
frontmatter, so Nova knows the difference between researched-for-him and
actually-read-by-him.

## Phase 3 — resurfacing over time (the "review overtime" ask)

- **Daily review beat**: one idea from the library per review, chosen by
  spaced resurfacing (oldest-unsurfaced first, weighted toward pages with
  fresh backlinks — an idea that just gained a connection is worth seeing
  again). Deterministic picker; the model only phrases it.
- **Morning brief**: an occasional one-liner when a library idea collides
  with the day ("today's deep-work block — Newport would say protect it").
  Rate-limited so it stays delightful, not preachy.
- **Revisit queue**: `review:` frontmatter date the picker maintains —
  Ebbinghaus-ish spacing without building a flashcard app.

## Phase 4 — connection deepening as the vault grows

- Extend the weekly Distiller prompt: beyond weaving orphans, propose
  cross-SOURCE links (book ↔ podcast ↔ video) and — first-class —
  **contradictions**: where two sources in the vault disagree, a short
  "tension" note linking both sides. Disagreement between books is where
  the thinking actually happens; a graph that only agrees is a scrapbook.
- "What should I read next": graph-gap analysis — concepts referenced by
  many sources that lack their own developed page suggest the next book.
  Proposals ride the inbox rails like everything else.

## What Hayden's brainstorm missed (now folded in)

1. **Provenance and honesty** — researched vs read vs his own notes must be
   visibly different, or the second brain quietly becomes a rumour mill.
2. **Contradictions as a feature** — cross-referencing that only finds
   agreement flatters; finding where Kahneman undercuts a productivity
   book's premise is the powerful version.
3. **Claim-level extraction** — "the 2-minute rule" is an idea; "habit
   formation takes 66 days on average" is a *claim with evidence quality*.
   The dossier separates them so weak science doesn't harden into memory.
4. **The read-next loop** — the graph should drive acquisition, not just
   store it (Phase 4).
5. **Cost honesty** — every book is a paid research run; the gate keeps
   that a decision, not a surprise.
6. **No parallel memory** — everything lands in the vault (source of
   truth), nothing in a side database. Nova's memory files reference, the
   vault holds.

## Verify (per phase)

Phase 1: unit tests pin the prompt's honesty clauses (the same way
swipeCore's safety property is pinned); scratch-vault end-to-end run of a
real book research → inspect dossier + staged pages → discard without
touching the real vault; gates before ship.
