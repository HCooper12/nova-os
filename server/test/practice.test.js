// Practice — the store and the page. Deterministic pieces only: the page
// contract (round-trip identity), the in-place writers and their undo, the
// dossier validation, the picker. Temp data dir + temp vault BEFORE imports.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-practice-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  parsePracticePage, formatPracticePage, slugOf, listSkills, readSkill, validateDossier,
  writeSkillPage, nextScene, appendSession, removeSessionLine, setSkillStatus, recomputeTallies,
  undoPracticeSkill, undoPracticeSession, undoPracticeStatus, practiceSummary, practiceLine,
  hashOf, PRACTICE_DIR,
} = await import('../lib/practice.js');

async function tempVault() {
  const vault = await mkdtemp(path.join(tmpdir(), 'nova-practice-vault-'));
  await mkdir(path.join(vault, 'Wiki', 'Practice'), { recursive: true });
  await mkdir(path.join(vault, 'Wiki', 'Concepts'), { recursive: true });
  await writeFile(path.join(vault, 'Wiki', 'Concepts', 'Questions of Intent.md'), '# Questions of Intent\n', 'utf8');
  await writeFile(path.join(vault, 'Wiki', 'Concepts', 'Silence as Leverage.md'), '# Silence as Leverage\n', 'utf8');
  return vault;
}

const SKILL = {
  title: 'Questions of intent',
  summary: 'Answering a dig with a question that makes the other person own what they meant.',
  status: 'active',
  created: '2026-09-20',
  updated: '2026-09-26',
  sources: ['[[Questions of Intent]]', '[[Silence as Leverage]]'],
  why: '"I really love the ideas in chapter 8 and I want to practise them."',
  moves: [
    { name: 'Question of intent', summary: 'Ask what they meant instead of reacting to how it sounded.', line: '"Did you mean for that to sound rude?"', when: 'a belittling or condescending remark.', tell: 'they restate or soften it.', source: '[[Questions of Intent]]' },
    { name: 'Silence first', summary: 'Let the remark hang before you answer.', line: 'Say nothing for five seconds, then: "Say that again?"', when: 'the moment after the dig lands.', tell: 'they fill the silence themselves.', source: '[[Silence as Leverage]]' },
  ],
  scenarios: [
    { name: 'The offhand dig in a team meeting', setting: 'A colleague comments on your work in front of others.', other: 'Mark, a peer who is stressed and a little competitive.', pressure: 'he doubles down once, then goes quiet if you hold.', moves: ['Question of intent', 'Silence first'] },
    { name: 'The email with a tone', setting: 'A client replies to your update with a sharp one-liner.', other: 'Priya, a client under deadline pressure.', pressure: 'she escalates to your manager if you get defensive.', moves: ['Question of intent'] },
  ],
  gaps: ['The book itself is unread by Nova. Upload the EPUB in Library and the moves get grounded in the text.'],
  sessions: [
    { date: '2026-09-26', scenario: 'The offhand dig in a team meeting', landed: [], missed: ['Silence first', 'Question of intent'], work: 'let the pause run to five seconds before you answer.' },
    { date: '2026-09-24', scenario: 'The email with a tone', landed: ['Question of intent'], missed: [], work: 'keep the question short.' },
  ],
};

/* --------------------------- the page contract --------------------------- */

test('format → parse → format is byte-identical (two moves, two scenes, one gap, two sessions, an empty landed)', () => {
  const s = formatPracticePage(SKILL);
  assert.equal(formatPracticePage(parsePracticePage(s)), s);
  const p = parsePracticePage(s);
  assert.equal(p.title, SKILL.title);
  assert.equal(p.status, 'active');
  assert.deepEqual(p.sources, SKILL.sources);
  assert.equal(p.why, SKILL.why);
  assert.equal(p.moves.length, 2);
  assert.equal(p.moves[1].line, SKILL.moves[1].line);
  assert.deepEqual(p.scenarios[0].moves, ['Question of intent', 'Silence first']);
  assert.deepEqual(p.gaps, SKILL.gaps);
  assert.deepEqual(p.sessions[0].landed, [], 'an empty landed list reads back empty');
  assert.match(s, /landed: — · missed: Silence first, Question of intent/);
  assert.match(s, /^---\ntype: practice\nstatus: active\ncreated: '2026-09-20'\nupdated: '2026-09-26'\nsources:\n  - '\[\[Questions of Intent\]\]'/);
});

