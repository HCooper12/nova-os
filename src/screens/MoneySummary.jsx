import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CountUp } from '../CountUp.jsx';
import { useFlipList } from '../useFlipList.js';
import { useSheetDrag } from '../useSheetDrag.js';
import { useExit } from '../useExit.js';
import { SwipeRow } from '../SwipeRow.jsx';
import { haptic } from '../haptics.js';
import { MIcon } from '../MoneyIcon.jsx';
import { usd, usd2, catOf } from '../moneyModel.js';
import { readAmount, budgetFromInput } from '../moneyParse.js';
import '../money.css';

// THE SUMMARY MONEY PAGE — mockup 85's Money tab ("A refined", his words on
// 9 Oct: "I love the layout and colour choices as well as the features"),
// with mockup 90's refinements taken as defaults: Compare on the pace card,
// a line's own sheet, how sure each bill is, the budget app's export path
// with the honest .xlsx card, and three columns on the Mac. Built 10 Oct
// 2026, held to his note that day: "ensure everything is not cluttered".
//
// The phone's first screen holds what round 2's did (the clutter budget in
// design/audits/redesign-2026-09/17-money-build-checklist.md): the title
// with ⋯ and ＋, the month, the news line, the hero, the two tiles. Anything
// secondary is one level down, in the ⋯ sheet or a pushed page.
//
// Everything drawn is v.moneySum.view (src/moneyModel.js, by code); every
// action is an App method that writes through the rails with Undo. Nothing
// here adds a figure up or writes a sentence.

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtUsd = (n) => usd(n);
const fmtUsd2 = (n) => usd2(n);

// a card that has entered the view once (the mockup's reveal): its charts
// draw then, not while it is still below the fold
function useInView(ref) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return undefined;
    if (reduced() || typeof IntersectionObserver !== 'function') { const t = setTimeout(() => setOn(true), 0); return () => clearTimeout(t); }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, on]);
  return on;
}

// the page's own width decides the Mac's three columns (the sidebar can be
// open or not; the window any size)
function useWide(ref) {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 940));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return wide;
}

function Card({ className = '', children, style, label, as: Tag = 'section', i = 0 }) {
  const ref = useRef(null);
  const on = useInView(ref);
  return (
    <Tag ref={ref} className={`nv-sum-card nv-mo-card nv-mo-rv${on ? ' in' : ''} ${className}`} style={{ '--i': i, ...style }} aria-label={label}>
      {children}
    </Tag>
  );
}

const Sh = ({ title, aside, onAside, asideLabel, id }) => (
  <div className="nv-mo-sh" id={id}>
    <h2>{title}</h2>
    {onAside ? <button type="button" className="nv-mo-sh-btn" onClick={onAside} aria-label={asideLabel}>{aside}</button> : aside ? <span>{aside}</span> : null}
  </div>
);

const Parts = ({ parts }) => parts.map((p, k) => (
  p.hue ? <span key={k} style={{ color: p.hue }}>{p.text}</span>
    : p.b ? <b key={k}>{p.text}</b>
      : p.i ? <span key={k} className="nv-mo-it">{p.text}</span>
        : <span key={k}>{p.text}</span>
));

/* ------------------------------------------------------------- the top -- */

function Top({ M, V, compact }) {
  const ro = V.readOnly;
  return (
    <>
      <header className="nv-mo-top nv-sum-rise" style={{ '--i': 0 }}>
        <h1>Money</h1>
        {compact && <MonthPill M={M} V={V} />}
        {compact && <p className="nv-mo-news nv-mo-news-inline"><span className="nv-mo-dot" aria-hidden="true" /><Parts parts={V.news || []} /></p>}
        <button type="button" className="nv-mo-ib" aria-label="More: the report, the export, imports, scan, your budget app, how money gets in" onClick={() => { haptic('tick'); M.openSheet({ kind: 'menu' }); }}>
          <MIcon n="more" />
        </button>
        <button type="button" className="nv-mo-ib hue" aria-label={ro ? 'Add a line (paused while offline)' : 'Add a line'} disabled={ro}
          onClick={() => { haptic('tick'); M.openSheet({ kind: 'add' }); }}>
          <MIcon n="plus" />
        </button>
      </header>
      {!compact && (
        <div className="nv-mo-pillrow nv-sum-rise" style={{ '--i': 0 }}>
          <MonthPill M={M} V={V} />
        </div>
      )}
      {!compact && V.news?.length > 0 && (
        <p className="nv-mo-news nv-sum-rise" style={{ '--i': 1 }}><span className="nv-mo-dot" aria-hidden="true" /><Parts parts={V.news} /></p>
      )}
    </>
  );
}

function MonthPill({ M, V }) {
  return (
    <button type="button" className="nv-mo-pill" aria-label={`Month: ${V.monthLabel}. Change month`}
      onClick={() => { haptic('tick'); M.openSheet({ kind: 'months' }); }} disabled={(V.months || []).length < 2 && !V.demo}>
      {V.monthLabel}<MIcon n="down" />
    </button>
  );
}

/* ------------------------------------------------------------ the hero -- */

const R = 60;
const C = 2 * Math.PI * R;
function Donut({ hero, empty }) {
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => { if (drawn) return undefined; const t = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true))); return () => cancelAnimationFrame(t); }, [drawn]);
  const tick = hero.tickFrac != null ? (() => {
    const a = (-90 + hero.tickFrac * 360) * Math.PI / 180;
    const p = (r) => [75 + r * Math.cos(a), 75 + r * Math.sin(a)];
    return [p(49), p(71)];
  })() : null;
  const said = empty ? 'Nothing spent yet'
    : `${fmtUsd(hero.spent)} spent${hero.totalBudget ? ` of ${fmtUsd(hero.totalBudget)} in budgets` : ''}, drawn by category${tick ? `; the white tick is where today’s pace would be, ${fmtUsd(hero.paceAt)}` : ''}`;
  return (
    <div className="nv-mo-donutwrap" role="img" aria-label={said}>
    <svg className="nv-mo-donut" viewBox="0 0 150 150" aria-hidden="true">
      {empty
        ? <circle cx="75" cy="75" r={R} className="nv-mo-donut-dash" />
        : <circle cx="75" cy="75" r={R} className="nv-mo-donut-trk" />}
      {!empty && hero.arcs.map((a, i) => {
        const len = Math.max(0, a.frac * C - (hero.arcs.length > 1 ? 1.6 : 0));
        return (
          <circle key={a.key} cx="75" cy="75" r={R} className="nv-mo-arc" transform="rotate(-90 75 75)"
            style={{ stroke: a.hue, strokeDashoffset: -(a.start * C), strokeDasharray: drawn ? `${len} ${C}` : `0 ${C}`, transitionDelay: `${i * 90}ms` }} />
        );
      })}
      {tick && <line className={`nv-mo-pace${drawn ? ' on' : ''}`} x1={tick[0][0]} y1={tick[0][1]} x2={tick[1][0]} y2={tick[1][1]} />}
    </svg>
    {/* the centre is HTML over the ring, so its figure can count up */}
    <span className="nv-mo-dc" aria-hidden="true">
      <b>{empty ? '$0' : <CountUp value={hero.spent} format={fmtUsd} fromZero />}</b>
      <small>{empty ? 'nothing filed' : hero.totalBudget ? `of ${fmtUsd(hero.totalBudget)}` : 'spent'}</small>
    </span>
    </div>
  );
}

