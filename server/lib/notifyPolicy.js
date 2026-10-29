// WHAT IS WORTH INTERRUPTING HIM FOR (29 Oct 2026). His words: "The amount of
// notifications are also overwhelming and clutter my phone or screen.
// Evaluate what is worth a notification and not worth it."
//
// Measured before this file (server log, 22-28 Oct): about 120 pushes in a
// week, 17 a day. 41 were "Waiting for review" (every new Inbox draft pushed
// at creation, many auto-filed before he could look), 15 "Brief ready", 7
// "Food suggestion", 7 "Daily Review", 4 "Session receipt", 3 "Training
// check": nearly all of it Nova announcing work it chose to do itself. Nova
// keeps ~154 drafts a month and he keeps 9 (memory nova-produce-vs-keep), so a
// push per draft was a push per thing he mostly did not want.
//
// THE RULE. A push interrupts him, so it goes out only when one of these is
// true; everything else lands in the Inbox and on Home, where he finds it on
// his own time (banner blindness: state lives in the feed, not on top of it).
//   1. HE ASKED, AND IT FINISHED WHILE HE WAS AWAY: research he asked for, a
//      link or video he shared, a briefing he asked for, Nova's answer.
//   2. TIME-BOUND AND ONLY HE CAN ACT: his own reminders, a session he is in.
//   3. SOMETHING IS BROKEN AND WILL COST HIM: the Guardian's alert, a ledger
//      import that failed.
// Pure: the record or the push in, a verdict and the reason out.

// Inbox kinds that may push, each with why
const RECORD_PUSH = {
  research: 'research he asked for',
  briefing: 'a briefing he asked for',
  video: 'a video he shared',
  'recipe-video': 'a recipe he shared',
  ingest: 'a link he shared',
  guardian: 'something is broken',
};

// where a record came from when HE started it, not Nova
const HIS_SOURCES = new Set(['capture', 'voice', 'telegram', 'share', 'siri', 'watcher', 'nova']);

/** Should this new Inbox record push? { push, why }. */
export function recordPush(record) {
  if (!record || record.status !== 'pending') return { push: false, why: 'not waiting on him' };
  const why = RECORD_PUSH[record.kind];
  if (!why) return { push: false, why: `${record.kind || 'a draft'} Nova started: Inbox only` };
  // research an agent asked for mid-answer: the answer already reached him
  if (record.askedBy === 'agent') return { push: false, why: 'an agent asked for it: the answer already reached him' };
  if ((record.kind === 'ingest' || record.kind === 'video' || record.kind === 'recipe-video') && record.source && !HIS_SOURCES.has(record.source)) {
    return { push: false, why: 'a read Nova started itself' };
  }
  return { push: true, why };
}

// Direct pushes by `kind` (lib/push.js sendPush takes it). Unknown kinds
// push, so a sender this file has never heard of is not silenced by accident.
const QUIET_KINDS = {
  'daily-review': 'a daily habit card: Home holds it in its window',
  dispatch: 'overnight work Nova chose: Inbox only',
  'weekly-debrief': 'a weekly report: Inbox only',
  'plan-today': 'the day plan: Home holds it',
  'fuel-review': 'a weekly review: Inbox only',
  'model-watch': 'a model note: Settings shows it',
  'compose-failed': 'a report that could not compose: the Inbox says so',
};

/** Should a direct push of this kind go out? { push, why }. */
export function kindPush(kind) {
  if (!kind) return { push: true, why: 'no kind given' };
  const why = QUIET_KINDS[kind];
  return why ? { push: false, why } : { push: true, why: kind };
}
