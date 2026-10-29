import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CoreFace, Ico, Glyph } from './NovaThreadParts.jsx';
import { StageCard } from './StageCard.jsx';
import { SafeVisual } from './SafeVisual.jsx';
import { onSpeech, spokenSentences } from './speechClock.js';
import { useHeldPhase, useEmberField, Listening, Thinking, Captions } from './NovaFocus.jsx';
import { focusPhase, focusTint, speakerOf, focusAsks, focusPours, WORD_LOOK } from './novaFocusFacts.js';
import { lastExchange, canvasProgress, PRESENTER_SCALE, TRAVEL_PX } from './novaStageFacts.js';

// ONE NOVA, ONE CANVAS (29 Oct 2026) — design/mockups/106-one-nova.html,
// option A, his approval: "Option A looks excellent. Just make sure that nova
// still has the 3-D dynamic animations for each of the stages of it speaking
// listening etc that are currently used and not the plain ones from your
// mockup." His complaint before it: the thread and the full-screen stage felt
// like two apps, and he rarely saw the stage he loves.
//
// So the Nova page is ONE scroll. At its foot (where it opens) is the STAGE:
// the real core, large and centred in the real sky among its embers, the
// state in words, the last exchange as two quiet lines. Scroll up and the
// thread's history is simply above it, in the same scroll; as he goes, the
// core shrinks and travels to the presenter's spot at the top left with
// "Nova" and the state beside it, and scrolling back down brings it home.
//
// A TURN plays exactly what the full screen played (src/NovaFocus.jsx, whose
// pieces this imports rather than copies): the core in its state colours,
// his voice in its breath, the core travelling to the presenter's spot, the
// glass plate with his words, the steps code can see, then the serif
// subtitles word by word with the spoken word underlined and the grains
// pouring from the heart, and panels docking onto the plate.
//
// PERFORMANCE (the 4 Oct lag survey): the core, the header and the band are
// fixed layers moved by transform and opacity written straight onto those
// few elements from one rAF-throttled scroll handler, never through React
// state or an inherited CSS variable; the ember field pauses while he reads
// the history over it. Reduced motion: the core cross-fades between its two
// spots instead of travelling, and the sky and field hold still.

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;
// the house curve (--nv-ease), solved for x: the travel's 480 ms
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
const TRAVEL_MS = 480;

