# Darwin (@darwinaiassistant) — capture notes and evidence

Method and coverage for `design/DARWIN-STUDY.md`. Baseline written before
viewing: `design/darwin/NOVA-BASELINE.md`.

## Who

**Darwin** — a JARVIS-style AI assistant for **Windows desktop**, by
**BlueberryS s.r.o.** (Slovakia). Founder: **Gabriel**, a bridge engineer of
15 years, maker of `Easy Bridge®` CAD software used by design offices in the
region. Site: `www.darwinaiassistant.com`. Backronym on the site footer:
*Desktop Agent for Reasoning, Work & Intelligent Networking*.

Sold as a one-time purchase — €199 Light / €249 Standard / €449 Pro / €690+
Team — with lifetime free updates as an early-launch guarantee. You bring your
own model keys; they take nothing off the top.

## Coverage — what was actually read

**All 8 Instagram posts. The account has exactly 8 posts** (confirmed from the
profile's own meta description: "1,480 Followers, 0 Following, **8 Posts**"),
so this is complete coverage of the account, not a sample.

| id | date | dur | what it is |
|---|---|---|---|
| `DdCs52ksppv` | 8 Sep | 28.5s | Brand film — "TACTICAL OPERATIONS INTERFACE" |
| `Dc6jPgnsS_1` | 5 Sep | 111.1s | Founder to camera: the agent that said **no** |
| `DcrFViLMpGh` | 30 Aug | 86.3s | Commentary on other DIY JARVIS builds (2,238 likes — the outlier) |
| `Db_q2l1syxf` | 13 Aug | 176.7s | Self-install walkthrough, **Part 2/2** |
| `Db76ptHMvmG` | 12 Aug | 176.2s | Self-install walkthrough, **Part 1/2** |
| `Dbq9V1tsNTZ` | 5 Aug | 29.3s | Debugging timelapse — hand gestures |
| `DbiLAwGM2hy` | 2 Aug | 15.7s | "REAL JARVIS" feature cards |
| `DbgnwcvsljG` | 1 Aug | 64.8s | Origin story — "I wanted a JARVIS" |

**Website, fetched in full:** `index`, `changelog.html` (the big one — 43
releases, 13 Jun → 7 Sep 2026, every version annotated), `memory.html`,
`how-darwin-remembers.html`, `guides.html`, `tier-light/standard/pro.html`,
`free.html`, `easycad.html`, `settings-guide`.

## How, and what went wrong

**Browser.** The Claude-in-Chrome extension never connected (his everyday
Chrome was not running; the only Chrome alive was an automation instance
launched with `--disable-extensions`). The chrome-devtools MCP profile was
locked by another process. Resolved by driving **Safari 26.5.2** over
AppleScript `do JavaScript`, after he enabled *Settings → Developer → Allow
JavaScript from Apple Events*. Work was done in a new Safari window; his other
six windows were not read.

**Enumeration.** `yt-dlp`'s `instagram:user` extractor is marked broken
upstream and failed with and without cookies. Instagram's own web API returned
**HTTP 429** on the first request with his cookie file — rate-limited, not
authenticated — and was **not retried**, to avoid flagging his account. In the
end none of that mattered: the logged-out profile grid carries all 8 posts,
and the meta description confirmed 8 is the total.

**Video.** All 8 downloaded with `yt-dlp` (no cookies needed — 88 MB total).

**Transcription failed, and was worked around.** `~/.config/watch/.env` has a
`GROQ_API_KEY` that returns **HTTP 403** (expired or revoked) and an
`OPENAI_API_KEY` that is **empty**. No local Whisper is installed. So no audio
was transcribed. Instead: every reel carries **burned-in subtitles**, so the
narration was recovered by reading frames.

- Scene-change frames (`select='gt(scene,0.12)'`) for UI-heavy reels.
- Uniform 1-frame-per-3s samples tiled into 17 contact sheets for survey.
- For the word-by-word "karaoke" reel (`Dc6jPgnsS_1`), 222 frames at 2 fps,
  cropped to the subtitle band and tiled 5×9 into 5 dense sheets.

**One instrument error, corrected.** The first subtitle crop
(`ih*0.34` at `ih*0.42`) captured the founder's face, not the text — the band
actually sits at ~73–88% of frame height. Caught by extracting one calibration
frame and *looking at it* before trusting the batch. Same lesson as the
anatomy work: fix the instrument before measuring with it.

## Honest gaps in this study

- **No audio was heard.** Narration comes from burned-in subtitles. At 2 fps
  sampling some words are duplicated and a few are missed, so quoted narration
  is reconstructed, not verbatim. Post captions and website copy are verbatim.
- **The product was never run.** Everything about Darwin's behaviour comes
  from its own marketing, changelog and demo footage — all of it a vendor
  describing itself. Nothing here is independently verified.
- **No comments were read**, and no other platform (they mention a YouTube-less
  presence; the site links only Instagram).
- Two reels (`Db76ptHMvmG`, `Db_q2l1syxf`) are Part 1 and Part 2 of one video
  and share an identical caption; counted as two posts because Instagram does.

## Two findings about Nova, surfaced by doing this

1. **Nova's Telegram voice notes are broken right now.** `transcribe.js`
   prefers Groq, the Groq key 403s, and `server/lib/telegram.js:222` is its
   only consumer. Sending Nova a voice note from his pocket currently fails.
2. **Nova's `study` lane cannot study this creator.** `capabilities.js`
   advertises exactly this task, but `studyLane.js` is YouTube-only:
   `CHANNEL_RE` matches `youtube.com/(@|c/|channel/|user/)`, and
   `fetchTranscript` depends on `--write-auto-subs`, which Instagram never
   serves.

## Artefacts

Videos, frames, contact sheets and fetched pages are in this session's
scratchpad, not committed:
`/private/tmp/claude-501/-Users-haydencooper-Desktop-Files-Claude-Projects-nova-os/18b31f75-4c47-463f-ada6-7aecaaba68fa/scratchpad/`
(`reels/`, `frames/`, `uni/`, `grid/`, `words/`, `site/`). Ask if any should be
archived to `~/Desktop/nova-design-history/darwin-study/` the way the
WiseTwinz evidence was.
