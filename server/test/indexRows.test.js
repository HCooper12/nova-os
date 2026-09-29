// THE INDEX'S PROMISE (P3, design/HOME-REDESIGN-PLAN.md §5): "The Index does
// not hide any screen: every key in SCREENS has a row." Under the `summary`
// style the Index IS the More tab, so a screen missing from it is a screen he
// cannot reach on his phone at all — and no screenshot would show the absence.
// Also held here: every value on it is read from a field that exists, never
// made up (src/vals/valsIndex.js), and the tab bar keeps the dock's Nova.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCREEN_KEYS } from '../../src/screenKeys.js';
import { INDEX_GROUPS, ROW_META, OVERLAY_DOORS } from '../../src/indexGroups.js';
import { valsIndex, fuelValue, clipWords } from '../../src/vals/valsIndex.js';
import { localDateISO } from '../../src/localDate.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ROWS = INDEX_GROUPS.flatMap((g) => g.rows);

test('every screen but the Index itself has exactly one row', () => {
  for (const key of SCREEN_KEYS.filter((k) => k !== 'index')) {
    const groups = INDEX_GROUPS.filter((g) => g.rows.includes(key)).map((g) => g.key);
    assert.equal(groups.length, 1, `${key} is in ${groups.length ? groups.join(' and ') : 'no group'}`);
  }
  assert.ok(SCREEN_KEYS.includes('index'), '#/index has to be a screen, or it does not survive a reload');
  assert.ok(!ROWS.includes('index'), 'the Index does not list itself');
});

test('every row is a screen or one of the two overlay doors, and none appears twice', () => {
  for (const key of ROWS) {
    assert.ok(SCREEN_KEYS.includes(key) || key in OVERLAY_DOORS, `${key} goes nowhere`);
  }
  assert.deepEqual(Object.keys(OVERLAY_DOORS).sort(), ['review', 'technique']);
  assert.equal(new Set(ROWS).size, ROWS.length, 'a row appears twice');
  assert.deepEqual(INDEX_GROUPS.map((g) => g.label), ['Today', 'Mind', 'Life', 'Nova']);
});

test('the overlay doors call methods App actually has', () => {
  const app = read('src/App.jsx');
  for (const method of Object.values(OVERLAY_DOORS)) {
    assert.match(app, new RegExp(`^  ${method}\\(\\) \\{`, 'm'), `App.${method}() does not exist`);
  }
});

test('every row has a name and a hue that is a real token', () => {
  // an invalid token fails silently: a colourless tile, a mark in no colour
  const css = read('src/index.css');
  for (const key of ROWS) {
    const meta = ROW_META[key];
    assert.ok(meta && meta.label, `${key} has no name`);
    assert.match(meta.hue, /^--nv-[a-z0-9]+$/, `${key}'s hue is not a token name`);
    assert.ok(new RegExp(`${meta.hue}\\s*:`).test(css), `${meta.hue} (${key}) is not defined in index.css`);
  }
  assert.deepEqual(Object.keys(ROW_META).sort(), [...ROWS].sort(), 'ROW_META and the groups name the same rows');
});

