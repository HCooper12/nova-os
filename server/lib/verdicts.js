// Verdict cards — the WiseTwinz idea, done Nova's way.
//
// Their best move is that a question produces an EXPERIENCE: a full-screen
// animated card with the arithmetic visible, numbered evidence, a spoken
// line, and honesty labels ("MEASURED ALIGNMENT // NOT A DIAGNOSIS",
// "updated 3.6h ago"). Nova already computes better evidence than they do —
// it just presented it as chat text.
//
// The doctrine adaptation that makes this OURS rather than a copy:
//   - deterministic code computes every number here; the model never
//     invents a figure and is not in this path at all;
//   - the EQUATION is part of the payload, so the card shows its working;
//   - every card carries `basis` (what it was computed from), `asOf`
//     (staleness), and `caveats` — and a question with insufficient data
//     returns an HONEST card saying exactly what is missing, never a
//     confident-looking card built on three days of nothing.
//
// Cards are data, not markup: the client draws rings/arcs from `metric`
// and `arcs`, so a new card type needs no new client code.

const pad = (n) => String(n).padStart(2, '0');
const hm = (mins) => `${Math.floor(mins / 60)}H ${pad(Math.round(mins % 60))}M`;
const dayAge = (d) => Math.round((new Date(new Date().toDateString()) - new Date(`${d}T12:00:00`)) / 86400000);

export const VERDICT_KINDS = ['tired', 'stalled', 'protein', 'peak', 'volume', 'week', 'consistency', 'spend'];

function insufficient(question, title, missing) {
  return {
    kind: null, question, title,
    verdict: `I can't answer that honestly yet — ${missing}.`,
    equation: null, evidence: [], metric: null,
    basis: 'not enough measured data', caveats: ['No verdict is better than a confident guess.'],
    asOf: new Date().toISOString(), insufficient: true,
  };
}

