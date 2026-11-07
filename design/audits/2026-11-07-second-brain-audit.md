# Second brain audit, 7 Nov 2026

Read-only. Nothing was edited, posted or started. Brief: design/SECOND-BRAIN-FLAG.md. Every number below names its source, its date range and its sample. Where a number cannot be had, the line says "cannot be measured" and why.

## Evidence base and its limits (read this first)

| Source | Covers | Size | Limit |
|---|---|---|---|
| Claude CLI transcripts for the vault working directory, `~/.claude/projects/-Users-...-Hayden-s-Vault/*.jsonl` | 8 Oct to 6 Nov 2026 (one Coach session from 28 Jul) | 564 sessions, 292 Read calls, 220 Grep, 47 Glob | Only lanes that run through the Claude CLI. The local Ask Nova model (Qwen on this Mac) leaves no record of its lookups. The CLI prunes old sessions, so there is no 90 day view. |
| `server/data/conversation/2026-09..11.jsonl` | 21 Sep to 6 Nov | 1,224 lines: 149 his, 1,063 Nova, 12 system | Every line is `via: voice`, `device: iPhone`. There is no typed/spoken flag. |
| `server/data/inbox.json` plus `inbox 3.json` (de-duplicated) | 4 Oct to 6 Nov | 838 records, 796 from 8 Oct | Older history was rotated out. The 8 Aug figures in nova-produce-vs-keep cannot be re-run. |
| `server/data/model-spend.json` | 21 Oct to 6 Nov (17 days) | 602 runs, $182.14 | Short window, per-lane ring buffer. |
| Vault `Wiki/` (the 791 pages, backups folders skipped) | Frontmatter `created:` 753 of 778 pages have it | 1,000 .md files in the whole vault | Title matching (below) misses paraphrase, so "used" numbers are floors. |

Method for "used": a page counts as used if its exact title appears in (a) a Nova reply in the conversation record, (b) the reply text of an Ask Nova, Coach, Leader, Daily Review, Plan Today or greeting session, (c) a daily review / plan / dispatch / coach Inbox payload, or (d) a Read tool call by Ask Nova, Coach or Leader. "Offered only" means the title appeared in a prompt but never in a reply or read. Watcher sessions are excluded because they read the vault to file new pages, which is intake, not use.

---

## Q1. What reaches an answer

Short answer: a fixed bundle, plus whatever the model chooses to Read or Grep. There is real retrieval code (lexical plus a 974 page embedding index), but no agent's answer path uses it for question-matched pages except the Coach's shelf line.

### Per agent

| Agent | Always in | By search | Size (first user message, measured) | File:line |
|---|---|---|---|---|
| Ask Nova (Claude) | Profile, where he stands, protocols (1,800 char budget), preferences, standing rules, skills, **shelf = newest 5 sources, not ranked by the question**, documents, today, brief, open loops, fleet, ledger, inbox digest, plans, roster, reminders, debrief, daily review, money, stash, Leader idea, Coach and Leader chats, last 7 days of conversation (7,000 chars) | None. Read/Grep/Glob exist but the prompt says "BE FAST ... don't search reflexively" | median 67,699 chars (min 49,873, max 102,313), 18 sessions | `server/lib/askContext.js:209-302` (shelf at 220), `server/lib/claudeCode.js:608` |
| Ask Nova (local, Qwen 4B) | Same bundle, capped by a prompt budget | `vault_search`, `vault_read`, `vault_list`, at most 4 lookups a turn, string match over .md, 6,000 file walk cap | not recorded | `server/lib/localAsk.js:41,51,78-79,127` |
| Coach | Profile, goals, program, carry-overs, sessions, recovery, injuries, block, Coaching Principles and What Works For Hayden (2,600 chars each), **shelf ranked by the question** (5) | Read/Grep/Glob | median 79,294 chars (3,015 to 174,540), 70 sessions | `server/routes/workouts.js:646-695`, `server/lib/coachTurn.js:443`, `server/lib/coachKnowledge.js:20` |
| Daily Review | Profile, preferences, standing, today, sessions, progressions, deload, todos, debrief, fleet, goals, carry-overs, weight, food patterns, calendar, **shelf 4 sources ranked by a fixed topic string** ("training recovery protein sleep nutrition leadership"), library lines with 4 concept names each, money | None used. 0 Read or Grep in 63 sessions | median 18,781 chars (13,443 to 31,581) | `server/lib/dailyReview.js:119-256` (shelf at 224) |
| Plan Today | Aims, profile, shelf 3 (fixed topics), standing, preferences, brief, carry-overs, todos, goals, week changes, last review, yesterday's plan, stuck | None used. 0 Read or Grep in 12 sessions | median 11,296 chars (all 12 within 11,047 to 11,360) | `server/lib/planToday.js:100-170` |
| Studio | Taste, org context, profile, playbooks; the idea page (4,000 chars) | Told to "search by the idea's key terms" in the vault with CLI tools | not measurable (no Studio session or spend lane exists in the window) | `server/lib/studio.js:70,98-115` |
| Researcher | Question, profile, caller context | Tools `WebSearch WebFetch Read` with the vault as working directory | 57 sessions identified earlier by first-line heuristic, 0 vault Reads | `server/lib/researcher.js:178,193,297` |

