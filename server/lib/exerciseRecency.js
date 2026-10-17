// When he last did each exercise, and the heaviest working set that day.
// Feeds the exercise picker's "you used these last" rows (the choice-overload
// fix, mockup 102): eight likely lifts first, the whole library behind Show all.
// Warm-ups never count as the top set.
export function exerciseRecency(sessions) {
  const out = {};
  for (const s of sessions || []) {
    if (!s?.date) continue;
    for (const e of s.exercises || []) {
      const sets = (e.sets || []).filter((x) => x && x.setType !== 'warmup' && Number(x.reps) > 0);
      if (!e.exerciseId || !sets.length) continue;
      const prev = out[e.exerciseId];
      if (prev && prev.lastDate >= s.date) continue;
      const top = Math.max(...sets.map((x) => Number(x.weight) || 0));
      out[e.exerciseId] = { lastDate: s.date, lastTopKg: top > 0 ? top : null };
    }
  }
  return out;
}
