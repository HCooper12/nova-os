import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

const statusColor = { idle: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', testing: 'var(--nv-gold)', ok: '#5aa87c', error: 'var(--nv-warn)' };

// Swatch dots shown on each theme card: accent, secondary, ground.
const THEME_SWATCHES = {
  command: ['#59e6ff', '#8f7bff', '#0a0f1e'],
  observatory: ['var(--nv-gold)', 'var(--nv-cy)', '#0c1424'],
  ember: ['#ffb35c', '#ff6a88', '#170e0b'],
};

export function Settings({ v }) {
  return (
    <div style={v.wrapSettings} data-screen-label="Settings">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.14em;color:var(--nv-acc)")}>XIII.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>SYSTEM · SETTINGS</span>
        </div>
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 'Rajdhani',sans-serif;letter-spacing:.02em")}>Connect the <span style={css("font:italic 400 27px 'Instrument Serif',serif;color:var(--nv-gold)")}>real vault.</span></h1>
      <div style={css("margin-top:8px;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 60%, transparent);max-width:640px;line-height:1.6")}>
        Point Nova OS at the backend running on your Mac to replace the demo data with your
        real Obsidian vault, calendar, and health data. Until then the app runs in demo mode —
        everything you see is clearly-badged sample data.
      </div>

      <div style={css("margin-top:28px;max-width:520px;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:24px 26px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec)")}>
        <label htmlFor="settings-base-url" style={css("display:block;font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>BACKEND URL</label>
        <Interactive
          as="input"
          id="settings-base-url"
          value={v.settingsBaseUrl}
          onChange={v.setSettingsBaseUrl}
          placeholder="https://your-mac.tailxxxx.ts.net:4173"
          base="margin-top:8px;width:100%;box-sizing:border-box;background:rgba(0,0,0,.32);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font-size:13px;font-family:'IBM Plex Mono',monospace;outline:none"
          focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
        />

        <label htmlFor="settings-token" style={css("display:block;margin-top:16px;font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>API TOKEN</label>
        <Interactive
          as="input"
          id="settings-token"
          type="password"
          value={v.settingsToken}
          onChange={v.setSettingsToken}
          placeholder="printed in the server's terminal on first run"
          base="margin-top:8px;width:100%;box-sizing:border-box;background:rgba(0,0,0,.32);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font-size:13px;font-family:'IBM Plex Mono',monospace;outline:none"
          focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
        />

        <div style={css("margin-top:18px;display:flex;gap:10px;flex-wrap:wrap")}>
          <Interactive as="span" onClick={v.testSettingsConnection} base="cursor:pointer;font-size:12.5px;font-weight:500;padding:9px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy);background:color-mix(in srgb, var(--nv-cy) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 14%, transparent)">Test connection</Interactive>
          <Interactive as="span" onClick={v.saveSettingsConnection} base="cursor:pointer;font-size:12.5px;font-weight:500;padding:9px 16px;border-radius:8px;background:var(--nv-gold);color:#1a1322" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 85%, white)">Save &amp; connect</Interactive>
          {v.connectionActive && (
            <Interactive as="span" onClick={v.disconnectSettings} base="cursor:pointer;font-size:12.5px;padding:9px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);color:color-mix(in srgb, var(--nv-ink) 70%, transparent)" hoverStyle="background:rgba(255,255,255,.05)">Disconnect</Interactive>
          )}
        </div>

        <div style={css(`margin-top:16px;font-size:12.5px;color:${statusColor[v.settingsTestStatus]}`)}>{v.settingsTestMessage}</div>
      </div>

      {v.profile && (
        <div style={{ marginTop: '34px' }}>
          <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
            <span style={css("font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:var(--nv-gold)")}>ABOUT YOU</span>
            <span style={css("font:400 9px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>THE ROOT CONTEXT EVERY NOVA AGENT REASONS FROM · LIVES IN YOUR VAULT</span>
            {!v.profile.editing && (
              <Interactive as="span" onClick={v.profile.startEdit} base="cursor:pointer;font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.08em;padding:5px 12px;border-radius:7px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);color:var(--nv-gold)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 08%, transparent)">{v.profile.set ? 'EDIT' : 'SET UP'}</Interactive>
            )}
          </div>

          {v.profile.editing ? (
            <div className="nv-pane" style={{ marginTop: '12px', padding: '18px 20px', maxWidth: '620px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={css("display:block")}>
                <span style={css("font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>CURRENT FOCUS · what this season of life is about</span>
                <input value={v.profile.draft.focus} onChange={v.profile.setField('focus')} placeholder="e.g. Building my body and my content while holding down full-time work"
                  style={{ marginTop: '6px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 13px 'Rajdhani',sans-serif", padding: '9px 12px', outline: 'none' }} />
              </label>
              <label style={css("display:block")}>
                <span style={css("font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>PRIORITIES · one per line, the handful that matter most now</span>
                <textarea value={v.profile.draft.priorities} onChange={v.profile.setField('priorities')} rows={4} placeholder={"Get to 78kg lean\nShip one video a week\nProtein consistency\nSleep before 11"}
                  style={{ marginTop: '6px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 13px 'Rajdhani',sans-serif", padding: '9px 12px', outline: 'none', resize: 'vertical' }} />
              </label>
              <label style={css("display:block")}>
                <span style={css("font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>PERFORMING AT YOUR BEST · what that looks and feels like for you</span>
                <textarea value={v.profile.draft.bestSelf} onChange={v.profile.setField('bestSelf')} rows={2} placeholder="Disciplined but not rigid — training hard, eating well, creating consistently, present with people."
                  style={{ marginTop: '6px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 13px 'Rajdhani',sans-serif", padding: '9px 12px', outline: 'none', resize: 'vertical' }} />
              </label>
              <label style={css("display:block")}>
                <span style={css("font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>CONTEXT &amp; CONSTRAINTS · anything Nova should always know</span>
                <textarea value={v.profile.draft.notes} onChange={v.profile.setField('notes')} rows={3} placeholder="Work 9-5 Mon-Fri. Gym has only dumbbells (to 40kg) on weekends. Left shoulder flares under heavy overhead. Prefer training evenings."
                  style={{ marginTop: '6px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 13px 'Rajdhani',sans-serif", padding: '9px 12px', outline: 'none', resize: 'vertical' }} />
              </label>
              <div style={css("display:flex;gap:10px;align-items:center")}>
                <Interactive as="span" onClick={v.profile.saving ? undefined : v.profile.save} base={{ cursor: 'pointer', font: "600 10.5px 'IBM Plex Mono',monospace", letterSpacing: '.08em', padding: '9px 18px', borderRadius: '8px', background: 'var(--nv-gold)', color: '#1a1322', opacity: v.profile.saving ? 0.5 : 1 }} hoverStyle="filter:brightness(1.08)">{v.profile.saving ? 'SAVING…' : 'SAVE'}</Interactive>
                <Interactive as="span" onClick={v.profile.cancelEdit} base="cursor:pointer;font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-ink)">cancel</Interactive>
              </div>
            </div>
          ) : v.profile.set ? (
            <div className="nv-pane" style={{ marginTop: '12px', padding: '18px 20px', maxWidth: '620px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {v.profile.view.focus && <div><div style={css("font:500 8.5px 'IBM Plex Mono',monospace;letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>CURRENT FOCUS</div><div style={css("margin-top:3px;font:500 14px 'Rajdhani',sans-serif")}>{v.profile.view.focus}</div></div>}
              {v.profile.view.priorities.length > 0 && <div><div style={css("font:500 8.5px 'IBM Plex Mono',monospace;letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>PRIORITIES</div><div style={css("margin-top:4px;display:flex;flex-direction:column;gap:3px")}>{v.profile.view.priorities.map((p, i) => <div key={i} style={css("font:500 13px 'Rajdhani',sans-serif;color:var(--nv-ink60)")}>· {p}</div>)}</div></div>}
              {v.profile.view.bestSelf && <div><div style={css("font:500 8.5px 'IBM Plex Mono',monospace;letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>AT YOUR BEST</div><div style={css("margin-top:3px;font:500 12.5px/1.55 'Rajdhani',sans-serif;color:var(--nv-ink60)")}>{v.profile.view.bestSelf}</div></div>}
              {v.profile.view.notes && <div><div style={css("font:500 8.5px 'IBM Plex Mono',monospace;letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>CONTEXT &amp; CONSTRAINTS</div><div style={css("margin-top:3px;font:500 12.5px/1.55 'Rajdhani',sans-serif;color:var(--nv-ink60);white-space:pre-wrap")}>{v.profile.view.notes}</div></div>}
            </div>
          ) : (
            <div style={css("margin-top:10px;max-width:620px;font:500 12.5px/1.7 'Rajdhani',sans-serif;color:var(--nv-ink60)")}>Nova knows your data but not yet your intentions. Tell it what you're working toward and it reasons through that in every answer, coaching session, and brief — the difference between a tool and a companion. Two minutes, editable anytime in Obsidian.</div>
          )}
        </div>
      )}

      <div style={css("margin-top:34px;font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>APPEARANCE</div>
      <div style={css("margin-top:12px;max-width:520px;display:flex;flex-direction:column;gap:10px")}>
        {v.novaThemeOptions.map((t) => (
          <Interactive
            key={t.value}
            onClick={t.pick}
            base={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '12px',
              border: t.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)',
              background: t.active ? 'var(--nv-acc-bg)' : 'rgba(0,0,0,.2)',
              boxShadow: t.active ? 'var(--nv-glow-tab)' : 'none',
            }}
            hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
          >
            <span style={{ display: 'flex', gap: '5px', flex: 'none' }}>
              {(THEME_SWATCHES[t.value] || []).map((c, i) => (
                <span key={i} style={{ width: '14px', height: '14px', borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,.18)' }}></span>
              ))}
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: t.active ? 'var(--nv-acc)' : 'var(--nv-ink)' }}>{t.label}</span>
              <span style={{ display: 'block', marginTop: '2px', fontSize: '11.5px', color: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' }}>{t.hint}</span>
            </span>
            {t.active && <span style={{ marginLeft: 'auto', font: "500 9.5px 'IBM Plex Mono',monospace", letterSpacing: '.14em', color: 'var(--nv-acc)' }}>ACTIVE</span>}
          </Interactive>
        ))}

        <div style={css("margin-top:14px;font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>NOVA CORE</div>
        {v.novaCoreOptions.map((c) => (
          <Interactive
            key={c.value}
            onClick={c.pick}
            base={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '12px',
              border: c.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)',
              background: c.active ? 'var(--nv-acc-bg)' : 'rgba(0,0,0,.2)',
              boxShadow: c.active ? 'var(--nv-glow-tab)' : 'none',
            }}
            hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
          >
            <span style={{ flex: 'none', width: '16px', height: '16px', borderRadius: '50%',
              border: c.value === 'hologram' ? '1.5px solid #59e6ff' : 'none',
              background: c.value === 'hologram'
                ? 'radial-gradient(circle at 50% 50%, #eafcff 0%, rgba(89,230,255,.5) 25%, transparent 60%)'
                : 'radial-gradient(circle at 40% 35%, #eafcff 0%, #9ef0ff 35%, #37b8de 70%, #0c3550 100%)',
              transform: c.value === 'hologram' ? 'rotateX(0deg)' : 'none' }}></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: c.active ? 'var(--nv-acc)' : 'var(--nv-ink)' }}>{c.label}</span>
              <span style={{ display: 'block', marginTop: '2px', fontSize: '11.5px', color: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' }}>{c.hint}</span>
            </span>
            {c.active && <span style={{ marginLeft: 'auto', font: "500 9.5px 'IBM Plex Mono',monospace", letterSpacing: '.14em', color: 'var(--nv-acc)' }}>ACTIVE</span>}
          </Interactive>
        ))}

        <Interactive
          onClick={v.toggleCalm}
          base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '12px', border: '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)', background: 'rgba(0,0,0,.2)', marginTop: '14px' }}
          hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}
        >
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>Calm mode</span>
            <span style={{ display: 'block', marginTop: '2px', fontSize: '11.5px', color: 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' }}>dims the glow and pauses ambient motion — same layout, lower voltage</span>
          </span>
          <span style={{ marginLeft: 'auto', flex: 'none', font: "500 9.5px 'IBM Plex Mono',monospace", letterSpacing: '.14em', padding: '6px 12px', borderRadius: '14px', border: v.calmMode ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent)', color: v.calmMode ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)', background: v.calmMode ? 'var(--nv-acc-bg)' : 'none' }}>{v.calmMode ? 'ON' : 'OFF'}</span>
        </Interactive>
      </div>

      {v.pushSettings && (
        <div style={{ marginTop: '34px' }}>
          <div style={css("font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>NOTIFICATIONS</div>
          <div className="nv-pane" style={{ marginTop: '12px', padding: '14px 18px', maxWidth: '520px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ minWidth: 0, flex: '1 1 240px' }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>Phone & Watch notifications</span>
              <span style={{ display: 'block', marginTop: '2px', font: "500 9.5px 'IBM Plex Mono',monospace", letterSpacing: '.06em', color: v.pushSettings.state === 'on' ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' }}>{v.pushSettings.label}</span>
            </span>
            {v.pushSettings.state !== 'on' && v.pushSettings.state !== 'unsupported' && (
              <Interactive as="span" onClick={v.pushSettings.enable} base="cursor:pointer;font:600 10.5px 'IBM Plex Mono',monospace;letter-spacing:.08em;padding:9px 16px;border-radius:8px;background:var(--nv-cy);color:#0a2830" hoverStyle="filter:brightness(1.08)">ENABLE</Interactive>
            )}
            {v.pushSettings.state === 'on' && (
              <Interactive as="span" onClick={v.pushSettings.test} base="cursor:pointer;font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.08em;padding:8px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy)" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 08%, transparent)">TEST</Interactive>
            )}
          </div>
          <div style={css("margin-top:8px;max-width:520px;font-size:11px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Pushes fire when something needs your call — a drafted brief, a research outline, a Guardian alert. iPhone mirrors them to the Apple Watch automatically. Requires Nova installed to the Home Screen (Safari → Share → Add to Home Screen).</div>
        </div>
      )}

      {v.timeMachine && (
        <div style={{ marginTop: '34px' }}>
          <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
            <span style={css("font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:var(--nv-gold)")}>TIME MACHINE · GUARDIAN</span>
            <span style={css("font:400 9px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>EVERY VAULT WRITE SNAPSHOTS FIRST — RESTORE ANY FILE, UNDOABLY</span>
            {!v.timeMachine.loaded && (
              <Interactive as="span" onClick={v.timeMachine.load} base="cursor:pointer;font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.08em;padding:5px 12px;border-radius:7px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);color:var(--nv-gold)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 08%, transparent)">BROWSE SNAPSHOTS</Interactive>
            )}
          </div>
          {v.timeMachine.loaded && v.timeMachine.files.length === 0 && (
            <div style={css("margin-top:10px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>No snapshots yet — they appear with the first vault write-back.</div>
          )}
          {v.timeMachine.files.length > 0 && (
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:10px;max-width:640px")}>
              {v.timeMachine.files.map((f) => (
                <div key={f.file} className="nv-pane" style={{ padding: '12px 15px' }}>
                  <div style={css("display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap")}>
                    <span style={css("font:600 13px 'Rajdhani',sans-serif;overflow-wrap:anywhere")}>{f.file}{!f.exists && <span style={css("color:var(--nv-warn);font:500 9px 'IBM Plex Mono',monospace")}> · DELETED</span>}</span>
                  </div>
                  <div style={css("margin-top:6px;display:flex;flex-direction:column;gap:4px")}>
                    {f.backups.map((b) => (
                      <div key={b.backupRel} style={css("display:flex;justify-content:space-between;gap:10px;align-items:center")}>
                        <span style={css("font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>{b.stamp}</span>
                        {v.timeMachine.confirming === b.backupRel ? (
                          <span style={css("display:flex;gap:8px;align-items:center")}>
                            <span style={css("font-size:11px;color:var(--nv-warn)")}>Overwrite the current file with this snapshot?</span>
                            <Interactive as="span" onClick={() => v.timeMachine.restore(b.backupRel)} base="cursor:pointer;font:600 9px 'IBM Plex Mono',monospace;padding:3px 10px;border-radius:6px;background:color-mix(in srgb, var(--nv-warn) 15%, transparent);color:var(--nv-warn);border:1px solid color-mix(in srgb, var(--nv-warn) 40%, transparent)">RESTORE</Interactive>
                            <Interactive as="span" onClick={v.timeMachine.cancelConfirm} base="cursor:pointer;font:400 9px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)">cancel</Interactive>
                          </span>
                        ) : (
                          <Interactive as="span" onClick={() => v.timeMachine.askConfirm(b.backupRel)} base="cursor:pointer;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:.08em;padding:3px 10px;border-radius:6px;border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)" hoverStyle="border-color:color-mix(in srgb, var(--nv-gold) 40%, transparent);color:var(--nv-gold)">RESTORE…</Interactive>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={css("margin-top:20px;max-width:520px;font-size:11.5px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
        The token comes from <code>server/.env</code> on your Mac (auto-generated on first run).
        See <code>server/README.md</code> in the repo for running the backend, installing it as a
        launchd service, and setting up Tailscale so your phone can reach it from anywhere.
      </div>
    </div>
  );
}
