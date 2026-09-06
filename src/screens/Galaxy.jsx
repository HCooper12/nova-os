import { css } from '../css.js';
import { Eyebrow, TextAction, Chip } from '../Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx
const cap = (s) => String(s || '').toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase());


export function Galaxy({ v }) {
  return (
    <div style={v.wrapGalaxy} data-screen-label="Memory Galaxy">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:var(--nv-micro-l);letter-spacing:var(--nv-micro-track);color:var(--nv-acc)")}>III.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>SELF · MEMORY GALAXY</span>
        </div>
        <span style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 50%, transparent);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:7px 12px")}>{v.galaxyStatsLabel}</span>
      </div>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:16px")}>
        <h1 style={css("margin:0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Everything you know, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>connected.</span></h1>
        {/* legend chips are filters: tap a type to fade the others, tap again to clear */}
        <div style={css("display:flex;flex-wrap:wrap;gap:8px 14px;font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
          {v.galaxyLegend.map((item) => (
            <span key={item.label} onClick={item.toggle} title={item.active ? 'tap to show only this type' : 'tap to bring back'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none', opacity: item.active ? 1 : .32, transition: 'opacity .18s' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: item.color }}></span>{item.label}
            </span>
          ))}
          {v.galaxyFilterOn && (
            <TextAction compact tone="cyan" onClick={v.galaxyClearFilter}>Clear filter</TextAction>
          )}
        </div>
      </div>
      {/* overlays — recency from the pages' own dates, the Compost's candidates */}
      <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:12px")}>
        {v.galaxyOverlays.map((o) => (
          <Chip key={o.key} tone={o.on ? 'cyan' : 'quiet'} active={o.on} disabled={o.disabled} onClick={o.disabled ? undefined : o.toggle}>{cap(o.label)}</Chip>
        ))}
      </div>
      <div style={v.galaxyBox}>
        <canvas ref={v.galaxyRef} onClick={v.galaxyClick}
          onPointerDown={v.galaxyPointerDown} onPointerMove={v.galaxyPointerMove} onPointerUp={v.galaxyPointerUp} onPointerCancel={v.galaxyPointerUp}
          style={css("position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;touch-action:none")}></canvas>
        {!v.galaxyZoomed && <Eyebrow style={{ position: 'absolute', top: '14px', left: '16px', pointerEvents: 'none' }}>Tap a star · pinch to zoom</Eyebrow>}
        {v.galaxyZoomed && (
          <Chip tone="cyan" active onClick={v.galaxyResetView} style={{ position: 'absolute', top: '10px', right: '14px' }}>Reset view</Chip>
        )}
        {v.galaxySelOn && (
          <div style={css("position:absolute;right:16px;bottom:16px;width:270px;max-width:calc(100% - 32px);border:1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent);border-radius:12px;padding:15px 17px;background:var(--nv-glass2);backdrop-filter:blur(14px);box-shadow:0 18px 40px -18px rgba(0,0,0,.9);animation:fadeUp .3s ease-out")}>
            <Eyebrow tone={v.galaxySelColor}>{v.galaxySelType}</Eyebrow>
            <div style={css("margin-top:7px;font:400 19px var(--nv-font-serif)")}>{v.galaxySelLabel}</div>
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
