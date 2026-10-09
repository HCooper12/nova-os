# 20 · Code · build checklist, round 3 (mockup 89)

The acceptance contract for building `design/mockups/89-redesign-code-r3.html`,
approved 10 Oct 2026: "Looking good. Ensure that the models are current (e.g.
fable 5.1 not 5). Also ensure that committing etc are all actually functional
and confirm it's not just for show."

One line per element, state, motion and copy line the mockup draws in its six
phone frames (Code, Project, Commit, Atlas, More, States) and the MacBook
frame, plus the round-1 functions audit 17 §3 keeps. Review furniture (the
frame switch, Replay, the reduced-motion switch, the notes, the "New" marker,
Your calls) is outside the count. The mockup's names, paths, hashes and times
are invented; the build shows his real records or says plainly that there are
none.

Status: `PRESENT` / `DIFFERS (why)` / `MISSING`, with the frame that proves it
(build frames `b-*`, mockup frames `m-*`, side by side `pair-*`, the commit
recording `rec-*`, the worst case `w-*` and `worst-*`, all under the session
scratchpad `code-build/`). Photographed in demo mode only, at 390 × 844 × 3
(and 375 × 812, 1280 × 800), style summary, theme command, material glass,
core hologram, a guard rejecting every non-GET request (it recorded none),
with invented state fed in memory through the dev-only fixture switch
(`?codefx=demo|idle|worst|empty|one|away|loading`, src/dev/codeFixtures.js,
never in a production build: the built bundle carries none of it).

**Tally, 10 Oct 2026: 74 lines; 66 PRESENT, 8 DIFFERS, 0 MISSING. 17 actions:
14 PROVEN, 2 PROVEN BY READ, 1 UNPROVEN (Add to vault, unchanged and not a
Code write).**

## 0 · The ACTION TABLE (every action, its route, and what proves it real)

PROVEN = a server test against a temporary git repo made with mkdtemp, or a
stubbed CLI, named from `server/test/codeActionsReal.test.js` (12 tests) or
`server/test/codeModel.test.js` (8); PROVEN BY READ = a read-only GET against
the running server on localhost with the API token; UNPROVEN = with why.
Nothing here was run against his real workspaces or the live server's write
routes. The live server still runs the code from before this branch (it was
not reloaded), so the new read routes 404 there until the parent reloads it.

