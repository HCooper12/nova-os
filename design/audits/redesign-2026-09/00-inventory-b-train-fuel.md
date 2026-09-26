> **Inventory, not audit.** Produced 26 Sep 2026 by a read-only source survey (Sonnet) briefed by the redesign session; feeds `design/REDESIGN-CHECKLIST.md`. Ten random locators from this file were re-checked by hand against the source that day (see the checklist's ledger for the totals); known mis-cites: survey A none found; survey B: the Fuel `display:none` block is at `Recipes.jsx:540`, not 626-634; survey C: `VoicePresence.jsx:87` is a blank line (the glass treatment is at :99 and :142); survey D: `valsChrome.js:513` is `holdNovaText`, not `goSettings`. "First-look notes" are hypotheses from reading code, not findings from pixels. No product code was changed.

# Survey B — Train + Fuel

Read in full: `src/screens/Workouts.jsx` (lines 1–1235, all read), `src/screens/Recipes.jsx` (lines 1–1055, all read), `src/screens/PickItUp.jsx` (1–345, all read), `src/TrainToday.jsx` (1–352), `src/RecipeOverlay.jsx` (1–473), `src/AddRecipeModal.jsx` (1–153), `src/PortionSheet.jsx`, `src/portion.js`, `src/BarcodeScanner.jsx`, `src/trainPanels.js`, `src/weekSets.js`, `src/WeekSets.jsx`, `src/ExerciseSheet.jsx`, `src/CoachApplySheet.jsx`, `src/CoachSuggestions.jsx`, `src/coachWeek.js`, `src/FormCheckPanel.jsx`, `src/TechniqueCheck.jsx`, `src/techniqueCheck.js`, `src/TechniqueReveal.jsx`, `src/RepertoireBook.jsx`, `src/repertoireBook.js`, `src/PersonalRecord.jsx`, `src/BodyMap.jsx`, `src/gymVoice.js`, `src/sessionGuard.js`, `src/Glossary.jsx`, `src/TickButton.jsx`, `src/Elapsed.jsx`, `src/StepsHistory.jsx`. `src/vals/valsWorkouts.js` (903 lines) and `src/vals/valsRecipes.js` (1077 lines) surveyed by section (grep for every top-level block + targeted reads); `src/Body3D.jsx` (1604), `src/exercise3d.js`, `src/exerciseMotion.js`, `src/gym3d.js`, `src/rig3d.js`, `src/muscleHue.js`, `src/coachSuggestions.js` surveyed by export list + targeted reads (large, mostly geometry/data, not hand-authored UI copy).

---

## Train — `workouts` — `src/screens/Workouts.jsx` (1235 lines), vals `src/vals/valsWorkouts.js` (903 lines)

**Purpose:** the training home — today's readiness and plan, the live workout logger, and the Coach conversation, in one tabbed screen.

**Reached by:** dock nav item "Train" → screen key `workouts`, badge = live routine count (`src/vals/valsChrome.js:198`). Also: Home's readiness ring `onOpen: go('workouts')` (`src/vals/valsMission.js:380`), Home dock "train" action (`:446`), Home's resume-session card (`:483`), today's-routine card primary (`:493`), "Do it now" / "Start in Train" / "See the session" cards (`:503,548,557`), the PR-moment card's `openTrain` (`:825`). Coach's own forwarded questions land here with `trainTab:'coach'` (`src/App.jsx:6611,7522`), a lost-mid-restart Coach answer re-opens here (`:9344,9378`), a ready quick session opens here (`:9418`). Notes screen can jump straight into a named recipe— not applicable here (that's Fuel); Notes can also open Train indirectly via forward routing (see App.jsx:6611).

**Modes / sub-tabs:** `trainTab` ∈ `{today, gym, coach}`, a `Segmented` control (`src/screens/Workouts.jsx:1196-1199`); tab defs `trainTabs` in `src/vals/valsWorkouts.js:97-101` (GYM tab shows a live "●" dot while a session is running). Further modes inside GYM: `workoutsView` ∈ `{routines, routine, session, history}` (`Workouts.jsx:1223-1226`). Demo mode (`v.workoutsDemo && !v.usingLiveWorkouts`) renders the scripted `MockWorkouts` instead of tabs (`:1216`, component at `:852`). No connection + no demo: honest "haven't loaded" text, never placeholder data (`:1217-1220`).

**Idiom branches:** `v.structured` (cupertino/Apple) renders the week as a grouped full-width list (`Workouts.jsx:178-197`) vs a horizontal day-strip for command (`:198-220`) — same `weekStrip` model either way. `isAppleStyle()` governs sentence-case vs uppercase routine/session names throughout (e.g. `:145,502` cupertino path `Hands free`/mixed case vs `.toUpperCase()` elsewhere), numeral input font sizing (`Workouts.jsx:26-33`), and the mid-session Coach log's font size/height via `v.isMobile` (`:1069`).

