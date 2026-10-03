import { dtf } from './fmt.js';
import { plateInstrument, proteinLine, logRows, tonightRotation, rotationStrip } from '../fuelSummaryFacts.js';
import { getFuelCards, fuelCardRuns, FUEL_CARDS } from '../fuelCards.js';
import { dayWord, loggedLine } from '../fuelDay.js';

// THE SUMMARY FUEL PAGE's view model (mockup 59, variation A, his pick on
// 27 Sep 2026: "Fuel: option A"). Fuel is the plate: one instrument, the
// composer under it, the day's log as rows, one rotation row, and two doors.
//
// Like valsSummary and valsIndex it takes the MERGED view model and goes
// last in App.renderVals: it reshapes what valsRecipes already built (the
// composer, the itemised lines, the Undo rails, the recipe overlay's every
// action, Pick it up) and computes nothing a second time. The one derivation
// it owns, the plate, is src/fuelSummaryFacts.js, from the same ctx fields
// Home's Body ring reads. Every action below is an EXISTING app method: this
// file adds no write path. Null under every style but `summary`.

const CATEGORY = { 'CORE DAILY MEALS': 'Core', 'ROTATION / SWAP MEALS': 'Rotation', TREATS: 'Treats' };
const SLOT_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', extra: 'Extra meal' };
const SLOT_LETTERS = { breakfast: 'B', lunch: 'L', dinner: 'D', snack: 'S', extra: 'E' };
const round = (n) => Math.round(Number(n) || 0);
const kc = (n) => round(n).toLocaleString('en-AU');
const weekday = (iso, style = 'long') => dtf('en-AU', { weekday: style }).format(new Date(`${iso}T12:00:00`));
const longDay = (iso) => dtf('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`)).replace(/,/g, '');

export function valsFuelSummary(app, ctx, v) {
  const st = app.state;
  if (st.novaStyle !== 'summary') return { fuelSummary: null };

  const live = !!v.foodLogVisible;
  const bank = v.recipeBankState;
  // what the page as a whole can honestly show
  const state = live ? 'live' : bank === 'demo' ? 'demo' : bank === 'loading' ? 'loading' : bank || 'missing';

  // ---- the plate: Home's fields, one instrument -------------------------
  const inst = plateInstrument({
    proteinCurrent: ctx.proteinCurrent, proteinTarget: ctx.proteinTarget,
    kcalCurrent: ctx.kcalCurrent, targetKcal: ctx.targetKcal,
    c: v.dayMacros?.c, f: v.dayMacros?.f,
  });
  const now = new Date();
  const plate = live ? {
    ...inst,
    when: dtf('en-AU', { weekday: 'long' }).format(now),
    line: proteinLine(inst.protein),
    hasWeek: !!(v.fuelWeek || v.fuelCross || v.askProteinVerdict),
  } : null;

  // ---- the day in view ----------------------------------------------------
  const viewingPast = !!st.foodLogDate;
  const rawEntries = (viewingPast ? st.liveFoodLogView?.entries : st.liveFoodLog?.entries) || [];
  const shaped = new Map(logRows(rawEntries).map((r) => [r.id, r]));
  const days = (v.foodLogDays || []).map((d, i) => ({
    key: d.key, active: d.active, pick: d.pick,
    label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : weekday(d.key),
    short: i === 0 ? 'Today' : weekday(d.key, 'short'),
    num: Number(d.key.slice(8, 10)),
  }));
  const at = Math.max(0, days.findIndex((d) => d.active));
  const prev = days[at + 1] || null;
  const next = at > 0 ? days[at - 1] : null;
  const viewIso = viewingPast ? st.foodLogDate : null;

  const rows = (v.foodLogEntries || []).map((e) => {
    const s = shaped.get(e.id) || {};
    const macros = { p: e.p, c: e.c, f: e.f, kcal: e.kcal };
    return {
      id: e.id, name: e.name, time: s.time || null, p: e.p, kcal: e.kcal, tail: s.tail || '',
      sub: s.sub || `${e.p} g protein · ${kc(e.kcal)} kcal`,
      fromRotation: !!s.fromRotation, edited: e.edited,
      // the lines are the entry's own; its figures are the server's sum of them
      lines: e.items.map((it) => ({ id: it.id, name: it.grams ? `${it.name}, ${it.grams} g` : it.name, sub: it.macros.replace(/(\d+)P · /, '$1 g protein · '), remove: it.remove })),
      relog: () => app.relogFoodItem({ name: e.name, macros }),
      // every row comes off; a rotation row un-ticks its slot for that day
      // (app.removeFoodLogRow, through valsRecipes' e.remove)
      remove: e.remove,
      removeWord: s.fromRotation ? 'Remove and un-tick' : 'Remove',
      edit: e.edit,
      editing: e.editing,
      toRecipe: () => app.openAddRecipeFrom({ name: e.name, macros }),
    };
  });

  // THE RECEIPTS: a removal leaves its way back for the 30 seconds App keeps
  // it (foodEntryUndo / foodItemUndo, the same rails the toast's Undo rides)
  const receipts = [];
  if (st.foodEntryUndo?.entry) {
    const en = st.foodEntryUndo.entry;
    receipts.push({ key: `entry-${en.id}`, at: st.foodEntryUndo.at || Date.now(), title: `${en.name || 'That meal'} removed`,
      sub: `${round(en.macros?.p)} g and ${kc(en.macros?.kcal)} kcal came off the plate`, undo: () => app.undoFoodLogEntry() });
  }
  if (st.foodItemUndo?.item) {
    const it = st.foodItemUndo.item;
    receipts.push({ key: `item-${it.id || it.name}`, at: st.foodItemUndo.at || Date.now(), title: `${it.name || 'That line'} dropped`,
      sub: `${round(it.macros?.p)} g and ${kc(it.macros?.kcal)} kcal came off ${st.foodItemUndo.entry?.name || 'the meal'}`, undo: () => app.undoFoodLogItem() });
  }
  // a rotation row taken off un-ticks its slot (src/fuelDay.js removalFor),
  // and its way back re-ticks it on the same day
  const rr = st.rotationReceipt;
  if (rr?.kind === 'untick') {
    const word = dayWord(rr.date);
    receipts.push({ key: `rot-${rr.slot}-${rr.recipeId}`, at: rr.at || Date.now(), title: `${rr.name} removed${word ? ` from ${word}` : ''}`,
      sub: `Un-ticked${rr.macros ? ` · ${round(rr.macros.p)} g, ${kc(rr.macros.kcal)} kcal off the plate` : ' from the rotation'}`, undo: () => app.undoRotationReceipt() });
  }
  // an add to a day that is not today says where it landed (his lasagne)
  const lr = st.foodLoggedReceipt;
  if (lr?.entry && dayWord(lr.date)) {
    receipts.push({ key: `logged-${lr.entry.id}`, at: lr.at || Date.now(), tone: 'fuel', icon: 'check', title: loggedLine(lr.entry.name, lr.date),
      sub: `${round(lr.entry.macros?.p)} g and ${kc(lr.entry.macros?.kcal)} kcal on ${weekday(lr.date)}'s plate`,
      undo: () => app.undoLoggedReceipt(lr.entry, lr.date) });
  }
  receipts.sort((a, b) => b.at - a.at);

  const tot = v.foodLogTotals || { p: 0, kcal: 0 };
  const history = (st.liveFoodHistory || []).map((it) => ({
    key: it.key, name: it.name, seen: it.count > 1 ? `${it.count} times` : '',
    sub: `${round(it.macros?.p)} g protein · ${kc(it.macros?.kcal)} kcal`,
    relog: () => app.relogFoodItem(it),
    toRecipe: () => app.openAddRecipeFrom({ name: it.name, macros: it.macros }),
  }));

  const log = live ? {
    heading: viewingPast ? `${weekday(viewIso)}'s log` : "Today's log",
    viewingPast,
    rows,
    empty: viewingPast ? `Nothing was logged on ${weekday(viewIso)}.` : 'Nothing logged yet today. The field above takes it in words, a photo or a barcode.',
    total: rows.length ? `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${kc(tot.kcal)} kcal · ${round(tot.p)} g protein, the whole day` : null,
    prev: prev ? { label: prev.label, go: prev.pick } : null,
    next: next ? { label: next.label, go: next.pick } : null,
    days: viewingPast ? days : null,
    receipts,
    edit: v.foodEdit,
    history: { open: !!v.foodHistoryOpen, toggle: v.toggleFoodHistory, loaded: v.foodHistoryLoaded, items: history },
  } : null;

  // ---- the composer: every way in, and what grows under it ---------------
  const typed = String(st.foodDescribeInput || '').trim().toLowerCase();
  const recipeMatches = live && typed.length >= 3
    ? (st.liveRecipes || []).filter((r) => r.macros && r.name.toLowerCase().includes(typed)).slice(0, 3)
      .map((r) => ({ id: r.id, name: r.name, sub: `${round(r.macros.p)} g protein · ${kc(r.macros.kcal)} kcal`, open: () => app.openRecipe(r.id) }))
    : [];
  const manualHasData = !!(v.foodLogName || v.foodLogP || v.foodLogC || v.foodLogF || v.foodLogKcal);
  const composer = live ? {
    value: v.foodDescribeInput, set: v.setFoodDescribeInput, onKey: v.describeFoodKey,
    dictBase: () => v.foodDescribeValue || '',
    canSend: v.canDescribeFood, send: v.describeFoodSearch,
    busy: !!v.foodScanBusy, slow: !!v.foodScanSlow,
    addPhotos: v.addFoodScanPhotos, openBarcode: v.openBarcodeScanner,
    photos: v.foodScanPhotos, photoCount: v.foodScanCount, runScan: v.runFoodScan, canRunScan: v.canRunFoodScan,
    note: v.foodScanNote, setNote: v.setFoodScanNote,
    error: v.foodScanError || v.foodLogError || null,
    question: v.foodScanQuestion ? {
      text: v.foodScanQuestion, canAnswer: v.foodScanCanAnswer, answer: v.foodScanAnswer, setAnswer: v.setFoodScanAnswer,
      send: v.answerFoodScan, dismiss: v.dismissFoodScanQuestion,
    } : null,
    pending: v.foodLogPending,
    refine: v.foodRefine,
    manual: {
      hasData: manualHasData,
      name: v.foodLogName, setName: v.setFoodLogName,
      fields: [
        { key: 'p', label: 'Protein', value: v.foodLogP, set: v.setFoodLogP },
        { key: 'c', label: 'Carbs', value: v.foodLogC, set: v.setFoodLogC },
        { key: 'f', label: 'Fat', value: v.foodLogF, set: v.setFoodLogF },
        { key: 'kcal', label: 'kcal', value: v.foodLogKcal, set: v.setFoodLogKcal },
      ],
      submit: v.submitFoodLog, busy: !!v.foodLogBusy,
    },
    saveToRecipe: v.canSaveScanToRecipe ? v.saveScanToRecipe : null,
    again: (v.foodQuickLog || []).map((it) => ({ key: it.key, name: it.name, p: it.p, kcal: it.kcal, log: it.log })),
    recipeMatches,
    logsTo: viewingPast ? `Entries land on ${longDay(viewIso)}` : null,
  } : null;

  // ---- the rotation: one row, and the whole of it behind the row --------
  const slotList = (v.rotationSlots || []).map((s) => ({ key: s.key, name: s.name }));
  const tonight = live ? tonightRotation(ctx.rotation, slotList) : null;
  const filled = (v.rotationSlots || []).filter((s) => s.recipeName);
  // THE STRIP (3 Oct 2026): every dish in every slot, tickable in place,
  // reading and writing the day the log is showing (app.tickRotation)
  const strip = rotationStrip(v.rotationSlots || []);
  const rec = st.rotationReceipt?.kind === 'tick' ? st.rotationReceipt : null;
  const rotation = live ? {
    state: tonight ? 'next' : filled.length ? 'done' : 'empty',
    tonight,
    tick: tonight ? () => app.tickRotation(tonight.slot, tonight.id, true) : null,
    untick: (slot, id) => app.tickRotation(slot, id, false),
    strip: {
      tiles: strip.tiles.map((t) => ({
        ...t,
        toggle: t.empty ? null : () => app.tickRotation(t.slot, t.id, !t.eaten),
      })),
      nextKey: strip.nextIndex >= 0 ? strip.tiles[strip.nextIndex].key : null,
      line: strip.dishes ? `${strip.eaten} of ${strip.dishes} eaten${viewingPast ? ` on ${weekday(viewIso)}` : ' today'}` : null,
      // the day, and whether its log has arrived: the strip scrolls its next
      // dish into view once per day, after that day's ticks are known
      dayKey: `${viewIso || 'today'}:${viewingPast ? (st.liveFoodLogView ? 'in' : 'wait') : 'in'}`,
    },
    receipt: rec ? {
      key: `tick-${rec.slot}-${rec.recipeId}-${rec.at}`, at: rec.at, title: loggedLine(rec.name, rec.date),
      sub: rec.macros ? `${round(rec.macros.p)} g and ${kc(rec.macros.kcal)} kcal went on ${dayWord(rec.date) ? `${weekday(rec.date)}'s` : 'the'} plate${!rec.date && rec.portionsLeft != null ? ', one came out of the fridge' : ''}` : 'It went on the plate',
      undo: () => app.undoRotationReceipt(),
    } : null,
    openDish: tonight ? () => app.openRecipe(tonight.id) : null,
    slots: v.rotationSlots || [],
    addMeal: v.rotationAddMeal,
    eatenLine: filled.length ? `${filled.filter((s) => s.consumed).length} of ${filled.length} eaten today` : 'Nothing planned for today',
  } : null;

  // ---- the doors ------------------------------------------------------------
  const k = v.pickItUp;
  const pickAvailable = !!k?.available;
  const doors = {
    recipes: {
      count: live ? (st.liveRecipes || []).length : bank === 'demo' ? (v.recipeList || []).length : null,
      open: () => app.openFuelRecipes(),
      sub: bank === 'demo' ? 'The demo bank, as a list' : 'Your bank, as a list',
    },
    pickItUp: pickAvailable ? {
      open: k.open ? () => {} : k.toggle,
      sub: k.summaryLoaded && !k.countLine ? 'No catalogue yet' : 'What to buy with what’s left',
    } : null,
  };
  // Pick it up as a sheet: its own panel, unchanged. A result logs through
  // the portion sheet, which sits below this sheet, so the sheet steps aside
  // first rather than opening the portion choice behind itself.
  const close = () => app.setState({ eatOutOpen: false });
  const pickItUpSheet = pickAvailable ? {
    open: !!k.open,
    close,
    k: {
      ...k,
      results: k.results.map((r) => ({ ...r, log: () => { close(); r.log(); } })),
      pairs: k.pairs.map((pr) => ({ ...pr, log: () => { close(); pr.log(); } })),
    },
  } : null;

  // ---- Recipes, as its own page -------------------------------------------
  const kcalLeft = ctx.targetKcal != null ? Math.max(0, Math.round(ctx.targetKcal - (ctx.kcalCurrent || 0))) : null;
  const scope = [
    ...(v.recipeFilters || []).map((f) => ({ key: f.label, label: f.label, active: f.active, pick: f.go })),
    ...(v.recipeFitsAvailable && kcalLeft != null ? [{ key: 'fits', label: `Fits ${kcalLeft.toLocaleString('en-AU')} kcal left`, active: v.recipeFitsOn, pick: v.toggleRecipeFits, fits: true }] : []),
  ];
  const recipesPage = {
    open: st.fuelView === 'recipes' && st.screen === 'recipes',
    back: () => app.closeFuelRecipes(),
    search: v.recipeSearch, setSearch: v.setRecipeSearch,
    placeholder: live ? `Search ${(st.liveRecipes || []).length} recipes` : 'Search recipes',
    scope,
    rows: (v.recipeList || []).map((r) => {
      const toggles = r.slotToggles || [];
      const on = toggles.filter((s) => s.active);
      return {
        key: r.name, name: r.name,
        // macros not set yet: said in words, never a 0 g / 0 kcal
        sub: r.macrosPending ? `Macros not set${r.meta || r.time ? ` · ${r.meta || r.time}` : ''}` : `${round(r.p)} g protein · ${kc(r.kcal)} kcal${r.meta || r.time ? ` · ${r.meta || r.time}` : ''}`,
        p: r.macrosPending ? null : round(r.p), kcal: r.macrosPending ? null : round(r.kcal), makes: r.meta || r.time || '',
        reel: !!r.reel,
        pending: !!r.macrosPending,
        photoUrl: r.photoUrl || null,
        open: r.open,
        slot: toggles.length ? {
          letter: on[0]?.label || null,
          names: on.map((s) => s.title),
          choices: toggles.map((s) => ({ key: s.key, letter: s.label, name: s.title, active: s.active, toggle: s.onClick })),
        } : null,
      };
    }),
    bankState: bank,
    bankNote: v.recipeBankNote,
    demo: bank === 'demo',
    addNew: v.recipeAddVisible ? v.openAddRecipe : null,
  };

  // ---- the recipe, as a sheet ---------------------------------------------
  const recipeSheet = v.recipeOpen ? buildRecipeSheet(app, st, v, { live }) : null;

  // ---- the bottom of the page, in his order (src/fuelCards.js) -----------
  // The cards below the composer, each switchable and draggable in the same
  // Health-style sheet as Home's Pinned. A card with nothing to draw is
  // skipped, never drawn empty; a hidden one is one tap away in the sheet.
  const cardList = st.fuelCards || getFuelCards();
  const present = { log: !!log, history: !!log, rotation: !!rotation, recipes: true, pick: !!doors.pickItUp };
  const cards = {
    runs: fuelCardRuns(cardList, present),
    hidden: cardList.filter((c) => !c.on).length,
    edit: {
      open: !!st.fuelCardsEditOpen,
      show: () => app.openFuelCardsEdit(),
      close: () => app.closeFuelCardsEdit(),
      setList: (list) => app.setFuelCards(list),
    },
    rows: cardList.map((c) => ({ ...c, present: present[c.key] !== false })),
    all: FUEL_CARDS.length,
  };

  return {
    fuelSummary: {
      state,
      cards,
      bankNote: v.recipeBankNote,
      plate,
      week: { data: v.fuelWeek || null, cross: v.fuelCross || null, askProtein: v.askProteinVerdict || null },
      composer,
      log,
      rotation,
      doors,
      pickItUpSheet,
      recipesPage,
      recipeSheet,
    },
  };
}

// Which rotation slots a recipe can be planned into, and where it already is.
function slotChoices(app, st, id) {
  const rot = st.liveRotation;
  if (!rot || !id) return [];
  const order = rot.order || Object.keys(SLOT_NAMES);
  return order.map((key) => {
    const name = SLOT_NAMES[key] || rot.labels?.[key] || key;
    return {
      key, name,
      letter: SLOT_LETTERS[key] || String(name).slice(0, 1).toUpperCase(),
      active: (rot.options?.[key] || []).some((d) => d.id === id),
      toggle: () => app.toggleRotationSlot(key, id),
    };
  });
}

function buildRecipeSheet(app, st, v, { live }) {
  const liveOr = live ? (st.liveRecipes || []).find((r) => r.id === st.openRecipeId) || null : null;
  const demoOr = !liveOr && Array.isArray(app.recipes) ? app.recipes.find((r) => r.id === st.openRecipeId) || null : null;
  const activeAlt = liveOr ? (liveOr.alternates || []).find((a) => a.id === st.recipeAltSelected) || null : null;
  const baseMacros = activeAlt?.macros || liveOr?.macros || (demoOr ? { p: demoOr.p, c: demoOr.c, f: demoOr.f, kcal: demoOr.kcal } : null);
  const slots = liveOr ? slotChoices(app, st, liveOr.id) : [];
  const inSlots = slots.filter((s) => s.active).map((s) => s.name.toLowerCase());
  const meta = liveOr
    ? [activeAlt ? `Version: ${activeAlt.label}` : null, CATEGORY[liveOr.category] || liveOr.category, liveOr.makes || null,
      inSlots.length ? `in today's ${inSlots.join(' and ')}` : null].filter(Boolean).join(' · ')
    : demoOr ? `${demoOr.tag} · ${demoOr.time} · demo recipe` : '';
  const logName = liveOr ? (activeAlt ? `${liveOr.name} (${activeAlt.label})` : liveOr.name) : '';
  const portions = v.orPortions;
  const removals = v.ingredientRemovals || [];
  // THE RECIPE PAGE (29 Sep 2026): the same view model the cupertino page
  // renders — meta row, scale, the scaled checklist, the method — so the
  // sheet can never lack a field the page has
  const P = v.recipePage || null;

  return {
    id: st.openRecipeId,
    name: v.orName,
    meta,
    description: v.orDescription || null,
    live: !!liveOr,
    photo: liveOr ? { url: v.orPhotoUrl, busy: v.orPhotoUploadBusy, onFile: v.onRecipePhotoFile } : null,
    macros: baseMacros ? { p: round(baseMacros.p), c: round(baseMacros.c), f: round(baseMacros.f), kcal: round(baseMacros.kcal), raw: baseMacros } : null,
    // a live recipe with no macros yet: the sheet says so in gold, offers the
    // editor to add them, and Log it waits (never a zero on his plate)
    pending: liveOr && !baseMacros ? { add: v.orAddMacros || null } : null,
    // ONE portion picker, and Log it: the existing recipe-portion write
    // (logRecipePortion), handed the version he is looking at
    log: liveOr && baseMacros ? (factor, custom = '') => {
      app.setState({ foodRecipePick: { id: liveOr.id, name: logName, macros: baseMacros }, foodPortionFactor: factor, foodPortionCustom: String(custom || '') },
        () => app.logRecipePortion());
    } : null,
    logsTo: st.foodLogDate ? `Logs to ${longDay(st.foodLogDate)}` : null,
    fridge: portions ? {
      left: portions.left, out: portions.out,
      more: () => (portions.left == null ? portions.set(1) : portions.cooked(1)),
      less: portions.left > 0 ? portions.ate : null,
      stop: portions.left != null ? portions.stop : null,
    } : null,
    page: P,
    // the lines as the batch he is looking at (scaled), for the per-line
    // shopping list and the removal pipeline; group labels are the page's
    lines: (P ? P.ingredients.filter((it) => !it.group) : []).map((it) => ({
      key: it.key, name: it.line, raw: it.raw, dropped: it.dropped,
      toggle: it.drop, shop: it.shop,
    })),
    removals: removals.length ? {
      count: removals.length,
      names: removals,
      canToday: !!v.removalCanToday,
      today: () => v.confirmRemovalSave('today'),
      keep: () => v.confirmRemovalSave('alt'),
    } : null,
    shopping: liveOr && P?.shopping ? {
      whole: P.shopping.whole ? P.shopping.add : null,
      // the scaled batch, dropped lines left out (recipePage.shopping)
      all: !P.shopping.whole && P.shopping.count > 0 ? P.shopping.add : null,
      count: P.shopping.count,
      scaled: P.shopping.scaled,
    } : null,
    tweak: v.orShowTweak ? {
      value: v.recipeTweakInput, set: v.setRecipeTweakInput, onKey: v.recipeTweakKey, submit: v.submitRecipeTweak,
      setValue: v.setRecipeTweakValue, submitVoice: v.submitRecipeTweakVoice, dictError: v.recipeDictationError,
      busy: !!v.recipeTweakBusy, error: v.recipeTweakError, preview: v.recipeTweakPreview,
      photos: v.recipeTweakPhotos, addPhotos: v.addRecipeTweakPhotos,
      save: v.saveRecipeTweak, saveToday: v.saveRecipeTweakToday, discard: v.discardRecipeTweak,
    } : null,
    ask: v.orShowAskNova ? { msgs: v.recipeMsgs, value: v.recipeInput, set: v.setRecipeInput, onKey: v.recipeKey, send: v.sendRecipe } : null,
    rotation: slots.length ? { slots, inSlots } : null,
    method: v.orSteps || [],
    versions: {
      list: v.orAlternates || [],
      rename: v.renameAltId ? { value: v.renameValue, set: v.setRenameValue, onKey: v.renameKey, commit: v.commitRename, cancel: v.cancelRename, error: v.renameError } : null,
    },
    notes: v.orNotes || [],
    edit: v.orCanEdit ? { editing: v.orEditing, start: v.startEdit, target: v.orEditTarget } : null,
    remove: v.orDelete ? { armed: !!v.orDeleteArmed, run: v.orDelete } : null,
    close: v.closeRecipe,
  };
}
