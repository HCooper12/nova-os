// THE HEADLINE, AND THE BUTTON ON THE BLOCK UNDER IT.
//
// His two reports, 12 Sep: the serif line under "Good evening" "tends to be
// the same phrases and sometimes doesn't make sense in context with the
// calendar event it is stating", and the Focus button on a live block
// doesn't "really do anything useful".
//
// One cause each, and neither was a wording problem.
//
// THE LINE AND THE CARD RAN THE SAME LADDER. Both read the same signals in
// the same order, so the two most prominent slots on the screen spent
// themselves on one fact: "In the thick of Mindfulness or Journal 🧘📓 until
// 22:30." sat directly above a card reading "Until 22:30 — Mindfulness or
// Journal 🧘📓". The card owns the live block, because the card is where the
// action lives; the headline now takes the best true thing the card is NOT
// already saying, and says it with the number that matters.
//
// EVERY BLOCK GOT THE SAME BUTTON. Whatever the block was — a party, a nap,
// thirty minutes of journalling — the one offer was a countdown timer. The
// vault has never recorded a single focus block (`grep -ril "focus block"`,
// 12 Sep: zero files in its whole history). A timer is the right tool for
// deep work and the wrong one for everything else, so the button is now the
// thing the block is FOR, or there is no button.
//
// What a block IS is decided by keyword, which is a phrasing heuristic and
// not a classifier. [[nova-agent-relevance]]. Its failure mode is designed:
// an unrecognised block gets a plain statement of its name and its time, and
// NO button — never a guess wearing a verb.

// Alternation rather than a character class: a variation selector and a ZWJ
// inside one is a lint error, and each is its own thing to drop anyway.
const PICTOGRAPH = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu;

// Emoji belong in LISTS, where they are a glanceable marker, and not in
// sentences. "In the thick of Mindfulness or Journal 🧘📓 until 22:30" in
// italic serif is the whole of what he called janky. Today's calendar keeps
// its emoji; prose gets the label without them.
export function plainLabel(label) {
  const raw = String(label ?? '').trim();
  const stripped = raw
    .replace(PICTOGRAPH, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[\s—–-]+$/, '')
    .trim();
  return stripped || raw; // a label that is ONLY emoji keeps its emoji
}

