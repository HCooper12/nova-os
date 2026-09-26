> **Inventory, not audit.** Produced 26 Sep 2026 by a read-only source survey (Sonnet) briefed by the redesign session; feeds `design/REDESIGN-CHECKLIST.md`. Ten random locators from this file were re-checked by hand against the source that day (see the checklist's ledger for the totals); known mis-cites: survey A none found; survey B: the Fuel `display:none` block is at `Recipes.jsx:540`, not 626-634; survey C: `VoicePresence.jsx:87` is a blank line (the glass treatment is at :99 and :142); survey D: `valsChrome.js:513` is `holdNovaText`, not `goSettings`. "First-look notes" are hypotheses from reading code, not findings from pixels. No product code was changed.

# Survey D — Settings, Library, Ops (+ Org Map), Money, Shopping, Code, To-Do, Notes, Journal, Stash, Galaxy

Read-only survey. `path:line` locators throughout. `Settings.jsx` read in full
(lines 1–918). `Library.jsx` read in full (lines 1–651).

---

## Settings — `settings` — `src/screens/Settings.jsx` (918 lines), vals slice of `src/vals/valsChrome.js`

**Purpose:** connect the real backend/vault, set appearance, and configure every
voice/model/notification/trust preference in one long scrolling page.

**Reached by:** System nav group, `mkNav('Settings', 'XV.', 'settings')` —
`src/vals/valsChrome.js:224`. On phone this is normally in "More" (only the
first three tab-order items dock — `src/screens/Settings.jsx:692`). No other
`navigate('settings')` call sites found in the screens surveyed; Ops's `goSettings`
helper exists in chrome vals (`src/vals/valsChrome.js:513`) for voice/orb use.

**Modes / sub-views / sections (in render order):**
1. Backend URL + API token + Test/Save/Disconnect — `Settings.jsx:37-85`
2. About you (profile) — view / edit / empty states — `Settings.jsx:87-145`
3. What Nova has noticed (trust ladder), gated on `learning.enoughData` — `Settings.jsx:147-195`
4. Appearance: Design style, Theme, Nova core, Calm mode — `Settings.jsx:197-292`
5. Notifications (push) — `Settings.jsx:294-311`
6. "You can just say it" (voice-command capability notice) — `Settings.jsx:313-325`
7. Haptics — `Settings.jsx:335-398`
8. Voice (the largest section: speak replies, "Hey Nova", talk-over, hearing engine, audio-session ducking, sound effects, turn-end pause, voice test, research browser sign-in, back-swipe diagnostic, mic check, voice picker, on-device voice picker) — `Settings.jsx:402-681`
9. Navigation order (drag-to-reorder tabs) — `Settings.jsx:683-694`
10. Calendars (show/hide per calendar) — `Settings.jsx:696-726`
11. Claude models (the model board + spend) — `Settings.jsx:728-867`
12. Time machine · Guardian (vault snapshots/restore) — `Settings.jsx:869-909`
13. Footer note (server/.env, README pointer) — `Settings.jsx:911-915`

That is 13 top-level sections; §10 (Design style/Theme/Core/Calm) is itself titled
"Appearance" as one Eyebrow with 4 sub-groups, so header-for-header it reads as
14 headings if Appearance's four are counted separately.

**Idiom branches:** no `structured`/cupertino layout branch in this file — same
JSX tree in both styles; only inline `s.value === 'command'` swatch shapes
(`Settings.jsx:213-219`) differ per *design-style option*, not per active idiom.

### Features (top to bottom as rendered)
- [ ] F1 — Backend URL input — `type=url`, mono font, placeholder shows a Tailscale URL — `Settings.jsx:52-61` — type
- [ ] F2 — API token input — `type=password` — `Settings.jsx:64-74` — type
- [ ] F3 — Test connection (text action) — `Settings.jsx:77` — tap — runs `v.testSettingsConnection` (`App.jsx:4247`)
- [ ] F4 — Save & connect button — `Settings.jsx:78` — tap — `saveSettingsConnection` (`App.jsx:4256`)
- [ ] F5 — Disconnect (shown only when connected) — `Settings.jsx:80` — tap — `disconnectSettings` (`App.jsx:4265`)
- [ ] F6 — Connection status line, coloured by state (idle/testing/ok/error) — `Settings.jsx:27,84`
- [ ] F7 — About you: Edit/Set-up chip + Redo/Set-my-numbers chip — `Settings.jsx:92-97` — tap — Set-numbers routes to Voice screen and starts the Intake (`Settings.jsx:97`, `App.jsx:6741`)
- [ ] F8 — About-you summary line (Intake numbers or the "no intake yet" empty copy) — `Settings.jsx:100-104`
- [ ] F9 — Profile edit form: Focus input, Priorities textarea, Best-self textarea, Context/constraints textarea, Save/Cancel — `Settings.jsx:108-133`
- [ ] F10 — Profile read view: focus/priorities/best-self/notes cards — `Settings.jsx:135-140`
- [ ] F11 — Trust ladder — one row per lane: kept/total as a serif fraction, a kept-vs-dismissed split bar, label, "worth easing off" flag on `skips` lanes — `Settings.jsx:161-189` — falls back to plain bullet sentences if the server has no `lanes` array yet — `Settings.jsx:190-192`
- [ ] F12 — Design style radio-style rows (Command Core / Apple skin / Apple layout), each with a material swatch and an Active tag — `Settings.jsx:200-226` — tap — `s.pick` → `app.setNovaStyle` (`App.jsx:1449`)
- [ ] F13 — Theme rows (Command / Observatory / Ember / Daylight-Apple-only), 3-dot swatch — `Settings.jsx:228-252` — tap — `t.pick` → `app.setNovaTheme` (`App.jsx:1443`); theme list filtered by `appleOnly` in `src/vals/valsChrome.js:529` and defined in `src/theme.js:10-16`
- [ ] F14 — Nova core rows (Hologram / Filament) — `Settings.jsx:254-279` — tap — `c.pick` → `app.setCoreStyle` (`App.jsx:1456`); defined `src/theme.js:39-42`
- [ ] F15 — Calm mode toggle row — `Settings.jsx:281-291` — tap — `toggleCalm` → `app.setCalmMode` (`App.jsx:1446`)
- [ ] F16 — Push notifications row: state label + Enable/Test — `Settings.jsx:294-311` — tap — `enable`→`app.enablePushNotifications` (`App.jsx:5218`), `test`→`app.testPush` (`App.jsx:5253`)
- [ ] F17 — "You can just say it" static info card, no control — `Settings.jsx:316-325`
- [ ] F18 — Haptics capability tag + description — `Settings.jsx:346-348`
- [ ] F19 — "Feel each one" — 5 haptic-word buttons (tick/threshold/commit/celebrate/warn) — `Settings.jsx:360-368` — tap → `haptic(w)` (`src/haptics.js`)
- [ ] F20 — "Do tick and warn feel different?" Different/The same chips (only on `switch` path) — `Settings.jsx:377-383`
- [ ] F21 — Diagnostic line (iOS reported, browser, standalone, overlay, switches, vibrate) for pasting into a bug report — `Settings.jsx:384-392`
- [ ] F22 — Speak replies toggle + engine label — `Settings.jsx:408-414` — `toggleSpeak`
- [ ] F23 — "Hey Nova" wake-word toggle — `Settings.jsx:416-428` — `setWakeWord`
- [ ] F24 — Talk over Nova (barge-in) toggle, disabled copy explains the wake-word dependency — `Settings.jsx:432-446` — `setBargeIn`
- [ ] F25 — How Nova hears you — chip picker across `hearingOptions`, explanatory line, hint line — `Settings.jsx:452-469` — `setHearing`
- [ ] F26 — "Test Nova's ears" chip + live status (listening/heard text/error) — `Settings.jsx:470-484` — tap — `runEarsTest` → `src/earsTest.js:11` (records via `recorder.js`, sends to Mac, never files anything)
- [ ] F27 — When your phone is on silent — Duck music / Speak anyway toggle — `Settings.jsx:494-510` — `setAudioDucks`; logic in `src/audioSession.js` (SPEAK='playback' default vs DUCK='transient', `audioSession.js:43-79`)
- [ ] F28 — Sound effects toggle (reveal ticks/chime) — `Settings.jsx:516-529` — `setSfxOn`; rides iOS `'ambient'` session type (`audioSession.js:95-104`)
- [ ] F29 — How long a pause ends your turn — chip picker over `voiceHoldOptions`, each showing seconds — `Settings.jsx:535-550` — `setVoiceHold`
- [ ] F30 — Can you hear Nova? — check-row diagnostic list + Build number + Test chip — `Settings.jsx:554-589` — tap — `runVoiceTest` (`App.jsx:8999`)
- [ ] F31 — Research browser sign-in — explanatory copy + "Sign in on the Mac" chip — `Settings.jsx:576-584`
- [ ] F32 — Swipe back from left edge — 3 CheckRow diagnostics (installed/depth/last swipe) — `Settings.jsx:594-607`
- [ ] F33 — Can Nova hear you? (mic check) — prompt banner, stage checklist, verdict card, Mic-check chip — `Settings.jsx:614-653` — tap — `runMicCheck` (`App.jsx:8973`)
- [ ] F34 — Voice picker `<select>` (server voices) — `Settings.jsx:655-664` — raw `<select>`, not the house `Select` control
- [ ] F35 — On-device voice `<select>` (browser voices) — `Settings.jsx:666-676` — raw `<select>`
- [ ] F36 — Voice engine detail footnote — `Settings.jsx:677-679`
- [ ] F37 — Navigation-order drag list (`TabOrderEditor`) + explanatory copy — `Settings.jsx:683-694` — drag — `setTabOrder` → `App.jsx:1460`
- [ ] F38 — Calendars — Refresh action, error/loading/empty states, per-calendar Shown/Hidden chip — `Settings.jsx:696-726` — tap — `toggle` → `app.toggleCalendarHidden` (`App.jsx:5312`), `load` → `app.loadCalendarList` (`App.jsx:5305`)
- [ ] F39 — Claude models — "Reset all" text action — `Settings.jsx:736-738` — `resetAll` → `app.resetModelLane(null)` (`App.jsx:5346`)
- [ ] F40 — Model board error/loading/retry states — `Settings.jsx:741-749`
- [ ] F41 — Lane-count summary line + off-count warning — `Settings.jsx:753-758`
- [ ] F42 — Watch line: "Newest, checked …" + outdated-pin warning — `Settings.jsx:763-772` (server/lib/modelWatch.js)
- [ ] F43 — Week's spend total (serif figure) or "nothing measured" line — `Settings.jsx:778-787`; computed by `src/modelSpendView.js:38-60`
- [ ] F44 — Collapsible lane groups (Chevron + off-count) — `Settings.jsx:789-804` — tap — `g.toggleOpen`
- [ ] F45 — Per-lane row: label/hint, On/Off chip, model `<select>` (raw), Reset text action, per-lane spend bar+detail or "no measured runs" — `Settings.jsx:806-861` — `l.toggle`→`app.setModelLane` (`App.jsx:5334`), `l.setModel`, `l.reset`→`app.resetModelLane`
- [ ] F46 — Deterministic-lane note ("no model runs; the switch is the setting") — `Settings.jsx:818`
- [ ] F47 — Off-lane warning line naming what the switch stopped — `Settings.jsx:856-858`
- [ ] F48 — Time machine — "Browse snapshots" chip (lazy-loaded) — `Settings.jsx:875` — `load`→`app.loadBackups` (`App.jsx:5297`)
- [ ] F49 — Per-file snapshot list with Restore… → confirm/cancel inline — `Settings.jsx:881-906` — `restore`→`app.restoreBackupNow` (`App.jsx:5669`)
- [ ] F50 — Footer legal/help text (server/.env, README) — `Settings.jsx:911-915`

Also present but not opened from this screen: `src/ModelChoicePrompt.jsx` — a
global job-time model-choice overlay rendered by `App.jsx:9990`
(`v.modelChoicePrompt`), unrelated to the Settings model board; it is a
separate gate that appears mid-run for Researcher/Watcher/Pattern
Scout/Distill, offering Opus for that one run (`ModelChoicePrompt.jsx:5-9`).

### Overlays & sheets this screen opens
- None modal — every section is inline on the page. (No sheet/overlay opens
  from Settings itself; Set-my-numbers navigates away to Voice + starts the
  Intake flow, `Settings.jsx:97`.)

### States: loading / empty / offline / error / demo
- Backend not connected: profile/learning/push/calendars/model-board/time-machine
  all gate on `!demoMode` and hide entirely — `src/vals/valsChrome.js:539,560,566,578,594,657`.
- Offline (`isOffline`) additionally hides calendars, model board and time
  machine (`:578,594,657`), but profile/learning still render read-only from
  cache — comment at `valsChrome.js:537-538`.
- Model board: distinct error / loading / loaded states — `Settings.jsx:741-751`.
- Calendars: error / loading / empty / loaded — `Settings.jsx:703-724`.
- Time machine: unloaded (chip to fetch) / loaded-empty / loaded-with-files — `Settings.jsx:874-908`.

### Motion present
- Mic-check prompt banner: `fadeUp var(--nv-dur-base) var(--nv-ease)` — `Settings.jsx:625`.
- Mic-check verdict card: same `fadeUp` — `Settings.jsx:639`.
- No entrance stagger on the page itself; sections are static once mounted.

### Prior findings (22 Sep report)
- #10 "Settings renders Nova's trust history as 17 grey bullets" — **done** —
  now a trust ladder (bar + serif fraction per lane), `8694418` per the report's
  §1b table; confirmed live in source at `Settings.jsx:153-193` (comment block
  explicitly references "review finding 10").
- #19 "A raw `<select>` in a designed surface" — report says **done** (`ed42781`,
  the house `Select`) for the *briefs row* — but Settings itself still ships
  four raw `<select>` elements of its own: voice picker (`Settings.jsx:658`),
  on-device voice (`:669`), calendar-free none, and every per-lane model
  picker (`:822`) plus the code-screen model picker are still bare `<select>`.
  Not the same surface the finding covered, but the same smell recurs here —
  UNVERIFIED whether this was in scope of #19.

