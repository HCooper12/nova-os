import { css } from '../css.js';

export function Galaxy({ v }) {
  return (
    <div style={v.wrapGalaxy} data-screen-label="Memory Galaxy">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>III.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>SELF · MEMORY GALAXY</span>
        </div>
        <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:rgba(236,229,218,.5);border:1px solid rgba(236,229,218,.12);border-radius:8px;padding:7px 12px")}>{v.galaxyStatsLabel}</span>
      </div>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:16px")}>
        <h1 style={css("margin:0;font:400 38px/1.1 'Instrument Serif',serif")}>Everything you know, <span style={css("font-style:italic;color:#d8b573")}>connected.</span></h1>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px 14px;font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.55)")}>
          {v.galaxyLegend.map((item) => (
            <span key={item.label} style={css("display:flex;align-items:center;gap:6px")}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: item.color }}></span>{item.label}</span>
          ))}
        </div>
      </div>
      <div style={v.galaxyBox}>
        <canvas ref={v.galaxyRef} onClick={v.galaxyClick} style={css("position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair")}></canvas>
        <div style={css("position:absolute;top:14px;left:16px;font:400 9.5px 'JetBrains Mono',monospace;letter-spacing:.18em;color:rgba(236,229,218,.45);pointer-events:none")}>CLICK A STAR · BRIGHTER = RECENTLY TOUCHED</div>
        {v.galaxySelOn && (
          <div style={css("position:absolute;right:16px;bottom:16px;width:270px;border:1px solid rgba(216,181,115,.3);border-radius:12px;padding:15px 17px;background:rgba(18,13,24,.92);box-shadow:0 18px 40px -18px rgba(0,0,0,.9);animation:fadeUp .3s ease-out")}>
            <div style={css(`font:500 9px 'JetBrains Mono',monospace;letter-spacing:.22em;color:${v.galaxySelColor}`)}>{v.galaxySelType}</div>
            <div style={css("margin-top:7px;font:400 19px 'Instrument Serif',serif")}>{v.galaxySelLabel}</div>
            <div style={css("margin-top:5px;font-size:12px;color:rgba(236,229,218,.55);line-height:1.5")}>{v.galaxySelDesc}</div>
            <div style={css("margin-top:12px;display:flex;gap:8px")}>
              <span onClick={v.galaxyOpen} style={css("cursor:pointer;font-size:11.5px;font-weight:500;padding:6px 12px;border-radius:7px;background:#d8b573;color:#1a1322")}>Open</span>
              <span onClick={v.galaxyClear} style={css("cursor:pointer;font-size:11.5px;padding:6px 12px;border-radius:7px;border:1px solid rgba(236,229,218,.15);color:rgba(236,229,218,.65)")}>Dismiss</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
