import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CountUp } from '../CountUp.jsx';
import { useFlipList } from '../useFlipList.js';
import { useSheetDrag } from '../useSheetDrag.js';
import { useExit } from '../useExit.js';
import { SwipeRow } from '../SwipeRow.jsx';
import { haptic } from '../haptics.js';
import { SIcon, Tile } from '../StashIcon.jsx';
import { StashArt } from '../StashArt.jsx';
import { isLink, shortLink } from '../stashUrl.js';
import '../stash.css';

// THE SUMMARY STASH (10 Oct 2026). Mockup 84's Stash tab ("Instruments",
// his words 7 Oct: "Instruments also looks good for the stash"), refined by
// mockup 88 (shelf tiles and hues, the due check answered in place, the
// clipboard offer, press and hold, days left as a number) and mockup 90 (the
// Reader, the sort, the share sheet), plus the five additions he approved on
// 10 Oct: a price watch, gift lists per person, a Bought history the rhythm
// learns from, the Stash as a source for Ask Nova, and one link, one place.
//
// Everything drawn is v.stashSum.view (src/stashModel.js, by code); every
// action is a door in src/stashActions.js that writes through the rails with
// a pill and Undo. Nothing here adds a number up or writes a sentence.

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------ pictures ---------------------------------- */

// a picture is asked of the Mac only once its card is near the screen (a
// shelf of 300 asks for the few he can see), and once per session
const blobs = new Map(); // file -> Promise<objectURL|null>
function usePicture(S, file, ref) {
  const [url, setUrl] = useState(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!file || near) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') { setNear(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [file, near, ref]);
  useEffect(() => {
    if (!file || !near) return undefined;
    let live = true;
    if (!blobs.has(file)) blobs.set(file, S.imageUrl(file).catch(() => null));
    blobs.get(file).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [S, file, near]);
  return url;
}

// the page's own picture, the demo's drawn one, or the shelf's monogram
function Picture({ S, card, className = 'nv-st-pic' }) {
  const ref = useRef(null);
  const url = usePicture(S, card.image, ref);
  const [broken, setBroken] = useState(false);
  if (url && !broken) return <span ref={ref} className={className}><img src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} /></span>;
  if (card.demoArt) return <span ref={ref} className={className}><StashArt kind={card.demoArt} /></span>;
  const letter = [...String(card.name || card.host || '?').trim()][0] || '?';
  return (
    <span ref={ref} className={`${className} mono`} style={{ '--t': card.hue || 'var(--nv-m-back)' }} aria-hidden="true">
      <b>{letter.toUpperCase()}</b>
      {className === 'nv-st-pic' && <small>{card.host}</small>}
    </span>
  );
}

/* ------------------------------ the head ---------------------------------- */

const Parts = ({ parts }) => parts.map((p, k) => (
  p.num != null ? <b key={k} className="num" style={p.hue ? { color: p.hue } : undefined}><CountUp value={p.num} fromZero format={(n) => String(Math.round(n))} /></b>
    : p.hue ? <span key={k} style={{ color: p.hue }}>{p.text}</span>
      : p.b ? <b key={k}>{p.text}</b>
        : <span key={k}>{p.text}</span>
));

function Top({ S, V }) {
  const editing = S.ui.edit;
  return (
    <>
      <header className="nv-st-top nv-sum-rise" style={{ '--i': 0 }}>
        <h1>Stash</h1>
        {V.state === 'ready' && !S.readOnly && (
          <button type="button" className="nv-st-nb" aria-pressed={editing} onClick={() => { haptic('tick'); S.toggleEdit(); }}>{editing ? 'Done' : 'Edit'}</button>
        )}
      </header>
      {V.news?.length > 0 && <p className="nv-st-news nv-sum-rise" style={{ '--i': 1 }}><Parts parts={V.news} /></p>}
      {V.status && <div className="nv-st-stat nv-sum-rise" style={{ '--i': 1 }}><span className={`nv-st-dot${V.offline ? ' off' : ''}`} aria-hidden="true" /><span>{V.status}</span></div>}
    </>
  );
}

/* ------------------------- the due check, in place ------------------------ */

function DueCard({ S, V }) {
  const d = V.due;
  const [leaving, setLeaving] = useState(null);
  const answer = (a) => {
    if (S.readOnly || leaving) return;
    haptic(a === 'low' ? 'commit' : 'tick');
    setLeaving(a);
    setTimeout(() => { S.answer(d.raw, a); setLeaving(null); }, reduced() ? 0 : 200);
  };
  return (
    <section className={`nv-sum-card nv-st-due nv-sum-rise${leaving ? ' leaving' : ''}`} style={{ '--i': 2 }} aria-label={`Check the level: ${d.name}`}>
      <div className="nv-st-due-top">
        <Picture S={S} card={d} className="nv-st-thumb" />
        <span className="nv-st-due-w">
          <span className="lb">Check the level{V.dueCount > 1 ? ` · 1 of ${V.dueCount}` : ''}</span>
          <span className="nm">{d.name}</span>
          <span className="sub">{d.words}</span>
        </span>
      </div>
      <div className="nv-st-acts">
        <button type="button" className="nv-st-pillb" disabled={S.readOnly} onClick={() => answer('plenty')}>Plenty left</button>
        <button type="button" className="nv-st-pillb gold" disabled={S.readOnly} onClick={() => answer('low')}>Getting low</button>
        <button type="button" className="nv-st-pillb" disabled={S.readOnly} onClick={() => answer('reordered')}>Reordered</button>
      </div>
    </section>
  );
}

