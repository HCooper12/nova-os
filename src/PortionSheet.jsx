import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { useSheetDrag } from './useSheetDrag.js';
import { Eyebrow } from './Controls.jsx';

// LOG ANY MEAL — one sheet, callable from anywhere.
//
// His ask, twice over: a saved VARIANT should be loggable without promoting
// it to primary, and a meal should be loggable from the recipe itself rather
// than a separate picker higher up the Fuel screen. Rather than wire a
// bespoke button per surface, every surface hands the same {name, macros}
// to this sheet — so the fractions, the custom multiplier, the live preview
// and the "which day am I logging to" targeting all behave identically
// wherever he starts from.
const M = 'var(--nv-font-mono)';

export function PortionSheet({ p }) {
  // drag the handle down to dismiss — the same gesture as the exercise sheet
  const drag = useSheetDrag(p.cancel);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Log ${p.name}`} onClick={p.cancel}
      style={css('position:fixed;inset:0;z-index:130;display:flex;align-items:flex-end;justify-content:center;background:rgba(8,5,12,.7);backdrop-filter:blur(6px)')}>
      <div ref={drag.sheetRef} onClick={(e) => e.stopPropagation()}
        style={css('width:520px;max-width:100vw;border:1px solid color-mix(in srgb, var(--nv-good) 30%, transparent);border-radius:18px 18px 0 0;background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 -20px 60px -20px rgba(0,0,0,.9);padding:8px 20px calc(20px + env(safe-area-inset-bottom));animation:sheetUp .32s cubic-bezier(.32,.72,0,1)')}>
        <div {...drag.handleProps} style={{ ...drag.handleProps.style, display: 'flex', justifyContent: 'center', padding: '6px 0 12px' }}>
          <span aria-hidden="true" style={css('width:36px;height:5px;border-radius:3px;background:color-mix(in srgb, var(--nv-ink) 22%, transparent)')} />
        </div>
        <Eyebrow tone="good">Log it · how much?</Eyebrow>
        <div style={css('margin-top:9px;font-size:15px;line-height:1.35')}>{p.name}</div>
        <div style={{ marginTop: '4px', font: 'var(--nv-micro-l)', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>
          full serving: {p.base.p}P · {p.base.c}C · {p.base.f}F · {p.base.kcal} kcal
        </div>
        {p.dayLabel && (
          <div style={{ marginTop: '6px', font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', color: 'var(--nv-gold)' }}>{p.dayLabel}</div>
        )}

        <div style={css('margin-top:14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center')}>
          {p.portions.map((pn) => (
            <Interactive key={pn.label} as="span" onClick={pn.pick}
              base={{ cursor: 'pointer', minWidth: '46px', textAlign: 'center', font: '600 14px var(--nv-font-ui)', padding: '10px 12px', borderRadius: '10px',
                border: pn.active ? '1px solid var(--nv-good)' : '1px solid color-mix(in srgb, var(--nv-ink) 13%, transparent)',
                color: pn.active ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 60%, transparent)',
                background: pn.active ? 'color-mix(in srgb, var(--nv-good) 12%, transparent)' : 'none' }}
              hoverStyle={{ background: 'rgba(255,255,255,.06)' }}>{pn.label}</Interactive>
          ))}
          <Interactive as="input" value={p.custom} onChange={p.setCustom} placeholder="or 0.4…" inputMode="decimal"
            base={`width:92px;min-width:0;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:10px;padding:10px 11px;color:var(--nv-ink);font-size:12.5px;font-family:${M};outline:none`}
            focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
        </div>

        <div style={css('margin-top:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap')}>
          <div style={css('flex:1;min-width:170px')}>
            <div style={css('font-size:13px')}>{p.loggedName || p.name}</div>
            <div style={{ marginTop: '3px', font: 'var(--nv-micro-l)', color: p.valid ? 'var(--nv-good)' : '#e08f6f' }}>{p.preview}</div>
          </div>
          <Interactive as="span" onClick={p.cancel}
            base={`cursor:pointer;font:var(--nv-micro-m);padding:11px 15px;border-radius:10px;border:1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)`}
            hoverStyle="background:rgba(255,255,255,.05)">CANCEL</Interactive>
          <Interactive as="span" onClick={p.valid ? p.confirm : undefined}
            base={{ cursor: p.valid ? 'pointer' : 'default', font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', padding: '11px 20px', borderRadius: '10px', background: 'var(--nv-good)', color: '#122015', opacity: p.valid ? 1 : 0.45 }}
            hoverStyle={p.valid ? { background: 'color-mix(in srgb, var(--nv-good) 82%, white)' } : undefined}>LOG IT</Interactive>
        </div>
      </div>
    </div>
  );
}
