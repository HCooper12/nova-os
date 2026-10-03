import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

// Real notifications: Web Push to the installed PWA. iOS (16.4+) delivers
// these to the lock screen like any app's, and the phone mirrors them to
// the Apple Watch automatically — no App Store, no native wrapper. VAPID
// keys are generated once and kept in the data dir; subscriptions are
// per-device and pruned when an endpoint dies.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const KEYS_PATH = () => path.join(dataRoot(), 'push-keys.json');
const SUBS_PATH = () => path.join(dataRoot(), 'push.json');

let vapid = null;

async function getVapid() {
  if (vapid) return vapid;
  if (existsSync(KEYS_PATH())) {
    try {
      vapid = JSON.parse(await readFile(KEYS_PATH(), 'utf8'));
    } catch { /* regenerate below */ }
  }
  if (!vapid?.publicKey) {
    vapid = webpush.generateVAPIDKeys();
    await mkdir(dataRoot(), { recursive: true });
    await writeFile(KEYS_PATH(), JSON.stringify(vapid, null, 2), 'utf8');
  }
  webpush.setVapidDetails('mailto:haydencooper@outlook.com', vapid.publicKey, vapid.privateKey);
  return vapid;
}

export async function getPublicKey() {
  return (await getVapid()).publicKey;
}

async function loadSubs() {
  if (!existsSync(SUBS_PATH())) return [];
  try {
    const raw = JSON.parse(await readFile(SUBS_PATH(), 'utf8'));
    return Array.isArray(raw.subscriptions) ? raw.subscriptions : [];
  } catch {
    return [];
  }
}

async function saveSubs(subscriptions) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = SUBS_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify({ subscriptions }, null, 2), 'utf8');
  await rename(tmp, SUBS_PATH());
}

export async function addSubscription(subscription) {
  if (!subscription?.endpoint || !subscription?.keys) throw new Error('not a push subscription');
  const subs = await loadSubs();
  if (!subs.some((s) => s.endpoint === subscription.endpoint)) {
    subs.push({ ...subscription, addedAt: new Date().toISOString() });
    await saveSubs(subs);
  }
  return { count: subs.length };
}

export async function subscriptionCount() {
  return (await loadSubs()).length;
}

// Fire-and-forget to every registered device; dead endpoints (410/404 —
// the user removed the app or revoked permission) are pruned quietly.
//
// QUIET HOURS (his call, 3 Oct 2026: "Yes notifications respect quiet
// hours"). Every push asks lib/quietHours.js first: inside his window (his
// Melbourne time) it is HELD, not sent, and the answer says so
// ({ sent: 0, held: true, deliverAt }); when the window ends the held pushes
// go as one (several become one combined push). `urgent: true` goes through
// the window; nothing passes it today.
export async function sendPush({ title, body, tag, url, urgent = false } = {}) {
  const note = { title: title || 'Nova', body: body || '', tag: tag || 'nova', url: url || './#/inbox' };
  const at = clock();
  if (!urgent) {
    const { getQuietHours, inQuietHours, quietEndsAt } = await import('./quietHours.js');
    const prefs = getQuietHours();
    if (inQuietHours(prefs, at)) {
      const deliverAt = quietEndsAt(prefs, at);
      const held = await holdPush(note, at);
      scheduleFlush(deliverAt);
      console.log(`push held for quiet hours (${held} waiting, delivery ${new Date(deliverAt).toISOString()}) — ${note.title}`);
      return { sent: 0, held: true, deliverAt: new Date(deliverAt).toISOString(), waiting: held };
    }
  }
  // the window has ended (or is off): anything still held goes first, so the
  // order on his lock screen is the order things happened
  await flushHeldPushes();
  return deliver(note);
}

// The send itself, past every rule. Tests replace it (never a real device).
async function deliver(note) {
  if (transport) return transport(note);
  await getVapid();
  const subs = await loadSubs();
  if (!subs.length) return { sent: 0 };
  const payload = JSON.stringify(note);
  let sent = 0;
  const alive = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 3600 });
      alive.push(sub);
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) continue; // pruned
      alive.push(sub); // transient failure — keep the device
    }
  }
  if (alive.length !== subs.length) await saveSubs(alive);
  // a receipt in the log — "did the notification go?" was unanswerable before
  console.log(`push ${sent}/${subs.length} — ${note.title}${note.url ? ` → ${note.url}` : ''}`);
  return { sent };
}

/* ------------------------------ the held queue ----------------------------- */

const HELD_PATH = () => path.join(dataRoot(), 'push-held.json');
let transport = null;
let clock = () => Date.now();
let flushTimer = null;
let flushAt = null;
let chain = Promise.resolve(); // one writer at a time on the held file

/** Tests only: replace the device send (and the clock); null restores both. */
export function _setPushTransportForTests(fn, { now = null } = {}) {
  transport = fn || null;
  clock = now || (() => Date.now());
  if (!fn) cancelFlush();
}

const locked = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

