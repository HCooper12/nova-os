import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CoreFace, Ico, Glyph } from './NovaThreadParts.jsx';
import { StageCard } from './StageCard.jsx';
import { SafeVisual } from './SafeVisual.jsx';
import { audioLevel } from './audioLevel.js';
import { onSpeech, spokenSentences, clockNow } from './speechClock.js';
import { paceSentence, sentenceAt, wordAt, wordLook } from './subtitlePace.js';
import {
  focusPhase, PHASE_HOLD_MS, focusTint, EMBER_RGB, FIELD_EMBERS, focusSteps, speakerOf, focusAsks, peekLine, lastYours,
  CAPTIONS_KEY, captionsOn,
} from './novaFocusFacts.js';

// THE FULL-SCREEN NOVA (3 Oct 2026) — design/mockups/68-nova-focus.html, his
// decision: "I love the stage option C and its dynamic animations… however
// I'd like the 'turn' appearance to be option A's the field appearance
// (albeit refined further). Perhaps when I am speaking the nova icon can
// dynamically and animatedly transition to the top so it then resembles
// option C's listen appearance. But I want the different colours present
// for the nova icon too when it is listening, idle and speaking as it
// currently does."
//
// HIS TURN is A's field: the core large and centred in the drifting sky
// among fine embers that gather toward his finger while the heart leans to
// it; the state in words; at most two quiet things to ask. THE MOMENT THE
// CONVERSATION MOVES the core TRAVELS (one element, transformed, 480 ms on
// the house ease) to C's presenter spot at the top left, "Nova" and the
// state beside it, and the glass plate carries the turn: his voice in the
// core's own breath, then his words and the steps code can see, then his
// subtitles word by word in the serif, the word being said underlined in
// the speaker's hue for as long as it is said. Panels dock onto the plate.
// When he finishes, the core travels home. The core wears its state
// colours here (violet listening, gold speaking, blue at rest).
//
// Its own history entry (App.openNovaFocus), so the ⌄, the edge swipe and a
// swipe up on the thread's peek all return to the thread, where his newest
// line is the sentence he just watched. Drawn by the .nv-fx-* block at the
// end of index.css. Reads only; every act is a function the thread hands in.

const TAU = Math.PI * 2;
const FADE = 40; // the plate's top fade (.nv-fx-pbody's mask): the current word never sits in it
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const readCaptions = () => { try { return captionsOn(localStorage.getItem(CAPTIONS_KEY)); } catch { return true; } };
const writeCaptions = (on) => { try { localStorage.setItem(CAPTIONS_KEY, on ? 'on' : 'off'); } catch { /* private mode: this visit only */ } };
const seeded = (seed) => { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; };
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// the phase, with its hold: a move to the stage is at once, a move home
// waits PHASE_HOLD_MS so the gaps inside one exchange never send it back
function useHeldPhase(want) {
  const [phase, setPhase] = useState(want);
  useEffect(() => {
    if (want === phase) return undefined;
    const id = setTimeout(() => setPhase(want), want === 'stage' ? 0 : PHASE_HOLD_MS);
    return () => clearTimeout(id);
  }, [want, phase]);
  return want === 'stage' ? 'stage' : phase;
}

