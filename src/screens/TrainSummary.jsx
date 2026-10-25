import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Interactive } from '../Interactive.jsx';
import { TextAction, Rail } from '../Controls.jsx';
import { CardHead } from './MissionSummary.jsx';
import { CoachSuggestionDeck } from '../CoachSuggestions.jsx';
import { WeekSetsSheet } from '../WeekSets.jsx';
import { AlsoWorks } from '../AlsoWorks.jsx';
import { Uncounted } from '../Uncounted.jsx';
import { FormCheckPanel } from '../FormCheckPanel.jsx';
import { SwipeRow } from '../SwipeRow.jsx';
import { useExit } from '../useExit.js';
import { useSheetDrag } from '../useSheetDrag.js';
import { GlyphTile } from '../BodyGlyph.jsx';
import { DayPlanSheet } from '../DayPlanSheet.jsx';
import { RoutineEditor, RoutineTitleEdit } from '../RoutineEditor.jsx';
import { WalkCard } from '../WalkCard.jsx';

// THE SUMMARY TRAIN PAGE — redesign round 1, variation A, his pick (27 Sep
// 2026): "Train: let's go option A" on design/mockups/58-redesign-train.html.
// Two places, not three tabs. Under the `summary` style Train is this page,
// Coach is a door on it that opens as a sheet, and today's readiness ring and
// session card are Home's (MissionSummary's Training and Body cards). It
// answers the audit's findings 1 (Coach was the tail of Gym's own scroll),
// 2 (today's card drawn twice), 4 (Home already draws readiness), 7 (four
// postures for a no; here every no asks once and leaves Undo, except a
// routine delete, which the server cannot undo) and 9 (the quick builder and
// the forms as plain panes): design/audits/redesign-2026-09/03-train.md.
//
// Top to bottom: Train · the hero (one filled button, Begin) · recovery rows
// only while they exist · the week as seven dots · the Coach row · Routines ·
// Quick session and Hard sets as two half cards · Momentum. A routine opens
// as a page; the live session is the classic one, untouched (round B).
//
// It reads `v.trainSummary` (src/vals/valsTrainSummary.js) and draws; every
// action is a handler the view model built from existing app methods. The
// classic Workouts.jsx hands in the parts it reuses (the history list, the
// exercise picker, Goals and the conversation) so nothing is drawn twice.
//
// Material: the summary card (.nv-sum-card) and the Edit sheet's glass
// (.nv-liquid .nv-sum-sheet); classes .nv-ts-* in index.css. Type is four
// sizes, 34 · 20 · 15 · 13, numerals SF Rounded. Colour means one thing
// each: a muscle wears its own hue (src/muscleHue.js), gold is only what
// waits on his call (the Coach dot and count), green a done day or a yes,
// red a discard, cyan Train's own, and the theme's button fill is on Begin
// alone.


