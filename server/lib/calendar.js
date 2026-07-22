import { createDAVClient } from 'tsdav';
import ical from 'node-ical';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Which calendars to hide from Nova, keyed by their stable CalDAV URL (names can
// duplicate — there are two "Task" calendars). Apple Calendar's own show/hide
// checkboxes are a local display setting CalDAV never exposes, so Nova needs its
// own list. Operational config, not vault knowledge.
const PREFS_PATH = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'calendar-prefs.json');

export async function loadCalendarPrefs() {
  try {
    if (!existsSync(PREFS_PATH())) return { hidden: [] };
    const raw = JSON.parse(await readFile(PREFS_PATH(), 'utf8'));
    return { hidden: Array.isArray(raw.hidden) ? raw.hidden : [] };
  } catch {
    return { hidden: [] };
  }
}

export async function saveCalendarPrefs(hidden) {
  const clean = [...new Set((Array.isArray(hidden) ? hidden : []).map(String))];
  await mkdir(path.dirname(PREFS_PATH()), { recursive: true });
  const tmp = PREFS_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify({ hidden: clean }, null, 2), 'utf8');
  await rename(tmp, PREFS_PATH());
  return { hidden: clean };
}

// Every calendar Nova can see, each flagged with whether it's currently hidden —
// the list the settings toggles are built from.
export async function listCalendars() {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const { hidden } = await loadCalendarPrefs();
  const hiddenSet = new Set(hidden);
  return calendars.map((c) => ({
    name: c.displayName || 'Untitled',
    url: c.url,
    hidden: hiddenSet.has(c.url),
  }));
}

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = createDAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: {
        username: process.env.ICLOUD_USERNAME,
        password: process.env.ICLOUD_APP_PASSWORD,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
  }
  return clientPromise;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// ---- writing events (confirm-first: only ever called when the user approves an
// inbox proposal, never autonomously) --------------------------------------
function pad2(n) { return String(n).padStart(2, '0'); }
function toICalUTC(d) {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}
function icalEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

