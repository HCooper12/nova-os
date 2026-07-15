import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function ClaudeCode({ v }) {
  return (
    <div style={v.wrapCode} data-screen-label="Claude Code">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>IV.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>AGENT · CLAUDE CODE</span>
        </div>
        <span style={css("font:400 10px 'JetBrains Mono',monospace;letter-spacing:.12em;color:rgba(236,229,218,.45)")}>READ + EDIT FILES · NO SHELL ACCESS</span>
      </div>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;margin-top:18px;gap:14px;flex-wrap:wrap")}>
        <h1 style={css("margin:0;font:400 38px/1.1 'Instrument Serif',serif")}>Claude, <span style={css("font-style:italic;color:#d8b573")}>direct line.</span></h1>
        <div style={css("display:flex;gap:10px")}>
          <Interactive
            as="span"
            onClick={v.newCodeSession}
            base="cursor:pointer;font:500 10.5px 'JetBrains Mono',monospace;padding:9px 16px;border:1px solid rgba(236,229,218,.16);border-radius:8px;color:rgba(236,229,218,.6)"
            hoverStyle="color:#ece5da"
          >
            + New session
          </Interactive>
          <Interactive
            as="span"
            onClick={v.openIngestModal}
            base="cursor:pointer;font:500 10.5px 'JetBrains Mono',monospace;padding:9px 16px;border:1px solid rgba(216,181,115,.4);border-radius:8px;color:#d8b573;background:rgba(216,181,115,.06)"
            hoverStyle="background:rgba(216,181,115,.14)"
          >
            ⇪ Add to vault
          </Interactive>
        </div>
      </div>
      <div style={v.gridCode}>
        <div style={v.consoleCard}>
          <div style={css("display:flex;align-items:center;gap:9px;padding:12px 18px;border-bottom:1px solid rgba(236,229,218,.07)")}>
            <span style={css("width:9px;height:9px;border-radius:50%;background:#c96f6f")}></span><span style={css("width:9px;height:9px;border-radius:50%;background:#d8b573")}></span><span style={css("width:9px;height:9px;border-radius:50%;background:#5aa87c")}></span>
            <span style={css("margin-left:8px;font:400 10.5px 'JetBrains Mono',monospace;color:rgba(236,229,218,.45)")}>nova — claude-code · {v.codeWorkspace === 'repo' ? '~/nova-os' : '~/vault'}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', font: "500 9.5px 'JetBrains Mono',monospace", color: v.codeConnected ? '#6be5f5' : 'rgba(236,229,218,.35)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.codeConnected ? '#6be5f5' : 'rgba(236,229,218,.3)', animation: v.codeConnected ? 'novaPulse 2s infinite' : 'none' }}></span>
              {v.codeConnected ? 'CONNECTED' : 'NOT CONNECTED'}
            </span>
          </div>
          <div style={css("flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:14px;font:400 12.5px/1.7 'JetBrains Mono',monospace")}>
            {!v.codeConnected && (
              <div style={css("color:rgba(236,229,218,.4);font-style:italic")}>Connect a backend in Settings to talk to Claude here.</div>
            )}
            {v.codeConnected && v.codeMsgs.length === 0 && (
              <div style={css("color:rgba(236,229,218,.4);font-style:italic")}>Ask Claude to explain something, or to make a real change — it can read and edit files in the selected workspace.</div>
            )}
            {v.codeMsgs.map((m, i) => (
              <div key={i} style={css("animation:fadeUp .3s ease-out")}><span style={m.tagStyle}>{m.tag}</span> <span style={css("color:rgba(236,229,218,.88);white-space:pre-wrap")}>{m.text}</span></div>
            ))}
            {v.codeBusy && (
              <div style={css("display:flex;gap:5px;padding-left:2px")}><span style={css("width:5px;height:5px;border-radius:50%;background:#d8b573;animation:dotBlink 1s infinite")}></span><span style={css("width:5px;height:5px;border-radius:50%;background:#d8b573;animation:dotBlink 1s .2s infinite")}></span><span style={css("width:5px;height:5px;border-radius:50%;background:#d8b573;animation:dotBlink 1s .4s infinite")}></span></div>
            )}
          </div>
          <div style={css("display:flex;gap:8px;padding:14px 18px;border-top:1px solid rgba(236,229,218,.07)")}>
            <Interactive
              as="input"
              value={v.codeInput}
              onChange={v.setCodeInput}
              onKeyDown={v.codeKey}
              disabled={v.codeBusy}
              placeholder="Message Claude… (⏎ to send)"
              base="flex:1;background:rgba(0,0,0,.35);border:1px solid rgba(236,229,218,.12);border-radius:9px;padding:10px 14px;color:#ece5da;font:400 12.5px 'JetBrains Mono',monospace;outline:none"
              focusStyle="border-color:rgba(216,181,115,.5)"
            />
            <Interactive as="span" onClick={v.codeBusy ? undefined : v.sendCode} base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', font: "500 11px 'JetBrains Mono',monospace", padding: '0 16px', borderRadius: '9px', background: '#d8b573', color: '#1a1322', opacity: v.codeBusy ? .6 : 1 }} hoverStyle="background:#e6c98f">RUN</Interactive>
          </div>
        </div>
        <div style={css("display:flex;flex-direction:column;gap:14px")}>
          <div style={css("border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:16px 18px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06)")}>
            <div style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.45)")}>SESSION</div>
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:12px;font-size:12.5px;color:rgba(236,229,218,.8)")}>
              <div>
                <div style={css("color:rgba(236,229,218,.5);margin-bottom:5px")}>Model</div>
                <select
                  value={v.codeModel}
                  onChange={v.setCodeModel}
                  style={css("width:100%;box-sizing:border-box;background:rgba(0,0,0,.3);border:1px solid rgba(236,229,218,.15);border-radius:7px;color:#ece5da;font-size:12px;padding:7px 9px;outline:none")}
                >
                  {v.codeModelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div style={css("color:rgba(236,229,218,.5);margin-bottom:5px")}>Workspace</div>
                <div style={css("display:flex;gap:6px")}>
                  <Interactive
                    as="span"
                    onClick={() => v.setCodeWorkspace('repo')}
                    base={{ cursor: 'pointer', flex: 1, textAlign: 'center', font: "500 10.5px 'JetBrains Mono',monospace", padding: '7px 0', borderRadius: '7px', border: v.codeWorkspace === 'repo' ? '1px solid rgba(216,181,115,.5)' : '1px solid rgba(236,229,218,.14)', color: v.codeWorkspace === 'repo' ? '#d8b573' : 'rgba(236,229,218,.55)', background: v.codeWorkspace === 'repo' ? 'rgba(216,181,115,.08)' : 'transparent' }}
                    hoverStyle={{ border: '1px solid rgba(216,181,115,.5)' }}
                  >
                    Nova OS
                  </Interactive>
                  <Interactive
                    as="span"
                    onClick={() => v.setCodeWorkspace('vault')}
                    base={{ cursor: 'pointer', flex: 1, textAlign: 'center', font: "500 10.5px 'JetBrains Mono',monospace", padding: '7px 0', borderRadius: '7px', border: v.codeWorkspace === 'vault' ? '1px solid rgba(216,181,115,.5)' : '1px solid rgba(236,229,218,.14)', color: v.codeWorkspace === 'vault' ? '#d8b573' : 'rgba(236,229,218,.55)', background: v.codeWorkspace === 'vault' ? 'rgba(216,181,115,.08)' : 'transparent' }}
                    hoverStyle={{ border: '1px solid rgba(216,181,115,.5)' }}
                  >
                    Vault
                  </Interactive>
                </div>
              </div>
              <div style={css("display:flex;justify-content:space-between;padding-top:4px;border-top:1px solid rgba(236,229,218,.06)")}>
                <span style={css("color:rgba(236,229,218,.5)")}>Session</span>
                <span style={{ color: v.codeSessionActive ? '#6be5f5' : 'rgba(236,229,218,.4)' }}>{v.codeSessionActive ? 'Active — context retained' : 'Not started'}</span>
              </div>
            </div>
          </div>
          <div style={css("border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:16px 18px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06)")}>
            <div style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.45)")}>CAN / CAN'T</div>
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:8px;font-size:12px;line-height:1.5")}>
              <div style={css("color:rgba(236,229,218,.75)")}>✓ Read and edit real files in the selected workspace</div>
              <div style={css("color:rgba(236,229,218,.75)")}>✓ Remembers the conversation until you start a new session</div>
              <div style={css("color:rgba(201,111,111,.75)")}>✕ No shell/Bash — can't run commands, install anything, or use git</div>
              <div style={css("color:rgba(236,229,218,.4);margin-top:2px;font-size:11px")}>Review what changed before trusting it — same as any AI-written code.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
