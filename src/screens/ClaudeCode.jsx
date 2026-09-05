import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function ClaudeCode({ v }) {
  return (
    <div style={v.wrapCode} data-screen-label="Claude Code">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:var(--nv-micro-l);letter-spacing:var(--nv-micro-track);color:var(--nv-acc)")}>IV.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>AGENT · CLAUDE CODE</span>
        </div>
        <span style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>READ + EDIT FILES · NO SHELL ACCESS</span>
      </div>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;margin-top:18px;gap:14px;flex-wrap:wrap")}>
        <h1 style={css("margin:0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Claude, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>direct line.</span></h1>
        <div style={css("display:flex;gap:10px")}>
          <Interactive
            as="span"
            onClick={v.sparBusy ? undefined : v.startSpar}
            base={{ cursor: 'pointer', font: 'var(--nv-micro-m)', padding: '9px 16px', border: '1px solid color-mix(in srgb, var(--nv-mg) 45%, transparent)', borderRadius: '8px', color: 'var(--nv-mg)', background: 'color-mix(in srgb, var(--nv-mg) 06%, transparent)', opacity: v.sparBusy ? 0.55 : 1 }}
            hoverStyle="background:color-mix(in srgb, var(--nv-mg) 14%, transparent)"
          >
            {v.sparBusy ? '⚔ Breaker running…' : '⚔ Spar — send the Breaker'}
          </Interactive>
          <Interactive
            as="span"
            onClick={v.newCodeSession}
            base="cursor:pointer;font:var(--nv-micro-m);padding:9px 16px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);border-radius:8px;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)"
            hoverStyle="color:var(--nv-ink)"
          >
            + New session
          </Interactive>
          <Interactive
            as="span"
            onClick={v.openIngestModal}
            base="cursor:pointer;font:var(--nv-micro-m);padding:9px 16px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);border-radius:8px;color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)"
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
            <span style={css("margin-left:8px;font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>nova — claude-code · {v.codeWorkspace === 'repo' ? '~/nova-os' : '~/vault'}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', font: 'var(--nv-micro-m)', color: v.codeConnected ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 35%, transparent)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.codeConnected ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 30%, transparent)', animation: v.codeConnected ? 'novaPulse 2s infinite' : 'none' }}></span>
              {v.codeConnected ? 'CONNECTED' : 'NOT CONNECTED'}
            </span>
          </div>
          {/* C2: the diff, and his call on it — the thing that used to send
              him to a terminal. Shelving is undoable by construction. */}
          {v.codeChanges && !v.codeChanges.clean && (
            <div style={css("margin:0 16px 0;border:1px solid color-mix(in srgb, var(--nv-gold) 38%, transparent);border-radius:13px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-gold) 07%, transparent),transparent)")}>
              <div style={css("display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 15px")}>
                <span style={css("font:var(--nv-micro-s);letter-spacing:.2em;color:var(--nv-gold)")}>UNCOMMITTED CHANGES</span>
                <span style={css("font:var(--nv-micro-l);color:var(--nv-ink60)")}>{v.codeChanges.files.length} file{v.codeChanges.files.length === 1 ? '' : 's'} · {v.codeChanges.branch}</span>
                <Interactive as="span" onClick={v.toggleCodeChanges}
                  base="cursor:pointer;margin-left:auto;font:var(--nv-micro-m);color:var(--nv-ink60)"
                  hoverStyle="color:var(--nv-gold)">{v.codeChangesOpen ? '▾ HIDE DIFF' : '▸ SHOW DIFF'}</Interactive>
              </div>
              <div style={css("padding:0 15px 6px;font:var(--nv-micro-l);color:var(--nv-ink60);line-height:1.6")}>
                {v.codeChanges.files.slice(0, 8).map((f) => (
                  <div key={f.path}><span style={css("color:var(--nv-cy)")}>{f.status}</span> {f.path}</div>
                ))}
                {v.codeChanges.files.length > 8 && <div>…and {v.codeChanges.files.length - 8} more</div>}
              </div>
              {v.codeChangesOpen && (
                <pre style={css("margin:0;padding:12px 15px;max-height:320px;overflow:auto;font:var(--nv-micro-m);color:color-mix(in srgb, var(--nv-ink) 72%, transparent);background:rgba(0,0,0,.35);white-space:pre;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}>{v.codeChanges.diff}{v.codeChanges.truncated ? '\n…diff truncated — the rest is on disk' : ''}</pre>
              )}
              {v.codeChanges.readOnly ? (
                <div style={css("padding:10px 15px 13px;font-size:11.5px;color:var(--nv-ink60)")}>The vault is read-only from here — Nova never commits your notes for you.</div>
              ) : (
                <div style={css("display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 15px 13px")}>
                  <Interactive as="input" value={v.codeCommitMsg} onChange={v.setCodeCommitMsg} placeholder="Commit message — why, not what…"
                    base="flex:1;min-width:170px;box-sizing:border-box;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent);border-radius:8px;padding:9px 12px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none"
                    focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 55%, transparent)" />
                  <Interactive as="span" onClick={v.codeChangeBusy ? undefined : v.commitCodeChanges}
                    base={{ cursor: 'pointer', flex: 'none', font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', padding: '10px 16px', borderRadius: '8px', background: 'var(--nv-gold)', color: '#1a1206', opacity: v.codeChangeBusy ? 0.6 : 1 }}
                    hoverStyle={{ filter: 'brightness(1.08)' }}>COMMIT</Interactive>
                  <Interactive as="span" onClick={v.codeChangeBusy ? undefined : v.shelveCodeChanges}
                    title="Stashes the changes — recoverable, never destroyed"
                    base="cursor:pointer;flex:none;font:var(--nv-micro-m);padding:10px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 18%, transparent);color:var(--nv-ink60)"
                    hoverStyle="color:var(--nv-ink)">SHELVE</Interactive>
                </div>
              )}
            </div>
          )}
          {v.codeShelf && (
            <div style={css("margin:10px 16px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent);border-radius:11px;padding:10px 14px")}>
              <span style={css("font:400 11.5px var(--nv-font-ui);color:var(--nv-ink60)")}>Shelved {v.codeShelf.files} file{v.codeShelf.files === 1 ? '' : 's'} — nothing lost.</span>
              <Interactive as="span" onClick={v.unshelveCodeChanges}
                base="cursor:pointer;margin-left:auto;font:var(--nv-micro-m);color:var(--nv-cy)"
                hoverStyle="filter:brightness(1.2)">RESTORE</Interactive>
            </div>
          )}
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
            <Interactive as="span" onClick={v.codeBusy ? undefined : v.sendCode} base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', font: 'var(--nv-micro-l)', padding: '0 16px', borderRadius: '9px', background: 'var(--nv-gold)', color: '#1a1322', opacity: v.codeBusy ? .6 : 1 }} hoverStyle="background:color-mix(in srgb, var(--nv-gold) 85%, white)">RUN</Interactive>
          </div>
        </div>
        <div style={css("display:flex;flex-direction:column;gap:14px")}>
          <div style={css("border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:16px 18px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec)")}>
            <div style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>SESSION</div>
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
                    base={{ cursor: 'pointer', flex: 1, textAlign: 'center', font: 'var(--nv-micro-m)', padding: '7px 0', borderRadius: '7px', border: v.codeWorkspace === 'repo' ? '1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', color: v.codeWorkspace === 'repo' ? 'var(--nv-gold)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)', background: v.codeWorkspace === 'repo' ? 'color-mix(in srgb, var(--nv-gold) 08%, transparent)' : 'transparent' }}
                    hoverStyle={{ border: '1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)' }}
                  >
                    Nova OS
                  </Interactive>
                  <Interactive
                    as="span"
                    onClick={() => v.setCodeWorkspace('vault')}
                    base={{ cursor: 'pointer', flex: 1, textAlign: 'center', font: 'var(--nv-micro-m)', padding: '7px 0', borderRadius: '7px', border: v.codeWorkspace === 'vault' ? '1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', color: v.codeWorkspace === 'vault' ? 'var(--nv-gold)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)', background: v.codeWorkspace === 'vault' ? 'color-mix(in srgb, var(--nv-gold) 08%, transparent)' : 'transparent' }}
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
            <div style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>CAN / CAN'T</div>
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
