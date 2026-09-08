# The Athlete-AI build queue

Scheduled 7 September 2026, from Hayden's brief: watch @krudd.jr's reel, then
study what that creator is building and schedule the same class of capability
into Nova.

## What the source actually is

Kevin Rudd (`@krudd.jr`, 28k followers) — "100 Day Athlete AI Series", one
short build per day. Endurance athlete (marathon, Ironman 70.3, ultras) who
posts a working Claude setup and takes a comment keyword to send the prompt.
Ten reels read in full (day 8 nutrition; days 67–72 Garmin, jump height,
squat form, Strava, Ethiopian-marathoner study, plus two non-build posts).

**The shape of everything he makes, and it is the useful part:** a strict
protocol (how to film, what to upload, what to answer) → a model that reads
the input → an *interactive artefact* that holds the state → a plan grounded
in the person's real history rather than a generic template. He is not
selling intelligence; he is selling **the protocol that makes the input good
enough to be worth analysing**.

The reel Hayden sent (day 8, "Claude just killed MyFitnessPal"):
interview of 11 questions → BMR 1761 / TDEE 3038 / 2540 kcal target with a
498 kcal deficit, 175g P / 323g C / 61g F / 4.1L water, "~10 weeks at ~1
lb/week" → a confirmed-plan card he approves → a tracker app → log by photo
or by sentence, itemised per-ingredient breakdown with calories → "wrap the
day" for a one-line total.

## Honest read against Nova

Nova already has the *logging* half and better: photo scan, barcode,
describe-it, per-day food log, rotation with the fridge, recipes with real
macros from labels, and none of it lives in a chat that forgets. What Nova
does **not** have is the half that makes the numbers mean something.

| His capability | Nova today | Verdict |
|---|---|---|
| Interview → BMR/TDEE → macro targets he approves | targets exist in the profile but **About You is empty and always has been** | **BUILD — #1** |
| "Wrap the day" one-line close | daily snapshot exists, nothing says it aloud | **BUILD — #2** |
| Itemised breakdown when logging a plate | one entry, total macros only | **BUILD — #3** |
| Form analysis from a filmed lift (vision + pose, rep-by-rep) | Body3D shows an *animation*; nothing reads his own lifts | **BUILD — #4** |
| Study → personal plan grounded in real history | Researcher + Coach separately; nothing joins them | **BUILD — #5** |
| Garmin / Strava connectors | health arrives by his own Shortcut | skip — he owns the pipe already |
| Age-group benchmarking | — | skip — invented percentiles are exactly the fiction Nova refuses |
| Comment-keyword prompt delivery | — | not applicable |

## The queue, in order

### 1. THE INTAKE — an interview that ends in numbers he approved

**BUILT — 8 Sep 2026.** `server/lib/intake.js` (questions, `parseAnswer`,
`compute` = Mifflin-St Jeor × activity ± pace, protein 2.0/1.8 g/kg, fat
0.8 g/kg, carbs the remainder, every line printed), `routes/intake.js`
(prefill from the last weigh-in + the collection's height, answer parse,
propose → pending record kind `intake`), inbox route `intake` (approve
recomputes from the facts, writes `setTargets` — frontmatter keys AND the
`**Profile:**` prose line in the recipe collection — and `setIntake` on
`Wiki/Profile.md`; undo restores both files). The interview runs in the
Voice chat ("set my numbers", or Settings → About you → Set my numbers):
one question at a time, known answers offered as confirmations, the plan
as a gold metric card with the arithmetic in the chat, his yes files it.
Verified live 8 Sep: 188 cm and 84.9 kg (7 Sep weigh-in) offered, plan
card 2767 kcal / 170 g for the test answers, record discarded unwritten.
`profileContext` now carries "His numbers (Intake, date…)" to every agent.
The sweep on 7 Sep confirmed `GET /api/profile` → `null` and no
`Wiki/Profile.md`: every calorie target Nova shows rests on figures he never
set. Fix it the way the reel does, but on Nova's rails.

- A short deterministic interview (age, sex, height, weight, activity, goal,
  pace, eating style, limits) — one question at a time, resumable, in the
  existing brief-queue pattern.
- **Code computes**, never the model: Mifflin-St Jeor BMR × activity factor
  → TDEE → deficit/surplus by chosen pace → protein floor by bodyweight,
  fat floor by percentage, carbs as the remainder. Every number traceable to
  a printed formula in the file it writes.
- It lands as a **pending plan card** with the arithmetic shown, and his yes
  writes `Wiki/Profile.md` + the targets. Undo restores the prior.
- Re-runnable: "redo my numbers" after a weight change re-computes and shows
  the diff, the same way the phase-4 edit verbs do.

### 2. WRAP THE DAY

