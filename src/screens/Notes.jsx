import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Notes({ v }) {
  return (
    <div style={v.wrapNotes} data-screen-label="Notes">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>VII.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>VAULT · NOTES</span>
        </div>
        <span style={css("font:400 10px 'JetBrains Mono',monospace;letter-spacing:.12em;color:rgba(236,229,218,.45)")}>{v.notesHeaderLabel}</span>
      </div>
      <div style={v.gridNotes}>
        <div style={v.noteListCard}>
          <div style={css("padding:14px 14px 10px")}>
            <Interactive
              as="input"
              value={v.noteQuery}
              onChange={v.setNoteQuery}
              placeholder="Search the vault…"
              base="width:100%;box-sizing:border-box;background:rgba(0,0,0,.32);border:1px solid rgba(236,229,218,.12);border-radius:9px;padding:9px 13px;color:#ece5da;font-size:12.5px;font-family:'Instrument Sans',sans-serif;outline:none"
              focusStyle="border-color:rgba(216,181,115,.5)"
            />
            <div style={css("display:flex;flex-wrap:wrap;gap:6px;margin-top:10px")}>
              {v.noteFilters.map((f) => (
                <span key={f.label} onClick={f.go} style={f.style}>{f.label}</span>
              ))}
            </div>
          </div>
          <div style={css("flex:1;overflow-y:auto;padding:0 8px 10px;display:flex;flex-direction:column;gap:2px")}>
            {v.noteList.map((n, i) => (
              <Interactive key={i} onClick={n.select} base={n.style} hoverStyle="background:rgba(255,255,255,.05)">
                <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}><span style={css("font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{n.title}</span><span style={n.typeStyle}>{n.type}</span></div>
                <div style={css("margin-top:3px;font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.4)")}>{n.date}</div>
              </Interactive>
            ))}
          </div>
        </div>
        <div style={css("border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:26px 32px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.05);overflow-y:auto")}>
          <div style={css(`font:500 9px 'JetBrains Mono',monospace;letter-spacing:.22em;color:${v.openNoteTypeColor}`)}>{v.openNoteType}</div>
          <h2 style={css("margin:10px 0 0;font:400 32px/1.15 'Instrument Serif',serif")}>{v.openNoteTitle}</h2>
          <div style={css("margin-top:8px;font:400 10.5px 'JetBrains Mono',monospace;color:rgba(236,229,218,.4)")}>{v.openNoteMeta}</div>
          {v.openNoteUrl && (
            <a href={v.openNoteUrl} target="_blank" rel="noopener noreferrer" style={css("margin-top:12px;display:inline-flex;align-items:center;gap:7px;width:fit-content;cursor:pointer;font-size:12px;font-weight:500;padding:7px 14px;border-radius:8px;border:1px solid rgba(107,229,245,.4);color:#6be5f5;background:rgba(107,229,245,.06)")}>▶ Watch source</a>
          )}
          <div style={css("margin-top:20px;max-width:640px;display:flex;flex-direction:column;gap:14px")}>
            {v.openNoteParas.map((p, i) => (
              <p key={i} style={css("margin:0;font-size:14.5px;line-height:1.75;color:rgba(236,229,218,.85);text-wrap:pretty")}>{p.text}</p>
            ))}
          </div>

          {v.reviewShowReflect && (
            <div style={css("margin-top:24px;max-width:640px;padding:16px 18px;border-radius:12px;border:1px solid rgba(138,106,209,.35);background:rgba(138,106,209,.06)")}>
              <div style={css("display:flex;justify-content:space-between;align-items:center")}>
                <span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.24em;color:#b9a1e8")}>TODAY'S REVIEW · SUMMARY</span>
                <Interactive as="span" onClick={v.toggleReviewReflect} base={{ cursor: 'pointer', fontSize: '11.5px', fontWeight: 500, padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(236,229,218,.16)', color: v.reviewReflectOpen ? '#ece5da' : 'rgba(236,229,218,.6)', background: v.reviewReflectOpen ? 'rgba(255,255,255,.06)' : 'none' }} hoverStyle={{ color: '#ece5da' }}>{v.reviewReflectOpen ? 'Close' : 'Reflect'}</Interactive>
              </div>
              <div style={css("margin-top:10px;font:400 15px/1.6 'Instrument Serif',serif;color:rgba(236,229,218,.9);text-wrap:pretty")}>{v.reviewConcept}</div>
              {v.reviewReflectOpen && (
                <div style={css("margin-top:16px;padding-top:16px;border-top:1px solid rgba(138,106,209,.15)")}>
                  <div style={css("display:flex;justify-content:flex-end")}>
                    <Interactive
                      as="span"
                      onClick={v.reviewReflectPromptBusy ? undefined : v.generateReviewReflectPrompt}
                      base={{ cursor: 'pointer', font: "500 9.5px 'JetBrains Mono',monospace", padding: '5px 10px', borderRadius: '6px', color: '#cbb6f2', opacity: v.reviewReflectPromptBusy ? .6 : 1 }}
                      hoverStyle={{ background: 'rgba(138,106,209,.1)' }}
                    >
                      {v.reviewReflectPromptBusy ? 'THINKING…' : '✦ Generate a prompt'}
                    </Interactive>
                  </div>
                  {v.reviewReflectPromptText && (
                    <div style={css("font:italic 400 15px/1.5 'Instrument Serif',serif;color:#cbb6f2;margin-bottom:10px")}>{v.reviewReflectPromptText}</div>
                  )}
                  <textarea
                    value={v.reviewReflectText}
                    onChange={v.setReviewReflectText}
                    placeholder="Your reflection on this…"
                    style={css("width:100%;box-sizing:border-box;height:110px;resize:vertical;background:rgba(0,0,0,.28);border:1px solid rgba(236,229,218,.12);border-radius:8px;padding:11px 14px;color:#ece5da;font-size:13.5px;font-family:'Instrument Sans',sans-serif;line-height:1.6;outline:none")}
                  />
                  <div style={css("margin-top:10px;display:flex;justify-content:flex-end")}>
                    <Interactive
                      as="span"
                      onClick={v.reviewReflectBusy ? undefined : v.saveReviewReflection}
                      base={{ cursor: 'pointer', font: "500 10.5px 'JetBrains Mono',monospace", padding: '7px 14px', borderRadius: '7px', background: '#b9a1e8', color: '#1a1322', opacity: v.reviewReflectBusy ? .6 : 1 }}
                      hoverStyle={{ background: '#cbb6f2' }}
                    >
                      {v.reviewReflectBusy ? 'Saving…' : 'Save reflection'}
                    </Interactive>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={css("margin-top:26px;padding-top:16px;border-top:1px solid rgba(236,229,218,.08)")}>
            <div style={css("font:500 9px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.4)")}>LINKED IN GALAXY</div>
            <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:11px")}>
              {v.openNoteLinks.map((l, i) => (
                <Interactive key={i} as="span" onClick={l.go} base="cursor:pointer;font-size:12px;padding:6px 12px;border-radius:8px;border:1px solid rgba(216,181,115,.3);color:#d8b573;background:rgba(216,181,115,.05)" hoverStyle="background:rgba(216,181,115,.12)">⟡ {l.label}</Interactive>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
