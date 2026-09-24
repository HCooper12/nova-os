import { useEffect, useRef } from 'react';
import { notify, dismissIsland, setActivity } from './island.js';

// What the app is doing, handed to the island as Live Activities (25 Sep 2026,
// his ask). It renders nothing. The view model (valsChrome `island`) decides
// WHAT is live — a workout off the Train screen, Nova talking off the Voice
// screen, the current nudge — and this pushes each one to the island store
// only when its signature changes, so App re-rendering sixty times a second
// costs the island nothing.
//
// It also owns the two side effects that follow from a live activity:
//   - a NEW nudge drops out of the island once, as a card, then lives on as a
//     small bubble beside it until he acts on it or it stops being true;
//   - a live workout checks in with the Mac (the pocket), so that if he leaves
//     Nova mid-session, ONE lock-screen notification offers the way back.

function useActivity(kind, act) {
  const sig = act ? `${act.sig}` : null;
  const ref = useRef(act);
  ref.current = act;
  useEffect(() => {
    setActivity(kind, ref.current || null);
  }, [kind, sig]);
  useEffect(() => () => setActivity(kind, null), [kind]);
}

export function IslandFeed({ feed, app }) {
  const f = feed || {};
  useActivity('workout', f.workout);
  useActivity('speaking', f.speaking);
  useActivity('nudge', f.nudge);

  // a nudge announces itself ONCE per key, then waits in the bubble
  const announced = useRef(new Set());
  const nudgeKey = f.nudge?.key || null;
  const nudgeRef = useRef(f.nudge);
  nudgeRef.current = f.nudge;
  useEffect(() => {
    if (!nudgeKey) return undefined;
    if (!announced.current.has(nudgeKey)) {
      announced.current.add(nudgeKey);
      const n = nudgeRef.current;
      const card = typeof n?.expanded === 'function' ? n.expanded() : n?.expanded;
      if (card) notify(card);
    }
    // when this nudge stops being true, its card must not linger
    return () => dismissIsland(`nudge:${nudgeKey}`);
  }, [nudgeKey]);

  // THE POCKET: while a workout is live and Nova is on screen, check in every
  // 15s. The server fires one notification only when the check-ins stop.
  const pocketKey = f.pocket?.key || null;
  const pocketRef = useRef(f.pocket);
  pocketRef.current = f.pocket;
  useEffect(() => {
    if (!pocketKey || !app) return undefined;
    const ping = () => {
      if (document.visibilityState === 'visible' && pocketRef.current) app.pocketPing(pocketRef.current);
    };
    ping();
    const t = setInterval(ping, 15_000);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', ping);
      app.pocketDone(pocketKey);
    };
  }, [pocketKey, app]);

  return null;
}
