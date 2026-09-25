import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { Button, Meta } from './Controls.jsx';
import { RingTile } from './RingTile.jsx';
import { muscleVar } from './muscleHue.js';

// COACH'S SUGGESTIONS — the Train screen's one place to answer the Coach.
// His ask, 25 Sep 2026: every suggested change, "to approve, discuss or
// disapprove… aesthetically appealing and apple-like… all the relevant
// information there and not be clunky… As I respond to each/any change,
// coach then makes those adjustments and a beautiful animation should play
// which turns the button I press into a tick." And: "Simplicity and ease of
// use MUST be the goal here and not over complicated like the inbox."
//
// So each card answers four questions and nothing else — WHAT changes (one
// sentence), WHERE (the routine, its day, the session's set count before and
// after), what it LOOKS like (the change drawn: a strike through a dropped
// lift, a set's dot waiting to fill, a day's routine replaced), and WHY (the
// Coach's reason, and where it came from). Three answers: Yes, Discuss, ✕.
// The view model is src/coachSuggestions.js; the motion is in index.css.

const hueOf = (muscle) => (muscle ? muscleVar(muscle) : 'var(--nv-ink40)');

// ── the banner under Today and Gym ───────────────────────────────────────────
export function CoachChangesBanner({ b }) {
  if (!b) return null;
  return (
    <Interactive as="button" onClick={b.go} haptic="tick" className="nv-pane nv-deck-rise" aria-label={`${b.title}${b.where ? `: ${b.where}` : ''}. Review them in Coach`}
      base={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', marginTop: 12,
        padding: '12px 14px', textAlign: 'left', cursor: 'pointer', color: 'var(--nv-ink)', font: 'inherit',
      }}
      activeStyle={{ transform: 'scale(.985)' }}>
      {/* gold ring = not yet decided (NOVA-METHOD §2b rule 8) */}
      <span aria-hidden="true" style={css('flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:2px solid color-mix(in srgb, var(--nv-gold) 70%, transparent);box-shadow:0 0 14px -4px color-mix(in srgb, var(--nv-gold) 60%, transparent);font:400 19px var(--nv-font-serif);color:var(--nv-gold)')}>{b.count}</span>
      <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={css('font:600 15px/1.3 var(--nv-font-ui)')}>{b.title}</span>
        <span style={css('font:500 12.5px/1.35 var(--nv-font-ui);color:var(--nv-ink60)')}>{b.where ? `${b.where} · ` : ''}tap to review</span>
      </span>
      <span aria-hidden="true" style={css('flex:none;font:400 22px/1 var(--nv-font-ui);color:var(--nv-ink40)')}>›</span>
    </Interactive>
  );
}

// ── the deck, at the top of the Coach tab ────────────────────────────────────
export function CoachSuggestionDeck({ d }) {
  if (!d || !d.cards.length) return null;
  return (
    <section data-coach-deck aria-label="Coach's suggested changes" style={css('margin-top:14px;display:flex;flex-direction:column;gap:10px;scroll-margin-top:90px;container:nv-deck / inline-size')}>
      <div style={css('display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap')}>
        <div style={css('min-width:0')}>
          <div style={css('display:flex;align-items:baseline;gap:8px')}>
            <span style={css('font:400 32px/1 var(--nv-font-serif);font-variant-numeric:tabular-nums')}>{d.waiting}</span>
            <span style={css('font:600 17px/1.2 var(--nv-font-ui);letter-spacing:-.01em')}>{d.waiting === 1 ? 'change' : 'changes'} from Coach</span>
          </div>
          <div style={css('margin-top:5px;display:flex;align-items:center;gap:7px;font:500 12.5px/1.35 var(--nv-font-ui);color:var(--nv-ink60)')}>
            {d.waiting > 0 && <span aria-hidden="true" style={css('width:6px;height:6px;border-radius:50%;background:var(--nv-gold)')} />}
            <span>{d.waiting > 0 ? `${d.where ? `${d.where} · ` : ''}waiting on you` : 'All answered'}</span>
          </div>
        </div>
        {d.canAll && <Button tone="good" variant="quiet" compact onClick={d.yesAll} haptic="commit">{d.allLabel}</Button>}
      </div>
      {/* the batch as a count that ticks: one segment per change, gold while
          it waits, green on a yes, quiet on a no */}
      {d.rail.length > 1 && (
        <div aria-hidden="true" style={css('display:flex;gap:3px')}>
          {d.rail.map((r, i) => (
            <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, transition: 'background-color var(--nv-dur-base) var(--nv-ease)',
              background: r === 'yes' ? 'var(--nv-good)' : r === 'no' ? 'color-mix(in srgb, var(--nv-ink) 20%, transparent)' : r === 'busy' ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-gold) 55%, transparent)' }} />
          ))}
        </div>
      )}
      <div style={css('display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:10px')}>
        {d.cards.map((c, i) => <SuggestionCard key={c.id} c={c} i={i} />)}
      </div>
    </section>
  );
}

