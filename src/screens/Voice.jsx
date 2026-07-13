import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Voice({ v }) {
  return (
    <div style={v.wrapVoice} data-screen-label="Voice">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>II.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>NEURAL LINK · VOICE</span>
        </div>
        <div style={css("font:400 26px 'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;color:rgba(236,229,218,.85)")}>{v.clock}</div>
      </div>
      <div style={css("flex:1;display:flex;flex-wrap:wrap;gap:28px;align-items:center;justify-content:center;margin-top:10px;overflow-y:auto")}>
        <div style={css("width:230px;flex:none;display:flex;flex-direction:column;gap:15px;font:400 10.5px 'JetBrains Mono',monospace;letter-spacing:.14em")}>
          <div><div style={css("display:flex;justify-content:space-between;color:rgba(236,229,218,.5)")}><span>STATUS</span><span style={css("color:#6be5f5")}>{v.micStatus}</span></div><div style={css("margin-top:6px;height:2px;background:rgba(107,229,245,.14)")}><div style={v.micBar}></div></div></div>
          <div><div style={css("display:flex;justify-content:space-between;color:rgba(236,229,218,.5)")}><span>VOICE</span><span style={css("color:rgba(236,229,218,.85)")}>DANIEL · EN-GB</span></div><div style={css("margin-top:6px;height:2px;background:rgba(107,229,245,.14)")}><div style={css("width:70%;height:100%;background:#6be5f5")}></div></div></div>
          <div><div style={css("display:flex;justify-content:space-between;color:rgba(236,229,218,.5)")}><span>LATENCY</span><span style={css("color:rgba(236,229,218,.85)")}>0.42s</span></div><div style={css("margin-top:6px;height:2px;background:rgba(107,229,245,.14)")}><div style={css("width:24%;height:100%;background:#6be5f5")}></div></div></div>
          <div><div style={css("display:flex;justify-content:space-between;color:rgba(236,229,218,.5)")}><span>VAULT LOG</span><span style={css("color:#d8b573")}>AUTO → OBSIDIAN</span></div><div style={css("margin-top:6px;height:2px;background:rgba(216,181,115,.16)")}><div style={css("width:100%;height:100%;background:#d8b573")}></div></div></div>
          <div style={css("margin-top:6px;border:1px solid rgba(236,229,218,.1);border-radius:10px;padding:12px 14px;background:rgba(0,0,0,.2)")}>
            <div style={css("font-size:9px;color:rgba(236,229,218,.4);letter-spacing:.2em")}>ON THE LINE</div>
            <div style={css("margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:10.5px;color:rgba(236,229,218,.85)")}>
              <div style={css("display:flex;justify-content:space-between")}><span>COMMANDER</span><span style={css("color:#6be5f5")}>●</span></div>
              <div style={css("display:flex;justify-content:space-between")}><span>COACH</span><span style={css("color:#6be5f5")}>●</span></div>
              <div style={css("display:flex;justify-content:space-between")}><span>CFO</span><span style={css("color:rgba(236,229,218,.3)")}>○</span></div>
            </div>
          </div>
        </div>
        <div style={css("flex:1;min-width:320px;display:flex;flex-direction:column;align-items:center;gap:20px")}>
          <div style={css("position:relative;width:300px;height:300px;display:flex;align-items:center;justify-content:center")}>
            <div style={css("position:absolute;inset:0;border-radius:50%;border:1px dashed rgba(107,229,245,.22);animation:ringSpin 44s linear infinite")}></div>
            <div style={css("position:absolute;inset:28px;border-radius:50%;border:1px solid rgba(216,181,115,.2)")}></div>
            <div style={css("position:absolute;inset:56px;border-radius:50%;border:1px solid rgba(107,229,245,.35);border-top-color:rgba(107,229,245,.9);animation:ringSpin 14s linear infinite reverse")}></div>
            <div style={css("width:132px;height:132px;border-radius:50%;background:radial-gradient(circle at 42% 36%, #fff3da 0%, #ecc98a 30%, #a3742f 62%, #3a2a12 100%);animation:orbGlow 3.6s ease-in-out infinite")}></div>
          </div>
          <div style={css("font:400 10px 'JetBrains Mono',monospace;letter-spacing:.42em;color:rgba(236,229,218,.6)")}>{v.orbCaption}</div>
          {v.micOn && (
            <div style={css("display:flex;gap:3px;align-items:center;height:26px")}>
              <span style={css("width:3px;height:22px;background:rgba(107,229,245,.8);animation:wave 1.1s ease-in-out infinite")}></span>
              <span style={css("width:3px;height:22px;background:rgba(107,229,245,.6);animation:wave 1.1s ease-in-out .12s infinite")}></span>
              <span style={css("width:3px;height:22px;background:#6be5f5;animation:wave 1.1s ease-in-out .24s infinite")}></span>
              <span style={css("width:3px;height:22px;background:rgba(107,229,245,.9);animation:wave 1.1s ease-in-out .36s infinite")}></span>
              <span style={css("width:3px;height:22px;background:rgba(107,229,245,.5);animation:wave 1.1s ease-in-out .48s infinite")}></span>
              <span style={css("width:3px;height:22px;background:rgba(107,229,245,.75);animation:wave 1.1s ease-in-out .6s infinite")}></span>
              <span style={css("width:3px;height:22px;background:rgba(107,229,245,.55);animation:wave 1.1s ease-in-out .72s infinite")}></span>
            </div>
          )}
          <div style={css("display:flex;gap:10px")}>
            <Interactive as="span" onClick={v.toggleMic} base={v.micBtnStyle} hoverStyle="border-color:rgba(107,229,245,.6)">{v.micBtnLabel}</Interactive>
            <Interactive as="span" onClick={v.briefMe} base="cursor:pointer;font:500 10.5px 'JetBrains Mono',monospace;padding:9px 16px;border:1px solid rgba(216,181,115,.4);border-radius:8px;color:#d8b573;background:rgba(216,181,115,.06)" hoverStyle="background:rgba(216,181,115,.12)">☰ BRIEF ME</Interactive>
          </div>
        </div>
        <div style={css("flex:1 1 340px;min-width:300px;max-width:470px;min-height:360px;max-height:560px;border-left:1px solid rgba(236,229,218,.08);padding-left:24px;display:flex;flex-direction:column")}>
          <div style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.28em;color:rgba(236,229,218,.5)")}>TRANSCRIPT</div>
          <div style={css("flex:1;overflow-y:auto;margin-top:14px;display:flex;flex-direction:column;gap:14px;font:400 12.5px/1.7 'JetBrains Mono',monospace")}>
            {v.orbMsgs.map((m, i) => (
              <div key={i} style={css("animation:fadeUp .4s ease-out")}><span style={m.tagStyle}>{m.tag}</span> <span style={css("color:rgba(236,229,218,.9)")}>{m.text}</span>{m.typing && <span style={css("color:#6be5f5")}>▍</span>}</div>
            ))}
          </div>
          <div style={css("display:flex;gap:8px;margin-top:14px")}>
            <Interactive
              as="input"
              value={v.orbInput}
              onChange={v.setOrbInput}
              onKeyDown={v.orbKey}
              placeholder="Speak or type to Nova…"
              base="flex:1;background:rgba(0,0,0,.32);border:1px solid rgba(236,229,218,.12);border-radius:9px;padding:10px 14px;color:#ece5da;font:400 12.5px 'JetBrains Mono',monospace;outline:none"
              focusStyle="border-color:rgba(107,229,245,.5)"
            />
            <Interactive as="span" onClick={v.sendOrb} base="cursor:pointer;display:flex;align-items:center;font:500 11px 'JetBrains Mono',monospace;padding:0 16px;border-radius:9px;background:#6be5f5;color:#0a2830" hoverStyle="background:#9deefa">SEND</Interactive>
          </div>
        </div>
      </div>
    </div>
  );
}
