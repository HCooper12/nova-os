import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Interactive } from '../Interactive.jsx';
import { CountUp } from '../CountUp.jsx';
import { FormCheckPanel } from '../FormCheckPanel.jsx';
import { ChatMarkdown } from '../ChatMarkdown.jsx';
import { TypeText } from '../TypeText.jsx';
import { SafeVisual } from '../SafeVisual.jsx';
import { VoicePanel } from '../VoicePanels.jsx';
import { haptic, switchHapticRef } from '../haptics.js';
import { useExit } from '../useExit.js';
import { useSheetDrag } from '../useSheetDrag.js';
import { useDictation } from '../useDictation.js';
import { useStickToBottom } from '../useStickToBottom.js';
import { restState } from '../sessionSummaryFacts.js';

// THE LIVE SESSION, SUMMARY — Train round B (28 Sep 2026), drawn from
// design/mockups/61-redesign-train-session-r2.html and approved with his
// doubt attached: "possibly being too much effort to scroll and click on
// other aspects of the screen, but I am willing to try it". That doubt is
// the brief. At 402 × 874 the set card, its two numerals, the steppers and
// the 64px tick are on screen at every moment of a set, and every other act
// (Note, Pain?, ⋯, Coach, Skip, the rail) is one tap, never a scroll.
//
// One hand: the lift and its meta in the upper half; every control touched
// mid-set in the lower half. The pad is the page's own (the system keyboard
// never opens on a number). After the tick the next set slides in and the
// rest ring counts on the tick's own spot. The ⋯ sheet holds the rest.
//
// It reads `v.sessionSummary` (src/vals/valsSessionSummary.js) and draws;
// every action is a handler the view model built from methods the classic
// SessionView already calls. The classic screen hands in the parts it
// reuses (the exercise picker), so nothing is drawn twice. Cupertino and
// command never reach this file.
//
// Colour: the muscle's hue on its chip, the 3D chip and the rest ring; gold
// only on what waits on him (the Coach chip while its number is not on the
// card, a proposal, Apply all); green beside a ✓; red for discard; the
// theme's button fill on the tick alone. The set type is a word, never a
// colour. Type is 34 · 20 · 15 · 13, numerals SF Rounded; no control under 44.

