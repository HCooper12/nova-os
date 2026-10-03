import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDictation, reportTurnEnd } from '../useDictation.js';
import { LocalInput } from '../LocalInput.jsx';
import { TypeText } from '../TypeText.jsx';
import { VoicePanel, SourcesPanel } from '../VoicePanels.jsx';
import { SafeVisual } from '../SafeVisual.jsx';
import { GlassSheet } from '../GlassSheet.jsx';
import { StageCard } from '../StageCard.jsx';
import { useLongPress } from '../longPress.js';
import { useKeptTakes, keepTake, dropTake, patchTake } from '../keptTakes.js';
import { stateOf, firstUnseenIndex, threadRows, clock, failedLast } from '../novaThreadFacts.js';
import { Ico, Glyph, Stage, Settled, KeptTake, Meter } from '../NovaThreadParts.jsx';
import { NovaFocus } from '../NovaFocus.jsx';

// THE NOVA THREAD (29 Sep 2026) — design/mockups/63-redesign-nova-r2.html,
// variation D · Rising, his pick: "The rising option D mock up seems to be the
// way to go. Just add the option for the Nova icon to be the focus of the
// screen if I were to press on the nova name at the top of the screen so then
// it looks similar to the current layout where the Nova icon is the main
// focus." Voice.jsx hands over to this under `summary` only.
//
// The thread IS the page, newest at the foot, and it opens on the first line
// he has not seen. At rest the head is his name and his state in words, and
// no core (30 Sep, his: "The nova icon at the top of the voice screen
// shouldn't be persistent since I have the nova icon at the bottom corner. It
// should only appear if I tap on the nova name…"). The name opens FOCUS,
// since 3 Oct the full-screen Nova (src/NovaFocus.jsx, his pick after mockup
// 68: A's field for his turn, C's stage while they talk, the core in its
// state colours there), its own history entry. › opens his status and
// settings. While he
// speaks the stage rises from under the head as glass over the thread, which
// blurs and dims behind it, and settles into the thread as a card when he
// finishes. One composer.
// The tab bar's Nova button is the one talk control, and on this page it opens
// this page's microphone. Everything drawn comes from valsNovaThread.js;
// nothing here computes a fact or writes a thing except through it.

