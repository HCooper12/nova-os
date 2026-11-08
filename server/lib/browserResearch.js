import path from 'node:path';
import os from 'node:os';
import { existsSync, readlinkSync, unlinkSync, cpSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

// READING THE WEB AS HE WOULD, not as a bot.
//
// The Scout's first real run proved the gap: it got the Instagram bio, a
// post grid and one Reel, and the YouTube video and LinkedIn profile both
// simply failed to load. Server-side WebFetch is anonymous and logged out —
// exactly the visitor those platforms are built to refuse. Anything worth
// researching about a creator lives behind that refusal.
//
// TWO TOOLS, CHOSEN BY THE TASK — his instruction, and the right call:
//
//   yt-dlp      — for video. Free, fast, no browser, already proven in the
//                 Watcher, and it returns the TRANSCRIPT, which is where a
//                 creator's actual ideas are. A rendered YouTube page gives
//                 you a title and a comment section; the transcript gives
//                 you the thinking. Always prefer this for video.
//
//   Chrome      — for everything a logged-out fetch cannot see: Instagram,
//                 TikTok, X, LinkedIn. Runs against a PERSISTENT Nova
//                 profile he signs into once, never his day-to-day Chrome
//                 profile — driving that would fight his own session, and
//                 a browser Nova can steal focus from is a browser he
//                 stops trusting.
//
// Read-only by construction: it navigates and extracts text. It does not
// click, post, follow, or fill anything. The profile is his real session,
// so the discipline has to live in the code rather than in good intentions.

export const CHROME = process.env.NOVA_CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// His own Chrome profile is deliberately NOT used: Chrome refuses a second
// process on a live profile, and copying it would clone his cookies into a
// place he never agreed to. This one is Nova's, and he logs into it once.
export const PROFILE_DIR = process.env.NOVA_BROWSER_PROFILE
  || path.join(os.homedir(), '.nova-browser');

const NAV_TIMEOUT_MS = 25_000;
const MAX_TEXT = 12_000;

export function browserAvailable() {
  return existsSync(CHROME);
}

// DOES THE PROFILE EXIST — which is NOT the same as being signed in, and
// must never be reported as though it were. The first version returned true
// the moment any page had been loaded, so it would have told him Instagram
// was signed in while it served a logged-out view. Whether a given platform
// accepts this profile is only ever proven by reading it: the reader reports
// a login wall as a failure with its reason, and that is the honest signal.
export function profileExists() {
  return existsSync(path.join(PROFILE_DIR, 'Default'));
}

export function classifyUrl(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return 'other'; }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return 'x';
  if (/(^|\.)linkedin\.com$/.test(host)) return 'linkedin';
  return 'other';
}

/**
 * Which tool should read this URL?
 *   'transcript' — video: yt-dlp, no browser needed
 *   'browser'    — logged-out fetch will be refused or rendered empty
 *   'fetch'      — an ordinary page the agent's own WebFetch handles fine
 * Exported and pure so the routing is testable without spending anything.
 */
export function toolFor(url) {
  const kind = classifyUrl(url);
  if (kind === 'youtube') return 'transcript';
  if (kind === 'instagram' || kind === 'tiktok' || kind === 'x' || kind === 'linkedin') return 'browser';
  return 'fetch';
}

/* ------------------------------- the browser ------------------------------ */

// ONE CHROME AT A TIME ON THE PROFILE (1 Nov 2026, the local research lane,
// lib/localResearch.js). Chrome refuses a second process on a live profile,
// so two readers launched together (a search and a page read, or two page
// reads in parallel) would have the second fail with a lock error that reads
// like a broken page. Every launch from this process waits its turn here. A
// lock held by ANOTHER process (the browser hand, lib/browse.js, runs Chrome
// through its own MCP server on the same profile) is said as what it is.
let chromeQueue = Promise.resolve();

/** Run `fn(page)` in a fresh headless Chrome on Nova's profile, one launch
 *  at a time; the browser is closed whatever happens. Shared with
 *  lib/localResearch.js so both readers launch Chrome the same way. */
export function withPage(fn) {
  const run = chromeQueue.then(() => launchAndRun(fn));
  chromeQueue = run.catch(() => {});
  return run;
}

