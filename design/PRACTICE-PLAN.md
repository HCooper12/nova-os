# Practice — rehearsing a skill with Nova, and being told how it went

*Written 27 Sep 2026 (AEST) from his ask: while listening to* The Next
Conversation *(Jefferson Fisher) he meets ideas on communication, confidence
and assertiveness that he would love to implement, "but the problem is I
don't have practice." He wants to tell Nova — through the Inbox or by voice —
"I really love the ideas in chapter 8 and I want to practise them", have Nova
note it and do all it can to be prepared, then rehearse the skill with Nova
"back-and-forth like a real human conversation", and get feedback grounded in
what Nova has researched or been given (the book's text, if he can provide
it). He called it "a starting point that we can hopefully build upon."*

## The need under the request

Knowing a move is not the same as being able to do it under pressure. Every
idea he collects about how to speak lands as knowledge in the vault (the
Jefferson Fisher clip is already there as a Source with seven Concept pages:
Silence as Leverage, Make Them Say It Again, Questions of Intent …) and
stops there, because there is nowhere to try the sentence out loud against
someone who pushes back. What should be true afterwards:

1. He can name a skill in one sentence, from anywhere, and Nova assembles
   what it actually knows about it — his sources first, the book's text when
   he provides it — into a practice page he can read and edit.
2. He can rehearse it: Nova plays the other person, in character, one human
   turn at a time, and applies real pressure. Speaking and hearing, on his
   phone.
3. When the scene ends, code writes the receipt: which moves he landed
   (quoted from his own mouth), which he missed, the line from the source he
   could have used instead, and the one thing to work on next.
4. Over weeks, the skill develops on purpose: the next scene targets the
   moves he has not landed; the Home card carries the next rehearsal and
   what it is for; the other agents know what he is working on.

## What already exists (extend, never duplicate)

| Need | Already built as |
|---|---|
| A continuing conversation with an agent, resumed across turns, streamed to the client | `startAskLeader` in `server/lib/claudeCode.js` (warm pool, `--resume`, job polling via `/api/claude-code/:jobId`) |
| A typed directive the model appends and code parses off the reply | the Leader's `REFLECT {…}` line (`parseLeaderReflect`), the Coach's `PROPOSE` |
| Everything writeable undoable | `createRecord({status:'filed', undoData:{route}})` + `undoFiling` in `server/lib/inbox.js` |
| His sources, ranked for a topic, with paths | `shelfContext(vaultPath, {topics, limit})` in `server/lib/sourceShelf.js` |
| A book he owns, read into the vault with `provenance: read` | `POST /api/ingest/book-file` → `bookText.js` → the Librarian weave |
| A catalogue page he can edit + a code-written log, spacing that widens on TRIES | `server/lib/repertoire.js` (`Wiki/Library/Repertoire.md`) |
| A spoken sentence routed to a lane, forwarded to a screen | `routeIntent` in `intentRouter.js`, `out.forward` in `routes/intent.js` |
| Dictation and speech on his phone | `src/useDictation.js`, the Voice screen's TTS path |
| A lit Home section in its own hue, in both idioms | `glowPanel(accent)` + `valsMission` + `MissionStructured` ORDERS |

The missing piece is the **room**: a scene partner that stays in character,
a stage that shows him what he is practising, and a debrief written by code.

## Architecture (the Method applied)

**Models interpret, code acts.** Three model roles, one lane each:

- **Prepare** (`practice-prepare`, one-shot, reads the vault): his sentence
  → a typed JSON dossier (moves, scenarios, sources used, gaps). Code
  validates it, renders the page, files the record.
- **The scene partner** (`practice-chat`, a warm session per scene): plays
  the other person. Every reply ends with a typed `NOTE {…}` line — which
  moves he just used, quoted — that code strips before the line is spoken.
- **The debrief** (same session, last turn): a typed `DEBRIEF {…}` line;
  code validates every move name against the page, writes the session line,
  files the record with undo.

**The vault is the truth.** One page per skill under `Wiki/Practice/`. His
to edit; Nova re-reads it before every scene. `server/data/practice.json`
holds only what is operational: scene transcripts with the hidden notes, and
the per-move tallies derived from the page's Sessions section.

**Honest degradation.** A move whose source is not in the vault says so on
the page (`Source: his words` or `Source: the book, unread by Nova`). The
Gaps section says what would make the feedback surer, and names the
book-file upload when the book is the gap. A debrief that names a move not
on the page is dropped by code and the drop is said.

**Explicit trigger for the web.** Prepare reads only the vault unless his
sentence says research ("research it", "look it up", "find sources"); then
the lane gets WebSearch/WebFetch and every web-sourced move carries its URL.
A scene never touches the web.

**Autonomy.** Prepare and the debrief file AUTO with a real undo — the same
decision the Leader's reflection made and for the same reason: an approval
he taps reflexively mid-conversation is friction, not consent. Reversible on
his word: switch the two records to `pending` and the approve path files
them.

## The page (contract — change every reader/writer or none)

`Wiki/Practice/<Title>.md`, parsed by `parsePracticePage`, written by
`formatPracticePage`; a parse → format round-trip of any page these produce
is byte-identical (pinned by test, and run once over his real page before
ship, per the vault writer rules).

