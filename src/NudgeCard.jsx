import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

// The nudge — a floating, dismissible suggestion that appears only when a
// deterministic condition is true RIGHT NOW (an unfinished workout draft, a
// rejected outbox item…). One at a time, honest, never modal: it offers,
// the user decides, dismiss means gone for this app session.
export function NudgeCard({ v }) {
  return (
    <div style={css("position:fixed;top:calc(54px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:66;width:min(480px, calc(100vw - 24px));animation:fadeUp .3s ease-out")}>
      <div className="nv-pane" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 15px', borderColor: 'color-mix(in srgb, var(--nv-gold) 35%, transparent)' }}>
        <span style={{ flex: 'none', fontSize: '16px', color: 'var(--nv-gold)' }}>{v.icon}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', font: '600 13.5px var(--nv-font-ui)', color: 'var(--nv-ink)' }}>{v.title}</span>
          <span style={{ display: 'block', marginTop: '1px', font: '400 11.5px var(--nv-font-ui)', color: 'var(--nv-ink60)' }}>{v.detail}</span>
        </span>
        <Interactive as="span" onClick={v.onPrimary}
          base={{ cursor: 'pointer', flex: 'none', font: '600 12px var(--nv-font-ui)', padding: '8px 15px', borderRadius: '999px', background: 'var(--nv-acc)', color: 'var(--nv-on-acc)' }}
          hoverStyle={{ filter: 'brightness(1.1)' }}>{v.primaryLabel}</Interactive>
        <Interactive as="span" onClick={v.dismiss} aria-label="Dismiss suggestion"
          base={css("cursor:pointer;flex:none;font-size:15px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent);padding:4px")}
          hoverStyle={{ color: 'var(--nv-ink)' }}>×</Interactive>
      </div>
    </div>
  );
}
