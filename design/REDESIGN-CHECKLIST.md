# Nova OS — Redesign checklist, page by page

Opened 26 Sep 2026 on his brief (§1). This file is the work list for the
redesign: every page Nova has, every feature on each page, one row each,
ticked as it moves through the loop in §2. The ledger at the foot carries
live status; `design/SESSION-HANDOFF.md` points here while the redesign runs.

Built from source, not memory: every feature row cites the file and line it
was read from (`src/screens/X.jsx:NN`). Four read-only surveys on 26 Sep
produced the rows (scratchpad `survey-A..D`); a fifth pass verified a sample
of locators by hand before this file was committed. Nothing in here was
photographed yet: the per-page audit (§2 step 1) is where pixels get looked
at. A "first look" note is a hypothesis from reading code, and says so.

---

## 1 · The brief (his, 26 Sep 2026)

- "A lot of Nova has become cluttered and complicated."
- Redesign Nova page by page, under the Apple aesthetic guidelines already
  applied as a skill, and the other design skills.
- Purpose: less cluttered to look at AND to use, every function kept; more
  dynamic and fluid; a better overall Apple-like aesthetic; better
  animations, layout, gestures and navigation.
- "It is okay if a lot of this becomes redesigned."
- The loop: careful audit of one page → mockups of ideas in different
  formats and aesthetic variations → his tweaks → repeat until he is happy
  → next page.
- "Simplicity with all functionality and a beautiful aesthetic, along with
  ease of use MUST be the goal."

Standing from the day before (25 Sep, while asking for the Coach deck):
"we need to reevaluate the inbox system as it is far too clunky and
confusing now"; "Simplicity and ease of use MUST be the goal here and not
over complicated like the inbox system has become." The Coach deck in Train
was the first surface built to that bar: one card = one sentence with the
change drawn, a tick or a cross, one do-all, talk back, Undo on either
answer. It is the reference point for "simple" in this redesign.

---

## 2 · The loop, for one page

1. **Audit.** Load `apple-design`, `apple-hig-review`, `emil-design-eng`,
   `interface-design` and `animate` (add `mobile-native` for the chrome)
   before looking. Photograph the page at 375 in `cupertino` (his phone)
   and `command`, and at 1280 on the Mac. Run `scripts/probe.mjs` for
   scrollWidth and tap floors and `scripts/rec.mjs` for any transition the
   page owns; guard writes first and check the server log after (memory
   `nova-ui-instruments`: a headless load of Home is itself a write). Write
   the findings as `design/audits/redesign-2026-09/<page>.md`, in the shape
   of the 22 Sep report (Before / After / Why per finding, ranked by visible
   gain on his phone per hour). Stills stay out of the repo (audit
   convention).
2. **Mockups.** Two or three variations per page, HTML at 390×844 in
   `design/mockups/NN-redesign-<page>-<variant>.html` (next number 52),
   published as a claude.ai artifact so he can open them on his phone.
   Demo-shaped content only: the repo is public (`HCooper12/nova-os`), so
   his real data never enters a mockup. Each variation opens with one line
   saying what it removes, what it keeps and what it moves, and how many
   objects sit above the fold before and after.
3. **His tweaks**, recorded in his words under "His answers" in the page's
   audit file.
4. Repeat 2 and 3 until he says the page is done.
5. **Build**, under NOVA-METHOD §2b in full: both Home idioms from one view
   model, house objects, real tokens, an entrance and an exit, 375 without
   sideways scroll, both styles checked. Gates: `npm run lint`, `npm run
   build`, `cd server && npm test` (and `TZ=UTC npm test` when Agent World
   is touched), commit with a why, push, `node scripts/reload-server.mjs`.
6. **Verify on his phone.** A row is ticked "verified" only on his word.
7. Tick the rows here and add a ledger line (§7).

---

## 3 · The bar every mockup is judged against

**The surface standard, NOVA-METHOD §2b, rules 1–9 (not optional).** One
view model, two idioms. House objects: `RingTile` for a number against a
target (colour is the verdict, a gap is a dashed ring), the serif face for
the line that carries the news, `Group`/`GRow`/`Pill` from AppleLayout,
every label and action through `Controls.jsx`. Sentence case in the vals.
Tokens only (`--nv-blue` and `--nv-ink70` do not exist). Motion is part of
the object. Survives 375. **Nothing is a plain box with text in it.**
**Colour means something**, and decisions are a conversation, never a
button per idea. Verify in both styles.

**The honesty half (binds absolutely).** Never invent a testimonial,
statistic or claim; a mockup shows demo-shaped content and says so. Missing
data says so; stale data self-labels. Reduced motion is honoured. No "it's
not X, it's Y" in copy.

**Not up for re-litigation on "AI-default" grounds** (CLAUDE.md): liquid
glass (`nv-liquid`), the violet/cyan accents, the soft `--nv-radius`, the
calm shadows, the blue Nova core. If one is wrong for a surface, that is a
design argument put to him with the reason, in the mockup round.

**The clutter tests (new, for this redesign).** Each audit reports these
numbers for the page as it is, and each mockup reports them for itself:

| Test | Measure | Target |
| --- | --- | --- |
| Focal point | What is the one thing this page is for, and is it the first thing seen? | One, above the fold |
| Object count | Distinct cards/rows/chips/buttons above the fold at 375 (cupertino) | Lower than today, or a reason |
| Verbs per card | Actions offered on one card | One primary, one quiet alternative, talk back |
| Type sizes | Distinct font sizes on the surface besides numerals | ≤ 3 |
| Tap floor | Smallest control; smallest primary action | ≥ 28pt; ≥ 44pt |
| Gestures | Swipe row, long-press, edge back, sheet flick: each discoverable or standard, never the only door | Every capability has a pixel he can tap (7 Sep rule) |
| Motion | Entrance, exit, interruptible, reduced-motion cross-fade | All four |
| States | Loading (skeleton), empty (honest copy), offline (last-known, labelled), error (what, and what next) | All four designed |
| Width | `scrollWidth` at 375 | 375 |
| Idioms | Renders from one view model in cupertino and command | Both checked |

---

## 4 · Cross-cutting decisions carried in (open, his to make)

These came out of earlier audits and were left open on purpose. They shape
every page, so they belong to the redesign rather than to one page. Each
gets raised at the page where it first bites, not all at once.

| # | Decision | Where it came from | Bites first on |
| --- | --- | --- | --- |
| X1 | Take a small spring library (Motion, ~4KB) for gesture-driven surfaces only (sheets, swipe rows, context menu), leaving entrances on `--nv-ease` | APPLE-AUDIT-2026-09 §1 | Chrome: sheets |
| X2 | Exit animations: the pattern (`useExit`, `nvFall`) is built and adopted by 4 of 18 overlays; adopt everywhere or not | APPLE-AUDIT §2 | Chrome: overlays |
| X3 | Dynamic Type: zero `rem` sizes in the app, `user-scalable=no`; Nova would break rather than adapt to larger text | APPLE-AUDIT §4 + §10 | Settings; every page |
| X4 | A fade instead of a hard hairline under the floating top bar; two attempts broke the bar on his phone and only his phone can test a third | APPLE-AUDIT §5 | Chrome: top bar |
| X5 | Haptic on a sheet flick (`threshold`); needs one real test on his phone | APPLE-AUDIT §7 | Chrome: sheets |
| X6 | Sixty-one nested corners left non-concentric on purpose; a screen at a time, by eye | APPLE-AUDIT §9 | Each page's audit |
| X7 | `warn` haptic has never fired; failures are silent to the hand | FEEL-PLAN §1 | Inbox, Train |
| X8 | Oriented transitions: six grid→detail pairs done; extend to the rest or stop | FEEL-PLAN §3 | Library, Fuel, Inbox |
| X9 | Decisions as a conversation (tick / cross / do-all / talk back) everywhere a review exists; "in progress" since 23 Sep | 22 Sep report #13 | Inbox |
| X10 | The native shell (Capacitor) is the only path to real haptics and is blocked on Xcode | memory `nova-native-shell` | Chrome |

---

## 5 · The pages

Ordering inside each tier is by how often he meets the surface, from the
dock's default order (`src/tabOrder.js` DEFAULT_ORDER) and the off-dock
entry points. A page is one row in §6's order and one section here; a
feature is one tickable row. Boxes: `[ ]` untouched · `[a]` audited ·
`[m]` mockups in review · `[b]` built · `[x]` verified on his phone.

### TIER 0 · THE CHROME (rides every screen)

Audit with `mobile-native` loaded as well. Inventory: `design/audits/redesign-2026-09/00-inventory-a-home-chrome.md`.

