# Nova — capability baseline (9 September 2026)

Written from the codebase **before viewing any @darwinaiassistant material**,
so the comparison that follows is against what Nova actually does — not
against a memory coloured by having just watched someone else's demo. This is
the same discipline the WiseTwinz study used; that study's baseline
(`design/NOVA-CAPABILITY-INVENTORY.md`, 19 Aug) is left untouched as the
historical record it is.

**Verified counts, this session:** 177 server libs · 29 routers · 20 screens ·
15 view-model modules · 32 scheduler-bearing libs · 192 test suites (1,296
tests, all green) · 14 declared capabilities · 8 model lanes.

Growth since the 19 Aug baseline: 105 → 177 libs, 21 → 29 routers, 17 → 20
screens, 25 → 32 schedulers. Nova is roughly 70% larger than the last time it
was measured against a creator.

---

## 1. The declared capability surface

`server/lib/capabilities.js` is the machine-readable contract — the same
source feeds the planner's prompt and the answer he gets when he asks what
Nova can do, so the two cannot drift. Fourteen capabilities, each with a cost
ceiling (not an estimate — a ceiling, because a number shown before approval
must be one that cannot be exceeded):

| id | agent | what it does | ceiling | delegable |
|---|---|---|---|---|
| `watch` | Watcher | one video → transcript + verdict, filed pending | $3.00 | yes |
| `weave` | Librarian · weave | a video → every concept/person woven into the vault as drafts | $25.00 | no |
| `study` | Study | enumerate a creator's body of work, transcribe within budget, compare against Nova's inventory | $1.50 | yes |
| `research` | Researcher | answer from the open web with citations, or read a link | $1.00 | yes |
| `book` | Librarian | a book researched and woven into the vault | $25.00 | yes |
| `paper` | Researcher → Coach | a study judged against his CURRENT block, honest when he isn't the population | $3.00 | no |
| `brief` | Briefing | a topic researched from several angles, written up to be read or performed | $6.00 | no |
| `coach` | Coach | training/nutrition answered with full logged history; proposes program changes | $1.00 | no |
| `browse` | Hands · browser | Nova's own Chrome: open, read, fill — stopping before buy/send/post/delete | $2.00 | no |
| `leader` | Leader | leadership as daily practice, from HIS material | $1.00 | no |
| `code` | Claude Code | read and change Nova's own codebase, diff before commit | $1.50 | no |
| `capture` | Inbox | classify a captured thought, route it to the right vault surface | $0.50 | no |
| `ask` | Ask Nova | answer from the vault, read-only | $0.50 | no |
| `play` | Nova | find a named video and open it playing | $0.50 | no |

**Note for the study:** `study` already exists and is described as exactly the
task being run manually here — "enumerate a creator's whole body of work,
transcribe what fits the budget, and compare it against Nova's own inventory."
Its implementation (`server/lib/studyLane.js`) is **YouTube-only**:
`CHANNEL_RE` matches `youtube.com/(@|c/|channel/|user/)` and `fetchTranscript`
relies on `--write-auto-subs`, which Instagram does not serve. This is a known
gap before a single video has been watched.

## 2. Model lanes

`startMessage` (Claude Code tab — real file read/write, deliberately no Bash) ·
`startAskNova` · `startAskCoach` · `startAskLeader` · `startQuickSession` ·
`startGreeting` · `startSessionDebrief` · `startBreaker` (sandboxed sparring).

Every model-based agent prepends the shared `NOVA_LENS` from
`server/lib/lens.js` — one reasoning spine, changed only in lockstep with
NOVA-METHOD.md's "Runtime lens" section.

Governing them: `modelPrefs.js` (the model board — every lane that spawns a
CLI, with per-lane model choice), `modelChoice.js` (a gate before a
reasoning-heavy job runs), `spawnBoundary.js` (what a spawned CLI may touch),
`settle.js` (a watchdog so a model child that never exits cannot strand its
job).

## 3. The named agents

Coach (fitness, deepest) · Researcher (web, citations required) · Watcher
(video → verdict/notes) · Studio (content/ideas) · CFO (money) · Commander
(planning) · Guardian (integrity) · Scout (patterns) · Librarian (books,
weaves) · Leader (leadership) · Distiller (captures → knowledge) · Brain Week ·
Forge (build department) · Study.

