# Ask Nova — voice Q&A over your vault

The Voice screen is live: speak (or type) a question, and Nova answers from
what's actually written in your vault — notes, health pages, workout
sessions, recipes, journal — plus today's live numbers (the same composition
the briefs use). The answering session is **read-only by construction**
(the same structural boundary as the Breaker: it cannot edit or write), and
it says plainly when the vault has nothing on a topic.

## Using it

- **🎙 ASK BY VOICE** — tap, speak, pause. The pause sends the question.
- Or type in the transcript box and hit Enter.
- **☰ BRIEF ME** — one tap for the full day brief, spoken.
- Answers are spoken aloud while the transcript shows the text. The SPEAK
  toggle in the left rail silences replies without stopping answers.
- Follow-ups work — the last few turns ride along ("what about last week?").

Answering takes a handful of seconds — it's genuinely reading your vault,
not pattern-matching. The orb spins fast while it works.

## Voices — ElevenLabs (optional, recommended)

Out of the box, replies use the browser's built-in speech engine (on iPhone
that's the Siri voice — decent, instant, free). For a genuinely good voice,
plug in ElevenLabs:

1. Create an account at elevenlabs.io (free tier includes ~10k characters a
   month; paid tiers are cheap). Browse their **Voice Library** and add any
   voice you like to your account — added voices become usable via the API.
2. Copy your API key (profile → API Keys).
3. Add to `server/.env` on the Mac (gitignored — the key never leaves the
   machine; the phone only ever talks to your Nova server):

   ```
   ELEVENLABS_API_KEY=<paste the key>
   ```

4. Reload: `launchctl kickstart -k gui/501/com.novaos.server`

The Voice screen's SPEECH ENGINE row flips from BROWSER to ELEVENLABS, and
a voice picker appears listing every voice on your account — pick one and
it sticks. Optional: pin a default server-side with
`ELEVENLABS_VOICE_ID=<voice id>`.

If ElevenLabs is ever unreachable (or the free tier runs out), replies fall
back to the browser engine for that utterance — spoken either way.

## Honest limits

- The voice line is read-only: ask it to change something and it will point
  you at the surface that does it (Inbox capture, To-Do, Train).
- The transcript is session-only — it isn't written to the vault.
- Dictation uses the browser's speech recognition (Safari/Chrome); the mic
  button only appears where that exists.
