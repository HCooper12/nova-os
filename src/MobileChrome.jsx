import { css } from './css.js';

const M = "'IBM Plex Mono',monospace";
const R = "'Rajdhani',sans-serif";

export function MobileChrome({ v }) {
  return (
    <>
      <div style={css("position:fixed;top:0;left:0;right:0;z-index:70;display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--nv-glass2);backdrop-filter:blur(14px);border-bottom:1px solid var(--nv-edge)")}>
        <span style={css(`font:700 17px ${R};letter-spacing:.16em;color:var(--nv-ink)`)}>
          NOVA<span style={css("background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi));-webkit-background-clip:text;background-clip:text;color:transparent")}>·OS</span>
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', font: `500 9px ${M}`, letterSpacing: '.12em', color: v.statusChip.color }}><span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.statusChip.color, animation: v.statusChip.label === 'LIVE' ? 'novaPulse 2s infinite var(--nv-anim)' : 'none' }}></span>{v.statusChip.label}</span>
        <span onClick={v.openPalette} style={css(`cursor:pointer;font:500 10px ${M};padding:7px 12px;border:1px solid var(--nv-acc-border);border-radius:8px;color:var(--nv-acc);background:var(--nv-acc-bg)`)}>✦ ASK</span>
        <span onClick={v.goSettings} style={css(`cursor:pointer;font-size:14px;line-height:1;padding:7px 10px;border:1px solid ${v.isSettings ? 'var(--nv-acc-border)' : 'var(--nv-edge)'};border-radius:8px;color:${v.isSettings ? 'var(--nv-acc)' : 'var(--nv-ink60)'}`)}>⚙</span>
      </div>
      <div style={css("position:fixed;bottom:0;left:0;right:0;z-index:70;display:flex;padding:6px 8px calc(8px + env(safe-area-inset-bottom));background:var(--nv-glass2);backdrop-filter:blur(14px);border-top:1px solid var(--nv-edge)")}>
        {v.tabs.map((t) => (
          <div key={t.label} onClick={t.go} style={t.style}>
            <span style={t.numStyle}>{t.num}</span>
            <span style={css(`font:600 8.5px ${R};letter-spacing:.06em`)}>{t.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
