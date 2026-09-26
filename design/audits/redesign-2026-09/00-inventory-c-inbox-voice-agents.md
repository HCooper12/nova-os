> **Inventory, not audit.** Produced 26 Sep 2026 by a read-only source survey (Sonnet) briefed by the redesign session; feeds `design/REDESIGN-CHECKLIST.md`. Ten random locators from this file were re-checked by hand against the source that day (see the checklist's ledger for the totals); known mis-cites: survey A none found; survey B: the Fuel `display:none` block is at `Recipes.jsx:540`, not 626-634; survey C: `VoicePresence.jsx:87` is a blank line (the glass treatment is at :99 and :142); survey D: `valsChrome.js:513` is `holdNovaText`, not `goSettings`. "First-look notes" are hypotheses from reading code, not findings from pixels. No product code was changed.

# Survey C — Inbox, Voice, Briefing, Ambient, Leader, Practice, Console

Read-only source survey. `Inbox.jsx` read in full (lines 1–799), `valsInbox.js`
read in full (lines 1–792), `Voice.jsx` read in full (lines 1–601),
`useDictation.js` read in full (lines 1–434). All other assigned files read in
full except where noted under "Not covered".

---

## Inbox — `inbox` — `src/screens/Inbox.jsx` (799 lines), vals `src/vals/valsInbox.js` (792 lines)
**Purpose:** capture any loose thought, and review/approve/discard everything
Nova's agents and loops have drafted, in one undoable rail.
**Reached by:** dock — main tab bar, `mkNav('Inbox', 'V.', 'inbox')` `src/vals/valsChrome.js:189`, badge = `inboxPendingCount`.
**Modes / sub-views / filters:** Deck vs List (`localStorage novaos.inboxDeck`, `Inbox.jsx:63-64`); pattern **focus** drill-down (session-only, `Inbox.jsx:69-72`); History `historyLimit` 25→+100 (`Inbox.jsx:77-79,789-793`); Filing-mode ladder — Review everything / Auto-file high confidence / Auto-file everything (`Inbox.jsx:189-218`, `valsInbox.js:107-111,713-718`).
**Idiom branches:** `secondary()` button style branches on `isAppleStyle()` (tinted pill vs hairline outline) `Inbox.jsx:26-30`; `cap()` sentence-cases a caps word for Apple styles, Command re-uppercases it via CSS `Inbox.jsx:22-24`.

### Features (top to bottom as rendered)
- [ ] F1 — Screen head + connection/offline/loading header label — `Inbox.jsx:92-95` (`valsInbox.js:693-699`)
- [ ] F2 — Headline "Drop the thought, Nova files it." — `Inbox.jsx:96`
- [ ] F3 — Capture composer pane (Capture eyebrow + route-list hint) — `Inbox.jsx:99-103`
- [ ] F4 — Capture textarea, local-echoed, Cmd/Ctrl+Enter submits — type — `Inbox.jsx:110-119`
- [ ] F5 — Dictate chip, mic toggle — voice — `Inbox.jsx:121-125`
- [ ] F6 — "links · research · videos → just say it in the chat" hint — `Inbox.jsx:132`
- [ ] F7 — "✦ Capture" / "Routing…" button — tap — `Inbox.jsx:133-134`
- [ ] F8 — "Landed" strip: today/filed-today counts + last 4 landed captures, each a tap-through to the record — `Inbox.jsx:145-181` (`valsInbox.js:754-763`)
- [ ] F9 — Filing-mode collapsed row, tap to expand — `Inbox.jsx:189-198`
- [ ] F10 — Filing-mode picker, 3 step-cards — tap — `Inbox.jsx:199-218`
- [ ] F11 — Loading skeleton (only pre-first-load, online) — `Inbox.jsx:225-230`
- [ ] F12 — "Waiting for your call · N" eyebrow, count-pulse animation on the number — `Inbox.jsx:236-238`
- [ ] F13 — Deck/List segmented control — tap — `Inbox.jsx:239-241`
- [ ] F14 — Triage digest strip: "File N routine" chip, per-subject pattern chips ("N × subject · See all" + "✓ all N" do-all text-action), "N to decide" chip — `Inbox.jsx:247-271` (`src/inboxDigest.js:43-79`)
- [ ] F15 — Focus banner "Showing X · N" + "Back to the deck" — `Inbox.jsx:272-277`
- [ ] F16 — The deck: two ghost cards behind the live top card — `Inbox.jsx:282-288`
- [ ] F17 — Pending item card, `SwipeRow` right=FILE / left=DISCARD — swipe/tap — `Inbox.jsx:290-303,300-303` (`src/SwipeRow.jsx`)
  - Route badge + "Low confidence" tag — `Inbox.jsx:32-40,306`
  - "Seen" tag + time·source meta — `Inbox.jsx:307-310`
  - TL;DR block (verdict line + numbered steps + "and N more") — `Inbox.jsx:321-332` (`src/tldr.js` via `valsInbox.js:406`)
  - Approve-line ("Approve = …") — `Inbox.jsx:333-335`
  - Continue-card spend meta — dead, `isContinue` is hardwired `false` — `Inbox.jsx:337-342` (`valsInbox.js:363-368`)
  - Title, 2-line clamp, tap-to-expand — `Inbox.jsx:343-350`
  - "▸ See what gets filed" / "▾ Show less" — tap — `Inbox.jsx:355-359`
  - Collapsed preview line (short-form only) — `Inbox.jsx:363`
  - Expanded "You captured" / "Will be filed" — `Inbox.jsx:364-379`
  - Reason line, italic-derived, 62% ink — `Inbox.jsx:386`
  - Daily-review adjustments: Done / Not today per line — tap — `Inbox.jsx:387-403` (`valsInbox.js:420-425`)
  - Error line — `Inbox.jsx:404`
  - Verb row: model-choice gate (Opus / keep) **or** light-tick "✓ Approve" — tap, haptic `commit` — `Inbox.jsx:409-423`
  - "✕ Discard" / "Skip this week" — tap — `Inbox.jsx:424-425`
  - "Seen" third-verb toggle — tap — `Inbox.jsx:428-433`
  - Ask-why panel: reason chips + free-text input + Discard(-with-reason) + Keep it — type/tap — `Inbox.jsx:434-456` (`valsInbox.js:451-486`)
  - "Open in Practice" — opens Practice screen — `Inbox.jsx:458-464` (`valsInbox.js:378-379`)
  - "Open the briefing" / "Watch it being made" — opens Briefing screen — `Inbox.jsx:465-471` (`valsInbox.js:499`)
  - "Deep weave" (video only) — starts a job — `Inbox.jsx:472-478` (`valsInbox.js:500-502`)
  - "Research the books" (read-next only) — dispatches Researcher — `Inbox.jsx:479-485` (`valsInbox.js:495-497`)
- [ ] F18 — Deck footer meta ("1 of N · swipe right to file …") — `Inbox.jsx:492-501`
- [ ] F19 — Proposed-rule card: Accept / alt / Skip — tap — `Inbox.jsx:507-519`
- [ ] F20 — "Loops" section head — `Inbox.jsx:524`
- [ ] F21 — Daily Review card: Off/Draft/Auto chips, hour `Select`, status line, "Run now" — `Inbox.jsx:527-544` (`valsInbox.js:639-657`)
- [ ] F22 — Briefs panel, 3 slots (morning/evening/weekly): label+hour `Select` on one line, mode chips on the next, status + "Run now" — `Inbox.jsx:548-578` (`valsInbox.js:553-582`)
- [ ] F23 — Compost loop card: last-run + open-count, "Run now", proposal rows (badge/title/detail, Accept/Open/Dismiss) — `Inbox.jsx:580-612` (`valsInbox.js:591-605`)
- [ ] F24 — Open promises (commitments) card: same shape, Accept/"Open the note"/"Let it go" — `Inbox.jsx:614-653` (`valsInbox.js:610-623`)
- [ ] F25 — Todoist sync card: status line, "Sync now", two-way footnote — `Inbox.jsx:655-669` (`valsInbox.js:658-668`)
- [ ] F26 — Meal prep card: status copy, "Run now" — `Inbox.jsx:671-680` (`valsInbox.js:631-634`)
- [ ] F27 — Guardian card: status dot+label, Run checks / Report / Export, per-check rows — `Inbox.jsx:682-708` (`valsInbox.js:670-688`)
- [ ] F28 — History section head — `Inbox.jsx:714-718`
- [ ] F29 — History empty-state, 3 honest variants (not connected / loading / nothing yet) — `Inbox.jsx:719-724`
- [ ] F30 — History row: time, route badge, title+status line, status meta, Undo/Retry/Deep-weave/Dismiss, expand for captured/full text — `Inbox.jsx:726-788`
- [ ] F31 — "Show N more · N older" pagination — `Inbox.jsx:789-793`

### Record kinds rendered (Inbox only)
Every pending/history row is built by `mkItem()` (`valsInbox.js:352-521`). Card
shape is one template; the columns below are **deviations** from the standard
verb set (Approve & file / Discard / Seen-toggle; Undo when `status==='filed' &&
undoData`, `valsInbox.js:438`; Retry when `status==='error'`, `valsInbox.js:443`).
**43 named `kind` values** in `SOURCE_LABEL` (`valsInbox.js:16-35`) + plain
captures (`kind` absent) = **44 kind-groups**; plain captures further split
into **26 `decision.route` card variants** (`ROUTE_META`, `valsInbox.js:51-87`).

| `kind` | label | deviation from standard | locator |
| --- | --- | --- | --- |
| *(none — capture)* | TYPED / VOICE | badge = `ROUTE_META[route]`; see route table below | `valsInbox.js:393,395` |
| review | DAILY REVIEW | ask-why discard (4 reasons); adjustments Done/Not-today rows | `valsInbox.js:420-425,461,477` |
| plan-today | PLANNER | ask-why discard (4 reasons: Too ambitious…) | `valsInbox.js:464,479-480` |
| training-check | TRAINING | ask-why discard, its own 4 reasons (Didn't happen…) | `valsInbox.js:457,474-475` |
| coach, fuel-cross | COACH / FUEL × TRAINING | ask-why discard when `decision.route` ∈ progression-tune/routine-edit/injury-log/goal-target/training-block, or kind is fuel-cross | `valsInbox.js:452-453` |
| model-choice | MODEL CHOICE | no Approve — Opus/Keep buttons instead; discard reads "Skip this week"; sub-lane label `pattern-scout`\|`distill` | `valsInbox.js:510-519,94` |
| practice-skill, practice-session, practice-status | PRACTICE ×3 | orange (`--nv-or`) badge; extra "Open in Practice"; `open()` goes to the rehearsal room, not `openCapture` | `valsInbox.js:42-49,84-86,378-379` |
| briefing | BRIEFING | extra "Open the briefing"/"Watch it being made" | `valsInbox.js:499` |
| video | WATCHER | extra "Deep weave"; retryable | `valsInbox.js:443,500-502` |
| read-next | LIBRARIAN | extra "Research the books" when `meta.concept` present | `valsInbox.js:495-497` |
| research | RESEARCHER | `expandLabel`="Read the report"; retryable | `valsInbox.js:371-373,443` |
| plan | NOVA | `expandLabel`="Read the plan" (unfinished) / "Read the report" (finished) | `valsInbox.js:371` |
| coach-review | COACH | `expandLabel`="Read the report" | `valsInbox.js:372` |
| study, paper | STUDY / STUDY → PROGRAM | retryable | `valsInbox.js:443` |
| dispatch, compost, guardian, cfo, money-import, meal-prep, food-suggestion, calendar, week-plan, pattern, autonomy, distill, ingest, weekly-debrief, exercise-research, brain-week, followup, studio, coach-program, coach-audit, forge-job, scout, leader-reflect, act, browse, program | (own SOURCE_LABEL) | standard verb set only | `valsInbox.js:17-34` |

**Plain-capture routes** (`decision.route` → `ROUTE_META`, `valsInbox.js:51-87`),
26 in all: shopping, journal, todo, note, food, expense, money-import, idea,
idea-outline, calendar, plan-note, recipe, stash, routine-edit,
progression-tune, exercise-remap, reminder, skill-backlog, agent-mode,
profile, distill-apply, ingest-apply, watch-note, continue (dead — no writer
produces it, `valsInbox.js:363-368`), practice-skill, practice-session,
practice-status (the last three double as both a `kind` and a `route`).

**Expiry:** no client-side expiry/time-value logic found anywhere in
`Inbox.jsx`, `valsInbox.js`, or grepped in `App.jsx` — UNVERIFIED whether the
"expiry for time-value kinds" the task brief describes exists only
server-side, or is not implemented at all on the client.

### Overlays & sheets this screen opens
**None.** `Inbox.jsx`/`valsInbox.js` open no modal or sheet directly — the
"ask why" block is an inline reveal on the card, not an overlay. The five
overlay files this survey was also asked to cover are wired to *other*
screens, not Inbox:
- `IngestModal.jsx` / `IngestReview.jsx` — opened from Library ("+ Add
  source", `src/screens/Library.jsx:121`, `src/vals/valsLibrary.js:193`) and
  Claude Code ("⇪ Add to vault", `src/screens/ClaudeCode.jsx:18`).
- `OutboxView.jsx` — opened from the top chrome/sidebar's "⇪ Outbox" chip
  (`src/MobileChrome.jsx:75`, `src/Sidebar.jsx:91`, `src/vals/valsChrome.js:687`).
- `VerdictCard.jsx` / `verdictOffer.js` — opened from Voice's "◆ Evidence"
  chip and Workouts/Recipes' plateau/tired/peak/protein links
  (`src/vals/valsChrome.js:437,455`, `src/vals/valsWorkouts.js:59-61`,
  `src/vals/valsRecipes.js:472`).
- `ReplySheet.jsx` / `chatUndo.js` — a global "reply to a banner" overlay
  (`src/App.jsx:9989`, `replyTo` state at `src/App.jsx:590,7785`) and Voice's
  own "Undo · N turns" new-chat guard (`src/screens/Voice.jsx:250-256`,
  `src/chatUndo.js`) — neither is Inbox-specific.

### States: loading / empty / offline / error / demo
- Loading — skeleton, pre-first-load only — `Inbox.jsx:225-230`.
- Empty — 3 honest history copies (not-connected/loading/nothing-yet) —
  `Inbox.jsx:719-724`; digest returns `null` under 2 pending items (nothing to
  triage) — `src/inboxDigest.js:45`.
- Offline — header reads "Offline — showing last-known history"; capture stays
  usable (queues to the Outbox) — `valsInbox.js:695-702`.
- Error — per-item `item.error` line — `Inbox.jsx:404`; history row status
  `error` + Retry — `Inbox.jsx:756-759`.
- Demo — `inboxConnected = !demoMode`; header reads "Connect a backend to
  capture" — `valsInbox.js:693-694,702`.

### Motion present
`countPulse .5s` on the pending count — `Inbox.jsx:238`; `nv-deck-rise` on a
newly-top card — `Inbox.jsx:299`; `nv-leave-approve`/`nv-leave-discard`
classes, 420ms (0 under reduced motion) — `src/inboxLeave.js:1-15`,
`Inbox.jsx:299,437`; `nv-stagger` on the commitments list — `Inbox.jsx:627`.

### Prior findings (22 Sep report)
- **#13 — decisions are a button per idea.** Inbox's own pending card is
  fixed: light tick "✓ Approve" replaces a labelled button, one "✓ all N"
  do-all sits at the pattern-group head, ask-why is the conversation path
  (`Inbox.jsx:263,417-423`). Report's 1b table still marks the *finding*
  "in progress" project-wide (Train · Today still runs 3 full buttons) —
  Inbox's own instance reads as done.
- **#19 — raw `<select>` in the briefs row.** Done (`ed42781` per 1b). Both
  the Daily Review hour picker and each brief slot's hour picker now use the
  house `Select` from `Controls.jsx` — `Inbox.jsx:536-538,563-565`.

### First-look notes from source (UNVERIFIED — no pixels seen)
- Dead `isContinue` branch (always `false`) still carries live JSX for the
  spend line and the footer copy — `valsInbox.js:363-368`, `Inbox.jsx:337-342,498-499`.
- `'repertoire'` is retry-eligible (`valsInbox.js:443`) but has **no**
  `SOURCE_LABEL` entry (`valsInbox.js:16-35`) — it would render as "TYPED",
  the exact class of bug the file's own header comment says it just fixed for
  four other kinds.
- Seven near-identical "status line + Run now" loop cards (Daily Review,
  3× Briefs, Compost, Open promises, Todoist, Meal prep, Guardian) stack
  below the fold before History even starts — `Inbox.jsx:527-708` — this is
  plausibly the "far too clunky" surface his 25 Sep note names.
- `TickButton.jsx` (assigned to this survey) is never imported by
  `Inbox.jsx`/`valsInbox.js` — its only callers are `TechniqueCheck.jsx` and
  `CoachSuggestions.jsx` (Train/Coach).
- `money-import`, `calendar`, and the three `practice-*` values are each both
  a `kind` (agent-authored record) and a `decision.route` (capture
  sub-variant) — the same string means two different things depending on
  which map reads it (`valsInbox.js:16-35` vs `51-87`).

---

## Voice — `voice` — `src/screens/Voice.jsx` (601 lines), vals inline in `src/App.jsx`/`src/vals/valsMisc.js`
**Purpose:** the spoken/typed conversation station — talk to Nova over the
real vault, with synced visual panels ("the glass").
**Reached by:** dock — main tab bar, `mkNav('Voice', 'II.', 'voice')`
`src/vals/valsChrome.js:186`. Also: wake word "Hey Nova", barge-in mid-reply
(`src/bargeIn.js`), and the chat router forwarding a question to Voice
(`app.navigate('voice')`, `src/App.jsx:6612`).
**Modes / sub-views / filters:** Conversation mode (auto-reopening mic) vs
single-turn; hearing engine `auto`/`nova`/`browser` (`src/hearingEngine.js`);
stage-focus scrim (mobile spotlight on the active glass card, `Voice.jsx:215-246`);
briefQueue guided yes/no/later Q&A (`Voice.jsx:485-494`); mobile column
reorder (core first, composer last, `Voice.jsx:257-265,438-448,549-555`).
**Idiom branches:** `cap()` sentence-cases labels for Apple styles
(`Voice.jsx:26`); transcript/composer font swaps UI-face reading size under
Apple vs monospace "station" face under Command (`Voice.jsx:266,433`); Send
button is a pill under Apple, a hard rectangle under Command (`Voice.jsx:435`).

### Features (top to bottom as rendered)
- [ ] F1 — ScreenHead "Neural link · Voice" + voice-state Tag — `Voice.jsx:206-207`
- [ ] F2 — Live clock, tabular mono — `Voice.jsx:209`
- [ ] F3 — Mobile stage-focus scrim: blurred backdrop, spotlit `StageCard`, the live question beside it, "TAP ANYWHERE TO DISMISS" — tap — `Voice.jsx:215-246`
- [ ] F4 — "COMMS LOG" bracketed panel, undo/new-chat header action — `Voice.jsx:248-266` (`src/chatUndo.js`)
- [ ] F5 — Empty-log placeholder line — `Voice.jsx:267-269`
- [ ] F6 — Message list — `Voice.jsx:270-365`:
  - tag/time/where + `TypeText` reveal — `Voice.jsx:275`
  - attached image/video chips — `Voice.jsx:276-282`
  - "Remember" action (files to Inbox) — `Voice.jsx:283-285`
  - research status line (queued/running/error/done+`SourcesPanel`) — `Voice.jsx:286-295`
  - acted receipt (Done/Undone + Undo) — `Voice.jsx:296-302`
  - proposal card (Yes do it / Leave it / status) — `Voice.jsx:303-324`
  - plan-report chips (Walk me through it / Take it to the Coach / Keep in vault) — `Voice.jsx:328-342`
  - inline `VoicePanel` (training-week/exercise/nutrition-week/note/pulse/sessions) — `Voice.jsx:343` (`src/VoicePanels.jsx:378-386`)
  - routing notice + "Just answer it" undo — `Voice.jsx:348-354`
  - evidence card → opens `VerdictCard` — tap — `Voice.jsx:356-364`
- [ ] F7 — "» NOVA reading the vault…" busy line — `Voice.jsx:367-369`
- [ ] F8 — The glass: hero `StageCard` + up to-4-deep rail, tap-to-enlarge on mobile (`GlassSheet`) — `Voice.jsx:379-414`
- [ ] F9 — Composer: attachments, route-preview label ("→ Shopping" etc.), text input, Send — type/tap — `Voice.jsx:415-436`
- [ ] F10 — The core: counter-rotating rings + tick marks in a reticle; the core itself is the mic button — tap/voice — `Voice.jsx:449-474`
- [ ] F11 — State caption under the core (8-rung copy ladder) — `Voice.jsx:195-201,475`
- [ ] F12 — briefQueue answer bar: Yes / No / Later / Stop, idx/total — tap/voice — `Voice.jsx:485-494`
- [ ] F13 — "▶ Tap to hear" speech-blocked replay banner — tap — `Voice.jsx:500-507`
- [ ] F14 — Centre-stage `StageCard`, dismissible × when focused — `Voice.jsx:512-521`
- [ ] F15 — `VoiceWaveform` (real meter) or iOS state-bar dots — `Voice.jsx:526-535`
- [ ] F16 — Ritual-invite chip ("Good morning — tap to start") — tap — `Voice.jsx:536-541`
- [ ] F17 — "≡ Brief me" chip — tap — `Voice.jsx:543` (`valsMisc.js:414-420`)
- [ ] F18 — "◐ Ambient" chip (voiceLive only) — tap — `Voice.jsx:544-546`
- [ ] F19 — Right rail "STATION · STATUS": MIC/ANSWERS/ENGINE meter rows, "HEY NOVA" on/off toggle, engine detail footnote — `Voice.jsx:556-577`
- [ ] F20 — Right rail "ON THE GLASS": spent-panel history, tap to re-focus — `Voice.jsx:581-593`
- [ ] F21 — `GlassSheet` full-screen enlarge (mobile) — `Voice.jsx:596-598`

### Record kinds rendered (Inbox only): n/a — not the Inbox screen.

### Overlays & sheets this screen opens
- `GlassSheet` — tap a glass card on mobile — `Voice.jsx:388,401` (`openGlassSheet`, `Voice.jsx:174`).
- `VerdictCard` — tap an "◆ Evidence" chip — `Voice.jsx:356-364` → `app.openVerdict` (`src/vals/valsChrome.js:437,455`).
- Stage-focus scrim is internal (not a separate component) — `Voice.jsx:215-246`.

### States: loading / empty / offline / error / demo
Busy — "» NOVA … reading the vault…" — `Voice.jsx:367-369,197`. Empty — no
messages yet placeholder — `Voice.jsx:267-269`. Offline/not-live — caption
falls to "STANDING BY" — `Voice.jsx:201`. Error — `dictationError`/`onError`
+ the speech-blocked banner — `Voice.jsx:110,500-507`. Demo — not branched in
this file (relies on `v.voiceLive`/`v.orbConnected`-style flags computed
upstream — UNVERIFIED from this file alone).

### Motion present
`ringSpin` 44s (outer) / 14s-or-3s-while-busy (inner) on the reticle —
`Voice.jsx:458-459`; `riseIn()` per-message stagger, keyed off first paint —
`Voice.jsx:271` (`src/css.js`); `nvGlassArrive` on a full `StageCard` —
`src/StageCard.jsx:113`; `railDepth()` recession on rail cards —
`Voice.jsx:401-409` (`src/glassDepth.js`); `wave` keyframe on iOS state bars —
`Voice.jsx:529-533`; `fadeIn`/`fadeUp`/`popIn`/`dotBlink` on the scrim,
glass-arrive, and research-status lines.

### Prior findings (22 Sep report)
- **#6 — two floating voice layers flat/opaque.** Report's fix (`ed42781`,
  done per 1b) targets `src/VoicePresence.jsx:87,126` (a **global** overlay
  mounted at `App.jsx:9924`, not part of this screen's own files). Voice.jsx
  carries its **own separate** "speech-blocked" banner at `Voice.jsx:500-507`
  with a flat `color-mix(…void 94%, black)` background and **no**
  `backdrop-filter` — matching the report's "Before", not its "After".
  UNVERIFIED whether this second copy was fixed in the same pass.

### First-look notes from source (UNVERIFIED — no pixels seen)
- The speech-blocked banner exists twice (`Voice.jsx:500-507` and
  `VoicePresence.jsx`) with apparently different treatments — see finding #6
  above.
- `ModelChoicePrompt.jsx` is a fixed top-of-screen banner
  (`src/App.jsx:9990`), a second, differently-styled UI for the same
  "pick a model" decision the Inbox renders inline as a card
  (`valsInbox.js:409-415`).
- The bracketed "station" `Panel` chrome (`Voice.jsx:46-69`) carries no
  cupertino-specific branch — the corner-bracket frame renders identically
  under both idioms.
- `ChatMarkdown.jsx` (assigned to this survey) is imported by `Briefing.jsx`,
  `Leader.jsx`, `Workouts.jsx`, `Library.jsx`, `RepertoireBook.jsx` — **not**
  by `Voice.jsx`, which renders chat text through bare `TypeText` instead
  (`Voice.jsx:275`). Bold/links/bullets in a Voice reply are not rendered as
  markdown, unlike the Leader's sit-down chat (`Leader.jsx:115`).

---

## Briefing — `briefing` — `src/screens/Briefing.jsx` (376 lines), vals `src/vals/valsBriefing.js` (128 lines)
**Purpose:** a researched report Nova performs beat-by-beat with synced
visuals ("listen"), or reads as a plain document ("read").
**Reached by:** OFF-DOCK — absent from `navMain`/`navVault`/`navSystem`
entirely (`src/vals/valsChrome.js:184-224`, grep-confirmed no `mkNav`). Entry
points: `app.navigate('briefing')` at a "briefing-resume" nudge after an
interruption (`src/App.jsx:7678`); `app.openBriefing(id)` — sets
`screen:'briefing'` directly, not via `navigate()` — called from an Inbox
`kind==='briefing'` card's "Open the briefing" link (`valsInbox.js:499`), a
`"#/briefing?id=…"` deep link / notification tap (`src/App.jsx:4395-4409`),
and the empty-screen's own "Already made" row (`Briefing.jsx:172-179`,
`valsBriefing.js:78`).
**Modes / sub-views / filters:** empty / loading / working (polls every 4s,
`Briefing.jsx:122-126`) / error / ready; within ready, Listen vs Read.
**Idiom branches:** `isAppleStyle()` only tweaks letter-spacing on the title
(`Briefing.jsx:332`); layout otherwise branches on `v.isMobile`, not on
cupertino/command.

### Features (top to bottom as rendered)
- [ ] F1 — ScreenHead "Knowledge · Briefing" (empty state) — `Briefing.jsx:138-141`
- [ ] F2 — Empty headline "Nothing open. Ask for one." — `Briefing.jsx:142-144`
- [ ] F3 — Explainer paragraph — `Briefing.jsx:145-147`
- [ ] F4 — 3 starter chips, router-tested phrasings, place text in the Voice composer — tap — `Briefing.jsx:148-152` (`src/briefingStarters.js`)
- [ ] F5 — "The stage, at rest" — dimmed standing `Glass` instrument — `Briefing.jsx:155-164`
- [ ] F6 — "Already made" — recent Inbox briefing records, live/working dot, title, state — tap — `Briefing.jsx:165-181` (`valsBriefing.js:66-79`)
- [ ] F7 — Loading line "Opening the briefing…" — `Briefing.jsx:186`
- [ ] F8 — Working state: title, topic quote, pulsing status line, angle checklist ✓/◍ — `Briefing.jsx:189-210`
- [ ] F9 — Error state: message + Back — `Briefing.jsx:215-222`
- [ ] F10 — Listen/Read segmented chips + browser-voice footnote — tap — `Briefing.jsx:339-343`
- [ ] F11 — Progress rule, fills with playback — `Briefing.jsx:346-350`
- [ ] F12 — Stage pane: hero `Glass` visual (title/term/heading/image/clip) + mini rail + desktop inline controls (Pause/Resume/Play, Restart, N/total) — `Briefing.jsx:241-253,25-103`
- [ ] F13 — Transcript pane: section eyebrow headings, tap-to-seek beat rows (current/past/upcoming) — tap — `Briefing.jsx:255-274`
- [ ] F14 — Document (Read mode): summary, "incomplete angle" warning, sections with "▶ Listen from here", glossary, Sources list — `Briefing.jsx:276-320`
- [ ] F15 — Head row: Briefing eyebrow, "In your vault"/"Keep in vault", title, "You asked: …", Close — `Briefing.jsx:326-336`
- [ ] F16 — Mobile floating controls bar, pinned above the dock — `Briefing.jsx:369-373`

### Record kinds rendered (Inbox only): n/a — not the Inbox screen. Reads Inbox records of `kind==='briefing'` only to populate F6 (`valsBriefing.js:66-79`).

### Overlays & sheets this screen opens
None — the `clip` visual embeds a YouTube iframe inline (`Briefing.jsx:89-94`), not a sheet.

### States: loading / empty / offline / error / demo
Loading/empty/working/error covered by F1-F9 above. No explicit offline
branch — `openBriefing` silently no-ops without a connection
(`src/App.jsx:4481-4482`). No `demoMode` reference anywhere in
`valsBriefing.js` — UNVERIFIED whether Briefing degrades honestly in demo
mode or simply shows whatever `st.briefing` already holds.

### Motion present
`popIn` on `Glass` frame arrival — `Briefing.jsx:34`; `scrollIntoView`
smooth-centre on the active transcript beat — `Briefing.jsx:115-119`;
`novaPulse` on the working-status dot and a live "Already made" row —
`Briefing.jsx:176,196`; progress-bar width transition 0.5s — `Briefing.jsx:348`.

### Prior findings (22 Sep report)
- **#20 — Briefing's empty state is a paragraph on a void.** Done (`fb2481e`
  per 1b) — confirmed in source: the empty branch now carries the house top
  padding/`ScreenHead`, a serif headline, a dimmed "stage at rest" instrument,
  and starter chips (`Briefing.jsx:130-183`) — matches the report's
  prescribed "After" exactly.

### First-look notes from source (UNVERIFIED — no pixels seen)
- `reel.js` (assigned to this survey under Briefing) is **not** imported by
  `Briefing.jsx` or `valsBriefing.js` at all. Its `buildReelRows`/
  `reelTimeline` exports are used only by `src/SpinReveal.jsx:3`,
  `src/App.jsx:8`, and `src/vals/valsMission.js:10` — the Repertoire
  "spin reveal" on Mission/Home. It has no relationship to this screen.
- `valsBriefing.js` never reads `ctx.demoMode` (contrast `valsInbox.js:693-694`).
- Two components independently define "which visual for this beat kind":
  `Briefing.jsx`'s `Glass()` (title/term/heading/image/clip,
  `Briefing.jsx:25-103`) and `StageCard.jsx`'s equivalent
  (key/steps/image/media/metric/bars/list/body/program,
  `src/StageCard.jsx:76-315`) — different vocabularies for the same concept
  across the two screens that share "the glass" idea.
