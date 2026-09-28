// DOCUMENTS ON THE CLIENT (28 Sep 2026) — the promises the surfaces make,
// held where a render cannot be: that every chat splits a message into prose
// and document cards through the ONE shared parser; that a half-arrived
// document is cut out before the glass parser can raise a panel from inside
// it; that the interactive frame can never reach Nova's storage; and that the
// Documents screen is somewhere he can actually get to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { streamShown, sameWidthTokens, pendingTitle, agentOf, ageBucket, obsidianUrl } from '../../src/artifactClient.js';
import { matchesQuery, matchesFilter, docsHeadline } from '../../src/vals/valsDocuments.js';
import { PENDING_TOKEN } from '../../src/artifactBlocks.js';
import { parseVisualStream } from '../../src/visualBeats.js';
import { SCREEN_KEYS } from '../../src/screenKeys.js';
import { INDEX_GROUPS, ROW_META } from '../../src/indexGroups.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('ChatMarkdown splits every message through messageParts and draws cards', () => {
  const src = read('src/ChatMarkdown.jsx');
  assert.match(src, /import \{ messageParts \} from '\.\/artifactBlocks\.js';/);
  assert.match(src, /messageParts\(s, \{ final: true \}\)/);
  assert.match(src, /<ArtifactCard key=\{`a\$\{p\.id\}`\} id=\{p\.id\} \/>/);
  assert.match(src, /<ArtifactPending /);
  // Voice draws its bubbles through TypeText, so it must do the same
  const tt = read('src/TypeText.jsx');
  assert.match(tt, /messageParts\(text, \{ final: true \}\)/);
  assert.match(tt, /<ArtifactCard /);
});

