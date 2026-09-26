import { useState } from 'react';
import { promoteLead } from '../workBlock.js';
import { Elapsed } from '../Elapsed.jsx';
import { css } from '../css.js';
import { glowPanel } from '../glowPanel.js';
import { LeaderBox } from '../LeaderBox.jsx';
import { PracticeCard } from '../PracticeCard.jsx';
import { StuckCard } from '../StuckCard.jsx';
import { RepertoireBook } from '../RepertoireBook.jsx';
import { TechniqueReveal } from '../TechniqueReveal.jsx';
import { SpinReveal, ShuffleButton } from '../SpinReveal.jsx';
import { TechniqueCheck } from '../TechniqueCheck.jsx';
import { RingTile } from '../RingTile.jsx';
import { resolveFolds, foldStatus, foldInstrument, FOLD_LABELS, NEVER_FOLD, loadFolds, saveFolds } from '../missionFold.js';
import { Eyebrow, TextAction, Tag, Meta } from '../Controls.jsx';
import { haptic } from '../haptics.js';

// a word the view model hands up in caps ("CONSIDER") read as a word
const cap = (s) => { const t = String(s || '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { Clock } from '../Clock.jsx';
import { StepsHistory } from '../StepsHistory.jsx';
import { CalendarView } from '../CalendarView.jsx';
import { FocusChip } from '../FocusChip.jsx';
import { TabIcon } from '../TabIcon.jsx';
import { Group, GRow, MetricTile, Pill } from '../AppleLayout.jsx';

// Mission Control in the "Apple layout" — same view model as the classic
// screen, rendered as a grouped stack whose ORDER follows the day:
// mornings lead with vitals (the body report is the news), the rest of the
// day leads with Suggested Focus + Today (what to do next is the news).
// The hero shrinks to a slim strip outside the morning — the living core
// stays, the space it claimed doesn't. All deterministic, no model calls.

const M = 'var(--nv-font-mono)';
const UI = 'var(--nv-font-ui)';
const S = 'var(--nv-font-serif)';

// One place for the three orders, so a new section is added to all three or
// the dev assert below names the one it was left out of (audit [63]).
const ORDERS = {
  morning: ['working', 'hero', 'vitals', 'wrap', 'plan', 'stuck', 'lead', 'practice', 'focus', 'today', 'deck', 'review', 'noticed', 'shortcuts', 'agents'],
  day: ['working', 'wrap', 'focus', 'lead', 'practice', 'plan', 'stuck', 'today', 'deck', 'hero', 'vitals', 'noticed', 'review', 'shortcuts', 'agents'],
  // by evening the wrap IS the news — it leads, under anything still running
  evening: ['working', 'wrap', 'focus', 'plan', 'stuck', 'lead', 'practice', 'today', 'deck', 'vitals', 'review', 'hero', 'noticed', 'shortcuts', 'agents'],
};
let ordersChecked = false;
export function assertOrdersCover(sectionKeys, orders = ORDERS) {
  const problems = [];
  for (const [name, arr] of Object.entries(orders)) {
    const missing = sectionKeys.filter((k) => !arr.includes(k));
    const extra = arr.filter((k) => !sectionKeys.includes(k));
    if (missing.length) problems.push(`${name} order drops section(s): ${missing.join(', ')}`);
    if (extra.length) problems.push(`${name} order names unknown section(s): ${extra.join(', ')}`);
  }
  if (problems.length && !ordersChecked) console.error('[MissionStructured] ' + problems.join(' · '));
  ordersChecked = true;
  return problems;
}

// C1 — a folded section, drawn as an INSTRUMENT (Session B of the 22 Sep
// aesthetic review). Six identical boxes became six different objects: a
// 44px glyph slot on the left carries the section's fact in its own form
// and hue (src/missionFold.js foldInstrument), the label sits over a status
// line that may take two lines instead of truncating mid-word, and the six
// arrive in a 40ms cascade. Tap to open. The open state is remembered per
// section (src/missionFold.js).
const HUE = (h) => (h === 'ink40' ? 'var(--nv-ink40)' : `var(--nv-${h})`);
const VERDICT = { good: 'var(--nv-good)', behind: 'var(--nv-gold)', missed: 'var(--nv-warn)' };

function FoldGlyph({ inst }) {
  const hue = HUE(inst.hue);
  const lit = inst.hue !== 'ink40';
  let body;
  switch (inst.kind) {
    case 'live':
      body = <span style={{ width: 9, height: 9, borderRadius: '50%', background: hue, boxShadow: `0 0 12px ${hue}`, animation: 'novaPulse 2s infinite var(--nv-anim)' }} />;
      break;
    case 'dot':
      body = <span style={{ width: 9, height: 9, borderRadius: '50%', background: hue, boxShadow: lit ? `0 0 10px -2px ${hue}` : 'none' }} />;
      break;
    case 'aim':
      // two rings and a centre: a thing to aim at — his to take up
      body = (
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="9" fill="none" stroke={hue} strokeWidth="1.5" opacity={lit ? 0.9 : 0.6} />
          <circle cx="11" cy="11" r="3" fill={hue} />
        </svg>
      );
      break;
    case 'count':
    case 'when':
      body = <span style={{ font: `400 ${String(inst.text).length > 2 ? 15 : 21}px ${S}`, color: hue, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{inst.text}</span>;
      break;
    case 'verdicts':
      // one dot per ring, the ring's own verdict colour; a gap is hollow and dashed
      body = (
        <span style={{ display: 'flex', gap: 4 }}>
          {inst.states.map((st, i) => (
            <span key={i} style={st === 'absent'
              ? { width: 7, height: 7, borderRadius: '50%', border: '1px dashed var(--nv-ink40)', boxSizing: 'border-box' }
              : { width: 7, height: 7, borderRadius: '50%', background: VERDICT[st], boxShadow: `0 0 8px -2px ${VERDICT[st]}` }} />
          ))}
        </span>
      );
      break;
    case 'icons':
      body = (
        <span style={{ display: 'flex', gap: 3 }}>
          {inst.icons.map((ic) => <span key={ic.name} style={{ color: HUE(ic.hue) }}><TabIcon name={ic.name} size={15} /></span>)}
        </span>
      );
      break;
    case 'arc': {
      // one dot per agent on an arc around the slot's centre, the live ones lit
      const n = inst.dots.length || 1;
      body = (
        <svg width="36" height="24" viewBox="0 0 36 24" aria-hidden="true">
          {inst.dots.map((on, i) => {
            const a = Math.PI * (1 - (n === 1 ? 0.5 : i / (n - 1)));
            const x = 18 + 15 * Math.cos(a);
            const y = 19 - 15 * Math.sin(a);
            return <circle key={i} cx={x} cy={y} r={on ? 2.4 : 1.8} fill={on ? hue : 'var(--nv-ink40)'} opacity={on ? 1 : 0.5} />;
          })}
        </svg>
      );
      break;
    }
    case 'lamps':
      // Practice's own object, smallest size: a dot per move, lit once landed
      body = (
        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 34 }}>
          {inst.lamps.map((on, i) => (
            <span key={i} style={on
              ? { width: 7, height: 7, borderRadius: '50%', background: hue, boxShadow: `0 0 8px -1px ${hue}` }
              : { width: 7, height: 7, borderRadius: '50%', border: `1px solid color-mix(in srgb, ${hue} 45%, transparent)`, boxSizing: 'border-box' }} />
          ))}
        </span>
      );
      break;
    default:
      body = null;
  }
  return (
    <span aria-hidden="true" style={{ flex: 'none', width: 44, height: 44, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: lit ? `color-mix(in srgb, ${hue} 9%, transparent)` : 'color-mix(in srgb, var(--nv-ink) 4%, transparent)',
      boxShadow: lit ? `inset 0 1px 0 color-mix(in srgb, ${hue} 35%, transparent), 0 0 20px -10px ${hue}` : 'inset 0 1px 0 color-mix(in srgb, var(--nv-ink) 8%, transparent)' }}>
      {body}
    </span>
  );
}

function FoldRow({ label, status, inst, index, onOpen }) {
  const lit = inst.hue !== 'ink40';
  return (
    <Interactive as="section" onClick={onOpen} role="button" aria-expanded="false" aria-label={`Open ${label}`}
      className="nv-deck-rise" style={{ animationDelay: `${index * 40}ms` }}
      base={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 12px 9px 9px', borderRadius: '15px', cursor: 'pointer', background: 'var(--nv-glass)', border: '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)', boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--nv-ink) 9%, transparent)' }}
      hoverStyle={{ borderColor: 'color-mix(in srgb, var(--nv-ink) 16%, transparent)' }}>
      <FoldGlyph inst={inst} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <Eyebrow as="span" tone="faint">{label}</Eyebrow>
        <span style={{ font: `450 13.5px/1.35 ${UI}`, color: lit ? `color-mix(in srgb, ${HUE(inst.hue)} 72%, var(--nv-ink))` : 'var(--nv-ink60)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{status}</span>
      </span>
      <span aria-hidden="true" style={{ flex: 'none', color: 'var(--nv-ink40)', font: `400 12px ${M}` }}>▸</span>
    </Interactive>
  );
}

export function MissionStructured({ v }) {
  const mob = v.isMobile;
  const hour = new Date().getHours();
  const morning = hour < 10;
  // C1 — what he has opened or folded himself, over the hour's default
  const [remembered, setRemembered] = useState(loadFolds);
  const setFold = (k, state) => {
    haptic('tick'); // a fold is a toggle — the lightest tick iOS has (native shell only)
    const next = { ...remembered, [k]: state };
    setRemembered(next);
    saveFolds(next);
  };
  // the same four domains the body metrics use (valsMission VITAL_DOMAIN):
  // sleep is recovery, steps are activity, protein is fuel. Six ad-hoc hues
  // across these eight tiles was the fault; the system is the fix.
  const vitals = [
    { key: 'sleep', color: '--nv-cy', ...v.satSleep },
    { key: 'steps', color: '--nv-vi', ...v.satSteps },
    { key: 'protein', color: '--nv-good', ...v.satProtein },
    ...v.bodyMetrics,
  ];

  const sections = {
    hero: morning ? (
      <div key="hero" className="nv-pane" style={{ marginTop: '16px', padding: '16px 18px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <Interactive onClick={v.openVoice} aria-label="Open Voice — talk to Nova"
          base={{ position: 'relative', flex: 'none', width: mob ? 84 : 104, height: mob ? 84 : 104, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'var(--nv-glow-core)' }} hoverStyle={{}}>
          <NovaCore size={mob ? 84 : 104} engine={v.coreStyle} />
        </Interactive>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Eyebrow tone="cyan">{v.coreLabel}</Eyebrow>
          <p style={{ margin: '6px 0 0', font: `450 14.5px/1.55 ${UI}`, color: 'var(--nv-ink60)' }}>
            {v.heroStand.map((seg, i) => (
              <span key={i} style={seg.b ? { color: 'var(--nv-ink)', fontWeight: 650 } : seg.cy ? { color: 'var(--nv-cy)', fontWeight: 650 } : undefined}>{seg.t}</span>
            ))}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px', marginTop: '12px' }}>
            <Pill label="Engage next block" onClick={v.onEngage} />
            <Pill label="⌘K Summon" onClick={v.openPalette} tone="quiet" />
          </div>
        </div>
      </div>
    ) : (
      // outside the morning the core keeps its presence, not its acreage
      <div key="hero" className="nv-pane" style={{ marginTop: '14px', padding: '10px 14px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <Interactive onClick={v.openVoice} aria-label="Open Voice — talk to Nova" base={{ flex: 'none', width: 44, height: 44, borderRadius: '50%', cursor: 'pointer' }} hoverStyle={{}}>
          <NovaCore size={44} engine={v.coreStyle} />
        </Interactive>
        <p style={{ margin: 0, minWidth: 0, flex: 1, font: `450 13px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>
          {v.heroStand.map((seg, i) => (
            <span key={i} style={seg.b ? { color: 'var(--nv-ink)', fontWeight: 650 } : seg.cy ? { color: 'var(--nv-cy)', fontWeight: 650 } : undefined}>{seg.t}</span>
          ))}
        </p>
        <Pill label="Engage" onClick={v.onEngage} />
      </div>
    ),

    vitals: (
      <Group key="vitals" label="Vitals" trailing={<span style={{ font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', color: 'var(--nv-ink40)' }}>{v.bodyMetricsMeta}</span>}>
        {/* B1 — the ring, everywhere. Readiness was the best object in the
            product and appeared on one screen; here it sits with protein,
            steps and sleep, colour carrying the verdict (missionFocus.ringState)
            and a dashed ring for a metric that was not reported. */}
        {/* The four rings stay the same size. Drawing the focal one larger
            was tried and reverted on 23 Sep: unequal rings in a four-up grid
            leave their labels on four different baselines, and a ragged row
            costs more than the emphasis buys. The focal treatment belongs to
            the tiles below, which have a column to spare. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', padding: '12px 10px 10px', borderBottom: '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)' }}>
          {v.ringVitals.map(({ key, ...r }) => <RingTile key={key} {...r} size={mob ? 56 : 62} />)}
        </div>
        {/* ONE FOCAL POINT (review finding 22). Eight tiles at identical size
            gave the block no subject — "when everything competes equally,
            nothing wins" (interface-design). The metric furthest behind takes
            the full width and leads, and ONLY when something is behind: on a
            day he is on top of all four the grid stays even, because inventing
            a leader out of a set of wins is false urgency. The rule is pure
            and tested (missionFocus.pickFocalVital). */}
        <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr 1fr' : 'repeat(4,1fr)', gap: '2px', padding: '6px 8px' }}>
          {vitals.map((m) => (
            <MetricTile key={m.key} m={m}
              style={m.key === v.focalVital ? { gridColumn: '1 / -1' } : undefined} />
          ))}
        </div>
      </Group>
    ),

    focus: (
      <Group key="focus" label="Suggested focus" trailing={<span style={{ font: `italic 400 13px ${S}`, color: 'var(--nv-gold)' }}>{v.suggestedFocus.source}</span>}>
        <div style={{ padding: '13px 16px' }}>
          <div style={{ font: `400 21px/1.25 ${S}`, textWrap: 'pretty' }}>
            {v.suggestedFocus.title}<em style={{ fontStyle: 'italic', color: 'var(--nv-gold)' }}>{v.suggestedFocus.accent}</em>
          </div>
          {v.suggestedFocus.detail && <p style={{ margin: '9px 0 0', font: `450 13.5px/1.55 ${UI}`, color: 'var(--nv-ink60)' }}>{v.suggestedFocus.detail}</p>}
          {(v.suggestedFocus.onPrimary || v.suggestedFocus.onSecondary) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px', marginTop: '12px' }}>
              {v.suggestedFocus.onPrimary && <Pill label={v.suggestedFocus.primaryLabel} onClick={v.suggestedFocus.onPrimary} />}
              {v.suggestedFocus.onSecondary && <Pill label={v.suggestedFocus.secondaryLabel} onClick={v.suggestedFocus.onSecondary} tone="quiet" />}
            </div>
          )}
        </div>
      </Group>
    ),

    // WORKING — the persistent answer to "is anything actually happening?".
    // His standing requirement after a book analysis ran 40 minutes with no
    // sign of life anywhere: any agent doing work is visible on the home
    // screen, always, without him going to look for it.
    working: v.jobTray.jobs.length > 0 ? (
      <Group key="working" label="Nova is working" accent="--nv-cy" trailing={<Meta tone={v.jobTray.running ? 'cyan' : v.jobTray.waiting ? 'good' : 'warn'}>{v.jobTray.countLabel}</Meta>}>
        {v.jobTray.jobs.map((j, i) => [(
          <GRow key={j.id} first={i === 0}
            leading={<span style={{ font: `600 12px ${M}`, color: j.failed ? 'var(--nv-warn)' : j.done ? 'var(--nv-good, #5aa87c)' : 'var(--nv-cy)' }}>{j.failed ? '✕' : j.done ? '✓' : '◍'}</span>}
            title={j.label}
            trailing={j.dismiss ? <Interactive as="span" onClick={(e) => { e.stopPropagation(); j.dismiss(); }} aria-label="Clear this failed job"
              base={{ cursor: "pointer", font: "600 11px var(--nv-font-ui)", letterSpacing: ".08em", color: "var(--nv-ink40)", padding: "9px 10px", margin: "-9px -10px", display: "inline-flex", alignItems: "center", minHeight: "30px", borderRadius: "8px" }}
              hoverStyle={{ color: "var(--nv-warn)" }}>CLEAR</Interactive> : (
              <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flex: 'none' }}>
                {j.note && <Meta tone="faint">{j.note}</Meta>}
                <Elapsed job={j} />
              </span>
            )}
            onClick={j.go || undefined} />
        ),
        // THE PANEL, named. Buildpad's demo showed four researchers each
        // saying what it was doing; this is the same thing over Nova's own
        // agents. Only rendered when a job actually fanned out.
        ...(j.workers || []).map((w) => (
          <div key={`${j.id}-${w.name}`} style={{ display: 'flex', alignItems: 'baseline', gap: '9px',
            padding: '5px 16px 5px 40px', font: 'var(--nv-micro-l)',
            color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>
            <span style={{ flex: 'none', color: w.status === 'error' ? 'var(--nv-warn)' : w.status === 'done' ? 'var(--nv-good, #5aa87c)' : 'var(--nv-cy)' }}>
              {w.status === 'error' ? '✕' : w.status === 'done' ? '✓' : '◌'}
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
            {w.status === 'done' && w.found > 0 && (
              <span style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{w.found}</span>
            )}
          </div>
        ))])}
      </Group>
    ) : null,

    // WRAP THE DAY — the evening's news, in the house objects: two rings,
    // the serif line, and the fix he can still act on tonight.
    wrap: v.wrapCard ? (v.wrapCard.onlyTechnique ? (
      // the evening with nothing logged: the wrap is today's technique alone
      <Group key="wrap" label="Wrap the day" accent="--nv-mg" trailing={<Meta tone="faint">{v.wrapCard.note}</Meta>}>
        <div style={{ padding: '14px 16px', animation: 'popIn var(--nv-dur-base) var(--nv-ease) both' }}>
          <TechniqueCheck q={v.wrapCard.technique} label={false} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <TextAction tone="faint" onClick={v.wrapCard.dismiss}>Dismiss</TextAction>
          </div>
        </div>
      </Group>
    ) : (
      <Group key="wrap" label="Wrap the day" accent={v.wrapCard.floorMet === false ? '--nv-gold' : '--nv-good'} trailing={<Meta tone={v.wrapCard.floorMet === false ? 'gold' : 'good'}>{v.wrapCard.note}</Meta>}>
        <div style={{ padding: '14px 16px', animation: 'popIn var(--nv-dur-base) var(--nv-ease) both' }}>
          {/* on a phone the rings sit ABOVE the line — beside it the serif
              was squeezed into a nine-word-tall column (seen at 375px) */}
          <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', alignItems: mob ? 'stretch' : 'center', gap: mob ? '14px' : '20px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '18px', flex: 'none' }}>
              {v.wrapCard.rings.map(({ key, ...r }) => <RingTile key={key} {...r} size={58} />)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ font: `400 ${mob ? 18 : 19}px/1.35 ${S}`, textWrap: 'pretty', color: 'var(--nv-ink)' }}>{v.wrapCard.line}</div>
            </div>
          </div>
          {v.wrapCard.fix && (
            <p style={{ margin: '11px 0 0', font: `450 12.5px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>{v.wrapCard.fix}</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '9px', marginTop: '13px' }}>
            <Pill label="Read it to me" onClick={v.wrapCard.speak} />
            {v.wrapCard.fix && <Pill label="Open Fuel" onClick={v.wrapCard.openFuel} tone="quiet" />}
            <TextAction tone="faint" onClick={v.wrapCard.dismiss}>Dismiss</TextAction>
          </div>
          {/* did today's technique land? (25 Sep) — its own sub-section */}
          <TechniqueCheck q={v.wrapCard.technique} divided />
        </div>
      </Group>
    )) : null,

    // TWO FACES, HIS SWIPE (15 Sep). Was `v.leaderToday` alone; the box now
    // carries the day's idea AND the live situation, and he swipes between
    // them. Both come from one view model so the two idioms cannot disagree.
    lead: v.leaderBox ? <LeaderBox key="lead" box={v.leaderBox} variant="apple" mob={mob} /> : null,

    // PRACTICE (27 Sep) — the next scene of the skill he is rehearsing, in
    // the practice hue; the lamps are the skill's progress. Absent when there
    // is nothing to practise and nothing being prepared.
    practice: v.practiceCard ? (
      <Group key="practice" label="Practice" accent="--nv-or" trailing={<Meta tone="faint">{v.practiceCard.meta}</Meta>}>
        <PracticeCard card={v.practiceCard} variant="apple" />
      </Group>
    ) : null,

    // RESTORED 25 Sep. The plan, the command deck and Today were deleted from
    // this idiom on 15 Sep inside a Leader-box commit (a728bf3) that never
    // mentions them, while ORDERS kept naming all three, so they vanished
    // with no error. His plan ticks stop on exactly that day: 10 marks in the
    // six days before, none in the ten after.
    plan: v.planToday ? (
      <div key="plan">
        {v.oneThing && (
          /* C2 — THE ONE THING. Border, glow and fill spent on exactly one
             card: the day's most important open act. Everything else drops a
             level so hierarchy stops coming from reading order alone. */
          <section style={{ marginTop: '18px', padding: mob ? '16px 16px 14px' : '20px 22px 18px', borderRadius: '16px', border: '1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)', boxShadow: '0 0 54px -18px color-mix(in srgb, var(--nv-gold) 75%, transparent)', background: 'linear-gradient(160deg, color-mix(in srgb, var(--nv-gold) 12%, transparent), var(--nv-glass2))' }}>
            <div style={{ font: `600 11px ${UI}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--nv-gold)' }}>The one thing</div>
            <div style={{ marginTop: '6px', font: `600 ${mob ? '17px' : '19px'}/1.25 ${UI}`, letterSpacing: '-.01em' }}>{v.oneThing.text}</div>
            {v.oneThing.why && <div style={{ marginTop: '5px', font: `450 13px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>{v.oneThing.why}</div>}
            {v.oneThing.mark && (
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <Pill label="Done" onClick={() => v.oneThing.mark('done')} />
                <Pill label="Skip" onClick={() => v.oneThing.mark('skipped')} tone="quiet" />
              </div>
            )}
          </section>
        )}
      <Group key="plan-group" label="Today's top 3" trailing={<Meta tone={v.planToday.state === 'pending' ? 'gold' : v.planToday.state === 'error' ? 'warn' : 'faint'}>{v.planToday.meta}</Meta>}>
        {v.planToday.state === 'classifying' ? (
          <GRow first title={<span style={{ color: 'var(--nv-ink60)', fontWeight: 450 }}>Nova is drawing up today's top 3…</span>} />
        ) : v.planToday.state === 'error' ? (
          <GRow first title={<span style={{ color: 'var(--nv-ink60)', fontWeight: 450 }}>Today's plan hit an error — {v.planToday.errorText}. The Inbox has the retry.</span>} />
        ) : (
          v.planToday.priorities.map((p, i) => v.oneThing && i === v.oneThing.index ? null : (
            <GRow key={i} first={i === 0 || (v.oneThing?.index === 0 && i === 1)}
              // SEEN, NOT TICKED: done in his log, so the check is Nova's
              // cyan rather than his gold number (server/lib/planObserve.js)
              leading={<span style={{ font: `600 13px ${M}`, color: p.seen ? 'var(--nv-cy)' : 'var(--nv-gold)' }}>{p.seen ? '✓' : i + 1}</span>}
              title={<span style={{ opacity: p.outcome || p.seen ? 0.6 : 1, textDecoration: p.outcome === 'done' || p.seen ? 'line-through' : 'none' }}>{p.do}</span>}
              sub={p.seen
                ? <span style={{ color: 'var(--nv-cy)' }}>Seen in your log · {p.seen}</span>
                : p.notYet || p.start ? <>
                  {p.why}
                  {p.notYet && <>{p.why ? <br /> : null}<span style={{ color: 'var(--nv-ink40)' }}>So far: {p.notYet}</span></>}
                  {/* stuck for days, shrunk to a first step by today's plan:
                      the "start it with me" rides on the row it belongs to */}
                  {p.start && <span style={{ display: 'block', marginTop: '6px' }}><TextAction compact onClick={p.start.go}>Start it with me · {p.start.days} days stuck</TextAction></span>}
                </>
                : p.why || null}
              trailing={p.mark && !p.seen ? (
                <span style={{ display: 'flex', gap: '6px' }}>
                  <TextAction compact tone={p.outcome === 'done' ? 'good' : 'quiet'} onClick={() => p.mark('done')}>Done</TextAction>
                  <TextAction compact tone={p.outcome === 'skipped' ? 'warn' : 'quiet'} onClick={() => p.mark('skipped')}>Skip</TextAction>
                </span>
              ) : null} />
          ))
        )}
        {(v.planToday.onApprove || v.planToday.state === 'error') && (
          <div style={{ display: 'flex', gap: '9px', padding: '10px 16px', borderTop: '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}>
            {v.planToday.onApprove && <Pill label={v.planToday.busy ? 'Filing…' : 'Approve — into the vault'} onClick={v.planToday.busy ? undefined : v.planToday.onApprove} />}
            <Pill label="Open Inbox" onClick={v.planToday.onOpenInbox} tone="quiet" />
          </div>
        )}
      </Group>
      </div>
    ) : null,

    stuck: v.stuckCard ? <StuckCard key="stuck" card={v.stuckCard} variant="apple" /> : null,

    deck: v.commandDeck.count > 0 ? (
      <Group key="deck" label="Command deck" trailing={
        <Interactive as="span" onClick={v.commandDeck.onOpen} base={{ cursor: 'pointer', font: `600 12px ${UI}`, color: 'var(--nv-acc)' }} hoverStyle={{ filter: 'brightness(1.15)' }}>
          {v.commandDeck.count} waiting ›
        </Interactive>
      }>
        {v.commandDeck.items.map((item, i) => (
          <GRow key={item.id} first={i === 0} onClick={v.commandDeck.onOpen}
            leading={<Tag>{item.kindLabel}</Tag>}
            title={<span style={{ fontWeight: 500 }}>{item.title}</span>}
            trailing={<span style={{ color: 'var(--nv-ink40)' }}>›</span>} />
        ))}
      </Group>
    ) : null,

    today: (
      <Group key="today" label="Today" trailing={
        v.todayIsLive
          ? <Interactive as="span" onClick={v.openCalendarView} base={{ cursor: 'pointer', font: `600 12px ${UI}`, color: 'var(--nv-acc)' }} hoverStyle={{ filter: 'brightness(1.15)' }}>Next 14 days ›</Interactive>
          : v.todayStaleLabel ? <Meta tone="warn">{v.todayStaleLabel}</Meta> : null
      }>
        {v.todayEvents.map((ev, i) => (
          <GRow key={i} first={i === 0}
            leading={<span style={{ font: `600 12px ${M}`, fontVariantNumeric: 'tabular-nums', width: '46px', color: ev.now ? 'var(--nv-cy)' : 'var(--nv-ink40)' }}>{ev.now ? '▸ ' : ''}{ev.time}</span>}
            title={<span style={{ color: ev.now ? 'var(--nv-cy)' : ev.past ? 'var(--nv-ink40)' : 'var(--nv-ink)' }}>{ev.label}{ev.until && <span style={{ font: 'var(--nv-micro-m)', color: 'var(--nv-cy)', marginLeft: '8px' }}>{ev.until}</span>}</span>}
            trailing={ev.category ? <span style={{ font: 'var(--nv-micro-m)', letterSpacing: '.05em', padding: '3px 8px', borderRadius: '999px', color: `rgba(${ev.categoryHue},.9)`, background: `rgba(${ev.categoryHue},.12)` }}>{ev.category.toUpperCase()}</span> : null}
          />
        ))}
        {v.calCmdEnabled && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 14px', borderTop: '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}>
            <input value={v.calCmd} onChange={v.setCalCmd} onKeyDown={(e) => { if (e.key === 'Enter') v.sendCalCmd(); }}
              placeholder="Ask Nova… “dentist Thu 2pm”, “move gym to Fri 6pm”"
              style={{ flex: 1, minWidth: 0, background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)', borderRadius: '11px', padding: '9px 13px', color: 'var(--nv-ink)', fontFamily: UI, outline: 'none' }} />
            <Pill label={v.calCmdBusy ? 'Drafting…' : 'Draft'} onClick={v.calCmdBusy ? undefined : v.sendCalCmd} />
          </div>
        )}
      </Group>
    ),

    review: (
      <Group key="review" label="Daily review" accent="--nv-vi" trailing={
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Meta tone="faint">{v.reviewMeta}</Meta>
          <ShuffleButton onClick={v.shuffleReview} spinning={!!v.reviewSpin} label="Shuffle daily review" />
        </span>
      }>
        <div style={{ padding: '13px 16px' }}>
          {/* the shuffle, spun (25 Sep): his concepts pass through the band
              and it lands on the one drawn; the card returns around it */}
          {v.reviewSpin ? (
            <SpinReveal rows={v.reviewSpin.rows} spinning={v.reviewSpin.spinning} rowH={38} accent="--nv-vi"
              face={`italic 400 16px/1.2 ${S}`} onLanded={v.reviewSpin.landed} chime="review"
              label="Shuffle daily review" landedLabel="A new concept to review" />
          ) : (
            <>
              <div style={{ font: `400 16px/1.45 ${S}`, textWrap: 'pretty', color: 'var(--nv-ink)' }}>{v.reviewConcept}</div>
              <div style={{ marginTop: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <span style={{ font: `450 12.5px ${UI}`, color: 'var(--nv-ink60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  from <em style={{ font: `italic 400 14px ${S}`, color: 'var(--nv-vi)' }}>{v.reviewFrom}</em>
                </span>
                <Pill label="Review" onClick={v.openReview} tone="quiet" />
              </div>
            </>
          )}
        </div>
      </Group>
    ),

    noticed: (
      <Group key="noticed" label="Nova noticed" trailing={<Meta tone="faint">While you slept</Meta>}>
        {v.usingLiveHealthInsight && v.healthInsightItems.length > 0 ? (
          v.healthInsightItems.map((item, i) => (
            <GRow key={item.key} first={i === 0}
              leading={<span style={{ color: 'var(--nv-gold)' }}>✦</span>}
              title={<span style={{ fontWeight: 450, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--nv-ink60)' }}><Tag tone="gold" style={{ marginRight: '8px' }}>{item.label}</Tag>{item.text}</span>} />
          ))
        ) : !v.noticedShowDemo ? (
          <GRow first leading={<span style={{ color: 'var(--nv-gold)' }}>✦</span>}
            title={<span style={{ fontWeight: 450, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--nv-ink60)' }}>{v.healthInsightEmptyText}</span>} />
        ) : (
          <>
            <GRow first leading={<span style={{ color: 'var(--nv-gold)' }}>✦</span>}
              title={<span style={{ fontWeight: 450, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--nv-ink60)' }}>You've skipped three runs — Coach moved tomorrow's zone-2 to 7 am. <Interactive as="span" onClick={v.acceptRun} base={css('cursor:pointer;color:var(--nv-cy)')} hoverStyle={{ filter: 'brightness(1.2)' }}>Accept</Interactive></span>} />
            <GRow leading={<span style={{ color: 'var(--nv-gold)' }}>✦</span>}
              title={<span style={{ fontWeight: 450, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--nv-ink60)' }}>Your <em onClick={v.openProteinNote} style={css(`cursor:pointer;font:italic 400 14px ${S};color:var(--nv-gold)`)}>Huberman — protein timing</em> note now links to <b style={{ color: 'var(--nv-ink)' }}>4 recipes</b> in the vault.</span>} />
            <GRow leading={<span style={{ color: 'var(--nv-gold)' }}>✦</span>}
              title={<span style={{ fontWeight: 450, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--nv-ink60)' }}>CFO flagged two overlapping subscriptions — <b style={{ color: 'var(--nv-ink)' }}>$23/mo recoverable</b>. <Interactive as="span" onClick={v.reviewSubs} base={css('cursor:pointer;color:var(--nv-cy)')} hoverStyle={{ filter: 'brightness(1.2)' }}>Review</Interactive></span>} />
          </>
        )}
        {v.streakBadges.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', padding: '10px 16px', borderTop: '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}>
            {v.streakBadges.map((b) => (
              <span key={b.key} style={{ font: 'var(--nv-micro-m)', letterSpacing: '.05em', padding: '4px 10px', borderRadius: '999px', color: `rgb(${b.hue})`, background: `rgba(${b.hue},.09)`, border: `1px solid rgba(${b.hue},.35)` }}>{b.label}</span>
            ))}
          </div>
        )}
      </Group>
    ),

    shortcuts: (
      <Group key="shortcuts" label="Shortcuts">
        <GRow first onClick={v.goWorkouts}
          leading={<span style={{ color: 'var(--nv-cy)' }}><TabIcon name="workouts" size={19} /></span>}
          title={v.workoutCardLabel}
          sub={`${v.workoutCardK} · ${v.workoutCardMeta}`}
          trailing={<span style={{ color: 'var(--nv-ink40)' }}>›</span>} />
        <GRow onClick={v.noteCard.onOpen}
          leading={<span style={{ color: 'var(--nv-mg)' }}><TabIcon name="notes" size={19} /></span>}
          title={v.noteCard.title}
          sub={v.noteCard.meta}
          trailing={<span style={{ color: 'var(--nv-ink40)' }}>›</span>} />
      </Group>
    ),

    agents: mob ? (
      <Group key="agents" label={v.agentsGroupLabel}>
        {v.agents.map((ag, i) => (
          <GRow key={ag.name} first={i === 0}
            title={<span style={{ color: ag.on ? 'var(--nv-ink)' : 'var(--nv-ink40)' }}>{ag.name}</span>}
            trailing={<><span style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)', color: 'var(--nv-ink40)' }}>{ag.role}</span><span style={ag.dotStyle}></span></>} />
        ))}
      </Group>
    ) : null,
  };

  // the day decides the order: morning = body first; after that, what to DO
  // (focus + calendar) leads and the vitals step back
  // ...and in the hour before a work block the lead jumps the queue, because
  // that is when it is actionable. Applied as a promotion rather than a fourth
  // ORDERS entry, so the assert below still covers every section exactly once.
  const order = promoteLead(
    morning ? ORDERS.morning : hour < 17 ? ORDERS.day : ORDERS.evening,
    v.leadFirst,
  );
  // a section key missing from ANY order array would vanish silently for
  // part of the day — the dev build says so the moment it happens
  if (import.meta.env?.DEV) assertOrdersCover(Object.keys(sections));

  return (
    <div style={v.wrapMission} data-screen-label="Mission Control">
      {v.stepsOverlay && <StepsHistory v={v.stepsOverlay} />}
      {v.repertoireBook && <RepertoireBook v={v.repertoireBook} />}
      {v.calendarView && <CalendarView v={v.calendarView} />}
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {v.focusChip && <div style={{ marginTop: '10px' }}><FocusChip v={v.focusChip} /></div>}

        {/* large title — always first: who, when, and the day's living line */}
        <div style={{ padding: '8px 2px 0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px 9px', font: `600 11px ${UI}`, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--nv-ink60)' }}>
            <span>{v.heroDate}</span>
            <span style={{ color: 'var(--nv-ink40)' }}>·</span>
            <span style={{ color: 'var(--nv-gold)', fontVariantNumeric: 'tabular-nums' }}><Clock /></span>
            <span style={{ color: 'var(--nv-ink40)' }}>·</span>
            <span style={{ color: 'var(--nv-cy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--nv-cy)', animation: 'novaPulse 2s infinite var(--nv-anim)' }}></span>
              {v.agentsLiveLabel}
            </span>
            <span style={{ color: 'var(--nv-ink40)' }}>·</span>
            <span style={{ color: v.systemsLabel.color }}>{v.systemsLabel.text}</span>
          </div>
          <h1 style={{ margin: '8px 0 0', font: `700 ${mob ? '31px' : '36px'}/1.06 ${UI}`, letterSpacing: '-.02em', textWrap: 'balance' }}>{v.greeting}</h1>
          <div style={css(`margin-top:4px;font:italic 400 ${mob ? '20px' : '23px'}/1.25 ${S};background:linear-gradient(90deg,var(--nv-cy),var(--nv-vi) 55%,var(--nv-mg));-webkit-background-clip:text;background-clip:text;color:transparent;text-wrap:balance`)}>{v.heroTagline}</div>
        {/* WHO IS ASKING, on the way past. Step B of the Agent World plan
            (design/AGENT-WORLD-PLAN.md §3d), pulled forward by his
            instruction of 23 Sep: one line, in the serif news idiom, and
            only when a session on the Mac genuinely has its hand up.
            Nothing at all when nothing is waiting — an empty marker line
            would be the dashboard drift the Method names. */}
        {v.macSessionsHeadline && (
          <Interactive as="div" onClick={v.macSessionsHeadline.go}
            base={css(`cursor:pointer;margin-top:10px;display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:var(--nv-radius);border:1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent);background:color-mix(in srgb, var(--nv-gold) 6%, transparent)`)}
            hoverStyle="background:color-mix(in srgb, var(--nv-gold) 11%, transparent)">
            <span style={{ flex: 'none', width: 6, height: 6, borderRadius: '50%', background: 'var(--nv-gold)', boxShadow: '0 0 9px var(--nv-gold)', animation: 'novaPulse 2.4s infinite var(--nv-anim)' }} />
            <span style={css("flex:1;min-width:0;font:italic 400 17px/1.3 var(--nv-font-serif);color:var(--nv-ink);text-wrap:balance")}>{v.macSessionsHeadline.text}</span>
            <span style={css("flex:none;font:600 12px var(--nv-font-ui);color:var(--nv-gold)")}>Look</span>
          </Interactive>
        )}
        </div>

        {/* C3 — THE RECORD MOMENT. Two PRs on 3 Sep rendered as two small
            cards identical in weight to a rest-day notice. A system built to
            make him better should be visibly pleased when he gets better.
            Shown once, the morning after; then it stands down. Ahead of the
            hour's order on purpose — a moment that has to be scrolled to is
            not a moment. */}
        {v.prMoment && (
          <section style={{ marginTop: '18px', padding: mob ? '16px 16px 14px' : '20px 22px 18px', borderRadius: '16px', border: '1px solid color-mix(in srgb, var(--nv-mg) 45%, transparent)', boxShadow: '0 0 60px -20px color-mix(in srgb, var(--nv-mg) 70%, transparent)', background: 'linear-gradient(160deg, color-mix(in srgb, var(--nv-mg) 10%, transparent), var(--nv-glass2))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ flex: 'none', width: 58, height: 58, borderRadius: '50%', border: '1.5px dashed color-mix(in srgb, var(--nv-mg) 70%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `600 22px ${M}`, boxShadow: '0 0 30px -8px var(--nv-mg)' }}>{v.prMoment.prs.length}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `600 11px ${UI}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--nv-mg)' }}>{v.prMoment.prs.length === 1 ? 'A record' : 'Records'} · {v.prMoment.date.slice(5).replace('-', '/')}</div>
                <div style={{ marginTop: '3px', font: `italic 400 ${mob ? '18px' : '21px'}/1.2 ${S}` }}>
                  {v.prMoment.prs.length === 1 ? 'One lift went further than it ever has.' : `${v.prMoment.prs.length} lifts went further than they ever have.`}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {v.prMoment.prs.slice(0, 3).map((p) => (
                    <div key={p.name} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', font: `450 13px ${UI}` }}>
                      <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ flex: 'none', textAlign: 'right' }}>
                        {/* THE SET HE DID, first. An e1RM is an estimate, and a
                            bare "11.2kg" on a lift he loaded to 9.1 read as a
                            weight he had never touched (his report, 12 Sep). */}
                        <span style={{ font: `600 12px ${M}`, color: 'var(--nv-mg)' }}>{prLift(p)}</span>
                        <span style={{ display: 'block', marginTop: '1px', font: `450 11px ${UI}`, letterSpacing: '.04em', color: 'var(--nv-ink60)' }}>{prBasis(p)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <Pill label="See the block" onClick={v.prMoment.openTrain} tone="quiet" />
              <Pill label="Noted" onClick={v.prMoment.dismiss} tone="quiet" />
            </div>
          </section>
        )}
        {/* C3a — A PLAN IN FLIGHT. His ask, 16 Sep: set a big task, go and do
            your own thing, come back with it ready. The planner always kept
            this state; nothing showed it. Ahead of the day's order for the
            same reason the record moment is — something happening right now
            that he cannot see is worse than something he has to scroll to. */}
        {v.runningPlan && (() => {
          // TWO STATES, ONE TINT RULE — shared with the Command twin below
          // (MissionControl.jsx) because both idioms draw the same card.
          const tint = v.runningPlan.state === 'ready' ? 'var(--nv-good)' : 'var(--nv-cy)';
          const head = v.runningPlan.state === 'ready' ? 'Ready for you' : 'Working on it';
          const act = v.runningPlan.state === 'ready' ? 'Walk me through it' : 'Open it';
          return (
          <section style={{ marginTop: '18px', padding: mob ? '15px 16px 13px' : '18px 20px 16px', borderRadius: '16px', border: `1px solid color-mix(in srgb, ${tint} 38%, transparent)`, background: `linear-gradient(160deg, color-mix(in srgb, ${tint} 08%, transparent), var(--nv-glass2))`, animation: 'fadeUp var(--nv-dur-base) var(--nv-ease)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, font: `600 11px ${UI}`, letterSpacing: '.08em', textTransform: 'uppercase', color: tint }}>{head}</div>
              <Meta tone="faint">{v.runningPlan.tally} · {v.runningPlan.since}</Meta>
            </div>
            {/* THREE LINES, THEN AN ELLIPSIS. An amended plan's goal carries
                his whole correction after his whole request — the real
                record here is 880 characters, and unclamped it was fifteen
                lines of serif that pushed the steps and the action off the
                phone entirely. The full text is on the record in the Inbox. */}
            <div style={{ marginTop: '4px', minWidth: 0, font: `italic 400 ${mob ? '17px' : '19px'}/1.25 ${S}`, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.runningPlan.goal}</div>
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {v.runningPlan.steps.map((st) => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'baseline', gap: '9px', minWidth: 0 }}>
                  <span style={{ flex: 'none', width: '13px', font: `600 11px ${M}`, color: st.tint }}>{st.glyph}</span>
                  <span style={{ flex: 1, minWidth: 0, font: `450 13px ${UI}`, color: st.status === 'waiting' ? 'var(--nv-ink60)' : 'var(--nv-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.what}</span>
                  {st.error && <span style={{ flex: 'none', maxWidth: '40%', font: `450 11px ${UI}`, color: 'var(--nv-warn)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.error}</span>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <Pill label={act} onClick={v.runningPlan.open} tone="quiet" />
            </div>
          </section>
          );
        })()}
        {/* C3b — IT LANDED. His ask, 15 Sep: the Inbox strip was right, and he
            wants it here too, "so I can see and dismiss it from there". It
            answers the question he actually has — did the thing I sent Nova
            get taken? — on the screen he opens first, and stands down once he
            has seen it. A capture sent from the Shortcut while he was not
            looking is precisely what brings it back. */}
        {v.landedMoment && (
          <section className="nv-glow" style={{ marginTop: '18px', padding: mob ? '15px 16px 13px' : '18px 20px 16px', ...glowPanel('--nv-good', { radius: '16px' }).style }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ font: `600 11px ${UI}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--nv-good)' }}>Landed</div>
              <Meta tone="faint">{v.landedMoment.count} today · {v.landedMoment.filed} filed</Meta>
            </div>
            <div style={{ marginTop: '9px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {v.landedMoment.items.map((it) => (
                <Interactive key={it.id} as="div" onClick={it.open} ariaLabel={`Open ${it.title}`}
                  /* 22px rows, each a tap into a filed capture (measured
                     23 Sep). The padding buys the 28pt floor; the negative
                     margin hands the spacing straight back. */
                  base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, minHeight: '30px', borderRadius: '8px', padding: '5px', margin: '0 -5px' }}
                  hoverStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 06%, transparent)' }}>
                  <span style={{ flex: 'none', font: `600 11px ${M}`, color: it.status === 'filed' ? 'var(--nv-good)' : it.status === 'error' ? 'var(--nv-warn)' : 'var(--nv-ink60)' }}>
                    {it.status === 'filed' ? '✓' : it.status === 'error' ? '!' : '—'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, font: `450 13px ${UI}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                  {it.analysed && <span style={{ flex: 'none', font: `600 11px ${M}`, letterSpacing: '.1em', color: 'var(--nv-cy)' }}>ANALYSED</span>}
                  <span style={{ flex: 'none', maxWidth: '38%', font: `450 11px ${UI}`, color: 'var(--nv-ink60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.where}</span>
                </Interactive>
              ))}
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <Pill label="Open the Inbox" onClick={v.landedMoment.openInbox} tone="quiet" />
              <Pill label="Noted" onClick={v.landedMoment.dismiss} tone="quiet" />
            </div>
          </section>
        )}
        {/* TODAY'S TECHNIQUE. His ask, 15 Sep: one psychological technique a
            day that he can develop and use. Unlike the moments above this is
            a CARD, not a badge — it stays until he answers it, because the
            answer is the whole point: what he practises is what decides when
            the technique comes back. The drill is the loudest line on it. */}
        {/* A NEW technique arrives sealed and is revealed on a reel (25 Sep,
            the Hormozi reel); it becomes the card below when it lands. */}
        {v.todayTechnique && !v.todayTechnique.empty && v.todayTechnique.reel && (
          <TechniqueReveal t={v.todayTechnique} variant="apple" mob={mob} />
        )}
        {v.todayTechnique && !v.todayTechnique.empty && !v.todayTechnique.reel && (
          <section className="nv-glow" style={{ marginTop: '18px', padding: mob ? '15px 16px 13px' : '18px 20px 16px', ...glowPanel('--nv-mg', { radius: '16px' }).style, ...(v.todayTechnique.vtName ? { viewTransitionName: v.todayTechnique.vtName } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ font: `600 11px ${UI}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--nv-mg)' }}>
                {v.todayTechnique.modeLabel}
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <Meta tone="faint">{v.todayTechnique.streak > 0 ? `${v.todayTechnique.streak}-day streak` : ''}</Meta>
                {/* THE DOOR. "1 of 7" is the thing he would press to see all 7,
                    so it IS the button rather than sitting next to one. */}
                <TextAction tone="faint" compact onClick={v.todayTechnique.openAll}>
                  {v.todayTechnique.position} of {v.todayTechnique.total} ›
                </TextAction>
              </span>
            </div>
            <div style={{ marginTop: '8px', font: `600 17px ${UI}`, lineHeight: 1.25, color: 'var(--nv-ink)' }}>{v.todayTechnique.name}</div>
            <div style={{ marginTop: '3px', font: `450 11px ${UI}`, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--nv-ink60)' }}>{v.todayTechnique.family}</div>
            {v.todayTechnique.summary && (
              <div style={{ marginTop: '8px', font: `450 13.5px ${UI}`, lineHeight: 1.5, color: 'var(--nv-ink)' }}>{v.todayTechnique.summary}</div>
            )}
            {v.todayTechnique.why && (
              <div style={{ marginTop: '6px', font: `450 11.5px ${UI}`, color: 'var(--nv-ink60)' }}>Back today — {v.todayTechnique.why}.</div>
            )}
            {v.todayTechnique.move && (
              <div style={{ marginTop: '10px', font: `450 12.5px ${UI}`, lineHeight: 1.5, color: 'var(--nv-ink60)' }}>
                <span style={{ font: `600 12.5px ${UI}`, color: 'var(--nv-ink)' }}>Move. </span>{v.todayTechnique.move}
              </div>
            )}
            <div style={{ marginTop: '10px', padding: '11px 13px', borderRadius: '11px', background: 'color-mix(in srgb, var(--nv-mg) 09%, transparent)', border: '1px solid color-mix(in srgb, var(--nv-mg) 22%, transparent)' }}>
              <div style={{ font: `600 11px ${M}`, letterSpacing: '.1em', color: 'var(--nv-mg)' }}>TRY IT TODAY</div>
              <div style={{ marginTop: '5px', font: `500 13.5px ${UI}`, lineHeight: 1.5, color: 'var(--nv-ink)' }}>{v.todayTechnique.drill}</div>
              {v.todayTechnique.tell && (
                <div style={{ marginTop: '6px', font: `450 12px ${UI}`, lineHeight: 1.45, color: 'var(--nv-ink60)' }}>You’ll know it landed: {v.todayTechnique.tell}</div>
              )}
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {v.todayTechnique.outcome === 'tried' ? (
                <>
                  <span style={{ font: `600 12px ${UI}`, color: 'var(--nv-good)' }}>✓ {v.todayTechnique.practisedLabel}</span>
                  <Pill label="Actually, not today" onClick={() => { haptic('tick'); v.todayTechnique.markSkipped(); }} tone="quiet" />
                </>
              ) : v.todayTechnique.outcome === 'skipped' ? (
                <>
                  <span style={{ font: `600 12px ${UI}`, color: 'var(--nv-ink60)' }}>Passed today</span>
                  <Pill label="I did try it" onClick={() => { haptic('tick'); v.todayTechnique.markTried(); }} tone="quiet" />
                </>
              ) : (
                <>
                  <Pill label="I tried it" accent="--nv-mg" onClick={() => { haptic('tick'); v.todayTechnique.markTried(); }} />
                  <Pill label="Not today" onClick={() => { haptic('tick'); v.todayTechnique.markSkipped(); }} tone="quiet" />
                </>
              )}
            </div>
          </section>
        )}
        {/* C1 — THE FOLD. The first two sections of the hour's order (plus
            WORKING and PLAN, which never fold) render in full; everything
            after them is a header and one line of status until tapped. A
            section he opens gets a slim FOLD caption so it can be put away
            again; both choices are remembered per section. */}
        {(() => {
          const present = order.filter((k) => sections[k]);
          const folds = resolveFolds(present, remembered);
          let foldIndex = 0;
          return present.map((k) => {
            if (folds[k] === 'fold') {
              return <FoldRow key={`fold-${k}`} index={foldIndex++} label={FOLD_LABELS[k] || k} status={foldStatus(k, v)} inst={foldInstrument(k, v)} onOpen={() => setFold(k, 'open')} />;
            }
            const canFold = !NEVER_FOLD.includes(k);
            return (
              <div key={`sec-${k}`}>
                {sections[k]}
                {canFold && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 8px 0' }}>
                    <TextAction tone="faint" onClick={() => setFold(k, 'fold')} ariaLabel={`Fold ${FOLD_LABELS[k] || k}`} style={{ minHeight: '32px', padding: '4px 10px', margin: 0 }}>▴ Fold</TextAction>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

// A RECORD, said in his units. The lift line is always a weight he actually
// loaded and the reps he actually got; the basis line underneath says what
// kind of record it is and by how much — an estimated 1RM is labelled as an
// estimate, never printed as if he had lifted it.
function prLift(p) {
  if (p.weight != null && p.reps != null) return `${p.weight}kg × ${p.reps}`;
  if (p.kind === 'weight' && p.reps != null) return `${p.value}kg × ${p.reps}`;
  return p.kind === 'e1rm' ? `est. 1RM ${p.value}kg` : `${p.value}kg`;
}
function prBasis(p) {
  const up = p.previous != null && p.value > p.previous ? ` ▲${(p.value - p.previous).toFixed(1)}` : '';
  return p.kind === 'e1rm' ? `est. 1RM ${p.value}kg${up}` : `heaviest yet${up}`;
}
