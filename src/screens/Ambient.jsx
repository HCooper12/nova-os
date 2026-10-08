import { useEffect, useRef, useState } from 'react';
import { NovaCore } from '../NovaCore.jsx';
import { agoWords } from '../vals/valsWall.js';

// THE WALL (mockup 86, blend 1 "Hands up", his pick of 9 Oct 2026: "I like
// option 1"). A phone on a stand, or the Mac: StandBy's glance. At rest it
// is the time, a small core, one serif line, a gold count of what waits on
// him, then Next, Steps and Protein. When an agent needs him, its face rises
// beside the count with a gold numbered badge; whoever is working circles
// the core. Tap the count (or Agents) and a sheet rises with each agent's
// asks, who is working, and all ten.
//
// Every figure is the live state the rest of Nova shows (src/vals/valsOps.js
// and src/vals/valsWall.js): who waits is the Org map's own reading, who
// works is agentsWorking.js. Gold means waiting on his call and nothing
// else; all clear is quiet ink; no signal is grey, with words. A bump never
// ends the wall: a tap shows Done, Dim and Agents; Done, Esc or a swipe down
// returns to where he came from, and Back never brings the wall back.

const CORE = { P: 104, L: 58, M: 84 };
const ORBIT = { P: [168, 32], L: [112, 26], M: [156, 34] };
const HAND = { P: 46, L: 46, M: 54 };
const CTL_MS = 5000;
const HINT_MS = 2600;
const PULSE_MS = 120_000;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => Number(n).toLocaleString('en-AU');

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// Best-effort screen wake lock — supported on installed PWAs and desktop
// Chrome/Safari; where it isn't, the OS display sleep just applies.
function useWakeLock() {
  const lock = useRef(null);
  useEffect(() => {
    let alive = true;
    const acquire = async () => {
      try { if (alive && navigator.wakeLock) lock.current = await navigator.wakeLock.request('screen'); } catch { /* best-effort */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      try { lock.current?.release(); } catch { /* released with the page */ }
    };
  }, []);
}

// Upright, on a stand, or the Mac: the wall's three shapes.
function shapeOf() {
  if (typeof window === 'undefined') return 'P';
  const w = window.innerWidth, h = window.innerHeight;
  if (w <= h) return 'P';
  return w >= 1000 && h >= 600 ? 'M' : 'L';
}
function useShape() {
  const [s, setS] = useState(shapeOf);
  useEffect(() => {
    const on = () => setS(shapeOf());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return s;
}

// Text that changes acted out: a short blur-out, then the new words.
function Swap({ text, className, as: Tag = 'span', ...rest }) {
  const [shown, setShown] = useState(text);
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (text === shown) return undefined;
    if (reduced()) { setShown(text); return undefined; }
    setOut(true);
    const t = setTimeout(() => { setShown(text); setOut(false); }, 200);
    return () => clearTimeout(t);
  }, [text, shown]);
  return <Tag className={`${className || ''}${out ? ' swap-out' : ''}`} {...rest}>{shown}</Tag>;
}

// The count steps one at a time toward its value, each step a roll.
function Count({ value }) {
  const [shown, setShown] = useState(value);
  const [prev, setPrev] = useState(null);
  useEffect(() => {
    if (value == null || shown == null || reduced()) { setShown(value); setPrev(null); return undefined; }
    if (shown === value) return undefined;
    const t = setTimeout(() => {
      const step = value > shown ? 1 : -1;
      setPrev({ v: shown, dir: step > 0 ? 'up' : 'down', k: `${shown}-${Date.now()}` });
      setShown(shown + step);
    }, prev ? 120 : 0);
    return () => clearTimeout(t);
  }, [value, shown, prev]);
  if (value == null) return <span className="cnt unk" role="status" aria-label="No signal" />;
  return (
    <span className="cnt" role="status" aria-label={`${value} waiting`}>
      <span className="roll" aria-hidden="true">
        {prev && <span key={prev.k} className={`out ${prev.dir}`}>{prev.v}</span>}
        <span key={`c${shown}`} className={prev ? `in ${prev.dir}` : ''}>{shown}</span>
      </span>
    </span>
  );
}

function Face({ b, f, className = '', badge = null, label, style }) {
  return (
    <span className={`fc ${className}`} style={{ '--f': `${f}px`, '--h': b.hue, ...style }} aria-label={label} role={label ? 'img' : undefined}>
      <img src={b.face} alt="" draggable="false" />
      <i className="badge" aria-hidden="true">{badge ?? ''}</i>
    </span>
  );
}

const chev = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;

// Whoever is waiting rises beside the count: three faces at most, then +N.
// Every being's face is always there, risen or not, so a face that stops
// waiting sinks out the way it came rather than vanishing.
function Hands({ all, waiting, f }) {
  const vis = waiting.slice(0, 3);
  const more = waiting.length - vis.length;
  const step = Math.round(f * 0.9);
  const width = vis.length ? f + step * (vis.length - 1) + (more > 0 ? 54 : 0) : 0;
  const seen = useRef(new Set());
  // a face that was already up does not wait its turn again
  const delays = {};
  vis.forEach((b, i) => { delays[b.id] = seen.current.has(b.id) ? 0 : i * 70; });
  useEffect(() => { seen.current = new Set(vis.map((b) => b.id)); });
  const at = new Map(vis.map((b, i) => [b.id, i]));
  // where each face last stood, so one that sinks out leaves from its place
  const lastX = useRef({});
  vis.forEach((b, i) => { lastX.current[b.id] = i * step; });
  return (
    <span className={`hands${vis.length ? ' has' : ''}`} style={{ '--f': `${f}px`, width }}>
      {all.map((b) => {
        const i = at.get(b.id);
        const up = i != null;
        return (
          <Face key={b.id} b={b} f={f} className={up ? 'on ask' : ''} badge={up ? vis[i].n : null} label={up ? `${b.name}, ${vis[i].n} waiting` : undefined}
            style={up ? { '--x': `${i * step}px`, zIndex: 10 - i, transitionDelay: `${delays[b.id]}ms` } : { '--x': `${lastX.current[b.id] || 0}px`, transitionDelay: '0ms' }} />
        );
      })}
      <span className={`more${more > 0 ? ' on' : ''}`} style={{ '--x': `${vis.length * step + 6}px` }} aria-hidden={more <= 0}>{more > 0 ? `+${more}` : ''}</span>
    </span>
  );
}

// The core, small and capped, and whoever is working circling it.
function CoreOrbit({ v, shape, dimmed, all }) {
  const [o, fw] = ORBIT[shape];
  const n = all.length;
  return (
    <div className="coreorb" style={{ '--o': `${o}px`, '--fw': `${fw}px` }}>
      <span className="core">
        <NovaCore size={CORE[shape]} engine={v.coreStyle} fps={30} still={dimmed}
          speaking={!!v.novaSpeaking} listening={!!v.novaListening} thinking={!!v.novaThinking} contest={!!v.novaContest} />
      </span>
      <div className="orb" aria-hidden="true">
        <i className="trail" />
        {all.map((b, i) => (
          <span key={b.id} className={`ow${b.working ? ' on' : ''}`} style={{ '--a': `${Math.round(i * (360 / n) + 20)}deg` }}>
            <span className="cs"><Face b={b} f={fw} /></span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Readouts({ v }) {
  const next = v.ambientNext;
  const steps = v.ambientSteps;
  const p = v.ambientProtein;
  return (
    <div className="ro3">
      <div className="ro"><span className="k">Next</span><span className="n">{next ? next.time : 'None'}</span><span className="s">{next ? next.label : 'nothing else today'}</span></div>
      <div className="ro"><span className="k"><i className="dot" style={{ '--d': 'var(--nv-vi)' }} />Steps</span>
        <span className="n">{steps != null ? fmt(steps) : 'None'}</span><span className="s">{steps != null ? `of ${fmt(v.ambientStepGoal)}` : 'no reading yet'}</span></div>
      <div className="ro"><span className="k"><i className="dot" style={{ '--d': 'var(--nv-good)' }} />Protein</span>
        <span className="n">{p ? <>{p.p}<small>g</small></> : 'None'}</span><span className="s">{p ? (p.floor ? `of ${p.floor} g` : 'today') : 'no reading yet'}</span></div>
    </div>
  );
}

// One cached pulse item at a time, every two minutes; none cached, none shown.
function Pulse({ items }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!items?.length || items.length < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), PULSE_MS);
    return () => clearInterval(t);
  }, [items?.length]);
  if (!items?.length) return null;
  const it = items[i % items.length];
  return (
    <div className="ro pulse">
      <span className="k">From the pulse</span>
      <Swap as="p" className="say" text={it.title} />
      <span className="s">{it.source ? `${it.source} · ` : ''}changes every two minutes</span>
    </div>
  );
}

function LatelyList({ items }) {
  if (!items?.length) return null;
  return (
    <div className="ro">
      <span className="k">Lately</span>
      <ul className="late">
        {items.slice(0, 3).map((e) => <li key={e.id}><span className="lt">{e.label}</span><span className="s">{agoWords(e.when)}</span></li>)}
      </ul>
    </div>
  );
}

const pips = (n, c) => (
  <span className="pips" aria-hidden="true">{Array.from({ length: Math.min(n, 14) }, (_, i) => <i key={i} style={{ '--d': c }} />)}</span>
);
function Streaks({ items }) {
  if (!items?.length) return null;
  return (
    <div className="stks">
      {items.map((o) => (
        <div key={o.key} className="stk">
          <span className="k">{o.label}</span>
          {o.key === 'fuel'
            ? <span className="meter" aria-hidden="true"><i style={{ width: `${Math.round((o.met / o.tracked) * 100)}%` }} /></span>
            : pips(o.n, o.key === 'steps' ? 'var(--nv-vi)' : 'var(--w-ink)')}
          <span className="s">{o.line}</span>
        </div>
      ))}
    </div>
  );
}

function syncWords(w, min) {
  if (min == null) return '';
  const stale = !w.signal || min >= 15;
  if (stale) return `Last synced ${min} min ago`;
  return min === 0 ? 'Synced just now' : `Synced ${min} min ago`;
}

function AskList({ b, onAsk }) {
  return (
    <ul className="asks">
      {b.asks.map((a) => (
        <li key={a.id}>
          <button type="button" className="askb" onClick={() => onAsk(a.id)} aria-label={`${a.title}, ${a.when}. Open it in the Inbox`}>
            <i className="gd" aria-hidden="true" /><span className="tt">{a.title}</span><span className="s">{a.when}</span><span className="ch" aria-hidden="true">›</span>
          </button>
        </li>
      ))}
      {b.more > 0 && <li className="s">{b.more} more in the Inbox</li>}
    </ul>
  );
}

// THE SHEET: each agent's asks, who is working, all ten.
function Sheet({ w, open, shape, onClose, onAsk, onInbox, onTalk }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const [pick, setPick] = useState(null);
  useEffect(() => { if (!open) setPick(null); }, [open]);
  const picked = pick ? w.all.find((b) => b.id === pick) : null;
  const down = (e) => {
    if (shape !== 'P' || e.target.closest('button')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    ref.current.classList.add('drag');
  };
  const move = (e) => {
    const g = drag.current;
    if (!g) return;
    g.dy = e.clientY - g.y;
    ref.current.style.transform = `translateY(${g.dy < 0 ? g.dy * 0.2 : g.dy}px)`;
  };
  const up = () => {
    const g = drag.current;
    drag.current = null;
    if (!g) return;
    ref.current.classList.remove('drag');
    ref.current.style.transform = '';
    const vel = g.dy / Math.max(1, performance.now() - g.t);
    if (g.dy > 90 || vel > 0.5) onClose();
  };
  return (
    <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label="Your agents" aria-hidden={!open} inert={!open ? true : undefined}>
      <div className="sh-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="grab" aria-hidden="true" />
        <div className="sh-t"><h2>Your agents</h2><button type="button" className="cb" onClick={onClose}>Close</button></div>
        <p className="sh-say">{w.sayLine}</p>
      </div>
      <div className="sh-body">
        {!w.signal ? (
          <p className="s">Nova cannot reach the Mac, so nobody's asks or work can be read. The wall will fill in when it answers.</p>
        ) : (
          <>
            {w.waiting.map((b) => (
              <section key={b.id} className="ag" style={{ '--h': b.hue }} aria-label={b.name}>
                <div className="ag-h"><Face b={b} f={40} /><div><b>{b.name}</b><span className="s">{b.district} · {b.line}</span></div></div>
                <AskList b={b} onAsk={onAsk} />
              </section>
            ))}
            {w.yours && (
              <section className="ag" style={{ '--h': 'var(--nv-cy)' }} aria-label="Yours to sort">
                <div className="ag-h"><div><b>Yours to sort</b><span className="s">{w.yours.n === 1 ? 'One of your own notes' : `${w.yours.n} of your own notes`} waiting to be sorted.</span></div></div>
                <AskList b={{ asks: w.yours.asks, more: Math.max(0, w.yours.n - w.yours.asks.length) }} onAsk={onAsk} />
              </section>
            )}
            {w.unfiled && <p className="s" style={{ margin: '6px 0' }}>{w.unfiled.n} more from {w.unfiled.kinds.join(', ')}, which have no one on the map yet.</p>}
            {!w.total && <p className="s" style={{ margin: '6px 0' }}>Nothing is waiting on you.</p>}
            <p className="shk">Working now</p>
            {w.working.length ? (
              <div className="wrk">{w.working.map((b) => <span key={b.id}><Face b={b} f={30} />{b.name}</span>)}</div>
            ) : <p className="s" style={{ margin: 0 }}>Nobody is working right now.</p>}
          </>
        )}
        <p className="shk">All ten</p>
        <div className="all">
          {w.all.map((b) => (
            <button key={b.id} type="button" className={`sb${b.working ? ' work' : ''}`} style={{ '--h': b.hue, '--f': '36px', opacity: b.opacity }}
              aria-label={`${b.name}. ${b.line}`} aria-pressed={pick === b.id} onClick={() => setPick(pick === b.id ? null : b.id)}>
              <i className="wr" aria-hidden="true" />
              <Face b={b} f={36} className={b.n ? 'ask' : ''} badge={b.n || null} />
            </button>
          ))}
        </div>
        <Swap as="p" className="s allcap" aria-live="polite" text={picked ? `${picked.name} · ${picked.line}` : 'Tap a face to hear how it is doing.'} />
      </div>
      <div className="sh-foot">
        <button type="button" className="cb pri" onClick={onInbox}>Open the Inbox</button>
        <button type="button" className="cb" onClick={onTalk}>Talk it through</button>
      </div>
    </div>
  );
}

export function Ambient({ v }) {
  const now = useClock();
  useWakeLock();
  const shape = useShape();
  const w = v.wall || { signal: false, total: null, waiting: [], working: [], all: [], whoLine: '', sayLine: '', workLine: '', preview: [], previewRest: 0 };
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [ctl, setCtl] = useState(true);
  const [hint, setHint] = useState(false);
  const [dimSet, setDimSet] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const gest = useRef(null);
  const ctlTimer = useRef(0);

  const hour = now.getHours();
  // a night dim from 22:00 to 06:00 (round 1's pick), unless he says otherwise
  const dimmed = dimSet ?? (hour >= 22 || hour < 6);
  const pages = shape === 'M' ? 1 : 2;
  const att = w.signal && w.total > 0;

  const showCtl = () => {
    setCtl(true);
    clearTimeout(ctlTimer.current);
    if (shape !== 'M') ctlTimer.current = setTimeout(() => setCtl(false), CTL_MS);
  };
  // on arrival the controls show, then fade; the hint says how to bring them back
  useEffect(() => {
    showCtl();
    if (shape === 'M') return undefined;
    const h1 = setTimeout(() => setHint(true), CTL_MS);
    const h2 = setTimeout(() => setHint(false), CTL_MS + HINT_MS);
    return () => { clearTimeout(h1); clearTimeout(h2); clearTimeout(ctlTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (page > pages - 1) setPage(0); }, [page, pages]);

  const leave = () => {
    if (leaving) return;
    if (reduced()) { v.exitAmbient(); return; }
    setLeaving(true);
    setTimeout(() => v.exitAmbient(), 260);
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (sheetRef.current) setSheet(false); else leaveRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // the glance and Lately swipe sideways; a swipe down leaves (upright)
  const down = (e) => {
    if (sheet) return;
    gest.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, dy: 0, axis: null };
  };
  const move = (e) => {
    const g = gest.current;
    if (!g) return;
    g.dx = e.clientX - g.x; g.dy = e.clientY - g.y;
    if (!g.axis && Math.hypot(g.dx, g.dy) > 10) {
      g.axis = Math.abs(g.dx) > Math.abs(g.dy) ? 'x' : 'y';
      if (g.axis === 'x' && pages > 1) {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
        trackRef.current.style.transition = 'none';
      }
    }
    if (g.axis === 'x' && pages > 1) {
      const W = rootRef.current.clientWidth;
      const edge = (page === 0 && g.dx > 0) || (page === pages - 1 && g.dx < 0);
      trackRef.current.style.transform = `translateX(${-page * W + (edge ? g.dx * 0.3 : g.dx)}px)`;
    }
  };
  const up = () => {
    const g = gest.current;
    gest.current = null;
    if (!g?.axis) return;
    const vel = Math.hypot(g.dx, g.dy) / Math.max(1, performance.now() - g.t);
    if (g.axis === 'x' && pages > 1) {
      trackRef.current.style.transition = '';
      trackRef.current.style.transform = '';
      if (Math.abs(g.dx) > 60 || vel > 0.35) setPage(Math.max(0, Math.min(pages - 1, page + (g.dx < 0 ? 1 : -1))));
    } else if (g.axis === 'y' && shape === 'P' && g.dy > 90) {
      leave();
    }
  };
  // a tap on nothing in particular shows the controls; a bump never leaves
  const onClick = (e) => {
    if (e.target.closest('button, .sheet')) { if (!e.target.closest('.sheet')) showCtl(); return; }
    showCtl();
  };

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/,/g, '');
  const stale = v.ambientSyncMin != null && v.ambientSyncMin >= 15;
  const sync = syncWords(w, v.ambientSyncMin);
  const askLabel = `Waiting on you: ${w.whoLine}. Open your agents.`;
  const talkSubject = () => {
    if (!w.total) return 'Talk me through my day.';
    const asks = w.waiting.flatMap((b) => b.asks.map((a) => `${a.title} (the ${b.name})`));
    return `Talk me through what is waiting on me. ${w.sayLine}${asks.length ? ` ${asks.join('; ')}.` : ''}`;
  };

  const clock = <div className="clock" aria-label={`${hh}:${mm}`}>{hh}<span className="colon" aria-hidden="true">:</span>{mm}</div>;
  const dateEl = <div className="date">{date}</div>;
  const core = <CoreOrbit v={v} shape={shape} dimmed={dimmed} all={w.all.length ? w.all : []} />;
  const wk = <Swap className="s wk" aria-live="polite" text={w.workLine} />;
  const say = v.heroTagline ? <p className="say">{v.heroTagline}</p> : null;
  const waitBlock = (
    <button type="button" className="wait" onClick={(e) => { e.stopPropagation(); setSheet(true); }} aria-label={askLabel}>
      <span className="k">Waiting on you{chev}</span>
      <span className="wrow"><Count value={w.signal ? w.total : null} /><Hands all={w.all} waiting={w.signal ? w.waiting : []} f={HAND[shape]} /></span>
      <Swap className="s who" text={w.whoLine} />
    </button>
  );
  const readouts = <div style={{ width: '100%', opacity: stale ? 0.55 : 1, transition: 'opacity 1.2s' }}><Readouts v={v} /></div>;
  const lately = (
    <>
      <Pulse items={v.ambientPulseItems} />
      <LatelyList items={v.ambientStream} />
      <Streaks items={v.ambientObjectives} />
      {!v.ambientPulseItems?.length && !v.ambientStream?.length && !v.ambientObjectives?.length && <p className="s">Nothing new lately.</p>}
    </>
  );

  let glance;
  if (shape === 'P') {
    glance = (
      <div className="g">
        <div className="top">{clock}{dateEl}</div>
        <div className="mid">{core}{wk}</div>
        {say}
        {waitBlock}
        {readouts}
      </div>
    );
  } else if (shape === 'L') {
    glance = (
      <div className="g">
        <div className="lp">{clock}{dateEl}<div className="nova">{core}{wk}</div></div>
        <div className="rp">{say}{waitBlock}{readouts}</div>
      </div>
    );
  } else {
    glance = (
      <div className="g">
        <div className="lp">{clock}{dateEl}<div className="nova">{core}{wk}</div></div>
        <div className="rp">
          {say}{waitBlock}
          {w.preview.length > 0 && (
            <ul className="prev" aria-label="What they are asking">
              {w.preview.map((r) => (
                <li key={r.id}><Face b={r.being} f={28} /><span>{r.title}<span className="s">{r.being.name}</span></span></li>
              ))}
              {w.previewRest > 0 && <li><span /><span className="s">and {w.previewRest} more · tap the count</span></li>}
            </ul>
          )}
          {readouts}
        </div>
        <div className="band">
          <div className="col"><Pulse items={v.ambientPulseItems} /></div>
          <div className="col"><LatelyList items={v.ambientStream} /></div>
          <div className="col"><Streaks items={v.ambientObjectives} /></div>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`nv-wall ${shape}${leaving ? ' leaving' : ''}`} role="region" aria-label="The wall"
      data-att={att ? '1' : '0'} data-off={w.signal ? '0' : '1'} data-work={w.signal && w.working.length ? '1' : '0'}
      data-ctl={ctl ? '1' : '0'} data-dim={dimmed ? '1' : '0'} data-sheet={sheet ? '1' : '0'} onClick={onClick}>
      <div ref={trackRef} className="track" style={{ transform: `translateX(${-page * 100}%)` }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <section className="page" aria-label="The glance" aria-hidden={page !== 0}><div className="drift">{glance}</div></section>
        {pages > 1 && <section className="page" aria-label="Lately" aria-hidden={page !== 1}><div className="drift"><div className="lately">{lately}</div></div></section>}
      </div>
      {shape !== 'M' ? (
        <div className="foot">
          <div className="pd" role="group" aria-label="Pages">
            {['The glance', 'Lately'].map((n, i) => (
              <button key={n} type="button" aria-label={n} aria-current={page === i} onClick={(e) => { e.stopPropagation(); setPage(i); }}><i /></button>
            ))}
          </div>
          {sync && <span className="sync" style={shape === 'L' ? { alignSelf: 'center' } : undefined}>{sync}</span>}
        </div>
      ) : sync ? <span className="sync syncm">{sync}</span> : null}
      <i className="floor" aria-hidden="true" />
      <i className="edge" aria-hidden="true" />
      <div className="dim" aria-hidden="true" />
      <div className="ctl" role="toolbar" aria-label="Wall controls" aria-hidden={!ctl} inert={!ctl ? true : undefined}>
        <button type="button" className="cb done" onClick={(e) => { e.stopPropagation(); leave(); }}>Done</button>
        <span className="key" aria-hidden="true">esc</span>
        <span className="sp" />
        <button type="button" className="cb" aria-pressed={dimmed} onClick={(e) => { e.stopPropagation(); setDimSet(!dimmed); showCtl(); }}>Dim</button>
        <button type="button" className="cb" onClick={(e) => { e.stopPropagation(); setSheet(true); }}>Agents</button>
      </div>
      <div className={`hint${hint && !ctl && !sheet ? '' : ' gone'}`} aria-hidden="true">Tap for controls</div>
      <div className="scrim" onClick={(e) => { e.stopPropagation(); setSheet(false); }} aria-hidden="true" />
      <Sheet w={w} open={sheet} shape={shape} onClose={() => setSheet(false)}
        onAsk={(id) => v.wallOpenAsk(id)} onInbox={() => v.wallOpenInbox()} onTalk={() => v.wallTalk(talkSubject())} />
    </div>
  );
}

