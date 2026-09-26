import { Interactive } from './Interactive.jsx';
import { Pill } from './AppleLayout.jsx';
import { Button, Eyebrow, Meta, TextAction } from './Controls.jsx';
import { glowPanel } from './glowPanel.js';
import { LampRow } from './PracticeLamps.jsx';

// PRACTICE ON HOME — the next scene, one tap from rehearsing it.
//
// One view model (valsPractice `practiceCard`), both Home idioms: the
// cupertino Group wraps this in MissionStructured, and the classic fold
// (MissionControl) wears it on a glowPanel in the practice hue. The card is
// absent when there is nothing to practise and nothing being prepared — Home
// never carries an empty box.
//
// What it shows is the skill's picture — the lamps, lit for every move he has
// landed at least once — and the serif news line with a live dot: the scene
// Nova would run next and what it is for. While a page is being prepared it
// says so, in his own words, with the house working pulse and no button.

const S = 'var(--nv-font-serif)';

const liveDot = (color = 'var(--nv-or)') => (
  <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, marginTop: '0.55em', borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}`, animation: 'novaPulse 2s infinite var(--nv-anim)' }} />
);

function Body({ card, apple }) {
  return (
    <div style={{ animation: 'popIn var(--nv-dur-base) var(--nv-ease) both', minWidth: 0 }}>
      {card.title && (
        <>
          <Interactive as="div" onClick={card.open} aria-label={`Open ${card.title} in Practice`}
            base={{ cursor: 'pointer', font: `400 ${apple ? 20 : 19}px/1.25 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty', overflowWrap: 'anywhere' }}
            hoverStyle={{ color: 'var(--nv-or)' }}>
            {card.title}
          </Interactive>
          {card.lamps.length > 0 && <LampRow lamps={card.lamps} size={apple ? 18 : 16} gap={9} style={{ marginTop: '11px' }} />}
          {card.next && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '9px', alignItems: 'flex-start', minWidth: 0 }}>
              {liveDot()}
              <div style={{ minWidth: 0, font: `400 15.5px/1.45 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>
                Next: <em style={{ fontStyle: 'italic', color: 'var(--nv-or)' }}>{card.next.scenario}</em>
                {card.next.why ? <span style={{ color: 'var(--nv-ink60)' }}> — {card.next.why}</span> : null}
              </div>
            </div>
          )}
        </>
      )}
      {card.preparing.map((p) => (
        <div key={p.id} style={{ marginTop: card.title ? '12px' : 0, display: 'flex', gap: '9px', alignItems: 'flex-start', minWidth: 0 }}>
          {p.error ? <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, marginTop: '0.55em', borderRadius: '50%', background: 'var(--nv-warn)' }} /> : liveDot()}
          <div style={{ minWidth: 0 }}>
            <div style={{ font: `italic 400 15px/1.45 ${S}`, color: p.error ? 'var(--nv-ink60)' : 'var(--nv-ink)', overflowWrap: 'anywhere' }}>
              {p.error ? 'Could not put together' : 'Putting together'} “{p.text}”
            </div>
            <Meta tone={p.error ? 'warn' : 'faint'}>{p.error ? p.error : 'Nova is reading your sources for the moves'}</Meta>
          </div>
        </div>
      ))}
      {card.title && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '9px', marginTop: '14px' }}>
          {card.rehearse && (apple
            ? <Pill label="Rehearse" accent="--nv-or" onClick={card.rehearse} />
            : <Button compact tone="var(--nv-or)" onClick={card.rehearse}>Rehearse</Button>)}
          <TextAction tone="faint" onClick={card.open}>Open the room</TextAction>
        </div>
      )}
    </div>
  );
}

// variant: 'apple' renders the body alone (MissionStructured supplies the
// Group and its label); 'command' renders its own lit panel.
export function PracticeCard({ card, variant = 'apple' }) {
  if (!card) return null;
  if (variant === 'apple') return <div style={{ padding: '14px 16px' }}><Body card={card} apple /></div>;
  const lit = glowPanel('--nv-or');
  return (
    <section className={lit.className} style={{ marginTop: '18px', padding: '16px 18px 14px', ...lit.style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '9px' }}>
        <Eyebrow as="span" tone="var(--nv-or)">Practice</Eyebrow>
        <Meta tone="faint">{card.meta}</Meta>
      </div>
      <Body card={card} apple={false} />
    </section>
  );
}
