import { OfflineCard } from '../OfflineCard.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { StepsHistory } from '../StepsHistory.jsx';
import { RepertoireBook } from '../RepertoireBook.jsx';
import { CalendarView } from '../CalendarView.jsx';
import { FocusChip } from '../FocusChip.jsx';
import { LeaderBox } from '../LeaderBox.jsx';
import { leaderAccent } from '../leaderAccent.js';
import { TechniqueReveal } from '../TechniqueReveal.jsx';
import { TechniqueCheck } from '../TechniqueCheck.jsx';
import { RingTile } from '../RingTile.jsx';
import { LampRow } from '../PracticeLamps.jsx';
import { DaysRing } from '../StuckCard.jsx';
import { Pill } from '../AppleLayout.jsx';
import { Eyebrow, TextAction, Meta } from '../Controls.jsx';
import { PinnedEditSheet } from '../PinnedEditSheet.jsx';
import { useGridDrag } from '../useGridDrag.js';
import { prLift, prKind, prGain } from '../missionFocus.js';
import { muscleVar } from '../muscleHue.js';
import { GlyphTile } from '../BodyGlyph.jsx';
import { YourDay } from '../Instruments.jsx';
import { readDaySeen, markDaySeen, DAY_KEYS } from '../dayCard.js';
import { CountText, CountUp } from '../CountUp.jsx';
import { ReviewMoment } from '../ReviewCard.jsx';
import { WrapFocus } from '../motion/WrapFocus.jsx';

// THE SUMMARY HOME (P2-B, 26 Sep 2026) — design/HOME-REDESIGN-PLAN.md, drawn
// from mockup 56 (round 5, his pick). The third idiom of the same view model:
// MissionControl returns this under the `summary` style, MissionStructured
// under cupertino, the HUD under command. It reads `v.summaryHome`
// (src/vals/valsSummary.js) for its own shape and the existing vals for the
// moments, so a record or a capture shows the same facts in every idiom.
//
// Top to bottom: the date and Nova, the greeting, the serif standfirst, the
// moments (only while they are news), ONE highlight sentence with its bar and
// one quiet act, then Pinned — cards he orders and switches off in the Edit
// sheet — and a quiet foot. One filled button at most on the whole page, and
// only inside a moment that already had it.
//
// Stable structure is load-bearing: Home re-renders on every state change, so
// every card below is a module-level component under a stable key, and the
// entrance (.nv-sum-rise) runs once at mount and never restarts.

const UI = 'var(--nv-font-ui)';
const SERIF = 'var(--nv-font-serif)';
const ROUND = 'var(--nv-font-round)';
const clampPct = (p) => Math.max(0, Math.min(100, Number(p) || 0));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (iso) => { const [, m, d] = String(iso || '').split('-').map(Number); return m && d ? `${d} ${MONTHS[m - 1]}` : ''; };

// ---------------------------------------------------------------- icons ----
// One stroke family at 17px, drawn in the card's hue (currentColor). The fork
// and the inbox tray and the bar are TabIcon's own paths, so the card and the
// tab it leads to share a mark.
const ICONS = {
  protein: <><path d="M7 3.5v6.5M4.8 3.5v4a2.2 2.2 0 0 0 4.4 0v-4" /><path d="M7 10v10.5" /><path d="M16.6 3.5c-2 1.2-2.8 4-2.8 7h2.8Zm0 7v10" /></>,
  steps: <><ellipse cx="8.4" cy="8.6" rx="2.6" ry="4.1" /><ellipse cx="15.6" cy="15.4" rx="2.6" ry="4.1" /></>,
  sleep: <path d="M19.6 14.6A8 8 0 1 1 9.4 4.4a6.4 6.4 0 0 0 10.2 10.2Z" />,
  training: <><path d="M7.2 9v6M16.8 9v6" /><path d="M4 10.5v3M20 10.5v3" /><path d="M7.2 12h9.6" /></>,
  plan: <path d="M4 6h16M4 12h10M4 18h6" />,
  today: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  clear: <><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.3" /></>,
  body: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  waiting: <><path d="M4 5.5h16V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /><path d="M4 12.5h4.6c.5 0 .8.3 1 .8.4 1 1.3 1.7 2.4 1.7s2-.7 2.4-1.7c.2-.5.5-.8 1-.8H20" /></>,
  practice: <><circle cx="8" cy="8" r="2" /><circle cx="16" cy="8" r="2" /><circle cx="8" cy="16" r="2" /><circle cx="16" cy="16" r="2" /></>,
  trends: <path d="M4 17l6-6 4 4 6-8" />,
  // mockup 101's Home marks: a record's star, a technique's spark, the list
  star: <path d="m12 3.6 2.5 5.2 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8Z" />,
  spark: <path d="M12 3.5l1.7 5.8 5.8 1.7-5.8 1.7L12 18.5l-1.7-5.8-5.8-1.7 5.8-1.7Z" />,
  list: <path d="M9.5 7h10M9.5 12h10M9.5 17h7M5 7h.01M5 12h.01M5 17h.01" />,
  lead: <><path d="M6 20.5V4" /><path d="M6 4.5h11l-2.4 3.7L17 12H6" /></>,
  day: <><circle cx="12" cy="12" r="3.6" /><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" /></>,
};
// exported with CardHead for the summary Train page (TrainSummary.jsx), which
// hands its own marks in as `paths`, drawn in this same stroke family
export function SumIcon({ name, paths }) {
  return <svg className="nv-sum-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths || ICONS[name] || ICONS.clear}</svg>;
}
// the highlight's rungs (summaryFacts.buildHighlight) → the mark each wears
const HL_ICON = { protein: 'protein', steps: 'steps', sleep: 'sleep', readiness: 'training', one: 'list', next: 'today', clear: 'clear' };

// THE LIGHT (27 Sep, his ask: the glow his cupertino Home's panes wear, on
// Nova glass). Every card sets --nv-sum-tint to the hue its header already
// wears; index.css draws a bloom and a tinted fill from it ONLY under the
// `lit` material, so under glass and solid the value is inert. One hue per
// card, never a second one: the light says the same thing the name does.
const lit = (hue) => ({ '--nv-sum-tint': hue });
// ITS OWN COLOURS (mockup 101, his pick 13 Oct: "Include its own colours as
// the glow"): a card that holds more than one colour hands them to the dyn
// glow as --nv-g1..3; under lit and soft only the tint is read, so one hue.
const glow = (a, b, c) => ({ '--nv-sum-tint': a, '--nv-g1': a, ...(b ? { '--nv-g2': b } : null), ...(c ? { '--nv-g3': c } : null) });

