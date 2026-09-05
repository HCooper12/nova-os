// Nova Inbox domain: the capture composer, filing-mode trust ladder, pending
// approvals, history with undo, and the "proposed rule" nudge (Nova notices
// from real history when a mode change has earned itself and proposes it —
// you Accept or Skip; it never changes its own autonomy).
// Adds to ctx: inboxPendingCount (sidebar badge).
import { dtf } from './fmt.js';
import { clampWords } from '../textClamp.js';

// WHO MADE THIS. Was a 24-branch ternary ending in 'TYPED', so any kind it
// didn't name was silently attributed to HIM — the program review, the
// program audit, read-next and every Forge job all showed as "TYPED", as
// though he'd written them himself. A map can be read at a glance and
// audited by a test; a ternary chain cannot.
const SOURCE_LABEL = {
  review: 'DAILY REVIEW', dispatch: 'DISPATCH', compost: 'COMPOST', guardian: 'GUARDIAN',
  cfo: 'CFO', 'money-import': 'CFO', 'meal-prep': 'MEAL PREP', 'food-suggestion': 'NUTRITION',
  calendar: 'SCHEDULE', 'training-check': 'TRAINING', 'week-plan': 'COMMANDER',
  'plan-today': 'PLANNER', pattern: 'SCOUT', autonomy: 'TRUST LADDER', distill: 'DISTILLER', ingest: 'VAULT INGEST',
  coach: 'COACH', 'weekly-debrief': 'COACH', research: 'RESEARCHER', video: 'WATCHER',
  'model-choice': 'MODEL CHOICE', 'brain-week': 'BRAIN WEEK', followup: 'CALENDAR',
  studio: 'STUDIO', 'fuel-cross': 'FUEL × TRAINING', study: 'STUDY',
  // the four that fell through to TYPED
  'coach-program': 'PROGRAM REVIEW', 'coach-audit': 'PROGRAM AUDIT',
  'read-next': 'LIBRARIAN', 'forge-job': 'FORGE',
  scout: 'SCOUT · PEOPLE', 'leader-reflect': 'LEADER',
};

const ROUTE_META = {
  shopping: { label: 'SHOPPING', hue: '95,232,168' },
  journal: { label: 'JOURNAL', hue: '143,123,255' },
  todo: { label: 'TO-DO', hue: '89,230,255' },
  note: { label: 'NOTE', hue: '224,178,106' },
  food: { label: 'FOOD LOG', hue: '255,122,217' },
  expense: { label: 'EXPENSE', hue: '224,178,106' },
  'money-import': { label: 'LEDGER IMPORT', hue: '224,178,106' },
  idea: { label: 'IDEA', hue: '143,123,255' },
  'idea-outline': { label: 'OUTLINE', hue: '143,123,255' },
  // an iCloud write must never wear a NOTE badge — name what approving does
  calendar: { label: 'CALENDAR', hue: '89,230,255' },
  'plan-note': { label: 'WEEK PLAN', hue: '224,178,106' },
  recipe: { label: 'RECIPE BANK', hue: '95,232,168' },
  stash: { label: 'STASH', hue: '224,178,106' },
  'routine-edit': { label: 'TRAIN EDIT', hue: '89,230,255' },
  'progression-tune': { label: 'COACH TUNE', hue: '224,178,106' },
  'exercise-remap': { label: 'RE-FILED', hue: '89,230,255' },
  reminder: { label: 'REMINDER', hue: '89,230,255' },
  'skill-backlog': { label: 'SKILL IDEA', hue: '224,178,106' },
  'agent-mode': { label: 'TRUST LADDER', hue: '89,230,255' },
  profile: { label: 'ABOUT YOU', hue: '143,123,255' },
  'distill-apply': { label: 'DISTILL', hue: '95,232,168' },
  // the deep weave's receipt — approving already happened in the review UI; this badge is its undo handle
  'ingest-apply': { label: 'VAULT INGEST', hue: '224,178,106' },
  // approving writes TWO files — the badge says so
  'watch-note': { label: 'SOURCE + TRANSCRIPT', hue: '224,178,106' },
};

// THE MODEL CHOICE GATE, scheduled-lane half — Pattern Scout/Distill's own
// weekly cron raises this instead of running, and it just needs a model tap
// (server/lib/modelChoice.js). No route/confidence badge fits a decision
// that files nothing itself, so it gets its own tiny meta table instead of
// ROUTE_META.
const MODEL_CHOICE_LANE_LABEL = { 'pattern-scout': 'PATTERN SCOUT', distill: 'DISTILL' };

