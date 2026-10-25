// TODAY'S WALK, FROM APPLE HEALTH (mockup 104). A ring that closes once to
// the 15-minute mark (full when the walk counts), the workout's own name and
// distance, the serif line saying what it did for the day, and only the
// figures Health actually sent. Model: src/vals/valsTrainSummary.js `walk`.
const R = 28;
const C = 2 * Math.PI * R;
const ALSO = ['Walks, indoor and outdoor', 'Runs, treadmill', 'Cycling', 'Swimming, rowing'];

export function WalkCard({ w, style }) {
  return (
    <section className="nv-sum-card nv-sum-rise nv-wk" style={{ '--nv-sum-tint': 'var(--nv-good)', ...style }} aria-label={`${w.title}, ${w.line}`}>
      <div className="nv-wk-top">
        <svg className="nv-wk-ring" viewBox="0 0 64 64" aria-hidden="true">
          <circle className="tr" cx="32" cy="32" r={R} />
          <circle className="fg" cx="32" cy="32" r={R} style={{ strokeDasharray: C, '--off': C * (1 - w.ring), '--c': `${C}` }} />
        </svg>
        <div style={{ minWidth: 0 }}>
          <div className="nv-wk-t">{w.title}</div>
          <div className="nv-wk-s">{w.when}</div>
        </div>
      </div>
      <p className="nv-wk-line">{w.line}</p>
      <div className="nv-wk-stats">
        {w.stats.map((x) => <div key={x.k}><b>{x.v}</b><span>{x.k}</span></div>)}
      </div>
      <p className="nv-wk-src">{w.source}</p>
      <div className="nv-wk-also" aria-label="Also counts on an active-rest day">
        {ALSO.map((a) => <span key={a}>{a}</span>)}
      </div>
    </section>
  );
}
