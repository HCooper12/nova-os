// The summary Fuel page's pure derivations (mockup 59, variation A: "Fuel is
// the plate"). Pure so server/test/fuelSummary.test.js can pin them without
// a browser. Nothing here invents a figure: a target that is not set is
// absent, and the instrument says so rather than drawing against a guess.

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const target = (x) => (Number(x) > 0 ? Math.round(Number(x)) : null);

// THE PLATE, AS ONE INSTRUMENT. Protein is a ring against its target,
// calories a bar against theirs, carbs and fat plain grams because nothing
// is there to fill. The protein percentage is Home's own arithmetic
// (valsMission: round(min(1, current / target) × 100)) from the same
// ctx.proteinCurrent / ctx.proteinTarget, so the Body ring on Home and this
// ring can never disagree.
//
// protein.state:
//   'dashed'  no target: a dashed ring and no percentage, never a zero arc
//   'open'    a target, nothing logged yet: the track alone
//   'arc'     part of the way
//   'met'     at or past the target
export function plateInstrument({ proteinCurrent, proteinTarget, kcalCurrent, targetKcal, c, f } = {}) {
  const pNow = num(proteinCurrent);
  const pT = target(proteinTarget);
  const protein = pT == null
    ? { value: Math.round(pNow), target: null, pct: null, state: 'dashed', toGo: null }
    : {
        value: Math.round(pNow),
        target: pT,
        pct: Math.round(Math.min(1, Math.max(0, pNow / pT)) * 100),
        state: pNow >= pT ? 'met' : pNow > 0 ? 'arc' : 'open',
        toGo: Math.max(0, Math.round(pT - pNow)),
      };
  const kNow = num(kcalCurrent);
  const kT = target(targetKcal);
  const kcal = kT == null
    ? { value: Math.round(kNow), target: null, left: null, over: null, pct: null }
    : {
        value: Math.round(kNow),
        target: kT,
        left: Math.max(0, Math.round(kT - kNow)),
        over: Math.max(0, Math.round(kNow - kT)),
        pct: Math.round(Math.min(1, Math.max(0, kNow / kT)) * 100),
      };
  return { protein, kcal, carbs: { value: Math.round(num(c)) }, fat: { value: Math.round(num(f)) } };
}

// The one sentence under the plate: what protein still needs, in grams, or
// that there is no target to measure against.
export function proteinLine(protein) {
  if (!protein || protein.target == null) return 'No protein target set yet';
  if (protein.toGo > 0) return `${protein.toGo} g protein to go`;
  return 'Protein target reached';
}

// "07:40" → { clock: '7:40', ampm: 'am' }; a retro entry carries no time.
export function clock12(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return { clock: `${h % 12 || 12}:${m[2]}`, ampm: h < 12 ? 'am' : 'pm' };
}

// ONE ROW PER ENTRY. The figures are the entry's own macros, which the
// server keeps as the sum of its lines (the itemised-plate rule), so nothing
// here adds lines up: `lines` is a count, never a total.
export function logRows(entries = []) {
  return (entries || []).map((e) => {
    const lines = Array.isArray(e?.items) ? e.items.length : 0;
    const fromRotation = e?.source === 'rotation';
    const p = Math.round(num(e?.macros?.p));
    const kcal = Math.round(num(e?.macros?.kcal));
    const tail = [fromRotation ? 'from the rotation' : null, lines > 1 ? `${lines} lines` : null].filter(Boolean);
    return {
      id: e?.id,
      time: clock12(e?.time),
      name: e?.name || 'Something',
      p, kcal,
      fromRotation,
      lines,
      edited: !!e?.edited,
      tail: tail.join(' · '),
      sub: [`${p} g protein`, `${kcal.toLocaleString('en-AU')} kcal`, ...tail].join(' · '),
    };
  });
}

// THE ROTATION ROW. The next slot, in his own order, whose dish is not yet
// ticked; null when every filled slot is eaten or nothing is planned.
// `slots` is the ordered list of { key, name } the rotation shows.
export function tonightRotation(rotation, slots = []) {
  for (const s of slots || []) {
    const d = rotation?.slots?.[s.key];
    if (!d || d.consumed) continue;
    return {
      slot: s.key,
      slotName: s.name,
      label: s.key === 'dinner' ? 'Tonight' : s.name,
      id: d.id,
      name: d.name,
      variant: d.variant || null,
      p: Math.round(num(d.macros?.p)),
      kcal: Math.round(num(d.macros?.kcal)),
      portionsLeft: d.portionsLeft ?? null,
      out: !!d.out,
    };
  }
  return null;
}
