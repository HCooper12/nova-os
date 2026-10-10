// ONE LINK, ONE PLACE (10 Oct 2026, his yes to the duplicate warning).
//
// The same product reached twice rarely arrives as the same string: one copy
// came from a newsletter with utm_ tags, one from Instagram with igshid, one
// typed with a trailing slash, one on www. and one without. `stashKey` reduces
// a link to what identifies the page, so the Stash can say "that is already
// on Skincare" instead of keeping two cards for one thing.
//
// Pure and shared: the server refuses a second save with it
// (server/lib/stash.js) and the screen finds the existing card with it.
//
// What it drops: the scheme (http and https are one page), a leading www.,
// the port when it is the default, the fragment, a trailing slash, and the
// tracking parameters below. What it keeps: every other parameter (a
// product's ?variant=2 is a different product), sorted so their order does
// not matter, and the path's case (paths are case-sensitive on most sites).

export const TRACKING_PARAMS = [
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'yclid', 'igshid', 'igsh', 'si',
  'mc_cid', 'mc_eid', 'ref', 'ref_src', 'ref_url', 'srsltid', 'spm', '_ga', '_gl',
  'twclid', 'ttclid', 'li_fat_id', 'wickedid', 'cmpid', 'campaign_id',
];
const isTracking = (k) => /^utm_/i.test(k) || TRACKING_PARAMS.includes(k.toLowerCase());

export function stashKey(url) {
  const raw = String(url || '').trim();
  let u;
  try { u = new URL(raw); } catch { return raw.toLowerCase(); }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const port = u.port && !['80', '443'].includes(u.port) ? `:${u.port}` : '';
  let pathname = u.pathname || '/';
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  if (pathname === '/') pathname = '';
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !isTracking(k))
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const query = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : '';
  return `${host}${port}${pathname}${query}`;
}

// the site's own name for a card's second line: "skin.example.com"
export function hostOf(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, ''); } catch { return String(url || '').slice(0, 40); }
}

// the add bar's offer, kept short: "skin.example.com/serum…"
export function shortLink(url, max = 28) {
  let s;
  try { const u = new URL(String(url)); s = u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname); } catch { s = String(url || ''); }
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export const isLink = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim());
