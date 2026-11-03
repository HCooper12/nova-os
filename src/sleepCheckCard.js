// WAS THAT YOUR WHOLE NIGHT? (3 Nov 2026, his report.) A night far shorter
// than his usual is held back by the server (server/lib/healthData.js
// sleepSuspect) and asked about ONCE, here, as content on Home: the morning
// it is recorded, until he answers or puts it away. Pure, so the rules are
// tested (server/test/sleepCheck.test.js); valsMission attaches the actions.

const hm = (min) => {
  const m = Math.round(Number(min) || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
};
export const sleepHm = hm;

// the stepper's reach and step: it starts on his usual exactly (7h 20m, not
// a rounded 7h 15m he would have to correct) and moves in quarter hours
export const STEP_MIN = 15;
export const NIGHT_MIN = 60;
export const NIGHT_MAX = 14 * 60;
export const clampNight = (m) => Math.max(NIGHT_MIN, Math.min(NIGHT_MAX, Math.round(Number(m) || 0)));

// `days`: the health days the server sent (gated). `local`: this device's
// state for the card ({ date, phase, draft, tick, pick, answered: {verdict,
// minutes}, recordId, leaving, gone, dismissedOn }; App.jsx answerSleepCheck).
// Returns null (no card) or the card's model.
export function sleepCheckState(days, today, local = {}) {
  const day = (days || []).find((d) => d?.date === today);
  const mine = local && local.date === today ? local : {};
  // settled and left, or put away on this device: gone for the day
  if (mine.gone || mine.dismissedOn === today) return null;
  // just answered here: the card stays for its receipt and Undo, then leaves
  if (mine.answered) {
    const a = mine.answered;
    return { date: today, phase: 'answered', verdict: a.verdict, minutes: a.minutes ?? null, line: answeredLine(a, day), leaving: !!mine.leaving, undoable: !!mine.recordId };
  }
  const s = day?.sleepSuspect;
  if (!s || s.verdict || s.dismissed) return null;
  return {
    date: today,
    tick: mine.tick || 'idle',
    pick: mine.pick || null,
    phase: mine.phase === 'stepping' ? 'stepping' : 'asking',
    minutes: s.minutes,
    usual: s.medianMinutes,
    line: `Last night shows ${hm(s.minutes)} of sleep against your usual ${hm(s.medianMinutes)}. Was that your whole night?`,
    draft: clampNight(mine.draft ?? s.medianMinutes),
  };
}

function answeredLine(a, day) {
  const rec = day?.sleepRawMinutes ?? day?.sleepSuspect?.minutes ?? day?.sleepAsleepMinutes ?? null;
  if (a.verdict === 'real') return rec ? `Kept: ${hm(rec)} was the whole night.` : 'Kept as a real night.';
  if (a.verdict === 'missed') return 'Left as not recorded. Nothing will read it as a short night.';
  return `Logged ${hm(a.minutes)} for last night.`;
}
