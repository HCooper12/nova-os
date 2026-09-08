import { useRef } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { useDictation } from './useDictation.js';
import { TypeText } from './TypeText.jsx';
import { Eyebrow, TextAction, Chip, Meta, isAppleStyle } from './Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx
const cap = (s) => String(s || '').toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase());
const btn = (bg, ink, extra = {}) => (isAppleStyle()
  ? { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '600 15px var(--nv-font-ui)', letterSpacing: '-.01em', padding: '10px 18px', borderRadius: '999px', background: bg, color: ink, ...extra }
  : { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: 'var(--nv-micro-l)', textTransform: 'uppercase', padding: '9px 16px', borderRadius: '8px', background: bg, color: ink, ...extra });

export function RecipeOverlay({ v }) {
  // Talking about a meal, in the place the meal is. One-shot dictation: a
  // pause ends the take and the question goes straight to Nova, and because
  // the last preview travels with it, "keep the two whole eggs, what else
  // raises the protein?" refines rather than restarts.
  const askRef = useRef('');
  askRef.current = v.recipeTweakInput;
  const askVoice = useRef(v.submitRecipeTweakVoice);
  askVoice.current = v.submitRecipeTweakVoice;
  const dict = useDictation(
    () => '',
    (text) => v.setRecipeTweakValue?.(text),
    () => { if (askRef.current?.trim()) askVoice.current?.(); },
    { holdMs: v.voiceHoldMs, leadMs: v.voiceLeadMs, onError: (err) => v.recipeDictationError?.(err) },
  );
  return (
    <div role="dialog" aria-modal="true" aria-label="Recipe detail" onClick={v.closeRecipe} style={v.recipeOvWrap}>
      {/* the panel carries the SAME view-transition-name the card had, so the
          card morphs into this rather than one vanishing and the other
          appearing. The fadeUp fallback only runs where the API is absent. */}
      <div onClick={v.stopClick} style={{ ...(v.recipeOvMobile
        ? css("width:100%;height:100%;overflow-y:auto;background:var(--nv-glass2);padding-bottom:calc(24px + env(safe-area-inset-bottom))")
        : css("width:860px;max-width:94vw;max-height:88vh;overflow-y:auto;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),inset 0 1px 0 var(--nv-spec)")),
        ...(v.recipeOvVtName ? { viewTransitionName: v.recipeOvVtName } : {}),
        animation: v.supportsViewTransitions ? undefined : (v.recipeOvMobile ? 'fadeUp .25s ease-out' : 'fadeUp .3s ease-out') }}>
        <div style={css(`position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;align-items:center;padding:${v.recipeOvMobile ? 'calc(12px + env(safe-area-inset-top)) 18px 12px' : '18px 26px'};border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent);background:var(--nv-glass2);backdrop-filter:blur(22px)`)}>
          <Eyebrow as="span" tone="gold">Recipe · from Obsidian</Eyebrow>
          <span style={css("display:flex;gap:8px;align-items:center")}>
            {v.orDelete && (
              <Chip tone="warn" active={!!v.orDeleteArmed} onClick={v.orDelete}>{v.orDeleteArmed ? 'Tap again to delete' : '✕ Delete'}</Chip>
            )}
            <Chip tone="quiet" onClick={v.closeRecipe}>✕ Close</Chip>
          </span>
        </div>
        <div style={v.gridRecipeOv}>
          <div>
            {v.orPhotoUrl ? (
              <div style={css("height:170px;border-radius:12px;overflow:hidden;position:relative")}>
                <img src={v.orPhotoUrl} alt={v.orName} style={css("width:100%;height:100%;object-fit:cover;display:block")} />
              </div>
            ) : (
              <div style={v.orPhStyle}><span style={css("font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>{v.orPhLabel}</span></div>
            )}
            <label style={css("cursor:pointer;display:block;margin-top:8px;text-align:center;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:var(--nv-cy);border:1px solid color-mix(in srgb, var(--nv-cy) 30%, transparent);border-radius:8px;padding:8px;background:color-mix(in srgb, var(--nv-cy) 05%, transparent)")}>
              {v.orPhotoUploadBusy ? 'Saving…' : (v.orPhotoUrl ? 'Change photo' : '+ Add a photo of this dish')}
              <input type="file" accept="image/*" onChange={v.onRecipePhotoFile} disabled={v.orPhotoUploadBusy} style={css("display:none")} />
            </label>
            <div style={css("margin-top:14px;border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:12px;padding:15px 17px;background:var(--nv-well)")}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}><Eyebrow as="span">Macros</Eyebrow><Meta tone="faint">× {v.servings}</Meta></div>
              <div style={css(`margin-top:12px;display:flex;flex-direction:column;gap:9px;font:400 ${isAppleStyle() ? '13px var(--nv-font-ui)' : '12px var(--nv-font-mono)'}`)}>
                <div style={css("display:flex;justify-content:space-between")}><Meta tone="cyan">Protein</Meta><span style={css("font-variant-numeric:tabular-nums")}>{v.orP}g</span></div>
                <div style={css("display:flex;justify-content:space-between")}><Meta tone="gold">Carbs</Meta><span style={css("font-variant-numeric:tabular-nums")}>{v.orC}g</span></div>
                <div style={css("display:flex;justify-content:space-between")}><Meta tone="violet">Fat</Meta><span style={css("font-variant-numeric:tabular-nums")}>{v.orF}g</span></div>
                <div style={css("display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}><Meta tone="good">Energy</Meta><span style={css("font-variant-numeric:tabular-nums;color:var(--nv-good)")}>{v.orKcal} kcal</span></div>
              </div>
            </div>
            {/* THE FRIDGE — how many cooked portions of this are left. Ticking
                the meal eaten in the rotation takes one off; here he corrects
                the count, or logs a fresh batch. Red when it is out. */}
            {v.orPortions && (
              <div style={css(`margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-radius:12px;padding:12px 14px;border:1px solid ${v.orPortions.out ? 'color-mix(in srgb, var(--nv-warn) 55%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 09%, transparent)'};background:${v.orPortions.out ? 'color-mix(in srgb, var(--nv-warn) 08%, transparent)' : 'var(--nv-well)'}`)}>
                <Eyebrow as="span" tone={v.orPortions.out ? 'warn' : 'faint'}>In the fridge</Eyebrow>
                {v.orPortions.left == null ? (
                  <>
                    <Meta tone="faint" style={{ flex: 1, textTransform: 'none', letterSpacing: 0 }}>Not counted — say how many you cooked</Meta>
                    <Chip tone="good" onClick={() => { const n = Number(window.prompt('How many portions did you cook?', '8')); if (Number.isInteger(n) && n > 0) v.orPortions.set(n); }}>＋ Cooked a batch</Chip>
                  </>
                ) : (
                  <>
                    <span style={css(`font:600 20px var(--nv-font-ui);font-variant-numeric:tabular-nums;color:${v.orPortions.out ? 'var(--nv-warn)' : 'var(--nv-ink)'}`)}>{v.orPortions.left}</span>
                    <Meta tone={v.orPortions.out ? 'warn' : 'faint'} style={{ flex: 1, textTransform: 'none', letterSpacing: 0 }}>{v.orPortions.out ? 'out — cook more' : `portion${v.orPortions.left === 1 ? '' : 's'} left`}</Meta>
                    <Chip tone="quiet" onClick={v.orPortions.ate} disabled={v.orPortions.out} title="Ate one outside the rotation">−1</Chip>
                    <Chip tone="good" onClick={() => { const n = Number(window.prompt('How many more did you cook?', '8')); if (Number.isInteger(n) && n > 0) v.orPortions.cooked(n); }}>＋ Cooked more</Chip>
                    <TextAction compact tone="faint" onClick={() => { const n = Number(window.prompt('Set the count', String(v.orPortions.left))); if (Number.isInteger(n) && n >= 0) v.orPortions.set(n); }}>Set</TextAction>
                    <TextAction compact tone="faint" onClick={v.orPortions.stop}>Stop counting</TextAction>
                  </>
                )}
              </div>
            )}
            {v.orShowServings && (
              <div style={css("margin-top:14px;display:flex;align-items:center;gap:12px")}>
                <Eyebrow as="span">Servings</Eyebrow>
                <Interactive as="span" onClick={v.decServ} base="cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);border-radius:8px;color:var(--nv-ink)" hoverStyle="border:1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)">−</Interactive>
                <span style={css("font:500 16px var(--nv-font-mono);font-variant-numeric:tabular-nums")}>{v.servings}</span>
                <Interactive as="span" onClick={v.incServ} base="cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);border-radius:8px;color:var(--nv-ink)" hoverStyle="border:1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)">+</Interactive>
              </div>
            )}
          </div>
          <div>
            <h2 style={css("margin:0;font:400 34px/1.1 var(--nv-font-serif)")}>{v.orName}</h2>
            <Meta as="div" tone="faint" style={{ marginTop: '7px', ...{ textTransform: 'none', letterSpacing: 0 } }}>{v.orMeta}</Meta>
            {v.orAlternates.length > 1 && (
              <div style={css("margin-top:12px;display:flex;flex-wrap:wrap;gap:7px")}>
                {v.orAlternates.map((a) => (
                  <Chip key={a.id ?? 'original'} tone={a.active ? 'cyan' : 'quiet'} active={a.active} onClick={a.onClick}>
                    {a.label}{a.isToday ? ' · today' : ''}
                  </Chip>
                ))}
              </div>
            )}
            {/* His ask: log the version he is LOOKING AT without promoting it
                to primary. Sits outside the per-variant action row on
                purpose — it must work for the Original too, and whether or
                not this recipe happens to sit in a rotation slot today. */}
            {v.orLogActive && (
              <div style={css("margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
                <Interactive as="span" onClick={v.orLogActive}
                  base={btn('var(--nv-good)', '#122015')}
                  hoverStyle={{ filter: 'brightness(1.08)' }}>＋ Log this version</Interactive>
                <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>adds it to your food log — pick a portion, recipe unchanged</Meta>
              </div>
            )}
            {v.renameAltId && (
              <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
                <Interactive as="input" autoFocus value={v.renameValue} onChange={v.setRenameValue} onKeyDown={v.renameKey}
                  placeholder="Variant name…"
                  base="flex:1;min-width:180px;max-width:340px;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:9px;padding:8px 12px;color:var(--nv-ink);font:400 12.5px var(--nv-font-ui);outline:none"
                  focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
                <Interactive as="span" onClick={v.commitRename} base="cursor:pointer;font:600 11px var(--nv-font-ui);padding:8px 16px;border-radius:980px;background:var(--nv-cy);color:var(--nv-on-acc)" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 85%, white)">Save name</Interactive>
                <Interactive as="span" onClick={v.cancelRename} base="cursor:pointer;font:500 11px var(--nv-font-ui);padding:8px 14px;border-radius:980px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)" hoverStyle={{ color: 'var(--nv-ink)' }}>Cancel</Interactive>
                {v.renameError && <Meta tone="warn" style={{ textTransform: 'none', letterSpacing: 0 }}>{v.renameError}</Meta>}
              </div>
            )}
            {!v.renameAltId && v.orAlternates.filter((a) => a.active && (a.useToday || a.makePrimary || a.rename)).map((a) => (
              <div key={'act' + (a.id ?? 'orig')} style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
                {a.rename && (
                  <Chip tone="quiet" onClick={a.rename} title="Rename this variant">✎ Rename</Chip>
                )}
                {a.useToday && (
                  <Interactive as="span" onClick={a.useToday} base={btn('var(--nv-gold)', '#1a1322')} hoverStyle={{ filter: 'brightness(1.08)' }}>Use for today</Interactive>
                )}
                {a.isToday && <Meta tone="gold" style={{ textTransform: 'none', letterSpacing: 0 }}>✓ today's version — recipe unchanged</Meta>}
                {a.makePrimary && (
                  <Chip tone="cyan" onClick={a.makePrimary}>Make primary</Chip>
                )}
                {a.makePrimary && <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>replaces the recipe — the old version stays as "Original"</Meta>}
              </div>
            ))}
            {v.orDescription && (
              <div style={css("margin-top:16px;font-size:14px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>{v.orDescription}</div>
            )}
            {v.orCanEdit && !v.orEditing && (
              <div style={css("margin-top:14px")}><Chip tone="quiet" onClick={v.startEdit} title="Change what's in this meal and how it's made">✎ Edit this meal</Chip></div>
            )}
            {v.orEditing && <MealEditor v={v} />}
            {/* An item that IS the thing you buy gets its own way onto the
                list — the ingredients button below can never reach it. */}
            {!v.orEditing && v.orIsWholeItem && (
              <div style={css("margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:13px 15px;border-radius:10px;border:1px solid color-mix(in srgb, var(--nv-gold) 26%, transparent);background:color-mix(in srgb, var(--nv-gold) 05%, transparent)")}>
                <span style={css("font-size:12.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)")}>
                  A whole item — no ingredients to shop for, just the thing itself.
                </span>
                <Chip tone="gold" onClick={v.addWholeItemToShoppingList} title="Add this item to the shopping list">＋ Add to shopping list</Chip>
              </div>
            )}
            {!v.orEditing && v.orIngredients.length > 0 && (
              <>
                <div style={css("margin-top:18px;display:flex;justify-content:space-between;align-items:baseline")}>
                  <Eyebrow as="span">Ingredients</Eyebrow>
                  {v.orShowAddToShoppingList && (
                    <TextAction compact tone="gold" onClick={v.addRecipeToShoppingList}>+ Add to shopping list</TextAction>
                  )}
                </div>
                <div style={css("margin-top:10px;display:flex;flex-direction:column")}>
                  {v.orIngredients.map((ing, i) => {
                    const marked = v.ingredientRemovals?.includes(ing.name);
                    return (
                      <div key={i} style={css("display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 05%, transparent);font-size:13.5px")}>
                        <span style={css("font:var(--nv-micro-l);color:var(--nv-gold);width:74px;font-variant-numeric:tabular-nums")}>{ing.qty}</span>
                        <span style={css(`flex:1;color:color-mix(in srgb, var(--nv-ink) ${marked ? 35 : 85}%, transparent);${marked ? 'text-decoration:line-through;' : ''}`)}>{ing.name}</span>
                        {v.addIngredientToShopping && !ing.group && (
                          <Interactive as="span" onClick={() => v.addIngredientToShopping(ing.name)} title="Add just this item to the shopping list"
                            base="cursor:pointer;flex:none;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:500 15px/1 var(--nv-font-ui);border:1.3px solid color-mix(in srgb, var(--nv-good) 55%, transparent);color:var(--nv-good);background:color-mix(in srgb, var(--nv-good) 07%, transparent)"
                            hoverStyle="background:color-mix(in srgb, var(--nv-good) 18%, transparent)">＋</Interactive>
                        )}
                        {v.toggleIngredientRemoval && !ing.group && (
                          <Interactive as="span" onClick={() => v.toggleIngredientRemoval(ing.name)} title={marked ? 'Keep it after all' : 'Remove this ingredient — choose today-only or a saved alternative when you save'}
                            base={`cursor:pointer;flex:none;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:500 13px/1 var(--nv-font-ui);border:1.3px solid color-mix(in srgb, var(--nv-warn) ${marked ? 80 : 45}%, transparent);color:var(--nv-warn);background:color-mix(in srgb, var(--nv-warn) ${marked ? 20 : 6}%, transparent)`}
                            hoverStyle="background:color-mix(in srgb, var(--nv-warn) 18%, transparent)">✕</Interactive>
                        )}
                      </div>
                    );
                  })}
                </div>
                {v.ingredientRemovals?.length > 0 && (
                  <Interactive as="div" onClick={v.openRemovalPrompt}
                    base="cursor:pointer;margin-top:12px;text-align:center;padding:12px 18px;border-radius:980px;background:var(--nv-cy);color:var(--nv-on-acc);font:600 13px var(--nv-font-ui)"
                    hoverStyle="background:color-mix(in srgb, var(--nv-cy) 85%, white)"
                  >Save changes — {v.ingredientRemovals.length} removed</Interactive>
                )}
                {v.removalPromptOpen && (
                  <div style={css("position:fixed;inset:0;z-index:96;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center;padding:18px")} onClick={v.cancelRemovalPrompt}>
                    <div style={css("width:100%;max-width:420px;display:flex;flex-direction:column;gap:9px;padding-bottom:env(safe-area-inset-bottom)")} onClick={(e) => e.stopPropagation()}>
                      <div style={css("border-radius:14px;overflow:hidden;background:var(--nv-pane, var(--nv-void));border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)")}>
                        <div style={css("padding:13px 16px;text-align:center;font:400 12px var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 55%, transparent);border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}>
                          Removing {v.ingredientRemovals.join(', ')} — Nova recomputes the macros. The stored recipe is only touched if you save an alternative.
                        </div>
                        {v.removalCanToday && (
                          <Interactive as="div" onClick={() => v.confirmRemovalSave('today')}
                            base="cursor:pointer;padding:14px;text-align:center;font:500 15px var(--nv-font-ui);color:var(--nv-cy);border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)"
                            hoverStyle="background:color-mix(in srgb, var(--nv-cy) 08%, transparent)">Just for today</Interactive>
                        )}
                        <Interactive as="div" onClick={() => v.confirmRemovalSave('alt')}
                          base="cursor:pointer;padding:14px;text-align:center;font:500 15px var(--nv-font-ui);color:var(--nv-cy)"
                          hoverStyle="background:color-mix(in srgb, var(--nv-cy) 08%, transparent)">Save as a new alternative</Interactive>
                      </div>
                      <Interactive as="div" onClick={v.cancelRemovalPrompt}
                        base="cursor:pointer;border-radius:14px;padding:14px;text-align:center;font:600 15px var(--nv-font-ui);color:var(--nv-cy);background:var(--nv-pane, var(--nv-void));border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)"
                        hoverStyle="background:color-mix(in srgb, var(--nv-ink) 06%, transparent)">Cancel</Interactive>
                    </div>
                  </div>
                )}
              </>
            )}
            {!v.orEditing && v.orSteps.length > 0 && (
              <>
                <Eyebrow style={{ marginTop: '18px' }}>Method</Eyebrow>
                <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:9px")}>
                  {v.orSteps.map((st, i) => (
                    <div key={i} style={css("display:flex;gap:12px;font-size:13.5px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 80%, transparent)")}><span style={css("font:italic 400 14px var(--nv-font-serif);color:color-mix(in srgb, var(--nv-gold) 70%, transparent)")}>{st.n}</span><span>{st.text}</span></div>
                  ))}
                </div>
              </>
            )}
            {v.orShowTweak ? (
              <>
                {v.orNotes.length > 0 && (
                  <div style={css("margin-top:20px;border:1px solid color-mix(in srgb, var(--nv-gold) 20%, transparent);border-radius:12px;padding:14px 16px;background:color-mix(in srgb, var(--nv-gold) 04%, transparent)")}>
                    <Eyebrow tone="gold">Notes</Eyebrow>
                    <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:8px")}>
                      {v.orNotes.map((n, i) => (
                        <div key={i} style={css("font-size:12.5px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 80%, transparent)")}>◆ {n}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={css("margin-top:20px;border:1px solid color-mix(in srgb, var(--nv-cy) 20%, transparent);border-radius:12px;padding:14px 16px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
                  <Eyebrow tone="cyan">Ask Nova for a tweak</Eyebrow>
                  <div style={css("margin-top:8px;font-size:12px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
                    Out of an ingredient? Want it lighter? Ask — type it or tap the mic and say it. Attach a photo of a different ingredient (its label, its packaging, the thing itself) and Nova reads it before recalculating. Nova suggests a version, saved as an alternative you can switch back from any time, and you can keep talking to refine it.
                  </div>
                  <div style={css("display:flex;gap:8px;margin-top:12px;flex-wrap:wrap")}>
                    <Interactive
                      as="input"
                      value={v.recipeTweakInput}
                      onChange={v.setRecipeTweakInput}
                      onKeyDown={v.recipeTweakKey}
                      disabled={v.recipeTweakBusy}
                      placeholder={v.recipeTweakPreview
                        ? 'Refine it — "keep the whole eggs, what else raises protein?"'
                        : 'Try "no soy sauce, what instead?" or "cut the carbs"…'}
                      base="flex:1;min-width:0;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 13px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none"
                      focusStyle="border:1px solid color-mix(in srgb, var(--nv-cy) 50%, transparent)"
                    />
                    {dict.supported && v.setRecipeTweakValue && (
                      <Interactive
                        as="span"
                        onClick={v.recipeTweakBusy ? undefined : dict.toggle}
                        title={dict.on ? 'Listening — pause to send' : 'Ask out loud'}
                        base={{ cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', borderRadius: '8px', font: '400 15px/1 var(--nv-font-ui)', border: `1px solid color-mix(in srgb, var(--nv-cy) ${dict.on ? 60 : 22}%, transparent)`, background: `color-mix(in srgb, var(--nv-cy) ${dict.on ? 18 : 5}%, transparent)`, color: 'var(--nv-cy)' }}
                        hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 14%, transparent)' }}
                      >{dict.on ? '◉' : '🎙'}</Interactive>
                    )}
                    {v.addRecipeTweakPhotos && (
                      <label
                        title="Attach a photo of a different ingredient"
                        style={css("cursor:pointer;flex:none;width:38px;display:flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-cy) 22%, transparent);background:color-mix(in srgb, var(--nv-cy) 05%, transparent)")}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--nv-cy)" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>
                        <input type="file" accept="image/*" multiple onChange={v.addRecipeTweakPhotos} disabled={v.recipeTweakBusy} style={css("display:none")} />
                      </label>
                    )}
                    <Interactive
                      as="span"
                      onClick={v.recipeTweakBusy ? undefined : v.submitRecipeTweak}
                      base={btn('var(--nv-cy)', 'var(--nv-on-acc)', { display: 'flex', padding: '0 14px', opacity: v.recipeTweakBusy ? .6 : 1 })}
                      hoverStyle={{ filter: 'brightness(1.08)' }}
                    >
                      {v.recipeTweakBusy ? 'Thinking…' : 'Ask'}
                    </Interactive>
                  </div>
                  {v.recipeTweakPhotos?.length > 0 && (
                    <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap")}>
                      {v.recipeTweakPhotos.map((ph, i) => (
                        <div key={i} style={css("position:relative;width:48px;height:48px;border-radius:8px;overflow:hidden;border:1px solid color-mix(in srgb, var(--nv-cy) 25%, transparent)")}>
                          <img src={ph.src} alt="" style={css("width:100%;height:100%;object-fit:cover;display:block")} />
                          {!v.recipeTweakBusy && (
                            <Interactive as="span" onClick={ph.remove} base="cursor:pointer;position:absolute;top:1px;right:1px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;border-radius:5px;background:rgba(0,0,0,.6);color:#fff" hoverStyle="background:var(--nv-warn)">×</Interactive>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {v.recipeTweakError && (
                    <div style={css("margin-top:10px;font-size:12px;color:var(--nv-warn)")}>{v.recipeTweakError}</div>
                  )}
                  {v.recipeTweakPreview && (
                    <div style={css("margin-top:14px;border-top:1px solid color-mix(in srgb, var(--nv-cy) 15%, transparent);padding-top:12px")}>
                      <Eyebrow style={{ marginBottom: '6px' }}>Suggestion · ask again above to refine it</Eyebrow>
                      <div style={css("font-size:13.5px;font-weight:500;color:var(--nv-ink)")}>{v.recipeTweakPreview.label}</div>
                      <div style={css("margin-top:7px;display:flex;gap:12px;font:var(--nv-micro-l)")}>
                        <span style={css("color:var(--nv-cy)")}>{v.recipeTweakPreview.macros.p}P</span>
                        <span style={css("color:var(--nv-gold)")}>{v.recipeTweakPreview.macros.c}C</span>
                        <span style={css("color:var(--nv-vi)")}>{v.recipeTweakPreview.macros.f}F</span>
                        <span style={css("color:var(--nv-good)")}>{v.recipeTweakPreview.macros.kcal} kcal</span>
                      </div>
                      <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:5px")}>
                        {v.recipeTweakPreview.ingredients.map((ing, i) => (
                          <div key={i} style={css("font-size:12px;color:color-mix(in srgb, var(--nv-ink) 75%, transparent)")}>· {ing}</div>
                        ))}
                      </div>
                      <div style={css("display:flex;gap:8px;margin-top:14px")}>
                        <Interactive as="span" onClick={v.discardRecipeTweak} base="cursor:pointer;font-size:12px;padding:7px 14px;border-radius:7px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);color:color-mix(in srgb, var(--nv-ink) 70%, transparent)" hoverStyle={{ background: 'rgba(255,255,255,.05)' }}>Discard</Interactive>
                        <Interactive as="span" onClick={v.saveRecipeTweak} base="cursor:pointer;font-size:12px;font-weight:500;padding:7px 16px;border-radius:7px;background:var(--nv-cy);color:var(--nv-on-acc)" hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 80%, white)' }}>Save as alternative</Interactive>
                        {v.saveRecipeTweakToday && (
                          <Interactive as="span" onClick={v.saveRecipeTweakToday} base="cursor:pointer;font-size:12px;font-weight:600;padding:7px 16px;border-radius:7px;background:var(--nv-gold);color:#1a1322" hoverStyle={{ filter: 'brightness(1.08)' }}>Save &amp; use today</Interactive>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : v.orShowAskNova && (
              <div style={css("margin-top:20px;border:1px solid color-mix(in srgb, var(--nv-cy) 20%, transparent);border-radius:12px;padding:14px 16px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
                <Eyebrow tone="cyan">Ask Nova</Eyebrow>
                {v.recipeMsgs.map((m, i) => (
                  <div key={i} style={css("margin-top:10px;font-size:13px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 85%, transparent);animation:fadeUp .3s ease-out")}><span style={m.tagStyle}>{m.tag}</span> <TypeText text={m.text} active={m.typing} /></div>
                ))}
                <div style={css("display:flex;gap:8px;margin-top:12px;flex-wrap:wrap")}>
                  <Interactive
                    as="input"
                    value={v.recipeInput}
                    onChange={v.setRecipeInput}
                    onKeyDown={v.recipeKey}
                    placeholder='Try "suggest a swap" or "scale for cutting"…'
                    base="flex:1;min-width:0;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 13px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none"
                    focusStyle="border:1px solid color-mix(in srgb, var(--nv-cy) 50%, transparent)"
                  />
                  <Interactive as="span" onClick={v.sendRecipe} base={btn('var(--nv-cy)', 'var(--nv-on-acc)', { display: 'flex', padding: '0 14px' })} hoverStyle={{ filter: 'brightness(1.08)' }}>Ask</Interactive>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const EDIT_FIELD = "width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 13px;color:var(--nv-ink);font:400 13px/1.7 var(--nv-font-ui);outline:none;resize:vertical";

// One line per ingredient, one per step — the same shape the file stores, so
// what he types is what lands in the vault. Macros sit alongside because
// changing what's in a meal without correcting them would leave the numbers
// lying, and Nova doesn't do that.
function MealEditor({ v }) {
  return (
    <div style={css("margin-top:16px;border:1px solid color-mix(in srgb, var(--nv-cy) 24%, transparent);border-radius:12px;padding:16px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
      <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}>
        <Eyebrow as="span" tone="cyan">Editing · {cap(v.orEditTarget)}</Eyebrow>
        <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>writes to Obsidian</Meta>
      </div>

      <div style={css("margin-top:14px")}>
        <Eyebrow>Ingredients — one per line</Eyebrow>
        <Interactive as="textarea" rows={7} value={v.orEditIngredients} onChange={v.setEditField('ingredients')}
          placeholder={'2 eggs\n100g egg whites'}
          style={css("margin-top:8px")} base={EDIT_FIELD} focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
      </div>

      <div style={css("margin-top:14px")}>
        <Eyebrow>Method — one step per line</Eyebrow>
        <Interactive as="textarea" rows={6} value={v.orEditMethod} onChange={v.setEditField('method')}
          placeholder={'Leave blank for a variant cooked the same way as the original'}
          style={css("margin-top:8px")} base={EDIT_FIELD} focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
      </div>

      <div style={css("margin-top:14px")}>
        <Eyebrow>Macros</Eyebrow>
        <div style={css("margin-top:8px;display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:8px")}>
          {[['p', 'P', 'var(--nv-cy)'], ['c', 'C', 'var(--nv-gold)'], ['f', 'F', 'var(--nv-vi)'], ['kcal', 'kcal', 'var(--nv-good)']].map(([key, label, colour]) => (
            <label key={key} style={css("display:flex;flex-direction:column;gap:5px")}>
              <Meta tone={colour} style={{ textTransform: 'none', letterSpacing: 0 }}>{label}</Meta>
              <Interactive as="input" type="number" inputMode="decimal" min="0"
                value={key === 'p' ? v.orEditP : key === 'c' ? v.orEditC : key === 'f' ? v.orEditF : v.orEditKcal}
                onChange={v.setEditField(key)}
                base="width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 11px;color:var(--nv-ink);font:400 13px var(--nv-font-mono);font-variant-numeric:tabular-nums;outline:none"
                focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
            </label>
          ))}
        </div>
      </div>

      {/* MACROS FROM THE LABELS. His ask (7 Sep): the numbers on some recipes
          are wrong; let him photograph each ingredient's nutrition panel, say
          the grams the recipe uses, and have Nova do the sums. The model reads
          the per-100g column, the server scales/sums/divides by servings, and
          the result only fills the four fields above — Save is still his. */}
      <div style={css("margin-top:14px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:12px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap")}>
          <Eyebrow>Or work them out from the labels</Eyebrow>
          <label style={css("cursor:pointer;font:600 12px var(--nv-font-ui);color:var(--nv-cy)")}>
            ＋ Add label photos
            <input type="file" accept="image/*" multiple style={css("display:none")} onChange={(e) => { v.addEditLabels(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        {v.orEditLabels.length === 0 ? (
          <Meta tone="faint" style={{ display: 'block', marginTop: '6px', textTransform: 'none', letterSpacing: 0 }}>One photo per ingredient's nutrition panel, then the grams this recipe uses of it.</Meta>
        ) : (
          <div style={css("display:flex;flex-direction:column;gap:8px;margin-top:10px")}>
            {v.orEditLabels.map((l) => (
              <div key={l.key} style={css("display:flex;align-items:center;gap:8px")}>
                <img src={l.image} alt="" style={css("width:40px;height:40px;object-fit:cover;border-radius:8px;flex:none;border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)")} />
                <Interactive as="input" type="text" value={l.name} onChange={l.setName} placeholder="what it is" aria-label="Ingredient"
                  base="flex:1;min-width:0;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 11px;color:var(--nv-ink);font:400 13px var(--nv-font-ui)"
                  focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
                <Interactive as="input" type="number" inputMode="decimal" min="1" value={l.grams} onChange={l.setGrams} placeholder="grams" aria-label={`Grams of ${l.name} in the recipe`}
                  base="width:84px;flex:none;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 11px;color:var(--nv-ink);font:400 13px var(--nv-font-ui);font-variant-numeric:tabular-nums"
                  focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
                <Interactive as="span" onClick={l.remove} aria-label={`Remove ${l.name}`} base="cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);font:400 16px var(--nv-font-ui)" hoverStyle="color:var(--nv-warn)">×</Interactive>
              </div>
            ))}
            <div style={css("display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px")}>
              <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>The whole recipe makes</Meta>
              <Interactive as="input" type="number" inputMode="decimal" min="1" value={v.orEditServings} onChange={v.setEditField('servings')} aria-label="Servings the recipe makes"
                base="width:64px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:8px 10px;color:var(--nv-ink);font:400 13px var(--nv-font-ui);font-variant-numeric:tabular-nums"
                focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
              <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>servings</Meta>
              <Chip tone="good" onClick={v.orEditLabelBusy ? undefined : v.computeFromLabels} style={{ marginLeft: 'auto', opacity: v.orEditLabelBusy ? .6 : 1 }}>{v.orEditLabelBusy ? 'Reading the labels…' : 'Work out the macros'}</Chip>
            </div>
          </div>
        )}
        {v.orEditLabelError && <div style={css("margin-top:8px;font-size:12px;color:var(--nv-warn)")}>{v.orEditLabelError}</div>}
        {v.orEditLabelResult && (
          <div style={css("margin-top:10px;border-radius:10px;padding:10px 12px;background:var(--nv-well);font:400 12px var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 75%, transparent);line-height:1.5")}>
            {v.orEditLabelResult.parts.map((p, i) => (
              <div key={i} style={css("display:flex;justify-content:space-between;gap:10px")}>
                <span style={css("min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{p.name} · {p.grams}g{p.low ? ' · hard to read' : ''}</span>
                <span style={css("flex:none;font-variant-numeric:tabular-nums")}><span style={css("color:var(--nv-cy)")}>{p.p}P</span> · <span style={css("color:var(--nv-gold)")}>{p.c}C</span> · <span style={css("color:var(--nv-vi)")}>{p.f}F</span> · <span style={css("color:var(--nv-good)")}>{p.kcal}</span></span>
              </div>
            ))}
            <div style={css("margin-top:6px;padding-top:6px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);display:flex;justify-content:space-between;gap:10px")}>
              <span>Whole recipe → ÷ {v.orEditLabelResult.servings} · the fields above are per serving</span>
              <span style={css("flex:none;font-variant-numeric:tabular-nums")}>{v.orEditLabelResult.total.p}P · {v.orEditLabelResult.total.c}C · {v.orEditLabelResult.total.f}F · {v.orEditLabelResult.total.kcal}</span>
            </div>
            {v.orEditLabelResult.warning && <div style={css("margin-top:6px;color:var(--nv-warn)")}>{v.orEditLabelResult.warning}</div>}
          </div>
        )}
      </div>

      {v.orEditError && (
        <div style={css("margin-top:12px;font-size:12px;color:var(--nv-warn)")}>{v.orEditError}</div>
      )}

      <div style={css("margin-top:16px;display:flex;gap:9px;align-items:center;flex-wrap:wrap")}>
        <Interactive as="span" onClick={v.orEditBusy ? undefined : v.saveEdit}
          base={{ cursor: 'pointer', font: '600 13px var(--nv-font-ui)', padding: '11px 22px', borderRadius: '980px', background: 'var(--nv-cy)', color: 'var(--nv-on-acc)', opacity: v.orEditBusy ? .6 : 1 }}
          hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 85%, white)' }}>
          {v.orEditBusy ? 'Saving…' : 'Save changes'}
        </Interactive>
        <Interactive as="span" onClick={v.cancelEdit}
          base="cursor:pointer;font:500 12.5px var(--nv-font-ui);padding:11px 16px;border-radius:980px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)"
          hoverStyle={{ color: 'var(--nv-ink)' }}>Cancel</Interactive>
      </div>
    </div>
  );
}
