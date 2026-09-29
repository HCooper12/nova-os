import { useEffect, useId, useRef, useState } from 'react';
import { useExit } from './useExit.js';
import { muscleVar } from './muscleHue.js';
import { haptic } from './haptics.js';
import { primeSfx, recordChime } from './sfx.js';
import { fmtKg } from './sessionSummaryFacts.js';
import { recordPhrase, stackPlan, barPlan, STACK_PIN, REC_TIMELINE } from './recordKit.js';

// THE PERSONAL-BEST MOMENT (29 Sep 2026, design/mockups/65-pb-celebration.html).
// It replaces src/PersonalRecord.jsx on the same entry point — the server's
// `prs` in the finish response — under every style: it is a moment, not a
// screen, so it looks the same wherever he finishes.
//
// His calls, in his words where they decide something:
//   ONE MOMENT, CHOSEN BY THE KIT. "the weight plates being stacked on for the
//     bench press… for the lat pull down… the other plates being stacked on
//     top of each other just like the actual exercise uses… For anything that
//     is more unclear the trophy animation is a nice look." recordKit.js reads
//     the kit from the lift's name; a stack gets the pin, a bar gets the
//     plate, everything else the trophy.
//   THE SOUND FROM THE TROPHY for all of them: the house glass bell as a
//     rising triad (sfx.js CHIMES.record), on the moment's landing.
//   THE MUSCLE HUE on the object ("a nice touch").
//   IT STAYS until he dismisses it: "does not exit until I click on the
//     outside of the pop-up and close the box or I tap out of it another
//     way. I want to make sure that I have the opportunity to actually read
//     it and appreciate it properly." No timer anywhere closes it. Outside
//     the card, the ✕, the back swipe (App gives it a history entry of its
//     own), or Escape.
//   ONE PER LIFT: "If there are multiple personal-bests, then I expect an
//     animation to be played for each exercise as available." Each record
//     waits for his dismissal, then the next plays; "1 of 3" says where he
//     is, Next moves on, Skip all is one quiet act that closes the lot.
//
// THE RING, REFINED BY TAKING IT AWAY. He said of the trophy's ring: "it
// doesn't really seem to depict and tell me much as it currently exists." It
// could not. It was the house gauge: an open 270° arc with the old best
// pinned at a FIXED 0.72 of the sweep, completing every time. A fixed mark is
// a decoration wearing a chart's clothes. The honest alternative — the arc as
// the climb from old to new — has nothing to measure against at this size:
// 60 → 62.5 is 4% of a ring, a sliver of about seven pixels on a 176px
// gauge, and a lift with no earlier history has no start at all. Every
// version said less than the two numbers already say. So the ring is gone,
// and the two things that DO carry meaning carry it: the trophy (this is a
// best ever) and the number, counting up from the old best to the new one so
// the last thing his eye does is watch it cross, with the old best named
// beside it and the rise as a chip. The light that burst through the ring
// still bursts, once, as the trophy lands.
//
// MOTION (apple-design, emil-design-eng): each moment plays ONCE, under
// 1.6 s, and stops. The base style is the final still frame; animation is
// added only when motion is allowed. Critically damped everywhere except the
// two things that ARRIVE moving (the trophy, the stamped number), which
// overshoot once. A tap on the object plays it again. Reduced motion: the
// object at rest and the final number, faded in; the sheet still waits for
// him. The landing (sound, haptic) runs on the ANIMATION clock — an
// element-bound keyframe-less animation — never a setTimeout, so a slowed or
// seeked recording moves the count and the landing with the picture (the
// SpinReveal lesson, memory nova-spin-reveal).


const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const d = (ms) => ({ '--d': `${ms}ms` });

