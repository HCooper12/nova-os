import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Interactive } from '../Interactive.jsx';
import { useExit } from '../useExit.js';
import { useSheetDrag } from '../useSheetDrag.js';
import { useFlipList } from '../useFlipList.js';
import { AskTaps } from '../QuickCapture.jsx';
import '../wishlist.css';

// HIS WISHLIST, IN NOVA (30 Oct 2026) — design/mockups/107-wishlist.html,
// approved as drawn: "Yes looking good". His words, 29 Oct: "its own page or
// visual page in Nova that reflects everything from the Notion page but in a
// cleaner looking state."
//
// So the page is his Notion list as big photos in two columns, grouped by
// his own Status: Considering, This month (which says so when it is empty),
// Purchased folded to one row so the things he still wants lead. A dot is
// his priority in his own Notion colours, a gold badge his stars, a price
// only where his row has one. Six chips up front, the rest behind Show all.
// A card opens a sheet over a 60% scrim: the photo large, the link, his
// notes and size, the star row (0 to 3) and three actions, each written to
// Notion with Undo in a pill and in the Inbox. When Notion cannot show the
// list, the page says what to do in its own content, as one path of steps.
//
// MOTION: the cards rise on a 30 ms stagger; a status change SLIDES the card
// to its new group (FLIP, useFlipList), which is the page's one hero move;
// the sheet rises from the foot and leaves the way it came (useExit); a star
// lands with a small spring. Transform and opacity only; reduced motion lands
// every end state with a short fade.
//
// Every style draws this one component from one view model
// (src/vals/valsWishlist.js); the material comes from the house tokens.

const rise = (i) => ({ '--i': Math.min(i, 14) });

// a photo is asked of the Mac only once its card is near the screen, and once
// per session (the Stash's way: a list of 75 asks for the few he can see)
const blobs = new Map();
function usePicture(W, file, ref) {
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
    if (!blobs.has(file)) blobs.set(file, W.imageUrl(file).catch(() => null));
    blobs.get(file).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [W, file, near]);
  return url;
}

// the row's own Gallery photo, or (no photo, or not yet kept) its initial on
// a quiet plate: honest about what is missing, never a stock image
function Photo({ W, c, className }) {
  const ref = useRef(null);
  const url = usePicture(W, c.image, ref);
  const [broken, setBroken] = useState(false);
  if (url && !broken) return <span ref={ref} className={className}><img src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} /></span>;
  const letter = [...String(c.name || '?').trim()][0] || '?';
  return (
    <span ref={ref} className={`${className} none`} data-art={c.demoArt || undefined} aria-hidden="true">
      <b>{letter.toUpperCase()}</b>
    </span>
  );
}

const Card = memo(function Card({ W, c, i }) {
  return (
    <Interactive as="button" type="button" className="nv-wl-card" data-flip={c.id} onClick={() => W.open(c.id)} haptic="tick" style={rise(i)}
      aria-label={`${c.name}${c.stars ? `, ${['', 'most wanted', 'top', 'very top'][c.stars]}` : ''}${c.priority ? `, ${c.priority} priority` : ''}${c.price ? `, ${c.price}` : ''}`}>
      <Photo W={W} c={c} className="nv-wl-ph" />
      {c.starMark && <span className="nv-wl-star" key={c.starMark} aria-hidden="true">{c.starMark}</span>}
      <span className="nv-wl-meta">
        <span className="nv-wl-nm">{c.name}</span>
        <span className="nv-wl-sub">
          {c.pri && <i className={`nv-wl-pr ${c.pri}`} aria-hidden="true" />}
          <span className="nv-wl-store">{c.store}</span>
          {c.price && <span className="nv-wl-price">{c.price}</span>}
        </span>
      </span>
    </Interactive>
  );
});

function Grid({ W, cards, from = 0 }) {
  return <div className="nv-wl-grid">{cards.map((c, i) => <Card key={c.id} W={W} c={c} i={from + i} />)}</div>;
}

