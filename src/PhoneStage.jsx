import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StageCard } from './StageCard.jsx';
import { SafeVisual } from './SafeVisual.jsx';
import { StageForm } from './StageForms.jsx';
import { CodeBody } from './NovaMac.jsx';
import { stageForm, proposalCard } from './stageFormFacts.js';
import { stagePanels } from './stagePanels.js';
import { stageArrive, stageEyebrow, stageHue } from './wallFacts.js';
import { codePanels, sentencesOf, coveredByCode, dockOrder, liveDock, panelHead } from './novaMacFacts.js';
import { clockNow } from './speechClock.js';
import { islandShown, subscribeIslandShown, dismissIsland } from './island.js';
import { AlertCard } from './AlertCard.jsx';
import { holdLazy } from './lazyHold.js';
import { PH, phoneGeometry, phoneOrder, railX, phoneColumns, openTop, capSentence, phoneFace, countWords } from './phoneStageFacts.js';
import './novaPhone.css';

// THE LIVING STAGE ON THE PHONE (10 Nov 2026) — mockup 114's phone (`.ph`,
// "The same moment on the phone"), approved in his words: "Yes, it looks
// excellent". The Mac's stage (src/NovaMac.jsx) and this one show the same
// panels from the same card data (src/stagePanels.js), in the same forms
// (src/StageForms.jsx); only where they sit differs:
//   rest      the clock, the date, a few chips; the composer at the foot
//   speaking  one panel per sentence: the newest leaves the core and lands
//             large (the hero); the earlier ones wait below as small copies
//             of the real panel, newest first, the next cut at the edge
//   held      when Nova stops (600 ms after the voice), or on a tap of
//             "See all", the core shrinks and every panel deals out into two
//             columns; "Show latest" brings the hero back
//   open      a tap on any panel opens it full size over a dimmed stage
// The core itself is NovaStage's real core (his one exemption: Nova keeps
// his own icon); this layer only tells it when to shrink. Every number is
// the mockup's (src/phoneStageFacts.js). Transform and opacity only; reduced
// motion swaps every move for a short fade (novaPhone.css).

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const cssv = (n) => (typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(n).trim());
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const minutesNow = () => { const t = new Date(); return t.getHours() * 60 + t.getMinutes(); };
const Gl = ({ d }) => <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const X_D = 'M6 6l12 12M18 6 6 18';

