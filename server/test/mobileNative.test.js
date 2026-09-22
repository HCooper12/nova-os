// THE NATIVE FLOOR.
//
// The platform-layer tells that give a web app away on a phone. Each one here
// was found in Nova on 16 Sep 2026 by auditing against Emil Kowalski's
// `mobile-native` skill, and each is one declaration — which is exactly why
// they rot: nothing breaks when one is deleted, the app just quietly starts
// feeling like a website again.
//
// None of this is a substitute for his phone. It proves the declarations are
// PRESENT; only hardware proves they work.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const CSS = readFileSync(root('src/index.css'), 'utf8');
const HTML = readFileSync(root('index.html'), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// pull out the body of every `@media (hover: hover)…{ }` block, brace-matched
function hoverGatedBlocks(css) {
  const out = [];
  const re = /@media \(hover: hover\)[^{]*\{/g;
  for (const m of css.matchAll(re)) {
    let i = m.index + m[0].length, depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    out.push(css.slice(m.index, i));
  }
  return out;
}

test('every :hover is behind a capability query — touch leaves it stuck on', () => {
  const css = strip(CSS);
  const total = (css.match(/:hover/g) || []).length;
  const gated = hoverGatedBlocks(css).join('\n').match(/:hover/g) || [];
  assert.ok(total > 0, 'no :hover at all would mean this test is watching nothing');
  assert.equal(gated.length, total, `${total - gated.length} ungated :hover rule(s) — they stick after a tap on iOS`);
});

test('controls are not selectable text, and CONTENT still is', () => {
  const css = strip(CSS);
  assert.match(css, /-webkit-user-select:\s*none/, 'Safari still needs the prefix');
  assert.match(css, /-webkit-touch-callout:\s*none/, 'or a long press raises the copy/share callout');
  // the selector must reach Interactive's clickables, which are divs carrying role="button"
  const rule = css.slice(css.indexOf('button, label, select, [role="button"]'));
  assert.ok(rule.startsWith('button, label, select, [role="button"]'), 'the control selector is gone');
  // and must never reach body — that is how you stop someone copying an error message
  assert.ok(!/(^|[^-\w])body[^{]*\{[^}]*user-select:\s*none/m.test(css), 'user-select:none on body is a defect');
});

test('an inner scroller cannot hand its leftover scroll to the page behind it', () => {
  const css = strip(CSS);
  assert.match(css, /html,\s*body\s*\{[^}]*overscroll-behavior:\s*none/, 'the root still refuses pull-to-refresh');
  assert.match(css, /overscroll-behavior:\s*contain/, 'and inner scrollers contain their own');
});

test('the app shell measures the viewport that is actually visible', () => {
  const app = readFileSync(root('src/App.jsx'), 'utf8');
  assert.ok(!/(min-)?height:100vh/.test(app), '100vh is the LARGEST viewport — it overflows by the URL bar');
  // svh for the SCROLLING root, not dvh. dvh tracks the URL bar as it
  // collapses, which is right for a fixed app shell and wrong for something
  // that grows: it resizes mid-scroll and the page visibly jumps. He reported
  // exactly that from the gym on 16 Sep. svh is the smallest viewport, so it
  // is stable and can never overflow.
  // lvh, not svh and not dvh — the full reasoning is in chromeGeometry.test.js.
  // svh measured 812 against his 874px screen and left a dead band; dvh tracks
  // the browser chrome and made the page jump under his scroll.
  assert.match(app, /min-height:100lvh/, 'the root must never be shorter than the viewport');
  assert.match(app, /height:100dvh/, 'the FIXED desktop shell does want the visible area');
});

test('REDUCE TRANSPARENCY is honoured by the whole app, not only the new glass', () => {
  const css = strip(CSS);
  const at = css.lastIndexOf('@media (prefers-reduced-transparency: reduce)');
  assert.ok(at > 0, 'the app-wide guard is gone');
  const block = css.slice(at);
  assert.match(block, /\*\s*\{[^}]*backdrop-filter:\s*none\s*!important/, 'inline blurs can only be reached this way');
  // dropping the blur WITHOUT solidifying the surface is worse than doing nothing
  assert.match(block, /--nv-glass2:\s*var\(--nv-bg2\)/, 'the surface must go opaque in the same breath');
  assert.match(block, /--nv-glass:\s*var\(--nv-bg1\)/);
});

test('the status bar follows the theme — Nova ships a LIGHT one', () => {
  const theme = readFileSync(root('src/theme.js'), 'utf8');
  const fn = theme.slice(theme.indexOf('export function applyAppearance'));
  assert.match(fn, /meta\[name="theme-color"\]/, 'the tag is never updated, so daylight gets a black strip');
  assert.match(fn, /--nv-void/, 'read the ground from the token, not from a second table that can drift');
  // the daylight palette really is light, which is what makes this a bug and not a nicety
  const day = CSS.slice(CSS.indexOf(':root[data-nv-theme="daylight"]'));
  assert.match(day.slice(0, day.indexOf('}')), /--nv-void:\s*#f2f2f7/);
});

test('the things that were already right stay right', () => {
  assert.match(HTML, /viewport-fit=cover/, 'without it every env(safe-area-inset-*) is 0px');
  assert.match(CSS, /-webkit-tap-highlight-color:\s*transparent/);
  assert.match(CSS, /-webkit-text-size-adjust:\s*100%/);
  assert.match(CSS, /input,\s*textarea,\s*select\s*\{\s*font-size:\s*16px/, 'under 16px and iOS zooms the page on focus');
  assert.match(CSS, /touch-action:\s*manipulation/);
});

// THE SCALE LOCK IS OFF — and must stay off (22 Sep 2026).
//
// Sixth attempt at the top-bar blur. His test that day: Chrome on the phone
// is sharp, the installed app is soft, same build. Chrome on iOS is WebKit,
// so standalone mode is the only variable — and `user-scalable=no` /
// `maximum-scale` is the one viewport declaration iOS ignores in a tab and
// honours in a standalone PWA. It is also an accessibility failure in its own
// right (mobile-native, hard rule 4), and the focus-zoom it was guarding
// against cannot happen: index.css forces every input to 16px.
//
// `minimum-scale=1.0` is NOT the same decision and stays — it is what stops
// the pinch that shrank the app into the corner and exposed empty space.
test('nothing in the viewport disables zoom, and pinching still cannot shrink the app', () => {
  const HTML = readFileSync(root('index.html'), 'utf8');
  const tag = HTML.match(/<meta name="viewport" content="([^"]+)"/);
  assert.ok(tag, 'there must be a viewport tag at all');
  const content = tag[1];
  assert.ok(!/user-scalable\s*=\s*no/.test(content), 'user-scalable=no is honoured in standalone and blocks zoom');
  assert.ok(!/maximum-scale/.test(content), 'maximum-scale caps zoom, which is the same failure by another name');
  assert.match(content, /minimum-scale=1\.0/, 'without it a pinch shrinks the app into the corner — his report, and a different decision');
  assert.match(content, /viewport-fit=cover/, 'without it every env(safe-area-inset-*) is 0px');
  // the reason the lock is safe to remove: iOS zooms a focused input only
  // when its text is under 16px, and it never is.
  const CSS = readFileSync(root('src/index.css'), 'utf8');
  assert.match(CSS, /input, textarea, select \{ font-size: 16px !important; \}/,
    'removing the scale lock is only safe while every input is 16px');
});