| # | Action | Where | Route | Proof | Status |
| --- | --- | --- | --- | --- | --- |
| A1 | Commit the ticked files | review | `POST /api/claude-code/commit {workspace, message, paths}` | "commit takes ONLY the ticked files: untracked and unticked files stay uncommitted, another session's staged file stays staged"; "the routes: commit ticked files, refuse traversal, list, undo, shelve and restore over HTTP" | PROVEN |
| A2 | Undo an unpushed commit | receipt, Done today, the pill | `POST /api/claude-code/undo {workspace, sha}` | "Undo takes back an unpushed HEAD Nova made, and the files are exactly as they were"; "Undo refuses a commit Nova did not make, one with a commit on top, and one already pushed" | PROVEN |
| A3 | Shelve | review | `POST /api/claude-code/shelve {workspace, paths}` | "Shelve takes only the ticked files and leaves the rest where they are" | PROVEN |
| A4 | Restore | Nova's "Shelved" line in Runs, the pill | `POST /api/claude-code/unshelve {workspace, sha}` | "Shelve and Restore round-trip the working tree exactly, by sha, through another stash on top" | PROVEN |
| A5 | Run (ask the Builder) | composer | `POST /api/claude-code/message` then `GET /message/:jobId` | "a run goes through the route to the transcript: the CLI is spawned, its words and the files it wrote come back on the job" (CLAUDE_BIN stubbed) | PROVEN |
| A6 | Spar (send the Breaker) | composer | `POST /api/claude-code/spar` then `GET /message/:jobId` | "spar sends the Breaker through the route and its findings come back on the job" | PROVEN |
| A7 | New session | ⋯ sheet | client: the run moves into Runs as a closed run, Undo 8 s | no server write; seen in the look: chat 8 lines → closed run, Undo restored it | PROVEN (client, in the look) |
| A8 | Workspace switch | ⋯ sheet, Nova OS / Vault tiles | client, same closed-run rule; the next message goes with `workspace: vault` | seen in the look (vault, one closed run, Undo back to repo with its 6 lines); the route's own workspace refusal in the run test | PROVEN (client, in the look) |
| A9 | Add to vault | ⋯ sheet | Library's ingest door (`openIngestModal`) | unchanged; in demo it refuses with "Connect a backend in Settings first", which shows the button reaches it | UNPROVEN (not a Code write; not exercised live) |
| A10 | Model for the next message | ⋯ sheet | `model` on A5, validated by `isValidModel` | live `GET /api/model-prefs`: Opus 5.5, Sonnet 5.5, Haiku 4.5, Fable 5.1; the run test refuses `gpt-4`; "the Builder line names the model by the board's label, never a typed version" greps the screen's files | PROVEN BY READ |
| A11 | Read the changes (files, lines, peeks) | review, tiles | `GET /api/claude-code/changes?workspace&sessionId` | "the review reads each file: lines, binary, untracked, and a file another session edited arrives marked"; live read returned 200 (old shape: clean, 0 files) | PROVEN |
| A12 | Today's commits (Done today) | root | `GET /api/claude-code/commits` | listed and checked inside the Undo tests and the route test | PROVEN |
| A13 | Show a session on the Mac | Needs you, Sessions | `POST /api/ops/sessions/show` | unchanged route; its own suite (claudeSessionsLive.test.js, spawn stubbed) passes; not run live (it raises a real window) | PROVEN (existing suite) |
| A14 | Close a session left open | Sessions | `POST /api/ops/sessions/close` | unchanged route, its suite passes; Close now asks first ("Close it" / "Keep"), seen in the look | PROVEN (existing suite) |
| A15 | Sessions picture | strip, tiles, Sessions | `GET /api/ops/sessions` | live read: "1 working, 5 left open", groups nova-os 3, Claude 1, Atomic_Hub 2 (a folder Nova does not name gets its own tile) | PROVEN BY READ |
| A16 | Tick / untick a file | review | client only (sets what A1 and A3 send) | "a file another session changed arrives unticked; his own tick wins either way"; in the look "Commit 3 files" → "Commit 2 files", totals followed | PROVEN |
| A17 | Message rule (8+ characters) | review | client lights the eight ticks; server refuses under 8 | "the 8-character message rule is the server's own, whitespace does not count"; "the 8-character rule lights one tick per character" | PROVEN |

## 1 · Code, the root (frame r)

