// THE SUMMARY INBOX (27 Sep 2026, design/mockups/60). Three layers pinned:
// the pure facts (src/inboxSummaryFacts.js) — days, subjects, Look deeper's
// states, the three-second seen, the report's parts; the view model
// (src/vals/valsInboxSummary.js) run over valsInbox's own rows, so the card,
// the fold and the seen-once rule are tested on the shapes the app really
// hands it; and the source contracts no screenshot would catch breaking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dayLabel, dayGroups, subjectCards, digestLine, deeperState, deeperStage, autoSeenDue, AUTO_SEEN_MS,
  reportParts, sourcesOf, firstSentence, elapsedLabel, agoLabel, railMarks, upsertInboxRecord, omitKey, sentenceCase,
} from '../../src/inboxSummaryFacts.js';
import { valsInbox } from '../../src/vals/valsInbox.js';
import { valsInboxSummary } from '../../src/vals/valsInboxSummary.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// ------------------------------------------------------------- the facts --

test('dayGroups: Today, Yesterday, the weekday inside a week, then the date; order kept', () => {
  const today = new Date(2026, 8, 27, 15, 0); // a Sunday
  const at = (d, h = 10) => new Date(2026, 8, d, h, 0).toISOString();
  const rows = [
    { id: 'a', at: at(27, 12) }, { id: 'b', at: at(27, 9) }, { id: 'c', at: at(26) },
    { id: 'd', at: at(24) }, { id: 'e', at: at(18) }, { id: 'f', at: null },
  ];
  const g = dayGroups(rows, today);
  assert.deepEqual(g.map((x) => x.label), ['Today', 'Yesterday', 'Thursday', 'Fri 18 Sep', 'Earlier']);
  assert.deepEqual(g[0].rows.map((r) => r.id), ['a', 'b'], 'newest first, as they came');
  assert.equal(dayLabel(new Date(2025, 11, 2), today), 'Tue 2 Dec 2025', 'another year says so');
  assert.deepEqual(dayGroups([], today), []);
});

test('subjectCards: ✓ all only where something can be answered; a model-choice subject keeps the usual model', () => {
  const ok = (id, extra = {}) => ({ id, approve: () => {}, ...extra });
  const choice = (id) => ({ id, isModelChoice: true, pickSonnet: () => {} });
  const cards = subjectCards({
    routine: [ok('r1'), ok('r2')],
    patterns: [
      { subject: 'coach', members: [ok('c1'), ok('c2'), ok('c3')] },
      { subject: 'model choice', members: [choice('m1'), choice('m2')] },
      { subject: 'mixed', members: [ok('x1'), choice('x2')] },
    ],
  });
  assert.deepEqual(cards.map((c) => [c.key, c.name, c.count, c.fileable, c.keep]), [
    ['routine', 'Routine', 2, 2, false],
    ['s:coach', 'Coach', 3, 3, false],
    ['s:model choice', 'Model choice', 2, 2, true],
    ['s:mixed', 'Mixed', 2, 1, false],
  ]);
  assert.deepEqual(subjectCards(null), []);
  assert.equal(digestLine({ routine: [1], patterns: [{ members: [1, 2, 3] }, { members: [1, 2] }], decide: [1] }, 7), '1 routine · 5 on 2 subjects · 1 to decide');
  assert.equal(digestLine(null, 1), 'one to decide');
});

const brief = 'The pad takes the lower back out of it [1]. It keeps the pull the same [2].\n\n## What to watch\n- Start lighter [2]\n- Keep 4 × 10\n\n## Sources\n[1] A coach\'s guide — https://www.example.com/rows\n2. Pull Day notes https://example.org/pull\n';

