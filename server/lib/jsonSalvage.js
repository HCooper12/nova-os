// SALVAGING A MODEL'S JSON — after it has already failed to parse, never before.
//
// plan-today failed seven times between 22 and 31 August with the same error:
// "Expected ',' or ']' after array element", at roughly the same offset each
// time. His daily top-3 simply did not appear on those days, and because
// retrying re-runs the same prompt the three attempts failed identically.
//
// That error has one common cause: an UNESCAPED DOUBLE QUOTE inside a string
// value. A model writing about his calendar produces
//   {"why": "It's flagged as "Cook" on the calendar"}
// and the parser reads `"It's flagged as "` as the element, then meets `Cook`
// where it wanted a comma.
//
// THE SAFETY RULE, and the reason this is not reckless: a repair is attempted
// ONLY when the honest parse has already failed, and the result is accepted
// ONLY if it parses. A repair that does not yield valid JSON is discarded and
// the original error is reported unchanged. Worst case this is a no-op; it can
// never turn a good parse into a different one.
//
// It also reports whether it repaired anything, so a lane can say so out loud
// rather than quietly papering over a model that keeps producing bad output.

// Find the FIRST BALANCED object, not the greedy span to the last brace.
// `text.match(/\{[\s\S]*\}/)` — which 22 lanes use — swallows any prose after
// the JSON that happens to contain a closing brace, and turns a good reply
// into an unparseable one.
export function firstBalancedObject(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null; // never closed — a truncated reply, which is a real failure
}

// Drop-in for `text.match(/\{[\s\S]*\}/)`: same shape back (an array whose [0]
// is the object, or null) so the nineteen call sites that read `m[0]` did not
// each need rewriting — only the match did. The greedy form swallowed any
// prose after the JSON that contained a closing brace.
export function firstBalancedObjectMatch(text) {
  const block = firstBalancedObject(text);
  return block ? [block] : null;
}

// A `"` inside a string is legitimate only when it CLOSES that string, and it
// closes the string only if the next meaningful character is structural. Any
// other quote is one the model forgot to escape.
export function escapeStrayQuotes(json) {
  const s = String(json || '');
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch !== '"') { out += ch; continue; }
    if (!inString) { out += ch; inString = true; continue; }
    // we are inside a string and have met a quote — closing, or stray?
    let j = i + 1;
    while (j < s.length && /\s/.test(s[j])) j++;
    const next = s[j];
    if (next === undefined || next === ',' || next === ':' || next === '}' || next === ']') {
      out += ch; inString = false;              // a real close
    } else {
      out += '\\"';                              // a quote he meant literally
    }
  }
  return out;
}

// Raw newlines inside a string are also invalid JSON, and a model writing
// prose produces them. Same rule: only touched when already broken.
export function escapeRawNewlines(json) {
  const s = String(json || '');
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString && (ch === '\n' || ch === '\r')) { out += '\\n'; continue; }
    out += ch;
  }
  return out;
}

// The whole thing. Returns { value, repaired, error }.
//   value    — the parsed object, or null
//   repaired — false when it parsed honestly, true when a repair was needed
//   error    — the ORIGINAL parse error when nothing worked, never the
//              repaired one, because the original is what describes the model's
//              actual output
// Any control character (tab, form feed, a stray U+0001) inside a string
// literal is as fatal to JSON.parse as a raw newline — "Bad control character
// in string literal" killed a Researcher step on 5 Sep 2026 (record 3bf010e2).
// Same walk as escapeRawNewlines, wider net.
export function escapeControlChars(json) {
  let out = '';
  let inStr = false;
  let esc = false;
  for (const ch of String(json || '')) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += code === 0x0a ? '\\n' : code === 0x0d ? '\\r' : code === 0x09 ? '\\t' : '\\u' + code.toString(16).padStart(4, '0');
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}

// THE one way a lane should turn a model's JSON block into a value. Plain
// JSON.parse first; then the repairs, cheapest first; then the ORIGINAL error,
// so a failure still names its true cause. 18 lanes called JSON.parse on the
// balanced block directly until 6 Sep 2026.
export function parseModelJson(block) {
  const text = String(block || '');
  try { return JSON.parse(text); } catch (first) {
    for (const repair of [escapeControlChars, escapeStrayQuotes, (t) => escapeStrayQuotes(escapeControlChars(t))]) {
      try { return JSON.parse(repair(text)); } catch { /* next */ }
    }
    throw first;
  }
}

export function salvageJson(text) {
  const block = firstBalancedObject(text);
  if (!block) return { value: null, repaired: false, error: 'no complete JSON object in the reply' };
  try {
    return { value: JSON.parse(block), repaired: false, error: null };
  } catch (first) {
    for (const repair of [escapeRawNewlines, escapeControlChars, escapeStrayQuotes, (t) => escapeStrayQuotes(escapeControlChars(t))]) {
      try {
        const value = JSON.parse(repair(block));
        return { value, repaired: true, error: null };
      } catch { /* try the next repair */ }
    }
    return { value: null, repaired: false, error: first.message };
  }
}

// What to store on a failed record so the NEXT failure names its own cause.
// Seven identical failures taught nothing because the payload was never kept.
export function failureExcerpt(text, message, span = 160) {
  const s = String(text || '');
  const at = Number((/position (\d+)/.exec(String(message || '')) || [])[1]);
  if (!Number.isFinite(at)) return s.slice(0, span * 2);
  const from = Math.max(0, at - span);
  return `…${s.slice(from, at)}⟨HERE⟩${s.slice(at, at + span)}…`;
}
