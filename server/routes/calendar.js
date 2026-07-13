import { Router } from 'express';
import { fetchEventsForDay } from '../lib/calendar.js';

export function calendarRouter() {
  const router = Router();

  router.get('/calendar/today', async (req, res, next) => {
    try {
      if (!process.env.ICLOUD_USERNAME || !process.env.ICLOUD_APP_PASSWORD) {
        return res.status(501).json({ error: 'calendar not configured' });
      }
      const events = await fetchEventsForDay(new Date());
      res.json({ events });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
