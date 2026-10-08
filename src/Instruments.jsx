import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { css } from './css.js';
import { Meta } from './Controls.jsx';
import { muscleVar } from './muscleHue.js';

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

// HOME'S HUES (audit 21 §8, 9 Oct 2026): recovery the cyan of sleep and
// recovery, steps violet, protein green, training cyan, the day plain ink;
// gold is never spent here, because on Home gold means waiting on his call.
// The glass and the Home card read the same five.
const A = {
  vitals: 'var(--nv-cy)', day: 'var(--nv-ink)', week: 'var(--nv-vi)',
  body: 'var(--nv-cy)', fuel: 'var(--nv-good)',
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
// Training passes no palette: since 22 Sep each worked muscle lights in its
// own hue (src/muscleHue.js), the same hue the volume bars and legend wear.
const PALETTE = {
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
        <div style={css('flex:1;min-width:0')}><Figure muscles={d.muscles} height={210} palette={null} /></div>
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

// A single lazy entry point for the glass: StageCard cannot lazily import a
// NAMED export, so it asks for one by name and this dispatches.
const BY_NAME = { Vitals, Day, Week, BodyInstrument, Fuel };
export default function Instrument({ render, d }) {
  const Comp = BY_NAME[render];
  return Comp ? <Comp d={d} /> : null;
}

/* ======================================================= the Home card === */
// YOUR DAY, DRAWN (mockup 86, his pick of 9 Oct 2026): the five instruments
// as one Home card in the morning, one at a time, in Home's colours. Console
// was a page with no door he would find; the morning is when he looks at
// Home, so the instruments live there now. The same payload as the glass
// (server/lib/instruments.js); every sentence below is written by code from
// it, and every chart carries a VoiceOver label for what it draws.

const MUSCLE_LABEL = {
  chest: 'Chest', 'front-delts': 'Front delts', 'side-delts': 'Side delts', 'rear-delts': 'Rear delts',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs', obliques: 'Obliques',
  lats: 'Lats', traps: 'Traps', rhomboids: 'Rhomboids', 'lower-back': 'Lower back', glutes: 'Glutes',
  quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves', adductors: 'Adductors',
};
const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const hhmm = (t) => `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`;
const fmtN = (n) => Number(n).toLocaleString('en-AU');
const andList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
function lengthWords(len) {
  if (len >= 1 && Number.isInteger(len)) return `${WORD[len] || len} hour${len === 1 ? '' : 's'}`;
  return `${Math.round(len * 60)} minutes`;
}
const dayName = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
const shortDay = (label) => (label ? label[0] + label.slice(1).toLowerCase() : '');

// The sentence each instrument opens with, written from its payload alone.
function dayLine(key, d) {
  if (!d?.ok) return null;
  switch (key) {
    case 'vitals': {
      const p = d.delta == null ? null : Math.abs(d.delta);
      if (d.verdict === 'recovered') return `Recovered: ${p}% above your usual.`;
      if (d.verdict === 'strained') return `Strained: ${p}% below your usual.`;
      return p == null ? 'Steady.' : `Steady: within ${p}% of your usual.`;
    }
    case 'day':
      return d.anchor ? `One long block, at ${hhmm(d.anchor.t)}.` : 'Nothing long is left on the calendar today.';
    case 'week':
      if (d.missing.length) return `${andList(d.missing.map(dayName))} never arrived; the push was not running.`;
      if (d.short > 0) return `${fmtN(d.short)} short of the week's ${fmtN(d.weekTarget)}.`;
      return d.floor ? 'At the floor every day this week.' : 'The week, as it arrived.';
    case 'body':
      return `${d.session} today.`;
    case 'fuel':
      if (!d.eaten) return 'Nothing logged yet; the repair has not started.';
      if (d.behind > 0) return `${d.behind} g behind pace.`;
      return 'The repair has started.';
    default: return null;
  }
}

const pol = (c, r, deg) => { const a = (deg - 90) * Math.PI / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
const arcD = (c, r, a0, a1) => {
  const [x0, y0] = pol(c, r, a0), [x1, y1] = pol(c, r, a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

function RecoverySvg({ d }) {
  const W = 300, band = d.band;
  const LO = band ? Math.min(band.lo, d.hrv) - 6 : d.hrv - 10;
  const HI = band ? Math.max(band.hi, d.hrv) + 6 : d.hrv + 10;
  const x = (v) => 12 + ((v - LO) / (HI - LO)) * (W - 24);
  const label = band
    ? `Heart-rate variability ${d.hrv} milliseconds; your usual range is ${Math.round(band.lo)} to ${Math.round(band.hi)}.`
    : `Heart-rate variability ${d.hrv} milliseconds; there are not yet enough readings to draw your usual range.`;
  return (
    <svg viewBox={`0 0 ${W} 58`} role="img" aria-label={label}>
      <line x1="12" y1="28" x2={W - 12} y2="28" stroke="color-mix(in srgb, var(--nv-ink) 16%, transparent)" />
      {band && <rect className="nv-day-grow" x={x(band.lo)} y="20" width={Math.max(2, x(band.hi) - x(band.lo))} height="16" rx="8"
        fill="color-mix(in srgb, var(--nv-sum-c3) 16%, transparent)" stroke="color-mix(in srgb, var(--nv-sum-c3) 50%, transparent)" />}
      <line x1={x(d.hrv)} y1="12" x2={x(d.hrv)} y2="44" stroke="var(--nv-sum-c3)" strokeWidth="3" strokeLinecap="round" />
      {band && <text x={(x(band.lo) + x(band.hi)) / 2} y="57" textAnchor="middle" className="nv-day-svgs">Your usual, {Math.round(band.lo)} to {Math.round(band.hi)} ms</text>}
    </svg>
  );
}

function DialSvg({ d }) {
  const C = 160, R = 104, deg = (t) => (t / 24) * 360;
  const ahead = d.anchor;
  const label = `Today as a 24-hour ring: ${d.blocks.map((b) => `${b.label} at ${hhmm(b.t)}`).join(', ')}.`
    + `${ahead ? ` The longest block ahead is ${ahead.label}, at ${hhmm(ahead.t)}, ${lengthWords(ahead.len)}.` : ''} Now ${hhmm(d.now)}.`;
  const ticks = [];
  for (let h = 0; h < 24; h++) {
    const big = h % 6 === 0;
    const [x0, y0] = pol(C, R + 12, deg(h)), [x1, y1] = pol(C, R + (big ? 21 : 16), deg(h));
    ticks.push(<line key={h} x1={x0.toFixed(1)} y1={y0.toFixed(1)} x2={x1.toFixed(1)} y2={y1.toFixed(1)}
      stroke={`color-mix(in srgb, var(--nv-ink) ${big ? 55 : 20}%, transparent)`} strokeWidth={big ? 1.6 : 1} strokeLinecap="round" />);
  }
  const [hx, hy] = pol(C, R + 6, deg(d.now));
  return (
    <svg viewBox="0 0 320 320" role="img" aria-label={label}>
      {ticks}
      {[[6, '06'], [12, '12'], [18, '18']].map(([h, l]) => {
        const [x, y] = pol(C, R + 36, deg(h));
        return <text key={h} x={x.toFixed(1)} y={(y + 4.5).toFixed(1)} textAnchor="middle" className="nv-day-svgs">{l}</text>;
      })}
      <circle cx={C} cy={C} r={R} fill="none" stroke="color-mix(in srgb, var(--nv-ink) 10%, transparent)" strokeWidth="2" />
      {d.blocks.map((b, i) => {
        const on = ahead && b.label === ahead.label && b.t === ahead.t;
        return <path key={i} className="nv-day-arc" pathLength="1" style={{ '--i': i }} d={arcD(C, R, deg(b.t), deg(b.t + Math.max(b.len, 0.3)))}
          fill="none" stroke={on ? 'var(--nv-ink)' : 'color-mix(in srgb, var(--nv-ink) 42%, transparent)'} strokeWidth={on ? 13 : 9} strokeLinecap="round" />;
      })}
      <circle cx={hx.toFixed(1)} cy={hy.toFixed(1)} r="4" fill="var(--nv-ink)" />
      {ahead && <text x={C} y={C + 6} textAnchor="middle" className="nv-day-svgbig">{hhmm(ahead.t)}</text>}
      {ahead && <text x={C} y={C + 30} textAnchor="middle" className="nv-day-svgs">{ahead.label}, {lengthWords(ahead.len)}</text>}
    </svg>
  );
}

function WeekSvg({ d }) {
  const W = 300, H = 136, base = H - 24, col = W / 7, bw = col - 12;
  const max = Math.max(d.floor || 0, ...d.series.map((s) => s.steps || 0)) * 1.1 || 1;
  const y = (v) => base - (v / max) * (base - 8);
  const label = `Steps this week: ${d.series.map((s) => `${shortDay(s.label)} ${s.steps == null ? (s.today ? 'not yet' : 'missing') : fmtN(s.steps)}`).join(', ')}.`
    + `${d.floor ? ` Floor ${fmtN(d.floor)} a day.` : ''}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {d.floor ? <line x1="0" y1={y(d.floor)} x2={W} y2={y(d.floor)} stroke="color-mix(in srgb, var(--nv-sum-c2) 60%, transparent)" strokeDasharray="4 4" /> : null}
      {d.series.map((s, i) => {
        const x = i * col + 6;
        return (
          <g key={s.date}>
            {s.steps == null
              ? <rect x={x} y={base - 24} width={bw} height="24" rx="5" fill="none" stroke="color-mix(in srgb, var(--nv-ink) 40%, transparent)" strokeDasharray="3 3" />
              : <rect className="nv-day-bar" style={{ '--i': i }} x={x} y={y(s.steps).toFixed(1)} width={bw} height={(base - y(s.steps)).toFixed(1)} rx="5"
                fill={s.today ? 'color-mix(in srgb, var(--nv-sum-c2) 30%, transparent)' : 'color-mix(in srgb, var(--nv-sum-c2) 80%, transparent)'}
                stroke={s.today ? 'var(--nv-sum-c2)' : 'none'} strokeWidth="1.5" />}
            <text x={x + bw / 2} y={H - 4} textAnchor="middle" className="nv-day-svgs">{shortDay(s.label)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ProteinSvg({ d }) {
  const W = 300, scale = Math.max(d.planned, d.floor || 0, d.eaten) || 1;
  const p = Math.min(1, d.eaten / scale), fl = d.floor ? d.floor / scale : null;
  const label = `Protein ${d.eaten} grams of ${d.planned} planned${d.floor ? `; floor ${d.floor} grams` : ''}.`;
  return (
    <svg viewBox={`0 0 ${W} 52`} role="img" aria-label={label}>
      <rect x="0" y="14" width={W} height="16" rx="8" fill="color-mix(in srgb, var(--nv-sum-c1) 12%, transparent)" />
      {p > 0 && <rect className="nv-day-grow" x="0" y="14" width={Math.max(16, W * p).toFixed(1)} height="16" rx="8" fill="var(--nv-sum-c1)" />}
      {fl != null && <line x1={(W * fl).toFixed(1)} y1="6" x2={(W * fl).toFixed(1)} y2="38" stroke="var(--nv-ink)" strokeDasharray="3 3" />}
      {fl != null && <text x={(W * fl).toFixed(1)} y="51" textAnchor="end" className="nv-day-svgs">Floor {d.floor} g</text>}
    </svg>
  );
}

const DAY_INS = [
  { key: 'vitals', name: 'Recovery', tone: 'var(--nv-sum-c3)' },
  { key: 'day', name: 'Today', tone: null },
  { key: 'week', name: 'Steps', tone: 'var(--nv-sum-c2)' },
  { key: 'body', name: 'Training', tone: null },
  { key: 'fuel', name: 'Protein', tone: 'var(--nv-sum-c1)' },
];

function DaySlide({ ins, d }) {
  const t = ins.tone ? { color: ins.tone } : undefined;
  const meta = !d?.ok ? null : {
    vitals: 'Heart-rate variability',
    day: `${d.blocks?.length} block${d.blocks?.length === 1 ? '' : 's'}`,
    week: d.floor ? `Floor ${fmtN(d.floor)} a day` : null,
    body: `${d.exercises} exercise${d.exercises === 1 ? '' : 's'}`,
    fuel: `Plan ${d.planned} g`,
  }[ins.key];
  const today = ins.key === 'week' && d?.ok ? d.series.find((s) => s.today) : null;
  return (
    <article className="nv-day-ins" aria-label={ins.name}>
      <header className="nv-day-ih"><span className="nv-day-it" style={t}>{ins.name}</span>{meta && <span className="nv-day-s">{meta}</span>}</header>
      {!d?.ok ? (
        <p className="nv-day-il nv-day-quiet">Nothing to draw: {d?.reason || 'no data reached Nova'}.</p>
      ) : (
        <>
          <p className="nv-day-il">{dayLine(ins.key, d)}</p>
          {ins.key === 'vitals' && <>
            <span className="nv-day-big" style={t}>{d.hrv}<small>ms</small></span>
            {d.stale && <span className="nv-day-s">On a reading {d.staleDays} day{d.staleDays === 1 ? '' : 's'} old.</span>}
            <RecoverySvg d={d} />
          </>}
          {ins.key === 'day' && <div className="nv-day-dial"><DialSvg d={d} /></div>}
          {ins.key === 'week' && <>
            {today?.steps != null && <span className="nv-day-big">{fmtN(today.steps)}<small>today</small></span>}
            <WeekSvg d={d} />
          </>}
          {ins.key === 'body' && <>
            <ul className="nv-day-mus" aria-label="The muscles today works">
              {d.muscles.primary.map((m) => <li key={m} style={{ '--d': muscleVar(m) }}><i aria-hidden="true" />{MUSCLE_LABEL[m] || m}</li>)}
              {d.muscles.secondary.map((m) => <li key={m} style={{ '--d': muscleVar(m) }}><i aria-hidden="true" />{MUSCLE_LABEL[m] || m}, supporting</li>)}
            </ul>
            {d.streak != null && <span className="nv-day-big">{d.streak}<small>{d.streak === 1 ? 'session' : 'sessions in a row'}</small></span>}
            {d.carryovers?.length > 0 && <span className="nv-day-s">{d.carryovers.length} carry-over{d.carryovers.length === 1 ? '' : 's'} still waiting</span>}
          </>}
          {ins.key === 'fuel' && <>
            <span className="nv-day-big" style={t}>{d.eaten}<small>of {d.planned} g</small></span>
            <ProteinSvg d={d} />
          </>}
        </>
      )}
    </article>
  );
}

const chevron = (next) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={next ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} /></svg>
);

// One instrument at a time: a swipe, the chevrons or a dot. `onSeen(key)`
// is told each time an instrument is shown, so Home can retire the card
// once all five have been seen.
export function YourDay({ data, loading, error, onRefresh, onSeen, foot }) {
  const [i, setI] = useState(0);
  const trackRef = useRef(null);
  const pagerRef = useRef(null);
  const drag = useRef(null);
  const N = DAY_INS.length;
  const go = (j) => setI(Math.max(0, Math.min(N - 1, j)));
  useEffect(() => {
    if (!data) return;
    onSeen?.(DAY_INS[i].key);
    // the drawing replays each time an instrument comes in
    const el = trackRef.current?.children[i];
    if (el) { el.classList.remove('nv-day-in'); void el.getBoundingClientRect(); el.classList.add('nv-day-in'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, data]);

  const down = (e) => { drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, on: false }; };
  const move = (e) => {
    const g = drag.current;
    if (!g) return;
    g.dx = e.clientX - g.x;
    if (!g.on && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(e.clientY - g.y)) {
      g.on = true;
      try { pagerRef.current.setPointerCapture(e.pointerId); } catch { /* fine */ }
      trackRef.current.style.transition = 'none';
    }
    if (g.on) {
      const w = pagerRef.current.clientWidth;
      const edge = (i === 0 && g.dx > 0) || (i === N - 1 && g.dx < 0);
      trackRef.current.style.transform = `translateX(${-i * w + (edge ? g.dx * 0.3 : g.dx)}px)`;
    }
  };
  const up = () => {
    const g = drag.current;
    drag.current = null;
    if (!g?.on) return;
    trackRef.current.style.transition = '';
    trackRef.current.style.transform = '';
    const v = Math.abs(g.dx) / Math.max(1, performance.now() - g.t);
    if (Math.abs(g.dx) > 60 || v > 0.35) go(i + (g.dx < 0 ? 1 : -1));
  };

  const again = onRefresh ? (
    <button type="button" className="nv-day-again" onClick={onRefresh} disabled={loading}>{loading ? 'Reading…' : 'Read again'}</button>
  ) : null;

  let body;
  if (error && !data) {
    body = (
      <div className="nv-day-state">
        <p className="nv-day-il nv-day-quiet">Your day could not be read: {error}.</p>
        {again}
      </div>
    );
  } else if (!data && loading) {
    body = (
      <div className="nv-day-skel" aria-label="Reading your day" role="status">
        <i style={{ width: '40%' }} /><i style={{ width: '78%', height: 22 }} /><i style={{ width: '100%', height: 120 }} />
      </div>
    );
  } else if (!data) {
    body = (
      <div className="nv-day-state">
        <p className="nv-day-il nv-day-quiet">{onRefresh ? 'Nothing read yet.' : 'Your day is drawn from the Mac, so demo mode has nothing to draw.'}</p>
        {again}
      </div>
    );
  } else {
    body = (
      <>
        <div className="nv-day-pager" ref={pagerRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="nv-day-track" ref={trackRef} style={{ transform: `translateX(${-i * 100}%)` }}>
            {DAY_INS.map((ins, k) => (
              <div key={ins.key} className="nv-day-slide" aria-hidden={k !== i} inert={k !== i ? true : undefined}>
                <DaySlide ins={ins} d={data[ins.key]} />
              </div>
            ))}
          </div>
        </div>
        <div className="nv-day-pfoot">
          <button type="button" className="nv-day-pnav" aria-label="Previous instrument" onClick={() => go(i - 1)} disabled={i === 0}>{chevron(false)}</button>
          <div className="nv-day-dots" role="group" aria-label="Instruments">
            {DAY_INS.map((ins, k) => (
              <button key={ins.key} type="button" aria-label={ins.name} aria-current={k === i} onClick={() => go(k)}><i /></button>
            ))}
          </div>
          <button type="button" className="nv-day-pnav" aria-label="Next instrument" onClick={() => go(i + 1)} disabled={i === N - 1}>{chevron(true)}</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="nv-day-ch">
        <span className="nv-day-ct">Your day, drawn</span>
        {data && <span className="nv-day-s" aria-live="polite">{i + 1} of {N}</span>}
      </div>
      {body}
      {(foot || (data && again)) && (
        <div className="nv-day-foot">
          <span>{foot || ''}</span>
          {data ? again : null}
        </div>
      )}
    </>
  );
}
