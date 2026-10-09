# 20 · Code · build checklist, round 3 (mockup 89)

The acceptance contract for building `design/mockups/89-redesign-code-r3.html`,
approved 10 Oct 2026: "Looking good. Ensure that the models are current (e.g.
fable 5.1 not 5). Also ensure that committing etc are all actually functional
and confirm it's not just for show."

One line per element, state, motion and copy line the mockup draws in its six
phone frames (Code, Project, Commit, Atlas, More, States) and the MacBook
frame, plus the round-1 functions audit 17 §3 keeps. Review furniture (the
frame switch, Replay, the reduced-motion switch, the notes, Your calls) is
outside the count. The mockup's names, paths, hashes and times are invented;
the build shows his real records or says plainly that there are none.

Status: `PRESENT` / `DIFFERS (why)` / `MISSING`, with the frame that proves it
(build frames `b-*` beside mockup frames `m-*` under the session scratchpad
`code-build/`), filled in after the build is photographed in demo mode with
invented state fed in memory.

## 0 · The ACTION TABLE (every action, its route, and what proves it real)

PROVEN = a server test against a temporary git repo or a stubbed CLI (named);
PROVEN BY READ = a read-only GET against the running server on localhost;
UNPROVEN = with why. Nothing here was run against his real workspaces or the
live server's write routes.

| # | Action | Where | Route | Proof | Status |
| --- | --- | --- | --- | --- | --- |
| A1 | Commit the ticked files | review | `POST /api/claude-code/commit {workspace, message, paths}` | | |
| A2 | Undo an unpushed commit | receipt, Done today | `POST /api/claude-code/undo {workspace, sha}` | | |
| A3 | Shelve | review | `POST /api/claude-code/shelve {workspace, paths}` | | |
| A4 | Restore | Nova's "Shelved" line in Runs | `POST /api/claude-code/unshelve {workspace, sha}` | | |
| A5 | Run (ask the Builder) | composer | `POST /api/claude-code/message` then `GET /message/:jobId` | | |
| A6 | Spar (send the Breaker) | composer | `POST /api/claude-code/spar` then `GET /message/:jobId` | | |
| A7 | New session | ⋯ sheet | client: the run moves into Runs as a closed run, Undo 8 s | | |
| A8 | Workspace switch | ⋯ sheet, Nova OS / Vault tiles | client, same closed-run rule | | |
| A9 | Add to vault | ⋯ sheet | Library's ingest door (`openIngestModal`) | | |
| A10 | Model for the next message | ⋯ sheet | `model` on A5, validated by `isValidModel` | | |
| A11 | Read the changes (files, lines, peeks) | review, tiles | `GET /api/claude-code/changes?workspace&sessionId` | | |
| A12 | Today's commits (Done today) | root | `GET /api/claude-code/commits` | | |
| A13 | Show a session on the Mac | Needs you, Sessions | `POST /api/ops/sessions/show` | | |
| A14 | Close a session left open | Sessions | `POST /api/ops/sessions/close` | | |
| A15 | Sessions picture | strip, tiles, Sessions | `GET /api/ops/sessions` | | |
| A16 | Tick / untick a file | review | client only (sets what A1 and A3 send) | | |
| A17 | Message rule (8+ characters) | review | client lights the eight ticks; server refuses under 8 | | |

## 1 · Code, the root (frame r)

| # | Element | Status |
| --- | --- | --- |
| R1 | Large title "Code" (34) and the ⋯ button (44) that opens the sheet | |
| R2 | The serif news line with Code's violet dot, written by code from the real state | |
| R3 | Needs you strip, gold, only while something waits on him: count chip, "Needs you", "oldest first" | |
| R4 | A waiting session row: its project glyph (small), "<Project> is waiting for you", the server's sentence and how long ago, Show (44) | |
| R5 | A Breaker-findings row: "The Breaker found N things", "A read-only pass on <project>, <time>", Open | |
| R6 | Section head "Projects" with "N sessions on your Mac" | |
| R7 | Nova OS tile: cyan glyph, name, "<branch> · the Builder works here", chevron | |
| R8 | Nova OS tile mini diff: one bar per ticked file, length by lines, added in the hue, removed hatched, drawn from the left | |
| R9 | State chips: Working (turning ring), Waiting for you (gold), N to commit (violet square), Done today N (green check), N left open (ring) | |
| R10 | Tile foot: the Builder's mark and what it is doing | |
| R11 | Science Atlas family tile: glyph in Atlas blue, "the work itself", its chips | |
| R12 | Wren nested on a branch line inside the family tile: outlined glyph, "its assistant", "Wren", "Tasks that support and guide the Atlas", its chips | |
| R13 | The branch line draws itself on arrival | |
| R14 | Two small tiles side by side: Vault ("Read and edited by the Builder, never committed by Nova") and Builds | |
| R15 | Done today: head "each with a way back", receipt rows (green check, "Committed <sha> · N files", "<project>, <time> · not pushed", Undo) | |
| R16 | Tapping Wren opens the Atlas page at Wren's tasks | |
| R17 | Cards rise once as they scroll in (opacity + 14 px), staggered | |

## 2 · The project page (frame p)