Other things to know:

- Concepts, Entities, Topics, Health, Inbox, Journal and Library pages are never in any fixed bundle. Only Sources reach prompts (via the shelf), and Concepts ride along as a "concepts:" tail on a source line (`server/lib/sourceShelf.js:62-67`). Everything else needs the model to decide to Read it.
- The embedding index (`server/data/recall-vectors.json`, 19 MB, 974 pages, nomic-embed-text) is called by `searchVault` (`server/lib/recall.js:103`). Its callers are the palette (`server/routes/notes.js:84`), `sourceShelf.js:91` (ranking sources only), `commitments.js` and `visualResolve.js`. Neither Ask Nova path calls it.
- Two instructions in the Ask Nova prompt pull in opposite directions: the shelf footer says "Read the full page ... you have Read and Grep" (`sourceShelf.js:103-105`) and `claudeCode.js:608` says do not search reflexively.
- Playbooks (built 7 Nov): `server/data/playbooks/applied.jsonl` does not exist yet. Cannot be measured.

### Is any record kept of which pages were read in a turn?

- Nova's own records: no. `server/data/jobs/receipts.jsonl` (190 lines) holds lane, model, ms, consults, cost, no page list. The conversation record holds no lookups. The local lane builds a `lookups` list in memory (`localAsk.js:811`) and does not persist it.
- The Claude CLI's own transcripts do, and they are the only record. From them (8 Oct to 6 Nov):

| Lane (identified by first-message text) | Sessions | With any Read/Grep/Glob | Reads | Greps | Wiki or Raw pages read |
|---|---|---|---|---|---|
| Ask Nova | 18 | 5 | 18 | 19 | 18 |
| Coach | 70 | 27 | 57 | 76 | 50 |
| Leader | 62 | 9 | 15 | 5 | 5 |
| Daily Review | 63 | 0 | 0 | 0 | 0 |
| Plan Today | 12 | 0 | 0 | 0 | 0 |
| greeting | 187 | 0 | 0 | 0 | 0 |
| Watcher (intake, excluded from "use") | 69 | 67 | 198 | 119 | 78 |

Reads per page, all lanes: 228 distinct paths over 292 Reads. The most-read page is `Wiki/Health/Workout Routines.md` (16 reads: Ask Nova 4, Coach 7, Watcher 4). Then `Concepts/Lats vs Upper Back in Pulling` (5), two Inbox research pages (4 each), `Health/Exercise Library` (4). Median page was read once. By folder (all lanes): Health 40 reads over 21 pages, Concepts 43 over 33, Sources 21 over 14, Inbox 16 over 9, Topics 6 over 3, Entities 3, Library 2, Journal 1.

---

## Q2. Dead knowledge

### Counts, age and links (vault scan, 7 Nov, links resolved by title or path, excluding self links)