const P = {
  fig: <><circle cx="12" cy="4.8" r="2" /><path d="M12 7.5v6M8 21l4-7.5 4 7.5M6 10.5h12" /></>,
  note: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h6M9 16h4" /></>,
  bang: <path d="M12 6v8M12 18v.01" />,
  coach: <><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M9 10.5h6" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  left: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  right: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  skip: <path d="M5 5l9 7-9 7zM18 5v14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  play: <path d="M7 4.5v15l13-7.5z" />,
  cam: <><rect x="3" y="7" width="13" height="11" rx="2" /><path d="m16 11 5-3v9l-5-3" /></>,
  addx: <path d="M4 6h10M4 12h10M4 18h6M18 13v8M14 17h8" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  again: <path d="M4.5 11a7.5 7.5 0 0 1 13-4.6L19.5 8.5M19.5 3.5v5h-5M19.5 13a7.5 7.5 0 0 1-13 4.6L4.5 15.5M4.5 20.5v-5h5" />,
  down: <path d="m6 9.5 6 6 6-6" />,
  up: <path d="m6 14.5 6-6 6 6" />,
  del: <><path d="M9 5h11v14H9l-6-7z" /><path d="m12 9.5 5 5M17 9.5l-5 5" /></>,
  dumbbell: <path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12" />,
};
function Ico({ p, cls = '', size }) {
  return (
    <svg className={`nv-ss-ico ${cls}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={size ? { width: size, height: size } : undefined}>{p}</svg>
  );
}
const Dots = ({ size = 20 }) => (
  <svg className="nv-ss-ico fill" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: size, height: size }}>
    <circle cx="5.5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="18.5" cy="12" r="1.9" />
  </svg>
);

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const onControl = (el) => !!(el && el.closest && el.closest('[role="button"], button, a, input, select, textarea'));

// HOLD TO REPEAT. A tap is one step; held past 420ms it repeats every 90ms
// until the finger lifts. The step is read from a ref, so a repeat always
// runs the latest handler (the view model reads the set at call time too).
function useHold(fn) {
  const fnRef = useRef(fn);
  useLayoutEffect(() => { fnRef.current = fn; });
  const t = useRef({ wait: 0, rep: 0, repeated: false });
  const stop = () => { clearTimeout(t.current.wait); clearInterval(t.current.rep); t.current.wait = 0; t.current.rep = 0; };
  useEffect(() => stop, []);
  return {
    onPointerDown: () => {
      stop();
      t.current.repeated = false;
      t.current.wait = setTimeout(() => {
        t.current.repeated = true;
        fnRef.current?.();
        t.current.rep = setInterval(() => fnRef.current?.(), 90);
      }, 420);
    },
    onPointerUp: stop, onPointerCancel: stop, onPointerLeave: stop,
    onClick: () => { if (!t.current.repeated) fnRef.current?.(); t.current.repeated = false; },
  };
}
function Step({ label, aria, run }) {
  const h = useHold(run);
  return (
    <Interactive as="button" type="button" className="nv-ss-stp" aria-label={aria} haptic="tick"
      onPointerDown={h.onPointerDown} onPointerUp={h.onPointerUp} onPointerCancel={h.onPointerCancel} onPointerLeave={h.onPointerLeave}
      onClick={h.onClick}>{label}</Interactive>
  );
}

// ================================================================ page ==
export function SessionSummary({ v, parts }) {
  const S = v.sessionSummary;
  // a new session never opens on the last one's lift, set, sheet or rest
  useEffect(() => { if (!S.fresh) S.adopt(); }, [S.key, S.fresh]); // eslint-disable-line react-hooks/exhaustive-deps
  // the minute in the header, and the rest ring's second
  const [now, setNow] = useState(() => Date.now());
  const resting = !!S.rest;
  useEffect(() => {
    const ms = resting ? 1000 : 30000;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [resting]);
  const rs = restState(S.rest, now);
  // AT ZERO THE TICK COMES BACK, with one pulse (the native shell and
  // Android feel it; iOS web only fires a haptic for a finger on a switch)
  const wasResting = useRef(false);
  useEffect(() => {
    if (rs.phase === 'resting') wasResting.current = true;
    if (rs.phase === 'done' && S.rest) {
      if (wasResting.current) haptic('threshold');
      wasResting.current = false;
      S.rest.skip();
    }
  }, [rs.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // the pad puts itself away when he touches anything above it but the numbers and the tick
  const padOpen = !!S.pad;
  const padRef = useRef(S.pad);
  useLayoutEffect(() => { padRef.current = S.pad; });
  useEffect(() => {
    if (!padOpen) return undefined;
    const onDown = (e) => { if (!e.target.closest?.('[data-ss-keep]')) padRef.current?.close(); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [padOpen]);

  // ONE HAND. The set card sits at the foot of the screen, just above the tab
  // bar, so the tick lands under his thumb and every mid-set control is below
  // the middle; the rail keeps the top. The page is one screen tall (from
  // where it starts to the bar), and the card takes the space that is left.
  const pageRef = useRef(null);
  const [top, setTop] = useState(null);
  useLayoutEffect(() => {
    const measure = () => { const el = pageRef.current; if (el) setTop(Math.round(el.getBoundingClientRect().top + (window.scrollY || 0))); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const minutes = S.startedAt ? Math.max(0, Math.floor((now - S.startedAt) / 60000)) : null;
  const sh = S.sheet;
  return (
    <div style={v.wrapWorkouts} data-screen-label="Workouts" className={`nv-ss${padOpen ? ' padup' : ''}`}>
      <div ref={pageRef} className="nv-ss-page" style={top != null ? { '--ss-top': `${top}px` } : undefined}>
        <header className="nv-ss-top nv-sum-rise" style={{ '--i': 0 }}>
          <div className="nv-ss-st">
            <b>{S.title}{S.editing && <em> · editing</em>}</b>
            <span>{minutes != null ? `${minutes} min · ` : ''}{S.progress}</span>
          </div>
          <Interactive as="button" type="button" className="nv-ss-fin" onClick={S.openFinish}>{S.finishLabel}</Interactive>
        </header>
        <RailCard S={S} />
        {S.set ? <SetCard S={S} rs={rs} /> : S.skipped ? <SkippedCard S={S} /> : S.allDone ? <DoneCard S={S} rs={rs} /> : null}
        {S.voice && <VoiceLine vo={S.voice} />}
      </div>
      {S.receipt && <Receipt r={S.receipt} />}
      {S.pad && <Pad p={S.pad} />}
      {sh.more && <MoreSheet s={sh.more} />}
      {sh.pain && <PainSheet s={sh.pain} />}
      {sh.note && <NoteSheet s={sh.note} />}
      {sh.coach && <CoachSheet s={sh.coach} v={v} />}
      {sh.form && <FormSheet s={sh.form} />}
      {sh.picker && <PickerSheet s={sh.picker} v={v} parts={parts} />}
      {sh.finish && <FinishSheet s={sh.finish} />}
    </div>
  );
}

// ============================================================ the rail ==
// One lift, its neighbours a swipe away (and a tap: ‹ ›). The dots say
// where by SHAPE: filled for done, the bar for now, hollow to come, struck
// for skipped, so colour never has to.
function RailCard({ S }) {
  const L = S.lift;
  const R = S.rail;
  const cardRef = useRef(null);
  const drag = useRef(null);
  const [dir, setDir] = useState(0);
  const go = (to, d) => { if (!to) return; setDir(d); to.go(); };
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, on: false, t: performance.now() };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) { if (Math.abs(dy) > 10) drag.current = null; return; }
      d.on = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    }
    d.dx = dx;
    // past the first or last lift the card resists instead of stopping dead
    const edge = (dx > 0 && !R.prev) || (dx < 0 && !R.next);
    const shown = edge ? (dx * 0.55 * 120) / (120 + 0.55 * Math.abs(dx)) : dx;
    if (cardRef.current) cardRef.current.style.transform = `translateX(${shown}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.on) return;
    const el = cardRef.current;
    const v = Math.abs(d.dx) / Math.max(1, performance.now() - d.t);
    const far = Math.abs(d.dx) > 60 || v > 0.5;
    if (el) { el.style.transition = 'transform .28s cubic-bezier(.32,.72,0,1)'; el.style.transform = 'none'; setTimeout(() => { if (el) el.style.transition = ''; }, 300); }
    if (far && d.dx < 0 && R.next) go(R.next, 1);
    else if (far && d.dx > 0 && R.prev) go(R.prev, -1);
    // the tap that ended a swipe is not a tap
    swallowRef.current = true;
    setTimeout(() => { swallowRef.current = false; }, 0);
  };
  const swallowRef = useRef(false);
  return (
    <div className="nv-ss-xrail nv-sum-rise" style={{ '--i': 1 }}>
      {R.prev && <span className="nv-ss-peek l" aria-hidden="true" />}
      {R.next && <span className="nv-ss-peek r" aria-hidden="true" />}
      <article ref={cardRef} className="nv-sum-card nv-ss-xcard" aria-label={`Lift ${R.index + 1} of ${R.count}, ${L.name}. Swipe for the next lift`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onClickCapture={(e) => { if (swallowRef.current) { e.stopPropagation(); e.preventDefault(); } }}
        onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'ArrowRight') go(R.next, 1); if (e.target === e.currentTarget && e.key === 'ArrowLeft') go(R.prev, -1); }}
        tabIndex={-1}>
        <div key={L.key} className={`nv-ss-xin${dir > 0 ? ' fromr' : dir < 0 ? ' froml' : ''}`}>
          <div className="nv-ss-xtop">
            <button type="button" className="nv-ss-nav" onClick={() => go(R.prev, -1)} disabled={!R.prev} aria-label={R.prev ? `Previous lift: ${R.prev.name}` : 'This is the first lift'}><Ico p={P.left} cls="thick" /></button>
            <span className="nv-ss-xdots" aria-hidden="true">
              {R.count <= 8 && R.dots.map((d) => <i key={d.key} className={d.state} />)}
            </span>
            <span className="nv-ss-xof">{R.index + 1} of {R.count}</span>
            <button type="button" className="nv-ss-nav" onClick={() => go(R.next, 1)} disabled={!R.next} aria-label={R.next ? `Next lift: ${R.next.name}` : 'This is the last lift'}><Ico p={P.right} cls="thick" /></button>
            {!L.skipped && !L.adhoc && (
              <button type="button" className="nv-ss-skipl" onClick={L.skip}><Ico p={P.skip} size={14} /><span>Skip this lift</span></button>
            )}
          </div>
          <div className="nv-ss-xhead">
            <button type="button" className="nv-ss-f3d" style={{ '--h': L.hue }} onClick={L.open3D} aria-label={`${L.name} in 3D: the form figure, the muscles, cues, history`}><Ico p={P.fig} size={28} /></button>
            <div className="nv-ss-xn">
              <Interactive as="span" className={`nv-ss-xname${L.skipped ? ' struck' : ''}`} onLongPress={L.hold}>{L.name}</Interactive>
              <div className="nv-ss-xmeta">
                <span className="nv-ss-mchip" style={{ '--h': L.hue }}><i aria-hidden="true" />{L.muscle}{L.mobility ? ' · not volume' : ''}</span>
                <span className="nv-ss-tgt">{L.target}</span>
                {L.adhoc && <span className="nv-ss-tag">Extra · today only</span>}
                {L.anomaly && <span className="nv-ss-tag">Off day</span>}
              </div>
            </div>
          </div>
          {L.skipped
            ? <p className="nv-ss-last">Skipped today</p>
            : <p className="nv-ss-last">{L.last ? <>Last time <b>{L.last}</b></> : L.startFrom ? <>First time under this name · started from <b>{L.startFrom}</b></> : 'First time on this lift'}</p>}
          {L.focus && !L.skipped && <p className="nv-ss-focus">{L.focus}</p>}
          <div className="nv-ss-lacts">
            <Interactive as="button" type="button" className={`nv-ss-qc${L.note ? ' on' : ''}`} onClick={L.openNote} aria-label={L.note ? `Note: ${L.note}` : 'Note'}><Ico p={P.note} />Note</Interactive>
            <Interactive as="button" type="button" className={`nv-ss-qc${L.painLogged ? ' on' : ''}`} onClick={L.openPain}><Ico p={P.bang} />{L.painLogged ? 'Pain logged' : 'Pain?'}</Interactive>
            <Interactive as="button" type="button" className="nv-ss-qc nv-ss-qd" onClick={L.openMore} aria-label={`More for ${L.name}`}><Dots /></Interactive>
            <Interactive as="button" type="button" className="nv-ss-qc nv-ss-coach" onClick={L.openCoach}><Ico p={P.coach} />Coach</Interactive>
          </div>
        </div>
      </article>
    </div>
  );
}

