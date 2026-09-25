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
import { readFile, readdir } from 'node:fs/promises';
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

// THE LIST WAS THE HOLE (25 Sep 2026). exerciseResearch.js arrived two days
// after the pass, spawned the model with a $2 dollar cap and a 12-minute kill,
// and passed this file untouched because it was not on the list above. So the
// guard now also covers every lib file that spawns the claude CLI, found by
// reading the source, the same way modelPrefs.test.js finds spawn sites.
async function spawnFiles() {
  const out = [];
  for (const name of await readdir(libDir)) {
    if (!name.endsWith('.js')) continue;
    const text = await readFile(path.join(libDir, name), 'utf8');
    if (text.includes('spawn(CLAUDE_BIN')) out.push(name);
  }
  return out;
}
async function guardedFiles() {
  return [...new Set([...GUARDED_FILES, ...(await spawnFiles())])];
}

// Kill timers these files may keep, and why. Each kills something that is not
// a working claude job: the weekly alias probe is a one-word informational
// call (a hung CLI must not hold the daily tick), and the other three time out
// their yt-dlp / ffmpeg / whisper helpers (the header's "external tools").
const KILL_TIMER_ALLOWED = new Set(['modelWatch.js', 'studyLane.js', 'repertoireLane.js', 'watcher.js']);

test('the dollar-budget flag does not come back into any lane that spawns the model', async () => {
  const offenders = [];
  for (const name of await guardedFiles()) {
    const text = await readFile(path.join(libDir, name), 'utf8');
    if (text.includes(BUDGET_FLAG)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `${BUDGET_FLAG} reappeared in: ${offenders.join(', ')}. His standing instruction (23 Sep 2026): `
    + '"There should be no caps for any jobs... remove all possible working session caps for anything '
    + 'in the project." A dollar ceiling on a spawned claude process is exactly what that instruction '
    + 'removed — it does not come back, not even a small one.');
});

test('the wall-clock watchdog does not come back into any lane that spawns the model', async () => {
  const offenders = [];
  for (const name of await guardedFiles()) {
    const text = await readFile(path.join(libDir, name), 'utf8');
    if (text.includes(WATCHDOG_CALL)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `${WATCHDOG_CALL.slice(0, -1)} reappeared in: ${offenders.join(', ')}. His standing instruction (23 Sep `
    + '2026) covers "any wall-clock that kills a running job" along with the dollar cap — lib/settle.js, the '
    + 'module that implemented it, was deleted in the same pass and must not be reintroduced or reimplemented '
    + 'locally.');
});

// settle.js is gone, so a new wall clock would be a hand-rolled one: a
// setTimeout that kills the spawned child. exerciseResearch.js had exactly
// that (12 minutes) and neither text check above could see it.
test('no lane that spawns the model hand-rolls a kill timer on it', async () => {
  const offenders = [];
  for (const name of await spawnFiles()) {
    if (KILL_TIMER_ALLOWED.has(name)) continue;
    const text = await readFile(path.join(libDir, name), 'utf8');
    if (/setTimeout\([^;]*?\.kill\(/s.test(text.replace(/\/\/.*$/gm, ''))) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `a setTimeout that kills a spawned process reappeared in: ${offenders.join(', ')}. His standing `
    + 'instruction (23 Sep 2026) removed every wall-clock kill on a working job. If the timer kills an '
    + 'external tool rather than the claude CLI, add the file to KILL_TIMER_ALLOWED with the reason.');
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
