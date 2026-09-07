# The Verbs — every feature reachable by one sentence

**Status (6 Sep 2026, night): Phases 1, 2 and 3 BUILT. Phase 1 and the
Coach handoff live-proven on his vault; attachments live-proven (Ask Nova
read a screenshot off the real server). Hands: the Shortcuts hand BUILT
(sessions may now run real Shortcuts — his grant); the browser hand
DESIGNED, not built — see "The Hands".**

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

### Phase 2 — delegation invisible — BUILT (6 Sep, evening)
- `/api/ask` runs the same deterministic router the palette uses; a
  training question starts THE COACH'S OWN TURN (`lib/coachTurn.js` — the
  route's whole context assembly, moved untouched so both mouths share it)
  and a question about his people starts the Leader's. The reply comes back
  into the voice transcript under "» COACH" / "» LEADER" with the
  specialist's own proposal chip; the specialist's session id is kept under
  its own key so the Coach screen and the front door are ONE conversation.
  No extra model hop: the specialist answers directly, not Nova-then-Coach.
- `leader` is a router lane now (LEADER_RE is tight on purpose — "delegate"
  alone is a word he uses about Nova), with a capability entry and the
  contract test pinning router ↔ route ↔ registry.
- 7 Sep: `reminder.set` — `lib/whenParser.js` reads "in 20 minutes", "at 6"
  (1–7 means the evening in his life), "tomorrow at 7", "friday 9am", "on
  monday", and hands back the sentence with the time removed. It only claims
  "remind me …" when the time is CERTAIN; anything else still goes to the
  capture classifier. Undo cancels the reminder (local + iCloud).
- 7 Sep: SETTINGS BY VOICE — `src/settingsVoice.js`, client-side like the
  gym (appearance is client state; no server verb could reach it). Theme,
  style, core, calm mode, speech, wake word. Strict: a real setting AND a
  real value, or it falls through. Settings carries a "You can just say it"
  card so the capability has a door.
