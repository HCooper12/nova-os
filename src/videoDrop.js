// THE VIDEO DROP (17 Oct 2026). His ask: "a quicker way to send videos to
// analyse and add to my vault. Currently it is just via Nova. Perhaps go back
// to adding a section in Inbox." This is the one pure reader of what he put in
// that section: which link, whether it is a single video, and what to say when
// it is not. What a link IS comes from its address (src/linkKind.js, the same
// module the server's router uses), so the Inbox box and the chat agree.
import { urlsIn, classifyLink } from './linkKind.js';

export function readVideoLink(text) {
  const urls = urlsIn(text);
  if (!urls.length) return { ok: false, reason: 'Paste a video link first.' };
  const kinds = urls.map((u) => classifyLink(u));
  const vid = kinds.find((c) => c.kind === 'video');
  if (vid) return { ok: true, url: vid.url, host: vid.host };
  const first = kinds[0];
  return {
    ok: false,
    reason: first.kind === 'channel'
      ? 'That is a channel or profile. Send one video at a time.'
      : 'That is a page, not a video. Pages go in through the Nova button.',
  };
}

// ANY link for the Send box (17 Oct 2026, his ask: "quickly add links to things
// like reels to add as a recipe ... intelligently identify if it's a recipe").
// Nothing here decides what the link is FOR: the capture rails do that (a bare
// reel whose caption holds a recipe becomes a recipe; a video gets a quick
// look; a recipe page is read into the recipe bank). This only finds the link.
export function readLink(text) {
  const urls = urlsIn(text);
  if (!urls.length) return { ok: false, reason: 'Paste a link first.' };
  const c = classifyLink(urls[0]);
  if (!c.kind) return { ok: false, reason: 'That is not a link Nova can open.' };
  return { ok: true, url: c.url, host: c.host, kind: c.kind };
}

// the line a sent video leaves under the box: what was sent, how, and the honest
// promise (it lands in Waiting; nothing here claims it is done)
export function sentLine(entry) {
  const where = {
    'recipe-video': ['Recipe', 'Reading it into your recipe bank. It is added straight away, with Undo in Filed.'],
    video: ['Quick look', 'Reading it now. It files to your vault by itself, with Undo in Filed.'],
    study: ['Channel study', 'Studying the whole channel. It comes to you for review.'],
    research: ['Research', 'Reading the page. The answer lands in Waiting.'],
  };
  if (entry.mode === 'deep') return { title: `Full read · ${entry.host}`, sub: 'Running. The weave comes to you for review before anything is written.' };
  const [name, sub] = where[entry.kind] || ['Sent', 'Nova is working out where it goes. It shows up in Waiting or Filed.'];
  return { title: `${name} · ${entry.host}`, sub };
}
