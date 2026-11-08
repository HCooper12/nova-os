import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { WALL_MAX, wallWanted, scatterLayout, cornerFrame, CORNER, wallOpenRect, eyebrowOf } from './wallFacts.js';
import { createPeer } from './cameraPeer.js';
import { CoreFace } from './NovaThreadParts.jsx';
import { StageCard } from './StageCard.jsx';
import { SafeVisual } from './SafeVisual.jsx';
import { LocalInput } from './LocalInput.jsx';
import { audioLevel } from './audioLevel.js';
import { onSpeech, spokenSentences } from './speechClock.js';
import { Captions } from './NovaFocus.jsx';
import { speakerOf, lastYours, WORD_LOOK } from './novaFocusFacts.js';
import { lastExchange, stageState, STAGE_SPEAK_VAR } from './novaStageFacts.js';
import { gistOf } from './novaThreadFacts.js';
import { clockNow } from './speechClock.js';
import { TOKEN_RE } from './artifactBlocks.js';
import { CountUp } from './CountUp.jsx';
import { consultOf, subscribeConsult } from './motion/consultFeed.js';
import {
  frameFor, macCoreScale, macState, satellitesOf, thinkingLine, SAT_SLOTS, SAT_SLOTS_DOCKED,
  liveDock, dockOrder, panelHead, codePanels, sentencesOf, coveredByCode, panelDescriptors, thumbOf, COLUMN, OPEN_PANEL, COMPOSER, MAX_DOCKED,
} from './novaMacFacts.js';
import './novaMac.css';

// ONE NOVA ON THE MAC (1 Nov 2026) — design/mockups/108-one-nova-mac.html,
// his approval: "The Mac mockup looks good. Just ensure the jade colour for
// speaking and that the build matches your mockup identically with every
// function. I also want to be able to interact with the panel displays
// after/during conversation."
//
// The Nova page at desktop width (the phone keeps src/NovaStage.jsx, mockup
// 106 A). One window-sized stage: the REAL core in the middle of the room,
// coloured by state (Ready blue, Listening violet, Thinking cyan with its
// orbit, Speaking jade), the words under it, the composer at the foot. What
// the Mac adds, each drawn from what is really happening:
//   · the capsule rail recedes while Nova holds the stage and comes back on
//     Ready (a lit edge on the left brings it back on hover);
//   · Thinking shows the agents being asked, as satellites on threads in
//     their own hues, from the roster the server keeps on the job; no roster,
//     no satellites;
//   · the running glass docks the answer's real panels in a column beside the
//     core, each tethered to it, the one being said lit; after the answer
//     they stay until he moves on or presses Esc; he can hover, open, act on,
//     pin and put away each one, by pointer or keyboard;
//   · the history is a 400 px drawer on the right (⌘\, or scrolling up over
//     the stage); the stage stays live beside it;
//   · hold ⌥Space to talk and let go to send; Esc stops; Enter sends.
//
// PERFORMANCE: the core, the words under it, the satellites and the tethers
// are moved by transform from one rAF while something travels or a thread
// is drawn, never through React state per frame.

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;
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
const cssv = (n) => (typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(n).trim());

// the embers' hue follows the core's (mockup 108: its hue less 0.4 of its spread)
const EMBER_HUE = { idle: 209.6, listen: 257.6, think: 192, speak: 156.4 };
// the core's body radius in the mockup, for where a thread leaves its rim
const BODY = { idle: 0.74, listen: 0.95, think: 0.74, speak: 0.8 };
// the tether's bend for each slot of the column (mockup ANCH, from its anchor)
const BEND = [[-82, 10], [-116, -100], [-34, -226]];
// the agents' polls that can carry a roster (src/motion/consultFeed.js)
const LANES = ['ask', 'coach', 'leader', 'quick'];
const rosterNow = () => { for (const l of LANES) { const r = consultOf(l); if (r) return r; } return null; };

