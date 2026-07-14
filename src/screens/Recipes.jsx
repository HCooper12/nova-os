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
      <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:18px")}>
        {v.recipeFilters.map((f) => (
          <Interactive key={f.label} as="span" onClick={f.go} base={f.style} hoverStyle="border-color:rgba(216,181,115,.5)">{f.label}</Interactive>
        ))}
      </div>
      <div style={v.gridRecipes}>
        {v.recipeList.map((r) => (
          <Interactive
            key={r.name}
            onClick={r.open}
            base="cursor:pointer;border:1px solid rgba(236,229,218,.09);border-radius:14px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9)"
            hoverStyle="border-color:rgba(216,181,115,.4);transform:translateY(-2px)"
          >
            <div style={r.phStyle}><span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.55)")}>{r.phLabel}</span></div>
            <div style={css("padding:14px 17px")}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
                <div style={css("font-size:15.5px;font-weight:500")}>{r.name}</div>
                <span style={css("font:400 9.5px 'JetBrains Mono',monospace;color:#d8b573")}>{r.tag}</span>
              </div>
              <div style={css("margin-top:7px;display:flex;gap:12px;font:400 11px 'JetBrains Mono',monospace;color:rgba(236,229,218,.55)")}>
                <span style={css("color:#6be5f5")}>{r.p}P</span><span>{r.c}C</span><span>{r.f}F</span><span style={css("margin-left:auto")}>{r.kcal} kcal{r.time ? ` · ${r.time}` : ''}</span>
              </div>
              <div style={css("margin-top:10px;display:flex;gap:3px;height:4px")}>
                <span style={r.pBar}></span><span style={r.cBar}></span><span style={r.fBar}></span>
              </div>
            </div>
          </Interactive>
        ))}
      </div>
    </div>
  );
}