test('SCREEN_KEYS and App\'s screen switch are one contract', () => {
  // a key with no renderer is a blank page; a renderer with no key cannot be
  // reloaded into — both silent, which is why this is a test
  const app = read('src/App.jsx');
  assert.match(app, /import \{ SCREEN_KEYS \} from '\.\/screenKeys\.js';/);
  assert.ok(!/const SCREENS = \[/.test(app), 'the old local list must not come back beside the shared one');
  assert.match(app, /if \(SCREEN_KEYS\.includes\(key\)\) return key;/, 'resolveScreen reads the shared list');
  assert.match(app, /return SCREEN_KEYS\.includes\(h\) \? h : 'mission';/, 'and so does the hash, so #/index survives a reload');
  const at = app.indexOf('<Suspense fallback={<ScreenFallback />}>');
  const block = app.slice(at, app.indexOf('</Suspense>', at));
  const rendered = [...block.matchAll(/\{v\.is(\w+) && </g)].map((m) => m[1].toLowerCase());
  assert.deepEqual([...rendered].sort(), [...SCREEN_KEYS].sort());
  assert.match(app, /index: \(\) => import\('\.\/screens\/Index\.jsx'\)/, 'lazy, like the other off-dock screens');
});

// ---------------------------------------------------------------- values --

const nav = (screen, count, extra = {}) => (count === undefined ? { screen, ...extra } : { screen, count, ...extra });
function fixture(over = {}) {
  const calls = [];
  const app = {
    state: { screen: 'index' },
    openDailyReview: () => calls.push('review'),
    openRepertoireBook: () => calls.push('technique'),
  };
  const ctx = { userName: 'Hayden', go: (k) => () => calls.push(`go:${k}`), warm: (k) => () => calls.push(`warm:${k}`) };
  // configured but not yet synced: the sidebar shows '—', and so should say nothing here
  const v = {
    navMain: [nav('mission'), nav('voice'), nav('galaxy'), nav('code'), nav('inbox')],
    navVault: [nav('console'), nav('recipes', '—'), nav('shopping', '—'), nav('todos', '—'), nav('workouts', '—'),
      nav('notes', '—'), nav('library', '—'), nav('leader'), nav('practice'), nav('journal', '—'), nav('money'), nav('stash', '—')],
    navSystem: [nav('ops', '—'), nav('settings')],
    ringVitals: [{ key: 'protein', value: '—', small: '', state: 'absent' }],
    inboxPendingCount: 0,
    agentsLiveLabel: '7 AGENTS LIVE',
    systemsLabel: { text: 'OFFLINE · LAST-KNOWN DATA' },
    goSettings: () => calls.push('settings'),
    ...over,
  };
  return { app, ctx, v, calls };
}
const valuesOf = (page) => Object.fromEntries(page.groups.flatMap((g) => g.rows.map((r) => [r.key, r.value])));
const rowOf = (page, key) => page.groups.flatMap((g) => g.rows).find((r) => r.key === key);

test('with nothing honest to say, a row says nothing — never a zero, never a dash', () => {
  const { app, ctx, v } = fixture();
  const { indexPage } = valsIndex(app, ctx, v);
  const values = valuesOf(indexPage);
  const expected = Object.fromEntries(ROWS.map((k) => [k, '']));
  // the two that describe the place rather than count anything, and the agent
  // roster, which is configuration and always known
  Object.assign(expected, { voice: 'Talk to Nova', galaxy: 'the vault as stars', ops: '7 agents live' });
  assert.deepEqual(values, expected);
  for (const g of indexPage.groups) for (const r of g.rows) assert.equal(r.hot, false, `${r.key} is hot with nothing waiting`);
  assert.equal(indexPage.you.name, 'Hayden');
  assert.equal(indexPage.you.line, '7 agents live · offline · last-known data · 0 waiting');
});

test('live values come from the fields they name', () => {
  const month = localDateISO().slice(0, 7);
  const { app, ctx, v } = fixture({
    navVault: [nav('console'), nav('recipes', '40'), nav('shopping', '1'), nav('todos', '4'), nav('workouts', '5'),
      nav('notes', '312'), nav('library', '21'), nav('leader', '3', { countHot: false }), nav('practice', '2'),
      nav('journal', '1'), nav('money'), nav('stash', '14')],
    navSystem: [nav('ops', '2'), nav('settings')],
    ringVitals: [{ key: 'protein', value: '96', small: '/150G', pct: 64, state: 'behind' }],
    inboxPendingCount: 3,
    workoutCardLabel: 'Push day · week 6',
    reviewFrom: 'Atomic Habits — key ideas',
    todayTechnique: { position: 6, total: 12, name: 'Labelling' },
    leaderBox: { face: { title: 'Ask before you answer' } },
    moneyLoaded: true, moneyMonth: month, moneySpentLabel: '$1,240.00',
  });
  const { indexPage } = valsIndex(app, ctx, v);
  const values = valuesOf(indexPage);
  assert.equal(values.workouts, 'Push day · week 6');
  assert.equal(values.recipes, '96 of 150 g');
  assert.equal(values.inbox, '3 waiting');
  assert.equal(rowOf(indexPage, 'inbox').hot, true, 'waiting on his call is gold');
  assert.equal(values.todos, '4 open');
  assert.equal(values.practice, '2 skills', 'with no Home card, the sidebar\'s count of skills in rehearsal');
  assert.equal(values.leader, 'Ask before you answer');
  assert.equal(rowOf(indexPage, 'leader').hot, false);
  assert.equal(values.review, 'from Atomic Habits — key ideas');
  assert.equal(values.technique, '6 of 12');
  assert.equal(values.library, '21 volumes');
  assert.equal(values.notes, '312 notes');
  assert.equal(values.journal, '1 day');
  assert.equal(values.money, '$1,240.00 this month');
  assert.equal(values.shopping, '1 item');
  assert.equal(values.stash, '14 links');
  assert.equal(values.ops, '7 agents live · 2 pending');
  assert.equal(indexPage.you.line, '7 agents live · offline · last-known data · 3 waiting');
});

test('the Home card\'s own words win where it has them, and a stale Leader says what is open', () => {
  const { app, ctx, v } = fixture({
    navVault: [nav('leader', '3', { countHot: true }), nav('practice', '2')],
    practiceCard: { meta: '2 of 6 moves landed' },
    leaderBox: { face: { title: 'Ask before you answer' } },
    todayTechnique: { empty: true, reason: 'nothing queued' },
  });
  const { indexPage } = valsIndex(app, ctx, v);
  assert.equal(rowOf(indexPage, 'practice').value, '2 of 6 moves landed');
  // stale means Nova's picture is out of date — that is what waits on him,
  // not the day's idea, so the gold goes on the count
  assert.equal(rowOf(indexPage, 'leader').value, '3 open');
  assert.equal(rowOf(indexPage, 'leader').hot, true);
  assert.equal(rowOf(indexPage, 'technique').value, '', 'an empty repertoire has no position to report');
});

test('money speaks only for the month the ledger is showing, and only if it is this one', () => {
  const { app, ctx, v } = fixture({ moneyLoaded: true, moneyMonth: '1999-08', moneySpentLabel: '$80.00' });
  assert.equal(rowOf(valsIndex(app, ctx, v).indexPage, 'money').value, '');
});

test('Fuel and the protein ring can never disagree', () => {
  assert.equal(fuelValue([{ key: 'protein', value: '96', small: '/150G', state: 'behind' }]), '96 of 150 g');
  assert.equal(fuelValue([{ key: 'protein', value: '96', small: 'G', state: 'missed' }]), '96 g', 'no floor set: the grams alone');
  assert.equal(fuelValue([{ key: 'protein', value: '—', small: '', state: 'absent' }]), '');
  assert.equal(fuelValue([]), '');
  assert.equal(fuelValue(undefined), '');
});

test('a long value is cut at a word and says so — never mid-word', () => {
  const s = 'Ask one question before you give an answer in your next one-on-one';
  const out = clipWords(s, 32);
  assert.ok(out.length <= 32, out);
  assert.ok(out.endsWith('…'));
  assert.ok(s.startsWith(out.slice(0, -1)), 'a prefix of the real words');
  assert.equal(s[out.length - 1], ' ', 'the cut falls on a space');
  assert.equal(clipWords('Short enough', 32), 'Short enough');
  assert.equal(clipWords(undefined), '');
});

test('each row\'s door: a screen navigates, the two overlays open in place', () => {
  const { app, ctx, v, calls } = fixture();
  const { indexPage } = valsIndex(app, ctx, v);
  rowOf(indexPage, 'notes').go();
  rowOf(indexPage, 'review').go();
  rowOf(indexPage, 'technique').go();
  rowOf(indexPage, 'notes').warm();
  indexPage.you.open();
  assert.deepEqual(calls, ['go:notes', 'review', 'technique', 'warm:notes', 'settings']);
  assert.equal(rowOf(indexPage, 'review').warm, undefined, 'an overlay has no chunk to warm');
});

test('off the Index there is no Index to build', () => {
  const { app, ctx, v } = fixture();
  app.state.screen = 'mission';
  assert.deepEqual(valsIndex(app, ctx, v), { indexPage: null });
});

// ------------------------------------------------------------ the tab bar --

test('the tab bar is summary-only, and the floating dock is still there for every other style', () => {
  const chrome = read('src/MobileChrome.jsx');
  assert.match(chrome, /\{v\.summary \? <SummaryDock v=\{v\} \/> : \(\n\s*<div className="nv-liquid nv-liquid-dock"/);
  assert.match(chrome, /onClick=\{\(\) => setMoreOpen\(true\)\}/, 'the More sheet still opens under the other styles');
});

test('the tab bar\'s Nova is the dock\'s Nova: tap to talk; hold captures (the summary Inbox, 27 Sep)', () => {
  const dock = read('src/SummaryDock.jsx');
  // the hold was the live transcript; since the summary Inbox (mockup 60 #5)
  // it raises the capture composer, and falls back to the transcript only
  // when no composer is offered
  // 29 Sep (the Nova thread, mockup 63 D): on the Nova tab the tap opens that
  // page's own microphone (novaThread.dockTalk), and the orb reads that page's
  // mic too; on every other page it is startLiveTalk and liveMicOpen, as before
  assert.match(dock, /onClick=\{v\.novaThread\?\.dockTalk \|\| v\.startLiveTalk\} onLongPress=\{v\.openCaptureSheet \|\| v\.holdNovaText\} aria-label="Talk to Nova\. Hold to capture a thought"/);
  assert.match(dock, /const listening = !!\(v\.novaListening \|\| v\.novaThread\?\.micOpen\);/);
  // 30 Sep (his "fill the orb further so it takes up the whole circle"): the
  // core is drawn at the circle's inner diameter, 60px less the 1px rim each
  // side, and the halo hugs the glass; the state tints are NovaCore's, kept
  assert.match(dock, /<VoiceHalo speaking=\{v\.novaSpeaking\} listening=\{listening\} inset="-3px" \/>/);
  assert.match(dock, /const ORB = 58;/);
  assert.match(dock, /<NovaCore size=\{ORB\} variant="mini" engine=\{v\.coreStyle\} speaking=\{v\.novaSpeaking\} listening=\{listening\}/);
  assert.doesNotMatch(dock, /formOnly/, 'the tab bar orb keeps its gold and violet tints');
  const css = read('src/index.css');
  assert.match(css, /\.nv-sum-nova \{\n  position: relative; flex: none; box-sizing: border-box; width: 60px; height: 60px;/, 'the circle the 58 is measured from');
  assert.match(css, /\.nv-sum-nova-orb \{ display: block; width: 58px; height: 58px;/);
  assert.match(css, /\.nv-sum-nova\[data-listening="true"\] \.nv-sum-nova-orb \{ transform: translateY\(-7px\) scale\(\.586\); \}/, 'listening, it still steps up to 34px');
  assert.match(dock, /v\.tabs\.slice\(0, 4\)/, 'four of his tabs, in his order');
  assert.match(dock, /go=\{v\.goIndex\}/, 'More is the Index');
  assert.match(dock, /haptic="tick"/, 'a tab he cannot feel is the dock bug again (haptics.test.js)');
  assert.match(read('src/vals/valsChrome.js'), /goIndex: go\('index'\)/);
});
