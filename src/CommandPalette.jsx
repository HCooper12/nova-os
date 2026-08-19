import { useState } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

export function CommandPalette({ v }) {
  // P8: the query lives HERE — a keystroke re-renders this overlay only,
  // never the whole app. Recall results still arrive through App state
  // (debounced vault fetch) and merge in on the next normal render.
  const [q, setQ] = useState('');
  const results = v.paletteResultsFor(q);
  // THE FRONT DOOR (C1): anything that isn't a navigation match is routed
  // by deterministic rules to the lane that already handles it — a link, a
  // build request, a training question, a capture. The chip shows WHERE it
  // will go before Enter sends it; ⇧↵ forces the router over navigation.
  const route = v.routePreview(q);
  const send = () => { if (route) { v.sendIntent(q); setQ(''); } };
  return (
    <div role="dialog" aria-modal="true" aria-label="Command palette" onClick={v.closePalette} style={css("position:fixed;inset:0;background:rgba(8,5,12,.6);backdrop-filter:blur(5px);z-index:80;display:flex;justify-content:center;padding-top:14vh")}>
      <div onClick={v.stopClick} style={css("width:560px;max-width:92vw;height:fit-content;border:1px solid var(--nv-acc-border);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(20px);box-shadow:0 40px 90px -20px rgba(0,0,0,.95),var(--nv-glow-tab),inset 0 1px 0 var(--nv-spec);overflow:hidden;animation:fadeUp .25s ease-out")}>
        <div style={css("display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}>
          <span style={css("width:8px;height:8px;border-radius:50%;background:radial-gradient(circle at 40% 35%, #eafcff, #59a8de 60%, #0c3550);box-shadow:0 0 10px var(--nv-cy);animation:novaPulse 2.4s infinite var(--nv-anim)")}></span>
          <input
            ref={v.paletteRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); v.queueRecall(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (e.shiftKey) { send(); return; }
              if (results[0]) results[0].run(); else send();
            }}
            placeholder="Ask, paste a link, or tell Nova to build something…"
            style={css("flex:1;background:none;border:none;outline:none;color:var(--nv-ink);font:500 15px var(--nv-font-ui)")}
          />
          {route && (
            <Interactive as="span" onClick={send} title={route.why}
              base={css("cursor:pointer;font:600 9.5px var(--nv-font-mono);letter-spacing:.1em;color:var(--nv-cy);border:1px solid color-mix(in srgb, var(--nv-cy) 45%, transparent);background:color-mix(in srgb, var(--nv-cy) 10%, transparent);border-radius:5px;padding:4px 9px;white-space:nowrap")}
              hoverStyle="background:color-mix(in srgb, var(--nv-cy) 20%, transparent)">→ {route.label}</Interactive>
          )}
          <span style={css("font:500 9.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent);border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:5px;padding:3px 7px")}>ESC</span>
        </div>
        {route && (
          <div style={css("padding:9px 20px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent);font-size:11.5px;line-height:1.45;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
            <b style={css("color:var(--nv-cy);font-weight:600")}>{route.label}</b> — {route.why}
          </div>
        )}
        <div style={css("max-height:340px;overflow-y:auto;padding:8px")}>
          {results.map((c, i) => (
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
          <span>↵ RUN</span><span>⇧↵ ROUTE</span><span>ESC CLOSE</span><span style={css("margin-left:auto;color:color-mix(in srgb, var(--nv-gold) 55%, transparent)")}>NOVA ROUTES TO THE RIGHT AGENT</span>
        </div>
      </div>
    </div>
  );
}
