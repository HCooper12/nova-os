import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

// A SHARED FILE READ MID-WRITE — 18 Oct 2026 ledger: "Unexpected end of JSON
// input" 12 times across the operational JSON files (health data, the job
// stores, push subscriptions, workouts...). The writers rename a tmp file
// into place, but a reader that opens the file in the few milliseconds
// between the write starting and the rename landing can still catch it
// half-written on some filesystems, or catch a SIBLING write that is not
// itself atomic yet. A truncated JSON file is not corruption — it is a
// photograph taken mid-write — so the honest fix is to look again a moment
// later, not to treat the first bad read as the final answer.
//
// Only a PARSE failure is retried. ENOENT (the file genuinely doesn't exist
// yet) is thrown immediately so the caller's own fallback ("no data yet")
// runs without three pointless waits.
export async function readJsonRetry(path, { tries = 3, waitMs = 40 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      lastErr = e;
      if (e.code === 'ENOENT') throw e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

// Same contract, for the handful of call sites that are not (or cannot
// easily be made) async — `diffTreesReport` and the job-listing sweeps,
// which run `readFileSync` today. The blocking wait is a SharedArrayBuffer
// + Atomics.wait, not a CPU-spinning loop.
export function readJsonRetrySync(path, { tries = 3, waitMs = 40 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const raw = readFileSync(path, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      lastErr = e;
      if (e.code === 'ENOENT') throw e;
      if (i < tries - 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
  throw lastErr;
}
