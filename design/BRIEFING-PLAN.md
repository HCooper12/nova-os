# The Briefing — a report Nova researches, then performs

His ask, 7 September 2026, verbatim in shape: *"Hey Nova, I found the
information about the different wavelengths of light and how it impacts a
human's entire overall person that Andrew Huberman discussed on that Diary of
a CEO podcast incredibly interesting. Can you research that topic and
synthesise it into a report to bring back to me? Make sure the report is
simply understood — define and re-explain scientific terminology I may not be
aware of or that may have slipped my mind."*

Then: agents do the work, a notification says it is ready, and **when he
chooses**, he opens it — a document with images and clips, or he presses play
and Nova reads it to him while visuals change on the glass and the transcript
runs beside it so he can read and watch at once.

This is the level of competence the platform is aiming at. It is also the
largest single build in Nova, so it is designed before it is written.

---

## What already exists (audited 7 Sep 2026)

**The Morning Show is a working prototype of this feature minus the media.**
`composeShow()` returns `{steps: [{say, card, panel?}]}`, `POST /api/show`
serves it, and `App.jsx` plays it — each beat's text, panel and glass card
landing at the instant its audio starts. Model the briefing on that step
shape and the sync, the queue, barge-in handling and the stage rail are all
inherited rather than rebuilt.

| Need | Exists | Verdict |
|---|---|---|
| Spoken playback synced to visuals | `speakTtsSentence(text, onPlay)` → `drainTtsQueue` → `putCard` | **Reuse whole** |
| Multi-agent fan-out then synthesis | `planner.js` wave scheduler + `Promise.all` + `writeReport` | **Reuse** |
| Web research with enforced citations | `researcher.js` (`checkCitations` refuses an unsourced `[n]`) | **Reuse** |
| Long job → tray → push → deep link | `createRecord` → `notifyIfPending` → `broadcast` → `jobTray` | **Reuse; 3 registrations** |
| Fetch remote media → cache → serve from Nova's origin | `bookCovers.js` + `/api/library/cover` | **Reuse the pattern** |
| Find a video clip on a topic | `exerciseVideos.js` (yt-dlp, no API key) | **Reuse, generalise, add cache** |
| A panel that shows an image | — | **BUILD** |
| A panel that plays a clip | — | **BUILD** (nothing embeds video today) |
| Any image search at all | — | **BUILD** |
| A reader with headings/images, addressable by section | `ChatMarkdown` renders bold, links, bullets. Nothing else. | **BUILD** |
| Word-level audio alignment | — | **Not possible — see the constraint** |

---

## The one hard constraint, stated up front

**Sync is per SENTENCE, not per word, and that is a limit of the engines, not
a shortcut.** Neither TTS path returns alignment: ElevenLabs is called on the
plain endpoint, the local Kokoro sidecar returns raw WAV, and `ttsLocal.js`
runs an ffmpeg silence-trim on every utterance so a predicted timeline would
not match the rendered audio anyway. What *does* exist is better than a
timeline for this purpose: the client fetches one mp3 per sentence and fires
`onPlay` at the instant each one begins. That is an honest clock — it cannot
drift, because it is the audio itself reporting.

So: **the transcript highlights the sentence being spoken, and visuals change
on sentence boundaries.** Word-level karaoke would mean moving to
ElevenLabs `/with-timestamps` and threading alignment through the whole path;
it is a later option, not a launch requirement, and it buys very little for a
report being explained.

---

## The design

### 1. The ask — one sentence, no special syntax
A new `brief` lane in `intentRouter.js`. It fires on the shape he actually
uses: a research verb plus a synthesis verb (*"research X and write me a
report"*, *"look into X and explain it to me"*, *"break down X"*), or an
explicit *"brief me on X"*. It must not steal the plain Researcher — the
distinguishing feature is asking for a REPORT to come back, rather than an
answer now.

**The whole sentence is the spec.** "Make sure it is simply understood",
"define terminology I may not know", "focus on the training implications" are
not parameters to parse — they are handed to the composer verbatim as the
brief's *standing instruction*, and they shape every beat. Parsing them into
flags would lose exactly the nuance that makes the request his.

### 2. The work — fan out, then synthesise
Reuse `planner.js`'s shape rather than its plan-proposal UX (a briefing is
one intent, so it does not need his approval for its own sub-steps):

- **Decompose** (one cheap model call): the topic → 3–5 research angles.
  For the light example: the physics of wavelength; circadian/melanopsin
  biology; the evidence on morning light and cortisol; effects beyond
  sleep — mood, alertness, metabolism; the practical protocol and where the
  evidence thins.
- **Fan out**: those angles run through `startResearch` in parallel waves —
  each is separately cost-capped and separately citation-gated, so one bad
  angle cannot poison the report and an unsourced claim cannot survive.
- **Cross-check against his shelf**: `sourceShelf.js` is passed in, so the
  briefing knows what he already saved on the topic and can say where the
  podcast that prompted him agrees with the literature and where it does not.
  This is the honest-source rule from `lens.js`, applied at its most useful.
- **Compose**: one synthesis pass produces the report AND its beats in a
  single structured output — because the spoken script and the written
  document must not drift apart.

