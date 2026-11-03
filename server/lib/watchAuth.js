// THE WATCHER'S SIGN-IN (3 Nov 2026, his reel at 10:53 AEST).
//
// Instagram, TikTok and X hand yt-dlp nothing for most posts unless the
// request carries a signed-in session ("Instagram sent an empty media
// response"). Nova already has ONE signed-in browser of its own, the profile
// at ~/.nova-browser that he signs in to with his own hands
// (POST /api/browser/sign-in). This file lends that profile's cookies for the
// platform being read to yt-dlp, and nothing else:
//
// - cookies are read from Nova's OWN profile, never from his Safari or Chrome;
// - only the platform's own domain is written, to a 0600 file under
//   server/data/watch-auth, refreshed at most every 30 minutes;
// - yt-dlp is pointed at it through its own config file (XDG_CONFIG_HOME on
//   the child process only), so the watch script itself is untouched;
// - a profile that is not signed in to the platform lends nothing, and the
//   caller says so plainly (signInHint) instead of a yt-dlp stack line.

import { mkdirSync, writeFileSync, statSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const authDir = () => path.join(dataRoot(), 'watch-auth');
const FRESH_MS = 30 * 60 * 1000;

// platform → the cookie domain it lives on, the cookie that proves a session,
// and the name he would recognise
export const PLATFORMS = {
  instagram: { domain: 'instagram.com', session: 'sessionid', name: 'Instagram', signIn: 'https://www.instagram.com/accounts/login/' },
  tiktok: { domain: 'tiktok.com', session: 'sessionid', name: 'TikTok', signIn: 'https://www.tiktok.com/login' },
  x: { domain: 'x.com', session: 'auth_token', name: 'X', signIn: 'https://x.com/login' },
};

export function platformOf(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return 'x';
  return null;
}

/** Netscape cookies.txt, the format yt-dlp's --cookies reads. Pure. */
export function toNetscape(cookies, domain) {
  const mine = (cookies || []).filter((c) => c && c.name && String(c.domain || '').replace(/^\./, '').endsWith(domain));
  const lines = ['# Netscape HTTP Cookie File', '# Lent by Nova from its own browser profile, for the Watcher only.'];
  for (const c of mine) {
    const d = String(c.domain);
    const sub = d.startsWith('.') ? 'TRUE' : 'FALSE';
    const exp = c.session || !c.expires || c.expires < 0 ? 0 : Math.floor(c.expires);
    // a tab, newline or CR inside a value would break the file's rows
    const clean = (s) => String(s ?? '').replace(/[\t\r\n]/g, '');
    lines.push([clean(d), sub, clean(c.path || '/'), c.secure ? 'TRUE' : 'FALSE', exp, clean(c.name), clean(c.value)].join('\t'));
  }
  return { text: `${lines.join('\n')}\n`, count: mine.length };
}

/** True when the platform's own session cookie is among them. Pure. */
export function signedIn(cookies, platform) {
  const p = PLATFORMS[platform];
  if (!p) return false;
  return (cookies || []).some((c) => c && c.name === p.session && c.value && String(c.domain || '').replace(/^\./, '').endsWith(p.domain));
}

async function profileCookies() {
  const { withPage, browserAvailable, profileExists } = await import('./browserResearch.js');
  if (!browserAvailable() || !profileExists()) return [];
  return withPage(async (page) => {
    const cdp = await page.target().createCDPSession();
    const { cookies } = await cdp.send('Network.getAllCookies');
    return cookies || [];
  });
}

let deps = { profileCookies };
export function _setWatchAuthDepsForTest(over = {}) { deps = { profileCookies, ...over }; }

/**
 * For a sign-in platform: a { env } to merge into the yt-dlp child's env, or
 * { env: null, reason } when there is nothing to lend. Never throws.
 */
export async function ytdlpAuthFor(url, { now = Date.now() } = {}) {
  const platform = platformOf(url);
  if (!platform) return { env: null, platform: null };
  const p = PLATFORMS[platform];
  const dir = path.join(authDir(), platform);
  const cookieFile = path.join(dir, 'cookies.txt');
  const confDir = path.join(dir, 'yt-dlp');
  try {
    if (now - statSync(cookieFile).mtimeMs < FRESH_MS) return { env: { XDG_CONFIG_HOME: dir }, platform };
  } catch { /* not written yet */ }
  let cookies = [];
  try { cookies = await deps.profileCookies(); } catch (e) {
    return { env: null, platform, reason: `Nova's browser could not be opened to borrow its ${p.name} sign-in (${String(e.message).slice(0, 120)})` };
  }
  if (!signedIn(cookies, platform)) return { env: null, platform, reason: `Nova's browser on the Mac is not signed in to ${p.name}` };
  const { text } = toNetscape(cookies, p.domain);
  mkdirSync(confDir, { recursive: true });
  writeFileSync(cookieFile, text, { mode: 0o600 });
  chmodSync(cookieFile, 0o600);
  writeFileSync(path.join(confDir, 'config'), `--cookies "${cookieFile}"\n`, { mode: 0o600 });
  return { env: { XDG_CONFIG_HOME: dir }, platform };
}

/**
 * yt-dlp's refusal for a login-walled post, said as what it is. Returns null
 * when the error is something else (keep that error as it came).
 */
export function signInHint(url, message, { lent = false } = {}) {
  const platform = platformOf(url);
  if (!platform) return null;
  if (!/empty media response|login|log in|cookies|not available|private|rate-limit|authentication/i.test(String(message || ''))) return null;
  const p = PLATFORMS[platform];
  return lent
    ? `${p.name} refused this post even with Nova's sign-in: it may be private, deleted, or the sign-in has expired (sign in again in Nova's browser on the Mac)`
    : `${p.name} only shows this post to a signed-in account, and Nova's browser on the Mac is not signed in to ${p.name}. It needs a one-time ${p.name} sign-in in Nova's own browser window on the Mac, then send the link again`;
}
