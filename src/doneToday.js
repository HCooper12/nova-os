// WHAT TODAY HELD, said once for every surface (3 Oct 2026).
//
// His report: "technically I finished the full arms and delts session, make
// up pull and the make up upper body (just chose to not complete the final
// two makeup exercises). So this screen should be reflecting that and not
// only partial data." The Done Today card led with the last make-up and
// folded his main session into "+ 2 more today"; the week row said "Made up
// Upper Body · 1 done", which reads as a session half finished.
//
// These are the pure halves both idioms read (valsWorkouts for the classic
// Train screen and the week rows, valsTrainSummary for the summary page),
// from overview.doneToday as server/lib/makeupDay.js `doneOn` builds it:
//
//   doneTodayCard  the card: one session keeps its simple form; several get
//                  a title for the day, the totals once, and a line each,
//                  in the order done
//   dayDoneMarks   the week row: a tick per thing done that day
//   dayDoneText    the same marks as one line, for the summary week notes
//
// A make-up he filed is FINISHED. What its routine still had undone is his
// choice and is said as such ("2 left off"), never as work owed; the only
// exception is what he pushed on again from the finish screen, which is
// still planned and says where it went.

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

const weekdayOf = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { weekday: 'long' });
};

// the server sends them in the order done; an older server sent newest
// first with no finishedAt, which this leaves as it came
function inOrder(sessions) {
  const list = [...(sessions || [])];
  if (list.every((s) => s.finishedAt)) list.sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));
  return list;
}

// What one session was: its title, its size, and what a make-up left off.
export function sessionLine(s) {
  const madeUp = s.madeUp?.routineName || null;
  const leftOff = (s.leftOff || []).length;
  const carried = s.carried || [];
  return {
    key: s.id || `${s.name}:${s.finishedAt || ''}`,
    title: madeUp ? `Made up ${madeUp}` : s.name,
    meta: `${plural(s.exerciseCount || 0, 'exercise')} · ${plural(s.setCount || 0, 'set')}`,
    madeUp: !!madeUp,
    scheduled: !!s.scheduled,
    // quiet and true: he chose to leave them, so they are not owed
    leftOff: leftOff ? `${leftOff} left off` : null,
    leftOffWhy: leftOff ? `${s.leftOff.join(', ')}: left off, your call` : null,
    carried: carried.length ? `${carried.length} moved to ${weekdayOf(carried[0].forDate)}` : null,
  };
}

const notes = (l) => [l.leftOff, l.carried].filter(Boolean);

/**
 * The Done Today card.
 * @param d overview.doneToday — { sessions, madeUp, totals?, scheduledDone }
 * @returns null when nothing was filed today, else
 *   { title, meta, lines: [sessionLine] | null, count, scheduledDone }
 */
export function doneTodayCard(d) {
  if (!d?.sessions?.length) return null;
  const lines = inOrder(d.sessions).map(sessionLine);
  if (lines.length === 1) {
    const l = lines[0];
    return {
      title: l.title,
      meta: [`${l.meta}, filed today`, ...notes(l)].join(' · '),
      lines: null,
      count: 1,
      scheduledDone: !!d.scheduledDone,
    };
  }
  const ex = d.totals?.exercises ?? d.sessions.reduce((n, s) => n + (s.exerciseCount || 0), 0);
  const sets = d.totals?.sets ?? d.sessions.reduce((n, s) => n + (s.setCount || 0), 0);
  return {
    title: `${lines.length} sessions today`,
    meta: `${plural(ex, 'exercise')} · ${plural(sets, 'set')} in all`,
    lines: lines.map((l) => ({ ...l, meta: [l.meta, ...notes(l)].join(' · ') })),
    count: lines.length,
    scheduledDone: !!d.scheduledDone,
  };
}

/**
 * The week row's ticks for the day these sessions were filed on: one per
 * session, in the order done. A session that is neither the day's routine
 * nor a make-up is named as the extra it was, so the plan is never rewritten
 * to match what happened.
 */
export function dayDoneMarks(d) {
  if (!d?.sessions?.length) return [];
  return inOrder(d.sessions).map((s) => {
    const l = sessionLine(s);
    const extra = !l.madeUp && !l.scheduled;
    return { key: l.key, text: l.title, extra, note: notes(l).join(' · ') || null, why: l.leftOffWhy };
  });
}

// the marks as one line: "Arms and Delts · made up Pull · made up Upper Body, 2 left off"
export function dayDoneText(marks) {
  if (!marks?.length) return null;
  return marks.map((m, i) => {
    const t = i > 0 && m.text.startsWith('Made up ') ? `made up ${m.text.slice(8)}` : m.text;
    return `${t}${m.extra ? ' (extra)' : ''}${m.note ? `, ${m.note}` : ''}`;
  }).join(' · ');
}
