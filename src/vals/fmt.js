// Cached Intl formatters. `toLocaleDateString`/`toLocaleTimeString`/
// `toLocaleString` construct a NEW Intl formatter on every call — ~0.04ms
// each, which is invisible once and ruinous in a loop: the Inbox history
// (292 records × 2 calls) alone cost 10.7ms of every single render, and
// renderVals runs on every keystroke, poll tick and streaming delta in the
// app (measured 23 Aug: valsInbox 15.0ms of renderVals' 17.2ms total; the
// same formatting through cached instances is 0.05ms). Construction is the
// entire cost — a cached instance's .format() is ~200× faster and
// byte-identical in output.
//
// Usage: dtf('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date)
// in place of date.toLocaleTimeString('en-GB', { hour: ..., minute: ... }).
// Pass '' (or undefined) as the locale for the runtime default, exactly
// like calling toLocale* with no locale argument.
const dtfCache = new Map();
export function dtf(locale, options) {
  const key = `${locale || ''}|${JSON.stringify(options)}`;
  let f = dtfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale || undefined, options);
    dtfCache.set(key, f);
  }
  return f;
}

const nfCache = new Map();
export function nf(locale, options) {
  const key = `${locale || ''}|${JSON.stringify(options)}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale || undefined, options);
    nfCache.set(key, f);
  }
  return f;
}
