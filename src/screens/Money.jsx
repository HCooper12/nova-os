import { useRef } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { Eyebrow, TextAction, Chip, Tag, Meta, isAppleStyle } from '../Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx
const btn = (bg, ink, extra = {}) => (isAppleStyle()
  ? { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: '600 15px var(--nv-font-ui)', letterSpacing: '-.01em', padding: '10px 18px', borderRadius: '999px', background: bg, color: ink, ...extra }
  : { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: 'var(--nv-micro-l)', textTransform: 'uppercase', padding: '9px 16px', borderRadius: '8px', background: bg, color: ink, ...extra });

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
      <Eyebrow>Nova · CFO</Eyebrow>
      <div style={css("display:flex;align-items:baseline;gap:14px;flex-wrap:wrap")}>
        <h1 style={css(`margin:6px 0 0;font:700 30px/1.05 ${R};letter-spacing:.02em`)}>Money</h1>
        <Meta tone="faint">{v.moneyHeaderLabel}</Meta>
        {v.moneyMonths.length > 1 && (
          <select value={v.moneyMonth} onChange={v.setMoneyMonth}
            style={{ marginLeft: 'auto', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 15%, transparent)', borderRadius: '7px', color: 'var(--nv-ink)', font: 'var(--nv-micro-l)', padding: '5px 8px', outline: 'none' }}>
            {v.moneyMonths.map((m) => <option key={m.value} value={m.value} style={{ background: '#141019' }}>{m.label}</option>)}
          </select>
        )}
      </div>

      {v.moneyConnected && (
        <>
          {/* summary + feeds row */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
            <div className="nv-pane" style={{ flex: '1 1 250px', padding: '16px 18px' }}>
              <Eyebrow tone="gold">This month</Eyebrow>
              <div style={css(`margin-top:8px;font:700 34px/1 ${R};font-variant-numeric:tabular-nums`)}>{v.moneySpentLabel}</div>
              <Meta as="div" tone="quiet" style={{ marginTop: '6px' }}>
                spent{v.moneySpentDelta && <span style={{ color: v.moneySpentDelta.up ? 'var(--nv-warn)' : 'var(--nv-good)' }}> · {v.moneySpentDelta.label}</span>}
                {v.moneyIncomeLabel && <span> · {v.moneyIncomeLabel} in</span>}
              </Meta>
              <div style={css("margin-top:12px;display:flex;gap:8px;flex-wrap:wrap")}>
                <Chip tone="gold" disabled={v.moneyBusy} onClick={v.moneyBusy ? undefined : v.cfoReportNow}>Monthly report</Chip>
                <Chip tone="quiet" onClick={v.moneyExport}>Export {v.moneyFyLabel}</Chip>
              </div>
            </div>

            <div className="nv-pane" style={{ flex: '1 1 300px', padding: '16px 18px' }}>
              <Eyebrow tone="cyan">Feeds</Eyebrow>
              <div style={css(`margin-top:9px;font:500 11.5px/1.6 ${R};color:var(--nv-ink60)`)}>
                Drop bank CSVs into <span style={css("color:var(--nv-ink)")}>{v.moneyImportsDir}</span> in the vault (the same file Billroo takes) — checked every 5 minutes, deduped, drafted to the Inbox for approval.
              </div>
              <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
                <Chip tone="cyan" disabled={v.moneyBusy} onClick={v.moneyBusy ? undefined : v.runMoneyImportNow}>{v.moneyBusy ? 'Checking…' : 'Check folder now'}</Chip>
                <Chip tone="violet" disabled={v.moneyScanBusy} onClick={v.moneyScanBusy ? undefined : () => fileRef.current?.click()}>{v.moneyScanBusy ? 'Reading…' : '📷 Scan statement / receipt'}</Chip>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={v.onStatementScanFiles} />
              </div>
              {v.moneyScanError && <div style={css(`margin-top:8px;font:500 11px ${R};color:var(--nv-warn)`)}>{v.moneyScanError}</div>}
              {v.moneyScanQuestion && <div style={css(`margin-top:8px;font:500 11px ${R};color:var(--nv-gold)`)}>Nova asks: {v.moneyScanQuestion}</div>}
              <Meta as="div" tone="faint" style={{ marginTop: '9px', textTransform: 'none', letterSpacing: 0 }}>Typing "coffee 6.50" into any capture surface files here too.</Meta>
            </div>
          </div>

          {/* categories + subscriptions */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
            {v.moneyCategories.length > 0 && (
              <div className="nv-pane" style={{ flex: '1.2 1 320px', padding: '16px 18px' }}>
                <Eyebrow>By category · tap to set a budget</Eyebrow>
                <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:9px")}>
                  {v.moneyCategories.map((c) => (
                    <Interactive key={c.category} onClick={c.setBudget} base={{ cursor: 'pointer', borderRadius: '8px', padding: '6px 8px' }} hoverStyle={{ background: 'rgba(255,255,255,.04)' }}>
                      <div style={css("display:flex;justify-content:space-between;gap:10px;align-items:baseline")}>
                        <span style={css(`font:600 13px ${R}`)}>{c.category}</span>
                        <span style={css(`font:var(--nv-micro-l);font-variant-numeric:tabular-nums;color:${c.over ? 'var(--nv-warn)' : 'var(--nv-ink)'}`)}>{c.spentLabel}{c.budgetLabel && <span style={css("color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}> {c.budgetLabel}</span>}</span>
                      </div>
                      {c.pct != null && (
                        <div style={css("margin-top:4px;height:3px;border-radius:2px;background:color-mix(in srgb, var(--nv-ink) 10%, transparent)")}>
                          <div style={{ width: `${c.pct}%`, height: '100%', borderRadius: '2px', background: c.over ? 'var(--nv-warn)' : 'var(--nv-cy)' }}></div>
                        </div>
                      )}
                      <Meta as="div" tone="faint" style={{ marginTop: '3px', textTransform: 'none', letterSpacing: 0 }}>{c.prevLabel}</Meta>
                    </Interactive>
                  ))}
                </div>
              </div>
            )}

            <div className="nv-pane" style={{ flex: '1 1 300px', padding: '16px 18px' }}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:8px")}>
                <Eyebrow as="span" tone="violet">Subscription radar</Eyebrow>
                {v.moneySubsMonthly && <Meta tone="faint">~{v.moneySubsMonthly} on monthlies</Meta>}
              </div>
              {v.moneySubscriptions.length === 0 ? (
                <div style={css(`margin-top:10px;font:500 11.5px/1.6 ${R};color:var(--nv-ink60)`)}>Nothing recurring detected yet — it takes two charges from the same merchant at a steady interval.</div>
              ) : (
                <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:9px")}>
                  {v.moneySubscriptions.map((s) => (
                    <div key={s.key} style={css("display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-ink) 07%, transparent);background:var(--nv-well)")}>
                      <div style={css("display:flex;justify-content:space-between;gap:10px;align-items:baseline")}>
                        <span style={css(`font:600 13px ${R}`)}>{s.merchant}</span>
                        <span style={css(`font:var(--nv-micro-l);font-variant-numeric:tabular-nums`)}>{s.amountLabel}</span>
                      </div>
                      <Meta as="div" tone={s.soon ? 'gold' : 'faint'} style={{ textTransform: 'none', letterSpacing: 0 }}>{s.cadence} · {s.nextLabel}</Meta>
                      {s.priceRise && <Tag tone="warn" style={{ alignSelf: 'flex-start', marginTop: '2px' }}>Price rise {s.priceRise}</Tag>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ledger */}
          <div className="nv-pane" style={{ marginTop: '12px', padding: '16px 18px' }}>
            <Eyebrow>Ledger</Eyebrow>
            <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
              <input value={v.moneyAddMerchant} onChange={v.setMoneyAddMerchant} onKeyDown={v.moneyAddKey} placeholder="Merchant / description"
                style={{ flex: '2 1 180px', minWidth: 0, background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: `500 12.5px ${R}`, padding: '9px 12px', outline: 'none' }} />
              <input value={v.moneyAddAmount} onChange={v.setMoneyAddAmount} onKeyDown={v.moneyAddKey} placeholder="0.00" type="number" inputMode="decimal" step="0.01" min="0"
                style={{ flex: '0 1 110px', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)', borderRadius: '8px', color: 'var(--nv-ink)', font: `500 12.5px ${M}`, padding: '9px 12px', outline: 'none' }} />
              <Chip tone={v.moneyAddIsSpend ? 'warn' : 'good'} onClick={v.toggleMoneyAddSign}>{v.moneyAddIsSpend ? 'Spend' : 'Money in'}</Chip>
              <Interactive as="span" onClick={v.moneyBusy ? undefined : v.submitMoneyAdd}
                base={btn('var(--nv-cy)', 'var(--nv-on-acc)', { opacity: v.moneyBusy ? 0.5 : 1 })}
                hoverStyle={{ filter: 'brightness(1.08)' }}>Add</Interactive>
            </div>
            {v.moneyTransactions.length === 0 ? (
              <div style={css(`margin-top:14px;font:500 12px ${R};color:color-mix(in srgb, var(--nv-ink) 45%, transparent)`)}>The ledger is empty — capture an expense, drop a bank CSV, or scan a receipt.</div>
            ) : (
              <div style={css("margin-top:12px;display:flex;flex-direction:column")}>
                {v.moneyListNote && (
                  <Eyebrow style={{ padding: '0 4px 6px' }}>{v.moneyListNote}</Eyebrow>
                )}
                {v.moneyTransactions.map((t) => (
                  <div key={t.id} style={css("display:flex;align-items:center;gap:10px;padding:7px 4px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)")}>
                    <Meta tone="faint" style={{ flex: 'none', width: '42px' }}>{t.date}</Meta>
                    <span style={css(`flex:1;min-width:0;font:500 13px ${R};overflow-wrap:anywhere`)}>{t.merchant}{t.note && <span style={css("color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}> — {t.note}</span>}</span>
                    {t.editingCategory ? (
                      <select autoFocus value={t.category} onChange={t.pickCategory} onBlur={() => {}}
                        style={{ flex: 'none', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent)', borderRadius: '6px', color: 'var(--nv-ink)', font: 'var(--nv-micro-m)', padding: '3px 6px', outline: 'none' }}>
                        {v.moneyAllCategories.map((c) => <option key={c} value={c} style={{ background: '#141019' }}>{c}</option>)}
                      </select>
                    ) : (
                      <TextAction compact tone="quiet" onClick={t.startEditCategory} style={{ flex: 'none' }}>{t.category}</TextAction>
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