| # | Element | Status |
| --- | --- | --- |
| R1 | Large title "Code" (34) and the ⋯ button (44) that opens the sheet | PRESENT · pair-r-1 |
| R2 | The serif news line with Code's violet dot, written by code from the real state | PRESENT · pair-r-1 (src/codeModel.js newsLine, tested) |
| R3 | Needs you strip, gold, only while something waits on him: count chip, "Needs you", "oldest first" | PRESENT · pair-r-1; gone in b-s-empty |
| R4 | A waiting session row: its project glyph (small), "<Project> is waiting for you", the server's sentence and how long ago, Show (44) | PRESENT · pair-r-1 |
| R5 | A Breaker-findings row: "The Breaker found N things", "A read-only pass on <project>, <time>", Open | DIFFERS · shown only while the findings are unanswered; once he writes to the Builder after them (the mockup's "Fix both."), they no longer wait on him, so the demo frame has one row. Seen in worst-375 ("The Breaker found 14 things") |
| R6 | Section head "Projects" with "N sessions on your Mac" | PRESENT · pair-r-1 |
| R7 | Nova OS tile: cyan glyph, name, "<branch> · the Builder works here", chevron | PRESENT · pair-r-1 |
| R8 | Nova OS tile mini diff: one bar per ticked file, length by lines, added in the hue, removed hatched, drawn from the left | PRESENT · pair-r-1 |
| R9 | State chips: Working (turning ring), Waiting for you (gold), N to commit (violet square), Done today N (green check), N left open (ring) | PRESENT · pair-r-1 (each chip only when its record is true) |
| R10 | Tile foot: the Builder's mark and what it is doing | DIFFERS · code writes it from his own request ("The Builder is on “Fix both.”"); the mockup's summary sentence would need a model to write it |
| R11 | Science Atlas family tile: glyph in Atlas blue, "the work itself", its chips | PRESENT · pair-r-1 |
| R12 | Wren nested on a branch line inside the family tile: outlined glyph, "its assistant", "Wren", "Tasks that support and guide the Atlas", its chips | PRESENT · pair-r-1 |
| R13 | The branch line draws itself on arrival | PRESENT · code (stroke-dashoffset on reveal) |
| R14 | Two small tiles side by side: Vault ("Read and edited by the Builder, never committed by Nova") and Builds | PRESENT · pair-r-2 (Builds from the Forge's real jobs; its chip only when built today) |
| R15 | Done today: head "each with a way back", receipt rows (green check, "Committed <sha> · N files", "<project>, <time> · not pushed", Undo) | DIFFERS · Nova's commits only, each with Undo while it can still reach; the Builds receipt ("Undo moves it aside") is not drawn because the Forge has no undo route |
| R16 | Tapping Wren opens the Atlas page at Wren's tasks | PRESENT · measured: Atlas page, Wren's group at 120 pt under the bars |
| R17 | Cards rise once as they scroll in (opacity + 14 px), staggered | PRESENT · code (IntersectionObserver, 60 ms stagger) |

## 2 · The project page (frame p)

| # | Element | Status |
| --- | --- | --- |
| P1 | Back "Code" in violet (44) | PRESENT · pair-p-1 |
| P2 | Head: large glyph (56), project title (28), "<branch> · the Builder works here", ⋯ (44) | PRESENT · pair-p-1 |
| P3 | Sticky anchor bar: Commit N (violet square), Sessions N (cyan dot), Runs N (orchid square); the bar follows the reader | PRESENT · pair-p-1, pair-p-2 (Sessions lit after scrolling) |
| P4 | Group head "Ready to commit" with "<branch> · N of M files" | PRESENT · pair-p-1 |
| P5 | The review card (violet edge and bloom): totals +A (34, rounded) and −R (22), "lines, in the N ticked files" | PRESENT · pair-p-1 |
| P6 | One row per file: a 44 pt tick, the name bold, its folder in mono, +A −R | DIFFERS · adds "· new" or "· deleted" after the folder, so an untracked or removed file says so |
| P7 | Each file's bar, as long as its lines, added in the hue and removed hatched, drawing from the left in a stagger | PRESENT · pair-p-1 |
| P8 | A file another session changed arrives unticked, dimmed, "Changed by another session, left out" | PRESENT · pair-p-1 (from that session's own journal, server-side) |
| P9 | The first file's peek: first three added lines, "N more lines", Show all | PRESENT · pair-p-1 |
| P10 | Message field "Say why, in a line" | PRESENT · rec-01 |
| P11 | The 8-character rule as eight ticks that light as he types, "8 characters or more" then "Long enough to read later" with a green check | PRESENT · rec-01, rec-02, rec-03 |
| P12 | Commit (violet, "Commit N files") dim until the rule is met; Shelve beside it | PRESENT · rec-01 to rec-03 |
| P13 | The fine line under them about Shelve and Restore | DIFFERS · "Shelve sets the ticked changes aside and keeps them. Restore brings them back." Shelve now takes the ticked files only, so shelving never stashes another session's work out from under it |
| P14 | Sessions group "On your Mac", N sessions: state pip, name, the server's sentence, a quiet bar against 12 hours (live sweep while working), its words, Show or Close | PRESENT · pair-p-2 |
| P15 | The fine line under Sessions explaining the bar | PRESENT · pair-p-2 |
| P16 | Runs group "this session": authored lines on a thread, a ring for him, the Builder's solid orchid mark, the Breaker's cracked mark, Nova's cyan dot | PRESENT · pair-p-2, b-p-3 |
| P17 | Line heads: who, then detail (Builder: model · minutes · files; Breaker: read-only · minutes), time | PRESENT · b-p-3 (the model is the board's label; files from the CLI's own tool calls) |
| P18 | Breaker findings as a numbered list | PRESENT · b-p-3 |
| P19 | A live Builder line: "working", a running clock, the words streaming with a caret, a sweeping progress bar | PRESENT · b-p-3 (clock m:ss, its own leaf) |
| P20 | Nova's "Shelved N files. Nothing lost." line with Restore | PRESENT · pair-p-2 (Restore really restores that shelf by its sha) |
| P21 | The composer over the tab bar: Breaker chip (cracked mark), "Ask the Builder in <project>", send (violet, 44) | PRESENT · pair-p-1 |

## 3 · The commit, acted out (frame c)

| # | Element | Status |
| --- | --- | --- |
| C1 | Typing lights the eight ticks one by one; at eight the rule turns met and Commit lights | PRESENT · rec-01, rec-02 (7 lit, Commit dim), rec-03 (8, met) |
| C2 | On Commit the ticked bars fold right to left, then the body gives way | DIFFERS · the bars fold and the files give way (rec-04a), but the message and "Committing" stay on the card until the Mac answers (rec-04b), so a slow Mac never shows an empty card |
| C3 | The receipt: green check drawing itself, "Committed <sha> · N files", the message and "not pushed", Undo | DIFFERS · as drawn (rec-05), plus "Review the rest" when files he unticked himself remain |
| C4 | The left-out note: "1 file left out: <name>, changed by another session. It stays uncommitted." | PRESENT · rec-05 |
| C5 | The group head becomes "<branch> · N file left, another session's"; the anchor count goes to 0 | PRESENT · rec-05 ("main · 1 file left, another session’s", "Commit 0") |
| C6 | Nova's line lands in Runs: "Committed <sha> · N files. Not pushed, so Undo can still take it back." | PRESENT · rec-06 |
| C7 | Undo plays it back: the receipt leaves, the bars redraw, the count returns, Nova's "Undid <sha>. The N files are back as they were, uncommitted." | PRESENT · rec-07, rec-08, rec-09 (and the message comes back) |

## 4 · The Atlas family page (frame a)

| # | Element | Status |
| --- | --- | --- |
| A-1 | Back, head with the Atlas glyph, "the work itself · with Wren, its assistant" | PRESENT · pair-a-1 |
| A-2 | Anchor bar: The work N, Wren N, Commit · | PRESENT · pair-a-1 |
| A-3 | "The work": Science Atlas's own sessions, with quiet bars and Close for a left-open one | PRESENT · pair-a-1 |
| A-4 | Wren's section on a branch line in the family hue: outlined glyph, "its assistant", "Wren", the line, Wren's sessions | PRESENT · pair-a-1 |
| A-5 | "Files to commit", "not read here yet", the dashed honest empty: Nova reads uncommitted work only where the Builder works | DIFFERS · same, and it says how to connect it (name its folder as a Builder workspace on the Mac, which would also let the Builder edit it) in place of "your call 4" |
| A-6 | "No composer here: the Builder does not work in Science Atlas. These sessions run in your terminal." | PRESENT · code |

## 5 · The ⋯ sheet (frame m)

| # | Element | Status |
| --- | --- | --- |
| M1 | A scrim over the page; the sheet rises (grab handle) | PRESENT · pair-m-1 (drag to dismiss through the house useSheetDrag) |
| M2 | "<Project> session" and the connection line (cyan dot): "Connected to your Mac · session open, it remembers this conversation" | PRESENT · pair-m-1 (before a first message: "the next message starts a session") |
| M3 | "Model for the next message": a segmented control of the live model labels (never a hand-typed version) | PRESENT · pair-m-1: Opus 5.5, Sonnet 5.5, Haiku 4.5, Fable 5.1, the live labels read from his server |
| M4 | "Where the Builder works": Nova OS / Vault | PRESENT · pair-m-1 |
| M5 | The line: "Switching starts a new session. This one moves into Runs as a closed run, with Undo for 8 seconds." | PRESENT · pair-m-1, and true: the switch and its Undo were exercised |
| M6 | New session row: "Starts clean; this one stays in Runs, with Undo" | PRESENT · pair-m-1 |
| M7 | Add to vault row: "Library's door: a file or a link into your notes" | PRESENT · pair-m-1 |
| M8 | "What the Builder can and can't do": two checks and the can't line in ink ("Commits happen on this screen, by you.") | PRESENT · pair-m-1 |

## 6 · States (frame s)

| # | Element | Status |
| --- | --- | --- |
| S1 | Loading: a skeleton of the tile, never a blank | PRESENT · pair-s (the news line waits too, rather than guess) |
| S2 | The Mac out of reach: "Your Mac isn't answering", the time Nova last saw it, the tile kept and dimmed, Commit, Shelve and Run paused | PRESENT · pair-s |
| S3 | Nothing running: "Nothing is running.", the line, "Ask the Builder in Nova OS" | PRESENT · pair-s |

## 7 · The MacBook (1280 × 800)

| # | Element | Status |
| --- | --- | --- |
| K1 | The root becomes a sidebar: title, Needs you, Projects with Wren on the branch, the selected tile outlined | PRESENT · b-mac-2 |
| K2 | The project page splits: the review and Sessions beside Runs, the composer under Runs | PRESENT · b-mac-2 |

## 8 · Motion and the standard

| # | Element | Status |
| --- | --- | --- |
| X1 | Numbers count up on arrival (the totals, counts) | PRESENT · CountUp fromZero on the totals, anchor counts and the Needs count |
| X2 | A pill with Undo on every write (commit, shelve, restore, switch, new session) | PRESENT · rec-05 "Committed … Undo", rec-08 "Took back … Undo", "Shelved 3 files Undo", "The Builder works in Vault now Undo"; one pill per write, never folded into "2 ticked" |
| X3 | FLIP when the file list or the receipts change | PRESENT · useFlipList on the files, sessions, runs and Done today |
| X4 | Working ring turns; reduced motion stills it and shows end states with short cross-fades | PRESENT · the reduced-motion rules read back from the CSSOM; not emulated (the devtools here cannot set the media feature) |
| X5 | Every control 44 pt; no sideways scroll at 375 and 390 | PRESENT · measured: 0 controls under 44 pt, scrollWidth 375/375 and 390/390, worst case included |
| X6 | guard-cupertino prints "unchanged" | PRESENT · "guard: cupertino Home unchanged (2 panes, 1242 px)" |

## 9 · Kept from round 1 (audit 17 §3)

| # | Element | Status |
| --- | --- | --- |
| K-1 | Shelve is a stash, never a discard, with Restore; Restore refuses a stash Nova did not make | PRESENT · tested (the "not nova" stash on top is refused and kept) |
| K-2 | The vault is read-only for commits, said in words | PRESENT · tested; "The vault is read-only from here. Nova never commits your notes for you." |
| K-3 | The Builder streams its words as they arrive | PRESENT · b-p-3 |
| K-4 | The model list follows the model board's live labels | PRESENT · read on arrival if the boot snapshot has not |

## 10 · The worst case (break-ui, 10 Oct 2026)

Fixture `worst`: 63 changed files (one path 300 characters long, a binary,
a deletion, nine changed by another session), a session waiting for 3 days,
a background session stuck in a folder with a long name, a paragraph for a
session name, a 147-file Builder line with an unknown model id, 14 Breaker
findings, five commits today. Plus `one` (every count at 1) and `empty`.

| # | What broke | Fix | Status |
| --- | --- | --- | --- |
| B1 | File name buttons were 30 pt tall | 44 pt, the row keeps its 58 pt | fixed |
| B2 | "+21,267" broke between the sign and the number | the totals never wrap | fixed |
| B3 | Sixty files made the page 63 rows long | the first twelve, then "Show all 63 files (51 more, 54 ticked in all)"; the totals and Commit always count every tick | fixed |
| B4 | A long folder name ran five lines in Needs you and four in its tile | clamped to two | fixed |
| B5 | "Nova OS is waiting on you, and Nova OS has one file…" | one sentence when one project is both | fixed |
| B6 | "−0" beside the added lines | the removed figure only when there is one | fixed |
| B7 | Twelve closed runs pushed the live run down | the newest shows, the rest fold behind one row | fixed |
| B8 | A slow commit left an empty card for the length of the request | the message and "Committing" stay | fixed |
| B9 | Rapid writes folded into "2 ticked" in the shared tick pill | one pill per Code write | fixed |
| B10 | A switch from the sheet closed the run twice | one switch | fixed |
| H | Held: the 300-character path (name ends in an ellipsis, the full path in its title and in Show all), the binary ("binary", dotted bar), the 3-day wait (bar full, "3 days quiet"), the unknown model id (shown as given), plurals at 1 | | held |
