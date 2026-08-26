// AM I RUNNING THE CURRENT NOVA?
//
// The failsafe for the single most corrosive failure mode in this project:
// a fix ships, his device keeps serving the bundle it already had, and both
// of us end up arguing about whether a feature exists. It does; he just
// cannot see it. `registerType: 'autoUpdate'` fetches the new build in the
// background but the RUNNING app keeps its old JavaScript until a genuine
// reload — in an installed PWA that is never properly closed, that can be
// days.
//
// So: the build id is compiled in, the deployed build writes version.json
// beside the bundle, and this compares them. When they differ, Nova SAYS SO
// and one tap makes it current. No force-quitting, no guessing, and no more
// "I shipped it" / "it isn't there".

// injected by vite (define) — the id of the bundle actually executing
export const RUNNING_BUILD = typeof __NOVA_BUILD__ === 'string' ? __NOVA_BUILD__ : 'dev';

const VERSION_URL = `${import.meta.env.BASE_URL || '/'}version.json`;

// The deployed build id, read past every cache. A failure here is silence —
// being offline is not the same as being out of date, and claiming an update
// he cannot install would be its own lie.
export async function fetchDeployedBuild() {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.buildId === 'string' ? data.buildId : null;
  } catch { return null; }
}

export function isStale(running, deployed) {
  if (!deployed || !running) return false;
  if (running === 'dev') return false; // a dev server is never "behind"
  return running !== deployed;
}

// Take the update: drop the service worker and every cache, then hard-reload
// so the next boot can only come from the network. Unregistering alone is
// not enough — the caches outlive it and would serve the old chunks straight
// back.
export async function applyUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch { /* best-effort — the reload below is the part that matters */ }
  // cache-busted so even a stubborn HTTP cache cannot hand back the old shell
  const url = new URL(window.location.href);
  url.searchParams.set('nv', Date.now().toString(36));
  window.location.replace(url.toString());
}

// Poll for a new deploy. Deliberately unhurried — this is a safety net, not
// a feature, and it must never be a reason the app feels busy.
export function watchForUpdate(onStale, { intervalMs = 10 * 60_000 } = {}) {
  let stopped = false;
  const check = async () => {
    if (stopped) return;
    const deployed = await fetchDeployedBuild();
    if (isStale(RUNNING_BUILD, deployed)) onStale(deployed);
  };
  check();
  const timer = setInterval(check, intervalMs);
  // Coming back to a backgrounded PWA is the single most likely moment for
  // it to be behind — check then, every time.
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
