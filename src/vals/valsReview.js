import { NOTE_TYPE_COLOR } from './shared.js';
import { pickReviewItem } from '../reviewPick.js';
import { GAPS, nextStep, parseISO, shiftISO, localISO, demoReviewToday, demoScenarioFromUrl, DEMO_UNREVIEWED } from '../reviewDemo.js';

// THE DAILY REVIEW's view model (mockup 96, audit 27). ONE shape, read by the
// summary Moment, the grouped Group, the classic pane and the sheet. Demo
// mode runs this same code over a demo day shaped like the server's
// (src/reviewDemo.js), so nothing here branches on "is it demo" except the
// labels that say so.
//
// The answer is acted out in place: a tap records `reviewJust` at once (the
// grade and the page's step BEFORE the answer), so the card can show where
// the page went while the write is on its way, and holds that page on
// screen until he taps Next. The server's refresh then confirms it.

export const GRADE = {
  got: { label: 'Got it', hue: 'var(--nv-good)' },
  fuzzy: { label: 'Fuzzy', hue: 'var(--nv-gold)' },
  forgot: { label: 'Forgot', hue: 'var(--nv-warn)' },
  read: { label: 'Read', hue: 'var(--nv-vi)' },
};
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n) => WORDS[n] || String(n);

export const fmtDay = (iso) => parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
export const fmtShort = (iso) => parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtWeekday = (iso) => parseISO(iso).toLocaleDateString('en-GB', { weekday: 'long' });
const fmtDow = (iso) => parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short' });
export const gapWord = (n) => (n === 1 ? 'Tomorrow' : `${n} days`);
const hm = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null;
};

