// ONE NOVA ON THE MAC (1 Nov 2026, design/mockups/108-one-nova-mac.html,
// approved): src/NovaMac.jsx and its pure facts, src/novaMacFacts.js.
// the panel formats in the device's own timezone (right on his Mac and phone), so pin one for CI, which runs in UTC
process.env.TZ = 'Australia/Sydney';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  frameFor, macCoreScale, macState, satellitesOf, thinkingLine, dockOrder, liveDock, panelKey, panelHead,
  MAX_DOCKED, TITLE_BAR, COLUMN, COMPOSER, MAC_CORE_RATIO,
} from '../../src/novaMacFacts.js';
import { STAGE_SCALE, STAGE_SPEAK } from '../../src/novaStageFacts.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the core sits where mockup 108 puts it, less its 28 px title bar', () => {
  assert.equal(TITLE_BAR, 28);
  assert.deepEqual(frameFor({ state: 'idle' }), { cx: 762, cy: 278, s: 1, uw: 820, mx: 762, off: 165 }, 'Ready: centred between the rail and the edge');
  assert.equal(frameFor({ state: 'listen', focus: true }).cx, 720, 'the rail has receded');
  assert.equal(frameFor({ state: 'listen', focus: true }).off, 196);
  const h = frameFor({ state: 'idle', hist: true });
  assert.equal(h.cx, (84 + 1040) / 2, 'the drawer takes 400 px');
  assert.equal(h.s, 0.86);
  const d = frameFor({ state: 'speak', docked: true, focus: true });
  assert.equal(d.cx, 470, 'beside the column, as the mockup');
  assert.equal(d.s, 0.8);
  assert.equal(frameFor({ state: 'speak', docked: true, hist: true, focus: true }).cx, 520, 'the drawer wins over the dock');
  assert.deepEqual([COLUMN.right, COLUMN.width, COLUMN.inset], [60, 508, 64]);
  assert.deepEqual([COMPOSER.w, COMPOSER.h, COMPOSER.foot], [680, 64, 22]);
});

test('the Mac core is the phone core at the mockup\'s 420 px canvas', () => {
  assert.ok(Math.abs(MAC_CORE_RATIO - 420 / 252) < 1e-9);
  assert.equal(macCoreScale('rest'), STAGE_SCALE.rest * MAC_CORE_RATIO);
  assert.ok(macCoreScale('listening') < STAGE_SCALE.listening * MAC_CORE_RATIO, 'listening trimmed, measured');
  assert.equal(macCoreScale('rest', 0.8), STAGE_SCALE.rest * MAC_CORE_RATIO * 0.8);
  assert.equal(macState('speaking'), 'speak');
  assert.equal(macState('turn'), 'idle');
});

test('satellites come only from the roster the server keeps, in each agent\'s hue', () => {
  assert.deepEqual(satellitesOf(null), [], 'no roster, nothing drawn');
  const sats = satellitesOf([
    { agent: 'coach', label: 'the Coach', question: 'How many side-delt sets this week?', state: 'asking' },
    { agent: 'researcher', label: 'the Researcher', question: 'x', state: 'done', ms: 21400 },
    { agent: 'calendar', label: 'your calendar', state: 'asking' },
    { agent: 'librarian', label: 'the Librarian', state: 'failed' },
  ]);
  assert.deepEqual(sats.map((s) => s.agent), ['coach', 'researcher', 'calendar', 'librarian']);
  assert.equal(sats[0].line, 'How many side-delt sets this week?', 'what was asked, verbatim');
  assert.equal(sats[0].hue, 'var(--nv-m-chest)');
  assert.equal(sats[1].line, 'Answered in 21 s', 'the real time it took');
  assert.equal(sats[2].line, 'Checking your calendar', 'a code-read source is checked');
  assert.equal(sats[3].line, 'Could not answer');
  assert.deepEqual(sats.map((s) => s.slot), [0, 1, 2, 3]);
  assert.equal(thinkingLine(sats), 'Asking the Coach.');
  assert.equal(thinkingLine(sats.filter((s) => s.agent === 'calendar')), 'Checking your calendar.');
  assert.equal(thinkingLine([]), '', 'all back: nothing beside Thinking');
});

