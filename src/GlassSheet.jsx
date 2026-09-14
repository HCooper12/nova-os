import { useEffect, useLayoutEffect, useRef } from 'react';
import { css } from './css.js';
import { TextAction } from './Controls.jsx';
import { StageCard } from './StageCard.jsx';
import { useSheetDrag } from './useSheetDrag.js';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// TAP TO ENLARGE — his ask from the car (14 Sep 2026): a panel on the glass
// should grow into something readable under a thumb, "Apple-like transitions
// too." The card MORPHS from the exact rect he tapped into this sheet with
// FLIP — the same shared-element technique the Library shelf already uses
// (screens/Library.jsx's useShelfFlip): render the sheet at its FINAL box,
// invert that into a transform that lands it exactly over the tapped card
// (transform-origin pinned to the top-left corner, so translate+scale line up
// exactly), then animate the transform back to none. The box never changes
// SIZE during the animation, only its transform — so it composites instead
// of reflowing.
//
// Drag-to-dismiss reuses the house `useSheetDrag` hook (ExerciseSheet.jsx,
// PortionSheet.jsx) — its own throw-off-the-bottom-or-spring-back physics is
// the established answer to "swipe a sheet down"; a deliberate dismiss
// (scrim tap, Close, Escape) instead reverses the FLIP back into the card it
// grew from, or fades if that card is no longer on screen.
export function GlassSheet({ card, originEl, onClose }) {
  const drag = useSheetDrag(onClose, { threshold: 80 });
  const closing = useRef(false);

  // grow in from the tapped card's rect
  useLayoutEffect(() => {
    const el = drag.sheetRef.current;
    if (!el) return;
    el.style.transformOrigin = '0 0';
    const first = originEl && document.body.contains(originEl) ? originEl.getBoundingClientRect() : null;
    if (!first || reducedMotion()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 1 : 220, easing: 'ease-out' });
      return;
    }
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left, dy = first.top - last.top;
    const sx = first.width / last.width, sy = first.height / last.height;
    const anim = el.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.85 },
       { transform: 'none', opacity: 1 }],
      { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
    );
    // release the animation's hold once it lands, or the drag handlers'
    // direct style.transform writes would be fighting a still-active effect
    anim.finished.catch(() => {}).then(() => anim.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // deliberate dismiss: reverse the morph back into the origin card if it's
  // still on screen, otherwise a plain fade — never a hard cut
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = drag.sheetRef.current;
    if (!el) { onClose(); return; }
    if (reducedMotion()) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out' }).finished.catch(() => {}).then(onClose);
      return;
    }
    const first = originEl && document.body.contains(originEl) ? originEl.getBoundingClientRect() : null;
    if (!first) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in' }).finished.catch(() => {}).then(onClose);
      return;
    }
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left, dy = first.top - last.top;
    const sx = first.width / last.width, sy = first.height / last.height;
    el.animate(
      [{ transform: 'none', opacity: 1 },
       { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.4 }],
      { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
    ).finished.catch(() => {}).then(onClose);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    // the sheet owns scroll while it's open — the station behind it must not move
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!card) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={card.label || 'Expanded panel'} onClick={close}
      style={css('position:fixed;inset:0;z-index:145;display:flex;align-items:flex-end;justify-content:center;background:color-mix(in srgb, var(--nv-void) 70%, transparent);backdrop-filter:blur(10px);animation:fadeIn var(--nv-dur-base) var(--nv-ease)')}>
      <div ref={drag.sheetRef} onClick={(e) => e.stopPropagation()}
        style={css('width:100%;max-width:560px;max-height:86vh;overflow-y:auto;-webkit-overflow-scrolling:touch;border-radius:var(--nv-radius) var(--nv-radius) 0 0;border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-bottom:none;background:var(--nv-bg1);box-shadow:0 -30px 80px -30px rgba(0,0,0,.9);padding:0 16px calc(18px + env(safe-area-inset-bottom))')}>
        {/* the grab zone: handle + close, sticky so it stays under the thumb
            while a tall card scrolls beneath it */}
        <div {...drag.handleProps} style={{ ...drag.handleProps.style, position: 'sticky', top: 0, zIndex: 2, background: 'var(--nv-bg1)', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0 8px' }}>
          <span aria-hidden="true" style={css('width:36px;height:5px;border-radius:3px;background:color-mix(in srgb, var(--nv-ink) 22%, transparent);margin-right:auto')} />
          <TextAction tone="quiet" onClick={close} ariaLabel="Close">Close</TextAction>
        </div>
        <div style={css('padding-bottom:10px')}>
          <StageCard card={card} size="full" />
        </div>
      </div>
    </div>
  );
}
