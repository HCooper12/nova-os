// The counts in "the brief is done: 3 sections, 4 sources" are code's, read
// off the brief's own markdown (the Rose study §2.5, 8 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { briefCounts, briefDoneLine, briefCard } from '../../src/briefCounts.js';

const BODY = `# Busy Bar

## What it is
A desk display from Flipper Devices [1].

## Price
$249, on sale at $199 [2].

## Sources
- [1] https://busy.app/
- [2] https://www.wired.com/review/flipper-busy-bar/
- [3] https://www.wired.com/review/flipper-busy-bar/.
`;

test('sections are headings, sources are distinct links (a trailing full stop is not a different source)', () => {
  assert.deepEqual(briefCounts(BODY), { sections: 4, sources: 2 });
  assert.deepEqual(briefCounts(''), { sections: 0, sources: 0 });
});

test('the done line names the brief, the counts and one offer; no counts, no colon', () => {
  assert.equal(briefDoneLine('Busy Bar', { sections: 4, sources: 2 }), 'Busy Bar is done, sir: 4 sections, 2 sources. Want it on screen?');
  assert.equal(briefDoneLine('Busy Bar', { sections: 1, sources: 0 }), 'Busy Bar is done, sir: 1 section. Want it on screen?');
  assert.equal(briefDoneLine('', {}), 'The brief is done, sir. Want it on screen?');
});

test('the note card carries the title and the first prose lines, never headings, links or markers', () => {
  const c = briefCard('Busy Bar', BODY);
  assert.equal(c.kind, 'note');
  assert.equal(c.label, 'Busy Bar');
  assert.deepEqual(c.lines, ['A desk display from Flipper Devices.', '$249, on sale at $199.']);
  assert.equal(briefCard('Empty', '# Only a heading\n'), null);
});
