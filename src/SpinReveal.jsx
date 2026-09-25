import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Interactive } from './Interactive.jsx';
import { reelTimeline } from './reel.js';
import { reelSound } from './sfx.js';

// THE REEL — 25 Sep 2026, from the Hormozi reel he sent: a card cycling
// through tactics that slows and lands on the day's one. Here it is a picker
// drum: three rows through a glass window, the middle one held in a lit band.
//
// It is THEATRE OVER A DECISION ALREADY MADE. Nothing in here chooses: the
// rows arrive in order with the target last, and the reel lands where the
// caller said. For today's technique that is the server's pick (the one the
// brief speaks); for the concept shuffle it is the page the shuffle drew.
//
// How it moves (reel.js is the clock, and is tested):
//   - one WAAPI animation on the strip, transform only, so it runs on the
//     compositor and a busy render cannot stutter it. (A speed-scaled blur was
//     tried and removed the same day: filter is not a compositor property, and
//     in the headless check every frame of it took seconds to paint. The eye
//     smears a fast pass by itself.)
//   - the sound is scheduled on the audio clock off the SAME timeline, so each
//     tick is the frame a row crosses the band (sfx.js).
//   - at the catch: a light passes through the band, the name settles, the
//     rows either side dim. Then it holds a beat and hands back (onLanded),
//     and the caller opens the card around the name.
//   - a tap mid-spin is never ignored and never a cut: the rest of the spin
//     plays five times faster and lands, ticks dropped, chime moved with it.
//   - reduced motion: no travel at all — the band cross-fades to the answer
//     and the chime (a sound, not motion) still marks it.
//
// The haptic comes from his finger on the starting tap (Interactive
// haptic="tick"): iOS lets a web page buzz only under a real touch, so the
// landing cannot buzz, and does not pretend to.

const HURRY = 5;           // a mid-spin tap plays the rest this much faster
const HOLD_MS = 520;       // the landed name holds before the card opens
const SETTLE_POP_MS = 360;
const SWEEP_MS = 640;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// the house curve, read from the token so WAAPI moves like the CSS does
function houseEase() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--nv-ease').trim();
    if (v) return v;
  } catch { /* no DOM */ }
  return 'cubic-bezier(.32,.72,0,1)';
}

const tint = (accent, pct) => `color-mix(in srgb, var(${accent}) ${pct}%, transparent)`;

// A timer on the ANIMATION clock rather than the event loop: a keyframe-less
// WAAPI animation that runs for `ms` and calls back when it finishes. So the
// catch and the hand-back keep time with the strip — a render holding the
// main thread cannot make the name light up before it has arrived, and a
// recording's slowed clock (scripts/rec.mjs --slow) slows the whole beat
// together instead of opening the card mid-spin.
function clockTimer(ms, fn) {
  try {
    const a = new Animation(new KeyframeEffect(null, null, { duration: Math.max(0, ms) }), document.timeline);
    a.onfinish = fn;
    a.play();
    return a;
  } catch {
    const id = setTimeout(fn, Math.max(0, ms));
    return { cancel: () => clearTimeout(id) };
  }
}