| Folder | Pages | Created (month: count) | Avg inbound links | No inbound link at all |
|---|---|---|---|---|
| Concepts | 289 | Jul 32, Aug 91, Sep 78, Oct 76, Nov 7 (keeps arriving at about 76 to 91 a month) | 14.0 | 0 |
| Sources | 111 | Jul 2, Aug 8, Sep 36, Oct 59, Nov 4 | 12.6 | 0 |
| Entities | 96 | Jul 2, Aug 9, Sep 33, Oct 46, Nov 6 | 11.4 | 0 |
| Health | 106 | no date on 18 | 0.9 | 91 (86 are daily workout log pages, expected) |
| Journal | 79 | Jul 2, Aug 9, Sep 30, Oct 31, Nov 7 | 2.2 | 9 (62 if links from index/log are not counted) |
| Inbox | 68 | Sep 36, Oct 21, Nov 7 | 3.5 | 3 |
| Topics | 17 | Jul 2, Aug 7, Oct 7 | 33.6 | 0 |
| Plans | 10 | Aug 2, Sep 4, Oct 3, Nov 1 | 0.1 | 9 |
| Library | 8 | | 2.9 | 4 |
| Studio | 3 | Jul 2, Sep 1 | 1.0 | 2 |
| Practice | 1 | Sep 1 | 1.0 | 0 |

Link finding: the graph is dense and healthy for Concepts, Sources, Entities and Topics. Orphan count is 0 there. The link structure is not the problem. Note `Wiki/index.md` is 127,103 chars and `Wiki/log.md` is 345,435 chars, and neither is in any agent's bundle. Two Inbox pairs are duplicates seven seconds apart (`Barbell Bench vs Machine Chest Press for Chest Growth` and the same title with ` 2334`); 16 of the 68 Inbox pages are `Report ...` or `Coach review ...` agent artefacts.

### Demonstrable use (title match; floors; 8 Oct to 6 Nov plus conversation record from 21 Sep)

| Folder | Pages | Named in a reply to him | Read by Ask Nova, Coach or Leader (not named) | Offered in a prompt only | Never in a prompt, read or reply |
|---|---|---|---|---|---|
| Concepts | 289 | 34 (12%) | 2 | 124 | **129 (45%)** |
| Sources | 111 | 29 | 2 | 56 | 24 |
| Entities | 96 | 22 | 0 | 18 | 56 |
| Topics | 17 | 2 | 1 | 0 | 14 |
| Health | 106 | 14 | 10 | 2 | 80 |
| Inbox | 68 | 21 | 2 | 8 | 37 |
| Journal | 79 | 32 | 2 | 33 | 12 |
| Plans | 10 | 0 | 0 | 2 | 8 |
| Studio | 3 | 0 | 0 | 0 | 3 |

- Who names Concepts: of the 34 named in replies, the Leader accounts for 27. Daily Review sees 108 distinct Concept titles in its prompts across 63 sessions and names 1 in its output. Ask Nova sees 65 in its prompts and names 0 across 18 CLI sessions. In the conversation record, 1,063 Nova lines contain exactly 2 Concept names (Ben Franklin Effect, Wise Feedback) and 6 Source titles (four of them are Watcher "already on file" replies).
- Concepts no agent touched: 129. Created Aug 53, Jul 21, Sep 22, Oct 27, Nov 6. They are not poorly linked: average inbound links 11.0 versus 17.6 for the used ones. The full list is in the appendix.
- Caution: title matching misses paraphrase, so these are floors on use and ceilings on dead.

---

## Q3. The ask-it-yourself test (read only, 8 Oct to 6 Nov, his lines in the conversation record)

His lines in the window: 142, on 18 distinct days, all from the iPhone. Of those, 20 are pasted video links, about 20 are the 25 Oct profile interview answers, and the rest are training and program instructions. Questions the vault could actually have answered number 14; the record does not hold 25. I read each reply against the vault.

