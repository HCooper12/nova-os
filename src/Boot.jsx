import { css } from './css.js';
import { NovaCore } from './NovaCore.jsx';
import { getCoreStyle } from './theme.js';

export function Boot({ info }) {
  const lines = info
    ? [info.vaultLine, info.recipesLine, info.agentsLine]
    : ['VAULT · CONNECTING…', 'RECIPES · CONNECTING…', 'JOURNAL · CONNECTING…'];
  return (
    <div style={css("position:fixed;inset:0;z-index:100;background:radial-gradient(900px 560px at 50% 42%, var(--nv-bg2) 0%, var(--nv-void) 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px")}>
      <div style={css("position:relative;width:150px;height:150px;display:flex;align-items:center;justify-content:center")}>
        <span style={css("position:absolute;inset:0;border-radius:50%;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);border-top-color:var(--nv-cy);animation:ringSpin 2.4s linear infinite")}></span>
        <span style={css("position:absolute;inset:14px;border-radius:50%;border:1px dashed color-mix(in srgb, var(--nv-gold) 30%, transparent);animation:ringSpin 9s linear infinite reverse")}></span>
        <NovaCore size={112} engine={getCoreStyle()} />
      </div>
      <div style={css("font:700 26px var(--nv-font-ui);letter-spacing:.34em;color:var(--nv-ink);padding-left:.34em")}>NOVA<span style={css("background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi));-webkit-background-clip:text;background-clip:text;color:transparent")}>·OS</span></div>
      <div style={css("display:flex;flex-direction:column;gap:7px;font:400 10px var(--nv-font-mono);letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);text-align:center")}>
        {lines.map((line, i) => (
          <div key={i} style={{ animation: `fadeUp .5s ease-out ${i * 0.35}s both` }}>{line}</div>
        ))}
      </div>
      <div style={css("width:220px;height:2px;border-radius:2px;background:color-mix(in srgb, var(--nv-ink) 10%, transparent);overflow:hidden")}><div style={css("height:100%;background:linear-gradient(90deg,var(--nv-gold),var(--nv-cy));animation:barSweep 1.5s ease-out both")}></div></div>
    </div>
  );
}
