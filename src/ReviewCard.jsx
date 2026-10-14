import { useEffect, useRef, useState } from 'react';
import './review.css';
import { Interactive } from './Interactive.jsx';
import { TextAction, Button } from './Controls.jsx';
import { CountUp } from './CountUp.jsx';
import { SkeletonBar } from './Skeleton.jsx';
import { ReviewCurve } from './ReviewCurve.jsx';


// THE DAILY REVIEW CARD (mockup 96, shortened by mockup 98), both Home idioms from
// the one view model (src/vals/valsReview.js):
//   - <ReviewMoment>  the summary Home (his phone): a glass card washed in
//                     the review's violet, the head with pips and the count
//   - <ReviewGroup>   the grouped (cupertino) Home: the same fields as rows
// The concept in the serif, the gist, the source only where the page records
// it, 2 to 4 connected notes in the Galaxy's colours, the curve with his real
// answers as dots, and three answers that each say where they send the page.
// An answer is acted out where it lands: the button, the new dot and stretch
// on the curve, the next date, the count, then the tick pill with Undo
// (src/receipt.js, raised by App.answerReview).

// the answer buttons press through their own CSS (:active), so their
// background and opacity transitions are not overwritten inline
const CSS_PRESS = {};

const PATHS = {
  review: <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />,
  got: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  fuzzy: <path d="M4 13c2.2-3 4.2-3 6 0s3.8 3 6 0 3.2-2 4-1" />,
  forgot: <><path d="M9 8 5 12l4 4" /><path d="M5 12h9a5 5 0 0 1 0 10h-2" /></>,
  read: <><path d="M4 6.5c3-1.5 5.5-1.5 8 0v13c-2.5-1.5-5-1.5-8 0Z" /><path d="M12 6.5c2.5-1.5 5-1.5 8 0v13c-3-1.5-5.5-1.5-8 0" /></>,
  play: <path d="M8 5.5v13l11-6.5Z" fill="currentColor" stroke="none" />,
  doc: <><path d="M7 3.5h7l4 4v13H7Z" /><path d="M14 3.5v4h4" /></>,
  chev: <path d="m9.5 6 6 6-6 6" />,
  close: <path d="M7 7l10 10M17 7 7 17" />,
  pen: <><path d="M5 19l1-4L16 5l3 3L9 18Z" /><path d="m14 7 3 3" /></>,
  shuffle: <><path d="M4 7h3.5c2 0 3 1 4.2 3l1.6 4c1.2 2 2.2 3 4.2 3H20" /><path d="M4 17h3.5c1.4 0 2.3-.5 3.1-1.5M13.4 8.5C14.2 7.5 15.1 7 16.5 7H20" /><path d="m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5l2.5 2.5-2.5 2.5" /></>,
  offline: <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a9.5 9.5 0 0 1 4-2.3M19 13a9.5 9.5 0 0 0-2.6-1.8M12 20h.01" />,
};
export function RvIcon({ name, className = 'nv-rv-ic' }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{PATHS[name]}</svg>;
}

// a pip per page while a day is short enough to count at a glance (the
// server's day holds five at most); past seven the count says it alone
export function RvPips({ pips }) {
  if (!pips || pips.total > 7) return null;
  return (
    <span className="nv-rv-pips" aria-hidden="true">
      {Array.from({ length: pips.total }, (_, i) => (
        <i key={i} style={{ '--i': i }} className={i < pips.done ? 'on' : i === pips.cur ? 'cur' : ''} />
      ))}
    </span>
  );
}
export function RvCount({ pips }) {
  if (!pips) return null;
  return <span className="nv-rv-cnt"><CountUp className="nv-rv-num" value={pips.done} fromZero /> of {pips.total} done</span>;
}

function Kicker({ r }) {
  if (!r.kicker) return null;
  return (
    <p className="nv-rv-kick">
      {r.kicker.isNew ? <><span className="new">New</span> · {r.kicker.text}</> : r.kicker.text}
      {r.demo ? ' · demo' : ''}
    </p>
  );
}

