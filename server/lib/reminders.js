import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Reminders — the lowest-friction promise Nova can keep. "Remind me at 4pm
// to call the bank" rides the capture rails like any thought; filing creates
// BOTH a local nudge (push + Telegram when due) and, credentials permitting,
// a real VTODO with an alarm in his iCloud Reminders — so the phone, watch
// and HomePod all fire natively even while this Mac sleeps. The iCloud write
// is best-effort by design: no credentials or a CalDAV hiccup degrade to the
// local nudge, never to silence, and the record says which happened.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = () => path.join(dataRoot(), 'reminders.json');

let lock = Promise.resolve();
function withLock(fn) {
  const run = lock.catch(() => {}).then(fn);
  lock = run.catch(() => {});
  return run;
}

async function loadStore() {
  if (!existsSync(STORE_PATH())) return { items: [] };
  try { return JSON.parse(await readFile(STORE_PATH(), 'utf8')); } catch { return { items: [] }; }
}
async function saveStore(store) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = STORE_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await rename(tmp, STORE_PATH());
}

export async function listReminders() {
  const { items } = await loadStore();
  return [...items].sort((a, b) => (a.when < b.when ? -1 : 1));
}

/* --------------------------- iCloud Reminders ---------------------------- */

function icloudConfigured() {
  return !!(process.env.ICLOUD_USERNAME && process.env.ICLOUD_APP_PASSWORD);
}

let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    clientPromise = import('tsdav').then(({ createDAVClient }) => createDAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username: process.env.ICLOUD_USERNAME, password: process.env.ICLOUD_APP_PASSWORD },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    }));
  }
  return clientPromise;
}

// The VTODO-capable collection reminders land in. Apple exposes Reminders
// lists as CalDAV calendars whose supported components include VTODO; the
// first match is cached per-process (the account shape doesn't churn).
let todoCalendarPromise = null;
async function findRemindersCalendar() {
  if (!todoCalendarPromise) {
    todoCalendarPromise = (async () => {
      const client = await getClient();
      const calendars = await client.fetchCalendars();
      const supportsTodo = (c) => {
        const comps = c.components || [];
        return comps.includes('VTODO');
      };
      return calendars.find((c) => supportsTodo(c)) || null;
    })();
    todoCalendarPromise.catch(() => { todoCalendarPromise = null; });
  }
  return todoCalendarPromise;
}

function icsDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildVtodo({ uid, text, whenISO }) {
  const due = icsDate(whenISO);
  const now = icsDate(new Date().toISOString());
  const summary = String(text).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n').slice(0, 200);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nova OS//Reminders//EN',
    'BEGIN:VTODO',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DUE:${due}`,
    `SUMMARY:${summary}`,
    'STATUS:NEEDS-ACTION',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${summary}`, 'TRIGGER;VALUE=DATE-TIME:' + due, 'END:VALARM',
    'END:VTODO', 'END:VCALENDAR',
  ].join('\r\n');
}

async function pushToApple(entry) {
  const calendar = await findRemindersCalendar();
  if (!calendar) throw new Error('no VTODO-capable list on the account');
  const client = await getClient();
  const filename = `nova-${entry.id}.ics`;
  await client.createCalendarObject({
    calendar,
    filename,
    iCalString: buildVtodo({ uid: `nova-${entry.id}`, text: entry.text, whenISO: entry.when }),
  });
  return { url: `${calendar.url.replace(/\/$/, '')}/${filename}`, list: calendar.displayName || 'Reminders' };
}

/* ------------------------------- lifecycle ------------------------------- */

export async function createReminder({ text, whenISO }) {
  const clean = String(text || '').trim().slice(0, 200);
  const when = new Date(whenISO);
  if (!clean) throw new Error('a reminder needs text');
  if (Number.isNaN(when.getTime())) throw new Error('a reminder needs a valid time');
  const entry = {
    id: randomUUID().slice(0, 8),
    text: clean,
    when: when.toISOString(),
    createdAt: new Date().toISOString(),
    status: 'scheduled', // scheduled → fired → done
    apple: null,
  };
  if (icloudConfigured()) {
    try {
      entry.apple = await pushToApple(entry);
    } catch (e) {
      entry.appleError = e.message; // honest: local nudge only
    }
  }
  await withLock(async () => {
    const store = await loadStore();
    store.items.push(entry);
    await saveStore(store);
  });
  return entry;
}

export async function removeReminder(id) {
  let removed = null;
  await withLock(async () => {
    const store = await loadStore();
    removed = store.items.find((r) => r.id === id) || null;
    store.items = store.items.filter((r) => r.id !== id);
    await saveStore(store);
  });
  if (removed?.apple?.url && icloudConfigured()) {
    try {
      const client = await getClient();
      await client.deleteCalendarObject({ calendarObject: { url: removed.apple.url, etag: '' } });
    } catch { /* the local removal is what undo promised; Apple copy may linger */ }
  }
  return removed;
}

export async function markReminder(id, status) {
  await withLock(async () => {
    const store = await loadStore();
    const r = store.items.find((x) => x.id === id);
    if (r) r.status = status;
    await saveStore(store);
  });
}

// Context line so conversations know what's on the wire.
export async function remindersContext() {
  const items = (await listReminders()).filter((r) => r.status === 'scheduled');
  if (!items.length) return '';
  const fmt = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
  return `SCHEDULED REMINDERS (${items.length}): ${items.slice(0, 6).map((r) => `"${r.text}" ${fmt(r.when)}`).join('; ')}.`;
}

/* ------------------------------- scheduler ------------------------------- */

async function fireDue() {
  const now = Date.now();
  const { items } = await loadStore();
  const due = items.filter((r) => r.status === 'scheduled' && new Date(r.when).getTime() <= now);
  for (const r of due) {
    const { sendPush } = await import('./push.js');
    sendPush({ title: 'Reminder — Nova', body: r.text, tag: `reminder-${r.id}` }).catch(() => {});
    import('./telegram.js').then(({ telegramConfigured, sendTelegramText }) => {
      if (telegramConfigured()) return sendTelegramText(`⏰ ${r.text}`);
    }).catch(() => {});
    await markReminder(r.id, 'fired');
  }
  // reminders older than 30 days that fired are pruned quietly
  const cutoff = now - 30 * 86400e3;
  await withLock(async () => {
    const store = await loadStore();
    const before = store.items.length;
    store.items = store.items.filter((r) => r.status === 'scheduled' || new Date(r.when).getTime() > cutoff);
    if (store.items.length !== before) await saveStore(store);
  });
}

export function startRemindersScheduler() {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('reminders');
    try { await fireDue(); } catch (e) { console.error('reminders tick failed:', e.message); }
  };
  tick();
  setInterval(tick, 60 * 1000);
}
