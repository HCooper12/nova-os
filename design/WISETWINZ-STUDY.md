# WiseTwinz vs Nova — study, diff, and roadmap

Sources: 21 long-form videos (all transcribed), 16 shorts (tiered T2 —
demo-dense but restating the long-form builds), 1 Instagram reel (covered by
its YouTube twin, `MxMpcOqB8_o`). Evidence: `design/wisetwinz/NOTES.md`,
frames + cleaned transcripts in `~/Desktop/nova-design-history/wisetwinz-study/`.
Baseline written before viewing: `design/NOVA-CAPABILITY-INVENTORY.md`.

## The one-paragraph answer

They have built a **beautiful, cloud-hosted, WHOOP-centred life dashboard**
whose standout trick is turning a question into a **cinematic, evidence-showing
verdict** — animated, spoken, with the arithmetic on screen and honesty labels
baked into the design. Nova is, underneath, the more serious system: a real
vault as source of truth, deterministic engines that compute rather than
narrate, undo rails on every write, offline-first, local voice, and a dozen
agents on schedulers. **They win on presentation, forecasting, and
reachability. Nova wins on truth, depth, privacy, and reliability.** The gap
worth closing is not features — it is how *little friction* stands between a
thought and Nova acting on it, and how *unforgettable* Nova's answers look.

## Main differences

### Where Nova is already ahead
| | Nova | Theirs |
|---|---|---|
| Source of truth | Obsidian vault he owns, on his Mac | Supabase in the cloud |
| Coaching logic | deterministic engines (progressions, plateaus, PRs, RPE drift, volume vs goal targets, deload, readiness, blocks, outgrown-prescription) | model narrates over metrics |
| Writes | everything undoable, inbox rails, approval-gated | direct |
| Voice | local Kokoro TTS, sentence-streamed, reveal-on-play, barge-in | browser/cloud voice, newer |
| Honest degradation | doctrine-level (missing data says so) | ad-hoc, but see their "NOT A DIAGNOSIS" label |
| Agents | 12 named agents, 25 schedulers, nightly reflection, cross-check | one mentor + crons |
| Offline | full PWA + outbox | needs the network |
| Session logging | RIR, set types, pain triage, anomaly flags, cut-short reasons | sets/reps/weight + tune |

### Where they are ahead (the real list)
1. **Answers are experiences.** A question produces a full-screen animated
   verdict with the equation visible and a spoken line. Nova's answers are
   text bubbles with small panels.
2. **Forecasting.** The Peak Tracker predicts *when he'll perform best today*
   and schedules hard work accordingly. Nova reports the past and the present;
   it never says "you'll peak at 2pm — put the hard set there."
3. **Live context to the model, one tap.** "Open in Claude" hands the model
   the live app state mid-workout. Nova's Coach has richer context but he must
   go to a tab and type.
4. **Reachability.** One dashboard, tiles, everything a tap away. Nova has
   more capability spread across more surfaces — his exact complaint.
5. **Cross-domain correlation.** Business + social metrics sit beside health,
   so "how does my sleep track my output" is answerable. Nova has money and
   health but no content/business metrics.
6. **Cloud multi-device.** Theirs is a URL. Nova needs the Mac awake +
   Tailscale.
7. **Design ritual.** Mockups before prompts, as a standing practice.

### Where they're weaker than they look
Reliability (candid 404/401 storms, missing sleep data, 11-round merges);
health data in a third-party DB; a lot of the "system" is tutorial scaffolding;
no undo story; no offline story.

---

# Roadmap — scored (impact × effort × doctrine fit)

## P0 — The front door (his standing ask, independent of this study)
**C1. One conversational front door.** A single input — spoken or typed,
reachable from every screen — that takes *anything*: a question, a link, a
command, a file. Deterministic router: YouTube/video link → Watcher; article
link → Researcher; "analyse this creator…" → a new **Study lane** (multi-video
research jobs like this one); code/build request → Claude Code lane; anything
else → Ask Nova. Every route already exists; the routing and the single door
do not. *Impact: highest. Effort: medium. Doctrine: perfect (deterministic
router, models do the work).*

**C2. Claude Code sessions inside Nova.** He should never open a terminal to
ask for a build. Nova already has `startMessage` with file access — this is a
proper surface for it: launch a session, watch it stream, see the diff, approve
the commit, all on the rails. *Impact: very high. Effort: medium-high.*

**C3. Long-running job tray.** Study/research/build jobs report progress and
notify on completion (Telegram + in-app), so a 20-minute job is fire-and-forget.
*Impact: high. Effort: low-medium.*

## P1 — Make answers unforgettable (their best idea, adapted)
**A1. Verdict cards.** Promote Nova's panels into full-screen evidence cards:
eyebrow (the question), a headline finding, an animated ring/graph, **the
equation written out**, numbered evidence tiles, a spoken verdict line, and —
where Nova is already stronger — a source/staleness footer and Nova's honest
"measured, not diagnosed" labelling. Start with three: *Why am I tired?*,
*Why is my lift stalled?*, *Where did my protein go this week?*
*Impact: very high (this is the "wow" he keeps asking for). Effort: medium.
Doctrine: excellent — deterministic code computes, the card only presents.*

**A2. Canonical question templates.** Their five-question trick, done Nova's
way: a small set of question archetypes, each with a deterministic evidence
builder, so hundreds of phrasings land on a consistent, tested answer shape
instead of freeform prose. *Impact: high. Effort: medium.*

## P2 — Forecasting (their genuinely novel feature)
**F1. Peak/energy forecast.** Nova already has HRV, sleep, RHR, steps, training
load, caffeine-adjacent food logs and calendar. A deterministic day-curve —
"sharpest 09:30–12:00, dip 14:00–15:30" — plus a calendar-aware nudge ("your
deep work block is in your trough; move it?"). Must degrade honestly: no
forecast without enough data, and it says why. *Impact: high. Effort: medium.
Doctrine fit: good, if and only if it stays deterministic and honest.*

## P3 — Reach and correlation
**R1. Mid-session live-context handoff.** A one-tap "hand this session to the
Coach" that passes the live cockpit state (already computed) — their MCP trick,
minus the dependency. *Effort: low.* (Nova is one step from this already.)
**R2. Content/business metrics lane.** YouTube/Instagram/TikTok read-only
metrics beside health, enabling "does my output track my sleep?" — Studio
already exists as the content agent. *Effort: medium.*
**R3. Cloud reachability.** Evaluate a hosted read replica or always-on
tunnel so Nova answers when the Mac sleeps. *Effort: high — flag as a decision,
not a default; it trades against the privacy position that currently beats
theirs.*

## P4 — Practice
**D1. Mockup-before-build ritual**, formalised in the design docs (he already
asked for mockups once and it worked).
**D2. Reward moments**: their star-on-progression animation is cheap and
motivating; Nova detects PRs already and says them in text only.

## Explicitly rejected (with reason)
- **Fork-and-deploy distribution / Supabase accounts** — Nova is his, not a
  product; multi-tenant auth adds surface for zero benefit to him.
- **Moving health data to a cloud DB** — directly contradicts vault-as-truth
  and is a privacy downgrade.
- **Copying their nav taxonomy** (BREACH/ACQUIRE/AUTONOMIC…) — style over
  clarity; Nova's tap-to-explain plain-English rule beats it.

## Suggested order
C1 → A1 → C2 → F1 → C3 → R1 → A2 → the rest. C1 and A1 together would change
how Nova *feels* more than anything else on the list: one door in, a cinematic
evidence-backed answer out.
