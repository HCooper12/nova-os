import { chip, mono } from './shared.js';

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
  const rotationExtraVisible = st.rotationShowExtra || !!rotation?.slots?.extra;
  const visibleSlotDefs = SLOT_DEFS.filter((s) => s.key !== 'extra' || rotationExtraVisible);
  const rotationSlots = visibleSlotDefs.map((s) => {
    const filled = rotation?.slots?.[s.key] || null;
    return {
      key: s.key,
      name: s.name,
      hue: s.hue,
      recipeName: filled ? filled.name : null,
      p: filled ? Math.round(filled.macros.p) : null,
      c: filled ? Math.round(filled.macros.c) : null,
      f: filled ? Math.round(filled.macros.f) : null,
      kcal: filled ? Math.round(filled.macros.kcal) : null,
      consumed: !!filled?.consumed,
      open: filled ? () => app.openRecipe(filled.id) : null,
      toggleConsumed: filled ? () => app.toggleSlotConsumed(s.key, !filled.consumed) : null,
      clear: filled ? () => {
        app.toggleRotationSlot(s.key, filled.id);
        if (s.key === 'extra') app.setState({ rotationShowExtra: false });
      } : null,
    };
  });
  const rotTot = rotation?.totals || { p: 0, c: 0, f: 0, kcal: 0 };
  const rotConsumedTot = rotation?.consumedTotals || { p: 0, c: 0, f: 0, kcal: 0 };
  const foodLogEntries = st.liveFoodLog?.entries || [];
  const foodLogTot = foodLogEntries.reduce((acc, e) => ({ p: acc.p + e.macros.p, c: acc.c + e.macros.c, f: acc.f + e.macros.f, kcal: acc.kcal + e.macros.kcal }), { p: 0, c: 0, f: 0, kcal: 0 });

  // protein gauge — tracks what's actually been marked eaten today (rotation
  // slots marked consumed, plus anything logged off-plan) rather than the
  // day's full plan, so it climbs through the day instead of sitting at the
  // planned total from the moment a meal is picked
  const proteinTarget = usingLiveRecipes ? (profile ? profile.proteinFloorG : 180) : 180;
  const proteinCurrent = usingLiveRecipes ? rotConsumedTot.p + foodLogTot.p : 96;
  const proteinRatio = proteinTarget > 0 ? Math.min(1, proteinCurrent / proteinTarget) : 0;
  const proteinGap = Math.round(proteinTarget - proteinCurrent);
  const proteinNextSlot = visibleSlotDefs.find((s) => !rotation?.slots?.[s.key]?.consumed);
  const proteinNextSlotFilled = proteinNextSlot ? rotation?.slots?.[proteinNextSlot.key] : null;

  const recipeList = usingLiveRecipes
    ? st.liveRecipes
        .filter(r => st.recipeFilter === 'All' || RECIPE_CATEGORY_LABEL[r.category] === st.recipeFilter)
        .map((r, i) => {
          const tot = (r.macros.p + r.macros.c + r.macros.f) || 1;
          const hue = RECIPE_HUES[i % RECIPE_HUES.length];
          const bar = (v, col) => ({ flex: String(v / tot), borderRadius: '2px', background: col });
          return { name: r.name, tag: (RECIPE_CATEGORY_LABEL[r.category] || r.category).toUpperCase(), p: r.macros.p, c: r.macros.c, f: r.macros.f, kcal: r.macros.kcal, time: r.makes || '',
            open: () => app.openRecipe(r.id),
            photoUrl: st.liveRecipePhotoUrls[r.id] || null,
            phLabel: 'dish photo — ' + r.name.toLowerCase(),
            phStyle: { height: '104px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(45deg, rgba(' + hue + ',.13) 0 8px, rgba(' + hue + ',.04) 8px 16px)' },
            pBar: bar(r.macros.p, 'var(--nv-cy)'), cBar: bar(r.macros.c, 'var(--nv-gold)'), fBar: bar(r.macros.f, 'var(--nv-vi)'),
            slotToggles: SLOT_DEFS.map((s) => ({ key: s.key, label: s.label, hue: s.hue, active: rotation?.slots?.[s.key]?.id === r.id, onClick: () => app.toggleRotationSlot(s.key, r.id) })) };
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
  const or = usingLiveRecipes ? null : app.recipes.find(r => r.id === st.openRecipeId);
  const sv = usingLiveRecipes ? 1 : st.servings; // no serving-scaling for live recipes — ingredients are free text, not [qty,unit] tuples

  // when viewing a live recipe, an alternate (a Nova-suggested tweak the user
  // chose to keep) can stand in for the original's macros/ingredients/method
  const activeAlt = liveOr ? (liveOr.alternates || []).find((a) => a.id === st.recipeAltSelected) || null : null;
  const effMacros = activeAlt ? activeAlt.macros : (liveOr ? liveOr.macros : null);
  const effIngredients = activeAlt ? activeAlt.ingredients.map((name) => ({ qty: '', name })) : (liveOr ? liveOr.ingredients : []);
  const effMethod = activeAlt ? activeAlt.method : (liveOr ? liveOr.method : []);

  // shared with valsMission (lunch card + protein gauge)
  Object.assign(ctx, { usingLiveRecipes, rotation, profile, proteinTarget, proteinCurrent, proteinRatio, proteinGap, proteinNextSlot, proteinNextSlotFilled });

  return {
    // recipes
    recipesHeaderLabel: usingLiveRecipes ? `${st.liveRecipes.length} RECIPES · LIVE FROM OBSIDIAN` : `${app.recipes.length} RECIPES · DEMO DATA`,
    recipeFilters: filters.map(f => ({ label: f, go: () => app.setState({ recipeFilter: f }), style: chip(st.recipeFilter === f) })),
    recipeList,

    // daily rotation — real meal-slot picks + aggregate macros, live only
    rotationVisible: usingLiveRecipes,
    rotationSlots,
    rotationTotals: { p: Math.round(rotTot.p), c: Math.round(rotTot.c), f: Math.round(rotTot.f), kcal: Math.round(rotTot.kcal) },
    rotationTargetKcal: profile ? profile.targetKcal : null,
    rotationProteinFloor: profile ? profile.proteinFloorG : null,
    rotationShowExtraButton: usingLiveRecipes && !rotationExtraVisible,
    showExtraMealSlot: () => app.setState({ rotationShowExtra: true }),

    // off-plan food log — quick-add anything eaten that wasn't a rotation
    // recipe, so the protein tracker reflects reality rather than just the plan
    foodLogVisible: usingLiveRecipes,
    foodLogEntries: foodLogEntries.map((e) => ({
      id: e.id, time: e.time, name: e.name,
      p: Math.round(e.macros.p), c: Math.round(e.macros.c), f: Math.round(e.macros.f), kcal: Math.round(e.macros.kcal),
      remove: () => app.deleteFoodLogEntry(e.id),
    })),
    foodLogTotals: { p: Math.round(foodLogTot.p), c: Math.round(foodLogTot.c), f: Math.round(foodLogTot.f), kcal: Math.round(foodLogTot.kcal) },
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
    foodScanNote: st.foodScanNote,
    setFoodScanNote: (e) => app.setFoodScanNote(e),
    foodScanBusy: st.foodScanBusy,
    foodScanError: st.foodScanError,
    foodScanQuestion: st.foodScanQuestion,
    // multi-photo staging — add several (labels and/or the food), then analyze together
    foodScanPhotos: (st.foodScanPhotos || []).map((src, i) => ({ src, remove: () => app.removeFoodScanPhoto(i) })),
    foodScanCount: (st.foodScanPhotos || []).length,
    addFoodScanPhotos: (e) => { app.addFoodScanPhotos(e.target.files); e.target.value = ''; },
    runFoodScan: () => app.runFoodScan(),
    clearFoodScanPhotos: () => app.clearFoodScanPhotos(),
    canRunFoodScan: (st.foodScanPhotos || []).length > 0 && !st.foodScanBusy,
    // promote the currently scanned/entered food straight into the recipe bank
    saveScanToRecipe: () => app.openAddRecipeFrom({ name: st.foodLogName, macros: { p: Number(st.foodLogP) || 0, c: Number(st.foodLogC) || 0, f: Number(st.foodLogF) || 0, kcal: Number(st.foodLogKcal) || 0 } }),
    canSaveScanToRecipe: !!st.foodLogName.trim() && [st.foodLogP, st.foodLogC, st.foodLogF, st.foodLogKcal].some((val) => Number(val) > 0),
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
    orName: usingLiveRecipes ? (liveOr ? liveOr.name : '') : (or ? or.name : ''),
    orMeta: usingLiveRecipes
      ? (liveOr ? `${activeAlt ? 'ALTERNATE: ' + activeAlt.label + ' · ' : ''}${(RECIPE_CATEGORY_LABEL[liveOr.category] || liveOr.category).toUpperCase()}${liveOr.makes ? ' · ' + liveOr.makes : ''} · FROM OBSIDIAN /HEALTH` : '')
      : (or ? or.tag + ' · ' + or.time + ' · FROM OBSIDIAN /RECIPES' : ''),
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
      { id: null, label: 'Original', active: !st.recipeAltSelected, onClick: () => app.selectAlternate(null) },
      ...liveOr.alternates.map((a) => ({ id: a.id, label: a.label, active: st.recipeAltSelected === a.id, onClick: () => app.selectAlternate(a.id) })),
    ] : [],
    orShowAddToShoppingList: usingLiveRecipes && !!liveOr && effIngredients.length > 0,
    addRecipeToShoppingList: () => {
      if (!liveOr) return;
      const names = effIngredients.map((i) => i.name);
      const source = activeAlt ? `${liveOr.name} (${activeAlt.label})` : liveOr.name;
      app.addToShoppingList(names, source);
    },
    orShowTweak: usingLiveRecipes && !!liveOr,
    recipeTweakInput: st.recipeTweakInput,
    setRecipeTweakInput: (e) => app.setState({ recipeTweakInput: e.target.value }),
    recipeTweakKey: (e) => { if (e.key === 'Enter') app.submitRecipeTweak(); },
    submitRecipeTweak: () => app.submitRecipeTweak(),
    recipeTweakBusy: st.recipeTweakBusy,
    recipeTweakError: st.recipeTweakError,
    recipeTweakPreview: st.recipeTweakPreview,
    saveRecipeTweak: () => app.saveRecipeTweak(),
    discardRecipeTweak: () => app.discardRecipeTweak(),
    recipeMsgs: st.recipeChat.map(m => ({ text: m.text, typing: m.typing, tag: m.who === 'nova' ? '» NOVA' : '» YOU', tagStyle: { color: m.who === 'nova' ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', fontWeight: 500, fontFamily: mono, fontSize: '11px' } })),
    recipeInput: st.recipeInput,
    setRecipeInput: (e) => app.setState({ recipeInput: e.target.value }),
    recipeKey: (e) => { if (e.key === 'Enter') app.doRecipeAsk(); },
    sendRecipe: () => app.doRecipeAsk(),
  };
}
