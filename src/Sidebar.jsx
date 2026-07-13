import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function Sidebar({ v }) {
  return (
    <aside style={css("width:236px;flex:none;display:flex;flex-direction:column;gap:20px;padding:24px 16px 18px;border-right:1px solid rgba(236,229,218,.07);background:linear-gradient(180deg,rgba(0,0,0,.22),rgba(0,0,0,0) 34%);overflow-y:auto")}>
      <div style={css("padding:0 10px")}>
        <div style={css("font:500 9px 'JetBrains Mono',monospace;letter-spacing:.3em;color:rgba(236,229,218,.4)")}>PERSONAL · OS</div>
        <div style={css("margin-top:5px;display:flex;align-items:baseline;gap:8px")}>
          <span style={css("font:400 27px 'Instrument Serif',serif")}>Nova</span>
          <span style={css("font:italic 400 20px 'Instrument Serif',serif;color:#d8b573")}>os</span>
        </div>
      </div>

      <div style={css("display:flex;flex-direction:column;gap:3px")}>
        <div style={css("font:500 9px 'JetBrains Mono',monospace;letter-spacing:.26em;color:rgba(236,229,218,.35);margin:0 10px 7px")}>WORKSPACE</div>
        {v.navMain.map((nav) => (
          <Interactive key={nav.label} onClick={nav.go} base={nav.style} hoverStyle="background:rgba(255,255,255,.05)">
            <span style={nav.numStyle}>{nav.numeral}</span><span>{nav.label}</span>
          </Interactive>
        ))}
      </div>

      <div style={css("display:flex;flex-direction:column;gap:3px")}>
        <div style={css("font:500 9px 'JetBrains Mono',monospace;letter-spacing:.26em;color:rgba(236,229,218,.35);margin:0 10px 7px")}>VAULT · OBSIDIAN</div>
        {v.navVault.map((nav) => (
          <Interactive key={nav.label} onClick={nav.go} base={nav.style} hoverStyle="background:rgba(255,255,255,.05)">
            <span style={nav.numStyle}>{nav.numeral}</span><span>{nav.label}</span>
            <span style={css("margin-left:auto;font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.35)")}>{nav.count}</span>
          </Interactive>
        ))}
      </div>

      <div style={css("display:flex;flex-direction:column;gap:1px")}>
        <div style={css("font:500 9px 'JetBrains Mono',monospace;letter-spacing:.26em;color:rgba(236,229,218,.35);margin:0 10px 8px")}>AGENTS</div>
        {v.agents.map((ag) => (
          <div key={ag.name} style={css("display:flex;align-items:center;gap:10px;padding:6px 10px;color:rgba(236,229,218,.75);font-size:13px")}>
            <span>{ag.name}</span>
            <span style={css("margin-left:auto;font:400 9px 'JetBrains Mono',monospace;letter-spacing:.08em;color:rgba(236,229,218,.3)")}>{ag.role}</span>
            <span style={ag.dotStyle}></span>
          </div>
        ))}
      </div>

      <Interactive
        onClick={v.goVoice}
        base="margin-top:auto;cursor:pointer;border:1px solid rgba(107,229,245,.22);border-radius:12px;padding:13px 14px;background:radial-gradient(140px 90px at 50% 0%, rgba(107,229,245,.1), rgba(107,229,245,.02));box-shadow:inset 0 1px 0 rgba(255,255,255,.05)"
        hoverStyle="border-color:rgba(107,229,245,.45)"
      >
        <div style={css("display:flex;align-items:center;gap:11px")}>
          <div style={css("position:relative;width:34px;height:34px;flex:none;display:flex;align-items:center;justify-content:center")}>
            <span style={css("position:absolute;inset:0;border-radius:50%;border:1px solid rgba(107,229,245,.45);border-top-color:#6be5f5;animation:ringSpin 6s linear infinite")}></span>
            <span style={css("width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 40% 35%, #ffe9c4, #d8b573 55%, #6b4f26 100%);box-shadow:0 0 14px rgba(216,181,115,.7)")}></span>
          </div>
          <div>
            <div style={css("font-size:12.5px;font-weight:500")}>{v.orbCardTitle}</div>
            <div style={css("font:400 9.5px 'JetBrains Mono',monospace;letter-spacing:.12em;color:rgba(107,229,245,.75);margin-top:2px")}>{v.orbCardSub}</div>
          </div>
        </div>
      </Interactive>
    </aside>
  );
}
