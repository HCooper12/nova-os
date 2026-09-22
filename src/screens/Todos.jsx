import { css } from '../css.js';
import { SwipeRow } from '../SwipeRow.jsx';
import { Interactive } from '../Interactive.jsx';
import { Eyebrow, TextAction, Meta, Button } from '../Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx

const R = "var(--nv-font-ui)";

// The To-Do screen — the vault To-Do page as a checklist. Open items first,
// done items dimmed below; the composer writes the same line format the
// capture filer uses, so every writer stays interchangeable.

export function Todos({ v }) {
  return (
    <div style={v.wrapTodos}>
      <Eyebrow>Nova · To-Do</Eyebrow>
      <div style={css("display:flex;align-items:baseline;gap:14px;flex-wrap:wrap")}>
        <h1 style={css(`margin:6px 0 0;font:700 30px/1.05 ${R};letter-spacing:var(--nv-display-track)`)}>To-Do</h1>
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
            <Button onClick={v.submitTodo} style={{ flex: 'none' }}>Add</Button>
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
              {/* AGE, DRAWN RATHER THAN LABELLED. A hairline on the leading
                  edge that deepens from a fortnight old to six weeks, and the
                  age itself warms with it — so a column of old items reads as
                  a gradient instead of a row of identical gold badges. */}
              <div className={v.structured ? undefined : 'nv-pane'} style={{ display: 'flex', alignItems: 'flex-start', gap: '13px', padding: v.structured ? '11px 16px' : '12px 15px', borderTop: v.structured && ti > 0 ? '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' : 'none', boxShadow: t.staleness > 0 ? `inset 2px 0 0 color-mix(in srgb, var(--nv-gold) ${Math.round(30 + t.staleness * 60)}%, transparent)` : undefined }}>
                {/* THE BOX STAYS 21px; THE TARGET IS 44. Measured at 375px the
                    tappable area was the box itself — 21x21, below even the
                    28pt floor accessibility.md sets, on the control he uses
                    most on this screen. Padding grows the target and a
                    matching negative margin keeps the layout identical, which
                    is the standard way to buy a target without redrawing. */}
                <Interactive as="span" onClick={t.toggle} aria-label={`Mark "${t.text}" done`}
                  base={{ cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '11px', margin: '-11px -11px -11px -11px', borderRadius: '50%' }}
                  hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 10%, transparent)' }}
                >
                  <span style={{ width: '21px', height: '21px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-cy) 45%, transparent)', display: 'block' }} />
                </Interactive>
                {/* THE TITLE GETS THE ROW (23 Sep 2026). It used to share one
                    flex line with a category action, a badge and an age, all
                    `flex:none` — about 230px of a 370px row — so a three-word
                    task broke mid-character ("swipe verificatio / n item") and
                    a pasted URL wrapped to nine lines. The title now owns its
                    own full-width line and the two pieces of metadata sit
                    under it, which is how a Mail or Reminders row is built.
                    `anywhere` is reserved for the one string that needs it: a
                    URL has no spaces to break at, but words do. */}
                <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
                  <span title={t.isLink ? t.text : undefined} style={css(`font:500 15px ${R};word-break:break-word`)}>{t.display}</span>
                  <span style={css('display:flex;align-items:center;gap:8px;min-width:0')}>
                    {t.editingCategory ? (
                      <select autoFocus value={t.category || ''} onChange={t.pickCategory}
                        style={{ flex: 'none', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent)', borderRadius: '6px', color: 'var(--nv-ink)', font: 'var(--nv-micro-s)', padding: '3px 6px', outline: 'none' }}>
                        {!t.category && <option value="" style={{ background: '#141019' }}>—</option>}
                        {v.todoCategories.map((c) => <option key={c.value} value={c.value} style={{ background: '#141019' }}>{c.label}</option>)}
                      </select>
                    ) : (
                      <TextAction compact tone="quiet" onClick={t.startEditCategory} title="Change category (syncs to Todoist as a label)" style={{ flex: 'none' }}>{t.categoryLabel}</TextAction>
                    )}
                    <Meta tone="faint" style={{ flex: 'none' }}>·</Meta>
                    <Meta tone={t.staleness > 0 ? 'gold' : 'faint'} style={{ flex: 'none', opacity: t.staleness > 0 ? 0.65 + t.staleness * 0.35 : 1 }} title={t.staleness > 0 ? 'Open longer than a fortnight' : undefined}>{t.addedLabel}</Meta>
                  </span>
                </span>
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
