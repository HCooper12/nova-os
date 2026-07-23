import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function CommandPalette({ v }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Command palette" onClick={v.closePalette} style={css("position:fixed;inset:0;background:rgba(8,5,12,.6);backdrop-filter:blur(5px);z-index:80;display:flex;justify-content:center;padding-top:14vh")}>
      <div onClick={v.stopClick} style={css("width:560px;max-width:92vw;height:fit-content;border:1px solid var(--nv-acc-border);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(20px);box-shadow:0 40px 90px -20px rgba(0,0,0,.95),var(--nv-glow-tab),inset 0 1px 0 var(--nv-spec);overflow:hidden;animation:fadeUp .25s ease-out")}>
        <div style={css("display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}>
          <span style={css("width:8px;height:8px;border-radius:50%;background:radial-gradient(circle at 40% 35%, #eafcff, #59a8de 60%, #0c3550);box-shadow:0 0 10px var(--nv-cy);animation:novaPulse 2.4s infinite var(--nv-anim)")}></span>
          <input
            ref={v.paletteRef}
            value={v.paletteQuery}
            onChange={v.setPaletteQuery}
            onKeyDown={v.paletteKeyDown}
            placeholder="Summon Nova — search, command, or ask anything…"
            style={css("flex:1;background:none;border:none;outline:none;color:var(--nv-ink);font:500 15px var(--nv-font-ui)")}
          />
          <span style={css("font:500 9.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:5px;padding:3px 7px")}>ESC</span>
        </div>
        <div style={css("max-height:340px;overflow-y:auto;padding:8px")}>
          {v.paletteResults.map((c, i) => (
            <Interactive
              key={i}
              onClick={c.run}
              base="cursor:pointer;display:flex;align-items:center;gap:13px;padding:11px 13px;border-radius:8px"
              hoverStyle="background:var(--nv-acc-bg)"
            >
              <span style={css(`font:400 12px var(--nv-font-mono);color:${c.iconColor};width:16px;text-align:center`)}>{c.icon}</span>
              <span style={css("font-size:13.5px;color:color-mix(in srgb, var(--nv-ink) 90%, transparent)")}>{c.label}</span>
              <span style={css("margin-left:auto;font:400 9.5px var(--nv-font-mono);letter-spacing:.1em;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>{c.hint}</span>
            </Interactive>
          ))}
        </div>
        <div style={css("display:flex;gap:16px;padding:11px 20px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);font:400 9.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>
          <span>↵ RUN</span><span>ESC CLOSE</span><span style={css("margin-left:auto;color:color-mix(in srgb, var(--nv-gold) 55%, transparent)")}>NOVA ROUTES TO THE RIGHT AGENT</span>
        </div>
      </div>
    </div>
  );
}
