import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Shopping({ v }) {
  return (
    <div style={v.wrapShopping} data-screen-label="Shopping List">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px var(--nv-font-mono);letter-spacing:.14em;color:var(--nv-acc)")}>VII.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px var(--nv-font-mono);letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>VAULT · SHOPPING LIST</span>
        </div>
        <span style={css("font:400 10px var(--nv-font-mono);letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.shoppingHeaderLabel}</span>
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Shop <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>once, cleanly.</span></h1>

      <div style={css("margin-top:20px;display:flex;gap:8px;align-items:flex-start")}>
        <textarea
          value={v.shoppingAddInput}
          onChange={v.setShoppingAddInput}
          disabled={v.shoppingAddBusy}
          placeholder={"Add an item… one per line for several\ne.g. spatula\npancake mix\nsoft drink"}
          style={css("flex:1;box-sizing:border-box;height:60px;resize:vertical;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:10px 14px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-ui);line-height:1.5;outline:none")}
        />
        <Interactive
          as="span"
          onClick={v.shoppingAddBusy ? undefined : v.submitShoppingAdd}
          base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', height: '60px', font: "500 10.5px var(--nv-font-mono)", padding: '0 16px', borderRadius: '8px', background: 'var(--nv-gold)', color: '#1a1322', opacity: v.shoppingAddBusy ? .6 : 1 }}
          hoverStyle={{ background: 'color-mix(in srgb, var(--nv-gold) 85%, white)' }}
        >
          {v.shoppingAddBusy ? 'ADDING…' : '+ ADD'}
        </Interactive>
      </div>
      {v.shoppingAddError && (
        <div style={css("margin-top:8px;font-size:12px;color:var(--nv-warn)")}>{v.shoppingAddError}</div>
      )}

      {v.shoppingCategories.length === 0 ? (
        <div style={css("margin-top:60px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>
          Nothing on the list yet — add ingredients from a recipe, or type something above.
        </div>
      ) : (
        <div style={css("margin-top:26px;display:flex;flex-direction:column;gap:24px")}>
          {v.shoppingCategories.map((cat) => (
            <div key={cat.name}>
              <div style={css("font:500 9.5px var(--nv-font-mono);letter-spacing:.22em;color:var(--nv-gold)")}>{cat.name.toUpperCase()}</div>
              {/* Apple layout: the category becomes one grouped card of rows */}
              <div className={v.structured ? 'nv-pane' : undefined} style={v.structured ? { marginTop: '8px', padding: '3px 0', overflow: 'hidden' } : css("margin-top:10px;display:flex;flex-direction:column")}>
                {cat.items.map((item) => (
                  <Interactive
                    key={item.id}
                    as="div"
                    onClick={item.onToggle}
                    base={v.structured
                      ? 'cursor:pointer;display:flex;align-items:center;gap:13px;padding:11px 16px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)'
                      : 'cursor:pointer;display:flex;align-items:center;gap:13px;padding:10px 6px;border-bottom:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent);border-radius:6px'}
                    hoverStyle={{ background: 'rgba(255,255,255,.025)' }}
                  >
                    <span style={item.checkboxStyle}>{item.checked ? '✓' : ''}</span>
                    <div style={css("flex:1")}>
                      <div style={item.nameStyle}>{item.name}</div>
                      {item.source && (
                        <div style={css("font-size:10.5px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent);margin-top:2px")}>from {item.source}</div>
                      )}
                    </div>
                  </Interactive>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {v.shoppingCheckedCount > 0 && (
        <div style={css("margin-top:28px;display:flex;justify-content:flex-end")}>
          <Interactive
            as="span"
            onClick={v.confirmShoppingCompletion}
            base="cursor:pointer;font:500 11px var(--nv-font-mono);padding:10px 18px;border-radius:8px;background:var(--nv-cy);color:var(--nv-on-acc)"
            hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 80%, white)' }}
          >
            Confirm completion — {v.shoppingCheckedCount} collected
          </Interactive>
        </div>
      )}
    </div>
  );
}
