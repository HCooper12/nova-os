import { useEffect, useState } from 'react';
import { elapsedLabel } from './jobClock.js';

// THE ONLY THING IN NOVA THAT TICKS, and it re-renders nothing but itself.
//
// App is one class component whose every setState recomputes all nine val
// builders and reconciles the whole visible tree (see the perf memory). A
// once-a-second clock driven from there would do that every second for as long
// as any job runs — on his phone, at 120Hz, while the shelf or the core is
// also drawing. So the tick lives here, in a leaf with its own interval and
// its own state, and the tray rows around it are untouched between ticks.
//
// It also stops when he is not looking. A backgrounded PWA gets its timers
// throttled anyway, but an interval that keeps firing behind a locked screen
// is battery spent on a number nobody can read — and coming back from
// background recomputes from the START TIME, not from a counter, so a throttled
// or suspended hour cannot make the elapsed time drift. That is what makes
// this accurate rather than merely animated.
export function Elapsed({ job, style }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!job?.startedAt || job.done || job.failed) return undefined;
    let timer = 0;
    const tick = () => setNow(Date.now());
    const start = () => { if (!timer) timer = setInterval(tick, 1000); };
    const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
    const onVisibility = () => {
      // recompute immediately on return, THEN resume ticking — otherwise the
      // first second back shows the value from before he locked the phone
      if (document.visibilityState === 'visible') { tick(); start(); } else stop();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [job?.startedAt, job?.done, job?.failed]);

  const label = elapsedLabel(job, now);
  if (!label) return null;
  return (
    <span style={{
      flex: 'none',
      font: 'var(--nv-micro-s)',
      letterSpacing: 'var(--nv-micro-track)',
      fontVariantNumeric: 'tabular-nums',   // the column must not jitter as it counts
      color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)',
      ...style,
    }}>{label}</span>
  );
}

export default Elapsed;
