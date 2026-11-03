import { Interactive } from './Interactive.jsx';
import { TickButton } from './TickButton.jsx';
import { Meta, TextAction } from './Controls.jsx';
import { sleepHm, STEP_MIN } from './sleepCheckCard.js';

const UI = 'var(--nv-font-ui)';
const S = 'var(--nv-font-serif)';
const ROUND = 'var(--nv-font-round)';

// WAS THAT YOUR WHOLE NIGHT? (3 Nov 2026, his report: an accidental hour on
// the couch with the Watch on, the real night with it off, and Nova reading
// "sleep 1.1h" back to him as fact.) The server holds such a night back from
// every reader (healthData.js sleepSuspect); this asks him, once, as content
// in the feed and never as a banner.
//
// The number gets a form: the night as recorded against his usual, two bars
// on one scale, the short one in gold because it is unconfirmed. Then the
// decision is light (§2b rule 8): "Yes, that was it" is the house tick, "No,
// the watch missed it" the quiet cross, and "I slept about…" opens a stepper
// already set to his usual (Parkinson's law: never make him type what Nova
// knows). The answer becomes a receipt with Undo, holds, then the card
// settles out (.nv-sleepq-leave). Body only: each Home idiom wraps it in its
// own shell, from the one view model (valsMission sleepCheck).
export function SleepCheckBody({ q }) {
  if (!q) return null;
  if (q.phase === 'answered') {
    const kept = q.verdict !== 'missed';
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, animation: 'popIn var(--nv-dur-base) var(--nv-ease) both' }}>
        <span aria-hidden="true" style={{
          flex: 'none', width: '28px', height: '28px', marginTop: '1px', borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: kept ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 8%, transparent)',
          color: kept ? 'var(--nv-on-acc)' : 'var(--nv-ink60)', font: `600 13px ${UI}`,
        }}>
          {kept
            ? <svg width="15" height="15" viewBox="0 0 24 24"><path className="nv-sleepq-check" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            : '✕'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `400 17px/1.35 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>{q.line}</div>
          <Meta tone="faint" as="div" style={{ marginTop: '5px' }}>Filed to Health · in your Inbox</Meta>
        </div>
        {q.undoable && <TextAction tone="faint" compact onClick={q.undo}>Undo</TextAction>}
      </div>
    );
  }

  const busy = q.tick !== 'idle';
  const scale = Math.max(q.usual, q.minutes, q.phase === 'stepping' ? q.draft : 0) || 1;
  return (
    <div style={{ minWidth: 0 }}>
      <NightBars rows={[
        { key: 'rec', label: 'Recorded', minutes: q.minutes, hue: 'var(--nv-gold)', dashed: true },
        q.phase === 'stepping'
          ? { key: 'his', label: 'You say', minutes: q.draft, hue: 'var(--nv-cy)' }
          : { key: 'usual', label: 'Your usual', minutes: q.usual, hue: 'var(--nv-cy)' },
      ]} scale={scale} />
      <div style={{ marginTop: '12px', font: `400 18px/1.32 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>{q.line}</div>

      {q.phase === 'stepping' ? (
        <div style={{ marginTop: '12px' }}>
          <div role="group" aria-label="How long you slept" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <StepBtn label={`Fifteen minutes less than ${sleepHm(q.draft)}`} onClick={() => q.step(-STEP_MIN)} disabled={busy}>−</StepBtn>
            <div aria-live="polite" style={{ flex: 1, textAlign: 'center', font: `700 30px/1 ${ROUND}`, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', color: 'var(--nv-ink)' }}>
              {sleepHm(q.draft)}
            </div>
            <StepBtn label={`Fifteen minutes more than ${sleepHm(q.draft)}`} onClick={() => q.step(STEP_MIN)} disabled={busy}>+</StepBtn>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
            <TickButton state={q.tick} onClick={q.saveCorrection} label={`Log ${sleepHm(q.draft)}`} ariaLabel={`Log ${sleepHm(q.draft)} of sleep for last night`} />
            {!busy && <TextAction tone="faint" onClick={q.closeStepper}>Back</TextAction>}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
          <TickButton state={q.pick === 'real' ? q.tick : 'idle'} onClick={busy ? undefined : q.real} label="Yes, that was it" ariaLabel={`Yes, ${sleepHm(q.minutes)} was my whole night`} />
          <span style={{ display: 'contents' }}>
            <QuietBtn busy={busy} onClick={q.missed} ariaLabel="No, the watch missed my sleep">
              <span aria-hidden="true" style={{ color: 'var(--nv-ink60)' }}>✕</span>No, the watch missed it
            </QuietBtn>
            <QuietBtn busy={busy} onClick={q.openStepper} ariaLabel="I slept about, set how long">I slept about…</QuietBtn>
          </span>
          {!busy && <TextAction tone="faint" onClick={q.dismiss}>Not now</TextAction>}
        </div>
      )}
    </div>
  );
}

// the night against his usual, on one scale; the unconfirmed one dashed
function NightBars({ rows, scale }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '7px 10px' }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'contents' }}>
          <span style={{ font: `500 12px ${UI}`, color: 'var(--nv-ink60)' }}>{r.label}</span>
          <span aria-hidden="true" style={{ position: 'relative', height: '8px', borderRadius: '999px', background: 'color-mix(in srgb, var(--nv-ink) 7%, transparent)', overflow: 'hidden' }}>
            <i className="nv-sleepq-bar" style={{
              position: 'absolute', inset: 0, borderRadius: '999px', transformOrigin: 'left',
              transform: `scaleX(${Math.max(0.02, Math.min(1, r.minutes / scale))})`,
              background: r.dashed
                ? `repeating-linear-gradient(90deg, ${r.hue} 0 6px, transparent 6px 9px)`
                : r.hue,
            }} />
          </span>
          <span style={{ font: `600 13px ${ROUND}`, fontVariantNumeric: 'tabular-nums', color: r.hue, textAlign: 'right' }}>{sleepHm(r.minutes)}</span>
        </div>
      ))}
    </div>
  );
}

function QuietBtn({ busy, onClick, ariaLabel, children }) {
  return (
    <Interactive as="button" type="button" onClick={busy ? undefined : onClick} haptic={busy ? undefined : 'tick'} aria-label={ariaLabel}
      base={{
        display: 'inline-flex', alignItems: 'center', gap: '7px', minHeight: '44px', padding: '0 16px', borderRadius: '999px',
        border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', background: 'color-mix(in srgb, var(--nv-ink) 5%, transparent)',
        color: 'var(--nv-ink)', font: `600 15px ${UI}`, cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.35 : 1, transition: 'opacity var(--nv-dur-fast) var(--nv-ease)',
      }}
      activeStyle={busy ? undefined : { transform: 'scale(.96)' }}>
      {children}
    </Interactive>
  );
}

function StepBtn({ label, onClick, disabled, children }) {
  return (
    <Interactive as="button" type="button" onClick={disabled ? undefined : onClick} haptic={disabled ? undefined : 'tick'} aria-label={label}
      base={{
        flex: 'none', width: '44px', height: '44px', borderRadius: '50%', display: 'grid', placeItems: 'center',
        border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', background: 'color-mix(in srgb, var(--nv-ink) 5%, transparent)',
        color: 'var(--nv-ink)', font: `500 22px/1 ${UI}`, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1,
      }}
      activeStyle={disabled ? undefined : { transform: 'scale(.92)' }}>
      {children}
    </Interactive>
  );
}