/* ------------------------------ running down ------------------------------ */

function Vials({ S, V }) {
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => { if (drawn) return undefined; const t = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true))); return () => cancelAnimationFrame(t); }, [drawn]);
  return (
    <section className="nv-sum-card nv-st-vialcard nv-sum-rise" style={{ '--i': 3 }} aria-label="Running down, counted in days">
      <div className="nv-st-ih"><span>Running down</span><span>counted in days</span></div>
      <div className="nv-st-vials">
        {V.vials.map((x) => (
          <button key={x.key} type="button" className={`nv-st-vial${x.due ? ' due' : ''}`} style={{ '--t': x.hue }}
            aria-label={`${x.full}: about ${x.left} ${x.left === 1 ? 'day' : 'days'} left by the calendar${x.due ? ', check the level now' : ''}`}
            onClick={(e) => { haptic('tick'); S.openMenu(x.raw, e.currentTarget.getBoundingClientRect()); }}>
            <span className="tube" aria-hidden="true">
              <span className="fill" style={{ transform: `scaleY(${drawn ? Math.max(0.02, x.level) : 0})` }} />
              <span className="line" style={{ bottom: `${(x.checkFrac * 100).toFixed(1)}%` }} />
            </span>
            <span className="d num"><CountUp value={x.left} fromZero format={(n) => String(Math.round(n))} /><small> d</small></span>
            <span className="nmv">{x.name}</span>
          </button>
        ))}
      </div>
      {V.vialsMore > 0 && (
        <button type="button" className="nv-st-vmore" onClick={() => { haptic('tick'); S.setSort('days'); S.setShelf('all'); }}>
          {V.vialsMore} more, soonest first in Days left
        </button>
      )}
      <p className="nv-st-foot">Days left, counted from when you bought each one. The dashed line is a week before empty.</p>
    </section>
  );
}

/* ------------------------------ the shelf bar ----------------------------- */

function ShelfBar({ S, V }) {
  const sortRef = useRef(null);
  return (
    <div className="nv-st-bar" role="group" aria-label="Shelves">
      <div className="nv-st-bar-in">
        <div className="nv-st-chips">
          {V.chips.map((c) => (
            <button key={c.key} type="button" className="nv-st-chip" aria-pressed={(S.ui.shelfOn || 'all') === c.key}
              onClick={() => { haptic('tick'); S.setShelf(c.key); }}>
              {c.glyph && <Tile glyph={c.glyph} hue={c.hue} sm />}
              <span className="lbl">{c.label}</span> <span className="c num">{c.count}</span>
            </button>
          ))}
        </div>
        <button ref={sortRef} type="button" className="nv-st-sortb" aria-haspopup="menu" aria-expanded={!!S.ui.sortOpen} aria-label={`Sort: ${V.sortLabel}. Change`}
          onClick={() => { haptic('tick'); S.toggleSort(); }}>
          <SIcon n="sort" /><span>{V.sortLabel}</span>
        </button>
        <button type="button" className="nv-st-srch" aria-label="Search the Stash" aria-pressed={!!S.ui.search} onClick={() => S.toggleSearch()}>
          <SIcon n="search" />
        </button>
      </div>
      {S.ui.search && (
        <div className="nv-st-sfield">
          <input type="search" autoFocus placeholder="Search names, sites and notes" value={S.ui.q} onChange={(e) => S.setQuery(e.target.value)} aria-label="Search the Stash" autoCapitalize="none" autoCorrect="off" />
          <button type="button" onClick={() => S.toggleSearch()}>Cancel</button>
        </div>
      )}
      {S.ui.sortOpen && <SortMenu S={S} V={V} anchor={sortRef} />}
    </div>
  );
}

