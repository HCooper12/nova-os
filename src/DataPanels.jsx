import { sessionDay } from './novaThreadFacts.js';
import { finderOf, hueOf } from './glassMarks.js';

// THE DATA PANELS ON THE GLASS (3 Oct 2026) — design/mockups/67-agent-
// provenance-r2.html, screen 3 (Monday's workout, lit in three beats) and
// screen 5 (the joint answer, one panel, a part per agent).
//
// Every number here was read by code from his records (server/lib/panels.js);
// the model only chose which part to light, and code checked that part is
// there (src/glassMarks.js). One thing lit at a time: the lit part wears the
// finder's hue with a soft ring, everything else steps back, and the stage
// names the lit part in words, so colour never carries it alone. The
// lighting is a CSS transition on opacity, colour and shadow (interruptible:
// a relight mid-change retargets), and under reduced motion it switches.
// Drawn by the .nv-dp block in index.css; type is set from --dp-f (13px in
// the thread, 15px on the full-screen plate).

const kg = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1).replace(/\.0$/, ''));
const reps = (t) => (t ? `${t.repsLow}${t.repsHigh > t.repsLow ? `–${t.repsHigh}` : ''}` : '');

export function SessionPanel({ card, mini = false }) {
  const d = card.data;
  if (!d || !(d.lifts || []).length) return null;
  const at = card.lit?.at || null;
  const heroIdx = at ? at.lift : 0;
  const lift = d.lifts[heroIdx];
  const work = lift.sets.filter((s) => s.n != null);
  const warm = lift.sets.length - work.length;
  const t = lift.target;
  // the bars share one scale with the target line, a rep above the taller
  const top = Math.max(1, ...work.map((s) => s.reps), t ? t.repsLow : 0) + 1;
  const pct = (r) => `${((r / top) * 100).toFixed(1)}%`;
  const liftLit = !!at && at.set == null && !at.field && !at.target;
  const kgLit = !!at && ((at.field === 'kg' && at.set == null) || at.target);
  const setLit = (n) => !!at && at.set === n;
  const anyLit = !!at;
  const compact = mini || card.compact;
  const others = d.lifts.map((l, i) => ({ l, i })).filter((x) => x.i !== heroIdx);
  const sentence = `${d.weekday || sessionDay(d.date)} ${d.date}, ${d.routineName}. ${lift.name}${lift.topKg != null ? `, ${kg(lift.topKg)} kg` : ''}: ${work.map((s) => `set ${s.n}, ${s.reps} reps${s.rpe != null ? ` at RPE ${s.rpe}` : ''}`).join('; ')}.${t ? ` Target ${reps(t)} reps.` : ''}`;
  return (
    <div className={`nv-dp nv-dp-sess${compact ? ' sm' : ''}${anyLit ? ' lit' : ''}`} style={{ '--h': card.lit?.hue || card.hue }} role="img" aria-label={sentence}>
      <div className="nv-dp-sh"><span>{sessionDay(d.date)} · {d.routineName}</span><span>from your log</span></div>
      <div className={`nv-dp-hero lx${liftLit ? ' on' : ''}${anyLit && !liftLit ? ' held' : ''}`}>
        <div className="nv-dp-ht">
          <b className="lx">{lift.name}</b>
          {lift.topKg != null && <span className={`nv-dp-kg lx${kgLit ? ' on' : ''}`}><em>{kg(lift.topKg)}</em>kg</span>}
        </div>
        {work.length > 0 && (
          <div className="nv-dp-plot">
            <div className="nv-dp-bars" style={{ gridTemplateColumns: `repeat(${work.length}, minmax(0, 1fr))` }}>
              {work.map((s) => {
                const short = t && at?.target && s.reps < t.repsLow;
                return (
                  <span key={s.n} className={`nv-dp-set lx${setLit(s.n) ? ' on' : ''}${anyLit && !setLit(s.n) && !liftLit && !at?.target ? ' dim' : ''}`}>
                    {t && <i className={`nv-dp-gap lx${short ? ' on' : ''}`} style={{ height: pct(t.repsLow) }} />}
                    <i className="nv-dp-bar lx" style={{ height: pct(s.reps) }}><em>{s.reps}</em></i>
                  </span>
                );
              })}
              {t && (
                <span className={`nv-dp-tgt lx${at?.target ? ' on' : ''}`} style={{ bottom: pct(t.repsLow) }}>
                  <b>{reps(t)} reps</b>
                </span>
              )}
            </div>
            <div className="nv-dp-caps" style={{ gridTemplateColumns: `repeat(${work.length}, minmax(0, 1fr))` }}>
              {work.map((s) => (
                <span key={s.n} className={`lx${setLit(s.n) ? ' on' : ''}${anyLit && !setLit(s.n) && !liftLit && !at?.target ? ' dim' : ''}`}>
                  Set {s.n}{s.type === 'backoff' ? ' · back-off' : ''}{!compact && s.rpe != null ? <><br />RPE {s.rpe}</> : null}
                </span>
              ))}
            </div>
          </div>
        )}
        {!compact && warm > 0 && <p className="nv-dp-warm">and {warm} warm-up {warm === 1 ? 'set' : 'sets'}, not counted</p>}
      </div>
      {!compact && others.map(({ l, i }) => {
        const w = l.sets.filter((s) => s.n != null);
        return (
          <div key={`${l.name}:${i}`} className={`nv-dp-lift lx${anyLit ? ' dim' : ''}`}>
            <span className="nm">{l.name}</span>
            <span className="nb">{l.topKg != null ? `${kg(l.topKg)} kg · ` : ''}{w.map((s) => s.reps).join(' ')}</span>
          </div>
        );
      })}
    </div>
  );
}

