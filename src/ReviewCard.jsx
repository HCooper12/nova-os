import { useEffect, useRef, useState } from 'react';
import './review.css';
import { Interactive } from './Interactive.jsx';
import { TextAction, Button } from './Controls.jsx';
import { CountUp } from './CountUp.jsx';
import { ReviewCurve } from './ReviewCurve.jsx';
import { holdKept, releaseKept, validHold, useKept } from './reviewHold.js';
import { localISO } from './reviewDemo.js';


// THE DAILY REVIEW CARD (mockup 96, shortened by mockup 98, redrawn quote-first
// by mockup 116: the speaker's own words lead, then who and where, then the
// idea behind them, then the answer), both Home idioms from
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
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
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
  // where the kicker, the line and the source will land (mockup 116)
  return (
    <div className="nv-rv-sk" aria-label="Daily review, arriving">
      <i style={{ '--w': '42%', '--h': '12px', '--m': '12px' }} />
      <i style={{ '--w': '22px', '--h': '20px', '--m': '12px', '--r': '5px' }} />
      <i style={{ '--w': '100%', '--h': '20px', '--m': '6px' }} /><i style={{ '--w': '88%', '--h': '20px', '--m': '9px' }} /><i style={{ '--w': '54%', '--h': '20px', '--m': '9px' }} />
      <div className="srow"><i style={{ '--w': '30px', '--h': '30px', '--m': 0, '--r': '50%' }} /><span style={{ flex: 1, display: 'grid', gap: '6px' }}><i style={{ '--w': '40%', '--h': '12px', '--m': 0 }} /><i style={{ '--w': '62%', '--h': '12px', '--m': 0 }} /></span></div>
      <i style={{ '--w': '100%', '--h': '44px', '--m': '16px', '--r': '22px' }} />
    </div>
  );
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
    <div className="nv-rv-body arrive rv-done">
      <p className="nv-rv-big2">{d.line}</p>
      {r.todayLine && (
        <div className="rv-line"><span className="k">Today’s line</span><p>“{r.todayLine.text}”{r.todayLine.by ? <small>{r.todayLine.by}</small> : null}</p></div>
      )}
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
        {/* the body lane on request (his call, 15 Oct): sleep, stress, health science */}
        {d.drawBody && !d.spin && !d.drawBusy
          ? <TextAction tone="quiet" onClick={d.drawBody}>A body one</TextAction>
          : null}
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

// ---------------------------------------------------------------------------
// THE QUOTE CARD BODY (mockup 116). One body for both Home idioms and the
// classic pane; the grouped idiom restyles it by its ancestor class.
//   new line      Keep it / Not for me
//   returning     the line is veiled: "What was the line?", Show it, then
//                 Got it / Fuzzy / Forgot, then where the page went
//   kept          the Read answer held on the card until Next
// ---------------------------------------------------------------------------

function Kick({ r }) {
  const k = r.kickerQ;
  if (!k) return null;
  return (
    <p className="nv-rv-kick">
      {k.body ? 'Body · ' : ''}{k.isNew ? <span className="new">New today</span> : k.text}{r.demo ? ' · demo' : ''}
    </p>
  );
}

function SourceRow({ r }) {
  const q = r.quote;
  if (!q) {
    // no line on the page: the page's own recorded source, as before, or nothing
    const s = r.source;
    if (!s) return null;
    return (
      <Interactive as="button" type="button" className="nv-rv-src gline" style={{ '--rv-k': 'var(--nv-cy)' }} onClick={s.open} haptic="tick" aria-label={`${s.canPlay ? 'Play' : 'Open'} ${s.title}${s.time ? `, from ${s.time}` : ''}`}>
        <span className="nv-rv-pl"><RvIcon name="play" /></span>
        <span className="tx"><b>{s.title}</b><em>{s.ep || s.kind || 'source'}</em></span>
        {s.time ? <span className="at">{s.time}</span> : null}
      </Interactive>
    );
  }
  const body = (
    <>
      <span className="nv-rv-pl">{q.href ? <RvIcon name="play" /> : <RvIcon name="doc" />}</span>
      <span className="tx"><b>{q.primary}</b><em>{q.secondary}</em></span>
      {q.at ? <span className="at">{q.at}</span> : null}
    </>
  );
  return q.href
    ? <Interactive as="button" type="button" className="nv-rv-src gline" onClick={q.open} haptic="tick" aria-label={q.aria}>{body}</Interactive>
    : <div className="nv-rv-src gline plain" role="group" aria-label={q.aria}>{body}</div>;
}

