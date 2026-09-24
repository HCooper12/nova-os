// The island's mailbox. Anything in Nova can post to it; only DynamicIsland
// listens. It lives outside React state on purpose: a toast used to be a
// setState on App, which re-rendered the WHOLE app (nova-ui-performance) for
// three and a half seconds of words. Now a notification costs one small
// component.
//
//   notify('Saved to the vault')                       — a toast; tone is read
//   notify({ title, message, tone, duration, onPress,  — anything richer
//            action: { label, run }, id, serif })
//   dismissIsland(id?)                                 — take it away (any, or
//                                                        only if it is `id`)
//   setActivity(kind, activity | null)                 — a resident Live-
//        Activity-style readout: { lead, trail, expanded } (see DynamicIsland)

const listeners = new Set();
let seq = 0;

// A notice posted before the island has mounted (a nudge restored with the
// app, a toast from the constructor) waits here instead of going to nobody —
// the review that found it: the first nudge was marked announced, sent to
// zero listeners, and never dropped at all.
const early = [];
const EARLY_MAX = 5;

export function notify(notice) {
  seq += 1;
  const msg = { type: 'notify', notice, seq };
  if (!listeners.size) {
    early.push(msg);
    if (early.length > EARLY_MAX) early.shift();
    return;
  }
  listeners.forEach((fn) => fn(msg));
}

export function dismissIsland(id) {
  if (!listeners.size) {
    for (let i = early.length - 1; i >= 0; i -= 1) {
      const n = early[i].notice;
      if (!id || (n && typeof n === 'object' && n.id === id)) early.splice(i, 1);
    }
    return;
  }
  listeners.forEach((fn) => fn({ type: 'dismiss', id }));
}

// The latest activity per kind, kept here so the island can read what was
// already live when it mounted.
const activities = {};

export function setActivity(kind, activity) {
  activities[kind] = activity || null;
  listeners.forEach((fn) => fn({ type: 'activity', kind, activity: activity || null }));
}

export function currentActivities() {
  return { ...activities };
}

export function subscribeIsland(fn) {
  listeners.add(fn);
  while (early.length) fn(early.shift());
  return () => listeners.delete(fn);
}
