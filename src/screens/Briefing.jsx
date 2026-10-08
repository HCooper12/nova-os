import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { ChatMarkdown } from '../ChatMarkdown.jsx';
import { Chip, Meta, TextAction, ScreenHead } from '../Controls.jsx';
import { NovaFocus } from '../NovaFocus.jsx';
import { useDictation, reportTurnEnd } from '../useDictation.js';
import { useSheetDrag } from '../useSheetDrag.js';
import { boardSpot, macBoardSpot, BOARD, MAC_BOARD } from '../briefingFacts.js';
import { clockNow } from '../speechClock.js';

// THE BRIEFING — a report Nova researched, read and performed.
//
// ROUND 2 (9 Oct 2026, design/mockups/83-redesign-briefing-r2.html, his
// "Looking good"). It plays on Nova's own stage, the full-screen Nova in its
// briefing mode (src/NovaFocus.jsx, mode="briefing"): a picture rises out of
// the core with its sentence and settles away, each word fades up in place
// with the word being said underlined in jade (no grains from the core: his
// "remove the sparks ... it's distracting"), a part's name is said over the
// plate and drops into the rail, and skip, back, Script and Ask sit under his
// thumb. When Nova finishes, the parts lift out of the rail as boards (C's
// overview, "the reveal you asked to be reminded of") over an end card whose
// verbs each say what they will do (src/briefingFacts.js). Read is B's page,
// with Nova pinned in a player at its foot.
//
// Every act is a method the view model hands in (src/vals/valsBriefing.js);
// the stage's own microphone is the one thing this screen holds, for Ask.

const S = 'var(--nv-font-serif)';
const UI = 'var(--nv-font-ui)';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.32,.72,0,1)';
const EOUT = 'cubic-bezier(.23,1,.32,1)';
const EIO = 'cubic-bezier(.77,0,.175,1)';

/* ------------------------------ the glyphs ------------------------------- */

// The mockup's own set, stroked at 2 on a 24 grid (filled where it fills)
const G = {
  down: <path d="m6 9 6 6 6-6" />,
  back: <path d="m15 18-6-6 6-6" />,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth="3" /></>,
  prev: <><path className="f" d="M19 6.5v11L10.5 12 19 6.5Z" /><path d="M6.5 6v12" strokeWidth="2.4" /></>,
  next: <><path className="f" d="M5 6.5v11l8.5-5.5L5 6.5Z" /><path d="M17.5 6v12" strokeWidth="2.4" /></>,
  play: <path className="f" d="M8 5.5v13l11-6.5-11-6.5Z" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth="3.2" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  tick: <path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth="2.6" />,
  cross: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  tray: <><path d="M12 3.5v9M8 9l4 4 4-4" /><path d="M4 13.5v4A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-4" /></>,
  ask: <><path d="M5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6a2.5 2.5 0 0 1-2.5 2.5H9z" /><path d="M9.5 9.2a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1" /><path d="M12 14.4h.01" strokeWidth="2.6" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  swap: <><path d="M5 8h12M14 5l3 3-3 3" /><path d="M19 16H7M10 13l-3 3 3 3" /></>,
  undo: <><path d="M9 7 5 11l4 4" /><path d="M5 11h9.5a4.5 4.5 0 0 1 0 9H11" /></>,
  restart: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5v4h4" /></>,
};
function Glyph({ k, className = '' }) {
  return <svg className={`nv-bf-i ${className}`} viewBox="0 0 24 24" aria-hidden="true">{G[k]}</svg>;
}

/* --------------------------- the glass, at rest --------------------------- */

// The empty screen's stage, standing dim and labelled as what it is (never a
// fake report): the old typographic card, its labels now at 13 (the audit's
// 7.5 to 9 pt mono micro-labels are gone).
function Glass({ visual, mini = false }) {
  if (!visual) return null;
  return (
    <div className={`nv-bf-rest${mini ? ' mini' : ''}`}>
      {visual.kind === 'title' && <><span className="k">Briefing</span><b>{visual.title}</b>{!mini && visual.sub ? <span className="s">{visual.sub}</span> : null}</>}
      {visual.kind === 'heading' && <><span className="k">Part {visual.n} of {visual.of}</span><b>{visual.heading}</b></>}
      {visual.kind === 'term' && <><span className="k">In plain words</span><b>{visual.term}</b></>}
    </div>
  );
}

/* ------------------------------ the panels ------------------------------- */

// WHAT RISES OUT OF THE CORE: a credited picture, a clip (paused until he
// taps it: never two voices at once), or a term in plain words. A plain
// sentence has none (briefingFacts.panelOf).
function Panel({ p }) {
  if (p.kind === 'term') {
    return (
      <div className="nv-bf-pc">
        <span className="nv-bf-pk">In plain words</span>
        <div className="nv-bf-pterm">{p.term}</div>
        {p.plain && <div className="nv-bf-pdef">{p.plain}</div>}
        {p.of > 0 && <div className="nv-bf-pnote">{p.of === 1 ? 'The one term this briefing defines.' : `One of ${p.ofWord} terms this briefing defines.`}</div>}
      </div>
    );
  }
  if (p.kind === 'image') {
    return (
      <div className="nv-bf-pc">
        <div className="nv-bf-ph2"><b>{p.caption || p.alt || 'Picture'}</b>{p.credit ? <span>{p.credit}</span> : null}</div>
        <img className="nv-bf-img" src={p.src} alt={p.alt || p.caption || ''} />
      </div>
    );
  }
  if (p.kind === 'clip') {
    return (
      <div className="nv-bf-pc">
        <div className="nv-bf-ph2"><b>{p.title || 'Clip'}</b>{p.channel ? <span>{p.channel}</span> : null}</div>
        <div className="nv-bf-clip">
          <iframe title={p.title || 'clip'} src={p.embed} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
        <div className="nv-bf-pnote">Paused until you tap it.</div>
      </div>
    );
  }
  return null;
}

