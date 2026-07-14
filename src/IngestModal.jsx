import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function IngestModal({ v }) {
  return (
    <div onClick={v.closeIngestModal} style={css("position:fixed;inset:0;background:rgba(8,5,12,.72);backdrop-filter:blur(6px);z-index:60;display:flex;align-items:center;justify-content:center;padding:40px;overflow-y:auto")}>
      <div onClick={v.stopClick} style={css("width:640px;max-width:94vw;max-height:88vh;overflow-y:auto;border:1px solid rgba(216,181,115,.28);border-radius:18px;background:linear-gradient(180deg,#221a2c,#16101e);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.07);animation:fadeUp .3s ease-out;padding:26px 28px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center")}>
          <span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.24em;color:#d8b573")}>INGEST · NEW SOURCE</span>
          <Interactive as="span" onClick={v.closeIngestModal} base="cursor:pointer;font:500 11px 'JetBrains Mono',monospace;color:rgba(236,229,218,.5);border:1px solid rgba(236,229,218,.14);border-radius:7px;padding:5px 10px" hoverStyle="color:#ece5da">ESC</Interactive>
        </div>
        <h2 style={css("margin:14px 0 0;font:400 26px 'Instrument Serif',serif")}>Paste a transcript</h2>
        <div style={css("margin-top:8px;font-size:12.5px;color:rgba(236,229,218,.55);line-height:1.6")}>
          Claude reads it, follows your vault's own <code>CLAUDE.md</code> schema, and drafts new/updated
          pages — nothing touches your real vault until you review and approve it.
        </div>

        <textarea
          value={v.ingestText}
          onChange={v.setIngestText}
          placeholder="Paste a podcast or video transcript here…"
          style={css("margin-top:16px;width:100%;box-sizing:border-box;height:260px;resize:vertical;background:rgba(0,0,0,.32);border:1px solid rgba(236,229,218,.12);border-radius:9px;padding:14px;color:#ece5da;font-size:13px;font-family:'JetBrains Mono',monospace;line-height:1.6;outline:none")}
        />

        <div style={css("margin-top:12px;font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.2em;color:rgba(236,229,218,.45)")}>SOURCE URL (OPTIONAL)</div>
        <Interactive
          as="input"
          value={v.ingestSourceUrl}
          onChange={v.setIngestSourceUrl}
          placeholder="https://youtube.com/watch?v=… — lets you jump back to the video from this page later"
          base="margin-top:6px;width:100%;box-sizing:border-box;background:rgba(0,0,0,.32);border:1px solid rgba(236,229,218,.12);border-radius:9px;padding:10px 14px;color:#ece5da;font-size:12.5px;font-family:'JetBrains Mono',monospace;outline:none"
          focusStyle="border-color:rgba(216,181,115,.5)"
        />

        <div style={css("margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
          <label style={css("cursor:pointer;font-size:12px;padding:9px 14px;border-radius:8px;border:1px solid rgba(236,229,218,.16);color:rgba(236,229,218,.7)")}>
            Upload .txt / .md
            <input type="file" accept=".txt,.md" onChange={v.onIngestFile} style={css("display:none")} />
          </label>
          <span style={css("font-size:11px;color:rgba(236,229,218,.4)")}>{v.ingestText.length.toLocaleString()} characters</span>
          <div style={css("margin-left:auto;display:flex;gap:10px")}>
            <Interactive as="span" onClick={v.closeIngestModal} base="cursor:pointer;font-size:12.5px;padding:9px 16px;border-radius:8px;border:1px solid rgba(236,229,218,.16);color:rgba(236,229,218,.7)" hoverStyle="background:rgba(255,255,255,.05)">Cancel</Interactive>
            <Interactive as="span" onClick={v.submitIngest} base="cursor:pointer;font-size:12.5px;font-weight:500;padding:9px 18px;border-radius:8px;background:#d8b573;color:#1a1322" hoverStyle="background:#e6c98f">Start ingest</Interactive>
          </div>
        </div>
      </div>
    </div>
  );
}