### First-look notes from source (UNVERIFIED — no pixels seen)
- The Voice section alone is ~280 lines and 10+ sub-rows in one undifferentiated
  card (`Settings.jsx:407-680`) — likely the single longest scroll in the app;
  a candidate for its own screen or a collapsed/grouped presentation.
- Two raw `<select>` elements sit in the model board (`Settings.jsx:822`) and
  two more in the voice section (`:658,669`) — same "raw select in a designed
  surface" pattern §2b r2 and finding #19 already flagged elsewhere.
- The design-style/theme/core rows are near-identical Interactive blocks
  copy-pasted three times with only the swatch differing (`Settings.jsx:200-279`)
  — a single generic "OptionRow" component would remove ~60 lines of duplication.
- Diagnostic rows (haptics, mic check, ears test, back-swipe) read as developer
  console output inline in a consumer settings page — useful but dense; no
  visual separation from the preference rows around them.

---

## Library — `library` — `src/screens/Library.jsx` (651 lines), vals `src/vals/valsLibrary.js`

**Purpose:** the second brain's sources (books/videos/podcasts/articles) as a
walkable 3D shelf or a covers grid, opening into a full dossier per source.

**Reached by:** Vault nav group, `mkNav('Library', 'XVI.', 'library')` —
`src/vals/valsChrome.js:200`. Also reachable indirectly: Notes' "Linked in
Galaxy" chips can lead through Galaxy back into Library-adjacent content, and
`Library`'s own related-sources rail (`r.open`) re-navigates within itself
(`src/vals/valsLibrary.js:157`, stays on `library`). No other screen calls
`navigate('library')` in the files grepped.

**Modes / sub-views / sections:**
1. Shelf view — `grid` (Covers) or `spines` (3D/CSS shelf) — toggle `Library.jsx:123-139`
2. Detail (a source opened) — either the flat DOM `Detail` component (opened
   from Covers) or the `Stage` component (opened from the 3D shelf, keeps the
   canvas mounted) — `Library.jsx:637-648`
3. Filter chips (All/Books/Videos/Podcasts/Articles) — `Library.jsx:108-110`
4. Search input — `Library.jsx:113-115`

**Idiom branches:** none explicit (no `structured`/`isAppleStyle` check in this
file); the whole screen looks the same in both idioms except for shared
Controls.jsx / global CSS token differences.

