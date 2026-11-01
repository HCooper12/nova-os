// WHICH "ONE THING FIRST" MAY RIDE INTO HIS TURN. Pure; shared by the app
// (App.sayFirstThing) and the server's tests.
//
// 1 Nov 2026: the morning's "HRV is down 12% on your baseline" alert was
// raised at 20:13 UTC, shown on the island, and then SPOKEN three and a half
// hours later, straight after his question about a mock-up of his new
// program (alerts log: health-hrv, acted spoken-only, 12,844,897 ms). He was
// not talking about his body. A reading of his body is said aloud only when
// his own words are about his body or about training today; otherwise its
// card has already done the job, and it stays a card. Everything else that
// waits for a "one thing first" (a connection that is off, a late note) is
// unchanged.

// A reading of his body, as opposed to a fault in the data pipe.
export function isBodyReading(alert) {
  const kind = String(alert?.kind || '');
  return /^health-/.test(kind) && kind !== 'health-missed-push';
}

const ABOUT_HIS_BODY = /\b(?:hrv|heart rate|resting heart|sleep|slept|tired|fatigue|fatigued|exhausted|energy|recovery|recovered|readiness|ready to train|rest day|deload|sore|soreness|how am i|how do i feel|feeling|train today|training today|work ?out today|session today|should i (?:train|lift|go to the gym|rest)|go hard|go heavy|take it easy)\b/;

export function firstThingFits(alert, hisWords = '') {
  if (!isBodyReading(alert)) return true;
  return ABOUT_HIS_BODY.test(String(hisWords || '').toLowerCase().replace(/[’‘]/g, "'"));
}
