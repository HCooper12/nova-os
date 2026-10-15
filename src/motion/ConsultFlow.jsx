import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { finderOf } from '../glassMarks.js';
import { consultOf, subscribeConsult } from './consultFeed.js';
import { consultCaption, consultNodes } from './consultFlowFacts.js';
import './consultFlow.css';

// FLOWING PATHS (the motion set, mockup #s8, approved 15 Oct 2026). While the
// Coach is really asking another agent mid-answer, a small map sits where he
// is working: the Coach on the left, whoever he asked on the right, a curved
// path to each. A light leaves the Coach along the path as the ask goes out,
// the agent lights in its own hue while it works, and the light comes back
// when its answer lands. A serif line says what is happening, in code's words.
//
// Driven ONLY by the roster the server puts on the job (src/motion/
// consultFeed.js): no roster, nothing drawn; no ask, no light. Each agent
// wears its one hue (glassMarks.FINDERS, the table every consult surface
// reads). The light rides the path on the smooth spring in one rAF loop that
// runs only while a light is travelling; under reduced motion there is no
// light, the nodes and paths simply change state.

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// the house smooth spring (bounce 0) as a function of seconds, the same curve
// --nv-spring-smooth draws as CSS
function smoothSpring(dur) {
  const w = (2 * Math.PI) / dur;
  return (t) => 1 - Math.exp(-w * t) * (1 + w * t);
}
const TRIP_MS = 900;
const ease = smoothSpring(TRIP_MS / 1000 / 1.8);

const ROW = 46;
const PAD = 22;

export function ConsultFlow({ lane = 'coach', live = true, from = 'coach' }) {
  const roster = useSyncExternalStore(subscribeConsult, () => consultOf(lane), () => null);
  const nodes = live ? consultNodes(roster) : [];
  if (!nodes.length) return null;
  return <Flow nodes={nodes} from={from} />;
}

function Flow({ nodes, from }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = Math.max(112, nodes.length * ROW + PAD * 2 - 12);
  const C = { x: Math.max(52, w * 0.2), y: h / 2 };
  const tx = Math.max(C.x + 120, w * 0.74);
  const at = nodes.map((n, i) => ({ ...n, x: tx, y: nodes.length === 1 ? h / 2 : PAD + 10 + (i * (h - 2 * PAD - 20)) / (nodes.length - 1) }));
  const pathOf = (p) => `M${C.x + 34},${C.y} C${C.x + 104},${C.y} ${p.x - 116},${p.y} ${p.x - 46},${p.y}`;

  // ---- the lights: one trip out when an ask is first seen, one trip back
  // when its answer is first seen; a trip back waits for its trip out
  const pathRefs = useRef(new Map());
  const pulseRefs = useRef(new Map());
  const trips = useRef(new Map()); // agent -> { dir, t0 }
  const seen = useRef(new Map()); // agent -> the last state a trip was started for
  const raf = useRef(0);
  const [arrived, setArrived] = useState(() => new Set()); // lit only once the light has landed

  const tick = (now) => {
    raf.current = 0;
    let moving = false;
    for (const [agent, trip] of trips.current) {
      const path = pathRefs.current.get(agent);
      const dot = pulseRefs.current.get(agent);
      if (!path || !dot) { trips.current.delete(agent); continue; }
      const k = Math.min(1, (now - trip.t0) / TRIP_MS);
      const e = Math.min(1, ease((k * TRIP_MS) / 1000));
      const L = path.getTotalLength();
      const p = path.getPointAtLength((trip.dir === 'back' ? 1 - e : e) * L);
      dot.style.transform = `translate(${p.x}px, ${p.y}px)`;
      dot.style.opacity = k < 0.92 ? '1' : String(Math.max(0, (1 - k) / 0.08));
      if (k >= 1) {
        trips.current.delete(agent);
        dot.style.opacity = '0';
        if (trip.dir === 'out') setArrived((s) => new Set(s).add(agent));
        if (trip.then) trips.current.set(agent, { dir: trip.then, t0: now });
        moving = moving || !!trip.then;
      } else moving = true;
    }
    if (moving) raf.current = requestAnimationFrame(tick);
  };

  const key = nodes.map((n) => `${n.agent}:${n.state}`).join('|');
  useEffect(() => {
    const still = reduced();
    for (const n of nodes) {
      const was = seen.current.get(n.agent);
      if (was === n.state) continue;
      seen.current.set(n.agent, n.state);
      if (still) { setArrived((s) => new Set(s).add(n.agent)); continue; }
      const cur = trips.current.get(n.agent);
      if (n.state === 'asking' && !cur) trips.current.set(n.agent, { dir: 'out', t0: performance.now() });
      else if (n.state === 'done') {
        // an answer that lands mid-trip rides back once the light has arrived;
        // one seen with no trip out yet (it was quick) still goes out first
        if (cur?.dir === 'out') cur.then = 'back';
        else if (!was) trips.current.set(n.agent, { dir: 'out', t0: performance.now(), then: 'back' });
        else trips.current.set(n.agent, { dir: 'back', t0: performance.now() });
      }
    }
    if (trips.current.size && !raf.current) raf.current = requestAnimationFrame(tick);
  }, [key, w]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); raf.current = 0; }, []);

  const coach = finderOf(from);
  const caption = consultCaption(nodes);
  return (
    <div className="nv-cf" role="status" aria-live="polite">
      <div ref={wrapRef} className="nv-cf-map" style={{ height: h }} aria-hidden="true">
      {w > 0 && (
        <>
          <svg className="nv-cf-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {at.map((p) => (
              <g key={p.agent} style={{ '--h': finderOf(p.agent).hue }}>
                <path className="nv-cf-p" d={pathOf(p)} />
                <path ref={(el) => { if (el) pathRefs.current.set(p.agent, el); else pathRefs.current.delete(p.agent); }}
                  className={`nv-cf-lit${p.state === 'failed' ? ' failed' : p.state === 'done' ? ' done' : ''}`} d={pathOf(p)} pathLength="1" />
              </g>
            ))}
          </svg>
          <span className="nv-cf-node on" style={{ '--h': coach.hue, transform: `translate(${C.x}px, ${C.y}px) translate(-50%, -50%)` }}><i />{coach.name}</span>
          {at.map((p) => {
            const lit = p.state === 'asking' && arrived.has(p.agent);
            return (
              <span key={p.agent} className={`nv-cf-node${lit ? ' on' : ''}${p.state === 'done' ? ' done' : ''}${p.state === 'failed' ? ' failed' : ''}`}
                style={{ '--h': finderOf(p.agent).hue, transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)` }}>
                <i />{p.name}
              </span>
            );
          })}
          {at.map((p) => (
            <span key={`pulse:${p.agent}`} ref={(el) => { if (el) pulseRefs.current.set(p.agent, el); else pulseRefs.current.delete(p.agent); }}
              className="nv-cf-pulse" style={{ '--h': finderOf(p.agent).hue }} aria-hidden="true" />
          ))}
        </>
      )}
      </div>
      <p className="nv-cf-cap" key={caption}>{caption}</p>
    </div>
  );
}
