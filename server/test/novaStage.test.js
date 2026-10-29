// ONE NOVA, ONE CANVAS (29 Oct 2026, design/mockups/106-one-nova.html,
// option A): src/NovaStage.jsx and its pure facts, src/novaStageFacts.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasProgress, lastExchange, TRAVEL_PX, PRESENTER_SCALE } from '../../src/novaStageFacts.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the scroll is the progress: 0 on the stage, 1 once he is TRAVEL_PX up the history', () => {
  assert.equal(TRAVEL_PX, 260, 'the mockup\'s distance');
  assert.equal(canvasProgress(500, 500), 0, 'at the foot');
  assert.equal(canvasProgress(370, 500), 0.5);
  assert.equal(canvasProgress(0, 500), 1);
  assert.equal(canvasProgress(0, 2000), 1, 'clamped');
  assert.equal(canvasProgress(0, 0), 0, 'nothing to scroll is the stage');
  assert.equal(canvasProgress(600, 500), 0, 'an overscroll past the foot is the stage');
  assert.ok(PRESENTER_SCALE > 0.2 && PRESENTER_SCALE < 0.4, 'between the mockup\'s header core and the full screen\'s');
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

test('the stage reuses the full screen: its plate, steps, captions, field and phase, and its panel dock', () => {
  const src = read('src/NovaStage.jsx');
  assert.match(src, /<Listening dict=\{dict\} since=\{since\} send=\{false\} \/>/, 'the composer owns Send now');
  assert.match(src, /<Thinking S=\{S\} T=\{T\} heard=\{heardRef\.current\} streaming=\{streaming\} \/>/);
  assert.match(src, /<Captions said=\{said\} on=\{captions\}[^>]*pour=\{pours \? pour : null\} look=\{WORD_LOOK\.thread\}/);
  assert.match(src, /<StageCard card=\{dock\.hero\} face="summary" \/>/);
  assert.match(src, /const phase = useHeldPhase\(focusPhase\(S\.key, \{ streaming \}\)\);/);
  assert.match(src, /useEmberField\(fieldRef, coreRef, live\);/);
  // the briefing's full screen is untouched: its import and mode stay
  assert.match(read('src/screens/Briefing.jsx'), /<NovaFocus T=\{T\} S=\{Sx\} [^>]*mode="briefing"/);
});

test('performance: the scroll writes transform and opacity onto the fixed layers, never React state; the field rests under the history', () => {
  const src = read('src/NovaStage.jsx');
  const driver = src.slice(src.indexOf('const apply = () => {'), src.indexOf('const applyRef = useRef(apply);'));
  assert.match(driver, /core\.style\.transform = `translate3d\(/);
  assert.doesNotMatch(driver, /set[A-Z]\w*\(|setProperty\(/, 'no state, no inherited variable per frame');
  assert.match(src, /if \(!d\.raf\) d\.raf = requestAnimationFrame\(progress\);/, 'one write a frame at most');
  assert.match(src, /main\.addEventListener\('scroll', onScroll, \{ passive: true \}\);/);
  assert.match(driver, /live\.current\.paused = d\.sp > 0\.9 && d\.ph < 0\.5;/);
  const field = read('src/NovaFocus.jsx');
  assert.match(field, /if \(live\.current\.paused\) \{\n\s*if \(!idle\) \{ ctx\.clearRect\(0, 0, W, H\); idle = true; \}/);
});

test('reduced motion: the core cross-fades between its two spots, the stage changes are fades', () => {
  const src = read('src/NovaStage.jsx');
  assert.match(src, /q = q > 0\.5 \? 1 : 0;\n\s*if \(d\.placed !== -1 && d\.placed !== q && core\.animate\) core\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], \{ duration: 200, easing: 'linear' \}\);/);
  const css = read('src/index.css');
  const block = css.slice(css.indexOf('ONE NOVA, ONE CANVAS (29 Oct 2026)'), css.indexOf('/* end of the Nova thread */'));
  const rm = block.slice(block.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.nv-nt-ofield, \.nv-nt-obox \{ transition: opacity \.2s ease; \}/);
  // the core and the controls are 44px targets or more; the stage is the room between the head and the composer
  assert.match(block, /\.nv-nt-osec \{[^}]*height: calc\(var\(--oc-vh, 100dvh\) - var\(--oc-top, 0px\) - var\(--oc-foot, 150px\)\);/);
  for (const cls of ['nv-nt-oback, \\.nv-nt-omore']) assert.match(block, new RegExp(`\\.${cls} \\{[^}]*height: 44px`));
});

test('a turn that starts while he is up in the history brings him down to the stage, and the history growing on the way moves the target', () => {
  const src = read('src/NovaStage.jsx');
  assert.match(src, /if \(phase === 'stage' && lastPhase\.current !== 'stage' && d\.sp > 0\.02\) toStageRef\.current\(true\);/);
  assert.match(src, /if \(d\.pinned\) main\.scrollTop = main\.scrollHeight;\n\s*else if \(d\.seeking\) toStageRef\.current\(true\);/);
});
