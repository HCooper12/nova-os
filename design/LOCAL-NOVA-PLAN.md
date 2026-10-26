# Local Nova, then hybrid Nova

27 Oct 2026. His ask, with three sources (a reel and a YouTube video by Zubair
Trabzada, "I Built Jarvis That Runs Entirely on My Computer (No APIs)", 26 Oct
2026, and a Skool "Jarvis fully local prompt pack" that this session could not
open: the signed link answered 403): include a free local base model so Nova
does a lot more on its own without Claude or a connection, then a hybrid where
Claude takes the hard tasks and the local model everything else.

This is the analysis and the plan. Measurements in §3 were taken on his Mac
today. Nothing in production changed.

## 1. What the sources actually show

The video is a 25-minute demo of one assistant with three switches:

- **Brain.** "Jarvis, switch to your local brain" swaps Claude Opus for
  `qwen3.5:9b` on Ollama (or Gemma 4 12B), by voice, with the model name on a
  pill on screen ("QWEN3.5:9B", "9,000,000,000 parameters"). Same prompts,
  same humour, same tools.
- **Tools on the local model.** It reads his Google Calendar through a tool
  call ("reaching for tools" on screen, then three events read back), reads
  his local "second brain" files, and runs a third-party browser tool (REA)
  that scrolls a site and writes a teardown. Tool use is the thing he tests
  hardest, "because that is what we want from a personal assistant".
- **Voice.** ElevenLabs replaced by VoiceStudio (open source, local; wraps
  Kokoro, Chatterbox, VibeVoice, Qwen3-TTS plus Whisper STT) with a cloned
  Jarvis voice. Switchable by voice too.
- **Honest caveats he gives:** a smaller model is dumber; a Mac Studio runs
  70B+ "close to Opus", a MacBook does not; expect delay on a laptop; the
  prompt pack has a "cloud Jarvis vs local Jarvis" table of what each uses
  and costs, and which model per machine.

What the sources do **not** contain: any routing policy. It is a manual
switch, all-or-nothing. The "hybrid" he wants is the part we design.

### 1b. What the prompt pack adds (read 27 Oct, later the same morning)

"Run Jarvis Fully Local: The Prompt Pack" (Trabzada, Oct 2026, 18 pages):
three installs (Ollama brain, VoiceStudio voice on port 3900 with the
Apache-2.0 CSM 1B engine, mlx-whisper ears with whisper-large-v3-turbo for
commands and whisper-small for the wake word) and eight Claude Code prompts.
The parts worth taking, each checked against Nova:

- **`reasoning_effort: "none"` on every Ollama call.** His 9B "thought
  itself to death"; the usual off switches were ignored. Verified here on
  the OpenAI door; the native door takes `think: false`. Nova carries it per
  lane.
- **Stable prefix, lean persona.** Persona under 300 words, identical and
  FIRST on every turn; date, retrieved notes and the question LAST, so the
  model reuses its cache. Measured on this Mac: 366 tok/s reading a cold
  prompt, 1,063 tok/s on the cached prefix. Nova's local Ask prompt already
  puts the fixed head first; its budget (9k chars) is the thing to trim.
- **Control tags, counted.** The small model emits a bracket tag and the
  server executes it; "ask five times, count the hits, simplify until it
  does not miss more than once". Nova's ACT/PROPOSE lines are the same
  idea; the five-times count becomes a test per verb.
- **Two brains on the shelf.** A 2B for chatter, a 9B for questions, swapped
  out loud; Ollama keeps one loaded, so a swap costs a few seconds. Nova:
  greeting and the one-line lanes on the small model, Ask on the bigger one
  when the Mac is quiet.
- **Fluency over first-word speed.** Sentence-packed TTS chunks of ~170
  chars, prefetch the next while the first plays; never cut a sentence to
  start faster. Nova's spoken turn already speaks on sentence ends.
