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

// THE ROTATION AS A STRIP (3 Oct 2026, his words: "widgets or something
// similar like the previous design of Nova so that I can simply scroll and
// select to say that I am ticking off one of the meals from my rotation
// rather than only being able to click the breakfast one"). Every dish in
// every slot, in his slot order, one tile each, each tickable in place;
// an empty slot is a quiet tile that says so. `slots` is the rotation view
// model (valsRecipes.rotationSlots), whose `eaten` already reads the day
// the log is showing. `nextIndex` is the first dish not yet eaten (the
// strip scrolls it into view), or -1.
export function rotationStrip(slots = []) {
  const tiles = [];
  for (const s of slots || []) {
    const opts = Array.isArray(s?.options) ? s.options : [];
    if (!opts.length) {
      tiles.push({ key: `${s.key}:empty`, slot: s.key, slotName: s.name, hue: s.hue || null, empty: true });
      continue;
    }
    opts.forEach((o, i) => tiles.push({
      key: `${s.key}:${o.id}`,
      slot: s.key,
      slotName: s.name,
      hue: s.hue || null,
      id: o.id,
      name: o.name,
      variant: o.variant || null,
      p: Math.round(num(o.p)),
      kcal: Math.round(num(o.kcal)),
      portionsLeft: o.portionsLeft ?? null,
      out: !!o.out,
      eaten: !!o.eaten,
      of: opts.length > 1 ? `${i + 1} of ${opts.length}` : null,
    }));
  }
  const dishes = tiles.filter((t) => !t.empty);
  return {
    tiles,
    nextIndex: tiles.findIndex((t) => !t.empty && !t.eaten),
    dishes: dishes.length,
    eaten: dishes.filter((t) => t.eaten).length,
  };
}

// ONE TILE PER SLOT (13 Oct 2026, mockup 101; his words: "alternative meal
// options for meal one ... has resulted in there being multiple tiles for
// meal one whereas this should only be one tile for meal one, two and three").
// The slot's eaten dish if he ate one, else the one in focus; its options are
// counted, not drawn, and Swap cycles them (app.cycleRotationFocus). A slot
// with nothing in it is a placeholder that opens the rotation.
export function rotationSlotTiles(slots = []) {
  const tiles = (slots || []).map((s) => {
    const opts = Array.isArray(s?.options) ? s.options : [];
    if (!opts.length) return { key: s.key, slot: s.key, slotName: s.name, hue: s.hue || null, empty: true };
    const ate = opts.find((o) => o.eaten) || null;
    const shown = ate || opts.find((o) => o.focus) || opts[0];
    const index = opts.indexOf(shown);
    const alt = opts.length > 1 ? opts[(index + 1) % opts.length] : null;
    return {
      key: s.key, slot: s.key, slotName: s.name, hue: s.hue || null,
      id: shown.id, name: shown.name, variant: shown.variant || null,
      p: Math.round(num(shown.p)), kcal: Math.round(num(shown.kcal)), c: Math.round(num(shown.c)), f: Math.round(num(shown.f)),
      portionsLeft: shown.portionsLeft ?? null, out: !!shown.out,
      eaten: !!ate, count: opts.length, index,
      canSwap: opts.length > 1 && !ate,
      alt: alt ? { id: alt.id, name: alt.name, p: Math.round(num(alt.p)), kcal: Math.round(num(alt.kcal)) } : null,
    };
  });
  const dishes = tiles.filter((t) => !t.empty);
  return {
    tiles,
    nextIndex: tiles.findIndex((t) => !t.empty && !t.eaten),
    dishes: dishes.length,
    eaten: dishes.filter((t) => t.eaten).length,
  };
}

// LIKELY NOW (13 Oct, his yes to "faster logging"): three one-tap logs in
// place of the "Log it again" rail. First the next rotation dish not yet
// eaten, then its swap, then from his history: something he last logged
// within two hours of this time of day, else the most recent. Each says why
// it is there, in words that are true of the data.
export function likelyNow({ tiles = [], history = [], nowMin = 0 } = {}) {
  const out = [];
  const seen = new Set();
  const add = (x) => { const k = String(x.name || '').toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); out.push(x); };
  const next = tiles.find((t) => !t.empty && !t.eaten);
  if (next) {
    add({ key: `slot:${next.slot}:${next.id}`, kind: 'tick', slot: next.slot, id: next.id, name: next.name, p: next.p, kcal: next.kcal, why: `${next.slotName} · in focus` });
    if (next.alt) add({ key: `alt:${next.slot}:${next.alt.id}`, kind: 'swapTick', slot: next.slot, id: next.alt.id, name: next.alt.name, p: next.alt.p, kcal: next.alt.kcal, why: `${next.slotName} · the swap` });
  }
  const minOf = (at) => { const m = /\s(\d{2}):(\d{2})\s/.exec(` ${String(at || '').slice(10)} `); return m && m[1] !== '00' ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const near = history
    .map((h) => ({ h, m: minOf(h.lastAt) }))
    .filter((x) => x.m != null && Math.abs(x.m - nowMin) <= 120)
    .sort((a, b) => (b.h.count || 0) - (a.h.count || 0));
  const clock = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'am' : 'pm'}`;
  for (const { h, m } of near) {
    if (out.length >= 3) break;
    add({ key: `hist:${h.key}`, kind: 'relog', item: h, name: h.name, p: Math.round(num(h.macros?.p)), kcal: Math.round(num(h.macros?.kcal)), why: `last logged at ${clock(m)}` });
  }
  for (const h of history) {
    if (out.length >= 3) break;
    add({ key: `hist:${h.key}`, kind: 'relog', item: h, name: h.name, p: Math.round(num(h.macros?.p)), kcal: Math.round(num(h.macros?.kcal)), why: h.count > 1 ? `logged ${h.count} times` : 'logged recently' });
  }
  return out.slice(0, 3);
}
