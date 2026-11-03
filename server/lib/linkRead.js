// READ HIS LINK BEFORE ANSWERING HIM (3 Nov 2026).
//
// He pasted an Instagram reel into Start a project and wrote "watch this to
// understand the idea". The intake model runs with no tools and nothing had
// sent the link to the Watcher, so it replied "I can't open Instagram reels
// from here". His point, in his words: Nova should realise by itself that the
// Watcher or the browser is needed, from the conversation alone.
//
// Deterministic first: CODE reads every link in his words before the model
// sees the turn, with the right hand for each (a video goes to the Watcher's
// toolchain, a page to Nova's own signed-in browser), and the model gets what
// was read, or the exact reason it could not be read. It never has to decide
// to fetch, so it can never forget to.

import path from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

export const MAX_LINKS = 3;
export const MAX_CHARS_PER_LINK = 12_000;

/** Every http(s) link in his words, de-duplicated, in order, at most three. Pure. */
export function linksIn(text) {
  const seen = new Set();
  const out = [];
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const url = m[0].replace(/[).,;\]!?]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

async function defaultReaders() {
  const { extractVideoUrl } = await import('./watcher.js');
  const { readTranscript, readWithBrowser, toolFor } = await import('./browserResearch.js');
  return {
    isVideo: (url) => !!extractVideoUrl(url),
    transcript: readTranscript,
    page: readWithBrowser,
    // a social post whose video could not be read may still show its caption
    hasCaption: (url) => toolFor(url) === 'browser',
  };
}

/**
 * Read each link. Returns [{url, ok, how, title, text, reason}] — failures
 * included, because a reply that cannot say "this was refused" invents.
 */
export async function readLinks(urls, { workDir, readers } = {}) {
  const r = readers || (await defaultReaders());
  const base = workDir || path.join(tmpdir(), 'nova-linkread');
  const out = [];
  for (const url of urls || []) {
    const dir = path.join(base, createHash('sha1').update(url).digest('hex').slice(0, 12));
    try {
      if (r.isVideo(url)) {
        const t = await r.transcript(url, dir);
        if (t.ok && t.text) { out.push({ url, ok: true, how: 'watched (transcript)', title: t.title, text: t.text, note: t.note }); continue; }
        // the video would not come; the post's own page may still carry the caption
        if (r.hasCaption(url)) {
          const pg = await r.page(url);
          if (pg.ok && pg.text) { out.push({ url, ok: true, how: 'read the post page (the video itself could not be watched)', title: pg.title, text: pg.text, reason: t.reason }); continue; }
          out.push({ url, ok: false, how: 'watch', reason: t.reason || pg.reason });
          continue;
        }
        out.push({ url, ok: false, how: 'watch', reason: t.reason });
        continue;
      }
      const pg = await r.page(url);
      out.push(pg.ok && pg.text ? { url, ok: true, how: 'read the page', title: pg.title, text: pg.text } : { url, ok: false, how: 'read', reason: pg.reason });
    } catch (e) {
      out.push({ url, ok: false, how: 'read', reason: String(e?.message || e).slice(0, 200) });
    }
  }
  return out;
}

/** The block that rides into the model's turn. Honest about every miss. Pure. */
export function linkBlock(results) {
  if (!results || !results.length) return '';
  const parts = ['WHAT NOVA READ FROM HIS LINK(S) (Nova\'s code fetched this before your turn; you did not need to and cannot fetch anything yourself):'];
  for (const r of results) {
    if (r.ok) {
      const body = String(r.text).slice(0, MAX_CHARS_PER_LINK);
      parts.push(`--- ${r.url}\n${r.title ? `Title: ${r.title}\n` : ''}How: ${r.how}${r.note ? ` (${r.note})` : ''}${r.reason ? `\nThe video itself failed: ${r.reason}` : ''}\n\n${body}`);
    } else {
      parts.push(`--- ${r.url}\nCOULD NOT BE READ: ${r.reason || 'no reason was given'}`);
    }
  }
  parts.push('Use what was read as if he had explained it to you; echo the idea back in a sentence so he can see you got it. Never say you cannot open links or reels. If a link could not be read, say the reason above once, in plain words, and only then ask for the idea in his words.');
  return parts.join('\n\n');
}

/** Both steps for a caller holding his raw words. Never throws. */
export async function readLinksIn(text, opts = {}) {
  const urls = linksIn(text);
  if (!urls.length) return { results: [], block: '' };
  try {
    const results = await readLinks(urls, opts);
    return { results, block: linkBlock(results) };
  } catch (e) {
    const results = urls.map((url) => ({ url, ok: false, reason: String(e?.message || e).slice(0, 200) }));
    return { results, block: linkBlock(results) };
  }
}
