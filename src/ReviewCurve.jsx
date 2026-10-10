import { GAPS, nextStep, daysBetweenISO, shiftISO } from './reviewDemo.js';
import { GRADE, fmtDay, fmtShort } from './vals/valsReview.js';

// THE FORGETTING CURVE, DRAWN (mockup 96). Dots are his answers on their
// dates, in their grade's colour. Between them, the forgetting idea drawn to
// the schedule's gaps: each stretch falls away from the answer that started
// it, slower as the gap widens. Nova measures nothing about his memory, so
// there is no percentage and no axis. A dashed stretch projects to the day
// the page comes back, with a ring on that day.
//
// An answer is acted out here: a new dot pops in on today, and a stretch in
// the grade's colour draws out to the new due day (a clip scaled on X), with
// its ring arriving at the end. Shared by the card on both Homes and the
// sheet, so the drawing is one thing.

const RET = (dt, gap) => 1 - Math.exp(-dt / gap);

function geometry(curve, w, h) {
  const today = curve.today;
  let step = 0;
  const segs = curve.history.map((a) => { step = nextStep(step, a.grade); return { date: a.date, grade: a.grade, gap: GAPS[step] }; });
  const first = segs.length ? segs[0].date : today;
  const start = shiftISO(first, -1);
  const end = shiftISO(today, GAPS[nextStep(curve.step, 'got')] + 1);
  const span = Math.max(1, daysBetweenISO(start, end));
  const padL = 6, padR = 10, top = 18, bot = h - 6;
  const x = (d) => padL + (daysBetweenISO(start, d) / span) * (w - padL - padR);
  const y = (r) => top + r * (bot - top);
  return { segs, start, x, y, top, bot, today };
}

function stretch(G, from, gap, to) {
  const n = 28;
  const len = daysBetweenISO(from, to);
  const x0 = G.x(from), x1 = G.x(to);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const dt = (len * i) / n;
    pts.push(`${(x0 + (x1 - x0) * (i / n)).toFixed(1)},${G.y(RET(dt, gap)).toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

export function ReviewCurve({ curve, big = false, idKey = '' }) {
  if (!curve) return null;
  const w = big ? 354 : 326;
  const h = big ? 92 : 72;
  const G = geometry(curve, w, h);
  const tx = G.x(G.today);
  const last = G.segs[G.segs.length - 1];
  const due = last ? shiftISO(last.date, last.gap) : null;
  const r = curve.result;
  const clipId = `rvclip-${big ? 'b' : 's'}-${idKey}`.replace(/[^\w-]/g, '');
  const ring = 'var(--nv-void)';
  // a date under a dot only where it cannot collide with the last one drawn
  // ("7 Oct" and "8 Oct" a day apart overprinted as "7 Oc8 Oct")
  const shownDates = new Set();
  let lastX = -Infinity;
  G.segs.forEach((s, i) => { const x = G.x(s.date); if (x - lastX >= 48) { shownDates.add(i); lastX = x; } });
  const label = G.segs.length
    ? `The review curve: seen ${G.segs.length === 1 ? 'once' : `${G.segs.length} times`}, last ${fmtDay(last.date)}${r ? `, next ${r.dueLabel}` : ', due today'}`
    : `The review curve: not seen yet${r ? `, next ${r.dueLabel}` : ', due today'}`;
  return (
    <svg viewBox={`0 0 ${w} ${h + (big ? 18 : 0)}`} role="img" aria-label={label}>
      <line x1={G.x(G.start)} x2={w - 4} y1={G.bot + 2} y2={G.bot + 2} stroke="color-mix(in srgb, var(--nv-ink) 14%, transparent)" strokeWidth="1" />
      <line x1={tx} x2={tx} y1="0" y2={G.bot + 4} stroke="color-mix(in srgb, var(--nv-ink) 32%, transparent)" strokeWidth="1" strokeDasharray="2 3" />
      <text x={tx + 4} y="8" style={{ font: '500 11px var(--nv-font-ui)', fill: 'var(--nv-ink60)' }}>today</text>
      {G.segs.map((s, i) => {
        const to = i < G.segs.length - 1 ? G.segs[i + 1].date : G.today;
        return <path key={`s${s.date}${i}`} d={stretch(G, s.date, s.gap, to)} fill="none" stroke="color-mix(in srgb, var(--nv-vi) 80%, transparent)" strokeWidth="2" strokeLinecap="round" />;
      })}
      {/* the old projection and its due ring step aside when an answer lands */}
      {last && due > G.today && (
        <path className={r ? 'fadeout' : ''} d={stretch(G, G.today, last.gap, due)} fill="none" stroke="var(--nv-vi)" strokeWidth="1.5" strokeDasharray="3 4" opacity=".6" />
      )}
      <circle className={r ? 'fadeout' : ''} cx={last ? G.x(due) : tx} cy={last ? G.y(RET(daysBetweenISO(last.date, due), last.gap)) : G.top} r="5" fill="none" stroke="var(--nv-vi)" strokeWidth="1.5" />
      {r && (() => {
        const hue = GRADE[r.grade]?.hue || 'var(--nv-vi)';
        const rdue = shiftISO(G.today, r.gap);
        return (
          <>
            <clipPath id={clipId}><rect className="nseg-clip" x={tx - 3} y="-4" width={G.x(rdue) - tx + 10} height={h + 8} /></clipPath>
            <path clipPath={`url(#${clipId})`} d={stretch(G, G.today, r.gap, rdue)} fill="none" stroke={hue} strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" />
            <circle className="nring" cx={G.x(rdue)} cy={G.y(RET(r.gap, r.gap))} r="5" fill="none" stroke={hue} strokeWidth="1.5" />
          </>
        );
      })()}
      {G.segs.map((s, i) => (
        <g key={`d${s.date}${i}`}>
          <circle cx={G.x(s.date)} cy={G.top} r="4.5" fill={GRADE[s.grade]?.hue || 'var(--nv-vi)'} stroke={ring} strokeWidth="2" />
          {big && shownDates.has(i) && <text x={G.x(s.date)} y={h + 14} textAnchor="middle" style={{ font: '500 11px var(--nv-font-ui)', fill: 'var(--nv-ink60)' }}>{fmtShort(s.date)}</text>}
        </g>
      ))}
      {r && <circle className="ndot" cx={tx} cy={G.top} r="4.5" fill={GRADE[r.grade]?.hue} stroke={ring} strokeWidth="2" />}
    </svg>
  );
}
