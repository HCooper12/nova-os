# Qwen3.5 4B on Ollama vs Claude Haiku: inbox classifier, 27 Oct 2026

The 25 Sep harness (`server/scripts/evalLocalClassifier.mjs`) rerun against
the Phase A build (design/LOCAL-NOVA-PLAN.md): the local model on Ollama,
thinking off, JSON-constrained, the same call shape production uses.
Machine: M1 Pro 16 GB, load ~3–11 (one Claude session and this run).
40 real captures from his `server/data/inbox.json` (5 genuine classifier
captures with a known outcome, 35 other real captured text), scratch
`NOVA_DATA_DIR`, his inbox only read.

**A harness fault first.** The morning run reported 40 × "no captured
prompt": with local-first now the board default, the "Haiku baseline" had
gone to the local model itself, so nothing spawned the CLI relay that
captures the prompt. That pass still said something: the real classify
path on Ollama parsed 39/40 through `normalizeDecision`. The harness now
pins the lane to Claude for its baseline (`ab778405`).

## Results

| | Claude Haiku | Qwen3.5 4B (Ollama) | Qwen3-4B MLX, 25 Sep |
|---|---|---|---|
| parsed & validated | 39/40 | **36/40 (90 %)** | 38/40 |
| route agreement with Haiku | — | **19/36 (52.8 %)** | 24/37 (64.9 %) |
| agreement with his accepted outcome | 1/5 | 1/5 | 1/4 |
| latency, median | 3.5 s | **5.9 s** | 2.5 s (Haiku was 18.4 s that day) |
| latency, p90 | 5.7 s | 7.8 s | 3.5 s |
| resident memory | — | 3.2 GB (unloads after 30 min idle) | 2.5 GB |

The four local misses: "Dental floss" → stash with no link (validation
refused it, correctly), two "… is not audited yet" records → note with no
body, one with no captured prompt.

The 17 disagreements are the same boundaries the 25 Sep audit found:
note↔todo (7), note↔journal (5), todo/note↔idea (4), todo↔journal (1).
Several are arguable either way ("Daily Review — Tuesday 27 October":
Haiku note, local journal; "Save 'Homemade sausage roll' to your recipe
bank?": Haiku todo, local note). Only 5 captures have a known outcome, and
both models matched his choice on 1 of them: too few to say which is right.

## Why it is slower than Haiku here

Not the prompt read. The classify prompt is ~4.8k chars (~1.2k tokens) with
a 4.4k-char common prefix, so Ollama's prefix cache covers it after the
first call. The cost is generation: this lane's output is a full decision
(route, title, reason, a payload with items), ~150 tokens, and this Mac
generates at ~30 tok/s on the 4B, so ~5 s a decision. The 0.8 s classify
measured earlier in the day returned 15 tokens. A lane's local latency on
this machine is set by how much it has to write, and the inbox decision
writes a lot.

## What this means for local-first

His 27 Oct instruction stands: the lane runs on this Mac first. The honest
cost on the inbox lane, today: 10 % of captures fail validation and wait as
Unsorted (the same honest state as a Claude failure), about half of the
rest take a different but defensible route than Haiku would, and a decision
takes ~6 s instead of ~3.5 s. The gains are the ones the plan names:
answers when Claude is at its limit, nothing sent off the Mac, no spend.

## The shorter decision, measured the same afternoon

His call: keep local-first and tune. The compact prompt for the small model
(`server/lib/inbox.js buildCompactPrompt`): same routes, the payloads that
ARE data unchanged, but a note's body / a journal's text may be `"*"` (code
files the capture as written: `fillStarPayload`), the reason capped at
eight words, five rules. Measured THROUGH THE REAL LANE (`--through-lane`,
`captureForReview` with the lane pinned local in scratch prefs) against the
same Haiku baseline, no new Claude spend (`--baseline`).

| | morning (full prompt, replay) | compact, first run | compact + empty-means-"*" | Haiku |
|---|---|---|---|---|
| parsed & validated | 36/40 | 34/40 | **39/40** | 39/40 |
| route agreement with Haiku | 19/36 (53 %) | 17/34 (50 %) | 20/39 (51 %) | — |
| matched his accepted outcome | 1/5 | 2/5 | **2/5** | 1/5 |
| median | 5.9 s | 3.6 s | **3.57 s** | 3.52 s |
| p90 | 7.8 s | 5.0 s | **4.75 s** | 5.68 s |

The first compact run lost two parses to one new fault: five times the 4B
chose journal and sent `""` where it meant "as written". An empty or
missing body/text on note/journal now counts as `"*"` (filled BEFORE
`normalizeDecision`, which refuses an empty body; a capture with no text
is still refused). The star was used 8 times in 40. The lane is now as
fast as Haiku on this Mac, parses as often, and agrees with it on half the
ambiguous boundaries, with the cost named in the code: a note or journal
the small model sorted keeps his words uncleaned.

Worth trying next, in order of likely return: (1) the 9B on the quiet-Mac
tier for agreement (slower again: 21 tok/s); (2) a shorter decision for
the small model (payload only when the route needs one) to cut generation;
(3) five-shot route examples from his own accepted outcomes in the prompt
tail. Measure each with this harness.

Raw: `server/data/local-eval/qwen3-5-4b.json`,
`prepared-haiku-baseline.json`, `summary.json`.