function Fold({ W, f, open, onToggle, label }) {
  return (
    <Interactive as="button" type="button" className="nv-wl-fold" onClick={onToggle} haptic="tick" aria-expanded={open} aria-label={`${f.title}. ${open ? 'Fold them away' : 'Show them'}`}>
      <span className="nv-wl-stack" aria-hidden="true">{f.thumbs.map((c) => <Photo key={c.id} W={W} c={c} className="nv-wl-thumb" />)}</span>
      <span className="nv-wl-foldtx"><b>{f.title}</b><small>{open ? `Tap to fold ${label} away` : f.preview}</small></span>
      <span className={`nv-wl-chev${open ? ' open' : ''}`} aria-hidden="true">›</span>
    </Interactive>
  );
}

function Steps({ steps }) {
  // his own words, with the one bold name in each; the markup is ours, from the model
  return (
    <ol className="nv-wl-steps">
      {steps.map((s, i) => <li key={i} dangerouslySetInnerHTML={{ __html: s }} />)}
    </ol>
  );
}

function Head({ W, V, canAdd }) {
  return (
    <>
      <header className="nv-wl-top">
        <h1>Wishlist</h1>
        {canAdd && (
          <Interactive as="button" type="button" className="nv-wl-add" onClick={W.startAdd} haptic="tick" aria-label="Add by link">
            <span aria-hidden="true">+</span>
          </Interactive>
        )}
      </header>
      <p className="nv-wl-sync" role="status">
        {V.syncAgo && !V.syncing ? <>From your Notion list · read <b>{V.syncAgo}</b></> : V.syncLine}
        {V.syncing && V.syncAgo ? <span className="nv-wl-reading"> · reading it again</span> : null}
      </p>
    </>
  );
}

function Skeleton() {
  return (
    <div className="nv-wl-grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className="nv-wl-card skel" style={rise(i)}>
          <span className="nv-wl-ph sk" />
          <span className="nv-wl-meta"><span className="nv-wl-skl" style={{ width: '82%' }} /><span className="nv-wl-skl" style={{ width: '54%', height: 9 }} /></span>
        </span>
      ))}
    </div>
  );
}

