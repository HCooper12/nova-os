// ONE NOVA, ONE CANVAS (29 Oct 2026, design/mockups/106-one-nova.html,
// option A): src/NovaStage.jsx and its pure facts, src/novaStageFacts.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasProgress, lastExchange, stageState, stageScale, TRAVEL_PX, PRESENTER_RATIO, STAGE, PRESENTER, ONE_NOVA_CHROME, STAGE_SPEAK } from '../../src/novaStageFacts.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the scroll is the progress: 0 on the stage, 1 once he is TRAVEL_PX up the history', () => {
  assert.equal(TRAVEL_PX, 260, 'the mockup\'s distance');
  assert.equal(canvasProgress(500, 500), 0, 'at the foot');
  assert.equal(canvasProgress(370, 500), 0.5);
  assert.equal(canvasProgress(0, 500), 1);
  assert.equal(canvasProgress(0, 2000), 1, 'clamped');
  assert.equal(canvasProgress(0, 0), 0, 'nothing to scroll is the stage');
  assert.equal(canvasProgress(600, 500), 0, 'an overscroll past the foot is the stage');
  assert.ok(Math.abs(PRESENTER_RATIO - 0.2 / 0.84) < 1e-9, 'the mockup\'s header core, 0.2 against the stage\'s 0.84');
});

test('the last exchange: his newest words and the answer after them, never an older answer as this one\'s', () => {
  const lines = [
    { who: 'you', text: 'Log my breakfast' },
    { who: 'nova', text: 'Logged  in\nFuel.' },
    { who: 'you', text: 'Bench or press?' },
    { who: 'nova', agent: 'Coach', text: 'Both work.' },
  ];
  assert.deepEqual(lastExchange(lines), { you: { i: 2, text: 'Bench or press?' }, nova: { i: 3, who: 'Coach', text: 'Both work.' } });
  assert.deepEqual(lastExchange(lines.slice(0, 3)), { you: { i: 2, text: 'Bench or press?' }, nova: null }, 'unanswered');
  assert.deepEqual(lastExchange([...lines.slice(0, 3), { who: 'nova', text: 'Both', streaming: true }]).nova, null, 'not shown half-said');
  assert.deepEqual(lastExchange([{ who: 'nova', text: 'Morning.' }]), { you: null, nova: { i: 0, who: 'Nova', text: 'Morning.' } });
  assert.deepEqual(lastExchange([]), { you: null, nova: null });
});

