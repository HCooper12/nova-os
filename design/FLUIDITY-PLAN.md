# Fluidity Plan — Native-Feel Sweep, Items 1–10

**Status: PLANNED, not built.** Written 23 Aug 2026, after the measured perf
sweep landed (calendar SWR, snapshot budget, formatter hoisting — snapshot
5,000→160ms, renderVals 17.2→0.97ms, all deployed). This plan covers the ten
follow-on improvements. Each item states what changes, exactly where, the
failure modes to design for, and how it gets verified. Phases are ordered so
every phase ships alone, gates green, without waiting for the next.

The bar, per Hayden: Nova operates as fluently as Apple's native apps — no
lag, no awkward pauses — without any feature becoming less effective. The
non-negotiables apply throughout: deterministic first, honest degradation,
everything writeable undoable, verify against the real platform before
claiming done.

---

## Phase A — feel (cold start, first paint, motion)

### 1. Bundle splitting + idle prefetch  *(pairs with item 10's chunk half)*
**Problem.** One 968KB chunk (232KB gz). Every cold start — frequent, since
iOS reclaims PWAs — parses the whole app before first paint (~300–500ms on
phone).

**Change.**
- `React.lazy(() => import(...))` for the screens that are heavy and rarely
  the first screen of a session: **Galaxy, Money, Ops, Journal, Settings,
  Stash, Shopping, Ambient, ClaudeCode**. Eager (never lazy): Mission
  (default screen), Voice (morning brief lands there), Inbox, Recipes,
  Workouts — the daily five.
- One `<Suspense>` boundary inside `<main>` with a theme-consistent, calm
  fallback (a dim centered pulse — never a white flash, respects
  `--nv-anim`).
- Vendor split in `vite.config.js` (`manualChunks`: react/react-dom) so app
  edits don't re-download the framework on every SW update.
- **Idle prefetch**: after boot settles (`requestIdleCallback`, ~3s in),
  import() every lazy chunk in the background. First navigation to any
  screen is then always warm — cold-start parse cost drops, nav cost never
  appears. The SW precaches all chunks (`globPatterns` already `**/*.js`),
  so offline still works.

**Failure modes.** Chunk-load rejection mid-deploy (SW swap) → lazy import
catch: fall back to a "reload to update" row, never a crash. Suspense
fallback flashing on warm navigations → chunks prefetched at idle makes the
fallback a cold-start-only sight.

**Verify.** Bundle listing (main chunk target ≤ ~550KB raw); walk all 16
screens in the browser on the scratch server; kill/reload mid-nav; Lighthouse
TBT before/after; offline nav to a lazy screen with dev server stopped.

### 3. Skeleton states
**Problem.** Between boot and first sync (~160ms now, longer on Tailscale
round trips), panes show `LOADING…`, `—`, or nothing.

**Change.** One `<Skeleton>` primitive (rounded shimmer bars/blocks, HUD-
toned, `animation-play-state: var(--nv-anim)` so calm mode and
reduced-motion stop it). Content-shaped arrangements for the highest-traffic
panes only: Mission hero + panes, Inbox pending list, Recipes grid +
rotation slots, Train overview, Notes list. Gate: render skeleton only when
the slice is `null` (never loaded) AND not demo mode; once data exists,
stale-while-syncing keeps showing real data (current behaviour).

**Honesty rule.** A skeleton means "loading", never "empty". Empty states
keep their existing honest copy. No skeleton on the offline path — the
banner + last-known data already handle that truthfully.

**Verify.** Throttled network in devtools; cold boot with empty
localStorage; calm mode + reduced-motion show static placeholders.

### 9. Scroll restoration per screen
**Problem.** `navigate()` deliberately resets the shared scroller to top;
returning to a list you were mid-way through loses your place — native apps
remember.

**Change.** A `scrollPositions` ref map on App: on navigate-away, store
`mainRef.current.scrollTop` under the outgoing screen; after the incoming
screen commits (inside the existing view-transition callback, before paint),
restore its saved position, defaulting to 0 on first visit. Exceptions that
keep current behaviour: Voice (owns its own chat auto-scroll), Ambient.
Positions are session-only (a ref, not state — zero re-renders, cleared on
reload, which matches iOS behaviour after an app is killed).

**Failure modes.** Restored offset beyond a shorter list after data changed
→ browsers clamp scrollTop natively; nothing to do. Restoring into a screen
whose content hasn't loaded yet (lazy chunk) → restore after Suspense
resolves: hook the restore into the screen's first post-mount frame.

**Verify.** Scroll deep in Recipes → Mission → back: position held. Same
through a lazy screen. Voice unaffected.

### 7. Motion + haptics polish
**Reality check.** iOS Safari/PWA still has no `navigator.vibrate` — real
haptics are impossible in the web app today. So: feature-detected haptics
(fires on platforms that support it, silent no-op on iOS), and the native
feel carried by motion instead.

**Change.**
- Standardize the press curve: the `Interactive` spring
  (`cubic-bezier(.32,.72,0,1)`, scale .978) applied consistently — audit the
  handful of clickables that bypass `Interactive`.