test('reportParts: paragraphs, headings and items without markdown; sources with their links', () => {
  const p = reportParts(`**Why** the *chest pad*: see [the guide](https://x.io/a).\n\n${brief}`);
  assert.equal(p.lead, 'Why the chest pad: see the guide.');
  assert.deepEqual(p.blocks.map((b) => b.type), ['p', 'p', 'h', 'li', 'li']);
  assert.equal(p.blocks[2].text, 'What to watch');
  assert.deepEqual(sourcesOf(brief).map((s) => [s.n, s.host, s.label]), [[1, 'example.com', "A coach's guide"], [2, 'example.org', 'Pull Day notes']]);
  assert.equal(firstSentence(brief), 'The pad takes the lower back out of it.', 'no [1] in the sentence he reads');
  assert.deepEqual(sourcesOf('no sources section'), []);
});

test('deeperState: the newest child speaks — running with real seconds, ready, error, or nothing', () => {
  const now = Date.parse('2026-09-27T10:00:40Z');
  assert.deepEqual(deeperState([], now), { state: 'none' });
  const running = deeperState([{ id: 'k1', status: 'classifying', createdAt: '2026-09-27T10:00:00Z', panel: { total: 4, back: 1, label: '1 of 4 back' } }], now);
  assert.equal(running.state, 'running');
  assert.equal(running.seconds, 40);
  assert.equal(running.stage, '1 of 4 researchers back');
  assert.equal(deeperStage(null), 'choosing who reads it');
  assert.equal(deeperStage({ merging: true, total: 4, back: 4 }), 'writing the report');

  const ready = deeperState([
    { id: 'old', status: 'error', error: 'x', createdAt: '2026-09-26T10:00:00Z' },
    { id: 'k2', status: 'pending', createdAt: '2026-09-27T09:58:00Z', decision: { title: 'Why the row', payload: { body: brief } } },
  ], now);
  assert.equal(ready.state, 'ready');
  assert.equal(ready.id, 'k2');
  assert.equal(ready.sentence, 'The pad takes the lower back out of it.');
  assert.equal(ready.sources, 2);

  assert.equal(deeperState([{ id: 'e', status: 'error', error: 'all 4 researchers failed', createdAt: 'x' }], now).error, 'all 4 researchers failed');
  assert.equal(deeperState([{ id: 'd', status: 'discarded', createdAt: 'x', decision: { payload: { body: brief } } }], now).state, 'none', 'a report he dropped is not brought back');
});

test('autoSeenDue: three seconds on top, and not a moment before', () => {
  assert.equal(AUTO_SEEN_MS, 3000);
  assert.equal(autoSeenDue(1000, 3999), false);
  assert.equal(autoSeenDue(1000, 4000), true);
  assert.equal(autoSeenDue(NaN, 9000), false);
});

test('the small readers: elapsed, ago, rail, upsert, omitKey, sentence case', () => {
  assert.equal(elapsedLabel(40), '40 s');
  assert.equal(elapsedLabel(125), '2 min 5 s');
  assert.equal(elapsedLabel(720), '12 min');
  const now = Date.parse('2026-09-27T10:00:00Z');
  assert.equal(agoLabel('2026-09-27T09:59:40Z', now), 'just now');
  assert.equal(agoLabel('2026-09-27T09:56:00Z', now), '4 min ago');
  assert.deepEqual(railMarks(2, 3).marks, ['done', 'done', 'on', 'wait', 'wait']);
  assert.ok(railMarks(10, 60).bar, 'past forty it is one bar');
  const inbox = { items: [{ id: 'a', status: 'pending' }], pendingCount: 1 };
  const up = upsertInboxRecord(inbox, { id: 'b', status: 'classifying' });
  assert.deepEqual(up.items.map((r) => r.id), ['b', 'a']);
  assert.equal(upsertInboxRecord(up, { id: 'b', status: 'pending' }).pendingCount, 2);
  assert.deepEqual(omitKey({ a: 1, b: 2 }, 'a'), { b: 2 });
  assert.equal(sentenceCase('TRAIN EDIT'), 'Train edit');
});

// -------------------------------------------------------- the view model --

