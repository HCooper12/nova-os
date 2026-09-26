import { mono } from './shared.js';
import { dtf } from './fmt.js';
import { scaleMacros, portionName, validPortion, PORTIONS } from '../portion.js';

// The rename UI keys off a variant id. The version IN USE has none — it is
// the recipe's main block, not an alternate — so it needs a sentinel rather
// than null, which already means "no rename in progress".
export const CURRENT_VERSION = '__current__';

// TRAINING × FUEL, AS TWO BARS. Each finding in server/lib/fuelCross.js
// already carries the pair its sentence is built from, so the card can draw
// the comparison instead of narrating it. The standard comes first (`need`),
// the measured average second; the distance between the two bar ends is the
// gap the prose used to spell out. Kinds whose payload is a ratio of days
// rather than two magnitudes are deliberately absent — they stay prose.
const CROSS_PAIRS = {
  'protein-floor': (d) => ({ unit: 'g', a: ['Protein floor', d.floor], b: ['Rotation, eaten in full', d.have] }),
  'protein-split': (d) => ({ unit: 'g', a: ['Protein floor', d.floor], b: ['Training days', d.trained] }),
  'kcal-split': (d) => ({ unit: 'kcal', a: ['Target', d.target], b: ['Training days', d.trained] }),
  'kcal-days': (d) => ({ unit: 'kcal', a: ['Rest days', d.rest], b: ['Training days', d.trained] }),
};
function crossBars(data, metric) {
  const make = data && CROSS_PAIRS[data.kind];
  if (!make) return null;
  const { unit, a, b } = make(data);
  if (!Number.isFinite(a[1]) || !Number.isFinite(b[1])) return null;
  // THE GAP IS THE FINDING'S OWN `metric`, NOT A SUBTRACTION OF THE TWO BARS.
  // Both bar values arrive already rounded, so 2,668 − 2,275 gives 393 where
  // the sentence underneath says 394 — the server rounded the difference of
  // the raw averages, and the card must say the same number as the prose it
  // sits above or one of them is lying.
  const gap = Number.isFinite(metric) ? Math.round(Math.abs(metric)) : Math.round(Math.abs(a[1] - b[1]));
  return {
    unit,
    max: Math.max(a[1], b[1], 1),
    need: { label: a[0], value: Math.round(a[1]) },
    have: { label: b[0], value: Math.round(b[1]) },
    gap,
    gapWord: b[1] < a[1] ? 'short' : 'over',
  };
}

// PICK IT UP — THE EFFECTIVE BUDGET, IN ONE PLACE.
//
// Until he edits a field the finder searches with what is really left of
// today (the prefill the view model derives from kcalLeft and proteinGap);
// once he edits, his own figures stand. App's search and the screen both call
// this, so the numbers drawn in the rings are the numbers sent to the server —
// never two readings of the same budget. `prefill` is { kcal, p } with null
// for "no target, so no figure" (never an invented one).
export const EAT_OUT_FIELDS = ['kcal', 'p', 'c', 'f'];
export function eatOutBudget(st, prefill) {
  const pre = { kcal: prefill?.kcal ?? null, p: prefill?.p ?? null, c: null, f: null };
  const raw = st.eatOutTouched ? (st.eatOutBudget || {}) : {};
  const out = { prefilled: {} };
  for (const k of EAT_OUT_FIELDS) {
    const val = st.eatOutTouched ? String(raw[k] ?? '').trim() : (pre[k] != null ? String(pre[k]) : '');
    out[k] = val;
    // "from today" is a statement about provenance: the figure on screen IS
    // today's figure. An edit back to the same number is still today's.
    out.prefilled[k] = val !== '' && pre[k] != null && val === String(pre[k]);
  }
  return out;
}
export function eatOutParams(st, prefill) {
  const b = eatOutBudget(st, prefill);
  const num = (s) => (s !== '' && Number.isFinite(Number(s)) && Number(s) >= 0 ? String(Math.round(Number(s))) : '');
  return {
    kcal: num(b.kcal), p: num(b.p), c: num(b.c), f: num(b.f),
    brands: (st.eatOutBrands || []).join(','),
    kind: st.eatOutKind && st.eatOutKind !== 'all' ? st.eatOutKind : '',
    mode: st.eatOutMode || 'single',
    limit: '40',
  };
}
export const eatOutHasBudget = (params) => ['kcal', 'p', 'c', 'f'].some((k) => params[k] !== '');

