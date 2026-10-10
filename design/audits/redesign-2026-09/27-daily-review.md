# 27 · The Daily review, on a forgetting curve

11 October 2026. Mockup: `design/mockups/96-daily-review.html`. His intent, in
his words: memory note `nova-daily-review-intent.md`. Research and design
only; nothing in the code was changed.

## What runs today

| Piece | Where | What it does |
| --- | --- | --- |
| The pick | `src/App.jsx` `dailyReviewPool`, `dailyReviewIndex` | Concept and topic pages sorted by title; today's local date hashed into the pool. |
| Its twin | `server/lib/dispatch.js` `dateHashIndex`, `reviewPick` | The same hash, so the morning brief names the same page; pinned in `server/test/twins.test.js`. |
| The gist | `ensureReviewSummary` → `server/lib/noteSummaries.js` | A model summary per page, cached by body; the card reads "Summarizing…" while it runs. |
| The shuffle | `shuffleDailyReview`, `finishReviewSpin` | A random draw on the SpinReveal reel. |
| The "from" line | `src/vals/valsNotes.js` `reviewFrom` | The concept's **own title**, so the card reads "from" and then the page itself. |
| Reflect | `generateReviewReflectPrompt`, `saveReviewReflection` | Writes a journal entry headed with the page title. |
| Cards | `MissionStructured.jsx` Group "review" (~473), `MissionControl.jsx` pane "CONCEPT REVISIT" (~459) | Concept, from, Review, Shuffle. |
| Summary Home | `src/vals/valsSummary.js` `buildMoments` | **No review moment.** His phone shows no Daily review at all. |

Against his intent, it is missing: a schedule, any memory of what he saw, a
recall answer, the real source (podcast or article, episode, time), the
connected notes, and a place on his phone's Home.

## Facts from his vault (read-only, counts only, 11 Oct)

- 281 concept and topic pages. **280** name a Source page that exists in their
  `sources:` frontmatter line (the vault schema in his vault's CLAUDE.md asks
  for it). `server/lib/vault.js` `readPage` returns `url` and body wikilinks
  only, so the `sources:` line is dropped and Nova cannot name the source today.
- **41** pages put a time (mm:ss) on the same line as a link to a Source page.
  58 Source pages; 51 carry a `url:`; 19 of those are YouTube.
- Body wikilinks per page: median 9, none with fewer than 2. Connections exist
  for every page.
- Concept and topic pages created: Jul 34, Aug 100, Sep 79, Oct 68 (1 to 11
  Oct). About three new a day.
- Recall answers recorded: none; nothing asks for one.

## The proposed schedule

A Leitner-style table on the existing `server/lib/spacing.js`
(`tableSchedule`, `nextDueAt`). The first five gaps are the Library's.

```js
export const GAPS = [1, 3, 7, 16, 35, 90, 180];   // days
export const DAILY = 5;                            // at most five a morning
export const NEW_WHEN_BELOW = 3;                   // one new page on a lighter day

export function answer(card, grade, today) {
  const step = grade === 'got'   ? Math.min(card.step + 1, GAPS.length - 1)
             : grade === 'fuzzy' ? card.step     // same gap again
             :                     0;            // forgot: tomorrow
  return { ...card, step, last: today, due: shiftDate(today, GAPS[step]) };
}
```