### Features (top to bottom as rendered)
- [ ] F1 — Screen head + live count label — `Library.jsx:640-641`
- [ ] F2 — Filter chips by kind, each with a count — `Library.jsx:108-110`; data `src/vals/valsLibrary.js:77-82`
- [ ] F3 — Search input (placeholder shortened to "Search" per finding #16 fix) — `Library.jsx:113-115`
- [ ] F4 — "＋ Add source" chip — tap — opens `IngestModal` via `v.openIngestModal` — `Library.jsx:121`, `src/vals/valsLibrary.js:193`, `App.jsx` (`openIngestModal`)
- [ ] F5 — Covers/Shelf view toggle (▦/▥), 32px min tap target — `Library.jsx:123-139`
- [ ] F6 — Empty-state copy ("Your library is empty…" / "Nothing matches that filter.") — `Library.jsx:197-200`, `valsLibrary.js:187-189`
- [ ] F7 — Covers grid: generated cloth-cover cards, jacket image plated with a scrim, foil title, kind glyph, provenance badge, concept/echo counts — `Library.jsx:215-326`
- [ ] F8 — Spines shelf (CSS fallback): side-on spines with vertical title, board/plank/shadow beneath — `Library.jsx:328-343` — used only when 3D falls back (`fellBack`)
- [ ] F9 — 3D Shelf (`Shelf3D`, WebGL) — twenty-one Nova editions on a walnut board — `src/shelf3d/Shelf3D.jsx:1-45`; render-on-demand, texture-windowed, cheap-binding-before-paint (see file header) — drag to spin (`onPointerMove`, `Shelf3D.jsx:1220-1229`), tap-to-select then tap-again-to-open (`Shelf3D.jsx:1232-1249`), edge-guard so a back-swipe from 12px of the screen edge is never stolen (`Shelf3D.jsx:1209`)
- [ ] F10 — 3D fallback notice ("3D shelf unavailable on this device") — `Library.jsx:211-213`
- [ ] F11 — FLIP morph between grid and shelf view (`useShelfFlip`) — `Library.jsx:75-100`
- [ ] F12 — Detail: back-to-library text action — `Library.jsx:432-439`
- [ ] F13 — Detail: loading/"Opening…" and error/"retry" states — `Library.jsx:356-364`
- [ ] F14 — Detail: cover art panel (image or generated cloth) — `Library.jsx:450-461`
- [ ] F15 — Detail: title, author, provenance badge, updated date, echo count, provenance note — `Library.jsx:370-379`
- [ ] F16 — Detail: "Open source ↗", "⧉ Original", "✦ See in Galaxy" chip row — `Library.jsx:380-388`
- [ ] F17 — Detail: Concepts / People & works / Topics / Also linked chip rows — `Library.jsx:390-393`, `ChipRow` component `Library.jsx:52-68`
- [ ] F18 — Detail: "What Nova holds" — the woven page body via `ChatMarkdown` — `Library.jsx:419-427`
- [ ] F19 — Detail: "Connected in your second brain" related-sources rail — `Library.jsx:401-417`
- [ ] F20 — Stage (3D-open mode): parked volume tumbles into the detail pose while text rises beside/below it; wide screens split 52%/48%, narrow screens stack — `Library.jsx:503-576`, tumble math in `Shelf3D.jsx:825-870`
- [ ] F21 — "Drag or scroll the shelf · tap a volume to open it" hint when nothing is open — `Library.jsx:569`
- [ ] F22 — The tint — the whole Library wrapper recolours (`--nv-lib-acc`/`--nv-lib-ground`/`--nv-lib-edge`) to the open volume's own accent, contrast-checked against the pane — `src/shelf3d/useLibraryTint.js:41-77`, applied in `Library.jsx:610`

### Overlays & sheets this screen opens
- IngestModal ("Add to your vault") — trigger: "＋ Add source" chip —
  `Library.jsx:121` → `src/IngestModal.jsx` (transcript/article paste, video-link
  fetch, person research, file attach — `IngestModal.jsx:24-77`).

### States: loading / empty / offline / error / demo
- `libraryHeaderLabel`: connected-with-count / offline-honest / "Connect a
  backend in Settings" — `src/vals/valsLibrary.js:178-180`.
- Per-item detail: loading / error-with-retry / loaded — `valsLibrary.js:130-133`.
- 3D unavailable: falls back to CSS spines, self-announcing — `Library.jsx:38-43,210-213`.
- No offline-specific banner beyond the header label (no demoMode branch seen
  inside Library.jsx itself; demo data flows through the same `liveLibrary` state).

### Motion present
- `shelfIn` staggered entrance per cover, capped at 700ms delay — `valsLibrary.js:111`.
- FLIP transform/opacity animation on grid↔shelf toggle, 520ms
  `cubic-bezier(.32,.72,0,1)` — `Library.jsx:88-94`.
- Hover lift on covers/spines (`translateY`/`scale`) — `Library.jsx:224-228`.
- 3D shelf: free three-axis "tumble" open animation with exact eased endpoints
  — `Shelf3D.jsx:33-39,825-870`; render-on-demand frame budget documented at
  `Shelf3D.jsx:9-16`.
- Related-rail entrance stagger, 60ms steps — `Library.jsx:407`.
- Detail fadeUp entrance — `Library.jsx:444,556`.

### Prior findings (22 Sep report)
- #16 "Stash and Library repeat one action pill down the whole list" — **partially
  done** per the report's own §1b line ("search input + cover scrim done
  (`be14df3`); whole-row tap target claimed"). Confirmed in source: the search
  placeholder is now short ("Search", `Library.jsx:113`, comment cites finding
  16 by number) and jacketed covers carry a bottom gradient scrim
  (`Library.jsx:292-296`, comment references "apple-design §12, vibrancy").
  Whole-row-as-tap-target for the grid/shelf cards does read as already true
  here (`onClick` is on the whole `Interactive` cover, `Library.jsx:223`) — this
  is Library's half of the finding; Stash's own list still uses a separate
  "Open ↗" pill per row (see Stash section below), so that half is unresolved.

### First-look notes from source (UNVERIFIED — no pixels seen)
- The file is dense with "why" comments explaining prior regressions (flash
  rebuilding the renderer, canvas resize mid-tumble, etc.) — a sign this
  screen has already been hardened against several real bugs; a redesign pass
  should read `Library.jsx:596-635` before touching the open/close wiring.
- Two raw-glyph toggle icons (▦/▥) sit beside the house `Chip` components
  (`Library.jsx:124`) rather than using an icon system — a small inconsistency
  against the rest of the row's controls.
- The 3D shelf is a genuinely bespoke object (per §2b r7's spirit) — likely one
  of the app's stronger surfaces rather than a "plain box" candidate.

---

## Ops (incl. Org Map) — `ops` — `src/screens/Ops.jsx` (349 lines), vals `src/vals/valsOps.js` + `src/vals/valsOrgMap.js`

**Purpose:** the machinery made visible — the human gate, the Org Map of ten
agent beings, the skill registry, the Forge, the overnight queue, Mac sessions,
and the receipts stream. Nothing here is invented; everything traces to
records/heartbeats.

**Reached by:** System nav group, `mkNav('Operations', 'XIV.', 'ops')` —
`src/vals/valsChrome.js:223`. Also: `v.goInboxFromOps` reverses the direction
(Ops → Inbox, `Ops.jsx:193`, `valsOps.js:183`); Ambient mode's `goAmbient`/
`exitAmbient` live in the same vals file (`valsOps.js:249-250`) since Ambient
reads the same ops state as a wall display.

**Modes / sub-views / sections (in render order):**
1. Empty state when `!opsLive` (demo mode or no sync yet) — `Ops.jsx:175-182`
2. Human gate banner — `Ops.jsx:193-199`
3. The Org Map (3D, lazy-loaded) or its "map arrives with the next sync" line — `Ops.jsx:201-210`
4. Topology row: Channels column / core glyph / Connections column / In-conversation list + legend — `Ops.jsx:212-248`
5. The skill map (department cards) — `Ops.jsx:251-268`
6. The Forge (build-a-sandbox-artifact composer + job list) — `Ops.jsx:270-302`
7. Overnight queue (research-tonight composer + item list) — `Ops.jsx:304-330`
8. "Working on this Mac" — cross-project Claude Code session tracker — `Ops.jsx:115-172,332`
9. The stream (receipts ledger) — `Ops.jsx:334-346`
10. Ambient wall mode — a separate render path off the same `valsOps` state (`isAmbient`, `valsOps.js:248-284`) — not rendered by `Ops.jsx` itself (no `<Ambient>` JSX found in this file; it is presumably a sibling screen — noted, not traced further, out of this file's scope)

**Idiom branches:** two inline font-size bumps only — `isAppleStyle() ? '14px' : undefined` on the gate line and each conversational agent's label — `Ops.jsx:197,231`. No structural cupertino branch.

### Features (top to bottom as rendered)
- [ ] F1 — Empty-state numeral + explanatory line when Ops has no live data — `Ops.jsx:176-180`
- [ ] F2 — Screen head "XIV. OPERATIONS" + "records + heartbeats · nothing invented" meta — `Ops.jsx:187-190`
- [ ] F3 — The human gate — pending count, gate line, "Open Inbox →" — tap — `Ops.jsx:193-199` — `goInboxFromOps` → `navigate('inbox')`
- [ ] F4 — Org Map 3D scene (see cluster below) or its offline line — `Ops.jsx:203-210`
- [ ] F5 — Channels column (PWA/Voice/Siri/Telegram) with live/working pulse dots — `Ops.jsx:217`, data `valsOps.js:189-194`
- [ ] F6 — Core glyph (`NovaCore`, 86px) between the two columns — `Ops.jsx:57-63,218`
- [ ] F7 — Connections column (Obsidian/Calendar/Reminders/Health/Todoist/ElevenLabs) — `Ops.jsx:220`, data `valsOps.js:195-202`
- [ ] F8 — "In conversation" list — tap a row to expand its `AgentDetail` (skills owned + last receipts) — `Ops.jsx:223-247` — tap — `a.toggle` → `app.toggleOpsAgent` (`App.jsx:6983`)
- [ ] F9 — Legend row (ran today / last 2 days / gone quiet / never run, dot colours) — `Ops.jsx:238-243`
- [ ] F10 — "N things filed into the vault today" line — `Ops.jsx:244-246`
- [ ] F11 — Skill map — department cards, each skill line tagged OBSERVE/PROPOSE/ACT — `Ops.jsx:251-268`, colour rule `valsOps.js:40-45`
- [ ] F12 — The Forge input + "Build it" button — type — `Ops.jsx:277-284` — `v.forge.start` → `app.startForgeBuild` (`App.jsx:4609`)
- [ ] F13 — Forge job rows: state tag, title, cost (only if >$0), Stop action, summary line — `Ops.jsx:288-299` — `j.stop` → `app.stopForgeBuild` (`App.jsx:4624`)
- [ ] F14 — Overnight queue input + Queue button — `Ops.jsx:311-318` — `overnightAdd` (`App.jsx:7046`)
- [ ] F15 — "Run now ▸" text action (only when items are queued) — `Ops.jsx:307-309` — `overnightRunNow` (`App.jsx:7070`)
- [ ] F16 — Overnight item rows: status tag, question, note, when, remove (✕, queued items only) — `Ops.jsx:319-329` — `remove` → `app.overnightRemove` (`App.jsx:7065`)
- [ ] F17 — Overnight empty-state copy — `Ops.jsx:320`
- [ ] F18 — Working on this Mac: live pulse dot + serif summary line + optional note — `Ops.jsx:128-135`
- [ ] F19 — Per-project groups with per-session rows (name, plain-English status, when, Show me / Close it actions, inline close-confirm) — `Ops.jsx:137-167` — `r.show`→`app.showMacSession` (`App.jsx:7013`), `r.confirmClose`→`app.closeMacSession` (`App.jsx:7030`)
- [ ] F20 — The stream — newest-first receipts: when/kind tag/title/status — `Ops.jsx:335-346`
- [ ] F21 — Stream empty state ("Nothing on the ledger yet.") — `Ops.jsx:337`

#### Org Map cluster (`src/orgmap/` + `src/agentWorld/`)
- [ ] OM1 — Scene: seven districts on a ring (Train/Knowledge/Logistics/Fuel/Platform/Money/Mind) around Nova's core — `src/agentWorld/habitat.js:26-34`, drawn by `src/orgmap/scene.js`
- [ ] OM2 — Ten beings standing on their districts: Commander (Logistics), Coach (Train), CFO (Money), Guardian (Platform), Researcher/Watcher/Librarian (Knowledge, 3 beings), Meal Prep (Fuel), Leader & Practice (Mind, 2 beings) — `src/agentWorld/beings.js:120-156`
- [ ] OM3 — Each being's habitat set (bench/lathe/lamp per district, never a bare box) — `src/agentWorld/habitat.js:1-20`
- [ ] OM4 — Walking beings — polyline walks along the habitat's lane graph, obstacle-avoiding — `src/orgmap/walk.js:11-33`
- [ ] OM5 — Acts — 20+ named gesture frames per act (work/wait/rest/etc.), interruption eases out rather than cutting — `src/agentWorld/acts.js:42-293`
- [ ] OM6 — The Life engine — pure seeded state machine deciding each being's pose/act every tick, deterministic from `seed + day` — `src/agentWorld/life.js:1-14,328-358`; zero-model, zero-network, held by `server/test/agentWorldNoModel.test.js`
- [ ] OM7 — Waiting markers — a bobbing marker with the real waiting-count over any being with something for him — `src/orgmap/scene.js` MARKER_SCALE, `scene.js:36`
- [ ] OM8 — Tap a being → detail card: district, one-line status (`beingLine`), its asks with timestamps, "and N more in the Inbox", last receipt, loop summary, per-loop list with its own state dot — `src/orgmap/OrgMap.jsx:32-82`, text logic `src/vals/valsOrgMap.js:26-68`
- [ ] OM9 — Marker list (keyboard/no-WebGL fallback) — every asking being as a pill button with its count, sorted busiest-first — `OrgMap.jsx:150-170`
- [ ] OM10 — "Your own notes" pill for the core's own unfiled count — `OrgMap.jsx:162-169`
- [ ] OM11 — Unfiled-kinds footnote line — `OrgMap.jsx:171`
- [ ] OM12 — WebGL-unavailable fallback line — `OrgMap.jsx:144-148`
- [ ] OM13 — Headline sentence above the scene — `OrgMap.jsx:136`, data `m.headline` (`valsOrgMap.js:121`)
- [ ] OM14 — Theme/Calm-aware rebuild via `MutationObserver` on `data-nv-theme`/`data-nv-calm` — `OrgMap.jsx:112-116`

### Overlays & sheets this screen opens
- None modal from Ops.jsx itself; the Org Map's card is an in-scene absolute-positioned panel, not a portal/sheet — `OrgMap.jsx:32-82`.
- (Adjacent, not opened by Ops: `src/Instruments.jsx`'s `Console` component
  backs the separate **Console** screen, key `console`, its own nav row
  `mkNav('Console', 'XVIII.', 'console')` — `valsChrome.js:194` — reached via
  `src/screens/ConsoleScreen.jsx:4,14,23`, not via Ops. Read per the file list
  regardless: five drawn instruments — Recovery/HRV band chart (`Instruments.jsx:67-115`),
  Today's 24-hour ring (`:128-174`), Steps-this-week bar chart with a floor
  line (`:178-248`), Training body figure via `Body3D` (`:264-296`), Fuel body
  figure in the "debt" palette (`:298-321`) — each with its own honest-absence
  state (`Absent`, `:46-54`) and a staggered 90ms-per-instrument reveal
  (`:335-341`).)

### States: loading / empty / offline / error / demo
- `opsLive`/`opsEmptyLine`: demo-mode says "live-only surface"; connected-but-
  no-sync says "next sync fills this in" — `valsOps.js:171-174`.
- Org Map: `live:false` with three distinct reasons (demo, no ops payload,
  ops present but map not yet synced) — `valsOrgMap.js:72-74`.
- Mac sessions: demo message / "Nova has not looked yet" / live error / live
  summary — `valsOps.js:115-126`.
- Forge/overnight: empty-state copy per list (`Ops.jsx:320`; no explicit forge
  empty copy — the job list simply renders nothing when `jobs.length === 0`).
- Skill map hidden entirely when `skillDepartments.length === 0` (`Ops.jsx:251`).

### Motion present
- Human-gate row and topology have no explicit animation; `AgentDetail` panel
  arrives via `nvRise var(--nv-dur-base) var(--nv-ease)` — `Ops.jsx:69` (comment
  cites "recorded 23 Sep… §2b r7").
- Org Map section entrance `nvRise` — `OrgMap.jsx:131`; card `nvRise` — `OrgMap.jsx:35`.
- Org Map scene itself: render-on-demand (idle = 0 frames), lamp fades ~0.6s,
  plaza pulse ~0.8s, no idle motion of its own beyond that — `habitat.js:13-17`;
  full walk/act motion is continuous only while a being is working/walking.
- Mac-sessions rows: `nv-stagger` class on the row list — `Ops.jsx:143`; pulse
  dot animation while `beating` — `Ops.jsx:146-148`.
- Overnight running item: `dotBlink 1.6s infinite` on its status tag — `Ops.jsx:323`.

### Prior findings (22 Sep report)
- #9 "Ops' agent dial is unreadable at 402px" — **done** (`036b2e7`). Confirmed
  live: the old radial fleet-ring/label dial is gone entirely — Ops.jsx's own
  comment says so explicitly ("The fleet ring that used to sit between the two
  topology columns is gone (his call, 25 Sep 2026)", `Ops.jsx:20-24`) and the
  screen now carries `calc(48px + env(safe-area-inset-top))` top padding with
  a comment citing "review finding 9" verbatim (`Ops.jsx:184-186`). The
  replacement is the Org Map (a scene + marker-pill list), not the "keep a dial
  of dots" alternative the report proposed — a different fix than suggested,
  but the underlying fault (unreadable labels at 402px) is resolved.

### First-look notes from source (UNVERIFIED — no pixels seen)
- This is now three screen-sized systems stacked on one route: the Org Map
  (3D scene), the Forge (a build console), and a Mac-session tracker — each
  substantial enough to be its own tab; scrolling past all three to reach the
  receipts stream at the bottom is a long page.
- The topology's two `TopoCol` columns (Channels/Connections) plus the core
  glyph read as the "systemic pattern" the 22 Sep report warned about
  elsewhere — small dot-and-label rows — though here they are secondary to the
  Org Map, not the main object.
- The skill map is a `grid-template-columns:repeat(auto-fill,minmax(280px,1fr))`
  of near-identical bordered cards (`Ops.jsx:254`) — same shape, same fill,
  differing only by department name; a bento-grid candidate per the global
  "defaults to not reach for" list, worth a design pass rather than a reflex fix.

---

## Money — `money` — `src/screens/Money.jsx` (155 lines), vals `src/vals/valsMoney.js`

**Purpose:** the CFO's screen — month spend summary, category budgets,
subscription radar, and the transaction ledger; every write rides the inbox rails.

**Reached by:** Vault nav group, `mkNav('Money', 'XII.', 'money')` —
`valsChrome.js:219`. No in-file cross-navigation.

**Modes / sub-views:** connected view vs. nothing rendered below the header
when `!moneyConnected` (demo mode) — `Money.jsx:31,152`.

**Idiom branches:** none found (`grep` for `structured`/`isAppleStyle` in this
file returns nothing).

### Features (top to bottom as rendered)
- [ ] F1 — Header + month `<select>` (only shown with >1 month) — `Money.jsx:19-28`
- [ ] F2 — "This month" card: spend total, delta vs last month, income line, Monthly report chip, Export-FY chip — `Money.jsx:35-46` — `cfoReportNow` (`App.jsx:5143`), `moneyExport`→`downloadMoneyExport` (`App.jsx:5187`)
- [ ] F3 — Feeds card: imports-folder copy, "Check folder now" chip, "📷 Scan statement/receipt" chip + hidden file input, scan error/question lines, "type it" hint — `Money.jsx:48-61` — `runMoneyImportNow` (`App.jsx:5129`), `onStatementScanFiles` (`App.jsx:5156`)
- [ ] F4 — By-category list, tap a row to set its budget via a native `window.prompt` — `Money.jsx:66-85`, prompt logic `valsMoney.js:34-39` — each row has a progress bar (over-budget turns warn-coloured) and a "last month $X"/"new this month" footnote
- [ ] F5 — Subscription radar: monthly-total meta, per-subscription cards (merchant, amount, cadence, next-expected label, optional price-rise tag) — `Money.jsx:88-109`
- [ ] F6 — Subscription empty-state copy — `Money.jsx:94`
- [ ] F7 — Ledger — Merchant input, Amount input, Spend/Money-in sign toggle chip, Add button — `Money.jsx:116-122` — `submitMoneyAdd` (`App.jsx:5087`)
- [ ] F8 — Ledger empty-state copy — `Money.jsx:124`
- [ ] F9 — "showing N of M · older in the export" cap note — `Money.jsx:127-128`, cap = 120 rows (`valsMoney.js:11`)
- [ ] F10 — Transaction rows: date, merchant+note, inline category `<select>` (edit-in-place) or text-action label, amount (colour by sign), remove (✕) — `Money.jsx:130-146` — `pickCategory`→`app.setMoneyCategory`, `remove`→`app.removeMoneyTransaction` (`App.jsx:5102`)

### Overlays & sheets this screen opens
- None (native `window.prompt` for budgets, `valsMoney.js:36`, is the only
  modal-like interaction, and it is a browser primitive, not a Nova sheet).

### States: loading / empty / offline / error / demo
- `moneyHeaderLabel`: demo / offline-last-known / loaded-with-count / "Loading…" — `valsMoney.js:81-87`.
- `moneyConnected` true when not-demo-and-(online-or-cached) — `valsMoney.js:90`.
- Ledger and subscription lists each have their own empty-state copy (`Money.jsx:94,124`).

### Motion present
- None found beyond shared `Interactive`/`Chip` press feedback; no explicit
  entrance animation in this file.

### Prior findings (22 Sep report)
- #2 "Gold is the app's default commit colour" — report names `money-cupertino.jpg`
  among the nine affected screens. Current source: Money's primary actions use
  `Chip tone="gold"` for "Monthly report" (`Money.jsx:43`) — gold still appears
  as a commit-style action here, so on this screen the finding reads
  **unresolved** even though the report's §1b table marks the overall finding
  "done" app-wide (`cb2ae8d`) — UNVERIFIED whether Money was covered by that
  commit or missed it.

### First-look notes from source
- The category-budget flow uses a native `window.prompt()` (`valsMoney.js:36`)
  — a plain OS dialog inside an otherwise designed surface.
- Category rows, subscription cards and ledger rows are three visually
  distinct list styles on one page — consistent internally, but no shared
  "row" object between them (UNVERIFIED whether intentional).

---

## Shopping — `shopping` — `src/screens/Shopping.jsx` (147 lines), vals slice of `src/vals/valsMisc.js`

**Purpose:** the vault shopping list as a checklist, grouped by supermarket-style category, swipe-to-check.

**Reached by:** Vault nav group, `mkNav('Shopping', 'VII.', 'shopping')` — `valsChrome.js:196`.

**Modes / sub-views:** three states of the "Clear all" control — idle text
action / armed confirmation / post-clear undo banner — `Shopping.jsx:39-63`.

**Idiom branches:** `isAppleStyle()` used once, only for the Add-button's
corner radius (16px vs 8px) — `Shopping.jsx:27`. Row layout itself (`SwipeRow`
+ `Interactive`) is identical in both idioms.

### Features (top to bottom as rendered)
- [ ] F1 — Header + live count label — `Shopping.jsx:11-12`
- [ ] F2 — Multi-line add textarea + "+ Add" button — type — `Shopping.jsx:16-31` — `submitShoppingAdd` (`App.jsx:3348`)
- [ ] F3 — Add-error line — `Shopping.jsx:32-34`
- [ ] F4 — Clear-all: post-clear "Cleared N items" banner with Undo/Dismiss — `Shopping.jsx:39-48` — `undoShoppingClear` (`App.jsx:3457`), `dismissShoppingClearUndo` (`App.jsx:3467`)
- [ ] F5 — Clear-all: armed confirmation ("Clear the whole list, ticked or not?") — `Shopping.jsx:49-58` — `confirmShoppingClear`→`app.clearShoppingList` (`valsMisc.js:128`)
- [ ] F6 — Clear-all: idle "Clear all" text action — `Shopping.jsx:59-63`
- [ ] F7 — Empty-state copy — `Shopping.jsx:65-68`
- [ ] F8 — Category groups, each an Eyebrow + rows (grouped `nv-pane` card in cupertino, discrete rows otherwise) — `Shopping.jsx:71-131`
- [ ] F9 — Swipe-right-to-check row (`SwipeRow`, label GOT IT/UNCHECK) — swipe — `Shopping.jsx:80-84`, `item.onToggle`→`app.toggleShoppingItem` (`App.jsx:3387`)
- [ ] F10 — Checkbox glyph (tap also toggles) — tap — `Shopping.jsx:93`
- [ ] F11 — Item name with qty prefix and recipe-amount badge — `Shopping.jsx:94-103`
- [ ] F12 — "from {source}" provenance line — `Shopping.jsx:104-106`
- [ ] F13 — "sorting into an aisle…" pending-category line — `Shopping.jsx:110-112`
- [ ] F14 — Quantity stepper (−/qty/+), stops row-tap propagation — tap — `Shopping.jsx:117-125` — `incQty`/`decQty`→`app.setShoppingQty` (`App.jsx:3416`)
- [ ] F15 — Done section: "Confirm completion — N collected" button — `Shopping.jsx:135-144` — `confirmShoppingCompletion` (`App.jsx:3399`)

### Overlays & sheets this screen opens
- None.

### States: loading / empty / offline / error / demo
- Empty state when there are zero categories (`Shopping.jsx:65-68`); no
  distinct offline/demo copy found in this screen file itself — header label
  logic lives in `valsMisc.js` (not fully traced beyond the grep already done).

### Motion present
- None beyond `SwipeRow`'s own swipe mechanics and shared `Interactive` hover/press states.

### Prior findings (22 Sep report)
- #2 "Gold is the app's default commit colour" — the report names
  `shopping-cupertino.jpg` explicitly among the nine screens. Current source:
  the "+ Add" button uses the plain `Button` component (no explicit gold
  override) — UNVERIFIED whether `Button`'s own default resolves to gold or
  accent post-fix; category Eyebrows are `tone="gold"` (`Shopping.jsx:73`) but
  that is a label, not a commit action, so likely out of scope for this finding.

### First-look notes from source
- The clear-all control's three states (idle/armed/undo) are a good example
  of "acted out, never stated" (§2b r7) already applied here.
- Category eyebrows are gold-toned labels (`Shopping.jsx:73`) purely for
  wayfinding, not action — worth confirming this reads as a label and not a
  call-to-action at a glance (UNVERIFIED, no pixels).

---

## Code (Claude Code) — `code` — `src/screens/ClaudeCode.jsx` (143 lines), vals slice of `src/vals/valsMisc.js`

**Purpose:** a direct chat line to Claude Code against either the Nova OS repo
or the vault, with read/edit access but no shell, plus a diff/commit/shelve
flow for uncommitted changes.

**Reached by:** Workspace nav group, `mkNav('Claude Code', 'IV.', 'code')` — `valsChrome.js:188`.

**Modes / sub-views:** connected vs not (`v.codeConnected`); diff panel shown
only when `codeChanges` exist and aren't clean; shelved-changes banner shown
when a shelf exists — `ClaudeCode.jsx:37,72`.

**Idiom branches:** none found in this file.

### Features (top to bottom as rendered)
- [ ] F1 — Screen head + "Read + edit files · no shell access" meta — `ClaudeCode.jsx:9-12`
- [ ] F2 — Title + "⚔ Spar — send the Breaker" chip, "+ New session" chip, "⇪ Add to vault" chip — `ClaudeCode.jsx:13-19` — `startSpar` (`App.jsx:5783`), `newCodeSession`→`app.newClaudeCodeSession` (`App.jsx:9833`), `openIngestModal`
- [ ] F3 — Console header: three status dots, workspace path (repo/vault), connection dot+label — `ClaudeCode.jsx:27-34`
- [ ] F4 — Uncommitted-changes panel: file count + branch, Show/Hide diff toggle, up-to-8 changed files listed (+"…and N more"), full diff `<pre>` when open, commit-message input + Commit + Shelve — `ClaudeCode.jsx:37-70` — `commitCodeChanges` (`App.jsx:9799`), `shelveCodeChanges` (`App.jsx:9810`)
- [ ] F5 — Read-only vault notice (vault workspace can't commit from here) — `ClaudeCode.jsx:58-59`
- [ ] F6 — Shelved-changes banner + Restore — `ClaudeCode.jsx:72-77` — `unshelveCodeChanges` (`App.jsx:9820`)
- [ ] F7 — Transcript: not-connected notice / empty-conversation notice / message list tagged BUILDER·BREAKER·SYSTEM·YOU / busy-dots indicator — `ClaudeCode.jsx:78-91`
- [ ] F8 — Message input + Run button — type/⏎ — `ClaudeCode.jsx:92-104` — `sendCode`→`app.doCode` (`App.jsx:9767`)
- [ ] F9 — Session card: Model `<select>` (raw), Workspace `Segmented` (Nova OS/Vault), session-active status line — `ClaudeCode.jsx:106-129` — `setCodeModel`, `setCodeWorkspace`
- [ ] F10 — "Can / can't" card: read/edit yes, remembers-until-new-session yes, no shell/Bash, review-before-trust reminder — `ClaudeCode.jsx:130-138`

### Overlays & sheets this screen opens
- IngestModal via "⇪ Add to vault" — `ClaudeCode.jsx:18` → `src/IngestModal.jsx` (same modal Library opens).

### States: loading / empty / offline / error / demo
- Not-connected: console shows "Connect a backend in Settings to talk to Claude here." — `ClaudeCode.jsx:80`.
- Connected-but-empty transcript: prompt copy — `ClaudeCode.jsx:83`.
- Diff panel only renders when `codeChanges && !clean` — `ClaudeCode.jsx:37`.

### Motion present
- `fadeUp` per transcript message — `ClaudeCode.jsx:86`.
- `dotBlink` busy indicator (3 dots, staggered 0/.2s/.4s) — `ClaudeCode.jsx:89`.
- Connected-dot pulse (`novaPulse 2s infinite`) — `ClaudeCode.jsx:31`.

### Prior findings (22 Sep report)
- #2 "Gold is the app's default commit colour" — report names `code-cupertino.jpg`.
  Current source: "⇪ Add to vault" is `Chip tone="gold"` (`ClaudeCode.jsx:18`)
  — this is an add/ingest action, not literally a commit button, but reads as
  the same "gold as default fill" pattern the finding describes; the actual
  Commit button in the diff panel uses the plain `Button` component
  (`ClaudeCode.jsx:66`) with no explicit tone override — UNVERIFIED what
  `Button`'s resolved default colour is post `cb2ae8d`.
- #12 "The PR rail hard-clips its third card mid-word" refers to Train, not
  Code — not applicable here despite superficial "console/diff" similarity.

### First-look notes from source
- The uncommitted-changes panel and the chat transcript are stacked in one
  scroll container with a `max-height:46%` cap on the diff panel
  (`ClaudeCode.jsx:43`) specifically to fix a prior 106px clipping bug (report
  finding referenced in the file's own comment, "measured 23 Sep") — this
  looks like a real fix already verified by measurement, not just claimed.
- Two raw `<select>` elements exist app-wide for model choice (here and in
  Settings' per-lane pickers) with no shared "house select" — same drift risk
  §2b r2 warns about for buttons.

---

## To-Do — `todos` — `src/screens/Todos.jsx` (127 lines), vals `src/vals/valsTodos.js`

**Purpose:** the vault To-Do page as a checklist; one list, three writers
(captures, this screen, Obsidian by hand), Todoist mirrored two ways.

**Reached by:** Vault nav group, `mkNav('To-Do', 'VIII.', 'todos')` — `valsChrome.js:197`.

**Modes / sub-views:** open groups by category (Work/Personal/Fitness/
Errands/Later, plus Unsorted) above a collapsed-looking Done section — `Todos.jsx:44-124`.

**Idiom branches:** `v.structured` (cupertino) renders one grouped `nv-pane`
card per category with hairline rows; the classic style renders a `nv-pane`
per item instead — `Todos.jsx:48,63`.

### Features (top to bottom as rendered)
- [ ] F1 — Header + open/done count label — `Todos.jsx:16-19`
- [ ] F2 — Add input + Add button, sync note beneath (Todoist/vault mirror status) — type/⏎ — `Todos.jsx:22-37` — `submitTodo`→`app.addTodoItem` (`App.jsx:4956`)
- [ ] F3 — "Nothing open" empty-state copy — `Todos.jsx:40-42`
- [ ] F4 — Category group headers with item counts — `Todos.jsx:46`
- [ ] F5 — Swipe-right-to-complete row (`SwipeRow`, label DONE) — swipe — `Todos.jsx:54-58` — `t.toggle`→`app.toggleTodoItem` (`App.jsx:4992`)
- [ ] F6 — Staleness hairline — a left inset shadow that deepens from 2 weeks to 6 weeks old, replacing a gold "Stale" badge — `Todos.jsx:63`, staleness math `valsTodos.js:61-66` (explicitly cites review finding 8/§2b rule 8 in the comment)
- [ ] F7 — Checkbox with an enlarged (44px) invisible tap target around a 21px visual box — tap — `Todos.jsx:70-76`
- [ ] F8 — Title on its own full-width line (fixed from the pre-23-Sep squeeze — finding #7) — `Todos.jsx:87`
- [ ] F9 — Category text-action (inline `<select>` when editing) — tap — `Todos.jsx:89-97` — `pickCategory`→`app.setTodoItemCategory` (`App.jsx:4981`)
- [ ] F10 — Age label, warms/opacity-shifts with staleness — `Todos.jsx:99`
- [ ] F11 — Done section header ("the compost loop sweeps these") — `Todos.jsx:111`
- [ ] F12 — Done rows: filled checkmark (tap to reopen), strikethrough text, age — tap — `Todos.jsx:113-121`

### Overlays & sheets this screen opens
- None.

### States: loading / empty / offline / error / demo
- `todosHeaderLabel`: demo / offline-last-known / loaded-counts / "Loading…" — `valsTodos.js:83-89`.
- Empty-open-list copy shown only when connected and loaded — `Todos.jsx:40`.

### Motion present
- None explicit beyond `SwipeRow` mechanics and shared press feedback.

### Prior findings (22 Sep report)
- #7 "To-Do squeezes the title to ~140px and breaks words mid-character" —
  **done** (`be14df3`). Confirmed live: title now on its own line at
  `font:500 15px` with `word-break:break-word` (`Todos.jsx:87`), category/badge/age
  demoted to a metadata line beneath it (`Todos.jsx:88-100`), and the raw URL
  wrap-to-nine-lines is fixed via `linkify()` turning a link into a
  `host ↗` chip rather than the full query string (`valsTodos.js:12-17`).
- #2 "Gold as default commit colour" — report calls out `todos-cupertino.jpg`
  specifically for "every one of three rows carries a gold `Stale` tag". That
  exact mechanism is gone — replaced by the staleness hairline (see F6 above,
  `valsTodos.js:52-58` comment explicitly names this as the finding-8/rule-8
  fix) — **done** for this screen.

### First-look notes from source
- This screen shows the most visible evidence of the 22 Sep review actually
  landing (two of its own comments cite the review by finding number).
- The Done section has no swipe/undo affordance to match the open list's
  swipe-to-complete — tapping the filled check to reopen is the only action.

---

## Notes — `notes` — `src/screens/Notes.jsx` (123 lines), vals `src/vals/valsNotes.js`

**Purpose:** the vault notes browser (search + type filter + reader), plus the
Daily Review's reflect composer when the reviewed page is the open note.

**Reached by:** Vault nav group, `mkNav('Notes', 'X.', 'notes')` — `valsChrome.js:199`.
Also reached indirectly from many other screens' "open in Notes" links: Library
detail chips (`app.selectNote`, `valsLibrary.js:123,165`), Ops has no direct
link, Galaxy's "Open" on a note-type star (`valsMisc.js:454-455`).

**Modes / sub-views:** list+reader split (`gridNotes`) — list card always
present; reader pane shows either an open note or (implicitly) nothing
special when none is open (no explicit "select a note" empty state seen in
this file, though `openNoteTitle` will read "Loading…" or a demo title even
with nothing manually opened — likely defaults to the first note).

**Idiom branches:** `isAppleStyle()` used once, for the "Generate a prompt"
reflect-composer font — `Notes.jsx:81`. No structural cupertino branch.

### Features (top to bottom as rendered)
- [ ] F1 — Screen head + live count label — `Notes.jsx:11-12`
- [ ] F2 — Search input — type — `Notes.jsx:17-24`
- [ ] F3 — Type-filter Rail (scrolling chip row with edge fade, replacing the
  18-chip wrapping wall) — `Notes.jsx:30-37`, `Rail` component in `src/Controls.jsx`
- [ ] F4 — Note list rows: title, type tag, date, intent-prefetch on
  pointerdown — tap/pointerdown — `Notes.jsx:40-45` — `n.select`→`app.selectNote`, `n.warm`→`app.ensureNoteDetail`
- [ ] F5 — Reader: type eyebrow, title (serif h2), meta line (date/backlinks) — `Notes.jsx:49-51`
- [ ] F6 — "▶ Watch source" link (video-sourced notes only) — `Notes.jsx:52-54`
- [ ] F7 — Studio pipeline row (idea-type notes only): status chip advances
  seed→outlining→scripting→shipped, "Draft outline" chip, "◐ Tonight"
  overnight-queue chip — `Notes.jsx:55-61` — `advance`→`app.advanceIdeaStatus` (`App.jsx:4816`), `outline`→`app.draftIdeaOutline` (`App.jsx:4833`), `outlineTonight`→`app.queueIdeaOutlineOvernight` (`App.jsx:7057`)
- [ ] F8 — Note body paragraphs — `Notes.jsx:63-65`
- [ ] F9 — Today's review reflect card (only when the open note is today's
  reviewed page): concept summary, Reflect/Close toggle, "✦ Generate a prompt",
  reflection textarea, Save — `Notes.jsx:68-108` — `generateReviewReflectPrompt` (`App.jsx:4155`), `saveReviewReflection` (`App.jsx:4176`)
- [ ] F10 — "Linked in Galaxy" chip row — tap — `Notes.jsx:111-118` — `l.go`

### Overlays & sheets this screen opens
- None (the reflect composer is inline, not a sheet).

### States: loading / empty / offline / error / demo
- `notesHeaderLabel`: live-count vs demo-count — `valsNotes.js:142`.
- Note detail: "Loading…" while fetching, error copy with "tap it again to
  retry" on failure, otherwise the real paragraphs — `valsNotes.js:176-180`.
- Daily review: distinct copy for connected-with-page / connected-empty-vault
  ("Add some Concepts or Topics…") / offline ("returns on the next sync") —
  `valsNotes.js:106-112`.

### Motion present
- None explicit in this file beyond shared `Interactive`/`Rail`/`Chip`.

### Prior findings (22 Sep report)
- #11 "Notes clips a wall of 18 identical chips mid-row" — **done** (`be14df3`,
  "the `Rail`"). Confirmed live: the filter row is now a `Rail` (scrolling,
  edge-faded) rather than a wrapping grid, and each chip carries the type's
  own hue plus its count (`Notes.jsx:30-37`, `valsNotes.js:151-157`, comment
  explicitly cites "23 Sep 2026" and the old clipping bug).
- #2 "Gold as default commit colour" — no gold-filled primary button found in
  this screen file (the Save-reflection button uses `tone="violet"`,
  `Notes.jsx:100`) — not applicable here.

### First-look notes from source
- The Studio pipeline row and the reflect composer are two quite different
  "extra panel on an idea/reviewed note" patterns living side by side in the
  same reader — worth checking they read as clearly separate features rather
  than one blurred block (UNVERIFIED, no pixels).

---

## Journal — `journal` — `src/screens/Journal.jsx` (115 lines), vals slice of `src/vals/valsNotes.js`

**Purpose:** a daily journal — a composer with an optional generated prompt,
and entries grouped by day with a category filter.

**Reached by:** Vault nav group, `mkNav('Journal', 'XI.', 'journal')` — `valsChrome.js:218`.

**Modes / sub-views:** category filter (all/personal/training/system) —
`Journal.jsx:53-56`; per-day expand/collapse — `Journal.jsx:69-108`.

**Idiom branches:** `v.structured` swaps the day card's class/padding
(`nv-pane` vs a hand-rolled bordered box) — `Journal.jsx:62`. No other branch.

### Features (top to bottom as rendered)
- [ ] F1 — Header + live count label — `Journal.jsx:11-12`
- [ ] F2 — Composer: "✦ Generate a prompt" chip, generated prompt line, entry
  textarea, save error line, Save entry button — type — `Journal.jsx:18-43` —
  `generateJournalPrompt`→`app.generateJournalPrompt`, `submitJournalEntry`→`app.submitJournalEntry` (`App.jsx:4218`)
- [ ] F3 — Loading/empty copy ("Loading your journal…" / "No journal entries
  yet…") — `Journal.jsx:47-49`
- [ ] F4 — Category filter chips (ALL/PERSONAL/TRAINING/SYSTEM) — `Journal.jsx:54-56`
- [ ] F5 — Empty-in-category copy — `Journal.jsx:58-60`
- [ ] F6 — Day row: serif date label (larger + accented for today, with a
  "Today" tag), entry-count dots (one per entry, capped at 6 + "+N"), house
  Chevron, tap to expand — tap — `Journal.jsx:69-89` — `d.toggle`→`app.toggleJournalDay` (`App.jsx:4244`)
- [ ] F7 — Expanded day: per-section time, optional category Tag, optional
  heading (wikilink stripped + "Concept reflection —" relabel), text — `Journal.jsx:96-107`

### Overlays & sheets this screen opens
- None.

### States: loading / empty / offline / error / demo
- `journalLoaded` null = "still loading" vs empty array = "no entries yet" —
  distinguished explicitly (`valsNotes.js:204`, `Journal.jsx:48`).
- `journalHeaderLabel`: live-count vs "Connect a backend in Settings" — `valsNotes.js:192`.

### Motion present
- Expanded-day content: `nvRise var(--nv-dur-base) var(--nv-ease)` — `Journal.jsx:96` (comment: "recorded 23 Sep, the chevron turned… §2b r7: a change is acted out").

### Prior findings (22 Sep report)
- #14 "Journal is an archive of his days rendered as a date table" — **done**
  (`be14df3`). Confirmed live, feature-by-feature against the report's own
  Before/After table: ISO date → serif `Tue 22 Sep` with today enlarged/accented
  (`Journal.jsx:73-76`); bare `N entries` → one dot per entry
  (`Journal.jsx:79-86`); raw `▼` → the house `Chevron` (`Journal.jsx:87`,
  imported from `Controls.jsx`); gold `Save entry` → the plain `Button`
  component with no gold override (`Journal.jsx:36-42`) — the report's
  proposed fix was `Pill` at `--nv-acc`, but the shipped fix (a plain `Button`)
  achieves the same "not gold" outcome.

### First-look notes from source
- The "✦ Generate a prompt" chip is `tone="#cbb6f2"` — a literal hex colour
  passed as a `tone` prop rather than a named token (`Journal.jsx:19`) — a
  small drift from the `--nv-*` token discipline the project otherwise holds to.

---

## Stash — `stash` — `src/screens/Stash.jsx` (90 lines), vals slice of `src/vals/valsMisc.js`

**Purpose:** categorised links to come back to (restock products, references),
backed by the vault's Stash page.

**Reached by:** Vault nav group, `mkNav('Stash', 'XIII.', 'stash')` — `valsChrome.js:220`.

**Modes / sub-views:** add-link form (connected only) above category groups.

**Idiom branches:** `isAppleStyle()` swaps the "Open ↗" link's styling between
a pill-shaped accent button and a mono bracketed link — `Stash.jsx:68-70`. No
structural branch.

### Features (top to bottom as rendered)
- [ ] F1 — Header + live count label — `Stash.jsx:17-18`
- [ ] F2 — Intro copy line — `Stash.jsx:21-23`
- [ ] F3 — Add-link form: Category input (with datalist of existing
  categories), Name input, URL input, Note input, "Stash it" button, error
  line — type — `Stash.jsx:26-46` — `submitStashAdd`→`app.addStashItem`
- [ ] F4 — Empty-state copy — `Stash.jsx:49-52`
- [ ] F5 — Category group headers with item counts — `Stash.jsx:57`
- [ ] F6 — Item row: name + host/note subline (link wraps the text), separate
  "Open ↗" link pill, remove (×) with inline ask/confirm — tap — `Stash.jsx:60-83`
  — `it.askRemove`/`it.remove`→`app.removeStashItem`

### Overlays & sheets this screen opens
- None (no `openIngestModal` reference found in this file — Stash does not
  open the Ingest modal; only Library and Code do, per grep of `openIngestModal`
  across `src/screens/*.jsx`).

### States: loading / empty / offline / error / demo
- `stashHeaderLabel`: demo / offline-last-known / loaded-count / "Loading…" — `valsMisc.js:527-533`.
- `stashConnected` hides the add-link form entirely in demo mode — `Stash.jsx:25`.

### Motion present
- None explicit in this file.

### Prior findings (22 Sep report)
- #16 "Stash and Library repeat one action pill down the whole list" — the
  report's §1b line marks this **partially done** ("search input + cover scrim
  done… whole-row tap target claimed"). Stash has no search input (that fix
  applied to Library only) and still renders a separate "Open ↗" pill per row
  as its own link (`Stash.jsx:67-70`) rather than making the whole row the tap
  target — the name/host block is a separate `<a>` from the Open pill
  (`Stash.jsx:61-70`), so **this half of the finding reads unresolved on
  Stash** specifically, even though the report marks the finding overall as
  mostly done.
- #2 "Gold as default commit colour" — report names `stash-cupertino.jpg`.
  Current source: "Stash it" uses the plain `Button` (`Stash.jsx:42`, no gold
  override); the category Eyebrow is `tone="gold"` (`Stash.jsx:27`) as a label
  only — the literal submit-button gold fill appears resolved here.

### First-look notes from source
- Two separate `<a>` elements per row (name block + Open pill,
  `Stash.jsx:61,67`) both point at the same URL — a genuine double-tap-target
  redundancy, and the concrete evidence behind finding #16's "whole row should
  be the tap target" recommendation still applying to this screen.

---

## Galaxy — `galaxy` — `src/screens/Galaxy.jsx` (57 lines), vals slice of `src/vals/valsMisc.js` + layout `src/galaxyLayout.js`

**Purpose:** a canvas force-directed graph of the whole vault (pages as stars,
wikilinks as edges) — pinch/zoom, tap to inspect, legend filters by type.

**Reached by:** Workspace nav group, `mkNav('Memory Galaxy', 'III.', 'galaxy')`
— `valsChrome.js:187`. Also opened as a destination from Library's "✦ See in
Galaxy" chip (`valsLibrary.js:167`, `app.navigate('galaxy')`) and Notes'
"Linked in Galaxy" chips (target resolution in `valsMisc.js:451-457`).

**Modes / sub-views:** zoomed vs not (`galaxyZoomed`), a star selected vs not
(`galaxySelOn`), an active type filter vs not (`galaxyFilterOn`), plus overlay
toggles (Recency, Compost) — `Galaxy.jsx:24-53`.

**Idiom branches:** none found in this file.

### Features (top to bottom as rendered)
- [ ] F1 — Screen head + stats label — `Galaxy.jsx:11-12`
- [ ] F2 — Title line — `Galaxy.jsx:15`
- [ ] F3 — Legend chips (type filters) — tap toggles fade-others / tap-again
  clears — `Galaxy.jsx:17-23` — `item.toggle`
- [ ] F4 — "Clear filter" text action (shown only while a filter is active) — `Galaxy.jsx:24-26`
- [ ] F5 — Overlay chips (Recency, Compost) — `Galaxy.jsx:31-33` — `o.toggle`
- [ ] F6 — The canvas — pointer down/move/up for pan+pinch, click to select a
  star — drag/pinch/tap — `Galaxy.jsx:36-38` — `galaxyPointerDown/Move/Up`, `galaxyClick`
- [ ] F7 — "Tap a star · pinch to zoom" hint (hidden once zoomed) — `Galaxy.jsx:39`
- [ ] F8 — "Reset view" chip (shown only while zoomed) — tap — `Galaxy.jsx:40-42` — `galaxyResetView` (`App.jsx:6158`)
- [ ] F9 — Selection card: type eyebrow, label (serif), description, Open
  button, Dismiss — `Galaxy.jsx:43-53` — `galaxyOpen`, `galaxyClear`

### Overlays & sheets this screen opens
- None — the selection panel is an absolutely-positioned in-canvas card, not
  a portal/sheet (`Galaxy.jsx:44`).

### States: loading / empty / offline / error / demo
- `liveGraphOn` gates real-vault-graph vs presumably a smaller/mock graph
  (`valsMisc.js:57-60`); no explicit "empty vault" copy seen in the screen file
  itself.

### Motion present
- Selection card: `fadeUp var(--nv-dur-base) var(--nv-ease)` — `Galaxy.jsx:44`.
- Legend-chip opacity transition, 0.18s — `Galaxy.jsx:20`.
- Layout itself is a one-time seeded force simulation (220 ticks) computed
  once, not animated per frame — `src/galaxyLayout.js:33,56` ("zero per-frame
  cost" per the file's own header comment, `galaxyLayout.js:1-9`).

### Prior findings (22 Sep report)
- No numbered finding in the six assigned (#2,7,9,10,11,14,16) names Galaxy
  specifically; #2's gold-commit-colour sweep did not list a Galaxy screenshot
  among its nine — not applicable here. No Galaxy-specific finding to verify.

### First-look notes from source
- The canvas is a genuinely bespoke rendered object (force-laid-out graph, not
  a generic list) — squarely the kind of "purpose-made object" the 22 Sep
  report's verdict (§1) praised elsewhere in the app, e.g. the Voice core and
  the muscle-volume bars.
- Legend + overlay chips are two visually similar rows with different
  semantics (filter vs display-overlay) stacked directly on top of each other
  (`Galaxy.jsx:17,30`) — worth checking they read as distinct at a glance
  (UNVERIFIED, no pixels).

---

## Not covered

- **`src/CalendarView.jsx`** — read in full, but opened only from
  `src/vals/valsMission.js:1222` (Home/Mission Control), not from any screen
  assigned here. Briefly: a read-only 14-day agenda sheet, day-grouped, with a
  calendar-colour tag per event (`CalendarView.jsx:5-6,52`) — out of scope,
  belongs to whichever survey covers Home.
- **`src/RepertoireBook.jsx`** — grepped; Library does not reference it. Per
  the brief, "Train, see survey B" — not read further.
- **`src/shelf3d/coverArt.js` (405), `edition.js` (337), `bookRig.js` (208),
  `materials.js` (269), `artPalette.js` (65)** — sampled via export lists and
  header comments, not read line-by-line, given size vs. budget; their public
  surface (contrast-safe tinting, canvas texture painting, rig construction,
  shared PBR materials) is described at feature level in the Library section.
- **`src/orgmap/scene.js` (1219), `src/agentWorld/beings.js` (2417),
  `habitat.js` (1141), `life.js` (789)** — the four largest Org Map files;
  sampled via header comments, export lists and targeted greps (being roster,
  district layout, life-engine determinism) rather than read end-to-end
  (~5,500 combined lines). `OrgMap.jsx` and `valsOrgMap.js` (the screen-facing
  files) were read in full; OM1–OM14 above are drawn from those plus these
  four files' documented contracts.
- **Ambient wall mode** (`isAmbient`, `valsOps.js:248-284`) — its view model
  was read, but no `Ambient.jsx` screen file was in the given file list, so
  its rendering could not be inspected.
- **`src/vals/valsMisc.js` lines ~100-420** (Voice concept-preview vals) —
  skimmed only far enough to confirm the file also feeds Shopping, Code,
  Galaxy, Stash and Console/Instruments; the Voice portion is out of scope.

---

**Line ranges read in full, as required:** `src/screens/Settings.jsx` 1–918;
`src/screens/Library.jsx` 1–651.
