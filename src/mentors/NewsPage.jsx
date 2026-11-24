import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, getConnection } from '../api.js';
import { useDictation } from '../useDictation.js';
import { plainCause } from '../../server/lib/plainCause.js';
import { paletteFor, regionVars } from './palette.js';
import { mins, fmt } from './mentorModel.js';
import {
  rvView, rvNext, tabsOf, qOf, askOf, byOf, hasQuestion, slotOf, cmpWord, costLabel, feedOf, reviewsOf,
  moving, justAnswered, hms, dayLabel, ymdLabel, videoDay, noteOf, RV_UNDO_MS,
} from './newsModel.js';
import { odo, Spring, sheetDrag, reducedMotion } from './motion.js';
import { Ic, St, Thumb } from './MentorBits.jsx';
import { useArt, springEase, springMs } from './art.js';
import './mentors.css';
import './news.css';

// MENTORS NEWS (build slice 2; the approved mockup 125 A, "News", in the
// colouring he picked, "Colour on top"). For each person he follows: what a
// weave raised for his review (the review card), his newest videos (Watch,
// Listen, Brief me), and what was woven this week. Everything comes from
// GET /api/mentors/news; a thing the server did not give is absent. Every
// write is acted out at once and put back, with the server's own cause, if
// it is refused. A page of its own, a history level (the back swipe closes it).

const watchURL = (id, s) => `https://www.youtube.com/watch?v=${id}${s ? `&t=${Math.round(s)}s` : ''}`;
const RM = () => reducedMotion();
const smooth = () => [springMs('smooth', 800), springEase('smooth')];
const snappy = () => [springMs('snappy', 640), springEase('snappy')];
const bouncy = () => [springMs('bouncy', 800), springEase('bouncy')];
const causeOf = (e) => plainCause(e);

/* ------------------------------- live data -------------------------------- */

function useNewsLive() {
  const [st, setSt] = useState({ news: null, error: null });
  const ref = useRef(st);
  ref.current = st;
  const busy = useRef(false);
  // a write bumps this; an answer that left before the write landed is stale
  const writes = useRef(0);
  const load = useCallback(async () => {
    const conn = getConnection();
    if (!conn || busy.current) return;
    busy.current = true;
    const seq = writes.current;
    try {
      const news = await api.mentorNews(conn);
      if (seq === writes.current) setSt({ news, error: null });
    } catch (e) {
      setSt((s) => ({ ...s, error: causeOf(e) }));
    } finally { busy.current = false; }
  }, []);
  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
  }, [load]);
  const fast = moving(st.news);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') load(); }, fast ? 2_500 : 30_000);
    return () => clearInterval(t);
  }, [load, fast]);
  // the optimistic half: change the page now, the server's answer settles it
  const patch = useCallback((fn) => { writes.current += 1; setSt((s) => (s.news ? { ...s, news: fn(s.news) } : s)); }, []);
  return { ...st, reload: load, patch };
}

const patchItem = (news, personId, rid, fn) => ({
  ...news,
  raised: (news.raised || []).map((g) => (g.personId !== personId ? g : { ...g, items: g.items.map((r) => (r.rid === rid ? fn(r) : r)) })),
});
const patchVideo = (news, key, fn) => ({ ...news, videos: (news.videos || []).map((v) => (v.key === key ? fn(v) : v)) });

/* -------------------------------- small parts ------------------------------- */

function Who({ person, d }) {
  const src = useArt(person?.art?.avatar || null);
  return (
    <div className="who">
      {src ? <img src={src} alt="" /> : <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--nv-m-a)', flex: 'none' }} />}
      {person?.name}{d ? <span className="d">{d}</span> : null}
    </div>
  );
}

// the rows after a change in a tile slide to their new places on the same spring
function shiftAfter(tile, fn) {
  const nl = tile?.parentElement;
  const els = nl ? [...nl.children].filter((e) => e !== tile && e.classList.contains('nb') && (e.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_PRECEDING)) : [];
  const t0 = els.map((e) => e.getBoundingClientRect().top);
  fn();
  return () => {
    if (RM()) return;
    const [ms, ease] = smooth();
    els.forEach((e, i) => { const dy = t0[i] - e.getBoundingClientRect().top; if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: ms, easing: ease }); });
  };
}

/* ------------------------------- the review card ---------------------------- */

const vis = (e, base) => {
  const bg = e.querySelector(':scope > .bgk');
  return { top: base + e.offsetTop, h: bg ? bg.offsetHeight : e.offsetHeight };
};

