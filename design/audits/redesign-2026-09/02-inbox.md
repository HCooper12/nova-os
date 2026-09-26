# 02 · Inbox — audit, 27 Sep 2026

His named pain, 25 Sep: "we need to reevaluate the inbox system as it is far
too clunky and confusing now"; "Simplicity and ease of use MUST be the goal
here and not over complicated like the inbox system has become." Judged
against his own reference for "simple," the Coach deck in Train
(`src/CoachSuggestions.jsx`, `src/coachSuggestions.js`): one sentence, the
change drawn, Yes / Discuss / a quiet cross, one do-all, Undo.

Evidence: source read in full (`Inbox.jsx` 799 lines, `valsInbox.js` 792,
`inboxDigest.js`, `inboxLeave.js`, `SwipeRow.jsx`); 8 screenfuls of his real,
connected vault at 402×874 (Deck mode, read-only) plus 3 targeted real frames
in List mode; 2 demo frames; a computed-style sweep of `main` in both states.
Read under `apple-hig-review`'s ten named references, each cited below as
`file.md › Heading`, with "judgment" where none applies. Method and the full
frame/blocked-write ledger are in §5.

---

## 1 · Verdict

**Critical issues.** Today the Inbox is four unrelated jobs sharing one
route and one scroll: a capture composer, an 18-item decision deck, a
console of seven background-loop settings, and a 409-row history, each
written for a different hour of his day and none of them aware the others
are on the same page. It will be remembered as the screen where deciding on
one waiting thought means scrolling past six other systems first: at
402×874, connected to his real vault, the page is 6,591px tall (8 screens)
in Deck mode and 12,476px (15 screens) in List mode, because List renders
all 18 pending cards at full size rather than as rows. The number that says
it: 109 distinct tappable elements answer to one Inbox screen, spread across
11 different type sizes, and 95 of those 109 measure smaller than Apple's
own default touch target — against a Coach-deck reference that puts three
verbs on a card and calls it done.

### Clutter numbers, as it stands (checklist §3)

