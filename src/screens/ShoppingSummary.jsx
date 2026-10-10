import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CountUp } from '../CountUp.jsx';
import { useFlipList } from '../useFlipList.js';
import { useSheetDrag } from '../useSheetDrag.js';
import { useExit } from '../useExit.js';
import { SwipeRow } from '../SwipeRow.jsx';
import { haptic } from '../haptics.js';
import { priceSheet, offerFacts, fmtPts } from '../shopModel.js';
import { CHAIN_NAME, dollars, money } from '../shopPrice.js';
import '../shopping.css';

// THE SUMMARY SHOPPING PAGE: mockup 92 (round 5, 10 Oct 2026), which keeps
// every function of rounds 3 and 4 (mockups 88 and 91). His decisions of
// 10 Oct are built in: prices read by Nova from the chains' public pages,
// offers from his saved rewards emails, real logos when the Mac has read
// them (the drawn marks otherwise), and a stronger programme tint.
//
// Everything drawn is v.shopSum.view (src/shopModel.js, by code). Every
// action is an App method that writes with one pill and its Undo. Nothing
// here adds a figure up or writes a sentence.

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------- glyphs -- */
const G = {
  pr: 'M6 19c0-8 5-13 13-13 0 8-5 13-13 13zM6 19l7-7',
  me: 'M8 15c-3-1-4-5-1-8s8-3 10 0 1 8-3 9l-3 1-2 3-2-1 1-3z',
  da: 'M9 3h6v3l2 3v11a1 1 0 01-1 1H8a1 1 0 01-1-1V9l2-3zM7 13h10',
  pa: 'M6 8h12v13H6zM8 4h8v4H8zM6 13h12',
  fr: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 4.5l3 2 3-2M9 19.5l3-2 3 2',
  ba: 'M4 13c0-4 4-7 8-7s8 3 8 7v5H4zM9 9v3M12 8v4M15 9v3',
  be: 'M7 4h10l-1 16a1 1 0 01-1 1H9a1 1 0 01-1-1zM7.5 9h9',
  ho: 'M8 21V11h8v10M10 11V7h4v4M14 7l3-3M6 21h12',
  on: 'M3.5 8L12 4l8.5 4v9L12 21l-8.5-4zM3.5 8L12 12l8.5-4M12 12v9',
  kit: 'M5 9h12v6a4 4 0 01-4 4H9a4 4 0 01-4-4zM17 11h1.5a2 2 0 010 4H17M8 3v3M12 3v3',
  bag: 'M5 8h14l-1 12H6zM9 8a3 3 0 016 0',
  clock: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 7.5V12l3 2',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  mail: 'M3 5.5h18v13H3zM4 7.5l8 6 8-6',
  phone: 'M7 2.5h10v19H7zM11 18.5h2',
  news: 'M5 4.5h11v15H6.5A1.5 1.5 0 015 18zM16 8.5h3v9.5a1.5 1.5 0 01-3 0M8 8h5M8 11.5h5M8 15h3',
  pts: 'M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  back: 'M15 5l-7 7 7 7',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  chev: 'M9 6l6 6-6 6',
  arr: 'M5 12h13M13 7l5 5-5 5',
  out: 'M8 16L16 8M9 8h7v7',
  nosign: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM6 6l12 12',
  pin: 'M14.5 3.5l6 6-3 1-3.5 3.5.5 4-1.5 1.5-4-4-4.5 4.5-1-1L8 14.5l-4-4L5.5 9l4 .5L13 6z',
};
const Ic = ({ n, className = 'nv-sh-ic' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={G[n]} /></svg>
);
const More = () => (
  <svg className="nv-sh-ic" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: 'currentColor', stroke: 'none' }}><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
);
const Tile = ({ k, hue, sm }) => <span className={`nv-sh-tile${sm ? ' sm' : ''}`} style={{ '--t': hue }} aria-hidden="true"><Ic n={k} /></span>;
const Tag = ({ ch, dash }) => <span className={`nv-sh-tg st-${ch}${dash ? ' dash' : ''}`} aria-hidden="true">{CHAIN_NAME[ch][0]}</span>;
const StoreTile = ({ ch, logo }) => (
  <span className={`nv-sh-tile store st-${ch}`} aria-hidden="true">{logo ? <img src={logo} alt="" /> : CHAIN_NAME[ch][0]}</span>
);
const PROG = { er: 'Everyday Rewards', fb: 'Flybuys' };
const poss = (n) => (n.endsWith('s') ? `${n}'` : `${n}'s`);
// the programme mark: its real logo when the Mac has read it, else a tile in
// the brand colour holding Nova's points glyph; the name in the system face
const PMark = ({ p, lg, logo, quiet, count }) => (
  <span className={`nv-sh-pmark pg-${p}${lg ? ' lg' : ''}${quiet ? ' quiet' : ''}`}>
    <i aria-hidden="true">{logo ? <img src={logo} alt="" /> : <Ic n="pts" />}</i>
    {!lg && <span>{PROG[p]}{count != null ? <> <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count}</span></> : null}</span>}
  </span>
);
// the two kinds of points: a RATE is an orchid pill, an AMOUNT a violet numeral
const Rate = ({ m, size }) => <span className={`nv-sh-ptx${size ? ` ${size}` : ''}`}>{m}×</span>;
const Amount = ({ n, size, count }) => (
  <span className={`nv-sh-ptn${size ? ` ${size}` : ''}`}>
    {count ? <CountUp value={n} format={fmtPts} fromZero /> : <span>{fmtPts(n)}</span>}<small>pts</small>
  </span>
);
const Arrow = () => <svg className="nv-sh-arr" viewBox="0 0 24 24" aria-hidden="true"><path d={G.arr} /></svg>;