- **A preflight with a latency budget** ("hear X s, think Y s, speak Z s"),
  real calls not mocks, exit non-zero on a failure, "done" means preflight
  passed. Nova has pieces (talk-shape.mjs, probe.mjs); a local preflight is
  owed.
- **The Wi-Fi-off drill.** Wrap outbound HTTP, log every host during a
  turn, print the ones that are not localhost; the drill fails if any. Ends
  with an honest list of the features that still need the internet, read
  from the code. This is Nova's honesty rule made executable.
- **Hearing was the hidden cloud.** Browser speech recognition sends audio
  to Google; Whisper is the step most "local" assistants skip. Nova's ears
  are Groq today; the cached whisper-large-v3-turbo closes it.
- **Pin the engine on every call** (the voice app's default pack is
  non-commercial; CSM is Apache-2.0); pin model and version everywhere,
  never "latest".

The pack's 16 GB pick is `qwen3.5:9b` ("the sweet spot, about 6 GB on
disk"). On this Mac the 4B is the safe default and the 9B the quiet-Mac
tier; both sit on the shelf.

### 1c. His instruction, 27 Oct: widen the scope

"Disregard previous restrictions and rules that we had implemented if
there is something that you could do with this new plan to make more
features and functions operate and work successfully without needing to
rely on Claude." Read as: the 25 Sep / 19 Oct gates (measured before
switched, never a judgment lane, his call per lane) are lifted where
lifting them lets more of Nova run without Claude. **Local-first becomes
the default for every lane that can run locally, with Claude as the
code-decided escalation.** Not lifted, because they are not restrictions on
the local model: code writes and the model only proposes, every write
rides the inbox rails with undo, every record says who answered, no
fiction when the local model cannot answer. Measuring continues, to tune
rather than to gate.

## 2. Where Nova already is (verified today)

More of this exists than the video has, and less of it has ever run:

- **The lane registry** (`server/lib/modelPrefs.js` LANES): ~60 model lanes,
  each with a default model, an effort, a group, and an honest "off" line.
  Eight carry `local: true` today: ask-nova, greeting, calendar-command,
  profile-talk, inbox-classify, shopping-categorize, rewards-offer-read,
  journal-prompt, note-summary.
