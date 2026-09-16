# The Feel Plan — haptics, optimistic UI, oriented transitions

**Source.** A 55-second reel he sent 15 Sep 2026
(`instagram.com/reel/DdSxbcYgu-B`, Kyler | App Building + Scaling). Watched in
full: metadata, 18 frames, Whisper transcript. It is a talking head with no
visual demos, so the transcript is the whole substance. Its three claims:

1. **Haptics** — "not a generic buzz. iOS gives you a light tap for a toggle, a
   heavier one for a confirm, and a sharp buzz for an error. Your hand knows
   which is which before it's even left the screen."
2. **Optimistic UI** — "the heart fills immediately. The server hasn't noticed
   it yet… Every app that feels instant is doing this, and most of them aren't
   even fast."
3. **Oriented transitions** — "tap a photo and watch it expand out of the grid
   instead of just cutting to a new screen. Your eye follows the same object the
   whole time, so you never lose track of place."

---

## The finding that changes the job

**Nova already has all three, built properly, in a handful of places.** This is
not a build; it is a COVERAGE AND CORRECTNESS pass, which makes it far cheaper
than the video implies — and means the work is finding the gaps honestly rather
than writing new machinery.

Each section below states what exists, with locators, before what is missing.

---

## 1. Haptics

### What exists
`src/haptics.js` — a five-word vocabulary, and it is already the video's
argument almost word for word:

| word | meaning | native (Taptic) | PWA fallback |
| --- | --- | --- | --- |
| `tick` | a state flip he made (a set ticked, a tab hop) | `impact LIGHT` | `10` |
| `commit` | something filed or committed | `notification SUCCESS` | `[12,40,12]` |
| `threshold` | a gesture passed its commit point | `selectionChanged` | `8` |
| `celebrate` | a personal record | SUCCESS + `impact HEAVY` | `[18,60,18,60,28]` |
| `warn` | a refusal or a failed write | `notification WARNING` | `[30,50,30]` |

It reads `window.Capacitor` live, and `hapticsSupported()` / `isNativeShell()`
exist so a surface can tell the truth rather than offer a dead toggle. There is
no fake substitute anywhere — a deliberate decision recorded in the file.

### What is wrong
1. **`haptic('light')` is called five times and is not a word.** It falls
   through `?? PATTERNS.tick` and `NATIVE[kind] || NATIVE.tick`, so it silently
   becomes a tick. Four of the five are the technique card written on 15 Sep;
   the fifth is `swipeAction.js:185`, which should be `threshold` — it fires
   when the option pager passes its commit bar, which is exactly what
   `threshold` means.
2. **`warn` has never once been fired.** The error tier the video names
   explicitly is defined and unused. Every failure in Nova is currently silent
   to the hand: the inbox optimistic revert, the to-do revert, the form-check
   refusal, an offline write going to the outbox, a lane refusing because it is
   switched off.
3. ~~**Coverage is 32 call sites in four files**~~ — `App.jsx` (24),
   `MissionStructured.jsx` (5), `swipeAction.js` (2), `Controls.jsx` (1).
   Nothing in the Train screen, which is where the most tactile thing he does
   lives (ticking a set mid-lift, one-handed, not looking). Nothing in Fuel, the
   Inbox screen, or Voice.

   **Closed 16 Sep, and the cheap half was the surprise.** `Chip` took no
   `haptic` prop at all, so *every chip in the app* was silent — the Coach
   pills, the tone chips, "Speak it", the Repertoire tabs. One default on the
   shared component (`haptic = 'tick'`, matching `TextAction`) covered Fuel, the
   Inbox screen and Voice at once. Train then got six words of its own, the set
   tick first: `haptics.js` names "a set ticked" as the example of `tick`.

   Verified live, not assumed: the Train screen went from **0 switch overlays to
   5**, each with `appearance: auto` (`none` kills the tap) and `opacity: 0`, and
   a tap landing on the invisible overlay still reaches the button underneath.

   The test that keeps it honest was itself half-blind: it grepped `haptic(` and
   so could not see a `haptic="typo"` PROP, which falls through to a tick just
   as silently. It checks both forms now, plus Train's coverage and the two
   component defaults — verified to fail 3/12 when those are removed.

