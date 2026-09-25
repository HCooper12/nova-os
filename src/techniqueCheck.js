// DID IT LAND? — the pure half of Wrap the day's question about today's
// technique (25 Sep 2026, the report-back half of the Hormozi reel's loop:
// pick it, do it, report back). The view model (valsMission) attaches the
// actions; the rules about WHEN to ask live here, where they can be tested.

// A technique's name without its trailing gloss — "Presupposition (Milton
// Model)" → "Presupposition". The reel's band is one line and its landing
// must never be an ellipsis (seen at 375px: "Ironic Process Rebound (the
// "w…"), and a question reads better on the name he will remember. A name
// that is ONLY a gloss stays whole. The card always carries the full name.
export const shortTechniqueName = (n) => String(n || '').replace(/\s*\([^()]*\)\s*$/, '').trim() || String(n || '');

// The question for today, or null when there is nothing to ask: no technique
// served, or he passed on it (only what he tried can have landed).
//   tick       — the house tick's state while "It landed" is being written
//   reopenedOn — the day he tapped Change on the receipt
export function techniqueQuestionState(r, { tick = 'idle', reopenedOn = null } = {}) {
  if (!r?.technique || r.outcome === 'skipped') return null;
  return {
    name: shortTechniqueName(r.technique.name),
    tell: r.technique.tell || '',
    result: r.result || null,
    note: r.note || '',
    tick,
    // the receipt shows once the tick has finished drawing, until he reopens it
    answered: !!r.result && tick === 'idle' && reopenedOn !== r.date,
  };
}

// THE EVENING WITHOUT A PLATE. The food wrap only appears when something is
// logged; on a day nothing was, the technique would never be asked about. So
// from 18:00 the wrap can be the question alone — unless he dismissed the
// wrap today — and once answered it stays only to show the receipt of an
// answer given here tonight (not one given elsewhere this morning).
export const WRAP_FROM_HOUR = 18; // twin of wrapDay.js CARD_FROM_HOUR
export function questionOnlyWrap(q, { hour, day, dismissedOn = null, answeredOn = null }) {
  if (!q || !(hour >= WRAP_FROM_HOUR)) return false;
  if (dismissedOn && day && dismissedOn === day) return false;
  return !q.answered || (!!day && answeredOn === day);
}