// The Coach's lift over his last sessions, as a line: top working weight per
// session, oldest at the left. Two points minimum (the server says so).
function Trend({ s }) {
  const pts = s.points || [];
  const lo = Math.min(...pts.map((p) => p.topKg));
  const hi = Math.max(...pts.map((p) => p.topKg));
  const span = hi - lo || 1;
  const xy = pts.map((p, i) => [8 + (i * 284) / Math.max(1, pts.length - 1), hi === lo ? 20 : 34 - ((p.topKg - lo) / span) * 28]);
  return (
    <>
      <svg className="nv-dp-chart lx" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={xy.map((p) => p.join(',')).join(' ')} />
        {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.6" />)}
      </svg>
      <p className="nv-dp-leg"><b className="lx">{s.lift}</b> {s.gist}</p>
    </>
  );
}

function Passage({ s, on }) {
  const ex = s.excerpt || '';
  const a = s.span?.start ?? 0;
  const b = s.span?.end ?? 0;
  return (
    <>
      <p className="nv-dp-quote">{ex.slice(0, a)}<mark className={`lx${on ? ' on' : ''}`}>{ex.slice(a, b)}</mark>{ex.slice(b)}</p>
      <span className="nv-dp-srm">{s.title}</span>
    </>
  );
}

function Finding({ s }) {
  const n = Math.min(12, s.sourceCount || 0);
  return (
    <>
      <p className="nv-dp-claim">{s.claim}</p>
      {s.sourceCount > 0 && (
        <span className="nv-dp-srm nv-dp-count">
          <span className="ticks" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} className="lx" />)}</span>
          {s.sourceCount} {s.sourceCount === 1 ? 'source' : 'sources'} in its brief
        </span>
      )}
    </>
  );
}

export function SourcesPanel({ card, mini = false }) {
  const sections = card.data?.sections || [];
  if (!sections.length) return null;
  const at = card.lit?.at || null;
  // the first part across the top; after it, two parts share a row (mockup
  // 67 screen 5), so three findings fit the stage without scrolling
  const pair = sections.length === 3;
  const part = (s) => {
    const on = !!at && at.section === s.agent;
    const f = finderOf(s.agent);
    return (
          <div key={s.agent} className={`nv-dp-sec lx${on ? ' on' : ''}${at && !on ? ' dim' : ''}`} style={{ '--h': hueOf(s.agent) }}>
            <div className="nv-dp-srh"><i aria-hidden="true" /><b>{f.name}</b>{s.meta && <span>{s.meta}</span>}</div>
            {s.type === 'trend' && <Trend s={s} />}
            {s.type === 'passage' && <Passage s={s} on={on && at.quote} />}
            {s.type === 'finding' && <Finding s={s} />}
            {s.type === 'words' && (
              <>
                <p className="nv-dp-words">“{s.words}”</p>
                <span className="nv-dp-srm">{s.title ? `its own words, citing ${s.title}` : 'its own words'}</span>
              </>
            )}
          </div>
    );
  };
  return (
    <div className={`nv-dp nv-dp-srcs${mini || card.compact ? ' sm' : ''}${at ? ' lit' : ''}`} role="group"
      aria-label={`Put together from ${sections.map((s) => finderOf(s.agent).the).join(', ')}`}>
      {pair ? <>{part(sections[0])}<div className="nv-dp-pair">{part(sections[1])}{part(sections[2])}</div></> : sections.map(part)}
    </div>
  );
}
