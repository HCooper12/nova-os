// TWO WORKOUTS ON ONE DAY, THAT DATE ONLY (mockup 104, his answer 26 Oct
// 2026: "Maybe that day only").
//
// The week plan is a weekday template (lib/workouts.js schedule[day]) and
// about a dozen readers depend on its one-routine-per-day shape, so it is
// left exactly as it is. A day that holds more than one workout is a DATED
// override, the same kind of thing a make-up day is (lib/makeupDay.js), and
// it lives where make-ups live: operational state in server/data, not the
// vault. Once the date has passed the record is history; the sessions he
// filed that day are the vault's record of what happened.
//
// Format, server/data/workout-day-plans.json:
//   { "plans": [ { "date": "2026-10-31", "routineIds": ["a1b2c3d4", "e5f6a7b8"],
//                  "updatedAt": "2026-10-26T06:02:11.000Z" } ] }
// routineIds is the date's WHOLE plan, in the order he ticked it (the first
// is the one Begin offers first). A record only exists for two or more; one
// workout on a day is the template's job, and an empty day is rest.
//
// Undo: every write returns the record it replaced (`prior`, null when there
// was none), and the client puts that back through the same PUT/DELETE.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = () => path.join(dataRoot(), 'workout-day-plans.json');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_PER_DAY = 4;

async function load() {
  if (!existsSync(STORE())) return [];
  try {
    const raw = JSON.parse(await readFile(STORE(), 'utf8'));
    return Array.isArray(raw.plans) ? raw.plans : [];
  } catch {
    return [];
  }
}

async function save(plans) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${STORE()}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify({ plans }, null, 2), 'utf8');
  await rename(tmp, STORE());
}

// Pure: the ids as he ticked them, cleaned. Order kept, duplicates and
// blanks dropped, capped. Ids the plan does not know are refused by the
// caller (the route checks them against his live routines).
export function cleanRoutineIds(ids) {
  const out = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw || '').trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out.slice(0, MAX_PER_DAY);
}

export async function listDayPlans({ from = null, to = null } = {}) {
  return (await load())
    .filter((p) => (!from || p.date >= from) && (!to || p.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function dayPlanFor(date) {
  return (await load()).find((p) => p.date === date) || null;
}

// Set a date's plan. Fewer than two ids clears the record: one workout is
// the weekday template's to hold (the client writes that) and none is rest.
export async function setDayPlan(date, routineIds, { known = null } = {}) {
  if (!DATE_RE.test(date || '')) throw new Error('date must be YYYY-MM-DD');
  const ids = cleanRoutineIds(routineIds);
  if (known) {
    const bad = ids.find((id) => !known.has(id));
    if (bad) throw new Error('pick from your routines');
  }
  const plans = await load();
  const prior = plans.find((p) => p.date === date) || null;
  const rest = plans.filter((p) => p.date !== date);
  if (ids.length < 2) {
    if (prior) await save(rest);
    return { plan: null, prior };
  }
  const plan = { date, routineIds: ids, updatedAt: new Date().toISOString() };
  await save([...rest, plan]);
  return { plan, prior };
}

export async function clearDayPlan(date) {
  if (!DATE_RE.test(date || '')) throw new Error('date must be YYYY-MM-DD');
  return setDayPlan(date, []);
}
