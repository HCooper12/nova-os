# Speed and display study (22 Nov 2026)

His ask, with two reels (a Jarvis that drives a computer, and Rose again):
"Nova needs to be as responsive and quick as this demonstration. It also needs
to be able to do things with the visual displays like this demonstration, such
as enlarging it and being more dynamically interactive with things when I ask
any random questions."

Two jobs: (a) the speed of a spoken turn, (b) displays he can drive by voice.
This file is the record of what was measured, what is only suspected, and what
was built. `design/ROSE-STUDY.md` is the earlier study of the Rose reel and the
build that followed it.

## 1. The bar, measured from the reels

Method: word timings from a transcript of each reel's audio (good to about
0.2 s) and frames for the screen changes. A reel can be cut, so these are what
the reel shows. That is the bar he set.

| Moment | Last word to first word |
| --- | --- |
| Jarvis, plain reply ("You're quite welcome", "Very good") | 1.1 s, 1.8 s |
| Jarvis, a command confirmed aloud ("Right away") | 2.1 s, 2.5 s |
| Jarvis, "Yes." then a site opened and confirmed | 4.1 s |
| Jarvis, open an app (and he admits he is unsure it opened) | 8.6 s |
| Rose, acknowledgement | about 2.5 to 2.9 s |
| Rose, the answer itself | about 4 to 5 s |
| Rose, a silent screen change (maximise) | about 1.3 to 1.6 s |

Rose's maximise says nothing. The chart moves to the centre at about 1.3 to
1.5 times its size and every other tile drops to about a tenth of its
brightness. The change on screen is the receipt.

## 2. Where Nova stands (read-only, from the turn receipts and the server log)

- His real spoken turns are far from the bar. Last word to Nova's first
  sentence, the three real turns since 10 Nov: 8.7 s, 15.7 s, 35.5 s.
- The server's own work is fast. Transcription route p50 373 ms, an ask
  accepted p50 68 ms, speech p50 504 ms a sentence, a poll 1 ms.
- **Small voice responses reach the phone's code seconds late.** 7 of 42
  matched uploads waited 2.7 to 14.6 s longer than the server took. On 18 Nov:
  8.3 s of "ears" against 0.33 s on the server, 4.4 s from the ask accepted to
  the first poll, and poll round trips of 2.3 to 4 s for 1 to 4 ms responses.
  Mechanism not proven. Two candidates: the path to the phone was saturated by
  a refresh, or the phone's main thread was busy applying one.
- **On 18 Nov the phone refreshed everything twice as his turn began** (proven
  for that one app open): a full snapshot plus the 38-request fallback 90 ms
  later. Server reads slowed from tens of milliseconds to 1.3 to 2.4 s.
  Leading explanation, untested: a sync left in flight when iOS suspended the
  app fails on resume and falls back, while the 120 s watchdog has freed the
  flag and the resume handler starts a fresh snapshot.
- **Calendar reads wait on iCloud.** Since 28 Oct, 518 calendar reads, 563
  instruments reads and 513 snapshots took 3 s or more. The three counts are
  nearly equal, which points at one shared cause. See section 4 for what the
  test showed.
- Nothing checks whether a spoken turn is live before a sync starts. Sync
  triggers: boot, resume, a 5-minute interval, stream nudges, `online`, a dead
  stream catch-up, a degraded retry and about 25 write paths.
- Also seen: the Mac deep in swap (18.3 of 19.5 GB on 21 Nov) with six
  long-running Claude processes; the local speech-to-text sidecar crashed
  mid-turn on 18 Nov ("Address already in use"); a turn ended by a tap uploads
  the whole clip again.

Corrections to earlier guesses, so nobody repeats them: the transcriber is
fast on the server and the lost seconds come after it answers; requests from
127.0.0.1 are the snapshot calling its own slices, not a Mac browser tab; the
slow calendar reads did not hold the server's thread (it answered the phone in
1 to 9 ms meanwhile).

Limits of the log instrument: the "client hung up" lines carry no timestamp,
`/api/health` is never logged, and the request log stamps the finish time.

## 3. Displays (by reading the code and a parse table)

Most of what the Rose reel shows was built 7 to 11 Nov and never confirmed on
his devices. The gaps:

- His words are matched on the client (`src/glassVoice.js`) before any model
  sees them. A miss becomes a slow model turn. The reel's own sentence, "Can
  you, uh, can you maximise the headset share chart, please?", matched
  nothing, and neither did "make that bigger", "zoom in" or "full screen".
- On the phone, "restore", "history", "words" and "no words" did nothing while
  Nova said "Back as it was."