export function SpinReveal({
  rows, spinning, rowH = 46, accent = '--nv-mg', face, onStart, onLanded, chime = 'technique',
  label = 'Reveal', landedLabel = '', ctaNode = null,
}) {
  const stripRef = useRef(null);
  const sweepRef = useRef(null);
  const targetRef = useRef(null);
  const run = useRef(null);
  const handedBack = useRef(false);
  const [landed, setLanded] = useState(false);

  // the drum is frozen for the length of a spin: the view model re-renders
  // under it (syncs, clocks) and a fresh rows array must not restart anything
  const frozen = useRef(rows);
  if (!spinning) frozen.current = rows;
  const R = frozen.current;
  const steps = Math.max(1, R.length - 3);
  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;

  const handBack = () => {
    if (handedBack.current) return;
    handedBack.current = true;
    onLandedRef.current?.();
  };

  const clearLanding = (r) => {
    for (const a of r.landAnims) a.cancel();
    for (const m of r.markers) m.cancel();
    r.landAnims = [];
    r.markers = [];
  };

  // the catch, `delay` ms from now on the animation clock: the light through
  // the band and the settle on the name, then the hold, then hand back
  const scheduleLanding = (r, delay, { quiet = false } = {}) => {
    clearLanding(r);
    const land = () => {
      setLanded(true);
      if (!quiet) {
        const ease = houseEase();
        if (sweepRef.current) {
          r.landAnims.push(sweepRef.current.animate(
            [{ transform: 'translateX(-110%)', opacity: 1 }, { transform: 'translateX(260%)', opacity: 1 }],
            { duration: SWEEP_MS, easing: ease },
          ));
        }
        if (targetRef.current) {
          r.landAnims.push(targetRef.current.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.04)', offset: 0.4 }, { transform: 'scale(1)' }],
            { duration: SETTLE_POP_MS, easing: ease },
          ));
        }
      }
      r.markers.push(clockTimer((quiet ? 0 : SETTLE_POP_MS) + HOLD_MS, handBack));
    };
    r.markers.push(clockTimer(delay, land));
  };

  useLayoutEffect(() => {
    if (!spinning) return undefined;
    handedBack.current = false;
    setLanded(false);
    const strip = stripRef.current;
    // no Web Animations (a very old engine): skip the show, never the answer
    if (!strip || typeof strip.animate !== 'function') { handBack(); return undefined; }

    const r = { landAnims: [], markers: [] };
    run.current = r;
    const end = `translate3d(0,${-steps * rowH}px,0)`;
    if (reducedMotion()) {
      const dur = 420;
      r.anim = strip.animate([
        { transform: 'translate3d(0,0,0)', opacity: 1 },
        { transform: 'translate3d(0,0,0)', opacity: 0, offset: 0.45 },
        { transform: end, opacity: 0, offset: 0.46 },
        { transform: end, opacity: 1 },
      ], { duration: dur, easing: 'linear', fill: 'forwards' });
      r.landAt = dur;
      r.sound = reelSound({ ticks: [], landAt: dur, chime });
      scheduleLanding(r, dur, { quiet: true });
    } else {
      const tl = reelTimeline(steps);
      r.landAt = tl.landAt;
      r.anim = strip.animate(tl.frames.map((f) => ({
        offset: f.offset,
        transform: `translate3d(0,${(-f.pos * rowH).toFixed(2)}px,0)`,
      })), { duration: tl.duration, easing: 'linear', fill: 'forwards' });
      r.sound = reelSound({ ticks: tl.ticks, landAt: tl.landAt, chime });
      scheduleLanding(r, tl.landAt);
    }
    return () => {
      // unmounted mid-spin (he left the screen): silence what has not played.
      // After the hand-back the chime is allowed to ring out under the card.
      if (!handedBack.current) { r.sound?.stop(); r.anim?.cancel(); }
      clearLanding(r);
      run.current = null;
    };
    // the spin is keyed on `spinning` alone — see `frozen` above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);

  // a new day or a new shuffle: back to the resting drum
  useEffect(() => { if (!spinning) { setLanded(false); handedBack.current = false; } }, [spinning]);

  const hurry = () => {
    const r = run.current;
    if (!r?.anim || landed) return;
    const elapsed = Number(r.anim.currentTime) || 0;
    const remaining = r.landAt - elapsed;
    if (remaining <= 40) return;
    r.anim.updatePlaybackRate(HURRY);
    r.sound?.hurry(remaining / HURRY);
    scheduleLanding(r, remaining / HURRY);
  };

  const idle = !spinning;
  const band = rowH;
  return (
    <Interactive as="div" haptic={landed ? undefined : 'tick'}
      onClick={landed ? undefined : idle ? onStart : hurry}
      aria-label={idle ? label : landed ? landedLabel : 'Skip to the answer'}
      base={{ position: 'relative', height: `${rowH * 3}px`, cursor: landed ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent', userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: '14px',
        // the drum: rows above and below the band fall away into the glass
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, rgba(0,0,0,.4) 16%, #000 33.4%, #000 66.6%, rgba(0,0,0,.4) 84%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, transparent 0, rgba(0,0,0,.4) 16%, #000 33.4%, #000 66.6%, rgba(0,0,0,.4) 84%, transparent 100%)',
      }}>
        {/* the band: the lit glass the answer lands in. A bright top edge is
            light catching the material; the hairline is the accent's. */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: `${band}px`, height: `${band}px`, borderRadius: '12px', overflow: 'hidden',
          background: tint(accent, landed ? 16 : 10),
          boxShadow: `inset 0 0 0 1px ${tint(accent, landed ? 42 : 28)}, inset 0 1px 0 color-mix(in srgb, #fff 10%, transparent)`,
          transition: 'background var(--nv-dur-base) var(--nv-ease), box-shadow var(--nv-dur-base) var(--nv-ease)',
        }}>
          <div ref={sweepRef} style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '42%', opacity: 0, transform: 'translateX(-110%)',
            background: `linear-gradient(90deg, transparent, ${tint(accent, 38)}, transparent)`,
          }} />
        </div>
        <div ref={stripRef} style={{ position: 'absolute', left: 0, right: 0, top: 0, willChange: spinning ? 'transform' : undefined }}>
          {R.map((row, i) => {
            const isTarget = i === R.length - 2;
            const dim = landed && !isTarget;
            return (
              <div key={`${row.key ?? i}-${i}`} ref={isTarget ? targetRef : undefined}
                style={{
                  height: `${rowH}px`, display: 'flex', alignItems: 'center', padding: '0 14px', minWidth: 0,
                  transformOrigin: '14px 50%',
                  opacity: dim ? 0.15 : 1,
                  transition: 'opacity var(--nv-dur-base) var(--nv-ease)',
                }}>
                {row.cta && ctaNode ? ctaNode : (
                  <span style={{
                    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    font: face, color: 'var(--nv-ink)',
                  }}>{row.text}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* what it landed on, said once for VoiceOver — the drum itself is hidden */}
      <span aria-live="polite" style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        {landed ? landedLabel : ''}
      </span>
    </Interactive>
  );
}
