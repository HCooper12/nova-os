// PAIN IS ASKED ONCE (13 Nov 2026).
//
// His words: "one time I mentioned some slight pain during an exercise but
// wasn't ongoing (it should have merely asked if this was continual pain or
// not)". Before this, a pain flag on any session from the last four days was
// read to him every morning, the program review filed it as a card, and an
// open Injury Log entry was spoken daily however old it was.
//
// Now there is ONE asker, on the inbox rails: a 'pain-check' record.
//   (a) Pain logged in a session, from yesterday back a week: "Is it still
//       going on?" Yes files an Injury Log entry (Undo removes it). No is
//       the end of it. Each mention is asked once, ever, keyed by painKey.
//   (b) An open Injury Log entry nobody has confirmed in two weeks: "Has it
//       cleared up?" Yes resolves it (Undo reopens it). No writes nothing;
//       the date he said it is what keeps the entry current for 14 more days.
// Code decides what to ask and writes only on his yes. No model.
import { randomUUID } from 'node:crypto';
import { ageDays, isFresh, datedLabel, FRESH_DAYS } from './freshness.js';
import { readExerciseNote } from './sessionNotes.js';
import { closedAreas, closedAsOf, isStaleConcern, namesArea } from './concernClose.js';

export const KIND = 'pain-check';
// never more than two of these waiting at once; the rest wait for the next run
const MAX_PENDING = 2;
// how long his "not yet" about an open entry keeps it current, and how long
// after one asking the same entry is left alone
const CONFIRMED_DAYS = FRESH_DAYS['open-injury'];

// "Shoulder (left), during the set — sharp" (the logger's shape) → "Shoulder (left)"
const areaOf = (said) => String(said || '').split(/,|\s[—–-]\s/)[0].trim();

