// Source-shape guard: a one-shot `claude -p` spawn that leaves stdin as an open
// pipe makes the CLI wait 3 s for input before it starts (measured 18 Oct 2026:
// 4,186 ms vs 1,483 ms to first event). Every spawn of the CLI (or a `bin`
// runner) must close stdin, or state 'pipe' on purpose (a persistent stream-json
// worker such as claudeCode.js:125, which writes its turns to stdin).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const WINDOW = 40;

test('every spawn(CLAUDE_BIN / bin) closes stdin or writes to it', () => {
  const offenders = [];
  let seen = 0;
  for (const f of fs.readdirSync(LIB).filter((n) => n.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(LIB, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/\bspawn\((CLAUDE_BIN|bin)\b/.test(line)) return;
      seen++;
      const win = lines.slice(i, i + WINDOW).join('\n');
      const ok = /stdio:\s*\[\s*'(ignore|pipe)'/.test(win) || /\.stdin\b/.test(win) || /--input-format/.test(win);
      if (!ok) offenders.push(`lib/${f}:${i + 1}`);
    });
  }
  assert.ok(seen > 20, `expected to find the spawn sites, found ${seen}`);
  assert.deepEqual(offenders, [], `spawns that leave stdin an open pipe: ${offenders.join(', ')}`);
});