**0.1 · Navigation** — the dock, the More sheet, the Mac sidebar, the ways into the off-dock screens
- [ ] N1 · The dock — floating pill, 5 one-tap tabs around the Nova core + More; default slots Home · Voice · Train · Fuel · Inbox — `src/MobileChrome.jsx:149-181`, order `src/tabOrder.js:19-32`
- [ ] N2 · The core in the dock — tap starts live talk, long-press shows the transcript — `src/MobileChrome.jsx:154-175`
- [ ] N3 · The More sheet — "Frequent" row (visited ≥3×, not in dock) + "All screens" grid — `src/MobileChrome.jsx:110-141`, `src/vals/valsChrome.js:88-96`
- [ ] N4 · The top bar — wordmark that yields to the screen's large title, the Nova-is-working chip → job tray popover — `src/MobileChrome.jsx:68-107`
- [ ] N5 · The Mac sidebar — Workspace / Vault / System groups + Agents roster + status card, ⌘B fold — `src/Sidebar.jsx:15-96`, `src/vals/valsChrome.js:184-225`
- [ ] N6 · Off-dock doors — Leader (Home box, notification, sidebar), Practice (Home card, notifications, sidebar), Briefing (voice reply, inbox "keep it", resume offer, deep link only), Console (sidebar only), Ambient (from Ops only) — `src/vals/valsChrome.js:16`, call sites in inventory A
- [ ] N7 · Hash routing + deep links (`#/briefing?id=`, `#/inbox?open=`), back button — `src/App.jsx:208-218, 924-935, 4395-4411`
- [ ] N8 · Edge-back swipe (installed PWA only; commit at ½ width or a flick past ⅓; sheet vs page via `data-edge-page`) — `src/EdgeBack.jsx:13-16`, `src/edgeBack.js:32-51`
- [ ] N9 · Screen transition — tab hops instant (no snapshot) + 260ms WAAPI rise on `<main>`; programmatic hops cross-fade 140/280ms; per-screen scroll restore; chunk warm on pointerdown — `src/App.jsx:995-1106`, `src/index.css:1073-1083`

**0.2 · Overlays, sheets and feedback**
- [ ] O1 · Dynamic Island / toasts — `notify()` with 4 tones, tap/drag-to-dismiss, action chips, gooey merge, resident activities (workout · speaking · nudge) — `src/DynamicIsland.jsx:126-676`, `src/island.js:25-64`, `src/vals/valsChrome.js:780-857`
- [ ] O2 · GlassSheet — FLIP grow-in from the tapped card, drag-to-dismiss with momentum projection and rubber-band, Escape, scrim — `src/GlassSheet.jsx:29-120`, `src/useSheetDrag.js:33-137`, `src/sheetPhysics.js`
- [ ] O3 · ContextMenu on long-press (480ms) — bottom sheet on phone, popover on Mac, optional note block — `src/ContextMenu.jsx:17-70`, `src/longPress.js:19-58`
- [ ] O4 · SwipeRow — direction-locked drag, underlay actions, commit by fraction or flick, `threshold` haptic — `src/SwipeRow.jsx:13-43`, `src/swipeAction.js:33-126`
- [ ] O5 · Floating core (Mac) — tap talk / long-press transcript, thinking spin, listening pulse — `src/FloatingCore.jsx:18-37`
- [ ] O6 · Voice presence + halo (any screen while talking) — HEARING / LISTENING / THINKING / SPEAKING / YOUR TURN, TAP TO HEAR, evidence card — `src/VoicePresence.jsx:27-176`, `src/VoiceHalo.jsx:9-39`
- [ ] O7 · Wake word (headless, Settings opt-in) — `src/WakeWord.jsx:30-143`
- [ ] O8 · Offline / demo / degraded banner — fixed pill above the dock — `src/App.jsx:9959-9971`, `src/vals/valsMission.js:679-686`
- [ ] O9 · Boot screen — two rings, three fading status lines, bar sweep — `src/Boot.jsx:5-25`
- [ ] O10 · Suspense fallback (one breathing dot) + idle prefetch — `src/App.jsx:163-189`
- [ ] O11 · Skeletons (Bar / Card / List / Grid) — `src/Skeleton.jsx:20-69`
- [ ] O12 · Exit animations — `useExit` / `nvFall`: adopted by 4 of 18 overlays (decision X2) — `src/useExit.js`, `src/index.css:103-104`

**0.3 · The palette a redesign draws from** (not rows to redesign; the parts)
- House controls: `Eyebrow` `TextAction` `Chip` `Button` `Select` `Chevron` `Rail` `Tag` `Meta` `ScreenHead` `Segmented` `AttachStrip` (`src/Controls.jsx`); `Group` `GRow` `MetricTile` `Pill` (`src/AppleLayout.jsx`); `RingTile`; `LiquidGlass`; `Interactive` (press spring, haptic switch, long-press) — full list with locators in inventory A.
- Haptics: five words (tick · commit · threshold · celebrate · warn) — `src/haptics.js:12-25`; `warn` has never fired (X7); `longPress.js:25` bypasses the vocabulary with a raw vibrate.
- Motion tokens: `--nv-ease` `.32,.72,0,1`, `--nv-ease-exit`, `--nv-dur-fast/base/slow` .16/.28/.44s, `--nv-rise` 12px, `--nv-stagger` 45ms capped 315ms, `--nv-anim` — `src/index.css:295-296, 330`; keyframes listed in inventory A.

### TIER 1 · THE DAILY FIVE

#### Home — `mission`
**DECIDED 26 Sep:** rebuilt as the `summary` style per `design/HOME-REDESIGN-PLAN.md` (the blend: highlight · Pinned cards · Today strip · Trends · moments; five switchable materials; the Index as the More tab). The rows below are what the current idiom shows and stay the reference for parity; `cupertino` stays untouched.
`src/screens/MissionStructured.jsx` (829 lines, cupertino: his phone) · `src/screens/MissionControl.jsx` (686, command) · one view model `src/vals/valsMission.js` · fold rules `src/missionFold.js` · focus rules `src/missionFocus.js`. Inventory: `00-inventory-a-home-chrome.md`.

**How it is built.** One view model, two render trees. Cupertino renders grouped cards in one of three hour-dependent ORDERS (morning: body report leads; day: what-to-do-next leads; evening: Wrap the day leads) — `MissionStructured.jsx:42-47`; everything past the first two present sections folds to a header + status line + instrument glyph — `missionFold.js:29-119`; `working`, `plan`, `stuck` never fold. Command renders a fixed HUD order, unfolded, with a hero cluster and orbit rings. Sections absent from the data are absent from the screen (no placeholders).

**The moments (shown when earned, at the top)**
- [m] H1 · A record moment — the morning after a PR: count badge + up to 3 lift lines; See the block / Noted — `MissionStructured.jsx:617-647`, rule `missionFocus.js:34-43`
- [m] H2 · A plan in flight — live step glyphs or "ready for you"; Open it / Walk me through it — `MissionStructured.jsx:648-685`, `src/planCard.js:105-152`
- [m] H3 · It landed — today's settled captures, up to 3, with destination; Open the Inbox / Noted — `MissionStructured.jsx:692-720`
- [m] H4 · Focus chip — running focus-block countdown; Journal it / abandon — `src/FocusChip.jsx:9-36`, at `:576`