function Hero({ V, offline }) {
  const h = V.hero;
  const empty = V.state === 'empty';
  return (
    <section className={`nv-sum-card nv-mo-hero nv-sum-rise${offline ? ' dim' : ''}`} style={{ '--i': 2 }} aria-label={empty ? 'Nothing filed yet' : h.label}>
      <div className="nv-mo-hgrid">
        <Donut hero={h} empty={empty} />
        <div className="nv-mo-hs">
          {empty ? (
            <>
              <span className="nv-mo-k">{V.monthLabel}</span>
              <b className="nv-mo-empty-h">Nothing filed yet</b>
              <span className="nv-mo-t">Add a line, or drop an export in the folder and Nova will ask.</span>
            </>
          ) : (
            <>
              <span className="nv-mo-k">{offline ? `${h.label}, as last read` : h.label}</span>
              <b className="nv-mo-big"><CountUp value={h.big} format={fmtUsd} fromZero /></b>
              {h.lines.map((l, k) => <span key={k} className="nv-mo-t"><Parts parts={l} /></span>)}
              {offline && <span className="nv-mo-t">Budgets and the ＋ button are paused, not hidden.</span>}
            </>
          )}
        </div>
      </div>
      {!empty && V.legend.length > 0 && (
        <div className="nv-mo-legend" aria-label="Spending by category">
          {V.legend.map((c, i) => (
            <span key={c.key} className={`nv-mo-cp${c.ink ? ' ink' : ''}`} style={{ '--h': c.hue, '--j': i }}>
              <MIcon n={c.key} />{c.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Tiles({ V, M }) {
  const a = V.against;
  return (
    <div className="nv-mo-tiles">
      <section className="nv-sum-card nv-mo-tile nv-mo-inflow nv-sum-rise" style={{ '--i': 3 }} aria-label={`Money in: ${fmtUsd(V.moneyIn.amount)}, ${V.moneyIn.sub}`}>
        <span className="nv-mo-coin"><MIcon n="in" /></span>
        <div>
          <span className="nv-mo-k">Money in</span>
          <b className="nv-mo-tbig">+<CountUp value={V.moneyIn.amount} format={fmtUsd} fromZero /></b>
          <span className="nv-mo-k">{V.moneyIn.sub}</span>
        </div>
      </section>
      {a ? (
        <button type="button" className="nv-sum-card nv-mo-tile nv-mo-vs nv-sum-rise" style={{ '--i': 4 }}
          aria-label={`Against ${a.prevName}: ${Math.abs(a.pct)} percent ${a.diff <= 0 ? 'less' : 'more'}, ${a.words} by this day. Compare the two months`}
          onClick={() => { haptic('tick'); M.setCompare(true); document.getElementById('nv-mo-pace')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }}>
          <span className="nv-mo-door"><MIcon n="right" /></span>
          <span className="nv-mo-k">Against {a.prevName}</span>
          <span className="nv-mo-vrow">
            <b className="nv-mo-tbig">{a.pct > 0 ? '+' : a.pct < 0 ? '−' : ''}<CountUp value={Math.abs(a.pct)} fromZero />%</b>
            <span className="nv-mo-trend"><MIcon n={a.diff <= 0 ? 'dn' : 'up'} />{a.words}</span>
          </span>
          <span className="nv-mo-bars" aria-hidden="true">
            <span><i className="prev" style={{ height: `${Math.max(4, 40 * a.bars.prev / a.bars.max)}px` }} />{a.prevName.slice(0, 3)}</span>
            <span><i className="cur" style={{ height: `${Math.max(4, 40 * a.bars.cur / a.bars.max)}px` }} />{V.monthName.slice(0, 3)}</span>
          </span>
        </button>
      ) : (
        <section className="nv-sum-card nv-mo-tile nv-mo-vs nv-sum-rise" style={{ '--i': 4 }}>
          <span className="nv-mo-k">Against last month</span>
          <span className="nv-mo-t">No lines from last month to compare yet.</span>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------- the pace card -- */

function PaceCard({ V, M }) {
  const p = V.pace;
  const cmp = M.compare && p.hasPrev;
  const X = (d) => 5 + d / p.days * 300;
  const Y = (val) => 118 - val / p.max * 104;
  const path = (cum) => `M${[[X(0), Y(0)], ...cum.map((v, i) => [X(i + 1), Y(v)])].map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L')}`;
  const lineO = path(p.cur);
  const lineS = path(p.prev);
  const lastX = X(p.cur.length);
  const lastY = Y(p.cur[p.cur.length - 1] || 0);
  const prevAt = p.prev[Math.min(p.cur.length, p.prev.length) - 1] || 0;
  const ref = useRef(null);
  const on = useInView(ref);
  return (
    <section ref={ref} id="nv-mo-pace" className={`nv-sum-card nv-mo-card nv-mo-pacec nv-mo-rv${on ? ' in' : ''}${cmp ? ' cmp' : ''}`} style={{ '--i': 5 }} aria-label={cmp ? `${V.monthName} against ${p.prevName}` : p.title}>
      <div className="nv-mo-bt"><b>{cmp ? `${V.monthName} against ${p.prevName}` : p.title}</b><span>{p.dayLabel}</span></div>
      {p.hasPrev && (
        <div className="nv-mo-seg" role="group" aria-label={`Draw ${V.monthName} against`}>
          <button type="button" aria-pressed={!cmp} onClick={() => M.setCompare(false)}>{p.budget ? 'Budget pace' : 'This month'}</button>
          <button type="button" aria-pressed={cmp} onClick={() => { haptic('tick'); M.setCompare(true); }}>Last month</button>
        </div>
      )}
      <svg viewBox="0 0 326 132" className="nv-mo-pacesvg" role="img"
        aria-label={`Spending through ${V.monthName} as a line, ${fmtUsd(p.spent)} by ${p.dayLabel}${p.budget ? `, against the budget’s even pace to ${fmtUsd(p.budget)}` : ''}${p.hasPrev ? `. ${p.prevName} was ${fmtUsd(prevAt)} by the same day and ended at ${fmtUsd(p.prevEnd)}` : ''}`}>
        <defs><linearGradient id="nv-mo-pacefill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--nv-vi)" stopOpacity=".38" /><stop offset="1" stopColor="var(--nv-vi)" stopOpacity="0" /></linearGradient></defs>
        <line x1={X(0)} y1="118" x2={X(p.days)} y2="118" className="nv-mo-base" />
        {p.budget && <line className="nv-mo-ideal" x1={X(0)} y1={Y(0)} x2={X(p.days)} y2={Y(p.budget)} />}
        {p.hasPrev && <path className="nv-mo-sepl" pathLength="1" d={lineS} />}
        {p.hasPrev && <circle className="nv-mo-sepdot" cx={X(Math.min(p.cur.length, p.prev.length))} cy={Y(prevAt)} r="3.5" />}
        <path className="nv-mo-area" d={`${lineO} L${lastX.toFixed(1)} 118 L${X(0)} 118 Z`} />
        <path className="nv-mo-act" pathLength="1" d={lineO} />
        <circle className="nv-mo-today" cx={lastX} cy={lastY} r="5" />
        {p.budget && <text className="nv-mo-lbl lblB" x={X(p.days) - 2} y={Y(p.budget) - 4} textAnchor="end">Budget {fmtUsd(p.budget)}</text>}
        {p.hasPrev && <text className="nv-mo-lbl lblS" x={X(p.days) - 2} y={Math.max(10, Y(p.prevEnd) - 6)} textAnchor="end">{p.prevName.slice(0, 3)} ended {fmtUsd(p.prevEnd)}</text>}
        <text className="nv-mo-lblb" x={lastX > 160 ? lastX - 8 : lastX + 9} y={cmp ? lastY + 19 : lastY - 10} textAnchor={lastX > 160 ? 'end' : 'start'}>{fmtUsd(p.spent)} {V.isCurrent ? 'today' : ''}</text>
      </svg>
      <div className="nv-mo-axis"><span>{p.axis[0]}</span><span>{p.axis[1]}</span><span>{p.axis[2]}</span></div>
      <div className="nv-mo-keyl" aria-hidden="true">
        <span><i />{V.monthName}</span>
        {cmp && <span><i className="s" />{p.prevName}, same days</span>}
        {p.budget && <span><i className="d" />budget’s even pace</span>}
      </div>
      {cmp && (
        <div className="nv-mo-cmp">
          <p className="nv-mo-wsay"><Parts parts={V.compare.say} /></p>
          {V.compare.rows.length > 0 && (
            <>
              <div className="nv-mo-dvh"><span>Less than {p.prevName}</span><span>More</span></div>
              {V.compare.rows.map((r, i) => (
                <div key={r.key} className="nv-mo-dv" style={{ '--h': r.hue }}>
                  <span className="nv-mo-gt sm"><MIcon n={r.key} /></span>
                  <span className="nv-mo-trk2">
                    <i className={`b ${r.d > 0 ? 'r' : 'l'}`} style={{ width: `${r.w}%`, transitionDelay: `${i * 70}ms` }} />
                    <span className={`nm2 ${r.d > 0 ? 'r' : 'l'}`}>{r.label}</span>
                  </span>
                  <span className="nv-mo-v">{r.d > 0 ? '+' : '−'}{fmtUsd(Math.abs(r.d))}</span>
                </div>
              ))}
            </>
          )}
          <p className="nv-mo-rulep">{V.compare.rule}</p>
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------- the budgets -- */

function BudgetRow({ r, onOpen, on, ro }) {
  return (
    <button type="button" data-flip={r.category} className={`nv-mo-bud${on ? ' in' : ''}`} style={{ '--h': r.hue, '--p': r.fill.toFixed(3) }} disabled={ro}
      aria-label={`${r.label}: ${fmtUsd(r.spent)} of ${fmtUsd(r.budget)}${r.over ? `, ${fmtUsd(r.over)} over` : `, ${fmtUsd(r.budget - r.spent)} left`}. Change the budget`}
      onClick={() => { haptic('tick'); onOpen(r.category); }}>
      <span className="nv-mo-gt"><MIcon n={r.key} /></span>
      <span className="nv-mo-btx">
        <b>{r.label}{r.over > 0 && <span className="nv-mo-over">{fmtUsd(r.over)} over</span>}</b>
        <span className="nv-mo-bv"><span className="num">{fmtUsd(r.spent)}</span> of {fmtUsd(r.budget)}</span>
      </span>
      <span className="nv-mo-cap" aria-hidden="true">
        <i className="f" />
        {r.over > 0 && <i className="o" style={{ width: `${r.overW.toFixed(2)}%` }} />}
        <i className="ln" />
      </span>
    </button>
  );
}

function Budgets({ V, M }) {
  const B = V.budgets;
  const ref = useRef(null);
  const on = useInView(ref);
  const open = (category) => M.openSheet({ kind: 'budget', category });
  // an over row moves to the top (or back) by FLIP, never a jump
  const listRef = useRef(null);
  useFlipList(listRef, B.rows.map((r) => r.category).join(','));
  return (
    <>
      <Sh title="Budgets" aside={B.head} />
      <section ref={ref} className={`nv-sum-card nv-mo-card nv-mo-rv${on ? ' in' : ''}`} aria-label="Budgets">
        <div ref={listRef}>{B.rows.map((r) => <BudgetRow key={r.category} r={r} on={on} onOpen={open} ro={V.readOnly} />)}</div>
        {!B.rows.length && (
          <button type="button" className="nv-mo-nob first" onClick={() => open('Groceries')} disabled={V.readOnly}>
            <i className="dash" aria-hidden="true" /><span>No budgets yet. Give a category one and the donut measures the month against it.</span><MIcon n="right" />
          </button>
        )}
        {B.noBudget && B.rows.length > 0 && (
          <button type="button" className="nv-mo-nob" disabled={V.readOnly}
            aria-label={`${B.noBudget.names.length === 1 ? 'One category has' : `${B.noBudget.names.length} categories have`} no budget: ${B.noBudget.names.join(', ')}, ${fmtUsd(B.noBudget.total)}. Set one`}
            onClick={() => open(B.noBudget.categories[0])}>
            <i className="dash" aria-hidden="true" /><span>No budget yet: {B.noBudget.names.join(', ')} · {fmtUsd(B.noBudget.total)}</span><MIcon n="right" />
          </button>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------- cards that wait on him -- */

function Answer({ yes, yesIcon = 'check', onYes, onTalk, noLabel, onNo, ro }) {
  return (
    <div className="nv-mo-answer">
      <button type="button" className="nv-mo-yes" onClick={() => { haptic('commit'); onYes(); }} disabled={ro}><MIcon n={yesIcon} />{yes}</button>
      <button type="button" className="nv-mo-q" onClick={onTalk}><MIcon n="talk" />Talk</button>
      <button type="button" className="nv-mo-no" aria-label={noLabel} onClick={() => { haptic('tick'); onNo(); }} disabled={ro}><MIcon n="x" /></button>
    </div>
  );
}

function RiseCard({ rise, M, ro }) {
  const ref = useRef(null);
  const on = useInView(ref);
  return (
    <div ref={ref} className={`nv-mo-decide nv-mo-rv${on ? ' in' : ''}`} aria-label="A price went up, waiting on you">
      <div className="nv-mo-dk"><span>A price went up</span><span>waiting on you</span></div>
      <p className="nv-mo-say">{rise.say}</p>
      <div className="nv-mo-step" role="img" aria-label={`${rise.bars.length - 1} earlier charges, then the new one; the step up is hatched`}>
        {rise.bars.map((b, i) => <i key={i} className={b.now ? 'now' : ''} style={{ '--hh': `${b.h}px`, '--up': `${b.up}px`, '--k': i }} />)}
      </div>
      <div className="nv-mo-stepx" style={{ gridTemplateColumns: `repeat(${rise.bars.length},1fr)` }}>{rise.bars.map((b, i) => <span key={i}>{b.label}</span>)}</div>
      <p className="nv-mo-sub">{rise.sub}</p>
      <Answer yes="Keep it" onYes={() => M.answer(rise.id, 'keep')} onTalk={() => M.discuss(rise.talk)} noLabel={rise.noLabel} onNo={() => M.answer(rise.id, 'cancel')} ro={ro} />
    </div>
  );
}

function ImportCard({ c, M, ro }) {
  return (
    <div className="nv-mo-decide in" aria-label="Lines to file, waiting on you">
      <div className="nv-mo-dk"><span>Lines to file</span><span>waiting on you</span></div>
      <p className="nv-mo-say">{c.say}</p>
      <p className="nv-mo-sub">{c.range}{c.leftOut ? `. ${c.leftOut} ${c.leftOut === 1 ? 'was' : 'were'} already here and ${c.leftOut === 1 ? 'is' : 'are'} left out.` : '.'}</p>
      <div className="nv-mo-preview" aria-hidden="true">{c.preview.map((x, i) => <i key={i} style={{ flex: x.n, background: x.hue }} />)}</div>
      <p className="nv-mo-sub" style={{ marginTop: 0 }}>{c.mixWords}</p>
      <Answer yes="Look through" yesIcon="list" onYes={() => M.openSheet({ kind: 'import', id: c.id })} onTalk={() => M.discuss(c.talk)}
        noLabel="Don’t file them; the file stays in the folder" onNo={() => M.discardImport(c.id)} ro={ro} />
    </div>
  );
}

function FileCard({ c, M, ro }) {
  return (
    <div className="nv-mo-decide in" aria-label="A file Nova can’t read yet, waiting on you">
      <div className="nv-mo-dk"><span>A file Nova can’t read yet</span><span>waiting on you</span></div>
      <p className="nv-mo-say">{c.say}</p>
      <ol className="nv-mo-howto">
        <li><span>On your Mac, open it in <b>Numbers</b>.</span></li>
        <li><span><b>File › Export To › CSV…</b> and save it into the same folder, Money/Imports.</span></li>
        <li><span>Nova finds the CSV within five minutes and asks before filing anything.</span></li>
      </ol>
      <Answer yes="Done, check now" onYes={() => { M.answer(c.id, 'noted'); M.checkImports(); }} onTalk={() => M.discuss(c.talk)}
        noLabel="Leave the file where it is" onNo={() => M.answer(c.id, 'noted')} ro={ro} />
    </div>
  );
}

/* ----------------------------------------------------------- coming up -- */

const Strip = ({ offs, hollow }) => (
  <span className="nv-mo-strip" aria-hidden="true">
    {offs.map((o, i) => <i key={i} className={hollow ? 'o' : ''} style={{ left: `${Math.max(3, Math.min(97, 50 + o * 8.5)).toFixed(1)}%`, transitionDelay: `${300 + i * 60}ms` }} />)}
  </span>
);

function BillRow({ b }) {
  return (
    <div className="nv-mo-br3" style={{ '--h': b.hue }} aria-label={`${b.name}, ${b.when}, ${fmtUsd2(b.amount)}. ${b.word}: ${b.said}`}>
      <span className={`nv-mo-mono${b.kind === 'guess' ? ' g' : ''}`} aria-hidden="true">{b.initial}</span>
      <b>{b.name}</b>
      <span className={`nv-mo-k${b.soon ? ' soon' : ''}`}>{b.when}</span>
      <span className="nv-mo-a">{fmtUsd2(b.amount)}</span>
      <div className="nv-mo-conf"><span className={`nv-mo-cw ${b.kind}`}>{b.word}</span><Strip offs={b.offsets} hollow={b.kind === 'guess'} /></div>
      <span className="nv-mo-k nv-mo-said">{b.said}</span>
    </div>
  );
}

function Calendar({ cells, label }) {
  return (
    <div className="nv-mo-cal" role="img" aria-label={label}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={`w${i}`} className="wd">{d}</span>)}
      {cells.map((c, i) => (
        <span key={c.iso} className={`d${c.past ? ' past' : ''}${c.today ? ' today' : ''}${c.otherMonth ? ' mo' : ''}${c.win ? ` win${c.win.edge === 'start' ? ' w0' : c.win.edge === 'end' ? ' w1' : ''}` : ''}`}
          style={c.win ? { '--h': c.win.hue } : undefined}>
          {c.day}
          {c.coins.slice(0, 2).map((k, j) => <i key={j} className={`nv-mo-coin2${k.guess ? ' gs' : ''}`} style={{ '--h': k.hue, '--s': `${k.size}px`, transitionDelay: `${i * 18}ms` }} />)}
        </span>
      ))}
    </div>
  );
}

function ComingUp({ V, M }) {
  const c = V.coming;
  const ref = useRef(null);
  const on = useInView(ref);
  return (
    <>
      <Sh title="Coming up" aside={c.sub} />
      <section ref={ref} className={`nv-sum-card nv-mo-card nv-mo-rv${on ? ' in' : ''}`} aria-label="Coming up">
        <Calendar cells={c.cells} label={c.label} />
        <div className="nv-mo-bills">{c.bills.map((b) => <BillRow key={b.key} b={b} />)}</div>
        <button type="button" className="nv-mo-more" onClick={() => M.openPage('recurring')}>All {c.count} recurring<MIcon n="right" /></button>
      </section>
    </>
  );
}

/* --------------------------------------------------------------- lines -- */

function LineRow({ r, onOpen, selected }) {
  return (
    <button type="button" className={`nv-mo-lr${selected ? ' sel' : ''}`} data-flip={r.id} style={{ '--h': r.hue }} onClick={() => onOpen(r)}
      aria-label={`${r.name}, ${r.catLabel}, ${r.amountLabel}${r.odd ? `, ${r.odd.word}` : ''}. Open the line`}>
      <span className={`nv-mo-mono${r.ink ? ' oth' : ''}${r.income ? ' inw' : ''}`} aria-hidden="true">{r.income ? <MIcon n="in" /> : r.initial}</span>
      <b>{r.name}</b>
      <span className="nv-mo-c"><i />{r.catLabel}{r.note ? <span className="nv-mo-note"> · {r.note}</span> : null}</span>
      <span className={`nv-mo-a${r.incoming ? ' in' : ''}`}>{r.amountLabel}{r.up && <span className="nv-mo-up">{r.up}</span>}{r.odd && <span className="nv-mo-odd">{r.odd.word}</span>}</span>
    </button>
  );
}

function Latest({ V, M, wide }) {
  const L = V.latest;
  const rootRef = useRef(null);
  const ids = L.groups.flatMap((g) => g.rows.map((r) => r.id)).join(',');
  useFlipList(rootRef, ids);
  const open = (r) => (wide ? M.select(r.id) : M.openSheet({ kind: 'line', id: r.id }));
  return (
    <>
      <Sh title="Latest" aside={`All ${L.count}`} onAside={() => M.openPage('lines')} asideLabel={`All ${L.count} lines`} />
      <Card label="Latest lines">
        <div ref={rootRef}>
          {L.groups.map((g) => (
            <div key={g.date}>
              <div className="nv-mo-dh"><span>{g.label}</span><span className="num">{g.total}</span></div>
              {g.rows.map((r) => <LineRow key={r.id} r={r} onOpen={open} selected={wide && M.selected === r.id} />)}
            </div>
          ))}
        </div>
        {L.more && <button type="button" className="nv-mo-more" onClick={() => M.openPage('lines')}>See all {L.count} lines<MIcon n="right" /></button>}
      </Card>
    </>
  );
}

function Sources({ V, M }) {
  const s = V.sources;
  const ref = useRef(null);
  const on = useInView(ref);
  return (
    <>
      <Sh title="Where lines come from" aside={V.monthName} />
      <section ref={ref} className={`nv-sum-card nv-mo-card nv-mo-src nv-mo-rv${on ? ' in' : ''}`} aria-label="Where lines come from">
        {s.total > 0 && (
          <div className="nv-mo-srcbar" aria-hidden="true">
            {s.export > 0 && <i style={{ flex: s.export, background: 'var(--nv-vi)' }} />}
            {s.typed > 0 && <i style={{ flex: s.typed, background: 'color-mix(in srgb, var(--nv-vi) 55%, transparent)', transitionDelay: '.1s' }} />}
            {s.scan > 0 && <i style={{ flex: s.scan, background: 'color-mix(in srgb, var(--nv-vi) 30%, transparent)', transitionDelay: '.2s' }} />}
          </div>
        )}
        <div className="nv-mo-srcl">
          <span><i style={{ background: 'var(--nv-vi)' }} /><b>{s.export}</b>bank exports</span>
          <span><i style={{ background: 'color-mix(in srgb, var(--nv-vi) 55%, transparent)' }} /><b>{s.typed}</b>typed</span>
          <span><i style={{ background: 'color-mix(in srgb, var(--nv-vi) 30%, transparent)' }} /><b>{s.scan}</b>receipt scans</span>
          <span className="slot"><i />budget app · not linked</span>
        </div>
        <p className="nv-mo-sub">{s.note}</p>
        <div className="nv-mo-acts">
          <button type="button" className="nv-mo-chip" onClick={M.checkImports} disabled={V.readOnly || M.busy}><MIcon n="folder" />{M.busy ? 'Checking…' : 'Check now'}</button>
          <button type="button" className="nv-mo-chip" onClick={() => M.openSheet({ kind: 'link' })}><MIcon n="open" />Link your budget app</button>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------- states -- */

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the month">
      <section className="nv-sum-card nv-mo-hero">
        <div className="nv-mo-hgrid">
          <span className="nv-mo-skel" style={{ width: 150, height: 150, borderRadius: '50%' }} />
          <div>
            <span className="nv-mo-skel" style={{ display: 'block', width: '70%', height: 12 }} />
            <span className="nv-mo-skel" style={{ display: 'block', width: '55%', height: 36, marginTop: 10 }} />
            <span className="nv-mo-skel" style={{ display: 'block', width: '90%', height: 12, marginTop: 10 }} />
          </div>
        </div>
        <span className="nv-mo-skel" style={{ display: 'block', height: 30, marginTop: 14, borderRadius: 15 }} />
      </section>
      <div className="nv-mo-tiles">
        <span className="nv-sum-card nv-mo-tile nv-mo-inflow"><span className="nv-mo-skel" style={{ display: 'block', height: 100 }} /></span>
        <span className="nv-sum-card nv-mo-tile nv-mo-vs"><span className="nv-mo-skel" style={{ display: 'block', height: 100 }} /></span>
      </div>
      <section className="nv-sum-card nv-mo-card" style={{ marginTop: 12 }}><span className="nv-mo-skel" style={{ display: 'block', height: 150 }} /></section>
    </div>
  );
}

/* -------------------------------------------------------------- sheets -- */

function Sheet({ label, onClose, left, title, right, children, wide }) {
  const exit = useExit(onClose);
  const drag = useSheetDrag(onClose, { threshold: 80 });
  const panelRef = useRef(null);
  const closeRef = useRef(exit.close);
  useLayoutEffect(() => { closeRef.current = exit.close; });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);
  const onControl = (el) => !!(el && el.closest && el.closest('button, a, input, [role="button"]'));
  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={label} onClick={exit.close} className="nv-mo-scrim">
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }} tabIndex={-1}
        className={`nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-mo-sheet${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div {...drag.handleProps} onPointerDown={(e) => { if (!onControl(e.target)) drag.handleProps.onPointerDown(e); }} className="nv-mo-shtop" style={drag.handleProps.style}>
          <span className="nv-mo-grab" aria-hidden="true" />
          <span className="nv-mo-shl">{left ? left(exit.close) : <span />}</span>
          <b>{title}</b>
          <span className="nv-mo-shr">{right ? right(exit.close) : <button type="button" className="nv-mo-q" onClick={exit.close} aria-label="Close"><MIcon n="x" /></button>}</span>
        </div>
        <div className="nv-mo-shbody">{children(exit.close)}</div>
      </div>
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
// THE NUMBER PAD (the mockup's), plus the hardware keyboard while the sheet
// is up and no text field has the focus
function Pad({ value, onChange }) {
  const press = (k) => {
    haptic('tick');
    if (k === '⌫') { onChange(value.slice(0, -1)); return; }
    if (k === '.' && value.includes('.')) return;
    if (/\.\d\d$/.test(value)) return;
    if (value.replace(/\..*/, '').length >= 9 && k !== '.' && !value.includes('.')) return;
    onChange(value === '0' && k !== '.' ? k : value + k);
  };
  const ref = useRef(press);
  useLayoutEffect(() => { ref.current = press; });
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); ref.current(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); ref.current('⌫'); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="nv-mo-pad">
      {KEYS.map((k) => <button type="button" key={k} className={k === '.' || k === '⌫' ? 'dim' : ''} aria-label={k === '⌫' ? 'Delete a digit' : k} onClick={() => press(k)}>{k}</button>)}
    </div>
  );
}

// the digits as typed ("6.50" stays "6.50"), the whole dollars grouped
const typed = (value) => {
  const [whole, cents] = String(value).split('.');
  return `${Number(whole || 0).toLocaleString('en-AU')}${cents !== undefined ? `.${cents}` : ''}`;
};
const Amount = ({ value, placeholder = '0' }) => (
  <div className="nv-mo-amt" aria-live="polite"><span className="cur">$</span><span className="num">{value ? typed(value) : placeholder}</span><span className="nv-mo-caret" /></div>
);

function MenuSheet({ M, onClose }) {
  const fileRef = useRef(null);
  const item = (icon, title, sub, run, disabled) => (
    <button type="button" className="nv-mo-mi" disabled={disabled} onClick={() => { haptic('tick'); run(); }}>
      <MIcon n={icon} /><span>{title}<small>{sub}</small></span>
    </button>
  );
  return (
    <Sheet label="Money menu" title="Money" onClose={onClose}>
      {(close) => (
        <div className="nv-mo-menu" role="menu">
          {item('doc', `Draft ${M.prevMonthLabel}’s report`, 'On the rails, for your approval', () => { close(); M.report(); }, M.view.readOnly)}
          {item('share', `Export ${M.fyLabel}`, 'A CSV of every line', () => { close(); M.exportFy(); })}
          <div className="nv-mo-msep" />
          {item('folder', 'Check the imports folder', `${M.importsDir}, also every 5 minutes`, () => { close(); M.checkImports(); }, M.view.readOnly)}
          {item('cam', 'Scan a statement or receipt', 'Up to 3 photos, drafted to the Inbox', () => fileRef.current?.click(), M.view.readOnly || M.scanBusy)}
          {item('open', 'Bring in your budget app', 'Its export, through the imports folder', () => M.openSheet({ kind: 'link' }))}
          {item('info', 'How money gets in', 'Exports, scans, and “coffee 6.50” anywhere', () => M.openSheet({ kind: 'how' }))}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { M.onScanFiles(e); close(); }} />
        </div>
      )}
    </Sheet>
  );
}

function HowSheet({ M, onClose }) {
  return (
    <Sheet label="How money gets in" title="How money gets in" onClose={onClose}>
      {() => (
        <ol className="nv-mo-howto">
          <li><span><b>Bank and budget app exports.</b> Save a CSV into {M.importsDir}. Nova checks every five minutes, leaves out lines it already has, and files nothing until you say so.</span></li>
          <li><span><b>Receipt and statement photos.</b> Up to three at a time, from ⋯ or the add sheet. Nova reads them and drafts the lines to your Inbox.</span></li>
          <li><span><b>Typed anywhere.</b> “coffee 6.50” into any capture box files a line here; so does ＋ on this page.</span></li>
        </ol>
      )}
    </Sheet>
  );
}

function MonthsSheet({ M, onClose }) {
  const V = M.view;
  return (
    <Sheet label="Pick a month" title="Month" onClose={onClose}>
      {(close) => (
        <div className="nv-mo-menu" role="radiogroup" aria-label="Months">
          {V.months.map((m) => (
            <button type="button" key={m.value} role="radio" aria-checked={m.value === V.month} className="nv-mo-mi"
              onClick={() => { haptic('tick'); close(); if (m.value !== V.month) M.setMonth(m.value); }}>
              <MIcon n={m.value === V.month ? 'check' : 'oth'} style={m.value === V.month ? undefined : { opacity: 0 }} /><span>{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function AddSheet({ M, onClose }) {
  const V = M.view;
  const [amount, setAmount] = useState('');
  const [spend, setSpend] = useState(true);
  const [where, setWhere] = useState('');
  const fileRef = useRef(null);
  const n = readAmount(amount);
  const ok = n.kind === 'number' && n.value > 0 && where.trim().length > 0;
  // the category, from his own history when he has been there before; the
  // server's keyword map decides otherwise (never guessed here)
  const known = useMemo(() => {
    const q = where.trim().toLowerCase();
    if (q.length < 2) return null;
    return V.lines.rows.find((r) => r.name.toLowerCase().startsWith(q)) || null;
  }, [where, V.lines.rows]);
  return (
    <Sheet label="Add a line" title="Add a line" onClose={onClose}
      left={(close) => <button type="button" className="nv-mo-q" onClick={close}>Cancel</button>}
      right={(close) => (
        <button type="button" className="nv-mo-save" disabled={!ok || V.readOnly}
          onClick={() => { haptic('commit'); M.add({ merchant: where.trim(), amount: spend ? -n.value : n.value, ...(known ? { category: known.category } : {}) }); close(); }}>Add</button>
      )}>
      {() => (
        <>
          <Amount value={amount} />
          <div className="nv-mo-segc" role="group" aria-label="Spend or money in">
            <button type="button" aria-pressed={spend} onClick={() => setSpend(true)}>Spend</button>
            <button type="button" aria-pressed={!spend} onClick={() => setSpend(false)}>Money in</button>
          </div>
          <label className="nv-mo-field"><span className="sr">Where</span>
            <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Where, like Corner Grocer" maxLength={120} enterKeyHint="done" autoComplete="off" />
          </label>
          <div className="nv-mo-guess">{known
            ? <><i style={{ background: known.hue }} />Filed as {known.catLabel}, like your last {known.name} line</>
            : 'The category comes from the merchant'}</div>
          <div className="nv-mo-ways">
            <button type="button" className="nv-mo-way" onClick={() => fileRef.current?.click()} disabled={V.readOnly || M.scanBusy}><MIcon n="cam" />Scan a receipt<span>up to 3 photos</span></button>
            <button type="button" className="nv-mo-way" onClick={M.checkImports} disabled={V.readOnly}><MIcon n="folder" />Imports folder<span>checked every 5 min</span></button>
            <button type="button" className="nv-mo-way" onClick={() => M.openSheet({ kind: 'link' })}><MIcon n="open" />Budget app<span>its export</span></button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={M.onScanFiles} />
          {M.scanError && <p className="nv-mo-sub">{M.scanError}</p>}
          {M.scanQuestion && <p className="nv-mo-sub">Nova asks: {M.scanQuestion}</p>}
          <Pad value={amount} onChange={setAmount} />
        </>
      )}
    </Sheet>
  );
}

function BudgetSheet({ M, category, onClose }) {
  const V = M.view;
  const meta = catOf(category);
  const b = V.budgets.all.find((x) => x.category === category) || { history: [0, 0, 0], budget: null };
  const [amount, setAmount] = useState(b.budget ? String(b.budget) : '');
  const hist = b.history || [0, 0, 0];
  const avg = Math.round(hist.reduce((s, x) => s + x, 0) / Math.max(1, hist.filter((x) => x > 0).length || 1));
  const val = budgetFromInput(amount);
  const max = Math.max(...hist, val || 0, 1);
  const ref = useRef(null);
  const on = useInView(ref);
  const labels = [-2, -1, 0].map((k) => { const d = new Date(`${V.month}-15T00:00:00`); d.setMonth(d.getMonth() + k); return d.toLocaleDateString('en-AU', { month: 'long' }); });
  const changed = (val ?? null) !== (b.budget ?? null);
  return (
    <Sheet label={`${meta.label} budget`} onClose={onClose}
      title={<><span className="nv-mo-gt sm" style={{ '--h': meta.hue }}><MIcon n={meta.key} /></span>{meta.label}</>}
      left={(close) => <button type="button" className="nv-mo-q" onClick={close}>Cancel</button>}
      right={(close) => (
        <button type="button" className="nv-mo-save" disabled={val === undefined || !changed || V.readOnly}
          onClick={() => { haptic('commit'); M.setBudget(category, amount); close(); }}>Save</button>
      )}>
      {() => (
        <div style={{ '--h': meta.hue }}>
          <div ref={ref} className={`nv-mo-hist${on ? ' in' : ''}`} role="img" aria-label={`${labels.map((l, i) => `${l} ${fmtUsd(hist[i])}`).join(', ')}${val ? `; the line is the budget, ${fmtUsd(val)}` : ''}`}>
            {hist.map((x, i) => <i key={i} className={i === 2 ? 'cur' : ''} style={{ '--hh': `${Math.max(3, Math.round(80 * x / max))}px` }} />)}
            {val ? <span className="line" style={{ '--b': `${Math.round(80 * val / max)}px` }}><span>{fmtUsd(val)}</span></span> : null}
          </div>
          <div className="nv-mo-histx">{labels.map((l) => <span key={l}>{l}</span>)}</div>
          <Amount value={amount} placeholder="none" />
          <p className="nv-mo-hint">{val === undefined ? 'Nova can’t read that as an amount; the budget stays as it is.' : 'Typing $ or commas is fine. Empty clears the budget.'}</p>
          <div className="nv-mo-acts center">
            {avg > 0 && <button type="button" className="nv-mo-chip" onClick={() => setAmount(String(avg))}>{fmtUsd(avg)} · 3-month average</button>}
            <button type="button" className="nv-mo-chip" onClick={() => M.discuss(`Let's talk about my ${meta.label.toLowerCase()} budget. I've spent ${fmtUsd(hist[2])} this month${b.budget ? ` against ${fmtUsd(b.budget)}` : ' with no budget set'}; ${labels[0]} was ${fmtUsd(hist[0])} and ${labels[1]} ${fmtUsd(hist[1])}. Why, and what should the budget be?`)}><MIcon n="talk" />Ask why</button>
          </div>
          <Pad value={amount} onChange={setAmount} />
        </div>
      )}
    </Sheet>
  );
}

// a line's own sheet on the phone, and the right-hand pane on the Mac
function LineEditor({ M, row, onDone, inline, saveRef, onChanged }) {
  const V = M.view;
  const [cat, setCat] = useState(row.category);
  const [note, setNote] = useState(row.note || '');
  const [rule, setRule] = useState(false);
  const changed = cat !== row.category || (note.trim() || null) !== (row.note || null);
  const cats = V.categories.filter((c) => c.category !== 'Income' || row.incoming);
  const save = () => {
    haptic('commit');
    M.edit(row.id, { ...(cat !== row.category ? { category: cat, rule } : {}), ...((note.trim() || null) !== (row.note || null) ? { note: note.trim() } : {}) });
    onDone?.();
  };
  // the phone sheet's Save sits in its title bar: it reads the latest save
  // through a ref, and hears only when "changed" flips
  useLayoutEffect(() => { if (saveRef) saveRef.current = save; });
  useEffect(() => { onChanged?.(changed); }, [changed, onChanged]);
  return (
    <div className={inline ? 'nv-mo-insp' : ''}>
      <div className="nv-mo-lhd" style={{ '--h': row.hue }}>
        <span className={`nv-mo-mono big${row.ink ? ' oth' : ''}${row.income ? ' inw' : ''}`} aria-hidden="true">{row.income ? <MIcon n="in" /> : row.initial}</span>
        <b>{row.name}</b>
        <span className="nv-mo-k">{row.where}</span>
        <span className="nv-mo-a">{row.amountLabel}</span>
      </div>
      {row.odd && (
        <div className="nv-mo-oddnote">
          <span>{row.odd.word}: Nova flagged it against this merchant’s usual charge.</span>
          <button type="button" className="nv-mo-chip" onClick={() => M.discuss(row.odd.talk)}><MIcon n="talk" />Ask about it</button>
        </div>
      )}
      <div className="nv-mo-lab">Category<span>tap to change</span></div>
      <div className="nv-mo-cgrid" role="radiogroup" aria-label="Category">
        {cats.map((c) => (
          <button type="button" role="radio" key={c.category} aria-checked={c.category === cat} className="nv-mo-cg" style={{ '--h': c.hue }}
            disabled={V.readOnly} onClick={() => { haptic('tick'); setCat(c.category); }}>
            <MIcon n={c.key} /><span>{c.label}</span>
          </button>
        ))}
      </div>
      <label className="nv-mo-field"><MIcon n="note" /><span className="sr">Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" maxLength={200} disabled={V.readOnly} />
      </label>
      {cat !== row.category && (
        <label className="nv-mo-trow2">
          <span>File every {row.name} line this way<small>{rule ? 'On: future lines from it follow' : 'Off: only this line changes'}</small></span>
          <span className="nv-sum-switch" data-on={rule ? 'true' : 'false'}><input type="checkbox" checked={rule} onChange={(e) => setRule(e.target.checked)} aria-label={`File every ${row.name} line this way`} /></span>
        </label>
      )}
      <div className="nv-mo-foot2">
        <span className="nv-mo-k">{row.from}</span>
        <button type="button" className="nv-mo-del" disabled={V.readOnly} onClick={() => { haptic('commit'); M.remove(row.id); onDone?.(); }}>Delete line</button>
      </div>
      {inline && <button type="button" className="nv-mo-save block" disabled={!changed || V.readOnly} onClick={save}>Save</button>}
    </div>
  );
}
function LineSheet({ M, id, onClose }) {
  const row = M.view.lines.rows.find((r) => r.id === id);
  const saveRef = useRef(null);
  const [changed, setChanged] = useState(false);
  const gone = !row;
  useEffect(() => { if (gone) onClose(); }, [gone, onClose]);
  if (!row) return null;
  return (
    <Sheet label={`${row.name}, ${row.amountLabel}`} title="" onClose={onClose}
      left={(close) => <button type="button" className="nv-mo-q" onClick={close}>Cancel</button>}
      right={(close) => <button type="button" className="nv-mo-save" disabled={!changed || M.view.readOnly} onClick={() => { saveRef.current?.(); close(); }}>Save</button>}>
      {(close) => <LineEditor M={M} row={row} onDone={close} saveRef={saveRef} onChanged={setChanged} />}
    </Sheet>
  );
}

function LinkSheet({ M, onClose }) {
  const [step, setStep] = useState(reduced() ? 3 : -1);
  useEffect(() => {
    if (reduced()) return undefined;
    const ts = [0, 1, 2, 3].map((k) => setTimeout(() => setStep(k), 350 + k * 650));
    return () => ts.forEach(clearTimeout);
  }, []);
  const nodes = [['web', 'Export on its website'], ['file', 'Save it as CSV'], ['folder', 'Into Money/ Imports'], ['inbox', 'Nova asks you']];
  return (
    <Sheet label="Bring in your budget app" title="Your budget app" onClose={onClose}>
      {() => (
        <>
          <p className="nv-mo-news" style={{ marginTop: 4, fontSize: 18 }}>Nova reads its export, the same way it reads your bank’s.</p>
          <div className="nv-mo-path">
            <span className="nv-mo-file" style={{ '--x': Math.max(0, step) }} data-on={step >= 0 ? 'true' : 'false'}><MIcon n="file" />export.csv</span>
            {nodes.map(([ic, t], k) => <div key={ic} className={`pn${step >= k ? ' on' : ''}`}><span className="bub"><MIcon n={ic} /></span>{t}</div>)}
          </div>
          <p className="nv-mo-sub" style={{ marginTop: 14 }}>The export is on its website only: Transactions, Select all, Export. Save the file into Money/Imports in Files. Nova checks every five minutes, leaves out lines it already has, and files nothing until you say so.</p>
          <p className="nv-mo-sub quiet">Nova never signs in to it and never sees its password or your bank’s. If the file comes out as a spreadsheet (.xlsx), Nova says so and shows how to save it as CSV.</p>
          <div className="nv-mo-acts">
            <button type="button" className="nv-mo-chip" onClick={M.openBudgetSite}><MIcon n="open" />Open its website</button>
            <button type="button" className="nv-mo-chip" onClick={M.checkImports} disabled={M.view.readOnly}><MIcon n="folder" />Check now</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function ImportSheet({ M, id, onClose }) {
  const c = M.view.importCards.find((x) => x.id === id);
  const [tab, setTab] = useState('new');
  useEffect(() => { if (!c) onClose(); }, [c, onClose]);
  if (!c) return null;
  return (
    <Sheet label={`${c.count} lines from the export`} title={c.file || 'Statement photo'} onClose={onClose} wide
      left={(close) => <button type="button" className="nv-mo-q" onClick={close}>Close</button>} right={() => <span style={{ width: 44 }} />}>
      {(close) => (
        <>
          <p className="nv-mo-sub" style={{ textAlign: 'center', marginTop: 0 }}>{c.count} lines · {c.range}</p>
          <div className="nv-mo-segc" role="group" aria-label="Which lines">
            <button type="button" aria-pressed={tab === 'new'} onClick={() => setTab('new')}>New {c.count}</button>
            <button type="button" aria-pressed={tab === 'out'} onClick={() => setTab('out')}>Left out {c.leftOut}</button>
          </div>
          {tab === 'new' ? (
            <div className="nv-mo-ilist">
              {c.groups.map((g) => (
                <div key={g.date}>
                  <div className="nv-mo-dh"><span>{g.label}</span><span className="num">{g.total}</span></div>
                  {g.rows.map((r) => (
                    <div key={r.id} className="nv-mo-il" style={{ '--h': r.hue }}>
                      <span className={`nv-mo-mono${r.ink ? ' oth' : ''}`} aria-hidden="true">{r.initial}</span>
                      <b>{r.name}</b><span className="nv-mo-map"><i />{r.catLabel}</span><span className="nv-mo-a">{r.amountLabel}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="nv-mo-sub">{c.leftOut ? `${c.leftOut} ${c.leftOut === 1 ? 'line was' : 'lines were'} already in the ledger (same day, amount and merchant), so ${c.leftOut === 1 ? 'it is' : 'they are'} left out and nothing is filed twice.` : 'Nothing was left out: every line is new.'}</p>
          )}
          <p className="nv-mo-sub quiet">The coloured category is where each line lands here, guessed from the merchant.</p>
          <button type="button" className="nv-mo-save block" disabled={M.view.readOnly} onClick={() => { haptic('commit'); M.approveImport(c.id); close(); }}>File all {c.count}{c.monthName ? ` into ${c.monthName}` : ''}</button>
        </>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------- pushed pages -- */

function PageTop({ M, title, sub }) {
  return (
    <div className="nv-mo-pagetop nv-sum-rise" style={{ '--i': 0 }}>
      <button type="button" className="nv-mo-back" onClick={M.closePage} aria-label="Back to Money"><MIcon n="left" />Money</button>
      <h1>{title}</h1>
      {sub && <p className="nv-mo-sub">{sub}</p>}
    </div>
  );
}

function LinesPage({ M }) {
  const V = M.view;
  const q = M.search.trim().toLowerCase();
  const rows = q ? V.lines.rows.filter((r) => `${r.name} ${r.catLabel} ${r.note || ''}`.toLowerCase().includes(q)) : null;
  const groups = useMemo(() => {
    if (!rows) return V.lines.groups;
    const out = [];
    for (const r of rows.slice(0, 120)) {
      let g = out[out.length - 1];
      if (!g || g.date !== r.date) { g = { date: r.date, label: r.where, rows: [] }; out.push(g); }
      g.rows.push(r);
    }
    return out;
  }, [rows, V.lines.groups]);
  const rootRef = useRef(null);
  useFlipList(rootRef, `${q}|${groups.flatMap((g) => g.rows.map((r) => r.id)).join(',')}`);
  return (
    <div className="nv-mo-page">
      <PageTop M={M} title="All lines" sub={`${V.monthLabel} · ${V.lines.count} ${V.lines.count === 1 ? 'line' : 'lines'}`} />
      <label className="nv-mo-field search"><MIcon n="search" /><span className="sr">Search lines</span>
        <input value={M.search} onChange={(e) => M.setSearch(e.target.value)} placeholder="Search merchant, category or note" />
      </label>
      {V.lines.capNote && !q && <p className="nv-mo-sub quiet">{V.lines.capNote}</p>}
      <section className="nv-sum-card nv-mo-card nv-sum-rise" style={{ '--i': 1 }} aria-label="Every line">
        <div ref={rootRef}>
          {groups.map((g) => (
            <div key={g.date}>
              <div className="nv-mo-dh"><span>{g.label}</span>{g.total && <span className="num">{g.total}</span>}</div>
              {g.rows.map((r) => (
                <div key={r.id} data-flip={r.id}>
                  {V.readOnly ? <LineRow r={r} onOpen={() => M.openSheet({ kind: 'line', id: r.id })} /> : (
                    <SwipeRow radius={0} left={{ label: 'Delete', icon: <MIcon n="x" />, tone: 'color-mix(in srgb, var(--nv-ink) 34%, var(--nv-void))', run: () => M.remove(r.id), collapse: true }}>
                      <LineRow r={r} onOpen={() => M.openSheet({ kind: 'line', id: r.id })} />
                    </SwipeRow>
                  )}
                </div>
              ))}
            </div>
          ))}
          {!groups.length && <p className="nv-mo-sub" style={{ padding: '12px 0' }}>{q ? `No line matches “${M.search}”.` : 'No lines this month yet.'}</p>}
        </div>
      </section>
    </div>
  );
}

function RecurringPage({ M }) {
  const c = M.view.coming;
  return (
    <div className="nv-mo-page">
      <PageTop M={M} title="Recurring" sub={c ? `${c.count} charges · ${c.perMonth}` : 'Nothing recurring yet'} />
      {c ? (
        <section className="nv-sum-card nv-mo-card nv-sum-rise" style={{ '--i': 1 }} aria-label="Every recurring charge">
          <div className="nv-mo-bills first">{c.all.map((b) => <BillRow key={b.key} b={b} />)}</div>
          <p className="nv-mo-rulep">How sure, from each one’s history: Sure is four or more charges, none more than a day off; Likely is three or more within five days, and its days are a window on the calendar; A guess is two, or ones that wander more.</p>
        </section>
      ) : (
        <section className="nv-sum-card nv-mo-card"><p className="nv-mo-sub">Nothing recurring detected yet. It takes two charges from the same merchant at a steady interval.</p></section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ the page -- */

export function MoneySummary({ v }) {
  const M = v.moneySum;
  const V = M.view;
  const rootRef = useRef(null);
  const wide = useWide(rootRef);
  const S = M.sheet;
  const close = M.closeSheet;

  let body;
  if (M.page === 'lines' && V.lines) body = <LinesPage M={M} />;
  else if (M.page === 'recurring' && V.lines) body = <RecurringPage M={M} />;
  else if (V.state === 'loading' || V.state === 'offline-empty') {
    body = (
      <>
        <header className="nv-mo-top"><h1>Money</h1></header>
        {V.state === 'loading' ? <Skeleton /> : (
          <section className="nv-sum-card nv-mo-card nv-mo-offl"><MIcon n="cloudx" /><span>Offline, and Nova has no ledger from before. Money comes back when the Mac does.</span></section>
        )}
      </>
    );
  } else {
    const empty = V.state === 'empty';
    const sel = wide && M.selected ? V.lines.rows.find((r) => r.id === M.selected) : null;
    const decisions = (
      <>
        {V.importCards.map((c) => <ImportCard key={c.id} c={c} M={M} ro={V.readOnly} />)}
        {V.fileCards.map((c) => <FileCard key={c.id} c={c} M={M} ro={V.readOnly} />)}
      </>
    );
    const col1 = (
      <>
        <Hero V={V} offline={V.offline} />
        {!empty && <Tiles V={V} M={M} />}
        {!empty && <PaceCard V={V} M={M} />}
      </>
    );
    const col2 = (
      <>
        {(!empty || V.budgets.rows.length > 0) && <Budgets V={V} M={M} />}
        {V.rise && <><Sh title="Price watch" aside="1 change" /><RiseCard rise={V.rise} M={M} ro={V.readOnly} /></>}
        {V.coming && <ComingUp V={V} M={M} />}
      </>
    );
    const col3 = (
      <>
        {!empty && <Latest V={V} M={M} wide={wide} />}
        {sel && (
          <section className="nv-sum-card nv-mo-card" aria-label={`${sel.name}, its line`}>
            <LineEditor key={sel.id} M={M} row={sel} inline onDone={() => M.select(null)} />
          </section>
        )}
        <Sources V={V} M={M} />
      </>
    );
    body = (
      <>
        <Top M={M} V={V} compact={wide} />
        {V.corrupt && <p className="nv-mo-sub">Part of this month’s ledger could not be read and was set aside; its lines are missing until it is restored.</p>}
        {decisions}
        {wide ? (
          <div className="nv-mo-cols">
            <div className="nv-mo-col">{col1}</div>
            <div className="nv-mo-col">{col2}</div>
            <div className="nv-mo-col">{col3}</div>
          </div>
        ) : (
          <div className="nv-mo-stack">{col1}{col2}{col3}</div>
        )}
      </>
    );
  }

  return (
    <div ref={rootRef} className={`nv-mo${wide ? ' wide' : ''}`} style={v.wrapMoney} data-screen-label="Money">
      {body}
      {S?.kind === 'menu' && <MenuSheet M={M} onClose={close} />}
      {S?.kind === 'how' && <HowSheet M={M} onClose={close} />}
      {S?.kind === 'months' && <MonthsSheet M={M} onClose={close} />}
      {S?.kind === 'add' && <AddSheet M={M} onClose={close} />}
      {S?.kind === 'budget' && <BudgetSheet M={M} category={S.category} onClose={close} />}
      {S?.kind === 'line' && <LineSheet M={M} id={S.id} onClose={close} />}
      {S?.kind === 'link' && <LinkSheet M={M} onClose={close} />}
      {S?.kind === 'import' && <ImportSheet M={M} id={S.id} onClose={close} />}
    </div>
  );
}
