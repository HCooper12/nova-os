// AUTOCORRECT ON PROSE FIELDS (29 Sep 2026). His report: "Auto correct is not
// working within nova which is annoying when typing gym notes etc." The
// likely cause was never an explicit autoCorrect="off" — it was controlled
// inputs round-tripping through App's whole-tree re-render on every
// keystroke, which on iOS can race the keyboard's own autocorrect/undo bar.
// LocalInput.jsx (local echo, debounced push) is the fix already used by
// Voice and Inbox; this pins three of the newly-converted prose fields to
// LocalInput with autocorrect explicitly ON, and guards that no prose field
// anywhere in src/ ever sets autoCorrect="off" — that stays reserved for the
// URL/token fields in Settings.jsx and Stash.jsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// finds the (self-closing) JSX element whose props include the given
// `value={...}` prefix, and returns the full opening-tag source so its
// attributes can be inspected. All three fields this file pins are
// self-closing LocalInput elements, so this does not need to handle
// children or nested tags.
function findElementByValue(src, valueSnippet) {
  const at = src.indexOf(valueSnippet);
  assert.ok(at >= 0, `expected to find ${JSON.stringify(valueSnippet)} in source`);
  const tagStart = src.lastIndexOf('<', at);
  const tagEnd = src.indexOf('/>', at);
  assert.ok(tagEnd >= 0, `expected a self-closing tag after ${JSON.stringify(valueSnippet)}`);
  return src.slice(tagStart, tagEnd + 2);
}

test('the Workouts session-note field is a LocalInput with autocorrect explicitly on', () => {
  const src = read('src/screens/Workouts.jsx');
  const el = findElementByValue(src, 'value={e.note}');
  assert.match(el, /^<LocalInput\b/, 'the session note should render as a LocalInput, not a plain textarea');
  assert.match(el, /autoCorrect="on"/);
  assert.match(el, /spellCheck/);
});

test('the Coach chat input is a LocalInput with autocorrect explicitly on', () => {
  const src = read('src/screens/Workouts.jsx');
  const el = findElementByValue(src, 'value={v.coachInput}');
  assert.match(el, /^<LocalInput\b/, 'the Coach input should render as a LocalInput, not a plain Interactive input');
  assert.match(el, /autoCorrect="on"/);
  assert.match(el, /spellCheck/);
});

test('the Fuel "Log anything…" describe field is a LocalInput with autocorrect explicitly on', () => {
  const src = read('src/screens/Recipes.jsx');
  const el = findElementByValue(src, 'value={v.foodDescribeInput}');
  assert.match(el, /^<LocalInput\b/, 'the describe field should render as a LocalInput, not a plain Interactive input');
  assert.match(el, /autoCorrect="on"/);
  assert.match(el, /spellCheck/);
});

// FILES ALLOWED TO DISABLE AUTOCORRECT — deliberately, for URL/token fields
// he never wants "corrected" (a paste of an API key or a URL). Nothing else
// in src/ may carry autoCorrect="off": that would silently reintroduce the
// bug this test file exists to catch.
const ALLOWED_AUTOCORRECT_OFF = new Set([
  'src/screens/Settings.jsx',
  'src/screens/Stash.jsx',
]);

function listJsFiles(absDir, relDir, out) {
  for (const name of readdirSync(absDir)) {
    const abs = join(absDir, name);
    const rel = relDir ? `${relDir}/${name}` : name;
    const st = statSync(abs);
    if (st.isDirectory()) { listJsFiles(abs, rel, out); continue; }
    if (/\.(jsx?|tsx?)$/.test(name)) out.push(rel);
  }
  return out;
}

test('no prose field outside Settings/Stash sets autoCorrect="off"', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, '../../src');
  const files = listJsFiles(srcRoot, 'src', []);
  const offenders = [];
  for (const rel of files) {
    if (ALLOWED_AUTOCORRECT_OFF.has(rel)) continue;
    const text = readFileSync(join(here, '../..', rel), 'utf8');
    if (/autoCorrect=["']off["']/.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});
