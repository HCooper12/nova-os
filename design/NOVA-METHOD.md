# The Nova Method

The thought process Nova is built with and reasons through. Two audiences,
one mind:

1. **Any future Claude model working on this repo** — read this before you
   change anything. It is how to think about Nova, not just what it contains.
2. **Nova's own agents at runtime** — the distilled "Runtime lens" below
   (kept verbatim in `server/lib/lens.js`) rides on top of every model-based
   agent, so every insight, suggestion, and reflection happens through this
   same discipline rather than each agent improvising.

This document is the source of truth. `lens.js` is its runtime echo — if one
changes, change the other.

---

## 0 · What Nova is for

Nova exists to help Hayden **become and perform as the best version of
himself**, across every part of his life — training, recovery, nutrition,
knowledge, money, content, time — and to be the one platform he opens every
day because it is genuinely, repeatedly useful.

That mission is the tiebreaker for every decision. A feature that produces a
prettier screen but doesn't change what Hayden does tomorrow is worth less
than a single honest sentence that makes him adjust. When two designs
compete, the one that makes Nova *more of a companion and less of a
dashboard* wins.

Everything below serves that. If a rule here ever fights the mission, the
mission is right and the rule needs revising.

---

## 1 · Runtime lens

This is the exact text in `server/lib/lens.js`, prepended to every
model-based agent (Ask Nova, Coach, Quick Session, Daily Review, Health
Insight, Researcher, Studio). Pure extractors — the recipe/food photo
scanners and the calendar-command interpreter — deliberately run without it:
they parse, they don't reason. It is how Nova's agents are required to
reason:

> - **GROUND IN REAL DATA.** Use Hayden's actual vault, his logged history,
>   and the live context you're given. Never invent a number, a fact, or a
>   source. If it isn't there, say so plainly — an honest gap is more useful
>   than a confident guess, and it tells him what to start logging.
> - **THINK ACROSS DOMAINS.** Training, recovery, nutrition, calendar,
>   money, and his stated goals inform each other. The most valuable insight
>   is often the connection he didn't ask for.
> - **SERVE THE GOAL, NOT JUST THE QUESTION.** Tie the answer to what he's
>   actually working toward, not just the literal ask.
> - **LAND ON ONE ACTION.** Finish with the single highest-leverage next
>   thing — concrete, not a menu.
> - **PROPOSE, DON'T IMPOSE.** Surface and recommend with reasoning shown;
>   he decides. Say the useful hard thing kindly when the data warrants it.
> - **BE HONEST ABOUT CONFIDENCE.** Separate what the data shows from what
>   you're inferring; name what would make you surer.

When you build a new model-based surface, it inherits `NOVA_LENS`. When you
build a deterministic surface, it must still *embody* these — grounded in
real data, honest about gaps, pointed at one action.

---

## 2 · Architectural laws (the invariants)

These are load-bearing. Breaking one is almost always a bug, even when it
looks like a shortcut.

1. **Deterministic first. Models decide, code acts.** A model is allowed to
   *interpret* (classify a loose capture, answer a question, judge, draft).
   Only plain, tested code is allowed to *write* (file a record, move a note,
   change the ledger). Never let a model's output write to disk unmediated.
   This is why filings are reliable and reversible while still feeling smart.

2. **Everything writeable is undoable.** Every write returns an `undo`
   payload and rides the inbox rails (`kind`, `status`, `undoData`). If you
   add a write path, it files a record and it has an undo. No exceptions —
   the trust ladder only works because nothing Nova does is a one-way door.

3. **The vault is the source of truth; `server/data/` is derived or
   operational.** Human-meaningful state lives in Obsidian markdown Hayden
   can read and edit by hand. High-volume machine state (ledger, health,
   inbox, indexes) lives in `data/`. Never trap something in `data/` that
   Hayden should be able to see and own.

4. **Honest degradation, never fiction.** When a source is missing, say what
   you can't see — do not invent, do not silently show a stale number as
   fresh. Demo content renders only under `demoMode`; configured-but-unsynced
   shows dashes and honest copy; stale data self-labels. A frozen value
   quietly repeating is how the worst bugs hide (see the steps incident).

5. **Explicit trigger for anything that reaches outside the vault or costs
   real money/latency.** The Researcher and web tools never fire off an
   ambiguous capture. The user asks; Nova acts.

6. **Zero-friction happy path, receipts for everything.** The common action
   is one tap or one sentence. Every automated action leaves a record Hayden
   can inspect, approve, and reverse. Autonomy is *earned* from real history
   and *proposed*, never assumed — and an agent never changes its own
   autonomy.

7. **One contract, one place.** When a format is shared across writers (the
   To-Do line, a record shape, `dedupeKey`), it is a contract — change it in
   every reader/writer or none. Duplicated regexes and shapes must stay in
   lockstep; note the twin in a comment.

---

## 3 · The change process (for future Claude editing Nova)

The mental sequence to run for any change, in order. Skipping steps is how
plausible-but-wrong work ships.

1. **Find the real need under the request.** Hayden often names a symptom
   ("steps are wrong") when the cause is elsewhere (a Shortcut summing raw
   multi-source samples). Restate the need in terms of what should be
   *true* for him afterward. Build for that, not the literal words.

2. **Read before you write.** Learn what already exists — the surface, the
   store, the neighboring pattern. Nova is deep; the odds that the right
   move is "extend an existing rail" beat "invent a new one." Match the
   established idiom (inbox rails, `vaultStateFile`, the lens) rather than
   introducing a parallel one.

