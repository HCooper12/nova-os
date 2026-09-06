// Constants and tiny style builders shared across the per-domain view-model
// modules (src/vals/*) and App.jsx itself.

// Literal hex (not tokens) on purpose: these feed canvas fillStyle in the
// Memory Galaxy, and canvas cannot resolve CSS custom properties.
export const NOTE_TYPE_COLOR = { concept: '#d8b573', entity: '#e08f6f', topic: '#8a6ad1', source: '#6be5f5', journal: '#5aa87c', analysis: '#ece5da', raw: 'rgba(236,229,218,.5)' };

export const mono = "var(--nv-font-mono)";

// The agent roster (still a concept feature): `on` marks the three whose
// domains are genuinely wired to real data today — Commander (calendar +
// focus), Coach (training + health), Guardian (server backups). The count
// shown in the UI is derived from these flags, never hardcoded.
export const AGENTS = [
  { name: 'Commander', role: 'PLANNING', on: true },
  { name: 'Coach', role: 'FITNESS', on: true },
  { name: 'CFO', role: 'MONEY', on: true },
  { name: 'Studio', role: 'CONTENT', on: true },
  { name: 'Researcher', role: 'WEB', on: true },
  { name: 'Watcher', role: 'VIDEO', on: true },
  { name: 'Guardian', role: 'BACKUPS', on: true },
];

export const bubble = (who) => who === 'you'
  ? { wrapStyle: { display: 'flex', justifyContent: 'flex-end' }, bubbleStyle: { maxWidth: '85%', minWidth: 0, overflowWrap: 'anywhere', fontSize: '13px', fontWeight: 500, lineHeight: 1.55, padding: '9px 13px', borderRadius: '11px 11px 3px 11px', background: 'var(--nv-acc-bg)', border: '1px solid var(--nv-acc-border)', color: 'var(--nv-ink)' } }
  : { wrapStyle: { display: 'flex' }, bubbleStyle: { maxWidth: '90%', minWidth: 0, overflowWrap: 'anywhere', fontSize: '13px', fontWeight: 500, lineHeight: 1.55, padding: '9px 13px', borderRadius: '11px 11px 11px 3px', background: 'color-mix(in srgb, var(--nv-cy) 07%, transparent)', border: '1px solid color-mix(in srgb, var(--nv-cy) 20%, transparent)', color: 'color-mix(in srgb, var(--nv-ink) 92%, transparent)' } };
