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
*Last updated: 4 August 2026*

**GOAL:** Keep Nova the one app Hayden opens daily — reliable enough to trust
without supervision, and increasingly present the way a real assistant would
be. Feeds: what to build next, and whether the platform can be left alone.

**DONE CRITERIA (rolling):**
1. Overnight health push lands automatically — **met**, twice consecutively
   (2 Aug and 3 Aug data, both filed at 00:05 local). Two nights is a run,
   not yet a pattern; keep checking the log.
2. Nova usable on the phone while the Mac sleeps — **met** for reads and
   queued writes; **unmet** for live conversation (needs the Mac awake).
3. Companion plan Phases 1–5 shipped — **met**.
4. Menu-bar Nova visible on his Mac — **blocked** (icon sits under the notch;
   ⌥Space works).
5. Live walkthrough of everything built — **unmet**. Asked for twice, offered
   again at the close of this session, not yet taken. Owed.
6. Every meal correctable, and a tweak refinable in words — **met**.
   `✎ EDIT THIS MEAL` on any recipe or variant; a follow-up refines the
   preview on screen; a mic beside the ask box, answer spoken back.

**STATE (what exists, where):**
- Frontend: GitHub Pages, auto-deploys on push to `main`
  (`.github/workflows/deploy.yml`). Server: launchd `com.novaos.server`
  (`RunAtLoad` + `KeepAlive`), port 4173, Tailscale-fronted at
  `https://haydens-macbook-pro.taild050ac.ts.net` (`tailscale serve`,
  tailnet only).
- Recipe editing: `editRecipeInRaw` / `editRecipe` in `server/lib/recipes.js`
  (~line 540 onward), route `POST /api/recipes/:id/edit` in
  `server/routes/recipes.js`, tests in `server/test/recipeEdit.test.js`,
  UI in `src/RecipeOverlay.jsx` (`MealEditor` at the foot).
- Tweak refinement: `buildPrompt(recipe, request, prior)` in
  `server/lib/tweakRecipe.js`; the client sends the current preview as
  `prior` from `App.submitRecipeTweak`.
- Menu-bar app: `mac/NovaBar/main.swift`, built by `mac/build.sh` into
  `~/Applications/NovaBar.app`. Not in Login Items yet.
- Design docs: `design/NOVA-METHOD.md` (doctrine), `COMPANION-PLAN.md`,
  `COMPANION-INSPIRATION.md`, `AGENT-SKILL-MAP.md`, this file.
- Offline cache: `src/liveStore.js` + `CACHED_LIVE_KEYS` in `src/App.jsx`.

**DECISIONS (choice → reason → what it forecloses):**
- **No Mac mini / no VPS** → he cannot afford it, and hosting the vault
  remotely would move his health, journal and money onto rented hardware and
  break "the vault on his Mac is the source of truth" → forecloses true
  always-on remote Nova; commits us to making the phone excellent offline.
- **Steps take the MAX across devices, never the sum** → summing double-counts
  a walk both iPhone and Watch recorded; filtering to one device misses the
  other → forecloses matching Apple Health's de-duplicated figure exactly.
  He has seen this and prefers it (closer to Pedometer++).
- **Server shifts a just-after-midnight push to yesterday**
  (`resolvePushDate`, <04:00) → iOS offers no "is yesterday" for Health
  samples → forecloses him needing an Adjust Date action in Shortcuts.
- **A recipe edit rewrites only the lines that changed** → the app shows
  markdown stripped to plain text, so regenerating a whole section would
  silently flatten the **bold** on steps he never touched, and normalising
  whitespace ate a blank line between a recipe's `---` and the next heading
  → forecloses a simple "render the list from the model" writer; every
  section write diffs against what is already there first.
- **Macros travel with an ingredient edit** → changing what is in a meal and
  leaving the old numbers would make the file lie → forecloses an
  ingredients-only edit form; the macro row is always part of the editor.
- **An alternate with no method inherits the parent's** → a tweak that only
  swaps ingredients is cooked the same way and the model returns no steps →
  forecloses treating a missing method as a validation failure.
- **Voice dock button opens Voice, not the palette** → talking is the fastest
  way in; palette still on the top bar and ⌘K.

**VERIFIED (this session, with locators):**
- Gates at close: `npm run lint` 0 errors; `npm run build` green;
  `cd server && npm test` 190 pass / 0 fail; `git status --porcelain` empty;
  `HEAD == origin/main == 96d266c`.
- Backend healthy after the final `launchctl kickstart`:
  `curl localhost:4173/api/health` → 200.
- Pages deploy for `96d266c`: `gh run list` → completed / success.
- Overnight push, `server/data/health/pushlog.json` last two attempts:
  `2026-08-02T14:05:17Z filed 2026-08-02 steps 8295 ok true` and
  `2026-08-03T14:05:19Z filed 2026-08-03 steps 12619 ok true` — i.e. 00:05
  local on the 3rd and the 4th, each filing the previous day.
