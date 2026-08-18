import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

const M = "var(--nv-font-mono)";
const R = "var(--nv-font-ui)";

// The long-press menu — spec #13's other half. One host at the App root,
// driven by st.ctxMenu: { x, y, title?, items: [{label, hint?, danger?,
// disabled?, onSelect}] }. Phone: a bottom sheet (thumb reach); Mac: a
// popover at the pointer, clamped to the viewport. Backdrop dismisses.
// Items run AFTER the menu closes so a selection can open another surface.
export function ContextMenuHost({ menu, isMobile, close }) {
  if (!menu) return null;
  const pick = (item) => { if (item.disabled) return; close(); item.onSelect?.(); };
  const itemRow = (item, i) => (
    <Interactive key={i} as="div" onClick={() => pick(item)}
      base={{
        cursor: item.disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '18px',
        padding: isMobile ? '15px 20px' : '10px 16px',
        font: `500 ${isMobile ? 15 : 13}px ${R}`,
        color: item.disabled ? 'color-mix(in srgb, var(--nv-ink) 30%, transparent)' : item.danger ? 'var(--nv-mag,#e0607e)' : 'var(--nv-ink)',
        borderTop: i === 0 ? 'none' : '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)',
      }}
      hoverStyle={item.disabled ? {} : { background: 'rgba(255,255,255,.05)' }}
    >
      <span>{item.label}</span>
      {item.hint && <span style={css(`font:400 10.5px ${M};color:color-mix(in srgb, var(--nv-ink) 42%, transparent);white-space:nowrap`)}>{item.hint}</span>}
    </Interactive>
  );

  if (isMobile) {
    return (
      <div style={css("position:fixed;inset:0;z-index:120")} onClick={close}>
        <div style={css("position:absolute;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(3px);animation:fadeIn .18s ease-out")} />
        <div onClick={(e) => e.stopPropagation()}
          style={css("position:absolute;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));border-radius:18px;overflow:hidden;background:color-mix(in srgb, var(--nv-bg2) 92%, black);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);box-shadow:0 18px 60px rgba(0,0,0,.55);animation:sheetUp .22s cubic-bezier(.32,.72,0,1)")}>
          {menu.title && <div style={css(`padding:13px 20px 9px;font:500 9.5px ${M};letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent);border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)`)}>{menu.title}</div>}
          {menu.items.map(itemRow)}
        </div>
      </div>
    );
  }

  // desktop popover — clamp so it never renders off-screen
  const W = 250;
  const x = Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1400) - W - 12);
  const estH = menu.items.length * 38 + (menu.title ? 32 : 0);
  const y = Math.min(menu.y, (typeof window !== 'undefined' ? window.innerHeight : 900) - estH - 12);
  return (
    <div style={css("position:fixed;inset:0;z-index:120")} onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: x, top: y, width: W, borderRadius: '13px', overflow: 'hidden', background: 'color-mix(in srgb, var(--nv-bg2) 94%, black)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', boxShadow: '0 14px 44px rgba(0,0,0,.5)', animation: 'fadeUp .16s ease-out' }}>
        {menu.title && <div style={css(`padding:10px 16px 7px;font:500 9px ${M};letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent);border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)`)}>{menu.title}</div>}
        {menu.items.map(itemRow)}
      </div>
    </div>
  );
}