**BUILT — 8 Sep 2026.** `server/lib/wrapDay.js` — no model in it. `wrapFacts`
counts (food log vs the collection's targets, the uneaten rotation, counted
fridge portions, tomorrow's scheduled routine, weigh-in staleness);
`closerFor` picks the one dish that closes tonight's protein gap — fridge
first, one that FINISHES the gap over a smaller one that only dents it, and
never one that blows the calorie room; `askFor` ranks the one thing tomorrow
needs (empty fridge → missed floor → stale scales → tomorrow's session →
hold); `composeWrap` writes the sentence, and says what it could not read.
`GET /api/wrap`. On the glass: the Home card (appears once the plan is
ticked or after 6pm, dismissible for the day, READ IT TO ME / OPEN FUEL) and
"wrap the day" in the chat. Refreshes on every food-log write and rotation
tick. Verified live 8 Sep against his vault (targets 2200/150, fridge 3
dishes, tomorrow "Pull"); the Home card render was checked with an injected
evening payload, since the real evening had not happened yet.
One sentence at the end of the day: what he ate against target, what is left,
whether the protein floor was hit, and the one thing tomorrow needs. Spoken
("wrap the day"), and on the home card after his last logged meal. The
sweep's finding makes the case: the protein floor was hit **0 of 7 days**
last week at an 88g average against 150g, and nothing in Nova said so at the
moment it could still be fixed.

### 3. ITEMISED PLATE

**BUILT — 8 Sep 2026.** The contract: **when an entry has items, its macros
ARE the sum of them** (`macrosOfItems` in `foodLog.js`) — that is what makes
dropping one line arithmetically honest. `addEntry({items})` stores and sums
them; `removeEntryItem` recomputes the meal and takes the meal with the last
line; `restoreEntryItem` is the undo (it rebuilds an entry its last delete
emptied, clock time and provenance intact); editing an entry's totals by hand
DROPS its lines, because they no longer describe the number. Routes:
`DELETE /api/food-log/:id/item/:itemId`, `POST …/item/restore`. The describe
path already produced USDA-sourced components and threw them away at logging
time — now they ride. The meal/auto scan prompts ask for the breakdown too
(one line is not a breakdown, so a single component is dropped). On the
glass: lines under the entry with their own tap target, the pending breakdown
above the form before he logs, and a visible "Undo — put X back" for 30 s.
Verified live 8 Sep on his real log: 3-line plate → total 510 (code-summed,
not the model's), dropped a line → 350, undo → 510 with the line back in
position; test entry removed and his day confirmed byte-identical to before.
When a photo or a sentence is logged, keep the model's per-component
breakdown (3 eggs · 19P · 21 kcal, sourdough 54g · 140 kcal …) instead of
collapsing to a total. Each line individually deletable — which is what makes
a wrong estimate correctable rather than a lie he has to accept whole. Pairs
with `foodlog.fix` from phase 4.

### 4. FORM CHECK — his own lifts, read back rep by rep

**BUILT — 8 Sep 2026.** `server/lib/formCheck.js`, and the refusal is the
feature. Two gates before any review exists: code measures what code can
(`probeClip` → fps ≥ 48, 2–120 s, short side ≥ 540) and refuses with the fix
in the reason and NO model call; then the model's first job is a usability
verdict against the protocol (angle, framing, whole body) — an unusable clip
ends the run with nothing filed. Frames are deterministic (`frameCountFor`:
3/s, floor 12, cap 48, evenly spaced by ffmpeg). Rubrics are written per lift
(squat / deadlift / bench / press / row / machine-hinge + a generic
fallback), and a test asserts no rubric point contains a degree — asking for
one invites one. `scrubUnmeasurable` strips any degrees, centimetres,
percentages or m/s that survive the prompt and the note DISCLOSES how many
were removed. The review is a proposal on the inbox rails (kind `form`,
route `form`) whose body is the exact text he approved; it files to
`Wiki/Health/Form Checks/<date> <Exercise>.md` and undo is the same
hash-checked delete notes use. Doors: `Form check` on every exercise in a
routine AND mid-session (one shared `FormCheckPanel`, one view model), which
states the protocol BEFORE he films.
Verified live 8 Sep: a 30 fps clip refused by code with no model call; a
60 fps clip that was not a lift refused by the model ("a synthetic test
pattern… nothing anatomical to judge"); the client loop end to end.
NOT yet exercised: a real clip of his own lifting.
The most valuable of the five for a lifter, and the one Nova is closest to
being able to do honestly: attachments already accept video and cut stills
with ffmpeg.
- **The protocol is the feature**, exactly as in his squat/jump reels: side
  camera at knee height 2 m back for depth, rear camera at hip height for
  symmetry, 60fps, whole body in frame. Nova states it, and refuses to
  analyse a clip that breaks it rather than guessing from a bad angle.
- Frames extracted deterministically, the model reads them against a written
  rubric per lift (depth, bar path, knee travel, symmetry, tempo, lockout).
- Output is a **review he approves**, filed against that session's exercise —
  never advice presented as measurement. Numbers Nova cannot actually measure
  (degrees of hip flexion from a phone) are not invented; the rubric says
  what it saw, not what it computed.

### 5. THE STUDY LANE — a paper becomes a change to his program
His day-72 reel is a study of 14 elite Ethiopian marathoners turned into a
plan. Nova's Researcher can already read a paper and the Coach can already
edit the program; nothing joins them. Join them: a study or an article →
what it claims → what it would change in **his** current block, grounded in
his real history → a proposed program edit on the rails.

## What this queue deliberately does not copy

- **No password-shaped connectors.** His Garmin build asks for the account
  password in a chat. Nova never types a password, and his health already
  arrives through his own Shortcut.
- **No benchmarking against strangers.** "Where you stand against people your
  age" needs a population Nova does not have; a made-up percentile is fiction.
- **No chat-that-forgets.** His tracker lives inside a Claude project and is
  backed up by pasting a save code. Nova's equivalent already exists and is
  called the vault.
