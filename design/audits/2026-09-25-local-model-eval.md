# Local MLX model vs Claude Haiku — inbox classifier eval

25 Sep 2026. Measurement groundwork for a "private lane": a small model
running on-device via MLX, checked against Claude Haiku on a real task
before anything switches over. Nothing was switched over. This is a
measurement, not a ship.

## Machine

Apple M1 Pro, 16 GB RAM, macOS 26.5.2, mlx_lm 0.31.3, 91 GB disk free at
the time of the run. Kokoro (the TTS sidecar) was not running during this
eval, so peak RSS below is the local LLM alone, not Kokoro stacked on top
of it.

## Method

`server/scripts/evalLocalClassifier.mjs` took 40 real records from his
`server/data/inbox.json`: the 6 that are genuine inbox-classify captures
(made through `startCapture`/`captureForReview` — kind unset, mode
`review-all`/`auto-high`/`auto-all`, source `text`/`voice`), preferred
first, padded to 40 with other real short captured text from the same
file (everything else in that file is capped well under 2000 characters —
none of it is report-length). Of the 6 genuine captures, 4 were filed
(his accepted outcome), 1 was discarded, 1 is still pending.

`server/lib/inbox.js`'s classifier prompt (`buildPrompt`) is not exported,
and it stayed that way — inbox.js was not edited or forked. Instead the
eval calls the real exported `captureForReview()`, which runs `classify()`
→ `buildPrompt()` internally, and substitutes `CLAUDE_BIN` for a small
relay that captures the exact `-p <prompt>` argument to a file and then
execs the real `claude` binary with the same arguments — `classify()`'s
behaviour is unchanged, only observed. `NOVA_DATA_DIR` pointed at a
scratch directory for the run, so this never touched his real inbox
history; `server/data/inbox.json` was only ever read.

Each of the 40 captured prompts was sent once to Claude Haiku (via the
real `classify()` path, `--model haiku`, same flags production uses) and
once to each candidate local model (via `completeLocal()`, temperature 0,
max 700 tokens). Every reply — local or Haiku — was run through the real,
exported `normalizeDecision()` from inbox.js, so "parsed" here means
"survived the actual production validation," not just `JSON.parse`.

Two candidates were tried, both from the task's candidate list:
**`mlx-community/Qwen3-4B-Instruct-2507-4bit`** (the 16GB-tier default
`hardwareProfile()` recommends for this machine) and
**`mlx-community/Llama-3.2-3B-Instruct-4bit`** (the smaller candidate).
`Qwen2.5-7B-Instruct-4bit` was not tried — the 4B result made a third,
larger download hard to justify before writing this up; see
"what's still open" below.

## Results

| | Claude Haiku | Qwen3-4B-Instruct-2507-4bit | Llama-3.2-3B-Instruct-4bit |
|---|---|---|---|
| n | 40 | 40 | 40 |
| parsed & validated | 39/40 (97.5%) | 38/40 (95%) | 0/40 (0%) |
| route agreement with Haiku | — | 24/37 (64.9%) | n/a (nothing to compare) |
| agreement with his accepted outcome | 1/4 (25%, self) | 1/4 (25%) | 0/4 (0%) |
| latency, median | 18.4s | 2.5s | 1.2s |
| latency, p90 | 22.8s | 3.5s | 1.6s |
| peak RSS during eval | — | 2523 MB | 2526 MB |

All numbers above are measured, not estimated — the median/p90 latency
comes from wall-clock timing around each request in the eval script, and
peak RSS from polling `ps -o rss=` on the spawned `mlx_lm.server` process
once a second for the duration of each model's run.

### Qwen3-4B-Instruct-2507-4bit: usable, with a real disagreement rate

38 of 40 replies were syntactically valid JSON that also passed inbox.js's
own payload validation — matching Haiku's own 39/40 on the identical
prompts. Both failures were the same shape: `"stash needs a real http(s)
link in the capture"` — the model chose `stash` for a capture with no URL
in it, which normalizeDecision correctly rejects (a real production
result: this is exactly what the safety check is for).

Where both Haiku and the local model produced a valid route (37 items),
they agreed 64.9% of the time. The disagreements are concentrated, not
scattered: **9 of 13** were the `journal`↔`note` boundary (6 cases Haiku
said `journal` and the local model said `note`, 3 the reverse) — the two
routes inbox.js's own prompt describes closest to each other ("a
reflection, feeling, or diary-style thought" vs. "an idea, insight, or
piece of knowledge worth keeping"). The rest were `todo`→`note` (2) and
one each of `journal`→`reminder` and `journal`→`todo`. Nothing in the
disagreement set was a dangerous miss (money, a wrong URL, a fabricated
payload) — it reads as the same kind of judgment call a person would
make differently on a re-read, not a broken classifier.

**On "agreement with his accepted outcome," read the 25% figure
carefully — it does not mean what it looks like it means.** The known-
outcome pool is 4 records (the entire real supply of filed genuine
captures in his history), which is too small to trust as a rate. More
tellingly: asked fresh, on the identical prompts, *Claude Haiku itself*
only agreed with what he originally accepted on 1 of those same 4 —
tying the local model exactly. One of the four was a capture worded
"Baseline" with essentially no content to classify (Haiku failed to
produce a valid decision for it at all on this run, in either its
historical filing or this fresh one); the other three are the kind of
low-confidence, ambiguous captures inbox.js's own prompt already flags
`confidence: "low"` for. This metric is honest about being measured, and
honest about being too small to lean on. It is not evidence either way
about the local model specifically — it is evidence that four data
points is four data points.