- F6's "Already made" list and the Inbox's own briefing rows both
  independently filter/format the same `liveInbox` records
  (`valsBriefing.js:66-79` vs `valsInbox.js` kind==='briefing' handling).

---

## Ambient — `ambient` — `src/screens/Ambient.jsx` (168 lines), fed by `src/vals/valsOps.js:247-337`
**Purpose:** a full-screen "wall" presence mode — the core, the clock, and
the day's honest numbers; tap anywhere to leave.
**Reached by:** OFF-DOCK, no sidebar row at all. Only entry found in the
whole of `src/`: Voice's "◐ Ambient" chip (`src/screens/Voice.jsx:544-546`)
→ `v.goAmbient` → `app.navigate('ambient')` (`src/vals/valsOps.js:250`).
Exit: tap anywhere → `v.exitAmbient` → `app.navigate('mission')`
(`src/vals/valsOps.js:249`).
**Modes / sub-views / filters:** none — single view; `ambientState`
('unknown'/'attention'/'clear') only recolours the wash (`valsOps.js:280`).
**Idiom branches:** none found — no `isAppleStyle()` or cupertino/command
check anywhere in `Ambient.jsx`.

### Features (top to bottom as rendered)
- [ ] F1 — Full-bleed tap-anywhere scrim — tap — `Ambient.jsx:71-72`
- [ ] F2 — State-wash radial gradient (gold=attention/cyan=clear/none=unknown) — `Ambient.jsx:76-78`
- [ ] F3 — Giant clock (96px mono, blinking colon) + date line — `Ambient.jsx:80-90`
- [ ] F4 — `NovaCore` (size 300) + italic hero tagline — `Ambient.jsx:92-95`
- [ ] F5 — 3600s drift keyframe wrapping the lower content (OLED guard) — `Ambient.jsx:97-100`
- [ ] F6 — Tile row: NEXT / STEPS / PROTEIN / GATE (count-up numbers) — `Ambient.jsx:101-108` (`valsOps.js:251-265`)
- [ ] F7 — Objectives row: TRAIN STREAK / PROTEIN MONTH / STEP STREAK, present only when real — `Ambient.jsx:109-118` (`valsOps.js:273-277`)
- [ ] F8 — `PulseStrip` — one cached topic rotating every 9s — `Ambient.jsx:119,152-168` (`valsOps.js:282-284`)
- [ ] F9 — `StreamStrip` — up to 3 newest real receipts — `Ambient.jsx:120,136-148` (`valsOps.js:334-336`)
- [ ] F10 — Sync-age corner label, warn-coloured past 15 min — `Ambient.jsx:124-128` (`valsOps.js:269`)
- [ ] F11 — Screen Wake Lock, best-effort, re-acquired on visibility change — `Ambient.jsx:26-42`

