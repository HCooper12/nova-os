# 35 — Breaker

Audited 2026-08-31. Read-only. Files opened: `server/lib/claudeCode.js`
977-1035 (the whole lane), `src/App.jsx` 4164-4180 (startSpar),
`src/vals/valsMisc.js` :281 (the » BREAKER chat tag), the spar route
(claudeCode routes :42). Deferrals: the Claude Code tab UI (62).

## 1. What it is (verified)

The sparring loop's adversarial half: a button on the Claude Code tab runs
an isolated, **cold** (fresh session, no resume — "judges the work cold,
like a reviewer should"), **read-only** pass over the chosen workspace
(Nova OS repo or the vault). Separation of duties is structural: Edit/
Write join the disallowed list — the enforced boundary, per the [30]/[34]
confirmed reality — so "the Breaker proves weaknesses; only the Builder
can fix them" (977-982). The prompt's discipline is exactly right for
adversarial review (990-996): concrete failures only, trace real inputs
("rather than pattern-matching on style"), no nits, no hypotheticals, no
praise; findings demand file:line + the triggering input/state; and an
honest empty result is contractual — "say exactly that and note what you
checked." Focus = his last chat message, else newest-modified files.
Findings land in the code chat tagged » BREAKER (magenta), Builder-fixable
in the same thread. Budget-capped, pinned model, lane-gated, stdin-closed
(the launchd lesson), budget-stop diagnosis prefers the CLI's structured
result over stderr noise.

**Proof it works**: compost.js credits its single-flight/atomic hardening
to "the Breaker there" — the loop has caught real bugs in this codebase.

## 2. Current workflow, traced

He ships a change in the Builder chat, taps SPAR → "Breaker engaged —
read-only adversarial pass over Nova OS…" → the Breaker reads the recent
work, returns "Verdict: two real problems. 1. inboxStore.js:41 — 
concurrent cold loads each parse the file …" → the findings sit in the
thread; he tells the Builder to fix #1; the fix carries the Breaker's
framing.

Failure modes:
- Nothing found after a real attempt → says so with what it checked.
  **Honest — the no-manufactured-findings contract.**
- Job/budget failure → error surfaces in the chat as a system line.
  **Honest.**
- **Focus is a weak proxy**: the last user message may be "thanks", in
  which case the Breaker attacks whatever files are newest — stated
  fallback, but the real "recent work" signal (the git diff) exists and
  isn't used.
- No server-side watchdog (client poll gives up at 10 min; the job runs
  to budget) — [24] family, minor here.
- Findings are ephemeral chat text — evaluated and **accepted as
  correct**: sparring is interactive by design, he is at the keyboard,
  and formalising dev-tool findings onto the rails would be ceremony
  without a consumer. Rejected, not deferred.

## 3. Pros — what genuinely works

- **Cold + read-only + adversarial as three structural choices**, each
  with its reason in a comment — the lane is a design argument in
  miniature.
- **The honest-empty contract** — an adversarial reviewer that must
  earn its silence.
- **Demonstrated value** — a named catch in production code.
- **Right-sized**: 58 lines, no state, no scheduler, riding the existing
  jobs/poll machinery.

## 4. Cons and gaps (ranked by real-life cost)

1. **The focus heuristic** — last-message-or-newest-files when
   `git diff` is the truth of "what the builder just shipped".
2. **Watchdog family member** ([24]) — minor; budget bounds it.

## 5. Mission test

**Indirect but real**: the Breaker improves Nova itself, and Nova is the
mission's instrument — one prevented store-corruption bug (its documented
catch was exactly that class) protects every agent above it. On-demand
cadence is correct; a scheduled Breaker was considered and rejected here:
adversarial review without a Builder present to fix is a report nobody
asked for ([05]'s lesson inverted).

## 6. Improvement plan (ranked; uncapped — short by honest assessment)

1. **[Refine] Seed the focus with the real diff.**
   - **Proposal:** for the repo workspace, prepend `git diff --stat HEAD`
     (and the last commit subject) to the prompt's focus section —
     deterministic, cheap, and the actual definition of "the newest
     work"; the vault workspace keeps the current heuristic.
   - **Impact/effort:** M / L.
   - **Verification:** spar on a scratch change; the verdict references
     the diffed files.
2. **[Refine] Watchdog** — the shared settle-timeout helper when [24]
   lands. **Impact/effort:** L / trivial then.

## 7. UI recommendations

- **None.** The » BREAKER tag with its distinct colour in the code chat
  is the right rendering; findings-as-text in an interactive thread is
  the right form.

## 8. Verdict

**Keep as-is** — the third clean keep of the audit; a 58-line lane with
structural separation of duties, an honesty contract, and a production
catch to its name. Highest-value next action: the git-diff focus seed,
whenever the Code tab is next touched.