// mockup 108's own rail glyphs (its <symbol>s), so the rail is the mockup's
const RAIL = [
  { k: 'mission', label: 'Home', d: <path d="M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z" /> },
  { k: 'voice', label: 'Nova', d: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></> },
  { k: 'workouts', label: 'Train', d: <path d="M3 12h18M6 8v8M3.5 10v4M18 8v8M20.5 10v4" /> },
  { k: 'recipes', label: 'Fuel', d: <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 21V3c-2 1.5-3 4-3 7h3" /> },
  { k: 'inbox', label: 'Inbox', d: <path d="M4 13h4l1.5 3h5L16 13h4M4 13l2.5-8h11L20 13v6H4z" /> },
  { k: 'index', label: 'All pages', d: <><rect x="4" y="4" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" /></> },
];
const G = {
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  replay: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />,
  pin: <path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" />,
  doc: <path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20zM14 3.5V8h4M9.5 12.5h5M9.5 16h5" />,
};
const Gl = ({ n }) => <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{G[n]}</svg>;
const Kbd = ({ children }) => <kbd className="nv-mac-kbd">{children}</kbd>;

// THE MAC'S EMBERS (mockup 108 makeEmbers): 70 motes from one seed, rising,
// in the core's hue, quicker with the voice; one still frame under reduced
// motion; stopped while the page is hidden.
function useEmbers(ref, hueRef) {
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return undefined;
    let W = 0; let H = 0; let P = [];
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = seeded(23);
      P = Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H, vy: -(3 + r() * 9), vx: (r() - 0.5) * 5, sz: 0.5 + Math.pow(r(), 2) * 1.2, al: 0.15 + r() * 0.45, ph: r() * 6.28, ts: 0.5 + r() * 1.8 }));
    };
    size();
    let hue = hueRef.current;
    const draw = (dt, t) => {
      hue += (hueRef.current - hue) * Math.min(1, dt * 60 * 0.07);
      const lvl = Math.min(1, audioLevel());
      ctx.clearRect(0, 0, W, H);
      for (const p of P) {
        p.y += p.vy * dt * (1 + lvl * 2); p.x += p.vx * dt;
        if (p.y < -4) { p.y = H + 4; p.x = Math.random() * W; }
        if (p.x < -4) p.x = W + 4;
        if (p.x > W + 4) p.x = -4;
        const a = p.al * (0.45 + 0.55 * Math.abs(Math.sin(t * p.ts + p.ph)));
        ctx.fillStyle = `hsla(${hue.toFixed(1)},80%,82%,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, 6.29); ctx.fill();
      }
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { size(); draw(0, 0); });
    ro?.observe(cv);
    if (reducedMotion()) { draw(0, 0); return () => ro?.disconnect(); }
    let raf = 0; let last = 0;
    const loop = (now) => { const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now; draw(dt, now / 1000); raf = requestAnimationFrame(loop); };
    const onVis = () => { cancelAnimationFrame(raf); last = 0; if (document.visibilityState === 'visible') raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); ro?.disconnect(); };
  }, [ref, hueRef]);
}

// THE LISTENING METER (mockup 108 .meter): 34 violet bars, tallest in the
// middle, breathing with his real voice level; with none, they lie low
function Meter() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return undefined;
    const bars = [...el.children];
    const n = bars.length;
    let raf = 0;
    const loop = (now) => {
      const lvl = Math.min(1, audioLevel());
      for (let i = 0; i < n; i++) {
        const c = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
        const v = Math.max(0.1, Math.min(1, 0.1 + lvl * 3.2 * (0.35 + 0.65 * c) * (0.65 + 0.35 * Math.sin(now / 90 + i * 1.7))));
        bars[i].style.transform = `scaleY(${v.toFixed(3)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className="nv-mac-meter" role="img" aria-label="Your voice, live">{Array.from({ length: 34 }, (_, i) => <i key={i} />)}</div>;
}

// a phone frame (a blob URL) back to a data URL for the attachment rail
async function phoneFrameDataUrl(blobUrl) {
  try {
    const blob = await (await fetch(blobUrl)).blob();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsDataURL(blob); });
  } catch { return null; }
}

export function NovaMac({ T, S, dict, onTalk, onSend, fieldRef, captions, history, onStatus, glassRef = null }) {
  const rootRef = useRef(null);
  const coreRef = useRef(null);
  const underRef = useRef(null);
  const tetherRef = useRef(null);
  const composerRef = useRef(null);
  const emberRef = useRef(null);
  const satRefs = useRef(new Map());
  const panelRefs = useRef(new Map());
  const listRef = useRef(null);

  const [view, setView] = useState(() => ({ w: typeof window === 'undefined' ? 1440 : window.innerWidth, h: typeof window === 'undefined' ? 872 : window.innerHeight }));
  useEffect(() => {
    const on = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const [hist, setHist] = useState(false);
  const [peek, setPeek] = useState(false);
  const [said, setSaid] = useState(spokenSentences);
  useEffect(() => onSpeech((list) => setSaid(list)), []);

  const contest = S.key === 'speaking' && !!T.contest;
  const st = stageState(S.key, { contest });
  const turning = S.key === 'listening' || S.key === 'thinking' || S.key === 'speaking';
  const speaking = S.key === 'speaking';
  // the stage reads in sentences: a document's [[artifact:…]] mark is the
  // drawer's to open, never words under the core
  const ex0 = lastExchange(T.lines);
  const unmark = (x) => (x ? { ...x, text: x.text.replace(TOKEN_RE, ' ').replace(/\s+/g, ' ').trim() } : x);
  const ex = { you: unmark(ex0.you), nova: unmark(ex0.nova) };
  const lastNova = useMemo(() => [...T.lines].reverse().find((m) => m.who === 'nova' && !m.streaming) || null, [T.lines]);

  // ---- THE PANELS CODE BUILDS FROM HIS DATA (novaMacFacts codePanels): his
  // week, a Researcher brief the answer stood on, the day a proposal lands
  // in. Only for an answer that arrived while this page was open (an old
  // answer on arrival is the Ready line, never a stage of panels).
  const mountedAt = useRef(lastNova?.at ?? null);
  const [freshAt, setFreshAt] = useState(null);
  useEffect(() => {
    if (lastNova?.at != null && lastNova.at !== mountedAt.current && lastNova.at !== freshAt) setFreshAt(lastNova.at);
  }, [lastNova?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = freshAt != null && lastNova?.at === freshAt ? lastNova : null;
  const code = useMemo(() => (fresh ? codePanels({
    question: ex0.you?.text || '', answer: fresh.text || '', week: T.week, inbox: T.inbox,
    briefIds: fresh.briefIds, proposal: fresh.proposal, events: T.calendarEvents,
  }) : []), [fresh, ex0.you?.text, T.week, T.inbox, T.calendarEvents]);
  // the line keeps what code showed (kind, title, source) for the drawer
  const descSig = JSON.stringify(panelDescriptors(code));
  useEffect(() => {
    if (!fresh || descSig === '[]' || JSON.stringify(fresh.macPanels || []) === descSig) return;
    T.notePanels?.(fresh.at, JSON.parse(descSig));
  }, [fresh?.at, descSig]); // eslint-disable-line react-hooks/exhaustive-deps
  // a calendar proposal needs his calendar: fetched once, read-only
  const wantsCal = !!fresh?.proposal?.recordId && T.calendarEvents == null;
  useEffect(() => { if (wantsCal) T.loadCalendar?.(); }, [wantsCal]); // eslint-disable-line react-hooks/exhaustive-deps
  // which sentence of the answer is being said now (the speech clock), so
  // each code panel rises with the sentence that names it
  const sents = useMemo(() => sentencesOf(fresh?.text || ''), [fresh?.text]);
  const [sayIdx, setSayIdx] = useState(-1);
  useEffect(() => {
    if (!speaking || !sents.length) { setSayIdx(-1); return undefined; }
    const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 28);
    const tick = () => {
      const now = clockNow();
      const started = said.filter((x) => Number.isFinite(x.at) && x.at <= now);
      const last = started[started.length - 1];
      if (!last) { setSayIdx(-1); return; }
      const k = sents.findIndex((x) => norm(x) && (norm(last.text).startsWith(norm(x).slice(0, 18)) || norm(x).startsWith(norm(last.text).slice(0, 18))));
      setSayIdx(k >= 0 ? k : Math.min(sents.length - 1, started.length - 1));
    };
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [speaking, sents, said]);
  const codeNow = speaking ? code.filter((p) => p.sentence <= sayIdx) : code;
  const codeLit = speaking && sayIdx >= 0 ? (code.filter((p) => p.sentence === sayIdx).pop()?.key || null) : null;

  // ---- THE RUNNING GLASS, DOCKED ----------------------------------------
  // the answer's panels: while it is said, the ones said so far and the one
  // being said (T.stage); once it is over, the panels its line kept (the
  // settled snapshot), held until he moves on, presses Esc or puts them away.
  // A pinned panel stays through the next question.
  const [answer, setAnswer] = useState({ panels: [], from: null });   // from: 'live' | 'answer' | 'replay'
  const [pinned, setPinned] = useState(() => new Map());             // key -> card
  const [gone, setGone] = useState(() => new Set());
  const [openKey, setOpenKey] = useState(null);
  const [hoverKey, setHoverKey] = useState(null);
  const [replay, setReplay] = useState(null);                       // { panels, idx }
  const [cut, setCut] = useState(false);                             // Esc stopped him mid-answer
  // ---- THE WALL OF REFERENCES (7 Nov 2026, src/wallFacts.js, mockup 110):
  // every panel of the answer and every page or clip the lookup put up, at
  // once; T squares them; "bring back" reaches into what was put away
  const [tidy, setTidy] = useState(false);
  const [heights, setHeights] = useState({});
  const [playing, setPlaying] = useState(null);
  const [wallHistory, setWallHistory] = useState([]);
  const [brought, setBrought] = useState(() => new Map());
  const lookupCards = T.lookup?.cards || [];
  // THE WORDS ARE FOLDED BY DEFAULT on the wall (his call, 8 Nov 2026: the
  // content is the point, as on Rose's HUD); an arrow, W, or "show the
  // transcript" opens them, and the choice is remembered on this Mac
  const asleep = !!T.standby;
  // NOVA'S EYES (8 Nov 2026, Rose's pumpkin reel): the Mac's camera as the
  // wall's ground, labelled boxes the model on this Mac drew over it
  const [camera, setCamera] = useState(false);
  const [boxes, setBoxes] = useState([]);
  // 'mac' is this machine's camera; 'phone' is his phone beaming through
  // the server (lib/cameraRelay.js), shown here as the latest frame
  const [camSource, setCamSource] = useState('mac');
  const [phoneFrame, setPhoneFrame] = useState(null);
  const [phoneLive, setPhoneLive] = useState(false);
  // the phone's live track over WebRTC (src/cameraPeer.js); until it
  // arrives the relayed frames show
  const [peerStream, setPeerStream] = useState(null);
  const peerRef = useRef(null);
  const peerVideo = useRef(null);
  useEffect(() => {
    if (!camera || camSource !== 'phone') { peerRef.current?.stop(); peerRef.current = null; setPeerStream(null); return undefined; }
    peerRef.current?.stop();
    peerRef.current = createPeer({ role: 'mac', signal: (b) => T.signal?.(b), read: (r, s) => T.signalRead?.(r, s), onTrack: (ms) => setPeerStream(ms), onState: (st) => { if (st === 'failed' || st === 'disconnected' || st === 'hungup' || st === 'closed') setPeerStream(null); } });
    return () => { peerRef.current?.stop(); peerRef.current = null; };
  }, [camera, camSource]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const v = peerVideo.current; if (v && peerStream) { v.srcObject = peerStream; v.play().catch(() => {}); } }, [peerStream]);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // is a phone beaming? asked every 3 s while this page is open; a phone that
  // starts beaming opens the camera here by itself (the handoff he asked for)
  useEffect(() => {
    let live = true;
    const tick = () => T.cameraState?.().then((s) => { if (!live) return; const on = !!s?.live; setPhoneLive(on); if (on && !camera) { setCamSource('phone'); setCamera(true); } if (!on && camera && camSource === 'phone') { setCamSource('mac'); } }).catch(() => {});
    tick();
    const id = setInterval(tick, 3000);
    return () => { live = false; clearInterval(id); };
  }, [camera, camSource]); // eslint-disable-line react-hooks/exhaustive-deps
  // the phone's frames, four a second, as blob URLs (the token rides the fetch)
  useEffect(() => {
    if (!camera || camSource !== 'phone') { setPhoneFrame((u) => { if (u) URL.revokeObjectURL(u); return null; }); return undefined; }
    let live = true;
    let busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      try { const u = await T.cameraFrame?.(); if (live && u) setPhoneFrame((prev) => { if (prev) URL.revokeObjectURL(prev); return u; }); } catch { /* the next frame */ }
      busy = false;
    }, 250);
    return () => { live = false; clearInterval(id); };
  }, [camera, camSource]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!camera || camSource !== 'mac') { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; if (!camera) setBoxes([]); return undefined; }
    let live = true;
    navigator.mediaDevices?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (!live) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; v.onloadedmetadata = () => v.play().catch(() => {}); v.play().catch(() => {}); }
      })
      .catch(() => { if (live) setCamera(false); });
    return () => { live = false; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [camera, camSource]);
  // one frame, 448 px wide (the model's measured sweet spot); waits up to
  // 1.5 s for the first frame if the camera has only just opened
  const snapshotOf = async (v) => {
    if (!v) return null;
    for (let i = 0; i < 15 && !v.videoWidth; i++) await new Promise((r) => setTimeout(r, 100));
    if (!v.videoWidth) return null;
    const w = 448; const h = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(v, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  };
  const snapshot = async () => {
    const v = videoRef.current;
    if (!v) return null;
    for (let i = 0; i < 15 && !v.videoWidth; i++) await new Promise((r) => setTimeout(r, 100));
    if (!v.videoWidth) return null;
    const w = 448; const h = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(v, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  };
  const liveSig = T.stage ? `${T.stage.key}|${(T.stage.rail || []).length}` : '';
  const live = T.stage ? liveDock(T.stage, WALL_MAX) : null;
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => {
    if (!liveSig) return;
    const l = liveRef.current;
    setAnswer((a) => ({ panels: dockOrder([...(a.from === 'live' ? a.panels.map((p) => p.card) : []), ...l.panels.map((p) => p.card)], WALL_MAX), from: 'live' }));
  }, [liveSig]);
  // the hero being said keeps its live face (a data panel's light changes)
  const panelsNow = answer.from === 'live' && live
    ? answer.panels.map((p) => live.panels.find((q) => q.key === p.key) || p)
    : answer.panels;
  // the answer is over: its line's own panels, if it kept them
  const wasSpeaking = useRef(speaking);
  useEffect(() => {
    if (wasSpeaking.current && !speaking) {
      const kept = lastNova?.settled?.panels;
      setAnswer((a) => (kept?.length ? { panels: dockOrder(kept, WALL_MAX), from: 'answer' } : a.panels.length ? { ...a, from: 'answer' } : a));
    }
    wasSpeaking.current = speaking;
  }, [speaking, lastNova]);
  // a new turn clears the glass (pinned panels stay)
  const wasTurn = useRef(S.key);
  useEffect(() => {
    const k = S.key;
    if ((k === 'listening' || k === 'thinking') && wasTurn.current !== 'listening' && wasTurn.current !== 'thinking') {
      setAnswer({ panels: [], from: null }); setGone(new Set()); setOpenKey((o) => (o && pinned.has(o) ? o : null)); setCut(false); setReplay(null); setFreshAt(null); mountedAt.current = lastNova?.at ?? null; setPlaying(null); setTidy(false);
    }
    if (k === 'speaking' && wasTurn.current !== 'speaking') { setCut(false); setGone(new Set()); }
    wasTurn.current = k;
  }, [S.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // the replay of a past answer's panels (the drawer's "Replay with the glass")
  useEffect(() => {
    if (!replay) return undefined;
    if (replay.idx >= replay.panels.length) return undefined;
    const id = setTimeout(() => setReplay((r) => (r ? { ...r, idx: r.idx + 1 } : r)), reducedMotion() ? 1200 : 3200);
    return () => clearTimeout(id);
  }, [replay]);

  // code's panels first (the mockup's sets, brief, day), then the model's
  const allModel = panelsNow.filter((p) => !code.some((c) => c.key === p.key) && !coveredByCode(p.card, code));
  const source = replay ? replay.panels : [...codeNow.map((c) => ({ key: c.key, card: c })), ...allModel.slice(0, Math.max(0, MAX_DOCKED - code.length))];
  const docked = (() => {
    const out = [];
    for (const [key, card] of pinned) out.push({ key, card, pinned: true });
    // one put away keeps its place while it leaves (and after: the column
    // does not close up under him, as the mockup's slots)
    for (const p of source) if (!pinned.has(p.key) && out.length < MAX_DOCKED) out.push(gone.has(p.key) ? { ...p, out: true } : p);
    return out;
  })();
  const litKey = replay ? (replay.panels[replay.idx]?.key || null) : speaking && !cut ? (codeLit || (live ? live.lit : null)) : null;
  const shownDock = docked.filter((p) => !p.out);
  // THE WALL: a page or video beat the model wrote is a LIGHT on the card the
  // lookup already put up, never a second card
  const lightOf = (card) => (card?.kind === 'page' && !card.lookup && card.source ? `lk:p${card.source}` : card?.kind === 'video' && !card.lookup && card.clip ? `lk:v${card.clip}` : null);
  const wallAll = (() => {
    const seen = new Set();
    const out = [];
    const add = (key, card, extra = {}) => { if (!key || !card || seen.has(key) || gone.has(key)) return; seen.add(key); out.push({ key, card, ...extra }); };
    for (const [key, card] of pinned) add(key, card, { pinned: true });
    for (const [key, card] of brought) add(key, card, { brought: true });
    for (const l of lookupCards) add(l.key, l.card);
    const model = replay ? replay.panels : [...codeNow.map((c) => ({ key: c.key, card: c })), ...allModel];
    for (const p of model) { if (lightOf(p.card)) continue; add(p.key, p.card); }
    return out.slice(0, WALL_MAX);
  })();
  const wallOn = !hist && wallWanted({ panels: wallAll.filter((w) => !w.card.lookup).length, lookup: lookupCards.length });
  const heroCard = replay ? replay.panels[replay.idx]?.card : T.stage?.hero;
  const litShown = wallOn ? (speaking && !cut && lightOf(heroCard)) || litKey : litKey;
  const wallKeys = wallAll.map((w) => `${w.key}:${w.card.kind}`).join('|');
  // ROSE'S SCATTER (8 Nov, his call): sizes by kind, a seeded free layout;
  // T squares them into the masonry for reading
  const lay = useMemo(() => scatterLayout(wallAll.map((w) => ({ key: w.key, kind: w.card.kind })), { width: view.w, height: view.h, heights, tidy }), [wallKeys, view.w, view.h, heights, tidy]); // eslint-disable-line react-hooks/exhaustive-deps
  const layAt = new Map(lay.map((l) => [l.key, l]));
  useEffect(() => {
    if (!wallOn || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      setHeights((h) => {
        let next = null;
        for (const e of entries) {
          const k = e.target.dataset.wallkey;
          const v = e.target.offsetHeight;
          if (k && v && Math.abs((h[k] || 0) - v) > 1) { next = next || { ...h }; next[k] = v; }
        }
        return next || h;
      });
    });
    for (const w of wallAll) { const el = panelRefs.current.get(w.key); if (el) { el.dataset.wallkey = w.key; ro.observe(el); } }
    return () => ro.disconnect();
  }, [wallOn, wallKeys]); // eslint-disable-line react-hooks/exhaustive-deps
  const wallHeld = wallOn && !turning && wallAll.length > 0;
  // SLEEP (his yes, 8 Nov): "go to sleep" clears the wall to the core alone
  const wasAsleep = useRef(asleep);
  useEffect(() => {
    if (asleep && !wasAsleep.current) {
      const keys = wallAll.filter((w) => !w.pinned).map((w) => w.key);
      if (keys.length) putAwayRef.current?.(keys);
      setOpenKey(null); setTidy(false);
    }
    wasAsleep.current = asleep;
  }, [asleep]); // eslint-disable-line react-hooks/exhaustive-deps
  const answerHeld = (!turning && !replay && (answer.from === 'answer' || (!!fresh && code.length > 0)) && shownDock.length > 0) || wallHeld;
  const hasDock = shownDock.length > 0 && !hist && !wallOn;
  const focus = turning || answerHeld || !!replay || wallOn;
  const proposal = lastNova?.proposal || null;
  const hasCalPanel = docked.some((p) => p.card?.macKind === 'calendar');
  const calDay = (code.find((c) => c.macKind === 'calendar')?.head?.sub || '').split(' ')[0];
  // the proposal's tick and cross join the last panel once its sentence is
  // being said (the answer's last panel), or once the answer is over
  const decideReady = !speaking || !!(T.stage?.total && T.stage.n >= T.stage.total);

  // ---- the state, in the mockup's words
  const mstate = macState(S.key);
  const plateOn = (speaking || answerHeld) && !wallOn;
  const dataState = speaking ? 'speak' : answerHeld ? 'panels' : mstate;
  const hueRef = useRef(EMBER_HUE.idle);
  hueRef.current = EMBER_HUE[speaking ? 'speak' : mstate] ?? EMBER_HUE.idle;
  useEmbers(emberRef, hueRef);

  const roster = useSyncExternalStore(subscribeConsult, rosterNow, () => null);
  const sats = S.key === 'thinking' ? satellitesOf(roster) : [];
  const satSeen = useRef(new Map());
  const yours = lastYours(T.lines);
  const heard = S.key === 'listening' ? (dict.on ? T.composer.value : '') : S.key === 'thinking' ? yours || '' : '';
  const word = answerHeld ? 'Ready' : st.word;
  const tone = answerHeld ? 'cy' : st.tone;
  // THINKING WHILE READING: the lookup's own progress under the state word
  const lookupLine = T.lookup && !T.lookup.done ? `reading ${T.lookup.pages.length ? `${T.lookup.pages.length} pages` : 'the web'} on ${T.lookup.query || 'that'}` : T.lookup?.done && T.lookup.pages.length ? `${T.lookup.pages.filter((p) => p.read).length} of ${T.lookup.pages.length} pages read` : '';
  const line = S.key === 'thinking' ? (lookupLine && !sats.length ? lookupLine : thinkingLine(sats))
    : answerHeld && proposal?.approve ? `yours to say${calDay ? ` on ${calDay}` : ''}`
      : answerHeld && proposal?.status === 'done' ? (calDay ? `added to ${calDay}` : 'done on your word')
        : answerHeld && proposal?.status === 'dismissed' ? 'left as it was'
      : answerHeld && cut ? 'stopped; the panels stay'
        : '';

  // the speaker on the plate: Nova speaks in jade; a voiced agent in its hue
  const speaker = speakerOf(lastNova?.agent);
  const sayHue = speaker.voiced ? speaker.hue : STAGE_SPEAK_VAR;
  const plateSpeaker = useMemo(() => ({ ...speaker, hue: sayHue }), [speaker.key, sayHue]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- WHERE THINGS SIT: travel on the house curve (mockup travel()) -----
  const frame0 = frameFor({ state: dataState === 'panels' ? 'idle' : mstate, docked: hasDock, hist, focus, width: view.w });
  // the wall: the core at the presenter spot (the phone's rule), its words
  // the width of one column under it
  // the wall: the core small in the bottom-left corner, the bar beside it,
  // its state word under it; the stage is the cards' (CORNER)
  const corner = cornerFrame(view.w, view.h);
  const frame = wallOn ? { cx: corner.cx, cy: corner.cy, s: corner.s, uw: 220, mx: corner.barX + corner.barW / 2, off: 130 } : frame0;
  const coreK = macCoreScale(S.key === 'listening' ? 'listening' : S.key === 'thinking' ? 'thinking' : speaking ? 'speaking' : 'rest', frame.s);
  const cur = useRef(null);
  const wallOnRef = useRef(wallOn);
  wallOnRef.current = wallOn;
  const anim = useRef({ id: 0, raf: 0 });
  const apply = () => {
    const c = cur.current;
    if (!c) return;
    if (coreRef.current) coreRef.current.style.transform = `translate3d(${(c.cx - 150).toFixed(1)}px, ${(c.cy - 150).toFixed(1)}px, 0) scale(${c.k.toFixed(4)})`;
    if (underRef.current) underRef.current.style.transform = `translate3d(${(c.cx - c.uw / 2).toFixed(1)}px, ${(c.cy + c.off * c.s).toFixed(1)}px, 0)`;
    for (const [agent, el] of satRefs.current) {
      if (!el) continue;
      const slot = Number(el.dataset.slot) || 0;
      const o = (pinned.size ? SAT_SLOTS_DOCKED : SAT_SLOTS)[slot] || SAT_SLOTS[0];
      el.style.setProperty('--x', `${(c.cx + o[0]).toFixed(1)}px`);
      el.style.setProperty('--y', `${(c.cy + o[1]).toFixed(1)}px`);
      void agent;
    }
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const target = { cx: frame.cx, cy: frame.cy, s: frame.s, off: frame.off, uw: frame.uw, k: coreK };
  const tsig = `${target.cx}|${target.cy}|${target.s}|${target.off}|${target.uw}|${target.k.toFixed(4)}`;
  useLayoutEffect(() => {
    const to = { ...target };
    if (underRef.current) underRef.current.style.width = `${to.uw}px`;
    if (composerRef.current) composerRef.current.style.transform = `translate3d(${(frame.mx - (wallOnRef.current ? CORNER.barW : COMPOSER.w) / 2).toFixed(1)}px, 0, 0)`;
    if (!cur.current || reducedMotion()) {
      if (cur.current && reducedMotion() && coreRef.current?.animate) coreRef.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      cur.current = to; applyRef.current(); return undefined;
    }
    const from = { ...cur.current };
    const my = ++anim.current.id;
    const t0 = performance.now();
    cancelAnimationFrame(anim.current.raf);
    const step = (now) => {
      if (my !== anim.current.id) return;
      const k = EASE(clamp01((now - t0) / 520));
      cur.current = { cx: lerp(from.cx, to.cx, k), cy: lerp(from.cy, to.cy, k), s: lerp(from.s, to.s, k), off: lerp(from.off, to.off, k), uw: to.uw, k: lerp(from.k, to.k, k) };
      applyRef.current();
      if (k < 1) anim.current.raf = requestAnimationFrame(step);
    };
    const A = anim.current;
    A.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(A.raf);
  }, [tsig, frame.mx]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { applyRef.current(); });
  // THE ISLAND SITS OVER THE CORE (his notices keep working; they never
  // cover the panel column): the island's root is offset to the core's centre
  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute('data-nova-mac', '');
    return () => { r.removeAttribute('data-nova-mac'); r.style.removeProperty('--mac-island-dx'); };
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--mac-island-dx', `${Math.round(frame.cx - view.w / 2)}px`);
  }, [frame.cx, view.w]);
  // NOTHING ON THE WALL BUT THE CARDS (8 Nov, his call): the island's notices
  // stay off this page while a wall is up; what matters is spoken
  useEffect(() => {
    const r = document.documentElement;
    if (wallOn) r.setAttribute('data-nova-wall', '1'); else r.removeAttribute('data-nova-wall');
    return () => r.removeAttribute('data-nova-wall');
  }, [wallOn]);

  // ---- THE THREADS: core to each satellite and each docked panel ---------
  const threadState = useRef({});
  threadState.current = { sats, docked: wallOn ? [] : docked, litKey: litShown, hoverKey, openKey, mstate, speaking, hist };
  const needThreads = sats.length > 0 || (shownDock.length > 0 && !hist && !wallOn);
  useEffect(() => {
    const svg = tetherRef.current;
    if (!svg) return undefined;
    if (!needThreads) { svg.innerHTML = ''; return undefined; }
    const shownAt = new Map();
    let raf = 0;
    const rm = reducedMotion();
    const path = (x1, y1, mx, my, x2, y2, hue, p, op, pulse) => {
      let s = `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${hue}" stroke-opacity="${op}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - p).toFixed(3)}"/>`;
      if (pulse != null) {
        const q = pulse;
        s += `<circle r="2.6" fill="${hue}" cx="${lerp(lerp(x1, mx, q), lerp(mx, x2, q), q).toFixed(1)}" cy="${lerp(lerp(y1, my, q), lerp(my, y2, q), q).toFixed(1)}"/>`;
      }
      return s;
    };
    const tick = (now) => {
      const c = cur.current;
      const ts = threadState.current;
      const root = rootRef.current;
      if (!c || !root) { raf = requestAnimationFrame(tick); return; }
      const rr = root.getBoundingClientRect();
      const r = 193 * (BODY[ts.speaking ? 'speak' : ts.mstate] || 0.74) * c.s * 0.98;
      let out = '';
      const rim = (x2, y2) => { const dx = x2 - c.cx; const dy = y2 - c.cy; const d = Math.hypot(dx, dy) || 1; return [c.cx + (dx / d) * r, c.cy + (dy / d) * r]; };
      for (const s of ts.sats) {
        const el = satRefs.current.get(s.agent);
        if (!el) continue;
        if (!satSeen.current.has(s.agent)) satSeen.current.set(s.agent, now);
        const b = el.getBoundingClientRect();
        const right = b.left - rr.left > c.cx;
        const x2 = (right ? b.left : b.right) - rr.left;
        const y2 = b.top - rr.top + b.height / 2;
        const [x1, y1] = rim(x2, y2);
        const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2 - (x2 - x1) * 0.06;
        const t0 = satSeen.current.get(s.agent);
        const p = rm ? 1 : EASE(clamp01((now - t0) / 500));
        const hue = cssv(s.hue.replace(/^var\((.*)\)$/, '$1')) || '#c9d8ff';
        out += path(x1, y1, mx, my, x2, y2, hue, p, s.state === 'asking' ? 0.35 : 0.55, s.state === 'asking' && !rm ? ((now - t0) % 1100) / 1100 : null);
      }
      if (!ts.hist) {
        ts.docked.forEach((d, i) => {
          const el = panelRefs.current.get(d.key);
          if (!el || el.dataset.out === '1') return;
          if (!shownAt.has(d.key)) shownAt.set(d.key, now);
          const b = el.getBoundingClientRect();
          const x2 = b.left - rr.left;
          const y2 = b.top - rr.top + Math.min(b.height / 2, 126);
          const bend = BEND[i] || BEND[0];
          const [x1, y1] = rim(x2 + bend[0], y2 + bend[1]);
          const lit = ts.litKey === d.key || ts.hoverKey === d.key || ts.openKey === d.key;
          const hue = lit ? (el.dataset.hueval || '#c9d8ff') : (cssv('--nv-ink40') || 'rgba(232,236,246,.38)');
          out += path(x1, y1, x2 + bend[0], y2 + bend[1], x2, y2, hue, rm ? 1 : EASE(clamp01((now - shownAt.get(d.key)) / 600)), lit ? 0.7 : 0.25, null);
        });
      }
      svg.innerHTML = out;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); svg.innerHTML = ''; };
  }, [needThreads]);
  useEffect(() => { if (S.key !== 'thinking') satSeen.current.clear(); }, [S.key]);

  // ---- touching the glass ------------------------------------------------
  const putAwayRef = useRef(null);
  const putAway = (keys) => {
    const cards = wallAll.filter((w) => keys.includes(w.key)).map((w) => ({ key: w.key, card: w.card }));
    if (cards.length) setWallHistory((h) => [...cards, ...h.filter((x) => !keys.includes(x.key))].slice(0, 40));
    setBrought((b) => { if (!keys.some((k) => b.has(k))) return b; const n = new Map(b); keys.forEach((k) => n.delete(k)); return n; });
    setGone((g) => { const n = new Set(g); keys.forEach((k) => n.add(k)); return n; });
    setPinned((p) => { if (!keys.some((k) => p.has(k))) return p; const n = new Map(p); keys.forEach((k) => n.delete(k)); return n; });
    if (openKey && keys.includes(openKey)) setOpenKey(null);
    if (hoverKey && keys.includes(hoverKey)) setHoverKey(null);
    if (replay) setReplay(null);
  };
  putAwayRef.current = putAway;
  const togglePin = (d) => setPinned((p) => { const n = new Map(p); if (n.has(d.key)) n.delete(d.key); else n.set(d.key, d.card); return n; });
  const focusPanel = (key) => panelRefs.current.get(key)?.focus({ preventScroll: true });

  // ---- THE GLASS OBEYS WORDS (src/glassVoice.js): what is up, and the moves
  const asNamed = (w) => ({ key: w.key, kind: w.card.kind, title: panelHead(w.card).title || w.card.title || '', label: w.card.label || '', host: w.card.host || '', channel: w.card.channel || '' });
  const glassApi = useRef(null);
  glassApi.current = {
    state: () => {
      const up = wallOn ? wallAll : docked.filter((d) => !d.out);
      const k = litShown || openKey;
      const h = up.find((x) => x.key === k);
      return { panels: up.map(asNamed), hero: h ? asNamed(h) : null, history: wallHistory.map(asNamed) };
    },
    run: (cmd) => {
      const up = wallOn ? wallAll : docked.filter((d) => !d.out);
      switch (cmd.cmd) {
        case 'tidy': setTidy(true); return true;
        case 'clear': { const keys = up.filter((d) => !d.pinned).map((d) => d.key); if (keys.length) putAway(keys); setOpenKey(null); return true; }
        case 'restore': setOpenKey(null); return true;
        case 'history': setHist(true); return true;
        case 'words': setHist(true); return true;
        case 'camera-on': setCamera(true); T.see?.({ warm: true }).catch(() => {}); return true;
        case 'camera-off': setCamera(false); return true;
        case 'unbox': setBoxes([]); return true;
        case 'camera-phone': setCamSource('phone'); setCamera(true); T.see?.({ warm: true }).catch(() => {}); return true;
        case 'camera-mac': setCamSource('mac'); setCamera(true); return true;
        case 'highlight': {
          if (!camera) return false;   // nothing to look through: the words go to Nova
          const look = (body) => T.see?.(body).then((r) => { if (r?.boxes) setBoxes(r.boxes.map((b) => ({ ...b, at: Date.now() }))); return r?.said || ''; });
          if (camSource === 'phone') {
            if (peerStream && peerVideo.current?.videoWidth) return snapshotOf(peerVideo.current).then((img) => (img ? look({ image: img, want: cmd.what }) : look({ source: 'phone', want: cmd.what }))).catch((e) => `I couldn't look: ${e.message}.`);
            return look({ source: 'phone', want: cmd.what }).catch((e) => `I couldn't look: ${e.message}.`);
          }
          return snapshot().then((img) => (img ? look({ image: img, want: cmd.what }) : 'The camera has no picture yet.')).catch((e) => `I couldn't look: ${e.message}.`);
        }
        case 'see-held': {
          if (!camera) return false;
          // the frame rides the question to Nova itself (lib/attachments.js),
          // so the answer is Nova's, with its vault: "That's the Busy Bar, is it?"
          const frame = camSource === 'phone' ? (peerStream && peerVideo.current?.videoWidth ? snapshotOf(peerVideo.current) : Promise.resolve(phoneFrame ? phoneFrameDataUrl(phoneFrame) : null)) : snapshot();
          return frame.then((img) => {
            if (!img) return 'The camera has no picture yet.';
            T.attachSnapshot?.(img);
            T.ask?.('What am I holding? Say what you see in five words, then ask me one thing about it.');
            return '';
          });
        }
        case 'nowords': setHist(false); return true;
        case 'maximise': setOpenKey(cmd.key); return true;
        case 'away': putAway([cmd.key]); return true;
        case 'bring': {
          const h = wallHistory.find((x) => x.key === cmd.key);
          setGone((g) => { const n = new Set(g); n.delete(cmd.key); return n; });
          if (h && !up.some((w) => w.key === cmd.key) && !lookupCards.some((l) => l.key === cmd.key) && !allModel.some((p) => p.key === cmd.key)) setBrought((b) => new Map(b).set(cmd.key, h.card));
          return true;
        }
        case 'clear-except': { const keys = up.filter((d) => d.key !== cmd.key && !d.pinned).map((d) => d.key); if (keys.length) putAway(keys); return true; }
        default: return false;
      }
    },
  };
  useEffect(() => {
    if (!glassRef) return undefined;
    glassRef.current = { state: () => glassApi.current.state(), run: (c) => glassApi.current.run(c) };
    return () => { glassRef.current = null; };
  }, [glassRef]);

  // ---- keys: ⌥Space to talk, Esc, ⌘\ --------------------------------------
  const keys = useRef({});
  keys.current = { dict, onTalk, speaking, openKey, docked, hist, turning, T, cut, replay, wallOn, wallAll };
  useEffect(() => {
    let ptt = false;
    const down = (e) => {
      const k = keys.current;
      if (e.code === 'Space' && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (e.repeat || ptt) return;
        ptt = true;
        if (!k.dict.on) k.onTalk();
        return;
      }
      if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey && !e.altKey && keys.current.wallOn && !/^(?:INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) {
        e.preventDefault();
        setTidy((t) => !t);
        return;
      }
      if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(?:INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) {
        e.preventDefault();
        setCamera((c) => !c);
        return;
      }
      if ((e.key === 'w' || e.key === 'W') && !e.metaKey && !e.ctrlKey && !e.altKey && keys.current.wallOn && !/^(?:INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) {
        e.preventDefault();
        setHist((h) => !h);
        return;
      }
      if (e.key === 'Escape') {
        // the status sheet over the stage closes first (its own backdrop close)
        const sheet = document.querySelector('.nv-nt-sheetroot');
        if (sheet) { sheet.click(); return; }
        if (k.openKey) { const o = k.openKey; setOpenKey(null); requestAnimationFrame(() => focusPanel(o)); return; }
        if (k.speaking) { k.T.stop?.(); setCut(true); return; }
        if (k.dict.on) { k.dict.abandon(); return; }
        const loose = (k.wallOn ? k.wallAll : k.docked).filter((d) => !d.pinned && !d.out).map((d) => d.key);
        if (loose.length && !k.hist) { putAway(loose); return; }
        if (k.hist) { setHist(false); return; }
        return;
      }
      if (e.key === '\\' && e.metaKey) { e.preventDefault(); setHist((h) => !h); }
    };
    const up = (e) => {
      if (!ptt) return;
      if (e.code === 'Space' || e.key === 'Alt') {
        ptt = false;
        const k = keys.current;
        // letting go is the send, never a "keep listening" tap
        if (k.dict.on) k.dict.toggle({ force: true });
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // a turn that starts while the drawer is open keeps the drawer (the stage
  // is live beside it); scrolling up over the stage opens it
  const onWheel = (e) => {
    if (hist || e.deltaY > -20) return;
    if (e.target.closest?.('.nv-mac-drawer, .nv-mac-pnl, .nv-mac-composer')) return;
    setHist(true);
  };
  // the drawer opens at its foot, the newest line
  useLayoutEffect(() => { if (hist && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [hist]);
  const goLine = (i) => {
    setHist(true);
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-line="${i}"]`);
      el?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  };
  // a past answer's code panels, rebuilt from the data as it is NOW (his
  // week today, the brief's record, today's calendar), never frozen numbers
  const rebuildCode = (m) => {
    const i = T.lines.findIndex((x) => x.at === m.at && x.who === 'nova');
    const q = i > 0 ? [...T.lines.slice(0, i)].reverse().find((x) => x.who === 'you')?.text || '' : '';
    const want = new Set((m.macPanels || []).map((d) => d.kind));
    return codePanels({ question: q, answer: m.text || '', week: T.week, inbox: T.inbox, briefIds: m.briefIds, proposal: m.proposal, events: T.calendarEvents })
      .filter((c) => want.has(c.macKind));
  };
  const startReplay = (panels, proposal = null) => { const d = dockOrder(panels); if (!d.length) return; setHist(false); setGone(new Set()); setReplay({ panels: d, idx: 0, proposal }); };

  // ---- the column: panels stack from the top, the middle one in an arc;
  // the room they may take is what is left above the composer
  const colTop = COLUMN.top;
  const colRoom = view.h - COMPOSER.foot - COMPOSER.h - 22 - colTop;

  const edgeOn = focus;
  return (
    <div ref={rootRef} className="nv-mac" data-fixed="" data-state={dataState} data-focus={focus ? '1' : undefined} data-peek={peek ? '1' : undefined}
      data-hist={hist ? '1' : undefined} data-open={openKey ? '1' : undefined} data-wall={wallOn ? '1' : undefined} data-sleep={asleep ? '1' : undefined} data-camera={camera ? '1' : undefined} onWheel={onWheel}
      style={{ '--fx-hue': sayHue }}>
      <canvas ref={emberRef} className="nv-mac-embers" aria-hidden="true" />
      {/* THE CAMERA as the wall's ground (Rose), with the boxes code drew */}
      {camera && (
        <div className="nv-mac-cam" data-source={camSource} aria-label={camSource === 'phone' ? 'Your phone\'s camera' : 'Camera'}>
          {camSource === 'mac' ? <video ref={videoRef} muted playsInline autoPlay />
            : peerStream ? <video ref={peerVideo} className="feed" muted playsInline autoPlay />
              : (phoneFrame ? <img className="feed" src={phoneFrame} alt="" /> : <div className="waiting">{phoneLive ? 'Picture coming from your phone' : 'Waiting for your phone. On it, say “be my camera”.'}</div>)}
          <div className="grid" aria-hidden="true" />
          {boxes.map((b, i) => (
            <div key={`${b.label}-${i}`} className="box" style={{ left: `${b.box[0] * 100}%`, top: `${b.box[1] * 100}%`, width: `${(b.box[2] - b.box[0]) * 100}%`, height: `${(b.box[3] - b.box[1]) * 100}%` }}>
              <span>{b.label}</span>
            </div>
          ))}
          <div className="camsrc"><button type="button" className={camSource === 'mac' ? 'on' : ''} onClick={() => setCamSource('mac')}>Mac</button><button type="button" className={camSource === 'phone' ? 'on' : ''} onClick={() => setCamSource('phone')}>Phone{phoneLive ? ' · live' : ''}</button><button type="button" className="camoff" onClick={() => setCamera(false)}>Off</button></div>
        </div>
      )}

      {/* the capsule rail (mockup 93's), receding while Nova holds the stage */}
      <nav className="nv-mac-rail" aria-label="Pages" onMouseLeave={() => setPeek(false)}>
        {RAIL.map((r) => (
          <button key={r.k} type="button" className={`ri${r.k === 'voice' ? ' on' : ''}`} aria-label={r.label} aria-current={r.k === 'voice' ? 'page' : undefined}
            onClick={() => (r.k === 'voice' ? null : T.go?.(r.k))} tabIndex={focus && !peek ? -1 : 0}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{r.d}</svg><span className="lbl">{r.label}</span>
          </button>
        ))}
        <span className="sp" />
        <span className="core-mini" aria-hidden="true" />
      </nav>
      {edgeOn && <div className="nv-mac-edge" aria-hidden="true" onMouseEnter={() => setPeek(true)} onMouseLeave={(e) => { if (!e.relatedTarget?.closest?.('.nv-mac-rail')) setPeek(false); }}><i /></div>}
      <button type="button" className="nv-mac-histbtn" onClick={() => setHist(true)} aria-label="History" tabIndex={hist || focus ? -1 : 0}>
        <Gl n="clock" />History <Kbd>⌘</Kbd><Kbd>\</Kbd>
      </button>
      {/* THE WORDS, OUT OF THE WAY (8 Nov, his call): one small arrow opens the
          transcript (the history drawer, live); W or "show the transcript" too */}
      {wallOn && !hist && (
        <button type="button" className="nv-mac-wordsbtn" onClick={() => setHist(true)} aria-label="Show the words (W)" title="Show the words (W)">‹</button>
      )}

      <svg ref={tetherRef} className="nv-mac-tethers" aria-hidden="true" />

      {/* THE CORE: the real one, moved by transform alone */}
      <div ref={coreRef} className="nv-mac-core" data-state={S.key}>
        <button type="button" className="nv-fx-corehit" onClick={onTalk}
          aria-label={S.key === 'listening' ? 'Nova is listening. Click to send' : speaking ? 'Nova is speaking. Click to stop and talk' : `Nova, ${st.word.toLowerCase()}. Click to talk`}>
          <CoreFace stateKey={answerHeld ? 'turn' : S.key} engine={T.engine} focus tinted size={300} contest={contest} gold={false} />
        </button>
      </div>

      {/* THINKING: who Nova is asking, from the job's own roster */}
      {sats.map((s) => (
        <div key={s.agent} ref={(el) => { if (el) satRefs.current.set(s.agent, el); else satRefs.current.delete(s.agent); }}
          className={`nv-mac-sat${s.state !== 'asking' ? ' done' : ''}${s.state === 'failed' ? ' failed' : ''}`} data-slot={s.slot} style={{ '--h': s.hue }}>
          <span className="dot">{s.state === 'asking' ? <i /> : <Gl n={s.state === 'failed' ? 'x' : 'check'} />}</span>
          <b>{s.name}</b><span className="st">{s.line}</span>
        </div>
      ))}

      {/* THE WORDS UNDER THE CORE */}
      <div ref={underRef} className="nv-mac-under">
        <p className="nv-mac-stword" role="status" aria-live="polite">
          <i className="nv-nt-stdot" data-tone={tone} aria-hidden="true" />
          <b key={word}>{word}</b>
          {line ? <span className="line">· {line}</span> : null}
        </p>
        <div className="nv-mac-layer nv-mac-exch" aria-hidden={dataState !== 'idle'}>
          {ex.you && <button type="button" className="q" onClick={() => goLine(ex.you.i)} tabIndex={dataState === 'idle' ? 0 : -1}><span>You</span><span className="t">{ex.you.text}</span></button>}
          {ex.nova && <button type="button" className="a" onClick={() => goLine(ex.nova.i)} tabIndex={dataState === 'idle' ? 0 : -1}><span>{ex.nova.who}</span><span className="t">{ex.nova.text}</span></button>}
        </div>
        <div className="nv-mac-layer nv-mac-heard" aria-hidden={!(mstate === 'listen' || mstate === 'think')}>
          <small>{S.key === 'thinking' ? 'You asked' : 'Hearing you'}</small>
          <span>{String(heard || '').replace(/[?]\s*$/, '')}</span>
        </div>
        <section className={`nv-mac-layer nv-mac-plate${hasDock ? ' docked' : ''}`} aria-hidden={!plateOn} aria-label={`${speaker.name}, speaking`}
          style={{ '--mac-pmax': `${Math.max(120, view.h - COMPOSER.foot - COMPOSER.h - 24 - (frame.cy + frame.off * frame.s + 46) - 80)}px` }}>
          {plateOn && (
            <>
              <span className="esc" style={{ opacity: speaking ? 1 : 0 }}><Kbd>Esc</Kbd> to stop</span>
              <Captions said={said} on={captions} speaker={plateSpeaker} look={WORD_LOOK.stage}
                lead={ex.you?.text ? <p className="pq"><b>You</b>{ex.you.text}</p> : null}
                offNote="Subtitles are off. Turn them on in Nova’s status and settings." />
              {/* NO AUDIO, STILL AN ANSWER (8 Nov 2026): with speech off, or no
                  voice on this machine, nothing is ever "said", so the plate
                  showed his question and no reply. The answer's own words
                  stand in, plainly, once it is over. */}
              {!speaking && answerHeld && !said.length && ex.nova?.text && <p className="nv-mac-answer">{ex.nova.text}</p>}
            </>
          )}
        </section>
      </div>

      {/* THE RUNNING GLASS, docked in a column beside the core */}
      <div className="nv-mac-col" style={{ top: colTop, right: COLUMN.right, width: COLUMN.width, maxHeight: colRoom }} data-hidden={hist || wallOn ? '1' : undefined}>
        {docked.map((d, i) => (
          <MacPanel key={d.key} d={d}
            refFn={(el) => { if (el) panelRefs.current.set(d.key, el); else panelRefs.current.delete(d.key); }}
            lit={litShown === d.key} held={!litShown} open={openKey === d.key} dim={!!openKey && openKey !== d.key}
            hover={hoverKey === d.key} pinned={!!d.pinned} out={!!d.out} view={view}
            onHover={(on) => setHoverKey(on ? d.key : (k) => (k === d.key ? null : k))}
            onOpen={() => setOpenKey(d.key)} onClose={() => { setOpenKey(null); requestAnimationFrame(() => focusPanel(d.key)); }}
            onPin={() => togglePin(d)} onAway={() => putAway([d.key])}
            onMove={(step) => { const at = docked.findIndex((x) => x.key === d.key); const nx = docked[(at + step + docked.length) % docked.length]; if (nx) focusPanel(nx.key); }}
            decide={i === docked.length - 1 && !d.pinned && decideReady && !hasCalPanel && !d.card.macKind ? proposal : null}
            proposal={d.card.macKind === 'calendar' ? ((replay ? replay.proposal : fresh?.proposal) || null) : null}
            onRecord={T.openRecord} onUndo={T.undoProposal} />
        ))}
      </div>

      {/* THE WALL OF REFERENCES (mockup 110): every panel at once, in its slot */}
      {wallOn && (
        <div className="nv-mac-wall" data-tidy={tidy ? '1' : undefined}>
          {wallAll.map((d) => {
            const l = layAt.get(d.key);
            if (!l) return null;
            const isOpen = openKey === d.key;
            const lit = litShown === d.key;
            return (
              <div key={d.key} className={`nv-mac-slot${lit ? ' lit' : ''}${isOpen ? ' open' : ''}`} style={{ left: l.x + l.dx, top: l.y + l.dy, width: l.w, '--tilt': `${l.tilt}deg` }}>
                <MacPanel d={d} wall eyebrow={eyebrowOf(d.card)} openRect={wallOpenRect(view.w, view.h)} arriving={!speaking && !!d.card.lookup && !(T.lookup?.done ?? true)}
                  refFn={(el) => { if (el) panelRefs.current.set(d.key, el); else panelRefs.current.delete(d.key); }}
                  lit={lit} held={!litShown} open={isOpen} dim={!!openKey && openKey !== d.key} hover={hoverKey === d.key} pinned={!!d.pinned} out={false} view={view}
                  onHover={(on) => setHoverKey(on ? d.key : (k) => (k === d.key ? null : k))}
                  onOpen={() => setOpenKey(d.key)} onClose={() => { setOpenKey(null); requestAnimationFrame(() => focusPanel(d.key)); }}
                  onPin={() => togglePin(d)} onAway={() => putAway([d.key])}
                  onMove={(step) => { const at = wallAll.findIndex((x) => x.key === d.key); const nx = wallAll[(at + step + wallAll.length) % wallAll.length]; if (nx) focusPanel(nx.key); }}
                  playing={playing === d.key} onPlay={() => setPlaying(d.key)}
                  decide={null} proposal={null} onRecord={T.openRecord} onUndo={T.undoProposal} />
              </div>
            );
          })}
        </div>
      )}
      {wallOn && (
        <div className="nv-mac-wallkeys" aria-hidden="true">
          <span><Kbd>T</Kbd> <b>{tidy ? 'scatter' : 'tidy'}</b></span><span><Kbd>W</Kbd> <b>words</b></span><span><Kbd>C</Kbd> <b>{camera ? 'camera off' : 'camera'}</b></span><span><Kbd>Esc</Kbd> <b>clear</b></span>
        </div>
      )}

      {/* THE COMPOSER */}
      <MacComposer refEl={composerRef} T={T} dict={dict} fieldRef={fieldRef} onSend={onSend} onTalk={onTalk} width={wallOn ? corner.barW : COMPOSER.w} />

      {/* THE HISTORY DRAWER: the stage stays live beside it */}
      <aside className="nv-mac-drawer" aria-label="History" aria-hidden={!hist} data-edge-page={hist ? '' : undefined}>
        <div className="dh"><b>History</b><span>this conversation</span>
          {/* THE › (his yes, 1 Nov): the phone's own status sheet, New chat,
              attachments and the status settings, the same component */}
          {onStatus && <button type="button" className="dmore" onClick={onStatus} tabIndex={hist ? 0 : -1} aria-label="Nova’s status and settings"><svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" /></svg></button>}
          <button type="button" className="dclose" onClick={() => setHist(false)} tabIndex={hist ? 0 : -1}><Kbd>Esc</Kbd> Close</button></div>
        <div ref={listRef} className="dl nv-mac-dl">
          {hist && history({
            // the line's thumbs: its code panels (kind, title, source, kept on
            // the line) then the model's; a replay rebuilds code panels from
            // the data as it is now
            settledAs: (stl, m) => {
              const rebuilt = m?.macPanels ? rebuildCode(m) : [];
              const model = dockOrder((stl?.panels || []).filter((c) => !coveredByCode(c, rebuilt)));
              const thumbs = [
                ...(m?.macPanels || []).map((d, i) => ({ key: `d${i}`, t: thumbOf(d), card: rebuilt.find((c) => c.macKind === d.kind) || null })),
                ...model.map((p) => { const h = panelHead(p.card); return { key: p.key, t: { title: h.title || gistOf(p.card)?.b || 'Panel', source: h.words, hue: h.hue }, card: p.card }; }),
              ].slice(0, MAX_DOCKED);
              const all = [...rebuilt, ...model.map((p) => p.card)];
              return (
                <>
                  <div className="nv-mac-thumbs">
                    {thumbs.map((x) => (
                      <button key={x.key} type="button" className="thumb" style={{ '--h': x.t.hue }} disabled={!x.card} onClick={() => x.card && startReplay([x.card], m?.proposal || null)}
                        title={x.card ? undefined : 'Its data is no longer here to rebuild it'}><i /><b>{x.t.title}</b><span>{x.t.source}</span></button>
                    ))}
                  </div>
                  {all.length > 0 && <button type="button" className="nv-mac-replay" onClick={() => startReplay(all, m?.proposal || null)}><Gl n="replay" />Replay with the glass</button>}
                </>
              );
            },
          })}
        </div>
      </aside>
    </div>
  );
}

// ONE DOCKED PANEL: hover lifts it and lights its thread; a click or Enter
// opens it in place (the full card, its real actions); the pin keeps it
// through the next question; × puts it away; arrows move between panels.
function MacPanel({ d, refFn, lit, held, open, dim, hover, pinned, out, onHover, onOpen, onClose, onPin, onAway, onMove, decide, proposal, onRecord, onUndo, view, wall = false, eyebrow = null, openRect = null, arriving = false, playing = false, onPlay = null }) {
  const ref = useRef(null);
  const [inOn, setIn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setIn(true)); return () => cancelAnimationFrame(id); }, []);
  const h = panelHead(d.card);
  const hueVal = cssv(String(h.hue).replace(/^var\((.*)\)$/, '$1')) || '#c9d8ff';
  // FLIP into and out of the open spot (mockup flip()): measured, then the
  // panel springs from where it was
  const wasOpen = useRef(open);
  const before = useRef(null);
  if (wasOpen.current !== open && ref.current && !before.current) {
    const r = ref.current.getBoundingClientRect();
    before.current = r;
  }
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || wasOpen.current === open) return;
    wasOpen.current = open;
    const b = before.current;
    before.current = null;
    if (!b || reducedMotion() || !el.animate) return;
    const a = el.getBoundingClientRect();
    if (!a.width || !a.height) return;
    el.animate([
      { transformOrigin: '0 0', transform: `translate3d(${b.left - a.left}px, ${b.top - a.top}px, 0) scale(${b.width / a.width}, ${b.height / a.height})` },
      { transformOrigin: '0 0', transform: 'none' },
    ], { duration: Number.parseFloat(cssv('--nv-spring-snappy-ms')) || 640, easing: cssv('--nv-spring-snappy') || 'cubic-bezier(.32,.72,0,1)' });
  }, [open]);
  const card = { ...d.card, label: '', compact: !open, ...(wall ? { playing, onPlay } : {}) };
  const openStyle = open
    ? (openRect ? { position: 'fixed', left: openRect.x, top: openRect.y, width: openRect.w, maxHeight: openRect.h }
      : { position: 'fixed', top: OPEN_PANEL.top, right: OPEN_PANEL.right, width: OPEN_PANEL.width, maxHeight: view.h - OPEN_PANEL.top - COMPOSER.foot - COMPOSER.h - 22 })
    : null;
  // a page or a video draws its own title; the other wall cards keep the head's
  const title = wall && (d.card.kind === 'page' || d.card.kind === 'video') ? '' : h.title;
  return (
    <section ref={(el) => { ref.current = el; refFn(el); }} aria-expanded={open}
      data-out={out ? '1' : undefined} data-fixed={open ? '' : undefined} aria-hidden={out || undefined} tabIndex={out ? -1 : 0}
      className={`nv-mac-pnl${out ? ' out' : ''}${inOn ? ' in' : ''}${lit ? ' lit' : ''}${held && !lit ? ' held' : ''}${open ? ' open' : ''}${dim ? ' dim' : ''}${hover ? ' hov' : ''}${pinned ? ' pinned' : ''}${arriving ? ' arriving' : ''}`}
      style={{ '--h': h.hue, ...openStyle }} data-hueval={hueVal}
      aria-label={`${h.title || 'Panel'}, ${h.words}. Enter to ${open ? 'close' : 'open'}`}
      onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} onFocus={(e) => { if (e.target === e.currentTarget) onHover(true); }} onBlur={() => onHover(false)}
      onClick={(e) => { if (e.target.closest('button, a, input, label')) return; if (!open) onOpen(); }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open) onClose(); else onOpen(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); onMove(1); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); onMove(-1); }
      }}>
      <div className="ptag">
        <i /><span>{eyebrow ? <span className="peye"><em>{eyebrow.kind}</em><i>//</i>{eyebrow.source}</span> : <em>{h.words}</em>}{pinned ? <span className="kept"> · kept</span> : null}{h.sub && !eyebrow ? ` · ${h.sub}` : null}</span>
        <span className="pact">
          <button type="button" className="pin" aria-pressed={pinned} aria-label={pinned ? 'Stop keeping this panel' : 'Keep this panel through the next question'} onClick={onPin}><Gl n="pin" /></button>
          <button type="button" className="px" aria-label="Put this panel away" onClick={onAway}><Gl n="x" /></button>
        </span>
      </div>
      {title && <h3 className="ptitle">{title}</h3>}
      <div className="pbody">
        <SafeVisual what="nova-mac-panel" resetKey={`${d.key}:${open ? 1 : 0}`}>
          {d.card.macKind ? <CodeBody c={d.card} open={open} proposal={proposal} onRecord={onRecord} onUndo={onUndo} /> : <StageCard card={card} face="summary" />}
        </SafeVisual>
      </div>
      {decide && (
        <div className={`decide on${decide.status !== 'pending' ? ' answered' : ''}`}>
          {decide.status === 'pending' && decide.approve ? (
            <>
              <span className="dq-t">{decide.title}</span>
              <button type="button" className="y" aria-label={`Yes: ${decide.title}`} onClick={decide.approve}><Gl n="check" />{open ? 'Yes' : null}</button>
              <button type="button" className="n" aria-label="No" onClick={decide.dismiss}><Gl n="x" />{open ? 'No' : null}</button>
              <span className="dq">or just say it</span>
            </>
          ) : (
            <span className={`dq ${decide.status === 'done' ? 'yes' : ''}`}>{decide.status === 'done' ? `Done on your word: ${decide.title}` : decide.status === 'dismissed' ? `Left: ${decide.title}` : decide.status === 'undone' ? `Taken back: ${decide.title}` : decide.title}</span>
          )}
        </div>
      )}
      {wall && lit && <span className="pscan" aria-hidden="true" key={`scan-${d.key}`} />}
      {/* a video card already prints its channel and length in its own foot; a second copy read as a glitch (the 8 Nov recording) */}
      {wall && !open && d.card.kind !== 'video' && <span className="pfoot">{d.card.lookup ? (d.card.read === false ? 'not read' : 'read') : d.card.host || d.card.channel || 'nova'}</span>}
      {open && <button type="button" className="pclose" onClick={onClose}><Kbd>Esc</Kbd> Close</button>}
    </section>
  );
}

// THE PANELS CODE BUILT (mockup 108's three), drawn from their own model:
//   sets      one bar per muscle in its hue, the tick at the week's minimum,
//             the key muscle and its line; opened, done and still planned
//   brief     the brief's points, the spoken one underlined; opened, every
//             point, its sources and "Open the brief" (the real record)
//   calendar  the proposal's day from his calendar, the proposal in it as the
//             gold "your call" block with its tick and cross; opened, the
//             whole day. Undo only where the record carries the rails' undo.
function CodeBody({ c, open, proposal, onRecord, onUndo }) {
  if (c.macKind === 'sets') {
    const rows = open ? c.detail : c.rows;
    return (
      <div className={`nv-mac-sets${open ? ' open' : ''}${c.keyLine && !open ? ' focus' : ''}`}>
        {open && <div className="legend"><span><i className="lg-done" />done</span><span><i className="lg-plan" />still planned this week</span><span><i className="lg-tick" />minimum</span></div>}
        <div className="rows">
          {rows.map((r, i) => (
            <div key={r.muscle} className={`row${r.key ? ' key' : ''}${r.state === 'short' ? ' short' : ''}`} style={{ '--mh': r.hue, '--i': i }}>
              <span className="m">{r.muscle}</span>
              <span className="tr"><i className="bar" style={{ width: `${r.bar}%` }} />{open && r.plan.width > 0 && <i className="pl" style={{ left: `${r.plan.left}%`, width: `${r.plan.width}%` }} />}<i className="tg" style={{ left: `${r.tick}%` }} /></span>
              <span className="v">{open
                ? <><b>{r.done}</b> done · {r.planned} planned · of {r.target}</>
                : <><b><CountUp value={r.doneN} fromZero format={(n) => { const v = Math.round(n * 2) / 2; const w = Math.trunc(v); return v === w ? String(w) : w === 0 ? '½' : `${w}½`; }} /></b> <small>of {r.target}</small></>}</span>
            </div>
          ))}
        </div>
        {!open && c.keyLine && <p className="keynote"><b className={c.keyLine.gold ? 'gold' : ''}>{c.keyLine.name}</b> {c.keyLine.rest}</p>}
        {open && c.dnote && <p className="dnote">{c.dnote}</p>}
      </div>
    );
  }
  if (c.macKind === 'brief') {
    const pts = open ? c.points : c.points.slice(0, 3).concat(c.spoken >= 3 ? [c.points[c.spoken]] : []);
    return (
      <div className="nv-mac-brief">
        <ul className="pts">
          {pts.map((p) => {
            const i = c.points.indexOf(p);
            return <li key={p} className={i === c.spoken ? 'lit' : ''}><span className="ul">{p}</span></li>;
          })}
        </ul>
        {open && <p className="srcs">{c.sourcesLine}</p>}
        {open && onRecord && <div className="dact"><button type="button" className="openb" onClick={() => onRecord(c.recordId)}><Gl n="doc" />Open the brief</button></div>}
      </div>
    );
  }
  if (c.macKind === 'calendar') {
    const st = proposal?.status || 'pending';
    const done = st === 'done';
    const left = st === 'dismissed';
    const blockCls = `ev new on${done ? ' kept' : ''}${left ? ' gone' : ''}`;
    const blockSub = done ? 'added on your word' : left ? 'not added' : 'your call';
    return (
      <div className="nv-mac-cal">
        {!open ? (
          <div className="cal">
            <div className="hrs">{c.hours.map((h, i) => <span key={i}>{h}</span>)}</div>
            <div className="ln" style={{ '--n': c.hours.length - 1 }} />
            {c.events.map((e) => <div key={`${e.time}${e.label}`} className="ev have" title={`${e.time} ${e.label}`} style={{ left: `${e.left}%`, width: `calc(${e.width}% - 4px)` }}>{e.width >= 14 ? <>{e.label}<small>{e.time}</small></> : null}</div>)}
            <div className={blockCls} style={{ left: `${c.block.left}%`, width: `calc(${c.block.width}% - 4px)` }}>{c.block.label}<small>{blockSub}</small></div>
          </div>
        ) : (
          <div className="day">
            {[...c.day, { label: c.block.label, time: c.blockAt, block: true }].sort((a, b) => a.time.localeCompare(b.time)).map((e) => (
              <div key={`${e.time}${e.label}`} className="drow"><span className="t">{e.time}</span>
                <span className={e.block ? `dev new${done ? ' kept' : ''}${left ? ' gone' : ''}` : 'dev have'}>{e.label}<small>{e.block ? `${c.block.when} · ${blockSub}` : e.end ? `to ${e.end}` : ''}</small></span></div>
            ))}
          </div>
        )}
        {proposal && (
          <div className={`cdecide${st !== 'pending' ? ' answered' : ''}`}>
            {st === 'pending' && proposal.approve ? (
              <>
                <button type="button" className="y" aria-label={`Yes: ${proposal.title}`} onClick={proposal.approve}><Gl n="check" />{open ? 'Add it' : null}</button>
                <button type="button" className="n" aria-label="No" onClick={proposal.dismiss}><Gl n="x" />{open ? 'No' : null}</button>
                <span className="dq">or just say it</span>
              </>
            ) : (
              <>
                <span className={`dq${done ? ' yes' : ''}`}>{done ? `Added, ${c.block.when}` : left ? 'Left as it was' : st === 'undone' ? 'Taken back' : st === 'error' ? 'That did not go through; it is still in your Inbox' : ''}</span>
                {done && c.undoable && onUndo && <button type="button" className="undo2" onClick={() => onUndo(c.recordId)}>Undo</button>}
              </>
            )}
          </div>
        )}
        {!c.loaded && <p className="srcs">Reading your calendar</p>}
      </div>
    );
  }
  return null;
}

// THE COMPOSER (mockup 108 .composer): "Type to Nova", "or hold ⌥ Space" and
// the round mic; while he talks, "× Esc", his voice as 34 violet bars, and
// "Send · release ⌥Space". Enter sends what he typed.
function MacComposer({ refEl, T, dict, fieldRef, onSend, onTalk, width = COMPOSER.w }) {
  const C = T.composer;
  return (
    <div ref={refEl} className={`nv-mac-composer${dict.on ? ' listening' : ''}`} style={{ width, height: COMPOSER.h, bottom: COMPOSER.foot }}>
      {dict.on ? (
        <div className="cl listen">
          <button type="button" className="xtype" aria-label="Stop listening" onClick={() => dict.abandon()}><Gl n="x" />Esc</button>
          <Meter />
          <button type="button" className="sendnow" onClick={dict.toggle}>Send <small>release ⌥Space</small></button>
        </div>
      ) : (
        <div className="cl idle">
          <LocalInput ref={fieldRef} value={C.value} className="field" data-orb-composer=""
            onChange={(t) => C.setTyped(t)} onSubmit={(t) => onSend(t)}
            autoCorrect="on" autoCapitalize="sentences" spellCheck enterKeyHint="send" disabled={C.offline}
            aria-label="Message Nova" placeholder={C.offline ? 'Reconnect to ask Nova' : 'Type to Nova'} />
          <span className="hintk">or hold <Kbd>⌥</Kbd><Kbd>Space</Kbd></span>
          <button type="button" className="mic" onClick={onTalk} disabled={!dict.supported || C.offline} aria-label="Talk to Nova"><Gl n="mic" /></button>
        </div>
      )}
    </div>
  );
}
