import { css } from './css.js';

export function Boot({ info }) {
  const lines = info
    ? [info.vaultLine, info.recipesLine, info.agentsLine]
    : ['VAULT · CONNECTING…', 'RECIPES · CONNECTING…', 'JOURNAL · CONNECTING…'];
  return (
    <div style={css("position:fixed;inset:0;z-index:100;background:radial-gradient(900px 560px at 50% 42%, #241a2e 0%, #120d18 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px")}>
      <div style={css("position:relative;width:130px;height:130px;display:flex;align-items:center;justify-content:center")}>
        <span style={css("position:absolute;inset:0;border-radius:50%;border:1px solid rgba(107,229,245,.4);border-top-color:#6be5f5;animation:ringSpin 2.4s linear infinite")}></span>
        <span style={css("position:absolute;inset:16px;border-radius:50%;border:1px dashed rgba(216,181,115,.3);animation:ringSpin 9s linear infinite reverse")}></span>
        <span style={css("width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 40% 35%, #fff3da, #ecc98a 45%, #a3742f 75%, #3a2a12);animation:orbGlow 2.2s ease-in-out infinite")}></span>
      </div>
      <div style={css("font:400 40px 'Instrument Serif',serif;letter-spacing:.06em")}>N O V A</div>
      <div style={css("display:flex;flex-direction:column;gap:7px;font:400 10px 'JetBrains Mono',monospace;letter-spacing:.2em;color:rgba(236,229,218,.55);text-align:center")}>
        {lines.map((line, i) => (
          <div key={i} style={{ animation: `fadeUp .5s ease-out ${i * 0.35}s both` }}>{line}</div>
        ))}
      </div>
      <div style={css("width:220px;height:2px;border-radius:2px;background:rgba(236,229,218,.1);overflow:hidden")}><div style={css("height:100%;background:linear-gradient(90deg,#d8b573,#6be5f5);animation:barSweep 1.5s ease-out both")}></div></div>
    </div>
  );
}
