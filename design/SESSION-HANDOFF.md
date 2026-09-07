# Nova OS — Session Handoff

**Read this first, every session.** `CLAUDE.md` carries the doctrine (what Nova
is, the non-negotiables, where things live). Memory files carry durable
project facts. *This* file carries the live state of the work: what is
half-finished, what was decided and why, what is verified versus assumed, and
which dead ends are already closed.

Updated at the close of each session (`/nova-close`). Newest state on top;
the session log at the foot is append-only.

---

## CURRENT HANDOFF

**7 SEP (night) — THE TWO FUEL PIECES, VERBS PHASE 4, AND THE OPEN-THREADS
SWEEP.** Everything below is shipped, pushed and live on the deployed bundle.

**Fuel, the last two pieces (f635eae).** Swipe between a slot's options: the
zone is the focused-dish HEADER of a multi-option card only, declaring
`touch-action: pan-y`, so the rest of the strip still scrolls with a finger —
the conflict that made this "deliberately not built" was solved by shrinking
the zone, not by tuning a threshold. Paging is not a commit, so `shouldPage`
takes a lower distance bar than `shouldCommit` but the SAME direction lock
(six new cases in swipeCore.test.js). And a variant now belongs to the DISH:
each option row shows its own variant and holds for its own menu (focus,
eaten, swap, back to original, open, remove). Nested long-press had to be
scoped — React bubbles to the root and the outer handler won, so a
multi-option card's root no longer takes the menu.

**Verbs phase 4 — editing what is already written (414a934).**
`foodlog.fix`, `foodlog.remove`, `workout.set`, `recipe.ingredient`. All
confirm-tier; the pending title is the DIFF ("3.9P · 36.5C · 11.3F · 293 kcal
→ 4.5P · …"), which is what `runVerb`'s new `titleFor` hook exists for, and
`resolve()` now receives the vault path because an edit verb must FIND its
subject first. Two honesty rules: resolve matches against what is actually
written (so "that lasagne was 400 calories" is conversation when no lasagne is
logged — the probe branch), and run() re-checks that what it is overwriting is
still what it showed him, REFUSING a stale edit exactly as the staged pass
refuses a stale weave. Undo restores verbatim (`restoreEntryOn` puts a removed
entry back with its own id and time). Proven on his real log, both test
proposals discarded, log untouched. Settings' "You can just say it" card names
the four phrasings.

**THE OPEN-THREADS SWEEP (7 Sep) — what is actually still true.** Verified by
a second route, not by re-reading the list:
- STILL TRUE: About You profile empty (`/api/profile` → null, no
  `Wiki/Profile.md`); ElevenLabs key not set (NOVA_TTS_LOCAL carries voice);
  Up Bank connector not built; P8 val-builder memoization deferred (no memo
  anywhere in src/); recipe-step `**bold**` still lost on a rewritten line
  (his undecided design question); the three phone-only items.
- RESOLVED since it was written: equipment + limitations now filled (3 Sep);
  22 July steps carry 14,385; bodyweight landing since 24 Aug; tab-bar
  redesign shipped (MobileChrome floating dock + More sheet); P7 typeIn
  closed (TypeText.jsx); stash IS a classifier route now.
- CHANGED: inbox is 430 records — **12 pending, 7 error**, and all seven
  errors are the SAME `plan-today` job failing nightly 22–31 Aug (not the two
  old stuck ones). Apple layout now covers Todos, Journal and Shopping too;
  **Inbox is the one named candidate still unconverted**.
- FLAGS WORTH HIS EYES: 7 Sep weight reads **84.9 kg**, +2.9 kg in a day from
  a weight-only push at 09:50 — looks anomalous, not real. The nightly health
  push lands ~20 days in 21 but no longer at 00:05 (mostly next morning);
  8 identical duplicate pushes fired for 4 Sep within 2 s, and a 28 Aug push
  carried `forDate: 2019-01-01`.

**THE ATHLETE-AI QUEUE (design/ATHLETE-AI-PLAN.md).** Watched @krudd.jr's
day-8 reel plus nine more of his builds. His shape: a strict protocol → a
model that reads the input → an artefact that holds state → a plan grounded in
real history. Scheduled, in order: (1) THE INTAKE — an interview whose
arithmetic is CODE (Mifflin-St Jeor → TDEE → deficit → macro floors), landing
as a pending card that writes his profile and targets; (2) WRAP THE DAY;
(3) itemised plate breakdown; (4) FORM CHECK on his own filmed lifts, where
the filming protocol is the feature and a bad clip is refused, not guessed;
(5) the study lane joining Researcher to Coach. Deliberately not copied: his
Garmin build asks for an account password in chat, and age-group percentiles
Nova has no population for.

**7 SEP (late) — TWO THINGS HE REPORTED, BOTH REAL (34b57df).**
- **A pasted video link did nothing.** The capture path ran the prose
  classifier (no video route) and never asked `routeIntent`, which has known
  what a video link is for weeks — so his "Research and analyse this video"
  filed as an unclassified note. Every front door now routes media first:
  a video link → the Watcher (carrying his words), a channel → Study, prose
  unchanged. `captureLane()` is pure and pinned by captureLinks.test.js.
- **"NOVA IS WORKING · 1 running" was a job that died on 27 August.** The tray
  counted failed and ready cards as in-flight and gave a failed one no way
  out. Counts are now honest (running / waiting for you / failed) and a
  failed job carries CLEAR. The Atomic Habits card is gone.
- **HIS CALL, OPEN:** a watched video files to `Wiki/Sources/<title>.md`
  (typed `source`, tagged `video`, linked to its `Raw/` transcript) — but
  only after his approve tap. He wants links in the second brain
  automatically; auto-filing is defensible (it rides the rails and undoes),
  it is simply a behaviour change he has not agreed to yet. NOT YET VERIFIED:
  whether the daily review, Leader and Coach actually READ `Wiki/Sources` —
  do not claim they do until someone checks.

**STILL HIS:** the stale ingest weave 9e994aae (discard + re-run; the
transcript is cached so it is cheap); cook something and tell Nova so the
fridge starts counting; the phone-in-hand gym check; a real browser commit;
Xcode for the native shell.

**7 SEP (evening) — THE FUEL OVERHAUL, SHIPPED AND PROVEN ON HIS VAULT.**
His whole Fuel ask is built, live, and verified on the exact deployed bundle
against his real rotation at 375×812 (vite preview + generated bootstrap,
deleted after; the method in the block below):
- **Rotation v2** (`lib/rotation.js` rewrite, v1 files migrate on read). A
  slot holds OPTIONS; the one in FOCUS (★, the ‹ › pair and the dots) is
  what today's plan counts (`totals`); EVERY option has its own tick
  (`eaten`, counted in `consumedTotals`, one food-log entry per
  slot+recipe). "4 snacks, tick 3" works. Setting a slot the old way now
  ADDS an option and focuses it — what he ate is never un-eaten by changing
  the plan (rotation.test.js asserts this). Extra meals: `+ ADD A MEAL`
  on the strip (custom slots `extra-N`, rename/remove); the old
  `+ 4TH MEAL` button is retired.
- **The fridge** (`lib/portions.js`, vault file
  `Wiki/Health/Meal Prep Portions.md`). Ticking a meal eaten takes one
  portion off; un-ticking gives it back; zero paints the rotation card red
  with OUT. On the recipe itself: IN THE FRIDGE row (−1 / ＋ Cooked more /
  Set / Stop counting). Voice: `meal.cooked` ("I cooked 8 portions of
  burrito bowl", "made 4 works burgers") and `meal.portions` ("3 works
  burgers left", "works burger portions to 3" — the "to N" form REQUIRES
  the word portions, or "set eggs to 12" stops being a shopping edit; the
  test caught exactly that). Both undo.
- **Macros from the labels** (`lib/labelMacros.js`, `scanFood.js` mode
  `label-per100`, routes `/api/recipes/label-macros`). In the recipe
  editor under Macros: "Or work them out from the labels" → add label
  photos, grams each, servings the recipe makes, "Work out the macros". The
  model reads the per-100g column only; the server scales/sums/divides/
  rounds and shows the breakdown; the result FILLS the four fields and Save
  is still his press. Proven live with a rendered AU oats panel: 1590 kJ →
  380 kcal/100 g, two parts, ÷4, 14 s.
- **Verified live (7 Sep, real vault):** two snack options → tick the
  second → "1/2 eaten", fridge 3→2, consumed kcal counted, the home fuel
  line moved; un-tick → 3; dinner at zero → red OUT card and "out — cook
  more" on the recipe. Everything restored afterwards (his rotation is as
  it was; no portion counts exist yet — he has never counted a dish).
- **One layout trap found:** nowrap option names bubble up as the flex
  card's min-content and widened it to 407px at 375 — `minWidth: 0` on the
  card (same family as the Coach-pane bug; memory updated).
- 1122 tests green under TZ=UTC. verify-shipped carries four new markers.

**STILL HIS:** cook something and say so ("I cooked 8 portions of …") — the
fridge only starts counting on his word; the phone-in-hand gym check; a
real browser commit; the Xcode shell; the "Simple Protein Shake" draft in
his Inbox (approve or discard).

