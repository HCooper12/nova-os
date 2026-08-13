# Wrist + Notch — dispatching Nova's agents from anywhere, and seeing them work

*Written 13 August 2026, from a frame-by-frame watch of
instagram.com/reel/DbhvjVgTRbl (donalleniii, "Omg my Apple Watch can control
my AGENTS!!"). Hayden's ask: replicate and expand this on Nova.*

## What the video shows (observed, not inferred)

A hand-built watchOS app called **WristDeck**:

1. **Dispatch from the wrist.** Main screen: two buttons, *New Claude* and
   *New Codex*. Tap → watch voice dictation → "Hey, can you build me a retro
   aesthetic snake game… launch it in my browser… sound effects and music?"
   → Done → the job lands on Claude Code / Codex running on his MacBook.
2. **Live agent status on the watch.** A "Sending…" screen, then a running
   view: model name header, elapsed time, *the actual command the agent is
   currently running* ("Running ls ~/Desktop && echo ok…"), and a red
   **Stop** button.
3. **Job list on the watch.** Scrollable: in-flight jobs green ("working
   now"), old projects below, tap to open.
4. **Proof on the wrist.** A finished job shows a *zoomable screenshot* of
   the result running on the desktop ("there's the screenshot… you can zoom
   in and see a preview of the app working").
5. **A notch app on the Mac.** Click the notch → a dropdown panel: live
   status rows ("Claude — Editing files", "Codex — Thinking", "2 running"),
   a History tab with thumbnailed past jobs ("echo hello from the watch"),
   an Artifacts tab, an HTTP-error entry (honest failures). Persistent
   status pills sit beside the notch even over a full-screen browser.
6. **Remote.** "This works on Wi-Fi as well as with your phone connection,
   like your data plan." Server is his laptop; models are cloud (Claude
   Code + Codex — "not fully locally").
7. **The payoff.** The snake game exists and runs by the end of the video;
   he plays it. Second job (a music-keyboard web app) still thinking.

## The real need under the request

Hayden wants three things this video crystallizes:

- **Dispatch**: start real agent work (not just capture) from wherever he
  is — wrist, phone, couch — by voice, without opening a laptop.
- **Visibility**: see agents working, live, at a glance — on the Mac
  without switching windows (the notch), and away from the Mac (watch/phone).
- **Proof**: when a job finishes, see evidence it worked, not a claim.

Nova already owns most of the machinery the video author had to build from
scratch: a launchd Express server on the Mac, a bearer-authed API on the
tailnet, the inbox rails (kind/status/undoData, review-gated), an agent
fleet with live lights (`valsChrome.js` pulses from any `classifying`
record), SSE events (`events.js` broadcast), request receipts, a Siri
dispatch surface (`POST /api/ask/sync`) that already works hands-free, and
a menu-bar shell (`mac/NovaBar`) whose status icon is *blocked under the
notch* — a blocker this plan turns into the feature.

What Nova does NOT have today:
- An agent that **runs a coding/build job** end-to-end from one spoken
  prompt (the Watcher/Researcher/Distiller produce *documents*; nothing
  produces *runnable artifacts* with live command status).
- Any **live surface on the Mac itself** (the PWA is a tab; NovaBar's icon
  is invisible; nothing shows agent state while he's in another app).
- Any **watch-native** dispatch or status.

## Phases (each independently shippable, smallest honest step first)

> **STATUS (13 Aug 2026):** Phase 0 answered by him — Ask Nova DOES run from
> his watch. Phase 1 (the Forge) is **BUILT and verified live** (`2c59dc8`).
> The spoken-latency problem he raised alongside it is **fixed** (`faea049`):
> 14.2s → 2.1–2.2s on a follow-up ask, 11.5s cold. Phases 2–4 are next and
> untouched. See VERIFIED/OPEN in `SESSION-HANDOFF.md` for the measurements.

### Phase 0 — verify the free win (zero code)
Shortcuts sync to watchOS. His existing hands-free **Ask Nova** shortcut
may already run from the watch — dictate, hear the answer through the
watch speaker. VERIFY on his wrist before building anything: if it runs,
capture + Q&A from the wrist already works today, and Phase 2 becomes a
clone-and-edit of a proven shortcut rather than a new build.
- Also verify: does a watch-run shortcut reach the tailnet IP when the
  phone is nearby (traffic proxies via the paired iPhone's network stack,
  which has Tailscale)? When on watch-only Wi-Fi/LTE it will NOT (the
  watch isn't on the tailnet) — see DECISIONS.

### Phase 1 — The Forge: a job-runner agent on the server (the core build)
`server/lib/forge.js` + routes. The pattern the video calls "control my
agents" is, on Nova's rails, *a new agent department that runs coding
jobs*:

- `POST /api/forge` `{prompt, model?, cwd?}` → creates an inbox record
  (kind `forge-job`, status `classifying`), spawns a `claude` CLI child
  (print mode, `--output-format stream-json` for live tool events) in a
  sandboxed projects dir (`~/NovaForge/<slug>/`), and streams progress
  into the record: phase, elapsed, current tool/command line, cost so far.
  All the hard lessons are already paid for and MUST be honored: stdout
  before stderr, `stdio: ['ignore', …]`, markdown not JSON for long
  payloads, measure a real pass before setting any cost cap, in-process
  writes only (never a second node process near `inbox.json`).
- **Live status** rides the existing rails unchanged: the record's
  `classifying` state already pulses the sidebar agent lights on every
  device; `broadcast('forge')` on each transition feeds SSE. Add Forge to
  the Ops roster (dept Build) exactly as `watcher` was added.
- **Stop button** = `POST /api/forge/:id/stop` → kill the child, mark the
  record honestly (`stopped`, receipts say by whom).
- **Proof screenshot**: on job completion, if the job produced something
  launchable (an HTML file, a served URL), open it and `screencapture -x`
  the window to `server/data/forge/<id>.png`; attach to the record.
  The inbox tap-to-expand (`fullPayload`) already shows route-aware
  payloads — extend it to render the proof image. Honest degradation: no
  artifact → say so, never a stale image.
- **Job persistence**: Distiller/ingest pattern (proven, drilled) — jobs
  persist to `server/data/forge/<id>.json`; a dead process loses nothing
  already receipted; no resume, re-run is the recovery.
- **Model choice**: the video's Claude-vs-Codex picker maps to Sonnet vs
  Opus (measured: bulk work on Sonnet is 5× cheaper; default Sonnet,
  `model` param to override). Codex itself: out of scope; the picker is a
  Nova model picker, not a vendor picker.
- **Trust ladder**: a forge job *runs* unattended (it's sandboxed to its
  own dir) but anything it wants to write into the vault or beyond its
  sandbox rides the pending-review rails like every other agent. The
  produced artifact dir is disposable derived data, not vault truth.
- Tests: fixture-dir jobs, kill/stop, receipt shape, stream parsing, the
  no-second-process rule.

**AS BUILT (13 Aug 2026) — what differed from this sketch:**
- Department is **Platform**, not "Build": the registry seed
  (`lib/skills.js`) has a fixed set of departments and the ops test enforces
  that `AGENT_DEPARTMENTS` only names real ones. Inventing a department
  would have broken that contract.
- **Measured cost: $0.90** for the snake game (3m32s). The cap sits at
  $4.00 — informed by that measurement rather than guessed, per DO NOT.
- **The proof screenshot needs a one-time Screen Recording grant** and does
  not have it yet, so it currently returns an honest note instead of an
  image. Everything else in the proof path works.
- The model picker is deferred, not built: no `model` selection has been
  exercised, and the default model handled the demo job well.
- `stopForge` had a real bug on first write (it mutated a copy read from
  disk, so the stop flag never reached the running job). Fixed by keeping
  the live job object in the running map; verified live — a stopped job now
  reports "stopped by you" rather than looking like a crash.

### Phase 1b — the spoken lane must be FAST (done, and it was the real blocker)
He raised this alongside the video and it mattered more than any of the
below: *"the shortcuts for ask and tell nova take time and I hate how long
the wait is… it defeats the purpose of trying to use nova for everything."*

Diagnosed from the request log rather than guessed — 14.2s, 15.9s, 23.9s
were sitting there. Cause: `/api/ask/sync` minted a NEW conversation per
ask, paying context assembly (~2.5s), a cold CLI boot (~2.2s) and prompt
cache CREATION every time; the warm pool is keyed by session id, so Siri
could never hit it. Fixed in `lib/spokenSession.js` — one conversation,
resumed, with a fresh session on a new day / after 20 min / after 12 turns,
and the volatile numbers re-stated from local files on every resumed turn.
Cold asks now overlap the CLI boot with context assembly (`prewarmAsk`).

**Measured after: 2.1–2.2s resumed, 11.5s cold.** A dispatch to the Forge is
~60ms because it doesn't wait for the build at all.

The remaining cold-ask cost is model time on a fresh ~18k-token prompt, not
Nova's plumbing. If it still annoys him, the next lever is keeping the
session warm across longer gaps — deliberately not done yet, because that
trades freshness for speed and the current window is the honest default.

### Phase 2 — wrist + phone dispatch (clone, never author)
- Clone his working Ask Nova shortcut (iCloud share-link method, proven)
  into **"Nova Forge"**: dictate → `POST /api/forge` with the transcript
  as the prompt → Siri speaks the acknowledgment ("Forge started —
  I'll tell you when it's done"). Two literal edits (URL path, spoken
  reply), exactly like the Health Morning clone. Runs from watch, phone,
  CarPlay, AirPods.
- **Done/failed ping to the wrist**: the sentinel pattern — on job
  completion, Telegram him (existing channel; Telegram notifications
  already reach the watch). Message carries outcome + cost + a link to
  the proof. No new infrastructure.
- **Status check by voice**: extend the Ask Nova context line so "how's
  the forge going?" answers from live record state (same fast-context
  budget rules as the calendar/health lines).

### Phase 3 — the notch HUD (turns NovaBar's blocker into the feature)
Evolve `mac/NovaBar` (swiftc-only, no Xcode — keep that property):
- A borderless, non-activating panel **anchored to the notch** (centered
  on the camera housing's screen coordinates), always-on-top like the
  video's. Collapsed: a slim pill flanking the notch showing the same
  truth as the sidebar lights — per-agent dot + name + elapsed when
  anything is `classifying`; nothing when idle (honest silence).
- Click/hover → expands into the dropdown: running jobs with live
  command line, recent history with thumbnails, proof screenshots,
  Stop buttons. Content is a WKWebView loading a new lightweight `#/hud`
  route of the PWA — same thin-shell doctrine as NovaBar ("no second
  source of truth"): the PWA already has the state plumbing (SSE, vals);
  the Swift layer only owns placement and the panel chrome.
- ⌥Space voice panel stays exactly as is; the HUD is a second, passive
  surface of the same app.
- The existing status-item code stays as fallback for non-notched
  displays (the external monitor in the video has no notch either — the
  pills there were near the *laptop's* notch).

### Phase 4 — the native watchOS app (parked until Phases 1–3 prove daily value)
The video's full polish (in-watch job list, live command text, zoomable
proof image on the wrist) needs a real SwiftUI watchOS app — which means
Xcode and either 7-day free-account re-signing or the $99/yr developer
program. Nova's cheaper path covers ~80% (dispatch by Siri, status by
voice, completion + proof by Telegram). Build the app only if, after
living with Phases 1–3, the remaining 20% (glanceable list, in-watch
stop, wrist screenshots) still itches. Scope if built: one SwiftUI app,
`/api/forge` + `/api/inbox` client, dictation via `TextField`'s watch
input, image viewer for proof PNGs; auth via the same bearer token.

## Expansions beyond the video (his "and expand on this")
- **Dispatch ANY agent from the wrist, not just coding**: the same cloned
  shortcut pattern parameterizes over departments — "watch this video",
  "research X", "distill my week". The video only does coding; Nova's
  fleet is broader. This is the genuinely-new thing Nova can do that
  WristDeck can't.
- **Voice announcement on completion** via ElevenLabs once the key
  arrives (existing blocker) — the Mac says "the snake game is ready"
  when he's at the desk; Telegram covers him away from it.
- **Proof beyond screenshots**: for web artifacts, keep the served URL
  alive (vite preview–style static serve out of the job dir) so the
  phone/watch link opens the real thing, not just a picture.
- **The HUD as Nova's face on the Mac**: once the notch panel exists, the
  agent lights, inbox count, and health sentinel nudges all have a
  natural at-a-glance home — presence, which is what NovaBar was always
  reaching for.

## Decisions (choice → reason → what it forecloses)
- **Forge runs the `claude` CLI, not a bespoke agent loop** → the CLI
  already does tool-use, streaming, cost accounting; every hard lesson
  (stdout/stderr, caps, stream-json) is already paid for on this exact
  binary → forecloses fine-grained per-tool policy inside a job; the
  sandbox dir is the containment.
- **Jobs are sandboxed to `~/NovaForge/<slug>` and their output is
  derived data, not vault truth** → the vault stays the source of truth;
  disposable build dirs need no undo machinery → forecloses forge jobs
  editing the vault directly; anything vault-bound goes through pending
  review like every agent.
- **Watch dispatch is phone-mediated tailnet by default** → the watch
  isn't on the tailnet; near the phone, shortcut traffic rides the
  phone's stack (Tailscale up) — zero new surface area → forecloses
  watch-alone LTE dispatch. If that ever matters, the recorded
  alternative is Tailscale Funnel (public HTTPS + bearer auth) — a
  deliberate, separate decision because it exposes the API to the
  internet's door-knob-rattlers.
- **The notch HUD is a WKWebView onto the PWA, not a native rewrite** →
  NovaBar doctrine: thin shell, no second source of truth, no Xcode
  dependency → forecloses buttery native animations; accepted.
- **Codex is not a target** → Nova is Claude-native; the picker chooses
  Sonnet/Opus → forecloses the video's two-vendor parlor trick; nothing
  of daily value lost.
- **Phase 4 (watchOS app) is explicitly parked, not promised** → highest
  cost, most new tooling (Xcode, signing), least incremental value over
  Siri + Telegram → forecloses wrist-native polish until the cheap 80%
  is lived with.

## Costs and risks (measured-first rule applies)
- A forge job is a real Claude Code run: measure a representative job
  (snake-game-sized) end to end and READ `total_cost_usd` before setting
  any cap — the $10 lesson is in DO NOT.
- Streaming stream-json from a child process is new parsing surface;
  regression tests on captured fixtures, not live runs.
- `screencapture` needs Screen Recording permission for window capture —
  one-time TCC prompt, document it in the README like NovaBar's mic.
- The notch panel must never cover the real menu bar's active area on
  non-notched external displays — fallback logic stays.

## Order of work
1. Phase 0 verification (his wrist, two minutes, next time he's here).
2. Phase 1 Forge (server + tests + Ops roster + inbox rendering) — the
   engine everything else points at.
3. Phase 2 clone + Telegram completion ping (an evening, mostly his
   phone taps).
4. Phase 3 notch HUD.
5. Live with it. Then decide Phase 4.
