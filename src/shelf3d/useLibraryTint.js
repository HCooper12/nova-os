// THE PAGE WEARS THE BOOK.
//
// Stripe Press's tell, 0:23–0:34 of the reel: open *The Revolt of the Public*
// and the whole page goes electric blue and magenta — not the cover alone, the
// headings, the controls, the ground. The page knows what it is holding.
//
// Two custom properties do it here, set on the Library wrapper:
//
//   --nv-lib-acc     the theme's accent, mixed toward this volume's accent
//   --nv-lib-ground  a wash of the volume's cloth for surfaces behind type
//
// Everything in Detail reads `var(--nv-lib-acc, var(--nv-acc))`, so the
// untinted state is literally the current design and there is no second code
// path to keep in step.
//
// THE MIX IS COMPUTED, NOT DECLARED. A CSS `color-mix()` cannot be measured at
// the point it is written, and the HIG audit of 16 Sep (35a4af0) found three
// contrast failures precisely because nobody had measured. A volume bound in
// near-black cloth mixed 35% into the accent would put Detail's headings back
// under the bar. So the mix is done in JS, the result is checked against the
// pane it will sit on, and the percentage is backed off until it clears 4.5:1
// — the same floor and the same arithmetic as server/test/contrast.test.js.
//
// The tint lives on the WRAPPER ELEMENT, which is the whole failure-mode
// design for "the tint outlives the detail": navigate away and the element
// goes, and the tint goes with it. The cleanup below is belt and braces for
// the case where the element survives and the volume closes.

import { useLayoutEffect } from 'react';
import { safeTint, mixHex, contrastRatio } from './edition.js';

const readHex = (cs, name, fallback) => {
  const raw = cs.getPropertyValue(name).trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : fallback;
};

/**
 * @param ref   the Library wrapper
 * @param tint  { accent, cloth } from the open edition, or null
 */
export function useLibraryTint(ref, tint) {
  const accent = tint?.accent || null;
  const cloth = tint?.cloth || null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const clear = () => {
      el.style.removeProperty('--nv-lib-acc');
      el.style.removeProperty('--nv-lib-ground');
      el.style.removeProperty('--nv-lib-edge');
    };
    if (!accent) { clear(); return clear; }

    const cs = getComputedStyle(el);
    const themeAcc = readHex(cs, '--nv-acc', '#59e6ff');
    // the surface Detail's type actually sits on. --nv-glass is an rgba in
    // most themes, so the opaque pane underneath is the honest backdrop.
    const pane = readHex(cs, '--nv-bg1', '#0a0f1e');

    const { colour, pct } = safeTint(themeAcc, accent, pane, { pct: 35, min: 4.5 });
    el.style.setProperty('--nv-lib-acc', colour);
    // the ground is a wash, not type, so it takes the cloth at a low mix and
    // needs no contrast guard — nothing is read ON it that is not already
    // guarded by --nv-lib-acc.
    el.style.setProperty('--nv-lib-ground', mixHex(cloth || accent, pane, 22));
    el.style.setProperty('--nv-lib-edge', mixHex(colour, pane, 34));

    if (import.meta.env.DEV) {
      window.__novaLibTint = {
        accent, cloth, themeAcc, pane, applied: colour, pct,
        ratio: Number(contrastRatio(colour, pane).toFixed(2)),
      };
    }
    return clear;
  }, [ref, accent, cloth]);
}