/** One mention per exercise per session date with pain logged, from yesterday back `session-pain` days. Pure. */
export function painMentions(sessions = [], { now = new Date() } = {}) {
  const out = [];
  const seen = new Set();
  for (const s of Array.isArray(sessions) ? sessions : []) {
    const age = ageDays(s?.date, now);
    // never asked on the day it happened: he may still be in the session
    if (age == null || age < 1 || !isFresh('session-pain', s.date, now)) continue;
    for (const ex of s.exercises || []) {
      const read = readExerciseNote(ex);
      const setPain = (ex.sets || []).find((st) => st && st.pain);
      if (!read?.signals.includes('pain') && !setPain) continue;
      const exerciseId = ex.exerciseId || ex.name;
      if (!exerciseId) continue;
      const key = `pain:${exerciseId}:${s.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = ex.name || exerciseId;
      const said = read?.pain || (typeof setPain?.pain === 'string' ? setPain.pain : null) || read?.note || null;
      const logged = read?.pain || (typeof setPain?.pain === 'string' ? setPain.pain : null);
      out.push({ key, exerciseId, name, sessionDate: s.date, area: areaOf(logged) || name, said });
    }
  }
  return out.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
}

// his own "not yet" on a check about this entry, within the window: a
// discard he made, never one that expired unanswered
function confirmedLately(injury, records, now) {
  return (records || []).some((r) => r.kind === KIND && r.injuryId === injury.id
    && r.status === 'discarded' && r.expired !== true
    && (() => { const a = ageDays(r.discardedAt, now); return a != null && a <= CONFIRMED_DAYS; })());
}

/** Is this open entry current: started within `open-injury` days, or he said "not yet" lately? */
export function injuryIsFresh(injury, records = [], now = new Date()) {
  if (!injury || injury.resolvedAt) return false;
  return isFresh('open-injury', injury.startedAt, now) || confirmedLately(injury, records, now);
}

/** The open entries worth saying out loud. */
export function freshInjuries(injuries = [], records = [], now = new Date()) {
  return (Array.isArray(injuries) ? injuries : []).filter((i) => !i.resolvedAt && injuryIsFresh(i, records, now));
}

/** File at most two pain-check questions. Idempotent. Returns { raised }. */
export async function raisePainChecks(vaultPath, deps = {}) {
  const { listRecords, createRecord } = deps.store || await import('./inboxStore.js');
  const now = deps.now ? new Date(deps.now) : new Date();
  const sessions = deps.sessions
    ?? await (await import('./workoutSessions.js')).loadSessions(vaultPath, { limit: 20 }).catch(() => []);
  const injuries = deps.injuries
    ?? await (await import('./injuryLog.js')).listInjuries(vaultPath).catch(() => []);
  const records = (await listRecords()) || [];
  const checks = records.filter((r) => r.kind === KIND);
  let room = MAX_PENDING - checks.filter((r) => r.status === 'pending').length;
  const raised = [];
  if (room <= 0) return { raised };

  const open = (injuries || []).filter((i) => !i.resolvedAt);
  const closed = closedAreas(injuries || [], { now });
  const asked = new Set(checks.map((r) => r.painKey).filter(Boolean));
  const base = () => ({
    id: randomUUID().slice(0, 8),
    kind: KIND,
    source: 'coach',
    mode: 'draft',
    status: 'pending',
    createdAt: now.toISOString(),
  });

  // (a) a pain mention in a session
  for (const m of painMentions(sessions, { now })) {
    if (room <= 0) break;
    if (asked.has(m.key)) continue; // asked once, ever, whatever he said
    const words = `${m.area} ${m.said || ''}`;
    if (open.some((i) => namesArea(words, i.area))) continue; // already on the log
    if (isStaleConcern(`${m.said || m.area} pain`, closedAsOf(closed, m.sessionDate))) continue; // he closed it
    raised.push(await createRecord({
      ...base(),
      painKey: m.key,
      exerciseId: m.exerciseId,
      exerciseName: m.name,
      sessionDate: m.sessionDate,
      area: m.area,
      text: `You logged pain on ${m.name} ${datedLabel(m.sessionDate, now)}. Is it still going on?`,
    }));
    asked.add(m.key);
    room -= 1;
  }

  // (b) an open entry nobody has confirmed lately
  for (const inj of open) {
    if (room <= 0) break;
    if (injuryIsFresh(inj, records, now)) continue;
    const mine = checks.filter((r) => r.injuryId === inj.id);
    if (mine.some((r) => r.status === 'pending')) continue;
    if (mine.some((r) => { const a = ageDays(r.createdAt, now); return a != null && a <= CONFIRMED_DAYS; })) continue;
    raised.push(await createRecord({
      ...base(),
      injuryId: inj.id,
      area: inj.area,
      text: `Your Injury Log still has ${inj.area} open, since ${datedLabel(inj.startedAt, now, { on: false }) || 'a while back'}. Has it cleared up?`,
    }));
    room -= 1;
  }
  return { raised };
}

/** His yes. (a) still going on: one Injury Log entry, Undo removes it. (b) cleared up: the entry resolved, Undo reopens it. */
export async function approvePainCheck(vaultPath, record, deps = {}) {
  const { updateRecord } = deps.store || await import('./inboxStore.js');
  const filedAt = new Date().toISOString();
  if (record.painKey) {
    const { addInjury } = await import('./injuryLog.js');
    const when = datedLabel(record.sessionDate, new Date(), { relative: false });
    const entry = await addInjury(vaultPath, {
      area: record.area || record.exerciseName,
      note: `Logged pain on ${record.exerciseName || record.area}${when ? ` ${when}` : ''}; he said it is still going on.`,
      severity: 'niggle',
    });
    return updateRecord(record.id, {
      status: 'filed', destination: 'Injury Log', filedAt, auto: false, error: null,
      undoData: { route: 'injury-log', injuryId: entry.id, area: entry.area },
    });
  }
  if (record.injuryId) {
    const { resolveInjuries } = await import('./injuryLog.js');
    const closed = await resolveInjuries(vaultPath, [record.injuryId]);
    // already closed some other way: his yes is noted, and there is nothing to undo
    if (!closed.length) return updateRecord(record.id, { status: 'filed', destination: null, filedAt, auto: false, error: null });
    return updateRecord(record.id, {
      status: 'filed', destination: 'Injury Log', filedAt, auto: false, error: null,
      // the closure's own undo (lib/verbs.js injury.close), reached through undoRoute's 'act'
      undoData: { route: 'act', verb: 'injury.close', ids: closed.map((c) => c.id), area: record.area || closed[0].area },
    });
  }
  throw new Error('this pain check names no session and no Injury Log entry');
}
