// THE CODE SCREEN NEVER SHOWS A STALE MODEL VERSION (10 Oct 2026: it read
// "Fable 5" after Fable 5.1 shipped). Live labels come from modelWatch (the
// CLI's own answer); the pre-sync fallback names the family, never a version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the fallback model list carries no hand-typed version numbers', async () => {
  const src = await readFile(path.join(ROOT, 'src', 'vals', 'valsMisc.js'), 'utf8');
  const block = src.slice(src.indexOf('codeModelOptions:'), src.indexOf('codeSessionActive:'));
  assert.doesNotMatch(block, /label: '(?:Sonnet|Opus|Fable|Haiku) \d/, 'a hand-typed version in the fallback');
  assert.match(block, /st\.liveModelPrefs\?\.models/);
});
