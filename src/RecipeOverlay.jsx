import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function RecipeOverlay({ v }) {
  return (
    <div onClick={v.closeRecipe} style={v.recipeOvWrap}>
      <div onClick={v.stopClick} style={css("width:860px;max-width:94vw;max-height:88vh;overflow-y:auto;border:1px solid rgba(216,181,115,.28);border-radius:18px;background:linear-gradient(180deg,#221a2c,#16101e);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.07);animation:fadeUp .3s ease-out")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center;padding:18px 26px;border-bottom:1px solid rgba(236,229,218,.07)")}>
          <span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.24em;color:#d8b573")}>RECIPE · FROM OBSIDIAN</span>
          <Interactive as="span" onClick={v.closeRecipe} base="cursor:pointer;font:500 11px 'JetBrains Mono',monospace;color:rgba(236,229,218,.5);border:1px solid rgba(236,229,218,.14);border-radius:7px;padding:5px 10px" hoverStyle="color:#ece5da">ESC</Interactive>
        </div>
        <div style={v.gridRecipeOv}>
          <div>
            <div style={v.orPhStyle}><span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.55)")}>{v.orPhLabel}</span></div>
            <div style={css("margin-top:14px;border:1px solid rgba(236,229,218,.09);border-radius:12px;padding:15px 17px;background:rgba(0,0,0,.22)")}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}><span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.2em;color:rgba(236,229,218,.45)")}>MACROS</span><span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.45)")}>× {v.servings}</span></div>
              <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:9px;font:400 12px 'JetBrains Mono',monospace")}>
                <div style={css("display:flex;justify-content:space-between")}><span style={css("color:#6be5f5")}>PROTEIN</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orP}g</span></div>
                <div style={css("display:flex;justify-content:space-between")}><span style={css("color:#d8b573")}>CARBS</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orC}g</span></div>
                <div style={css("display:flex;justify-content:space-between")}><span style={css("color:#8a6ad1")}>FAT</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orF}g</span></div>
                <div style={css("display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid rgba(236,229,218,.08)")}><span style={css("color:rgba(236,229,218,.6)")}>ENERGY</span><span style={css("font-variant-numeric:tabular-nums")}>{v.orKcal} kcal</span></div>
              </div>
            </div>
            <div style={css("margin-top:14px;display:flex;align-items:center;gap:12px")}>
              <span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.18em;color:rgba(236,229,218,.45)")}>SERVINGS</span>
              <Interactive as="span" onClick={v.decServ} base="cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(236,229,218,.16);border-radius:8px;color:#ece5da" hoverStyle="border-color:rgba(216,181,115,.5)">−</Interactive>
              <span style={css("font:500 16px 'JetBrains Mono',monospace;font-variant-numeric:tabular-nums")}>{v.servings}</span>
              <Interactive as="span" onClick={v.incServ} base="cursor:pointer;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(236,229,218,.16);border-radius:8px;color:#ece5da" hoverStyle="border-color:rgba(216,181,115,.5)">+</Interactive>
            </div>
          </div>
          <div>
            <h2 style={css("margin:0;font:400 34px/1.1 'Instrument Serif',serif")}>{v.orName}</h2>
            <div style={css("margin-top:7px;font:400 10.5px 'JetBrains Mono',monospace;color:rgba(236,229,218,.45)")}>{v.orMeta}</div>
            <div style={css("margin-top:18px;font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.45)")}>INGREDIENTS</div>
            <div style={css("margin-top:10px;display:flex;flex-direction:column")}>
              {v.orIngredients.map((ing, i) => (
                <div key={i} style={css("display:flex;gap:12px;padding:7px 0;border-bottom:1px solid rgba(236,229,218,.05);font-size:13.5px")}><span style={css("font:400 11.5px 'JetBrains Mono',monospace;color:#d8b573;width:74px;font-variant-numeric:tabular-nums")}>{ing.qty}</span><span style={css("color:rgba(236,229,218,.85)")}>{ing.name}</span></div>
              ))}
            </div>
            <div style={css("margin-top:18px;font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.45)")}>METHOD</div>
            <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:9px")}>
              {v.orSteps.map((st, i) => (
                <div key={i} style={css("display:flex;gap:12px;font-size:13.5px;line-height:1.6;color:rgba(236,229,218,.8)")}><span style={css("font:italic 400 14px 'Instrument Serif',serif;color:rgba(216,181,115,.7)")}>{st.n}</span><span>{st.text}</span></div>
              ))}
            </div>
            <div style={css("margin-top:20px;border:1px solid rgba(107,229,245,.2);border-radius:12px;padding:14px 16px;background:rgba(107,229,245,.04)")}>
              <div style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.2em;color:#6be5f5")}>ASK NOVA</div>
              {v.recipeMsgs.map((m, i) => (
                <div key={i} style={css("margin-top:10px;font-size:13px;line-height:1.6;color:rgba(236,229,218,.85);animation:fadeUp .3s ease-out")}><span style={m.tagStyle}>{m.tag}</span> {m.text}{m.typing && <span style={css("color:#6be5f5")}>▍</span>}</div>
              ))}
              <div style={css("display:flex;gap:8px;margin-top:12px")}>
                <Interactive
                  as="input"
                  value={v.recipeInput}
                  onChange={v.setRecipeInput}
                  onKeyDown={v.recipeKey}
                  placeholder='Try "suggest a swap" or "scale for cutting"…'
                  base="flex:1;background:rgba(0,0,0,.3);border:1px solid rgba(236,229,218,.12);border-radius:8px;padding:9px 13px;color:#ece5da;font-size:12.5px;font-family:'Instrument Sans',sans-serif;outline:none"
                  focusStyle="border-color:rgba(107,229,245,.5)"
                />
                <Interactive as="span" onClick={v.sendRecipe} base="cursor:pointer;display:flex;align-items:center;font:500 10.5px 'JetBrains Mono',monospace;padding:0 14px;border-radius:8px;background:#6be5f5;color:#0a2830" hoverStyle="background:#9deefa">ASK</Interactive>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
