import { useEffect, useState, useRef } from 'react';
import { css } from '../css.js';
import { NovaCore } from '../NovaCore.jsx';
import { CountUp } from '../CountUp.jsx';

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

// `count` numbers animate to their value; `value` is for text like "09:45"
function Tile({ label, value, count, format, sub, accent }) {
  const numStyle = css(`font:300 34px ${M};color:${accent || dim(85)};font-variant-numeric:tabular-nums`);
  return (
    <div style={css("display:flex;flex-direction:column;align-items:center;gap:6px;min-width:120px")}>
      <span style={css(`font:500 10px ${M};letter-spacing:.3em;color:${dim(32)}`)}>{label}</span>
      {count !== undefined
        ? <CountUp value={count} format={format} style={numStyle} />
        : <span style={numStyle}>{value ?? '—'}</span>}
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
      {/* the room reads the state before the numbers: gold wash = something
          waits on him; cyan = board clear */}
      <div style={css(`position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%, color-mix(in srgb, ${v.ambientState === 'attention' ? 'var(--nv-gold)' : 'var(--nv-cy)'} 07%, transparent), transparent 62%);pointer-events:none;transition:background 2s`)} />

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

      <div style={css("display:flex;flex-direction:column;align-items:center;gap:26px;width:100%")}>
        <div style={css("display:flex;gap:44px;flex-wrap:wrap;justify-content:center;align-items:flex-end")}>
          <Tile label="NEXT" value={v.ambientNext?.time} sub={v.ambientNext?.label} />
          <Tile label="STEPS" count={v.ambientSteps} />
          <Tile label="PROTEIN" count={v.ambientProtein?.p ?? null} format={(n) => `${Math.round(n)}g`} sub={v.ambientProtein?.floor ? `floor ${v.ambientProtein.floor}g` : null} />
          <Tile label="GATE" count={v.ambientPending} sub={v.ambientPending > 0 ? 'awaiting your yes' : 'clear'} accent={v.ambientPending > 0 ? 'var(--nv-gold)' : 'var(--nv-good)'} />
        </div>
        {v.ambientObjectives?.length > 0 && (
          <div style={css("display:flex;gap:30px;flex-wrap:wrap;justify-content:center")}>
            {v.ambientObjectives.map((o) => (
              <div key={o.key} style={css("display:flex;align-items:baseline;gap:9px")}>
                <span style={css(`font:500 9px ${M};letter-spacing:.26em;color:${dim(30)}`)}>{o.label}</span>
                <span style={css(`font:300 16px ${M};color:${dim(70)};font-variant-numeric:tabular-nums`)}>{o.value}</span>
              </div>
            ))}
          </div>
        )}
        <PulseStrip items={v.ambientPulseItems} />
        <StreamStrip items={v.ambientStream} />
      </div>
    </div>
  );
}

// The Stream strip — the system's newest real receipts, faint and factual.
// Presence proves itself with the actual ledger; a quiet system shows a
// quiet strip, never a looping animation.
function StreamStrip({ items }) {
  if (!items?.length) return null;
  return (
    <div style={css("display:flex;flex-direction:column;align-items:center;gap:3px;max-width:720px;width:100%")}>
      {items.slice(0, 3).map((e) => (
        <div key={e.id} style={css("display:flex;align-items:baseline;gap:10px;max-width:100%")}>
          <span style={css(`flex:none;font:400 8.5px ${M};color:${dim(24)};font-variant-numeric:tabular-nums`)}>{e.when}</span>
          <span style={css(`font:400 10.5px ${M};color:${dim(38)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>{e.label}</span>
        </div>
      ))}
    </div>
  );
}

// The pulse strip — one cached item at a time, rotating slowly. Reads only
// what the nightly pulse runs actually fetched; absent cache, absent strip.
function PulseStrip({ items }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!items?.length) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 9000);
    return () => clearInterval(t);
  }, [items?.length]);
  if (!items?.length) return null;
  const item = items[idx % items.length];
  return (
    <div key={idx} style={css(`display:flex;align-items:baseline;gap:10px;max-width:720px;padding:0 10px;animation:fadeUp .6s ease-out`)}>
      <span style={css(`flex:none;font:500 8.5px ${M};letter-spacing:.22em;color:${dim(30)}`)}>PULSE · {item.topic.split(' ').slice(0, 3).join(' ').toUpperCase()}</span>
      <span style={css(`font:400 12px ${M};color:${dim(55)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>{item.title}</span>
      <span style={css(`flex:none;font:400 8.5px ${M};color:${dim(28)}`)}>{item.source}</span>
    </div>
  );
}
