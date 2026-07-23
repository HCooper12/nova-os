import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

const KIND_COLOR = { new: '#5aa87c', updated: 'var(--nv-gold)' };

function ChangeCard({ change }) {
  return (
    <div style={css("border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:10px;overflow:hidden;background:var(--nv-well)")}>
      <div style={css("display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)")}>
        <span style={css(`font:500 8.5px var(--nv-font-mono);letter-spacing:.1em;color:${KIND_COLOR[change.kind]};border:1px solid ${KIND_COLOR[change.kind]};border-radius:5px;padding:2px 7px;flex:none`)}>{change.kind.toUpperCase()}</span>
        <span style={css("font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 85%, transparent);word-break:break-all")}>{change.path}</span>
      </div>
      <div style={css("max-height:180px;overflow-y:auto;padding:12px 14px;font:400 11.5px/1.6 var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 70%, transparent);white-space:pre-wrap")}>{change.content}</div>
    </div>
  );
}

export function IngestReview({ v }) {
  const processing = v.ingestStatus === 'staging' || v.ingestStatus === 'running';
  const applying = v.ingestStatus === 'applying';
  return (
    <div role="dialog" aria-modal="true" aria-label="Review ingest changes" onClick={processing ? undefined : v.closeIngestReview} style={css("position:fixed;inset:0;background:rgba(8,5,12,.72);backdrop-filter:blur(6px);z-index:60;display:flex;align-items:center;justify-content:center;padding:40px;overflow-y:auto")}>
      <div onClick={v.stopClick} style={css("width:700px;max-width:94vw;max-height:88vh;overflow-y:auto;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),inset 0 1px 0 var(--nv-spec);animation:fadeUp .3s ease-out;padding:26px 28px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center")}>
          <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.24em;color:var(--nv-gold)")}>INGEST · REVIEW</span>
          {!processing && !applying && (
            <Interactive as="span" onClick={v.closeIngestReview} base="cursor:pointer;font:500 11px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 50%, transparent);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:7px;padding:5px 10px" hoverStyle="color:var(--nv-ink)">ESC</Interactive>
          )}
        </div>

        {processing && (
          <div style={css("padding:50px 10px;display:flex;flex-direction:column;align-items:center;gap:16px")}>
            <div style={css("display:flex;gap:5px")}>
              <span style={css("width:6px;height:6px;border-radius:50%;background:var(--nv-gold);animation:dotBlink 1s infinite")}></span>
              <span style={css("width:6px;height:6px;border-radius:50%;background:var(--nv-gold);animation:dotBlink 1s .2s infinite")}></span>
              <span style={css("width:6px;height:6px;border-radius:50%;background:var(--nv-gold);animation:dotBlink 1s .4s infinite")}></span>
            </div>
            <div style={css("font-size:13px;color:color-mix(in srgb, var(--nv-ink) 60%, transparent);text-align:center")}>{v.ingestStatus === 'staging' ? 'Preparing a scratch copy of your vault…' : 'Reading it and drafting pages — this can take a minute or two…'}</div>
          </div>
        )}

        {v.ingestStatus === 'error' && (
          <div style={css("margin-top:20px")}>
            <div style={css("font-size:13px;color:var(--nv-warn);line-height:1.6")}>{v.ingestError}</div>
            <div style={css("margin-top:16px")}>
              <Interactive as="span" onClick={v.closeIngestReview} base="cursor:pointer;font-size:12.5px;padding:9px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);color:color-mix(in srgb, var(--nv-ink) 70%, transparent)" hoverStyle="background:rgba(255,255,255,.05)">Dismiss</Interactive>
            </div>
          </div>
        )}

        {(v.ingestStatus === 'ready' || applying) && (
          <>
            <h2 style={css("margin:16px 0 0;font:400 24px var(--nv-font-serif)")}>Proposed changes</h2>
            <div style={css("margin-top:10px;font-size:13px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 80%, transparent);white-space:pre-wrap")}>{v.ingestPreview.summary}</div>
            <div style={css("margin-top:10px;font-size:11px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Cost: ${v.ingestPreview.cost.toFixed(3)}</div>

            <div style={css("margin-top:18px;display:flex;flex-direction:column;gap:10px")}>
              {v.ingestPreview.changes.map((c, i) => <ChangeCard key={i} change={c} />)}
            </div>

            <div style={css("margin-top:20px;display:flex;gap:10px")}>
              <Interactive as="span" onClick={applying ? undefined : v.discardIngest} base={`cursor:${applying ? 'default' : 'pointer'};font-size:12.5px;padding:10px 18px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);color:color-mix(in srgb, var(--nv-ink) 70%, transparent);opacity:${applying ? .5 : 1}`} hoverStyle={applying ? '' : 'background:rgba(255,255,255,.05)'}>Discard</Interactive>
              <Interactive as="span" onClick={applying ? undefined : v.approveIngest} base={`cursor:${applying ? 'default' : 'pointer'};font-size:12.5px;font-weight:500;padding:10px 18px;border-radius:8px;background:#5aa87c;color:#0f1f16;opacity:${applying ? .7 : 1}`} hoverStyle={applying ? '' : 'background:#6fc294'}>{applying ? 'Writing to vault…' : 'Approve — write to vault'}</Interactive>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
