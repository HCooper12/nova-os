import { useRef, useState } from 'react';

// EDIT MODE ON A ROUTINE (mockup 104, 26 Oct 2026, his ask "edit any workout
// myself"). The title is an input, saved on Done; each lift has a handle to
// drag it into place (pointer events, so it works under a thumb on iOS), the
// arrows beside it as the fallback, −/+ for sets and for the rep range, swap,
// a note of his own, and remove. Every change is one write with Undo
// (App.editRoutine). The model is src/vals/valsWorkouts.js routineEdit; both
// idioms draw this one component.
//
// Motion: the picked-up row lifts (scale and shadow on a spring) and the rows
// it passes slide aside by one row; all of it is off under reduced motion
// (index.css .nv-re-*).

export function RoutineTitleEdit({ m }) {
  return (
    <div className="nv-re-title">
      <input value={m.name} onChange={m.setName} placeholder="Routine name" aria-label="Routine name" enterKeyHint="done"
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      {m.was && <small>{m.was}</small>}
    </div>
  );
}

export function RoutineEditor({ m, picker = null }) {
  const listRef = useRef(null);
  const [drag, setDrag] = useState(null); // { id, from, over, dy, h }
  const g = useRef(null);

  const down = (e, r) => {
    if (e.button != null && e.button !== 0) return;
    const li = e.currentTarget.closest('li');
    const rows = [...(listRef.current?.querySelectorAll(':scope > li') || [])];
    const rects = rows.map((x) => x.getBoundingClientRect());
    g.current = { id: r.id, from: r.index, y0: e.clientY, rects, h: li.getBoundingClientRect().height };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: r.id, from: r.index, over: r.index, dy: 0, h: g.current.h });
  };
  const move = (e) => {
    const s = g.current;
    if (!s) return;
    const dy = e.clientY - s.y0;
    const mid = s.rects[s.from].top + s.rects[s.from].height / 2 + dy;
    let over = s.rects.findIndex((rc) => mid < rc.top + rc.height / 2);
    if (over < 0) over = s.rects.length - 1;
    setDrag((d) => (d ? { ...d, dy, over } : d));
  };
  const up = () => {
    const s = g.current;
    g.current = null;
    const d = drag;
    setDrag(null);
    if (d && s && d.over !== d.from) m.rows.find((x) => x.id === d.id)?.moveTo(d.over);
  };
  const shift = (i) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -drag.h;
    if (drag.from > drag.over && i < drag.from && i >= drag.over) return drag.h;
    return 0;
  };

  return (
    <div className="nv-re">
      {m.rows.length === 0 ? <p className="nv-re-empty">No lifts yet. Add the first one below.</p> : (
        <ul ref={listRef} className="nv-re-list" aria-label="Lifts, in order. Drag a handle to move one">
          {m.rows.map((r) => {
            const lifted = drag?.id === r.id;
            return (
              <li key={r.id} className={`nv-re-row${lifted ? ' lifted' : ''}`} style={{ '--h': r.hue, transform: lifted ? `translateY(${drag.dy}px) scale(1.02)` : `translateY(${shift(r.index)}px)` }}>
                <div className="nv-re-main">
                  <button type="button" className="nv-re-handle" aria-label={`Drag ${r.name} to move it`}
                    onPointerDown={(e) => down(e, r)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                    <svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" /><circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="3" cy="15" r="1.5" /><circle cx="9" cy="15" r="1.5" /></svg>
                  </button>
                  <span className="nv-re-nm">
                    <b>{r.name}</b>
                    <span className={r.hasNote ? 'note' : undefined}>{lifted ? 'moving…' : r.tag}</span>
                  </span>
                  <span className="nv-re-arrows">
                    <button type="button" onClick={r.up || undefined} disabled={!r.up} aria-label={`Move ${r.name} up`}>↑</button>
                    <button type="button" onClick={r.down || undefined} disabled={!r.down} aria-label={`Move ${r.name} down`}>↓</button>
                  </span>
                  <button type="button" className="nv-re-x" onClick={r.remove} aria-label={`Remove ${r.name}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>
                  </button>
                </div>
                <div className="nv-re-sub">
                  <span className="nv-re-step" role="group" aria-label={`${r.name}: sets`}>
                    <button type="button" onClick={r.setsLess || undefined} disabled={!r.setsLess} aria-label="One fewer set">−</button>
                    <b aria-live="polite">{r.sets}</b><small>sets</small>
                    <button type="button" onClick={r.setsMore || undefined} disabled={!r.setsMore} aria-label="One more set">+</button>
                  </span>
                  <span className="nv-re-step" role="group" aria-label={`${r.name}: ${r.unit}`}>
                    <button type="button" onClick={r.repsLess || undefined} disabled={!r.repsLess} aria-label={`${r.unit} range down one`}>−</button>
                    <b aria-live="polite">{r.reps}</b><small>{r.unit}</small>
                    <button type="button" onClick={r.repsMore} aria-label={`${r.unit} range up one`}>+</button>
                  </span>
                  <button type="button" className="nv-re-chip" onClick={r.swap}>⇄ Swap</button>
                  <button type="button" className="nv-re-chip" onClick={r.openNote} aria-expanded={r.noteOpen}>{r.hasNote ? 'Note' : '+ Note'}</button>
                </div>
                {r.noteOpen && (
                  <input className="nv-re-note" defaultValue={r.note} autoFocus maxLength={120} placeholder="A line for this lift, e.g. drop sets, behind the back"
                    aria-label={`Note for ${r.name}`} enterKeyHint="done"
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    onBlur={(e) => r.saveNote(e.target.value)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {picker}
      <div className="nv-re-tools">
        <button type="button" className="nv-re-chip" onClick={m.add}>＋ Add exercise</button>
        <button type="button" className="nv-re-chip" onClick={m.duplicate}>Duplicate routine</button>
      </div>
      <button type="button" className="nv-re-new" onClick={m.create}>＋ New routine</button>
    </div>
  );
}
