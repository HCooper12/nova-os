import { createDAVClient } from 'tsdav';
import ical from 'node-ical';

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

export async function fetchEventsForDay(date = new Date()) {
  const client = await getClient();
  const calendars = await client.fetchCalendars();
  const timeRange = {
    start: startOfDay(date).toISOString(),
    end: endOfDay(date).toISOString(),
  };

  const events = [];
  for (const calendar of calendars) {
    let objects;
    try {
      objects = await client.fetchCalendarObjects({ calendar, timeRange });
    } catch {
      continue;
    }
    for (const obj of objects) {
      if (!obj.data) continue;
      const parsed = ical.sync.parseICS(obj.data);
      for (const key of Object.keys(parsed)) {
        const ev = parsed[key];
        if (ev.type !== 'VEVENT' || !ev.start) continue;
        if (ev.start >= startOfDay(date) && ev.start <= endOfDay(date)) {
          events.push({
            time: ev.start.toTimeString().slice(0, 5),
            label: ev.summary || 'Untitled event',
            end: ev.end ? ev.end.toTimeString().slice(0, 5) : null,
            calendar: calendar.displayName,
          });
        }
      }
    }
  }
  events.sort((a, b) => a.time.localeCompare(b.time));
  return events;
}
