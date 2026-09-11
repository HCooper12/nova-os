import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { css } from './css.js';
import { Meta } from './Controls.jsx';

// THE INSTRUMENTS — the morning brief drawn instead of said.
//
// Five readouts, each shaped by what it measures, so the display is ABOUT
// the thing rather than about the sentence: a heart for the nervous system,
// a 24-hour ring for the day, a field of columns for the week, his own body
// for the session, and the same body again — amber — for what is waiting to
// be rebuilt.
//
// Every payload comes from `server/lib/instruments.js`, which is pure code
// over live sources. Nothing here invents a value: an instrument with no
// data draws its own absence and says why.

const Body3D = lazy(() => import('./Body3D.jsx'));

const A = {
  vitals: 'var(--nv-good)', day: 'var(--nv-cy)', week: 'var(--nv-gold)',
  body: 'var(--nv-vi)', fuel: 'var(--nv-mg)',
};

/* ------------------------------------------------------------- chrome ---- */

function Frame({ tone, label, right, children, note }) {
  return (
    <div style={{ position: 'relative', border: '1px solid color-mix(in srgb, ' + tone + ' 20%, transparent)',
      borderRadius: '14px', overflow: 'hidden', minWidth: 0,
      background: 'radial-gradient(320px 220px at 50% 34%, color-mix(in srgb, ' + tone + ' 8%, transparent), rgba(0,0,0,.28))' }}>
      <div style={css('display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:10px 14px 0')}>
        <span style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track-wide)',
          textTransform: 'uppercase', color: tone }}>{label}</span>
        {right}
      </div>
      {children}
      {note && (
        <div style={{ padding: '0 14px 11px', font: 'var(--nv-micro-s)',
          letterSpacing: 'var(--nv-micro-track)', color: 'var(--nv-warn)' }}>{note}</div>
      )}
    </div>
  );
}

// an instrument with nothing to show says so, in its own frame
function Absent({ tone, label, reason }) {
  return (
    <Frame tone={tone} label={label}>
      <div style={css('padding:26px 14px 22px;font:500 13px/1.5 var(--nv-font-ui);color:var(--nv-ink60)')}>
        Nothing to draw — {reason || 'no data reached Nova'}.
      </div>
    </Frame>
  );
}

const Big = ({ v, unit, tone }) => (
  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
    <span style={{ font: '500 30px var(--nv-font-mono)', color: tone }}>{v}</span>
    {unit && <span style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)', color: 'var(--nv-ink40)' }}>{unit}</span>}
  </span>
);

/* ------------------------------------------------------------- vitals ---- */

// HRV is meaningless between people and everything against yourself, so the
// band he actually lives in is drawn and today is marked inside it.
export function Vitals({ d }) {
  const tone = A.vitals;
  if (!d?.ok) return <Absent tone={tone} label="Recovery" reason={d?.reason} />;
  const { band } = d;
  const LO = band ? Math.min(band.lo, d.hrv) - 6 : d.hrv - 10;
  const HI = band ? Math.max(band.hi, d.hrv) + 6 : d.hrv + 10;
  const x = (v) => 30 + ((v - LO) / (HI - LO)) * 300;
  const verdictWord = { recovered: 'Recovered', steady: 'Steady', strained: 'Strained' }[d.verdict] || d.verdict;

  return (
    <Frame tone={tone} label="Recovery · readiness"
      right={<span style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track-wide)',
        textTransform: 'uppercase', color: tone,
        border: '1px solid color-mix(in srgb, ' + tone + ' 45%, transparent)',
        background: 'color-mix(in srgb, ' + tone + ' 12%, transparent)',
        borderRadius: '999px', padding: '3px 10px' }}>◈ {verdictWord}</span>}
      note={d.stale ? `⚠ on data ${d.staleDays} day${d.staleDays === 1 ? '' : 's'} old` : null}>
      <div style={css('display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:8px 14px 2px')}>
        <div>
          <Meta tone="quiet">Heart-rate variability</Meta>
          <div><Big v={d.hrv} unit={`MS${d.delta != null ? ` · ${d.delta >= 0 ? '+' : ''}${d.delta}% VS YOUR USUAL` : ''}`} tone={tone} /></div>
        </div>
        {d.restingHr != null && (
          <div style={css('text-align:right;flex:none')}>
            <Meta tone="quiet">Resting</Meta>
            <div><Big v={d.restingHr} unit="BPM" tone="var(--nv-ink)" /></div>
          </div>
        )}
      </div>
      <svg viewBox="0 0 360 62" style={css('display:block;width:100%;height:62px')} aria-hidden="true">
        <path d="M30,34 H330" stroke="rgba(130,175,255,.16)" strokeWidth=".8" fill="none" />
        {band && (
          <>
            <rect x={x(band.lo)} y="27" width={Math.max(2, x(band.hi) - x(band.lo))} height="14" rx="7"
              fill={`color-mix(in srgb, ${tone} 15%, transparent)`}
              stroke={`color-mix(in srgb, ${tone} 32%, transparent)`} strokeWidth=".8" />
            <text x={(x(band.lo) + x(band.hi)) / 2} y="54" textAnchor="middle"
              style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)' }}
              fill="var(--nv-ink40)">YOUR USUAL {Math.round(band.lo)}–{Math.round(band.hi)}</text>
          </>
        )}
        <path d={`M${x(d.hrv)},22 v24`} stroke={tone} strokeWidth="1.8" fill="none"
          style={{ filter: `drop-shadow(0 0 4px ${tone})` }} />
        <text x={x(d.hrv)} y="16" textAnchor="middle" fill={tone}
          style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)' }}>TODAY</text>
      </svg>
    </Frame>
  );
}