**NOT BUILT (deliberately):** per-option variants in the UI (the server
supports per-dish overrides via `recipeId` on /rotation/variant; the card
still applies variants to the focused dish only); swiping between options
(the strip scrolls on the same axis — the ‹ › pair and dots are the
switch, see the comment in Recipes.jsx).

**7 SEP (midday) — THE LIVE AUDIT, AND THE BUG IT FOUND.** He asked me to
confirm the week's work live, not in demo. Method (repeatable, and the right
one from now on): `npx vite preview --port 5173` serves the EXACT dist that
GitHub Pages is serving (bundle filenames compared — identical), a generated
`dist/_devconn.js` points it at the real server (token never in a
transcript), and the audit drives that. Demo mode does not even render the
Coach tab, which is why two bugs survived earlier "checks".

VERIFIED LIVE on his vault, on the shipped bundle: Coach tab fits (natural
scrollWidth == viewport, zero overflowing elements); ◉ 3D chips on all 9
cockpit exercises + the anatomy card opens with the figure; the HANDS FREE
strip; the gym by voice ("what's next" → "Weighted Pull-Up, set 1 of 3 —
bodyweight for 12 is the plan. 9 exercises to go", "80 for 8" → ticked,
"undo that" → unticked); settings by voice (ember theme + calm mode applied
and reverted); the BROWSER route chip; the paperclip on both composers; the
Leader answering IN the conversation ("Handing that to the Leader." → »
LEADER, grounded in his own leadership material).

**THE BUG THE AUDIT FOUND — and it was silently disabling most of the week's
work.** The client prepends a situation block ("[On his screen right now —
…]") whenever a card is up, a workout is live, or he is on another screen.
The server matched the REFLEX, the VERBS and the LANE ROUTER against that
whole blob, so with anything on screen: no sub-second answers, no verbs, no
Coach/Leader handoff — everything fell through to the model. It worked via
the API (no preamble) and failed in the app, which is exactly why the API
proofs were not enough. Fixed: the client sends `raw` (his sentence
undressed), every matcher reads it, only the model gets the dressed version.
Re-verified live in the app.