// ------------------------------------------------------------ the readout --
// Old best, the number, what it was lifted for, the rise. `count` makes the
// number climb (the trophy); otherwise the old one drops and the new one is
// stamped (the kit moments), at `stampAt`.
function Readout({ rec, across, count, stampAt = 0, numRef }) {
  const estimated = rec.kind !== 'weight';
  const to = fmtKg(rec.value);
  const from = rec.previous != null ? fmtKg(rec.previous) : null;
  const unit = estimated ? 'kg, est. 1-rep max' : `kg × ${rec.reps}`;
  const long = to.length >= 5 ? ' long' : '';
  const was = from != null && <span className="nv-rec-was">old best <b>{from}</b></span>;
  const up = rec.delta != null && rec.delta > 0 && <span className="nv-rec-up" data-a="" style={d(stampAt + 120)}>+{fmtKg(rec.delta)} kg</span>;
  const num = (
    <div className={`nv-rec-num${long}`}>
      {count
        ? <b ref={numRef} className="count" data-a="" style={d(stampAt)}>{to}</b>
        : (
          <>
            {from != null && <b className="old" data-a="" style={d(Math.max(0, stampAt - 100))} aria-hidden="true">{from}</b>}
            <b className="new" data-a="" style={d(stampAt)}>{to}</b>
          </>
        )}
    </div>
  );
  if (across) {
    return (
      <div className="nv-rec-ro across">
        <div className="nv-rec-numrow">{num}<small>{unit}</small></div>
        {(was || up) && <div className="nv-rec-roline">{was}{up}</div>}
      </div>
    );
  }
  return (
    <div className="nv-rec-ro">
      {was}
      {num}
      <small>{unit}</small>
      {up}
    </div>
  );
}

// ---------------------------------------------------------- the trophy --
function Trophy({ rec, numRef }) {
  const g = `nvrec${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const rays = [];
  for (let i = 0; i < 12; i++) {
    if (i === 2 || i === 3) continue;          // the foot, where the trophy stands
    const a = ((i * 30 + 15) * Math.PI) / 180;
    const r0 = i % 2 ? 37 : 36;
    const r1 = i % 2 ? 43 : 47;
    rays.push(<line key={i} x1={(r0 * Math.cos(a)).toFixed(2)} y1={(r0 * Math.sin(a)).toFixed(2)} x2={(r1 * Math.cos(a)).toFixed(2)} y2={(r1 * Math.sin(a)).toFixed(2)} />);
  }
  return (
    <>
      <div className="nv-rec-stage nv-rec-tro">
        <div className="nv-rec-glow" data-a="" style={d(480)} />
        <svg className="nv-rec-rays" data-a="" style={d(560)} viewBox="-50 -50 100 100" aria-hidden="true">{rays}</svg>
        <div className="nv-rec-well">
          <svg className="nv-rec-cup" data-a="" style={d(60)} viewBox="0 0 64 76" aria-hidden="true">
            <defs>
              <linearGradient id={g} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--h) 50%, #fff)' }} />
                <stop offset=".42" style={{ stopColor: 'var(--h)' }} />
                <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--h) 48%, #000)' }} />
              </linearGradient>
            </defs>
            <path d="M12 11H6.5C4.6 11 3.5 12.6 3.5 15.5 3.5 23 8 28.5 15 30M52 11h5.5c1.9 0 3 1.6 3 4.5C60.5 23 56 28.5 49 30" fill="none" stroke={`url(#${g})`} strokeWidth="4" strokeLinecap="round" />
            <path d="M12 6H52V18C52 33 44 43 32 45 20 43 12 33 12 18Z" fill={`url(#${g})`} />
            <rect x="11" y="4.5" width="42" height="4" rx="2" style={{ fill: 'color-mix(in srgb, var(--h) 40%, #fff)' }} />
            <path d="M17 11C17 25 20.5 33 26 38.5 22.5 32.5 20.5 25 20.5 11Z" fill="#fff" opacity=".42" />
            {/* the house dumbbell, engraved on the cup */}
            <path d="M24.5 21.5v5M27.5 19.5v9M36.5 19.5v9M39.5 21.5v5M27.5 24h9" fill="none" strokeWidth="2.2" strokeLinecap="round" style={{ stroke: 'color-mix(in srgb, var(--h) 30%, #05070d)' }} />
            <path d="M28.5 45h7l-1 10h-5Z" fill={`url(#${g})`} />
            <rect x="20" y="55" width="24" height="7" rx="2" fill={`url(#${g})`} />
            <rect x="15" y="62" width="34" height="10" rx="2.5" style={{ fill: 'color-mix(in srgb, var(--h) 35%, #10131f)' }} />
          </svg>
        </div>
      </div>
      <Readout rec={rec} across count stampAt={REC_TIMELINE.trophy.peak} numRef={numRef} />
    </>
  );
}