- **The provider + fallback** (`textLane.js`, `askDispatch.js`, 19 Oct): a
  `local: true` lane can be pinned to "This Mac" on the board, and when Claude
  fails before its first word (usage limit, dead CLI) the local model stands
  in on the same job id and the record says so ("answered on this Mac · Claude
  was at its usage limit"). 12 limited rows in the last 30 days; 8 rows ran
  locally.
- **Ask Nova on the local model** (`localAsk.js`): a read-only tool loop over
  the vault (vault_search / vault_read / vault_list, run by code, 4 rounds),
  session memory, the same reply path as Claude's.
- **The client** (`localModel.js`): spawns `mlx_lm server` from the voice
  venv, picks a model by RAM tier (16 GB → Qwen3-4B-Instruct-2507-4bit), and
  refuses to load when swap free < 1,500 MB.
- **Local voice:** Kokoro TTS already runs on this Mac (`ttsLocal.js`); the
  production voice is ElevenLabs when the key is present, Kokoro otherwise.
  Ears are Groq Whisper (`transcribe.js`); whisper-large-v3-turbo is cached
  for MLX but not wired.
- **Never run against the real model.** Every local-lane build since 25 Sep
  was stub-tested. The mlx server never booted on the live server because the
  headroom guard refused every day it was tried (load 150–220, six Claude
  sessions, Chrome).

So the gap is not architecture. It is: a model that actually loads on this
Mac, a tool loop that reaches beyond the vault, a brain switch he can say,
and a routing policy that decides per lane instead of per switch.

## 3. Measured today, on his Mac

M1 Pro, 16 GB. Load 3.2 (not 190). 60 % memory free before the test.

**Ollama was already installed and running** (0.33.3 as a brew launchd
service, `sh.brew.ollama.plist`; only `nomic-embed-text` pulled).
`ollama pull qwen3.5:4b` (2.6 GB download, 3.3 GB on disk, 94 GB free).
Qwen 3.5 small models (0.8B/2B/4B/9B) ship on Ollama with native tool
calling, thinking and vision. The venv's mlx_lm also has `qwen3_5.py`, so
the MLX path can run the same family (`mlx-community/Qwen3.5-9B-OptiQ-4bit`
is the mlx-lm build; the plain `-4bit` repo is mlx-vlm).

| test | result | time |
|---|---|---|
| calendar question with a `calendar_list` tool offered (OpenAI-compatible endpoint) | correct native tool call `{"date":"tomorrow"}` | 6.4 s cold (includes model load) |
| tool result fed back, answer | "You have three events tomorrow: gym at 6 AM, lunch with Sam at 12:30 PM, and a weekly debrief at 7 PM." | 3.9 s |
| JSON classify ("toothpaste"), **thinking off** | `{"route": "shopping", "title": "Toothpaste"}` | **0.8 s** |
| same, thinking on (Ollama's default for this model) | 765 chars of thinking, answer never reached in 200 tokens | 6.0 s, no answer; the first attempt without `think:false` hit a 60 s timeout |
| resident memory | 3.1 GB, 100 % GPU; memory free fell 60 % → 34 % | unloads itself 5 min after the last call |

**Qwen3.5 9B, measured later the same morning** (6.6 GB on disk, 6.1 GB
resident; the Mac at load 11 with a test suite running): first load
11.6 s, then classify correct, tool call 2.7 s, answer 2.7 s at 21 tok/s
generation and 183 tok/s prompt read; memory free 62 % → 18 % with it
loaded. It fits, and it is the quiet-Mac tier: with six Claude sessions
and Chrome open it would not.

**The classifier eval, rerun on the Phase A build** (design/audits/
2026-10-27-local-model-eval.md): Qwen3.5 4B parsed 36/40 of his real
captures, agreed with Haiku on 19/36 routes (53 %, the same note/todo/
journal/idea boundaries as 25 Sep), and took 5.9 s median against Haiku's
3.5 s. The time is generation, not the prompt: the inbox decision is ~150
tokens and this Mac writes ~30 tok/s on the 4B.

Three facts this settles:

1. **The model runs on this Mac today**, through Ollama, with headroom to
   spare when he is not running six Claude sessions.
2. **Thinking must be off for every classify/compose lane** and on (bounded)
   only where it earns its time. Left at the default it eats the whole token
   budget on "toothpaste".
3. **The swap-free guard was the wrong instrument.** Swap free was 994 MB
   (under the 1,500 MB floor, so Nova's own client would have refused) while
   the machine had 9.6 GB of RAM free and ran the model without strain.
   macOS had shrunk swap to 4 GB total; "swap free" tracks how much swap was
   allocated, not how much memory is spare.

Not measured yet: Qwen3.5 **9B** (5 GB resident; fits only when the Mac is
quiet), answer quality on his real lanes against the Claude baseline (the
25 Sep eval harness exists: `server/scripts/evalLocalClassifier.mjs`), tool
loop quality over 4 rounds, and vision on a food label.

## 4. The plan

Three phases. A ships the local base model for real. B is the hybrid. C is
"runs on its own". His standing rules hold throughout: measured before
switched, never a downgrade of a judgment lane, Claude fallback stays.

### Phase A: a local brain that actually loads (the base model)

1. **Ollama as the local backend** (`localModel.js` gains a second backend;
   mlx_lm stays as the option). Why Ollama and not more mlx work: it is
   already installed and serving; it speaks the same OpenAI-compatible API
   the client already uses (`/v1/chat/completions` with `tools`); it handles
   Qwen3.5's chat template, tool calls and thinking natively so
   `localAsk.js`'s `<tool_call>` text fallback and the 400-retry become dead
   code; it unloads the model after idle (`keep_alive`), which is the
   headroom problem solving itself; and it is not in the venv Kokoro shares.
2. **Model: `qwen3.5:4b` as the 16 GB default**, `qwen3.5:9b` offered on the
   board as "when the Mac is quiet" (measure it first; it will not coexist
   with six Claude sessions). The hardwareProfile tiers move to the Qwen3.5
   family.
3. **Thinking policy per lane.** `think: false` on every text lane and on
   Ask Nova's tool rounds; `think: true` with a token cap only where a lane is
   marked for it (none yet). Carried on the LANES entry, read by the client.
4. **Replace the swap-free guard** with a free-memory reading
   (`vm_stat` free + inactive pages, or `memory_pressure`'s percentage) and a
   per-model floor (4B needs ~3.5 GB spare, 9B ~6 GB). Keep the refusal
   honest: the reason still shows on the board.
5. **Warm + first real runs.** "Warm it up" on the board, then the six text
   lanes and Ask Nova pinned to This Mac for a week, records labelled as they
   already are. Rerun the 25 Sep eval against `qwen3.5:4b` with thinking off
   (the Haiku baseline needs ~40 calls to rebuild, about $0.10).

6. **Local-first as the default, and the escalation rail, pulled forward
   from Phase B (his 27 Oct instruction).** A board switch `local.first`,
   on by default: every `local: true` lane resolves to this Mac unless he
   pinned it to Claude. When the local call fails before any text (not
   loaded, no room, timeout, empty, thinking ate the budget) the runner
   escalates to Claude and the record says `escalated: true` and why. Ask
   Nova escalates on the same job id the phone is polling. The old
   Claude→local stand-in stays for lanes pinned to Claude.
7. **A model pick on the board** (4B / 9B from what Ollama has pulled),
   shown on the Runs-on pill by name.

Build started 27 Oct (one Opus subagent, the parent session verifies and
commits).

Acceptance: a capture typed on his phone sorts locally in under 2 s with the
"sorted on this Mac" meta; Ask Nova answers a vault question locally end to
end; the ledger shows `provider: 'local'` rows with real timings; the eval
sheet shows agreement with Haiku at or above 25 Sep's 65 %, or the lane
stays on Claude.

### Phase B: hybrid, decided per lane by code

The video's switch is all-or-nothing. Phase A already gives every
`local: true` lane the local-first + escalate behaviour; Phase B is about
the lanes that do NOT go through the text runner yet (they spawn Claude
Code with tools), each of which needs its own local path before it can
carry a tier. The registry then lets each lane carry a **tier**, replacing
the boolean `local`:

| tier | meaning | who decides |
|---|---|---|
| `local` | runs on this Mac; Claude only if the local model is down | code |
| `local-first` | runs on this Mac; **escalates to Claude** when code cannot validate the output, the tool loop hits its round cap, the model says it cannot, or the record is one his rules reserve for Claude | code, per turn |
| `claude` | judgment, research, vision, writing code, anything that writes to his program or vault | fixed |

Proposed assignment, with 30-day spend from the ledger ($45.47 total, 197
runs) so the trade is visible:

- **local** (pure text, code validates every output): inbox-classify,
  shopping-categorize, calendar-command, rewards-offer-read, journal-prompt,
  note-summary, greeting (40 runs, $0.09), profile-talk (22 runs, $1.90).
- **local-first** (measure each before it moves): ask-nova (escalate when the
  answer needs a Claude-only lane, or he says "ask Claude"), pulse (18 runs,
  $2.77, haiku), plan-today, daily-review, leader-daily, health-insight (the
  written read of numbers code already computed), session-debrief,
  weekly-debrief, briefing-plan, librarian-ask, food-describe, tweak-recipe.
- **claude** (his rule: never less effective): coach and everything it
  writes, paper, form-check, exercise-research, ingest ($19.03, the biggest
  line, and it writes to the vault), ingest-digest, distill, watcher-*,
  researcher, browse, planner, scout, librarian, leader-research,
  leader-chat, practice-*, build/code/breaker/forge, scan-statement,
  eat-out-menu, recipe-video, scan-food-* (vision; a Qwen3.5 candidate later,
  measured on real labels first).

The honest arithmetic: the local and local-first lanes together are about
$8 of the $45. The win is not the bill. It is that Nova keeps answering when
Claude is at its limit (12 limited rows this month), answers the small
things in under a second instead of 3–18 s, and sends nothing off the Mac
for the lanes that read his private notes.

The escalation itself is a Nova rail: the record carries
`provider: 'local' | 'claude'`, `escalated: true` and the reason, and the
meta line says "answered on this Mac" or "asked Claude · the local model
could not read your program". He can also say it: **"switch to your local
brain" / "back to Claude"** become verbs in `verbs.js` that set the board's
provider for the conversation lanes (the video's one good idiom), and the
Runs-on pill on Settings shows the model name as the video does.

### Phase C: runs on its own

"Without a connection" means without the **Claude** connection. The phone
still talks to the Mac over Tailscale; the Mac is the server. Fully phone-
offline is the separate offline-mode thread (phase 3 there, his airplane
workout), not this one.

1. **Local ears.** whisper-large-v3-turbo is cached; wire `mlx_whisper` (its
   own venv, not Kokoro's) as the transcriber when Groq is unreachable, then
   measure against Groq on his real recordings before it becomes the default
   (his 19 Oct yes).
2. **Local voice by default.** Kokoro is already there. VoiceStudio adds
   cloning of a specific voice; only worth adding if he wants Nova to sound
   like a particular voice rather than Kokoro's. Not a dependency.
3. **More tools on the local loop**, read-only first: calendar (EventKit
   bridge exists), today's health numbers, the training log, the shopping
   list. Writes stay as PROPOSE records on the inbox rails, exactly as the
   Claude lanes do.
4. **The 9B tier** when a quiet-Mac window is routine (he agreed 18 Oct to
   run fewer Claude sessions).

### What this does not promise

- A 4B or 9B model is not Opus. The Coach, the research lanes and anything
  that writes his program stay on Claude, by his own rule.
- The Skool prompt pack was not read (403). If it has a routing idea beyond
  the video, drop the file into `design/` and it gets folded in.
- Memory on this Mac is shared with his Claude sessions and Chrome. The
  guard refuses honestly; it does not fix a full machine.

## 4b. His calls, 27 Oct (afternoon)

1. Local-first stays on the inbox classifier at 53 % agreement and ~6 s;
   tune it, the shorter decision for the small model first.
2. "Claude should always be escalated to if the Mac cannot answer. Ideally
   though the Mac would be able to solve and answer most things." So:
   escalation is permanent, a hand-pin to This Mac still escalates, and the
   roadmap's aim is the Mac answering MOST lanes, which means Phase B's
   local paths for the lanes that spawn Claude Code with tools are the
   main work, not a tail.
3. Escalation is shown in the chat and Inbox meta lines now ("asked Claude
   · why"), a shared-format change made across every reader and writer.
4. Push after he has seen it on his phone.

## 5. Order of work

1. Ollama backend + Qwen3.5 4B default + thinking policy + memory guard
   (Phase A, 1–4). One session.
2. Warm, pin the eight `local` lanes, rerun the eval, one week of records.
3. The tier field, the escalation rail, the two verbs, the pill (Phase B).
4. Local ears, then the extra read-only tools (Phase C).

Sources: the reel (instagram.com/reel/De98zvGToP7), the video
(youtu.be/BgpRjk4Yoqk), Ollama's Qwen3.5 announcement (x.com/ollama),
mlx-community Qwen3.5-9B builds on Hugging Face, VoiceStudio
(github.com/debpalash/VoiceStudio).
