// WHAT "OPEN X" MEANS — shared by the server's Mac hand (server/lib/macHand.js)
// and the client's router mirror (App.routeIntentLocal). One list of sites and
// one reading of a web address, so the two can never disagree about whether a
// bare "open X" is his Mac's job or the browser hand's. (Precedent for the
// server importing from src/: visualBeats.js, jobBeats.js.)
//
// Born from the "Clicky" reel he asked Nova to grow into (22 Sep 2026): "Open
// my Stripe dashboard in my browser" opened it, on his screen, in his browser.
// Nova's browser hand (browse.js) would instead have sent its own headless
// Chrome to read the page — right for "go and check X", wrong for "open X".

// The sites Nova knows by name. Only addresses that are the same for everyone:
// anything personal or regional is his to say as an address. Matching is
// EXACT after trimming filler — "the diary of a ceo channel on youtube" must
// never open youtube.com's front page because it mentions YouTube.
export const SITES = [
  { name: 'Stripe dashboard', aliases: ['stripe'], url: 'https://dashboard.stripe.com' },
  { name: 'Gmail', aliases: ['google mail'], url: 'https://mail.google.com' },
  { name: 'Google Calendar', aliases: [], url: 'https://calendar.google.com' },
  { name: 'Google Drive', aliases: [], url: 'https://drive.google.com' },
  { name: 'Google Docs', aliases: [], url: 'https://docs.google.com' },
  { name: 'YouTube', aliases: [], url: 'https://www.youtube.com' },
  { name: 'GitHub', aliases: [], url: 'https://github.com' },
  { name: 'LinkedIn', aliases: [], url: 'https://www.linkedin.com' },
  { name: 'Instagram', aliases: [], url: 'https://www.instagram.com' },
  { name: 'ChatGPT', aliases: [], url: 'https://chatgpt.com' },
];

const FILLER = /\b(?:my|the|a|an|our|website|web site|site|homepage|home page|page)\b/g;
const fold = (s) => String(s || '').toLowerCase().replace(/[“”"'’]/g, '').replace(FILLER, ' ').replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function siteFor(text) {
  const want = fold(text);
  if (!want) return null;
  return SITES.find((s) => [s.name, ...s.aliases].some((n) => fold(n) === want)) || null;
}

// A spoken or typed web address. Only http(s) ever opens — a `javascript:`,
// `file:` or app-scheme target is refused here, before anything runs.
const DOMAIN_RE = /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|io|co|au|uk|nz|dev|app|ai|me|tv|gg|so|xyz|edu|gov)(?:\/\S*)?$/i;
export function webAddress(text) {
  let t = String(text || '').trim().replace(/[.,!?]+$/, '');
  // dictation writes "stripe dot com"
  if (/\s+dot\s+/i.test(t)) t = t.replace(/\s+dot\s+/gi, '.');
  let url = null;
  if (/^https?:\/\//i.test(t)) url = t;
  else if (DOMAIN_RE.test(t)) url = `https://${t}`;
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return { kind: 'url', url: u.href, label: u.hostname.replace(/^www\./, '') };
  } catch { return null; }
}

// A site by name or by address — what "open X" means when X is on the web.
export function webTarget(text) {
  const addr = webAddress(text);
  if (addr) return addr;
  const site = siteFor(text);
  return site ? { kind: 'url', url: site.url, label: site.name } : null;
}

// "open X", "open up X in my browser", "pull up X on my Mac" → X, and where
// he said to put it. Anything longer than a bare open — "open X and find Y" —
// is a task, not an open, and returns null.
const OPEN_RE = /^(?:(?:hey|hi|ok|okay)[,\s]+)?(?:(?:nova|jarvis)[,\s]+)?(?:can you |could you |please )?(?:open|launch|pull up|bring up)\s+(?:up\s+)?(.+?)(?:\s+(?:in|on)\s+(?:my|the)\s+(browser|mac|macbook|computer|laptop))?(?:\s+for me)?(?:,?\s+please)?[.!?]*$/i;
export function bareOpen(text) {
  const m = String(text || '').trim().match(OPEN_RE);
  if (!m) return null;
  const target = m[1].trim();
  if (!target || /\b(?:and|then)\b/i.test(target) || target.length > 60) return null;
  return { target, where: m[2] ? (/browser/i.test(m[2]) ? 'browser' : 'mac') : null };
}

// Is THIS device the Mac Nova runs on? The server's own hand acts on the Mac,
// so "open X" only means "on this screen" when he is sitting at it. An iPad
// reports "Macintosh" too, but has a touchscreen.
export function isMacDevice(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false;
  return /Macintosh/.test(String(nav.userAgent || '')) && !((nav.maxTouchPoints || 0) > 1);
}