function QuoteCardBody({ r, phase, onShow, onKeep, onNext, shownLabel }) {
  const q = r.quote;
  const veiled = phase === 'ask';
  const res = r.result;
  const nextLabel = r.isLast ? 'Done' : 'Next';
  const live = r.offline ? 'sl-off' : { new: 'sl-new', kept: 'sl-kept', ask: 'sl-ask', shown: 'sl-grade', graded: 'sl-res' }[phase];
  const inert = (cls) => (cls === live ? undefined : true);
  return (
    <>
      <div className="rv-pad">
        <Kick r={r} />
        <div className="rv-qa">
          {q ? (
            <div className="rv-q veil" aria-hidden={veiled ? 'true' : undefined}>
              <span className="rv-qm" aria-hidden="true">“</span>
              <blockquote className="rv-qt">{q.text}</blockquote>
            </div>
          ) : (
            <div className="rv-q">
              <h3 className="rv-qt rv-noq" title={r.title}>{r.title}</h3>
              <p className="rv-noqn">{r.source ? 'No spoken line is recorded on this page.' : 'No spoken line and no source are recorded on this page.'}</p>
            </div>
          )}
          {q && r.returning ? <p className="rv-prompt" aria-hidden={veiled ? 'false' : 'true'}>What was the line?</p> : null}
        </div>
      </div>
      <SourceRow r={r} />
      <Interactive as="button" type="button" className="rv-idea" onClick={r.open} haptic="tick" aria-label={`The idea: ${r.idea?.title || r.title}. Open the page`}>
        <span className="in">
          <span className="hd"><span className="lab">The idea</span><span className="ttl">{r.idea?.title || r.title}</span></span>
          {r.idea?.sentence ? <span className="sent veil" aria-hidden={veiled ? 'true' : undefined}>{r.idea.sentence}</span> : null}
        </span>
        <span className="chev"><RvIcon name="chev" /></span>
      </Interactive>
      <div className="rv-slot gline">
        <div className="sl-new" inert={inert('sl-new')}>
          <Interactive as="button" type="button" className="rv-pill" onClick={onKeep} disabled={!onKeep} haptic="tick" activeStyle={CSS_PRESS}><RvIcon name="got" />Keep it</Interactive>
          {r.skip ? <Interactive as="button" type="button" className="rv-ta" onClick={r.skip} haptic="tick" activeStyle={CSS_PRESS}>Not for me</Interactive> : null}
        </div>
        <div className="sl-kept rv-res" style={{ '--g': 'var(--nv-vi)' }} aria-live="polite" inert={inert('sl-kept')}>
          <span className="nv-rv-mark"><RvIcon name="got" /></span>
          <p>Kept.<small>{r.keptLine}</small></p>
          <Interactive as="button" type="button" className="rv-next" onClick={onNext} haptic="tick" activeStyle={CSS_PRESS}>{nextLabel}</Interactive>
        </div>
        <div className="sl-ask" inert={inert('sl-ask')}>
          <p className="q">Say it to yourself, then check.</p>
          <Interactive as="button" type="button" className="rv-show" onClick={onShow} haptic="tick" activeStyle={CSS_PRESS}><RvIcon name="eye" />{shownLabel}</Interactive>
        </div>
        <div className="sl-grade" inert={inert('sl-grade')}>
          <p className="nv-rv-q">How well did it come back?</p>
          <div className="nv-rv-rec">
            {r.grades.map((g, n) => (
              <Interactive key={g.key} as="button" type="button" disabled={g.disabled || !!res}
                className="nv-rv-rb" style={{ '--g': g.hue, '--i': n }} aria-label={g.aria} onClick={g.go} haptic={g.disabled ? undefined : 'tick'} activeStyle={CSS_PRESS}>
                <b><RvIcon name={g.key} />{g.label}</b>
                <small>{g.gapWord}</small>
              </Interactive>
            ))}
          </div>
        </div>
        <div className="sl-res rv-res" style={res ? { '--g': res.hue } : undefined} aria-live="polite" inert={inert('sl-res')}>
          {res ? (
            <>
              <span className="nv-rv-mark"><RvIcon name={res.grade} /></span>
              <p>Back {res.dueLabel}<small>{res.label} · in {res.gap} {res.gap === 1 ? 'day' : 'days'}</small></p>
              <Interactive as="button" type="button" className="rv-next" onClick={r.next} haptic="tick" activeStyle={CSS_PRESS}>{nextLabel}</Interactive>
            </>
          ) : null}
        </div>
        {r.offline ? (
          <div className="sl-off" inert={inert('sl-off')}>
            <p className="nv-rv-offl"><RvIcon name="offline" /><span>{r.offline.line}</span></p>
          </div>
        ) : null}
      </div>
    </>
  );
}