**The sections (in the hour's order)**
- [m] H5 · Nova is working — every in-flight job as a live list; tap opens, CLEAR on a failure; never folds — `MissionStructured.jsx:279-312`, model `valsChrome.js:230-315`
- [m] H6 · Hero / greeting — morning: living core + standfirst + Engage/Summon; otherwise a 44px core + one line + Engage — `MissionStructured.jsx:194-226`
- [m] H7 · Who is asking — serif line for a Mac session with its hand up — `MissionStructured.jsx:600-608`
- [m] H8 · Vitals — 4 rings (sleep · steps · protein · readiness) + 4 metric tiles, one promoted focal tile when something is behind; tap steps/weight/protein → history overlay — `MissionStructured.jsx:228-256`, `missionFocus.js:75-88`, `RingTile.jsx:33`
- [m] H9 · Wrap the day — evening: protein + kcal rings, counted sentence, one fix; Read it to me / Open Fuel / Dismiss; embeds "did it land?" — `MissionStructured.jsx:316-351`
- [m] H10 · Suggested focus — the context ladder's top true rung (10 rungs) with primary/secondary pills — `MissionStructured.jsx:258-273`, ladder `valsMission.js:456-585`
- [m] H11 · The Leader box — two swipeable faces (LEAD idea / SITUATION thread), dot pager, reply box with dictation, "Open the Leader" — `src/LeaderBox.jsx:59-177`, at `:356`
- [m] H12 · Practice card — lamp row of moves landed, "Next: scene", or preparing state; Rehearse / Open the room — `src/PracticeCard.jsx:26-86`, at `:361-365`
- [m] H13 · Today's technique — technique-of-the-day card or the sealed reel; I tried it / Not today; "1 of 7 ›" opens the Repertoire book — `MissionStructured.jsx:721-785`, model `valsMission.js:996-1053`
- [m] H14 · The One Thing — the single unsettled priority as a loud gold card; Done / Skip — `MissionStructured.jsx:374-389`, `missionFocus.js:16-23`
- [m] H15 · Today's Top 3 — remaining plan rows, "seen in your log" vs Done/Skip, stuck row's "Start it with me"; approve / Open Inbox when pending — `MissionStructured.jsx:390-426`
- [m] H16 · Stuck — up to 3 unclosed items, each a days-ring; Start it with me / Not now / Let it go; undo receipt — `src/StuckCard.jsx:81-119`, at `:430`
- [m] H17 · Command deck — up to 3 oldest pending proposals; tap → Inbox; "N waiting ›" — `MissionStructured.jsx:432-445`
- [m] H18 · Today — calendar with live-block marker + countdown; inline "Ask Nova" calendar command box; "Next 14 days" → CalendarView — `MissionStructured.jsx:447-469`
- [m] H19 · Concept revisit / Daily review — spaced-repetition concept, shuffle drum on re-roll; Review — `MissionStructured.jsx:471-498`
- [m] H20 · Nova noticed — up to 2 overnight insights with age chip + "talk it through"; streak badges — `MissionStructured.jsx:500-529`, model `valsMission.js:1142-1176`
- [m] H21 · Shortcuts — Train today + latest note as one-tap doors — `MissionStructured.jsx:531-544`
- [m] H22 · Agents — every named agent, on/off + working pulse (phone only) — `MissionStructured.jsx:546-554`, model `valsChrome.js:323-372`
- [m] H23 · The fold itself — header + one status line + instrument glyph per section, 40ms cascade, "▴ Fold"; open state remembered per section — `MissionStructured.jsx:154-169, 791-811`, `missionFold.js`

**Overlays Home opens:** StepsHistory (`valsMission.js:1244-1295`), RepertoireBook (`valsMission.js:902-918`), CalendarView (`valsMission.js:1223-1230`), TechniqueReveal, SpinReveal.
**States:** technique renders nothing until loaded (`valsMission.js:999`); three "nothing noticed" copies by cause (`valsMission.js:1160-1167`); calendar not-connected and FROM <date> · OFFLINE labels (`valsMission.js:1191-1206`); plan error line in both idioms; demo suppresses all three moments.
**Motion today:** fold cascade (`deckRise` 40ms), ring arcs .9s, `popIn` on Wrap, `fadeUp` on Leader face swap, `novaPulse` dots, the core's own rAF loop (one still frame under reduced motion).
**Prior findings:** 22 Sep #1 fold rows, #6 voice layers, #17 head meta, #18 banner, #21 ring numerals, #22 equal vitals: all fixed and re-verified in current source (inventory A).
**First look, from source (UNVERIFIED):** the two idioms are two hand-maintained ~700/830-line render trees for one view model; the command hero's two decorative spinning orbit rings (70s/50s) have no stated job; `defaultFolds` always opens exactly the first two present sections, so `leadFirst` may push `working`/`hero` into the fold in the hour before a work block; the command 2-up shortcut cards are the one remaining generic label/value/meta pane on Home. Twenty-three sections compete for one phone screen: the audit's first question is how many of them Home needs to show at once.

#### Train — `workouts`
`src/screens/Workouts.jsx` (1,235 lines) · `src/vals/valsWorkouts.js` (903) · `src/TrainToday.jsx` (352) · `src/CoachSuggestions.jsx` · `src/WeekSets.jsx` · `src/ExerciseSheet.jsx`. Three tabs on a `Segmented` (`Workouts.jsx:1196-1199`): Today · Gym · Coach; Gym has four views (routines · routine · session · history). Inventory: `00-inventory-b-train-fuel.md`.

**Today** (`src/TrainToday.jsx`)
- [ ] R1 · Readiness ring — HRV / sleep / resting HR facts, block phase, deload warning, "Why am I tired?" / "When am I at my best?" chips → Coach — `TrainToday.jsx:20-36, 73-96`
- [ ] R2 · The session cards — Resume (gold), Make-up day (finish · not a make-up after all), Made up today (green), Scheduled / rest day with ▶ Begin — `TrainToday.jsx:97-158`, rule `src/trainPanels.js:14-27`
- [ ] R3 · Focus for today — serif verdict figure, reasoning demoted, "Make the change" — `TrainToday.jsx:180-208`
- [ ] R4 · Momentum rail — PR / plateau / streak cards, scroll-snap, bordered in the lift's muscle hue — `TrainToday.jsx:213-243`
- [ ] R5 · Coach's open ask — one change, ✓ Do it / Discuss it / ✕ Not this, leaves with an animation — `TrainToday.jsx:247-274`
- [ ] R6 · Hard sets this week — per-muscle bars in their hues, live gold overlay, "Short by Sunday ▲", tap → WeekSetsSheet; under-target CTA row — `TrainToday.jsx:276-327`
- [ ] R7 · Coach changes banner — "N changes from Coach" strip under Today and Gym — `Workouts.jsx:1210-1212`, `CoachSuggestions.jsx:26-44`

**Gym · routines list** (`RoutinesView`, `Workouts.jsx:110-410`)
- [ ] R8 · Today's state — Done-today banner, Also-scheduled + Begin it anyway, Active-rest card — `:112-141`
- [ ] R9 · On today's card hero — muscle-hued target chips, "Per exercise ▾", ▶ Begin session — `:142-173`
- [ ] R10 · Week strip — grouped list (cupertino) or day chips (command), per-day routine select, make-up / carry-over note — `:178-220`
- [ ] R11 · Recovery cards — Discarded / replaced workout (Restore · Dismiss), parked-session Resume, Finish missed exercises → a day — `:235-282`
- [ ] R12 · Carry-overs — Do it now / Reschedule / Remove, overdue colouring — `:284-320`
- [ ] R13 · Routines grid — name, ◆ count, preview, muscle chips; tap opens, long-press context menu; "+ New routine" inline — `:322-368`
- [ ] R14 · Quick session builder — minutes, note, Build my session → preview → Start — `:370-395`
- [ ] R15 · Goals + Coach pane repeated here — `:407`

**Gym · routine detail** (`RoutineDetailView`, `:412-486`)
- [ ] R16 · Start workout (gated by `guardSessionStart`, `src/sessionGuard.js`) / View history — `:417-424`
- [ ] R17 · Exercise rows — name, ◉ 3D chip → ExerciseSheet, Coach prescription chip → reasoning sheet, last-time meta, sets/reps inputs, move ↑↓, Form check toggle, Remove — `:429-465`
- [ ] R18 · Exercise picker — search, muscle filter, tap to add / hold to preview, create if not listed — `:42-100`
- [ ] R19 · Delete routine confirm — `:471-484`

**Gym · live session** (`SessionView`, `:488-800`; the most tactile surface he has)
- [ ] R20 · "Log it by talking" banner → gym voice grammar (set / weight / same / add set / next / skip / finish / later / where / undo) — `:499-508`, `src/gymVoice.js:47-159`
- [ ] R21 · Exercise header — name, 3D, ▶ Form (curated or generic), Skipped, Coach chip, Coach-added ◆, focus note, skip toggle; muscle tag, "Extra · today only", last time — `:513-556`
- [ ] R22 · The set grid — SET · weight · reps · RPE · RIR · TYPE (cycles working → back-off → warm-up) · 40px tick · remove; one shared column template; number pad via `LocalInput` — `:557-609`
- [ ] R23 · + Extra set; note (auto-grow), Off day toggle, Pain? toggle, Form check toggle — `:618-631`
- [ ] R24 · Pain flow — exercise-relevant area chips, side, when, free text, "Ask Coach — triage this" — `:633-666`, `valsWorkouts.js:419-424`
- [ ] R25 · + Add exercise, this session only — `:670-679`
- [ ] R26 · Cut-short reason chips (out of time · low energy · gym busy · pain) — `:681-688`
- [ ] R27 · Finish workout / Save changes · Save for later · Cancel (confirm) — `:692-705`
- [ ] R28 · Mid-session Ask Coach — sees live state, proposal cards Apply / Not now, "Apply all N" — `:708-782`
- [ ] R29 · PR celebration on finish — gauge counts old → new — `src/PersonalRecord.jsx:150-209`, trigger `App.jsx:3874-3879`

**Gym · history** (`HistoryView`, `:802-849`)
- [ ] R30 · Past sessions — sets/volume, cut-short note, "Coach said" callout, Edit / Delete confirm — `:802-849`

**Coach** (`GoalsCoachPane`, `:972-1176`)
- [ ] R31 · The changes deck — one card per change: WHERE, the change drawn (`ChangeStrip`: add · remove · move · swap · targets · reorder · remap · schedule · gauge), WHY, `TickButton` Yes · Discuss · ✕ Not now, "Yes to all N" — `CoachSuggestions.jsx:47-262`. **✕ discards at once with no reason asked (`App.jsx:7187-7188` → `inboxDiscard`); UI-REDESIGN-SPEC item 6 asked for "decline asks why"** [Verified]
- [ ] R32 · Goals card — serif goal sentence, `GoalBoard` (3 rings + 7-day dots), days/week dots, priority-muscle chips, notes; edit form (goal · focus · days · 3 targets · equipment · limitations · notes) — `:945-970, 1004-1057`
- [ ] R33 · The conversation — empty-state starters + "What the Coach is reading" bars; messages with inline `VoicePanel`s and `ChangesPointer` receipts; contextual chips; attach; "Discussing …" indicator; "Bring a study"; composer — `:1080-1163`

**Overlays Train opens:** ExerciseSheet (long-press a row / tap a name; morphs from the row; skeleton at final height; body map + 3D figure) `src/ExerciseSheet.jsx:60-100` · CoachApplySheet `src/CoachApplySheet.jsx:12-42` · FormCheckPanel (inline; protocol → clip → busy / refused / done) `src/FormCheckPanel.jsx:12-93` · WeekSetsSheet (ring + week grid of pips + per-exercise rows, "Talk this week through with Coach") `src/WeekSets.jsx:168-220` · PersonalRecord · Glossary `<Term>` dotted-underline explainers throughout `src/Glossary.jsx:22-53`.
**States:** no connection + no demo → honest "haven't loaded" line (`:1217-1220`); demo → scripted `MockWorkouts` (`:852-903`); recovered / replaced / parked drafts; make-up day complements the schedule; form-check refused; Coach-suggestion error.
**Motion today:** `.nv-deck-rise` decks, `nv-tick` pill → circle → check, leave animations on accept/dismiss, scroll-snap rail, `nv-wk-arc/fill/pip` in the week sheet, view-transition morphs (row → sheet, card → week sheet), suggestion fold `nv-sug-fold/arrive`, `nv-strike-real`, the 3D rig's own loop.
**Prior findings:** #4 muscles, #5 exercise card, #8 Coach void, #12 PR rail, #18 banner: fixed and re-verified; #17 header meta fixed by wrapping rather than the ellipsis the report specified (check at 375).
**UI-REDESIGN-SPEC (Aug 2026):** built 1 · 2 · 3 · 5 · 9; partly 4 (cut-short captured, Coach follow-up unverified) · 7 (Mobility tag only, no programme) · 8 (form link + 3D, no variation curation) · 10 (dynamic ring yes, Apple Health post-workout pull unverified); **not built: 6 (decline asks why)**.
**First look (UNVERIFIED unless marked):** two parallel pattern/pose catalogues (`exerciseMotion.js` for the 2D map, `exercise3d.js` + `gym3d.js` + `rig3d.js` for the 3D figure) to keep in sync; three different confirm idioms for destructive actions in one file; Quick-session builder and Goals-edit form are plain label/input panes; `numInputStyle`/`setInputStyle` hand-rolled (`:26-33`), the input-primitive version of the `btn()` finding; Train and Home both show session cards (Resume · Make-up · Scheduled) so the same state is drawn twice in two vocabularies.

#### Fuel — `recipes`
`src/screens/Recipes.jsx` (1,055) · `src/vals/valsRecipes.js` (1,077) · `src/screens/PickItUp.jsx` (345) · `src/RecipeOverlay.jsx` (473) · `src/AddRecipeModal.jsx` · `src/PortionSheet.jsx` · `src/BarcodeScanner.jsx`. One long scroll, no tabs. Inventory: `00-inventory-b-train-fuel.md`.

- [ ] U1 · Fuel hero — `KcalRing` + `MacroRings` (three concentric arcs, protein outer) + legend + "Fits N kcal left" + Coach gap sentence + "Where did my protein go?" — `Recipes.jsx:244-341, 418-435`
- [ ] U2 · Pick it up — collapsible finder under the hero (see below) — `:439`
- [ ] U3 · Eaten-today tiles / strip — fallback only when no protein target; the one idiom fork on the screen — `:442-459`
- [ ] U4 · 7-day protein chart — the chat's `nutrition-week` panel reused — `:463-467`
- [ ] U5 · Training × fuel cross-check — `CrossBars` + gap figure, "Draft the fix with Coach →", hidden when nothing true to say — `:353-373, 472-486`
- [ ] U6 · Today's rotation rail — `RotationCard` per meal slot: dish + macros, fridge "OUT" / "N left", option pager (swipe / dots), tick list with hold-to-swap, Drop · Clear · Rename (`window.prompt`) · Undo variant, "+ ADD A MEAL", ‹ › nudges — `:71-186, 496-533`
- [ ] U7 · The log bar — one field: type · dictate · photo · barcode · submit arrow on text; Searching… states — `:536-619`. **A full day-chip picker sits above it inside `display:none` (`:540`): dead markup** [Verified]
- [ ] U8 · Log it again — `QuickLogCard` rail (kcal figure + P/C/F bar) — `:34-64, 622-630`
- [ ] U9 · "For" day rail + off-plan totals bar — `:635-660`
- [ ] U10 · From your recipes — search, portion fractions, custom multiplier, live preview, Log it — `:665-706`
- [ ] U11 · Enter macros myself — five raw inputs, collapsed by default — `:707-708, 780-790`
- [ ] U12 · Photo scan — up to 5 photos, Analyze, per-photo remove, note, error — `:708-724`
- [ ] U13 · Nova asks — clarifying question, answer field (gold undecided) or Keep as is; Save to my recipe bank — `:725-738, 791-793`
- [ ] U14 · Broken down into N lines — itemised macros, new lines highlighted — `:795-807`
- [ ] U15 · Say what's different — refine-in-words thread: struck removals, green additions, delta tag; Undo last — `:808-838`
- [ ] U16 · Today's log — grouped list: time · name · macros · Edited tag · ✎ · ×, itemised sub-lines with their own × — `:849-919`
- [ ] U17 · Inline entry editor — name, 4 macro fields, "Ate less —" fraction chips, Cancel / Save — `:920-947`
- [ ] U18 · Everything you've logged — history disclosure, relog ＋, save ☆ — `:950-963`
- [ ] U19 · Recipe filter chips + search + "fits" toggle + "+ Add recipe" — `:967-978`
- [ ] U20 · Recipe grid — photo / placeholder, macros + P/C/F bar, slot-toggle chips, "+ Log this"; tap → RecipeOverlay — `:994-1053`

**Pick it up** (`src/screens/PickItUp.jsx`)
- [ ] U21 · Glance row — two small rings, "What can I pick up?", count / no catalogue yet, chevron — `:239-249`
- [ ] U22 · Budget rings (kcal · protein · carb · fat) with a live numeral input inside each arc, "yours" / "from today" — `:60-92, 253-262`
- [ ] U23 · Filters — All / Takeaway / Supermarket, Single / Pairings (`Segmented`); brand chip rail with stale flag; "not in yet" tags — `:266-280`
- [ ] U24 · Results — `ItemCard` (brand · serve · kcal · `ProteinPill` · budget bar · P/C/F), `PairCard` (two items, one footer); skeleton rail; empty line; "Fetch the catalogue" honesty CTA — `:170-209, 285-334`

**Overlays Fuel opens:** RecipeOverlay (macros, servings stepper, fridge counter, variants, inline `MealEditor` with label-photo calculator, ingredients → shopping, method, "Ask Nova for a tweak") `src/RecipeOverlay.jsx` · AddRecipeModal (scan up to 4 photos, name/category/makes, macros with kJ → kcal, ingredients, method) · PortionSheet (fractions, multiplier, drag-to-dismiss) · BarcodeScanner (`@zxing/browser`, 7s timeout, manual entry).
**States:** scan busy / slow; Nova's question; empty history copy; the recipe grid never shows empty (falls to the demo bank, `:989-993`); Pick it up skeleton / no catalogue / fetch CTA.
**Motion today:** `popIn` / `fadeUp` staggered arrivals, `nvArcIn` on every ring, `nv-deck-rise` on new itemised lines and refine turns, view-transition morph card → RecipeOverlay.
**Prior findings:** #15 ring at zero: fixed thoroughly (dashed absent state, `CrossBars`, nudge arrows, one day rail). **UI-REDESIGN-SPEC 11 · 12: built.**
**First look:** the macro colour convention (P cyan · C gold · F violet · kcal green) is applied consistently in ~10 places: keep it. Against that: the manual-entry fallback is five raw inputs; RecipeOverlay hand-rolls its own bottom sheet (`:184-207`) and AddRecipeModal its own dialog chrome, so two sheet mechanisms coexist with `useSheetDrag`; the composer region (U7 to U18) is twelve sub-features stacked in one column, most of them conditional, which is the screen's clutter risk.

#### Voice — `voice`
`src/screens/Voice.jsx` (601) · vals inline in `src/App.jsx` and `src/vals/valsMisc.js` · `src/VoicePanels.jsx` · `src/StageCard.jsx` · `src/VoiceWaveform.jsx`. Inventory: `00-inventory-c-inbox-voice-agents.md`.

- [ ] V1 · Head "Neural link · Voice" + state tag + live clock — `Voice.jsx:206-209`
- [ ] V2 · Mobile stage-focus scrim — blurred backdrop, spotlit `StageCard`, the live question, TAP ANYWHERE TO DISMISS — `:215-246`
- [ ] V3 · COMMS LOG panel — bracketed "station" frame in both idioms, Undo · N turns / New chat — `:46-69, 248-266`, `src/chatUndo.js`
- [ ] V4 · The message list — tag/time/where + `TypeText` reveal; attachments; Remember → Inbox; research status + `SourcesPanel`; acted receipt with Undo; proposal card (Yes do it / Leave it); plan-report chips (Walk me through it · Take it to the Coach · Keep in vault); inline `VoicePanel`s (training-week · exercise · nutrition-week · note · pulse · sessions); routing notice + "Just answer it"; evidence card → VerdictCard — `:270-365`. **Replies render through bare `TypeText`, not `ChatMarkdown` (Leader, Briefing, Library do), so bold / links / bullets in a Voice answer are not rendered** [Verified in source]
- [ ] V5 · "» NOVA reading the vault…" busy line — `:367-369`
- [ ] V6 · The glass — hero `StageCard` + a rail up to four deep, `railDepth` recession, tap to enlarge (GlassSheet) — `:379-414`, `src/glassDepth.js`
- [ ] V7 · Composer — attachments, route preview ("→ Shopping"), input, Send (pill in Apple, rectangle in Command) — `:415-436`
- [ ] V8 · The core — counter-rotating rings + tick marks in a reticle; the core is the mic button; 8-rung state caption — `:195-201, 449-475`
- [ ] V9 · briefQueue bar — Yes / No / Later / Stop, idx/total — `:485-494`
- [ ] V10 · "▶ Tap to hear" speech-blocked banner. **Flat fill, no backdrop filter; `VoicePresence.jsx`'s copy (22 Sep #6) got the glass, this one did not** [Verified] — `:500-507`
- [ ] V11 · Centre-stage `StageCard` with dismiss × — `:512-521`
- [ ] V12 · `VoiceWaveform` (real meter) or iOS state-bar dots — `:526-535`
- [ ] V13 · Chips — ritual invite ("Good morning — tap to start"), "≡ Brief me", "◐ Ambient" (the only door to Ambient) — `:536-546`
- [ ] V14 · Right rail (Mac) — STATION · STATUS meters (MIC · ANSWERS · ENGINE), HEY NOVA toggle, engine footnote; ON THE GLASS spent-panel history — `:556-593`

**Overlays:** GlassSheet (`:596-598`), VerdictCard (`valsChrome.js:437, 455`). **States:** busy, empty placeholder, STANDING BY when not live, dictation error + blocked speech; no demo branch in the file. **Motion today:** `ringSpin` 44s / 14s (3s while busy), `riseIn()` per message keyed off first paint, `nvGlassArrive`, `railDepth`, `wave` on iOS bars, `fadeIn/fadeUp/popIn/dotBlink`.
**First look:** `ModelChoicePrompt` is a fixed top banner for the same "pick a model" decision the Inbox draws as a card, two UIs for one choice; two vocabularies for "which visual for this beat" (`Briefing.jsx` `Glass` vs `StageCard.jsx`); the station frame never changes under cupertino.

#### Inbox — `inbox`  ← his named pain ("far too clunky and confusing", 25 Sep)
`src/screens/Inbox.jsx` (799) · `src/vals/valsInbox.js` (792) · `src/inboxDigest.js` · `src/inboxLeave.js` · `src/SwipeRow.jsx`. Modes: Deck vs List; pattern focus drill-down; History 25 → +100; filing-mode ladder (Review everything · Auto-file high confidence · Auto-file everything). Inventory: `00-inventory-c-inbox-voice-agents.md`.

**Capture**
- [ ] I1 · Head + connection label, headline "Drop the thought, Nova files it." — `Inbox.jsx:92-96`
- [ ] I2 · Capture composer — textarea (⌘⏎), Dictate chip, "links · research · videos → just say it in the chat" hint, ✦ Capture / Routing… — `:99-134`
- [ ] I3 · Landed strip — today / filed-today counts + last 4 landed captures, tap-through — `:145-181`
- [ ] I4 · Filing mode — collapsed row → 3 step-cards — `:189-218`

**Waiting for your call**
- [ ] I5 · Eyebrow with count pulse; Deck / List segmented — `:236-241`
- [ ] I6 · Triage digest strip — "File N routine", per-subject pattern chips ("N × subject · See all", "✓ all N"), "N to decide" — `:247-271`, `src/inboxDigest.js:43-79`
- [ ] I7 · Focus banner "Showing X · N" + Back to the deck — `:272-277`
- [ ] I8 · The deck — two ghost cards behind the live top card — `:282-288`
- [ ] I9 · The pending card (one template, 44 kind-groups, 26 capture routes) — `SwipeRow` right FILE / left DISCARD; route badge + Low confidence; Seen tag + time · source; TL;DR verdict + steps; "Approve = …" line; title (2-line clamp, tap to expand); ▸ See what gets filed → You captured / Will be filed; reason line; Daily-review adjustments Done / Not today; error line — `:290-404`
- [ ] I10 · The verb row — ✓ Approve (or the Opus / keep model gate) · ✕ Discard / Skip this week · Seen toggle · ask-why panel (reason chips + free text + Discard with reason / Keep it) · kind-specific doors: Open in Practice · Open the briefing / Watch it being made · Deep weave · Research the books — `:409-485`
- [ ] I11 · Deck footer "1 of N · swipe right to file …" — `:492-501`
- [ ] I12 · Proposed-rule card — Accept / alt / Skip — `:507-519`

**Loops** (seven "status line + Run now" cards before History begins)
- [ ] I13 · Daily Review — Off / Draft / Auto chips, hour `Select`, status, Run now — `:527-544`
- [ ] I14 · Briefs — 3 slots (morning · evening · weekly): hour `Select`, mode chips, status, Run now — `:548-578`
- [ ] I15 · Compost — last run + open count, Run now, proposal rows Accept / Open / Dismiss — `:580-612`
- [ ] I16 · Open promises — same shape, Accept / Open the note / Let it go — `:614-653`
- [ ] I17 · Todoist sync — status, Sync now, footnote — `:655-669`
- [ ] I18 · Meal prep — status, Run now — `:671-680`
- [ ] I19 · Guardian — status dot, Run checks / Report / Export, per-check rows — `:682-708`

**History**
- [ ] I20 · Head, 3 honest empty variants, rows (time · route badge · title + status · Undo / Retry / Deep weave / Dismiss, expand for full text), "Show N more · N older" — `:714-793`

**Record kinds:** 43 named `kind`s in `SOURCE_LABEL` (`valsInbox.js:16-35`) + plain captures = 44 groups; captures split into 26 `decision.route` variants (`ROUTE_META`, `:51-87`); the full table with each kind's verb deviations is in the inventory. **`'repertoire'` is retry-eligible (`:443`) but has no `SOURCE_LABEL`, so it would badge itself TYPED** [Verified]. `isContinue` is hard-wired false yet keeps live JSX (`:363-368`, `Inbox.jsx:337-342`). No client-side expiry logic found for time-value kinds (may be server-only).
**Overlays:** none of its own; the ask-why is an inline reveal. **States:** skeleton pre-first-load; three empty copies; offline keeps capture usable via the Outbox; demo "Connect a backend to capture". **Motion today:** `countPulse`, `nv-deck-rise` on a new top card, `nv-leave-approve` / `nv-leave-discard` 420ms, `nv-stagger` on commitments.
**Prior findings:** #13 done on the Inbox's own card (light tick, one do-all, ask-why as the conversation); #19 hour pickers now the house `Select`.
**First look:** the pending card offers up to seven verbs plus a kind-specific door; seven loop cards sit between the deck and History; the same string (`money-import`, `calendar`, `practice-*`) is both a `kind` and a `route`; the capture composer, the deck, the loops console and the history are four different jobs on one screen. The redesign question for this page is which of the four belong here at all.

### TIER 2 · THE WEEKLY SURFACES

#### Settings — `settings`
`src/screens/Settings.jsx` (918 lines) · vals slice of `src/vals/valsChrome.js:536-680`. One long scrolling page, 13 sections, no sub-screens, no cupertino branch. Inventory: `00-inventory-d-settings-library-ops-small.md`.

- [ ] S1 · Backend connection — URL + token inputs, Test / Save & connect / Disconnect, coloured status line — `Settings.jsx:37-85`
- [ ] S2 · About you — Edit / Set-up chip, Redo / Set my numbers (starts the Intake on Voice), summary line, edit form (focus · priorities · best self · constraints), read view — `Settings.jsx:87-145`
- [ ] S3 · What Nova has noticed (trust ladder) — one row per lane: kept/total serif fraction, split bar, "worth easing off" flag; bullet fallback — `Settings.jsx:147-195`
- [ ] S4 · Appearance — Design style rows (Command Core / Apple skin / Apple layout) with swatches; Theme rows (Command / Observatory / Ember / Daylight); Nova core rows (Hologram / Filament); Calm toggle — `Settings.jsx:197-292`, `src/theme.js:10-42`
- [ ] S5 · Notifications — push state label, Enable / Test — `Settings.jsx:294-311`
- [ ] S6 · "You can just say it" — static capability card, no control — `Settings.jsx:313-325`
- [ ] S7 · Haptics — capability tag, "Feel each one" (5 word buttons), Different / The same chips, diagnostic line — `Settings.jsx:335-398`
- [ ] S8 · Voice (~280 lines, 10+ rows in one card) — Speak replies, "Hey Nova", Talk over Nova, How Nova hears you + Test Nova's ears, silent-switch Duck / Speak anyway, Sound effects, turn-end pause picker, Can you hear Nova? checklist + Build + Test, Research browser sign-in, edge-swipe diagnostics, Can Nova hear you? mic check, two raw `<select>` voice pickers, engine footnote — `Settings.jsx:402-681`
- [ ] S9 · Navigation order — drag list + explanatory copy; **the copy says "the first three fill the floating dock", the dock takes five (`MobileChrome.jsx:50`)** [Verified 26 Sep] — `Settings.jsx:683-694`, `src/TabOrderEditor.jsx:7-69`
- [ ] S10 · Calendars — Refresh, error / loading / empty, Shown / Hidden chip per calendar — `Settings.jsx:696-726`
- [ ] S11 · Claude models — Reset all, board states, lane-count + off-count, watch line, week's spend (serif), collapsible lane groups, per-lane row (On/Off chip · raw `<select>` · Reset · spend bar), deterministic-lane note, off-lane warning — `Settings.jsx:728-867`, `src/modelSpendView.js:38-60`
- [ ] S12 · Time machine · Guardian — Browse snapshots, per-file list with inline Restore… confirm — `Settings.jsx:869-909`
- [ ] S13 · Footer (server/.env, README) — `Settings.jsx:911-915`

**States:** not connected hides profile / learning / push / calendars / models / time machine (`valsChrome.js:539-657`); offline additionally hides calendars, models, time machine. **Motion:** two `fadeUp`s on the mic-check banner and verdict; otherwise static. **Prior:** #10 trust ladder done; #19's raw-`<select>` smell recurs here four times (`:658, :669, :822`).
**First look (UNVERIFIED):** the Voice section is the longest single scroll in the app and a candidate for its own screen; three near-identical option-row blocks copy-pasted (`:200-279`); developer diagnostics (haptics, ears, mic, swipe) sit inline among consumer preferences with no separation.

#### Library — `library`
`src/screens/Library.jsx` (651) · `src/vals/valsLibrary.js` · `src/shelf3d/*` (3D shelf). One of the app's bespoke objects; the redesign question is the frame around it, not the shelf.

- [ ] L1 · Head + count, kind filter chips with counts, Search — `Library.jsx:108-115, 640-641`
- [ ] L2 · "＋ Add source" → IngestModal — `Library.jsx:121`
- [ ] L3 · Covers / Shelf toggle (raw ▦ ▥ glyphs) with FLIP morph between views — `Library.jsx:75-100, 123-139`
- [ ] L4 · Covers grid — generated cloth covers, jacket + scrim, foil title, kind glyph, provenance, concept/echo counts, staggered `shelfIn` — `Library.jsx:215-326`
- [ ] L5 · 3D shelf — 21 editions on a walnut board, drag to spin, tap-select then tap-open, edge guard for back-swipe, render-on-demand — `src/shelf3d/Shelf3D.jsx`, CSS spine fallback `Library.jsx:328-343`
- [ ] L6 · Stage (3D-open) — the volume tumbles into its detail pose, text rises beside it; split 52/48 wide, stacked narrow — `Library.jsx:503-576`
- [ ] L7 · Detail dossier — back, cover, title/author/provenance/updated/echoes, Open source ↗ · Original · See in Galaxy, Concepts / People & works / Topics / Also linked chip rows, "What Nova holds" body, related-sources rail — `Library.jsx:356-461`
- [ ] L8 · The tint — the whole screen recolours to the open volume's accent, contrast-checked — `src/shelf3d/useLibraryTint.js:41-77`
- [ ] L9 · States — header label connected / offline / connect-a-backend; detail loading / error + retry; 3D-unavailable notice — `valsLibrary.js:130-133, 178-189`, `Library.jsx:211-213`

**Prior:** #16 Library half done (search, scrim, whole-cover tap). **First look:** the shelf is a strength; the two raw glyph toggles beside house chips are the inconsistency.

#### Ops (with the Org Map) — `ops`
`src/screens/Ops.jsx` (349) · `src/vals/valsOps.js` · `src/vals/valsOrgMap.js` · `src/orgmap/*` · `src/agentWorld/*`. Three screen-sized systems on one route.

- [ ] P1 · Empty state (demo / no sync) and head "records + heartbeats · nothing invented" — `Ops.jsx:175-190`
- [ ] P2 · The human gate — pending count, gate line, Open Inbox → — `Ops.jsx:193-199`
- [ ] P3 · The Org Map — seven districts on a ring, ten beings on their sets, walks, acts, waiting markers with real counts, tap a being → detail card (status · asks · last receipt · loops), pill-list fallback without WebGL, headline sentence, theme-aware rebuild — `Ops.jsx:201-210`, `src/orgmap/OrgMap.jsx:32-171`, `src/agentWorld/beings.js:120-156`, `habitat.js:26-34`
- [ ] P4 · Topology — Channels column · 86px core · Connections column, "In conversation" agents (tap expands AgentDetail), legend, "N filed today" — `Ops.jsx:212-248`
- [ ] P5 · Skill map — department cards, each skill tagged OBSERVE / PROPOSE / ACT — `Ops.jsx:251-268`
- [ ] P6 · The Forge — input + Build it, job rows (state · title · cost · Stop · summary) — `Ops.jsx:270-302`
- [ ] P7 · Overnight queue — input + Queue, Run now ▸, item rows with remove, empty copy — `Ops.jsx:304-330`
- [ ] P8 · Working on this Mac — pulse + serif summary, per-project session rows with Show me / Close it — `Ops.jsx:115-172, 332`
- [ ] P9 · The stream — newest-first receipts ledger, empty copy — `Ops.jsx:334-346`
- [ ] P10 · Ambient hand-off — `goAmbient` lives here (`valsOps.js:250`); the only door to the wall display

**Prior:** #9 dial done (replaced by the Org Map). **First look (UNVERIFIED):** three systems stacked → a long scroll to reach the receipts; the skill map is a grid of same-shape bordered cards (a design pass, not a reflex fix); topology columns are dot-and-label rows.

#### Practice — `practice` (off-dock, shipped 26 Sep)
`src/screens/Practice.jsx` (488) · `src/vals/valsPractice.js` · `src/PracticeLamps.jsx`. Three states in one screen: Shelf → Stage → Debrief. Doors: Home card, the chat router, notifications, an Inbox `practice-*` card, the sidebar.
- [ ] Q1 · Shelf — head "Rehearsal · N skills", preparing rows (live / error dot), skill `Rail` of `SkillCard`s (title · `LampRow` · last rehearsed), empty copy — `Practice.jsx:212-240, 51-67`
- [ ] Q2 · `SkillDetail` — summary, why (pull-quote), "Next:" rehearse card, Moves (lamp · name · quoted line · When / Tell · source · tally), Scenes (Rehearse), gap notes (+ Upload the book), Rehearsals timeline (Work on), Open the page · Pause / Resume · Close — `:82-187`
- [ ] Q3 · Add a skill — free text + Prepare, research-mode note — `:189-207`
- [ ] Q4 · Stage — head + Leave; scenario card (title · cast · setting · lamp row chip/full · latest landed quote); script with speaker labels and streaming cursor; "Setting the scene…" dots — `:250-271, 366-416`
- [ ] Q5 · Debrief — best line, "Work on …", landed / missed counts, unparsed warning (nothing filed, no retry), notes, Rehearse next / Done — `:419-447`
- [ ] Q6 · Control bar — liquid glass above the dock: mic · input · Send · Pause · End scene — `:450-476`
**Motion today:** `shelfIn` 40ms stagger, `nvGlassArrive`, capped `fadeUp` rises, the lamp's 600ms bloom, `dotBlink`. **First look:** two lamp renderings (`StageLampChip` / `StageLamp`) for one concept; the unparsed-debrief path is the one place nothing files and nothing retries.

#### Leader — `leader` (off-dock)
`src/screens/Leader.jsx` (146) · `src/vals/valsLeader.js` · `src/LeaderBox.jsx` (shared with Home). Doors: Home's Leader box, a notification, the Mac sidebar.
- [ ] D1 · Head + "Leadership · daily practice" + research count — `Leader.jsx:56-60`
- [ ] D2 · Today's idea — chip · title · line · why · refs, or the honest fallbacks — `:63-79`
- [ ] D3 · The situation box (`LeaderBox`, always `variant="apple"` here even under Command) — `:88-92`
- [ ] D4 · Working against (struggles, tap to reveal, Handled) · Working for him — `:95-96`
- [ ] D5 · The sit-down — head + New conversation, `ChatMarkdown` bubbles, empty placeholder, busy line, composer (no mic of its own) — `:99-127`
- [ ] D6 · Recent ideas trail (last 5) — `:130-143`
**First look:** the situation box is one shape drawn on two surfaces by design; the chat composer has no mic while the box above it does.

#### Briefing — `briefing` (off-dock)
`src/screens/Briefing.jsx` (376) · `src/vals/valsBriefing.js`. Doors: an Inbox `briefing` card, a voice reply, a resume nudge, `#/briefing?id=`; no dock or sidebar row.
- [ ] B1 · Empty state — "Nothing open. Ask for one.", explainer, 3 starter chips → Voice composer, the stage at rest, "Already made" list — `Briefing.jsx:138-181`
- [ ] B2 · Loading / working (title, topic, pulsing status, angle checklist ✓ ◍) / error + Back — `:186-222`
- [ ] B3 · Listen / Read segmented + browser-voice footnote; progress rule — `:339-350`
- [ ] B4 · Stage pane — hero `Glass` (title · term · heading · image · clip) + mini rail + desktop controls (Pause / Resume / Play · Restart · N/total) — `:25-103, 241-253`
- [ ] B5 · Transcript pane — section eyebrows, tap-to-seek beat rows — `:255-274`
- [ ] B6 · Read mode — summary, incomplete-angle warning, sections with "▶ Listen from here", glossary, Sources — `:276-320`
- [ ] B7 · Head row — Briefing eyebrow, In your vault / Keep in vault, title, "You asked: …", Close; mobile floating controls above the dock — `:326-336, 369-373`
**Prior:** #20 empty state done. **First look:** `Glass()` here and `StageCard` on Voice are two vocabularies for one idea; `valsBriefing` never reads `demoMode`.

### TIER 3 · THE SMALL SCREENS

#### Money — `money` · `src/screens/Money.jsx` (155) · `src/vals/valsMoney.js`
- [ ] M1 · Head + month `<select>` (only with >1 month) — `Money.jsx:19-28`
- [ ] M2 · This month — total, delta, income, Monthly report chip (`tone="gold"`), Export FY — `Money.jsx:35-46`
- [ ] M3 · Feeds — imports folder, Check folder now, Scan statement / receipt (file input), scan error / question, "type it" hint — `Money.jsx:48-61`
- [ ] M4 · By category — rows with progress bar (warn when over), tap → **native `window.prompt` to set a budget** — `Money.jsx:66-85`, `valsMoney.js:34-39`
- [ ] M5 · Subscription radar — monthly total, per-sub cards (cadence · next expected · price-rise tag), empty copy — `Money.jsx:88-109`
- [ ] M6 · Ledger — Merchant + Amount inputs, Spend / Money-in toggle, Add; rows with inline category `<select>`, amount by sign, ✕; "showing N of M" cap at 120 — `Money.jsx:116-146`
**First look:** three unrelated list styles on one page; a browser prompt inside a designed surface; gold still the commit hue on "Monthly report" (22 Sep #2 may have missed this screen: UNVERIFIED).

#### Shopping — `shopping` · `src/screens/Shopping.jsx` (147) · vals in `src/vals/valsMisc.js`
- [ ] G1 · Head + count, multi-line add textarea + Add, error line — `Shopping.jsx:11-34`
- [ ] G2 · Clear all — idle / armed confirm / post-clear Undo banner (a change acted out) — `Shopping.jsx:39-63`
- [ ] G3 · Category groups (gold Eyebrows), swipe-right-to-check rows, checkbox, qty prefix + recipe badge, "from {source}", "sorting into an aisle…" — `Shopping.jsx:71-112`
- [ ] G4 · Quantity stepper − / qty / + — `Shopping.jsx:117-125`
- [ ] G5 · Done — "Confirm completion — N collected" — `Shopping.jsx:135-144`
**First look:** the clear-all flow is a model to copy; check gold category labels read as labels, not actions.

#### Code (Claude Code) — `code` · `src/screens/ClaudeCode.jsx` (143) · vals in `src/vals/valsMisc.js`
- [ ] K1 · Head + meta, Spar (send the Breaker) · New session · Add to vault (`tone="gold"`) chips — `ClaudeCode.jsx:9-19`
- [ ] K2 · Console header — three dots, workspace path, connection dot — `ClaudeCode.jsx:27-34`
- [ ] K3 · Uncommitted changes — count + branch, Show / Hide diff, up to 8 files, diff `<pre>` capped 46%, commit message + Commit + Shelve; read-only vault notice; shelved banner + Restore — `ClaudeCode.jsx:37-77`
- [ ] K4 · Transcript — BUILDER · BREAKER · SYSTEM · YOU rows, busy dots, not-connected / empty copy — `ClaudeCode.jsx:78-91`
- [ ] K5 · Input + Run — `ClaudeCode.jsx:92-104`
- [ ] K6 · Session card — Model raw `<select>`, Workspace `Segmented` (Nova OS / Vault), status line; Can / can't card — `ClaudeCode.jsx:106-138`

#### To-Do — `todos` · `src/screens/Todos.jsx` (127) · `src/vals/valsTodos.js`
- [ ] T1 · Head + open/done counts, add input + Add, sync note (Todoist / vault) — `Todos.jsx:16-37`
- [ ] T2 · Category groups (Work · Personal · Fitness · Errands · Later · Unsorted); cupertino: one grouped card per category — `Todos.jsx:44-63`
- [ ] T3 · Row — swipe-right DONE, 44pt checkbox, full-width title, category text-action (inline `<select>` when editing), age label, staleness hairline that deepens 2→6 weeks — `Todos.jsx:54-100`, `valsTodos.js:61-66`
- [ ] T4 · Done — header ("the compost loop sweeps these"), filled check to reopen, strikethrough, age; no swipe or undo here — `Todos.jsx:111-121`
**Prior:** #7 title squeeze and the gold Stale tag both done and re-verified.

#### Notes — `notes` · `src/screens/Notes.jsx` (123) · `src/vals/valsNotes.js`
- [ ] E1 · Head + count, Search, type-filter `Rail` with per-type hue + count — `Notes.jsx:11-37`
- [ ] E2 · Note list rows (title · type tag · date), prefetch on pointerdown — `Notes.jsx:40-45`
- [ ] E3 · Reader — type eyebrow, serif title, meta, ▶ Watch source, body paragraphs, Linked in Galaxy chips — `Notes.jsx:49-65, 111-118`
- [ ] E4 · Studio pipeline row (idea notes) — status chip seed → outlining → scripting → shipped, Draft outline, ◐ Tonight — `Notes.jsx:55-61`
- [ ] E5 · Today's review reflect card — summary, Reflect / Close, ✦ Generate a prompt, textarea, Save — `Notes.jsx:68-108`
**Prior:** #11 chip wall done (the Rail). **First look:** two different "extra panel on a note" patterns share one reader.

#### Journal — `journal` · `src/screens/Journal.jsx` (115) · vals in `src/vals/valsNotes.js`
- [ ] J1 · Head + count; composer — ✦ Generate a prompt (literal hex `tone="#cbb6f2"`), prompt line, textarea, Save entry — `Journal.jsx:11-43`
- [ ] J2 · Loading / empty / empty-in-category copy; category chips ALL · PERSONAL · TRAINING · SYSTEM — `Journal.jsx:47-60`
- [ ] J3 · Day rows — serif date (today larger + accented + Tag), one dot per entry (cap 6 + N), house Chevron, tap expands with `nvRise` — `Journal.jsx:69-89`
- [ ] J4 · Expanded day — time, category Tag, heading (wikilink stripped), text — `Journal.jsx:96-107`
**Prior:** #14 date table done and re-verified feature by feature.

#### Stash — `stash` · `src/screens/Stash.jsx` (90) · vals in `src/vals/valsMisc.js`
- [ ] X1 · Head + count, intro line, add form (Category with datalist · Name · URL · Note · Stash it) — `Stash.jsx:17-46`
- [ ] X2 · Category groups; item row = name + host/note `<a>` **and a second `<a>` "Open ↗" pill to the same URL**, remove × with inline confirm — `Stash.jsx:57-83`
**Prior:** #16 Stash half unresolved (two tap targets per row) [Verified in source].

#### Galaxy — `galaxy` · `src/screens/Galaxy.jsx` (57) · vals in `src/vals/valsMisc.js` · `src/galaxyLayout.js`
- [ ] Y1 · Head + stats, title, legend chips (type filters, tap fades others), Clear filter, overlay chips Recency · Compost — `Galaxy.jsx:11-33`
- [ ] Y2 · The canvas — pan, pinch, tap a star; hint line; Reset view when zoomed — `Galaxy.jsx:36-42`
- [ ] Y3 · Selection card — type eyebrow, serif label, description, Open, Dismiss — `Galaxy.jsx:43-53`
**First look:** a bespoke object; the legend row and overlay row are two similar chip rows with different meanings stacked together.

#### Ambient — `ambient` (off-dock, wall mode)
`src/screens/Ambient.jsx` (168) · fed by `src/vals/valsOps.js:247-337`. One door: Voice's "◐ Ambient" chip. Exit: tap anywhere (the only affordance is a `title` attribute, invisible on touch).
- [ ] A1 · Full-bleed tap scrim + state wash (gold attention · cyan clear · none unknown) — `Ambient.jsx:71-78`
- [ ] A2 · Giant clock (96px, blinking colon) + date; `NovaCore` 300 + italic tagline — `:80-95`
- [ ] A3 · Tiles NEXT · STEPS · PROTEIN · GATE (count-ups); objectives TRAIN STREAK · PROTEIN MONTH · STEP STREAK when real — `:101-118`
- [ ] A4 · `PulseStrip` (one topic every 9s), `StreamStrip` (3 newest receipts), sync-age corner label (warn past 15 min), 3600s OLED drift, wake lock — `:26-42, 97-128, 136-168`
**First look:** no idiom branch (plausibly deliberate for a wall); the most hidden screen after Console; the exit is undiscoverable on a touchscreen.

#### Console — `console` (off-dock, sidebar only)
`src/screens/ConsoleScreen.jsx` (29) → `src/Instruments.jsx`. The morning brief drawn as five instruments (Recovery/HRV band · 24-hour ring · Steps-this-week bars · Training body · Fuel body), each with an honest-absence state, 90ms staggered reveal, "Read again"; loading / empty / error copy — `Instruments.jsx:46-375`. **The most hidden screen in the app: no `navigate('console')` call site exists.**
- [ ] C1 · Decide whether Console is a screen, a Home section, or retired — `ConsoleScreen.jsx:13-23`

---

## 6 · Proposed order

My recommendation, with the reason for each placing. **His call, 26 Sep:
Home first** ("Start with home"); the rest of the order stands as proposed
until he says otherwise. The two obvious alternatives are noted after the
list.

| # | Page | Why here |
| --- | --- | --- |
| 1 | **Home** (with the chrome that frames it: dock, top bar, More sheet, screen transition) | The most-seen surface. Twenty-three sections compete for one phone screen; the material, headline and density decisions made here become the language every other page inherits. |
| 2 | **Inbox** | His named pain (25 Sep). Four jobs on one screen (capture, deck, loops console, history) and up to seven verbs on a card. The rails model touches every receipt in the app, so settling it early stops later pages inheriting the clunk. |
| 3 | **Train** | The largest screen (1,235 lines, 33 rows here) and the most tactile use in the app: ticking a set one-handed mid-lift. The Coach deck is already the reference for "simple". |
| 4 | **Fuel** | Twenty-four rows; the composer stack (U7 to U18) is twelve conditional sub-features in one column. The macro colour convention is a strength to keep. |
| 5 | **Voice** | The front door for talking. The glass, the station frame, and the markdown gap in replies. |
| 6 | **Sheets and overlays** (GlassSheet, ContextMenu, Island, exits) | Decisions X1, X2, X5 land here and change how every page's detail opens and closes. Doing it after the four daily pages means we know what needs to open. |
| 7 | **Settings** | The longest scroll in the app; the Voice section alone is ~280 lines and a candidate for its own screen. |
| 8 | **Ops + Org Map** | Three screen-sized systems on one route. |
| 9 | **Library** | The shelf is a strength; the frame around it is the work. |
| 10 | **Practice** | Shipped 26 Sep; not yet seen on his phone. Audit after he has used it. |
| 11 | **Leader** | Small; one shape drawn on two surfaces. |
| 12 | **Briefing** | Off-dock; two vocabularies for the glass to reconcile with Voice. |
| 13–20 | **To-Do · Shopping · Notes · Journal · Money · Stash · Galaxy · Code** | Dock order. Each is a half-day; several are already the reference for a pattern (Shopping's clear-all, Journal's day rows). |
| 21 | **Ambient** | A wall; decide whether it stays and how he leaves it on a touchscreen. |
| 22 | **Console** | No door exists except the Mac sidebar. Decide whether it is a screen, a Home section, or retired. |

Alternatives: **Inbox first** (his explicit pain, and the rails decisions
propagate) at the cost of designing cards before the page material is set;
or **chrome first** (dock, transitions, sheets), which sets the frame but is
abstract without page content to put in it.

---

## 7 · Ledger (append-only, newest first)

- 26 Sep 2026 — HOME DECIDED. He loves all of round 5; wants Nova glass
  (main), Nova night, Observatory, Apple glass with a day→night cycle, and
  Summary light as switchable options; keeps Practice and Trends; the Index;
  the current appearance must stay available and stable. Build contract:
  `design/HOME-REDESIGN-PLAN.md` (style `summary`, theme `sky`, material
  glass|solid, hour band; phases P0–P5). Home rows stay [m] until P2 lands.
- 26 Sep 2026 — his answer on round 4: combine with the current Nova
  aesthetic, without using all of it. Round 5 published:
  https://claude.ai/artifact/85jQqTxKucJg6XddXPFZsc (the blend in Nova glass /
  Nova night / Observatory, with Apple glass alongside; the serif standfirst
  and highlight, the domain hues, the gold badge and the core brought back;
  brackets, mono micro-labels, the clock, coloured borders and the fold left
  out; source `design/mockups/56-redesign-home-nova.html`). His words in
  `01-home.md` §9. Home stays [m].
- 26 Sep 2026 — his answer on round 3: loves aspects of A, B and C
  ("the simple design, use and beautiful aesthetic"). Round 4, the blend,
  published: https://claude.ai/artifact/EY1SBc13N2RXMZsbpQu2EJ (one Home
  from A's shape + B's ring hero + C's glass and strip, under four
  materials: glass day, glass night, dark, light; plus the Index in the same
  idiom; source `design/mockups/55-redesign-home-blend.html`). Direction
  converging on Apple-native; the remaining call is the material. His words
  in `01-home.md` §8. Home stays [m].