export function CurveBlock({ r, big = false }) {
  if (!r.curve) return null;
  return (
    <div className="nv-rv-curve">
      <ReviewCurve curve={r.curve} big={big} idKey={r.id || ''} />
      <div className="nv-rv-clab">
        <span>{r.curveLeft}</span>
        {r.curveRight.lead
          ? <span className="dl" key="next">{r.curveRight.lead} <b>{r.curveRight.date}</b></span>
          : <span><b>{r.curveRight.date}</b></span>}
      </div>
    </div>
  );
}

// the answer slot: the question and three buttons, or, once answered, where
// the page went. Both sit in one grid cell and cross-fade.
export function AnswerSlot({ r, afterLabel, onAfter }) {
  const res = r.result;
  return (
    <div className={`nv-rv-slot${res ? ' answered' : ''}`}>
      <div className="nv-rv-ask">
        {r.offline ? (
          <p className="nv-rv-offl"><RvIcon name="offline" /><span>{r.offline.line}</span></p>
        ) : (
          <div className="nv-rv-qrow">
            <p className="nv-rv-q">How well did it come back?</p>
            {r.readNext ? <TextAction compact tone="quiet" onClick={r.readNext} ariaLabel={r.readNextAria} style={{ margin: '-12px -8px -12px 0', minHeight: '44px' }}>Next</TextAction> : null}
          </div>
        )}
        <div className="nv-rv-rec">
          {r.grades.map((g) => (
            <Interactive key={g.key} as="button" type="button" disabled={g.disabled || !!res}
              className={`nv-rv-rb${g.selected ? ' sel' : ''}${g.dimmed ? ' dim' : ''}`}
              style={{ '--g': g.hue }} aria-label={g.aria} onClick={g.go} haptic={g.disabled ? undefined : 'tick'} activeStyle={CSS_PRESS}>
              <b><RvIcon name={g.key} />{g.label}</b>
              <small>{g.gapWord}</small>
            </Interactive>
          ))}
        </div>
      </div>
      <div className="nv-rv-res" aria-live="polite" style={res ? { '--g': res.hue } : undefined}>
        {res && (
          <>
            <span className="nv-rv-mark"><RvIcon name={res.grade} /></span>
            <p>Back {res.dueLabel}<small>{res.label} · in <CountUp className="nv-rv-num" value={res.gap} fromZero duration={520} /> {res.gap === 1 ? 'day' : 'days'}</small></p>
            <Button tone="violet" onClick={onAfter || r.next} style={{ flex: 'none', minHeight: '44px', padding: '0 16px' }}>{afterLabel || (r.isLast ? 'Done' : 'Next')}</Button>
          </>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="nv-rv-sk" aria-label="Daily review, arriving">
      <SkeletonBar w="46%" h="12px" style={{ marginTop: '12px' }} />
      <SkeletonBar w="62%" h="24px" style={{ marginTop: '8px' }} />
      <SkeletonBar w="100%" h="13px" style={{ marginTop: '12px' }} />
      <SkeletonBar w="92%" h="13px" style={{ marginTop: '7px' }} />
      <SkeletonBar w="70%" h="13px" style={{ marginTop: '7px' }} />
      <SkeletonBar w="100%" h="56px" radius="12px" style={{ marginTop: '16px' }} />
      <SkeletonBar w="100%" h="54px" radius="16px" style={{ marginTop: '16px' }} />
    </div>
  );
}

function Gist({ r }) {
  if (r.gist) return <p className="nv-rv-gist">{r.gist}</p>;
  if (r.gistLoading) return <div style={{ marginTop: '8px', display: 'grid', gap: '7px' }}><SkeletonBar w="100%" h="13px" /><SkeletonBar w="80%" h="13px" /></div>;
  return null;
}

// Draw one early: the reel spins through never-reviewed pages and lands on
// the one the draw chose. Transform only; reduced motion lands at once.
function DrawReel({ spin }) {
  const olRef = useRef(null);
  const landedRef = useRef(spin.landed);
  landedRef.current = spin.landed;
  useEffect(() => {
    const ol = olRef.current;
    if (!ol) return undefined;
    const rows = spin.rows.length;
    const land = -(rows - 1) * 40;
    const rm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (rm || !ol.animate) { ol.style.transform = `translateY(${land}px)`; const t = setTimeout(() => landedRef.current(), 400); return () => clearTimeout(t); }
    const a = ol.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${land}px)` }], { duration: 1500, easing: 'cubic-bezier(.12,.8,.18,1)', fill: 'forwards' });
    let t = 0;
    a.finished.then(() => { t = setTimeout(() => landedRef.current(), 450); }).catch(() => {});
    return () => { clearTimeout(t); a.cancel(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="nv-rv-reel" aria-live="polite" aria-label={`Drawing a page: ${spin.rows[spin.rows.length - 1]}`}>
      <ol ref={olRef}>{spin.rows.map((t, i) => <li key={`${t}-${i}`}>{t}</li>)}</ol>
    </div>
  );
}

function Done({ r }) {
  const d = r.done;
  return (
    <div className="nv-rv-body arrive">
      <p className="nv-rv-big2">{d.line}</p>
      {d.week.length > 0 && <>
        <p className="nv-rv-m">The week ahead, by pages due{r.demo ? ' (demo)' : ''}.</p>
        <div className="nv-rv-week" role="img" aria-label={`The week ahead: ${d.week.map((w) => `${w.label} ${w.count}`).join(', ')}`}>
          {d.week.map((w, i) => (
            <div key={w.key}><b>{w.count || ''}</b><i className={w.count ? '' : 'z'} style={{ '--i': i, height: w.count ? `${Math.round((w.count / d.weekMax) * 44)}px` : '2px' }} />{w.label}</div>
          ))}
        </div>
      </>}
      {d.spin && <DrawReel spin={d.spin} />}
      <div className="nv-rv-foot">
        {d.drawEarly && !d.spin
          ? <TextAction tone="violet" onClick={d.drawBusy ? undefined : d.drawEarly} disabled={d.drawBusy}>{d.drawBusy ? 'Drawing…' : 'Draw one early'}</TextAction>
          : <span />}
      </div>
    </div>
  );
}

// remember which page the body last showed, so the first arrival fades in
// over the skeleton and every page after it slides in from the right
function useEntrance(id) {
  const prev = useRef(null);
  const cls = prev.current == null ? 'arrive' : prev.current === id ? '' : 'swap';
  useEffect(() => { prev.current = id; }, [id]);
  return cls;
}

// demo mode has no network, so the arrival over the skeleton is staged once
// (650 ms, the mockup's) for the demo to show what a real load looks like
function useDemoArrival(demo) {
  const [ready, setReady] = useState(!demo);
  useEffect(() => {
    if (!demo) return undefined;
    const t = setTimeout(() => setReady(true), 650);
    return () => clearTimeout(t);
  }, [demo]);
  return ready;
}

// WRITE ON IT (mockup 95, Home): opens the Journal with today's Daily review
// prompt chosen. After he has written on it the row keeps its place and says
// so, with a check (his call): the review reads as done without hiding.
export function WriteOnIt({ r }) {
  return (
    <Interactive as="button" type="button" className={`nv-rv-go${r.writtenToday ? ' done' : ''}`} onClick={r.writeAboutIt} haptic="tick"
      aria-label={r.writtenToday ? 'You wrote on it today. Write again' : 'Write on it in your Journal'}>
      <RvIcon name={r.writtenToday ? 'got' : 'pen'} className="nv-rv-ic" />{r.writtenToday ? 'Written' : 'Write on it'}
    </Interactive>
  );
}

// THE SHORT CARD (mockup 98, his calls 11 Oct): the concept, Nova's 2 to 3
// sentence synthesis, the provenance set apart on its own quiet line (rule
// A), at most one connection line, and two actions plus "···" (rule E).
// The grades sit behind the "···"; Got it counts as read and keeps the
// schedule. Everything else (the episode, the curve, the key points, the
// reflection, Shuffle) lives behind Open.
export function Provenance({ p, className = '' }) {
  if (!p) return null;
  return (
    <p className={`nv-rv-prov ${className}`}>
      <span className="tx">{p.text}</span>
      {p.at ? <span className="at">{p.at}</span> : null}
    </p>
  );
}

function Thread({ r }) {
  const t = r.thread;
  if (!t) return null;
  return (
    <Interactive as="button" type="button" className="nv-rv-thread" style={{ '--rv-k': t.color }} onClick={t.go} haptic="tick" aria-label={`${t.lead} ${t.title}. Open it`}>
      <i aria-hidden="true" /><span>{t.lead} <b>{t.line}</b></span>
    </Interactive>
  );
}

function GradeRow({ r }) {
  return (
    <div className={`nv-rv-gx${r.gradesOpen ? ' on' : ''}`} aria-hidden={!r.gradesOpen}>
      <div className="nv-rv-gxin">
        {r.grades.map((g) => (
          <Interactive key={g.key} as="button" type="button" disabled={g.disabled || !r.gradesOpen} tabIndex={r.gradesOpen ? 0 : -1}
            className="nv-rv-g" style={{ '--g': g.hue }} aria-label={g.aria} onClick={g.go} haptic="tick" activeStyle={CSS_PRESS}>
            <b><RvIcon name={g.key} />{g.label}</b><small>{g.gapWord}</small>
          </Interactive>
        ))}
      </div>
    </div>
  );
}

function QuickActions({ r, quiet = false }) {
  const res = r.result;
  if (res) {
    return (
      <div className="nv-rv-acts done" aria-live="polite" style={{ '--g': res.hue }}>
        <span className="nv-rv-mark"><RvIcon name={res.grade} /></span>
        <p className="nv-rv-back">Back {res.dueLabel}<small>{res.label}</small></p>
        <Button tone="violet" onClick={r.next} style={{ flex: 'none', minHeight: '44px', padding: '0 18px' }}>{r.isLast ? 'Done' : 'Next'}</Button>
      </div>
    );
  }
  return (
    <>
      <div className="nv-rv-acts">
        <Interactive as="button" type="button" className="nv-rv-pill pri" onClick={r.open} haptic="tick" aria-label={`Open ${r.title}`}>Open</Interactive>
        {r.offline
          ? <span className="nv-rv-offl2"><RvIcon name="offline" />Answers wait for the Mac</span>
          : <Interactive as="button" type="button" className={`nv-rv-pill${quiet ? ' q' : ''}`} onClick={r.readNext || undefined} disabled={!r.readNext} haptic="tick" aria-label={r.readNextAria}>Got it</Interactive>}
        {!r.offline && (
          <Interactive as="button" type="button" className={`nv-rv-dots${r.gradesOpen ? ' on' : ''}`} onClick={r.toggleGrades} haptic="tick"
            aria-expanded={r.gradesOpen} aria-label={r.gradesOpen ? 'Hide recall grades' : 'Grade how well it came back'}>
            <i /><i /><i />
          </Interactive>
        )}
      </div>
      {!r.offline && <GradeRow r={r} />}
    </>
  );
}

function CardBody({ r }) {
  const entrance = useEntrance(r.id);
  return (
    <div className={`nv-rv-body ${entrance}`} key={r.id}>
      <Kicker r={r} />
      <h3 className="nv-rv-ct" title={r.title}>{r.title}</h3>
      <Gist r={r} />
      <Provenance p={r.provenance} />
      <Thread r={r} />
      <QuickActions r={r} />
    </div>
  );
}

// the summary Home's card body: a ring for how far up the schedule the page
// has climbed, the concept, one line of the idea, two quiet actions
function RingBody({ r }) {
  const entrance = useEntrance(r.id);
  const step = r.curve?.step || 0;
  const frac = (step + 1) / 7;
  const C = 2 * Math.PI * 18;
  return (
    <div className={`nv-rv-body nv-rv-ringb ${entrance}`} key={r.id}>
      <svg className="nv-rv-ring" viewBox="0 0 44 44" role="img" aria-label={`Step ${step + 1} of 7 on its schedule`}>
        <circle cx="22" cy="22" r="18" className="tr" />
        <circle cx="22" cy="22" r="18" className="fg" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - frac) }} transform="rotate(-90 22 22)" />
      </svg>
      <div className="nv-rv-ringt">
        <Kicker r={r} />
        <h3 className="nv-rv-ct" title={r.title}>{r.title}</h3>
        <Gist r={r} />
        <Provenance p={r.provenance} />
      </div>
      <div className="nv-rv-ringa"><QuickActions r={r} quiet /></div>
    </div>
  );
}

/* ------------------------------- summary Home ------------------------------- */

export function ReviewMoment({ r, style }) {
  const ready = useDemoArrival(r.demo);
  const loading = r.state === 'loading' || !ready;
  const head = (
    <div className="nv-rv-dh nv-sum-cht">
      {/* mockup 101: the tiled header every Home card now wears */}
      <span className="nv-tile" style={{ '--a': 'var(--nv-vi)' }} aria-hidden="true"><RvIcon name="review" /></span>
      <span className="lbl">Daily review</span>
      {r.state !== 'mac-unreachable' && <><RvPips pips={r.pips} /><RvCount pips={r.pips} /></>}
    </div>
  );
  return (
    <section className="nv-sum-card nv-sum-rise nv-rv nv-rv-card" style={style} aria-label="Daily review">
      {head}
      {loading ? <Skeleton />
        : r.state === 'all-done' ? <Done r={r} />
        : r.state === 'mac-unreachable' ? <p className="nv-rv-big2" style={{ font: '400 20px/1.3 var(--nv-font-serif)', margin: '12px 0 14px' }}>Nova cannot reach the Mac right now. Your review comes back with it.</p>
        : <RingBody r={r} />}
    </section>
  );
}

/* ------------------------------- grouped Home ------------------------------- */

// the grouped (cupertino) Home, his phone: the short card in the group pane
function GroupRows({ r }) {
  return <div className="nv-rv-gpad"><CardBody r={r} /></div>;
}

export function ReviewGroup({ r }) {
  const ready = useDemoArrival(r.demo);
  const loading = r.state === 'loading' || !ready;
  return (
    <section className="nv-rv" aria-label="Daily review">
      <div className="nv-rv-glab">
        <RvIcon name="review" />Daily review
        {r.state !== 'mac-unreachable' && <><RvCount pips={r.pips} /><RvPips pips={r.pips} /></>}
      </div>
      <div className="nv-pane nv-rv-grp">
        {loading ? <div className="nv-rv-gpad"><Skeleton /></div>
          : r.state === 'all-done' ? <div className="nv-rv-gpad"><Done r={r} /></div>
          : r.state === 'mac-unreachable' ? <div className="nv-rv-gpad"><p className="nv-rv-big2" style={{ font: '400 19px/1.3 var(--nv-font-serif)', margin: 0 }}>Nova cannot reach the Mac right now. Your review comes back with it.</p></div>
          : <GroupRows r={r} />}
      </div>
    </section>
  );
}

// "Nothing due today": no moment on Home; the row that says when the next one is
export function ReviewNothingDueRow({ r, onClick }) {
  return (
    <Interactive as="button" type="button" className="nv-rv nv-rv-irow nv-pane" onClick={onClick} style={{ width: '100%', borderRadius: 'var(--nv-radius)' }}>
      <span className="tl"><RvIcon name="review" /></span>
      <span className="tt"><b>Daily review</b><small>{r.nothingDueLine}</small></span>
      <RvIcon name="chev" className="nv-rv-ic" />
    </Interactive>
  );
}

/* ------------------------------- classic Home ------------------------------- */
// the Command pane keeps its own head (DAILY REVIEW, the count); the body is
// the same card, every state, from the same view model
export function ReviewInline({ r }) {
  if (r.state === 'loading') return <div className="nv-rv"><Skeleton /></div>;
  if (r.state === 'nothing-due') return <div className="nv-rv"><p className="nv-rv-m" style={{ margin: 0 }}>{r.nothingDueLine}</p></div>;
  if (r.state === 'mac-unreachable') return <div className="nv-rv"><p className="nv-rv-m" style={{ margin: 0 }}>Nova cannot reach the Mac right now. Your review comes back with it.</p></div>;
  if (r.state === 'all-done') return <div className="nv-rv"><Done r={r} /></div>;
  return <div className="nv-rv"><CardBody r={r} /></div>;
}