### Record kinds rendered (Inbox only): n/a.

### Overlays & sheets this screen opens: none.

### States: loading / empty / offline / error / demo
`ambientState==='unknown'` (the ops slice absent) draws **no** wash at all —
an honest-absence state rather than a spinner (`Ambient.jsx:76`, `valsOps.js:280`).
"Stale" (`ambientSyncMin >= 15`) dims the whole lower block to 0.55 opacity
and turns the corner label warn-coloured (`Ambient.jsx:65,100,125`). No
explicit offline/demo branch — every figure degrades field-by-field to `—`
via its own state slice rather than a screen-level state.

### Motion present
`nvDrift` keyframe (inline-defined) 3600s linear infinite —
`Ambient.jsx:99`; `dotBlink` on the clock's colon — `Ambient.jsx:87`;
`CountUp` animated figures on every Tile — `Ambient.jsx:45-56`; `PulseStrip`
`fadeUp` per rotation — `Ambient.jsx:162`; 2s wash-colour transition —
`Ambient.jsx:77`.

### Prior findings (22 Sep report)
None of the 22 findings' locators fall inside `Ambient.jsx` or the `ambient*`
lines of `valsOps.js` — the screen was not part of that review's 40 shots.

### First-look notes from source (UNVERIFIED — no pixels seen)
- No idiom branching at all, unlike every other navigable screen the house
  rule targets ("ships in both Home idioms") — plausibly deliberate (a
  kiosk/wall mode, not a content screen), but nothing in source states an
  exemption.