/* --------------------------- WHY AM I TIRED? --------------------------- */
// Their exact demo question, answered from HIS data: sleep need vs recorded,
// HRV against personal baseline, resting HR drift, and yesterday's load.
export async function tiredVerdict(vaultPath) {
  const { loadRecentDays } = await import('./healthData.js');
  const days = (await loadRecentDays(14)).filter((d) => d.date);
  const recent = days.filter((d) => dayAge(d.date) <= 1);
  // PARTIAL EVIDENCE IS STILL EVIDENCE: sleep may be missing (his overnight
  // push doesn't always carry it) while HRV and resting HR are present.
  // Answer from the axes that exist and NAME the missing one — refusing
  // outright when two of three signals are sitting right there would be
  // honesty theatre, not honesty.
  const last = [...recent].reverse().find((d) => d.sleepAsleepMinutes != null)
    || [...days].reverse().find((d) => d.sleepAsleepMinutes != null && dayAge(d.date) <= 2);
  const missingAxes = [];
  if (!last) missingAxes.push('sleep was not recorded for the last two days');

  const pool = days.filter((d) => d.sleepAsleepMinutes != null).map((d) => d.sleepAsleepMinutes).sort((a, b) => a - b);
  const need = pool.length >= 4 ? pool[Math.floor(pool.length * 0.75)] : null;
  const evidence = [];
  const arcs = [];

  if (last && need != null) {
    const gap = need - last.sleepAsleepMinutes;
    arcs.push({ label: 'RECORDED', value: last.sleepAsleepMinutes, of: need, tone: gap > 0 ? 'warn' : 'good' });
    evidence.push({
      n: 1, label: 'SLEEP SHORTFALL',
      value: gap > 0 ? hm(gap) : 'NONE',
      note: gap > 0 ? `below your own recent pattern (${hm(need)})` : `at or above your recent pattern (${hm(need)})`,
      tone: gap > 45 ? 'warn' : 'good',
    });
  }

  const withHrv = days.filter((d) => d.hrv != null);
  const baseline = withHrv.filter((d) => dayAge(d.date) > 2);
  const nowHrv = [...withHrv].reverse().find((d) => dayAge(d.date) <= 2);
  let hrvDelta = null;
  if (nowHrv && baseline.length >= 3) {
    const avg = baseline.reduce((s, d) => s + d.hrv, 0) / baseline.length;
    hrvDelta = Math.round(((nowHrv.hrv - avg) / avg) * 100);
    evidence.push({
      n: evidence.length + 1, label: 'HRV vs BASELINE',
      value: `${hrvDelta >= 0 ? '+' : ''}${hrvDelta}%`,
      note: `${Math.round(nowHrv.hrv)} ms against a ${Math.round(avg)} ms baseline (${baseline.length} days)`,
      tone: hrvDelta <= -10 ? 'warn' : 'good',
    });
  }

  const withRhr = days.filter((d) => d.restingHeartRate != null);
  const rhrNow = [...withRhr].reverse().find((d) => dayAge(d.date) <= 2);
  const rhrBase = withRhr.filter((d) => dayAge(d.date) > 2);
  if (rhrNow && rhrBase.length >= 3) {
    const avg = rhrBase.reduce((s, d) => s + d.restingHeartRate, 0) / rhrBase.length;
    const drift = Math.round(rhrNow.restingHeartRate - avg);
    if (Math.abs(drift) >= 2) {
      evidence.push({
        n: evidence.length + 1, label: 'RESTING HR DRIFT',
        value: `${drift >= 0 ? '+' : ''}${drift} bpm`,
        note: `${rhrNow.restingHeartRate} against a ${Math.round(avg)} baseline`,
        tone: drift >= 3 ? 'warn' : 'good',
      });
    }
  }

  if (!evidence.length) return insufficient('Why am I tired?', 'RECOVERY SIGNAL', 'no recovery signal (sleep, HRV or resting heart rate) has enough history to compare against');

  const worst = evidence.find((e) => e.tone === 'warn');
  const verdict = worst
    ? `The strongest measured signal is ${worst.label.toLowerCase()} — ${worst.value}, ${worst.note}. That is the thing most likely behind it.`
    : 'Nothing in your measured data explains it — sleep, HRV and resting heart rate all sit inside your normal range. Look outside the metrics.';

  return {
    kind: 'tired', question: 'Why am I tired?', title: 'PHYSIOLOGICAL STABILITY SIGNAL',
    metric: (last && need != null) ? { value: (last.sleepAsleepMinutes / 60).toFixed(1), unit: 'h', caption: `OF ${(need / 60).toFixed(1)}h TYPICAL`, pct: need ? Math.min(100, Math.round((last.sleepAsleepMinutes / need) * 100)) : null } : null,
    arcs,
    equation: (last && need != null) ? `TYPICAL ${hm(need)} − RECORDED ${hm(last.sleepAsleepMinutes)} = ${need - last.sleepAsleepMinutes > 0 ? `SHORTFALL ${hm(need - last.sleepAsleepMinutes)}` : 'NO SHORTFALL'}` : null,
    evidence, verdict,
    basis: `${days.length} days of health records; "typical" is your own 75th-percentile night, not a textbook figure`,
    caveats: ['Measured alignment, not a diagnosis.', ...missingAxes.map((m) => `Blind spot: ${m}.`)],
    asOf: (last?.date) || days[days.length - 1]?.date || null,
  };
}

