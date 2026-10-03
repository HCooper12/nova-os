import { useEffect, useRef, useState } from 'react';
import { NovaCore } from './NovaCore.jsx';
import { StageCard } from './StageCard.jsx';
import { SafeVisual } from './SafeVisual.jsx';
import { audioLevel } from './audioLevel.js';
import { coreFormOf, takeClock, failWords } from './novaThreadFacts.js';

// THE NOVA THREAD'S PARTS (29 Sep 2026, mockup 63 D). Drawn by the .nv-nt-*
// block at the end of index.css; every value there is a token. Module-level
// components under stable keys, so an entrance runs once.

const P = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  right: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  upc: <path d="m6 14.5 6-6 6 6" />,
  downc: <path d="m6 9.5 6 6 6-6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  cloudoff: <><path d="M7 18h10a4 4 0 0 0 1-7.9A6 6 0 0 0 7.2 8.3 4.9 4.9 0 0 0 7 18z" /><path d="M4 4l16 16" /></>,
  retry: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  kbd: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></>,
  brief: <path d="M5 7h14M5 12h14M5 17h9" />,
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
  compose: <><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M17.5 3.5a2 2 0 0 1 3 3L12 15l-4 1 1-4z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  tray: <><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5 6h14l2 7v6H3v-6z" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  speaker: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></>,
  stage: <><rect x="3" y="4" width="18" height="12.5" rx="2.5" /><path d="M8.5 20h7M12 16.5V20" /></>,
  nova: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.2" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  bang: <path d="M12 6v8M12 18h.01" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>,
};
export function Ico({ name, className = '' }) {
  return <svg className={`nv-nt-ico ${className}`} viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>;
}

// ------------------------------------------------------------ the core --