// one stroke family, the summary Home's (.nv-sum-ico), drawn at 24
const P = {
  coach: <><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M9 10.5h6" /></>,
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  bars: <path d="M5 20v-9M10 20V5M15 20v-7M20 20v-4" />,
  week: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  spark: <path d="M4 17l6-6 4 4 6-8" />,
  fig: <><circle cx="12" cy="4.8" r="2" /><path d="M12 7.5v6M8 21l4-7.5 4 7.5M6 10.5h12" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  right: <path d="m9 6 6 6-6 6" />,
  left: <path d="m15 6-6 6 6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  up: <path d="m6 14 6-6 6 6" />,
  down: <path d="m6 10 6 6 6-6" />,
  cam: <><rect x="3" y="7" width="13" height="11" rx="2" /><path d="m16 11 5-3v9l-5-3" /></>,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></>,
  undo: <><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 0 12" /></>,
  box: <><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></>,
};
function Ico({ p, cls = '', size }) {
  return (
    <svg className={`nv-ts-ico ${cls}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={size ? { width: size, height: size } : undefined}>{p}</svg>
  );
}
// the ⋯ and the play mark are solid shapes, not strokes
const Dots = () => (
  <svg className="nv-ts-ico fill" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 20, height: 20 }}>
    <circle cx="5.5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="18.5" cy="12" r="2" />
  </svg>
);
const Play = () => (
  <svg className="nv-ts-ico fill" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 14, height: 14 }}><path d="M7 4.5v15l12.5-7.5z" /></svg>
);

// MOCKUP 101 (13 Oct 2026): one card grammar on Train, as on Fuel: a
// gradient tile, the title, a quiet meta. A tile with a stroke icon...
function ITile({ p, a, b }) {
  return <span className="nv-tile" style={{ '--a': a, ...(b ? { '--b': b } : null) }} aria-hidden="true"><Ico p={p} size={17} cls="thick" /></span>;
}
function Head({ tile, label, meta, tint }) {
  return (
    <div className="nv-sum-ch nv-ts-ch">
      {tile}
      <span style={tint ? { color: tint } : undefined}>{label}</span>
      {meta && <span className="nv-sum-ch-meta">{meta}</span>}
    </div>
  );
}
// ...and a routine's muscles as ONE strip, each in its own hue, in place of
// a row of chips (his "colour choices and layout" were the keepers)
function MuscleStrip({ chips, counts }) {
  if (!chips?.length) return null;
  return (
    <div className="nv-ts-mix">
      <div className="nv-ts-mixbar" aria-hidden="true">
        {chips.map((c, i) => <i key={c.muscle} style={{ '--h': c.hue, flex: c.count || 1, '--k': i }} />)}
      </div>
      <div className="nv-ts-mixkeys">
        {chips.map((c) => <span key={c.muscle} style={{ '--h': c.hue }}>{c.muscle}{counts && c.count ? ` ${c.count}` : ''}</span>)}
      </div>
    </div>
  );
}
const hueA = (chips, i, fb) => chips?.[i]?.hue || fb;

// a tap on a control inside a sheet's grab zone is a tap, not a sheet drag
const onControl = (el) => !!(el && el.closest && el.closest('[role="button"], button, a, input, select'));

// ============================================================== the page ==
export function TrainSummary({ v, parts }) {
  const T = v.trainSummary;
  return (
    <div style={v.wrapWorkouts} data-screen-label="Workouts">
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {T.view === 'routine' && T.detail ? <RoutinePage d={T.detail} v={v} parts={parts} />
          : T.view === 'history' ? <HistoryPage v={v} parts={parts} />
            : <GymPage T={T} />}
      </div>
      {T.coachSheet.open && <CoachSheet s={T.coachSheet} v={v} parts={parts} />}
      {v.dayPlanSheet && <DayPlanSheet s={v.dayPlanSheet} />}
    </div>
  );
}

function GymPage({ T }) {
  return (
    <>
      <h1 className="nv-sum-rise nv-ts-title" style={{ '--i': 0 }}>Train</h1>
      <div className="nv-ts-stack">
        <Hero h={T.hero} />
        <Recovery r={T.recovery} />
        <WeekCard w={T.week} carry={T.recovery.carryovers} />
        {T.walk && <WalkCard w={T.walk} style={{ '--i': 2 }} />}
        <CoachRow c={T.coach} />
      </div>
      <Routines T={T} />
      <HalfCards q={T.quick} hs={T.hardSets} />
      {T.quick.plan && <QuickPlan p={T.quick.plan} />}
      {T.momentum && <Momentum m={T.momentum} />}
    </>
  );
}

// ------------------------------------------------------------------ hero --
function Hero({ h }) {
  const tint = h.kind === 'done' ? 'var(--nv-good)' : 'var(--nv-cy)';
  return (
    // data-grow: the card a live session closes back onto (App.playPageMove)
    <section data-grow="hero" className="nv-sum-card nv-sum-rise nv-ts-hero" style={{ '--i': 1, '--nv-sum-tint': hueA(h.chips, 0, tint), '--nv-g2': hueA(h.chips, 1, tint), '--nv-g3': hueA(h.chips, 2, tint) }} aria-label={h.eyebrow}>
      <Head label={h.eyebrow} meta={h.when}
        tile={h.glyph ? <GlyphTile g={h.glyph} a={hueA(h.chips, 0, tint)} b={hueA(h.chips, 1, undefined)} />
          : <ITile p={h.kind === 'done' ? P.check : P.fig} a={tint} />} />
      <div className="nv-ts-hrow">
        {h.kind === 'done' && <span className="nv-ts-donering" aria-hidden="true"><Ico p={P.check} size={20} /></span>}
        <div style={{ minWidth: 0 }}>
          <div className="nv-ts-hname">{h.title}</div>
          {h.sub && <div className="nv-ts-sub">{h.sub}</div>}
        </div>
      </div>
      {/* THE WHOLE DAY (3 Oct): a line per session, in the order done; a
          left-off note is ink, because it was his call and is not owed */}
      {h.lines?.length > 0 && (
        <ul className="nv-ts-dlines" aria-label="Today's sessions">
          {h.lines.map((l, i) => (
            <li key={l.key} className="nv-ts-dline" style={{ '--i': i }} title={l.leftOffWhy || undefined}>
              <i aria-hidden="true"><Ico p={P.check} size={11} cls="thick" /></i>
              <span className="nv-ts-nm">{l.title}</span>
              <span className="nv-ts-dmeta">{l.meta}</span>
            </li>
          ))}
        </ul>
      )}
      {h.chips?.length > 0 && <MuscleStrip chips={h.chips} counts />}
      {h.focus && <FocusLine f={h.focus} />}
      {h.readiness && <Readiness r={h.readiness} />}
      {h.also && (
        <div className="nv-ts-also">
          <span>{h.also.text}</span>
          <TextAction onClick={h.also.run}>{h.also.label}</TextAction>
        </div>
      )}
      {(h.primary || h.secondary || h.quiet) && (
        <div className="nv-ts-acts">
          {h.primary && (
            <Interactive as="button" className="nv-ts-begin" onClick={h.primary.run} haptic="commit" activeStyle={{ transform: 'scale(.97)' }}>
              <Play />{h.primary.label}
            </Interactive>
          )}
          {h.secondary && <button type="button" className="nv-ts-talk" onClick={h.secondary.run}>{h.secondary.label}</button>}
          {h.quiet && <TextAction tone="quiet" onClick={h.quiet.run}>{h.quiet.label}</TextAction>}
        </div>
      )}
    </section>
  );
}

// TODAY'S FOCUS: the serif line, the lift in its muscle's own hue
// Coach's headline stays in the serif; the long reason folds under "Why"
// (mockup 101: it was half the card)
function FocusLine({ f }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="nv-ts-focusbox">
      <p className="nv-ts-focus">{f.lift ? <><em style={{ color: f.hue }}>{f.lift}</em>{f.rest}</> : f.text}</p>
      {f.why && (
        <>
          <button type="button" className="nv-ts-whybtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Ico p={P.right} size={12} cls="thick" />Why, from Coach</button>
          <div className={`nv-ts-whyt${open ? ' on' : ''}`}><p className="nv-ts-why">{f.why}</p></div>
        </>
      )}
      {f.fix && <div style={{ marginTop: '4px', marginLeft: '-8px' }}><TextAction onClick={f.fix.run}>{f.fix.label}</TextAction></div>}
    </div>
  );
}

// READINESS, as a line (the ring itself is Home's): its figure and block
// week, the inputs one tap away, and the two questions as quiet acts
function Readiness({ r }) {
  return (
    <div className="nv-ts-ready">
      <button type="button" className="nv-ts-readbtn" onClick={r.toggle} aria-expanded={r.open}
        aria-label={`Readiness ${r.value ?? 'unknown'}${r.block ? `, ${r.block}` : ''}. ${r.open ? 'Hide' : 'Show'} what it is built from`}>
        {r.value == null && <svg className="nv-ts-nored" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="11" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="3 4" /></svg>}
        <span>Readiness {r.value == null ? <span className="nv-ts-dim">· no reading yet</span> : <b>{r.value}</b>}</span>
        {r.block && <span className="nv-ts-dim">· {r.block}</span>}
        <span className="nv-ts-chev" data-open={r.open ? 'true' : undefined} aria-hidden="true"><Ico p={P.down} size={14} /></span>
      </button>
      {r.open && (
        <div className="nv-ts-facts">
          {r.facts.length ? r.facts.map((f) => <span key={f.k}>{f.k} <b>{f.v}</b></span>) : <span>{r.basis || 'No recent recovery data'}</span>}
          {r.basis && r.facts.length > 0 && <span className="nv-ts-dim">{r.basis}</span>}
        </div>
      )}
      {r.deload && <p className="nv-ts-warnline">{r.deload}</p>}
      {(r.tired || r.peak) && (
        <div className="nv-ts-qacts">
          {r.tired && <button type="button" className="nv-ts-q" onClick={r.tired}>Why am I tired?</button>}
          {r.peak && <button type="button" className="nv-ts-q" onClick={r.peak}>When am I at my best?</button>}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- recovery --
// Rows under the hero, only while they exist: a workout still recoverable,
// the lifts a finished session left undone, the make-ups Nova is holding.
function Recovery({ r }) {
  const rows = [];
  if (r.discarded) {
    const d = r.discarded;
    rows.push(
      <section key="discarded" className="nv-sum-card nv-sum-rise nv-ts-rrow" style={{ '--i': 2, '--h': 'var(--nv-warn)' }} aria-label="A workout you can still recover">
        <span className="nv-ts-rtile" aria-hidden="true"><Ico p={P.undo} /></span>
        <div style={{ minWidth: 0 }}>
          <span className="nv-ts-nm">{d.replaced ? 'Replaced' : 'Discarded'}: {d.name}</span>
          <span className="nv-ts-sv wrap">{d.sets} set{d.sets === 1 ? '' : 's'} logged · {d.replaced ? 'replaced' : 'discarded'} {d.when} · still recoverable</span>
          <div className="nv-ts-racts">
            <button type="button" className="nv-ts-tint" onClick={d.restore}>Restore it</button>
            <TextAction tone="quiet" onClick={d.dismiss}>Dismiss</TextAction>
          </div>
        </div>
      </section>,
    );
  }
  if (r.finishMissed) {
    const f = r.finishMissed;
    rows.push(
      <section key="missed" className="nv-sum-card nv-sum-rise nv-ts-rrow" style={{ '--i': 2, '--h': 'var(--nv-cy)' }} aria-label="Lifts not done">
        <span className="nv-ts-rtile" aria-hidden="true"><Ico p={P.right} /></span>
        <div style={{ minWidth: 0 }}>
          <span className="nv-ts-nm">{f.count} lift{f.count === 1 ? '' : 's'} not done</span>
          <span className="nv-ts-sv wrap">{f.names}</span>
          <div className="nv-ts-racts">
            <select className="nv-ts-select" value={f.date} onChange={f.setDate} aria-label="Push them to">
              {f.dayOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" className="nv-ts-tint" onClick={f.push}>Push them forward</button>
            <TextAction tone="quiet" onClick={f.dismiss}>No thanks</TextAction>
          </div>
        </div>
      </section>,
    );
  }
  // the make-ups Nova is holding live in the week card now (mockup 101)
  for (const c of r.carryoversHere || []) {
    const tone = c.overdue ? 'var(--nv-warn)' : 'var(--nv-cy)';
    rows.push(
      <section key={c.id} className="nv-sum-card nv-sum-rise nv-ts-rrow" style={{ '--i': 2, '--h': tone }} aria-label={c.title}>
        <span className="nv-ts-rtile" aria-hidden="true"><Ico p={P.box} /></span>
        <div style={{ minWidth: 0 }}>
          <span className="nv-ts-nm">{c.title.replace(/ — makeup$/, ' make-up')}</span>
          <span className="nv-ts-sv wrap"><span style={{ color: c.overdue ? 'var(--nv-warn)' : undefined }}>{c.when.charAt(0).toUpperCase() + c.when.slice(1)}</span> · {c.count} lift{c.count === 1 ? '' : 's'}: {c.names}</span>
          <div className="nv-ts-racts">
            {c.rescheduling ? (
              <>
                <select className="nv-ts-select" defaultValue="" onChange={c.reschedule} aria-label="Move it to">
                  <option value="" disabled>Pick a day…</option>
                  {c.dayOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <TextAction tone="quiet" onClick={c.cancelReschedule}>Cancel</TextAction>
              </>
            ) : (
              <>
                <button type="button" className="nv-ts-tint" onClick={c.start}>Do it now</button>
                <TextAction tone="quiet" onClick={c.startReschedule}>Reschedule</TextAction>
                <TextAction tone="quiet" onClick={c.remove}>Remove</TextAction>
              </>
            )}
          </div>
        </div>
      </section>,
    );
  }
  return rows.length ? <>{rows}</> : null;
}

// ------------------------------------------------------------------ week --
// THE WEEK AS CAPSULES (mockup 101, 13 Oct 2026). A planned day is a capsule
// that fills in the colour of what it trains; missed is dashed; rest is a
// dot. Each is still the day's own select laid invisibly over it, so a tap
// opens the platform's picker: a routine, rest, or a make-up for that date.
// The make-ups Nova is holding sit at the foot: Do it now, Move (the free
// days as pills; the capsule travels to the one he picks) and Remove.
// the walker on an active-rest day a walk ticked (mockup 104 phone 2)
const WalkMark = () => (
  <svg className="nv-ts-ico thick nv-ts-capwk" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 16, height: 16 }}>
    <circle cx="13" cy="4.5" r="1.8" /><path d="M10 21l2.2-6.2L15 17v4M12.2 14.8l.8-5.8-3 1.6-1.5 3M13 9l2.2 3 2.8.8" />
  </svg>
);
const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const dayOfIso = (iso) => WEEKDAY[new Date(`${iso}T12:00:00`).getDay()];
function WeekCard({ w, carry }) {
  const capsRef = useRef(null);
  const [ghost, setGhost] = useState(null);
  const move = (c, o) => {
    const caps = capsRef.current;
    const from = caps?.querySelector(`[data-day="${dayOfIso(c.forDate)}"] .nv-ts-pod`);
    const to = caps?.querySelector(`[data-day="${dayOfIso(o.value)}"] .nv-ts-pod`);
    const go = () => c.reschedule({ target: { value: o.value } });
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!from || !to || reduce) { go(); return; }
    const box = caps.getBoundingClientRect(); const a = from.getBoundingClientRect(); const b = to.getBoundingClientRect();
    setGhost({ x: a.left - box.left, y: a.top - box.top, w: a.width, h: a.height, dx: b.left - a.left, hue: c.hue || 'var(--nv-cy)' });
    setTimeout(() => { setGhost(null); go(); }, 620);
  };
  return (
    <section className="nv-sum-card nv-sum-rise nv-ts-week" style={{ '--i': 2, '--nv-sum-tint': 'var(--nv-good)', '--nv-g2': w.dots.find((d) => d.hue)?.hue || 'var(--nv-good)', '--nv-g3': [...w.dots].reverse().find((d) => d.hue)?.hue || 'var(--nv-good)' }} aria-label="This week">
      <Head tile={<ITile p={P.week} a="var(--nv-good)" />} label="This week"
        meta={w.planned ? <><b className="nv-ts-cnt">{w.done}</b> of {w.planned} session{w.planned === 1 ? '' : 's'}</> : null} />
      {/* THE WEEK AS A LIST (mockup 105, his pick 26 Oct 2026): every day
          says what it holds, today lifted out with its Begin, rest and
          optional days quieter. A row opens the day sheet (mockup 104). */}
      <ul ref={capsRef} className="nv-ts-ag">
        {w.dots.map((d, i) => (
          <li key={d.day} className="nv-ts-agr" data-day={d.day} data-state={d.state} data-today={d.isToday ? 'true' : undefined} style={{ '--k': i }}>
            <button type="button" className="nv-ts-agb" onClick={d.openPlan || undefined} disabled={!d.openPlan} aria-label={d.aria}>
              <span className="nv-ts-agd">{d.label.slice(0, 3)}</span>
              <span className="nv-ts-agbars" aria-hidden="true">
                {(d.rows.length ? d.rows : [{ key: 'rest', rest: true, hue: 'var(--nv-ink60)' }]).map((r, j) => (
                  <i key={r.key} data-rest={r.rest ? 'true' : undefined} data-done={r.done ? 'true' : undefined} style={{ '--h': r.hue, '--j': j }} />
                ))}
              </span>
              <span className="nv-ts-agt">
                {d.rows.length ? d.rows.map((r) => (
                  <span key={r.key} className="nv-ts-agn" data-rest={r.rest ? 'true' : undefined}>
                    <span className="nm">{r.name}</span>
                    {(r.meta || r.optional) && <span className="mt">{[r.meta, r.optional && 'optional'].filter(Boolean).join(' · ')}</span>}
                  </span>
                )) : <span className="nv-ts-agn" data-rest="true"><span className="nm">Rest</span></span>}
              </span>
              {d.walk ? <WalkMark /> : d.state === 'done' ? <Ico p={P.check} size={15} cls="thick nv-ts-agck" />
                : d.makeup ? <Ico p={P.undo} size={14} cls="thick nv-ts-agck" /> : d.openPlan && <Ico p={P.right} size={15} cls="thick nv-ts-agch" />}
            </button>
          </li>
        ))}
        {ghost && <span className="nv-ts-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h, '--h': ghost.hue, '--dx': `${ghost.dx}px` }} aria-hidden="true" />}
      </ul>
      <div className="nv-ts-wfoot">
        {carry.map((c) => (
          <div key={c.id} className="nv-ts-open" style={{ '--h': c.hue || 'var(--nv-cy)' }}>
            <div className="nv-ts-openh">
              <span className="nv-ts-dash" aria-hidden="true" />
              <span style={{ minWidth: 0 }}>
                <span className="nv-ts-nm">{c.title.replace(/ — makeup$/, ' make-up')}</span>
                <span className="nv-ts-sv wrap"><span style={{ color: c.overdue ? 'var(--nv-warn)' : undefined }}>{c.when.charAt(0).toUpperCase() + c.when.slice(1)}</span> · {c.count} lift{c.count === 1 ? '' : 's'}: {c.names}</span>
              </span>
            </div>
            <div className="nv-ts-racts">
              {c.rescheduling ? (
                <>
                  {c.dayOptions.map((o) => <button key={o.value} type="button" className="nv-ts-pill" onClick={() => move(c, o)}>{o.label}</button>)}
                  <TextAction tone="quiet" onClick={c.cancelReschedule}>Cancel</TextAction>
                </>
              ) : (
                <>
                  <button type="button" className="nv-ts-tint" onClick={c.start}>Do it now</button>
                  <button type="button" className="nv-ts-pill" onClick={c.startReschedule}>Move</button>
                  <TextAction tone="quiet" onClick={c.remove}>Remove</TextAction>
                </>
              )}
            </div>
          </div>
        ))}
        {/* the next-days line is the list itself now (mockup 105) */}
        {w.notes.map((n) => <p key={n} className="nv-ts-wnote">{n}</p>)}
      </div>
    </section>
  );
}

// ------------------------------------------------------------- Coach row --
// The door. Its dot is the only gold on the page: changes waiting on him.
function CoachRow({ c }) {
  const n = c.count;
  return (
    <Interactive as="div" className="nv-sum-card nv-sum-rise nv-ts-crow" data-gr={n ? undefined : 'link'} style={{ '--i': 3, '--nv-sum-tint': 'var(--nv-gold)' }} onClick={c.open} haptic="tick"
      aria-label={n ? `Coach: ${n} change${n === 1 ? '' : 's'} waiting. Open` : 'Coach: nothing waiting. Goals and Ask Coach. Open'}
      base={{ cursor: 'pointer' }}>
      <ITile p={P.coach} a={n ? 'var(--nv-gold)' : 'var(--nv-ink60)'} />
      <span style={{ minWidth: 0 }}>
        <span className="nv-ts-nm">Coach · {n ? <em>{n} change{n === 1 ? '' : 's'} waiting</em> : 'nothing waiting'}</span>
        <span className="nv-ts-sv">{n && c.headline ? `${c.headline} · ` : ''}Goals · Ask Coach</span>
      </span>
      <Ico p={P.right} cls="cv" />
    </Interactive>
  );
}

// -------------------------------------------------------------- routines --
function Routines({ T }) {
  const cr = T.create;
  const rn = T.rename;
  const [shelfOpen, setShelfOpen] = useState(false);
  return (
    <>
      <div className="nv-sum-rise nv-ts-head" style={{ '--i': 4 }}>
        <h2>Routines</h2>
        <button type="button" className="nv-ts-lnk quiet" onClick={T.allSessions}>All sessions</button>
        {!cr.open && <button type="button" className="nv-ts-lnk" onClick={cr.start}><Ico p={P.plus} size={14} cls="thick" />New</button>}
      </div>
      {cr.open && (
        <div className="nv-sum-card nv-ts-create">
          <input className="nv-ts-field" autoFocus value={cr.name} onChange={cr.setName} placeholder="Name it, e.g. Push day" aria-label="New routine name"
            onKeyDown={(e) => { if (e.key === 'Enter') cr.submit(); if (e.key === 'Escape') cr.cancel(); }} />
          <div className="nv-ts-racts">
            <button type="button" className="nv-ts-tint" onClick={cr.submit} disabled={!cr.name.trim()}>Create</button>
            <TextAction tone="quiet" onClick={cr.cancel}>Cancel</TextAction>
          </div>
        </div>
      )}
      {rn.id && (
        <div className="nv-sum-card nv-ts-create">
          <input className="nv-ts-field" autoFocus value={rn.name} onChange={rn.set} placeholder="Routine name" aria-label="Rename routine"
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') rn.submit(); if (e.key === 'Escape') rn.cancel(); }} />
          <div className="nv-ts-racts">
            <button type="button" className="nv-ts-tint" onClick={rn.submit} disabled={!rn.name.trim()}>Rename</button>
            <TextAction tone="quiet" onClick={rn.cancel}>Cancel</TextAction>
          </div>
        </div>
      )}
      {T.routines.length ? (
        <div className="nv-ts-tiles">
          {T.routines.map((r, i) => (
            <Interactive key={r.id} as="div" data-grow={`routine:${r.id}`} className={`nv-sum-card nv-sum-rise nv-ts-tile${r.today ? ' today' : ''}`}
              style={{ '--i': 4 + Math.min(i, 4), '--nv-sum-tint': hueA(r.chips, 0, 'var(--nv-cy)'), '--nv-g2': hueA(r.chips, 1, hueA(r.chips, 0, 'var(--nv-cy)')) }}
              onClick={r.open} onLongPress={r.hold} haptic="tick" base={{ cursor: 'pointer' }}
              aria-label={`${r.name}: ${r.lifts} lifts${r.today ? ', today' : ''}. Open; hold for more`}>
              {/* mockup 101: his word, "I don't need the info ... for how many times
                  I've completed each workout session" — the count lives in History */}
              {r.today && <span className="nv-ts-tg">Today</span>}
              <GlyphTile g={r.glyph} a={hueA(r.chips, 0, 'var(--nv-cy)')} b={hueA(r.chips, 1, undefined)} size="lg" />
              <span className="nv-ts-nm">{r.name}</span>
              <span className="nv-ts-sv">{r.lifts} lift{r.lifts === 1 ? '' : 's'}</span>
              <span className="nv-ts-tilestrip"><MuscleStrip chips={r.chips} /></span>
            </Interactive>
          ))}
        </div>
      ) : !cr.open && (
        <p className="nv-ts-cap">No routines yet. New starts one, and the week above schedules it.</p>
      )}
      {T.routines.length > 0 && <p className="nv-sum-rise nv-ts-cap" style={{ '--i': 5 }}>Hold a routine to start it, rename it, move it, archive it, see its history or ask Coach about it.</p>}
      {T.shelf.length > 0 && (
        <div className="nv-ts-shelf nv-sum-rise" style={{ '--i': 6 }}>
          <button type="button" className="nv-ts-lnk quiet nv-ts-shelfhd" aria-expanded={shelfOpen} onClick={() => setShelfOpen((o) => !o)}>
            Archived · {T.shelf.length}<span className="nv-ts-shelfcv" aria-hidden="true">{shelfOpen ? '▴' : '▾'}</span>
          </button>
          {shelfOpen && (
            <div className="nv-ts-shelfrows">
              {T.shelf.map((a, i) => (
                <div key={a.id} className="nv-sum-card nv-ts-shelfrow" style={{ '--i': i }}>
                  <span className="nv-ts-shelfnm"><span className="nv-ts-nm">{a.name}</span><span className="nv-ts-sv">{a.lifts} lift{a.lifts === 1 ? '' : 's'}, kept</span></span>
                  <button type="button" className="nv-ts-tint" onClick={a.restore}>Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------ half cards --
function HalfCards({ q, hs }) {
  return (
    <div className="nv-ts-half nv-sum-rise" style={{ '--i': 6 }}>
      <QuickCard q={q} solo={!hs} />
      {hs && <HardSetsCard hs={hs} />}
    </div>
  );
}

// QUICK SESSION: minutes on a stepper, a note if there is one, Build it. The
// plan Coach builds arrives as its own card below, to read before starting.
function QuickCard({ q, solo }) {
  return (
    <div className={`nv-ts-halfwrap${solo ? ' nv-ts-solo' : ''}`}>
    <section className="nv-sum-card nv-sum-tile nv-ts-halfcard" aria-label="Quick session" style={{ '--nv-sum-tint': 'var(--nv-gold)' }}>
      <Head tile={<ITile p={P.bolt} a="var(--nv-gold)" />} label="Quick session" />
      <div className="nv-ts-step">
        <button type="button" className="nv-ts-round" onClick={q.less || undefined} disabled={!q.less} aria-label="Fewer minutes"><Ico p={P.minus} cls="thick" /></button>
        <span className="nv-ts-stepv" aria-live="polite"><b>{q.minutes}</b><small>minutes</small></span>
        <button type="button" className="nv-ts-round" onClick={q.more || undefined} disabled={!q.more} aria-label="More minutes"><Ico p={P.plus} cls="thick" /></button>
      </div>
      <input className="nv-ts-field" value={q.note} onChange={q.setNote} placeholder="A note, if any" aria-label="A note for Coach, e.g. dumbbells only" />
      <button type="button" className="nv-ts-quiet wide" onClick={q.busy ? undefined : q.build} disabled={q.busy} aria-busy={q.busy || undefined}>
        {q.busy ? 'Coach is planning…' : 'Build it'}
      </button>
    </section>
    </div>
  );
}

// the week's hard sets as one ring of muscle segments, each in its own hue
function SegRing({ ring, size = 72 }) {
  const sw = 8;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const gap = ring.segments.length > 1 ? 3 : 0;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {ring.segments.map((s) => {
        const len = Math.max(0.5, c * s.share - gap);
        const fill = len * s.fill;
        // solid: its own sets; the half-strength part after it: lifts that
        // also train it, each set at ½ (15 Oct)
        const own = len * (s.directFill ?? s.fill);
        const at = -off;
        off += len + gap;
        return (
          <g key={s.muscle}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.hue} strokeOpacity=".22" strokeWidth={sw}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={at} />
            {fill > own && (
              <circle className="nv-ts-seg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.hue} strokeOpacity=".5" strokeWidth={sw}
                strokeDasharray={`${fill} ${c - fill}`} strokeDashoffset={at} style={{ '--c': `${c}px` }} />
            )}
            {own > 0 && (
              <circle className="nv-ts-seg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.hue} strokeWidth={sw}
                strokeDasharray={`${own} ${c - own}`} strokeDashoffset={at} style={{ '--c': `${c}px` }} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function HardSetsCard({ hs }) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef(null);
  const go = hs.model ? () => setOpen(true) : hs.ask;
  const body = (
    <>
      <Head tile={<ITile p={P.bars} a="var(--nv-vi)" />} label="Hard sets" />
      <div className="nv-ts-hs">
        <span className="nv-ts-rg"><SegRing ring={hs.ring} /><b>{hs.ring.done}</b></span>
        <span className="nv-ts-sv wrap">{hs.line}</span>
      </div>
      <Uncounted u={hs.uncounted} compact />
      {hs.model && <span className="nv-ts-foot">The week<Ico p={P.right} size={15} cls="thick" /></span>}
      {!hs.model && hs.ask && <span className="nv-ts-foot">Ask Coach<Ico p={P.right} size={15} cls="thick" /></span>}
    </>
  );
  // the wrapper is the sheet's origin: the week grows out of the card tapped
  return (
    <div ref={cardRef} className="nv-ts-halfwrap">
      {go ? (
        <Interactive as="section" className="nv-sum-card nv-sum-tile nv-ts-halfcard" style={{ '--nv-sum-tint': 'var(--nv-vi)', '--nv-g2': hs.ring.segments[0]?.hue || 'var(--nv-vi)', '--nv-g3': hs.ring.segments[1]?.hue || 'var(--nv-vi)' }} onClick={go} haptic="tick" base={{ cursor: 'pointer' }}
          aria-label={`Hard sets: ${hs.ring.done} ${hs.line}. ${hs.model ? 'Open the week' : 'Ask Coach'}`}>
          {body}
        </Interactive>
      ) : (
        <section className="nv-sum-card nv-sum-tile nv-ts-halfcard" style={{ '--nv-sum-tint': 'var(--nv-vi)' }} aria-label="Hard sets">{body}</section>
      )}
      {open && hs.model && (
        <WeekSetsSheet model={hs.model} originEl={cardRef.current} onClose={() => setOpen(false)} onAskCoach={hs.askCoach} />
      )}
    </div>
  );
}

function QuickPlan({ p }) {
  return (
    <section className="nv-sum-card nv-sum-rise nv-ts-plan" style={{ '--i': 0 }} aria-label={`Quick session: ${p.name}`}>
      <CardHead paths={P.bolt} label="Coach's quick session" tint="var(--nv-cy)" />
      <div className="nv-ts-hname">{p.name}</div>
      {p.rationale && <p className="nv-ts-why">{p.rationale}</p>}
      <ul className="nv-ts-plist">
        {p.exercises.map((e) => <li key={e.key}>{e.label}</li>)}
      </ul>
      <div className="nv-ts-racts">
        <button type="button" className="nv-ts-tint" onClick={p.start}>Start this session</button>
        <TextAction tone="quiet" onClick={p.dismiss}>Discard</TextAction>
      </div>
    </section>
  );
}

// -------------------------------------------------------------- momentum --
function Momentum({ m }) {
  return (
    <>
      <div className="nv-sum-rise nv-ts-head" style={{ '--i': 7 }}><h2>Momentum</h2></div>
      <Rail gap="10px" ariaLabel="Recent momentum" style={{ padding: '2px 2px 8px', scrollSnapType: 'x mandatory', alignItems: 'stretch' }}>
        {m.prs.map((p) => (
          <div key={p.key} className="nv-sum-card nv-ts-mcard" style={{ '--h': p.hue, '--nv-sum-tint': p.hue }}>
            <ITile p={P.spark} a={p.hue} />
            <span className="nv-ts-mk">◆ Record{p.when ? ` · ${p.when}` : ''}</span>
            <span className="nv-ts-nm clamp2">{p.name}</span>
            <span className="nv-ts-mv">{p.value}</span>
            <span className="nv-ts-sv wrap">{p.basis} · {p.was}</span>
          </div>
        ))}
        {m.plateau && (
          <Interactive as="div" className="nv-sum-card nv-ts-mcard" style={{ '--h': m.plateau.hue, '--nv-sum-tint': m.plateau.hue }} onClick={m.plateau.open || undefined}
            base={{ cursor: m.plateau.open ? 'pointer' : 'default' }} aria-label={`${m.plateau.name} has stalled for ${m.plateau.days} days. Tap for Coach's read`}>
            <ITile p={P.spark} a={m.plateau.hue} />
            <span className="nv-ts-mk">Stalled · {m.plateau.days} days</span>
            <span className="nv-ts-nm clamp2">{m.plateau.name}</span>
            <span className="nv-ts-sv wrap" style={{ marginTop: 'auto' }}>No strength gain. Tap for Coach's read</span>
          </Interactive>
        )}
        {m.streak && (
          <div className="nv-sum-card nv-ts-mcard" style={{ '--h': 'var(--nv-good)', '--nv-sum-tint': 'var(--nv-good)' }}>
            <ITile p={P.spark} a="var(--nv-good)" />
            <span className="nv-ts-mk">Streak</span>
            <span className="nv-ts-mv" style={{ marginTop: 'auto' }}>{m.streak}</span>
            <span className="nv-ts-sv">sessions in a row</span>
          </div>
        )}
      </Rail>
    </>
  );
}