/* ---------------------------------------------------------------- day ---- */

const polar = (cx, cy, r, deg) => {
  const t = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
};
const arcPath = (cx, cy, r, a0, a1) => {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
};

export function Day({ d }) {
  const tone = A.day;
  if (!d?.ok) return <Absent tone={tone} label="Today" reason={d?.reason} />;
  const CX = 180, CY = 116, R = 80;
  const deg = (t) => (t / 24) * 360;
  const [nx, ny] = polar(CX, CY, R + 15, deg(d.now));
  const [ix, iy] = polar(CX, CY, R - 22, deg(d.now));

  return (
    <Frame tone={tone} label="Today · the shape of it"
      right={<Meta tone="quiet">{d.blocks.length} block{d.blocks.length === 1 ? '' : 's'}</Meta>}>
      <svg viewBox="0 0 360 236" style={css('display:block;width:100%')} aria-hidden="true">
        <circle cx={CX} cy={CY} r={R + 22} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth=".8" />
        <circle cx={CX} cy={CY} r={R - 20} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth=".8" />
        {[0, 6, 12, 18].map((h) => {
          const [lx, ly] = polar(CX, CY, R + 32, deg(h));
          return <text key={h} x={lx} y={ly + 3} textAnchor="middle" fill="var(--nv-ink40)"
            style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)' }}>{String(h).padStart(2, '0')}</text>;
        })}
        {d.blocks.map((b, i) => {
          const on = d.anchor && b.label === d.anchor.label && b.t === d.anchor.t;
          return <path key={i} d={arcPath(CX, CY, R, deg(b.t), deg(b.t + Math.max(b.len, .3)))}
            stroke={tone} strokeWidth={on ? 10 : 6} strokeLinecap="round" fill="none"
            opacity={on ? 1 : .4} style={on ? { filter: `drop-shadow(0 0 6px ${tone})` } : undefined} />;
        })}
        <path d={`M${ix.toFixed(1)},${iy.toFixed(1)} L${nx.toFixed(1)},${ny.toFixed(1)}`}
          stroke={tone} strokeWidth="1.4" fill="none" />
        <circle cx={nx} cy={ny} r="2.6" fill="none" stroke={tone} strokeWidth="1.4" />
        {d.anchor && (
          <>
            <text x={CX} y={CY - 8} textAnchor="middle" fill="var(--nv-ink40)"
              style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)' }}>THE ONE THAT MATTERS</text>
            <text x={CX} y={CY + 16} textAnchor="middle" fill="var(--nv-ink)"
              style={{ font: '500 19px var(--nv-font-mono)' }}>
              {String(Math.floor(d.anchor.t)).padStart(2, '0')}:{String(Math.round((d.anchor.t % 1) * 60)).padStart(2, '0')}
            </text>
          </>
        )}
      </svg>
      {d.anchor && (
        <div style={css('padding:0 14px 12px;font:600 14px var(--nv-font-ui);color:var(--nv-ink);text-align:center')}>
          {d.anchor.label}
        </div>
      )}
    </Frame>
  );
}

/* --------------------------------------------------------------- week ---- */

