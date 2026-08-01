import { useState } from 'react';
import { css } from './css.js';
import { TabIcon } from './TabIcon.jsx';

const M = "var(--nv-font-mono)";
const R = "var(--nv-font-ui)";

// Mobile chrome, dock edition: the old 14-tab horizontal scroller made every
// trip a hunt. Now a floating pill dock — the user's top THREE tabs (first
// three in the Settings tab order), a raised ✦ Capture at true center, and
// More opening a grid sheet of every screen. Positions never move, so muscle
// memory forms; capture — the most important act in a second brain — owns
// the throne. Token-drawn, so all three design styles wear it natively.

function DockTab({ t, size = 22 }) {
  return (
    <div onClick={t.go} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: '52px', padding: '6px 8px', cursor: 'pointer', borderRadius: '14px', color: t.active ? 'var(--nv-acc)' : 'var(--nv-ink40)', background: t.active ? 'var(--nv-acc-bg)' : 'none' }}>
      <TabIcon name={t.screen} size={size} />
      <span style={css(`font:600 9px ${R};letter-spacing:.01em;white-space:nowrap`)}>{t.label}</span>
      {t.count != null && (
        <span style={css("position:absolute;top:1px;right:3px;min-width:15px;height:15px;padding:0 4px;border-radius:8px;background:var(--nv-gold);color:#1a1206;font:700 9px var(--nv-font-mono);display:flex;align-items:center;justify-content:center")}>{t.count}</span>
      )}
    </div>
  );
}

export function MobileChrome({ v }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const dockTabs = v.tabs.slice(0, 3);
  const activeInDock = dockTabs.some((t) => t.active);

  return (
    <>
      <div style={css("position:fixed;top:0;left:0;right:0;z-index:70;display:flex;align-items:center;gap:10px;padding:calc(6px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left));background:var(--nv-glass2);border-bottom:1px solid var(--nv-edge)")}>
        <span onClick={v.goHome} style={css(`cursor:pointer;font:700 17px ${R};letter-spacing:.16em;color:var(--nv-ink)`)}>
          NOVA<span style={css("background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi));-webkit-background-clip:text;background-clip:text;color:transparent")}>·OS</span>
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', font: `500 9px ${M}`, letterSpacing: '.12em', color: v.statusChip.color }}><span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.statusChip.color, animation: v.statusChip.label === 'LIVE' ? 'novaPulse 2s infinite var(--nv-anim)' : 'none' }}></span>{v.statusChip.label}</span>
        {v.outboxCount > 0 && (
          <span onClick={v.openOutbox} style={css(`cursor:pointer;font:600 9px ${M};letter-spacing:.08em;padding:6px 10px;border:1px solid color-mix(in srgb, var(--nv-gold) 45%, transparent);border-radius:8px;color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 08%, transparent)`)}>⇪ {v.outboxCount}</span>
        )}
        <span onClick={v.openPalette} style={css(`cursor:pointer;font:500 10px ${M};padding:7px 12px;border:1px solid var(--nv-acc-border);border-radius:8px;color:var(--nv-acc);background:var(--nv-acc-bg)`)}>✦ ASK</span>
        <span onClick={v.goSettings} aria-label="Settings" style={css(`cursor:pointer;font-size:14px;line-height:1;padding:7px 10px;border:1px solid ${v.isSettings ? 'var(--nv-acc-border)' : 'var(--nv-edge)'};border-radius:8px;color:${v.isSettings ? 'var(--nv-acc)' : 'var(--nv-ink60)'}`)}>⚙</span>
      </div>

      {/* the More sheet — every screen, grid of silhouettes, one tap */}
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={css("position:fixed;inset:0;z-index:74;background:rgba(8,5,12,.6);backdrop-filter:blur(4px)")}>
          <div onClick={(e) => e.stopPropagation()} style={css("position:absolute;left:0;right:0;bottom:0;border-radius:22px 22px 0 0;border:1px solid var(--nv-edge);border-bottom:none;background:var(--nv-glass2);backdrop-filter:blur(26px);padding:18px 16px calc(20px + env(safe-area-inset-bottom));animation:fadeUp .22s ease-out")}>
            <div style={css("width:36px;height:4px;border-radius:2px;background:color-mix(in srgb, var(--nv-ink) 22%, transparent);margin:0 auto 14px")}></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px 2px' }}>
              {v.tabs.map((t) => (
                <div key={t.screen} onClick={() => { setMoreOpen(false); t.go(); }} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '11px 4px', cursor: 'pointer', borderRadius: '14px', color: t.active ? 'var(--nv-acc)' : 'var(--nv-ink60)', background: t.active ? 'var(--nv-acc-bg)' : 'none' }}>
                  <TabIcon name={t.screen} size={24} />
                  <span style={css(`font:550 10.5px ${R};white-space:nowrap`)}>{t.label}</span>
                  {t.count != null && (
                    <span style={css("position:absolute;top:6px;right:calc(50% - 26px);min-width:15px;height:15px;padding:0 4px;border-radius:8px;background:var(--nv-gold);color:#1a1206;font:700 9px var(--nv-font-mono);display:flex;align-items:center;justify-content:center")}>{t.count}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* the floating dock — [t1 t2 ✦ t3 More]. The raised centre button opens
          VOICE: talking is the fastest way in, and the command palette is
          still a tap away on the top bar (✦ ASK) and ⌘K on desktop. */}
      <div style={css("position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom));z-index:72;display:flex;align-items:center;gap:2px;padding:7px 10px;border-radius:999px;border:1px solid var(--nv-edge);background:var(--nv-glass2);backdrop-filter:blur(26px);box-shadow:0 14px 44px -14px rgba(0,0,0,.65)")}>
        {dockTabs.slice(0, 2).map((t) => <DockTab key={t.screen} t={t} />)}
        <div onClick={v.goVoice} aria-label="Talk to Nova"
          style={{ width: '52px', height: '52px', margin: '0 6px', marginTop: '-22px', flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            fontSize: '21px', color: 'var(--nv-on-acc)', background: 'var(--nv-acc)',
            border: '3px solid color-mix(in srgb, var(--nv-void) 80%, transparent)',
            boxShadow: '0 10px 26px -8px var(--nv-acc)' }}>✦</div>
        {dockTabs[2] && <DockTab t={dockTabs[2]} />}
        <div onClick={() => setMoreOpen(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: '52px', padding: '6px 8px', cursor: 'pointer', borderRadius: '14px', color: moreOpen || !activeInDock ? 'var(--nv-acc)' : 'var(--nv-ink40)' }}>
          <TabIcon name="more" size={22} />
          <span style={css(`font:600 9px ${R};white-space:nowrap`)}>More</span>
        </div>
      </div>
    </>
  );
}