### What to do
- **Fix the vocabulary** (5 edits) and add a guard so an unknown word cannot
  pass silently again: `haptic()` should warn in dev on an unrecognised kind,
  and a test should assert every call site in `src/` uses a real word. That test
  is the thing that keeps this honest — the fault above existed because nothing
  could catch it.
- **Give failure its buzz.** One pass over the revert/refusal paths:
  `toastMsg` calls that report a failure are the index. Not every toast — the
  ones that mean *your action did not happen*.
- **Cover Train first**, then Fuel, then the Inbox screen. Train is the surface
  where the hand is the only sense available.

### The honest caveat — REVISED 16 Sep, because the first version was wrong
The original plan said none of this fires on his iPhone, and recommended
building for a native shell blocked on Xcode. He then reported: "I have never
felt any haptics while using my phone." Both were true; the second is now fixed.

`navigator.vibrate` genuinely does not exist on iOS. But Safari 17.4+ plays a
real Taptic tap when an `<input type="checkbox" switch>` is toggled, and that
works in an installed PWA. `Interactive` overlays an invisible one on any
element given a haptic word, so **every call site below now reaches his hand**.
He confirmed it: "now when I push the buttons there is some slight haptic
feedback."

What is still true: **there are no TIERS on that path.** One toggle is one
pulse, so `tick` and `celebrate` feel identical on his phone — "Every button is
the same feel though". `hapticCapability()` reports `tiers: null` rather than
guessing, and the repeated-pulse patterns still play in full on Android and
desktop. He was offered per-word pulse counts and chose to keep them the same.

Two traps that cost real time, both pinned in `server/test/haptics.test.js`:
- **`appearance: none` kills the tap.** It makes the switch a plain box and
  WebKit stops playing the haptic. `SWITCH_HAPTIC_STYLE` hides it with opacity
  alone and must never acquire that property.
- **Safari freezes the iOS version it reports.** His diagnostic read 18.7 while
  he was on 26. A version gate would have promised tiers to a phone three
  majors past the cutoff, so there is no version gate anywhere.

---

## 2. Optimistic UI

### What exists
Nova already has a reference implementation, and it is a good one.
`toggleTodoItem` (App.jsx) is the model:

```
haptic('tick')                    → the hand is answered first
setState(optimistic)              → the row flips in the same frame
noteLocalWrite('todos')           → a racing snapshot cannot clobber it
api.todoToggle(...).then(server)  → the server's answer replaces the guess
.catch(revert + toast)            → back to exactly what was on screen
```

The same shape is already in: the **Inbox approve/discard** path (an approve
marks `filed` with `pendingLocally` and reverts to pending on failure — the
single most-used write in the app), `toggleShoppingItem`, the **food log**
add/remove, **stash** add/remove, and the **rotation** slot variant. The
`noteLocalWrite` guard against a racing snapshot is a genuinely hard part and it
is already solved.

### What is wrong
There are 44 `*Busy` flags. **Most of them are legitimate** — a model is
thinking and the outcome is genuinely unknown, so there is nothing honest to
show optimistically (`coachBusy`, `leaderBusy`, `foodScanBusy`, `recipeScanBusy`,
`voiceBusy`, `forgeBusy`, `codeBusy`, the reflect pair, `calCmdBusy`). Showing a
guessed result for those would be fiction, which the Method forbids outright.

The gap is the writes whose outcome IS known and that still wait. Confirmed:

- **`addShoppingItem`** — sets `shoppingAddBusy` and waits on a polled job. He
  typed the name; the item could be on the list in the same frame. This is the
  clearest single win, on a screen he uses in a supermarket with one hand.

The rest need the audit below rather than a guess — classifying 44 flags from
memory is exactly how a plan ends up wrong.