- Single entry point, and even more hidden than Leader/Practice/Console
  (which at least have a sidebar row) — Ambient has none.
- `ambientObjectives`/`ambientPulseItems`/`liveOpsStream` are read from state
  slices this screen's own files never fetch — Ambient trusts App-level
  polling entirely, so opening it cold plausibly renders rows absent rather
  than loading (consistent with "honest degradation", but unguarded here).
- The only way to leave is tapping the whole screen; the sole affordance is a
  `title="Tap anywhere to return"` attribute (`Ambient.jsx:71`) — not
  discoverable on a touchscreen (no hover to reveal a title).

---

## Leader — `leader` — `src/screens/Leader.jsx` (146 lines), vals `src/vals/valsLeader.js` (111 lines)
**Purpose:** leadership development as daily practice — the day's idea, his
standing profile (struggles/what's working), and a sit-down conversation.
**Reached by:** sidebar/"More" — `navVault` row, `mkNav('Leader', 'XVII.',
'leader')`, hot-badged with the open-situation count
(`src/vals/valsChrome.js:207-213`). Also: `app.navigate('leader')` from
`answerSituation()` (`src/App.jsx:2131-2133`, called only from Home's older
"answer" affordance, `src/vals/valsMission.js:980`); an `announceAway`
"Leader answered" banner (`src/App.jsx:9500`); `valsLeader.js:109`'s
`openLeader` (used by every `LeaderBox` instance elsewhere, e.g. Home);
`valsChrome.js:287`'s job-tray chip while `leaderBusy`.
**Modes / sub-views / filters:** none — one continuous scroll (today's idea →
situation box → profile chips → sit-down chat → recent trail).
**Idiom branches:** none in `Leader.jsx` itself; `LeaderBox` (shared with
Home) takes an explicit `variant` prop ('apple' vs implied 'command') that
swaps its chrome, and this screen always passes `variant="apple"`
(`Leader.jsx:90`) — so the Leader screen itself never renders the Command
frame for its situation box, even under the Command idiom (UNVERIFIED
whether that is intended).

### Features (top to bottom as rendered)
- [ ] F1 — "Leader" h1 + "Leadership · daily practice" eyebrow + research-count meta — `Leader.jsx:56-60` (`valsLeader.js:92-93`)
- [ ] F2 — Today's idea card (chip/title/line/why/refs) or "no idea yet"/"connect a backend" fallback — `Leader.jsx:63-79` (`valsLeader.js:75-81`)
- [ ] F3 — `LeaderBox` situation card — the live open-situation question, answerable inline (type/voice) — `Leader.jsx:88-92` (`valsLeader.js:70-74`, `src/LeaderBox.jsx`)
- [ ] F4 — "Working against" chip list — struggles, tap to reveal + "Handled" resolve — tap — `Leader.jsx:95` (`valsLeader.js:87-88`)
- [ ] F5 — "Working for him" chip list — read-only — `Leader.jsx:96` (`valsLeader.js:89`)
- [ ] F6 — "The sit-down" head + "New conversation" — `Leader.jsx:99-104`
- [ ] F7 — Chat log, `ChatMarkdown`-rendered bubbles, sticky-to-bottom — `Leader.jsx:105-120` (`src/ChatMarkdown.jsx`, `src/useStickToBottom.js`)
- [ ] F8 — Empty-log placeholder — `Leader.jsx:106-111`
- [ ] F9 — "» Leader thinking it through…" busy line — `Leader.jsx:119`
- [ ] F10 — Composer input + Send — type/voice(via LeaderBox path only)/tap — `Leader.jsx:121-127`
- [ ] F11 — "Recent ideas" trail, last 5, date+chip+title — `Leader.jsx:130-143` (`valsLeader.js:82-83`)

### Record kinds rendered (Inbox only): n/a — not the Inbox screen. (`leader-reflect` is a distinct Inbox `kind` filed by this agent, see Inbox table above.)

### Overlays & sheets this screen opens: none — `LeaderBox` renders inline, not as a sheet.

### States: loading / empty / offline / error / demo
"Connect a backend in Settings to meet the Leader" when `!leaderConnected`
(`L == null`) — `Leader.jsx:77`, `valsLeader.js:95`. Empty chat placeholder —
`Leader.jsx:106-111`. No explicit error/demo branch inside this screen.

### Motion present
None specific to `Leader.jsx` itself beyond the shared `Interactive`
press-scale and `LeaderBox`'s own `fadeUp` face-swap
(`src/LeaderBox.jsx:97`) and swipe-page gesture (`useOptionPager`,
`src/LeaderBox.jsx:62`).

### Prior findings (22 Sep report)
None of the 22 findings' locators target `Leader.jsx`/`valsLeader.js`/
`LeaderBox.jsx` — the report's Home-card and Train-screen findings are
adjacent surfaces, not this screen.

### First-look notes from source (UNVERIFIED — no pixels seen)
- The situation box is duplicated by design across two surfaces (Home's card
  and this screen), both reading `situationFace()`/`situationReply()`
  (`valsLeader.js:31-58`) — intentional per the file's own comment, not a
  bug, but worth the redesign checklist knowing it's one shape rendered twice.
- The composer here has no visible mic affordance of its own (`Leader.jsx:121-127`
  is a plain `<input>`) — voice answers to the situation question go through
  `LeaderBox`'s separate dictation instance (`LeaderBox.jsx:64`), not this
  chat's own input.

---

## Practice — `practice` — `src/screens/Practice.jsx` (488 lines), vals `src/vals/valsPractice.js` (293 lines)
**Purpose:** the rehearsal room — practise a real conversation as a scripted
scene against an AI partner; progress is one lamp per move.
**Reached by:** sidebar/"More" — `navVault` row, `mkNav('Practice', 'XIX.',
'practice')`, badge = active-skill count (`src/vals/valsChrome.js:214-217`).
Also: `app.navigate('practice')` from the chat router recognising a named
skill (`src/App.jsx:6613-6618`); `openPracticeRoom`/`openPracticeSkill`/
`startRehearsal` each auto-navigate if not already there (`src/App.jsx:9543,9548,9579`);
`announceAway` banners "Your scene partner answered" / "Your debrief is
ready" (`src/App.jsx:9633,9707`); an Inbox `practice-*` card's "Open in
Practice" (`valsInbox.js:378-379`).
**Modes / sub-views / filters:** three states in one screen — **Shelf** (no
scene live), **Stage** (scene live), **Debrief** (scene ended) —
`Practice.jsx:481-488`. Shelf sub-state: skill selected → `SkillDetail` panel
opens under the rail (`Practice.jsx:242`).
**Idiom branches:** none found — no `isAppleStyle()` check in `Practice.jsx`;
`v.wrapLibrary`/`v.isMobile` drive the only layout differences (composer bar
fixed-above-dock on mobile vs sticky on desktop, `Practice.jsx:451-454`).

### Features (top to bottom as rendered)
**Shelf:**
- [ ] F1 — "Practice" h1 + "Rehearsal · N skills" eyebrow — `Practice.jsx:212-215` (`valsPractice.js:268`)
- [ ] F2 — "Connect a backend…" notice when disconnected — `Practice.jsx:216-218`
- [ ] F3 — "Preparing" rows — live-dot/error-dot + "Putting together '…'" while Nova drafts a new skill page — `Practice.jsx:220-230`
- [ ] F4 — Skill rail (`Rail`), one `SkillCard` per skill: title, `LampRow`, last-rehearsed/status tag — tap to select — `Practice.jsx:232-235,51-67`
- [ ] F5 — "Nothing on the shelf yet" empty copy — `Practice.jsx:236-240`
- [ ] F6 — `SkillDetail` panel (opens on select): summary, why (italic pull-quote), "Next: …" rehearse card, Moves section (lamp+name+quoted line+When/Tell+source+tally), Scenes section (name+setting+Rehearse), gap notes (+ "Upload the book in Library"), Rehearsals timeline (dated, lamp row, "Work on"), Open the page / toggle Pause·Resume / Close — `Practice.jsx:82-187` (`valsPractice.js:139-185`)
- [ ] F7 — "Add a skill" composer — free text + "Prepare"/"Sending…", research-mode note — type — `Practice.jsx:189-207` (`valsPractice.js:284-289`)

**Stage:**
- [ ] F8 — "On stage"/"Debrief" head + "Leave" (no debrief filed) — `Practice.jsx:366-369`
- [ ] F9 — Scenario card: scenario title, cast line, setting (expandable when compact), lamp row (chip form once live, full form before) + latest landed quote — tap — `Practice.jsx:375-404`
- [ ] F10 — Script — per-line speaker label + text, `you`-lines rail-indented, streaming cursor — `Practice.jsx:250-271,406-416`
- [ ] F11 — "Setting the scene…"/thinking indicator, 3-dot pulse — `Practice.jsx:410-415`
- [ ] F12 — Debrief panel: best-line quote, "Work on …", landed/missed counts, unparsed-debrief warning, notes, "Rehearse <next>" / "Done" — `Practice.jsx:419-447`
- [ ] F13 — Control bar (liquid-glass, floats above dock on mobile): mic glyph, text input, Send, Pause, "End scene" — tap/voice — `Practice.jsx:450-476` (`useDictation`, `Practice.jsx:338-349`)

### Record kinds rendered (Inbox only): n/a — not the Inbox screen. (`practice-skill`/`practice-session`/`practice-status` are the three Inbox kinds this agent files, see Inbox table above.)

### Overlays & sheets this screen opens: none — Stage/Debrief render inline within the same screen.

### States: loading / empty / offline / error / demo
"Connect a backend…" when disconnected (`Practice.jsx:216-218`,
`valsPractice.js:267`). Empty shelf copy (`Practice.jsx:236-240`). Preparing
error rows show the server's own error text or "it stopped without saying
why" (`valsPractice.js:110`). "Nova could not write this debrief as a
receipt, so nothing was filed" — an honest partial-failure state
(`Practice.jsx:438-440`, `valsPractice.js:254`). No demo-mode branch found in
`valsPractice.js`.

### Motion present
`shelfIn` stagger on skill cards, 40ms steps — `Practice.jsx:56`;
`nvGlassArrive` on skill detail/preparing rows (`arrive()` helper) —
`Practice.jsx:30,84,91,221`; `fadeUp` stagger (`rise()` helper, capped at
7×40ms) throughout Moves/Scenes/Rehearsals — `Practice.jsx:31`; `Lamp`'s own
one-shot "bloom" swell on landing (`data-bloom`, 600ms) —
`src/PracticeLamps.jsx:11-23`; `dotBlink` thinking dots, staggered 0/0.2/0.4s
— `Practice.jsx:413`; `novaPulse` live-dot — `Practice.jsx:33-35`.

### Prior findings (22 Sep report)
None of the 22 findings' locators target `Practice.jsx`/`valsPractice.js`/
`PracticeLamps.jsx`/`PracticeCard.jsx` — Practice shipped 27 Sep, after the
22 Sep review.

### First-look notes from source (UNVERIFIED — no pixels seen)
- Two differently-sized lamp renderings coexist for the same concept:
  `StageLampChip` (compact, post-partner-opening) and `StageLamp` (full, pre-
  and during-debrief) — `Practice.jsx:277-304` — a reasonable progressive
  layout, but two components to keep in sync.
- The debrief's `d.parsed===false` path (`Practice.jsx:438-440`) is the one
  place in this screen that can silently produce *no* filed receipt at all —
  worth a close look under the "honest degradation" standard, since nothing
  offers a retry.
- `reel.js`'s `buildReelRows`/`reelTimeline` (assigned to the Briefing
  section of this survey) power the Repertoire "spin reveal" on Home
  (`valsMission.js:10`, `SpinReveal.jsx:3`) — a close cousin to Practice's
  own "day's idea" concept but a wholly separate feature and file family.