### Llama-3.2-3B-Instruct-4bit: not usable for this task as tested

0 of 40 replies survived validation. The first 3 calls timed out at 60s —
almost certainly first-generation Metal kernel compilation right after
boot, since boot itself was fast (3.9s to `/health`) and every call after
the third returned in 0.9–1.6s. The other 37 all returned *something* —
median 196 characters, well short of the 700-token budget — but every
one of them failed inbox.js's own `normalizeDecision()`, and the specific
errors are a real pattern, not random garbage: `"classifier returned no
journal text"` (11×), `"no note body"` (8×), `"no to-do items"` (6×),
`"stash needs a real http(s) link"` (6×), `"an incomplete idea"` (5×),
`"no food name"` (1×). Read together, this says the same thing 37 times:
the model picks a plausible-looking route but does not reliably fill in
that route's required payload fields. It is guessing the shape of the
answer without committing to the content — a 3B model is simply too
small to hold inbox.js's nine-route, per-route payload contract in one
pass at temperature 0 with no retry or repair.

This is a genuine, structural gap, not a prompt-tuning problem this eval
happened to trip over — it would need either a fundamentally different
prompting strategy (few-shot per route, or a smaller per-call schema)
or a bigger model to close.

## Peak memory

Both candidates landed at essentially the same peak RSS during their eval
run — ~2.5 GB — which tracks: both are 4-bit-quantized, in the 3–4B
parameter range, and MLX's memory footprint scales with weights + KV
cache, not raw parameter count differences this small. On a 16 GB Mac
that leaves comfortable headroom for Kokoro (small, ~82M params) resident
alongside it, and for the rest of the server + a browser tab or two. It
does **not** leave headroom to also run a 7–8B model concurrently without
paging — worth remembering if a future eval tries `Qwen2.5-7B-Instruct-4bit`
memory-resident at the same time as the TTS sidecar.

## Recommendation

**`mlx-community/Qwen3-4B-Instruct-2507-4bit`** — already
`hardwareProfile()`'s default for this machine — is the one worth
carrying forward, and **`mlx-community/Llama-3.2-3B-Instruct-4bit`
should be dropped** from consideration for structured-output tasks on
this repo; nothing about the boundary case suggests raising its token
budget or retrying would fix a 0% validation rate.

**Is Qwen3-4B good enough to actually replace Haiku in the inbox
classifier? Not on this evidence, not yet.** A 65% route agreement with
Haiku, concentrated on one genuinely fuzzy boundary (journal/note), is a
real, honest result — but "good enough to trust unattended" is a much
higher bar than "reasonable open weights model," and this eval had a
known-outcome pool of 4 real records to check against, which cannot
settle that question either way. What it *can* say: the failure mode is
never dangerous (no fabricated payloads passed validation, no wrong
money/URLs), latency is roughly **8–9× faster** than Haiku (2.5s vs
18.4s median) with zero API cost, and 2.5 GB of resident memory is cheap
on this machine. That is a real case for using it as an assistive
second-opinion or a pre-filter (e.g., only escalate to Haiku when the
local model's confidence is low, or run both and flag disagreement for
review) rather than a blind swap.

**Where a 4B local model looks fit, on today's evidence:** short,
low-stakes classification with a small closed set of outcomes and cheap
consequences for a wrong guess — a first-pass filter, a draft label, a
"does this look urgent" triage. **Where it looks unfit:** anything with
a strict multi-field payload contract per branch (this task, as tested,
is exactly that), anything money-adjacent, or anything unattended where
a plausible-but-wrong JSON object would get filed without a human or a
stricter Haiku-style validator catching it. inbox.js's own
`normalizeDecision()` is doing real, necessary work here — it is the
reason a mis-shaped local reply became a clean rejection instead of a
bad file.

## What's still open

- `Qwen2.5-7B-Instruct-4bit` (the 32GB-tier candidate) was not tried.
  Given 4B's real disagreement rate with Haiku, it's the natural next
  data point — slower and larger, but worth knowing whether the extra
  parameters close the journal/note gap.
- The known-outcome pool (4 filed genuine captures) is the entire real
  supply in his history right now — it will only get more useful as more
  real captures accumulate through the plain inbox box specifically
  (most of his real text capture volume currently flows through other
  lanes — dispatch, coach, plan-today — that reuse the record store but
  not this prompt).
- A retry-on-invalid-JSON pass (one repair attempt, same as
  `jsonSalvage.js` does for Haiku's own output) was not tried for the
  local models. It is very unlikely to save Llama-3.2-3B's 0% ("more
  tokens" would not change that it left the payload empty), but it might
  narrow the Qwen3-4B gap on the two `stash`-without-a-URL misses if
  those were near-misses rather than confident wrong answers.

## Raw data

Per-item results (`prepared-haiku-baseline.json`, one JSON file per
model, `summary.json`) are on this Mac at
a temp directory (`os.tmpdir()/nova-local-eval`, or `server/data/local-eval` when that path is gitignored) — outside git, and outside
this audit, per the rule that his captured thoughts don't travel further
than they have to. The few excerpts quoted above are the only capture
text in this document, and none of them are money amounts or journal
contents.
