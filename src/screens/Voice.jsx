import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';

export function Voice({ v }) {
  return (
    <div style={v.wrapVoice} data-screen-label="Voice">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.14em;color:var(--nv-acc)")}>II.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>NEURAL LINK · VOICE</span>
          <span style={css("font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.14em;padding:5px 10px;border-radius:7px;border:1px solid rgba(224,143,111,.45);color:#e08f6f;background:rgba(224,143,111,.08)")}>CONCEPT PREVIEW · NOT REAL SPEECH YET</span>
        </div>
        <div style={css("font:400 26px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>{v.clock}</div>
      </div>
      <div style={css("flex:1;display:flex;flex-wrap:wrap;gap:28px;align-items:center;justify-content:center;margin-top:10px;overflow-y:auto")}>
        <div style={css("width:230px;flex:none;display:flex;flex-direction:column;gap:15px;font:400 10.5px 'IBM Plex Mono',monospace;letter-spacing:.14em")}>
          <div><div style={css("display:flex;justify-content:space-between;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}><span>STATUS</span><span style={css("color:var(--nv-cy)")}>{v.micStatus}</span></div><div style={css("margin-top:6px;height:2px;background:color-mix(in srgb, var(--nv-cy) 14%, transparent)")}><div style={v.micBar}></div></div></div>
          <div><div style={css("display:flex;justify-content:space-between;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}><span>VOICE</span><span style={css("color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>PLANNED</span></div><div style={css("margin-top:6px;height:2px;background:color-mix(in srgb, var(--nv-cy) 14%, transparent)")}><div style={css("width:0%;height:100%;background:var(--nv-cy)")}></div></div></div>
          <div><div style={css("display:flex;justify-content:space-between;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}><span>SPEECH ENGINE</span><span style={css("color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>NOT WIRED</span></div><div style={css("margin-top:6px;height:2px;background:color-mix(in srgb, var(--nv-cy) 14%, transparent)")}><div style={css("width:0%;height:100%;background:var(--nv-cy)")}></div></div></div>
          <div><div style={css("display:flex;justify-content:space-between;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}><span>VAULT LOG</span><span style={css("color:var(--nv-gold)")}>PLANNED</span></div><div style={css("margin-top:6px;height:2px;background:color-mix(in srgb, var(--nv-gold) 16%, transparent)")}><div style={css("width:0%;height:100%;background:var(--nv-gold)")}></div></div></div>
          <div style={css("margin-top:6px;border:1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent);border-radius:10px;padding:12px 14px;background:rgba(0,0,0,.2)")}>
            <div style={css("font-size:9px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);letter-spacing:.2em")}>ON THE LINE · CONCEPT</div>
            <div style={css("margin-top:8px;display:flex;flex-direction:column;gap:6px;font-size:10.5px;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>
              <div style={css("display:flex;justify-content:space-between")}><span>COMMANDER</span><span style={css("color:var(--nv-cy)")}>●</span></div>
              <div style={css("display:flex;justify-content:space-between")}><span>COACH</span><span style={css("color:var(--nv-cy)")}>●</span></div>
              <div style={css("display:flex;justify-content:space-between")}><span>CFO</span><span style={css("color:color-mix(in srgb, var(--nv-ink) 30%, transparent)")}>○</span></div>
            </div>
          </div>
        </div>
        <div style={css("flex:1;min-width:320px;display:flex;flex-direction:column;align-items:center;gap:20px")}>
          <div style={css("position:relative;width:300px;height:300px;display:flex;align-items:center;justify-content:center;box-shadow:var(--nv-glow-core);border-radius:50%")}>
            <div style={css("position:absolute;inset:0;border-radius:50%;border:1px dashed color-mix(in srgb, var(--nv-cy) 22%, transparent);animation:ringSpin 44s linear infinite var(--nv-anim)")}></div>
            <div style={css("position:absolute;inset:24px;border-radius:50%;border:1px solid color-mix(in srgb, var(--nv-cy) 28%, transparent);border-top-color:color-mix(in srgb, var(--nv-cy) 85%, transparent);animation:ringSpin 14s linear infinite reverse var(--nv-anim)")}></div>
            <NovaCore size={252} engine={v.coreStyle} />
          </div>
          <div style={css("font:400 10px 'IBM Plex Mono',monospace;letter-spacing:.42em;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)")}>{v.orbCaption}</div>
          {v.micOn && (
            <div style={css("display:flex;gap:3px;align-items:center;height:26px")}>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 80%, transparent);animation:wave 1.1s ease-in-out infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 60%, transparent);animation:wave 1.1s ease-in-out .12s infinite")}></span>
              <span style={css("width:3px;height:22px;background:var(--nv-cy);animation:wave 1.1s ease-in-out .24s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 90%, transparent);animation:wave 1.1s ease-in-out .36s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 50%, transparent);animation:wave 1.1s ease-in-out .48s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 75%, transparent);animation:wave 1.1s ease-in-out .6s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 55%, transparent);animation:wave 1.1s ease-in-out .72s infinite")}></span>
            </div>
          )}
          <div style={css("display:flex;gap:10px")}>
            <Interactive as="span" onClick={v.toggleMic} base={v.micBtnStyle} hoverStyle="border-color:color-mix(in srgb, var(--nv-cy) 60%, transparent)">{v.micBtnLabel}</Interactive>
            <Interactive as="span" onClick={v.briefMe} base="cursor:pointer;font:500 10.5px 'IBM Plex Mono',monospace;padding:9px 16px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);border-radius:8px;color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 12%, transparent)">☰ BRIEF ME</Interactive>
          </div>
        </div>
        <div style={css("flex:1 1 340px;min-width:300px;max-width:470px;min-height:360px;max-height:560px;border-left:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-left:24px;display:flex;flex-direction:column")}>
          <div style={css("font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.28em;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>TRANSCRIPT</div>
          <div style={css("flex:1;overflow-y:auto;margin-top:14px;display:flex;flex-direction:column;gap:14px;font:400 12.5px/1.7 'IBM Plex Mono',monospace")}>
            {v.orbMsgs.map((m, i) => (
              <div key={i} style={css("animation:fadeUp .4s ease-out")}><span style={m.tagStyle}>{m.tag}</span> <span style={css("color:color-mix(in srgb, var(--nv-ink) 90%, transparent)")}>{m.text}</span>{m.typing && <span style={css("color:var(--nv-cy)")}>▍</span>}</div>
            ))}
          </div>
          <div style={css("display:flex;gap:8px;margin-top:14px")}>
            <Interactive
              as="input"
              value={v.orbInput}
              onChange={v.setOrbInput}
              onKeyDown={v.orbKey}
              placeholder="Speak or type to Nova…"
              base="flex:1;background:rgba(0,0,0,.32);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font:400 12.5px 'IBM Plex Mono',monospace;outline:none"
              focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)"
            />
            <Interactive as="span" onClick={v.sendOrb} base="cursor:pointer;display:flex;align-items:center;font:500 11px 'IBM Plex Mono',monospace;padding:0 16px;border-radius:9px;background:var(--nv-cy);color:#0a2830" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 80%, white)">SEND</Interactive>
          </div>
        </div>
      </div>
    </div>
  );
}