// A board's small picture: what that part showed, or Nova himself
function Mini({ pic, mac = false }) {
  if (pic.kind === 'image') return <img className="nv-bf-mini img" src={pic.src} alt="" />;
  if (pic.kind === 'term') return <span className="nv-bf-mini term">{pic.term}</span>;
  return <span className={`nv-bf-mini core${mac ? ' mac' : ''}`} aria-hidden="true"><i /></span>;
}

/* ------------------------------ the screen ------------------------------- */

export function Briefing({ v }) {
  const b = v.briefing;

  // a briefing still in flight re-reads itself every few seconds
  useEffect(() => {
    if (!b?.working) return undefined;
    const t = setInterval(() => b.refresh?.(), 4000);
    return () => clearInterval(t);
  }, [b?.working?.stage, b?.working?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!b) return null;

  if (b.empty && !b.error) {
    // NOT A PARAGRAPH ON A VOID (finding 20, 22 Sep). The house head at the
    // house height (the tall-screen wrap Voice uses, so the eyebrow lands
    // where every other screen's does), the serif news line, the stage
    // standing dim and at rest, the real phrasings as chips that place the
    // words in the composer, and the briefings that already exist.
    const mob = v.isMobile;
    return (
      <div style={v.wrapVoice} data-screen-label="Briefing" className="nv-bf-page">
        <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
          <ScreenHead numeral="XVII." label="Knowledge · Briefing" />
          <Meta tone="faint">Researched · written · read aloud</Meta>
        </div>
        <h1 style={css(`margin:18px 0 0;font:700 ${mob ? 28 : 30}px/1.1 ${UI};letter-spacing:var(--nv-display-track);text-wrap:balance`)}>
          Nothing open. <span style={css(`font:italic 400 ${mob ? 25 : 27}px ${S};color:var(--nv-ink60)`)}>Ask for one.</span>
        </h1>
        <p className="nv-bf-lead">
          Nova works out the angles, researches them at once, writes the report and reads it to you, with the glass showing what he means. Say it to him the way you would to a person:
        </p>
        <div style={css("margin-top:12px;display:flex;flex-wrap:wrap;gap:8px")}>
          {b.starters.map((s) => (
            <Chip key={s.label} tone="cyan" onClick={s.go} ariaLabel={`${s.label}: places the words in the composer, the blank is ${s.hint}`}>{s.label}</Chip>
          ))}
        </div>
        {/* the stage, at rest — the same glass the briefing plays on, dimmed
            and labelled as what it is, never a fake report */}
        <div style={css("margin-top:26px;max-width:560px")}>
          <p className="nv-bf-label">The stage, at rest</p>
          <div style={css("margin-top:8px;opacity:.55")} aria-hidden="true">
            <Glass visual={{ kind: 'title', title: 'Your next briefing', sub: 'the angles · the report · the sources' }} />
            <div style={css("margin-top:8px;display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:8px;opacity:.6")}>
              <Glass mini visual={{ kind: 'heading', n: 1, of: 3, heading: 'Where it starts' }} />
              <Glass mini visual={{ kind: 'term', term: 'In plain words', plain: '' }} />
            </div>
          </div>
        </div>
        <div style={css("margin-top:26px;max-width:560px")}>
          <div style={css("display:flex;justify-content:space-between;align-items:center;gap:10px")}>
            <p className="nv-bf-label">Already made</p>
            <TextAction compact tone="quiet" onClick={b.openInbox}>Open the Inbox</TextAction>
          </div>
          {b.recent.length === 0 ? (
            // HONEST ABOUT WHAT HE KEPT (audit finding 7, round 2): a briefing
            // plays from its Inbox record, and the Inbox keeps its newest 400
            // decisions, so an older saved briefing is a page and no longer
            // a performance. The old line, that none existed yet, was untrue for him.
            <p className="nv-bf-note">None to play. A briefing plays here while its Inbox record lasts, which is the newest 400 decisions. One you saved before that is still a page in Wiki/Inbox, and reads there.</p>
          ) : b.recent.map((r, i) => (
            <Interactive key={r.id} as="div" onClick={r.open} role="button" aria-label={`Open ${r.title}`}
              base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', padding: '9px 4px', borderTop: i === 0 ? 'none' : '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}
              hoverStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 04%, transparent)' }}>
              <span aria-hidden="true" style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: r.working ? 'var(--nv-cy)' : 'var(--nv-good)', boxShadow: r.working ? '0 0 10px var(--nv-cy)' : 'none', animation: r.working ? 'novaPulse 1.6s infinite var(--nv-anim)' : 'none' }} />
              <span style={{ flex: 1, minWidth: 0, font: r.titled ? `400 ${mob ? 16 : 17}px/1.3 ${S}` : `400 15px/1.4 ${UI}`, color: r.titled ? 'var(--nv-ink)' : 'var(--nv-ink60)', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.title}</span>
              <Meta tone="faint" style={{ flex: 'none', textTransform: 'none', letterSpacing: 0 }}>{r.state}</Meta>
            </Interactive>
          ))}
        </div>
      </div>
    );
  }
  if (b.loading && !b.working && !b.error) {
    // a skeleton of the stage, under the house head's clearance
    return (
      <div style={v.wrapVoice} className="nv-bf-page" role="status" aria-label="Opening the briefing">
        <p className="nv-bf-label">Briefing</p>
        <span className="nv-bf-skel" style={{ width: '72%', height: 30, marginTop: 12 }} />
        <span className="nv-bf-skel" style={{ width: '100%', height: 180, marginTop: 22, borderRadius: 28 }} />
        <span className="nv-bf-skel" style={{ width: '90%', height: 16, marginTop: 18 }} />
        <span className="nv-bf-skel" style={{ width: '60%', height: 16, marginTop: 10 }} />
      </div>
    );
  }

  if (b.working) {
    return (
      <div style={v.wrapVoice} className="nv-bf-page">
        <p className="nv-bf-label cy">Briefing · being made</p>
        <h1 style={{ margin: '10px 0 0', font: `400 ${v.isMobile ? 26 : 32}px/1.15 ${S}`, textWrap: 'balance' }}>{b.title}</h1>
        {b.topic && <p className="nv-bf-note">“{b.topic}”</p>}
        <div style={css("margin-top:22px;display:flex;align-items:center;gap:12px")}>
          <span style={css("width:8px;height:8px;border-radius:50%;background:var(--nv-cy);box-shadow:0 0 12px var(--nv-cy);animation:novaPulse 1.4s ease-in-out infinite")} />
          <span style={css("font:500 15px var(--nv-font-ui);color:var(--nv-ink)")}>{b.working.line}</span>
        </div>
        {b.working.angles.length > 0 && (
          <div style={css("margin-top:18px;display:flex;flex-direction:column;gap:8px")}>
            <p className="nv-bf-label">The angles being researched</p>
            {b.working.angles.map((a, i) => (
              <div key={i} style={css("display:flex;gap:10px;align-items:baseline")}>
                <span aria-hidden="true" style={{ flex: 'none', width: 16, color: i < b.working.done ? 'var(--nv-good)' : 'var(--nv-ink50)' }}>{i < b.working.done ? <Glyph k="tick" className="sm" /> : '·'}</span>
                <span style={css("font:400 15px/1.5 var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 82%, transparent)")}>{a}{i < b.working.done ? <span className="nv-bf-sr">, back</span> : null}</span>
              </div>
            ))}
          </div>
        )}
        <p className="nv-bf-note">You will get a notification when it is ready. Nothing here needs you.</p>
      </div>
    );
  }

  if (b.error) {
    return (
      <div style={v.wrapVoice} className="nv-bf-page">
        <p className="nv-bf-label warn">Briefing · did not finish</p>
        <p style={css("margin:12px 0 0;max-width:560px;font:400 15px/1.6 var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 80%, transparent)")}>{b.error}</p>
        <p className="nv-bf-note">Nothing was written. Try again lives on its card in the Inbox, and asks the same question again.</p>
        <div style={css("margin-top:16px;display:flex;gap:12px;flex-wrap:wrap")}>
          <TextAction onClick={b.openInbox}>Open the Inbox</TextAction>
          <TextAction tone="quiet" onClick={b.close}>Back</TextAction>
        </div>
      </div>
    );
  }

  return <Stage b={b} v={v} />;
}