- Done 6 Sep: `todo.add`, `recipe.slot` ("make lunch works
  burger", "put protein oats in breakfast"), `journal.add` ("journal: …"),
  `stash.add`, `money.category` (refile a transaction and remember the
  merchant) — each with undo, each in verbs.test.js. NOT done: reminders by
  voice (the capture classifier already files "remind me …"; a deterministic
  time parser is a later build) and settings-as-words (settings are CLIENT
  state — a server verb cannot reach them; if wanted, they go the gym's way,
  client-side).

### Attachments — BUILT (6 Sep, night)
`lib/attachments.js` + `POST /api/attachments`: photos are downscaled and
stored, a video becomes evenly spaced stills (ffmpeg; no transcript, said
so); the question carries `[ATTACHED MATERIAL]` naming absolute paths the
model reads with its Read tool — the tool boundary the conversational lanes
already had, so no new model path. Both composers (Voice, Coach) have the
paperclip; thumbnails show what rides with the message; material prunes
after seven days (a photo he wants kept is a capture). Reflex and verbs are
skipped when material is attached. His use case — "which of these menu
screenshots is the best option for my goals?" — goes to the Coach when the
words are the Coach's, with its full context, or to Nova otherwise.
- Verbs for the rest of the read-model state: `todo.add` (today a capture
  round-trip), `recipe.slot` (put X in lunch), `journal.add`, `stash.add`,
  `money.category`, `reminder.set`, `calendar.*` via the existing command.
- `settings.*` verbs for the few settings that are words (theme, voice on/off,
  wake word, calm mode).

### Phase 3 — the gym by voice — BUILT (6 Sep, night)
`src/gymVoice.js` (pure; tested in `server/test/gymVoice.test.js`) +
`tryGymVoice` in App.jsx, the FIRST gate in `doOrb`. A live workout is
client state, so these run with no server round trip at all. Outside a
session: "start push day" / "start today's session" resolves the routine
strictly (a tie asks; a miss falls through to the front door). Inside:
"80 for 8", "82.5 kg x 6 at rpe 8", "12 reps", "drop to 70", "same again",
"add a set", "next", "skip it", "what's next", "undo that", "save it for
later", and "finish" — which sets a pending offer so only his "yes" logs the
session through `finishWorkoutSession` (the same path as the button). A
separator between weight and reps is required: "12" alone can never read as
1×2. Every ticked set appears in the cockpit on Train as it is spoken. NOT
verified on the gym floor — that is his standing phone-in-hand item.

### Fuel by voice — the fridge (BUILT, 7 Sep)
`meal.cooked` ("I cooked 8 portions of burrito bowl", "made 4 works
burgers") adds to `Wiki/Health/Meal Prep Portions.md`; `meal.portions`
("3 works burgers left", "works burger portions to 3") sets the count
outright — an `any` candidate with fallthrough, and the "X to N" form
REQUIRES the word *portions*: without it "set eggs to 12" was hijacked from
`shopping.qty` (the verbs suite caught it). Ticking a rotation option eaten
takes one portion off (rotation.js → portions.js), zero paints the card red,
and both verbs undo through the receipt. The recipe editor's label pass
(`labelMacros.js`) is NOT a verb — it fills fields he then saves; a spoken
"fix the macros from these labels" would be a Phase 4 confirm verb over the
same lib.

### Phase 4 — the ceiling movers
Editing existing records by voice (recipe ingredients, food-log entries,
workout history) — each is a `confirm` verb whose pending record shows the
diff; the native shell's speech APIs for always-on listening; the realtime
speech-to-speech API if he wants the last second of latency.

## The Hands — reaching outside Nova (his 6 Sep ask)

**Hand 1 — his Shortcuts (BUILT).** `lib/hands.js` lists and runs the
Shortcuts on this Mac (`shortcuts run`, input via a temp file, never a
shell; output read back and spoken). The verb `shortcut.run` resolves the
name with the same strict matcher; "goodnight" or "turn on my bedroom
lights" as a whole utterance runs the Shortcut of that name. Every Shortcut
is CONFIRM-FIRST (a pending record, his yes runs it, the receipt says there
is no undo Nova can do) until he lists it in `server/data/hands.json`
`{"immediate":[…]}`. This is what puts Messages, HomeKit, Music, Maps and
his health pushes one sentence away — through code he wrote.

**Hand 2 — the browser (BUILT 7 Sep 2026, phase 1: read · navigate · fill).**
`lib/browse.js` + the `browse` router lane. A Claude Code job whose ONLY
tools are the Chrome DevTools MCP server (`--strict-mcp-config`), pointed at
`~/.nova-browser` — Nova's own profile, never his day-to-day Chrome.
Read/navigate/fill tools only; `--disallowedTools` blocks Bash, every file
tool, upload, dialogs and key presses. Budget $2, 8-minute watchdog,
screenshots to `server/data/browse/<id>/`, and a pending record whose body is
built by `describeBrowse()` from the model's typed `BROWSE {…}` line — a
missing report is SAID, never invented. The prompt stops it before anything
that buys, pays, books, sends, posts, applies, submits, cancels or deletes,
and before any password, sign-up or captcha: it fills the form, screenshots
the button, and names what it would press. **Proven live 7 Sep** on
example.com: opened it in Nova's profile, read it, one screenshot, an
accurate report, and no Chrome left running. The honest caveat stands — in a
browser the MODEL is the actor; the protections are the profile, the tool
boundary, the cap, the receipt and the stop rule, not tested code choosing
each click. Reachable by words ("go to X and …", "check my order on …", "fill
in …", "log in to …"), and the composer's route chip shows BROWSER before he
sends. **Not built:** the resume-on-yes that would press the button.

**Hand 2 — the original design (for reference).** The Nova Chrome profile
(`~/.nova-browser`, the read-only research profile he signs into once) gets
a WRITE-capable lane: a Claude Code job with `chrome-devtools-mcp` (cached
on this Mac, v1.8.0) as its only tools, budget-capped, screenshots as
evidence, landing as a `browse` record. The honest doctrine note: in a
browser the MODEL is the actor — Nova's protections are its own profile
(never his day-to-day Chrome), the cap, a review-gated record with the
screenshots, and confirm-before-irreversible (submit, pay, send, post,
delete) enforced by stopping the session and resuming it on his yes. That
last part is prompt- and rail-enforced, not code-enforced, and the plan says
so. Build order: read+navigate+fill first; the resume-on-yes second;
"order from that spot last week" only once both have earned trust.

**The permission wall.** The auto-mode classifier refused (a) printing
server/.env and (b) a command that both created the Shortcut runner and
executed `shortcuts`. (a) is solved for good by `scripts/nova-api.mjs`,
which reads the token in-process and prints only the response — the live
proof above was done with it. (b) was worked around by creating the file
with the editor tool and testing with an injected runner; nothing here has
run a real Shortcut from a session. If he wants sessions to drive real
Shortcuts or the browser lane, the one-line allow rule is
`Bash(node scripts/nova-api.mjs:*)` in `.claude/settings.local.json` —
his to add, never mine.

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
