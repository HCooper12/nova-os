import { NovaCore } from './NovaCore.jsx';
import { Interactive } from './Interactive.jsx';
import { VoiceHalo } from './VoiceHalo.jsx';

// The living core — Nova's presence on every mobile screen. Not decoration:
// the ring is a receipt (spinning = a model job genuinely in flight,
// pulsing = the mic is actually open), and TAPPING IT STARTS TALKING —
// natively, on whatever screen he's on (his ask: "like how Siri can work
// natively in any area of iOS"). A LONG PRESS reveals the words — the
// transcript pop-up — because he wants the icon alone by default.
//
// This is the MAC's single Nova icon. The phone's lives in the dock's centre
// button, styled the same way, so neither device ever shows two.
//
// The halo is driven by the REAL audio analyser at 60fps through a ref —
// never React state, or every frame would re-render the app. Nova's voice
// makes the orb swell; his own voice does too while dictating.
export function FloatingCore({ s }) {
  return (
    <Interactive
      onClick={s.tap}
      onLongPress={s.onLongPress}
      aria-label="Talk to Nova"
      base={`position:fixed;right:12px;bottom:${s.bottom};z-index:69;width:56px;height:56px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--nv-void) 78%, transparent);border:1px solid ${s.thinking || s.listening || s.speaking ? 'var(--nv-acc-border)' : 'var(--nv-edge)'};box-shadow:0 10px 30px -12px rgba(0,0,0,.6)`}
      activeStyle={{ transform: 'scale(.9)', transition: 'transform .16s cubic-bezier(.32,.72,0,1)' }}
    >
      <VoiceHalo speaking={s.speaking} listening={s.listening} inset="-6px" />
      {s.thinking && (
        <span aria-hidden="true" style={{ position: 'absolute', inset: '-3px', borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'var(--nv-cy)', animation: 'ringSpin 1s linear infinite var(--nv-anim)' }}></span>
      )}
      {!s.thinking && s.listening && (
        <span aria-hidden="true" style={{ position: 'absolute', inset: '-3px', borderRadius: '50%', border: '2px solid var(--nv-cy)', opacity: 0.7, animation: 'novaPulse 1.6s infinite var(--nv-anim)' }}></span>
      )}
      <NovaCore size={44} variant="mini" engine={s.coreStyle} speaking={s.speaking} listening={s.listening} style={{ pointerEvents: 'none' }} />
    </Interactive>
  );
}