```markdown
---
type: practice
status: active            # active | paused | landed
created: '2026-09-27'
updated: '2026-09-27'
sources:
  - '[[Disarming Disrespect The Silence-Repeat-Question Playbook (Jefferson Fisher)]]'
---
# Questions of intent

Answering a dig with a question that makes the other person own what they meant.

## Why
> "I really love the ideas in chapter 8 and I want to practise them."

## Moves
### Question of intent
Ask what they meant instead of reacting to how it sounded.
- **Line:** "Did you mean for that to sound rude?"
- **When:** a belittling or condescending remark, especially in text or email.
- **Tell:** they restate or soften it; the spotlight is on their intent, not your reaction.
- **Source:** [[Questions of Intent]]

## Scenarios
### The offhand dig in a team meeting
A colleague comments on your work in front of others.
- **Other person:** Mark, a peer who is stressed and a little competitive.
- **Pressure:** he doubles down once, then goes quiet if you hold.
- **Moves:** Question of intent · Silence first

## Gaps
- The book itself is unread by Nova — upload the EPUB in Library and the moves get grounded in the text.

## Sessions
- 2026-09-27 · The offhand dig in a team meeting · landed: Question of intent · missed: Silence first · work on: let the pause run to five seconds before you answer.
```

Rules: `**Line:**` is required for a move (a move he cannot say is not a
move); a scenario names ≥1 move that exists on the page; unknown names are
dropped with a note in the record. `updated` uses `localDateISO()` (AEST).

## The API

- `GET /api/practice` → `{ skills: [Skill], today: {slug, scenario} | null,
  preparing: [{id, text, status}] }` where `Skill = { slug, title, summary,
  status, why, sources, moves: [{name, summary, line, when, tell, source,
  tried, landed, lastAt}], scenarios: [{name, setting, other, pressure,
  moves}], gaps, sessions: [{at, scenario, landed, missed, work}],
  next: {scenario, moves, why} | null, lastRehearsedAt }`. `next` is the
  deterministic pick (below). Receipts only; no model call.
- `POST /api/practice/prepare` `{ text, research?, slug? }` → `{ record }`.
  Creates a `practice-skill` record in `classifying`, runs Prepare, then
  writes the page and files the record (`status: filed`, `undoData: {route:
  'practice-skill', relPath, hash, created}`); undo deletes a page that has
  not been edited since (hash), or restores the prior version when `slug`
  re-prepared an existing page. Errors land on the record as `error`.
- `POST /api/practice/rehearse` `{ slug, scenario?, sessionId?, text?, end? }`
  → `{ jobId, sessionId, scene }`. No `sessionId` = start: code picks the
  scene, builds the prompt, the partner's opening turn runs. With `text` =
  his turn. With `end: true` = the debrief turn. Client polls
  `GET /api/claude-code/:jobId`; result `{ text, sessionId, notes:
  {moves:[{name, hit, quote}], stage, sceneOver}, debrief?, record? }`.
- `POST /api/practice/skills/:slug/status` `{ status }` → the page's
  frontmatter, filed as `practice-status` with undo (prior value).
- Intent lane `practice` (`routes/intent.js`): a sentence naming an existing
  skill or move → `out.forward = { screen: 'practice', slug, question }`;
  otherwise `out.record = startPrepare(...)`, said in one line.

## The picker (pure, tested)

`nextScene(skill, now)`: the scenario whose moves have the lowest
landed/tried ratio (untried counts as 0), ties broken by least-recently
rehearsed, then page order. A skill with no scenario yet is not rehearsable
and says so. Practice, not exposure: only a debriefed scene counts as tried.

## What the model sees

Prepare: NOVA_LENS, ABOUT HAYDEN, the shelf ranked for his sentence (limit
8, with paths), the list of his existing practice pages (never duplicate a
skill — extend it), his sentence verbatim, the JSON contract, the honesty
clauses (a Line must be a sentence he could say; a Source must be a page it
Read, `his words`, or a URL it fetched; no invented quotes from the book).

The scene partner: NOVA_LENS, the skill page (moves and lines verbatim), the
chosen scene, HOW TO PLAY IT (one human turn, 1–3 sentences, in character,
never coach mid-scene, apply the pressure once and honestly, let a landed
move change your stance the way a real person's would; if he says "pause",
"time out" or "how am I doing", step out for ONE exchange then back in; end
the scene when it has naturally resolved or after ~8 exchanges), the NOTE
contract, and `SPOKEN_REGISTER` (he hears this). Turn 2+ carries a short
reminder, like the Leader's.

The debrief: the same session, one instruction: DEBRIEF JSON `{landed:
[{move, quote}], missed: [{move, instead, source}], best, work, next}` plus
3–5 spoken sentences; `instead` must be a Line from the page or a sentence
from a Source page it can name; `next` is a scenario name from the page or
empty.

## Verification

- Tests (`server/test/practice.test.js`, `practiceLane.test.js`): page
  round-trip identity; validation drops a move without a Line and refuses a
  dossier with zero moves; NOTE/DEBRIEF parse with the prose-fallback
  (`parseError`, like REFLECT); debrief filing then undo leaves the page
  byte-identical; picker prefers least-landed, ties by recency; intent:
  "I want to practise questions of intent" → practice, "band practice at 6"
  → not; the lane contract tests stay green (capabilities, intentRouter,
  chatLanes, modelPrefs, fleetContext).
- Live: Prepare on his real vault from his own sentence about Jefferson
  Fisher (the sources are there) — read the page it wrote; one short scene
  by curl and its debrief; undo the test session's record afterwards and
  say so. Client: both idioms, 375 and 1280, writes guarded.

## Not in this build (say so)

The scene partner in the Agent World (a tenth being needs his hue and
artefact call); the Wrap-the-day question "did you use it for real today?";
a scheduled top-up that re-prepares when new sources land; per-chapter
addressing of a book (the extractor joins chapters). Each is one rail away.