### 3. The artefact — one object, two ways to consume
```
{ title, standingInstruction, sections: [
    { heading, body,            // the document he reads
      beats: [ { say,           // one or two sentences, spoken
                 visual } ]     // what is on the glass while it is said
    } ],
  glossary: [{ term, plain }],  // his "define terminology" ask, structurally
  sources: [{ n, title, url }] }
```
`say` and `body` are written together from the same material — the document
is not a transcript of the audio and the audio is not a reading of the
document; each is right for its medium, and the transcript pane shows `say`.

**The glossary is not an appendix.** A term's plain-language definition
appears inline the first time it is used, and the spoken beat says it too.
That is what "define and re-explain terminology" actually means when someone
is listening rather than skimming.

### 4. The visuals — three kinds, all honest
- **Image** — sourced from Wikimedia Commons (no key, properly licensed,
  and genuinely strong for scientific diagrams: spectra, circadian curves,
  anatomy) and from the og:image of pages the research already cited and
  fetched. Every image carries its source and licence; a beat with no
  honest image gets a typographic card, never a decorative stock photo.
- **Clip** — yt-dlp search generalised from `exerciseVideos.js`, with the
  chapter-matching that already exists, so a clip starts at the relevant
  moment rather than at a two-hour video's beginning.
- **Card** — the existing `metric` / `bars` / `list` glass cards, for a
  number or a comparison.

Media is fetched and cached **before** playback begins, disk-cached like book
covers, and served from Nova's own origin. A briefing that buffers mid-sentence
is a briefing he stops using.

### 5. The playback
The Morning Show's loop, with a visual slot added:
`speakTtsSentence(beat.say, () => { showVisual(beat.visual); highlight(beat) })`.
Pause, resume, skip a section, and read-without-audio all come from the same
step list. Barge-in already works — talking to Nova stops the playback.

### 6. Getting it back
`kind: 'briefing'` on the existing rails: it shows in NOVA IS WORKING while
the agents run, pushes when ready, and the notification deep-links to the
briefing itself. It files to `Wiki/Sources/` like any other knowledge, so
every agent can read it afterwards — a briefing he asked for becomes part of
what the Coach and the Leader know.

---

## Build order

Each phase is usable on its own; nothing is a stub waiting on a later phase.

- **A — the spine.** The lane, the fan-out, the composer, the artefact, the
  record + notification, and a reader that plays it with voice, transcript and
  the existing glass cards. *This is the whole experience minus images and
  clips, and it is worth having on its own.*
- **B — images.** Wikimedia + cited-page og:image, the cache, the image panel.
- **C — clips.** Generalised yt-dlp search with caching, the inline player,
  chapter-accurate start times.
- **D — polish.** Section skip, resume where he left off, "explain that
  again" mid-playback, and the glossary term tap.

## Deliberately not doing

- **Word-level karaoke.** The engines cannot support it honestly today.
- **Generated images.** A diagram Nova invented, for a report meant to teach
  him something true, is the exact failure the lens exists to prevent.
- **Auto-playing on arrival.** He said *"I can choose when I am ready to view
  it"* — the notification opens the briefing, and he presses play.

---

## Status — 7 September 2026, end of the build

All four phases are built and live. One real briefing has been run end to
end on his light-wavelengths sentence (record `9b1d22a8`): 5 angles in
parallel, ~75 s of research, ~4 min wall-clock in all; 6 sections, 30 beats,
25 terms defined in plain words, 26 sources, two credited images, and a
summary that says outright where two of his own saved podcasts disagree.

**Verified on the shipped bundle, real vault, 375×812 and 1280×900:** the
deep link opens the reader; Listen/Read; Play → beats advance, the
transcript highlights and follows, the rail fills, the progress rule moves;
tapping a beat seeks; the Commons image renders from Nova's own cache with
caption and credit; the desktop two-column layout with the sticky stage;
resume-where-he-left-off across pages; "explain that again" pauses, hands
the exact beat to Nova as a grounded question, and Nova's answer is about
that beat. The failing first run (compose pass with no Read) and the
black-screen default export were both found by this run and fixed.

**Learned, for the next builder:**
- The compose pass must be able to READ the vault (his shelf is the
  cross-check) and must never reach the web; a tool-less pass announced it
  would read and then stopped.
- A lazy screen must be a NAMED export (`lazyScreen` resolves `m[name]`);
  a default export black-screens the whole app with no root error boundary.
- In the preview, a hash-only navigation never reloads the document —
  always `type: 'reload'` after a rebuild, and compare `document.scripts`
  to `dist/assets` before believing a screenshot.
- Commons returns foreign-labelled diagrams first for some queries; they
  now rank behind Latin-labelled ones.

**Not yet exercised:** a briefing that produces a clip (the compose pass
emitted no clip hints for this topic — "clip sparingly" held); the push
notification's tap on his phone (the deep link is verified in the browser).

**Next in this line (his wider vision):** the same stage grammar for the
*browser hand* — "open the Diary of a CEO channel", "find the most popular
video with Chris Williamson and Alex Hormozi" — shown live on the glass as
Nova does it, rather than reported afterwards. The screenshots the browse
lane already takes are the raw material; putting them on the stage as they
happen is the build.

**Update, 8 Sep 2026:** the browser-hand stage described above is BUILT
(cdf0845): streamed steps, windows on the glass via the stage's rail, the
media-shaped router rule on both server and client. Verified from the
composer on two real runs. Lessons in the `nova-verbs` memory.