test('the page reads exactly as the plan documents it', () => {
  const s = formatPracticePage({ ...SKILL, sessions: SKILL.sessions.slice(0, 1), scenarios: SKILL.scenarios.slice(0, 1), moves: SKILL.moves.slice(0, 1), sources: SKILL.sources.slice(0, 1) });
  assert.equal(s, `---
type: practice
status: active
created: '2026-09-20'
updated: '2026-09-26'
sources:
  - '[[Questions of Intent]]'
---
# Questions of intent

Answering a dig with a question that makes the other person own what they meant.

## Why
> "I really love the ideas in chapter 8 and I want to practise them."

## Moves
### Question of intent
Ask what they meant instead of reacting to how it sounded.
- **Line:** "Did you mean for that to sound rude?"
- **When:** a belittling or condescending remark.
- **Tell:** they restate or soften it.
- **Source:** [[Questions of Intent]]

## Scenarios
### The offhand dig in a team meeting
A colleague comments on your work in front of others.
- **Other person:** Mark, a peer who is stressed and a little competitive.
- **Pressure:** he doubles down once, then goes quiet if you hold.
- **Moves:** Question of intent · Silence first

## Gaps
- The book itself is unread by Nova. Upload the EPUB in Library and the moves get grounded in the text.

## Sessions
- 2026-09-26 · The offhand dig in a team meeting · landed: — · missed: Silence first, Question of intent · work on: let the pause run to five seconds before you answer.
`);
});

test('an empty page round-trips too, and a quote in a source survives the YAML quoting', () => {
  const s = formatPracticePage({ title: 'X', moves: [], scenarios: [], sources: ["[[Hayden's Notes]]"], created: '2026-09-27', updated: '2026-09-27' });
  assert.equal(formatPracticePage(parsePracticePage(s)), s);
  assert.deepEqual(parsePracticePage(s).sources, ["[[Hayden's Notes]]"]);
});

test('slugOf is kebab of the title', () => {
  assert.equal(slugOf('Questions of intent'), 'questions-of-intent');
  assert.equal(slugOf("Hayden's  Silence!"), 'haydens-silence');
});

/* ------------------------ in-place writes and undo ------------------------ */

async function seed(vault, skill = SKILL) {
  const rel = `${PRACTICE_DIR}/${skill.title}.md`;
  const raw = formatPracticePage(skill);
  await writeFile(path.join(vault, rel), raw, 'utf8');
  return { rel, full: path.join(vault, rel), raw };
}

test('a hand-edited page survives appendSession byte for byte, except the new line and the updated stamp', async () => {
  const vault = await tempVault();
  const { full, raw } = await seed(vault);
  // his hand: an extra line in Why, and a note trailing the Sessions list
  const edited = raw
    .replace('practise them."\n', 'practise them."\nA line I added by hand, not a quote.\n')
    .replace(/\n$/, '\n\nTrailing note he wrote after the sessions.\n');
  await writeFile(full, edited, 'utf8');

  const out = await appendSession(vault, 'questions-of-intent', {
    date: '2026-09-27', scenario: 'The email with a tone', landed: ['Silence first'], missed: [], work: 'hold the pause.',
  }, { now: new Date(2026, 8, 27, 9) });
  const after = await readFile(full, 'utf8');
  const expected = edited
    .replace("updated: '2026-09-26'", "updated: '2026-09-27'")
    .replace('## Sessions\n', `## Sessions\n${out.line}\n`);
  assert.equal(after, expected);
  assert.equal(out.line, '- 2026-09-27 · The email with a tone · landed: Silence first · missed: — · work on: hold the pause.');
  assert.equal(out.before, hashOf(edited));
  assert.equal(out.after, hashOf(after));
  // and the parsed page reads the new session first
  assert.equal(parsePracticePage(after).sessions[0].date, '2026-09-27');
});

test('appendSession then undoPracticeSession leaves the page byte-identical', async () => {
  const vault = await tempVault();
  const { full, raw, rel } = await seed(vault);
  const out = await appendSession(vault, 'questions-of-intent', {
    date: '2026-09-27', scenario: 'The offhand dig in a team meeting', landed: ['Question of intent'], missed: ['Silence first'], work: 'count to five.',
  }, { now: new Date(2026, 8, 27, 9) });
  assert.notEqual(await readFile(full, 'utf8'), raw);
  const said = await undoPracticeSession(vault, { relPath: rel, slug: 'questions-of-intent', line: out.line, updatedLine: out.updatedLine, addedHeading: out.addedHeading });
  assert.match(said, /took that session back/);
  assert.equal(await readFile(full, 'utf8'), raw);
  // a second undo is honest about there being nothing left to take
  assert.match(await undoPracticeSession(vault, { relPath: rel, slug: 'questions-of-intent', line: out.line }), /already gone/);
});

