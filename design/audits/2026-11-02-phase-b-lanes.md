# Phase B: the lanes that write prose from numbers code computed

2 November 2026. His instruction that day: "Nova should default for its local
brain for things that do not require Claude exactly." The plan
(design/LOCAL-NOVA-PLAN.md §4 Phase B) names ten lanes that still spawn the
Claude CLI directly instead of going through `textLane.js runTextLane`. Each
was read for what it sends, whether it reaches for tools, what code checks on
the way back and what it writes. Prompt sizes below were measured today on his
real data (a scratch copy of server/data, his vault read-only), characters and
a characters/4 token estimate.

## 1. The classification (written before any code changed)

(a) = pure text in, text or JSON out, code validates, no tool the answer
depends on, fits the local window: a `runTextLane` candidate.
(b) = needs tools or vault reads to answer, or is judgment the 27 Oct to 1 Nov
benches showed a 4B gets wrong: stays Claude.

| lane | what it sends today | tools | what code checks | writes | class |
|---|---|---|---|---|---|
| `health-insight` | ~23.9k chars (~6.0k tok): org block, the whole profile (8.2k), 7 days of health rows, sessions, nutrition, calendar, journal lines, its last insights | none (`boundaryArgs('')`) | JSON `{hasInsight, insight}` parsed | `data/health/insight.json` (Home's insight line) | **(a)**, compact variant |
| `session-debrief` | ~2.8–3.2k chars (~0.7–0.8k tok): the session's fact sheet from `coachCadence.debriefFacts` | none (Read/Grep/Glob denied) | nothing beyond non-empty | `data/debrief-memory.json`, Telegram | **(a)** |
| `briefing-plan` | ~0.9k chars: his topic and standing instruction | none | `normalizeAngles` (2–5 angles, each a real question) | the angles of a briefing record | **(a)** |
| `plan-today` | ~25.0k chars (~6.2k tok): lens, whole profile, shelf, standing, learning, today's picture, carry-overs, to-dos, goals, week changes, last review, yesterday's plan, stuck promises | Read/Grep/Glob allowed "for depth"; every fact the plan needs is already in the prompt | `salvageJson` + `composePlanText` (1–3 priorities) | an Inbox record, auto-filed to his journal on his board | **(a)**, compact variant; Claude keeps its Read tools on escalation |
| `daily-review` | ~31.0k chars (~7.7k tok): the plan's sections plus the weekly debrief (3.6k), fleet, library pick, shelf, money, bodyweight, food patterns, week ahead | Read/Grep/Glob allowed "for depth", as above | `composeReviewText` (a read or 1–3 adjustments) | an Inbox record, auto-filed to his journal | **(a)**, compact variant; Claude keeps its Read tools on escalation |
| `leader-daily` | ~21.8k chars (~5.4k tok) | Read/Grep/Glob, load-bearing | title + line non-empty; situation needs a question | `data/leader.json`, Home's Lead card, Telegram | **(b)**: a concept with no gist says "read the page at … for the substance" and the shelf points at Raw transcripts to read; the lead must attribute named sources and never invent one, and he has rejected gym-metaphor leadership advice twice (15 Sep, agent-relevance memory). Retrieval plus attribution is the 4B's weakest kind of task. |
| `weekly-debrief` | ~58.5k chars (~14.6k tok) | Read/Grep/Glob | `composeDebriefText` | an Inbox record; its CHANGES feed the daily lanes and Ask Nova | **(b)**: four times the local window's comfortable size, long synthesis (week held against plan, the body-fat band and weeks-to-target arithmetic, Protocols-page sources), and its changes steer every daily lane for a week. The 27 Oct Coach bench had the 4B confidently wrong on exactly this kind of coaching fact. |
| `librarian-ask` | ~50k chars (~12.5k tok): a 24k-char catalogue | Read/Grep/Glob over Wiki/ and Raw/, plus the consult loop | every cited path checked against the vault | nothing (answers another agent) | **(b)**: retrieval IS the job. A local version needs its own tool loop over the library (the local Ask loop's vault tools do not carry its citation contract); not a text lane. |
| `pulse` | ~0.7k chars | WebSearch + WebFetch | every item needs a real URL; URL memory decides "new" | `data/pulse.json` | **(b)**: the answer is whatever the web search finds. Keyless search from this Mac fails (1 Nov: every engine refuses headless Chrome), so there is no local path until a keyed search API exists. |
| `pattern-scout` | ~23.0k chars (~5.8k tok) | Read/Grep/Glob | `normalizeScoutProposals` (≤2, typed) | pending cards that become standing rules every agent obeys | **(b)**: he wired an Opus/Sonnet choice gate onto this lane himself (lib/modelChoice.js, "connecting what's spread across your vault"); counting a repeated act across 40 titles and his declines is the judgment, and a wrong proposal becomes a rule for every agent. The 4B invented actions on 1 Nov. |

So five lanes move: `health-insight`, `session-debrief`, `briefing-plan`,
`plan-today`, `daily-review`. Five stay on Claude for the reasons given.

## 2. How the five move (the contract)

- Each lane keeps its own prompt and its own parsing, and now calls
  `runTextLane(lane, prompt, { json, maxTokens, localPrompt, validate, claudeTools, cwd })`.
- **`localPrompt`**: the compact variant, used only when this Mac answers;
  Claude, as the escalation or when the lane is pinned to it, gets the full
  prompt it always had (the inbox sent its compact prompt to both; that was
  fine for a classifier, and wrong for the review, whose full context is the
  point of Claude answering it).
- **`validate`**: the lane's own check, run on the local answer BEFORE it is
  accepted. A local answer that does not parse, has the wrong shape, or says
  a number that is not in what it was shown is a failed local run (its ledger
  row says why) and the lane escalates to Claude on the spot. Never fiction:
  an answer code cannot check is not an answer.
- **The grounding check is code** (`textLane.js ungroundedNumbers`): every
  digit-string in the output must appear in the prompt. It cannot tell a right
  number from a wrong one that happens to be in the context; it catches every
  invented one.
- **`claudeTools` + `cwd`**: the review and the plan keep their Read/Grep/Glob
  on the vault when Claude answers, now through `boundaryArgs` (the hand-copied
  deny lists are gone from these two lanes).
- Every record says who wrote it: `laneVia(out)` is stamped on the Inbox record
  (review, plan), on the insight slot, on the remembered debrief, and on the
  briefing record as `anglesVia` (only the angles were written here; the report
  is still Claude's).

## 3. The bench

`server/scripts/benchTextLanes.mjs` puts each lane's REAL compose path through
the model on this Mac (`qwen3.5:4b`, Ollama, thinking off) with the inputs it
would use today: his last six logged sessions for the debrief, today's real
health, plan and review contexts (the plan at 07:00, 10:00 and 13:00, the
review at 08:00 and 20:00, the insight morning and evening), and his six real
research asks plus his 7 Sep briefing sentence for the angles. Claude is a
stub (nothing spent; 0 calls reached it, because every local answer passed
its lane's code check), server/data is a scratch copy, nothing is filed, and
the run ends by listing vault files modified while it ran (none, all three
runs). The computed sheet, every output printed beside Claude's most recent
output on the same lane, is `design/audits/2026-11-02-phase-b-bench.md`.

Three runs: round 1 (the first prompts), one tuning round (below), and the
final run whose sheet is committed. Grades are mine, from reading every
output against the prompt it was given. **sound** = right and useful;
**shallow** = right but thin; **wrong** = says something false about his data
or breaks one of his standing rules. Any wrong keeps the lane on Claude.

### The tuning round (after round 1)

Round 1 found faults code could prevent, so each lane got one round of tuning
before the verdict, all in the local variant only (Claude's prompts are
unchanged except where noted):

- health-insight: a code-computed TODAY block in the compact context (today's
  HRV, resting heart rate, sleep or "no sleep logged", steps, what he already
  trained, protein eaten so far) and a rule that an earlier row is a past day.
  Round 1 read yesterday's HRV 91.5 as today's (today: 75), said protein was
  "at zero" with 7 g logged, and told him to eat before the workout in the
  evening with Push already logged.
- daily-review, plan-today: the clock in the compact prompt ("It is 20:00
  now") and a rule that advice must still be doable. Round 1's 20:00 review
  said "Eat a named breakfast with 45g+ protein now."
- session-debrief: four rules in the strict variant (no high/low without a
  comparison, nothing about food/sleep/pain unless a fact names it,
  acknowledge PRs, volume up/down only as the facts say), and code now says
  the direction on the previous-session line for BOTH models ("so today's
  volume was lower"). Round 1 called a 910 kg session against 4,996 kg "a
  strong lift" and recommended skipping tomorrow's training on HRV 75.
- briefing-plan: the small model's variant drops the worked example. Round 1
  copied "the melanopsin pathway" into an angle about a push session's length.

## 4. Results and grades (final run; round 1 and 2 faults noted where they bear)

| lane | runs | answered here (passed code's check) | grounded | median s | median output tok | median prompt tok | grades |
|---|---|---|---|---|---|---|---|
| briefing-plan | 7 | 7 | 7 | 10.0 | 242 | 276 | 5 sound, 1 shallow, **1 wrong** |
| session-debrief | 6 | 6 | 6 | 3.3 | 34 | 1,221 | 0 sound, 2 shallow, **4 wrong** |
| health-insight | 2 | 2 | 2 | 20.4 | 49 | 5,400 | **2 wrong** |
| plan-today | 3 | 3 | 3 | 19.7 | 101 | 3,960 | 1 sound, **2 wrong** |
| daily-review | 2 | 2 | 2 | 26.1 | 70 | 3,996 | 2 shallow (but **wrong** in rounds 1 and 2 on the same inputs) |

What the table says first: **the code check passed every answer and the
grounding check found no invented number in any of them**, yet 9 of the 20
final answers are wrong (and the review was wrong on the same inputs in both
earlier rounds). The 4B's errors on these lanes are not invented numbers;
they are real numbers misread (a past day as today, a gap as a zero, a -2 %
as "low", a streak that is not a streak) and his rules ignored when stated
plainly. Code can catch the first kind. It cannot catch the second, so no
amount of validation makes these lanes safe to default here.

The wrong lines, quoted:

- **briefing-plan #6** (his discarded "Look deeper" ask about the 26 Oct Push
  session, a truncated machine-written string): "What was the specific
  duration of the long full session that began at 74 minutes into the Push
  protocol on 26 Oct?" The session ran 74 minutes; it did not begin at 74
  minutes. #1 is shallow: angle 4 pairs "a machine chest press" with "a flat
  plate-loaded press" where he asked flat plate-loaded against incline machine
  (angle 5 recovers it). The other five are sound and close to what Claude
  would write.
- **session-debrief** (the fact sheets carry HRV 75 with no baseline and never
  mention food): #1 Push "HRV is lower than usual. Did you eat enough protein
  today?"; #2 Pull makeup "Volume went up today" (that sheet has no previous
  session to compare); #3 Arms "Your HRV is down compared to last week. Did
  you eat enough before this session?"; #4 Upper "Your HRV is lower than usual
  today. Did you eat enough protein before this session?" #5 and #6 are
  shallow ("I need to know if you felt any grinding or pain"; "Did you eat
  enough protein before this workout?" with the 5 PRs unmentioned). The four
  strict rules were in the prompt and were ignored. Note: the bench rebuilt
  each sheet today, so every sheet carries today's HRV (75); in production the
  sheet is built on the day.
- **health-insight** morning: "You missed the floor on five days in a row."
  (the rows: met 27 Oct, short 28–29, met 30 Oct, short 31 Oct–2 Nov).
  Evening: "Your HRV is 75 ms and you slept no hours last night." (the TODAY
  block says "no sleep logged for last night": a gap read as a zero, the exact
  thing the prompt forbids).
- **plan-today** 10:00 and 13:00: "Start the Huberman podcast to research
  sleep optimization. — You have open loops on this video that need analysis
  today." The context lists it under TO-DOS OPEN 14+ DAYS with his rule "a
  two-minute first step or nothing", and the prompt says to follow those notes
  exactly. 13:00 also: "Eat a named breakfast with 45 g+ protein now." The
  07:00 plan (the one that would actually run) is sound: weigh in (last
  weigh-in 26 Oct), a 45 g breakfast (162 g short), "Start the Huberman
  podcast for one minute".
- **daily-review**: final 08:00 shallow ("Your HRV is down while you have open
  research tasks that may drain energy" is an invented link, hedged); final
  20:00 shallow (one adjustment, the carried EZ-Bar Reverse Curl from
  yesterday's review never mentioned). Round 2, same input at 08:00: "Today
  HRV is low" where the picture said "HRV 75 ms (-2% vs 7-day avg)". Round 1
  at 20:00: "Eat a named breakfast with 45g+ protein now."

Speed, for the record: the debrief answers in ~3 s and the angles in ~10 s;
the three long-context lanes take 20–26 s on this M1 Pro (a ~4k-token compact
prompt read, then ~70–110 tokens written). Claude is faster on those: the
ledger (server/data/model-spend.json, the rows it holds) has the review at a
6.1 s median over 12 runs, the plan 4.9 s over 12, the insight 3.5 s over 23,
the debrief 3.4 s over 7, and the four together at $5.46 across those rows.
These lanes run in the background, so 20 s would not have been the problem;
the misreads are.

The 9B was not benched: memory free fell from 54 % to 28 % during the session
(another session's work), under the ~7.7 GB the 9B needs. The wrong answers
above are the kind a bigger model is likeliest to fix (misreads, ignored
rules), so the 9B bench is the next measurement worth making on a quiet Mac.

## 5. What went where

**No lane went local-first.** All five are `local: true, localFirst: false,
standIn: false` (the Coach's 27 Oct pattern): Claude writes them by default,
exactly as before, and this Mac writes them only when he picks "This Mac" for
that lane on the board. `standIn: false` matters here: a stand-in when Claude
is at its limit would put these misreads on surfaces that do not show who
wrote them (the debrief arrives on Telegram as "Coach — …", the insight is a
bare line on Home, an auto-filed review lands in his journal). `runTextLane`
now obeys that mark; before 2 Nov it was only read by the board's list.

What did change for him even with the defaults on Claude:

- the five lanes are runnable here, with the lane's own check and code's
  grounding check on every local answer, and escalation to Claude on the same
  call when either fails;
- the review and the plan keep their vault reads on Claude through
  `boundaryArgs` (the hand-copied deny lists are gone), and no longer persist
  a CLI session per run (`--no-session-persistence`, as every text lane);
- every one of their records says who wrote it (`laneVia`): the review and
  plan Inbox records, the insight slot (`via`), the remembered debrief
  (`via`), the briefing record (`anglesVia`);
- the debrief's fact sheet now says whether today's volume was higher or
  lower than last time (code's arithmetic, for Claude too).

Re-bench before any lane moves: `node server/scripts/benchTextLanes.mjs`
(add `--model qwen3.5:9b` on a quiet Mac).

## The 9B, benched 2 Nov 23:30 (the Mac finally quiet: 72 % free)

Same inputs, `qwen3.5:9b` (sheets: `2026-11-02-phase-b-bench-9b.md`,
`2026-11-02-local-coach-bench-9b.md`). Read by a person against the inputs:

- **session-debrief (6):** short and mostly sound ("volume dropped compared
  to last week", the adductor pad note carried); thinner than Claude's, no
  invented numbers. Grade: shallow, none wrong.
- **briefing-plan (7):** six sound; #6 turned "74 minutes" into "74 meters"
  three times. Grade: one wrong, the same input the 4B got wrong.
- **health-insight (2):** "178 g of protein against the 167 g floor, so eat
  45 g+ now to close the gap": the floor was met; the reasoning inverted.
  Grade: wrong.
- **plan-today (3):** the stale to-do now gets a two-minute first step (the
  4B's fault fixed); "109 g consumed" at 07:00 is read from the day's log;
  shallow but no rule broken. Grade: shallow.
- **daily-review (2):** 20:00: "eat a named dinner with 45 g+ protein now to
  balance today's high calories and hit the daily floor" with protein 178 g
  over a 167 g floor. Grade: wrong.
- **Coach (5 local of 17):** #13 answered "you are hitting your targets"
  without a lookup and told him to check a tool; #7 gave generic 30–40 g
  numbers not in his data. 17–22 s a turn. Grade: not better than the 4B
  behind the rules.
- **Speed:** debrief 4–6 s, briefing 10–18 s, insight 30–38 s, plan and
  review 30–39 s a run (prompts of 4–5.6k tokens).

**Verdict:** the 9B reads numbers better than the 4B on three lanes and
still inverts a comparison on two (the floor "gap", minutes as metres).
No lane's default moves. If he picks the 9B on the board, session-debrief,
plan-today and briefing angles are acceptable on this Mac; health-insight
and daily-review are not. Nothing can pin a model per lane today; that is
the next lever if he wants these on the Mac.