export function Wishlist({ v }) {
  const W = v.wishlist;
  const load = W?.load;
  // read on arrival, once (a fresh `load` is built every render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load?.(); }, []);
  const rootRef = useRef(null);
  const V = W?.view;
  // the FLIP trigger: which card sits in which group, in what order
  const order = V?.groups ? [...V.groups.map((g) => `${g.key}:${g.cards.map((c) => c.id).join(',')}`), `p:${V.purchased.open ? V.purchased.cards.map((c) => c.id).join(',') : V.purchased.count}`].join('|') : '';
  useFlipList(rootRef, order, { exits: true });
  if (!W) return null;
  const wrap = v.wrapWishlist;

  if (V.state === 'loading' || V.state === 'offline-empty') {
    return (
      <div className="nv-wl" style={wrap} data-screen-label="Wishlist">
        <Head W={W} V={V} canAdd={false} />
        {W.loadError ? <p className="nv-wl-empty">{W.loadError}</p> : V.state === 'loading' ? <Skeleton /> : null}
      </div>
    );
  }

  if (V.state === 'not-shared') {
    return (
      <div className="nv-wl" style={wrap} data-screen-label="Wishlist">
        <Head W={W} V={V} canAdd={false} />
        <section className="nv-wl-notice" style={rise(1)}>
          <b>{V.notice.title}</b>
          <p>{V.notice.body}</p>
          <Steps steps={V.notice.steps} />
        </section>
      </div>
    );
  }

  const canAdd = !W.readOnly;
  return (
    <div className="nv-wl" style={wrap} data-screen-label="Wishlist" ref={rootRef}>
      <Head W={W} V={V} canAdd={canAdd} />
      {W.offlineNote && <p className="nv-wl-note">{W.offlineNote}</p>}
      {V.readError && <p className="nv-wl-note">{V.readError}</p>}
      {V.state === 'empty' ? (
        <p className="nv-wl-empty">Your Notion Wishlist has nothing on it yet. Tap <b>+</b> and paste a link, or say “add this to my Wishlist” with one.</p>
      ) : (
        <>
          <div className="nv-wl-chips" role="group" aria-label="Show">
            {V.chips.map((c) => (
              <Interactive key={c.key} as="button" type="button" className={`nv-wl-chip${c.on ? ' on' : ''}`} onClick={() => W.setCat(c.key)} haptic="tick" aria-pressed={c.on}>{c.label}</Interactive>
            ))}
            {V.moreChips.map((c) => (
              <Interactive key={c.key} as="button" type="button" className={`nv-wl-chip${c.on ? ' on' : ''}`} onClick={() => W.setCat(c.key)} haptic="tick" aria-pressed={c.on}>{c.label}</Interactive>
            ))}
            {V.moreCount > 0 && (
              <Interactive as="button" type="button" className="nv-wl-chip more" onClick={W.showAllCats} haptic="tick">Show all</Interactive>
            )}
          </div>
          {V.noMatch && <p className="nv-wl-empty">Nothing here under that one.</p>}
          {V.groups.map((g, gi) => (
            <section key={g.key} className="nv-wl-sec" aria-label={g.label}>
              <h2 className="nv-wl-grp"><b>{g.label}</b><span>{g.countLabel}</span></h2>
              {g.cards.length ? <Grid W={W} cards={g.cards} from={gi * 2} /> : <p className="nv-wl-emptybox" dangerouslySetInnerHTML={{ __html: g.empty }} />}
            </section>
          ))}
          <section className="nv-wl-sec" aria-label="Purchased">
            <h2 className="nv-wl-grp"><b>{V.purchased.label}</b><span>{V.purchased.countLabel}</span></h2>
            {V.purchased.fold ? (
              <>
                <Fold W={W} f={V.purchased.fold} open={V.purchased.open} onToggle={W.toggleBought} label="them" />
                {V.purchased.open && <Grid W={W} cards={V.purchased.cards} />}
              </>
            ) : <p className="nv-wl-emptybox">Nothing marked bought yet.</p>}
          </section>
          {V.cancelled && (
            <section className="nv-wl-sec" aria-label="Cancelled">
              <h2 className="nv-wl-grp"><b>{V.cancelled.label}</b><span>{V.cancelled.countLabel}</span></h2>
              <Fold W={W} f={V.cancelled.fold} open={V.cancelled.open} onToggle={W.toggleCancelled} label="them" />
              {V.cancelled.open && <Grid W={W} cards={V.cancelled.cards} />}
            </section>
          )}
          {W.demo && <p className="nv-wl-note">Demo: invented examples. Nothing here reaches Notion.</p>}
        </>
      )}
      {W.sheet && <CardSheet W={W} s={W.sheet} />}
      {W.addOpen && W.add && <AddSheet W={W} a={W.add} />}
    </div>
  );
}

/* --------------------------------- sheets --------------------------------- */

function Sheet({ label, onClose, children }) {
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
  // on the page, not in the screen: the screen's entrance transform would
  // otherwise trap a fixed sheet inside it
  return createPortal(
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={label} onClick={exit.close} className="nv-wl-scrim">
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }} tabIndex={-1}
        data-sheet="" className="nv-liquid nv-liquid-thick nv-sum-sheet nv-wl-sheet" onClick={(e) => e.stopPropagation()}>
        <div {...drag.handleProps} onPointerDown={(e) => { if (!onControl(e.target)) drag.handleProps.onPointerDown(e); }} className="nv-wl-grabzone" style={drag.handleProps.style}>
          <span className="nv-wl-grab" aria-hidden="true" />
        </div>
        <div className="nv-wl-shbody">{children(exit.close)}</div>
      </div>
    </div>,
    document.body,
  );
}

