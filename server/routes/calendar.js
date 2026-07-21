import { Router } from 'express';
import { fetchEventsForDay, listCalendars, saveCalendarPrefs } from '../lib/calendar.js';

function configured() {
  return process.env.ICLOUD_USERNAME && process.env.ICLOUD_APP_PASSWORD;
}

export function calendarRouter() {
  const router = Router();

  router.get('/calendar/today', async (req, res, next) => {
    try {
      if (!configured()) return res.status(501).json({ error: 'calendar not configured' });
      const events = await fetchEventsForDay(new Date());
      res.json({ events });
    } catch (err) {
      next(err);
    }
  });

  // The full calendar list + hidden flags — powers the settings toggles.
  router.get('/calendar/calendars', async (req, res, next) => {
    try {
      if (!configured()) return res.status(501).json({ error: 'calendar not configured' });
      res.json({ calendars: await listCalendars() });
    } catch (err) {
      next(err);
    }
  });

  // Set which calendars Nova hides (by CalDAV url). Broadcasts so today's view
  // and every calendar-aware brief refresh against the new preference.
  router.post('/calendar/calendars/hidden', async (req, res) => {
    try {
      const hidden = Array.isArray(req.body?.hidden) ? req.body.hidden : [];
      const saved = await saveCalendarPrefs(hidden);
      const { broadcast } = await import('../lib/events.js');
      broadcast('calendar');
      res.json(saved);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