| # | Date (UTC) | His question (short) | Page that held the answer | Verdict |
|---|---|---|---|---|
| 1 | 10 Oct | "body feels stiff, hamstrings ... increase my flexibility, how in my regime" | `Wiki/Topics/Exercise Protocols (Huberman)` (created 6 Oct) has "Exercise Protocol 4: brief mobility and flexibility, 2 to 4 times a week" | **Miss.** Reply said the routines page had no mobility work and called the stretching advice "general training evidence, not your vault". He had to name Protocol 4 himself 16 days later (26 Oct). |
| 2 | 10 Oct | "Where's the mobility program?" | none existed | Hit (honest answer: it does not exist) |
| 3 | 14 Oct | hip/lower back sore before leg day | `Health/Injury Log`, HRV in the live block | Hit |
| 4 | 14 Oct | "what should I change today" (Coach) | Injury Log, 7 Oct Leg Day log | Hit |
| 5 | 15 Oct | "How many sets do Huberman and other experts say per week?" | Exercise Protocols (Huberman), Coaching Principles, Pelland analysis cited as "your vault cites" | Hit (cited his saved book and vault research) |
| 6 | 15 Oct | "Am I still under goal for certain muscles?" | Coach set model | Hit |
| 7 | 15 Oct | reduce to 4 main days | Coach program data | Hit |
| 8 | 17 Oct | "2 sets to failure rather than 3 ... what does the research say?" | `Inbox/Sets Per Exercise vs Weekly Sets Per Muscle as the Dose Unit`, `RPE 7-8 vs Training to Failure`, the Huberman page | Hit (named the Huberman book and the weekly sets rule) |
| 9 | 26 Oct | "refer to the Huberman protocols book ... exercise protocol four" | Exercise Protocols (Huberman) | Hit |
| 10 | 29 Oct | "best version of chest press, barbell bench or machine?" | `Sources/We Ranked the BEST Exercises ... (Janicki x Tennyson)` (chest: seated chest press, mid/decline machine press), `Topics/Physique Aesthetics & Hypertrophy Training` | **Miss.** Local model: "Your vault does not contain data comparing ...". The dedicated brief page did not exist yet (created 29 Oct 13:10 local, after the question), but two pages that speak to it did. Since 29 Oct `askRoute.js` `gaveUp` sends this phrasing to Claude. |
| 11 | 29 Oct | "you should be conducting the research, asking Coach, checking any research" | same | **Miss.** "I cannot find the COACH card or any research ..." |
| 12 | 30 Oct | "should I switch the side delt raise ... what does the research say" | Researcher brief, Coach data, Janicki ranking | Unclear. Good answer, but the Librarian's two note paths were reported "could not find those note paths in your vault". |
| 13 | 30 Oct | "Show me it first" (the READY card) | an Inbox record, not a vault page | Unclear. Local lookup returned three Raw transcripts matching "READY". |
| 14 | 1 Nov | "does the half credit include accessory work ..." | muscle credit model (`Wiki/Health/Exercise Library`) | Hit |

Count: **9 hits (rows 2 to 9 and 14), 3 misses (rows 1, 10, 11), 2 unclear (rows 12, 13)**, 14 questions. I did not reach 25 because the record does not hold 25 vault-answerable questions in 30 days.

A different miss, and the loudest thing in the record: **he closed the shoulder concern three times and the record still says it is open.** 15 Oct 21:07 ("My shoulder pain is okay at the moment, so ignore this"), 30 Oct 22:38 ("close that concern"), 1 Nov 00:25 ("we are going to ignore the shoulder injury point"). The Coach asked "have you seen the physio?" again on 15 Oct and 30 Oct. `Wiki/Health/Injury Log.md` was last updated 15 Oct and still lists a moderate shoulder entry "Lateral raises paused pending a physio assessment". `Wiki/Profile.md` (updated 2 Nov) says "No injuries or limitations at the moment". `Wiki/Library/Standing Instructions.md` has no mention of the shoulder. Two pages the Coach reads disagree and neither reflects what he said.

---

## Q4. What he engages with

### Daily, weekly, never (30 and 90 day windows where the data exists)

