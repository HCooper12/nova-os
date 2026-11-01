// THE FAULTS NOVA MAY SAY FIRST, AND WHICH HE HAS HEARD TODAY (1 Nov 2026,
// Wren parity: atlas-partner lib/preflight.mjs + public/dock.js
// preflightFirstLine, "One thing first: ..." once per day per fault).
//
// Nova already says ONE tier-next alert at the start of his spoken turn
// (App.sayFirstThing: the morning systems check, a missed health push). What
// never reached his ears was a fault of the NOW tier he had not been told
// about in a live voice session: Guardian's red checks (a snapshot that does
// not read back, a store that does not parse, the vault unreachable) went to
// a push and Telegram only, and a push is easy to miss. This file names those
// faults, in the source's own words, and keeps the day's heard list.
//
// What counts, and nothing else:
//  - a Guardian check in status 'alert' from a report no older than
//    GUARDIAN_FRESH_MS (a report that old is no longer what is true now);
//    'warn' is not the now tier and is not said;
//  - a pending tier-now SYSTEM alert not yet spoken (no source raises one
//    today; the door is open so one never needs a second path). A tier-next
//    system fault already rides App.sayFirstThing and is left there, so
//    nothing is said twice.
// No model writes a word here. The heard list is server/data/first-line.json,
// { day, ids }, his local day (src/firstLine.js dayKey is the contract).

import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayKey } from '../../src/firstLine.js';
import { firstThingLine } from './alerts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
export const HEARD_PATH = () => path.join(dataRoot(), 'first-line.json');

export const GUARDIAN_FRESH_MS = 26 * 3600_000;
export const LINE_MAX_WORDS = 14;
// an id the client may mark: guardian:<check id> or alert:<alert id>
export const FAULT_ID = /^(?:guardian|alert):[A-Za-z0-9_-]{1,60}$/;

const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const words = (s) => flat(s).split(' ').filter(Boolean);

/**
 * Guardian's own words for one check, as one spoken line: its label and the
 * first clause of its detail (a file name, a stamp or an error message after
 * a colon, a dash or a bracket is for the card, not his ears). Pure.
 */
export function guardianLine(check) {
  const label = flat(check?.label).replace(/[.:;,]+$/, '');
  const clause = flat(check?.detail).split(/\s+[—–-]\s+|\s+·\s+|\s+\(|:\s/)[0].replace(/[.:;,!?]+$/, '').trim();
  const body = [label, clause].filter(Boolean).join(': ');
  if (!body) return '';
  const w = words(body);
  const cut = w.length > LINE_MAX_WORDS ? w.slice(0, LINE_MAX_WORDS).join(' ').replace(/[,;:]+$/, '') : body;
  return `One thing first: ${cut}.`;
}

/** Guardian's red checks from a fresh report. Pure. */
export function guardianFaults(report, now = Date.now()) {
  const at = Date.parse(report?.at);
  if (!Number.isFinite(at) || now - at > GUARDIAN_FRESH_MS || at - now > 60_000) return [];
  return (Array.isArray(report?.checks) ? report.checks : [])
    .filter((c) => c && c.status === 'alert' && /^[A-Za-z0-9_-]{1,60}$/.test(String(c.id || '')))
    .map((c) => ({ id: `guardian:${c.id}`, source: 'guardian', line: guardianLine(c), at: report.at }))
    .filter((f) => f.line);
}

/** Pending tier-now SYSTEM alerts not yet spoken. Pure. */
export function alertFaults(alerts = []) {
  return (Array.isArray(alerts) ? alerts : [])
    .filter((a) => a && a.tier === 'now' && a.label === 'SYSTEM' && !a.spokenAt && /^[A-Za-z0-9_-]{1,60}$/.test(String(a.id || '')))
    .map((a) => ({ id: `alert:${a.id}`, source: 'alert', alertId: a.id, line: firstThingLine(a), at: a.at || null }))
    .filter((f) => f.line);
}

/** Every fault Nova may say first, Guardian's before the alerts'. Pure. */
export function faultsNow({ report = null, alerts = [], now = Date.now() } = {}) {
  const seen = new Set();
  return [...guardianFaults(report, now), ...alertFaults(alerts)].filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
}

/** Today's heard list: { day, ids }. Another day's file is an empty today. */
export function readHeard(now = Date.now()) {
  const day = dayKey(now);
  try {
    if (!existsSync(HEARD_PATH())) return { day, ids: [] };
    const raw = JSON.parse(readFileSync(HEARD_PATH(), 'utf8'));
    return raw?.day === day && Array.isArray(raw.ids) ? { day, ids: raw.ids.filter((x) => typeof x === 'string') } : { day, ids: [] };
  } catch {
    return { day, ids: [] };
  }
}

let chain = Promise.resolve();
const locked = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

/** He has heard this fault today. Idempotent; throws on an id that is not one. */
export async function markHeard(id, now = Date.now()) {
  if (!FAULT_ID.test(String(id || ''))) throw new Error('not a fault id');
  return locked(async () => {
    const cur = readHeard(now);
    if (cur.ids.includes(id)) return cur;
    const next = { day: cur.day, ids: [...cur.ids, id] };
    await mkdir(dataRoot(), { recursive: true });
    const tmp = `${HEARD_PATH()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
    await rename(tmp, HEARD_PATH());
    return next;
  });
}

/** What GET /api/alerts carries as `firstLine`: { day, heard, faults }. */
export async function firstLineState({ now = Date.now(), getReport, alerts } = {}) {
  let report = null;
  try {
    report = getReport ? await getReport() : (await (await import('./guardian.js')).getGuardian()).lastReport;
  } catch { report = null; }
  let list = alerts;
  if (!list) {
    try { list = (await import('./alerts.js')).pendingAlerts(now); } catch { list = []; }
  }
  const heard = readHeard(now);
  return { day: heard.day, heard: heard.ids, faults: faultsNow({ report, alerts: list, now }) };
}
