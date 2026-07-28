import { css } from '../css.js';
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

export function MissionStructured({ v }) {
  const mob = v.isMobile;
  const hour = new Date().getHours();
  const morning = hour < 10;
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
          <div style={{ font: `600 10.5px ${M}`, letterSpacing: '.22em', color: 'var(--nv-cy)' }}>{v.coreLabel}</div>
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

    today: (
      <Group key="today" label="Today" trailing={
        v.todayIsLive
          ? <Interactive as="span" onClick={v.openCalendarView} base={{ cursor: 'pointer', font: `600 12px ${UI}`, color: 'var(--nv-acc)' }} hoverStyle={{ filter: 'brightness(1.15)' }}>Next 14 days ›</Interactive>
          : v.todayStaleLabel ? <span style={{ font: `500 10px ${M}`, letterSpacing: '.1em', color: 'var(--nv-warn)' }}>{v.todayStaleLabel}</span> : null
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
          <span style={{ font: `500 10px ${M}`, letterSpacing: '.12em', color: 'var(--nv-ink40)' }}>{v.reviewMeta}</span>
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
      <Group key="noticed" label="Nova noticed" trailing={<span style={{ font: `400 10px ${M}`, letterSpacing: '.1em', color: 'var(--nv-ink40)' }}>WHILE YOU SLEPT</span>}>
        {v.usingLiveHealthInsight && v.healthInsightItems.length > 0 ? (
          v.healthInsightItems.map((item, i) => (
            <GRow key={item.key} first={i === 0}
              leading={<span style={{ color: 'var(--nv-gold)' }}>✦</span>}
              title={<span style={{ fontWeight: 450, fontSize: '13.5px', lineHeight: 1.5, color: 'var(--nv-ink60)' }}><span style={{ font: `600 9.5px ${M}`, letterSpacing: '.12em', color: 'var(--nv-gold)', marginRight: '8px' }}>{item.label}</span>{item.text}</span>} />
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
  const order = morning
    ? ['hero', 'vitals', 'focus', 'today', 'review', 'noticed', 'shortcuts', 'agents']
    : hour < 17
      ? ['focus', 'today', 'hero', 'vitals', 'noticed', 'review', 'shortcuts', 'agents']
      : ['focus', 'today', 'vitals', 'review', 'hero', 'noticed', 'shortcuts', 'agents'];

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

        {order.map((k) => sections[k]).filter(Boolean)}
      </div>
    </div>
  );
}
