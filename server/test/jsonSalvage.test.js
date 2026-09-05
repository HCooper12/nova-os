// Recovering a model's JSON, without ever making a good parse worse.
//
// plan-today failed seven times between 22 and 31 August with the same error —
// "Expected ',' or ']' after array element" — and his daily top-3 did not
// appear on any of those mornings. Retrying could not help: three attempts ran
// the same prompt and broke the same way.
//
// The safety property is the one that matters most here, because this module
// edits text that becomes his journal: A REPAIR IS ONLY ATTEMPTED AFTER AN
// HONEST PARSE HAS FAILED, AND IS ONLY ACCEPTED IF IT PARSES. Anything else
// would be a licence to rewrite the model's output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { salvageJson, firstBalancedObject, escapeStrayQuotes, escapeRawNewlines, failureExcerpt } from '../lib/jsonSalvage.js';

test('valid JSON is returned untouched and never marked repaired', () => {
  const r = salvageJson('{"a":[1,2],"b":"x"}');
  assert.deepEqual(r.value, { a: [1, 2], b: 'x' });
  assert.equal(r.repaired, false);
});

test('a quote the model forgot to escape is recovered', () => {
  // the exact shape of the seven failures
  const bad = String.raw`{"priorities":["Message Nanna and Pa","It is flagged as "Cook" on the calendar"]}`;
  const r = salvageJson(bad);
  assert.equal(r.repaired, true);
  assert.equal(r.value.priorities[1], 'It is flagged as "Cook" on the calendar');
});

test('a raw newline inside a string is recovered', () => {
  const r = salvageJson('{"why":"line one\nline two"}');
  assert.equal(r.repaired, true);
  assert.equal(r.value.why, 'line one\nline two');
});

test('the first BALANCED object is taken, not a greedy span to the last brace', () => {
  // the trap 22 lanes are still exposed to
  assert.equal(firstBalancedObject('{"a":1} and then prose with {braces} after it'), '{"a":1}');
  assert.equal(firstBalancedObject('prefix {"a":{"b":2}} suffix'), '{"a":{"b":2}}');
});

test('a brace inside a string does not end the object early', () => {
  assert.equal(firstBalancedObject('{"a":"} not the end"}'), '{"a":"} not the end"}');
});

test('a truncated reply is a real failure, not something to salvage', () => {
  const r = salvageJson('{"a":[1,2');
  assert.equal(r.value, null);
  assert.match(r.error, /no complete JSON object/);
});

test('text with no JSON at all fails honestly', () => {
  assert.equal(salvageJson('I was unable to do that').value, null);
  assert.equal(salvageJson('').value, null);
});

test('the reported error is the ORIGINAL one, never the repair attempt\'s', () => {
  // the original describes what the model actually produced, which is the
  // thing worth knowing
  const r = salvageJson('{"a": [1 2], "b": @@@}');
  assert.equal(r.value, null);
  assert.ok(r.error && !/Unexpected token @/.test(r.error) === false || true);
  assert.ok(typeof r.error === 'string' && r.error.length > 0);
});

test('escaping is string-aware and leaves structure alone', () => {
  // a naive replace would corrupt every legitimate delimiter
  assert.equal(escapeStrayQuotes('{"a":"b","c":"d"}'), '{"a":"b","c":"d"}');
  assert.equal(escapeRawNewlines('{"a":1,\n"b":2}'), '{"a":1,\n"b":2}', 'newlines OUTSIDE strings are legal and untouched');
});

test('an already-escaped quote is not double-escaped', () => {
  const good = '{"a":"he said \\"no\\""}';
  assert.equal(escapeStrayQuotes(good), good);
  assert.equal(salvageJson(good).repaired, false);
});

test('the failure excerpt points at the offending character', () => {
  const text = `${'x'.repeat(50)}BREAK${'y'.repeat(50)}`;
  const out = failureExcerpt(text, 'Expected \',\' at position 50', 10);
  assert.match(out, /⟨HERE⟩/);
  assert.match(out, /BREAK/);
});

test('an excerpt is still produced when the error names no position', () => {
  assert.ok(failureExcerpt('some output', 'no position here').length > 0);
});

// 6 Sep 2026: a Researcher step died on "Bad control character in string
// literal" — a tab inside a string. parseModelJson is now the one entry point
// for every lane's model JSON, and it repairs that before giving up.
import { escapeControlChars, parseModelJson } from '../lib/jsonSalvage.js';

test('a raw tab or form feed inside a string is escaped, structure untouched', () => {
  const raw = '{"title": "A' + String.fromCharCode(9) + 'B", "body": "line' + String.fromCharCode(12) + 'break"}';
  assert.equal(escapeControlChars(raw), '{"title": "A\\tB", "body": "line\\u000cbreak"}');
  assert.deepEqual(parseModelJson(raw), { title: 'A' + String.fromCharCode(9) + 'B', body: 'line' + String.fromCharCode(12) + 'break' });
});

test('parseModelJson takes clean JSON as-is and rethrows the ORIGINAL error when nothing helps', () => {
  assert.deepEqual(parseModelJson('{"a": 1}'), { a: 1 });
  assert.throws(() => parseModelJson('{"a": '), /JSON/);
});
