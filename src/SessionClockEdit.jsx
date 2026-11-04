import { useState } from 'react';

// The session's minutes, which he can correct (4 Nov 2026: the phone died
// mid-workout and the clock counted the time it was off). Tap the minutes,
// type the real number, Enter or tap away. Escape leaves it as it was.
export default function SessionClockEdit({ minutes, onSet, prefix = '', suffix = ' min', className, style }) {
  const [draft, setDraft] = useState(null);
  if (minutes == null) return null;
  if (draft == null || !onSet) {
    return onSet
      ? <button type="button" className={`nv-clock-edit${className ? ` ${className}` : ''}`} style={style} onClick={() => setDraft(String(minutes))}
          aria-label={`${minutes} minutes. Tap to correct the workout time`}>{prefix}{minutes}{suffix}</button>
      : <span className={className} style={style}>{prefix}{minutes}{suffix}</span>;
  }
  const commit = () => { const n = Number(draft); if (draft.trim() !== '' && Number.isFinite(n) && n >= 0) onSet(n); setDraft(null); };
  return (
    <span className={`nv-clock-edit on${className ? ` ${className}` : ''}`} style={style}>
      {prefix}<input type="number" inputMode="numeric" min="0" autoFocus value={draft} aria-label="Workout minutes"
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setDraft(null); }} />{suffix}
    </span>
  );
}