| Surface | Evidence | Last 30 days | Last 90 days | Band |
|---|---|---|---|---|
| Food log | `server/data/food-log/*.json` | entries on 31 of 31 days, 265 entries | 89 of 90 days, 627 entries | Daily |
| Health data (Shortcut/HealthKit) | `server/data/health/*.json` | 31 day files | 89 | Daily (automatic) |
| Workout logging | `Wiki/Health/Workouts/` filenames | 20 sessions | 68 sessions | About 4 to 5 a week |
| Talking to Nova | conversation record, 8 Oct to 6 Nov | 142 lines on 18 of 30 days (peaks: week 44 had 60) | 149 lines on 21 days since 9 Aug | Several days a week, in bursts of program planning |
| Inbox decisions | inbox.json + inbox 3.json, 8 Oct to 6 Nov | see below | not available | Weekly bursts |
| Repertoire (one technique a day) | `server/data/repertoire.json` | 24 techniques, 54 days surfaced since 15 Sep, **0 tried, 3 skipped, 0 landed, 0 missed** | same | Surfaced daily, practised never |
| Practice (rehearsal room) | `server/data/practice.json` | 0 | 1 scene ever, 26 Sep, 5 turns | Never since 26 Sep |
| Concept recall cards (Daily Review recall) | `server/data/concept-review.json`; Inbox `concept-recall` | 1 record | 1 card on file, step 1, due 18 Oct | Effectively never |
| Journal | `Wiki/Journal/*.md`, 393 entries over 79 days; `notion-journal.json` has `entries: {}` | 0 entries by him: every heading is one of 13 agent or system titles (Plan today 71, Morning dispatch 70, Daily review reflection 70, Evening debrief 69, Session receipt 63 ...) | | Agents write it; no entry of his own is findable in the vault |
| Studio | `Wiki/Studio` (3 pages: Jul 2, Sep 1), no `studio` spend lane | 0 | 0 | Never |
| Profile interview (About you) | `server/data/profile-interview.json` | 17 questions asked on 25 Oct in 24 minutes; none since; thread "fuel-typical" open for 13 days | | One burst |
| Daily Review, Dispatch, Plan Today | Inbox auto records | 21, 44, 21 records auto-delivered, **`seenAt` set on 0 of 184 auto-delivered records** | | Cannot be measured (see below) |

### Inbox outcomes, 8 Oct to 6 Nov (796 records)

- Records with a `kind` (agent products): **427**. Auto-delivered 184 (43%), approved by him 140 (33%), discarded 63 (15%), error 22, pending 9, withdrawn 5, undone 2, failed 2. Of 203 that needed a hand decision, 140 (69%) were approved.
- Records with no `kind` (voice confirmations and captures, mostly Coach): 369. Approved 241, withdrawn 99, discarded 24, auto 5.
- By kind (counts after de-duplication): dispatch 44 auto; coach 42 (16 auto, 16 approved, 7 discarded, 2 pending); coach-program 38 (19 approved, 12 discarded, 5 withdrawn, 2 pending); ingest 33 (27 approved, 5 error); video 32 (25 auto, 7 error); review 21 auto; plan-today 21 auto; **food-suggestion 13 of 13 discarded** (the pre-dedup file shows 21 of 21); wishlist 21 auto; recipe-video 17 (12 approved, 5 failed or error); read-next 13 approved; **plan 11 (4 approved, 7 discarded)**; pattern 10 (7 approved, 3 auto).
- Compared with the 8 Aug baseline (154 made, 9 filed, dispatch 0 of 57, Daily Review 0 of 25): the unread pile is gone because 184 of 427 now deliver themselves. The risk moved. Auto items carry no acknowledgement field, so whether he reads a brief or a review "cannot be measured" from this data. This is a blind spot, not proof of anything.
- The 9 pending are 5 to 20 days old (oldest 18 Oct).
- Spoken vs typed: **cannot be measured**. Every line is stamped `via: voice`; the record has no flag for dictation versus typing in the voice chat.

### Produced and never read: cost per lane (model-spend, 21 Oct to 6 Nov, 602 runs, $182.14)