**Also 7 Sep:** Nova can now WRITE A RECIPE (his report: "I can't modify
your logs directly — I'm read-only"). `PROPOSE {"kind":"recipe",…}` composes
the fields, `voiceActions` validates them (real macros or an honest refusal,
no duplicate names) and files a pending draft on the existing `recipe` rail,
which already had a working undo. Proven live: "add a protein shake" →
"Recipe: Simple Protein Shake — 31P 12C 9F · 262 kcal" waiting in his Inbox.

**NEXT (his queue, in order):** the FUEL overhaul — several options per
rotation slot he can flick between, unlimited extra meals, several dishes in
one slot each individually tickable, per-recipe macro correction from
uploaded nutrition labels, and a cooked-portions counter that decrements as
he ticks meals off (red when a meal is out). That is a rotation SCHEMA change
— `slots{slot:id}` + `consumed{slot:bool}` becomes a list per slot — so
every reader must move together (valsRecipes, Recipes.jsx, panels, fuelCross,
mealPrep, verbs meal.eaten/recipe.slot, dispatch lines).

**7 SEP (later) — THE THREE OUTSTANDING BUILDS ARE DONE.** The browser hand
(`lib/browse.js`, the `browse` lane): a Claude Code job with ONLY the Chrome
DevTools MCP tools, on Nova's own `~/.nova-browser` profile, read/navigate/
fill, $2 cap, screenshots, a pending record — and a hard stop before
anything that commits. Proven live on example.com (read it, screenshotted
it, reported accurately, left no Chrome running, used the right profile —
checked). Reminders by voice (`lib/whenParser.js` + `reminder.set`): proven
live and undone. Settings by voice (`src/settingsVoice.js`, client-side)
with a "You can just say it" card in Settings so it has a door. All three
carry their affordance: the composer's route chip shows BROWSER, the
reminder answers "I'll remind you at …", Settings names the phrases.
1109 tests green under TZ=UTC. **The honest caveat on the browser hand: in a
browser the MODEL is the actor.** The protections are structural (its own
profile, the tool boundary, the cap, the receipt, the stop rule) but they
are not "tested code chooses the click" — `design/VERBS-PLAN.md` says so at
length, and the next phase (resume-on-yes to press the button) is
deliberately NOT built.

**7 SEP — THE COACH-TAB BUG, PROPERLY; AND THE DISCOVERABILITY LESSON.**
He reported the sideways pan STILL there after the first fix, and asked
where the 3D form figure was. Both were fair, and both taught the same
thing.
- **The pan, root-caused and fixed.** My first fix (overflow-x:hidden on
  main) only CLIPPED it. Reproduced properly by connecting a devtools page
  to the live server (a generated `public/_devconn.js`, deleted after —
  the token never entered the transcript) and staging his REAL sessions
  panel into the Coach chat: the `.nv-pane` measured **403px inside a 390px
  viewport**. Cause: a flex item's `min-width` defaults to `auto`, so the
  pane would not shrink below the panel's nowrap rows. Fix: `minWidth: 0`
  on both panes and the chat log, `min-width/max-width/overflow` on the
  VoicePanels Card. Measured after: natural width 390 = viewport, zero
  offenders WITH clipping disabled.
- **The 3D figure was built, shipped, and unreachable.** `Body3D.jsx` is in
  the bundle and works on his data (verified live: Weighted Pull-Up, lats
  and biceps lit, drag-to-turn). Its only doors were a dotted underline on
  Today's plan list — WHICH TODAY HIDES ENTIRELY while a session is in
  progress — and a long-press in the picker. Now: a visible **◉ 3D** chip on
  every exercise row in the cockpit and the routine detail.
- **The gym by voice had no door at all.** The cockpit now carries a
  hands-free strip naming the actual phrases, tapping through to Voice.

**THE LESSON, for every session after this one: a capability he cannot find
is a capability he does not have.** When a build finishes, the last step is
not "tests pass" — it is "point at the pixel he taps". If there isn't one,
the feature is not done. Two of his three complaints this week were this.

**6 SEP (late night) — PHASE 3, ATTACHMENTS, THE COACH-TAB GLITCH, THE
GRANT.** His grant: `.claude/settings.local.json` now allows
`Bash(node scripts/nova-api.mjs:*)`, `Bash(shortcuts list)`,
`Bash(shortcuts run:*)`, `Bash(launchctl kickstart:*)` — sessions may drive
the server, run his real Shortcuts and reload the service without the
classifier. Built tonight: ATTACHMENTS (photos/videos with a question, both
composers, live-proven: Ask Nova read a screenshot off the real server and
named the screen and its protein figure); the remaining PHASE-2 VERBS
(todo.add, recipe.slot, journal.add, stash.add, money.category, all with
undo); PHASE 3, THE GYM BY VOICE (`src/gymVoice.js`, client-side, zero
round trip; finish needs his yes); the COACH-TAB "screen moves around"
glitch (his recording: the content panned sideways — `main` is now
`overflow-x:hidden` and chat bubbles are shrinkable; the 16px-input rule
and the scale-locked viewport were already there, so this was a wide child,
now clipped at the scroller). Read `design/VERBS-PLAN.md` for the whole
shape. NOT built: the browser hand (designed); reminders by voice;
settings-as-words. NOT verified: the gym flow on the gym floor; the Coach
tab visually with live data (demo has no Coach tab).

**6 SEP (night) — THE VERBS, PHASE 2 + THE FIRST HAND, LIVE-PROVEN.** The
permission wall is solved: `scripts/nova-api.mjs` reads API_TOKEN in-process
and prints only the response, so a session can drive the real server
without the token ever reaching the transcript (`node scripts/nova-api.mjs
POST /api/ask '{"question":"…"}'`). With it, proven on HIS vault tonight:
"I bought verb test item" → ticked in <1s, no model, receipt undone and the
test item removed; "what is going on with the verb test item" → answered
from the ledger; "should I deload this week" → routed to THE COACH'S OWN
TURN (`lib/coachTurn.js`, the route's assembly moved untouched) and back
into the front door as "» COACH", grounded in his real weeks. The Leader is
a router lane (tight LEADER_RE) answering the same way. The first Hand:
`lib/hands.js` runs his own Shortcuts (`shortcut.run`, confirm-first until
listed in `server/data/hands.json` {"immediate":[…]}; "goodnight" as a
whole utterance is the Shortcut of that name; tested with an injected
runner — NO real Shortcut has been run from a session). The browser hand is
designed in `design/VERBS-PLAN.md` ("The Hands"), not built: the model is
the actor there, and the plan says so. Also fixed: two snapshots of one
file in the same millisecond shared a name (the Guardian flake — real, now
gone). NEXT: the remaining Phase-2 verbs (todo.add, recipe.slot, journal,
stash, money category, reminders, word-settings), then Phase 3 (the gym by
voice), then the browser hand read+navigate+fill first.

**6 SEP (evening) — THE VERBS, PHASE 1.** His brief after the Astra reel:
every feature by one sentence, spoken or typed, delegation invisible, no
dead air. The full plan is `design/VERBS-PLAN.md` (read it before touching
this). Built and shipped today: `server/lib/verbs.js` — the action registry
(11 verbs: to-do tick/reopen/move, shopping tick/untick/qty/clear, meal
eaten/uneaten, plan priority done/skipped, run the plan), name resolution
that never guesses (tie → "which one?", miss → says so), every act receipted
on the rails with undo (route `act`), a strict grammar that runs the sure
commands in under a second with no model (`tryCommand`, in `/api/ask` and
the Siri lane after the reflex), and the `ACT` directive for the model
(catalogue GENERATED into the prompt by `describeForModel`). The status
reflex answers "what's going on with the X?" from the record ledger. A
proposed plan now lands in the transcript with the yes/no chip, so a spoken
"yes" runs it. Client: the Done strip with Undo on the message; BY VOICE
receipts in the Inbox. Tests: `verbs.test.js` + the status reflex. NOT
verified on his real vault from here — the auto-mode classifier refused to
read API_TOKEN for a local curl; the suite covers the logic end-to-end on a
temp vault. His first spoken "tick off X" is the live proof; the service log
prints `verb hit [todo.done]`. NEXT: Phase 2 (Coach/Leader answer in the
conversation; more verbs), Phase 3 (the gym by voice).

**6 SEP — EVERYTHING VERIFIED LIVE ON THE URL HIS PHONE LOADS, THE PLAN
HANDOFF PROVEN ON A REAL RUN, AND THE MATERIAL PASS EXTENDED TO EVERY SCREEN
(tokens everywhere; and, as of 6 Sep midday, HAND SWEEPS ON EVERY SCREEN —
the last fourteen files went through Controls.jsx in three scripted
batches; what remains is the classic MissionControl fold, the
screen-identity header rows, vals-built chip styles, and Ambient, which is
a wall face and was left alone on purpose). Earlier, 5 Sep night — THE MATERIAL PASS: "Nova
feels stiff" answered by measurement and a sweep. The daily screens are set in a shared control
vocabulary (src/Controls.jsx), cupertino cards lost their outlines, 15
toasts that restated a visible change are gone, tab hops are instant,
sheets drag to dismiss, the deck's next card rises. Verified on his data at
375×812 with before/after shots; tap→paint measured at 12–22ms on the
production build, so the deferred memoization stays deferred. Earlier the
same day: the first plan run and its handoff fix, A3 and C1.**

GOAL (this session, 4–5 Sep): (1) the UI audit and its unambiguous fixes;
(2) Nova as chief of staff — chat as the front door, a capability registry,
multi-step plans; (3) the Lyfta-style exercise library — anatomy, cues, form
videos with timecodes, a 3D figure; (4) his picks from the audit mockups.

DONE CRITERIA — all MET, each verified in the browser at 375×812 on his real
data and confirmed live by `scripts/verify-shipped.mjs --server`:
- Audit fixes: notification width, clamped titles (also at the WRITE site in
  inbox.js), protein chart verdict + today excluded, absence states across all
  THREE vitals renderers, calendar dedupe, blank-screen fallback, filing ladder
  collapsed, Plan Today's JSON salvage, stale-error reaper, local dates.
- Phases 1–4 of `design/` "Nova as Chief of Staff": chat routes to job lanes
  (watch/weave/study/research/book/code) with an announce+undo strip;
  `lib/capabilities.js` is the three-way contract (router ↔ route ↔ registry,
  tested); `lib/plan.js` + `lib/planner.js` propose, validate (his-language
  refusals), schedule in waves, run, report; Phase 4 removed the Inbox lane
  buttons, folded the palette into the chat (⌘K/✦ ASK open Voice; route chip
  on the composer), thinned the ingest modal.
- Exercise atlas: `lib/muscles.js` (18-region closed vocabulary),
  `lib/data/exerciseAtlas.js` (135/135 anatomy+equipment), `exerciseCues.js`
  (135/135 seeds, HIS vault cues win), `src/BodyMap.jsx` (2D, animated by 17
  movement patterns), `src/Body3D.jsx` (three.js, lazy 512K chunk, same
  patterns as joint angles), `lib/exerciseVideos.js` (free yt-dlp search,
  timecodes via chapters, daily fill job with granted autonomy).
- Mockups he picked: A1 deck (Inbox), C2 one thing + C3 record moment + B1
  rings (Mission Control) — built into BOTH `MissionControl.jsx` and
  `MissionStructured.jsx`; his phone renders the STRUCTURED one.
- The exercise card is reachable from Train (`src/ExerciseSheet.jsx`,
  `POST /api/panel`): long-press a library row, or tap a name on Today's card.
- A3 — `src/inboxDigest.js` (pure, tested) + a triage strip above the deck:
  routine (high-confidence CAPTURES only → FILE N ROUTINE through the same
  approve rails), patterns (≥2 on one subject → SEE ALL focuses the list),
  decide. His real inbox read "16 waiting — 12 on 5 repeating subjects, 4 to
  decide" with nothing offered as routine — correctly.
- C1 — `src/missionFold.js` (pure, tested) + `FoldRow` in
  `MissionStructured.jsx`: after the first two sections of the hour's order,
  each section is a header + one status line derived from the same view model
  (a missing value is a dash); WORKING and PLAN never fold; opened/folded is
  remembered per section (`novaos.mcFold`). Built in the STRUCTURED renderer
  only — `MissionControl.jsx` (the other layout) does not fold; add it there
  if he ever switches novaStyle.
- The planner handoff: `handoffFor()` hands every needed prior output over by
  code (the model forgot `{{s1}}`), `summarise()` carries `payload.body`
  (it read `d.body`, which no lane sets — the Watcher handed on its title),
  and `startResearch(…, { context })` carries material the 500-char question
  cannot. Pinned in planner.test.js + researcher.test.js.
- Quick fixes: deck footer says PICK A MODEL ABOVE on a model-choice card; the
  0% ring's label carries its tone; the video fill job retries a miss with the
  muscle group in the query.
- THE MATERIAL PASS (his "Nova still feels stiff", answered first by counting:
  897 mono vs 180 UI-font declarations, 376 tracked 8–10px micro-labels used
  as tap targets, 413 one-pixel borders, 266 toasts).
  · `src/Controls.jsx` — Eyebrow / TextAction / Chip / Tag / Meta / Segmented:
    a label is a MATERIAL decision like fonts and radius; Apple styles get
    sentence case in the UI face at thumb size, Command keeps the console
    idiom (CSS uppercases). Screens write the words once, in sentence case.
  · Swept: Inbox.jsx (43→5 labels; what remains is the screen-identity
    header), MissionStructured.jsx (12→0), Workouts.jsx (41→6: header +
    demo-only MockWorkouts), TrainToday.jsx (20→1), MobileChrome.jsx (✦ Ask,
    tinted chips). Filled buttons are style-aware via local `btn/outline`
    (Workouts, TrainToday) and `primary/secondary` (Inbox) helpers.
  · index.css: under cupertino `.nv-pane` has no border and a slightly
    firmer fill; the edge token stays for inputs and separators.
  · Toast diet: 15 removed (discard, "Updated ✓", routine deleted, session
    updated, carry-over moves, focus-block start, three "fresh conversation",
    wake-word toggle, loop mode set, two "rule updated"). The other ~250 are
    errors, guards and background receipts and stay.
  · Motion: `navigate(screen, { instant: true })` for tab/sidebar hops (the
    cross-fade stays for programmatic navigations); `src/useSheetDrag.js`
    on ExerciseSheet and PortionSheet (grab zone = handle row, imperative
    transform, throw past 110px or fast); `.nv-deck-rise` on a new top card.
  · 6 Sep, TIER ONE everywhere: 582 mono micro-label fonts + 277 trackings in
    49 files became per-style tokens (`--nv-micro-s/m/l`, `--nv-micro-track`,
    `--nv-micro-track-wide`; Command = the console, Apple = UI face 11–13.5px)
    — one mechanical codemod, syntax untouched. Case, borders and hit areas
    on those screens are the hand sweep's job.
  · 6 Sep (midday), THE HAND SWEEPS ARE COMPLETE: Money, Leader, Journal,
    Stash, Galaxy (batch A), Library, Ops, Claude Code, the classic Sidebar
    (batch B), RecipeOverlay + MealEditor, AddRecipeModal, the Companion
    panels (VoicePanels), VerdictCard (batch C) — scripted edits with
    exact-string anchors (scratch batchA/B/C.mjs), never sed on JSX. The
    Claude Code workspace pair became a `Segmented`; Ops' receipt/status
    micro-strings are `Tag`s; the Companion cards' labels are sentence-case
    once and Command's CSS uppercases them. Ambient (the wall face) was read
    and deliberately left: its tracked caps are the design. Cleaned every
    unused import/const the sweeps left (incl. five stale `M` constants), and
    the RingTile `key`-in-spread React warning in both Mission layouts.
    Four verify-shipped markers followed their strings ("Recent sessions",
    "Leadership · daily practice", "a sentence becomes something that runs",
    "pinch to zoom"); all 42 UI markers present in the fresh dist. Visually
    checked at 375×812 cupertino: Library, Claude Code (Segmented, Run),
    Fuel + the recipe overlay (Macros/Servings/Ingredients, × Close). NOT
    visually checked: Ops (live-only — the auto-mode classifier refused to
    read API_TOKEN for the isolated dev page, so demo mode was all I had),
    Journal/Stash/Money/Leader/Galaxy renders, VerdictCard, VoicePanels —
    they build and lint clean; look at them on the phone.
  · 6 Sep, HAND SWEEPS on top: Voice (station frame kept — his 20 Aug ask;
    transcript + composer in the UI face at reading size; Brief me / Ambient
    / ritual / Yes-No-Later / Remember / Just answer it / Send as controls),
    Fuel (hero chips, rotation, log bar, edit-entry, recipe-card Log this),
    Notes (Studio chips, review summary, Linked in Galaxy), To-Do (Add,
    category, Stale, Done eyebrow), Shopping (Add, Clear/Undo/Keep, category
    eyebrows, Confirm completion). verify-shipped markers updated with the
    strings they read ("Apply it", "Coach said", "Per exercise", "couldn't
    check") — the checker is a reader of a contract the sweep changes.
- APPROVE ON A FINISHED PLAN FILES ITS REPORT (6 Sep). It used to re-run the
  plan (~US$4 again): the report was a bare title/body the filer could not
  file. `reportDecision()` makes it a note decision, `reportTitle()` drops
  the goal's URL (the title is the vault filename — the first one was named
  after a YouTube address), and `approveRecord` files a finished plan instead
  of dispatching it, normalising older records. His three artefacts were
  approved this way and are in the vault (Source + transcript, brief, report).
  Lesson paid for: an undone record cannot be re-approved on the rails; the
  only way back was a disk edit across a service restart.
- THE PLAN HANDOFF, PROVEN (6 Sep). Run `ad94d16a` (same vague phrasing)
  produced two independent steps and its Researcher died on a raw tab in the
  model's JSON → `parseModelJson()` in `lib/jsonSalvage.js` is now the one
  entry point for 20 lanes (control-char repair, then stray quotes, then the
  ORIGINAL error), pinned in jsonSalvage.test.js. Run `7a4d70b3` ("list every
  claim … THEN check each of THOSE") declared `s2.needs=["s1"]`, the research
  record carried 3,953 chars of context, the brief says so itself, and the
  report is a claim-by-claim verdict with an honest gap. Six failed-run
  artefacts discarded; the good run's report, Watcher audit and Researcher
  brief are PENDING for him.

STATE (HEAD = the Notes/To-Do/Shopping sweep commit; every earlier commit
of 5–6 Sep was verified live by `verify-shipped --server` after its deploy —
the deployed GitHub Pages bundle carried the new strings and none of the old
caps ones, checked from a fresh isolated browser context at 375×812):
- The live URL cannot show HIS data from the MCP Chrome (Tailscale fetches
  hang there — memory nova-frontend-verification); proof of "live with data"
  is verify-shipped's marker fetch + the same bundle hash + localhost with
  his connection. His phone needs one reopen for the service worker to swap.
- Server process started after the last server edit (planner/researcher/
  jsonSalvage + 20 lanes); health 200; exercise-videos on the roster.
- Inbox holds the first plan's artefacts, all PENDING and his to judge: the
  plan report (`7bf8cee7`, honest: "only the Watcher's part was done"), the
  Watcher's verdict (`13938dcb`, sound) and the Researcher's defective brief
  (`4aee28c1`, titled "Watcher Claims Not Received" — discard it).
- Vault: 134/135 exercises carry a resourceUrl (19 deep-linked `&t=`);
  Fitness Goals has equipment + limitations; `Wiki/Profile.md` STILL MISSING.
- Server: `startVideoScheduler` runs daily, first pass 60 min after boot,
  registered on the Guardian roster as `exercise-videos` (26h).
- Suite 1081 green under `TZ=UTC` (the deploy's zone) — always run it that
  way before pushing; see DO NOT.

DECISIONS (his, 4–5 Sep):
- Chat stays a conversation; routing invisible until it matters; a job lane
  announces + offers JUST ANSWER IT rather than asking first.
- A PLAN never runs without showing him: proposed → his approve → run.
  Ceiling $6 / 6 steps (I first said $3; the real per-lane ceilings summed his
  own example to $5). Coach and Claude Code are reachable but never delegated.
- Form videos: the daily job may WRITE links unasked (a link cannot corrupt,
  backed up, undoable) — the one lane with granted autonomy; the reasoning
  lives in exerciseVideos.js so it is not read as precedent.
- Pulse budget stays $0.50: the 8-search cap already fixed it ($0.20–0.29/run).
- A1 first, then (his "proceed with the next builds", 5 Sep) A3 and C1 the
  same day rather than after a fortnight.
- "Routine" in the Inbox means what the auto-high rung of HIS filing ladder
  would file: high-confidence captures. An agent's product is never routine,
  whatever confidence the agent stamped on it (the first cut would have filed
  two research briefs and two video verdicts unread).
- Labels are material (5 Sep). Under the Apple styles a control is a
  sentence-case word in the UI face with a 40px hit area, a card is a fill
  not an outline, and Nova does not toast what he can already see. Command
  keeps its console idiom through the same components. New daily-screen UI
  goes through Controls.jsx, not a fresh `font:600 8.5px mono` string.
- The PWA cannot do haptics (WebKit has no vibrate); a native wrapper is the
  only route and is HIS call — not started.

VERIFIED (this session, with locators): every item above was exercised on
the running app — see the commit bodies from `e91eac2` to `fff89ae`.
- Material pass: before/after screenshots at 375×812 on his data (Inbox,
  Mission Control top + folds, Train Today) — published for him at
  https://claude.ai/code/artifact/4b7c2823-ee15-429c-9142-5a8b88b2049d ;
  console clean; production
  preview on the same origin measured click→second-rAF at 12–22ms for
  twelve interactions (deck/list, see-all, expand, fold, tab hops, Train
  segments), DOM 644 nodes. The trace's 69ms forced reflow was my probe's
  `innerText` scan, not the app; its two 0.06 layout shifts were my
  scripted fold taps.

ASSUMED:
- (The handoff is no longer assumed — proven on run `7a4d70b3`, see DONE.)
- The Tier-one token pass reads well on every screen. Verified visually on
  Voice, Fuel, Settings-adjacent and Notes at 375×812; the long tail (Ops,
  Library, Money, Leader, Journal, Stash, Galaxy, Ambient, Claude Code,
  classic MissionControl, Sidebar, overlays) was checked by build + lint +
  the 42-marker sweep, not by eye.
- The name-tap path on Today's card (no plan rows were rendered when checked).
- The Leader's daily card stays on-domain (two good scheduled runs seen).

OPEN — HIS:
- THE NATIVE SHELL (his approval, 6 Sep): everything that does not need Xcode
  is done and committed — `capacitor.config.json` (loads the LIVE URL, so
  Pages deploys reach the app with no store release), `ios/` (SPM project,
  Haptics + StatusBar plugins), `src/haptics.js` bridging the five patterns
  to the Taptic Engine, `npm run native:ios`. This Mac has only the Command
  Line Tools: he must install Xcode, run `npm run native:ios`, pick his team
  under Signing, plug the iPhone in and press Run — `native/README.md` is the
  runbook, including the free-team 7-day expiry.
- Reopen Nova on the phone once so the service worker takes the new bundle.
- `Wiki/Profile.md` — four answers; the planner reasons without it.
- Hand-pick a Carter Extension video (the search cannot find one that names
  the movement; the rule is right to refuse).
- KEEP REMINDING (his instruction 5 Sep, logged in memory
  `nova-open-threads`): live cockpit mid-session on his phone; Telegram photo
  + voice from his phone; Scriptable widget re-paste.
OPEN — MINE, when asked: the fold for `MissionControl.jsx` (the non-phone
layout); a model naming the digest's themes ON TOP of the deterministic
groups, never instead of them; the remaining audit mockups he has not picked;
The hand sweeps, the filter chips, the identity rows and the type badges
are all DONE (6 Sep) — see the log. Nothing on the material pass is
outstanding; the next UI work is his to name.

DO NOT:
- Do not write a test that assumes his timezone. `localDate.test.js` built
  dates from "+10:00" strings and asserted the Melbourne answer; GitHub's UTC
  runner failed it and FIVE deploys silently died — he noticed before I did.
  Build test dates from LOCAL components; run `TZ=UTC npm test` before push.
- Do not edit one Mission Control renderer and call it done: his phone draws
  `MissionStructured.jsx` (novaStyle 'cupertino'); `MissionControl.jsx` is the
  other layout; the vitals tile also lives in `AppleLayout.jsx`. Three
  renderers bit twice today. Check the DOM's Group labels ("Vitals") to know
  which is mounted — and match case-insensitively; "Body" matched "Upper Body".
- Do not let one shared word match a form video: "Carter" matched a bandsaw
  setup guide. A title must name the MOVEMENT (stem of the last word) or share
  two words — `titleIsAboutThisLift`, applied at every pick.
- Do not run yt-dlp searches back to back with a short timeout: 19 "misses"
  were throttle timeouts, not absences. 90s window + 1.5s pause, and keep
  "nothing found" separate from "never came back".
- Do not read `curl --max-time 5` failing as the server being down: the Mac
  was at load 91 from Chrome renderers (my own devtools pages among them).
  Check `uptime` and `lsof -iTCP -sTCP:LISTEN` before touching the service.
- Do not bind test stubs to 4199 — it is his live Kokoro sidecar's port.
- Do not tell the planner its CLI budget: it read `--max-budget-usd 0.5` as
  the money available for the work and refused his example.
- Do not mount `intentRouter` with the Vault OBJECT — every lane spawns with
  `cwd: vaultPath` and needs the string.
- Do not `git add -A` a half-built feature when pushing an urgent fix; use a
  targeted add (the deploy unblock was pushed alone this way).
- Do not treat a record's `confidence` as his confidence. It is the AGENT's
  confidence in its own product; a bulk action must be gated on provenance
  (capture vs agent product), never on that field.
- Do not let a plan's step wiring depend on the model writing `{{s1}}`. A
  declared `needs` is honoured by code (`handoffFor`); a step's output is
  the lane's `payload.body`, not the record title.
- Do not pipe `npm run dev` through `head` in a background task — it killed
  the dev server mid-verification. Start it detached with a log file.
- Do not measure interaction cost with a probe that reads `innerText` on
  every element — it forces layout and shows up as the app's reflow. Find
  elements with `textContent`, then time click→second rAF.
- Do not add a new tracked-mono micro-label to a daily screen; use
  Controls.jsx. The console idiom is Command's material, not the default.
- Earlier DO NOTs (3 Sep) all still stand.

## SESSION LOG (append-only, newest first)

### 7 September 2026 (night) — swipe + per-dish variants, phase 4 edits, the sweep, and the athlete-AI queue
Fuel's last two pieces (f635eae), verbs phase 4 (414a934), a verified sweep of
the standing open-threads list, and design/ATHLETE-AI-PLAN.md scheduling five
builds off @krudd.jr's series. 1127 tests green under TZ=UTC.

### 7 September 2026 (evening) — the Fuel overhaul: options, ticks, the fridge, and macros from labels
Rotation v2 (options per slot, focus vs eaten, custom meals), the fridge
(portions.js + Meal Prep Portions.md, red OUT cards, IN THE FRIDGE row on
the recipe, meal.cooked / meal.portions verbs), and the editor's label pass
(labelMacros.js, scanFood label-per100 mode). All proven on his real vault
at 375×812 on the shipped bundle and restored. Two tests rewritten for the
v2 contract (★ in the body; setting a slot adds, never un-eats). Grammar
collision caught by the suite: "set eggs to 12" must stay shopping.qty.
Commits 8d294d5, 852fc4e.

### 6 September 2026 (late night) — phase 3, attachments, the glitch, the grant
His four asks after phase 2: grant sessions real Shortcuts + the browser lane
(→ the allow rules, his instruction); photos/videos to Nova and the Coach
(→ attachments, live-proven); the Coach-tab glitch from his recording (→
main clips horizontal overflow; bubbles shrink); then the remaining phase-2
verbs and the gym by voice (→ built, tested). Suite 1106 green under TZ=UTC.

### 6 September 2026 (night) — phase 2, the first Hand, and the permission wall
His three asks: fix the permission layer (→ nova-api.mjs, in-process token);
proceed (→ Phase 2: Coach/Leader answer in the conversation; the Shortcuts
hand); reach third-party apps and the web (→ Shortcuts built; browser hand
designed with the honest doctrine note). The auto-mode classifier refused
one command that created the Shortcut runner AND executed `shortcuts`; the
file was written with the editor tool and tested with an injected runner
instead — the capability is confirm-first by construction. Guardian
time-machine flake root-caused (same-ms snapshot names) and fixed in
backup.js. 1097 tests green under TZ=UTC. Service reloaded.

### 6 September 2026 (evening) — the Verbs, phase 1: doing by voice
Watched the Astra reel (frames + Whisper transcript via the watch skill —
the Chrome extension was not connected, the reel was public). Mapped the
command surface with an Explore agent (the evidence map is in this session;
its shape: speech reached capture, dispatch and coaching edits only). Built
the registry, the grammar fast path, the ACT directive, the status reflex,
plan-approval-by-voice, and the client strip. 1096 tests green under TZ=UTC;
the one failure on the first full run did not reproduce (flaky, not mine).
Service reloaded. Plan doc: `design/VERBS-PLAN.md`. FLAKE, not mine: guardian.test.js "the time machine undoes both ways" failed once locally and once on the CI runner, passed on rerun both times — likely two backupFile snapshots inside one second sharing a name; investigate if it recurs before blaming a change.

### 6 September 2026 (late afternoon) — the type badges: the material pass is complete
His "work on the type badges". The note list row's badge and the Fuel card's
category badge are `Tag`s (tinted pill, UI face, 11px under the Apple styles;
the bordered mono badge under Command is unchanged). Their strings, and the
Notes reader's byline + backlink line and the recipe overlay's meta, are now
written ONCE in sentence case — under cupertino `Meta` does not transform, so
an ALL-CAPS literal was rendering literally ("02 JUL · 14 BACKLINKS",
"HIGH PROTEIN · 25 min · FROM OBSIDIAN /RECIPES"). The demo fixtures in
data.js follow the same rule. The Leader's speaker tag was the last hard
`500 10px mono` literal in the vals and now takes the micro token. Five
unused vals imports removed. Verified at 375×812 in BOTH styles (cupertino:
tinted pills, "02 Jul · 14 backlinks", "High protein · 25 min · from Obsidian
/Recipes"; command: bordered mono badges, everything uppercased by the
controls), console clean, 1086 tests green under TZ=UTC.

### 6 September 2026 (afternoon) — the identity rows and the filter chips
His "Proceed with the next builds" → the two items still on OPEN — MINE.
`ScreenHead` (Controls.jsx) replaces the twelve hand-written identity rows
(numeral · hairline · tracked caps): Command renders exactly what it did;
the Apple styles drop the numeral and the rule — a numbered section is the
console's idiom, not iOS's — and keep the label as a grouped-list header.
Every header-label string in the vals is now written once in sentence case
("6 recipes · live from Obsidian", "Connect a backend in Settings"); Command's
Meta uppercases it. Voice's status badge is a `Tag`; Workouts' live dot rides
a cyan `Meta`. The Fuel and Notes filter chips ride `Chip` (the vals hand over
`active`, not a style); `chip`/`nchip` left shared.js. Verified at 375×812 in
BOTH styles (cupertino: pill chips + "VAULT · FUEL" small-caps row; command:
"X. — VAULT · NOTES" with bordered mono chips), console clean, all 42 UI
markers in the dist. Not built: the MissionControl fold (his style never
switched), the digest's model-named themes.

### 6 September 2026 (midday) — the hand sweeps finished, every screen off tokens-only
His "Proceed with the remaining hand sweeps": fourteen files in three
scripted batches (see CURRENT HANDOFF bullet). Build/lint/1086 tests green
under TZ=UTC; markers updated; visual check limited to demo mode for the
live-only screens because the token read was refused by the auto-mode
classifier. Dev server stopped, isolated devtools pages closed.

### 6 September 2026 (still later) — Settings hand-swept, a latent layout bug fixed

Settings.jsx was the last front-line screen still on tokens only. Full hand
sweep: About You, What Nova Has Noticed, Appearance (style/theme/core/calm),
Notifications, Voice, Navigation Order, Calendars, the Claude Models board,
Time Machine — every ALL-CAPS toggle and button through Controls.jsx, ACTIVE
badges as Tag, ON/OFF as Chip. Eyebrow/Tag/Meta gained `...rest` passthrough
(htmlFor, etc.). Found and fixed on the way: the voice-test row had FOUR flex
siblings under one `justify-content:space-between` (the content block, Build,
Research Browser, Test), so "Can you hear Nova?" collapsed to a one-word
column with Build's text printed over it — pre-existing, not caused by the
sweep, visible only once the row was actually looked at. Verified in both
styles at 375×812; MissionControl.jsx's (classic, non-cupertino) C1 fold is
deliberately NOT done — it has no ORDERS/section-key mechanism at all (a
linear JSX render, HUD satellites not grouped cards) and isn't his daily style
(his phone runs cupertino); building it is a design decision, not a port.

### 6 September 2026 (later) — the artefacts filed, the native shell scaffolded

Approving the finished plan would have re-run it: fixed so approve files the
report as a note (URL-free title), then his three artefacts approved into the
vault. The native shell: Capacitor 8 around the live URL, SPM, Haptics +
StatusBar, the web bridge in haptics.js, a runbook for the Xcode steps only
he can do on a Mac that has no Xcode.

### 6 September 2026 — live-proof, the plan handoff proven, the material pass everywhere

Checked the deployed bundle from a fresh isolated context (new strings
present, old caps absent) and the server process against its code's mtimes.
Re-ran the plan twice: the first re-run exposed twenty lanes parsing model
JSON without repair (a raw tab killed the Researcher) — fixed with one entry
point; the second, phrased to force the dependency, proved the handoff with
3,953 chars of context and an honest claim-by-claim report. Then the token
codemod (582 fonts, 277 trackings, 49 files) and hand sweeps on Voice, Fuel,
Notes, To-Do, Shopping, each deployed and verified live in turn; the
verify-shipped markers moved with the strings they read.

### 5 September 2026 (night) — the material pass

"Nova still feels stiff." Measured before diagnosing: five of six type
declarations were the tracked mono micro-label and those were the tap
targets; four hundred one-pixel borders; a toast for every action. Built
`src/Controls.jsx` so the label is a material decision per style, swept the
four daily surfaces, unbordered cupertino cards, removed the toasts that
restated visible change, made tab hops instant, gave sheets drag-to-dismiss
and the deck a rise. Measured after: 12–22ms per tap on the production
build — no jank case, so P8 stays deferred. Left for him: the native
wrapper (haptics), and the remaining screens.

### 5 September 2026 (late) — the first plan run, its handoff bug, A3 and C1

Three commits, `1b023f4`→`368e27f`. The plan loop ran for real (Watcher →
Researcher) and the report's first line was that the comparison had not been
done: the Researcher never received the Watcher's claims. Root causes were a
placeholder the planning model forgot and a summariser that read a field no
lane sets; both fixed by code, the Researcher gained a context channel, all
pinned in tests, not re-run (his money). Then A3 — whose first cut exposed
that agent confidence is not his confidence — and C1, both verified on his
data at 375×812 on the layout his phone draws.

### 4–5 September 2026 — the delegation loop, the exercise atlas, the audit's fixes and its first mockups

Twenty-one commits, `7cd9e16`→`fff89ae`. In order: the brief-audio replay bar;
the notification-width fix; the exercise atlas and animated figure; the UI
audit (artifact) and its unambiguous fixes; the chief-of-staff plan (artifact)
and Phases 1–4; Plan Today's JSON salvage and the stale-error reaper; form
cues; local dates; form videos found free (not $105) with timecodes and a
daily fill job; the 3D figure; the bandsaw rule; A1/C2/C3/B1; the exercise
sheet on Train. Two things he caught that I had not: five deploys had died on
my timezone-bound test, and the 3D figure existed only as a chat panel. Both
fixed the same day. The full per-commit reasoning is in the commit bodies.

### 3 September 2026 — the audit's last roster items, and the Leader learning to talk about his team
Finished #18 — every §6 item across all 66 reports is now shipped, met by
another item, or deferred with a reason, and the 547-line per-item record
moved out of the handoff into
`design/audits/2026-08-full-audit/00-COMPLETION-RECORD.md`. Shipped [37]–[46]
plus the surfaces [47]–[66] in five batches: the Leader's resumed-turn live
line and HEAD-checked research links, the pulse's novelty memory and named
cap, the evening brief warm, old-month health-mirror corrections, late-fire
reminder honesty, Todoist telling a deleted task from a completed one (gate
opened by probing his real account with two scratch tasks), the overnight
queue's one retry and late-landing reconcile, Ops match-lines for the study
lane and Scout, the Money list cap, chip ages and mark-handled on the Leader
screen, and the Ambient wall's sync age, stale dimming and OLED drift.

Three things were corrected rather than added. The pulse lane had been
failing 1–2 of 3 topics most nights since roughly 20 August, logging only
"exited 1"; one measured run showed the real cause — $1.06 of searching
against a $0.50 cap — so failures are now legible with cost receipts and the
prompt caps searching at 8, while the budget itself was left as his decision
rather than quietly raised. The plan's DONE/SKIP marks were recorded here as
unbuilt; they were not, and a live run over the real HTTP route proved the
whole loop including both consumers, so the handoff was wrong, not the code.
And the phone-width pass found three real defects that code review had not:
a satellite sitting across the core's status label, a 26×11px CLEAR control
on the action he takes four times a day, and a concept card wearing the daily
review's name.

Then his own three asks. He screenshotted the Leader saying "Budget Your
Stress Like Your Sets" and named the problem exactly: that is not managing,
leading, inspiring or directing a team. Measuring the corpus against his real
127-page shelf showed six of seventeen "leadership" matches were body pages —
"Manage" admitting Stress Management and Waist Management, "Frame" admitting
The X-Frame & High-Value Aesthetic Muscles — while the daily idea was
separately being handed a fleet block that is almost entirely training and
nutrition. Fixed at all three levels, and verified by regenerating the card,
which now reads "Delegate The Decision, Not Just The Task". Built the
exercise-targets preview he asked for, so today's card names the muscles and
expands to every lift before BEGIN SESSION. One durable trap learned: the
devtools browser's clock runs hours behind his, which sent me chasing a
training schedule that had never changed.

### 30 August – 2 September 2026 — the full-platform audit, and shipping its top findings
Audited all 66 agents and surfaces read-only, one per turn, then executed the
synthesis in tier order. The audit's own headline finding got worse on
contact: `--allowedTools` is not enforced under bypassPermissions, and where
the item-by-item read had found three unguarded spawn sites, a mechanical
sweep found fourteen — seven of them passing `--allowedTools ''`, meaning "no
tools please", while the model could in fact write files and run shell. Fixed
by denying the complement of what each lane asks for, so the allow-list is
enforced by construction. Proved with a canary after the obvious check —
asking the model to list its tools — returned two contradictory answers a
minute apart, one naming "PowerShell"; that method note is now in the module,
because it is the sort of thing that gets re-learned expensively.

Then Tier 1. The workout save was replaying through the offline outbox and
filing a second session — double-counting exercise state and re-firing the PR
ping and the Coach debrief — now idempotent on a client-stamped key, with the
PR celebration still returned on a replay since a lost response means he never
saw it. Health Insight was retrying an uncapped $0.50 compose every hour from
06:00 to midnight whenever it failed, silently; capped at three, with the last
failure announcing itself, and the lane got its first test file. Guardian was
watching 13 loops beside a roster of 29, so sixteen agents could die
unnoticed; it now derives the watch from the roster — verified live at 29 —
and five weekly agents whose exact-day windows a sleeping Mac could miss now
stay open for the rest of their cycle.

Corrected rather than added: a health-mirror test asserted a row for the 2nd
of the current month, which the page builder correctly drops as future — so it
failed every 1st, and had already broken two Pages deploys that day before it
was noticed. The deploy pipeline, not just the test, was the casualty. Suite
went 713-with-one-failing to 727 green.

### 27–30 August 2026 — the black screen, the ambush sheet, the once-a-day brief, an ingest cap that ate a job, and food macros that compute instead of recall
Four real failures, fixed in two commits. The black screen and the ambush
review sheet turned out to share one root cause: boot-resume trusted a
job's status from the server's list without loading its preview, so
`IngestReview` rendered a "ready" branch against null and threw, taking the
whole app down — reproduced at phone size before touching anything. Open
work now surfaces in the WORKING panel instead of seizing the screen, and
the same load-before-render ordering that fixes the ambush also fixes the
crash. The brief was marking itself "delivered" only when audio actually
played, but an auto-brief has no user gesture behind it, so iOS blocked
autoplay almost every time and the retry re-read the whole brief on every
open — now marks on delivery, server-side, shared across devices.

Then two complaints in one message. A vault-ingest video hit a $3 cost cap
— sized for a pasted note, applied indiscriminately to full weaves — spent
$3.08, and was killed with nothing written; raised both budget constants to
env-overridable backstops (25/40) reframed explicitly as guards against a
runaway loop, not spending controls. And food-macro logging gave two
different totals for the identical pizza description (1050 kcal/50g, then
940/36g) — traced to the prompt telling the model to answer "from your own
knowledge, no search" for most foods, which guarantees a different
plausible number every time since LLMs don't recall numbers reliably.
Rebuilt along the platform's own line: the model now only decomposes food
into components with gram weights; a new `nutritionFacts.js` looks each up
in USDA FoodData Central, scales by weight, and derives kcal from the
Atwater factors, so a stated kcal that disagrees with its own macros is now
impossible by construction. Verified live: the same pizza returned
identical totals (2,408 kcal/129g protein) across repeat calls, all four
components matched and source-attributed. While confirming no jobs were
in-flight before this session's own restart, found that a PRIOR restart had
in fact orphaned an in-progress job — his Atomic Habits ingest — which
directly answers, in the negative, the previous handoff's open question
about whether it ever completed. 709/709, lint 0, build green both times.

### 25–26 August 2026 — evidence on screen, the phone-voice bugs, the ship-verification crisis, and Coach reading his own notes
Started from his complaint that Nova speaks a lot without anything to look
at, and ended up rebuilding how "done" gets claimed at all. Made every
spoken Ask-Nova/Coach answer infer a visual panel deterministically (code
picks the shape from the question, never the model), added a `sessions`
panel that didn't exist, and wrapped every render site in an error boundary
— there was none anywhere in the app, so one malformed panel used to blank
the whole screen. He sent screen recordings of the phone voice failing;
watching them frame-by-frame (rather than guessing) found three separate,
unrelated bugs: the brief racing a TTS-status fetch and giving up silently,
a full-screen focus blur spotlighting a card rendered below the mobile
fold, and the iOS-audio "unlock" replaying his last sentence because its
audio element still held the previous TTS blob. Built findings-as-charts
(fuel findings had never exposed the numbers their prose quoted) and a
question-by-question brief close that reuses the existing inbox
approve/discard rails rather than inventing a new one. Let Coach apply
program edits from inside the chat — the write path already existed and
was tested, it just had nowhere to say yes from.

Then he said, plainly, that he no longer trusted "shipped" as a word from
me, and he was right to: nine commits had sat unpushed behind a blocked
permission classifier while progress kept being reported, a feature landed
in the one Coach-message renderer out of three that he wasn't looking at
(twice), and his PWA was silently serving a cached bundle for days because
`autoUpdate` updates the service worker, not the running app. Built the
actual failsafe rather than apologising again: a build id compiled from
the git commit (not a timestamp — those can't equal themselves across a CI
rebuild), a `version.json` the app polls and shows an UPDATE banner
against, and `scripts/verify-shipped.mjs`, which checks the LIVE deployed
bundle rather than the working tree. Running it immediately caught two
bugs in itself — a build id that could never match, and chunk names read
from local files that 404 against CI's different content hashes — which
is exactly the point of a script instead of a claim.

Closed by confirming, and it was true: Coach's progression engine, its
weekly detectors, the program audit and the Sunday debrief all ignored his
per-exercise session notes. A note reading "struggling to move 9.1kg
without a nudge of body momentum" could not stop a load increase, because
nothing except the chat ever read it. Built a narrow, suppress-only note
reader (a signal can hold a load increase, never create one) and wired it
through every surface that reviews his training — verified live: Cable
Lateral Raise and Alternate Incline Dumbbell Curl are now held, citing his
own sentences.

### 23–24 August 2026 — Phase C, the Librarian + Library, Coach that edits and judges the plan, and Fuel fixes he asked for twice
Finished the fluidity plan: writes now tag which slices they touched, so a
todo checkbox costs 3KB instead of 996KB (measured live). Two bugs only the
browser found — routes fire their own domain broadcast beside the chokepoint
one, which silently cancelled the whole optimisation, and one write emitting
two events made it sync twice. Built the Librarian (a book title + author →
triangulated dossier → woven vault pages, provenance-labelled researched vs
read) and the visual Library shelf with real Open Library jackets cached
server-side. Coach can now APPLY its suggestions to the real program through
typed ops with full undo, always behind a confirm sheet with a free-text box;
applied two changes to his live plan while he was at the gym. Then he pushed
back that Coach was "suggesting changes for the sake of them" — his data
proved it: 227 working sets, all RPE-rated, 88% at RPE 9–10, and the default
progression path never read RPE at all, so a shoulder press he was grinding at
RPE 10 kept earning +2.5kg. Effort now gates load everywhere and grinding
lifts get a tempo/control prescription instead of a number.

CORRECTED RATHER THAN ADDED: the "HARD SETS THIS WEEK" bar was showing LAST
week's numbers every Monday. A health-push failure that looked like my deploy
was actually one missing HealthKit metric making the whole JSON body invalid —
one absent reading was discarding every other metric. My first "too many
exercises" detector measured session length and could never fire, because he
already splits routines across days; the real signal (routines he cannot
finish) was in the same data. Copy that told him to earn FEWER reps than he
was already doing, and a proposal to cut Weighted Pull-Up 30 minutes after
Coach created it — both caught by running detectors against his real log
before shipping. And a CSS bug I introduced: adding the camera button pushed
the tweak panel's ASK button outside its card at phone width, which he found
after I called the feature live, because I had only screenshotted it at
desktop width.

### 23 August 2026 — model-cost fix, Coach's self-review, a shipped crash caught and fixed
He caught Coach hitting a "Fable 5 usage" limit mid-conversation — traced
to every unpinned Claude CLI call inheriting the account's ambient
default model, which had silently become Fable 5. Pinned Coach to opus
and 12 other automated background lanes to sonnet. Built the Coach's
program review (server/lib/coachProgramReview.js): three code-driven
detectors — a lift's name contradicting its filed muscle group, a lift
flat for 3+ weeks (swap suggested to the same muscle), a goal muscle
chronically under target — raised onto the inbox rails, surfaced in the
morning brief, the Train TODAY card, and Coach's own conversation
context, nudged at 3 and 7 days then escalated to Telegram. Verified
against his real vault: raised two genuine findings (a real Face Pull
mapping error, a real stale Cable Flys swap) that are still sitting in
his Inbox, intentionally. Added coach-chat auto-scroll-to-bottom and a
temporary mid-session exercise add ("this session only", never written
to the program) — but the first ship of the latter crashed his screen
black. Reproduced it properly on an isolated scratch server (a COPY of
his vault, throwaway port/data dir, his live backend untouched) rather
than guessing: found an undefined `${M}` font reference that only threw
at render time, plus a second bug where creating a brand-new exercise
mid-session was silently routed to the wrong destination (or worse, into
his real program if a routine happened to be open behind it). Both
fixed and re-verified on the same scratch repro. Also discovered and
fixed, mid-session, a real data-loss mechanism in inboxStore.js: writing
to it from a one-off script while the live server also runs risks a
silent cross-process cache clobber — the two coach findings vanished
once before I caught it and built the proper HTTP-route fix. 415/415
tests, four deploys, every bundle hash-verified.

### 18 August 2026 — mockup parity shipped + the audit that caught a live bug
P2 cockpit + one-bar log screen-verified and deployed. Visual-claims audit:
voice dynamics and canvas panels both proven real on screen; the audit
surfaced a genuine reply-loss bug (SW-update reload mid-speech ate the
answer) — fixed the same hour. Fuel cross-reference agent (spec #11)
built end-to-end with a true first finding on his real data; decline-asks-
why shipped on all Coach advice. 348/348 tests. Three deploys, every
bundle hash-verified against the harness-verified dist.

### 13–16 August 2026 — the Forge, the spoken lane made fast, and two wrong diagnoses
He sent an Instagram reel — a hand-built watchOS app dispatching Claude and
Codex jobs from the wrist, with live status in the Mac's notch — and asked
for the same, expanded. Watched it frame by frame (60 frames + Whisper
transcript) and wrote `design/WRIST-PLAN.md`: the key finding was that Nova
already owns most of what that author built from scratch (server, auth,
inbox rails, agent lights, SSE, Siri dispatch), so the genuinely new pieces
are a job runner, a notch HUD, and wrist dispatch. Built Phase 1, **the
Forge** (`lib/forge.js`): one spoken sentence → a real running artifact,
sandboxed to `~/NovaForge/`, live tool status on the existing rails,
persisted receipts, stop, and Telegram announcements including failures.
Verified with a real snake game — $0.90, 3m32s, 22KB self-contained HTML
that the job smoke-tested itself. Two bugs were mine and are recorded: the
plan's invented "Build" department (no such thing — Platform), and a
`stopForge` that mutated a disk copy so the stop flag never reached the
child.

The bigger thread was his complaint that Ask Nova from the watch felt so
slow it defeated the point. That was measurable, not a feeling — 14.2s,
15.9s, 23.9s sat in the request log. Cause: `/ask/sync` minted a NEW
conversation per ask, paying context assembly, a cold CLI boot, and prompt
cache creation every single time, because the warm pool is keyed by session
id and a fresh id can never hit it. `lib/spokenSession.js` now keeps one
conversation with day/age/turn caps and re-states the volatile numbers per
turn: **2.1–2.2s resumed, 11.5s cold**.

Then he said Siri still wasn't answering, and I got it wrong twice. First I
found and fixed a real bug — the keepalive drip prefixing the JSON body with
spaces, which Shortcuts could not parse — and reported it as the cause. It
was not; it had only ever affected slow answers, and my post-fix tests all
returned in 2s and looked clean. He said it still failed, so I added a raw-
body receipt, and that finally showed the truth: his Shortcut had been
sending the literal words `"Provided Input"` — the variable's NAME instead
of its value. One screenshot from him confirmed it in seconds. He rebound
the variable and it now works from his phone (`"8,538 steps on August 15th,
sir."`). The server now refuses known Shortcuts variable names out loud
rather than politely asking him a question he cannot answer hands-free. Also
untracked a PDF that a careless `git add -A` swept into a commit.

### 13 August 2026 — alarm-stop confirmed live; steps-parity thread opened and paused
The alarm-stop automation fired for the first time, cleanly, at 07:25 local
— filed 12 Aug's full health payload, `stepsComplete: true`, no errors. The
whole point of the prior close's fix, proven. He noticed Nova's steps
(10,022) sat ~1.1% under Apple Health's own figure (10,139) and asked why.
Root cause, confirmed against Apple's own developer forums: the true
cross-source dedup Health shows requires `HKStatisticsQuery`, a native
HealthKit API a Shortcut cannot call — Nova's per-device MAX fold is an
honest approximation, not a bug, and this project already proved the naive
alternative (no Source filter) is worse. Built a full adapter
(`lib/autoExport.js`, route `POST /api/health-data/auto-export`) for Health
Auto Export, a real app that CAN call the proper API, reusing the existing
shared ingest gate via a new `skipDateShift` option. Gate-clean (294/294
tests), live-tested with synthetic data, committed and pushed
(`84cadb5`) — but he then found the app wants a paid subscription and
declined to buy it right now. **Thread is parked, not abandoned**: the
adapter is built and waiting, untested against a real payload, for whenever
he decides to revisit it.

### 12 August 2026 (afternoon) — closing the health thread's last gap
He added the alarm-stop trigger on his phone — the previous close's fix is
now live end to end, pending tomorrow morning's first real run. Re-verifying
the previous handoff's claims by a second route (reading the pushlog and the
JSON files directly, not trusting the prose) surfaced a live bug it hadn't
caught: `server/data/health/2026-08-12.json` was carrying 11 Aug's
`activeEnergyKcal`, `walkingRunningDistanceKm`, `restingHeartRate`, `hrv`,
and `vo2Max` — 819 kcal and 15 km logged against 163 real steps. Cause: a
drill push made during the health thread's own testing used the literal
date `2026-08-12` instead of `yesterday`, landed as the day's first push
(so even the steps guard had nothing to compare against), and the other
accumulators had no guard at all — only steps did. Fixed by generalizing
`shouldDropLowerSteps` → `shouldDropLowerReading`, applied across a new
`ACCUMULATOR_METRICS` set (steps, activeEnergyKcal, walkingRunningDistanceKm,
sleep*); point-in-time metrics (RHR, HRV, VO2 max, weight) stay unguarded on
purpose since a later reading of those is just more current. Verified live
against the running server with a scratch date, not just unit tests. Today's
file repaired by hand. Gates re-run clean (287/287); committed, pushed
(`6b8751b`), service reloaded.

### 11–12 August 2026 — the health thread (concurrent session)
The steps saga ended, and not where anyone was looking. Three faults were
stacked: iOS **encrypts Health data while the phone is locked**, so the
00:05 automation had only ever succeeded on nights he happened to be
awake; my own monotonic-steps guard **exempted the current day**, which is
how a truncated 813 overwrote a genuine 11,107; and the missed-push
sentinel only shouted at *missing* days, so a stale midday partial sat
there in silence all morning. All three are fixed, and his locked-phone
test is what proved the first — automation fired, Mac awake and serving,
nothing arrived on either channel.

The fix that shipped is a clone, not a build. Six attempts at authoring a
`.shortcut` file failed on Shortcuts' own serialization (Statistics needs
an explicit input; hand-built date filters are inert) — each one costing
him an import and a run. What worked first time was fetching **his own
automation from an iCloud share link** and changing exactly two things:
the date token → the literal word `yesterday` (the server resolves it),
and the drop filename. Verified live: the full 8-metric payload filed
against 11 Aug, with the MAX fold and monotonic guard correctly keeping
his higher manual figure while every other metric repaired the day.

Two things were corrected rather than added. I wrote 11,107 back into
11 Aug from the pushlog without checking the window it was captured over —
it spanned midday-to-midday across two days and was never a valid daily
total; his manual 10,218 was right and mine was wrong. And I proposed a
fixed 22:30 push as a fix, which he correctly rejected: his bedtime
varies, so a fixed hour truncates the day unpredictably. Alarm-stop is the
only trigger that is both unlocked and after the day is complete.

### 10–12 August 2026
Nova learned to watch. The `/watch` skill became an agent — the Watcher —
and then a whole pipeline: a link in, transcript pulled locally, and either
a quick verdict (the Coach auditing a fitness video's claims against the
literature) or the full second-brain weave (Source, Concept, Entity and
Topic pages, wikilinked, verbatim transcript in `Raw/`). It ships with two
buttons because absorption costs ~$6 and triage costs ~$0.50, and he should
not pay the former to discover a video was filler.

Almost everything of value came from the failures, not the build. His first
real video — a 4-hour Hormozi podcast, 575k characters — broke the pipeline
four separate ways in sequence, and each break was a real bug: a budget cap
set by guess rather than measurement (a 150k chunk on the default Opus model
cost $1.46 against a $0.75 cap and died having written 218 tokens); a
2000-word payload wrapped in a JSON string that one raw newline destroyed;
an error handler that read stderr before stdout and so reported a harmless
"no stdin data" warning as the cause of a fifteen-minute failure; and the
weave itself dying at its own $8 cap on Opus. Measuring instead of guessing
fixed all of it — 60k chunks on Sonnet cost $0.35 and return 7k tokens of
dense notes — and the digest is now cached per video id so a retry never
re-pays. His question "will this duplicate anything?" was asked at exactly
the right moment: it would have, twice over, and video identity (by ID, not
URL) now prevents it.

Three things were corrected rather than added. The Watcher's first filing
put its note in `Wiki/Inbox` with `type: raw` and threw the transcript away,
so it never appeared under his Sources filter — it now writes his own
podcast convention. Four modules resolved a ghost `Claude%20Projects`
directory because the repo path contains a space (`URL.pathname` instead of
`fileURLToPath`), silently stranding a transcript and emptying the stream
feed's heartbeat reads. And ready ingest jobs lived only in memory, so a
$6 diff died on a server restart and had to be applied out-of-band — they
persist to disk now, drilled with a real `launchctl kickstart`. The 4-hour
conversation is in the vault: 41 changes, 19 new concepts, 11 existing
pages deepened rather than forked.

### 7–9 August 2026
The session split in two. First, a long Shortcuts saga: Ask Nova and Tell
Nova failed for hours through five different causes — a stale POST body, a
missing `text` field, a literal "Provided Input" placeholder, a colon in the
auth header (my documentation's fault), and finally requests that never left
the phone. Fixing it properly meant adding request receipts to the server,
binding the tailnet IP directly, and cutting a spoken answer from 26s to 12s
by caching CalDAV reads and parallelising the ask context. The health-push
root cause was also found and closed — the Shortcut's Request Body, not its
queries — though the automation has since stopped firing again for two
nights, which is HIS to check.

Second, the build wave: reminders (with real Apple Reminders alarms),
proactive Telegram, open loops, the fuel scorecard, Ambient v2, the widget
endpoint, the Ops tap-through (delegated to a subagent), the health mirror,
the pattern scout, the About You interview, and the distiller. The turn that
mattered most came from reading the data rather than the backlog: 30 days of
receipts showed Nova produced ~154 drafts and he kept 9, with the flagship
briefs aging out unread. That produced the trust ladder — autonomy computed
from real history and proposed on the rails — whose first pass filed three
proposals that are still waiting. Two things were corrected rather than
added: Nova was inventing macros for "I ate dinner" instead of marking the
planned meal, and a distill record was silently clobbered by writing to the
inbox store from a second process (now in DO NOT, with an in-process
endpoint as the fix).


### 3–4 August 2026
Customisability. Fixed the bug in his screenshot — an ingredients-only tweak
could not be saved because the alternate validator demanded a method it was
never going to have. Made a follow-up refine the version on screen instead of
restarting from the stored recipe, and put a mic beside the ask box so the
whole exchange can be spoken, with the answer read back from the preview
only. Built `editRecipe`: ingredients, method and macros, on any recipe or
any variant, reachable from ✎ EDIT THIS MEAL.

Two things were corrected rather than added. The first cut of the section
writer passed every test while drifting his file — it ate a blank line
between a recipe's `---` and the next heading, and stripped the bold from
steps he never touched; the identity round-trip over his real collection is
what caught it, and the writer now rewrites only the lines that changed.
Second, I spent three rounds chasing a wiring bug that did not exist: the
edit button was absent from the running app only because Vite was serving a
cached module. Both are now in DO NOT. The overnight push also fired a
second consecutive night (12,619 steps filed for 3 Aug), so that criterion
moved from one data point to two.

### 3 August 2026
Closed the steps saga: first fully automatic overnight push landed
(8,295 for 2 Aug). Verified the pmset changes he ran. Corrected my own
diagnosis — both the sleeping Mac *and* a non-firing phone automation were
real, on different nights. Made a sleeping Mac survivable: added this week's
four screens to the offline cache and made "mark meal eaten" queue via the
Outbox. Answered the hosting question (frontend already on Pages; backend
cannot move to serverless). Established this handoff system.

### 2 August 2026
NovaBar diagnosed and fixed (empty icon image, unplaceable status item,
off-screen panel) — it now opens on launch and via ⌥Space. Phone dock made
symmetrical: three each side of the core, Train and Recipes in the default
slots, plus a FREQUENT row in the More sheet. Spread view transitions to
notes/routines/sessions and gave every clickable press physics.

### 1–2 August 2026
Presence, motion and latency: NovaBar built (Swift, no Xcode project),
shared-element transitions on recipes, instant spoken acknowledgement to fill
the 5–8s think gap, CountUp numbers. Topic Pulse shipped. Describe-it food
logging shipped. Recipe promote-duplication bug fixed and his vault repaired.
Variant rename, in-session exercise skip, Coach skip-awareness.

### 30–31 July 2026
Companion Phases 3–5 (voice-confirmed actions, references/research, rituals),
the doorman greetings, skill registry, Nova Operations screen, overnight
queue, Telegram bridge, ambient wall mode, inbox expiry, and the food-log
write-race fix.
