// THE HANDS — Nova reaching outside itself, starting with the Mac.
//
// His brief (6 Sep 2026): "enhance Nova to be able to reach third party apps
// and use websites … to do anything I need it to." The first hand is the
// cheapest and the most honest: his own Shortcuts. Every Shortcut on this
// Mac is code HE wrote — Messages, HomeKit, Music, Maps, the health pushes —
// and `shortcuts run` executes it deterministically, no model in the loop.
// "Turn on my bedroom lights" is a Shortcut he already has; it just could
// not be spoken to Nova.
//
// Doctrine: a Shortcut is his code, so running it is "code acts". What Nova
// must never do is guess WHICH one: names resolve with the same strict
// matcher as every other verb. A Shortcut has no undo Nova can perform —
// the receipt says so — which is why every Shortcut is confirm-first until
// he lists it as immediate in server/data/hands.json ({"immediate":[…]}).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
// tests swap the runner so the real Shortcuts app is never touched
let runner = exec;
export function _setRunnerForTests(fn) { runner = fn || exec; cache = { at: 0, names: [] }; }
const LIST_TTL_MS = 60_000;
const RUN_TIMEOUT_MS = 90_000;
const BIN = '/usr/bin/shortcuts';
let cache = { at: 0, names: [] };

function dataDir() {
  return process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
}

// Which Shortcuts may run WITHOUT his yes. Nothing by default; he adds names
// as trust is earned — the autonomy doctrine, applied to his own code.
export function immediateShortcuts() {
  try {
    const f = path.join(dataDir(), 'hands.json');
    const c = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
    return Array.isArray(c.immediate) ? c.immediate.map(String) : [];
  } catch { return []; }
}

export function shortcutsAvailable() {
  return process.platform === 'darwin' && existsSync(BIN);
}

// The names on this Mac, cached a minute. Sync callers (the model's
// catalogue is built inside a template literal) read the last list via
// knownShortcuts(); the first async call fills it. `runner` is injectable
// so tests never touch the real Shortcuts app.
export async function listShortcuts({ force = false } = {}) {
  if (!shortcutsAvailable() && runner === exec) return [];
  if (!force && Date.now() - cache.at < LIST_TTL_MS && cache.names.length) return cache.names;
  const { stdout } = await runner(BIN, ['list'], { timeout: 15_000 });
  cache = { at: Date.now(), names: String(stdout).split('\n').map((s) => s.trim()).filter(Boolean) };
  return cache.names;
}
export function knownShortcuts() { return cache.names; }

// Run one by its exact name (already resolved). Text input travels as a
// file, never through a shell. Output, if the Shortcut produces any, comes
// back as text (clipped) so Nova can say what happened.
export async function runShortcut(name, { input = null } = {}) {
  if (!shortcutsAvailable() && runner === exec) throw new Error('Shortcuts are only available on the Mac');
  const names = await listShortcuts();
  if (!names.includes(name)) throw new Error(`there's no Shortcut called "${name}"`);
  const dir = await mkdtemp(path.join(tmpdir(), 'nova-hands-'));
  const outPath = path.join(dir, 'out.txt');
  const args = ['run', name, '--output-path', outPath];
  if (input != null && String(input).trim()) {
    const inPath = path.join(dir, 'in.txt');
    await writeFile(inPath, String(input), 'utf8');
    args.push('--input-path', inPath);
  }
  const started = Date.now();
  try {
    const { stderr } = await runner(BIN, args, { timeout: RUN_TIMEOUT_MS, maxBuffer: 2_000_000 });
    let output = '';
    try { output = (await readFile(outPath, 'utf8')).trim().slice(0, 600); } catch { /* no output is normal */ }
    return { name, ms: Date.now() - started, output, stderr: String(stderr || '').trim().slice(0, 300) };
  } catch (e) {
    const msg = String(e.stderr || e.message || '').trim().split('\n')[0].slice(0, 200);
    throw new Error(`"${name}" didn't finish: ${msg || 'no reason given'}`);
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
