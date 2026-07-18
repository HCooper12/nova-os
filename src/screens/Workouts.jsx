import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

const numInputStyle = { width: '38px', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '5px', padding: '4px 2px', color: 'var(--nv-ink)', fontSize: '11.5px', fontFamily: "'IBM Plex Mono',monospace", textAlign: 'center', outline: 'none' };
const setInputStyle = { width: '64px', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '6px', padding: '6px 8px', color: 'var(--nv-ink)', fontSize: '12.5px', fontFamily: "'IBM Plex Mono',monospace", outline: 'none', boxSizing: 'border-box' };

function ExercisePicker({ v }) {
  return (
    <div style={css("margin-top:14px;border:1px solid color-mix(in srgb, var(--nv-cy) 18%, transparent);border-radius:12px;padding:16px 18px;background:color-mix(in srgb, var(--nv-cy) 03%, transparent)")}>
      <div style={css("display:flex;justify-content:space-between;align-items:center")}>
        <span style={css("font:italic 400 15px 'Instrument Serif',serif;color:var(--nv-cy)")}>Add an exercise</span>
        <Interactive as="span" onClick={v.closeExercisePicker} base="cursor:pointer;font-size:16px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-ink)">×</Interactive>
      </div>
      <Interactive
        as="input"
        autoFocus
        value={v.exercisePickerQuery}
        onChange={v.setExercisePickerQuery}
        placeholder="Search exercises…"
        base="margin-top:12px;width:100%;box-sizing:border-box;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 13px;color:var(--nv-ink);font-size:12.5px;font-family:'Rajdhani',sans-serif;outline:none"
        focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)"
      />
      <div style={css("margin-top:10px;display:flex;gap:6px;flex-wrap:wrap")}>
        {v.exercisePickerMuscleGroups.map((m) => (
          <Interactive
            key={m}
            as="span"
            onClick={() => v.setExercisePickerMuscle(m)}
            base={{
              cursor: 'pointer', font: "500 9.5px 'IBM Plex Mono',monospace", padding: '5px 10px', borderRadius: '6px',
              border: m === v.exercisePickerMuscle ? '1px solid color-mix(in srgb, var(--nv-cy) 50%, transparent)' : '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)',
              color: m === v.exercisePickerMuscle ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 50%, transparent)',
              background: m === v.exercisePickerMuscle ? 'color-mix(in srgb, var(--nv-cy) 08%, transparent)' : 'transparent',
            }}
            hoverStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)"
          >{m}</Interactive>
        ))}
      </div>
      <div style={css("margin-top:12px;max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px")}>
        {v.exercisePickerResults.map((r) => (
          <Interactive key={r.id} as="div" onClick={r.onAdd} base="cursor:pointer;display:flex;justify-content:space-between;padding:8px 6px;border-radius:6px" hoverStyle="background:rgba(255,255,255,.04)">
            <span style={css("font-size:12.5px")}>{r.name}</span>
            <span style={css("font:400 9.5px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>{r.muscleGroup}</span>
          </Interactive>
        ))}
        {v.exercisePickerResults.length === 0 && !v.exercisePickerShowCreate && (
          <div style={css("padding:10px 6px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>No matches.</div>
        )}
      </div>
      {v.exercisePickerShowCreate && (
        <div style={css("margin-top:10px;padding-top:10px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
          <span style={css("font-size:11.5px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>Not listed — add "{v.exercisePickerQuery.trim()}" as</span>
          <select
            value={v.exercisePickerCreateMuscle}
            onChange={(e) => v.setExercisePickerCreateMuscle(e.target.value)}
            style={{ background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '6px', color: 'var(--nv-ink)', fontSize: '11px', padding: '4px 6px', outline: 'none' }}
          >
            <option value="">choose muscle group…</option>
            {v.exercisePickerMuscleGroups.filter((m) => m !== 'Any').map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={v.exercisePickerCreateTrackingType}
            onChange={(e) => v.setExercisePickerCreateTrackingType(e.target.value)}
            style={{ background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '6px', color: 'var(--nv-ink)', fontSize: '11px', padding: '4px 6px', outline: 'none' }}
          >
            {v.exercisePickerTrackingTypeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Interactive
            as="span"
            onClick={v.exercisePickerCreateMuscle ? v.createExercise : undefined}
            base={{ cursor: v.exercisePickerCreateMuscle ? 'pointer' : 'default', font: "500 10px 'IBM Plex Mono',monospace", padding: '6px 12px', borderRadius: '6px', background: 'var(--nv-gold)', color: '#1a1322', opacity: v.exercisePickerCreateMuscle ? 1 : .4 }}
            hoverStyle={v.exercisePickerCreateMuscle ? { background: 'color-mix(in srgb, var(--nv-gold) 85%, white)' } : {}}
          >ADD</Interactive>
        </div>
      )}
    </div>
  );
}

function RoutinesView({ v }) {
  return (
    <>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 'Rajdhani',sans-serif;letter-spacing:.02em")}>Train, <span style={css("font:italic 400 27px 'Instrument Serif',serif;color:var(--nv-gold)")}>your way.</span></h1>

      <div style={css("margin-top:20px;display:flex;gap:8px;overflow-x:auto;padding-bottom:4px")}>
        {v.weekStrip.map((d) => (
          <div key={d.day} style={d.style}>
            <div style={{ font: "500 9px 'IBM Plex Mono',monospace", letterSpacing: '.14em', color: d.labelColor }}>{d.dayLabel}</div>
            <select
              value={d.value}
              onChange={d.onChange}
              style={{ marginTop: '6px', width: '100%', background: 'transparent', border: 'none', color: d.isToday ? 'var(--nv-cy)' : 'var(--nv-ink)', fontSize: '10.5px', fontFamily: "'Rajdhani',sans-serif", outline: 'none', textAlign: 'center' }}
            >
              {d.options.map((o) => <option key={o.value || 'rest'} value={o.value} style={{ background: '#141019', color: 'var(--nv-ink)' }}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div style={css("margin-top:22px;display:flex;justify-content:space-between;align-items:baseline")}>
        <span style={css("font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>ROUTINES</span>
        {!v.routineCreating && (
          <Interactive as="span" onClick={v.startCreateRoutine} base="cursor:pointer;font:500 10.5px 'IBM Plex Mono',monospace;padding:8px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 14%, transparent)">+ New routine</Interactive>
        )}
      </div>

      {v.routineCreating && (
        <div style={css("margin-top:12px;display:flex;gap:8px")}>
          <Interactive
            as="input"
            autoFocus
            value={v.routineNewName}
            onChange={v.setRoutineNewName}
            onKeyDown={(e) => { if (e.key === 'Enter') v.submitCreateRoutine(); if (e.key === 'Escape') v.cancelCreateRoutine(); }}
            placeholder="Routine name — e.g. Push Day"
            base="flex:1;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:10px 14px;color:var(--nv-ink);font-size:13px;font-family:'Rajdhani',sans-serif;outline:none"
            focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
          />
          <Interactive as="span" onClick={v.submitCreateRoutine} base="cursor:pointer;display:flex;align-items:center;font:500 10.5px 'IBM Plex Mono',monospace;padding:0 16px;border-radius:8px;background:var(--nv-gold);color:#1a1322" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 85%, white)">CREATE</Interactive>
          <Interactive as="span" onClick={v.cancelCreateRoutine} base="cursor:pointer;display:flex;align-items:center;font:500 10.5px 'IBM Plex Mono',monospace;padding:0 14px;border-radius:8px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)" hoverStyle="color:var(--nv-ink)">CANCEL</Interactive>
        </div>
      )}

      {v.routinesList.length === 0 && !v.routineCreating ? (
        <div style={css("margin-top:60px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
          No routines yet — create one to start logging real workouts.
        </div>
      ) : (
        <div style={css("margin-top:16px;display:flex;flex-wrap:wrap;gap:14px")}>
          {v.routinesList.map((r) => (
            <Interactive
              key={r.id}
              onClick={r.onOpen}
              base={{ cursor: 'pointer', flex: '1 1 260px', minWidth: '240px', border: '1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent)', borderRadius: '14px', padding: '18px 20px', background: 'linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06),0 14px 34px -20px rgba(0,0,0,.9)' }}
              hoverStyle="border-color:color-mix(in srgb, var(--nv-cy) 35%, transparent)"
            >
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
                <span style={css("font-size:15.5px;font-weight:500")}>{r.name}</span>
                {r.completedCount > 0 && <span style={css("font:500 9px 'IBM Plex Mono',monospace;color:var(--nv-gold)")}>{r.completedCount > 10 ? '🏆' : r.completedCount >= 3 ? '🥇' : '●'} {r.completedCount}×</span>}
              </div>
              <div style={css("margin-top:8px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent);line-height:1.5")}>{r.exercisesPreview}</div>
            </Interactive>
          ))}
        </div>
      )}
    </>
  );
}

function RoutineDetailView({ v }) {
  return (
    <>
      <Interactive as="span" onClick={v.backToRoutines} base="cursor:pointer;display:inline-block;margin-top:18px;font:500 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)" hoverStyle="color:var(--nv-gold)">← ROUTINES</Interactive>
      <h1 style={css("margin:10px 0 0;font:700 28px/1.1 'Rajdhani',sans-serif;letter-spacing:.02em")}>{v.openRoutineName}</h1>

      <div style={css("margin-top:18px;display:flex;gap:10px;flex-wrap:wrap")}>
        <Interactive
          as="span"
          onClick={v.startWorkoutDisabled ? undefined : v.startWorkout}
          base={{ cursor: v.startWorkoutDisabled ? 'default' : 'pointer', font: "500 11px 'IBM Plex Mono',monospace", padding: '11px 22px', borderRadius: '9px', background: 'var(--nv-cy)', color: '#0a2830', opacity: v.startWorkoutDisabled ? .4 : 1 }}
          hoverStyle={v.startWorkoutDisabled ? {} : { background: 'color-mix(in srgb, var(--nv-cy) 80%, white)' }}
        >START WORKOUT</Interactive>
        <Interactive as="span" onClick={v.viewWorkoutHistory} base="cursor:pointer;display:flex;align-items:center;font:500 10.5px 'IBM Plex Mono',monospace;padding:0 16px;border-radius:9px;border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);color:color-mix(in srgb, var(--nv-ink) 60%, transparent)" hoverStyle="border-color:color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy)">VIEW HISTORY</Interactive>
      </div>

      {v.routineDetailExercises.length === 0 && (
        <div style={css("margin-top:24px;font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>No exercises yet — add one below.</div>
      )}

      <div style={css("margin-top:20px;display:flex;flex-direction:column;gap:10px")}>
        {v.routineDetailExercises.map((e) => (
          <div key={e.exerciseId} style={css("border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:12px;padding:14px 16px;background:rgba(255,255,255,.02)")}>
            <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap")}>
              <div>
                <div style={css("font-size:14.5px;font-weight:500")}>{e.name}</div>
                <div style={css("margin-top:2px;font:400 10.5px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{e.muscleGroup} · last: {e.lastLabel}</div>
              </div>
              <div style={css("display:flex;align-items:center;gap:4px;font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
                <input type="number" min="1" defaultValue={e.targetSets} onBlur={e.onTargetSetsBlur} style={numInputStyle} />
                <span>×</span>
                <input type="number" min="1" defaultValue={e.targetRepsLow} onBlur={e.onTargetLowBlur} style={numInputStyle} />
                <span>–</span>
                <input type="number" min="1" defaultValue={e.targetRepsHigh} onBlur={e.onTargetHighBlur} style={numInputStyle} />
                <span>{e.targetUnit}</span>
              </div>
            </div>
            <div style={css("margin-top:10px;display:flex;align-items:center;gap:6px")}>
              <Interactive as="span" onClick={e.canMoveUp ? e.onMoveUp : undefined} base={{ cursor: e.canMoveUp ? 'pointer' : 'default', fontSize: '11px', color: e.canMoveUp ? 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 15%, transparent)', padding: '2px 6px' }} hoverStyle={e.canMoveUp ? { color: 'var(--nv-ink)' } : {}}>↑</Interactive>
              <Interactive as="span" onClick={e.canMoveDown ? e.onMoveDown : undefined} base={{ cursor: e.canMoveDown ? 'pointer' : 'default', fontSize: '11px', color: e.canMoveDown ? 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 15%, transparent)', padding: '2px 6px' }} hoverStyle={e.canMoveDown ? { color: 'var(--nv-ink)' } : {}}>↓</Interactive>
              <Interactive as="span" onClick={e.onRemove} base="cursor:pointer;font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-warn) 60%, transparent);padding:2px 6px;margin-left:auto" hoverStyle="color:var(--nv-warn)">REMOVE</Interactive>
            </div>
          </div>
        ))}
      </div>

      {v.exercisePickerOpen ? (
        <ExercisePicker v={v} />
      ) : (
        <Interactive as="span" onClick={v.openExercisePicker} base="cursor:pointer;display:inline-block;margin-top:14px;font:500 10.5px 'IBM Plex Mono',monospace;padding:9px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 14%, transparent)">+ Add exercise</Interactive>
      )}

      <div style={css("margin-top:36px;padding-top:16px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}>
        {!v.routineDeleteConfirm ? (
          <Interactive as="span" onClick={v.requestDeleteRoutine} base="cursor:pointer;font:400 10.5px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 30%, transparent)" hoverStyle="color:var(--nv-warn)">Delete routine</Interactive>
        ) : (
          <div style={css("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
            <span style={css("font-size:12px;color:var(--nv-warn)")}>Delete "{v.openRoutineName}" and unschedule it? History stays.</span>
            <Interactive as="span" onClick={v.confirmDeleteRoutine} base="cursor:pointer;font:500 10px 'IBM Plex Mono',monospace;padding:6px 12px;border-radius:6px;background:color-mix(in srgb, var(--nv-warn) 15%, transparent);color:var(--nv-warn);border:1px solid color-mix(in srgb, var(--nv-warn) 40%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-warn) 25%, transparent)">CONFIRM DELETE</Interactive>
            <Interactive as="span" onClick={v.cancelDeleteRoutine} base="cursor:pointer;font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-ink)">cancel</Interactive>
          </div>
        )}
      </div>
    </>
  );
}

function SessionView({ v }) {
  return (
    <>
      <h1 style={css("margin:18px 0 0;font:700 28px/1.1 'Rajdhani',sans-serif;letter-spacing:.02em")}>{v.sessionRoutineName}</h1>
      <div style={css("margin-top:4px;font:400 11px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Session in progress — sets auto-fill from last time.</div>

      <div style={css("margin-top:20px;display:flex;flex-direction:column;gap:14px")}>
        {v.sessionExercises.map((e) => (
          <div key={e.exerciseId} style={css("border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:12px;padding:16px 18px;background:rgba(255,255,255,.02)")}>
            <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
              <span style={css("font-size:15px;font-weight:500")}>{e.name}</span>
              <span style={css("font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{e.targetLabel}</span>
            </div>
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:8px")}>
              <div style={css("display:flex;gap:10px;font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.1em;color:color-mix(in srgb, var(--nv-ink) 35%, transparent);padding:0 2px")}>
                <span style={{ width: '22px' }}>SET</span>{!e.isBodyweight && <span style={{ width: '64px' }}>{e.weightLabel}</span>}<span style={{ width: '64px' }}>{e.amountLabel}</span>
              </div>
              {e.sets.map((s, i) => (
                <div key={i} style={css("display:flex;align-items:center;gap:10px")}>
                  <span style={{ width: '22px', font: "400 11px 'IBM Plex Mono',monospace", color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>{i + 1}</span>
                  {!e.isBodyweight && <input type="number" step="0.5" min="0" value={s.weight} onChange={s.onWeight} style={setInputStyle} />}
                  <input type="number" min="0" value={s.reps} onChange={s.onReps} style={setInputStyle} />
                  <Interactive
                    as="span"
                    onClick={s.onToggleDone}
                    base={{ cursor: 'pointer', width: '22px', height: '22px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
                      border: s.done ? '1px solid var(--nv-cy)' : '1px solid color-mix(in srgb, var(--nv-ink) 25%, transparent)', background: s.done ? 'var(--nv-cy)' : 'transparent', color: '#0a2830' }}
                  >{s.done ? '✓' : ''}</Interactive>
                  {s.canRemove && (
                    <Interactive as="span" onClick={s.onRemove} base="cursor:pointer;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 25%, transparent);margin-left:4px" hoverStyle="color:var(--nv-warn)">×</Interactive>
                  )}
                </div>
              ))}
            </div>
            <Interactive as="span" onClick={e.onAddSet} base="cursor:pointer;display:inline-block;margin-top:10px;font:500 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-gold)">+ Extra set</Interactive>
          </div>
        ))}
      </div>

      <div style={css("margin-top:24px;display:flex;gap:14px;align-items:center;flex-wrap:wrap")}>
        <Interactive as="span" onClick={v.finishSession} base="cursor:pointer;font:500 11px 'IBM Plex Mono',monospace;padding:11px 22px;border-radius:9px;background:var(--nv-cy);color:#0a2830" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 80%, white)">FINISH WORKOUT</Interactive>
        {!v.sessionCancelConfirm ? (
          <Interactive as="span" onClick={v.requestCancelSession} base="cursor:pointer;font:400 10.5px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-warn)">Cancel session</Interactive>
        ) : (
          <>
            <span style={css("font-size:12px;color:var(--nv-warn)")}>Discard this session?</span>
            <Interactive as="span" onClick={v.discardSession} base="cursor:pointer;font:500 10px 'IBM Plex Mono',monospace;padding:6px 12px;border-radius:6px;background:color-mix(in srgb, var(--nv-warn) 15%, transparent);color:var(--nv-warn);border:1px solid color-mix(in srgb, var(--nv-warn) 40%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-warn) 25%, transparent)">DISCARD</Interactive>
            <Interactive as="span" onClick={v.cancelSessionCancel} base="cursor:pointer;font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-ink)">keep going</Interactive>
          </>
        )}
      </div>
    </>
  );
}

function HistoryView({ v }) {
  return (
    <>
      <Interactive as="span" onClick={v.backFromWorkoutHistory} base="cursor:pointer;display:inline-block;margin-top:18px;font:500 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)" hoverStyle="color:var(--nv-gold)">← BACK</Interactive>
      <h1 style={css("margin:10px 0 0;font:700 28px/1.1 'Rajdhani',sans-serif;letter-spacing:.02em")}>{v.historyRoutineName} <span style={css("font:italic 400 27px 'Instrument Serif',serif;color:var(--nv-gold)")}>history.</span></h1>

      {v.historyLoading ? (
        <div style={css("margin-top:40px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Loading…</div>
      ) : v.historySessions.length === 0 ? (
        <div style={css("margin-top:40px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>No sessions logged yet.</div>
      ) : (
        <div style={css("margin-top:20px;display:flex;flex-direction:column;gap:12px")}>
          {v.historySessions.map((s) => (
            <div key={s.id} style={css("border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:12px;padding:14px 18px;background:rgba(255,255,255,.02)")}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
                <span style={css("font-size:13.5px;font-weight:500")}>{s.date}</span>
                <span style={css("font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{s.totalSets} sets · {s.totalVolume}kg volume</span>
              </div>
              <div style={css("margin-top:8px;display:flex;flex-direction:column;gap:3px")}>
                {s.exercises.map((e, i) => (
                  <div key={i} style={css("font-size:12px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}><span style={css("color:var(--nv-ink)")}>{e.name}:</span> {e.setsLabel}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function MockWorkouts({ v }) {
  return (
    <>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 'Rajdhani',sans-serif;letter-spacing:.02em")}>Push day, <span style={css("font:italic 400 27px 'Instrument Serif',serif;color:var(--nv-gold)")}>week six.</span></h1>
      <div style={css("display:flex;gap:8px;margin-top:18px;overflow-x:auto;padding-bottom:4px")}>
        {v.week.map((d) => (
          <div key={d.day} style={d.style}><div style={css("font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.14em")}>{d.day}</div><div style={css("margin-top:4px;font-size:11.5px")}>{d.label}</div></div>
        ))}
      </div>
      <div style={v.gridWork}>
        <div style={css("border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:20px 24px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec),0 14px 34px -20px rgba(0,0,0,.9)")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
            <span style={css("font:italic 400 20px 'Instrument Serif',serif;color:var(--nv-gold)")}>Today's session</span>
            <span style={css("font:400 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.planMeta}</span>
          </div>
          {v.planNoteOn && (
            <div style={css("margin-top:12px;display:flex;align-items:center;gap:9px;font-size:12px;color:var(--nv-cy);border:1px solid color-mix(in srgb, var(--nv-cy) 25%, transparent);border-radius:8px;padding:8px 12px;background:color-mix(in srgb, var(--nv-cy) 05%, transparent);animation:fadeUp .3s ease-out")}><span>◆</span><span>{v.planNote}</span></div>
          )}
          <div style={css("margin-top:14px;display:flex;flex-direction:column")}>
            {v.plan.map((ex) => (
              <div key={ex.idx} style={css("display:flex;align-items:baseline;gap:14px;padding:11px 0;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)")}>
                <span style={css("font:500 10px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-gold) 60%, transparent);width:20px")}>{ex.idx}</span>
                <span style={css("font-size:14px;font-weight:500")}>{ex.name}</span>
                {ex.pr && <span style={css("font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.1em;color:var(--nv-gold);border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);border-radius:5px;padding:2px 7px")}>PR WATCH</span>}
                <span style={css("margin-left:auto;font:400 12px 'IBM Plex Mono',monospace;color:color-mix(in srgb, var(--nv-ink) 60%, transparent);font-variant-numeric:tabular-nums")}>{ex.scheme}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={css("border:1px solid color-mix(in srgb, var(--nv-cy) 18%, transparent);border-radius:14px;padding:20px 22px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 05%, transparent),color-mix(in srgb, var(--nv-cy) 01%, transparent));box-shadow:inset 0 1px 0 var(--nv-spec);display:flex;flex-direction:column;min-height:420px")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
            <span style={css("font:italic 400 20px 'Instrument Serif',serif;color:var(--nv-cy)")}>Ask Coach</span>
            <span style={css("font:400 9px 'IBM Plex Mono',monospace;letter-spacing:.18em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>EDITS WRITE BACK TO VAULT</span>
          </div>
          <div style={css("flex:1;overflow-y:auto;margin-top:14px;display:flex;flex-direction:column;gap:12px")}>
            {v.coachMsgs.map((m, i) => (
              <div key={i} style={m.wrapStyle}><div style={m.bubbleStyle}>{m.text}{m.typing && <span style={css("color:var(--nv-cy)")}>▍</span>}</div></div>
            ))}
          </div>
          <div style={css("display:flex;gap:8px;margin-top:14px")}>
            <Interactive
              as="input"
              value={v.coachInput}
              onChange={v.setCoachInput}
              onKeyDown={v.coachKey}
              placeholder='Try "make it shorter" or "go harder"…'
              base="flex:1;background:rgba(0,0,0,.32);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font-size:12.5px;font-family:'Rajdhani',sans-serif;outline:none"
              focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)"
            />
            <Interactive as="span" onClick={v.sendCoach} base="cursor:pointer;display:flex;align-items:center;font:500 11px 'IBM Plex Mono',monospace;padding:0 16px;border-radius:9px;background:var(--nv-cy);color:#0a2830" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 80%, white)">SEND</Interactive>
          </div>
        </div>
      </div>
    </>
  );
}

export function Workouts({ v }) {
  return (
    <div style={v.wrapWorkouts} data-screen-label="Workouts">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.14em;color:var(--nv-acc)")}>VII.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>VAULT · TRAINING</span>
        </div>
        {v.usingLiveWorkouts ? (
          <span style={css("font:400 10px 'IBM Plex Mono',monospace;letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.workoutHeaderLabel}</span>
        ) : (
          <span style={css("display:flex;align-items:center;gap:8px;font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.14em;color:var(--nv-cy)")}><span style={css("width:5px;height:5px;border-radius:50%;background:var(--nv-cy);animation:novaPulse 2s infinite")}></span>COACH IS LIVE</span>
        )}
      </div>

      {!v.usingLiveWorkouts && <MockWorkouts v={v} />}
      {v.usingLiveWorkouts && v.workoutsView === 'routines' && <RoutinesView v={v} />}
      {v.usingLiveWorkouts && v.workoutsView === 'routine' && <RoutineDetailView v={v} />}
      {v.usingLiveWorkouts && v.workoutsView === 'session' && <SessionView v={v} />}
      {v.usingLiveWorkouts && v.workoutsView === 'history' && <HistoryView v={v} />}
    </div>
  );
}