export function Week({ d }) {
  const tone = A.week;
  if (!d?.ok) return <Absent tone={tone} label="Steps" reason={d?.reason} />;
  const X0 = 34, W = 300, BASE = 150, MAXH = 106;
  const max = Math.max(d.floor || 0, ...d.series.map((s) => s.steps || 0)) * 1.12 || 1;
  const bw = W / 7 - 10;
  const fy = d.floor ? BASE - (d.floor / max) * MAXH : null;
  const tops = d.series.map((s, i) => (s.steps == null ? null
    : [X0 + i * (W / 7) + bw / 2 + 5, BASE - (s.steps / max) * MAXH]));

  return (
    <Frame tone={tone} label="Steps · this week"
      right={<Meta tone="quiet">{d.total.toLocaleString()} banked</Meta>}
      note={d.missing.length ? `⚠ ${d.missing.length} day${d.missing.length === 1 ? '' : 's'} never arrived — the push is not running` : null}>
      <svg viewBox="0 0 360 182" style={css('display:block;width:100%')} aria-hidden="true">
        {fy != null && (
          <>
            <path d={`M${X0},${fy} H${X0 + W}`} stroke={`color-mix(in srgb, ${tone} 40%, transparent)`}
              strokeDasharray="4 4" strokeWidth="1" fill="none" />
            <text x={X0 + W} y={fy - 5} textAnchor="end" fill="var(--nv-ink40)"
              style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)' }}>
              FLOOR {d.floor.toLocaleString()}
            </text>
          </>
        )}
        {/* the trace breaks where the data does — that is the point of it */}
        {tops.map((p, i) => {
          const q = tops[i + 1];
          if (!p || !q) return null;
          return <path key={i} d={`M${p[0]},${p[1]} L${q[0]},${q[1]}`} stroke={tone}
            strokeWidth="1" opacity=".45" fill="none" />;
        })}
        {d.series.map((s, i) => {
          const x = X0 + i * (W / 7) + 5;
          if (s.steps == null) {
            return (
              <g key={s.date}>
                <rect x={x} y={BASE - 22} width={bw} height="22" rx="2" fill="none"
                  stroke={s.today ? 'rgba(130,175,255,.2)' : 'var(--nv-warn)'}
                  strokeDasharray="3 4" strokeWidth="1" />
                {!s.today && <text x={x + bw / 2} y={BASE - 7} textAnchor="middle" fill="var(--nv-warn)"
                  style={{ font: 'var(--nv-micro-m)' }}>?</text>}
              </g>
            );
          }
          const h = (s.steps / max) * MAXH;
          return (
            <g key={s.date}>
              <rect x={x} y={BASE - h} width={bw} height={h} rx="2"
                fill={`color-mix(in srgb, ${tone} ${s.today ? 55 : 20}%, transparent)`}
                stroke={s.today ? tone : `color-mix(in srgb, ${tone} 35%, transparent)`} strokeWidth="1" />
              <text x={x + bw / 2} y={BASE - h - 6} textAnchor="middle" fill="var(--nv-ink40)"
                style={{ font: 'var(--nv-micro-s)' }}>{(s.steps / 1000).toFixed(1)}k</text>
            </g>
          );
        })}
        {d.series.map((s, i) => (
          <text key={s.date} x={X0 + i * (W / 7) + bw / 2 + 5} y={BASE + 15} textAnchor="middle"
            fill={s.today ? tone : 'var(--nv-ink40)'}
            style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)' }}>{s.label}</text>
        ))}
        {d.short != null && d.short > 0 && (
          <text x={X0} y={BASE + 36} fill="var(--nv-ink40)"
            style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)' }}>
            {d.short.toLocaleString()} SHORT OF {d.weekTarget.toLocaleString()}
          </text>
        )}
      </svg>
    </Frame>
  );
}

/* ----------------------------------------------------- body & repair ----- */

// Both use HIS model. Training asks what today works; Fuel asks the same
// body what is waiting to be rebuilt, which is why it is the same figure in
// a different colour rather than a second picture of something else.
// Training asks what today works. Fuel asks the same body what is waiting
// to be rebuilt — so it is the same figure in the colour of debt, not a
// second picture of something else.
const PALETTE = {
  body: { primary: 0x8f7bff, secondary: 0x59e6ff },   // --nv-vi / --nv-cy
  fuel: { primary: 0xe08a6a, secondary: 0xe0b26a },   // debt, not a plan
};

function Figure({ muscles, height, palette }) {
  return (
    <Suspense fallback={<div style={{ height: height + 'px' }} />}>
      <Body3D muscles={muscles} height={height} chrome={false} view="three-quarter"
        glass palette={palette} />
    </Suspense>
  );
}

