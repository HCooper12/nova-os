// The Repertoire view. Written against HIS REAL payload shape, because the
// browser tooling was gone the session this shipped and this is the layer that
// could still be proved: what the list groups into, what each report's one line
// says, and that a discarded draft survives into the archive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFamilies, reportMeta, shapeReports } from '../../src/repertoireBook.js';

// the real seven, in the order the catalogue holds them
const REAL = [
  { id: 'vocal', name: 'Vocal & Nonverbal Certainty', family: 'Persuasive delivery / credibility signaling', tried: 0, seen: 1 },
  { id: 'presup', name: 'Presupposition (Milton Model)', family: 'Suggestive language patterns', tried: 0, seen: 0 },
  { id: 'fep', name: 'False Evidence Ploy', family: 'Interrogation & confrontation tactics', tried: 0, seen: 0 },
  { id: 'threat', name: 'Instructed (Verbal) Threat Learning', family: 'Fear learning without direct experience', tried: 0, seen: 0 },
  { id: 'nocebo', name: 'Nocebo Suggestion', family: 'Expectation-driven symptom production', tried: 0, seen: 0 },
  { id: 'bear', name: 'Ironic Process Rebound', family: 'Cognitive rebound effects', tried: 0, seen: 0 },
  { id: 'voodoo', name: 'Voodoo Death', family: 'Belief-driven physiology (extreme case, context only)', tried: 0, seen: 0 },
];

test('grouping keeps PAGE order, and a position is the number it will be taught at', () => {
  const fams = groupFamilies(REAL);
  assert.equal(fams.length, 7, 'his seven happen to sit in seven families');
  assert.equal(fams[0].techniques[0].position, 1);
  assert.equal(fams[6].techniques[0].position, 7, 'the Voodoo Death entry is number seven, as Home says');
  // the positions across all families are 1..n with no gaps and no repeats
  const positions = fams.flatMap((f) => f.techniques.map((t) => t.position));
  assert.deepEqual(positions, [1, 2, 3, 4, 5, 6, 7]);
});

test('two techniques in one family sit together, still numbered by page order', () => {
  const fams = groupFamilies([
    { id: 'a', name: 'A', family: 'Suggestion' },
    { id: 'b', name: 'B', family: 'Cold reading' },
    { id: 'c', name: 'C', family: 'Suggestion' },
  ]);
  assert.deepEqual(fams.map((f) => f.name), ['Suggestion', 'Cold reading']);
  assert.deepEqual(fams[0].techniques.map((t) => t.position), [1, 3], 'C keeps its page position, not a per-family one');
});

test('a technique with no family is Unfiled rather than undefined', () => {
  assert.equal(groupFamilies([{ id: 'x', name: 'X' }])[0].name, 'Unfiled');
  assert.deepEqual(groupFamilies([]), []);
});

/* -------------------------------- reports -------------------------------- */

test("a report's one line is facts off the record, and nothing else", () => {
  assert.equal(
    reportMeta({ at: '2026-09-15T01:49:20.135Z', status: 'filed', added: 7, confirmLine: 'Analysed 42-second Instagram reel by bondwayne — transcript read, 14 frames seen, 22 sources cited.' }),
    '2026-09-15 · Analysed 42-second Instagram reel by bondwayne — transcript read, 14 frames seen, 22 sources cited. · 7 techniques · kept',
  );
});

test('a top-up says why it ran instead of borrowing a coverage line it never had', () => {
  const line = reportMeta({ at: '2026-09-22T00:00:00Z', status: 'pending', added: 6, topUp: true, confirmLine: null });
  assert.match(line, /researched when the curriculum ran low/);
  assert.doesNotMatch(line, /Analysed/, 'nothing was analysed for a top-up — it must not claim one');
});

test('a DISCARDED draft survives into the archive, labelled', () => {
  const shaped = shapeReports([
    { id: '1', title: 'The kept one', status: 'filed', at: '2026-09-15T02:00:00Z', added: 7, body: 'x' },
    { id: '2', title: 'An earlier draft', status: 'discarded', at: '2026-09-15T01:00:00Z', added: 5, body: 'y' },
  ]);
  assert.equal(shaped.length, 2, 'the research archive is what was actually done, not a tidied version');
  assert.equal(shaped[0].kept, true);
  assert.equal(shaped[1].kept, false);
  assert.match(shaped[1].meta, /discarded draft/);
});

test('exactly one report is open at a time, and none by default', () => {
  const rs = [{ id: 'a', title: 'A', status: 'filed', body: 'x' }, { id: 'b', title: 'B', status: 'filed', body: 'y' }];
  assert.deepEqual(shapeReports(rs).map((r) => r.open), [false, false]);
  assert.deepEqual(shapeReports(rs, 'b').map((r) => r.open), [false, true]);
});
