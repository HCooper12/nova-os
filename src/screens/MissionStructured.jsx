import { useState } from 'react';
import { css } from '../css.js';
import { RingTile } from '../RingTile.jsx';
import { resolveFolds, foldStatus, FOLD_LABELS, loadFolds, saveFolds } from '../missionFold.js';
import { Eyebrow, TextAction, Tag, Meta } from '../Controls.jsx';

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
  morning: ['working', 'hero', 'vitals', 'plan', 'lead', 'focus', 'today', 'deck', 'review', 'noticed', 'shortcuts', 'agents'],
  day: ['working', 'focus', 'lead', 'plan', 'today', 'deck', 'hero', 'vitals', 'noticed', 'review', 'shortcuts', 'agents'],
  evening: ['working', 'focus', 'plan', 'lead', 'today', 'deck', 'vitals', 'review', 'hero', 'noticed', 'shortcuts', 'agents'],
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

// C1 — a folded section: its label, one line of status derived from the same
// view model the open section renders, and a chevron. Tap to open. The open
// state is remembered per section (src/missionFold.js).
function FoldRow({ label, status, onOpen }) {
  return (
    <Interactive as="section" onClick={onOpen} role="button" aria-expanded="false" aria-label={`Open ${label}`}
      base={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px', borderRadius: '13px', cursor: 'pointer', background: 'var(--nv-glass)', border: '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}
      hoverStyle={{ borderColor: 'color-mix(in srgb, var(--nv-ink) 16%, transparent)' }}>
      <span style={{ flex: 'none', font: `600 11px ${UI}`, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--nv-ink40)' }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, font: `450 13px ${UI}`, color: 'var(--nv-ink60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{status}</span>
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
    const next = { ...remembered, [k]: state };
    setRemembered(next);
    saveFolds(next);
  };
  const vitals = [
    { key: 'sleep', color: '--nv-cy', ...v.satSleep },
    { key: 'steps', color: '--nv-mg', ...v.satSteps },
    { key: 'protein', color: '--nv-vi', ...v.satProtein },
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
      <Group key="vitals" label="Vitals" trailing={<span style={{ font: `400 10px ${M}`, letterSpacing: '.08em', color: 'var(--nv-ink40)' }}>{v.bodyMetricsMeta}</span>}>
        {/* B1 — the ring, everywhere. Readiness was the best object in the
            product and appeared on one screen; here it sits with protein,
            steps and sleep, colour carrying the verdict (missionFocus.ringState)
            and a dashed ring for a metric that was not reported. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', padding: '12px 10px 10px', borderBottom: '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)' }}>
          {v.ringVitals.map((r) => <RingTile key={r.key} {...r} size={mob ? 56 : 62} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr 1fr' : 'repeat(4,1fr)', gap: '2px', padding: '6px 8px' }}>
          {vitals.map((m) => <MetricTile key={m.key} m={m} />)}
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
      <Group key="working" label="Nova is working" trailing={<Meta tone="cyan">{v.jobTray.jobs.length} running</Meta>}>
        {v.jobTray.jobs.map((j, i) => (
          <GRow key={j.id} first={i === 0}
            leading={<span style={{ font: `600 12px ${M}`, color: j.failed ? 'var(--nv-warn)' : j.done ? 'var(--nv-good, #5aa87c)' : 'var(--nv-cy)' }}>{j.failed ? '✕' : j.done ? '✓' : '◍'}</span>}
            title={j.label}
            onClick={j.go || undefined} />
        ))}
      </Group>
    ) : null,

    lead: v.leaderToday ? (
      <Group key="lead" label="Lead · try today" trailing={<Meta tone="gold">{cap(v.leaderToday.chip)}</Meta>}>
        <div style={{ padding: '13px 16px' }}>
          <div style={{ font: `400 21px/1.25 ${S}`, textWrap: 'pretty' }}>{v.leaderToday.title}</div>
          <p style={{ margin: '9px 0 0', font: `450 13.5px/1.55 ${UI}`, color: 'var(--nv-ink)' }}>{v.leaderToday.line}</p>
          {v.leaderToday.why && <p style={{ margin: '7px 0 0', font: `450 12.5px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>{v.leaderToday.why}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px', marginTop: '12px' }}>
            <Pill label="Open the Leader ›" onClick={v.openLeader} tone="quiet" />
          </div>
        </div>
      </Group>
    ) : null,

    plan: v.planToday ? (
      <div key="plan">
        {v.oneThing && (
          /* C2 — THE ONE THING. Border, glow and fill spent on exactly one
             card: the day's most important open act. Everything else drops a
             level so hierarchy stops coming from reading order alone. */
          <section style={{ marginTop: '18px', padding: mob ? '16px 16px 14px' : '20px 22px 18px', borderRadius: '16px', border: '1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)', boxShadow: '0 0 54px -18px color-mix(in srgb, var(--nv-gold) 75%, transparent)', background: 'linear-gradient(160deg, color-mix(in srgb, var(--nv-gold) 12%, transparent), var(--nv-glass2))' }}>
            <div style={{ font: `600 10.5px ${UI}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--nv-gold)' }}>The one thing</div>
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
              leading={<span style={{ font: `600 13px ${M}`, color: 'var(--nv-gold)' }}>{i + 1}</span>}
              title={<span style={{ opacity: p.outcome ? 0.55 : 1, textDecoration: p.outcome === 'done' ? 'line-through' : 'none' }}>{p.do}</span>}
              sub={p.why || null}
              trailing={p.mark ? (
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
            title={<span style={{ color: ev.now ? 'var(--nv-cy)' : ev.past ? 'var(--nv-ink40)' : 'var(--nv-ink)' }}>{ev.label}{ev.until && <span style={{ font: `400 10.5px ${M}`, color: 'var(--nv-cy)', marginLeft: '8px' }}>{ev.until}</span>}</span>}
            trailing={ev.category ? <span style={{ font: `500 9.5px ${M}`, letterSpacing: '.05em', padding: '3px 8px', borderRadius: '999px', color: `rgba(${ev.categoryHue},.9)`, background: `rgba(${ev.categoryHue},.12)` }}>{ev.category.toUpperCase()}</span> : null}
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
      <Group key="review" label="Daily review" trailing={
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Meta tone="faint">{v.reviewMeta}</Meta>
          <Interactive as="span" onClick={v.shuffleReview} aria-label="Shuffle daily review" base={{ cursor: 'pointer', font: `400 13px ${M}`, color: 'var(--nv-ink40)' }} hoverStyle={{ color: 'var(--nv-ink)' }}>⟳</Interactive>
        </span>
      }>
        <div style={{ padding: '13px 16px' }}>
          <div style={{ font: `400 16px/1.45 ${S}`, textWrap: 'pretty', color: 'var(--nv-ink)' }}>{v.reviewConcept}</div>
          <div style={{ marginTop: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <span style={{ font: `450 12.5px ${UI}`, color: 'var(--nv-ink60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              from <em style={{ font: `italic 400 14px ${S}`, color: 'var(--nv-vi)' }}>{v.reviewFrom}</em>
            </span>
            <Pill label="Review" onClick={v.openReview} tone="quiet" />
          </div>
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
              <span key={b.key} style={{ font: `500 9.5px ${M}`, letterSpacing: '.05em', padding: '4px 10px', borderRadius: '999px', color: `rgb(${b.hue})`, background: `rgba(${b.hue},.09)`, border: `1px solid rgba(${b.hue},.35)` }}>{b.label}</span>
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
            trailing={<><span style={{ font: `400 9px ${M}`, letterSpacing: '.08em', color: 'var(--nv-ink40)' }}>{ag.role}</span><span style={ag.dotStyle}></span></>} />
        ))}
      </Group>
    ) : null,
  };

  // the day decides the order: morning = body first; after that, what to DO
  // (focus + calendar) leads and the vitals step back
  const order = morning ? ORDERS.morning : hour < 17 ? ORDERS.day : ORDERS.evening;
  // a section key missing from ANY order array would vanish silently for
  // part of the day — the dev build says so the moment it happens
  if (import.meta.env?.DEV) assertOrdersCover(Object.keys(sections));

  return (
    <div style={v.wrapMission} data-screen-label="Mission Control">
      {v.stepsOverlay && <StepsHistory v={v.stepsOverlay} />}
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
                <div style={{ font: `600 10.5px ${UI}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--nv-mg)' }}>{v.prMoment.prs.length === 1 ? 'A record' : 'Records'} · {v.prMoment.date.slice(5).replace('-', '/')}</div>
                <div style={{ marginTop: '3px', font: `italic 400 ${mob ? '18px' : '21px'}/1.2 ${S}` }}>
                  {v.prMoment.prs.length === 1 ? 'One lift went further than it ever has.' : `${v.prMoment.prs.length} lifts went further than they ever have.`}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {v.prMoment.prs.slice(0, 3).map((p) => (
                    <div key={p.name} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', font: `450 13px ${UI}` }}>
                      <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ flex: 'none', font: `600 12px ${M}`, color: 'var(--nv-mg)' }}>{p.value}{p.kind === 'e1rm' ? 'kg' : ''}{p.previous != null && p.value > p.previous ? ` ▲${(p.value - p.previous).toFixed(1)}` : ''}</span>
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
        {/* C1 — THE FOLD. The first two sections of the hour's order (plus
            WORKING and PLAN, which never fold) render in full; everything
            after them is a header and one line of status until tapped. A
            section he opens gets a slim FOLD caption so it can be put away
            again; both choices are remembered per section. */}
        {(() => {
          const present = order.filter((k) => sections[k]);
          const folds = resolveFolds(present, remembered);
          return present.map((k) => {
            if (folds[k] === 'fold') {
              return <FoldRow key={`fold-${k}`} label={FOLD_LABELS[k] || k} status={foldStatus(k, v)} onOpen={() => setFold(k, 'open')} />;
            }
            const canFold = !['working', 'plan'].includes(k);
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
