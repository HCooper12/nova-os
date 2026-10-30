// A back swipe moves <main> only when nothing inside it is position:fixed
// (src/edgeBack.js FIXED_INSIDE): a transformed ancestor re-anchors fixed
// children. 31 Oct 2026, his recording: the Nova page's stage layers are
// fixed by CSS class, the check missed them, and the sky, core and header
// slid away with the scroll. Every CSS-fixed layer the Nova page renders
// must say so with data-fixed, and the check must look for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = (f) => readFile(new URL(`../../src/${f}`, import.meta.url), 'utf8');

test('the back swipe treats a data-fixed layer as fixed', async () => {
  assert.match(await src('edgeBack.js'), /FIXED_INSIDE = [^\n]*\[data-fixed\]/);
});

test('every fixed stage layer on the Nova page carries data-fixed', async () => {
  const css = await src('index.css');
  const stage = await src('NovaStage.jsx');
  const fixed = [...css.matchAll(/^\.(nv-nt-[a-z0-9-]+)\s*\{[^}]*position:\s*fixed/gm)].map((m) => m[1]);
  assert.ok(fixed.length >= 3, `found ${fixed.join(', ')}`);
  for (const cls of fixed) {
    const tag = stage.match(new RegExp(`<[a-z]+[^>]*className="${cls}"[^>]*>`));
    if (!tag) continue; // not rendered by the stage
    assert.match(tag[0], /data-fixed/, `${cls} must carry data-fixed`);
  }
});
