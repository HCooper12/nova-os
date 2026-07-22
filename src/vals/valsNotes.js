import { NOTE_TYPE_COLOR, nchip, mono } from './shared.js';

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
    .map(n => ({ title: n.title, type: n.typeLabel, date: n.date, select: () => app.selectNote(n.id),
      typeStyle: { font: "500 8.5px " + mono, letterSpacing: '.08em', color: n.color, flex: 'none' },
      style: { cursor: 'pointer', padding: '10px 12px', borderRadius: '9px', background: st.openNoteId === n.id ? 'color-mix(in srgb, var(--nv-gold) 09%, transparent)' : 'none', border: st.openNoteId === n.id ? '1px solid color-mix(in srgb, var(--nv-gold) 22%, transparent)' : '1px solid transparent' } }));

  const rawDetail = usingLiveNotes ? st.liveNoteDetails[st.openNoteId] : null;
  const detailFailed = !!rawDetail?.error;
  // the error sentinel must never masquerade as a loaded note
  const liveDetail = detailFailed ? null : rawDetail;
  const on = usingLiveNotes ? null : (app.notes.find(n => n.id === st.openNoteId) || app.notes[0]);
  const noteByTitle = (label) => app.notes.find(n => n.title.startsWith(label.split(' ·')[0].slice(0, 12)));

  // daily review — a deterministic-by-date pick from the real Concepts/Topics
  // pages in the vault, falling back to the fictional demo cards when not connected
  const usingLiveReview = usingLiveNotes;
  const reviewPool = app.dailyReviewPool(st.liveNotes);
  const reviewIdx = st.reviewShuffleIdx != null ? st.reviewShuffleIdx : app.dailyReviewIndex(reviewPool);
  const reviewPage = reviewPool[reviewIdx] || null;
  const reviewSummary = reviewPage ? st.liveReviewSummaries[reviewPage.id] : undefined;

  // journal — live entries (Wiki/Journal/) grouped by day, newest first.
  // Category filter keeps personal reflections separate from training receipts
  // and system briefs; days with no matching sections drop out of the list.
  const CATEGORY_META = {
    personal: { label: 'PERSONAL', hue: '143,123,255' },
    training: { label: 'TRAINING', hue: '89,230,255' },
    system: { label: 'SYSTEM', hue: '224,178,106' },
  };
  const jFilter = st.journalFilter || 'all';
  const mapSection = (s) => ({
    time: s.time,
    category: s.category || null,
    categoryMeta: s.category ? CATEGORY_META[s.category] || null : null,
    // "Reflection on [[X]]" reads as a concept reflection — label it that way
    heading: s.heading ? s.heading.replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/^Reflection on /, 'Concept reflection — ') : null,
    text: s.text,
  });
  const journalDays = (st.liveJournalEntries || [])
    .map((d) => {
      const sections = d.sections.filter((s) => jFilter === 'all' || (s.category || 'personal') === jFilter);
      return {
        date: d.date,
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
  return {
    // daily review (Mission Control card)
    reviewConcept: usingLiveReview
      ? (reviewPage
          ? (reviewSummary ? reviewSummary : (reviewSummary === undefined || reviewSummary === null ? 'Summarizing…' : reviewPage.title))
          : 'Add some Concepts or Topics to your wiki to start daily review')
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
    notesHeaderLabel: usingLiveNotes ? `${st.liveNotes.length} NOTES · LIVE FROM OBSIDIAN` : `${app.notes.length} NOTES · DEMO DATA`,
    noteQuery: st.noteQuery,
    setNoteQuery: (e) => app.setState({ noteQuery: e.target.value }),
    noteFilters: noteFilters.map(f => ({ label: f, go: () => app.setState({ noteType: f }), style: nchip(st.noteType === f) })),
    noteList,
    openNoteTitle: usingLiveNotes ? (liveDetail?.title ?? (allNotesNorm.find(n => n.id === st.openNoteId)?.title || 'Loading…')) : on.title,
    openNoteType: (usingLiveNotes ? (liveDetail?.type || '').toUpperCase() : on.type) + ' · OBSIDIAN',
    openNoteTypeColor: usingLiveNotes ? (NOTE_TYPE_COLOR[(liveDetail?.type || '').toLowerCase()] || 'var(--nv-ink)') : on.color,
    openNoteMeta: usingLiveNotes ? (liveDetail ? `${liveDetail.date.slice(0, 10).toUpperCase()} · ${liveDetail.backlinks} BACKLINKS` : '') : on.date.toUpperCase(),
    openNoteUrl: usingLiveNotes ? (liveDetail?.url || null) : null,
    // Studio pipeline controls — only on idea pages
    openNoteStudio: usingLiveNotes && liveDetail && liveDetail.type === 'idea' ? {
      status: (liveDetail.status || 'seed').toUpperCase(),
      advance: () => app.advanceIdeaStatus(st.openNoteId, liveDetail.status || 'seed'),
      outline: () => app.draftIdeaOutline(st.openNoteId),
      outlineBusy: !!st.studioOutlineBusy,
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
    journalHeaderLabel: usingLiveNotes ? `${journalDays.length} DAY${journalDays.length === 1 ? '' : 'S'} · LIVE FROM OBSIDIAN` : 'CONNECT A BACKEND IN SETTINGS',
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
