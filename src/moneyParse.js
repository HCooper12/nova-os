// READING A MONEY AMOUNT HE TYPED (the audit's finding 5, 5 Oct 2026).
//
// The budget prompt passed his answer through Number(): "$250", "1,200" or
// "abc" became NaN, JSON sent null, the server rounded null to 0, and 0
// deleted the budget. The most natural way to write money erased it.
//
// One reader, shared by the screen (to enable Save and say what it read) and
// the server (which parses again, so no client can send it a NaN):
//   - "$250", " 250 ", "250.00", "$1,200", "1 200", "AUD 45.50" read as numbers
//   - "" (nothing typed) is EMPTY, which a budget reads as "clear it"
//   - anything else is UNREADABLE, and the caller keeps the old value and
//     says so; it is never turned into 0
//
// Returns { kind: 'number', value } | { kind: 'empty' } | { kind: 'unreadable' }.
export function readAmount(raw) {
  if (raw == null) return { kind: 'empty' };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { kind: 'number', value: raw } : { kind: 'unreadable' };
  const s = String(raw).trim();
  if (!s) return { kind: 'empty' };
  // a currency word or sign, thousands separators (comma, space, thin space,
  // apostrophe), a leading minus or a bracketed negative
  let t = s.replace(/^(aud|au\$|a\$|usd|us\$)\s*/i, '').replace(/\s*(aud|dollars?)$/i, '');
  let negative = false;
  const bracket = /^\((.*)\)$/.exec(t);
  if (bracket) { negative = true; t = bracket[1]; }
  if (/^[-−]/.test(t)) { negative = !negative; t = t.slice(1); }
  t = t.replace(/^\$/, '').replace(/[,\s  ']/g, '');
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(t)) return { kind: 'unreadable' };
  const n = Number(t);
  if (!Number.isFinite(n)) return { kind: 'unreadable' };
  return { kind: 'number', value: negative ? -n : n };
}

// What a budget field becomes: a whole number of dollars above zero, null to
// clear, or undefined when it could not be read (keep the old one).
export function budgetFromInput(raw) {
  const r = readAmount(raw);
  if (r.kind === 'empty') return null;
  if (r.kind !== 'number' || r.value < 0) return undefined;
  const whole = Math.round(r.value);
  return whole > 0 ? whole : null;
}
