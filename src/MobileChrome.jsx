import { useRef, useEffect } from 'react';
import { css } from './css.js';
import { TabIcon } from './TabIcon.jsx';

const M = "var(--nv-font-mono)";
const R = "var(--nv-font-ui)";

export function MobileChrome({ v }) {
  const scrollRef = useRef(null);
  const activeLabel = (v.tabs.find((t) => t.active) || {}).label;
  // keep the current tab visible in the scrollable bar as you navigate
  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-active="1"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeLabel]);

  return (
    <>
      <div style={css("position:fixed;top:0;left:0;right:0;z-index:70;display:flex;align-items:center;gap:10px;padding:calc(6px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left));background:var(--nv-glass2);border-bottom:1px solid var(--nv-edge)")}>
        <span onClick={v.goHome} style={css(`cursor:pointer;font:700 17px ${R};letter-spacing:.16em;color:var(--nv-ink)`)}>
          NOVA<span style={css("background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi));-webkit-background-clip:text;background-clip:text;color:transparent")}>·OS</span>
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', font: `500 9px ${M}`, letterSpacing: '.12em', color: v.statusChip.color }}><span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.statusChip.color, animation: v.statusChip.label === 'LIVE' ? 'novaPulse 2s infinite var(--nv-anim)' : 'none' }}></span>{v.statusChip.label}</span>
        <span onClick={v.openPalette} style={css(`cursor:pointer;font:500 10px ${M};padding:7px 12px;border:1px solid var(--nv-acc-border);border-radius:8px;color:var(--nv-acc);background:var(--nv-acc-bg)`)}>✦ ASK</span>
        <span onClick={v.goSettings} aria-label="Settings" style={css(`cursor:pointer;font-size:14px;line-height:1;padding:7px 10px;border:1px solid ${v.isSettings ? 'var(--nv-acc-border)' : 'var(--nv-edge)'};border-radius:8px;color:${v.isSettings ? 'var(--nv-acc)' : 'var(--nv-ink60)'}`)}>⚙</span>
      </div>
      <div style={css("position:fixed;bottom:0;left:0;right:0;z-index:70;background:var(--nv-glass2);border-top:1px solid var(--nv-edge);padding-bottom:max(4px, calc(env(safe-area-inset-bottom) - 12px))")}>
        <div ref={scrollRef} className="nv-tabscroll" style={{ display: 'flex', gap: '2px', overflowX: 'auto', overscrollBehaviorX: 'contain', padding: '4px max(8px, env(safe-area-inset-left)) 4px max(8px, env(safe-area-inset-right))', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {v.tabs.map((t) => (
            <div key={t.label} data-active={t.active ? '1' : '0'} onClick={t.go} style={{ ...t.style, position: 'relative' }}>
              {/* Apple style trades the Roman numeral for a silhouette icon */}
              {v.appleStyle ? <TabIcon name={t.screen} size={21} /> : <span style={t.numStyle}>{t.num}</span>}
              <span style={css(`font:600 9.5px ${R};letter-spacing:.01em;white-space:nowrap`)}>{t.label}</span>
              {t.count != null && (
                <span style={css("position:absolute;top:0;right:2px;min-width:15px;height:15px;padding:0 4px;border-radius:8px;background:var(--nv-gold);color:#1a1206;font:700 9px var(--nv-font-mono);display:flex;align-items:center;justify-content:center")}>{t.count}</span>
              )}
            </div>
          ))}
        </div>
        {/* fade hint that the bar scrolls to more tabs */}
        <div style={css("pointer-events:none;position:absolute;top:0;bottom:0;right:0;width:26px;background:linear-gradient(90deg,transparent,var(--nv-glass2))")}></div>
      </div>
    </>
  );
}