// =========================================================== routine page ==
function RoutinePage({ d, v, parts }) {
  const Picker = parts.ExercisePicker;
  return (
    <>
      <button type="button" className="nv-ts-back nv-sum-rise" style={{ '--i': 0 }} onClick={d.back}><Ico p={P.left} size={24} />Train</button>
      {d.edit?.on ? (
        // EDIT MODE (mockup 104): the title is the input; Done saves it
        <div className="nv-ts-titlerow nv-sum-rise" style={{ '--i': 0 }}>
          <RoutineTitleEdit m={d.edit} />
          <TextAction tone="accent" onClick={d.edit.done}>Done</TextAction>
        </div>
      ) : (
        <div className="nv-ts-titlerow nv-sum-rise" style={{ '--i': 0 }}>
          <h1 className="nv-ts-title" style={{ margin: 0 }}>{d.name}</h1>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 'none' }}>
            {d.edit && <TextAction tone="accent" onClick={d.edit.start}>Edit</TextAction>}
            <button type="button" className="nv-ts-dots bg" aria-label={`${d.name}: more`} onClick={(e) => d.menu({ x: e.clientX, y: e.clientY })}><Dots /></button>
          </span>
        </div>
      )}
      {d.edit?.on && (
        <>
          <div className="nv-ts-sub" style={{ marginLeft: '4px' }}>{d.edit.sub}</div>
          <RoutineEditor m={d.edit} picker={d.picker.open ? <Picker v={v} /> : null} />
        </>
      )}
      {!d.edit?.on && <>
      <div className="nv-ts-sub nv-sum-rise" style={{ '--i': 1, marginLeft: '4px' }}>{d.sub}</div>
      <div className="nv-ts-acts nv-sum-rise" style={{ '--i': 1 }}>
        <Interactive as="button" data-grow="begin" className="nv-ts-begin" onClick={d.startDisabled ? undefined : d.start} disabled={d.startDisabled} haptic={d.startDisabled ? undefined : 'commit'} activeStyle={{ transform: 'scale(.97)' }}>
          <Play />Start workout
        </Interactive>
        <button type="button" className="nv-ts-quiet" onClick={d.history}>History</button>
      </div>
      {d.deleting && (
        <div className="nv-sum-card nv-ts-confirm" role="alert">
          <p>{d.deleting.text}</p>
          <div className="nv-ts-racts">
            <button type="button" className="nv-ts-pass" onClick={d.deleting.confirm}>Delete routine</button>
            <button type="button" className="nv-ts-keep" onClick={d.deleting.cancel}>Keep it</button>
          </div>
        </div>
      )}
      {d.rows.length === 0 ? (
        <p className="nv-ts-cap">No lifts yet. Add the first one below.</p>
      ) : (
        <ul className="nv-sum-card nv-sum-rise nv-ts-xlist" style={{ '--i': 2 }} aria-label={`${d.name}: its lifts, in order. Swipe right to move a lift, left to remove it`}>
          {d.rows.map((r) => <LiftRow key={r.id} r={r} />)}
        </ul>
      )}
      {d.removed && (
        <div className="nv-ts-receipt" role="status">
          <span className="nv-ts-ok gone" aria-hidden="true"><Ico p={P.trash} size={15} /></span>
          <span className="nv-ts-rx"><b>Removed {d.removed.name}</b><span>Its sets and reps come back with Undo</span></span>
          <button type="button" className="nv-ts-undo" onClick={d.removed.undo}>Undo</button>
        </div>
      )}
      {d.picker.open ? <Picker v={v} /> : (
        <button type="button" className="nv-ts-more nv-sum-rise" style={{ '--i': 3 }} onClick={d.picker.show}><Ico p={P.plus} size={15} cls="thick" />Add exercise</button>
      )}
      {d.sheet && <LiftSheet s={d.sheet} />}
      </>}
    </>
  );
}

