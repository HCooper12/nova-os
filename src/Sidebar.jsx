import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { NovaCore } from './NovaCore.jsx';
import { TabIcon } from './TabIcon.jsx';
import { Eyebrow, TextAction, Tag, Meta } from './Controls.jsx';

// Command sidebar (design 45): NOVA·OS brand, grouped nav with glowing active
// item, the agents roster, and a status card that tells the connection truth
// (LIVE / OFFLINE / DEMO) beside a miniature of the Nova core.

const R = "var(--nv-font-ui)";
// group headings go through Eyebrow (the material pass, 6 Sep 2026)
const groupLabel = { margin: '0 10px 7px' };

export function Sidebar({ v }) {
  return (
    <aside style={css("width:238px;flex:none;display:flex;flex-direction:column;gap:18px;padding:24px 16px 18px;border-right:1px solid var(--nv-edge);background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0) 40%);overflow-y:auto")}>
      {/* The fold toggle is NOT here — it lives at one fixed point on the
          left edge (App renders it) in BOTH states, so reaching for it is
          muscle memory rather than a hunt. */}
      <div onClick={v.goHome} style={css(`cursor:pointer;padding:0 10px;font:700 21px ${R};letter-spacing:.16em;color:var(--nv-ink)`)}>
        NOVA<span style={css("background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi));-webkit-background-clip:text;background-clip:text;color:transparent")}>·OS</span>
      </div>

      <div>
        <Eyebrow style={groupLabel}>Workspace</Eyebrow>
        <div style={css("display:flex;flex-direction:column;gap:2px")}>
          {v.navMain.map((nav) => (
            <Interactive key={nav.label} onClick={nav.go} onPointerDown={nav.warm} base={nav.style} hoverStyle="background:rgba(255,255,255,.05)">
              {v.appleStyle ? <TabIcon name={nav.screen} size={16} /> : <span style={nav.numStyle}>{nav.numeral}</span>}<span>{nav.label}</span>
              {nav.count != null && (
                nav.countHot
                  ? <Tag tone="accent" style={{ marginLeft: 'auto' }}>{nav.count}</Tag>
                  : <Meta tone="faint" style={{ marginLeft: 'auto' }}>{nav.count}</Meta>
              )}
            </Interactive>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow style={groupLabel}>Vault · Obsidian</Eyebrow>
        <div style={css("display:flex;flex-direction:column;gap:2px")}>
          {v.navVault.map((nav) => (
            <Interactive key={nav.label} onClick={nav.go} onPointerDown={nav.warm} base={nav.style} hoverStyle="background:rgba(255,255,255,.05)">
              {v.appleStyle ? <TabIcon name={nav.screen} size={16} /> : <span style={nav.numStyle}>{nav.numeral}</span>}<span>{nav.label}</span>
              <Meta tone="faint" style={{ marginLeft: 'auto' }}>{nav.count}</Meta>
            </Interactive>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow style={groupLabel}>System</Eyebrow>
        <div style={css("display:flex;flex-direction:column;gap:2px")}>
          {v.navSystem.map((nav) => (
            <Interactive key={nav.label} onClick={nav.go} onPointerDown={nav.warm} base={nav.style} hoverStyle="background:rgba(255,255,255,.05)">
              {v.appleStyle ? <TabIcon name={nav.screen} size={16} /> : <span style={nav.numStyle}>{nav.numeral}</span>}<span>{nav.label}</span>
            </Interactive>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow style={groupLabel}>{v.agentsGroupLabel}</Eyebrow>
        <div style={css("display:flex;flex-direction:column;padding:0 4px")}>
          {v.agents.map((ag) => (
            <div key={ag.name} title={ag.hint} style={{ display: 'flex', gap: '9px', alignItems: 'center', padding: '5.5px 6px', font: `600 13px ${R}`, color: ag.on ? 'var(--nv-ink)' : 'var(--nv-ink40)' }}>
              <span>{ag.name}</span>
              <Meta tone="faint" style={{ marginLeft: 'auto', fontSize: '10.5px' }}>{ag.role}</Meta>
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
        <Meta as="div" tone={v.sideStatus.color} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600 }}>
          <NovaCore size={30} variant="mini" style={{ flex: 'none', marginRight: '2px' }} />
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', flex: 'none', background: v.sideStatus.color, boxShadow: `0 0 9px ${v.sideStatus.color}`, animation: v.sideStatus.pulse ? 'novaPulse 2.2s infinite var(--nv-anim)' : 'none' }}></span>
          <span>{v.sideStatus.row1}</span>
        </Meta>
        <Meta as="div" tone="faint" style={{ marginTop: '7px', lineHeight: 1.5, textTransform: 'none', letterSpacing: 0 }}>{v.sideStatus.row2}</Meta>
        {v.outboxCount > 0 && (
          <TextAction compact tone="gold" onClick={(e) => { e.stopPropagation(); v.openOutbox(); }} style={{ marginTop: '4px', marginLeft: '-8px' }}>⇪ Outbox · {v.outboxCount} waiting</TextAction>
        )}
      </Interactive>
    </aside>
  );
}
