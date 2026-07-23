import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

// Inputs render at 16px (global rule in index.css) so iOS never zoom-jumps on
// focus — widths/padding here are sized for that, not the old 11–12px text.
const numInputStyle = { width: '48px', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '6px', padding: '7px 4px', color: 'var(--nv-ink)', fontSize: '16px', fontFamily: "var(--nv-font-mono)", textAlign: 'center', outline: 'none' };
const setInputStyle = { width: '64px', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '6px', padding: '8px 8px', color: 'var(--nv-ink)', fontSize: '16px', fontFamily: "var(--nv-font-mono)", outline: 'none', boxSizing: 'border-box' };

function ExercisePicker({ v }) {
  return (
    <div style={css("margin-top:14px;border:1px solid color-mix(in srgb, var(--nv-cy) 18%, transparent);border-radius:12px;padding:16px 18px;background:color-mix(in srgb, var(--nv-cy) 03%, transparent)")}>
      <div style={css("display:flex;justify-content:space-between;align-items:center")}>
        <span style={css("font:italic 400 15px var(--nv-font-serif);color:var(--nv-cy)")}>Add an exercise</span>
        <Interactive as="span" onClick={v.closeExercisePicker} base="cursor:pointer;font-size:16px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-ink)">×</Interactive>
      </div>
      <Interactive
        as="input"
        autoFocus
        value={v.exercisePickerQuery}
        onChange={v.setExercisePickerQuery}
        placeholder="Search exercises…"
        base="margin-top:12px;width:100%;box-sizing:border-box;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:9px 13px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none"
        focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)"
      />
      <div style={css("margin-top:10px;display:flex;gap:6px;flex-wrap:wrap")}>
        {v.exercisePickerMuscleGroups.map((m) => (
          <Interactive
            key={m}
            as="span"
            onClick={() => v.setExercisePickerMuscle(m)}
            base={{
              cursor: 'pointer', font: "500 9.5px var(--nv-font-mono)", padding: '5px 10px', borderRadius: '6px',
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
            <span style={css("font:400 9.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>{r.muscleGroup}</span>
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
            base={{ cursor: v.exercisePickerCreateMuscle ? 'pointer' : 'default', font: "500 10px var(--nv-font-mono)", padding: '6px 12px', borderRadius: '6px', background: 'var(--nv-gold)', color: '#1a1322', opacity: v.exercisePickerCreateMuscle ? 1 : .4 }}
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
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Train, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>your way.</span></h1>

      <div style={css("margin-top:20px;display:flex;gap:8px;overflow-x:auto;padding-bottom:4px")}>
        {v.weekStrip.map((d) => (
          <div key={d.day} style={d.style}>
            <div style={{ font: "500 9px var(--nv-font-mono)", letterSpacing: '.14em', color: d.labelColor }}>{d.dayLabel}</div>
            <select
              value={d.value}
              onChange={d.onChange}
              style={{ marginTop: '6px', width: '100%', background: 'transparent', border: 'none', color: d.isToday ? 'var(--nv-cy)' : 'var(--nv-ink)', fontSize: '10.5px', fontFamily: "var(--nv-font-ui)", outline: 'none', textAlign: 'center' }}
            >
              {d.options.map((o) => <option key={o.value || 'rest'} value={o.value} style={{ background: '#141019', color: 'var(--nv-ink)' }}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* a workout you parked mid-set — pick it back up */}
      {v.resumeSession && (
        <Interactive
          onClick={v.resumeSession.resume}
          base={{ cursor: 'pointer', marginTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: '1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent)', borderRadius: '14px', padding: '15px 18px', background: 'linear-gradient(180deg,color-mix(in srgb, var(--nv-gold) 10%, transparent),transparent)' }}
          hoverStyle="border-color:color-mix(in srgb, var(--nv-gold) 65%, transparent)"
        >
          <div>
            <div style={css("font:500 9px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-gold)")}>WORKOUT IN PROGRESS</div>
            <div style={css("margin-top:5px;font:600 16px var(--nv-font-ui)")}>{v.resumeSession.routineName}</div>
            <div style={css("margin-top:2px;font-size:11.5px;color:var(--nv-ink60)")}>{v.resumeSession.done} set{v.resumeSession.done === 1 ? '' : 's'} logged · {v.resumeSession.ageLabel}</div>
          </div>
          <span style={css("font:600 10.5px var(--nv-font-mono);letter-spacing:.06em;padding:10px 18px;border-radius:9px;background:var(--nv-gold);color:#1a1322;white-space:nowrap")}>RESUME →</span>
        </Interactive>
      )}

      {/* just finished, but left exercises undone — offer to push them forward */}
      {v.finishMissed && (
        <div style={css("margin-top:18px;border:1px solid color-mix(in srgb, var(--nv-cy) 34%, transparent);border-radius:14px;padding:16px 18px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 08%, transparent),transparent)")}>
          <div style={css("font:500 9px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-cy)")}>{v.finishMissed.count} EXERCISE{v.finishMissed.count === 1 ? '' : 'S'} NOT DONE</div>
          <div style={css("margin-top:6px;font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 78%, transparent);line-height:1.5")}>{v.finishMissed.names}</div>
          <div style={css("margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap")}>
            <span style={css("font-size:11.5px;color:var(--nv-ink60)")}>Push to</span>
            <select value={v.finishMissed.date} onChange={v.finishMissed.setDate}
              style={{ background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-cy) 30%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 11px var(--nv-font-mono)", padding: '9px 10px', outline: 'none' }}>
              {v.finishMissed.dayOptions.map((o) => <option key={o.value} value={o.value} style={{ background: '#141019' }}>{o.label}</option>)}
            </select>
            <Interactive as="span" onClick={v.finishMissed.push}
              base={{ cursor: 'pointer', font: "600 10.5px var(--nv-font-mono)", letterSpacing: '.06em', padding: '9px 16px', borderRadius: '8px', background: 'var(--nv-cy)', color: '#0a2830' }}
              hoverStyle={{ filter: 'brightness(1.08)' }}>PUSH THESE FORWARD</Interactive>
            <Interactive as="span" onClick={v.finishMissed.dismiss}
              base={{ cursor: 'pointer', font: "400 10px var(--nv-font-mono)", color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}
              hoverStyle={{ color: 'var(--nv-ink)' }}>no thanks</Interactive>
          </div>
        </div>
      )}

      {/* carry-overs — makeup exercises Nova is holding for a day */}
      {v.carryovers.length > 0 && (
        <div style={css("margin-top:22px")}>
          <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>CARRY-OVERS</span>
          <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:10px")}>
            {v.carryovers.map((c) => (
              <div key={c.id} style={{ border: `1px solid ${c.overdue ? 'color-mix(in srgb, var(--nv-mag,#e0607e) 42%, transparent)' : c.dueSoon ? 'color-mix(in srgb, var(--nv-gold) 38%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 10%, transparent)'}`, borderRadius: '13px', padding: '15px 17px', background: 'linear-gradient(180deg,rgba(255,255,255,.035),transparent)' }}>
                <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}>
                  <span style={css("font:600 15px var(--nv-font-ui)")}>{c.title}</span>
                  <span style={{ font: "500 8.5px var(--nv-font-mono)", letterSpacing: '.1em', color: c.overdue ? 'var(--nv-mag,#e0607e)' : c.dueSoon ? 'var(--nv-gold)' : 'color-mix(in srgb, var(--nv-ink) 45%, transparent)', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{c.when}</span>
                </div>
                <div style={css("margin-top:5px;font-size:11.5px;color:var(--nv-ink60);line-height:1.5")}>{c.count} exercise{c.count === 1 ? '' : 's'} · {c.names}</div>
                {!c.rescheduling ? (
                  <div style={css("margin-top:12px;display:flex;gap:12px;align-items:center")}>
                    <Interactive as="span" onClick={c.start}
                      base={{ cursor: 'pointer', font: "600 10px var(--nv-font-mono)", letterSpacing: '.06em', padding: '9px 16px', borderRadius: '8px', background: 'var(--nv-cy)', color: '#0a2830' }}
                      hoverStyle={{ filter: 'brightness(1.08)' }}>DO IT NOW</Interactive>
                    <Interactive as="span" onClick={c.startReschedule}
                      base={{ cursor: 'pointer', font: "500 10px var(--nv-font-mono)", color: 'var(--nv-ink60)' }}
                      hoverStyle={{ color: 'var(--nv-gold)' }}>reschedule</Interactive>
                    <Interactive as="span" onClick={c.remove}
                      base={{ cursor: 'pointer', font: "400 10px var(--nv-font-mono)", color: 'color-mix(in srgb, var(--nv-ink) 38%, transparent)' }}
                      hoverStyle={{ color: 'var(--nv-mag,#e0607e)' }}>remove</Interactive>
                  </div>
                ) : (
                  <div style={css("margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap")}>
                    <span style={css("font-size:11px;color:var(--nv-ink60)")}>Move to</span>
                    <select defaultValue="" onChange={c.reschedule}
                      style={{ background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 11px var(--nv-font-mono)", padding: '8px 10px', outline: 'none' }}>
                      <option value="" disabled style={{ background: '#141019' }}>Pick a day…</option>
                      {c.dayOptions.map((o) => <option key={o.value} value={o.value} style={{ background: '#141019' }}>{o.label}</option>)}
                    </select>
                    <Interactive as="span" onClick={c.cancelReschedule}
                      base={{ cursor: 'pointer', font: "400 10px var(--nv-font-mono)", color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}
                      hoverStyle={{ color: 'var(--nv-ink)' }}>cancel</Interactive>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={css("margin-top:22px;display:flex;justify-content:space-between;align-items:baseline")}>
        <span style={css("display:flex;align-items:baseline;gap:12px")}>
          <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>ROUTINES</span>
          <Interactive as="span" onClick={v.openAllSessions} base="cursor:pointer;font:500 9px var(--nv-font-mono);letter-spacing:.1em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-cy)">ALL SESSIONS →</Interactive>
        </span>
        {!v.routineCreating && (
          <Interactive as="span" onClick={v.startCreateRoutine} base="cursor:pointer;font:500 10.5px var(--nv-font-mono);padding:8px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 14%, transparent)">+ New routine</Interactive>
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
            base="flex:1;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:10px 14px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-ui);outline:none"
            focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)"
          />
          <Interactive as="span" onClick={v.submitCreateRoutine} base="cursor:pointer;display:flex;align-items:center;font:500 10.5px var(--nv-font-mono);padding:0 16px;border-radius:8px;background:var(--nv-gold);color:#1a1322" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 85%, white)">CREATE</Interactive>
          <Interactive as="span" onClick={v.cancelCreateRoutine} base="cursor:pointer;display:flex;align-items:center;font:500 10.5px var(--nv-font-mono);padding:0 14px;border-radius:8px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)" hoverStyle="color:var(--nv-ink)">CANCEL</Interactive>
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
                {r.completedCount > 0 && <span style={css("font:500 9px var(--nv-font-mono);color:var(--nv-gold)")}>{r.completedCount > 10 ? '🏆' : r.completedCount >= 3 ? '🥇' : '●'} {r.completedCount}×</span>}
              </div>
              <div style={css("margin-top:8px;font-size:12px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent);line-height:1.5")}>{r.exercisesPreview}</div>
            </Interactive>
          ))}
        </div>
      )}

      {/* the Coach's impromptu session builder */}
      <div className="nv-pane" style={{ marginTop: '26px', padding: '16px 18px' }}>
        <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap")}>
          <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-cy)")}>QUICK SESSION</span>
          <span style={css("font:400 8.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>OFF-PROGRAM DAYS · BUILT FOR YOUR GOALS + TIME</span>
        </div>
        {!v.quickPlan ? (
          <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
            <select value={v.quickMinutes} onChange={v.setQuickMinutes}
              style={{ background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 11px var(--nv-font-mono)", padding: '9px 10px', outline: 'none' }}>
              {['20', '30', '45', '60', '90'].map((m) => <option key={m} value={m} style={{ background: '#141019' }}>{m} MIN</option>)}
            </select>
            <input value={v.quickNote} onChange={v.setQuickNote} placeholder="Optional — “hotel gym, dumbbells only”, “feeling beat”, “arms”…"
              style={{ flex: '1 1 240px', minWidth: 0, background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 12.5px var(--nv-font-ui)", padding: '9px 12px', outline: 'none' }} />
            <Interactive as="span" onClick={v.quickBusy ? undefined : v.buildQuickSession}
              base={{ cursor: 'pointer', font: "600 10.5px var(--nv-font-mono)", letterSpacing: '.08em', padding: '9px 16px', borderRadius: '8px', background: 'var(--nv-cy)', color: '#0a2830', opacity: v.quickBusy ? 0.5 : 1 }}
              hoverStyle={{ filter: 'brightness(1.08)' }}
            >{v.quickBusy ? 'COACH IS PLANNING…' : 'BUILD MY SESSION'}</Interactive>
          </div>
        ) : (
          <div style={css("margin-top:10px")}>
            <div style={css("font:600 15px var(--nv-font-ui)")}>{v.quickPlan.name}</div>
            <div style={css("margin-top:3px;font:500 12px/1.55 var(--nv-font-ui);color:var(--nv-ink60)")}>{v.quickPlan.rationale}</div>
            <div style={css("margin-top:8px;display:flex;flex-direction:column;gap:4px")}>
              {v.quickPlan.exercises.map((e) => (
                <div key={e.key} style={css("font:500 12.5px var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 80%, transparent)")}>· {e.label}</div>
              ))}
            </div>
            <div style={css("margin-top:12px;display:flex;gap:10px;align-items:center")}>
              <Interactive as="span" onClick={v.quickPlan.start}
                base={{ cursor: 'pointer', font: "600 10.5px var(--nv-font-mono)", letterSpacing: '.08em', padding: '10px 20px', borderRadius: '9px', background: 'var(--nv-cy)', color: '#0a2830' }}
                hoverStyle={{ filter: 'brightness(1.08)' }}>START THIS SESSION</Interactive>
              <Interactive as="span" onClick={v.quickPlan.dismiss}
                base={{ cursor: 'pointer', font: "400 10px var(--nv-font-mono)", color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}
                hoverStyle={{ color: 'var(--nv-ink)' }}>discard</Interactive>
            </div>
          </div>
        )}
      </div>

      {/* goals + the real coach, side by side */}
      <div style={{ display: 'flex', gap: '14px', marginTop: '14px', flexWrap: 'wrap' }}>
        <div className="nv-pane" style={{ flex: '1 1 300px', padding: '16px 18px', alignSelf: 'flex-start' }}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
            <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-gold)")}>GOALS</span>
            {!v.goalsEditing && (
              <Interactive as="span" onClick={v.startGoalsEdit} base="cursor:pointer;font:500 9.5px var(--nv-font-mono);letter-spacing:.08em;padding:4px 11px;border-radius:6px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);color:var(--nv-gold)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 08%, transparent)">{v.goalsSet ? 'EDIT' : 'SET GOALS'}</Interactive>
            )}
          </div>
          {v.goalsEditing ? (
            <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:8px")}>
              <input value={v.goalsDraft.goal} onChange={v.setGoalsField('goal')} placeholder="The goal — e.g. lean muscle gain, 78kg by December"
                style={{ background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 12.5px var(--nv-font-ui)", padding: '9px 12px', outline: 'none' }} />
              <input value={v.goalsDraft.focus} onChange={v.setGoalsField('focus')} placeholder="Focus — e.g. upper-body strength, protein consistency"
                style={{ background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 12.5px var(--nv-font-ui)", padding: '9px 12px', outline: 'none' }} />
              <div style={css("display:flex;gap:8px;align-items:center")}>
                <span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>DAYS/WEEK</span>
                <select value={v.goalsDraft.daysPerWeek} onChange={v.setGoalsField('daysPerWeek')}
                  style={{ background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '7px', color: 'var(--nv-ink)', font: "500 11px var(--nv-font-mono)", padding: '5px 8px', outline: 'none' }}>
                  <option value="" style={{ background: '#141019' }}>—</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n} style={{ background: '#141019' }}>{n}</option>)}
                </select>
              </div>
              <input value={v.goalsDraft.equipment} onChange={v.setGoalsField('equipment')} placeholder="Equipment — e.g. full gym weekdays, dumbbells only at weekends"
                style={{ marginTop: '8px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)', borderRadius: '8px', padding: '9px 12px', color: 'var(--nv-ink)', fontSize: '12.5px', fontFamily: "var(--nv-font-ui)", outline: 'none' }} />
              <input value={v.goalsDraft.limitations} onChange={v.setGoalsField('limitations')} placeholder="Injuries / limitations — e.g. left shoulder impingement, no overhead pressing"
                style={{ marginTop: '8px', width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-warn) 25%, transparent)', borderRadius: '8px', padding: '9px 12px', color: 'var(--nv-ink)', fontSize: '12.5px', fontFamily: "var(--nv-font-ui)", outline: 'none' }} />
              <textarea value={v.goalsDraft.notes} onChange={v.setGoalsField('notes')} rows={3} placeholder="Anything else the Coach should always know — preferences, schedule quirks…"
                style={{ background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: "500 12.5px var(--nv-font-ui)", padding: '9px 12px', outline: 'none', resize: 'vertical' }} />
              <div style={css("display:flex;gap:8px")}>
                <Interactive as="span" onClick={v.saveGoals} base="cursor:pointer;font:600 10.5px var(--nv-font-mono);letter-spacing:.08em;padding:8px 16px;border-radius:8px;background:var(--nv-gold);color:#1a1322" hoverStyle="filter:brightness(1.08)">SAVE</Interactive>
                <Interactive as="span" onClick={v.cancelGoalsEdit} base="cursor:pointer;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent);padding:8px 6px" hoverStyle="color:var(--nv-ink)">cancel</Interactive>
              </div>
            </div>
          ) : v.goalsSet ? (
            <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:6px")}>
              <div style={css("font:600 14px var(--nv-font-ui)")}>{v.goalsView.goal}</div>
              {v.goalsView.focus && <div style={css("font:500 12px var(--nv-font-ui);color:var(--nv-ink60)")}>Focus: {v.goalsView.focus}</div>}
              {v.goalsView.meta && <div style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{v.goalsView.meta}</div>}
              {v.goalsView.notes && <div style={css("font:500 11.5px/1.55 var(--nv-font-ui);color:var(--nv-ink60);white-space:pre-wrap")}>{v.goalsView.notes}</div>}
            </div>
          ) : (
            <div style={css("margin-top:10px;font:500 11.5px/1.6 var(--nv-font-ui);color:var(--nv-ink60)")}>Tell Nova what you're training for — the Coach, the briefs, and meal-prep all key off this. Lives in the vault at Wiki/Health/Fitness Goals.</div>
          )}
        </div>

        <div className="nv-pane" style={{ flex: '1.4 1 340px', padding: '16px 18px', display: 'flex', flexDirection: 'column', maxHeight: '420px' }}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap")}>
            <span style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-cy)")}>ASK COACH</span>
            <span style={css("display:flex;gap:10px;align-items:baseline")}>
              <span style={css("font:400 8.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{v.coachContinuing ? 'REMEMBERS ACROSS DAYS' : 'EVIDENCE-BASED · READS YOUR REAL DATA'}</span>
              {v.coachContinuing && (
                <Interactive as="span" onClick={v.newCoachChat} base="cursor:pointer;font:500 8.5px var(--nv-font-mono);letter-spacing:.08em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-cy)">NEW</Interactive>
              )}
            </span>
          </div>
          <div style={css("flex:1;overflow-y:auto;margin-top:10px;display:flex;flex-direction:column;gap:10px;font:500 12.5px/1.6 var(--nv-font-ui)")}>
            {v.coachMsgs.length === 0 && !v.coachBusy && (
              <div style={css("color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Ask anything a coach should answer — "should I deload?", "why is my bench stuck?", "build me a plan for a 4-day week."</div>
            )}
            {v.coachMsgs.map((m, i) => (
              <div key={i} style={m.style}><span style={m.tagStyle}>{m.tag}</span> {m.text}{m.typing && <span style={css("color:var(--nv-cy)")}>▍</span>}</div>
            ))}
            {v.coachBusy && <div style={css("color:var(--nv-cy);font:400 11px var(--nv-font-mono)")}>» COACH reading your training history…▍</div>}
          </div>
          <div style={css("display:flex;gap:8px;margin-top:10px")}>
            <Interactive
              as="input"
              value={v.coachInput}
              onChange={v.setCoachInput}
              onKeyDown={v.coachKey}
              placeholder="Ask your coach…"
              base="flex:1;background:rgba(0,0,0,.32);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font:500 12.5px var(--nv-font-ui);outline:none"
              focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)"
            />
            <Interactive as="span" onClick={v.sendCoach} base="cursor:pointer;display:flex;align-items:center;font:500 11px var(--nv-font-mono);padding:0 16px;border-radius:9px;background:var(--nv-cy);color:#0a2830" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 80%, white)">ASK</Interactive>
          </div>
        </div>
      </div>
    </>
  );
}

function RoutineDetailView({ v }) {
  return (
    <>
      <Interactive as="span" onClick={v.backToRoutines} base="cursor:pointer;display:inline-block;margin-top:18px;font:500 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 50%, transparent)" hoverStyle="color:var(--nv-gold)">← ROUTINES</Interactive>
      <h1 style={css("margin:10px 0 0;font:700 28px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>{v.openRoutineName}</h1>

      <div style={css("margin-top:18px;display:flex;gap:10px;flex-wrap:wrap")}>
        <Interactive
          as="span"
          onClick={v.startWorkoutDisabled ? undefined : v.startWorkout}
          base={{ cursor: v.startWorkoutDisabled ? 'default' : 'pointer', font: "500 11px var(--nv-font-mono)", padding: '11px 22px', borderRadius: '9px', background: 'var(--nv-cy)', color: '#0a2830', opacity: v.startWorkoutDisabled ? .4 : 1 }}
          hoverStyle={v.startWorkoutDisabled ? {} : { background: 'color-mix(in srgb, var(--nv-cy) 80%, white)' }}
        >START WORKOUT</Interactive>
        <Interactive as="span" onClick={v.viewWorkoutHistory} base="cursor:pointer;display:flex;align-items:center;font:500 10.5px var(--nv-font-mono);padding:0 16px;border-radius:9px;border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);color:color-mix(in srgb, var(--nv-ink) 60%, transparent)" hoverStyle="border-color:color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy)">VIEW HISTORY</Interactive>
      </div>

      {v.routineDetailExercises.length === 0 && (
        <div style={css("margin-top:24px;font-size:12.5px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>No exercises yet — add one below.</div>
      )}

      <div style={css("margin-top:20px;display:flex;flex-direction:column;gap:10px")}>
        {v.routineDetailExercises.map((e) => (
          <div key={e.exerciseId} style={css("border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:12px;padding:14px 16px;background:rgba(255,255,255,.02)")}>
            <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap")}>
              <div>
                <div style={css("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
                  <span style={css("font-size:14.5px;font-weight:500")}>{e.name}</span>
                  {e.coachLabel && <span title={e.coachEvidence || ''} style={css("font:500 8.5px var(--nv-font-mono);letter-spacing:.12em;padding:2px 7px;border-radius:5px;color:var(--nv-cy);border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);background:color-mix(in srgb, var(--nv-cy) 08%, transparent)")}>{e.coachLabel}</span>}
                </div>
                <div style={css("margin-top:2px;font:400 10.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{e.muscleGroup} · last: {e.lastLabel}</div>
                {e.coachEvidence && <div style={css("margin-top:2px;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-cy) 60%, transparent)")}>Coach: {e.coachEvidence} — next session prefills the step up.</div>}
              </div>
              <div style={css("display:flex;align-items:center;gap:4px;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
                <input type="number" inputMode="numeric" min="1" defaultValue={e.targetSets} onBlur={e.onTargetSetsBlur} style={numInputStyle} />
                <span>×</span>
                <input type="number" inputMode="numeric" min="1" defaultValue={e.targetRepsLow} onBlur={e.onTargetLowBlur} style={numInputStyle} />
                <span>–</span>
                <input type="number" inputMode="numeric" min="1" defaultValue={e.targetRepsHigh} onBlur={e.onTargetHighBlur} style={numInputStyle} />
                <span>{e.targetUnit}</span>
              </div>
            </div>
            <div style={css("margin-top:10px;display:flex;align-items:center;gap:6px")}>
              <Interactive as="span" onClick={e.canMoveUp ? e.onMoveUp : undefined} base={{ cursor: e.canMoveUp ? 'pointer' : 'default', fontSize: '11px', color: e.canMoveUp ? 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 15%, transparent)', padding: '2px 6px' }} hoverStyle={e.canMoveUp ? { color: 'var(--nv-ink)' } : {}}>↑</Interactive>
              <Interactive as="span" onClick={e.canMoveDown ? e.onMoveDown : undefined} base={{ cursor: e.canMoveDown ? 'pointer' : 'default', fontSize: '11px', color: e.canMoveDown ? 'color-mix(in srgb, var(--nv-ink) 50%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 15%, transparent)', padding: '2px 6px' }} hoverStyle={e.canMoveDown ? { color: 'var(--nv-ink)' } : {}}>↓</Interactive>
              <Interactive as="span" onClick={e.onRemove} base="cursor:pointer;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-warn) 60%, transparent);padding:2px 6px;margin-left:auto" hoverStyle="color:var(--nv-warn)">REMOVE</Interactive>
            </div>
          </div>
        ))}
      </div>

      {v.exercisePickerOpen ? (
        <ExercisePicker v={v} />
      ) : (
        <Interactive as="span" onClick={v.openExercisePicker} base="cursor:pointer;display:inline-block;margin-top:14px;font:500 10.5px var(--nv-font-mono);padding:9px 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 14%, transparent)">+ Add exercise</Interactive>
      )}

      <div style={css("margin-top:36px;padding-top:16px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)")}>
        {!v.routineDeleteConfirm ? (
          <Interactive as="span" onClick={v.requestDeleteRoutine} base="cursor:pointer;font:400 10.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 30%, transparent)" hoverStyle="color:var(--nv-warn)">Delete routine</Interactive>
        ) : (
          <div style={css("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
            <span style={css("font-size:12px;color:var(--nv-warn)")}>Delete "{v.openRoutineName}" and unschedule it? History stays.</span>
            <Interactive as="span" onClick={v.confirmDeleteRoutine} base="cursor:pointer;font:500 10px var(--nv-font-mono);padding:6px 12px;border-radius:6px;background:color-mix(in srgb, var(--nv-warn) 15%, transparent);color:var(--nv-warn);border:1px solid color-mix(in srgb, var(--nv-warn) 40%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-warn) 25%, transparent)">CONFIRM DELETE</Interactive>
            <Interactive as="span" onClick={v.cancelDeleteRoutine} base="cursor:pointer;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-ink)">cancel</Interactive>
          </div>
        )}
      </div>
    </>
  );
}

function SessionView({ v }) {
  return (
    <>
      <h1 style={css("margin:18px 0 0;font:700 28px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>{v.sessionRoutineName}{v.sessionEditing && <span style={css("font:italic 400 26px var(--nv-font-serif);color:var(--nv-gold)")}> — editing the record.</span>}</h1>
      <div style={css("margin-top:4px;font:400 11px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{v.sessionEditing ? 'Untick anything that didn’t actually happen — only ticked sets stay in history.' : 'Session in progress — sets auto-fill from last time. Only ticked sets are saved.'}</div>

      <div style={css("margin-top:20px;display:flex;flex-direction:column;gap:14px")}>
        {v.sessionExercises.map((e) => (
          <div key={e.exerciseId} style={css("border:1px solid color-mix(in srgb, var(--nv-ink) 09%, transparent);border-radius:12px;padding:16px 18px;background:rgba(255,255,255,.02)")}>
            <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap")}>
              <span style={css("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
                <span style={css("font-size:15px;font-weight:500")}>{e.name}</span>
                {e.coachLabel && <span title={e.coachEvidence || ''} style={css("font:500 8.5px var(--nv-font-mono);letter-spacing:.12em;padding:2px 7px;border-radius:5px;color:var(--nv-cy);border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);background:color-mix(in srgb, var(--nv-cy) 08%, transparent)")}>{e.coachLabel}</span>}
              </span>
              <span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{e.targetLabel}{e.weightHint ? ` · Coach: ${e.weightHint}` : ''}</span>
            </div>
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:8px")}>
              <div style={css("display:flex;gap:10px;font:500 9px var(--nv-font-mono);letter-spacing:.1em;color:color-mix(in srgb, var(--nv-ink) 35%, transparent);padding:0 2px")}>
                <span style={{ width: '22px' }}>SET</span>{!e.isBodyweight && <span style={{ width: '64px' }}>{e.weightLabel}</span>}<span style={{ width: '64px' }}>{e.amountLabel}</span><span style={{ width: '52px' }}>RPE</span>
              </div>
              {e.sets.map((s, i) => (
                <div key={i} style={css("display:flex;align-items:center;gap:10px")}>
                  <span style={{ width: '22px', font: "400 11px var(--nv-font-mono)", color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>{i + 1}</span>
                  {/* gym-proof: number pad instead of the full keyboard, and the
                      tick — the app's most-repeated tap — at a 40px target */}
                  {!e.isBodyweight && <input type="number" inputMode="decimal" step="0.5" min="0" value={s.weight} onChange={s.onWeight} style={setInputStyle} />}
                  <input type="number" inputMode="numeric" min="0" value={s.reps} onChange={s.onReps} style={setInputStyle} />
                  {/* optional effort — RPE 1-10; the best autoregulation signal the Coach can get */}
                  <input type="number" inputMode="decimal" step="0.5" min="1" max="10" value={s.rpe || ''} onChange={s.onRpe} placeholder="RPE" style={{ ...setInputStyle, width: '52px', opacity: s.rpe ? 1 : 0.65 }} />
                  <Interactive
                    as="span"
                    onClick={s.onToggleDone}
                    base={{ cursor: 'pointer', width: '40px', height: '40px', margin: '-6px 0', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700,
                      border: s.done ? '1px solid var(--nv-cy)' : '1px solid color-mix(in srgb, var(--nv-ink) 25%, transparent)', background: s.done ? 'var(--nv-cy)' : 'transparent', color: '#0a2830' }}
                  >{s.done ? '✓' : ''}</Interactive>
                  {s.canRemove && (
                    <Interactive as="span" onClick={s.onRemove} base="cursor:pointer;width:36px;height:36px;margin:-4px 0;display:flex;align-items:center;justify-content:center;font-size:16px;color:color-mix(in srgb, var(--nv-ink) 30%, transparent)" hoverStyle="color:var(--nv-warn)">×</Interactive>
                  )}
                </div>
              ))}
            </div>
            <Interactive as="span" onClick={e.onAddSet} base="cursor:pointer;display:inline-block;margin-top:10px;font:500 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-gold)">+ Extra set</Interactive>
          </div>
        ))}
      </div>

      <div style={css("margin-top:24px;display:flex;gap:14px;align-items:center;flex-wrap:wrap")}>
        <Interactive as="span" onClick={v.finishSession} base="cursor:pointer;font:500 11px var(--nv-font-mono);padding:11px 22px;border-radius:9px;background:var(--nv-cy);color:#0a2830" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 80%, white)">{v.sessionEditing ? 'SAVE CHANGES' : 'FINISH WORKOUT'}</Interactive>
        {v.canSaveForLater && (
          <Interactive as="span" onClick={v.saveForLater} base="cursor:pointer;font:500 10.5px var(--nv-font-mono);padding:11px 18px;border-radius:9px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 12%, transparent)">SAVE FOR LATER</Interactive>
        )}
        {!v.sessionCancelConfirm ? (
          <Interactive as="span" onClick={v.requestCancelSession} base="cursor:pointer;font:400 10.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-warn)">Cancel session</Interactive>
        ) : (
          <>
            <span style={css("font-size:12px;color:var(--nv-warn)")}>Discard this session?</span>
            <Interactive as="span" onClick={v.discardSession} base="cursor:pointer;font:500 10px var(--nv-font-mono);padding:6px 12px;border-radius:6px;background:color-mix(in srgb, var(--nv-warn) 15%, transparent);color:var(--nv-warn);border:1px solid color-mix(in srgb, var(--nv-warn) 40%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-warn) 25%, transparent)">DISCARD</Interactive>
            <Interactive as="span" onClick={v.cancelSessionCancel} base="cursor:pointer;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-ink)">keep going</Interactive>
          </>
        )}
      </div>
    </>
  );
}

function HistoryView({ v }) {
  return (
    <>
      <Interactive as="span" onClick={v.backFromWorkoutHistory} base="cursor:pointer;display:inline-block;margin-top:18px;font:500 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 50%, transparent)" hoverStyle="color:var(--nv-gold)">← BACK</Interactive>
      <h1 style={css("margin:10px 0 0;font:700 28px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>{v.historyRoutineName} <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>history.</span></h1>

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
                <span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>{s.totalSets} sets · {s.totalVolume}kg volume</span>
              </div>
              <div style={css("margin-top:8px;display:flex;flex-direction:column;gap:3px")}>
                {s.exercises.map((e, i) => (
                  <div key={i} style={css("font-size:12px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}><span style={css("color:var(--nv-ink)")}>{e.name}:</span> {e.setsLabel}</div>
                ))}
              </div>
              <div style={css("margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap")}>
                <Interactive as="span" onClick={s.onEdit} base="cursor:pointer;font:500 9.5px var(--nv-font-mono);letter-spacing:.08em;padding:4px 11px;border-radius:6px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy)" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 08%, transparent)">EDIT</Interactive>
                {!s.deleteConfirm ? (
                  <Interactive as="span" onClick={s.requestDelete} base="cursor:pointer;font:400 9.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 30%, transparent);padding:4px 6px" hoverStyle="color:var(--nv-warn)">Delete</Interactive>
                ) : (
                  <>
                    <span style={css("font-size:11.5px;color:var(--nv-warn)")}>Remove this session from history?</span>
                    <Interactive as="span" onClick={s.confirmDelete} base="cursor:pointer;font:500 9.5px var(--nv-font-mono);padding:4px 11px;border-radius:6px;background:color-mix(in srgb, var(--nv-warn) 15%, transparent);color:var(--nv-warn);border:1px solid color-mix(in srgb, var(--nv-warn) 40%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-warn) 25%, transparent)">CONFIRM</Interactive>
                    <Interactive as="span" onClick={s.cancelDelete} base="cursor:pointer;font:400 9.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent)" hoverStyle="color:var(--nv-ink)">keep</Interactive>
                  </>
                )}
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
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Push day, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>week six.</span></h1>
      <div style={css("display:flex;gap:8px;margin-top:18px;overflow-x:auto;padding-bottom:4px")}>
        {v.week.map((d) => (
          <div key={d.day} style={d.style}><div style={css("font:500 9px var(--nv-font-mono);letter-spacing:.14em")}>{d.day}</div><div style={css("margin-top:4px;font-size:11.5px")}>{d.label}</div></div>
        ))}
      </div>
      <div style={v.gridWork}>
        <div style={css("border:1px solid var(--nv-edge);border-radius:var(--nv-radius);padding:20px 24px;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec),0 14px 34px -20px rgba(0,0,0,.9)")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
            <span style={css("font:italic 400 20px var(--nv-font-serif);color:var(--nv-gold)")}>Today's session</span>
            <span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.planMeta}</span>
          </div>
          {v.planNoteOn && (
            <div style={css("margin-top:12px;display:flex;align-items:center;gap:9px;font-size:12px;color:var(--nv-cy);border:1px solid color-mix(in srgb, var(--nv-cy) 25%, transparent);border-radius:8px;padding:8px 12px;background:color-mix(in srgb, var(--nv-cy) 05%, transparent);animation:fadeUp .3s ease-out")}><span>◆</span><span>{v.planNote}</span></div>
          )}
          <div style={css("margin-top:14px;display:flex;flex-direction:column")}>
            {v.plan.map((ex) => (
              <div key={ex.idx} style={css("display:flex;align-items:baseline;gap:14px;padding:11px 0;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)")}>
                <span style={css("font:500 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-gold) 60%, transparent);width:20px")}>{ex.idx}</span>
                <span style={css("font-size:14px;font-weight:500")}>{ex.name}</span>
                {ex.pr && <span style={css("font:500 9px var(--nv-font-mono);letter-spacing:.1em;color:var(--nv-gold);border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);border-radius:5px;padding:2px 7px")}>PR WATCH</span>}
                <span style={css("margin-left:auto;font:400 12px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 60%, transparent);font-variant-numeric:tabular-nums")}>{ex.scheme}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={css("border:1px solid color-mix(in srgb, var(--nv-cy) 18%, transparent);border-radius:14px;padding:20px 22px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 05%, transparent),color-mix(in srgb, var(--nv-cy) 01%, transparent));box-shadow:inset 0 1px 0 var(--nv-spec);display:flex;flex-direction:column;min-height:420px")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
            <span style={css("font:italic 400 20px var(--nv-font-serif);color:var(--nv-cy)")}>Ask Coach</span>
            <span style={css("font:400 9px var(--nv-font-mono);letter-spacing:.18em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>EDITS WRITE BACK TO VAULT</span>
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
              base="flex:1;background:rgba(0,0,0,.32);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none"
              focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 50%, transparent)"
            />
            <Interactive as="span" onClick={v.sendCoach} base="cursor:pointer;display:flex;align-items:center;font:500 11px var(--nv-font-mono);padding:0 16px;border-radius:9px;background:var(--nv-cy);color:#0a2830" hoverStyle="background:color-mix(in srgb, var(--nv-cy) 80%, white)">SEND</Interactive>
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
          <span style={css("font:500 11px var(--nv-font-mono);letter-spacing:.14em;color:var(--nv-acc)")}>IX.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px var(--nv-font-mono);letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>VAULT · TRAINING</span>
        </div>
        {v.usingLiveWorkouts ? (
          <span style={css("display:flex;align-items:center;gap:8px;font:500 10px var(--nv-font-mono);letter-spacing:.14em;color:var(--nv-cy)")}><span style={css("width:5px;height:5px;border-radius:50%;background:var(--nv-cy);animation:novaPulse 2s infinite")}></span>{v.workoutHeaderLabel}</span>
        ) : (
          <span style={css("font:400 10px var(--nv-font-mono);letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.workoutsDemo ? 'DEMO PLAN — CONNECT A BACKEND IN SETTINGS' : 'SYNCING…'}</span>
        )}
      </div>

      {/* the scripted demo plan renders ONLY in demo mode — a connected session
          whose workouts haven't loaded says so instead of showing fiction */}
      {v.workoutsDemo && !v.usingLiveWorkouts && <MockWorkouts v={v} />}
      {!v.workoutsDemo && !v.usingLiveWorkouts && (
        <div style={css("margin-top:60px;text-align:center;font-size:13px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>
          Workouts haven't loaded from the vault yet.<br />If this persists, check the connection in Settings — Nova never shows placeholder training data on a live connection.
        </div>
      )}
      {v.usingLiveWorkouts && v.workoutsView === 'routines' && <RoutinesView v={v} />}
      {v.usingLiveWorkouts && v.workoutsView === 'routine' && <RoutineDetailView v={v} />}
      {v.usingLiveWorkouts && v.workoutsView === 'session' && <SessionView v={v} />}
      {v.usingLiveWorkouts && v.workoutsView === 'history' && <HistoryView v={v} />}
    </div>
  );
}
