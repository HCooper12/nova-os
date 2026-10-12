// A FINISHED CODE RUN OUTLIVES THE PROCESS THAT RAN IT (13 Oct 2026).
//
// The Builder and the Breaker keep their jobs in memory (claudeCode.js), so a
// server restart forgets every answer, finished or not. On 12 Oct his request
// for a pre-workout slot was done at 22:4x, and his phone, which iOS had
// closed in the background, came back to a card that said "working" all
// night. The phone half of that is fixed in App.jsx (it remembers the job
// id); this is the server half: once a code job settles, its answer is
// written here, and GET /claude-code/message/:id reads it back when the
// in-memory job is gone. Kept a week, then swept.

import { mkdir, readFile, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirOf = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'code-jobs');
const KEEP_MS = 7 * 24 * 3600_000;
const ID_RE = /^[0-9a-f]{8}$/;

export async function saveCodeJob(job) {
  if (!job || !ID_RE.test(job.id || '')) return;
  const dir = dirOf();
  await mkdir(dir, { recursive: true });
  const body = { id: job.id, status: job.status, result: job.result ?? null, error: job.error ?? null, savedAt: Date.now() };
  await writeFile(path.join(dir, `${job.id}.json`), JSON.stringify(body));
}

export async function loadCodeJob(id) {
  if (!ID_RE.test(id || '')) return null;
  try { return JSON.parse(await readFile(path.join(dirOf(), `${id}.json`), 'utf8')); } catch { return null; }
}

export async function sweepCodeJobs(now = Date.now()) {
  let names = [];
  try { names = await readdir(dirOf()); } catch { return 0; }
  let gone = 0;
  for (const n of names) {
    const f = path.join(dirOf(), n);
    try {
      if (now - (await stat(f)).mtimeMs > KEEP_MS) { await unlink(f); gone += 1; }
    } catch { /* raced with another sweep */ }
  }
  return gone;
}

// Watches the jobs a router started and writes each one down the moment it
// settles. Polling the in-memory job is deliberate: claudeCode.js settles a
// job in several places (warm pool, cold spawn, errors, the account limit),
// and one watcher here cannot miss any of them.
const SETTLED = new Set(['ready', 'error']);
export function watchCodeJobs({ getJob, everyMs = 2000 } = {}) {
  const pending = new Set();
  const tick = async () => {
    for (const id of [...pending]) {
      const job = getJob(id);
      if (!job) { pending.delete(id); continue; }
      if (SETTLED.has(job.status)) {
        pending.delete(id);
        try { await saveCodeJob(job); } catch { /* disk full: the in-memory answer still serves */ }
      }
    }
  };
  const timer = setInterval(tick, everyMs);
  timer.unref?.();
  sweepCodeJobs().catch(() => {});
  return { add: (id) => pending.add(id), tick, stop: () => clearInterval(timer), pending };
}