## 4. Domain surfaces, by area

**Training / the Coach.** Deterministic engines throughout — `coach.js`
(progressions incl. RPE-autoregulated and the OUTGROWN rule), `coachPlan`,
`coachCadence` (the voice that speaks first), `coachReflection` (nightly),
`coachProgramAudit` (weekly proof it looked), `coachProgramReview`,
`coachKnowledge` (its own library), `coachTurn` (one function, two mouths),
`trainingAnalytics`, `trainingBlocks` (periodization), `trainingCheck`,
`trainOverview`, `progressionTunes` (his corrections made standing),
`exercises`, `exerciseState`, `exerciseVideos`, `muscles` + `anatomy` (the
muscle vocabulary and the Coach's prose anatomy), `formCheck` (his own lifts
read back rep by rep), `injuryLog`, `workouts`, `workoutSessions`,
`workoutCarryover`, `makeupDay`, `sessionDraft`, `sessionNotes`,
`weeklyDebrief`, `debriefMemory`, `fitnessGoals`, `rotation`.

**Fuel.** `nutritionFacts` (real numbers, not remembered), `nutritionLog`,
`nutritionSnapshot`, `foodLog`, `foodHistory`, `foodPatterns`, `foodSuggest`,
`fuelContext`, `fuelCross` (training × fuel joins — his non-negotiable),
`recipes`, `recipePhotos`, `tweakRecipe`, `mealPrep`, `portions`,
`shoppingList`, `labelMacros`, `barcodeLookup`, `scanFood`, `scanRecipe`,
`intake` (targets derived by code, Mifflin-St Jeor).

**Health.** `healthData`, `healthDrops` (store-and-forward, so the Mac need
not be awake), `healthInsight` (insight memory — the model sees what it has
already said), `healthMirror` ("if it's not in the vault, it didn't happen"),
`healthSentinel` (the missed-push sentinel), `healthWorkouts` (Apple Watch),
`autoExport` (Health Auto Export adapter), `streaks`.

**Knowledge / second brain.** `library` (every Source in the vault),
`librarian`, `librarySpacing` + `spacing` (spaced resurfacing), `readNext`
(the graph drives what to read), `sourceShelf`, `sources` (the
couldn't-look state), `bookText`, `bookCovers`, `distill` (captures →
knowledge), `compost` (weekly read-only scan), `brainWeek`, `recall` (vault
search), `noteSummaries`, `journal`, `journalPrompt`, `stash`, `taste` (the
curated eye), `scout` (research a person), `studio` (the idea pipeline),
`skills` (the skill registry), `learning` (suggestions compound rather than
reset), `patternScout`.

**Money.** `money` (the CFO ledger), `moneyImport` (bank CSV), `cfoReport`
(monthly, deterministically composed), `scanStatement`.

