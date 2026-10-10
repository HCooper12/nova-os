// WHO WROTE A JOURNAL ENTRY (11 Oct 2026). Since 1 Sep his Journal held 214
// entries and none was his, yet readers took `personal` and `training`
// sections as his voice. These tests pin the four things the fix rests on:
// legacy entries are attributed from what is already in the heading, every
// writer stamps its author, a page Nova did not regenerate stays byte for
// byte, and the agents that read Wiki/Journal themselves are told the rule.
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-jauthor-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-jauthor-vault-'));
process.env.NOVA_DATA_DIR = dataDir;
process.env.NOVA_VAULT_GRACE_MS = '0';

import test from 'node:test';
import assert from 'node:assert/strict';

const J = await import('../lib/journal.js');
const { addEntry, removeEntry, listEntries, journalAuthorOf, parseJournalHeading, LABEL_AUTHORS, JOURNAL_AUTHORSHIP_RULE, appendSectionRaw, removeSectionRaw } = J;

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(here, '..');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

test('legacy entries are attributed from the label their writer already put in the heading', () => {
  const by = (line) => parseJournalHeading(line).author;
  assert.equal(by('## 07:00 · system — Morning dispatch'), 'nova');
  assert.equal(by('## 19:30 · system — Evening debrief'), 'nova');
  assert.equal(by('## 06:10 · personal — Plan today'), 'nova', 'personal is a category, not an author');
  assert.equal(by('## 21:30 · personal — Daily review reflection'), 'nova');
  assert.equal(by('## 18:02 · training — Session receipt'), 'coach', 'training is a category, not an author');
  assert.equal(by('## 17:00 · training — Weekly debrief'), 'coach');
  assert.equal(by('## 08:00 · system — Leader follow-up'), 'leader');
  assert.equal(by('## 09:00 · system — Guardian report'), 'guardian');
  assert.equal(by('## 09:00 · system — CFO report'), 'cfo');
  assert.equal(by('## 21:00 · personal — Reflection on [[Deep Work]]'), 'hayden', 'the reflect card is his typing');
  assert.equal(by('## 21:00 — Reflection on [[Focus]]'), 'hayden');
  assert.equal(by('## 12:00 · personal — Said to Nova'), 'hayden');
  assert.equal(by('## 22:00 · personal'), 'hayden', 'an unlabelled entry with a category is the composer or his capture');
  assert.equal(by('## 09:15'), 'unknown', 'a bare heading from before categories is honestly unattributed');
  assert.equal(by('## 10:00 · system — Something new'), 'unknown', 'a label nobody owns is never his');
  // the marker wins over the label, in either case
  assert.equal(by('## 21:30 · personal · by Hayden — Plan today'), 'hayden');
  assert.equal(by('## 21:30 · personal · by nova'), 'nova');
  assert.equal(journalAuthorOf({ by: 'Mallory', heading: null, category: 'personal' }), 'hayden', 'an unknown marker falls back to the heading rules');
});

test('every label any writer files under has an owner', async () => {
  const files = [
    ...(await readdir(path.join(serverRoot, 'lib'))).map((f) => path.join(serverRoot, 'lib', f)),
    ...(await readdir(path.join(serverRoot, 'routes'))).map((f) => path.join(serverRoot, 'routes', f)),
    path.join(serverRoot, '..', 'src', 'App.jsx'),
  ].filter((f) => /\.(js|jsx)$/.test(f));
  const seen = new Set();
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    // journal payload labels sit beside a journal category
    for (const m of src.matchAll(/category: '(?:personal|training|system)',(?: author: '[a-z]+',)? label: '([^']+)'/g)) seen.add(m[1]);
    for (const m of src.matchAll(/'Weekly review' : slot === 'morning' \? '([^']+)' : '([^']+)'/g)) { seen.add(m[1]); seen.add(m[2]); }
  }
  seen.add('Weekly review');
  assert.ok(seen.size >= 15, `found the writers' labels (${seen.size})`);
  for (const label of seen) assert.ok(LABEL_AUTHORS[label], `"${label}" has an author in LABEL_AUTHORS`);
});