// THE PANELS THE ANSWER RAISED, in the order they came up: the Mac's own
// rules (NovaMac.jsx), for the phone. The briefing's beats and an answer's
// glass accumulate while one mode speaks; once it is over the line's settled
// panels stand; code's panels (his week, a brief, the day) rise with the
// sentence that names them; a new question clears it all.
function usePhonePanels(T, S, said, gone) {
  const speaking = S.key === 'speaking';
  const lastNova = useMemo(() => [...T.lines].reverse().find((m) => m.who === 'nova' && !m.streaming) || null, [T.lines]);
  const askedText = useMemo(() => [...T.lines].reverse().find((m) => m.who === 'you')?.text || '', [T.lines]);
  // code's panels only for an answer that arrived while this page was open
  const mountedAt = useRef(lastNova?.at ?? null);
  const [freshAt, setFreshAt] = useState(null);
  useEffect(() => {
    if (lastNova?.at != null && lastNova.at !== mountedAt.current && lastNova.at !== freshAt) setFreshAt(lastNova.at);
  }, [lastNova?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = freshAt != null && lastNova?.at === freshAt ? lastNova : null;
  const code = useMemo(() => (fresh ? codePanels({
    question: askedText, answer: fresh.text || '', week: T.week, inbox: T.inbox,
    briefIds: fresh.briefIds, proposal: fresh.proposal, events: T.calendarEvents,
  }) : []), [fresh, askedText, T.week, T.inbox, T.calendarEvents]);
  const wantsCal = !!fresh?.proposal?.recordId && T.calendarEvents == null;
  useEffect(() => { if (wantsCal) T.loadCalendar?.(); }, [wantsCal]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const [answer, setAnswer] = useState({ panels: [], from: null, mode: null });
  const liveSig = T.stage ? `${T.stage.key}|${(T.stage.rail || []).length}` : '';
  const live = T.stage ? liveDock(T.stage, Infinity) : null;
  const liveMode = T.stage ? (String(T.stage.key || '').startsWith('stage:') ? 'brief' : 'glass') : null;
  const liveRef = useRef(live);
  liveRef.current = live;
  const liveModeRef = useRef(liveMode);
  liveModeRef.current = liveMode;
  useEffect(() => {
    if (!liveSig) return;
    const l = liveRef.current;
    const mode = liveModeRef.current;
    setAnswer((a) => ({ panels: dockOrder([...((a.from === 'live' || a.from === 'answer') && a.mode === mode ? a.panels.map((p) => p.card) : []), ...l.panels.map((p) => p.card)], Infinity), from: 'live', mode }));
  }, [liveSig]);
  const panelsNow = answer.from === 'live' && live ? answer.panels.map((p) => live.panels.find((q) => q.key === p.key) || p) : answer.panels;
  const wasSpeaking = useRef(speaking);
  useEffect(() => {
    if (wasSpeaking.current && !speaking) {
      const kept = lastNova?.settled?.panels;
      setAnswer((a) => (kept?.length ? { panels: dockOrder(kept, Infinity), from: 'answer', mode: a.mode } : a.panels.length ? { ...a, from: 'answer' } : a));
    }
    wasSpeaking.current = speaking;
  }, [speaking, lastNova]);
  // a new question clears the stage (the reply window's listening does not)
  const wasTurn = useRef(S.key);
  const [turnId, setTurnId] = useState(0);
  useEffect(() => {
    if (S.key === 'thinking' && wasTurn.current !== 'thinking') {
      setAnswer({ panels: [], from: null, mode: null });
      setFreshAt(null);
      mountedAt.current = lastNova?.at ?? null;
      setTurnId((n) => n + 1);
    }
    wasTurn.current = S.key;
  }, [S.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const allModel = panelsNow.filter((p) => !code.some((c) => c.key === p.key) && !coveredByCode(p.card, code));
  const stageProposal = (!speaking || !!(T.stage?.total && T.stage.n >= T.stage.total)) ? (lastNova?.proposal || null) : null;
  const list = stagePanels({
    lookup: T.lookup?.cards || [], gone,
    model: [...codeNow.map((c) => ({ key: c.key, card: c })), ...allModel],
    proposal: stageProposal && !code.some((c) => c.macKind === 'calendar') ? proposalCard(stageProposal, (T.inbox || []).find((r) => r.id === stageProposal.recordId) || null) : null,
  });
  // the order they came up (one put away keeps its place; a new question starts again)
  const keys = list.map((p) => p.key).join('|');
  const [arrivals, setArrivals] = useState([]);
  useEffect(() => { setArrivals([]); }, [turnId]);
  useEffect(() => {
    const ks = keys ? keys.split('|') : [];
    setArrivals((a) => {
      const have = new Set(ks);
      const kept = a.filter((e) => have.has(e.key));
      const base = kept.length === a.length ? a : kept;
      return stageArrive(base, ks, base.reduce((m, e) => Math.max(m, e.sent + 1), 0));
    });
  }, [keys]);
  const byKey = new Map(list.map((p) => [p.key, p]));
  const ordered = arrivals.map((e) => byKey.get(e.key)).filter(Boolean);
  return { ordered, proposal: lastNova?.proposal || null, fresh, turnId };
}

// ONE PANEL, in mockup 114's grammar (.pnl): the square tag and the subject
// in its hue, the scope on the right, the serif claim, then its form
function PhonePanel({ card, still = false, open = false, decide = null, T = null, onDiscuss = null, refFn = null }) {
  const e = stageEyebrow(card, { today: todayIso() });
  const hue = stageHue(card, panelHead(card).hue);
  const form = card.macKind ? null : stageForm(card, { now: minutesNow() });
  return (
    <div ref={refFn} className="nv-ph-pnl" style={{ '--h': hue }}>
      <div className="peye"><i className="ptag" /><em>{e.tag}</em>{e.meta ? <i className="pmeta">{e.meta}</i> : null}</div>
      {e.title && <div className="ptitle">{e.title}</div>}
      <SafeVisual what="nova-phone-panel" resetKey={`${card.key || e.tag}:${open ? 1 : 0}`}>
        {card.macKind ? <CodeBody c={card} open={open} proposal={null} onRecord={T?.openRecord} onUndo={null} />
          : form?.form ? <StageForm f={form} still={still} decide={decide} onDiscuss={onDiscuss} records={T?.inbox || null} onRecordAct={open ? T?.inboxAct : null} />
            : <div className="pbody"><StageCard card={{ ...card, label: '', compact: !open }} face="summary" /></div>}
      </SafeVisual>
    </div>
  );
}

// THE HERO IN ITS ROOM (his real Pull A has eight lifts; the mockup's has
// four): a panel taller than the room between the caption and the count row
// keeps the mockup's full width and is cut at the room's foot under a fade,
// the way the rail's small copies end; the whole of it is one tap away,
// opened full size
function HeroFit({ children }) {
  const ref = useRef(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement?.parentElement;
    if (!el || !box) return undefined;
    const run = () => {
      const inner = el.firstElementChild;
      const h = inner ? inner.offsetHeight : 0;
      const r = box.clientHeight;
      const next = h > r && r > 0 ? r : 0;
      setRoom((x) => (x === next ? x : next));
    };
    run();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run);
    ro?.observe(el.firstElementChild || el);
    ro?.observe(box);
    return () => ro?.disconnect();
  }, []);
  return <div ref={ref} className={`nv-ph-fit${room ? ' cut' : ''}`} style={room ? { maxHeight: room } : undefined}>{children}</div>;
}

const dateLine = (d) => `${d.toLocaleDateString('en-AU', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('en-AU', { month: 'long' })}`;
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id = 0;
    const arm = () => { const n = new Date(); id = setTimeout(() => { setNow(new Date()); arm(); }, (60 - n.getSeconds()) * 1000 - n.getMilliseconds() + 20); };
    arm();
    return () => clearTimeout(id);
  }, []);
  return now;
}

