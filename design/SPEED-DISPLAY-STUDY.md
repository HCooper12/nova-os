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
| 1 | Calendar: a fresh fetch never displaces a settled answer until it settles | in progress |
| 2 | Display grammar: disfluent openers, everyday "bigger" phrasings, false-positive table | in progress |
| 3 | Phone: the four commands that did nothing | in progress |
| 4 | Phone: retry the snapshot once before the 38-request fallback; no fallback beside a newer sync | not started |
| 5 | Phone: no bulk sync while a spoken turn is live | not started |
| 6 | Phone instrument: network time against main-thread stall, stamped into the turn receipt | not started |
| 7 | The visible display changes (mockup 126, his approval first) | not started |

Left alone on purpose: reusing a just-finished clip read when he ends a turn
with a tap. It could save up to a second but risks clipping his last word, and
the instrument in row 6 should show whether that second matters first.
