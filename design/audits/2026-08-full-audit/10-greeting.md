# 10 — Greeting (the doorman)

Audited 2026-08-30. Read-only. Files opened: `server/lib/claudeCode.js`
554-568 (prompt) + 624-668 (job), `server/routes/voice.js` 111-148 (facts
assembly — read in full at item 04), `src/App.jsx` 5336-5387 (maybeGreet:
the deterministic WHEN + delivery) and 5052-5055 (brief-supersedes-doorman),
`server/lib/spokenLog.js` (item 04). Related: briefState.js (item 05) — the
cross-device delivered-state rail this lane notably does NOT use.

## 1. What it is (verified)

The arrival greeting — generated fresh every time (Hayden's rule: nothing
Nova says is templated), from deterministic facts only:

- **WHEN is deterministic, client-side** (App.jsx:5340-5357): first arrival
  of the day (`new-day`) or a return after 3+ quiet hours (`return`),
  guarded per-device in localStorage (`novaos.voiceGreet`) plus an
  in-flight flag; demo/offline skip. Playing the morning brief stands the
  doorman down for the day (5052-5055).
- **Facts are code-assembled** (voice.js:115-148): local time/date, the
  gap kind, fleet receipts (which carry the pending-drafts count),
  the overnight-results line (new-day only), and a leisure event found by
  the keyword detector shared with the brief — "worth a warm word if it
  genuinely fits, never forced".
- **The call is a sealed-facts call** (the item-09 rail): every tool
  blocked (claudeCode.js:634-638), extended thinking off with the measured
  20s→3s lesson (653-656), fast model via `modelFor('greeting')`, budget
  cap, spokenLog receipt (663), streamed.
- **Delivery** (5361-5386): streams into the Voice transcript; on any
  other screen a HUD banner for 30s (and the transcript still gets it);
  best-effort speech. **A failed greeting is silence, never a canned
  line** (5344-5345, 558-559) — the honest choice, explicit.
- **Register** (560-568): ≤55 words, 1-3 sentences, unflappable and dry,
  thin facts → a warm brief hello, vary phrasing between visits.

## 2. Current workflow, traced

07:40, first app open of the day on his phone: maybeGreet computes
`new-day`, marks localStorage, POSTs /greet → facts: time, first arrival,
fleet lately ("Daily Review: pending, 1h ago"), overnight line, "Movie
marathon" on today's calendar → haiku composes "Morning, sir. The review's
waiting when you're ready — and I see the afternoon is spoken for. Enjoy
the marathon." → streams into the transcript, spoken aloud, logged to
spokenLog so Ask Nova owns the words.

Failure modes, as they degrade today:
- Model/connection failure → silence, streaming stub removed
  (5381-5384). **Honest by design.**
- Fleet/overnight/calendar reads fail → their facts are simply absent;
  thin facts → warm hello per the prompt. **Honest.**