// ======================================================== the set card ==
function Pills({ S }) {
  return (
    <div className={`nv-ss-pills${S.pills.length > 4 ? ' many' : ''}`} role="group" aria-label={`Sets of ${S.lift.name}`} style={{ '--n': Math.min(6, S.pills.length) }}>
      {S.pills.map((p) => (
        <Interactive key={p.key} as="button" type="button" haptic="tick" onClick={p.pick} aria-label={p.aria} aria-current={p.now ? 'step' : undefined}
          className={`nv-ss-sp${p.done ? ' d' : ''}${p.now ? ' now' : ''}`}>
          {p.done ? <Ico p={P.check} cls="thick" size={13} /> : p.now ? <i aria-hidden="true" /> : null}{p.label}
        </Interactive>
      ))}
    </div>
  );
}

function RestRing({ rest, rs }) {
  const C = 2 * Math.PI * 29.5;
  return (
    <button type="button" className="nv-ss-rest" style={{ '--h': rest.hue }} onClick={rest.skip} data-ss-keep
      aria-label={`Resting, ${rs.label} left. Tap to skip the rest`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="trk" cx="32" cy="32" r="29.5" />
        <circle className="arc" cx="32" cy="32" r="29.5" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - rs.frac) }} />
      </svg>
      <span className="nv-ss-rt"><b>{rs.label}</b><small>rest</small></span>
    </button>
  );
}

