import { NOTE_TYPE_COLOR } from './shared.js';
import { vtStyle } from '../vtName.js';
import { pickReviewItem } from '../reviewPick.js';

// Notes domain: the notes browser, the daily-review pick (+ reflect composer),
// and the journal. Adds to ctx: usingLiveNotes, reviewPage, journalDays.
export function valsNotes(app, ctx) {
  const st = app.state;

  // notes — live (real Obsidian vault via server/) or mock, depending on Settings connection
  const usingLiveNotes = !!st.liveNotes;
  const q = st.noteQuery.toLowerCase();

  const noteFilters = usingLiveNotes
    ? ['All', ...Array.from(new Set(st.liveNotes.map(n => (n.type || 'note').toUpperCase())))]
    : ['All', 'NOTE', 'PODCAST', 'IDEA'];

  const allNotesNorm = usingLiveNotes
    ? st.liveNotes.map(n => ({ id: n.id, title: n.title, typeLabel: (n.type || 'note').toUpperCase(), date: (n.date || '').slice(0, 10), color: NOTE_TYPE_COLOR[(n.type || '').toLowerCase()] || 'var(--nv-ink)', searchText: n.title.toLowerCase() }))
    : app.notes.map(n => ({ id: n.id, title: n.title, typeLabel: n.type, date: n.date.split(' · ')[0], color: n.color, searchText: (n.title + ' ' + n.paras.join(' ')).toLowerCase() }));

  const noteList = allNotesNorm
    .filter(n => (st.noteType === 'All' || n.typeLabel === st.noteType || (st.noteType === 'NOTE' && n.typeLabel === 'IDENTITY')) && (!q || n.searchText.includes(q)))
    .map(n => ({ id: n.id, title: n.title, type: n.typeLabel, date: n.date, select: () => app.selectNote(n.id),
      // Intent prefetch: the body starts loading when the finger lands, not
      // when it lifts — so the reader is usually already filled by the time
      // the tap registers. ensureNoteDetail is idempotent and caches, so the
      // tap that follows costs nothing. A scroll gesture also begins with a
      // pointerdown on a row, which at worst spends one small cached GET per
      // flick; the read is free and the write path is untouched.
      warm: () => app.ensureNoteDetail(n.id),
      typeColor: n.color,
      style: { cursor: 'pointer', padding: '10px 12px', borderRadius: '9px', background: st.openNoteId === n.id ? 'color-mix(in srgb, var(--nv-gold) 09%, transparent)' : 'none', border: st.openNoteId === n.id ? '1px solid color-mix(in srgb, var(--nv-gold) 22%, transparent)' : '1px solid transparent',
      // the row EXPANDS INTO the reader rather than the reader cutting in.
      // The open row releases the name so only one element holds it.
      ...vtStyle('note', n.id, st.openNoteId) } }));

  const rawDetail = usingLiveNotes ? st.liveNoteDetails[st.openNoteId] : null;
  const detailFailed = !!rawDetail?.error;
  // the error sentinel must never masquerade as a loaded note
  const liveDetail = detailFailed ? null : rawDetail;
  const on = usingLiveNotes ? null : (app.notes.find(n => n.id === st.openNoteId) || app.notes[0]);
  const noteByTitle = (label) => app.notes.find(n => n.title.startsWith(label.split(' ·')[0].slice(0, 12)));

  // THE DAILY REVIEW — the server's forgetting-curve queue (mockup 96).
  // usingLiveReview mirrors usingLiveNotes: the scripted demo cards only
  // ever show when there is no real connection at all, never as a stand-in
  // for "the Mac hasn't answered yet" (that is reviewMacUnreachable below).
  const usingLiveReview = usingLiveNotes;
  const today = st.liveReviewToday;
  const reviewItem = usingLiveReview ? pickReviewItem({ items: today?.items, drawnExtra: st.reviewDrawnExtra, openId: st.reviewOpenId }) : null;
  const reviewPage = reviewItem ? { id: reviewItem.id, title: reviewItem.title } : null;
  const reviewSummary = reviewItem ? (st.liveReviewSummaries[reviewItem.id] ?? reviewItem.gist) : undefined;
  // honest states (mockup 96 Part 4) — distinguished, never collapsed into
  // one generic "unavailable"
  const reviewLoading = usingLiveReview && today === null;
  const reviewMacUnreachable = usingLiveReview && today === null && st.connectionStatus === 'offline';
  const reviewNothingDue = usingLiveReview && today && today.total === 0;
  const reviewAllDone = usingLiveReview && today && today.total > 0 && today.doneCount >= today.total && !st.reviewDrawnExtra;
  const curveFor = (item) => !item ? null : {
    gaps: [1, 3, 7, 16, 35, 90, 180],
    step: item.step || 0,
    due: item.due,
    answers: (item.history || []).map((h) => ({ date: h.date, grade: h.grade })),
  };
  const REVIEW_GAPS = [1, 3, 7, 16, 35, 90, 180];
  const reviewGapAfter = (step, grade) => {
    const s0 = Math.min(Math.max(step || 0, 0), REVIEW_GAPS.length - 1);
    if (grade === 'got' || grade === 'read') return REVIEW_GAPS[Math.min(s0 + 1, REVIEW_GAPS.length - 1)];
    return REVIEW_GAPS[s0];
  };
  const gradeDestination = {
    got: `in ${reviewGapAfter(reviewItem?.step, 'got')} day${reviewGapAfter(reviewItem?.step, 'got') === 1 ? '' : 's'}`,
    fuzzy: `in ${reviewGapAfter(reviewItem?.step, 'fuzzy')} day${reviewGapAfter(reviewItem?.step, 'fuzzy') === 1 ? '' : 's'}`,
    forgot: 'tomorrow',
  };

  // journal — live entries (Wiki/Journal/) grouped by day, newest first.
  // Category filter keeps personal reflections separate from training receipts
  // and system briefs; days with no matching sections drop out of the list.
  const CATEGORY_META = {
    personal: { label: 'PERSONAL', hue: '143,123,255' },
    training: { label: 'TRAINING', hue: '89,230,255' },
    system: { label: 'SYSTEM', hue: '224,178,106' },
  };
  // WHO WROTE IT (11 Oct 2026). Since 1 Sep Nova and the agents filed every
  // entry here and he filed none, and the screen could not tell his line from
  // Nova's. The server derives `author` (server/lib/journal.js); each entry
  // now wears it in the colours mockup 87 drew: his words the Journal's
  // violet, Nova's his starlight, the Coach's coral, the Leader's magenta
  // (src/glassMarks.js FINDERS). An entry nobody can attribute says so.
  const AUTHOR_META = {
    hayden: { label: 'You', tone: 'var(--nv-vi)' },
    nova: { label: 'Nova', tone: 'var(--nv-nova)' },
    coach: { label: 'Coach', tone: 'var(--nv-m-chest)' },
    leader: { label: 'Leader', tone: 'var(--nv-mg)' },
    guardian: { label: 'Guardian', tone: 'faint' },
    cfo: { label: 'CFO', tone: 'faint' },
    unknown: { label: 'Author unknown', tone: 'faint', dashed: true },
  };
  const jFilter = st.journalFilter || 'all';
  const mapSection = (s) => ({
    time: s.time,
    // an older server sends no author: show nothing rather than guess
    authorMeta: s.author ? AUTHOR_META[s.author] || AUTHOR_META.unknown : null,
    category: s.category || null,
    categoryMeta: s.category ? CATEGORY_META[s.category] || null : null,
    // "Reflection on [[X]]" reads as a concept reflection — label it that way
    heading: s.heading ? s.heading.replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/^Reflection on /, 'Concept reflection — ') : null,
    text: s.text,
  });
  const journalDays = (st.liveJournalEntries || [])
    .map((d) => {
      const sections = d.sections.filter((s) => jFilter === 'all' || (s.category || 'personal') === jFilter);
      // A DAY IS A DAY, NOT AN ISO STRING (23 Sep 2026, review finding 14).
      // Six rows led with `2026-09-22` in mono and today was indistinguishable
      // from one a week old. `Tue 22 Sep` is how he says it; `isToday` lets
      // the screen give today the weight it has.
      const dt = new Date(`${d.date}T12:00:00`);
      const valid = !Number.isNaN(dt.getTime());
      const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      return {
        date: d.date,
        dayLabel: valid ? dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : d.date,
        isToday: d.date === todayIso,
        open: st.journalOpenDate === d.date,
        toggle: () => app.toggleJournalDay(d.date),
        count: sections.length,
        preview: (sections[sections.length - 1]?.text || '').replace(/\s+/g, ' ').slice(0, 100),
        sections: sections.map(mapSection),
      };
    })
    .filter((d) => d.count > 0);
  const journalFilters = ['all', 'personal', 'training', 'system'].map((f) => ({
    key: f,
    label: f === 'all' ? 'ALL' : CATEGORY_META[f].label,
    active: jFilter === f,
    go: () => app.setState({ journalFilter: f }),
  }));

  // shared with valsMission (suggested focus, daily review card) and valsChrome (nav counts)
  Object.assign(ctx, { usingLiveNotes, reviewPage, journalDays });

  // the scripted demo review only ever shows in demo mode — a configured
  // session that hasn't synced (offline, first connect) says so instead
  const demoMode = ctx.demoMode;

  const kindWordFor = (url) => {
    if (!url) return null;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (/youtube\.|youtu\.be/.test(host)) return 'video';
      if (/spotify\.|podcasts\.apple|overcast\./.test(host)) return 'podcast';
      return host;
    } catch { return null; }
  };

  // THE CARD, both idioms, one shape (mockup 96 Part 2). Every honest state
  // this file can distinguish is a DIFFERENT value here, never one generic
  // "unavailable" — the components read `state` and switch on it.
  const reviewState = reviewLoading ? (reviewMacUnreachable ? 'mac-unreachable' : 'loading')
    : reviewNothingDue ? 'nothing-due'
    : reviewAllDone ? 'all-done'
    : reviewItem ? 'card' : 'loading';

  const review = {
    state: reviewState,
    title: reviewItem?.title || '',
    typeColor: reviewItem ? (NOTE_TYPE_COLOR[(reviewItem.type || '').toLowerCase()] || 'var(--nv-ink)') : 'var(--nv-ink)',
    gist: reviewItem ? (reviewSummary ? reviewSummary : (reviewSummary === undefined || reviewSummary === null ? 'Summarizing…' : reviewItem.gist || '')) : '',
    firstLook: !!reviewItem && reviewItem.kind === 'new' && !reviewItem.answered,
    source: reviewItem?.source
      ? { title: reviewItem.source.title, time: reviewItem.source.time, url: reviewItem.source.url, kind: kindWordFor(reviewItem.source.url), extra: reviewItem.source.extra || 0 }
      : null, // null, honestly — "No source on this page", never his own title as a stand-in
    connected: (reviewItem?.connected || []).map((c) => ({ id: c.id, title: c.title, color: NOTE_TYPE_COLOR[(c.type || '').toLowerCase()] || 'var(--nv-ink)', go: () => app.selectNote(c.id) })),
    curve: curveFor(reviewItem),
    pips: today ? { done: today.doneCount, total: today.total } : null,
    next: reviewItem ? () => app.answerReview(reviewItem.id, 'read') : () => {},
    grades: reviewItem ? [
      { key: 'got', label: 'Got it', goesTo: gradeDestination.got, go: () => app.answerReview(reviewItem.id, 'got') },
      { key: 'fuzzy', label: 'Fuzzy', goesTo: gradeDestination.fuzzy, go: () => app.answerReview(reviewItem.id, 'fuzzy') },
      { key: 'forgot', label: 'Forgot', goesTo: gradeDestination.forgot, go: () => app.answerReview(reviewItem.id, 'forgot') },
    ] : [],
    writeAboutIt: reviewItem ? () => { app.selectNote(reviewItem.id); app.toggleReviewReflect(); } : () => {},
    open: reviewItem ? () => app.openDailyReview() : () => {},
    drawEarly: reviewAllDone ? () => app.shuffleDailyReview() : null,
    drawBusy: !!st.reviewDrawBusy,
  };
  Object.assign(ctx, { review });

  return {
    // THE DAILY REVIEW's full view model — one shape, read by the summary
    // Moment, the grouped Group and the classic pane alike (mockup 96).
    review,
    // legacy flat fields some surfaces (the Index nav row) still read
    reviewConcept: usingLiveReview
      ? (reviewItem ? review.gist : reviewNothingDue ? 'Nothing due today' : reviewMacUnreachable ? 'The Mac is unreachable — showing the last sync' : 'Add some Concepts or Topics to your wiki to start daily review')
      : demoMode
        ? app.reviews[st.reviewIdx].c
        : 'Offline — your daily review returns on the next sync.',
    reviewFrom: usingLiveReview
      ? (reviewPage ? reviewPage.title : '')
      : demoMode ? app.reviews[st.reviewIdx].f : '',
    shuffleReview: usingLiveReview
      ? () => app.shuffleDailyReview()
      : demoMode
        ? () => app.setState(s => ({ reviewIdx: (s.reviewIdx + 1 + Math.floor(Math.random() * (app.reviews.length - 1))) % app.reviews.length }))
        : () => {},
    openReview: usingLiveReview
      ? () => app.openDailyReview()
      : demoMode
        ? () => { app.navigate('notes', { openNoteId: app.reviews[st.reviewIdx].id }); app.toastMsg('Commander queued this concept for tonight’s reflection'); }
        : ctx.go('notes'),
    reviewShowReflect: usingLiveReview && !!reviewPage && st.openNoteId === reviewPage.id,
    reviewReflectOpen: st.reviewReflectOpen,
    toggleReviewReflect: () => app.toggleReviewReflect(),
    reviewReflectText: st.reviewReflectText,
    setReviewReflectText: (e) => app.setReviewReflectText(e),
    reviewReflectBusy: st.reviewReflectBusy,
    reviewReflectPromptBusy: st.reviewReflectPromptBusy,
    reviewReflectPromptText: st.reviewReflectPromptText,
    generateReviewReflectPrompt: () => app.generateReviewReflectPrompt(),
    saveReviewReflection: () => app.saveReviewReflection(),

    // notes
    notesHeaderLabel: usingLiveNotes ? `${st.liveNotes.length} notes · live from Obsidian` : `${app.notes.length} notes · demo data`,
    noteQuery: st.noteQuery,
    setNoteQuery: (e) => app.setState({ noteQuery: e.target.value }),
    // EACH FILTER CARRIES ITS COUNT AND ITS TYPE'S HUE (23 Sep 2026). Eighteen
    // identical cyan chips told him nothing about which was worth tapping;
    // the count says how much is behind each one, and the hue is the same
    // NOTE_TYPE_COLOR the rows below already wear, so the chip and its notes
    // are visibly the same thing. `All` keeps the accent — it is the state,
    // not a type.
    noteFilters: noteFilters.map(f => ({
      label: f,
      count: f === 'All' ? allNotesNorm.length : allNotesNorm.filter(n => n.typeLabel === f || (f === 'NOTE' && n.typeLabel === 'IDENTITY')).length,
      hue: f === 'All' ? null : (NOTE_TYPE_COLOR[f.toLowerCase()] || null),
      go: () => app.setState({ noteType: f }),
      active: st.noteType === f,
    })),
    noteList,
    // the other end of the pair — the reader panel wears the open note's name
    openNoteVtStyle: vtStyle('note', st.openNoteId),
    openNoteTitle: usingLiveNotes ? (liveDetail?.title ?? (allNotesNorm.find(n => n.id === st.openNoteId)?.title || 'Loading…')) : on.title,
    openNoteType: (usingLiveNotes ? (liveDetail?.type || '') : on.type) + ' · Obsidian',
    openNoteTypeColor: usingLiveNotes ? (NOTE_TYPE_COLOR[(liveDetail?.type || '').toLowerCase()] || 'var(--nv-ink)') : on.color,
    openNoteMeta: usingLiveNotes ? (liveDetail ? `${liveDetail.date.slice(0, 10)} · ${liveDetail.backlinks} backlink${liveDetail.backlinks === 1 ? '' : 's'}` : '') : on.date,
    openNoteUrl: usingLiveNotes ? (liveDetail?.url || null) : null,
    // Studio pipeline controls — only on idea pages
    openNoteStudio: usingLiveNotes && liveDetail && liveDetail.type === 'idea' ? {
      status: (liveDetail.status || 'seed').toUpperCase(),
      advance: () => app.advanceIdeaStatus(st.openNoteId, liveDetail.status || 'seed'),
      outline: () => app.draftIdeaOutline(st.openNoteId),
      outlineBusy: !!st.studioOutlineBusy,
      // real overnight work: the outline drafts in the 03:30 window and is
      // waiting in the Inbox at dawn — queued by him, never self-assigned
      outlineTonight: () => app.queueIdeaOutlineOvernight(st.openNoteId),
    } : null,
    openNoteParas: usingLiveNotes
      ? (liveDetail
          ? liveDetail.paragraphs.map(p => ({ text: p }))
          : [{ text: detailFailed ? "Couldn't load this note — tap it again to retry, or check the connection in Settings." : 'Loading…' }])
      : on.paras.map(p => ({ text: p })),
    openNoteLinks: usingLiveNotes
      ? (liveDetail?.links || []).map(l => ({ label: l.label, go: () => app.selectNote(l.id) }))
      : on.links.map(l => ({ label: l, go: () => {
          const t = noteByTitle(l);
          if (t) app.setState({ openNoteId: t.id });
          else if (/bowl|oats|parfait|chili/i.test(l)) { const rr = app.recipes.find(x => l.toLowerCase().includes(x.name.split(' ')[0].toLowerCase())); if (rr) app.navigate('recipes', { openRecipeId: rr.id, servings: 1, recipeChat: [] }); }
          else if (/push|wk6/i.test(l)) app.navigate('workouts');
          else app.toastMsg('Linked note opens once that part of the vault is synced');
        } })),

    // journal
    journalHeaderLabel: usingLiveNotes ? `${journalDays.length} day${journalDays.length === 1 ? '' : 's'} · live from Obsidian` : 'Connect a backend in Settings',
    journalComposerText: st.journalComposerText,
    setJournalComposerText: (e) => app.setJournalComposerText(e),
    journalSaveBusy: st.journalSaveBusy,
    journalSaveError: st.journalSaveError,
    submitJournalEntry: () => app.submitJournalEntry(),
    journalPromptBusy: st.journalPromptBusy,
    journalPromptText: st.journalPromptText,
    generateJournalPrompt: () => app.generateJournalPrompt(),
    journalDays,
    journalFilters,
    journalFilterActive: jFilter !== 'all',
    journalLoaded: st.liveJournalEntries != null, // null = still loading, not "no entries yet"
  };
}
