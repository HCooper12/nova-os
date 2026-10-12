// The phone half of the 12 Oct "working all night" fault: a Builder or
// Breaker run is remembered by job id and picked up again at launch, and a
// chat restored with a "working" line and no run behind it says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = await readFile(path.join(root, 'src', 'App.jsx'), 'utf8');
const body = (name) => { const at = app.indexOf(`\n  ${name}(`); assert.ok(at > 0, name); return app.slice(at, app.indexOf('\n  }\n', at)); };

test('sending remembers the run before polling it', () => {
  assert.match(body('doCode'), /rememberCodeRun\('code'/);
  assert.match(body('startSpar'), /rememberCodeRun\('spar'/);
});

test('launch resumes remembered runs', () => {
  assert.match(app, /if \(getConnection\(\)\) this\.resumeCodeRuns\(\);/);
  const resume = body('resumeCodeRuns');
  assert.match(resume, /this\.pollCodeRun\(runs\.code\.jobId/);
  assert.match(resume, /this\.pollSparRun\(runs\.spar\.jobId/);
});

test('a restored "working" line with no run behind it is replaced by the truth', () => {
  assert.match(body('resumeCodeRuns'), /some\(\(m\) => m\.streaming\)[\s\S]*CODE_RUN_LOST/);
});

test('every way a run ends forgets it', () => {
  for (const fn of ['pollCodeRun', 'pollSparRun']) {
    const b = body(fn);
    for (const h of ['onReady', 'onLost', 'onError']) {
      const at = b.indexOf(`${h}:`);
      assert.ok(at > 0, `${fn} has no ${h}`);
      assert.match(b.slice(at, at + 160), /forgetCodeRun\(/, `${fn}.${h} never forgets the run`);
    }
  }
});