- Recipe editing against his REAL collection (not fixtures): an identity edit
  of all 23 recipes/variants is byte-identical to the source file; a one-step
  method edit changes exactly 1 line; a macro correction changes exactly
  1 line. Live through the running server: an edit landed and reverted, and
  an alternate posted with no method saved and inherited the parent's 5 steps.
- End-to-end from the UI (localhost dev build → local server): `✎ EDIT THIS
  MEAL` on the "Wrap swapped for English muffin" variant added one
  ingredient, the toast read "Saved to the vault", and the file diff was
  exactly `81a82 > - 1 tsp UI-test hot sauce`.
- His recipe file is byte-identical to its pre-session state — `diff` against
  the snapshot returns nothing. Every test write was reverted.
- Inbox backlog re-counted at close: 119 records, **28 pending**
  (11 coach, 5 dispatch, 2 review, 2 training-check, 2 food-suggestion,
  2 research, 1 each week-plan / cfo / guardian / studio), plus 2 in `error`.
- Vault collection: 18 recipes, 6 variants (`GET /api/recipes`).

**ASSUMED (treat as open):**
- That the push now fires *every* night — two consecutive successes is a run,
  not proof. Read the pushlog before claiming it again.
- That Watch steps are actually reaching the server — the figures look right
  to him, but no receipt carrying `watchSteps` has been seen. The pushlog
  records only a folded `steps` value, so this file cannot settle it.
- That the mic in the recipe overlay works on his iPhone. It renders and is
  wired to the same `useDictation` the Voice screen uses, but it was only
  exercised in desktop Chrome — no spoken take was recorded end to end.
- That the spoken tweak reply sounds right. `speakTweak` was never heard;
  only its inputs were checked.
- Oracle free-tier / VPS pricing, if the hosting question returns.

**OPEN QUESTIONS / BLOCKERS:**
- The **live walkthrough** he asked for twice and has not received. Offered
  again at the close of this session; no answer yet.
- 28 pending inbox records, and 2 stuck in `error` — the error ones have not
  been looked at at all.
- NovaBar icon hidden under the notch — needs him to free a menu-bar slot.
- NovaBar first-run: needs baseUrl + token pasted into Settings inside the
  panel (its web view has its own storage).
- ElevenLabs key still deferred by choice.
- Editing a step drops its markdown (`**bold**` becomes plain) because the
  editor shows and saves plain text. Untouched lines keep theirs. He was told;
  no decision taken on whether that is worth fixing.

**NEXT ACTION:** Run the live walkthrough — it is the oldest outstanding
request and he has now been offered it three times. Expected observation: he
either takes it, or names the next build and it can be struck from the list.

**DO NOT (dead ends already paid for):**
- Do **not** claim anything he must *see* works without a screenshot. Two
  claims failed this way (the menu-bar icon; the first transitions attempt).
- Do **not** grep only `App.jsx` for offline behaviour — the cache lives in
  `src/liveStore.js`. I wrongly told him no cache existed.
- Do **not** blame the Shortcut for missing steps without checking BOTH
  `pmset -g log` (was the Mac awake?) and the pushlog (did anything arrive?).
  Both failure modes were real on different nights.
- Do **not** remove the Source filter from the steps query — that reintroduces
  double counting.
- Do **not** propose Vercel/serverless for the backend: it writes to disk in
  26 places, spawns the Claude CLI in 21, and runs persistent schedulers.
- Do **not** drive a view-transition click via a CDP eval that `await`s in the
  same call — it wedges the renderer for 45s. Click with the `computer` tool,
  probe in a separate short eval.
- Do **not** add a new live slice without adding it to `CACHED_LIVE_KEYS`, or
  that screen goes blank whenever the Mac sleeps.
- Do **not** trust a Vite dev-server reload to pick up a changed module. A new
  `orCanEdit` key was absent from the running `v` object through three rounds
  of debugging while the dev server was serving the correct file — I was one
  step from "re-investigating" a wiring bug that did not exist. Kill vite,
  `rm -rf node_modules/.vite`, restart with `--force`, and confirm by reading
  the fiber props, not the screenshot.
- Do **not** verify the PWA against the deployed Pages build in the MCP
  Chrome: cross-origin fetches to the Tailscale URL never settle there, while
  the CORS preflight is provably fine via curl. Use `npm run dev` on
  localhost with `baseUrl: http://127.0.0.1:4173`, and delete
  `novaos.connection` afterwards so his API token is not left in a browser
  profile he did not choose.
- Do **not** use `$` to end a lazy match in a `/m` regex over vault markdown —
  it matches every line end, so the body stops after its first line. Use
  `(?![\s\S])`. This has now bitten twice (promote-alternate, then the
  section writer).
- Do **not** trust fixture tests alone for anything that writes to the vault.
  The first cut of the section writer passed all 190 tests while eating a
  blank line and stripping bold from untouched steps; only an identity
  round-trip over his real file caught it.

---

## SESSION LOG (append-only, newest first)

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