- 26 Sep 2026 — his call on round 2: try alternatives with the Apple
  aesthetic and DISREGARD the Nova-specific guidelines for the exploration
  ("the nova-specific design architecture is holding back your design
  options"). Round 3 published: https://claude.ai/artifact/Q92jjUHaPwTbzBkQxjuPev
  (A · Summary / Health, B · Rings / Fitness, C · Glass / iOS 26 Weather,
  D · Paper / News; source `design/mockups/54-redesign-home-apple.html`).
  His words in `01-home.md` §7. If one is chosen, §3 of this file and
  NOVA-METHOD §2b change on his word. Home stays [m].
- 26 Sep 2026 — his verdict on round 1: none of the three, still too
  cluttered; move features off Home; Home as widgets he arranges (iOS Home
  Screen editing); an Index like iOS Settings for the other pages (his
  recording). Round 2 published: https://claude.ai/artifact/RARXgdhv4No7T5gSpcWPKC
  (Home · Edit · Add · Index · Drill; source
  `design/mockups/53-redesign-home-widgets.html`). The section → widget /
  page / moment map is in `01-home.md` §6. Home stays [m].
- 26 Sep 2026 — Home mockups round 1 published for his phone:
  https://claude.ai/artifact/TsC7tZ37qSo9Skw463AFi6 (A · The Read, B · The Day
  Spine, C · Two Panes; source `design/mockups/52-redesign-home-abc.html`, demo
  content). Home rows → [m]. Awaiting his tweaks. His answers so far: proceed
  with all three; the dock-centre decision (option B) asked to be explained.
- 26 Sep 2026 — his call: Home first. Home audited from two recordings of
  his phone (42 frames, cupertino, 15:40): `design/audits/redesign-2026-09/01-home.md`.
  Verdict: needs work; 19 sections all open, ~20 screens deep, 22 buttons,
  facts restated up to six times, two Stuck items are August test to-dos in
  his vault. Home rows → [a]. Mockups A/B/C next.
- 26 Sep 2026 — checklist opened. Four read-only source surveys (Sonnet,
  parallel) produced the rows; 38 random locators re-checked by hand: 35
  exact, 3 off by a neighbouring line (corrected here). Four load-bearing
  claims independently re-verified against source and marked [Verified]
  where they appear. No page audited yet; no pixels looked at; order
  proposed, awaiting his call.
