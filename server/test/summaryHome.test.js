// THE SUMMARY HOME'S CONTRACT (P2-B, HOME-REDESIGN-PLAN.md): the three things
// about MissionSummary and its Edit sheet that no screenshot would catch
// breaking. Read as source, the way contrast.test.js reads Home's type.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the summary branch is taken before the structured one', () => {
  // `structured` is true under summary as well (valsChrome.js), so a summary
  // branch placed after it would never be reached and he would get cupertino
  const mc = read('src/screens/MissionControl.jsx');
  const summary = mc.indexOf('if (v.summary && v.summaryHome) return <MissionSummary');
  const structured = mc.indexOf('if (v.structured) return <MissionStructured');
  assert.ok(summary > 0, 'the summary branch is missing');
  assert.ok(structured > 0, 'the structured branch is missing');
  assert.ok(summary < structured, 'the summary branch must come first');
});

test('no type on the summary Home is below 12px', () => {
  const sizes = [];
  for (const f of ['src/screens/MissionSummary.jsx', 'src/PinnedEditSheet.jsx']) {
    const src = read(f);
    for (const m of src.matchAll(/font: [`'"]([^`'"]*)[`'"]/g)) {
      const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
      if (px) sizes.push({ where: f, px: Number(px[1]) });
    }
  }
  const css = read('src/index.css');
  const start = css.indexOf('THE SUMMARY HOME ITSELF');
  const end = css.indexOf('/* shared panes for the new components */');
  assert.ok(start > 0 && end > start, 'the .nv-sum-* section was not found');
  for (const m of css.slice(start, end).matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
    const px = /(\d+(?:\.\d+)?)px/.exec(m[1]);
    if (px) sizes.push({ where: 'index.css .nv-sum-*', px: Number(px[1]) });
  }
  assert.ok(sizes.length > 30, `expected to read the whole screen's type, found ${sizes.length}`);
  const small = sizes.filter((s) => s.px < 12).map((s) => `${s.where}: ${s.px}px`);
  assert.deepEqual(small, [], `below 12px:\n  ${small.join('\n  ')}`);
});

test('the Edit sheet is a modal the back swipe can find and close', () => {
  // edgeBack.js picks the topmost [aria-modal="true"] by its INLINE z-index
  // and closes it by clicking it — so all three have to be on the root
  const sheet = read('src/PinnedEditSheet.jsx');
  const root = /<div ref=\{exit\.scrimRef\}[^>]*>/.exec(sheet)?.[0] || '';
  assert.match(root, /role="dialog"/);
  assert.match(root, /aria-modal="true"/);
  assert.match(root, /onClick=\{exit\.close\}/, 'a tap on the backdrop (and the swipe\'s click) must close it');
  assert.match(sheet, /zIndex: 145/, 'the z-index has to be inline for topOverlay() to read it');
  assert.match(sheet, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/, 'a tap inside the panel must not reach the backdrop');
});

test('Summary is offered in Settings now that its Home exists', () => {
  const chrome = read('src/vals/valsChrome.js');
  assert.match(chrome, /novaStyleOptions: NOVA_STYLES\.map\(/);
  assert.doesNotMatch(chrome, /s\.value !== 'summary'/);
});
