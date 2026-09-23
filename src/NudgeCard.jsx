import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { Button } from './Controls.jsx';
import { useDismissSwipe } from './dismissSwipe.js';

// The nudge — a floating, dismissible suggestion that appears only when a
// deterministic condition is true RIGHT NOW (an unfinished workout draft, a
// rejected outbox item…). One at a time, honest, never modal: it offers,
// the user decides, dismiss means gone for this app session.
//
// 22 SEP 2026 — HIS SCREENSHOT. Two faults, both visible in one frame of the
// Train screen:
//
//   THE ROW COLLAPSED. Everything lived on ONE flex line — icon, title,
//   detail, Reply, the primary button, the close. At 375px with a real title
//   ("Protein · 105 g to go") and a real detail ("45 of 150 g — two
//   protein-led meals closes it") that is wildly over-constrained: the text
//   wrapped into a three-word column and spilled past the card. It stacks
//   now — the words get the full width, the actions get their own line.
//
//   THE PAGE READ THROUGH IT. `--nv-void 88%` under an 18px blur is lovely
//   over a quiet surface and unreadable over a dense one; his frame has the
//   nudge sitting on top of the Push routine card with both sets of type
//   fighting. The ground is opaque enough to own its own pixels now, and the
//   blur is a depth cue rather than the thing doing the work.
//
// And it can be flicked away — see dismissSwipe.js for the gesture and why it
// reuses the direction-lock the back swipe cost four attempts to get right.
export function NudgeCard({ v }) {
  const swipe = useDismissSwipe({ onDismiss: v.dismiss });

  return (
    /* IT DOCKS AT THE BOTTOM NOW (review finding 18). Pinned under the top
       bar it covered the screen's own head — on the Inbox it hid "SELF ·
       INBOX" and half the serif headline, so the one thing that answers
       "where am I" was the thing it sat on (apple-design §16 Wayfinding). The
       bottom is where Nova's other floating layers already live, above the
       dock, and a suggestion belongs with them rather than over the title. */
    <div style={css("position:fixed;bottom:calc(150px + env(safe-area-inset-bottom));left:0;right:0;margin-inline:auto;z-index:66;width:min(480px, calc(100vw - 24px));animation:nvGlassIn var(--nv-dur-base) var(--nv-ease) both")}>
      <div
        ref={swipe.ref}
        {...swipe.handlers}
        /* pan-y so the page keeps vertical scrolling and this only ever
           claims the axis it locked — the same division the row swipes use */
        style={{
          touchAction: 'pan-y', willChange: 'transform, opacity', cursor: swipe.enabled ? 'grab' : 'default',
          padding: '13px 15px', borderRadius: '16px',
          border: '1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent)',
          // OPAQUE ENOUGH TO OWN ITS PIXELS. The blur stays as depth, but the
          // words no longer compete with whatever card is underneath.
          background: 'linear-gradient(180deg,color-mix(in srgb, var(--nv-gold) 07%, var(--nv-bg2)),var(--nv-void))',
          backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
          boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--nv-gold) 22%, transparent), 0 20px 48px -18px rgba(0,0,0,.85)',
        }}
      >
        {/* the words, with the whole width to themselves */}
        <div style={css('display:flex;align-items:flex-start;gap:11px')}>
          <span style={{ flex: 'none', fontSize: '16px', lineHeight: 1.3, color: 'var(--nv-gold)' }}>{v.icon}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', font: '600 13.5px var(--nv-font-ui)', color: 'var(--nv-ink)' }}>{v.title}</span>
            <span style={{ display: 'block', marginTop: '2px', font: '400 11.5px/1.45 var(--nv-font-ui)', color: 'var(--nv-ink60)' }}>{v.detail}</span>
          </span>
          {/* the close stays on the title line, where a close belongs, and
              stays for anything that is not a finger */}
          <Interactive as="span" onClick={v.dismiss} aria-label="Dismiss suggestion" haptic="tick"
            base={css("cursor:pointer;flex:none;font-size:15px;line-height:1;color:color-mix(in srgb, var(--nv-ink) 35%, transparent);padding:2px 2px 6px 8px")}
            hoverStyle={{ color: 'var(--nv-ink)' }}>×</Interactive>
        </div>

        {/* the actions, on their own line, wrapping rather than squeezing */}
        <div style={css('display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;margin-top:11px')}>
          {v.reply && (
            <Interactive as="span" onClick={v.reply} aria-label="Reply to this" haptic="tick"
              base={css('cursor:pointer;flex:none;display:inline-flex;align-items:center;min-height:32px;padding:6px 12px;border-radius:999px;font:600 12px var(--nv-font-ui);color:var(--nv-cy);background:color-mix(in srgb, var(--nv-cy) 12%, transparent)')}
              hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 20%, transparent)' }}>Reply</Interactive>
          )}
          <Button compact onClick={v.onPrimary} style={{ flex: 'none' }}>{v.primaryLabel}</Button>
        </div>
      </div>
    </div>
  );
}
