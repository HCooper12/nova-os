import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eyebrow, Chevron } from '../Controls.jsx';
import { switchHapticRef, haptic } from '../haptics.js';
import { refuse } from '../settingsToast.js';

// THE PARTS SETTINGS IS BUILT FROM (direction A, mockup 72): the row, the
// switch, the segmented picker, the pill that opens a menu, the group, the
// header card, the tile and its marks. One switch, one picker, one fill: the
// accent means on or chosen, and a test is a text button (finding 7: five
// on/off grammars and one cyan fill doing three jobs). Every control is
// 44 pt to the finger. Labels and text buttons go through Controls.jsx.

// The marks, one stroke family (mockup 72's symbols)
const MARKS = {
  chev: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  back: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  updown: <path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4" />,
  wave: <path d="M4 11v2M7.5 8.5v7M11 5.5v13M14.5 8v8M18 10v4M21 11.5v1" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  bell: <><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>,
  calm: <><circle cx="12" cy="12" r="4" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" /></>,
  dock: <><rect x="3" y="13.5" width="18" height="7" rx="3.5" /><path d="M7.5 17h.01M12 17h.01M16.5 17h.01M7 4.5h10M9 8.5h6" /></>,
  dumbbell: <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />,
  laptop: <><rect x="4" y="5" width="16" height="11" rx="1.6" /><path d="M2 19.5h20" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  chip: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" /></>,
  clock: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4v4.5H9" /><path d="M12 8v4.5l3 2" /></>,
  checkc: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5.5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  grip: <path d="M5 8h14M5 12h14M5 16h14" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
};