export function BodyInstrument({ d }) {
  const tone = A.body;
  if (!d?.ok) return <Absent tone={tone} label="Training" reason={d?.reason} />;
  return (
    <Frame tone={tone} label="Training · what today works"
      right={<Meta tone="quiet">{d.exercises} exercise{d.exercises === 1 ? '' : 's'}</Meta>}
      note={d.carryovers.length ? `◈ ${d.carryovers.length} carry-over${d.carryovers.length === 1 ? '' : 's'} still waiting` : null}>
      <div style={css('display:flex;align-items:center;gap:8px;padding:4px 14px 0;min-width:0')}>
        <div style={css('flex:1;min-width:0')}><Figure muscles={d.muscles} height={210} palette={PALETTE.body} /></div>
        <div style={css('flex:none;display:flex;flex-direction:column;gap:12px;padding-right:2px')}>
          <div><Meta tone="quiet">Session</Meta>
            <div style={css('font:600 17px var(--nv-font-ui);color:var(--nv-ink)')}>{d.session}</div></div>
          {d.streak != null && (
            <div><Meta tone="quiet">Streak</Meta>
              <div><Big v={d.streak} tone="var(--nv-ink)" /></div></div>
          )}
        </div>
      </div>
      <div style={css('padding:0 14px 10px')}>
        <Meta tone="quiet">{d.muscles.primary.length} worked · {d.muscles.secondary.length} supporting</Meta>
      </div>
    </Frame>
  );
}

export function Fuel({ d }) {
  const tone = A.fuel;
  if (!d?.ok) return <Absent tone={tone} label="Fuel" reason={d?.reason} />;
  const started = d.eaten > 0;
  return (
    <Frame tone={tone} label="Fuel · the material today needs"
      right={<Meta tone="quiet">{d.planned} g planned</Meta>}
      note={started ? null : '◇ nothing logged — the repair has not started'}>
      <div style={css('display:flex;align-items:center;gap:8px;padding:4px 14px 0;min-width:0')}>
        <div style={css('flex:none;display:flex;flex-direction:column;gap:12px')}>
          <div><Meta tone="quiet">Arrived</Meta>
            <div><Big v={d.eaten} unit={`G OF ${d.planned}`} tone={started ? tone : 'var(--nv-warn)'} /></div></div>
          {d.behind != null && d.behind > 0 && (
            <div><Meta tone="quiet">Behind pace</Meta>
              <div><Big v={d.behind} unit="G" tone="var(--nv-warn)" /></div></div>
          )}
          {d.floor && <Meta tone="quiet">Floor {d.floor} g</Meta>}
        </div>
        {/* the same tissue, asked what is waiting to be rebuilt */}
        <div style={css('flex:1;min-width:0')}><Figure muscles={d.muscles} height={196} palette={PALETTE.fuel} /></div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------- console -- */

export const INSTRUMENTS = [
  { key: 'vitals', Comp: Vitals }, { key: 'day', Comp: Day }, { key: 'week', Comp: Week },
  { key: 'body', Comp: BodyInstrument }, { key: 'fuel', Comp: Fuel },
];

export function Console({ data, loading, error, onRefresh }) {
  const [seen, setSeen] = useState(0);
  const ref = useRef(null);
  // they arrive one after another rather than as a slab — the motion
  // contract's stagger, driven here because the count is data-dependent
  useEffect(() => {
    if (!data) return;
    setSeen(0);
    let i = 0;
    const t = setInterval(() => { i++; setSeen(i); if (i >= INSTRUMENTS.length) clearInterval(t); }, 90);
    return () => clearInterval(t);
  }, [data]);

  if (error) {
    return <div style={css('padding:18px;font:500 14px var(--nv-font-ui);color:var(--nv-warn)')}>
      The console could not be read — {error}
    </div>;
  }
  if (!data) {
    // never a silent blank: either it is reading, or it has nothing and says so
    return <div style={css('padding:18px;font:500 14px var(--nv-font-ui);color:var(--nv-ink60)')}>
      {loading ? 'Reading your day…' : 'Nothing read yet — tap Read again.'}
    </div>;
  }

  return (
    <div ref={ref} style={css('display:flex;flex-direction:column;gap:12px;min-width:0')}>
      {INSTRUMENTS.map(({ key, Comp }, i) => (
        <div key={key} style={{ opacity: i < seen ? 1 : 0,
          transform: i < seen ? 'none' : 'translateY(var(--nv-rise))',
          transition: 'opacity var(--nv-dur-base) var(--nv-ease), transform var(--nv-dur-base) var(--nv-ease)' }}>
          <Comp d={data[key]} />
        </div>
      ))}
      {onRefresh && (
        <div style={css('display:flex;justify-content:flex-end;padding-top:2px')}>
          <button type="button" onClick={onRefresh} style={css(
            'cursor:pointer;font:600 12.5px var(--nv-font-ui);padding:7px 15px;border-radius:999px;'
            + 'border:1px solid var(--nv-acc-border);background:var(--nv-acc-bg);color:var(--nv-acc)')}>
            {loading ? 'Reading…' : 'Read again'}
          </button>
        </div>
      )}
    </div>
  );
}
