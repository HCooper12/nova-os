import { mono } from './shared.js';

const serif = 'var(--nv-font-serif)';

// THE LIBRARY — every source in the second brain as a physical-feeling
// shelf. Books get spines and covers; videos, podcasts and articles get
// their own card shapes. Selecting one opens everything Nova holds on it:
// the woven page, its concepts/entities/topics, the raw dossier or
// transcript, and the other sources it shares ideas with.
//
// Covers are GENERATED, deterministically, from the title — same book, same
// cover, every device, no image fetching. The hash picks two hues; the
// gradient + spine highlight do the rest. Nova's palette stays dark-glass,
// so saturation/lightness are pinned and only hue varies.

function hueOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function coverStyleFor(title, kind) {
  const h1 = hueOf(String(title));
  const h2 = (h1 + 46) % 360;
  const base = `linear-gradient(158deg, hsl(${h1} 42% 27%) 0%, hsl(${h2} 48% 13%) 82%)`;
  // the spine: a light edge on the left, like a real board cover catching light
  const spine = 'linear-gradient(90deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,.03) 7%, transparent 14%)';
  const gloss = 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,.055) 47%, transparent 58%)';
  return { background: `${gloss}, ${kind === 'book' ? spine + ', ' : ''}${base}` };
}

const KIND_META = {
  book: { glyph: '❦', label: 'BOOK' },
  video: { glyph: '▶', label: 'VIDEO' },
  podcast: { glyph: '◉', label: 'PODCAST' },
  article: { glyph: '¶', label: 'ARTICLE' },
};

const PROVENANCE_META = {
  read: { label: 'READ', color: 'var(--nv-cy)' },
  researched: { label: 'RESEARCHED', color: 'var(--nv-gold)' },
};