// A LIFT: one 52px row. The 3D chip in the muscle's hue and the name both
// open the lift (the figure, the muscles, cues, history); ⋯ opens the small
// sheet with the prescription, the numbers and Form check. Swipe right to
// move it, left to remove it — and the sheet has both as buttons too, so
// every capability has a pixel he can tap.
function LiftRow({ r }) {
  return (
    <li className="nv-ts-xitem">
      <SwipeRow radius={0}
        right={{ label: 'Move', icon: '↕', tone: 'var(--nv-cy)', run: r.move }}
        left={{ label: 'Remove', icon: '✕', tone: 'var(--nv-warn)', run: r.remove, collapse: true }}>
        <div className="nv-ts-xrow">
          <button type="button" className="nv-ts-f3d" style={{ '--h': r.hue }} onClick={r.open} aria-label={`${r.name} in 3D`}><Ico p={P.fig} /></button>
          <Interactive as="div" className="nv-ts-lx" onClick={r.open} base={{ cursor: 'pointer', minWidth: 0 }} activeStyle={{}}
            aria-label={`${r.name}: ${r.scheme}, ${r.last}${r.coach ? `, ${r.coach}` : ''}. Open the lift`}>
            <span className="nv-ts-nm one">{r.name}</span>
            <span className="nv-ts-sv">{r.scheme} · {r.last}{r.coach ? <> · <span className="nv-ts-cw">{r.coach}</span></> : null}{r.added ? <> · <span className="nv-ts-cw">Coach added</span></> : null}</span>
          </Interactive>
          <button type="button" className="nv-ts-dots" onClick={r.more} aria-label={`More for ${r.name}`}><Dots /></button>
        </div>
      </SwipeRow>
      {r.moving && (
        <div className="nv-ts-movebar" role="group" aria-label={`Move ${r.name}`}>
          <button type="button" className="nv-ts-round" onClick={r.up || undefined} disabled={!r.up} aria-label="Move it up"><Ico p={P.up} cls="thick" /></button>
          <button type="button" className="nv-ts-round" onClick={r.down || undefined} disabled={!r.down} aria-label="Move it down"><Ico p={P.down} cls="thick" /></button>
          <TextAction onClick={r.move}>Done</TextAction>
        </div>
      )}
      {r.formCheck && <div className="nv-ts-fc"><FormCheckPanel fc={r.formCheck} /></div>}
    </li>
  );
}