function fakeApp(state = {}) {
  const calls = [];
  const app = {
    calls,
    state: {
      screen: 'inbox', novaStyle: 'summary', inboxMode: 'auto-high', inboxExpanded: {}, inboxActionBusy: {}, inboxProposalDismissed: [],
      compostActionBusy: {}, commitmentActionBusy: {}, isMobile: true,
      ...state,
    },
    setState(patch) { const p = typeof patch === 'function' ? patch(app.state) : patch; app.state = { ...app.state, ...p }; },
  };
  for (const m of ['inboxAction', 'inboxSeen', 'startInboxDeeper', 'stopInboxDeeper', 'openDeeperReport', 'closeDeeperReport', 'openCaptureSheet', 'closeCaptureSheet',
    'talkAboutInbox', 'navigate', 'discussCoachSuggestion', 'openCapture', 'toggleInboxExpand', 'pickModelChoice', 'setInboxMode', 'captureToInbox', 'setInboxInput']) {
    app[m] = (...args) => { calls.push([m, ...args]); };
  }
  return app;
}

const card = {
  id: 'card-1', kind: null, source: 'voice', status: 'pending', createdAt: '2026-09-27T09:40:00.000Z',
  text: 'Log that I slept badly but still trained', decision: { route: 'journal', confidence: 'high', title: 'Bad sleep, still trained', reason: 'You said it happened today.', payload: { text: 'Bad sleep, still trained.' } },
};
const report = {
  id: 'kid-1', kind: 'research', source: 'researcher', status: 'pending', parentId: 'card-1', createdAt: '2026-09-27T09:41:00.000Z',
  text: 'Research: Look deeper into this: Bad sleep, still trained', decision: { route: 'note', title: 'Training on bad sleep', payload: { title: 'Training on bad sleep', body: brief } },
};
const other = { id: 'card-2', kind: null, source: 'text', status: 'pending', createdAt: '2026-09-27T09:30:00.000Z', text: 'buy oats', decision: { route: 'shopping', confidence: 'low', title: 'Oats', payload: { items: [{ name: 'Oats' }] } } };
const filed = { id: 'old-1', kind: null, source: 'text', status: 'filed', createdAt: '2026-09-27T08:00:00.000Z', filedAt: '2026-09-27T08:00:05.000Z', destination: 'Shopping list', undoData: { x: 1 }, text: 'milk', decision: { route: 'shopping', title: 'Milk', payload: { items: [{ name: 'Milk' }] } } };
const noUndo = { id: 'old-2', kind: null, source: 'text', status: 'filed', createdAt: '2026-09-26T08:00:00.000Z', destination: 'Journal', text: 'x', decision: { route: 'journal', title: 'Old entry', payload: { text: 'x' } } };
const mystery = { id: 'old-3', kind: null, source: 'text', status: 'filed', createdAt: '2026-09-26T07:00:00.000Z', text: 'y', decision: { route: 'teleport', title: 'Unknown route', payload: {} } };

function build(app) {
  const ctx = { demoMode: false, isOffline: false };
  const base = valsInbox(app, ctx);
  return valsInboxSummary(app, ctx, { ...base, summary: true });
}

test('off `summary` the view model is null, so cupertino and command never read it', () => {
  const app = fakeApp({ novaStyle: 'cupertino', liveInbox: { items: [card] } });
  const out = build(app);
  assert.equal(out.inboxSummary, null);
});

test('a report rides its card: folded out of the deck, counted honestly, ready on the card', () => {
  const app = fakeApp({ liveInbox: { items: [card, report, other, filed, noUndo, mystery] } });
  const S = build(app).inboxSummary;
  assert.equal(S.count, 3, 'the numeral is every pending record, as the tab badge counts them');
  assert.equal(S.card.id, 'card-1');
  assert.equal(S.position, '1 of 2', 'the deck is the two cards; the report is not a third');
  assert.match(S.digestLine, /1 report on its card/);
  assert.equal(S.card.deeper.state, 'ready');
  assert.equal(S.card.deeper.sources, 2);
  assert.equal(S.card.kindLabel, 'Journal');
  assert.equal(S.card.where, 'You said it');
  assert.equal(S.ghosts, 1);
  S.card.deeper.openReport();
  S.card.deeper.start();
  assert.deepEqual(app.calls.slice(-2), [['openDeeperReport', 'card-1'], ['startInboxDeeper', 'card-1']]);
});

