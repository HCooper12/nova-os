import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
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

const CHROME = process.env.NOVA_CHROME_BIN
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

async function withPage(fn) {
  const puppeteer = await import('puppeteer-core');
  await mkdir(PROFILE_DIR, { recursive: true });
  const browser = await puppeteer.default.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: PROFILE_DIR,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  });
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
    return await withPage(async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      // social feeds hydrate after load; a short settle beats a fixed long wait
      await new Promise((r) => setTimeout(r, 3500));
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
    return { url, ok: false, reason: `transcript fetch failed (${e.message.slice(0, 120)})`, text: '' };
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
