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
    if (!panel && !scrim) { onClose?.(); return; }
    closing.current = true;
    // The panel falls back down the path it rose along (nvFall mirrors fadeUp
    // exactly), and the scrim releases its dim underneath it.
    if (panel) panel.style.animation = `nvFall ${ms}ms var(--nv-ease-exit) both`;
    if (scrim) scrim.style.animation = `nvFadeOut ${ms}ms var(--nv-ease-exit) both`;
    // setTimeout rather than animationend: if the element is removed or the
    // animation is interrupted, animationend never fires and the overlay is
    // stuck open forever. A timer always lands.
    setTimeout(() => { closing.current = false; onClose?.(); }, ms);
  }, [onClose, ms]);

  return { scrimRef, panelRef, close };
}
