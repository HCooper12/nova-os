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
//   A SHELL, BEHIND A WALL. It has Bash — he asked for it on 16 Sep, and
//   without it what he came back to was source he still had to install
//   himself. The shell is not bounded by an allow-list, because a list of
//   permitted commands is a promise the model can keep or not (`Bash(rm:*)`
//   denied still leaves `sh -c`, `find -delete`, `node -e`). It is bounded by
//   the macOS kernel: sandbox.js denies every write outside the project
//   directory, so escaping is impossible rather than forbidden — including for
//   whatever an npm postinstall script decides to do. Where that wall does not
//   exist, neither does the shell: the build runs without one and the receipt
//   says so, because a shell with no wall is not a fallback.
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
import { modelFor } from './modelPrefs.js';
import { createProjectDir, undoProject } from './projects.js';
import { createRecord } from './inboxStore.js';
import { sandboxed, sandboxAvailable, sandboxUnavailable } from './sandbox.js';

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local/bin/claude');

const jobs = new Map();
export function getBuildJob(id) { return jobs.get(id) || null; }

// What the builder is told. Deliberately short: the brief is his, the rules are
// about the boundary, and nothing here describes HOW to build — that is the
// model's job and the reason this lane exists.
export function buildPrompt(brief, slug, { shell = false } = {}) {
  return `You are building something for Hayden, on his own machine, unattended.

WHAT HE ASKED FOR:
${brief}

WHERE YOU ARE:
Your working directory is an empty project folder called "${slug}". Everything you
make goes in here. You cannot write anywhere else and must not try.

HOW TO WORK:
${shell ? `- You have Read, Write, Edit, Glob, Grep and a shell. Use the shell: install
  what you need, run the build, run the tests, and FIX WHAT THEY TELL YOU.
  Handing him something that has never been run is the thing to avoid.
- Your shell can only write inside this folder. That is enforced by the
  operating system, not by you, so a command that touches anything outside will
  simply fail — that is expected, not a problem to work around. Do not try.
- Leave it in a state he can use: dependencies installed, build passing, and
  say in the README what command runs it.` : `- You have Read, Write, Edit, Glob and Grep, and NO shell on this machine:
  you cannot run installs, builds, servers or tests. Write source he can run.
- Because you cannot run it, it has to be right on paper. Prefer a stack that
  works from source without a build step where the brief allows it, and when it
  does not, write the package.json and config a normal install would need.`}
- Finish with a README.md that says what you made, how to run it, and — plainly
  — anything you could not do or had to assume. He would rather read one honest
  line about a gap than find it himself.
- He is not watching. There is nobody to ask, so make the sensible call and
  write down that you made it.`;
}

// HOW THE BUILD IS ACTUALLY INVOKED — pure, so the shell decision can be
// tested without spawning anything.
//
// THE SHELL IS CONDITIONAL ON THE WALL, never the other way round. If the
// kernel cannot contain it, the build runs WITHOUT a shell and the receipt says
// so. The tempting failure here is to fall back to an unsandboxed shell
// because the shell is what he asked for — that would hand a long-running
// unattended agent free rein over his Mac at exactly the moment the safety
// mechanism reported itself missing.
// `shell` is injectable for ONE reason: the no-shell branch cannot run on this
// Mac, where sandbox-exec is always present, so a green local suite never
// touched it and CI was the only thing that could. It was wrong from the moment
// it was written (17 Sep) and went red for three deploys before anyone saw it.
// A path gated on what the machine happens to have needs to be exercised both
// ways, by hand, or it is not covered at all.
export function buildInvocation(brief, slug, dir, model, { shell: force } = {}) {
  const shell = force === undefined ? sandboxAvailable() : force;
  const argv = [
    '-p', buildPrompt(brief, slug, { shell }),
    '--permission-mode', 'bypassPermissions',
    ...boundaryArgs(shell ? 'Read,Write,Edit,Glob,Grep,Bash' : 'Read,Write,Edit,Glob,Grep'),
    '--output-format', 'json',
    '--model', model || modelFor('build'),
    '--no-session-persistence',
  ];
  return shell
    ? { shell, ...sandboxed(CLAUDE_BIN, argv, dir) }
    : { shell, cmd: CLAUDE_BIN, args: argv };
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

  const run = buildInvocation(text, slug, dir, model);
  job.shell = run.shell;
  if (!run.shell) job.note = `built without a shell — ${sandboxUnavailable()}`;
  const child = spawn(run.cmd, run.args, { cwd: dir, ...(run.env ? { env: run.env } : {}) });

  let stdout = '';
  let stderr = '';
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
        ...(job.note ? { note: job.note } : {}),
        decision: {
          route: 'note',
          confidence: 'high',
          title: slug,
          reason: (job.status === 'done' ? summary : job.error || '').slice(0, 300),
          payload: { slug, dir, shell, brief: text.slice(0, 2000) },
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
