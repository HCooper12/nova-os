# The Neomas and Ark study: what Nova is missing, and the plan to close it and prove it

**13 Nov 2026.** His brief, with two links
(https://www.instagram.com/reel/DfCzVDyN-zI/ and
https://www.instagram.com/p/DfG0QI_AbKI/): "Research these profiles/apps one
at a time and determine what nova is missing so we can further improve Nova.
Then create a detailed plan to execute to ensure and prove it has been
improved with those missing features and capabilities."

Nothing in this document is built. It is the research, the gaps by file, and
the plan. Section 5 says what was not checked. Section 6 holds his calls.

---

## 1 · Neomas (the reel, @metakaihos)

### 1.1 The evidence

A 7.7 second reel dated 28 Oct 2026 by Alexis Wang (METAKAIHOS), and the
product site neomas.app, fetched 13 Nov.

| Source | What it shows or says |
|---|---|
| Reel overlay | "Imagine an app that brings together obsidian + Jev + Anki + NotebookLM + Ai (ChatGPT, Claude or else)" |
| Reel caption | Smart organization, persistent AI memory, active learning (flashcards, intelligent resurfacing), intelligent research. macOS, free to start. |
| Reel frames | A "Planetary" map of the vault: concentric rings, labelled clusters with their own counts ("Robert Greene 58 notes · 2 îlots · 1 lune · 2 à relier", "Alex Hormozi 157 notes · 2 îlots · 1 lune · 80 à relier"). A toolbar with a zoom level ("ZOOM FAR"), "0 dues", "3 objectifs du jour", a link filter, a lock, and a model picker. |
| Site | Local-first, plain Markdown, imports Obsidian and Notion. The loop it sells: capture, connect, remember, resurface, act. A daily resurface. Tension detection (two notes that contradict, side by side). Sources broken into atomic notes. Memory of what he decides, corrects and prefers, with rules derived from repeated corrections. A decision ledger. "The Council" (three models merged into one answer). Bring-your-own-key with per-task model routing. |

The site does not mention flashcards, the Planetary map, islands, dues or
daily objectives. Those come from the reel and its caption only.

### 1.2 Where Nova stands, by file

| Neomas capability | Nova | Where |
|---|---|---|
| Vault map | Partial. A force-layout star map with type filters and Recency and Compost overlays. It draws at most 400 pages and says so in its header. The vault's Wiki holds 831 pages (counted 13 Nov). No labelled clusters, no per-cluster counts, no zoom levels. | `src/galaxyLayout.js:103` (`GALAXY_MAX_NODES = 400`), `src/screens/Galaxy.jsx`, `src/vals/valsMisc.js:83-120`, `server/routes/notes.js:92` |
| "To link" count | Partial. Orphans are found and raised as Inbox proposals and one "COMPOST · N" chip. Not shown per cluster. | `server/lib/compost.js:177` (`detectOrphans`) |
| Auto-organisation | Partial. The weekly weave runs on a staged copy of the vault with a gate and undo. Nothing on demand for one note or one cluster. | `server/lib/distill.js`, `ingest.js`, `indexRepair.js`, `readNext.js`, `brainWeek.js` |
| Spaced repetition | Has, as concept cards. A fixed ladder, at most 5 a day, state rebuilt from the vault's Review Log, mind concepts only. The card is a summary with provenance, one connection and a reflection. It shows the answer first: there is no question-first recall. | `server/lib/conceptReview.js:47` (`GAPS = [1, 3, 7, 16, 35, 90, 180]`), `reviewSummary.js`, `src/ReviewCard.jsx`, `ReviewSheet.jsx`, `ReviewCurve.jsx` |
| Ask your sources | Partial. The Librarian answers from the whole library and code checks every citation exists. It cannot be pointed at one chosen book or source. | `server/lib/librarianAsk.js`, `POST /ingest/book-file` |
| Persistent memory | Has. Profile, beliefs with tick and cross, staleness, concern closing, the shared lens. | `server/lib/profile.js`, `beliefs.js`, `concernClose.js`, `lens.js`, `src/screens/BeliefsPage.jsx` |
| Objectives of the day | Has. Plan today, the first three priorities on Home, the plan observed from his log, the one thing. | `server/lib/planToday.js`, `planObserve.js`, `missionFocus.js`, `src/vals/valsMission.js:826` |
| Search | Partial, and the largest gap. The server has lexical plus vector recall and the agents use it. No screen does. The client queues a recall and never renders the result; the palette opens the voice page; the Notes search box matches titles only. | `server/lib/recall.js`, `embeddings.js`, `vaultRetrieve.js`; `src/App.jsx:7466` (`queueRecall`, `recallResults`), `src/vals/valsChrome.js:612`, `src/vals/valsNotes.js` (`searchText: n.title.toLowerCase()`) |
| Quick capture | Has. | `src/QuickCapture.jsx`, `server/lib/captureLocal.js` |
| Model choice | Has, per lane, with local models. | `server/lib/modelPrefs.js`, `localModel.js`, `askDispatch.js` |
| Tension detection | Absent. | grep of `server/lib` and `src` for contradiction and tension logic: nothing |
| Decision ledger | Absent. `autonomyLedger.js` and `briefDecisions.js` are different things. | |

### 1.3 The gaps worth closing

In order of value to him.

- **N1 · Search that reads the note, not the title.** The engine exists and
  is unused by his hands. Typing a phrase he remembers from inside a note
  finds nothing today unless the phrase is in the title. This is the cheapest
  gap in the study and the one he would feel daily.
- **N2 · A map that says something.** Clusters by author, entity and topic,
  each with its name, its page count and its "to link" count, and a far zoom
  that shows clusters only so all 831 pages are counted even when not every
  star is drawn. Tapping a cluster lists it and offers to weave it.
- **N3 · Tension detection.** Once a week, at most one card: two of his own
  concept pages that pull against each other, both quoted, with his answer
  filed. This serves the mission directly (he is building a way of thinking,
  and contradictions in it are where the thinking is unfinished).
- **N4 · Ask this source.** The Librarian scoped to one book or source page,
  with the same code-checked citations, and a plain "this source does not
  say" when it does not.
- **N5 · Question-first review.** The daily review asks before it tells:
  question, a beat to answer, reveal, then the same grades. This changes a
  card built to his standing rules of 11 and 15 Oct (mockup 96), so it
  needs his yes and a mockup.
- **N6 · The second-brain audit.** `design/SECOND-BRAIN-FLAG.md` (7 Nov) is
  "flagged, not started". Its questions (how often a vault page changes an
  answer, which pages no agent has read, which surfaces he does not open) are
  the baseline that makes "improved" a measured word. It runs first.

### 1.4 Not copied, and why

- **Source atomization.** The deep weave already does it.
- **Persistent memory, daily objectives, per-task models, local models.**
  Nova has each, and his are grounded in his real log.
- **The Council (three models per answer).** Triples the cost of every answer
  for a gain nobody has measured here. Against the cost discipline of 19 Oct.
- **An in-app Markdown editor.** Obsidian is his editor and the vault is the
  source of truth.
- **Daily resurface.** The daily review is Nova's stricter form of it.
- **A decision ledger.** A candidate for later. The site names it without
  showing it, so there is nothing to study yet.
- **A new scheduler for the review.** The fixed ladder stays until the Review
  Log is measured (phase 0). No swap without his own data.

---

## 2 · The Ark (the post, @theultimatehumandiet)

### 2.1 The evidence

A 33.3 second video dated 30 Oct 2026. No website, store page or
documentation for the app was found, so the video is the only source and
nothing past its frames is confirmed.

Spoken list: 10,000+ meal plan combinations, micronutrients, health goals,
training programs, self-run programs, self check-ins that auto-adjust,
weekly reports, progress tracking, blood tests, cardio, food logging, food
scanning, steps, sleep, water, meal swaps, recipes, meal prep calculators,
shopping lists, optional 1-1 coaching, under a dollar a day, 7 days free.

Read off the frames:

| Screen | What it shows |
|---|---|
| Plan setup | Activity level, goal, an optional health mode (Standard, High Cholesterol, Insulin Resistance, Inflammation, Gut Health), "Training today?" Training or Rest. |
| Home | Today's session. "Next check-in: Mon, 2 Nov · week 1". Progress: 84.4 kg, "7-day average ↓0.9 kg this week", chips for Photos, Measure, Blood tests, Lifts. "Share my week". |
| Weekly check-in | The goal and its pace ("Lose fat · Aim: 0.5–1% of your body weight a week"). The week's weight and change. A verdict in plain words ("Nailing it - hold everything"). Evidence chips: "Weigh-ins 7/7", "Food logged 6 days (6 on target)", "2 sessions trained", "Energy 4/5". A "How this was worked out" disclosure. "YOUR PLAN FOR WEEK 2" with the four numbers. |
| Weekly report | "Your week on one page: every lift against last time, your weight against your goal, food and photos. Built from what you log." "Anything you didn't log is called out." Tiles: Sessions 2/4 "logged of planned", Lifts up, Weight, Food. Share, Download PDF. |
| Weight trend | Morning weigh-in dots with a dashed 7-day average line, and a dated list with Edit and Delete. |
| Add food | Search, Scan barcode, Add my own food, and a legend naming where each food's numbers come from: the coach's list, "Lab-tested (AU) = Food Standards Australia New Zealand (AFCD)", "Lab-tested = USDA", from the label, his own, his meal prep batches. |
| Meal editing | Day totals against targets (2331/2355 kcal, 167/168 P, 289/288 C, 59/59 F). "Refill my meals". "Fit to my macros" ("Fit changes the amounts of your foods so the day adds up to the macros"). Gram steppers per food with Swap and Remove. |
| Meal prep | Weigh each ingredient raw, say how many meals, weigh the cooked batch (zero the scale with the empty container), then log a meal or weigh a portion. |
| Coaching | Weekly check-ins reviewed by a named human coach, messages with voice notes, photos and form-check videos. |

### 2.2 Where Nova stands, by file

| Ark capability | Nova | Where |
|---|---|---|
| Calorie and macro targets | Has. Derived by code, editable, with target history. | `server/lib/intake.js`, `src/NumbersEditor.jsx` |
| Weekly check-in that adjusts | The engine exists and the screen does not. Every Monday 07:00 code fits a trend to 28 days of weigh-ins and logged food and files ONE pending card he approves, with undo. Honest refusals: `'not-enough'` and `'implausible'`. He never sees the weigh-in count, the days on target, a verdict, the working, or next week's numbers on a page. | `server/lib/fuelReview.js` (`KCAL_PER_KG = 7700`, `STEP_KCAL = 150`, `DEAD_BAND_KCAL = 100`, `weightSlope`) |
| Weekly report | Partial. A model-written debrief filed as a journal draft and read aloud. No one-page report built by code. | `server/lib/weeklyDebrief.js` |
| Weight trend | Partial. Weight is a 14-day list. A 7-day mean is computed for one spoken check and drawn nowhere. | `src/StepsHistory.jsx`, `server/lib/checks.js:137-140` |
| Measurements | Partial. Waist, neck and hip are single stored facts with no dates. | `server/lib/intake.js` (`EXTRA_FACTS`) |
| Progress photos | Absent. | |
| Blood tests | Absent. | grep empty |
| Lifts | Has. Record pill, estimated max, plateau detection, bests. | `/workouts/bests`, `trainOverview.js` |
| Cardio, steps, sleep | Has, read from Apple Health. | `NovaHealthPlugin.swift`, `healthWorkouts.js`, `weekCount.js` |
| Food logging and scanning | Has both barcode and photo, itemised, with undo. | `server/lib/foodLog.js`, `barcodeLookup.js`, `scanFood.js`, `src/BarcodeScanner.jsx` |
| Where a food's numbers come from | Stored, and shown only as a hover tooltip, which a phone never shows. | `src/screens/FuelSummary.jsx:292` |
| Australian food data | Absent. Lookups go to Open Food Facts and USDA. He lives in Australia. | grep of `server/lib`, `src`, `design` for AFCD: nothing |
| Micronutrients | Fibre, sugar and sodium are stored on entries and no screen reads them. No vitamins or minerals. | `foodLog.js`, `nutritionFacts.js` |
| Meal plan | Partial. Meal Prep plans the week and the shopping list. It does not read the training program, there is no fit-to-numbers solver and no refill. | `server/lib/mealPrep.js`, `rotation.js`, `fuelCross.js` |
| Meal swaps | Whole-dish alternates only. No per-food swap with the amount solved. | `server/lib/recipes.js` (`promoteAlternate`), `tweakRecipe.js` |
| Meal prep calculator | Absent. Nothing handles raw weights, a cooked batch weight or a weighed portion. `portions.js` counts fridge portions only. | |
| Recipes, shopping list | Has. | `recipes.js`, `recipeScale.js`, `mealPrep.js:57-90`, `remindersShop.js` |
| Coach and Chef as one | One way. Chef is not in the consult registry and Coach cannot ask him. | `server/lib/consult.js:45` (`AGENTS`) |
| Water | Absent by his choice (12 Oct: "NO drinks log"). | |

### 2.3 The gaps worth closing

In order of value to him.

- **A1 · The batch cook calculator.** He cooks in batches. Today a portion of
  a batch is logged by guess. Weigh the raw ingredients, weigh the cooked
  pot, and every portion weighed afterwards is exact. All arithmetic, no
  model, and it fits the itemised plate (an entry's macros are the sum of
  its lines).
- **A2 · The weekly check-in as a page.** The engine already does the hard
  part. What is missing is the page that lets him trust it: a verdict in
  plain words, the evidence it stood on, the working, and next week's
  numbers with his tick or cross on the same card. It stays propose and
  approve. Nova does not change his calories by himself.
- **A3 · The weight trend, drawn.** Weigh-in dots, the 7-day average line,
  the goal pace as a band. And measurements as a dated log, so a waist
  number has a history.
- **A4 · The week on one page, built by code.** Every lift against last
  time, weight against goal, food days logged and on target, cardio minutes
  from Health, and anything not logged named as not logged. It sits above
  the Coach's weekly words, and the Coach is handed the same numbers so the
  two cannot disagree.
- **A5 · Fit to my numbers, and swap one food.** Code changes the gram
  amounts of the foods already in the day so the day meets his targets, and
  shows the before and after before anything is written. Swapping one food
  solves the new amount. This belongs with the Chef and Coach work he
  already raised (10 Nov), which waits on his word.
- **A6 · Australian food data, and the source in plain sight.** FSANZ
  publishes the Australian Food Composition Database as spreadsheets.
  Generic foods (rice, chicken thigh, oats) should come from there before
  USDA, and each food line should carry a short visible tag for where its
  numbers came from. Fibre and sodium totals, already stored, get shown with
  an honest "known for N of M foods".
- **A7 · Blood tests.** Upload a result, values read out, each value checked
  by code against the document text and confirmed by him, stored dated in
  the vault, trended, and handed to Coach and the Researcher as context.
  Never a diagnosis. Needs his yes.
- **A8 · Progress photos.** Private, in the vault only. Needs his yes.

### 2.4 Not copied, and why

- **Water.** His answer of 12 Oct stands.
- **A human 1-1 coach.** Nova's Coach is that seat.
- **A catalogue of generic programs.** His Coach builds his program from his
  own history.
- **Health-condition modes.** He has stated no condition. Worth another look
  only if blood tests arrive and show a reason.
- **Auto-adjusting calories.** The Ark says its check-ins adjust the plan.
  Nova proposes and he approves. Autonomy is earned from real history and
  proposed, never assumed.
- **Share and PDF.** Nobody to send it to. Small to add later if he wants it.
- **"10,000+ meal plan combinations".** A count of permutations. His
  rotation of meals he really eats is worth more than a large number.

---

## 3 · How "improved" gets proved

One standard, applied to every phase below. A phase is done only when all
seven lines are true and written into the handoff.

1. **Before.** The baseline number or frame is recorded before a line of
   code changes (phase 0).
2. **Tests.** A regression test for each failure mode named in the phase.
   Every test sets its own `NOVA_DATA_DIR`.
3. **His real vault.** A second server on another port, on scratch copies of
   `server/data` and the vault, with the Telegram, push, Notion and Todoist
   keys unset. The endpoint is called and the result is read. Port 4173 is
   never touched by an instrument.
4. **The surface.** A mockup he approves first (the next free number: 116 is the daily review, 117 is search), in
   both Home idioms, at 375 and 402 px, with the design skills loaded before
   drawing. Then the build is laid beside the mockup frame by frame in
   WebKit, on his settings (Summary style, his theme and material) and his
   real data read-only (`scripts/shot.mjs --readonly --style summary`),
   every state as a screenshot and as a recording (`scripts/rec.mjs`).
   Reduced motion honoured. Any difference is fixed before deploy.
5. **Gates.** `npm run lint` clean, `npm run build` green, `cd server && npm
   test` green, with any failures compared by name against the two known
   atlas failures.
6. **Delivery, checked three ways.** The commit is on origin, the Pages run
   for that exact sha is green, and the served bundle contains the change.
   Server code is reloaded with `node scripts/reload-server.mjs` and the
   endpoint answers. Whatever only his phone can show is listed as not
   confirmed.
7. **After, and kept.** The baseline is run again and the after number sits
   beside the before in `design/audits/`. Two weeks later a keep check
   reads real records (searches run, check-ins opened, batches logged,
   tension cards answered or dismissed). Anything he does not use is put to
   him for removal. Nova made about 154 drafts a month and he kept 9; a
   feature that is produced and not kept is not an improvement.

---

## 4 · The plan

### Phase 0 · Baselines (read-only, no change he can see)

One small script per measure, run on the second server. Findings (counts
only, never his note text: the repo is public) go to
`design/audits/`, in a file dated the day it runs
(`<date>-neomas-ark-baseline.md`).

| # | Measure | How | Feeds |
|---|---|---|---|
| B1 | Search | 20 phrases, each taken from the body of a real note and absent from its title. Count how many return their note in the top 5 through today's Notes search and through `GET /recall`. The phrase list stays outside the repo. | K1 |
| B2 | Map coverage | Pages in the vault against stars drawn; share of pages that carry an author, entity or topic the code can read; orphans per would-be cluster. | K2 |
| B3 | Second-brain audit | The questions in `SECOND-BRAIN-FLAG.md`: how often a vault page changes an agent's answer, which pages no agent has read, which surfaces he does not open. | K1 to K5 |
| B4 | Review grades | From the vault's Review Log: Got it, Fuzzy and Forgot counts at each rung of the ladder, with the sample size. | K5 |
| B5 | Check-in replay | Run `fuelReview` for every past Monday that has data. Record each verdict and its inputs. This becomes the fixture set for the check-in page. | C2 |
| B6 | Food sources | Of his food lines in the last 90 days: share by source, share with fibre and sodium present, and his 30 most-logged generic foods. | C6 |
| B7 | Corrections | Read-only: does anything count his repeated corrections into a standing rule today (`beliefs.js`, `profile.js`, the conversation record)? | later |

Done when the findings file exists with a number, a sample size and a "not
measured" line for anything that could not be read.

### Track K · Knowledge (from Neomas)

**K1 · Search that reads the note** (gap N1)
- The moment: he remembers a phrase and not where it lives.
- Change: one search surface fed by the existing recall engine. Lexical hits
  paint first, vector hits join; each row shows the note title, the matching
  line with the phrase marked, and the page type. The Notes box searches
  bodies. The palette opens search. Offline says so plainly.
- Files: `src/App.jsx` (`queueRecall`, `recallResults`), `src/vals/valsChrome.js`
  (`openPalette`), `src/vals/valsNotes.js`, a new result list in both idioms,
  `server/routes/notes.js` and `server/lib/recall.js` for a snippet field.
- Tests: snippet contains the query; no result for a phrase that is not in
  the vault (never a nearest-guess passed off as a hit); embeddings service
  down falls back to lexical and labels it.
- Done when: B1 re-run through the new surface returns the source note in
  the top 5 for at least 16 of the 20 phrases, the before count is beside
  it, and the time to first result is measured and stated.

**K2 · A map that says something** (gap N2)
- The moment: he opens the map to see the shape of what he knows and where
  it is thin.
- Change: code assigns each page to a cluster from its type and front
  matter. `GET /graph` returns clusters with page count and orphan count for
  the whole vault, past the 400-star cap. Far zoom draws clusters with
  labels and counts; near zoom is today's stars. A cluster opens as a list
  with "weave this cluster", which runs the existing staged-copy weave for
  those pages and raises its proposals in the Inbox as today.
- Files: `server/routes/notes.js:92`, `src/galaxyLayout.js`,
  `src/screens/Galaxy.jsx`, `src/vals/valsMisc.js`, `server/lib/compost.js`,
  `server/lib/distill.js` (a scope argument).
- Tests: cluster counts sum to the vault's page count; a page with no
  readable cluster lands in a named "unsorted" group, never dropped; the
  scoped weave touches no page outside its cluster.
- Done when: the header's count equals the vault's page count on his real
  vault, mockup and build match at both widths, and frame time on the map
  is measured before and after (the 4 Oct lesson: the lag was drawing cost).

**K3 · Tension detection** (gap N3)
- The moment: two things he has written down cannot both be his rule.
- Change: weekly, code picks candidate pairs of concept pages by embedding
  nearness. The local model judges each pair and must quote one line from
  each page. Code checks both quotes exist word for word, or the pair is
  discarded. At most one card a week. His answers: both hold, this one
  wins, not a tension. Each is a record on the inbox rails with undo; "this
  one wins" adds a dated line to the other page through the vault writer.
- Files: new `server/lib/tension.js` and test, `server/lib/embeddings.js`,
  the Inbox view models, a card in both idioms.
- Tests: a fabricated quote is rejected; a dismissed pair is never raised
  again; the cap holds; training and nutrition pages are excluded (the 15
  Oct rule for the mind lane).
- Done when: a dry run on the scratch vault lists its pairs for me to read,
  every quote is found in its page, and after four weeks the kept against
  dismissed count is reported. If he dismisses most, Nova proposes switching
  it off.

**K4 · Ask this source** (gap N4)
- Change: `librarianAsk` takes a source scope and retrieves only from that
  source page and the pages woven from it. Same citation check. A plain
  "this source does not say" when retrieval is empty. An "Ask this book" row
  on the source page.
- Files: `server/lib/librarianAsk.js`, `vaultRetrieve.js`, the source page
  view model and screen.
- Tests: a scoped answer never cites a page outside the scope; an
  unanswerable question returns the plain refusal, with no model call.
- Done when: asked on two of his real books on the second server, every
  citation resolves inside the scope.

**K5 · Question-first review** (gap N5, needs his yes)
- Change: one question per concept, written once and cached, with its
  answer checked against a quote from the page. The card asks, waits for his
  tap, reveals, then takes the same grades. The ladder does not change.
- Files: `server/lib/reviewSummary.js`, `conceptReview.js` (a cached
  question field; the Review Log format is a contract and does not change),
  `src/ReviewCard.jsx`, `ReviewSheet.jsx`.
- Done when: mockup approved and matched, and after four weeks the Fuzzy and
  Forgot share at the 7 and 16 day rungs is set beside B4 with both sample
  sizes. A small sample is reported as a small sample.

### Track C · Coaching (from The Ark)

**C1 · The batch cook calculator** (gap A1)
- The moment: Sunday, a pot on the scale.
- Change: a batch is a list of ingredients with raw weights (each from the
  existing food lookup), then one cooked weight with the container tared.
  Code holds macros per cooked gram. Logging a portion by weight writes an
  itemised entry whose lines are the ingredients scaled by portion over
  batch. The batch lives in the vault, counts down as he logs from it, and
  shows what is left. Cooked heavier than raw is allowed (rice takes on
  water).
- Files: new `server/lib/batchCook.js` and test, `server/lib/foodLog.js`,
  `portions.js`, a route, `src/api.js`, a sheet on Fuel in both idioms, the
  Add food list gains "my batches".
- Tests: all portions of a batch sum to the batch at display resolution;
  zero or missing cooked weight is refused with the reason; undo of a logged
  portion returns the grams to the batch; an edited batch does not rewrite
  portions already logged.
- Done when: a real recipe of his is run through on the second server and
  the logged portion's numbers equal a hand calculation shown in the audit
  file.

**C2 · The weekly check-in page** (gap A2)
- The moment: Monday morning, "am I on track, and what changes".
- Change: `fuelReview` returns a structured evidence object beside its
  verdict (weigh-ins counted, days logged, days on target, sessions done
  against planned, the slope, the implied burn). The page shows a verdict
  sentence chosen by code from the verdict, the evidence as forms (not a
  paragraph), "how this was worked out" with the real constants, and next
  week's numbers with his tick or cross acting on the same pending record.
  `'not-enough'` names what is short ("3 of the 4 weigh-ins needed"). One
  optional tap for how the week felt, stored with the week and labelled as
  not yet used in the sums.
- Files: `server/lib/fuelReview.js` and its readers (a shared format: every
  reader changes together), a route, a new view model and screen in both
  idioms, the Home card that points to it on a Monday.
- Tests: the B5 replay. For every past Monday the page's verdict, counts and
  proposed numbers equal the engine's, with zero mismatches. A goal change
  applies from that day forward and never re-judges a past week.
- Done when: the replay is clean, mockup and build match in every state
  (on track, adjust up, adjust down, not enough, implausible), and the
  approve and undo path is exercised on the scratch copy.

**C3 · The weight trend and dated measurements** (gap A3)
- Change: one function owns the 7-day average and both the spoken check and
  the chart read it. The chart draws weigh-in dots, the average line and the
  goal pace band. Waist, neck and hip become dated entries; the body-fat
  method reads the newest. Missing days are gaps, never joined by a line.
- Files: `server/lib/checks.js`, a new shared mean, `server/lib/intake.js`
  (`EXTRA_FACTS` readers), `src/StepsHistory.jsx`, the Fuel and Standing
  view models.
- Tests: chart and spoken check give the same average for the same day; an
  old single-fact measurement migrates to one dated entry and round-trips.
- Done when: his real last 28 days draw correctly beside a table of the
  same numbers. Drawn with C2 as one mockup, since the two are one moment.

**C4 · The week on one page** (gap A4)
- Change: new `server/lib/weekReport.js` builds the page from records only:
  each lift against its last outing, weight against goal, food days logged
  and on target, cardio minutes and steps from Health, sleep, and a "not
  logged" list. `weeklyDebrief.js` is handed the same object so the Coach's
  words rest on the same numbers.
- Tests: every figure on the page equals its source for four real past
  weeks; an empty week renders as an honest empty week.
- Done when: those four weeks are checked figure by figure in the audit
  file and the build matches its mockup.

**C5 · Fit to my numbers, swap one food, Chef reads the program** (gap A5,
with the Chef and Coach work, on his word)
- Change: a bounded solver in code (each food between a floor and a ceiling,
  5 g steps) moves the day's amounts toward his targets and shows old and
  new grams before writing; one undo. When the foods cannot reach the
  targets it says so and shows the closest it can get. A single-food swap
  draws candidates from his own foods and rotation and solves the amount.
  Chef joins `consult.js` `AGENTS`, reads the day's session from the
  schedule (he is never asked "training today?"), and Coach can ask Chef.
  Different numbers on training days stay a Coach proposal on the rails.
- Files: new `server/lib/fitDay.js` and test, `server/lib/mealPrep.js`,
  `recipes.js`, `consult.js:45`, Fuel view models.
- Tests: the solved day lands within the stated tolerance or returns the
  honest shortfall; bounds are never broken; undo restores every amount.
- Done when: three of his real logged days are fitted on the second server
  and each result is checked by hand in the audit file.

**C6 · Australian food data and the visible source** (gap A6)
- Change: a script downloads the FSANZ spreadsheets into `server/data`
  (kept out of the repo until the licence terms are read). Generic lookups
  rank his own foods, then AFCD, then USDA; barcodes stay with Open Food
  Facts. Each food line carries a short visible source tag. Fuel shows fibre
  and sodium totals with "known for N of M foods".
- Files: new `scripts/import-afcd.mjs`, new `server/lib/afcd.js` and test,
  the lookup chain (`barcodeLookup.js`, `nutritionFacts.js`),
  `src/screens/FuelSummary.jsx:292`.
- Tests: on real foods (the USDA matching lesson of 7 Nov): his 30
  most-logged generic foods from B6, each looked up before and after, the
  chosen record listed for me to read.
- Done when: that list is in the audit file with wrong matches at zero or
  named, and the tag is visible on his phone widths.

**C7 · Blood tests** and **C8 · Progress photos** (gaps A7, A8)
- Each waits on his yes and gets its own short plan then. The fixed rules
  are already known: values confirmed by him before they are stored, the
  vault as the only home, no diagnosis, nothing leaves the Mac that he has
  not sent.

### The order, and how it sits with what is already agreed

The agreed queue (handoff, 13 Nov): character lag in the stage build, Train
and Fuel as panels with the Settings switch back, Chef and Coach, the 17
exercises with no anatomy.

1. **Phase 0**, then **K1**. Neither touches a stage or panel surface, so
   they can run beside the stage work.
2. **C2 with C3**, then **C1**. All three are Fuel surfaces. They are drawn
   as panels from the start, so they are not built twice when Fuel becomes
   a panel.
3. **C6**, then **K2**.
4. **C4**, then **C5** as the Chef and Coach build.
5. **K3**, **K4**.
6. **K5**, **C7**, **C8** on his yes.

Each numbered step ends with the seven proof lines of section 3 before the
next begins.

---

## 5 · Not verified

- **The Ark** beyond its 33 second video. No site or store page was found.
  Its price and "10,000+" are its own spoken claims.
- **Neomas** features that appear only in the reel and caption: the
  Planetary map, flashcards, dues, daily objectives. How its flashcards are
  scheduled is unknown.
- **AFCD.** That FSANZ publishes it as spreadsheets with up to 256 nutrients
  per food is from one web search. Release 3 is dated December 2025; its
  food count was not found. The licence is stated differently by
  data.gov.au (CC BY 2.5 AU) and by FSANZ (based on CC BY-SA 3.0 AU). To be
  read before any of it is bundled.
- **Repeated corrections becoming rules** in Nova: not checked (B7).
- **The inventories** were gathered by two sub-agents. I checked the claims
  this plan rests on against the code (the unwired search, the 400 cap, the
  review ladder, the check-in engine's constants, the absent AFCD, the
  tooltip-only source, the undated measurements, Chef's absence from the
  consult registry). I did not re-check every line of either report.
- **The 831 pages** is a file count taken 13 Nov. How many of them the map
  can place in a cluster is B2's job.
- **Every "done when" number** is a target set before measuring, not a
  result.

## 6 · His calls (answered 13 Nov 2026)

1. Start the baseline and the search build now, beside the stage work, or
   hold all of this until the stage and the panels are finished?
   **Now.** Phase 0 runs first, then K1.
2. Does the Chef and Coach joining go ahead as part of this plan (step 4)?
   **Yes.** C5 is in.
3. Should Nova read and track blood tests?
   **Yes.** C7 is in.
4. Should Nova keep progress photos?
   **Build the capability; he may not use it.** C8 is in, off by default,
   and nothing on any surface asks him for a photo.
5. May the daily review card be redrawn to ask the question first?
   **Draw a mockup first.** His words: the daily review "still hasn't been
   working ideally. I want it focused on presenting things like podcast
   quotes and concepts/ideas, such as those from Chris Williamson, Alex
   Hormozi, diary of a ceo, etc". K5 therefore changes shape: the card is
   led by the speaker's own words (quote, who, show, real timecode), with
   the idea behind it, and his named shows are picked first. Mockup 116;
   no build before he approves it.

### Added the same day: old data presented as current

His words, 13 Nov: prompts in the morning brief and the inbox are "OLD
data", such as one slight pain mentioned during an exercise that was not
ongoing ("it should have merely asked if this was continual pain or
not"), and gym performance "from an exercise multiple weeks ago that is
irrelevant for today in reality".

This is a new track, **F (freshness)**, and it goes ahead of K1 because it
is a fault he meets every morning:

- **F1 · one date rule.** Every producer that raises something from his
  logs (morning brief, inbox cards, Coach's reviews, alerts) judges age by
  date through one shared helper, never by "the last N sessions".
- **F2 · pain is asked once.** A new pain mention gets one question: is
  this still going on? "No" closes it for good; "yes" opens an Injury Log
  entry. Either answer is on the inbox rails and can be undone. It is
  never raised again unasked.
- **F3 · evidence wears its date.** Anything that survives the rule shows
  the date of what it is built on; anything too old is dropped, not
  softened.
- **Proof:** tests with their own data folder; a replay of the morning
  brief and the Coach review on a scratch copy of his data, counting how
  many items cite evidence older than the rule allows, before and after.
