import { DEMO_LIFE_SOURCES, journalScenarioFromUrl } from '../journalDemo.js';

// HIS JOURNAL's view model (mockup 95). ONE shape, read by the Journal page
// and by the Daily review on both Homes. Two places from one list: Mine is
// the entries whose author is him; Nova's log is everything else, signed.
// A view by author: no file moves (server/lib/journal.js isHisOwnEntry).

export const TAGS = {
  own: { key: 'own', label: 'Own', hue: 'var(--nv-vi)', hint: 'off the cuff' },
  life: { key: 'life', label: 'Life', hue: 'var(--nv-cy)', hint: "Nova's life or review prompt" },
  deep: { key: 'deep', label: 'Deep', hue: 'var(--nv-mg)', hint: 'a question to think with' },
};
export const AUTHORS = {
  nova: { label: 'Nova', hue: 'var(--nv-nova)' },
  coach: { label: 'Coach', hue: 'var(--nv-m-chest)' },
  leader: { label: 'Leader', hue: 'var(--nv-gold)' },
  guardian: { label: 'Guardian', hue: 'var(--nv-ink50)' },
  cfo: { label: 'CFO', hue: 'var(--nv-ink50)' },
  unknown: { label: 'Unknown', hue: 'var(--nv-ink40)' },
};
const KIND = { deep: { label: 'Deep', hue: 'var(--nv-mg)', glyph: 'deep' }, review: { label: 'Daily review', hue: 'var(--nv-cy)', glyph: 'review' }, life: { label: 'My life', hue: 'var(--nv-cy)', glyph: 'life' } };
const SRC = [['cal', 'Calendar'], ['train', 'Training'], ['lead', 'Lead'], ['money', 'Money'], ['review', 'Review']];
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const word = (n) => WORDS[n] || String(n);
const lower = (n) => word(n).toLowerCase();

