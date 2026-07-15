import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

export function Shopping({ v }) {
  return (
    <div style={v.wrapShopping} data-screen-label="Shopping List">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:italic 400 18px 'Instrument Serif',serif;color:#d8b573")}>VI.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,rgba(216,181,115,.7),rgba(216,181,115,.1))")}></span>
          <span style={css("font:500 10px 'JetBrains Mono',monospace;letter-spacing:.32em;color:rgba(236,229,218,.55)")}>VAULT · SHOPPING LIST</span>
        </div>
        <span style={css("font:400 10px 'JetBrains Mono',monospace;letter-spacing:.12em;color:rgba(236,229,218,.45)")}>{v.shoppingHeaderLabel}</span>
      </div>
      <h1 style={css("margin:18px 0 0;font:400 38px/1.1 'Instrument Serif',serif")}>Shop <span style={css("font-style:italic;color:#d8b573")}>once, cleanly.</span></h1>

      <div style={css("margin-top:20px;display:flex;gap:8px;align-items:flex-start")}>
        <textarea
          value={v.shoppingAddInput}
          onChange={v.setShoppingAddInput}
          disabled={v.shoppingAddBusy}
          placeholder={"Add an item… one per line for several\ne.g. spatula\npancake mix\nsoft drink"}
          style={css("flex:1;box-sizing:border-box;height:60px;resize:vertical;background:rgba(0,0,0,.3);border:1px solid rgba(236,229,218,.12);border-radius:8px;padding:10px 14px;color:#ece5da;font-size:13px;font-family:'Instrument Sans',sans-serif;line-height:1.5;outline:none")}
        />
        <Interactive
          as="span"
          onClick={v.shoppingAddBusy ? undefined : v.submitShoppingAdd}
          base={{ cursor: 'pointer', display: 'flex', alignItems: 'center', height: '60px', font: "500 10.5px 'JetBrains Mono',monospace", padding: '0 16px', borderRadius: '8px', background: '#d8b573', color: '#1a1322', opacity: v.shoppingAddBusy ? .6 : 1 }}
          hoverStyle={{ background: '#e6c98f' }}
        >
          {v.shoppingAddBusy ? 'ADDING…' : '+ ADD'}
        </Interactive>
      </div>
      {v.shoppingAddError && (
        <div style={css("margin-top:8px;font-size:12px;color:#e29b9b")}>{v.shoppingAddError}</div>
      )}

      {v.shoppingCategories.length === 0 ? (
        <div style={css("margin-top:60px;text-align:center;font-size:13px;color:rgba(236,229,218,.4)")}>
          Nothing on the list yet — add ingredients from a recipe, or type something above.
        </div>
      ) : (
        <div style={css("margin-top:26px;display:flex;flex-direction:column;gap:24px")}>
          {v.shoppingCategories.map((cat) => (
            <div key={cat.name}>
              <div style={css("font:500 9.5px 'JetBrains Mono',monospace;letter-spacing:.22em;color:#d8b573")}>{cat.name.toUpperCase()}</div>
              <div style={css("margin-top:10px;display:flex;flex-direction:column")}>
                {cat.items.map((item) => (
                  <Interactive
                    key={item.id}
                    as="div"
                    onClick={item.onToggle}
                    base="cursor:pointer;display:flex;align-items:center;gap:13px;padding:10px 6px;border-bottom:1px solid rgba(236,229,218,.06);border-radius:6px"
                    hoverStyle={{ background: 'rgba(255,255,255,.025)' }}
                  >
                    <span style={item.checkboxStyle}>{item.checked ? '✓' : ''}</span>
                    <div style={css("flex:1")}>
                      <div style={item.nameStyle}>{item.name}</div>
                      {item.source && (
                        <div style={css("font-size:10.5px;color:rgba(236,229,218,.35);margin-top:2px")}>from {item.source}</div>
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
            base="cursor:pointer;font:500 11px 'JetBrains Mono',monospace;padding:10px 18px;border-radius:8px;background:#6be5f5;color:#0a2830"
            hoverStyle={{ background: '#9deefa' }}
          >
            Confirm completion — {v.shoppingCheckedCount} collected
          </Interactive>
        </div>
      )}
    </div>
  );
}
