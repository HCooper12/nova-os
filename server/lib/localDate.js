// HIS DAY, NOT UTC's.
//
// `new Date().toISOString().slice(0, 10)` is the reflex for "today", and it is
// wrong for every field a person reads. He is in AEST (UTC+10), so between
// midnight and 10am local the UTC date is still YESTERDAY — and he wakes at
// 04:30. Anything Nova stamped in his morning was dated a day early.
//
// Caught on 4 Sep: writing his equipment and injury fields at 08:29 local
// stamped Fitness Goals.md `updated: '2026-09-03'`. Same family as the leader
// timestamps that made the daily card look like it had not run, and the
// devtools clock that cost a detour — a whole class of bug in this codebase
// where UTC is read as local.
//
// Use this for any date a HUMAN will read: `updated`, `startedAt`,
// `resolvedAt`, "week of", provenance lines. Keep toISOString() for machine
// instants (createdAt, filedAt) where UTC is correct and unambiguous.
const pad = (n) => String(n).padStart(2, '0');

export function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