// which phase the card is in, and what its taps do. The held Kept page (see
// reviewHold.js) stands in for the live page until Next is tapped.
function useQuoteCard(r) {
  const kept = validHold(useKept(), r, localISO());
  const [shownId, setShownId] = useState(null);
  const v = kept ? kept.r : r;
  const phase = kept ? 'kept'
    : v.result ? 'graded'
    : v.offline ? 'off'
    : v.returning ? (shownId === v.id ? 'shown' : 'ask')
    : 'new';
  return {
    v, phase, kept: !!kept,
    onShow: () => setShownId(v.id),
    onKeep: v.readNext ? () => { holdKept(v, localISO()); v.readNext(); } : null,
    onNext: () => { releaseKept(); r.next(); },
  };
}

/* ------------------------------- summary Home ------------------------------- */

function QuoteBody({ qc }) {
  const entrance = useEntrance(qc.v.id);
  return (
    <div className={`nv-rv-body ${entrance}`} key={qc.v.id}>
      <QuoteCardBody r={qc.v} phase={qc.phase} onShow={qc.onShow} onKeep={qc.onKeep} onNext={qc.onNext} shownLabel="Show it" />
    </div>
  );
}

export function ReviewMoment({ r, style }) {
  const ready = useDemoArrival(r.demo);
  const qc = useQuoteCard(r);
  const loading = (r.state === 'loading' || !ready) && !qc.kept;
  const head = (
    <div className="nv-rv-dh nv-sum-cht">
      {/* mockup 101: the tiled header every Home card now wears */}
      <span className="nv-tile" style={{ '--a': 'var(--nv-vi)' }} aria-hidden="true"><RvIcon name="review" /></span>
      <span className="lbl">Daily review</span>
      {r.state !== 'mac-unreachable' && <><RvPips pips={r.pips} /><RvCount pips={r.pips} /></>}
    </div>
  );
  const onCard = qc.kept || r.state === 'card';
  return (
    <section className="nv-sum-card nv-sum-rise nv-rv nv-rv-card rv-card" style={style} aria-label="Daily review" data-phase={onCard ? qc.phase : r.state}>
      {head}
      <div className="rv-box">
        {loading ? <Skeleton />
          : onCard ? <QuoteBody qc={qc} />
          : r.state === 'all-done' ? <Done r={r} />
          : r.state === 'mac-unreachable' ? <p className="nv-rv-big2" style={{ font: '400 20px/1.3 var(--nv-font-serif)', margin: '12px 0 14px' }}>Nova cannot reach the Mac right now. Your review comes back with it.</p>
          : <Skeleton />}
      </div>
    </section>
  );
}

/* ------------------------------- grouped Home ------------------------------- */

// the grouped (cupertino) Home: the same card as rows in the group pane
export function ReviewGroup({ r }) {
  const ready = useDemoArrival(r.demo);
  const qc = useQuoteCard(r);
  const loading = (r.state === 'loading' || !ready) && !qc.kept;
  const onCard = qc.kept || r.state === 'card';
  return (
    <section className="nv-rv rv-card rv-grouped" aria-label="Daily review" data-phase={onCard ? qc.phase : r.state}>
      <div className="nv-rv-glab nv-rv-dh">
        <RvIcon name="review" />Daily review
        {r.state !== 'mac-unreachable' && <><RvPips pips={r.pips} /><RvCount pips={r.pips} /></>}
      </div>
      <div className="nv-pane nv-rv-grp rv-box">
        {loading ? <Skeleton />
          : onCard ? <QuoteBody qc={qc} />
          : r.state === 'all-done' ? <div className="rv-done"><Done r={r} /></div>
          : r.state === 'mac-unreachable' ? <div className="nv-rv-gpad"><p className="nv-rv-big2" style={{ font: '400 19px/1.3 var(--nv-font-serif)', margin: 0 }}>Nova cannot reach the Mac right now. Your review comes back with it.</p></div>
          : <Skeleton />}
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
  const qc = useQuoteCard(r);
  if (qc.kept || r.state === 'card') return <div className="nv-rv rv-card" data-phase={qc.phase}><div className="rv-box"><QuoteBody qc={qc} /></div></div>;
  if (r.state === 'loading') return <div className="nv-rv"><Skeleton /></div>;
  if (r.state === 'nothing-due') return <div className="nv-rv"><p className="nv-rv-m" style={{ margin: 0 }}>{r.nothingDueLine}</p></div>;
  if (r.state === 'mac-unreachable') return <div className="nv-rv"><p className="nv-rv-m" style={{ margin: 0 }}>Nova cannot reach the Mac right now. Your review comes back with it.</p></div>;
  return <div className="nv-rv"><Done r={r} /></div>;
}
