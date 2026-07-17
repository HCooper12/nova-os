// Constants and tiny style builders shared across the per-domain view-model
// modules (src/vals/*) and App.jsx itself.

export const NOTE_TYPE_COLOR = { concept: '#d8b573', entity: '#e08f6f', topic: '#8a6ad1', source: '#6be5f5', journal: '#5aa87c', analysis: '#ece5da', raw: 'rgba(236,229,218,.5)' };

export const mono = "'JetBrains Mono',monospace";

export const chip = (act) => ({ cursor: 'pointer', font: "500 10.5px " + mono, letterSpacing: '.08em', padding: '7px 14px', borderRadius: '8px',
  border: act ? '1px solid rgba(216,181,115,.5)' : '1px solid rgba(236,229,218,.12)',
  color: act ? '#d8b573' : 'rgba(236,229,218,.55)', background: act ? 'rgba(216,181,115,.08)' : 'rgba(0,0,0,.2)' });

export const nchip = (act) => ({ cursor: 'pointer', font: "500 9px " + mono, letterSpacing: '.1em', padding: '5px 10px', borderRadius: '7px',
  border: act ? '1px solid rgba(216,181,115,.5)' : '1px solid rgba(236,229,218,.12)', color: act ? '#d8b573' : 'rgba(236,229,218,.5)' });

export const bubble = (who) => who === 'you'
  ? { wrapStyle: { display: 'flex', justifyContent: 'flex-end' }, bubbleStyle: { maxWidth: '85%', fontSize: '12.5px', lineHeight: 1.55, padding: '9px 13px', borderRadius: '11px 11px 3px 11px', background: 'rgba(216,181,115,.14)', border: '1px solid rgba(216,181,115,.25)', color: '#ece5da' } }
  : { wrapStyle: { display: 'flex' }, bubbleStyle: { maxWidth: '90%', fontSize: '12.5px', lineHeight: 1.55, padding: '9px 13px', borderRadius: '11px 11px 11px 3px', background: 'rgba(107,229,245,.07)', border: '1px solid rgba(107,229,245,.2)', color: 'rgba(236,229,218,.92)' } };