| Lane | $ | Runs | Share | Note |
|---|---|---|---|---|
| ingest | 51.53 | 36 | 28% | builds the wiki, $1.43 a run |
| coach | 37.96 | 67 | 21% | he engages (34 approved, 13 discarded in coach-kind records) |
| ask-nova | 19.60 | 36 | 11% | 18 of 36 runs local; 9 error |
| watcher-verdict | 15.50 | 36 | 9% | intake |
| scan-food-meal | 8.58 | 43 | 5% | |
| pulse | 8.00 | 51 | 4% | no engagement evidence found |
| researcher | 6.70 | 36 | 4% | |
| distill | 5.08 | 2 | 3% | intake |
| daily-review | 2.02 | 17 | 1% | never reads the vault, 1 concept named in 63 replies, no acknowledgement field |
| leader-daily | 2.11 | 17 | 1% | |
| coach-reflection | 2.39 | 16 | 1% | |
| plan-today | 1.12 | 18 | 1% | |
| greeting | 0.11 | 70 | 0.1% | 20 of 70 errored |

Intake lanes (ingest, watcher-verdict, distill, leader-research, researcher, pulse) total $89.84, 49% of spend. Asking lanes (ask-nova, coach) total $57.56, 32%. Proactive daily lanes (daily-review, plan-today, leader-daily, coach-reflection, greeting, weekly-debrief) total $8.09, 4%. No lane has a measurable "ignored" cost because only the 100% discard lanes (food-suggestion, most of plan) have a spend number: food-suggestion itself is not in the spend file, so its cost is not measurable.

---

## Q5. Profile coverage

From `getProfile` and `profileCoverage` run read-only on the real vault (7 Nov): **9 of 12 sections in his own words, 3 drafted by Claude only (About me, Life, Taste), 0 empty, 22 of his own lines, picture "working"**. Next focus the logic picks: About me. Per section his-own lines: story 1, toward 3, values 6, training 2, fuel 4, work 1, mind 2, people 2, talk 1. The profile text that reaches the model is 8,168 chars. The last interview exchange was 25 Oct; nothing since.

What he has told Nova that never reaches a lane that decides on it. `profileContext` is called in 28 modules (list in `server/lib/profileReach.js`). It is not called by: `dispatch.js`, `mealPrep.js`, `foodSuggest.js`, `foodRefine.js`, `eatOut.js`, `foodDescribeLocal.js`, `pulse.js`, `ingest.js`, `distill.js`. So:

- Fuel facts ("won't eat Vegemite or possibly Brussels sprouts", "would rather reduce the time it takes to cook", said 26 Oct) reach Ask Nova and Coach, and none of the five food-decision modules. Harm not observed; the wiring is absent.
- The ingest and distill lanes ($56.61 of the 17 days) decide which Concepts and Entities to mint with no knowledge of his goals or what he already uses. This is a gap, not a bug.
- Profile and Injury Log contradict each other (see Q3).
- The "What I'm working toward" and "How to talk to me" sections (the ones that matter most for relevance) do reach 28 modules; the gap is in who is asked to use them.

---

## Surprises and things that are broken

1. Zero of 63 Daily Review sessions and 0 of 12 Plan Today sessions touched the vault. They work only from the bundle. Daily Review prompts name 108 Concepts and the output names 1.
2. The embedding index is 19 MB of upkeep and no agent answer uses it.
3. Concept creation continues at 76 to 91 a month while 45% have no demonstrable use.
4. Journal in the vault is 100% agent output. Journal intent says it is his. 393 entries, none by him.
5. Corrections do not stick: three shoulder closures, zero record updates. The Profile and Injury Log disagree.
6. The local Ask Nova lane failed to start 11 of 18 times in the window ("this Mac has only ~3.7 GB free, needs 4,158 MB"), costing a cold Claude run each time (e.g. $2.70 on 1 Nov 02:16, $4.59 on 1 Nov 09:49).
7. Repertoire shows 54 daily surfacings and zero tries. The rehearsal room has not been opened since 26 Sep.
8. Inbox `plan` records: 7 of 11 discarded; `food-suggestion`: all discarded.
9. Auto-delivered records have no read signal: 0 of 184.

## Top 5 changes, ranked (each works without him engaging more)

