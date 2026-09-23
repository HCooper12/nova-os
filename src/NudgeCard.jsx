import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { Button } from './Controls.jsx';

// The nudge — a floating, dismissible suggestion that appears only when a
// deterministic condition is true RIGHT NOW (an unfinished workout draft, a
// rejected outbox item…). One at a time, honest, never modal: it offers,
// the user decides, dismiss means gone for this app session.
export function NudgeCard({ v }) {
  return (
    /* IT DOCKS AT THE BOTTOM NOW (review finding 18). Pinned under the top
       bar it covered the screen's own head — on the Inbox it hid "SELF ·
       INBOX" and half the serif headline, so the one thing that answers
       "where am I" was the thing it sat on (apple-design §16 Wayfinding). The
       bottom is where Nova's other floating layers already live, above the
       dock, and a suggestion belongs with them rather than over the title. */
    <div style={css("position:fixed;bottom:calc(150px + env(safe-area-inset-bottom));left:0;right:0;margin-inline:auto;z-index:66;width:min(480px, calc(100vw - 24px));animation:nvGlassIn var(--nv-dur-base) var(--nv-ease) both")}>
      {/* GLASS, because it now floats over content rather than under the
          bar. `nv-pane` is a translucent surface meant to sit ON a screen; at
          the bottom it let the page read straight through the nudge's own
          words. Same material as the voice layers: a blur, a wash, a lit top
          edge and a shadow instead of a hard border. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 15px', borderRadius: '16px',
        border: '1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent)',
        background: 'linear-gradient(180deg,color-mix(in srgb, var(--nv-gold) 08%, transparent),color-mix(in srgb, var(--nv-void) 88%, transparent))',
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--nv-gold) 22%, transparent), 0 20px 48px -18px rgba(0,0,0,.8)' }}>
        <span style={{ flex: 'none', fontSize: '16px', color: 'var(--nv-gold)' }}>{v.icon}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', font: '600 13.5px var(--nv-font-ui)', color: 'var(--nv-ink)' }}>{v.title}</span>
          <span style={{ display: 'block', marginTop: '1px', font: '400 11.5px var(--nv-font-ui)', color: 'var(--nv-ink60)' }}>{v.detail}</span>
        </span>
        {v.reply && (
          <Interactive as="span" onClick={v.reply} aria-label="Reply to this"
            base={css('cursor:pointer;flex:none;display:inline-flex;align-items:center;min-height:32px;padding:6px 10px;border-radius:999px;font:600 12px var(--nv-font-ui);color:var(--nv-cy);background:color-mix(in srgb, var(--nv-cy) 12%, transparent)')}
            hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 20%, transparent)' }}>Reply</Interactive>
        )}
        <Button compact onClick={v.onPrimary} style={{ flex: 'none' }}>{v.primaryLabel}</Button>
        <Interactive as="span" onClick={v.dismiss} aria-label="Dismiss suggestion"
          base={css("cursor:pointer;flex:none;font-size:15px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent);padding:4px")}
          hoverStyle={{ color: 'var(--nv-ink)' }}>×</Interactive>
      </div>
    </div>
  );
}