// Pure: a minimal single VEVENT calendar for a timed event. Kept separate from
// the network write so it can be unit-tested exactly.
export function buildEventICal({ uid, title, start, end, notes, stamp = new Date() }) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NovaOS//calendar//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICalUTC(stamp)}`,
    `DTSTART:${toICalUTC(new Date(start))}`,
    `DTEND:${toICalUTC(new Date(end))}`,
    `SUMMARY:${icalEscape(title)}`,
  ];
  if (notes) lines.push(`DESCRIPTION:${icalEscape(notes)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

async function resolveWritableCalendar(client, preferredName) {
  const cals = await client.fetchCalendars();
  const { hidden } = await loadCalendarPrefs();
  const hiddenSet = new Set(hidden);
  const writable = cals.filter((c) => !hiddenSet.has(c.url) && (c.components || []).includes('VEVENT'));
  if (preferredName) {
    const match = writable.find((c) => c.displayName === preferredName);
    if (match) return match;
  }
  return writable.find((c) => c.displayName === 'Personal')
    || writable.find((c) => c.displayName === 'Calendar')
    || writable[0]
    || null;
}

export async function createEvent({ title, start, end, notes, calendarName }) {
  const client = await getClient();
  const calendar = await resolveWritableCalendar(client, calendarName);
  if (!calendar) throw new Error('no writable calendar found');
  const uid = `nova-${randomUUID()}@novaos`;
  const filename = `${uid}.ics`;
  const iCalString = buildEventICal({ uid, title, start, end, notes });
  const res = await client.createCalendarObject({ calendar, filename, iCalString });
  if (!res.ok && ![200, 201, 204].includes(res.status)) throw new Error(`calendar write failed (${res.status})`);
  return {
    uid,
    objectUrl: new URL(filename, calendar.url).href,
    etag: res.headers?.get?.('etag') || null,
    calendarName: calendar.displayName,
  };
}

export async function deleteEventAt({ objectUrl, etag }) {
  const client = await getClient();
  const res = await client.deleteCalendarObject({ calendarObject: { url: objectUrl, etag: etag || undefined } });
  if (!res.ok && ![200, 204].includes(res.status)) throw new Error(`calendar delete failed (${res.status})`);
  return { removed: true };
}

// Rewrite just DTSTART/DTEND (to UTC), refresh DTSTAMP, bump SEQUENCE — a moved
// event keeps its UID and every other property (alarms, attendees, notes).
function rewriteEventTimes(raw, newStart, newEnd) {
  let out = raw
    .replace(/^DTSTART[^\r\n]*/m, `DTSTART:${toICalUTC(new Date(newStart))}`)
    .replace(/^DTEND[^\r\n]*/m, `DTEND:${toICalUTC(new Date(newEnd))}`)
    .replace(/^DTSTAMP[^\r\n]*/m, `DTSTAMP:${toICalUTC(new Date())}`);
  if (/^SEQUENCE:\d+/m.test(out)) out = out.replace(/^SEQUENCE:(\d+)/m, (_m, n) => `SEQUENCE:${Number(n) + 1}`);
  else out = out.replace(/^(UID:[^\r\n]*)/m, `$1\r\nSEQUENCE:1`);
  return out;
}
export { rewriteEventTimes };

// Move an existing event by rewriting its times. Returns the new etag.
export async function moveEvent({ objectUrl, etag, raw, newStart, newEnd }) {
  const client = await getClient();
  const data = rewriteEventTimes(raw, newStart, newEnd);
  const res = await client.updateCalendarObject({ calendarObject: { url: objectUrl, etag: etag || undefined, data } });
  if (!res.ok && ![200, 204].includes(res.status)) throw new Error(`calendar move failed (${res.status})`);
  return { objectUrl, newEtag: res.headers?.get?.('etag') || null };
}

// Restore an event's exact prior iCal (undo a move) or recreate a deleted one —
// a PUT with no If-Match, which CalDAV creates-or-replaces.
export async function putEventRaw({ objectUrl, raw }) {
  const client = await getClient();
  const res = await client.updateCalendarObject({ calendarObject: { url: objectUrl, data: raw } });
  if (!res.ok && ![200, 201, 204].includes(res.status)) throw new Error(`calendar restore failed (${res.status})`);
  return { restored: true };
}

function shortId(s) { return createHash('sha1').update(s).digest('base64url').slice(0, 12); }

function toEvent(ev, start, end, calendarName, recurring) {
  const startISO = start.toISOString();
  return {
    id: shortId(`${ev.uid}|${startISO}`),
    date: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`,
    time: start.toTimeString().slice(0, 5),
    end: end ? end.toTimeString().slice(0, 5) : null,
    label: ev.summary || 'Untitled event',
    calendar: calendarName,
    startISO,
    endISO: end ? end.toISOString() : null,
    recurring: !!recurring,
    uid: ev.uid,
    objectUrl: ev._url || null,
    etag: ev._etag || null,
    raw: ev._raw || null,
  };
}

// Expand one UID's parsed VEVENTs (master + overrides + plain) across a
// window. Pure and exported for tests — this is where the "calendar never
// updates" bug lived, so it stays testable forever.
//
// Single-occurrence edits ("move just today's Workout to 10:00") live in
// node-ical's master.recurrences — NOT as top-level entries. The old code
// only read top-level, so every moved occurrence was invisible and Nova kept
// showing the series' original time. Overrides are folded in (deduped —
// node-ical keys each under both a date key and an instant key), rendered at
// THEIR OWN time, and every override suppresses its original slot — including
// ones moved out of the window, else the old time would ghost back.
export function expandUidGroup(versions, rangeStart, rangeEnd, calendarName) {
  const events = [];
  const master = versions.find((v) => v.rrule);
  const plain = versions.filter((v) => !v.rrule && !v.recurrenceid);

  const overrides = [];
  const seenOverride = new Set();
  const foldOverride = (o) => {
    if (!o || !o.start || !o.recurrenceid) return;
    const k = `${+o.recurrenceid}|${+o.start}`;
    if (seenOverride.has(k)) return;
    seenOverride.add(k);
    o._url = master?._url || o._url; o._etag = master?._etag || o._etag; o._raw = master?._raw || o._raw;
    overrides.push(o);
  };
  for (const v of versions) {
    if (v.recurrenceid) foldOverride(v); // some feeds DO surface them top-level
    if (v.recurrences) for (const o of Object.values(v.recurrences)) foldOverride(o);
  }

  for (const ev of [...overrides, ...plain]) {
    if (ev.start >= rangeStart && ev.start <= rangeEnd) {
      // an override is still part of a series — flag it so single-instance
      // moves/deletes stay honestly declined by the command interpreter
      events.push(toEvent(ev, ev.start, ev.end, calendarName, !!ev.recurrenceid));
    }
  }
  if (master) {
    const duration = master.end - master.start;
    const overriddenInstants = new Set(overrides.map((o) => +o.recurrenceid));
    const excludedInstants = new Set(master.exdate ? Object.values(master.exdate).map((d) => +d) : []);
    for (const occStart of master.rrule.between(rangeStart, rangeEnd, true)) {
      if (overriddenInstants.has(+occStart) || excludedInstants.has(+occStart)) continue;
      const occEnd = new Date(occStart.getTime() + duration);
      events.push(toEvent(master, occStart, occEnd, calendarName, true));
    }
  }
  return events;
}

