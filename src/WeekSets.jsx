import { useMemo, useRef } from 'react';
import { muscleVar } from './muscleHue.js';
import { muscleWeekView } from './muscleWeekView.js';
import { uncountedView } from './weekSets.js';
import { GlassSheet } from './GlassSheet.jsx';
import { Uncounted } from './Uncounted.jsx';
import { Eyebrow, TextAction } from './Controls.jsx';
import './muscleWeek.css';

// THE WEEKLY MUSCLE SETS SHEET (16 Oct 2026, his approved round 4 mockup).
// It grows out of the hard-sets card he tapped (GlassSheet's morph) and
// answers in the order he would ask:
//   where does the week land?  one serif sentence about his goal muscles
//   per muscle?                one bar each on a shared 0 to 25 scale with the
//                              growth range shaded: solid focus sets done,
//                              striped accessory sets done (½ each), and an
//                              outlined tail for what the plan still adds
//   from which workouts?       a card per training day, its focus muscles as
//                              filled chips and the ones it also works outlined
// TAP A MUSCLE and its row grows into a card (clip-path from the row's rect,
// the house smooth spring, critically damped) listing every exercise that
// adds to it, day by day; the lines add up to the number on the bar. Close
// folds it back into the same row, and a tap mid-fold reverses from where
// the fold is. Everything is from src/muscleWeekView.js (pure, tested).

function Bar({ bar }) {
  return (
    <div className="nv-mw-bar" aria-hidden="true">
      <div className="nv-mw-rng" style={{ left: `${bar.range.left}%`, width: `${bar.range.width}%` }} />
      {bar.focus > 0 && <span className="nv-mw-f" style={{ width: `${bar.focus}%` }} />}
      {bar.acc.width > 0 && <span className="nv-mw-a" style={{ left: `${bar.acc.left}%`, width: `${bar.acc.width}%` }} />}
      {bar.plan.width > 0 && <span className="nv-mw-p" style={{ left: `${bar.plan.left}%`, width: `${bar.plan.width}%` }} />}
    </div>
  );
}

function Row({ r, onOpen, i }) {
  return (
    <button type="button" className={`nv-mw-m${r.tone ? ` ${r.tone}` : ''}`} data-m={r.muscle} aria-label={r.aria} aria-haspopup="dialog"
      style={{ '--h': muscleVar(r.muscle), '--i': Math.min(i, 12) }} onClick={(e) => onOpen(r.muscle, e.currentTarget)}>
      <span className="nv-mw-nm">{r.muscle}</span>
      <Bar bar={r.bar} />
      <span className="nv-mw-n"><b>{r.done}</b><small>→ {r.bySunday}</small></span>
    </button>
  );
}

function Chip({ c }) {
  return (
    <span className={`nv-mw-chip${c.acc ? ' acc' : ''}`} style={{ '--h': muscleVar(c.muscle) }}>
      <i className={c.acc ? 'nv-mw-a' : 'nv-mw-f'} />{c.muscle} <b>{c.sets}</b>
    </span>
  );
}

function Day({ d }) {
  return (
    <div className={`nv-mw-day ${d.status}${d.isToday ? ' is-today' : ''}`}>
      <div className="nv-mw-dh">
        <Eyebrow as="span">{d.short}</Eyebrow>
        <b>{d.routine}</b>
        {d.label && <span className="nv-mw-st">{d.label}</span>}
      </div>
      {d.focus.length > 0 && <div className="nv-mw-chips">{d.focus.map((c) => <Chip key={c.muscle} c={c} />)}</div>}
      {d.accessory.length > 0 && <div className="nv-mw-chips">{d.accessory.map((c) => <Chip key={c.muscle} c={c} />)}</div>}
    </div>
  );
}

export function WeekSetsSheet({ model, originEl, onClose, onAskCoach }) {
  const scrollRef = useRef(null);
  const view = useMemo(() => muscleWeekView(model), [model]);
  const uc = useMemo(() => uncountedView(model?.uncounted), [model]);
  const open = () => {}; // the muscle card arrives in the next change
  if (!view) return null;
  return (
    <GlassSheet label="Weekly muscle sets" originEl={originEl} onClose={onClose} scrollRef={scrollRef}>
      <div className="nv-mw">
        <div className="nv-mw-hero">
          <Eyebrow as="span">{view.eyebrow}</Eyebrow>
          {view.headline && <h2><em>{view.headline.count}</em> {view.headline.rest}</h2>}
          <p>{view.sub}</p>
        </div>
        <div className="nv-mw-key" aria-hidden="true">
          <span><i className="nv-mw-f" />Focus, done</span>
          <span><i className="nv-mw-a" />Accessory ½, done</span>
          <span><i className="nv-mw-p" />Still in the plan</span>
          <span><i className="nv-mw-kr" />{view.rangeKey}</span>
        </div>
        <Uncounted u={uc} />
        {view.goal.length > 0 && (
          <>
            <div className="nv-mw-sect"><Eyebrow as="span">{view.group}</Eyebrow><Eyebrow as="span">done · by Sunday</Eyebrow></div>
            <div>{view.goal.map((r, i) => <Row key={r.muscle} r={r} i={i} onOpen={open} />)}</div>
          </>
        )}
        {view.rest.length > 0 && (
          <>
            <div className="nv-mw-sect"><Eyebrow as="span">{view.goal.length ? 'Everything else' : 'Every muscle'}</Eyebrow>{!view.goal.length && <Eyebrow as="span">done · by Sunday</Eyebrow>}</div>
            <div>{view.rest.map((r, i) => <Row key={r.muscle} r={r} i={i + view.goal.length} onOpen={open} />)}</div>
          </>
        )}
        <div className="nv-mw-scale" aria-hidden="true">
          <span />
          <div>{view.scale.map((s) => <span key={s.n} style={{ left: `${s.at}%` }}>{s.n}</span>)}</div>
          <span />
        </div>
        {view.days.length > 0 && (
          <>
            <div className="nv-mw-sect" style={{ marginTop: 22 }}><Eyebrow as="span">The workouts</Eyebrow><Eyebrow as="span">focus · also works</Eyebrow></div>
            <div className="nv-mw-days">{view.days.map((d) => <Day key={d.key} d={d} />)}</div>
          </>
        )}
        {onAskCoach && (
          <div className="nv-mw-talk">
            <TextAction tone="cyan" onClick={() => { onClose(); onAskCoach(view.coachQuestion); }}>Talk this week through with Coach →</TextAction>
          </div>
        )}
      </div>
    </GlassSheet>
  );
}