/* ------------------------- WHY IS MY LIFT STALLED? ---------------------- */
export async function stalledVerdict(vaultPath, exerciseName) {
  const { loadSessions } = await import('./workoutSessions.js');
  const { detectPlateaus, rpeTrend } = await import('./trainingAnalytics.js');
  const sessions = await loadSessions(vaultPath, { limit: 40 });
  const plateaus = detectPlateaus(sessions);
  const p = exerciseName
    ? plateaus.find((x) => x.name.toLowerCase().includes(String(exerciseName).toLowerCase()))
    : plateaus[0];
  if (!p) {
    return insufficient(exerciseName ? `Why is my ${exerciseName} stalled?` : 'What is stalled?', 'PROGRESSION SIGNAL',
      exerciseName ? `${exerciseName} isn't showing a plateau in your logged history` : 'nothing in your log meets the plateau bar (flat e1RM over 21+ days)');
  }
  const evidence = [
    { n: 1, label: 'FLAT FOR', value: `${p.spanDays} DAYS`, note: `${p.sessions} logged sessions in that window`, tone: 'warn' },
    { n: 2, label: 'e1RM', value: `${p.recentBest} KG`, note: `was ${p.earlierBest} kg earlier in the window`, tone: p.recentBest < p.earlierBest ? 'warn' : 'good' },
  ];
  const drift = rpeTrend(sessions)?.drift;
  if (drift) {
    evidence.push({
      n: 3, label: 'EFFORT TREND', value: `${drift.baselineAvg} → ${drift.recentAvg} RPE`,
      note: drift.rising ? 'same loads are costing you MORE — the overreach pattern' : 'effort steady',
      tone: drift.rising ? 'warn' : 'good',
    });
  }
  const verdict = drift?.rising
    ? `${p.name} has been flat ${p.spanDays} days while your effort on it climbed ${drift.baselineAvg}→${drift.recentAvg} RPE. Working harder for the same result is the signal to change the stimulus, not to push again.`
    : `${p.name} has been flat ${p.spanDays} days across ${p.sessions} sessions with effort steady. The prescription has stopped producing — change one variable: load scheme, rep range, or the movement itself.`;
  return {
    kind: 'stalled', question: `Why is my ${p.name} stalled?`, title: 'PROGRESSION STALL',
    metric: { value: String(p.recentBest), unit: 'kg', caption: 'CURRENT e1RM', pct: p.earlierBest ? Math.min(100, Math.round((p.recentBest / p.earlierBest) * 100)) : null },
    arcs: [{ label: 'NOW', value: p.recentBest, of: p.earlierBest, tone: 'warn' }],
    equation: `EARLIER BEST ${p.earlierBest}KG → RECENT BEST ${p.recentBest}KG OVER ${p.spanDays} DAYS = ${p.recentBest - p.earlierBest >= 0 ? '+' : ''}${(p.recentBest - p.earlierBest).toFixed(1)}KG`,
    evidence, verdict,
    basis: `${sessions.length} logged sessions; anomaly-flagged days excluded from the trend`,
    caveats: ['Computed from what you logged — unlogged sessions can hide progress.'],
    asOf: sessions[0]?.date || null,
  };
}

