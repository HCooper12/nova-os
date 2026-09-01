# 45 — Mission Control (the home screen)

Audited 2026-08-31. Read-only. Files opened: `src/screens/MissionControl.jsx`
(1-259 line-by-line; 260-380 = plan/deck/noticed/vault cards, read at 06 +
mapped), `src/vals/valsMission.js` (piecewise across items 02/06/11 +
232-283 staleness idioms; ~775 lines total, declared partially-read),
MissionStructured.jsx (renders the SAME view model — 06's read).
**Visual verification**: the deployed app opened read-only in a fresh tab
(demo mode, since a fresh tab has no backend connection) — full-page
desktop render captured. **Phone-width could not be captured**: the
browser window refused to resize below desktop width (tool limitation);
mobile layout claims below are code-verified only (`mob` branches) and
tagged so, per the standing rule. Deferrals: CalendarView/StepsHistory
overlays (47/46), CommandPalette, the sidebar/chrome (belongs to all
screens; assessed at 58/62 passes).

## 1. What it is (verified in code; desktop render verified live)

The Command Core home: hero (date · live clock · agents-live · systems
label eyebrow; greeting + gradient tagline + a standfirst composed of
bold-segmented REAL numbers), the living Nova core (click → Voice, with
an aria-label) orbited by three conic-progress satellites
(sleep/steps/protein, each tappable), the BODY strip (weight/HRV/RHR/kcal
with per-metric staleness hints), Suggested Focus / TODAY / Daily-Review-
concept row, the **NOVA IS WORKING** job tray, Plan-Today + Command Deck
(06), the Nova-noticed pane (11's insights + streaks), and two vault
cards. Everything renders from the view model — "same live-data truth";
the Apple-layout twin (MissionStructured) renders identical data and
actions from the same object.

**Verified live (demo mode)**: the honest-demo trifecta — "DEMO DATA" in
the eyebrow, "DEMO DATA" on the BODY pane meta, and the persistent toast
"Demo data — connect your backend in Settings" — renders exactly as
doctrine demands; scripted noticed-items appear only here
(valsMission's demoMode gate, code-verified at 11). Layout, tokens
(corner-bracketed panes, mono microlabels, per-domain accent colors), the
focus card's two-action pattern, TODAY's now-marker/countdown/category
chips, and the calendar-command DRAFT input all render as coded.

## 2. Current workflow, traced

Live morning: he opens the app → greeting + tagline; the standfirst says
the real thing ("Recovery reads strong — HRV 93.5ms… but yesterday's
block never fired") with the steps-stale warning woven in when the push
didn't land (valsMission:232 — "Step data is stale (last push …) — the
wake-up Shortcut isn't running"). Satellites show today's三 numbers;
tapping steps opens the correction overlay. TODAY shows the now-playing
event with countdown; typing "move gym to 6" drafts a confirm-first
calendar change. The plan card asks for its yes inline; the job tray —
"the persistent, unmissable answer to 'is anything actually happening?'",
born from a 40-minute book analysis running with no sign of life, and
placed ABOVE the day's plan because "work in flight outranks work
planned" — shows every running job with ✓/✕/◍ states.

Failure modes, as they degrade today (surface-level):
- Demo vs live vs offline → labeled three ways, verified. **Honest.**
- Stale steps/sleep/HRV → per-metric self-labels + hero warning
  (code-verified). **Honest.**
- Calendar stale → todayStaleLabel replaces the 14-days link. **Honest.**
- **A failed Plan-Today renders as no plan at all** ([06]'s verified
  filter hole — the one dishonest state on this screen).
- **Insights render undated with a wrong empty state** ([11], landing
  here).
- Job failures show ✕ in the tray. **Honest.**

## 3. Pros — what genuinely works

- **Every number on the screen is an action**: satellites open overlays,
  body metrics open histories, the focus card carries its fix, TODAY
  takes commands, the plan approves inline. This is the anti-dashboard
  doctrine rendered — almost nothing here merely displays.
- **The job tray's design reasoning** (235-239) — placement as doctrine,
  from a real incident.
- **The standfirst as composed evidence** — the hero speaks real numbers
  with honest staleness woven in, not vibes.
- **One view model, two layouts** — the structured twin can't drift.
- **The demo trifecta** — verified pixel-real.

## 4. Cons and gaps (ranked by real-life cost)

1. **[06] The plan card's error invisibility** — owned there, lands here.
2. **[11] Insight datelessness + the wrong empty text** — owned there.
3. **A naming collision**: the purple "DAILY REVIEW · CONCEPT" card is
   the spaced concept-revisit (client-side date-hash pick — the [05]
   unpinned twin), NOT the Daily Review agent — whose actual review has
   no presence on this screen at all ([02]'s reachability finding). One
   name, two features, and the flagship wears neither.
4. **Phone-width render unverified this pass** — the `mob` branches
   (2-col body grid, stacked rows, 232px core) read correctly in code,
   but the standing rule says measured, not read; carried as an open
   verification item.

## 5. Mission test

**Daily: earns its keep as the platform's front door** — the screen
answers "how am I, what's now, what needs me, is Nova working?" in one
glance with every answer actionable; the mission's
companion-not-dashboard tiebreaker is architecturally honoured here.
**Weekly/monthly: n/a** — this is a today surface, correctly.

## 6. Improvement plan (ranked; uncapped — mostly landings of owned fixes)

1. **[Refine, owned by 06] Plan error state on the card** — the one
   dishonest render.
2. **[Refine, owned by 11] Insight age chips + two empty states.**
3. **[Refine] Resolve the review naming collision.**
   - **Proposal:** rename the concept card's header to CONCEPT REVISIT
     (or REVISIT), freeing "DAILY REVIEW" for [02]'s pending-review chip
     so the flagship's artefact gets the name and the home presence.
   - **What changes:** the day's actual review gets seen at review time;
     the concept card stops impersonating it.
   - **Impact/effort:** M / L.
4. **[Verify] The phone-width pass** — when a resizable client is
   available (or via his phone directly): satellites' absolute
   positioning over the 232px core, the body 2-col grid, and TODAY's
   scroll region at 375px. Code reads right; the rule says measure.
5. **[Refine, owned by 05] Pin the review-pick hash twin.**

## 7. UI recommendations

Beyond the plan items, screened against dashboard drift:

- **None new.** The screen is dense and every pane already carries its
  action; adding anything would subtract. The audit's home-screen asks
  (review chip, error states, age chips) are all reachability/honesty
  fixes to existing panes, not additions.

## 8. Verdict

**Keep as-is / Refine** — the anti-dashboard doctrine made visible, with
its three flaws all owned by agent items and one naming collision of its
own. Highest-value next action: **land [06]'s error state + [11]'s age
chips together** — the two honesty gaps on the platform's most-seen
screen.