function SetCard({ S, rs }) {
  const s = S.set;
  const padUp = !!S.pad;
  const showRest = S.rest && rs.phase === 'resting' && !s.done;
  return (
    <section className="nv-sum-card nv-ss-setcard nv-sum-rise" style={{ '--i': 2 }} aria-label={s.label}>
      <Pills S={S} />
      <div key={s.key} className="nv-ss-slide">
        <div className="nv-ss-sethead">
          <b>{s.label}</b>
          <div className="nv-ss-stype" role="group" aria-label="Set type">
            {s.types.map((t) => (
              <Interactive key={t.k} as="button" type="button" haptic="tick" aria-pressed={t.on} onClick={t.pick}>{t.l}</Interactive>
            ))}
          </div>
        </div>
        <div className={`nv-ss-setrow${s.weight ? '' : ' bw'}`}>
          {s.weight && (
            <button type="button" className={`nv-ss-numbox${s.weight.editing ? ' on' : padUp ? ' dim' : ''}`} onClick={s.weight.open} aria-label={s.weight.aria} data-ss-keep>
              <span className="bn">{s.weight.text}{s.weight.editing && <span className="caret" aria-hidden="true" />}</span><span className="u">{s.weight.unit}</span>
            </button>
          )}
          <button type="button" className={`nv-ss-numbox${s.reps.editing ? ' on' : padUp ? ' dim' : ''}`} onClick={s.reps.open} aria-label={s.reps.aria} data-ss-keep>
            <span className="bn">{s.reps.text}{s.reps.editing && <span className="caret" aria-hidden="true" />}</span><span className="u">{s.reps.unit}</span>
          </button>
          {showRest ? <RestRing rest={S.rest} rs={rs} /> : (
            <Interactive as="button" type="button" haptic="tick" className={`nv-ss-tick${s.done ? ' logged' : ''}`} onClick={s.tick} aria-label={s.tickAria} data-ss-keep>
              <Ico p={P.check} size={30} />
            </Interactive>
          )}
        </div>
        {/* under the pad these fold away IN PLACE (hidden, not removed), so
            nothing above the numerals moves and the tick stays where it was */}
        <div className={padUp ? 'nv-ss-fold' : undefined} aria-hidden={padUp || undefined}>
            <div className={`nv-ss-steps${s.weight ? '' : ' bw'}`}>
              {s.weight && (
                <span className="nv-ss-stpg">
                  <Step label={`−${s.inc}`} aria={`Weight down ${s.inc} kilograms. Hold to repeat`} run={() => s.stepW(-1)} />
                  <Step label={`+${s.inc}`} aria={`Weight up ${s.inc} kilograms. Hold to repeat`} run={() => s.stepW(1)} />
                </span>
              )}
              <span className="nv-ss-stpg">
                <Step label={`−${s.repInc}`} aria={`${s.reps.unit === 'sec' ? `${s.repInc} seconds less` : 'One rep fewer'}. Hold to repeat`} run={() => s.stepR(-1)} />
                <Step label={`+${s.repInc}`} aria={`${s.reps.unit === 'sec' ? `${s.repInc} seconds more` : 'One rep more'}. Hold to repeat`} run={() => s.stepR(1)} />
              </span>
            </div>
            {/* RPE and RIR always on the row (his call, 7 Oct 2026: behind a
                toggle he never logged them) */}
              <div className="nv-ss-effort">
                <span className="nv-ss-mini"><span className="k">RPE</span>
                  <button type="button" onClick={s.rpe.down} aria-label="RPE down half a point"><Ico p={P.minus} size={14} cls="thick" /></button>
                  <b aria-live="polite">{s.rpe.text}</b>
                  <button type="button" onClick={s.rpe.up} aria-label="RPE up half a point"><Ico p={P.plus} size={14} cls="thick" /></button>
                </span>
                <span className="nv-ss-mini"><span className="k">RIR</span>
                  <button type="button" onClick={s.rir.down} aria-label="RIR down half a rep"><Ico p={P.minus} size={14} cls="thick" /></button>
                  <b aria-live="polite">{s.rir.text}</b>
                  <button type="button" onClick={s.rir.up} aria-label="RIR up half a rep"><Ico p={P.plus} size={14} cls="thick" /></button>
                </span>
              </div>
              <div className="nv-ss-qrow">
                {s.done ? (
                  <>
                    <span className="nv-ss-logged"><Ico p={P.check} size={14} cls="thick" />Logged · the tick unticks it</span>
                    {s.remove && <button type="button" className="nv-ss-rm" onClick={s.remove}>Remove set</button>}
                  </>
                ) : (
                  <>
                    {s.coach && (
                      <Interactive as="button" type="button" className={`nv-ss-cchip${s.coach.waiting ? '' : ' on'}`} onClick={s.coach.fill}
                        onLongPress={s.coach.why || undefined} aria-label={s.coach.aria || s.coach.label}>{s.coach.label}</Interactive>
                    )}
                    {s.same && (
                      <Interactive as="button" type="button" haptic="tick" className="nv-ss-same" onClick={s.same.fill} aria-label={s.same.aria}>
                        <Ico p={P.again} />Same as last<small>{s.same.label}</small>
                      </Interactive>
                    )}
                    {!s.coach && !s.same && <span className="nv-ss-hint">Tap a number for the pad · hold a step to run it</span>}
                  </>
                )}
              </div>
        </div>
      </div>
    </section>
  );
}

