import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function IngestModal({ v }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Ingest a transcript" onClick={v.closeIngestModal} style={css("position:fixed;inset:0;background:rgba(8,5,12,.72);backdrop-filter:blur(6px);z-index:60;display:flex;align-items:center;justify-content:center;padding:40px;overflow-y:auto")}>
      <div onClick={v.stopClick} style={css("width:640px;max-width:94vw;max-height:88vh;overflow-y:auto;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),inset 0 1px 0 var(--nv-spec);animation:fadeUp .3s ease-out;padding:26px 28px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center")}>
          <span style={css("font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.24em;color:var(--nv-gold)")}>ADD · NEW CONTENT</span>
          <Interactive as="span" onClick={v.closeIngestModal} base="cursor:pointer;font:500 11px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 50%, transparent);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:7px;padding:5px 10px" hoverStyle="color:var(--nv-ink)">ESC</Interactive>
        </div>
        <h2 style={css("margin:14px 0 0;font:400 26px 'Instrument Serif',serif")}>Add to your vault</h2>
        <div style={css("margin-top:8px;font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);line-height:1.6")}>
          A transcript, an article, or just a note or idea that came to mind — Claude reads it, decides
          the right page type per your vault's own <code>CLAUDE.md</code>, and drafts new/updated pages.
          Nothing touches your real vault until you review and approve it.
        </div>

        <textarea
          value={v.ingestText}
          onChange={v.setIngestText}
          placeholder="Paste a transcript, article, or your own note or thought here…"
          style={css("margin-top:16px;width:100%;box-sizing:border-box;height:260px;resize:vertical;background:rgba(0,0,0,.32);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:14px;color:var(--nv-ink);font-size:13px;font-family:'IBM Plex Mono',monospace;line-height:1.6;outline:none")}
        />

        <div style={css("margin-top:12px;font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>SOURCE URL (OPTIONAL — SKIP FOR YOUR OWN NOTES)</div>
        <Interactive
          as="input"
          value={v.ingestSourceUrl}
          onChange={v.setIngestSourceUrl}
          placeholder="https://youtube.com/watch?v=… — lets you jump back to the video from this page later"
          base="margin-top:6px;width:100%;box-sizing:border-box;background:rgba(0,0,0,.32);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font-size:12.5px;font-family:'IBM Plex Mono',monospace;outline:none"
          focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
        />

        <div style={css("margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
          <label style={css("cursor:pointer;font-size:12px;padding:9px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);color:color-mix(in srgb, var(--nv-ink) 70%, transparent)")}>
            Upload .txt / .md
            <input type="file" accept=".txt,.md" onChange={v.onIngestFile} style={css("display:none")} />
          </label>
          <span style={css("font-size:11px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{v.ingestText.length.toLocaleString()} characters</span>
          <div style={css("margin-left:auto;display:flex;gap:10px")}>
            <Interactive as="span" onClick={v.closeIngestModal} base="cursor:pointer;font-size:12.5px;padding:9px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);color:color-mix(in srgb, var(--nv-ink) 70%, transparent)" hoverStyle="background:rgba(255,255,255,.05)">Cancel</Interactive>
            <Interactive as="span" onClick={v.submitIngest} base="cursor:pointer;font-size:12.5px;font-weight:500;padding:9px 18px;border-radius:8px;background:var(--nv-gold);color:#1a1322" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 85%, white)">Add to vault</Interactive>
          </div>
        </div>
      </div>
    </div>
  );
}
