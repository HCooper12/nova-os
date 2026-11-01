# Apple's on-device model vs Claude Haiku and Qwen3.5 4B: inbox classifier, 1 Nov 2026

His decision that day: yes to Apple's on-device model (the FoundationModels
framework, the model behind Apple Intelligence) as a third local brain,
measured on the classifier harness first, then the short lanes when Ollama
cannot load the Qwen model, "or always, if it is as good". This is the
measurement.

Built for it: `server/apple-llm/main.swift` (a long-lived helper speaking
JSON lines, built by `server/apple-llm/build.sh` into
`server/bin/nova-apple-llm`) and the `apple` backend in
`server/lib/localModel.js`. Machine: M1 Pro 16 GB, macOS 27.0, Apple
Intelligence on. Same 40 real captures and the same paid-for Haiku baseline
as 27 Oct (`--baseline`, no new Claude spend), scratch `NOVA_DATA_DIR`, his
inbox only read. Commands:

```
node server/scripts/evalLocalClassifier.mjs --backend apple --through-lane \
  --baseline server/data/local-eval/prepared-haiku-baseline.json --limit 40 \
  --out server/data/local-eval-apple
node server/scripts/evalLocalClassifier.mjs --backend apple \
  --baseline server/data/local-eval/prepared-haiku-baseline.json --limit 40 \
  --out server/data/local-eval-apple
```

## Results

| | Claude Haiku | Apple, through the lane (compact prompt) | Apple, replay (full prompt) | Qwen3.5 4B through the lane, 27 Oct |
|---|---|---|---|---|
| parsed & validated | 39/40 | **35/40 (87.5 %)** | 37/40 | 39/40 |
| route agreement with Haiku | — | **13/35 (37 %)** | 10/37 (27 %) | 20/39 (51 %) |
| matched his accepted outcome | 1/5 | **1/5** | 1/5 | 2/5 |
| latency, median | 3.5 s | **4.07 s** | 5.7 s | 3.57 s |
| latency, p90 | 5.7 s | 7.2 s | 6.7 s | 4.75 s |
| memory this process holds | — | 20 MB (the helper; Apple holds the model outside it) | | 3.2 GB |

Through-the-lane latency is the whole `captureForReview` call (prompt build,
the helper round trip, parse, a scratch record write). The first capture
took 7.2 s (the model's first load after the helper started); the helper
itself was answering its health line 62–70 ms after spawn. Warm median
4.07 s, p90 7.4 s, slowest 17.0 s.

A short classify outside the lane (a one-line capture asking for
`{"route","title"}`, 120 tokens max, the bench in this session's scratch):
cold 4.9 s (helper start + model load + answer), warm median 1.4 s, p90
1.6 s over ten captures. The inbox decision is slower because it writes a
full decision (route, title, reason, payload).

## Which prompt, and the window

Apple's hard limit is 4,096 tokens, prompt and answer together. By the
chars/4 estimate the compact prompt (`lib/inbox.js classifyPromptFor`, what
the lane sends when it resolves to this Mac) is ~596 tokens median, ~778 max;
the full Claude prompt is ~1,199 median, ~1,359 max. Both fit with the lane's
700-token answer budget; the replay pass sent the full prompt 37 times and
had no context refusal. The through-lane pass (the production path) used the
compact prompt.

## What went wrong

- **Three guardrail refusals** on the same benign capture, "Wove pasted
  content into the vault": "The model's safety guardrails were triggered.
  (Response may contain sensitive or unsafe content)." The Qwen model has no
  such layer. The error passes through as plain text and the lane escalates
  (in production) or fails (in the eval), never an empty answer.
- **Two invalid stashes**: "Save … to your recipe bank?" captures routed to
  stash with no link; validation refused them, correctly.
- **It does not use the `note` route.** Of Haiku's 17 notes, Apple called
  none a note through the lane: 7 became todo, 6 idea, 1 journal. Overall it
  answered todo 17 times and idea 13 times against Haiku's 15 and 1. The 22
  disagreements: note→todo 7, note→idea 6, todo→idea 5, journal→todo 2,
  note→journal 1, journal→idea 1. Some are arguable (the same boundaries the
  25 Sep and 27 Oct audits found), but "idea" for 13 of 35 is a skew, not a
  boundary.
- **JSON in a fence.** Told "no markdown, no code fences", it still wraps the
  JSON in a ```json fence; `localModel.js unfenceJson` unwraps it by code.

## Runtime JSON schemas: possible, not yet used by a lane

`GenerationSchema` is `Codable`, and its coding is JSON Schema plus Apple's
own `x-order` key (measured: encoding a `@Generable` struct). So a schema
decided at runtime decodes in the helper, and `respond(to:schema:)` returns
guided JSON (`GeneratedContent.jsonString`) whose shape the framework
guarantees. The helper takes a `schema` field and fills in a missing
`x-order`, `title`, `additionalProperties` and `required`, and
`completeLocal(..., { schema })` passes it through on the Apple backend.
Measured: a `{route: enum, title}` schema answered a correct sort. No lane
passes a schema yet, because the inbox decision's payload differs by route.
Guided generation would end the parse failures. It would not fix the route
skew, which is a judgement problem.

## What this means

On this task Apple's model is **not as good** as the 4B: 14 points less
agreement with Haiku, more parse failures, guardrail refusals on ordinary
captures, and a little slower through the lane. "Always" is not supported.
It costs nothing and answers when the 4B cannot load: it holds no memory in
Nova's process and does not compete with Ollama.

As built, when Ollama is preferred and the headroom guard refuses a load, a
short call (prompt + answer budget under ~3,500 tokens by chars/4, no tools)
runs on Apple instead of escalating to Claude, labelled `apple:on-device` on
the ledger and the board. `NOVA_LOCAL_APPLE_STANDIN=0` turns that off, and
the no-room case then escalates to Claude as before. Whether a no-room
capture should get Apple's weaker sort or Claude's is his call.

Raw per-item results: `server/data/local-eval-apple/` (gitignored).