/* ------------------------------- the stage ------------------------------- */

const MOMENT_HOLD = 1150;
const MOMENT_DROP = 460;
// a recording seam, dev builds only (the island's __islandSlow precedent):
// stretch the moment's clock so a frame of it can be photographed
const slow = () => (import.meta.env?.DEV && typeof window !== 'undefined' && Number(window.__bfSlow)) || 1;

function Stage({ b, v }) {
  const mac = !v.isMobile;
  const reduced = reducedMotion();
  const rootRef = useRef(null);

  // ---- ASK: the stage's own microphone (the Nova thread's wiring) ----
  const inputRef = useRef('');
  const sendRef = useRef(v.sendOrb);
  sendRef.current = v.sendOrb;
  const dict = useDictation(
    () => v.takeVoiceSeed(),
    (text) => { inputRef.current = text; v.setOrbInputValue(text); },
    (said) => { const t = String(said ?? inputRef.current ?? '').trim(); if (t) sendRef.current(t); else v.notifyEmptyListen(); },
    {
      holdMs: v.voiceHoldMs,
      leadMs: v.voiceLeadMs,
      onError: (err) => v.dictationError(err),
      onTurnEnd: (info) => { v.noteTurnHeard?.(info.heard); reportTurnEnd('briefing', v.voiceHold, info); },
    },
  );
  const dictRef = useRef(dict);
  dictRef.current = dict;
  useEffect(() => { v.reportScreenMic?.(dict.on); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dict.on]);
  useEffect(() => () => v.reportScreenMic?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { v.reportHearing?.('briefing', dict.hearing); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dict.hearing]);
  useEffect(() => () => v.reportHearing?.('briefing', false), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [listenSince, setListenSince] = useState(0);
  useEffect(() => { if (dict.on) setListenSince(Date.now()); }, [dict.on]);

  // one gesture, everything it needs: the briefing pauses where it is, and
  // the microphone opens inside the tap (iOS needs the gesture)
  const startAsk = (scope) => {
    v.primeSpeech();
    if (dictRef.current.on) { dictRef.current.toggle(); return; }
    if (scope === 'end') b.groups.flatMap((g) => g.verbs).find((x) => x.key === 'ask')?.run?.(); else b.askMid?.();
    if (dictRef.current.supported) dictRef.current.toggle();
  };
  // the ask is over once nothing is listening, thinking or speaking for a beat
  const ask = b.ask;
  const askSeen = useRef(false);
  const askLive = !!ask && (dict.on || dict.hearing || ask.busy || ask.speaking);
  if (askLive) askSeen.current = true;
  useEffect(() => {
    if (!ask) { askSeen.current = false; return undefined; }
    if (askLive) return undefined;
    const id = setTimeout(() => ask.end(), askSeen.current ? 1400 : 9000);
    return () => clearTimeout(id);
  }, [ask?.at, askLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the state the core wears ----
  const key = ask
    ? (dict.on ? 'listening' : (dict.hearing || ask.busy) ? 'thinking' : ask.speaking ? 'speaking' : 'turn')
    : b.playing ? 'speaking' : 'turn';
  const SW = { listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', turn: b.playing ? 'Speaking' : b.started ? 'Paused' : 'Ready' };
  const Sx = { key, word: SW[key], hint: null };

  // ---- the panel on the stage: the sentence's own, or the answer's glass ----
  const answerGlass = ask && ask.speaking && v.glass?.hero ? { key: `ask:${ask.at}:${v.glass.key || v.glass.hero.label || ''}`, hero: v.glass.hero, finder: null, mark: null } : null;
  const panel = !ask && b.panel ? { key: b.panel.key, label: b.panel.kind === 'term' ? b.panel.term : (b.panel.caption || b.panel.title || 'Picture'), node: <Panel p={{ ...b.panel, ofWord: b.termsWord }} /> } : null;
  const phase = ask ? (answerGlass ? 'stage' : 'home') : b.phase;

  // the captions read only what was said since this stage last started,
  // was paused into, or asked: never an old greeting still in the clock
  // (on the speech clock's own time base, which the sentences carry)
  const [saidSince, setSaidSince] = useState(() => clockNow());
  useEffect(() => { if (ask) setSaidSince(clockNow()); }, [ask?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const T = {
    lines: ask ? ask.lines : [],
    contest: false,
    closeFocus: b.close,
    engine: v.coreStyle,
    status: null, offline: false, demo: b.demo,
    stage: answerGlass || panel,
    busy: !!ask?.busy, speaking: !!ask?.speaking,
  };

  // ---- THE MOMENT: a part's name is said over the plate, then drops into
  // the rail. Only as playback reaches a new part, never on a seek's landing
  // on the same part, never under the summary.
  const [moment, setMoment] = useState(null);
  const lastPart = useRef(b.curPart?.n ?? null);
  useEffect(() => {
    const n = b.curPart?.n ?? null;
    const prev = lastPart.current;
    lastPart.current = n;
    // only as a part BEGINS: a line tapped in the middle of a part lands quietly
    if (!b.playing || !n || n === prev || ask || b.beats[b.current]?.kind !== 'section-open') return undefined;
    setMoment({ n, heading: b.curPart.heading, stage: 'in', at: Date.now() });
    const k = slow();
    const t1 = setTimeout(() => setMoment((m) => (m && m.n === n ? { ...m, stage: 'drop' } : m)), k * (reduced ? MOMENT_HOLD + 200 : MOMENT_HOLD + 380));
    const t2 = setTimeout(() => setMoment((m) => (m && m.n === n ? null : m)), k * ((reduced ? MOMENT_HOLD + 200 : MOMENT_HOLD + 380) + MOMENT_DROP));
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [b.curPart?.n, b.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Script ----
  const [script, setScript] = useState(false);
  const [hitLine, setHitLine] = useState(-1);

  // ---- THE END: the rail's segments are measured as the boards leave them
  const railRects = useRef([]);
  const measureRail = () => {
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    railRects.current = [...root.querySelectorAll('.nv-bf-segs button')].map((el) => {
      const q = el.getBoundingClientRect();
      return { x: q.left - r.left + q.width / 2, y: q.top - r.top + q.height / 2 };
    });
  };
  useLayoutEffect(() => { if (phase !== 'end' && phase !== 'read') measureRail(); });
  // the end stays drawn a moment as it leaves, so Ask can fly it into the core
  const [endShown, setEndShown] = useState(phase === 'end');
  const [endLeaving, setEndLeaving] = useState(false);
  useEffect(() => {
    if (phase === 'end') { setEndShown(true); setEndLeaving(false); return undefined; }
    if (!endShown) return undefined;
    if (reduced) { setEndShown(false); return undefined; }
    setEndLeaving(true);
    const id = setTimeout(() => { setEndShown(false); setEndLeaving(false); }, 420);
    return () => clearTimeout(id);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = phase === 'read';
  const topRight = read ? null : <button type="button" className="nv-bf-txb" onClick={b.openRead}>Read</button>;

  // the plate before Nova has said anything: the title, his request, and Play
  const idle = (
    <div className="nv-bf-idle">
      <b>{b.title}</b>
      {b.topic ? <span>You asked: “{b.topic}”</span> : null}
      <span className="m">{b.started ? `Paused in ${b.curPart?.n ? `part ${b.curPart.n}` : 'the summary'} · play carries on` : `${b.counts} · press play`}</span>
    </div>
  );

  return (
    <div ref={rootRef} className="nv-bf-host">
      <NovaFocus T={T} S={Sx} dict={dict} since={listenSince} leaving={false} mode="briefing" bphase={endLeaving ? 'home' : phase}
        presenter={b.title} topRight={topRight} plateIdle={idle} saidSince={saidSince}
        onTalk={() => startAsk(b.atEnd ? 'end' : 'mid')} onOpen={() => {}}>
        {/* the moment: the part's name, over the plate, dropping into the rail */}
        {moment && !read && (
          <div className={`nv-bf-moment ${moment.stage}`} aria-hidden="true" key={`${moment.n}:${moment.at}`}>
            <span className="mk">Part {moment.n} of {b.partCount}</span>
            <span className="mt">{moment.heading}</span>
          </div>
        )}

        {!read && (
          <Rail b={b} dimmed={!!moment} hidden={phase === 'end' || endLeaving} />
        )}

        {!read && (
          <div className="nv-bf-tp" data-hidden={phase === 'end' || endLeaving ? '1' : undefined}>
            <button type="button" className="nv-bf-tb ic" onClick={() => setScript(true)} aria-label="Script" aria-expanded={script}><Glyph k="list" /></button>
            <button type="button" className="nv-bf-tb ic" onClick={b.back} aria-label="Back a part"><Glyph k="prev" /></button>
            <button type="button" className="nv-bf-tb play" onClick={b.playing ? b.pause : (b.resume || b.play)} aria-label={b.playing ? 'Pause' : 'Play'}>
              <Glyph k={b.playing ? 'pause' : 'play'} />
            </button>
            <button type="button" className="nv-bf-tb ic" onClick={b.next} aria-label="Next part"><Glyph k="next" /></button>
            <button type="button" className="nv-bf-tb" onClick={() => startAsk(b.atEnd || !b.started ? 'end' : 'mid')} aria-pressed={!!ask}><Glyph k="mic" />Ask</button>
          </div>
        )}

        {endShown && !read && (
          mac
            ? <MacEnd b={b} leaving={endLeaving} railRects={railRects.current} onAsk={() => startAsk('end')} />
            : <PhoneEnd b={b} leaving={endLeaving} railRects={railRects.current} onAsk={() => startAsk('end')} rootRef={rootRef} />
        )}

        {read && <ReadPage b={b} onAsk={() => startAsk('end')} />}

        {script && (
          <ScriptSheet b={b} mac={mac} hit={hitLine} onClose={() => setScript(false)}
            onLine={(bt) => { setHitLine(bt.i); bt.seek(); setTimeout(() => { setScript(false); setHitLine(-1); }, reduced ? 0 : 260); }}
            onRestart={() => { b.restart(); setScript(false); }} />
        )}
      </NovaFocus>
    </div>
  );
}

/* -------------------------------- the rail ------------------------------- */

function Rail({ b, dimmed, hidden }) {
  const label = b.curPart
    ? <><b>{b.curPart.n || ''}</b><span>{b.curPart.heading}</span></>
    : <span>{b.counts}</span>;
  return (
    <div className="nv-bf-rail" data-hidden={hidden ? '1' : undefined}>
      <div className="nv-bf-rl" style={{ opacity: dimmed ? 0.3 : 1 }}>{label}</div>
      <div className="nv-bf-segs">
        {b.parts.map((p) => (
          <button key={p.n} type="button" className={p.current ? 'cur' : ''} onClick={p.play || undefined} aria-label={`Part ${p.n}, ${p.heading}`}>
            <i><b style={{ '--f': p.f }} /></i>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- the script ------------------------------ */

function ScriptSheet({ b, mac, hit, onClose, onLine, onRestart }) {
  const drag = useSheetDrag(onClose, { threshold: 80 });
  const listRef = useRef(null);
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-now]');
    if (el) el.scrollIntoView({ block: 'center' });
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <>
      <div className="nv-bf-scrim" onClick={onClose} aria-hidden="true" />
      <section ref={drag.sheetRef} className={`nv-bf-sheet${mac ? ' side' : ''}`} role="dialog" aria-modal="true" aria-label="Script" style={{ zIndex: 80 }}>
        <div className="nv-bf-grabzone" onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerCancel={drag.onPointerCancel}>
          {!mac && <span className="nv-bf-grab" aria-hidden="true" />}
          <div className="nv-bf-sh">
            <b>Script</b>
            <button type="button" className="nv-bf-txb" onClick={onRestart}><Glyph k="restart" />From the start</button>
          </div>
        </div>
        <div className="nv-bf-lines" ref={listRef}>
          {b.beats.map((bt) => (
            <div key={bt.i}>
              {bt.part && <p className="nv-bf-sp">{bt.part.n ? `Part ${bt.part.n} · ${bt.part.heading}` : bt.part.heading}</p>}
              <button type="button" className={`nv-bf-ln${bt.current ? ' now' : ''}${hit === bt.i ? ' hit' : ''}`} data-now={bt.current ? '1' : undefined} onClick={() => onLine(bt)}>{bt.say}</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ------------------------------- the end card ---------------------------- */

// Every verb with its one-line consequence, sorted into keeping the
// information, thinking it over, changing something, and Discard apart.
// Save is acted out: a page leaves the boards and drops into its row, the
// row becomes the receipt, and Undo is on the same row.
function EndCard({ b, title = true, onAsk, ghostFrom = null }) {
  const cardRef = useRef(null);
  const save = (verb) => {
    const card = cardRef.current;
    const row = card?.querySelector('[data-v="save"] .nv-bf-vg');
    const from = ghostFrom?.();
    if (!reducedMotion() && row && from) {
      const host = card.closest('.nv-fx');
      const hr = host.getBoundingClientRect();
      const g = row.getBoundingClientRect();
      const gh = document.createElement('span');
      gh.className = 'nv-bf-ghost';
      host.appendChild(gh);
      const sx = from.x - 22; const sy = from.y - 28;
      const ex = g.left - hr.left + g.width / 2 - 22; const ey = g.top - hr.top + g.height / 2 - 28;
      Object.assign(gh.style, { left: `${sx}px`, top: `${sy}px` });
      const a = gh.animate([
        { opacity: 0, transform: 'translateY(10px) scale(.9)' },
        { opacity: 1, transform: 'translateY(-14px) scale(1)', offset: 0.25 },
        { opacity: 0.9, transform: `translate(${ex - sx}px,${ey - sy}px) scale(.4)`, offset: 0.92 },
        { opacity: 0, transform: `translate(${ex - sx}px,${ey - sy}px) scale(.3)` },
      ], { duration: 700, easing: EIO, fill: 'both' });
      a.finished.catch(() => {}).then(() => gh.remove());
      setTimeout(() => verb.run?.(), 520);
      return;
    }
    verb.run?.();
  };
  return (
    <div ref={cardRef} className="nv-bf-card">
      {title && <div className="nv-bf-eh"><b className="nv-bf-et">{b.title}</b></div>}
      {b.incomplete && (
        <p className="nv-bf-missing">One angle could not be researched and is missing from this report: {b.incomplete.join('; ')}.</p>
      )}
      {b.groups.map((g) => (
        <div key={g.key} className="nv-bf-group">
          <p className="nv-bf-gk">{g.label}</p>
          {g.verbs.map((verb) => {
            if (verb.done) {
              const ok = verb.done.state === 'saved' || verb.done.state === 'edited';
              return (
                <div key={verb.key} className={`nv-bf-vdone${ok ? ' ok' : ''}`} data-v={verb.key} data-state={verb.done.state} role="status">
                  <span className="nv-bf-ok">{ok ? <Glyph k="tick" /> : verb.done.state === 'undone' ? <Glyph k="undo" /> : verb.done.state === 'discarded' ? <Glyph k="cross" /> : <span className="nv-bf-spin" />}</span>
                  <span className="nv-bf-vt"><b>{verb.done.label}</b><span>{verb.done.line}</span></span>
                  {verb.undo && <button type="button" className="nv-bf-txb" onClick={verb.undo} aria-label="Undo: deletes the page, if you have not edited it">Undo</button>}
                </div>
              );
            }
            const disabled = !verb.run && verb.key !== 'ask';
            return (
              <button key={verb.key} type="button" className={`nv-bf-vrow${verb.quiet ? ' quiet' : ''}${verb.built === false ? ' off' : ''}`} data-v={verb.key}
                disabled={disabled} aria-disabled={disabled || undefined}
                onClick={verb.key === 'save' ? () => save(verb) : verb.key === 'ask' ? onAsk : verb.run || undefined}>
                <span className="nv-bf-vg"><Glyph k={verb.glyph} /></span>
                <span className="nv-bf-vt"><b>{verb.label}</b><span>{verb.line}</span></span>
                {verb.built === false && <i className="nv-bf-new">Not built</i>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------- the boards ----------------------------- */

function Board({ p, onPlay, mac = false }) {
  return (
    <button type="button" className="nv-bf-fb" onClick={onPlay} aria-label={`Part ${p.n}, ${p.heading}: hear it again`}>
      <span className="fn">Part {p.n}<Glyph k="play" /></span>
      <b className="ft">{p.heading}</b>
      <span className="fv"><Mini pic={p.picture} mac={mac} /></span>
    </button>
  );
}

// THE PHONE'S END: the parts lift out of the rail and land as boards, three
// and three, a little askew; a last board plays it all again; the end card
// rises under them. Ask sends them all back into the core.
function PhoneEnd({ b, leaving, railRects, onAsk, rootRef }) {
  const fanRef = useRef(null);
  const cardRef = useRef(null);
  const [width, setWidth] = useState(390);
  useLayoutEffect(() => {
    const fan = fanRef.current;
    if (!fan) return;
    const w = fan.getBoundingClientRect().width || 390;
    setWidth(w);
  }, []);
  const boards = [...b.parts, null];
  const rows = Math.ceil(boards.length / 3);
  const fanH = rows * (BOARD.h + BOARD.rowGap);
  // the deal: each board from its own rail segment, the last from the core
  useLayoutEffect(() => {
    const fan = fanRef.current;
    const host = rootRef.current?.querySelector('.nv-fx');
    if (!fan || !host) return;
    const hr = host.getBoundingClientRect();
    const fr = fan.getBoundingClientRect();
    const rm = reducedMotion();
    const els = [...fan.querySelectorAll('.nv-bf-fb')];
    els.forEach((el, i) => {
      const g = boardSpot(i, fr.width);
      const cx = fr.left - hr.left + g.left + BOARD.w / 2;
      const cy = fr.top - hr.top + g.top + BOARD.h / 2;
      if (leaving) {
        const core = coreSpot(host, hr);
        el.animate(rm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: `rotate(${g.tilt}deg)` }, { opacity: 0, transform: `translate(${core.x - cx}px,${core.y - cy}px) scale(.22)` }], { duration: 300, delay: i * 30, easing: EOUT, fill: 'both' });
        return;
      }
      if (rm) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: i * 40, easing: 'ease', fill: 'both' }); return; }
      const src = railRects[i] || coreSpot(host, hr);
      el.animate([
        { opacity: 0, transform: `translate(${src.x - cx}px,${src.y - cy}px) rotate(0deg) scale(.22)` },
        { opacity: 1, offset: 0.25 },
        { opacity: 1, transform: `translate(0,0) rotate(${g.tilt}deg) scale(1)` },
      ], { duration: 640, delay: i * 70, easing: EASE, fill: 'both' });
    });
    const card = cardRef.current;
    if (card) {
      if (leaving) card.animate(rm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(24px) scale(.97)' }], { duration: 240, easing: EOUT, fill: 'both' });
      else card.animate(rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(24px) scale(.97)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: rm ? 250 : 460, delay: rm ? 300 : 640 + (boards.length - 1) * 70, easing: EASE, fill: 'both' });
    }
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  const ghostFrom = () => {
    const fan = fanRef.current;
    const host = rootRef.current?.querySelector('.nv-fx');
    if (!fan || !host) return null;
    const hr = host.getBoundingClientRect();
    const fr = fan.getBoundingClientRect();
    return { x: fr.left - hr.left + fr.width / 2, y: fr.top - hr.top + 80 };
  };
  return (
    <>
      <div className="nv-bf-fan" ref={fanRef} style={{ height: fanH }} data-leaving={leaving ? '1' : undefined}>
        {boards.map((p, i) => {
          const g = boardSpot(i, width);
          const style = { left: g.left, top: g.top, transform: `rotate(${g.tilt}deg)` };
          if (!p) {
            return (
              <button key="all" type="button" className="nv-bf-fb fs" style={style} onClick={b.restart} aria-label="Play the whole briefing from the start">
                <span className="fn">All {b.allWord.toLowerCase()}</span>
                <b className="ft">From the start</b>
                <span className="fv"><Glyph k="restart" /></span>
              </button>
            );
          }
          return <div key={p.n} style={{ position: 'absolute', ...style }} className="nv-bf-fbw"><Board p={p} onPlay={p.play} /></div>;
        })}
      </div>
      <div className="nv-bf-endv" ref={cardRef} style={{ top: `calc(var(--bf-top) + ${fanH + 6}px)` }}>
        <EndCard b={b} onAsk={onAsk} ghostFrom={ghostFrom} />
      </div>
    </>
  );
}

// where the core is, inside the full screen's box
function coreSpot(host, hr) {
  const c = host.querySelector('.nv-fx-core')?.getBoundingClientRect();
  return c ? { x: c.left - hr.left + c.width / 2, y: c.top - hr.top + c.height / 2 } : { x: hr.width / 2, y: hr.height * 0.4 };
}

// THE MAC'S END: the boards spread across the stage in one row, the title
// under them, and the end card a column beside them, so nothing hides in a
// sheet.
function MacEnd({ b, leaving, onAsk }) {
  const rowRef = useRef(null);
  const n = b.parts.length;
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const rm = reducedMotion();
    [...row.querySelectorAll('.nv-bf-fbw')].forEach((el, i) => {
      const g = macBoardSpot(i, n);
      if (leaving) { el.animate(rm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1 }, { opacity: 0, transform: `translate(${390 - g.left - MAC_BOARD.w / 2}px,240px) scale(.3)` }], { duration: 300, delay: i * 30, easing: EOUT, fill: 'both' }); return; }
      el.animate(rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translate(${390 - g.left - MAC_BOARD.w / 2}px,240px) rotate(0deg) scale(.3)` }, { opacity: 1, transform: `rotate(${g.tilt}deg)` }], { duration: rm ? 260 : 640, delay: i * 70, easing: EASE, fill: 'both' });
    });
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="nv-bf-mac" data-leaving={leaving ? '1' : undefined}>
      <span className="nv-bf-mlabel">Nova · finished</span>
      <div className="nv-bf-mstage">
        <div className="nv-bf-mfan" ref={rowRef}>
          {b.parts.map((p, i) => {
            const g = macBoardSpot(i, n);
            return <div key={p.n} className="nv-bf-fbw" style={{ position: 'absolute', left: g.left, top: g.top, transform: `rotate(${g.tilt}deg)` }}><Board p={p} onPlay={p.play} mac /></div>;
          })}
        </div>
        <div className="nv-bf-mtitle">
          <b>{b.title}</b>
          <span>{b.countsTerms} · tap a board to hear that part again</span>
          <button type="button" className="nv-bf-txb" onClick={b.restart}><Glyph k="restart" />From the start</button>
        </div>
      </div>
      <div className="nv-bf-mside"><EndCard b={b} onAsk={onAsk} /></div>
    </div>
  );
}

/* --------------------------------- Read ---------------------------------- */

// B'S PAGE: the parts in the serif, each with its own play button, the part
// being spoken lit in jade, the terms, the sources and the same verbs; Nova
// keeps talking from the player at the foot (the core travels into it), and
// a panel still rises out of him above it.
function ReadPage({ b, onAsk }) {
  const docRef = useRef(null);
  const [openTerm, setOpenTerm] = useState(null);
  const [allSources, setAllSources] = useState(false);
  // the page follows the part being spoken
  const activePart = b.sections.find((s) => s.active)?.i ?? -1;
  useEffect(() => {
    if (!b.playing || activePart < 0) return;
    const el = docRef.current?.querySelector(`[data-p="${activePart}"]`);
    if (el) el.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [activePart]); // eslint-disable-line react-hooks/exhaustive-deps
  const SHOW = 2;
  const sources = allSources ? b.sources : b.sources.slice(0, SHOW);
  return (
    <>
      <div className="nv-bf-rnav">
        <button type="button" className="nv-bf-back" onClick={b.closeRead}><Glyph k="back" /><span>Stage</span></button>
      </div>
      <div className="nv-bf-doc" ref={docRef}>
        <div className="nv-bf-doccol">
          <h1 className="nv-bf-lt">{b.title}</h1>
          <p className="nv-bf-meta">{[b.made, b.counts].filter(Boolean).join(' · ')}</p>
          {b.summary && <p className="nv-bf-lede2">{b.summary}</p>}
          {b.incomplete && <p className="nv-bf-missing">One angle could not be researched and is missing from this report: {b.incomplete.join('; ')}.</p>}
          {b.sections.map((s) => (
            <section key={s.i} className={`nv-bf-part${s.active ? ' lit' : ''}`} data-p={s.i}>
              <div className="nv-bf-ph">
                <h2>{s.heading}</h2>
                {s.firstBeat >= 0 && <button type="button" className="nv-bf-pp" onClick={s.listen} aria-label={`Play part ${s.i + 1}`}><Glyph k="play" /></button>}
              </div>
              {s.active && <span className="nv-bf-now">Playing</span>}
              {s.paras.map((p, i) => <p key={i}><ChatMarkdown text={p} /></p>)}
            </section>
          ))}
          <div className="nv-bf-tail">
            {b.glossary.length > 0 && (
              <>
                <h2>Terms, in plain words</h2>
                <div className="nv-bf-chips">
                  {b.glossary.map((g) => (
                    <button key={g.term} type="button" aria-expanded={openTerm === g.term} onClick={() => setOpenTerm((t) => (t === g.term ? null : g.term))}>{g.term}</button>
                  ))}
                </div>
                {openTerm && <p className="nv-bf-def"><b>{openTerm}</b> {b.glossary.find((g) => g.term === openTerm)?.plain}</p>}
              </>
            )}
            {b.sources.length > 0 && (
              <>
                <h2>Sources</h2>
                <ul className="nv-bf-srcs">
                  {sources.map((s, i) => (
                    <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a></li>
                  ))}
                  {!allSources && b.sources.length > SHOW && (
                    <li><button type="button" onClick={() => setAllSources(true)}>Show {b.sources.length - SHOW} more</button></li>
                  )}
                </ul>
              </>
            )}
            <h2>What to do with it</h2>
            <EndCard b={b} title={false} onAsk={onAsk} />
          </div>
        </div>
      </div>
      <div className="nv-bf-player">
        {b.atEnd && <p className="nv-bf-fin">Finished · tap play to hear it again</p>}
        <button type="button" className="nv-bf-pb" onClick={b.playing ? b.pause : (b.resume || b.play)} aria-label={b.playing ? 'Pause' : 'Play'}>
          <Glyph k={b.playing ? 'pause' : 'play'} />
        </button>
      </div>
    </>
  );
}