- Micro-transitions on state flips: checkbox/eaten ticks get a 120ms scale
  pop; list-row enter/exit gets a 160ms fade+2px slide (CSS only, honoring
  `--nv-anim`).
- `haptic(kind)` util: `navigator.vibrate?.(pattern)` behind one function so
  future platform support lights up everywhere at once. Call sites: set
  ticked, meal eaten, capture filed, PR celebration, swipe commit (item 8).
- Confirm `-webkit-tap-highlight-color: transparent` + `touch-action:
  manipulation` are set app-wide (main already has the latter).

**Verify.** Screen recordings of tick/press interactions; reduced-motion
audit; no layout shift introduced (transform/opacity only).

---

## Phase B — interaction (typing, writes, gestures)

### 5. Local echo for hot inputs
**Problem.** Every keystroke in an App-state-bound input pays a full App
re-render (~33ms desktop, worse on phone). The palette already solved this
locally (its P8 pattern: input owns its text, App gets it on submit).

**Change.** One `LocalInput` component (and a `LocalTextarea` twin):
- Owns its value in local state → keystrokes re-render one component.
- Pushes to App on: **Enter (flushed synchronously before the submit handler
  reads state)**, blur, and a 150ms trailing debounce (so anything reading
  App state live — e.g. the manual-macros Add button's enable check — stays
  fresh enough).
- Accepts external resets: when the app clears/sets the value prop to
  something ≠ the last value it pushed, local state adopts it (covers
  "input cleared after send", dictation writing into the field, and the
  scan flow pre-filling names).
- Convert, in order of keystroke traffic: workout set inputs (weight/reps —
  the in-gym feel), voice composer (`orbInput`), capture box (`inboxInput`),
  Code composer, food describe bar, recipe search, journal composer, money
  add. Settings/profile forms stay as-is (cold paths).

**Failure modes.** Enter racing the debounce → the synchronous flush-on-
Enter is the contract; test it explicitly. Dictation setting text
programmatically → covered by external-reset rule. The workout draft
autosave (1.5s debounce reading state) → unaffected: it fires on state
change, which now happens on flush instead of every keystroke — same data,
fewer wakeups (a bonus).

**Verify.** Type-and-immediately-Enter in every converted input lands the
full text (automated via browser eval + manual). Dictation into the voice
composer still works. Set-input → draft save → restore round trip on the
scratch server.

### 2. Optimistic UI on every write
**Problem.** Some writes are already optimistic (rotation eaten, shopping
tick, calendar hide); others block on the round trip: **todos toggle
(busy-flag), food log add/delete, inbox approve/discard/undo, stash
add/remove, todo add, journal entry add**. Over Tailscale from the phone
that's 100–600ms of dead UI per tap.

**Change.** One pattern, applied per path (mirror `toggleSlotConsumed`, the
house style):
1. Apply the local state change immediately (temp id where a new row needs
   one) + `noteLocalWrite(slice)` so a racing snapshot can't clobber it
   (guard already exists).
2. Fire the API call. Success → reconcile with server truth (replace temp
   id).
3. Failure → revert the local change, toast honestly, and where the Outbox
   already supports the kind (food, todo, journal, stash, capture) enqueue
   it instead of losing the intent.
- **Inbox approve/discard**: the row leaves the pending list immediately
  with a quiet "filing…" chip in history; on failure it returns to pending
  with the error on it. Undo data only attaches when the server confirms —
  the receipt stays truthful, the motion is instant.
- Coach proposals / model-choice cards / anything that RUNS a job stays
  non-optimistic by design: those aren't state flips, they're dispatches
  with real outcomes.

**Failure modes.** Double-tap while in flight → keep per-id busy flags to
make the action idempotent client-side. Revert racing a background sync →
`noteLocalWrite` timestamps already arbitrate; extend them to every
converted slice. Server rejection ≠ network failure → rejection reverts
loudly (toast with reason), network failure reverts to Outbox where
supported.

**Verify.** Each converted path: tap with server up (instant + reconciled),
with server killed mid-flight (revert/queue + honest toast), and under a
racing snapshot (scratch server, forced sync during flight). Server tests
untouched — this is client sequencing only.

### 8. Swipe gestures on rows  *(after 2 — swipes commit through optimistic actions)*
**Change.** A `useSwipeAction` hook (pointer events, no library):
- Activates only on clear horizontal intent (|dx| > 12px AND |dx| > 1.5|dy|)
  so vertical scroll never fights; rubber-bands past the action width;
  commits past 45% row width or a fast flick; reveals a colored underlay +
  icon while dragging (transform-only, 60fps).
- Wire to: **Inbox pending** (right = approve, left = discard — discard
  still routes through the ask-why panel for coach advice), **To-Do rows**
  (right = complete), **Shopping items** (right = check), **rotation meal
  cards** (right = eaten). All existing buttons stay — swipes are additive
  (desktop + accessibility unaffected).
- Keep row swipes inset from the screen edges (iOS system back-swipe owns
  the first ~20px).

**Failure modes.** Accidental commits while scrolling → the intent threshold
plus commit threshold; test on a real scroll-heavy list. Long-press context
menus (`useLongPress` exists on several rows) → suppress long-press once
horizontal intent locks, and vice versa.

