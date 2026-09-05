import { css } from '../css.js';
import { SwipeRow } from '../SwipeRow.jsx';
import { Interactive } from '../Interactive.jsx';
import { Eyebrow, TextAction, Chip, Tag, Meta, isAppleStyle } from '../Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx
const btn = (bg, ink, extra = {}) => (isAppleStyle()
  ? { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '600 15px var(--nv-font-ui)', letterSpacing: '-.01em', padding: '10px 18px', borderRadius: '999px', background: bg, color: ink, ...extra }
  : { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: 'var(--nv-micro-l)', textTransform: 'uppercase', padding: '9px 16px', borderRadius: '8px', background: bg, color: ink, ...extra });

const M = "var(--nv-font-mono)";
const R = "var(--nv-font-ui)";

// The To-Do screen — the vault To-Do page as a checklist. Open items first,
// done items dimmed below; the composer writes the same line format the
// capture filer uses, so every writer stays interchangeable.

export function Todos({ v }) {
  return (
    <div style={v.wrapTodos}>
      <Eyebrow>Nova · To-Do</Eyebrow>
      <div style={css("display:flex;align-items:baseline;gap:14px;flex-wrap:wrap")}>
        <h1 style={css(`margin:6px 0 0;font:700 30px/1.05 ${R};letter-spacing:.02em`)}>To-Do</h1>
        <Meta tone="faint">{v.todosHeaderLabel}</Meta>
      </div>

      {v.todosConnected && (
        <div className="nv-pane" style={{ marginTop: '18px', padding: '14px 16px' }}>
          <div style={css("display:flex;gap:10px;align-items:center")}>
            <input
              value={v.todoInput}
              onChange={v.setTodoInput}
              onKeyDown={v.todoInputKey}
              placeholder="Add a to-do — Enter files it here, in Obsidian, and in Todoist"
              style={{ flex: 1, minWidth: 0, background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '9px', color: 'var(--nv-ink)', font: `500 13.5px ${R}`, padding: '11px 14px', outline: 'none' }}
            />
            <Interactive as="span" onClick={v.submitTodo}
              base={btn('var(--nv-cy)', 'var(--nv-on-acc)', { flex: 'none', padding: isAppleStyle() ? '11px 18px' : '11px 18px' })}
              hoverStyle={{ filter: 'brightness(1.08)' }}
            >Add</Interactive>
          </div>
          {v.todosSyncNote && (
            <Meta as="div" tone="faint" style={{ marginTop: '9px' }}>{v.todosSyncNote}</Meta>
          )}
        </div>
      )}

      {v.todosLoaded && v.todosOpenCountNum === 0 && v.todosConnected && (
        <div style={css("margin-top:26px;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>Nothing open — capture a thought anywhere and Nova files the action here.</div>
      )}

      {v.todosOpenGroups.map((g) => (
        <div key={g.key} style={{ marginTop: '20px' }}>
          <Eyebrow>{g.label} · {g.items.length}</Eyebrow>
          {/* Apple layout: one grouped card with hairline rows; classic keeps a pane per item. Same nodes either way. */}
          <div className={v.structured ? 'nv-pane' : undefined} style={v.structured ? { marginTop: '8px', padding: '3px 0', overflow: 'hidden' } : css("margin-top:8px;display:flex;flex-direction:column;gap:8px")}>
            {g.items.map((t, ti) => (
              /* swipe right to complete — the same proven primitive as the
                 Inbox (a gesture that locks vertical can never commit; see
                 swipeCore.js + its tests). borderRadius:0 in the grouped
                 layout so the wrapper doesn't break the hairline card. */
              <SwipeRow
                key={t.key}
                right={{ label: 'DONE', icon: '✓', tone: 'var(--nv-good)', run: t.toggle }}
                style={v.structured ? { borderRadius: 0 } : undefined}
              >
              <div className={v.structured ? undefined : 'nv-pane'} style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: v.structured ? '11px 16px' : '12px 15px', borderTop: v.structured && ti > 0 ? '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' : 'none' }}>
                <Interactive as="span" onClick={t.toggle} aria-label={`Mark "${t.text}" done`}
                  base={{ cursor: 'pointer', width: '21px', height: '21px', flex: 'none', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-cy) 45%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 12%, transparent)' }}
                ></Interactive>
                <span style={css(`flex:1;min-width:0;font:500 14.5px ${R};overflow-wrap:anywhere`)}>{t.text}</span>
                {t.editingCategory ? (
                  <select autoFocus value={t.category || ''} onChange={t.pickCategory}
                    style={{ flex: 'none', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent)', borderRadius: '6px', color: 'var(--nv-ink)', font: 'var(--nv-micro-s)', padding: '3px 6px', outline: 'none' }}>
                    {!t.category && <option value="" style={{ background: '#141019' }}>—</option>}
                    {v.todoCategories.map((c) => <option key={c.value} value={c.value} style={{ background: '#141019' }}>{c.label}</option>)}
                  </select>
                ) : (
                  <TextAction compact tone="quiet" onClick={t.startEditCategory} title="Change category (syncs to Todoist as a label)" style={{ flex: 'none' }}>{t.categoryLabel}</TextAction>
                )}
                {t.stale && <Tag tone="gold" style={{ flex: 'none' }}>Stale</Tag>}
                <Meta tone="faint" style={{ flex: 'none' }}>{t.addedLabel}</Meta>
              </div>
              </SwipeRow>
            ))}
          </div>
        </div>
      ))}

      {v.todosDone.length > 0 && (
        <div style={{ marginTop: '26px' }}>
          <Eyebrow>Done · {v.todosDone.length} — the compost loop sweeps these</Eyebrow>
          <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:6px")}>
            {v.todosDone.map((t) => (
              <div key={t.key} style={css("display:flex;align-items:center;gap:13px;padding:9px 15px;border-radius:11px;border:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent);opacity:.55")}>
                <Interactive as="span" onClick={t.toggle} aria-label={`Reopen "${t.text}"`}
                  base={{ cursor: 'pointer', width: '21px', height: '21px', flex: 'none', borderRadius: '7px', border: '1px solid var(--nv-cy)', background: 'var(--nv-cy)', color: 'var(--nv-on-acc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}
                >✓</Interactive>
                <span style={css(`flex:1;min-width:0;font:500 13.5px ${R};text-decoration:line-through;overflow-wrap:anywhere`)}>{t.text}</span>
                <Meta tone="faint" style={{ flex: 'none', opacity: .8 }}>{t.addedLabel}</Meta>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
