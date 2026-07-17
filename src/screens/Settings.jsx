import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

const statusColor = { idle: 'rgba(236,229,218,.5)', testing: '#d8b573', ok: '#5aa87c', error: '#c96f6f' };

export function Settings({ v }) {
  return (
    <div style={v.wrapSettings} data-screen-label="Settings">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>VIII.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>SYSTEM · SETTINGS</span>
        </div>
      </div>
      <h1 style={css("margin:18px 0 0;font:400 38px/1.1 'Instrument Serif',serif")}>Connect the <span style={css("font-style:italic;color:#d8b573")}>real vault.</span></h1>
      <div style={css("margin-top:8px;font-size:13px;color:rgba(236,229,218,.6);max-width:640px;line-height:1.6")}>
        Point Nova OS at the backend running on your Mac to replace the demo data with your
        real Obsidian vault, calendar, and health data. Until then the app runs in demo mode —
        everything you see is clearly-badged sample data.
      </div>

      <div style={css("margin-top:28px;max-width:520px;border:1px solid rgba(236,229,218,.09);border-radius:14px;padding:24px 26px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.06)")}>
        <label htmlFor="settings-base-url" style={css("display:block;font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.45)")}>BACKEND URL</label>
        <Interactive
          as="input"
          id="settings-base-url"
          value={v.settingsBaseUrl}
          onChange={v.setSettingsBaseUrl}
          placeholder="https://your-mac.tailxxxx.ts.net:4173"
          base="margin-top:8px;width:100%;box-sizing:border-box;background:rgba(0,0,0,.32);border:1px solid rgba(236,229,218,.12);border-radius:9px;padding:10px 14px;color:#ece5da;font-size:13px;font-family:'JetBrains Mono',monospace;outline:none"
          focusStyle="border-color:rgba(216,181,115,.5)"
        />

        <label htmlFor="settings-token" style={css("display:block;margin-top:16px;font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:rgba(236,229,218,.45)")}>API TOKEN</label>
        <Interactive
          as="input"
          id="settings-token"
          type="password"
          value={v.settingsToken}
          onChange={v.setSettingsToken}
          placeholder="printed in the server's terminal on first run"
          base="margin-top:8px;width:100%;box-sizing:border-box;background:rgba(0,0,0,.32);border:1px solid rgba(236,229,218,.12);border-radius:9px;padding:10px 14px;color:#ece5da;font-size:13px;font-family:'JetBrains Mono',monospace;outline:none"
          focusStyle="border-color:rgba(216,181,115,.5)"
        />

        <div style={css("margin-top:18px;display:flex;gap:10px;flex-wrap:wrap")}>
          <Interactive as="span" onClick={v.testSettingsConnection} base="cursor:pointer;font-size:12.5px;font-weight:500;padding:9px 16px;border-radius:8px;border:1px solid rgba(107,229,245,.4);color:#6be5f5;background:rgba(107,229,245,.06)" hoverStyle="background:rgba(107,229,245,.14)">Test connection</Interactive>
          <Interactive as="span" onClick={v.saveSettingsConnection} base="cursor:pointer;font-size:12.5px;font-weight:500;padding:9px 16px;border-radius:8px;background:#d8b573;color:#1a1322" hoverStyle="background:#e6c98f">Save &amp; connect</Interactive>
          {v.connectionActive && (
            <Interactive as="span" onClick={v.disconnectSettings} base="cursor:pointer;font-size:12.5px;padding:9px 16px;border-radius:8px;border:1px solid rgba(236,229,218,.16);color:rgba(236,229,218,.7)" hoverStyle="background:rgba(255,255,255,.05)">Disconnect</Interactive>
          )}
        </div>

        <div style={css(`margin-top:16px;font-size:12.5px;color:${statusColor[v.settingsTestStatus]}`)}>{v.settingsTestMessage}</div>
      </div>

      <div style={css("margin-top:20px;max-width:520px;font-size:11.5px;line-height:1.7;color:rgba(236,229,218,.4)")}>
        The token comes from <code>server/.env</code> on your Mac (auto-generated on first run).
        See <code>server/README.md</code> in the repo for running the backend, installing it as a
        launchd service, and setting up Tailscale so your phone can reach it from anywhere.
      </div>
    </div>
  );
}
