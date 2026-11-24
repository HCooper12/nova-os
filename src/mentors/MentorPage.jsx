import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, getConnection } from '../api.js';
import { paletteFor, regionVars, duotoneTables } from './palette.js';
import { pageModel, filterCounts, advanced, vmeta, STAGES, SWORD, fmt, mins } from './mentorModel.js';
import { odo, fitBig, fitName, Spring, sheetDrag, popCell, reducedMotion } from './motion.js';
import { plainCause } from '../../server/lib/plainCause.js';
import { Ic, St, Thumb } from './MentorBits.jsx';
import { useArt, springEase } from './art.js';
import { STATE_SVG } from './stateSvg.js';
import './mentors.css';
import './news.css';

// A MENTOR'S OWN PAGE (Mentors, build slice 1; the approved mockup 125 A,
// "His page", in the colouring he picked, "Colour on top"). Everything on it
// comes from GET /api/mentors/:id, /api/mentors/queue, /api/mentors/:id/wall
// and /api/mentors/:id/book; a thing the server did not give is absent. It is
// its own printed language, the same in every Nova style; around it the app
// is Nova's (a history level of its own, so the back swipe closes it).

/* ------------------------------- live data -------------------------------- */

const WORKING = ['transcript', 'reading', 'weaving', 'finding'];

function useMentorLive(id) {
  const [st, setSt] = useState({ detail: null, queue: null, wall: null, book: null, error: null, at: 0 });
  const ref = useRef(st);
  ref.current = st;
  const busy = useRef(false);
  const load = useCallback(async () => {
    const conn = getConnection();
    if (!conn || busy.current) return;
    busy.current = true;
    try {
      const [detail, queue, wall] = await Promise.all([
        api.mentor(conn, id),
        api.mentorQueue(conn).catch(() => ref.current.queue),
        api.mentorWall(conn, id).catch(() => ref.current.wall),
      ]);
      let book = ref.current.book;
      const woven = detail?.counts?.woven || 0;
      if (woven > 0 && (!book || ref.current.detail?.counts?.woven !== woven)) {
        book = await api.mentorBook(conn, id).then((r) => r.book || null).catch(() => book);
      }
      if (!woven) book = null;
      setSt({ detail, queue, wall, book, error: null, at: Date.now() });
    } catch (e) {
      setSt((s) => ({ ...s, error: e?.message || 'his page could not be read', at: Date.now() }));
    } finally { busy.current = false; }
  }, [id]);

  // refresh on open, on a short beat while something is moving (and while the
  // wall's picture is being built), a long one otherwise, and on his return:
  // iOS suspends timers in the background
  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
  }, [load]);
  const doing = st.queue?.people?.find((p) => p.id === id)?.doing || st.detail?.doing;
  const fast = WORKING.includes(doing) || st.wall?.building || (st.wall && !st.wall.sprite && !st.wall.error);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') load(); }, fast ? 5_000 : 30_000);
    return () => clearInterval(t);
  }, [load, fast]);
  return { ...st, reload: load };
}

/* --------------------------------- sprite --------------------------------- */

function spriteMap(wall) {
  const s = wall?.sprite;
  if (!s?.ids?.length) return null;
  const idx = new Map(s.ids.map((v, i) => [v, i]));
  const missing = new Set(s.missing || []);
  const cols = s.cols || 16, rows = s.rows || 1;
  const pos = (vid) => {
    const i = idx.get(vid);
    if (i == null || missing.has(i)) return null;
    const x = cols > 1 ? (i % cols) * 100 / (cols - 1) : 0;
    const y = rows > 1 ? Math.floor(i / cols) * 100 / (rows - 1) : 0;
    return `${x}% ${y}%`;
  };
  return { pos, size: `${cols * 100}% ${rows * 100}%` };
}

/* --------------------------------- the wall -------------------------------- */

