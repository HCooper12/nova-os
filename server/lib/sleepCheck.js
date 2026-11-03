import { randomUUID } from 'node:crypto';
import {
  loadDay, loadRecentDays, readSleepChecks, writeSleepCheck, ingestHealthPayload,
  setDaySleep, sleepFieldsOf, hmOf,
} from './healthData.js';

// HIS ANSWER ABOUT A NIGHT THAT LOOKED TOO SHORT (3 Nov 2026).
//
// healthData.js holds a suspect night back from every reader (sleepSuspect,
// applySleepGate); this file is the only writer of what he says about it.
// Three answers, the three things that can be true of a short recording:
//   real       "Yes, that was it": the night was that short; it passes to
//              every reader as recorded.
//   missed     "No, the watch missed it": the night stays unknown. Nova never
//              invents a figure for him.
//   corrected  "I slept about…": his hours and minutes become that date's
//              sleep through the manual save (saveDay manual: true), which
//              stamps sleepManual so no later HealthKit push can replace it.
// Each answer is one inbox record with Undo (kind 'sleep-check'); Undo puts
// the answer AND the day file back exactly as they were, so the card asks
// again. Putting the card away is not an answer (dismissSleepCheck).

export const SLEEP_VERDICTS = ['real', 'missed', 'corrected'];
export const CORRECTION_MIN = 30;
export const CORRECTION_MAX = 16 * 60;
const SLEEP_LOOKBACK = 14;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// what the record and the spoken reply say, one place so the card, the
// Inbox row and the voice receipt cannot disagree
export function sleepAnswerWords(verdict, { date, recorded, minutes }) {
  const when = dayLabel(date);
  if (verdict === 'real') {
    return { destination: `Health: ${when}'s ${hmOf(recorded)} of sleep kept as a real night`, said: `Kept. ${hmOf(recorded)} it is.` };
  }
  if (verdict === 'missed') {
    return { destination: `Health: ${when}'s sleep left unknown (the watch missed it)`, said: 'Got it. I will treat last night as not recorded.' };
  }
  return { destination: `Health: ${when}'s sleep set to ${hmOf(minutes)} (your figure)`, said: `Noted. ${hmOf(minutes)} for last night.` };
}

// Validates and writes; `record: false` is for the spoken verb, which files
// its own 'act' record around the undo this returns.
export async function answerSleepCheck({ date, verdict, minutes = null, source = 'home' } = {}, { record = true } = {}) {
  if (!isDate(date)) throw new Error('date must be YYYY-MM-DD');
  if (!SLEEP_VERDICTS.includes(verdict)) throw new Error(`answer must be one of ${SLEEP_VERDICTS.join(', ')}`);
  let mins = null;
  if (verdict === 'corrected') {
    mins = Math.round(Number(minutes));
    if (!Number.isFinite(mins) || mins < CORRECTION_MIN || mins > CORRECTION_MAX) {
      throw new Error(`a night's sleep has to be between ${hmOf(CORRECTION_MIN)} and ${hmOf(CORRECTION_MAX)}`);
    }
  }
  const checks = await readSleepChecks();
  const prior = checks[date] || null;
  // one answer per night; changing it is Undo, which puts everything back and
  // asks again (so a corrected figure never has to be unpicked by guesswork)
  if (prior?.verdict) throw new Error(`${dayLabel(date)}'s sleep is already answered; Undo that answer in the Inbox to change it`);
  // only a night the gate held back is his to answer here; anything else is
  // an ordinary manual sleep edit, not this
  const shown = (await loadRecentDays(SLEEP_LOOKBACK)).find((d) => d.date === date);
  if (!shown?.sleepSuspect) throw new Error(`${dayLabel(date)}'s sleep is not waiting on an answer`);
  const before = await loadDay(date);
  const recorded = shown.sleepRawMinutes;
  const priorSleep = sleepFieldsOf(before);

  await writeSleepCheck(date, { verdict, ...(mins != null ? { minutes: mins } : {}), at: new Date().toISOString() });
  let wroteSleep = false;
  if (verdict === 'corrected') {
    try {
      const res = await ingestHealthPayload({ date, metrics: { sleepAsleepMinutes: mins }, manual: true, source: 'sleep-check' });
      if (!res.ok) throw new Error(res.error || 'the day file refused it');
      wroteSleep = true;
    } catch (e) {
      await writeSleepCheck(date, prior); // nothing half-done
      throw e;
    }
  }

  const words = sleepAnswerWords(verdict, { date, recorded, minutes: mins });
  const undo = { kind: 'sleep-check', date, verdict, minutes: mins, prior, priorSleep, wroteSleep };
  broadcast('health');
  if (!record) return { ...words, undo };
  const { createRecord } = await import('./inboxStore.js');
  const at = new Date().toISOString();
  const rec = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'sleep-check',
    text: `Sleep on ${dayLabel(date)}: ${verdict === 'real' ? 'that was the whole night' : verdict === 'missed' ? 'the watch missed it' : `about ${hmOf(mins)}`}`,
    source,
    mode: 'auto',
    status: 'filed',
    auto: true,
    createdAt: at,
    filedAt: at,
    destination: words.destination,
    decision: { route: 'health', confidence: 'high', title: words.destination, reason: 'His own answer about a night that recorded far shorter than usual.', by: 'code', payload: { date, verdict, ...(mins != null ? { minutes: mins } : {}) } },
    undoData: undo,
  });
  broadcast('inbox');
  return { ...words, record: rec };
}
// The undo half: the answer goes, and the day's sleep is put back only if it
// is still what this answer wrote (a later edit of his is left alone).
export async function undoSleepCheck(undo) {
  const { date } = undo || {};
  if (!isDate(date)) throw new Error('that sleep answer has no date');
  if (undo.wroteSleep) {
    const now = await loadDay(date);
    if (undo.verdict === 'corrected' && Number(now?.sleepAsleepMinutes) !== Number(undo.minutes)) {
      throw new Error(`${dayLabel(date)}'s sleep has been changed since, so I left it alone`);
    }
    await setDaySleep(date, undo.priorSleep || null);
  }
  // the answer goes entirely (a dismissal before it included), so the card asks again
  await writeSleepCheck(date, null);
  broadcast('health');
  return `${dayLabel(date)}'s sleep is waiting on your answer again`;
}

// Put away without an answer: the night stays held back from every reader,
// and the card does not come back for it. Not his health data, so no record.
export async function dismissSleepCheck(date) {
  if (!isDate(date)) throw new Error('date must be YYYY-MM-DD');
  const checks = await readSleepChecks();
  if (checks[date]?.verdict) return checks[date];
  const entry = { ...(checks[date] || {}), dismissedAt: new Date().toISOString() };
  await writeSleepCheck(date, entry);
  broadcast('health');
  return entry;
}

function broadcast(kind) {
  import('./events.js').then(({ broadcast: b }) => b(kind)).catch(() => {});
}
