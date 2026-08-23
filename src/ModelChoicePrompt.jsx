import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

// THE MODEL CHOICE GATE — his ask: before Researcher, the Watcher, Pattern
// Scout or Distill run on their default model, offer Opus for THIS run.
// A hard gate, not a nudge: the job genuinely waits here until answered
// (a tap, or — on the Voice screen — the next spoken turn), so this stays on
// screen rather than auto-dismissing like NudgeCard's suggestions do.
export function ModelChoicePrompt({ v }) {
  return (
    <div style={css("position:fixed;top:calc(54px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:67;width:min(460px, calc(100vw - 24px));animation:fadeUp .3s ease-out")}>
      <div className="nv-pane" style={{ padding: '14px 16px', borderColor: 'color-mix(in srgb, var(--nv-gold) 40%, transparent)' }}>
        <div style={css("display:flex;align-items:flex-start;gap:10px")}>
          <span style={{ flex: 'none', fontSize: '15px', color: 'var(--nv-gold)' }}>◈</span>
          <span style={{ minWidth: 0, flex: 1, font: '500 13px/1.5 var(--nv-font-ui)', color: 'var(--nv-ink)' }}>{v.question}</span>
          <Interactive as="span" onClick={v.cancel} aria-label="Cancel — don't run this"
            base={css("cursor:pointer;flex:none;font-size:15px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent);padding:2px 4px")}
            hoverStyle={{ color: 'var(--nv-ink)' }}>×</Interactive>
        </div>
        <div style={css("margin-top:11px;display:flex;gap:8px")}>
          <Interactive as="span" onClick={v.pickOpus}
            base={{ cursor: 'pointer', flex: 1, textAlign: 'center', font: '600 12px var(--nv-font-ui)', padding: '9px 12px', borderRadius: '9px', background: 'var(--nv-gold)', color: '#1a1322' }}
            hoverStyle={{ filter: 'brightness(1.08)' }}>Opus — deeper</Interactive>
          <Interactive as="span" onClick={v.pickSonnet}
            base={{ cursor: 'pointer', flex: 1, textAlign: 'center', font: '600 12px var(--nv-font-ui)', padding: '9px 12px', borderRadius: '9px', border: '1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent)', color: 'var(--nv-ink)' }}
            hoverStyle={{ background: 'rgba(255,255,255,.05)' }}>Sonnet — default</Interactive>
        </div>
      </div>
    </div>
  );
}
