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

const listeners = new Set();
let seq = 0;

export function notify(notice) {
  seq += 1;
  const msg = { type: 'notify', notice, seq };
  listeners.forEach((fn) => fn(msg));
}

export function dismissIsland(id) {
  listeners.forEach((fn) => fn({ type: 'dismiss', id }));
}

export function subscribeIsland(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
