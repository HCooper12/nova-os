import { useLayoutEffect, useRef, useState } from 'react';
import { spring, reducedMotion, canAnimate } from './springs.js';
import { markRevealed, wasRevealed } from './recipeReveal.js';
import './photoReveal.css';

// THE IMAGE REVEAL (15 Oct 2026, his approved motion set, scene 6 of
// nova-motion-set.html). A recipe a reel just brought in opens with nine
// slats over its photo; once the photo has loaded they pull back left to
// right (scaleX 1 to 0 from the left, smooth, 45 ms apart), a "From a reel"
// chip springs in (bouncy) and the page's facts rise into place (snappy).
// Normal opens show the photo plainly: the caller renders this only when
// src/motion/recipeReveal.js says the recipe was filed from a reel just now,
// and this draws nothing unless it is the first showing on this device (the
// first play marks it, so reopening the page shows the photo plainly).
//
// Sits inside the photo's positioned box, after the <img>. The slats' base
// style is pulled back (scaleX 0), so a cancelled or failed animation leaves
// the photo showing; until the photo is ready the animations are created and
// held paused, which holds the slats closed and the facts down, so nothing
// flashes. Reduced motion: no slats, the chip simply there.

const SLATS = 9;
const READY_CAP_MS = 2500;

export function PhotoReveal({ id, chip, where = 'page' }) {
  const rootRef = useRef(null);
  // decided once, when the photo first shows: the first showing on this
  // device plays (reduced motion: the chip alone); any later one is plain
  const [first] = useState(() => !wasRevealed(id));
  const [play] = useState(() => !reducedMotion());
  useLayoutEffect(() => {
    if (!first) return undefined;
    markRevealed(id);
    const root = rootRef.current;
    if (!play || !root || !canAnimate(root)) return undefined;
    const S = spring('smooth'); const N = spring('snappy'); const B = spring('bouncy');
    const slats = [...root.querySelectorAll('.nv-pr-slat')];
    const badge = root.querySelector('.nv-pr-chip');
    const panel = root.closest('[data-sheet]') || root.parentElement;
    const facts = [...(panel?.querySelectorAll('.nv-rp-title, .nv-rp-meta') || [])];
    const open = 700 + (SLATS - 1) * 45;
    const anims = [
      ...slats.map((el, i) => el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 700, easing: S.easing, delay: i * 45, fill: 'backwards' })),
      ...(badge ? [badge.animate([{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: B.ms, easing: B.easing, delay: open - 120, fill: 'backwards' })] : []),
      ...facts.map((el, i) => el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: N.ms, easing: N.easing, delay: open - 80 + i * 60, fill: 'backwards' })),
    ];
    anims.forEach((a) => a.pause());
    // the photo first: slats pulling back onto an empty box reveal nothing
    const img = root.parentElement?.querySelector('img');
    let gone = false;
    const go = () => { if (!gone) { gone = true; anims.forEach((a) => a.play()); } };
    const cap = setTimeout(go, READY_CAP_MS);
    if (!img || (img.complete && img.naturalWidth > 0)) go();
    else {
      img.addEventListener('load', go, { once: true });
      // a photo that will not load: the slats get out of the way at once
      img.addEventListener('error', () => { gone = true; anims.forEach((a) => a.cancel()); }, { once: true });
    }
    return () => { clearTimeout(cap); img?.removeEventListener('load', go); anims.forEach((a) => a.cancel()); };
  }, [id, first, play]);

  if (!first) return null;
  return (
    <div ref={rootRef} className={`nv-pr nv-pr-${where}`}>
      {play && (
        <div className="nv-pr-slats" aria-hidden="true">
          {Array.from({ length: SLATS }, (_, i) => <i key={i} className="nv-pr-slat" />)}
        </div>
      )}
      {chip && <span className="nv-pr-chip">{chip}</span>}
    </div>
  );
}