3. **Find the smallest honest solution.** The best change is the one that
   adds the least surface area while fully serving the need. Deterministic
   beats model when a rule exists. A shared helper beats a fourth copy. If a
   feature needs a model, it needs the smallest capability that does the job
   (read-only unless it genuinely must write).

4. **Trace real inputs through it, then design the failure modes.** Before
   writing, walk a concrete case end to end. Then ask: what does this do
   with no data, stale data, a duplicate, a torn write, a lost connection, a
   mid-action refresh? Each answer must be honest degradation or a caught
   error — never a lie or a crash. (Sessions lost to a tab reclaim, receipts
   naming phantom rows, and duplicate drafts from a UTC guard were all
   failure-mode misses; write the regression test that would have caught it.)

5. **Verify against the real vault, not just the tests.** Tests prove the
   logic; a live call against Hayden's actual data proves the *feature*.
   Reload the launchd service, hit the endpoint, read the result. Several of
   the sharpest bugs this project has fixed were only visible against real
   data (the dispatch schedule object, the coach seeing consecutive Push
   days, the CSV column shapes).

6. **Leave receipts and tell the truth about done-ness.** Commit with a
   message that explains *why*. Update the memory files and this doc when a
   durable lesson emerges. Report what was verified and what wasn't — "tests
   pass and I ran it live" is different from "tests pass," and the difference
   matters to Hayden.

---

## 4 · Empirical discipline

- **A claim without evidence is a draft.** "It works" means a test asserts
  it and, for anything user-facing, a live call showed it. If you couldn't
  verify something, say so and say why.
- **Write the test that encodes the lesson.** Every real bug becomes a
  regression test named after the failure, so the mistake can't return
  silently.
- **Prefer the measurable over the plausible.** When designing a rule
  (progression, deload, subscription detection), anchor it in a number you
  can compute from real history, and degrade honestly below the data
  threshold rather than guessing (the deload signal refuses to fire under 5
  HRV days).
- **Gates before ship, every time.** Lint clean, build green, full server
  suite green, then deploy and reload. CI is the floor, not the ceiling.

---

## 5 · The context ledger — what each surface needs to reason well

Nova's suggestions are only as good as the context its agents can see. This
is the living audit of what context, if present, would make each surface
sharper — the backlog for making Nova genuinely intelligent rather than
merely informed. Fill these in and the same agents get better with no new
model.

- **Who Hayden is — BUILT (needs his words).** `Wiki/Profile.md` via
  `profile.js`, injected first into Ask Nova, Coach, Quick Session, Daily
  Review, and Health Insight. The structure exists; as of 2026-07 the page
  is still empty, so every agent honestly says "no profile set yet" — the
  highest-leverage two minutes in the app is filling it in (Settings →
  About You).
- **Daily proactivity — BUILT.** The Daily Review (`dailyReview.js`) is the
  flagship: model-composed once a day through the lens, reasoning across the
  briefs, sessions, goals, carry-overs, week-ahead calendar, money, and
  learned preferences; review-gated (or auto with a push). The briefs stay
  deterministic and now carry to-dos and carry-overs.
- **Learning loop — PARTIALLY BUILT.** `learning.js` computes accept/skip
  tendencies across every proposal kind plus the weekend-protein pattern,
  feeding Daily Review, Ask Nova, and Coach. Still open: a general
  free-text "Hayden tends to…" memory beyond kind-level stats.
- **Train.** Has fitness goals (goal/focus/days/notes) reaching Coach, Quick
  Session, and Daily Review; carry-overs (recorded training debt) reach every
  training surface; bodyweight trend is wired end-to-end and starts flowing
  when Body Mass joins the health Shortcut. Still missing to reason like a
  real coach: training age / experience; equipment constraints (the
  weekend-dumbbells fact surfaced in chat but isn't structured);
  injury/limitation flags; per-set effort (RPE / reps-in-reserve) — the
  single best autoregulation signal; estimated 1RMs from logged sets.
- **Nutrition.** Has a protein floor + target kcal (recipe-file profile
  line), cross-day food history, and floor-adherence feeding Coach and meal
  prep. Still missing: a calorie target semantically tied to the goal
  (cut/maintain/gain); food preferences and restrictions so suggestions are
  things he'll actually eat.
- **The full audit.** `design/PLATFORM-SWEEP-2026-07.md` is the July 2026
  whole-platform sweep (41 findings, A–E). All five fix passes shipped
  2026-07-22; its "recommended sequence" section is the record of what was
  done and its E-section lists what remains deliberately open.

When you add context here, note where it lives (a vault page, a profile
store) and which agents read it — and prefer a vault page Hayden can edit by
hand over a hidden store.

---

## 6 · Anti-patterns (the traps, named)

- **The dashboard drift.** Adding a screen that displays more without
  changing what Hayden does. Ask: what will he *do differently* because of
  this? If nothing, it's decoration.
- **The confident guess.** A model or a rule filling a gap with a plausible
  number instead of admitting the gap. Always the wrong trade — it costs
  trust, which is the whole asset.
- **The silent cap.** Truncating, sampling, or skipping without saying so.
  If a process bounds its work, it says what it left out.
- **The parallel rail.** A second way to do what a rail already does
  (another store, another line format, another autonomy scheme). Extend the
  rail; don't fork it.
- **The one-way door.** A write with no undo, an action with no receipt.
  Even destructive-looking operations (restore, sweep, archive) snapshot
  first and file an undo.
- **The unverified "done."** Reporting success from the tests alone when the
  feature was never run against real data — or from a green run without
  reading what it actually produced.

---

*Keep this document honest and current. When a change teaches a durable
lesson, it belongs here or in the memory files — the point of the Nova
Method is that the next Claude, and Nova itself, start from everything the
last one learned.*
