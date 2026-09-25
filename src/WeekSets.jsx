import { useRef } from 'react';
import { css } from './css.js';
import { muscleVar } from './muscleHue.js';
import { GlassSheet } from './GlassSheet.jsx';
import { Interactive } from './Interactive.jsx';
import { Eyebrow, Meta, Tag, TextAction } from './Controls.jsx';

// THE PLANNED WEEK, SET BY SET (25 Sep 2026). His ask: through "Hard sets
// this week", every exercise his program plans for each muscle across the
// week. It grows out of the card he tapped (GlassSheet's morph) and answers
// three questions in the order he would ask them:
//   how much?  the count as a figure, and a spectrum of the week's sets, one
//              band per muscle in its own hue, filled as far as it is done
//   when?      the week as a grid: a row per muscle, a column per day, a pip
//              per set, so which days hit which muscles is a shape, not a list
//   what?      per muscle, a ring against its target and every exercise on
//              its day, with its sets as pips and one word where the pips
//              cannot speak (not done, today, done Wed, not in the plan)
// Everything is from src/weekSets.js (pure, tested); this file only draws.
// Colour: each muscle owns its hue; gold is the set ticked right now (as on
// the bars); cyan is today; warn is reserved for a goal muscle the plan
// cannot carry to target.

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Pip({ s, size }) {
  return <i className="nv-wk-pip" data-s={s} style={size ? { '--wk-pip': `${size}px` } : undefined} />;
}

// a ring against the muscle's target: the solid arc is done, the faint one
// is where the plan as written would take it by Sunday
function MuscleRing({ m }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const hue = muscleVar(m.muscle);
  return (
    <div style={css('position:relative;width:54px;height:54px;flex:none')}>
      <svg viewBox="0 0 54 54" width="54" height="54" style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx="27" cy="27" r={r} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth="5" />
        {m.unplanned && m.done === 0 ? (
          // nothing planned: a gap, drawn as the house dashed ring, never a zero
          <circle cx="27" cy="27" r={r} fill="none" stroke={hue} strokeOpacity=".55" strokeWidth="2.5" strokeDasharray="3 5" />
        ) : (
          <>
            <circle className="nv-wk-arc" cx="27" cy="27" r={r} fill="none" stroke={hue} strokeOpacity=".28" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - m.projectedPct)} style={{ '--wk-c': c }} />
            <circle className="nv-wk-arc" cx="27" cy="27" r={r} fill="none" stroke={hue} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - m.pct)} style={{ '--wk-c': c, filter: `drop-shadow(0 0 4px color-mix(in srgb, ${hue} 55%, transparent))` }} />
          </>
        )}
      </svg>
      <div style={css('position:absolute;inset:0;display:grid;place-items:center')}>
        <b style={css(`font:400 19px/1 var(--nv-font-serif);font-variant-numeric:tabular-nums;color:${m.short ? 'var(--nv-warn)' : 'var(--nv-ink)'}`)}>{m.done}</b>
      </div>
    </div>
  );
}

// the week's sets as one band, a segment per muscle sized by what is planned
function Spectrum({ muscles }) {
  const planned = muscles.filter((m) => m.planned > 0);
  if (!planned.length) return null;
  return (
    <div aria-hidden="true" style={css('display:flex;gap:2px;height:6px;margin-top:12px')}>
      {planned.map((m, i) => {
        const hue = muscleVar(m.muscle);
        const pct = Math.min(1, m.done / m.planned);
        return (
          <span key={m.muscle} style={{ flex: `${m.planned} 1 0`, minWidth: '6px', borderRadius: '3px', overflow: 'hidden', background: `color-mix(in srgb, ${hue} 18%, transparent)` }}>
            <i className="nv-wk-fill" style={{ display: 'block', height: '100%', width: '100%', background: hue, transform: `scaleX(${pct})`, transformOrigin: 'left center', '--i': i }} />
          </span>
        );
      })}
    </div>
  );
}

const COLS = 'grid-template-columns:86px repeat(7,minmax(0,1fr))';

