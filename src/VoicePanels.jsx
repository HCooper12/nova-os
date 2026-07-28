import { css } from './css.js';

const M = "var(--nv-font-mono)";

// The Companion canvas — panels Nova puts on screen mid-conversation.
// Every number here came from the server's deterministic builders
// (server/lib/panels.js); this file only draws. Missing data renders
// as missing.

const dim = (pct) => `color-mix(in srgb, var(--nv-ink) ${pct}%, transparent)`;

function Card({ label, children }) {
  return (
    <div style={css(`margin-top:10px;border:1px solid ${dim(10)};border-radius:12px;padding:12px 14px;background:${dim(3)};animation:fadeUp .4s ease-out`)}>
      <div style={css(`font:500 9px ${M};letter-spacing:.24em;color:${dim(45)};margin-bottom:9px`)}>{label}</div>
      {children}
    </div>
  );
}

function TrainingWeek({ d }) {
  return (
    <Card label="TRAINING WEEK · LIVE FROM YOUR LOG">
      {d.days.map((day) => (
        <div key={day.date} style={css(`display:flex;align-items:baseline;gap:10px;padding:4px 0;font:400 11.5px ${M};${day.isToday ? 'color:var(--nv-cy)' : `color:${dim(80)}`}`)}>
          <span style={css(`width:34px;flex:none;font-size:9.5px;letter-spacing:.14em;color:${day.isToday ? 'var(--nv-cy)' : dim(45)}`)}>{day.weekday}</span>
          <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{day.planned}</span>
          {day.done.length > 0
            ? <span style={css("flex:none;color:var(--nv-good)")}>✓ {day.done.map((s) => `${s.name} · ${s.sets} sets`).join(' + ')}</span>
            : <span style={css(`flex:none;color:${dim(30)}`)}>—</span>}
        </div>
      ))}
      {d.carryovers.length > 0 && (
        <div style={css(`margin-top:7px;padding-top:7px;border-top:1px solid ${dim(8)};font:400 10.5px ${M};color:var(--nv-gold)`)}>
          {d.carryovers.map((c) => `+ ${c.count} carried from ${c.from} · due ${c.due}`).join(' · ')}
        </div>
      )}
    </Card>
  );
}

function Exercise({ d }) {
  return (
    <Card label={`${d.name.toUpperCase()} · ${d.muscleGroup?.toUpperCase() || ''}`}>
      {d.e1rm && (
        <div style={css(`display:flex;align-items:baseline;gap:10px;margin-bottom:8px`)}>
          <span style={css(`font:600 22px ${M};color:var(--nv-cy)`)}>{d.e1rm.value}<span style={css(`font-size:11px;color:${dim(45)}`)}> kg e1RM</span></span>
          {d.e1rm.delta != null && (
            <span style={css(`font:500 11px ${M};color:${d.e1rm.delta >= 0 ? 'var(--nv-good)' : 'var(--nv-warn)'}`)}>{d.e1rm.delta >= 0 ? '▲' : '▼'} {Math.abs(d.e1rm.delta)}kg vs prior block</span>
          )}
        </div>
      )}
      {d.recent.length === 0 && <div style={css(`font:400 11px ${M};color:${dim(40)}`)}>No logged sessions yet for this one.</div>}
      {d.recent.map((r) => (
        <div key={r.date + r.sets} style={css(`display:flex;gap:10px;padding:3px 0;font:400 11px ${M};color:${dim(78)}`)}>
          <span style={css(`flex:none;color:${dim(45)}`)}>{r.date.slice(5)}</span>
          <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{r.sets}</span>
        </div>
      ))}
      {d.inRoutines.length > 0 && (
        <div style={css(`margin-top:7px;font:400 10px ${M};letter-spacing:.06em;color:${dim(40)}`)}>IN: {d.inRoutines.join(' · ')}</div>
      )}
    </Card>
  );
}

function NutritionWeek({ d }) {
  const max = Math.max(d.floor || 0, ...d.days.map((x) => x.p || 0), 1);
  return (
    <Card label="PROTEIN · LAST 7 DAYS">
      {d.days.length === 0 && <div style={css(`font:400 11px ${M};color:${dim(40)}`)}>No tracked days yet.</div>}
      <div style={css("display:flex;align-items:flex-end;gap:6px;height:64px;position:relative")}>
        {d.floor != null && (
          <div style={css(`position:absolute;left:0;right:0;bottom:${(d.floor / max) * 76}%;border-top:1px dashed ${dim(28)}`)} />
        )}
        {d.days.map((day) => (
          <div key={day.date} style={css("flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end")}>
            <span style={css(`font:500 9px ${M};color:${day.floorMet ? 'var(--nv-good)' : dim(55)}`)}>{day.p ?? '·'}</span>
            <div style={css(`width:100%;max-width:26px;border-radius:4px 4px 0 0;height:${day.p ? Math.max(6, (day.p / max) * 76) : 3}%;background:${day.p == null ? dim(12) : day.floorMet ? 'color-mix(in srgb, var(--nv-good) 55%, transparent)' : dim(25)}`)} />
          </div>
        ))}
      </div>
      <div style={css("display:flex;gap:6px;margin-top:4px")}>
        {d.days.map((day) => (
          <span key={day.date} style={css(`flex:1;text-align:center;font:400 8.5px ${M};color:${dim(38)}`)}>{day.date.slice(8)}</span>
        ))}
      </div>
      <div style={css(`margin-top:8px;font:400 10.5px ${M};color:${dim(55)}`)}>
        {d.floor != null ? `Floor ${d.floor}g — met ${d.metCount} of ${d.days.length}` : 'No protein floor set'}
        {d.avgP != null && ` · avg ${d.avgP}g`}
      </div>
    </Card>
  );
}

export function VoicePanel({ panel }) {
  if (!panel || !panel.data) return null;
  if (panel.type === 'training-week') return <TrainingWeek d={panel.data} />;
  if (panel.type === 'exercise') return <Exercise d={panel.data} />;
  if (panel.type === 'nutrition-week') return <NutritionWeek d={panel.data} />;
  return null;
}
