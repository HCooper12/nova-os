import { digestPending, subjectOf } from '../inboxDigest.js';
import { isCoachSuggestion, buildSuggestion } from '../coachSuggestions.js';
import { ROUTE_META } from './valsInbox.js';
import {
  dayGroups, clockLabel, subjectCards, digestLine, deeperState, agoLabel, reportParts,
  railMarks, sentenceCase,
} from '../inboxSummaryFacts.js';

// THE SUMMARY INBOX'S VIEW MODEL (27 Sep 2026, design/mockups/60-redesign-
// inbox-r2.html, his pick: "Inbox is looking great with enhanced features.
// Ensure that all the features … are present."). Spread LAST in renderVals,
// after valsIndex, because it reads the merged view model: the Inbox's own
// rows (valsInbox mkItem), its loops, ladder and proposals, and Train's
// routines for the Coach cards. Null under every style but `summary`, so
// cupertino and command never see a field of it.
//
// It computes nothing the other builders already did. It reshapes: the pile
// into one card at a time with its subjects, the history into days, the
// loops into rows. Every verb calls an existing app method; the one new
// write in the whole redesign is Look deeper (App.startInboxDeeper → POST
// /api/inbox/:id/deeper), and it files nothing.

// Seen, without a button: one write per record, ever (autoSeenDue's rule,
// in the screen). The set survives re-renders; the server's seenAt survives
// reloads, and a seen card is never marked again.
const autoSeenOnce = new Set();

const TRAIN_ROUTES = new Set(['routine-edit', 'schedule-edit', 'progression-tune', 'exercise-remap', 'injury-log', 'goal-target', 'training-block', 'exercise-resource', 'coach-learning']);
const TRAIN_KINDS = new Set(['coach', 'coach-program', 'coach-audit', 'training-check', 'weekly-debrief', 'coach-review', 'exercise-research', 'paper']);
const PRACTICE_KINDS = new Set(['practice-skill', 'practice-session', 'practice-status']);
const REPORT_KINDS = new Set(['research', 'coach-review', 'plan', 'program', 'briefing']);
const GLYPH_BY_ROUTE = {
  journal: 'book', todo: 'todo', shopping: 'bag', stash: 'link', calendar: 'cal', reminder: 'cal',
  food: 'fork', recipe: 'fork', expense: 'coin', 'money-import': 'coin', 'agent-mode': 'steps',
};
const MODE_SHORT = { 'review-all': 'Review all', 'auto-high': 'Auto high', 'auto-all': 'Auto all' };
const MODE_HINT = {
  'review-all': 'Nova drafts every filing and you approve each one.',
  'auto-high': 'Sure things file themselves; doubts wait for you.',
  'auto-all': 'Nova files everything; history and Undo keep the receipts.',
};

