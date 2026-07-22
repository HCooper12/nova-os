import { css } from './css.js';
import { Interactive } from './Interactive.jsx';

// The next two weeks as an agenda grouped by day — Nova's broader calendar view.
// Changes are made through the "Ask Nova" box (move/cancel), so this is read-only.
export function CalendarView({ v }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Calendar" onClick={v.close} style={css("position:fixed;inset:0;background:rgba(8,5,12,.82);backdrop-filter:blur(6px);z-index:80;display:flex;align-items:center;justify-content:center;padding:18px;overflow-y:auto")}>
      <div onClick={(e) => e.stopPropagation()} style={css("width:560px;max-width:96vw;max-height:92vh;overflow-y:auto;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-glass2);backdrop-filter:blur(22px);box-shadow:0 40px 90px -30px rgba(0,0,0,.95);padding:22px 24px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:center")}>
          <span style={css("font:500 9.5px 'IBM Plex Mono',monospace;letter-spacing:.22em;color:var(--nv-cy)")}>CALENDAR · NEXT 14 DAYS</span>
          <Interactive as="span" onClick={v.close} base="cursor:pointer;font:500 11px 'IBM Plex Mono',monospace;color:var(--nv-ink60);border:1px solid var(--nv-edge);border-radius:7px;padding:5px 10px" hoverStyle="color:var(--nv-ink)">ESC</Interactive>
        </div>

        {!v.loaded && <div style={css("margin-top:18px;font-size:12px;color:var(--nv-ink40)")}>Loading your calendar…</div>}
        {v.loaded && v.days.length === 0 && <div style={css("margin-top:18px;font-size:12px;color:var(--nv-ink40)")}>Nothing scheduled in the next two weeks.</div>}

        <div style={css("margin-top:16px;display:flex;flex-direction:column;gap:16px")}>
          {v.days.map((day) => (
            <div key={day.date}>
              <div style={{ font: "600 10px 'IBM Plex Mono',monospace", letterSpacing: '.14em', color: day.isToday ? 'var(--nv-cy)' : 'var(--nv-ink40)', paddingBottom: '6px', borderBottom: '1px solid var(--nv-edge)' }}>
                {day.isToday ? 'TODAY · ' : ''}{day.label.toUpperCase()}
              </div>
              <div style={css("margin-top:8px;display:flex;flex-direction:column;gap:6px")}>
                {day.events.map((e, i) => (
                  <div key={i} style={css("display:flex;gap:12px;align-items:baseline")}>
                    <span style={{ font: "500 10.5px 'IBM Plex Mono',monospace", fontVariantNumeric: 'tabular-nums', width: '52px', flex: 'none', color: 'var(--nv-ink60)' }}>{e.time}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '13.5px', color: 'var(--nv-ink)' }}>
                      {e.label}
                      {e.recurring && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--nv-ink40)' }}>↻</span>}
                    </span>
                    {e.calendar && <span style={{ flex: 'none', font: "500 8.5px 'IBM Plex Mono',monospace", letterSpacing: '.05em', padding: '2px 7px', borderRadius: '5px', color: `rgba(${e.hue},.9)`, background: `rgba(${e.hue},.12)`, textTransform: 'uppercase' }}>{e.calendar}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={css("margin-top:16px;font-size:11px;line-height:1.55;color:var(--nv-ink40)")}>To change anything, tell Nova on Home — “move gym to Friday 6pm”, “cancel the 3pm”. Repeating events (↻) can’t be moved yet.</div>
      </div>
    </div>
  );
}
