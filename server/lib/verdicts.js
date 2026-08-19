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

export const VERDICT_KINDS = ['tired', 'stalled', 'protein'];

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

export async function buildVerdict(vaultPath, kind, arg) {
  if (kind === 'tired') return tiredVerdict(vaultPath);
  if (kind === 'stalled') return stalledVerdict(vaultPath, arg);
  if (kind === 'protein') return proteinVerdict(vaultPath);
  throw new Error(`unknown verdict kind "${kind}" (have: ${VERDICT_KINDS.join(', ')})`);
}
