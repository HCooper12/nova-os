# Mentors: Nova studies a person he chooses

*Written 18 Nov 2026. Status: PLAN ONLY, nothing built, his answers owed
(see "His calls" at the foot). "Mentors" is a working name.*

His ask, 18 Nov: pick a person (an author, a podcast host, a YouTube
creator), and have Nova find as much of their material as it can, get the
transcripts, analyse them into the vault, keep going as new material
appears, and use what it learned everywhere: the Daily review, the Leader,
any agent, any conversation. Days or weeks of background work is fine. Nova
must know what it has already read, and still be willing to read a source
again to refine it or find new links. First person: Jefferson Fisher. Then
Chris Williamson, Alex Hormozi, Ryan Serhant, Steven Bartlett, and others.

## What was measured on 18 Nov (not guessed)

Catalogue size, own YouTube channel, long videos only (`yt-dlp --flat-playlist`):

| Person | Videos | Hours |
|---|---|---|
| Jefferson Fisher | 235 (plus 567 shorts, 4 streams) | 160 |
| Ryan Serhant | 278 | 56 |
| Alex Hormozi | 530 | 227 |
| Diary Of A CEO | 550 | 993 |
| Chris Williamson | 2,338 | 1,936 |

One caption fetch for a 97 minute Fisher episode: 3.9 seconds, 98,724
characters (18,449 words), no cost. So an hour of talk is about 61,000
characters, and getting transcripts is the cheap part.

Guest appearances on other people's channels, audio-only podcasts and
shorts durations were NOT measured.

Already in the vault: 120 Source pages, 201 Raw files, 303 Concepts, 104
Entities. For Fisher: an Entity page (10.5k), The Next Conversation, three
video sources with transcripts, 176 pages that mention him.

## What Nova already has (reuse, do not rebuild)

| Need | Exists as |
|---|---|
| Transcript of one video | `watcher.fetchVideoTranscript` (yt-dlp captions, Whisper fallback) |
| Reading a long transcript into notes | `digestTranscriptCached` (60k chunks, 3 at a time, lane `watcher-chunk`), cached per video id |
| Writing into the vault with a diff, apply, undo | `ingest.js` (`startIngest`, `approveJob`, `undoIngestJob`), `autoApply` already used for Watcher links |
| "Have I seen this video?" for one link | `videoIdOf`, `findExistingVideoPages` (a text scan of Sources and Raw) |
| A one-off web dossier on a person | `scout.js` (`POST /api/ingest/person`), writes the Entity page |
| Books | The Librarian (`librarian.js`, `bookText.js` for files he owns) |
| A quote proven word for word, with its minute | `reviewQuote.findInTranscript`, `lineHarvest.js` |
| Search across the vault | `recall.js` (words) fused with `embeddings.js` (meaning, local) |
| A queue that works while he sleeps | the Projects scheduler pattern (queue file, reconcile after restart, quiet window) |
| Local speech to text | `sttLocal.js` (mlx whisper), built for short clips |

## What is missing (the real work)

1. No record of a followed person (names, channels, feeds, state).
2. No discovery: nothing lists a channel, reads a podcast feed, or finds
   guest appearances.
3. No durable queue for hundreds of items. Ingest jobs die on a server
   restart and have no concurrency limit. The Projects kernel caps a
   project at 20 jobs and has no watch kind.
4. No register of what was read: when, how deeply, with which prompt.
   Identity exists only for YouTube ids.
5. Person-blind retrieval: `vaultRetrieve.js` does not search
   `Wiki/Entities/`, Source pages carry no `people`, `show` or `video_id`
   field, the Leader gets a list of 20 concept titles and no search, and
   "his named shows" are hard-coded (`NAMED_SHOWS` in `reviewQuote.js`,
   `OWN_CHANNELS` and `BOOK_AUTHORS` in `lineHarvest.js`).
6. No audio-only podcast path (no feed download, no long-audio chunking).
7. No screen for any of it.

## The design decision that matters most: two stages, not one weave per video

Today each video is woven into the vault on its own. At this scale that
fails three ways: 235 separate weaves each edit the same pages (his Entity
page, the index, shared concepts) and collide; a creator repeats his best
ideas across dozens of videos, so the vault fills with near-duplicates; and
the weave is the expensive step.

**Stage 1, read (per source, cheap, can run many at once, writes no Wiki
page).** Fetch the transcript into `Raw/`. Read every word into a
structured note kept in Nova's own data: the ideas, the frameworks and
their steps, the exact scripts and phrases he recommends, stories and
examples, word-for-word lines that code has found in the transcript with
their minute, who else was in the room. Lane: Sonnet, low effort, as the
digest runs today.

