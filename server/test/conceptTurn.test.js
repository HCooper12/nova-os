// BRING BACK WHAT NEVER CAME UP (second-brain audit #3). The Daily Review's new
// pick gets a memory, the Leader's spacing, and his standing rules still hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';

const root = await mkdtemp(path.join(tmpdir(), 'nova-concept-turn-'));
process.env.NOVA_DATA_DIR = path.join(root, 'data');
process.env.NOVA_VAULT_GRACE_MS = '0';
await mkdir(process.env.NOVA_DATA_DIR, { recursive: true });
const vaultPath = path.join(root, 'vault');
await mkdir(path.join(vaultPath, 'Wiki/Concepts'), { recursive: true });
await mkdir(path.join(vaultPath, 'Wiki/Sources'), { recursive: true });
await mkdir(path.join(vaultPath, 'Wiki/Library'), { recursive: true });

const {
  pickNew, buildQueue, noteSurfaced, noteDismissed, surfacedSpacing, SURFACE_SCHEDULE, reviewToday, submitAnswer, undoConceptAnswer, reviewable,
} = await import('../lib/conceptReview.js');
const { pickSpaced, SCHEDULE: LEADER_SCHEDULE } = await import('../lib/leader.js');
const { Vault } = await import('../lib/vault.js');

test.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));

const DAY = 86_400_000;
const NOW = new Date('2026-11-09T07:00:00').getTime(); // a Monday
const page = (id, tags, sources = []) => ({ id: `Wiki/Concepts/${id}`, title: id, type: 'concept', tags, sources, links: [], date: '2026-10-01', paragraphs: ['x'] });
const ONE = page('One Source', ['leadership'], [{ title: 'S1' }]);
const TWO = page('Two Sources', ['psychology'], [{ title: 'S1' }, { title: 'S2' }]);
const GYM = page('Bench Arch', ['training', 'hypertrophy'], [{ title: 'S1' }, { title: 'S2' }, { title: 'S3' }]);
const pages = [ONE, TWO, GYM];

test('the order is the rank he set: mind only, never training, cross-source first', () => {
  assert.equal(reviewable(GYM), false);
  assert.equal(pickNew(pages, {}, new Map(), 'mind').id, TWO.id);
});

test('a concept shown steps back and the next one gets its turn, without him answering anything', () => {
  let state = noteSurfaced({}, TWO.id, '2026-11-09', NOW);
  const tomorrow = pickNew(pages, {}, new Map(), 'mind', { spacing: state, nowMs: NOW + DAY });
  assert.equal(tomorrow.id, ONE.id, 'yesterday it stayed on the same card until he graded it');
  state = noteSurfaced(state, ONE.id, '2026-11-10', NOW + DAY);
  const after = pickNew(pages, {}, new Map(), 'mind', { spacing: state, nowMs: NOW + 4 * DAY });
  assert.equal(after.id, TWO.id, 'its three days are up');
});

test('one showing a day, however many times Home draws it', () => {
  const once = noteSurfaced({}, TWO.id, '2026-11-09', NOW);
  assert.equal(noteSurfaced(once, TWO.id, '2026-11-09', NOW + 1000), once);
  assert.equal(noteSurfaced(once, TWO.id, '2026-11-10', NOW + DAY)[TWO.id].count, 2);
});

test('a concept the Leader already worked in has had a turn; the card\'s own record wins', () => {
  const spacing = surfacedSpacing({}, { 'concept:Two Sources': { count: 2, lastAt: NOW } }, pages);
  assert.equal(pickNew(pages, {}, new Map(), 'mind', { spacing, nowMs: NOW + DAY }).id, ONE.id);
  const own = surfacedSpacing({ [TWO.id]: { count: 9, lastAt: 1 } }, { 'concept:Two Sources': { count: 2, lastAt: NOW } }, pages);
  assert.equal(own[TWO.id].count, 9);
});

test('when every concept has had a recent turn, the best one still shows: never an empty card', () => {
  const state = { [TWO.id]: { count: 1, lastAt: NOW }, [ONE.id]: { count: 1, lastAt: NOW } };
  assert.equal(pickNew(pages, {}, new Map(), 'mind', { spacing: state, nowMs: NOW + 1000 }).id, TWO.id);
});

test('passing a concept by widens its gap, and it stays out of the queue until that has run', () => {
  const shown = noteSurfaced({}, TWO.id, '2026-11-09', NOW);
  const passed = noteDismissed(shown, TWO.id, NOW);
  assert.equal(passed[TWO.id].count, 3);
  assert.equal(passed[TWO.id].dismissed, 1);
  const cards = { [TWO.id]: { step: 1, due: '2026-11-10' } };
  const quiet = buildQueue({ pages, cards, backlinkCounts: new Map(), today: '2026-11-11', spacing: passed, nowMs: new Date('2026-11-11T07:00:00').getTime() });
  assert.ok(!quiet.queue.some((q) => q.id === TWO.id && q.kind === 'due'), 'twelve days, not one');
  const later = buildQueue({ pages, cards, backlinkCounts: new Map(), today: '2026-11-22', spacing: passed, nowMs: NOW + 13 * DAY });
  assert.ok(later.queue.some((q) => q.id === TWO.id && q.kind === 'due'));
});

test('it reuses the Leader\'s spacing, so the two cannot drift', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(SURFACE_SCHEDULE), [0, 1, 2, 3, 4, 5].map(LEADER_SCHEDULE));
  assert.deepEqual(pickSpaced(['a', 'b'], { b: { count: 1, lastAt: NOW } }, NOW + DAY, 2), ['a'], 'the Leader picks as it did');
});

test('the card: a day shows one new concept, tomorrow the next, and a passed-by answer can be undone', async () => {
  const write = (name, tags, sources) => writeFile(path.join(vaultPath, 'Wiki/Concepts', `${name}.md`), matter.stringify(`# ${name}\n\nBody.\n`, { type: 'concept', tags, sources, created: '2026-10-01' }), 'utf8');
  await write('Wise Feedback', ['leadership', 'communication'], ['[[S1]]', '[[S2]]']);
  await write('Calm Is Information', ['leadership'], ['[[S1]]']);
  await writeFile(path.join(vaultPath, 'Wiki/Library/Review Log.md'), '# Review Log\n\n', 'utf8');
  const vault = new Vault(vaultPath);
  const mon = await reviewToday(vaultPath, vault, new Date('2026-11-09T07:00:00'));
  assert.equal(mon.items[0].id, 'Wiki/Concepts/Wise Feedback');
  const tue = await reviewToday(vaultPath, vault, new Date('2026-11-10T07:00:00'));
  assert.equal(tue.items[0].id, 'Wiki/Concepts/Calm Is Information');
  const { readFile } = await import('node:fs/promises');
  const read = async () => JSON.parse(await readFile(path.join(process.env.NOVA_DATA_DIR, 'concept-surfaced.json'), 'utf8'));
  const { record } = await submitAnswer(vaultPath, vault, { pageId: 'Wiki/Concepts/Calm Is Information', grade: 'read' }, new Date('2026-11-10T08:00:00'));
  assert.equal((await read())['Wiki/Concepts/Calm Is Information'].dismissed, 1);
  await undoConceptAnswer(vaultPath, record.undoData);
  assert.equal((await read())['Wiki/Concepts/Calm Is Information'].dismissed, undefined, 'undo takes the step back too');
});

test('no notification path: this lane touches only the card', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../lib/conceptReview.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /sendPush|sendTelegram|notify\(/);
});