// THE ⋯ SHEET: what used to sit in every row at once. The three numbers are
// steppers holding a draft, saved once as the sheet closes (the view model
// says why); Coach's prescription is one line with its reason under it.
function LiftSheet({ s }) {
  const r = s.row;
  const [t, setT] = useState(() => ({ ...r.targets }));
  const draft = useRef(t);
  useLayoutEffect(() => { draft.current = t; });
  const finish = () => { s.save(draft.current); s.close(); };
  const exit = useExit(finish);
  const drag = useSheetDrag(finish, { threshold: 80 });
  const panelRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') exit.close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const step = (k, by) => setT((x) => {
    // drop sets run from none up to one less than the sets (a drop needs a top set above it)
    if (k === 'drops') return { ...x, drops: Math.max(0, Math.min((Number(x.sets) || 1) - 1, (Number(x.drops) || 0) + by)) };
    const next = { ...x, [k]: Math.max(1, (Number(x[k]) || 1) + by) };
    if (k === 'sets') next.drops = Math.min(Number(x.drops) || 0, next.sets - 1);
    // the range stays a range: the low end never passes the high one
    if (k === 'low' && next.low > next.high) next.high = next.low;
    if (k === 'high' && next.high < next.low) next.low = next.high;
    return next;
  });
  const unit = r.unit === 'sec' ? 'seconds' : 'reps';
  // a render function, not a component: a component defined in here would be
  // a new type every render and remount its buttons under his thumb
  const stepper = (k, label) => (
    <div key={k} className="nv-ts-srow">
      <span>{label}</span>
      <span className="nv-ts-mini">
        <button type="button" className="nv-ts-round" onClick={() => step(k, -1)} disabled={t[k] <= (k === 'drops' ? 0 : 1)} aria-label={`${label}: one fewer`}><Ico p={P.minus} cls="thick" /></button>
        <b aria-live="polite">{t[k]}</b>
        <button type="button" className="nv-ts-round" onClick={() => step(k, 1)} disabled={k === 'drops' && t.drops >= (Number(t.sets) || 1) - 1} aria-label={`${label}: one more`}><Ico p={P.plus} cls="thick" /></button>
      </span>
    </div>
  );
  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={`${r.name}: the prescription`} onClick={exit.close}
      style={{ position: 'fixed', inset: 0, zIndex: 112, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--nv-void) 62%, transparent)', animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)' }}>
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }}
        data-sheet="" className="nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-ts-sheet" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '86vh' }}>
        <div {...drag.handleProps} onPointerDown={(e) => { if (!onControl(e.target)) drag.handleProps.onPointerDown(e); }}
          className="nv-ts-grab" style={{ ...drag.handleProps.style, gridTemplateColumns: '44px minmax(0,1fr) auto' }}>
          <span className="nv-ts-handle" aria-hidden="true" />
          <button type="button" className="nv-ts-f3d" style={{ '--h': r.hue }} onClick={r.open} aria-label={`${r.name} in 3D`}><Ico p={P.fig} /></button>
          <span className="nv-ts-shead"><b>{r.name}</b><span>{r.muscle || 'Muscle not mapped'} · {r.lastFull === 'Not yet performed' ? 'not yet done' : `last ${r.lastFull}`}</span><AlsoWorks muscles={r.also} style={{ marginTop: '3px' }} /></span>
          <TextAction tone="accent" onClick={exit.close}>Done</TextAction>
        </div>
        <div className="nv-ts-sbody">
          {(r.coach || r.added) && (
            <div className="nv-ts-xk">
              {r.coach && <p><b>{r.coach}</b>{r.coachLines.length ? ` · ${r.coachLines.join(' ')}` : ''}</p>}
              {r.added && <p><b>Coach added this lift</b>{r.added.start ? ` · start around ${r.added.start} kg` : ''}{r.added.why ? `. ${r.added.why}` : ''}</p>}
              {r.coachWhy && (
                <div style={{ marginLeft: '-8px' }}>
                  <TextAction onClick={(e) => r.coachWhy({ x: e?.clientX ?? 200, y: e?.clientY ?? 400 })}>Why Coach set it</TextAction>
                </div>
              )}
            </div>
          )}
          <div className="nv-ts-steps">
            {stepper('sets', 'Sets')}
            {stepper('low', `${unit === 'seconds' ? 'Seconds' : 'Reps'}, from`)}
            {stepper('high', 'To')}
            {stepper('drops', 'Drop sets')}
          </div>
          <p className="nv-ts-dropnote">{(Number(t.drops) || 0) > 0
            ? `${(Number(t.sets) || 1) - t.drops} top set${(Number(t.sets) || 1) - t.drops === 1 ? '' : 's'} at the weight you are building, then ${t.drops} drop${t.drops === 1 ? '' : 's'}, each lighter, straight after. Only the top sets move the weight up.`
            : 'Drop sets: the last sets get lighter and follow straight on, no rest. Suits cable and machine isolation work.'}</p>
          <div className="nv-ts-sheetacts">
            <button type="button" className="nv-ts-quiet" onClick={() => { s.save(draft.current); r.formCheckOpen(); }}><Ico p={P.cam} />Form check</button>
            <button type="button" className="nv-ts-round" onClick={r.up || undefined} disabled={!r.up} aria-label="Move it up"><Ico p={P.up} cls="thick" /></button>
            <button type="button" className="nv-ts-round" onClick={r.down || undefined} disabled={!r.down} aria-label="Move it down"><Ico p={P.down} cls="thick" /></button>
            <button type="button" className="nv-ts-pass" onClick={r.remove}>Remove</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================ history ==
