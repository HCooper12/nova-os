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

// ---- audit [37]: the live line, the Sat–Sun window, verified links ----------

test('leaderLiveLine recomputes the volatile picture: today\'s idea, open struggles, the latest resolution', async () => {
  const { leaderLiveLine } = await import('../lib/leader.js');
  const { writeFile: wf } = await import('node:fs/promises');
  const state = await readLeaderState();
  const now = new Date();
  const ago = (d) => new Date(now.getTime() - d * 86400000).toISOString();
  state.daily = [{ date: todayISO(now), kind: 'action', title: 'State the decision first', line: 'x', why: 'serves his meeting struggle', refs: [], createdAt: now.toISOString() }];
  state.profile.struggles = [
    { text: 'meetings drift', at: ago(20), resolvedAt: ago(2) },
    { text: 'delegating the boring work', at: ago(9) },
    { text: 'saying no to the CEO', at: ago(3) },
  ];
  await wf(path.join(dataDir, 'leader.json'), JSON.stringify(state), 'utf8');

  const line = await leaderLiveLine(now);
  assert.match(line, /today's idea is "State the decision first" — serves his meeting struggle/);
  assert.match(line, /2 open struggles, newest "saying no to the CEO"/);
  assert.match(line, /latest resolved "meetings drift" \(2d ago\)/);

  state.daily = []; state.profile.struggles = [];
  await wf(path.join(dataDir, 'leader.json'), JSON.stringify(state), 'utf8');
  const empty = await leaderLiveLine(now);
  assert.match(empty, /no idea has landed yet today; no open struggles on file\.$/, 'absence is stated, never invented');
});

test('research window: Saturday from 07:00, Sunday as the catch-up, no other day', async () => {
  const { researchWindowOpen } = await import('../lib/leader.js');
  assert.equal(researchWindowOpen(new Date(2026, 8, 5, 6, 59)), false, 'Saturday before seven');
  assert.equal(researchWindowOpen(new Date(2026, 8, 5, 7, 0)), true, 'Saturday');
  assert.equal(researchWindowOpen(new Date(2026, 8, 6, 9, 0)), true, 'Sunday catch-up');
  assert.equal(researchWindowOpen(new Date(2026, 8, 7, 9, 0)), false, 'Monday');
});

test('links are checked, not trusted: HEAD (GET when refused), failures kept and marked "(link unverified)"', async () => {
  const { verifyInsightUrls, researchBody } = await import('../lib/leader.js');
  const calls = [];
  const fetchImpl = async (url, { method }) => {
    calls.push(`${method} ${url}`);
    if (url.includes('ok')) return { status: 200 };
    if (url.includes('nohead')) return { status: method === 'HEAD' ? 405 : 200 };
    if (url.includes('gone')) return { status: 404 };
    throw new Error('ECONNREFUSED');
  };
  const insights = [
    { insight: 'a', topic: 'A', source: 'S1', url: 'https://x.test/ok' },
    { insight: 'b', topic: 'B', source: 'S2', url: 'https://x.test/nohead' },
    { insight: 'c', topic: 'C', source: 'S3', url: 'https://x.test/gone' },
    { insight: 'd', topic: 'D', source: 'S4', url: 'https://x.test/down' },
    { insight: 'e', topic: 'E', source: 'S5', url: null },
  ];
  await verifyInsightUrls(insights, { fetchImpl });
  assert.deepEqual(insights.map((i) => i.linkOk), [true, true, false, false, null]);
  assert.ok(calls.includes('GET https://x.test/nohead'), 'a host that refuses HEAD gets one GET');
  assert.equal(calls.filter((c) => c.startsWith('GET')).length, 1, 'a real 404 is not retried');
  assert.equal(insights.length, 5, 'nothing dropped');

  const body = researchBody(insights, new Date('2026-09-05T00:00:00Z'));
  assert.match(body, /Source: S1 — https:\/\/x\.test\/ok\n/);
  assert.match(body, /Source: S3 — https:\/\/x\.test\/gone \(link unverified\)/);
  assert.match(body, /Source: S4 — https:\/\/x\.test\/down \(link unverified\)/);
  assert.match(body, /Source: S5\n|Source: S5$/, 'no URL, no marker either way');
  assert.equal((body.match(/link unverified/g) || []).length, 2);
});

// ---- the corpus filter, tuned on his real shelf (3 Sep) ---------------------
// Fixtures are REAL page titles from his vault. The two-tier filter admitted
// six body pages out of seventeen title matches, and the daily idea welded an
// RPE statistic to "Stress Management & Parasympathetic Switching". He said
// it plainly: that is not managing, leading, inspiring or directing a team.

test('corpus: a body page never counts as leadership, whatever word its title contains', async () => {
  const { isLeadership } = await import('../lib/leader.js');
  // each of these was ADMITTED by the old filter, by the word in brackets
  assert.equal(isLeadership('Stress Management & Parasympathetic Switching'), false, '[manage]');
  assert.equal(isLeadership('Waist Management & Digestion'), false, '[manage]');
  assert.equal(isLeadership('The X-Frame & High-Value Aesthetic Muscles'), false, '[frame]');
  assert.equal(isLeadership('The Habit Loop & Four Laws Framework'), false, '[frame], and personal habits are not team leadership');
  assert.equal(isLeadership('Self-Love as Higher Standard'), false, '[standard]');
  assert.equal(isLeadership('Wearables — Strengths and Limitations for Sleep Tracking'), false);
  // "people" is a human word, not a work-relationship word: this physiology
  // page says "people come to Galpin's company" and got in on that alone
  assert.equal(isLeadership('Energy Management as the Top-Performer Differentiator', 'Energy is probably the #1 reason people come to Andy Galpin\'s company.'), false);
});

test('corpus: pages about other people are admitted on the title alone', async () => {
  const { isLeadership } = await import('../lib/leader.js');
  for (const t of [
    'Delegation as a Feedback Generator',
    'Future-Focused Feedback',
    'Feedback Filter',
    'Respect Frameworks — POWERS & HEARTED',
    'Dominance vs Prestige',
    'Charisma as a Trainable Skill',
    'Specific Recognition',
  ]) assert.equal(isLeadership(t), true, t);
});

test('corpus: an ambiguous word needs a work-relationship signal to corroborate it', async () => {
  const { isLeadership } = await import('../lib/leader.js');
  assert.equal(isLeadership('Decision Velocity'), false, 'no signal — personal decision speed');
  assert.equal(isLeadership('Decision Velocity', 'How fast a manager moves from deciding to acting with their team.'), true, 'corroborated');
  assert.equal(isLeadership('Ownership'), false);
  assert.equal(isLeadership('Ownership', 'What it takes for direct reports to own an outcome end to end.'), true);
  // body text alone admits nothing: that is how the biology shelf got in
  assert.equal(isLeadership('Mitochondrial Signalling', 'Cells communicate; leadership of the organism, in a sense.'), false);
});

test('corpus: a source is judged by its own title first, then its concepts', async () => {
  const { isLeadershipSource } = await import('../lib/leader.js');
  // real case: an exercise video linked to the concept "Feedback Filter"
  assert.equal(isLeadershipSource('We Ranked the BEST Exercises for Every Muscle (Janicki × Tennyson)', ['Feedback Filter', 'Lats vs Upper Back in Pulling']), false);
  assert.equal(isLeadershipSource('Leadership Research — Week of 2026-08-28', ['Future-Focused Feedback']), true);
  assert.equal(isLeadershipSource('33 Brutal Truths (Hormozi × Williamson)', ['Feedback Filter', 'Decision Velocity']), true, 'admitted by a concept, and its own title is not body-domain');
  assert.equal(isLeadershipSource('The Recovery Protocol I Wish I Had Known In My 20s', ['Stress Management & Parasympathetic Switching']), false);
});

test("the daily idea's context carries standing rules but not the fleet's training receipts", async () => {
  const { orgContext } = await import('../lib/orgContext.js');
  const scoped = await orgContext(vault, 'leader', { only: ['standing'] });
  // nothing to say in a bare temp vault is honest; what matters is that the
  // trailer never describes sections that were not included
  if (scoped) {
    assert.ok(!/what your colleagues are doing/.test(scoped), 'the trailer must not claim colleagues it did not include');
    assert.ok(!/fleet has done lately/.test(scoped));
  }
});
