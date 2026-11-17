import { randomUUID } from 'node:crypto';
import { startFoodDescribe, getFoodScanJob } from './scanFood.js';

// THE WATCH'S ESTIMATE (17 Nov 2026): he says what he ate, the describe lane
// (the same one the phone's "describe it" uses) breaks it into weighed lines
// and code sums them, and the watch shows the lines so he can drop one before
// it is logged. The estimate is held HERE, by id, because the watch must never
// send numbers back: only an id and which lines to drop. What gets written is
// what code validated, never what a client or model says at log time.

export const ESTIMATE_TTL_MS = 15 * 60_000;
export const ESTIMATE_MAX = 50;
export const WAIT_MS = 90_000;
const POLL_MS = 400;

const held = new Map(); // id -> { at, heard, name, macros, components }

let clock = () => Date.now();
export function setEstimateClock(fn) { clock = typeof fn === 'function' ? fn : () => Date.now(); }

export const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

function prune(t) {
  for (const [id, v] of held) if (t - v.at >= ESTIMATE_TTL_MS) held.delete(id);
}

const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

/** Starts the describe job for `text`, waits for it, holds the result. Throws
 *  {status, message} with the real cause. deps are test seams. */
export async function estimateFromText(text, {
  start = (t) => startFoodDescribe(t),
  getJob = getFoodScanJob,
  waitMs = WAIT_MS,
  pollMs = POLL_MS,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const heard = String(text || '').replace(/\s+/g, ' ').trim();
  if (!heard) throw fail(422, 'I did not hear anything to estimate. Say what you ate again.', 'nothing_heard');
  let jobId;
  try {
    jobId = start(heard);
  } catch (e) {
    // startFoodDescribe's own words ("describe what you ate in a few more words")
    throw fail(422, e.message, 'bad_text');
  }
  const deadline = Date.now() + waitMs;
  for (;;) {
    const job = getJob(jobId);
    if (!job) throw fail(422, 'The estimate was lost before it finished. Try again.', 'lost');
    if (job.status === 'error') throw fail(422, job.error || 'The estimate failed.', 'describe_error');
    if (job.status === 'ready') {
      const r = job.result || {};
      const m = r.macros || {};
      const macros = { p: Math.round(num(m.p) * 10) / 10, c: Math.round(num(m.c) * 10) / 10, f: Math.round(num(m.f) * 10) / 10, kcal: Math.round(num(m.kcal)) };
      if (!(macros.kcal > 0)) throw fail(422, 'I could not work out calories for that. Try saying it with a size or an amount.', 'no_macros');
      const components = Array.isArray(r.components) ? r.components.filter((c) => c && c.name) : [];
      const name = String(r.name || '').trim() || heard.slice(0, 60);
      const t = clock();
      prune(t);
      while (held.size >= ESTIMATE_MAX) held.delete(held.keys().next().value); // oldest first
      const estimateId = randomUUID().slice(0, 12);
      held.set(estimateId, { at: t, heard, name, macros, components });
      const lines = components.length > 1
        ? components.map((c) => ({ name: String(c.name).slice(0, 80), kcal: Math.round(num(c.macros?.kcal)) }))
        : [{ name, kcal: macros.kcal }];
      return { estimateId, heard, name, lines, macros };
    }
    if (Date.now() >= deadline) throw fail(504, 'The estimate took too long. Try again.', 'timeout');
    await sleep(pollMs);
  }
}

/** The entry to write for a held estimate, with `drop` lines left out. The
 *  total is the sum of the lines that remain (addEntry sums `items`). */
export function entryForEstimate(estimateId, drop = []) {
  const t = clock();
  prune(t);
  const est = held.get(String(estimateId));
  if (!est) throw fail(404, 'That estimate has expired. Say it again.', 'expired');
  const count = est.components.length > 1 ? est.components.length : 1;
  if (!Array.isArray(drop) || drop.some((i) => !Number.isInteger(i) || i < 0 || i >= count)) {
    throw fail(400, 'drop must list line numbers that are in the estimate', 'bad_drop');
  }
  const dropped = new Set(drop);
  if (dropped.size >= count) throw fail(400, 'That would leave nothing to log. Keep at least one line.', 'drop_all');
  if (est.components.length > 1) {
    const items = est.components.filter((_, i) => !dropped.has(i));
    // an entry's macros are the sum of its lines; refuse to file a meal whose
    // kept lines add up to nothing (a name-only line the matcher could not price)
    if (!(items.reduce((a, c) => a + num(c.macros?.kcal), 0) > 0)) {
      throw fail(400, 'The lines left have no calories. Keep a line that has some.', 'no_energy_left');
    }
    return { name: est.name, macros: est.macros, items, words: est.heard };
  }
  return { name: est.name, macros: est.macros, words: est.heard };
}

/** After a successful log the estimate is spent: a second tap must not file twice. */
export function spendEstimate(estimateId) { held.delete(String(estimateId)); }

export function _resetEstimatesForTests() { held.clear(); clock = () => Date.now(); }
export const _heldCount = () => held.size;