test('mockup 106 is the contract: its numbers, its four words and their dots (31 Oct)', () => {
  assert.deepEqual(STAGE, { coreY: 250, stateY: 396, wordsY: 446, plateY: 426, hintGap: 50, plateGap: 55, side: 28, plateSide: 12 });
  assert.deepEqual(PRESENTER, { x: 44, y: 68 });
  assert.deepEqual(stageState('turn'), { word: 'Ready', tone: 'cy' });
  assert.deepEqual(stageState('listening'), { word: 'Listening', tone: 'vi' });
  assert.deepEqual(stageState('thinking'), { word: 'Thinking', tone: 'cy' });
  assert.deepEqual(stageState('speaking'), { word: 'Speaking', tone: STAGE_SPEAK });
  assert.equal(STAGE_SPEAK, 'gold', 'mockup 106 (his speaking colour is being asked; jade is a one-line change)');
  assert.equal(stageState('speaking', { contest: true }).tone, 'contest');
  // the core grows while he talks, as the mockup's body does, and never travels in a turn
  assert.ok(stageScale('listening') > stageScale('turn'));
  const css = read('src/index.css');
  const block = css.slice(css.indexOf('ONE NOVA STAGE (31 Oct 2026)'), css.indexOf('/* end of the One Nova stage */'));
  assert.match(block, /\.nv-nt-stword \{[^}]*top: 396px; height: 28px;/);
  assert.match(block, /\.nv-nt-stexch \{ left: 28px; right: 28px; top: 446px;/);
  assert.match(block, /\.nv-nt-stheard \{ left: 28px; right: 28px; top: 446px;[^}]*font: italic 400 22px\/1\.35 var\(--nv-font-serif\)/);
  assert.match(block, /\.nv-nt-stplate \{\n\s*left: 12px; right: 12px; top: 426px; height: calc\(var\(--st-ctop, 762px\) - 55px - 426px\)/);
  assert.match(block, /\.nv-nt-sthint \{[^}]*top: calc\(var\(--st-ctop, 762px\) - 66px\)/);
  assert.match(block, /\.nv-nt\.mob\[data-tabbar="0"\] \.nv-nt-composer \{ bottom: 14px; \}/);
  assert.match(block, /\.nv-nt-wave i \{[^}]*background: var\(--nv-vi\)/);
  assert.match(block, /\.nv-nt \.nv-nt-stop \{[^}]*background: var\(--nv-vi\)/);
});

test('his four answers (31 Oct): no tab bar on the phone, the + stays, the › only on the history view, no Brief me pill', () => {
  assert.deepEqual(ONE_NOVA_CHROME, { tabBar: false, attach: true, status: true, briefMe: false });
  assert.match(read('src/MobileChrome.jsx'), /v\.summary \? \(v\.novaThread && !ONE_NOVA_CHROME\.tabBar \? null : <SummaryDock v=\{v\} \/>\)/);
  const src = read('src/NovaStage.jsx');
  // the › fades in with the presenter's header, never at rest
  assert.match(src, /for \(const el of \[bandRef\.current, pnRef\.current, backRef\.current, moreRef\.current\]\)/);
  assert.match(src, /const asks = chrome\.briefMe \? focusAsks/);
  assert.match(read('src/screens/NovaThread.jsx'), /\{attach && \(\n\s*<label className="nv-nt-plus"/);
});

test('the core: the real one, gold while speaking, the composer with the mockup\'s words', () => {
  const core = read('src/NovaCore.jsx');
  assert.match(core, /hue \+= \(\(gold \? 445 : 145\) - hue\) \* mS \* 0\.82;/);
  assert.match(read('src/coreGrains.js'), /const stateC = \(w\) => \(w === SPEAK && gold \? C_GOLD : STATE_C\[w\]\);/);
  const thread = read('src/screens/NovaThread.jsx');
  assert.match(thread, /'Type, or hold to talk'/);
  assert.match(thread, /<button type="button" className="nv-nt-mic" onClick=\{onTalk\}/);
  assert.match(thread, /onClick=\{\(\) => \{ flushSync\(\(\) => dict\.abandon\(\)\); fieldRef\.current\?\.focus\(\); \}\}/, '× Type closes the mic and raises the keyboard');
});

test('performance: the scroll writes transform and opacity onto the fixed layers, never React state', () => {
  const src = read('src/NovaStage.jsx');
  const driver = src.slice(src.indexOf('const apply = () => {'), src.indexOf('const applyRef = useRef(apply);'));
  assert.match(driver, /core\.style\.transform = `translate3d\(/);
  assert.doesNotMatch(driver, /set[A-Z]\w*\(|setProperty\(/, 'no state, no inherited variable per frame');
  assert.match(src, /if \(!d\.raf\) d\.raf = requestAnimationFrame\(progress\);/, 'one write a frame at most');
  assert.match(src, /main\.addEventListener\('scroll', onScroll, \{ passive: true \}\);/);
  // a back swipe onto the page moves <main> before it renders: measure again when it lets go
  assert.match(src, /mo\?\.observe\(main, \{ attributes: true, attributeFilter: \['style'\] \}\);/);
});

test('reduced motion: the core cross-fades between its two spots, the stage changes are fades', () => {
  const src = read('src/NovaStage.jsx');
  assert.match(src, /q = q > 0\.5 \? 1 : 0;\n\s*if \(d\.placed !== -1 && d\.placed !== q && core\.animate\) core\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: 200, easing: 'linear' \}\);/);
  const css = read('src/index.css');
  const block = css.slice(css.indexOf('ONE NOVA STAGE (31 Oct 2026)'), css.indexOf('/* end of the One Nova stage */'));
  const rm = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.nv-nt-stsky i \{ animation: none; \}/);
  assert.match(rm, /\.nv-nt-stexch, \.nv-nt-stheard, \.nv-nt-stplate \{ transform: none; \}/);
  for (const cls of ['nv-nt-oback, \\.nv-nt-omore']) assert.match(block, new RegExp(`\\.${cls} \\{[^}]*min-height: 44px`));
});

test('a turn that starts while he is up in the history brings him down to the stage, and the history growing on the way moves the target', () => {
  const src = read('src/NovaStage.jsx');
  assert.match(src, /if \(turning && !wasTurning\.current && drive\.current\.sp > 0\.02\) toStageRef\.current\(true\);/);
  assert.match(src, /if \(d\.pinned\) main\.scrollTop = main\.scrollHeight;\n\s*else if \(d\.seeking\) toStageRef\.current\(true\);/);
});