// ------------------------------------------------------------ the stack --
// A close window on the pin-loaded stack, labelled at the lift's own step
// (recordKit.stackPlan). The pin comes out of the plate that reads his old
// best, drops the plates between, and goes in at today's; the plates the pin
// now lifts light (the old selection dim, the new in full hue); the number is
// stamped; the stack lifts once, like a rep.
function Stack({ rec }) {
  const plan = stackPlan(rec);
  const y = (i) => 6 + i * 27;
  const plate = (p) => (
    <g key={p.i}>
      <rect className="pl" x="22" y={y(p.i)} width="106" height="23" rx="4" />
      {p.lifted && <rect className={`lit${p.i > STACK_PIN - plan.drop ? ' new' : ' was'}`} data-a="" style={d(750)} x="22" y={y(p.i)} width="106" height="23" rx="4" />}
      <circle className="hole" cx="116" cy={y(p.i) + 11.5} r="3" />
      {p.label && <text className="lab" x="34" y={y(p.i) + 16.5}>{p.label}</text>}
      {/* today's number, dark on the lit plate, lights with it */}
      {p.label && p.today && <text className="lab on" data-a="" style={d(750)} x="34" y={y(p.i) + 16.5}>{p.label}</text>}
    </g>
  );
  const lifted = plan.plates.filter((p) => p.lifted);
  const rest = plan.plates.filter((p) => !p.lifted);
  return (
    <div className="nv-rec-stage nv-rec-split">
      <div className="nv-rec-stack">
        <svg viewBox="0 0 150 220" aria-hidden="true">
          <rect className="rod" x="12" y="0" width="3" height="220" rx="1.5" />
          <rect className="rod" x="135" y="0" width="3" height="220" rx="1.5" />
          <g className="sel" data-a="" style={d(1000)}>
            {lifted.map(plate)}
            <g className="pin" data-a="" style={{ ...d(0), '--drop': plan.drop }}>
              <rect x="100" y={y(STACK_PIN) + 9.5} width="40" height="4" rx="2" />
              <circle cx="142" cy={y(STACK_PIN) + 11.5} r="7" />
            </g>
          </g>
          {rest.map(plate)}
        </svg>
      </div>
      <Readout rec={rec} stampAt={REC_TIMELINE.stack.peak} />
    </div>
  );
}

// ---------------------------------------------------------- the barbell --
// The sleeve in profile (recordKit.barPlan): last time's load in ink, the
// rise per side slides on in the hue, knocks the others, the collar clamps.
const PLATE_DRAW = { 25: [25, 150], 20: [23, 150], 15: [21, 130], 10: [19, 114], 5: [14, 84], 2.5: [10, 64], 1.25: [8, 52] };
function Barbell({ rec }) {
  const plan = barPlan(rec);
  let x = 98;
  const olds = plan.old.map((w, i) => {
    const [pw, ph] = PLATE_DRAW[w] || PLATE_DRAW[20];
    const r = <rect key={i} className="pl" x={x} y={75 - ph / 2} width={pw} height={ph} rx={pw > 12 ? 4 : 3} />;
    x += pw + 2;
    return r;
  });
  const nx = x;
  // the label clears the plate beside it, so it never sits on last time's load
  const lastH = (PLATE_DRAW[plan.old[plan.old.length - 1]] || PLATE_DRAW[20])[1];
  const nw = plan.perSide >= 5 ? 14 : 10;
  const nh = plan.perSide >= 5 ? 84 : 64;
  const cx = nx + nw + 2;
  return (
    <div className="nv-rec-stage nv-rec-bar">
      <svg viewBox="0 0 320 150" aria-hidden="true">
        <rect className="shaft" x="0" y="70" width="84" height="10" rx="2" />
        <rect className="metal2" x="82" y="57" width="14" height="36" rx="3" />
        <rect className="metal" x="96" y="67" width="214" height="16" rx="3" />
        <g className="olds" data-a="" style={d(520)}>{olds}</g>
        <g className="np" data-a="" style={d(0)}>
          <rect className="newp" x={nx} y={75 - nh / 2} width={nw} height={nh} rx="3" />
          <text className="newlab" x={nx + nw / 2} y={75 - Math.max(nh, lastH) / 2 - 8} textAnchor="middle">{plan.perSideLabel}</text>
        </g>
        <g className="collar" data-a="" style={d(600)}>
          <rect className="metal2" x={cx} y="59" width="17" height="32" rx="3" />
          <rect className="metal2" x={cx + 6} y="44" width="5" height="17" rx="2" />
        </g>
      </svg>
      <Readout rec={rec} across stampAt={REC_TIMELINE.barbell.peak} />
    </div>
  );
}

