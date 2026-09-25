import { Interactive } from './Interactive.jsx';

// THE YES THAT BECOMES A TICK. The pressed pill becomes the answer: pill →
// circle while the change is made → the tick draws itself. See .nv-tick in
// index.css. The house object for committing a decision: the Coach deck's
// Yes, and (25 Sep) Wrap the day's "it landed".
export function TickButton({ state, onClick, label, ariaLabel }) {
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