/* --------------------- WHERE DID MY PROTEIN GO? ------------------------ */
export async function proteinVerdict(vaultPath) {
  const { loadRecentDays, totalsOf } = await import('./foodLog.js');
  const { loadRecipeData } = await import('./recipes.js');
  const days = (await loadRecentDays(7)) || [];
  const profile = (await loadRecipeData(vaultPath).catch(() => null))?.profile || null;
  const floor = profile?.proteinFloorG || null;
  const logged = days.map((d) => ({ date: d.date, ...totalsOf(d.entries || []) })).filter((d) => d.kcal >= 800);
  if (!floor) return insufficient('Where did my protein go this week?', 'PROTEIN SIGNAL', 'no protein floor is set on your profile page');
  if (logged.length < 3) return insufficient('Where did my protein go this week?', 'PROTEIN SIGNAL', `only ${logged.length} day${logged.length === 1 ? '' : 's'} this week are fully logged`);

  const avg = logged.reduce((s, d) => s + d.p, 0) / logged.length;
  const met = logged.filter((d) => d.p >= floor).length;
  const worst = [...logged].sort((a, b) => a.p - b.p)[0];
  const debt = logged.reduce((s, d) => s + Math.max(0, floor - d.p), 0);
  return {
    kind: 'protein', question: 'Where did my protein go this week?', title: 'PROTEIN FLOOR SIGNAL',
    metric: { value: String(Math.round(avg)), unit: 'g', caption: `AVG OF ${floor}g FLOOR`, pct: Math.min(100, Math.round((avg / floor) * 100)) },
    arcs: [{ label: 'AVERAGE', value: Math.round(avg), of: floor, tone: avg >= floor ? 'good' : 'warn' }],
    equation: `FLOOR ${floor}G × ${logged.length} LOGGED DAYS − ACTUAL ${Math.round(logged.reduce((s, d) => s + d.p, 0))}G = ${Math.round(debt)}G SHORT`,
    evidence: [
      { n: 1, label: 'DAYS AT FLOOR', value: `${met} OF ${logged.length}`, note: `${logged.length} fully-logged days this week`, tone: met >= logged.length - 1 ? 'good' : 'warn' },
      { n: 2, label: 'WEEKLY DEBT', value: `${Math.round(debt)} G`, note: 'total shortfall across the week', tone: debt > floor * 0.5 ? 'warn' : 'good' },
      { n: 3, label: 'WORST DAY', value: `${Math.round(worst.p)} G`, note: `on ${worst.date}`, tone: 'warn' },
    ],
    verdict: met === logged.length
      ? `You held the ${floor}g floor every fully-logged day this week — average ${Math.round(avg)}g. Nothing to fix.`
      : `You hit the floor ${met} of ${logged.length} logged days, averaging ${Math.round(avg)}g against ${floor}g — a ${Math.round(debt)}g weekly debt. The worst day was ${worst.date} at ${Math.round(worst.p)}g.`,
    basis: `${logged.length} fully-logged days (partial logs under 800 kcal excluded)`,
    caveats: ['Only what you logged counts — an unlogged meal reads as a shortfall.'],
    asOf: logged[logged.length - 1]?.date || null,
  };
}

/* ----------------------- WHEN AM I AT MY BEST? ------------------------- */
// F1 — the WiseTwinz Peak Tracker, done deterministically: a day-curve from
// a standard two-peak circadian base, shifted by HIS measured recovery
// (sleep vs his own typical, HRV vs baseline, resting-HR drift), with the
// afternoon dip deepened by short sleep. No model; every adjustment is a
// named, visible driver. Honest floor: with no recovery signal at all,
// there is no forecast — a confident curve from nothing is astrology.
const CIRCADIAN = [[6, 42], [7, 56], [8, 70], [9, 83], [10, 90], [11, 92], [12, 86], [13, 73], [14, 62], [15, 64], [16, 74], [17, 82], [18, 80], [19, 74], [20, 64], [21, 52], [22, 40]];

