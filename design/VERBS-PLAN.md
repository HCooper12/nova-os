# The Verbs — every feature reachable by one sentence

**Status: Phase 1 BUILT (6 Sep 2026). Phases 2–4 planned, not built.**

## The brief

Hayden, 6 Sep 2026, after the Astra reel (Instagram `Dc2tUv7qTSL`, watched
in full — a yellow circle becomes a rocket window, then a Blender model, then
an STL for the printer; a rainwear deck; an eBay listing that pulls a photo
from Downloads; an asteroid game; food from "that spot last week"; a licence
template with one clause tightened; a tennis court found and booked on
"yeah, book it"):

> Every single feature of Nova must be accessible and able to be efficiently,
> effectively, and optimally performed simply through speaking to it by voice
> or by typing a command directly to Nova without having to go through a
> separate profile section or speak directly to an agent myself. … It also
> needs to feel fluid and dynamic and efficient without lots of lag or
> awkward waiting.

What the reel actually demonstrates, stripped of the apps:
1. **One front door.** He never chooses which agent; he says the thing.
2. **Every action is a sentence** — including edits to something made earlier.
3. **Several things in flight**, each acknowledged in one line, each askable
   later ("what's going on with my reservation?").
4. **Follow-ups by reference** ("take this", "the photo in Downloads").
5. **A word confirms** ("yeah, book it").
6. **No visible delegation, no dead air.**

## Where Nova stood (the map, 6 Sep — evidence in the session handoff)

Already there: one front door (typed, spoken, Siri and Telegram share the
brain); deterministic routing to the job lanes; spoken yes/no on a proposal;
six SHOW panels; warm model processes (~1s follow-up turns); the sub-second
reflex layer; concurrent jobs with records and a status tray.

The gap, precisely: speech reached **capture, dispatch and coaching-program
edits** — and nothing else. Every state change on an existing record (tick
a to-do, check an item, mark a meal eaten, mark a priority done, edit a
recipe, change a setting), the whole gym flow, approving a plan, addressing
the Coach or Leader without leaving the chat, and a deterministic answer to
"how's X going" were tap-only or model-memory-only.

## The design — the registry, in Nova's doctrine

`server/lib/verbs.js` is **the action registry**: one deterministic, tested
catalogue where every user action is a verb with an argument contract, a
tier, a `run` and an `undo`.

- **Models decide, code acts.** The model (or the grammar) *names* a verb and
  its arguments; only the registry's `run` writes. The prompt's catalogue is
  *generated* from the registry (`describeForModel`) so it cannot drift.
- **Everything writeable is undoable.** Every act lands a receipt on the inbox
  rails (`kind: 'act'`, route `'act'`, `undoData`) — the transcript's Undo and
  the Inbox's undo are the same rail. Confirm-first verbs land PENDING and
  take the same spoken yes as a proposal.
- **Honest degradation.** Names resolve against his REAL lists (`matchName`):
  exact > prefix > all-words. A tie is *"which one?"* and nothing runs; a miss
  says what it looked for. Every real word he said must be in the name —
  "call mum" can never tick "Call the dentist".
- **Two ways in, one registry.** `parseCommand` is a strict grammar for the
  high-frequency verbs: a hit runs against his data in well under a second
  and the model is never spawned (`tryCommand`, in `/api/ask` and the Siri
  lane, right after the reflex). Everything else reaches the model, which
  may end a reply with `ACT {"verb":…,"args":{…}}` — same validation, same
  receipt. Words that fit two domains ("tick off the eggs") are probed
  against all of them; exactly one match runs, two ask.
- **Tiers.** `act` runs now (reversible, cheap, intent plain). `confirm`
  lands pending (the shopping-list clear).

### Phase 1 — BUILT
Verbs: `todo.done / reopen / move`, `shopping.done / undone / qty / clear`,
`meal.eaten / uneaten`, `plan.priority`, `plan.run`. The `ACT` directive on
the Ask Nova turn. The fast path in both ask routes. The status reflex
("what's going on with the creatine research?" → the record's real state and
age, from the ledger, never from memory; a job it cannot fit falls through
to the model). A proposed plan now lands in the transcript with the yes/no
chip the moment the planner finishes, so a spoken "yes" runs it (the run
endpoint had no caller before). Client: the **Done** strip with Undo on the
message; `BY VOICE` receipts in the Inbox. Tests: `verbs.test.js` (grammar,
names, every verb's run + undo through the rails, the fast path, the ACT
parser, the generated catalogue) and the status reflex in `reflex.test.js`.

### Phase 2 — delegation invisible (next)
- `coach` and `leader` lanes answer IN the conversation: Ask Nova hands the
  question to the Coach's own turn (its context, its PROPOSE vocabulary) and
  relays the answer with the Coach's proposal chip — no screen change. Same
  for the Leader. The model-choice gate stays.
- Verbs for the rest of the read-model state: `todo.add` (today a capture
  round-trip), `recipe.slot` (put X in lunch), `journal.add`, `stash.add`,
  `money.category`, `reminder.set`, `calendar.*` via the existing command.
- `settings.*` verbs for the few settings that are words (theme, voice on/off,
  wake word, calm mode).

### Phase 3 — the gym by voice
A session mode on the Voice screen: "start push day" → the live cockpit's
state machine driven by verbs (`session.start / set / skip / next / finish /
later`), numbers parsed deterministically ("80 for 8", "same again", "drop
to 70"), every set receipted to the draft the cockpit already persists.
Wants his phone in hand at the gym to verify (standing reminder).

### Phase 4 — the ceiling movers
Editing existing records by voice (recipe ingredients, food-log entries,
workout history) — each is a `confirm` verb whose pending record shows the
diff; the native shell's speech APIs for always-on listening; the realtime
speech-to-speech API if he wants the last second of latency.

## Latency, honestly
Measured before this build: cold first turn ≈ context 2.4s + CLI 2.2s +
prompt-cache creation; resumed turns ≈ 1s to first words; reflex < 1s. The
verbs add a third sub-second path for *doing*. What still costs: the first
turn of a day (prewarm on mic-open covers most of it), and any verb the
grammar is not sure about (one model turn, then the same code path).

## Do not
- Do not let a verb guess a name. A tie asks; a miss says so.
- Do not add a verb without its undo, or a `confirm` verb without a pending
  record — the receipt is the feature.
- Do not write the catalogue into the prompt by hand; `describeForModel()`
  is the only source.