test('a data panel and its lights dock as one; the newest three stay, in arrival order', () => {
  const a = { kind: 'key', label: 'A', caption: 'a' };
  const host = { kind: 'session', label: 'S', hostKey: 'b2', data: {} };
  const lit = { ...host, lit: { name: 'x' } };
  const c = { kind: 'list', label: 'C', items: [{ name: 'c' }] };
  const d = { kind: 'steps', label: 'D', items: [{ name: 'd' }] };
  const out = dockOrder([a, host, lit, c]);
  assert.deepEqual(out.map((p) => p.key), ['key:A', 'b2', 'list:C']);
  assert.equal(out[1].card, lit, 'the host shows its newest light');
  assert.equal(dockOrder([a, host, c, d]).length, MAX_DOCKED);
  assert.deepEqual(dockOrder([a, host, c, d]).map((p) => p.key), ['b2', 'list:C', 'steps:D']);
  const live = liveDock({ hero: c, rail: [host, a] });
  assert.deepEqual(live.panels.map((p) => p.key), ['key:A', 'b2', 'list:C'], 'the rail is newest first');
  assert.equal(live.lit, panelKey(c));
});

test('a panel names where it came from: a finder, or Nova\'s own', () => {
  assert.equal(panelHead({ kind: 'key', label: 'SATURDAY' }).words, 'Nova’s own');
  assert.equal(panelHead({ kind: 'key', label: 'SATURDAY' }).title, 'Saturday', 'capitals read as a sentence');
  assert.equal(panelHead({ kind: 'sources', by: 'researcher', label: 'X' }).words, 'from the Researcher');
  assert.equal(panelHead({ kind: 'session', finder: 'from the Coach', hue: 'var(--nv-m-chest)' }).hue, 'var(--nv-m-chest)');
});