export async function peakVerdict(vaultPath) {
  const { loadRecentDays } = await import('./healthData.js');
  const days = (await loadRecentDays(14)).filter((d) => d.date);

  const drivers = [];
  let shift = 0;
  let dipExtra = 0;

  // sleep vs HIS typical (75th percentile), same definition as the tired card
  const pool = days.filter((d) => d.sleepAsleepMinutes != null).map((d) => d.sleepAsleepMinutes).sort((a, b) => a - b);
  const need = pool.length >= 4 ? pool[Math.floor(pool.length * 0.75)] : null;
  const lastSleep = [...days].reverse().find((d) => d.sleepAsleepMinutes != null && dayAge(d.date) <= 1);
  if (lastSleep && need != null) {
    const gapH = (need - lastSleep.sleepAsleepMinutes) / 60;
    const adj = Math.max(-18, Math.min(4, -gapH * 6));
    shift += adj;
    if (gapH > 0.75) dipExtra = Math.min(8, gapH * 4);
    drivers.push({ n: drivers.length + 1, label: 'SLEEP', value: `${adj >= 0 ? '+' : ''}${Math.round(adj)}`, note: `${(lastSleep.sleepAsleepMinutes / 60).toFixed(1)}h against your ${(need / 60).toFixed(1)}h typical${gapH > 0.75 ? ' — deeper afternoon dip' : ''}`, tone: adj < -5 ? 'warn' : 'good' });
  }

  const withHrv = days.filter((d) => d.hrv != null);
  const hrvBase = withHrv.filter((d) => dayAge(d.date) > 2);
  const hrvNow = [...withHrv].reverse().find((d) => dayAge(d.date) <= 2);
  if (hrvNow && hrvBase.length >= 3) {
    const avg = hrvBase.reduce((s2, d) => s2 + d.hrv, 0) / hrvBase.length;
    const pct = ((hrvNow.hrv - avg) / avg) * 100;
    const adj = Math.max(-12, Math.min(8, pct * 0.6));
    shift += adj;
    drivers.push({ n: drivers.length + 1, label: 'HRV', value: `${adj >= 0 ? '+' : ''}${Math.round(adj)}`, note: `${pct >= 0 ? '+' : ''}${Math.round(pct)}% vs your ${Math.round(avg)} ms baseline`, tone: adj < -4 ? 'warn' : 'good' });
  }

  const withRhr = days.filter((d) => d.restingHeartRate != null);
  const rhrBase = withRhr.filter((d) => dayAge(d.date) > 2);
  const rhrNow = [...withRhr].reverse().find((d) => dayAge(d.date) <= 2);
  if (rhrNow && rhrBase.length >= 3) {
    const avg = rhrBase.reduce((s2, d) => s2 + d.restingHeartRate, 0) / rhrBase.length;
    const drift = rhrNow.restingHeartRate - avg;
    const adj = Math.max(-14, Math.min(4, -drift * 1.2));
    if (Math.abs(drift) >= 2) {
      shift += adj;
      drivers.push({ n: drivers.length + 1, label: 'RESTING HR', value: `${adj >= 0 ? '+' : ''}${Math.round(adj)}`, note: `${drift >= 0 ? '+' : ''}${Math.round(drift)} bpm vs your ${Math.round(avg)} baseline`, tone: adj < -4 ? 'warn' : 'good' });
    }
  }

  if (!drivers.length) {
    return insufficient('When am I at my best today?', 'PEAK FORECAST', 'no recovery signal (sleep, HRV or resting heart rate) has enough history to shape a curve');
  }

  const curve = CIRCADIAN.map(([h, base]) => {
    let v = base + shift;
    if (h >= 13 && h <= 16) v -= dipExtra;
    return { h, v: Math.max(5, Math.min(100, Math.round(v))) };
  });
  const best = [...curve].sort((a, b) => b.v - a.v)[0];
  const peakBand = curve.filter((p) => p.v >= best.v - 6).map((p) => p.h);
  const peakStart = Math.min(...peakBand);
  const peakEnd = Math.max(...peakBand) + 1;
  const troughPool = curve.filter((p) => p.h >= 12 && p.h <= 18);
  const trough = [...troughPool].sort((a, b) => a.v - b.v)[0];
  const fmtH = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

  // calendar nudge: anything scheduled inside the trough gets named
  let nudge = null;
  try {
    const { fetchEventsForDay } = await import('./calendar.js');
    const events = await fetchEventsForDay(new Date());
    const inTrough = (events || []).filter((e) => {
      const hh = Number(String(e.time || '').split(':')[0]);
      return e.time && e.time !== '00:00' && Math.abs(hh - trough.h) <= 1;
    });
    if (inTrough.length) nudge = `"${inTrough[0].label}" sits in your ${fmtH(trough.h)} trough — if it needs your sharpest hours, move it toward ${fmtH(peakStart)}.`;
  } catch { /* no calendar, no nudge */ }

  const nowH = new Date().getHours();
  const nowPoint = curve.find((p) => p.h === Math.min(22, Math.max(6, nowH)));

  return {
    kind: 'peak', question: 'When am I at my best today?', title: 'PEAK FORECAST',
    metric: { value: String(nowPoint?.v ?? best.v), unit: '%', caption: `RIGHT NOW · PEAK ${fmtH(peakStart)}–${fmtH(peakEnd)}`, pct: nowPoint?.v ?? null },
    curve: { points: curve, peak: [peakStart, peakEnd], trough: trough.h, now: nowH },
    equation: `CIRCADIAN BASE ${shift >= 0 ? '+' : ''}${Math.round(shift)} FROM RECOVERY${dipExtra ? ` − ${Math.round(dipExtra)} AFTERNOON (SHORT SLEEP)` : ''}`,
    evidence: drivers,
    verdict: `Your sharpest window today is ${fmtH(peakStart)}–${fmtH(peakEnd)}; the trough lands around ${fmtH(trough.h)}. ${nudge || `Put the hardest thing in the peak and the admin in the dip.`}`,
    basis: `a standard two-peak day-curve shifted only by your measured recovery (${drivers.map((d) => d.label.toLowerCase()).join(', ')})`,
    caveats: ['A forecast, not a measurement — treat it as scheduling advice.', ...(lastSleep ? [] : ['Blind spot: no sleep recorded — the curve leans on HRV and resting HR.']), ...(nudge ? [] : [])],
    asOf: new Date().toISOString().slice(0, 10),
  };
}