// A card's header: the mark and the name in the card's hue, a quiet meta right.
// With `tile` ([a, b] or a node), mockup 101's grammar, as on Train and Fuel:
// the mark sits white in a gradient tile and the name reads in ink.
export function CardHead({ icon, label, tint, meta, paths, tile }) {
  if (tile) {
    const t = Array.isArray(tile)
      ? <span className="nv-tile" style={{ '--a': tile[0], ...(tile[1] ? { '--b': tile[1] } : null) }} aria-hidden="true"><SumIcon name={icon} paths={paths} /></span>
      : tile;
    return (
      <div className="nv-sum-ch nv-sum-cht">
        {t}
        <span className="lbl">{label}</span>
        {meta ? <span className="nv-sum-ch-meta">{meta}</span> : null}
      </div>
    );
  }
  return (
    <div className="nv-sum-ch" style={tint ? { color: tint } : undefined}>
      <SumIcon name={icon} paths={paths} />
      <span>{label}</span>
      {meta ? <span className="nv-sum-ch-meta">{meta}</span> : null}
    </div>
  );
}

// A moment's header: the eyebrow in the moment's own hue, as on the other
// idioms; on Home (mockup 101) it is the tiled card header with an icon.
function MomentHead({ label, tint, meta, icon, tile }) {
  if (icon) return <CardHead icon={icon} label={label} tile={tile || [tint]} meta={meta} />;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px 10px', flexWrap: 'wrap' }}>
      <Eyebrow as="span" tone={tint}>{label}</Eyebrow>
      {/* auto margin: when a long label pushes it onto its own line, it keeps the right edge */}
      {meta ? <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>{meta}</span> : null}
    </div>
  );
}