function ReviewCard({ person, items, landed, onWrite, onScript }) {
  const pal = useMemo(() => paletteFor(person.colour), [person.colour]);
  const vars = useMemo(() => regionVars(pal, 'now'), [pal]);
  const [ui, setUi] = useState(() => ({ openId: rvNext(items), all: false, tab: {}, shown: {}, edit: {}, own: {}, hold: false, det: {}, err: {} }));
  const [undo, setUndo] = useState(() => new Set());
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const undoT = useRef(new Map());
  const timers = useRef({});
  const cardRef = useRef(null), rnRef = useRef(null);
  const motion = useRef(false);
  const fx = useRef([]);
  const prev = useRef(null);
  const shownN = useRef(null);
  const lastRows = useRef([]);

  const openId = ui.openId;
  const view = rvView(items, { undo, all: ui.all, hold: ui.hold });
  const newest = items.reduce((a, r) => (r.at > a ? r.at : a), '');

  // nothing open and something waiting (a new weave raised more): the next one opens
  const nextId = rvNext(items);
  useEffect(() => { if (ui.openId == null && nextId) setUi((u) => (u.openId == null ? { ...u, openId: nextId } : u)); }, [ui.openId, nextId]);
  // the card returns when something is waiting again
  useEffect(() => { if (view && gone) { setGone(false); setLeaving(false); } }, [view, gone]);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); undoT.current.forEach(clearTimeout); }, []);

  const act = (fn) => { motion.current = true; fn(); };

  // the answer that just landed: the item rises to the top, the answer settles onto the slip
  const landedKey = landed.join(',');
  useEffect(() => {
    if (!landed.length) return;
    const rid = landed[0];
    motion.current = true;
    fx.current.push({ type: 'answer', rid });
    setUi((u) => ({ ...u, openId: rid, edit: {} }));
  }, [landedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* every render: measure (relative to the feed, so a scroll in between does
     not matter); after one of his calls, everything that moved springs from
     where it was (FLIP), the mockup's rvRender */
  useLayoutEffect(() => {
    const card = cardRef.current;
    const nl = card?.parentElement;
    const now = { fk: new Map(), fol: [] };
    if (card && nl) {
      card.querySelectorAll('[data-fk]').forEach((e) => now.fk.set(e.dataset.fk, vis(e, card.offsetTop)));
      now.cardTop = card.offsetTop;
      now.fol = [...nl.children].filter((e) => e !== card && e.classList.contains('nb') && e.offsetTop > card.offsetTop).map((e) => [e, e.offsetTop]);
    }
    const was = prev.current;
    prev.current = now;
    // the count: rolls to the new number whenever an item is decided
    const n = view?.count ?? 0;
    if (rnRef.current) {
      if (!rnRef.current.dataset.v) odo(rnRef.current, shownN.current ?? n, false);
      if (`${n}` !== rnRef.current.dataset.v) odo(rnRef.current, n, motion.current && !RM());
      shownN.current = n;
    }
    const go = motion.current;
    motion.current = false;
    const effects = fx.current.splice(0);
    if (!go || !was || !card) { runFx(effects); return; }
    const [dur, ease] = snappy();
    if (RM()) {
      card.querySelectorAll('[data-fk]').forEach((e) => { const a = was.fk.get(e.dataset.fk); const b = now.fk.get(e.dataset.fk); if (!a || Math.abs(a.h - b.h) > 0.5) e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); });
      runFx(effects);
      return;
    }
    now.fol.forEach(([e]) => e.getAnimations().forEach((a) => a.cancel()));
    // what left the card: an ink filler where it was, closing on the same spring
    const goneOld = [...was.fk].filter(([k]) => !now.fk.has(k)).map(([, v]) => v);
    if (goneOld.length) {
      const top = Math.min(...goneOld.map((g) => g.top)), bot = Math.max(...goneOld.map((g) => g.top + g.h));
      const f = document.createElement('span');
      f.className = 'rvfill';
      f.style.cssText = `left:0;right:0;top:${top - now.cardTop}px;height:${bot - top}px`;
      card.appendChild(f);
      f.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: dur, easing: ease, fill: 'forwards' }).onfinish = () => f.remove();
    }
    card.querySelectorAll('[data-fk]').forEach((e) => {
      const a = was.fk.get(e.dataset.fk), b = now.fk.get(e.dataset.fk);
      if (!a) { const [sm, se] = smooth(); e.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: Math.min(sm, 420), delay: 200, easing: se, fill: 'backwards' }); return; }
      const dy = a.top - b.top;
      if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: dur, easing: ease });
      if (Math.abs(a.h - b.h) > 0.5 && b.h > 0) {
        const bg = e.querySelector(':scope > .bgk');
        if (bg) bg.animate([{ transform: `scaleY(${a.h / b.h})` }, { transform: 'none' }], { duration: dur, easing: ease });
        [...e.children].filter((x) => !x.classList.contains('bgk')).forEach((x) => x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 140, easing: 'ease-out', fill: 'backwards' }));
      }
    });
    const wasFol = new Map(was.fol);
    now.fol.forEach(([e, t]) => { const t0 = wasFol.get(e); if (t0 == null) return; const dy = t0 - t; if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: dur, easing: ease }); });
    runFx(effects);
  });

  // one-off pieces of acting, after the DOM has the new state
  function runFx(effects) {
    const card = cardRef.current;
    for (const f of effects) {
      const el = card?.querySelector(`[data-rid="${CSS.escape(f.rid)}"]`);
      if (!el) continue;
      if (f.type === 'swap') {
        // the old controls fade where they were, the new mark springs in
        const acts = el.querySelector('.acts');
        if (!acts) continue;
        if (RM()) { acts.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); continue; }
        if (f.ghost) {
          f.ghost.style.cssText = `position:absolute;left:14px;right:14px;top:${acts.offsetTop}px;pointer-events:none`;
          el.appendChild(f.ghost);
          f.ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).onfinish = () => f.ghost.remove();
        }
        const [bm, be] = bouncy();
        const mark = acts.querySelector('.kp .st') || acts.querySelector('.rq.on > i');
        if (mark) mark.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: bm, easing: be, fill: 'backwards', delay: 60 });
        const word = acts.querySelector('.rq.on > b');
        if (word) word.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 80, fill: 'backwards' });
      } else if (f.type === 'qin') {
        const p = el.querySelector('[data-qtx]');
        if (!p) continue;
        p.getAnimations().forEach((a) => a.cancel());
        if (RM()) { p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); continue; }
        const [sm, se] = smooth();
        p.animate([{ opacity: 0, filter: 'blur(2px)', transform: 'translateY(3px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: Math.min(sm, 400), easing: se });
      } else if (f.type === 'pen') {
        const ta = el.querySelector('[data-own]');
        if (ta) { fitTA(ta); try { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); } catch { /* fine */ } }
        if (!RM()) {
          ta?.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200 });
          const [bm, be] = bouncy();
          el.querySelector('.mic')?.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: bm, easing: be });
        }
      } else if (f.type === 'answer') {
        const ans = el.querySelectorAll('[data-ans]'), tk = el.querySelector('[data-ast] .st');
        if (RM()) { ans.forEach((a) => a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 120, fill: 'backwards' })); continue; }
        const [sm, se] = smooth(), [bm, be] = bouncy();
        ans.forEach((a, i) => a.animate([{ opacity: 0, transform: 'translateY(-12px) scale(1.02)', filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: sm, delay: 300 + i * 120, easing: se, fill: 'backwards' }));
        if (tk) tk.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: bm, delay: 220, easing: be, fill: 'backwards' });
      }
    }
  }

  // the last one decided: the card goes first, then the feed closes up
  useLayoutEffect(() => {
    if (view || gone || leaving || !cardRef.current) return;
    const card = cardRef.current;
    if (RM()) { setGone(true); return; }
    setLeaving(true);
    card.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.985)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
      const nl = card.parentElement;
      const fol = nl ? [...nl.children].filter((e) => e !== card && e.classList.contains('nb') && e.offsetTop > card.offsetTop) : [];
      const t0 = fol.map((e) => e.getBoundingClientRect().top);
      setGone(true);
      requestAnimationFrame(() => {
        const [dur, ease] = snappy();
        fol.forEach((e, i) => { const dy = t0[i] - e.getBoundingClientRect().top; if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: dur, easing: ease }); });
      });
    };
  }, [view, gone, leaving]);

  /* ------------------------------ his calls ------------------------------ */
  const ghostOf = (rid) => {
    const acts = cardRef.current?.querySelector(`[data-rid="${CSS.escape(rid)}"] .acts`);
    if (!acts) return null;
    const g = acts.cloneNode(true);
    g.setAttribute('aria-hidden', 'true');
    g.querySelectorAll('button').forEach((b) => { b.tabIndex = -1; });
    return g;
  };
  const settle = (rid, status) => {
    // after his last call the mark holds a moment, then the card leaves the feed
    const after = items.map((r) => (r.rid === rid ? { ...r, status } : r));
    if (after.some((r) => ['new', 'research', 'answered'].includes(r.status)) || undo.size) return false;
    clearTimeout(timers.current.settle);
    setUi((u) => ({ ...u, hold: true }));
    timers.current.settle = setTimeout(() => act(() => setUi((u) => ({ ...u, hold: false }))), 1600);
    return true;
  };
  const fail = (rid) => (e) => {
    act(() => setUi((u) => ({ ...u, openId: rid, err: { ...u.err, [rid]: causeOf(e) } })));
  };
  const clearErr = (rid) => setUi((u) => (u.err[rid] ? { ...u, err: { ...u.err, [rid]: null } } : u));

  const keep = (r) => {
    clearErr(r.rid);
    fx.current.push({ type: 'swap', rid: r.rid, ghost: ghostOf(r.rid) });
    act(() => onWrite(r.rid, { status: 'kept' }, (conn) => api.mentorRaisedStatus(conn, person.id, r.rid, 'kept'), fail(r.rid)));
    if (settle(r.rid, 'kept')) return;
    clearTimeout(timers.current.keep);
    timers.current.keep = setTimeout(() => act(() => setUi((u) => {
      if (u.openId !== r.rid) return u;
      const after = items.map((x) => (x.rid === r.rid ? { ...x, status: 'kept' } : x));
      return { ...u, openId: rvNext(after) };
    })), 1100);
  };
  const dismiss = (r) => {
    clearErr(r.rid);
    const el = cardRef.current?.querySelector(`[data-rid="${CSS.escape(r.rid)}"]`);
    const after = items.map((x) => (x.rid === r.rid ? { ...x, status: 'dismissed' } : x));
    const go = () => {
      clearTimeout(undoT.current.get(r.rid));
      undoT.current.set(r.rid, setTimeout(() => expire(r.rid), RV_UNDO_MS));
      act(() => {
        setUndo((s) => new Set(s).add(r.rid));
        if (openId === r.rid) setUi((u) => ({ ...u, openId: rvNext(after) }));
        onWrite(r.rid, { status: 'dismissed' }, (conn) => api.mentorRaisedStatus(conn, person.id, r.rid, 'dismissed'), (e) => { dropUndo(r.rid); fail(r.rid)(e); });
      });
    };
    if (RM() || !el) { go(); return; }
    [...el.children].filter((x) => !x.classList.contains('bgk')).forEach((x) => x.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-18px)' }], { duration: 170, easing: 'ease-in', fill: 'forwards' }));
    setTimeout(go, 170);
  };
  const dropUndo = (rid) => { clearTimeout(undoT.current.get(rid)); undoT.current.delete(rid); setUndo((s) => { const n = new Set(s); n.delete(rid); return n; }); };
  const expire = (rid) => {
    const el = cardRef.current?.querySelector(`[data-rid="${CSS.escape(rid)}"]`);
    const done = () => act(() => dropUndo(rid));
    if (!el || RM()) { done(); return; }
    el.querySelectorAll('.ur').forEach((x) => x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }));
    setTimeout(done, 160);
  };
  const undoIt = (r) => {
    act(() => {
      dropUndo(r.rid);
      clearTimeout(timers.current.settle);
      setUi((u) => ({ ...u, openId: r.rid, hold: false }));
      onWrite(r.rid, { status: 'new' }, (conn) => api.mentorRaisedStatus(conn, person.id, r.rid, 'new'), fail(r.rid));
    });
  };
  const research = (r) => {
    const tab = ui.tab[r.rid] || (tabsOf(r)[0] || ['true'])[0];
    const { kind, question } = askOf(r, tab, ui.edit[r.rid] ? ui.own[r.rid] : undefined);
    if (!question) return;
    clearErr(r.rid);
    fx.current.push({ type: 'swap', rid: r.rid, ghost: ghostOf(r.rid) });
    act(() => {
      setUi((u) => ({ ...u, edit: { ...u.edit, [r.rid]: false }, tab: { ...u.tab, [r.rid]: tab } }));
      onWrite(r.rid, { status: 'research', asked: { kind, text: question, at: new Date().toISOString() }, researchError: null }, (conn) => api.mentorResearch(conn, person.id, r.rid, kind, question), fail(r.rid));
    });
  };
  const askMore = (r) => act(() => onWrite(r.rid, { status: 'new' }, (conn) => api.mentorRaisedStatus(conn, person.id, r.rid, 'new'), fail(r.rid)));
  const open = (r) => act(() => setUi((u) => ({ ...u, openId: r.rid, edit: {} })));
  const more = () => act(() => setUi((u) => ({ ...u, all: !u.all })));
  const setTab = (r, t) => {
    if (ui.tab[r.rid] === t) return;
    const el = cardRef.current?.querySelector(`[data-rid="${CSS.escape(r.rid)}"] [data-qtx]`);
    setUi((u) => ({ ...u, tab: { ...u.tab, [r.rid]: t }, own: { ...u.own, [r.rid]: undefined } }));
    const show = () => { fx.current.push({ type: 'qin', rid: r.rid }); setUi((u) => ({ ...u, shown: { ...u.shown, [r.rid]: t } })); };
    if (!el || RM()) { show(); return; }
    el.getAnimations().forEach((a) => a.cancel());
    el.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(2px)' }], { duration: 110, easing: 'ease-in', fill: 'forwards' }).onfinish = show;
  };
  const pen = (r) => { fx.current.push({ type: 'pen', rid: r.rid }); setUi((u) => ({ ...u, edit: { ...u.edit, [r.rid]: true } })); };
  const setOwn = (r, text) => setUi((u) => ({ ...u, own: { ...u.own, [r.rid]: text } }));
  const toggleDet = (r) => setUi((u) => ({ ...u, det: { ...u.det, [r.rid]: !u.det[r.rid] } }));

  if (gone || (!view && !leaving && !cardRef.current)) return null;
  const rows = view?.rows || lastRows.current;
  if (view) lastRows.current = view.rows;
  return (
    <article className="nb rv" data-r="tile" data-rvc="" aria-label="For your review" style={vars} ref={cardRef}>
      <div className="rh" data-fk="hd">
        <Who person={person} d={newest ? dayLabel(newest) : ''} />
        <div className="hl"><h3>For your review</h3><span className="rn" ref={rnRef} aria-label={`${view?.count ?? 0} waiting`} /></div>
      </div>
      {rows.map((r) => (
        <RvItem key={r.rid} r={r} open={r.rid === openId} ui={ui} held={undo.has(r.rid)}
          on={{ keep, dismiss, undoIt, research, askMore, open, setTab, pen, setOwn, toggleDet, script: onScript }} />
      ))}
      {view?.more && (
        <div className="rf" data-fk="ft"><span className="bgk" />
          <button className="more" type="button" aria-expanded={ui.all} onClick={more}><Ic n="i-chev" />{ui.all ? 'Show fewer' : `Show all ${view.live}`}</button>
        </div>
      )}
    </article>
  );
}

