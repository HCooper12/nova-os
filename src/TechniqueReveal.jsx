import { glowPanel } from './glowPanel.js';
import { Eyebrow, Meta, TextAction } from './Controls.jsx';
import { SpinReveal } from './SpinReveal.jsx';

const UI = 'var(--nv-font-ui)';
const S = 'var(--nv-font-serif)';

// TODAY'S TECHNIQUE, SEALED — 25 Sep 2026, his yes to the Hormozi-reel idea:
// a NEW technique arrives on a reel he spins, instead of already lying open.
//
// Why a sealed card is worth one tap: by 25 Sep Nova had served a technique on
// eleven days and he had marked none of them. A card that is simply there is
// a card that is scrolled past; a card he opens is one he has read. The tap is
// also the gesture iOS needs before it will play the ticks, and the one his
// finger feels (the haptic lives on it).
//
// Honest by construction: the reel passes the techniques still waiting, in
// curriculum order, and lands on the server's pick — the same one the brief
// speaks. The caption says it is next in line, so it never reads as a roll.
//
// Same glass, same pink, same view-transition name as the technique card it
// becomes (both idioms render that card from the same view model), so when
// the reel lands the card opens AROUND the name rather than cutting to it.
// Only on a new day, once per day per device.
export function TechniqueReveal({ t, variant = 'apple', mob = false }) {
  const apple = variant === 'apple';
  const panel = glowPanel('--nv-mg', apple ? { radius: '16px' } : {});
  const cta = (
    <span style={apple
      ? { font: `600 15px ${UI}`, letterSpacing: '-.005em', color: 'var(--nv-mg)' }
      : { font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', textTransform: 'uppercase', color: 'var(--nv-mg)' }}>
      Reveal today’s technique
    </span>
  );
  return (
    <section className={panel.className} style={{
      marginTop: '18px', padding: mob ? '15px 16px 14px' : '18px 20px 16px', ...panel.style,
      ...(t.vtName ? { viewTransitionName: t.vtName } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        {apple
          ? <div style={{ font: `600 11px ${UI}`, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--nv-mg)' }}>{t.modeLabel}</div>
          : <Eyebrow as="span">{t.modeLabel}</Eyebrow>}
        <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <Meta tone="faint">{t.streak > 0 ? `${t.streak}-day streak` : ''}</Meta>
          <TextAction tone="faint" compact onClick={t.openAll}>{t.position} of {t.total} ›</TextAction>
        </span>
      </div>
      <div style={{ marginTop: '10px' }}>
        <SpinReveal
          rows={t.reel.rows}
          spinning={t.reel.spinning}
          rowH={mob ? 46 : 50}
          accent="--nv-mg"
          face={`400 ${mob ? 19 : 21}px/1.2 ${S}`}
          onStart={t.reveal}
          onLanded={t.landed}
          chime="technique"
          label="Reveal today’s technique"
          landedLabel={`Today’s technique: ${t.name}`}
          ctaNode={cta}
        />
      </div>
      <div style={{ marginTop: '10px', font: `450 12px/1.45 ${UI}`, color: 'var(--nv-ink60)', textWrap: 'pretty' }}>{t.reel.caption}</div>
    </section>
  );
}
