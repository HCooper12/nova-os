import { useEffect, useRef } from 'react';
import { TextAction } from './Controls.jsx';
import { useExit } from './useExit.js';
import { useSheetDrag } from './useSheetDrag.js';

// THE DAY SHEET (mockup 104, 26 Oct 2026). Tap a day on Train and this rises
// in place of the platform's long select: tick each workout for it, each
// tick numbered in the order he picked, about five choices up front and the
// rest behind Show all, then one button that says what it will do
// ("Plan Saturday · 65 min"). Two or more are that date only; the model
// (src/vals/valsWorkouts.js dayPlanSheet) says which in the sub line.
// Both idioms draw it from the same model.
const onControl = (el) => !!(el && el.closest && el.closest('button, a, input, select'));

export function DayPlanSheet({ s }) {
  const exit = useExit(s.close);
  const drag = useSheetDrag(s.close, { threshold: 80 });
  const panelRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') exit.close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={`${s.title}: plan the day`} onClick={exit.close}
      style={{ position: 'fixed', inset: 0, zIndex: 112, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--nv-void) 60%, transparent)', animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)' }}>
      <div ref={(el) => { drag.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }}
        data-sheet="" className="nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-ts-sheet nv-dp" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '86vh' }}>
        <div {...drag.handleProps} onPointerDown={(e) => { if (!onControl(e.target)) drag.handleProps.onPointerDown(e); }}
          className="nv-ts-grab" style={{ ...drag.handleProps.style, gridTemplateColumns: 'minmax(0,1fr) auto' }}>
          <span className="nv-ts-handle" aria-hidden="true" />
          <span className="nv-ts-shead"><b>{s.title}</b></span>
          <TextAction tone="quiet" onClick={exit.close}>Cancel</TextAction>
        </div>
        <div className="nv-ts-sbody">
          <p className="nv-dp-sub">{s.sub}</p>
          <ul className="nv-dp-list" role="group" aria-label="Workouts for this day">
            {s.options.map((o) => (
              <li key={o.value || 'rest'}>
                <button type="button" className="nv-dp-opt" data-on={o.on ? 'true' : undefined} style={{ '--h': o.hue }} onClick={o.toggle} aria-pressed={o.on}>
                  <span className="nv-dp-dot" aria-hidden="true" />
                  <span className="nv-dp-lab">{o.label}</span>
                  <span className="nv-dp-meta">{o.meta || ""}</span>
                  <span className="nv-dp-tick" aria-hidden="true">{o.on ? (o.order || '✓') : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          {s.showAll && <button type="button" className="nv-dp-more" onClick={s.showAll.go}>{s.showAll.label}</button>}
          <button type="button" className="nv-ts-begin nv-dp-go" onClick={s.commit}>{s.commitLabel}</button>
        </div>
      </div>
    </div>
  );
}