const fitTA = (ta) => { if (!ta) return; ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };

function RvItem({ r, open, ui, held, on }) {
  const s = r.status;
  const by = byOf(r);
  const v = r.source;
  if (s === 'dismissed' && held) {
    return (
      <div className="rvi gone" data-fk={r.rid} data-rid={r.rid}><span className="bgk" />
        <div className="ur"><s>{r.name}</s><button className="undo press" type="button" onClick={() => on.undoIt(r)}><Ic n="i-undo" />Undo</button></div>
      </div>
    );
  }
  const tok = { kept: <St kind="done" word="Kept" />, research: <St kind="work" word="Researching" />, answered: <St kind="done" word="Answered" /> }[s] || null;
  if (!open) {
    return (
      <article className={`rvi shut ${s}`} data-fk={r.rid} data-rid={r.rid}><span className="bgk" />
        <button className="rvc press" type="button" aria-expanded="false" onClick={() => on.open(r)}>
          <span className="tf">{v?.id ? <Thumb vid={v.id} /> : null}</span>
          <span className="tx"><b>{r.name}</b><small>{by ? <span>{by}</span> : null}{tok}{r.researchError && s === 'new' ? <St kind="need" word="Research failed" /> : null}</small></span>
          <Ic n="i-chev" />
        </button>
      </article>
    );
  }
  const err = ui.err[r.rid];
  const failed = s === 'new' && r.researchError;
  return (
    <article className={`rvi on ${s}`} data-fk={r.rid} data-rid={r.rid}><span className="bgk" />
      {s === 'answered' && <div className="ast" data-ast=""><St kind="done" word="Answered" /></div>}
      {failed && (
        <>
          <div className="ast"><St kind="need" word="Research failed" />
            <button className="qbtn" type="button" aria-expanded={!!ui.det[r.rid]} onClick={() => on.toggleDet(r)}>Details<Ic n="i-chev" /></button>
          </div>
          {ui.det[r.rid] && <div className="det">{r.researchError.why}</div>}
        </>
      )}
      <h4>{r.name}</h4>
      {v?.id && (
        <a className="src" href={watchURL(v.id, r.ts)} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${v.title} from ${r.t}`}>
          <span className="tf"><Thumb vid={v.id} />{r.t ? <span className="tm"><Ic n="i-play" />{r.t}</span> : null}</span>
          <span className="sb">{by ? <b>{by}</b> : null}<span>{v.title}</span></span>
        </a>
      )}
      {v?.id && (
        <div className="sbtns">
          <a className="sbt press" href={watchURL(v.id, r.ts)} target="_blank" rel="noopener noreferrer"><Ic n="i-play" />Watch</a>
          <button className="sbt press" type="button" onClick={() => on.script(r)}><Ic n="i-text" />Transcript</button>
        </div>
      )}
      {r.why ? <p className="why">{r.why}</p> : null}
      {hasQuestion(r) && <Slip r={r} s={s} ui={ui} on={on} />}
      <div className="acts">
        {s === 'kept' ? <span className="kp"><St kind="done" word="Kept" /></span>
          : s === 'research' ? <span className="rq on"><i><Ic n="s-work" /></i><b>Researching</b></span>
            : s === 'answered' ? (
              <>
                <button className="ab press" type="button" onClick={() => on.keep(r)}>Keep</button>
                <button className="ab press" type="button" onClick={() => on.dismiss(r)}>Dismiss</button>
                <button className="ab press" type="button" onClick={() => on.askMore(r)}>Ask more</button>
              </>
            ) : (
              <>
                <button className="ab press" type="button" onClick={() => on.keep(r)}>Keep</button>
                <button className="ab press" type="button" onClick={() => on.dismiss(r)}>Dismiss</button>
                {hasQuestion(r) && <button className="rq press" type="button" onClick={() => on.research(r)}><i><Ic n="i-search" /></i><b>Research</b></button>}
              </>
            )}
      </div>
      {err ? <p className="cause" role="status">{err}</p> : null}
    </article>
  );
}

function Slip({ r, s, ui, on }) {
  if (s === 'answered' && r.answer) {
    const [w0, ...rest] = String(r.answer.text || '').split(' ');
    const asked = r.asked?.text || qOf(r, 'true');
    return (
      <div className="q solo">
        <div className="slip ok" data-slip="">
          <p className="asked">{asked}</p>
          <p className="ans" data-ans=""><b>{w0}</b> {rest.join(' ')}</p>
          {r.answer.sources?.length ? (
            <ul className="srcl" data-ans="">{r.answer.sources.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a></li>)}</ul>
          ) : null}
        </div>
      </div>
    );
  }
  const tabs = tabsOf(r);
  const first = tabs[0][0];
  const tab = ui.tab[r.rid] || first;
  const shown = ui.shown[r.rid] || tab;
  const lock = s !== 'new';
  const ed = ui.edit[r.rid] && !lock;
  const text = lock && r.asked?.text ? r.asked.text : qOf(r, shown);
  return (
    <div className={`q${tab === first ? ' t0' : ''}${s === 'new' || s === 'research' ? '' : ' solo'}`}>
      <div className="qtb" role="tablist" aria-label="What to find out">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={k === tab} disabled={lock && k !== tab} onClick={() => !lock && on.setTab(r, k)}>{l}</button>
        ))}
      </div>
      <div className={`slip${ed ? ' ed' : ''}`} data-slip="">
        {ed
          ? <OwnField value={ui.own[r.rid] ?? qOf(r, tab) ?? ''} onChange={(t) => on.setOwn(r, t)} onSend={() => on.research(r)} />
          : (
            <>
              <p data-qtx="">{text}</p>
              {lock ? null : <button type="button" className="pen press" aria-label="Edit the question" onClick={() => on.pen(r)}><Ic n="i-pen" /></button>}
            </>
          )}
      </div>
    </div>
  );
}

// his own words: the field, and the dictation the app already has (the same
// hook the Capture composer uses). No dictation on this device: no mic.
function OwnField({ value, onChange, onSend }) {
  const val = useRef(value);
  val.current = value;
  const ta = useRef(null);
  const dict = useDictation(() => val.current, (t) => onChange(t), null);
  useLayoutEffect(() => { fitTA(ta.current); }, [value]);
  useEffect(() => () => { if (dict.on) dict.toggle({ force: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <textarea ref={ta} data-own="" rows={2} aria-label="Your question" enterKeyHint="send" value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (dict.on) dict.toggle(); onSend(); } }} />
      {dict.supported && (
        <button type="button" className="mic press" aria-pressed={!!dict.on} aria-label={dict.on ? 'Stop' : 'Say it'} onClick={() => dict.toggle()}><Ic n="i-mic" /></button>
      )}
    </>
  );
}

/* ---------------------------- the transcript sheet --------------------------- */

function TranscriptSheet({ spec, onClosed }) {
  const pal = useMemo(() => paletteFor(spec.person?.colour), [spec.person?.colour]);
  const vars = useMemo(() => regionVars(pal, 'now'), [pal]);
  const shRef = useRef(null), scrimRef = useRef(null), topRef = useRef(null);
  const spRef = useRef(null);
  const [data, setData] = useState({ state: 'loading' });
  const pic = useArt(spec.id ? `/api/mentors/thumb/${encodeURIComponent(spec.id)}` : null);
  const openedAt = useRef(0);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;

  useEffect(() => {
    let live = true;
    const conn = getConnection();
    if (!conn) { setData({ state: 'error', why: 'Offline. Requires Mac connection' }); return undefined; }
    api.mentorTranscript(conn, spec.key, spec.at).then((d) => { if (live) setData({ state: 'ok', d }); }).catch((e) => { if (live) setData({ state: 'error', why: causeOf(e) }); });
    return () => { live = false; };
  }, [spec.key, spec.at]);

  const close = useCallback((v = 0) => {
    const sh = shRef.current, sp = spRef.current;
    const done = () => closedRef.current();
    if (!sh || !sp) { done(); return; }
    if (RM()) {
      sh.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = done;
      scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      return;
    }
    sp.to(sh.offsetHeight, v, done);
  }, []);

  useLayoutEffect(() => {
    const sh = shRef.current, scrim = scrimRef.current;
    const H = () => sh.offsetHeight;
    const sp = Spring((y) => { sh.style.transform = `translate3d(0,${y}px,0)`; scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - y / H()))); });
    spRef.current = sp;
    const off = sheetDrag(topRef.current, sp, H, close);
    openedAt.current = performance.now();
    if (RM()) { sp.set(0); sh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 }); scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 }); }
    else { sp.set(H()); sp.to(0); }
    try { sh.focus({ preventScroll: true }); } catch { /* fine */ }
    return () => { sp.stop(); off(); };
  }, [close]);

  const note = spec.note ?? (data.state === 'ok' ? data.d.note : null);
  const title = spec.title || (data.state === 'ok' ? data.d.title : '');
  return createPortal(
    <div className="nvmen layer" style={{ ...vars, zIndex: 74 }}>
      <div className="vscrim" ref={scrimRef} onClick={() => { if (performance.now() - openedAt.current > 450) close(); }} />
      <section className="vdh tsh" ref={shRef} role="dialog" aria-modal="true" aria-label="Transcript" tabIndex={-1} data-sheet={'off'} style={{ zIndex: 28 }}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <div className="top" ref={topRef}><span className="grab" /><button className="gbtn x press" type="button" aria-label="Close" data-edge-close="" onClick={() => close()}><Ic n="i-x" /></button></div>
        <div className="tsb">
          <div className="rvi">
            <a className="src" href={watchURL(spec.id, spec.ts)} target="_blank" rel="noopener noreferrer" aria-label={`Watch from ${spec.t || '0:00'}`}>
              <span className="tf">{pic ? <img src={pic} alt="" /> : null}<span className="tm"><Ic n="i-play" />{spec.t || '0:00'}</span></span>
              <span className="sb">{spec.by ? <b>{spec.by}</b> : null}<span>{title}</span></span>
            </a>
          </div>
          {note ? <p className="note">{note}</p> : null}
          {data.state === 'ok' && (
            <ol className="tsx">
              {data.d.paras.map((p) => (
                <li key={p.s} className={p.m ? 'at' : ''}>
                  <a href={watchURL(spec.id, p.s)} target="_blank" rel="noopener noreferrer" aria-label={`Watch from ${p.t}`}><span>{p.t}</span></a>
                  <p>{p.x}</p>
                </li>
              ))}
            </ol>
          )}
          {data.state === 'loading' && (
            <ol className="tsx" aria-hidden="true">{[0, 1, 2].map((i) => <li key={i} className="sk"><a><span>{' '.repeat(5)}</span></a><div><p /><p /></div></li>)}</ol>
          )}
          {data.state === 'error' && <p className="tsx-e cause" role="status">{data.why}</p>}
        </div>
      </section>
    </div>,
    document.body,
  );
}

/* ------------------------------- the video tile ------------------------------- */

// one player at a time on the page
const PLAYING = { owner: null, stop: null };

function VideoTile({ v, person, onScript, onBrief }) {
  const pal = useMemo(() => paletteFor(person.colour), [person.colour]);
  const vars = useMemo(() => regionVars(pal, 'now'), [pal]);
  const tileRef = useRef(null), slotRef = useRef(null), bfRef = useRef(null);
  const slot = slotOf(v);
  const [shown, setShown] = useState(slot);
  const [bro, setBro] = useState(0);
  const [det, setDet] = useState(false);
  const [listen, setListen] = useState(false);
  const after = useRef(null);
  const fx = useRef(null);
  const ply = useRef(null);

  // the token changes as the mockup's brSwapSlot acts it: out with a breath of
  // blur, in on a bouncy spring from the right; the brief's arrival is the hero
  useEffect(() => {
    if (slot === shown) return;
    const el = slotRef.current;
    const swap = () => {
      if (slot === 'done' && shown !== 'done') {
        fx.current = 'landed';
        after.current = shiftAfter(tileRef.current, () => {});
        setBro(0);
      } else fx.current = 'slot';
      setShown(slot);
    };
    if (!el || RM()) { swap(); return; }
    el.getAnimations().forEach((a) => a.cancel());
    el.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(.94)', filter: 'blur(2px)' }], { duration: 120, easing: 'ease-in', fill: 'forwards' }).onfinish = swap;
  }, [slot, shown]);

  useLayoutEffect(() => {
    const kind = fx.current;
    fx.current = null;
    if (after.current) { const play = after.current; after.current = null; play(); }
    const el = slotRef.current;
    if (!kind || !el) return;
    el.getAnimations().forEach((a) => a.cancel());
    if (RM()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); if (kind === 'landed') bfRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); return; }
    const [bm, be] = bouncy();
    el.style.transformOrigin = '100% 50%';
    el.animate([{ opacity: 0, transform: 'scale(.9)', filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: bm, easing: be });
    if (kind === 'landed' && bfRef.current) {
      // the hero: the ink section unrolls under the colour, and holds
      const bf = bfRef.current, [sm, se] = smooth();
      bf.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: sm, easing: se });
      bf.querySelectorAll('.k').forEach((k, i) => k.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: sm, delay: 120 + i * 60, easing: se, fill: 'backwards' }));
      const tb = tileRef.current?.querySelector('[data-script]');
      if (tb && tb.dataset.fresh) tb.animate([{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: bm, delay: 160, easing: be, fill: 'backwards' });
    }
  });

  // Transcript springs in with the brief, as the mockup draws it: while a
  // video is being transcribed or read it is not offered yet (one already
  // offered stays)
  const idle = shown !== 'trans' && shown !== 'read';
  const hadScript = useRef(v.hasTranscript && idle);
  const showScript = v.hasTranscript && (idle || hadScript.current);
  const freshScript = showScript && !hadScript.current;
  useEffect(() => { if (showScript) hadScript.current = true; }, [showScript]);

  // a takeaway unfolds to its one line and Watch; the open one folds; everything below slides
  const take = (i) => {
    const bf = bfRef.current;
    if (!bf) return;
    const next = bro === i ? -1 : i;
    const moved = [...bf.querySelectorAll('li,.nums')], t0 = moved.map((e) => e.getBoundingClientRect().top);
    const play = shiftAfter(tileRef.current, () => {});
    fx.current = null;
    after.current = () => {
      play();
      const tx = next >= 0 ? bf.querySelectorAll('[data-tx]')[next] : null;
      if (RM()) { tx?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 }); return; }
      const [sm, se] = smooth();
      moved.forEach((e, k) => { const dy = t0[k] - e.getBoundingClientRect().top; if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: sm, easing: se }); });
      tx?.animate([{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, clipPath: 'inset(0 0 0 0)' }], { duration: sm, easing: se });
    };
    setBro(next);
  };
  const toggleListen = () => {
    const tile = tileRef.current;
    const els = [tile?.querySelector(':scope > .ft'), bfRef.current].filter(Boolean), t0 = els.map((e) => e.getBoundingClientRect().top);
    const play = shiftAfter(tile, () => {});
    after.current = () => {
      play();
      if (RM()) return;
      const [sm, se] = smooth();
      els.forEach((e, i) => { const dy = t0[i] - e.getBoundingClientRect().top; if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: sm, easing: se }); });
      const ply = tile?.querySelector('.ply');
      if (ply && !ply.hidden) ply.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: sm, easing: se });
    };
    // the episode starts inside his tap (iOS plays only from a gesture)
    if (!listen) ply.current?.play(); else ply.current?.pause();
    setListen((x) => !x);
  };
  const toggleDet = () => { const play = shiftAfter(tileRef.current, () => {}); after.current = play; setDet((x) => !x); };

  const brief = shown === 'done' ? v.brief : null;
  const rd = v.read || {};
  const nums = [[rd.ideas, 'ideas'], [rd.scripts, 'scripts'], [rd.lines, 'lines']].filter(([n]) => typeof n === 'number');
  return (
    <article className="nb big" data-r="tile" data-key={v.key} style={vars} ref={tileRef}>
      <Who person={person} d={videoDay(v.date, v.approx)} />
      <a className="thl" href={watchURL(v.id)} target="_blank" rel="noopener noreferrer" aria-label="Watch"><Thumb vid={v.id} hi className="th" /></a>
      <h3>{v.title}</h3>
      <div className="sbtns">
        <a className="sbt press" href={watchURL(v.id)} target="_blank" rel="noopener noreferrer"><Ic n="i-play" />Watch</a>
        {v.audio && <button className="sbt press" type="button" aria-expanded={listen} onClick={toggleListen}><Ic n="i-listen" />Listen</button>}
        {showScript && <button className="sbt press" type="button" data-script="" data-fresh={freshScript ? '1' : undefined} onClick={() => onScript(v)}><Ic n="i-text" />Transcript</button>}
      </div>
      {v.audio && <Player audio={v.audio} open={listen} ctl={ply} onClose={() => setListen(false)} />}
      <div className="ft">{typeof v.sec === 'number' ? `${mins(v.sec)} min` : ''}
        <span className="slot" ref={slotRef}><Slot kind={shown} v={v} onBrief={() => onBrief(v)} /></span>
      </div>
      {shown === 'error' && v.briefError && (
        <div className="btns" style={{ display: 'flex', marginTop: 6 }}>
          <button className="qbtn" type="button" aria-expanded={det} onClick={toggleDet} style={{ paddingLeft: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>Details<Ic n="i-chev" /></button>
        </div>
      )}
      {shown === 'error' && det && v.briefError && <div className="det">{v.briefError.why}</div>}
      {brief && (
        <section className="bf inkg" data-bf="" ref={bfRef}>
          <ol>
            {brief.ideas.map((x, i) => (
              <li key={`${x.name}-${i}`}>
                <button className="tk press" type="button" aria-expanded={i === bro} onClick={() => take(i)}>
                  <span className="k">{i + 1}</span>
                  <span className="nm">{x.name}</span>
                  <span className="by"><span>{x.by} · {x.at}</span>{x.new ? <St kind="dim" word="New" /> : null}</span>
                  <Ic n="i-chev" />
                </button>
                <div className="tx" data-tx="" hidden={i !== bro}>
                  <p>{x.text}</p>
                  <a className="sbt press" href={watchURL(v.id, x.ts)} target="_blank" rel="noopener noreferrer" aria-label={`Watch from ${x.at}`}><Ic n="i-play" />Watch · {x.at}</a>
                </div>
              </li>
            ))}
          </ol>
          {nums.length > 0 && <div className="nums">{nums.map(([n, w]) => <div key={w}><b>{fmt(n)}</b><span>{w}</span></div>)}</div>}
        </section>
      )}
    </article>
  );
}

function Slot({ kind, v, onBrief }) {
  if (kind === 'trans') return <St kind="work" word="Transcribing" />;
  if (kind === 'read') return <St kind="work" word="Reading" />;
  if (kind === 'done') return <><St kind="done" word="Read" />{costLabel(v) ? <span className="cost">{costLabel(v)}</span> : null}</>;
  return (
    <>
      {kind === 'error' ? <St kind="need" word="Could not read" /> : <St kind="dim" word="Not read" />}
      <button className="bm press" type="button" onClick={onBrief}><Ic n="i-brief" />Brief me</button>
    </>
  );
}

const MEDIA_WHY = {
  1: 'The episode stopped loading',
  2: 'The episode could not be downloaded (a network error)',
  3: 'The episode could not be decoded',
  4: 'The podcast host did not hand over a playable episode',
};

// the mini player: the real episode, from audio.url, started by his tap
function Player({ audio, open, ctl, onClose }) {
  const elRef = useRef(null), boxRef = useRef(null), scbRef = useRef(null), flRef = useRef(null), knRef = useRef(null), elTimeRef = useRef(null);
  const [on, setOn] = useState(false);
  const [why, setWhy] = useState(null);
  const [total, setTotal] = useState(audio.sec || 0);
  const raf = useRef(0);
  const width = useRef(0);
  const dragging = useRef(false);

  const el = () => {
    if (!elRef.current) {
      const a = new Audio();
      a.preload = 'none';
      a.src = audio.url;
      a.addEventListener('loadedmetadata', () => { if (Number.isFinite(a.duration) && a.duration > 0) setTotal(a.duration); });
      a.addEventListener('play', () => setOn(true));
      a.addEventListener('pause', () => setOn(false));
      a.addEventListener('ended', () => setOn(false));
      a.addEventListener('error', () => { const c = a.error?.code; setWhy(`${MEDIA_WHY[c] || 'The episode would not play'}${a.error?.message ? ` (${a.error.message})` : ''}`); setOn(false); });
      elRef.current = a;
    }
    return elRef.current;
  };
  const dur = () => { const a = elRef.current; return a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : (audio.sec || 0); };
  const paint = useCallback(() => {
    const a = elRef.current, D = dur();
    const pos = a ? a.currentTime : 0;
    const f = D ? Math.max(0, Math.min(1, pos / D)) : 0;
    if (flRef.current) flRef.current.style.transform = `scaleX(${f})`;
    if (knRef.current) knRef.current.style.transform = `translateX(${f * width.current}px)`;
    if (elTimeRef.current) elTimeRef.current.textContent = hms(pos);
    const s = scbRef.current;
    if (s) { s.setAttribute('aria-valuenow', String(Math.round(pos))); s.setAttribute('aria-valuetext', hms(pos)); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const me = useRef({});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const play = () => {
    const a = el();
    setWhy(null);
    if (PLAYING.owner && PLAYING.owner !== me.current) PLAYING.stop?.();
    PLAYING.owner = me.current;
    PLAYING.stop = () => { elRef.current?.pause(); closeRef.current(); };
    const p = a.play();
    if (p?.catch) p.catch((e) => { setWhy(e?.name === 'NotAllowedError' ? 'The browser would not start the episode without a tap' : `The episode would not play (${e?.message || e?.name || 'no reason given'})`); setOn(false); });
  };
  if (ctl) ctl.current = { play: () => play(), pause: () => elRef.current?.pause() };
  const retry = () => { const a = el(); setWhy(null); a.load(); play(); };

  // open: measure once (the Listen press already started it); close: pause
  useLayoutEffect(() => {
    if (open) { width.current = scbRef.current?.clientWidth || 0; paint(); } else elRef.current?.pause();
  }, [open, paint]);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!on) { paint(); return undefined; }
    const step = () => { if (!dragging.current) paint(); raf.current = requestAnimationFrame(step); };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [on, paint]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); elRef.current?.pause(); if (PLAYING.owner === me.current) { PLAYING.owner = null; PLAYING.stop = null; } }, []);
  useEffect(() => {
    const onR = () => { width.current = scbRef.current?.clientWidth || 0; paint(); };
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, [paint]);

  // drag along the scrubber, or the arrow keys, to move through the episode
  const seekTo = (x) => {
    const r = scbRef.current.getBoundingClientRect();
    const a = el(), D = dur();
    if (!D) return;
    try { a.currentTime = Math.max(0, Math.min(1, (x - r.left) / r.width)) * D; } catch { /* not seekable yet */ }
    paint();
  };
  const down = (e) => { dragging.current = true; try { scbRef.current.setPointerCapture(e.pointerId); } catch { /* fine */ } seekTo(e.clientX); };
  const move = (e) => { if (dragging.current) seekTo(e.clientX); };
  const up = () => { dragging.current = false; };
  const key = (e) => {
    const d = e.key === 'ArrowRight' ? 15 : e.key === 'ArrowLeft' ? -15 : 0;
    if (!d) return;
    e.preventDefault();
    const a = el();
    try { a.currentTime = Math.max(0, Math.min(dur(), a.currentTime + d)); } catch { /* fine */ }
    paint();
  };
  return (
    <div className="ply" hidden={!open} ref={boxRef}>
      <button className="pp press" type="button" aria-label={why ? 'Try again' : on ? 'Pause' : 'Play'}
        onClick={() => { if (why) retry(); else if (on) elRef.current?.pause(); else play(); }}>
        {why ? <Ic n="i-again" /> : on ? <Ic n="i-pause" /> : <Ic n="i-play" className="i f" />}
      </button>
      <div>
        <div className="scb" ref={scbRef} role="slider" tabIndex={0} aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={0}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
          <span className="tr"><span className="fl" ref={flRef} /></span><span className="kn" ref={knRef} />
        </div>
        <div className="tt"><span ref={elTimeRef}>0:00</span><span>{hms(total)}</span></div>
      </div>
      {why ? <p className="pe" role="status">{why}</p> : null}
    </div>
  );
}

/* ------------------------------ compact and learned ---------------------------- */

function CompactRow({ v, person }) {
  const pal = useMemo(() => paletteFor(person.colour), [person.colour]);
  const vars = useMemo(() => regionVars(pal, 'now'), [pal]);
  return (
    <article className="nb cmp" data-r="tile" data-key={v.key} style={vars}>
      <Who person={person} d={videoDay(v.date, v.approx)} />
      <div className="bd">
        <Thumb vid={v.id} className="th" />
        <div><h3>{v.title}</h3><div className="ft">{typeof v.sec === 'number' ? `${mins(v.sec)} min` : ''}<St kind="done" word={cmpWord(v)} /></div></div>
      </div>
    </article>
  );
}

// "What I learned": the week's real numbers; Undo takes back the newest batch,
// in two presses (a batch costs real money to weave again)
function LearnedCard({ l, person, onUndo }) {
  const pal = useMemo(() => paletteFor(person.colour), [person.colour]);
  const vars = useMemo(() => regionVars(pal, 'now'), [pal]);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const t = useRef(0);
  const btn = useRef(null);
  const numRefs = useRef([]);
  const first = useRef(true);
  const nums = [[l.videos, 'videos'], [l.chapters, 'chapters'], [l.ideas, 'ideas'], [l.scripts, 'scripts']];
  useLayoutEffect(() => {
    nums.forEach(([n], i) => odo(numRefs.current[i], n || 0, !first.current));
    first.current = false;
  }, [nums.map(([n]) => n).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(t.current), []);
  const morph = () => {
    const b = btn.current;
    if (!b || RM()) return;
    const [bm, be] = bouncy();
    b.animate([{ transform: 'scale(.94)', filter: 'blur(1.5px)' }, { transform: 'none', filter: 'blur(0)' }], { duration: bm, easing: be });
  };
  const press = async () => {
    if (busy || !l.undo) return;
    if (!armed) {
      setArmed(true); setErr(null); morph();
      clearTimeout(t.current);
      t.current = setTimeout(() => { setArmed(false); morph(); }, 4000);
      return;
    }
    clearTimeout(t.current);
    setBusy(true);
    try { await onUndo(l.undo.batchId); setArmed(false); } catch (e) { setErr(causeOf(e)); setArmed(false); } finally { setBusy(false); }
  };
  return (
    <article className="nb learn inkg" data-r="tile" data-key={`learned:${l.personId}`} style={{ ...vars, background: 'var(--nv-m-ink)', color: '#f6f1ec' }}>
      <Who person={person} d={ymdLabel(l.to)} />
      <h3>What I learned from {person.name}</h3>
      <div className="nums">{nums.map(([, w], i) => <div key={w}><b ref={(e) => { numRefs.current[i] = e; }} /><span>{w}</span></div>)}</div>
      <div className="ft">
        <St kind="done" word="Woven" />
        {l.undo && (
          <button ref={btn} className={`undo press${armed ? ' arm' : ''}`} type="button" disabled={busy} onClick={press}>
            <Ic n="i-undo" />{armed ? `Undo ${l.undo.videos} video${l.undo.videos === 1 ? '' : 's'}` : 'Undo'}
          </button>
        )}
      </div>
      {err ? <p className="cause" role="status">{err}</p> : null}
    </article>
  );
}

/* --------------------------------- the page --------------------------------- */

export function NewsPage({ onClose }) {
  const live = useNewsLive();
  const { news } = live;
  const [sheet, setSheet] = useState(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const prevNews = useRef(null);
  const [landed, setLanded] = useState({});
  useEffect(() => {
    const was = prevNews.current;
    prevNews.current = news;
    const rids = justAnswered(was, news);
    if (!rids.length) return;
    const by = {};
    for (const g of news.raised || []) for (const r of g.items) if (rids.includes(r.rid)) (by[g.personId] ||= []).push(r.rid);
    setLanded(by);
  }, [news]);

  // one write: acted out now, the server's answer settles it, a refusal puts it back
  const write = useCallback((personId) => async (rid, change, call, onFail) => {
    const before = (news?.raised || []).find((g) => g.personId === personId)?.items.find((r) => r.rid === rid);
    live.patch((n) => patchItem(n, personId, rid, (r) => ({ ...r, ...change })));
    const conn = getConnection();
    try {
      if (!conn) throw new Error('Offline. Requires Mac connection');
      const res = await call(conn);
      if (res?.raised) live.patch((n) => patchItem(n, personId, rid, () => res.raised));
      live.reload();
    } catch (e) {
      if (before) live.patch((n) => patchItem(n, personId, rid, () => before));
      onFail?.(e);
    }
  }, [news, live]);

  const brief = useCallback(async (v) => {
    const conn = getConnection();
    const before = v;
    live.patch((n) => patchVideo(n, v.key, (x) => ({ ...x, briefError: null, working: x.hasTranscript ? 'reading' : 'transcript' })));
    try {
      if (!conn) throw new Error('Offline. Requires Mac connection');
      const res = await api.mentorBrief(conn, v.key);
      if (res?.video) live.patch((n) => patchVideo(n, v.key, () => res.video));
      live.reload();
    } catch (e) {
      live.patch((n) => patchVideo(n, v.key, () => ({ ...before, briefError: { why: causeOf(e), at: new Date().toISOString() } })));
    }
  }, [live]);

  const undoWeave = useCallback(async (batchId) => {
    const conn = getConnection();
    if (!conn) throw new Error('Offline. Requires Mac connection');
    await api.mentorWeaveUndo(conn, batchId);
    await live.reload();
  }, [live]);

  const scriptOfItem = (person) => (r) => setSheet({ key: r.source?.id ? `yt:${r.source.id}` : null, id: r.source?.id, title: r.source?.title, by: byOf(r), t: r.t, ts: r.ts, at: r.ts, note: noteOf(r), person });
  const scriptOfTile = (person) => (v) => setSheet({ key: v.key, id: v.id, title: v.title, by: person.name, t: '0:00', ts: 0, at: null, note: undefined, person });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !sheet) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet, onClose]);

  const reviews = reviewsOf(news);
  const feed = feedOf(news);
  const today = dayLabel(new Date());
  return (
    // a page, not a sheet: it leaves by the edge swipe and Escape (data-edge-page)
    <div className="nvmen page newsp" role="dialog" aria-modal="true" aria-label="News" data-edge-page="" data-sheet={'off'} style={{ zIndex: 71 }}>
      <button type="button" className="sr" data-edge-close="" onClick={onClose}>Back</button>
      <div className="scr news">
        <div className="hdr"><h1>News</h1><span>{today}</span></div>
        <div className="nl">
          {reviews.map(({ person, items }) => (
            <ReviewCard key={person.id} person={person} items={items} landed={landed[person.id] || []}
              onWrite={write(person.id)} onScript={scriptOfItem(person)} />
          ))}
          {feed.map((f) => (f.kind === 'learned'
            ? <LearnedCard key={f.key} l={f.l} person={f.person} onUndo={undoWeave} />
            : f.big
              ? <VideoTile key={f.key} v={f.v} person={f.person} onScript={scriptOfTile(f.person)} onBrief={brief} />
              : <CompactRow key={f.key} v={f.v} person={f.person} />))}
          {news && !reviews.length && !feed.length && <div className="nb cmp" style={{ background: 'none', padding: '4px 8px' }}><St kind="dim" word="Nothing new" /></div>}
          {!news && live.error && <p className="cause" role="status" style={{ margin: '8px 8px 0', color: 'var(--nv-m-glass-text)' }}>{live.error}</p>}
          {!news && !live.error && <Skeleton />}
        </div>
        <div className="end" />
      </div>
      {sheet && sheet.key && <TranscriptSheet spec={sheet} onClosed={closeSheet} />}
    </div>
  );
}

// loading is a real state: the shapes of the first card and tile, unlit
function Skeleton() {
  return (
    <>
      <div className="nb" aria-hidden="true" style={{ height: 210, background: 'rgba(255,255,255,.06)' }} />
      <div className="nb" aria-hidden="true" style={{ height: 320, background: 'rgba(255,255,255,.04)' }} />
    </>
  );
}