- A matched command speaks a receipt where Rose's maximise is silent.
- Not built, or not proven against the reel: the ghosted maximise, the blur-in
  arrival, a live line of heard words, a recalled report as a board of tiles,
  and visuals for any random question (which must carry real, code-checked
  data, never decoration).

## 4. What was built, and what it proved

Status is filled in as each piece lands. Nothing here is on his phone until it
is pushed and checked there.

| # | Fix | Status |
| --- | --- | --- |
| 1 | Calendar: a fresh fetch never displaces a settled answer until it settles; four calendars asked at once | running on the Mac since 22 Nov 17:57 (`2e48d452`, `2a97863a`); first log count after it: no slow reads in 6.5 hours of use, see 4.1 |
| 2 | Display grammar: disfluent openers, everyday "bigger" phrasings, false-positive table | on main (`6a0f78af`), not pushed, not seen on a screen; see 4.2 |
| 3 | Phone: the four commands that did nothing | on main (`4bd41e30`), not pushed, not seen on a screen; see 4.2 |
| 4 | Phone: retry the snapshot once before the 38-request fallback; no fallback beside a newer sync | on main (`bc61b74a`), not pushed, not run in a browser; see 4.3 |
| 5 | Phone: no bulk sync while a spoken turn is live | on main (`f890c8c7`), not pushed, not run in a browser; see 4.3 |
| 6 | Phone instrument: network time against main-thread stall, stamped into the turn receipt | on main (`857c03c9`); the server half is running on the Mac; the phone half is not pushed; see 4.3 |
| 7 | The visible display changes (mockup 126, his approval first) | not started |

Left alone on purpose: reusing a just-finished clip read when he ends a turn
with a tap. It could save up to a second but risks clipping his last word, and
the instrument in row 6 should show whether that second matters first.

### 4.1 Row 1, the calendar: what the test and the probe showed

**The fault, proven.** While the app is open, `calendarWatch` asks iCloud for
a fresh picture every 25 s. That fresh call replaced the settled cache entry
with its own unfinished request, so every ordinary reader that arrived during
the round trip (the snapshot, the instruments, the widget, the Reflex peek)
waited on iCloud although a good answer had been there a moment before. Six
tests in `server/test/calendarFreshCache.test.js` fail on the old code. They
use a fake CalDAV client behind a small test seam, so they need no network.

**The fix.** A settled entry keeps serving until the fresh result has landed,
and only the fresh caller waits. A fetch that began before one of his writes
is never cached over that write, on the fresh path or on the background
refresh (the second was an older hole, found in review and given its own
test). An older fetch that fails late no longer evicts a newer entry. A
second commit asks up to four calendars at once and folds the answers in the
calendars' own order, because one round trip used to cost the sum of every
calendar's latency.

**Measured against his real iCloud** (read-only, old code and new code in one
process, taking turns so neither had the warmer network):

| | Old | New |
| --- | --- | --- |
| A full round trip to iCloud, three runs | 9.6, 9.2, 8.9 s | 4.4, 4.0, 3.8 s |
| An ordinary read made while a fresh fetch was out | 9.2 s | 3 ms |

Both versions returned the same events. Whole server suite with the fix: 5858
pass, 0 fail, 4 skipped.

**On the Mac.** The server was reloaded on 22 Nov at 17:57. The first calendar
read after the start took 3.2 s (sign-in and discovery), the next five 2 to
19 ms.

**The request log, before and after.** Whether the 500 or so slow reads
since 28 Oct were this fault could only be read from his real use. The
watcher only asks for fresh pictures while a client is connected, so the endpoint alone cannot show the difference with the app
closed. The check is `node scripts/slow-reads.mjs`, which counts the three
routes in the request log on each side of the reload. Before it, from 28 Oct:
553 of 7,549 calendar reads (7.3%), 597 of 4,534 instruments reads (13.2%)
and 559 of 8,528 snapshots (6.6%) took 3 s or more (the counts in section 2
were taken a day earlier).

**First count after the fix** (23 Nov 00:21, six and a half hours of real
use with a client connected):

| Route | Before, 3 s or more | After, 3 s or more | After, worst |
| --- | --- | --- | --- |
| Calendar | 553 of 7,549 (7.3%) | 1 of 108 | 3.2 s |
| Instruments | 597 of 4,534 (13.2%) | 0 of 68 | 1.2 s |
| Snapshot | 559 of 8,528 (6.6%) | 0 of 141 | 1.7 s |

The one slow calendar read is the first read after the restart, which has no
cache to answer from; that one is expected after any restart. At the old
rates these hours would have held about 8, 9 and 9 slow reads. The sample is
small, so run the count again after a few days before calling it closed.