test('the viewer\'s frame is sandboxed WITHOUT allow-same-origin', () => {
  const src = read('src/ArtifactViewer.jsx');
  const frames = [...src.matchAll(/<iframe\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(frames.length, 1, 'one frame');
  assert.match(frames[0], /sandbox="allow-scripts allow-forms"/);
  // (the comments may NAME the flag; no attribute may carry it)
  for (const m of src.matchAll(/sandbox=("[^"]*"|\{[^}]*\})/g)) assert.doesNotMatch(m[1], /allow-same-origin/, 'an opaque origin, so the page can never read the token');
  assert.doesNotMatch(frames[0], /allow-same-origin/);
  assert.doesNotMatch(src, /dangerouslySetInnerHTML/);
  // a page of its own that the back swipe can close
  assert.match(src, /role="dialog" aria-modal="true"[^>]*data-edge-page=""[^>]*onClick=\{close\}/);
});

test('the Documents screen is registered, lazy, rendered, in the nav and in the Index', () => {
  assert.ok(SCREEN_KEYS.includes('documents'));
  const app = read('src/App.jsx');
  assert.match(app, /documents: \(\) => import\('\.\/screens\/Documents\.jsx'\)/);
  assert.match(app, /const Documents = lazyScreen\(SCREEN_LOADERS\.documents, 'Documents'\);/);
  assert.match(app, /\{v\.isDocuments && <Documents v=\{v\} \/>\}/);
  assert.match(read('src/screens/Documents.jsx'), /^export function Documents\(\{ v \}\)/m, 'a lazy screen is a NAMED export');
  assert.match(read('src/vals/valsChrome.js'), /mkNav\('Documents', 'XX\.', 'documents'\)/);
  assert.ok(INDEX_GROUPS.some((g) => g.rows.includes('documents')));
  assert.equal(ROW_META.documents.label, 'Documents');
  // reachable from the More sheet under cupertino, where no sidebar is drawn
  assert.match(read('src/tabOrder.js'), /\['documents', 'Documents'\]/);
});

test('every streamed partial cuts documents out BEFORE the glass parser sees it', () => {
  const app = read('src/App.jsx');
  assert.match(app, /parseVisualStream\(streamShown\(job\.partial\)\)/, 'Ask Nova: documents first, then the glass');
  assert.doesNotMatch(app, /parseVisualStream\(job\.partial\)/, 'no raw partial reaches the glass parser');
  assert.match(app, /stripDirective\(streamShown\(job\.partial\)\);\n\s*if \(shown\) this\.applyStreamPartial\('coachChat'/);
  assert.match(app, /stripDirective\(streamShown\(job\.partial\)\);\n\s*if \(shown\) this\.applyStreamPartial\('leaderChat'/);
  // and what is spoken never includes a document or its token
  assert.match(app, /toSpokenProse\(speakableText\(t, \{ final: true \}\)\)/);
  // the viewer is a history level the back swipe and popstate close
  assert.match(app, /\.\.\.this\.documentsFromHistory\(\) \};/);
  assert.match(app, /window\.addEventListener\(OPEN_EVENT, this\.openArtH\)/);
});

test('streamShown: a half-arrived document shows as writing, never its body or its panels', () => {
  const partial = 'Here is the plan.\n\n<<<ARTIFACT {"title":"Four-day plan","kind":"doc"}\n# Four-day plan\nVIS {"kind":"metric","value":"4","label":"DAYS"}\nDay one: squat';
  assert.equal(parseVisualStream(partial).beats.length, 1, 'the raw partial WOULD raise a panel from inside the document');
  const shown = streamShown(partial);
  assert.ok(shown.endsWith(PENDING_TOKEN), shown);
  assert.doesNotMatch(shown, /Day one|VIS|Four-day plan\n/);
  assert.equal(pendingTitle(0), 'Four-day plan', 'the card can name what is being written');
  assert.equal(parseVisualStream(shown).beats.length, 0, 'no panel rises from inside a document');
  // closed but not filed yet: still "writing" until the real id arrives
  const closed = streamShown(`${partial}\nARTIFACT>>>\n\nThat is the week.`);
  assert.match(closed, /\[\[artifact:pending\]\]\n\nThat is the week\.$/);
  assert.doesNotMatch(closed, /new-0/);
});

test('sameWidthTokens keeps the speech offsets aligned across the swap to a real id', () => {
  const streamed = `A.\n\n${PENDING_TOKEN}\n\nB.`;
  const finished = 'A.\n\n[[artifact:4-day-plan-2026-09-28-ab12]]\n\nB.';
  assert.equal(sameWidthTokens(finished), streamed);
  assert.equal(sameWidthTokens(finished).length, streamed.length);
});

test('the list: search reads every word, chips filter by agent or kind, the headline is counted', () => {
  const now = Date.parse('2026-09-28T12:00:00');
  const items = [
    { id: 'a', title: 'Four-day plan', summary: 'Upper lower split', agent: 'coach', kind: 'doc', created: '2026-09-28T09:00:00', tags: ['training'] },
    { id: 'b', title: 'Protein calculator', summary: '', agent: 'nova', kind: 'html', created: '2026-09-25T09:00:00' },
    { id: 'c', title: 'One-on-one prep', summary: 'Questions', agent: 'leader', kind: 'doc', created: '2026-08-01T09:00:00' },
  ];
  assert.ok(matchesQuery(items[0], 'upper plan'));
  assert.ok(!matchesQuery(items[0], 'upper calculator'));
  assert.ok(matchesQuery(items[0], 'coach'), 'the agent\'s name is searchable');
  assert.deepEqual(items.filter((m) => matchesFilter(m, 'html')).map((m) => m.id), ['b']);
  assert.deepEqual(items.filter((m) => matchesFilter(m, 'leader')).map((m) => m.id), ['c']);
  assert.equal(ageBucket(items[0].created, now), 'today');
  assert.equal(ageBucket(items[1].created, now), 'week');
  assert.equal(ageBucket(items[2].created, now), 'earlier');
  const h = docsHeadline(items, now);
  assert.equal(h.line, '2 new this week');
  assert.match(h.sub, /^The latest from Coach, today at \d\d:\d\d$/);
  assert.deepEqual(docsHeadline([], now), { line: 'Nothing written yet', sub: '' });
  assert.equal(agentOf('coach').hue, 'var(--nv-m-chest)');
  assert.equal(agentOf('whoever').name, 'Nova');
});

test('Open in Obsidian only when the vault name is known; otherwise the path is offered to copy', () => {
  assert.equal(obsidianUrl({ path: 'Outputs/Nova/2026-09/x.md' }), null);
  assert.equal(obsidianUrl({ path: 'Outputs/Nova/2026-09/x.md', vault: "Hayden's Vault" }),
    `obsidian://open?vault=${encodeURIComponent("Hayden's Vault")}&file=${encodeURIComponent('Outputs/Nova/2026-09/x')}`);
});
