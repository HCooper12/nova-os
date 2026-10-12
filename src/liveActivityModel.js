// WHAT GOES ON HIS LOCK SCREEN (12 Oct 2026, his ask: "real lock-screen Live
// Activities"). Pure: state in, plain data out, so the native shell's
// ActivityKit card and these tests read the same thing.
//
// Two kinds, each matching NovaActivityAttributes.ContentState in
// ios/App/App/NovaActivityAttributes.swift field for field (a shared format:
// change both or neither):
//   workout — the session he is DOING: sets done of total, the next lift, the
//             session clock, and the rest countdown. iOS ticks the clock and
//             the countdown itself, so both stay right with the phone locked
//             and Nova asleep.
//   job     — long work he started (a book read, an ingest, research): what is
//             running and since when, then "ready" when it lands.
//
// `sig` is what decides an update: only a change in what the card SHOWS is
// sent across the bridge (ActivityKit rate-limits updates). Never put the
// current time in it.

// A session he is doing: started, under six hours old, and either on the
// session screen or touched in the last 45 minutes. The second half is the
// Breaker's catch (13 Oct): the session-screen test alone ended the card the
// moment he glanced at a routine mid-workout, then started a new one when he
// came back. A draft restored from days ago was last touched days ago, so it
// still gets no card. `savedAt` is when the session last changed.
export const TOUCHED_WITHIN_MS = 45 * 60_000;
export function workoutLive({ ws, editing, view, rest, now, progress, hueOf, savedAt = null }) {
  if (!ws || editing || !Number.isFinite(ws.startedAt)) return null;
  if (now - ws.startedAt >= 6 * 3600_000) return null;
  const touched = Number.isFinite(savedAt) && now - savedAt < TOUCHED_WITHIN_MS;
  if (view !== 'session' && !touched) return null;
  const { done, total, next } = progress(ws);
  const resting = rest && Number.isFinite(rest.endsAt) && rest.endsAt > now && rest.total > 0;
  const state = {
    title: ws.routineName || 'Workout',
    detail: next ? `Next: ${next.name}` : total ? 'Every set done. Finish to log it' : 'No sets yet',
    done,
    total,
    hue: (next && hueOf(next.muscleGroup || next.name)) || null,
    startedAt: ws.startedAt,
    restEndsAt: resting ? rest.endsAt : null,
    restTotal: resting ? rest.total : null,
    finished: false,
  };
  return {
    key: `${ws.routineId || 'session'}:${ws.startedAt}`,
    state,
    sig: [state.title, state.detail, done, total, state.hue, state.restEndsAt].join('|'),
  };
}

// The tray's rows, reduced to one card. Running work wins; when nothing is
// running but something waits for him, the card says so instead of
// vanishing (that is the moment he would want to know). A failure is not a
// lock-screen event: it stays in the tray.
//
// "Ready" only for work this phone SAW RUNNING (`sawRunning`, ids collected by
// IslandFeed). The tray also lists staged jobs from any device and any day,
// and a fortnight-old proposal must not take his lock screen at every launch
// (the Breaker's catch, 13 Oct).
export function jobLive(jobs, sawRunning = null) {
  const list = Array.isArray(jobs) ? jobs : [];
  const running = list.filter((j) => !j.done && !j.failed);
  if (running.length) {
    const lead = running[0];
    const others = running.length - 1;
    const state = {
      title: lead.label || 'Working',
      detail: others ? `and ${others} more running` : (lead.note || 'Running'),
      startedAt: Number.isFinite(lead.startedAt) ? lead.startedAt : null,
      finished: false,
    };
    return { key: 'jobs', state, sig: ['run', state.title, state.detail, state.startedAt].join('|') };
  }
  const waiting = list.filter((j) => j.done && (!sawRunning || sawRunning.has(j.id)));
  if (waiting.length) {
    const state = {
      title: waiting.length === 1 ? (waiting[0].label || 'Ready for you') : `${waiting.length} things ready for you`,
      detail: 'Open Nova to review',
      startedAt: null,
      finished: true,
    };
    return { key: 'jobs', state, sig: ['done', state.title].join('|') };
  }
  return null;
}
