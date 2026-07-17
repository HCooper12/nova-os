import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function CommandPalette({ v }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Command palette" onClick={v.closePalette} style={css("position:fixed;inset:0;background:rgba(8,5,12,.6);backdrop-filter:blur(5px);z-index:80;display:flex;justify-content:center;padding-top:14vh")}>
      <div onClick={v.stopClick} style={css("width:560px;max-width:92vw;height:fit-content;border:1px solid rgba(216,181,115,.3);border-radius:14px;background:linear-gradient(180deg,#241b2f,#171021);box-shadow:0 40px 90px -20px rgba(0,0,0,.95),0 0 60px -20px rgba(216,181,115,.25),inset 0 1px 0 rgba(255,255,255,.08);overflow:hidden;animation:fadeUp .25s ease-out")}>
        <div style={css("display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(236,229,218,.08)")}>
          <span style={css("width:8px;height:8px;border-radius:50%;background:radial-gradient(circle at 40% 35%, #ffe9c4, #d8b573 60%, #6b4f26);box-shadow:0 0 10px rgba(216,181,115,.8)")}></span>
          <input
            ref={v.paletteRef}
            value={v.paletteQuery}
            onChange={v.setPaletteQuery}
            onKeyDown={v.paletteKeyDown}
            placeholder="Summon Nova — search, command, or ask anything…"
            style={css("flex:1;background:none;border:none;outline:none;color:#ece5da;font-size:15px;font-family:'Instrument Sans',sans-serif")}
          />
          <span style={css("font:500 9.5px 'JetBrains Mono',monospace;color:rgba(236,229,218,.4);border:1px solid rgba(236,229,218,.14);border-radius:5px;padding:3px 7px")}>ESC</span>
        </div>
        <div style={css("max-height:340px;overflow-y:auto;padding:8px")}>
          {v.paletteResults.map((c, i) => (
            <Interactive
              key={i}
              onClick={c.run}
              base="cursor:pointer;display:flex;align-items:center;gap:13px;padding:11px 13px;border-radius:9px"
              hoverStyle="background:rgba(216,181,115,.1)"
            >
              <span style={css(`font:400 12px 'JetBrains Mono',monospace;color:${c.iconColor};width:16px;text-align:center`)}>{c.icon}</span>
              <span style={css("font-size:13.5px;color:rgba(236,229,218,.9)")}>{c.label}</span>
              <span style={css("margin-left:auto;font:400 9.5px 'JetBrains Mono',monospace;letter-spacing:.1em;color:rgba(236,229,218,.35)")}>{c.hint}</span>
            </Interactive>
          ))}
        </div>
        <div style={css("display:flex;gap:16px;padding:11px 20px;border-top:1px solid rgba(236,229,218,.08);font:400 9.5px 'JetBrains Mono',monospace;color:rgba(236,229,218,.35)")}>
          <span>↵ RUN</span><span>ESC CLOSE</span><span style={css("margin-left:auto;color:rgba(216,181,115,.55)")}>NOVA ROUTES TO THE RIGHT AGENT</span>
        </div>
      </div>
    </div>
  );
}