export function NovaFocus({ T, S, dict, since, leaving, onTalk, onOpen }) {
  const rootRef = useRef(null);
  const coreRef = useRef(null);
  const canvasRef = useRef(null);
  const leanRef = useRef(null);
  const live = useRef({ key: S.key, hue: 'blue', phase: 'field', touch: null });
  const streaming = T.lines.some((m) => m.streaming);
  const phase = useHeldPhase(focusPhase(S.key, { streaming }));
  const tint = focusTint(S.key);
  const [captions, setCaptions] = useState(readCaptions);
  const [entering, setEntering] = useState(true);
  const [said, setSaid] = useState(spokenSentences);
  useEffect(() => onSpeech((list) => setSaid(list)), []);
  live.current.key = S.key;
  live.current.hue = tint.hue;
  live.current.phase = phase;

  // the Mac writing down what he said is a step only when this turn was spoken
  const heardRef = useRef(false);
  if (dict.on) heardRef.current = false;
  else if (dict.hearing) heardRef.current = true;
  else if (S.key === 'turn' && !streaming) heardRef.current = false;

  // ---- geometry: where the field's core sits, where the presenter's does,
  // and where the name it folds back into is; measured, never guessed
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const put = () => {
      const r = root.getBoundingClientRect();
      const top = root.querySelector('.nv-fx-top')?.getBoundingClientRect().bottom - r.top || 60;
      const peekTop = root.querySelector('.nv-fx-peek')?.getBoundingClientRect().top - r.top || r.height - 140;
      const colW = Math.min(r.width, 440);
      const x0 = (r.width - colW) / 2;
      const avail = Math.max(320, peekTop - top);
      const k = avail < 540 ? 0.84 : 1;
      const cx = r.width / 2;
      const cy = top + Math.max(160 * k, avail * 0.44);
      const px = x0 + 16 + 60;
      const py = top + 8 + 60;
      const nm = document.querySelector('.nv-nt-name')?.getBoundingClientRect();
      const nx = nm ? nm.left + nm.width / 2 - r.left : cx;
      const ny = nm ? nm.top + nm.height / 2 - r.top : 40;
      const set = (k2, v) => root.style.setProperty(k2, `${Math.round(v)}px`);
      set('--fx-cx', cx); set('--fx-cy', cy); set('--fx-px', px); set('--fx-py', py); set('--fx-peek', peekTop);
      set('--fx-sx', px - cx); set('--fx-sy', py - cy); set('--fx-nx', nx - cx); set('--fx-ny', ny - cy);
      root.style.setProperty('--fx-k', String(k));
      // a short phone (an SE) gives a docked panel the peek's room
      root.toggleAttribute('data-short', r.height < 720);
    };
    put();
    // the first frame draws the core at the name; the next lets it travel out
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setEntering(false)); });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(put);
    ro?.observe(root);
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); ro?.disconnect(); };
  }, []);

  // Escape returns, as the ⌄ does (a keyboard on the Mac), unless a sheet
  // opened over the full screen (a panel shown full width) is the one on top
  const closeRef = useRef(T.closeFocus);
  closeRef.current = T.closeFocus;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const mine = Number(rootRef.current?.style.zIndex) || 0;
      const above = [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el !== rootRef.current && (Number(el.style.zIndex) || 0) > mine);
      if (!above) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEmberField(canvasRef, coreRef, live);

  // ---- his finger on the glass: the embers gather, the heart leans; on the
  // stage a tap outside the plate returns to the thread
  const down = useRef(null);
  const coreCentre = () => {
    const c = coreRef.current?.getBoundingClientRect();
    return c ? [c.left + c.width / 2, c.top + c.height / 2, c.width / 300] : null;
  };
  const follow = (x, y) => {
    live.current.touch = [x, y];
    const c = coreCentre();
    if (!c) return;
    const dx = x - c[0];
    const dy = y - c[1];
    const d = Math.hypot(dx, dy) || 1;
    const m = Math.min(16, d * 0.06);
    leanRef.current = [(dx / d) * m, (dy / d) * m];
  };
  const release = () => { live.current.touch = null; leanRef.current = null; };
  const onPointerDown = (e) => {
    if (e.target.closest('button, a, input, .nv-fx-plate, .nv-fx-dock')) return;
    down.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    if (phase === 'field') follow(e.clientX, e.clientY);
  };
  const onPointerMove = (e) => {
    const d = down.current;
    if (!d) return;
    d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
    if (phase === 'field') follow(e.clientX, e.clientY);
  };
  const onPointerUp = () => {
    const d = down.current;
    down.current = null;
    release();
    if (d && phase === 'stage' && d.moved < 10 && performance.now() - d.t < 600) T.closeFocus();
  };

  const toggleCaptions = () => setCaptions((on) => { writeCaptions(!on); return !on; });

  const speaker = speakerOf([...T.lines].reverse().find((m) => m.who === 'nova')?.agent);
  const plateMode = S.key === 'listening' ? 'listen' : S.key === 'speaking' ? 'speak' : S.key === 'thinking' ? 'think' : said.length ? 'speak' : 'think';
  const hint = S.key === 'turn' ? (T.demo ? 'demo replies' : 'tap Nova to talk') : S.hint;
  const asks = focusAsks(T.status, { offline: T.offline });
  const peek = peekLine(T.lines);
  const stage = phase === 'stage' && plateMode === 'speak' ? T.stage : null;

  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Nova, full screen" data-edge-page
      className={`nv-fx${leaving ? ' leaving' : ''}`} data-phase={phase} data-enter={entering ? '1' : undefined} data-state={S.key} data-panel={stage ? '1' : undefined}
      style={{ zIndex: 71, '--fx-hue': speaker.hue }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={release}>
      <div className="nv-fx-sky" aria-hidden="true"><i /><i /><i /><i /></div>
      <canvas ref={canvasRef} className="nv-fx-field" aria-hidden="true" />

      <div className="nv-fx-top">
        <button type="button" className="nv-fx-btn" data-edge-close onClick={T.closeFocus} aria-label="Back to the thread"><Ico name="downc" /></button>
        <button type="button" className="nv-fx-btn cc" onClick={toggleCaptions} aria-pressed={captions} aria-label={captions ? 'Subtitles on' : 'Subtitles off'}>
          <CcIcon />{captions ? 'On' : 'Off'}
        </button>
      </div>

      {/* THE CORE: one element, transformed between the field and the stage */}
      <div ref={coreRef} className="nv-fx-core">
        <button type="button" className="nv-fx-corehit" onClick={onTalk}
          aria-label={S.key === 'listening' ? 'Nova is listening. Tap to send' : S.key === 'speaking' ? 'Nova is speaking. Tap to stop and talk' : `Nova, ${S.word.toLowerCase()}. Tap to talk`}>
          <CoreFace stateKey={S.key} engine={T.engine} focus tinted size={300} leanRef={leanRef} />
        </button>
      </div>

      {/* the field: the state in words under the core, and what to ask */}
      <p className="nv-fx-fstate" role="status" aria-hidden={phase !== 'field'}>
        <Glyph k={S.key} /><b>{S.word}</b>{hint ? <span>· {hint}</span> : null}
      </p>
      {asks.length > 0 && (
        <div className="nv-fx-asks" aria-hidden={phase !== 'field'}>
          {asks.map((a) => (
            <button key={a.key} type="button" className="nv-fx-ask" onClick={a.run} tabIndex={phase === 'field' ? 0 : -1}><Ico name={a.icon} />{a.label}</button>
          ))}
        </div>
      )}

      {/* the stage: Nova and his state beside the presenter's core */}
      <div className="nv-fx-pn" aria-hidden={phase !== 'stage'}>
        <b>Nova</b>
        <p className="nv-fx-pstate"><Glyph k={S.key} /><b>{S.word}</b></p>
        {hint ? <p className="nv-fx-phint">{hint}</p> : null}
      </div>

      <div className="nv-fx-stagebox" aria-hidden={phase !== 'stage'}>
        {stage && (
          <div className="nv-fx-dock" key={stage.key}>
            <button type="button" className="nv-fx-panel" onClick={(e) => onOpen?.(stage.hero, e.currentTarget)}
              aria-label={`${stage.mark?.name || stage.hero.label || 'This panel'}${stage.total > 1 && stage.n > 0 ? `, ${stage.n} of ${stage.total}` : ''}. Tap to open full width`}>
              <span className="nv-fx-ptag"><Ico name="stage" />{stage.finder ? <b className="nv-fx-finder" style={{ '--h': stage.finder.hue }}>{stage.finder.words}</b> : 'Showing now'}{stage.total > 1 && stage.n > 0 ? <span>{stage.n} of {stage.total}</span> : null}</span>
              {/* a data panel's light, named in words in its finder's hue (3 Oct 2026) */}
              {stage.mark && <span className="nv-fx-litname" style={{ '--h': stage.mark.hue }}>{stage.mark.name}</span>}
              <span className="nv-fx-card">
                <SafeVisual what="nova-focus-panel" resetKey={stage.key}><StageCard card={stage.hero} face="summary" /></SafeVisual>
              </span>
            </button>
          </div>
        )}
        <section className="nv-fx-plate" data-mode={plateMode} aria-live="polite"
          aria-label={plateMode === 'speak' ? `${speaker.name}, speaking` : plateMode === 'listen' ? 'Listening to you' : 'Nova is working'}>
          {plateMode === 'listen' && <Listening dict={dict} since={since} />}
          {plateMode === 'think' && <Thinking S={S} T={T} heard={heardRef.current} streaming={streaming} />}
          {plateMode === 'speak' && <Captions said={said} on={captions} speaker={speaker} />}
        </section>
      </div>

      {/* the way back: the thread's newest line, peeking; a tap or a swipe up */}
      <Peek line={peek} onBack={T.closeFocus} />
    </div>
  );
}