async function launchAndRun(fn) {
  const puppeteer = await import('puppeteer-core');
  await mkdir(PROFILE_DIR, { recursive: true });
  let browser;
  try {
    browser = await puppeteer.default.launch({
      executablePath: CHROME,
      headless: 'new',
      userDataDir: PROFILE_DIR,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
    });
  } catch (e) {
    if (/SingletonLock|already (?:running|in use)|ProcessSingleton/i.test(String(e.message))) {
      throw new Error('Nova\'s browser profile is in use by another job (the browser hand)');
    }
    throw e;
  }
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1600 });
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Render a page in his signed-in Nova profile and return its visible text.
 * Never throws for a research caller — a refusal is a RESULT, and one the
 * dossier must be able to state plainly.
 */
export async function readWithBrowser(url) {
  if (!browserAvailable()) {
    return { url, ok: false, reason: 'Chrome is not installed where Nova expects it', text: '' };
  }
  try {
    const { isInstagram, instagramAllowed, instagramRequestBlocked } = await import('./watchAuth.js');
    // Instagram: a post or reel page and nothing else (his condition, 4 Nov 2026)
    if (isInstagram(url) && !instagramAllowed(url)) {
      return { url, ok: false, reason: 'Nova only watches Instagram posts and reels; it never opens anything else on Instagram', text: '' };
    }
    return await withPage(async (page) => {
      if (isInstagram(url)) {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          if (instagramRequestBlocked(req.url(), req.method())) req.abort('blockedbyclient').catch(() => {});
          else req.continue().catch(() => {});
        });
      }
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      // social feeds hydrate after load; a short settle beats a fixed long wait
      await new Promise((r) => setTimeout(r, 3500));
      // Instagram: ONLY the post's own caption (its meta description). The page body
      // carries his sidebar (unread message counts, handles), which Nova never reads.
      if (isInstagram(url)) {
        const meta = await page.evaluate(() => ({
          title: (document.querySelector('meta[property="og:title"]') || {}).content || '',
          text: (document.querySelector('meta[property="og:description"]') || document.querySelector('meta[name="description"]') || {}).content || '',
        }));
        const cap = String(meta.text || '').trim().slice(0, MAX_TEXT);
        if (!cap) return { url, ok: false, reason: 'the post showed no caption (it may be private or removed)', text: '' };
        return { url, ok: true, title: meta.title, text: cap };
      }
      const out = await page.evaluate(() => ({
        title: document.title || '',
        // innerText, not textContent: it respects layout and skips script/style,
        // which is the difference between a readable page and a wall of JSON
        text: document.body ? document.body.innerText : '',
      }));
      const text = String(out.text || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
      // A login wall renders fine and says nothing — detect it rather than
      // handing the model a page of "Log in to see photos" as if it were
      // research.
      const walled = /log in|sign up to see|create an account|you must log in/i.test(text) && text.length < 1200;
      if (walled) {
        return { url, ok: false, reason: 'the platform showed a login wall — this Nova browser profile is not signed in to it', title: out.title, text: '' };
      }
      if (!text) return { url, ok: false, reason: 'the page rendered empty', title: out.title, text: '' };
      return { url, ok: true, title: out.title, text };
    });
  } catch (e) {
    return { url, ok: false, reason: `the browser could not read it (${e.message.slice(0, 120)})`, text: '' };
  }
}

/** A video's transcript via the Watcher's proven toolchain — no browser. */
export async function readTranscript(url, workDir) {
  try {
    const { fetchVideoTranscript } = await import('./watcher.js');
    const report = await fetchVideoTranscript(url, workDir);
    if (!report?.transcript) return { url, ok: false, reason: 'no captions and no transcription available', text: '' };
    return {
      url, ok: true,
      title: report.title || url,
      text: String(report.transcript).slice(0, MAX_TEXT),
      note: `transcript via ${report.transcriptSource || 'captions'}${report.duration ? `, ${report.duration}` : ''}`,
    };
  } catch (e) {
    return { url, ok: false, reason: `transcript fetch failed (${e.message.slice(0, 400)})`, text: '' };
  }
}

/**
 * Read whatever these URLs need, each by the right tool. Returns results in
 * order — successes AND failures, because a dossier that cannot say "this
 * was refused" is a dossier that invents.
 */
