import { useRef } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';

const M = "var(--nv-font-mono)";
const R = "var(--nv-font-ui)";

// The CFO's screen: month summary + budget bars, the subscription radar,
// the ledger, and the three feed paths (capture is implicit via the Inbox;
// here live the CSV drop pipeline and the statement scanner). All writes
// ride the inbox rails — this screen only ever reads and nudges.

export function Money({ v }) {
  const fileRef = useRef(null);
  return (
    <div style={v.wrapMoney}>
      <div style={css(`font:500 10px ${M};letter-spacing:.24em;color:var(--nv-ink40)`)}>NOVA · CFO</div>
      <div style={css("display:flex;align-items:baseline;gap:14px;flex-wrap:wrap")}>
        <h1 style={css(`margin:6px 0 0;font:700 30px/1.05 ${R};letter-spacing:.02em`)}>Money</h1>
        <span style={css(`font:500 10px ${M};letter-spacing:.14em;color:var(--nv-ink40)`)}>{v.moneyHeaderLabel}</span>
        {v.moneyMonths.length > 1 && (
          <select value={v.moneyMonth} onChange={v.setMoneyMonth}
            style={{ marginLeft: 'auto', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '7px', color: 'var(--nv-ink)', font: `500 11px ${M}`, padding: '5px 8px', outline: 'none' }}>
            {v.moneyMonths.map((m) => <option key={m.value} value={m.value} style={{ background: '#141019' }}>{m.label}</option>)}
          </select>
        )}
      </div>

      {v.moneyConnected && (
        <>
          {/* summary + feeds row */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
            <div className="nv-pane" style={{ flex: '1 1 250px', padding: '16px 18px' }}>
              <div style={css(`font:500 9.5px ${M};letter-spacing:.2em;color:var(--nv-gold)`)}>THIS MONTH</div>
              <div style={css(`margin-top:8px;font:700 34px/1 ${R};font-variant-numeric:tabular-nums`)}>{v.moneySpentLabel}</div>
              <div style={css(`margin-top:6px;font:400 10.5px ${M};color:var(--nv-ink60)`)}>
                spent{v.moneySpentDelta && <span style={{ color: v.moneySpentDelta.up ? 'var(--nv-warn)' : 'var(--nv-good)' }}> · {v.moneySpentDelta.label}</span>}
                {v.moneyIncomeLabel && <span> · {v.moneyIncomeLabel} in</span>}
              </div>
              <div style={css("margin-top:12px;display:flex;gap:8px;flex-wrap:wrap")}>
                <Interactive as="span" onClick={v.moneyBusy ? undefined : v.cfoReportNow}
                  base={{ cursor: 'pointer', font: `600 10px ${M}`, letterSpacing: '.08em', padding: '5px 11px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent)', color: 'var(--nv-gold)', opacity: v.moneyBusy ? 0.5 : 1 }}
                  hoverStyle={{ background: 'color-mix(in srgb, var(--nv-gold) 08%, transparent)' }}>MONTHLY REPORT</Interactive>
                <Interactive as="span" onClick={v.moneyExport}
                  base={{ cursor: 'pointer', font: `600 10px ${M}`, letterSpacing: '.08em', padding: '5px 11px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent)', color: 'var(--nv-ink60)' }}
                  hoverStyle={{ background: 'rgba(255,255,255,.05)' }}>EXPORT {v.moneyFyLabel}</Interactive>
              </div>
            </div>

            <div className="nv-pane" style={{ flex: '1 1 300px', padding: '16px 18px' }}>
              <div style={css(`font:500 9.5px ${M};letter-spacing:.2em;color:var(--nv-cy)`)}>FEEDS</div>
              <div style={css(`margin-top:9px;font:500 11.5px/1.6 ${R};color:var(--nv-ink60)`)}>
                Drop bank CSVs into <span style={css("color:var(--nv-ink)")}>{v.moneyImportsDir}</span> in the vault (the same file Billroo takes) — checked every 5 minutes, deduped, drafted to the Inbox for approval.
              </div>
              <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
                <Interactive as="span" onClick={v.moneyBusy ? undefined : v.runMoneyImportNow}
                  base={{ cursor: 'pointer', font: `600 10px ${M}`, letterSpacing: '.08em', padding: '5px 11px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent)', color: 'var(--nv-cy)', opacity: v.moneyBusy ? 0.5 : 1 }}
                  hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 08%, transparent)' }}>{v.moneyBusy ? 'CHECKING…' : 'CHECK FOLDER NOW'}</Interactive>
                <Interactive as="span" onClick={v.moneyScanBusy ? undefined : () => fileRef.current?.click()}
                  base={{ cursor: 'pointer', font: `600 10px ${M}`, letterSpacing: '.08em', padding: '5px 11px', borderRadius: '7px', border: '1px solid color-mix(in srgb, var(--nv-vi) 45%, transparent)', color: 'var(--nv-vi)', opacity: v.moneyScanBusy ? 0.5 : 1 }}
                  hoverStyle={{ background: 'color-mix(in srgb, var(--nv-vi) 08%, transparent)' }}>{v.moneyScanBusy ? 'READING…' : '📷 SCAN STATEMENT / RECEIPT'}</Interactive>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={v.onStatementScanFiles} />
              </div>
              {v.moneyScanError && <div style={css(`margin-top:8px;font:500 11px ${R};color:var(--nv-warn)`)}>{v.moneyScanError}</div>}
              {v.moneyScanQuestion && <div style={css(`margin-top:8px;font:500 11px ${R};color:var(--nv-gold)`)}>Nova asks: {v.moneyScanQuestion}</div>}
              <div style={css(`margin-top:9px;font:400 10px ${M};color:color-mix(in srgb, var(--nv-ink) 35%, transparent)`)}>Typing "coffee 6.50" into any capture surface files here too.</div>
            </div>
          </div>

          {/* categories + subscriptions */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
            {v.moneyCategories.length > 0 && (
              <div className="nv-pane" style={{ flex: '1.2 1 320px', padding: '16px 18px' }}>
                <div style={css(`font:500 9.5px ${M};letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)`)}>BY CATEGORY · TAP TO SET A BUDGET</div>
                <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:9px")}>
                  {v.moneyCategories.map((c) => (
                    <Interactive key={c.category} onClick={c.setBudget} base={{ cursor: 'pointer', borderRadius: '8px', padding: '6px 8px' }} hoverStyle={{ background: 'rgba(255,255,255,.04)' }}>
                      <div style={css("display:flex;justify-content:space-between;gap:10px;align-items:baseline")}>
                        <span style={css(`font:600 13px ${R}`)}>{c.category}</span>
                        <span style={css(`font:500 11px ${M};font-variant-numeric:tabular-nums;color:${c.over ? 'var(--nv-warn)' : 'var(--nv-ink)'}`)}>{c.spentLabel}{c.budgetLabel && <span style={css("color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}> {c.budgetLabel}</span>}</span>
                      </div>
                      {c.pct != null && (
                        <div style={css("margin-top:4px;height:3px;border-radius:2px;background:color-mix(in srgb, var(--nv-ink) 10%, transparent)")}>
                          <div style={{ width: `${c.pct}%`, height: '100%', borderRadius: '2px', background: c.over ? 'var(--nv-warn)' : 'var(--nv-cy)' }}></div>
                        </div>
                      )}
                      <div style={css(`margin-top:3px;font:400 9.5px ${M};color:color-mix(in srgb, var(--nv-ink) 35%, transparent)`)}>{c.prevLabel}</div>
                    </Interactive>
                  ))}
                </div>
              </div>
            )}

            <div className="nv-pane" style={{ flex: '1 1 300px', padding: '16px 18px' }}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
                <span style={css(`font:500 9.5px ${M};letter-spacing:.2em;color:var(--nv-vi)`)}>SUBSCRIPTION RADAR</span>
                {v.moneySubsMonthly && <span style={css(`font:400 9px ${M};color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>~{v.moneySubsMonthly} ON MONTHLIES</span>}
              </div>
              {v.moneySubscriptions.length === 0 ? (
                <div style={css(`margin-top:10px;font:500 11.5px/1.6 ${R};color:var(--nv-ink60)`)}>Nothing recurring detected yet — it takes two charges from the same merchant at a steady interval.</div>
              ) : (
                <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:9px")}>
                  {v.moneySubscriptions.map((s) => (
                    <div key={s.key} style={css("display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent);background:var(--nv-well)")}>
                      <div style={css("display:flex;justify-content:space-between;gap:10px;align-items:baseline")}>
                        <span style={css(`font:600 13px ${R}`)}>{s.merchant}</span>
                        <span style={css(`font:500 11px ${M};font-variant-numeric:tabular-nums`)}>{s.amountLabel}</span>
                      </div>
                      <div style={css(`font:400 9.5px ${M};color:${s.soon ? 'var(--nv-gold)' : 'color-mix(in srgb, var(--nv-ink) 40%, transparent)'}`)}>{s.cadence} · {s.nextLabel}</div>
                      {s.priceRise && <div style={css(`font:500 9.5px ${M};color:var(--nv-warn)`)}>PRICE RISE {s.priceRise}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ledger */}
          <div className="nv-pane" style={{ marginTop: '12px', padding: '16px 18px' }}>
            <div style={css(`font:500 9.5px ${M};letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)`)}>LEDGER</div>
            <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
              <input value={v.moneyAddMerchant} onChange={v.setMoneyAddMerchant} onKeyDown={v.moneyAddKey} placeholder="Merchant / description"
                style={{ flex: '2 1 180px', minWidth: 0, background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: `500 12.5px ${R}`, padding: '9px 12px', outline: 'none' }} />
              <input value={v.moneyAddAmount} onChange={v.setMoneyAddAmount} onKeyDown={v.moneyAddKey} placeholder="0.00" type="number" inputMode="decimal" step="0.01" min="0"
                style={{ flex: '0 1 110px', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: `500 12.5px ${M}`, padding: '9px 12px', outline: 'none' }} />
              <Interactive as="span" onClick={v.toggleMoneyAddSign}
                base={{ cursor: 'pointer', font: `600 10px ${M}`, letterSpacing: '.08em', padding: '8px 12px', borderRadius: '8px', border: '1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent)', color: v.moneyAddIsSpend ? 'var(--nv-warn)' : 'var(--nv-good)' }}
              >{v.moneyAddIsSpend ? 'SPEND' : 'MONEY IN'}</Interactive>
              <Interactive as="span" onClick={v.moneyBusy ? undefined : v.submitMoneyAdd}
                base={{ cursor: 'pointer', font: `600 10.5px ${M}`, letterSpacing: '.08em', padding: '9px 16px', borderRadius: '8px', background: 'var(--nv-cy)', color: 'var(--nv-on-acc)', opacity: v.moneyBusy ? 0.5 : 1 }}
                hoverStyle={{ filter: 'brightness(1.08)' }}>ADD</Interactive>
            </div>
            {v.moneyTransactions.length === 0 ? (
              <div style={css(`margin-top:14px;font:500 12px ${R};color:color-mix(in srgb, var(--nv-ink) 45%, transparent)`)}>The ledger is empty — capture an expense, drop a bank CSV, or scan a receipt.</div>
            ) : (
              <div style={css("margin-top:12px;display:flex;flex-direction:column")}>
                {v.moneyTransactions.map((t) => (
                  <div key={t.id} style={css("display:flex;align-items:center;gap:10px;padding:7px 4px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)")}>
                    <span style={css(`flex:none;width:42px;font:400 10px ${M};color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>{t.date}</span>
                    <span style={css(`flex:1;min-width:0;font:500 13px ${R};overflow-wrap:anywhere`)}>{t.merchant}{t.note && <span style={css("color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}> — {t.note}</span>}</span>
                    {t.editingCategory ? (
                      <select autoFocus value={t.category} onChange={t.pickCategory} onBlur={() => {}}
                        style={{ flex: 'none', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent)', borderRadius: '6px', color: 'var(--nv-ink)', font: `500 9.5px ${M}`, padding: '3px 6px', outline: 'none' }}>
                        {v.moneyAllCategories.map((c) => <option key={c} value={c} style={{ background: '#141019' }}>{c}</option>)}
                      </select>
                    ) : (
                      <Interactive as="span" onClick={t.startEditCategory}
                        base={{ cursor: 'pointer', flex: 'none', font: `500 8.5px ${M}`, letterSpacing: '.1em', padding: '3px 8px', borderRadius: '5px', color: 'color-mix(in srgb, var(--nv-ink) 55%, transparent)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)' }}
                        hoverStyle={{ borderColor: 'color-mix(in srgb, var(--nv-cy) 40%, transparent)', color: 'var(--nv-cy)' }}
                      >{t.category.toUpperCase()}</Interactive>
                    )}
                    <span title={t.source} style={css(`flex:none;width:86px;text-align:right;font:500 12px ${M};font-variant-numeric:tabular-nums;color:${t.isSpend ? 'var(--nv-ink)' : 'var(--nv-good)'}`)}>{t.amountLabel}</span>
                    <Interactive as="span" onClick={t.remove} aria-label={`Remove ${t.merchant}`}
                      base={{ cursor: 'pointer', flex: 'none', fontSize: '11px', color: 'color-mix(in srgb, var(--nv-ink) 25%, transparent)', padding: '2px 4px' }}
                      hoverStyle={{ color: 'var(--nv-warn)' }}>✕</Interactive>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