function Wall({ model, sprite, onOpen }) {
  const wallRef = useRef(null);
  const loupeRef = useRef(null);
  const swlRef = useRef(null);
  const live = useRef({ model, sprite, onOpen });
  live.current = { model, sprite, onOpen };
  const cells = model.cells;

  // slide a finger across it and the frame under it lifts; lift or tap to
  // open the list there. No layout is read per move: the grid is measured
  // once at touch-down, and every move is transforms on ten fixed elements.
  useEffect(() => {
    const wall = wallRef.current, lp = loupeRef.current;
    if (!wall || !lp) return undefined;
    const SW = [...swlRef.current.children];
    const lpPic = lp.querySelector('.lp'), lpTitle = lp.querySelector('p'), lm = [...lp.querySelectorAll('.lm > span')];
    let on = false, sx = 0, sy = 0, hold = 0, last = -2, cur = -2, moved = 0, geo = null;
    const RM = reducedMotion();
    const measure = () => {
      const L = wall.querySelectorAll('.gB > i');
      if (L.length < 2) return null;
      const r = wall.getBoundingClientRect(), a = L[0].getBoundingClientRect(), b = L[1].getBoundingClientRect();
      const c = L[16] ? L[16].getBoundingClientRect() : { top: a.top + a.height + 1 };
      return { r, x0: a.left - r.left, y0: a.top - r.top, cw: b.left - a.left, rh: c.top - a.top, w: a.width, h: a.height, n: L.length, rows: Math.ceil(L.length / 16), lw: lp.offsetWidth };
    };
    const at = (x, y) => {
      const g = geo;
      const col = Math.max(0, Math.min(15, Math.floor((x - g.r.left - g.x0 + 0.5) / g.cw)));
      const row = Math.max(0, Math.min(g.rows - 1, Math.floor((y - g.r.top - g.y0 + 0.5) / g.rh)));
      return { col, row, i: Math.min(g.n - 1, row * 16 + col) };
    };
    const swell = (col, row) => {
      const g = geo, { model: M, sprite: S } = live.current;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const el = SW[n++];
        const r = row + dr, c = col + dc, i = r * 16 + c;
        if (r < 0 || r >= g.rows || c < 0 || c > 15 || i < 0 || i >= g.n) { el.style.display = 'none'; continue; }
        const cell = M.cells[i];
        const lv = cell.level, isLift = cell.id === M.workId;
        const s = dr === 0 && dc === 0 ? 2.0 : dr === 0 || dc === 0 ? 1.45 : 1.28;
        el.style.display = 'block';
        el.className = (lv >= 2 || isLift ? '' : 'd') + (lv === 0 && !isLift ? ' s' : '') + (s === 2 ? ' o' : '');
        const p = S?.pos(cell.id);
        el.style.backgroundPosition = p || '0 0';
        el.style.backgroundImage = p ? '' : 'none';
        el.style.zIndex = s === 2 ? 3 : s > 1.4 ? 2 : 1;
        el.style.transform = `translate3d(${g.x0 + c * g.cw}px,${g.y0 + r * g.rh}px,0) scale(${RM ? 1 : s})`;
      }
    };
    const show = (x, y) => {
      if (!geo) return;
      const { col, row, i } = at(x, y);
      cur = i;
      const { model: M, sprite: S } = live.current;
      if (i !== last) {
        last = i;
        swell(col, row);
        const cell = M.cells[i], rowData = M.rows.get(cell.id);
        const p = S?.pos(cell.id);
        lpPic.style.backgroundPosition = p || '0 0';
        lpPic.style.backgroundImage = p ? '' : 'none';
        lpTitle.textContent = rowData?.title || '';
        lm[0].textContent = vmeta(rowData);
        const [kd, wd] = M.stageOf(cell.id);
        lm[1].className = `st ${kd}`;
        lm[1].querySelector('i').innerHTML = STATE_SVG[kd] || STATE_SVG.dim;
        lm[1].querySelector('b').textContent = wd;
      }
      // nothing is measured here: the lens's width was read once at touch-down,
      // and it hangs above the finger by its own height (translateY(-100%))
      const g = geo, lw = g.lw;
      const lx = Math.max(-10, Math.min(g.r.width - lw + 10, x - g.r.left - lw / 2)), ly = y - g.r.top - 46;
      lp.style.transform = `translate3d(${lx}px,${ly}px,0) translateY(-100%)`;
      lp.classList.add('on');
      on = true;
    };
    const end = (open) => {
      clearTimeout(hold);
      lp.classList.remove('on');
      SW.forEach((el) => { el.style.display = 'none'; });
      on = false; last = -2;
      if (open && cur > -2) live.current.onOpen(cur);
    };
    const down = (e) => {
      sx = e.clientX; sy = e.clientY; moved = 0; cur = -2; geo = measure(); clearTimeout(hold);
      if (!geo) return;
      SW.forEach((el) => { el.style.width = `${geo.w}px`; el.style.height = `${geo.h}px`; });
      if (e.pointerType === 'mouse') { show(sx, sy); try { wall.setPointerCapture(e.pointerId); } catch { /* fine */ } }
      else hold = setTimeout(() => { show(sx, sy); try { wall.setPointerCapture(e.pointerId); } catch { /* fine */ } }, 160);
    };
    const move = (e) => {
      moved = Math.max(moved, Math.hypot(e.clientX - sx, e.clientY - sy));
      if (on) { show(e.clientX, e.clientY); return; }
      if (!geo) return;
      if (Math.abs(e.clientX - sx) > 8 && Math.abs(e.clientX - sx) > Math.abs(e.clientY - sy)) { clearTimeout(hold); try { wall.setPointerCapture(e.pointerId); } catch { /* fine */ } show(e.clientX, e.clientY); }
      else if (Math.abs(e.clientY - sy) > 8) clearTimeout(hold);
    };
    const tmove = (e) => { if (on) e.preventDefault(); };
    const up = (e) => { if (!on && moved < 8 && geo) cur = at(e.clientX, e.clientY).i; end(on || moved < 8); geo = null; };
    const cancel = () => { end(false); geo = null; };
    const key = (e) => { if (e.key === 'Enter') live.current.onOpen(Math.max(0, live.current.model.cells.findIndex((c) => c.id === live.current.model.workId))); };
    wall.addEventListener('pointerdown', down);
    wall.addEventListener('pointermove', move);
    wall.addEventListener('touchmove', tmove, { passive: false });
    wall.addEventListener('pointerup', up);
    wall.addEventListener('pointercancel', cancel);
    wall.addEventListener('keydown', key);
    return () => {
      clearTimeout(hold);
      wall.removeEventListener('pointerdown', down);
      wall.removeEventListener('pointermove', move);
      wall.removeEventListener('touchmove', tmove);
      wall.removeEventListener('pointerup', up);
      wall.removeEventListener('pointercancel', cancel);
      wall.removeEventListener('keydown', key);
    };
  }, []);

  // a frame that moved a stage forward pops, then holds its new colour; a
  // whole batch at once (a weave of ten) develops instead, one after another
  const prev = useRef(null);
  useEffect(() => {
    const was = prev.current;
    const ids = advanced(was, model);
    prev.current = model;
    if (!ids.length || !wallRef.current || model.k === 'loading') return;
    const set = new Set(ids);
    const els = wallRef.current.querySelectorAll('.gB > i');
    let n = 0;
    model.cells.forEach((c, i) => {
      if (!set.has(c.id)) return;
      if (ids.length <= 12) popCell(els[i]);
      else if (!reducedMotion() && els[i]?.animate) els[i].animate([{ opacity: 0.5, filter: 'grayscale(1)' }, { opacity: 1, filter: 'none' }], { duration: 650, delay: 120 + (n++ % 40) * 18, easing: 'ease-out', fill: 'backwards' });
    });
  }, [model]);

  // a new video takes the first place and every other frame slides one place
  // on (FLIP: measured by the grid's own arithmetic, moved by transforms only)
  const prevOrder = useRef(null);
  useLayoutEffect(() => {
    const before = prevOrder.current;
    const now = model.cells.map((c) => c.id);
    prevOrder.current = now;
    if (!before || model.k === 'loading' || reducedMotion() || !wallRef.current) return;
    const at = new Map(before.map((id, i) => [id, i]));
    if (now.length === before.length && now.every((id, i) => before[i] === id)) return;
    const A = wallRef.current.querySelectorAll('.gA > i'), B = wallRef.current.querySelectorAll('.gB > i');
    if (A.length < 17) return;
    const a0 = A[0].getBoundingClientRect(), a1 = A[1].getBoundingClientRect(), a16 = A[16].getBoundingClientRect();
    const cw = a1.left - a0.left, rh = a16.top - a0.top;
    now.forEach((id, ni) => {
      const oi = at.get(id);
      for (const el of [A[ni], B[ni]]) {
        if (!el?.animate) continue;
        if (oi == null) {
          el.animate([{ opacity: 0, transform: 'translateY(-18px) scale(1.5)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 380, easing: springEase('bouncy'), fill: 'backwards' });
          continue;
        }
        if (oi === ni) continue;
        const dx = ((oi % 16) - (ni % 16)) * cw, dy = (Math.floor(oi / 16) - Math.floor(ni / 16)) * rh;
        el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 620, delay: Math.min(ni, 120) * 3, easing: springEase('snappy'), fill: 'backwards' });
      }
    });
  }, [model]);

  // the 472 cells are rebuilt only when a cell's class or picture changes,
  // never on a refresh that brought nothing new
  const sig = cells.map((c) => `${c.id}:${c.cls}`).join(',');
  const grids = useMemo(() => {
    const grid = (b) => cells.map((c, i) => {
      const p = sprite?.pos(c.id);
      const np = !p ? ' np' : '';
      return <i key={c.id} data-i={i} className={(b ? c.cls : (c.cls === 'nw' ? 'nw' : '')) + np} style={p ? { backgroundPosition: p, transformOrigin: i % 16 === 0 ? '0 50%' : i % 16 === 15 ? '100% 50%' : undefined } : undefined} />;
    });
    return [grid(false), grid(true)];
  }, [sig, sprite]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`sheet${sprite ? '' : ' plain'}`} ref={wallRef} tabIndex={0} role="button" aria-label="His videos">
      <div className="g gA">{grids[0]}</div>
      <div className="g gB">{grids[1]}</div>
      <div className="swl" ref={swlRef} aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
      <div className="loupe" ref={loupeRef} aria-hidden="true">
        <div className="lt"><div className="lp" /><p /></div>
        <div className="lm"><span className="num" /><StLive /></div>
      </div>
    </div>
  );
}

