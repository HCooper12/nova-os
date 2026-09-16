// NOTHING IN NOVA LEFT THE WAY IT ARRIVED.
//
// The audit finding, 16 Sep 2026: SIX entrance keyframes (fadeUp, sheetUp,
// popIn, nvRise, deckRise, shelfIn) and ZERO exits. Every overlay rose into
// place and then hard-cut out. `--nv-ease-exit` was defined in the motion
// tokens, carried a comment saying "anything LEAVING accelerates away", and
// had **not one call site in the whole app** — an idea written down and never
// taken up, which is the exact shape of thing a test cannot normally see.
//
// Apple's rule: "If something disappears one way, we expect it to emerge from
// where it came." A panel that rises in and cuts out leaves the eye with no
// path back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const CSS = readFileSync(root('src/index.css'), 'utf8');
const HOOK_RAW = readFileSync(root('src/useExit.js'), 'utf8');
// Comments stripped before scanning the hook: its header NAMES the mechanism
// it deliberately avoids, and a test that reads prose as code fails on its own
// documentation. Third time this session, so it is a habit now, not a slip.
const HOOK = HOOK_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// each @keyframes in this file is one line — take the line, not a brace match
const kf = (name) => (CSS.split('\n').find((l) => l.startsWith(`@keyframes ${name} `)) || '');
const ADOPTERS = ['src/OutboxView.jsx', 'src/CalendarView.jsx', 'src/IngestModal.jsx', 'src/AddRecipeModal.jsx'];

test('THE DEAD TOKEN now has a call site', () => {
  assert.match(CSS, /--nv-ease-exit:/, 'the token still exists');
  assert.match(HOOK, /var\(--nv-ease-exit\)/, 'and something finally uses it');
});

test('the exit is the entrance read backwards, not a different move', () => {
  const up = kf('fadeUp'), down = kf('nvFall');
  assert.ok(up && down, 'both keyframes must exist');
  // fadeUp: opacity 0 -> 1, translateY(--nv-rise) -> 0.  nvFall is its mirror.
  assert.match(down, /from \{ opacity: 1; transform: none; \}/);
  assert.match(down, /to \{ opacity: 0; transform: translateY\(var\(--nv-rise\)\); \}/);
  assert.ok(up.includes('var(--nv-rise)') && down.includes('var(--nv-rise)'),
    'both must travel the same distance, or the return path is not the arrival path');
  assert.match(CSS, /@keyframes nvFadeOut/, 'the scrim has to release its dim too');
});

test('a second tap during the exit cannot fire onClose twice', () => {
  // some callers TOGGLE rather than set, so two calls reopen the overlay
  assert.match(HOOK, /if \(closing\.current\) return;/);
});

test('reduced motion closes immediately — a delay nobody sees is still felt', () => {
  assert.match(HOOK, /if \(reducedMotion\(\)\) \{ onClose\?\.\(\); return; \}/);
});

test('it lands on a timer, never on animationend', () => {
  // an interrupted or removed animation never fires animationend, and the
  // overlay would be stuck open with no way back
  assert.match(HOOK, /setTimeout\(/);
  assert.ok(!/animationend/.test(HOOK), 'animationend can silently never arrive');
});

test('a missing ref degrades to closing, not to being stuck open', () => {
  assert.match(HOOK, /if \(!panel && !scrim\) \{ onClose\?\.\(\); return; \}/);
});

test('the overlays that adopted it route EVERY close path through the exit', () => {
  for (const f of ADOPTERS) {
    const src = readFileSync(root(f), 'utf8');
    assert.match(src, /useExit\(/, `${f} does not use the hook`);
    assert.match(src, /ref=\{exit\.scrimRef\}/, `${f} has no scrim ref — the dim would cut`);
    assert.match(src, /ref=\{exit\.panelRef\}/, `${f} has no panel ref — the panel would cut`);
    assert.ok(src.includes('exit.close'), `${f} still closes directly somewhere`);
    // the raw closer must not survive anywhere as an onClick, or that path cuts
    const raw = src.match(/onClick=\{(v\.close\w*|v\.closeIngestModal|v\.closeAddRecipe)\}/);
    assert.equal(raw, null, `${f} still has a direct close path: ${raw && raw[0]}`);
  }
});

test('it changes no parent — the unmount stays where it was', () => {
  const app = readFileSync(root('src/App.jsx'), 'utf8');
  assert.ok(!app.includes('useExit'), 'the hook exists so App.jsx needs no edit; another session owns that file today');
});