test('a page with no Sessions section gains one, and the undo takes the heading back out too', async () => {
  const vault = await tempVault();
  const { full, raw, rel } = await seed(vault);
  const noSessions = raw.slice(0, raw.indexOf('\n## Sessions')) + '\n';
  await writeFile(full, noSessions, 'utf8');
  const out = await appendSession(vault, 'questions-of-intent', { date: '2026-09-27', scenario: 'The email with a tone', landed: [], missed: ['Silence first'], work: 'w' }, { now: new Date(2026, 8, 27, 9) });
  assert.equal(out.addedHeading, true);
  assert.match(await readFile(full, 'utf8'), /\n## Sessions\n- 2026-09-27/);
  await undoPracticeSession(vault, { relPath: rel, slug: 'questions-of-intent', line: out.line, updatedLine: out.updatedLine, addedHeading: true });
  assert.equal(await readFile(full, 'utf8'), noSessions);
});

test('removeSessionLine takes out only the exact line', async () => {
  const vault = await tempVault();
  const { full } = await seed(vault);
  const line = '- 2026-09-24 · The email with a tone · landed: Question of intent · missed: — · work on: keep the question short.';
  assert.equal(await removeSessionLine(vault, 'questions-of-intent', line), true);
  assert.ok(!(await readFile(full, 'utf8')).includes(line));
  assert.equal(await removeSessionLine(vault, 'questions-of-intent', line), false);
});

test('setSkillStatus changes only the status and updated lines, and its undo restores them byte for byte', async () => {
  const vault = await tempVault();
  const { full, raw } = await seed(vault);
  const out = await setSkillStatus(vault, 'questions-of-intent', 'paused', { now: new Date(2026, 8, 27, 9) });
  assert.equal(out.prior, 'active');
  const after = await readFile(full, 'utf8');
  assert.equal(after, raw.replace('status: active', 'status: paused').replace("updated: '2026-09-26'", "updated: '2026-09-27'"));
  await undoPracticeStatus(vault, { slug: 'questions-of-intent', prior: out.prior, statusLine: out.statusLine, updatedLine: out.updatedLine });
  assert.equal(await readFile(full, 'utf8'), raw);
  await assert.rejects(setSkillStatus(vault, 'questions-of-intent', 'finished'), /active, paused, landed/);
});

/* ------------------------------- validation ------------------------------- */

const PATHS = new Set(['questions of intent', 'silence as leverage']);
const DOSSIER = {
  title: 'Questions of intent',
  summary: 'Make them own what they meant.',
  moves: [
    { name: 'Question of intent', summary: 's', line: 'Did you mean for that to sound rude?', when: 'w', tell: 't', source: '[[Questions of Intent]]' },
    { name: 'Silence first', summary: 's', line: '', when: 'w', tell: 't', source: '[[Silence as Leverage]]' },
    { name: 'Make them say it again', line: 'Say that again?', source: '[[Some Page Not In The Vault]]' },
    { name: 'The web one', line: 'What did you mean by that?', source: 'web: https://example.com/article' },
  ],
  scenarios: [
    { name: 'The dig in the meeting', setting: 's', other: 'Mark', pressure: 'p', moves: ['Question of intent', 'Silence first', 'Nonsense move'] },
    { name: 'A scene of nothing', setting: 's', other: 'o', pressure: 'p', moves: ['Silence first'] },
  ],
  sourcesUsed: ['[[Questions of Intent]]', '[[Not A Page]]'],
  gaps: ['the book is unread'],
};

test('validateDossier drops a move without a line and says so', () => {
  const { skill, notes } = validateDossier(DOSSIER, { existingPaths: PATHS });
  assert.ok(!skill.moves.some((m) => m.name === 'Silence first'));
  assert.ok(notes.some((n) => /dropped "Silence first": a move needs a line/.test(n)));
});

test('validateDossier rewrites a source it cannot check to "his words", with a note', () => {
  const { skill, notes } = validateDossier(DOSSIER, { existingPaths: PATHS });
  const m = skill.moves.find((x) => x.name === 'Make them say it again');
  assert.equal(m.source, 'his words');
  assert.ok(notes.some((n) => /Some Page Not In The Vault.*his words/.test(n)));
  assert.equal(skill.moves.find((x) => x.name === 'Question of intent').source, '[[Questions of Intent]]');
  assert.equal(skill.moves.find((x) => x.name === 'The web one').source, 'web: https://example.com/article');
  // no research run: a web source cannot have been fetched
  const offline = validateDossier(DOSSIER, { existingPaths: PATHS, allowWeb: false });
  assert.equal(offline.skill.moves.find((x) => x.name === 'The web one').source, 'his words');
  // frontmatter sources are real vault pages only
  assert.deepEqual(validateDossier(DOSSIER, { existingPaths: PATHS }).skill.sources, ['[[Questions of Intent]]']);
});

test('validateDossier strips unknown move names from a scene and drops a scene left with none', () => {
  const { skill, notes } = validateDossier(DOSSIER, { existingPaths: PATHS });
  assert.equal(skill.scenarios.length, 1);
  assert.deepEqual(skill.scenarios[0].moves, ['Question of intent']);
  assert.ok(notes.some((n) => /dropped scene "A scene of nothing"/.test(n)));
  assert.ok(notes.some((n) => /"Nonsense move", not a move on the page/.test(n)));
});

test('validateDossier refuses a dossier with zero moves or zero scenes', () => {
  assert.throws(() => validateDossier({ ...DOSSIER, moves: [{ name: 'x', line: '' }] }, { existingPaths: PATHS }), /no move/);
  assert.throws(() => validateDossier({ ...DOSSIER, scenarios: [] }, { existingPaths: PATHS }), /no scene/);
  assert.throws(() => validateDossier({ ...DOSSIER, title: '' }, { existingPaths: PATHS }), /title/);
});

test('validateDossier caps moves, scenes, name and line length, and keeps separators out of names', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `Move ${i}`, line: 'x'.repeat(400) }));
  const scenes = Array.from({ length: 9 }, (_, i) => ({ name: `Scene, ${i} · a`, moves: ['Move 0'] }));
  const { skill } = validateDossier({ title: 'T', moves: [{ name: 'N'.repeat(90), line: 'l' }, ...many], scenarios: scenes }, { existingPaths: PATHS });
  assert.equal(skill.moves.length, 8);
  assert.equal(skill.scenarios.length, 6);
  assert.ok(skill.moves[0].name.length <= 60);
  assert.ok(skill.moves[1].line.length <= 240);
  assert.ok(skill.scenarios.every((s) => !/[·,]/.test(s.name)));
});