// ------------------------------------------------------------ the moment --
// One record, one play. `take` is how many times it has played (a tap on the
// object plays it again), so each play is a fresh mount with a fresh clock.
function Moment({ rec, take, sound }) {
  const kind = rec.moment in REC_TIMELINE ? rec.moment : 'trophy';
  const tl = REC_TIMELINE[kind];
  const rootRef = useRef(null);
  const numRef = useRef(null);
  useEffect(() => {
    const el = rootRef.current;
    const still = reduced();
    // the sound goes on the AUDIO clock at the moment the picture starts, so
    // the chime lands on the landing; silent unless a tap armed it
    const snd = sound ? recordChime(still ? 150 : tl.peak) : null;
    if (still || !el || typeof el.animate !== 'function') {
      if (!still) haptic('celebrate');
      return () => snd?.stop?.();
    }
    const clock = el.animate([], { duration: tl.total });
    let fired = false;
    let raf = 0;
    const from = rec.previous;
    const to = rec.value;
    const frame = () => {
      const t = Number(clock.currentTime) || 0;
      if (tl.count && numRef.current && from != null && from !== to) {
        const [t0, t1] = tl.count;
        const p = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
        const e = 1 - Math.pow(1 - p, 3);
        numRef.current.textContent = fmtKg(from + (to - from) * e);
      }
      if (!fired && t >= tl.peak) { fired = true; haptic('celebrate'); }
      if (clock.playState !== 'finished') raf = requestAnimationFrame(frame);
      else if (numRef.current) numRef.current.textContent = fmtKg(to);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); clock.cancel(); snd?.stop?.(); };
  }, [rec, tl, sound]);

  const phrase = recordPhrase('confirmed', rec);
  const object = kind === 'stack' ? <Stack rec={rec} /> : kind === 'barbell' ? <Barbell rec={rec} /> : <Trophy rec={rec} numRef={numRef} />;
  return (
    <div ref={rootRef} className="nv-rec-moment go" data-moment={kind} data-take={take}>
      {object}
      <p className="nv-rec-words">
        <b data-a="" style={d(tl.peak)}>{phrase.head}</b>
        <span className="l">{phrase.line}</span>
        <span className="m">{phrase.meta}</span>
      </p>
    </div>
  );
}

export function RecordMoment({ records, index = 0, onDismiss, onSkipAll }) {
  const list = Array.isArray(records) ? records : [];
  const i = Math.max(0, Math.min(index, list.length - 1));
  const rec = list[i];
  const n = list.length;
  const last = i >= n - 1;
  // one exit, two ways out: this record (the default) or all of them; the
  // card falls away the same either way
  const way = useRef('one');
  const exit = useExit(() => (way.current === 'all' ? onSkipAll : onDismiss)?.());
  const [take, setTake] = useState(0);

  // Escape dismisses it, like every other overlay. ABOVE the early return:
  // a hook after a conditional return changes the hook order between renders.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') exit.close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exit]);

  if (!rec) return null;
  const hue = (rec.muscle && muscleVar(rec.muscle) !== 'var(--nv-ink40)') ? muscleVar(rec.muscle) : 'var(--nv-cy)';
  const phrase = recordPhrase('confirmed', rec);
  const stop = (e) => e.stopPropagation();
  // a tap on the object plays it again, and is the gesture iOS needs to sound
  const replay = () => { primeSfx(); setTake((t) => t + 1); };
  const next = () => { primeSfx(); exit.close(); };

  return (
    <div role="dialog" aria-modal="true" aria-label={phrase.aria} onClick={exit.close} ref={exit.scrimRef}
      className="nv-rec-scrim" style={{ zIndex: 125 }}>
      <div ref={exit.panelRef} onClick={stop} className="nv-liquid nv-liquid-thick nv-materialize nv-rec-card" style={{ '--h': hue }}>
        <div className="nv-rec-top">
          {n > 1 ? <span className="nv-rec-count">{i + 1} of {n}</span> : <span />}
          <button type="button" className="nv-rec-x" aria-label={last ? 'Close' : 'Next record'} onClick={next}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="nv-rec-play" role="button" tabIndex={0} aria-label="Play it again" onClick={replay}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); replay(); } }}>
          <Moment key={take} rec={rec} take={take} sound />
        </div>
        {!last && (
          <div className="nv-rec-foot">
            <button type="button" className="nv-rec-skip" onClick={(e) => { stop(e); way.current = 'all'; exit.close(); }}>Skip all</button>
            <button type="button" className="nv-rec-next" onClick={(e) => { stop(e); next(); }}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
