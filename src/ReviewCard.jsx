import { useEffect, useRef, useState } from 'react';
import './review.css';
import { Interactive } from './Interactive.jsx';
import { TextAction, Button } from './Controls.jsx';
import { CountUp } from './CountUp.jsx';
import { SkeletonBar } from './Skeleton.jsx';
import { ReviewCurve } from './ReviewCurve.jsx';
import { NOTE_TYPE_COLOR } from './vals/shared.js';

// THE DAILY REVIEW CARD (mockup 96, Parts 3, 4 and 6), both Home idioms from
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

const SRC = NOTE_TYPE_COLOR.source;
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

function SourceLine({ r }) {
  const s = r.source;
  if (!s) {
    return <div className="nv-rv-src none" style={{ '--rv-k': SRC }}><span className="nv-rv-pl"><RvIcon name="doc" /></span><span className="tx">No source on this page</span></div>;
  }
  return (
    <Interactive as="button" type="button" className="nv-rv-src" style={{ '--rv-k': SRC }} onClick={r.open} haptic="tick"
      aria-label={`From ${s.title}${s.ep ? `, ${s.ep}` : ''}${s.time ? `, at ${s.time}` : ''}. Open the page`}>
      <span className="nv-rv-pl"><RvIcon name={s.canPlay ? 'play' : 'doc'} /></span>
      <span className="tx">from <em>{s.title}</em>{s.ep ? `, ${s.ep}` : ''}{s.kind ? ` · ${s.kind}` : ''}{s.extra > 0 ? ` · +${s.extra}` : ''}</span>
      {s.time ? <span className="at">{s.time}</span> : null}
    </Interactive>
  );
}

function Chips({ r, max = 3 }) {
  if (!r.connected.length) return null;
  return (
    <div className="nv-rv-links">
      {r.connected.slice(0, max).map((c) => (
        <Interactive key={c.id} as="button" type="button" className="nv-rv-ln" style={{ '--rv-k': c.color }} onClick={c.go} haptic="tick" aria-label={`Open ${c.title}, ${c.kind}`}>
          <i /><span>{c.title}</span>
        </Interactive>
      ))}
    </div>
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

function CardBody({ r }) {
  const entrance = useEntrance(r.id);
  return (
    <div className={`nv-rv-body ${entrance}`} key={r.id}>
      <Kicker r={r} />
      <h3 className="nv-rv-ct" title={r.title}>{r.title}</h3>
      <Gist r={r} />
      {/* away from the Mac the card keeps to what can be read now and
          says why the answer waits (mockup 96 Part 6) */}
      {!r.offline && <>
        <SourceLine r={r} />
        <Chips r={r} />
        <CurveBlock r={r} />
      </>}
      <AnswerSlot r={r} />
      <div className="nv-rv-foot">
        <WriteOnIt r={r} />
        <TextAction tone="quiet" onClick={r.open} ariaLabel={`Open the page, ${r.title}`}>Open the page<RvIcon name="chev" className="nv-rv-ic" /></TextAction>
      </div>
    </div>
  );
}

/* ------------------------------- summary Home ------------------------------- */

export function ReviewMoment({ r, style }) {
  const ready = useDemoArrival(r.demo);
  const loading = r.state === 'loading' || !ready;
  const head = (
    <div className="nv-rv-dh">
      <RvIcon name="review" />Daily review
      {r.state !== 'mac-unreachable' && <><RvPips pips={r.pips} /><RvCount pips={r.pips} /></>}
    </div>
  );
  return (
    <section className="nv-sum-card nv-sum-rise nv-rv nv-rv-card" style={style} aria-label="Daily review">
      {head}
      {loading ? <Skeleton />
        : r.state === 'all-done' ? <Done r={r} />
        : r.state === 'mac-unreachable' ? <p className="nv-rv-big2" style={{ font: '400 20px/1.3 var(--nv-font-serif)', margin: '12px 0 14px' }}>Nova cannot reach the Mac right now. Your review comes back with it.</p>
        : <CardBody r={r} />}
    </section>
  );
}

/* ------------------------------- grouped Home ------------------------------- */

function GroupRows({ r }) {
  const entrance = useEntrance(r.id);
  const s = r.source;
  return (
    <div className={`nv-rv-body ${entrance}`} key={r.id}>
      <Interactive as="div" className="nv-rv-gpad" onClick={r.open} aria-label={`${r.title}. Open the page`} base={{ cursor: 'pointer' }}>
        <Kicker r={r} />
        <h3 className="nv-rv-ct">{r.title}</h3>
        <Gist r={r} />
        <CurveBlock r={r} />
      </Interactive>
      {s ? (
        <Interactive as="button" type="button" className="nv-rv-gr" style={{ '--rv-k': SRC }} onClick={r.open} haptic="tick">
          <span className="nv-rv-pl"><RvIcon name={s.canPlay ? 'play' : 'doc'} /></span>
          <span className="t"><em>{s.title}</em>{s.ep ? `, ${s.ep}` : ''}</span>
          <span className={s.time ? 'k at' : 'k'}>{s.time || s.kind || ''}</span>
          <RvIcon name="chev" className="nv-rv-ic chev" />
        </Interactive>
      ) : (
        <div className="nv-rv-gr"><span className="t" style={{ color: 'var(--nv-ink60)' }}>No source on this page</span></div>
      )}
      {r.connected.slice(0, 3).map((c) => (
        <Interactive key={c.id} as="button" type="button" className="nv-rv-gr" style={{ '--rv-k': c.color }} onClick={c.go} haptic="tick" aria-label={`Open ${c.title}, ${c.kind}`}>
          <span className="dot" /><span className="t">{c.title}</span><span className="k">{c.kind}</span><RvIcon name="chev" className="nv-rv-ic chev" />
        </Interactive>
      ))}
      <div className="nv-rv-gpad"><AnswerSlot r={r} /></div>
      <Interactive as="button" type="button" className={`nv-rv-gr ${r.writtenToday ? 'ok' : 'vi'}`} onClick={r.writeAboutIt} haptic="tick">
        <span className="t">{r.writtenToday ? 'Written on today · write again' : 'Write on it'}</span>{r.writtenToday ? <RvIcon name="got" className="nv-rv-ic" /> : <RvIcon name="chev" className="nv-rv-ic chev" />}
      </Interactive>
    </div>
  );
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
