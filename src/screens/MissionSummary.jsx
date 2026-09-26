import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { StepsHistory } from '../StepsHistory.jsx';
import { RepertoireBook } from '../RepertoireBook.jsx';
import { CalendarView } from '../CalendarView.jsx';
import { FocusChip } from '../FocusChip.jsx';
import { LeaderBox } from '../LeaderBox.jsx';
import { TechniqueReveal } from '../TechniqueReveal.jsx';
import { TechniqueCheck } from '../TechniqueCheck.jsx';
import { RingTile } from '../RingTile.jsx';
import { LampRow } from '../PracticeLamps.jsx';
import { DaysRing } from '../StuckCard.jsx';
import { Pill } from '../AppleLayout.jsx';
import { Eyebrow, TextAction, Meta } from '../Controls.jsx';
import { PinnedEditSheet } from '../PinnedEditSheet.jsx';
import { prLift, prBasis } from '../missionFocus.js';

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
};
function SumIcon({ name }) {
  return <svg className="nv-sum-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICONS[name] || ICONS.clear}</svg>;
}
// the highlight's rungs (summaryFacts.buildHighlight) → the mark each wears
const HL_ICON = { protein: 'protein', steps: 'steps', sleep: 'sleep', readiness: 'training', one: 'plan', next: 'today', clear: 'clear' };

// A card's header: the mark and the name in the card's hue, a quiet meta right.
function CardHead({ icon, label, tint, meta }) {
  return (
    <div className="nv-sum-ch" style={tint ? { color: tint } : undefined}>
      <SumIcon name={icon} />
      <span>{label}</span>
      {meta ? <span className="nv-sum-ch-meta">{meta}</span> : null}
    </div>
  );
}