function HistoryPage({ v, parts }) {
  const History = parts.HistoryView;
  return <div className="nv-ts-history"><History v={v} /></div>;
}

// ============================================================ Coach sheet ==
// THE COACH DOOR. A sheet over the page, its own history entry (the back
// swipe closes it), with the deck cards in their exact shape — Yes, Discuss,
// ✕ — then Goals and the conversation as the Coach tab had them. The ✕ now
// asks why: two taps and a line of his own, confirmed, then a receipt with
// Undo. The reason rides the record, and Coach reads it before asking again.
function CoachSheet({ s, v, parts }) {
  const exit = useExit(s.close);
  const drag = useSheetDrag(s.close, { threshold: 80 });
  const panelRef = useRef(null);
  const closeRef = useRef(exit.close);
  useLayoutEffect(() => { closeRef.current = exit.close; });
  useEffect(() => {
    s.entry();
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Pane = parts.GoalsCoachPane;
  // the deck is drawn above, in the sheet's own header, so the pane below
  // is Goals and the conversation alone; and the empty log's "more on
  // Today" pointed at a tab this page does not have
  const paneV = { ...v, coachDeck: null, coachWeek: v.coachWeek ? { ...v.coachWeek, more: 0 } : null };
  const a = s.declineAsking;
  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label="Coach" onClick={exit.close}
      style={{ position: 'fixed', inset: 0, zIndex: 112, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--nv-void) 62%, transparent)', animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)' }}>
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }}
        data-sheet="" className="nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-ts-sheet" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ height: 'calc(100dvh - 56px - env(safe-area-inset-top))', maxHeight: '100dvh' }}>
        <div {...drag.handleProps} onPointerDown={(e) => { if (!onControl(e.target)) drag.handleProps.onPointerDown(e); }}
          className="nv-ts-grab" style={drag.handleProps.style}>
          <span className="nv-ts-handle" aria-hidden="true" />
          <span className="nv-ts-ctile" aria-hidden="true"><Ico p={P.coach} size={17} /></span>
          <span className="nv-ts-shead">
            <b>Coach</b>
            {/* the deck below says what waits and where; the head says what the door holds */}
            <span>Changes, goals and the conversation</span>
          </span>
          <TextAction tone="accent" onClick={exit.close}>Done</TextAction>
        </div>
        <div className="nv-ts-sbody">
          {s.deck ? (
            <CoachSuggestionDeck d={s.deck} roomy after={(c) => (c.asking && a && a.id === c.id ? <AskWhy a={a} /> : null)} />
          ) : (
            <p className="nv-ts-why" style={{ margin: '10px 4px 0' }}>No changes from Coach right now. When Coach proposes one, it waits here for your yes or no.</p>
          )}
          {s.receipt && (
            <div className="nv-ts-receipt" role="status">
              <span className="nv-ts-ok" aria-hidden="true"><Ico p={P.x} size={15} cls="thick" /></span>
              <span className="nv-ts-rx"><b>Passed on it</b><span>{s.receipt.reason ? `${s.receipt.reason} · Coach has your reason` : 'No reason given'}</span></span>
              <button type="button" className="nv-ts-undo" onClick={s.receipt.undo}>Undo</button>
            </div>
          )}
          <span className="nv-ts-hk">Goals and the conversation</span>
          <Pane v={paneV} />
        </div>
      </div>
    </div>
  );
}

// ✕ ASKS WHY: the reasons the Inbox offers for Coach advice (one list, so a
// no here and a no there read the same), a line of his own, then Pass on it
// — or Keep it, and nothing happened.
function AskWhy({ a }) {
  return (
    <div className="nv-ts-askwhy" role="group" aria-label="Why not?">
      <span className="nv-ts-dk">Why not? Coach reads this before it asks again</span>
      <div className="nv-ts-reasons">
        {a.reasons.map((r) => (
          <button key={r} type="button" aria-pressed={a.picked === r} onClick={() => a.pick(r)}>{r}</button>
        ))}
      </div>
      <input className="nv-ts-field" value={a.text} onChange={a.setText} placeholder="Or say why in a line…" aria-label="Why, in your own words"
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent?.isComposing) a.confirm(); }} />
      <div className="nv-ts-askrow">
        <button type="button" className="nv-ts-pass" onClick={() => a.confirm()}>Pass on it</button>
        <button type="button" className="nv-ts-keep" onClick={a.keep}>Keep it</button>
      </div>
    </div>
  );
}

