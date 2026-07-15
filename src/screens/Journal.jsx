import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Journal({ v }) {
  return (
    <div style={v.wrapJournal} data-screen-label="Journal">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>IX.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>VAULT · JOURNAL</span>
        </div>
        <span style={css("font:400 10px 'JetBrains Mono',monospace;letter-spacing:.12em;color:rgba(236,229,218,.45)")}>{v.journalHeaderLabel}</span>
      </div>
      <h1 style={css("margin:18px 0 0;font:400 38px/1.1 'Instrument Serif',serif")}>Write it <span style={css("font-style:italic;color:#d8b573")}>down.</span></h1>

      <div style={css("margin-top:20px;border:1px solid rgba(138,106,209,.25);border-radius:14px;padding:18px 20px;background:linear-gradient(180deg,rgba(138,106,209,.06),rgba(138,106,209,.01))")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px")}>
          <span style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.2em;color:#b9a1e8")}>NEW ENTRY</span>
          <Interactive
            as="span"
            onClick={v.journalPromptBusy ? undefined : v.generateJournalPrompt}
            base={{ cursor: 'pointer', font: "500 10px 'JetBrains Mono',monospace", padding: '7px 13px', borderRadius: '7px', border: '1px solid rgba(138,106,209,.4)', color: '#cbb6f2', background: 'rgba(138,106,209,.08)', opacity: v.journalPromptBusy ? .6 : 1 }}
            hoverStyle={{ background: 'rgba(138,106,209,.18)' }}
          >
            {v.journalPromptBusy ? 'THINKING…' : '✦ Generate a prompt'}
          </Interactive>
        </div>
        {v.journalPromptText && (
          <div style={css("margin-top:12px;font:italic 400 15px/1.5 'Instrument Serif',serif;color:#cbb6f2")}>{v.journalPromptText}</div>
        )}
        <textarea
          value={v.journalComposerText}
          onChange={v.setJournalComposerText}
          placeholder="What's on your mind today…"
          style={css("margin-top:14px;width:100%;box-sizing:border-box;height:120px;resize:vertical;background:rgba(0,0,0,.3);border:1px solid rgba(236,229,218,.12);border-radius:9px;padding:12px 14px;color:#ece5da;font-size:13.5px;font-family:'Instrument Sans',sans-serif;line-height:1.6;outline:none")}
        />
        {v.journalSaveError && (
          <div style={css("margin-top:8px;font-size:12px;color:#e29b9b")}>{v.journalSaveError}</div>
        )}
        <div style={css("margin-top:10px;display:flex;justify-content:flex-end")}>
          <Interactive
            as="span"
            onClick={v.journalSaveBusy ? undefined : v.submitJournalEntry}
            base={{ cursor: 'pointer', font: "500 11px 'JetBrains Mono',monospace", padding: '9px 18px', borderRadius: '8px', background: '#d8b573', color: '#1a1322', opacity: v.journalSaveBusy ? .6 : 1 }}
            hoverStyle={{ background: '#e6c98f' }}
          >
            {v.journalSaveBusy ? 'Saving…' : 'Save entry'}
          </Interactive>
        </div>
      </div>

      {v.journalDays.length === 0 ? (
        <div style={css("margin-top:40px;text-align:center;font-size:13px;color:rgba(236,229,218,.4)")}>
          No journal entries yet — write your first one above.
        </div>
      ) : (
        <div style={css("margin-top:26px;display:flex;flex-direction:column;gap:10px")}>
          {v.journalDays.map((d) => (
            <div key={d.date} style={css("border:1px solid rgba(236,229,218,.09);border-radius:12px;padding:14px 18px;background:rgba(255,255,255,.02)")}>
              <Interactive as="div" onClick={d.toggle} base="cursor:pointer;display:flex;justify-content:space-between;align-items:baseline;gap:10px" hoverStyle={{}}>
                <span style={css("font-size:13.5px;font-weight:500")}>{d.date}</span>
                <span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.4);text-align:right;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 10px")}>{d.open ? '' : d.preview}</span>
                <span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.4)")}>{d.count} {d.count === 1 ? 'entry' : 'entries'} {d.open ? '▲' : '▼'}</span>
              </Interactive>
              {d.open && (
                <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:12px;border-top:1px solid rgba(236,229,218,.06);padding-top:12px")}>
                  {d.sections.map((s, i) => (
                    <div key={i}>
                      <div style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.06em;color:rgba(236,229,218,.4)")}>
                        {s.time}{s.heading ? ' — ' + s.heading : ''}
                      </div>
                      <div style={css("margin-top:4px;font-size:13px;line-height:1.6;color:rgba(236,229,218,.85)")}>{s.text}</div>
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