### 4.2 Rows 2 and 3, the words the glass hears

**The matcher** (`src/glassVoice.js`, table in `server/test/glassVoice.test.js`,
859 rows). On the old code 388 rows failed, among them the reel's own
sentence, 95 of 140 stumbling or polite forms and 64 of 72 ways to say
smaller. Now fillers come off wherever they fall, openers and thanks come off
both ends however many are stacked, and the 80-character cap is applied to
what is left. "Make that bigger", "zoom in", "full screen", "bigger" and
"blow it up" are the maximise the glass already had; "smaller", "zoom out"
and "back to normal" are its restore. A bare "that" or "it" means the lit
panel, else the newest, and means nothing with an empty glass, so the words
go to Nova.

**What must not match.** Checked by hand against the old matcher with three
panels up: "make my chest bigger", "I want to get bigger", "my back hurts",
"is my sleep back to normal", "expand on that", "shrink my waist" and "can
you clear my calendar" all still go to Nova. "Show me a video on squats"
used to be taken as a camera request and now goes to Nova too.

**The phone** (`src/PhoneStage.jsx`, `server/test/phoneGlassRun.test.js`).
"Put it back" closes the open panel, and with nothing open it is an ordinary
turn. "History", "words" and "no words" have no surface on the phone, so they
are ordinary turns as well; before, Nova said "Back as it was." over a screen
that had not changed. A panel he put away can now be brought back by name
(the phone's history was always empty), and clearing the screen no longer
brings back panels he had put away earlier.

**Left for the mockup round, on purpose.** "Put it back" after "clear the
screen" does not un-clear on either device. Nothing reaches the conversation
above the phone's stage by voice. "The first one" and "the last one" mean
the lit or newest panel.

Gates on main plus both commits, in a clean worktree: lint clean, build
green, the Home guard unchanged, server suite 5915 pass, 0 fail, 4 skipped.

### 4.3 Rows 4 to 6, the phone: the sync that ran beside his turn

All three are tested with fakes under `node:test`. None has run in a real
browser or on his phone, so the numbers that matter are still to come from
row 6 once it is on his device.

**Row 4** (`src/syncPass.js`, `server/test/syncPass.test.js`). Reading the
code confirmed that the double refresh of 18 Nov is possible: the 120 s
watchdog frees the in-flight flag under a sync iOS froze, the resume handler
starts a new one, and the old one wakes, fails, pings a network that is back
and runs the per-slice fallback without asking whether a newer sync exists.
That it is what happened on 18 Nov is still not proven. Now every whole-app
sync has a generation. One that fails after a newer one has started steps
aside: no fallback, no offline chip, no retry. One that is still the newest
pings, tries the snapshot once more on a good ping, and only then falls back.
OFFLINE is still said only after a failed ping.

**Row 5** (`src/turnPhase.js`, `server/test/turnPhase.test.js`). A spoken
turn has a phase: listen, wait, speak, idle.

| Phase | Whole-app sync | Small targeted refresh |
| --- | --- | --- |
| He is talking, or waiting for the answer | waits | waits |
| Nova is speaking | waits | runs |
| Idle | runs | runs |

What was held back is owed, never lost: many held calls become one, run one
second after the turn ends. A whole-app sync already on the wire when he
starts to talk is called off (one abort signal covers the snapshot, its retry
and the fallback) and owed. A phase nothing has touched for 30 s falls back
to idle, so a turn that never ends cannot starve the app. Only the five
surfaces that post a turn receipt mark a phase; a dictation box marks
nothing. Checked in review: a called-off fallback writes nothing to the
screen, because each slice sets state only after its own read succeeds.

**Row 6** (`src/turnNet.js`, `server/lib/voiceTurns.js`,
`server/lib/timingAllow.js`, `scripts/voice-latency.mjs`). The ask receipt of
a spoken turn now carries, for the upload and the ask, the time the code
waited next to the network's own time for that request (with connect, TLS
and first byte), a summary of the polls before the first reply, how late a
100 ms timer fired (the main thread busy), and what refreshed beside the
turn. That separates the two candidates in section 2. The timer runs only
during a turn. The server sends `Timing-Allow-Origin` to the origins CORS
already allows and to nobody else (checked on the running server). Numbers
and one closed word only; old rows read as before.

**Known gaps.** A Practice reply is not marked as speaking. A turn with no
ask carries no instrument numbers. A slow snapshot that still answers pings
now costs two timeouts before the fallback.

Gates on main plus the three commits, in a clean worktree: lint clean, build
green, the Home guard unchanged, server suite 5959 pass, 0 fail, 4 skipped.
The server was reloaded on 23 Nov at 00:42.
