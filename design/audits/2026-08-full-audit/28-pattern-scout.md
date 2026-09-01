# 28 — Pattern Scout

Audited 2026-08-31. Read-only. Files opened: `server/lib/patternScout.js`
(full, 238 lines); the model-choice gate verified at 26; the preference and
skill-backlog filers at earlier items. Tests: patternScout.test.js exists.
Deferrals: the Nova Skills registry page rendering (51/55), morningShow
beat (39/44).

## 1. What it is (verified)

The self-improvement noticer (10-17): weekly, a model reads what Hayden
actually DID by hand — 30 days of captures aggregated by route with
approve/discard fates, recent capture titles verbatim, and agent drafts he
discarded grouped by kind ("a pattern of discards means an agent is
drafting the wrong thing" — the fleet's one meta-learning signal) — plus
the skills registry, the existing backlog (never re-propose), and his
standing rules (38-82). It proposes **0-2** items, and "ZERO is the
normal, expected answer most weeks" (96): a standing rule (existing
preference filer) or a skill-backlog line (registry page filer), both
review-all on the rails. Discipline: counts in the why, one occurrence is
an anecdote, never invent usage (100-103).

**The run marker receipts silence** (131-133): even a zero-proposal week
files "nothing cleared the bar this week" — "silence must also be
receipted, or it re-runs all day." Lane-off refuses BEFORE the marker
exists (161-163). Saturday ≥16:00 raises the model-choice card (an hour
before the Distiller's — the connect-the-dots work he asked to be offered
Opus for); weekly dedupe on both the card and the run.

## 2. Current workflow, traced

Saturday: he answers the gate card → the scout reads the picture — say,
"expense ×9 (9 filed)" and six near-identical supplement captures → one
proposal: standing rule "Log the morning creatine automatically when the
health push lands" with the counts in the why → a pending review-all card;
approval writes the rule every agent reads. A quiet week files the honest
marker instead.

Failure modes, as they degrade today:
- Zero patterns → receipted silence. **Honest — the [16] quiet_reason
  pattern at record level; name them together.**
- Lane off → nothing left behind. **Honest.**
- Junk output → marker errors. **Honest** — but no watchdog
  (spawn-and-settle family #7): a hung run leaves the marker
  `classifying` until boot.
- **A declined proposal can return**: the context carries the backlog and
  standing rules as never-re-propose lists, but a scout proposal he
  DISCARDED lands in neither — next week's run can re-propose the same
  rule verbatim ([13]/[17] family, another site).
- **The discard signal has counts but no reasons**: why-chips reasons
  exist for a growing set of kinds and would sharpen "coach ×4 discarded"
  into "discarded because too aggressive ×3" — captured, unconsumed here
  ([03] family).
- Saturday-only gate → [12] class, site #7 (free widening; same commit as
  the Distiller's).

## 3. Pros — what genuinely works

- **Receipted silence** — the strongest anti-noise design in the fleet's
  weekly lanes, and the reason the weekly guard stays honest.
- **The meta-learning signal** — discard patterns as evidence that an
  AGENT needs re-aiming, not just that a task needs automating; this is
  the qualitative half the kind-level learning loop (02) lacks.
- **Zero-is-normal, counts-required, 0-2 cap** — the noticer-loop
  template ([13]) discipline applied to a model lane.
- **No parallel rails**: both proposal types ride existing filers.
- **Refuse-before-record + the model-choice gate**, both with their
  reasons documented.

## 4. Cons and gaps (ranked by real-life cost)

1. **Declined proposals can be re-proposed** — the one respect-his-no
   gap in an otherwise mannerly lane.
2. **Decline reasons unconsumed** — the sharpest available evidence for
   its own meta-signal, left on the table.
3. **Watchdog family member** ([24]).
4. **Saturday gate** ([12]).

## 5. Mission test

**Long-term: this is the platform's self-improvement organ** — the only
agent whose output makes OTHER agents better (standing rules) or grows
Nova's capabilities (backlog); its value compounds precisely because it
is rare, evidenced, and gated. **Weekly:** one card at most, usually
none — correct. **Daily: n/a by design.** The mission risk is manners
(con 1): a self-improvement agent that re-pitches rejected ideas teaches
him to discard it.

## 6. Improvement plan (ranked; uncapped)

Change types: all REFINE.

1. **[Refine] Never re-propose a declined proposal.**
   - **Proposal:** context gains recently-discarded `pattern` records
     (last 90d, title + declineReason when present) under an explicit
     "he said no to these — do not re-propose unless the counts have
     materially grown since, and then name the history." The [17]
     material-change design, third application.
   - **Impact/effort:** M-H / L.
   - **Verification:** context snapshot test; replay against real
     records.
2. **[Refine] Feed decline reasons into the discard signal.**
   - **Proposal:** where discarded agent drafts carry declineReason,
     group and quote them ("coach ×4 — 'too aggressive' ×3") so the
     standing-rule proposals aim at the stated why, not the inferred one.
   - **Impact/effort:** M / L.
3. **[Refine] Watchdog** — the shared settle-timeout helper when [24]
   plan 2 lands. **Impact/effort:** L / trivial then.
4. **[Refine] Widen the Saturday window** (with the Distiller's — one
   commit, both gates; or adopt Compost's age-based shape).
   **Impact/effort:** L / L.

## 7. UI recommendations

Where output lands: the model-choice card, pending proposal cards, the
Nova Skills registry page. Screened against dashboard drift:

- **None** — the cards are right-sized and the registry is a vault page
  he owns; the two text-level fixes ride existing surfaces.

## 8. Verdict

**Keep as-is / Refine** — the fleet's self-improvement organ with the
right rarity, evidence bar, and receipted silence; its findings are four
small courtesies. Highest-value next action: **never re-propose a
declined proposal** (plan item 1) — the agent that exists to learn from
his behavior should start with his "no".