/* ------------------ AM I TRAINING ENOUGH FOR MY GOAL? ------------------ */
export async function volumeVerdict(vaultPath) {
  const { buildTrainOverview } = await import('./trainOverview.js');
  const o = await buildTrainOverview(vaultPath);
  const vol = (o.volume || []).filter((x) => x.sets != null);
  if (!vol.length) return insufficient('Am I training enough for my goal?', 'VOLUME SIGNAL', 'no logged sets this week to count');
  const under = vol.filter((x) => x.goalMuscle && x.sets < x.target);
  const goalRows = vol.filter((x) => x.goalMuscle);
  const totalGoal = goalRows.reduce((sum, x) => sum + x.sets, 0);
  const totalTarget = goalRows.reduce((sum, x) => sum + x.target, 0);
  return {
    kind: 'volume', question: 'Am I training enough for my goal?', title: 'WEEKLY VOLUME vs GOAL',
    metric: totalTarget ? { value: String(totalGoal), unit: '', caption: `OF ${totalTarget} GOAL SETS`, pct: Math.min(100, Math.round((totalGoal / totalTarget) * 100)) } : null,
    equation: totalTarget ? `GOAL MUSCLES ${totalGoal} SETS − TARGET ${totalTarget} = ${totalGoal - totalTarget >= 0 ? '+' : ''}${totalGoal - totalTarget}` : null,
    evidence: vol.slice(0, 6).map((x, i) => ({ n: i + 1, label: x.muscle.toUpperCase(), value: `${x.sets}/${x.target}`, note: x.goalMuscle ? 'named by your goal' : 'maintenance target', tone: x.sets < x.target ? (x.goalMuscle ? 'warn' : null) : 'good' })),
    verdict: under.length
      ? `${under.map((x) => x.muscle).join(', ')} ${under.length === 1 ? 'is' : 'are'} under target for the goal you set — that is where growth is being left on the table.`
      : 'Every goal muscle is at or above its weekly target. Volume is not your limiter right now.',
    basis: 'hard sets this week from your logged sessions; warm-ups and mobility excluded',
    caveats: ['Sets are a proxy — effort and progression still decide the outcome.'],
    asOf: new Date().toISOString().slice(0, 10),
  };
}

