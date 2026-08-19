# WiseTwinz study — execution plan (authored on Fable 5, executed on Opus)

Hayden's brief: analyse the WiseTwinz Jarvis system (Instagram reel +
ENTIRE YouTube channel), catalogue every feature/UI idea/capability,
compare honestly against Nova, and return a prioritised implementation
plan. Nothing missed, everything evidenced. This file IS the protocol —
the executing session follows it step by step and ticks the checklist.

Sources:
- Reel: https://www.instagram.com/reel/Db8psa6A0KK/
- Channel: https://youtube.com/@wisetwinz

## Phase 0 — Baseline BEFORE watching anything (bias control)

Write `design/NOVA-CAPABILITY-INVENTORY.md` FIRST, from the codebase, so
the comparison is against what Nova actually does today — not against a
memory colored by just having watched their videos. Sections: Voice
(TTS/dictation/conversation/reflex/briefs/panels), Agents (Coach + its
engines, reflection, cross-check, cadence, Researcher, Watcher, Studio,
Guardian, CFO...), Surfaces (Train/Fuel/Inbox/Voice/Code/...), Data
spine (vault, health push, watch ingest), Automation (schedulers,
Telegram), and Friction points ALREADY known (his words, this session:
"I shouldn't need to go to many different sections... ideally includes
Claude Code sessions" — one conversational front door that routes
watch/research/code/anything).

## Phase 1 — Enumerate (completeness is the whole point)

1. `yt-dlp --flat-playlist -J "https://youtube.com/@wisetwinz/videos"`
   → full list (id, title, duration, date). REPEAT for `/shorts` and
   `/streams` tabs — a videos-tab-only listing silently misses shorts,
   and these creators put demos in shorts.
2. The Instagram reel via `yt-dlp` (works logged-out for most public
   reels). If IG blocks: fall back to (a) checking whether the same demo
   exists on the channel (usually does), (b) asking Hayden for a screen
   recording. Record which fallback was used — never silently skip.
3. Output `design/wisetwinz/INDEX.md`: every item with id/title/
   duration/date and a tier assignment. NOTHING gets dropped at this
   stage; unrelated-looking items are tiered, not deleted.

## Phase 2 — Tier (adaptive depth, no silent caps)

- **T1 (deep)**: anything Jarvis/assistant/AI-build related by title or
  uncertainty — full `/watch` at `balanced` (scene frames + transcript).
- **T2 (transcript)**: plausibly related — `--detail transcript` first;
  PROMOTE to T1 the moment the transcript mentions their system, UI,
  voice, automation, or hardware.
- **T3 (skip)**: provably unrelated (e.g. pure vlog) — listed in the
  index WITH the one-line reason. A skip without a written reason is a
  protocol violation.
- Long videos (>10 min): transcript pass first, then focused `/watch
  --start/--end` re-runs on the demo segments the transcript flags.
  Use `--timestamps` for deictic moments ("watch this", "look here").

## Phase 3 — Per-video capture (the schema, applied to EVERY T1/T2)

Append to `design/wisetwinz/NOTES.md`, one block per video:
- id/title/date + one-line what-it-is
- **Features shown** (each with a timestamp)
- **UI patterns worth stealing** (frame path + timestamp — SAVE the
  frame into `~/Desktop/nova-design-history/wisetwinz-study/` (private;
  their content, never our public repo))
- **Capabilities Nova lacks / has weaker** (honest — "Nova has this" is
  a valid and required note too)
- **Hardware/infra** (what they run on — informs feasibility)
- **Wow-moments** (the reel-worthy beats; Hayden explicitly values these)
Rules: transcript + frames together before writing; every claim carries
its timestamp; unknown stays unknown (never infer what a cut hid).

## Phase 4 — Synthesis (only after ALL capture is done)

1. Aggregate NOTES into a deduplicated capability inventory of THEIR
   system.
2. **Diff table** vs Phase 0's Nova inventory: Ours-better / Parity /
   Theirs-better / Theirs-only / Ours-only. Every "theirs" cell cites
   video+timestamp; every "ours" cell cites the Nova file/feature.
3. Completeness critic pass, run as a checklist: every INDEX item
   accounted for (deep/transcript/skip+reason)? every NOTES feature in
   the diff? both IG and all three channel tabs enumerated? any video
   that failed to download listed as UNWATCHED (not silently absent)?

## Phase 5 — The plan he asked for (deliverable)

`design/WISETWINZ-STUDY.md`, ending in a prioritised roadmap where every
candidate is scored: impact on HIS daily use × effort × doctrine fit
(deterministic-first, honest degradation, vault as truth — ideas that
violate the Method get adapted or rejected WITH the reason, not copied).
Present to Hayden for selection BEFORE building anything.

**Workstream C (standing, from his brief — carry it into the roadmap):**
the friction-free front door. He should speak/type ONE request with a
link ("analyse this creator, note the differences") into Nova and have
it route: watch-lane for videos, research-lane for pages, a STUDY lane
for multi-video jobs like this one, and — his explicit ask — Claude Code
sessions launched and monitored from inside Nova so terminals stop being
the escape hatch. The study should actively look for how THEY solve
single-front-door, and the roadmap must include our version regardless.

## Execution mechanics (for the Opus session)

- Work through phases in order; tick the checklist at the foot of this
  file as each phase closes. Notes are append-only files, not context —
  assume compaction will happen mid-study.
- /watch runs sequentially (frames are token-heavy); after each video,
  write the NOTES block IMMEDIATELY, then `rm -rf` that video's work dir.
- Budget guard: if the channel exceeds ~25 T1-hours, stop after INDEX
  and report the scale to Hayden with a proposed cut before burning it.
- No Nova code changes during the study. Analysis first, his selection
  second, implementation third (his explicit sequencing).

## Checklist (tick in place)
- [ ] Phase 0 inventory written
- [ ] Phase 1 index complete (videos + shorts + streams + reel)
- [ ] Phase 2 tiers assigned, every skip reasoned
- [ ] Phase 3 notes for every T1/T2
- [ ] Phase 4 diff + critic pass clean
- [ ] Phase 5 study doc + roadmap delivered to Hayden
