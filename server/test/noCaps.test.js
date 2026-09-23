// NO WORKING CAPS, ANYWHERE — a guard, not a policy.
//
// His standing instruction, 23 Sep 2026, verbatim: "There should be no caps
// for any jobs. If it's a large build it should take as much time as it
// needs. Working caps limit the overall outcome and output to make it worse
// without checking for additional revisions etc that should be standard. So
// remove all possible working session caps for anything in the project."
//
// That session stripped `--max-budget-usd` (a dollar ceiling on a spawned
// claude process) and every settleWatchdog(...) wall-clock kill out of the
// files listed below, and deleted lib/settle.js — the module whose only job
// was to be that wall clock. This test reads each of those files as plain
// text and fails the moment either pattern reappears in any of them, so a
// future "just add a small cap back" edit cannot land silently. It is not
// itself a cap: it does not bound how long a job runs, only whether the two
// removed mechanisms come back.
//
// Deliberately NOT flagged here (see the session's own report for the full
// reasoning): retry-count guards on repeated FAILURES of the same job
// (dailyReview.js REVIEW_MAX_ATTEMPTS, healthInsight.js MAX_TRIES_PER_DAY —
// these stop re-attempting a broken input, they do not truncate a job that
// is honestly working), prompt/context sizing (CONTEXT_BUDGET, maxChars,
// MAX_SEARCHES — these shape what goes INTO a prompt, they do not stop a
// model once it is generating), and read timeouts on quick informational
// commands or external tools (yt-dlp/ffmpeg fetches, link-reachability
// checks, the client's HTTP socket guard) that never spawn a claude process.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.join(__dirname, '..', 'lib');

// Every file the 23 Sep 2026 pass touched to remove a dollar cap and/or a
// wall-clock kill on a spawned claude process. Listed explicitly (not
// globbed) so a new lane file has to be added here on purpose, the same way
// it has to be added to server/index.js on purpose.
const GUARDED_FILES = [
  'briefing.js', 'browse.js', 'builder.js', 'calendarCommand.js', 'capabilities.js',
  'claudeCode.js', 'coachPlan.js', 'coachReflection.js', 'dailyReview.js', 'distill.js',
  'forge.js', 'formCheck.js', 'healthInsight.js', 'inbox.js', 'inboxStore.js', 'ingest.js',
  'journalPrompt.js', 'leader.js', 'librarian.js', 'noteSummaries.js', 'paperLane.js',
  'patternScout.js', 'planFollowUp.js', 'planToday.js', 'planner.js', 'pulse.js',
  'repertoireLane.js', 'researcher.js', 'scanFood.js', 'scanRecipe.js', 'scanStatement.js',
  'scout.js', 'shoppingList.js', 'studio.js', 'studyLane.js', 'tweakRecipe.js', 'watcher.js',
  'weeklyDebrief.js',
];

// Built from parts so this file's own header comment (which has to name the
// pattern in prose, above) can never accidentally satisfy its own check.
const BUDGET_FLAG = '--' + 'max-budget-usd';
const WATCHDOG_CALL = 'settleWatchdog' + '(';

test('the dollar-budget flag does not come back into any guarded lane file', async () => {
  const offenders = [];
  for (const name of GUARDED_FILES) {
    const text = await readFile(path.join(libDir, name), 'utf8');
    if (text.includes(BUDGET_FLAG)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `${BUDGET_FLAG} reappeared in: ${offenders.join(', ')}. His standing instruction (23 Sep 2026): `
    + '"There should be no caps for any jobs... remove all possible working session caps for anything '
    + 'in the project." A dollar ceiling on a spawned claude process is exactly what that instruction '
    + 'removed — it does not come back, not even a small one.');
});

test('the wall-clock watchdog does not come back into any guarded lane file', async () => {
  const offenders = [];
  for (const name of GUARDED_FILES) {
    const text = await readFile(path.join(libDir, name), 'utf8');
    if (text.includes(WATCHDOG_CALL)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `${WATCHDOG_CALL.slice(0, -1)} reappeared in: ${offenders.join(', ')}. His standing instruction (23 Sep `
    + '2026) covers "any wall-clock that kills a running job" along with the dollar cap — lib/settle.js, the '
    + 'module that implemented it, was deleted in the same pass and must not be reintroduced or reimplemented '
    + 'locally.');
});

// The module itself is gone, not just unused — a lane cannot import a
// watchdog that does not exist, which is a second, structural guard on top
// of the text checks above.
test('lib/settle.js stays deleted', async () => {
  await assert.rejects(
    () => readFile(path.join(libDir, 'settle.js'), 'utf8'),
    /ENOENT/,
    'lib/settle.js was deleted 23 Sep 2026 (its only job was the wall-clock kill this instruction removed) and should not be recreated',
  );
});