// the lens's token: drawn once, its kind and word set per frame by the wall
function StLive() {
  return <span className="st dim"><i><svg className="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" /></svg></i><b /></span>;
}

/* --------------------------------- the sheet ------------------------------- */

function VideosSheet({ model, sprite, at, openSeq, open, onClosed }) {
  const vdRef = useRef(null), scrimRef = useRef(null), topRef = useRef(null), listRef = useRef(null);
  const spRef = useRef(null);
  const [filter, setFilter] = useState(0);
  const counts = useMemo(() => filterCounts(model), [model]);
  // the tap that opened the sheet ends in a click that lands on the new scrim;
  // that click is not his asking to close it
  const openedAt = useRef(0);
  const close = useCallback((v = 0) => {
    const vd = vdRef.current, sp = spRef.current;
    if (!vd || !sp) return;
    if (reducedMotion()) { onClosed(); return; }
    sp.to(vd.offsetHeight, v, () => onClosed());
  }, [onClosed]);

  // the spring first (a layout effect, so it exists before the open below runs on mount)
  useLayoutEffect(() => {
    const vd = vdRef.current, scrim = scrimRef.current;
    const H = () => vd.offsetHeight;
    const sp = Spring((y) => { vd.style.transform = `translate3d(0,${y}px,0)`; scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - y / H()))); });
    spRef.current = sp;
    const off = sheetDrag(topRef.current, sp, H, close);
    return () => { sp.stop(); off(); };
  }, [close]);

  // each open: filters back to all, the row he touched in view and marked
  useLayoutEffect(() => {
    const vd = vdRef.current, sp = spRef.current, list = listRef.current;
    if (!vd || !sp || !openSeq) return;
    openedAt.current = performance.now();
    setFilter(0);
    // the row he touched is marked by hand, so opening re-renders no rows
    list.querySelectorAll('.vr.at').forEach((r) => r.classList.remove('at'));
    const row = at >= 0 ? list.querySelector(`.vr[data-i="${at}"]`) : null;
    if (row) row.classList.add('at');
    list.scrollTop = row ? Math.max(0, row.offsetTop - list.offsetTop - 6) : 0;
    if (reducedMotion()) { sp.set(0); vd.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
    sp.set(vd.offsetHeight);
    sp.to(0);
  }, [openSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = filter ? 0 : listRef.current.scrollTop; }, [filter]);

  // 236 rows: built again only when a row's words, token or picture change
  const sig = model.cells.map((c) => `${c.id}:${c.level}:${c.cls}:${model.stageOf(c.id).join('/')}:${model.rows.get(c.id)?.title?.length || 0}`).join(',');
  const rows = useMemo(() => model.cells.map((c, i) => {
    const r = model.rows.get(c.id);
    const [kd, wd] = model.stageOf(c.id);
    const p = sprite?.pos(c.id);
    return (
      <a key={c.id} className="vr" data-i={i} hidden={c.level < filter} href={`https://www.youtube.com/watch?v=${c.id}`} target="_blank" rel="noopener noreferrer">
        <span className={`th${c.level >= 2 || c.id === model.workId ? '' : ' d'}`} style={p ? { backgroundPosition: p } : { backgroundImage: 'none' }} />
        <div><h4>{r?.title || ''}</h4><div className="vm"><span>{vmeta(r)}</span><St kind={kd} word={wd} /></div></div>
      </a>
    );
  }), [sig, sprite, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="vscrim" ref={scrimRef} onClick={() => { if (performance.now() - openedAt.current > 450) close(); }} />
      {/* its own drag (the top edge, a spring he can grab mid-flight, as approved), so the app-wide body drag is off here */}
      <section className="vdh inkg" ref={vdRef} role="dialog" aria-modal={open ? 'true' : undefined} aria-hidden={open ? undefined : 'true'} aria-label="His videos" data-sheet={'off'} style={{ zIndex: 74 }}>
        <div className="top" ref={topRef}><span className="grab" /><button className="gbtn x" type="button" aria-label="Close" data-edge-close="" onClick={() => close()}><Ic n="i-x" /></button></div>
        <div className="vdf" role="group" aria-label="Stage">
          {STAGES.map((s, k) => (
            <button key={s} type="button" aria-pressed={filter === k} aria-disabled={counts[k] ? undefined : 'true'}
              onClick={() => { if (counts[k]) setFilter(k); }}>
              <b className="num">{fmt(counts[k])}</b><span>{s}</span>
            </button>
          ))}
        </div>
        <div className="vdl" ref={listRef}>{rows}</div>
      </section>
    </>
  );
}

/* --------------------------------- the page -------------------------------- */

export function MentorPage({ id, person: person0, onClose }) {
  const live = useMentorLive(id);
  const person = live.detail?.person || person0 || null;
  const pal = useMemo(() => paletteFor(person?.colour), [person?.colour]);
  const duoId = `nvm-duo-${String(id).replace(/[^a-z0-9-]/gi, '')}`;
  const model = useMemo(() => pageModel(live.detail, live.queue, live.wall), [live.detail, live.queue, live.wall]);
  const sprite = useMemo(() => spriteMap(live.wall), [live.wall?.sprite?.file, live.wall?.sprite?.ids?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const spriteUrl = useArt(live.wall?.sprite?.url || null);
  const cut = useArt(person ? `/api/mentors/${encodeURIComponent(id)}/cutout` : null);
  const avatar = useArt(cut === null ? person?.art?.avatar || null : null);

  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState({ mounted: false, at: -1, seq: 0 });
  const [actErr, setActErr] = useState(null);
  const [acting, setActing] = useState(false);

  const rootVars = useMemo(() => ({
    ...regionVars(pal, 'dark', { duo: duoId }),
    '--nv-m-nbb': '#1d2232',
    ...(spriteUrl && sprite ? { '--nv-m-sprite': `url("${spriteUrl}")`, '--nv-m-sprite-size': sprite.size } : { '--nv-m-sprite': 'none', '--nv-m-sprite-size': '1600% 1500%' }),
    zIndex: 71,
  }), [pal, duoId, spriteUrl, sprite]);
  const heroVars = useMemo(() => regionVars(pal, 'now'), [pal]);
  const wallSprite = spriteUrl && sprite ? sprite : null;

  // the skeleton before his page has loaded: his tile's own counts, plain cells
  // Try again on a stopped weave: the strip and the block say Weaving from his
  // tap until the queue's next answer says otherwise (1 going, 2 the working mark)
  const [retry, setRetry] = useState({ phase: 0, after: 0 });
  useEffect(() => {
    if (!retry.phase || !retry.after || live.at <= retry.after) return;
    // an answer after the POST: a stopped weave again, or a real state, ends the mark
    if (model && model.k !== 'idle') setRetry({ phase: 0, after: 0 });
  }, [live.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = model || (person ? skeletonModel(person) : null);
  // between his tap and the weave starting the queue may answer "idle": the
  // block keeps its Weaving mark from the stopped state it came from
  const lastStopped = useRef(null);
  if (base?.k === 'stopped') lastStopped.current = base;
  const shown = useMemo(() => {
    const from = base?.k === 'stopped' ? base : base?.k === 'idle' ? lastStopped.current : null;
    if (!retry.phase || !from) return base;
    const m = base.m.slice(); m[3] = 'work';
    return { ...base, k: 'stopped', act: from.act, m, tok: ['work', 'Weaving', 3] };
  }, [base, retry.phase]);

  /* the numeral and the strip */
  const cntRef = useRef(null), bigRef = useRef(null), ofRef = useRef(null), nameRef = useRef(null);
  const stripRef = useRef(null), stokRef = useRef(null);
  const first = useRef(true);
  const numeral = shown ? shown.n[shown.col] : 0;
  useLayoutEffect(() => {
    if (!shown) return;
    fitBig(cntRef.current, bigRef.current, ofRef.current, fmt(numeral));
    odo(bigRef.current, numeral, !first.current);
    const ns = stripRef.current?.querySelectorAll('[data-n]') || [];
    shown.n.forEach((v, i) => odo(ns[i], v, !first.current));
    if (model) first.current = false;
  }, [numeral, shown?.n.join(','), shown?.col]); // eslint-disable-line react-hooks/exhaustive-deps

  // the token hangs from the column that is moving
  useLayoutEffect(() => {
    const tk = stokRef.current;
    if (!tk || !shown?.tok) return;
    const cells = stripRef.current.querySelectorAll('.sc4');
    const c = cells[shown.tok[2]];
    if (!c) return;
    const cx = c.offsetLeft + c.offsetWidth / 2;
    const tok = tk.querySelector('.st'), stem = tk.querySelector('.stem');
    stem.style.left = `${cx}px`;
    tok.style.left = `${Math.max(0, Math.min(tk.clientWidth - tok.offsetWidth, cx - 13))}px`;
  }, [shown?.tok?.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { fitName(nameRef.current, 74, 36); }, [person?.name]);
  useEffect(() => {
    const on = () => {
      fitName(nameRef.current, 74, 36);
      if (shown) fitBig(cntRef.current, bigRef.current, ofRef.current, fmt(numeral));
    };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [numeral, shown]);

  // the menu closes on any tap outside it
  useEffect(() => {
    if (!menu) return undefined;
    const off = (e) => { if (!e.target.closest('[data-menu],[data-more]')) setMenu(false); };
    document.addEventListener('click', off, true);
    return () => document.removeEventListener('click', off, true);
  }, [menu]);

  const openSheet = useCallback((at) => setSheet((s) => ({ mounted: true, at, seq: s.seq + 1, open: true })), []);
  // the sheet is built while nothing is happening, so the lift of a finger
  // only has to move it, not draw 236 rows first
  const haveModel = !!model;
  useEffect(() => {
    if (!haveModel) return undefined;
    const t = setTimeout(() => setSheet((s) => (s.mounted ? s : { ...s, mounted: true, open: false })), 1500);
    return () => clearTimeout(t);
  }, [haveModel]);
  const closedSheet = useCallback(() => setSheet((s) => ({ ...s, open: false })), []);

  const run = async (fn) => {
    const conn = getConnection();
    if (!conn || acting) return;
    setActing(true); setActErr(null);
    try { await fn(conn); await live.reload(); } catch (e) { setActErr(e?.message || 'it did not go through'); } finally { setActing(false); }
  };
  const weaveRetry = async () => {
    const conn = getConnection();
    if (!conn || retry.phase) return;
    setActErr(null);
    setRetry({ phase: 1, after: 0 });
    try {
      await api.mentorWeaveRetry(conn, id);
      setRetry((r) => ({ ...r, after: Date.now() }));
      await live.reload();
    } catch (e) {
      setRetry({ phase: 0, after: 0 });
      setActErr(plainCause(e));
    }
  };
  const isPaused = shown?.k === 'paused';
  const everyone = !!shown?.everyone;
  const pauseOrResume = () => run((conn) => (isPaused
    ? (everyone ? api.mentorQueuePause(conn, false) : api.mentorPause(conn, id, false))
    : api.mentorPause(conn, id, true)));

  const tiles = useMemo(() => {
    const b = live.book;
    if (!b || shown?.blank) return null;
    return [[b.principles?.length || 0, 'principles'], [b.chapters?.length || 0, 'chapters'], [b.scripts?.length || 0, 'scripts'], [b.cards?.length || 0, 'cards']];
  }, [live.book, shown?.blank]);
  const blank = !tiles;

  const subs = person?.channel?.subscribers;
  const handle = [person?.channel?.handle, subs ? compact(subs) : null].filter(Boolean).join(' · ');
  const hasCut = !!cut;
  const latest = shown?.latest;

  return (
    // a page, not a sheet: it leaves by Back and the edge swipe (data-edge-page), so the app-wide pull-down is off
    <div className="nvmen page" role="dialog" aria-modal="true" aria-label={person?.name || 'Mentor'} data-edge-page="" data-sheet={'off'} style={rootVars}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <filter id={duoId} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values=".33 .5 .17 0 0 .33 .5 .17 0 0 .33 .5 .17 0 0 0 0 0 1 0" />
            <feComponentTransfer>{duotoneTables(pal).map((t, i) => (i === 0 ? <feFuncR key="r" type="table" tableValues={t} /> : i === 1 ? <feFuncG key="g" type="table" tableValues={t} /> : <feFuncB key="b" type="table" tableValues={t} />))}</feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <div className="scr m pp">
        <div className="nav">
          <button className="gbtn glass" type="button" aria-label="Library" data-edge-close="" onClick={onClose}><Ic n="i-back" /></button>
          {model && <button className="gbtn glass" type="button" aria-label="More" data-more="" aria-expanded={menu} onClick={(e) => { e.stopPropagation(); setMenu((x) => !x); }}><Ic n="i-more" /></button>}
        </div>
        <div className="phero" style={heroVars}>
          <div className={`pp-hero${cut === null ? ' sqp' : ''}`}>
            {hasCut && <img className="ph rb" src={cut} alt="" />}
            {cut === null && avatar && <img className="ph" src={avatar} alt="" />}
            <h1 ref={nameRef}>{person?.name || ''}</h1>
            {handle && <div className="hd">{handle}</div>}
          </div>
          {person?.channel?.tagline && <p className="tag">{person.channel.tagline}</p>}
        </div>

        {live.error && !model && <p className="err">{live.error}</p>}

        {shown && (
          <>
            <div className="cnt" ref={cntRef}>
              <span className="big num" ref={bigRef} />
              <span className="of" ref={ofRef}><b className="num"><span className="sl">/</span><span>{fmt(shown.n[0])}</span></b><i>{SWORD[shown.col]}</i></span>
            </div>
            <Wall model={shown} sprite={wallSprite} onOpen={(i) => { if (model) openSheet(i); }} />
            <div className="stp" ref={stripRef}>
              {STAGES.map((s, i) => {
                const kind = shown.m[i];
                return (
                  <div key={s} className={`sc4 ${kind === 'done' ? 'done' : kind === 'dim' ? '' : `now ${kind}`}`}>
                    <b className="num" data-n="" /><span>{s}</span>
                    <i className="mk">{kind === 'dim' ? null : <Ic n={`s-${kind}`} />}</i>
                  </div>
                );
              })}
            </div>
            <div className="stok" ref={stokRef}>{shown.tok && <><span className="stem" /><St kind={shown.tok[0]} word={shown.tok[1]} /></>}</div>
            <Act model={retry.phase && shown?.k === 'stopped' ? shown : model} onResume={pauseOrResume} onRetry={(key) => run((conn) => api.mentorRetrySource(conn, key))} acting={acting} err={actErr}
              retry={retry.phase} onWeaveRetry={weaveRetry} onPhase={(phase) => setRetry((r) => ({ ...r, phase }))} />
            {/* the playbook as an object; opening it is slice 3 */}
            <div className={`pb${blank ? ' blank' : ''}`} aria-hidden={blank ? 'true' : undefined}>
              <span className={`bk${blank ? ' blank' : ''}`} style={{ '--th': (shown.thick || 0.15).toFixed(3) }}>
                <span className="pgs" /><span className="cv"><b>{person?.name}</b><span><i /><small>Playbook</small></span></span>
              </span>
              {tiles && <dl>{tiles.map(([n, w]) => <Pair key={w} n={n} w={w} />)}</dl>}
            </div>
            {latest && (
              <div className="latest">
                <Thumb vid={latest.id} hi />
                <div><h4>{latest.title}</h4><div className="d">{vmeta({ date: latest.date, approx: latest.approx, sec: latest.sec })}</div>{(() => { const [k, w] = shown.stageOf(latest.id); return <St kind={k} word={w} />; })()}</div>
              </div>
            )}
            <Elsewhere person={person} />
          </>
        )}
        <div className="end" />
      </div>
      <div className="cap" style={heroVars} />
      <div className={`menu${menu ? ' on' : ''}`} data-menu="" role="menu">
        <button type="button" role="menuitem" disabled={acting} onClick={() => { setMenu(false); pauseOrResume(); }}><Ic n={isPaused ? 'i-play' : 'i-pause'} /><span>{isPaused ? 'Resume' : 'Pause'}</span></button>
      </div>
      {/* the sheet of his videos sits above Nova's dock and dims it, as the
          approved frame does; his cap stays lit above the scrim */}
      {sheet.mounted && model && createPortal(
        <div className="nvmen layer" style={{ ...rootVars, zIndex: 73, display: sheet.open ? undefined : 'none' }}>
          <VideosSheet model={model} sprite={wallSprite} at={sheet.at} openSeq={sheet.seq} open={!!sheet.open} onClosed={closedSheet} />
          <div className="cap" style={heroVars} />
        </div>,
        document.body,
      )}
    </div>
  );
}

function Pair({ n, w }) {
  return <><dt>{fmt(n)}</dt><dd>{w}</dd></>;
}

// 1,170,000 → 1.17M, as the channel writes it
function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

function skeletonModel(person) {
  const c = person.counts || {};
  const n = [c.total || 0, (c.transcript || 0) + (c.read || 0) + (c.woven || 0), (c.read || 0) + (c.woven || 0), c.woven || 0];
  return {
    k: 'loading', n, m: n.map((v) => (n[0] > 0 && v === n[0] ? 'done' : 'dim')), col: 3, tok: null, act: null,
    cells: Array.from({ length: c.total || 0 }, (_, i) => ({ id: `s${i}`, level: 0, cls: '' })),
    rows: new Map(), order: [], workId: null, stageOf: () => ['dim', ''], latest: null, blank: !c.woven, thick: 0.15,
  };
}

/* ------------------------------ what is moving ----------------------------- */

function Act({ model, onResume, onRetry, acting, err, retry, onWeaveRetry, onPhase }) {
  const a = model?.act;
  if (a?.kind === 'halt') return <div className="act"><Halt a={a} retry={retry} onRetry={onWeaveRetry} onPhase={onPhase} />{err && <p className="err" style={{ margin: '12px 0 0' }}>{err}</p>}</div>;
  if (!a || !a.id) return <div className="act" />;
  const r = model.rows.get(a.id);
  const title = r?.title || '';
  let body = null;
  if (a.kind === 'work') {
    body = <div className="wk"><Thumb vid={a.id} hi /><div><h4>{title}</h4><div className="d">{vmeta(r)}</div><St kind="work" word={a.word} /></div></div>;
  } else if (a.kind === 'lift') {
    body = (
      <div className="lift">
        <Thumb vid={a.id} hi className="fr" />
        <h3>{title}</h3>
        <div className="meta"><St kind="work" word={a.word} /><span>{mins(r?.sec)} min</span><span className="mbk mb" aria-hidden="true" /></div>
      </div>
    );
  } else if (a.kind === 'paused') {
    body = (
      <div className="blk dimg"><Thumb vid={a.id} /><div><h4>{title}</h4><St kind="pause" word="Paused" />
        <div className="btns"><button className="nbtn" type="button" disabled={acting} onClick={onResume}><Ic n="i-play" />Resume</button></div></div></div>
    );
  } else if (a.kind === 'waiting') {
    body = <div className="blk dimg"><Thumb vid={a.id} /><div><h4>{title}</h4><St kind="wait" word={a.word} /></div></div>;
  } else if (a.kind === 'failed') {
    body = (
      <>
        <div className="blk"><FailedCell id={a.id} /><div><h4>{title}</h4><St kind="need" word={a.word} /></div></div>
        <div className="btns" style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
          <button className="nbtn" type="button" disabled={acting} onClick={() => onRetry(a.key)}><Ic n="i-again" />Try again</button>
        </div>
      </>
    );
  }
  return <div className="act">{body}{err && <p className="err" style={{ margin: '12px 0 0' }}>{err}</p>}</div>;
}

// THE STOPPED WEAVE (slice 2; the mockup's "stopped" state): the token and
// the tries, the cause line from the step, Try again and Details (the
// server's own sentence, verbatim). Try again: the button closes into the
// working mark and the block says Weaving, as the mockup's tryAgain acts it.
const easeOf = (n) => getComputedStyle(document.documentElement).getPropertyValue(`--nv-spring-${n}`).trim() || 'ease-out';
const msOf = (n, d) => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--nv-spring-${n}-ms`)); return Number.isFinite(v) && v > 0 ? v : d; };
function shiftBelow(root, fn) {
  const page = root?.closest('.pp');
  const els = page ? [...page.querySelectorAll('.pb,.latest,.rail')] : [];
  const t0 = els.map((e) => e.getBoundingClientRect().top);
  fn();
  return () => {
    if (reducedMotion()) return;
    els.forEach((e, i) => { const dy = t0[i] - e.getBoundingClientRect().top; if (Math.abs(dy) > 0.5) e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: msOf('snappy', 640), easing: easeOf('snappy') }); });
  };
}
function Halt({ a, retry, onRetry, onPhase }) {
  const [det, setDet] = useState(false);
  const root = useRef(null), btn = useRef(null), detRef = useRef(null);
  const after = useRef(null);
  useLayoutEffect(() => {
    const play = after.current;
    after.current = null;
    if (play) play();
  });
  const toggleDet = () => {
    const open = !det;
    const shift = shiftBelow(root.current, () => {});
    after.current = () => {
      shift();
      if (open && detRef.current && !reducedMotion()) detRef.current.animate([{ opacity: 0, clipPath: 'inset(0 0 100% 0 round 4px)' }, { opacity: 1, clipPath: 'inset(0 0 0 0 round 4px)' }], { duration: msOf('smooth', 800), easing: easeOf('smooth') });
    };
    setDet(open);
  };
  const tryAgain = () => {
    if (retry) return;
    const b = btn.current;
    const w = b ? b.offsetWidth : 48;
    const shift = shiftBelow(root.current, () => {});
    after.current = () => {
      shift();
      if (reducedMotion() || !b) { onPhase(2); return; }
      const hh = root.current?.querySelector('.hh .st');
      hh?.animate([{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: msOf('bouncy', 800), easing: easeOf('bouncy') });
      b.querySelectorAll('svg,span').forEach((x) => x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }));
      b.animate([{ clipPath: 'inset(0 0 0 0 round 24px)' }, { clipPath: `inset(0 ${w - 48}px 0 0 round 24px)` }], { duration: 260, easing: easeOf('snappy') }).onfinish = () => onPhase(2);
    };
    onRetry();
  };
  // the working mark arrives
  const was = useRef(retry);
  useLayoutEffect(() => {
    if (retry === 2 && was.current !== 2 && btn.current && !reducedMotion()) btn.current.animate([{ opacity: 0.4, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: msOf('bouncy', 800), easing: easeOf('bouncy') });
    was.current = retry;
  }, [retry]);
  const busy = retry === 2;
  return (
    <div className="halt" ref={root}>
      <div className="hh">{retry ? <St kind="work" word="Weaving" /> : <><St kind="need" word="Weave stopped" />{a.tries ? <span className="tries">{a.tries}</span> : null}</>}</div>
      {!retry && <p className="cause">{a.cause}</p>}
      <div className="btns">
        <button ref={btn} className={`nbtn${busy ? ' busy' : ''}`} type="button" aria-label={retry ? 'Weaving' : 'Try again'} disabled={!!retry} onClick={tryAgain}>
          {busy ? <Ic key="busy" n="s-work" /> : [<Ic key="again" n="i-again" />, <span key="w">Try again</span>]}
        </button>
        {!retry && a.why ? <button className="qbtn" type="button" aria-expanded={det} onClick={toggleDet}>Details<Ic n="i-chev" /></button> : null}
      </div>
      {!retry && det && <div className="det" ref={detRef}>{a.why}</div>}
    </div>
  );
}

function FailedCell({ id }) {
  return <Thumb vid={id} style={{ width: '88px', aspectRatio: '16/9', flex: 'none', borderRadius: '2px', outline: '3px solid var(--nv-m-paper)', objectFit: 'cover' }} />;
}

/* his work elsewhere: the podcast, his books; only what the server holds */
function Elsewhere({ person }) {
  const pod = person?.podcast;
  const podArt = useArt(pod && person?.id ? `/api/mentors/${encodeURIComponent(person.id)}/podcast-art` : null);
  const books = person?.books || [];
  if (!pod && !books.length) return null;
  return (
    <div className="rail" aria-label="Elsewhere">
      {pod && (
        <div className="ri">
          {/* the cover is fetched once from Apple by the server; until it is there his colour stands in */}
          {podArt ? <img className="art" src={podArt} alt="" /> : <span className="art plain" style={{ display: 'block' }} />}
          <h5>{pod.title}</h5>{pod.episodes ? <p>{fmt(pod.episodes)} episodes</p> : null}
        </div>
      )}
      {books.map((b) => (
        <div className="ri" key={b.title}>
          <div className="tnc"><div className="cvr"><b>{b.title}</b><span><i /></span><small>{person.name}</small></div></div>
          <h5>{b.title}</h5><St kind="need" word="Needs the file" />
        </div>
      ))}
    </div>
  );
}
