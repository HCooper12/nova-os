import { css } from './css.js';

export function MobileChrome({ v }) {
  return (
    <>
      <div style={css("position:fixed;top:0;left:0;right:0;z-index:70;display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(18,13,24,.92);backdrop-filter:blur(12px);border-bottom:1px solid rgba(236,229,218,.08)")}>
        <span style={css("font:400 20px 'Instrument Serif',serif")}>Nova</span><span style={css("font:italic 400 15px 'Instrument Serif',serif;color:#d8b573")}>os</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', font: "500 9px 'JetBrains Mono',monospace", letterSpacing: '.12em', color: v.statusChip.color }}><span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.statusChip.color, animation: v.statusChip.label === 'LIVE' ? 'novaPulse 2s infinite' : 'none' }}></span>{v.statusChip.label}</span>
        <span onClick={v.openPalette} style={css("cursor:pointer;font:500 10px 'JetBrains Mono',monospace;padding:7px 12px;border:1px solid rgba(216,181,115,.35);border-radius:8px;color:#d8b573;background:rgba(216,181,115,.06)")}>✦ ASK</span>
        <span onClick={v.goSettings} style={css(`cursor:pointer;font-size:14px;line-height:1;padding:7px 10px;border:1px solid ${v.isSettings ? 'rgba(216,181,115,.4)' : 'rgba(236,229,218,.14)'};border-radius:8px;color:${v.isSettings ? '#d8b573' : 'rgba(236,229,218,.65)'}`)}>⚙</span>
      </div>
      <div style={css("position:fixed;bottom:0;left:0;right:0;z-index:70;display:flex;padding:6px 8px calc(8px + env(safe-area-inset-bottom));background:rgba(18,13,24,.94);backdrop-filter:blur(12px);border-top:1px solid rgba(236,229,218,.08)")}>
        {v.tabs.map((t) => (
          <div key={t.label} onClick={t.go} style={t.style}>
            <span style={t.numStyle}>{t.num}</span>
            <span style={css("font:500 8.5px 'JetBrains Mono',monospace;letter-spacing:.04em")}>{t.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
