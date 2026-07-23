import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { NovaCore } from './NovaCore.jsx';
import { TabIcon } from './TabIcon.jsx';

// Command sidebar (design 45): NOVA·OS brand, grouped nav with glowing active
// item, the agents roster, and a status card that tells the connection truth
// (LIVE / OFFLINE / DEMO) beside a miniature of the Nova core.

const M = "var(--nv-font-mono)";
const R = "var(--nv-font-ui)";
const groupLabel = css(`font:500 8px ${M};letter-spacing:.26em;color:var(--nv-ink40);margin:0 10px 7px`);

export function Sidebar({ v }) {
  return (
    <aside style={css("width:238px;flex:none;display:flex;flex-direction:column;gap:18px;padding:24px 16px 18px;border-right:1px solid var(--nv-edge);background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0) 40%);overflow-y:auto")}>
      <div onClick={v.goHome} style={css(`cursor:pointer;padding:0 10px;font:700 21px ${R};letter-spacing:.16em;color:var(--nv-ink)`)}>
        NOVA<span style={css("background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi));-webkit-background-clip:text;background-clip:text;color:transparent")}>·OS</span>
      </div>

      <div>
        <div style={groupLabel}>WORKSPACE</div>
        <div style={css("display:flex;flex-direction:column;gap:2px")}>
          {v.navMain.map((nav) => (
            <Interactive key={nav.label} onClick={nav.go} base={nav.style} hoverStyle="background:rgba(255,255,255,.05)">
              {v.appleStyle ? <TabIcon name={nav.screen} size={16} /> : <span style={nav.numStyle}>{nav.numeral}</span>}<span>{nav.label}</span>
              {nav.count != null && (
                <span style={nav.countHot
                  ? css(`margin-left:auto;font:600 9px ${M};padding:1px 7px;border-radius:8px;color:var(--nv-acc);border:1px solid var(--nv-acc-border);background:var(--nv-acc-bg)`)
                  : css(`margin-left:auto;font:400 9px ${M};color:var(--nv-ink40)`)}>{nav.count}</span>
              )}
            </Interactive>
          ))}
        </div>
      </div>

      <div>
        <div style={groupLabel}>VAULT · OBSIDIAN</div>
        <div style={css("display:flex;flex-direction:column;gap:2px")}>
          {v.navVault.map((nav) => (
            <Interactive key={nav.label} onClick={nav.go} base={nav.style} hoverStyle="background:rgba(255,255,255,.05)">
              {v.appleStyle ? <TabIcon name={nav.screen} size={16} /> : <span style={nav.numStyle}>{nav.numeral}</span>}<span>{nav.label}</span>
              <span style={css(`margin-left:auto;font:400 9px ${M};color:var(--nv-ink40)`)}>{nav.count}</span>
            </Interactive>
          ))}
        </div>
      </div>

      <div>
        <div style={groupLabel}>SYSTEM</div>
        <div style={css("display:flex;flex-direction:column;gap:2px")}>
          {v.navSystem.map((nav) => (
            <Interactive key={nav.label} onClick={nav.go} base={nav.style} hoverStyle="background:rgba(255,255,255,.05)">
              {v.appleStyle ? <TabIcon name={nav.screen} size={16} /> : <span style={nav.numStyle}>{nav.numeral}</span>}<span>{nav.label}</span>
            </Interactive>
          ))}
        </div>
      </div>

      <div>
        <div style={groupLabel}>{v.agentsGroupLabel}</div>
        <div style={css("display:flex;flex-direction:column;padding:0 4px")}>
          {v.agents.map((ag) => (
            <div key={ag.name} style={{ display: 'flex', gap: '9px', alignItems: 'center', padding: '5.5px 6px', font: `600 13px ${R}`, color: ag.on ? 'var(--nv-ink)' : 'var(--nv-ink40)' }}>
              <span>{ag.name}</span>
              <span style={{ marginLeft: 'auto', font: `400 7.5px ${M}`, letterSpacing: '.1em', color: 'var(--nv-ink40)' }}>{ag.role}</span>
              <span style={ag.dotStyle}></span>
            </div>
          ))}
        </div>
      </div>

      <Interactive
        className="nv-pane"
        onClick={v.goSettings}
        aria-label="Connection status — open Settings"
        base={css("margin-top:auto;cursor:pointer;border-radius:12px;padding:12px 14px")}
        hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', font: `500 9px ${M}`, letterSpacing: '.12em', color: v.sideStatus.color }}>
          <NovaCore size={30} variant="mini" style={{ flex: 'none', marginRight: '2px' }} />
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', flex: 'none', background: v.sideStatus.color, boxShadow: `0 0 9px ${v.sideStatus.color}`, animation: v.sideStatus.pulse ? 'novaPulse 2.2s infinite var(--nv-anim)' : 'none' }}></span>
          <span>{v.sideStatus.row1}</span>
        </div>
        <div style={{ marginTop: '7px', font: `400 8.5px ${M}`, letterSpacing: '.08em', lineHeight: 1.5, color: 'var(--nv-ink40)' }}>{v.sideStatus.row2}</div>
      </Interactive>
    </aside>
  );
}
