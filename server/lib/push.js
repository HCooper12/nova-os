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
export async function sendPush({ title, body, tag, url }) {
  await getVapid();
  const subs = await loadSubs();
  if (!subs.length) return { sent: 0 };
  const payload = JSON.stringify({ title: title || 'Nova', body: body || '', tag: tag || 'nova', url: url || './#/inbox' });
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
  return { sent };
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
    'training-check': 'Training check', 'food-suggestion': 'Food suggestion', calendar: 'Calendar change', compost: 'Vault hygiene', 'week-plan': 'Week plan',
  };
  const label = KIND_LABEL[record.kind] || 'Waiting for review';
  sendPush({ title: `${label} — Nova`, body: record.text || 'A draft is waiting in your Inbox.', tag: `record-${record.id}` }).catch(() => {});
}