1. **Make Ask Nova's front door retrieve by the question.** Replace "newest 5 sources" (`askContext.js:220`) with the Coach's ranked shelf call (`coachTurn.js:443`) and add the top 3 matching Concept, Topic or Inbox page excerpts using the existing `searchVault` (lexical plus embeddings). Reconcile the "BE FAST" line at `claudeCode.js:608`. Number: the 10 Oct stiffness question missed a page created four days earlier; 0 Concept names in 18 Ask Nova sessions; 2 in 1,063 replies; the embedding index is used by no answer. He would notice that answers cite his own saved books without being told. Size: small to medium, a section loader plus one prompt line and a test.

2. **Write what he says back to the record.** When he closes or states a fact the Coach or Profile holds (shoulder closed, injury cleared), propose the Injury Log and Profile edit on the existing rails with one tick, and flag any contradiction between Profile and Injury Log. Number: three closures in 17 days, Injury Log last updated 15 Oct, Profile says no injuries while the log says moderate. He would notice the Coach stops asking about the physio. Size: small, reuses setSection, injuryLog and the rails.

3. **Give unused Concepts a turn, chosen by code.** Extend the Leader's spacing picker (`leader.json` `spacing`, 85 entries; the lane that names 27 of the 34 used Concepts) to feed one relevance-matched, never-yet-used Concept into Daily Review's library section. Number: 129 of 289 never in a prompt, read or reply; Daily Review sees 108 names and names 1. He would notice the review referencing something he saved weeks ago that fits today. Size: medium.

4. **Quiet the lanes that are fully discarded, and add a read signal for auto lanes.** Pause food-suggestion (13 of 13 discarded; 21 of 21 before de-dup) and propose the same for `plan` (7 of 11 discarded) through the existing autonomy ledger. Stamp `seenAt` when he opens the Journal day or Home card an auto item lands in, so dispatch (44), review (21) and plan-today (21) get a real engagement number. Number: 0 of 184 auto records carry a read signal. He would notice fewer rejected cards, and next audit could answer what it could not now. Size: small.

5. **Feed the profile to the lanes that decide on it.** Add `profileContext({only:['fuel']})` to mealPrep, foodSuggest, foodRefine and eatOut, and the toward and training sections to ingest and distill so new pages get minted against his goals. Number: 9 modules do not call `profileContext`; ingest and distill are 28% and 3% of spend. He would notice food suggestions that respect what he told Nova and fewer Concept pages he never meets. Size: small for the food lanes, medium for ingest (needs a before and after on page counts). Evidence for benefit is weaker than for 1 to 4; no harm was observed.

Not recommended because the data does not support it: a link or orphan cleanup (0 orphans in Concepts, Sources, Entities, Topics), or building more intake.

## What could not be measured

- 90 day Inbox, conversation and spend history (rotated; windows are 34, 47 and 17 days).
- Which pages the local Ask Nova model read (not persisted).
- Whether he reads auto-delivered briefs, reviews and plans (no signal).
- Spoken versus typed (no flag).
- Studio and Playbook use (no sessions, no applied log yet).
- Paraphrased use of a page (title match only).
- Per-lane cost of the pure discard lanes (food-suggestion has no spend lane).