function SuggestionCard({ c, i }) {
  const hue = c.hue;
  return (
    <div className="nv-sug-wrap" data-state={c.state === 'leaving' ? 'leaving' : 'open'}>
      <div className="nv-sug-fold">
        <article className="nv-pane nv-sug-card nv-deck-rise" data-state={c.state}
          style={{ display: 'flex', flexDirection: 'column', padding: '15px 16px 14px', minWidth: 0, animationDelay: `calc(var(--nv-stagger) * ${Math.min(i, 6)})` }}>
          {/* WHERE: the routine and its day, and what it does to the session */}
          <div style={css('display:flex;align-items:center;justify-content:space-between;gap:10px')}>
            <span style={css('display:flex;align-items:center;gap:7px;min-width:0;font:600 12.5px/1.3 var(--nv-font-ui);color:var(--nv-ink60)')}>
              <span aria-hidden="true" style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: hue, boxShadow: `0 0 8px -1px ${hue}` }} />
              <span style={css('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{c.where}</span>
            </span>
            {c.sets && (
              <span aria-label={`${c.sets.before} sets becomes ${c.sets.after}`} style={css('flex:none;display:flex;align-items:baseline;gap:5px;font:500 12px var(--nv-font-ui);color:var(--nv-ink60)')}>
                <span style={css('font:400 16px var(--nv-font-serif)')}>{c.sets.before}</span>
                <span aria-hidden="true">→</span>
                <span style={css('font:400 16px var(--nv-font-serif);color:var(--nv-ink)')}>{c.sets.after}</span>
                <span>sets</span>
              </span>
            )}
          </div>
          {/* WHAT, in one sentence */}
          <h3 style={css('margin:9px 0 0;font:600 17px/1.3 var(--nv-font-ui);letter-spacing:-.015em;color:var(--nv-ink);text-wrap:balance')}>{c.headline}</h3>
          <ChangeStrip c={c} />
          {/* WHY */}
          {c.why && <p style={css('margin:11px 0 0;font:500 14px/1.5 var(--nv-font-ui);color:var(--nv-ink60);text-wrap:pretty')}>{c.why}</p>}
          <div style={css('margin-top:7px;font:500 12px/1.3 var(--nv-font-ui);color:var(--nv-ink40)')}>{c.source}{c.when ? ` · ${c.when}` : ''}{c.via === 'draft' ? ' · a yes asks Coach to draft the exact change' : ''}</div>
          {/* his own edits have overtaken this card: say what changed, offer no yes */}
          {c.stale && <Meta as="div" tone="gold" style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0 }}>Already changed: {c.stale}. Clear it with ✕, or discuss.</Meta>}
          {/* THE ANSWER — at the foot of the card, so a row of cards answers on one line */}
          <div style={css('margin-top:auto;padding-top:13px;display:flex;align-items:center;gap:8px')}>
            {!c.stale && <TickButton state={c.state} onClick={c.yes} label={c.via === 'draft' ? 'Yes, plan it' : 'Yes'} ariaLabel={`Yes: ${c.headline}`} />}
            <span className="nv-sug-secondary" style={css('display:flex;align-items:center;gap:8px;flex:1;min-width:0')}>
              <Button tone="cyan" variant="quiet" compact onClick={c.discuss} ariaLabel={`Discuss: ${c.headline}`}>
                {c.state === 'discussing' ? 'Discussing' : 'Discuss'}
              </Button>
              <span style={css('flex:1')} />
              <Interactive as="button" onClick={c.no} haptic="tick" aria-label={`${c.stale ? 'Clear' : 'Not now'}: ${c.headline}`} title={c.stale ? 'Clear' : 'Not now'}
                base={{ flex: 'none', width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer',
                  border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', background: 'color-mix(in srgb, var(--nv-ink) 5%, transparent)',
                  color: 'var(--nv-ink60)', font: '500 17px/1 var(--nv-font-ui)', padding: 0 }}
                activeStyle={{ transform: 'scale(.94)' }}>✕</Interactive>
            </span>
          </div>
          {c.state === 'error' && <Meta as="div" tone="warn" style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0 }}>{c.error ? `${c.error}. Nothing changed.` : "That didn't go through — nothing changed. Try again."}</Meta>}
        </article>
      </div>
    </div>
  );
}

