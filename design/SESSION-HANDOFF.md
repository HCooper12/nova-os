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
*Last updated: 9 August 2026*

**GOAL:** Keep Nova the one app Hayden opens daily. This session's thesis:
Nova was PRODUCING far more than he KEPT, so the work shifted from adding
surfaces to making the existing ones worth opening — plus closing the
references backlog and the hands-free (Siri/Shortcuts) path.

**DONE CRITERIA (rolling):**
1. Overnight health push lands automatically — **BROKEN AGAIN, 2 nights**.
   Last successful automatic push: 7 Aug 00:05. Nights of 7→8 and 8→9 Aug
   produced nothing (pushlog's newest entry is a 09:50 manual catch-up on
   8 Aug). Manual ▶ runs DO work on the new direct URL — so the automation
   is not firing, not a network fault.
2. Nova usable on the phone while the Mac sleeps — **met** for reads/queued
   writes; **unmet** for live conversation.
3. Companion plan Phases 1–5 shipped — **met**. Phase 6 (native wrapper)
   still parked.
4. Menu-bar Nova visible on his Mac — **blocked** (icon under the notch).
5. Live walkthrough of everything built — **unmet**, asked for 4+ sessions
   ago. Owed.
6. Hands-free Siri capture + answers — **met** (Ask Nova speaks direct
   answers; Tell Nova files and speaks receipts).
7. Produce-vs-keep corrected — **partially**: the machinery ships, but the
   3 trust-ladder proposals are still unapproved, so nothing has changed
   in his experience yet.

**STATE (what exists, where):**
- New agents this session, all on the fleet ring (`server/lib/ops.js`
  SCHEDULED): `healthMirror.js` (vault health pages, 30m tick),
  `patternScout.js` (Sat 16:00), `autonomyLedger.js` (Sun 18:00),
  `distill.js` (Sat 17:00), `reminders.js` (60s tick).
- Hands-free: `design/SIRI-SETUP.md` (Shortcut recipes, direct-IP URLs),
  `POST /api/inbox/capture/sync` (speakable capture receipt),
  `/api/ask/sync` in direct mode (`buildAskPrompt({direct:true})`).
- Reminders → Apple Reminders via CalDAV VTODO (`server/lib/reminders.js`).
- Trust ladder: `autonomyLedger.js` + `agent-mode` route in `inbox.js`.
- Distiller: `distill.js` + `distill-apply` route; jobs persist in
  `server/data/distill/<id>.json`; manual trigger `POST /api/distill/run`.
- About You interview: `rituals.js` kind `about-you`, `profile` PROPOSE
  kind in `voiceActions.js`, `profile` route in `inbox.js`.
- Ops tap-through (built by a subagent): `AGENT_DEPARTMENTS` +
  `AGENT_RECORD_KINDS` + `agentReceipts()` in `ops.js`; UI in
  `src/screens/Ops.jsx` + `src/vals/valsOps.js`.
- Server also binds the tailnet IP directly (`server/index.js`) —
  `http://100.65.137.114:4173` alongside 127.0.0.1.
- Request receipts: every `/api` call logged (method, path, client, status,
  ms, early hangups) to `~/Library/Logs/nova-os-server.log`.

**DECISIONS (choice → reason → what it forecloses):**
- **Server binds the tailnet IP directly, plain http** → Shortcuts kept
  failing through `tailscale serve` while Safari worked; the WireGuard
  tunnel already encrypts → forecloses nothing security-wise (100.x is
  tailnet-only, token still required), but the ts.net hostname is now a
  second path that can rot unnoticed.
- **Spoken surfaces use a FAST context** (`buildAskContext(..., {fast})`)
  → a CalDAV round trip is ~10s and made Siri asks ~26s, which iOS drops →
  forecloses the full brief being in every spoken answer when the calendar
  cache is cold; the cheap local TODAY block compensates.
- **Calendar reads are cached 90s** (`calendar.js`) with invalidation on
  every write and `fresh:true` for the watcher → forecloses sub-90s
  external-change detection when the app is closed (the watcher only runs
  with clients connected).
- **Autonomy is proposed, never applied** (`autonomyLedger.js`) →
  doctrine; thresholds live in code (14+ settled, 0 approvals, ≥80% dead)
  → forecloses per-draft tuning; the judgment is reviewed once, in code.
- **Distillation refuses wholesale on drift** → a stale diff must never
  clobber his newer Obsidian edit → forecloses partial application; one
  changed file voids the whole pass.
- **"I ate dinner" marks the PLANNED meal** (`inbox.js` food route, slot
  payload) → the meal already has true macros → forecloses estimating for
  named rotation slots; estimation is now only for described food.

**VERIFIED (this session, with locators):**
- Gates at close: `npm run lint` 0 errors; `npm run build` green;
  `cd server && npm test` **237 pass / 0 fail**; `git status --porcelain`
  empty; `HEAD == origin/main`; `curl localhost:4173/api/health` → 200.