export function Ico({ n, className = '' }) {
  return (
    <svg className={`nv-set-ic ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{MARKS[n]}</svg>
  );
}

export function Tile({ icon, hue, lg, children, className = '', style }) {
  return (
    <span className={`nv-set-tile${lg ? ' lg' : ''} ${className}`} style={{ ...(hue ? { '--h': hue } : null), ...style }} aria-hidden="true">
      {children || <Ico n={icon} />}
    </span>
  );
}

// A VALUE ON THE RIGHT. A string, or what the Mac said: a skeleton while it
// is still answering, and offline what it last said with the time it said it.
// A changed value flips in; the first one does not.
export function Val({ v, ok, staleAt, className = '' }) {
  const text = typeof v === 'string' ? v : v?.text || '';
  const loading = typeof v === 'object' && v?.loading;
  const stale = typeof v === 'object' && v?.stale;
  const shown = stale && staleAt ? `${text} · ${staleAt}` : text;
  const prev = useRef(null);
  const flip = prev.current != null && prev.current !== shown;
  useEffect(() => { prev.current = shown; });
  if (loading) return <span className={`nv-set-rv ${className}`}><span className="nv-set-sk" role="img" aria-label="Loading" /></span>;
  if (!shown) return null;
  return <span key={shown} className={`nv-set-rv${ok ? ' ok' : ''}${stale ? ' stale' : ''}${flip ? ' nv-set-flip' : ''} ${className}`}>{shown}</span>;
}

// THE SWITCH. A real checkbox (with iOS's `switch` attribute, which is what
// carries the Taptic tick) lies invisible over the drawn track. A switch that
// cannot change right now still takes the tap, and says why.
export function Switch({ on, onToggle, label, disabled, why }) {
  const ref = useRef(null);
  return (
    <label className="nv-set-sw" data-on={on ? 'true' : 'false'} aria-disabled={disabled ? 'true' : undefined} ref={ref}>
      <input ref={switchHapticRef} type="checkbox" role="switch" checked={!!on} aria-label={label}
        aria-disabled={disabled ? 'true' : undefined}
        onChange={() => { if (disabled) { refuse(ref.current, why); return; } onToggle?.(!on); }} />
      <span className="tr"><span className="kn" /></span>
    </label>
  );
}

// THE SEGMENTED PICKER: one thumb that slides to the choice.
export function Seg({ label, options, value, onPick, off, why }) {
  const ref = useRef(null);
  const th = useRef(null);
  const place = () => {
    const el = ref.current;
    const t = th.current;
    if (!el || !t) return;
    const on = el.querySelector('button[aria-checked="true"]');
    if (!on || !on.offsetWidth) { t.style.opacity = '0'; return; }
    t.style.opacity = '1';
    t.style.width = `${on.offsetWidth}px`;
    t.style.transform = `translateX(${on.offsetLeft}px)`;
  };
  useLayoutEffect(place);
  useEffect(() => {
    if (typeof ResizeObserver !== 'function' || !ref.current) return undefined;
    const ro = new ResizeObserver(() => place());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="nv-set-segw">
      <div ref={ref} className={`nv-set-seg${off ? ' off' : ''}`} role="radiogroup" aria-label={label}>
        <span ref={th} className="th" />
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={String(o.value) === String(value)}
            onClick={(e) => {
              if (off) { refuse(e.currentTarget.parentElement, why); return; }
              if (String(o.value) !== String(value)) { haptic('tick'); onPick(o.value); }
            }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

// THE MENU A PILL OPENS: the iOS pull-down, scaled out of its pill, a check
// on the current choice; outside taps and Escape close it.
function Menu({ anchor, title, options, value, onPick, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const r = anchor?.getBoundingClientRect();
    if (!r) return;
    const mw = 240;
    const mh = Math.min(330, (ref.current?.scrollHeight || 330));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(8, r.right - mw), vw - mw - 8);
    let top = r.bottom + 6;
    let up = false;
    if (top + mh > vh - 90) { top = r.top - mh - 6; up = true; }
    top = Math.max(8, top);
    setPos({ left, top, origin: `${Math.round(r.right - left - 20)}px ${up ? `${mh}px` : '0px'}` });
  }, [anchor]);
  useEffect(() => {
    if (!pos) return undefined;
    const raf = requestAnimationFrame(() => ref.current?.classList.add('in'));
    const f = ref.current?.querySelector('[aria-checked="true"]') || ref.current?.querySelector('button');
    f?.focus({ preventScroll: true });
    const out = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', out, true);
    document.addEventListener('keydown', key, true);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key, true); };
  }, [pos, onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={ref} className="nv-set-menu" role="menu" aria-label={title}
      style={pos ? { left: pos.left, top: pos.top, transformOrigin: pos.origin } : { visibility: 'hidden', left: 0, top: 0 }}>
      <h4>{title}</h4>
      {options.map((o) => {
        const cur = String(o.value) === String(value);
        return (
          <button key={o.value} type="button" role="menuitemradio" aria-checked={cur}
            onClick={(e) => { e.stopPropagation(); haptic('tick'); onClose(); if (!cur) onPick(o.value); }}>
            {cur ? <Ico n="check" /> : <span />}<span>{o.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export function MenuPill({ label, title, options, value, onPick, locked, why, shown }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const cur = options.find((o) => String(o.value) === String(value));
  return (
    <>
      <button ref={btn} type="button" className="nv-set-pill" aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${shown || cur?.label || ''}`}
        aria-disabled={locked ? 'true' : undefined}
        onClick={() => { if (locked) { refuse(btn.current, why); return; } haptic('tick'); setOpen(true); }}>
        <span>{shown || cur?.label || value}</span><Ico n="updown" />
      </button>
      {open && <Menu anchor={btn.current} title={title || label} options={options} value={value} onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- rows --

export function NavRow({ k, tile, label, value, ok, staleAt, onOpen }) {
  return (
    <button type="button" className={`nv-set-row${tile ? '' : ' nx'}`} data-set-key={k} onClick={() => { haptic('tick'); onOpen(); }}
      aria-label={typeof value === 'string' && value ? `${label}, ${value}` : undefined}>
      {tile}
      <span className="nv-set-rt"><span className="nv-set-rl">{label}</span><Val v={value} ok={ok} staleAt={staleAt} /></span>
      <Chevron tone="var(--nv-ink40)" size={13} />
    </button>
  );
}

export function SwitchRow({ k, tile, label, sub, on, onToggle, disabled, dim, why, aria }) {
  return (
    <div className={`nv-set-row${tile ? '' : ' nx'}${dim ? ' dis' : ''}`} data-set-key={k}>
      {tile}
      <span className="nv-set-rt"><span className="nv-set-rl">{label}</span>{sub ? <span className="nv-set-rs">{sub}</span> : null}</span>
      <Switch on={on} onToggle={onToggle} label={aria || label} disabled={disabled} why={why} />
    </div>
  );
}

export function MenuRow({ k, label, sub, ...menu }) {
  return (
    <div className="nv-set-row nx" data-set-key={k}>
      <span className="nv-set-rt"><span className="nv-set-rl">{label}</span>{sub ? <span className="nv-set-rs">{sub}</span> : null}</span>
      <MenuPill label={label} {...menu} />
    </div>
  );
}

export function SegBlock({ k, label, sub, after, ...seg }) {
  return (
    <div className="nv-set-blk" data-set-key={k}>
      <div className="nv-set-row nx3"><span className="nv-set-rt"><span className="nv-set-rl">{label}</span>{sub ? <span className="nv-set-rs">{sub}</span> : null}</span></div>
      <Seg label={label} {...seg} />
      {after}
    </div>
  );
}

// a row with words on the left and one action on the right
export function ActRow({ k, label, sub, children, mono }) {
  return (
    <div className="nv-set-row nx" data-set-key={k}>
      <span className="nv-set-rt">{label ? <span className={`nv-set-rl${mono ? ' nv-set-mono' : ''}`}>{label}</span> : null}{sub ? <span className="nv-set-rs">{sub}</span> : null}</span>
      <span style={{ display: 'flex', alignItems: 'center' }}>{children}</span>
    </div>
  );
}

export function Group({ label, btn, foot, children, k, i = 1, plain, className = '' }) {
  return (
    <section className={`nv-set-grp nv-set-rise ${className}`} style={{ '--i': i }} data-set-key={k}>
      {label || btn ? (
        <div className="nv-set-gh">
          {label ? <Eyebrow as="h3" tone="quiet" style={{ margin: 0, fontSize: 'var(--t13)', letterSpacing: '.06em' }}>{label}</Eyebrow> : <span />}
          {btn ? <span className="nv-set-ghb">{btn}</span> : null}
        </div>
      ) : null}
      {plain ? children : <div className="nv-set-card nv-set-list">{children}</div>}
      {foot ? <p className="nv-set-gfoot">{foot}</p> : null}
    </section>
  );
}

export function HeaderCard({ tile, title, text }) {
  return (
    <div className="nv-set-card nv-set-hcard nv-set-rise" style={{ '--i': 0 }} data-set-hcard="">
      {tile}
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
    </div>
  );
}

// A CHECK'S RESULT: each stage arrives and its mark draws, green passed, red
// failed; the stage's name, and what it found under it.
export function Stages({ stages }) {
  if (!stages?.length) return null;
  return (
    <div className="nv-set-res2" role="status">
      {stages.map((s, i) => (
        <div key={`${i}-${s.stage}`} className={`nv-set-stg ${s.ok ? 'ok' : 'no'}`} style={{ animationDelay: `${i * 120}ms` }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path pathLength="26" d={s.ok ? 'M5 12.5l4.5 4.5L19 7.5' : 'M6.5 6.5l11 11M17.5 6.5l-11 11'} style={{ animationDelay: `${i * 120 + 120}ms` }} /></svg>
          <span><b>{s.stage}</b>{s.detail ? <><br />{s.detail}</> : null}</span>
        </div>
      ))}
    </div>
  );
}