**Verify.** Touch-emulated browser walk per surface + a phone check;
scroll-through-rows produces zero accidental actions across 50 scroll
passes (automated pointer synthesis).

---

## Phase C — data motion (never waiting, never asking)

### 4. Slice-tagged SSE (push-based sync, incremental)
**Problem.** SSE events are kind-only nudges; most trigger a full snapshot
re-pull. The app asks for everything to learn one thing changed.

**Change (phase C1 — tagged nudges, low risk, most of the win):**
- Server: the broadcast chokepoint in `index.js` already sees `req.path` for
  every mutating request → add a deterministic path→slices map (e.g.
  `/todos*` → `['todos']`, `/inbox*` → `['inbox']`, `/workouts/sessions*` →
  `['trainOverview','workoutRoutines','streaks']`). `broadcast('write',
  {slices})` carries it; unknown paths broadcast without tags (client falls
  back to full sync — never less correct than today).
- Client: tagged event → fetch only those slice routes (the per-slice
  fetchers already exist as the snapshot fallback list) and apply through
  the same `applySnapshot` guard. Untagged → full `refreshLiveData()` as
  today. Keep the 5-min full snapshot as the safety net.
- Scheduler-driven changes (inbox records from crons) run through their own
  routes in-process — tag the `broadcast()` calls in those libs as they're
  touched, not exhaustively up front.

**Explicitly deferred (C2, separate decision):** payload-carrying diffs over
SSE. The tagged-nudge model keeps HTTP as the single source of truth and
shapes byte-identical — no parallel rail, per the Method.

**Verify.** Two browser windows on the scratch server: a write in one
updates the other within a second having fetched ONLY the tagged routes
(assert via server request log); kill the tag map → full-sync fallback
still works; server tests for the path→slice map (pure function).

### 6. Voice pipeline prewarm (browser + local TTS)
**Problem.** ElevenLabs path prewarms; browser-speech and Kokoro paths pay
their spin-up on the first sentence.

**Change.**
- Browser path: on mic-open (`prewarmAsk` moment), if `usingBrowserVoice`:
  resolve + cache the chosen `SpeechSynthesisVoice` object and speak one
  zero-volume, zero-length utterance to spin the engine (the prime trick,
  moved earlier + made voice-specific).
- Kokoro path: `/api/ask/prewarm` also pings the sidecar (`ensureSidecar`)
  so a cold sidecar boots during the question, not after the answer.
- Measure first-audio latency before/after with performance marks around
  `speakTtsSentence` → first `onPlay`.

**Verify.** Scratch-server measurement harness (stubbed reply): first-
sentence-audible delta logged before/after; no double-speak, no stolen
audio session (regression-check the AirPods release behaviour comments in
audioLevel.js).

### 10. Predictive prefetch (the non-chunk half)
**Change**, cheap and surgical:
- **Nav-intent chunk warm**: `pointerdown` on a sidebar/tab item for a lazy
  screen fires its `import()` immediately — worst case it was already
  warm (idle prefetch); best case it shaves the last cold-nav stall.
- **Note detail on intent**: `pointerdown` on a Notes row prefetches
  `api.noteDetail` into the existing `liveNoteDetails` map (tap then reads
  from memory).
- **Recipe photos**: already fetched post-sync (`refreshRecipePhotos`) —
  audit it only; no change unless the audit finds gaps.
- **Brief → Train**: when the morning brief's steps include a Train beat,
  fire `api.trainOverview` in the background as the brief starts speaking so
  tapping through is instant. (Snapshot usually covers this; the prefetch
  covers the post-brief staleness window.)

**Verify.** Request-log assertions on the scratch server (prefetch fires on
pointerdown, not on hover-past); no duplicate in-flight fetches (single-
flight guard per key).

---

## Sequencing & gates

| Phase | Items | Est. size | Riskiest bit |
|---|---|---|---|
| A | 1, 3, 9, 7 | ~1 session | Suspense fallback flash (mitigated by idle prefetch) |
| B | 5, 2, 8 | ~1–1.5 sessions | Enter-vs-debounce flush in LocalInput; optimistic revert races |
| C | 4, 6, 10 | ~1 session | Path→slice map completeness (fallback = today's behaviour) |

Every phase independently: `npm run lint` clean · `npm run build` green ·
`cd server && npm test` green · scratch-server browser walk of every touched
surface (screenshots for UI-visible changes, per the visual-verification
rule) · commit with a why · push · `launchctl kickstart` · live smoke check
(health + one read per touched route). No live-state writes during
verification — scratch vault/data copies only, stubbed CLAUDE_BIN.

Success criteria (measured, not vibes):
- Cold-start parse: main chunk ≤ ~550KB raw; TBT down ≥30% (Lighthouse,
  phone emulation).
- Keystroke in converted inputs: zero App re-renders (React profiler).
- Every converted write: visible state change < 16ms after tap (one frame).
- Post-write propagation to a second open device: ≤ 1.5s via tagged SSE.
- Zero regressions: 437-test suite + the full screen walk.