// A moment's header: the eyebrow in the moment's own hue, as on the other idioms.
function MomentHead({ label, tint, meta }) {
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
        <Interactive as="section" className="nv-sum-card nv-sum-rise" style={{ '--i': 2 }} onClick={a.go}
          aria-label={`${a.text} Look in Operations`}
          base={{ cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: '50%', background: 'var(--nv-gold)', boxShadow: '0 0 9px var(--nv-gold)', animation: 'novaPulse 2.4s infinite var(--nv-anim)' }} />
          <span style={{ flex: 1, minWidth: 0, font: `italic 400 17px/1.3 ${SERIF}`, color: 'var(--nv-ink)', textWrap: 'balance' }}>{a.text}</span>
          <span style={{ flex: 'none', font: `600 13px ${UI}`, color: 'var(--nv-gold)' }}>Look</span>
        </Interactive>
      );
    }
    case 'pr': {
      // THE RECORD MOMENT: the morning after a PR, once; the set he did first
      const p = v.prMoment;
      const n = p.prs.length;
      return (
        <section className="nv-sum-card nv-sum-rise" style={MOMENT_PAD} aria-label={n === 1 ? 'A record' : 'Records'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div aria-hidden="true" style={{ flex: 'none', width: 58, height: 58, borderRadius: '50%', border: '1.5px dashed color-mix(in srgb, var(--nv-mg) 70%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 22px ${ROUND}`, color: 'var(--nv-ink)', boxShadow: '0 0 30px -8px var(--nv-mg)' }}>{n}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow tone="var(--nv-mg)">{n === 1 ? 'A record' : 'Records'} · {p.date.slice(5).replace('-', '/')}</Eyebrow>
              <div style={{ marginTop: '3px', font: `italic 400 18px/1.2 ${SERIF}`, color: 'var(--nv-ink)' }}>
                {n === 1 ? 'One lift went further than it ever has.' : `${n} lifts went further than they ever have.`}
              </div>
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {p.prs.slice(0, 3).map((x) => (
                  <div key={x.name} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', font: `450 13px ${UI}`, color: 'var(--nv-ink)' }}>
                    <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
                    <span style={{ flex: 'none', textAlign: 'right' }}>
                      <span style={{ font: `600 13px ${ROUND}`, color: 'var(--nv-mg)', fontVariantNumeric: 'tabular-nums' }}>{prLift(x)}</span>
                      <span style={{ display: 'block', marginTop: '1px', font: `450 12px ${UI}`, color: 'var(--nv-ink60)' }}>{prBasis(x)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
      return (
        <section className="nv-sum-card nv-sum-rise" style={MOMENT_PAD} aria-label={ready ? 'Ready for you' : 'Working on it'}>
          <MomentHead label={ready ? 'Ready for you' : 'Working on it'} tint={ready ? 'var(--nv-good)' : 'var(--nv-cy)'}
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
        <section className="nv-sum-card nv-sum-rise" style={MOMENT_PAD} aria-label="Landed">
          <MomentHead label="Landed" tint="var(--nv-good)" meta={<Meta tone="faint">{L.count} today · {L.filed} filed</Meta>} />
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
        <section className="nv-sum-card nv-sum-rise" style={MOMENT_PAD} aria-label="Lead">
          <LeaderBox box={v.leaderBox} variant="apple" mob bare />
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
          <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...vt }} aria-label={t.modeLabel}>
            <TechniqueReveal t={t} variant="apple" mob bare />
          </section>
        );
      }
      return (
        <section className="nv-sum-card nv-sum-rise" style={{ ...MOMENT_PAD, ...vt }} aria-label={t.modeLabel}>
          <MomentHead label={t.modeLabel} tint="var(--nv-mg)" meta={(
            <>
              {t.streak > 0 && <Meta tone="faint">{t.streak}-day streak</Meta>}
              <TextAction tone="faint" compact onClick={t.openAll}>{t.position} of {t.total} ›</TextAction>
            </>
          )} />
          <div style={{ marginTop: '6px', font: `600 17px/1.25 ${UI}`, color: 'var(--nv-ink)' }}>{t.name}</div>
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
          <section className="nv-sum-card nv-sum-rise" style={MOMENT_PAD} aria-label="Wrap the day">
            <MomentHead label="Wrap the day" tint="var(--nv-mg)" meta={<Meta tone="faint">{w.note}</Meta>} />
            <div style={{ marginTop: '10px' }}><TechniqueCheck q={w.technique} label={false} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <TextAction tone="faint" onClick={w.dismiss}>Dismiss</TextAction>
            </div>
          </section>
        );
      }
      const short = w.floorMet === false;
      return (
        <section className="nv-sum-card nv-sum-rise" style={MOMENT_PAD} aria-label="Wrap the day">
          <MomentHead label="Wrap the day" tint={short ? 'var(--nv-gold)' : 'var(--nv-good)'} meta={<Meta tone={short ? 'gold' : 'good'}>{w.note}</Meta>} />
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: v.isMobile ? 'column' : 'row', alignItems: v.isMobile ? 'stretch' : 'center', gap: v.isMobile ? '14px' : '20px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '18px', flex: 'none' }}>
              {w.rings.map(({ key, ...r }) => <RingTile key={key} {...r} size={58} />)}
            </div>
            <div style={{ minWidth: 0, flex: 1, font: `400 ${v.isMobile ? 18 : 19}px/1.35 ${SERIF}`, textWrap: 'pretty', color: 'var(--nv-ink)' }}>{w.line}</div>
          </div>
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
    default:
      return null;
  }
}

// -------------------------------------------------------------- highlight --
// ONE sentence, written by code from the same ring fields the Body card
// draws (summaryFacts.buildHighlight), so the two can never disagree; its
// bar; and one quiet act.
function Highlight({ h }) {
  const tone = `var(--nv-sum-${h.tone || 'c1'})`;
  const pct = h.pct == null ? null : clampPct(h.pct);
  return (
    <section className="nv-sum-card nv-sum-rise" style={{ '--i': 2, padding: '14px 16px' }} aria-label={h.eyebrow}>
      <div className="nv-sum-ch" style={{ color: tone }}>
        <SumIcon name={HL_ICON[h.key] || 'clear'} />
        <span>{h.eyebrow}</span>
        <span className="nv-sum-ch-meta"><NowHM /></span>
      </div>
      <p style={{ margin: '8px 0 0', font: '400 var(--nv-sum-hl-size)/1.35 var(--nv-sum-hl-font)', color: 'var(--nv-ink)', textWrap: 'pretty' }}>
        {h.segments.map((s, i) => (s.b ? <b key={i} style={{ fontWeight: 700 }}>{s.t}</b> : <span key={i}>{s.t}</span>))}
      </p>
      {pct != null && <div className="nv-sum-bar" aria-hidden="true"><i style={{ width: `${pct}%`, background: tone }} /></div>}
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
    if (run.length % 2) run[run.length - 1] = { ...run[run.length - 1], span: true };
    out.push(...run);
    run = [];
  };
  for (const c of cards) {
    if (c.wide) { flush(); out.push({ ...c, span: true }); } else run.push(c);
  }
  flush();
  return out;
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
        {absent ? '—' : r.value}
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
        <CardHead icon="body" label="Body" meta={card.meta} />
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
        <div key={`${idx}-${s.time}`} className={`nv-sum-slot${s.kind === 'now' ? ' now' : s.kind === 'past' ? ' past' : ''}`}>
          <span className="t">{s.time}</span>
          <span className="ic" aria-hidden="true"><i style={s.kind !== 'now' && s.hue ? { background: `rgb(${s.hue})` } : undefined} /></span>
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
      <CardHead icon="today" label="Today" meta={right} />
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
      <CardHead icon="plan" label="The plan" tint="var(--nv-sum-c5)" />
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
      <CardHead icon="waiting" label="Waiting" tint="var(--nv-sum-c4)" />
      <div className="nv-sum-big">{card.count}</div>
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
      <CardHead icon="training" label="Training" tint="var(--nv-sum-c3)" meta={card.meta || null} />
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
            {card.readiness ? <RingTile size={44} label="Ready" value={card.readiness.value} pct={card.readiness.pct} state={card.readiness.state} /> : <span />}
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
        <CardHead icon="practice" label="Practice" tint="var(--nv-or)" meta={card.meta ? <Meta tone="faint">{card.meta}</Meta> : null} />
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
      <CardHead icon="trends" label="Trends" tint="var(--nv-sum-c2)" meta={card.demo ? <Meta tone="gold">demo</Meta> : null} />
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
  const cls = `nv-sum-card nv-sum-rise${card.span ? ' nv-sum-wide' : ''}`;
  const style = { '--i': i + 3 };
  switch (card.key) {
    case 'body': return <BodyCard card={card} cls={cls} style={style} />;
    case 'today': return <TodayCard card={card} cls={cls} style={style} />;
    case 'plan': return <PlanCard card={card} cls={cls} style={style} />;
    case 'waiting': return <WaitingCard card={card} cls={cls} style={style} />;
    case 'training': return <TrainingCard card={card} cls={cls} style={style} />;
    case 'practice': return <PracticeTile card={card.card} cls={cls} style={style} />;
    case 'trends': return <TrendsCard card={card} cls={cls} style={style} />;
    default: return null;
  }
}

// ------------------------------------------------------------------ Home ---
export function MissionSummary({ v }) {
  const S = v.summaryHome;
  const cards = layoutCards(S.cards);
  return (
    <div style={v.wrapMission} data-screen-label="Mission Control">
      {v.stepsOverlay && <StepsHistory v={v.stepsOverlay} />}
      {v.repertoireBook && <RepertoireBook v={v.repertoireBook} />}
      {v.calendarView && <CalendarView v={v.calendarView} />}
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        {v.focusChip && <div style={{ marginTop: '10px' }}><FocusChip v={v.focusChip} /></div>}

        {/* who and when: the date, and Nova, one tap from talking */}
        <div className="nv-sum-rise" style={{ '--i': 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', padding: '4px 4px 0' }}>
          <span style={{ minWidth: 0, font: `600 13px ${UI}`, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--nv-ink60)' }}>{S.date}</span>
          <Interactive onClick={v.openVoice} aria-label="Talk to Nova" haptic="tick"
            base={{ flex: 'none', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' }}>
            <NovaCore size={36} engine={v.coreStyle} />
          </Interactive>
        </div>
        <h1 className="nv-sum-rise" style={{ '--i': 1, margin: '2px 4px 4px', font: `700 34px/1.1 ${UI}`, letterSpacing: '-.025em', textWrap: 'balance' }}>{S.greeting}</h1>
        {S.standfirst ? <p className="nv-sum-rise nv-sum-stand" style={{ '--i': 1 }}>{S.standfirst}</p> : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: S.standfirst ? 0 : '12px' }}>
          {S.moments.map((k) => <Moment key={k} k={k} v={v} />)}
          <Highlight h={S.highlight} />
        </div>

        <div className="nv-sum-rise" style={{ '--i': 3, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', margin: '22px 4px 8px' }}>
          <h2 style={{ margin: 0, font: `700 22px/1.2 ${UI}`, letterSpacing: '-.02em' }}>Pinned</h2>
          <TextAction tone="accent" onClick={S.edit.openEdit} ariaLabel="Edit Pinned">Edit</TextAction>
        </div>
        {cards.length > 0 && (
          <div className="nv-sum-grid">
            {cards.map((card, i) => <PinnedCard key={card.key} card={card} i={i} />)}
          </div>
        )}
        <p className="nv-sum-rise" style={{ '--i': cards.length + 3, margin: '16px 4px 0', font: `400 13px/1.4 ${UI}`, color: 'var(--nv-ink60)', textAlign: 'center', textWrap: 'pretty' }}>{S.foot}</p>
      </div>
      {S.edit.open && <PinnedEditSheet edit={S.edit} rows={S.allCards} />}
    </div>
  );
}