### The audit (done 15 Sep — each flag against the call it awaits)

**MODEL — the spinner stays.** The answer is genuinely unknown, and showing a
guess would be fiction: `calCmd` · `coach` · `code` · `foodScan` · `forge` ·
`journalPrompt` · `reviewReflectPrompt` · `label` · `leader` · `mealPrep` ·
`moneyScan` · `quick` · `recipeScan` · `recipeTweak` · `spar` · `studioOutline` ·
`verdict` · `voice` · `review`.

**REAL WORK — the spinner stays.** Not a model, but genuinely slow and
multi-step, and the outcome is not a foregone conclusion: `compost` ·
`commitments` · `dispatch` · `guardian` · `coachApply` · `browserSignIn` ·
`codeChange` · `money` · `todoist` · `instruments` · `attach`.

**ALREADY OPTIMISTIC** (the reference implementations): the to-do toggle, the
inbox approve/discard, the shopping toggle, the food log, the stash, the
rotation slot — and now the shopping add.

**DONE 15-16 Sep:** `shoppingAdd` · `shoppingClear` · `inboxCapture`.

**~~STILL TO DO~~ — CLOSED 16 Sep, and two of the three were misclassified.**

| flag | first verdict | what the server actually does |
| --- | --- | --- |
| `journalSave` / `reviewReflect` | optimistic | composer already clears instantly and gives the words back on failure; only the day-grouped list lags. Left as-is on a prior session's recorded reason. |
| `recipeAdd` | "he typed the name and fields" | **spinner stays** — see below |
| `recipeEdit` | "he edited the fields in front of him" | **spinner stays** — see below |

### The rule the recipe pair taught: known INPUT is not predictable OUTCOME

Both were listed as optimistic because *he typed every field*, which is true and
is beside the point. The question is not whether the client knows what was
asked; it is whether the server is going to do it.

`server/lib/recipes.js` writes the edit into the markdown collection, **re-parses
the file**, and throws if the result does not round-trip:

- `Edit failed a sanity check — file left unchanged` (count or alternates moved)
- `Edit did not round-trip through the file — left unchanged`
- `Recipe insertion failed a sanity check — file left unchanged` (add)

That is the vault-writer guard doing its job, and it means a refusal is a
**designed, expected outcome**, not a network blip. An optimistic recipe would
appear, sit there looking saved, and be yanked back — for the one failure the
system is most careful to produce.

There is a second, quieter reason. The parent recipe's ingredients are stored
as parsed objects, while his input is plain lines (`subject.ingredients.map(i =>
i.name)` is how the route compares them). Guessing the rendered shape means
reimplementing the vault parser in the client — which is exactly what "shared
formats are contracts" forbids.

**So the rule gains a second half.** An optimistic write is honest when the
outcome is genuinely predictable — and an outcome is not predictable just
because the INPUT is known. If the write round-trips through a parsed file, or
the server can refuse it on integrity grounds, the spinner is the truthful
answer and stays.

### What was done
1. **`submitShoppingAdd` is optimistic** — the proof case, and a good one: the
   server only uses a model to pick the AISLE, and already has a deterministic
   fallback category for when that lane is off. So the item he typed appears in
   the same frame under that fallback, marked `pending`, and the row says
   "sorting into an aisle…" rather than silently jumping category when the
   answer lands.
2. **`optimisticWrite` exists** (App.jsx) — the five beats in one place:
   answer the hand → show it now → guard the racing snapshot → let the server
   win → put it back honestly on failure. Six places had hand-rolled that
   shape; the seventh copy is where a beat gets forgotten.
3. **The table is worked through.** `shoppingAdd`, `shoppingClear` and
   `inboxCapture` went through the helper; the recipe pair was sent back for
   the reason above. Nothing is left waiting that honestly could be instant.

### The rule to keep
An optimistic write is only honest when the outcome is genuinely predictable.
Where it is not, the spinner is the truthful answer and stays.

---

## 3. Oriented transitions

