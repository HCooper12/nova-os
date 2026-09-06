import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { Eyebrow, TextAction, Chip, Meta, Segmented, isAppleStyle } from '../Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx
const btn = (bg, ink, extra = {}) => (isAppleStyle()
  ? { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '600 15px var(--nv-font-ui)', letterSpacing: '-.01em', padding: '10px 18px', borderRadius: '999px', background: bg, color: ink, ...extra }
  : { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: 'var(--nv-micro-l)', textTransform: 'uppercase', padding: '9px 16px', borderRadius: '8px', background: bg, color: ink, ...extra });

export function ClaudeCode({ v }) {
  return (
    <div style={v.wrapCode} data-screen-label="Claude Code">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:var(--nv-micro-l);letter-spacing:var(--nv-micro-track);color:var(--nv-acc)")}>IV.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>AGENT · CLAUDE CODE</span>
        </div>
        <Meta tone="faint">Read + edit files · no shell access</Meta>
      </div>
      <div style={css("display:flex;align-items:baseline;justify-content:space-between;margin-top:18px;gap:14px;flex-wrap:wrap")}>
        <h1 style={css("margin:0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Claude, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>direct line.</span></h1>
        <div style={css("display:flex;gap:10px")}>
          <Chip tone="var(--nv-mg)" disabled={v.sparBusy} onClick={v.sparBusy ? undefined : v.startSpar}>{v.sparBusy ? '⚔ Breaker running…' : '⚔ Spar — send the Breaker'}</Chip>
          <Chip tone="quiet" onClick={v.newCodeSession}>+ New session</Chip>
          <Chip tone="gold" onClick={v.openIngestModal}>⇪ Add to vault</Chip>
        </div>
      </div>
      <div style={v.gridCode}>
        <div style={v.consoleCard}>
          <div style={css("display:flex;align-items:center;gap:9px;padding:12px 18px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)")}>
            <span style={css("width:9px;height:9px;border-radius:50%;background:var(--nv-warn)")}></span><span style={css("width:9px;height:9px;border-radius:50%;background:var(--nv-gold)")}></span><span style={css("width:9px;height:9px;border-radius:50%;background:#5aa87c")}></span>
            <Meta tone="faint" style={{ marginLeft: '8px', textTransform: 'none', letterSpacing: 0 }}>nova — claude-code · {v.codeWorkspace === 'repo' ? '~/nova-os' : '~/vault'}</Meta>
            <Meta tone={v.codeConnected ? 'cyan' : 'faint'} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: v.codeConnected ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 30%, transparent)', animation: v.codeConnected ? 'novaPulse 2s infinite' : 'none' }}></span>
              {v.codeConnected ? 'Connected' : 'Not connected'}
            </Meta>
          </div>
          {/* C2: the diff, and his call on it — the thing that used to send
              him to a terminal. Shelving is undoable by construction. */}
          {v.codeChanges && !v.codeChanges.clean && (
            <div style={css("margin:0 16px 0;border:1px solid color-mix(in srgb, var(--nv-gold) 38%, transparent);border-radius:13px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-gold) 07%, transparent),transparent)")}>
              <div style={css("display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 15px")}>
                <Eyebrow as="span" tone="gold">Uncommitted changes</Eyebrow>
                <Meta tone="quiet" style={{ textTransform: 'none', letterSpacing: 0 }}>{v.codeChanges.files.length} file{v.codeChanges.files.length === 1 ? '' : 's'} · {v.codeChanges.branch}</Meta>
                <TextAction compact tone="quiet" onClick={v.toggleCodeChanges} style={{ marginLeft: 'auto' }}>{v.codeChangesOpen ? '▾ Hide diff' : '▸ Show diff'}</TextAction>
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
                    base={btn('var(--nv-gold)', '#1a1206', { flex: 'none', opacity: v.codeChangeBusy ? 0.6 : 1 })}
                    hoverStyle={{ filter: 'brightness(1.08)' }}>Commit</Interactive>
                  <TextAction tone="quiet" disabled={v.codeChangeBusy} onClick={v.codeChangeBusy ? undefined : v.shelveCodeChanges} title="Stashes the changes — recoverable, never destroyed" style={{ flex: 'none' }}>Shelve</TextAction>
                </div>
              )}
            </div>
          )}
          {v.codeShelf && (
            <div style={css("margin:10px 16px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent);border-radius:11px;padding:10px 14px")}>
              <span style={css("font:400 11.5px var(--nv-font-ui);color:var(--nv-ink60)")}>Shelved {v.codeShelf.files} file{v.codeShelf.files === 1 ? '' : 's'} — nothing lost.</span>
              <TextAction compact tone="cyan" onClick={v.unshelveCodeChanges} style={{ marginLeft: 'auto' }}>Restore</TextAction>
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
            <Interactive as="span" onClick={v.codeBusy ? undefined : v.sendCode} base={btn('var(--nv-gold)', '#1a1322', { display: 'flex', padding: '0 16px', opacity: v.codeBusy ? .6 : 1 })} hoverStyle={{ filter: 'brightness(1.08)' }}>Run</Interactive>
          </div>
        </div>
        <div style={css("display:flex;flex-direction:column;gap:14px")}>
          <div style={css("border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:16px 18px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec)")}>
            <Eyebrow>Session</Eyebrow>
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
                <Segmented stretch ariaLabel="Workspace" value={v.codeWorkspace} onChange={(k) => v.setCodeWorkspace(k)} options={[['repo', 'Nova OS'], ['vault', 'Vault']]} />
              </div>
              <div style={css("display:flex;justify-content:space-between;padding-top:4px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)")}>
                <span style={css("color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>Session</span>
                <span style={{ color: v.codeSessionActive ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>{v.codeSessionActive ? 'Active — context retained' : 'Not started'}</span>
              </div>
            </div>
          </div>
          <div style={css("border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:16px 18px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec)")}>
            <Eyebrow>Can / can't</Eyebrow>
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
