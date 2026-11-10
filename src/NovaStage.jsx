import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CoreFace, Ico } from './NovaThreadParts.jsx';
import { ArtifactCard } from './ArtifactCard.jsx';
import { audioLevel } from './audioLevel.js';
import { onSpeech, spokenSentences } from './speechClock.js';
import { speakerOf, focusAsks, focusPours } from './novaFocusFacts.js';
import { lastExchange, canvasProgress, stageState, TRAVEL_PX, PRESENTER, PRESENTER_RATIO, ONE_NOVA_CHROME, STAGE_SPEAK, STAGE_SPEAK_VAR } from './novaStageFacts.js';
import { PH, PHONE_CORE_SCALE } from './phoneStageFacts.js';
import { PhoneStage } from './PhoneStage.jsx';
import { createPeer } from './cameraPeer.js';

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

export function NovaStage({ T, S, dict, onTalk, onStatus, close = null, apiRef = null, chrome = ONE_NOVA_CHROME, glassRef = null }) {
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
  const contest = S.key === 'speaking' && !!T.contest;
  const st = stageState(S.key, { contest });
  const live = useRef({ key: S.key });
  live.current.key = S.key;
  const [said, setSaid] = useState(spokenSentences);
  useEffect(() => onSpeech((list) => setSaid(list)), []);

  // ---- the driver: the scroll and the state's size, written straight onto
  // the fixed layers (never React state, never an inherited variable)
  const drive = useRef({ main: null, max: 0, sp: 0, g: null, placed: -1, raf: 0, kr: 0, k: PHONE_CORE_SCALE, kTo: PHONE_CORE_SCALE, pinned: true, seeking: false, snap: 0 });
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
    // THE FIXED LAYERS' OWN COORDINATES (1 Nov 2026, his black, core-less
    // listening screen). While the keyboard is up iOS scrolls the DOCUMENT
    // itself, even this 100dvh page, and every in-flow rect is read that far
    // up; the fixed layers do not move with it. Measured then (the mic opens
    // as the keyboard goes), the core was placed 396 px above the screen and
    // the sky ended 396 px short, and nothing measured again once iOS
    // scrolled back. So in-flow rects are taken back to the page's own place
    // (plus the document's scroll), the ground and the pour fill the screen
    // by CSS (only their sides follow <main>), and a document scroll, a
    // keyboard leaving and a return to the page all measure again.
    const sx = window.scrollX || 0;
    const sy = window.scrollY || 0;
    const m0 = main.getBoundingClientRect();
    const mr = { left: m0.left + sx, top: m0.top + sy, width: m0.width, bottom: m0.bottom + sy };
    const foot = parseFloat(getComputedStyle(root).paddingBottom) || 0;
    sec.style.setProperty('--oc-vh', `${Math.round(main.clientHeight)}px`);
    sec.style.setProperty('--oc-foot', `${Math.round(foot)}px`);
    for (const el of [groundRef.current, pourCanvasRef.current]) {
      if (!el) continue;
      el.style.left = `${mr.left}px`; el.style.width = `${mr.width}px`;
    }
    if (headRef.current) { headRef.current.style.left = `${mr.left}px`; headRef.current.style.width = `${mr.width}px`; headRef.current.style.top = `${mr.top}px`; }
    d.max = Math.max(0, main.scrollHeight - main.clientHeight);
    const off = main.scrollTop - d.max; // where the stage sits once he is at the foot
    const top = sec.getBoundingClientRect().top + sy + off;
    const composer = root.querySelector('.nv-nt-composer');
    const ctop = composer ? composer.getBoundingClientRect().top : mr.bottom - 82;
    sec.style.setProperty('--st-ctop', `${Math.round(ctop - top)}px`);
    // a short screen (Safari's toolbar, a small phone): the hint never sits
    // over the last exchange; it gives way instead
    const exb = sec.querySelector('.nv-nt-stexch')?.getBoundingClientRect();
    sec.toggleAttribute('data-crowded', !!exb && exb.height > 0 && exb.bottom + sy + off > ctop - 66 - 8);
    d.g = {
      fx: mr.left + mr.width / 2,
      // THE STAGE'S TOP AT THE FOOT IS THE PAGE'S TOP (the section is one
      // screen tall less the composer's foot, so at the foot it starts where
      // <main> does). Taken from <main>, which never moves, not from the
      // section, whose rect read mid-growth left the core up to 500 px above
      // its place for whole beats of his real brief (10 Nov, WebKit)
      fy: mr.top + PH.coreY,
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
      // AT THE STAGE IT STAYS AT THE STAGE until HIS finger moves it (10 Nov,
      // the real brief in WebKit): the brief's lines and their cards land in
      // the history above all at once, the scroll fell behind the growth by
      // a frame, and the stage was left 300 px down the page for the whole
      // brief. Only his own touch or wheel lets go of the stage.
      d.pinned = d.sp < 0.02 || (d.pinned && !d.mine);
      if (d.sp < 0.02) d.mine = false;
      if (d.pinned && d.sp >= 0.02) { main.scrollTop = main.scrollHeight; d.max = Math.max(0, main.scrollHeight - main.clientHeight); d.sp = canvasProgress(main.scrollTop, d.max, TRAVEL_PX); }
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
    const mine = () => { d.seeking = false; d.mine = true; };
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
    // the keyboard coming and going (iOS scrolls the document, the visual
    // viewport shrinks) and a return to the page: measure again, once a frame
    let again = 0;
    const remeasure = () => {
      if (again) return;
      again = requestAnimationFrame(() => { again = 0; measureRef.current(); progress(); });
    };
    const onVisible = () => { if (document.visibilityState === 'visible') remeasure(); };
    const vv = typeof window.visualViewport === 'object' ? window.visualViewport : null;
    window.addEventListener('scroll', remeasure, { passive: true });
    window.addEventListener('pageshow', remeasure);
    document.addEventListener('focusout', remeasure);
    document.addEventListener('visibilitychange', onVisible);
    vv?.addEventListener('resize', remeasure);
    vv?.addEventListener('scroll', remeasure);
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
      window.removeEventListener('scroll', remeasure);
      window.removeEventListener('pageshow', remeasure);
      document.removeEventListener('focusout', remeasure);
      document.removeEventListener('visibilitychange', onVisible);
      vv?.removeEventListener('resize', remeasure);
      vv?.removeEventListener('scroll', remeasure);
      cancelAnimationFrame(again);
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
    // mockup 114's phone: the core keeps one size in every state (its body
    // grows inside it); it shrinks only while everything is dealt out
    d.kTo = PHONE_CORE_SCALE;
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
  // Nova speaks in jade (the mockup); a voiced agent in its own hue
  const sayHue = speaker.voiced ? speaker.hue : STAGE_SPEAK_VAR;
  const speaking = S.key === 'speaking';
  // HIS PHONE AS THE MAC'S CAMERA (8 Nov 2026, lib/cameraRelay.js): "be my
  // camera" opens the back camera here and posts a small frame four times a
  // second; the Mac shows it live and looks at it when he asks for boxes
  const [beam, setBeam] = useState(false);
  const beamVideo = useRef(null);
  const beamStream = useRef(null);
  const [beamSent, setBeamSent] = useState(0);
  const [peerState, setPeerState] = useState('');
  const peerRef = useRef(null);
  useEffect(() => {
    if (!beam) { beamStream.current?.getTracks().forEach((t) => t.stop()); beamStream.current = null; return undefined; }
    let live = true;
    let timer = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then((stream) => {
        if (!live) { stream.getTracks().forEach((t) => t.stop()); return; }
        beamStream.current = stream;
        const v = beamVideo.current;
        if (v) { v.srcObject = stream; v.play().catch(() => {}); }
        // the live picture, peer to peer (src/cameraPeer.js); the relay below
        // keeps a slower copy for the model and for a Mac that cannot connect
        peerRef.current?.stop();
        peerRef.current = createPeer({ role: 'phone', stream, signal: (b) => T.signal?.(b), read: (r, s) => T.signalRead?.(r, s), onState: (st) => { if (live) setPeerState(st); } });
        const c = document.createElement('canvas');
        let busy = false;
        timer = setInterval(async () => {
          if (busy || !v || !v.videoWidth) return;
          busy = true;
          try {
            const w = 640; const h = Math.round((v.videoHeight / v.videoWidth) * w);
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(v, 0, 0, w, h);
            await T.beamFrame?.(c.toDataURL('image/jpeg', 0.7));
            if (live) setBeamSent((n) => n + 1);
          } catch { /* the next frame */ }
          busy = false;
        }, peerState === 'connected' ? 1000 : 250);
      })
      .catch(() => { if (live) setBeam(false); });
    return () => { live = false; clearInterval(timer); peerRef.current?.bye(); peerRef.current?.stop(); peerRef.current = null; beamStream.current?.getTracks().forEach((t) => t.stop()); beamStream.current = null; };
  }, [beam]); // eslint-disable-line react-hooks/exhaustive-deps
  // THE GLASS OBEYS WORDS on the phone too (src/glassVoice.js): the panels'
  // words are the living stage's (src/PhoneStage.jsx); the camera's are here
  const cameraGlass = useRef(null);
  cameraGlass.current = {
    run: (cmd) => {
      switch (cmd.cmd) {
        case 'camera-beam': case 'camera-on': setBeam(true); return true;
        case 'camera-off': setBeam(false); return true;
        default: return false;
      }
    },
  };
  const pours = focusPours('thread');
  const asks = chrome.briefMe ? focusAsks(T.status, { offline: T.offline }) : [];
  const rest = !turning;
  const dataState = rest ? 'idle' : S.key === 'listening' ? 'listen' : S.key === 'thinking' ? 'think' : 'speak';
  // the real core's element, for the living stage to tell it when to shrink
  const [coreEl, setCoreEl] = useState(null);
  useEffect(() => { setCoreEl(coreRef.current); }, []);
  // the brief's waiting question, or the document the last reply carries,
  // stand where the chips do at rest
  const restNote = close || (T.doc ? <div className="nv-nt-stdoc"><ArtifactCard key={T.doc.id} id={T.doc.id} compact /></div> : null);

  return (
    <>
      {/* THE GROUND: the mockup's sky, under the whole page */}
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
      <div ref={coreRef} className="nv-nt-ocore" data-fixed="" data-state={S.key} style={{ '--ph-core-k': PHONE_CORE_SCALE.toFixed(4) }}>
        <button type="button" className="nv-fx-corehit" onClick={onTalk}
          aria-label={S.key === 'listening' ? 'Nova is listening. Tap to send' : speaking ? `Nova is ${contest ? 'pushing back' : 'speaking'}. Tap to stop and talk` : `Nova, ${st.word.toLowerCase()}. Tap to talk`}>
          <CoreFace stateKey={S.key} engine={T.engine} focus tinted size={300} contest={contest} gold={STAGE_SPEAK === 'gold'} />
        </button>
      </div>
      {pours && <canvas ref={pourCanvasRef} className="nv-nt-opour" data-fixed="" aria-hidden="true" />}

      {/* THE STAGE: the foot of the one scroll, mockup 114's phone
          (src/PhoneStage.jsx): rest, the hero and the rail, See all, open */}
      <section ref={secRef} className="nv-nt-osec" data-state={dataState} aria-label="Nova" style={{ '--fx-hue': sayHue }}>
        <PhoneStage T={T} S={S} st={st} said={said} close={restNote} core={coreEl} glassRef={glassRef} outerGlass={cameraGlass} asks={asks} />

        {/* BEAMING: this phone is the Mac's camera (lib/cameraRelay.js) */}
        {beam && (
          <div className="nv-nt-beam" role="status">
            <video ref={beamVideo} muted playsInline autoPlay />
            <span><i />Camera to the Mac{peerState === 'connected' ? ' · live' : beamSent ? ` · ${beamSent} frames` : ''}</span>
            <button type="button" onClick={() => setBeam(false)}>Stop</button>
          </div>
        )}
      </section>
    </>
  );
}