- Brief plays first → doorman stands down. **Honest.**
- **Second device, same morning → greets again**: the once-a-day memory is
  per-device localStorage — the exact failure briefState.js documents and
  kills for briefs ("a per-device memory of a once-a-day event is not a
  memory of it at all") lives on in the greeting. **The platform's own
  named lesson, unapplied to the sibling.**
- **Greeted-state burns before delivery** (5358): localStorage is written
  before the job resolves, so a failed new-day greeting consumes the
  morning — no greeting, no retry until a 3h gap re-arms `return`. Same
  burn-before-delivery family as the coach raise-marker (01 con 6).

## 3. Pros — what genuinely works

- **The WHEN/WORDS split is exactly right**: code decides if a greeting is
  due (deterministic, cheap, guarded); the model only phrases it. The
  never-templated and never-canned-fallback rules are both honoured —
  silence over scripts in both directions.
- **Second sealed-facts call** — with the debrief, this proves the rail
  generalises; the no-thinking flag with its measured receipt (20s→3s) is
  latency honesty done properly.
- **The brief-supersedes-doorman rule** prevents the platform greeting him
  twice in two voices — cross-surface coherence handled deliberately.
- **spokenLog receipt** — the doorman's words are owned by the ask model;
  no two-brains split.
- **The leisure-event warm word** reuses the brief's detector rather than
  growing its own (rule 7 respected).

## 4. Cons and gaps (ranked by real-life cost)

1. **Per-device greeting memory** — cross-device double-greeting, the
   documented briefState failure mode replayed in miniature. Low harm per
   event (a redundant hello), but it is the platform's own recorded lesson
   sitting unapplied one lane over. General axis.
2. **Greeted-state burns on dispatch, not delivery** (5358) — a failed
   morning greeting silences the doorman for hours. Small, real, and the
   family is now three sites wide (greeting, coach raise-marker,
   fuel-cross raise timing).
3. **The banner is inert** [Inferred from 5372-5375 — no tap handler in
   the state shape]: a greeting that mentions the waiting review gives him
   nothing to tap; on non-Voice screens the words expire in 30s.
4. Nothing else rises to a finding: the lane is deliberately small, and
   its restraint (no streaks, no numbers, no second paragraph) is a
   feature, not a gap.

## 5. Mission test

**Daily: earns a modest, real keep** — this is a texture feature, and
honestly so: it is the mission's "more companion, less dashboard"
tiebreaker made audible at the moment of arrival, and its facts
occasionally route him ("the review's waiting"). **Weekly/monthly/
long-term: nothing, by design** — a doorman who tried to compound would be
the brief. The right mission verdict is that it does its small job well
and should stay small.

## 6. Improvement plan (ranked; uncapped — the lane is small and the list
is honestly short)

Change types: 1, 2 REFINE; 3 is a UI-shaped ADD. Rejected candidates:
richer facts (streaks, review text — the brief's job; drift), a Telegram
greeting (an interruption, not an arrival — violates the invitation
principle), any canned fallback (explicitly the thing this replaced).

1. **[Refine] Server-side greeting memory.**
   - **Need:** one arrival memory across devices — the briefState lesson
     applied to its sibling.
   - **Proposal:** extend the existing brief-state rail (same file or
     sibling key: `greet: {date, at}`) with a GET/POST the client checks
     in maybeGreet before its localStorage fallback; brief-delivered
     already writes server-side, so the supersede rule comes along free.
   - **Doctrine:** rules 4, 7 (extends briefState, no parallel store).
   - **Failure modes:** server unreachable → localStorage fallback, i.e.
     today's behavior.
   - **Impact/effort:** M / L-M.
   - **Verification:** greet on scratch from two simulated devices; second
     stays silent.
2. **[Refine] Mark greeted on delivery, not dispatch.**
   - **Proposal:** move the state write into onReady (the in-flight flag
     already prevents same-session double-fire); with item 1, a short
     server-side dedupe window (~2 min) absorbs the crash-mid-poll edge.
   - **Doctrine:** rule 4; the burn-before-delivery family fix.
   - **Impact/effort:** L-M / L.
   - **Verification:** kill a greet job mid-poll on scratch; next arrival
     still greets.
3. **[Add] Tappable banner.**
   - **Proposal:** the HUD banner navigates to Voice on tap (the
     transcript already holds the greeting) — one onClick, no new surface.
   - **What he does differently:** a greeting that names something waiting
     becomes a door, not a toast.
   - **Impact/effort:** L-M / L.
   - **Verification:** tap on scratch build at phone width (standing
     rule).

## 7. UI recommendations

Where output lands: Voice transcript, HUD banner, speech. Screened against
dashboard drift:

- **Tappable banner** (plan 3) — covered above; the one UI change worth
  making.
- **Banner longevity is right at 30s** — long enough to read, short enough
  to stay a hello; no change.
- **Accessibility:** speech is best-effort behind browser gesture rules
  and the words always land in transcript + banner — the muted-phone path
  is already honest. Verify banner contrast against HUD tokens at item
  45/47's pass; no other notes.

## 8. Verdict

**Keep as-is / Refine** — a small lane with exactly the right shape and
two small honesty debts. Highest-value next action: **server-side greeting
memory** (plan item 1) — the platform should not keep a lesson it already
paid for unapplied one lane from where it learned it.
