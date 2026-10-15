import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { muscleVar } from './muscleHue.js';
import { muscleWeekView } from './muscleWeekView.js';
import { uncountedView } from './weekSets.js';
import { GlassSheet } from './GlassSheet.jsx';
import { Uncounted } from './Uncounted.jsx';
import { Eyebrow, TextAction } from './Controls.jsx';
import { spring, reducedMotion, cancelAll } from './motion/springs.js';
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

const OPEN_MS = 620;
const FOLD_MS = 420;

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

function CardBody({ c, onClose }) {
  return (
    <>
      <div className="nv-mw-ch">
        <Eyebrow as="span">This week</Eyebrow>
        <button type="button" className="nv-mw-x" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose(); }}>✕</button>
      </div>
      <div className="nv-mw-ch" style={{ marginTop: 4 }}><b id="nv-mw-title">{c.muscle}</b></div>
      <div className="nv-mw-sum nv-mw-rise"><strong>{c.done}</strong> sets done <span>· {c.bySunday} by Sunday · range {c.range}</span></div>
      <div className="nv-mw-rise"><Bar bar={c.bar} /></div>
      {c.empty && <p className="nv-mw-foot nv-mw-rise">Nothing this week trains {c.muscle.toLowerCase()}, done or planned.</p>}
      {c.groups.map((g) => (
        <div key={g.key} className="nv-mw-dayg nv-mw-rise">
          <h4><Eyebrow as="span">{g.short}</Eyebrow> <em>{g.routine}{g.tag ? ` · ${g.tag}` : ''}</em>{g.dup && <span className="nv-mw-dup">saved twice, counted once</span>}</h4>
          {g.items.map((l) => (
            <div key={l.key} className={`nv-mw-ex${l.come ? ' come' : ''}`}>
              <i className={l.focus ? 'nv-mw-f' : 'nv-mw-a'} />
              <span className="nv-mw-xn">{l.exercise}</span>
              <span className="nv-mw-xs">{l.sets}</span>
              <span className="nv-mw-xc">{l.value}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="nv-mw-foot nv-mw-rise">Solid square: {c.muscle} is the focus, each set counts 1. Striped: it assists, each set counts ½. Faded rows are still to come.</div>
    </>
  );
}

// THE CARD THAT GROWS OUT OF ITS ROW. Imperative on purpose: the open and
// the fold are one clip-path on one element, and an interrupted fold must
// start from the clip-path on screen, which only the element knows.
function useMuscleCard() {
  const [sel, setSel] = useState(null); // the muscle on the card
  const [seq, setSeq] = useState(0); // every open, even of the same muscle mid-fold
  const cardRef = useRef(null);
  const scrimRef = useRef(null);
  const rowRef = useRef(null);
  const anims = useRef([]);
  const isOpen = useRef(false);

  const insetTo = (row) => {
    const card = cardRef.current;
    const r = row.getBoundingClientRect(), c = card.getBoundingClientRect();
    return `inset(${r.top - c.top}px ${c.right - r.right}px ${c.bottom - r.bottom}px ${r.left - c.left}px round 10px)`;
  };

  const open = (muscle, row) => {
    rowRef.current = row;
    isOpen.current = true;
    setSel(muscle);
    setSeq((n) => n + 1);
  };

  // runs once the card holds the tapped muscle: grow from the row, or, if a
  // fold is still on screen, reverse from wherever it has got to
  useLayoutEffect(() => {
    const card = cardRef.current, scrim = scrimRef.current, row = rowRef.current;
    if (!seq || !card || !scrim || !row || !isOpen.current) return;
    const midFold = anims.current.length > 0;
    const now = midFold ? getComputedStyle(card).clipPath : null;
    const scrimNow = midFold ? Number(getComputedStyle(scrim).opacity) || 0 : 0;
    cancelAll(anims.current);
    card.style.visibility = 'visible';
    scrim.style.pointerEvents = 'auto';
    const full = 'inset(0px 0px 0px 0px round 24px)';
    if (reducedMotion()) {
      anims.current.push(
        card.animate([{ opacity: midFold ? getComputedStyle(card).opacity : 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' }),
        scrim.animate([{ opacity: scrimNow }, { opacity: 1 }], { duration: 200, fill: 'forwards' }),
      );
    } else {
      const { easing } = spring('smooth');
      const from = now && now !== 'none' ? now : insetTo(row);
      anims.current.push(
        card.animate([{ clipPath: from, opacity: 1 }, { clipPath: full, opacity: 1 }], { duration: OPEN_MS, easing, fill: 'forwards' }),
        scrim.animate([{ opacity: scrimNow }, { opacity: 1 }], { duration: 300, easing: 'ease-out', fill: 'forwards' }),
        // the contents rise after the card has begun to open, 40ms apart
        ...(midFold ? [] : [...card.querySelectorAll('.nv-mw-rise')].map((el, i) => el.animate(
          [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: 120 + Math.min(i, 10) * 40, easing, fill: 'backwards' },
        ))),
      );
    }
    card.querySelector('.nv-mw-x')?.focus({ preventScroll: true });
  }, [seq]);

  const close = () => {
    const card = cardRef.current, scrim = scrimRef.current, row = rowRef.current;
    if (!isOpen.current || !card || !scrim) return;
    isOpen.current = false;
    // mid-fold the sheet is live again: a tap on the row (or on the card
    // still folding into it) reopens from wherever the fold has got to
    scrim.style.pointerEvents = 'none';
    // interruptible: the fold starts from wherever the open has the card now
    const now = getComputedStyle(card).clipPath;
    const scrimNow = getComputedStyle(scrim).opacity;
    const opNow = getComputedStyle(card).opacity;
    cancelAll(anims.current);
    const done = () => {
      if (isOpen.current) return;
      cancelAll(anims.current);
      card.style.visibility = 'hidden';
      scrim.style.pointerEvents = 'none';
      setSel(null);
      row?.focus({ preventScroll: true });
    };
    const rowShown = row && document.body.contains(row);
    if (reducedMotion() || !rowShown) {
      const a = card.animate([{ opacity: opNow }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      anims.current.push(a, scrim.animate([{ opacity: scrimNow }, { opacity: 0 }], { duration: 160, fill: 'forwards' }));
      a.finished.then(done).catch(() => {});
      return;
    }
    const { easing } = spring('smooth');
    const a = card.animate([{ clipPath: now && now !== 'none' ? now : 'inset(0px 0px 0px 0px round 24px)' }, { clipPath: insetTo(row) }], { duration: FOLD_MS, easing, fill: 'forwards' });
    anims.current.push(a, scrim.animate([{ opacity: scrimNow }, { opacity: 0 }], { duration: 300, easing: 'ease-out', fill: 'forwards' }));
    a.finished.then(done).catch(() => {});
  };

  // Escape folds the card, and only the card: the sheet under it stays
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || !isOpen.current) return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    const running = anims.current;
    return () => { window.removeEventListener('keydown', onKey, true); cancelAll(running); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a tap on the card while it folds is a change of mind: grow it back
  const reopen = () => { if (!isOpen.current && rowRef.current && sel) open(sel, rowRef.current); };

  return { sel, open, close, reopen, cardRef, scrimRef };
}

// a downward pull on the card's head folds it, as the sheet's own drag does
function usePullToFold(close) {
  const start = useRef(null);
  const pulled = useRef(false); // the click that ends a pull is not a tap
  return {
    pulled,
    handlers: {
      onPointerDown: (e) => { start.current = { y: e.clientY, x: e.clientX }; pulled.current = false; },
      onPointerMove: (e) => {
        if (!start.current) return;
        const dy = e.clientY - start.current.y;
        if (dy > 70 && Math.abs(e.clientX - start.current.x) < dy) { start.current = null; pulled.current = true; close(); }
      },
      onPointerUp: () => { start.current = null; },
      onPointerCancel: () => { start.current = null; },
    },
  };
}

export function WeekSetsSheet({ model, originEl, onClose, onAskCoach }) {
  const scrollRef = useRef(null);
  const view = useMemo(() => muscleWeekView(model), [model]);
  const uc = useMemo(() => uncountedView(model?.uncounted), [model]);
  const { sel, open, close, reopen, cardRef, scrimRef } = useMuscleCard();
  const pull = usePullToFold(close);
  const c = sel && view ? view.card(sel) : null;
  if (!view) return null;
  const stop = (e) => e.stopPropagation();
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
      {createPortal(
        <>
          <div ref={scrimRef} className="nv-mw-scrim" onClick={(e) => { stop(e); close(); }} />
          <div ref={cardRef} className="nv-mw-card" role="dialog" aria-modal="true" aria-labelledby="nv-mw-title"
            aria-hidden={c ? undefined : true} onClick={(e) => { stop(e); if (pull.pulled.current) { pull.pulled.current = false; return; } reopen(); }} style={c ? { '--h': muscleVar(c.muscle) } : undefined} {...pull.handlers}>
            {c && <CardBody c={c} onClose={close} />}
          </div>
        </>,
        document.body,
      )}
    </GlassSheet>
  );
}