- Pages deploy: `gh run list` → last two runs completed/success.
- Health push root cause CLOSED: pushlog rawBody on 6 Aug shows the full
  8-metric payload incl. `watchSteps` 10,761 vs iPhone 9,988 → MAX fold
  stored 10,761. Cause of the long saga was the Shortcut's Request Body
  (not the queries).
- Siri path: `POST /api/ask/sync` over the direct IP returned a spoken
  answer in 12.2s (was 26s) after the CalDAV cache + parallel context.
- Auth failure diagnosed from the server log line `auth reject … scheme
  ":" token len 0` — a stray colon in his header value, caused by the
  doc's `Authorization: Bearer …` one-line form (now rewritten).
- Health mirror writing his real vault: `Wiki/Health/Health Log/2026-08.md`
  exists with per-day rows and honest em dashes.
- Trust ladder's first real pass filed 3 proposals (morning brief, evening
  debrief, Daily Review → auto) and correctly abstained on thin samples
  (Plan Today n=5, weekly n=3).
- Distiller's live run: record `df80b844` pending, job
  `server/data/distill/622f0292.json`, 2 orphan Studio ideas → 4 files.
- Ops tap-through rendered against real data (screenshot taken): Daily
  Review shows its Mind skills + last 5 receipts.

**ASSUMED (treat as open):**
- That approving the 3 autonomy proposals will actually reduce the noise —
  the theory is sound but unproven; re-read the ledger in a week.
- That the distiller's link choices are good. The SUMMARY was read; the
  per-file diffs were NOT inspected. Drift-refusal + undo are the safety
  net, not review.
- That Tell Nova's food-slot path works end to end from the phone — the
  server path is unit-tested, but he has not re-tested since the fix.
- That the Scriptable widget works — written and the endpoint verified,
  never installed on his phone.
- That the About You invite renders — the vals logic is written and gated
  on `connectionStatus === 'connected'`, but it was never seen on screen.

**OPEN QUESTIONS / BLOCKERS:**
- **The 00:05 automation has not fired for 2 nights.** Manual runs work.
  Needs HIS check: Notification Centre around 00:05 for a Shortcuts
  banner, and whether the automation still says Run Immediately.
- 44 pending records — including the 3 autonomy proposals, the distill
  draft, 16 coach receipts, and 2 scout proposals.
- The live walkthrough (4+ sessions owed).
- About You is still empty; every agent still reasons without it.
- Pedometer++ parity: server accepts `pedometerSteps` but his Shortcut
  doesn't send it; unresolved whether the action even exists.
- MacBook is often on battery overnight (31% on 8 Aug) — clamshell/battery
  sleep makes any night unreliable regardless of the automation.

**NEXT ACTION:** Ask him to approve the three trust-ladder proposals, then
re-read the ledger after a week. Expected observation: dispatch/review
stop accumulating as pending and start arriving as Telegram messages;
`pending` stops climbing past ~20.

**DO NOT (dead ends already paid for):**
- Do **not** write to `server/data/inbox.json` from a SECOND node process
  while the server runs. `inboxStore` caches the file in memory; the
  server's next write clobbers the outside record. A distill record was
  lost exactly this way — it looked like a silent failure. Trigger
  in-process via an endpoint (`POST /api/distill/run` exists for this).
- Do **not** document an HTTP header as `Authorization: Bearer <token>` on
  one line for a Shortcuts recipe — it gets pasted literally, colon and
  all, and the server sees scheme `":"`. Show Key and Value separately.
- Do **not** assume a Shortcuts failure is the Shortcut. This session it
  was, in order: a stale POST body, a missing `text` field, a literal
  "Provided Input" placeholder, a colon in the auth header, and a request
  that never left the phone. Read the request log FIRST.
- Do **not** chase iOS "network connection was lost" as a network fault
  without checking latency: >25s of silence is enough for iOS to drop it.
- Do **not** add a slow external call (CalDAV) into a spoken path without
  a deadline; it cost ~20s of every Siri answer.
- Do **not** trust `tailscale serve` alone for phone→Mac; it was up and
  Safari worked while Shortcuts could not reach it. The direct tailnet IP
  is the reliable path.
- Do **not** claim an agent "ran" from a pending record alone — check the
  record survived (see the clobber note above) and that its job file
  exists.
- Everything in the previous DO NOT list still applies (Vite stale
  modules; `$` in `/m` regex over vault markdown; fixture-only tests for
  vault writers; verifying the PWA against the deployed Pages build in the
  MCP Chrome; `CACHED_LIVE_KEYS` for new live slices; Vercel/serverless;
  the steps Source filter; view-transition CDP evals).

---

## SESSION LOG (append-only, newest first)

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
