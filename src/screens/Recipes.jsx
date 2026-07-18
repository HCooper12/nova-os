import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Recipes({ v }) {
  return (
    <div style={v.wrapRecipes} data-screen-label="Recipes">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.14em;color:var(--nv-acc)")}>VI.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>VAULT · RECIPES</span>
        </div>
        <span style={css("font:400 10px 'IBM Plex Mono',monospace;letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.recipesHeaderLabel}</span>
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 'Rajdhani',sans-serif;letter-spacing:.02em")}>Recipes, <span style={css("font:italic 400 27px 'Instrument Serif',serif;color:var(--nv-gold)")}>macros first.</span></h1>

      {v.rotationVisible && (
        <div style={css("margin-top:18px;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:16px 18px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec)")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px")}>
            <span style={css("font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>TODAY'S ROTATION</span>
            <span style={css("font:400 11px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)")}>
              <span style={css("color:var(--nv-cy)")}>{v.rotationTotals.p}P</span> · <span style={css("color:var(--nv-gold)")}>{v.rotationTotals.c}C</span> · <span style={css("color:var(--nv-vi)")}>{v.rotationTotals.f}F</span> · <span style={css("color:var(--nv-good)")}>{v.rotationTotals.kcal} kcal</span>{v.rotationTargetKcal ? ` / ${v.rotationTargetKcal}` : ''}{v.rotationProteinFloor ? ` · protein floor ${v.rotationProteinFloor}g` : ''}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: '10px', marginTop: '12px' }}>
            {v.rotationSlots.map((s) => (
              <div key={s.key} style={{ border: `1px solid rgba(${s.hue},${s.recipeName ? '.45' : '.14'})`, borderRadius: '10px', padding: '10px 12px', background: s.consumed ? `color-mix(in srgb, var(--nv-good) 08%, transparent)` : (s.recipeName ? `rgba(${s.hue},.07)` : 'rgba(0,0,0,.2)') }}>
                <div style={css("display:flex;justify-content:space-between;align-items:center")}>
                  <span style={{ font: "500 9px 'IBM Plex Mono',monospace", letterSpacing: '.16em', color: `rgba(${s.hue},.95)` }}>{s.name.toUpperCase()}</span>
                  {s.clear && <Interactive as="span" onClick={s.clear} base="cursor:pointer;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)" hoverStyle="color:var(--nv-warn)">×</Interactive>}
                </div>
                {s.recipeName ? (
                  <>
                    <Interactive as="div" onClick={s.open} base="cursor:pointer;margin-top:6px;font-size:12.5px;color:var(--nv-ink);line-height:1.3" hoverStyle="color:var(--nv-gold)">{s.recipeName}</Interactive>
                    <div style={css("margin-top:5px;display:flex;gap:7px;font:400 9.5px 'IBM Plex Mono',monospace")}>
                      <span style={css("color:var(--nv-cy)")}>{s.p}P</span><span style={css("color:var(--nv-gold)")}>{s.c}C</span><span style={css("color:var(--nv-vi)")}>{s.f}F</span><span style={css("color:var(--nv-good)")}>{s.kcal}kcal</span>
                    </div>
                    <Interactive
                      as="div"
                      onClick={s.toggleConsumed}
                      base={{ cursor: 'pointer', marginTop: '8px', textAlign: 'center', font: "500 9.5px 'IBM Plex Mono',monospace", padding: '4px 0', borderRadius: '5px',
                        border: s.consumed ? '1px solid color-mix(in srgb, var(--nv-good) 50%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)',
                        color: s.consumed ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 45%, transparent)',
                        background: s.consumed ? 'color-mix(in srgb, var(--nv-good) 12%, transparent)' : 'transparent' }}
                      hoverStyle={{ borderColor: 'color-mix(in srgb, var(--nv-good) 50%, transparent)' }}
                    >
                      {s.consumed ? '✓ Eaten' : 'Mark eaten'}
                    </Interactive>
                  </>
                ) : (
                  <div style={css("margin-top:6px;font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 32%, transparent)")}>not set</div>
                )}
              </div>
            ))}
          </div>
          {v.rotationShowExtraButton && (
            <Interactive as="span" onClick={v.showExtraMealSlot} base="cursor:pointer;display:inline-block;margin-top:12px;font:400 10.5px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-gold)">+ add a 4th meal</Interactive>
          )}
        </div>
      )}

      {v.foodLogVisible && (
        <div style={css("margin-top:12px;border:1px solid color-mix(in srgb, var(--nv-good) 18%, transparent);border-radius:14px;padding:16px 18px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-good) 05%, transparent),color-mix(in srgb, var(--nv-good) 01%, transparent));box-shadow:inset 0 1px 0 rgba(255,255,255,.04)")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px")}>
            <span style={css("font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:var(--nv-good)")}>LOG SOMETHING ELSE</span>
            {v.foodLogEntries.length > 0 && (
              <span style={css("font:400 11px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)")}>
                <span style={css("color:var(--nv-cy)")}>{v.foodLogTotals.p}P</span> · <span style={css("color:var(--nv-gold)")}>{v.foodLogTotals.c}C</span> · <span style={css("color:var(--nv-vi)")}>{v.foodLogTotals.f}F</span> · <span style={css("color:var(--nv-good)")}>{v.foodLogTotals.kcal} kcal</span>
              </span>
            )}
          </div>
          <div style={css("margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
            <Interactive as="input" value={v.foodScanNote} onChange={v.setFoodScanNote} placeholder="Note for the scan — e.g. “ate half” (optional)" base="flex:1;min-width:180px;box-sizing:border-box;background:rgba(0,0,0,.28);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 12px;color:var(--nv-ink);font-size:12.5px;font-family:'Rajdhani',sans-serif;outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <label style={css("cursor:pointer;flex:none;font-size:11.5px;padding:9px 13px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-good) 35%, transparent);color:var(--nv-good);background:color-mix(in srgb, var(--nv-good) 08%, transparent)")}>
              {v.foodScanBusy ? 'Analyzing…' : 'Scan label'}
              <input type="file" accept="image/*" capture="environment" onChange={v.scanFoodLabel} disabled={v.foodScanBusy} style={css("display:none")} />
            </label>
            <label style={css("cursor:pointer;flex:none;font-size:11.5px;padding:9px 13px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-good) 35%, transparent);color:var(--nv-good);background:color-mix(in srgb, var(--nv-good) 08%, transparent)")}>
              {v.foodScanBusy ? 'Analyzing…' : 'Photo of meal'}
              <input type="file" accept="image/*" capture="environment" onChange={v.scanFoodMeal} disabled={v.foodScanBusy} style={css("display:none")} />
            </label>
            <Interactive as="span" onClick={v.foodScanBusy ? undefined : v.openBarcodeScanner} base="cursor:pointer;flex:none;font-size:11.5px;padding:9px 13px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-good) 35%, transparent);color:var(--nv-good);background:color-mix(in srgb, var(--nv-good) 08%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-good) 16%, transparent)">{v.foodScanBusy ? 'Analyzing…' : 'Scan barcode'}</Interactive>
          </div>
          {v.foodScanError && <div style={css("margin-top:8px;font-size:12px;color:#e08f6f")}>{v.foodScanError}</div>}
          {v.foodScanQuestion && (
            <div style={css("margin-top:8px;font-size:12px;color:var(--nv-gold);font-style:italic")}>Nova's not fully sure — {v.foodScanQuestion} Adjust the numbers below if needed.</div>
          )}
          <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
            <Interactive as="input" value={v.foodLogName} onChange={v.setFoodLogName} placeholder="What did you eat?" base="flex:1;min-width:140px;box-sizing:border-box;background:rgba(0,0,0,.28);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 12px;color:var(--nv-ink);font-size:12.5px;font-family:'Rajdhani',sans-serif;outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" value={v.foodLogP} onChange={v.setFoodLogP} placeholder="P" base="width:52px;box-sizing:border-box;background:rgba(0,0,0,.28);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-cy);font-size:12.5px;font-family:'IBM Plex Mono',monospace;outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" value={v.foodLogC} onChange={v.setFoodLogC} placeholder="C" base="width:52px;box-sizing:border-box;background:rgba(0,0,0,.28);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-gold);font-size:12.5px;font-family:'IBM Plex Mono',monospace;outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" value={v.foodLogF} onChange={v.setFoodLogF} placeholder="F" base="width:52px;box-sizing:border-box;background:rgba(0,0,0,.28);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-vi);font-size:12.5px;font-family:'IBM Plex Mono',monospace;outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" value={v.foodLogKcal} onChange={v.setFoodLogKcal} placeholder="kcal" base="width:62px;box-sizing:border-box;background:rgba(0,0,0,.28);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-good);font-size:12.5px;font-family:'IBM Plex Mono',monospace;outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="span" onClick={v.foodLogBusy ? undefined : v.submitFoodLog} base={{ cursor: 'pointer', flex: 'none', font: "500 11px 'IBM Plex Mono',monospace", padding: '9px 16px', borderRadius: '8px', background: 'var(--nv-good)', color: '#122015', opacity: v.foodLogBusy ? .6 : 1 }} hoverStyle={{ background: 'color-mix(in srgb, var(--nv-good) 80%, white)' }}>{v.foodLogBusy ? 'Adding…' : '+ Add'}</Interactive>
          </div>
          {v.foodLogError && <div style={css("margin-top:8px;font-size:12px;color:#e08f6f")}>{v.foodLogError}</div>}
          {v.foodLogEntries.length > 0 && (
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:6px")}>
              {v.foodLogEntries.map((e) => (
                <div key={e.id} style={css("display:flex;align-items:center;gap:10px;font-size:12.5px;padding:6px 0;border-top:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)")}>
                  <span style={css("font:400 10.5px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);width:40px;flex:none")}>{e.time}</span>
                  <span style={css("flex:1")}>{e.name}</span>
                  <span style={css("font:400 10.5px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 50%, transparent);flex:none")}>{e.p}P · {e.c}C · {e.f}F · {e.kcal}kcal</span>
                  <Interactive as="span" onClick={e.remove} base="cursor:pointer;flex:none;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)" hoverStyle="color:var(--nv-warn)">×</Interactive>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;justify-content:space-between;align-items:center")}>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
          {v.recipeFilters.map((f) => (
            <Interactive key={f.label} as="span" onClick={f.go} base={f.style} hoverStyle="border:1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)">{f.label}</Interactive>
          ))}
        </div>
        {v.recipeAddVisible && (
          <Interactive as="span" onClick={v.openAddRecipe} base="cursor:pointer;font:500 10.5px 'IBM Plex Mono',monospace;padding:8px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 14%, transparent)">+ Add recipe</Interactive>
        )}
      </div>
      <div style={v.gridRecipes}>
        {v.recipeList.map((r) => (
          <Interactive
            key={r.name}
            onClick={r.open}
            base="cursor:pointer;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);overflow:hidden;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec),0 14px 34px -20px rgba(0,0,0,.9)"
            hoverStyle="border-color:color-mix(in srgb, var(--nv-gold) 40%, transparent);transform:translateY(-2px)"
          >
            {r.photoUrl ? (
              <div style={css("height:104px;overflow:hidden")}><img src={r.photoUrl} alt={r.name} style={css("width:100%;height:100%;object-fit:cover;display:block")} /></div>
            ) : (
              <div style={r.phStyle}><span style={css("font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>{r.phLabel}</span></div>
            )}
            <div style={css("padding:14px 17px")}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
                <div style={css("font-size:15.5px;font-weight:500")}>{r.name}</div>
                <span style={css("font:400 9.5px 'IBM Plex Mono',monospace;color:var(--nv-gold)")}>{r.tag}</span>
              </div>
              <div style={css("margin-top:7px;display:flex;gap:12px;font:400 11px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
                <span style={css("color:var(--nv-cy)")}>{r.p}P</span><span>{r.c}C</span><span>{r.f}F</span><span style={css("margin-left:auto")}><span style={css("color:var(--nv-good)")}>{r.kcal} kcal</span>{r.time ? ` · ${r.time}` : ''}</span>
              </div>
              <div style={css("margin-top:10px;display:flex;gap:3px;height:4px")}>
                <span style={r.pBar}></span><span style={r.cBar}></span><span style={r.fBar}></span>
              </div>
              {r.slotToggles && r.slotToggles.length > 0 && (
                <div style={css("margin-top:10px;display:flex;gap:5px")} onClick={(e) => e.stopPropagation()}>
                  {r.slotToggles.map((s) => (
                    <Interactive
                      key={s.key}
                      as="span"
                      onClick={s.onClick}
                      base={{
                        cursor: 'pointer', flex: '1', textAlign: 'center', font: "500 9.5px 'IBM Plex Mono',monospace", padding: '4px 0', borderRadius: '5px',
                        border: `1px solid rgba(${s.hue},${s.active ? '.6' : '.14'})`,
                        color: s.active ? `rgb(${s.hue})` : 'color-mix(in srgb, var(--nv-ink) 40%, transparent)',
                        background: s.active ? `rgba(${s.hue},.14)` : 'transparent',
                      }}
                      hoverStyle={{ borderColor: `rgba(${s.hue},.6)` }}
                    >
                      {s.label}
                    </Interactive>
                  ))}
                </div>
              )}
            </div>
          </Interactive>
        ))}
      </div>
    </div>
  );
}
