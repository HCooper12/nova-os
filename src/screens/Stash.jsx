import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { Eyebrow, TextAction, Chip, isAppleStyle, ScreenHead, Meta, Button } from '../Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx

// The Stash — categorised links to come back to: restock a product (the
// skincare shelf), revisit a reference, reopen anything with a URL. Backed by
// Wiki/Library/Stash.md; grouped cards render natively in every design style.

const R = 'var(--nv-font-ui)';
const inputBase = "box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 13px;color:var(--nv-ink);font-family:var(--nv-font-ui);outline:none";

export function Stash({ v }) {
  return (
    <div style={v.wrapStash} data-screen-label="Stash">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <ScreenHead numeral="XIII." label="Vault · Stash" />
        <Meta tone="faint">{v.stashHeaderLabel}</Meta>
      </div>
      <h1 style={css(`margin:18px 0 0;font:700 30px/1.1 ${R};letter-spacing:var(--nv-display-track)`)}>Stash it, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>find it fast.</span></h1>
      <div style={css("margin-top:8px;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);max-width:600px;line-height:1.6")}>
        Products to restock, links to revisit — grouped so the skincare shelf is two taps from anywhere. Lives in your vault; edit it in Obsidian too.
      </div>

      {v.stashConnected && (
        <div className="nv-pane" style={{ marginTop: '20px', padding: '16px 18px' }}>
          <Eyebrow tone="gold">Add a link</Eyebrow>
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
            <Button onClick={v.submitStashAdd} disabled={v.stashAddBusy}
              style={{ flex: 'none', display: 'flex', padding: '0 18px' }}>{v.stashAddBusy ? 'Stashing…' : 'Stash it'}</Button>
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
          <Eyebrow tone="gold">{cat.name} · {cat.items.length}</Eyebrow>
          <div className="nv-pane" style={{ marginTop: '8px', padding: '3px 0', overflow: 'hidden' }}>
            {cat.items.map((it, i) => (
              <div key={it.raw} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent)' }}>
                <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0, flex: 1, textDecoration: 'none' }}>
                  <span style={{ display: 'block', font: `550 15px ${R}`, letterSpacing: '-.01em', color: 'var(--nv-ink)' }}>{it.name}</span>
                  <span style={{ display: 'block', marginTop: '1px', font: 'var(--nv-micro-l)', color: 'var(--nv-ink40)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.host}{it.note ? ` · ${it.note}` : ''}
                  </span>
                </a>
                <a href={it.url} target="_blank" rel="noopener noreferrer"
                  style={isAppleStyle()
                    ? { flex: 'none', font: '600 13.5px var(--nv-font-ui)', padding: '7px 14px', borderRadius: '999px', textDecoration: 'none', color: 'var(--nv-acc)', background: 'color-mix(in srgb, var(--nv-acc) 14%, transparent)' }
                    : css(`flex:none;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);padding:7px 14px;border-radius:999px;text-decoration:none;color:var(--nv-acc);border:1px solid var(--nv-acc-border);background:var(--nv-acc-bg)`)}>{isAppleStyle() ? 'Open ↗' : 'OPEN ↗'}</a>
                {it.confirming ? (
                  <span style={css("flex:none;display:flex;gap:8px;align-items:center")}>
                    <Chip tone="warn" active onClick={it.remove}>Remove</Chip>
                    <TextAction compact tone="faint" onClick={it.cancelRemove}>Keep</TextAction>
                  </span>
                ) : (
                  /* 20x24 was under the 28pt floor (measured 23 Sep). Same
                     glyph, a target a thumb can actually land on. */
                  <Interactive as="span" onClick={it.askRemove} aria-label={`Remove ${it.name}`}
                    base={css("cursor:pointer;flex:none;font-size:15px;line-height:1;color:color-mix(in srgb, var(--nv-ink) 30%, transparent);display:flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;border-radius:50%")}
                    hoverStyle={{ color: 'var(--nv-warn)', background: 'color-mix(in srgb, var(--nv-warn) 10%, transparent)' }}>×</Interactive>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
