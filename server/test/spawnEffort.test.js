// Source-shape guard: the account's ambient `effortLevel: xhigh` (read from
// ~/.claude/settings.json whenever a spawn passes no --effort) made ~50 lanes
// think at xhigh on every run (18-19 Oct 2026). Every spawn of the CLI (or a
// `bin` runner) must carry `...effortArgs('<lane>')` / `effortFlag(...)` in the
// 40 lines around it, unless the site is listed in EXEMPT with a reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const WINDOW = 40;

// { file, snippet, why }: a spawn line containing `snippet` in `file` that
// legitimately carries no --effort. A new spawn in the same file is still checked.
const EXEMPT = [
  // The `claude --help` probe lives in spawnBoundary.js and spawns
  // EFFORT_PROBE_BIN (not matched by this scan); it runs no model.
  { file: 'claudeCode.js', snippet: 'function spawnWarm', why: 'receives a finished args array; every caller builds it with effortFlag/effortArgs and the warm pool keys on --effort' },
  { file: 'claudeCode.js', snippet: 'spawn(CLAUDE_BIN, args, { cwd, stdio: [\'pipe\'', why: 'spawnWarm: args come from callers that carry --effort' },
  { file: 'leader.js', snippet: 'spawn(CLAUDE_BIN, args, { cwd, stdio', why: 'runClaude(args, cwd, lane): its three callers each spread effortArgs into args' },
  { file: 'mediaLane.js', snippet: 'spawn(bin, args', why: 'runs yt-dlp/ffmpeg, not the CLI' },
  { file: 'repertoireLane.js', snippet: 'spawn(bin, args', why: 'runs yt-dlp/ffmpeg, not the CLI' },
  { file: 'studyLane.js', snippet: 'spawn(bin, args', why: 'runs yt-dlp, not the CLI' },
];

const libFiles = () => fs.readdirSync(LIB).filter((n) => n.endsWith('.js'));
const HAS_EFFORT = /\beffort(Args|Flag)\(/;

test('every spawn(CLAUDE_BIN / bin) carries an effort flag', () => {
  const offenders = [];
  let seen = 0;
  for (const f of libFiles()) {
    const lines = fs.readFileSync(path.join(LIB, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/\bspawn\((CLAUDE_BIN|bin)\b/.test(line)) return;
      if (EXEMPT.some((e) => e.file === f && line.includes(e.snippet))) return;
      seen++;
      const win = lines.slice(Math.max(0, i - WINDOW), i + WINDOW).join('\n');
      if (!HAS_EFFORT.test(win)) offenders.push(`lib/${f}:${i + 1}`);
    });
  }
  assert.ok(seen > 20, `expected to find the spawn sites, found ${seen}`);
  assert.deepEqual(offenders, [], `spawns with no --effort (they would think at the account's xhigh): ${offenders.join(', ')}`);
});

test('every --model pin sits beside an effort flag', () => {
  const offenders = [];
  for (const f of libFiles()) {
    // localModel.js starts a local mlx server, not a lane.
    if (['modelPrefs.js', 'localModel.js'].includes(f)) continue;
    const lines = fs.readFileSync(path.join(LIB, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/'--model'/.test(line) || /^\s*\/\//.test(line) || /argValue\(/.test(line)) return;
      const win = lines.slice(Math.max(0, i - WINDOW), i + WINDOW).join('\n');
      if (!HAS_EFFORT.test(win)) offenders.push(`lib/${f}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `--model pins with no --effort nearby: ${offenders.join(', ')}`);
});
