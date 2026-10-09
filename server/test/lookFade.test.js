// THE LOOK CROSS-FADES (9 Oct 2026, his call; the reel's sixth move: "one
// accent re-tints everything in one move"). Theme, style, material and calm
// all change through ONE function, which dissolves the old frame into the
// new with a root View Transition and names nothing else, so no glass is
// snapshotted on its own (the 17 Sep dock).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crossFadeLook, LOOK_MS } from '../../src/lookFade.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, `missing ${a} or ${b}`); return s.slice(i, j); };

function fakeDoc({ vt = true, hidden = false } = {}) {
  const classes = new Set();
  const log = [];
  let finish;
  const doc = {
    hidden,
    documentElement: { classList: { add: (c) => { classes.add(c); log.push(`+${c}`); }, remove: (c) => { classes.delete(c); log.push(`-${c}`); } } },
  };
  if (vt) {
    doc.startViewTransition = (cb) => {
      log.push('start');
      cb();
      const finished = new Promise((r) => { finish = r; });
      return { finished, ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
    };
  }
  return { doc, classes, log, finish: () => finish?.() };
}

test('the theme switch goes through one function', () => {
  const app = read('src/App.jsx');
  for (const [a, b] of [
    ['  setNovaTheme(theme) {', '  setCalmMode('],
    ['  setCalmMode(calm) {', '  setNovaStyle('],
    ['  setNovaStyle(style) {', '  setMaterial('],
    ['  setMaterial(material) {', '  setCoreStyle('],
  ]) {
    const fn = between(app, a, b);
    assert.match(fn, /this\.changeLook\(/, `${a.trim()} changes the look through changeLook`);
    assert.ok(!/applyAppearance|setState/.test(fn), `${a.trim()} applies nothing itself`);
  }
  assert.equal((app.match(/applyAppearance\(/g) || []).length, 1, 'App stamps the look in exactly one place');
  const cl = between(app, '  changeLook(patch) {', '  setNovaTheme(');
  assert.match(cl, /const stamp = \(\) => applyAppearance\(look\.novaTheme, look\.calmMode, look\.novaStyle, look\.material\);/);
  assert.match(cl, /crossFadeLook\(redraws \? \(\) => \{ flushSync\(\(\) => this\.setState\(patch\)\); stamp\(\); \} : stamp, \{/, 'a style change renders inside the fade; a colour change only stamps');
  assert.match(cl, /if \(!redraws\) this\.setState\(patch\);/, 'and React follows once the new frame is captured');
  assert.match(cl, /\.\.\.\(this\.pendingLook \|\| \{\}\), \.\.\.patch/, 'two setters in one tick never stamp a stale look');
});

test('a look change is a root dissolve, with every other name lifted while it runs', async () => {
  const { doc, classes, log, finish } = fakeDoc();
  let applied = 0;
  assert.equal(crossFadeLook(() => { applied += 1; log.push('apply'); }, { doc }), 'fade');
  assert.equal(applied, 1);
  assert.deepEqual(log.slice(0, 3), ['+nv-look', 'start', 'apply'], 'the class is on before the old frame is captured');
  assert.ok(classes.has('nv-look'));
  finish();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(!classes.has('nv-look'), 'and off once the fade has finished');
  const css = read('src/index.css');
  assert.match(css, /:root\.nv-look \* \{ view-transition-name: none !important; \}/);
  assert.match(css, /:root\.nv-look::view-transition-old\(root\) \{ animation: nvLookOut 250ms ease both; \}/);
  assert.match(css, /@keyframes nvLookIn \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/, 'opacity only: no rise, nothing moves');
  assert.equal(LOOK_MS, 250);
});

test('`after` runs once the new look is in place, on every path', async () => {
  const { doc, log, finish } = fakeDoc();
  crossFadeLook(() => log.push('apply'), { doc, after: () => log.push('after') });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(log.filter((x) => x === 'apply' || x === 'after'), ['apply', 'after']);
  finish();
  const cut = fakeDoc({ hidden: true });
  crossFadeLook(() => cut.log.push('apply'), { doc: cut.doc, after: () => cut.log.push('after') });
  assert.deepEqual(cut.log, ['apply', 'after']);
});

test('a hidden page cuts, and a browser without View Transitions fades the old ground instead', () => {
  const hidden = fakeDoc({ hidden: true });
  let n = 0;
  assert.equal(crossFadeLook(() => { n += 1; }, { doc: hidden.doc }), 'cut');
  assert.equal(n, 1);
  assert.ok(!hidden.log.includes('start'));
  const src = read('src/lookFade.js');
  assert.match(src, /if \(!doc \|\| reducedMotion\(\) \|\| doc\.hidden\) \{ apply\(\); then\(\); return 'cut'; \}/, 'reduced motion: a cut');
  assert.match(src, /typeof doc\.startViewTransition !== 'function'\) \{ fadeGround\(apply, doc\); then\(\); return 'ground'; \}/);
});