// HH:MM that ticks itself on the minute, so the highlight's time is never a
// stale one and the tick re-renders this text alone, never Home.
const hm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
function NowHM() {
  const [t, setT] = useState(hm);
  useEffect(() => {
    let iv = null;
    const first = setTimeout(() => {
      setT(hm());
      iv = setInterval(() => setT(hm()), 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    return () => { clearTimeout(first); if (iv) clearInterval(iv); };
  }, []);
  return <>{t}</>;
}

// ---------------------------------------------------------------- moments --
// Each is the other idioms' markup for the same view-model field, on the
// summary card's material instead of a bordered or lit panel. Their hues stay.
const MOMENT_PAD = { '--i': 2, padding: '14px 16px' };

function Moment({ k, v }) {
  switch (k) {
    case 'asking': {
      // WHO IS ASKING, on the way past (Agent World plan §3d): one serif line,
      // only while a session on the Mac genuinely has its hand up
      const a = v.macSessionsHeadline;
      return (
        <Interactive as="section" className="nv-sum-card nv-sum-rise" style={{ '--i': 2, ...lit('var(--nv-gold)') }} onClick={a.go}
          aria-label={`${a.text} Look in Operations`}
          base={{ cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* the gold tile (mockup 101); its live dot says the hand is still up */}
          <span className="nv-tile nv-sum-asktile" style={{ '--a': 'var(--nv-gold)' }} aria-hidden="true"><SumIcon name="waiting" /></span>
          <span style={{ flex: 1, minWidth: 0, font: `italic 400 17px/1.3 ${SERIF}`, color: 'var(--nv-ink)', textWrap: 'balance' }}>{a.text}</span>
          <span style={{ flex: 'none', font: `600 13px ${UI}`, color: 'var(--nv-gold)' }}>Look</span>
        </Interactive>
      );
    }
    case 'money': {
      // MONEY THAT NEEDS HIM (10 Oct 2026): the CFO's signals, by code, in
      // Money's violet; each line in its category's hue. Discuss opens Nova
      // with the alert quoted; Noted files them as seen.
      const mm = v.moneyMoment;
      return (
        <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...lit('var(--nv-vi)') }} aria-label="Money">
          <MomentHead icon="trends" label="Money" tint="var(--nv-vi)" meta={<Meta tone="faint">{mm.count === 1 ? 'one thing for you' : `${mm.count} things for you`}</Meta>} />
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {mm.items.map((it) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'baseline', gap: '9px', minWidth: 0 }}>
                <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: '50%', background: it.hue, transform: 'translateY(-2px)' }} />
                <span style={{ flex: 1, minWidth: 0, font: `400 17px/1.3 ${SERIF}`, color: 'var(--nv-ink)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>{it.title}</span>
              </div>
            ))}
            {mm.more > 0 && <Meta tone="faint">and {mm.more} more on Money</Meta>}
          </div>
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <Pill label="Discuss" onClick={mm.discuss} accent="--nv-vi" />
            <Pill label="Open Money" onClick={mm.open} tone="quiet" />
            <Pill label="Noted" onClick={mm.noted} tone="quiet" />
          </div>
        </section>
      );
    }
    case 'pr': {
      // THE RECORD MOMENT: the morning after a PR, once; the set he did first.
      // Mockup 101: each lift in its muscle's hue, its gain as a pill, and
      // the card glows in those hues.
      const p = v.prMoment;
      const n = p.prs.length;
      const hues = p.prs.slice(0, 3).map((x) => (x.muscleGroup ? muscleVar(x.muscleGroup) : 'var(--nv-mg)'));
      const [d1, d2] = [hues[0], hues[1] || hues[0]];
      return (
        <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...glow(d1, d2, hues[2]) }} aria-label={n === 1 ? 'A record' : 'Records'}>
          <CardHead icon="star" label={n === 1 ? 'A record' : 'Records'} tile={[d1, d2]} meta={dayMonth(p.date)} />
          <div style={{ marginTop: '10px', font: `italic 400 18px/1.25 ${SERIF}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>
            {n === 1 ? 'One lift went further than it ever has.' : `${n} lifts went further than they ever have.`}
          </div>
          <div className="nv-sum-rrows">
            {p.prs.slice(0, 3).map((x, i) => {
              const gain = prGain(x);
              return (
                <div key={x.name} className="nv-sum-rr" style={{ '--h': hues[i] }}>
                  <span className="nm">{x.name}</span>
                  <span className="vv">{prLift(x)}</span>
                  <span className="gain">{prKind(x)}{gain ? <b>▲{gain}</b> : null}</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <Pill label="See the block" onClick={p.openTrain} tone="quiet" />
            <Pill label="Noted" onClick={p.dismiss} tone="quiet" />
          </div>
        </section>
      );
    }
    case 'plan': {
      // A PLAN IN FLIGHT: running, or finished while he was away
      const rp = v.runningPlan;
      const ready = rp.state === 'ready';
      const hue = ready ? 'var(--nv-good)' : 'var(--nv-cy)';
      return (
        <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...lit(hue) }} aria-label={ready ? 'Ready for you' : 'Working on it'}>
          <MomentHead icon="list" label={ready ? 'Ready for you' : 'Working on it'} tint={hue} tile={[hue, 'var(--nv-vi)']}
            meta={<Meta tone="faint">{rp.tally} · {rp.since}</Meta>} />
          {/* three lines, then an ellipsis: an amended goal runs to 880 characters */}
          <div style={{ marginTop: '6px', minWidth: 0, font: `italic 400 17px/1.25 ${SERIF}`, color: 'var(--nv-ink)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{rp.goal}</div>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {rp.steps.map((st) => (
              <div key={st.id} style={{ display: 'flex', alignItems: 'baseline', gap: '9px', minWidth: 0 }}>
                <span aria-hidden="true" style={{ flex: 'none', width: '14px', font: `600 12px ${ROUND}`, color: st.tint }}>{st.glyph}</span>
                <span style={{ flex: 1, minWidth: 0, font: `450 13px ${UI}`, color: st.status === 'waiting' ? 'var(--nv-ink60)' : 'var(--nv-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.what}</span>
                {st.error && <span style={{ flex: 'none', maxWidth: '40%', font: `450 12px ${UI}`, color: 'var(--nv-warn)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.error}</span>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '12px' }}>
            <Pill label={ready ? 'Walk me through it' : 'Open it'} onClick={rp.open} tone="quiet" />
          </div>
        </section>
      );
    }
    case 'landed': {
      // IT LANDED: today's settled captures, until he has seen them
      const L = v.landedMoment;
      return (
        <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...lit('var(--nv-good)') }} aria-label="Landed">
          <MomentHead icon="clear" label="Landed" tint="var(--nv-good)" meta={<Meta tone="faint">{L.count} today · {L.filed} filed</Meta>} />
          <div style={{ marginTop: '9px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {L.items.map((it) => (
              <Interactive key={it.id} as="div" onClick={it.open} aria-label={`Open ${it.title}`}
                base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, minHeight: '30px', borderRadius: '8px', padding: '5px', margin: '0 -5px' }}>
                <span aria-hidden="true" style={{ flex: 'none', font: `600 12px ${ROUND}`, color: it.status === 'filed' ? 'var(--nv-good)' : it.status === 'error' ? 'var(--nv-warn)' : 'var(--nv-ink60)' }}>
                  {it.status === 'filed' ? '✓' : it.status === 'error' ? '!' : '—'}
                </span>
                <span style={{ flex: 1, minWidth: 0, font: `450 13px ${UI}`, color: 'var(--nv-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                {it.analysed && <span style={{ flex: 'none', font: `600 12px ${UI}`, color: 'var(--nv-cy)' }}>Analysed</span>}
                <span style={{ flex: 'none', maxWidth: '38%', font: `450 12px ${UI}`, color: 'var(--nv-ink60)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.where}</span>
              </Interactive>
            ))}
          </div>
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <Pill label="Open the Inbox" onClick={L.openInbox} tone="quiet" />
            <Pill label="Noted" onClick={L.dismiss} tone="quiet" />
          </div>
        </section>
      );
    }
    case 'lead':
      // the Leader's two faces, his swipe — the box on this card's material
      return (
        <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...lit(`var(${leaderAccent(v.leaderBox)})`) }} aria-label="Lead">
          {/* mockup 101: the tiled header and a Pill door, as every Home card */}
          <LeaderBox box={v.leaderBox} variant="apple" mob bare
            head={({ label, chip, soon, dots, accent }) => (
              <CardHead icon="lead" label={label} tile={[accent]} meta={(
                <>
                  {soon && <Meta tone="gold">{soon}</Meta>}
                  {chip && <Meta tone="faint">{chip.charAt(0) + chip.slice(1).toLowerCase()}</Meta>}
                  {dots}
                </>
              )} />
            )}
            door={(open) => <Pill label="Open the Leader" onClick={open} tone="quiet" />} />
        </section>
      );
    case 'technique': {
      // TODAY'S TECHNIQUE, until he answers it: sealed on the reel when new,
      // then the drill and the two marks. The card carries the morph name the
      // Repertoire book takes when it opens.
      const t = v.todayTechnique;
      const vt = t.vtName ? { viewTransitionName: t.vtName } : null;
      if (t.reel) {
        return (
          <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...lit('var(--nv-mg)'), ...vt }} aria-label={t.modeLabel}>
            <TechniqueReveal t={t} variant="apple" mob bare head={(
              <CardHead icon="spark" label={t.modeLabel} tile={['var(--nv-mg)']} meta={(
                <>
                  {t.streak > 0 && <Meta tone="faint">{t.streak}-day streak</Meta>}
                  <TextAction tone="faint" compact onClick={t.openAll}>{t.position} of {t.total} ›</TextAction>
                </>
              )} />
            )} />
          </section>
        );
      }
      return (
        <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...lit('var(--nv-mg)'), ...vt }} aria-label={t.modeLabel}>
          <MomentHead icon="spark" label={t.modeLabel} tint="var(--nv-mg)" meta={(
            <>
              {t.streak > 0 && <Meta tone="faint"><CountUp value={t.streak} fromZero />-day streak</Meta>}
              <TextAction tone="faint" compact onClick={t.openAll}>{t.position} of {t.total} ›</TextAction>
            </>
          )} />
          <div style={{ marginTop: '10px', font: `700 18px/1.3 ${UI}`, color: 'var(--nv-ink)' }}>{t.name}</div>
          {t.drill && <div style={{ marginTop: '6px', font: `450 13.5px/1.5 ${UI}`, color: 'var(--nv-ink)' }}>{t.drill}</div>}
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <Pill label="I tried it" accent="--nv-mg" onClick={t.markTried} />
            <Pill label="Not today" onClick={t.markSkipped} tone="quiet" />
          </div>
        </section>
      );
    }
    case 'wrap': {
      // WRAP THE DAY: the evening's news — two rings, the counted serif line,
      // the fix he can still act on, and whether today's technique landed
      const w = v.wrapCard;
      if (w.onlyTechnique) {
        return (
          <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...lit('var(--nv-mg)') }} aria-label="Wrap the day">
            <MomentHead icon="sleep" label="Wrap the day" tint="var(--nv-mg)" meta={<Meta tone="faint">{w.note}</Meta>} />
            <div style={{ marginTop: '10px' }}><TechniqueCheck q={w.technique} label={false} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <TextAction tone="faint" onClick={w.dismiss}>Dismiss</TextAction>
            </div>
          </section>
        );
      }
      const short = w.floorMet === false;
      const hue = short ? 'var(--nv-gold)' : 'var(--nv-good)';
      return (
        <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...lit(hue) }} aria-label="Wrap the day">
          <MomentHead icon="sleep" label="Wrap the day" tint={hue} meta={<Meta tone={short ? 'gold' : 'good'}>{w.note}</Meta>} />
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: v.isMobile ? 'column' : 'row', alignItems: v.isMobile ? 'stretch' : 'center', gap: v.isMobile ? '14px' : '20px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '18px', flex: 'none' }}>
              {w.rings.map(({ key, ...r }) => <RingTile key={key} {...r} size={58} arrive />)}
            </div>
            <div style={{ minWidth: 0, flex: 1, font: `400 ${v.isMobile ? 18 : 19}px/1.35 ${SERIF}`, textWrap: 'pretty', color: 'var(--nv-ink)' }}>{w.line}</div>
          </div>
          {w.focus && <WrapFocus f={w.focus} />}
          {w.fix && <p style={{ margin: '11px 0 0', font: `450 12.5px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>{w.fix}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '9px', marginTop: '13px' }}>
            <Pill label="Read it to me" onClick={w.speak} />
            {w.fix && <Pill label="Open Fuel" onClick={w.openFuel} tone="quiet" />}
            <TextAction tone="faint" onClick={w.dismiss}>Dismiss</TextAction>
          </div>
          <TechniqueCheck q={w.technique} divided />
        </section>
      );
    }
    // THE DAILY REVIEW, on a forgetting curve (mockup 96): src/ReviewCard.jsx,
    // the same view model the grouped Home draws as rows.
    case 'review':
      return <ReviewMoment r={v.review} style={{ '--i': 2 }} />;
    default:
      return null;
  }
}