function DoneCard({ S, rs }) {
  const d = S.allDone;
  const showRest = S.rest && rs.phase === 'resting';
  return (
    <section className="nv-sum-card nv-ss-setcard nv-sum-rise" style={{ '--i': 2 }} aria-label={d.line}>
      <Pills S={S} />
      <div className="nv-ss-done">
        <div className="nv-ss-donel">
          <b>{d.line}</b>
          <div className="nv-ss-donea">
            {d.next && <button type="button" className="nv-ss-next" onClick={d.next.go}>Next: {d.next.name}<Ico p={P.right} size={14} cls="thick" /></button>}
            <button type="button" className="nv-ss-quiet" onClick={d.extra}><Ico p={P.plus} size={14} cls="thick" />Extra set</button>
            {!d.next && <button type="button" className="nv-ss-next" onClick={S.openFinish}>Finish the session</button>}
          </div>
        </div>
        {showRest && <RestRing rest={S.rest} rs={rs} />}
      </div>
    </section>
  );
}

function SkippedCard({ S }) {
  const k = S.skipped;
  return (
    <section className="nv-sum-card nv-ss-setcard nv-sum-rise" style={{ '--i': 2 }} aria-label="Skipped today">
      <div className="nv-ss-done">
        <div className="nv-ss-donel">
          <b>Skipped today · the program stays as it is</b>
          <div className="nv-ss-donea">
            <button type="button" className="nv-ss-quiet" onClick={k.putBack}>Put it back</button>
            {k.next && <button type="button" className="nv-ss-next" onClick={k.next.go}>Next: {k.next.name}<Ico p={P.right} size={14} cls="thick" /></button>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ======================================================= the voice line ==
// One line until the mic opens; then his words, and under them the set they
// parsed to, drawn as a set. Nothing is ticked until he taps it or says yes.
function VoiceLine({ vo }) {
  const hearRef = useRef(vo.hear);
  const baseRef = useRef(vo.base);
  useLayoutEffect(() => { hearRef.current = vo.hear; baseRef.current = vo.base; });
  const [err, setErr] = useState(null);
  const dict = useDictation(() => baseRef.current(), (t) => hearRef.current(t, { final: false }), (t) => hearRef.current(t, { final: true }),
    { continuous: true, onError: (k) => setErr(k === 'not-allowed' ? 'The microphone is blocked for Nova.' : 'The microphone stopped. Tap to try again.') });
  const open = dict.on || dict.hearing || !!vo.heard || !!vo.note;
  if (!dict.supported) {
    return (
      <button type="button" className="nv-ss-voice nv-sum-rise" style={{ '--i': 3 }} onClick={vo.openVoice}>
        <Ico p={P.mic} size={17} />Log it by talking, on Voice<q>{vo.example}</q>
      </button>
    );
  }
  if (!open) {
    return (
      <button type="button" className="nv-ss-voice nv-sum-rise" style={{ '--i': 3 }} onClick={() => { setErr(null); dict.toggle(); }}>
        <Ico p={P.mic} size={17} />Log it by talking<q>{vo.example}</q>
      </button>
    );
  }
  const stop = () => { if (dict.on) dict.toggle(); vo.clear(); };
  const p = vo.preview;
  // THE LINE OPENS WHERE A KEYBOARD WOULD, like the pad: docked over the tab
  // bar, with the quiet line left in place underneath, so the set card, the
  // numerals and the tick do not move while he talks (measured: grown in
  // place, it pushed the parsed set under the bar at iPhone insets)
  return (
    <>
    <span className="nv-ss-voice ghost" aria-hidden="true"><Ico p={P.mic} size={17} />Log it by talking<q>{vo.example}</q></span>
    <div className="nv-ss-vlive" role="region" aria-label={dict.on ? 'Listening' : 'What Nova heard'}>
      <div className="nv-ss-vtop">
        <button type="button" className={`nv-ss-vmic${dict.on ? ' on' : ''}`} onClick={() => { setErr(null); dict.toggle(); }}
          aria-label={dict.on ? 'Stop listening' : 'Listen again'}><Ico p={P.mic} size={17} /></button>
        <q aria-live="polite">{dict.hearing ? 'Hearing it…' : vo.heard || (dict.on ? 'Listening…' : 'Tap the mic to talk again')}</q>
        <button type="button" className="nv-ss-vx" onClick={stop} aria-label="Close the voice line"><Ico p={P.x} size={16} cls="thick" /></button>
      </div>
      {p && (
        <button type="button" className="nv-ss-vset" onClick={p.commit} aria-label={p.aria}>
          {p.weight != null && <span className="vn"><b>{p.weight}</b><small>{p.unit}</small></span>}
          {p.weight != null && <span className="vby">×</span>}
          <span className="vn"><b>{p.reps}</b><small>{p.repUnit}</small></span>
          <span className="vt">{p.type}<small>{p.where}</small></span>
        </button>
      )}
      {p && <p className="nv-ss-vhint">{p.weight != null ? `${p.weight} × ${p.reps}` : `${p.reps} ${p.repUnit}`} · {p.type.toLowerCase()} · <b>tap to log it, or say “yes”</b></p>}
      {!p && vo.miss && <p className="nv-ss-vhint">{vo.miss}</p>}
      {!p && !vo.miss && vo.note && <p className="nv-ss-vhint" role="status">{vo.note}</p>}
      {err && <p className="nv-ss-vhint warn">{err}</p>}
    </div>
    </>
  );
}

// ============================================================ the pad ==
// The page's own: 52px keys where the keyboard would rise, over the tab
// bar. ± the lift's own step, delete, Done → reps. The system keyboard never
// opens, so iOS never zooms.
function Pad({ p }) {
  const key = (k, label, cls = '', aria) => (
    <Interactive key={k} as="button" type="button" haptic="tick" className={`nv-ss-key ${cls}`} onClick={() => p.key(k)} aria-label={aria || label}>{label}</Interactive>
  );
  return (
    <div className="nv-ss-pad" role="group" aria-label={p.label} data-ss-keep>
      <div className="nv-ss-keys">
        {key('1', '1')}{key('2', '2')}{key('3', '3')}{key('-', `−${p.stepLabel}`, 'op', `Down ${p.stepLabel}`)}
        {key('4', '4')}{key('5', '5')}{key('6', '6')}{key('+', `+${p.stepLabel}`, 'op', `Up ${p.stepLabel}`)}
        {key('7', '7')}{key('8', '8')}{key('9', '9')}{key('del', <Ico p={P.del} size={20} />, '', 'Delete')}
        {p.decimals ? key('.', '.') : <span className="nv-ss-key blank" aria-hidden="true" />}{key('0', '0')}
        <Interactive as="button" type="button" haptic="tick" className="nv-ss-key dn" onClick={p.done}>{p.doneLabel}</Interactive>
      </div>
    </div>
  );
}

// ========================================================== a receipt ==
function Receipt({ r }) {
  const dismiss = useRef(r.dismiss);
  useLayoutEffect(() => { dismiss.current = r.dismiss; });
  useEffect(() => {
    const id = setTimeout(() => dismiss.current(), 6000);
    return () => clearTimeout(id);
  }, [r.key]);
  return (
    <div className="nv-ss-receipt" role="status" key={r.key}>
      <span className="nv-ss-ok" aria-hidden="true"><Ico p={P.skip} size={14} /></span>
      <span className="nv-ss-rx"><b>{r.title}</b><span>{r.sub}</span></span>
      <button type="button" className="nv-ss-undo" onClick={r.undo}>Undo</button>
    </div>
  );
}

// =========================================================== the sheets ==
// The house sheet: the Edit sheet's glass (.nv-liquid .nv-sum-sheet), an
// aria-modal root with its z-index inline (the back swipe's contract,
// edgeBack.js), a backdrop that closes it, a grab zone that drags it down.
function Sheet({ label, onClose, head, children, mid }) {
  const exit = useExit(onClose);
  const drag = useSheetDrag(onClose, { threshold: 80 });
  const panelRef = useRef(null);
  const closeRef = useRef(exit.close);
  useLayoutEffect(() => { closeRef.current = exit.close; });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);
  const height = mid ? { height: 'min(64dvh, 620px)' } : { maxHeight: '86dvh' };
  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={label} onClick={exit.close}
      style={{ position: 'fixed', inset: 0, zIndex: 112, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--nv-void) 62%, transparent)', animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)' }}>
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }}
        className="nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-ss-sheet" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={height}>
        <div {...drag.handleProps} onPointerDown={(e) => { if (!onControl(e.target)) drag.handleProps.onPointerDown(e); }}
          className="nv-ss-grab" style={drag.handleProps.style}>
          <span className="nv-ss-handle" aria-hidden="true" />
          {head(exit.close)}
        </div>
        <div className="nv-ss-sbody">{children(exit.close)}</div>
      </div>
    </div>
  );
}
const Head = ({ icon, title, sub, action, onAction, hue }) => (
  <>
    <span className="nv-ss-tile" style={hue ? { '--h': hue } : undefined} aria-hidden="true">{icon}</span>
    <span className="nv-ss-shead"><b>{title}</b>{sub && <span>{sub}</span>}</span>
    <button type="button" className="nv-ss-done-a" onClick={onAction}>{action}</button>
  </>
);

