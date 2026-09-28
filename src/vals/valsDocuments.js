// DOCUMENTS — the view model for the place he finds everything the agents
// wrote (src/screens/Documents.jsx) and for the viewer that opens one
// (src/ArtifactViewer.jsx). 28 Sep 2026.
//
// His words: "simple and easy, but also engaging and appealing to find,
// retrieve and access reports or artefacts." So: one search, four chips, the
// pinned ones as covers at the top, the rest by when they were written. Every
// value here is read from the list the server returned — the counts, the
// dates, the hues — and a list that has not loaded says so rather than
// claiming it is empty.
import { AGENT, agentOf, KIND_LABEL, ageBucket, relativeDate, wordsLabel, artifactMeta } from '../artifactClient.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'coach', label: 'Coach' },
  { key: 'nova', label: 'Nova' },
  { key: 'leader', label: 'Leader' },
  { key: 'html', label: 'Interactive' },
];
const GROUPS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'earlier', label: 'Earlier' },
];

const words = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
/** Every word he typed appears somewhere in what the row shows. Pure. */
export function matchesQuery(m, q) {
  const want = words(q);
  if (!want.length) return true;
  const hay = [m.title, m.summary, m.question, ...(Array.isArray(m.tags) ? m.tags : []), agentOf(m.agent).name].join(' ').toLowerCase();
  return want.every((w) => hay.includes(w));
}
/** One chip's test. Pure. */
export function matchesFilter(m, f) {
  if (!f || f === 'all') return true;
  if (f === 'html') return m.kind === 'html';
  return String(m.agent || 'nova').toLowerCase() === f;
}

/** The serif line at the top: counted from the list, never written. Pure. */
export function docsHeadline(items, now = Date.now()) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return { line: 'Nothing written yet', sub: '' };
  const week = list.filter((m) => ageBucket(m.created, now) !== 'earlier');
  const latest = list[0];
  const n = list.length;
  const line = week.length
    ? `${week.length} new this week`
    : `${n} document${n === 1 ? '' : 's'}`;
  const rel = latest ? relativeDate(latest.created, now) : '';
  const when = !rel ? '' : /^\d/.test(rel) ? `today at ${rel}` : rel === 'Yesterday' ? 'yesterday' : `on ${rel}`;
  const sub = latest ? `The latest from ${agentOf(latest.agent).name}${when ? `, ${when}` : ''}` : '';
  return { line, sub };
}

function row(app, m, now) {
  const agent = agentOf(m.agent);
  const kind = m.kind === 'html' ? 'html' : 'doc';
  return {
    id: m.id,
    title: m.title || 'Untitled document',
    summary: m.summary || '',
    agent: agent.key, agentName: agent.name, hue: agent.hue,
    kind, kindLabel: KIND_LABEL[kind],
    when: relativeDate(m.created, now),
    length: kind === 'html' ? 'Interactive' : wordsLabel(m.words),
    pinned: !!m.pinned,
    open: () => app.openArtifact(m.id),
  };
}

export function valsDocuments(app, _ctx) {
  const st = app.state;
  const mob = st.isMobile;
  const out = {
    isDocuments: st.screen === 'documents',
    artifactViewer: null,
    docs: null,
  };

  // THE VIEWER: open on any screen, from any card
  if (st.artifactOpenId) {
    const id = st.artifactOpenId;
    const listed = st.documents?.items?.find((m) => m.id === id) || null;
    const meta = listed || artifactMeta(id);
    out.artifactViewer = {
      id,
      meta: meta && !meta.missing ? meta : null,
      mobile: mob,
      close: () => app.closeArtifact(),
      pin: (m, pinned) => app.pinArtifact(m, pinned),
      trash: (m) => app.trashArtifact(m),
      ask: (m) => app.askAboutArtifact(m),
      toast: (t) => app.toastMsg(t),
    };
  }

  if (!out.isDocuments) return out;

  const now = Date.now();
  const d = st.documents;
  const filter = FILTERS.some((f) => f.key === st.docFilter) ? st.docFilter : 'all';
  const query = st.docQuery || '';
  const searching = query.trim().length > 0;
  const all = d?.items || [];
  // the server's answer for these exact words, when it has come back
  const source = searching && st.docSearch && st.docSearch.q === query.trim() ? st.docSearch.items : all;
  const shown = source.filter((m) => matchesFilter(m, filter) && (source === all ? matchesQuery(m, query) : true));

  const pinnedRows = searching ? [] : shown.filter((m) => m.pinned).map((m) => row(app, m, now));
  const rest = searching ? shown : shown.filter((m) => !m.pinned);
  const groups = searching
    ? (rest.length ? [{ key: 'results', label: `${rest.length} result${rest.length === 1 ? '' : 's'}`, rows: rest.map((m) => row(app, m, now)) }] : [])
    : GROUPS.map((g) => ({ ...g, rows: rest.filter((m) => ageBucket(m.created, now) === g.key).map((m) => row(app, m, now)) })).filter((g) => g.rows.length);

  const count = (f) => all.filter((m) => matchesFilter(m, f)).length;
  const state = d == null ? 'loading'
    : d.offline ? 'offline'
      : d.error && !all.length ? 'error'
        : !all.length ? 'empty'
          : 'ready';

  out.docs = {
    state,
    error: d?.error || null,
    load: () => app.loadDocuments(),
    headline: docsHeadline(all, now),
    query,
    setQuery: (q) => app.searchDocuments(q),
    clearQuery: () => app.searchDocuments(''),
    filter,
    setFilter: (f) => app.setState({ docFilter: f }),
    filters: FILTERS.map((f) => ({
      ...f,
      count: d ? count(f.key) : null,
      hue: AGENT[f.key]?.hue || (f.key === 'html' ? 'var(--nv-vi)' : 'var(--nv-acc)'),
      active: filter === f.key,
    })),
    pinned: pinnedRows,
    groups,
    // nothing matches, but there ARE documents — a different sentence from empty
    noMatch: state === 'ready' && !pinnedRows.length && !groups.length,
    wrap: mob
      ? { padding: 'calc(48px + env(safe-area-inset-top)) 16px calc(108px + env(safe-area-inset-bottom))' }
      : { padding: '28px 40px 56px', maxWidth: '980px' },
    mobile: mob,
  };
  return out;
}
