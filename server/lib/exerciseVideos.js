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
export function pickVideo(candidates = [], exerciseName = '') {
  const usable = candidates.filter((c) =>
    c && c.id && Number.isFinite(c.duration) && c.duration >= MIN_SECONDS && c.duration <= MAX_SECONDS
    // a search result that does not name the movement is not a form video,
    // however well it ranks — the bandsaw ranked first
    && (!exerciseName || titleIsAboutThisLift(c.title, exerciseName)));
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

export function searchQuery(name, muscleGroup) {
  // "Carter Extension proper form technique tutorial" found a bandsaw guide;
  // "Carter Extension triceps exercise proper form" finds the lift. A name
  // carrying a proper noun needs the body part in the query, so the second
  // attempt adds it — the first stays specific for names that need no help.
  return muscleGroup
    ? `ytsearch5:${name} ${muscleGroup} exercise proper form`
    : `ytsearch5:${name} proper form technique tutorial`;
}

// 45s was not enough. A search run ALONE returns in about 20 seconds, but a
// hundred back to back get throttled and the later ones exceed it — so the
// first full run reported 19 exercises with "no candidate" that in fact have
// plenty, including Barbell Row, Lateral Raise and Hip Thrust. A miss list
// that is really a timeout list is worse than no list: it looks like a fact
// about the data. Longer window, and a pause between searches to stop
// provoking the throttle in the first place.
export const SEARCH_TIMEOUT_MS = 90_000;
export const PAUSE_BETWEEN_MS = 1_500;

function runSearch(name, { timeoutMs = SEARCH_TIMEOUT_MS, muscleGroup } = {}) {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, [
      searchQuery(name, muscleGroup), '--skip-download', '--no-warnings',
      '--print', '%(id)s|%(channel)s|%(duration)s|%(title)s',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => { clearTimeout(timer); resolve(pickVideo(parseResults(out), name)); });
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
    if (i) await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS));
    const hit = await runSearch(ex.name);
    if (hit) found.push({ id: ex.id, name: ex.name, ...hit });
    // "nothing found" and "the search never came back" are different facts and
    // must not share a bucket — the first is about the lift, the second about us
    else notFound.push({ id: ex.id, name: ex.name, why: 'no result within the search window' });
    onProgress?.({ done: i + 1, total: missing.length, name: ex.name, ok: !!hit });
  }
  // Coverage is a finding, not a footnote — the same rule the Study lane and
  // the plan reports follow.
  return { found, notFound, coverage: `${found.length} of ${missing.length} exercises got a candidate` };
}

// ---------------------------------------------------------------------------
// WHERE IN THE VIDEO — the timecode.
// ---------------------------------------------------------------------------
//
// "There's no point in me watching a 20 minute video for the 3 minutes where I
// actually need to see an exercise." So a link is not enough; the link has to
// land ON the demonstration. Three honest outcomes:
//   a chapter whose title names the exercise → deep link to that chapter
//   no chapters, but the video is short      → the whole video IS the demo
//   no chapters and it is long               → find a short one instead
// A long video with no way in is exactly the thing he described, and is never
// linked as-is.
export const SHORT_SECONDS = 240;

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

// Pure: the chapter that best names the exercise, or null. Word overlap with
// the exercise name counts double; a "how to / form / technique" chapter earns
// a point on its own; untitled chapters are never chosen.
export function matchChapter(chapters = [], exerciseName = '') {
  const want = new Set(words(exerciseName));
  let best = null;
  for (const ch of chapters) {
    const title = String(ch?.title || '');
    if (!title || /untitled/i.test(title)) continue;
    const overlap = words(title).filter((w) => want.has(w)).length;
    const howTo = /\b(how to|form|technique|set ?up|execution|demo|demonstration)\b/i.test(title) ? 1 : 0;
    const score = overlap * 2 + howTo;
    if (score > 0 && (!best || score > best.score)) best = { score, start: Number(ch.start_time) || 0, title };
  }
  return best;
}

// "Full Push Workout", "Complete Leg Day", "Entire Upper Body Session" — a
// body-part word often sits between the adjective and the noun, so allow one.
const COMPILATION_RE = /\b(\d+\s+(best|top|exercises?|moves|variations)|top\s+\d+|(full|complete|entire|whole)\s+(\w+\s+)?(workout|routine|session|day)|every|all the|complete guide to (chest|back|legs?|arms?|shoulders?))\b/i;
// Pure: does the title name this lift, and only this lift?
//
// THE BANDSAW. On 5 Sep the daily job linked "Master Your Bandsaw: The
// Ultimate 6-Step Setup Guide" by Carter Products to the Carter Extension —
// a triceps exercise. Word overlap on "carter" was enough for the old rule.
// A brand, a person, a place: any proper noun in an exercise name can match a
// title about something else entirely. So the title now has to name the
// MOVEMENT — the exercise name's last word (extension, raise, curl, press,
// row, squat…), stem-tolerant so "raises" covers "raise" — or share at least
// two words. One shared word is a coincidence, not a match.
const MOVEMENT_STEM = (name) => { const w = words(name); return w.length ? w[w.length - 1].replace(/(es|s)$/, '') : ''; };
export function titleIsAboutThisLift(title, exerciseName) {
  const want = new Set(words(exerciseName));
  if (!want.size) return false;
  const t = String(title || '');
  if (COMPILATION_RE.test(t)) return false;
  const titleWords = words(t);
  const overlap = titleWords.filter((w) => want.has(w)).length;
  const stem = MOVEMENT_STEM(exerciseName);
  const namesTheMovement = !!stem && titleWords.some((w) => w.startsWith(stem));
  return namesTheMovement || overlap >= 2;
}