function MoreSheet({ s }) {
  return (
    <Sheet label="More for this lift" onClose={s.close}
      head={(close) => <Head icon={<Dots size={18} />} title="This lift" sub={s.sub} action="Done" onAction={close} />}>
      {() => (
        <div className="nv-ss-mrows">
          {s.rows.map((r) => (r.toggle ? (
            <div key={r.key} className="nv-ss-mrow">
              <span className="nv-ss-mt"><Ico p={P[r.icon]} size={17} /></span>
              <span className="nv-ss-lx"><span className="nm">{r.name}</span><span className="sv">{r.sub}</span></span>
              <label className="nv-sum-switch" data-on={r.on ? 'true' : 'false'}>
                <input type="checkbox" role="switch" ref={switchHapticRef} checked={r.on} onChange={r.run} aria-label={r.name} />
              </label>
            </div>
          ) : (
            <Interactive key={r.key} as="button" type="button" className={`nv-ss-mrow${r.danger ? ' danger' : ''}`} onClick={r.run}>
              <span className="nv-ss-mt"><Ico p={P[r.icon]} size={17} /></span>
              <span className="nv-ss-lx"><span className="nm">{r.name}</span><span className="sv">{r.sub}</span></span>
              {r.go ? <Ico p={P.right} size={14} cls="cv" /> : <span />}
            </Interactive>
          )))}
        </div>
      )}
    </Sheet>
  );
}

function Chips({ list, label }) {
  return (
    <div className="nv-ss-chips" role="group" aria-label={label}>
      {list.map((c) => (
        <button key={c.key} type="button" aria-pressed={c.on} onClick={c.pick}>{c.on && <Ico p={P.check} size={14} cls="thick" />}{c.label}</button>
      ))}
    </div>
  );
}

