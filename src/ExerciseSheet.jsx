import { css } from './css.js';
import { VoicePanel } from './VoicePanels.jsx';
import { useSheetDrag } from './useSheetDrag.js';
import { TextAction } from './Controls.jsx';
import { SkeletonBar } from './Skeleton.jsx';
import { vtStyle } from './vtName.js';

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


// THE SHAPE OF WHAT IS COMING, at the height it will be.
//
// The sheet used to open on one uppercase mono line — `PULLING UP DUMBBELL
// SHOULDER PRESS (SINGLE ARM)…` — in an otherwise empty card, then jump from
// about a quarter of the screen to two thirds when the panel landed (review
// finding 5). A height jump on arrival reads as broken (emil-design-eng:
// "elements appearing or disappearing without transition feel broken"), and
// the fix is not a faster fetch: it is opening at the final height with the
// real layout blocked out, so the content fills a frame already there.
//
// The blocks are the house `SkeletonBar`, which already carries the shimmer,
// the reduced-motion handling and the honesty rule that a skeleton means
// LOADING and never EMPTY.
function SheetSkeleton({ name }) {
  return (
    <div aria-busy="true" aria-label={`Opening ${name}`} style={css('min-height:430px;padding:2px 0 14px')}>
      <div style={css('border:1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:14px')}>
        <SkeletonBar w="64%" h="19px" />
        <div style={css('display:flex;gap:14px;align-items:flex-start')}>
          <SkeletonBar w="104px" h="118px" radius="10px" style={{ flex: 'none' }} />
          <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:9px')}>
            <SkeletonBar w="70%" />
            <SkeletonBar w="52%" />
            <SkeletonBar w="44%" h="34px" radius="999px" />
          </div>
        </div>
        <SkeletonBar w="38%" h="22px" />
        <SkeletonBar w="86%" />
        <div style={css('display:flex;flex-direction:column;gap:8px')}>
          {[0, 1, 2, 3].map((i) => <SkeletonBar key={i} h="30px" radius="10px" />)}
        </div>
      </div>
    </div>
  );
}

export function ExerciseSheet({ v }) {
  const s = v.exerciseSheet;
  const drag = useSheetDrag(v.closeExerciseCard);
  if (!s) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${s.name} — form, anatomy and history`} onClick={v.closeExerciseCard}
      style={css('position:fixed;inset:0;z-index:118;background:rgba(6,7,13,.62);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center')}>
      {/* When the sheet was opened from a session row, that row's name is on
          it (s.vtKey) and the panel MORPHS out of the row. The sheetUp slide is
          then wrong twice over: the element is already being animated from the
          row's position, and two motions on one element read as a stutter. So
          the slide is the fallback — for every other way in, where there is no
          row to come from. */}
      <div ref={drag.sheetRef} onClick={(e) => e.stopPropagation()}
        style={{
          ...css(`width:min(560px,100%);max-height:88vh;overflow-y:auto;border-radius:18px 18px 0 0;border:1px solid var(--nv-edge);border-bottom:none;background:var(--nv-bg1);box-shadow:0 -30px 80px -30px rgba(0,0,0,.9);padding:0 14px calc(18px + env(safe-area-inset-bottom))`),
          ...(s.vtKey ? vtStyle('ex', s.vtKey) : { animation: 'sheetUp var(--nv-dur-base) var(--nv-ease)' }),
        }}>
        {/* the grab zone: handle + close, sticky so it stays under the thumb
            while the card below scrolls */}
        {/* THE GRABBER SITS IN THE MIDDLE. It was pinned left by `margin:0
            auto 0 0`, which put the one part of a sheet everybody recognises
            at x≈33 (review finding 5; apple-design §16 Craft — a misaligned
            element reads as carelessness). It is centred in the sheet now,
            and Close keeps its corner. */}
        <div {...drag.handleProps} style={{ ...drag.handleProps.style, position: 'sticky', top: 0, zIndex: 2, background: 'var(--nv-bg1)', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '10px 0 6px', marginBottom: '2px' }}>
          <span />
          <span aria-hidden="true" style={css('width:36px;height:5px;border-radius:3px;background:color-mix(in srgb, var(--nv-ink) 22%, transparent)')} />
          <span style={{ justifySelf: 'end' }}>
            <TextAction tone="quiet" onClick={v.closeExerciseCard} ariaLabel="Close">Close</TextAction>
          </span>
        </div>
        {s.loading && <SheetSkeleton name={s.name} />}
        {s.error && (
          <div style={css(`padding:18px 6px;font:500 13px var(--nv-font-ui);color:var(--nv-warn)`)}>Couldn't pull that up — {s.error}</div>
        )}
        {s.panel && <VoicePanel panel={s.panel} />}
      </div>
    </div>
  );
}