export function NovaStage({ T, S, dict, since, onTalk, onOpen, onStatus, captions, close = null, apiRef = null }) {
  const secRef = useRef(null);
  const coreRef = useRef(null);
  const groundRef = useRef(null);
  const fieldRef = useRef(null);
  const headRef = useRef(null);
  const bandRef = useRef(null);
  const pnRef = useRef(null);
  const backRef = useRef(null);
  const pourCanvasRef = useRef(null);
  const pourRef = useRef([]);
  const pour = useMemo(() => ({ jobs: pourRef, canvas: pourCanvasRef, core: coreRef }), []);
  const streaming = T.lines.some((m) => m.streaming);
  const phase = useHeldPhase(focusPhase(S.key, { streaming }));
  const contest = S.key === 'speaking' && !!T.contest;
  const tint = focusTint(S.key, { contest });
  const stateWord = contest ? 'Pushing back' : S.word;
  const live = useRef({ key: S.key, hue: 'blue', phase: 'field', touch: null, paused: false });
  live.current.key = S.key;
  live.current.hue = tint.hue;
  const [said, setSaid] = useState(spokenSentences);
  useEffect(() => onSpeech((list) => setSaid(list)), []);

  // the Mac writing down what he said is a step only when this turn was spoken
  const heardRef = useRef(false);
  if (dict.on) heardRef.current = false;
  else if (dict.hearing) heardRef.current = true;
  else if (S.key === 'turn' && !streaming) heardRef.current = false;

  // ---- the driver: scroll and phase, written straight onto the fixed layers
  const drive = useRef({ main: null, max: 0, sp: 0, ph: phase === 'stage' ? 1 : 0, g: null, placed: -1, raf: 0, tw: 0, pinned: true, seeking: false, snap: 0 });
  const apply = () => {
    const d = drive.current;
    const g = d.g;
    const core = coreRef.current;
    if (!g || !core) return;
    const rm = reducedMotion();
    let q = Math.max(EASE(d.sp), d.ph);
    if (rm) {
      // REDUCED MOTION: the core never travels; it cross-fades between its spots
      q = q > 0.5 ? 1 : 0;
      if (d.placed !== -1 && d.placed !== q && core.animate) core.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
    }
    d.placed = q;
    const x = lerp(g.fx, g.px, q);
    const y = lerp(g.fy, g.py, q);
    const s = lerp(g.fk, PRESENTER_SCALE, q);
    core.style.transform = `translate3d(${(x - 150).toFixed(1)}px, ${(y - 150).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    // the band, the name and the way back arrive with the core (from 55% of
    // its trip to 95%), never ahead of it over the travelling core
    const hv = rm ? (d.sp > 0.5 ? 1 : 0) : clamp01((EASE(d.sp) - 0.55) / 0.4);
    // the name and state arrive with the band while he scrolls (never over
    // unbanded text), and once the core has nearly arrived on his turn
    const pv = rm ? q : Math.max(hv, clamp01((d.ph - 0.55) / 0.45));
    if (bandRef.current) bandRef.current.style.opacity = hv.toFixed(3);
    if (pnRef.current) {
      pnRef.current.style.opacity = pv.toFixed(3);
      pnRef.current.style.transform = rm ? 'translateY(-50%)' : `translate3d(${((1 - pv) * -10).toFixed(1)}px, -50%, 0)`;
      pnRef.current.toggleAttribute('data-on', pv > 0.6);
    }
    if (backRef.current) {
      backRef.current.style.opacity = hv.toFixed(3);
      backRef.current.toggleAttribute('data-on', hv > 0.6);
    }
    // the field steps back on the stage, and rests while he reads the history over it
    live.current.phase = q > 0.5 ? 'stage' : 'field';
    live.current.paused = d.sp > 0.9 && d.ph < 0.5;
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // where the core rests (the slot under the stage's words, at the foot of
  // the scroll) and the presenter's spot; measured on layout, never per frame
  const measure = () => {
    const sec = secRef.current;
    const d = drive.current;
    const main = d.main;
    const root = sec?.parentElement;
    if (!sec || !main || !root) return;
    const mr = main.getBoundingClientRect();
    const cs = getComputedStyle(root);
    const top = parseFloat(cs.paddingTop) || 0;
    const foot = parseFloat(cs.paddingBottom) || 0;
    sec.style.setProperty('--oc-vh', `${Math.round(main.clientHeight)}px`);
    sec.style.setProperty('--oc-top', `${Math.round(top)}px`);
    sec.style.setProperty('--oc-foot', `${Math.round(foot)}px`);
    const stageH = main.clientHeight - top - foot;
    // the core gives way first on a short phone: the words under it need ~300
    const k = Math.max(0.44, Math.min(0.84, (stageH - 300) / 300));
    sec.style.setProperty('--oc-k', k.toFixed(3));
    for (const el of [groundRef.current, pourCanvasRef.current]) {
      if (!el) continue;
      el.style.left = `${mr.left}px`; el.style.top = `${mr.top}px`; el.style.width = `${mr.width}px`; el.style.height = `${mr.height}px`;
    }
    if (headRef.current) { headRef.current.style.left = `${mr.left}px`; headRef.current.style.width = `${mr.width}px`; headRef.current.style.top = `${mr.top + top}px`; }
    d.max = Math.max(0, main.scrollHeight - main.clientHeight);
    const slot = sec.querySelector('.nv-nt-oslot')?.getBoundingClientRect();
    const R = 150 * PRESENTER_SCALE;
    const pad = Math.max(16, (mr.width - 560) / 2 + 16);
    const off = main.scrollTop - d.max; // where the slot sits once he is at the foot
    d.g = {
      fx: slot ? slot.left + slot.width / 2 : mr.left + mr.width / 2,
      fy: slot ? slot.top + off + slot.height / 2 : mr.top + top + 200,
      fk: slot ? slot.height / 300 : k,
      px: mr.left + pad + R,
      py: mr.top + top + 8 + R,
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
    return () => {
      main.removeEventListener('scroll', onScroll);
      main.removeEventListener('touchstart', mine);
      main.removeEventListener('wheel', mine);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      cancelAnimationFrame(d.raf);
      cancelAnimationFrame(d.tw);
      clearTimeout(d.snap);
    };
  }, []);

  // ---- the phase: the core travels to the presenter's spot when the
  // conversation moves, 480 ms on the house ease, from wherever it is now;
  // and a turn that starts while he is up in the history brings him down
  const lastPhase = useRef(phase);
  useEffect(() => {
    const d = drive.current;
    const want = phase === 'stage' ? 1 : 0;
    if (phase === 'stage' && lastPhase.current !== 'stage' && d.sp > 0.02) toStageRef.current(true);
    lastPhase.current = phase;
    cancelAnimationFrame(d.tw);
    if (reducedMotion()) { d.ph = want; applyRef.current(); return undefined; }
    const from = d.ph;
    if (from === want) return undefined;
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp01((now - t0) / TRAVEL_MS);
      d.ph = lerp(from, want, EASE(k));
      applyRef.current();
      if (k < 1) d.tw = requestAnimationFrame(step);
    };
    d.tw = requestAnimationFrame(step);
    return () => cancelAnimationFrame(d.tw);
  }, [phase]);

  // the stage's words change height (an answer arrives): measure again
  const ex = lastExchange(T.lines);
  const hasClose = !!close;
  const youAt = ex.you?.i;
  const novaAt = ex.nova?.i;
  useLayoutEffect(() => { measureRef.current(); }, [youAt, novaAt, hasClose, phase]);

  // the thread's door to the stage (the dock's hold registers through it)
  if (apiRef) apiRef.current = { toStage: (smooth) => toStageRef.current(smooth) };

  useEmberField(fieldRef, coreRef, live);

  // ---- the plate (the full screen's, unchanged)
  const speaker = speakerOf([...T.lines].reverse().find((m) => m.who === 'nova')?.agent);
  const sayHue = speaker.voiced ? speaker.hue : 'var(--nv-say)';
  const plateMode = S.key === 'listening' ? 'listen' : S.key === 'speaking' ? 'speak' : S.key === 'thinking' ? 'think' : said.length ? 'speak' : 'think';
  const stage = phase === 'stage' && plateMode === 'speak' ? T.stage : null;
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
  const hint = S.key === 'turn' ? (T.demo ? 'demo replies' : 'tap Nova to talk') : S.hint;
  const asks = focusAsks(T.status, { offline: T.offline });
  const field = phase !== 'stage';

  // a tap on a quiet line goes to it in the history, under the presenter
  const goLine = (i) => {
    const m = drive.current.main;
    const el = document.querySelector(`.nv-nt-thread [data-line="${i}"]`);
    if (!m || !el) return;
    const under = headRef.current ? headRef.current.getBoundingClientRect().bottom : 0;
    m.scrollTo({ top: Math.max(0, m.scrollTop + el.getBoundingClientRect().top - under - 12), behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <>
      {/* THE GROUND: the full screen's sky and its embers, under the whole page */}
      <div ref={groundRef} className="nv-nt-ground" aria-hidden="true">
        <div className="nv-fx-sky"><i /><i /><i /><i /></div>
        <canvas ref={fieldRef} className="nv-fx-field" />
      </div>

      {/* THE PRESENTER'S SPOT: a band that keeps the history legible under it,
          "Nova" and the state beside the travelled core, the way back down,
          and status and settings (always there) */}
      <div ref={headRef} className="nv-nt-ohead">
        <span ref={bandRef} className="nv-nt-oband" aria-hidden="true" />
        <button ref={pnRef} type="button" className="nv-nt-opn" onClick={() => toStageRef.current(true)} aria-label={`Nova, ${stateWord.toLowerCase()}. Back to the stage`}>
          <b>Nova</b>
          <span data-contest={contest ? '1' : undefined}><Glyph k={S.key} />{stateWord}</span>
        </button>
        <span className="nv-nt-oact">
          <button ref={backRef} type="button" className="nv-nt-oback" onClick={() => toStageRef.current(true)} aria-label="Back to the stage"><Ico name="downc" />Stage</button>
          <button type="button" className="nv-nt-omore" onClick={onStatus} aria-label="Nova’s status and settings"><Ico name="right" /></button>
        </span>
      </div>

      {/* THE CORE: one element, fixed, moved by transform alone */}
      <div ref={coreRef} className="nv-nt-ocore" style={{ '--fx-hue': sayHue }}>
        <button type="button" className="nv-fx-corehit" onClick={onTalk}
          aria-label={S.key === 'listening' ? 'Nova is listening. Tap to send' : S.key === 'speaking' ? `Nova is ${contest ? 'pushing back' : 'speaking'}. Tap to stop and talk` : `Nova, ${S.word.toLowerCase()}. Tap to talk`}>
          <CoreFace stateKey={S.key} engine={T.engine} focus tinted size={300} contest={contest} />
        </button>
      </div>
      {pours && <canvas ref={pourCanvasRef} className="nv-nt-opour" aria-hidden="true" />}

      {/* THE STAGE: the foot of the one scroll */}
      <section ref={secRef} className="nv-nt-osec" data-phase={phase} data-state={S.key} aria-label="Nova" style={{ '--fx-hue': sayHue }}>
        <div className="nv-nt-ofield" aria-hidden={!field}>
          <span className="nv-nt-oslot" aria-hidden="true" />
          <p className="nv-nt-ostate" role="status"><Glyph k={S.key} /><b>{stateWord}</b>{hint ? <span>· {hint}</span> : null}</p>
          {asks.length > 0 && (
            <div className="nv-nt-oasks">
              {asks.map((a) => (
                <button key={a.key} type="button" className="nv-fx-ask" onClick={a.run} tabIndex={field ? 0 : -1}><Ico name={a.icon} />{a.label}</button>
              ))}
            </div>
          )}
          {close || (
            (ex.you || ex.nova) && (
              <div className="nv-nt-oex">
                {ex.you && <button type="button" className="q" onClick={() => goLine(ex.you.i)} tabIndex={field ? 0 : -1}><span>You</span>{ex.you.text}</button>}
                {ex.nova && <button type="button" className="a" onClick={() => goLine(ex.nova.i)} tabIndex={field ? 0 : -1}><span>{ex.nova.who}</span>{ex.nova.text}</button>}
              </div>
            )
          )}
          {T.lines.length > 0 && <p className="nv-nt-ohint" aria-hidden="true"><Ico name="upc" />Scroll up for history</p>}
        </div>

        <div className="nv-nt-obox" aria-hidden={field}>
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
          {!field && (
            <section className="nv-fx-plate" data-mode={plateMode} aria-live="polite"
              aria-label={plateMode === 'speak' ? `${speaker.name}, speaking` : plateMode === 'listen' ? 'Listening to you' : 'Nova is working'}>
              {plateMode === 'listen' && <Listening dict={dict} since={since} send={false} />}
              {plateMode === 'think' && <Thinking S={S} T={T} heard={heardRef.current} streaming={streaming} />}
              {plateMode === 'speak' && <Captions said={said} on={captions} speaker={speaker} markHue={stage?.mark?.hue || null} pour={pours ? pour : null} look={WORD_LOOK.thread} offNote="Subtitles are off. Turn them on in Nova’s status and settings (›)." />}
            </section>
          )}
        </div>
      </section>
    </>
  );
}