// -------------------------------------------------------------- highlight --
// ONE sentence, written by code from the same ring fields the Body card
// draws (summaryFacts.buildHighlight), so the two can never disagree; its
// bar; and one quiet act.
function Highlight({ h, cls, style }) {
  const tone = `var(--nv-sum-${h.tone || 'c1'})`;
  const pct = h.pct == null ? null : clampPct(h.pct);
  return (
    <section className={cls || 'nv-sum-card nv-sum-rise'} style={{ '--i': 2, ...style, padding: '14px 16px', ...glow(tone, 'var(--nv-cy)') }} aria-label={h.eyebrow}>
      <CardHead icon={HL_ICON[h.key] || 'clear'} label={h.eyebrow} tile={[tone, 'var(--nv-cy)']} meta={<NowHM />} />
      <p style={{ margin: '8px 0 0', font: '400 var(--nv-sum-hl-size)/1.35 var(--nv-sum-hl-font)', color: 'var(--nv-ink)', textWrap: 'pretty' }}>
        {h.segments.map((s, i) => (s.b ? <b key={i} style={{ fontWeight: 700 }}>{s.t}</b> : <span key={i}>{s.t}</span>))}
      </p>
      {pct != null && <div className="nv-sum-bar" aria-hidden="true"><i style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tone}, var(--nv-cy))` }} /></div>}
      {(h.axis || h.act) && (
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', font: `400 13px ${UI}`, color: 'var(--nv-ink60)' }}>
          <span style={{ minWidth: 0 }}>{h.axis}</span>
          {h.act && <Pill tone="quiet" label={h.act.label} onClick={h.act.run} />}
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------- Pinned --
// A half card with no partner beside it (an odd run of half cards ending at a
// wide card or at the end) takes the whole row, or it would sit beside a
// hole. Worked out on the list rather than with `:last-child:nth-child(odd)`,
// which counts the wide cards too: in the default order it would have left
// Practice alone on its row and pushed Trends onto one of its own.
function layoutCards(cards) {
  const out = [];
  let run = [];
  const flush = () => {
    // a half card left without a partner takes the row, unless he made it
    // half himself: then it keeps its size and the space beside it, as on
    // the iPhone (15 Oct)
    if (run.length % 2 && !run[run.length - 1].sized) run[run.length - 1] = { ...run[run.length - 1], span: true };
    out.push(...run);
    run = [];
  };
  for (const c of cards) {
    if (c.wide) { flush(); out.push({ ...c, span: true }); } else run.push(c);
  }
  flush();
  return out;
}

// Each Pinned card's hue, in one table: its header wears it and its light
// (lit, above) is it, so the two can never disagree. Body and Today keep ink
// headers — their rings and strip carry the colour — and are lit in Nova's
// own cyan.
// Mockup 101: Training takes the gold its medal and routine tile wear.
const CARD_HUE = { plan: 'var(--nv-sum-c5)', waiting: 'var(--nv-sum-c4)', training: 'var(--nv-gold)', practice: 'var(--nv-or)', trends: 'var(--nv-sum-c2)' };
const CARD_LIGHT = { ...CARD_HUE, body: 'var(--nv-cy)', today: 'var(--nv-cy)', day: 'var(--nv-cy)' };
// its own colours, per card (the dyn glow): Body its three rings, Today the
// moments on its rail, the rest their tile's two hues
const CARD_GLOW = {
  body: () => glow('var(--nv-sum-c2)', 'var(--nv-sum-c1)', 'var(--nv-sum-c3)'),
  today: (card) => {
    const hs = [...new Set((card.slots || []).map((x) => x.hue).filter(Boolean))].map((h) => `rgb(${h})`);
    return glow('var(--nv-cy)', hs[0], hs[1]);
  },
  training: (card) => glow(CARD_HUE.training, card.record ? 'var(--nv-good)' : undefined),
  trends: () => glow(CARD_HUE.trends, 'var(--nv-cy)'),
};

// YOUR DAY, DRAWN (mockup 86): Console's five instruments as a Home card,
// at the head of the page in the morning, or in Pinned all day when he pins
// it. Whether all five were already seen this morning is read ONCE, when
// Home mounts, so the card never vanishes under his finger on the fifth;
// the next visit to Home finds it gone. Reads the day once if it has not
// arrived yet (the slowest slice, so never at boot).
function YourDayCard({ d, cls = 'nv-sum-card nv-sum-rise', style }) {
  const [seenAll] = useState(() => DAY_KEYS.every((k) => readDaySeen().includes(k)));
  const shows = !!d && (d.pinned || !seenAll);
  useEffect(() => {
    if (shows && !d.data && !d.loading && !d.error && d.refresh) d.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows]);
  if (!shows) return null;
  return (
    <section className={`${cls} nv-day`} style={{ '--i': 2, padding: '14px 16px', ...lit(CARD_LIGHT.day), ...style }} aria-label="Your day, drawn">
      <YourDay data={d.data} loading={d.loading} error={d.error} onRefresh={d.refresh} foot={d.foot}
        head={({ pos }) => <CardHead icon="day" label="Your day, drawn" tile={['var(--nv-cy)', 'var(--nv-vi)']} meta={pos ? <Meta tone="faint">{pos}</Meta> : null} />}
        onSeen={(k) => markDaySeen(k)} />
    </section>
  );
}

// BODY — the ring hero. Protein, steps and sleep nested, each in its own hue
// by position (c1 · c2 · c3); a ring with no reading is dashed, never a zero.
const RING_TONES = ['var(--nv-sum-c1)', 'var(--nv-sum-c2)', 'var(--nv-sum-c3)'];
const RING_R = [64, 50, 36];

function RingSet({ rings }) {
  return (
    <svg viewBox="0 0 150 150" width="150" height="150" style={{ display: 'block', transform: 'rotate(-90deg)' }} aria-hidden="true">
      {rings.slice(0, 3).map((r, idx) => {
        const rad = RING_R[idx];
        const tone = RING_TONES[idx];
        if (r.state === 'absent') {
          return <circle key={r.key} cx="75" cy="75" r={rad} fill="none" stroke={tone} strokeWidth="6" strokeDasharray="4 8" opacity=".75" />;
        }
        const c = 2 * Math.PI * rad;
        const pct = clampPct(r.pct);
        return (
          <g key={r.key}>
            <circle cx="75" cy="75" r={rad} fill="none" stroke="var(--nv-sum-track)" strokeWidth="14" />
            {/* the arc draws itself in once (nvArcIn), then eases between values;
                at 0% there is no arc at all, not a round-capped dot */}
            <circle cx="75" cy="75" r={rad} fill="none" stroke={tone} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} opacity={pct > 0 ? 1 : 0}
              style={{ '--nv-arc-full': c, animation: `nvArcIn .9s cubic-bezier(.2,.8,.2,1) ${160 + idx * 70}ms backwards`, transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
          </g>
        );
      })}
    </svg>
  );
}

function BodyStat({ r, tone }) {
  const absent = r.state === 'absent';
  const said = absent ? 'no data' : `${r.value}${r.small || ''}`;
  const inner = (
    <>
      <div style={{ font: `600 12px ${UI}`, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--nv-ink60)' }}>{r.label}</div>
      <div style={{ font: `700 23px/1.05 ${ROUND}`, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: tone, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {/* a write that changes the figure counts it to the new value (CountUp) */}
        {absent ? '—' : <CountText text={r.value} fromZero />}
        {absent
          ? <small style={{ font: `600 14px ${ROUND}`, letterSpacing: 0, color: 'var(--nv-ink60)' }}> no data</small>
          : r.small ? <small style={{ font: `600 14px ${ROUND}`, letterSpacing: 0, opacity: 0.7 }}>{r.small}</small> : null}
      </div>
    </>
  );
  if (!r.open) return <div role="group" style={{ minWidth: 0 }} aria-label={`${r.label}: ${said}`}>{inner}</div>;
  return (
    <Interactive as="div" onClick={r.open} aria-label={`${r.label}: ${said}. Open`}
      base={{ cursor: 'pointer', minWidth: 0, borderRadius: '10px', padding: '2px 6px', margin: '-2px -6px' }}>
      {inner}
    </Interactive>
  );
}

function BodyCard({ card, cls, style }) {
  return (
    <section className={cls} style={{ ...style, padding: '12px 14px 14px', display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: '10px 14px', alignItems: 'center' }} aria-label="Body">
      <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
        <CardHead icon="body" label="Body" tile={[RING_TONES[1], RING_TONES[0]]} meta={card.meta} />
      </div>
      <RingSet rings={card.rings} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', minWidth: 0 }}>
        {card.rings.slice(0, 3).map((r, idx) => <BodyStat key={r.key} r={r} tone={RING_TONES[idx]} />)}
      </div>
    </section>
  );
}

// TODAY — the hourly strip (Weather's), the line under it, and the schedule
// box folded away until he asks for it, so Home stays quiet and the function
// stays on Home.
//
// A LABEL IS NEVER CUT (the audit's finding 5, mid-word truncation in the new
// cards). Columns are never narrower than their longest word; if six still
// will not fit — six columns at 402px leave ~54px each — the type steps down
// to 13 and then 12px, and past that the oldest slot is let go (the same
// preference stripSlots pads by: what just happened over hours ago), then the
// farthest ahead. Measured before paint, so nothing is ever seen cut.
function trimSlots(slots, drop) {
  let out = slots;
  for (let k = 0; k < drop && out.length > 3; k++) {
    const pastCount = out.filter((s) => s.kind === 'past').length;
    out = out[0].kind === 'past' && pastCount > 1 ? out.slice(1) : out.slice(0, -1);
  }
  return out;
}

function TodayStrip({ slots }) {
  const ref = useRef(null);
  const sig = slots.map((s) => `${s.kind}|${s.time}|${s.label}`).join('~');
  const [fit, setFit] = useState({ sig: '', level: 0 });
  const level = fit.sig === sig ? fit.level : 0;
  const shown = trimSlots(slots, Math.max(0, level - 2));
  const count = shown.length;
  // the ringed moment: the current one, or (between them) the next, which is
  // the one the line under the rail names
  const leadIdx = shown.some((x) => x.kind === 'now') ? -1 : shown.findIndex((x) => x.kind === 'next');
  // measured after every fit (a new `fit` object, including the resize reset
  // below), before paint; each step is one notch, so it settles in a few
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    if (level < 2 || count > 3) setFit({ sig, level: level + 1 });
  }, [fit, sig, level, count]);
  // a new width (rotation, the Mac window) earns a fresh fit from the top
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - w) > 1) { w = el.clientWidth; setFit({ sig: '', level: 0 }); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="nv-sum-strip" data-fit={level ? String(Math.min(level, 2)) : undefined}
      style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(min-content, 1fr))` }}>
      {shown.map((s, idx) => (
        // mockup 101: a rail of moments, each dot in the colour of what it is
        // (the slot's own hue); past ones dim, the current one ringed
        <div key={`${idx}-${s.time}`} className={`nv-sum-slot${s.kind === 'now' ? ' now' : s.kind === 'past' ? ' past' : ''}${idx === leadIdx ? ' lead' : ''}`}
          style={s.hue ? { '--h': `rgb(${s.hue})` } : undefined}>
          <span className="ic" aria-hidden="true"><i /></span>
          <span className="t">{s.time}</span>
          <span className="l">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function ScheduleRow({ s }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
      <TextAction compact tone="quiet" onClick={() => setOpen((o) => !o)} ariaLabel={open ? 'Hide the schedule box' : 'Ask Nova to schedule something'}>
        {open ? 'Hide' : 'Schedule…'}
      </TextAction>
      {open && (
        <div style={{ alignSelf: 'stretch', display: 'flex', gap: '8px', alignItems: 'center', animation: 'fadeUp var(--nv-dur-base) var(--nv-ease)' }}>
          {/* focused on open (he just asked for it); 16px, or iOS zooms the page */}
          <input autoFocus value={s.value} onChange={s.set} onKeyDown={(e) => { if (e.key === 'Enter') s.send(); }}
            aria-label="Ask Nova to schedule something"
            placeholder="Ask Nova… “dentist Thu 2pm”, “move gym to Fri 6pm”"
            style={{ flex: 1, minWidth: 0, background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)', borderRadius: '11px', padding: '9px 13px', color: 'var(--nv-ink)', font: `400 16px ${UI}`, outline: 'none' }} />
          <Pill label={s.busy ? 'Drafting…' : 'Draft'} onClick={s.busy ? undefined : s.send} tone="quiet" />
        </div>
      )}
    </div>
  );
}

function TodayCard({ card, cls, style }) {
  const right = card.openCalendar
    ? <TextAction compact tone="accent" onClick={card.openCalendar}>Calendar ›</TextAction>
    : card.stale ? <Meta tone="warn">{card.stale}</Meta> : null;
  return (
    <section className={`${cls} nv-sum-tile`} style={style} aria-label="Today">
      <CardHead icon="today" label="Today" tile={['var(--nv-cy)']} meta={right} />
      {card.slots.length > 0
        ? <TodayStrip slots={card.slots} />
        : card.empty ? <p style={{ margin: '10px 0 0', font: `400 15px/1.4 ${UI}`, color: 'var(--nv-ink60)' }}>{card.empty}</p> : null}
      {card.next && (
        <div className="nv-sum-next">
          <span><b>{card.next.lead.b}</b> {card.next.lead.rest}</span>
          {card.next.then && <span className="then">{card.next.then}</span>}
        </div>
      )}
      {card.schedule && <ScheduleRow s={card.schedule} />}
    </section>
  );
}

// THE PLAN — the one open item: a promise the plan keeps listing (with its
// days-ring and the three answers that are left), the day's one thing (with
// its marks), or the plan's own state (tap through to the Inbox).
function PlanCard({ card, cls, style }) {
  const stuck = card.kind === 'stuck';
  const body = (
    <>
      {stuck && <div style={{ marginTop: '8px' }}><DaysRing days={card.days} pct={card.pct} tone={card.tone} size={44} /></div>}
      <div style={{ marginTop: stuck ? '10px' : '12px', font: `600 16px/1.25 ${UI}`, color: 'var(--nv-ink)', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{card.text}</div>
      {card.sub ? <div className="nv-sum-sub">{card.sub}</div> : null}
    </>
  );
  return (
    <section className={`${cls} nv-sum-tile`} style={style} aria-label="The plan">
      <CardHead icon="list" label="The plan" tile={[CARD_HUE.plan]} />
      {card.kind === 'state'
        ? <Interactive as="div" onClick={card.openInbox} aria-label={`Open the Inbox: ${card.text}`} base={{ cursor: 'pointer', minWidth: 0, borderRadius: '10px' }}>{body}</Interactive>
        : body}
      <div style={{ marginTop: 'auto', paddingTop: '8px', minWidth: 0 }}>
        {stuck && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 4px', margin: '0 -8px' }}>
            <TextAction compact onClick={card.answers.start}>Start it with me</TextAction>
            <TextAction compact tone="quiet" onClick={card.answers.later}>Not now</TextAction>
            <TextAction compact tone="quiet" onClick={card.answers.drop}>Let it go</TextAction>
          </div>
        )}
        {card.kind === 'one' && card.marks && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 4px', margin: '0 -8px' }}>
            <TextAction compact onClick={card.marks.done}>Done</TextAction>
            <TextAction compact tone="quiet" onClick={card.marks.skip}>Skip</TextAction>
          </div>
        )}
        {card.kind === 'state' && card.approve && (
          <Pill tone="quiet" label={card.approve.label} onClick={card.approve.run} />
        )}
        {card.receipt && (
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--nv-sum-sep)', display: 'flex', alignItems: 'baseline', gap: '8px', animation: 'fadeUp var(--nv-dur-base) var(--nv-ease)' }}>
            <span style={{ flex: 1, minWidth: 0, font: `450 12.5px/1.45 ${UI}`, color: 'var(--nv-ink60)' }}>{card.receipt.said}</span>
            <TextAction compact onClick={card.receipt.undo}>Undo</TextAction>
          </div>
        )}
      </div>
    </section>
  );
}

// WAITING — what is waiting on his call; the whole card is the door.
function WaitingCard({ card, cls, style }) {
  return (
    <Interactive as="section" className={`${cls} nv-sum-tile`} style={style} onClick={card.open}
      aria-label={`Waiting: ${card.count} for your call. Open the Inbox`} base={{ cursor: 'pointer' }}>
      <CardHead icon="waiting" label="Waiting" tile={[CARD_HUE.waiting]} />
      <div className="nv-sum-big" style={{ color: CARD_HUE.waiting }}><CountText text={card.count} fromZero /></div>
      <div className="nv-sum-sub">{card.sub}</div>
    </Interactive>
  );
}

// TRAINING — today's session, or the record with its medal; the card is Train's door.
function TrainingCard({ card, cls, style }) {
  const rec = card.record;
  return (
    <Interactive as="section" className={`${cls} nv-sum-tile`} style={style} onClick={card.open}
      aria-label={rec ? `Training: ${rec.line}, ${rec.fig}. Open Train` : `Training: ${card.title}. Open Train`} base={{ cursor: 'pointer' }}>
      <CardHead icon="training" label="Training" meta={card.meta ? <span style={{ color: card.meta === 'done' ? 'var(--nv-good)' : undefined }}>{card.meta}</span> : null}
        tile={card.glyph ? <GlyphTile g={card.glyph} a={CARD_HUE.training} /> : [CARD_HUE.training]} />
      <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '12px', alignItems: 'center' }}>
        {rec ? (
          <>
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block', font: `600 16px/1.25 ${UI}`, color: 'var(--nv-ink)' }}>{rec.line}</b>
              <div style={{ marginTop: '2px', font: `700 15px ${ROUND}`, color: 'var(--nv-sum-c1)', fontVariantNumeric: 'tabular-nums' }}>{rec.fig}</div>
            </div>
            <span className="nv-sum-medal" aria-hidden="true">{rec.count}</span>
          </>
        ) : (
          <>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: `600 16px/1.25 ${UI}`, color: 'var(--nv-ink)' }}>{card.title}</div>
              {card.sub ? <div className="nv-sum-sub">{card.sub}</div> : null}
            </div>
            {card.readiness ? <RingTile size={44} label="Ready" value={card.readiness.value} pct={card.readiness.pct} state={card.readiness.state} arrive /> : <span />}
          </>
        )}
      </div>
    </Interactive>
  );
}

