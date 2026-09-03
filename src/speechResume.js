// What Nova still had to say when he walked away — and whether it survived.
//
// He pressed BRIEF ME, left the app mid-sentence, came back, and the rest of
// the brief was simply gone: no words, no bar, nothing to tap. The replay bar
// already existed but only armed when the browser REFUSED to play (autoplay
// blocked); speech that started and was then killed left no trace at all.
//
// The hard part is that we cannot know from JS whether iOS kept the audio
// running while the app was backgrounded — it depends on the device, the
// audio session, and whether anything else claimed the speakers. So nothing
// here assumes: it MEASURES. Snapshot what is unspoken on the way out,
// snapshot again on the way back, and let the two answer the question.
//
// Pure and separately testable for the same reason swipeCore.js is: the
// failure it prevents is silent, so it must be pinned by a test that runs on
// every `npm test` rather than by a device check someone remembers to redo.

// The sentence in the air plus every sentence still queued behind it.
// Queue entries carrying only a `finalize` barrier are not speech and are
// deliberately skipped — replaying them would re-fire a reply's commit.
export function unspokenTexts(nowSaying, queue = []) {
  const out = [];
  if (nowSaying) out.push(nowSaying);
  for (const e of queue || []) if (e && e.said) out.push(e.said);
  return out;
}

// Compare the two snapshots.
//   'none'        — nothing was left to say, or it all played out while away
//   'progressing' — the queue moved, or new speech started: audio survived,
//                   so leave it alone. Interrupting live speech with a bar
//                   offering to replay it would be worse than the bug.
//   'stalled'     — not one word advanced. The platform killed the audio
//                   mid-brief; those words are owed to him.
export function resumeVerdict(before = [], after = []) {
  if (!before.length || !after.length) return 'none';
  if (after.length !== before.length) return 'progressing';
  // Same depth can still be a different queue — a brief that finished and a
  // fresh reply that queued just as many lines is new speech, not a stall.
  if (after[0] !== before[0]) return 'progressing';
  return 'stalled';
}