function PainSheet({ s }) {
  const [other, setOther] = useState(s.otherOpen);
  return (
    <Sheet label={`Pain on ${s.name}`} onClose={s.close}
      head={(close) => <Head icon={<Ico p={P.bang} size={18} />} title={`Pain on ${s.name}`} sub="Coach triages it in this session" action="Cancel" onAction={close} />}>
      {() => (
        <>
          <div className="nv-ss-pgrp"><span className="nv-ss-dk">Where?</span>
            <div className="nv-ss-chips" role="group" aria-label="Where">
              {s.areas.map((c) => <button key={c.key} type="button" aria-pressed={c.on} onClick={c.pick}>{c.on && <Ico p={P.check} size={14} cls="thick" />}{c.label}</button>)}
              <button type="button" aria-pressed={other} onClick={() => setOther(!other)}>Other…</button>
            </div>
            {other && <Chips list={s.other} label="Somewhere else" />}
          </div>
          <div className="nv-ss-pgrp"><span className="nv-ss-dk">Side</span><Chips list={s.sides} label="Side" /></div>
          <div className="nv-ss-pgrp"><span className="nv-ss-dk">When</span><Chips list={s.whens} label="When" /></div>
          <input className="nv-ss-field" value={s.detail} onChange={(e) => s.setDetail(e.target.value)} placeholder="Exact spot, anything else (optional)" aria-label="Exact spot, anything else" />
          <button type="button" className="nv-ss-primary wide" onClick={s.ask} disabled={!s.canAsk}>{s.canAsk ? 'Ask Coach to triage this' : 'Pick where it hurts first'}</button>
        </>
      )}
    </Sheet>
  );
}

