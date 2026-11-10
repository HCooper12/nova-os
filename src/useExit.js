import { useCallback, useRef } from 'react';

// LEAVE THE WAY YOU ARRIVED.
//
// The audit finding (16 Sep 2026): Nova had SIX entrance keyframes — fadeUp,
// sheetUp, popIn, nvRise, deckRise, shelfIn — and ZERO exits. Every overlay
// rose into place and then vanished on a hard cut when it closed. The motion
// tokens even had `--nv-ease-exit` defined, with a comment saying "anything
// LEAVING accelerates away", and **not one call site in the entire app**. The
// idea had been written down and never taken up.
//
// Apple's rule (*Designing Fluid Interfaces*, and the apple-design skill):
// "If something disappears one way, we expect it to emerge from where it
// came." A panel that rises in and cuts out has no path back, and the eye
// loses where the thing went.
//
// WHY THIS IS A HOOK AND NOT A WRAPPER COMPONENT. The overlays are rendered by
// the parent as `{v.showX && <Modal/>}`, so the parent owns the unmount — but
// the parent also hands the modal its `onClose`. The modal can therefore play
// its own exit and call `onClose` when it lands, with NO change to App.jsx at
// all. GlassSheet already works this way (it reverses its FLIP before closing);
// this generalises it for overlays that have no origin rect to return to.
//
// Reduced motion closes immediately. An animation nobody sees is still a delay
// they feel.

const EXIT_MS = 170;

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Play the exit from the element's live opacity and transform. False when the
// engine cannot (no WAAPI, an easing it will not parse), so the caller falls
// back to the keyframe.
function leaveFromHere(el, ms, falls) {
  if (!el || typeof el.animate !== 'function') return false;
  try {
    const cs = getComputedStyle(el);
    const here = { opacity: cs.opacity || 1, transform: cs.transform && cs.transform !== 'none' ? cs.transform : 'none' };
    const rise = cs.getPropertyValue('--nv-rise').trim() || '12px';
    const ease = cs.getPropertyValue('--nv-ease-exit').trim() || 'cubic-bezier(.4,0,1,1)';
    const gone = falls ? { opacity: 0, transform: `translateY(${rise})` } : { opacity: 0, transform: here.transform };
    // made first, so a refused easing throws before anything on screen changes
    const fx = new KeyframeEffect(el, [here, gone], { duration: ms, easing: ease, fill: 'both' });
    el.getAnimations?.().forEach((a) => a.cancel());
    el.style.animation = 'none';
    new Animation(fx, document.timeline).play();
    return true;
  } catch { return false; }
}

export function useExit(onClose, { ms = EXIT_MS } = {}) {
  const scrimRef = useRef(null);
  const panelRef = useRef(null);
  const closing = useRef(false);

  const close = useCallback(() => {
    // A second tap while the exit is playing must not queue a second onClose —
    // some callers toggle state rather than setting it, and two calls reopen it.
    if (closing.current) return;
    if (reducedMotion()) { onClose?.(); return; }
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    // pulled down and thrown already (sheetDrag.js): it is off screen, and a
    // second fall would first snap it back up to fall again
    if ((panel || scrim)?.closest?.('[data-sheet-gone]')) { onClose?.(); return; }
    if (!panel && !scrim) { onClose?.(); return; }
    closing.current = true;
    // The panel falls back down the path it rose along (nvFall mirrors fadeUp
    // exactly), and the scrim releases its dim underneath it.
    //
    // FROM WHERE IT IS (10 Nov 2026, the "why iPhone feels so smooth" reel,
    // detail five). Swapping the entrance keyframe for nvFall restarted the
    // panel at full opacity and rest, so a close tapped mid-rise jumped up
    // before it fell. The exit now starts at whatever is on screen this frame.
    if (!leaveFromHere(panel, ms, true)) { if (panel) panel.style.animation = `nvFall ${ms}ms var(--nv-ease-exit) both`; }
    if (!leaveFromHere(scrim, ms, false)) { if (scrim) scrim.style.animation = `nvFadeOut ${ms}ms var(--nv-ease-exit) both`; }
    // setTimeout rather than animationend: if the element is removed or the
    // animation is interrupted, animationend never fires and the overlay is
    // stuck open forever. A timer always lands.
    setTimeout(() => { closing.current = false; onClose?.(); }, ms);
  }, [onClose, ms]);

  return { scrimRef, panelRef, close };
}
