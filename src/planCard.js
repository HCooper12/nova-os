// THE PLAN HE WALKED AWAY FROM.
//
// His ask, 16 Sep, from the Claude advertisement: set a big task, go and do
// your own thing, come back with it ready. The planner has always kept live
// per-step state — runPlan writes the record on every transition — and nothing
// ever showed it to him. Delegating and then having no way to know whether
// anything is happening is the difference between walking away and abandoning
// it.
//
// Pure, so it can be tested without a browser: records in, one card out.

// A step that has not started is 'waiting'. It must not borrow the look of one
// that is running — "in flight" and "not begun" are different answers to the
// only question he is asking. 'skipped' is its own answer again: it will never
// run, because what it needed failed.
// 'paused' joined them on 21 Sep: a step that reached its spending budget is
// not running and not finished — it is a QUESTION, waiting on his yes in the
// Inbox. Giving it the running look would say work is happening when nothing
// is; giving it the failed look would say it is over when it is not.
const STEP_STATUS = new Set(['waiting', 'running', 'done', 'failed', 'skipped', 'paused']);
const SETTLED = new Set(['done', 'failed', 'skipped']);

// One glyph and one colour per state, HERE rather than in the screens, so the
// two Home idioms cannot drift into disagreeing about what a step's state
// looks like. A skipped step is not a waiting one: the dash says it is over.
const LOOK = {
  done:    { glyph: '✓', tint: 'var(--nv-good)' },
  failed:  { glyph: '!', tint: 'var(--nv-warn)' },
  skipped: { glyph: '–', tint: 'var(--nv-warn)' },
  running: { glyph: '▸', tint: 'var(--nv-cy)' },
  waiting: { glyph: '·', tint: 'var(--nv-ink60)' },
  // a question mark, because that is literally what it is: the step is asking
  paused:  { glyph: '?', tint: 'var(--nv-warn)' },
};

export function elapsedLabel(at, now = Date.now()) {
  if (!at) return '';
  const ms = now - new Date(at).getTime();
  if (!Number.isFinite(ms)) return '';
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  // a real record in his inbox read "306h 4m" — past a couple of days the
  // hours stop meaning anything and the number is just long
  if (h >= 48) return `${Math.floor(h / 24)} days`;
  return `${h}h ${m % 60}m`;
}

// THE GOAL AS A SENTENCE. His plans are dictated, and a dictated plan about a
// video starts with the address of the video: one real record's goal opens
// "https://www.youtube.com/watch?v=sxn5kPQ4Gl0 — watch and analyse this…".
// reportTitle already strips URLs before they become a filename; the line he
// reads on Home deserves the same. If stripping leaves nothing, the URL WAS
// the goal, so keep it rather than showing him a blank card.
export function goalLine(goal) {
  const raw = String(goal || '').trim();
  const clean = raw.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ')
    .replace(/^[\s—–\-:·,]+/, '').trim();
  return clean || raw;
}

// WHICH STEPS ARE ASKING. `pausedOn` is the record's own list of step ids
// (planner.js writes them joined by ', '); the steps themselves carry
// status 'paused'. Either is enough — a record written by an older server, or
// one caught mid-write, must still be able to say WHICH step stopped.
function pausedNumbers(steps, pausedOn) {
  const ids = new Set(String(pausedOn || '').split(',').map((x) => x.trim()).filter(Boolean));
  return steps
    .map((s, i) => ((s.status === 'paused' || ids.has(String(s.id))) ? i + 1 : null))
    .filter(Boolean);
}