### Sub-screen: Today (`v.trainTab==='today'`, rendered by `src/TrainToday.jsx`)
- [ ] T1 — Readiness ring (`Ring`) — HRV/sleep/resting-HR facts, block phase tag, deload warning, "Why am I tired?"/"When am I at my best?" chips — `src/TrainToday.jsx:20-36,73-96` — tap chip opens Coach with the question pre-asked.
- [ ] T2 — Resume-session card (gold) — "Session in progress", sets ticked, ▶ Resume — `TrainToday.jsx:97-110` — tap → `resume.go`.
- [ ] T3 — Make-up-day card — "Finish {routine}", exercise list, "Finish the session" / "Not a make-up after all" — `TrainToday.jsx:112-131`; rule that a make-up never hides the schedule (both shown together): `src/trainPanels.js:14-27`.
- [ ] T4 — Made-up-today card (good/green) — `TrainToday.jsx:133-140`.
- [ ] T5 — Scheduled/rest-day card — today's routine name, exercise count, last volume, ▶ Begin session; "Rest day" honestly stated — `TrainToday.jsx:142-158`.
- [ ] T6 — Focus-for-today card — a serif verdict figure ("+N reps earned" or "has outgrown its prescription") with reasoning demoted beneath, or a plain recovery-day sentence; "Make the change" button opens the fix — `TrainToday.jsx:180-208` — this is finding #12's fix (see Prior findings).
- [ ] T7 — Momentum rail (PRs / plateau / streak cards), fixed-height, scroll-snap, bordered in the lifted muscle's own hue — `TrainToday.jsx:213-243` — tap a plateau card → `askPlateau`.
- [ ] T8 — Coach's open ask card (gold/warn) — a proposed change with a light "✓ Do it" / "Discuss it" / "✕ Not this", exits with a leave-animation before the action runs (`inboxLeave.js`) — `TrainToday.jsx:247-274`.
- [ ] T9 — "Hard sets this week" volume card — per-muscle bars in the muscle's own hue, a live-this-session gold overlay segment, "Short by Sunday ▲" / "Goal muscles under" line, tap opens the full planned week — `TrainToday.jsx:276-322` — opens `WeekSetsSheet` (`:325-327`).
- [ ] T10 — Under-target CTA row ("… under target for your goal — ask Coach how to add sets →") — `TrainToday.jsx:313-320`.

Interactions: tap (cards, chips, rail cards), the volume card's whole header is one tap target that opens the week sheet. No swipe/long-press on Today itself (long-press lives in Gym/routine rows). Opens: `WeekSetsSheet` (sheet).