const SEEN_KEY = 'novaos.threadSeenAt';
const readSeen = () => { try { const n = Number(localStorage.getItem(SEEN_KEY)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; } };
const writeSeen = (t) => { if (!Number.isFinite(t)) return; try { if ((readSeen() || 0) < t) localStorage.setItem(SEEN_KEY, String(t)); } catch { /* private mode */ } };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function NovaThread({ v }) {
  const T = v.novaThread;
  const takes = useKeptTakes();
  const rootRef = useRef(null);
  const headRef = useRef(null);
  const fieldRef = useRef(null);
  const mainRef = useRef(null);
  const firstPaint = useRef(true);
  // THE FULL-SCREEN NOVA (3 Oct): open while its history entry is current
  // (a focus left open on an entry he has since navigated away from never
  // draws, not even for the frame before syncFocus closes it)
  const focus = !!T.focus && (typeof window === 'undefined' || window.history.state?.novaOverlay === 'novafocus');
  const [statusOpen, setStatusOpen] = useState(false);
  const [held, setHeld] = useState(null);            // { kind: 'line'|'take', i|id, rect }
  const [tuckedKey, setTuckedKey] = useState(null);  // the stage he tucked early (this reply only)
  const [replay, setReplay] = useState(null);        // { panels, idx } — a settled stage shown again
  const [sheet, setSheet] = useState(null);          // { card, originEl }
  const [retrying, setRetrying] = useState(null);    // the take being resent
  const [typingFor, setTypingFor] = useState(null);  // Type it: the take his typed words replace
  const [listenSince, setListenSince] = useState(0);
  const wasAtFoot = useRef(true);

  // ---- the microphone: the classic Voice screen's wiring, plus the take ----
  const inputRef = useRef('');
  inputRef.current = T.composer.value;
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
      onTurnEnd: (info) => { v.noteTurnHeard?.(info.heard); reportTurnEnd('voice', v.voiceHold, info); },
      // KEPT, NOT LOST (decided 29 Sep): a recording the Mac could not write
      // down stays in the thread as his own bubble, and Try again resends it
      keepFailed: true,
      onKept: (raw) => keepTake(raw),
    },
  );
  const dictRef = useRef(dict);
  dictRef.current = dict;
  useEffect(() => { v.reportScreenMic?.(dict.on); if (dict.on) setListenSince(Date.now()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dict.on]);
  useEffect(() => () => v.reportScreenMic?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (v.voiceAutoListenTick > 0 && (v.convMode || v.replyListen) && !v.convPaused && dictRef.current.supported && !dictRef.current.on) {
      v.stopSpeaking();
      dictRef.current.toggle();
      v.consumeReplyListen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.voiceAutoListenTick]);

  // one gesture, everything it needs (as the classic core): unlock audio
  // inside the tap, stop him mid-sentence, open the mic in conversation mode
  const startTalking = () => {
    v.primeSpeech();
    if (dictRef.current.on) { dictRef.current.toggle(); return; }
    v.stopSpeaking();
    v.resumeConv();
    if (!v.convMode) v.toggleConvMode(); else dictRef.current.toggle();
  };
  const talkRef = useRef(startTalking);
  talkRef.current = startTalking;
  // the tab bar's Nova button calls this inside its own tap
  useEffect(() => {
    T.registerTalk(() => talkRef.current());
    return () => T.registerTalk(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // FOCUS FROM OUTSIDE (30 Sep): novaThread.enterFocus lets the dock (a hold
  // on its Nova) bring the full screen up, the same as the name. A focus left
  // open on an entry he has since navigated away from closes on arrival.
  useEffect(() => {
    T.syncFocus();
    T.registerFocus(() => T.openFocus());
    return () => T.registerFocus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // BACK TO THE THREAD: the sentence he watched is his newest line, at the
  // foot; the full screen is held one beat longer while the core folds back
  // into the name and the field fades (cut under reduced motion)
  // (held in the same render the focus closes, so the full screen is never
  // unmounted and remounted on the way out)
  const [fxShown, setFxShown] = useState(focus);
  if (focus && !fxShown) setFxShown(true);
  useEffect(() => {
    if (focus || !fxShown) return undefined;
    const m = mainRef.current;
    if (m) m.scrollTop = m.scrollHeight;
    wasAtFoot.current = true;
    // (a dev build's recorder can stretch it, as the island's __islandSlow does)
    const slow = (import.meta.env?.DEV && typeof window !== 'undefined' && Number(window.__fxSlow)) || 1;
    const id = setTimeout(() => setFxShown(false), reduced() ? 0 : 460 * slow);
    return () => clearTimeout(id);
  }, [focus, fxShown]);

  // ---- the state, once, in words and a shape ----
  const failed = failedLast(T.lines, takes);
  const S = stateOf({
    listening: dict.on, blind: dict.blind, hearing: dict.hearing || !!retrying,
    busy: T.busy, speaking: T.speaking, offline: T.offline, demo: T.demo, failed, lastReplyAt: T.lastReplyAt,
  });

  // ---- the stage: live while he speaks, or a replay of a settled one ----
  const live = T.stage && T.stage.key !== tuckedKey ? T.stage : null;
  useEffect(() => { if (!T.stage) setTuckedKey(null); }, [T.stage]);
  useEffect(() => {
    if (!replay) return undefined;
    const iv = setTimeout(() => {
      setReplay((r) => (r && r.idx + 1 < r.panels.length ? { ...r, idx: r.idx + 1 } : null));
    }, 3200);
    return () => clearTimeout(iv);
  }, [replay]);
  // a replayed light carries the words that named it (kept on the snapshot)
  // and keeps its panel's key, so stepping through the lights relights one
  // panel rather than raising it again
  const replayHero = replay ? replay.panels[replay.idx] : null;
  const replayStage = replay ? {
    hero: replayHero, n: replay.idx + 1, total: replay.panels.length,
    key: replayHero?.hostKey ? `replay:${replayHero.hostKey}` : `replay:${replay.idx}`,
    line: replayHero?.said ? { lit: replayHero.said, later: '' } : null,
    mark: replayHero?.lit ? { name: replayHero.lit.name, hue: replayHero.lit.hue } : null,
    finder: replayHero?.finder ? { words: replayHero.finder, hue: replayHero.hue } : null,
  } : null;
  const shown = live || replayStage;
  // leaving: the stage that just ended is held one beat longer, fading up
  // into the head, so the card that settles into the thread reads as it
  const [leaving, setLeaving] = useState(null);
  const lastShown = useRef(null);
  useEffect(() => {
    if (shown) { lastShown.current = shown; return undefined; }
    if (!lastShown.current || reduced()) { lastShown.current = null; return undefined; }
    setLeaving(lastShown.current);
    lastShown.current = null;
    const id = setTimeout(() => setLeaving(null), 220);
    return () => clearTimeout(id);
  }, [shown]);

  // ---- the rows ----
  const tk = useMemo(() => takes.map((t) => ({ ...t, time: clock(t.at) })), [takes]);
  const rows = useMemo(() => threadRows(T.lines, { takes: tk, nameOf: T.nameOf }), [T.lines, tk, T.nameOf]);
  const unseen = useMemo(() => firstUnseenIndex(T.lines, readSeen()), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- opening: at the first line he has not seen, else at the foot ----
  const atFoot = () => { const m = mainRef.current; return !m || m.scrollHeight - m.scrollTop - m.clientHeight < 96; };
  useLayoutEffect(() => {
    const m = rootRef.current?.closest('main');
    mainRef.current = m;
    if (!m) return;
    let target = unseen >= 0 ? rootRef.current.querySelector(`[data-line="${unseen}"]`) : null;
    // the door or day marker just above it opens with it (D · 8: the marker at the top)
    while (target?.previousElementSibling?.classList.contains('nv-nt-day')) target = target.previousElementSibling;
    if (target) {
      const headBottom = headRef.current?.getBoundingClientRect().bottom || 0;
      m.scrollTop = Math.max(0, m.scrollTop + target.getBoundingClientRect().top - headBottom - 16);
      wasAtFoot.current = false;
    } else {
      m.scrollTop = m.scrollHeight;
    }
    firstPaint.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the stage rail sits at the head's foot, whatever height the head is
  useLayoutEffect(() => {
    const h = headRef.current;
    const root = rootRef.current;
    if (!h || !root || typeof ResizeObserver === 'undefined') return undefined;
    const put = () => root.style.setProperty('--nt-headh', `${Math.round(h.getBoundingClientRect().height)}px`);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(h);
    return () => ro.disconnect();
  }, []);
  // a new line lands at the foot while he is there: stay with it (never on
  // the first paint, which the opening above has already placed)
  const count = rows.length;
  const lastCount = useRef(count);
  useLayoutEffect(() => {
    const m = mainRef.current;
    if (count === lastCount.current) return;
    lastCount.current = count;
    if (m && wasAtFoot.current) m.scrollTo({ top: m.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' });
  }, [count]);
  useEffect(() => {
    const m = mainRef.current;
    if (!m) return undefined;
    const onScroll = () => {
      wasAtFoot.current = atFoot();
      if (wasAtFoot.current) writeSeen(T.newestAt);
    };
    // (the full screen covers the page and has its own ways back: the ⌄, a
    // tap outside the plate, a swipe up on the peek, the edge swipe)
    m.addEventListener('scroll', onScroll, { passive: true });
    return () => { m.removeEventListener('scroll', onScroll); };
  }, [T.newestAt]);
  useEffect(() => () => { if (wasAtFoot.current) writeSeen(T.newestAt); }, [T.newestAt]);

  // ---- the kept recording: Try again, Type it ----
  const retry = async (t) => {
    if (retrying) return;
    setRetrying(t.id);
    const r = await dictRef.current.resend(t);
    setRetrying(null);
    if (r.ok) dropTake(t.id);
    else if (r.reason !== 'busy' && r.reason !== 'gone') patchTake(t.id, { reason: r.reason, tries: (t.tries || 1) + 1 });
  };
  const typeIt = (t) => { setTypingFor(t.id); requestAnimationFrame(() => fieldRef.current?.focus()); };
  const send = (text) => {
    const words = String(text ?? T.composer.value ?? '').trim();
    if (!words && !(T.composer.attach?.pending || []).length) return;
    T.composer.send(text);
    // his typed words replace the recording he chose to type out
    if (typingFor) { dropTake(typingFor); setTypingFor(null); }
  };

  const openSheet = (card, originEl) => { if (card) setSheet({ card, originEl }); };
  const lineAt = (i) => T.lines[i];

  // ---- the hold menu ----
  const holdLine = (i) => ({ target }) => {
    const m = lineAt(i);
    if (!m || m.who !== 'nova' || !m.text) return;
    setHeld({ kind: 'line', i, rect: target.getBoundingClientRect() });
  };
  const holdTake = (id) => ({ target }) => setHeld({ kind: 'take', id, rect: target.getBoundingClientRect() });

  const stateLine = (
    <p className="nv-nt-state" role="status" data-state={S.key}>
      <Glyph k={S.key} /><b>{S.word}</b>{S.hint ? <span>· {S.hint}</span> : null}
    </p>
  );

  return (
    <div ref={rootRef} className={`nv-nt${focus ? ' focus' : ''}${v.isMobile ? ' mob' : ''}`} data-screen-label="Voice">
      <header ref={headRef} className="nv-nt-head">
        {/* the head is his name and state, no core: at rest the tab bar's
            Nova is the one orb on screen, and in focus the full screen has it */}
        <div className="nv-nt-who">
          {/* HIS AMENDMENT: the name opens the focus, now the full screen */}
          <button type="button" className="nv-nt-name" onClick={() => (focus ? T.closeFocus() : T.openFocus())} aria-pressed={focus}
            aria-label={focus ? 'Nova. Back to the conversation' : 'Nova. Full screen'}>Nova</button>
          <button type="button" className="nv-nt-more" onClick={() => setStatusOpen(true)} aria-label="Nova’s status and settings"><Ico name="right" /></button>
        </div>
        {stateLine}
      </header>
      {/* THE STAGE RISES FROM UNDER THE HEAD, but is not inside it: the head
          is glass (a backdrop root), and glass nested in glass can only blur
          the head, never the thread it floats over. A zero-height sticky rail
          pins it to the head's foot without taking room in the thread. */}
      {/* THE THREAD STEPS BACK while the stage is up (30 Sep, his: "the
          background should be blurred so the amount of visible information
          on screen is focused and not overwhelming"): a blur and a light
          dim over the thread, under the head, the stage and the composer,
          which stay usable. A tap on it tucks the stage, as ⌃ does. */}
      {(shown || leaving) && !focus && (
        <div className={`nv-nt-stagedim${!shown ? ' leaving' : ''}`} aria-hidden="true"
          onClick={() => { if (live) setTuckedKey(live.key); else setReplay(null); }} />
      )}
      <div className="nv-nt-stagerail">
        {shown && !focus && (
          <Stage s={shown} replay={!live} onOpen={openSheet}
            onTuck={() => { if (live) setTuckedKey(live.key); else setReplay(null); }} />
        )}
        {!shown && leaving && !focus && <Stage s={leaving} leaving onOpen={() => {}} onTuck={() => {}} />}
      </div>

      <div className="nv-nt-thread">
        {rows.length === 0 && !T.busy && (
          <p className="nv-nt-empty">Ask about anything in your vault: training, fuel, notes, the week. Answers come from what is actually written.</p>
        )}
        {rows.map((r) => {
          if (r.type === 'day') return <span key={r.key} className="nv-nt-day">{r.text}</span>;
          if (r.type === 'door') return <span key={r.key} className="nv-nt-day door"><Ico name="nova" />{r.text}</span>;
          if (r.type === 'take') {
            const t = tk.find((x) => x.id === r.id);
            if (!t) return null;
            return <TakeRow key={r.key} t={t} busy={retrying === t.id} onRetry={() => retry(t)} onType={() => typeIt(t)} onHold={holdTake(t.id)} />;
          }
          return <Line key={r.key} i={r.i} m={lineAt(r.i)} fresh={!firstPaint.current} onHold={holdLine(r.i)} onOpen={openSheet}
            onReplay={(panels) => setReplay({ panels, idx: 0 })} />;
        })}
        {T.busy && !T.lines.some((m) => m.streaming) && (
          <div className="nv-nt-think" role="status">
            <span className="nv-nt-meta"><Glyph k="thinking" />Reading your vault</span>
            <span className="nv-nt-skel" style={{ width: '92%' }} /><span className="nv-nt-skel" style={{ width: '64%' }} />
          </div>
        )}
        {T.close && <CloseCard c={T.close} onTalk={startTalking} />}
        {T.offline && (
          <div className="nv-nt-offl" role="status">
            <Ico name="cloudoff" />
            <span><b>Offline</b><span>Nova answers from your Mac, and it isn’t reachable. The thread above is what this phone last had.</span></span>
          </div>
        )}
      </div>

      {/* PROVENANCE SEAM (not built here): the bench over the composer */}
      {T.bench && <div className="nv-nt-bench" data-seam="bench" />}

      {T.blocked && (
        <div className="nv-nt-strip" role="alert">
          <button type="button" className="pb" onClick={T.blocked.replay} aria-label="Play what Nova said"><Ico name="play" /></button>
          <span className="sx"><b>Tap to hear</b>{T.blocked.message}</span>
          {T.blocked.dismiss && <button type="button" className="x" onClick={T.blocked.dismiss} aria-label="Dismiss"><Ico name="x" /></button>}
        </div>
      )}

      <Composer T={T} dict={dict} since={listenSince} fieldRef={fieldRef} onSend={send} typingFor={typingFor} />

      {fxShown && (
        <NovaFocus T={T} S={S} dict={dict} since={listenSince} leaving={!focus} onTalk={startTalking} onOpen={openSheet} />
      )}

      {statusOpen && <StatusSheet T={T} dict={dict} S={S} onClose={() => setStatusOpen(false)} />}
      {held && <HoldMenu held={held} T={T} takes={tk} onClose={() => setHeld(null)}
        onReplay={(panels) => { setHeld(null); setReplay({ panels, idx: 0 }); }} />}
      {sheet && (
        <GlassSheet originEl={sheet.originEl} onClose={() => setSheet(null)} label={sheet.card.label || 'Panel'}>
          <div className="nv-nt-sheetbody"><StageCard card={sheet.card} face="summary" /></div>
        </GlassSheet>
      )}
    </div>
  );
}

// ------------------------------------------------------------ a line --

function Line({ i, m, fresh, onHold, onOpen, onReplay }) {
  const lp = useLongPress(m?.who === 'nova' && m.text ? onHold : null);
  if (!m) return null;
  const meta = [m.time, m.where].filter(Boolean).join(' · ');
  if (m.who === 'you') {
    return (
      <>
        {m.attached?.length > 0 && (
          <div className="nv-nt-thumbs" data-line={i}>
            {m.attached.map((a, k) => (a.thumb ? <img key={k} src={a.thumb} alt="" /> : <span key={k} className="vid">{a.kind === 'file' ? 'File' : 'Video'} · {a.name}</span>))}
          </div>
        )}
        <div className={`nv-nt-you${fresh ? ' in' : ''}`} data-line={i}>{m.text}</div>
        {meta && <span className="nv-nt-meta r">{meta}</span>}
      </>
    );
  }
  if (m.who === 'system') {
    return (
      <div className="nv-nt-fail slim" role="alert" data-line={i}>
        <span className="bang" aria-hidden="true"><Ico name="bang" /></span>
        <span><span>{m.text}</span>{meta && <span className="nv-nt-meta">{meta}</span>}</span>
      </div>
    );
  }
  return (
    <>
      <div className={`nv-nt-nova${fresh ? ' in' : ''}`} data-line={i} {...lp}>
        {m.agent && <span className="nv-nt-agent">{m.agent}</span>}
        {/* PROVENANCE SEAM (not built here): renders only when a row carries by/from */}
        {m.byline && <span className="nv-nt-by" data-seam="byline">{[m.byline.by, m.byline.from].filter(Boolean).join(' · ')}</span>}
        <div className="nv-nt-say"><TypeText text={m.text} active={m.typing} /></div>
      </div>
      {meta && !m.streaming && <span className="nv-nt-meta">{meta}</span>}
      {m.panel && <SafeVisual what={`panel:${m.panel.type}`} resetKey={m.at}><div className="nv-nt-vpanel"><VoicePanel panel={m.panel} /></div></SafeVisual>}
      {m.settled && <Settled st={m.settled} time={m.time} onOpen={onOpen} onReplay={() => onReplay(m.settled.panels)} />}
      {m.notice && (
        <p className="nv-nt-routed">Started as {m.notice.label.toLowerCase()}: {m.notice.why}
          <button type="button" onClick={m.notice.undo}>Just answer it</button></p>
      )}
      {m.evidence && (
        <button type="button" className="nv-nt-erow" onClick={m.evidence.open}>
          <Ico name="chart" /><span className="t">{m.evidence.label}</span><span className="s">Evidence <Ico name="right" /></span>
        </button>
      )}
      {m.research && <Research r={m.research} at={m.at} />}
      {m.acted && (
        <div className="nv-nt-receipt">
          <span className="ok"><Ico name="check" /></span>
          <span className="rx"><b>{m.acted.title}</b><span>{m.acted.status === 'undone' ? 'Undone' : 'Done on your word · Undo lives here and in the Inbox'}</span></span>
          {m.acted.undo ? <button type="button" className="nv-nt-undo" onClick={m.acted.undo}>Undo</button> : <span />}
        </div>
      )}
      {m.proposal && <Proposal p={m.proposal} />}
      {m.planReport && <PlanReport r={m.planReport} time={m.time} />}
    </>
  );
}

function TakeRow({ t, busy, onRetry, onType, onHold }) {
  const lp = useLongPress(onHold);
  return <KeptTake t={t} busy={busy} onRetry={onRetry} onType={onType} onHold={lp} />;
}

function Research({ r, at }) {
  if (r.status === 'done') return <SafeVisual what="sources" resetKey={at}><div className="nv-nt-vpanel"><SourcesPanel r={r} /></div></SafeVisual>;
  if (r.status === 'error') {
    return <div className="nv-nt-fail slim" role="alert"><span className="bang" aria-hidden="true"><Ico name="bang" /></span><span><b>Research didn’t complete</b><span>{r.error || 'The Inbox has the record.'}</span></span></div>;
  }
  return (
    <div className="nv-nt-job" role="status">
      {r.status === 'running' ? <span className="spin" aria-hidden="true" /> : <Ico name="moon" />}
      <span className="rx"><b>{r.status === 'running' ? 'Researching' : 'Queued for tonight'}{r.question ? `: ${r.question}` : ''}</b>
        <span>{r.status === 'running' ? 'lands here and in your Inbox' : 'the brief lands in your Inbox by morning'}</span></span>
    </div>
  );
}

// a proposal: the Coach deck's card, gold only while it waits on his call
function Proposal({ p }) {
  const waiting = p.status === 'pending';
  return (
    <div className={`nv-nt-decide${waiting ? '' : ' done'}`}>
      <div className="dk"><span>{waiting ? 'Waiting on you' : p.status === 'done' ? 'Done' : p.replaced ? 'Replaced' : p.status === 'error' ? 'Still in the Inbox' : 'Left'}</span></div>
      <p className="say">{p.title}</p>
      {waiting ? (
        <div className="answer">
          <button type="button" className="yes" onClick={p.approve}><Ico name="check" />Yes, do it</button>
          <button type="button" className="no" onClick={p.dismiss} aria-label="No, leave it"><Ico name="x" /></button>
        </div>
      ) : (
        <p className="nv-nt-meta">{p.status === 'done' ? 'Undo lives in your Inbox' : p.replaced ? 'Replaced by your correction' : p.status === 'error' ? 'Still pending in your Inbox' : 'Dismissed'}</p>
      )}
    </div>
  );
}

function PlanReport({ r, time }) {
  if (r.status === 'error') {
    return <div className="nv-nt-fail slim" role="alert"><span className="bang" aria-hidden="true"><Ico name="bang" /></span><span><b>The plan didn’t finish</b><span>The Inbox has what came back.</span></span>
      <div className="nv-nt-btnrow"><button type="button" className="nv-nt-qbtn" onClick={r.openInbox}>Open Inbox</button></div></div>;
  }
  return (
    <div className="nv-sum-card nv-nt-report">
      <span className="nv-nt-meta">Your plan came back{time ? ` · ${time}` : ''}</span>
      <div className="nv-nt-btnrow">
        <button type="button" className="nv-nt-qbtn" onClick={r.walk}>Walk me through it</button>
        <button type="button" className="nv-nt-qbtn" onClick={r.coach}>To the Coach</button>
        {r.status === 'kept' ? <span className="nv-nt-meta"><Ico name="check" />Kept in your vault</span>
          : <button type="button" className="nv-nt-qbtn" onClick={r.keep} disabled={!r.keep}>{r.status === 'keeping' ? 'Keeping…' : 'Keep in vault'}</button>}
      </div>
    </div>
  );
}

// THE CLOSE: the brief's live question, the Coach deck's card, gold because
// it waits on his call. Talk opens the mic; a spoken yes, no or later files it.
function CloseCard({ c, onTalk }) {
  return (
    <div className="nv-nt-decide" role="group" aria-label="Waiting on you">
      <div className="dk"><span>Waiting on you</span><span className="n">{c.idx} of {c.total}</span></div>
      {c.label && <span className="nv-nt-meta">{c.label}</span>}
      <p className="say">{c.question}</p>
      <div className="answer">
        <button type="button" className="yes" onClick={c.yes}><Ico name="check" />Yes</button>
        <button type="button" className="q" onClick={c.later}>Later</button>
        <button type="button" className="q" onClick={onTalk}><Ico name="mic" />Talk</button>
        <button type="button" className="no" onClick={c.no} aria-label="No"><Ico name="x" /></button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ composer --

function Composer({ T, dict, since, fieldRef, onSend, typingFor }) {
  const C = T.composer;
  const [text, setText] = useState(C.value);
  useEffect(() => { setText(C.value); }, [C.value]);
  const route = text.trim() ? C.route(text) : null;
  const pending = C.attach?.pending || [];
  const canSend = !!(text.trim() || pending.length);
  if (dict.on) {
    return (
      <div className="nv-nt-composer listening">
        <Meter since={since} />
        <button type="button" className="nv-nt-stop" onClick={dict.toggle}>Send now</button>
      </div>
    );
  }
  return (
    <div className={`nv-nt-composer${C.offline ? ' off' : ''}`}>
      {pending.length > 0 && (
        <div className="nv-nt-pending">
          {pending.map((p, i) => (
            <span key={i} className="nv-nt-att">
              {p.thumb ? <img src={p.thumb} alt="" /> : <span className="vid">{p.kind === 'file' ? 'File' : 'Video'}</span>}
              <button type="button" onClick={p.remove} aria-label={`Remove ${p.name || 'this attachment'}`}><Ico name="x" /></button>
            </span>
          ))}
          <span className="nv-nt-meta">rides with your next question</span>
        </div>
      )}
      <div className="nv-nt-bar">
        <label className="nv-nt-plus" aria-label="Attach a photo, a video or a file">
          <Ico name="plus" />
          <input type="file" accept="image/*,video/*,application/pdf,text/plain,text/markdown,text/csv,.pdf,.txt,.md,.csv" multiple disabled={!C.attach || C.attach.busy || C.offline}
            onChange={(e) => { C.attach?.pick(e.target.files); e.target.value = ''; }} />
        </label>
        {/* the route label and the field share one box: it names where the
            words will go, beside the words (audit finding 2) */}
        <div className="nv-nt-field">
          {route && <span className="nv-nt-route" title={route.why}>→ {route.label}</span>}
          <LocalInput ref={fieldRef} value={C.value}
            onChange={(t) => { setText(t); C.setTyped(t); }}
            onSubmit={(t) => onSend(t)}
            onInput={(e) => setText(e.target.value)}
            autoCorrect="on" autoCapitalize="sentences" spellCheck enterKeyHint="send"
            disabled={C.offline}
            aria-label="Message Nova"
            placeholder={C.offline ? 'Reconnect to ask Nova' : typingFor ? 'Type what you said' : pending.length ? 'Ask about what you attached' : 'Type, or tap Nova to talk'} />
        </div>
        {canSend ? (
          <button type="button" className="nv-nt-send" onClick={() => onSend(fieldRef.current?.value ?? text)} aria-label="Send"><Ico name="up" /></button>
        ) : <span />}
      </div>
    </div>
  );
}

// ------------------------------------------------ status and settings --

// What the classic Station, ⋯ and chips held: status first (answers, voice,
// microphone), then the switches and the doors. An aria-modal root that
// closes on its own backdrop, so the back swipe can take it.
function StatusSheet({ T, dict, S, onClose }) {
  const s = T.status;
  const mic = !dict.supported ? 'Not available here' : dict.on ? 'Listening' : dict.hearing ? 'Writing it down' : 'Ready';
  const go = (fn) => () => { onClose(); fn?.(); };
  return (
    <div role="dialog" aria-modal="true" aria-label="Nova: status and settings" className="nv-nt-sheetroot" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <div className="nv-nt-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="grab" aria-hidden="true" />
        <div className="nv-nt-shead">
          <b>Nova</b>
          <span><Glyph k={S.key} />{S.word}</span>
          <button type="button" className="nv-nt-tuck" data-edge-close onClick={onClose} aria-label="Close"><Ico name="x" /></button>
        </div>
        <div className="nv-nt-group">
          <div className="nv-nt-stat"><span>Answers</span><b>{s.answers}</b></div>
          <div className="nv-nt-stat"><span>Voice</span><b>{s.engine}</b></div>
          {s.engineDetail && <p className="nv-nt-note">{s.engineDetail}</p>}
          <div className="nv-nt-stat"><span>Microphone</span><b>{mic}</b></div>
        </div>
        <div className="nv-nt-group">
          {s.heyNova && (
            <button type="button" className="nv-nt-mi" role="switch" aria-checked={s.heyNova.on} onClick={() => s.heyNova.set(!s.heyNova.on)}>
              <Ico name="mic" /><span>“Hey Nova”</span><span className={`nv-nt-sw${s.heyNova.on ? ' on' : ''}`} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="nv-nt-mi" onClick={go(s.briefMe)}><Ico name="brief" /><span>Brief me</span><span className="v" /></button>
          {s.ritual && <button type="button" className="nv-nt-mi" onClick={go(s.ritual.start)}><Ico name="sun" /><span>{s.ritual.label}</span><span className="v" /></button>}
          {s.ambient && <button type="button" className="nv-nt-mi" onClick={go(s.ambient)}><Ico name="moon" /><span>Ambient</span><span className="v">full screen</span></button>}
          {s.undoNewChat ? (
            <button type="button" className="nv-nt-mi" onClick={go(s.undoNewChat.run)}><Ico name="retry" /><span>{s.undoNewChat.label}</span><span className="v">bring it back</span></button>
          ) : s.newChat ? (
            <button type="button" className="nv-nt-mi" onClick={go(s.newChat)}><Ico name="compose" /><span>New chat</span><span className="v">the record keeps it</span></button>
          ) : null}
          {s.endBrief && <button type="button" className="nv-nt-mi" onClick={go(s.endBrief)}><Ico name="x" /><span>End the brief</span><span className="v" /></button>}
          <button type="button" className="nv-nt-mi" onClick={go(s.settings)}><Ico name="gear" /><span>Voice settings</span><span className="v">hearing, pauses, voice</span></button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ hold menu --

// HOLD A LINE (decided 29 Sep: Remember leaves the page for this). The line
// lifts over the dimmed thread and the menu grows from it: Remember (via the
// Inbox), Play again, Replay the stage (when it showed panels), Copy. A kept
// recording's menu: Try again lives on its card; here, Delete.
function HoldMenu({ held, T, takes, onClose, onReplay }) {
  const [copied, setCopied] = useState(false);
  const m = held.kind === 'line' ? T.lines[held.i] : null;
  const t = held.kind === 'take' ? takes.find((x) => x.id === held.id) : null;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const below = held.rect.bottom < vh * 0.55;
  const top = below ? Math.min(held.rect.top, vh * 0.45) : Math.max(96, held.rect.top - 230);
  const copy = () => {
    const done = () => { setCopied(true); setTimeout(onClose, 500); };
    try { navigator.clipboard.writeText(m.text).then(done, done); } catch { done(); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Line actions" className="nv-nt-holdroot" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 101 }}>
      <div className="nv-nt-lift" style={{ top }} onClick={(e) => e.stopPropagation()}>
        {m && <div className="nv-nt-held">{m.text.length > 280 ? `${m.text.slice(0, 280)}…` : m.text}</div>}
        {t && <div className="nv-nt-held r">Your recording · {t.time}</div>}
        <div className={`nv-nt-cmenu${below ? '' : ' up'}`} role="menu">
          {m?.remember && <button type="button" role="menuitem" className="nv-nt-mi" onClick={() => { m.remember(); onClose(); }}><Ico name="tray" /><span>Remember</span><span className="v">via Inbox</span></button>}
          {m?.playAgain && <button type="button" role="menuitem" className="nv-nt-mi" onClick={() => { m.playAgain(); onClose(); }}><Ico name="speaker" /><span>Play again</span><span className="v" /></button>}
          {m?.settled && <button type="button" role="menuitem" className="nv-nt-mi" onClick={() => onReplay(m.settled.panels)}><Ico name="stage" /><span>Replay the stage</span><span className="v">{m.settled.count}</span></button>}
          {m && <button type="button" role="menuitem" className="nv-nt-mi" onClick={copy}><Ico name={copied ? 'check' : 'copy'} /><span>{copied ? 'Copied' : 'Copy'}</span><span className="v" /></button>}
          {t && <button type="button" role="menuitem" className="nv-nt-mi danger" onClick={() => { dropTake(t.id); onClose(); }}><Ico name="trash" /><span>Delete recording</span><span className="v">from this phone</span></button>}
        </div>
      </div>
    </div>
  );
}