| Test | Inbox today | Target |
| --- | --- | --- |
| Focal point | None. Capture, an 18-deep deck, 7 loop cards and 409 history rows share one scroll | One, above the fold |
| Object count, 402×874 | 15 clickable elements above the fold (measured); the composer, the digest strip and one pending card | Lower than today, or a reason |
| Verbs per card | Up to 7 (Approve, Discard, Seen, expand, ask-why's 2, a kind-specific door) vs the Coach deck's 3 | One primary, one quiet alternative, talk back |
| Type sizes | 11 distinct sizes measured on `main` | ≤ 3 |
| Tap floor | 95 of 109 clickable elements measured under 44pt; 1 measured under the 28pt floor | ≥ 28pt; ≥ 44pt primary |
| Gestures | SwipeRow on the pending card only; List mode and every loop/history control are tap-only | Every capability has a pixel he can tap |
| Motion | Entrance rise + colour-coded leave present; no skeleton on the 7 loop cards (plain "checking…" text) | All four |
| States | Skeleton (pre-first-load only), 3 honest empties, offline banner, per-item error — but History's own subtitle claims unconditional Undo coverage that his real Guardian report contradicts (finding 6) | All four, honestly |
| Width | `main.scrollWidth` 402 at a 402pt viewport | 402 |
| Idioms | Not verified this session — cupertino only; command not photographed | Both checked |
| Screens deep, Deck | 8 (6,591px ÷ 874), connected | ≤ 4 before an index |
| Screens deep, List | 15 (12,476px ÷ 874), connected | — |
| Records | 427 total · 18 pending · 409 history (25 shown, 384 behind "Show more") | — |

---

## 2 · Findings

### 1 — Four unrelated jobs share one screen and one scroll
`Inbox.jsx:90-796` (the whole file); real frames, all 8 Deck screenfuls

The file renders, in order: a capture composer (90-182), a filing-mode
setting (184-218), an 18-item decision deck with its own triage digest
(235-504), seven background-loop configuration cards (521-711), and a
409-row append-only history (713-796). Nothing on the page states which of
these is the reason he opened it. The inventory's own first-look note called
this "four different jobs on one screen" from source; the real frames
confirm it at scale: reaching History means scrolling past the loops
console regardless of whether either is what he came for.

| Before | Why | Severity |
| --- | --- | --- |
| Capture, deck, loops and history stacked in one `<div>` with no separation beyond an eyebrow per section | `designing-for-ios.md › Best practices`: "Help people concentrate on primary tasks and content by limiting the number of onscreen controls while making secondary details and actions discoverable with minimal interaction." `layout.md › Best practices`: "Make essential information easy to find by giving it sufficient space... don't obscure it by crowding it with nonessential details." | High |

### 2 — Verbs per card run to 7, against a 3-verb reference he named himself

The pending card's ordinary verb set is Approve, Discard, and a "Seen"
toggle (`Inbox.jsx:409-433`). A record whose kind triggers ask-why (Coach
advice, a daily review, a plan, a training check —
`valsInbox.js:451-487`) adds a reveal with its own submit and "Keep it"
(`Inbox.jsx:434-457`). A kind-specific door — Open in Practice, Open the
briefing, Deep weave, Research the books — adds one more
(`Inbox.jsx:458-485`). The tap-to-expand disclosure (`Inbox.jsx:355-359`) is
an eighth interactive element on the same card. The Coach deck he named as
his bar for "simple" answers with three: a tick, Discuss, a cross
(`CoachSuggestions.jsx:111-125`), no separate expand (the sentence and the
change-drawing are already on the card), no separate "seen" state.

| Before | Why | Severity |
| --- | --- | --- |
| Up to 7 verbs plus a kind door on one pending card | checklist §3, Verbs per card: "One primary, one quiet alternative, talk back." `accessibility.md › Cognitive`: "Keep actions simple and intuitive... minimize complexity." | High |

### 3 — 44 kinds become 27 route badges, not 26, and an unrecognized one silently mislabels itself

`valsInbox.js:16-35` (`SOURCE_LABEL`, 43 keys, counted directly), `:51-87`
(`ROUTE_META`). A direct count of `ROUTE_META` gives **27** distinct keys,
not the 26 both `REDESIGN-CHECKLIST.md:362` and the inventory state (their
own listed name-by-name enumeration also runs to 27 when counted; the total
they wrote down is off by one). More consequential: `valsInbox.js:395`
reads `ROUTE_META[r.decision.route] || ROUTE_META.note` — a route value
that matches nothing in the table falls back to the "NOTE" badge with no
signal that anything went wrong. This is the same class of fault the file's
own header comment (`valsInbox.js:11-15`) says it already fixed for
*kind* labels (the old ternary that silently called everything "TYPED");
the fix was never mirrored onto *route* labels.

| Before | Why | Severity |
| --- | --- | --- |
| An unmatched route badges itself NOTE with no error, same failure class already fixed once for kinds | `color.md › Best practices`: "Avoid using the same color to mean different things. Use color consistently... especially when you use it to help communicate information like status." | High |

### 4 — The loops console: seven status cards between the deck and History
`Inbox.jsx:521-711`; real frames, screens 2-5

Daily Review, Briefs (3 slots in one card), Compost, Open promises,
Todoist, Meal prep, Guardian: seven "status line + Run now" cards, each its
own colour, each a setting he changes rarely, all sitting between the 18
things waiting for a decision and the record of what already happened. The
Guardian card alone names 38 loop identifiers in one run-on line
("Loop heartbeats... dispatch, review, plan-today, weekly-debrief,
reminders...", real frame, screen 5) — an operations readout, not a
decision, on the page whose badge count is what the dock shows him.

| Before | Why | Severity |
| --- | --- | --- |
| Seven unrelated background-job settings between the deck and History | `layout.md › Visual hierarchy`: "Place items to convey their relative importance... it generally works well to place the most important items near the top." `layout.md › Best practices`: "Make controls easier to use by providing enough space around them and grouping them in logical sections. If unrelated controls are too close together... they can be difficult for people to tell apart or understand what they do." | High |

### 5 — Two triage surfaces for the same pile, and the do-all silently fails on a real case
`Inbox.jsx:247-271`, `inboxDigest.js:43-79`, `valsInbox.js:725-742`

The digest strip groups the 18 pending items into routine / patterned /
decide-one-at-a-time before the deck shows a single card — a second,
separate reading of the same pile the deck is about to present one at a
time. In his own real vault right now this pile includes a genuine
2-member "model choice" pattern with a "✓ all 2" do-all chip
(`Inbox.jsx:263`, real frame, screen 2). `valsInbox.js:738` implements the
do-all as `p.members.forEach((i) => i.approve && !i.isModelChoice &&
i.approve())` — every member of a model-choice pattern has
`isModelChoice: true` (`:514`), so the condition is false for every one of
them and the button does nothing at all when tapped. No error, no disabled
state, no explanation.

| Before | Why | Severity |
| --- | --- | --- |
| A visible, enabled "✓ all 2" chip that changes nothing on a real, currently-pending pattern | `feedback.md › Best practices`: "Show people when a command can't be carried out and help them understand why." | High |

### 6 — History's shape: 409 records, an unconditional promise, and 53 real exceptions
`Inbox.jsx:713-793`; Guardian's real report, screen 5

History's subtitle reads, unconditionally, "Every filing is on the record —
and undoable" (`Inbox.jsx:717`). `canUndo` is `r.status === 'filed' &&
!!r.undoData` (`valsInbox.js:438`): a filed record with no `undoData` gets
no Undo button. His own Guardian check, run for real during this audit,
reports **53 filed records missing undo data** as an ALERT (real frame,
screen 5). The subtitle is a plain, unqualified claim, and it is false for
at least 53 of the 409 rows on this exact page against this exact vault.
Separately, only the first 25 history rows render by default
(`Inbox.jsx:77-79`); "Show 100 more · 384 older" is the real pagination
label — 384 records are one tap away, in groups of 100, with titles
truncated to one line (`Inbox.jsx:741`) and no grouping by day or kind.

| Before | Why | Severity |
| --- | --- | --- |
| "Every filing is... undoable" stated as fact while 53 real records have no Undo | NOVA-METHOD non-negotiable: "Honest degradation, never fiction." `undo-and-redo.md › Best practices`: "Help people predict the results of undo... show the results of an undo." | Critical |
| 409 rows, 25 shown, one flat list, titles clipped at one line | `lists-and-tables.md › Content`: "Keep item text succinct... Consider ways to preserve readability of text that might otherwise get clipped or truncated." | Medium |

### 7 — The filing-mode ladder outranks the badge that names what's waiting
`Inbox.jsx:184-218`

A setting he changes a handful of times a year (`review-all` /
`auto-high` / `auto-all`) sits, expanded or collapsed, directly above the
"Waiting for your call · N" eyebrow that is the actual reason the dock
badge brought him here. Collapsed it is still a full-width row with its own
tap target; opened, three step-cards.

| Before | Why | Severity |
| --- | --- | --- |
| A rarely-touched setting sits ahead of the count of decisions waiting | `layout.md › Visual hierarchy`: "Place items to convey their relative importance... place the most important items near the top." | Medium |

### 8 — Motion is honest; the loading state for the loops console is not designed
`Inbox.jsx:225-230` (skeleton), `valsInbox.js:648, 661` (`'checking…'`)

The page's own pre-first-load skeleton (`SkeletonList`) is real and used
correctly, gated to connected + not-yet-loaded + online. But once connected,
individual loop cards that haven't resolved their own status (Daily Review,
Todoist, in the real frames captured for this audit) fall back to the
plain word "checking…" in place of the card's status line, not a skeleton —
a second, undesigned loading idiom on the same page that already has one.
Leave and entrance motion elsewhere (`nv-deck-rise`, `nv-leave-approve` /
`nv-leave-discard` at 420ms, 0 under reduced motion) is real, colour-coded
to the verdict, and honours `prefers-reduced-motion`
(`inboxLeave.js:1-15`).

| Before | Why | Severity |
| --- | --- | --- |
| "checking…" text in place of a skeleton on a page that already has `SkeletonList` | checklist §3, States: "Loading (skeleton)... all four designed." `loading.md`-adjacent judgment: a second, plainer loading idiom beside an existing designed one is inconsistency, not a HIG citation. | Medium |

### 9 — What only the real frames show

- **427 total records; 18 pending; 409 history.** Header: "427 captures ·
  routed by Nova." Pagination label: "Show 100 more · 384 older" → 384 + 25
  shown = 409 history rows; 409 + 18 pending = 427.
- **Oldest pending record: dated 30 Jul**, a Researcher-sourced item, found
  at the bottom of the List-mode render (the 18th of 18) — roughly 58 days
  old measured against 26 Sep.
- **0 of 5 sampled pending cards carried a "Seen" tag** (the top Deck card
  and 4 more read in List mode). Not a claim about all 18; a sample.
- **The digest's own breakdown, read directly**: "18 waiting — 11 on 3
  repeating subjects, 7 to decide" — 0 routine (auto-approvable) items
  currently pending.
- **Which kinds actually appeared this week**, counted from the visible
  History rows (26 Sep back to 25 Sep ~09:00): JOURNAL ×6, TRAIN EDIT ×11
  (Coach exercise edits), PRACTICE PAGE ×1, RE-FILED ×1, NOTE ×1, and one
  row with no badge at all despite a "Filed" status. Six of the eleven
  TRAIN EDIT rows share the identical timestamp 25 Sep 09:00 — one bulk
  Coach session produced six separate history entries.
- **Compost: 8 open orphan-note proposals** ("8 of 10 islands shown" per
  its own detail text). **Open promises: 0 open.** **Guardian: 1 ALERT**
  (the 53-record undo gap, finding 6) **among 4 OK checks.**
- **A global toast surfaced, unprompted, twice** during real capture: once
  a food-budget nudge with three action chips, once a morning greeting
  with a Reply chip — each drawn over whatever Inbox content was on screen
  underneath it. Neither originates in Inbox's own code (see §5); both are
  real interruptions a session on this page actually experiences.
- **Demo mode shows almost none of this.** `valsInbox.js:702`
  (`inboxConnected: !demoMode`) hides the composer, the whole pending
  deck and digest, the entire loops console, and History's real content
  the moment `demoMode` is true. A computed-style sweep of the demo page
  found **1 clickable element and a scrollHeight of 874px** (one screen,
  nothing to scroll) against the connected page's 109 elements and 6,591px.
  Any mockup built from demo-shaped content, per the redesign loop's own
  rule, will understate this page's true clutter unless it deliberately
  fabricates a busy demo state.

### 10 — Eleven type sizes; 95 of 109 controls under Apple's default target
Computed-style sweep, `main`, real connected Deck view

`11px, 11.5px, 12px, 12.5px, 13px, 13.5px, 14px, 15px, 16px, 27px, 30px` —
11 distinct sizes among text-bearing elements. Of 109 deduplicated
clickable elements, 95 measure under 44×44pt in their smaller dimension,
and 1 measures under the 28×28pt floor entirely. This is an accessibility
lens finding, not a craft one, and the skill's own rule marks accessibility
failures Critical regardless of how the rest of the page reads.

| Before | Why | Severity |
| --- | --- | --- |
| 11 type sizes on one screen | `typography.md › Conveying hierarchy`: "Minimize the number of typefaces you use... Mixing too many different typefaces can obscure your information hierarchy." | High |
| 1 of 109 controls measured under the 28pt accessibility floor | `accessibility.md › Mobility`: "Offer sufficiently sized controls... iOS, iPadOS: 44×44pt default, 28×28pt minimum." | Critical |

### 11 — A "card" has at least six different visual treatments on one page

Counted directly from source and confirmed in the frames: the pending/deck
card (`nv-pane`, 14/18 padding, `Inbox.jsx:304`); a loop status card
(`nv-pane`, coloured 1px border, `:527`); a nested proposal sub-card inside
a loop card (bordered `var(--nv-well)` fill, smaller radius, `:592, :629`);
a history row (no card chrome at all, a bottom hairline, `:730`); a digest
chip (a pill, not a card, `:252-268`); and the filing-mode step-card
(`:199-215`). None share padding, radius language, or border treatment with
another.

| Before | Why | Severity |
| --- | --- | --- |
| 6 distinct "card" grammars on one screen, none matching another | `collections.md › Best practices`: "Use the standard row or grid layout whenever possible... avoid creating a custom layout that might confuse people." | Medium |

### Smaller things seen
- The `isContinue` branch is hardwired `false` (`valsInbox.js:368`) yet
  still carries live JSX for a spend line and a footer string
  (`Inbox.jsx:337-342, 498-499`) — confirmed dead in source; by definition
  it cannot appear in any frame.
- `'repertoire'` is retry-eligible (`valsInbox.js:443`) with no
  `SOURCE_LABEL` entry (`:16-35`) — confirmed in source; no live
  `repertoire`-kind record was seen in this session's real data, so the
  TYPED-badge failure itself remains unobserved, not unconfirmed.
- `TickButton.jsx`, the exact component the Coach deck uses for its tick
  (`CoachSuggestions.jsx:6, 113`), is imported nowhere in `Inbox.jsx` or
  `valsInbox.js` — confirmed by direct grep; Inbox's "light tick" is a
  `TextAction`, a different component reaching for the same idea.
- One real history row read "Coach: You have flagged your o…" with status
  "Filed" and no route badge and no Undo button, the only such row seen —
  `route` was null for it (`valsInbox.js:395` returns `null` when
  `r.decision` itself is absent).
- A calendar-follow-up capture's `reason` text answered his 21 Sep "what
  does approving do" complaint in plain prose ("Approve if it happened —
  it journals the receipt"), but did not begin with "Approve =", so it
  rendered as the quieter `reason` treatment rather than the bold
  `approveLine` the fix was built for (`valsInbox.js:361-362`,
  `Inbox.jsx:333-335, 386`) — the fix is real but not universal.

---

## 3 · Keep

- **The light tick, not a button per idea.** "✓ Approve" as a `TextAction`,
  not a filled button (`Inbox.jsx:417-423`) — 22 Sep finding 13, confirmed
  again in source and in the real frames.
- **One do-all per repeating subject** at the pattern-group head
  (`Inbox.jsx:263`) — real and correct for every pattern except the
  model-choice edge case in finding 5.
- **Ask-why as a conversation, inline**, not a modal (`Inbox.jsx:434-457`)
  — in the spirit of `modality.md › Best practices`: "Present content
  modally only when there's a clear benefit;" a small, scoped reason does
  not need to leave the page.
- **Undo, where the data exists** (`Inbox.jsx:752-755`) — the mechanism is
  right; finding 6 is about its coverage, not its design.
- **Honest empties, verified live**: three distinct History copies
  (`Inbox.jsx:719-724`), the digest's own "nothing to triage" rule below
  two items (`inboxDigest.js:45`), and "Nothing you wrote down has been
  left hanging" shown for real against his actual 0-open-promises state.
- **`SwipeRow`'s concentric radius fix and direction lock** — the track
  wraps the card at zero gap so the corners share one radius token, and a
  vertical-intent drag can never commit a swipe (`SwipeRow.jsx:19-25`,
  `swipeAction.js`).
- **Inbox's own code never writes on load.** Across every real,
  read-only frame taken for this audit, Deck mode, List mode, and every
  scroll position, `Inbox.jsx`/`valsInbox.js` triggered zero blocked
  requests. The writes seen (§5) all originate elsewhere in the app.
- **The route-badge concept** — a hue plus a plain-English label per
  filing destination is a real, useful idea; findings 3 and 11 are about
  its coverage and its visual company, not the concept itself.

---

## 4 · Directions for the mockup round

**A · The deck alone.** Inbox keeps only the pending pile: the eyebrow, the
digest, the deck (or a compact list), the verb row. Capture moves to Voice
or the Nova button — the composer's own hint text already says "links ·
research · videos → just say it in the chat," meaning half of Nova's
capture surface already lives there. The seven loop cards move to Ops
(which already carries "records + heartbeats" and a human-gate pointer back
here, per its own inventory) or a Loops section in Settings. History
becomes its own route, a "Filed" tab, reached from here but not sharing its
scroll. Kept: the digest, the light tick, ask-why, Undo. Moved: the
composer, all 7 loop cards, all 409 history rows. Clutter numbers this
would hit: object count above the fold falls from 15 to roughly 4-5
(eyebrow, digest strip, one card, footer); the page becomes 1-2 screens to
work through 18 decisions instead of 8; the "four jobs" finding becomes
one job on this route and three on their own.

**B · The Coach-deck shape, on the surviving card.** Rebuild the pending
template on the exact bar he named: one sentence (the TL;DR verdict line
already exists and can lead), the change drawn (the route badge, kept as
the one accent), a tick and a cross, and ONE "talk back" that opens
whatever is right for that kind — ask-why, Open in Practice, the briefing,
Deep weave, Research the books all collapse into a single "Discuss"/"Open"
door chosen by kind, dropping the separate "Seen" verb (its job is already
done by the disclosure). Loops and History untouched; only the card
changes. Clutter numbers: verbs per card 7 → 3, matching the Coach deck
exactly; the six-card-grammar count (finding 11) is unaffected, since this
direction doesn't touch the loop cards or history rows.

**C · Mail, not seven decks.** Trade List mode's 18 full cards (12,476px)
for what History already does well: a one-line-per-item list (badge · title
· time), with SwipeRow's file/discard on the row and a tap opening the full
card, TL;DR, verb row and all, in a `GlassSheet`. Deck mode can stay as an
alternate "work through it" view built from the same rows. Apply the same
row shape to the loops console: seven one-line status rows, each opening
its own controls in a sheet on tap, so Pending, Loops and History read as
three consistent lists rather than three different card grammars (finding
11 resolved structurally, not by editing six templates into agreement).
Clutter numbers: List mode's 15 screens collapses toward History's own
density (409 rows already read as a compact list); one row shape instead of
six.

**D · What the pixels argue for.** 109 clickable elements and 11 type sizes
against a 3-verb, one-sentence reference; 8 screens in Deck and 15 in List
just to reach the 409-row history that starts after them; a "do-all" that
silently no-ops on a real pattern in his own vault; a subtitle that
promises universal Undo while his own Guardian report finds 53 exceptions.
The pixels argue for A as the structural move (split the four jobs), B as
what the surviving deck card should look like, and C as what the surviving
lists (pending, loops, history) should look like once they are lists rather
than stacks of differently-shaped cards.

---

## 5 · Method

**Frames.** 2 demo frames used (`--demo --style cupertino --hour day`): one
full-screen capture (demoMode's Inbox is exactly one screen, 874px, nothing
below the fold) and one computed-style sweep of the same state. 12 real,
read-only frames used from his live vault: 8 Deck-mode screenfuls at
scrollTop 0/874/1748/2622/3496/4370/5244/5622 (874px steps, covering the
full 6,591px), 2 targeted List-mode frames (the last pending card, and a
mid-list card sample for the Seen-tag check), 1 frame at the true scroll
bottom to confirm the History pagination text, and 1 computed-style sweep
of the connected Deck view. All screenshots were read with the Read tool;
none of his record titles, amounts, or note text appear anywhere in this
file — only counts, kinds, badges and structural shape, per the audit
convention.

**A tooling correction, recorded honestly.** The brief specified port 5194
for both the demo and real captures. The real (`--readonly`) shots taken on
5194 came back showing an "OFFLINE — showing last-known history" state,
which turned out to be genuine: `server/index.js:91` allowlists only
`http://localhost:5183` and `http://localhost:5173` (plus the GitHub Pages
origin) for CORS, and port 5194 is not on that list, so every fetch from a
page served at :5194 was rejected by the browser before the app ever saw a
real answer. Ports 5183 and 5173 were both free at the time (checked with
`lsof`), so the real captures were retaken on :5183 instead, which is
CORS-permitted and produced a genuine `LIVE` connection. The demo captures
are port-independent (no backend calls) and did not need retaking.

**Blocked writes, every one recorded.** `--readonly`'s interception engaged
on every real shot (`sawFetchPaused` true throughout; never exited 3).
Across the 12 real captures:
- `POST /api/notes/summary` — the most frequent. Traced to source:
  `App.jsx:4097-4108` (`ensureReviewSummary`), called from
  `refreshDailyReviewDetail` (`App.jsx:4142-4146`), itself invoked from the
  app's own notes-refresh handlers (`App.jsx:1641, 1759`) with **no check
  on `this.state.screen`**. This is Home's "concept revisit" feature
  (`00-inventory-a-home-chrome.md` H19), firing regardless of which screen
  is open.
- `POST /api/greet`, `POST /api/brief-state/greeted`, `POST /api/tts`
  (×2 in one run), `POST /api/conversation` — fired on longer-lived
  sessions, all together, consistent with a morning-greeting pipeline
  gated by elapsed time-since-boot rather than by screen. This matches
  memory `nova-ui-instruments`'s prior finding almost exactly: "an
  unguarded load of Home is itself a write (it briefs nobody into
  spoken-log)" — generalized here to: an unguarded load of the app AT ALL,
  on any screen including Inbox, is itself a write, once the session runs
  long enough.
- **Zero** blocked writes were ever attributable to `Inbox.jsx` or
  `valsInbox.js` themselves: not on load, not on any of the 8 scroll
  positions, not on the Deck/List toggle (confirmed a pure `useState`,
  Inbox.jsx:63-64). Inbox's own read path is genuinely read-only.

**What was not seen.** The `command` idiom (this session photographed
`cupertino` only, per his phone). The filing-mode ladder's three expanded
step-cards in a real frame (seen in source and in the demo frame; not
opened during a real capture, to avoid an extra, unnecessary interaction
sequence against his live vault). A live swipe gesture in motion (static
frames only; `SwipeRow`'s behaviour is read from source and the 22 Sep /
16 Sep fix comments, not re-filmed). Whether "Seen" is ever set to true
anywhere in his real 18 — the 0-of-5 figure in finding 9 is an honestly
labelled sample, not a full census (a full census would mean opening all
18 cards in List mode, which was not necessary to answer the audit's
questions and adds real interaction against his live data for no
proportionate gain).

**Inventory first-look notes, confirmed or corrected:**
- Dead `isContinue` branch — **confirmed** in source (`valsInbox.js:368`).
- `'repertoire'` retry-eligible with no `SOURCE_LABEL` entry — **confirmed**
  in source; not observed live (no such record was pending or in the
  visible history this session).
- Seven loop cards stacking before History — **confirmed** directly in the
  real frames (Daily Review, Briefs, Compost, Open promises, Todoist, Meal
  prep, Guardian, in that order).
- `TickButton.jsx` never imported by Inbox — **confirmed** by direct grep;
  its only importers remain `TechniqueCheck.jsx` and `CoachSuggestions.jsx`.
- `money-import`, `calendar`, and the three `practice-*` values as both a
  `kind` and a `route` — **confirmed** by direct key-count of both maps.
- The "26 `decision.route` variants" figure (inventory and
  `REDESIGN-CHECKLIST.md:362` both) — **corrected** to 27: a
  programmatic count of `ROUTE_META` (`valsInbox.js:51-87`) gives 27
  distinct keys, and the inventory's own comma-separated list of route
  names, counted by hand, also runs to 27; only the stated total was off
  by one.
- "#19 hour pickers now the house `Select`" — **confirmed** live: every
  time picker in the real frames (Daily Review, each Briefs slot) renders
  as the house pill-`Select`, not a raw `<select>`.