---

## Console — `console` — `src/screens/ConsoleScreen.jsx` (29 lines), no dedicated vals file
**Purpose:** the morning brief drawn as five instruments instead of five
paragraphs of prose.
**Reached by:** sidebar/"More" — `navVault` row, `mkNav('Console', 'XVIII.',
'console')` (`src/vals/valsChrome.js:194`) — its **only** path in; grep found
no `navigate('console')` call site anywhere in `src/`.
**Modes / sub-views / filters:** none.
**Idiom branches:** none — the file has no style branch at all; `v.wrapConsole`
only varies mobile vs desktop padding (`src/vals/valsChrome.js:150`).

### Features (top to bottom as rendered)
- [ ] F1 — `ScreenHead` "Console" + "Your day, drawn" note — `ConsoleScreen.jsx:20`
- [ ] F2 — Fetch-on-mount effect (`refreshInstruments`, only if not already loaded/loading) — `ConsoleScreen.jsx:13-16` (`src/App.jsx:5771-5777`)
- [ ] F3 — `<Console>` instrument stack — 5 panels staggered in at 90ms
  intervals: Vitals, Day, Week, BodyInstrument, Fuel, then a "Read again"
  button — `ConsoleScreen.jsx:22-23` → `src/Instruments.jsx:325-375`
  (**not** in this survey's assigned file list — grepped only for the
  instrument names and stagger mechanics; not otherwise surveyed).