/* -------------------------------- the picker ------------------------------- */

const pickerSkill = (sessions, scenarios) => ({
  moves: [{ name: 'X', line: 'x' }, { name: 'Y', line: 'y' }],
  scenarios: scenarios || [{ name: 'A', moves: ['X'] }, { name: 'B', moves: ['Y'] }],
  sessions,
});

test('nextScene prefers the scene whose moves have landed least', () => {
  const s = pickerSkill([{ date: '2026-09-25', scenario: 'A', landed: ['X'], missed: [], work: '' }]);
  const n = nextScene(s);
  assert.equal(n.scenario, 'B');
  assert.deepEqual(n.moves, ['Y']);
  assert.equal(n.why, 'Y has not been tried yet');
});

test('nextScene breaks a tie by the least recently rehearsed scene', () => {
  const s = pickerSkill([
    { date: '2026-09-25', scenario: 'A', landed: [], missed: ['X'], work: '' },
    { date: '2026-09-20', scenario: 'B', landed: [], missed: ['Y'], work: '' },
  ]);
  const n = nextScene(s);
  assert.equal(n.scenario, 'B');
  assert.equal(n.why, 'Y has not landed yet');
});

test('nextScene falls back to page order, and a skill with no scenes has no next', () => {
  assert.equal(nextScene(pickerSkill([])).scenario, 'A');
  assert.equal(nextScene(pickerSkill([], [])), null);
});

test('tallies are derived from the Sessions section: landed counts as tried and landed, missed as tried', () => {
  const t = recomputeTallies(parsePracticePage(formatPracticePage(SKILL)));
  assert.deepEqual(t['Question of intent'], { tried: 2, landed: 1, lastAt: '2026-09-26' });
  assert.deepEqual(t['Silence first'], { tried: 1, landed: 0, lastAt: '2026-09-26' });
});

/* --------------------------- prepare's page writes -------------------------- */