function NoteSheet({ s }) {
  const [text, setText] = useState(s.value);
  const ref = useRef(null);
  const textRef = useRef(text);
  useLayoutEffect(() => { textRef.current = text; });
  const grow = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } };
  useLayoutEffect(grow, [text]);
  const save = (t) => { setText(t); s.set(t); };
  const dict = useDictation(() => textRef.current, (t) => save(t), null);
  const close = () => { if (dict.on) dict.toggle(); s.close(); };
  return (
    <Sheet label={`Note on ${s.name}`} onClose={close}
      head={(c) => <Head icon={<Ico p={P.note} size={18} />} title={`Note on ${s.name}`} sub="Coach reads every note you write" action="Done" onAction={c} />}>
      {() => (
        <div className="nv-ss-own">
          <textarea ref={ref} rows={2} value={text} onChange={(e) => save(e.target.value)} placeholder="“felt strong”, “grip gave first”…" aria-label="Note" />
          {dict.supported && (
            <button type="button" className={`nv-ss-vmic${dict.on ? ' on' : ''}`} onClick={dict.toggle} aria-label={dict.on ? 'Stop dictating' : 'Dictate the note'}><Ico p={P.mic} size={17} /></button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function CoachSheet({ s, v }) {
  const logRef = useStickToBottom();
  return (
    <Sheet label="Coach, mid-session" onClose={s.close} mid
      head={(close) => <Head icon={<Ico p={P.coach} size={18} />} title="Coach" sub="Sees this session live" action="Done" onAction={close} />}>
      {() => (
        <>
          <div className="nv-ss-livecard">
            <span className="nv-ss-f3d sm" style={{ '--h': s.hue }} aria-hidden="true"><Ico p={P.fig} size={20} /></span>
            <span className="nv-ss-lx"><span className="nm">{s.live}</span><span className="sv">{s.liveSub}</span></span>
          </div>
          <div ref={logRef} className="nv-ss-log">
            {v.coachMsgs.length === 0 && !v.coachBusy && (
              <div className="nv-ss-starters">
                {s.starters.map((x) => <button key={x.q} type="button" onClick={x.ask}>{x.q}</button>)}
              </div>
            )}
            {v.coachMsgs.map((m, i) => {
              const me = /YOU/.test(m.tag);
              const sys = /SYSTEM/.test(m.tag);
              return (
                <div key={i} className={`nv-ss-msg${me ? ' me' : sys ? ' sys' : ''}`}>
                  {!me && <span className="who">{sys ? 'Nova' : 'Coach'}</span>}
                  {m.typing ? <TypeText text={m.text} active /> : <ChatMarkdown text={m.text} />}
                  {m.panel && <SafeVisual what={`panel:${m.panel.type}`} resetKey={m.at}><VoicePanel panel={m.panel} /></SafeVisual>}
                  {m.proposal && <Proposal p={m.proposal} />}
                  {m.proposals && (
                    <>
                      {m.proposals.map((p, j) => <Proposal key={p.recordId} p={p} n={j + 1} />)}
                      {m.openCount > 1 && <div className="nv-ss-allrow"><button type="button" className="nv-ss-all" onClick={m.applyAll}>Apply all {m.openCount}</button></div>}
                    </>
                  )}
                </div>
              );
            })}
            {v.coachBusy && <p className="nv-ss-busy">Coach looking at your session…</p>}
          </div>
          <div className="nv-ss-ask">
            <Interactive as="input" data-coach-input value={v.coachInput} onChange={v.setCoachInput} onKeyDown={v.coachKey}
              placeholder="Ask mid-workout…" aria-label="Ask Coach mid-workout" className="nv-ss-field" />
            <button type="button" className="nv-ss-quiet" onClick={v.sendCoach}>Ask</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
function Proposal({ p, n }) {
  return (
    <div className="nv-ss-prop">
      {n != null && <span className="pn" aria-hidden="true">{n}</span>}
      <div className="px">
        <b>{p.title}</b>
        <div className="nv-ss-answer">
          {p.status === 'open' && (
            <>
              <button type="button" className="nv-ss-yes" onClick={p.apply}><Ico p={P.check} size={14} cls="thick" />Apply</button>
              <button type="button" className="nv-ss-lnk" onClick={p.decline}>Not now</button>
            </>
          )}
          {p.status === 'working' && <span className="nv-ss-st2">Applying…</span>}
          {p.status === 'done' && <span className="nv-ss-st2 good"><Ico p={P.check} size={14} cls="thick" />Applied · undo in Inbox</span>}
          {p.status === 'dismissed' && <span className="nv-ss-st2">Left alone</span>}
          {p.status === 'error' && <span className="nv-ss-st2">Still waiting in Inbox</span>}
        </div>
      </div>
    </div>
  );
}

function FormSheet({ s }) {
  return (
    <Sheet label={`Form check, ${s.name}`} onClose={s.fc.close} mid
      head={(close) => <Head icon={<Ico p={P.cam} size={18} />} title="Form check" sub={s.name} action="Done" onAction={close} />}>
      {() => <FormCheckPanel fc={s.fc} />}
    </Sheet>
  );
}

function PickerSheet({ s, v, parts }) {
  const Picker = parts.ExercisePicker;
  return (
    <Sheet label="Add an exercise for this session" onClose={s.close} mid
      head={(close) => <Head icon={<Ico p={P.addx} size={18} />} title="Add exercise" sub="This session only" action="Done" onAction={close} />}>
      {() => <Picker v={v} />}
    </Sheet>
  );
}

// ================================================================ finish ==
// THE RECORD GAUGE, the shape the record overlay used to wear: an open
// 270° ring that always completes, the old mark at a FIXED 0.72 of the
// sweep, the arc past it lit, the number counting old → new in one damped
// pass. In the lift's hue: a record waits on nothing, so it is not gold.
// This is the QUIET stage (his pick on mockup 65, 29 Sep): the sheet says
// "You beat last time"; the full moment plays only once the server confirms
// an all-time best (src/RecordMoment.jsx).
const GR = 38;
const GC = 2 * Math.PI * GR;
const GA = GC * 0.75;
const MARK = 0.72;
const at = (f, r) => { const t = ((135 + 270 * f) * Math.PI) / 180; return [50 + r * Math.cos(t), 50 + r * Math.sin(t)]; };
function Gauge({ r }) {
  const [run, setRun] = useState(reduced());
  useEffect(() => {
    if (reduced()) return undefined;
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setRun(true)); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, []);
  const arc = (from, to) => ({ strokeDasharray: `${GA * (to - from)} ${GC}`, strokeDashoffset: -GA * from });
  const [x1, y1] = at(MARK, GR - 5);
  const [x2, y2] = at(MARK, GR + 7);
  const [lx, ly] = at(MARK, GR + 16);
  const pct = (n) => `${((n + 9) / 118) * 100}%`;
  return (
    <div className="nv-ss-prg" style={{ '--h': r.hue }} role="img" aria-label={r.aria}>
      <svg viewBox="-9 -9 118 118" aria-hidden="true">
        <circle className="trk" cx="50" cy="50" r={GR} transform="rotate(135 50 50)" style={arc(0, 1)} />
        <circle className="was" cx="50" cy="50" r={GR} transform="rotate(135 50 50)" style={arc(0, MARK)} />
        <circle className={`past${run ? ' run' : ''}`} cx="50" cy="50" r={GR} transform="rotate(135 50 50)" style={arc(MARK, 1)} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="notch" />
      </svg>
      <span className="nv-ss-was" style={{ left: pct(lx), top: pct(ly) }}>{r.fromLabel}</span>
      <div className="pv">
        <CountUp value={run ? r.to : r.from} duration={1100} format={(n) => (r.decimals ? (Math.round(n * 10) / 10).toFixed(Number.isInteger(r.to) ? 0 : 1) : String(Math.round(n)))} style={{}} />
        <small>{r.unit}</small>
      </div>
    </div>
  );
}

function FinishSheet({ s }) {
  const d = s.discard;
  return (
    <Sheet label={s.title} onClose={s.close}
      head={(close) => <Head icon={<Ico p={P.dumbbell} size={17} />} title={s.title} sub={s.sub} action="Keep going" onAction={close} />}>
      {() => (
        <>
          <div className="nv-ss-trio">
            {s.trio.map((t) => <div key={t.k}><b>{t.v}</b><small>{t.u}</small></div>)}
          </div>
          {s.record && (
            <>
              <Gauge r={s.record} />
              <p className="nv-ss-prl"><b>{s.record.head}</b><span className="l">{s.record.line}</span><span>{s.record.also ? `${s.record.also}. ` : ''}{s.record.meta}</span></p>
            </>
          )}
          {s.cutShort && (
            <div className="nv-ss-fsep">
              <span className="nv-ss-dk">{s.cutShort.head}</span>
              <Chips list={s.cutShort.reasons} label="Why it was cut short" />
            </div>
          )}
          <div className="nv-ss-frow">
            {s.later && <button type="button" className="nv-ss-quiet grow" onClick={s.later}>Save for later</button>}
            <Interactive as="button" type="button" haptic="commit" className="nv-ss-primary grow" onClick={s.finish}>{s.finishLabel}</Interactive>
          </div>
          {!d.confirming ? (
            <div className="nv-ss-foot"><button type="button" onClick={d.ask}>{d.label}</button></div>
          ) : (
            <div className="nv-ss-confirm" role="group" aria-label="Confirm discard">
              <span>{d.line}</span>
              <button type="button" className="nv-ss-discard" onClick={d.yes}>Discard</button>
              <button type="button" className="nv-ss-keep" onClick={d.keep}>Keep</button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
