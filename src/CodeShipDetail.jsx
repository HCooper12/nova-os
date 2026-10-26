import { useEffect, useRef, useState } from 'react';
import { Tag, TextAction, Eyebrow } from './Controls.jsx';

// A CHANGE THE BUILDER MADE, AND ITS SHIP (27 Oct 2026). The card shows what
// the change touches, the four checks as chips, the Breaker's verdict, the
// diff behind a disclosure, and, once he taps Ship it, each step code takes
// as dots joined by one line (done, running, stopped, skipped), read from the
// record and polled while it ships. Both Inbox idioms render this one piece.

const M = 'var(--nv-font-mono)';
const R = 'var(--nv-font-ui)';
const STEP = {
  verify: 'Check the change is what you approved', commit: 'Commit it', rebase: 'Catch up with main',
  gates: 'Run the checks again', push: 'Push to main', deploy: 'Wait for the deploy', live: 'See it live',
  reload: 'Reload the server', revert: 'Revert the commit',
};
const GATES = [['lint', 'Lint'], ['build', 'Build'], ['serverTests', 'Server tests'], ['guard', 'Phone guard']];
const DOT = { done: 'var(--nv-good)', running: 'var(--nv-cy)', stopped: 'var(--nv-warn)', skipped: 'var(--nv-ink40)' };

const STYLE = `
.nv-ship-dot{width:10px;height:10px;border-radius:50%;flex:none;margin-top:3px;box-sizing:border-box}
.nv-ship-dot.running{animation:nv-ship-pulse 1.4s ease-in-out infinite}
@keyframes nv-ship-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.nv-ship-dot.running{animation:none}}
`;

function Steps({ title, steps }) {
  if (!steps?.length) return null;
  return (
    <div style={{ marginTop: '10px' }}>
      <Eyebrow>{title}</Eyebrow>
      <ol style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
        {steps.map((s, i) => (
          <li key={s.step} style={{ display: 'flex', gap: '10px', position: 'relative', paddingBottom: i < steps.length - 1 ? '10px' : 0 }}>
            {i < steps.length - 1 && <span aria-hidden="true" style={{ position: 'absolute', left: '4.5px', top: '14px', bottom: 0, width: '1px', background: 'color-mix(in srgb, var(--nv-ink) 18%, transparent)' }} />}
            <span className={`nv-ship-dot ${s.state}`} aria-hidden="true"
              style={{ background: s.state === 'skipped' ? 'transparent' : DOT[s.state] || 'var(--nv-ink40)', border: s.state === 'skipped' ? '1.5px solid var(--nv-ink40)' : 'none' }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', font: `600 13px/1.4 ${R}`, color: s.state === 'stopped' ? 'var(--nv-warn)' : 'var(--nv-ink)' }}>
                {STEP[s.step] || s.step}{s.state === 'running' ? ' …' : s.state === 'skipped' ? ' (skipped)' : ''}
              </span>
              {s.detail && s.detail !== 'running' && <span style={{ display: 'block', font: `500 12px/1.45 ${R}`, color: 'var(--nv-ink60)', overflowWrap: 'anywhere' }}>{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CodeShipDetail({ ship }) {
  const [diffOpen, setDiffOpen] = useState(false);
  const live = ship?.shipping || (ship?.undoSteps || []).some((s) => s.state === 'running');
  // the view model hands a fresh function each render; the poll reads the
  // latest through a ref so a re-render never restarts the clock
  const refresh = useRef(null);
  refresh.current = ship?.refresh || null;
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => refresh.current?.(), 4000);
    return () => clearInterval(t);
  }, [live]);
  if (!ship) return null;
  return (
    <div style={{ marginTop: '10px' }}>
      <style>{STYLE}</style>
      {ship.files.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {ship.files.map((f) => (
            <li key={f.path} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', font: `500 12.5px/1.4 ${M}`, minWidth: 0 }}>
              <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
              <span style={{ color: 'var(--nv-good)', flex: 'none' }}>+{f.added}</span>
              <span style={{ color: 'var(--nv-warn)', flex: 'none' }}>-{f.removed}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
        {GATES.map(([k, label]) => {
          const g = ship.gates?.[k];
          if (!g) return <Tag key={k} dashed title="not run in this workspace">{label}: not run</Tag>;
          const count = g.total != null ? ` ${g.pass}/${g.total}` : '';
          return <Tag key={k} tone={g.ok ? 'good' : 'warn'}>{label}{count} {g.ok ? 'pass' : 'fail'}</Tag>;
        })}
      </div>
      {ship.breaker && <div style={{ marginTop: '7px', font: `500 12.5px/1.5 ${R}`, color: 'var(--nv-ink60)' }}>{ship.breaker}</div>}
      {ship.diff && (
        <div style={{ marginTop: '6px' }}>
          <TextAction compact tone="cyan" onClick={(e) => { e?.stopPropagation?.(); setDiffOpen((o) => !o); }}>{diffOpen ? '▾ Hide the diff' : '▸ See the diff'}</TextAction>
          {diffOpen && (
            <pre style={{ margin: '6px 0 0', maxHeight: '320px', overflow: 'auto', padding: '10px', borderRadius: 'var(--nv-radius)', background: 'color-mix(in srgb, var(--nv-ink) 6%, transparent)', font: `500 11.5px/1.45 ${M}`, whiteSpace: 'pre', maxWidth: '100%' }}>
              {ship.diff.split('\n').map((l, i) => (
                <div key={i} style={{ color: l.startsWith('+') && !l.startsWith('+++') ? 'var(--nv-good)' : l.startsWith('-') && !l.startsWith('---') ? 'var(--nv-warn)' : 'var(--nv-ink60)' }}>{l || ' '}</div>
              ))}
            </pre>
          )}
        </div>
      )}
      <Steps title="Shipping" steps={ship.steps} />
      <Steps title="Undo" steps={ship.undoSteps} />
    </div>
  );
}