- [ ] F4 — Loading copy "Reading your day…" / empty copy "Nothing read yet —
  tap Read again." / error copy — `src/Instruments.jsx:343-353`

### Record kinds rendered (Inbox only): n/a.

### Overlays & sheets this screen opens: none.

### States: loading / empty / offline / error / demo
Loading — "Reading your day…" (`instrumentsBusy`). Empty/never-read —
"Nothing read yet — tap Read again." Error — the server error string, in
warn colour. No demo-specific branch found. — all in `src/Instruments.jsx:343-353`,
state wired from `src/vals/valsMisc.js:108-110`.

### Motion present
Per-instrument fade/rise-in, staggered by a 90ms interval counter
(`Instruments.jsx:335-341,357-363`) — the only motion on this screen; nothing
in `ConsoleScreen.jsx` itself animates.

### Prior findings (22 Sep report)
None of the 22 findings target `ConsoleScreen.jsx` directly.

### First-look notes from source (UNVERIFIED — no pixels seen)
- `ConsoleScreen.jsx` itself is a 29-line wrapper; all real content and all
  four instrument renderers live in `src/Instruments.jsx`, which is outside
  this survey's assigned file list (see "Not covered").
- This is the most hidden screen in the app of the seven surveyed: no
  navigate() call site outside its own sidebar row, so a person who never
  opens "More"/the sidebar list will never see it.

---

## Not covered
- **`src/Instruments.jsx`** — not in this survey's assigned file list. It
  holds the actual content of the Console screen (`Vitals`/`Day`/`Week`/
  `BodyInstrument`/`Fuel`) and is grepped/spot-read only far enough to name
  the five instruments and the 90ms stagger; its own internals (each
  instrument's layout, states, motion) are **not** surveyed here.
- **`src/VoicePresence.jsx`** — not in this survey's assigned file list, but
  referenced because it is the actual target of prior finding #6 (a global
  overlay mounted at `App.jsx:9924`, distinct from Voice.jsx's own
  speech-blocked banner). Not otherwise surveyed.
- Everything else in the assigned file list for Inbox, Voice, Briefing,
  Ambient, Leader, and Practice was opened and read in full; no other gaps.
