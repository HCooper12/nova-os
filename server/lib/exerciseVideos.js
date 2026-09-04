// FORM VIDEOS FOR THE 105 EXERCISES THAT HAVE NONE.
//
// 30 of his 135 exercises carried a resourceUrl; the exercise card renders a
// "form / technique resource" link and it was absent on the other 105.
//
// NOT THE RESEARCHER. He chose "curated + verified links found by the
// Researcher", and at that lane's $1 ceiling this is 105 runs — about $105 for
// a job a search engine does for nothing. A deterministic yt-dlp search
// returns the same class of result (ATHLEAN-X, short technique tutorials) at
// zero cost and with no model in the loop, which is also the house rule: code
// acts, models interpret, and nothing here needs interpreting.
//
// Honest about what it is: this SEARCHES, it does not curate. Every candidate
// is proposed for his review in one record — never written to the vault on
// Nova's own judgement — and the filters below are the only quality claim
// being made.

import { spawn } from 'node:child_process';
import { loadExerciseLibrary } from './exercises.js';

const YTDLP = process.env.YTDLP_BIN || '/opt/homebrew/bin/yt-dlp';

// Duration filter, and the whole of the quality argument. Under a minute is a
// Short — vertical, musicked, usually no cues. Over twelve is a podcast that
// mentions the lift. What survives is a technique tutorial.
export const MIN_SECONDS = 45;
export const MAX_SECONDS = 12 * 60;

// Channels worth preferring when one shows up in the results. Deliberately
// short and deliberately not exhaustive — a longer list would imply a
// judgement about the rest that this module has not made.
export const PREFERRED = ['ATHLEAN-X', 'Jeff Nippard', 'Renaissance Periodization', 'Squat University', 'Alan Thrall'];

// Pure: pick the best candidate from a parsed result set, or null. Exported so
// the ranking is testable without touching the network.
export function pickVideo(candidates = []) {
  const usable = candidates.filter((c) =>
    c && c.id && Number.isFinite(c.duration) && c.duration >= MIN_SECONDS && c.duration <= MAX_SECONDS);
  if (!usable.length) return null;
  const preferred = usable.find((c) => PREFERRED.some((p) => String(c.channel || '').toLowerCase().includes(p.toLowerCase())));
  const chosen = preferred || usable[0];
  return { url: `https://www.youtube.com/watch?v=${chosen.id}`, title: chosen.title, channel: chosen.channel, duration: chosen.duration, preferred: !!preferred };
}

// Pure: yt-dlp's --print output into candidates. One malformed line must not
// lose the rest of the results.
export function parseResults(stdout) {
  return String(stdout || '').split('\n').map((line) => {
    const [id, channel, duration, ...rest] = line.split('|');
    if (!id || !rest.length) return null;
    return { id: id.trim(), channel: (channel || '').trim(), duration: Number(duration), title: rest.join('|').trim() };
  }).filter(Boolean);
}

export function searchQuery(name) {
  return `ytsearch5:${name} proper form technique tutorial`;
}

function runSearch(name, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, [
      searchQuery(name), '--skip-download', '--no-warnings',
      '--print', '%(id)s|%(channel)s|%(duration)s|%(title)s',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => { clearTimeout(timer); resolve(pickVideo(parseResults(out))); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

export async function exercisesMissingVideo(vaultPath) {
  const { exercises: all } = await loadExerciseLibrary(vaultPath);
  return all.filter((e) => !e.resourceUrl);
}

// Search for every exercise that has none. Sequential on purpose: a hundred
// parallel yt-dlp processes is how you get rate-limited into an empty result
// set, and this runs once.
export async function findFormVideos(vaultPath, { onProgress } = {}) {
  const missing = await exercisesMissingVideo(vaultPath);
  const found = [];
  const notFound = [];
  for (const [i, ex] of missing.entries()) {
    const hit = await runSearch(ex.name);
    if (hit) found.push({ id: ex.id, name: ex.name, ...hit });
    else notFound.push({ id: ex.id, name: ex.name });
    onProgress?.({ done: i + 1, total: missing.length, name: ex.name, ok: !!hit });
  }
  // Coverage is a finding, not a footnote — the same rule the Study lane and
  // the plan reports follow.
  return { found, notFound, coverage: `${found.length} of ${missing.length} exercises got a candidate` };
}