test('Stop only stops watching: the card says so, and a report that lands anyway still shows', () => {
  const running = { ...report, status: 'classifying', decision: undefined, createdAt: new Date(Date.now() - 30_000).toISOString() };
  const app = fakeApp({ liveInbox: { items: [card, running] }, inboxDeeperStopped: { 'card-1': Date.now() } });
  const d = build(app).inboxSummary.card.deeper;
  assert.equal(d.state, 'stopped');
  const landed = fakeApp({ liveInbox: { items: [card, report] }, inboxDeeperStopped: { 'card-1': Date.now() } });
  assert.equal(build(landed).inboxSummary.card.deeper.state, 'ready');
});

test('seen is written once per record, and never for a seen one', () => {
  const app = fakeApp({ liveInbox: { items: [{ ...card, id: 'seen-once' }] } });
  const S = build(app).inboxSummary;
  S.card.markSeen();
  S.card.markSeen();
  build(app).inboxSummary.card.markSeen();
  assert.deepEqual(app.calls.filter((c) => c[0] === 'inboxSeen'), [['inboxSeen', 'seen-once', true]]);
  const seenApp = fakeApp({ liveInbox: { items: [{ ...card, id: 'already', seenAt: '2026-09-27T09:00:00Z' }] } });
  build(seenApp).inboxSummary.card.markSeen();
  assert.equal(seenApp.calls.filter((c) => c[0] === 'inboxSeen').length, 0);
});

test('Filed: by day, a tick on what is on the record, Undo only where it exists, and the unnamed route says so', () => {
  const app = fakeApp({ inboxSumTab: 'filed', liveInbox: { items: [card, filed, noUndo, mystery] } });
  const f = build(app).inboxSummary.filed;
  assert.equal(f.count, 3);
  const rows = f.groups.flatMap((g) => g.rows);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId['old-1'].action.label, 'Undo');
  assert.equal(byId['old-1'].tick, true);
  assert.equal(byId['old-2'].action, null);
  assert.equal(byId['old-2'].state, 'no undo');
  assert.equal(byId['old-3'].tile.tone, 'none', 'a route the table does not name is a dashed ?, not a Note (finding 3)');
  assert.equal(byId['old-3'].tick, false);
  assert.match(f.honest, /2 filings kept nothing to undo/);
});

test('a decision leaves a receipt; the approve goes through the rails the swipe uses', () => {
  const app = fakeApp({ liveInbox: { items: [card, other] } });
  const S = build(app).inboxSummary;
  S.card.verbs.yes.run();
  assert.deepEqual(app.calls.find((c) => c[0] === 'inboxAction'), ['inboxAction', 'card-1', 'approve']);
  assert.deepEqual(app.state.inboxSumReceipt.ids, ['card-1']);
  // the server's record lands filed, with its undo
  app.state = { ...app.state, liveInbox: { items: [{ ...card, status: 'filed', destination: 'Journal', undoData: { a: 1 } }, other] } };
  const r = build(app).inboxSummary.receipt;
  assert.equal(r.title, 'Filed to Journal');
  assert.ok(r.undo, 'Undo, because the filing kept its undo');
});

