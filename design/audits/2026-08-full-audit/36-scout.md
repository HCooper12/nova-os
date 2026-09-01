# 36 — Scout

Audited 2026-08-31. Read-only. Files opened: `server/lib/scout.js` (full,
236 lines); the /ingest/person entry route (item 33's read), the ingest
weave rail (33). browserResearch.js internals [Inferred from usage — the
code-driven gatherer with yt-dlp + the signed-in Nova browser profile;
capped max 4 URLs]. parseSubject/seedUrls/composePersonDossier pure and
exported. Deferrals: the weave apply (owned by 33 plan 1), Library/ingest
UI (48/53).

## 1. What it is (verified)

Research a PERSON the way the Librarian researches a book — deliberately
NOT a copy, with the differences reasoned in the header (8-27): accounts
are bodies of work by possibly-pseudonymous people; the interesting thing
is the THINKING; engagement metrics are not insight; the said-vs-inferred
line is thinner than with a book so provenance rules are stricter; and
platforms block scrapers, so honesty about reach is structural.

- **Subject parsing** (40-84): URL → platform + handle (six platforms);
  bare @handle → unlocated account; bare name → person. Pure, testable.
- **Code gathers, the model interprets** (173-186): after a real first-run
  failure (bio + one Reel; YouTube and LinkedIn refused anonymous
  fetches), primary material is gathered by CODE — yt-dlp for video, the
  signed-in browser profile for walled platforms — "the model interprets;
  it never chooses what to open." A failed gather is a thinner dossier,
  never a failed run.
- **The prompt's eight non-negotiables** (120-129) include the fleet's
  only encoded ethics rule — **NO PRIVATE-LIFE DIGGING**: public
  professional output only, no de-anonymisation, anonymity treated as
  given — alongside blocked-platform honesty ("a dossier built on
  nothing, presented confidently, is the single worst outcome"),
  said-vs-inferred separation, single-source marking, and ambiguity
  disclosure. The mandatory opening section is **"What I could actually
  read"** — "specific and unflattering where warranted" — and the verdict
  section explicitly permits being unimpressed.
- **Falsifiability**: a dossier missing Core ideas or Sources is a failed
  run, not a thin one (212-216 — the Librarian's rule, shared).
- **Weave rules** (233-236): the person lands in Wiki/Entities with the
  usable ideas PROMOTED to Concept pages, wikilinked both ways — "an idea
  he can use must be findable without remembering whose it was";
  provenance carried onto every page; deepen-don't-fork via
  findExistingPersonPages. One rail (ingest), one review, one undo story
  — inheriting [33]'s apply gap, owned there.

## 2. Current workflow, traced

"Research @conversationalfreedom on Instagram" → parseSubject → code
gathers the profile + any links he pasted → the model researches under
the eight rules → dossier opens with what was actually readable → skeleton
check → provenance header stamped ("NOT a complete reading… Nova's own
synthesis") → the ingest weave stages it: an Entity page, two ideas
promoted to Concepts, links both ways → pending diff → his yes.

Failure modes:
- Platform blocks everything → the dossier says so and works from what
  exists elsewhere. **Honest by contract.**
- Ambiguous subject → disclosed, not silently picked. **Honest.**
- Skeleton missing → failed run, named. **Honest.**
- Gather crashes → thinner dossier. **Honest.**
- **findExistingPersonPages matches loosely** (88-106): the needle is the
  flattened handle/label with `includes()` — a short handle ("max") hits
  any page containing the substring, and the weave would DEEPEN the wrong
  person's page. Verified logic; needs a length/boundary gate.
- No watchdog on the research spawn ([24] family).
- Inherits the deep-weave one-way apply ([33] plan 1's scope).

## 3. Pros — what genuinely works

- **The ethics rule** — rule 8 is the only place in the fleet where a
  boundary about *other people* is encoded, and it's exactly right for a
  personal-OS scraping adjacent lane.
- **"What I could actually read" as the mandatory opening** — coverage
  honesty as the dossier's first paragraph, unflattering by instruction.
- **Code-gathers-model-interprets** — the first-run failure converted
  into an architecture rule rather than a retry loop.
- **Ideas promoted to Concepts, linked both ways** — the person-shaped
  knowledge actually enters the graph as usable ideas, not a profile page
  that rots.
- **Permission to be unimpressed** — the verdict section's honesty
  license is what makes a "worth his attention?" answer trustworthy.

## 4. Cons and gaps (ranked by real-life cost)

1. **Loose existing-page matching** — the deepen-don't-fork promise can
   deepen the wrong page on short handles.
2. **Watchdog family member** ([24]).
3. **The [33] apply inheritance** — counted there, not here.

## 5. Mission test

**On-demand: earns its keep** — "study this thinker" lands their usable
ideas in the graph with honest provenance, connected to what he already
holds, with a straight verdict on whether they deserve more of his
attention. **Long-term:** Entity + Concept promotion is precisely how
person-knowledge compounds instead of accumulating. Usage-driven cadence
is correct.

## 6. Improvement plan (ranked; uncapped — short by honest assessment)

1. **[Refine] Tighten existing-page matching.**
   - **Proposal:** require the flattened needle be ≥5 chars for a
     substring hit (else exact-match only), and prefer a frontmatter
     URL/handle match over filename contains; on multiple candidate
     pages, pass ALL to the weave rules and let the diff show the choice.
   - **Impact/effort:** M / L.
   - **Verification:** unit tests with short-handle fixtures.
2. **[Refine] Watchdog** — shared settle-timeout helper ([24]).
   **Impact/effort:** L / trivial then.

## 7. UI recommendations

- **None** — entry is the ingest flow, output is the standard weave
  review; both are other items' surfaces.

## 8. Verdict

**Keep as-is** — fourth clean keep; the fleet's best-reasoned research
lane with an ethics rule the others should envy. Highest-value next
action: the matching gate (plan 1), one small guard on the
deepen-don't-fork promise.
