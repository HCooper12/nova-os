// TURNING A NAMED PANEL INTO A REAL ONE.
//
// The model names what should be on the glass (src/visualBeats.js); this goes
// and gets it. Nothing here invents a picture — every image is either from
// Wikimedia, from a page the research actually cited, or a video's own
// poster, and every one is cached and served from Nova's own origin exactly
// as the Briefing's media is.
//
// TWO SPEEDS, AND THAT IS THE WHOLE DESIGN. His instruction: "visuals should
// always land in context, I'd rather them not dropped at all."
//
//   INSTANT — key, steps, list, metric, bars. Typographic, built from what
//     the model just said. These need no network, so a beat ALWAYS has its
//     panel on the glass the moment its sentence is spoken.
//   FETCHED — image, media. These arrive when they arrive. They do not delay
//     the answer and they are never shown against the wrong sentence:
//     the panel's FRAME (its label and caption) goes up in context instantly
//     and the picture fills into that same frame when it lands.
//
// So nothing is dropped and nothing is out of context — the frame is the
// promise, the picture is the payload, and a failed fetch simply leaves an
// honest typographic panel behind.

import { FETCHED_KINDS } from '../../src/visualBeats.js';
import { resolveImage, resolveClip } from './briefingMedia.js';
import { searchVault } from './recall.js';
import { momentInNote, pickMoment, captionsFor } from './visualMoment.js';

export const mediaUrl = (key, ext) => (key ? `/api/briefing/media/${key}${ext || ''}` : null);

// injectable so the tests never touch the network or shell out to yt-dlp
export const deps = { resolveImage, resolveClip, searchVault, captionsFor };

export function needsFetch(spec) {
  return FETCHED_KINDS.has(spec?.kind);
}

/* ------------------------------- the moment ------------------------------ */

// His decision, asked plainly: REAL, OR GO AND FIND IT. His vault first,
// because the Watcher already wrote the stamp and it costs nothing; the
// captions second, because that is the only other honest source.
export async function findMoment(spec, { vaultPath, videoId, allowCaptions = true } = {}) {
  const phrase = [spec.moment, spec.caption, spec.title].filter(Boolean).join(' ');
  if (!phrase.trim()) return null;
  if (vaultPath && spec.title) {
    try {
      const hits = await deps.searchVault(vaultPath, spec.title, { limit: 2, withText: true });
      for (const h of hits) {
        const m = momentInNote(h.text, phrase);
        if (m) return { ...m, note: h.title };
      }
    } catch { /* the captions are still there */ }
  }
  if (!allowCaptions || !videoId) return null;
  try {
    const cues = await deps.captionsFor(videoId);
    return cues ? pickMoment(cues, phrase) : null;
  } catch {
    return null;
  }
}

/* ------------------------------ the resolver ----------------------------- */

// Never throws and never returns null: a panel that could not be filled comes
// back as itself, which is a perfectly honest thing to leave on the glass.
export async function resolveVisual(spec, { vaultPath = null, sources = [], allowCaptions = true } = {}, onUpdate = null) {
  const base = { ...spec, state: 'ready' };
  if (!needsFetch(spec)) return base;

  if (spec.kind === 'image') {
    try {
      const img = await deps.resolveImage({ query: spec.query, caption: spec.caption }, { sources });
      if (!img) return { ...base, kind: 'key', state: 'no-media' };   // degrade to the words, honestly
      return { ...base, src: mediaUrl(img.key, img.ext), credit: img.credit || null, sourceUrl: img.sourceUrl || null };
    } catch {
      return { ...base, kind: 'key', state: 'no-media' };
    }
  }

  // media — a podcast, a talk, a video he could go and watch.
  //
  // TWO PHASES, measured. A cold resolve took 17.4s live: the video search is
  // most of it and the caption pull is the rest. Waiting for both meant the
  // cover landed long after the sentence that named it. So the COVER is
  // published the moment it exists and the TIMECODE follows into the same
  // card — a chip appearing on a panel already on the glass, which is a
  // detail filling in rather than a picture arriving against the wrong words.
  try {
    const clip = await deps.resolveClip({ query: spec.title || spec.label, caption: spec.caption });
    if (!clip) return { ...base, kind: 'key', state: 'no-media' };
    const cover = {
      ...base,
      src: mediaUrl(clip.posterKey, '.jpg'),
      title: clip.title,
      channel: clip.channel || null,
      watchUrl: `https://www.youtube.com/watch?v=${clip.videoId}`,
      // NEVER an estimate. No stamp means the card offers the episode from
      // its start and says nothing it cannot stand behind.
      stamp: null, stampSource: null, stampNote: null,
    };
    try { onUpdate?.(cover); } catch { /* a listener must not cost the card */ }
    const moment = await findMoment(spec, { vaultPath, videoId: clip.videoId, allowCaptions });
    if (!moment) return cover;
    return {
      ...cover,
      watchUrl: `${cover.watchUrl}&t=${moment.at}s`,
      stamp: moment.stamp,
      stampSource: moment.source,
      stampNote: moment.note || null,
    };
  } catch {
    return { ...base, kind: 'key', state: 'no-media' };
  }
}

// Resolve a reply's panels in a small pool, newest first — the one he is
// about to hear matters more than the one four sentences away.
export async function resolveAll(beats, ctx = {}, { concurrency = 3, onOne = null } = {}) {
  const queue = beats.filter((b) => needsFetch(b.spec));
  const out = new Map();
  let i = 0;
  const worker = async () => {
    while (i < queue.length) {
      const b = queue[i++];
      const v = await resolveVisual(b.spec, ctx, (partial) => { out.set(b.key, partial); try { onOne?.(b.key, partial); } catch { /* ignore */ } });
      out.set(b.key, v);
      try { onOne?.(b.key, v); } catch { /* a listener must not stop the pool */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return out;
}
