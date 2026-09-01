import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { backupFile } from './backup.js';

// THE STAGED PASS — one shape for every write that lands a computed set of
// whole files on the vault.
//
// A model (or a planner) works in a sandbox — a staged copy of the vault, or
// plain memory — and produces CHANGES: { path, kind: 'new' | 'updated',
// content }. From there only this code touches the vault, in steps every
// consumer shares (the Distiller, the deep-weave ingest, Coach's plan changes):
//
//   1. stampPriors  — each change carries the exact live bytes it was computed
//                     against (null for a file that did not exist).
//   2. checkDrift   — before ANY write, every target is compared to its prior;
//                     one moved file refuses the whole apply, naming the file.
//                     Newer edits are never clobbered.
//   3. applyChanges — snapshot-first writes, all of them; a failure mid-way
//                     rolls the files already written back to their priors,
//                     so the vault is never left half-applied.
//   4. undoChanges  — every prior back verbatim, created files removed,
//                     snapshot-first so even the undo is in the time machine.
//
// The receipt rides the inbox rails (kind / status / undoData); the consumer
// files it. A distill or ingest job keeps its changes (with priors) on disk
// and the record points at the job by id; Coach carries them on the record.
//
// `write(vaultPath, relPath, content)` — optional, apply and undo. Files owned
// by a vaultStateFile module (the workout routines, the exercise library) MUST
// be written through that module or its process cache goes stale — see
// vaultStateFile.js. Coach passes a writer that routes by path; distill and
// ingest write raw, as they always have.
//
// Priors are what is on disk at compute time. Right after this process has
// written a file, iCloud can briefly serve the pre-write bytes (the quirk
// vaultStateFile.js exists for); a prior read inside that window would be
// stale. Every writer on the platform accepts that window; it is seconds.

export function stampPriors(vaultPath, changes) {
  return changes.map((c) => {
    if (c.kind !== 'updated') return { ...c, prior: null };
    const live = path.join(vaultPath, c.path);
    let prior = null;
    if (existsSync(live)) {
      try { prior = readFileSync(live, 'utf8'); } catch { prior = null; }
    }
    return { ...c, prior };
  });
}

// Every file, before any write. `what` names the draft in the refusal
// ("this draft", "this weave"); `remedy` says what to do about it.
export async function checkDrift(vaultPath, changes, { what = 'this draft', remedy = 'discard it and rerun' } = {}) {
  for (const c of changes) {
    const live = path.join(vaultPath, c.path);
    if (c.kind === 'updated') {
      if (c.prior === undefined) throw new Error(`${c.path} was never stamped with its prior — stamp the changes before applying them`);
      const current = existsSync(live) ? await readFile(live, 'utf8') : null;
      if (current !== c.prior) throw new Error(`the vault moved under ${what} (${c.path} changed since the diff) — ${remedy}`);
    } else if (c.kind === 'new' && existsSync(live)) {
      throw new Error(`the vault moved under ${what} (${c.path} now exists) — ${remedy}`);
    }
  }
}

async function writeRaw(vaultPath, relPath, content) {
  const full = path.join(vaultPath, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await backupFile(full);
  await writeFile(full, content, 'utf8');
}

// One file back to its prior: a created file is removed, an updated one gets
// its prior bytes. Used by the mid-apply rollback and by undo.
async function restoreOne(vaultPath, c, write) {
  const full = path.join(vaultPath, c.path);
  if (c.kind === 'new') {
    if (existsSync(full)) {
      await backupFile(full);
      await unlink(full);
    }
    return;
  }
  if (c.prior != null) await write(vaultPath, c.path, c.prior);
}

export async function applyChanges(vaultPath, changes, { what, remedy, write = writeRaw } = {}) {
  await checkDrift(vaultPath, changes, { what, remedy });
  const written = [];
  for (const c of changes) {
    try {
      await write(vaultPath, c.path, c.content);
    } catch (e) {
      // roll back what landed, newest first, and say exactly what happened
      const stuck = [];
      for (const w of [...written].reverse()) {
        try { await restoreOne(vaultPath, w, write); } catch (re) { stuck.push(`${w.path} (${re.message})`); }
      }
      if (stuck.length) {
        throw new Error(`writing ${c.path} failed (${e.message}), and rolling back left ${stuck.length} file${stuck.length === 1 ? '' : 's'} changed: ${stuck.join(', ')} — restore ${stuck.length === 1 ? 'it' : 'them'} from Guardian's time machine`);
      }
      const putBack = written.length
        ? `the ${written.length} file${written.length === 1 ? '' : 's'} already written ${written.length === 1 ? 'was' : 'were'} put back; `
        : '';
      throw new Error(`writing ${c.path} failed (${e.message}) — ${putBack}the vault is as it was`);
    }
    written.push(c);
  }
  return { applied: changes.length };
}

export async function undoChanges(vaultPath, changes, { write = writeRaw } = {}) {
  for (const c of changes) await restoreOne(vaultPath, c, write);
  return { restored: changes.length };
}