export function deepLink(url, startSeconds) {
  const s = Math.floor(Number(startSeconds) || 0);
  return s > 0 ? `${url}&t=${s}s` : url;
}

function runChapters(url, { timeoutMs = SEARCH_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, [url, '--skip-download', '--no-warnings', '--print', '%(chapters)j'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => {
      clearTimeout(timer);
      const raw = out.trim();
      if (!raw || raw === 'NA') return resolve([]);
      try { resolve(JSON.parse(raw)); } catch { resolve([]); }
    });
    child.on('error', () => { clearTimeout(timer); resolve([]); });
  });
}

// Turn a picked video into a link that lands on the demonstration. Returns the
// video with `deepLink` set, possibly REPLACED by a shorter one, and `noWayIn`
// when nothing honest was possible.
export async function resolveDemo(video, exerciseName) {
  const chapters = await runChapters(video.url);
  const hit = chapters.length ? matchChapter(chapters, exerciseName) : null;
  if (hit && hit.start > 0) return { ...video, startSeconds: hit.start, chapter: hit.title, deepLink: deepLink(video.url, hit.start) };
  if (video.duration <= SHORT_SECONDS) return { ...video, startSeconds: 0, deepLink: video.url };
  // A long video with no chapters is still the demonstration when it is ABOUT
  // this one lift — "How to PROPERLY Deadlift" is six minutes of deadlift. The
  // first pass called 31 of these "no way in"; 29 were exactly this. Only a
  // compilation ("5 best chest exercises", "full workout") genuinely hides
  // the lift somewhere inside it.
  if (titleIsAboutThisLift(video.title, exerciseName)) return { ...video, startSeconds: 0, deepLink: video.url, wholeVideo: true };
  // long and no way in — a short alternative is the honest link
  const alt = await new Promise((resolve) => {
    const child = spawn(YTDLP, [searchQuery(exerciseName), '--skip-download', '--no-warnings', '--print', '%(id)s|%(channel)s|%(duration)s|%(title)s'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, SEARCH_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => {
      clearTimeout(timer);
      const short = parseResults(out).filter((c) => Number.isFinite(c.duration) && c.duration >= MIN_SECONDS && c.duration <= SHORT_SECONDS && titleIsAboutThisLift(c.title, exerciseName)).sort((a, b) => a.duration - b.duration)[0];
      resolve(short || null);
    });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
  });
  if (alt) {
    return { ...video, url: `https://www.youtube.com/watch?v=${alt.id}`, title: alt.title, channel: alt.channel, duration: alt.duration, startSeconds: 0, deepLink: `https://www.youtube.com/watch?v=${alt.id}`, replaced: { was: video.url, why: 'over 4 minutes with no chapter for the exercise' } };
  }
  return { ...video, startSeconds: 0, deepLink: video.url, noWayIn: true };
}

// ---------------------------------------------------------------------------
// THE STANDING JOB — "all should always be included and up to date".
// ---------------------------------------------------------------------------
//
// His instruction, 5 Sep, and a deliberate grant of autonomy for this one lane:
// an exercise without a form video gets one found and written, without a
// pending record to approve. The reasoning, so it is not mistaken for a
// precedent: a resourceUrl is a link, it cannot corrupt anything he wrote, the
// batch writer backs the file up and the write is undoable — and the
// alternative is a card that renders an empty field until he notices.
//
// Sequential and daily, never on demand from the UI: a hundred yt-dlp
// processes at once is how the first run manufactured nineteen phantom misses.
export async function fillMissingVideos(vaultPath, { onProgress } = {}) {
  const missing = await exercisesMissingVideo(vaultPath);
  if (!missing.length) return { written: 0, missing: 0, noWayIn: [] };
  const entries = [];
  const noWayIn = [];
  for (const [i, ex] of missing.entries()) {
    if (i) await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS));
    // first the specific query; if nothing names the movement, once more
    // with the muscle group in it (the Carter Extension case)
    let pick = await runSearch(ex.name);
    if (!pick && ex.muscleGroup) { await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS)); pick = await runSearch(ex.name, { muscleGroup: ex.muscleGroup }); }
    if (!pick) { noWayIn.push(ex.name); continue; }
    const demo = await resolveDemo(pick, ex.name);
    if (demo.noWayIn) noWayIn.push(ex.name);
    entries.push({ id: ex.id, resourceUrl: demo.deepLink });
    onProgress?.({ done: i + 1, total: missing.length, name: ex.name });
  }
  if (entries.length) {
    const { setExerciseResources } = await import('./exercises.js');
    await setExerciseResources(vaultPath, entries);
  }
  return { written: entries.length, missing: missing.length, noWayIn };
}

export function startVideoScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('exercise-videos');
    try {
      const r = await fillMissingVideos(vaultPath);
      if (r.written) console.log(`exercise videos: filled ${r.written} of ${r.missing} missing${r.noWayIn.length ? ` (no honest link for: ${r.noWayIn.join(', ')})` : ''}`);
    } catch (e) { console.error('exercise videos failed:', e.message); }
  };
  // not at boot — a restart during his session must not kick off forty
  // minutes of yt-dlp; first pass an hour in, then daily
  setTimeout(tick, 60 * 60 * 1000);
  setInterval(tick, 24 * 60 * 60 * 1000);
}
