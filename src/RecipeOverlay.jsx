import { useRef } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { useDictation } from './useDictation.js';
import { TypeText } from './TypeText.jsx';

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
    { continuous: false, onError: (err) => v.recipeDictationError?.(err) },
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
          <span style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:var(--nv-gold)")}>RECIPE · FROM OBSIDIAN</span>
          {v.orDelete && (
            <Interactive as="span" onClick={v.orDelete}
              base={`cursor:pointer;font:var(--nv-micro-l);border-radius:9px;padding:9px 16px;margin-right:8px;border:1px solid color-mix(in srgb, var(--nv-warn) ${v.orDeleteArmed ? '55' : '22'}%, transparent);color:${v.orDeleteArmed ? 'var(--nv-warn)' : 'color-mix(in srgb, var(--nv-warn) 60%, transparent)'};background:${v.orDeleteArmed ? 'color-mix(in srgb, var(--nv-warn) 12%, transparent)' : 'transparent'}`}
              hoverStyle="color:var(--nv-warn)"
            >{v.orDeleteArmed ? 'TAP AGAIN TO DELETE' : '✕ DELETE'}</Interactive>
          )}
          <Interactive as="span" onClick={v.closeRecipe} base="cursor:pointer;font:var(--nv-micro-l);color:color-mix(in srgb, var(--nv-ink) 50%, transparent);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:9px;padding:9px 16px" hoverStyle="color:var(--nv-ink)">✕ CLOSE</Interactive>
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
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}><span style={css("font:var(--nv-micro-m);letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>MACROS</span><span style={css("font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>× {v.servings}</span></div>
              <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:9px;font:400 12px var(--nv-font-mono)")}>
                <div style={css("display:flex;justify-content:space-between")}><span style={css("color:var(--nv-cy)")}>PROTEIN</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orP}g</span></div>
                <div style={css("display:flex;justify-content:space-between")}><span style={css("color:var(--nv-gold)")}>CARBS</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orC}g</span></div>
                <div style={css("display:flex;justify-content:space-between")}><span style={css("color:var(--nv-vi)")}>FAT</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orF}g</span></div>
                <div style={css("display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}><span style={css("color:var(--nv-good)")}>ENERGY</span><span style={css("font-variant-numeric:tabular-nums;color:var(--nv-good)")}>{v.orKcal} kcal</span></div>
              </div>
            </div>
            {v.orShowServings && (
              <div style={css("margin-top:14px;display:flex;align-items:center;gap:12px")}>
                <span style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>SERVINGS</span>
                <Interactive as="span" onClick={v.decServ} base="cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);border-radius:8px;color:var(--nv-ink)" hoverStyle="border:1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)">−</Interactive>
                <span style={css("font:500 16px var(--nv-font-mono);font-variant-numeric:tabular-nums")}>{v.servings}</span>
                <Interactive as="span" onClick={v.incServ} base="cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);border-radius:8px;color:var(--nv-ink)" hoverStyle="border:1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)">+</Interactive>
              </div>
            )}
          </div>
          <div>
            <h2 style={css("margin:0;font:400 34px/1.1 var(--nv-font-serif)")}>{v.orName}</h2>
            <div style={css("margin-top:7px;font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.orMeta}</div>
            {v.orAlternates.length > 1 && (
              <div style={css("margin-top:12px;display:flex;flex-wrap:wrap;gap:7px")}>
                {v.orAlternates.map((a) => (
                  <Interactive
                    key={a.id ?? 'original'}
                    as="span"
                    onClick={a.onClick}
                    base={{
                      cursor: 'pointer', font: 'var(--nv-micro-m)', padding: '6px 12px', borderRadius: '7px',
                      border: a.active ? '1px solid color-mix(in srgb, var(--nv-cy) 50%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)',
                      color: a.active ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)',
                      background: a.active ? 'color-mix(in srgb, var(--nv-cy) 08%, transparent)' : 'rgba(0,0,0,.2)',
                    }}
                    hoverStyle={{ border: '1px solid color-mix(in srgb, var(--nv-cy) 50%, transparent)' }}
                  >
                    {a.label}{a.isToday ? ' · TODAY' : ''}
                  </Interactive>
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
                  base="cursor:pointer;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);padding:8px 15px;border-radius:8px;background:var(--nv-good);color:#122015"
                  hoverStyle={{ filter: 'brightness(1.08)' }}>＋ LOG THIS VERSION</Interactive>
                <span style={css("font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>adds it to your food log — pick a portion, recipe unchanged</span>
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
                {v.renameError && <span style={css("font:var(--nv-micro-m);color:var(--nv-warn)")}>{v.renameError}</span>}
              </div>
            )}
            {!v.renameAltId && v.orAlternates.filter((a) => a.active && (a.useToday || a.makePrimary || a.rename)).map((a) => (
              <div key={'act' + (a.id ?? 'orig')} style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
                {a.rename && (
                  <Interactive as="span" onClick={a.rename} title="Rename this variant" base="cursor:pointer;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);padding:7px 12px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 18%, transparent);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)" hoverStyle="border-color:color-mix(in srgb, var(--nv-cy) 45%, transparent);color:var(--nv-cy)">✎ RENAME</Interactive>
                )}
                {a.useToday && (
                  <Interactive as="span" onClick={a.useToday} base="cursor:pointer;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);padding:7px 14px;border-radius:8px;background:var(--nv-gold);color:#1a1322" hoverStyle={{ filter: 'brightness(1.08)' }}>USE FOR TODAY</Interactive>
                )}
                {a.isToday && <span style={css("font:var(--nv-micro-m);color:var(--nv-gold)")}>✓ today's version — recipe unchanged</span>}
                {a.makePrimary && (
                  <Interactive as="span" onClick={a.makePrimary} base="cursor:pointer;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);padding:7px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-cy) 45%, transparent);color:var(--nv-cy)" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 08%, transparent)">MAKE PRIMARY</Interactive>
                )}
                {a.makePrimary && <span style={css("font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>replaces the recipe — the old version stays as "Original"</span>}
              </div>
            ))}
            {v.orDescription && (
              <div style={css("margin-top:16px;font-size:14px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>{v.orDescription}</div>
            )}
            {v.orCanEdit && !v.orEditing && (
              <Interactive as="span" onClick={v.startEdit} title="Change what's in this meal and how it's made"
                base="cursor:pointer;display:inline-block;margin-top:14px;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);padding:7px 13px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 18%, transparent);color:color-mix(in srgb, var(--nv-ink) 58%, transparent)"
                hoverStyle="border-color:color-mix(in srgb, var(--nv-cy) 45%, transparent);color:var(--nv-cy)">✎ EDIT THIS MEAL</Interactive>
            )}
            {v.orEditing && <MealEditor v={v} />}
            {/* An item that IS the thing you buy gets its own way onto the
                list — the ingredients button below can never reach it. */}
            {!v.orEditing && v.orIsWholeItem && (
              <div style={css("margin-top:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:13px 15px;border-radius:10px;border:1px solid color-mix(in srgb, var(--nv-gold) 26%, transparent);background:color-mix(in srgb, var(--nv-gold) 05%, transparent)")}>
                <span style={css("font-size:12.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)")}>
                  A whole item — no ingredients to shop for, just the thing itself.
                </span>
                <Interactive as="span" onClick={v.addWholeItemToShoppingList}
                  title="Add this item to the shopping list"
                  base="cursor:pointer;flex:none;white-space:nowrap;font:var(--nv-micro-m);letter-spacing:.1em;padding:8px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-gold) 45%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 08%, transparent)"
                  hoverStyle="background:color-mix(in srgb, var(--nv-gold) 18%, transparent)">
                  ＋ ADD TO SHOPPING LIST
                </Interactive>
              </div>
            )}
            {!v.orEditing && v.orIngredients.length > 0 && (
              <>
                <div style={css("margin-top:18px;display:flex;justify-content:space-between;align-items:baseline")}>
                  <span style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>INGREDIENTS</span>
                  {v.orShowAddToShoppingList && (
                    <Interactive as="span" onClick={v.addRecipeToShoppingList} base="cursor:pointer;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:var(--nv-gold)" hoverStyle={{ color: 'color-mix(in srgb, var(--nv-gold) 85%, white)' }}>+ ADD TO SHOPPING LIST</Interactive>
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
                <div style={css("margin-top:18px;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>METHOD</div>
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
                    <div style={css("font:var(--nv-micro-m);letter-spacing:.2em;color:var(--nv-gold)")}>NOTES</div>
                    <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:8px")}>
                      {v.orNotes.map((n, i) => (
                        <div key={i} style={css("font-size:12.5px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 80%, transparent)")}>◆ {n}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={css("margin-top:20px;border:1px solid color-mix(in srgb, var(--nv-cy) 20%, transparent);border-radius:12px;padding:14px 16px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
                  <div style={css("font:var(--nv-micro-m);letter-spacing:.2em;color:var(--nv-cy)")}>ASK NOVA FOR A TWEAK</div>
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
                      base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', font: 'var(--nv-micro-m)', padding: '0 14px', borderRadius: '8px', background: 'var(--nv-cy)', color: 'var(--nv-on-acc)', opacity: v.recipeTweakBusy ? .6 : 1 }}
                      hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 80%, white)' }}
                    >
                      {v.recipeTweakBusy ? 'THINKING…' : 'ASK'}
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
                      <div style={css("font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 38%, transparent);margin-bottom:6px")}>SUGGESTION · ASK AGAIN ABOVE TO REFINE IT</div>
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
                <div style={css("font:var(--nv-micro-m);letter-spacing:.2em;color:var(--nv-cy)")}>ASK NOVA</div>
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
                  <Interactive as="span" onClick={v.sendRecipe} base="cursor:pointer;display:flex;align-items:center;font:var(--nv-micro-m);padding:0 14px;border-radius:8px;background:var(--nv-cy);color:var(--nv-on-acc)" hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 80%, white)' }}>ASK</Interactive>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const EDIT_LABEL = "font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)";
const EDIT_FIELD = "width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 13px;color:var(--nv-ink);font:400 13px/1.7 var(--nv-font-ui);outline:none;resize:vertical";

// One line per ingredient, one per step — the same shape the file stores, so
// what he types is what lands in the vault. Macros sit alongside because
// changing what's in a meal without correcting them would leave the numbers
// lying, and Nova doesn't do that.
function MealEditor({ v }) {
  return (
    <div style={css("margin-top:16px;border:1px solid color-mix(in srgb, var(--nv-cy) 24%, transparent);border-radius:12px;padding:16px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
      <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}>
        <span style={css("font:var(--nv-micro-m);letter-spacing:.2em;color:var(--nv-cy)")}>EDITING · {String(v.orEditTarget || '').toUpperCase()}</span>
        <span style={css("font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>writes to Obsidian</span>
      </div>

      <div style={css("margin-top:14px")}>
        <div style={css(EDIT_LABEL)}>INGREDIENTS — ONE PER LINE</div>
        <Interactive as="textarea" rows={7} value={v.orEditIngredients} onChange={v.setEditField('ingredients')}
          placeholder={'2 eggs\n100g egg whites'}
          style={css("margin-top:8px")} base={EDIT_FIELD} focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
      </div>

      <div style={css("margin-top:14px")}>
        <div style={css(EDIT_LABEL)}>METHOD — ONE STEP PER LINE</div>
        <Interactive as="textarea" rows={6} value={v.orEditMethod} onChange={v.setEditField('method')}
          placeholder={'Leave blank for a variant cooked the same way as the original'}
          style={css("margin-top:8px")} base={EDIT_FIELD} focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
      </div>

      <div style={css("margin-top:14px")}>
        <div style={css(EDIT_LABEL)}>MACROS</div>
        <div style={css("margin-top:8px;display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:8px")}>
          {[['p', 'P', 'var(--nv-cy)'], ['c', 'C', 'var(--nv-gold)'], ['f', 'F', 'var(--nv-vi)'], ['kcal', 'KCAL', 'var(--nv-good)']].map(([key, label, colour]) => (
            <label key={key} style={css("display:flex;flex-direction:column;gap:5px")}>
              <span style={css(`font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:${colour}`)}>{label}</span>
              <Interactive as="input" type="number" inputMode="decimal" min="0"
                value={key === 'p' ? v.orEditP : key === 'c' ? v.orEditC : key === 'f' ? v.orEditF : v.orEditKcal}
                onChange={v.setEditField(key)}
                base="width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 11px;color:var(--nv-ink);font:400 13px var(--nv-font-mono);font-variant-numeric:tabular-nums;outline:none"
                focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)" />
            </label>
          ))}
        </div>
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