// A recurring VEVENT's own `start`/`end` are just the *first* occurrence, so
// expand each master's RRULE across the window, honoring EXDATE and
// RECURRENCE-ID overrides. Each event carries its object url/etag/raw so it can
// later be moved or deleted; recurring occurrences are flagged (edits to a
// single instance of a series are deliberately not offered).
async function collectEvents(rangeStart, rangeEnd) {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const { hidden } = await loadCalendarPrefs();
  const hiddenSet = new Set(hidden);
  const timeRange = { start: rangeStart.toISOString(), end: rangeEnd.toISOString() };

  const events = [];
  for (const calendar of calendars) {
    if (hiddenSet.has(calendar.url)) continue;
    let objects;
    try {
      objects = await client.fetchCalendarObjects({ calendar, timeRange });
    } catch {
      continue;
    }
    const byUid = new Map();
    for (const obj of objects) {
      if (!obj.data) continue;
      const parsed = ical.sync.parseICS(obj.data);
      for (const key of Object.keys(parsed)) {
        const ev = parsed[key];
        if (ev.type !== 'VEVENT' || !ev.start || !ev.uid) continue;
        ev._url = obj.url; ev._etag = obj.etag; ev._raw = obj.data;
        if (!byUid.has(ev.uid)) byUid.set(ev.uid, []);
        byUid.get(ev.uid).push(ev);
      }
    }
    for (const versions of byUid.values()) {
      events.push(...expandUidGroup(versions, rangeStart, rangeEnd, calendar.displayName));
    }
  }
  return events;
}

// Client-facing shape — drops the internal CalDAV url/etag/raw.
const PUBLIC_FIELDS = ['id', 'date', 'time', 'end', 'label', 'calendar', 'recurring', 'startISO'];
function publicEvent(e) { const o = {}; for (const f of PUBLIC_FIELDS) o[f] = e[f]; return o; }

export async function fetchEventsForDay(date = new Date()) {
  const events = await collectEvents(startOfDay(date), endOfDay(date));
  events.sort((a, b) => a.time.localeCompare(b.time));
  return events.map(publicEvent);
}

// Events across N days from `from` (inclusive) — public shape, for the week/
// month view and any range-aware reasoning.
export async function fetchEventsForRange(days = 14, from = new Date()) {
  const end = endOfDay(new Date(startOfDay(from).getTime() + (days - 1) * 86400000));
  const events = await collectEvents(startOfDay(from), end);
  events.sort((a, b) => (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : 0));
  return events.map(publicEvent);
}

// Server-internal: same range but WITH identity (url/etag/raw), so the command
// interpreter can resolve "my 3pm meeting" and move or delete it.
export async function fetchEventsForRangeRaw(days = 14, from = new Date()) {
  const end = endOfDay(new Date(startOfDay(from).getTime() + (days - 1) * 86400000));
  const events = await collectEvents(startOfDay(from), end);
  events.sort((a, b) => (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : 0));
  return events;
}
