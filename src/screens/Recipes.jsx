import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Recipes({ v }) {
  return (
    <div style={v.wrapRecipes} data-screen-label="Recipes">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>V.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>VAULT · RECIPES</span>
        </div>
        <span style={css("font:400 10px 'JetBrains Mono',monospace;letter-spacing:.12em;color:rgba(236,229,218,.45)")}>{v.recipesHeaderLabel}</span>
      </div>
      <h1 style={css("margin:18px 0 0;font:400 38px/1.1 'Instrument Serif',serif")}>Recipes, <span style={css("font-style:italic;color:#d8b573")}>macros first.</span></h1>

      {v.rotationVisible && (
        <div style={css("margin-top:18px;border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:16px 18px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06)")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px")}>
            <span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.45)")}>TODAY'S ROTATION</span>
            <span style={css("font:400 11px 'JetBrains Mono',monospace;color:rgba(236,229,218,.6)")}>
              <span style={css("color:#6be5f5")}>{v.rotationTotals.p}P</span> · <span style={css("color:#d8b573")}>{v.rotationTotals.c}C</span> · <span style={css("color:#8a6ad1")}>{v.rotationTotals.f}F</span> · <span style={css("color:#7cd68a")}>{v.rotationTotals.kcal} kcal</span>{v.rotationTargetKcal ? ` / ${v.rotationTargetKcal}` : ''}{v.rotationProteinFloor ? ` · protein floor ${v.rotationProteinFloor}g` : ''}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: '10px', marginTop: '12px' }}>
            {v.rotationSlots.map((s) => (
              <div key={s.key} style={{ border: `1px solid rgba(${s.hue},${s.recipeName ? '.45' : '.14'})`, borderRadius: '10px', padding: '10px 12px', background: s.recipeName ? `rgba(${s.hue},.07)` : 'rgba(0,0,0,.2)' }}>
                <div style={css("display:flex;justify-content:space-between;align-items:center")}>
                  <span style={{ font: "500 9px 'JetBrains Mono',monospace", letterSpacing: '.16em', color: `rgba(${s.hue},.95)` }}>{s.name.toUpperCase()}</span>
                  {s.clear && <Interactive as="span" onClick={s.clear} base="cursor:pointer;font-size:12px;color:rgba(236,229,218,.35)" hoverStyle="color:#c96f6f">×</Interactive>}
                </div>
                {s.recipeName ? (
                  <>
                    <Interactive as="div" onClick={s.open} base="cursor:pointer;margin-top:6px;font-size:12.5px;color:#ece5da;line-height:1.3" hoverStyle="color:#d8b573">{s.recipeName}</Interactive>
                    <div style={css("margin-top:5px;display:flex;gap:7px;font:400 9.5px 'JetBrains Mono',monospace")}>
                      <span style={css("color:#6be5f5")}>{s.p}P</span><span style={css("color:#d8b573")}>{s.c}C</span><span style={css("color:#8a6ad1")}>{s.f}F</span><span style={css("color:#7cd68a")}>{s.kcal}kcal</span>
                    </div>
                  </>
                ) : (
                  <div style={css("margin-top:6px;font-size:12.5px;color:rgba(236,229,218,.32)")}>not set</div>
                )}
              </div>
            ))}
          </div>
          {v.rotationShowExtraButton && (
            <Interactive as="span" onClick={v.showExtraMealSlot} base="cursor:pointer;display:inline-block;margin-top:12px;font:400 10.5px 'JetBrains Mono',monospace;color:rgba(236,229,218,.4)" hoverStyle="color:#d8b573">+ add a 4th meal</Interactive>
          )}
        </div>
      )}

      <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;justify-content:space-between;align-items:center")}>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
          {v.recipeFilters.map((f) => (
            <Interactive key={f.label} as="span" onClick={f.go} base={f.style} hoverStyle="border:1px solid rgba(216,181,115,.5)">{f.label}</Interactive>
          ))}
        </div>
        {v.recipeAddVisible && (
          <Interactive as="span" onClick={v.openAddRecipe} base="cursor:pointer;font:500 10.5px 'JetBrains Mono',monospace;padding:8px 14px;border-radius:8px;border:1px solid rgba(216,181,115,.35);color:#d8b573;background:rgba(216,181,115,.06)" hoverStyle="background:rgba(216,181,115,.14)">+ Add recipe</Interactive>
        )}
      </div>
      <div style={v.gridRecipes}>
        {v.recipeList.map((r) => (
          <Interactive
            key={r.name}
            onClick={r.open}
            base="cursor:pointer;border:1px solid rgba(236,229,218,.09);border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9)"
            hoverStyle="border-color:rgba(216,181,115,.4);transform:translateY(-2px)"
          >
            {r.photoUrl ? (
              <div style={css("height:104px;overflow:hidden")}><img src={r.photoUrl} alt={r.name} style={css("width:100%;height:100%;object-fit:cover;display:block")} /></div>
            ) : (
              <div style={r.phStyle}><span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.55)")}>{r.phLabel}</span></div>
            )}
            <div style={css("padding:14px 17px")}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
                <div style={css("font-size:15.5px;font-weight:500")}>{r.name}</div>
                <span style={css("font:400 9.5px 'JetBrains Mono',monospace;color:#d8b573")}>{r.tag}</span>
              </div>
              <div style={css("margin-top:7px;display:flex;gap:12px;font:400 11px 'JetBrains Mono',monospace;color:rgba(236,229,218,.55)")}>
                <span style={css("color:#6be5f5")}>{r.p}P</span><span>{r.c}C</span><span>{r.f}F</span><span style={css("margin-left:auto")}><span style={css("color:#7cd68a")}>{r.kcal} kcal</span>{r.time ? ` · ${r.time}` : ''}</span>
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
                        cursor: 'pointer', flex: '1', textAlign: 'center', font: "500 9.5px 'JetBrains Mono',monospace", padding: '4px 0', borderRadius: '5px',
                        border: `1px solid rgba(${s.hue},${s.active ? '.6' : '.14'})`,
                        color: s.active ? `rgb(${s.hue})` : 'rgba(236,229,218,.4)',
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
