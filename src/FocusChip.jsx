import { useState, useEffect } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

// The focus-block countdown — a self-ticking leaf (like Clock) so the 1Hz
// tick re-renders this chip only, never the app. When the block ends it
// offers to journal the completed block (review of one tap, per the plan's
// "logs to journal on completion").
export function FocusChip({ v }) {
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const remainingMs = v.endsAt - Date.now();
  const done = remainingMs <= 0;
  const mm = Math.max(0, Math.floor(remainingMs / 60000));
  const ss = Math.max(0, Math.floor((remainingMs % 60000) / 1000));

  return (
    <div style={css(`display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid color-mix(in srgb, var(--nv-cy) ${done ? '55' : '30'}%, transparent);border-radius:11px;padding:9px 14px;background:color-mix(in srgb, var(--nv-cy) 06%, transparent)`)}>
      <span style={css("font:500 8.5px var(--nv-font-mono);letter-spacing:.18em;color:var(--nv-cy)")}>{done ? 'FOCUS BLOCK DONE' : 'FOCUS'}</span>
      <span style={css("font:600 13px var(--nv-font-ui);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{v.label}</span>
      {!done && <span style={css("font:600 13px var(--nv-font-mono);font-variant-numeric:tabular-nums;color:var(--nv-cy)")}>{mm}:{String(ss).padStart(2, '0')}</span>}
      {done ? (
        <>
          <Interactive as="span" onClick={v.log} base="cursor:pointer;font:600 9.5px var(--nv-font-mono);letter-spacing:.06em;padding:6px 12px;border-radius:7px;background:var(--nv-cy);color:#0a2830" hoverStyle="filter:brightness(1.08)">JOURNAL IT</Interactive>
          <Interactive as="span" onClick={v.dismiss} base="cursor:pointer;font:400 9.5px var(--nv-font-mono);color:var(--nv-ink40)" hoverStyle="color:var(--nv-ink)">dismiss</Interactive>
        </>
      ) : (
        <Interactive as="span" onClick={v.dismiss} base="cursor:pointer;font:400 9.5px var(--nv-font-mono);color:var(--nv-ink40);margin-left:auto" hoverStyle="color:var(--nv-warn)">abandon</Interactive>
      )}
    </div>
  );
}
