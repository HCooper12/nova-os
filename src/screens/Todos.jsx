import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

const M = "'IBM Plex Mono',monospace";
const R = "'Rajdhani',sans-serif";

// The To-Do screen — the vault To-Do page as a checklist. Open items first,
// done items dimmed below; the composer writes the same line format the
// capture filer uses, so every writer stays interchangeable.

export function Todos({ v }) {
  return (
    <div style={v.wrapTodos}>
      <div style={css(`font:500 10px ${M};letter-spacing:.24em;color:var(--nv-ink40)`)}>NOVA · TO-DO</div>
      <div style={css("display:flex;align-items:baseline;gap:14px;flex-wrap:wrap")}>
        <h1 style={css(`margin:6px 0 0;font:700 30px/1.05 ${R};letter-spacing:.02em`)}>To-Do</h1>
        <span style={css(`font:500 10px ${M};letter-spacing:.14em;color:var(--nv-ink40)`)}>{v.todosHeaderLabel}</span>
      </div>

      {v.todosConnected && (
        <div className="nv-pane" style={{ marginTop: '18px', padding: '14px 16px' }}>
          <div style={css("display:flex;gap:10px;align-items:center")}>
            <input
              value={v.todoInput}
              onChange={v.setTodoInput}
              onKeyDown={v.todoInputKey}
              placeholder="Add a to-do — Enter files it here, in Obsidian, and in Todoist"
              style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,.3)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '9px', color: 'var(--nv-ink)', font: `500 13.5px ${R}`, padding: '11px 14px', outline: 'none' }}
            />
            <Interactive as="span" onClick={v.todoBusy ? undefined : v.submitTodo}
              base={{ cursor: 'pointer', flex: 'none', font: `600 10.5px ${M}`, letterSpacing: '.08em', padding: '11px 18px', borderRadius: '9px', background: 'var(--nv-cy)', color: '#0a2830', opacity: v.todoBusy ? 0.5 : 1 }}
              hoverStyle={{ filter: 'brightness(1.08)' }}
            >{v.todoBusy ? 'ADDING…' : 'ADD'}</Interactive>
          </div>
          {v.todosSyncNote && (
            <div style={css(`margin-top:9px;font:400 10px ${M};color:color-mix(in srgb, var(--nv-ink) 35%, transparent)`)}>{v.todosSyncNote}</div>
          )}
        </div>
      )}

      {v.todosLoaded && v.todosOpen.length === 0 && v.todosConnected && (
        <div style={css("margin-top:26px;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>Nothing open — capture a thought anywhere and Nova files the action here.</div>
      )}

      <div style={css("margin-top:18px;display:flex;flex-direction:column;gap:8px")}>
        {v.todosOpen.map((t) => (
          <div key={t.key} className="nv-pane" style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '12px 15px' }}>
            <Interactive as="span" onClick={t.toggle} aria-label={`Mark "${t.text}" done`}
              base={{ cursor: 'pointer', width: '21px', height: '21px', flex: 'none', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-cy) 45%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 12%, transparent)' }}
            ></Interactive>
            <span style={css(`flex:1;min-width:0;font:500 14.5px ${R};overflow-wrap:anywhere`)}>{t.text}</span>
            {t.stale && <span style={css(`flex:none;font:500 8px ${M};letter-spacing:.12em;padding:2px 7px;border-radius:5px;color:var(--nv-gold);border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent)`)}>STALE</span>}
            <span style={css(`flex:none;font:400 9.5px ${M};color:color-mix(in srgb, var(--nv-ink) 35%, transparent)`)}>{t.addedLabel}</span>
          </div>
        ))}
      </div>

      {v.todosDone.length > 0 && (
        <div style={{ marginTop: '26px' }}>
          <div style={css(`font:500 9.5px ${M};letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>DONE · {v.todosDone.length} — THE COMPOST LOOP SWEEPS THESE</div>
          <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:6px")}>
            {v.todosDone.map((t) => (
              <div key={t.key} style={css("display:flex;align-items:center;gap:13px;padding:9px 15px;border-radius:11px;border:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent);opacity:.55")}>
                <Interactive as="span" onClick={t.toggle} aria-label={`Reopen "${t.text}"`}
                  base={{ cursor: 'pointer', width: '21px', height: '21px', flex: 'none', borderRadius: '7px', border: '1px solid var(--nv-cy)', background: 'var(--nv-cy)', color: '#0a2830', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}
                >✓</Interactive>
                <span style={css(`flex:1;min-width:0;font:500 13.5px ${R};text-decoration:line-through;overflow-wrap:anywhere`)}>{t.text}</span>
                <span style={css(`flex:none;font:400 9.5px ${M};color:color-mix(in srgb, var(--nv-ink) 30%, transparent)`)}>{t.addedLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
