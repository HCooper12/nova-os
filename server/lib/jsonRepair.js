// EMPTY-VALUE JSON REPAIR — for the iOS Shortcuts health push.
//
// The Shortcut builds its body by interpolating HealthKit variables into a
// JSON string. When a metric has no sample that morning (no resting-HR
// reading, no VO2 max that week) the variable resolves to NOTHING, and the
// body arrives as `{"restingHeartRate":,"hrv":70}` — malformed. body-parser
// rejects the whole payload, so ONE missing metric threw away every other
// metric in the push, and the phone was told "internal error".
//
// A missing HealthKit sample is not corruption: it means "no reading", which
// this system already represents as null everywhere. So the honest repair is
// to read those empty slots as null and keep the rest of the push.
//
// STRING-AWARE, deliberately. A naive /:\s*(?=[,}])/ regex would also fire
// inside string values ("note":"time: , here") and corrupt real data. This
// walks the text tracking string/escape state and only repairs colons in
// structural position. It writes to his health record — a cheap regex is not
// good enough here.

// Returns { text, repaired } — `repaired` is the count of empty values that
// became null, so the caller can log honestly instead of silently patching.
export function repairEmptyJsonValues(input) {
  const text = String(input ?? '');
  let out = '';
  let repaired = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === ':' || ch === ',') {
      // skip whitespace to find what actually follows
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const next = text[j];
      // `"k":,`  `"k":}`  → the value is missing
      if (ch === ':' && (next === ',' || next === '}')) {
        out += ':null';
        repaired++;
        i = j - 1;
        continue;
      }
      // `[1,,2]` → a missing array element; `{"a":1,}` → a trailing comma,
      // which is malformed but unambiguous, so drop it rather than fail
      if (ch === ',' && next === ',') {
        out += ',null';
        repaired++;
        i = j - 1;
        continue;
      }
      if (ch === ',' && (next === '}' || next === ']')) {
        repaired++;
        i = j - 1;
        continue; // emit nothing — the trailing comma disappears
      }
    }
    out += ch;
  }
  return { text: out, repaired };
}

// Parse a body that strict JSON.parse rejected, repairing empty values.
// Returns { value, repaired } on success, or null when the text is broken in
// some OTHER way — a repair that still doesn't parse must fail honestly
// rather than hand back half a payload.
export function parseWithEmptyValues(input) {
  const { text, repaired } = repairEmptyJsonValues(input);
  if (!repaired) return null; // nothing we know how to fix — not our case
  try {
    return { value: JSON.parse(text), repaired };
  } catch {
    return null;
  }
}