// PRACTICE — the skill's lamps and the next scene; the card opens the room,
// Rehearse starts the scene.
function PracticeTile({ card, cls, style }) {
  const prep = !card.title ? card.preparing?.[0] : null;
  return (
    <section className={`${cls} nv-sum-tile`} style={style} aria-label="Practice">
      <Interactive as="div" onClick={card.open} aria-label={`Open ${card.title || 'Practice'}`}
        base={{ cursor: 'pointer', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRadius: '12px' }}>
        <CardHead icon="practice" label="Practice" tile={[CARD_HUE.practice]} meta={card.meta ? <Meta tone="faint">{card.meta}</Meta> : null} />
        {card.title ? (
          <>
            {card.lamps.length > 0 && <LampRow lamps={card.lamps} size={14} gap={7} style={{ marginTop: 'auto', paddingTop: '12px' }} />}
            {card.next && (
              <div style={{ marginTop: '8px', font: `400 15.5px/1.35 ${SERIF}`, color: 'var(--nv-ink)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                Next: <em style={{ fontStyle: 'italic', color: 'var(--nv-or)' }}>{card.next.scenario}</em>
              </div>
            )}
          </>
        ) : prep ? (
          <div style={{ marginTop: 'auto', paddingTop: '10px', minWidth: 0 }}>
            <div style={{ font: `italic 400 15px/1.4 ${SERIF}`, color: prep.error ? 'var(--nv-ink60)' : 'var(--nv-ink)', overflowWrap: 'anywhere' }}>
              {prep.error ? 'Could not put together' : 'Putting together'} “{prep.text}”
            </div>
            <Meta tone={prep.error ? 'warn' : 'faint'}>{prep.error || 'Nova is reading your sources for the moves'}</Meta>
          </div>
        ) : null}
      </Interactive>
      {card.rehearse && (
        <div style={{ marginTop: '6px', marginLeft: '-8px' }}>
          <TextAction compact onClick={card.rehearse}>Rehearse</TextAction>
        </div>
      )}
    </section>
  );
}

// TRENDS — a week in four arrows: the run ending today, or an honest 'no data'.
const ARROW = { up: '↑', dn: '↓', flat: '→', none: '·' };
const ARROW_TONE = { up: 'var(--nv-sum-up)', dn: 'var(--nv-sum-dn)', flat: 'var(--nv-ink60)', none: 'var(--nv-ink40)' };
const ARROW_WORD = { up: 'rising', dn: 'falling', flat: 'level', none: 'no reading' };

function TrendsCard({ card, cls, style }) {
  return (
    <section className={`${cls} nv-sum-tile`} style={style} aria-label="Trends">
      <CardHead icon="trends" label="Trends" tile={[CARD_HUE.trends, 'var(--nv-cy)']} meta={card.demo ? <Meta tone="gold">demo</Meta> : null} />
      <ul className="nv-sum-trend">
        {card.rows.map((r) => {
          const said = `${r.label}: ${ARROW_WORD[r.dir] || ''}, ${r.value}`;
          const inner = (
            <>
              <span className="arr" aria-hidden="true" style={{ color: ARROW_TONE[r.dir] || 'var(--nv-ink60)' }}>{ARROW[r.dir] || '·'}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <span className="v">{r.value}</span>
            </>
          );
          return (
            <li key={r.key}>
              {r.open
                ? <Interactive as="div" className="nv-sum-trow" onClick={r.open} aria-label={`${said}. Open`} base={{ cursor: 'pointer' }}>{inner}</Interactive>
                : <div className="nv-sum-trow" role="group" aria-label={said}>{inner}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PinnedCard({ card, i }) {
  const cls = 'nv-sum-card nv-sum-rise';
  const style = { '--i': i + 3, ...(CARD_GLOW[card.key] ? CARD_GLOW[card.key](card) : lit(CARD_LIGHT[card.key])) };
  switch (card.key) {
    case 'highlight': return <Highlight h={card.h} cls={cls} style={{ '--i': i + 3 }} />;
    case 'body': return <BodyCard card={card} cls={cls} style={style} />;
    case 'today': return <TodayCard card={card} cls={cls} style={style} />;
    case 'plan': return <PlanCard card={card} cls={cls} style={style} />;
    case 'waiting': return <WaitingCard card={card} cls={cls} style={style} />;
    case 'training': return <TrainingCard card={card} cls={cls} style={style} />;
    case 'practice': return <PracticeTile card={card.card} cls={cls} style={style} />;
    case 'trends': return <TrendsCard card={card} cls={cls} style={style} />;
    case 'day': return <YourDayCard d={card} cls={cls} style={style} />;
    default: return null;
  }
}

// The grid he can rearrange in place: touch and hold a card, carry it, let
// go (src/useGridDrag.js). The order shown while carrying is a preview; the
// list is saved once, on release.
//
// EDIT MODE, THE IPHONE WAY (his ask, 15 Oct 2026: no "Pinned" or "Edit"
// labels; hold a tile to move or resize it "like the iPhone's home
// screen"). The first hold wakes every card and carries the one held. Awake,
// each card shows a remove mark and a size switch (whole row / half), a short
// press picks any card up, and its own buttons sleep so a tap cannot fire
// them. Done, or a tap anywhere off the cards, puts them back to sleep.
function PinnedGrid({ cards, edit }) {
  const keys = cards.map((c) => c.key);
  const { gridRef, order } = useGridDrag(keys, edit.moveVisible, { editing: edit.editing, onWake: edit.enter });
  const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
  const laid = layoutCards(order.map((k) => byKey[k]).filter(Boolean));
  const editing = edit.editing;
  useEffect(() => {
    if (!editing) return undefined;
    const off = (e) => {
      const t = e.target;
      if (gridRef.current?.contains(t) || t.closest?.('[data-nv-edit-keep], [role="dialog"]')) return;
      edit.done();
    };
    document.addEventListener('click', off, true);
    return () => document.removeEventListener('click', off, true);
  }, [editing, edit, gridRef]);
  return (
    <>
      {editing && (
        <div className="nv-sum-editbar" data-nv-edit-keep>
          {edit.hiddenCount > 0
            ? <span className="nv-sum-ebar-glass"><Pill tone="quiet" label={`Add a card (${edit.hiddenCount})`} onClick={edit.openEdit} /></span>
            : <span />}
          <Pill tone="accent" label="Done" onClick={edit.done} />
        </div>
      )}
      <div ref={gridRef} className={`nv-sum-grid nv-sum-grid-drag${editing ? ' nv-sum-editing' : ''}`}>
        {laid.map((card, i) => (
          <div key={card.key} className={`nv-sum-slot${card.span ? ' nv-sum-wide' : ''}`} style={{ '--j': i }}>
            <PinnedCard card={card} i={i} />
            {editing && <>
              <Interactive as="button" type="button" data-nv-edit-btn className="nv-sum-ebtn nv-sum-ebtn-x" haptic="tick"
                onClick={() => edit.remove(card.key)} aria-label={`Remove ${card.label} from Home`}>
                <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 6h6" /></svg>
              </Interactive>
              <Interactive as="button" type="button" data-nv-edit-btn className="nv-sum-ebtn nv-sum-ebtn-size" haptic="tick"
                onClick={() => edit.resize(card.key, card.wide)}
                aria-label={card.wide ? `Make ${card.label} half width` : `Make ${card.label} full width`}>
                {/* the size it becomes: one half-cell, or the whole row */}
                <svg viewBox="0 0 16 12" aria-hidden="true">{card.wide
                  ? <><rect x="1" y="2" width="6" height="8" rx="1.5" /><rect x="9" y="2" width="6" height="8" rx="1.5" className="o" /></>
                  : <rect x="1" y="2" width="14" height="8" rx="1.5" />}</svg>
              </Interactive>
            </>}
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Home ---
export function MissionSummary({ v }) {
  const S = v.summaryHome;
  // leaving Home puts the cards back to sleep
  const doneRef = useRef(S.edit.done);
  doneRef.current = S.edit.done;
  useEffect(() => () => doneRef.current(), []);
  const cards = layoutCards(S.cards);
  return (
    <div style={v.wrapMission} data-screen-label="Mission Control">
      {v.stepsOverlay && <StepsHistory v={v.stepsOverlay} />}
      {v.repertoireBook && <RepertoireBook v={v.repertoireBook} />}
      {v.calendarView && <CalendarView v={v.calendarView} />}
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <OfflineCard c={v.offlineCard} />
        {v.focusChip && <div style={{ marginTop: '10px' }}><FocusChip v={v.focusChip} /></div>}

        {/* who and when: the date, and Nova, one tap from talking */}
        <div className="nv-sum-rise" style={{ '--i': 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', padding: '4px 4px 0' }}>
          <span style={{ minWidth: 0, font: `600 13px ${UI}`, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--nv-ink60)' }}>{S.date}</span>
          <Interactive onClick={v.openVoice} aria-label="Talk to Nova" haptic="tick"
            base={{ flex: 'none', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' }}>
            <NovaCore size={36} engine={v.coreStyle} speaking={!!v.novaSpeaking} listening={!!v.novaListening} thinking={!!v.novaThinking} contest={!!v.novaContest} />
          </Interactive>
        </div>
        <h1 className="nv-sum-rise" style={{ '--i': 1, margin: '2px 4px 4px', font: `700 34px/1.1 ${UI}`, letterSpacing: '-.025em', textWrap: 'balance' }}>{S.greeting}</h1>
        {S.standfirst ? <p className="nv-sum-rise nv-sum-stand" style={{ '--i': 1 }}>{S.standfirst}</p> : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: S.standfirst ? 0 : '12px' }}>
          {/* the Daily review leads while something is due (mockup 96 Part 3:
              "at the head of Home"), so its answers sit above the fold */}
          {S.moments.includes('review') && <Moment key="review" k="review" v={v} />}
          {S.yourDay && !S.yourDay.pinned && <YourDayCard d={S.yourDay} />}
          {S.moments.filter((k) => k !== 'review').map((k) => <Moment key={k} k={k} v={v} />)}
        </div>

        <div style={{ height: S.moments.length || (S.yourDay && !S.yourDay.pinned) ? 12 : 0 }} />
        {cards.length > 0 && <PinnedGrid cards={S.cards} edit={S.edit} />}
        {/* the moments whose hour has passed (or not yet come) wait here, with
            the other tiles, instead of holding the top (src/momentPriority.js) */}
        {S.laterMoments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {S.laterMoments.map((k) => <Moment key={k} k={k} v={v} />)}
          </div>
        )}
        <p className="nv-sum-rise" style={{ '--i': cards.length + 3, margin: '16px 4px 0', font: `400 13px/1.4 ${UI}`, color: 'var(--nv-ink60)', textAlign: 'center', textWrap: 'pretty' }}>{S.foot}</p>
      </div>
      {S.edit.open && <PinnedEditSheet edit={S.edit} rows={S.allCards} />}
    </div>
  );
}
