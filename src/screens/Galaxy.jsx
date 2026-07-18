import { css } from '../css.js';

export function Galaxy({ v }) {
  return (
    <div style={v.wrapGalaxy} data-screen-label="Memory Galaxy">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.14em;color:var(--nv-acc)")}>III.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>SELF · MEMORY GALAXY</span>
        </div>
        <span style={css("font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 50%, transparent);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:7px 12px")}>{v.galaxyStatsLabel}</span>
      </div>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:16px")}>
        <h1 style={css("margin:0;font:700 30px/1.1 'Rajdhani',sans-serif;letter-spacing:.02em")}>Everything you know, <span style={css("font:italic 400 27px 'Instrument Serif',serif;color:var(--nv-gold)")}>connected.</span></h1>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px 14px;font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
          {v.galaxyLegend.map((item) => (
            <span key={item.label} style={css("display:flex;align-items:center;gap:6px")}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: item.color }}></span>{item.label}</span>
          ))}
        </div>
      </div>
      <div style={v.galaxyBox}>
        <canvas ref={v.galaxyRef} onClick={v.galaxyClick} style={css("position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair")}></canvas>
        <div style={css("position:absolute;top:14px;left:16px;font:400 9.5px 'IBM Plex Mono',monospace;letter-spacing:.18em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent);pointer-events:none")}>CLICK A STAR · BRIGHTER = RECENTLY TOUCHED</div>
        {v.galaxySelOn && (
          <div style={css("position:absolute;right:16px;bottom:16px;width:270px;border:1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent);border-radius:12px;padding:15px 17px;background:var(--nv-glass2);backdrop-filter:blur(14px);box-shadow:0 18px 40px -18px rgba(0,0,0,.9);animation:fadeUp .3s ease-out")}>
            <div style={css(`font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:${v.galaxySelColor}`)}>{v.galaxySelType}</div>
            <div style={css("margin-top:7px;font:400 19px 'Instrument Serif',serif")}>{v.galaxySelLabel}</div>
            <div style={css("margin-top:5px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);line-height:1.5")}>{v.galaxySelDesc}</div>
            <div style={css("margin-top:12px;display:flex;gap:8px")}>
              <span onClick={v.galaxyOpen} style={css("cursor:pointer;font-size:11.5px;font-weight:500;padding:6px 12px;border-radius:7px;background:var(--nv-gold);color:#1a1322")}>Open</span>
              <span onClick={v.galaxyClear} style={css("cursor:pointer;font-size:11.5px;padding:6px 12px;border-radius:7px;border:1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent);color:color-mix(in srgb, var(--nv-ink) 65%, transparent)")}>Dismiss</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
