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

// the line a sent video leaves under the box: what was sent, how, and the honest
// promise (it lands in Waiting; nothing here claims it is done)
export function sentLine(entry) {
  const how = entry.mode === 'deep' ? 'Full read' : 'Quick look';
  return { title: `${how} · ${entry.host}`, sub: entry.mode === 'deep' ? 'Running. The weave comes to you for review.' : 'Running. The read lands in Waiting for your call.' };
}
