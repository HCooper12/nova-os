import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { listPeople } from './mentorPeople.js';
import { listSources, getSource } from './mentorRegister.js';
import { transcriptPathFor } from './mentorTranscripts.js';
import { weekSummary, weaving, getBook } from './mentorWeave.js';
import { briefWorking } from './mentorQueue.js';
import { listRaisedViews, readNotes, timedParagraphs, paragraphsAround } from './mentorAsk.js';

// MENTORS NEWS, the feed (25 Nov 2026): what is new from the people he
// follows, what was learned this week, and what was raised for his review.
// Code only: every count and cost here was counted or recorded by code; what
// the server does not have is null.

export const NEWS_DAYS = 14;
export const NEWS_PER_PERSON = 8;
const DAY_MS = 24 * 3600_000;
const WORKING = { transcript: 'transcript', read: 'reading', weave: 'weaving' };
const idOf = (key) => (String(key).startsWith('yt:') ? String(key).slice(3) : String(key));

/** One source as a News video. */
export function newsVideo(src, personId) {
  return {
    key: src.key,
    id: idOf(src.key),
    personId,
    title: src.title ?? null,
    sec: src.durationSec ?? null,
    date: src.publishedAt ?? null,
    approx: src.publishedApprox ?? null,
    stage: src.stage,
    working: briefWorking(src.key) || WORKING[src.working] || null,
    hold: src.hold ? { state: src.hold.state, why: src.hold.why ?? null } : null,
    audio: src.audio?.url ? { url: src.audio.url, sec: src.audio.sec ?? null } : null,
    read: src.read ? { costUsd: src.read.costUsd ?? null, ideas: src.read.ideas ?? null, scripts: src.read.scripts ?? null, lines: src.read.lines ?? null } : null,
    brief: src.brief ?? null,
    briefError: src.briefError ?? null,
    hasTranscript: existsSync(transcriptPathFor(src.key)),
  };
}

const newestFirst = (a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0);

/** A person's News videos: tier 1, dated, published in the last 14 days, at
 *  most 8; none in the window means the single newest dated one. */
export function videosFor(sources, now) {
  const dated = sources.filter((s) => s.publishedAt && (s.tier == null || s.tier === 1)).sort(newestFirst);
  const inWindow = dated.filter((s) => now - new Date(s.publishedAt).getTime() <= NEWS_DAYS * DAY_MS);
  return (inWindow.length ? inWindow : dated).slice(0, inWindow.length ? NEWS_PER_PERSON : 1);
}

/** GET /mentors/news. `artUrl` turns a stored art file name into its URL. */
export async function newsFeed({ now = Date.now(), artUrl = (f) => f } = {}) {
  const people = (await listPeople()).filter((p) => p.status !== 'guest');
  const out = { at: new Date(now).toISOString(), people: [], videos: [], learned: [], raised: [] };
  for (const p of people) {
    out.people.push({
      id: p.id, name: p.name, handle: p.channel?.handle ?? null, subs: p.channel?.subscribers ?? null, colour: p.colour ?? null,
      art: { avatar: p.art?.avatar ? artUrl(p.art.avatar) : null },
    });
    for (const s of videosFor(await listSources({ personId: p.id, tier: 1 }), now)) out.videos.push({ v: newsVideo(s, p.id), at: s.publishedAt });

    const week = await weekSummary(p.id);
    if (week.batches.length) {
      const top = week.batches[0];
      // counted from the Book, each page once: a chapter or an idea that
      // three of the week's batches touched is one chapter, one idea (a sum
      // of the batches' own counts would say three)
      const book = await getBook(p.id).catch(() => null);
      const keys = new Set(week.batches.flatMap((b) => b.keys || []));
      const ns = new Set((book?.sources || []).filter((s) => keys.has(s.key)).map((s) => s.n));
      const drawsOn = (list) => (list || []).filter((x) => (x.sources || []).some((n) => ns.has(n))).length;
      out.learned.push({
        personId: p.id, from: week.from, to: week.to,
        videos: week.totals.sources,
        chapters: book ? drawsOn(book.chapters) : null,
        ideas: book ? drawsOn(book.concepts) : null,
        scripts: book ? (book.scripts || []).filter((x) => ns.has(x.s)).length : null,
        undo: top.undoable && weaving() !== p.id ? { batchId: top.batchId, videos: top.counts?.sources ?? null } : null,
      });
    }

    const items = await listRaisedViews(p.id);
    if (items.length) out.raised.push({ personId: p.id, items });
  }
  out.videos = out.videos.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).map((x) => x.v);
  return out;
}

const fail = (message, flag) => { const e = new Error(message); e[flag] = true; return e; };

/**
 * GET /mentors/source/transcript: the paragraphs within `span` seconds either
 * side of `at` (default 75, at most 600), the one holding the mark marked;
 * with no `at`, the first 12. With `rest`, it reads on to the end: from
 * `span` seconds before the mark (or from the start, with no `at`) to the
 * last paragraph, so he can read the source himself. `notFound` when there
 * is no transcript, `refused` when it has no time marks.
 */
export async function transcriptAround(key, { at = null, span = 75, rest = false } = {}) {
  const src = await getSource(key);
  if (!src) throw fail(`no source with key "${key}"`, 'notFound');
  let text;
  try { text = await readFile(transcriptPathFor(key), 'utf8'); } catch { throw fail(`there is no transcript of ${src.title || key} yet`, 'notFound'); }
  const paras = timedParagraphs(text);
  if (!paras.length) throw fail(`the transcript of ${src.title || key} has no time marks, so no moment in it can be found`, 'refused');
  const notes = src.stage === 'read' || src.stage === 'woven' ? await readNotes(key) : null;
  const note = notes?.summary ? String(notes.summary).trim() || null : null;
  const near = Math.min(600, span);
  const marked = at == null ? null : paragraphsAround(paras, at, Infinity);
  const picked = at == null
    ? (rest ? paras : paras.slice(0, 12)).map((p) => ({ ...p, m: false }))
    : rest ? marked.filter((p) => p.m || p.s >= at - near) : paragraphsAround(paras, at, near);
  return { key, title: src.title ?? null, at, note, paras: picked.map((p) => ({ t: p.t, s: p.s, x: p.x, m: p.m })) };
}