// The sentence under a WAITING ON YOU card. His report, 21 Sep: he did not
// know what would happen after approving something in his Inbox — so this
// says where the question is and what it is asking, not that something broke.
export function pausedLineFrom(steps, pausedOn) {
  const ns = pausedNumbers(steps, pausedOn);
  if (!ns.length) return 'a step paused at its budget — the card in your Inbox asks whether to continue';
  const list = ns.length === 1 ? `step ${ns[0]}`
    : `steps ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
  return `${list} paused at ${ns.length === 1 ? 'its' : 'their'} budget — the card in your Inbox asks whether to continue`;
}

// THE FIRST BREATH OF A REPORT, for the chat. A report opens with a markdown
// heading and then prose; the heading is a label, not news. Take the first
// real paragraph, undress it of markdown, and give back its first sentences —
// enough that he knows what came back without opening anything.
export function reportOpening(body, count = 2) {
  const prose = [];
  for (const line of String(body || '').split('\n')) {
    const t = line.trim();
    if (!t) { if (prose.length) break; continue; }
    // headings, bullets, quotes, tables and fences are structure, not a sentence
    if (/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|\||---)/.test(t)) { if (prose.length) break; continue; }
    prose.push(t);
  }
  const clean = prose.join(' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // [text](url) → text
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  return splitSentences(clean).slice(0, count).join(' ').trim();
}

// A SCAN, NOT A REGEX. The obvious /[^.!?]+[.!?]+(?=\s|$)/g silently DROPS
// everything before a full stop it cannot end on — his real report 9278fdf7
// opens '…bore on "what should I cut." And no agent…', where the stop sits
// inside the quote, and the whole first sentence vanished from the chat. A
// stop ends a sentence when what follows it is a closing mark and then space.
function splitSentences(text) {
  const out = [];
  let buf = '';
  for (let i = 0; i < text.length; i += 1) {
    buf += text[i];
    if (!'.!?'.includes(text[i])) continue;
    let j = i + 1;
    while (j < text.length && '.!?"\'”’)]'.includes(text[j])) { buf += text[j]; j += 1; }
    i = j - 1;
    if (j >= text.length || /\s/.test(text[j])) { out.push(buf.trim()); buf = ''; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// Which plan, if any, belongs on Home. Three states, one card, because they
// answer the same question:
//   RUNNING — which step, of how many, and which are already in.
//   PAUSED  — a step hit its budget and is waiting on HIS answer, not on work.
//   READY   — it finished while he was gone and is waiting to be read.
// A running plan wins over a finished one: the thing still moving is the thing
// he cannot otherwise see.
export function planCardFrom(records, now = Date.now()) {
  const plans = (records || []).filter((r) => r && r.kind === 'plan');
  const stepsOf = (r) => (Array.isArray(r?.plan?.steps) ? r.plan.steps : []);
  const live = plans.find((r) => r.status === 'classifying' && stepsOf(r).length);
  // 'ready' needs finishedAt: a pending plan that never ran is a PROPOSAL
  // waiting for his yes, which is the Inbox's job to show, not this card's
  const ready = plans.find((r) => r.status === 'pending' && stepsOf(r).length && r.finishedAt);
  const rec = live || ready;
  if (!rec) return null;

  const steps = stepsOf(rec);
  // settled counts what is no longer in flight; DONE is what actually landed,
  // and the card shows both because "3 of 4 settled" and "2 of 4 done" are
  // different news
  const settled = steps.filter((s) => SETTLED.has(s.status));
  const done = steps.filter((s) => s.status === 'done');
  const failed = steps.filter((s) => s.status === 'failed');
  const skipped = steps.filter((s) => s.status === 'skipped');
  const at = rec.startedAt || rec.createdAt || null;
  // PAUSED IS NOT RUNNING. A plan parked on his decision stays `classifying`
  // so the reaper leaves it alone (planner.js) — which means, without this,
  // the card said "Working on it" while nothing at all was happening.
  const paused = !!(live && (rec.pausedOn || steps.some((s) => s.status === 'paused')));
  return {
    id: rec.id,
    state: paused ? 'paused' : live ? 'running' : 'ready',
    pausedLine: paused ? pausedLineFrom(steps, rec.pausedOn) : null,
    goal: goalLine(rec.goal || rec.text) || 'a plan',
    total: steps.length,
    settled: settled.length,
    done: done.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    // The one line he reads first, and the only number in it that survives
    // being checked is DONE. Settled is not completed: a step that failed and
    // a step that never ran are both finished and neither is an answer.
    tally: [
      `${done.length} of ${steps.length}`,
      failed.length ? `${failed.length} failed` : '',
      skipped.length ? `${skipped.length} skipped` : '',
    ].filter(Boolean).join(' · '),
    since: elapsedLabel(at, now),
    steps: steps.map((s) => ({
      id: s.id,
      what: s.what || s.capability || 'a step',
      status: STEP_STATUS.has(s.status) ? s.status : 'waiting',
      ...LOOK[STEP_STATUS.has(s.status) ? s.status : 'waiting'],
      error: s.status === 'failed' ? (s.error || 'it failed')
        : s.status === 'skipped' ? (s.error || 'it never ran')
        : s.status === 'paused' ? 'waiting on your yes'
        : null,
    })),
  };
}
