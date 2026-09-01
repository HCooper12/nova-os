# 47 — Voice (the station)

Audited 2026-08-31. Read-only. Files opened: `src/screens/Voice.jsx`
(1-220 line-by-line + ritual/brief wiring by grep; 220-445 rail panels
[mapped]), `server/lib/ttsLocal.js` (cache section — resolving [39]'s
open item), VoicePanels/Presence/WakeWord/useDictation [mapped]. The
server side of everything here was item 04's audit (the lane, reflex,
directives, cards, panels, spokenLog, sessions); this pass is the glass.
Phone-width: carried ([45]) — though see §3 on this screen's verification
culture.

## 1. What it is (verified)

The command centre (his 20-Aug ask: "the screen should read as a station,
not a chat page") — corner-bracketed panels, the core in a targeting
reticle, and the conversation machinery item 04 audited, rendered:

- **The comms log** continues across days (day separators, NEW CHAT,
  REMEMBER chips filing via the Inbox, streaming TypeText), and
  auto-scrolls to the newest line while "leaving him alone if he has
  deliberately scrolled up to read back" (103-116).
- **The glass takes the room**: a stage card blurs everything else — and
  the comment documents the recorded failure it fixes ("the whole screen
  blurred and spotlighted NOTHING. That is the blank blurred screen he
  recorded and had to tap out of") with the mobile card drawn inside the
  scrim where the spotlight belongs (158-190).
- **The brief's decision queue**: idx/total, spoken AND tappable yes/no
  (the comms log "is a control he cannot reach mid-brief"), and the
  question drawn beside its chart — another recorded failure fixed ("a
  man reading rather than listening had the picture and no idea what he
  was being asked").
- **Mobile ordering as doctrine**: the transcript goes LAST on a phone
  (order:3) because the default stacking "put an input he wasn't using"
  above what Nova was saying (196-203).
- **Turn-taking**: one gesture primes audio (iOS), interrupts speech,
  and opens the mic; conversation mode reopens the mic when Nova
  finishes; the reply window covers one-shot follow-ups; the screen
  reports its mic ownership up so the wake word never fights it (85-101,
  118-127). iOS dictation constraints documented (14-17).
- **Ritual invites** render as tap-to-start invitations, never
  interruptions (382-387) — the rituals doctrine, visible.
- **TTS**: ElevenLabs or the local sidecar; the local audio cache is
  BOUNDED (160 entries, insertion-ordered, with the
  don't-evict-what-you-just-warmed headroom reasoning) — **[39]'s open
  item resolved: no unbounded growth.**
- Honest states throughout: the caption state machine (LISTENING /
  READING THE VAULT… / SPEAKING / PAUSED / STANDING BY), the voice badge,
  demo-mode banner.

## 2. Current workflow, traced

Morning: the ☀ invitation chip waits (never auto-plays); he taps → the
Morning Show plays beat-by-beat with pre-warmed audio ([39]), each beat's
card on the glass; the close asks its decisions one at a time — spoken
"yes" or the visible buttons — with the question printed beside the
chart. Later: "Hey Nova" → the wake word yields to the screen mic → he
asks, the reply streams and speaks, a card lands on the glass, the reply
window reopens the mic for the follow-up.

Failure modes (surface): the incident-hardened list above IS the failure
catalogue — this screen's comments read as a changelog of real recorded
failures, each with its fix in place. Remaining, all owned elsewhere:
- **Reflex answers leave the glass dark** ([04] plan 5) — the fastest,
  most frequent answers are the ones with no card.
- **PWA session freshness has no guards** ([04] plan 3) — NEW CHAT is
  manual; deep context drifts for days.
- **`ritualDone` is per-device localStorage** — [10]'s suspected fourth
  once-a-day memory, CONFIRMED: the morning invitation can re-offer on a
  second device after being done on the first.

## 3. Pros — what genuinely works

- **This is the most incident-hardened UI in the platform** — five
  comments cite recorded real-world failures (the blank blur, the buried
  transcript, the unreadable question, the mic fight, the iOS unlock)
  with their fixes. The standing verify-visually memory rule has clearly
  operated here; the culture the audit checks for exists most strongly on
  this screen.
- **Spoken and visible are always twins** — every spoken decision has a
  tappable twin; every card restates speech; the question sits beside its
  chart. The show-what-it-says rule, structurally.
- **Invitation over interruption** for rituals and briefs.
- **Mic ownership as an explicit protocol** between screen, wake word,
  and conversation mode.

## 4. Cons and gaps (ranked)

1. **[04]'s three landings** (reflex cards, session guards, degraded-
   context chip) — the lane's fixes are this screen's biggest wins.
2. **ritualDone per-device** — fold into [10]'s server-side greet-state
   migration (same file, same fix).
3. Phone-width unmeasured THIS pass — though this screen's history shows
   it has been measured repeatedly in practice.

## 5. Mission test

**Daily: the companion made audible-visible** — the mission's tiebreaker
surface. The station framing, turn-taking, and glass discipline are why
talking to Nova feels like presence rather than a chat app; the morning
ritual + brief queue is the platform's front-door habit loop.

## 6. Improvement plan

1. **[Owned by 04] Reflex cards + session freshness + context chip.**
2. **[Owned by 10, extended] ritualDone joins the server-side
   delivered-state migration.**
3. **[Resolved] TTS cache** — no action; bounded and reasoned.

## 7. UI recommendations

- **None new** — the screen's own incident-driven refinement has already
  done what this section exists to do.

## 8. Verdict

**Keep as-is** — tenth clean keep; the platform's most battle-tested
surface, whose remaining gaps all belong to its server lane. Next action:
land [04]'s three fixes; this glass is where they'll be felt.
