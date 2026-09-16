// THE WALL AROUND A SHELL.
//
// His ask, 16 Sep: the Builder should have a shell. It was built without one
// deliberately — it could write a React project but not install it, so what he
// came back to was source he had to finish himself. That is a real gap and he
// has asked for it closed.
//
// The gap could be closed two ways, and only one of them is honest.
//
// THE WRONG WAY is to add Bash to the allow-list and tell the model where it
// may go. spawnBoundary.js exists because exactly that turned out to be
// decoration: --allowedTools is not enforced under bypassPermissions, and even
// where a deny-list IS enforced, `Bash` is one tool — denying `Bash(rm:*)`
// still leaves `sh -c 'rm ...'`, `find -delete`, `node -e`, and a hundred
// others. A shell allow-list is a promise the model can keep or not.
//
// THE RIGHT WAY is for the escape to be impossible rather than disallowed. On
// macOS that is the sandbox(7) seatbelt: the kernel refuses the write, so it
// does not matter what the model intends, what it was told, or what a package
// on npm does in its postinstall script. Verified 17 Sep against the real
// directories — a shell under this profile can write inside its own project
// and is refused by his Desktop, his home, his vault, a SIBLING project, the
// nova-os repo, and ~/Library/LaunchAgents (which is how a thing would make
// itself permanent). `npm install` still works, and so does anything the
// installed package tries, inside the same four walls.
//
// WHAT THIS DOES NOT DO, said plainly rather than implied:
//   - It does not stop reading. The profile denies writes, not reads: a shell
//     here can read what his user can read. Containment of a code builder is
//     about what it can CHANGE.
//   - It does not stop the network. `npm install` is the point of having a
//     shell, and that needs the registry. Anything fetched lands inside the
//     wall, but a shell with a network is a shell that can send as well as
//     fetch.
//   - It is macOS-only. Elsewhere there is no wall, so there is no shell —
//     see sandboxUnavailable below. A build without a shell still works; a
//     shell without a wall is not something to fall back to quietly.

import { existsSync, realpathSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SANDBOX_BIN = '/usr/bin/sandbox-exec';

export function sandboxAvailable() {
  return process.platform === 'darwin' && existsSync(SANDBOX_BIN);
}

// Seatbelt profiles are s-expressions and a path is a quoted string in one, so
// a directory whose name contained a quote or a backslash could end the string
// early and change the rule. projectSlug would never produce one, but this
// module must not depend on its caller's hygiene for its only job.
const q = (p) => `"${String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// Seatbelt matches REAL paths. On this Mac $TMPDIR is a symlink into
// /private/var/folders and ~/Nova Projects may itself sit behind one; a rule
// written against the un-resolved path silently matches nothing, which fails
// OPEN and would have been invisible.
const real = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };

// A build's temp directory, INSIDE the project. The first draft of this module
// allowed os.tmpdir() wholesale, which on macOS is the per-user /var/folders
// tree — so two builds, and anything else using temp, shared a writable space.
// Giving each build its own temp inside its own folder closes that, and has a
// second benefit: undoProject moves the temp files aside with everything else
// instead of leaving them behind.
export const TMP_SUBDIR = '.nova-tmp';
export const tmpFor = (projectDir) => path.join(projectDir, TMP_SUBDIR);

// Everything writable that is not the project itself. Deliberately two lines
// long: every entry is a hole, and a toolchain that needs a third should fail
// loudly here rather than quietly write somewhere nobody chose. Verified 17 Sep
// that `npm install` and node both work with nothing more than this.
export function writablePaths(projectDir) {
  return [
    real(projectDir),
    path.join(os.homedir(), '.npm'),   // npm's cache — without it every install is cold
  ];
}

export function profileFor(projectDir) {
  const allow = writablePaths(projectDir).map((p) => `    (subpath ${q(p)})`).join('\n');
  return `(version 1)
(allow default)
(deny file-write*)
(allow file-write*
${allow}
    (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr")
    (subpath "/dev/fd") (literal "/dev/dtracehelper") (literal "/dev/tty"))
`;
}

// Wrap a command so it runs behind the wall. Returns the same {cmd, args} shape
// the caller would have spawned, so a lane adopts this by wrapping one line.
// Throws rather than returning the bare command: a caller that asked for a
// sandbox and got none must not find that out from the filesystem.
export function sandboxed(cmd, args, projectDir) {
  if (!sandboxAvailable()) throw new Error(sandboxUnavailable());
  mkdirSync(tmpFor(projectDir), { recursive: true });
  return {
    cmd: SANDBOX_BIN,
    args: ['-p', profileFor(projectDir), cmd, ...args],
    // node and npm both honour TMPDIR, and pointing it inside the wall is what
    // lets the wall be this tight
    env: { ...process.env, TMPDIR: tmpFor(projectDir) },
  };
}

export function sandboxUnavailable() {
  return process.platform === 'darwin'
    ? 'sandbox-exec is missing, so there is no wall to put a shell behind'
    : `there is no seatbelt sandbox on ${process.platform}, so a shell would be unbounded`;
}