### Sub-screen: Gym — the logger / live session
**Routines list** (`RoutinesView`, `Workouts.jsx:110-410`):
- [ ] G1 — Done-today banner (good, ring tick) — `:112-120`.
- [ ] G2 — Also-scheduled-today line + "Begin it anyway" — `:130-134`.
- [ ] G3 — Active-rest card — `:136-141`.
- [ ] G4 — On-today's-card hero — targets chips (`MuscleTag`, muscle-hued, `:1178-1185`), "Per exercise ▾" disclosure of which exercise trains what, ▶ Begin session — `:142-173`.
- [ ] G5 — Week strip (grouped list, cupertino, or day chips, command) — per-day routine select, make-up/carryover note — `:178-220`.
- [ ] G6 — Discarded/replaced-workout recovery banner — "Restore it" / "Dismiss" — `:235-247`.
- [ ] G7 — Resume-session card (parked mid-set) — `:251-266`.
- [ ] G8 — Finish-missed-exercises card — push undone exercises to a picked day — `:268-282`.
- [ ] G9 — Carry-overs list — "Do it now" / "Reschedule" / "Remove", per-card overdue/due-soon colouring — `:284-320`.
- [ ] G10 — Routines grid — name, ◆-completed count, exercise preview, target-muscle chips; tap opens, long-press opens context menu — `:344-368`.
- [ ] G11 — "+ New routine" inline create — `:322,332-345`.
- [ ] G12 — Quick session builder (Coach's impromptu session) — minutes select, optional note, "Build my session" → plan preview → "Start this session" — `:370-395`.
- [ ] G13 — Goals + Coach pane reused here too (`GoalsCoachPane`, `:407,972`).

**Routine detail** (`RoutineDetailView`, `:412-486`):
- [ ] G14 — Start workout / View history buttons — `:417-424` — start is gated by `guardSessionStart` (`src/App.jsx:3665-3674`, never overwrites a logged-in-progress session; the 26 Sep loss this fixed, `src/sessionGuard.js:1-26`).
- [ ] G15 — Per-exercise row — name, "◉ 3D" chip (opens ExerciseSheet), Coach-prescription chip/tag (tap opens reasoning sheet at click point), last-time meta, target sets/reps number inputs, move up/down, Form check toggle, Remove — `:429-465`.
- [ ] G16 — Exercise picker (search, muscle-group filter, tap-to-add / hold-to-preview, "not listed → create") — `ExercisePicker`, `:42-100`.
- [ ] G17 — Delete-routine confirm flow — `:471-484`.

**Session view** (`SessionView`, `:488-800`):
- [ ] G18 — "Log it by talking" voice entry banner ("Hands free") — `:499-508` — opens `gymVoice.js` command grammar (parseInSession/applyInSession: `src/gymVoice.js:47-159`; verbs: set/weight/same/addset/next/skip/finish/later/where/undo).
- [ ] G19 — Per-exercise header — name, 3D chip, "▶ Form" chip (curated vs generic), Skipped tag, Coach chip/tag, Coach-added ◆ tag, focus-note tag, skip/unskip toggle — `:513-539`.
- [ ] G20 — Muscle-group tag + adhoc "Extra · today only" tag + last-time label — `:544-556`.
- [ ] G21 — Set grid (one shared column template for header + rows, so labels can't drift) — SET / weight (hidden for bodyweight) / reps / RPE / RIR / TYPE / tick / remove — `:557-609` — `setCols()` helper `:30-31`; number-pad inputs via `LocalInput`; set-type cycles working→backoff→warm-up (`:590-593`); the 40×40px tick is the most-tapped control (`:595-601`).
- [ ] G22 — "+ Extra set" — `:618`.
- [ ] G23 — Per-exercise note (auto-growing textarea), Anomaly/"Off day" toggle, Pain? toggle, Form check toggle — `:620-631`.
- [ ] G24 — Pain flow — area chips (exercise-relevant list, `PAIN_AREAS` map `src/vals/valsWorkouts.js:419-424`), side, when, free-text detail, "Ask Coach — triage this" — `Workouts.jsx:633-666`.
- [ ] G25 — "+ Add exercise — this session only" (adhoc, never touches the program) — `:670-679`.
- [ ] G26 — Cut-short reason chips ("out of time"/"low energy"/"gym busy"/"pain") shown once something is undone — `:681-688` — reason rides the finished record for Coach to notice (`src/App.jsx:3866-3868`).
- [ ] G27 — Finish workout / Save changes, Save for later, Cancel session (confirm) — `:692-705`.
- [ ] G28 — Mid-session "Ask Coach" pane — sees live session state, proposal cards with Apply/Not now, batch "Apply all N" — `:708-782`.
- [ ] G29 — PR celebration overlay on finish, when the finished session contains a record — triggered in `src/App.jsx:3874-3879`, rendered `:9935-9938` (see `PersonalRecord.jsx` below).

**History** (`HistoryView`, `:802-849`): past sessions, sets/volume, cut-short note, "Coach said" callout, Edit / Delete-confirm per session.

**Demo (`MockWorkouts`, `:852-903`):** the scripted push-day plan + a chat-only "Ask Coach" demo pane, shown only with no live connection.

**Coach's changes deck & banner** (`CoachSuggestions.jsx`): `CoachChangesBanner` — a one-line "N changes from Coach" strip shown under Today and Gym while something waits (`Workouts.jsx:1210-1212`, component `CoachSuggestions.jsx:26-44`). `CoachSuggestionDeck` — full deck at the top of Coach tab, one card per proposed change: WHERE (routine+day), the change drawn (`ChangeStrip`: add/remove/move/swap/targets/reorder/remap/schedule/gauge, `CoachSuggestions.jsx:174-262`), WHY, a `TickButton` "Yes" + "Discuss" + a plain ✕ "Not now" (no reason prompt — see SPEC item 6 below), "Yes to all N" batch (`CoachSuggestionDeck`, `:47-79`). Note: **the ✕ decline is a single tap with no "why" capture** — `answerCoachSuggestion` (`src/App.jsx:7168-7189`) calls `inboxDiscard` directly; only "Discuss" opens a conversation.

### Sub-screen: Coach (`GoalsCoachPane`, `Workouts.jsx:972-1176`)
- [ ] K1 — `CoachSuggestionDeck` at the top (see above) — `:975`.
- [ ] K2 — Goals card — goal sentence (serif), `GoalBoard` (3 rings: steps/protein/kcal, each with a 7-day dot strip and one headline sentence, `:945-970`), days/week dot row, priority-muscle chips (`MuscleTag`), notes; editable form (goal, focus, days/week, 3 numeric targets, equipment, limitations, free notes) — `:1004-1057`.
- [ ] K3 — Real Coach chat — empty-state starter prompts + "What the Coach is reading" instrument (per-muscle bars from `coachWeekRows`, `src/coachWeek.js:7-29`) shown only when the log is empty (fills finding #8's void) — `Workouts.jsx:1080-1099`.
- [ ] K4 — Message list — Coach replies (`ChatMarkdown`/`TypeText`), inline `VoicePanel` data panels, per-message change proposal(s) rendered via `ChangesPointer` (a receipt list that scrolls up to the deck rather than re-showing full apply/decline controls in-chat, since 25 Sep) — `:1110-1122`, `ChangesPointer` component `:914-940`.
- [ ] K5 — Chips (contextual quick replies), attach strip/pending, "Discussing …" indicator with a clear (✕) — `:1124-1143`.
- [ ] K6 — "Bring a study" — paste a paper link for the Researcher to read — `:1145-1147`.
- [ ] K7 — Composer with attach + Ask — `:1149-1163`.

### Overlays & sheets Train opens
- **ExerciseSheet** (`src/ExerciseSheet.jsx:60-100`) — long-press an exercise row, or tap a name on Today; morphs from the row via view-transition name when opened from a session row, else slides up; skeleton at final height (fixes finding #5); renders the same `VoicePanel` Exercise card the chat uses (body-map, 3D, cues, history) — includes `BodyMap` 2D muscle diagram (`src/BodyMap.jsx:149`, imported by `VoicePanels.jsx`) and `Body3D` figure (`src/Body3D.jsx:778`, imported by `VoicePanels.jsx`).
- **CoachApplySheet** (`src/CoachApplySheet.jsx:12-42`) — confirm step for a Coach plan change with an optional free-text note that routes the change through Coach instead of the deterministic apply; opened when a suggestion needs explicit confirm (not the one-tap deck path).
- **FormCheckPanel** (`src/FormCheckPanel.jsx:12-93`) — inline panel (not a sheet) attached to a routine-detail exercise row or a session exercise's "Form check" toggle: protocol steps → pick clip → busy/refused/done states, refusal never files a guess, done state points to Inbox for the full read-back.
- **WeekSetsSheet** (`src/WeekSets.jsx:168-220`) — opened from TrainToday's volume card; a per-muscle ring + week grid of set "pips" (done/live/due/missed/extra) + per-exercise rows; "Talk this week through with Coach" hands the sheet's own figures to Coach.
- **PersonalRecord** (`src/PersonalRecord.jsx:150-209`) — auto-opens 4.2s on finishing a session with a PR (`App.jsx:3874-3879`); a gauge that counts old→new, "first on record" when no prior, a list of further records if more than one.
- **Not opened from Train at all** (see "Not covered" — these files were in the Train file list but are Home/Mission-only): `TechniqueCheck.jsx`, `techniqueCheck.js`, `TechniqueReveal.jsx`, `RepertoireBook.jsx`, `repertoireBook.js`, `StepsHistory.jsx`, `SpinReveal.jsx` (as it pertains to technique reveal), `Elapsed.jsx` (Agent-World job clock).
- **Glossary `<Term>`** (`src/Glossary.jsx:22-53`) — inline, not a sheet: dotted-underline tap-to-explain, used throughout Train for RPE/RIR/SET TYPE/e1RM/deload/hard sets/stalled (e.g. `Workouts.jsx:566-568`, `TrainToday.jsx:83,238,249,290`).

### States: loading / empty / offline / error / demo / recovered-draft / make-up day
- No connection + no demo: "Workouts haven't loaded from the vault yet… Nova never shows placeholder training data on a live connection" — `Workouts.jsx:1217-1220`.
- Demo mode: full scripted `MockWorkouts` plan — `:1216`, `:852-903`.
- Routine history loading/empty — `HistoryView:807-810`.
- Recovered/discarded draft — `:235-247`; resumed parked session — `:251-266`.
- Make-up day (complementary, never replacing the schedule) — `src/trainPanels.js` whole file; done-make-up card — `TrainToday.jsx:133-140`.
- Form-check refused state (bad angle, nothing filed) — `FormCheckPanel.jsx:50-65`.
- Coach-suggestion error state (apply/decline failed, nothing changed) — `CoachSuggestions.jsx:126`; `App.jsx:7188-7190`.

### Motion present
`.nv-deck-rise` staggered entrance on cards/decks (`Workouts.jsx:112,748,943(CoachSuggestionDeck cards)`), `nv-tick` pill→circle→check draw (`TickButton.jsx`), leave-animations via `inboxLeave.js` on Coach-ask accept/dismiss (`TrainToday.jsx:249-268`), scroll-snap momentum rail (`TrainToday.jsx:213`), `nv-wk-arc`/`nv-wk-fill`/`nv-wk-pip` week-sheet ring and pip animations (`WeekSets.jsx`), view-transition morphs (exercise row → ExerciseSheet via `vtName`; volume card → WeekSetsSheet via `originEl`; suggestion card fold via `nv-sug-fold`/`nv-sug-arrive`/`nv-strike-real`), Body3D's own rig/pose animation loop (`Body3D.jsx`, THREE.Clock-driven).

### Prior findings (22 Sep report)
- **#4 muscles painted cyan** — audit: done (`a082574`). Verified in current source: `MuscleTag` (`Workouts.jsx:1178-1185`) and the goal-priority chips (`GoalsCoachPane`) both use `muscleVar()`, each muscle in its own hue. FIXED.
- **#5 exercise card mono dump** — audit: done (`8694418`). Verified: `ExerciseSheet.jsx` opens at final height with a real skeleton (`SheetSkeleton`, `:37-58`), grabber centred (`:85`), no bare uppercase mono loading line found. The load-rail redesign itself lives in `VoicePanels.jsx`'s Exercise panel (out of this survey's file list) — not independently re-verified here. Marked FIXED for the parts inside my files.
- **#8 Train·Coach void** — audit: done (`ad726d7`). Verified: `GoalBoard` instrument (`Workouts.jsx:945-970`), muscle-hued priority chips, and the `coachWeek` per-muscle bars filling the empty-chat void (`:1080-1099`, `src/coachWeek.js`). FIXED.
- **#12 PR rail clip** — audit: done (`2e41989`). Verified: `TrainToday.jsx` momentum rail uses `fcardBase` fixed 128px min-height, `scroll-snap-type:x mandatory`, border in the lifted muscle's hue (not gold) (`:41,213-243`); Focus-for-today card now leads with a serif verdict figure, not a 5-line paragraph (`:180-201`). FIXED.
- **#15 Fuel ring at zero** — see Fuel section below. FIXED (verified).
- **#17 Train header meta to the edge** — audit: done (`4c0a006`). Current source (`Workouts.jsx:1189-1195`) wraps the header row (`flex-wrap:wrap`) rather than truncating with an explicit ellipsis; functionally addresses overflow but by wrapping, not by the `text-overflow:ellipsis` the report's "after" column specified. PARTLY (different mechanism, same practical fix — UNVERIFIED whether it still overflows at 375px without a live render).
- **#18 workout-in-progress banner covering screen head** — audit: done (`4c0a006`). Verified: no fixed-position "Workout in progress" banner exists anywhere in `src/`; the only occurrence is the inline, non-fixed resume card inside Routines view (`Workouts.jsx:256`). FIXED.
- **#21 rings overflow** — this finding is about Home's steps ring (`10,071` glyphs crossing the stroke), not a Train or Fuel surface; not applicable to my files. Note as UNVERIFIED whether Fuel's own `KcalRing`/`BudgetRing` numerals (e.g. a 4-digit kcal figure) have the same overflow risk — the code sizes the font down for values with `.length > 5` on the calorie ring (`Recipes.jsx:271`) and for values `.length > 3` on Pick-it-up's rings (`PickItUp.jsx:88`), suggesting this exact bug was anticipated and guarded against.

### UI-REDESIGN-SPEC items 1–10: built / partly / not
1. **Focus for today** — BUILT (`TrainToday.jsx:180-208`; verdict/delta/why, "Make the change" applies the fix).
2. **Jargon discipline / Glossary component** — BUILT (`Glossary.jsx`, reused across files listed above).
3. **Per-exercise notes (anomaly + feedback)** — BUILT (`Workouts.jsx:620-631`, anomaly toggle + free-text note both present in the session logger).
4. **Session cut-short flow** — BUILT for the capture (`Workouts.jsx:681-688`); "Coach follows up later with restructure options" is stated as intent in a code comment (`App.jsx:3866-3868` — "so the Coach can notice the pattern and open the restructure conversation") but no dedicated restructure-conversation trigger was found in my files — PARTLY (capture built, proactive follow-up UNVERIFIED from source read).
5. **PAIN button flow, exercise-relevant locations** — BUILT (`Workouts.jsx:633-666`; `PAIN_AREAS` map keyed by muscle group, `valsWorkouts.js:419-424`; free text + left/right/when + "Ask Coach — triage this").
6. **Proposal decline asks why** — NOT built as specified: the deck's ✕ is an immediate decline with no reason prompt (`App.jsx:7168-7189`); only "Discuss" opens a conversation. PARTLY (the spirit — conversation is possible — exists via a separate control, not via decline itself).
7. **Mobility dimension** — PARTLY: a "Mobility" muscle-group tag exists and is explicitly excluded from volume counting ("Mobility · not volume", `Workouts.jsx:551-554`), but no dedicated stretching/flexibility program-building flow was found in these files.
8. **Per-exercise technique media** — PARTLY: "▶ Form" chip links to a curated or generic form-video URL (`Workouts.jsx:519-521,552-553`), and the 3D chip opens the anatomy/body-map card; explicit "Coach recommends the variation that fits your goals" curation UI not found in my files (may live server-side or in VoicePanels.jsx, out of scope).
9. **Muscle volume intelligence, Coach flags under-volume** — BUILT (`TrainToday.jsx:276-322` bars + CTA; `WeekSetsSheet` full week; `coachSuggestions.js`'s `targets`/`gauge` change types feed the deck).
10. **Dynamic ring (readiness) + auto Apple-Health post-workout ingest** — PARTLY: the ring surfaces HRV/sleep/RHR/deload dynamically (`TrainToday.jsx:20-36,79-83`), but the automatic Apple-Health-workout-metrics pull is a server/Shortcuts integration not visible in these client files — UNVERIFIED here.

### First-look notes from source
- Two parallel pattern/pose systems coexist: `exerciseMotion.js` (`PATTERNS`, `poseAt`, used by the 2D `BodyMap`) and `exercise3d.js`+`gym3d.js`+`rig3d.js` (a separate `PATTERNS`/`poseAt`, used by `Body3D`). Both maintain their own pattern catalogue independently — UNVERIFIED whether they agree on every exercise's pattern id; a redesign touching movement patterns must update both.
- `SpinReveal.jsx`, `StepsHistory.jsx`, `TechniqueCheck.jsx`/`TechniqueReveal.jsx`, `RepertoireBook.jsx` and `Elapsed.jsx` were named in the Train file list but are not reachable from `Workouts.jsx`/`TrainToday.jsx`/`valsWorkouts.js` at all (grep-verified) — they belong to Home/Mission (`MissionStructured.jsx`/`MissionControl.jsx`/`valsMission.js`). Worth flagging to whoever wrote the survey brief: the technique-of-the-day and repertoire features are training content but live entirely on the Home surface, not Train.
- `Workouts.jsx` mixes three different "confirm" idioms for a destructive action in one file: inline confirm-then-button (delete routine, `:471-484`; delete session, `HistoryView:833-838`), a same-row toggle (cancel session, `:695-706`), and a modal sheet (`CoachApplySheet`) — UNVERIFIED whether this is intentional variety or drift.
- The Coach deck's "Not now" (✕) genuinely has zero friction (immediate `inboxDiscard`) while SPEC item 6 asks for it to ask why — a real gap between spec and build, not just a naming difference.
- The Quick-session builder (`:370-395`) and the Goals-edit form (`:1004-1027`) are both plain bordered panes with label/input rows — closer to "plain box with text in it" than the rest of the redesigned Today pane; candidates for the redesign pass.
- `numInputStyle`/`setInputStyle` (`Workouts.jsx:26-33`) are locally hand-rolled input styles rather than going through a shared `Controls.jsx` input primitive — consistent with the wider "hand-rolled helper" pattern the 22 Sep audit flagged for buttons (finding #3), just for inputs instead.

---

## Fuel — `recipes` — `src/screens/Recipes.jsx` (1055 lines), vals `src/vals/valsRecipes.js` (1077 lines)

**Purpose:** log what he eats against macro targets, browse/manage recipes, and get proactive fuel-vs-training guidance.

**Reached by:** dock nav item "Fuel" → screen key `recipes`, badge = recipe count (`src/vals/valsChrome.js:195`). Home's `fuel: () => app.navigate('recipes')` action and `openFuel` (`src/vals/valsMission.js:445,1112`). Notes screen can deep-link a mentioned recipe (`src/vals/valsNotes.js:186`) and a slash-command-style token `r…` opens a recipe directly (`src/vals/valsMisc.js:456`).

**Modes:** single scrolling screen, no sub-tabs. Sections top-to-bottom: fuel hero (rings) → Pick it up (collapsible) → eaten-today tiles/strip (fallback path only) → 7-day protein week chart (`VoicePanel` `nutrition-week`) → training×fuel cross-check card → today's rotation (meal slots) → the log bar (composer: type/say/photo/barcode) + quick-log rail + food-log day rail + off-plan totals + recipe-picker/manual-entry fallbacks + refine-in-words thread + itemised entry list + food history disclosure → recipe filter/search row → recipe grid.

**Idiom branches:** minimal. The only structured/command fork is the eaten-today block: `EatenTiles` 4-tile grid (structured/cupertino, `Recipes.jsx:442`) vs an inline HUD strip with a conic-gradient protein dial (command, `:443-459`) — and this fallback only renders when `!v.fuelHero` (no protein target set). The redesigned hero, Pick it up, rotation and log bar render identically in both idioms — everything else is idiom-agnostic.

### Features (hero → composer → grid, in screen order)
- [ ] F1 — Fuel hero — `KcalRing` (`:244-272`) + `MacroRings` (three concentric arcs, protein outer/hero, `:274-323`) + `MacroLegend` (`:329-341`) + "Fits N kcal left" tag + Coach gap-text sentence + "Where did my protein go?" chip — `Recipes.jsx:418-435`. Gap state is a dashed ring, never a zero (fixes finding #15).
- [ ] F2 — Pick it up (`PickItUp`) — collapsible finder, always mounted, renders nothing when `!available` — `:439`; see its own section below.
- [ ] F3 — Eaten-today tiles/strip (structured/command fallback, only when no fuel hero) — `:442-459`.
- [ ] F4 — 7-day protein chart — `VoicePanel` `nutrition-week` panel, same renderer as chat — `:463-467`.
- [ ] F5 — Training×fuel cross-check card — `CrossBars` (two aligned bars + a called-out gap figure), prose demoted underneath, "Draft the fix with Coach →" — `:472-486`, `CrossBars` component `:353-373`. Hidden when the agent has nothing true to say; a "couldn't check" variant exists (`v.fuelCross.couldntLook`).
- [ ] F6 — Today's rotation rail — `RotationCard` per meal slot: focused dish + macros, fridge-portion "OUT"/"N left" badge, multi-option swipe/dots pager (`useOptionPager`), per-option tick list with hold-to-swap, "Drop this one"/"Clear"/"Rename"/"Undo variant", "+ ADD A MEAL" — `:71-186`, mounted `:496-533`. Rail-nudge arrows (‹ ›) move the rail programmatically (fixes the old "‹ › to switch" label finding #15/#16 pattern).
- [ ] F7 — The log bar (composer) — one rounded field: type, dictation mic (`useDictation`), photo (camera-sheet label), barcode-scan icon, a submit arrow that only appears once there's text — `:536-616`.
- [ ] F8 — Scanning state ("Searching…"/"Still searching…") — `:617-619`.
- [ ] F9 — Quick-log rail ("Log it again") — `QuickLogCard`: picture-free but macro-bar card, kcal display figure, P/C/F composition bar — `:34-64`, mounted `:622-630`.
- [ ] F10 — "For" day rail (which day this logs to) — `:635-642`.
- [ ] F11 — Off-plan totals bar (kcal figure + P/C/F composition bar) — `:644-660`.
- [ ] F12 — "+ From your recipes" picker (search + portion fractions + custom multiplier + live preview + "Log it") — `:665-706`.
- [ ] F13 — "Enter macros myself" manual fallback (collapsed by default, auto-opens if a scan result already filled a field) — `:707-708,780-790`.
- [ ] F14 — Photo-scan flow — attach up to 5 photos, "Analyze N photos", per-photo remove, note field, error line — `:708-724`.
- [ ] F15 — Nova's clarifying question ("Nova asks: …") with answer field ("Refine estimate", gold "undecided" tone) or "Keep as is" — `:725-738`.
- [ ] F16 — "Save this to my recipe bank" from a scan — `:791-793`.
- [ ] F17 — Itemised breakdown ("Broken down into N lines") on log, each line's own macros, freshly-added lines highlighted — `:795-807`.
- [ ] F18 — "Say what's different" refine-in-words thread — each turn shows removed (struck) / added (green) items + a delta tag, before Add is ever tapped — `:808-834`.
- [ ] F19 — Undo-last-item action — `:835-838`.
- [ ] F20 — Itemised, grouped food-log list (Apple grouped-list style, inset separators) — time, name, per-entry macros, "Edited" tag, edit (✎) and remove (×) — `:849-900`, itemised sub-lines with their own remove — `:900-919`.
- [ ] F21 — Inline entry editor — name, 4 macro fields, "Ate less —" quick-fraction chips, Cancel/Save — `:920-947` (`MealEditor`-equivalent inline block, not a separate file).
- [ ] F22 — "Everything you've logged" history disclosure — relog (＋) and "save to recipe bank" (☆) per item — `:950-963`.
- [ ] F23 — Recipe filter chips + search + "fits" toggle + "+ Add recipe" — `:967-978`.
- [ ] F24 — Recipe grid — photo or placeholder, macro figures + P/C/F bar, slot-toggle chips (assign to a rotation slot), "+ Log this" — `:994-1053`. No skeleton here by design (falls back to the demo bank, never truly empty).

### Overlays Fuel opens
- **RecipeOverlay** (`src/RecipeOverlay.jsx:10`, rendered `App.jsx:9979`) — opened by tapping a recipe card (`Recipes.jsx:997`, sets `openRecipeId`). Full detail: macros, servings stepper, fridge-portion counter (cook/ate/set/stop), variant chips ("Use for today"/"Make primary"/rename), description, inline `MealEditor` (`RecipeOverlay.jsx:342-473`) with a labels-photo macro-calculator, ingredients with per-item add-to-shopping/remove-with-today-or-alternative prompt, whole-item "add to shopping list" path, method steps, "Ask Nova for a tweak" chat (photo-attachable, voice-dictatable) with a save-as-alternative/save-and-use-today preview.
- **AddRecipeModal** (`src/AddRecipeModal.jsx:23`, rendered `App.jsx:9980`) — opened via "+ Add recipe" chip (`Recipes.jsx:977`, `v.openAddRecipe`). Scan-from-photos (up to 4), dish photo, name/category/makes, 4 macro fields + kJ→kcal auto-convert, ingredients/method textareas.
- **PortionSheet** (`src/PortionSheet.jsx:17`, rendered `App.jsx:9992`) — opened from `openPortionSheet` (`App.jsx:2762`, called from eat-out logging `:2743,2746`); fraction chips + custom multiplier + live preview + Log it/Cancel; drag-to-dismiss.
- **BarcodeScanner** (`src/BarcodeScanner.jsx:6`, rendered `App.jsx:9982-9984`) — opened from the log bar's barcode icon (`Recipes.jsx:591-594` → `v.openBarcodeScanner` → `App.jsx:2882`); live camera decode via `@zxing/browser`, 7s camera-timeout fallback, manual barcode-number entry always available (`onBarcodeDetected`, `App.jsx:2889`).
- **PickItUp** — not an overlay, an inline collapsible panel inside Fuel (see below).

### States: loading / empty / offline / error / demo
- Scan busy/slow states — `Recipes.jsx:617-619`.
- Nova's clarifying question (an "undecided", gold-toned block) when a scan can't resolve on its own — `:725-738`.
- Empty food history — "Nothing off-plan yet…" — `:953`.
- Recipe grid never shows a true empty/skeleton state; falls back to the demo bank — comment at `:989-993`.
- Pick it up: skeleton rail while fetching, "no catalogue yet" tag, "Fetch the catalogue" honesty CTA — see below.

### Motion
`popIn`/`fadeUp` card entrances (staggered via `arrive()` in PickItUp), `nvArcIn` ring-fill animation on all three ring types (Fuel hero, Pick-it-up glance/budget rings), `nv-deck-rise` on freshly-added itemised lines and refine-thread turns, view-transition morph from recipe card to `RecipeOverlay` (`vtName`), scroll-snap-free but scroll-nudge rotation rail.

### Prior findings (22 Sep report)
- **#15 Fuel ring at zero** — audit: done (`7b13b6d`). Verified in current source: `KcalRing` and `MacroRings` both draw a dashed gap-tone circle when `state==='absent'`, never a solid zero (`Recipes.jsx:255-257,286-288`); the old "Calories 0/2200, Carbs·Fat 0C·0F" label/value table is gone, replaced by the concentric-arc hero; the cross-check card now draws `CrossBars` (two aligned bars + a called-out gap) instead of a 5-line paragraph (`:353-373`); the rotation header is a short Eyebrow + real nudge arrows, not an instruction-manual label (`:497-509`); the day-rail is one scrolling row, not two wrapped rows of chips (`:635-642`). FIXED, thoroughly.
- Other findings in the report's numbered list are Train/Home/other-screen specific (#4,5,8,12,17,18,21) and do not independently apply to Fuel beyond what's noted above; #21 (ring-numeral overflow) is Home's steps ring, not audited for Fuel, but Fuel's own ring components pre-emptively shrink the font for long numerals (`Recipes.jsx:271`) — see the Train section's note on #21.

### UI-REDESIGN-SPEC items 11–12: built / partly / not
11. **Cross-reference agent (non-negotiable)** — BUILT: `v.fuelCross` card with `CrossBars`, severity-coloured, "Draft the fix with Coach" (`Recipes.jsx:472-486`); explicitly hidden when it has nothing true to say (`couldntLook` variant present).
12. **Customisability without asking** — BUILT: rename a rotation meal (`window.prompt`, `:167,175`), "+ ADD A MEAL" (`:531-533`), "Drop this one"/"Clear"/"Undo variant" (`:165-166`), all direct manipulation with no Nova round-trip.

### First-look notes from source
- The manual-entry fallback (`:780-790`) is four separate bordered number inputs plus a name field in a row — the exact "plain box with text in it" pattern the redesign elsewhere replaced with rings/bars; it's explicitly demoted ("the fallback, not the feature") but still five raw inputs.
- The hidden day-chip row at `:626-634` (`style={css("display:none")}`) is dead markup — a full day-picker block that renders nothing (`display:none` on the wrapping div) sits above the live "For" day rail (`:635-642`) which duplicates its data with `d.pick`/`d.label`. Looks like superseded code left in place rather than removed.
- `RecipeOverlay.jsx`'s removal-prompt UI (`:184-207`) is a hand-rolled fixed-position bottom sheet with its own scrim, not `PortionSheet`'s `useSheetDrag` pattern or a shared sheet primitive — another local one-off construction.
- `AddRecipeModal.jsx` and `RecipeOverlay.jsx` both hand-roll their own dialog chrome (fixed inset, blur scrim, fadeUp) rather than sharing one dialog primitive — same pattern noted for Train's `CoachApplySheet` vs `ExerciseSheet`/`PortionSheet` (two different sheet mechanisms coexist: drag-sheet via `useSheetDrag` vs `useExit`-based modal).
- Fuel's macro colour convention (protein cyan / carbs gold / fat violet / kcal green) is applied with total consistency across every one of the ~10 places it appears in this file — the one clearly systemic win in this screen, matching the report's "Keep" list item 4 (7-day protein chart).

---

## Pick it up — `src/screens/PickItUp.jsx` (345 lines)

**Purpose:** answer "what can I pick up?" — every fast-food/supermarket item (or pairing) that fits what's left of today's kcal/protein budget, prefilled from the real day.

**How reached:** inline, always-mounted inside Fuel directly under the hero (`Recipes.jsx:439`); renders nothing when `!v.pickItUp.available` (i.e. not on a live connection) (`PickItUp.jsx:238`). The collapsed row itself is the entry point — tap to open (`k.toggle`, `App.jsx:2656 openEatOut`).

### Features
- [ ] P1 — Collapsed glance row — two small rings (kcal left, protein-to-go via `GlanceRing`, `:36-53`), "What can I pick up?" headline, count/"no catalogue yet" line, chevron — `:239-249`.
- [ ] P2 — Budget rings (up to 4: kcal/protein/+carb/fat if targets exist) — each a `BudgetRing` with a live numeral input inside the arc, gap = dashed, source label ("yours" vs "from today") — `:60-92`, mounted `:253-262`.
- [ ] P3 — Kind filter (All/Takeaway/Supermarket) and mode filter (Single item/Pairings) — `Segmented`, `:266-269`.
- [ ] P4 — Brand chip rail (toggleable, stale-catalogue flag) + "not in yet" missing-brand tags — `:270-280`.
- [ ] P5 — Result cards — `ItemCard` (brand/kind tag, serve size, kcal figure, `ProteinPill` hit/short indicator, budget-use bar, P/C/F composition bar) — `:170-188,285-289`.
- [ ] P6 — `PairCard` — two items joined by a "+" seam, one summed footer — `:191-209,287-289`.
- [ ] P7 — "Fetch the catalogue" CTA when the catalogue is empty, with an honesty line naming the sources (Open Food Facts + chains' nutrition PDFs) and the expected wait — `:326-329`.

### States
Skeleton rail (3 pulsing placeholder cards, honours reduced motion) while refreshing/busy with no results yet — `:212-230,296-300`. Empty-line message (serif) when the search genuinely found nothing — `:302-305`. Busy overlay (opacity dim) while re-searching with stale results still shown — `:311`. "Not in yet" honesty list for brands the catalogue doesn't cover — `:332-334`.

### Motion
Staggered `arrive()` entrance per card (rise under normal motion, fade under reduced motion, `:28-33`), `nvArcIn` on every ring, skeleton shimmer via `skeletonSweep` (disabled under reduced motion).

### First-look notes
Self-contained, well-factored file with no plain-box patterns found — every number is a ring or a bar. Its only shared-primitive gaps are the same two as elsewhere: hand-rolled skeleton (`SkeletonRail`) rather than the house `Skeleton.jsx` component used by `ExerciseSheet.jsx`'s `SheetSkeleton` — UNVERIFIED whether this is deliberate (different shape needs) or drift.

---

## Not covered

Everything in the assigned file list was opened and read; nothing was skipped for lack of time. The items below are files that were fully read but turned out **not to be reachable from Train or Fuel at all** — flagged here rather than invented into the Train inventory:

- `src/TechniqueCheck.jsx`, `src/techniqueCheck.js`, `src/TechniqueReveal.jsx` — the "did it land?" question and the technique-of-the-day reveal reel. Used only by `src/screens/MissionStructured.jsx` and `src/screens/MissionControl.jsx` (Home), via `src/vals/valsMission.js`. Grep-confirmed: zero references from `Workouts.jsx`, `TrainToday.jsx`, or `valsWorkouts.js`.
- `src/RepertoireBook.jsx`, `src/repertoireBook.js` — the full technique-catalogue + research-archive book. Opened via `App.jsx:2145 openRepertoireBook()`, itself only called from Home's technique card (per its own doc comment: "from the technique page on the Home Screen"). Not reachable from Train.
- `src/StepsHistory.jsx` — the steps/weight 7-/14-day history overlay. Used only by `MissionStructured.jsx`/`MissionControl.jsx`. Not reachable from Train.
- `src/SpinReveal.jsx` — generic reel component; its Train-adjacent use (`TechniqueReveal.jsx`) is Home-only as above. (It is also used for a Notes surface via `src/vals/valsNotes.js`, unrelated to Train.)
- `src/Elapsed.jsx` — the job-elapsed-time clock. Used by `src/jobClock.js`, `src/EdgeBack.jsx`, `src/MobileChrome.jsx`, `src/screens/MissionStructured.jsx` (the working-glass/Agent-World job tray) — grep-confirmed zero use in Train's files (Body3D.jsx's `clock.getElapsedTime()` is an unrelated THREE.Clock call, not this component).
- `src/IngestModal.jsx`, `src/IngestReview.jsx` — per the brief's instruction to check whether these open from Fuel: they do not. Grep-confirmed they open only from `src/screens/Library.jsx` and `src/screens/ClaudeCode.jsx` via `App.jsx:openIngestModal` (`:4287`), for adding a transcript/document to the vault knowledge base — unrelated to Fuel or Inbox. Reported here rather than mis-labelled "opened from Inbox."

All other files in the brief (`Workouts.jsx`, `valsWorkouts.js`, `TrainToday.jsx`, `trainPanels.js`, `WeekSets.jsx`, `weekSets.js`, `ExerciseSheet.jsx`, `CoachApplySheet.jsx`, `CoachSuggestions.jsx`, `coachSuggestions.js`, `coachWeek.js`, `FormCheckPanel.jsx`, `RepertoireBook.jsx`*, `PersonalRecord.jsx`, `BodyMap.jsx`, `Body3D.jsx`, `exercise3d.js`, `exerciseMotion.js`, `gym3d.js`, `rig3d.js`, `muscleHue.js`, `gymVoice.js`, `sessionGuard.js`, `Glossary.jsx`, `TickButton.jsx`, `Recipes.jsx`, `PickItUp.jsx`, `valsRecipes.js`, `RecipeOverlay.jsx`, `AddRecipeModal.jsx`, `PortionSheet.jsx`, `portion.js`, `BarcodeScanner.jsx`) appear as locators above. (*`RepertoireBook.jsx` is listed both as read-in-full and as not-reachable-from-Train — both facts are true simultaneously.)