// THESE ARE BOTH CALLERS AND CLICK HANDLERS, and that broke them silently.
//
// Called from the palette they get a string; wired straight to onClick they
// get a MouseEvent — which is not nullish, so `text ?? st.inboxInput` kept
// the EVENT and `.trim()` threw before a single request was made. RESEARCH,
// WATCH and WATCH + ANALYSE therefore did nothing at all when clicked, with
// no error he could see: he pressed the button and the app sat there.
// Reproduced in a real browser before fixing —
// "TypeError: (text ?? st.inboxInput).trim is not a function".
const asText = (v) => (typeof v === 'string' ? v : undefined);

const MODE_LADDER = [
  { value: 'review-all', label: 'Review everything', hint: 'Nova drafts the filing — you approve every one' },
  { value: 'auto-high', label: 'Auto-file high confidence', hint: 'sure things file themselves; doubts wait for you' },
  { value: 'auto-all', label: 'Auto-file everything', hint: 'full autonomy — history and undo keep the receipts' },
];

function payloadPreview(decision) {
  if (!decision) return '';
  // the gate question already renders as item.reason — a preview line would
  // just repeat it (or, without this branch, print an empty " — ")
  if (decision.route === 'model-choice') return '';
  const p = decision.payload || {};
  // an item's amount and its provenance ride the preview — "~1.2kg Chicken breast", "Greek yoghurt (off-plan regular ×4)"
  if (decision.route === 'shopping') return (p.items || []).map((i) => `${i.amount ? `${i.amount} ` : ''}${i.name}${i.source ? ` (${i.source})` : ''}`).join(' · ');
  if (decision.route === 'todo') return (p.items || []).map((it) => (typeof it === 'string' ? it : `${it.text}${it.category ? ` #${it.category}` : ''}`)).join(' · ');
  if (decision.route === 'food') {
    if (p.slot) return `Mark today's ${p.slot} eaten — the planned meal, its real macros`;
    const m = p.macros || {};
    return `${p.name} — ${m.p}P · ${m.c}C · ${m.f}F · ${m.kcal} kcal`;
  }
  if (decision.route === 'journal') return p.text || '';
  if (decision.route === 'reminder') return `"${p.text}" — ${p.whenISO ? new Date(p.whenISO).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`;
  if (decision.route === 'stash') return `${p.name} → ${p.category}${p.note ? ' — ' + p.note : ''}`;
  if (decision.route === 'routine-edit') return `${p.action === 'swap' ? `${p.removeName} → ${p.addName}` : p.action === 'add' ? `+ ${p.addName}` : p.action === 'remove' ? `− ${p.removeName}` : `${p.removeName} targets`} in ${p.routineName}${p.reason ? ' — ' + p.reason : ''}`;
  if (decision.route === 'agent-mode') return `${p.target}: ${p.from} → ${p.to}`;
  if (decision.route === 'profile') return p.summary || '';
  if (decision.route === 'distill-apply' || decision.route === 'ingest-apply') return `${(p.paths || []).length} files: ${(p.paths || []).slice(0, 3).join(', ')}${(p.paths || []).length > 3 ? '…' : ''}`;
  if (decision.route === 'progression-tune') return `${p.exerciseName}: ${[p.hold ? 'hold progressions' : null, p.stepKg != null ? `step ${p.stepKg}kg` : null, p.repStep != null ? `+${p.repStep} rep` : null, p.focus ? `focus — ${p.focus}` : null].filter(Boolean).join(', ')}${p.reason ? ' — ' + p.reason : ''}`;
  if (decision.route === 'idea') return `${p.title} — ${p.hook} (${p.format})`;
  if (decision.route === 'idea-outline') return (p.text || '').slice(0, 200);
  if (decision.route === 'expense') return `${p.merchant} ${p.amount < 0 ? '−' : '+'}$${Math.abs(p.amount).toFixed(2)}${p.category ? ` · ${p.category}` : ''}`;
  if (decision.route === 'money-import') {
    const list = p.transactions || [];
    const shown = list.slice(0, 4).map((t) => `${t.merchant} ${t.amount < 0 ? '−' : '+'}$${Math.abs(t.amount).toFixed(2)}`).join(' · ');
    return list.length > 4 ? `${shown} · +${list.length - 4} more` : shown;
  }
  if (decision.route === 'calendar') {
    const when = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    if (p.action === 'move') return `${p.label}: ${when(p.oldStart)} → ${when(p.newStart)}`;
    if (p.action === 'delete') return `remove ${p.label} (${when(p.startISO)})`;
    return `${p.title} — ${when(p.start)}${p.calendarName ? ` · ${p.calendarName}` : ''}`;
  }
  if (decision.route === 'recipe') {
    const m = p.macros || {};
    return `${p.name} — ${m.p}P · ${m.c}C · ${m.f}F · ${m.kcal} kcal → ${p.category || 'recipe bank'}`;
  }
  return `${p.title || ''} — ${p.body || ''}`;
}

// The FULL filing, for the tap-to-expand view — what approving will actually
// write, uncompressed. Routes whose preview already carries everything fall
// back to it; the text-bearing routes get their whole payload.
function fullPayload(decision) {
  if (!decision) return '';
  const p = decision.payload || {};
  const route = decision.route;
  if (route === 'journal') return [p.text, p.label && `— filed under ${p.category || 'personal'} · ${p.label}`].filter(Boolean).join('\n');
  if (route === 'note' || route === 'watch-note') return [p.title, p.body].filter(Boolean).join('\n\n');
  if (route === 'idea-outline') return p.text || '';
  if (route === 'idea') return [p.title, p.hook, p.format ? `format: ${p.format}` : null].filter(Boolean).join('\n');
  if (route === 'todo') return (p.items || []).map((it) => (typeof it === 'string' ? `• ${it}` : `• ${it.text}${it.category ? `  #${it.category}` : ''}`)).join('\n');
  if (route === 'shopping') return (p.items || []).map((i) => `• ${i.amount ? `${i.amount} ` : ''}${i.name}${i.category ? `  (${i.category})` : ''}${i.source ? `  — ${i.source}` : ''}`).join('\n');
  if (route === 'preference') return p.rule || '';
  if (route === 'stash') return [p.name, p.url, p.category && `→ ${p.category}`, p.note].filter(Boolean).join('\n');
  return payloadPreview(decision);
}

const PREVIEW_CLAMP = 220;

// Memoized per ISO string: this runs for EVERY history record on EVERY
// render (up to ~400), and the un-cached toLocaleDateString inside it was
// 10.7ms/render on real data — most of the app's entire render cost (see
// fmt.js). The label only changes when the calendar day rolls over, so the
// cache carries a day stamp and empties itself at midnight.
const timeLabelCache = new Map();
let timeLabelDay = '';
function timeLabel(iso) {
  if (!iso) return '';
  const today = new Date().toDateString();
  if (today !== timeLabelDay) { timeLabelCache.clear(); timeLabelDay = today; }
  const hit = timeLabelCache.get(iso);
  if (hit !== undefined) return hit;
  const d = new Date(iso);
  const sameDay = d.toDateString() === today;
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const out = sameDay ? hm : dtf('en-GB', { day: '2-digit', month: 'short' }).format(d) + ' ' + hm;
  timeLabelCache.set(iso, out);
  return out;
}

// The generalized proposal engine — every nudge is grounded in real history,
// names its evidence, and only ever PROPOSES; you accept or skip. One
// computation covers the inbox trust ladder, the dispatch ladder, and the
// compost loop. Each proposal carries a stable key so a skip sticks until
// the underlying evidence changes.
function computeProposals(app, st, items, dispatch, compost) {
  const out = [];
  const mode = st.inboxMode;
  const captures = items.filter((r) => !r.kind); // plain captures only
  const resolved = captures.filter((r) => ['filed', 'discarded', 'undone'].includes(r.status));

  // inbox ladder: promote after a clean approval streak
  if (mode === 'auto-high') {
    const reviewed = resolved.filter((r) => r.auto === false || r.status === 'discarded');
    const recent = reviewed.slice(0, 8);
    if (recent.length >= 8 && recent.every((r) => r.status === 'filed' && r.auto === false)) {
      out.push({
        key: `inbox-auto-all@${recent[0].id}`,
        text: `You've approved Nova's last ${recent.length} review calls without changing a thing — let it file everything on its own?`,
        acceptLabel: 'Accept',
        accept: () => { app.setInboxMode('auto-all'); app.toastMsg('Rule updated — Nova now auto-files everything'); },
      });
    }
  }
  // inbox ladder: step back after an undo streak
  if (mode === 'auto-all') {
    const autoFiled = resolved.filter((r) => r.auto === true).slice(0, 10);
    const undone = autoFiled.filter((r) => r.status === 'undone').length;
    if (autoFiled.length >= 5 && undone >= 2) {
      out.push({
        key: `inbox-auto-high@${autoFiled[0].id}`,
        text: `${undone} of Nova's last ${autoFiled.length} auto-filings had to be undone — step back to reviewing the uncertain ones?`,
        acceptLabel: 'Accept',
        accept: () => { app.setInboxMode('auto-high'); app.toastMsg('Rule updated — uncertain captures wait for you again'); },
      });
    }
  }

  // dispatch ladder, per slot: promote to auto after an approval streak,
  // propose pausing after a discard streak
  for (const slot of ['morning', 'evening', 'weekly']) {
    if (dispatch?.config?.[slot]?.mode !== 'draft') continue;
    const name = slot === 'evening' ? 'evening debriefs' : slot === 'weekly' ? 'weekly reviews' : 'morning dispatches';
    const recent = items
      .filter((r) => r.kind === 'dispatch' && (r.slot || 'morning') === slot && ['filed', 'discarded', 'undone'].includes(r.status))
      .slice(0, 3);
    if (recent.length >= 3 && recent.every((r) => r.status === 'filed' && r.auto === false)) {
      out.push({
        key: `dispatch-${slot}-auto@${recent[0].id}`,
        text: `You've approved the last ${recent.length} ${name} as drafted — let them file straight into the journal?`,
        acceptLabel: 'Accept',
        accept: () => app.setDispatchConfig(slot, { mode: 'auto' }),
      });
    }
    if (recent.length >= 3 && recent.every((r) => r.status === 'discarded')) {
      out.push({
        key: `dispatch-${slot}-off@${recent[0].id}`,
        text: `The last ${recent.length} ${name} were discarded unread — pause the loop?`,
        acceptLabel: 'Pause it',
        accept: () => app.setDispatchConfig(slot, { mode: 'off' }),
      });
    }
  }

  // Coach's evening training nudges — one at most. Priority: today's
  // scheduled session went unlogged (rescue); otherwise a LAPSED streak
  // (momentum that stopped on rest-adjacent days). Nudge only — accepting
  // opens Train; a skip holds for tonight and re-arms tomorrow.
  const training = dispatch?.training;
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (now.getHours() >= 18 && training && !training.loggedToday) {
    if (training.scheduledName) {
      out.push({
        key: `rescue@${dayKey}`,
        text: `${training.scheduledName} was on today's schedule and nothing's logged yet — a shortened session still counts.`,
        acceptLabel: 'Open Train',
        accept: () => { app.navigate('workouts'); app.dismissInboxProposal(`rescue@${dayKey}`); },
      });
    } else {
      const lastDate = st.liveStreaks?.lastWorkoutDate;
      const daysSince = lastDate ? Math.round((new Date(dayKey) - new Date(lastDate)) / 86400000) : null;
      if (daysSince != null && daysSince >= 3 && daysSince <= 7) {
        out.push({
          key: `streak-lapse@${dayKey}`,
          text: `No session in ${daysSince} days (last: ${lastDate}) — momentum is easier kept than rebuilt. A Quick Session fits any window.`,
          acceptLabel: 'Open Train',
          accept: () => { app.navigate('workouts'); app.dismissInboxProposal(`streak-lapse@${dayKey}`); },
        });
      }
    }
  }

  // Calendar follow-ups — task-like events get an evening "did it happen?"
  // (Hayden: "I don't always follow my calendar exactly"). Done files a
  // journal receipt; Move to To-Do carries it forward; Skip lets it go.
  const TASK_HINTS = ['meal prep', 'prep', 'cook', 'clean', 'laundry', 'groceries', 'grocery', 'shopping', 'errand', 'organise', 'organize', 'admin', 'wash', 'tidy', 'pick up', 'drop off', 'book ', 'call ', 'pay ', 'renew', 'study', 'review notes'];
  if (now.getHours() >= 18 && Array.isArray(st.liveCalendar)) {
    // a follow-up record for the event — answered, dismissed, or the server's
    // own pending question (lib/followUps.js) — means the live proposal
    // stands down: the record on the Inbox list is the one question
    const answeredToday = new Set(
      items.filter((r) => r.kind === 'followup' && r.createdAt && new Date(r.createdAt).toDateString() === now.toDateString())
        .map((r) => (r.decision?.payload?.eventLabel || (r.text || '').replace(/^✓ /, '').replace(/^Did “(.*)” happen\??$/, '$1')).toLowerCase()),
    );
    const openTodos = new Set((st.liveTodos?.items || []).filter((t) => !t.checked).map((t) => t.text.toLowerCase()));
    for (const ev of st.liveCalendar) {
      const label = (ev.label || '').trim();
      if (!label) continue;
      const lower = ` ${label.toLowerCase()} `;
      if (!TASK_HINTS.some((h) => lower.includes(h))) continue;
      if (answeredToday.has(label.toLowerCase()) || openTodos.has(label.toLowerCase())) continue;
      const key = `followup@${dayKey}@${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      out.push({
        key,
        text: `“${label}” was on today's calendar${ev.time ? ` at ${ev.time}` : ''} — did it actually happen?`,
        acceptLabel: 'Done ✓',
        accept: () => app.answerFollowupDone(label, ev.time || '', key),
        altLabel: 'Move to To-Do',
        alt: () => app.moveFollowupToTodo(label, key),
      });
    }
  }

  // compost: proposals sitting unactioned for over a week deserve one nudge
  const openCompost = (compost?.proposals || []).filter((p) => p.status === 'open');
  if (openCompost.length) {
    const oldest = openCompost.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    if (Date.now() - new Date(oldest.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000) {
      out.push({
        key: `compost-waiting@${oldest.id}`,
        text: `${openCompost.length} compost proposal${openCompost.length === 1 ? ' has' : 's have'} been waiting over a week — worth a minute below.`,
        acceptLabel: 'Fair',
        accept: () => app.dismissInboxProposal(`compost-waiting@${oldest.id}`),
      });
    }
  }

  return out;
}

export function valsInbox(app, ctx) {
  const st = app.state;
  const { demoMode, isOffline } = ctx;

  const inbox = st.liveInbox;
  const items = inbox?.items || [];
  const pendingCount = inbox ? items.filter((r) => r.status === 'pending').length : 0;

  Object.assign(ctx, { inboxPendingCount: pendingCount });

  const mkItem = (r) => {
    const full = fullPayload(r.decision);
    const preview = payloadPreview(r.decision);
    const expanded = !!(st.inboxExpanded || {})[r.id];
    return {
    id: r.id,
    kind: r.kind || null,
    text: r.text,
    time: timeLabel(r.createdAt),
    // tap-to-expand: collapsed shows a clamped preview; expanded shows what
    // he actually captured AND exactly what approving will file
    expanded,
    canExpand: !!(full || r.text),
    full,
    captured: r.text || '',
    previewShort: preview.length > PREVIEW_CLAMP ? `${preview.slice(0, PREVIEW_CLAMP)}…` : preview,
    toggleExpand: () => app.toggleInboxExpand(r.id),
    source: SOURCE_LABEL[r.kind] || (r.source === 'voice' ? 'VOICE' : 'TYPED'),
    status: r.status,
    route: r.decision ? (ROUTE_META[r.decision.route] || ROUTE_META.note) : null,
    confidence: r.decision?.confidence || null,
    reason: r.decision?.reason || '',
    // a daily review's 1–3 adjustments as markable rows — done / not today
    // write onto the record (POST /inbox/:id/priority dispatches by kind) and
    // tomorrow's review quotes the marks; shown while the review is live
    adjustments: r.kind === 'review' && Array.isArray(r.decision?.payload?.adjustments) && r.decision.payload.adjustments.length && ['pending', 'filed'].includes(r.status)
      ? r.decision.payload.adjustments.map((a, i) => ({
        text: a.do, why: a.why || '', outcome: a.outcome || null,
        mark: (o) => app.setPlanOutcome(r.id, i, a.outcome === o ? null : o),
      }))
      : null,
    // a bare slice(0, 60) cut mid-word and left no ellipsis, so a clipped
    // title read as a rendering fault rather than a clamp (his report, 4 Sep)
    title: r.decision?.title || clampWords(r.text, 60),
    preview: payloadPreview(r.decision),
    destination: r.destination || null,
    auto: !!r.auto,
    error: r.error || null,
    undoSummary: r.undoSummary || null,
    busy: !!st.inboxActionBusy[r.id],
    canUndo: r.status === 'filed' && !!r.undoData,
    canDiscard: r.status === 'error', // errored records need an exit — they used to be unkillable
    // retry only where the record still carries its full input: a capture's
    // text, a research question, or a video URL. Scheduled drafts re-run on
    // their own.
    canRetry: r.status === 'error' && (!r.kind || r.kind === 'research' || r.kind === 'video' || r.kind === 'study'),
    approve: () => app.inboxAction(r.id, 'approve'),
    // Declining COACH advice asks why — the reason rides the record so the
    // Coach learns from it (and never re-asks). Everything else discards
    // in one tap, same as always.
    ...(() => {
      const COACH_ADVICE = new Set(['progression-tune', 'routine-edit', 'injury-log', 'goal-target', 'training-block']);
      const isAdvice = COACH_ADVICE.has(r.decision?.route) || r.kind === 'fuel-cross';
      // A training check's dismiss is one of four realities, each consumed on
      // the server (server/lib/trainingCheck.js TRAINING_CHECK_REASONS — the
      // same four strings; a shared format).
      const isTrainingCheck = r.kind === 'training-check';
      // A discarded review is the loudest feedback the flagship gets — ask
      // why once; tomorrow's review reads the reason (dailyReview.js
      // yesterday-review section).
      const isReview = r.kind === 'review';
      // a declined day plan steers tomorrow's planner (planToday.js
      // yesterday-plan section quotes the reason)
      const isPlan = r.kind === 'plan-today';
      const asking = st.inboxAskWhy === r.id;
      return {
        discard: () => (isAdvice || isTrainingCheck || isReview || isPlan ? app.setState({ inboxAskWhy: r.id, inboxWhyText: '' }) : app.inboxAction(r.id, 'discard')),
        askingWhy: asking,
        whyTitle: isTrainingCheck ? 'WHAT HAPPENED? — ONE TAP KEEPS THE RECORD STRAIGHT'
          : isReview ? "WHY PASS? — TOMORROW'S REVIEW READS THIS"
            : isPlan ? "WHY PASS? — TOMORROW'S PLAN READS THIS"
              : 'WHY PASS? — THE COACH LEARNS FROM THIS',
        whyChips: asking
          ? (isTrainingCheck
            ? ["Didn't happen", 'Swapped for active rest', 'Doing it tonight', 'Logged elsewhere']
            : isReview
              ? ['Off-base', 'Already knew', 'Not actionable', 'Too busy today']
              : isPlan
                ? ['Too ambitious', 'Wrong focus', 'Already planned', 'Not today']
                : ['Not now', 'Too aggressive', 'No equipment for it', 'I disagree — my call'])
          : null,
        whyText: asking ? (st.inboxWhyText || '') : '',
        onWhyText: (e) => app.setState({ inboxWhyText: typeof e === 'string' ? e : e.target.value }),
        submitWhy: (reason) => { app.setState({ inboxAskWhy: null, inboxWhyText: '' }); app.inboxAction(r.id, 'discard', (reason || st.inboxWhyText || '').trim() || undefined); },
        cancelWhy: () => app.setState({ inboxAskWhy: null, inboxWhyText: '' }),
      };
    })(),
    undo: () => app.inboxAction(r.id, 'undo'),
    retry: () => app.inboxAction(r.id, 'retry'),
    // a watched video can always go deeper — the full concept weave, from
    // the pending question or after it's filed
    // the Librarian's gap → the Researcher, one tap: the accepted read-next
    // names a concept; the best-regarded books on it are a research brief
    // away, and from that brief the Library's add-book flow is one step
    researchBooks: r.kind === 'read-next' && r.meta?.concept && ['pending', 'filed'].includes(r.status)
      ? () => app.startResearch(`The best-regarded books on ${r.meta.concept} — which one should someone with a strong training and self-improvement bent read first, and why? Cite each recommendation.`)
      : null,
    deepAnalyse: r.kind === 'video' && r.decision?.payload?.url && ['pending', 'filed'].includes(r.status)
      ? () => app.startVideoDeepIngest(r.decision.payload.url)
      : null,
    // THE MODEL CHOICE GATE, scheduled-lane half — this card doesn't file
    // anything of its own, so it swaps the usual approve/discard for a model
    // tap (discard still works normally underneath — it's the generic
    // "skip this week" path, unchanged).
    isModelChoice: r.kind === 'model-choice',
    modelChoiceLabel: r.kind === 'model-choice' ? (MODEL_CHOICE_LANE_LABEL[r.decision?.payload?.lane] || r.decision?.payload?.lane) : null,
    pickOpus: r.kind === 'model-choice' ? () => app.pickModelChoice(r.id, 'opus') : null,
    pickSonnet: r.kind === 'model-choice' ? () => app.pickModelChoice(r.id, 'sonnet') : null,
    };
  };

  // MEMOIZED on input identity: building ~300 rich item objects (payload
  // previews, closures, time labels) cost ~4ms on EVERY render — including
  // every keystroke in an unrelated composer, because renderVals computes
  // all domains. The mapping only actually changes when one of these five
  // state slices changes identity (plus the day, for timeLabel's today/date
  // split), so everything else reuses the previous arrays untouched. The
  // closures stay valid across reuse: they capture `app` (stable) and `r`
  // (owned by st.liveInbox, part of the key).
  const itemsKey = [items, st.inboxExpanded, st.inboxActionBusy, st.inboxAskWhy, st.inboxWhyText, new Date().toDateString()];
  let mapped = app._inboxItemsMemo;
  if (!mapped || mapped.key.length !== itemsKey.length || mapped.key.some((k, i) => k !== itemsKey[i])) {
    mapped = {
      key: itemsKey,
      pending: items.filter((r) => r.status === 'pending').map(mkItem),
      history: items.filter((r) => r.status !== 'pending').map(mkItem),
    };
    app._inboxItemsMemo = mapped;
  }
  const pendingItems = mapped.pending;
  const historyItems = mapped.history;

  // proposed rules (video-2 trust ladder: Nova proposes, you ratify) — the
  // generalized engine covers inbox, dispatch, and compost nudges
  const dismissed = new Set(st.inboxProposalDismissed);
  const inboxProposals = (!demoMode && inbox ? computeProposals(app, st, items, st.liveDispatch, st.liveCompost) : [])
    .filter((p) => !dismissed.has(p.key))
    .map((p) => ({ ...p, skip: () => app.dismissInboxProposal(p.key) }));

  // loops — daily brief controls, one row per slot
  const dispatch = st.liveDispatch;
  const SLOT_META = {
    morning: { label: 'MORNING DISPATCH', noun: 'dispatch', scope: 'today', defaultHour: 7, hourOptions: [5, 6, 7, 8, 9, 10] },
    evening: { label: 'EVENING DEBRIEF', noun: 'debrief', scope: 'today', defaultHour: 21, hourOptions: [19, 20, 21, 22] },
    weekly: { label: 'WEEKLY REVIEW', noun: 'review', scope: 'this week', defaultHour: 17, hourOptions: [15, 16, 17, 18, 19, 20] },
  };
  const slotStatus = (slot) => {
    const t = dispatch?.today?.[slot];
    const { noun, scope } = SLOT_META[slot];
    if (!t) return slot === 'weekly' ? 'no review yet this week — composes Sundays' : `no ${noun} yet today`;
    if (t.status === 'pending') return `${scope}'s ${noun} is waiting for review below`;
    if (t.status === 'filed') return `${scope}'s ${noun} is filed`;
    if (t.status === 'discarded') return `${scope}'s ${noun} was discarded`;
    if (t.status === 'undone') return `${scope}'s ${noun} was undone`;
    return `${scope}'s ${noun}: ${t.status}`;
  };
  const dispatchSlots = ['morning', 'evening', 'weekly'].map((slot) => ({
    slot,
    label: SLOT_META[slot].label,
    modes: ['off', 'draft', 'auto'].map((m) => ({
      value: m,
      label: m === 'off' ? 'Off' : m === 'draft' ? 'Draft' : 'Auto',
      active: dispatch?.config?.[slot]?.mode === m,
      pick: () => app.setDispatchConfig(slot, { mode: m }),
    })),
    hour: dispatch?.config?.[slot]?.hour ?? SLOT_META[slot].defaultHour,
    hourOptions: SLOT_META[slot].hourOptions,
    setHour: (e) => app.setDispatchConfig(slot, { hour: Number(e.target.value) }),
    status: slotStatus(slot),
    run: () => app.runDispatchNow(slot),
  }));

  // loops — compost proposals
  const compost = st.liveCompost;
  const COMPOST_BADGE = {
    'stale-capture': { label: 'STALE CAPTURE', hue: '224,178,106' },
    'orphan': { label: 'ORPHAN NOTE', hue: '143,123,255' },
    'sweep-todos': { label: 'SWEEP', hue: '89,230,255' },
  };
  const compostProposals = (compost?.proposals || [])
    .filter((p) => p.status === 'open')
    .map((p) => ({
      id: p.id,
      badge: COMPOST_BADGE[p.type] || { label: p.type.toUpperCase(), hue: '232,236,246' },
      title: p.title,
      detail: p.detail,
      actionable: p.type !== 'orphan',
      busy: !!st.compostActionBusy[p.id],
      accept: () => app.compostAction(p.id, 'accept'),
      dismiss: () => app.compostAction(p.id, 'dismiss'),
      open: p.type === 'orphan' && p.data?.noteId
        ? () => { app.selectNote(p.data.noteId); app.navigate('notes'); }
        : null,
    }));

  // loops — todoist two-way sync (to-dos mirror into the Todoist Inbox)
  const todoist = st.liveTodoist;
  const tdLast = todoist?.lastResult;
  const tdBits = tdLast && !tdLast.error
    ? [tdLast.pushed && `pushed ${tdLast.pushed}`, tdLast.pulled && `pulled ${tdLast.pulled}`, tdLast.closedInTodoist && `closed ${tdLast.closedInTodoist}`, tdLast.checkedInVault && `checked off ${tdLast.checkedInVault}`].filter(Boolean)
    : [];
  const mealPrepCard = {
    busy: !!st.mealPrepBusy,
    run: () => app.runMealPrepNow(),
  };

  // The Daily Review — the flagship intelligent loop
  const review = st.liveDailyReview;
  const reviewToday = review?.today;
  const reviewCard = {
    modes: ['off', 'draft', 'auto'].map((m) => ({
      value: m, label: m === 'off' ? 'Off' : m === 'draft' ? 'Draft' : 'Auto',
      active: review?.config?.mode === m,
      pick: () => app.setDailyReviewConfig({ mode: m }),
    })),
    hour: review?.config?.hour ?? 8,
    hourOptions: [5, 6, 7, 8, 9, 10, 11],
    setHour: (e) => app.setDailyReviewConfig({ hour: Number(e.target.value) }),
    status: !review ? 'checking…'
      : !reviewToday ? (review.config?.mode === 'off' ? 'off — turn on for a daily coached read across your whole life' : 'no review yet today — composes at the set hour')
      : reviewToday.status === 'classifying' ? 'Nova is reasoning across your day…'
      : reviewToday.status === 'pending' ? "today's review is waiting for you below"
      : reviewToday.status === 'filed' ? "today's review is filed to your journal"
      : reviewToday.status === 'error' ? 'today\'s review hit an error — try RUN NOW'
      : `today's review: ${reviewToday.status}`,
    busy: !!st.reviewBusy,
    run: () => app.runDailyReviewNow(),
  };
  const todoistCard = {
    configured: !!todoist?.configured,
    busy: !!st.todoistBusy,
    status: !todoist ? 'checking…'
      : !todoist.configured ? 'Not connected. Paste your API token into server/.env as TODOIST_TOKEN (Todoist → Settings → Integrations → Developer), then restart Nova.'
      : tdLast?.error ? `Connected, but the last pass hit an error: ${tdLast.error}`
      : todoist.lastSyncAt
        ? `${todoist.linkCount} open item${todoist.linkCount === 1 ? '' : 's'} in step · last pass ${timeLabel(todoist.lastSyncAt)}${tdBits.length ? ' — ' + tdBits.join(', ') : ''}`
        : 'Connected — the first pass runs within ten minutes, or run it now.',
    sync: () => app.runTodoistSyncNow(),
  };

  // loops — Guardian (the integrity agent's latest read-only check run)
  const guardianReport = st.liveGuardian?.lastReport;
  const GUARDIAN_TONE = { ok: 'var(--nv-good)', warn: 'var(--nv-gold)', alert: 'var(--nv-warn)' };
  const guardianCard = {
    loaded: !!guardianReport,
    status: guardianReport?.status || null,
    statusColor: GUARDIAN_TONE[guardianReport?.status] || 'var(--nv-ink40)',
    checkedLabel: guardianReport ? `checked ${timeLabel(guardianReport.at)}` : 'no check run yet',
    checks: (guardianReport?.checks || []).map((c) => ({
      id: c.id, label: c.label, detail: c.detail,
      color: GUARDIAN_TONE[c.status] || 'var(--nv-ink40)',
      statusLabel: c.status.toUpperCase(),
    })),
    busy: !!st.guardianBusy,
    run: () => app.runGuardianNow(),
    report: () => app.guardianReportNow(),
    exportVault: () => app.guardianExportNow(),
    lastExportLabel: st.liveGuardian?.lastExportAt ? `last export ${timeLabel(st.liveGuardian.lastExportAt)}` : 'never exported',
  };

  return {
    isInbox: st.screen === 'inbox',
    wrapInbox: st.isMobile ? { padding: 'calc(48px + env(safe-area-inset-top)) 16px calc(46px + env(safe-area-inset-bottom))' } : { padding: '28px 40px 44px', maxWidth: '980px' },
    inboxHeaderLabel: demoMode
      ? 'CONNECT A BACKEND TO CAPTURE'
      : isOffline
        ? 'OFFLINE — SHOWING LAST-KNOWN HISTORY'
        : inbox
          ? `${items.length} CAPTURE${items.length === 1 ? '' : 'S'} · ROUTED BY NOVA`
          : 'LOADING…',
    // capture stays usable OFFLINE — the outbox queues it (a capture you can't
    // type is a thought lost; reachability is the outbox's problem now)
    inboxConnected: !demoMode,
    inboxInput: st.inboxInput,
    setInboxInput: (e) => app.setInboxInput(e),
    inboxCaptureBusy: st.inboxCaptureBusy,
    // Every submit below takes the text as an ARGUMENT, falling back to App
    // state only when called without one (the toolbar buttons). The composer
    // is a LocalInput — its live text hasn't necessarily reached App state
    // when a submit fires, so reading st.inboxInput here would drop the last
    // characters typed. A lost capture is a lost thought; the value travels
    // with the call instead of being looked up.
    submitInboxCapture: (source, text) => app.captureToInbox(asText(text) ?? st.inboxInput, source),
    inboxModes: MODE_LADDER.map((m, i) => ({
      ...m,
      step: i + 1,
      active: st.inboxMode === m.value,
      pick: () => app.setInboxMode(m.value),
    })),
    inboxProposals,
    inboxPending: pendingItems,
    inboxHistory: historyItems,
    inboxLoaded: inbox != null, // null = still loading — never renders as "nothing captured yet"
    // the skeleton needs to know NOT to shimmer offline (last-known history
    // renders under the offline banner there — a shimmer would promise data
    // that isn't coming)
    isOffline,
    inboxPendingCount: pendingCount,
    inboxRefresh: () => app.refreshInbox(),

    // loops
    dispatchLoaded: !!dispatch,
    dispatchSlots,
    dispatchBusy: st.dispatchBusy,
    compostLoaded: !!compost,
    compostLastRun: compost?.lastRunAt ? timeLabel(compost.lastRunAt) : 'never',
    compostProposals,
    compostBusy: st.compostBusy,
    runCompostNow: () => app.runCompostNow(),
    todoist: todoistCard,
    guardian: guardianCard,
    mealPrep: mealPrepCard,
    dailyReview: reviewCard,
  };
}
