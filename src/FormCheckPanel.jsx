import { css } from './css.js';
import { Eyebrow, TextAction, Meta } from './Controls.jsx';

// FORM CHECK — the one panel both doors open (server/lib/formCheck.js).
//
// It is the same view model whether he is standing in the rack mid-session or
// reviewing last night's clip from the routine screen, so there is exactly
// one place this behaviour lives (NOVA-METHOD.md §2b: one view model, both
// idioms). The protocol is stated BEFORE he films, because a clip shot from
// the wrong angle is refused — and being refused after the fact is the worst
// version of this feature.
export function FormCheckPanel({ fc }) {
  if (!fc) return null;
  return (
    <div style={css("margin-top:10px;border:1px solid color-mix(in srgb, var(--nv-cy) 34%, transparent);border-radius:13px;padding:12px;background:color-mix(in srgb, var(--nv-cy) 05%, transparent)")}>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap")}>
        <Eyebrow as="span" tone="cyan">Form check — {fc.exerciseName}</Eyebrow>
        {fc.rubric && <Meta tone="faint">{fc.rubric.angle}</Meta>}
      </div>

      {!fc.busy && !fc.done && !fc.refused && (
        <>
          <div style={css("margin-top:9px;display:flex;flex-direction:column;gap:5px")}>
            {fc.protocol.map((line, i) => (
              <div key={i} style={css("display:flex;gap:8px;align-items:baseline;font-size:12.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 80%, transparent)")}>
                <span style={css("flex:none;color:var(--nv-cy);font:var(--nv-micro-s)")}>{String(i + 1).padStart(2, '0')}</span>
                <span style={css("min-width:0")}>{line}</span>
              </div>
            ))}
          </div>
          {fc.rubric && (
            <Meta tone="faint" style={{ display: 'block', marginTop: '9px' }}>
              It will look at: {fc.rubric.points.map((pt) => pt.split(' — ')[0]).join(' · ')}.
            </Meta>
          )}
          <label style={css("margin-top:11px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;font:600 13px var(--nv-font-ui);padding:9px 16px;border-radius:999px;background:var(--nv-acc);color:var(--nv-on-acc)")}>
            Choose the clip
            <input type="file" accept="video/*" capture="environment" onChange={fc.pick} style={{ display: 'none' }} />
          </label>
        </>
      )}

      {fc.busy && (
        <div style={css("margin-top:10px;font-size:12.5px;color:var(--nv-cy)")}>
          {fc.stage === 'uploading' ? 'Sending the clip…' : `${fc.stage}…`}
          <Meta tone="faint" style={{ display: 'block', marginTop: '4px' }}>Frames are cut by ffmpeg, then read against the rubric. A minute or two.</Meta>
        </div>
      )}

      {fc.refused && (
        <div style={css("margin-top:10px")}>
          <Eyebrow as="span" tone="gold">Nova will not read this one</Eyebrow>
          <div style={css("margin-top:6px;display:flex;flex-direction:column;gap:5px;font-size:12.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 82%, transparent)")}>
            {(fc.result?.problems || [fc.result?.why]).filter(Boolean).map((why, i) => <div key={i}>{why}</div>)}
          </div>
          <Meta tone="faint" style={{ display: 'block', marginTop: '7px' }}>Nothing was filed — a guess from a bad angle is worse than no review.</Meta>
          <div style={css("margin-top:9px;display:flex;gap:12px;align-items:center;flex-wrap:wrap")}>
            <label style={css("cursor:pointer;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:var(--nv-cy)")}>
              Try another clip
              <input type="file" accept="video/*" capture="environment" onChange={fc.pick} style={{ display: 'none' }} />
            </label>
            <TextAction compact tone="faint" onClick={fc.close}>Close</TextAction>
          </div>
        </div>
      )}

      {fc.done && (
        <div style={css("margin-top:10px")}>
          <div style={css("font-size:13px;line-height:1.55;color:var(--nv-ink)")}>{fc.result?.summary}</div>
          {!!fc.result?.points?.length && (
            <div style={css("margin-top:8px;display:flex;flex-direction:column;gap:4px")}>
              {fc.result.points.map((pt, i) => (
                <div key={i} style={css("display:flex;gap:8px;align-items:baseline;font-size:12.5px;line-height:1.5")}>
                  <span style={{ flex: 'none', font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)', color: pt.verdict === 'fix' ? 'var(--nv-warn)' : pt.verdict === 'watch' ? 'var(--nv-gold)' : 'var(--nv-good)' }}>{pt.verdict}</span>
                  <span style={css("min-width:0")}><b>{pt.name}</b> — {pt.saw}</span>
                </div>
              ))}
            </div>
          )}
          <Meta tone="faint" style={{ display: 'block', marginTop: '8px' }}>
            The full read-back is waiting in your Inbox — approve it to keep it against this lift.
          </Meta>
          <div style={css("margin-top:9px;display:flex;gap:12px;align-items:center")}>
            <TextAction compact onClick={fc.openInbox}>Open the review</TextAction>
            <TextAction compact tone="faint" onClick={fc.close}>Close</TextAction>
          </div>
        </div>
      )}

      {fc.error && <div style={css("margin-top:9px;font-size:12px;color:var(--nv-warn)")}>{fc.error}</div>}
    </div>
  );
}
