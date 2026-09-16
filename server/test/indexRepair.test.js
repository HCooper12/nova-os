// PAGES THE INDEX CANNOT REACH. Found on 15 Sep by checking his real vault:
// 51 pages existed under Wiki/Sources, Entities, Concepts and Topics and were
// linked from nothing, because earlier weaves had their index edit dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describePage, bulletFor, orphansIn, planIndexRepair, INDEXED_FOLDERS } from '../lib/indexRepair.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const INDEX = `# Index

## Sources
- [[Already Here]] — a page the index already knows about (updated 2026-09-01)

## Entities

## Concepts
- [[Known Concept]] — described (updated 2026-09-01)

## Topics

## Journal
- [[2026-09-15]] — 1 entry
`;

test('an orphan is a page the index does not link, in either wikilink form', () => {
  const pages = [
    { category: 'Sources', title: 'Already Here', body: '' },
    { category: 'Sources', title: 'Missing One', body: '' },
    { category: 'Concepts', title: 'Known Concept', body: '' },
  ];
  assert.deepEqual(orphansIn(INDEX, pages).map((p) => p.title), ['Missing One']);
  // an aliased link counts as reachable — the graph does not care about the label
  assert.deepEqual(orphansIn('- [[Missing One|see this]]', pages).map((p) => p.title), ['Already Here', 'Known Concept']);
});

test('the description comes off the page itself, never invented', () => {
  const src = `---
type: source
updated: 2026-09-13
---

# 3-Head Delt Isolation Cues

**Source:** Instagram Reel (1:21) by [[Kian Deehan]] (\`@kiandeehanfitness\`), fetched 2026-09-13.
More prose after.`;
  assert.equal(describePage(src), 'Instagram Reel (1:21) by Kian Deehan (@kiandeehanfitness), fetched 2026-09-13.');
  assert.equal(bulletFor('3-Head Delt Isolation Cues', src),
    '- [[3-Head Delt Isolation Cues]] — Instagram Reel (1:21) by Kian Deehan (@kiandeehanfitness), fetched 2026-09-13. (updated 2026-09-13)');
});

test('a section label is not a description — neither a bare one nor a bold lead-in', () => {
  // Kian Deehan's real page opens with the single word "Provenance."
  assert.equal(describePage('# X\n\nProvenance.\n\nHe is a coach who posts execution cues for delts.'),
    'He is a coach who posts execution cues for delts.');
  assert.equal(describePage('# X\n\n**Provenance.** He is a coach who posts execution cues.'),
    'He is a coach who posts execution cues.');
  // nothing usable at all → the title alone, which is still reachable and true
  assert.equal(describePage('# X\n\n## Only headings\n'), '');
  assert.equal(bulletFor('Bare', '---\nupdated: 2026-09-02\n---\n# Bare\n'), '- [[Bare]] (updated 2026-09-02)');
});

test('an unbalanced quote is not carried into the index', () => {
  assert.equal(describePage('# X\n\n"Build proportions, not just size. That is the whole claim.'),
    'Build proportions, not just size.');
});

test('the repair only ADDS, is one change, and running it twice is a no-op', () => {
  const vault = mkdtempSync(path.join(tmpdir(), 'nova-idxrepair-'));
  mkdirSync(path.join(vault, 'Wiki'), { recursive: true });
  for (const rel of Object.keys(INDEXED_FOLDERS)) mkdirSync(path.join(vault, rel), { recursive: true });
  writeFileSync(path.join(vault, 'Wiki/index.md'), INDEX);
  writeFileSync(path.join(vault, 'Wiki/Sources/Already Here.md'), '# Already Here\n\nSome real prose about it.\n');
  writeFileSync(path.join(vault, 'Wiki/Sources/Orphan Source.md'), '---\nupdated: 2026-09-14\n---\n# Orphan Source\n\nA video Nova wove and never indexed.\n');
  writeFileSync(path.join(vault, 'Wiki/Concepts/Orphan Concept.md'), '# Orphan Concept\n\nAn idea that exists and is unreachable.\n');

  const plan = planIndexRepair(vault);
  assert.deepEqual(plan.orphans.map((o) => o.title).sort(), ['Orphan Concept', 'Orphan Source']);
  assert.equal(plan.changes.length, 1, 'one file, one undoable change');
  assert.equal(plan.changes[0].path, 'Wiki/index.md');

  const next = plan.changes[0].content;
  assert.match(next, /- \[\[Orphan Source\]\] — A video Nova wove and never indexed\. \(updated 2026-09-14\)/);
  assert.match(next, /- \[\[Orphan Concept\]\] — An idea that exists and is unreachable\./);
  // NOTHING is removed or rewritten — his own lines are untouchable
  for (const line of INDEX.split('\n').filter((l) => l.trim().startsWith('-'))) {
    assert.ok(next.includes(line), `must keep his existing line: ${line}`);
  }
  // and each orphan landed under its own heading
  const concepts = next.slice(next.indexOf('## Concepts'), next.indexOf('## Topics'));
  assert.ok(concepts.includes('Orphan Concept'), 'a Concept goes under Concepts');
  assert.ok(!concepts.includes('Orphan Source'), 'and a Source does not');

  // second run against the repaired index finds nothing
  writeFileSync(path.join(vault, 'Wiki/index.md'), next);
  const again = planIndexRepair(vault);
  assert.equal(again.orphans.length, 0);
  assert.equal(again.changes.length, 0);
  assert.match(again.reason, /already reachable/);
});

test('a category with no heading in his index is named, not thrown over', () => {
  const vault = mkdtempSync(path.join(tmpdir(), 'nova-idxrepair2-'));
  for (const rel of Object.keys(INDEXED_FOLDERS)) mkdirSync(path.join(vault, rel), { recursive: true });
  // an index with Sources but no Concepts section
  writeFileSync(path.join(vault, 'Wiki/index.md'), '# Index\n\n## Sources\n');
  writeFileSync(path.join(vault, 'Wiki/Sources/A Source.md'), '# A Source\n\nReal prose describing the source.\n');
  writeFileSync(path.join(vault, 'Wiki/Concepts/A Concept.md'), '# A Concept\n\nReal prose describing the concept.\n');
  const plan = planIndexRepair(vault);
  assert.deepEqual(plan.orphans.map((o) => o.title), ['A Source'], 'the one that could be placed');
  assert.deepEqual(plan.skipped.map((o) => o.title), ['A Concept']);
  assert.match(plan.skipped[0].skipped, /No "## Concepts" section/);
  assert.match(plan.changes[0].content, /A Source/);
});
