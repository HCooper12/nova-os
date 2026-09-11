// The commitment finder: a promise he made in writing and never closed.
// Read-only, pure code. These tests pin the three things that decide whether
// the loop is worth reading at all — that it excludes OTHER PEOPLE'S words
// (`Raw/` transcripts are full of "I'll"), that anything he wrote about again
// or put on the list counts as closed, and that accepting writes exactly one
// undoable to-do.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'nova-commit-data-'));
process.env.NOVA_DATA_DIR = dataDir;

import test from 'node:test';
import assert from 'node:assert/strict';

const DAY = 86_400_000;
const {
  runCommitments, acceptCommitment, dismissCommitment, commitmentsIn,
} = await import('../lib/commitments.js');
const { listTodos } = await import('../lib/todos.js');

const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

async function vault(pages) {
  const root = await mkdtemp(path.join(tmpdir(), 'nova-commit-vault-'));
  for (const [rel, body] of Object.entries(pages)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, 'utf8');
  }
  return root;
}

// a note whose frontmatter dates it, so the age gate is deterministic
const note = (daysAgo, body, type = 'note') =>
  `---\ntype: ${type}\ncreated: ${iso(daysAgo)}\nupdated: ${iso(daysAgo)}\n---\n\n${body}\n`;

test.after(async () => { await rm(dataDir, { recursive: true, force: true }); });

/* ------------------------------------------------------------- extraction */

test('commitmentsIn pulls first-person promises and ignores what is not one', () => {
  const found = commitmentsIn([
    "I'll draft the quarterly supplier agreement before the renewal",
    '- [ ] I need to book the dentist appointment for the crown',
    '- [x] I will cancel the unused storage unit subscription',   // already ticked
    '> I promised to send the revised architecture diagram',       // a quotation
    '## I will not be a heading',                                  // a heading
    'I will go',                                                   // too short to act on
    'Note to self: renew the professional indemnity insurance',
  ].join('\n'));
  const texts = found.map((f) => f.text);
  assert.deepEqual(texts, [
    'draft the quarterly supplier agreement before the renewal',
    'book the dentist appointment for the crown',
    'renew the professional indemnity insurance',
  ]);
});

test('commitmentsIn ignores fenced code', () => {
  const found = commitmentsIn('```js\nconst s = "I will refactor the scheduler module";\n```\n\nplain text');
  assert.deepEqual(found, []);
});

/* --------------------------------------------------------------- the scan */

test('an old promise nothing has mentioned since is proposed', async () => {
  const v = await vault({
    'Wiki/Journal/Supplier call.md': note(60, "I'll draft the quarterly supplier agreement before the renewal."),
    'Wiki/Journal/Unrelated.md': note(5, 'Bought new running shoes today.'),
  });
  try {
    const { proposals } = await runCommitments(v);
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].type, 'lost-commitment');
    assert.match(proposals[0].title, /quarterly supplier agreement/);
    assert.ok(Math.abs(proposals[0].days - 60) <= 1, `age ${proposals[0].days} should be ~60`);
    assert.match(proposals[0].detail, /\d+ days ago and nothing since mentions it/);
  } finally { await rm(v, { recursive: true, force: true }); }
});

test("a transcript in Raw/ is somebody else's promise and is never proposed", async () => {
  const v = await vault({
    // exactly the shape the watcher files: a guest saying "I'll" repeatedly
    'Raw/Some Podcast (Transcript).md':
      `---\ntype: raw\ncreated: ${iso(90)}\nupdated: ${iso(90)}\n---\n\n`
      + "I'll tell you the single biggest leverage point in acquisition economics.\n"
      + "I need to explain why the payback window matters more than the margin.\n",
    'Wiki/Sources/Some Podcast.md':
      `---\ntype: source\ncreated: ${iso(90)}\nupdated: ${iso(90)}\n---\n\n`
      + "I'll tell you the single biggest leverage point in acquisition economics.\n",
  });
  try {
    const { proposals } = await runCommitments(v);
    assert.deepEqual(proposals, [], 'other people’s words produce nothing');
  } finally { await rm(v, { recursive: true, force: true }); }
});

test('a Concept page is his notes on someone else\'s idea, not his promise', async () => {
  // The exact false positive the real vault produced (11 Sep 2026): hypothetical
  // first person is the house style of a distilled concept note, and 133 of his
  // 301 pages are Concepts.
  const v = await vault({
    'Wiki/Concepts/Caffeine and Sleep Debt.md': note(60,
      'The seductive logic is "I\'ll just take more stimulants tomorrow" — you\'ll feel as though the debt is paid.'),
  });
  try {
    assert.deepEqual((await runCommitments(v)).proposals, []);
  } finally { await rm(v, { recursive: true, force: true }); }
});

test('a promise quoted inside a sentence is reported speech, not a commitment', async () => {
  const v = await vault({
    'Wiki/Journal/2026-07-01.md': note(60,
      'He kept saying "I need to restructure the entire onboarding funnel" and never did.'),
  });
  try {
    assert.deepEqual((await runCommitments(v)).proposals, []);
  } finally { await rm(v, { recursive: true, force: true }); }
});

test('a commitment is captured as one sentence, not the rest of the paragraph', () => {
  const found = commitmentsIn("I'll book the structural engineer survey. Then we can price the extension properly.");
  assert.equal(found.length, 1);
  assert.equal(found[0].text, 'book the structural engineer survey');
});

