// INTERACTIVE ACTUALLY RENDERS. This file exists because of a black screen.
//
// 15 Sep 2026: the haptic overlay changed Interactive from `<Tag {...props} />`
// to `<Tag {...props}>{children}{overlay}</Tag>`. Two expression children hand
// React an ARRAY even when both are undefined — and React throws outright on a
// void element with children ("input is a void element tag and must neither
// have children"). With no root error boundary that unmounts the whole tree.
//
// `Interactive as="input"` is used all through Fuel, Settings, Ops, the recipe
// overlay and the portion sheet, so every one of those screens went black the
// moment he tapped into them. Lint passed. Build passed. 1615 tests passed.
// None of them render a component.
//
// So this does. It is deliberately cheap: render the shapes that exist in the
// app and assert they do not throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import { createElement as h } from 'react';
import { readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformWithOxc } from 'vite';

// node cannot import .jsx, so the component is compiled here and written BESIDE
// the original — its relative imports have to keep resolving. Removed after.
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const TMP = path.join(SRC, '__interactive.compiled.test.mjs');
const { code } = await transformWithOxc(
  await readFile(path.join(SRC, 'Interactive.jsx'), 'utf8'),
  'Interactive.jsx',
);
await writeFile(TMP, code, 'utf8');
const { Interactive } = await import(pathToFileURL(TMP).href);
test.after(async () => { await unlink(TMP).catch(() => {}); });

const render = (props) => renderToString(h(Interactive, props));

test('a void tag renders — this is the black screen, pinned', () => {
  // the exact shape Fuel/Settings/Ops use
  const html = render({ as: 'input', value: '', onChange: () => {}, placeholder: 'What did you eat?', base: 'flex:1' });
  assert.match(html, /^<input/, 'renders as an input');
  assert.doesNotMatch(html, /<\/input>/, 'and never gets a closing tag, which is the throw');
});

test('every void tag Interactive could be given survives', () => {
  for (const tag of ['input', 'img', 'br', 'hr', 'embed', 'source', 'track', 'wbr', 'col', 'area']) {
    assert.doesNotThrow(() => render({ as: tag }), `<Interactive as="${tag}"> throws`);
  }
});

test('textarea too — not void, but React refuses it children when value is set', () => {
  // the recipe edit form: <Interactive as="textarea" rows value onChange />
  assert.doesNotThrow(() => render({ as: 'textarea', rows: 7, value: 'x', onChange: () => {} }));
  assert.doesNotThrow(() => render({ as: 'textarea', value: '', onChange: () => {}, haptic: 'tick', onClick: () => {} }));
});

test('a void tag with a haptic word still does not get an overlay it cannot hold', () => {
  // the combination that would reintroduce the crash
  assert.doesNotThrow(() => render({ as: 'input', haptic: 'tick', onClick: () => {}, value: '', onChange: () => {} }));
});

test('an ordinary tag still renders its children', () => {
  const html = renderToString(h(Interactive, { as: 'span', onClick: () => {} }, 'Tap me'));
  assert.match(html, /Tap me/);
});

test('the shapes the house objects use all render', () => {
  assert.doesNotThrow(() => renderToString(h(Interactive, { as: 'div', base: 'display:flex', onClick: () => {} }, 'x')));
  assert.doesNotThrow(() => renderToString(h(Interactive, { as: 'button', onClick: () => {} }, 'x')));
  assert.doesNotThrow(() => renderToString(h(Interactive, { as: 'a', href: '#', base: { color: 'red' } }, 'x')));
  assert.doesNotThrow(() => renderToString(h(Interactive, { as: 'textarea', value: '', onChange: () => {} })));
  assert.doesNotThrow(() => renderToString(h(Interactive, { as: 'label' }, 'x')));
});

test('a clickable non-native tag keeps its keyboard affordances', () => {
  const html = renderToString(h(Interactive, { as: 'span', onClick: () => {} }, 'Go'));
  assert.match(html, /role="button"/);
  assert.match(html, /tabindex="0"/);
});

test('EVERY tag the codebase actually hands Interactive renders', async () => {
  // Generated, not hand-listed: it reads the real call sites, so a tag added to
  // a screen next month is covered without anyone remembering to add it here.
  // This is the test that would have caught the black screen on its own.
  const walk = async (dir) => {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...await walk(full));
      else if (/\.jsx?$/.test(e.name)) out.push(full);
    }
    return out;
  };
  const tags = new Set(['div']); // the default
  for (const f of await walk(SRC)) {
    const text = await readFile(f, 'utf8');
    for (const m of text.matchAll(/<Interactive\b[^>]*?\bas=["']([a-z]+)["']/gs)) tags.add(m[1]);
  }
  assert.ok(tags.size > 3, `expected several tags, found ${[...tags].join(', ')}`);
  for (const tag of tags) {
    // rendered the way the app renders them: clickable, and with a haptic word,
    // which is the combination that introduced the crash
    assert.doesNotThrow(
      () => render({ as: tag, onClick: () => {}, haptic: 'tick', value: tag === 'input' || tag === 'textarea' ? '' : undefined, onChange: () => {} }),
      `<Interactive as="${tag}"> throws — that is a black screen on every screen using it`,
    );
  }
});
