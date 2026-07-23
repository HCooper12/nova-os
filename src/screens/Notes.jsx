import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Notes({ v }) {
  return (
    <div style={v.wrapNotes} data-screen-label="Notes">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px var(--nv-font-mono);letter-spacing:.14em;color:var(--nv-acc)")}>X.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px var(--nv-font-mono);letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>VAULT · NOTES</span>
        </div>
        <span style={css("font:400 10px var(--nv-font-mono);letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.notesHeaderLabel}</span>
      </div>
      <div style={v.gridNotes}>
        <div style={v.noteListCard}>
          <div style={css("padding:14px 14px 10px")}>
            <Interactive
              as="input"
              value={v.noteQuery}
              onChange={v.setNoteQuery}
              placeholder="Search the vault…"
              base="width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:9px 13px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none"
              focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
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
                <div style={css("margin-top:3px;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{n.date}</div>
              </Interactive>
            ))}
          </div>
        </div>
        <div style={css("border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:26px 32px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec);overflow-y:auto")}>
          <div style={css(`font:500 9px var(--nv-font-mono);letter-spacing:.22em;color:${v.openNoteTypeColor}`)}>{v.openNoteType}</div>
          <h2 style={css("margin:10px 0 0;font:400 32px/1.15 var(--nv-font-serif)")}>{v.openNoteTitle}</h2>
          <div style={css("margin-top:8px;font:400 10.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{v.openNoteMeta}</div>
          {v.openNoteUrl && (
            <a href={v.openNoteUrl} target="_blank" rel="noopener noreferrer" style={css("margin-top:12px;display:inline-flex;align-items:center;gap:7px;width:fit-content;cursor:pointer;font-size:12px;font-weight:500;padding:7px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy);background:color-mix(in srgb, var(--nv-cy) 06%, transparent)")}>▶ Watch source</a>
          )}
          {v.openNoteStudio && (
            <div style={css("margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap")}>
              <Interactive as="span" onClick={v.openNoteStudio.advance} title="Advance along the pipeline: seed → outlining → scripting → shipped"
                base={{ cursor: 'pointer', font: "600 9px var(--nv-font-mono)", letterSpacing: '.14em', padding: '5px 12px', borderRadius: '6px', color: 'var(--nv-vi)', border: '1px solid color-mix(in srgb, var(--nv-vi) 45%, transparent)', background: 'color-mix(in srgb, var(--nv-vi) 08%, transparent)' }}
                hoverStyle={{ background: 'color-mix(in srgb, var(--nv-vi) 16%, transparent)' }}
              >STUDIO · {v.openNoteStudio.status} →</Interactive>
              <Interactive as="span" onClick={v.openNoteStudio.outlineBusy ? undefined : v.openNoteStudio.outline}
                base={{ cursor: 'pointer', font: "600 9px var(--nv-font-mono)", letterSpacing: '.14em', padding: '5px 12px', borderRadius: '6px', color: 'var(--nv-gold)', border: '1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent)', opacity: v.openNoteStudio.outlineBusy ? 0.5 : 1 }}
                hoverStyle={{ background: 'color-mix(in srgb, var(--nv-gold) 08%, transparent)' }}
              >{v.openNoteStudio.outlineBusy ? 'DRAFTING…' : 'DRAFT OUTLINE'}</Interactive>
            </div>
          )}
          <div style={css("margin-top:20px;max-width:640px;display:flex;flex-direction:column;gap:14px")}>
            {v.openNoteParas.map((p, i) => (
              <p key={i} style={css("margin:0;font-size:14.5px;line-height:1.75;color:color-mix(in srgb, var(--nv-ink) 85%, transparent);text-wrap:pretty")}>{p.text}</p>
            ))}
          </div>

          {v.reviewShowReflect && (
            <div style={css("margin-top:24px;max-width:640px;padding:16px 18px;border-radius:12px;border:1px solid color-mix(in srgb, var(--nv-vi) 35%, transparent);background:color-mix(in srgb, var(--nv-vi) 06%, transparent)")}>
              <div style={css("display:flex;justify-content:space-between;align-items:center")}>
                <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.24em;color:var(--nv-vi)")}>TODAY'S REVIEW · SUMMARY</span>
                <Interactive as="span" onClick={v.toggleReviewReflect} base={{ cursor: 'pointer', fontSize: '11.5px', fontWeight: 500, padding: '6px 12px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent)', color: v.reviewReflectOpen ? 'var(--nv-ink)' : 'color-mix(in srgb, var(--nv-ink) 60%, transparent)', background: v.reviewReflectOpen ? 'rgba(255,255,255,.06)' : 'none' }} hoverStyle={{ color: 'var(--nv-ink)' }}>{v.reviewReflectOpen ? 'Close' : 'Reflect'}</Interactive>
              </div>
              <div style={css("margin-top:10px;font:400 15px/1.6 var(--nv-font-serif);color:color-mix(in srgb, var(--nv-ink) 90%, transparent);text-wrap:pretty")}>{v.reviewConcept}</div>
              {v.reviewReflectOpen && (
                <div style={css("margin-top:16px;padding-top:16px;border-top:1px solid color-mix(in srgb, var(--nv-vi) 15%, transparent)")}>
                  <div style={css("display:flex;justify-content:flex-end")}>
                    <Interactive
                      as="span"
                      onClick={v.reviewReflectPromptBusy ? undefined : v.generateReviewReflectPrompt}
                      base={{ cursor: 'pointer', font: "500 9.5px var(--nv-font-mono)", padding: '5px 10px', borderRadius: '6px', color: '#cbb6f2', opacity: v.reviewReflectPromptBusy ? .6 : 1 }}
                      hoverStyle={{ background: 'color-mix(in srgb, var(--nv-vi) 10%, transparent)' }}
                    >
                      {v.reviewReflectPromptBusy ? 'THINKING…' : '✦ Generate a prompt'}
                    </Interactive>
                  </div>
                  {v.reviewReflectPromptText && (
                    <div style={css("font:italic 400 15px/1.5 var(--nv-font-serif);color:#cbb6f2;margin-bottom:10px")}>{v.reviewReflectPromptText}</div>
                  )}
                  <textarea
                    value={v.reviewReflectText}
                    onChange={v.setReviewReflectText}
                    placeholder="Your reflection on this…"
                    style={css("width:100%;box-sizing:border-box;height:110px;resize:vertical;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:11px 14px;color:var(--nv-ink);font-size:13.5px;font-family:var(--nv-font-ui);line-height:1.6;outline:none")}
                  />
                  <div style={css("margin-top:10px;display:flex;justify-content:flex-end")}>
                    <Interactive
                      as="span"
                      onClick={v.reviewReflectBusy ? undefined : v.saveReviewReflection}
                      base={{ cursor: 'pointer', font: "500 10.5px var(--nv-font-mono)", padding: '7px 14px', borderRadius: '7px', background: 'var(--nv-vi)', color: '#1a1322', opacity: v.reviewReflectBusy ? .6 : 1 }}
                      hoverStyle={{ background: '#cbb6f2' }}
                    >
                      {v.reviewReflectBusy ? 'Saving…' : 'Save reflection'}
                    </Interactive>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={css("margin-top:26px;padding-top:16px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}>
            <div style={css("font:500 9px var(--nv-font-mono);letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>LINKED IN GALAXY</div>
            <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:11px")}>
              {v.openNoteLinks.map((l, i) => (
                <Interactive key={i} as="span" onClick={l.go} base="cursor:pointer;font-size:12px;padding:6px 12px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 05%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 12%, transparent)">⟡ {l.label}</Interactive>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
