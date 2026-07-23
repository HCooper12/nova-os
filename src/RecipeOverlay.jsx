import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function RecipeOverlay({ v }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Recipe detail" onClick={v.closeRecipe} style={v.recipeOvWrap}>
      <div onClick={v.stopClick} style={css("width:860px;max-width:94vw;max-height:88vh;overflow-y:auto;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),inset 0 1px 0 var(--nv-spec);animation:fadeUp .3s ease-out")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center;padding:18px 26px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)")}>
          <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.24em;color:var(--nv-gold)")}>RECIPE · FROM OBSIDIAN</span>
          <Interactive as="span" onClick={v.closeRecipe} base="cursor:pointer;font:500 11px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 50%, transparent);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:7px;padding:5px 10px" hoverStyle="color:var(--nv-ink)">ESC</Interactive>
        </div>
        <div style={v.gridRecipeOv}>
          <div>
            {v.orPhotoUrl ? (
              <div style={css("height:170px;border-radius:12px;overflow:hidden;position:relative")}>
                <img src={v.orPhotoUrl} alt={v.orName} style={css("width:100%;height:100%;object-fit:cover;display:block")} />
              </div>
            ) : (
              <div style={v.orPhStyle}><span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>{v.orPhLabel}</span></div>
            )}
            <label style={css("cursor:pointer;display:block;margin-top:8px;text-align:center;font:500 10px var(--nv-font-mono);letter-spacing:.08em;color:var(--nv-cy);border:1px solid color-mix(in srgb, var(--nv-cy) 30%, transparent);border-radius:8px;padding:8px;background:color-mix(in srgb, var(--nv-cy) 05%, transparent)")}>
              {v.orPhotoUploadBusy ? 'Saving…' : (v.orPhotoUrl ? 'Change photo' : '+ Add a photo of this dish')}
              <input type="file" accept="image/*" onChange={v.onRecipePhotoFile} disabled={v.orPhotoUploadBusy} style={css("display:none")} />
            </label>
            <div style={css("margin-top:14px;border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:12px;padding:15px 17px;background:rgba(0,0,0,.22)")}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}><span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>MACROS</span><span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>× {v.servings}</span></div>
              <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:9px;font:400 12px var(--nv-font-mono)")}>
                <div style={css("display:flex;justify-content:space-between")}><span style={css("color:var(--nv-cy)")}>PROTEIN</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orP}g</span></div>
                <div style={css("display:flex;justify-content:space-between")}><span style={css("color:var(--nv-gold)")}>CARBS</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orC}g</span></div>
                <div style={css("display:flex;justify-content:space-between")}><span style={css("color:var(--nv-vi)")}>FAT</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orF}g</span></div>
                <div style={css("display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}><span style={css("color:var(--nv-good)")}>ENERGY</span><span style={css("font-variant-numeric:tabular-nums;color:var(--nv-good)")}>{v.orKcal} kcal</span></div>
              </div>
            </div>
            {v.orShowServings && (
              <div style={css("margin-top:14px;display:flex;align-items:center;gap:12px")}>
                <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.18em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>SERVINGS</span>
                <Interactive as="span" onClick={v.decServ} base="cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);border-radius:8px;color:var(--nv-ink)" hoverStyle="border:1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)">−</Interactive>
                <span style={css("font:500 16px var(--nv-font-mono);font-variant-numeric:tabular-nums")}>{v.servings}</span>
                <Interactive as="span" onClick={v.incServ} base="cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);border-radius:8px;color:var(--nv-ink)" hoverStyle="border:1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)">+</Interactive>
              </div>
            )}
          </div>
          <div>
            <h2 style={css("margin:0;font:400 34px/1.1 var(--nv-font-serif)")}>{v.orName}</h2>
            <div style={css("margin-top:7px;font:400 10.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.orMeta}</div>
            {v.orAlternates.length > 1 && (
              <div style={css("margin-top:12px;display:flex;flex-wrap:wrap;gap:7px")}>
                {v.orAlternates.map((a) => (
                  <Interactive
                    key={a.id ?? 'original'}
                    as="span"
                    onClick={a.onClick}
                    base={{
                      cursor: 'pointer', font: "500 10px var(--nv-font-mono)", padding: '6px 12px', borderRadius: '7px',
                      border: a.active ? '1px solid color-mix(in srgb, var(--nv-cy) 50%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)',
                      color: a.active ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)',
                      background: a.active ? 'color-mix(in srgb, var(--nv-cy) 08%, transparent)' : 'rgba(0,0,0,.2)',
                    }}
                    hoverStyle={{ border: '1px solid color-mix(in srgb, var(--nv-cy) 50%, transparent)' }}
                  >
                    {a.label}
                  </Interactive>
                ))}
              </div>
            )}
            {v.orDescription && (
              <div style={css("margin-top:16px;font-size:14px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>{v.orDescription}</div>
            )}
            {v.orIngredients.length > 0 && (
              <>
                <div style={css("margin-top:18px;display:flex;justify-content:space-between;align-items:baseline")}>
                  <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>INGREDIENTS</span>
                  {v.orShowAddToShoppingList && (
                    <Interactive as="span" onClick={v.addRecipeToShoppingList} base="cursor:pointer;font:500 9.5px var(--nv-font-mono);letter-spacing:.06em;color:var(--nv-gold)" hoverStyle={{ color: 'color-mix(in srgb, var(--nv-gold) 85%, white)' }}>+ ADD TO SHOPPING LIST</Interactive>
                  )}
                </div>
                <div style={css("margin-top:10px;display:flex;flex-direction:column")}>
                  {v.orIngredients.map((ing, i) => (
                    <div key={i} style={css("display:flex;gap:12px;padding:7px 0;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 05%, transparent);font-size:13.5px")}><span style={css("font:400 11.5px var(--nv-font-mono);color:var(--nv-gold);width:74px;font-variant-numeric:tabular-nums")}>{ing.qty}</span><span style={css("color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>{ing.name}</span></div>
                  ))}
                </div>
              </>
            )}
            {v.orSteps.length > 0 && (
              <>
                <div style={css("margin-top:18px;font:500 9.5px var(--nv-font-mono);letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>METHOD</div>
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
                    <div style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-gold)")}>NOTES</div>
                    <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:8px")}>
                      {v.orNotes.map((n, i) => (
                        <div key={i} style={css("font-size:12.5px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 80%, transparent)")}>◆ {n}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={css("margin-top:20px;border:1px solid color-mix(in srgb, var(--nv-cy) 20%, transparent);border-radius:12px;padding:14px 16px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
                  <div style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-cy)")}>ASK NOVA FOR A TWEAK</div>
                  <div style={css("margin-top:8px;font-size:12px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
                    Out of an ingredient? Want it lighter? Ask — Nova suggests a version, saved as an alternative you can switch back from any time.
                  </div>
                  <div style={css("display:flex;gap:8px;margin-top:12px")}>
                    <Interactive
                      as="input"
                      value={v.recipeTweakInput}
                      onChange={v.setRecipeTweakInput}
                      onKeyDown={v.recipeTweakKey}
                      disabled={v.recipeTweakBusy}
                      placeholder='Try "no soy sauce, what instead?" or "cut the carbs"…'
                      base="flex:1;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 13px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none"
                      focusStyle="border:1px solid color-mix(in srgb, var(--nv-cy) 50%, transparent)"
                    />
                    <Interactive
                      as="span"
                      onClick={v.recipeTweakBusy ? undefined : v.submitRecipeTweak}
                      base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', font: "500 10.5px var(--nv-font-mono)", padding: '0 14px', borderRadius: '8px', background: 'var(--nv-cy)', color: '#0a2830', opacity: v.recipeTweakBusy ? .6 : 1 }}
                      hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 80%, white)' }}
                    >
                      {v.recipeTweakBusy ? 'THINKING…' : 'ASK'}
                    </Interactive>
                  </div>
                  {v.recipeTweakError && (
                    <div style={css("margin-top:10px;font-size:12px;color:var(--nv-warn)")}>{v.recipeTweakError}</div>
                  )}
                  {v.recipeTweakPreview && (
                    <div style={css("margin-top:14px;border-top:1px solid color-mix(in srgb, var(--nv-cy) 15%, transparent);padding-top:12px")}>
                      <div style={css("font-size:13.5px;font-weight:500;color:var(--nv-ink)")}>{v.recipeTweakPreview.label}</div>
                      <div style={css("margin-top:7px;display:flex;gap:12px;font:400 11px var(--nv-font-mono)")}>
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
                        <Interactive as="span" onClick={v.saveRecipeTweak} base="cursor:pointer;font-size:12px;font-weight:500;padding:7px 16px;border-radius:7px;background:var(--nv-cy);color:#0a2830" hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 80%, white)' }}>Save as alternative</Interactive>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : v.orShowAskNova && (
              <div style={css("margin-top:20px;border:1px solid color-mix(in srgb, var(--nv-cy) 20%, transparent);border-radius:12px;padding:14px 16px;background:color-mix(in srgb, var(--nv-cy) 04%, transparent)")}>
                <div style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-cy)")}>ASK NOVA</div>
                {v.recipeMsgs.map((m, i) => (
                  <div key={i} style={css("margin-top:10px;font-size:13px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 85%, transparent);animation:fadeUp .3s ease-out")}><span style={m.tagStyle}>{m.tag}</span> {m.text}{m.typing && <span style={css("color:var(--nv-cy)")}>▍</span>}</div>
                ))}
                <div style={css("display:flex;gap:8px;margin-top:12px")}>
                  <Interactive
                    as="input"
                    value={v.recipeInput}
                    onChange={v.setRecipeInput}
                    onKeyDown={v.recipeKey}
                    placeholder='Try "suggest a swap" or "scale for cutting"…'
                    base="flex:1;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 13px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none"
                    focusStyle="border:1px solid color-mix(in srgb, var(--nv-cy) 50%, transparent)"
                  />
                  <Interactive as="span" onClick={v.sendRecipe} base="cursor:pointer;display:flex;align-items:center;font:500 10.5px var(--nv-font-mono);padding:0 14px;border-radius:8px;background:var(--nv-cy);color:#0a2830" hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 80%, white)' }}>ASK</Interactive>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