const pad = (n) => String(n).padStart(2, '0');
const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayLabel = (iso) => { const d = new Date(`${iso}T12:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', ''); };
const longDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
const daysAgo = (iso, today) => Math.round((new Date(`${today}T12:00:00`) - new Date(`${iso}T12:00:00`)) / 86400000);

const isHis = (s) => s.author === 'hayden';
const tagOf = (s) => (TAGS[s.tag] ? s.tag : s.prompt ? 'life' : 'own');
const wordsOf = (s) => (s.words != null ? s.words : s.text);

// the serif news line: what today holds, said as he would
function mineNews(today) {
  if (!today.length) return { lead: 'Nothing yet today.', bold: '' };
  const c = { own: 0, life: 0, deep: 0 };
  today.forEach((e) => { c[e.tag] += 1; });
  const parts = [];
  if (c.own) parts.push(`${lower(c.own)} off the cuff`);
  if (c.life) parts.push(`${lower(c.life)} from your life`);
  if (c.deep) parts.push(`${lower(c.deep)} deep`);
  const n = today.length;
  const only = parts.length === 1 && n > 1 ? (c.deep ? 'All deep.' : c.life ? 'All from your life.' : 'All off the cuff.') : null;
  const sentence = only || (parts.join(', ').replace(/^./, (m) => m.toUpperCase()) + '.');
  return { lead: `${word(n)} ${n === 1 ? 'entry' : 'entries'} today.`, bold: n === 1 ? (c.deep ? 'A deep one.' : c.life ? 'One from your life.' : 'Off the cuff.') : sentence };
}

export function buildJournal(app, ctx) {
  const st = app.state;
  const demo = !!ctx.demoMode && !st.liveJournalEntries;
  const scen = demo ? journalScenarioFromUrl() : {};
  const days = demo ? app.journalDemoDays() : (st.liveJournalEntries || null);
  const loaded = days != null;
  const today = localISO();
  const offline = st.connectionStatus === 'offline' || scen.jdemo === 'offline';

  // ---------------------------------------------------------------- Notion
  const ns = demo ? { state: scen.notion || 'synced', error: scen.notion === 'error' ? 'Notion cannot see the Journal database (share it with the Nova connection)' : null, entries: {} } : st.liveNotionJournal;
  const notionState = !ns ? 'unknown' : ns.state;
  const syncOf = (s) => {
    const landing = st.journalLanding?.[s.novaId];
    if (notionState === 'not-connected') return { kind: 'none' };
    if (offline && landing === 'busy') return { kind: 'wait', words: 'Waiting on this phone' };
    if (landing === 'busy') return { kind: 'busy' };
    if (landing === 'wait') return { kind: 'wait', words: 'In your vault · to Notion' };
    if (notionState === 'syncing' && (!ns.entries || ns.entries[s.novaId] !== 'ok')) return { kind: 'busy' };
    const per = demo ? (s.writtenIn === 'notion' ? 'from' : notionState === 'wait' ? 'wait' : 'ok') : ns?.entries?.[s.novaId];
    if (per === 'from') return { kind: 'from', words: 'Written in Notion' };
    if (per === 'ok') return { kind: 'ok' };
    if (per === 'vault-only') return { kind: 'wait', words: 'Deleted in Notion · vault only' };
    if (per === 'error') return { kind: 'error', words: 'Notion refused this entry' };
    if (per === 'wait') return { kind: 'wait', words: 'In your vault · to Notion' };
    if (notionState === 'error') return { kind: 'error', words: 'Not in Notion yet' };
    return { kind: 'none' };
  };

  // ---------------------------------------------------------------- Mine
  const kindFilter = st.journalFilter || 'all';
  const tagFilter = st.journalTagFilter || 'all';
  const who = st.journalWho || 'all';
  const pop = st.journalTagPop;
  const mineEntry = (s, date) => {
    const tag = tagOf(s);
    return {
      key: s.novaId || `${date}-${s.time}`,
      novaId: s.novaId,
      time: s.time,
      tag, tagMeta: TAGS[tag],
      prompt: s.prompt || null,
      promptFrom: s.promptFrom || null,
      words: wordsOf(s),
      isNew: !!s.demoNew || !!st.journalLanding?.[s.novaId],
      sync: syncOf(s),
      openTag: (rect) => app.openJournalTagPop(s.novaId, rect),
      tagOpen: pop?.novaId === s.novaId,
    };
  };
  const passes = (s) => (kindFilter === 'all' || (s.category || 'personal') === kindFilter);
  const allMine = [];
  const mineDays = [];
  for (const d of days || []) {
    const entries = d.sections.filter(isHis).filter(passes).map((s) => mineEntry(s, d.date));
    entries.forEach((e) => allMine.push({ ...e, date: d.date }));
    const shown = entries.filter((e) => tagFilter === 'all' || e.tag === tagFilter);
    if (shown.length) mineDays.push({ date: d.date, entries: shown.sort((a, b) => (a.time < b.time ? -1 : 1)) });
  }
  const todayMine = mineDays.find((d) => d.date === today)?.entries || [];
  const pastMine = mineDays.filter((d) => d.date !== today).map((d) => ({
    key: d.date, label: dayLabel(d.date), date: d.date,
    dots: d.entries.slice(0, 8).map((e) => e.tagMeta.hue), extra: Math.max(0, d.entries.length - 8),
    count: d.entries.length, entries: d.entries, week: daysAgo(d.date, today) < 7,
    open: st.journalOpenDate === d.date, toggle: () => app.toggleJournalDay(d.date),
  }));
  // the week by tag, in one bar
  const ribbon = { own: 0, life: 0, deep: 0 };
  allMine.filter((e) => daysAgo(e.date, today) < 7).forEach((e) => { ribbon[e.tag] += 1; });

  // ---------------------------------------------------------------- the log
  const logToday = [];
  const logPast = [];
  for (const d of days || []) {
    const rows = d.sections.filter((s) => !isHis(s)).filter(passes)
      .filter((s) => who === 'all' || s.author === who)
      .map((s) => ({ key: `${d.date}-${s.time}-${s.heading || ''}-${s.author}`, time: s.time, author: s.author, who: (AUTHORS[s.author] || AUTHORS.unknown).label, hue: (AUTHORS[s.author] || AUTHORS.unknown).hue, label: s.heading ? s.heading.replace(/\[\[([^\]]+)\]\]/g, '$1') : null, text: s.text }))
      .sort((a, b) => (a.time < b.time ? -1 : 1));
    if (d.date === today) logToday.push(...rows);
    else if (rows.length) logPast.push({ key: d.date, label: dayLabel(d.date), date: d.date, beads: rows, dots: rows.slice(0, 8).map((r) => r.hue), extra: Math.max(0, rows.length - 8), open: st.journalOpenDate === d.date, toggle: () => app.toggleJournalDay(d.date) });
  }
  const logTodayCount = (days || []).find((d) => d.date === today)?.sections.filter((s) => !isHis(s)).length || 0;
  const whoName = who === 'all' ? null : (AUTHORS[who]?.label || who);

  // ---------------------------------------------------------------- the sheet
  const p = st.journalPick;
  const picker = p ? {
    open: !!p.open,
    index: p.index,
    setIndex: (i) => app.setJournalPickIndex(i),
    close: () => app.closeJournalPicker(),
    fromHome: !!p.fromHome,
    cards: ['deep', 'review', 'life'].map((k) => {
      const c = p.cards[k];
      const meta = c.meta || {};
      const lit = meta.sources || (k === 'life' && demo ? DEMO_LIFE_SOURCES : null);
      return {
        kind: k, ...KIND[k],
        status: c.status, prompt: c.prompt, error: c.error,
        demo: !!meta.demo,
        from: k === 'deep' ? 'Stands alone; reads nothing of your schedule.'
          : k === 'review' ? (meta.concept ? { lead: "From today's Daily review: ", bold: meta.concept, tail: meta.demo ? ' (demo concept)' : '' } : null)
            : meta.from ? `${meta.from}${meta.demo ? ' (demo)' : ''}${lit && lit.money === false && meta.source !== 'money' ? '' : ''}` : null,
        sources: k === 'life' && lit ? SRC.map(([key, label]) => ({ key, label, lit: meta.source === key, gone: lit[key] === false })) : null,
        used: p.used.includes(k),
        toggleUse: () => app.journalToggleUse(k),
        another: () => app.journalAnother(k),
        retry: () => app.journalAnother(k),
      };
    }),
    chosen: p.used.length,
    write: () => app.journalWrite(),
  } : null;

  // ---------------------------------------------------------------- composer
  const step = st.journalStep;
  const cur = step ? step.queue[step.i] : null;
  const composer = {
    text: st.journalComposerText,
    setText: (e) => app.setJournalComposerText(e),
    save: () => app.submitJournalEntry(),
    canSave: !!st.journalComposerText.trim() && !st.journalSaveBusy,
    busy: !!st.journalSaveBusy,
    error: st.journalSaveError,
    saveLabel: cur && step.i + 1 < step.queue.length ? 'Save, next' : 'Save',
    step: cur ? { n: step.queue.length > 1 ? `${step.i + 1} of ${step.queue.length}` : KIND[cur.kind].label, tag: TAGS[cur.tag], prompt: cur.prompt, from: cur.from, cancel: () => app.cancelJournalStep() } : null,
    ask: () => app.openJournalPicker(),
    dateLabel: longDay(today),
  };

  // the Daily review written on today: Home keeps its row, with a check
  const reviewWritten = allMine.some((e) => e.date === today && e.promptFrom === 'review');

  const filtered = kindFilter !== 'all' || tagFilter !== 'all' || who !== 'all';
  return {
    demo,
    glass: st.novaStyle === 'summary' ? 'nv-sum-card' : 'nv-pane',
    loaded,
    empty: loaded && allMine.length === 0,
    view: st.journalView === 'log' ? 'log' : 'mine',
    setView: (v) => app.setJournalView(v),
    offline,
    notion: {
      state: notionState,
      error: ns?.error || null,
      connect: () => app.connectNotion(),
      retry: () => app.retryNotionJournal(),
    },
    news: notionState === 'not-connected' && todayMine.length ? { lead: `${word(todayMine.length)} ${todayMine.length === 1 ? 'entry' : 'entries'} today,`, bold: 'saved in your vault.' } : mineNews(todayMine),
    composer,
    ribbon,
    today: todayMine,
    week: pastMine.filter((d) => d.week),
    earlier: pastMine.filter((d) => !d.week),
    tags: TAGS,
    tagPop: pop ? { ...pop, set: (t) => app.retagJournalEntry(pop.novaId, t), close: () => app.closeJournalTagPop(), current: allMine.find((e) => e.novaId === pop.novaId)?.tag } : null,
    log: {
      count: logTodayCount,
      news: whoName ? { lead: 'Showing ', bold: `${whoName === 'Coach' || whoName === 'Leader' ? 'the ' : ''}${whoName}`, tail: `: ${lower(logToday.length)} ${logToday.length === 1 ? 'entry' : 'entries'} today.` }
        : { lead: 'Nova and the agents wrote ', bold: logTodayCount ? `${lower(logTodayCount)} ${logTodayCount === 1 ? 'time' : 'times'} today.` : 'nothing yet today.', tail: '' },
      today: logToday,
      past: logPast,
    },
    filter: {
      open: !!st.journalFilterOpen,
      toggle: () => app.toggleJournalFilter(),
      close: () => app.toggleJournalFilter(false),
      active: filtered,
      showAll: () => app.clearJournalFilters(),
      label: [tagFilter !== 'all' && TAGS[tagFilter]?.label, whoName, kindFilter !== 'all' && kindFilter].filter(Boolean).join(', '),
      tag: ['all', 'own', 'life', 'deep'].map((t) => ({ key: t, label: t === 'all' ? 'All' : TAGS[t].label, hue: t === 'all' ? 'var(--nv-ink50)' : TAGS[t].hue, sel: tagFilter === t, go: () => app.setJournalTagFilter(t) })),
      who: ['all', 'nova', 'coach', 'leader', 'guardian', 'cfo'].map((w) => ({ key: w, label: w === 'all' ? 'Everyone' : AUTHORS[w].label, hue: w === 'all' ? 'var(--nv-ink50)' : AUTHORS[w].hue, sel: who === w, go: () => app.setJournalWho(w) })),
      kind: ['all', 'personal', 'training', 'system'].map((k) => ({ key: k, label: k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1), sel: kindFilter === k, go: () => app.setState({ journalFilter: k }) })),
    },
    picker,
    reviewWritten,
    openFromReview: () => app.openJournalFromReview(),
  };
}