test('✕ on a Coach card asks why first, and the last receipt keeps its Undo until he answers', () => {
  const coachCard = { id: 'c-1', kind: 'coach', source: 'voice', status: 'pending', createdAt: '2026-09-27T09:00:00.000Z', text: 'rear delts',
    decision: { route: 'routine-edit', confidence: 'high', title: 'Coach: add Face Pull', payload: { action: 'add', addName: 'Face Pull', routineName: 'Pull Day' } } };
  const app = fakeApp({ liveInbox: { items: [coachCard, filed] }, inboxSumReceipt: { ids: ['old-1'], verdict: 'approve', title: 'Milk', at: 1 } });
  const card0 = build(app).inboxSummary.card;
  assert.equal(card0.verbs.yes.label, 'Yes, add it');
  card0.verbs.no.run();
  assert.equal(app.state.inboxAskWhy, 'c-1', 'the reasons open on the card');
  assert.deepEqual(app.state.inboxSumReceipt.ids, ['old-1'], 'the question does not replace the last receipt');
  const asked = build(app).inboxSummary.card;
  assert.equal(asked.ask.q, 'Why pass?');
  asked.ask.submit('Not now');
  assert.deepEqual(app.state.inboxSumReceipt.ids, ['c-1'], 'the answer leaves its own');
  assert.deepEqual(app.calls.find((c) => c[0] === 'inboxAction'), ['inboxAction', 'c-1', 'discard', 'Not now']);
  // Talk about it on a Coach change is Coach's own conversation (the Train deck's Discuss)
  app.state = { ...app.state, inboxAskWhy: null };
  build(app).inboxSummary.card.verbs.talk.run();
  assert.ok(app.calls.some((c) => c[0] === 'discussCoachSuggestion' && c[1] === 'c-1'));
  // "no longer in your program" only once the program has loaded
  app.state = { ...app.state, liveWorkoutRoutines: [{ id: 'push', name: 'Push Day', exercises: [] }] };
  const gone = build(app).inboxSummary.card;
  assert.equal(gone.verbs.yes, null, 'a stale Coach card offers no yes');
  assert.equal(gone.verbs.no.label, 'Clear it');
  assert.match(gone.stale, /Pull Day is no longer in your program/);
});

test('Talk about it on a capture opens a conversation that starts from the card', () => {
  const app = fakeApp({ liveInbox: { items: [card] } });
  build(app).inboxSummary.card.verbs.talk.run();
  const talk = app.calls.find((c) => c[0] === 'talkAboutInbox');
  assert.ok(talk, 'the conversation opens');
  assert.match(talk[1], /Talk me through this card in my Inbox: “Bad sleep, still trained”/);
});

test('Agents & Operations gets the seven loops, the ladder and the waiting count', () => {
  const app = fakeApp({ screen: 'ops', liveInbox: { items: [card, other] } });
  const o = build(app).inboxSummary.ops;
  // the evening model read is shown as "Day read" since 11 Oct — "Daily
  // review" now names the forgetting-curve card (mockup 96)
  assert.deepEqual(o.loops.map((l) => l.name), ['Day read', 'Briefs', 'Compost', 'Open promises', 'Todoist', 'Meal prep', 'Guardian']);
  assert.equal(o.waiting.count, 2);
  assert.deepEqual(o.ladder.options.map((m) => [m.label, m.active]), [['Review all', false], ['Auto high', true], ['Auto all', false]]);
  assert.ok(o.loops.filter((l) => l.loading).length >= 4, 'a loop with no data yet loads as the house skeleton, never "checking…"');
});

// ----------------------------------------------------- source contracts --

