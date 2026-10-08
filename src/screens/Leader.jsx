import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '../leader.css';
import { Face, Ico } from '../leaderFaces.jsx';
import { agentName, agentThe, agentHue } from '../leaderAgents.js';
import { leaderOrder, minuteOfDay, daysWords } from '../leaderOrder.js';
import { clockLabel, hhmm, dateWords, countWord, countWordLower, ageDays, readReply } from '../vals/leaderPage.js';
import { useDictation } from '../useDictation.js';
import { useSheetDrag } from '../useSheetDrag.js';
import { haptic } from '../haptics.js';

// THE LEADER, BLEND 1 ("Now, then the rest"). His pick, 9 Oct 2026:
// "Go with blend 1. Unread replies from the leader should jump to the top.
// The advice for the day should be considered to be most important because
// it is a concept that I would ideally be looking at implementing that day.
// It should be the first thing at the top in the morning and then it should
// also appear at the top within the last hour before starting my work block
// and during my work block. All other times it can revert to an open
// question or whatever else is important at the top. I like that blend one
// gives the option of seeing everything else as a row at a glance that can
// be expanded and focussed on."
//
// design/mockups/82-redesign-leader-r2.html, Blend 1 (frames x1, x2, x3);
// the acceptance contract is design/audits/redesign-2026-09/11-leader-build-
// checklist.md. From A, the overview: the Leader's face, the picture as
// beads, the honest line, one composer at the thumb, the picture rising as a
// stage. From C, the focus: ONE card holds the one thing that matters now;
// everything else waits below as rows, in order, each expanding in place.
// The round-up opens in place of the card; the conversation rises as a sheet
// with the item quoted. The order is src/leaderOrder.js, run here over the
// record and this page's own clock, so it turns as the minute does.
//
// One render for every style (the Leader has never had a cupertino branch).
// The view model is src/vals/valsLeader.js (leaderPage); the writes are
// App.jsx's leaderSetDown / leaderStillOpen / leaderUndo / leaderSeen.

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EIO = 'cubic-bezier(.77,0,.175,1)';
const EOUT = 'cubic-bezier(.23,1,.32,1)';
const ESTD = 'cubic-bezier(.32,.72,0,1)';
const ANSWER_HOLD_MS = 8000;
const ROUNDUP_OFF = 'novaos.leaderRoundupOff';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const readOff = () => { try { return localStorage.getItem(ROUNDUP_OFF) === new Date().toDateString(); } catch { return false; } };
const rectOf = (el) => (el ? el.getBoundingClientRect() : null);

// a part arriving: a rise, or a material (blur resolving); a cross-fade when motion is reduced
function arrive(el, i = 0, mat = false) {
  if (!el?.animate) return;
  const rm = reduced();
  const from = rm ? { opacity: 0 } : mat ? { opacity: 0, transform: 'translateY(8px) scale(.98)', filter: 'blur(6px)' } : { opacity: 0, transform: 'translateY(8px)' };
  const to = rm ? { opacity: 1 } : mat ? { opacity: 1, transform: 'none', filter: 'blur(0)' } : { opacity: 1, transform: 'none' };
  el.animate([from, to], { duration: rm ? 250 : 420, delay: i * (rm ? 40 : 80), easing: rm ? 'linear' : ESTD, fill: 'backwards' });
}

// ------------------------------------------------------------------ words --

// The Leader's line, said word by word when it has just arrived.
function Said({ text, say = false, className = 'nv-ld-lead', gap = 60 }) {
  const ref = useRef(null);
  const words = useMemo(() => String(text || '').split(/(\s+)/), [text]);
  useLayoutEffect(() => {
    if (!say || !ref.current) return;
    const ws = [...ref.current.querySelectorAll('.nv-ld-w')];
    const rm = reduced();
    ws.forEach((w, i) => w.animate?.([{ opacity: 0, filter: rm ? 'none' : 'blur(3px)' }, { opacity: 1, filter: 'none' }],
      { duration: rm ? 120 : 340, delay: i * (rm ? 18 : gap), easing: ESTD, fill: 'backwards' }));
  }, [say, text, gap]);
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (/\s+/.test(w) ? w : <span key={i} className="nv-ld-w">{w}</span>))}
    </p>
  );
}

// ------------------------------------------------------------------ strip --

function Bead({ k, cls = '', size }) {
  return <i className={`nv-ld-bead ${cls}`} data-bead={k || undefined} style={size ? { '--b': `${size}px` } : undefined} />;
}

