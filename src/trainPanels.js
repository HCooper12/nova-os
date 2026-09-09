// WHAT THE TODAY PANE SHOWS, AND WHEN.
//
// 8 Sep 2026 — MAKE-UP DAYS. A date can be "finish Monday's Pull" rather than
// the weekday template, and before that every surface still recommended a
// standard session on a day he had moved forward to finish. So the make-up
// REPLACED the scheduled card.
//
// 9 Sep 2026 — but replacing is not right either. His words: "today's a bit
// of a different day where I am planning on doing a pool workout AND finish
// the remainder of my push workout. So both the finish push workout and the
// pool workout panels should be getting displayed and not just one or the
// other."
//
// So a make-up now COMPLEMENTS the schedule rather than hiding it. The two
// facts are independent — the server always knew both — and the pane simply
// stopped drawing one of them.
//
// The one thing that stays hidden: a REST day behind a make-up. "Rest day"
// next to "Finish Push" is not a second option he might take, it is the
// template having nothing to say, and printing it would be noise on exactly
// the day he is doing something.

export function todayPanels(o, resume = null) {
  const busy = !!resume;
  const makeup = !busy && !!o?.makeup;
  return {
    resume: busy,
    makeup,
    scheduled: !busy && !!o?.today,
    rest: !busy && !!o?.restDay && !makeup,
    // when both are up, the scheduled one says so — otherwise two gold-ish
    // cards side by side read as one thing said twice
    alsoScheduled: makeup && !!o?.today,
  };
}