| # | Element | Status |
| --- | --- | --- |
| P1 | Back "Code" in violet (44) | |
| P2 | Head: large glyph (56), project title (28), "<branch> · the Builder works here", ⋯ (44) | |
| P3 | Sticky anchor bar: Commit N (violet square), Sessions N (cyan dot), Runs N (orchid square); the bar follows the reader | |
| P4 | Group head "Ready to commit" with "<branch> · N of M files" | |
| P5 | The review card (violet edge and bloom): totals +A (34, rounded) and −R (22), "lines, in the N ticked files" | |
| P6 | One row per file: a 44 pt tick, the name bold, its folder in mono, +A −R | |
| P7 | Each file's bar, as long as its lines, added in the hue and removed hatched, drawing from the left in a stagger | |
| P8 | A file another session changed arrives unticked, dimmed, "Changed by another session, left out" | |
| P9 | The first file's peek: first three added lines, "N more lines", Show all | |
| P10 | Message field "Say why, in a line" | |
| P11 | The 8-character rule as eight ticks that light as he types, "8 characters or more" then "Long enough to read later" with a green check | |
| P12 | Commit (violet, "Commit N files") dim until the rule is met; Shelve beside it | |
| P13 | The fine line under them about Shelve and Restore | |
| P14 | Sessions group "On your Mac", N sessions: state pip, name, the server's sentence, a quiet bar against 12 hours (live sweep while working), its words, Show or Close | |
| P15 | The fine line under Sessions explaining the bar | |
| P16 | Runs group "this session": authored lines on a thread, a ring for him, the Builder's solid orchid mark, the Breaker's cracked mark, Nova's cyan dot | |
| P17 | Line heads: who, then detail (Builder: model · minutes · files; Breaker: read-only · minutes), time | |
| P18 | Breaker findings as a numbered list | |
| P19 | A live Builder line: "working", a running clock, the words streaming with a caret, a sweeping progress bar | |
| P20 | Nova's "Shelved N files. Nothing lost." line with Restore | |
| P21 | The composer over the tab bar: Breaker chip (cracked mark), "Ask the Builder in <project>", send (violet, 44) | |

## 3 · The commit, acted out (frame c)

| # | Element | Status |
| --- | --- | --- |
| C1 | Typing lights the eight ticks one by one; at eight the rule turns met and Commit lights | |
| C2 | On Commit the ticked bars fold right to left, then the body gives way | |
| C3 | The receipt: green check drawing itself, "Committed <sha> · N files", the message and "not pushed", Undo | |
| C4 | The left-out note: "1 file left out: <name>, changed by another session. It stays uncommitted." | |
| C5 | The group head becomes "<branch> · N file left, another session's"; the anchor count goes to 0 | |
| C6 | Nova's line lands in Runs: "Committed <sha> · N files. Not pushed, so Undo can still take it back." | |
| C7 | Undo plays it back: the receipt leaves, the bars redraw, the count returns, Nova's "Undid <sha>. The N files are back as they were, uncommitted." | |

## 4 · The Atlas family page (frame a)

| # | Element | Status |
| --- | --- | --- |
| A-1 | Back, head with the Atlas glyph, "the work itself · with Wren, its assistant" | |
| A-2 | Anchor bar: The work N, Wren N, Commit · | |
| A-3 | "The work": Science Atlas's own sessions, with quiet bars and Close for a left-open one | |
| A-4 | Wren's section on a branch line in the family hue: outlined glyph, "its assistant", "Wren", the line, Wren's sessions | |
| A-5 | "Files to commit", "not read here yet", the dashed honest empty: Nova reads uncommitted work only where the Builder works | |
| A-6 | "No composer here: the Builder does not work in Science Atlas. These sessions run in your terminal." | |

## 5 · The ⋯ sheet (frame m)

| # | Element | Status |
| --- | --- | --- |
| M1 | A scrim over the page; the sheet rises (grab handle) | |
| M2 | "<Project> session" and the connection line (cyan dot): "Connected to your Mac · session open, it remembers this conversation" | |
| M3 | "Model for the next message": a segmented control of the live model labels (never a hand-typed version) | |
| M4 | "Where the Builder works": Nova OS / Vault | |
| M5 | The line: "Switching starts a new session. This one moves into Runs as a closed run, with Undo for 8 seconds." | |
| M6 | New session row: "Starts clean; this one stays in Runs, with Undo" | |
| M7 | Add to vault row: "Library's door: a file or a link into your notes" | |
| M8 | "What the Builder can and can't do": two checks and the can't line in ink ("Commits happen on this screen, by you.") | |

## 6 · States (frame s)

| # | Element | Status |
| --- | --- | --- |
| S1 | Loading: a skeleton of the tile, never a blank | |
| S2 | The Mac out of reach: "Your Mac isn't answering", the time Nova last saw it, the tile kept and dimmed, Commit, Shelve and Run paused | |
| S3 | Nothing running: "Nothing is running.", the line, "Ask the Builder in Nova OS" | |

## 7 · The MacBook (1280 × 800)

| # | Element | Status |
| --- | --- | --- |
| K1 | The root becomes a sidebar: title, Needs you, Projects with Wren on the branch, the selected tile outlined | |
| K2 | The project page splits: the review and Sessions beside Runs, the composer under Runs | |

## 8 · Motion and the standard

| # | Element | Status |
| --- | --- | --- |
| X1 | Numbers count up on arrival (the totals, counts) | |
| X2 | A pill with Undo on every write (commit, shelve, restore, switch, new session) | |
| X3 | FLIP when the file list or the receipts change | |
| X4 | Working ring turns; reduced motion stills it and shows end states with short cross-fades | |
| X5 | Every control 44 pt; no sideways scroll at 375 and 390 | |
| X6 | guard-cupertino prints "unchanged" | |

## 9 · Kept from round 1 (audit 17 §3)

| # | Element | Status |
| --- | --- | --- |
| K-1 | Shelve is a stash, never a discard, with Restore; Restore refuses a stash Nova did not make | |
| K-2 | The vault is read-only for commits, said in words | |
| K-3 | The Builder streams its words as they arrive | |
| K-4 | The model list follows the model board's live labels | |