// The pressed Yes becomes the answer: pill → circle while the change is
// made → the tick draws itself. See .nv-tick in index.css.
function TickButton({ state, onClick, label, ariaLabel }) {
  const busy = state === 'working' || state === 'done';
  return (
    <Interactive as="button" className="nv-tick" data-state={state === 'working' || state === 'done' ? state : 'idle'}
      onClick={busy ? undefined : onClick} haptic={busy ? undefined : 'commit'} aria-label={state === 'done' ? `Done: ${ariaLabel}` : ariaLabel}
      aria-busy={state === 'working' || undefined} activeStyle={busy ? undefined : { transform: 'scale(.96)' }}>
      <span className="nv-tick-bg" aria-hidden="true" />
      <span className="nv-tick-label">
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {label}
      </span>
      <svg className="nv-tick-spin" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="8.5" fill="none" stroke="var(--nv-on-acc)" strokeOpacity=".9" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="18 40" /></svg>
      <svg className="nv-tick-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="var(--nv-on-acc)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </Interactive>
  );
}

// ── the change, drawn ────────────────────────────────────────────────────────
function Pill({ ex, gone, arriving, children }) {
  const hue = hueOf(ex?.muscle);
  return (
    <span className={gone ? 'nv-gone' : arriving ? 'nv-sug-arrive' : undefined}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, maxWidth: '100%', padding: '6px 11px', borderRadius: 999,
        font: '600 13px/1.25 var(--nv-font-ui)', color: 'var(--nv-ink)',
        background: arriving ? 'transparent' : `color-mix(in srgb, ${hue} 11%, transparent)`,
        border: arriving ? `1.5px dashed color-mix(in srgb, ${hue} 55%, transparent)` : `1px solid color-mix(in srgb, ${hue} 30%, transparent)` }}>
      <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: '50%', background: hue }} />
      <span style={css('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{ex?.name}</span>
      {children}
      {/* the strike only arrives on a yes — a line through the name BEFORE
          he decides made it harder to read (seen at 402px, 25 Sep) */}
      {gone && <span aria-hidden="true" className="nv-strike-real" />}
    </span>
  );
}

const Arrow = () => <span aria-hidden="true" style={css('flex:none;color:var(--nv-ink40);font:500 14px var(--nv-font-ui)')}>→</span>;

// where in the session it lands, in words ("after Incline Barbell Bench Press")
const Place = ({ text }) => <span style={css('min-width:0;font:500 12.5px/1.3 var(--nv-font-ui);color:var(--nv-ink60)')}>{text}</span>;

function Dots({ before, after, hue }) {
  const n = Math.max(before || 0, after || 0);
  return (
    <span aria-label={`${before} sets becomes ${after}`} style={css('display:inline-flex;align-items:center;gap:5px')}>
      {Array.from({ length: n }, (_, k) => {
        const isNew = k >= (before || 0);
        const drops = k >= (after || 0);
        return (
          <span key={k} className="nv-sug-dot" data-new={isNew || undefined} data-drop={drops || undefined}
            style={{ width: 11, height: 11, borderRadius: '50%', boxSizing: 'border-box',
              background: isNew ? 'transparent' : hue, border: isNew ? '1.5px dashed var(--nv-gold)' : `1.5px solid ${hue}` }} />
        );
      })}
    </span>
  );
}