test('the summary branch is the first thing the Inbox does, before any hook', () => {
  const src = read('src/screens/Inbox.jsx');
  const exported = /export function Inbox\(\{ v \}\) \{\n([\s\S]*?)\n\}\n/.exec(src)?.[1] || '';
  const code = exported.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  assert.equal(code[0], 'if (v.summary && v.inboxSummary) return <InboxSummary v={v} />;', 'the summary branch is the first statement');
  assert.doesNotMatch(exported, /use[A-Z]\w*\(/, 'no hook may run before the branch');
});

const NEW_FILES = ['src/screens/InboxSummary.jsx', 'src/DeeperReportSheet.jsx', 'src/CaptureSheet.jsx', 'src/OpsInboxHead.jsx', 'src/InboxSumIcons.jsx', 'src/InboxSumVerbs.jsx'];

test('no type in the summary Inbox is below 12px', () => {
  const sizes = [];
  for (const f of NEW_FILES) {
    const src = read(f);
    for (const m of src.matchAll(/font(?:Size)?: [`'"]([^`'"]*)[`'"]/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ where: f, px: Number(px[1]) });
    }
    for (const m of src.matchAll(/fontSize: ['"]?(\d+(?:\.\d+)?)/g)) sizes.push({ where: f, px: Number(m[1]) });
  }
  const css = read('src/index.css');
  const start = css.indexOf('THE SUMMARY INBOX (27 Sep 2026');
  const end = css.indexOf('/* shared panes for the new components */');
  assert.ok(start > 0 && end > start, 'the .nv-sum-ib-* block was not found');
  const section = css.slice(css.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of section.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const m of rule[2].matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ where: `index.css ${rule[1].trim()}`, px: Number(px[1]) });
    }
  }
  assert.ok(sizes.length > 40, `expected to read the whole screen's type, found ${sizes.length}`);
  const small = sizes.filter((s) => s.px < 12).map((s) => `${s.where}: ${s.px}px`);
  assert.deepEqual(small, [], `below the floor:\n  ${small.join('\n  ')}`);
  for (const m of section.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (!/^[@:]/.test(sel) && !/from|to/.test(sel)) assert.match(sel, /nv-sum-ib|nv-sum-card|nv-sum-stand/, `a selector outside the namespace: ${sel}`);
  }
});

test('both sheets are modals the back swipe can find and close', () => {
  for (const f of ['src/DeeperReportSheet.jsx', 'src/CaptureSheet.jsx']) {
    const src = read(f);
    const root = /<div ref=\{exit\.scrimRef\}[^>]*>/.exec(src)?.[0] || '';
    assert.match(root, /role="dialog"/, f);
    assert.match(root, /aria-modal="true"/, f);
    assert.match(root, /onClick=\{exit\.close\}/, `${f}: the backdrop (and the swipe's click) closes it`);
    assert.match(src, /zIndex: 145/, `${f}: the z-index is inline for topOverlay() to read`);
    assert.match(src, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/, `${f}: a tap inside must not reach the backdrop`);
  }
  // each is its own history entry, like the Edit sheet
  const app = read('src/App.jsx');
  assert.match(app, /novaOverlay: 'deeper', parentId/);
  assert.match(app, /novaOverlay: 'capture'/);
  assert.match(app, /\.\.\.this\.recipeFromHistory\(\), \.\.\.this\.pagesFromHistory\(\) \}(?:\);|, \(\) =>)/, 'popstate closes and reopens them');
  assert.match(app, /return \{ \.\.\.this\.pinnedFromHistory\(\), \.\.\.this\.trainCoachFromHistory\(\), \.\.\.this\.viewFromHistory\(\), \.\.\.this\.deeperReportFromHistory\(\), \.\.\.this\.captureSheetFromHistory\(\), \.\.\.this\.documentsFromHistory\(\), \.\.\.this\.recordFromHistory\(\), \.\.\.this\.novaFocusFromHistory\(\), \.\.\.this\.reviewSheetFromHistory\(\) \};/);
});

test('Seen has no button on the summary Inbox: it is marked by looking', () => {
  const src = read('src/screens/InboxSummary.jsx');
  assert.doesNotMatch(src, />\s*(?:✓ )?Seen\s*</, 'no Seen label');
  const uses = [...src.matchAll(/markSeen/g)].length;
  assert.ok(uses >= 1 && !/onClick=\{[^}]*markSeen/.test(src), 'markSeen is only called by the three-second timer');
});

test('the Nova hold opens Nova listening under summary (1 Oct); the capture composer stays reachable from the Inbox hint', () => {
  const dock = read('src/SummaryDock.jsx');
  assert.match(dock, /onLongPress=\{v\.holdNovaCore \|\| v\.holdNovaText\}/);
  assert.match(dock, /stays reachable there/);
  // nothing is lost: the composer still renders from the dock when opened,
  // and the Inbox's hint line opens it with a tap
  assert.match(dock, /\{capture\?\.open && <CaptureSheet c=\{capture\} \/>\}/);
  assert.match(read('src/screens/InboxSummary.jsx'), /className="nv-sum-ib-hint" onClick=\{S\.openCapture\}/);
});