/* -------------------------- HOW WAS MY WEEK? --------------------------- */
export async function weekVerdict(vaultPath) {
  const { loadSessions } = await import('./workoutSessions.js');
  const { loadRecentDays } = await import('./foodLog.js');
  const { totalsOf } = await import('./foodLog.js');
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const sessions = (await loadSessions(vaultPath, { limit: 20 })).filter((x) => x.date >= cutoff);
  const days = (await loadRecentDays(7)) || [];
  const logged = days.map((d) => totalsOf(d.entries || [])).filter((d) => d.kcal >= 800);
  if (!sessions.length && !logged.length) return insufficient('How was my week?', 'WEEK IN REVIEW', 'nothing was logged this week — no sessions, no full food days');
  const volume = sessions.reduce((sum, x) => sum + x.exercises.reduce((v2, e) => v2 + (e.sets || []).reduce((y, st2) => y + (st2.weight || 0) * (st2.reps || 0), 0), 0), 0);
  const cut = sessions.filter((x) => x.cutShort).length;
  const evidence = [
    { n: 1, label: 'SESSIONS', value: String(sessions.length), note: `${Math.round(volume).toLocaleString()} kg total volume`, tone: sessions.length >= 3 ? 'good' : 'warn' },
  ];
  if (logged.length) evidence.push({ n: 2, label: 'FULLY-LOGGED DAYS', value: `${logged.length}/7`, note: `avg ${Math.round(logged.reduce((sum, d) => sum + d.p, 0) / logged.length)}g protein`, tone: logged.length >= 5 ? 'good' : 'warn' });
  if (cut) evidence.push({ n: evidence.length + 1, label: 'CUT SHORT', value: String(cut), note: sessions.filter((x) => x.cutShort).map((x) => x.cutShort).join(', '), tone: 'warn' });
  return {
    kind: 'week', question: 'How was my week?', title: 'THE WEEK, MEASURED',
    metric: { value: String(sessions.length), unit: '', caption: 'SESSIONS LOGGED', pct: Math.min(100, sessions.length * 25) },
    equation: `${sessions.length} SESSIONS · ${Math.round(volume).toLocaleString()}KG VOLUME · ${logged.length}/7 DAYS FULLY LOGGED`,
    evidence,
    verdict: `${sessions.length} session${sessions.length === 1 ? '' : 's'} and ${Math.round(volume).toLocaleString()}kg moved${logged.length ? `, ${logged.length} of 7 days fully logged` : ''}.${cut ? ` ${cut} finished early — worth naming why.` : ''}`,
    basis: 'logged sessions and fully-logged food days from the last 7 days',
    caveats: ['Only what you logged is counted.'],
    asOf: sessions[0]?.date || new Date().toISOString().slice(0, 10),
  };
}