/* --------------------------------------------------------------- head -- */

function Head({ S, V }) {
  const stat = V.head.stat;
  return (
    <>
      <div className="nv-sh-bar">
        <div className="nv-sh-nav">
          <button type="button" className="nv-sh-nb circ" aria-label="Back to More" onClick={S.back}><Ic n="back" /></button>
          <button type="button" className="nv-sh-nb circ" aria-label="More for the shopping list" onClick={() => { haptic('tick'); S.openSheet({ kind: 'menu' }); }}><More /></button>
        </div>
      </div>
      <h1 className="nv-sh-ttl nv-sh-rise" style={{ '--i': 0 }}>Shopping</h1>
      {V.head.news?.length > 0 && (
        <p className="nv-sh-news nv-sh-rise" style={{ '--i': 1 }}>
          {V.head.news.map((p, k) => (p.b ? <b key={k}>{p.num != null ? <CountUp value={p.num} format={(x) => String(Math.round(x))} fromZero /> : p.b}</b> : <span key={k}>{p.text}</span>))}
        </p>
      )}
      <div className={`nv-sh-stat nv-sh-rise${stat.tone === 'bad' ? ' bad' : stat.tone === 'off' ? ' off' : ''}`} style={{ '--i': 2 }} role={stat.tone === 'bad' ? 'status' : undefined}>
        <span className="tx"><span className="dot" aria-hidden="true" />{stat.text}</span>
        {stat.retry && <button type="button" className="rt" onClick={() => S.retry(stat.retry, stat.retryName)}>Try again</button>}
        {stat.demo && <span className="nv-sh-ex">example prices</span>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- basket -- */

const RR = 44;
const CC = 2 * Math.PI * RR;
function Ring({ B }) {
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => { if (drawn) return undefined; const t = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true))); return () => cancelAnimationFrame(t); }, [drawn]);
  const GAP = B.arcs.length > 1 ? 3 : 0;
  return (
    <div className="nv-sh-ring">
      <svg viewBox="0 0 104 104" aria-hidden="true">
        {B.arcs.map((a) => {
          const len = a.share * CC;
          const seg = Math.max(0, len - GAP);
          const fill = drawn ? seg * a.got : 0;
          const off = (-a.start * CC).toFixed(2);
          return (
            <g key={a.key} style={{ '--c': a.hue }}>
              <circle className="tr" cx="52" cy="52" r={RR} strokeDasharray={`${seg.toFixed(2)} ${(CC - seg).toFixed(2)}`} strokeDashoffset={off} />
              <circle className="fl" cx="52" cy="52" r={RR} strokeDasharray={`${fill.toFixed(2)} ${(CC - fill).toFixed(2)}`} strokeDashoffset={off} />
            </g>
          );
        })}
      </svg>
      <div className="ctr">
        <span className="big"><CountUp value={B.left} format={(x) => String(Math.round(x))} fromZero /></span>
        <span className="sm">of {B.total} to get</span>
      </div>
    </div>
  );
}