function ChangeStrip({ c }) {
  const x = c.diff || {};
  const row = (children) => <div style={css('margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0')}>{children}</div>;
  // the count never wraps — a long exercise name gives way first
  if (x.type === 'remove') return row(<Pill ex={x.exercise} gone>{x.sets ? <span style={css('flex:none;white-space:nowrap;color:var(--nv-ink60);font-weight:500')}>−{x.sets} sets</span> : null}</Pill>);
  if (x.type === 'add') {
    return row(
      <>
        <Pill ex={x.exercise} arriving><span style={css('flex:none;white-space:nowrap;color:var(--nv-ink60);font-weight:500')}>+{x.sets}{x.reps ? ` × ${x.reps}` : ' sets'}</span></Pill>
        {x.place && <Place text={x.place} />}
      </>,
    );
  }
  // a move: the lift, then the routine it leaves (struck on a yes) → the one
  // it joins, and where in the order it lands
  if (x.type === 'move') {
    return (
      <div style={css('margin-top:10px;display:flex;flex-direction:column;gap:8px;min-width:0')}>
        <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0')}>
          <Pill ex={x.exercise}><span style={css('flex:none;white-space:nowrap;color:var(--nv-ink60);font-weight:500')}>{x.sets}{x.reps ? ` × ${x.reps}` : ' sets'}</span></Pill>
        </div>
        <div role="img" aria-label={`From ${x.from}${x.fromSets ? ` (${x.fromSets.before} sets becomes ${x.fromSets.after})` : ''} to ${x.to}${x.place ? `, ${x.place}` : ''}`}
          style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0')}>
          <span className="nv-gone" style={{ ...chip('var(--nv-ink60)'), position: 'relative' }}>
            {x.from}{x.fromSets && <span style={css('margin-left:6px;font-weight:500;color:var(--nv-ink40);font-variant-numeric:tabular-nums')}>{x.fromSets.before}→{x.fromSets.after}</span>}
            <span aria-hidden="true" className="nv-strike-real" />
          </span>
          <Arrow />
          <span className="nv-sug-arrive" style={chip('var(--nv-gold)')}>{x.to}</span>
          {x.place && <Place text={x.place} />}
        </div>
      </div>
    );
  }
  if (x.type === 'swap') return row(<><Pill ex={x.from} gone /><Arrow /><Pill ex={x.to} arriving /></>);
  if (x.type === 'targets') {
    const hue = hueOf(x.exercise?.muscle);
    return row(
      <>
        <Dots before={x.before?.sets} after={x.after?.sets} hue={hue} />
        {x.before?.reps && x.after?.reps && x.before.reps !== x.after.reps && (
          <span style={css('font:500 13px var(--nv-font-ui);color:var(--nv-ink60)')}><s>{x.before.reps}</s> → <b style={css('color:var(--nv-ink)')}>{x.after.reps}</b> reps</span>
        )}
      </>,
    );
  }
  if (x.type === 'reorder') {
    return row(
      <>
        <Pill ex={x.exercise} />
        {x.from && <span className="nv-gone" style={chip('var(--nv-ink40)')}>#{x.from}</span>}
        <Arrow />
        <span className="nv-sug-arrive" style={chip('var(--nv-gold)')}>#{x.to}</span>
      </>,
    );
  }
  if (x.type === 'remap') return row(<><Pill ex={{ name: x.exercise?.name, muscle: x.before }} /><Arrow /><span className="nv-sug-arrive" style={chip(hueOf(x.exercise?.muscle))}>{x.exercise?.muscle}</span></>);
  if (x.type === 'schedule') {
    return (
      <div role="img" aria-label={x.week.filter((d) => d.changes).map((d) => `${d.day}: ${d.before} becomes ${d.after}`).join('; ')}
        style={css('margin-top:10px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px')}>
        {x.week.map((d) => (
          <div key={d.day} style={{ minWidth: 0, textAlign: 'center', padding: '7px 2px', borderRadius: 10,
            background: d.changes ? 'color-mix(in srgb, var(--nv-gold) 12%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 4%, transparent)',
            border: d.changes ? '1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent)' : '1px solid transparent' }}>
            <div style={css('font:600 11px var(--nv-font-ui);color:var(--nv-ink40)')}>{d.day}</div>
            {d.changes ? (
              <>
                <div className="nv-gone" style={css('position:relative;margin-top:3px;font:500 10.5px/1.2 var(--nv-font-ui);color:var(--nv-ink60);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{d.before}<span aria-hidden="true" className="nv-strike-real" style={{ left: 2, right: 2 }} /></div>
                <div className="nv-sug-arrive" style={css('margin-top:2px;font:600 10.5px/1.2 var(--nv-font-ui);color:var(--nv-gold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{d.after}</div>
              </>
            ) : (
              <div style={css('margin-top:3px;font:500 10.5px/1.2 var(--nv-font-ui);color:var(--nv-ink60);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{d.after}</div>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (x.type === 'gauge') {
    return (
      <div style={css('margin-top:10px;display:flex;align-items:center;gap:12px')}>
        <RingTile label="" value={`${x.pct}%`} pct={x.pct} state={x.pct >= 70 ? 'missed' : 'behind'} size={52} />
        {x.label && <span style={css('font:500 13px/1.4 var(--nv-font-ui);color:var(--nv-ink60)')}>{x.label}</span>}
      </div>
    );
  }
  return null; // a note needs no drawing — the sentence is the change
}

const chip = (color) => ({ display: 'inline-flex', alignItems: 'center', padding: '5px 10px', borderRadius: 999, font: '600 12.5px var(--nv-font-ui)',
  color, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` });