// the first letter up, the rest as written (a status line can carry a name)
const cap1 = (s) => { const t = String(s || '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };

// A tile: the route's domain hue only where the domain owns one (Train,
// Journal, Practice), the vault ink otherwise, a dashed "?" for a route the
// table does not name (finding 3), red for an error.
function tileOf(r) {
  if (!r) return { tone: 'vault', glyph: 'doc' };
  if (r.status === 'error') return { tone: 'err', glyph: 'bang' };
  const route = r.decision?.route;
  if (PRACTICE_KINDS.has(r.kind)) return { tone: 'practice', glyph: 'practice' };
  if (r.kind === 'model-choice') return { tone: 'vault', glyph: 'chip' };
  if (r.kind === 'video') return { tone: 'vault', glyph: 'play' };
  if (r.kind === 'read-next') return { tone: 'vault', glyph: 'books' };
  if (TRAIN_ROUTES.has(route) || TRAIN_KINDS.has(r.kind)) return { tone: 'train', glyph: 'dumbbell' };
  if (r.kind === 'followup') return { tone: 'journal', glyph: 'cal' };
  if (route === 'journal' || r.kind === 'review' || r.kind === 'dispatch') return { tone: 'journal', glyph: 'book' };
  if (REPORT_KINDS.has(r.kind)) return { tone: 'vault', glyph: 'doc' };
  if (route && !ROUTE_META[route]) return { tone: 'none', glyph: 'q' };
  if (!r.decision && r.status !== 'pending' && r.status !== 'classifying') return { tone: 'none', glyph: 'q' };
  return { tone: 'vault', glyph: GLYPH_BY_ROUTE[route] || 'doc' };
}

function kindLabelOf(r, item) {
  if (!r) return '';
  if (r.kind === 'model-choice') return 'Model choice';
  if (r.kind === 'research') return 'Research brief';
  if (PRACTICE_KINDS.has(r.kind)) return sentenceCase(ROUTE_META[r.kind]?.label);
  const route = r.decision?.route;
  if (route && ROUTE_META[route]) return sentenceCase(ROUTE_META[route].label);
  if (route) return 'A route Nova does not name';
  return sentenceCase(item?.source || '');
}

// Where approving lands it, in his words. Only what the payload says.
function destinationOf(r) {
  const route = r?.decision?.route;
  const p = r?.decision?.payload || {};
  if (PRACTICE_KINDS.has(r?.kind)) return 'Practice';
  if (r?.kind === 'model-choice') return `This week's ${String(p.lane || 'run').replace(/-/g, ' ')}, once you pick`;
  switch (route) {
    case 'routine-edit': return p.routineName ? `${p.routineName}, your program` : 'Your program';
    case 'schedule-edit': return 'Your training week';
    case 'progression-tune': return p.exerciseName ? `${p.exerciseName}'s progression` : 'Your progression';
    case 'exercise-remap': return 'Your exercise library';
    case 'journal': return 'Your journal';
    case 'todo': return 'Your to-do list';
    case 'shopping': return 'Your shopping list';
    case 'note': return 'A note in your vault';
    case 'watch-note': return 'A source note and its transcript';
    case 'idea': return 'Your ideas';
    case 'idea-outline': return 'An outline in your vault';
    case 'calendar': return p.calendarName ? `${p.calendarName}, your calendar` : 'Your calendar';
    case 'food': return "Today's food log";
    case 'expense': case 'money-import': return 'Your ledger';
    case 'recipe': return 'Your recipe bank';
    case 'stash': return p.category ? `Your stash · ${p.category}` : 'Your stash';
    case 'reminder': return 'Apple Reminders';
    case 'plan-note': return 'Your week plan';
    case 'agent-mode': return 'The trust ladder';
    case 'profile': return 'About you';
    case 'skill-backlog': return 'Skill ideas';
    case 'distill-apply': case 'ingest-apply': return 'Your vault';
    default: return route ? 'A route Nova does not name' : '';
  }
}

// "WHY PASS? — THE COACH LEARNS FROM THIS" → "Why pass?" / "The Coach learns from this."
function whyHead(title) {
  const [q, rest] = String(title || '').split(/\s+—\s+/);
  const fix = (s) => sentenceCase(s).replace(/\bcoach\b/g, 'Coach');
  return { q: fix(q), rest: rest ? `${fix(rest)}.` : '' };
}

// the Coach deck's verb on the tick: "Yes, swap it"
function yesLabel(headline) {
  const verb = String(headline || '').split(/\s+/)[0].toLowerCase();
  return ['swap', 'add', 'drop', 'move', 'start', 'log', 'count'].includes(verb) ? `Yes, ${verb} it` : 'Yes';
}

export function valsInboxSummary(app, ctx, v) {
  const st = app.state;
  if (st.novaStyle !== 'summary') return { inboxSummary: null, openCaptureSheet: null };

  const now = Date.now();
  const raw = st.liveInbox?.items || [];
  const byId = new Map(raw.map((r) => [r.id, r]));
  const kids = new Map();
  for (const r of raw) {
    if (!r.parentId) continue;
    if (!kids.has(r.parentId)) kids.set(r.parentId, []);
    kids.get(r.parentId).push(r);
  }
  const pendingAll = v.inboxPending || [];
  const historyAll = v.inboxHistory || [];
  const itemById = new Map([...pendingAll, ...historyAll].map((i) => [i.id, i]));
  const connected = !!v.inboxConnected;

  // ------------------------------------------------------------ capture --
  const landed = v.inboxLanded || { today: 0, filedToday: 0, recent: [] };
  const capture = {
    open: !!st.captureSheetOpen,
    close: (then) => app.closeCaptureSheet(then),
    connected,
    offline: !!v.isOffline,
    text: v.inboxInput || '',
    setText: (t) => v.setInboxInput(t),
    busy: !!v.inboxCaptureBusy,
    submit: (source, text) => v.submitInboxCapture(source, text),
    placeholder: connected ? 'Anything: "buy tomatoes", "ate a protein bar", "idea: the drone-shot open"' : 'Connect a backend in Settings to capture',
    landed: {
      line: landed.today > 0 ? `${landed.today} today · ${landed.filedToday} filed` : 'Nothing yet today; the most recent',
      rows: (landed.recent || []).map((h) => ({
        id: h.id, title: h.title, status: h.status, analysed: !!h.analysed,
        where: h.status === 'filed' ? (h.destination || 'Filed') : h.status === 'error' ? 'Failed' : 'Left alone',
        // the sheet closes first (its history entry goes), then the row opens
        open: () => app.closeCaptureSheet(() => h.open && h.open()),
      })),
    },
  };

  const onInbox = st.screen === 'inbox';
  const onOps = st.screen === 'ops';
  if (!onInbox && !onOps) {
    return { openCaptureSheet: () => app.openCaptureSheet(), inboxSummary: { capture } };
  }

  // ----------------------------------------------------------- the pile --
  // A report asked for with Look deeper rides its card while the card waits;
  // it is not a second card in the deck.
  const pendingIds = new Set(pendingAll.map((i) => i.id));
  const folded = pendingAll.filter((i) => { const p = byId.get(i.id)?.parentId; return p && pendingIds.has(p); });
  const foldedIds = new Set(folded.map((i) => i.id));
  const deck = pendingAll.filter((i) => !foldedIds.has(i.id));
  const digest = digestPending(deck);

  const decidedIds = (st.inboxSumDecided || []).filter((id) => !pendingIds.has(id));
  const setReceipt = (ids, verdict, title) => app.setState((s) => ({
    inboxSumReceipt: { ids, verdict, title, at: Date.now() },
    inboxSumDecided: [...new Set([...(s.inboxSumDecided || []), ...ids])],
  }));

  // ------------------------------------------------------------ a card --
  const routines = st.liveWorkoutRoutines || [];
  const routinesLoaded = Array.isArray(st.liveWorkoutRoutines) && st.liveWorkoutRoutines.length > 0;
  const schedule = st.liveWorkoutSchedule || {};
  const buildCard = (item) => {
    if (!item) return null;
    const r = byId.get(item.id) || { id: item.id, status: item.status };
    const sug = isCoachSuggestion(r) ? buildSuggestion(r, { routines, schedule, now }) : null;
    // "no longer in your program" is only true once the program has loaded;
    // before that a Coach card keeps its tick rather than claim a loss
    const stale = routinesLoaded ? (sug?.stale || null) : null;
    const tile = tileOf(r);
    const kindLabel = kindLabelOf(r, item);
    const sentence = sug?.headline || item.tldr?.line || item.title || '';
    const who = sentenceCase(item.source);
    const whoPhrase = who === 'Typed' ? 'You typed it' : who === 'Voice' ? 'You said it' : who ? `From ${who === 'Coach' || who === 'Nova' ? who : `the ${who.toLowerCase()}`}` : '';
    const where = sug?.routine
      ? `${sug.routine.name}${sug.routine.days?.length ? ` · ${sug.routine.days.join(', ')}` : ''}`
      : item.isModelChoice ? sentenceCase(item.modelChoiceLabel || 'Scheduled run') : whoPhrase;
    const approveWhat = item.approveLine ? item.approveLine.replace(/^\s*approve\s*=\s*/i, '') : '';
    const dest = destinationOf(r);
    const change = sug
      ? { kind: 'diff', diff: sug.diff, sets: sug.sets, stale }
      : item.isModelChoice || !item.route ? null
        : { kind: 'route', from: who || 'You', to: kindLabel, tone: tile.tone, low: item.confidence === 'low' };
    const willLines = [
      dest || null,
      sug ? (sug.sets ? `${sug.sets.before} → ${sug.sets.after} sets` : sug.routine ? 'The set count stays the same' : null)
        : (approveWhat ? cap1(approveWhat) : item.previewShort || null),
    ].filter(Boolean);
    const willFull = [approveWhat ? `Approving will ${approveWhat.replace(/^\w/, (c) => c.toLowerCase())}` : '', item.full || ''].filter(Boolean).join('\n\n');

    const approveRun = () => { if (item.busy) return; setReceipt([item.id], 'approve', sentence); item.approve(); };
    const keepRun = () => { if (item.busy) return; setReceipt([item.id], 'keep', sentence); item.pickSonnet?.(); };
    const opusRun = () => { if (item.busy) return; setReceipt([item.id], 'opus', sentence); item.pickOpus?.(); };
    // an ask-why kind opens its reasons first (valsInbox decides which), and
    // its receipt comes with the answer, so the last receipt and its Undo stay
    const discardRun = () => { if (item.busy) return; if (!item.asksWhy) setReceipt([item.id], 'discard', sentence); item.discard(); };

    // TALK ABOUT IT: the kind's own door where it has one (Practice and a
    // briefing open where they live), Coach's own conversation for a Coach
    // change (the Train deck's Discuss), otherwise a conversation with Nova
    // that starts from this card. A model choice's second answer sits here.
    const talk = item.isModelChoice
      ? { label: 'Opus, deeper', run: opusRun, open: false, plain: true }
      : item.openPractice ? { label: 'Open', run: item.openPractice, open: true }
        : item.openBriefing ? { label: 'Open', run: item.openBriefing, open: true }
          : sug ? { label: 'Talk about it', run: () => { app.navigate('workouts'); app.discussCoachSuggestion(item.id); }, open: false }
            : { label: 'Talk about it', open: false, run: () => app.talkAboutInbox(`Talk me through this card in my Inbox: “${sentence}”.${approveWhat ? ` Approving it would ${approveWhat.replace(/^\w/, (c) => c.toLowerCase()).replace(/\.$/, '')}.` : ''} Why is it here, and what would you do?`) };

    // LOOK DEEPER. A video's deeper look is the Deep weave and a read-next's
    // is Research the books: both research jobs already, moved to this slot
    // under their own names. Everything else sends the Researcher after this
    // card's own question, and the report grows here.
    const ds0 = deeperState(kids.get(item.id) || [], now);
    const stoppedAt = (st.inboxDeeperStopped || {})[item.id];
    const ds = ds0.state === 'running' && stoppedAt && Date.parse(ds0.startedAt || '') <= stoppedAt ? { ...ds0, state: 'stopped' } : ds0;
    const deeper = item.isModelChoice ? null
      : item.deepAnalyse ? { mode: 'door', label: 'Deep weave', start: item.deepAnalyse, state: 'none' }
        : item.researchBooks ? { mode: 'door', label: 'Research the books', start: item.researchBooks, state: 'none' }
          : {
            mode: 'report', label: 'Look deeper', ...ds,
            busy: !!(st.inboxDeeperBusy || {})[item.id],
            when: ds.askedAt ? agoLabel(ds.askedAt, now) : '',
            start: () => app.startInboxDeeper(item.id),
            stop: () => app.stopInboxDeeper(item.id),
            openReport: () => app.openDeeperReport(item.id),
          };

    const why = item.askingWhy ? whyHead(item.whyTitle) : null;
    return {
      id: item.id,
      tile, kindLabel, where, when: item.time, sentence,
      low: item.confidence === 'low',
      tldr: item.tldr?.items?.length ? { items: item.tldr.items.slice(0, 3), more: (item.tldr.more || 0) + Math.max(0, item.tldr.items.length - 3) } : null,
      change,
      captured: item.captured && item.captured !== sentence ? item.captured : '',
      // his words where they are his; an agent's product says what started it
      capturedLabel: !r.source || ['voice', 'text', 'telegram', 'shortcut', 'typed'].includes(r.source) ? 'You captured' : 'What started it',
      will: { label: item.isModelChoice ? 'What it runs' : REPORT_KINDS.has(r.kind) ? 'Will be kept' : 'Will be filed', lines: willLines, full: willFull },
      // the reason, else (a Coach card) where the change came from
      reason: sug?.why || item.reason || sug?.source || '',
      stale,
      adjustments: item.adjustments || null,
      error: item.error || null,
      busy: !!item.busy,
      leaving: item.leaving || null,
      seen: !!item.seen,
      // seen, without a button: three seconds on top, once (the screen times it)
      markSeen: () => {
        if (item.seen || autoSeenOnce.has(item.id) || !connected) return;
        autoSeenOnce.add(item.id);
        app.inboxSeen(item.id, true);
      },
      verbs: {
        yes: stale ? null : item.isModelChoice
          ? { label: `Keep ${item.keepLabel || 'the usual model'}`, aria: `Keep ${item.keepLabel || 'the usual model'} for ${sentence}`, run: keepRun }
          : { label: sug ? yesLabel(sentence) : REPORT_KINDS.has(r.kind) ? 'Keep it' : 'File it', aria: `${item.approveLabel}: ${sentence}`, run: approveRun },
        talk,
        no: { label: item.isModelChoice ? 'Skip this week' : stale ? 'Clear it' : 'Discard', run: discardRun },
      },
      ask: why ? {
        q: why.q, rest: why.rest, chips: item.whyChips || [], text: item.whyText || '', onText: item.onWhyText,
        submit: (reason) => { setReceipt([item.id], 'discard', sentence); item.submitWhy(reason); },
        cancel: item.cancelWhy,
      } : null,
      deeper,
      // right files (never a model choice: that needs his pick), left passes
      swipe: { right: item.isModelChoice || stale ? null : approveRun, left: discardRun },
    };
  };

  // --------------------------------------------------------- the subjects --
  const subjects = subjectCards(digest).map((s) => ({
    key: s.key, name: s.name, count: s.count, fileable: s.fileable, keep: s.keep,
    // the dot wears the subject's domain hue, as its cards' tiles do
    tone: s.key === 'routine' ? 'vault' : tileOf(byId.get(s.members[0]?.id)).tone,
    aria: s.keep ? `Keep the usual model for all ${s.fileable}` : `File all ${s.fileable} from ${s.name}`,
    open: () => app.setState({ inboxSumFocus: s.key }),
    all: s.fileable > 0 ? () => {
      setReceipt(s.runnable.map((m) => m.id), s.keep ? 'keep' : 'approve', `${s.fileable} from ${s.name}`);
      s.runnable.forEach((m) => (s.keep ? m.pickSonnet() : m.approve()));
    } : null,
    busy: s.members.some((m) => m.busy),
  }));
  const focusKey = st.inboxSumFocus || null;
  const focusMembers = focusKey === 'routine' ? (digest?.routine || [])
    : focusKey ? deck.filter((i) => `s:${subjectOf(i)}` === focusKey) : [];
  const focusOn = !!(focusKey && focusMembers.length);
  const shown = focusOn ? focusMembers : deck;
  const card = onInbox ? buildCard(shown[0]) : null;
  const rail = focusOn ? railMarks(0, shown.length) : railMarks(decidedIds.length, deck.length);

  // ---------------------------------------------------------- the receipt --
  const rc = st.inboxSumReceipt;
  const receipt = (() => {
    if (!rc || !Array.isArray(rc.ids) || !rc.ids.length) return null;
    const recs = rc.ids.map((id) => byId.get(id)).filter(Boolean);
    if (!recs.length) return null;
    if (recs.some((r) => r.status === 'pending' && !r.pendingLocally)) {
      // an ask-why that was cancelled, or an answer that failed and came back
      return null;
    }
    const one = recs.length === 1 ? recs[0] : null;
    const it = one ? itemById.get(one.id) : null;
    const settled = recs.every((r) => !r.pendingLocally);
    const sub = `${rc.title || ''}${rc.title ? ' · ' : ''}${agoLabel(new Date(rc.at).toISOString(), now)}`;
    if (!settled) return { at: rc.at, tone: 'busy', title: rc.verdict === 'discard' ? 'Discarding…' : 'Filing…', sub, undo: null };
    if (one && one.status === 'filed') {
      return { at: rc.at, tone: 'filed', title: `Filed to ${one.destination || kindLabelOf(one, it) || 'your vault'}`, sub, undo: it?.canUndo ? { run: it.undo, busy: !!it.busy } : null };
    }
    if (one && one.status === 'undone') return { at: rc.at, tone: 'undone', title: 'Undone', sub: one.undoSummary || sub, undo: null };
    if (one && one.status === 'discarded') return { at: rc.at, tone: 'discard', title: 'Discarded', sub, undo: null };
    if (one && one.status === 'error') return { at: rc.at, tone: 'discard', title: 'That did not file', sub: one.error || sub, undo: null };
    if (one && one.status === 'classifying') return { at: rc.at, tone: 'filed', title: rc.verdict === 'opus' ? 'Running on Opus' : 'Running on the usual model', sub, undo: null };
    const filed = recs.filter((r) => r.status === 'filed').length;
    return { at: rc.at, tone: 'filed', title: `Filed ${filed} of ${recs.length}`, sub: `${sub} · each can be undone in Filed`, undo: null };
  })();

  // -------------------------------------------------------------- Filed --
  const limit = st.inboxSumFiledLimit || 25;
  const rowsShown = historyAll.slice(0, limit);
  const older = historyAll.length - rowsShown.length;
  const filedAll = historyAll.filter((h) => h.status === 'filed');
  const noUndo = filedAll.filter((h) => !h.canUndo).length;
  const STATUS_WORD = { discarded: 'Discarded', undone: 'Undone', withdrawn: 'Taken back', classifying: 'Routing…' };
  const filedRow = (h) => {
    const r = byId.get(h.id) || { id: h.id, status: h.status };
    const onRecord = h.status === 'filed';
    const detailLine = h.status === 'filed' ? (h.destination ? `${h.auto ? 'Filed by Nova' : 'You approved it'} → ${h.destination}` : (h.auto ? 'Filed by Nova' : 'You approved it'))
      : h.status === 'undone' ? (h.undoSummary || 'Reverted')
        : h.status === 'error' ? (h.error || 'It could not be routed')
          : h.status === 'classifying' ? 'Nova is routing this…'
            : h.status === 'discarded' ? 'Discarded without writing'
              : h.status === 'withdrawn' ? 'Coach took this back before you answered' : '';
    return {
      id: h.id, time: clockLabel(h.at), title: h.title, at: h.at,
      tile: tileOf(r), kindLabel: kindLabelOf(r, h),
      tick: onRecord && tileOf(r).tone !== 'none',
      dim: ['discarded', 'undone', 'withdrawn'].includes(h.status),
      action: h.canUndo ? { label: 'Undo', run: h.undo, busy: !!h.busy }
        : h.canRetry ? { label: 'Retry', run: h.retry, busy: !!h.busy } : null,
      state: h.canUndo || h.canRetry ? '' : h.status === 'filed' ? 'no undo' : (STATUS_WORD[h.status] || (h.status === 'error' ? 'Error' : '')),
      expanded: !!h.expanded,
      toggle: h.toggleExpand,
      detail: {
        line: detailLine,
        captured: h.captured || '',
        full: h.full || '',
        fullLabel: h.status === 'filed' ? 'What was filed' : 'The filing',
        dismiss: h.canDiscard ? { run: h.discard, busy: !!h.busy } : null,
        weave: h.deepAnalyse && h.status === 'filed' ? { run: h.deepAnalyse, busy: !!h.busy } : null,
      },
    };
  };
  const filed = onInbox && (st.inboxSumTab || 'waiting') === 'filed' ? {
    count: historyAll.length,
    sub: older > 0 ? `the ${rowsShown.length} newest shown · ${older} older` : historyAll.length ? `all ${historyAll.length} shown` : '',
    honest: !filedAll.length ? '' : noUndo === 0
      ? 'Undo shows on every filing here: Nova kept what each one changed.'
      : `Undo shows where Nova kept what it changed. ${noUndo} filing${noUndo === 1 ? '' : 's'} kept nothing to undo; ${noUndo === 1 ? 'its row says' : 'their rows say'} no undo.`,
    groups: dayGroups(rowsShown.map(filedRow), new Date(now)),
    older,
    moreLabel: older > 0 ? `Show ${Math.min(100, older)} more · ${older} older` : '',
    showMore: () => app.setState({ inboxSumFiledLimit: limit + 100 }),
    empty: !connected ? 'Connect a backend in Settings. Captures write to your real vault.'
      : !v.inboxLoaded ? '' : 'Nothing captured yet. Hold Nova to drop your first thought.',
  } : null;

  // --------------------------------------------------------- the report --
  const reportFor = st.inboxDeeperReport || null;
  const report = onInbox && reportFor ? (() => {
    const parent = itemById.get(reportFor);
    const ds = deeperState(kids.get(reportFor) || [], now);
    const child = ds.state === 'ready' ? byId.get(ds.id) : null;
    const parts = child ? reportParts(child.decision?.payload?.body || '') : null;
    const parentCard = parent && parent.status === 'pending' ? buildCard(parent) : null;
    return {
      open: true,
      ready: !!child,
      title: ds.title || 'The report',
      meta: child ? `Report · ${parts.sources.length} source${parts.sources.length === 1 ? '' : 's'} · asked ${ds.askedAt ? agoLabel(ds.askedAt, now) : ''}`.trim() : '',
      onCard: parent ? (parentCard?.sentence || parent.title) : '',
      lead: parts?.lead || '',
      // the lead is drawn on its own, in the serif; the rest follow it
      blocks: parts ? parts.blocks.filter((b, i) => i !== parts.blocks.findIndex((x) => x.type === 'p')) : [],
      sources: (parts?.sources || []).map((s) => ({ ...s, open: s.url ? () => { try { window.open(s.url, '_blank', 'noopener'); } catch { /* no window */ } } : null })),
      verbs: parentCard ? parentCard.verbs : null,
      answered: parent && parent.status !== 'pending' ? 'You have answered this card.' : '',
      close: (then) => app.closeDeeperReport(then),
    };
  })() : null;

  // ------------------------------------------ Agents & Operations, on top --
  const dr = v.dailyReview || {};
  const drRaw = st.liveDailyReview;
  const drToday = drRaw?.today;
  const dispatch = st.liveDispatch;
  const proposalsRaw = v.inboxProposals || [];
  const dispatchProps = proposalsRaw.filter((p) => /^dispatch-/.test(p.key));
  const slotsPending = (v.dispatchSlots || []).filter((s) => dispatch?.today?.[s.slot]?.status === 'pending');
  const slotsFiled = (v.dispatchSlots || []).filter((s) => dispatch?.today?.[s.slot]?.status === 'filed');
  const slotName = (s) => sentenceCase(s.label).replace(/ (dispatch|debrief|review)$/, '');
  const todo = v.todoist || {};
  const tdRaw = st.liveTodoist;
  const g = v.guardian || {};
  const gAlerts = (st.liveGuardian?.lastReport?.checks || []).filter((c) => c.status === 'alert').length;
  const gWarns = (st.liveGuardian?.lastReport?.checks || []).filter((c) => c.status === 'warn').length;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const loops = [
    {
      // DISPLAY ONLY: the evening model read (server/lib/dailyReview.js) is
      // now shown as "Day read" (his decision, 11 Oct) — the Daily review
      // name belongs to the forgetting-curve card. The stored kind/label on
      // disk is untouched (journal.js, commitments.js, weeklyDebrief.js all
      // read it), so this loop's `key` stays 'review' on purpose.
      key: 'review', name: 'Day read', loading: !drRaw,
      dot: !drRaw ? 'idle' : drRaw.config?.mode === 'off' ? 'idle' : drToday?.status === 'pending' ? 'wait' : drToday?.status === 'error' ? 'alert' : drToday?.status === 'filed' ? 'ok' : 'idle',
      line: !drRaw ? '' : drRaw.config?.mode === 'off' ? 'Off'
        : !drToday ? `Composes at ${String(drRaw.config?.hour ?? 8).padStart(2, '0')}:00`
          : drToday.status === 'classifying' ? 'Reasoning across your day'
            : drToday.status === 'pending' ? 'Waiting for you in the Inbox'
              : drToday.status === 'filed' ? 'Filed to your journal'
                : drToday.status === 'error' ? 'Hit an error; run it again' : cap1(drToday.status),
      em: drToday?.status === 'pending',
      run: { label: dr.busy ? 'Reasoning…' : 'Run now', go: dr.run, busy: !!dr.busy },
    },
    {
      key: 'briefs', name: 'Briefs', loading: !dispatch,
      dot: !dispatch ? 'idle' : slotsPending.length || dispatchProps.length ? 'wait' : slotsFiled.length ? 'ok' : 'idle',
      line: !dispatch ? '' : dispatchProps.length ? `${plural(dispatchProps.length, 'proposal')} · ${slotsFiled.length ? `${slotsFiled.map(slotName).join(', ').toLowerCase()} filed` : 'three slots'}`
        : slotsPending.length ? `${slotsPending.length} waiting in the Inbox` : slotsFiled.length ? `${cap1(slotsFiled.map(slotName).join(', ').toLowerCase())} filed today` : 'Morning, evening and weekly',
      em: !!(dispatchProps.length || slotsPending.length),
      run: { label: 'Open', go: null, busy: false },
    },
    {
      key: 'compost', name: 'Compost', loading: !st.liveCompost,
      dot: !st.liveCompost ? 'idle' : (v.compostProposals || []).length ? 'wait' : 'ok',
      line: !st.liveCompost ? '' : (v.compostProposals || []).length ? `${(v.compostProposals || []).length} for you · weekly` : `Nothing to tidy · last pass ${v.compostLastRun}`,
      em: !!(v.compostProposals || []).length,
      run: { label: v.compostBusy ? 'Scanning…' : 'Run now', go: v.runCompostNow, busy: !!v.compostBusy },
    },
    {
      key: 'promises', name: 'Open promises', loading: !v.commitmentsLoaded,
      dot: !v.commitmentsLoaded ? 'idle' : (v.commitmentProposals || []).length ? 'wait' : 'ok',
      line: !v.commitmentsLoaded ? '' : (v.commitmentProposals || []).length ? `${(v.commitmentProposals || []).length} still open · fortnightly` : 'None left hanging · fortnightly',
      em: !!(v.commitmentProposals || []).length,
      run: { label: v.commitmentsBusy ? 'Scanning…' : 'Run now', go: v.runCommitmentsNow, busy: !!v.commitmentsBusy },
    },
    {
      key: 'todoist', name: 'Todoist', loading: !tdRaw,
      dot: !tdRaw ? 'idle' : !tdRaw.configured ? 'idle' : tdRaw.lastResult?.error ? 'alert' : 'ok',
      line: !tdRaw ? '' : !tdRaw.configured ? 'Not connected'
        : tdRaw.lastResult?.error ? 'The last pass hit an error'
          : tdRaw.lastSyncAt ? `${tdRaw.linkCount ?? 0} in step · last pass ${clockLabel(tdRaw.lastSyncAt)}` : 'Connected; the first pass is due',
      run: todo.configured ? { label: todo.busy ? 'Syncing…' : 'Sync now', go: todo.sync, busy: !!todo.busy } : null,
    },
    {
      key: 'mealprep', name: 'Meal prep', loading: false, dot: 'idle',
      line: 'Thursdays · same meals by design',
      run: { label: v.mealPrep?.busy ? 'Composing…' : 'Run now', go: v.mealPrep?.run, busy: !!v.mealPrep?.busy },
    },
    {
      key: 'guardian', name: 'Guardian', loading: false,
      dot: !g.loaded ? 'idle' : gAlerts || gWarns ? 'alert' : 'ok',
      line: !g.loaded ? 'No check run yet'
        : `${gAlerts ? plural(gAlerts, 'alert') : gWarns ? plural(gWarns, 'warning') : 'All clear'}${gAlerts && gWarns ? ` · ${plural(gWarns, 'warning')}` : ''} · ${g.checkedLabel}`,
      run: { label: g.busy ? 'Checking…' : 'Run checks', go: g.run, busy: !!g.busy },
    },
  ].map((l) => ({ ...l, open: () => app.setState({ inboxSumLoop: l.key }) }));

  const ladderProp = proposalsRaw.find((p) => /^inbox-auto-/.test(p.key));
  const ladderTarget = ladderProp ? (ladderProp.key.startsWith('inbox-auto-all') ? 'auto-all' : 'auto-high') : null;
  const activeMode = (v.inboxModes || []).find((m) => m.active);
  const proposalView = (p) => {
    const k = p.key || '';
    const kind = /^inbox-auto-/.test(k) ? { label: 'Filing ladder', glyph: 'steps' }
      : /^dispatch-/.test(k) ? { label: 'Briefs', glyph: 'loop' }
        : /^(rescue|streak-lapse)@/.test(k) ? { label: 'Training', glyph: 'dumbbell' }
          : /^followup@/.test(k) ? { label: 'Calendar', glyph: 'cal' }
            : /^compost-/.test(k) ? { label: 'Compost', glyph: 'loop' } : { label: 'Nova', glyph: 'loop' };
    return {
      key: k, ...kind,
      // the compost nudge points "below", where the loop's card sat on the
      // old page; here its proposals are in the Compost loop's sheet
      say: /^compost-/.test(k) ? String(p.text || '').replace(/\s*[—-]\s*worth a minute below\.?$/, '. They are in the Compost loop below.') : p.text,
      ladder: /^inbox-auto-/.test(k) && activeMode ? { from: MODE_SHORT[activeMode.value], to: MODE_SHORT[ladderTarget] } : null,
      accept: { label: p.acceptLabel || 'Accept', run: p.accept },
      alt: p.altLabel ? { label: p.altLabel, run: p.alt } : null,
      skip: p.skip,
      talk: () => app.talkAboutInbox(`Talk me through this proposal from Nova: “${p.text}” What would change if I accept it?`),
      // a Briefs proposal opens its loop, where it sits with the slots it
      // would change (mockup 60's note); any other opens on its own
      open: () => app.setState(/^dispatch-/.test(k) ? { inboxSumLoop: 'briefs' } : { inboxSumProposal: k }),
    };
  };
  const proposals = proposalsRaw.map(proposalView);
  const ops = {
    live: connected,
    waiting: {
      count: pendingAll.length,
      line: digestLine(digest, deck.length),
      open: () => app.navigate('inbox'),
    },
    proposals,
    proposalOpen: proposals.find((p) => p.key === st.inboxSumProposal) || null,
    closeProposal: () => app.setState({ inboxSumProposal: null }),
    loops,
    loopOpen: st.inboxSumLoop || null,
    closeLoop: () => app.setState({ inboxSumLoop: null }),
    // the loops' own controls, for their sheets: the objects valsInbox built
    controls: {
      review: { ...dr, status: cap1(String(dr.status || '').replace(/ below$/, ' in the Inbox').replace(/RUN NOW/, 'Run now')) },
      briefs: (v.dispatchSlots || []).map((s) => ({ ...s, name: slotName(s), status: cap1(String(s.status || '').replace(/ below$/, ' in the Inbox')) })),
      briefsBusy: !!v.dispatchBusy,
      briefsProposals: proposals.filter((p) => /^dispatch-/.test(p.key)),
      compost: { proposals: v.compostProposals || [], lastRun: v.compostLastRun, busy: !!v.compostBusy, run: v.runCompostNow },
      promises: { proposals: v.commitmentProposals || [], lastRun: v.commitmentsLastRun, busy: !!v.commitmentsBusy, run: v.runCommitmentsNow, loaded: !!v.commitmentsLoaded },
      todoist: todo,
      mealPrep: v.mealPrep || {},
      guardian: g,
    },
    ladder: {
      options: (v.inboxModes || []).map((m) => ({ value: m.value, label: MODE_SHORT[m.value] || m.label, active: !!m.active, next: m.value === ladderTarget, pick: m.pick })),
      hint: activeMode ? `${MODE_SHORT[activeMode.value]}: ${MODE_HINT[activeMode.value].replace(/^\w/, (c) => c.toLowerCase())}${ladderTarget ? ' The dashed step is the one Nova proposes above.' : ''}` : '',
    },
    dots: loops.map((l) => l.dot),
    summary: `${loops.length} loops${loops.some((l) => l.dot === 'alert') ? ` · ${plural(loops.filter((l) => l.dot === 'alert').length, 'alert')}` : ''}${proposals.length ? ` · ${plural(proposals.length, 'proposal')} wait there` : ''}`,
    openOps: () => app.navigate('ops'),
  };

  const tab = (st.inboxSumTab || 'waiting') === 'filed' ? 'filed' : 'waiting';
  return {
    openCaptureSheet: () => app.openCaptureSheet(),
    inboxSummary: {
      capture,
      ops,
      tab,
      setTab: (t) => app.setState({ inboxSumTab: t === 'filed' ? 'filed' : 'waiting' }),
      connected,
      offline: !!v.isOffline,
      loading: !v.inboxLoaded && connected && !v.isOffline,
      count: pendingAll.length,
      digestLine: [digestLine(digest, deck.length), folded.length ? `${plural(folded.length, 'report')} on ${folded.length === 1 ? 'its card' : 'their cards'}` : ''].filter(Boolean).join(' · '),
      rail,
      position: shown.length ? (focusOn ? `1 of ${shown.length}` : `${decidedIds.length + 1} of ${decidedIds.length + deck.length}`) : '',
      subjects: focusOn ? [] : subjects,
      focus: focusOn ? { name: subjects.find((s) => s.key === focusKey)?.name || '', count: shown.length, clear: () => app.setState({ inboxSumFocus: null }) } : null,
      card,
      ghosts: Math.max(0, Math.min(2, shown.length - 1)),
      receipt,
      filed,
      report,
      openCapture: () => app.openCaptureSheet(),
      // the batch is this visit's: the screen clears it when it mounts
      resetBatch: () => { if ((st.inboxSumDecided || []).length || st.inboxSumFocus) app.setState({ inboxSumDecided: [], inboxSumFocus: null }); },
    },
  };
}
