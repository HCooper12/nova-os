// The Daily review's structured summary (mockup 98). NOVA_DATA_DIR is a
// throwaway dir set BEFORE the import, so the cache never lands in his data.
process.env.NOVA_DATA_DIR = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'nova-rvsum-'));

const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const {
  validateReviewSummary, stripMinutes, minutesFromTime, originGrounded,
  getCachedReviewSummary, writeCachedReviewSummary, buildReviewSummaryPrompt,
} = await import('../lib/reviewSummary.js');
const { NOVA_LENS } = await import('../lib/lens.js');

// invented input, nothing from his vault
const INPUT = {
  text: 'A two-part check for advice. The hosts credit the idea to an old sailing proverb from the Harbour Almanac. Incentives and skill both have to be present.',
  sourceTime: '41:12',
};
const good = () => ({
  synthesis: 'Weigh advice by two things at once. Does the giver gain when you do well, and do they know the work?',
  provenance: 'A guest put it to the host on The Long Table, 41 minutes into ep. 112',
  origin: 'An old sailing proverb in the Harbour Almanac',
  keyPoints: [{ term: 'Aligned incentives', line: 'They benefit when you improve.' }, { term: '**Competence**', line: 'They have done the thing.' }],
  reflection: 'Whose feedback on your training block passes both tests this week?',
});

test('validator: a good object passes and comes back clean', () => {
  const v = validateReviewSummary(good(), INPUT);
  assert.equal(v.ok, true);
  assert.equal(v.value.keyPoints[1].term, 'Competence');
  assert.equal(v.value.origin, 'An old sailing proverb in the Harbour Almanac');
  assert.equal(v.value.minutesIn, 41);
  assert.doesNotMatch(v.value.provenance, /41|minute/);
});

test('validator: missing required fields are refused whole', () => {
  for (const drop of ['synthesis', 'keyPoints']) {
    const o = good(); delete o[drop];
    assert.equal(validateReviewSummary(o, INPUT).ok, false, drop);
  }
  assert.equal(validateReviewSummary({ ...good(), keyPoints: [] }, INPUT).ok, false);
  assert.equal(validateReviewSummary({ ...good(), keyPoints: [{ term: '', line: 'x' }] }, INPUT).ok, false);
});

test('validator: garbage is refused', () => {
  for (const g of [null, 'a paragraph', [], 42, { synthesis: 7, keyPoints: 'x' }, { ...good(), synthesis: 'One. Two. Three. Four.' }]) {
    assert.equal(validateReviewSummary(g, INPUT).ok, false);
  }
});

test('an unsentenced 400-char reflection is dropped, the summary kept', () => {
  const v = validateReviewSummary({ ...good(), reflection: 'x'.repeat(400) }, INPUT);
  assert.equal(v.ok, true);
  assert.equal(v.value.reflection, null);
});

test('optional fields absent: provenance and reflection are null, not invented', () => {
  const o = good(); delete o.provenance; delete o.reflection; delete o.origin;
  const v = validateReviewSummary(o, INPUT);
  assert.equal(v.ok, true);
  assert.equal(v.value.provenance, null);
  assert.equal(v.value.reflection, null);
  assert.equal(v.value.origin, null);
});

test('no minutes without a source time, wherever the model wrote them', () => {
  const o = { ...good(), synthesis: 'At 12:30 the idea lands. It is simple.', keyPoints: [{ term: 'Skill', line: 'Said about 65 minutes in.' }] };
  const v = validateReviewSummary(o, { text: INPUT.text, sourceTime: null });
  assert.equal(v.ok, true);
  assert.equal(v.value.minutesIn, null);
  assert.equal(v.value.sourceTime, null);
  const all = JSON.stringify(v.value);
  assert.doesNotMatch(all, /\d+\s*min|\d:\d\d/);
  assert.equal(stripMinutes('Host with guest, 65 minutes into Episode Nine'), 'Host with guest');
  assert.equal(minutesFromTime('1:05:39'), 65);
  assert.equal(minutesFromTime('nonsense'), null);
});

test('no origin unless the input says it', () => {
  const v = validateReviewSummary({ ...good(), origin: 'The Buddha in the Sallatha Sutta' }, INPUT);
  assert.equal(v.ok, true);
  assert.equal(v.value.origin, null);
  assert.equal(originGrounded('An old sailing proverb', INPUT.text), true);
  assert.equal(originGrounded('Ancient Stoic philosophy', INPUT.text), false);
  assert.equal(originGrounded('Harbour Almanac', ''), false);
});

test('cache is keyed by the page body hash: an edit invalidates it', async () => {
  const s = validateReviewSummary(good(), INPUT).value;
  assert.equal(await getCachedReviewSummary('page-a', 'body one'), null);
  await writeCachedReviewSummary('page-a', 'body one', s);
  assert.deepEqual(await getCachedReviewSummary('page-a', 'body one'), s);
  assert.equal(await getCachedReviewSummary('page-a', 'body one, edited'), null);
  assert.equal(await getCachedReviewSummary('page-b', 'body one'), null);
});

test('the prompt starts with NOVA_LENS and states the rules', () => {
  const p = buildReviewSummaryPrompt({ title: 'T', body: 'B', sourceTitle: null, lifeFacts: '' });
  assert.ok(p.startsWith(NOVA_LENS));
  assert.match(p, /NEVER mention minutes/);
  assert.match(p, /ONLY if the text below says so/);
});

test('an over-long reflection keeps its opening sentences, never fails the summary', async () => {
  const { validateReviewSummary, LIMITS } = await import('../lib/reviewSummary.js');
  const first = 'What would change this week if you treated it as owed?';
  const raw = { synthesis: 'One idea, said plainly.', provenance: null, origin: null,
    keyPoints: [{ term: 'Principal', line: 'The thing deferred.' }],
    reflection: `${first} ${'And then a much longer tail that runs on. '.repeat(12)}` };
  const r = validateReviewSummary(raw, { text: 'One idea said plainly.' });
  assert.equal(r.ok, true);
  assert.ok(r.value.reflection.startsWith(first));
  assert.ok(r.value.reflection.length <= LIMITS.reflection);
});
