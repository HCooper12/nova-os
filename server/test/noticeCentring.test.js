// Notifications must centre by auto margins, never by shifting themselves.
//
// His report: the greeting banner rendered as a tall narrow column of words
// instead of a wide bar. The cause is a CSS rule that is easy to re-introduce
// because the broken version LOOKS correct in the source: a fixed-position
// element given a left offset can only size itself against the space between
// that offset and the edge, so one placed halfway across gets half the screen
// as its ceiling. A max-width of 92vw was therefore unreachable — measured at
// 375px wide, the banner came out 188px against an intended 345px, and prose
// stacked vertically to fit.
//
// Auto margins hand the element the whole viewport to size against, and leave
// the transform property free — which matters because the fadeUp animation
// animates transform and would otherwise un-centre these mid-animation.
//
// Scanned on CODE LINES ONLY: the offending pattern is named in the comments
// above and in the components' own explanatory comments, and a scan that read
// those would fail against a correct tree forever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Every fixed-position surface that carries PROSE and so can wrap. The mobile
// dock is deliberately absent: its items are flex:none, so it overflows its
// available width rather than wrapping, and it centres correctly as a result.
const NOTICES = [
  'src/Toast.jsx',
  'src/NudgeCard.jsx',
  'src/ModelChoicePrompt.jsx',
];

const codeLines = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')
  .split('\n')
  .filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

for (const rel of NOTICES) {
  test(`${rel} centres by auto margins, not by shifting itself`, () => {
    const code = codeLines(rel);
    assert.ok(!/translateX\(\s*-50%\s*\)/.test(code),
      `${rel} centres a fixed notification by shifting it, which caps its width at half the screen`);
    assert.ok(/margin-inline:\s*auto|marginInline/.test(code),
      `${rel} should centre with auto margins`);
  });
}

test('the two banners in App.jsx centre by auto margins too', () => {
  const code = codeLines('src/App.jsx');
  // both live in the same render block; neither may shift itself
  const shifted = (code.match(/translateX\(\s*-50%\s*\)/g) || []).length;
  assert.equal(shifted, 0, 'a fixed banner in App.jsx is centred by shifting it');
  assert.ok(/marginInline: 'auto'/.test(code), 'the banners should centre with auto margins');
});

test('a centred notification that caps its width must also set one', () => {
  // The trap in one line: max-width alone does nothing for an element whose
  // available width is already smaller than the cap. Each notice states the
  // width it wants.
  for (const rel of [...NOTICES, 'src/App.jsx']) {
    const code = codeLines(rel);
    if (!/marginInline|margin-inline/.test(code)) continue;
    assert.ok(/width:\s*'?fit-content|width:min\(|width: 'min\(/.test(code),
      `${rel} centres with auto margins but never says how wide to be`);
  }
});