function Basket({ S, V }) {
  const B = V.basket;
  return (
    <section className="nv-sum-card nv-sh-card nv-sh-basket nv-sh-rise" style={{ '--i': 3 }} aria-label={`${B.left} of ${B.total} lines to get`}>
      <div className="nv-sh-bk">
        <Ring B={B} />
        {B.noPrices ? (
          <div className="nv-sh-wb"><h3>Where to buy</h3><p>{V.noSource ? 'No prices read yet. Each line still says how many to buy.' : 'No shop has answered yet today. Each line still says how many to buy.'}</p></div>
        ) : (
          <div className="nv-sh-wb">
            <h3>Where to buy what is left</h3>
            <div className="nv-sh-split" aria-hidden="true">
              {B.split.map((s, k) => (s.na
                ? <i key={s.chain} className="na" style={{ flexGrow: 0.12, '--k': k }} />
                : <i key={s.chain} className={`st-${s.chain}`} style={{ flexGrow: s.grow, '--k': k }} />))}
            </div>
            <ul className="nv-sh-legend">
              {B.legend.map((l) => (l.ok ? (
                <li key={l.chain}><Tag ch={l.chain} /><span>{l.name} <span style={{ fontVariantNumeric: 'tabular-nums' }}>{l.n}</span></span><b><CountUp value={l.total} format={dollars} fromZero /></b></li>
              ) : (
                <li key={l.chain}><Tag ch={l.chain} dash /><span className="gap">{l.name} · {l.why}</span><span /></li>
              )))}
            </ul>
          </div>
        )}
      </div>
      {B.foot && (
        <p className="nv-sh-bfoot">
          <b><CountUp value={B.foot.split} format={dollars} fromZero /></b> for {B.foot.priced} priced line{B.foot.priced === 1 ? '' : 's'}, split as above{B.foot.best ? <>: <span className="nv-sh-sv">{money(B.foot.less)} less</span> than all at {CHAIN_NAME[B.foot.best]}.</> : '. No one shop has every line.'}
        </p>
      )}
      <div className="nv-sh-seg" role="group" aria-label="Group the list">
        <button type="button" aria-pressed={V.group === 'aisle'} onClick={() => S.setGroup('aisle')}>By aisle</button>
        <button type="button" aria-pressed={V.group === 'shop'} disabled={!V.canByShop} onClick={() => S.setGroup('shop')}>By shop</button>
      </div>
      {V.group === 'aisle' && B.chips.length > 0 && (
        <div className="nv-sh-aisles" aria-label="Go to an aisle">
          {B.chips.map((c) => (
            <button key={c.key} type="button" className="nv-sh-achip" onClick={() => S.jump(`g-${c.key}`)}>
              <Tile k={c.key} hue={c.hue} sm />{c.label} <span className="c">{c.left}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------- points this week -- */

const SrcChip = ({ c }) => <span className="nv-sh-srcc"><Ic n="mail" />{c.source === 'Email' ? 'Email' : 'Email, checked'}{c.sourceAt ? ` · ${c.sourceAt}` : ''}</span>;
const ActLabel = ({ c }) => (!c.activate ? <span className="nv-sh-act none">No activation</span> : c.activated ? <span className="nv-sh-act done">Activated, you said</span> : <span className="nv-sh-act">Activate in app</span>);

function GiftCall({ c, S, logos }) {
  return (
    <button type="button" className={`nv-sh-gcall nv-sh-tint pg-${c.programme}`} data-flip={`of-${c.id}`} onClick={() => S.openSheet({ kind: 'offer', id: c.id })}
      aria-label={`${c.prog}: ${c.mult} times points on ${c.on} at ${c.shopName}, ${fmtPts(c.pts)} points on a $100 card, ${c.daysLabel}. Details`}>
      <span className="nv-sh-gcart" aria-hidden="true"><Rate m={c.mult} size="sm" /><Tag ch={c.shop} /></span>
      <span className="nv-sh-gtx">
        <span className="k"><PMark p={c.programme} logo={logos[c.programme]} /><span className={`nv-sh-dl${c.soon ? ' soon' : ''}`}>{c.daysLabel}</span></span>
        <span className="h">{c.on[0].toUpperCase() + c.on.slice(1)}</span>
        <span className="s">A $100 card earns <Amount n={c.pts} /></span>
        <span className="nv-sh-ft"><SrcChip c={c} /><ActLabel c={c} /></span>
      </span>
      <svg className="nv-sh-chev" viewBox="0 0 24 24" aria-hidden="true"><path d={G.chev} /></svg>
    </button>
  );
}

function OfferCard({ c, S, logos }) {
  return (
    <button type="button" className={`nv-sh-ocard nv-sh-tint pg-${c.programme}`} data-flip={`of-${c.id}`} onClick={() => S.openSheet({ kind: 'offer', id: c.id })}
      aria-label={`${c.prog}: ${c.mult ? `${c.mult} times points${c.pts ? `, ${fmtPts(c.pts)} points on your list` : ''}` : `${fmtPts(c.pts)} bonus points`} on ${c.on}, ${c.daysLabel}. Details`}>
      <span className="top"><PMark p={c.programme} logo={logos[c.programme]} /><span className={`nv-sh-dl${c.soon ? ' soon' : ''}`}>{c.daysLabel}</span></span>
      <span className="fig">
        {c.mult ? <><Rate m={c.mult} size="lg" />{c.pts ? <Arrow /> : null}</> : null}
        {c.pts ? <Amount n={c.pts} size="lg" /> : <span className="nv-sh-act none">a dollar</span>}
        {c.worth ? <span className="wth">about {money(c.worth)}</span> : null}
      </span>
      <span className="on">{c.on}</span>
      <span className="why">{c.why ? c.why[0].toUpperCase() + c.why.slice(1) : ''}</span>
      <span className="nv-sh-ft"><SrcChip c={c} /><ActLabel c={c} /></span>
    </button>
  );
}

function Points({ S, V, logos }) {
  const P = V.points;
  if (!P) return null;
  return (
    <section className="nv-sh-pts nv-sh-rise" style={{ '--i': 4 }} aria-label="Points this week">
      <div className="nv-sh-sh2">
        <h2>Points this week</h2>
        <span className="nv-sh-wv"><Amount n={P.total} count />up to about {dollars(P.worth)}</span>
      </div>
      <div className="nv-sh-pmk" aria-label="Offers by programme">
        {P.progs.map((g) => <PMark key={g.p} p={g.p} quiet count={g.n} logo={logos[g.p]} />)}
      </div>
      {P.gifts.map((c) => <GiftCall key={c.id} c={c} S={S} logos={logos} />)}
      {P.cards.filter((c) => c.kind !== 'gift').length > 0 && (
        <div className="nv-sh-prail" aria-label="Points offers that match">
          {P.cards.filter((c) => c.kind !== 'gift').map((c) => <OfferCard key={c.id} c={c} S={S} logos={logos} />)}
        </div>
      )}
      {P.ended && <p className="nv-sh-ptend">{P.ended}</p>}
    </section>
  );
}

/* ---------------------------------------------------------------- rows -- */

function Meta({ r }) {
  const parts = [];
  if (r.offerCap) {
    parts.push(
      <span key="o" className={`nv-sh-pcap pg-${r.offerCap.programme}`}><i className="nv-sh-pdot" aria-hidden="true" />{r.offerCap.mult ? <Rate m={r.offerCap.mult} size="sm" /> : r.offerCap.pts ? <Amount n={r.offerCap.pts} /> : null}</span>,
    );
  }
  for (const [k, m] of r.meta.entries()) {
    parts.push(m.pin
      ? <span key={`m${k}`} className="nv-sh-pin"><svg className="nv-sh-ic" viewBox="0 0 24 24" aria-hidden="true"><path d={G.pin} /></svg>{m.pin}</span>
      : <span key={`m${k}`}>{m.b ? <b>{m.b}</b> : null}{m.b && m.text ? ' ' : ''}{m.text || ''}</span>);
  }
  if (r.saving) parts.push(<span key="s" className="nv-sh-sv">{r.saving}</span>);
  return <span className="nv-sh-meta">{parts.map((p, k) => <span key={k}>{k ? ' · ' : ''}{p}</span>)}</span>;
}

function Advice({ a }) {
  if (!a) return null;
  return (
    <span className="nv-sh-adv"><Ic n={a.tone === 'waste' ? 'clock' : 'bag'} />
      <span>{a.text}{a.save ? <span className="nv-sh-sv">{a.save}</span> : null}{a.rest || ''}{a.warn ? <span className="wt">{a.warn}</span> : null}{a.tone === 'waste' ? '.' : ''}</span>
    </span>
  );
}

function PriceCell({ r, S }) {
  const c = r.cell;
  if (c.kind === 'price') {
    return (
      <button type="button" className="nv-sh-pcell" onClick={() => S.openSheet({ kind: 'price', key: r.key })} aria-label={`${r.label}. Every way to buy it`}>
        <span className="v">{c.approx ? 'about ' : ''}{dollars(c.total)}</span>
        <span className="w">{c.chains.map((ch) => <Tag key={ch} ch={ch} />)}{c.date}</span>
      </button>
    );
  }
  return (
    <button type="button" className="nv-sh-pcell none" onClick={() => S.openSheet({ kind: 'price', key: r.key })} aria-label={`${r.label}. Details`}>
      <span className="v">{c.v}</span><span className="w">{c.w}</span>
    </button>
  );
}

function Row({ r, S, stepping, onStep, popKey }) {
  const face = (
    <div className="nv-sh-face">
      <button type="button" className="nv-sh-tick" onClick={() => S.tick(r)} aria-label={`${r.got ? 'Not got yet' : 'Got it'}: ${r.name}`} disabled={r.pending}>
        <span key={popKey} className={`nv-sh-cbox${popKey ? ' pop' : ''}`}><Ic n="check" /></span>
      </button>
      <button type="button" className="nv-sh-body" onClick={() => !r.pending && S.tick(r)} tabIndex={-1} aria-hidden="true">
        <span className="nv-sh-nm1" title={r.name}>{r.name}</span>
        <Meta r={r} />
        <Advice a={r.advice} />
      </button>
      <PriceCell r={r} S={S} />
      {stepping ? (
        <span className="nv-sh-stepper">
          <button type="button" aria-label={`One fewer ${r.name}`} onClick={() => onStep(-1)}>−</button>
          <span className="vv">{r.buy}</span>
          <button type="button" aria-label={`One more ${r.name}`} onClick={() => onStep(1)}>+</button>
        </span>
      ) : (
        <button type="button" className={`nv-sh-qty${r.buy === 1 ? ' one' : ''}`} onClick={() => onStep(0)} aria-label={`Buying ${r.buy}, change`} disabled={r.pending}>
          <span>×{r.buy}</span>
        </button>
      )}
    </div>
  );
  if (r.pending) return <div className="nv-sh-row" data-flip={`r-${r.key}`}>{face}</div>;
  return (
    <div className={`nv-sh-row${r.got ? ' got' : ''}`} data-flip={`r-${r.key}`}>
      <SwipeRow
        right={{ label: r.got ? 'Not yet' : 'Got it', icon: '✓', tone: 'var(--nv-good)', run: () => S.tick(r) }}
        left={{ label: 'Remove', icon: '✕', tone: 'var(--nv-warn)', run: () => S.remove(r) }}
        radius={0}
      >
        {face}
      </SwipeRow>
    </div>
  );
}

function Groups({ S, V }) {
  const [stepper, setStepper] = useState(null);
  const [pops, setPops] = useState({});
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const armStep = (key) => { clearTimeout(timer.current); setStepper(key); timer.current = setTimeout(() => setStepper(null), 3200); };
  const S2 = useMemo(() => ({
    ...S,
    tick: (r) => { if (!r.got) setPops((p) => ({ ...p, [r.key]: (p[r.key] || 0) + 1 })); S.tick(r); },
  }), [S]);
  const rowEl = (r) => (
    <Row key={r.key} r={r} S={S2} popKey={pops[r.key] || 0} stepping={stepper === r.key}
      onStep={(d) => { if (d === 0) { armStep(r.key); return; } armStep(r.key); S.step(r, d); }} />
  );
  return (
    <>
      {V.sorting.length > 0 && (
        <>
          <div className="nv-sh-gh"><span className="nm">Sorting into aisles</span><span className="spin" aria-hidden="true" /></div>
          <div className="nv-sum-card nv-sh-card nv-sh-rows">{V.sorting.map(rowEl)}</div>
        </>
      )}
      {V.groups.map((g) => (
        <div key={g.key} data-flip={g.key}>
          <div className="nv-sh-gh" id={`nv-sh-${g.key}`} style={{ scrollMarginTop: '110px' }}>
            {g.store ? <StoreTile ch={g.store} logo={g.logo} /> : <Tile k={g.glyph} hue={g.hue} />}
            <span className="nm">{g.label}</span>
            {g.store ? <span className="c">{dollars(g.sub)}</span>
              : g.count != null ? <span className="c">{g.count}</span>
                : <span className={`c${g.left ? '' : ' done'}`}>{g.left || '✓'}</span>}
          </div>
          <div className="nv-sum-card nv-sh-card nv-sh-rows">{g.rows.map(rowEl)}</div>
        </div>
      ))}
      {V.gotLines > 0 && (
        <button type="button" className="nv-sh-clear" data-flip="clear" onClick={S.clearGot}>Clear the {V.gotLines} you got</button>
      )}
    </>
  );
}

/* -------------------------------------------------------------- meals -- */

const SLOT_ART = {
  breakfast: ['#e8d9b8', '#6b5a3a', '#a99bff', '#e35d6a'],
  lunch: ['#3a4a2a', '#1a2414', '#e0b26a', '#5fe8a8'],
  dinner: ['#6b2a24', '#2a120f', '#e35d6a', '#e0b26a'],
};
function Meals({ S, V }) {
  if (!V.meals.length) return null;
  return (
    <section aria-label="Your meals">
      <div className="nv-sh-sh2"><h2>Your meals</h2><button type="button" className="nv-sh-nb" onClick={() => S.openSheet({ kind: 'recipes' })}>Recipes</button></div>
      <div className="nv-sh-rail">
        {V.meals.map((m) => {
          const art = SLOT_ART[m.slotKey] || ['#4a2a1a', '#1e120a', '#c08a5a', '#f2e3c6'];
          return (
            <button key={`${m.slotKey}-${m.id}`} type="button" className="nv-sum-card nv-sh-mcard" onClick={() => S.openSheet({ kind: 'dish', id: m.id })}
              style={{ '--m1': art[0], '--m2': art[1], '--m3': art[2], '--m4': art[3] }} aria-label={`${m.slot}: ${m.name}, ${m.on} of ${m.of} on the list`}>
              <span className="art" aria-hidden="true" />
              <span className="sl">{m.slot}</span>
              <span className="dn">{m.name}</span>
              <span className="cv"><span className="tk"><i style={{ transform: `scaleX(${m.of ? (m.on / m.of).toFixed(3) : 0})` }} /></span>{m.on}/{m.of}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ add bar -- */

function AddBar({ S }) {
  const ref = useRef(null);
  useEffect(() => { if (S.adding) ref.current?.focus({ preventScroll: true }); }, [S.adding]);
  if (S.adding) {
    return (
      <div className="nv-sh-addbar">
        <textarea ref={ref} aria-label="Add items, one per line" placeholder="One per line" value={S.addText} onChange={(e) => S.setAddText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') S.setAdding(false); }} onBlur={() => { if (!S.addText.trim()) S.setAdding(false); }} />
        <button type="button" className="nv-sh-plus" aria-label="Add these" onMouseDown={(e) => e.preventDefault()} onClick={S.commitAdd}><Ic n="plus" /></button>
      </div>
    );
  }
  return (
    <div className="nv-sh-addbar">
      <button type="button" className="ph" onClick={() => S.setAdding(true)}>Add items, one per line</button>
      <button type="button" className="nv-sh-plus" aria-label="Add items" onClick={() => S.setAdding(true)}><Ic n="plus" /></button>
    </div>
  );
}

/* ------------------------------------------------------------- sheets -- */

function Sheet({ label, onClose, children, tint }) {
  // close(then): the sheet leaves the way it came, then `then` runs (an
  // action that opens something else waits until the sheet has gone)
  const thenRef = useRef(null);
  const exit = useExit(() => { const t = thenRef.current; thenRef.current = null; onClose(t); });
  const closeWith = (then) => { thenRef.current = typeof then === 'function' ? then : null; exit.close(); };
  const drag = useSheetDrag(() => onClose(), { threshold: 80 });
  const panelRef = useRef(null);
  const closeRef = useRef(closeWith);
  useLayoutEffect(() => { closeRef.current = closeWith; });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const onControl = (el) => !!(el && el.closest && el.closest('button, a, input, textarea, [role="button"]'));
  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={label} onClick={() => closeWith()} className="nv-sh-scrim">
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }} tabIndex={-1}
        className={`nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-sh-sheet${tint ? ` tinted pg-${tint}` : ''}`} onClick={(e) => e.stopPropagation()}
        {...{ onPointerDown: (e) => { if (!onControl(e.target) && e.target.closest('.nv-sh-grabrow, .nv-sh-shd')) drag.handleProps.onPointerDown(e); } }}>
        <div className="nv-sh-grabrow" {...drag.handleProps} style={drag.handleProps.style}><span className="nv-sh-grab" aria-hidden="true" /></div>
        <div className="nv-sh-shbody">{children(closeWith)}</div>
      </div>
    </div>
  );
}
const XBtn = ({ close }) => <button type="button" className="nv-sh-nb circ" aria-label="Close" onClick={() => close()}><Ic n="x" /></button>;

function Parts({ parts }) {
  return parts.map((p, k) => (p.rate ? <Rate key={k} m={p.rate} size="sm" />
    : p.pts ? <Amount key={k} n={p.pts} />
      : p.sv ? <span key={k} className="nv-sh-sv">{p.sv}</span>
        : p.b ? <b key={k}>{p.b}</b> : <span key={k}>{p.text}</span>));
}

function PriceSheet({ S, V, sheetKey, onClose }) {
  const P = useMemo(() => priceSheet(V, sheetKey), [V, sheetKey]);
  if (!P) return null;
  const a = P.aisle;
  const big = typeof P.big === 'object' ? <>{P.big.n}<small> {P.big.u}</small></> : P.big;
  const stepable = P.fam === 'n' || (P.fam === 'any' && P.typed);
  return (
    <Sheet label={`${P.name}: every way to buy it`} onClose={onClose}>
      {(close) => (
        <>
          <div className="nv-sh-shd"><Tile k={a.k} hue={a.hue} /><h3>{P.name}<span className="sub">{a.label}</span></h3><XBtn close={close} /></div>
          <div className="nv-sh-needbox">
            <span className="n">{big}</span>
            <ul>{P.shares.map((s, k) => <li key={k}>{s.b ? <b>{s.b}</b> : null}{s.text}{s.rest ? (s.b ? s.rest : <b>{s.rest}</b>) : null}</li>)}</ul>
            {stepable && P.stepItem && (
              <span className="nv-sh-stepper">
                <button type="button" aria-label="Need one fewer" onClick={() => S.qty(P.stepItem, P.stepQty - 1)} disabled={P.stepQty <= 1}>−</button>
                <button type="button" aria-label="Need one more" onClick={() => S.qty(P.stepItem, P.stepQty + 1)}>+</button>
              </span>
            )}
          </div>
          <p className="nv-sh-verdict">{P.verdict}</p>
          {P.points && (
            <button type="button" className={`nv-sh-actbox pg-${P.points.programme}`} style={{ margin: '0 0 12px' }} onClick={() => S.openSheet({ kind: 'offer', id: P.points.id })}>
              <span style={{ display: 'flex', marginBottom: 7 }}><PMark p={P.points.programme} logo={S.logos[P.points.programme]} /></span>
              {P.points.mult ? <><Rate m={P.points.mult} size="sm" /> a dollar comes to </> : null}
              {P.points.pts ? <Amount n={P.points.pts} /> : 'points'} at {P.points.shopName}{P.points.worth ? `, about ${money(P.points.worth)}` : ''}. {P.points.why ? `${P.points.why[0].toUpperCase()}${P.points.why.slice(1)} ` : ''}{P.points.activate && !P.points.activated ? 'Only once you activate it in the app. ' : ''}The pick below counts cash only.
            </button>
          )}
          {P.ways.length > 0 && (
            <ul className="nv-sh-ways">
              {P.ways.map((w, k) => (w.gone ? (
                <li key={`g${k}`} className="gone"><Tag ch={w.chain} dash /><span className="wl">{CHAIN_NAME[w.chain]}</span><span className="wt">·</span><span className="ws">{w.label}</span></li>
              ) : (
                <li key={k} className={w.pick ? 'pick' : ''}>
                  <Tag ch={w.chain} />
                  <span className="wl">{w.label}</span>
                  <span className="wt">{w.approx ? 'about ' : ''}{dollars(w.total)}</span>
                  <span className="ws">
                    {[w.spare, w.perKg, w.special ? `${w.special}${w.was ? `, was ${dollars(w.was)}` : ''}` : null].filter(Boolean).join(' · ')}
                    {w.keeps ? <> · <span className={w.perishable ? 'p' : ''}>{w.keeps}</span></> : null}
                    {w.pick ? <> · <b style={{ color: 'var(--nv-good)' }}>the pick</b></> : null}
                  </span>
                </li>
              )))}
            </ul>
          )}
          {P.foot && <p className="nv-sh-sfoot">{P.foot}</p>}
          <div className="nv-sh-sacts">
            {P.pin
              ? <button type="button" className="nv-sh-pillb" onClick={() => S.pin(P.key, null, `Unpinned ${P.pin.name}`)}>Unpin</button>
              : P.pick && <button type="button" className="nv-sh-pillb" onClick={() => S.pin(P.key, P.pick, `Pinned ${P.pick.name}`)}>Pin the one I buy</button>}
            {P.dish && <button type="button" className="nv-sh-pillb" onClick={() => S.openSheet({ kind: 'dish', name: P.dish })}>Open {P.dish}</button>}
          </div>
          {!P.pin && P.pick && <p className="nv-sh-sfoot">Pinning keeps {P.pick.name} at {CHAIN_NAME[P.pick.chain]} as the one Nova prices for this line.</p>}
        </>
      )}
    </Sheet>
  );
}

function OfferSheet({ S, V, id, onClose }) {
  const c = V._cards.get(id);
  const facts = useMemo(() => offerFacts(c), [c]);
  if (!c) return null;
  const onWhat = c.kind === 'gift' ? 'on a $100 card' : c.lineName && c.spend != null ? `for your ${dollars(c.spend)} of ${c.lineName}` : `on ${c.on}`;
  const kindWord = c.kind === 'gift' ? 'gift cards' : c.personal ? 'personalised to you' : 'open to every member';
  return (
    <Sheet label={`${c.prog} offer: ${c.on}`} onClose={onClose} tint={c.programme}>
      {(close) => (
        <>
          <div className="nv-sh-shd"><PMark p={c.programme} lg logo={S.logos[c.programme]} /><h3>{c.prog}<span className="sub"><Tag ch={c.shop} /> {c.shopName} · {kindWord}</span></h3><XBtn close={close} /></div>
          {c.mult ? (
            <>
              <div className="nv-sh-ofig"><Rate m={c.mult} size="xl" /><span className="lab">points a dollar</span></div>
              <p className="nv-sh-oon">on {c.on}</p>
              {c.pts ? <div className="nv-sh-ofig"><Arrow /><Amount n={c.pts} size="xl" count /><span className="lab">{onWhat}</span></div> : null}
            </>
          ) : (
            <>
              <div className="nv-sh-ofig"><Amount n={c.pts} size="xl" count /><span className="lab">{c.kind === 'shop' ? 'points' : 'bonus points'}</span></div>
              <p className="nv-sh-oon">on {c.on}</p>
            </>
          )}
          {!c.activate ? (
            <div className="nv-sh-actbox free"><b>No activation needed.</b> Scan your {c.prog} card at the till.</div>
          ) : c.activated ? (
            <div className="nv-sh-actbox done"><b>Activated, you said.</b> Nova takes your word for it and cannot check your account.
              <div className="nv-sh-sacts"><button type="button" className="nv-sh-pillb" onClick={() => S.mark(c.id, { activated: false }, 'Marked not activated')}>Not yet, after all</button></div>
            </div>
          ) : (
            <div className={`nv-sh-actbox pg-${c.programme}`}><b>Activate it in the {c.programme === 'er' ? 'Everyday Rewards app' : 'Flybuys app'}</b> before you shop{c.programme === 'er' ? ', at least two hours ahead' : ''}. Nova cannot see the offers in your account or press {c.programme === 'er' ? 'Boost' : 'Activate'} for you.
              <div className="nv-sh-sacts">
                <button type="button" className="nv-sh-pillb pg" onClick={() => S.openApp(c.programme)}>Open {c.prog}</button>
                <button type="button" className="nv-sh-pillb" onClick={() => S.mark(c.id, { activated: true }, 'Marked activated, on your word')}>✓ I activated it</button>
              </div>
            </div>
          )}
          <ul className="nv-sh-ofacts">
            {facts.map((f, k) => <li key={k}><Ic n={f.g} /><span><Parts parts={f.main} /><span className="k">{f.k}</span></span></li>)}
          </ul>
          <div className="nv-sh-sacts">
            {c.kind === 'gift' && <button type="button" className="nv-sh-pillb good" onClick={() => close(() => S.add(['food delivery gift card'], 'a points offer'))}>Add a $100 card to the list</button>}
            <button type="button" className="nv-sh-pillb" onClick={() => close(() => S.mark(c.id, { dismissed: true }, 'Hidden: not for you this time'))}>Not for me</button>
          </div>
          <p className="nv-sh-sfoot">{S.demo ? 'An invented example offer. ' : ''}Code checked its programme, points, end date and source before it could show. {S.logos[c.programme] ? `The mark is ${poss(c.prog)} own icon, read once from its site.` : `The mark is drawn from ${poss(c.prog)} colour and name; its logo has not been read yet.`}</p>
        </>
      )}
    </Sheet>
  );
}

function SourcesSheet({ S, V, onClose }) {
  const src = V.offersSource || {};
  const last = src.lastAt ? new Date(src.lastAt).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <Sheet label="Where offers come from" onClose={onClose}>
      {(close) => (
        <>
          <div className="nv-sh-shd"><Tile k="pts" hue="var(--sh-pt)" /><h3>Where offers come from<span className="sub">Points this week</span></h3><XBtn close={close} /></div>
          <div className="nv-sh-pmk" style={{ margin: '0 2px 12px' }}><PMark p="er" logo={S.logos.er} /><PMark p="fb" logo={S.logos.fb} /></div>
          <ul className="nv-sh-ofacts">
            <li><Ic n="mail" /><span>Your emails<span className="k">{src.setUp ? `Everyday Rewards and Flybuys emails, saved into ${src.dir || 'Inbox/Rewards Mail'} by the Mail rule on your Mac. ${src.files} read${last ? `, the last ${last}` : ''}.${V.unmatched ? ` ${V.unmatched} more ${V.unmatched === 1 ? 'offer does' : 'offers do'} not match your list.` : ''}` : 'Not set up yet. A Mail rule on your Mac would pass these on: docs/rewards-mail-rule.md has the steps.'}</span></span></li>
            <li><Ic n="phone" /><span>Shared from the apps<span className="k">Not built yet: Send to Nova takes text and links, not screenshots.</span></span></li>
            <li><Ic n="news" /><span>The catalogue<span className="k">Not read. Gift-card weeks reach Nova when a rewards email names them.</span></span></li>
          </ul>
          <div className="nv-sh-actbox free"><b>What Nova cannot do.</b> See the offers inside your accounts, press Boost or Activate, read the apps' notifications, or see your points balance. It never signs in to either programme.</div>
          <p className="nv-sh-sfoot">{!src.setUp ? 'No email has arrived, so Points this week does not show.' : V.points ? 'Offers leave the morning after they end.' : 'Emails are read and nothing matched this week, so Points this week is not shown.'}</p>
        </>
      )}
    </Sheet>
  );
}

function DishSheet({ S, V, id, name, onClose }) {
  const m = V.meals.find((x) => x.id === id || x.name === name);
  return (
    <Sheet label={m ? m.name : 'Dish'} onClose={onClose}>
      {(close) => (m ? (
        <>
          <div className="nv-sh-shd"><h3>{m.name}<span className="sub">{m.slot} · in your rotation</span></h3><XBtn close={close} /></div>
          <ul className="nv-sh-ingl">
            {m.ing.map((i, k) => <li key={k}><Tile k={i.aisle.k} hue={i.aisle.hue} sm /><span>{i.amount ? <b style={{ fontWeight: 600 }}>{i.amount} </b> : null}{i.name}</span>{i.on ? <span className="ok">On the list</span> : <span className="no">Missing</span>}</li>)}
          </ul>
          <div className="nv-sh-sacts">
            {m.ing.some((i) => !i.on)
              ? <button type="button" className="nv-sh-pillb good" onClick={() => close(() => S.add(m.ing.filter((i) => !i.on).map((i) => i.raw), m.name))}>Add the {m.ing.filter((i) => !i.on).length} missing</button>
              : <span style={{ fontSize: 15, color: 'var(--nv-ink60)' }}>Everything for this dish is on the list.</span>}
          </div>
        </>
      ) : (
        <><div className="nv-sh-shd"><h3>{name || 'That dish'}<span className="sub">Not in this week's rotation</span></h3><XBtn close={close} /></div><p className="nv-sh-sfoot">Open it from Fuel's recipes.</p></>
      ))}
    </Sheet>
  );
}

function RecipesSheet({ S, V, onClose }) {
  return (
    <Sheet label="Recipes" onClose={onClose}>
      {(close) => (
        <>
          <div className="nv-sh-shd"><h3>Recipes</h3><XBtn close={close} /></div>
          <ul className="nv-sh-mlist">
            {V.meals.map((m) => <li key={`${m.slotKey}-${m.id}`}><button type="button" onClick={() => S.openSheet({ kind: 'dish', id: m.id })}><Tile k="kit" hue="var(--nv-or)" sm />{m.name}</button></li>)}
            <li><button type="button" onClick={() => close(S.openFuel)}><Tile k="list" hue="var(--nv-m-back)" sm />Every recipe, in Fuel</button></li>
          </ul>
        </>
      )}
    </Sheet>
  );
}

function MenuSheet({ S, V, onClose }) {
  const [armed, setArmed] = useState(false);
  const missing = V.meals.flatMap((m) => m.ing.filter((i) => !i.on).map((i) => ({ raw: i.raw, from: m.name })));
  return (
    <Sheet label="Shopping list" onClose={onClose}>
      {(close) => (
        <>
          <div className="nv-sh-shd"><h3>Shopping list</h3><XBtn close={close} /></div>
          {armed ? (
            <div className="nv-sh-menuarm">Clear the whole list, ticked or not? Undo brings back every line.
              <div className="nv-sh-sacts"><button type="button" className="nv-sh-pillb warn" onClick={() => close(S.clearAll)}>Clear it</button><button type="button" className="nv-sh-pillb" onClick={() => setArmed(false)}>Keep</button></div>
            </div>
          ) : (
            <ul className="nv-sh-mlist">
              <li><button type="button" disabled={!missing.length} onClick={() => close(() => S.addWeek(missing))}><Tile k="list" hue="var(--nv-m-back)" sm />{missing.length ? `Add the week's ${missing.length} missing line${missing.length === 1 ? '' : 's'}` : 'The week is all on the list'}</button></li>
              <li><button type="button" onClick={() => S.openSheet({ kind: 'recipes' })}><Tile k="pa" hue="var(--nv-or)" sm />Recipes</button></li>
              <li><button type="button" onClick={() => S.openSheet({ kind: 'sources' })}><Tile k="pts" hue="var(--sh-pt)" sm />Where offers come from</button></li>
              <li><button type="button" className="warn" disabled={!V.groups.length} onClick={() => setArmed(true)}><Tile k="trash" hue="var(--nv-m-chest)" sm />Clear everything…</button></li>
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ----------------------------------------------------------- skeleton -- */

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Reading your list">
      <div className="nv-sh-gh"><span className="nm" style={{ color: 'var(--nv-ink60)' }}>Produce</span></div>
      <div className="nv-sum-card nv-sh-card">
        {[0, 1, 2, 3].map((k) => <div key={k} className="nv-sh-skel"><i /><i style={{ width: '46%' }} /><i style={{ width: '18%', marginLeft: 'auto' }} /></div>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the page -- */

export function ShoppingSummary({ v }) {
  const S = v.shopSum;
  const V = S.view;
  const rootRef = useRef(null);
  const listRef = useRef(null);

  // prices and offers on arrival, and again while reads are still arriving
  const load = S.load;
  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, [load]);
  // a dev hook for the Wednesday turn in demo (the mockup's moment)
  useEffect(() => {
    if (!S.demo || !import.meta.env?.DEV) return undefined;
    window.__shopTurn = S.turn;
    return () => { delete window.__shopTurn; };
  }, [S.demo, S.turn]);

  // FLIP: rows and groups find their place on every change of the list
  const flipKey = V.state === 'list'
    ? `${V.group}|${V.groups.map((g) => `${g.key}:${g.rows.map((r) => `${r.key}${r.got ? '+' : ''}`).join(',')}`).join('/')}|${V.sorting.map((r) => r.key).join(',')}|${V.gotLines}`
    : V.state;
  useFlipList(listRef, flipKey);
  const offersKey = V.points ? V.points.cards.map((c) => c.id).join(',') + V.points.gifts.map((c) => c.id).join(',') : '';
  const ptsRef = useRef(null);
  useFlipList(ptsRef, offersKey);

  let body;
  if (V.state === 'loading' || V.state === 'offline-empty') body = V.state === 'loading' ? <Skeleton /> : null;
  else if (V.state === 'empty') {
    body = (
      <>
        <p className="nv-sh-empty nv-sh-rise" style={{ '--i': 3 }}>Add what you need below, or shop from one of your meals.</p>
        <Meals S={S} V={V} />
      </>
    );
  } else {
    body = (
      <>
        <Basket S={S} V={V} />
        <div ref={ptsRef}><Points S={S} V={V} logos={S.logos} /></div>
        <div ref={listRef} className="nv-sh-rise" style={{ '--i': 5 }}><Groups S={S} V={V} /></div>
        <Meals S={S} V={V} />
      </>
    );
  }

  const sh = S.sheet;
  return (
    <div ref={rootRef} className="nv-sh" style={v.wrapShopping} data-screen-label="Shopping">
      <Head S={S} V={V} />
      {body}
      <div className="nv-sh-pad" aria-hidden="true" />
      {V.state !== 'offline-empty' && <AddBar S={S} />}
      {sh?.kind === 'price' && V._lines && <PriceSheet S={S} V={V} sheetKey={sh.key} onClose={S.closeSheet} />}
      {sh?.kind === 'offer' && V._cards && <OfferSheet S={S} V={V} id={sh.id} onClose={S.closeSheet} />}
      {sh?.kind === 'sources' && <SourcesSheet S={S} V={V} onClose={S.closeSheet} />}
      {sh?.kind === 'dish' && V.meals && <DishSheet S={S} V={V} id={sh.id} name={sh.name} onClose={S.closeSheet} />}
      {sh?.kind === 'recipes' && V.meals && <RecipesSheet S={S} V={V} onClose={S.closeSheet} />}
      {sh?.kind === 'menu' && <MenuSheet S={S} V={V.groups ? V : { ...V, meals: [], groups: [] }} onClose={S.closeSheet} />}
    </div>
  );
}
