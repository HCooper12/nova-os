import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { VoicePanel } from './VoicePanels.jsx';

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
// on Today's card, and it slides up.

const M = 'var(--nv-font-mono)';

export function ExerciseSheet({ v }) {
  const s = v.exerciseSheet;
  if (!s) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${s.name} — form, anatomy and history`} onClick={v.closeExerciseCard}
      style={css('position:fixed;inset:0;z-index:118;background:rgba(6,7,13,.62);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center')}>
      <div onClick={(e) => e.stopPropagation()}
        style={css(`width:min(560px,100%);max-height:88vh;overflow-y:auto;border-radius:18px 18px 0 0;border:1px solid var(--nv-edge);border-bottom:none;background:var(--nv-bg1);box-shadow:0 -30px 80px -30px rgba(0,0,0,.9);padding:12px 14px calc(18px + env(safe-area-inset-bottom));animation:fadeUp .28s ease-out`)}>
        <div style={css('display:flex;align-items:center;gap:10px;margin-bottom:8px')}>
          <span style={css('width:36px;height:4px;border-radius:2px;background:color-mix(in srgb, var(--nv-ink) 18%, transparent);margin:0 auto 0 0')} />
          <Interactive as="span" onClick={v.closeExerciseCard} aria-label="Close"
            base={css(`cursor:pointer;font:600 9.5px ${M};letter-spacing:.14em;padding:6px 10px;border-radius:7px;border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);color:var(--nv-ink60)`)}
            hoverStyle={{ color: 'var(--nv-ink)' }}>CLOSE</Interactive>
        </div>
        {s.loading && (
          <div style={css(`padding:26px 6px;font:500 9.5px ${M};letter-spacing:.16em;color:var(--nv-ink40)`)}>PULLING UP {String(s.name).toUpperCase()}…</div>
        )}
        {s.error && (
          <div style={css(`padding:18px 6px;font:500 13px var(--nv-font-ui);color:var(--nv-warn)`)}>Couldn't pull that up — {s.error}</div>
        )}
        {s.panel && <VoicePanel panel={s.panel} />}
      </div>
    </div>
  );
}