// Recipes domain: recipe list/filters, daily rotation, off-plan food log,
// add-recipe modal, and the recipe overlay (incl. alternates + tweak chat).
// Adds to ctx: usingLiveRecipes, rotation, profile, and the protein-gauge
// inputs consumed by valsMission.
export function valsRecipes(app, ctx) {
  const st = app.state;

  const usingLiveRecipes = !!st.liveRecipes;
  const RECIPE_CATEGORY_LABEL = { 'CORE DAILY MEALS': 'Core', 'ROTATION / SWAP MEALS': 'Rotation', TREATS: 'Treats' };
  const RECIPE_HUES = ['216,181,115', '138,106,209', '107,229,245', '201,111,111', '90,168,124'];

  const filters = usingLiveRecipes ? ['All', 'Core', 'Rotation', 'Treats'] : ['All', 'High protein', 'Quick', 'Batch'];

  // daily rotation — which real recipe fills each meal slot, and the day's macro total
  const rotation = st.liveRotation;
  const profile = st.liveRecipeProfile;
  // Deliberately avoids cyan/gold/purple/green — those are the P/C/F/kcal
  // macro colors, so a slot title in one of those would clash with the
  // macro reading right below it in the same card.
  const SLOT_DEFS = [
    { key: 'breakfast', label: 'B', name: 'Breakfast', hue: '214,142,74' },
    { key: 'lunch', label: 'L', name: 'Lunch', hue: '90,150,224' },
    { key: 'dinner', label: 'D', name: 'Dinner', hue: '95,105,190' },
    { key: 'snack', label: 'S', name: 'Snack', hue: '199,120,158' },
    { key: 'extra', label: 'E', name: 'Extra Meal', hue: '199,99,99' },
  ];
  // ROTATION v2 (7 Sep): the slot list is the standard five plus any extra
  // meals he has added — the server's `order` and `labels` are the truth;
  // SLOT_DEFS only supplies a hue and a chip letter for the standard ones.
  const CUSTOM_HUE = '199,99,99';
  const rotationOrder = rotation?.order || SLOT_DEFS.map((s) => s.key);
  const rotationExtraVisible = st.rotationShowExtra || !!rotation?.slots?.extra;
  const slotDefFor = (key) => SLOT_DEFS.find((s) => s.key === key) || { key, label: '+', name: rotation?.labels?.[key] || key, hue: CUSTOM_HUE, custom: true };
  const visibleSlotDefs = rotationOrder.map(slotDefFor).filter((s) => s.key !== 'extra' || rotationExtraVisible);
  const rotationSlots = visibleSlotDefs.map((s) => {
    const filled = rotation?.slots?.[s.key] || null;
    const options = rotation?.options?.[s.key] || (filled ? [filled] : []);
    const many = options.length > 1;
    return {
      key: s.key,
      name: s.name,
      hue: s.hue,
      custom: !!s.custom,
      recipeName: filled ? filled.name : null,
      p: filled ? Math.round(filled.macros.p) : null,
      c: filled ? Math.round(filled.macros.c) : null,
      f: filled ? Math.round(filled.macros.f) : null,
      kcal: filled ? Math.round(filled.macros.kcal) : null,
      consumed: !!filled?.consumed,
      variant: filled?.variant || null,
      // the fridge: how many cooked portions of the FOCUSED dish are left
      // (null = he has never counted it); zero reads red
      portionsLeft: filled?.portionsLeft ?? null,
      out: !!filled?.out,
      // several options: which is in focus, and the flick between them
      optionCount: options.length,
      focusIndex: Math.max(0, options.findIndex((d) => d.focus)),
      eatenCount: options.filter((d) => d.eaten).length,
      prev: many ? () => app.cycleRotationFocus(s.key, -1) : null,
      next: many ? () => app.cycleRotationFocus(s.key, 1) : null,
      // A VARIANT BELONGS TO THE DISH, NOT THE SLOT (7 Sep 2026). The server
      // has always keyed overrides by recipe id; before today the UI could
      // only reach the focused one, so swapping "the snack" meant swapping
      // whichever snack happened to be in focus. Now every option carries its
      // own variant and its own swap menu (hold the row).
      options: options.map((d) => {
        const recipe = (st.liveRecipes || []).find((r) => r.id === d.id);
        const alts = (recipe?.alternates || []).filter((a) => a.id !== d.variantId);
        return {
          id: d.id, name: d.name, focus: !!d.focus, eaten: !!d.eaten,
          p: Math.round(d.macros?.p || 0), kcal: Math.round(d.macros?.kcal || 0),
          portionsLeft: d.portionsLeft ?? null, out: !!d.out,
          variant: d.variant || null, variantId: d.variantId || null, alts,
          focusIt: () => app.setRotationFocus(s.key, d.id),
          tick: () => app.toggleOptionEaten(s.key, d.id, !d.eaten),
          remove: () => app.toggleRotationSlot(s.key, d.id),
          open: () => app.openRecipe(d.id),
          setVariant: (altId) => app.setRotationVariant(s.key, altId, d.id),
          onLongPress: ({ x, y }) => app.openContextMenu({
            x, y, title: `${s.name.toUpperCase()} · ${d.name.toUpperCase()}`,
            items: [
              d.focus ? null : { label: 'Make this the one that counts', hint: `${Math.round(d.macros?.p || 0)}P · ${Math.round(d.macros?.kcal || 0)} kcal`, onSelect: () => app.setRotationFocus(s.key, d.id) },
              { label: d.eaten ? 'Mark not eaten' : 'Mark eaten', hint: d.portionsLeft != null ? `${d.portionsLeft} in the fridge` : undefined, onSelect: () => app.toggleOptionEaten(s.key, d.id, !d.eaten) },
              ...alts.slice(0, 3).map((a) => ({ label: `Swap → ${a.label}`, hint: a.macros ? `${Math.round(a.macros.p)}P` : undefined, onSelect: () => app.setRotationVariant(s.key, a.id, d.id) })),
              d.variantId ? { label: `Back to ${d.name}`, onSelect: () => app.setRotationVariant(s.key, null, d.id) } : null,
              { label: 'Open recipe', onSelect: () => app.openRecipe(d.id) },
              { label: `Remove from ${s.name}`, danger: true, onSelect: () => app.toggleRotationSlot(s.key, d.id) },
            ],
          }),
        };
      }),
      clearVariant: filled?.variant ? () => app.setRotationVariant(s.key, null, filled.id) : null,
      open: filled ? () => app.openRecipe(filled.id) : null,
      toggleConsumed: filled ? () => app.toggleOptionEaten(s.key, filled.id, !filled.consumed) : null,
      // extra meals he added can go again once they are empty
      removeSlot: s.custom && !options.length ? () => app.removeRotationSlot(s.key) : null,
      rename: s.custom ? (label) => app.renameRotationSlot(s.key, label) : null,
      clear: filled ? () => {
        app.toggleRotationSlot(s.key, filled.id);
        if (s.key === 'extra') app.setState({ rotationShowExtra: false });
      } : null,
      // spec #13: hold a meal card for its secondary actions — variants,
      // eaten toggle, the recipe itself — direct manipulation, never a chat
      onLongPress: filled ? ({ x, y }) => {
        const recipe = (st.liveRecipes || []).find((r) => r.id === filled.id);
        const alts = (recipe?.alternates || []).filter((a) => a.id !== filled.variantId);
        app.openContextMenu({
          x, y, title: `${s.name.toUpperCase()} · ${filled.name.toUpperCase()}`,
          items: [
            { label: filled.consumed ? 'Mark not eaten' : 'Mark eaten', hint: `${Math.round(filled.macros.p)}P · ${Math.round(filled.macros.kcal)} kcal`, onSelect: () => app.toggleSlotConsumed(s.key, !filled.consumed) },
            ...alts.slice(0, 3).map((a) => ({ label: `Swap → ${a.label}`, hint: a.macros ? `${Math.round(a.macros.p)}P` : undefined, onSelect: () => app.setRotationVariant(s.key, a.id, filled.id) })),
            filled.variant ? { label: `Back to ${filled.name}`, onSelect: () => app.setRotationVariant(s.key, null, filled.id) } : null,
            { label: 'Open recipe', onSelect: () => app.openRecipe(filled.id) },
            { label: 'Clear slot', danger: true, onSelect: () => { app.toggleRotationSlot(s.key, filled.id); if (s.key === 'extra') app.setState({ rotationShowExtra: false }); } },
          ],
        });
      } : null,
    };
  });
  const rotTot = rotation?.totals || { p: 0, c: 0, f: 0, kcal: 0 };
  // TODAY's log always feeds the gauges — the retro view below never does.
  // Rotation meals now WRITE into the food log when ticked (source:
  // 'rotation'), so this single sum is the whole day — no join, and no
  // double-count. Legacy days logged before that change carry no rotation
  // entries, so their consumedTotals are added back once, for today only.
  const foodLogEntries = st.liveFoodLog?.entries || [];
  const sumOf = (list) => list.reduce((acc, e) => ({ p: acc.p + e.macros.p, c: acc.c + e.macros.c, f: acc.f + e.macros.f, kcal: acc.kcal + e.macros.kcal }), { p: 0, c: 0, f: 0, kcal: 0 });
  // v2: the log carries one entry per (slot, recipe); a legacy entry with no
  // recipeId covers the slot's focused dish
  const logged = new Set(foodLogEntries.filter((e) => e.source === 'rotation').map((e) => `${e.slot}|${e.recipeId || ''}`));
  const isLogged = (slot, id, focus) => logged.has(`${slot}|${id}`) || (focus && logged.has(`${slot}|`));
  // per dish: count an eaten option ONLY if the log doesn't already carry it
  const rotConsumedTot = Object.entries(rotation?.options || {}).reduce((acc, [slot, dishes]) => dishes.reduce((a, d) => (
    !d.eaten || !d.macros || isLogged(slot, d.id, d.focus) ? a : {
      p: a.p + d.macros.p, c: a.c + d.macros.c, f: a.f + d.macros.f, kcal: a.kcal + d.macros.kcal,
    }
  ), acc), { p: 0, c: 0, f: 0, kcal: 0 });
  const foodLogTot = sumOf(foodLogEntries);
  // retro tracking: when a past day is selected the log pane shows THAT
  // day's entries (loaded into liveFoodLogView); adds/removes go there too
  const viewingPastDay = !!st.foodLogDate;
  const viewEntries = viewingPastDay ? (st.liveFoodLogView?.entries || []) : foodLogEntries;
  const viewTot = viewingPastDay
    ? viewEntries.reduce((acc, e) => ({ p: acc.p + e.macros.p, c: acc.c + e.macros.c, f: acc.f + e.macros.f, kcal: acc.kcal + e.macros.kcal }), { p: 0, c: 0, f: 0, kcal: 0 })
    : foodLogTot;

  // protein gauge — tracks what's actually been marked eaten today (rotation
  // slots marked consumed, plus anything logged off-plan) rather than the
  // day's full plan, so it climbs through the day instead of sitting at the
  // planned total from the moment a meal is picked
  // Live mode NEVER invents a floor: if the vault's Profile line is missing or
  // fails to parse, the target is honestly unknown (null) — a fictional 180
  // here once meant the gauge tracked a number Hayden never set. Demo keeps
  // its scripted 180 under the demo banner.
  const proteinTarget = usingLiveRecipes ? (profile ? profile.proteinFloorG : null) : 180;
  const proteinCurrent = usingLiveRecipes ? rotConsumedTot.p + foodLogTot.p : 96;
  const proteinRatio = proteinTarget > 0 ? Math.min(1, proteinCurrent / proteinTarget) : 0;
  const proteinGap = proteinTarget != null ? Math.round(proteinTarget - proteinCurrent) : null;
  const proteinNextSlot = visibleSlotDefs.find((s) => !rotation?.slots?.[s.key]?.consumed);
  const proteinNextSlotFilled = proteinNextSlot ? rotation?.slots?.[proteinNextSlot.key] : null;

  // Search + "fits what's left": a growing bank behind three category chips
  // was becoming unbrowsable, and the genuinely useful question at 8pm is
  // "what can I still eat tonight?" — answered from his real remaining
  // kcal/protein, not a guess.
  const q = (st.recipeSearch || '').trim().toLowerCase();
  const kcalLeft = profile?.targetKcal != null ? profile.targetKcal - (rotConsumedTot.kcal + foodLogTot.kcal) : null;
  const fitsOnly = !!st.recipeFitsOnly && kcalLeft != null;
  const recipeList = usingLiveRecipes
    ? st.liveRecipes
        .filter(r => st.recipeFilter === 'All' || RECIPE_CATEGORY_LABEL[r.category] === st.recipeFilter)
        .filter(r => !q || r.name.toLowerCase().includes(q)
          || (r.ingredients || []).some(i => String(i.name || i).toLowerCase().includes(q)))
        .filter(r => !fitsOnly || (r.macros?.kcal ?? 0) <= kcalLeft)
        .map((r, i) => {
          const tot = (r.macros.p + r.macros.c + r.macros.f) || 1;
          const hue = RECIPE_HUES[i % RECIPE_HUES.length];
          const bar = (v, col) => ({ flex: String(v / tot), borderRadius: '2px', background: col });
          return { name: r.name, tag: RECIPE_CATEGORY_LABEL[r.category] || r.category, p: r.macros.p, c: r.macros.c, f: r.macros.f, kcal: r.macros.kcal, time: r.makes || '',
            // the card carries the shared name ONLY while its overlay is shut —
            // two elements may never hold the same view-transition-name at once
            vtName: st.openRecipeId === r.id ? undefined : `recipe-${r.id}`,
            open: () => app.openRecipe(r.id),
            logIt: () => app.openPortionSheet({ name: r.name, macros: r.macros, source: 'recipe' }),
            photoUrl: st.liveRecipePhotoUrls[r.id] || null,
            phLabel: 'dish photo — ' + r.name.toLowerCase(),
            phStyle: { height: '104px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg, rgba(' + hue + ',.13) 0 8px, rgba(' + hue + ',.04) 8px 16px)' },
            pBar: bar(r.macros.p, 'var(--nv-cy)'), cBar: bar(r.macros.c, 'var(--nv-gold)'), fBar: bar(r.macros.f, 'var(--nv-vi)'),
            // v2: a chip is lit when the recipe is one of the slot's OPTIONS;
            // tapping adds or removes it — it never replaces what is there
            slotToggles: rotationOrder.map(slotDefFor).map((s) => ({ key: s.key, label: s.custom ? s.name.slice(0, 1).toUpperCase() : s.label, title: s.name, hue: s.hue, active: (rotation?.options?.[s.key] || []).some((d) => d.id === r.id), onClick: () => app.toggleRotationSlot(s.key, r.id) })) };
        })
    : app.recipes.filter(r => st.recipeFilter === 'All' || r.filter === st.recipeFilter).map(r => {
        const tot = r.p + r.c + r.f;
        const bar = (v, col) => ({ flex: String(v / tot), borderRadius: '2px', background: col });
        return { name: r.name, tag: r.tag, p: r.p, c: r.c, f: r.f, kcal: r.kcal, time: r.time,
          open: () => app.setState({ openRecipeId: r.id, servings: 1, recipeChat: [], recipeInput: '' }),
          phLabel: 'dish photo — ' + r.name.toLowerCase(),
          phStyle: { height: '104px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg, rgba(' + r.hue + ',.13) 0 8px, rgba(' + r.hue + ',.04) 8px 16px)' },
          pBar: bar(r.p, 'var(--nv-cy)'), cBar: bar(r.c, 'var(--nv-gold)'), fBar: bar(r.f, 'var(--nv-vi)'), slotToggles: [] };
      });

  const liveOr = usingLiveRecipes ? (st.liveRecipes.find(r => r.id === st.openRecipeId) || null) : null;
  // if the open recipe sits in a rotation slot today, per-day variant actions apply
  // v2: the recipe may be one of several options in a slot, focused or not
  const openRecipeSlotKey = liveOr && rotation?.options
    ? (Object.entries(rotation.options).find(([, dishes]) => dishes.some((d) => d.id === liveOr.id))?.[0] || null)
    : null;
  const openRecipeSlotVariantId = openRecipeSlotKey ? (rotation.options[openRecipeSlotKey].find((d) => d.id === liveOr.id)?.variantId || null) : null;
  const or = usingLiveRecipes ? null : app.recipes.find(r => r.id === st.openRecipeId);
  const sv = usingLiveRecipes ? 1 : st.servings; // no serving-scaling for live recipes — ingredients are free text, not [qty,unit] tuples

  // when viewing a live recipe, an alternate (a Nova-suggested tweak the user
  // chose to keep) can stand in for the original's macros/ingredients/method
  const activeAlt = liveOr ? (liveOr.alternates || []).find((a) => a.id === st.recipeAltSelected) || null : null;
  const effMacros = activeAlt ? activeAlt.macros : (liveOr ? liveOr.macros : null);
  const effIngredients = activeAlt ? activeAlt.ingredients.map((name) => ({ qty: '', name })) : (liveOr ? liveOr.ingredients : []);
  const effMethod = activeAlt ? activeAlt.method : (liveOr ? liveOr.method : []);

  // shared with valsMission (protein gauge + the home BODY strip's fuel tile —
  // same eaten-today truth as the Recipes EATEN TODAY strip)
  Object.assign(ctx, { usingLiveRecipes, rotation, profile, proteinTarget, proteinCurrent, proteinRatio, proteinGap, proteinNextSlot, proteinNextSlotFilled,
    kcalCurrent: rotConsumedTot.kcal + foodLogTot.kcal, targetKcal: profile ? profile.targetKcal : null });

  // PICK IT UP (his reel, 26 Sep): "500 kcal and 50 g protein left, I'm out,
  // what do I get?" — every chain and supermarket item that fits. Nova already
  // knows both numbers, so the finder opens PREFILLED from the same kcalLeft
  // and proteinGap the hero draws; nothing here is a second reading of the day.
  const pickItUp = (() => {
    const available = usingLiveRecipes;
    const prefill = {
      kcal: kcalLeft != null ? Math.max(0, Math.round(kcalLeft)) : null,
      p: proteinTarget != null && proteinGap != null ? Math.max(0, proteinGap) : null,
    };
    const budget = eatOutBudget(st, prefill);
    const params = eatOutParams(st, prefill);
    const summary = st.liveEatOut;
    const res = st.eatOutResults;
    const kcalTarget = profile?.targetKcal ?? null;
    const carbTarget = profile?.carbTargetG ?? null;
    const fatTarget = profile?.fatTargetG ?? null;
    const numOf = (s) => (s !== '' && Number.isFinite(Number(s)) ? Number(s) : null);
    // each ring's arc is the figure against today's own denominator; carbs
    // and fat have none today (his profile carries no split), so a typed cap
    // draws a full ring in its hue — "a limit is set" — and a blank one is
    // the dashed gap, never a zero
    const ring = (key, label, hue, target) => {
      const n = numOf(budget[key]);
      const state = n == null ? 'gap' : 'arc';
      const pct = n == null ? 0 : target > 0 ? Math.max(0, Math.min(100, Math.round((n / target) * 100))) : 100;
      return {
        key, label, hue, value: budget[key], pct, state,
        prefilled: budget.prefilled[key],
        source: n == null ? 'blank' : budget.prefilled[key] ? 'from today' : 'yours',
        of: target > 0 ? target : null,
        set: (val) => app.setEatOutBudget(key, val, prefill),
      };
    };
    const rings = [
      ring('kcal', 'kcal', 'var(--nv-good)', kcalTarget),
      ring('p', 'protein', 'var(--nv-cy)', proteinTarget),
      ring('c', 'carbs', 'var(--nv-gold)', carbTarget),
      ring('f', 'fat', 'var(--nv-vi)', fatTarget),
    ];
    const selected = new Set(st.eatOutBrands || []);
    const brands = (summary?.brands || [])
      .filter((b) => (st.eatOutKind || 'all') === 'all' || b.kind === st.eatOutKind)
      // a brand with nothing in it has nothing to offer a chip; a brand whose
      // last refresh failed still searches (its old items are real) but says
      // so on the chip — never quietly fresh
      .filter((b) => b.count > 0)
      .map((b) => ({ key: b.key, name: b.name, kind: b.kind, count: b.count, active: selected.has(b.key), stale: !!b.lastError,
        title: b.lastError ? `${b.count} items · last refresh failed: ${b.lastError}` : `${b.count} items`,
        toggle: () => app.toggleEatOutBrand(b.key, prefill) }));
    const macroBar = (m) => {
      const tot = (m.p + m.c + m.f) || 1;
      const bar = (v, col) => ({ flex: String(v / tot), borderRadius: '2px', background: col });
      return { pBar: bar(m.p, 'var(--nv-cy)'), cBar: bar(m.c, 'var(--nv-gold)'), fBar: bar(m.f, 'var(--nv-vi)') };
    };
    const fitOf = (fit) => ({
      kcalUse: fit?.kcalUse ?? null,
      proteinHit: fit?.proteinHit ?? null,
      proteinGap: fit?.proteinGap != null ? Math.round(fit.proteinGap) : null,
    });
    const macrosOf = (m) => ({ p: Math.round(m?.p || 0), c: Math.round(m?.c || 0), f: Math.round(m?.f || 0), kcal: Math.round(m?.kcal || 0) });
    const mapItem = (it) => {
      const macros = macrosOf(it.macros);
      return {
        id: it.id, name: it.name, brand: it.brand, brandKey: it.brandKey,
        kind: it.kind === 'supermarket' ? 'Supermarket' : 'Takeaway',
        serve: it.serve || (it.grams ? `${it.grams} g` : ''),
        macros, ...fitOf(it.fit), ...macroBar(macros),
        log: () => app.logEatOut(it),
      };
    };
    const results = (res?.items || []).map(mapItem);
    const pairs = (res?.pairs || []).map((pr, i) => {
      const macros = macrosOf(pr.macros);
      return {
        id: `pair-${i}-${(pr.items || []).map((x) => x.id).join('+')}`,
        items: (pr.items || []).map(mapItem),
        macros, ...fitOf(pr.fit), ...macroBar(macros),
        log: () => app.logEatOut(pr),
      };
    });
    const count = res?.count ?? (results.length + pairs.length);
    const catalogueEmpty = res ? !!res.catalogueEmpty : summary ? !(summary.total > 0) : false;
    // the catalogue's own receipt: how many, how many chains, when, from where
    const fmtDay = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? dtf('en-AU', { day: 'numeric', month: 'short' }).format(d) : null; };
    const sourceWords = [...new Set((summary?.brands || []).map((b) => b.source?.kind))]
      .map((k) => (k === 'off' ? 'Open Food Facts' : k === 'pdf' ? 'the chains’ own sheets' : k === 'site' ? 'the chains’ own menu data' : null)).filter(Boolean);
    const summaryLine = summary && summary.total > 0
      ? `${summary.total.toLocaleString()} items · ${summary.brands.length} brand${summary.brands.length === 1 ? '' : 's'}${fmtDay(summary.updatedAt) ? ` · fetched ${fmtDay(summary.updatedAt)}` : ''}${sourceWords.length ? `, from ${sourceWords.join(' and ')}` : ''}`
      : '';
    const countLine = summary && summary.total > 0 ? `${summary.total.toLocaleString()} items · ${summary.brands.length} brand${summary.brands.length === 1 ? '' : 's'}` : '';
    let emptyLine = '';
    if (catalogueEmpty) emptyLine = 'No catalogue yet, so there is nothing to search.';
    else if (!eatOutHasBudget(params)) emptyLine = prefill.kcal == null && prefill.p == null
      ? 'No calorie or protein target is set, so there is nothing to prefill. Type a budget.'
      : 'The budget is blank. Type at least one figure.';
    else if (res && !results.length && !pairs.length) {
      const pNum = Number(params.p);
      // at 8am the whole day's protein is still to go, and no single thing
      // on a shelf carries 120 g of it — say that, rather than leave a
      // silence that reads as "the catalogue is useless"
      emptyLine = params.kcal === '0'
        ? 'Today’s calories are spent. Type a budget to look anyway.'
        : pNum >= 60 && st.eatOutMode !== 'pairs'
          ? `Nothing on its own gets near ${Math.round(pNum)} g protein. Try Pairings, or type the protein for this one meal.`
          : 'Nothing in the catalogue fits that budget.';
    }
    return {
      available,
      open: !!st.eatOutOpen,
      toggle: () => (st.eatOutOpen ? app.setState({ eatOutOpen: false }) : app.openEatOut(prefill)),
      // the collapsed row's two rings: what is left of today, drawn
      glance: {
        kcal: prefill.kcal, kcalPct: prefill.kcal != null && kcalTarget > 0 ? Math.min(100, Math.round((prefill.kcal / kcalTarget) * 100)) : null,
        p: prefill.p, pPct: prefill.p != null && proteinTarget > 0 ? Math.min(100, Math.round((prefill.p / proteinTarget) * 100)) : null,
      },
      noTargets: prefill.kcal == null && prefill.p == null,
      budget, rings,
      brands,
      missing: (summary?.missing || []).map((m) => ({ name: m.name, why: m.why })),
      kind: st.eatOutKind || 'all',
      setKind: (k) => app.setEatOutKind(k, prefill),
      mode: st.eatOutMode || 'single',
      setMode: (m) => app.setEatOutMode(m, prefill),
      busy: !!st.eatOutBusy,
      searched: !!res,
      results, pairs, count, catalogueEmpty,
      summaryLoaded: !!summary,
      summaryLine, countLine,
      refresh: () => app.refreshEatOut(),
      refreshing: !!st.eatOutRefreshJob,
      emptyLine,
    };
  })();

  return {
    pickItUp,
    // recipes
    recipesHeaderLabel: usingLiveRecipes ? `${st.liveRecipes.length} recipes · live from Obsidian` : `${app.recipes.length} recipes · demo data`,
    recipeFilters: filters.map(f => ({ label: f, go: () => app.setState({ recipeFilter: f }), active: st.recipeFilter === f })),
    recipeSearch: st.recipeSearch || '',
    setRecipeSearch: (e) => app.setState({ recipeSearch: typeof e === 'string' ? e : e.target.value }),
    // "what can I still eat tonight?" — from real remaining kcal, or hidden
    // entirely when no target is set (never invent a budget)
    recipeFitsAvailable: usingLiveRecipes && kcalLeft != null,
    recipeFitsOn: !!st.recipeFitsOnly,
    recipeFitsLabel: kcalLeft != null ? `FITS ${Math.max(0, Math.round(kcalLeft))} KCAL LEFT` : '',
    toggleRecipeFits: () => app.setState({ recipeFitsOnly: !st.recipeFitsOnly }),
    recipeCount: recipeList.length,
    recipeList,

    // today-so-far strip at the top of Recipes: everything actually marked
    // eaten (rotation slots consumed + off-plan log), same truth as the home
    // protein gauge but with all four macros at a glance
    dayMacros: usingLiveRecipes ? {
      p: Math.round(rotConsumedTot.p + foodLogTot.p),
      c: Math.round(rotConsumedTot.c + foodLogTot.c),
      f: Math.round(rotConsumedTot.f + foodLogTot.f),
      kcal: Math.round(rotConsumedTot.kcal + foodLogTot.kcal),
      proteinTarget,
      proteinPct: proteinTarget ? Math.min(100, Math.round(((rotConsumedTot.p + foodLogTot.p) / proteinTarget) * 100)) : null,
      targetKcal: profile ? profile.targetKcal : null,
    } : null,

    // the redesigned Fuel hero: ring + coloured macros + the gap-fill line
    // ("54g to go — dinner covers 44, the pouch does the last 10") — the
    // feature he called out as loved; deterministic, always honest
    // TRAINING × FUEL — the cross-reference agent's card on the Fuel screen
    // (mockup v2): the sharpest finding with the draft action. Hidden when
    // the agent has nothing true to say — never filler.
    askProteinVerdict: usingLiveRecipes ? () => app.openVerdict('protein') : null,
    fuelCross: (() => {
      if (!usingLiveRecipes) return null;
      const xc = st.liveFuelCross;
      // a source the agent could not read is the one thing this card must
      // never hide — hidden used to mean "all clear", and "couldn't check"
      // was indistinguishable from it
      if (xc?.couldntLook) return { couldntLook: true, line: `${xc.couldntLook}. Not a clean bill — fix the source, or distrust the silence.`, draft: null };
      const f = (xc?.findings || [])[0];
      if (!f) return null;
      return {
        couldntLook: false,
        line: f.line,
        severity: f.severity || 'medium',
        // THE PAYLOAD OF A FIVE-LINE PARAGRAPH IS TWO NUMBERS (finding 15).
        // "training days average 2,065 kcal against the 2,668 target" is one
        // comparison and one distance, and §2b r7 says a number gets a form.
        // Every finding in server/lib/fuelCross.js carries its own `data`
        // with the pair already computed, so this is a lookup, not a parse of
        // the prose. A kind whose payload ISN'T two comparable magnitudes
        // (post-training, floor-pattern — those are "N of M days") returns
        // null and the card stays prose, rather than drawing a bar chart of
        // a ratio it would be lying about.
        bars: crossBars(f.data, f.metric),
        draft: () => { app.navigate('workouts', { trainTab: 'coach' }); app.doCoach(`Your fuel cross-check flags: ${f.line} Draft the concrete fix — a rotation swap, a target change, whatever actually closes it — as a proposal I can approve.`); },
      };
    })(),
    fuelHero: usingLiveRecipes && proteinTarget != null ? (() => {
      const gap = Math.max(0, Math.round(proteinTarget - proteinCurrent));
      const unconsumed = Object.entries(rotation?.slots || {})
        .filter(([, r]) => r && !r.consumed && r.macros)
        .map(([slot, r]) => ({ slot, name: r.name, p: Math.round(r.macros.p) }))
        .sort((a, b) => b.p - a.p);
      let gapText;
      if (gap === 0) gapText = 'Protein floor hit — everything above is bonus.';
      else if (!unconsumed.length) gapText = `${gap}g protein to go — nothing left in the rotation; the bank's FITS filter has options.`;
      else {
        const picks = [];
        let need = gap;
        for (const m of unconsumed) { if (need <= 0) break; picks.push(m); need -= m.p; }
        const cover = picks.map((m) => `${m.slot} covers ${m.p}`).join(', ');
        gapText = need <= 0
          ? `${gap}g to go — ${cover}${picks.length && picks[picks.length - 1].p >= need + picks[picks.length - 1].p ? '' : ''}.`
          : `${gap}g to go — ${cover}, still ${need}g short: add something from the bank.`;
      }
      // THE THREE MACROS, AS THREE CONCENTRIC ARCS (aesthetic review 22 Sep,
      // finding 15). The hues are fixed on this screen and pinned by
      // foodLogSurface.test.js — protein cyan, carbs gold, fat violet, the
      // same three these macros wear on every quick-log card — so the order
      // here IS the drawing order, outermost first.
      //
      // A macro with NO TARGET draws NO ARC. His profile carries exactly
      // four keys (parseProfile in server/lib/recipes.js: proteinFloorG,
      // targetKcal, weightKg, heightCm) and a carb or fat target is not one
      // of them, so today only protein has a denominator. Deriving one from
      // the kcal remainder would be Nova claiming a split he never set. The
      // reads below name the keys the Intake would write if it ever did, so
      // the arcs light the day the collection grows them.
      const carbTarget = profile?.carbTargetG ?? null;
      const fatTarget = profile?.fatTargetG ?? null;
      // A GAP IS A DASHED RING, NEVER A ZERO (§2b r2). RingTile has drawn it
      // that way since 5 Sep; the Fuel hero was the one ring in the app
      // still painting a solid dim circle at 0 of 150, which reads as a bad
      // day rather than a day nothing has been logged on. `hero` is the
      // outer ring, which owns a background track and therefore always draws
      // SOMETHING — an unknown target makes it a gap; an inner arc with no
      // target simply is not there.
      const macroState = (eaten, target, hero) => {
        if (!(target > 0)) return hero ? 'absent' : 'none';
        return eaten > 0 ? 'arc' : 'absent';
      };
      const macro = (key, name, hue, eaten, target, hero) => ({
        key, name, hue, eaten, target,
        state: macroState(eaten, target, hero),
        pct: target > 0 ? Math.min(100, Math.round((eaten / target) * 100)) : null,
      });
      const cEaten = Math.round(rotConsumedTot.c + foodLogTot.c);
      const fEaten = Math.round(rotConsumedTot.f + foodLogTot.f);
      return {
        p: Math.round(proteinCurrent), target: proteinTarget,
        pct: Math.min(100, Math.round((proteinCurrent / proteinTarget) * 100)),
        kcal: Math.round(rotConsumedTot.kcal + foodLogTot.kcal),
        kcalTarget: profile?.targetKcal ?? null,
        // THE CALORIE RING (his ask, 26 Sep: "a ring for both calories and
        // protein"). Calories used to be only the figure inside the macro
        // ring, so the one number he budgets against had no form. It is its
        // own ring now, in the calorie green; past the target the arc stays
        // full and turns warn, because over is a verdict, not more progress.
        // No target, or nothing logged, is the dashed gap, never a zero arc.
        kcalRing: (() => {
          const eaten = Math.round(rotConsumedTot.kcal + foodLogTot.kcal);
          const target = profile?.targetKcal ?? null;
          const over = target > 0 && eaten > target;
          return {
            eaten, target,
            state: target > 0 && eaten > 0 ? 'arc' : 'absent',
            pct: target > 0 ? Math.min(100, Math.round((eaten / target) * 100)) : 0,
            hue: over ? 'var(--nv-warn)' : 'var(--nv-good)',
            over,
          };
        })(),
        c: cEaten,
        f: fEaten,
        kcalLeft: kcalLeft != null ? Math.max(0, Math.round(kcalLeft)) : null,
        gapText,
        macros: [
          macro('p', 'Protein', 'var(--nv-cy)', Math.round(proteinCurrent), proteinTarget, true),
          macro('c', 'Carbs', 'var(--nv-gold)', cEaten, carbTarget, false),
          macro('f', 'Fat', 'var(--nv-vi)', fEaten, fatTarget, false),
        ],
      };
    })() : null,

    // daily rotation — real meal-slot picks + aggregate macros, live only
    rotationVisible: usingLiveRecipes,
    rotationSlots,
    rotationTotals: { p: Math.round(rotTot.p), c: Math.round(rotTot.c), f: Math.round(rotTot.f), kcal: Math.round(rotTot.kcal) },
    rotationTargetKcal: profile ? profile.targetKcal : null,
    rotationProteinFloor: profile ? profile.proteinFloorG : null,
    // the old + 4TH MEAL button is retired (7 Sep): ADD A MEAL below covers it and names the meal; the legacy extra slot still shows once it holds something
    rotationShowExtraButton: false,
    // v2: a meal beyond the five — the button is on the strip itself, so he can find it
    rotationAddMeal: usingLiveRecipes ? (label) => app.addRotationSlot(label) : null,
    showExtraMealSlot: () => app.setState({ rotationShowExtra: true }),

    // off-plan food log — quick-add anything eaten that wasn't a rotation
    // recipe, so the protein tracker reflects reality rather than just the plan
    foodLogVisible: usingLiveRecipes,
    // the week at a glance — calendar-true days from the archive (all four
    // macros), rendered with the same component the voice panel uses
    fuelWeek: usingLiveRecipes ? (st.liveNutritionWeek || null) : null,
    // the pane renders the SELECTED day (today by default, a past day when
    // the retro strip picks one) — gauges elsewhere stay on today's numbers
    // THE ITEMISED PLATE — the lines a photo or a sentence produced, kept
    // instead of collapsed, each one droppable on its own (the entry's total
    // is the server's sum of them, so the arithmetic can never drift).
    foodLogEntries: viewEntries.map((e) => ({
      id: e.id, time: e.time, name: e.name,
      items: (e.items || []).map((it) => ({
        id: it.id, name: it.name, grams: it.grams || null,
        macros: `${Math.round(it.macros.p)}P · ${Math.round(it.macros.kcal)} kcal`,
        source: it.source || null, sourced: !!it.sourced,
        remove: () => app.deleteFoodLogItem(e.id, it.id),
      })),
      p: Math.round(e.macros.p), c: Math.round(e.macros.c), f: Math.round(e.macros.f), kcal: Math.round(e.macros.kcal),
      remove: () => app.deleteFoodLogEntry(e.id),
      edited: !!e.edited,
      edit: () => app.startFoodEntryEdit({ id: e.id, name: e.name, p: Math.round(e.macros.p), c: Math.round(e.macros.c), f: Math.round(e.macros.f), kcal: Math.round(e.macros.kcal) }),
      editing: st.foodEditId === e.id,
    })),
    // one tap back from a line he dropped — visible, not just a toast
    foodItemUndo: st.foodItemUndo ? {
      label: `Undo — put ${st.foodItemUndo.item?.name || 'that line'} back`,
      run: () => app.undoFoodLogItem(),
    } : null,
    // the breakdown a scan produced, before he logs it
    foodLogPending: st.foodLogItems?.length ? {
      count: st.foodLogItems.length,
      lines: st.foodLogItems.map((it, i) => ({
        key: `${i}-${it.name}`,
        name: it.name,
        grams: it.grams || null,
        macros: `${Math.round(it.macros?.p ?? it.p ?? 0)}P · ${Math.round(it.macros?.kcal ?? it.kcal ?? 0)} kcal`,
        source: it.source || null,
        // a line his last correction changed or added — the card lights it
        fresh: !!it.fresh && (st.foodRefineThread || []).length > 0,
      })),
    } : null,
    foodEdit: st.foodEditId ? {
      name: st.foodEditName,
      setName: (ev) => app.setState({ foodEditName: typeof ev === 'string' ? ev : ev.target.value }),
      fields: [
        { key: 'p', label: 'P', value: st.foodEditP, set: (ev) => app.setState({ foodEditP: ev.target.value }) },
        { key: 'c', label: 'C', value: st.foodEditC, set: (ev) => app.setState({ foodEditC: ev.target.value }) },
        { key: 'f', label: 'F', value: st.foodEditF, set: (ev) => app.setState({ foodEditF: ev.target.value }) },
        { key: 'kcal', label: 'KCAL', value: st.foodEditKcal, set: (ev) => app.setState({ foodEditKcal: ev.target.value }) },
      ],
      quick: PORTIONS.filter((pn) => pn.factor < 1).map((pn) => ({
        label: pn.label, apply: () => app.scaleFoodEntryEdit(pn.factor),
      })),
      save: () => app.saveFoodEntryEdit(),
      cancel: () => app.cancelFoodEntryEdit(),
    } : null,
    foodLogTotals: { p: Math.round(viewTot.p), c: Math.round(viewTot.c), f: Math.round(viewTot.f), kcal: Math.round(viewTot.kcal) },
    // retro day strip: today + the last 6 days, tappable on both devices
    foodLogDays: (() => {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const date = i === 0 ? null : iso; // null = today (the default view)
        days.push({
          key: iso,
          label: i === 0 ? 'TODAY' : i === 1 ? 'YST' : dtf('en-AU', { weekday: 'short', day: 'numeric' }).format(d).toUpperCase(),
          active: (st.foodLogDate || null) === date,
          pick: () => app.setFoodLogDate(date),
        });
      }
      return days;
    })(),
    foodLogViewingLabel: viewingPastDay
      ? `LOGGING TO ${new Date(st.foodLogDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()} — entries land on that day`
      : null,
    foodLogName: st.foodLogName,
    setFoodLogName: (e) => app.setFoodLogField('foodLogName', e),
    foodLogP: st.foodLogP,
    setFoodLogP: (e) => app.setFoodLogField('foodLogP', e),
    foodLogC: st.foodLogC,
    setFoodLogC: (e) => app.setFoodLogField('foodLogC', e),
    foodLogF: st.foodLogF,
    setFoodLogF: (e) => app.setFoodLogField('foodLogF', e),
    foodLogKcal: st.foodLogKcal,
    setFoodLogKcal: (e) => app.setFoodLogField('foodLogKcal', e),
    foodLogBusy: st.foodLogBusy,
    foodLogError: st.foodLogError,
    submitFoodLog: () => app.submitFoodLog(),
    // describe-it search — words instead of photos, same preview path
    foodDescribeInput: st.foodDescribeInput || '',
    setFoodDescribeInput: (e) => app.setState({ foodDescribeInput: typeof e === 'string' ? e : e.target.value }),
    foodDescribeValue: st.foodDescribeInput || '',
    describeFoodKey: (e) => { if (e.key === 'Enter') app.describeFoodSearch(); },
    describeFoodSearch: () => app.describeFoodSearch(),
    // the submit control the input bar never actually had — the code comment
    // claimed "Enter or the arrow submits", but only Enter existed, so on a
    // phone there was nothing to tap and searching looked broken
    canDescribeFood: !st.foodScanBusy && (st.foodDescribeInput || '').trim().length >= 3,

    // ---- log a portion of a recipe he already has ----
    foodRecipePickerOpen: !!st.foodRecipePickerOpen,
    openFoodRecipePicker: () => app.openFoodRecipePicker(),
    closeFoodRecipePicker: () => app.closeFoodRecipePicker(),
    foodRecipePickerQuery: st.foodRecipePickerQuery || '',
    setFoodRecipePickerQuery: (e) => app.setState({ foodRecipePickerQuery: typeof e === 'string' ? e : e.target.value }),
    foodRecipeOptions: (() => {
      const q = String(st.foodRecipePickerQuery || '').trim().toLowerCase();
      return (st.liveRecipes || [])
        .filter((r) => r.macros && (!q || r.name.toLowerCase().includes(q)))
        .slice(0, 40)
        .map((r) => ({
          id: r.id, name: r.name, macros: r.macros,
          sub: `${r.macros.p}P · ${r.macros.c}C · ${r.macros.f}F · ${r.macros.kcal} kcal${r.makes ? ` · ${r.makes}` : ''}`,
          active: st.foodRecipePick?.id === r.id,
          pick: () => app.pickFoodRecipe(r),
        }));
    })(),
    foodRecipePick: st.foodRecipePick ? (() => {
      const custom = String(st.foodPortionCustom || '').trim();
      const factor = custom ? Number(custom) : st.foodPortionFactor;
      const ok = validPortion(factor);
      const scaled = ok ? scaleMacros(st.foodRecipePick.macros, factor) : null;
      return {
        name: st.foodRecipePick.name,
        base: st.foodRecipePick.macros,
        portions: PORTIONS.map((pn) => ({
          label: pn.label, factor: pn.factor,
          active: !custom && Math.abs(st.foodPortionFactor - pn.factor) < 0.001,
          pick: () => app.setState({ foodPortionFactor: pn.factor, foodPortionCustom: '' }),
        })),
        custom,
        setCustom: (e) => app.setState({ foodPortionCustom: typeof e === 'string' ? e : e.target.value }),
        valid: ok,
        preview: scaled ? `${scaled.p}P · ${scaled.c}C · ${scaled.f}F · ${scaled.kcal} kcal` : 'Enter a portion between a sliver and 20 servings',
        loggedName: ok ? portionName(st.foodRecipePick.name, factor) : null,
        confirm: () => app.logRecipePortion(),
      };
    })() : null,
    foodScanNote: st.foodScanNote,
    setFoodScanNote: (e) => app.setFoodScanNote(e),
    foodScanBusy: st.foodScanBusy,
    // a search past its first few seconds gets a second line rather than
    // leaving him staring at a static bar wondering if the tap registered
    foodScanSlow: !!(st.foodScanBusy && st.foodScanSlow),
    foodScanError: st.foodScanError,
    foodScanQuestion: st.foodScanQuestion,
    // answering is optional — refine re-runs the same photos with the Q&A in
    // the note; the filled fields stay saveable as-is either way
    foodScanAnswer: st.foodScanAnswer,
    setFoodScanAnswer: (e) => app.setState({ foodScanAnswer: e.target.value }),
    // an answer refines in words once there is a plate on screen (26 Sep)
    foodScanCanAnswer: (st.foodScanQAPhotos || []).length > 0 || !!st.foodEstimateLines?.length || !!(st.foodLogName || '').trim(),
    // CORRECT IT IN WORDS, AS OFTEN AS HE LIKES, BEFORE IT IS LOGGED (26 Sep).
    // Offered the moment an estimate exists; each turn shows what changed.
    foodRefine: st.foodEstimateLines?.length ? {
      value: st.foodRefineInput || '',
      set: (e) => app.setState({ foodRefineInput: typeof e === 'string' ? e : e.target.value }),
      send: () => app.refineFoodEstimate(),
      busy: !!st.foodScanBusy,
      thread: (st.foodRefineThread || []).map((t, i) => ({
        key: `${i}-${t.said}`,
        said: t.said,
        changes: t.changes || (t.removed.length || t.added.length ? '' : 'Nothing needed changing.'),
        removed: t.removed,
        added: t.added,
        delta: t.kcalDelta ? `${t.kcalDelta > 0 ? '+' : '−'}${Math.abs(t.kcalDelta)} kcal` : null,
        up: t.kcalDelta > 0,
      })),
    } : null,
    answerFoodScan: () => app.answerFoodScan(),
    dismissFoodScanQuestion: () => app.dismissFoodScanQuestion(),
    // multi-photo staging — add several (labels and/or the food), then analyze together
    foodScanPhotos: (st.foodScanPhotos || []).map((src, i) => ({ src, remove: () => app.removeFoodScanPhoto(i) })),
    foodScanCount: (st.foodScanPhotos || []).length,
    // The input is cleared only AFTER the files have been read. Clearing it
    // synchronously is the documented iOS trap: the FileList is a live view
    // onto the input, and on a fresh camera capture iOS can release the
    // backing file the moment the input lets go of it — mid-read. Clearing it
    // at all is still required, or picking the SAME photo twice fires no
    // change event at all.
    addFoodScanPhotos: (e) => {
      const input = e.target;
      Promise.resolve(app.addFoodScanPhotos(input.files))
        .finally(() => { try { input.value = ''; } catch { /* detached */ } });
    },
    runFoodScan: () => app.runFoodScan(),
    clearFoodScanPhotos: () => app.clearFoodScanPhotos(),
    canRunFoodScan: (st.foodScanPhotos || []).length > 0 && !st.foodScanBusy,
    // promote the currently scanned/entered food straight into the recipe bank
    saveScanToRecipe: () => app.openAddRecipeFrom({ name: st.foodLogName, macros: { p: Number(st.foodLogP) || 0, c: Number(st.foodLogC) || 0, f: Number(st.foodLogF) || 0, kcal: Number(st.foodLogKcal) || 0 } }),
    canSaveScanToRecipe: !!st.foodLogName.trim() && [st.foodLogP, st.foodLogC, st.foodLogF, st.foodLogKcal].some((val) => Number(val) > 0),
    // THE QUICK-LOG RAIL — the top of the screen, and the whole point of it.
    //
    // His report (22 Sep 2026): "have recently logged or added foods added to
    // the top so I don't need to keep scrolling to search for something I just
    // added". The recents list was at the FOOT of the food log, behind a
    // disclosure, under every entry of the day. Something eaten twice a week
    // took a scroll and two taps to log again.
    //
    // Same data as the list below, ordered newest-first by the server (see
    // foodHistory.js — it sorts by the MOMENT, so what he just added leads),
    // cut to what fits a horizontal rail. The macros ride along raw so the
    // card can draw the split rather than spell it out.
    foodQuickLog: (st.liveFoodHistory || []).slice(0, 12).map((it) => ({
      key: it.key,
      name: it.name,
      kcal: Math.round(Number(it.macros?.kcal) || 0),
      p: Math.round(Number(it.macros?.p) || 0),
      c: Math.round(Number(it.macros?.c) || 0),
      f: Math.round(Number(it.macros?.f) || 0),
      often: it.count > 1 ? `${it.count}×` : '',
      log: () => app.relogFoodItem(it),
    })),

    // recent off-plan foods (cross-day history), each re-loggable or promotable
    foodHistoryOpen: st.foodHistoryOpen,
    toggleFoodHistory: () => app.toggleFoodHistory(),
    foodHistoryLoaded: st.liveFoodHistory != null,
    foodHistory: (st.liveFoodHistory || []).map((it) => ({
      key: it.key,
      name: it.name,
      seen: it.count > 1 ? `${it.count}×` : '',
      macroLabel: `${Math.round(it.macros.p)}P · ${Math.round(it.macros.c)}C · ${Math.round(it.macros.f)}F · ${Math.round(it.macros.kcal)} kcal`,
      relog: () => app.relogFoodItem(it),
      toRecipe: () => app.openAddRecipeFrom({ name: it.name, macros: it.macros }),
    })),
    barcodeScannerOpen: st.barcodeScannerOpen,
    openBarcodeScanner: () => app.openBarcodeScanner(),
    closeBarcodeScanner: () => app.closeBarcodeScanner(),
    onBarcodeDetected: (code) => app.onBarcodeDetected(code),

    // add recipe — writes back to the real vault file
    recipeAddVisible: usingLiveRecipes,
    openAddRecipe: () => app.openAddRecipe(),
    closeAddRecipe: () => app.closeAddRecipe(),
    recipeAddOpen: st.recipeAddOpen,
    recipeAddName: st.recipeAddName,
    setRecipeAddName: (e) => app.setState({ recipeAddName: e.target.value }),
    recipeAddCategoryOptions: [
      { value: 'CORE DAILY MEALS', label: 'Core' },
      { value: 'ROTATION / SWAP MEALS', label: 'Rotation' },
      { value: 'TREATS', label: 'Treats' },
    ],
    recipeAddCategory: st.recipeAddCategory,
    setRecipeAddCategory: (e) => app.setState({ recipeAddCategory: e.target.value }),
    recipeAddMakes: st.recipeAddMakes,
    setRecipeAddMakes: (e) => app.setState({ recipeAddMakes: e.target.value }),
    recipeAddP: st.recipeAddP,
    setRecipeAddP: (e) => app.setState({ recipeAddP: e.target.value }),
    recipeAddC: st.recipeAddC,
    setRecipeAddC: (e) => app.setState({ recipeAddC: e.target.value }),
    recipeAddF: st.recipeAddF,
    setRecipeAddF: (e) => app.setState({ recipeAddF: e.target.value }),
    recipeAddKcal: st.recipeAddKcal,
    setRecipeAddKcal: (e) => app.setState({ recipeAddKcal: e.target.value }),
    recipeAddKj: st.recipeAddKj,
    setRecipeAddKj: (e) => app.setRecipeAddKj(e),
    recipeAddIngredients: st.recipeAddIngredients,
    setRecipeAddIngredients: (e) => app.setState({ recipeAddIngredients: e.target.value }),
    recipeAddMethod: st.recipeAddMethod,
    setRecipeAddMethod: (e) => app.setState({ recipeAddMethod: e.target.value }),
    recipeAddBusy: st.recipeAddBusy,
    recipeAddError: st.recipeAddError,
    submitAddRecipe: () => app.submitAddRecipe(),
    recipeScanBusy: st.recipeScanBusy,
    recipeScanError: st.recipeScanError,
    onRecipeScanFiles: (e) => app.onRecipeScanFiles(e.target.files),
    recipeAddPhotoDataUrl: st.recipeAddPhotoDataUrl,
    onRecipeAddPhotoFile: (e) => app.onRecipeAddPhotoFile(e.target.files),
    clearRecipeAddPhoto: () => app.setState({ recipeAddPhotoDataUrl: null }),
    recipeOpen: usingLiveRecipes ? !!liveOr : !!or,
    closeRecipe: () => app.closeRecipe(),
    // delete, two-tap: first tap arms, second confirms — matching the
    // repo's no-silent-destruction rule without a modal
    orDeleteArmed: usingLiveRecipes && liveOr ? st.recipeDeleteArmed === liveOr.id : false,
    orDelete: usingLiveRecipes && liveOr ? () => {
      if (st.recipeDeleteArmed === liveOr.id) app.deleteRecipe(liveOr.id, liveOr.name);
      else app.setState({ recipeDeleteArmed: liveOr.id });
    } : null,
    orName: usingLiveRecipes ? (liveOr ? liveOr.name : '') : (or ? or.name : ''),
    // THE FRIDGE, on the recipe itself (his rule: inside Fuel, not another
    // section). null = never counted; the buttons cook/eat one at a time,
    // "Set" takes a number, "Stop counting" forgets it.
    orPortions: usingLiveRecipes && liveOr ? (() => {
      const dish = Object.values(rotation?.options || {}).flat().find((d) => d.id === liveOr.id);
      const left = dish ? dish.portionsLeft : (rotation?.portions?.[liveOr.id] ?? null);
      return {
        left, out: left === 0,
        cooked: (n) => app.adjustPortions(liveOr.id, n, liveOr.name),
        ate: () => app.adjustPortions(liveOr.id, -1, liveOr.name),
        set: (n) => app.setPortions(liveOr.id, n, liveOr.name),
        stop: () => app.setPortions(liveOr.id, null, liveOr.name),
      };
    })() : null,
    orMeta: usingLiveRecipes
      ? (liveOr ? `${activeAlt ? 'Alternate: ' + activeAlt.label + ' · ' : ''}${RECIPE_CATEGORY_LABEL[liveOr.category] || liveOr.category}${liveOr.makes ? ' · ' + liveOr.makes : ''} · from Obsidian /Health` : '')
      : (or ? or.tag + ' · ' + or.time + ' · from Obsidian /Recipes' : ''),
    orPhLabel: usingLiveRecipes ? (liveOr ? 'dish photo — ' + liveOr.name.toLowerCase() : '') : (or ? 'dish photo — ' + or.name.toLowerCase() : ''),
    orPhStyle: usingLiveRecipes
      ? (liveOr ? { height: '170px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--nv-gold) 16%, transparent) 0 9px, color-mix(in srgb, var(--nv-gold) 05%, transparent) 9px 18px)', border: '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)' } : {})
      : (or ? { height: '170px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg, rgba(' + or.hue + ',.16) 0 9px, rgba(' + or.hue + ',.05) 9px 18px)', border: '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)' } : {}),
    orPhotoUrl: usingLiveRecipes && liveOr ? (st.liveRecipePhotoUrls[liveOr.id] || null) : null,
    orPhotoUploadBusy: usingLiveRecipes && liveOr ? !!st.recipePhotoUploadBusy[liveOr.id] : false,
    onRecipePhotoFile: usingLiveRecipes && liveOr ? (e) => app.onRecipePhotoFile(liveOr.id, e.target.files) : () => {},
    orP: usingLiveRecipes ? (effMacros ? Math.round(effMacros.p) : 0) : (or ? Math.round(or.p * sv) : 0),
    orC: usingLiveRecipes ? (effMacros ? Math.round(effMacros.c) : 0) : (or ? Math.round(or.c * sv) : 0),
    orF: usingLiveRecipes ? (effMacros ? Math.round(effMacros.f) : 0) : (or ? Math.round(or.f * sv) : 0),
    orKcal: usingLiveRecipes ? (effMacros ? Math.round(effMacros.kcal) : 0) : (or ? Math.round(or.kcal * sv) : 0),
    servings: sv,
    orShowServings: !usingLiveRecipes,
    incServ: () => app.setState(s => ({ servings: Math.min(6, s.servings + 1) })),
    decServ: () => app.setState(s => ({ servings: Math.max(1, s.servings - 1) })),
    orIngredients: usingLiveRecipes
      ? effIngredients.map(i => ({ qty: i.qty, name: i.name }))
      : (or ? or.ingredients.map(i => ({ qty: i[0] ? (Math.round(i[0] * sv * 10) / 10) + (i[1] ? ' ' + i[1] : '') : '—', name: i[2] })) : []),
    orSteps: usingLiveRecipes
      ? effMethod.map((s2, i) => ({ n: ['i.', 'ii.', 'iii.', 'iv.', 'v.'][i] || (i + 1) + '.', text: s2 }))
      : (or ? or.steps.map((s2, i) => ({ n: ['i.', 'ii.', 'iii.', 'iv.', 'v.'][i] || (i + 1) + '.', text: s2 })) : []),
    orDescription: usingLiveRecipes && liveOr && !activeAlt ? liveOr.description : null,
    orShowAskNova: !usingLiveRecipes,
    orNotes: usingLiveRecipes && liveOr && !activeAlt ? liveOr.notes : [],

    // alternates — Nova-suggested tweaks to a live recipe, kept as extra
    // saved views rather than overwriting the original
    orAlternates: usingLiveRecipes && liveOr ? [
      // The version in use. Its label used to be the literal string
      // "Original" with no rename handler at all — which is why promoting a
      // variant appeared to rename it to "Original" and why he could not
      // edit that name. It now shows what the recipe says it is called.
      { id: null, label: liveOr.versionLabel || 'Original', active: !st.recipeAltSelected, onClick: () => app.selectAlternate(null),
        isToday: openRecipeSlotKey ? !openRecipeSlotVariantId : false,
        useToday: openRecipeSlotKey && openRecipeSlotVariantId ? () => app.setRotationVariant(openRecipeSlotKey, null, liveOr.id) : null,
        rename: () => app.startRenameAlternate(CURRENT_VERSION, liveOr.versionLabel || 'Original') },
      ...liveOr.alternates.map((a) => ({ id: a.id, label: a.label, active: st.recipeAltSelected === a.id, onClick: () => app.selectAlternate(a.id),
        isToday: openRecipeSlotVariantId === a.id,
        useToday: openRecipeSlotKey && openRecipeSlotVariantId !== a.id ? () => app.setRotationVariant(openRecipeSlotKey, a.id, liveOr.id) : null,
        makePrimary: a.macros ? () => app.promoteRecipeAlternate(liveOr.id, a.id) : null,
        rename: () => app.startRenameAlternate(a.id, a.label) })),
    ] : [],
    // LOG THIS VERSION — his ask: a saved variant he eats sometimes should be
    // loggable without being promoted to the recipe.
    orLogActive: usingLiveRecipes && liveOr ? () => app.openPortionSheet({
      name: activeAlt ? `${liveOr.name} (${activeAlt.label})` : liveOr.name,
      macros: activeAlt?.macros || liveOr.macros,
      source: 'recipe',
    }) : null,
    // renaming a variant in place — its id follows the new name, and the
    // server migrates today's override so the slot never silently resets
    renameAltId: st.recipeRenameAltId,
    renameValue: st.recipeRenameValue,
    renameError: st.recipeRenameError,
    setRenameValue: (e) => app.setState({ recipeRenameValue: e.target.value }),
    renameKey: (e) => { if (e.key === 'Enter') app.commitRenameAlternate(); if (e.key === 'Escape') app.cancelRenameAlternate(); },
    commitRename: () => app.commitRenameAlternate(),
    cancelRename: () => app.cancelRenameAlternate(),
    orSlotKey: openRecipeSlotKey,
    orShowAddToShoppingList: usingLiveRecipes && !!liveOr && effIngredients.length > 0,
    addRecipeToShoppingList: () => {
      if (!liveOr) return;
      const names = effIngredients.map((i) => i.name);
      const source = activeAlt ? `${liveOr.name} (${activeAlt.label})` : liveOr.name;
      app.addToShoppingList(names, source);
    },
    // A WHOLE ITEM — an entry with no ingredients because it IS the thing you
    // buy (his Pauls protein yoghurt, YoPro, a protein bar). The only route to
    // the shopping list was "add these ingredients", and an item with none had
    // no button at all: the affordance was nested inside the ingredients block
    // AND gated on its length, so it was doubly invisible. For these, the
    // recipe's own name is the shopping item.
    orIsWholeItem: usingLiveRecipes && !!liveOr && effIngredients.length === 0 && effMethod.length === 0,
    addWholeItemToShoppingList: () => {
      if (!liveOr) return;
      app.addToShoppingList([liveOr.name], liveOr.name);
    },
    orShowTweak: usingLiveRecipes && !!liveOr,

    // ---- editing the meal itself -----------------------------------------
    // Available on every live recipe and every variant, including the
    // prose-only entries that have no sections yet — those grow them on save.
    orCanEdit: usingLiveRecipes && !!liveOr,
    orEditing: !!st.recipeEdit,
    orEditTarget: activeAlt ? activeAlt.label : (liveOr ? liveOr.name : ''),
    orEditIngredients: st.recipeEdit?.ingredients ?? '',
    orEditMethod: st.recipeEdit?.method ?? '',
    orEditP: st.recipeEdit?.p ?? '', orEditC: st.recipeEdit?.c ?? '',
    orEditF: st.recipeEdit?.f ?? '', orEditKcal: st.recipeEdit?.kcal ?? '',
    orEditBusy: !!st.recipeEditBusy,
    orEditError: st.recipeEditError,
    setEditField: (field) => (e) => app.setRecipeEditField(field, e.target.value),
    // macros from the labels (the editor's label pass)
    orEditServings: st.recipeEdit?.servings ?? '1',
    orEditLabels: (st.recipeEdit?.labels || []).map((l, i) => ({
      key: i, image: l.image, name: l.name, grams: l.grams,
      setGrams: (e) => app.setRecipeEditLabel(i, { grams: e.target.value }),
      setName: (e) => app.setRecipeEditLabel(i, { name: e.target.value }),
      remove: () => app.removeRecipeEditLabel(i),
    })),
    orEditLabelBusy: !!st.recipeEdit?.labelBusy,
    orEditLabelError: st.recipeEdit?.labelError || null,
    orEditLabelResult: st.recipeEdit?.labelResult ? {
      servings: st.recipeEdit.labelResult.servings,
      confidence: st.recipeEdit.labelResult.confidence,
      warning: st.recipeEdit.labelResult.warning || null,
      total: st.recipeEdit.labelResult.total,
      parts: st.recipeEdit.labelResult.parts.map((p) => ({ name: p.name, grams: p.grams, low: p.confidence === 'low', question: p.question, ...p.contribution })),
    } : null,
    addEditLabels: (files) => app.addRecipeEditLabels(files),
    computeFromLabels: () => app.computeRecipeEditFromLabels(),
    startEdit: () => app.startRecipeEdit({
      ingredients: effIngredients.map((i) => (i.qty ? `${i.qty} ${i.name}` : i.name)),
      method: effMethod,
      macros: effMacros,
      // live recipes carry no servings field — the description often says "4 servings"; otherwise he types it
      servings: Number((String(liveOr?.description || liveOr?.desc || liveOr?.summary || '').match(/(\d+)\s*serv/i) || [])[1]) || 1,
    }),
    cancelEdit: () => app.cancelRecipeEdit(),
    saveEdit: () => app.commitRecipeEdit(liveOr ? liveOr.id : null, activeAlt ? activeAlt.id : null),
    // tap ✕ on an ingredient → it's marked (strikethrough, reversible); one
    // SAVE opens the choice popup; the tweak pipeline recomputes macros and
    // the existing save paths commit. Tap ＋ → that single item goes to the
    // shopping list.
    ingredientRemovals: st.recipeRemovals || [],
    toggleIngredientRemoval: usingLiveRecipes && liveOr ? (name) => app.toggleIngredientRemoval(name) : null,
    removalPromptOpen: !!st.recipeRemovalPrompt,
    openRemovalPrompt: () => app.setState({ recipeRemovalPrompt: true }),
    cancelRemovalPrompt: () => app.setState({ recipeRemovalPrompt: false }),
    removalCanToday: !!openRecipeSlotKey,
    confirmRemovalSave: (mode) => app.confirmRemovalSave(mode, openRecipeSlotKey),
    addIngredientToShopping: usingLiveRecipes && liveOr ? (name) => app.addToShoppingList([name], liveOr.name) : null,
    saveRecipeTweakToday: openRecipeSlotKey ? () => app.saveRecipeTweak(openRecipeSlotKey) : null,
    recipeTweakInput: st.recipeTweakInput,
    setRecipeTweakInput: (e) => app.setState({ recipeTweakInput: e.target.value }),
    // spoken path: dictation hands over plain text, and a take that ends with
    // something in it asks straight away — the same one-shot rhythm as Voice
    setRecipeTweakValue: (text) => app.setState({ recipeTweakInput: text }),
    submitRecipeTweakVoice: (text) => app.submitRecipeTweak(true, text),
    recipeDictationError: (err) => app.setState({ recipeTweakError: err === 'not-allowed' ? 'Microphone access is off for this site.' : `Dictation stopped: ${err}` }),
    recipeTweakKey: (e) => { if (e.key === 'Enter') app.submitRecipeTweak(); },
    submitRecipeTweak: () => app.submitRecipeTweak(),
    recipeTweakBusy: st.recipeTweakBusy,
    recipeTweakError: st.recipeTweakError,
    recipeTweakPreview: st.recipeTweakPreview,
    // his ask: photograph a different ingredient (a substitute's packaging,
    // its nutrition label, the item itself) for Nova to read and consider
    portionSheet: st.portionSheet ? (() => {
      const custom = String(st.foodPortionCustom || '').trim();
      const factor = custom ? Number(custom) : st.foodPortionFactor;
      const ok = validPortion(factor);
      const scaled = ok ? scaleMacros(st.portionSheet.macros, factor) : null;
      return {
        name: st.portionSheet.name,
        base: st.portionSheet.macros,
        dayLabel: st.foodLogDate ? `LOGGING TO ${st.foodLogDate}` : null,
        portions: PORTIONS.map((pn) => ({
          label: pn.label, active: !custom && Math.abs(st.foodPortionFactor - pn.factor) < 0.001,
          pick: () => app.setState({ foodPortionFactor: pn.factor, foodPortionCustom: '' }),
        })),
        custom,
        setCustom: (e) => app.setState({ foodPortionCustom: typeof e === 'string' ? e : e.target.value }),
        valid: ok,
        preview: scaled ? `${scaled.p}P · ${scaled.c}C · ${scaled.f}F · ${scaled.kcal} kcal` : 'Enter a portion between a sliver and 20 servings',
        loggedName: ok ? portionName(st.portionSheet.name, factor) : null,
        confirm: () => app.confirmPortionSheet(),
        cancel: () => app.closePortionSheet(),
      };
    })() : null,
    recipeTweakPhotos: (st.recipeTweakPhotos || []).map((src, i) => ({ src, remove: () => app.removeRecipeTweakPhoto(i) })),
    addRecipeTweakPhotos: (e) => app.addRecipeTweakPhotos(e.target.files),
    saveRecipeTweak: () => app.saveRecipeTweak(),
    discardRecipeTweak: () => app.discardRecipeTweak(),
    recipeMsgs: st.recipeChat.map(m => ({ text: m.text, typing: m.typing, tag: m.who === 'nova' ? '» NOVA' : '» YOU', tagStyle: { color: m.who === 'nova' ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', fontWeight: 500, fontFamily: mono, fontSize: '11px' } })),
    recipeInput: st.recipeInput,
    setRecipeInput: (e) => app.setState({ recipeInput: e.target.value }),
    recipeKey: (e) => { if (e.key === 'Enter') app.doRecipeAsk(); },
    sendRecipe: () => app.doRecipeAsk(),
  };
}