export async function gather(urls, workDir, { max = 4 } = {}) {
  const out = [];
  for (const url of (urls || []).filter(Boolean).slice(0, max)) {
    const tool = toolFor(url);
    if (tool === 'transcript') out.push({ tool, ...(await readTranscript(url, path.join(workDir, 'watch'))) });
    else if (tool === 'browser') out.push({ tool, ...(await readWithBrowser(url)) });
    else out.push({ tool, url, ok: false, reason: 'left for the agent\'s own fetch', text: '' });
  }
  return out;
}

/** The block that rides into a research prompt. Honest about every failure. */
export function gatheredContext(results) {
  const got = (results || []).filter((r) => r.ok && r.text);
  const missed = (results || []).filter((r) => !r.ok && r.tool !== 'fetch');
  if (!got.length && !missed.length) return '';
  const parts = [];
  if (got.length) {
    parts.push(`MATERIAL NOVA FETCHED FOR YOU (read as ${'him'}, in his own signed-in browser, or pulled as a transcript — this is primary source text, not a summary; quote it sparingly and per the rules above):\n\n`
      + got.map((r) => `--- ${r.tool === 'transcript' ? 'TRANSCRIPT' : 'PAGE'}: ${r.title || r.url}\n${r.url}${r.note ? `\n(${r.note})` : ''}\n\n${r.text}`).join('\n\n'));
  }
  if (missed.length) {
    parts.push(`WHAT NOVA COULD NOT GET (say so plainly in "What I could actually read" — never paper over it):\n${missed.map((r) => `- ${r.url} — ${r.reason}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * Open the Nova browser profile VISIBLY so he can sign in to the platforms
 * he wants read. One-time, deliberate, and his hands on the keyboard — Nova
 * never types a credential, and this is the only path that touches a login
 * screen at all. Resolves when he closes the window.
 */
export async function openSignInWindow(startUrl = 'https://www.instagram.com/accounts/login/') {
  if (!browserAvailable()) throw new Error('Chrome is not installed where Nova expects it');
  const puppeteer = await import('puppeteer-core');
  await mkdir(PROFILE_DIR, { recursive: true });
  const browser = await puppeteer.default.launch({
    executablePath: CHROME,
    headless: false, // the whole point: he signs in himself
    userDataDir: PROFILE_DIR,
    defaultViewport: null,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const [page] = await browser.pages();
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  return new Promise((resolve) => {
    browser.on('disconnected', () => resolve({ ok: true, profile: PROFILE_DIR }));
  });
}

/* ---------------------------- the warm search browser --------------------- */
// SPEED (8 Nov 2026, his round after Rose): launching Chrome cost about 3 s
// of every 4.4 s search, every search. A search needs no sign-in, so it runs
// in its OWN profile (~/.nova-browser-search), in ONE headless Chrome that is
// launched on the first search (or when he starts speaking, routes/voice.js
// prewarm) and closed after SEARCH_IDLE_MS without a search. His signed-in
// profile is never held open: the browser hand (lib/browse.js) and the
// Instagram reads take it with its lock, and a warm browser there would turn
// them away. `deps.launch` is the test seam; tests never start Chrome.
export const SEARCH_PROFILE_DIR = process.env.NOVA_SEARCH_PROFILE || `${PROFILE_DIR}-search`;
export const SEARCH_IDLE_MS = 10 * 60_000;
let warm = null;            // { browser, timer, uses }
let warming = null;         // the launch in flight, so two searches share one
let launchImpl = null;      // tests inject; otherwise puppeteer-core

// A STALE LOCK (8 Nov 2026): a server killed outright leaves its warm Chrome
// behind, or the Chrome dies and leaves SingletonLock pointing at a pid that
// is gone; either way the next launch fails "Failed to launch the browser
// process". The lock names its host and pid: a dead pid's lock is removed
// and the launch tried once more; a live pid is another Nova's browser, and
// the search falls back to a cold launch on his profile (localResearch).
export function clearStaleSearchLock(dir = SEARCH_PROFILE_DIR, { alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } } } = {}) {
  let target;
  try { target = readlinkSync(path.join(dir, 'SingletonLock')); } catch { return 'none'; }
  const pid = Number(String(target).split('-').pop());
  if (pid && alive(pid)) return 'live';
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { unlinkSync(path.join(dir, f)); } catch { /* already gone */ } }
  return 'cleared';
}

// THE SEARCH PROFILE IS SEEDED FROM HIS (8 Nov 2026, measured): Bing hands a
// brand-new profile dictionary results for the same query his profile gets
// right (busy.app, Wired, TechCrunch), and no URL parameter changes that.
// So the first launch copies his profile once, without its caches (392 MB
// → ~120 MB; Cache, Code Cache, GPUCache, Service Worker) or the running
// browser's own files (Singleton*, DevToolsActivePort). Pure given a copier.
const SEED_SKIP = /^(?:Cache|Code Cache|GPUCache|GrShaderCache|GraphiteDawnCache|ShaderCache|Service Worker|DawnCache|DawnGraphiteCache|DawnWebGPUCache|component_crx_cache|extensions_crx_cache|BrowserMetrics(?:-spare\.pma)?|DeferredBrowserMetrics|Singleton(?:Lock|Socket|Cookie)|DevToolsActivePort|RunningChromeVersion|lockfile)$/;
export function seedFilter(src) {
  const base = path.basename(src);
  return !SEED_SKIP.test(base);
}
export function seedSearchProfile(from = PROFILE_DIR, to = SEARCH_PROFILE_DIR, { copy = cpSync, exists = existsSync } = {}) {
  if (exists(path.join(to, 'Default'))) return 'present';
  if (!exists(path.join(from, 'Default'))) return 'no-source';
  copy(from, to, { recursive: true, force: false, errorOnExist: false, filter: seedFilter });
  return 'seeded';
}

async function launchSearchBrowser() {
  if (launchImpl) return launchImpl();
  if (process.env.NODE_TEST_CONTEXT && !process.env.NOVA_RESEARCH_IN_TESTS) throw new Error('Nova\'s search browser is not launched under the test runner');
  const puppeteer = await import('puppeteer-core');
  await mkdir(SEARCH_PROFILE_DIR, { recursive: true });
  try { const seeded = seedSearchProfile(); if (seeded === 'seeded') console.log(`research search: the search profile was seeded from his browser profile (${SEARCH_PROFILE_DIR})`); } catch (e) { console.log(`research search: the search profile could not be seeded (${String(e.message).slice(0, 80)}); starting fresh`); }
  const launch = () => puppeteer.default.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: SEARCH_PROFILE_DIR,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  });
  try { return await launch(); } catch (e) {
    if (clearStaleSearchLock() === 'cleared') return launch();
    throw e;
  }
}

