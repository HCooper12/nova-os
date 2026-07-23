import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Journal({ v }) {
  return (
    <div style={v.wrapJournal} data-screen-label="Journal">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px var(--nv-font-mono);letter-spacing:.14em;color:var(--nv-acc)")}>XI.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px var(--nv-font-mono);letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>VAULT · JOURNAL</span>
        </div>
        <span style={css("font:400 10px var(--nv-font-mono);letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.journalHeaderLabel}</span>
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Write it <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>down.</span></h1>

      <div style={css("margin-top:20px;border:1px solid color-mix(in srgb, var(--nv-vi) 25%, transparent);border-radius:14px;padding:18px 20px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-vi) 06%, transparent),color-mix(in srgb, var(--nv-vi) 01%, transparent))")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px")}>
          <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-vi)")}>NEW ENTRY</span>
          <Interactive
            as="span"
            onClick={v.journalPromptBusy ? undefined : v.generateJournalPrompt}
            base={{ cursor: 'pointer', font: "500 10px var(--nv-font-mono)", padding: '7px 13px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-vi) 40%, transparent)', color: '#cbb6f2', background: 'color-mix(in srgb, var(--nv-vi) 08%, transparent)', opacity: v.journalPromptBusy ? .6 : 1 }}
            hoverStyle={{ background: 'color-mix(in srgb, var(--nv-vi) 18%, transparent)' }}
          >
            {v.journalPromptBusy ? 'THINKING…' : '✦ Generate a prompt'}
          </Interactive>
        </div>
        {v.journalPromptText && (
          <div style={css("margin-top:12px;font:italic 400 15px/1.5 var(--nv-font-serif);color:#cbb6f2")}>{v.journalPromptText}</div>
        )}
        <textarea
          value={v.journalComposerText}
          onChange={v.setJournalComposerText}
          placeholder="What's on your mind today…"
          style={css("margin-top:14px;width:100%;box-sizing:border-box;height:120px;resize:vertical;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:12px 14px;color:var(--nv-ink);font-size:13.5px;font-family:var(--nv-font-ui);line-height:1.6;outline:none")}
        />
        {v.journalSaveError && (
          <div style={css("margin-top:8px;font-size:12px;color:var(--nv-warn)")}>{v.journalSaveError}</div>
        )}
        <div style={css("margin-top:10px;display:flex;justify-content:flex-end")}>
          <Interactive
            as="span"
            onClick={v.journalSaveBusy ? undefined : v.submitJournalEntry}
            base={{ cursor: 'pointer', font: "500 11px var(--nv-font-mono)", padding: '9px 18px', borderRadius: '8px', background: 'var(--nv-gold)', color: '#1a1322', opacity: v.journalSaveBusy ? .6 : 1 }}
            hoverStyle={{ background: 'color-mix(in srgb, var(--nv-gold) 85%, white)' }}
          >
            {v.journalSaveBusy ? 'Saving…' : 'Save entry'}
          </Interactive>
        </div>
      </div>

      {v.journalDays.length === 0 ? (
        <div style={css("margin-top:40px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
          {v.journalLoaded ? 'No journal entries yet — write your first one above.' : 'Loading your journal…'}
        </div>
      ) : (
        <div style={css("margin-top:26px;display:flex;flex-direction:column;gap:10px")}>
          {/* category filter — personal reflections never lost among training logs */}
          <div style={css("display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px")}>
            {v.journalFilters.map((f) => (
              <Interactive key={f.key} as="span" onClick={f.go}
                base={{ cursor: 'pointer', font: "500 9.5px var(--nv-font-mono)", letterSpacing: '.14em', padding: '7px 14px', borderRadius: '14px', border: f.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', color: f.active ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', background: f.active ? 'var(--nv-acc-bg)' : 'none' }}
                hoverStyle={{ color: 'var(--nv-ink)' }}>{f.label}</Interactive>
            ))}
          </div>
          {v.journalDays.length === 0 && v.journalFilterActive && (
            <div style={css("margin-top:16px;text-align:center;font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Nothing in this category yet.</div>
          )}
          {v.journalDays.map((d) => (
            <div key={d.date} style={css("border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:12px;padding:14px 18px;background:rgba(255,255,255,.02)")}>
              <Interactive as="div" onClick={d.toggle} base="cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;gap:10px" hoverStyle={{}}>
                <span style={css("font-size:13.5px;font-weight:500")}>{d.date}</span>
                <span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent);text-align:right;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 10px")}>{d.open ? '' : d.preview}</span>
                <span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{d.count} {d.count === 1 ? 'entry' : 'entries'} {d.open ? '▲' : '▼'}</span>
              </Interactive>
              {d.open && (
                <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:12px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent);padding-top:12px")}>
                  {d.sections.map((s, i) => (
                    <div key={i}>
                      <div style={css("display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:500 9.5px var(--nv-font-mono);letter-spacing:.06em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
                        <span>{s.time}</span>
                        {s.categoryMeta && (
                          <span style={{ font: "600 8px var(--nv-font-mono)", letterSpacing: '.12em', padding: '2px 8px', borderRadius: '5px', color: `rgba(${s.categoryMeta.hue},.95)`, background: `rgba(${s.categoryMeta.hue},.12)` }}>{s.categoryMeta.label}</span>
                        )}
                        {s.heading && <span>— {s.heading}</span>}
                      </div>
                      <div style={css("margin-top:4px;font-size:13px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>{s.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