test('every server writer of a journal decision stamps its author', async () => {
  const offenders = [];
  for (const dir of ['lib', 'routes']) {
    for (const f of await readdir(path.join(serverRoot, dir))) {
      if (!f.endsWith('.js')) continue;
      const src = await readFile(path.join(serverRoot, dir, f), 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (!/route: 'journal'/.test(line) || /===|undo/.test(line)) return;
        const window = lines.slice(i, i + 12).join('\n');
        const at = window.indexOf('payload:');
        // the payload's first lines (template literals hold braces, so no brace matching)
        const payload = at === -1 ? '' : window.slice(at).split('\n').slice(0, 5).join('\n');
        if (!/author: '(nova|coach|leader|guardian|cfo|hayden)'/.test(payload)) offenders.push(`${dir}/${f}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(offenders, [], 'a journal payload without an author would be read by its label alone');
});

test('the writer puts the author in the heading, and refuses an entry nobody owns', async () => {
  const a = await addEntry(vault, { text: 'Brief body.', author: 'nova', category: 'system', label: 'Morning dispatch' });
  const b = await addEntry(vault, { text: 'Pull logged.', author: 'coach', category: 'training', label: 'Session receipt' });
  const c = await addEntry(vault, { text: 'Felt sharp.', author: 'hayden' });
  const d = await addEntry(vault, { text: 'A reflection.', linkedTitle: 'Deep Work' });
  assert.equal(d.author, 'hayden');
  const raw = await readFile(path.join(vault, 'Wiki/Journal', `${a.date}.md`), 'utf8');
  assert.match(raw, new RegExp(`## ${a.time} · system · by Nova — Morning dispatch\\n`));
  assert.match(raw, new RegExp(`## ${b.time} · training · by Coach — Session receipt\\n`));
  assert.match(raw, new RegExp(`## ${c.time} · personal · by Hayden\\n`));
  assert.match(raw, new RegExp(`## ${d.time} · personal · by Hayden — Reflection on \\[\\[Deep Work\\]\\]\\n`));
  const [day] = await listEntries(vault, { limit: 1 });
  assert.deepEqual(day.sections.map((s) => s.author), ['nova', 'coach', 'hayden', 'hayden']);
  await assert.rejects(addEntry(vault, { text: 'Who wrote this?' }), /needs its author/);
  await assert.rejects(addEntry(vault, { text: 'Who wrote this?', label: 'Unheard-of label' }), /needs its author/);
  await rm(path.join(vault, 'Wiki'), { recursive: true, force: true });
});

test('the inbox rails stamp the author: his captures, Nova\'s proposals, agents by label', async () => {
  const { normalizeDecision, fileDecision } = await import('../lib/inbox.js');
  const d = normalizeDecision({ route: 'journal', confidence: 'high', title: 't', reason: 'r', payload: { text: 'Long day, good session.' } });
  assert.equal(d.payload.author, 'hayden', 'a classified capture is his words, lightly cleaned');
  // a decision classified before the stamp existed, still pending: his capture
  const legacy = await fileDecision(vault, { route: 'journal', confidence: 'high', title: 't', reason: 'r', payload: { text: 'An older capture.' } });
  const agent = await fileDecision(vault, { route: 'journal', confidence: 'high', title: 't', reason: 'r', payload: { text: 'Receipt.', category: 'training', label: 'Session receipt' } });
  const proposed = await fileDecision(vault, { route: 'journal', confidence: 'high', title: 't', reason: 'r', payload: { text: 'Nova drafted this.', author: 'nova' } });
  const [day] = await listEntries(vault, { limit: 1 });
  const byText = Object.fromEntries(day.sections.map((s) => [s.text, s.author]));
  assert.equal(byText['An older capture.'], 'hayden');
  assert.equal(byText['Receipt.'], 'coach');
  assert.equal(byText['Nova drafted this.'], 'nova');
  assert.ok(legacy.undo && agent.undo && proposed.undo);
  await rm(path.join(vault, 'Wiki'), { recursive: true, force: true });
});

// A page as his vault really holds it: entries from before categories, from
// before the author marker, hand-spaced, with an unquoted created date gray-
// matter would re-serialise as a timestamp if the page were regenerated.
const MIXED = [
  '---', 'type: journal', 'tags: []', 'created: 2026-10-05', "updated: '2026-10-05'", '---', '# 2026-10-05', '',
  '## 07:00 · system — Morning dispatch', '', '**Today:** Pull, 3 meetings.', '- [ ] protein by noon', '',
  '## 09:15', '', 'Pre-category line.', '', '',
  '## 18:02 · training · by Coach — Session receipt', '', 'Pull logged.', '',
  '## 22:00 · personal', '', 'His own line,   with odd spacing.  ', '',
].join('\n');

test('a vault page with a mix of entries round-trips byte for byte', async () => {
  // appending and then undoing the append gives back the page exactly
  const appended = appendSectionRaw(MIXED, '2026-10-05', { time: '22:30', category: 'personal', by: 'Hayden', heading: null, text: 'One more.' });
  assert.ok(appended.startsWith(MIXED), 'every byte already there is kept, in place');
  assert.equal(appended.slice(MIXED.length), '\n## 22:30 · personal · by Hayden\n\nOne more.\n');
  assert.equal(removeSectionRaw(appended, 4), MIXED);

  // through the real writer: the page on disk, then add and undo
  await mkdir(path.join(vault, 'Wiki/Journal'), { recursive: true });
  const { date } = await addEntry(vault, { text: 'probe', author: 'hayden' });
  const full = path.join(vault, 'Wiki/Journal', `${date}.md`);
  const page = MIXED.replaceAll('2026-10-05', date);
  await writeFile(full, page, 'utf8');
  const added = await addEntry(vault, { text: 'Added then undone.', author: 'nova', category: 'system', label: 'Evening debrief' });
  assert.ok((await readFile(full, 'utf8')).startsWith(page), 'the old page is a prefix of the new one (same day, so `updated` is unchanged)');
  assert.equal(await removeEntry(vault, { date: added.date, time: added.time, text: added.text }), true);
  assert.equal(await readFile(full, 'utf8'), page, 'undo leaves the mixed page exactly as it was');

  // undoing an entry in the middle cuts only that section
  assert.equal(await removeEntry(vault, { date, time: '09:15', text: 'Pre-category line.' }), true);
  const cut = await readFile(full, 'utf8');
  assert.equal(cut, page.replace('## 09:15\n\nPre-category line.\n\n\n', ''));

  // and the parse of the mixed page attributes each entry from what is there
  await writeFile(full, page, 'utf8');
  const day = (await listEntries(vault)).find((x) => x.date === date);
  assert.deepEqual(day.sections.map((s) => s.author), ['nova', 'unknown', 'coach', 'hayden']);
  await rm(path.join(vault, 'Wiki'), { recursive: true, force: true });
});

test('the agents that read Wiki/Journal themselves are told who wrote what', async () => {
  for (const label of Object.keys(LABEL_AUTHORS)) assert.ok(JOURNAL_AUTHORSHIP_RULE.includes(`"${label}"`), `the rule names "${label}"`);
  assert.match(JOURNAL_AUTHORSHIP_RULE, /Never tell him "you said", "you wrote" or "you promised"/);
  const { buildAskPrompt, buildCoachPrompt } = await import('../lib/claudeCode.js');
  const { buildReviewPrompt } = await import('../lib/dailyReview.js');
  const { buildPlanPrompt } = await import('../lib/planToday.js');
  const { buildDebriefPrompt } = await import('../lib/weeklyDebrief.js');
  for (const [name, p] of [
    ['Ask Nova', buildAskPrompt({ question: 'q', context: 'c' })],
    ['Coach', buildCoachPrompt({ question: 'q', context: 'c' })],
    ['Daily review', buildReviewPrompt('c')],
    ['Plan today', buildPlanPrompt('c')],
    ['Weekly debrief', buildDebriefPrompt('c')],
  ]) assert.ok(p.includes(JOURNAL_AUTHORSHIP_RULE), `${name} carries the rule`);
  const { NOVA_LENS } = await import('../lib/lens.js');
  assert.match(NOVA_LENS, /the journal entries he wrote/);
});
