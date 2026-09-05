import { css } from './css.js';
import { VoicePanel } from './VoicePanels.jsx';
import { useSheetDrag } from './useSheetDrag.js';
import { TextAction } from './Controls.jsx';

// THE EXERCISE SHEET — the chat's exercise card, reachable from the Train
// screen itself.
//
// His report, 5 Sep: "I still can't see the 3D animations/models for the
// exercise library." He was right to be unsure what had shipped — the card
// with the anatomy, the 3D figure, the cues and the form video existed only
// as a chat panel, so the only way to see it was to ask Nova about a lift by
// name. The exercise library on Train listed 135 exercises and opening one
// did nothing but add it to a routine.
//
// This renders the SAME card (VoicePanel → Exercise) in a bottom sheet, from
// the same server builder, so Train and the chat can never show different
// facts about a lift. Long-press an exercise in the library, or tap its name
// on Today's card, and it slides up — and drags back down (useSheetDrag).

const M = 'var(--nv-font-mono)';

export function ExerciseSheet({ v }) {
  const s = v.exerciseSheet;
  const drag = useSheetDrag(v.closeExerciseCard);
  if (!s) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${s.name} — form, anatomy and history`} onClick={v.closeExerciseCard}
      style={css('position:fixed;inset:0;z-index:118;background:rgba(6,7,13,.62);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center')}>
      <div ref={drag.sheetRef} onClick={(e) => e.stopPropagation()}
        style={css(`width:min(560px,100%);max-height:88vh;overflow-y:auto;border-radius:18px 18px 0 0;border:1px solid var(--nv-edge);border-bottom:none;background:var(--nv-bg1);box-shadow:0 -30px 80px -30px rgba(0,0,0,.9);padding:0 14px calc(18px + env(safe-area-inset-bottom));animation:sheetUp .32s cubic-bezier(.32,.72,0,1)`)}>
        {/* the grab zone: handle + close, sticky so it stays under the thumb
            while the card below scrolls */}
        <div {...drag.handleProps} style={{ ...drag.handleProps.style, position: 'sticky', top: 0, zIndex: 2, background: 'var(--nv-bg1)', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0 6px', marginBottom: '2px' }}>
          <span aria-hidden="true" style={css('width:36px;height:5px;border-radius:3px;background:color-mix(in srgb, var(--nv-ink) 22%, transparent);margin:0 auto 0 0')} />
          <TextAction tone="quiet" onClick={v.closeExerciseCard} ariaLabel="Close">Close</TextAction>
        </div>
        {s.loading && (
          <div style={css(`padding:26px 6px;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:var(--nv-ink40)`)}>PULLING UP {String(s.name).toUpperCase()}…</div>
        )}
        {s.error && (
          <div style={css(`padding:18px 6px;font:500 13px var(--nv-font-ui);color:var(--nv-warn)`)}>Couldn't pull that up — {s.error}</div>
        )}
        {s.panel && <VoicePanel panel={s.panel} />}
      </div>
    </div>
  );
}