test("Nova's own dispatch inside his journal is not his promise", () => {
  // A journal day carries both authors. His vault: 37 `· system` sections
  // (Nova's dispatches and reviews) against 47 of his own.
  const found = commitmentsIn([
    '# 2026-07-02',
    '## 07:11 · system — Morning dispatch',
    "I'll keep watching the overnight push and report back tomorrow.",
    '## 21:40 · personal',
    "I'll cancel the unused equipment storage unit this week.",
  ].join('\n'));
  assert.deepEqual(found.map((f) => f.text), ['cancel the unused equipment storage unit this week']);
});

test('a promise he wrote about again later counts as closed', async () => {
  const v = await vault({
    'Wiki/Journal/Intent.md': note(60, "I'll rebuild the greenhouse irrigation manifold this spring."),
    'Wiki/Journal/Later.md': note(20, 'Finished the greenhouse irrigation manifold rebuild — the manifold holds pressure.'),
  });
  try {
    const { proposals } = await runCommitments(v);
    assert.deepEqual(proposals, [], 'he revisited it, so it is not lost');
  } finally { await rm(v, { recursive: true, force: true }); }
});

test('a promise already on the to-do list is not raised again', async () => {
  const v = await vault({
    'Wiki/Journal/Intent.md': note(60, "I'll replace the corroded bathroom extractor fan."),
    'Wiki/Inbox/To-Do.md': '- [ ] replace the corroded bathroom extractor fan _(added 2026-07-01)_ #personal\n',
  });
  try {
    const { proposals } = await runCommitments(v);
    assert.deepEqual(proposals, [], 'already tracked is not lost');
  } finally { await rm(v, { recursive: true, force: true }); }
});

test('a promise younger than three weeks has not had time to be broken', async () => {
  const v = await vault({
    'Wiki/Journal/Fresh.md': note(10, "I'll renegotiate the warehouse lease terms before December."),
  });
  try {
    const { proposals } = await runCommitments(v);
    assert.deepEqual(proposals, []);
  } finally { await rm(v, { recursive: true, force: true }); }
});

test('the oldest promises come first and the list is capped', async () => {
  // Deliberately unrelated subjects: nine variations on one sentence would
  // share all their vocabulary, and the document-frequency filter would
  // (correctly) judge none of it distinctive enough to identify a promise.
  const SUBJECTS = [
    'service the espresso machine group head gasket',
    'renew the drone operator certification',
    'index the vinyl records into Discogs',
    'replace the bathroom extractor fan',
    'calibrate the telescope finder scope',
    'digitise the wedding video cassettes',
    'repoint the garden retaining wall',
    'audit the domain name renewals',
    'laminate the workshop safety signage',
  ];
  const pages = {};
  SUBJECTS.forEach((subject, i) => {
    pages[`Wiki/Journal/N${i}.md`] = note(30 + i * 20, `I'll ${subject}.`);
  });
  const v = await vault(pages);
  try {
    const { proposals } = await runCommitments(v);
    assert.equal(proposals.length, 6, 'capped');
    const days = proposals.map((p) => p.days);
    assert.deepEqual(days, [...days].sort((a, b) => b - a), 'oldest first');
  } finally { await rm(v, { recursive: true, force: true }); }
});

/* --------------------------------------------------------- accept / dismiss */

test('accepting writes exactly one to-do and records undo data for it', async () => {
  const v = await vault({
    'Wiki/Journal/Intent.md': note(60, "I'll service the workshop dust extraction ducting."),
    'Wiki/Inbox/To-Do.md': '- [ ] something else entirely _(added 2026-07-01)_ #personal\n',
  });
  try {
    const { proposals } = await runCommitments(v);
    assert.equal(proposals.length, 1);
    const { record, proposal } = await acceptCommitment(v, proposals[0].id);

    assert.equal(proposal.status, 'accepted');
    assert.equal(record.kind, 'commitment');
    assert.equal(record.decision.route, 'todo');

    const { items } = await listTodos(v);
    const added = items.filter((t) => /dust extraction ducting/.test(t.text));
    assert.equal(added.length, 1, 'exactly one to-do written');

    assert.ok(record.undoData, 'undo data exists');
    assert.equal(record.undoData.route, 'todo');
    assert.deepEqual(record.undoData.lines, [added[0].raw], 'undo names the exact line it wrote');
  } finally { await rm(v, { recursive: true, force: true }); }
});

test('accepting the same proposal twice is refused', async () => {
  const v = await vault({
    'Wiki/Journal/Intent.md': note(60, "I'll recalibrate the darkroom enlarger timer."),
  });
  try {
    const { proposals } = await runCommitments(v);
    await acceptCommitment(v, proposals[0].id);
    await assert.rejects(() => acceptCommitment(v, proposals[0].id), /already handled/);
  } finally { await rm(v, { recursive: true, force: true }); }
});

test('a dismissed commitment holds for 120 days, then returns naming the history', async () => {
  const v = await vault({
    'Wiki/Journal/Intent.md': note(60, "I'll catalogue the inherited mineral specimen collection."),
  });
  try {
    const first = await runCommitments(v);
    await dismissCommitment(first.proposals[0].id);

    assert.deepEqual((await runCommitments(v)).proposals, [], 'a no holds');
    assert.deepEqual(
      (await runCommitments(v, { now: Date.now() + 119 * DAY })).proposals, [], 'still holds on day 119',
    );

    const back = (await runCommitments(v, { now: Date.now() + 121 * DAY })).proposals;
    assert.equal(back.length, 1, 'the no has had its say');
    assert.equal(back[0].returned, true);
    assert.match(back[0].detail, /\(You passed on this on /);
  } finally { await rm(v, { recursive: true, force: true }); }
});