test('a new page is written, and undo deletes it — but refuses once he has edited it', async () => {
  const vault = await tempVault();
  const { skill } = validateDossier(DOSSIER, { existingPaths: PATHS });
  const w = await writeSkillPage(vault, skill, { now: new Date(2026, 8, 27, 9) });
  assert.equal(w.created, true);
  assert.equal(w.relPath, 'Wiki/Practice/Questions of intent.md');
  const full = path.join(vault, w.relPath);
  const raw = await readFile(full, 'utf8');
  assert.equal(formatPracticePage(parsePracticePage(raw)), raw, 'what prepare writes round-trips');
  assert.match(raw, /created: '2026-09-27'/);

  await writeFile(full, raw.replace('Make them own', 'HE EDITED THIS'), 'utf8');
  await assert.rejects(undoPracticeSkill(vault, { relPath: w.relPath, hash: w.hash, created: true }), /edited since filing/);
  assert.ok(existsSync(full), 'an edited page is never deleted');

  await writeFile(full, raw, 'utf8');
  assert.match(await undoPracticeSkill(vault, { relPath: w.relPath, hash: w.hash, created: true }), /deleted/);
  assert.ok(!existsSync(full));
});

test('a re-prepare merges (his edits win, new moves append, sessions verbatim) and undo restores the prior page', async () => {
  const vault = await tempVault();
  const { full, raw } = await seed(vault);
  // his hand-made session note that is not a session line must survive too
  const priorRaw = raw.replace(/\n$/, '\n- a session line he typed badly\n');
  await writeFile(full, priorRaw, 'utf8');
  const incoming = validateDossier({
    title: 'Questions of intent',
    moves: [
      { name: 'Question of intent', line: 'A DIFFERENT LINE FROM THE MODEL', source: 'his words' },
      { name: 'Label the tone', line: 'That sounded sharp. Was it meant to?', source: '[[Questions of Intent]]' },
    ],
    scenarios: [{ name: 'The corridor ambush', setting: 's', other: 'o', pressure: 'p', moves: ['Label the tone'] }],
    gaps: ['a new gap'],
  }, { existingPaths: PATHS }).skill;
  const w = await writeSkillPage(vault, incoming, { slug: 'questions-of-intent', now: new Date(2026, 8, 27, 9) });
  assert.equal(w.created, false);
  assert.equal(w.prior, priorRaw);
  const merged = parsePracticePage(await readFile(full, 'utf8'));
  assert.equal(merged.moves.find((m) => m.name === 'Question of intent').line, SKILL.moves[0].line, 'his move is kept as he has it');
  assert.ok(merged.moves.some((m) => m.name === 'Label the tone'));
  assert.ok(merged.scenarios.some((s) => s.name === 'The corridor ambush'));
  assert.deepEqual(merged.gaps, ['a new gap']);
  assert.equal(merged.why, SKILL.why);
  assert.ok((await readFile(full, 'utf8')).endsWith(priorRaw.slice(priorRaw.indexOf('## Sessions'))), 'the Sessions section is kept verbatim');

  assert.match(await undoPracticeSkill(vault, { relPath: w.relPath, hash: w.hash, prior: w.prior }), /back as it was/);
  assert.equal(await readFile(full, 'utf8'), priorRaw);
  await assert.rejects(writeSkillPage(vault, incoming, { slug: 'no-such-skill' }), /no practice page/);
});

/* -------------------------------- payloads --------------------------------- */

test('listSkills and readSkill find pages by slug; practiceSummary folds tallies and picks today', async () => {
  const vault = await tempVault();
  await seed(vault);
  await seed(vault, { ...SKILL, title: 'Paused thing', status: 'paused', sessions: [] });
  const skills = await listSkills(vault);
  assert.deepEqual(skills.map((s) => s.slug), ['paused-thing', 'questions-of-intent']);
  assert.equal((await readSkill(vault, 'questions-of-intent')).relPath, 'Wiki/Practice/Questions of intent.md');
  assert.equal(await readSkill(vault, 'nope'), null);

  const sum = await practiceSummary(vault);
  const q = sum.skills.find((s) => s.slug === 'questions-of-intent');
  assert.deepEqual(q.moves.map((m) => [m.name, m.tried, m.landed]), [['Question of intent', 2, 1], ['Silence first', 1, 0]]);
  assert.equal(q.sessions[0].at, '2026-09-26');
  assert.equal(q.lastRehearsedAt, '2026-09-26');
  assert.ok(q.next);
  assert.equal(sum.skills.find((s) => s.slug === 'paused-thing').next, null, 'a paused skill offers no scene');
  assert.equal(sum.today.slug, 'questions-of-intent');
  assert.deepEqual(sum.preparing, []);
});

test('practiceLine is one sentence for the other agents, and null when nothing is active', async () => {
  const vault = await tempVault();
  assert.equal(await practiceLine(vault), null);
  await seed(vault);
  const line = await practiceLine(vault);
  assert.match(line, /^He is practising Questions of intent \(2 moves, 1 landed; last scene 26 Sep, working on: let the pause run/);
});
