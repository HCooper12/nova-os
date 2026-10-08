// WHEN "YOUR DAY, DRAWN" SHOWS ON HOME (mockup 86): from 05:00 to 11:00, or
// until he has seen all five instruments that morning, whichever comes
// first; pinned from Edit, it stays all day. Which ones he has seen is a
// per-device convenience in localStorage, keyed by the local day, so a new
// morning starts with none seen. Storage that throws or is empty only means
// the card shows: it never hides the morning's instruments by mistake.
import { localDateISO } from './localDate.js';

export const DAY_SEEN_KEY = 'novaos.daySeen';
export const DAY_CARD_FROM = 5;
export const DAY_CARD_UNTIL = 11;

// the five instruments, in the card's order (src/Instruments.jsx DAY_INS)
export const DAY_KEYS = ['vitals', 'day', 'week', 'body', 'fuel'];

export const inMorning = (hour) => hour >= DAY_CARD_FROM && hour < DAY_CARD_UNTIL;

export function readDaySeen(today = localDateISO()) {
  try {
    const raw = JSON.parse(localStorage.getItem(DAY_SEEN_KEY) || 'null');
    return raw && raw.date === today && Array.isArray(raw.seen) ? raw.seen : [];
  } catch { return []; }
}

export function markDaySeen(key, today = localDateISO()) {
  const seen = readDaySeen(today);
  if (seen.includes(key)) return seen;
  const next = [...seen, key];
  try { localStorage.setItem(DAY_SEEN_KEY, JSON.stringify({ date: today, seen: next })); } catch { /* the card just shows again */ }
  return next;
}

// Pure: does the card belong on Home right now? `seenAll` is read once when
// Home mounts, so the card never vanishes under his finger on the fifth.
export function dayCardShows({ hour, pinned, seenAll }) {
  if (pinned) return true;
  return inMorning(hour) && !seenAll;
}