### What exists
This is the surprise: **Nova already does exactly what the video describes, and
does it well — in precisely one place.**

- `App.withTransition(fn)` (App.jsx:843) wraps `document.startViewTransition`
  with `flushSync`, opts out under `prefers-reduced-motion`, degrades to a plain
  `setState` where unsupported, and silences the AbortError a superseded
  transition throws on a fast tab-hop.
- `src/index.css` (~338-366) tunes it: a spring-ish
  `cubic-bezier(.32,.72,0,1)` over .42s for morphing groups, a shorter root
  cross-fade so *movement* is what the eye reads, and a rule stopping a morphing
  element from also cross-fading ("that reads as a ghost").
- **One shared-element pair uses it:** a recipe card carries
  `viewTransitionName: recipe-<id>` (`valsRecipes.js:191`) and RecipeOverlay's
  panel carries the same name (`RecipeOverlay.jsx:36`), so the card *expands
  into* its detail view. That is the video's photo-out-of-the-grid, shipped.

Everything else cross-fades — which is the "cut" the video warns about.

### What to do
Extend the proven pattern to the grid/list → detail pairs that already exist.
Each is the same three-line change: mint a name in the vals, put the same name
on the detail surface, open through `withTransition`.

Ranked by how often he meets them:

| from | to | name | |
| --- | --- | --- | --- |
| Today's technique card (Home) | `RepertoireBook` | `technique-<id>` | **done** |
| Steps / weight tile (Home) | `StepsHistory` | `vital-steps` / `vital-weight` | **done** |
| An exercise row (Train) | `ExerciseSheet` | `exercise-<id>` | |
| A note row (Notes) | the reader | `note-<id>` | |
| An inbox card | its expanded detail | `record-<id>` | |
| A library shelf card | the source page | `source-<id>` | |

**SEEN, 16 Sep** — in real Safari 26.5.2 (his phone's WebKit generation) at
exactly 375 CSS px, against the real vault. `document.startViewTransition` is
supported, reduced-motion is off, and the technique card mints
`technique-presupposition-milton-model`. Opening the Repertoire book leaves
**zero duplicate `viewTransitionName`s** — the uniqueness guard holds on both
ends, which is the one thing that fails silently.

Driving it needs no MCP browser: `scripts/dev-connect.mjs` seeds the connection
(token never printed), and Safari takes `do JavaScript … in tab N of window M`.
Address the tab BY URL, never "front document" — a second Claude session was
driving a `localhost:5174` window in the same Safari, and reading its state
cost a round to a phantom "DEMO DATA" bug.

### The trap to avoid
A `viewTransitionName` must be **unique per document at the moment of the
transition**. `valsRecipes.js:191` already shows the handling —
`st.openRecipeId === r.id ? undefined : ...` — the card drops its name while the
overlay holds it, or two elements share a name and the morph is dropped
silently. Every new pair needs the same guard.

---

## Sequencing

**First — the corrections.** The five wrong haptic words, the dev-time guard and
the call-site test. Small, and it stops the same fault recurring.

**Second — failure gets a buzz.** `warn` on the revert and refusal paths. This
is the one the video is loudest about and Nova has literally never used it.

**Third — one transition pair, end to end:** the technique card into the
Repertoire book. It proves the extension on a surface that needs eyes anyway.

**Fourth — the optimistic audit**, written down, then `addShoppingItem`, then
the helper, then the list.

**Fifth — haptic coverage on Train**, once the vocabulary is trustworthy.

## What NOT to do

- **Do not add a fake haptic for iOS.** `haptics.js` is explicit and right: a
  fake is worse than none. The answer is the native shell, not a substitute.
- **Do not make a model call optimistic.** A guessed coach reply or a guessed
  scan result is fiction, and fiction is the one thing the Method rules out.
- **Do not lengthen the transition to make it more visible.** The curve and
  durations were tuned deliberately (see the motion contract, 11 Sep); the
  complaint the video makes is about a CUT, not about speed.
