import { createDAVClient } from 'tsdav';
import ical from 'node-ical';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function toEvent(ev, start, end, category) {
  return {
    time: start.toTimeString().slice(0, 5),
    label: ev.summary || 'Untitled event',
    end: end ? end.toTimeString().slice(0, 5) : null,
    calendar: category,
  };
}

// A recurring VEVENT's own `start`/`end` are just the *first* occurrence in the
// series (e.g. a weekly workout's DTSTART might be months ago) — checking that
// against today's window drops every recurring event outright. Instead, expand
// each recurring master's RRULE for today's window, honoring EXDATE (skipped
// instances) and RECURRENCE-ID overrides (moved/edited single instances, which
// arrive as their own separate VEVENT sharing the master's UID).
export async function fetchEventsForDay(date = new Date()) {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const { hidden } = await loadCalendarPrefs();
  const hiddenSet = new Set(hidden);
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const timeRange = { start: dayStart.toISOString(), end: dayEnd.toISOString() };

  const events = [];
  for (const calendar of calendars) {
    if (hiddenSet.has(calendar.url)) continue; // respect the user's hide list — skip the fetch entirely
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
        if (!byUid.has(ev.uid)) byUid.set(ev.uid, []);
        byUid.get(ev.uid).push(ev);
      }
    }

    for (const versions of byUid.values()) {
      const master = versions.find((v) => v.rrule);
      const overrides = versions.filter((v) => v.recurrenceid);
      const plain = versions.filter((v) => !v.rrule && !v.recurrenceid);

      for (const ev of [...overrides, ...plain]) {
        if (ev.start >= dayStart && ev.start <= dayEnd) {
          events.push(toEvent(ev, ev.start, ev.end, calendar.displayName));
        }
      }

      if (master) {
        const duration = master.end - master.start;
        const overriddenInstants = new Set(overrides.map((o) => +o.recurrenceid));
        const excludedInstants = new Set(
          master.exdate ? Object.values(master.exdate).map((d) => +d) : []
        );
        for (const occStart of master.rrule.between(dayStart, dayEnd, true)) {
          if (overriddenInstants.has(+occStart) || excludedInstants.has(+occStart)) continue;
          const occEnd = new Date(occStart.getTime() + duration);
          events.push(toEvent(master, occStart, occEnd, calendar.displayName));
        }
      }
    }
  }
  events.sort((a, b) => a.time.localeCompare(b.time));
  return events;
}