async function loadHeld() {
  if (!existsSync(HELD_PATH())) return [];
  try {
    const raw = JSON.parse(await readFile(HELD_PATH(), 'utf8'));
    return Array.isArray(raw.held) ? raw.held : [];
  } catch {
    return [];
  }
}
async function saveHeld(held) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = HELD_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify({ held }, null, 2), 'utf8');
  await rename(tmp, HELD_PATH());
}

// One push into the queue. A newer push with the same tag replaces the older
// one (the phone would have replaced it on the lock screen anyway).
function holdPush(note, at) {
  return locked(async () => {
    const held = (await loadHeld()).filter((h) => h.tag !== note.tag);
    held.push({ ...note, heldAt: new Date(at).toISOString() });
    await saveHeld(held);
    return held.length;
  });
}

export async function heldPushes() { return loadHeld(); }

// What several held pushes become: ONE notification that names how many and
// what they were, opening the Inbox (or the one screen they all point at).
export function combinePushes(held) {
  if (held.length === 1) {
    const { heldAt: _heldAt, ...note } = held[0];
    return note;
  }
  const titles = held.map((h) => String(h.title || 'Nova').replace(/\s+—\s+Nova$/, '').trim());
  let body = titles.join(' · ');
  if (body.length > 220) body = `${body.slice(0, 219).replace(/\s+\S*$/, '')}…`;
  const urls = [...new Set(held.map((h) => h.url || './#/inbox'))];
  return {
    title: `Nova — ${held.length} held during quiet hours`,
    body,
    tag: 'quiet-hours',
    url: urls.length === 1 ? urls[0] : './#/inbox',
  };
}

// Deliver whatever is held, as one push, when the window is over. Inside the
// window it does nothing (a timer that fired early, a boot at 3am).
export async function flushHeldPushes() {
  const { getQuietHours, inQuietHours, quietEndsAt } = await import('./quietHours.js');
  const prefs = getQuietHours();
  const at = clock();
  if (inQuietHours(prefs, at)) {
    if ((await loadHeld()).length) scheduleFlush(quietEndsAt(prefs, at));
    return { sent: 0, held: true };
  }
  const held = await locked(async () => {
    const h = await loadHeld();
    if (h.length) await saveHeld([]);
    return h;
  });
  if (!held.length) return { sent: 0, delivered: 0 };
  cancelFlush();
  try {
    const out = await deliver(combinePushes(held));
    return { ...out, delivered: held.length };
  } catch (e) {
    // a failed send puts them back rather than losing them
    await locked(async () => saveHeld([...held, ...(await loadHeld())]));
    throw e;
  }
}

function cancelFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  flushAt = null;
}

function scheduleFlush(atMs) {
  if (transport) return; // tests drive the flush themselves, with their own clock
  if (flushTimer && flushAt === atMs) return;
  cancelFlush();
  flushAt = atMs;
  // a minute's grace past the end, so the check lands outside the window
  flushTimer = setTimeout(() => { flushTimer = null; flushHeldPushes().catch((e) => console.log(`held push delivery failed: ${e.message}`)); }, Math.max(0, atMs - Date.now()) + 1000);
  flushTimer.unref?.();
}

// At boot: anything held before a restart is delivered now (the window is
// over) or scheduled for the end of it.
export async function resumeHeldPushes() {
  if (!(await loadHeld()).length) return { waiting: 0 };
  const out = await flushHeldPushes();
  return { waiting: out.held ? (await loadHeld()).length : 0, ...out };
}

// The taste filter: pushes go out for things WAITING ON HAYDEN, not for
// everything that happens. One per record, at creation.
export function pushForRecord(record) {
  if (!record || record.status !== 'pending') return;
  // followup records transit 'pending' for milliseconds on their way to filed —
  // the record IS the user's own tap; pushing about it was a stray notification
  if (record.kind === 'followup') return;
  const KIND_LABEL = {
    review: 'Daily Review', dispatch: 'Brief ready', 'meal-prep': 'Meal prep', cfo: 'CFO report', guardian: 'Guardian',
    research: 'Research brief', studio: 'Studio outline', 'money-import': 'Ledger import', coach: 'Session receipt',
    // the daily-driver kinds must name themselves, not say "Waiting for review"
    briefing: 'Your briefing is ready',
    'training-check': 'Training check', 'food-suggestion': 'Food suggestion', calendar: 'Calendar change', compost: 'Vault hygiene', 'week-plan': 'Week plan', 'plan-today': 'Plan today', 'weekly-debrief': 'Weekly debrief', pattern: 'Pattern noticed', autonomy: 'Trust ladder', distill: 'Distillation ready',
  };
  const label = KIND_LABEL[record.kind] || 'Waiting for review';
  // a briefing opens ITSELF, not the inbox list — the tap is "read it now"
  const url = record.kind === 'briefing' ? `./#/briefing?id=${record.id}` : undefined;
  sendPush({ title: `${label} — Nova`, body: record.kind === 'briefing' ? (record.decision?.title || record.text) : (record.text || 'A draft is waiting in your Inbox.'), tag: `record-${record.id}`, url }).catch(() => {});
}
