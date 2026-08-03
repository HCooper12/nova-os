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
*Last updated: 3 August 2026 (evening)*

**GOAL:** Keep Nova the one app Hayden opens daily — reliable enough to trust
without supervision, and increasingly present the way a real assistant would
be. Feeds: what to build next, and whether the platform can be left alone.

**DONE CRITERIA (rolling):**
1. Overnight health push lands automatically — **met** (3 Aug 00:05, verified).
2. Nova usable on the phone while the Mac sleeps — **met** for reads and
   queued writes; **unmet** for live conversation (needs the Mac awake).
3. Companion plan Phases 1–5 shipped — **met**.
4. Menu-bar Nova visible on his Mac — **blocked** (icon sits under the notch;
   ⌥Space works).
5. Live walkthrough of everything built — **unmet**, repeatedly deferred, and
   he has asked for it twice. Owed.
6. Everything in the collection correctable, and a tweak refinable by voice —
   **met** (see this evening's entry).

**STATE (what exists, where):**
- Frontend: GitHub Pages, auto-deploys on push to `main`
  (`.github/workflows/deploy.yml`). Server: launchd `com.novaos.server`
  (`RunAtLoad` + `KeepAlive`), port 4173, Tailscale-fronted.
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
  section write now diffs against what's there first.
- **An alternate with no method inherits the parent's** → a tweak that only
  swaps ingredients is cooked the same way and the model returns no steps →
  forecloses treating a missing method as a validation failure.
- **Voice dock button opens Voice, not the palette** → talking is the fastest
  way in; palette still on the top bar and ⌘K.

**VERIFIED (this session, with locators):**
- Automatic health push: pushlog `03 Aug 00:05 local | filed 2026-08-02 |
  steps 8295 | shifted True`.
- `pmset -g custom`: AC `sleep 0`; `pmset -g sched`: `wakepoweron at 0:03AM
  every day`. Battery `sleep` remains 1 by design.
- Offline behaviour: stopping `com.novaos.server` and reloading showed real
  data under "OFFLINE · LAST-KNOWN DATA" with the saved-at time.
- Dock renders `Home · Voice · Train · ✦ · Recipes · Inbox · More` at 354px
  (fits a 390pt iPhone).
- 184 server tests green; git clean and pushed at `a76d0e7`.
- Recipe editing, against his REAL collection (not fixtures): an identity
  edit of all 23 recipes/variants is byte-identical to the source file; a
  one-step method edit changes exactly 1 line; a macro correction changes
  exactly 1 line. Live through the running server: edit landed and reverted;
  an alternate with no method saved and inherited the parent's 5 steps.
  End-to-end from the UI: ✎ EDIT THIS MEAL on the "Wrap swapped for English
  muffin" variant added one ingredient, toast said "Saved to the vault", and
  the file diff was exactly `81a82 > - 1 tsp UI-test hot sauce`.
  His file was restored byte-for-byte after every test.
- 190 server tests green; pushed at `45c49a0`; Pages deploy SHA-matched.

**ASSUMED (treat as open):**
- That the phone automation now fires reliably every night — one success is
  not a pattern. Check the pushlog before claiming it.
- That Watch steps are actually reaching the server — he reports the figure
  looks right, but no receipt has been seen carrying `watchSteps`.
- Oracle free-tier / VPS pricing, if the hosting question returns.

**OPEN QUESTIONS / BLOCKERS:**
- The **live walkthrough** he asked for (twice) and has not received.
- NovaBar icon hidden under the notch — needs him to free a menu-bar slot.
- NovaBar first-run: needs baseUrl + token pasted into Settings inside the
  panel (its web view has its own storage).
- ElevenLabs key still deferred by choice.
- ~28 pending inbox records after expiry — triage offered, not done.

**NEXT ACTION:** Offer the live walkthrough before building anything new —
it is the oldest outstanding request, now two sessions old. Expected
observation: he either takes it or explicitly redirects.

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
- Do **not** trust a Vite dev-server reload to pick up a changed module — a
  new `orCanEdit` key was missing from the running `v` object for three
  rounds of debugging while the server was serving the correct file. Kill
  vite, `rm -rf node_modules/.vite`, restart with `--force`.
- Do **not** verify the PWA against the deployed Pages build in the MCP
  Chrome: cross-origin fetches to the Tailscale URL never settle there
  (the preflight is fine via curl). Use `npm run dev` on localhost with
  `baseUrl: http://127.0.0.1:4173`, and delete `novaos.connection` after.
- Do **not** use `$` to end a lazy match in a /m regex over vault markdown —
  it matches every line end. Use `(?![\s\S])`. This has now bitten twice.

---

## SESSION LOG (append-only, newest first)

### 3 August 2026 (evening)
Customisability. Fixed the bug in his screenshot — an ingredients-only tweak
could not be saved because the alternate validator demanded a method it was
never going to have. Made a follow-up refine the version on screen instead of
restarting from the stored recipe, and put a mic beside the ask box so the
whole exchange can be spoken, with the answer read back from the preview
only. Built `editRecipe`: ingredients, method and macros, on any recipe or
any variant, reachable from ✎ EDIT THIS MEAL. The writer only rewrites lines
that actually changed — the first cut drifted his file and stripped bold from
steps he never touched, which is what the identity round-trip caught.

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