**Stage 2, weave (per person, in batches, one at a time, writes the
vault).** A synthesis pass takes a batch of Stage 1 notes plus what the
vault already holds, and writes: one slim Source page per video; Concept
pages, where an idea he makes in 40 videos becomes ONE page citing all 40;
his Entity page; and a new **playbook page** for the person (his core
frameworks, when to use each, his signature lines). Applied automatically
with a receipt and Undo per batch.

Why this also answers "read it again": Stage 1 notes are cached, so a
re-weave (new links, better structure, new sources joining) costs only
Stage 2. A true re-read of the transcript happens when he asks, or when the
reading prompt has a newer version than the one a source was read with.

## The register: what Nova has read

One record per source, in `server/data/` (code writes it, never a model):
identity (YouTube id, podcast episode guid, ISBN, or a hash of the link),
people, show, state (found, transcript, read, woven, failed, skipped), the
reading prompt version, dates, cost, times read. Backfilled once from the
120 Sources and 201 Raw files already there, so everything he has ever
given Nova is in it. Adding a link he has given before answers "read on 3
Oct, 12 concepts; read again?" instead of silently repeating or refusing.
Source pages gain `people:`, `show:` and `video_id:` frontmatter.

## Discovery

- Own channel: videos, shorts, streams by `yt-dlp --flat-playlist`.
- Own podcast: its feed (Apple's free search gives the feed address). An
  episode that is also on YouTube uses the YouTube captions; audio is
  transcribed only when no video exists.
- Guest appearances: YouTube and podcast search on the name, then a check
  that it is the right person and a real appearance (not a clip channel
  re-cutting it). The first time, Nova shows what it found and he confirms.
- Books: the Librarian, unchanged. Deep notes only from a file he owns.
- Ongoing: each followed person is checked on a schedule (daily is cheap);
  new items join the queue. No push (his notification policy); a line in
  the feed and a weekly "what I learned from X".
- Limits stated plainly: public material only, plus what he supplies. No
  paywalled courses, no book text Nova does not have a right to.

## The queue

A new module on the Projects scheduler pattern: one file per person, each
item a small state machine, resumed after a restart, registered with
`jobRegistry` so `reload-server.mjs` waits for it, a heartbeat for the
Guardian. Fetches are paced. Reading runs a few at a time; weaving strictly
one at a time. It yields to him: it stops while a Coach, Ask or Leader turn
is running. Whether Nova can see how much of the account limit is left is
NOT yet known; if it can, the queue should stop early enough that his
morning still works.

## Using it across Nova

- **Ask Nova and voice:** Entities and playbooks join retrieval; a person
  filter ("what would Fisher say about this?"); answers name the source.
- **The Leader:** gets real search by situation, and the playbooks of the
  people he follows, in place of 20 titles. His open struggles are matched
  against them.
- **Daily review:** followed people replace the hard-coded named shows.
  One idea from several sources stays the best card.
- **The Line:** many more word-for-word lines, same proof rule.
- **Practice and the Repertoire:** Fisher's scripts are rehearsal
  material; his techniques feed one-technique-a-day.
- **Every agent:** through the Librarian consult, nothing walled off.
- Honesty rule kept: a line carries a person's name only when code can
  show he said it. Captions do not say who is speaking, so an interview
  line reads "heard on <show>" unless the video is solo. Telling speakers
  apart is a possible later phase.

## Cost, as estimates until the pilot measures it

From the August measurements (60,000 characters on Sonnet cost $0.35):
reading costs about $0.35 per hour of talk. Stage 1 alone: Serhant about
$20, Fisher about $56, Hormozi about $80, Diary Of A CEO about $350,
Williamson about $680. Stage 2 is unmeasured; a guess is a few dollars per
batch of about ten videos. Prices and models have changed since August, so
none of this is a quote. The pilot produces the real figure.

## Build order

0. **Pilot, measured.** Five Fisher videos through both stages by hand.
   Real cost, real time, and the pages shown to him before anything else.
1. The register, and the backfill of what is already in the vault.
2. The follow record and discovery (own channel first), with the
   confirm-what-I-found step.
3. The queue and Stage 1.
4. Stage 2, the playbook page, the new frontmatter.
5. Retrieval: Entities, person filter, the Leader's search, followed
   people in the Daily review and The Line.
6. The screen (mockup first, his approval, then built identical): a
   person's page with what was found, read and woven, what Nova learned,
   what is new, pause, read again.
7. The ongoing check and the weekly digest.
8. Guest appearances, audio-only podcasts, shorts on other platforms.

## His decisions, 19 Nov ("Fantastic, I love this plan")

1. **Full catalogue, always available.** Every source a person has is
   found and listed. Before a huge read (Williamson), Nova FIRST shows the
   estimated cost and the share of his Claude usage, and he chooses:
   everything, or narrowed to most watched, the past 12 months and
   everything new. He can widen it later. Where relevant an idea cites
   every video that makes it, more than 40 when that is the truth.
2. **Everyone's ideas.** On an interview show, each person who speaks gets
   their own catalogued pages, ideas and extracts. The host also gets a
   separate playbook, which includes what the host took from his guests.
3. **Filed automatically**, with a weekly summary per person and Undo.
4. **Pilot: yes** (five Fisher videos, measured, pages shown to him).
5. **It lives in the Library** under its own category filter, "Mentors",
   so he can open and revise any time. Mockup first.
6. **Books:** he does not own the files yet and will source them. Nova
   must ASK for a book file when it sees the person wrote or contributed
   to a book.
7. **No Fable.** The reading and weaving never run on Fable. (Read:
   Sonnet. Weave: Sonnet or Opus, measured in the pilot.)

## What he added on 19 Nov

**The playbook is a multi-page document.** Summaries and key takeaways he
can revise at a glance, diagrams, references, and motion or video where it
helps. Design consequence: the weave must write STRUCTURE, and code draws
it. Each framework carries a `Shape` (steps, cycle, ladder, versus, matrix,
funnel, single) chosen at reading time; a fixed set of code-drawn, animated
diagrams renders them. A clip reference is the real video at the real
minute, never a generated one.

Nova already has topical playbooks that agents APPLY (`playbooks.js`, 7
Nov: `Wiki/Playbooks/<Topic>.md`, trigger words, `applied.jsonl`). A
person's playbook is therefore a book of them: an At a glance page, then
one chapter per framework in the existing playbook format (so the matcher
and the applied log work unchanged), then Scripts, Takeaways, and Sources.
`AGENT_IDS` there is `nova, coach, studio`; the Leader must join it.

**Guest appearances come after the main weave.** When a person's own
catalogue is done, Nova goes looking for where they were a guest
(podcasts, interviews), confirms with him the first time, and reads those.

**News.** New videos, new appearances, new books from the people he
follows are reported to him like news, on a page of their own that can
later carry other things Nova watches for him. In the feed, styled as
content, no push unless he asks (his notification policy).

**Every agent uses it.** Each agent and feature has access, and uses it
where that fits its job. Route: person-aware retrieval for all, playbook
chapters matched into turns, the Librarian consult for the rest.

## The pilot, measured 19 Nov (step 0, done)

Scripts, prompts and sample output: `design/mentors-pilot/`. Everything ran
in the session scratchpad on a COPY of `Wiki/`; the real vault was only
read. Four Fisher videos, 103 minutes of talk (three solo, one with Chris
Voss). The fifth, an 84 minute guest episode, could not be fetched: YouTube
refused it more than twenty times.

| Stage | Model | Cost | Time | Result |
|---|---|---|---|---|
| Read (`read-v1`) | Sonnet, low | $0.40 total, $0.09 to $0.13 each | 28 to 47 s each | 51k characters of notes; 32 of 33 Lines found word for word |
| Weave (`weave-v1`) | Sonnet, high | $3.75 | 18 min, 154 turns | 31 pages created, 16 edited, none deleted |

- Reading costs about **$0.23 per hour of talk**. At that rate: Fisher
  about $37, Williamson about $445.
- Weaving costs about **$0.94 per video** here, nine times the reading.
  It is the cost that matters. At that rate Fisher's 235 videos are about
  $220 and Williamson's 2,338 about $2,200, and long episodes will cost
  more. The cause is the shape of the run: 154 tool turns re-reading a
  large context (10 million cached tokens read). **Build consequence: the
  weave should return structured output that CODE writes into pages, in
  few turns, and be measured again before any large run.**
- The weave made: 4 Source pages, 18 Concept pages (Voss's ideas filed
  under Voss, two pages citing both speakers), 8 playbook chapters, the
  mentor book (7 principles each with "in N of 4", 8 chapters with a
  diagram spec, 50 scripts, 15 revision cards, 7 things he took from
  Voss), and edits to 10 existing concepts and both people.
- Checked by code: all 8 chapters parse with Nova's own `parsePlaybook`
  (77 rules, each with a source and a minute). 61 of 63 phrases and 49 of
  50 scripts are word for word in the transcripts; the misses are captions
  the reader tidied ("it sounds like we need to have another discussion").
  The build must run this check and hold back what fails.
- Not byte-identical on a `formatPlaybook` round trip, so in the build
  code writes the chapter from the parsed structure, never the model.
- The weave edited the vault's `CLAUDE.md` (two lines for the new folders)
  without being asked. The build must make that file read-only to it.
- It found four real tensions with existing vault pages and recorded them
  without resolving them (Voss now prefers a statement to a "what"
  question; the vault's Calibrated Questions page says the opposite).
- NOT measured: an Opus weave, a batch larger than four, a long episode,
  the chunked read for a transcript over 150k characters.

## Found while running the pilot

- **YouTube throttles caption downloads hard.** About 40 requests in an
  hour from this Mac got 4 transcripts; after that every request was
  refused (429) for at least 20 minutes, with the newest yt-dlp
  (2026.10.26) and browser impersonation too, so it is the connection
  being limited, not the tool. Listing a channel was never refused. The
  `srv1` caption format got through at moments when `vtt` and `json3` were
  refused, and Nova's watcher asks for `vtt` (`download.py`). The
  sustainable rate is NOT yet known. Options, in order: slow pacing
  measured over a night; his signed-in YouTube cookies (Nova already has a
  jar at `~/.config/watch/yt-cookies.txt`; his account, so his call);
  downloading audio and transcribing on the Mac (`sttLocal.js`, slow,
  free); a paid transcript service. 235 videos at even one every ten
  minutes is under two days, which fits "days or weeks is fine".
- **Nova can read his Claude usage, free, before any run** (verified 19
  Nov on CLI 2.1.326): `echo "/usage" | claude -p --output-format
  stream-json --verbose` returns an assistant message carrying
  `usage_report.rate_limits.limits[]` with `kind` (`session`,
  `weekly_all`, `weekly_scoped` per model), `percent`, `resets_at`. Cost
  $0. Nova today only notices the limit once it is hit (`usageLimitNotice`
  in `modelSpend.js`). So the estimate gate can show the week's percentage
  now, and the queue can stop before the week runs out. NOT yet known: how
  many percent a dollar of Sonnet reading moves the week. Calibrate it by
  reading the percentages before and after a real batch while nothing else
  is running (the pilot could not: this session and a design agent were
  spending at the same time).

## His feedback on mockup 125, 19 Nov (first look, on his phone)

"Decent first attempt at the design." What he asked for:

- **Colour coding and design that shows where the process is at**, for
  the found / transcripts / read / woven strip on the person's page.
- **More distinct design details** and a better look across the rest.
- **Less clutter.** The principles page (document page 1) was his
  example. His bar: "quickly glanceable without feeling overwhelming but
  also capable of presenting the entire content scope."
- **The Mentors screens may leave Nova's Summary card look** where that
  improves them ("It's okay to steer away from the nova specific summary
  design approach").
- **Use the design skills, always.** The brief for any mockup names them.
- **News is a separate build run.** It leaves this build. It gets its own
  mockup and its own approval. Step 7 above keeps only the ongoing check
  and the weekly summary; the News page and the Home line wait for that
  run.

What version 2 of the mockup does about it:

- **One state language** wherever a process is shown: done (mint, tick),
  working now (cyan, the one live pulse), waiting on something outside
  (amber, clock, says when it resumes), paused by him (slate), needs him
  or a problem (coral), not started (dim). Always colour, icon and word.
- **The pipeline card**: the number in his vault as the hero, one state
  sentence, a map of the whole catalogue (one cell per video, coloured by
  how far it has got), and the four stages as a joined path where only the
  stuck or active stage draws the eye. A stage opens the list of its
  videos. This replaces the four circles and the separate wait card.
- **The document is glance first**: each page has a layer that fits about
  one screen, and the rest opens in place. One Glance / Full switch.
  Principles become a short numbered ledger. A chapter leads with its
  diagram and three takeaways; method, rules, phrases, mistakes and limits
  open on a tap. The position bar shows the book's structure.
- **The build consequence**: the register must hold a per-video stage
  (found, transcript, read, woven, refused, held) so the map and the
  stage lists are real. The mentor book needs the principle counts as
  structure (not words inside the sentence), which the structured weave
  already calls for.