/**
 * The phone's stage layer. `st` is the state in words (stageState), `close`
 * the brief's waiting question (it takes the chips' place at rest), `core`
 * the real core's element (told when to shrink), `glassRef` the glass's voice
 * door (src/glassVoice.js).
 */
export function PhoneStage({ T, S, st, said, close = null, core = null, glassRef = null, outerGlass = null, asks = [] }) {
  const speaking = S.key === 'speaking';
  const turning = S.key === 'listening' || S.key === 'thinking' || speaking;
  const [gone, setGone] = useState(() => new Set());
  const { ordered, proposal, turnId } = usePhonePanels(T, S, said, gone);
  const [view, setView] = useState(() => ({ w: typeof window === 'undefined' ? 402 : window.innerWidth, h: typeof window === 'undefined' ? 874 : window.innerHeight }));
  useEffect(() => {
    const on = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const g = phoneGeometry(view.w, view.h);

  // while he is spoken to, the history above waits to draw its heavy parts
  // (src/LazyMount.jsx): they cost the stage its frames
  useEffect(() => { holdLazy(turning); }, [turning]);
  useEffect(() => () => holdLazy(false), []);

  // the voice has stopped long enough: everything deals out (mockup: 600 ms)
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (speaking || S.key === 'thinking') { setHeld(false); return undefined; }
    const id = setTimeout(() => setHeld(true), PH.dealAfter);
    return () => clearTimeout(id);
  }, [speaking, S.key]);
  const [forced, setForced] = useState(null);
  const [openKey, setOpenKey] = useState(null);
  useEffect(() => { setForced(null); setOpenKey(null); }, [turnId]);
  // asleep: the stage clears to the core (his yes, 8 Nov)
  useEffect(() => { if (T.standby) setGone((x) => new Set([...x, ...ordered.map((p) => p.key)])); }, [T.standby]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (S.key === 'thinking') setGone(new Set()); }, [S.key]);

  const shown = ordered.length;
  const face = phoneFace({ turning, speaking, panels: shown, forced, held });
  const all = face === 'all';
  const { hero: heroKey, rail } = phoneOrder(ordered.map((p) => p.key));
  const hero = heroKey ? ordered[ordered.length - 1] : null;
  const words = countWords(face, shown);

  // NOTHING ON THE STAGE BUT THE PANELS (his call on the Mac, 8 Nov: "I
  // don't like that notification pop up on the same page"): while the answer's
  // panels are up the island's notices stay off this page (novaMac.css)
  const panelsUp = shown > 0;
  useEffect(() => {
    const r = document.documentElement;
    if (panelsUp) r.setAttribute('data-nova-wall', '1'); else r.removeAttribute('data-nova-wall');
    return () => r.removeAttribute('data-nova-wall');
  }, [panelsUp]);

  // the core shrinks while everything is dealt out (mockup .ph.all .ph-core)
  useEffect(() => { if (core) core.toggleAttribute('data-ph-all', all); }, [core, all]);
  useEffect(() => () => core?.removeAttribute('data-ph-all'), [core]);

  // the caption: the sentence being said; once he has been answered, the
  // last one stays (the mockup's held frame)
  const capNow = speaking ? capSentence(T.stage?.line) : null;
  const lastCap = useRef(null);
  if (capNow) lastCap.current = capNow;
  if (!shown && !turning) lastCap.current = null;
  useEffect(() => { lastCap.current = null; }, [turnId]);
  const yours = [...T.lines].reverse().find((m) => m.who === 'you')?.text || '';
  const heard = S.key === 'listening' ? (T.composer?.value || '') : S.key === 'thinking' ? yours : '';
  // his words, once there are any, take the line; until then (the reply
  // window after a brief) the last sentence stays, as the mockup's held frame
  const cap = heard ? null : capNow || (shown ? lastCap.current : null);

  // ---- See all: each panel measured at the panel width, then two columns
  const measureRefs = useRef(new Map());
  const [heights, setHeights] = useState({});
  const keysSig = ordered.map((p) => p.key).join('|');
  useLayoutEffect(() => {
    const next = {};
    let changed = false;
    for (const p of ordered) {
      const el = measureRefs.current.get(p.key);
      const h = el ? el.offsetHeight : 0;
      if (h && heights[p.key] !== h) { next[p.key] = h; changed = true; }
    }
    if (changed) setHeights((x) => ({ ...x, ...next }));
  }, [keysSig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      setHeights((x) => {
        let n = null;
        for (const en of entries) { const k = en.target.dataset.phkey; const h = en.target.offsetHeight; if (k && h && x[k] !== h) { n = n || { ...x }; n[k] = h; } }
        return n || x;
      });
    });
    for (const [k, el] of measureRefs.current) { el.dataset.phkey = k; ro.observe(el); }
    return () => ro.disconnect();
  }, [keysSig]);
  const cells = phoneColumns(ordered.map((p) => ({ key: p.key, h: (heights[p.key] || 0) * g.colScale })), { dealX: g.dealX, dealY: g.dealY });
  const cellAt = new Map(cells.map((c) => [c.key, c]));
  const gridH = cells.reduce((m, c) => Math.max(m, c.top + c.h), 0);
  const gridRef = useRef(null);
  useEffect(() => { if (all && gridRef.current) gridRef.current.scrollTop = 0; }, [all]);
  const railRef = useRef(null);
  useEffect(() => { if (railRef.current) railRef.current.scrollLeft = 0; }, [heroKey, shown]);

  // ---- open: full size over a dimmed stage, from where it was tapped
  const openRef = useRef(null);
  const openFrom = useRef(null);
  const openAnim = useRef(null);
  const [closing, setClosing] = useState(false);
  const openP = openKey ? ordered.find((p) => p.key === openKey) : null;
  const openIt = (key, el) => { openFrom.current = el ? el.getBoundingClientRect() : null; setClosing(false); setOpenKey(key); };
  useLayoutEffect(() => {
    const el = openRef.current;
    if (!openP || !el) return;
    const top = openTop(el.offsetHeight, view.h);
    el.style.top = `${top}px`;
    const r = openFrom.current;
    openAnim.current?.cancel();
    if (!r || reducedMotion() || !el.animate) return;
    const from = `translate3d(${(r.left - PH.side).toFixed(1)}px, ${(r.top - top).toFixed(1)}px, 0) scale(${(r.width / g.openW).toFixed(4)})`;
    el.dataset.from = from;
    openAnim.current = el.animate([{ transform: from, opacity: 0.5 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: cssv('--nv-spring-smooth') || 'cubic-bezier(.23,1,.32,1)' });
  }, [openKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeOpen = () => {
    const el = openRef.current;
    if (!openKey) return;
    openAnim.current?.cancel();
    if (!el || !el.dataset.from || reducedMotion() || !el.animate) { setOpenKey(null); return; }
    setClosing(true);
    const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: el.dataset.from, opacity: 0 }], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
    const done = () => { setOpenKey(null); setClosing(false); };
    a.onfinish = done; a.oncancel = done;
  };
  useEffect(() => {
    if (!openKey) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeOpen(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the glass obeys words on the phone too (src/glassVoice.js)
  const glassApi = useRef(null);
  glassApi.current = {
    state: () => {
      const named = (p) => ({ key: p.key, kind: p.card.kind, title: p.card.title || p.card.name || p.card.label || '', label: p.card.label || '', host: p.card.host || '', channel: p.card.channel || '' });
      return { panels: ordered.map(named), hero: hero ? named(hero) : null, history: [] };
    },
    run: (cmd) => {
      const find = (k) => ordered.find((p) => p.key === k);
      switch (cmd.cmd) {
        case 'maximise': { const p = find(cmd.key); if (p) openIt(p.key, null); return !!p; }
        case 'away': setGone((x) => new Set(x).add(cmd.key)); return true;
        case 'clear': setGone(new Set(ordered.map((p) => p.key))); return true;
        case 'clear-except': setGone(new Set(ordered.filter((p) => p.key !== cmd.key).map((p) => p.key))); return true;
        case 'tidy': setForced('all'); return true;
        case 'restore': case 'words': case 'history': case 'nowords': return true;
        case 'recall': return T.recallGlass ? T.recallGlass(cmd) : false;
        default: return null;
      }
    },
  };
  useEffect(() => {
    if (!glassRef) return undefined;
    glassRef.current = {
      state: () => glassApi.current.state(),
      // what this layer does not know (the camera) goes to the stage around it
      run: (c) => { const r = glassApi.current.run(c); return r === null ? (outerGlass?.current?.run?.(c) ?? false) : r; },
    };
    return () => { glassRef.current = null; };
  }, [glassRef, outerGlass]);

  // NOTHING COVERS THE CORE AT REST (10 Nov, his catch in the WebKit proof:
  // a "Steps behind" nudge dropped over Nova). While the stage is at rest the
  // island's drop stays off this page and the same notice stands as content
  // in the free space under the core: its words and its own actions, gone
  // when the island would have let it go (the content feed, the banner-
  // blindness law). The island still owns it: timing, queue, every other page.
  const [islandN, setIslandN] = useState(islandShown);
  useEffect(() => subscribeIslandShown(setIslandN), []);
  const restNow = face === 'rest';
  useEffect(() => {
    const r = document.documentElement;
    if (restNow) r.setAttribute('data-island-feed', '1'); else r.removeAttribute('data-island-feed');
    return () => r.removeAttribute('data-island-feed');
  }, [restNow]);
  const feedDone = (fn) => { try { fn?.(); } finally { if (islandN) dismissIsland(islandN.id); } };

  const now = useMinute();
  const chips = [
    ...asks.map((a) => ({ key: a.key, label: a.label, hue: 'var(--nv-cy)', run: a.run })),
    T.status?.briefMe ? { key: 'brief', label: 'Morning briefing', hue: 'var(--nv-cy)', run: T.status.briefMe } : null,
    T.go ? { key: 'word', label: 'What needs my word', hue: 'var(--nv-gold)', run: () => T.go('inbox') } : null,
    T.go ? { key: 'train', label: 'Train', hue: 'var(--nv-m-chest)', run: () => T.go('workouts') } : null,
    T.go ? { key: 'fuel', label: 'Fuel', hue: 'var(--nv-or)', run: () => T.go('recipes') } : null,
  ].filter(Boolean);
  const decideOf = (card) => (card.kind === 'proposal' ? proposal : null);
  const rest = face === 'rest';

  return (
    <div className={`nv-ph${all ? ' all' : ''}`} data-s={rest ? 'rest' : 'on'} data-st={st.tone} data-face={face} data-key={S.key}
      style={{ '--ph-vh': `${view.h}px`, '--ph-col': `${g.col}px`, '--ph-colk': g.colScale.toFixed(4), '--ph-minik': g.miniScale.toFixed(4), '--ph-count-dy': `${g.countAllDy}px`, '--ph-openw': `${g.openW}px` }}>

      <p className="nv-ph-st" role="status"><i className="sd" data-tone={st.tone} aria-hidden="true" /><b>{st.word}</b></p>
      <p className={`nv-ph-cap${heard ? ' heard' : ''}`} aria-live="polite">
        {heard ? heard : cap ? <><span className="s">{cap.lit}</span>{cap.rest ? <span>{cap.rest.startsWith(' ') ? cap.rest : ` ${cap.rest}`}</span> : null}</> : null}
      </p>

      {rest && islandN && (
        <div key={islandN.id} className="nv-ph-feed" role="status" onClick={islandN.onPress ? () => feedDone(islandN.onPress) : undefined}>
          {islandN.card ? <AlertCard card={islandN.card} onAction={(a) => feedDone(() => islandN.card.onAction?.(a))} /> : (
            <>
              <b>{islandN.title}</b>
              {islandN.message ? <span>{islandN.message}</span> : null}
              {islandN.actions?.length > 0 && (
                <span className="acts">{islandN.actions.map((a, i) => <button key={a.label + i} type="button" className={i === 0 ? 'y' : undefined} onClick={(e) => { e.stopPropagation(); feedDone(a.run); }}>{a.label}</button>)}</span>
              )}
            </>
          )}
        </div>
      )}
      <div className="nv-ph-rest" aria-hidden={!rest}>
        <div className="nv-ph-clock">{now.getHours()}<i>:</i>{String(now.getMinutes()).padStart(2, '0')}</div>
        <div className="nv-ph-date">{dateLine(now)}</div>
        {close ? <div className="nv-ph-close">{close}</div> : (
          <div className="nv-ph-chips">
            {chips.map((c) => <button key={c.key} type="button" className="nv-ph-chip" style={{ '--c': c.hue }} onClick={c.run} tabIndex={rest ? 0 : -1}><i />{c.label}</button>)}
          </div>
        )}
      </div>

      {/* the hero: the newest panel, large, out of the core */}
      <div className="nv-ph-hero" data-key={heroKey || ''} style={hero ? { '--h': stageHue(hero.card, panelHead(hero.card).hue) } : undefined}>
        {hero && (
          <div key={heroKey} className="nv-ph-heroin" role="button" tabIndex={0} aria-label={`${stageEyebrow(hero.card, { today: todayIso() }).tag}. Tap to open`}
            onClick={(e) => { if (e.target.closest('button, a, input, label')) return; openIt(hero.key, e.currentTarget); }}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openIt(hero.key, e.currentTarget); } }}>
            <HeroFit><PhonePanel card={hero.card} decide={decideOf(hero.card)} T={T} /></HeroFit>
          </div>
        )}
      </div>

      {/* everything from this answer, dealt out of the core into two columns */}
      <div ref={gridRef} className="nv-ph-grid" aria-hidden={!all}>
        <div className="nv-ph-gridin" style={{ height: gridH }}>
          {ordered.map((p) => {
            const c = cellAt.get(p.key);
            const measured = !!heights[p.key];
            return (
              <div key={p.key} data-key={p.key} className={`nv-ph-c${measured ? ' in' : ''}`} role="button" tabIndex={all ? 0 : -1}
                aria-label={`Open ${stageEyebrow(p.card, { today: todayIso() }).tag}`}
                style={{ '--h': stageHue(p.card, panelHead(p.card).hue), left: c.col ? g.col + PH.gap : 0, top: c.top, height: c.h, '--dx': `${c.dx}px`, '--dy': `${c.dy}px`, '--i': c.i }}
                onClick={(e) => openIt(p.key, e.currentTarget)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(p.key, e.currentTarget); } }}>
                <div className="mi"><PhonePanel card={p.card} still T={T} refFn={(el) => { if (el) measureRefs.current.set(p.key, el); else measureRefs.current.delete(p.key); }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      <button type="button" className="nv-ph-count" onClick={() => setForced(all ? 'hero' : 'all')} tabIndex={shown > 1 || all ? 0 : -1}
        aria-label={all ? 'Show the latest panel' : `See all ${shown} panels from this answer`}>
        <span>{words.from}</span><b>{words.act}</b>
      </button>

      {/* the rail: the earlier panels as small copies, newest first, the next cut at the edge */}
      <div ref={railRef} className="nv-ph-rail" aria-hidden={all || rest}>
        <div className="nv-ph-track" style={{ width: Math.max(1, rail.length * PH.slot) }}>
          {ordered.map((p) => {
            const at = rail.indexOf(p.key);
            const inr = at >= 0;
            return (
              <div key={p.key} data-key={p.key} className={`nv-ph-mini${inr ? ' in' : ''}`} role="button" tabIndex={inr && !all ? 0 : -1}
                aria-label={`Open ${stageEyebrow(p.card, { today: todayIso() }).tag}`}
                style={{ '--h': stageHue(p.card, panelHead(p.card).hue), transform: `translate3d(${railX(Math.max(0, at))}px, 0, 0)` }}
                onClick={(e) => openIt(p.key, e.currentTarget)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(p.key, e.currentTarget); } }}>
                {inr && <div className="mi"><PhonePanel card={p.card} still T={T} /></div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* over everything (the core and the composer too): the spark where the
          hero leaves the core, and one panel opened full size over a dimmed
          stage (~60%: the figure/ground law) */}
      {typeof document !== 'undefined' && createPortal(
        <div className={`nv-ph-top${all ? ' all' : ''}${openKey ? ' opened' : ''}${closing ? ' closing' : ''}`} style={{ '--ph-openw': `${g.openW}px` }}>
          {hero && <span key={heroKey} className="nv-ph-spark go" style={{ '--h': stageHue(hero.card, panelHead(hero.card).hue) }} aria-hidden="true" />}
          <div className="nv-ph-scrim" onClick={closeOpen} aria-hidden="true" data-sheet-close="" />
          {openP && (
        <div ref={openRef} className="nv-ph-open" role="dialog" aria-modal="true" data-sheet="root" aria-label={stageEyebrow(openP.card, { today: todayIso() }).tag} style={{ '--h': stageHue(openP.card, panelHead(openP.card).hue) }}>
          <PhonePanel card={openP.card} open decide={decideOf(openP.card)} T={T} onDiscuss={() => { closeOpen(); }} />
          <button type="button" className="nv-ph-x" aria-label="Close" onClick={closeOpen} data-sheet-close=""><Gl d={X_D} /></button>
        </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