test('the Mac page speaks in jade, and only at desktop width', () => {
  assert.equal(STAGE_SPEAK, 'jade');
  const mac = read('src/NovaMac.jsx');
  assert.match(mac, /STAGE_SPEAK_VAR/, 'the one speaking switch');
  assert.doesNotMatch(mac, /--nv-gold/, 'gold is for what waits on his call, in CSS only');
  const css = read('src/novaMac.css');
  assert.match(css, /\.nv-mac-plate \.nv-fx-w::after \{ background: var\(--fx-hue\)/);
  assert.match(css, /decide[^}]*var\(--nv-gold\)/, 'the proposal waiting on him is gold');
  const thread = read('src/screens/NovaThread.jsx');
  assert.match(thread, /if \(!v\.isMobile\) \{[\s\S]*<NovaMac /, 'the Mac branch');
  assert.match(thread, /<NovaStage T=\{T\}/, 'the phone keeps its stage');
});

test('the Mac stage is a fixed layer and says so (src/edgeBack.js)', () => {
  const mac = read('src/NovaMac.jsx');
  assert.match(mac, /className="nv-mac" data-fixed=""/);
  assert.match(read('src/novaMac.css'), /^\.nv-mac \{\s*position: fixed;/m);
});

test('keys: hold ⌥Space to talk and release to send, Esc in its order, ⌘\\ for history', () => {
  const mac = read('src/NovaMac.jsx');
  assert.match(mac, /e\.code === 'Space' && e\.altKey/);
  assert.match(mac, /toggle\(\{ force: true \}\)/, 'letting go always sends');
  const esc = mac.slice(mac.indexOf("if (e.key === 'Escape')"), mac.indexOf("if (e.key === '\\\\' && e.metaKey)"));
  const order = ['k.openKey', 'k.speaking', 'k.dict.on', 'loose.length', 'k.hist'].map((s) => esc.indexOf(s));
  assert.ok(order.every((x, i) => x > -1 && (i === 0 || x > order[i - 1])), `Esc order ${order}`);
});

// ---- the panels code builds (the coordinator's correction, 1 Nov) ----
import { setsPanel, briefPanel, briefPoints, calendarPanel, codePanels, coveredByCode, sentencesOf } from '../../src/novaMacFacts.js';

const WEEK = {
  start: '2026-10-26', end: '2026-11-01', goalMuscles: ['Side Delts', 'Upper Back', 'Biceps'],
  muscles: [
    { muscle: 'Side Delts', goal: true, done: 10, bySunday: 13, low: 12, high: 20 },
    { muscle: 'Upper Back', goal: true, done: 10.5, bySunday: 10.5, low: 12, high: 20 },
    { muscle: 'Biceps', goal: true, done: 21, bySunday: 24, low: 12, high: 20 },
    { muscle: 'Chest', goal: false, done: 10, bySunday: 10, low: 6, high: 10 },
    { muscle: 'Calves', goal: false, done: 0, bySunday: 0, low: 4, high: 8 },
  ],
};

test('the sets panel: only for an answer about sets or a muscle, built from the week, never a model\'s numbers', () => {
  assert.equal(setsPanel({ answer: 'Pull day at six.', week: WEEK }), null, 'not about sets');
  // his 1 Nov complaint: a passing mention is not the subject
  assert.equal(setsPanel({ question: 'Do I train today?', answer: 'Yes. Pull day at six, upper back first.', week: WEEK }), null, 'a muscle named in passing raises nothing');
  assert.equal(setsPanel({ question: 'Which layout?', answer: 'The 4-day keeps your biceps work and trims a chest press.', week: WEEK }), null, 'a program answer naming muscles raises nothing');
  assert.equal(setsPanel({ answer: 'Your upper back is short.', week: null }), null, 'no week, no panel');
  const p = setsPanel({ question: 'Why is my upper back lagging?', answer: 'Fine. Your upper back is your shortest muscle this week.', week: WEEK });
  assert.equal(p.head.words, 'Nova’s own');
  assert.equal(p.head.sub, 'from your training log');
  assert.deepEqual(p.rows.map((r) => r.muscle), ['Side Delts', 'Upper Back', 'Biceps'], 'his goal muscles');
  const ub = p.rows.find((r) => r.muscle === 'Upper Back');
  assert.equal(ub.key, true);
  assert.equal(ub.done, '10½');
  assert.equal(ub.target, 12, 'the tick is the minimum');
  assert.equal(ub.hue, 'var(--nv-m-upper-back)', 'its own hue');
  assert.equal(p.keyLine.gold, true, 'short: gold');
  assert.match(p.keyLine.rest, /is short by Sunday at this pace/);
  assert.equal(p.sentence, 1, 'rises with the sentence that names it');
  assert.ok(p.detail.some((r) => r.muscle === 'Chest' && r.planned === '0'), 'opened: every muscle with work, done and planned');
  assert.ok(!p.detail.some((r) => r.muscle === 'Calves'), 'a muscle with nothing this week is left off');
  assert.match(p.dnote, /Upper Back ends the week short/);
  const sd = setsPanel({ answer: 'Side delts reach twelve by Sunday.', week: WEEK });
  assert.match(sd.keyLine.rest, /^reach 12 by Sunday/);
  assert.equal(sd.keyLine.gold, false);
});

const BRIEF = {
  id: 'b1', kind: 'research', createdAt: '2026-10-30T22:34:22.116Z',
  decision: { title: 'Best Exercises for Side Delt Growth Evidence Brief', payload: { body: '## Summary\nx [1]\n\n## Key points\n- **Cable vs dumbbell came out even.** One trial [1].\n- **Volume beats frequency.** More sets [7][8].\n- A plain point with no bold. More words.\n\n## Sources\n1. A\n2. B\n3. C\n' } },
};

test('the brief panel reads the Researcher\'s real record: its points, the spoken one, its sources', () => {
  assert.deepEqual(briefPoints(BRIEF.decision.payload.body), { points: ['Cable vs dumbbell came out even', 'Volume beats frequency', 'A plain point with no bold'], sources: 3 });
  const p = briefPanel({ answer: 'Short week. The Researcher’s brief says cable and dumbbell came out even.', record: BRIEF });
  assert.equal(p.head.words, 'from the Researcher');
  assert.match(p.head.sub, /^brief, (30|31) Oct$/, 'its date, in his day');
  assert.equal(p.title, 'Best Exercises for Side Delt Growth');
  assert.equal(p.spoken, 0, 'the point the sentence said');
  assert.equal(p.recordId, 'b1', 'Open the brief opens this record');
  assert.match(p.sourcesLine, /^3 sources, cited in the brief/);
  assert.equal(briefPanel({ answer: 'x', record: { ...BRIEF, kind: 'video' } }), null);
});

test('the calendar panel: his real day, the proposal as the gold block; Undo only with the rails\' undoData', () => {
  const rec = { id: 'c1', undoData: null, decision: { route: 'calendar', payload: { action: 'create', title: 'Rows, 4 sets', start: '2026-11-07T11:30:00+11:00', end: '2026-11-07T12:30:00+11:00' } } };
  const events = [
    { date: '2026-11-07', time: '10:30', end: '11:30', label: 'Dust' },
    { date: '2026-11-07', time: '21:30', end: '22:00', label: 'Night routine' },
    { date: '2026-11-08', time: '10:00', end: '11:00', label: 'Another day' },
  ];
  const p = calendarPanel({ answer: 'Fine. Saturday at half eleven is free.', proposal: { recordId: 'c1' }, record: rec, events });
  assert.equal(p.head.words, 'from your calendar');
  assert.equal(p.head.sub, 'Saturday 7 November');
  assert.equal(p.title, 'Saturday morning');
  assert.deepEqual(p.events.map((e) => e.label), ['Dust'], 'that day, in the window');
  assert.deepEqual(p.day.map((e) => e.label), ['Dust', 'Night routine'], 'opened: the whole day');
  assert.equal(p.block.when, '11:30 to 12:30');
  assert.equal(p.sentence, 1);
  assert.equal(p.undoable, false);
  assert.equal(calendarPanel({ answer: '', proposal: { recordId: 'c1' }, record: { ...rec, undoData: { route: 'calendar' } }, events }).undoable, true);
  assert.equal(calendarPanel({ answer: '', proposal: { recordId: 'c1' }, record: { ...rec, decision: { route: 'note', payload: {} } }, events }), null, 'not a calendar change');
});

test('code panels come in the order their sentences say them; a model copy of one stays off the glass', () => {
  const inbox = [BRIEF, { id: 'c1', decision: { route: 'calendar', payload: { action: 'create', title: 'Rows', start: '2026-11-07T11:30:00+11:00', end: '2026-11-07T12:30:00+11:00' } } }];
  const ps = codePanels({ question: 'Why is my upper back lagging?', answer: 'Your upper back is short. The Researcher’s brief says cable and dumbbell came out even. Saturday at half eleven is free.', week: WEEK, inbox, briefIds: ['b1'], proposal: { recordId: 'c1' }, events: [] });
  assert.deepEqual(ps.map((p) => p.macKind), ['sets', 'brief', 'calendar']);
  assert.equal(coveredByCode({ label: 'SETS THIS WEEK' }, ps), true);
  assert.equal(coveredByCode({ label: 'GROWING SIDE DELTS' }, ps), false);
  assert.deepEqual(sentencesOf('One. Two [[artifact:abcd1234]] three? Four!'), ['One.', 'Two three?', 'Four!']);
});

test('a line keeps its code panels as kind, title and source only; the record never sees them', async () => {
  const { panelDescriptors, thumbOf, panelKey } = await import('../../src/novaMacFacts.js');
  const ps = [{ macKind: 'sets', key: 'mac:sets', title: 'Sets this week', rows: [{ done: '10' }] }, { macKind: 'brief', key: 'mac:brief:b1', title: 'Growing side delts' }, { macKind: 'calendar', key: 'mac:cal:c1', title: 'Saturday morning' }];
  assert.deepEqual(panelDescriptors(ps), [
    { kind: 'sets', title: 'Sets this week', source: 'your log' },
    { kind: 'brief', title: 'Growing side delts', source: 'Researcher' },
    { kind: 'calendar', title: 'Saturday morning', source: 'calendar' },
  ], 'no figures kept: a replay rebuilds from today\'s data');
  assert.equal(thumbOf({ kind: 'brief', title: 'x', source: 'Researcher' }).hue, 'var(--nv-m-quads)');
  assert.equal(panelKey(ps[1]), 'mac:brief:b1');
  const sync = read('src/conversationSync.js');
  assert.doesNotMatch(sync, /macPanels|briefIds/, 'the record is built field by field and never carries them');
  assert.match(read('src/NovaMac.jsx'), /rebuildCode[\s\S]*codePanels\(\{[^}]*week: T\.week/, 'replay rebuilds from the current week');
});
