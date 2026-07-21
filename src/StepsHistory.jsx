import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

// Pedometer++-style 7-day step history with per-day manual edit. Gaps (nights
// the phone automation missed) render as dashed, editable bars so nothing is
// silently missing and Hayden can correct any day by hand.
export function StepsHistory({ v }) {
  const maxVal = Math.max(v.goal, ...v.days.map((d) => d.steps || 0), 1);
  const goalPct = (v.goal / maxVal) * 100;
  const barColor = (d) => (d.editing ? 'var(--nv-cy)' : d.over ? 'var(--nv-good)' : 'var(--nv-gold)');

  return (
    <div role="dialog" aria-modal="true" aria-label="Step history" onClick={v.close} style={css("position:fixed;inset:0;background:rgba(8,5,12,.82);backdrop-filter:blur(6px);z-index:80;display:flex;align-items:center;justify-content:center;padding:18px;overflow-y:auto")}>
      <div onClick={(e) => e.stopPropagation()} style={css("width:560px;max-width:96vw;max-height:92vh;overflow-y:auto;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.95);padding:22px 24px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center")}>
          <span style={css("font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:var(--nv-mg)")}>STEPS · LAST 7 DAYS</span>
          <Interactive as="span" onClick={v.close} base="cursor:pointer;font:500 11px 'IBM Plex Mono',monospace;color:var(--nv-ink60);border:1px solid var(--nv-edge);border-radius:7px;padding:5px 10px" hoverStyle="color:var(--nv-ink)">ESC</Interactive>
        </div>

        <div style={css("margin-top:14px;text-align:center")}>
          <div style={{ font: "700 46px 'Rajdhani',sans-serif", lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: v.current >= v.goal ? 'var(--nv-good)' : 'var(--nv-gold)' }}>{v.current.toLocaleString()}</div>
          <div style={css("margin-top:4px;font:500 11.5px 'IBM Plex Mono',monospace;color:var(--nv-ink60)")}>
            {v.currentIsStale ? 'most recent day' : 'today'} · {Math.round((v.current / v.goal) * 100)}% of {v.goal.toLocaleString()} goal
          </div>
        </div>

        <div style={{ marginTop: '18px', position: 'relative', display: 'flex', alignItems: 'flex-end', gap: '6px', height: '176px', borderBottom: '1px solid var(--nv-edge)' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${goalPct}%`, borderTop: '1px dashed color-mix(in srgb, var(--nv-good) 42%, transparent)', pointerEvents: 'none' }} />
          {v.days.map((d) => (
            <Interactive key={d.date} onClick={d.startEdit} base={{ cursor: 'pointer', flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }} hoverStyle={{ opacity: 0.85 }}>
              <span style={{ font: "600 9px 'IBM Plex Mono',monospace", fontVariantNumeric: 'tabular-nums', color: d.hasData ? barColor(d) : 'var(--nv-ink40)' }}>{d.hasData ? d.steps.toLocaleString() : '—'}</span>
              <div style={{
                width: '100%', maxWidth: '40px',
                height: d.hasData ? `${Math.max(2, (d.steps / maxVal) * 100)}%` : '4px',
                minHeight: '4px', borderRadius: '6px 6px 0 0',
                background: d.hasData ? barColor(d) : 'repeating-linear-gradient(45deg,transparent,transparent 3px,color-mix(in srgb,var(--nv-ink) 12%,transparent) 3px,color-mix(in srgb,var(--nv-ink) 12%,transparent) 6px)',
                border: d.isToday ? '1px solid var(--nv-cy)' : d.hasData ? 'none' : '1px dashed color-mix(in srgb,var(--nv-ink) 22%,transparent)',
                boxSizing: 'border-box',
              }} />
            </Interactive>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          {v.days.map((d) => (
            <span key={d.date} style={{ flex: 1, minWidth: 0, textAlign: 'center', font: "500 10px 'IBM Plex Mono',monospace", color: d.isToday ? 'var(--nv-cy)' : 'var(--nv-ink40)' }}>{d.label}</span>
          ))}
        </div>

        <div style={css("margin-top:14px;text-align:center;font:500 11px 'IBM Plex Mono',monospace;color:var(--nv-ink60)")}>
          {v.total.toLocaleString()} steps · {v.totalKm} km this week
        </div>

        {v.editDate && (
          <div style={css("margin-top:16px;border-top:1px solid var(--nv-edge);padding-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap")}>
            <span style={css("font:600 12.5px 'Rajdhani',sans-serif;color:var(--nv-ink);min-width:96px")}>{v.editLabel}</span>
            <input value={v.editValue} onChange={v.setEditValue} onKeyDown={(e) => { if (e.key === 'Enter') v.saveEdit(); }} inputMode="numeric" placeholder="steps" autoFocus
              style={{ width: '120px', background: 'rgba(0,0,0,.3)', border: '1px solid var(--nv-edge)', borderRadius: '8px', padding: '9px 12px', color: 'var(--nv-ink)', font: "500 13px 'IBM Plex Mono',monospace", outline: 'none' }} />
            <Interactive as="span" onClick={v.saveEdit} base="cursor:pointer;font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.06em;padding:9px 15px;border-radius:8px;background:var(--nv-cy);color:#0a2830" hoverStyle="filter:brightness(1.08)">SAVE</Interactive>
            <Interactive as="span" onClick={v.cancelEdit} base="cursor:pointer;font:400 10px 'IBM Plex Mono',monospace;color:var(--nv-ink40)" hoverStyle="color:var(--nv-ink)">cancel</Interactive>
          </div>
        )}
        <div style={css("margin-top:14px;font-size:11px;line-height:1.55;color:var(--nv-ink40)")}>Tap any day to correct it — handy when the phone automation misses a night. These numbers feed everything Nova reasons about your activity.</div>
      </div>
    </div>
  );
}