// ------------------------------------------------------------ listening --

function Listening({ dict, since }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setSecs(Math.max(0, Math.floor((Date.now() - since) / 1000))), 500);
    return () => clearInterval(iv);
  }, [since]);
  return (
    <>
      <div className="nv-fx-phead"><span className="nv-fx-who you"><Ico name="mic" />You</span>
        <span className="nv-fx-clock">{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</span></div>
      {/* NO LIVE TRANSCRIPT EXISTS: his iPhone records and his Mac writes it
          down, so his words appear once they arrive, and the plate says so */}
      <p className="nv-fx-wait">Your words appear here once your Mac has them.</p>
      {dict.on && <button type="button" className="nv-fx-send" onClick={dict.toggle}>Send now</button>}
    </>
  );
}

// ------------------------------------------------------------- thinking --

function Thinking({ S, T, heard, streaming }) {
  const yours = lastYours(T.lines);
  const hearing = S.word === 'Writing it down';
  const steps = focusSteps({ hearing, heard, busy: T.busy, answering: streaming || T.speaking });
  return (
    <>
      <div className="nv-fx-phead"><span className="nv-fx-who you"><Ico name="mic" />{yours ? 'You asked' : 'You'}</span></div>
      {yours && !hearing && <p className="nv-fx-yours">{yours}</p>}
      {steps.length > 0 && (
        <ul className="nv-fx-steps">
          {steps.map((s) => (
            <li key={s.key} className={s.done ? 'done' : ''}>
              {s.done ? <span className="tick"><Ico name="check" /></span> : <span className="spin" aria-hidden="true" />}{s.label}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ------------------------------------------------------------- captions --

// HIS WORDS, WORD BY WORD. A sentence is laid out whole the moment its audio
// starts (so the line never reflows), its words invisible; each one rises in
// as it is paced to be said, lit in the speaker's hue and underlined while it
// is in the air, white once said. Earlier sentences dim and scroll up. The
// frame loop writes styles; React only renders when a sentence arrives.
function Captions({ said, on, speaker }) {
  const paced = useMemo(() => said.map((s) => ({ ...s, ...paceSentence(s) })), [said]);
  const colRef = useRef(null);
  const bodyRef = useRef(null);
  useEffect(() => {
    const col = colRef.current;
    const body = bodyRef.current;
    if (!col || !body || !on) return undefined;
    const reduced = reducedMotion();
    const ps = [...col.querySelectorAll('p[data-i]')];
    const words = ps.map((p) => [...p.querySelectorAll('.nv-fx-w')]);
    let lastCi = -2;
    let lastY = null;
    let raf = 0;
    const paint = (i, t) => {
      const s = paced[i];
      s.spans.forEach((sp, j) => {
        const el = words[i]?.[j];
        if (!el) return;
        const L = wordLook(sp, t, { cut: s.cut });
        el.style.opacity = L.e.toFixed(3);
        el.style.transform = reduced ? '' : `translateY(${((1 - L.e) * 10).toFixed(2)}px)`;
        el.style.setProperty('--p', reduced ? (L.lit > 0 ? '1' : '0') : L.p.toFixed(3));
        // the underline leaves a little ahead of the colour, so the word
        // just said never carries a smudge into the next one
        el.style.setProperty('--u', (L.lit * L.lit).toFixed(3));
        el.style.color = L.lit > 0 ? `color-mix(in srgb, var(--fx-hue) ${Math.round(L.lit * 35)}%, var(--fx-ink))` : '';
      });
    };
    const tick = () => {
      const t = clockNow();
      const ci = sentenceAt(paced, t);
      // the sentence being said sits at the plate's foot and earlier ones
      // scroll up under the fade; when it is taller than the room, the WORD
      // being said is what stays in view. Measured every frame, before
      // anything is written (the plate grows as it takes the room), and
      // moved only when the answer changes.
      const p = ps[ci];
      let y = 0;
      if (p) {
        const top = col.offsetTop;
        const foot = body.clientHeight - 8;
        y = foot - top - (p.offsetTop + p.offsetHeight);
        if (top + p.offsetTop + y < FADE) {
          const j = Math.max(0, Math.min(paced[ci].spans.length - 1, wordAt(paced[ci].spans, t)));
          const w = words[ci]?.[j];
          if (w) y = Math.max(foot - top - (w.offsetTop + w.offsetHeight), FADE - top - w.offsetTop);
        }
        y = Math.round(Math.min(0, y));
      }
      if (y !== lastY) { lastY = y; col.style.transform = `translateY(${y}px)`; }
      if (ci !== lastCi) {
        lastCi = ci;
        ps.forEach((p, i) => { p.classList.toggle('earlier', i < ci); p.style.opacity = i > ci ? '0' : ''; });
        // a sentence that has finished is painted once, in its final state
        for (let i = 0; i < ci - 1; i++) paint(i, t);
      }
      if (ci >= 1) paint(ci - 1, t);
      if (ci >= 0) paint(ci, t);
      raf = requestAnimationFrame(tick);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, [paced, on]);
  return (
    <>
      <div className="nv-fx-phead">
        <span className="nv-fx-who" style={{ '--fx-hue': speaker.hue }}><i className="dot" aria-hidden="true" />{speaker.name}{speaker.voiced && <span>in Nova’s voice</span>}</span>
      </div>
      {on ? (
        <div ref={bodyRef} className="nv-fx-pbody">
          <div ref={colRef} className="nv-fx-pcol">
            {paced.map((s, i) => (
              <p key={s.id} data-i={i}>
                {s.spans.map((w, j) => <Fragment key={j}><span className="nv-fx-w">{w.text}</span>{j < s.spans.length - 1 ? ' ' : null}</Fragment>)}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <p className="nv-fx-note">Subtitles are off. Turn them on at the top right.</p>
      )}
    </>
  );
}

// ----------------------------------------------------------------- peek --

// THE WAY BACK. A tap returns; so does a swipe up, which tracks his finger
// 1:1 and commits past 48 px or on a real flick, else settles home.
function Peek({ line, onBack }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const onDown = (e) => {
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, lastY: e.clientY, lastT: performance.now(), v: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT);
    d.lastY = e.clientY; d.lastT = now;
    const raw = e.clientY - d.y;
    // upward follows the finger; downward resists (nothing is down there)
    d.dy = raw < 0 ? raw : raw * 0.25;
    const el = ref.current;
    if (el) { el.style.transition = 'none'; el.style.transform = `translateY(${d.dy}px)`; }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    const el = ref.current;
    if (el) { el.style.transition = ''; el.style.transform = ''; }
    if (!d) return;
    if (el) el.dataset.dragged = Math.abs(d.dy) > 8 ? '1' : '';
    if (d.dy < -48 || d.v < -0.5) onBack();
  };
  const onClick = () => {
    const el = ref.current;
    if (el?.dataset.dragged === '1') { el.dataset.dragged = ''; return; }
    onBack();
  };
  return (
    <button ref={ref} type="button" className="nv-fx-peek" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={onClick}
      aria-label="Back to the thread. Tap, or swipe up">
      <span className="grab" aria-hidden="true" />
      <span className="t"><b>Thread</b>{line ? <> · {line.who}: {line.text}</> : <> · nothing yet</>}</span>
      <span className="go" aria-hidden="true"><Ico name="upc" /></span>
    </button>
  );
}

function CcIcon() {
  return (
    <svg className="nv-nt-ico" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6" />
    </svg>
  );
}

// ------------------------------------------------------------ the field --

// HIS EMBERS, LOOSE IN THE ROOM (mockup 68 A, refined: fewer, finer, a
// slower drift). Each mote orbits wherever the core is on its own radius, so
// when the core travels to the presenter's spot its embers follow and gather
// close round it. His finger pulls half of them to it. Listening, the field
// swells and shivers with his level; thinking, it draws in and quickens;
// they take the core's tint, gentler. One canvas, FIELD_EMBERS motes; the
// loop stops while the page is hidden, and under reduced motion one still
// frame is drawn and nothing moves.
function useEmberField(canvasRef, coreRef, live) {
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;
    let W = 0;
    let H = 0;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const rnd = seeded(11);
    const P = Array.from({ length: FIELD_EMBERS }, () => ({
      a: rnd() * TAU, rad: 96 + Math.pow(rnd(), 1.1) * 230, w: (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.1),
      sz: 0.4 + Math.pow(rnd(), 2) * 0.9, al: 0.3 + rnd() * 0.5, resp: rnd(), ph: rnd() * TAU,
      x: NaN, y: NaN, px: 0, py: 0, vx: 0, vy: 0,
    }));
    const rgb = [...EMBER_RGB.blue];
    let fade = 1;
    const centre = () => {
      const c = coreRef.current?.getBoundingClientRect();
      const o = cv.getBoundingClientRect();
      return c ? [c.left + c.width / 2 - o.left, c.top + c.height / 2 - o.top, c.width / 300] : [W / 2, H * 0.4, 1];
    };
    // where the field's core rests (the screen measured it): the embers
    // start on their orbits there, not on the core while it is still
    // arriving from the name
    const home = () => {
      const cs = getComputedStyle(cv.parentElement);
      const n = (k2, d) => { const v = parseFloat(cs.getPropertyValue(k2)); return Number.isFinite(v) ? v : d; };
      return [n('--fx-cx', W / 2), n('--fx-cy', H * 0.4), n('--fx-k', 1)];
    };
    const step = (dt, t) => {
      const st = live.current;
      const first = Number.isNaN(P[0].x);
      const [cx, cy, sc] = first ? home() : centre();
      const lvl = Math.min(1, audioLevel());
      const k = st.key;
      const spd = k === 'thinking' ? 2.6 : k === 'listening' ? 1.1 : k === 'speaking' ? 1 : 0.7;
      const pull = k === 'thinking' ? 0.55 : k === 'listening' ? 1 + lvl * 0.25 : k === 'speaking' ? 1 + lvl * 0.08 : 1;
      for (const p of P) {
        p.a += p.w * dt * spd;
        const rad = p.rad * sc * pull;
        let tx = cx + Math.cos(p.a) * rad;
        let ty = cy + Math.sin(p.a) * rad * 0.9;
        if (k === 'listening') { tx += Math.sin(t * 0.02 + p.ph * 7) * lvl * 14; ty += Math.cos(t * 0.017 + p.ph * 5) * lvl * 14; }
        let kt = 0;
        if (st.touch && p.resp < 0.5) {
          const o = cv.getBoundingClientRect();
          const fx = st.touch[0] - o.left;
          const fy = st.touch[1] - o.top;
          const d = Math.hypot(fx - p.x, fy - p.y);
          const g = Math.pow(clamp01(1 - d / 560), 0.6);
          const orb = 16 + p.resp * 70;
          tx = lerp(tx, fx + Math.cos(p.a * 4) * orb, g);
          ty = lerp(ty, fy + Math.sin(p.a * 4) * orb, g);
          kt = g * 10;
        }
        if (Number.isNaN(p.x)) { p.x = tx; p.y = ty; }
        p.px = p.x; p.py = p.y;
        const kk = (k === 'thinking' ? 9 : 5) + kt;
        p.vx += (tx - p.x) * kk * dt; p.vy += (ty - p.y) * kk * dt;
        const damp = Math.pow(0.02, dt);
        p.vx *= damp; p.vy *= damp;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      // the tint glides, never snaps; on the stage the field steps back
      const want = EMBER_RGB[st.hue] || EMBER_RGB.blue;
      for (let i = 0; i < 3; i++) rgb[i] = lerp(rgb[i], want[i], 0.05);
      fade = lerp(fade, st.phase === 'stage' ? 0.5 : 1, 0.06);
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const c = `${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])}`;
      ctx.lineCap = 'round';
      for (const p of P) {
        const a = p.al * fade;
        const vx = p.x - p.px;
        const vy = p.y - p.py;
        const sp = Math.hypot(vx, vy);
        if (sp > 0.2) {
          const k = Math.min(10, 2 + sp * 3) / sp;
          ctx.strokeStyle = `rgba(${c},${(a * 0.35).toFixed(3)})`;
          ctx.lineWidth = p.sz;
          ctx.beginPath(); ctx.moveTo(p.x - vx * k, p.y - vy * k); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        ctx.fillStyle = `rgba(${c},${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * 0.8, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { size(); draw(); });
    ro?.observe(cv);
    if (reducedMotion()) {
      // one still frame: every mote at rest on its orbit
      step(0, 0); draw();
      return () => ro?.disconnect();
    }
    let raf = 0;
    let last = 0;
    const loop = (now) => {
      // a slow frame is caught up in small steps, so the field keeps real time
      let dt = last ? Math.min(0.12, (now - last) / 1000) : 1 / 60;
      last = now;
      while (dt > 1e-4) { const h = Math.min(dt, 1 / 60); step(h, now); dt -= h; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    // the loop stops while the page is hidden, and resumes where it was
    const onVis = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); ro?.disconnect(); };
  }, [canvasRef, coreRef, live]);
}