**Time / planning.** `calendar` (CalDAV read/write incl. recurring overrides),
`calendarCommand`, `calendarWatch` (iCloud has no push), `followUps`,
`planner` (chief of staff — decompose a goal, put agents on parts), `plan`
(a multi-step goal as an object), `planToday`, `weekPlan`, `dispatch`
(Morning Dispatch / Evening Debrief), `dailyReview`, `wrapDay`, `reminders`,
`whenParser` (a deterministic clock for spoken time), `openLoops`,
`overnight`, `cadence`, `todos`, `todoLine`, `todoistSync`, `rituals`,
`localDate` (his day, not UTC's).

**Voice and presentation.** `tts` (two providers behind one contract),
`ttsLocal` (Kokoro-82M on MLX, local, free), `transcribe` (Groq Whisper
first, OpenAI second, from `~/.config/watch/.env`), `spokenCards`,
`spokenLog`, `spokenSession`, `askSession` (freshness guard),
`voiceActions`, `panels` (the model names a panel, code draws it),
`morningShow`, `briefing` + `briefingMedia` + `briefWarm` + `briefState` +
`briefDecisions`, `pulse` (the brief that shows), `verdicts` (verdict cards —
the WiseTwinz idea, done Nova's way), `findingCards`.

**The front door.** `intentRouter` (Workstream C1), `verbs` (the action
registry and fast path), `reflex` (deterministic sub-second answers before any
model), `askContext`, `fleetContext` (the shared brain), `contextSections`
(named absence — a failed section is named to the model), `orgContext`,
`profile` (the root operating profile), `platformActivity`.

**Rails and integrity.** `inbox` + `inboxStore` + `inboxConfig` (capture, the
undo rails), `stagedPass` (one shape for every computed write),
`autonomyLedger` (the trust ladder made real), `respectTheNo` (what a declined
proposal means), `standing` (correct it once and it writes that down),
`guardian` (the integrity agent), `backup`, `writeSlices`, `vault`,
`vaultStateFile`, `heartbeat` (watch-the-watcher), `ops`, `events` (the live
wire), `streamFeed` (the system's own activity as one timeline), `jsonRepair`,
`jsonSalvage`.

**Reach outward.** `hands` (Nova reaching outside itself, starting with the
Mac), `browse` (the browser hand), `browserResearch` (reading the web as he
would), `mediaLane`, `watcher`, `researcher`, `ingest`, `attachments`,
`telegram` (Nova reachable from his pocket), `push` (Web Push to the PWA),
`forge`.

**In flight, uncommitted (other sessions):** `visualBeats` / `visualMoment` /
`visualResolve` / `visualStream` — JARVIS-style panels on the glass while Nova
speaks, with real timecodes into podcasts. Server complete, client half
unbuilt. Also `gym3d` — real cable stations, lat pulldown, bar variants for
the 3D form model.

## 5. Screens

Ambient · Briefing · ClaudeCode · Galaxy (memory) · Inbox · Journal · Leader ·
Library · MissionControl · MissionStructured (his phone's `cupertino` idiom) ·
Money · Notes · Ops · Recipes · Settings · Shopping · Stash · Todos · Voice ·
Workouts.

Every new surface ships in **both** Home idioms from one view model, wears the
house objects (`RingTile`, the serif news line, `AppleLayout` groups,
`Controls.jsx`), uses only real `--nv-*` tokens, earns an entrance animation,
and survives 375px.

## 6. Automation

32 scheduler-bearing libs: autonomyLedger, brainWeek, briefWarm, calendarWatch,
cfoReport, claudeCode, coachCadence, coachReflection, compost, dailyReview,
dispatch, distill, events, exerciseVideos, followUps, foodSuggest, guardian,
healthDrops, healthInsight, healthMirror, leader, mealPrep, moneyImport,
overnight, patternScout, planToday, pulse, reminders, todoistSync,
trainingCheck, weeklyDebrief, weekPlan.

## 7. Doctrine (the tiebreakers)

- Deterministic first; **models decide, code acts**. A model's output never
  writes unmediated.
- Everything writeable is **undoable**, riding the inbox rails (`kind`,
  `status`, `undoData`).
- The **vault is the source of truth**; `server/data/` is derived.
- **Honest degradation, never fiction.** Missing data says so; stale data
  self-labels; demo content is `demoMode`-only.
- **Autonomy is earned from real history and proposed**, never assumed; an
  agent never changes its own autonomy.
- **Shared formats are contracts** — change every reader/writer or none.

## 8. Known standing friction (his words, carried forward)

> "I shouldn't need to go to many different sections of the platform in order
> to ask for something like this... Ideally, this includes Claude Code sessions
> as well so I don't need to keep opening different terminals."

Since 19 Aug this has been partly answered — `intentRouter`, `verbs`, the
Briefing, the browser hand, the Claude Code screen. Whether it is answered
*enough* is one of the things this study should test.

## 9. What this baseline deliberately does not claim

- I have **not** run the app in a browser this session; the counts and
  behaviours above come from reading code, the passing test suite, and the
  design docs.
- Live-verified this session: lint clean, build green, 1,296/1,296 tests pass,
  the launchd service healthy on `localhost:4173`.
- Everything in §4 marked "in flight" is uncommitted work belonging to other
  sessions and must not be treated as shipped.
