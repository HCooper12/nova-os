// The Leader — deterministic pieces only: state, spacing, reflection,
// corpus filter, and the brief/widget accessors. Temp data dir + temp
// vault BEFORE imports.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-leader-data-'));
const vault = await mkdtemp(path.join(tmpdir(), 'nova-leader-vault-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  readLeaderState, applyLeaderReflection, parseLeaderReflect, pickSpaced,
  todayLead, leadLineForBrief, leadForWidget, leaderCorpus, profileLines,
} = await import('../lib/leader.js');

function pad(n) { return String(n).padStart(2, '0'); }
function todayISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

test('empty state is honest: no today, null brief and widget lines', async () => {
  const state = await readLeaderState();
  assert.equal(todayLead(state), null);
  assert.equal(await leadLineForBrief(), null);
  assert.equal(await leadForWidget(), null);
});

test('reflection merges his words, dedupes, and resolves without deleting', async () => {
  await applyLeaderReflection({ struggles: ['delegating the P3 review'], working: ['weekly one-on-ones'] });
  await applyLeaderReflection({ struggles: ['Delegating the P3 review'] }); // case-insensitive dup
  let s = await readLeaderState();
  assert.equal(s.profile.struggles.length, 1);
  assert.equal(s.profile.working.length, 1);

  await applyLeaderReflection({ resolved: ['delegating'] });
  s = await readLeaderState();
  assert.equal(s.profile.struggles.length, 1, 'resolved struggles stay in history');
  assert.ok(s.profile.struggles[0].resolvedAt, 'but carry a resolvedAt');
  // a resolved struggle leaves the prompt's CURRENT list
  assert.ok(!profileLines(s.profile).join('\n').includes('CURRENT STRUGGLES'));
});

test('REFLECT parses the JSON form, catches prose loudly, ignores chat mentions', () => {
  const ok = parseLeaderReflect('Good week.\n\nREFLECT {"struggles":["running long meetings"],"working":["direct feedback"]}');
  assert.equal(ok.reflect.struggles.length, 1);
  assert.equal(ok.reflect.working.length, 1);
  assert.ok(!ok.cleanText.includes('REFLECT'));

  const prose = parseLeaderReflect('Noted.\n\nREFLECT struggles: running long meetings');
  assert.equal(prose.reflect, null);
  assert.ok(prose.parseError, 'prose REFLECT must surface a parseError');
  assert.ok(!prose.cleanText.includes('REFLECT'), 'the raw directive must not reach his screen');

  const chatty = parseLeaderReflect('Take a moment to reflect on the meeting.');
  assert.equal(chatty.reflect, null);
  assert.ok(!chatty.parseError);
});

test('spacing: never-surfaced first, gaps widen, not-due excluded', () => {
  const now = Date.now();
  const day = 86400000;
  const spacing = {
    seenOnce: { count: 1, lastAt: now - 4 * day },   // gap 3d — due
    seenTwice: { count: 2, lastAt: now - 4 * day },  // gap 6d — NOT due
    ancient: { count: 5, lastAt: now - 60 * day },   // gap 35d cap — due
  };
  const picked = pickSpaced(['fresh', 'seenOnce', 'seenTwice', 'ancient'], spacing, now, 4);
  assert.ok(picked.includes('fresh'));
  assert.equal(picked[0], 'fresh', 'never-surfaced outranks every revisit');
  assert.ok(picked.includes('seenOnce'));
  assert.ok(picked.includes('ancient'));
  assert.ok(!picked.includes('seenTwice'), 'inside its widened gap — not due');
});

test('corpus filter: leadership titles match; biology body-words do not', async () => {
  const dir = path.join(vault, 'Wiki', 'Concepts');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'Feedback Filter.md'), '# Feedback Filter\nHow to hear hard feedback without flinching.');
  await writeFile(path.join(dir, 'Mitochondrial Signaling.md'),
    '# Mitochondrial Signaling\nMitochondria communicate constantly and influence cellular decisions through signals.');
  await writeFile(path.join(dir, 'Quiet Hobby.md'), '# Quiet Hobby\nNotes on leading people at work when stakes are high.');
  const { concepts } = await leaderCorpus(vault);
  const titles = concepts.map((c) => c.title);
  assert.ok(titles.includes('Feedback Filter'), 'title word matches');
  assert.ok(titles.includes('Quiet Hobby'), 'strong body phrase matches');
  assert.ok(!titles.includes('Mitochondrial Signaling'), 'broad words in body text must NOT match — the first cut pulled the whole biology shelf in');
});

test('a stored day reaches the brief and the widget verbatim; other days do not', async () => {
  const { writeFile: wf, mkdir: mkd } = await import('node:fs/promises');
  await mkd(dataDir, { recursive: true });
  const state = await readLeaderState();
  state.daily = [
    { date: '2020-01-01', kind: 'action', title: 'Old idea', line: 'x', why: '', refs: [], createdAt: '2020-01-01T00:00:00Z' },
    { date: todayISO(), kind: 'action', title: 'State the decision first', line: 'Open the 15:30 with the decision, then take questions.', why: 'serves his meeting struggle', refs: [], createdAt: new Date().toISOString() },
  ];
  await wf(path.join(dataDir, 'leader.json'), JSON.stringify(state), 'utf8');

  const brief = await leadLineForBrief();
  assert.ok(brief.startsWith('**Lead.** Try today: State the decision first'));
  // structured for the widget: a lock-screen widget shows the title alone,
  // so title and line must arrive separately, never pre-joined
  const widget = await leadForWidget();
  assert.equal(widget.title, 'State the decision first');
  assert.ok(widget.line.includes('Open the 15:30'));
  assert.ok(!brief.includes('Old idea'), 'yesterday never leaks into today');
});