## Appendix: the 129 Concepts no agent touched (never in a prompt, read or reply)
- A Man Must Have a Quest
- Alpha History Fantasy
- Apprenticeship Phase (Greene)
- Assertive Voice — Ten Lessons (Fisher)
- Behaviors Before Pills Hierarchy
- Biological Age Tests & Epigenetic Clocks
- Blame Triad
- Bone Density as a Longevity Metric
- Boundaries — Perimeter, Manual and Enforcement (Fisher)
- Build & Lean Phases
- Build, Balance, Refine
- Buy Nothing Challenge
- Caffeine, Sleep Debt & Performance
- Calibrated Questions (Voss)
- Cat and Cheese
- Chosen vs Unchosen Suffering
- Chronotype, Temperature Minimum and Jet Lag
- Clean Omnivore Diet
- Complete Protein to Calorie Ratio (CP:C)
- Compounding & Systems Over Goals
- Concede to Persuade (Fisher)
- Confidence Built on Skill (Greene)
- Conversational Narcissism & Assertive Curiosity
- Conversational Readiness & Claiming Your State
- Cosmic Irrelevance
- Currency of Sacrifice
- Cynics Right, Optimists Rich
- Define Your Aesthetic
- Defining Aesthetic For Yourself
- Deflecting Insults, Belittling and Rudeness (Fisher)
- Diet, Fasting & Mitochondrial Efficiency
- Don't Major in the Minors
- Dream Building & Pet vs Pest Projects
- Eliminate Before You Automate
- Energetic Coherence & Resonance
- Energy Hierarchy
- Energy Management as the Top-Performer Differentiator
- Energy Out of 100 (Fisher)
- Energy Resistance
- Entertainers vs Appreciators
- Every Position Has an Advantage
- Fame's Seesaw
- Foundational Fitness Template (Huberman)
- Frame Control & Attacking the Premise
- Frame of the Veteran
- GDF15
- Genetics, the Goldilocks Rule & Mastery
- Gratitude Practice Done Properly
- Great Mood Without Reason
- Grief as Reward Prediction Error
- Grip Strength, Power & Powerpenia
- HEAL Method
- Health Anxiety & the Disease-to-Optimization Spectrum
- Identity as Behavior Not Narrative
- Image-Based Vision
- Information Gaps & Conversational Confetti
- Injury & Tissue Quality as Aesthetic Debt
- Injury as an Aesthetic Ceiling
- Inversion & Adversarial Thought Experiments
- Lean Enough vs Stage Lean
- Life's Task vs Passion (Greene)
- Light Phases of the Day (Huberman)
- Little Lessons from the Four Laws
- Malicious Benefit & Well-Intentioned Harm
- Measure in Hundreds
- Mental Contrasting and WOOP
- Mitoception & Energetic GPS
- Mitochondrial Biology & Signaling
- Motivating Operations & Behaviorist Mechanics
- Nobody Is Watching You
- Non-Sleep Deep Rest (NSDR)
- Nostalgia, Impermanence & Cliché Wisdom
- Offensive Empathy
- Optionality vs Commitment
- Pain as Fuel
- Performance Span vs Health Span
- Planned vs Actual Staffing Log
- Present-Tethered Awareness
- Probability Stacking
- Proportions Over Size
- Punking the Game
- Questions of Intent
- Quick Scan and I Can Tell (Fisher)
- Read the Author's Chapter of Life
- Redemption vs Contamination Narratives
- Region Beta Paradox
- Right, Wrong, Right Demonstration (Wooden)
- Risk Repricing
- Screens, Novelty-Seeking & the Cognitive Turnoff
- Self-Directed Adaptive Plasticity (SDAP)
- Self-Love as Higher Standard
- Shape Before Size
- Short Pauses and Long Pauses (Fisher)
- Signature Questions & Behavioral Interviewing
- Simplicity vs Difficulty
- Sleep Apnea & the Diagnosis Gap
- Sleep Divorce & Partner Sleep Disruption
- Sleep as Cumulative Debt
- Small Talk With Yourself (Fisher)
- Sound & the Sleep Environment
- Stimulant Tolerance and the Foundation First Rule
- Stimulus, Adaptation and Specific vs General Adaptations
- Stroke Recovery and Coping (Greene)
- Task Switching Rituals
- The 5-4-3-2-1 Method
- The CENTS Framework
- The Conversational Frame (Fisher)
- The Five Narrative Archetypes
- The Good Sticks
- The Habit Loop & Four Laws Framework
- The Lonely Chapter
- The Value Is in the Interpretation
- The Who-By-How Formula
- This Is Not New — AI as a Change-Management Problem
- Three Generations Rule
- Three-Step Process to Win
- Train For Muscle Not Weight
- Training Age & Majoring in the Minors
- Training Ages — Build, Balance, Refine
- Training as Mental Health Infrastructure
- Traits as Continuums
- Triggers and Finding Theirs (Fisher)
- Unfinished Tasks and Sleep
- Vulnerability Regret & Level-Gating
- Waist Management & Digestion
- Wearables — Strengths and Limitations for Sleep Tracking
- Word Hygiene — Just, Sorry, and Fillers (Fisher)
- You're Not Behind, You're Early
- Zeigarnik Effect