/* ---------------------- AM I ACTUALLY CONSISTENT? ---------------------- */
export async function consistencyVerdict(vaultPath) {
  const { loadSessions } = await import('./workoutSessions.js');
  const sessions = await loadSessions(vaultPath, { limit: 60 });
  if (sessions.length < 4) return insufficient('Am I actually consistent?', 'CONSISTENCY SIGNAL', 'fewer than four logged sessions to judge a pattern from');
  const weeks = new Map();
  for (const s2 of sessions) {
    const d = new Date(`${s2.date}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    weeks.set(k, (weeks.get(k) || 0) + 1);
  }
  const recent = [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  const avg = recent.reduce((sum, [, n]) => sum + n, 0) / recent.length;
  const gaps = [];
  for (let i = 1; i < sessions.length; i++) {
    const a = new Date(`${sessions[i - 1].date}T12:00:00`), b = new Date(`${sessions[i].date}T12:00:00`);
    gaps.push(Math.round((a - b) / 86400000));
  }
  const longest = Math.max(...gaps);
  return {
    kind: 'consistency', question: 'Am I actually consistent?', title: 'CONSISTENCY SIGNAL',
    metric: { value: avg.toFixed(1), unit: '/wk', caption: `OVER ${recent.length} WEEKS`, pct: Math.min(100, Math.round((avg / 4) * 100)) },
    equation: `${sessions.length} SESSIONS ÷ ${recent.length} WEEKS = ${avg.toFixed(1)} PER WEEK · LONGEST GAP ${longest} DAYS`,
    evidence: [
      { n: 1, label: 'SESSIONS / WEEK', value: avg.toFixed(1), note: recent.map(([, n]) => n).join(' · ') + ' (recent weeks first)', tone: avg >= 3 ? 'good' : 'warn' },
      { n: 2, label: 'LONGEST GAP', value: `${longest} DAYS`, note: 'between two logged sessions', tone: longest > 7 ? 'warn' : 'good' },
    ],
    verdict: avg >= 3
      ? `You average ${avg.toFixed(1)} sessions a week over ${recent.length} weeks — that IS consistent. The longest gap was ${longest} days.`
      : `You average ${avg.toFixed(1)} sessions a week over ${recent.length} weeks, with a ${longest}-day gap at worst. Frequency, not effort, is the thing limiting you.`,
    basis: `${sessions.length} logged sessions grouped by calendar week`,
    caveats: ['Unlogged training reads as absence here.'],
    asOf: sessions[0]?.date || null,
  };
}

/* ----------------------- WHERE IS MY MONEY GOING? ---------------------- */
export async function spendVerdict(vaultPath) {
  const { listTransactions } = await import('./money.js');
  const all = await listTransactions({ sinceMonths: 3 }).catch(() => []);
  const tx = (Array.isArray(all) ? all : all?.transactions || []).filter((t) => t.amount < 0);
  if (tx.length < 5) return insufficient('Where is my money going?', 'SPEND SIGNAL', 'fewer than five recorded expenses to find a pattern in');
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const recent = tx.filter((t) => (t.date || '') >= cutoff);
  const pool = recent.length >= 5 ? recent : tx.slice(0, 40);
  const byCat = new Map();
  for (const t of pool) byCat.set(t.category || 'Uncategorised', (byCat.get(t.category || 'Uncategorised') || 0) + Math.abs(t.amount));
  const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, v2]) => sum + v2, 0);
  return {
    kind: 'spend', question: 'Where is my money going?', title: 'SPEND SIGNAL',
    metric: { value: `$${Math.round(total).toLocaleString()}`, unit: '', caption: `${pool.length} EXPENSES${recent.length >= 5 ? ' · LAST 30 DAYS' : ''}`, pct: null },
    equation: rows.slice(0, 3).map(([c, v2]) => `${c.toUpperCase()} $${Math.round(v2)}`).join('  +  ') + `  =  $${Math.round(rows.slice(0, 3).reduce((sum, [, v2]) => sum + v2, 0))} OF $${Math.round(total)}`,
    evidence: rows.slice(0, 4).map(([c, v2], i) => ({ n: i + 1, label: c.toUpperCase(), value: `$${Math.round(v2).toLocaleString()}`, note: `${Math.round((v2 / total) * 100)}% of the window`, tone: i === 0 ? 'warn' : null })),
    verdict: `${rows[0][0]} is your biggest line at $${Math.round(rows[0][1]).toLocaleString()} — ${Math.round((rows[0][1] / total) * 100)}% of $${Math.round(total).toLocaleString()} across ${pool.length} expenses.`,
    basis: recent.length >= 5 ? 'expenses recorded in the last 30 days' : `your ${pool.length} most recent recorded expenses`,
    caveats: ['Only what reached the ledger is counted.'],
    asOf: pool[0]?.date || null,
  };
}

export async function buildVerdict(vaultPath, kind, arg) {
  if (kind === 'volume') return volumeVerdict(vaultPath);
  if (kind === 'week') return weekVerdict(vaultPath);
  if (kind === 'consistency') return consistencyVerdict(vaultPath);
  if (kind === 'spend') return spendVerdict(vaultPath);
  if (kind === 'peak') return peakVerdict(vaultPath);
  if (kind === 'tired') return tiredVerdict(vaultPath);
  if (kind === 'stalled') return stalledVerdict(vaultPath, arg);
  if (kind === 'protein') return proteinVerdict(vaultPath);
  throw new Error(`unknown verdict kind "${kind}" (have: ${VERDICT_KINDS.join(', ')})`);
}