// THE LIVING CORE AT THE HEAD. NovaCore's own filament engine, in Nova's blue
// only (formOnly): it grows with his level while he talks, spins while he
// thinks (the clock three times faster, and two arcs chase round it), pulses
// with his voice while he speaks, and goes grey and still offline. Since
// 30 Sep it is drawn in FOCUS only (at rest the tab bar's Nova is the one orb
// on screen), at the focus size; the growth and pulse ride one small frame
// loop on a wrapper, never React state.
// THE FULL-SCREEN NOVA (3 Oct 2026, src/NovaFocus.jsx) draws the same face,
// larger (`size`), in its state colours (`tinted`: his "I want the different
// colours present for the nova icon too when it is listening, idle and
// speaking"), with the heart leaning toward his finger (`leanRef`). Left at
// their defaults the thread's face is exactly as it was: form only.
export const CORE_BIG = 208;
export function CoreFace({ stateKey, engine, focus, tinted = false, size = CORE_BIG, leanRef = null }) {
  const form = coreFormOf(stateKey);
  const growRef = useRef(null);
  useEffect(() => {
    const el = growRef.current;
    if (!el) return undefined;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || (!form.grow && !form.pulse)) { el.style.transform = ''; return undefined; }
    let raf = 0;
    let s = 1;
    const loop = (t) => {
      const lvl = Math.min(1, audioLevel());
      // listening: about a third larger with his voice; speaking: a pulse
      // with his on top of a slow breath
      const want = form.grow ? 1 + 0.08 + lvl * 0.26 : 1 + 0.035 * Math.sin(t / 180) + lvl * 0.12;
      s += (want - s) * 0.18;
      el.style.transform = `scale(${s.toFixed(3)})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); el.style.transform = ''; };
  }, [form.grow, form.pulse]);
  return (
    <span className="nv-nt-core" data-focus={focus ? '1' : undefined} data-state={stateKey}>
      <span ref={growRef} className="nv-nt-grow">
        <span className="nv-nt-canvas">
          <NovaCore size={size} engine={engine} formOnly={!tinted} tintStill={tinted} leanRef={leanRef} pace={form.pace} still={form.still}
            listening={stateKey === 'listening'} speaking={stateKey === 'speaking'} style={{ pointerEvents: 'none' }} />
        </span>
        {form.spin && (
          <svg className="nv-nt-chase" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="47" pathLength="100" />
            <circle cx="50" cy="50" r="47" pathLength="100" className="b" />
          </svg>
        )}
      </span>
    </span>
  );
}

// the state's glyph beside its words: bars, dots, a mic, a cloud, a retry
export function Glyph({ k }) {
  if (k === 'listening' || k === 'speaking') return <span className="nv-nt-glyph bars" aria-hidden="true"><i /><i /><i /><i /></span>;
  if (k === 'thinking') return <span className="nv-nt-glyph dots" aria-hidden="true"><i /><i /><i /></span>;
  if (k === 'offline') return <Ico name="cloudoff" className="g" />;
  if (k === 'failed') return <Ico name="retry" className="g" />;
  return <Ico name="mic" className="g" />;
}

// ------------------------------------------------------------ the stage --

// A PANEL ON THE STAGE, in the page's own face (StageCard face="summary").
// A tap opens it full width (GlassSheet, the house enlarge).
export function StagePanel({ card, onOpen, sub }) {
  if (!card) return null;
  return (
    <button type="button" className="nv-nt-spanel" onClick={(e) => onOpen?.(card, e.currentTarget)}
      aria-label={`${card.label || 'This panel'}${sub ? `, ${sub}` : ''}. Tap to open full width`}>
      <SafeVisual what="nova-thread-panel" resetKey={card.label}>
        <StageCard card={card} face="summary" />
      </SafeVisual>
      <Ico name="expand" className="nv-nt-spx" />
    </button>
  );
}

// B's stage, rising from under the head as glass over the thread while he
// speaks, and ⌃ to tuck it. The thread stays where he left it, blurred and
// dimmed behind (.nv-nt-stagedim, 30 Sep), so the stage is what he reads.
export function Stage({ s, onTuck, onOpen, leaving, replay }) {
  return (
    <section className={`nv-nt-stage${leaving ? ' leaving' : ''}`} aria-label={replay ? 'Replaying what Nova showed' : 'On the stage while Nova speaks'} aria-live="polite">
      <div className="nv-nt-sthead">
        <span className="t"><Ico name="stage" />{replay ? 'Replay' : 'Showing now'}</span>
        {s.total > 1 && <span className="sub">{s.n} of {s.total}</span>}
        <button type="button" className="nv-nt-tuck" onClick={onTuck} aria-label={replay ? 'Close the replay' : 'Tuck the stage into the thread now'}><Ico name="upc" /></button>
      </div>
      <StagePanel key={s.key} card={s.hero} onOpen={onOpen} sub={s.total > 1 ? `panel ${s.n} of ${s.total}` : null} />
      {s.line && (s.line.lit || s.line.later) && (
        <p className="nv-nt-line">{s.line.lit}{s.line.later ? <span className="later">{s.line.later}</span> : null}</p>
      )}
    </section>
  );
}

// THE STAGE, SETTLED INTO THE THREAD, so he can refer back (30 Sep, his
// "the stage pop up should then fit into the conversation flow as well… so I
// can refer back"). The head says what it is and offers the one act in the
// same line: "Shown while he spoke · 13:05" and Replay. Below it the last
// panel, and a tap on any panel opens it full width; the others ride the rail.
export function Settled({ st, time, onOpen, onReplay }) {
  const all = st.count === 1 ? 'the panel' : st.count === 2 ? 'both panels' : `all ${st.count} panels`;
  return (
    <div className="nv-sum-card nv-nt-settled">
      <div className="nv-nt-sthead">
        <span className="t"><Ico name="stage" />Shown while he spoke{time ? ` · ${time}` : ''}</span>
        <button type="button" className="nv-nt-streplay" onClick={onReplay} aria-label={`Replay ${all}`}>
          <Ico name="play" />Replay
        </button>
      </div>
      <StagePanel card={st.last} onOpen={onOpen} />
      {st.others.length > 0 && (
        <div className="nv-nt-brail">
          {st.others.map((c, i) => (
            <button key={`${c.label}:${i}`} type="button" className="nv-nt-mini" onClick={(e) => onOpen(c, e.currentTarget)}>
              <b>{st.gists[i]?.b}</b><span>{st.gists[i]?.s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------ the kept recording --

// HIS OWN BUBBLE, PLAYABLE: the recording the Mac could not write down, and
// under it the red card that says so and offers Try again (the same bytes) or
// Type it. No waveform: nothing measured one, so none is drawn; the track
// fills while it plays.
export function KeptTake({ t, busy, onRetry, onType, onHold }) {
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const audioRef = useRef(null);
  useEffect(() => () => {
    const a = audioRef.current;
    if (a) { a.pause(); URL.revokeObjectURL(a.src); }
  }, []);
  const toggle = () => {
    let a = audioRef.current;
    if (!a) {
      a = new Audio(URL.createObjectURL(t.blob));
      a.ontimeupdate = () => setPct(a.duration ? Math.min(100, (a.currentTime / a.duration) * 100) : 0);
      a.onended = () => { setPlaying(false); setPct(0); };
      audioRef.current = a;
    }
    if (playing) { a.pause(); setPlaying(false); } else { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };
  const w = failWords(t);
  return (
    <>
      <div className="nv-nt-you rec" {...onHold}>
        <button type="button" className="nv-nt-pb" onClick={toggle} aria-label={`${playing ? 'Pause' : 'Play'} your recording, ${takeClock(t.ms)}`}>
          <Ico name={playing ? 'pause' : 'play'} />
        </button>
        <span className="nv-nt-track" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        <span className="nv-nt-tm">{takeClock(t.ms)}</span>
      </div>
      <span className="nv-nt-meta r">{t.time} · kept on this phone, not written down yet</span>
      <div className="nv-nt-fail" role="alert">
        <span className="bang" aria-hidden="true"><Ico name="bang" /></span>
        <span><b>{w.title}</b><span>{w.body}</span></span>
        <div className="nv-nt-btnrow">
          <button type="button" className="nv-nt-qbtn" onClick={onRetry} disabled={busy} aria-busy={busy || undefined}>
            <Ico name="retry" />{busy ? 'Sending…' : 'Try again'}
          </button>
          <button type="button" className="nv-nt-qbtn" onClick={onType}><Ico name="kbd" />Type it</button>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------ the composer --

// HIS LEVEL, LIVE, while the mic is open: bars fed by the same audio graph
// the core reads, and a clock. Under reduced motion the bars hold still.
export function Meter({ since }) {
  const ref = useRef(null);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setSecs(Math.floor((Date.now() - since) / 1000)), 500);
    return () => clearInterval(iv);
  }, [since]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    const bars = [...el.children];
    const hist = bars.map(() => 0.1);
    let raf = 0;
    let last = 0;
    const loop = (t) => {
      if (t - last > 70) {
        last = t;
        hist.shift();
        hist.push(Math.min(1, 0.08 + audioLevel() * 1.6));
        bars.forEach((b, i) => { b.style.transform = `scaleY(${hist[i].toFixed(2)})`; });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="nv-nt-meter" role="img" aria-label="Your voice, live">
      <span ref={ref} className="lv">{Array.from({ length: 28 }, (_, i) => <i key={i} />)}</span>
      <span className="tm">{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</span>
    </div>
  );
}
