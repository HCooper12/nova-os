import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Workouts({ v }) {
  return (
    <div style={v.wrapWorkouts} data-screen-label="Workouts">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>VI.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>VAULT · TRAINING</span>
        </div>
        <span style={css("display:flex;align-items:center;gap:8px;font:500 10px 'JetBrains Mono',monospace;letter-spacing:.14em;color:#6be5f5")}><span style={css("width:5px;height:5px;border-radius:50%;background:#6be5f5;animation:novaPulse 2s infinite")}></span>COACH IS LIVE</span>
      </div>
      <h1 style={css("margin:18px 0 0;font:400 38px/1.1 'Instrument Serif',serif")}>Push day, <span style={css("font-style:italic;color:#d8b573")}>week six.</span></h1>
      <div style={css("display:flex;gap:8px;margin-top:18px;overflow-x:auto;padding-bottom:4px")}>
        {v.week.map((d) => (
          <div key={d.day} style={d.style}><div style={css("font:500 9px 'JetBrains Mono',monospace;letter-spacing:.14em")}>{d.day}</div><div style={css("margin-top:4px;font-size:11.5px")}>{d.label}</div></div>
        ))}
      </div>
      <div style={v.gridWork}>
        <div style={css("border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:20px 24px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9)")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
            <span style={css("font:italic 400 20px 'Instrument Serif',serif;color:#d8b573")}>Today's session</span>
            <span style={css("font:400 10px 'JetBrains Mono',monospace;color:rgba(236,229,218,.45)")}>{v.planMeta}</span>
          </div>
          {v.planNoteOn && (
            <div style={css("margin-top:12px;display:flex;align-items:center;gap:9px;font-size:12px;color:#6be5f5;border:1px solid rgba(107,229,245,.25);border-radius:8px;padding:8px 12px;background:rgba(107,229,245,.05);animation:fadeUp .3s ease-out")}><span>◆</span><span>{v.planNote}</span></div>
          )}
          <div style={css("margin-top:14px;display:flex;flex-direction:column")}>
            {v.plan.map((ex) => (
              <div key={ex.idx} style={css("display:flex;align-items:baseline;gap:14px;padding:11px 0;border-bottom:1px solid rgba(236,229,218,.06)")}>
                <span style={css("font:500 10px 'JetBrains Mono',monospace;color:rgba(216,181,115,.6);width:20px")}>{ex.idx}</span>
                <span style={css("font-size:14px;font-weight:500")}>{ex.name}</span>
                {ex.pr && <span style={css("font:500 9px 'JetBrains Mono',monospace;letter-spacing:.1em;color:#d8b573;border:1px solid rgba(216,181,115,.35);border-radius:5px;padding:2px 7px")}>PR WATCH</span>}
                <span style={css("margin-left:auto;font:400 12px 'JetBrains Mono',monospace;color:rgba(236,229,218,.6);font-variant-numeric:tabular-nums")}>{ex.scheme}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={css("border:1px solid rgba(107,229,245,.18);border-radius:14px;padding:20px 22px;background:linear-gradient(180deg,rgba(107,229,245,.05),rgba(107,229,245,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.05);display:flex;flex-direction:column;min-height:420px")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
            <span style={css("font:italic 400 20px 'Instrument Serif',serif;color:#6be5f5")}>Ask Coach</span>
            <span style={css("font:400 9px 'JetBrains Mono',monospace;letter-spacing:.18em;color:rgba(236,229,218,.4)")}>EDITS WRITE BACK TO VAULT</span>
          </div>
          <div style={css("flex:1;overflow-y:auto;margin-top:14px;display:flex;flex-direction:column;gap:12px")}>
            {v.coachMsgs.map((m, i) => (
              <div key={i} style={m.wrapStyle}><div style={m.bubbleStyle}>{m.text}{m.typing && <span style={css("color:#6be5f5")}>▍</span>}</div></div>
            ))}
          </div>
          <div style={css("display:flex;gap:8px;margin-top:14px")}>
            <Interactive
              as="input"
              value={v.coachInput}
              onChange={v.setCoachInput}
              onKeyDown={v.coachKey}
              placeholder='Try "make it shorter" or "go harder"…'
              base="flex:1;background:rgba(0,0,0,.32);border:1px solid rgba(236,229,218,.12);border-radius:9px;padding:10px 14px;color:#ece5da;font-size:12.5px;font-family:'Instrument Sans',sans-serif;outline:none"
              focusStyle="border-color:rgba(107,229,245,.5)"
            />
            <Interactive as="span" onClick={v.sendCoach} base="cursor:pointer;display:flex;align-items:center;font:500 11px 'JetBrains Mono',monospace;padding:0 16px;border-radius:9px;background:#6be5f5;color:#0a2830" hoverStyle="background:#9deefa">SEND</Interactive>
          </div>
        </div>
      </div>
    </div>
  );
}