export function valsLibrary(app, ctx) {
  const st = app.state;
  const { isOffline } = ctx;
  const items = st.liveLibrary || [];
  const q = String(st.libraryQuery || '').trim().toLowerCase();

  const counts = { all: items.length, book: 0, video: 0, podcast: 0, article: 0 };
  for (const it of items) counts[it.kind] = (counts[it.kind] || 0) + 1;

  const filter = st.libraryFilter || 'all';
  const filtered = items.filter((it) =>
    (filter === 'all' || it.kind === filter) &&
    (!q || `${it.title} ${it.author || ''} ${(it.concepts || []).join(' ')} ${(it.tags || []).join(' ')}`.toLowerCase().includes(q)));

  const chips = [['all', 'ALL'], ['book', 'BOOKS'], ['video', 'VIDEOS'], ['podcast', 'PODCASTS'], ['article', 'ARTICLES']]
    .filter(([k]) => k === 'all' || counts[k] > 0)
    .map(([k, label]) => ({
      key: k, label: `${label}${counts[k] ? ` · ${counts[k]}` : ''}`, active: filter === k,
      pick: () => app.setState({ libraryFilter: k }),
    }));

  const shelf = filtered.map((it, i) => {
    const kindMeta = KIND_META[it.kind] || KIND_META.article;
    const prov = it.provenance ? PROVENANCE_META[it.provenance] || null : null;
    return {
      id: it.id, title: it.title, author: it.author, kind: it.kind,
      isBook: it.kind === 'book',
      glyph: kindMeta.glyph, kindLabel: kindMeta.label,
      provenance: prov,
      conceptCount: it.concepts?.length || 0,
      backlinks: it.backlinks || 0,
      jacket: st.liveBookCoverUrls?.[it.id] || null,
      coverStyle: {
        ...coverStyleFor(it.title, it.kind),
        // the morph target: the cover flies into the detail header
        viewTransitionName: `lib-${hueOf(it.id)}-${i}`,
      },
      // staggered entrance — the shelf assembles rather than appears
      entranceStyle: { animation: 'shelfIn .5s cubic-bezier(.22,1,.36,1) both', animationDelay: `${Math.min(i * 45, 700)}ms` },
      open: () => app.openLibraryItem(it.id),
    };
  });

  // ---- detail ----
  const openId = st.libraryOpenId;
  const rawDetail = openId ? st.liveLibraryDetails[openId] : null;
  let detail = null;
  if (openId) {
    const chipRow = (list, color) => (list || []).map((p) => ({
      id: p.id, title: p.title, color,
      go: () => { app.selectNote(p.id); app.navigate('notes'); },
    }));
    const it = rawDetail?.item;
    detail = {
      loading: !rawDetail,
      error: rawDetail?.error ? 'Couldn’t load this source — tap to retry.' : null,
      retry: () => app.ensureLibraryDetail(openId, true),
      close: () => app.closeLibraryItem(),
      item: it ? {
        title: it.title, author: it.author, kind: it.kind,
        kindLabel: (KIND_META[it.kind] || KIND_META.article).label,
        glyph: (KIND_META[it.kind] || KIND_META.article).glyph,
        provenance: it.provenance ? PROVENANCE_META[it.provenance] || null : null,
        provenanceNote: it.provenance === 'researched'
          ? 'Researched from public sources — Nova has not read the text. Add your own copy via ⇪ Add to vault to deepen these pages.'
          : it.provenance === 'read' ? 'Woven from the book’s own text or your notes.' : null,
        url: it.url, tags: it.tags || [], created: it.created, updated: it.updated,
        coverStyle: coverStyleFor(it.title, it.kind),
        jacket: st.liveBookCoverUrls?.[it.id] || null,
        isBook: it.kind === 'book',
      } : null,
      body: rawDetail?.body || '',
      concepts: chipRow(rawDetail?.linked?.concept, 'var(--nv-gold)'),
      entities: chipRow(rawDetail?.linked?.entity, 'var(--nv-vi)'),
      topics: chipRow(rawDetail?.linked?.topic, 'var(--nv-cy)'),
      otherLinks: chipRow([...(rawDetail?.linked?.source || []), ...(rawDetail?.linked?.other || [])], 'var(--nv-ink60)'),
      related: (rawDetail?.related || []).map((r) => ({
        id: r.id, title: r.title,
        shared: r.shared.slice(0, 3).join(' · '),
        open: () => app.openLibraryItem(r.id),
        coverStyle: coverStyleFor(r.title, 'book'),
      })),
      backlinkCount: rawDetail?.backlinkPages?.length || 0,
      raw: rawDetail?.raw ? {
        label: rawDetail.raw.missing
          ? 'Raw original listed but missing from Raw/'
          : `${rawDetail.raw.chars >= 2000 ? `${Math.round(rawDetail.raw.chars / 1000)}k chars` : `${rawDetail.raw.chars} chars`} in ${rawDetail.raw.id}`,
        open: rawDetail.raw.missing ? null : () => { app.selectNote(rawDetail.raw.id); app.navigate('notes'); },
      } : null,
      openGalaxy: () => app.navigate('galaxy'),
    };
  }

  // shared with valsChrome (nav count)
  ctx.libraryCount = items.length;

  return {
    isLibrary: st.screen === 'library',
    libraryHeaderLabel: st.liveLibrary
      ? `${items.length} SOURCE${items.length === 1 ? '' : 'S'} · LIVE FROM OBSIDIAN`
      : isOffline ? 'OFFLINE — SHOWING NOTHING RATHER THAN GUESSING' : 'CONNECT A BACKEND IN SETTINGS',
    libraryChips: chips,
    libraryShelf: shelf,
    libraryEmpty: st.liveLibrary && !items.length
      ? 'Your library is empty. Press ＋ ADD SOURCE above to research a book by title and author, paste your own notes, or drop in a video or podcast link — every source lands on this shelf.'
      : (st.liveLibrary && !filtered.length ? 'Nothing matches that filter.' : null),
    libraryQuery: st.libraryQuery || '',
    setLibraryQuery: (e) => app.setState({ libraryQuery: e.target.value }),
    // the shelf owns this now — see the note in Library.jsx
    openIngestModal: () => app.openIngestModal(),
    libraryDetail: detail,
    libraryMono: mono, librarySerif: serif,
  };
}
