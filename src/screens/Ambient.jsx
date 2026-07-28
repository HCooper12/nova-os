import { useEffect, useState, useRef } from 'react';
import { css } from '../css.js';
import { NovaCore } from '../NovaCore.jsx';

const M = "var(--nv-font-mono)";
const dim = (pct) => `color-mix(in srgb, var(--nv-ink) ${pct}%, transparent)`;

// Ambient wall mode — Nova as presence, not app. A near-black fullscreen
// face for the Mac (or any spare screen): the core breathing, the time, the
// day's honest numbers, the human gate count. Tap anywhere to come back.
// Every figure is the same live state the rest of the app shows — missing
// data shows as an em dash, never invented.

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// Best-effort screen wake lock — supported on installed PWAs and desktop
// Chrome/Safari; where it isn't, the OS display sleep just applies.
function useWakeLock() {
  const lock = useRef(null);
  useEffect(() => {
    let alive = true;
    const acquire = async () => {
      try { if (alive && navigator.wakeLock) lock.current = await navigator.wakeLock.request('screen'); } catch { /* best-effort */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      try { lock.current?.release(); } catch { /* released with the page */ }
    };
  }, []);
}

function Tile({ label, value, sub, accent }) {
  return (
    <div style={css("display:flex;flex-direction:column;align-items:center;gap:6px;min-width:120px")}>
      <span style={css(`font:500 10px ${M};letter-spacing:.3em;color:${dim(32)}`)}>{label}</span>
      <span style={css(`font:300 34px ${M};color:${accent || dim(85)};font-variant-numeric:tabular-nums`)}>{value ?? '—'}</span>
      {sub && <span style={css(`font:400 10px ${M};color:${dim(30)}`)}>{sub}</span>}
    </div>
  );
}

export function Ambient({ v }) {
  const now = useClock();
  useWakeLock();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateLine = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  return (
    <div onClick={v.exitAmbient} title="Tap anywhere to return"
      style={css("position:fixed;inset:0;z-index:95;background:#04050a;display:flex;flex-direction:column;align-items:center;justify-content:space-between;cursor:pointer;padding:calc(24px + env(safe-area-inset-top)) 24px calc(28px + env(safe-area-inset-bottom));overflow:hidden")}>
      <div style={css("position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--nv-cy) 07%, transparent), transparent 62%);pointer-events:none")} />

      <div style={css("display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:8px")}>
        <div style={css(`font:200 96px/1 ${M};letter-spacing:.04em;color:${dim(92)};font-variant-numeric:tabular-nums`)}>
          {hh}<span style={css(`color:${dim(35)};animation:dotBlink 2s infinite`)}>:</span>{mm}
        </div>
        <div style={css(`font:500 11px ${M};letter-spacing:.42em;color:${dim(35)}`)}>{dateLine}</div>
      </div>

      <div style={css("display:flex;flex-direction:column;align-items:center;gap:22px")}>
        <NovaCore size={300} engine={v.coreStyle} />
        <div style={css(`font:400 16px var(--nv-font-serif), serif;font-style:italic;color:${dim(62)};text-align:center;max-width:560px;padding:0 12px`)}>{v.heroTagline}</div>
      </div>

      <div style={css("display:flex;gap:44px;flex-wrap:wrap;justify-content:center;align-items:flex-end")}>
        <Tile label="NEXT" value={v.ambientNext?.time} sub={v.ambientNext?.label} />
        <Tile label="STEPS" value={v.ambientSteps?.toLocaleString?.() ?? v.ambientSteps} />
        <Tile label="PROTEIN" value={v.ambientProtein?.p != null ? `${v.ambientProtein.p}g` : null} sub={v.ambientProtein?.floor ? `floor ${v.ambientProtein.floor}g` : null} />
        <Tile label="GATE" value={v.ambientPending} sub={v.ambientPending > 0 ? 'awaiting your yes' : 'clear'} accent={v.ambientPending > 0 ? 'var(--nv-gold)' : 'var(--nv-good)'} />
      </div>
    </div>
  );
}
