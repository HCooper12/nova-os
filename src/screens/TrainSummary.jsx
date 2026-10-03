import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Interactive } from '../Interactive.jsx';
import { TextAction, Rail } from '../Controls.jsx';
import { CardHead } from './MissionSummary.jsx';
import { CoachSuggestionDeck } from '../CoachSuggestions.jsx';
import { WeekSetsSheet } from '../WeekSets.jsx';
import { FormCheckPanel } from '../FormCheckPanel.jsx';
import { SwipeRow } from '../SwipeRow.jsx';
import { useExit } from '../useExit.js';
import { useSheetDrag } from '../useSheetDrag.js';

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
        <WeekCard w={T.week} />
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
    <section className="nv-sum-card nv-sum-rise nv-ts-hero" style={{ '--i': 1 }} aria-label={h.eyebrow}>
      <CardHead icon="training" label={h.eyebrow} tint={tint} meta={h.when} />
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
      {h.chips?.length > 0 && (
        <div className="nv-ts-chips" aria-label="What it trains">
          {h.chips.map((c) => (
            <span key={c.muscle} className="nv-ts-mchip" style={{ '--h': c.hue }}><i aria-hidden="true" />{c.muscle}{c.count > 1 ? <b>×{c.count}</b> : null}</span>
          ))}
        </div>
      )}
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
function FocusLine({ f }) {
  return (
    <div className="nv-ts-focusbox">
      <p className="nv-ts-focus">{f.lift ? <><em style={{ color: f.hue }}>{f.lift}</em>{f.rest}</> : f.text}</p>
      {f.why && <p className="nv-ts-why">{f.why}</p>}
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
        <span>Readiness <b>{r.value ?? '—'}</b></span>
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
          {r.tired && <TextAction tone="quiet" onClick={r.tired}>Why am I tired?</TextAction>}
          {r.peak && <TextAction tone="quiet" onClick={r.peak}>When am I at my best?</TextAction>}
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
  for (const c of r.carryovers) {
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
// Seven dots. Each is the day's own select laid invisibly over it, so a tap
// opens the platform's picker — a routine, rest, or a make-up for that date.
function WeekCard({ w }) {
  return (
    <section className="nv-sum-card nv-sum-rise nv-ts-week" style={{ '--i': 2 }} aria-label="This week">
      <div className="nv-ts-wk">
        {w.dots.map((d) => (
          <label key={d.day} className="nv-ts-wd" data-state={d.state} data-today={d.isToday ? 'true' : undefined}>
            <span aria-hidden="true">{d.letter}</span>
            <i aria-hidden="true">{d.state === 'done' ? <Ico p={P.check} size={11} cls="thick" /> : null}</i>
            {d.select && (
              <select className="nv-ts-wsel" value={d.select.value} onChange={d.select.onChange} aria-label={d.aria}>
                {d.select.options.map((o) => <option key={o.value || 'rest'} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </label>
        ))}
      </div>
      {w.line && <p className="nv-ts-wline">{w.line}</p>}
      {w.notes.map((n) => <p key={n} className="nv-ts-wnote">{n}</p>)}
    </section>
  );
}

// ------------------------------------------------------------- Coach row --
// The door. Its dot is the only gold on the page: changes waiting on him.
function CoachRow({ c }) {
  const n = c.count;
  return (
    <Interactive as="div" className="nv-sum-card nv-sum-rise nv-ts-crow" style={{ '--i': 3 }} onClick={c.open} haptic="tick"
      aria-label={n ? `Coach: ${n} change${n === 1 ? '' : 's'} waiting. Open` : 'Coach: nothing waiting. Goals and Ask Coach. Open'}
      base={{ cursor: 'pointer' }}>
      {n ? <span className="nv-ts-gdot" aria-hidden="true" /> : <span className="nv-ts-cquiet" aria-hidden="true"><Ico p={P.coach} /></span>}
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
      {T.routines.length ? (
        <div className="nv-ts-tiles">
          {T.routines.map((r, i) => (
            <Interactive key={r.id} as="div" className="nv-sum-card nv-sum-rise nv-ts-tile" style={{ '--i': 4 + Math.min(i, 4) }}
              onClick={r.open} onLongPress={r.hold} haptic="tick" base={{ cursor: 'pointer' }}
              aria-label={`${r.name}: ${r.lifts} lifts${r.today ? ', today' : ''}, done ${r.count} times. Open; hold for more`}>
              <span className="nv-ts-nm">{r.name}</span>
              <span className="nv-ts-sv">{r.lifts} lift{r.lifts === 1 ? '' : 's'}{r.count ? ` · ◆ ${r.count}` : ''}{r.today ? ' · today' : ''}</span>
              {r.chips.length > 0 && (
                <span className="nv-ts-chips tail">
                  {r.chips.map((c) => <span key={c.muscle} className="nv-ts-mchip" style={{ '--h': c.hue }}><i aria-hidden="true" />{c.muscle}</span>)}
                </span>
              )}
            </Interactive>
          ))}
        </div>
      ) : !cr.open && (
        <p className="nv-ts-cap">No routines yet. New starts one, and the week above schedules it.</p>
      )}
      {T.routines.length > 0 && <p className="nv-sum-rise nv-ts-cap" style={{ '--i': 5 }}>Hold a routine to start it, see its history or ask Coach about it.</p>}
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
    <section className="nv-sum-card nv-sum-tile nv-ts-halfcard" aria-label="Quick session">
      <CardHead paths={P.bolt} label="Quick session" />
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
        const at = -off;
        off += len + gap;
        return (
          <g key={s.muscle}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.hue} strokeOpacity=".22" strokeWidth={sw}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={at} />
            {fill > 0 && (
              <circle className="nv-ts-seg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.hue} strokeWidth={sw}
                strokeDasharray={`${fill} ${c - fill}`} strokeDashoffset={at} style={{ '--c': `${c}px` }} />
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
  const go = hs.view ? () => setOpen(true) : hs.ask;
  const body = (
    <>
      <CardHead paths={P.bars} label="Hard sets" />
      <div className="nv-ts-hs">
        <span className="nv-ts-rg"><SegRing ring={hs.ring} /><b>{hs.ring.done}</b></span>
        <span className="nv-ts-sv wrap">{hs.line}</span>
      </div>
      {hs.view && <span className="nv-ts-foot">The week<Ico p={P.right} size={15} cls="thick" /></span>}
      {!hs.view && hs.ask && <span className="nv-ts-foot">Ask Coach<Ico p={P.right} size={15} cls="thick" /></span>}
    </>
  );
  // the wrapper is the sheet's origin: the week grows out of the card tapped
  return (
    <div ref={cardRef} className="nv-ts-halfwrap">
      {go ? (
        <Interactive as="section" className="nv-sum-card nv-sum-tile nv-ts-halfcard" onClick={go} haptic="tick" base={{ cursor: 'pointer' }}
          aria-label={`Hard sets: ${hs.ring.done} ${hs.line}. ${hs.view ? 'Open the week' : 'Ask Coach'}`}>
          {body}
        </Interactive>
      ) : (
        <section className="nv-sum-card nv-sum-tile nv-ts-halfcard" aria-label="Hard sets">{body}</section>
      )}
      {open && hs.view && (
        <WeekSetsSheet view={hs.view} originEl={cardRef.current} onClose={() => setOpen(false)} onAskCoach={hs.askCoach} />
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
          <div key={p.key} className="nv-sum-card nv-ts-mcard" style={{ '--h': p.hue }}>
            <span className="nv-ts-mk">◆ Record{p.when ? ` · ${p.when}` : ''}</span>
            <span className="nv-ts-nm clamp2">{p.name}</span>
            <span className="nv-ts-mv">{p.value}</span>
            <span className="nv-ts-sv wrap">{p.basis} · {p.was}</span>
          </div>
        ))}
        {m.plateau && (
          <Interactive as="div" className="nv-sum-card nv-ts-mcard" style={{ '--h': m.plateau.hue }} onClick={m.plateau.open || undefined}
            base={{ cursor: m.plateau.open ? 'pointer' : 'default' }} aria-label={`${m.plateau.name} has stalled for ${m.plateau.days} days. Tap for Coach's read`}>
            <span className="nv-ts-mk">Stalled · {m.plateau.days} days</span>
            <span className="nv-ts-nm clamp2">{m.plateau.name}</span>
            <span className="nv-ts-sv wrap" style={{ marginTop: 'auto' }}>No strength gain. Tap for Coach's read</span>
          </Interactive>
        )}
        {m.streak && (
          <div className="nv-sum-card nv-ts-mcard" style={{ '--h': 'var(--nv-good)' }}>
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
      <div className="nv-ts-titlerow nv-sum-rise" style={{ '--i': 0 }}>
        <h1 className="nv-ts-title" style={{ margin: 0 }}>{d.name}</h1>
        <button type="button" className="nv-ts-dots bg" aria-label={`${d.name}: more`} onClick={(e) => d.menu({ x: e.clientX, y: e.clientY })}><Dots /></button>
      </div>
      <div className="nv-ts-sub nv-sum-rise" style={{ '--i': 1, marginLeft: '4px' }}>{d.sub}</div>
      <div className="nv-ts-acts nv-sum-rise" style={{ '--i': 1 }}>
        <Interactive as="button" className="nv-ts-begin" onClick={d.startDisabled ? undefined : d.start} disabled={d.startDisabled} haptic={d.startDisabled ? undefined : 'commit'} activeStyle={{ transform: 'scale(.97)' }}>
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
    const next = { ...x, [k]: Math.max(1, (Number(x[k]) || 1) + by) };
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
        <button type="button" className="nv-ts-round" onClick={() => step(k, -1)} disabled={t[k] <= 1} aria-label={`${label}: one fewer`}><Ico p={P.minus} cls="thick" /></button>
        <b aria-live="polite">{t[k]}</b>
        <button type="button" className="nv-ts-round" onClick={() => step(k, 1)} aria-label={`${label}: one more`}><Ico p={P.plus} cls="thick" /></button>
      </span>
    </div>
  );
  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={`${r.name}: the prescription`} onClick={exit.close}
      style={{ position: 'fixed', inset: 0, zIndex: 112, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--nv-void) 62%, transparent)', animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)' }}>
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }}
        className="nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-ts-sheet" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '86vh' }}>
        <div {...drag.handleProps} onPointerDown={(e) => { if (!onControl(e.target)) drag.handleProps.onPointerDown(e); }}
          className="nv-ts-grab" style={{ ...drag.handleProps.style, gridTemplateColumns: '44px minmax(0,1fr) auto' }}>
          <span className="nv-ts-handle" aria-hidden="true" />
          <button type="button" className="nv-ts-f3d" style={{ '--h': r.hue }} onClick={r.open} aria-label={`${r.name} in 3D`}><Ico p={P.fig} /></button>
          <span className="nv-ts-shead"><b>{r.name}</b><span>{r.muscle || 'Muscle not mapped'} · {r.lastFull === 'Not yet performed' ? 'not yet done' : `last ${r.lastFull}`}</span></span>
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
          </div>
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
        className="nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-ts-sheet" tabIndex={-1} onClick={(e) => e.stopPropagation()}
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