function touchWarm(idleMs = SEARCH_IDLE_MS) {
  if (!warm) return;
  clearTimeout(warm.timer);
  warm.timer = setTimeout(() => { closeSearchBrowser().catch(() => {}); }, idleMs);
  warm.timer.unref?.();
}

/** The warm browser, launched if it is not up; shared by concurrent searches. */
export async function warmSearchBrowser({ idleMs = SEARCH_IDLE_MS } = {}) {
  if (warm?.browser && warm.browser.isConnected?.() !== false) { touchWarm(idleMs); return warm.browser; }
  if (!warming) {
    warming = launchSearchBrowser().then((browser) => {
      warm = { browser, timer: null, uses: 0, since: Date.now() };
      browser.on?.('disconnected', () => { if (warm?.browser === browser) { clearTimeout(warm.timer); warm = null; } });
      touchWarm(idleMs);
      return browser;
    }).finally(() => { warming = null; });
  }
  return warming;
}

/** Run `fn(page)` on a fresh tab of the warm search browser; the tab closes
 *  whatever happens, the browser stays for the next search. */
export async function withSearchPage(fn, { idleMs = SEARCH_IDLE_MS } = {}) {
  const browser = await warmSearchBrowser({ idleMs });
  const page = await browser.newPage();
  if (warm) warm.uses += 1;
  try {
    await page.setViewport?.({ width: 1280, height: 1600 });
    return await fn(page);
  } finally {
    await page.close?.().catch(() => {});
    touchWarm(idleMs);
  }
}

export async function closeSearchBrowser() {
  const w = warm;
  warm = null;
  if (!w) return false;
  clearTimeout(w.timer);
  await w.browser.close?.().catch(() => {});
  return true;
}

/** What is warm right now, for a health line or a test. */
export function searchBrowserState() {
  return warm ? { up: true, uses: warm.uses, sinceMs: Date.now() - warm.since } : { up: false };
}

export function _setSearchLaunchForTest(fn) { launchImpl = fn; }
