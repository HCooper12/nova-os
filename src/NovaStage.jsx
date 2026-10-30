import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CoreFace, Ico } from './NovaThreadParts.jsx';
import { StageCard } from './StageCard.jsx';
import { SafeVisual } from './SafeVisual.jsx';
import { audioLevel } from './audioLevel.js';
import { onSpeech, spokenSentences } from './speechClock.js';
import { Captions } from './NovaFocus.jsx';
import { speakerOf, focusAsks, focusPours, lastYours, WORD_LOOK } from './novaFocusFacts.js';
import { lastExchange, canvasProgress, stageState, stageScale, TRAVEL_PX, STAGE, PRESENTER, PRESENTER_RATIO, ONE_NOVA_CHROME, STAGE_SPEAK, STAGE_SPEAK_VAR } from './novaStageFacts.js';

// ONE NOVA, ONE CANVAS (29 Oct 2026) — design/mockups/106-one-nova.html,
// option A, his approval: "Option A looks excellent. Just make sure that nova
// still has the 3-D dynamic animations for each of the stages of it speaking
// listening etc that are currently used and not the plain ones from your
// mockup."
//
// REBUILT TO BE THE MOCKUP (31 Oct 2026). His words after the first build:
// "If I approve a mockup it should always and always be identical to the
// mock up when you deploy it." So this page is mockup 106 option A, state
// for state, at the mockup's own numbers (src/novaStageFacts.js STAGE), with
// one exception he asked for: the core is the REAL animated core (its grain
// body, its live motion), placed, sized and coloured as the mockup shows it.
//
// The page is ONE scroll. Its foot is the STAGE, where it opens: the real
// core large and centred in the mockup's sky among its drifting embers, the
// state word under it with its coloured dot, and under that what the state
// holds. The core NEVER leaves the centre during a turn; it only grows and
// changes colour (Ready blue, Listening violet, Thinking cyan with its
// orbiting arc, Speaking gold).
//   Ready      "You / his last words", "Nova / the answer" in the serif, and
//              "Scroll up for history".
//   Listening  "Hearing you" and his words in the italic serif as they come.
//   Thinking   "Hearing you" and his words; the hint.
//   Speaking   the glass plate under the word: the speaker's chip, "You" and
//              his question, then the subtitles word by word, the word in
//              the air gold and underlined.
// Scroll up and the history is simply above it, in the same scroll; as he
// goes the core shrinks and travels to the presenter's spot at the top left,
// with "Nova", the state and "Stage" (the way back) fading in over a band.
// That is the only time the core travels.
//
// PERFORMANCE (the 4 Oct lag survey): the core, the header and the band are
// fixed layers moved by transform and opacity written straight onto those
// few elements from one rAF-throttled scroll handler, never through React
// state or an inherited CSS variable. Reduced motion: the core cross-fades
// between its two spots instead of travelling, the sky and embers hold
// still, and the stage's changes are fades.

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;
// the house curve (--nv-ease), solved for x
function bezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x; const bx = 3 * (p2x - p1x) - cx; const ax = 1 - cx - bx;
  const cy = 3 * p1y; const by = 3 * (p2y - p1y) - cy; const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return sy(clamp01(t));
  };
}
const EASE = bezier(0.32, 0.72, 0, 1);
const seeded = (seed) => { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; };

// the embers' hue follows the core's (the mockup: its hue less 0.4 of its
// depth spread): blue at rest, violet listening, cyan thinking, gold speaking
const EMBER_HUE = { turn: 209.6, listening: 257.6, thinking: 192, speaking: STAGE_SPEAK === 'gold' ? 398 : 156 };