// THE PICTURE AS BEADS: open, working, set down. A bead that changes group
// travels: the lit one lifts in an arc and lands in the set-down place.
function Strip({ P, asked, cur, onOpen, skipFly, stripRef }) {
  const ref = useRef(null);
  const prev = useRef(null);
  const open = P.open;
  const down = P.down.slice(0, 12);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const now = new Map();
    root.querySelectorAll('[data-bead]').forEach((el) => now.set(el.dataset.bead + '|' + el.closest('[data-g]').dataset.g, el));
    const was = prev.current;
    prev.current = new Map([...now].map(([k, el]) => [k, el.getBoundingClientRect()]));
    if (!was) return;
    for (const [k, el] of now) {
      const [key, g] = k.split('|');
      if (was.has(k)) continue;
      const from = was.get(`${key}|o`);
      if (g === 'd' && from && !skipFly.current.has(key) && !reduced()) {
        // the bead the Leader just set down lifts and lands in the set-down place
        const to = el.getBoundingClientRect();
        const fl = document.createElement('i');
        fl.className = 'nv-ld-bead asked nv-ld-flyer';
        fl.style.left = `${from.left}px`; fl.style.top = `${from.top}px`; fl.style.setProperty('--b', `${from.width}px`);
        root.appendChild(fl);
        el.classList.add('hold');
        const lift = Math.min(from.top, to.top) - 26;
        fl.animate([
          { transform: 'translate(0,0) scale(1)' },
          { transform: `translate(${(to.left - from.left) * 0.5}px,${lift - from.top}px) scale(1.5)`, offset: 0.45 },
          { transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(1)` },
        ], { duration: 820, easing: EIO, fill: 'forwards' }).finished.catch(() => {}).then(() => { fl.remove(); el.classList.remove('hold'); });
      } else if (!reduced()) {
        el.animate?.([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: g === 'd' ? 0 : 260, easing: ESTD, fill: 'backwards' });
      }
      skipFly.current.delete(key);
    }
  });
  const label = `The picture: ${open.length ? countWordLower(open.length) : 'nothing'} open, ${countWordLower(P.working.length)} working, ${P.downCount ? countWordLower(P.downCount) : 'none'} set down. Open it`;
  return (
    <button type="button" ref={(el) => { ref.current = el; if (stripRef) stripRef.current = el; }} className="nv-ld-strip nv-ld-card nv-ld-pr" data-enter="" aria-label={label} onClick={onOpen}>
      <span className="nv-ld-sg" data-g="o">
        <span className="nv-ld-sn">{open.length ? <><b>{open.length}</b>open</> : 'Nothing open'}</span>
        <span className="nv-ld-beads">{open.map((o) => <Bead key={o.key} k={o.key} cls={o.key === cur ? 'cur' : o.key === asked ? 'asked' : o.checkedToday ? 'kp' : ''} />)}</span>
      </span>
      <span className="nv-ld-sg" data-g="w">
        <span className="nv-ld-sn"><b>{P.working.length}</b>working</span>
        <span className="nv-ld-beads">{P.working.slice(-12).map((w) => <Bead key={w.key} k={w.key} cls="wk" />)}</span>
      </span>
      <span className="nv-ld-sg" data-g="d">
        <span className="nv-ld-sn">{P.downCount ? <><b>{P.downCount}</b>set down</> : 'Set down'}</span>
        <span className="nv-ld-beads">{down.length ? down.map((d) => <Bead key={d.key} k={d.key} cls="tied" />) : <Bead cls="d" />}</span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ items --

const qOrb = (rip) => <span className={`nv-ld-qorb${rip ? ' rip' : ''}`}><Ico k="q" /></span>;

// What a row shows at a glance: a glyph that carries the item's form, a title, a sub line.
function rowOf(key, P, R) {
  if (key === 'idea') return { glyph: <span className="nv-ld-gidea">&#8220;</span>, title: P.today.kind, sub: P.today.title };
  if (key === 'question') return { glyph: qOrb(false), title: 'The Leader asks', sub: [P.question.sinceWords && cap(P.question.sinceWords), P.question.aboutName].filter(Boolean).join(' · ') || P.question.text };
  if (key === 'reply') return { glyph: <Face who="leader" size={28} />, title: 'The Leader replied', sub: P.reply.lead, dot: true };
  if (key === 'roundup') return { glyph: <span className="nv-ld-gpic" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</span>, title: 'The round-up', sub: `${countWord(P.open.length)} open · oldest first` };
  if (key === 'answered') return { glyph: <Face who="leader" size={28} />, title: 'The Leader', sub: P.answered?.ack || '' };
  if (key === 'conversation') {
    return {
      glyph: <Face who="leader" size={28} work={P.busy} />, title: 'The conversation',
      sub: P.busy ? 'The Leader is answering' : ['Earlier ideas inside', P.lastTalkWords].filter(Boolean).join(' · '),
    };
  }
  if (key.startsWith('receipt:')) {
    const rc = R.get(key.slice(8));
    if (!rc) return null;
    const what = rc.resolved?.length ? 'Set down' : 'Added to what works';
    const name = (rc.resolved?.[0] && shortOf(P, rc.resolved[0])) || (rc.working?.[0] && shortOf(P, rc.working[0])) || '';
    return { glyph: <Bead cls="tied" />, title: what, sub: `${name}${name ? ' · ' : ''}${hhmm(new Date(rc.at))}`, undo: rc };
  }
  return null;
}
const cap = (s) => String(s || '').replace(/^\w/, (c) => c.toUpperCase());
function shortOf(P, text) {
  const all = [...P.open, ...P.down, ...P.working];
  return all.find((x) => x.text === text)?.name || String(text).split(' ').slice(0, 5).join(' ');
}

function Receipt({ rc, P, onUndo }) {
  if (!rc) return null;
  return (
    <div className="nv-ld-rc">
      {(rc.resolved || []).map((t) => (
        <div className="r" key={`d${t}`}><span className="nv-ld-ok"><Ico k="check" /></span><span><b>Set down</b> · {shortOf(P, t)}</span>
          {rc.receiptId || rc.demo ? <button type="button" className="nv-ld-undo nv-ld-pr" onClick={() => onUndo(rc)}>Undo</button> : <span />}</div>
      ))}
      {(rc.working || []).map((t) => (
        <div className="r" key={`w${t}`}><span className="nv-ld-ok add"><Ico k="plus" /></span><span><b>Added to what works</b> · {shortOf(P, t)}</span><span /></div>
      ))}
      {(rc.struggles || []).map((t) => (
        <div className="r" key={`s${t}`}><span className="nv-ld-ok add"><Ico k="plus" /></span><span><b>Added to the picture</b> · {shortOf(P, t)}</span><span /></div>
      ))}
    </div>
  );
}

// What the one card (or an opened row) holds for an item.
function Body({ k, P, R, ui, compact = false }) {
  const { why, setWhy, talk, rip, go, notToday, undo, sayMore, read } = ui;
  if (k === 'idea' && P.today) {
    const T = P.today;
    const hasWhy = !!(T.why || T.refs.length);
    return (
      <>
        {!compact && <span className="nv-ld-k">{T.kind}{T.at ? ` · ${T.at}` : ''}</span>}
        <p className="nv-ld-ft">{T.title}</p>
        <p className="nv-ld-fl">{T.line}</p>
        {hasWhy && (
          <div className={`nv-ld-why${why ? ' open' : ''}`}><div>
            {T.why ? <p>{T.why}</p> : null}
            {T.refs.length ? <p className="nv-ld-k">From {T.refs.join(' and ')}</p> : null}
          </div></div>
        )}
        <div className="nv-ld-verbs">
          {hasWhy && <button type="button" className="nv-ld-quiet nv-ld-pr" aria-expanded={why} onClick={() => { haptic('tick'); setWhy(!why); }}>Why this</button>}
          <button type="button" className="nv-ld-quiet nv-ld-pr" onClick={() => talk({ kind: 'idea', label: 'today’s idea', title: T.title })}>Talk about it</button>
        </div>
      </>
    );
  }
  if (k === 'question' && P.question) {
    const Q = P.question;
    return (
      <>
        <div className="nv-ld-fq">
          {qOrb(rip)}
          <div>
            <span className="nv-ld-k"><b>The Leader asks</b>{Q.sinceWords ? ` · ${Q.sinceWords}` : ''}</span>
            <p>{Q.text}</p>
          </div>
        </div>
        <p className="nv-ld-fh">
          {Q.aboutName ? <>About <b>{Q.aboutName}</b>{Q.aboutDays != null ? `, open ${Q.aboutDays === 1 ? '1 day' : `${Q.aboutDays} days`}` : ''}. </> : null}
          Answer below, typed or spoken.
        </p>
      </>
    );
  }
  if (k === 'answered' && P.answered) {
    const A = P.answered;
    const rc = R.get(A.receiptId) || (A.added ? { resolved: A.added.resolved || [], working: A.added.working || [], struggles: A.added.struggles || [], receiptId: A.receiptId } : null);
    return (
      <>
        <div className="nv-ld-by"><Face who="leader" size={24} /><span className="nm">Leader</span><span className="mt">you answered · {hhmm(new Date(A.at))}</span></div>
        <Said text={A.ack} say={ui.fresh} className="nv-ld-lead" gap={55} />
        {rc && (rc.resolved?.length || rc.working?.length || rc.struggles?.length) ? <Receipt rc={rc} P={P} onUndo={undo} /> : null}
        <div className="nv-ld-verbs"><button type="button" className="nv-ld-quiet nv-ld-pr" onClick={sayMore}>Say more</button></div>
      </>
    );
  }
  if (k === 'reply' && P.reply) {
    const Rp = P.reply;
    const who = [...new Set((Rp.consult || []).map((c) => c.agent))];
    return (
      <>
        <div className="nv-ld-by">
          <span className="nv-ld-stack"><Face who="leader" size={24} />{who.map((a) => <Face key={a} who={a} size={24} />)}</span>
          <span className="nm">Leader</span>
          <span className="mt">answered · {hhmm(new Date(Rp.at))}</span>
        </div>
        <Said text={Rp.lead} className="nv-ld-lead" />
        {Rp.rest ? <p className="nv-ld-fl" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{Rp.rest}</p> : null}
        <div className="nv-ld-verbs"><button type="button" className="nv-ld-quiet nv-ld-pr" onClick={read}>Read it all</button></div>
      </>
    );
  }
  if (k === 'roundup') {
    const n = P.open.length;
    return (
      <>
        <span className="nv-ld-k">The picture · {P.lastToldDays == null ? 'nothing from you yet' : `${P.lastToldDays === 1 ? '1 day' : `${P.lastToldDays} days`} without word`}</span>
        <p className="nv-ld-ft">{countWord(n)} thing{n === 1 ? ' is' : 's are'} open. Shall we go through {n === 1 ? 'it' : 'them'}, oldest first?</p>
        <div className="nv-ld-rbeads" aria-hidden="true">{P.open.map((o, i) => <i key={o.key} className="nv-ld-bead cur" style={{ animation: reduced() ? 'none' : undefined, '--i': i }} data-rb={i} />)}</div>
        <div className="nv-ld-verbs">
          <button type="button" className="nv-ld-cap nv-ld-pr" onClick={go}>Go through {n === 1 ? 'it' : 'them'}</button>
          <button type="button" className="nv-ld-quiet nv-ld-pr" onClick={notToday}>Not today</button>
        </div>
      </>
    );
  }
  if (k === 'conversation') {
    const last = [...P.messages].reverse().find((m) => m.kind === 'leader' || m.kind === 'me');
    return (
      <>
        <div className="nv-ld-by"><Face who="leader" size={24} work={P.busy} /><span className="nm">The conversation</span><span className="mt">{P.lastTalkWords || 'nothing yet'}</span></div>
        <p className="nv-ld-fl">{last ? readReply(last.text, { clean: P.clean }).lead : 'Bring what you are facing at work, or something that worked. What you tell me steers tomorrow’s idea and Saturday’s research.'}</p>
        <div className="nv-ld-verbs"><button type="button" className="nv-ld-quiet nv-ld-pr" onClick={() => talk(null)}>Talk to the Leader</button></div>
      </>
    );
  }
  if (k.startsWith('receipt:')) {
    const rc = R.get(k.slice(8));
    return rc ? <Receipt rc={rc} P={P} onUndo={undo} /> : null;
  }
  return null;
}

// ------------------------------------------------------------------ the page --

export function Leader({ v }) {
  const P = v.leaderPage;
  if (!P) return null;
  if (!P.ready) return <LeaderWaiting demo={P.demo} onBack={v.leaderAct.back} pad={v.wrapLibrary} />;
  return <LeaderPage P={P} A={v.leaderAct} pad={v.wrapLibrary} />;
}

// Before the first read lands: the page's shape, never a blank; in demo, the truth.
function LeaderWaiting({ demo, onBack, pad }) {
  return (
    <div className="nv-ld" data-screen-label="Leader" style={pad}>
      <div className="nv-ld-col">
        <div className="nv-ld-nav"><button type="button" className="nv-ld-back nv-ld-pr" onClick={onBack}><Ico k="back" />Index</button><span /></div>
        <div className="nv-ld-head"><Face who="leader" size={40} /><div><b>Leader</b><span className="nv-ld-k">{clockLabel(new Date())}</span></div></div>
        {demo ? (
          <div className="nv-ld-focus nv-ld-card" style={{ minHeight: 0 }}>
            <span className="nv-ld-k">Demo data</span>
            <p className="nv-ld-fl">The Leader reads your picture, its daily idea and your conversation from your Mac. In demo there is nothing of yours to show, so nothing is invented here.</p>
          </div>
        ) : (
          <>
            <div className="nv-ld-sk" style={{ height: 64 }} aria-hidden="true" />
            <div className="nv-ld-sk" style={{ height: 14, width: '60%', margin: '10px auto 0' }} aria-hidden="true" />
            <div className="nv-ld-sk" style={{ height: 224, marginTop: 14, borderRadius: 24 }} aria-hidden="true" />
            <div className="nv-ld-sk" style={{ height: 56, marginTop: 18 }} aria-hidden="true" />
            <div className="nv-ld-sk" style={{ height: 56, marginTop: 6 }} aria-hidden="true" />
            <p className="nv-ld-note" role="status">Reading the Leader from your Mac</p>
          </>
        )}
      </div>
    </div>
  );
}
function LeaderPage({ P, A, pad }) {
  // the clock the rule reads: every 20 s, so a boundary is crossed within the minute
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20_000); return () => clearInterval(t); }, []);
  const [roundupOff, setRoundupOff] = useState(readOff);
  const [expanded, setExpanded] = useState(null);
  const [why, setWhy] = useState(false);
  const [sheet, setSheet] = useState(null);       // { quote } while the conversation is up
  const [stage, setStage] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState('board');      // 'board' | 'roundup'
  const [sayMore, setSayMore] = useState(false);
  const [text, setText] = useState('');
  const skipFly = useRef(new Set());
  const stripRef = useRef(null);
  const focusRef = useRef(null);
  const railRef = useRef(null);
  const rootRef = useRef(null);

  // HIS RULE: an unread reply stays on top for the visit in which he first
  // saw it, so the card does not jump away while he reads it (N3)
  const [visitUnread, setVisitUnread] = useState(() => new Set(P.reply?.unread ? [P.reply.id] : []));
  useEffect(() => {
    if (P.reply?.unread && !visitUnread.has(P.reply.id)) setVisitUnread((s) => new Set([...s, P.reply.id]));
  }, [P.reply?.id, P.reply?.unread, visitUnread]);

  const answeredFresh = !!(P.answered && now.getTime() - P.answered.at < ANSWER_HOLD_MS);
  useEffect(() => {
    if (!P.answered) return undefined;
    const left = ANSWER_HOLD_MS - (Date.now() - P.answered.at);
    if (left <= 0) return undefined;
    const t = setTimeout(() => setNow(new Date()), left + 30);
    return () => clearTimeout(t);
  }, [P.answered]);

  const R = useMemo(() => new Map(P.receipts.map((rc) => [rc.key, rc])), [P.receipts]);
  const ord = useMemo(() => leaderOrder(minuteOfDay(now), P.events, {
    answered: answeredFresh ? { fresh: true } : null,
    reply: P.reply && (P.reply.unread || visitUnread.has(P.reply.id)) ? { unread: true } : null,
    idea: !!P.today,
    question: P.question?.open ? { open: true, since: P.question.sinceWords } : null,
    daysQuiet: P.lastToldDays,
    openCount: P.open.length,
    roundupOff,
    receipts: P.receipts.filter((rc) => rc.kind !== 'answer' || !answeredFresh).map((rc) => ({ key: rc.key })),
  }), [now, P, answeredFresh, visitUnread, roundupOff]);

  // THE SEEN MARK: he has opened the Leader with that reply on top. Once; never in demo (App guards both).
  useEffect(() => {
    if (ord.now === 'reply' && P.reply?.unread) A.seen(P.reply.id);
  }, [ord.now, P.reply?.id, P.reply?.unread, A]);

  // ---------------------------------------------------------- the reshuffle
  const [shown, setShown] = useState(ord);
  const [out, setOut] = useState(false);            // the card's content blurring out
  const [swap, setSwap] = useState(false);           // the clock and the reason cross-fading
  const [rip, setRip] = useState(false);
  const flip = useRef(null);
  const ordKey = `${ord.order.join('|')}#${ord.why}`;
  const shownKey = `${shown.order.join('|')}#${shown.why}`;
  useEffect(() => {
    if (ordKey === shownKey) return undefined;
    let dead = false;
    (async () => {
      const rail = railRef.current; const focus = focusRef.current;
      const rects = new Map([...(rail?.querySelectorAll('[data-item]') || [])].map((r) => [r.dataset.item, r.getBoundingClientRect()]));
      const promoted = rail?.querySelector(`[data-item="${CSS.escape(ord.now)}"]`);
      const turned = ord.now !== shown.now;
      if (turned) { setOut(true); setSwap(true); }
      if (promoted && focus && turned) {
        if (!reduced()) {
          const a = promoted.getBoundingClientRect(), b = focus.getBoundingClientRect();
          promoted.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${b.top - a.top}px)`, opacity: 0 }], { duration: 420, easing: EIO, fill: 'forwards' });
        } else promoted.style.opacity = '0';
      }
      if (turned) await wait(reduced() ? 260 : 400);
      if (dead) return;
      flip.current = { rects, demoted: turned ? shown.now : null, focus: rectOf(focus) };
      setShown(ord);
      setExpanded((e) => (e === ord.now ? null : e));
      setWhy(false);
      requestAnimationFrame(() => { if (!dead) { setOut(false); setSwap(false); if (ord.now === 'question') { setRip(true); setTimeout(() => setRip(false), 1400); } } });
    })();
    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordKey]);
  useLayoutEffect(() => {
    const f = flip.current; flip.current = null;
    const rail = railRef.current;
    if (!f || !rail) return;
    rail.querySelectorAll('[data-item]').forEach((r) => {
      const key = r.dataset.item;
      r.style.opacity = '';
      if (reduced()) { r.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'linear' }); return; }
      const now = r.getBoundingClientRect();
      if (key === f.demoted && f.focus) {
        const dy = f.focus.top + 40 - now.top;
        r.animate([{ transform: `translateY(${dy}px) scale(.96)`, opacity: 0, filter: 'blur(4px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], { duration: 480, easing: EOUT });
      } else if (f.rects.has(key)) {
        const dy = f.rects.get(key).top - now.top;
        if (Math.abs(dy) > 1) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: EIO });
      } else {
        r.animate([{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: EOUT });
      }
    });
  }, [shown]);

  // ---------------------------------------------------------- the entrance
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    [...root.querySelectorAll('[data-enter]')].forEach((el, i) => arrive(el, i, el.dataset.enter === 'mat'));
    if (!reduced()) {
      [...root.querySelectorAll('.nv-ld-strip .nv-ld-bead')].forEach((b, i) => b.animate?.([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 260 + i * 35, easing: ESTD, fill: 'backwards' }));
    }
    if (ord.now === 'question') { setRip(true); setTimeout(() => setRip(false), 1400); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------- verbs
  const talk = useCallback((quote) => { haptic('tick'); setSheet({ quote: quote || null }); }, []);
  const notToday = () => { haptic('tick'); try { localStorage.setItem(ROUNDUP_OFF, new Date().toDateString()); } catch { /* per-viewer */ } setRoundupOff(true); };
  const go = () => { haptic('tick'); setMode('roundup'); };
  const ui = {
    why, setWhy, talk, rip, go, notToday, undo: A.undo, fresh: answeredFresh,
    sayMore: () => { haptic('tick'); setSayMore(true); },
    read: () => talk(null),
  };

  const asking = shown.now === 'question' || expanded === 'question' || sayMore;
  const lit = shown.now === 'question';
  const send = () => {
    const t = text.trim();
    if (!t) return;
    haptic('commit');
    if (asking && (P.question?.open || sayMore)) { A.answer(t); setText(''); setSayMore(false); setExpanded(null); return; }
    setSheet((s) => s || { quote: null });
    A.talk(t, null);
    setText('');
  };
  const dict = useDictation(() => text, (t) => setText(t), null);

  const rail = shown.order.slice(1);
  const onRow = (key) => {
    haptic('tick');
    if (key === 'conversation' || key === 'reply') { talk(null); return; }
    setExpanded((e) => (e === key ? null : key));
  };

  const stale = mode === 'roundup' ? 'Oldest first, one at a time.' : P.stale;
  const [cur, setCur] = useState(null);
  const curBead = mode === 'roundup' ? cur : null;

  return (
    <div ref={rootRef} className="nv-ld" data-screen-label="Leader" style={pad}>
      <div className="nv-ld-col">
        <div className="nv-ld-nav">
          <button type="button" className="nv-ld-back nv-ld-pr" onClick={A.back}><Ico k="back" />Index</button>
          <button type="button" className="nv-ld-icb nv-ld-pr" aria-label="The Leader: what it reads, its research, New conversation" aria-expanded={menu} onClick={() => { haptic('tick'); setMenu(true); }}><Ico k="more" /></button>
        </div>
        <div className="nv-ld-head" data-enter="">
          <Face who="leader" size={40} work={P.busy} />
          <div><b>Leader</b><span className={`nv-ld-k${swap ? ' nv-ld-swap' : ''}`}>{clockLabel(now)}</span></div>
          {P.demo ? <span className="nv-ld-demo">Demo</span> : null}
        </div>
        <Strip P={P} asked={P.question?.open ? P.question.about : null} cur={curBead} skipFly={skipFly} stripRef={stripRef}
          onOpen={() => { haptic('tick'); setStage(true); }} />
        <p className="nv-ld-stale" data-enter="" aria-live="polite">{stale}</p>

        {mode === 'roundup' ? (
          <RoundUp P={P} A={A} stripRef={stripRef} skipFly={skipFly} talk={talk} onCur={setCur}
            done={() => { setMode('board'); setCur(null); }} />
        ) : (
          <>
            <div className={`nv-ld-nowk${swap ? ' nv-ld-swap' : ''}`} data-enter="">
              <i className="lv" /><span><b>Now</b> · {shown.why}</span>
            </div>
            <div ref={focusRef} className="nv-ld-focus nv-ld-lit" data-enter="mat" data-item-now={shown.now}>
              <div className={`nv-ld-fin${out ? ' pre' : ''}`} key={shown.now}>
                <Body k={shown.now} P={P} R={R} ui={ui} />
              </div>
            </div>
            {rail.length ? <p className="nv-ld-rl" data-enter="">Then</p> : null}
            <div ref={railRef} className="nv-ld-rail" data-enter="">
              {rail.map((key) => {
                const row = rowOf(key, P, R);
                if (!row) return null;
                const open = expanded === key;
                return (
                  <div key={key} className="nv-ld-ritem" data-item={key}>
                    {row.undo ? (
                      <div className="nv-ld-rrow">
                        <span className="nv-ld-gl">{row.glyph}</span>
                        <span className="rt"><b>{row.title}</b><small>{row.sub}</small></span>
                        {row.undo.receiptId || row.undo.demo ? <button type="button" className="nv-ld-undo nv-ld-pr" onClick={() => A.undo(row.undo)}>Undo</button> : <span />}
                      </div>
                    ) : (
                      <button type="button" className="nv-ld-rrow nv-ld-pr" aria-expanded={key === 'conversation' || key === 'reply' ? undefined : open} onClick={() => onRow(key)}>
                        <span className="nv-ld-gl" style={{ position: 'relative' }}>{row.glyph}{row.dot ? <i className="nv-ld-unread" /> : null}</span>
                        <span className="rt"><b>{row.title}</b><small>{row.sub}</small></span>
                        <Ico k="chev" className="nv-ld-chev" />
                      </button>
                    )}
                    {key !== 'conversation' && key !== 'reply' && !row.undo ? (
                      <div className={`nv-ld-rx${open ? ' open' : ''}`} aria-hidden={!open}><div><div className="in">
                        {open ? <Body k={key} P={P} R={R} ui={ui} compact /> : null}
                      </div></div></div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="nv-ld-dock" data-enter="">
          <Composer value={text} set={setText} send={send} asking={asking} lit={lit} dict={dict} busy={P.answerBusy} />
        </div>
      </div>

      {sheet ? <Conversation P={P} A={A} quote={sheet.quote} close={() => setSheet(null)} /> : null}
      {stage ? <Stage P={P} A={A} skipFly={skipFly} close={() => setStage(false)} talk={(q) => { setStage(false); setTimeout(() => talk(q), 240); }} /> : null}
      {menu ? <Menu P={P} A={A} close={() => setMenu(false)} /> : null}
    </div>
  );
}

function Composer({ value, set, send, asking, lit, dict, busy }) {
  const has = !!value.trim();
  return (
    <form className={`nv-ld-compose${lit || asking ? ' asking' : ''}`} onSubmit={(e) => { e.preventDefault(); if (!busy) send(); }}>
      {dict.supported ? (
        <button type="button" className={`nv-ld-mic nv-ld-pr${dict.on ? ' on' : ''}`} aria-pressed={dict.on}
          aria-label={dict.on ? 'Listening. Tap to stop' : asking ? 'Speak your answer' : 'Speak to the Leader'} onClick={() => { haptic('tick'); dict.toggle(); }}><Ico k="mic" /></button>
      ) : <span className="nv-ld-mic" aria-hidden="true" style={{ opacity: 0.35 }}><Ico k="mic" /></span>}
      <input className="nv-ld-field" value={value} onChange={(e) => set(e.target.value)} enterKeyHint="send"
        placeholder={busy ? 'Recording your answer' : asking ? 'Answer the Leader' : 'Talk to the Leader'}
        aria-label={asking ? 'Answer the Leader' : 'Talk to the Leader'} autoCorrect="on" autoCapitalize="sentences" spellCheck />
      <button type="submit" className={`nv-ld-send nv-ld-pr${has && !busy ? ' on' : ''}`} aria-label="Send" disabled={!has || busy}><Ico k="up" /></button>
    </form>
  );
}

// ------------------------------------------------------------------ the round-up --

// C's deck, in place of the card: oldest first, one at a time. A tick sets it
// down (it flies up into the strip and ties off), a cross keeps it open (it
// flies back to its own bead, marked as checked today).
function RoundUp({ P, A, stripRef, skipFly, talk, done, onCur }) {
  const deck = useRef(P.open.filter((o) => !o.checkedToday)).current;
  const [at, setAt] = useState(0);
  const [marks, setMarks] = useState({});           // key -> 'down' | 'kp'
  const [busy, setBusy] = useState(false);
  const [zero, setZero] = useState(true);
  const [last, setLast] = useState(null);            // the receipt key from this round-up
  const deckRef = useRef(null);
  useLayoutEffect(() => {
    const cards = [...(deckRef.current?.querySelectorAll('.nv-ld-dcard') || [])];
    const rm = reduced();
    cards.slice(0, 3).reverse().forEach((c, i) => c.animate?.([{ opacity: 0, transform: rm ? 'none' : 'translateY(90px) scale(.94)' }, { opacity: c.dataset.k === '0' ? 1 : c.dataset.k === '1' ? 0.9 : 0.7 }],
      { duration: rm ? 250 : 420, delay: i * 90, easing: ESTD, fill: 'backwards' }));
    const t = setTimeout(() => setZero(false), rm ? 0 : 520);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (deck.length === 0) done(); }, [deck.length, done]);
  useEffect(() => { onCur(deck[at]?.key || null); }, [at, deck, onCur]);

  const act = async (kind) => {
    if (busy) return;
    const item = deck[at]; if (!item) return;
    setBusy(true);
    haptic(kind === 'down' ? 'commit' : 'tick');
    const card = deckRef.current?.querySelector('.nv-ld-dcard[data-k="0"]');
    const strip = stripRef.current;
    const target = kind === 'down'
      ? strip?.querySelector('[data-g="d"] .nv-ld-beads')
      : strip?.querySelector(`[data-g="o"] [data-bead="${CSS.escape(item.key)}"]`);
    if (card && target && !reduced()) {
      const a = card.getBoundingClientRect(), b = target.getBoundingClientRect();
      card.style.transformOrigin = '50% 50%';
      await card.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(b.left + b.width / 2) - (a.left + a.width / 2)}px,${(b.top + b.height / 2) - (a.top + a.height / 2)}px) scale(.05)`, opacity: 0.2 }],
        { duration: 620, easing: EIO, fill: 'forwards' }).finished.catch(() => {});
    } else if (card) {
      await card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished.catch(() => {});
    }
    if (kind === 'down') skipFly.current.add(item.key);
    setMarks((m) => ({ ...m, [item.key]: kind }));
    setAt((i) => i + 1);
    setBusy(false);
    const r = kind === 'down' ? await A.setDown(item.text) : await A.stillOpen(item.text);
    if (kind === 'down') setLast(r?.receiptId || (r === true ? 'demo' : null));
  };

  if (at >= deck.length) {
    return (
      <div className="nv-ld-focus nv-ld-lit" style={{ minHeight: 0 }}>
        <div className="nv-ld-by"><Face who="leader" size={24} /><span className="nm">Leader</span></div>
        <Said say text={`That is all of them. ${countWord(deck.filter((d) => marks[d.key] === 'down').length)} set down, ${countWordLower(deck.filter((d) => marks[d.key] === 'kp').length)} still open.`} />
        <div className="nv-ld-verbs"><button type="button" className="nv-ld-quiet nv-ld-pr" onClick={done}>Back to Now</button></div>
      </div>
    );
  }
  const rc = P.receipts.find((x) => x.kind === 'down' && deck.some((d) => (x.resolved || []).includes(d.text)));
  return (
    <>
      <div ref={deckRef} className={`nv-ld-deck${zero ? ' zero' : ''}`} role="group" aria-label="The round-up, oldest first">
        {deck.map((t, i) => {
          const k = i < at ? 'gone' : i - at;
          if (k === 'gone') return null;
          const days = t.days ?? 0;
          return (
            <article key={t.key} className="nv-ld-dcard" data-k={k > 2 ? 'far' : String(k)} aria-hidden={k !== 0}>
              <div className="nv-ld-dc-h"><b>{t.name}</b><span className="nv-ld-dc-age"><b>{days}</b> day{days === 1 ? '' : 's'}</span></div>
              <div className="nv-ld-agebar" aria-hidden="true"><i style={{ '--a': Math.min(1, days / 31).toFixed(2) }} /></div>
              <p className="nv-ld-dc-w">{t.text}</p>
              <p className="nv-ld-dc-m">Said {dateWords(new Date(t.at))}{P.lastToldAt && new Date(P.lastToldAt) <= new Date(t.at) ? '' : ' · nothing since'}</p>
              <div className="nv-ld-dc-v">
                <button type="button" className="nv-ld-cap nv-ld-pr" disabled={busy || k !== 0} onClick={() => act('down')}><Ico k="check" />Set it down</button>
                <button type="button" className="nv-ld-quiet nv-ld-pr" disabled={busy || k !== 0} onClick={() => act('kp')}><Ico k="x" />Still open</button>
              </div>
              <button type="button" className="nv-ld-rowb nv-ld-pr" disabled={k !== 0} onClick={() => talk({ kind: 'struggle', label: 'this', title: t.name })}><span>Talk about it</span><Ico k="chev" className="nv-ld-chev" /></button>
            </article>
          );
        })}
      </div>
      <div className="nv-ld-tally">
        <span className="nv-ld-beads">{deck.map((t, i) => <i key={t.key} className={`nv-ld-bead${i === at ? ' cur' : marks[t.key] === 'down' ? ' tied' : marks[t.key] === 'kp' ? ' kp' : ''}`} />)}</span>
        <span className="pos"><b>{at + 1}</b> of {deck.length}</span>
      </div>
      {last && rc ? <div style={{ marginTop: 8 }}><Receipt rc={rc} P={P} onUndo={A.undo} /></div> : null}
    </>
  );
}

// ------------------------------------------------------------------ the conversation --

function Seat({ a }) {
  const [, tick] = useState(0);
  const asking = a.state === 'asking';
  useEffect(() => { if (!asking) return undefined; const t = setInterval(() => tick((n) => n + 1), 200); return () => clearInterval(t); }, [asking]);
  const secs = asking ? Math.max(0, Math.round((Date.now() - new Date(a.askedAt).getTime()) / 1000)) : Math.round((a.ms || 0) / 1000);
  const doing = a.agent === 'researcher' ? 'Reading the evidence' : a.agent === 'librarian' ? 'Searching your books' : 'Working on it';
  return (
    <span className={`nv-ld-seat${asking ? '' : ' done'}`} style={{ '--h': agentHue(a.agent) }} aria-label={`${agentName(a.agent)}, ${asking ? 'working' : 'back'}`}>
      <Face who={a.agent} size={30} work={asking} back={!asking} />
      <span className="st"><b>{agentName(a.agent)}</b><small>{asking ? `${secs} s · ${doing}` : a.state === 'failed' ? `Could not answer · ${secs} s` : `Back · ${secs} s`}</small></span>
    </span>
  );
}

const handWords = (list) => {
  const names = [...new Set(list.map((a) => agentThe(a.agent)))];
  if (!names.length) return '';
  const words = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Asking ${words}.`;
};
const giveWords = (agent) => (agent === 'researcher' ? 'A cited brief' : agent === 'librarian' ? 'Passages from your books' : 'Its answer');

function From({ c }) {
  const [open, setOpen] = useState(false);
  const secs = Math.round((c.ms || 0) / 1000);
  return (
    <div style={{ '--h': agentHue(c.agent) }}>
      <button type="button" className="nv-ld-from nv-ld-pr" aria-expanded={open} onClick={() => { haptic('tick'); setOpen(!open); }}>
        <Face who={c.agent} size={30} />
        <span className="ft"><b>From <span>{agentThe(c.agent)}</span></b><small>{c.ok ? giveWords(c.agent) : 'Could not answer'}{c.ms != null ? ` · ${secs} s` : ''}</small></span>
        <Ico k="chev" className="nv-ld-chev turn" />
      </button>
      <div className={`nv-ld-peek${open ? ' open' : ''}`}><div><div className="in" style={{ '--h': agentHue(c.agent) }}>
        <span className="nv-ld-k">The Leader asked {agentThe(c.agent)}{c.ms != null ? ` · ${secs} s` : ''}</span>
        <p className="pq">{c.question}</p>
        <p className="pa">{c.answer}</p>
      </div></div></div>
    </div>
  );
}

function LeaderLine({ m, P, live }) {
  const consult = m.streaming ? (P.liveConsult || null) : m.consult;
  const agents = [...new Set((consult || []).map((c) => c.agent))];
  const working = m.streaming && (P.liveConsult || []).some((c) => c.state === 'asking');
  const r = readReply(m.text, { consult: consult && consult.length ? consult : null, clean: P.clean });
  const maxMs = Math.max(0, ...(consult || []).map((c) => c.ms || 0));
  // the seats fold away once, half a second after the answer first lands;
  // `live` is only true on that first render, so the fold keys off its birth
  const born = useRef(live).current;
  const [shut, setShut] = useState(!born || !consult?.length);
  useEffect(() => {
    if (!born || m.streaming || !consult?.length) return undefined;
    const t = setTimeout(() => setShut(true), 500);
    return () => clearTimeout(t);
  }, [born, m.streaming, consult?.length]);
  const meta = m.streaming
    ? (working ? `asking ${countWordLower(agents.length)} agent${agents.length === 1 ? '' : 's'}` : consult?.length ? 'answering' : 'thinking it through')
    : consult?.length ? `asked ${countWordLower(agents.length)} agent${agents.length === 1 ? '' : 's'} · ${Math.round(maxMs / 1000)} s` : hhmm(new Date(m.at));
  return (
    <div className="nv-ld-msg">
      <div className="nv-ld-by">
        <span className="nv-ld-stack"><Face who="leader" size={26} work={m.streaming && !working} />{shut && !m.streaming ? agents.map((a) => <Face key={a} who={a} size={26} />) : null}</span>
        <span className="nm">Leader</span><span className="mt">{meta}</span>
      </div>
      <div className="nv-ld-said">
        {consult?.length ? (
          <div className={`nv-ld-collapse${shut && !m.streaming ? ' shut' : ''}`}><div>
            <p className="nv-ld-hand">{r.hand || handWords(consult)}</p>
            <div className="nv-ld-bench">{consult.map((c, i) => <Seat key={`${c.agent}${i}`} a={m.streaming ? c : { ...c, state: c.ok === false ? 'failed' : 'done' }} />)}</div>
          </div></div>
        ) : null}
        {r.lead ? <Said text={r.lead} say={live && !m.streaming} /> : (m.streaming ? <span className="nv-ld-busy" aria-label="Thinking"><i /><i /><i /></span> : null)}
        {r.rest ? <div className="nv-ld-tx">{r.rest.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div> : null}
        {!m.streaming && consult?.length ? <div className="nv-ld-froms">{consult.map((c, i) => <From key={`${c.agent}${i}`} c={c} />)}</div> : null}
      </div>
    </div>
  );
}

function IdeaLine({ d }) {
  const [open, setOpen] = useState(false);
  const has = !!(d.why || d.refs?.length);
  return (
    <div className="nv-ld-msg">
      <div className="nv-ld-by"><Face who="leader" size={24} /><span className="nm">Leader</span><span className="mt">{({ action: 'Try today', reminder: 'Remember', idea: 'Consider' })[d.kind] || 'Consider'}{d.createdAt ? ` · ${hhmm(new Date(d.createdAt))}` : ''}</span></div>
      <div className="nv-ld-said idea">
        <p className="t">{d.title}</p>
        <p className="l">{d.line}</p>
        {has ? (
          <>
            <button type="button" className="nv-ld-rowb nv-ld-pr" aria-expanded={open} onClick={() => setOpen(!open)}><span>Why this, that day</span><Ico k="chev" className="nv-ld-chev" /></button>
            <div className={`nv-ld-why${open ? ' open' : ''}`}><div>
              {d.why ? <p style={{ marginTop: 0 }}>{d.why}</p> : null}
              {d.refs?.length ? <p className="nv-ld-k" style={{ marginBottom: 10 }}>From {d.refs.join(' and ')}</p> : null}
            </div></div>
          </>
        ) : <div style={{ height: 10 }} />}
      </div>
    </div>
  );
}

function Conversation({ P, A, quote, close }) {
  const [up, setUp] = useState(false);
  const [text, setText] = useState('');
  const [quoted] = useState(quote);
  const quoteSent = useRef(false);
  const tz = useRef(null);
  const leaving = useRef(false);
  const shut = () => { if (leaving.current) return; leaving.current = true; setUp(false); setTimeout(close, reduced() ? 200 : 420); };
  const drag = useSheetDrag(shut, { threshold: 90 });
  const dict = useDictation(() => text, (t) => setText(t), null);
  const seenLive = useRef(new Set(P.messages.filter((m) => !m.streaming).map((m) => m.text)));
  useEffect(() => { for (const m of P.messages) if (!m.streaming && m.text) seenLive.current.add(m.text); });
  useEffect(() => { requestAnimationFrame(() => setUp(true)); }, []);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') shut(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const n = P.messages.length;
  const lastText = P.messages[n - 1]?.text;
  useEffect(() => { const el = tz.current; if (el) el.scrollTop = el.scrollHeight; }, [n, lastText]);
  const send = (e) => {
    e?.preventDefault?.();
    const t = text.trim(); if (!t || P.busy) return;
    haptic('commit');
    A.talk(t, quoted && !quoteSent.current ? quoted : null);
    quoteSent.current = true;
    setText('');
  };
  return (
    <div className={`nv-ld-over${up ? ' up' : ''}`} role="dialog" aria-modal="true" aria-label={quoted ? `Talking about ${quoted.label}` : 'The conversation with the Leader'}
      onClick={(e) => { if (e.target === e.currentTarget) shut(); }}>
          <div className="nv-ld-scrim" onClick={shut} />
          <div ref={drag.sheetRef} className="nv-ld-csheet" onClick={(e) => e.stopPropagation()}>
            <div className="nv-ld-grab" {...drag.handleProps} style={{ ...drag.handleProps.style }}><i /></div>
            <div className="nv-ld-cshead">
              <span className="nv-ld-ctr"><Face who="leader" size={28} work={P.busy} />Leader</span>
              <button type="button" className="nv-ld-txb nv-ld-pr" data-edge-close="" onClick={shut}>Back to Now</button>
            </div>
            {quoted ? (
              <div className="nv-ld-quote nv-ld-card"><b>{quoted.title}</b><span className="nv-ld-k">Talking about {quoted.label}</span></div>
            ) : null}
            <div className="nv-ld-tz" ref={tz}>
              {P.messages.length === 0 && !P.busy ? <p className="nv-ld-sliver">Nothing said yet. Bring what you are facing at work, or something that worked.</p> : null}
              {P.messages.map((m, i) => {
                const id = m.id || `${m.kind}${m.at}`;
                const live = !seenLive.current.has(m.text);
                if (m.kind === 'sliver') return <p key={`s${i}`} className="nv-ld-sliver">{m.text}</p>;
                if (m.kind === 'system') return <p key={`y${i}`} className="nv-ld-sys">{m.text.replace(/^Error: /, 'That did not go through: ')}</p>;
                if (m.kind === 'idea') return <IdeaLine key={`i${m.idea.date}`} d={m.idea} />;
                if (m.kind === 'me') return (
                  <div key={id} className="nv-ld-mewrap">
                    {m.quote ? <span className="about">About {m.quote.title}</span> : null}
                    <p className="nv-ld-me">{m.text}</p>
                  </div>
                );
                return <LeaderLine key={id} m={m} P={P} live={live} />;
              })}
              {P.busy && !P.messages.some((m) => m.streaming) ? (
                <LeaderLine m={{ kind: 'leader', text: '', streaming: true, at: Date.now() }} P={P} live />
              ) : null}
            </div>
            <form className="nv-ld-compose" onSubmit={send}>
              {dict.supported ? (
                <button type="button" className={`nv-ld-mic nv-ld-pr${dict.on ? ' on' : ''}`} aria-pressed={dict.on} aria-label={dict.on ? 'Listening. Tap to stop' : 'Speak to the Leader'} onClick={() => dict.toggle()}><Ico k="mic" /></button>
              ) : <span className="nv-ld-mic" aria-hidden="true" style={{ opacity: 0.35 }}><Ico k="mic" /></span>}
              <input className="nv-ld-field" value={text} onChange={(e) => setText(e.target.value)} placeholder={P.busy ? 'The Leader is answering' : 'Talk to the Leader'} aria-label="Talk to the Leader" enterKeyHint="send" autoCorrect="on" autoCapitalize="sentences" spellCheck />
              <button type="submit" className={`nv-ld-send nv-ld-pr${text.trim() && !P.busy ? ' on' : ''}`} aria-label="Send" disabled={!text.trim() || P.busy}><Ico k="up" /></button>
            </form>
          </div>
    </div>
  );
}

// ------------------------------------------------------------------ the picture, drawn --

const W = 334, X0 = 6, XT = 292, Y0 = 26, RH = 27;

function Stage({ P, A, close, talk, skipFly }) {
  const [up, setUp] = useState(false);
  const [phase, setPhase] = useState(reduced() ? 4 : 0);   // 1 drawn, 2 fogged, 3 worked, 4 asking
  const [pick, setPick] = useState(null);
  const [acting, setActing] = useState(null);             // { key, step: 'settle'|'tied'|'drop' }
  const [ripple, setRipple] = useState(false);
  const svgRef = useRef(null);
  const leaving = useRef(false);
  const shut = () => { if (leaving.current) return; leaving.current = true; setUp(false); setTimeout(close, reduced() ? 200 : 400); };
  useEffect(() => {
    requestAnimationFrame(() => setUp(true));
    if (reduced()) return undefined;
    const ts = [setTimeout(() => setPhase(1), 380), setTimeout(() => setPhase(2), 1180), setTimeout(() => setPhase(3), 1680), setTimeout(() => { setPhase(4); setRipple(true); }, 2280)];
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') shut(); };
    document.addEventListener('keydown', onKey);
    return () => { ts.forEach(clearTimeout); document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = P.open;
  const first = P.firstAt ? new Date(P.firstAt) : new Date();
  const now = new Date();
  const span = Math.max(1, ageDays(first, now));
  const x = (iso) => X0 + Math.min(span, Math.max(0, (new Date(iso) - first) / 86_400_000)) * (XT - X0) / span;
  const lastAt = P.lastToldAt ? new Date(P.lastToldAt) : null;
  const xl = lastAt ? x(lastAt) : X0;
  const quietDays = P.lastToldDays;
  const bottom = Y0 + open.length * RH;
  const ay = bottom + 7;
  const asked = P.question?.open ? P.question.about : null;
  const litKey = pick || asked;
  const cls = ['nv-ld-pic', phase >= 1 && 'drawn', phase >= 2 && 'fogged', phase >= 3 && 'worked', phase >= 4 && asked && 'asking'].filter(Boolean).join(' ');
  const H = ay + 52 + P.working.length * 22 + 6;

  // touch a thread and slide to light another; let go to choose it
  const rowAt = (clientY) => {
    const svg = svgRef.current; if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const y = (clientY - r.top) * (H / r.height);
    const i = Math.floor((y - Y0) / RH);
    return i >= 0 && i < open.length ? open[i].key : null;
  };
  const press = useRef(false);
  const down = (e) => { const k = rowAt(e.clientY); if (!k || acting) return; press.current = true; setPick(k); haptic('tick'); };
  const move = (e) => { if (!press.current) return; const k = rowAt(e.clientY); if (k && k !== pick) { setPick(k); haptic('tick'); } };
  const upP = () => { press.current = false; };

  const item = pick ? open.find((o) => o.key === pick) : null;
  const setDown = async () => {
    if (!item || acting) return;
    haptic('commit');
    const k = item.key;
    const rm = reduced();
    setActing({ key: k, step: 'settle' }); await wait(rm ? 120 : 520);
    setActing({ key: k, step: 'tied' }); await wait(rm ? 120 : 560);
    setActing({ key: k, step: 'drop' }); await wait(rm ? 260 : 640);
    skipFly.current.add(k);
    setPick(null);
    await A.setDown(item.text);
    setActing(null);
  };
  const stillOpen = async () => { if (!item) return; haptic('tick'); await A.stillOpen(item.text); setPick(null); };
  const shelf = P.down.filter((d) => d.resolvedAt && new Date(d.resolvedAt).toDateString() === now.toDateString()).slice(0, 4);
  const rcFor = (text) => P.receipts.find((rc) => (rc.resolved || []).includes(text));

  return (
    <div className={`nv-ld-over stage${up ? ' up' : ''}`} role="dialog" aria-modal="true" aria-label="The picture"
      onClick={(e) => { if (e.target === e.currentTarget) shut(); }}>
      <div className="nv-ld-scrim" onClick={shut} />
      <div className="nv-ld-stage" role="group" aria-label="The picture" onClick={(e) => e.stopPropagation()}>
        <div className="nv-ld-sthead"><b>The picture</b><span className="nv-ld-k" style={{ display: 'inline' }}>since {dateWords(first)}</span>
          <button type="button" className="nv-ld-txb nv-ld-pr" data-edge-close="" onClick={shut}>Done</button></div>
        <p className="nv-ld-news">{P.sentence}</p>
        {open.length || P.working.length ? (
          <svg ref={svgRef} className={cls} viewBox={`0 0 ${W} ${H}`} role="img"
            aria-label={`${countWord(open.length)} open threads drawn from the day each was said to today${quietDays ? `, the last ${quietDays} days without word` : ''}; ${countWordLower(P.working.length)} things working below the line of days.`}
            onPointerDown={down} onPointerMove={move} onPointerUp={upP} onPointerCancel={upP} onPointerLeave={upP}>
            {quietDays ? <rect className="fog" x={xl} y="18" width={Math.max(0, XT - xl)} height={Math.max(0, bottom - 18)} rx="6" fill="color-mix(in srgb, var(--nv-ink) 5%, transparent)" /> : null}
            {quietDays ? <text className="fogk" x={Math.min(xl + 4, XT - 120)} y="13">{quietDays} day{quietDays === 1 ? '' : 's'} without word</text> : null}
            <line className="axis" x1={XT} y1="18" x2={XT} y2={bottom} />
            {open.map((t, i) => {
              const ry = Y0 + i * RH, ly = ry + 20, xs = x(t.at);
              const lastFor = t.checkedToday ? XT : xl;
              const isAct = acting?.key === t.key;
              const idxAct = acting ? open.findIndex((o) => o.key === acting.key) : -1;
              const rowCls = ['row', litKey === t.key && 'lit', pick === t.key && 'hl', isAct && (acting.step === 'settle' || acting.step === 'tied' || acting.step === 'drop') && 'settle', isAct && (acting.step === 'tied' || acting.step === 'drop') && 'tied', isAct && acting.step === 'drop' && 'drop', acting?.step === 'drop' && idxAct > -1 && i > idxAct && 'up'].filter(Boolean).join(' ');
              return (
                <g key={t.key} className={rowCls} style={{ '--i': i, '--dy': `${H - ly}px`, '--rh': `${RH}px` }}>
                  <rect className="hit" x="0" y={ry} width={W} height={RH} rx="7" />
                  <text className="nm" x={X0} y={ry + 12}>{t.name}</text>
                  <text className="age" x={W - 2} y={ly + 4} textAnchor="end">{t.days} d</text>
                  {xs < lastFor ? <line className="known" pathLength="1" x1={xs} y1={ly} x2={lastFor} y2={ly} /> : null}
                  {lastFor < XT ? <line className="unknown" x1={Math.max(xs, lastFor)} y1={ly} x2={XT} y2={ly} /> : null}
                  <line className="now" pathLength="1" x1={Math.max(xs, xl)} y1={ly} x2={XT} y2={ly} />
                  <circle className="start" cx={xs} cy={ly} r="3" />
                  <circle className="end" cx={XT} cy={ly} r="3.5" />
                  <path className="knot" pathLength="1" d={`M${XT - 2} ${ly}c3-7 10-6 8 0s-9 4-8-1c1-3 5-3 7 0l5 5`} />
                  {asked === t.key ? (
                    <g className="qorbg">
                      <circle className={`qr${ripple ? ' rip' : ''}`} cx={XT} cy={ly} r="9" />
                      <circle className="qo" cx={XT} cy={ly} r="9" />
                      <path className="qm" d={`M${XT - 2.6} ${ly - 3}a2.7 2.7 0 1 1 3.5 2.6c-.6.3-.9.8-.9 1.5`} />
                      <circle className="qd" cx={XT} cy={ly + 4.3} r="1" />
                    </g>
                  ) : null}
                </g>
              );
            })}
            <line className="axis" x1="0" y1={ay} x2={W} y2={ay} />
            <text className="dk" x={X0} y={ay + 16} textAnchor="start">{dateWords(first)}</text>
            {lastAt && xl - X0 > 60 && XT - xl > 50 ? <text className="dk" x={xl} y={ay + 16} textAnchor="middle">{dateWords(lastAt)}</text> : null}
            <text className="dk" x={XT} y={ay + 16} textAnchor="middle">Today</text>
            <text className="pk" x={X0} y={ay + 40}>What works</text>
            {P.working.map((w, j) => {
              const ry = ay + 48 + j * 22, xs = x(w.at);
              return (
                <g key={w.key} style={{ '--i': j }}>
                  <text className="wn" x={X0} y={ry + 10}>{w.name}</text>
                  <text className="wk" x={W - 2} y={ry + 18} textAnchor="end" style={{ font: '600 13px var(--ld-round)', fill: 'var(--ld-ink3)' }}>{w.days} d</text>
                  <rect className="wbar" x={xs} y={ry + 14} width={Math.max(4, Math.max(xs, xl) - xs)} height="4" rx="2" />
                  <rect className="wfog" x={Math.max(xs, xl)} y={ry + 14} width={Math.max(0, XT - Math.max(xs, xl))} height="4" rx="2" />
                </g>
              );
            })}
          </svg>
        ) : <p className="nv-ld-fl">Nothing on the picture yet. What you tell the Leader about leading at work lands here.</p>}
        {item ? (
          <div className="nv-ld-pick">
            <b>{item.name}</b>
            <p>{item.text}</p>
            <div className="nv-ld-verbs">
              <button type="button" className="nv-ld-cap nv-ld-pr" onClick={setDown} disabled={!!acting}><Ico k="check" />Set it down</button>
              <button type="button" className="nv-ld-quiet nv-ld-pr" onClick={stillOpen} disabled={!!acting}><Ico k="x" />Still open</button>
            </div>
            <button type="button" className="nv-ld-rowb nv-ld-pr" onClick={() => talk({ kind: 'struggle', label: 'this', title: item.name })}><span>Talk about it</span><Ico k="chev" className="nv-ld-chev" /></button>
          </div>
        ) : null}
        <div className={`nv-ld-shelf${shelf.length ? ' has' : ''}`}>
          {shelf.length ? shelf.map((d) => {
            const rc = rcFor(d.text);
            return (
              <span className="si" key={d.key}>
                <Ico k="knot" className="kn" />
                <span className="sx"><b>{d.name}</b><span>Set down today · carried {daysWords(ageDays(d.at, new Date(d.resolvedAt)) ?? 0)}</span></span>
                {rc && (rc.receiptId || rc.demo) ? <button type="button" className="nv-ld-undo nv-ld-pr" onClick={() => A.undo(rc)}>Undo</button> : null}
              </span>
            );
          }) : <span className="ph">Set down · nothing yet today</span>}
        </div>
        <p className="nv-ld-stnote">{asked ? 'The lit thread is the one the Leader is asking about. ' : ''}Touch a thread and slide to light another; let go to set it down or talk about it.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the menu --

function Menu({ P, A, close }) {
  const [up, setUp] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setUp(true)); }, []);
  const shut = () => { setUp(false); setTimeout(close, reduced() ? 120 : 220); };
  return (
    <div className={`nv-ld-over${up ? ' up' : ''}`} role="dialog" aria-modal="true" aria-label="The Leader" onClick={(e) => { if (e.target === e.currentTarget) shut(); }}>
      <div className="nv-ld-menu">
        <div className="nv-ld-mi"><Ico k="book" /><span><b style={{ color: 'var(--nv-ink)' }}>What it reads</b><span>Your leadership concepts and sources in the vault, its research library, what the other agents know of your week, and what you tell it here.</span></span></div>
        <div className="nv-ld-mi"><Ico k="flask" /><span><b style={{ color: 'var(--nv-ink)' }}>Its research</b><span>{P.research.count} researched insight{P.research.count === 1 ? '' : 's'}{P.research.last ? ` · last run ${P.research.last}` : ' · no run yet'}. It reads further each Saturday.</span></span></div>
        <button type="button" className="nv-ld-mi nv-ld-pr" data-edge-close="" onClick={() => { haptic('tick'); A.newChat(); shut(); }}>
          <Ico k="fresh" /><span><b>New conversation</b><span>{P.continuing ? 'Starts fresh. What you said stays on the record.' : 'The next thing you say starts one.'}</span></span>
        </button>
      </div>
    </div>
  );
}
