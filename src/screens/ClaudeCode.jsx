import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function ClaudeCode({ v }) {
  return (
    <div style={v.wrapCode} data-screen-label="Claude Code">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px var(--nv-font-mono);letter-spacing:.14em;color:var(--nv-acc)")}>IV.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px var(--nv-font-mono);letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>AGENT · CLAUDE CODE</span>
        </div>
        <span style={css("font:400 10px var(--nv-font-mono);letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>READ + EDIT FILES · NO SHELL ACCESS</span>
      </div>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;margin-top:18px;gap:14px;flex-wrap:wrap")}>
        <h1 style={css("margin:0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Claude, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>direct line.</span></h1>
        <div style={css("display:flex;gap:10px")}>
          <Interactive
            as="span"
            onClick={v.sparBusy ? undefined : v.startSpar}
            base={{ cursor: 'pointer', font: "500 10.5px var(--nv-font-mono)", padding: '9px 16px', border: '1px solid color-mix(in srgb, var(--nv-mg) 45%, transparent)', borderRadius: '8px', color: 'var(--nv-mg)', background: 'color-mix(in srgb, var(--nv-mg) 06%, transparent)', opacity: v.sparBusy ? 0.55 : 1 }}
            hoverStyle="background:color-mix(in srgb, var(--nv-mg) 14%, transparent)"
          >
            {v.sparBusy ? '⚔ Breaker running…' : '⚔ Spar — send the Breaker'}
          </Interactive>
          <Interactive
            as="span"
            onClick={v.newCodeSession}
            base="cursor:pointer;font:500 10.5px var(--nv-font-mono);padding:9px 16px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);border-radius:8px;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)"
            hoverStyle="color:var(--nv-ink)"
          >
            + New session
          </Interactive>
          <Interactive
            as="span"
            onClick={v.openIngestModal}
            base="cursor:pointer;font:500 10.5px var(--nv-font-mono);padding:9px 16px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);border-radius:8px;color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)"
            hoverStyle="background:color-mix(in srgb, var(--nv-gold) 14%, transparent)"
          >
            ⇪ Add to vault
          </Interactive>
        </div>
      </div>
      <div style={v.gridCode}>
        <div style={v.consoleCard}>
          <div style={css("display:flex;align-items:center;gap:9px;padding:12px 18px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)")}>
            <span style={css("width:9px;height:9px;border-radius:50%;background:var(--nv-warn)")}></span><span style={css("width:9px;height:9px;border-radius:50%;background:var(--nv-gold)")}></span><span style={css("width:9px;height:9px;border-radius:50%;background:#5aa87c")}></span>
            <span style={css("margin-left:8px;font:400 10.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>nova — claude-code · {v.codeWorkspace === 'repo' ? '~/nova-os' : '~/vault'}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', font: "500 9.5px var(--nv-font-mono)", color: v.codeConnected ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 35%, transparent)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.codeConnected ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 30%, transparent)', animation: v.codeConnected ? 'novaPulse 2s infinite' : 'none' }}></span>
              {v.codeConnected ? 'CONNECTED' : 'NOT CONNECTED'}
            </span>
          </div>
          <div style={css("flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column;gap:14px;font:400 12.5px/1.7 var(--nv-font-mono)")}>
            {!v.codeConnected && (
              <div style={css("color:color-mix(in srgb, var(--nv-ink) 40%, transparent);font-style:italic")}>Connect a backend in Settings to talk to Claude here.</div>
            )}
            {v.codeConnected && v.codeMsgs.length === 0 && (
              <div style={css("color:color-mix(in srgb, var(--nv-ink) 40%, transparent);font-style:italic")}>Ask Claude to explain something, or to make a real change — it can read and edit files in the selected workspace.</div>
            )}
            {v.codeMsgs.map((m, i) => (
              <div key={i} style={css("animation:fadeUp .3s ease-out")}><span style={m.tagStyle}>{m.tag}</span> <span style={css("color:color-mix(in srgb, var(--nv-ink) 88%, transparent);white-space:pre-wrap")}>{m.text}</span></div>
            ))}
            {v.codeBusy && (
              <div style={css("display:flex;gap:5px;padding-left:2px")}><span style={css("width:5px;height:5px;border-radius:50%;background:var(--nv-gold);animation:dotBlink 1s infinite")}></span><span style={css("width:5px;height:5px;border-radius:50%;background:var(--nv-gold);animation:dotBlink 1s .2s infinite")}></span><span style={css("width:5px;height:5px;border-radius:50%;background:var(--nv-gold);animation:dotBlink 1s .4s infinite")}></span></div>
            )}
          </div>
          <div style={css("display:flex;gap:8px;padding:14px 18px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)")}>
            <Interactive
              as="input"
              value={v.codeInput}
              onChange={v.setCodeInput}
              onKeyDown={v.codeKey}
              disabled={v.codeBusy}
              placeholder="Message Claude… (⏎ to send)"
              base="flex:1;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font:400 12.5px var(--nv-font-mono);outline:none"
              focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
            />
            <Interactive as="span" onClick={v.codeBusy ? undefined : v.sendCode} base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', font: "500 11px var(--nv-font-mono)", padding: '0 16px', borderRadius: '9px', background: 'var(--nv-gold)', color: '#1a1322', opacity: v.codeBusy ? .6 : 1 }} hoverStyle="background:color-mix(in srgb, var(--nv-gold) 85%, white)">RUN</Interactive>
          </div>
        </div>
        <div style={css("display:flex;flex-direction:column;gap:14px")}>
          <div style={css("border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:16px 18px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec)")}>
            <div style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>SESSION</div>
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:12px;font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 80%, transparent)")}>
              <div>
                <div style={css("color:color-mix(in srgb, var(--nv-ink) 50%, transparent);margin-bottom:5px")}>Model</div>
                <select
                  value={v.codeModel}
                  onChange={v.setCodeModel}
                  style={css("width:100%;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent);border-radius:7px;color:var(--nv-ink);font-size:12px;padding:7px 9px;outline:none")}
                >
                  {v.codeModelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div style={css("color:color-mix(in srgb, var(--nv-ink) 50%, transparent);margin-bottom:5px")}>Workspace</div>
                <div style={css("display:flex;gap:6px")}>
                  <Interactive
                    as="span"
                    onClick={() => v.setCodeWorkspace('repo')}
                    base={{ cursor: 'pointer', flex: 1, textAlign: 'center', font: "500 10.5px var(--nv-font-mono)", padding: '7px 0', borderRadius: '7px', border: v.codeWorkspace === 'repo' ? '1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', color: v.codeWorkspace === 'repo' ? 'var(--nv-gold)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)', background: v.codeWorkspace === 'repo' ? 'color-mix(in srgb, var(--nv-gold) 08%, transparent)' : 'transparent' }}
                    hoverStyle={{ border: '1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)' }}
                  >
                    Nova OS
                  </Interactive>
                  <Interactive
                    as="span"
                    onClick={() => v.setCodeWorkspace('vault')}
                    base={{ cursor: 'pointer', flex: 1, textAlign: 'center', font: "500 10.5px var(--nv-font-mono)", padding: '7px 0', borderRadius: '7px', border: v.codeWorkspace === 'vault' ? '1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', color: v.codeWorkspace === 'vault' ? 'var(--nv-gold)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)', background: v.codeWorkspace === 'vault' ? 'color-mix(in srgb, var(--nv-gold) 08%, transparent)' : 'transparent' }}
                    hoverStyle={{ border: '1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)' }}
                  >
                    Vault
                  </Interactive>
                </div>
              </div>
              <div style={css("display:flex;justify-content:space-between;padding-top:4px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)")}>
                <span style={css("color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>Session</span>
                <span style={{ color: v.codeSessionActive ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>{v.codeSessionActive ? 'Active — context retained' : 'Not started'}</span>
              </div>
            </div>
          </div>
          <div style={css("border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:16px 18px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec)")}>
            <div style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>CAN / CAN'T</div>
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:8px;font-size:12px;line-height:1.5")}>
              <div style={css("color:color-mix(in srgb, var(--nv-ink) 75%, transparent)")}>✓ Read and edit real files in the selected workspace</div>
              <div style={css("color:color-mix(in srgb, var(--nv-ink) 75%, transparent)")}>✓ Remembers the conversation until you start a new session</div>
              <div style={css("color:color-mix(in srgb, var(--nv-warn) 75%, transparent)")}>✕ No shell/Bash — can't run commands, install anything, or use git</div>
              <div style={css("color:color-mix(in srgb, var(--nv-ink) 40%, transparent);margin-top:2px;font-size:11px")}>Review what changed before trusting it — same as any AI-written code.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
