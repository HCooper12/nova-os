import { useEffect, useRef, useState } from 'react';
import { css } from './css.js';
import { NovaCore } from './NovaCore.jsx';
import { getCoreStyle } from './theme.js';
import { bootPoints, phaseAt, drawBoot, LEAVE_MS } from './motion/bootAssemble.js';
import './motion/bootAssemble.css';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEV = !!import.meta.env?.DEV;

// THE COLD OPEN. While Nova is genuinely loading, the core assembles out of
// points drifting in from the edges (src/motion/bootAssemble.js) and then the
// real core takes over. It never holds the load: `info.ready` (the app has
// booted) jumps the points to their end and the whole screen fades out in
// LEAVE_MS, with nothing under his finger blocked; `info.gone` then takes it
// away. Under reduced motion there are no points, the core is simply there,
// and it leaves the instant the app is ready.
export function Boot({ info }) {
  const lines = info
    ? [info.vaultLine, info.recipesLine, info.agentsLine]
    : ['VAULT · CONNECTING…', 'RECIPES · CONNECTING…', 'JOURNAL · CONNECTING…'];
  const ready = !!info?.ready;
  const [still] = useState(reducedMotion);
  const [stage, setStage] = useState(still ? 'core' : 'assemble'); // assemble → core
  const [leaving, setLeaving] = useState(false);
  const [ptsGone, setPtsGone] = useState(false); // the canvas, once it has faded into the core
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const finishing = useRef(false);
  const goneRef = useRef(info?.gone);
  goneRef.current = info?.gone;

  // ---- the points: one rAF loop, alive only while they assemble
  useEffect(() => {
    if (stage !== 'assemble') return undefined;
    const cv = canvasRef.current;
    const box = boxRef.current;
    const ctx = cv?.getContext?.('2d');
    if (!ctx || !box) { setStage('core'); return undefined; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const r = box.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const tok = getComputedStyle(document.documentElement);
    const col = (n, d) => tok.getPropertyValue(`--nv-${n}`).trim() || d;
    const colors = { cy: col('cy', '#59e6ff'), gold: col('gold', '#e0b26a'), vi: col('vi', '#8f7bff'), ink: col('ink', '#e8ecf6') };
    const pts = bootPoints(w, h, cx, cy);
    const geo = { w, h, cx, cy, dpr, colors };
    const stats = DEV ? (window.__bootStats = { frames: 0, drawMs: [], points: pts.length, dpr }) : null;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now) => {
      raf = 0;
      // dev only: a pinned clock, so one moment of the flight can be photographed
      const pinned = DEV && typeof window.__bootT === 'number' ? window.__bootT : null;
      const ph = finishing.current ? { k: 1, swirl: 0, glint: null, handover: true } : phaseAt(pinned ?? now - t0);
      const a = stats ? performance.now() : 0;
      drawBoot(ctx, pts, { ...geo, ...ph });
      if (stats) { stats.frames += 1; stats.drawMs.push(performance.now() - a); }
      // the app is ready first: the end state is drawn once and the loop ends
      // there (the screen is already fading); otherwise the core takes over
      if (finishing.current) return;
      if (ph.handover && pinned == null) { setStage('core'); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [stage]);

  // ---- the app is ready: never wait on the show
  useEffect(() => {
    // dev only: hold the boot on screen as if still loading, to photograph it
    if (!ready || (DEV && window.__bootHold)) return undefined;
    finishing.current = true;
    if (still) { goneRef.current?.(); return undefined; }
    setLeaving(true);
    const id = setTimeout(() => goneRef.current?.(), LEAVE_MS + 20);
    return () => clearTimeout(id);
  }, [ready, still]);

  const core = stage === 'core';
  return (
    <div className={`nv-boot${leaving ? ' leaving' : ''}`} style={css("position:fixed;inset:0;z-index:100;background:radial-gradient(900px 560px at 50% 42%, var(--nv-bg2) 0%, var(--nv-void) 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px")}>
      {!still && !ptsGone && (
        <canvas ref={canvasRef} className={`nv-boot-pts${core ? ' out' : ''}`} aria-hidden="true"
          onAnimationEnd={() => setPtsGone(true)} />
      )}
      <div ref={boxRef} style={css("position:relative;width:150px;height:150px;display:flex;align-items:center;justify-content:center")}>
        {core && (
          <div className={`nv-boot-core${still ? '' : ' in'}`}>
            <span style={css("position:absolute;inset:0;border-radius:50%;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);border-top-color:var(--nv-cy);animation:ringSpin 2.4s linear infinite")}></span>
            <span style={css("position:absolute;inset:14px;border-radius:50%;border:1px dashed color-mix(in srgb, var(--nv-gold) 30%, transparent);animation:ringSpin 9s linear infinite reverse")}></span>
            <NovaCore size={112} engine={getCoreStyle()} />
          </div>
        )}
      </div>
      <div style={css("position:relative;font:700 26px var(--nv-font-ui);letter-spacing:.34em;color:var(--nv-ink);padding-left:.34em")}>NOVA<span style={css("background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi));-webkit-background-clip:text;background-clip:text;color:transparent")}>·OS</span></div>
      <div style={css("position:relative;display:flex;flex-direction:column;gap:7px;font:var(--nv-micro-m);letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);text-align:center")}>
        {lines.map((line, i) => (
          <div key={i} style={{ animation: `fadeUp .5s ease-out ${i * 0.35}s both` }}>{line}</div>
        ))}
      </div>
      <div style={css("position:relative;width:220px;height:2px;border-radius:2px;background:color-mix(in srgb, var(--nv-ink) 10%, transparent);overflow:hidden")}><div style={css("height:100%;background:linear-gradient(90deg,var(--nv-gold),var(--nv-cy));animation:barSweep 1.5s ease-out both")}></div></div>
    </div>
  );
}
