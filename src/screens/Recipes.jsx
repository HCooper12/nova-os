import { useState } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { LocalInput } from '../LocalInput.jsx';
import { VoicePanel } from '../VoicePanels.jsx';
import { useDictation } from '../useDictation.js';

// Apple-layout twin for the eaten-today strip: same dayMacros object,
// rendered as four stat tiles instead of the inline HUD strip.
function EatenTiles({ m }) {
  const tiles = [
    { k: 'P', val: `${m.p}${m.proteinTarget ? '/' + m.proteinTarget : ''}`, sub: m.proteinPct != null ? `${m.proteinPct}% of floor` : 'grams', color: 'var(--nv-cy)' },
    { k: 'C', val: String(m.c), sub: 'grams', color: 'var(--nv-gold)' },
    { k: 'F', val: String(m.f), sub: 'grams', color: 'var(--nv-vi)' },
    { k: 'KCAL', val: `${m.kcal}${m.targetKcal ? '/' + m.targetKcal : ''}`, sub: m.targetKcal ? 'vs target' : 'eaten', color: 'var(--nv-good)' },
  ];
  return (
    <div className="nv-pane" style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '2px', padding: '10px 8px' }}>
      {tiles.map((t) => (
        <div key={t.k} style={{ padding: '4px 10px' }}>
          <div style={{ font: '600 10px var(--nv-font-ui)', letterSpacing: '.06em', color: 'var(--nv-ink60)' }}>{t.k}</div>
          <div style={{ font: '700 19px var(--nv-font-ui)', letterSpacing: '-.02em', marginTop: '2px', fontVariantNumeric: 'tabular-nums', color: t.color }}>{t.val}</div>
          <div style={{ font: '400 9.5px var(--nv-font-mono)', color: 'var(--nv-ink40)' }}>{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function Recipes({ v }) {
  // the one bar's "say it": on-device dictation straight into the log input
  const dict = useDictation(() => v.foodDescribeValue || '', (text) => v.setFoodDescribeInput(text), null);
  const [manualOpen, setManualOpen] = useState(false);
  // a photo-scan result lands its numbers in these fields — they must never
  // hide behind a collapsed disclosure while holding his data
  const manualVisible = manualOpen || !!(v.foodLogName || v.foodLogP || v.foodLogC || v.foodLogF || v.foodLogKcal);
  return (
    <div style={v.wrapRecipes} data-screen-label="Recipes">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px")}>
          <span style={css("font:500 11px var(--nv-font-mono);letter-spacing:.14em;color:var(--nv-acc)")}>VI.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css("font:500 10px var(--nv-font-mono);letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>VAULT · FUEL</span>
        </div>
        <span style={css("font:400 10px var(--nv-font-mono);letter-spacing:.12em;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>{v.recipesHeaderLabel}</span>
      </div>
      <h1 style={css("margin:18px 0 0;font:700 30px/1.1 var(--nv-font-ui);letter-spacing:.02em")}>Fuel, <span style={css("font:italic 400 27px var(--nv-font-serif);color:var(--nv-gold)")}>macros first.</span></h1>

      {/* the redesigned Fuel hero: ring + coloured macros + the gap-fill
          coach line — one glance answers "where am I, and what do I eat
          next?" (design/UI-REDESIGN-SPEC.md). Falls back to the old strip
          when no protein target exists. */}
      {v.fuelHero && (
        <div style={css("margin-top:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border:1px solid var(--nv-edge);border-radius:18px;padding:16px;background:var(--nv-glass)")}>
          <div style={{ position: 'relative', width: '104px', height: '104px', flex: 'none' }} aria-label={`Protein ${v.fuelHero.p} of ${v.fuelHero.target} grams`}>
            <svg viewBox="0 0 104 104" style={{ width: 104, height: 104, transform: 'rotate(-90deg)' }}>
              <circle cx="52" cy="52" r="45" fill="none" stroke="rgba(130,175,255,.10)" strokeWidth="8" />
              <circle cx="52" cy="52" r="45" fill="none" stroke="var(--nv-cy)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - v.fuelHero.pct / 100)}
                style={{ filter: 'drop-shadow(0 0 6px rgba(89,230,255,.55))', transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
            </svg>
            <div style={css("position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center")}>
              <b style={css("font:600 22px var(--nv-font-ui);color:var(--nv-cy);font-variant-numeric:tabular-nums")}>{v.fuelHero.p}<span style={css("font-size:11px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>g</span></b>
              <span style={css("font:600 8px var(--nv-font-mono);letter-spacing:.18em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>OF {v.fuelHero.target} P</span>
            </div>
          </div>
          <div style={css("flex:1;min-width:170px;display:flex;flex-direction:column;gap:6px")}>
            <div style={css("display:flex;justify-content:space-between;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 62%, transparent)")}>
              <span style={css("color:var(--nv-good)")}>Calories</span>
              <b style={css("color:var(--nv-ink);font-variant-numeric:tabular-nums")}>{v.fuelHero.kcal.toLocaleString()}{v.fuelHero.kcalTarget ? ` / ${v.fuelHero.kcalTarget.toLocaleString()}` : ''}</b>
            </div>
            <div style={css("display:flex;justify-content:space-between;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 62%, transparent)")}>
              <span><span style={css("color:var(--nv-gold)")}>Carbs</span> · <span style={css("color:var(--nv-vi)")}>Fat</span></span>
              <b style={css("font-variant-numeric:tabular-nums")}><span style={css("color:var(--nv-gold)")}>{v.fuelHero.c}C</span> · <span style={css("color:var(--nv-vi)")}>{v.fuelHero.f}F</span></b>
            </div>
            {v.fuelHero.kcalLeft != null && (
              <span style={css("align-self:flex-start;font:600 9px var(--nv-font-mono);letter-spacing:.1em;padding:4px 10px;border-radius:99px;border:1px solid color-mix(in srgb, var(--nv-good) 40%, transparent);color:var(--nv-good)")}>FITS {v.fuelHero.kcalLeft} KCAL LEFT</span>
            )}
            <span style={css("font-size:12px;color:color-mix(in srgb, var(--nv-ink) 62%, transparent);line-height:1.45")}>Coach: {v.fuelHero.gapText}</span>
            {v.askProteinVerdict && (
              <Interactive as="span" onClick={v.askProteinVerdict}
                base={css("align-self:flex-start;cursor:pointer;font:600 9px var(--nv-font-mono);letter-spacing:.12em;padding:5px 11px;border-radius:99px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy)")}
                hoverStyle="background:color-mix(in srgb, var(--nv-cy) 12%, transparent)">WHERE DID MY PROTEIN GO?</Interactive>
            )}
          </div>
        </div>
      )}

      {/* today so far — everything actually eaten, at a glance */}
      {!v.fuelHero && v.dayMacros && v.structured && <EatenTiles m={v.dayMacros} />}
      {!v.fuelHero && v.dayMacros && !v.structured && (
        <div style={css("margin-top:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;border:1px solid color-mix(in srgb, var(--nv-cy) 22%, transparent);border-radius:12px;padding:11px 16px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 05%, transparent),transparent)")}>
          <span style={css("font:500 9px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-cy);flex:none")}>EATEN TODAY</span>
          {v.dayMacros.proteinPct != null && (
            <span style={css("flex:none;display:flex;align-items:center;gap:7px")}>
              <span style={{ width: '30px', height: '30px', borderRadius: '50%', padding: '2px', flex: 'none', background: `conic-gradient(var(--nv-cy) ${v.dayMacros.proteinPct}%, var(--nv-edge) 0)` }}>
                <span style={css("width:100%;height:100%;border-radius:50%;background:var(--nv-glass2);display:flex;align-items:center;justify-content:center;font:600 8px var(--nv-font-mono);color:var(--nv-cy)")}>{v.dayMacros.proteinPct}%</span>
              </span>
              <span style={css("font:500 11px var(--nv-font-mono);color:var(--nv-cy)")}>{v.dayMacros.p}/{v.dayMacros.proteinTarget}g P</span>
            </span>
          )}
          {v.dayMacros.proteinPct == null && <span style={css("font:500 11px var(--nv-font-mono);color:var(--nv-cy)")}>{v.dayMacros.p}g P</span>}
          <span style={css("font:400 11px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 62%, transparent)")}>
            <span style={css("color:var(--nv-gold)")}>{v.dayMacros.c}C</span> · <span style={css("color:var(--nv-vi)")}>{v.dayMacros.f}F</span> · <span style={css("color:var(--nv-good)")}>{v.dayMacros.kcal}{v.dayMacros.targetKcal ? `/${v.dayMacros.targetKcal}` : ''} kcal</span>
          </span>
        </div>
      )}

      {/* the week, at a glance — same truth (and same renderer) as the
          voice panel; the archive is calendar-true so gaps show honestly */}
      {v.fuelWeek && (
        <div style={css("margin-top:12px")}>
          <VoicePanel panel={{ type: 'nutrition-week', data: v.fuelWeek }} />
        </div>
      )}

      {/* the cross-reference agent's card (mockup v2): training × fuel joins,
          surfaced where the eating decisions happen. Hidden when the agent
          has nothing true to say. */}
      {v.fuelCross && (
        <div style={css("margin-top:12px;border:1px solid color-mix(in srgb, var(--nv-vi) 38%, transparent);border-radius:14px;padding:14px 17px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-vi) 06%, transparent),transparent)")}>
          <div style={css("font:500 9px var(--nv-font-mono);letter-spacing:.22em;color:var(--nv-vi)")}>◈ TRAINING × FUEL — CROSS-CHECK</div>
          <div style={css("margin-top:8px;font-size:13px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)")}>{v.fuelCross.line}</div>
          <Interactive as="span" onClick={v.fuelCross.draft}
            base={css("cursor:pointer;display:inline-block;margin-top:9px;font:600 11.5px var(--nv-font-ui);color:var(--nv-vi)")}
            hoverStyle="filter:brightness(1.25)">Draft the fix with Coach →</Interactive>
        </div>
      )}

      {/* the mockup's rotation: horizontal tick-cards — the action taken 4x
          a day gets the biggest targets on the screen. One component, both
          layouts. Tick = eaten (writes the food log), name opens the recipe,
          × clears the slot. */}
      {v.rotationVisible && (
        <div style={css("margin-top:18px")}>
          <div style={css("display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin:0 2px 8px")}>
            <span style={css("font:600 9px var(--nv-font-mono);letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>TODAY'S ROTATION — TAP TO EAT · HOLD FOR MORE</span>
            <span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
              <span style={css("color:var(--nv-cy)")}>{v.rotationTotals.p}P</span> · <span style={css("color:var(--nv-gold)")}>{v.rotationTotals.c}C</span> · <span style={css("color:var(--nv-vi)")}>{v.rotationTotals.f}F</span> · <span style={css("color:var(--nv-good)")}>{v.rotationTotals.kcal}</span>
            </span>
          </div>
          <div style={css("display:flex;gap:10px;overflow-x:auto;padding:2px 2px 8px;scrollbar-width:none")}>
            {v.rotationSlots.map((s) => (
              <Interactive as="div" key={s.key} onLongPress={s.onLongPress}
                base={{ flex: '0 0 172px', borderRadius: '16px', padding: '12px', position: 'relative', cursor: s.recipeName ? 'pointer' : 'default',
                border: s.consumed ? '1px solid color-mix(in srgb, var(--nv-good) 50%, transparent)' : '1px solid var(--nv-edge)',
                background: 'var(--nv-glass)', transition: 'border-color .2s' }}>
                <span style={css(`font:600 8.5px var(--nv-font-mono);letter-spacing:.2em;color:var(--nv-vi)`)}>{s.name.toUpperCase()}</span>
                {s.recipeName ? (
                  <>
                    <Interactive as="div" onClick={s.open} base="cursor:pointer;font:600 14px var(--nv-font-ui);margin-top:3px;line-height:1.25;color:var(--nv-ink)" hoverStyle="color:var(--nv-cy)">{s.recipeName}{s.variant ? ` · ${s.variant}` : ''}</Interactive>
                    <div style={css("font:600 10px var(--nv-font-mono);margin-top:6px")}>
                      <span style={css("color:var(--nv-cy)")}>{s.p}P</span> <span style={css("color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>·</span> <span style={css("color:var(--nv-gold)")}>{s.c}C</span> <span style={css("color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>·</span> <span style={css("color:var(--nv-vi)")}>{s.f}F</span> <span style={css("color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>·</span> <span style={css("color:var(--nv-good)")}>{s.kcal}</span>
                    </div>
                    <Interactive as="span" onClick={s.toggleConsumed} aria-label={s.consumed ? 'Mark not eaten' : 'Mark eaten'}
                      base={{ cursor: 'pointer', position: 'absolute', top: '10px', right: '10px', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: s.consumed ? '1.5px solid var(--nv-good)' : '1.5px solid var(--nv-edge)',
                        background: s.consumed ? 'color-mix(in srgb, var(--nv-good) 15%, transparent)' : 'transparent',
                        boxShadow: s.consumed ? '0 0 12px -2px color-mix(in srgb, var(--nv-good) 70%, transparent)' : 'none', transition: 'all .2s' }}
                      hoverStyle={{ borderColor: 'var(--nv-good)' }}
                    >{s.consumed ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--nv-good)" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg> : null}</Interactive>
                    <div style={css("display:flex;gap:8px;margin-top:8px")}>
                      {s.clearVariant && <Interactive as="span" onClick={s.clearVariant} base="cursor:pointer;font:500 8.5px var(--nv-font-mono);color:var(--nv-gold)" hoverStyle="text-decoration:underline">UNDO VARIANT</Interactive>}
                      <Interactive as="span" onClick={s.clear} base="cursor:pointer;font:500 8.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 35%, transparent)" hoverStyle="color:var(--nv-warn)">CLEAR</Interactive>
                    </div>
                  </>
                ) : (
                  <div style={css("font:400 12px var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 35%, transparent);margin-top:8px")}>Empty — pick from the bank below (tap a recipe's {s.name[0]} chip)</div>
                )}
              </Interactive>
            ))}
            {v.rotationShowExtraButton && (
              <Interactive as="div" onClick={v.showExtraMealSlot} base={{ flex: '0 0 120px', cursor: 'pointer', borderRadius: '16px', border: '1px dashed var(--nv-edge)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '500 11px var(--nv-font-mono)', color: 'var(--nv-acc)', minHeight: '110px' }} hoverStyle={{ borderColor: 'var(--nv-acc-border)' }}>+ 4TH MEAL</Interactive>
            )}
          </div>
        </div>
      )}

      {v.foodLogVisible && (
        <div style={css("margin-top:12px;border:1px solid color-mix(in srgb, var(--nv-good) 18%, transparent);border-radius:14px;padding:16px 18px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-good) 05%, transparent),color-mix(in srgb, var(--nv-good) 01%, transparent));box-shadow:inset 0 1px 0 rgba(255,255,255,.04)")}>
          {/* mockup v2: no headline, no furniture — the bar IS the feature.
              The day strip lives BELOW it; off-plan totals ride the strip. */}
          <div style={css("display:none")}>
            {v.foodLogDays.map((d) => (
              <Interactive key={d.key} as="span" onClick={d.pick}
                base={{ cursor: 'pointer', font: "500 9px var(--nv-font-mono)", letterSpacing: '.1em', padding: '5px 10px', borderRadius: '7px',
                  border: d.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)',
                  color: d.active ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 40%, transparent)',
                  background: d.active ? 'var(--nv-acc-bg)' : 'none' }}
                hoverStyle={{ color: 'var(--nv-ink)' }}
              >{d.label}</Interactive>
            ))}
          </div>
          {v.foodLogViewingLabel && (
            <div style={css("margin-top:8px;font:500 10px var(--nv-font-mono);letter-spacing:.08em;color:var(--nv-gold)")}>{v.foodLogViewingLabel}</div>
          )}
          {/* ONE bar, four senses (mockup): type it, shoot it, scan it —
              icons inline, no separate sections. Enter or the arrow submits;
              the optional note field appears only once photos are staged. */}
          <div style={css("margin-top:12px;display:flex;gap:8px;align-items:center")}>
            {/* his report: typing a food and hitting Enter looked like it did
                nothing — because it didn't SHOW anything, even though a
                search was genuinely running. Disabled proves the tap
                registered; the caption below the bar (not the placeholder —
                the box still holds what he typed, so a placeholder swap
                would never actually be visible) is the rest of the fix. */}
            <Interactive as="input" value={v.foodDescribeInput} onChange={v.setFoodDescribeInput} onKeyDown={v.describeFoodKey}
              disabled={v.foodScanBusy}
              placeholder="Log anything — type it, shoot it, or scan it…"
              base="flex:1;min-width:0;box-sizing:border-box;background:rgba(0,0,0,.3);border:1px solid var(--nv-edge);border-radius:12px;padding:11px 14px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-ui);outline:none"
              focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            {dict.supported && (
              <Interactive as="span" onClick={dict.toggle} aria-label={dict.on ? 'Stop dictating' : 'Say it'}
                base={css(`cursor:pointer;flex:none;width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid ${dict.on ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-good) 45%, transparent)'};background:color-mix(in srgb, var(--nv-good) ${dict.on ? 22 : 10}%, transparent)`)}
                hoverStyle="background:color-mix(in srgb, var(--nv-good) 20%, transparent)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--nv-good)" strokeWidth="2.2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
              </Interactive>
            )}
            <label aria-label="Shoot or add photos" style={css("cursor:pointer;flex:none;width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid var(--nv-edge)")}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="color-mix(in srgb, var(--nv-ink) 62%, transparent)" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.4"/></svg>
              {/* no capture attr + multiple: iOS offers Take Photo OR the
                  library from the one button — shoot it AND add-photos,
                  without the fifth icon that overflowed a phone width */}
              <input type="file" accept="image/*" multiple onChange={v.addFoodScanPhotos} disabled={v.foodScanBusy} style={css("display:none")} />
            </label>
            <Interactive as="span" onClick={v.foodScanBusy ? undefined : v.openBarcodeScanner} aria-label="Scan barcode"
              base="cursor:pointer;flex:none;width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid var(--nv-edge)"
              hoverStyle="border-color:var(--nv-good)">
              <svg width="17" height="17" viewBox="0 0 24 24" stroke="color-mix(in srgb, var(--nv-ink) 62%, transparent)" strokeWidth="2"><path d="M4 6v12M8 6v12M12 6v12M15 6v12M19 6v12" fill="none"/></svg>
            </Interactive>
          </div>
          {v.foodScanBusy && (
            <div style={css("margin-top:7px;display:flex;align-items:center;gap:6px;font-size:11px;color:color-mix(in srgb, var(--nv-good) 75%, var(--nv-ink))")}>
              <span style={css("width:6px;height:6px;border-radius:50%;background:var(--nv-good);flex:none;animation:novaPulse 1.4s ease-in-out infinite")}></span>
              {v.foodScanSlow ? 'Still searching — a named product can take a moment…' : 'Searching…'}
            </div>
          )}
          {/* which day this lands on — compact, below the bar (mockup keeps
              the bar clean); off-plan totals ride along when they exist */}
          <div style={css("margin-top:9px;display:flex;gap:6px;flex-wrap:wrap;align-items:center")}>
            <span style={css("font:500 8.5px var(--nv-font-mono);letter-spacing:.14em;color:color-mix(in srgb, var(--nv-ink) 38%, transparent)")}>FOR</span>
            {v.foodLogDays.map((d) => (
              <Interactive key={d.key} as="span" onClick={d.pick}
                base={{ cursor: 'pointer', font: "500 8.5px var(--nv-font-mono)", letterSpacing: '.08em', padding: '4px 9px', borderRadius: '6px',
                  border: d.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent)',
                  color: d.active ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 38%, transparent)',
                  background: d.active ? 'var(--nv-acc-bg)' : 'none' }}
                hoverStyle={{ color: 'var(--nv-ink)' }}
              >{d.label}</Interactive>
            ))}
            {v.foodLogEntries.length > 0 && (
              <span style={css("margin-left:auto;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
                off-plan: <span style={css("color:var(--nv-cy)")}>{v.foodLogTotals.p}P</span> · <span style={css("color:var(--nv-good)")}>{v.foodLogTotals.kcal} kcal</span>
              </span>
            )}
          </div>
          {v.foodScanCount > 0 && (
            <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
              <Interactive as="input" value={v.foodScanNote} onChange={v.setFoodScanNote} placeholder="Note — e.g. “ate half” (optional)" base="flex:1;min-width:160px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 12px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            </div>
          )}
          {v.foodScanCount > 0 && (
            <div style={css("margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
              {v.foodScanPhotos.map((ph) => (
                <div key={ph.src.slice(-28)} style={css("position:relative;width:52px;height:52px;border-radius:8px;overflow:hidden;border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)")}>
                  <img src={ph.src} alt="" style={css("width:100%;height:100%;object-fit:cover;display:block")} />
                  <Interactive as="span" onClick={ph.remove} base="cursor:pointer;position:absolute;top:1px;right:1px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;border-radius:5px;background:rgba(0,0,0,.6);color:#fff" hoverStyle="background:var(--nv-warn)">×</Interactive>
                </div>
              ))}
              <Interactive as="span" onClick={v.canRunFoodScan ? v.runFoodScan : undefined} base={{ cursor: v.canRunFoodScan ? 'pointer' : 'default', flex: 'none', font: "600 11px var(--nv-font-mono)", padding: '9px 16px', borderRadius: '8px', background: 'var(--nv-good)', color: '#122015', opacity: v.foodScanBusy ? 0.6 : 1 }} hoverStyle={{ background: 'color-mix(in srgb, var(--nv-good) 80%, white)' }}>{v.foodScanBusy ? 'Analyzing…' : `Analyze ${v.foodScanCount} photo${v.foodScanCount === 1 ? '' : 's'}`}</Interactive>
            </div>
          )}
          {v.foodScanCount > 0 && <div style={css("margin-top:8px;font-size:11px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent);line-height:1.5")}>Add up to 5 — nutrition labels and/or the food itself. More photos + a note give a sharper estimate.</div>}
          {v.foodScanError && <div style={css("margin-top:8px;font-size:12px;color:#e08f6f")}>{v.foodScanError}</div>}
          {v.foodScanQuestion && (
            <div style={css("margin-top:10px;border:1px solid color-mix(in srgb, var(--nv-gold) 32%, transparent);border-radius:11px;padding:11px 13px;background:color-mix(in srgb, var(--nv-gold) 05%, transparent)")}>
              <div style={css("font-size:12.5px;line-height:1.5;color:var(--nv-gold)")}>Nova asks: <em>{v.foodScanQuestion}</em></div>
              {v.foodScanCanAnswer ? (
                <div style={css("margin-top:9px;display:flex;gap:8px;align-items:center;flex-wrap:wrap")}>
                  <Interactive as="input" value={v.foodScanAnswer} onChange={v.setFoodScanAnswer}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !v.foodScanBusy) v.answerFoodScan(); }}
                    placeholder='Answer — e.g. "ate the whole packet", "about 300g"'
                    base="flex:1;min-width:170px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 12px;color:var(--nv-ink);font-family:var(--nv-font-ui);outline:none"
                    focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)" />
                  <Interactive as="span" onClick={v.foodScanBusy || !v.foodScanAnswer.trim() ? undefined : v.answerFoodScan}
                    base={{ cursor: 'pointer', flex: 'none', font: '600 10.5px var(--nv-font-mono)', letterSpacing: '.06em', padding: '9px 14px', borderRadius: '8px', background: 'var(--nv-gold)', color: '#1a1322', opacity: v.foodScanBusy || !v.foodScanAnswer.trim() ? 0.5 : 1 }}
                    hoverStyle={{ filter: 'brightness(1.08)' }}>{v.foodScanBusy ? 'REFINING…' : 'REFINE ESTIMATE'}</Interactive>
                  <Interactive as="span" onClick={v.dismissFoodScanQuestion}
                    base="cursor:pointer;flex:none;font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 42%, transparent)"
                    hoverStyle="color:var(--nv-ink)">keep as is</Interactive>
                </div>
              ) : (
                <div style={css("margin-top:5px;font-size:11px;color:color-mix(in srgb, var(--nv-ink) 45%, transparent)")}>Adjust the numbers below if needed — saving works either way.</div>
              )}
              <div style={css("margin-top:7px;font-size:10.5px;line-height:1.5;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Answering re-reads your photos with the extra detail. Or skip it — the numbers below save exactly as they are.</div>
            </div>
          )}
          {/* manual macros are the fallback, not the feature — folded away
              (mockup: one bar, four senses; numbers only when he wants them) */}
          <Interactive as="span" onClick={() => setManualOpen(!manualOpen)}
            base="cursor:pointer;display:inline-block;margin-top:10px;font:500 9.5px var(--nv-font-mono);letter-spacing:.18em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)"
            hoverStyle="color:var(--nv-good)">{manualVisible ? '▾' : '▸'} ENTER MACROS MYSELF</Interactive>
          {manualVisible && <div style={css("margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center")}>
            <Interactive as="input" value={v.foodLogName} onChange={v.setFoodLogName} placeholder="What did you eat?" base="flex:1;min-width:140px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 12px;color:var(--nv-ink);font-size:12.5px;font-family:var(--nv-font-ui);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" inputMode="numeric" value={v.foodLogP} onChange={v.setFoodLogP} placeholder="P" base="width:52px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-cy);font-size:12.5px;font-family:var(--nv-font-mono);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" inputMode="numeric" value={v.foodLogC} onChange={v.setFoodLogC} placeholder="C" base="width:52px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-gold);font-size:12.5px;font-family:var(--nv-font-mono);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" inputMode="numeric" value={v.foodLogF} onChange={v.setFoodLogF} placeholder="F" base="width:52px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-vi);font-size:12.5px;font-family:var(--nv-font-mono);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="input" type="number" inputMode="numeric" value={v.foodLogKcal} onChange={v.setFoodLogKcal} placeholder="kcal" base="width:62px;box-sizing:border-box;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:8px 8px;color:var(--nv-good);font-size:12.5px;font-family:var(--nv-font-mono);outline:none" focusStyle="border-color:color-mix(in srgb, var(--nv-good) 50%, transparent)" />
            <Interactive as="span" onClick={v.foodLogBusy ? undefined : v.submitFoodLog} base={{ cursor: 'pointer', flex: 'none', font: "500 11px var(--nv-font-mono)", padding: '9px 16px', borderRadius: '8px', background: 'var(--nv-good)', color: '#122015', opacity: v.foodLogBusy ? .6 : 1 }} hoverStyle={{ background: 'color-mix(in srgb, var(--nv-good) 80%, white)' }}>{v.foodLogBusy ? 'Adding…' : '+ Add'}</Interactive>
          </div>}
          {v.canSaveScanToRecipe && (
            <div style={css("margin-top:8px")}>
              <Interactive as="span" onClick={v.saveScanToRecipe} base="cursor:pointer;font-size:11px;color:var(--nv-gold)" hoverStyle="text-decoration:underline">＋ Save this to my recipe bank</Interactive>
            </div>
          )}
          {v.foodLogError && <div style={css("margin-top:8px;font-size:12px;color:#e08f6f")}>{v.foodLogError}</div>}
          {v.foodLogEntries.length > 0 && (
            <div style={css("margin-top:12px;display:flex;flex-direction:column;gap:6px")}>
              {v.foodLogEntries.map((e) => (
                <div key={e.id} style={css("display:flex;align-items:center;gap:10px;font-size:12.5px;padding:6px 0;border-top:1px solid color-mix(in srgb, var(--nv-ink) 06%, transparent)")}>
                  <span style={css("font:400 10.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 40%, transparent);width:40px;flex:none")}>{e.time}</span>
                  <span style={css("flex:1")}>{e.name}</span>
                  <span style={css("font:400 10.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 50%, transparent);flex:none")}>{e.p}P · {e.c}C · {e.f}F · {e.kcal}kcal</span>
                  <Interactive as="span" onClick={e.remove} base="cursor:pointer;flex:none;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 35%, transparent)" hoverStyle="color:var(--nv-warn)">×</Interactive>
                </div>
              ))}
            </div>
          )}
          <div style={css("margin-top:14px;border-top:1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent);padding-top:10px")}>
            <Interactive as="span" onClick={v.toggleFoodHistory} base="cursor:pointer;font:500 9.5px var(--nv-font-mono);letter-spacing:.18em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)" hoverStyle="color:var(--nv-good)">{v.foodHistoryOpen ? '▾' : '▸'} RECENT FOODS</Interactive>
            {v.foodHistoryOpen && (
              <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:5px")}>
                {!v.foodHistoryLoaded && <div style={css("font-size:12px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)")}>Loading…</div>}
                {v.foodHistoryLoaded && v.foodHistory.length === 0 && <div style={css("font-size:12px;color:color-mix(in srgb, var(--nv-ink) 40%, transparent);line-height:1.5")}>Nothing off-plan yet. Scanned and quick-added foods collect here so you can re-log them in a tap.</div>}
                {v.foodHistory.map((it) => (
                  <div key={it.key} style={css("display:flex;align-items:center;gap:9px;font-size:12.5px;padding:4px 0")}>
                    <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{it.name}{it.seen && <span style={css("margin-left:6px;font:400 9.5px var(--nv-font-mono);color:var(--nv-gold)")}>{it.seen}</span>}</span>
                    <span style={css("font:400 9.5px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 42%, transparent);flex:none")}>{it.macroLabel}</span>
                    <Interactive as="span" onClick={it.relog} base="cursor:pointer;flex:none;font:500 10px var(--nv-font-mono);padding:4px 9px;border-radius:7px;border:1px solid color-mix(in srgb, var(--nv-good) 30%, transparent);color:var(--nv-good)" hoverStyle="background:color-mix(in srgb, var(--nv-good) 14%, transparent)">＋ log</Interactive>
                    <Interactive as="span" onClick={it.toRecipe} aria-label="Save to recipe bank" base="cursor:pointer;flex:none;font-size:15px;line-height:1;color:color-mix(in srgb, var(--nv-ink) 38%, transparent)" hoverStyle="color:var(--nv-gold)">☆</Interactive>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={css("display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;justify-content:space-between;align-items:center")}>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px;align-items:center")}>
          {v.recipeFilters.map((f) => (
            <Interactive key={f.label} as="span" onClick={f.go} base={f.style} hoverStyle="border:1px solid color-mix(in srgb, var(--nv-gold) 50%, transparent)">{f.label}</Interactive>
          ))}
          {/* local echo, filter-only (no submit): typing no longer
              re-renders the whole app per character; the 150ms debounce
              drives the actual filtering. */}
          <LocalInput value={v.recipeSearch} onChange={(t) => v.setRecipeSearch(t)} submitOnEnter={false} placeholder="Search recipes or ingredients…"
            style={css("width:190px;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:8px;padding:7px 11px;color:var(--nv-ink);font:400 12px var(--nv-font-ui);outline:none")} />
          {v.recipeFitsAvailable && (
            <Interactive as="span" onClick={v.toggleRecipeFits}
              base={`cursor:pointer;font:500 9px var(--nv-font-mono);letter-spacing:.1em;padding:6px 11px;border-radius:8px;border:1px solid ${v.recipeFitsOn ? 'var(--nv-acc-border)' : 'color-mix(in srgb, var(--nv-good) 30%, transparent)'};color:${v.recipeFitsOn ? 'var(--nv-acc)' : 'var(--nv-good)'};background:${v.recipeFitsOn ? 'var(--nv-acc-bg)' : 'transparent'}`}
              hoverStyle="background:color-mix(in srgb, var(--nv-good) 10%, transparent)"
            >{v.recipeFitsLabel}</Interactive>
          )}
        </div>
        {v.recipeAddVisible && (
          <Interactive as="span" onClick={v.openAddRecipe} base="cursor:pointer;font:500 10.5px var(--nv-font-mono);padding:8px 14px;border-radius:8px;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)" hoverStyle="background:color-mix(in srgb, var(--nv-gold) 14%, transparent)">+ Add recipe</Interactive>
        )}
      </div>
      {/* NO SKELETON HERE, deliberately. The recipe grid falls back to the
          demo bank whenever `liveRecipes` is null, so it is never actually
          empty — a skeleton would stack ON TOP of visible cards rather than
          fill a void (caught in verification, 23 Aug). A skeleton must only
          ever occupy space that is genuinely blank; the Inbox qualifies,
          this grid does not. */}
      <div style={v.gridRecipes}>
        {v.recipeList.map((r) => (
          <Interactive
            key={r.name}
            onClick={r.open}
            style={r.vtName ? { viewTransitionName: r.vtName } : undefined}
            base="cursor:pointer;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);overflow:hidden;background:var(--nv-glass);box-shadow:inset 0 1px 0 var(--nv-spec),0 14px 34px -20px rgba(0,0,0,.9)"
            hoverStyle="border-color:color-mix(in srgb, var(--nv-gold) 40%, transparent);transform:translateY(-2px)"
          >
            {r.photoUrl ? (
              <div style={css("height:104px;overflow:hidden")}><img src={r.photoUrl} alt={r.name} style={css("width:100%;height:100%;object-fit:cover;display:block")} /></div>
            ) : (
              <div style={r.phStyle}><span style={css("font:400 10px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>{r.phLabel}</span></div>
            )}
            <div style={css("padding:14px 17px")}>
              <div style={css("display:flex;justify-content:space-between;align-items:baseline")}>
                <div style={css("font-size:15.5px;font-weight:500")}>{r.name}</div>
                <span style={css("font:400 9.5px var(--nv-font-mono);color:var(--nv-gold)")}>{r.tag}</span>
              </div>
              <div style={css("margin-top:7px;display:flex;gap:12px;font:400 11px var(--nv-font-mono);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)")}>
                <span style={css("color:var(--nv-cy)")}>{r.p}P</span><span>{r.c}C</span><span>{r.f}F</span><span style={css("margin-left:auto")}><span style={css("color:var(--nv-good)")}>{r.kcal} kcal</span>{r.time ? ` · ${r.time}` : ''}</span>
              </div>
              <div style={css("margin-top:10px;display:flex;gap:3px;height:4px")}>
                <span style={r.pBar}></span><span style={r.cBar}></span><span style={r.fBar}></span>
              </div>
              {r.slotToggles && r.slotToggles.length > 0 && (
                <div style={css("margin-top:10px;display:flex;gap:5px")} onClick={(e) => e.stopPropagation()}>
                  {r.slotToggles.map((s) => (
                    <Interactive
                      key={s.key}
                      as="span"
                      onClick={s.onClick}
                      base={{
                        cursor: 'pointer', flex: '1', textAlign: 'center', font: "500 9.5px var(--nv-font-mono)", padding: '4px 0', borderRadius: '5px',
                        border: `1px solid rgba(${s.hue},${s.active ? '.6' : '.14'})`,
                        color: s.active ? `rgb(${s.hue})` : 'color-mix(in srgb, var(--nv-ink) 40%, transparent)',
                        background: s.active ? `rgba(${s.hue},.14)` : 'transparent',
                      }}
                      hoverStyle={{ borderColor: `rgba(${s.hue},.6)` }}
                    >
                      {s.label}
                    </Interactive>
                  ))}
                </div>
              )}
            </div>
          </Interactive>
        ))}
      </div>
    </div>
  );
}
