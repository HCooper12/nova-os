import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { Eyebrow, ScreenHead, Meta, Button } from '../Controls.jsx';
import { StashSummary } from './StashSummary.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx

// The Stash — categorised links to come back to: restock a product (the
// skincare shelf), revisit a reference, reopen anything with a URL. Backed by
// Wiki/Library/Stash.md; grouped cards render natively in every design style.

const R = 'var(--nv-font-ui)';
const inputBase = "box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 13px;color:var(--nv-ink);font-family:var(--nv-font-ui);outline:none";

// Under the `summary` style (his phone) the page is the redesign: mockups
// 84 + 88 + 90 and his five additions (StashSummary.jsx, 10 Oct 2026). Under
// cupertino and command this classic page stays, on the same write path
// (a pill with Undo), with one target per row (the lists audit, finding 6).
export function Stash({ v }) {
  if (v.summary && v.stashSum) return <StashSummary v={v} />;
  return <StashClassic v={v} />;
}

function StashClassic({ v }) {
  return (
    <div style={v.wrapStash} data-screen-label="Stash">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <ScreenHead numeral="XIII." label="Vault · Stash" />
        <Meta tone="faint">{v.stashHeaderLabel}</Meta>
      </div>
      <h1 style={css(`margin:18px 0 0;font:700 30px/1.1 ${R};letter-spacing:var(--nv-display-track)`)}>Stash it, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>find it fast.</span></h1>
      <div style={css("margin-top:8px;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);max-width:600px;line-height:1.6")}>
        Products to restock and links to revisit, grouped so any shelf is two taps from anywhere. Lives in your vault; edit it in Obsidian too.
      </div>

      {v.stashConnected && (
        <div className="nv-pane" style={{ marginTop: '20px', padding: '16px 18px' }}>
          <Eyebrow tone="gold">Add a link</Eyebrow>
          <div style={css("margin-top:11px;display:flex;gap:8px;flex-wrap:wrap")}>
            <span style={css("flex:1 1 150px;min-width:0")}>
              <input list="stash-cats" value={v.stashAddCategory} onChange={v.setStashField('stashAddCategory')} placeholder="Shelf, for example Kitchen"
                style={css(`width:100%;${inputBase}`)} />
              <datalist id="stash-cats">{v.stashCategoryNames.map((c) => <option key={c} value={c} />)}</datalist>
            </span>
            <input value={v.stashAddName} onChange={v.setStashField('stashAddName')} placeholder="Name, for example Desk lamp"
              style={css(`flex:1 1 200px;min-width:0;${inputBase}`)} />
          </div>
          <div style={css("margin-top:8px;display:flex;gap:8px;flex-wrap:wrap")}>
            <input value={v.stashAddUrl} onChange={v.setStashField('stashAddUrl')} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="Link: paste the page address" style={css(`flex:2 1 240px;min-width:0;${inputBase}`)} />
            <input value={v.stashAddNote} onChange={v.setStashField('stashAddNote')} placeholder="Note (optional)"
              style={css(`flex:1 1 150px;min-width:0;${inputBase}`)} />
            <Button onClick={v.submitStashAdd} disabled={v.stashAddBusy}
              style={{ flex: 'none', display: 'flex', padding: '0 18px' }}>{v.stashAddBusy ? 'Stashing…' : 'Stash it'}</Button>
          </div>
          {v.stashAddError && <div style={css("margin-top:8px;font-size:12px;color:var(--nv-warn)")}>{v.stashAddError}</div>}
        </div>
      )}

      {v.stashLoaded && v.stashCategories.length === 0 && (
        <div style={css("margin-top:40px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
          Nothing stashed yet. Add your first link above.
        </div>
      )}

      {v.stashCategories.map((cat) => (
        <div key={cat.name} style={{ marginTop: '22px' }}>
          <Eyebrow tone="gold">{cat.name} · {cat.items.length}</Eyebrow>
          <div className="nv-pane" style={{ marginTop: '8px', padding: '3px 0', overflow: 'hidden' }}>
            {cat.items.map((it, i) => (
              <div key={it.raw} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}>
                <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0, flex: 1, textDecoration: 'none', minHeight: '44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span style={{ display: 'block', font: `550 15px ${R}`, letterSpacing: '-.01em', color: 'var(--nv-ink)' }}>{it.name}</span>
                  <span style={{ display: 'block', marginTop: '1px', font: 'var(--nv-micro-l)', color: 'var(--nv-ink40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.host}{it.note ? ` · ${it.note}` : ''}
                  </span>
                </a>
                {/* one target per row: the row opens the link; × removes it with a
                    pill and Undo (no inline confirm: the pill is the way back) */}
                <Interactive as="span" onClick={it.remove} aria-label={`Remove ${it.name}`}
                  base={css("cursor:pointer;flex:none;font-size:17px;line-height:1;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border-radius:50%")}
                  hoverStyle={{ color: 'var(--nv-warn)', background: 'color-mix(in srgb, var(--nv-warn) 10%, transparent)' }}>×</Interactive>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
