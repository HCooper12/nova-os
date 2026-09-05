// His day, not UTC's — the client copy of server/lib/localDate.js.
//
// Same rule, same reason: he is in AEST and wakes at 04:30, so between
// midnight and 10am local the UTC date is still yesterday. Anything the client
// compares to "today" — which PR morning this is, whether a plan is today's —
// has to use the phone's local date, or the morning after a PR is judged
// against the wrong day for the first ten hours of it.
const pad = (n) => String(n).padStart(2, '0');
export function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