function SortMenu({ S, V, anchor }) {
  const ref = useRef(null);
  useEffect(() => {
    const off = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) S.toggleSort(false); };
    const key = (e) => { if (e.key === 'Escape') S.toggleSort(false); };
    document.addEventListener('pointerdown', off, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', key); };
  }, [S, anchor]);
  return (
    <div ref={ref} className="nv-st-smenu" role="menu" aria-label="Sort shelves by">
      {S.sorts.map((s) => (
        <button key={s.key} type="button" role="menuitemradio" aria-checked={V.sort === s.key} className="nv-st-smi"
          onClick={() => { haptic('tick'); S.setSort(s.key); }}>
          <SIcon n="check" className="nv-st-ic ck" />
          <span>{s.label}<small>{s.sub}</small></span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ press and hold ---------------------------- */

function usePressHold(onHold, ms = 450) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const stop = () => { clearTimeout(timer.current); start.current = null; };
  return {
    onPointerDown: (e) => {
      if (e.button > 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      const el = e.currentTarget;
      timer.current = setTimeout(() => { fired.current = true; start.current = null; onHold(el); }, ms);
    },
    onPointerMove: (e) => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) stop(); },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onContextMenu: (e) => { e.preventDefault(); if (!fired.current) { fired.current = true; onHold(e.currentTarget); } },
    onClickCapture: (e) => { if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; } },
  };
}

/* ------------------------------ cards and rows ---------------------------- */

function Badge({ b, hue }) {
  if (!b) return null;
  return <span className={`nv-st-bdg ${b.tone}`} style={{ '--t': hue }}><i aria-hidden="true" />{b.text}</span>;
}

// A CARD RE-RENDERS ONLY WHEN WHAT IT SHOWS CHANGES (break-ui, 10 Oct: a
// sort of 300 cards spent 158 ms in one frame re-rendering every one). The
// doors arrive through a ref that always holds the latest view model.
const sameCard = (a, b) => a.lifted === b.lifted && a.flash === b.flash && a.edit === b.edit && a.c.raw === b.c.raw
  && a.c.sub === b.c.sub && a.c.subLit === b.c.subLit && a.c.image === b.c.image && a.c.demoArt === b.c.demoArt && a.c.hue === b.c.hue
  && a.c.isNew === b.c.isNew && a.c.badge?.text === b.c.badge?.text && a.c.badge?.tone === b.c.badge?.tone
  && a.c.read === b.c.read && a.c.minutes === b.c.minutes && !!a.c.place === !!b.c.place;

const Card = memo(function Card({ sr, c, lifted, flash, edit }) {
  const S = sr.current;
  const hold = usePressHold((el) => { haptic('commit'); S.openMenu(c.raw, el.getBoundingClientRect()); });
  return (
    <div className={`nv-sum-card nv-st-card${lifted ? ' lift' : ''}${flash ? ' flash' : ''}${c.isNew ? ' fresh' : ''}`} data-flip={c.key} data-stash-key={c.key} style={{ '--t': c.hue }}>
      {edit && (
        <button type="button" className="nv-st-rm" aria-label={`Remove ${c.name}`} onClick={() => { haptic('commit'); sr.current.remove(c.raw); }}><i><SIcon n="minus" /></i></button>
      )}
      <button type="button" className="nv-st-open" {...hold} aria-haspopup="menu"
        aria-label={`${c.name}, opens ${c.host}${c.badge ? `. ${c.badge.text}` : ''}. Press and hold for more`}
        onClick={() => { if (!edit) sr.current.open(c); }}>
        <span className="nv-st-imgw">
          <Picture S={S} card={c} />
          <Badge b={c.badge} hue={c.hue} />
        </span>
        <span className="nv-st-cap">
          <span className="nm">{c.name}</span>
          <span className={`hs${c.subLit ? ' lit' : ''}`}>{c.sub}</span>
        </span>
      </button>
    </div>
  );
}, sameCard);

const ReadRow = memo(function ReadRow({ sr, c, lifted, flash, edit }) {
  const S = sr.current;
  const hold = usePressHold((el) => { haptic('commit'); S.openMenu(c.raw, el.getBoundingClientRect()); });
  return (
    <div className={`nv-st-row${lifted ? ' lift' : ''}${flash ? ' flash' : ''}`} data-flip={c.key} data-stash-key={c.key}>
      <SwipeRow radius={0} left={{ label: 'Remove', icon: <SIcon n="trash" />, run: () => sr.current.remove(c.raw), collapse: true }}>
        <div className="nv-st-rowin">
          {edit && <button type="button" className="nv-st-rm inline" aria-label={`Remove ${c.name}`} onClick={() => sr.current.remove(c.raw)}><i><SIcon n="minus" /></i></button>}
          <button type="button" className="nv-st-rowopen" {...hold} aria-haspopup="menu"
            aria-label={`${c.name}, ${c.host}${c.minutes ? `, ${c.minutes} minutes` : ''}. Opens to read in Nova. Press and hold for more`}
            onClick={() => { if (!edit) sr.current.openReader(c); }}>
            <Picture S={S} card={c} className="nv-st-tn" />
            <span className="nv-st-rowtx">
              <span className="tt">{c.name}{c.read && <span className="nv-st-read"> · read</span>}</span>
              <span className="mt">{c.subLit ? c.sub : c.host}{c.minutes ? ` · ${c.minutes} min` : ''}{c.note && !c.subLit ? ` · ${c.note}` : ''}</span>
            </span>
            {c.place && !c.read && <SIcon n="book" className="nv-st-ic nv-st-rowmark" />}
          </button>
        </div>
      </SwipeRow>
    </div>
  );
}, sameCard);

function ShelfHead({ S, s }) {
  return (
    <div className="nv-st-gh">
      <Tile glyph={s.glyph} hue={s.hue} />
      <span className="nm">{s.name}</span>
      {s.gift ? (
        <button type="button" className={`nv-st-gdate${s.dateSoon ? ' soon' : ''}`} disabled={S.readOnly}
          aria-label={s.date ? `${s.name}: ${s.dateWords}. Change the date` : `${s.name}: no date. Add one`}
          onClick={() => S.openSheet({ kind: 'gift', name: s.name, date: s.date })}>
          {s.dateWords || 'Add a date'}
        </button>
      ) : <span className="c num">{s.count}</span>}
    </div>
  );
}

function Shelves({ S, V }) {
  const rootRef = useRef(null);
  const sr = useRef(S);
  useLayoutEffect(() => { sr.current = S; });
  const sig = V.shelves.map((s) => `${s.name}:${s.cards.map((c) => c.key).join(',')}`).join('|') + (V.bought ? `|B:${V.bought.rows.length}` : '');
  useFlipList(rootRef, sig);
  const lifted = S.ui.menu?.raw;
  return (
    <div ref={rootRef} className="nv-st-shelves">
      {V.shelves.map((s) => (
        <section key={s.name} aria-label={s.name} className="nv-st-shelf">
          <ShelfHead S={S} s={s} />
          {!s.cards.length ? (
            <p className="nv-st-shelfempty">{s.gift ? 'No ideas yet. Paste a link and pick this shelf.' : 'Empty.'}</p>
          ) : s.rows ? (
            <div className="nv-sum-card nv-st-list">
              {s.cards.map((c) => <ReadRow key={c.key} sr={sr} c={c} edit={!!S.ui.edit} lifted={lifted === c.raw} flash={S.ui.flash === c.key} />)}
            </div>
          ) : (
            <div className="nv-st-grid">
              {s.cards.map((c) => <Card key={c.key} sr={sr} c={c} edit={!!S.ui.edit} lifted={lifted === c.raw} flash={S.ui.flash === c.key} />)}
            </div>
          )}
        </section>
      ))}
      {V.bought && V.bought.rows.length > 0 && (
        <section aria-label="Bought" className="nv-st-shelf">
          <div className="nv-st-gh"><Tile glyph="bag" hue={V.bought.hue} /><span className="nm">Bought</span><span className="c num">{V.bought.count}</span></div>
          <div className="nv-sum-card nv-st-list">
            {V.bought.rows.map((r) => (
              <div key={r.raw} className="nv-st-row" data-flip={`b:${r.raw}`}>
                <SwipeRow radius={0} left={{ label: 'Remove', icon: <SIcon n="trash" />, run: () => S.remove(r.raw), collapse: true }}>
                  <div className="nv-st-rowin">
                    <button type="button" className="nv-st-rowopen" onClick={() => S.open(r)} aria-label={`${r.name}. ${r.sub}. Opens ${r.host}`}>
                      <Picture S={S} card={{ ...r, hue: V.bought.hue }} className="nv-st-tn" />
                      <span className="nv-st-rowtx"><span className="tt">{r.name}</span><span className="mt">{r.sub}</span></span>
                    </button>
                  </div>
                </SwipeRow>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------ the menu ---------------------------------- */

const findCard = (V, raw) => V.byRaw?.[raw] || (V.due?.raw === raw ? V.due : null);

function Menu({ S, V }) {
  const m = S.ui.menu;
  const c = findCard(V, m.raw);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !m.rect) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const left = Math.min(vw - w - 16, Math.max(16, m.rect.left));
    let top = m.rect.bottom + 10;
    let origin = 'top';
    if (top + h > vh - 100) { top = Math.max(16, m.rect.top - h - 10); origin = 'bottom'; }
    setPos({ left, top, origin, ox: Math.min(w - 20, Math.max(20, m.rect.left + m.rect.width / 2 - left)) });
  }, [m]);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') S.closeMenu(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [S]);
  if (!c) return null;
  const run = (fn) => () => { haptic('tick'); S.closeMenu(); fn(); };
  const ro = S.readOnly;
  const rows = [];
  const reading = c.article || S.view.shelves.find((s) => s.name === c.shelf)?.rows;
  // a card's tap already opens its page; a reading row's opens the Reader
  if (reading) rows.push(['Open the original', 'open', run(() => S.open(c))]);
  if (!ro) {
    rows.push([c.onList ? 'On your shopping list' : 'Add to shopping list', 'list', c.onList ? null : run(() => S.toList(c.raw))]);
    rows.push([c.lasts ? `Restock every ${c.lasts} weeks` : 'Restock reminder', 'clock', run(() => S.openSheet({ kind: 'rhythm', raw: c.raw }))]);
    rows.push(['Mark bought', 'bag', run(() => S.openSheet({ kind: 'bought', raw: c.raw }))]);
    rows.push([c.watch ? 'Stop watching the price' : 'Watch the price', 'price', run(() => S.watch(c.raw, !c.watch))]);
    rows.push(['Move to a shelf', 'move', run(() => S.openSheet({ kind: 'move', raw: c.raw }))]);
    if (c.article) rows.push([c.read ? 'Mark unread' : 'Mark finished', 'check', run(() => S.finish(c.raw, !c.read))]);
  }
  rows.push(['Share link', 'share', run(() => S.share(c))]);
  if (!ro) rows.push(['Remove', 'trash', run(() => S.remove(c.raw)), 'warn']);
  return (
    <>
      <div className="nv-st-ctxscrim" onClick={() => S.closeMenu()} aria-hidden="true" />
      <div ref={ref} className={`nv-st-ctx${pos ? ' on' : ''}`} role="menu" aria-label={`${c.name}: more`}
        style={pos ? { left: pos.left, top: pos.top, transformOrigin: `${pos.ox}px ${pos.origin === 'top' ? '0' : '100%'}` } : { left: -9999, top: 0 }}>
        {c.watch && c.priceWords && <p className="nv-st-ctxnote">{c.priceWords}</p>}
        {rows.map(([label, ic, fn, tone]) => (
          <button key={label} type="button" role="menuitem" className={tone || ''} disabled={!fn} onClick={fn || undefined}>
            <span>{label}</span><SIcon n={ic} />
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------------ sheets ------------------------------------ */

function Sheet({ label, onClose, title, children }) {
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
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={label} onClick={exit.close} className="nv-st-scrim">
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }} tabIndex={-1}
        className="nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-st-sheet" onClick={(e) => e.stopPropagation()}>
        <div {...drag.handleProps} onPointerDown={(e) => { if (!onControl(e.target)) drag.handleProps.onPointerDown(e); }} className="nv-st-shtop" style={drag.handleProps.style}>
          <span className="nv-st-grab" aria-hidden="true" />
          <b>{title}</b>
          <button type="button" className="nv-st-q" onClick={exit.close} aria-label="Close"><SIcon n="x" /></button>
        </div>
        <div className="nv-st-shbody">{children(exit.close)}</div>
      </div>
    </div>
  );
}

function RhythmSheet({ S, V, c }) {
  const r = c.rhythm;
  return (
    <Sheet label={`${c.name}: restock rhythm`} title="Restock rhythm" onClose={() => S.closeSheet()}>
      {(close) => (
        <>
          <p className="nv-st-shname">{c.name}</p>
          <p className="nv-st-lab">Lasts about</p>
          <div className="nv-st-fchips">
            {[0, ...S.rhythmWeeks].map((w) => (
              <button key={w} type="button" aria-pressed={(c.lasts || 0) === w} onClick={() => { if ((c.lasts || 0) !== w) { S.rhythm(c.raw, w); close(); } }}>{w ? `${w} weeks` : 'Off'}</button>
            ))}
          </div>
          {c.learned && c.learned.weeks !== c.lasts && (
            <div className="nv-st-learn">
              <span>Your last {c.learned.purchases} purchases say about every <b>{c.learned.weeks} weeks</b>.</span>
              <button type="button" className="nv-st-pillb gold" onClick={() => { S.rhythm(c.raw, c.learned.weeks); close(); }}>Use {c.learned.weeks} weeks</button>
            </div>
          )}
          {r ? (
            <div className="nv-st-rhythm" style={{ '--t': c.hue }}>
              <span className={`mini${r.due ? ' due' : ''}`} aria-hidden="true"><i style={{ transform: `scaleY(${Math.max(0.02, r.level)})` }} /><b style={{ bottom: `${(r.checkFrac * 100).toFixed(1)}%` }} /></span>
              <p>Bought <b>{r.since === 0 ? 'today' : `${r.since} ${r.since === 1 ? 'day' : 'days'} ago`}</b>, lasts about <b>{c.lasts} weeks</b>. Nova asks you to check {r.due ? <b>now</b> : <b>{r.daysToCheck === 1 ? 'tomorrow' : `in ${r.daysToCheck} days`}</b>}, a week before it would run out, after quiet hours.</p>
            </div>
          ) : <p className="nv-st-sub">No rhythm set. Pick how long one usually lasts and Nova will ask you to check the level a week before it runs out.</p>}
          {r && <div className="nv-st-acts" style={{ marginTop: 12 }}><button type="button" className="nv-st-pillb" onClick={() => { S.answer(c.raw, 'reordered'); close(); }}>I just bought it</button></div>}
          {V.demo && <p className="nv-st-sub quiet">Demo: nothing reaches your vault.</p>}
        </>
      )}
    </Sheet>
  );
}

function MoveSheet({ S, V, c }) {
  return (
    <Sheet label={`Move ${c.name}`} title="Move to a shelf" onClose={() => S.closeSheet()}>
      {(close) => (
        <>
          <p className="nv-st-shname">{c.name}</p>
          <p className="nv-st-lab">Shelves</p>
          <div className="nv-st-fchips">
            {V.shelfNames.map((n) => <button key={n} type="button" aria-pressed={c.shelf === n} onClick={() => { if (c.shelf !== n) { S.move(c.raw, n); close(); } }}>{n}</button>)}
          </div>
          {V.giftNames.length > 0 && <><p className="nv-st-lab">Gift lists</p>
            <div className="nv-st-fchips">{V.giftNames.map((n) => <button key={n} type="button" aria-pressed={c.shelf === n} onClick={() => { if (c.shelf !== n) { S.move(c.raw, n); close(); } }}>{n}</button>)}</div></>}
          <NewShelf onMake={(name) => { S.move(c.raw, name); close(); }} />
        </>
      )}
    </Sheet>
  );
}

function NewShelf({ onMake, gift }) {
  const [name, setName] = useState('');
  const n = name.trim();
  const full = gift ? (n && !/^for\s/i.test(n) ? `For ${n}` : n) : n;
  return (
    <form className="nv-st-newshelf" onSubmit={(e) => { e.preventDefault(); if (full) onMake(full); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={gift ? 'Who is it for?' : 'A new shelf'} aria-label={gift ? 'Who the gift list is for' : 'New shelf name'} maxLength={60} />
      <button type="submit" className="nv-st-pillb hue" disabled={!full}>{gift ? 'Make the list' : 'Move it there'}</button>
    </form>
  );
}

function BoughtSheet({ S, c }) {
  const [paid, setPaid] = useState('');
  return (
    <Sheet label={`Mark ${c.name} bought`} title="Mark bought" onClose={() => S.closeSheet()}>
      {(close) => (
        <form onSubmit={(e) => { e.preventDefault(); S.bought(c.raw, { paid: paid.trim() || null }); close(); }}>
          <p className="nv-st-shname">{c.name}</p>
          <p className="nv-st-sub">{c.lasts ? 'It stays on its shelf with its clock restarted from today, and a dated line joins Bought, so the rhythm learns from your real buys.' : 'It moves to Bought with today’s date.'}</p>
          <p className="nv-st-lab">Price paid (optional)</p>
          <div className="nv-st-newshelf">
            <input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="$0.00" aria-label="Price paid" maxLength={12} />
            <button type="submit" className="nv-st-pillb hue">Mark bought</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function GiftSheet({ S, sheet }) {
  const [date, setDate] = useState(sheet.date || '');
  const fresh = !sheet.name;
  return (
    <Sheet label={fresh ? 'New gift list' : `${sheet.name}: its day`} title={fresh ? 'New gift list' : sheet.name} onClose={() => S.closeSheet()}>
      {(close) => fresh ? (
        <>
          <p className="nv-st-sub">A shelf for one person. Give it a day and Nova reminds you gently two weeks before, after quiet hours.</p>
          <GiftNew S={S} close={close} />
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); S.shelf(sheet.name, date || null); close(); }}>
          <p className="nv-st-lab">The day</p>
          <div className="nv-st-newshelf">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="The day" />
            <button type="submit" className="nv-st-pillb hue" disabled={(date || null) === (sheet.date || null)}>Save</button>
          </div>
          {sheet.date && <button type="button" className="nv-st-textb" onClick={() => { S.shelf(sheet.name, null); close(); }}>Remove the date</button>}
        </form>
      )}
    </Sheet>
  );
}
function GiftNew({ S, close }) {
  const [who, setWho] = useState('');
  const [date, setDate] = useState('');
  const n = who.trim().replace(/^for\s+/i, '');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (n) { S.shelf(`For ${n}`, date || null); close(); } }}>
      <p className="nv-st-lab">For</p>
      <input className="nv-st-input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Mum" aria-label="Who it is for" maxLength={50} />
      <p className="nv-st-lab">The day (optional)</p>
      <input className="nv-st-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="The day" />
      <div className="nv-st-acts" style={{ marginTop: 14 }}><button type="submit" className="nv-st-pillb hue" disabled={!n}>Make the list</button></div>
    </form>
  );
}

/* ------------------------------ the add bar ------------------------------- */

function AddBar({ S, V }) {
  const add = S.ui.add;
  const inputRef = useRef(null);
  const ro = S.readOnly;
  if (ro) return null;
  if (!add) {
    return (
      <div className="nv-st-addbar nv-liquid">
        <button type="button" className="nv-st-ph" onClick={() => { S.typeAdd(''); setTimeout(() => inputRef.current?.focus(), 0); }}>Paste a link to keep</button>
        {S.clip ? (
          // mockup 88: a link on the clipboard is offered by name in place of ＋
          <button type="button" className="nv-st-paste offer" onClick={() => { haptic('tick'); S.paste(); }} aria-label={`Paste ${S.clip}`}>
            <SIcon n="paste" /><span>Paste {shortLink(S.clip, 20)}</span>
          </button>
        ) : (
          <>
            <button type="button" className="nv-st-paste" onClick={() => { haptic('tick'); S.paste(); }} aria-label="Paste a link from the clipboard"><SIcon n="paste" /></button>
            <button type="button" className="nv-st-plus" aria-label="Add a link" onClick={() => { S.typeAdd(''); setTimeout(() => inputRef.current?.focus(), 0); }}><SIcon n="plus" /></button>
          </>
        )}
      </div>
    );
  }
  if (add.stage === 'typing') {
    return (
      <form className="nv-st-addbar nv-liquid typing" onSubmit={(e) => { e.preventDefault(); S.startAdd(add.url); }}>
        <input ref={inputRef} autoFocus inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://"
          value={add.url} onChange={(e) => S.typeAdd(e.target.value)} aria-label="The link to keep"
          onPaste={(e) => { const t = e.clipboardData?.getData('text'); if (isLink(t)) { e.preventDefault(); S.startAdd(t.trim()); } }} />
        <button type="button" className="nv-st-q" onClick={() => S.cancelAdd()} aria-label="Cancel"><SIcon n="x" /></button>
        <button type="submit" className="nv-st-plus" aria-label="Read this link" disabled={!add.url.trim()}><SIcon n="check" /></button>
        {add.error && <p className="nv-st-adderr" role="alert">{add.error}</p>}
      </form>
    );
  }
  if (add.stage === 'duplicate') {
    const d = add.duplicate;
    return (
      <div className="nv-st-addbar nv-liquid dup" role="status">
        <span className="nv-st-dupw"><b>Already on {d.category}</b><span>{d.name}</span></span>
        <button type="button" className="nv-st-pillb" onClick={() => S.showDuplicate(d)}>Show it</button>
        <button type="button" className="nv-st-q" onClick={() => S.cancelAdd()} aria-label="Close"><SIcon n="x" /></button>
      </div>
    );
  }
  const reading = add.stage === 'reading';
  const p = add.preview;
  const card = { name: add.name || p?.name || '', host: (() => { try { return new URL(add.url).hostname.replace(/^www\./, ''); } catch { return add.url; } })(), image: p?.image || null, demoArt: p?.demoArt || null, hue: 'var(--nv-m-back)' };
  const said = reading ? 'Reading the page' : p?.state === 'blocked' ? `${card.host} · the site refused the read, so name it yourself` : p?.state === 'failed' || p?.state === 'unreadable' ? `${card.host} · Nova couldn't read the page, so name it yourself` : p?.image || p?.demoArt ? `${card.host} · name and picture read from the page` : `${card.host} · no picture on that page`;
  return (
    <form className="nv-st-addbar nv-liquid form" onSubmit={(e) => { e.preventDefault(); S.commitAdd(); }}>
      <div className="nv-st-pv">
        {reading ? <span className="nv-st-pvimg sk" aria-hidden="true" /> : <Picture S={S} card={card} className="nv-st-pvimg" />}
        <span className="nv-st-pvw">
          {reading ? <span className="sk line" aria-hidden="true" /> : (
            <input value={add.name} onChange={(e) => S.setAdd({ name: e.target.value })} aria-label="Its name" maxLength={140} placeholder="Name it" />
          )}
          <span className="hs">{said}</span>
        </span>
      </div>
      {!reading && (
        <>
          <p className="nv-st-flab">Shelf {add.hint && <span className="hint">· {add.hint}</span>}</p>
          <div className="nv-st-fchips">
            {[...V.shelfNames, ...V.giftNames].concat(V.shelfNames.includes(add.shelf) || V.giftNames.includes(add.shelf) ? [] : [add.shelf]).map((n) => (
              <button key={n} type="button" aria-pressed={add.shelf === n} onClick={() => S.setAdd({ shelf: n })}>{n}</button>
            ))}
            <button type="button" className="ghost" onClick={() => S.openSheet({ kind: 'gift' })}>+ Gift list</button>
          </div>
          <p className="nv-st-flab">Lasts about (optional)</p>
          <div className="nv-st-fchips">
            {[0, ...S.rhythmWeeks].map((w) => <button key={w} type="button" aria-pressed={(add.lasts || 0) === w} onClick={() => S.setAdd({ lasts: w })}>{w ? `${w} wk` : 'Off'}</button>)}
          </div>
          <div className="nv-st-formgo">
            <button type="button" className="nv-st-pillb" onClick={() => S.cancelAdd()}>Cancel</button>
            <button type="submit" className="nv-st-pillb hue" disabled={add.stage === 'saving'}>{add.stage === 'saving' ? 'Stashing' : 'Stash it'}</button>
          </div>
        </>
      )}
    </form>
  );
}

/* ------------------------------ the Reader -------------------------------- */

const FONT_KEY = 'novaos.stashReaderSize';
function Reader({ S, V }) {
  const R = S.reader;
  const card = Object.values(V.byRaw || {}).find((c) => c.url === R.url) || R.card || { url: R.url, name: R.url, host: R.url, raw: null, hue: 'var(--nv-m-shoulders)' };
  const doc = R.doc;
  const rootRef = useRef(null);
  const progRef = useRef(null);
  const [big, setBig] = useState(() => { try { return localStorage.getItem(FONT_KEY) === 'l'; } catch { return false; } });
  const placeAt = card.place?.para ?? null;
  const placeWhen = card.place?.at ? new Date(card.place.at).toLocaleDateString('en-AU', { weekday: 'long' }) : null;

  // the progress line follows the scroll; the place is kept when he pauses
  const cardRef = useRef(card);
  cardRef.current = card;
  useEffect(() => {
    if (!doc?.paras?.length) return undefined;
    let t = null;
    const onScroll = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      if (progRef.current) progRef.current.style.transform = `scaleX(${p})`;
      clearTimeout(t);
      t = setTimeout(() => {
        const ps = [...el.querySelectorAll('[data-para]')];
        let at = 0;
        for (const x of ps) if (x.getBoundingClientRect().top < window.innerHeight * 0.4) at = Number(x.dataset.para);
        const c = cardRef.current;
        if (c.raw && at > 0 && at !== c.place?.para) S.savePlace(c, at);
      }, 900);
    };
    document.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('scroll', onScroll, true); clearTimeout(t); };
  }, [doc, S]);
  // open at the place he stopped
  useEffect(() => {
    if (!doc?.paras?.length || placeAt == null) return;
    const el = rootRef.current?.querySelector('.nv-st-place');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = doc?.words ? `${doc.minutes} min, counted from ${doc.words.toLocaleString('en-AU')} words` : null;
  const saved = card.addedAt ? `Saved ${Math.max(0, Math.round((Date.now() - Date.parse(card.addedAt)) / 86400000 / 7)) || 'this'} ${Math.round((Date.now() - Date.parse(card.addedAt)) / 86400000 / 7) === 1 ? 'week' : 'weeks'} ago` : null;
  const opened = card.opens ? `opened ${card.opens === 1 ? 'once' : card.opens === 2 ? 'twice' : `${card.opens} times`}` : null;
  return (
    <>
    <div ref={rootRef} className={`nv-st-rd${reduced() ? '' : ' push'}${big ? ' big' : ''}`} data-screen-label="Stash reader" style={{ '--t': 'var(--nv-m-shoulders)' }}>
      <div className="nv-st-rdprog" aria-hidden="true"><i ref={progRef} /></div>
      <div className="nv-st-rdart"><Picture S={S} card={card} className="nv-st-rdpic" /></div>
      <div className="nv-st-rdnav">
        <button type="button" className="nv-st-nb" onClick={() => S.closeReader()}><SIcon n="left" />Stash</button>
        <span className="nv-st-rdnavr">
          <button type="button" className="nv-st-nb circ" aria-label={big ? 'Smaller text' : 'Larger text'} aria-pressed={big}
            onClick={() => { const n = !big; setBig(n); try { localStorage.setItem(FONT_KEY, n ? 'l' : 's'); } catch { /* per device */ } }}><SIcon n="aa" /></button>
          {card.raw && <button type="button" className="nv-st-nb circ" aria-label="More: open the original, share, move, remove" onClick={(e) => S.openMenu(card.raw, e.currentTarget.getBoundingClientRect())}><SIcon n="more" /></button>}
        </span>
      </div>
      <div className="nv-st-rdbody">
        <span className="nv-st-rdshelf"><Tile glyph="read" hue="var(--nv-m-shoulders)" sm />{card.shelf || 'Reading'}</span>
        <h2>{doc?.title || card.name}</h2>
        <p className="nv-st-rdmeta"><b>{card.host}</b>{words ? ` · ${words}` : ''}{(saved || opened) && <><br />{[saved, opened].filter(Boolean).join(' · ')}</>}</p>
        {R.loading && <div className="nv-st-rdsk" aria-busy="true"><span /><span /><span /><span /></div>}
        {!R.loading && doc && doc.state !== 'ok' && (
          <div className="nv-sum-card nv-st-rdfail">
            <p><b>Nova couldn't read this one.</b> {doc.state === 'blocked' ? `The site refused the read (${doc.why}). Nova does not get round a bot check.` : doc.why ? `${doc.why[0].toUpperCase()}${doc.why.slice(1)}.` : ''}</p>
            <button type="button" className="nv-st-pillb hue" onClick={() => S.open(card)}><SIcon n="open" />Open the original</button>
          </div>
        )}
        {doc?.paras?.map((p, i) => (
          <div key={i}>
            {placeAt === i && i > 0 && <div className="nv-st-place">You stopped here{placeWhen ? ` on ${placeWhen}` : ''}</div>}
            {p.h ? <h3 data-para={i}>{p.h}</h3> : <p className="t" data-para={i}>{p.p}</p>}
          </div>
        ))}
      </div>
    </div>
    {/* outside the page: its entrance transform would capture a fixed bar */}
    <div className="nv-st-rbar nv-liquid on" style={{ '--t': 'var(--nv-m-shoulders)' }}>
        <button type="button" onClick={() => S.open(card)} aria-label={`Open the original on ${card.host}`}><SIcon n="open" />Original</button>
        <span />
        {card.raw && !S.readOnly && (
          <button type="button" className="done" onClick={() => { haptic('commit'); S.finish(card.raw, !card.read); if (!card.read) S.closeReader(); }}>
            <SIcon n="check" />{card.read ? 'Unread' : 'Finished'}
          </button>
        )}
      </div>
    </>
  );
}

/* ------------------------------ states ------------------------------------ */

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Reading the Stash from your Mac">
      <section className="nv-sum-card nv-st-vialcard"><div className="nv-st-vials">{[0, 1, 2, 3].map((i) => <span key={i} className="nv-st-skvial" />)}</div></section>
      <div className="nv-st-grid" style={{ marginTop: 22 }}>{[0, 1].map((i) => <span key={i} className="nv-sum-card nv-st-skcard" />)}</div>
    </div>
  );
}

/* ------------------------------ the page ---------------------------------- */

export function StashSummary({ v }) {
  const S = v.stashSum;
  const V = S.view;
  const sheet = S.ui.sheet;
  const sheetCard = sheet?.raw ? findCard(V, sheet.raw) : null;
  if (S.reader) {
    return (
      <div className="nv-st" style={v.wrapStash}>
        <Reader S={S} V={V} />
        {S.ui.menu && <Menu S={S} V={V} />}
        {sheet?.kind === 'move' && sheetCard && <MoveSheet S={S} V={V} c={sheetCard} />}
      </div>
    );
  }
  return (
    <div className={`nv-st${S.ui.menu ? ' ctx-on' : ''}`} style={v.wrapStash} data-screen-label="Stash">
      {V.state === 'loading' ? (
        <>
          <header className="nv-st-top"><h1>Stash</h1></header>
          <Skeleton />
        </>
      ) : (
        <>
          <Top S={S} V={V} />
          {V.state === 'empty' ? (
            <p className="nv-st-empty">Nothing stashed yet. Paste a link below to keep it.</p>
          ) : (
            <>
              {V.due && <DueCard key={V.due.raw} S={S} V={V} />}
              {V.vials.length > 0 && <Vials S={S} V={V} />}
              <ShelfBar S={S} V={V} />
              {V.noMatch && <p className="nv-st-empty">Nothing in the Stash matches “{S.ui.q.trim()}”.</p>}
              <Shelves S={S} V={V} />
              {!S.readOnly && (
                <button type="button" className="nv-st-newgift" onClick={() => S.openSheet({ kind: 'gift' })}><Tile glyph="gift" hue="var(--nv-m-chest)" sm />New gift list</button>
              )}
            </>
          )}
          <AddBar S={S} V={V} />
        </>
      )}
      {S.ui.menu && <Menu S={S} V={V} />}
      {sheet?.kind === 'rhythm' && sheetCard && <RhythmSheet S={S} V={V} c={sheetCard} />}
      {sheet?.kind === 'move' && sheetCard && <MoveSheet S={S} V={V} c={sheetCard} />}
      {sheet?.kind === 'bought' && sheetCard && <BoughtSheet S={S} c={sheetCard} />}
      {sheet?.kind === 'gift' && <GiftSheet S={S} sheet={sheet} />}
    </div>
  );
}