// FINE EMBERS DRIFTING UP THE SKY (mockup 106 makeEmbers, its numbers): 80
// motes from one seed, rising and drifting, twinkling, quicker with the
// voice, in the core's hue. One canvas over the whole screen; stopped while
// the page is hidden; one still frame under reduced motion.
function useStageEmbers(canvasRef, live) {
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;
    let W = 0;
    let H = 0;
    let P = [];
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r2 = seeded(23);
      P = Array.from({ length: 80 }, () => ({ x: r2() * W, y: r2() * H, vy: -(3 + r2() * 9), vx: (r2() - 0.5) * 5, sz: 0.5 + Math.pow(r2(), 2) * 1.3, al: 0.2 + r2() * 0.55, ph: r2() * 6.28, ts: 0.5 + r2() * 1.8 }));
    };
    size();
    let hue = EMBER_HUE[live.current.key] ?? EMBER_HUE.turn;
    const draw = (dt, t) => {
      const want = EMBER_HUE[live.current.key] ?? EMBER_HUE.turn;
      hue += (want - hue) * Math.min(1, dt * 60 * 0.07);
      const lvl = Math.min(1, audioLevel());
      ctx.clearRect(0, 0, W, H);
      for (const p of P) {
        p.y += p.vy * dt * (1 + lvl * 2); p.x += p.vx * dt;
        if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
        if (p.x < -4) p.x = W + 4;
        if (p.x > W + 4) p.x = -4;
        const a = p.al * (0.45 + 0.55 * Math.abs(Math.sin(t * p.ts + p.ph)));
        ctx.fillStyle = `hsla(${(hue % 360).toFixed(1)},80%,82%,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, 6.29); ctx.fill();
      }
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { size(); draw(0, 0); });
    ro?.observe(cv);
    if (reducedMotion()) { draw(0, 0); return () => ro?.disconnect(); }
    let raf = 0;
    let last = 0;
    const loop = (now) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      draw(dt, now / 1000);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); ro?.disconnect(); };
  }, [canvasRef, live]);
}

// true while `on`, and for `ms` after it goes off (a layer fading out keeps
// what it showed until it has gone)
function useLinger(on, ms) {
  const [held, setHeld] = useState(on);
  useEffect(() => {
    if (on) { setHeld(true); return undefined; }
    const id = setTimeout(() => setHeld(false), reducedMotion() ? 0 : ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return on || held;
}

// HIS WORDS UNDER "HEARING YOU": each word rises in as it arrives (the
// mockup's .hw, 280 ms); once the turn is his finished words, they stand
export function HeardWords({ text, live }) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return null;
  if (!live) return <span className="nv-nt-sthw">{words.join(' ')}</span>;
  return (
    <span className="nv-nt-sthw">
      {words.map((w, i) => <span key={i} className="w">{w}{i < words.length - 1 ? ' ' : ''}</span>)}
    </span>
  );
}

export function NovaStage({ T, S, dict, onTalk, onOpen, onStatus, captions, close = null, apiRef = null, chrome = ONE_NOVA_CHROME }) {
  const secRef = useRef(null);
  const coreRef = useRef(null);
  const groundRef = useRef(null);
  const emberRef = useRef(null);
  const headRef = useRef(null);
  const bandRef = useRef(null);
  const pnRef = useRef(null);
  const backRef = useRef(null);
  const moreRef = useRef(null);
  const pourCanvasRef = useRef(null);
  const pourRef = useRef([]);
  const pour = useMemo(() => ({ jobs: pourRef, canvas: pourCanvasRef, core: coreRef, gold: STAGE_SPEAK === 'gold' }), []);
  const contest = S.key === 'speaking' && !!T.contest;
  const st = stageState(S.key, { contest });
  const live = useRef({ key: S.key });
  live.current.key = S.key;
  const [said, setSaid] = useState(spokenSentences);
  useEffect(() => onSpeech((list) => setSaid(list)), []);

  // ---- the driver: the scroll and the state's size, written straight onto
  // the fixed layers (never React state, never an inherited variable)
  const drive = useRef({ main: null, max: 0, sp: 0, g: null, placed: -1, raf: 0, kr: 0, k: stageScale(S.key), kTo: stageScale(S.key), pinned: true, seeking: false, snap: 0 });
  const apply = () => {
    const d = drive.current;
    const g = d.g;
    const core = coreRef.current;
    if (!g || !core) return;
    const rm = reducedMotion();
    let q = EASE(d.sp);
    if (rm) {
      // REDUCED MOTION: the core never travels; it cross-fades between its spots
      q = q > 0.5 ? 1 : 0;
      if (d.placed !== -1 && d.placed !== q && core.animate) core.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
    }
    d.placed = q;
    const x = lerp(g.fx, g.px, q);
    const y = lerp(g.fy, g.py, q);
    const s = lerp(d.k, d.k * PRESENTER_RATIO, q);
    core.style.transform = `translate3d(${(x - 150).toFixed(1)}px, ${(y - 150).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    // the header arrives with the core, from 55% of its trip (the mockup's hv)
    const hv = rm ? q : clamp01((q - 0.55) / 0.45);
    for (const el of [bandRef.current, pnRef.current, backRef.current, moreRef.current]) {
      if (!el) continue;
      el.style.opacity = hv.toFixed(3);
      el.toggleAttribute('data-on', hv > 0.6);
    }
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // where the core rests (the slot on the stage, at the foot of the scroll),
  // the presenter's spot, and the composer's top (the hint and the plate's
  // foot keep the mockup's distance from it); measured on layout, never per frame
  const measure = () => {
    const sec = secRef.current;
    const d = drive.current;
    const main = d.main;
    const root = sec?.parentElement;
    if (!sec || !main || !root) return;
    const mr = main.getBoundingClientRect();
    const foot = parseFloat(getComputedStyle(root).paddingBottom) || 0;
    sec.style.setProperty('--oc-vh', `${Math.round(main.clientHeight)}px`);
    sec.style.setProperty('--oc-foot', `${Math.round(foot)}px`);
    for (const el of [groundRef.current, pourCanvasRef.current]) {
      if (!el) continue;
      el.style.left = `${mr.left}px`; el.style.top = `${mr.top}px`; el.style.width = `${mr.width}px`; el.style.height = `${mr.height}px`;
    }
    if (headRef.current) { headRef.current.style.left = `${mr.left}px`; headRef.current.style.width = `${mr.width}px`; headRef.current.style.top = `${mr.top}px`; }
    d.max = Math.max(0, main.scrollHeight - main.clientHeight);
    const off = main.scrollTop - d.max; // where the stage sits once he is at the foot
    const top = sec.getBoundingClientRect().top + off;
    const composer = root.querySelector('.nv-nt-composer');
    const ctop = composer ? composer.getBoundingClientRect().top : mr.bottom - 82;
    sec.style.setProperty('--st-ctop', `${Math.round(ctop - top)}px`);
    // a short screen (Safari's toolbar, a small phone): the hint never sits
    // over the last exchange; it gives way instead
    const exb = sec.querySelector('.nv-nt-stexch')?.getBoundingClientRect();
    sec.toggleAttribute('data-crowded', !!exb && exb.height > 0 && exb.bottom + off > ctop - 66 - 8);
    d.g = {
      fx: mr.left + mr.width / 2,
      fy: top + STAGE.coreY,
      px: mr.left + Math.max(0, (mr.width - 560) / 2) + PRESENTER.x,
      py: mr.top + PRESENTER.y,
    };
    applyRef.current();
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;

  const toStage = (smooth = true) => {
    const m = drive.current.main;
    if (!m) return;
    const max = Math.max(0, m.scrollHeight - m.clientHeight);
    // on its way down: if the history grows meanwhile, the target moves with it
    drive.current.seeking = true;
    if (smooth && !reducedMotion()) m.scrollTo({ top: max, behavior: 'smooth' });
    else m.scrollTop = max;
  };
  const toStageRef = useRef(toStage);
  toStageRef.current = toStage;

  useLayoutEffect(() => {
    const sec = secRef.current;
    const main = sec?.closest('main');
    if (!sec || !main) return undefined;
    const d = drive.current;
    d.main = main;
    // it opens on the stage: the foot of the one scroll
    main.scrollTop = main.scrollHeight;
    measureRef.current();
    const progress = () => {
      d.raf = 0;
      d.max = Math.max(0, main.scrollHeight - main.clientHeight);
      d.sp = canvasProgress(main.scrollTop, d.max, TRAVEL_PX);
      d.pinned = d.sp < 0.02;
      if (d.pinned) d.seeking = false;
      applyRef.current();
    };
    progress();
    const onScroll = () => {
      if (!d.raf) d.raf = requestAnimationFrame(progress);
      // LET GO EARLY AND IT SETTLES BACK (mockup 106): a short pull that is
      // not yet history returns to the stage once the scroll comes to rest
      clearTimeout(d.snap);
      d.snap = setTimeout(() => { if (d.sp > 0.015 && d.sp < 0.4) toStageRef.current(true); }, 160);
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    // his own finger or wheel takes over from any trip to the stage
    const mine = () => { d.seeking = false; };
    main.addEventListener('touchstart', mine, { passive: true });
    main.addEventListener('wheel', mine, { passive: true });
    // the history grows above the stage (a reply streaming in, a card
    // drawing): at the stage, it stays at the stage
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (d.pinned) main.scrollTop = main.scrollHeight;
      else if (d.seeking) toStageRef.current(true);
      measureRef.current();
      progress();
    });
    ro?.observe(sec.parentElement);
    ro?.observe(main);
    const onResize = () => measureRef.current();
    window.addEventListener('resize', onResize);
    // A BACK SWIPE ONTO THIS PAGE (src/edgeBack.js) moves <main> for its
    // first frames, before this page has rendered its fixed layers, then lets
    // go of it: anything measured meanwhile was measured off a moved page
    // (31 Oct, the core and sky left half off screen). Measure again the
    // moment <main>'s own style changes.
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { measureRef.current(); progress(); });
    mo?.observe(main, { attributes: true, attributeFilter: ['style'] });
    return () => {
      mo?.disconnect();
      main.removeEventListener('scroll', onScroll);
      main.removeEventListener('touchstart', mine);
      main.removeEventListener('wheel', mine);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      cancelAnimationFrame(d.raf);
      cancelAnimationFrame(d.kr);
      clearTimeout(d.snap);
    };
  }, []);

  // ---- the core's size follows the state, as the mockup's body grows
  // (listening the largest), easing from wherever it is; it never moves
  useEffect(() => {
    const d = drive.current;
    d.kTo = stageScale(S.key);
    cancelAnimationFrame(d.kr);
    if (reducedMotion()) { d.k = d.kTo; applyRef.current(); return undefined; }
    let last = 0;
    const step = (now) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      d.k += (d.kTo - d.k) * Math.min(1, dt * 60 * 0.08);
      if (Math.abs(d.kTo - d.k) < 0.0005) d.k = d.kTo;
      applyRef.current();
      if (d.k !== d.kTo) d.kr = requestAnimationFrame(step);
    };
    d.kr = requestAnimationFrame(step);
    return () => cancelAnimationFrame(d.kr);
  }, [S.key]);

  // a turn that starts while he is up in the history brings him down
  const turning = S.key === 'listening' || S.key === 'thinking' || S.key === 'speaking';
  const wasTurning = useRef(turning);
  useEffect(() => {
    if (turning && !wasTurning.current && drive.current.sp > 0.02) toStageRef.current(true);
    wasTurning.current = turning;
  }, [turning]);

  // the stage's words change height (an answer arrives): measure again
  const ex = lastExchange(T.lines);
  const hasClose = !!close;
  const youAt = ex.you?.i;
  const novaAt = ex.nova?.i;
  useLayoutEffect(() => { measureRef.current(); }, [youAt, novaAt, hasClose, S.key, dict.on]);

  // the thread's door to the stage (the dock's hold registers through it)
  if (apiRef) apiRef.current = { toStage: (smooth) => toStageRef.current(smooth) };

  useStageEmbers(emberRef, live);

  // ---- what each state holds
  const speaker = speakerOf([...T.lines].reverse().find((m) => m.who === 'nova')?.agent);
  // Nova speaks in gold (the mockup); a voiced agent in its own hue
  const sayHue = speaker.voiced ? speaker.hue : STAGE_SPEAK_VAR;
  const stageSpeaker = useMemo(() => ({ ...speaker, hue: sayHue }), [speaker.key, sayHue]); // eslint-disable-line react-hooks/exhaustive-deps
  const speaking = S.key === 'speaking';
  const plateOn = useLinger(speaking, 300);
  const stage = speaking ? T.stage : null;
  const lastStage = useRef(null);
  if (stage) lastStage.current = stage;
  const [dockLeaving, setDockLeaving] = useState(false);
  const hasStage = !!stage;
  useEffect(() => {
    if (hasStage) { setDockLeaving(false); return undefined; }
    if (!lastStage.current) return undefined;
    if (reducedMotion()) { lastStage.current = null; return undefined; }
    setDockLeaving(true);
    const id = setTimeout(() => { lastStage.current = null; setDockLeaving(false); }, 420);
    return () => clearTimeout(id);
  }, [hasStage]);
  const dock = stage || (dockLeaving ? lastStage.current : null);
  const pours = focusPours('thread');
  const asks = chrome.briefMe ? focusAsks(T.status, { offline: T.offline }) : [];
  const rest = !turning;
  // his words: as they arrive while he talks (the browser's dictation writes
  // them into the composer; Nova's ears have none until the Mac writes them
  // down), then his finished question while Nova reads the vault
  const yours = lastYours(T.lines);
  const heard = S.key === 'listening' ? (dict.on ? T.composer.value : '') : S.key === 'thinking' ? yours || '' : '';
  const asked = ex.you?.text || '';
  const hint = S.key === 'turn' && T.demo ? 'demo replies' : '';
  const dataState = rest ? 'idle' : S.key === 'listening' ? 'listen' : S.key === 'thinking' ? 'think' : 'speak';

  // a tap on a quiet line goes to it in the history, under the presenter
  const goLine = (i) => {
    const m = drive.current.main;
    const el = document.querySelector(`.nv-nt-thread [data-line="${i}"]`);
    if (!m || !el) return;
    m.scrollTo({ top: Math.max(0, m.scrollTop + el.getBoundingClientRect().top - 132 - 12), behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <>
      {/* THE GROUND: the mockup's sky (its gradient and three drifting
          lights) and its fine embers, under the whole page */}
      <div ref={groundRef} className="nv-nt-ground" data-fixed="" aria-hidden="true">
        <div className="nv-nt-stsky"><i /><i /><i /></div>
        <canvas ref={emberRef} className="nv-nt-stembers" />
      </div>

      {/* THE PRESENTER'S SPOT, only while he reads the history: a band that
          keeps the history legible under it, "Nova" and the state beside the
          travelled core, and "Stage", the way back down, with the › (status
          and settings, ONE_NOVA_CHROME.status) beside it, here only */}
      <div ref={headRef} className="nv-nt-ohead" data-fixed="">
        <span ref={bandRef} className="nv-nt-oband" aria-hidden="true" />
        <button ref={pnRef} type="button" className="nv-nt-opn" onClick={() => toStageRef.current(true)} aria-label={`Nova, ${st.word.toLowerCase()}. Back to the stage`}>
          <b>Nova</b>
          <span><i className="nv-nt-stdot" data-tone={st.tone} aria-hidden="true" />{st.word}</span>
        </button>
        <span className="nv-nt-oact">
          <button ref={backRef} type="button" className="nv-nt-oback" onClick={() => toStageRef.current(true)} aria-label="Back to the stage"><Ico name="downc" />Stage</button>
          {chrome.status && <button ref={moreRef} type="button" className="nv-nt-omore" onClick={onStatus} aria-label="Nova’s status and settings"><Ico name="right" /></button>}
        </span>
      </div>

      {/* THE CORE: the real one, one element, fixed, moved by transform alone */}
      <div ref={coreRef} className="nv-nt-ocore" data-fixed="" data-state={S.key}>
        <button type="button" className="nv-fx-corehit" onClick={onTalk}
          aria-label={S.key === 'listening' ? 'Nova is listening. Tap to send' : speaking ? `Nova is ${contest ? 'pushing back' : 'speaking'}. Tap to stop and talk` : `Nova, ${st.word.toLowerCase()}. Tap to talk`}>
          <CoreFace stateKey={S.key} engine={T.engine} focus tinted size={300} contest={contest} gold={STAGE_SPEAK === 'gold'} />
        </button>
      </div>
      {pours && <canvas ref={pourCanvasRef} className="nv-nt-opour" data-fixed="" aria-hidden="true" />}

      {/* THE STAGE: the foot of the one scroll, laid out at the mockup's numbers */}
      <section ref={secRef} className="nv-nt-osec" data-state={dataState} aria-label="Nova" style={{ '--fx-hue': sayHue }}>
        <p className="nv-nt-stword" role="status">
          <i className="nv-nt-stdot" data-tone={st.tone} aria-hidden="true" />
          <b key={st.word}>{st.word}</b>
          {hint ? <span>· {hint}</span> : null}
        </p>

        {/* Ready: the last exchange (or the brief's question waiting on him) */}
        <div className="nv-nt-stexch" aria-hidden={!rest}>
          {close || (
            <>
              {ex.you && <button type="button" className="q" onClick={() => goLine(ex.you.i)} tabIndex={rest ? 0 : -1}><span>You</span><span className="t">{ex.you.text}</span></button>}
              {ex.nova && <button type="button" className="a" onClick={() => goLine(ex.nova.i)} tabIndex={rest ? 0 : -1}><span>{ex.nova.who}</span><span className="t">{ex.nova.text}</span></button>}
            </>
          )}
          {rest && asks.length > 0 && (
            <div className="nv-nt-stasks">
              {asks.map((a) => <button key={a.key} type="button" className="nv-fx-ask" onClick={a.run}><Ico name={a.icon} />{a.label}</button>)}
            </div>
          )}
        </div>

        {/* Listening and Thinking: his words */}
        <div className="nv-nt-stheard" aria-hidden={!(S.key === 'listening' || S.key === 'thinking')}>
          <small>Hearing you</small>
          <HeardWords text={heard} live={S.key === 'listening'} />
        </div>

        {/* Speaking: the glass plate and the subtitles */}
        <section className="nv-nt-stplate" aria-live="polite" aria-hidden={!speaking} aria-label={`${speaker.name}, speaking`}>
          {plateOn && (
            <Captions said={said} on={captions} speaker={stageSpeaker} pour={pours ? pour : null} look={WORD_LOOK.stage}
              markHue={stage?.mark?.hue || null}
              lead={(
                <>
                  {dock && (
                    <div className={`nv-fx-dock${stage ? '' : ' out'}`} key={dock.key} aria-hidden={stage ? undefined : true}>
                      <button type="button" className="nv-fx-panel" onClick={(e) => onOpen?.(dock.hero, e.currentTarget)} tabIndex={stage ? 0 : -1}
                        aria-label={`${dock.mark?.name || dock.hero.label || 'This panel'}${dock.total > 1 && dock.n > 0 ? `, ${dock.n} of ${dock.total}` : ''}. Tap to open full width`}>
                        <span className="nv-fx-ptag"><Ico name="stage" />{dock.finder ? <b className="nv-fx-finder" style={{ '--h': dock.finder.hue }}>{dock.finder.words}</b> : 'Showing now'}{dock.total > 1 && dock.n > 0 ? <span>{dock.n} of {dock.total}</span> : null}</span>
                        {dock.mark && <span className="nv-fx-litname" style={{ '--h': dock.mark.hue }}>{dock.mark.name}</span>}
                        <span className="nv-fx-card">
                          <SafeVisual what="nova-stage-panel" resetKey={dock.key}><StageCard card={dock.hero} face="summary" /></SafeVisual>
                        </span>
                      </button>
                    </div>
                  )}
                  {asked && <p className="nv-nt-stasked"><b>You</b>{asked}</p>}
                </>
              )}
              offNote="Subtitles are off. Turn them on in Nova’s status and settings." />
          )}
        </section>

        {T.lines.length > 0 && <p className="nv-nt-sthint" aria-hidden="true"><Ico name="upc" />Scroll up for history</p>}
      </section>
    </>
  );
}