- A new page has step 0: Got it sends it 3 days out; Fuzzy or Forgot, tomorrow.
- **No answer, no move.** Being shown a page does not advance it (the
  Repertoire's practice-not-exposure rule); it stays due and climbs the queue.
- **Order when several are due:** `daysSince(last) / GAPS[step]`, highest
  first (the page furthest past its own gap), then the lower step, then title.
- **New pages:** one, on a day with fewer than three due. Newest Source first
  (the day after a podcast is ingested, its concepts get their first look while
  the curve is steepest); older pages behind, most backlinked first; any page
  can be pulled in from Notes.
- **Dates** are local calendar-date strings (`daysBetween`, `shiftDate`), the
  AEST trap the Repertoire already paid for.

### Load (a simulation, not his data)

365 mornings at his pace (281 pages, about 3 new a day), assumed answers 70%
Got it, 20% Fuzzy, 10% Forgot:

| Gaps | Daily size | Cards a day | Pages that enter a year |
| --- | --- | --- | --- |
| 1·3·7·16·35 | 5, new below 3 | 3.8 | 87 |
| **1·3·7·16·35·90·180** | **5, new below 3** | **3.5** | **123** |
| 1·3·7·16·35·90·180 | 3, new below 2 | 2.4 | 89 |
| 1·3·7·16·35, no ceiling | 1 new a day | 26 by month 12 | 365 |

The honest consequence: at about 1,000 new pages a year, only about 120 get a
schedule on their own. The rest wait until he pulls them in. Saying so beats
a card that silently cannot keep up.

## Where the state lives

**Recommended: his answers in the vault, the schedule derived into server data.**

- Each answer appends one line to `Wiki/Library/Review Log.md`
  (`2026-10-11 · [[Effort Debt]] · Got it`), the Repertoire Log's pattern.
  It is his record of what he remembers, readable in Obsidian, and the vault
  is the source of truth.
- `server/data/concept-review.json` holds `{ step, last, due }` per page,
  **rebuilt by replaying the log** through `answer()`. Rebuilding server data
  loses nothing; no concept page is ever written to.
- The answer is a write: it rides the Inbox rails as a record (`kind:
  'concept-recall'`, `status: 'filed'`, `undoData` = the log line and the prior
  `{step, due}`), with a pill and Undo.

The alternative is the Library's: everything in server data. Less vault churn;
a rebuild of server data starts every page over as new.

Moving the pick to the server also deletes the twin: the client and the
morning brief both read the server's queue head, and `dateHashIndex` with its
`twins.test.js` fixture can go (the new `GAPS` table is pinned there instead,
beside the Library's, the Leader's and the Repertoire's).

## The card, both idioms (one view model)

Fields: the queue head's title (serif); gist (cached summary if one exists,
else the first paragraph, three lines, skeleton while loading, never
"Summarizing"); source (first `sources:` page: its title, a kind word only
from a `podcast` tag or the url host, a time only when one sits on the same
line as the source link, "+1" for more); up to three connected pages from its
own links (pages that link back first, then most backlinked; Galaxy colours
from `NOTE_TYPE_COLOR`); the curve (his answers as dots on their dates; the
line is the forgetting idea drawn to the gaps, no percentage); three recall
buttons that each show where they send the page; Write about it (the Journal,
mockup 95, with the Daily review prompt about this page); Open the page.

- **Summary Home** (his phone): a Moment, `review`, while something is due
  and unanswered; gone once the day is done.
- **Grouped Home:** the existing Group "review", source and connections as rows.
- **Classic:** the pane takes the same fields and its name back.

## Honest states

Arriving (skeleton); nothing due (no moment; the More row gives the next
date); all done (the week ahead by count, Draw one early); the Mac
unreachable (last sync shown with its time, buttons disabled with the reason);
the vault unreadable (nothing invented, nothing comes due or falls behind); a
page with no source ("No source on this page"); a source with no time (named,
opens, no Play); a first look ("New · first look").

## The shuffle and the name

- The shuffle leaves the due card: a random swap would cost the scheduled page
  its day. The reel stays as **Draw one early** once the day's reviews are
  done; it lands on a never-reviewed page, which enters as new.
- "Daily review" stays on the Home card (his word). The evening model read
  (`server/lib/dailyReview.js`, Inbox loop "Daily review", journal label
  "Daily review reflection") is **shown** as "Day read". The stored label is
  read by `journal.js` (author map), `commitments.js` and `weeklyDebrief.js`,
  so it stays on disk; only display strings change.

## Build list, when he says go

1. `server/lib/vault.js` `readPage`: return `sources` (resolved names from
   frontmatter) and, per source link, a time found on the same line. Additive.
2. `server/lib/conceptReview.js`: `GAPS`, `answer`, `queue`, log replay, state
   file; tests for every grade, the new-page rule, the ordering, the AEST day,
   undo, and a hand-edited log line.
3. Routes: `GET /api/review/today`, `POST /api/review/answer` (Inbox record,
   Undo); `GET /notes/detail` gains `sources`.
4. `dispatch.js` reads the queue head; remove `dateHashIndex` and its fixture;
   pin `GAPS` in `twins.test.js`.
5. `src/vals/valsNotes.js` review fields from the server; `valsSummary.js`
   `buildMoments` adds `review`; `MissionSummary.jsx` Moment; the Group and
   the classic pane updated; the review sheet; Journal entry point.
6. Verify against the real vault (reload with `scripts/reload-server.mjs`, hit
   the endpoint, read the result), then both idioms at 375.

## His calls

Listed in the mockup's Part 8: the gap table; the daily size; which new pages
enter first; where answers live; read first or recall first; "Day read"; the
reel only as Draw one early.