export function hm2min(hm) {
  const [h, m] = String(hm ?? '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

// A block whose end is before its start crosses midnight — his "Recharge 💤"
// runs 22:30 → 06:00. The old `start <= now < end` test can never be true for
// one, so from half ten at night Nova had nothing to say about the block he
// was actually in, and fell through to "The evening is yours."
export function blockSpan(event) {
  if (!event) return null;
  const s = hm2min(event.time);
  const e = hm2min(event.end);
  if (s == null || e == null) return null;
  return [s, e > s ? e : e + 1440];
}

// An overnight block is live in the small hours too — but only when it
// RECURS. A one-off 23:00→07:00 sitting on today's list starts tonight, and
// reading it as live at 02:00 this morning would be a fiction.
export function isLiveBlock(event, nowMin) {
  const span = blockSpan(event);
  if (!span) return false;
  const [s, e] = span;
  if (nowMin >= s && nowMin < e) return true;
  return !!event.recurring && nowMin + 1440 >= s && nowMin + 1440 < e;
}

export function liveBlock(events, nowMin) {
  return (Array.isArray(events) ? events : []).find((e) => isLiveBlock(e, nowMin)) || null;
}

// Minutes still to run in a live block — never negative, never longer than
// the block.
export function minsLeft(event, nowMin) {
  const span = blockSpan(event);
  if (!span) return null;
  const [s, e] = span;
  const from = nowMin >= s ? nowMin : nowMin + 1440;
  return Math.max(0, e - from);
}

// Ordered: the first match wins, so "Dinner with friends" is social before it
// is a meal, and "Birthday gathering" never reads as training.
const KINDS = [
  ['sleep', /\b(sleep|asleep|recharge|bedtime|bed|lights?\s?out|wind[\s-]?down|nap)\b/i],
  ['reflect', /\b(journal\w*|mindful\w*|meditat\w*|reflect\w*|gratitude|breathwork|pray\w*)\b/i],
  ['social', /\b(birthday|party|gathering|drinks|wedding|date night|catch[\s-]?up|friends|family|guests|hangout)\b/i],
  ['train', /\b(gym|workout|training|lift|lifting|run|running|jog\w*|cardio|swim\w*|cycle|cycling|mobility|stretch\w*|yoga|walk|push|pull|legs?|upper|lower|abs)\b/i],
  ['meal', /\b(breakfast|brunch|lunch|dinner|supper|meal|snack|eat|cook\w*|groceries|food)\b/i],
  ['prep', /\b(get ready|shower|commute|travel|drive|driving|pack\w*|chores|tidy|clean\w*|laundry|errands?)\b/i],
  ['work', /\b(deep work|work|study|studying|focus|writing|write|script|edit\w*|project|build|code|coding|research|read\w*|class|lecture|assignment|meeting|call|admin|email\w*|inbox)\b/i],
];

// One of sleep / reflect / social / train / meal / prep / work, or null for a
// block Nova does not recognise. null is a real answer, not a failure.
export function blockKind(label) {
  const text = plainLabel(label);
  if (!text) return null;
  for (const [kind, re] of KINDS) if (re.test(text)) return kind;
  return null;
}

const pad2 = (n) => String(n).padStart(2, '0');

// A duration in prose. Minutes read as words because the sentence is serif;
// anything an hour or over reads as the app's house 7h 30m.
export function spanLabel(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${pad2(rest)}m` : `${h}h`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The headline for a block that is running right now. Every shape carries the
// number that block makes relevant — hours to the alarm, minutes to spend —
// which is the part he could not read anywhere else on the screen.
export function blockLine(event, nowMin) {
  if (!event) return null;
  const name = plainLabel(event.label);
  const left = minsLeft(event, nowMin);
  const kind = blockKind(event.label);
  if (left == null) return `${name} is on now.`;
  if (kind === 'sleep') return `${spanLabel(left)} until ${event.end} if you turn in now.`;
  if (kind === 'reflect' && left <= 60) return `${spanLabel(left)} to put the day down.`;
  if (kind === 'train') return `${spanLabel(left)} left of ${name}.`;
  if (left <= 90) return `${spanLabel(left)} left of ${name}.`;
  return `${name} until ${event.end}.`;
}

// The headline for the next block, when nothing is running. "Cleared for
// Recharge 💤 at 22:30" told him he was cleared for bed; a sleep block states
// the night it buys instead.
export function nextLine(event, nowMin) {
  if (!event || !event.time) return null;
  const name = plainLabel(event.label);
  const start = hm2min(event.time);
  const gap = start == null ? null : start - nowMin;
  if (blockKind(event.label) === 'sleep') {
    const span = blockSpan(event);
    return span
      ? `Lights out at ${event.time} — a ${spanLabel(span[1] - span[0])} night.`
      : `Wind-down at ${event.time}.`;
  }
  if (gap != null && gap > 0 && gap <= 90) return `${spanLabel(gap)} clear, then ${name}.`;
  return `Clear until ${event.time}, then ${name}.`;
}

// What the live block's button should DO. `intent` is resolved to an app
// action by the caller — this file never touches app state. A block whose
// kind Nova has no surface for returns null, and the card shows no button
// rather than a decorative one. [[nova-method]]: honest degradation.
export function blockCta(event) {
  switch (blockKind(event?.label)) {
    case 'reflect': return { intent: 'journal', label: 'Open the journal' };
    case 'meal': return { intent: 'fuel', label: 'Log what you ate' };
    case 'train': return { intent: 'train', label: 'Open Train' };
    case 'work': return { intent: 'timer', label: `Focus until ${event.end}` };
    default: return null; // sleep, social, prep, and anything unrecognised
  }
}

// The card's small print — what the button will do, or why there isn't one.
export function blockDetail(event, nowMin) {
  const left = minsLeft(event, nowMin);
  const time = left == null ? 'live' : `${spanLabel(left)} left`;
  switch (blockKind(event?.label)) {
    case 'reflect':
      return `${time}. The journal is one tap away, and Nova will write you a prompt if you'd rather not start from a blank page.`;
    case 'meal':
      return `${time}. Log it while it's in front of you — the macros come off the plate, not off memory.`;
    case 'train':
      return `${time}. Everything is prefilled in Train from your last session.`;
    case 'work':
      return `${time}. One tap locks a focus timer to the end of the block — logged to your journal when it lands.`;
    case 'sleep':
      return `Nothing else needs you tonight — ${time} until ${event.end}.`;
    default:
      return `On your calendar until ${event.end}. Nothing for Nova to do here.`;
  }
}

// ---- the headline ladder ------------------------------------------------
// Same rungs the tagline always had, in the same order, with two changes: a
// rung the Suggested Focus card is already occupying is SKIPPED, and the
// calendar rungs speak through the functions above. `signals` is plain data
// so the whole ladder is testable without a clock or a React tree.
export function pickTagline(s = {}, skipTopic = null) {
  const hour = Number.isFinite(s.hour) ? s.hour : 12;
  // Once the sleep block is live the day is CLOSED, and the rungs that chase
  // a daily total have to stand down with it. "150 g of protein left to close
  // tonight" is true at 22:31 and useless at 22:31, which is the second half
  // of what he meant by a line that doesn't make sense in context.
  const dayClosed = !!s.block && blockKind(s.block.label) === 'sleep';
  const rungs = [
    ['session', () => s.session && `${s.session.routineName} is mid-flight — ${plural(s.session.setsDone, 'set')} down.`],
    ['workout-now', () => s.workoutNow && `It's ${s.workoutNow} o'clock.`],
    ['block', () => s.block && blockLine(s.block, s.nowMin)],
    ['carryover', () => s.carryover && `${plural(s.carryover.count, 'exercise')} still owed from ${s.carryover.source}.`],
    ['inbox', () => hour < 10 && s.inboxPending > 0 && `${plural(s.inboxPending, 'capture')} waiting for your call.`],
    ['workout-done', () => s.workoutDone && s.routineName && hour >= 17 && `${s.routineName} banked. Evening's yours.`],
    ['protein', () => !dayClosed && hour >= 17 && s.proteinGap > 25 && `${s.proteinGap} g of protein left to close tonight.`],
    ['steps', () => !dayClosed && hour >= 19 && s.stepsShort > 2000 && `${s.stepsShort.toLocaleString()} steps between you and the goal.`],
    // At the end of the day the useful thing is the FIRST thing of the next
    // one. Only what is already written down — carried-over work — never a
    // guess at what tomorrow should hold.
    ['tomorrow', () => (dayClosed || hour >= 21) && s.tomorrow && s.tomorrow.count > 0
      && `Tomorrow picks up ${plural(s.tomorrow.count, 'exercise')} from ${
        s.tomorrow.sources.length === 1 ? s.tomorrow.sources[0] : `${s.tomorrow.sources.length} earlier sessions`}.`],
    ['next', () => s.next && nextLine(s.next, s.nowMin)],
    ['workout-done', () => s.workoutDone && s.routineName && `${s.routineName} banked — the rest of the day is ahead.`],
    ['routine', () => s.routine && (s.routine.time
      ? `${s.routine.name} ${s.routine.when ? `${s.routine.when} ` : ''}at ${s.routine.time}.`
      : `${s.routine.name} is on today's plan.`)],
    ['rest', () => s.activeRest && 'Active rest — move easy today.'],
    ['offline', () => s.offline && 'Waiting for the link to come back.'],
    ['streak', () => s.streak && s.streak.n >= 3 && `${s.streak.n}-${s.streak.unit === 'sessions' ? 'session' : 'day'} streak intact. Rest is part of it.`],
  ];
  for (const [topic, line] of rungs) {
    if (topic === skipTopic) continue;
    const text = line();
    if (text) return { topic, line: text };
  }
  return { topic: 'generic', line: genericLine(hour, s.dayIndex) };
}

// The bottom of the ladder, where there is genuinely nothing to report. These
// were the lines he saw most often and the ones that read as a stock phrase,
// so there are three of each and the day picks — deterministic, and phrasing
// only: none of them claims anything about his data.
const GENERIC = {
  morning: [
    'The morning is wide open — claim it.',
    'Early, and nothing queued. Pick the hard thing first.',
    'A clean start. Spend it on something that compounds.',
  ],
  afternoon: [
    'The afternoon is clear. Build something.',
    'Nothing on the board — good hours to spend deliberately.',
    'The rest of the day is unspoken for.',
  ],
  evening: [
    'The evening is yours. Land it well.',
    'Winding down — close the day how you like.',
    'Evening, and the rest is yours.',
  ],
};

export function genericLine(hour, dayIndex = 0) {
  const pool = hour < 12 ? GENERIC.morning : hour < 18 ? GENERIC.afternoon : GENERIC.evening;
  const i = Number.isFinite(dayIndex) ? Math.abs(Math.trunc(dayIndex)) % pool.length : 0;
  return pool[i];
}
