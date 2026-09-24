// THE POCKET — the nearest a web app can get to a Live Activity.
//
// His ask, 25 Sep 2026: see the workout in the Dynamic Island when he is NOT
// in Nova, and tap it to jump straight back in. The real thing is ActivityKit,
// which needs a native app (the Capacitor shell, blocked on Xcode). What a
// web app CAN do is a notification — it sits on the lock screen and in
// Notification Center, and tapping it opens Nova where he left off.
//
// WHY A DEAD-MAN'S SWITCH, NOT A "HE LEFT" MESSAGE. iOS freezes a
// backgrounded web app within moments; a request sent as he leaves may never
// leave the phone. So the phone does the opposite: while a workout is live and
// Nova is on screen it checks in every ~15s, and the server fires only when
// the check-ins STOP for `grace`. That is robust to exactly the thing that
// would break the other design — the page being frozen or killed.
//
// ONE PER WORKOUT. He switches to his music between sets and locks the phone
// on the bench; a push every time would be a push every set. The first
// silence of a session sends the one notification; it stays on the lock screen
// until he taps it, and the page closes it when the workout ends.

export const POCKET_GRACE_MS = 45_000;
// A workout draft can live a week; the one-notification promise must too.
const SENT_TTL_MS = 7 * 24 * 60 * 60_000;
// Only Nova's own screens, only Nova's own tags — the service worker navigates
// to this url when he taps, so it is never whatever a request body says.
const SAFE_URL = /^\.\/#\/[a-z-]{1,24}$/;
const SAFE_TAG = /^[a-z0-9-]{1,40}$/;

export function createPocket({
  send,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  grace = POCKET_GRACE_MS,
} = {}) {
  let armed = null;          // { key, title, body, url, tag, timer }
  const sent = new Map();    // key → when its one notification went
  // A ping already in flight when he tapped Finish lands AFTER the disarm;
  // without this it would re-arm a finished workout (review #7).
  const ended = new Map();   // key → when it was disarmed

  const prune = () => {
    const cut = now() - SENT_TTL_MS;
    for (const [k, at] of sent) if (at < cut) sent.delete(k);
    for (const [k, at] of ended) if (at < cut) ended.delete(k);
  };
  const clear = () => {
    if (armed?.timer) clearTimer(armed.timer);
    if (armed) armed.timer = null;
  };
  const fire = () => {
    if (!armed || sent.has(armed.key)) return;
    const { key, title, body, url, tag } = armed;
    armed.timer = null;
    sent.set(key, now());
    Promise.resolve()
      .then(() => send({ title, body, url, tag }))
      .catch(() => { /* a failed push is logged by sendPush; nothing to retry into */ });
  };

  return {
    // Arm, or keep armed. The latest words win, so the notification says how
    // far he actually got, not how far he was when the session started.
    ping({ key, title, body, url = './#/workouts', tag = 'pocket-workout' } = {}) {
      if (!key || !title) throw new Error('pocket: key and title are required');
      if (!SAFE_URL.test(url)) throw new Error('pocket: url must be one of Nova\'s own screens');
      if (!SAFE_TAG.test(tag)) throw new Error('pocket: bad tag');
      prune();
      if (ended.has(key)) return { armed: false, ended: true };
      if (armed && armed.key !== key) clear();
      armed = { ...(armed?.key === key ? armed : {}), key, title: String(title).slice(0, 120), body: String(body || '').slice(0, 240), url, tag };
      clear();
      if (!sent.has(key)) armed.timer = setTimer(fire, grace);
      return { armed: true, sent: sent.has(key) };
    },
    // Stop watching. `ended` means the workout is over (finished, discarded):
    // a late ping for it is then ignored. A PARKED workout disarms without it,
    // so resuming it later can still earn its one notification.
    disarm(key, { ended: over = false } = {}) {
      if (key && over) ended.set(key, now());
      if (!armed || (key && armed.key !== key)) return { armed: !!armed };
      clear();
      armed = null;
      return { armed: false };
    },
    state() {
      return { armed: !!armed, key: armed?.key || null, pending: !!armed?.timer, sent: armed ? sent.has(armed.key) : false };
    },
  };
}
