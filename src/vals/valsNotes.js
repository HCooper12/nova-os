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
    ? st.liveNotes.map(n => ({ id: n.id, title: n.title, typeLabel: (n.type || 'note').toUpperCase(), date: (n.date || '').slice(0, 10), color: NOTE_TYPE_COLOR[(n.type || '').toLowerCase()] || '#ece5da', searchText: n.title.toLowerCase() }))
    : app.notes.map(n => ({ id: n.id, title: n.title, typeLabel: n.type, date: n.date.split(' · ')[0], color: n.color, searchText: (n.title + ' ' + n.paras.join(' ')).toLowerCase() }));

  const noteList = allNotesNorm
    .filter(n => (st.noteType === 'All' || n.typeLabel === st.noteType || (st.noteType === 'NOTE' && n.typeLabel === 'IDENTITY')) && (!q || n.searchText.includes(q)))
    .map(n => ({ title: n.title, type: n.typeLabel, date: n.date, select: () => app.selectNote(n.id),
      typeStyle: { font: "500 8.5px " + mono, letterSpacing: '.08em', color: n.color, flex: 'none' },
      style: { cursor: 'pointer', padding: '10px 12px', borderRadius: '9px', background: st.openNoteId === n.id ? 'rgba(216,181,115,.09)' : 'none', border: st.openNoteId === n.id ? '1px solid rgba(216,181,115,.22)' : '1px solid transparent' } }));

  const liveDetail = usingLiveNotes ? st.liveNoteDetails[st.openNoteId] : null;
  const on = usingLiveNotes ? null : (app.notes.find(n => n.id === st.openNoteId) || app.notes[0]);
  const noteByTitle = (label) => app.notes.find(n => n.title.startsWith(label.split(' ·')[0].slice(0, 12)));

  // daily review — a deterministic-by-date pick from the real Concepts/Topics
  // pages in the vault, falling back to the fictional demo cards when not connected
  const usingLiveReview = usingLiveNotes;
  const reviewPool = app.dailyReviewPool(st.liveNotes);
  const reviewIdx = st.reviewShuffleIdx != null ? st.reviewShuffleIdx : app.dailyReviewIndex(reviewPool);
  const reviewPage = reviewPool[reviewIdx] || null;
  const reviewSummary = reviewPage ? st.liveReviewSummaries[reviewPage.id] : undefined;

  // journal — live entries (Wiki/Journal/) grouped by day, newest first
  const journalDays = (st.liveJournalEntries || []).map((d) => ({
    date: d.date,
    open: st.journalOpenDate === d.date,
    toggle: () => app.toggleJournalDay(d.date),
    count: d.sections.length,
    preview: (d.sections[d.sections.length - 1]?.text || '').replace(/\s+/g, ' ').slice(0, 100),
    sections: d.sections.map((s) => ({ time: s.time, heading: s.heading ? s.heading.replace(/\[\[([^\]]+)\]\]/g, '$1') : null, text: s.text })),
  }));

  // shared with valsMission (suggested focus, daily review card) and valsChrome (nav counts)
  Object.assign(ctx, { usingLiveNotes, reviewPage, journalDays });

  return {
    // daily review (Mission Control card)
    reviewConcept: usingLiveReview
      ? (reviewPage
          ? (reviewSummary ? reviewSummary : (reviewSummary === undefined || reviewSummary === null ? 'Summarizing…' : reviewPage.title))
          : 'Add some Concepts or Topics to your wiki to start daily review')
      : app.reviews[st.reviewIdx].c,
    reviewFrom: usingLiveReview
      ? (reviewPage ? reviewPage.title : '')
      : app.reviews[st.reviewIdx].f,
    shuffleReview: usingLiveReview ? () => app.shuffleDailyReview() : () => app.setState(s => ({ reviewIdx: (s.reviewIdx + 1 + Math.floor(Math.random() * (app.reviews.length - 1))) % app.reviews.length })),
    openReview: usingLiveReview
      ? () => app.openDailyReview()
      : () => { app.navigate('notes', { openNoteId: app.reviews[st.reviewIdx].id }); app.toastMsg('Commander queued this concept for tonight’s reflection'); },
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
    openNoteTypeColor: usingLiveNotes ? (NOTE_TYPE_COLOR[(liveDetail?.type || '').toLowerCase()] || '#ece5da') : on.color,
    openNoteMeta: usingLiveNotes ? (liveDetail ? `${liveDetail.date.slice(0, 10).toUpperCase()} · ${liveDetail.backlinks} BACKLINKS` : '') : on.date.toUpperCase(),
    openNoteUrl: usingLiveNotes ? (liveDetail?.url || null) : null,
    openNoteParas: usingLiveNotes ? (liveDetail ? liveDetail.paragraphs.map(p => ({ text: p })) : [{ text: 'Loading…' }]) : on.paras.map(p => ({ text: p })),
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
  };
}
