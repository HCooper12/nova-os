import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

// The Stash — categorised links to come back to: restock a product (the
// skincare shelf), revisit a reference, reopen anything with a URL. Backed by
// Wiki/Library/Stash.md; grouped cards render natively in every design style.

const M = 'var(--nv-font-mono)';
const R = 'var(--nv-font-ui)';
const inputBase = "box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 13px;color:var(--nv-ink);font-family:var(--nv-font-ui);outline:none";

export function Stash({ v }) {
  return (
    <div style={v.wrapStash} data-screen-label="Stash">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css(`font:500 11px ${M};letter-spacing:.14em;color:var(--nv-acc)`)}>XIII.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css(`font:500 10px ${M};letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)`)}>VAULT · STASH</span>
        </div>
        <span style={css(`font:400 10px ${M};letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)`)}>{v.stashHeaderLabel}</span>
      </div>
      <h1 style={css(`margin:18px 0 0;font:700 30px/1.1 ${R};letter-spacing:.02em`)}>Stash it, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>find it fast.</span></h1>
      <div style={css("margin-top:8px;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);max-width:600px;line-height:1.6")}>
        Products to restock, links to revisit — grouped so the skincare shelf is two taps from anywhere. Lives in your vault; edit it in Obsidian too.
      </div>

      {v.stashConnected && (
        <div className="nv-pane" style={{ marginTop: '20px', padding: '16px 18px' }}>
          <div style={css(`font:500 9.5px ${M};letter-spacing:.22em;color:var(--nv-gold)`)}>ADD A LINK</div>
          <div style={css("margin-top:11px;display:flex;gap:8px;flex-wrap:wrap")}>
            <span style={css("flex:1 1 150px;min-width:0")}>
              <input list="stash-cats" value={v.stashAddCategory} onChange={v.setStashField('stashAddCategory')} placeholder="Category — e.g. Skincare"
                style={css(`width:100%;${inputBase}`)} />
              <datalist id="stash-cats">{v.stashCategoryNames.map((c) => <option key={c} value={c} />)}</datalist>
            </span>
            <input value={v.stashAddName} onChange={v.setStashField('stashAddName')} placeholder="Name — e.g. CeraVe Foaming Cleanser"
              style={css(`flex:1 1 200px;min-width:0;${inputBase}`)} />
          </div>
          <div style={css("margin-top:8px;display:flex;gap:8px;flex-wrap:wrap")}>
            <input value={v.stashAddUrl} onChange={v.setStashField('stashAddUrl')} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="Link — paste the product / page URL" style={css(`flex:2 1 240px;min-width:0;${inputBase}`)} />
            <input value={v.stashAddNote} onChange={v.setStashField('stashAddNote')} placeholder="Note (optional) — e.g. restock monthly"
              style={css(`flex:1 1 150px;min-width:0;${inputBase}`)} />
            <Interactive as="span" onClick={v.stashAddBusy ? undefined : v.submitStashAdd}
              base={{ cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', font: `600 10.5px ${M}`, letterSpacing: '.08em', padding: '0 18px', borderRadius: '9px', background: 'var(--nv-gold)', color: '#1a1322', opacity: v.stashAddBusy ? 0.5 : 1 }}
              hoverStyle={{ filter: 'brightness(1.08)' }}>{v.stashAddBusy ? 'STASHING…' : 'STASH IT'}</Interactive>
          </div>
          {v.stashAddError && <div style={css("margin-top:8px;font-size:12px;color:var(--nv-warn)")}>{v.stashAddError}</div>}
        </div>
      )}

      {v.stashLoaded && v.stashCategories.length === 0 && (
        <div style={css("margin-top:40px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
          Nothing stashed yet — add your first link above (try the skincare restock list).
        </div>
      )}

      {v.stashCategories.map((cat) => (
        <div key={cat.name} style={{ marginTop: '22px' }}>
          <div style={css(`font:500 9.5px ${M};letter-spacing:.22em;color:var(--nv-gold)`)}>{cat.name.toUpperCase()} · {cat.items.length}</div>
          <div className="nv-pane" style={{ marginTop: '8px', padding: '3px 0', overflow: 'hidden' }}>
            {cat.items.map((it, i) => (
              <div key={it.raw} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}>
                <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0, flex: 1, textDecoration: 'none' }}>
                  <span style={{ display: 'block', font: `550 15px ${R}`, letterSpacing: '-.01em', color: 'var(--nv-ink)' }}>{it.name}</span>
                  <span style={{ display: 'block', marginTop: '1px', font: `400 11px ${M}`, color: 'var(--nv-ink40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.host}{it.note ? ` · ${it.note}` : ''}
                  </span>
                </a>
                <a href={it.url} target="_blank" rel="noopener noreferrer"
                  style={css(`flex:none;font:600 10px ${M};letter-spacing:.08em;padding:7px 14px;border-radius:999px;text-decoration:none;color:var(--nv-acc);border:1px solid var(--nv-acc-border);background:var(--nv-acc-bg)`)}>OPEN ↗</a>
                {it.confirming ? (
                  <span style={css("flex:none;display:flex;gap:8px;align-items:center")}>
                    <Interactive as="span" onClick={it.remove} base={css(`cursor:pointer;font:600 9px ${M};padding:5px 10px;border-radius:6px;background:color-mix(in srgb, var(--nv-warn) 15%, transparent);color:var(--nv-warn);border:1px solid color-mix(in srgb, var(--nv-warn) 40%, transparent)`)}>REMOVE</Interactive>
                    <Interactive as="span" onClick={it.cancelRemove} base={css(`cursor:pointer;font:400 9px ${M};color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>keep</Interactive>
                  </span>
                ) : (
                  <Interactive as="span" onClick={it.askRemove} aria-label={`Remove ${it.name}`}
                    base={css("cursor:pointer;flex:none;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 30%, transparent);padding:4px 6px")}
                    hoverStyle={{ color: 'var(--nv-warn)' }}>×</Interactive>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
