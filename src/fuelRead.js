// TODAY'S READ (13 Oct 2026, mockup 101; his words: "Today's read with the
// score should look like it does with your mockup version of the 9:40pm
// version, with the calorie, protein, fat etc macros broken down. But applied
// to every time of the day except for when nothing has been logged yet").
//
// Pure: the plate's numbers in, the read out. Nothing here is a model's
// guess, and the Fuel page renders exactly this object.
//
// THE RULES, each one a decision:
// - Nothing logged: no read, only "starts with your first meal".
// - Mid-day the day is PROJECTED: what he has logged plus the in-focus dish of
//   every rotation slot he has not eaten yet. A half-eaten day is never scored
//   as an under-eaten one; the projected part is drawn dashed and the score
//   says "projected".
// - The day is DONE when nothing planned is left to eat.
// - A verdict (helped / held back) only against a target he has: protein
//   against its floor, calories within ±150 kcal of the target. Fat has no
//   target in his profile (no macro split), so fat is shown as a fact, never
//   judged. A missing target means no verdict and no score, never a zero.
// - The score is published, not a black box: protein is worth 50 (his share of
//   the floor, capped), calories 50 (less one point for every 2% away from
//   the target).

const KCAL_BAND = 150;
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const fmt = (n) => Math.round(num(n)).toLocaleString('en-AU');

export function readScore({ p, kcal }, { proteinTarget, kcalTarget }) {
  if (!(proteinTarget > 0) || !(kcalTarget > 0)) return null;
  const prot = 50 * Math.min(1, num(p) / proteinTarget);
  const cal = Math.max(0, 50 - (Math.abs(num(kcal) - kcalTarget) / kcalTarget) * 50);
  return Math.round(prot + cal);
}

// a plan written for a sentence: "Meal 3", "Meal 3 and Snack", "Meal 2, Meal 3 and Snack"
export function planWords(labels = []) {
  const l = labels.filter(Boolean);
  if (l.length <= 1) return l[0] || '';
  return `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
}

export function fuelRead({ logged = 0, p = 0, kcal = 0, f = 0, c = 0, proteinTarget = null, kcalTarget = null, rest = [] } = {}) {
  if (!(logged > 0)) {
    return { state: 'empty', news: 'Starts with your first meal.', facts: [], score: null, dots: [], plan: '' };
  }
  const left = (rest || []).filter((m) => m && (num(m.p) > 0 || num(m.kcal) > 0));
  const done = left.length === 0;
  const pj = left.reduce((t, m) => ({ p: t.p + num(m.p), kcal: t.kcal + num(m.kcal), f: t.f + num(m.f), c: t.c + num(m.c) }),
    { p: num(p), kcal: num(kcal), f: num(f), c: num(c) });
  const plan = planWords(left.map((m) => m.label));
  const facts = [];

  if (proteinTarget > 0) {
    const ok = pj.p >= proteinTarget;
    const short = Math.max(0, Math.round(proteinTarget - num(p)));
    facts.push({
      key: 'p', label: 'Protein', value: Math.round(num(p)), unit: 'g', ok,
      sub: num(p) >= proteinTarget ? `floor ${proteinTarget} g, cleared`
        : done ? `floor ${proteinTarget} g · ${short} short`
          : `${short} g to go · ${Math.round(pj.p)} g with ${plan}`,
      now: num(p) / (proteinTarget * 1.3), then: pj.p / (proteinTarget * 1.3), mark: 1 / 1.3,
    });
  }
  if (kcalTarget > 0) {
    const diff = pj.kcal - kcalTarget;
    const ok = Math.abs(diff) <= KCAL_BAND;
    facts.push({
      key: 'kcal', label: 'Calories', value: Math.round(num(kcal)), unit: 'kcal', ok,
      sub: done ? `target ${fmt(kcalTarget)} · ${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}`
        : `${fmt(Math.max(0, kcalTarget - num(kcal)))} left · ${fmt(pj.kcal)} with ${plan}`,
      now: num(kcal) / (kcalTarget * 1.4), then: pj.kcal / (kcalTarget * 1.4), mark: 1 / 1.4,
    });
  }
  // fat: a fact, not a verdict (no fat target exists)
  const share = (fat, cals) => (cals > 0 ? Math.round((fat * 9 / cals) * 100) : 0);
  facts.push({
    key: 'f', label: 'Fat', value: Math.round(num(f)), unit: 'g', ok: null,
    sub: done || !left.length ? `${share(num(f), num(kcal))}% of the day's calories` : `${share(num(f), num(kcal))}% of calories so far · ${share(pj.f, pj.kcal)}% with ${plan}`,
    now: Math.min(1, share(num(f), num(kcal)) / 70), then: Math.min(1, share(pj.f, pj.kcal) / 70), mark: null,
  });
  for (const x of facts) { x.now = Math.min(1, Math.max(0, x.now)); x.then = Math.min(1, Math.max(x.now, x.then)); }

  const judged = facts.filter((x) => x.ok !== null);
  let news;
  if (done) {
    const bits = [];
    const pf = facts.find((x) => x.key === 'p');
    const kf = facts.find((x) => x.key === 'kcal');
    if (pf && !pf.ok) bits.push(`protein stopped ${Math.round(proteinTarget - num(p))} g short`);
    if (kf && !kf.ok) { const d = num(kcal) - kcalTarget; bits.push(`calories ran ${fmt(Math.abs(d))} ${d > 0 ? 'over' : 'under'}`); }
    if (bits.length) news = `${bits.join(' and ').replace(/^./, (ch) => ch.toUpperCase())}.`;
    else if (pf && kf) news = `Protein cleared the floor and calories landed ${fmt(Math.abs(num(kcal) - kcalTarget))} from target.`;
    else news = `${fmt(kcal)} kcal and ${Math.round(num(p))} g protein logged.`;
  } else {
    const onTrack = judged.length > 0 && judged.every((x) => x.ok);
    news = `${onTrack ? 'On track. ' : ''}${plan} take${left.length === 1 ? 's' : ''} protein to ${Math.round(pj.p)} g and calories to ${fmt(pj.kcal)}.`;
  }
  const value = readScore(done ? { p, kcal } : pj, { proteinTarget, kcalTarget });
  return {
    state: done ? 'done' : 'partial',
    news,
    facts,
    plan,
    dots: judged.map((x) => (x.ok ? 'good' : 'warn')),
    score: value == null ? null : { value, projected: !done },
  };
}

// kcal he left blank is worked out from the macros he typed (4/4/9),
// never asked for twice. Typed kcal always wins; no macros, no guess.
export function kcalFromMacros(p, c, f) {
  const k = 4 * (Number(p) || 0) + 4 * (Number(c) || 0) + 9 * (Number(f) || 0);
  return k > 0 ? Math.round(k) : 0;
}
