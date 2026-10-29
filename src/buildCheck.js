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

const VERSION_URL = `${import.meta.env?.BASE_URL || '/'}version.json`;

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
// 22 SEP, HIS REPORT: "the update button never seems to push the update
// straight away whenever I press it… nothing has happened. If I don't press
// the update button but I'm still navigating across nova then the page will
// reload automatically with the update in place, so it feels like the update
// notification is there for more of a visual reference."
//
// He was right, and the cause was here. Every line of cleanup was AWAITED
// before the reload, so the one thing that actually matters — the reload —
// sat behind promises that can simply never settle on iOS: getRegistrations()
// and caches.delete() in an installed PWA, under a service worker that is
// mid-update and holding its own locks. The cleanup hung, the reload was
// never reached, and the banner sat there looking like a picture of a button.
// That the app DID update later on its own is the same fact from the other
// side: the service worker's own flow was working the whole time; only the
// tap was stuck behind it.
//
// The fix that followed (reload within 1.2 s whatever the cleanup was doing)
// made the tap move. It did not make it work, which is the next report.
//
// 29 OCT, HIS REPORT: "I will press it about three different times and reload
// the app but it keeps wanting me to press the button until it eventually
// seems to restart and update itself."
//
// The 1.2 s race was the cause this time. The banner nearly always appears
// while the new service worker is installing: bringing Nova to the front
// fires main.jsx's reg.update() and the version.json poll together.
// Service-worker jobs run one at a time, so the unregister() in the cleanup
// queued behind that install (85 files, ~6.8 MB) and took far longer
// than 1.2 s on a phone. The guard reloaded while the OLD worker still
// controlled the page, navigateFallback served the OLD precached index.html,
// and he was back on the same build looking at the same banner. Every tap
// repeated that until the install finished by itself, the new worker took
// the page (skipWaiting + clientsClaim) and main.jsx's controllerchange
// reload brought the new build: the "eventually restarts itself".
//
// So the tap now rides the service worker's own path instead of racing it:
// ask for the update, wait for the new worker to take control, then reload,
// which can only boot the new build. Only when there is no worker, nothing
// new to install, or it never takes over, does it clear everything and
// reload from the network. The banner says which step it is on, and an
// attempt is remembered per build so a reload that still lands on the old
// one finishes the job by itself instead of asking him again.
// How long to wait for the new worker. While one is visibly installing the
// wait goes on, up to INSTALL_CAP_MS: measured in a two-build run in Chrome,
// a reload sent while the install was still going came up on the OLD build
// again (the very bug), so giving up early only repeats it.
export const SWITCH_BY_MS = 15_000;
export const INSTALL_CAP_MS = 120_000;
export const CLEAR_BY_MS = 5000;    // the fallback's cleanup is still time-boxed

const TIMEOUT = Symbol('timeout');
// a promise, or TIMEOUT after ms (never a stray timer left behind)
function within(promise, ms) {
  let t;
  const late = new Promise((resolve) => { t = setTimeout(() => resolve(TIMEOUT), ms); });
  return Promise.race([Promise.resolve(promise), late]).finally(() => clearTimeout(t));
}

function hardReload() {
  // cache-busted so even a stubborn HTTP cache cannot hand back the old shell
  const url = new URL(window.location.href);
  url.searchParams.set('nv', Date.now().toString(36));
  window.location.replace(url.toString());
}

async function dropCaches() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
  }
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
  }
}

// Ask the service worker for the new build and wait until it controls the
// page. true = the new worker is in charge, so a reload boots the new build.
// false = there was nothing to wait for, or it did not arrive in time.
export async function switchWorker(sw, timeoutMs = SWITCH_BY_MS, installCapMs = INSTALL_CAP_MS) {
  if (!sw || !sw.controller) return false; // no worker: a plain reload is already fresh
  const reg = await within(sw.getRegistration().catch(() => null), 3000);
  if (!reg || reg === TIMEOUT) return false;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sw.removeEventListener('controllerchange', onChange);
      resolve(ok);
    };
    const onChange = () => finish(true);
    // at the deadline, a worker still installing earns more time (to the cap)
    const giveUpAt = Date.now() + installCapMs;
    const deadline = () => {
      if (reg.installing && Date.now() < giveUpAt) timer = setTimeout(deadline, 1000);
      else finish(false);
    };
    let timer = setTimeout(deadline, timeoutMs);
    sw.addEventListener('controllerchange', onChange);
    // a worker already installed and waiting only needs the word
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    // update() settles once any install already running has finished; if by
    // then no new worker is installing or waiting, the server's worker is the
    // one already running and waiting longer would only waste his time
    const nothingNew = () => { if (!reg.installing && !reg.waiting) finish(false); };
    Promise.resolve().then(() => reg.update()).then(nothingNew, nothingNew);
  });
}

// One record: the build he last tried to move to, how many times, and when.
// Kept in localStorage because the whole point is to survive the reload.
const ATTEMPT_KEY = 'nova.updateAttempt';
const ATTEMPT_FRESH_MS = 30 * 60_000;

function defaultStorage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

// How many times this session of tries has already reached for `target`.
// A stale record (another build, or older than half an hour) counts as none.
export function attemptsFor(target, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!target || !storage) return 0;
  try {
    const rec = JSON.parse(storage.getItem(ATTEMPT_KEY) || 'null');
    if (!rec || rec.target !== target || now - rec.at > ATTEMPT_FRESH_MS) return 0;
    return Number(rec.tries) || 0;
  } catch { return 0; }
}

function noteAttempt(target, storage, now) {
  if (!target || !storage) return;
  try {
    const tries = attemptsFor(target, { storage, now }) + 1;
    storage.setItem(ATTEMPT_KEY, JSON.stringify({ target, tries, at: now }));
  } catch { /* storage refused: the update still runs, it just cannot count */ }
}

export function clearAttempt(storage = defaultStorage()) {
  try { storage?.removeItem(ATTEMPT_KEY); } catch { /* nothing to clear */ }
}

// The tap. `onStage` hears 'downloading' (waiting on the new worker) and
// 'clearing' (the network fallback) so the banner can say which is happening.
export async function applyUpdate({
  target = null,
  sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  reload = hardReload,
  clear = dropCaches,
  storage = defaultStorage(),
  onStage = () => {},
  switchByMs = SWITCH_BY_MS,
  installCapMs = INSTALL_CAP_MS,
  clearByMs = CLEAR_BY_MS,
  now = Date.now(),
} = {}) {
  noteAttempt(target, storage, now);
  if (sw && sw.controller) {
    onStage('downloading');
    if (await switchWorker(sw, switchByMs, installCapMs)) { reload(); return 'worker'; }
  }
  onStage('clearing');
  await within(Promise.resolve().then(clear).catch(() => {}), clearByMs);
  reload();
  return 'network';
}

// Poll for a new deploy. Deliberately unhurried — this is a safety net, not
// a feature, and it must never be a reason the app feels busy.
export function watchForUpdate(onStale, { intervalMs = 10 * 60_000 } = {}) {
  let stopped = false;
  const check = async () => {
    if (stopped) return;
    const deployed = await fetchDeployedBuild();
    if (isStale(RUNNING_BUILD, deployed)) onStale(deployed);
    // the build he reached for is the one running: the attempt is done
    else if (deployed && deployed === RUNNING_BUILD) clearAttempt();
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