function WeekGrid({ view, onPick }) {
  const todayBg = 'color-mix(in srgb, var(--nv-cy) 7%, transparent)';
  return (
    <div className="nv-wk-grid" role="group" aria-label="Planned sets by muscle and day" style={css('margin-top:18px')}>
      <div aria-hidden="true" style={css(`display:grid;${COLS}`)}>
        <span />
        {view.days.map((d) => (
          <span key={d.key} style={css(`display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 0 7px;border-radius:9px 9px 0 0;min-width:0;${d.isToday ? `background:${todayBg}` : ''}`)}>
            <b style={css(`font:600 11px var(--nv-font-ui);letter-spacing:.02em;color:${d.isToday ? 'var(--nv-cy)' : d.rest ? 'var(--nv-ink40)' : 'var(--nv-ink60)'}`)}>{d.short}</b>
            <span title={d.routineFull || 'Rest'} style={css(`font:500 9.5px var(--nv-font-ui);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${d.isToday ? 'color-mix(in srgb, var(--nv-cy) 80%, transparent)' : 'var(--nv-ink40)'}`)}>{d.routine}</span>
          </span>
        ))}
      </div>
      {view.muscles.map((m, mi) => (
        <Interactive key={m.muscle} onClick={() => onPick(m)} aria-label={`${m.muscle}: ${m.done} done of ${m.planned} planned, target ${m.target}. Show its exercises`}
          base={`display:grid;${COLS};align-items:stretch;cursor:pointer;border-top:1px solid color-mix(in srgb, var(--nv-ink) 6%, transparent);border-radius:0`}
          hoverStyle="background:color-mix(in srgb, var(--nv-ink) 3%, transparent)"
          style={{ '--wk-hue': muscleVar(m.muscle) }}>
          <span style={css('display:flex;flex-direction:column;justify-content:center;gap:1px;padding:7px 4px 7px 0;min-width:0')}>
            <b style={css('font:600 12.5px var(--nv-font-ui);color:var(--wk-hue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{m.muscle}</b>
            <span style={css(`font:500 10.5px var(--nv-font-ui);font-variant-numeric:tabular-nums;color:${m.short ? 'var(--nv-warn)' : 'var(--nv-ink50)'}`)}>{m.done}/{m.planned}</span>
          </span>
          {m.cells.map((cell, di) => (
            <span key={di} aria-hidden="true" style={css(`display:flex;flex-direction:column;justify-content:center;gap:3px;padding:6px 2px;min-width:0;${view.days[di].isToday ? `background:${todayBg};` : ''}${mi === view.muscles.length - 1 && view.days[di].isToday ? 'border-radius:0 0 9px 9px;' : ''}`)}>
              {cell.map((line, li) => (
                <span key={li} style={css('display:flex;flex-wrap:wrap;justify-content:center;gap:2px;width:100%')}>
                  {line.map((s, k) => <i key={k} className="nv-wk-pip" data-s={s} style={{ '--wk-pip': '6px', '--d': di }} />)}
                </span>
              ))}
            </span>
          ))}
        </Interactive>
      ))}
    </div>
  );
}

function MuscleSection({ m, i, sectionRef }) {
  const hue = muscleVar(m.muscle);
  return (
    <section ref={sectionRef} id={m.id} className="nv-wk-sec" aria-label={m.muscle}
      style={{ '--wk-hue': hue, '--i': Math.min(i, 6), ...css('position:relative;overflow:hidden;scroll-margin-top:58px;padding:16px 0 4px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 8%, transparent)') }}>
      <div style={css('display:flex;align-items:center;gap:13px')}>
        <MuscleRing m={m} />
        <div style={css('flex:1;min-width:0')}>
          <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
            <span style={css(`font:600 17px/1.2 var(--nv-font-ui);letter-spacing:-.01em;color:${hue}`)}>{m.muscle}</span>
            {m.goal && <Tag tone={hue}>Goal</Tag>}
          </div>
          <Meta as="div" style={{ marginTop: '3px' }}>
            {m.unplanned ? `Nothing planned · target ${m.target}` : `${m.done} done · ${m.planned} planned · target ${m.target}`}
          </Meta>
          {m.short && !m.unplanned && (
            <Meta as="div" tone="warn" style={{ marginTop: '2px' }}>▲ {m.projected} of {m.target} by Sunday on the plan as written</Meta>
          )}
        </div>
      </div>
      <div role="list" style={css('margin-top:8px')}>
        {m.rows.map((r) => (
          <div key={r.key} role="listitem" style={css(`display:grid;grid-template-columns:34px minmax(0,1fr) auto;column-gap:10px;align-items:start;padding:9px 0;border-top:1px solid color-mix(in srgb, var(--nv-ink) 5%, transparent)`)}>
            <span style={css(`font:600 11px/1.6 var(--nv-font-ui);letter-spacing:.02em;color:${r.isToday ? 'var(--nv-cy)' : 'var(--nv-ink50)'}`)}>{r.day}</span>
            <div style={css('min-width:0')}>
              <div style={css(`font:500 14px/1.3 var(--nv-font-ui);color:${r.extra ? 'var(--nv-ink60)' : 'var(--nv-ink)'};overflow-wrap:anywhere`)}>{r.name}</div>
              <div style={css(`margin-top:2px;font:500 11.5px var(--nv-font-ui);font-variant-numeric:tabular-nums;color:${r.extra ? hue : 'var(--nv-ink50)'}`)}>{r.detail}</div>
            </div>
            <div style={css('display:flex;flex-direction:column;align-items:flex-end;gap:5px;padding-top:4px')}>
              <span style={css('display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;max-width:92px')}>
                {r.pips.map((s, k) => <Pip key={k} s={s} size={9} />)}
              </span>
              {r.status && (
                <span style={css(`font:500 11px var(--nv-font-ui);white-space:nowrap;color:${
                  r.status.tone === 'cyan' ? 'var(--nv-cy)' : r.status.tone === 'gold' ? 'var(--nv-gold)' : r.status.tone === 'good' ? 'var(--nv-good)' : 'var(--nv-ink50)'}`)}>{r.status.text}</span>
              )}
            </div>
          </div>
        ))}
        {m.unplanned && !m.rows.length && (
          <div style={css('padding:10px 0 6px 44px;font:500 13px/1.4 var(--nv-font-ui);color:var(--nv-ink60)')}>
            No exercise in this week's schedule trains {m.muscle.toLowerCase()}.
          </div>
        )}
      </div>
    </section>
  );
}

const LEGEND = [['done', 'Done'], ['live', 'In progress'], ['due', 'To come'], ['missed', 'Not done'], ['extra', 'Not in the plan']];

export function WeekSetsSheet({ view, originEl, onClose, onAskCoach }) {
  const scrollRef = useRef(null);
  const sections = useRef({});
  if (!view) return null;
  // a row in the grid takes him to that muscle's exercises, and a light
  // passes over the section so the eye lands on the right one
  const pick = (m) => {
    const el = sections.current[m.muscle];
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    el.removeAttribute('data-flash');
    void el.offsetWidth; // restart the sweep on a second tap
    el.setAttribute('data-flash', '');
  };
  return (
    <GlassSheet label="Hard sets: the planned week" originEl={originEl} onClose={onClose} scrollRef={scrollRef}>
      <div style={{ '--wk-hue': 'var(--nv-ink40)' }}>
        <Eyebrow>Hard sets · the planned week</Eyebrow>
        <div style={css('display:flex;align-items:baseline;gap:9px;margin-top:8px;flex-wrap:wrap')}>
          <span style={css('font:400 40px/1 var(--nv-font-serif);font-variant-numeric:tabular-nums;letter-spacing:-.01em')}>{view.done}</span>
          <span style={css('font:600 17px/1.2 var(--nv-font-ui);letter-spacing:-.01em;color:var(--nv-ink60)')}>of {view.planned} planned sets done</span>
        </div>
        <Spectrum muscles={view.muscles} />
        {view.aheadLine && (
          <p style={css('margin:12px 0 0;font:italic 400 17px/1.35 var(--nv-font-serif);color:var(--nv-ink);text-wrap:balance')}>{view.aheadLine}</p>
        )}
        {view.warn && (
          <p style={css('margin:8px 0 0;font:500 13px/1.45 var(--nv-font-ui);color:var(--nv-warn);text-wrap:pretty')}>▲ {view.warn}</p>
        )}
        <WeekGrid view={view} onPick={pick} />
        <div aria-hidden="true" style={css('display:flex;flex-wrap:wrap;gap:6px 14px;margin:12px 0 6px')}>
          {LEGEND.map(([s, label]) => (
            <span key={s} style={css('display:inline-flex;align-items:center;gap:6px;font:500 11px var(--nv-font-ui);color:var(--nv-ink50)')}>
              <Pip s={s} size={8} />{label}
            </span>
          ))}
        </div>
        <div style={css('margin-top:14px')}>
          {view.muscles.map((m, i) => (
            <MuscleSection key={m.muscle} m={m} i={i} sectionRef={(el) => { sections.current[m.muscle] = el; }} />
          ))}
        </div>
        {onAskCoach && (
          <div style={css('margin-top:14px;padding-top:12px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 8%, transparent);display:flex;justify-content:flex-start')}>
            <TextAction tone="cyan" onClick={() => { onClose(); onAskCoach(view.coachQuestion); }}>Talk this week through with Coach →</TextAction>
          </div>
        )}
      </div>
    </GlassSheet>
  );
}
