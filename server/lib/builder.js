// THE BUILDER — the one lane that writes code, and the only one that writes
// outside the vault.
//
// His ask, 16 Sep, from the Claude advertisement: dictate "build me a
// pixel-perfect website from that mockup", walk into the gym, come back to it
// finished. Every other agent Nova has produces PAGES; none of them produces a
// project. This one does, inside the directory he nominated (projects.js) and
// nowhere else.
//
// THREE DELIBERATE LIMITS, each of which he can lift when he wants to and not
// before:
//
//   NO BASH. The allowed tools are Read, Write, Edit, Glob and Grep — the
//   builder writes files, it does not run them. A React project it scaffolds is
//   real source he can `npm install` himself. Giving a long-running unattended
//   agent a shell is a different decision from giving it a folder, and it is
//   his to make separately.
//
//   ITS OWN DIRECTORY, NOT HIS DESKTOP. cwd is the project folder, so the
//   model's own idea of "here" is already the boundary; projects.js enforces
//   the rest.
//
//   IT READS THE VAULT ONLY THROUGH WHAT IT IS HANDED. The brief carries the
//   material. The builder has no path into his notes, which keeps a code lane
//   from becoming a second, unaudited way to read everything he owns.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { boundaryArgs } from './spawnBoundary.js';
import { settleWatchdog } from './settle.js';
import { modelFor } from './modelPrefs.js';
import { createProjectDir, undoProject } from './projects.js';
import { createRecord } from './inboxStore.js';

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');
// A build is one long job, like a weave. The ceiling is a cap, not an estimate.
export const BUILD_BUDGET_USD = 5;

const jobs = new Map();
export function getBuildJob(id) { return jobs.get(id) || null; }

// What the builder is told. Deliberately short: the brief is his, the rules are
// about the boundary, and nothing here describes HOW to build — that is the
// model's job and the reason this lane exists.
export function buildPrompt(brief, slug) {
  return `You are building something for Hayden, on his own machine, unattended.

WHAT HE ASKED FOR:
${brief}

WHERE YOU ARE:
Your working directory is an empty project folder called "${slug}". Everything you
make goes in here. You cannot write anywhere else and must not try.

HOW TO WORK:
- You have Read, Write, Edit, Glob and Grep. You have NO shell: you cannot run
  installs, builds, servers or tests. Write source he can run himself.
- Because you cannot run it, it has to be right on paper. Prefer a stack that
  works from source without a build step where the brief allows it, and when it
  does not, write the package.json and config a normal install would need.
- Finish with a README.md that says what you made, how to run it, and — plainly
  — anything you could not do or had to assume. He would rather read one honest
  line about a gap than find it himself.
- He is not watching. There is nobody to ask, so make the sensible call and
  write down that you made it.`;
}

// Start a build. Returns a job id immediately — this runs for minutes, which
// is the entire point of the lane.
export function startBuild(brief, { name, model } = {}) {
  const text = String(brief || '').trim();
  if (!text) throw new Error('a build needs a brief');
  const { dir, existed, slug } = createProjectDir(name || text.slice(0, 50));
  if (existed) throw new Error(`there is already a project called "${slug}" — give this one another name`);

  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'running', slug, dir, result: null, error: null };
  jobs.set(jobId, job);

  const child = spawn(CLAUDE_BIN, [
    '-p', buildPrompt(text, slug),
    '--permission-mode', 'bypassPermissions',
    // no Bash: it writes source, it does not run it
    ...boundaryArgs('Read,Write,Edit,Glob,Grep'),
    '--output-format', 'json',
    '--model', model || modelFor('build'),
    '--max-budget-usd', String(BUILD_BUDGET_USD),
    '--no-session-persistence',
  ], { cwd: dir });

  let stdout = '';
  let stderr = '';
  settleWatchdog(child, { label: 'the build', minutes: 30 });
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('error', (err) => { job.status = 'error'; job.error = err.message; });
  child.on('close', async (code) => {
    let summary = '';
    try {
      const parsed = JSON.parse(stdout);
      summary = String(parsed.result || '').trim();
      if (parsed.is_error) { job.status = 'error'; job.error = summary || 'the build failed'; }
    } catch {
      summary = stdout.trim();
    }
    if (job.status !== 'error' && code !== 0) {
      job.status = 'error';
      job.error = stderr.trim() || `the builder exited with code ${code}`;
    }
    if (job.status !== 'error') {
      job.status = 'done';
      job.result = { summary, dir, slug };
    }
    // A build always leaves a receipt, finished or not — he walked away, and
    // "it failed and here is why" is the thing he most needs to come back to.
    try {
      await createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'build',
        text: job.status === 'done' ? `Built "${slug}"` : `The build of "${slug}" failed`,
        source: 'nova',
        mode: 'auto',
        status: job.status === 'done' ? 'filed' : 'error',
        createdAt: new Date().toISOString(),
        destination: dir,
        ...(job.error ? { error: job.error } : {}),
        decision: {
          route: 'note',
          confidence: 'high',
          title: slug,
          reason: (job.status === 'done' ? summary : job.error || '').slice(0, 300),
          payload: { slug, dir, brief: text.slice(0, 2000) },
        },
        // moved aside, never deleted — see projects.undoProject
        undoData: { route: 'build', slug },
      });
    } catch { /* the work is on disk either way; a receipt that fails must not lose it */ }
  });

  return jobId;
}

export async function undoBuild(slug) {
  const { moved, reason } = undoProject(slug);
  return moved
    ? `moved the "${slug}" project out of the way — it is in .undone, not deleted`
    : reason || 'that project is already gone';
}