const kindWordFor = (src) => {
  if (src?.kind) return src.kind;
  if (!src?.url) return null;
  try {
    const host = new URL(src.url).hostname.replace(/^www\./, '');
    if (/youtube\.|youtu\.be/.test(host)) return 'video';
    if (/spotify\.|podcasts\.apple|overcast\./.test(host)) return 'podcast';
    return host;
  } catch { return null; }
};
function timeToSeconds(t) {
  const parts = String(t || '').split(':').map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
// YouTube understands &t=; nothing else has a universal "play from", so
// anything else opens at the source, honestly, with the time written beside it
export function playFromUrl(url, time) {
  if (!url) return null;
  const secs = timeToSeconds(time);
  if (secs == null) return url;
  try {
    const u = new URL(url);
    if (/youtube\.com|youtu\.be/.test(u.hostname)) { u.searchParams.set('t', `${secs}s`); return u.toString(); }
  } catch { /* the bare url */ }
  return url;
}

export function buildReview(app, ctx) {
  const st = app.state;
  const demo = !!ctx.demoMode && !st.liveNotes;
  const scenario = demo ? demoScenarioFromUrl() : null;
  const todayISO = localISO();
  const today = demo
    ? demoReviewToday({ today: todayISO, answers: st.reviewDemoAnswers || {}, scenario })
    : (st.liveNotes ? st.liveReviewToday : null);
  const live = !!st.liveNotes;
  const dayISO = today?.date || todayISO;
  const items = Array.isArray(today?.items) ? today.items : [];
  const just = st.reviewJust || null;

  const item = (demo || live) ? pickReviewItem({ items, drawnExtra: st.reviewDrawnExtra, openId: st.reviewOpenId }) : null;
  const offline = demo ? scenario === 'offline' : (live && st.connectionStatus === 'offline');

  // the honest states, each its own value
  const allAnswered = items.length > 0 && items.every((i) => i.answered);
  const state = (!demo && !live) ? 'mac-unreachable'
    : today == null ? (offline ? 'mac-unreachable' : 'loading')
    : st.reviewSpin ? 'all-done'
    : (today.total === 0 && !st.reviewDrawnExtra) ? 'nothing-due'
    : (allAnswered && !just && !st.reviewDrawnExtra) ? 'all-done'
    : item ? 'card' : 'loading';

  const answeredJust = just && item && just.id === item.id ? just : null;
  const doneCount = (today?.doneCount || 0) + (answeredJust && !item.answered ? 1 : 0);
  const total = today?.total || 0;
  const curIndex = item ? items.findIndex((i) => i.id === item.id) : -1;
  const pips = total ? { total, done: Math.min(doneCount, total), cur: state === 'card' && !answeredJust ? curIndex : -1 } : null;

  // the page's answers before today's (today's is drawn as the new stretch)
  const pastHistory = (item?.history || []).filter((h) => !(answeredJust && h.date === dayISO));
  const stepBefore = answeredJust ? answeredJust.step : (item?.step || 0);
  const dueBefore = answeredJust ? answeredJust.due : item?.due;

  const result = answeredJust ? (() => {
    const step = nextStep(answeredJust.step, answeredJust.grade);
    const gap = GAPS[step];
    const due = shiftISO(dayISO, gap);
    return { grade: answeredJust.grade, label: GRADE[answeredJust.grade]?.label || answeredJust.grade, hue: GRADE[answeredJust.grade]?.hue, gap, due, dueLabel: fmtDay(due) };
  })() : null;

  const isLast = items.length > 0 && items.filter((i) => !i.answered && i.id !== item?.id).length === 0;
  const canWrite = !offline && state === 'card';

  const answer = (grade) => {
    if (!item || !canWrite || answeredJust) return;
    app.answerReview(item, grade, { step: stepBefore, due: dueBefore });
  };

  const n = pastHistory.length;
  const kicker = !item ? null
    : n === 0 ? { isNew: true, text: 'first look' }
    : { isNew: false, text: `Review ${n + 1} · last seen ${fmtDay(pastHistory[n - 1].date)}` };

  const src = item?.source || null;
  const source = src ? {
    title: src.title,
    ep: src.ep || '',
    kind: kindWordFor(src),
    time: src.time || null,
    extra: src.extra || 0,
    href: src.url ? playFromUrl(src.url, src.time) : null,
    canPlay: !!src.time,
    open: () => {
      if (src.url) { window.open(playFromUrl(src.url, src.time), '_blank', 'noopener'); return; }
      app.toastMsg(item.demo ? 'Demo source: there is nothing to play' : 'The source page has no link to open');
    },
  } : null;

  const connected = (item?.connected || []).map((c) => {
    const type = (c.type || '').toLowerCase();
    return {
      id: c.id, title: c.title, kind: type || 'page',
      color: NOTE_TYPE_COLOR[type] || 'var(--nv-ink60)',
      go: () => (item.demo ? app.toastMsg('Demo note: connect the Mac to open real pages') : app.selectNote(c.id)),
    };
  });

  const lastSeen = n ? `Seen ${n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`}, first ${fmtShort(pastHistory[0].date)}` : 'Not seen yet';

  // the done state: the week ahead by pages due, and the next day named
  const ahead = (today?.ahead || []).map((a) => ({ key: a.date, label: fmtDow(a.date), count: a.count }));
  const nextAhead = (today?.ahead || []).find((a) => a.count > 0);
  const doneLine = total
    ? `${total === 1 ? 'Today’s page is reviewed.' : `All ${word(total)} reviewed.`}${nextAhead ? ` Next, ${word(nextAhead.count)} on ${fmtWeekday(nextAhead.date)}.` : today?.nextDue?.date ? ` Next on ${fmtDay(today.nextDue.date)}.` : ''}`
    : 'Today’s reviews are done.';
  const nd = today?.nextDue;
  const nothingDueLine = `Nothing due today${nd?.date ? ` · next ${fmtDay(nd.date)}, ${nd.count} ${nd.count === 1 ? 'page' : 'pages'}` : ''}`;

  const syncAt = demo ? '07:12' : hm(st.lastSyncAt);

  const detail = item?.demo
    ? { paragraphs: item.note || [] }
    : item ? (st.liveNoteDetails?.[item.id] === undefined ? null : st.liveNoteDetails[item.id]) : null;
  const gistLoading = item && !item.demo && !item.gist && st.liveReviewSummaries?.[item.id] == null;

  const review = {
    state,
    demo,
    offline: offline ? { syncAt, line: syncAt ? `From the ${syncAt} sync. Your answer needs the Mac; read it now and answer when Nova is back.` : 'Your answer needs the Mac; read it now and answer when Nova is back.' } : null,
    pips,
    id: item?.id || null,
    title: item?.title || '',
    typeColor: item ? (NOTE_TYPE_COLOR[(item.type || '').toLowerCase()] || 'var(--nv-ink)') : 'var(--nv-ink)',
    kicker,
    firstLook: !!kicker?.isNew,
    gist: item ? (item.gist || st.liveReviewSummaries?.[item.id] || null) : null,
    gistLoading: !!gistLoading,
    source,
    connected,
    linkCount: item?.linkCount ?? connected.length,
    curve: item ? { today: dayISO, history: pastHistory, step: stepBefore, due: dueBefore, result } : null,
    curveLeft: lastSeen,
    curveRight: result ? { lead: 'Next', date: result.dueLabel } : { lead: '', date: dueBefore && dueBefore < dayISO ? `Due since ${fmtShort(dueBefore)}` : 'Due today' },
    grades: ['got', 'fuzzy', 'forgot'].map((g) => {
      const gap = GAPS[nextStep(stepBefore, g)];
      return {
        key: g, label: GRADE[g].label, hue: GRADE[g].hue, gapWord: gapWord(gap),
        aria: `${GRADE[g].label}: back ${gapWord(gap).toLowerCase()}`,
        go: () => answer(g),
        disabled: !canWrite,
        selected: result?.grade === g,
        dimmed: !!result && result.grade !== g,
      };
    }),
    result,
    isLast,
    // before answering: Next counts as read (his call, 11 Oct) and moves on
    readNext: canWrite && !answeredJust ? () => answer('read') : null,
    readNextAria: `Next: counts as read, back in ${gapWord(GAPS[nextStep(stepBefore, 'read')]).toLowerCase()}`,
    // after answering: Next only moves on (Done on the last)
    next: () => app.reviewNext(),
    // WRITE ON IT (mockup 95): the Journal opens with the Daily review prompt
    // chosen; once he has written on today's review the row keeps its place
    // with a check (his call)
    writeAboutIt: () => app.openJournalFromReview(),
    writtenToday: (() => {
      const days = demo ? app.journalDemoDays() : (st.liveJournalEntries || []);
      const d = days.find((x) => x.date === todayISO);
      return !!d && d.sections.some((sec) => sec.author === 'hayden' && sec.promptFrom === 'review');
    })(),
    open: item ? () => app.openReviewSheet() : () => {},
    done: {
      line: doneLine,
      week: ahead,
      weekMax: Math.max(1, ...ahead.map((a) => a.count)),
      drawEarly: state === 'all-done' && !offline ? () => app.drawReviewEarly(demo) : null,
      drawBusy: !!st.reviewDrawBusy,
      spin: st.reviewSpin ? { rows: st.reviewSpin.rows, landed: () => app.finishReviewSpin() } : null,
    },
    nothingDueLine,
    sheetOpen: !!st.reviewSheetOpen && !!item,
    closeSheet: () => app.closeReviewSheet(),
    warmDetail: item && !item.demo ? () => app.ensureNoteDetail(item.id) : () => {},
    sheetDetail: detail,
    openInNotes: item && !item.demo ? () => { app.closeReviewSheet(); app.selectNote(item.id); app.navigate('notes'); } : null,
    history: (item?.history || []).slice().reverse().map((h, i, arr) => {
      // where each answer sent the page: replay up to it
      const upto = arr.slice(i).reverse();
      let s = 0;
      for (const x of upto) s = nextStep(s, x.grade);
      return { key: `${h.date}-${h.grade}-${i}`, grade: h.grade, label: GRADE[h.grade]?.label || h.grade, hue: GRADE[h.grade]?.hue || 'var(--nv-ink60)', date: h.date === dayISO ? 'Today' : fmtDay(h.date), where: gapWord(GAPS[s]).toLowerCase() };
    }),
  };

  // the flat fields older surfaces (Notes, the Index row, the fold line) read
  const legacy = {
    reviewConcept: state === 'card' ? (review.gist || review.title) : state === 'nothing-due' ? 'Nothing due today' : state === 'all-done' ? review.done.line : '',
    reviewFrom: state === 'card' ? review.title : '',
  };
  return { review, reviewPage: item ? { id: item.id, title: item.title } : null, legacy, unreviewed: DEMO_UNREVIEWED };
}
