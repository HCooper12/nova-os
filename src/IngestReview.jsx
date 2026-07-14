import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

const KIND_COLOR = { new: '#5aa87c', updated: '#d8b573' };

function ChangeCard({ change }) {
  return (
    <div style={css("border:1px solid rgba(236,229,218,.09);border-radius:10px;overflow:hidden;background:rgba(0,0,0,.22)")}>
      <div style={css("display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(236,229,218,.06)")}>
        <span style={css(`font:500 8.5px 'JetBrains Mono',monospace;letter-spacing:.1em;color:${KIND_COLOR[change.kind]};border:1px solid ${KIND_COLOR[change.kind]};border-radius:5px;padding:2px 7px;flex:none`)}>{change.kind.toUpperCase()}</span>
        <span style={css("font-size:12.5px;color:rgba(236,229,218,.85);word-break:break-all")}>{change.path}</span>
      </div>
      <div style={css("max-height:180px;overflow-y:auto;padding:12px 14px;font:400 11.5px/1.6 'JetBrains Mono',monospace;color:rgba(236,229,218,.7);white-space:pre-wrap")}>{change.content}</div>
    </div>
  );
}

export function IngestReview({ v }) {
  const processing = v.ingestStatus === 'staging' || v.ingestStatus === 'running';
  const applying = v.ingestStatus === 'applying';
  return (
    <div onClick={processing ? undefined : v.closeIngestReview} style={css("position:fixed;inset:0;background:rgba(8,5,12,.72);backdrop-filter:blur(6px);z-index:60;display:flex;align-items:center;justify-content:center;padding:40px;overflow-y:auto")}>
      <div onClick={v.stopClick} style={css("width:700px;max-width:94vw;max-height:88vh;overflow-y:auto;border:1px solid rgba(216,181,115,.28);border-radius:18px;background:linear-gradient(180deg,#221a2c,#16101e);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.07);animation:fadeUp .3s ease-out;padding:26px 28px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center")}>
          <span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.24em;color:#d8b573")}>INGEST · REVIEW</span>
          {!processing && !applying && (
            <Interactive as="span" onClick={v.closeIngestReview} base="cursor:pointer;font:500 11px 'JetBrains Mono',monospace;color:rgba(236,229,218,.5);border:1px solid rgba(236,229,218,.14);border-radius:7px;padding:5px 10px" hoverStyle="color:#ece5da">ESC</Interactive>
          )}
        </div>

        {processing && (
          <div style={css("padding:50px 10px;display:flex;flex-direction:column;align-items:center;gap:16px")}>
            <div style={css("display:flex;gap:5px")}>
              <span style={css("width:6px;height:6px;border-radius:50%;background:#d8b573;animation:dotBlink 1s infinite")}></span>
              <span style={css("width:6px;height:6px;border-radius:50%;background:#d8b573;animation:dotBlink 1s .2s infinite")}></span>
              <span style={css("width:6px;height:6px;border-radius:50%;background:#d8b573;animation:dotBlink 1s .4s infinite")}></span>
            </div>
            <div style={css("font-size:13px;color:rgba(236,229,218,.6);text-align:center")}>{v.ingestStatus === 'staging' ? 'Preparing a scratch copy of your vault…' : 'Reading the transcript and drafting pages — this can take a minute or two…'}</div>
          </div>
        )}

        {v.ingestStatus === 'error' && (
          <div style={css("margin-top:20px")}>
            <div style={css("font-size:13px;color:#c96f6f;line-height:1.6")}>{v.ingestError}</div>
            <div style={css("margin-top:16px")}>
              <Interactive as="span" onClick={v.closeIngestReview} base="cursor:pointer;font-size:12.5px;padding:9px 16px;border-radius:8px;border:1px solid rgba(236,229,218,.16);color:rgba(236,229,218,.7)" hoverStyle="background:rgba(255,255,255,.05)">Dismiss</Interactive>
            </div>
          </div>
        )}

        {(v.ingestStatus === 'ready' || applying) && (
          <>
            <h2 style={css("margin:16px 0 0;font:400 24px 'Instrument Serif',serif")}>Proposed changes</h2>
            <div style={css("margin-top:10px;font-size:13px;line-height:1.7;color:rgba(236,229,218,.8);white-space:pre-wrap")}>{v.ingestPreview.summary}</div>
            <div style={css("margin-top:10px;font-size:11px;color:rgba(236,229,218,.4)")}>Cost: ${v.ingestPreview.cost.toFixed(3)}</div>

            <div style={css("margin-top:18px;display:flex;flex-direction:column;gap:10px")}>
              {v.ingestPreview.changes.map((c, i) => <ChangeCard key={i} change={c} />)}
            </div>

            <div style={css("margin-top:20px;display:flex;gap:10px")}>
              <Interactive as="span" onClick={applying ? undefined : v.discardIngest} base={`cursor:${applying ? 'default' : 'pointer'};font-size:12.5px;padding:10px 18px;border-radius:8px;border:1px solid rgba(236,229,218,.16);color:rgba(236,229,218,.7);opacity:${applying ? .5 : 1}`} hoverStyle={applying ? '' : 'background:rgba(255,255,255,.05)'}>Discard</Interactive>
              <Interactive as="span" onClick={applying ? undefined : v.approveIngest} base={`cursor:${applying ? 'default' : 'pointer'};font-size:12.5px;font-weight:500;padding:10px 18px;border-radius:8px;background:#5aa87c;color:#0f1f16;opacity:${applying ? .7 : 1}`} hoverStyle={applying ? '' : 'background:#6fc294'}>{applying ? 'Writing to vault…' : 'Approve — write to vault'}</Interactive>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
