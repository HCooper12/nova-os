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

// Past this many minutes without a successful sync the wall stops
// pretending its numbers are live.
const AMBIENT_STALE_MIN = 15;

export function Ambient({ v }) {
  const now = useClock();
  useWakeLock();
  const stale = v.ambientSyncMin != null && v.ambientSyncMin >= AMBIENT_STALE_MIN;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const dateLine = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  return (
    <div onClick={v.exitAmbient} title="Tap anywhere to return"
      style={css("position:fixed;inset:0;z-index:95;background:#04050a;display:flex;flex-direction:column;align-items:center;justify-content:space-between;cursor:pointer;padding:calc(24px + env(safe-area-inset-top)) 24px calc(28px + env(safe-area-inset-bottom));overflow:hidden")}>
      {/* the room reads the state before the numbers: gold wash = something
          waits on him; cyan = board clear */}
      {/* no wash at all when the state is unknown — a room that glows "clear" with the server down is a lie on the wall */}
      {v.ambientState !== 'unknown' && (
        <div style={css(`position:absolute;inset:0;background:radial-gradient(ellipse at 50% 42%, color-mix(in srgb, ${v.ambientState === 'attention' ? 'var(--nv-gold)' : 'var(--nv-cy)'} 07%, transparent), transparent 62%);pointer-events:none;transition:background 2s`)} />
      )}

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

      {/* a slow drift of a few pixels over an hour — a wall face on an OLED
          panel must never hold one pixel pattern all night */}
      <style>{`@keyframes nvDrift{0%{transform:translate(0,0)}25%{transform:translate(3px,-2px)}50%{transform:translate(0,3px)}75%{transform:translate(-3px,1px)}100%{transform:translate(0,0)}}`}</style>
      <div style={css(`display:flex;flex-direction:column;align-items:center;gap:26px;width:100%;animation:nvDrift 3600s linear infinite;${stale ? 'opacity:.55;' : ''}transition:opacity 1.2s`)}>
        <div style={css("display:flex;gap:44px;flex-wrap:wrap;justify-content:center;align-items:flex-end")}>
          <Tile label="NEXT" value={v.ambientNext?.time} sub={v.ambientNext?.label} />
          <Tile label="STEPS" count={v.ambientSteps} />
          <Tile label="PROTEIN" count={v.ambientProtein?.p ?? null} format={(n) => `${Math.round(n)}g`} sub={v.ambientProtein?.floor ? `floor ${v.ambientProtein.floor}g` : null} />
          <Tile label="GATE" count={v.ambientPending}
            sub={v.ambientPending == null ? 'no signal' : v.ambientPending > 0 ? 'awaiting your yes' : 'clear'}
            accent={v.ambientPending == null ? 'var(--nv-warn)' : v.ambientPending > 0 ? 'var(--nv-gold)' : 'var(--nv-good)'} />
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
      {/* the sync age, faint, in the TOP corner — the bottom edge belongs to
          the pulse strip at phone width (measured 3 Sep) — and plain when old */}
      {v.ambientSyncMin != null && (
        <div style={css(`position:absolute;right:calc(18px + env(safe-area-inset-right));top:calc(16px + env(safe-area-inset-top));font:400 9px ${M};letter-spacing:.14em;color:${stale ? 'var(--nv-warn)' : dim(24)}`)}>
          {stale ? `LAST SYNCED ${v.ambientSyncMin}M AGO` : v.ambientSyncMin === 0 ? 'SYNCED JUST NOW' : `SYNCED ${v.ambientSyncMin}M AGO`}
        </div>
      )}
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