function CardSheet({ W, s }) {
  const ro = W.readOnly;
  return (
    <Sheet label={s.name} onClose={W.close}>
      {() => (
        <>
          <Photo W={W} c={s} className="nv-wl-big" />
          <h3 className="nv-wl-st">{s.name}</h3>
          <p className="nv-wl-ln">
            {s.priority && <span className="pill"><i className={`nv-wl-pr ${s.pri}`} aria-hidden="true" />{s.priority}</span>}
            {s.categories.map((c) => <span key={c}>{c}</span>)}
            <span>{s.statusWord}</span>
            {s.price && <span className="num">{s.price}</span>}
          </p>
          <div className="nv-wl-kv"><span>Link</span>{s.link ? <a href={s.link} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); W.openLink(s.link); }}>{s.linkShown}</a> : <span className="none">No link on this row</span>}</div>
          <div className="nv-wl-kv"><span>Notes</span>{s.notes ? <span className="val">{s.notes}</span> : <span className="none">None yet</span>}</div>
          {s.size && <div className="nv-wl-kv"><span>Size</span><span className="val">{s.size.lines.join(' · ')}<small>{s.size.label}, from your Sizes</small></span></div>}
          <div className="nv-wl-stars" role="radiogroup" aria-label="How much you want it">
            {W.starLabels.map((label, n) => (
              <Interactive key={n} as="button" type="button" role="radio" aria-checked={s.stars === n} className={s.stars === n ? 'on' : ''}
                onClick={() => W.star(s, n)} disabled={ro} haptic="tick">{label}</Interactive>
            ))}
          </div>
          <div className="nv-wl-acts">
            <Interactive as="button" type="button" className="nv-wl-act go" onClick={() => W.bought(s)} disabled={ro} haptic="commit">{s.bought ? 'Not bought' : 'Mark bought'}</Interactive>
            <Interactive as="button" type="button" className="nv-wl-act mo" onClick={() => W.thisMonth(s)} disabled={ro} haptic="tick">{s.thisMonth ? 'Not this month' : 'This month'}</Interactive>
            <Interactive as="button" type="button" className="nv-wl-act rm" onClick={() => W.remove(s)} disabled={ro} haptic="tick">Remove</Interactive>
          </div>
          <p className="nv-wl-undoline">{ro ? 'Offline: read only until your Mac is back.' : W.demo ? 'Demo: changes stay on this screen, with Undo.' : 'Each change is written to Notion, with Undo here and in the Inbox.'}</p>
        </>
      )}
    </Sheet>
  );
}

function AddSheet({ W, a }) {
  return (
    <Sheet label="Add to your Wishlist" onClose={W.close}>
      {() => (
        <>
          <h3 className="nv-wl-st">Add by link</h3>
          <p className="nv-wl-hint">Nova reads the name, photo, price and colour off the page, and asks only what it could not.</p>
          <div className="nv-wl-field">
            <input value={a.url} onChange={(e) => W.setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') W.submitAdd(); }}
              inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Paste a product link" aria-label="Product link" disabled={a.busy} />
            {!a.url && <Interactive as="button" type="button" className="nv-wl-paste" onClick={W.paste} haptic="tick">Paste</Interactive>}
            <Interactive as="button" type="button" className="nv-wl-go" onClick={W.submitAdd} disabled={a.busy || !a.url.trim()} haptic="commit" aria-label="Add it">
              {a.busy ? <span className="nv-wl-spin" aria-hidden="true" /> : <span aria-hidden="true">→</span>}
            </Interactive>
          </div>
          {a.busy && <p className="nv-wl-hint" role="status">Reading the page…</p>}
          {a.error && <p className="nv-wl-err" role="alert">{a.error}</p>}
          {a.done && (
            <div className="nv-wl-done">
              <div className="nv-wl-rcpt">
                <span className="txt">{a.done.name}</span>
                <span className="tag">Wishlist</span>
                <Interactive as="button" type="button" className="u" onClick={a.done.undo} haptic="tick">Undo</Interactive>
              </div>
              {a.done.ask && <AskTaps ask={a.done.ask} />}
              {a.done.said && <p className="nv-wl-said">{a.done.said}</p>}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
